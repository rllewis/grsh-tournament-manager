<?php
/**
 * GRSH_Player_Removal — admin-only "Remove player" for this season.
 *
 * Built for clearing test or mistaken records without leaving the database in a half-deleted state.
 *  - Impact first: the page asks what removal would touch, then the admin types DELETE.
 *  - Removes this season's registration, availability, sub requests and roster rows for the player.
 *  - The player record itself goes only when nothing else uses it (other seasons, history,
 *    activations, captain link). Otherwise it is kept so history and logs still show a name.
 *  - Blocked when the person captains a team or sits on a published roster.
 *  - One transaction; any database error rolls everything back.
 *  - A full copy is saved in the audit log so "Undo" restores the same ids.
 *  - The WPForms entry id is remembered (same tombstone the sub-pool removal uses), so a bulk
 *    re-import cannot bring the person back. A brand new form entry still can, on purpose.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

class GRSH_Player_Removal {

    const TOMBSTONE = 'alternate_removed_tombstone';   // read by GRSH_Sync_Engine::entry_already_imported()
    const REMOVED   = 'player_removed';
    const RESTORED  = 'player_restored';

    public static function register_hooks(): void {
        add_action( 'rest_api_init', [ __CLASS__, 'register_routes' ] );
    }

    public static function check_admin(): bool { return current_user_can( 'manage_options' ); }

    public static function register_routes(): void {
        register_rest_route( 'grsh/v1', '/players/removed', [
            'methods' => 'GET', 'callback' => [ __CLASS__, 'list_removed' ], 'permission_callback' => [ __CLASS__, 'check_admin' ],
        ] );
        register_rest_route( 'grsh/v1', '/players/removed/(?P<log_id>\d+)/restore', [
            'methods' => 'POST', 'callback' => [ __CLASS__, 'restore_player' ], 'permission_callback' => [ __CLASS__, 'check_admin' ],
        ] );
        register_rest_route( 'grsh/v1', '/players/(?P<id>\d+)/removal-impact', [
            'methods' => 'GET', 'callback' => [ __CLASS__, 'removal_impact' ], 'permission_callback' => [ __CLASS__, 'check_admin' ],
        ] );
        register_rest_route( 'grsh/v1', '/players/(?P<id>\d+)/remove', [
            'methods' => 'POST', 'callback' => [ __CLASS__, 'remove_player' ], 'permission_callback' => [ __CLASS__, 'check_admin' ],
        ] );
    }

    private static function t( string $name ): string { global $wpdb; return $wpdb->prefix . $name; }

    private static function table_exists( string $table ): bool {
        global $wpdb;
        return $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ) === $table;
    }

    private static function season_id(): int {
        global $wpdb;
        $id = (int) $wpdb->get_var( $wpdb->prepare(
            'SELECT id FROM ' . self::t( 'grsh_seasons' ) . ' WHERE season_year = %d LIMIT 1', GRSH_Sync_Engine::SEASON ) );
        return $id ?: 1;
    }

    private static function is_published( string $division ): bool {
        if ( $division === '' ) { return false; }
        $meta = get_option( 'grsh_roster_meta_' . $division, [] );
        return is_array( $meta ) && ! empty( $meta['published_at'] );
    }

    /** What removing this player would touch. null = no such player. */
    public static function build_impact( int $player_id ): ?array {
        global $wpdb;
        $sid = self::season_id();
        $p = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . self::t( 'grsh_players' ) . ' WHERE id = %d', $player_id ), ARRAY_A );
        if ( ! $p ) { return null; }

        $reg = $wpdb->get_row( $wpdb->prepare(
            'SELECT * FROM ' . self::t( 'grsh_registrations' ) . ' WHERE player_id = %d AND season_id = %d LIMIT 1', $player_id, $sid ), ARRAY_A );
        $rosters = $wpdb->get_results( $wpdb->prepare(
            'SELECT r.id, t.name AS team, t.division FROM ' . self::t( 'grsh_rosters' ) . ' r
               LEFT JOIN ' . self::t( 'grsh_teams' ) . ' t ON t.id = r.team_id
              WHERE r.player_id = %d AND r.season_id = %d', $player_id, $sid ), ARRAY_A ) ?: [];

        $other_regs    = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM ' . self::t( 'grsh_registrations' ) . ' WHERE player_id = %d AND season_id <> %d', $player_id, $sid ) );
        $other_rosters = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM ' . self::t( 'grsh_rosters' ) . ' WHERE player_id = %d AND season_id <> %d', $player_id, $sid ) );
        $history       = self::table_exists( self::t( 'grsh_player_history' ) )
            ? (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM ' . self::t( 'grsh_player_history' ) . ' WHERE player_id = %d', $player_id ) ) : 0;
        $acts          = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM ' . self::t( 'grsh_audit_logs' ) . " WHERE wp_user_id = %d AND action = 'alternate_activated'", $player_id ) );
        $captain       = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM ' . self::t( 'grsh_teams' ) . ' WHERE captain_player_id = %d', $player_id ) );
        $req_this = 0;
        $qt = self::t( 'grsh_sub_requests' );
        if ( self::table_exists( $qt ) ) {
            $req_this = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$qt} WHERE player_id = %d AND season_id = %d", $player_id, $sid ) );
        }

        $keep = [];
        if ( $other_regs )    { $keep[] = 'has ' . $other_regs . ' registration(s) in other seasons'; }
        if ( $other_rosters ) { $keep[] = 'was on a roster in another season'; }
        if ( $history )       { $keep[] = 'has player history'; }
        if ( $acts )          { $keep[] = 'was activated as a sub ' . $acts . ' time(s), which the Activation log still lists'; }

        $blockers = [];
        if ( $captain ) { $blockers[] = 'Captain of ' . $captain . ' team(s). Change the captain first.'; }
        foreach ( $rosters as $r ) {
            if ( self::is_published( (string) ( $r['division'] ?? '' ) ) ) {
                $blockers[] = 'On the published roster of ' . ( $r['team'] ?: 'a team' ) . ' (' . $r['division'] . '). Unpublish that division first.';
            }
        }

        $warnings = [];
        if ( $reg && ( $reg['payment_status'] ?? '' ) === 'paid' ) { $warnings[] = 'Marked as paid. Removing the registration does not refund anything.'; }

        return [
            'player_id'        => $player_id,
            'name'             => trim( ( $p['first_name'] ?? '' ) . ' ' . ( $p['last_name'] ?? '' ) ),
            'email'            => $p['email'] ?? '',
            'has_registration' => (bool) $reg,
            'division'         => $reg['division_requested'] ?? '',
            'payment_status'   => $reg['payment_status'] ?? '',
            'roster_spots'     => array_map( fn( $r ) => ( $r['team'] ?: 'a team' ) . ( $r['division'] ? ' (' . $r['division'] . ')' : '' ), $rosters ),
            'sub_requests'     => $req_this,
            'delete_player'    => ! $keep,
            'keep_reasons'     => $keep,
            'blockers'         => $blockers,
            'warnings'         => $warnings,
            'wpforms_entry_id' => $reg && ! empty( $reg['wpforms_entry_id'] ) ? (int) $reg['wpforms_entry_id'] : null,
            'can_remove'       => ! $blockers && ( $reg || $rosters ),
        ];
    }

    public static function removal_impact( WP_REST_Request $request ): WP_REST_Response {
        $impact = self::build_impact( (int) $request->get_param( 'id' ) );
        if ( ! $impact ) { return new WP_REST_Response( [ 'error' => 'That player no longer exists.' ], 404 ); }
        return new WP_REST_Response( $impact, 200 );
    }

    public static function remove_player( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $pid  = (int) $request->get_param( 'id' );
        $body = $request->get_json_params() ?: [];
        $sid  = self::season_id();

        if ( ( $body['confirm'] ?? '' ) !== 'DELETE' ) {
            return new WP_REST_Response( [ 'removed' => false, 'error' => 'Type DELETE to confirm. Nothing was removed.' ], 400 );
        }
        $impact = self::build_impact( $pid );
        if ( ! $impact ) { return new WP_REST_Response( [ 'removed' => false, 'error' => 'That player no longer exists.' ], 404 ); }
        if ( $impact['blockers'] ) {
            return new WP_REST_Response( [ 'removed' => false, 'error' => implode( ' ', $impact['blockers'] ), 'blockers' => $impact['blockers'] ], 409 );
        }
        if ( ! $impact['can_remove'] ) {
            return new WP_REST_Response( [ 'removed' => false, 'error' => 'This player has no 2027 registration to remove.' ], 409 );
        }

        $pt = self::t( 'grsh_players' ); $rt = self::t( 'grsh_registrations' ); $at = self::t( 'grsh_availability' );
        $qt = self::t( 'grsh_sub_requests' ); $ro = self::t( 'grsh_rosters' );
        $snap = [
            'player'       => $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$pt} WHERE id = %d", $pid ), ARRAY_A ),
            'registration' => $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$rt} WHERE player_id = %d AND season_id = %d", $pid, $sid ), ARRAY_A ),
            'availability' => $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$at} WHERE player_id = %d AND season_id = %d", $pid, $sid ), ARRAY_A ) ?: [],
            'rosters'      => $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$ro} WHERE player_id = %d AND season_id = %d", $pid, $sid ), ARRAY_A ) ?: [],
            'requests'     => self::table_exists( $qt )
                ? ( $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$qt} WHERE player_id = %d AND season_id = %d", $pid, $sid ), ARRAY_A ) ?: [] ) : [],
        ];

        $wpdb->suppress_errors( true );
        $wpdb->query( 'START TRANSACTION' );
        $failed = '';
        $step = function ( $ok ) use ( $wpdb, &$failed ) { if ( $ok === false && ! $failed ) { $failed = $wpdb->last_error ?: 'database error'; } };

        $step( $wpdb->delete( $ro, [ 'player_id' => $pid, 'season_id' => $sid ] ) );
        if ( self::table_exists( $qt ) ) { $step( $wpdb->delete( $qt, [ 'player_id' => $pid, 'season_id' => $sid ] ) ); }
        $step( $wpdb->delete( $at, [ 'player_id' => $pid, 'season_id' => $sid ] ) );
        if ( $snap['registration'] ) { $step( $wpdb->delete( $rt, [ 'id' => (int) $snap['registration']['id'] ] ) ); }
        if ( $impact['delete_player'] ) { $step( $wpdb->delete( $pt, [ 'id' => $pid ] ) ); }

        if ( $failed ) {
            $wpdb->query( 'ROLLBACK' );
            $wpdb->suppress_errors( false );
            return new WP_REST_Response( [ 'removed' => false, 'error' => 'Removal failed and was rolled back; nothing changed. (' . $failed . ')' ], 500 );
        }
        $wpdb->query( 'COMMIT' );
        $wpdb->suppress_errors( false );

        $user = wp_get_current_user();
        $wpdb->insert( self::t( 'grsh_audit_logs' ), [
            'season_id' => $sid, 'wp_user_id' => get_current_user_id() ?: 0,
            'user_display' => $user && $user->exists() ? $user->display_name : 'Admin',
            'action' => self::REMOVED, 'object_type' => 'player', 'object_id' => $pid,
            'before_value' => wp_json_encode( $snap ),
            'after_value'  => wp_json_encode( [ 'name' => $impact['name'], 'player_deleted' => $impact['delete_player'], 'wpforms_entry_id' => $impact['wpforms_entry_id'],
                                                'roster_spots' => $impact['roster_spots'] ] ),
            'notes' => 'Removed ' . $impact['name'] . ' from 2027.',
        ] );
        $log_id = (int) $wpdb->insert_id;

        if ( $impact['wpforms_entry_id'] ) {
            $wpdb->insert( self::t( 'grsh_audit_logs' ), [
                'season_id' => $sid, 'wp_user_id' => get_current_user_id() ?: 0, 'action' => self::TOMBSTONE,
                'object_type' => 'wpforms_entry', 'object_id' => $impact['wpforms_entry_id'],
                'notes' => 'Entry ' . $impact['wpforms_entry_id'] . ' was removed with a player; import skips it. Linked to log #' . $log_id . '.',
            ] );
        }
        return new WP_REST_Response( [ 'removed' => true, 'log_id' => $log_id, 'player_id' => $pid,
                                       'player_deleted' => $impact['delete_player'], 'name' => $impact['name'] ], 200 );
    }

    public static function list_removed( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $al = self::t( 'grsh_audit_logs' );
        $rows = $wpdb->get_results(
            "SELECT id, user_display, created_at, after_value, object_id FROM {$al}
              WHERE action = '" . self::REMOVED . "'
                AND id NOT IN ( SELECT object_id FROM {$al} WHERE action = '" . self::RESTORED . "' )
              ORDER BY id DESC LIMIT 25", ARRAY_A ) ?: [];
        return new WP_REST_Response( array_map( function ( $r ) {
            $a = json_decode( (string) $r['after_value'], true ) ?: [];
            return [ 'log_id' => (int) $r['id'], 'player_id' => (int) $r['object_id'], 'name' => $a['name'] ?? 'Unknown',
                     'removed_by' => $r['user_display'], 'removed_at' => $r['created_at'], 'player_deleted' => ! empty( $a['player_deleted'] ) ];
        }, $rows ), 200 );
    }

    public static function restore_player( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $log_id = (int) $request->get_param( 'log_id' );
        $al = self::t( 'grsh_audit_logs' );
        $log = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$al} WHERE id = %d AND action = %s", $log_id, self::REMOVED ), ARRAY_A );
        if ( ! $log ) { return new WP_REST_Response( [ 'restored' => false, 'error' => 'That removal record was not found.' ], 404 ); }
        if ( $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$al} WHERE action = %s AND object_id = %d LIMIT 1", self::RESTORED, $log_id ) ) ) {
            return new WP_REST_Response( [ 'restored' => false, 'error' => 'Already restored.' ], 409 );
        }
        $snap = json_decode( (string) $log['before_value'], true );
        if ( ! is_array( $snap ) || empty( $snap['player']['id'] ) ) {
            return new WP_REST_Response( [ 'restored' => false, 'error' => 'The saved copy is unreadable, so this cannot be restored.' ], 500 );
        }

        $pt = self::t( 'grsh_players' ); $rt = self::t( 'grsh_registrations' ); $at = self::t( 'grsh_availability' );
        $qt = self::t( 'grsh_sub_requests' ); $ro = self::t( 'grsh_rosters' );
        $pid = (int) $snap['player']['id'];

        $existing = $wpdb->get_row( $wpdb->prepare( "SELECT id FROM {$pt} WHERE id = %d", $pid ), ARRAY_A );
        if ( ! $existing ) {
            $clash = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$pt} WHERE email = %s LIMIT 1", $snap['player']['email'] ) );
            if ( $clash ) { return new WP_REST_Response( [ 'restored' => false, 'error' => 'Someone with the same e-mail address now exists (player #' . (int) $clash . '). Resolve that first.' ], 409 ); }
        }
        if ( ! empty( $snap['registration'] ) ) {
            $dupe = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$rt} WHERE player_id = %d AND season_id = %d LIMIT 1", $pid, (int) $snap['registration']['season_id'] ) );
            if ( $dupe ) { return new WP_REST_Response( [ 'restored' => false, 'error' => 'This player has registered again since. Nothing to restore.' ], 409 ); }
        }
        foreach ( (array) ( $snap['rosters'] ?? [] ) as $row ) {
            $team = $wpdb->get_var( $wpdb->prepare( 'SELECT id FROM ' . self::t( 'grsh_teams' ) . ' WHERE id = %d', (int) $row['team_id'] ) );
            if ( ! $team ) { return new WP_REST_Response( [ 'restored' => false, 'error' => 'The team this player was on no longer exists, so the roster spot cannot be put back.' ], 409 ); }
        }

        $wpdb->suppress_errors( true );
        $wpdb->query( 'START TRANSACTION' );
        $failed = '';
        $step = function ( $ok ) use ( $wpdb, &$failed ) { if ( $ok === false && ! $failed ) { $failed = $wpdb->last_error ?: 'database error'; } };
        if ( ! $existing ) { $step( $wpdb->insert( $pt, $snap['player'] ) ); }
        if ( ! empty( $snap['registration'] ) ) { $step( $wpdb->insert( $rt, $snap['registration'] ) ); }
        foreach ( (array) ( $snap['availability'] ?? [] ) as $row ) { $step( $wpdb->insert( $at, $row ) ); }
        foreach ( (array) ( $snap['rosters'] ?? [] ) as $row )      { $step( $wpdb->insert( $ro, $row ) ); }
        if ( self::table_exists( $qt ) ) { foreach ( (array) ( $snap['requests'] ?? [] ) as $row ) { $step( $wpdb->insert( $qt, $row ) ); } }
        if ( $failed ) {
            $wpdb->query( 'ROLLBACK' );
            $wpdb->suppress_errors( false );
            return new WP_REST_Response( [ 'restored' => false, 'error' => 'Restore failed and was rolled back; nothing changed. (' . $failed . ')' ], 500 );
        }
        $wpdb->query( 'COMMIT' );
        $wpdb->suppress_errors( false );

        $after = json_decode( (string) $log['after_value'], true ) ?: [];
        if ( ! empty( $after['wpforms_entry_id'] ) ) {
            $wpdb->delete( $al, [ 'action' => self::TOMBSTONE, 'object_id' => (int) $after['wpforms_entry_id'] ] );
        }
        $user = wp_get_current_user();
        $wpdb->insert( $al, [
            'season_id' => self::season_id(), 'wp_user_id' => get_current_user_id() ?: 0,
            'user_display' => $user && $user->exists() ? $user->display_name : 'Admin',
            'action' => self::RESTORED, 'object_type' => 'player', 'object_id' => $log_id,
            'notes' => 'Restored ' . ( $after['name'] ?? 'player' ) . ' (undo of log #' . $log_id . ').',
        ] );
        return new WP_REST_Response( [ 'restored' => true, 'player_id' => $pid, 'name' => $after['name'] ?? '' ], 200 );
    }
}
