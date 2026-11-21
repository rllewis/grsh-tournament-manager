<?php
/**
 * GRSH Alternates — REST API endpoints.
 *
 * GET   /wp-json/grsh/v1/alternates                → list all subs/alternates
 * PATCH /wp-json/grsh/v1/alternates/{id}/activate  → log an activation
 * GET   /wp-json/grsh/v1/alternates/{id}/removal-impact → dry run: what removing this sub would touch
 * DELETE /wp-json/grsh/v1/alternates/{id}          → remove from the sub pool (admin only, typed DELETE, undoable)
 * GET   /wp-json/grsh/v1/alternates/removed        → recently removed (for Restore)
 * POST  /wp-json/grsh/v1/alternates/removed/{log_id}/restore → put one back
 *
 * FIXES (v3):
 *  1. Duplicate guard  — 409 if same player/team/division/game_date already in log
 *  2. Sanitized inputs — all body params cleaned before DB use
 *  3. Returns log_id   — real DB insert_id sent back so React uses server id
 *  4. game_date field  — body key corrected from 'date' → 'game_date'
 *  5. Column names     — corrected to match actual wp_grsh_audit_logs schema:
 *                        'player_id' → 'wp_user_id', added 'object_type'/'object_id'
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

class GRSH_Alternates {

    public static function register_hooks(): void {
        add_action( 'rest_api_init', [ __CLASS__, 'register_routes' ] );
    }

    public static function register_routes(): void {
        $ns = 'grsh/v1';

        register_rest_route( $ns, '/alternates', [
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => [ __CLASS__, 'get_alternates' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        register_rest_route( $ns, '/alternates/(?P<id>\d+)/activate', [
            'methods'             => 'PATCH',
            'callback'            => [ __CLASS__, 'activate_alternate' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        register_rest_route( $ns, '/alternates/(?P<id>\d+)/removal-impact', [
            'methods' => 'GET', 'callback' => [ __CLASS__, 'removal_impact' ], 'permission_callback' => [ __CLASS__, 'check_admin' ],
        ] );
        register_rest_route( $ns, '/alternates/(?P<id>\d+)', [
            'methods' => 'DELETE', 'callback' => [ __CLASS__, 'remove_alternate' ], 'permission_callback' => [ __CLASS__, 'check_admin' ],
        ] );
        register_rest_route( $ns, '/alternates/removed', [
            'methods' => 'GET', 'callback' => [ __CLASS__, 'list_removed' ], 'permission_callback' => [ __CLASS__, 'check_admin' ],
        ] );
        register_rest_route( $ns, '/alternates/removed/(?P<log_id>\d+)/restore', [
            'methods' => 'POST', 'callback' => [ __CLASS__, 'restore_alternate' ], 'permission_callback' => [ __CLASS__, 'check_admin' ],
        ] );
    }

    /** Removing people is admin-only; committee members can still activate and ask subs. */
    public static function check_admin(): bool {
        return current_user_can( 'manage_options' );
    }

    public static function check_permission(): bool {
        return current_user_can( 'manage_options' ) || current_user_can( 'grsh_committee' );
    }

    // -------------------------------------------------------------------------
    // GET /alternates
    // -------------------------------------------------------------------------
    public static function get_alternates( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $season_id = self::get_season_id();

        $rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT
                p.id, p.first_name, p.last_name, p.email, p.phone,
                p.position, p.skill_tier_reported, p.skill_tier_assigned,
                p.jersey_size, p.notes, p.sandbagging_flag, p.years_experience, p.is_goalie,
                r.id AS registration_id, r.age, r.payment_status,
                r.player_type, r.division_requested, r.status,
                a.available_days, a.max_games_per_day, a.late_game_available,
                a.division_eligibility, a.times_activated, a.last_activated_at
             FROM {$wpdb->prefix}grsh_players p
             JOIN {$wpdb->prefix}grsh_registrations r
                  ON r.player_id = p.id AND r.season_id = %d
             LEFT JOIN {$wpdb->prefix}grsh_availability a
                  ON a.player_id = p.id AND a.season_id = %d
             WHERE ( r.player_type = 'sub' OR p.is_alternate = 1 )
             ORDER BY a.times_activated DESC, p.last_name ASC",
            $season_id, $season_id
        ), ARRAY_A ) ?: [];

        // Reliability inputs: attendance from history, response rate from sub requests.
        $att = [];
        foreach ( $wpdb->get_results(
            "SELECT player_id, SUM(games_attended) AS att, SUM(games_scheduled) AS sched
               FROM {$wpdb->prefix}grsh_player_history GROUP BY player_id", ARRAY_A ) ?: [] as $a ) {
            $att[ (int) $a['player_id'] ] = [ (int) $a['att'], (int) $a['sched'] ];
        }
        $resp = [];
        $req_table = $wpdb->prefix . 'grsh_sub_requests';
        if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $req_table ) ) === $req_table ) {
            foreach ( $wpdb->get_results( $wpdb->prepare(
                "SELECT player_id, COUNT(*) AS asked,
                        SUM(status IN ('yes','no')) AS answered, SUM(status='yes') AS yes
                   FROM {$req_table} WHERE season_id = %d GROUP BY player_id", $season_id ), ARRAY_A ) ?: [] as $q ) {
                $resp[ (int) $q['player_id'] ] = [ (int) $q['asked'], (int) $q['answered'], (int) $q['yes'] ];
            }
        }

        $alternates = array_map( function( $row ) use ( $att, $resp ) {
            $avail_days = $row['available_days']
                ? ( json_decode( $row['available_days'], true ) ?: [] ) : [];
            $div_elig   = $row['division_eligibility']
                ? ( json_decode( $row['division_eligibility'], true ) ?: [] ) : [];

            // Repair names saved as "First Last" in both columns by the older sync mapper.
            $first = trim( (string) $row['first_name'] );
            $last  = trim( (string) $row['last_name'] );
            if ( $first !== '' && $first === $last && str_contains( $first, ' ' ) ) {
                $parts = explode( ' ', $first, 2 );
                $first = $parts[0];
                $last  = $parts[1];
            }

            return [
                'id'                   => (int) $row['id'],
                'first_name'           => $first,
                'last_name'            => $last,
                'email'                => $row['email'],
                'phone'                => $row['phone'] ?? '',
                'position'             => $row['position']             ?: null,
                'skill_tier_reported'  => $row['skill_tier_reported']  ?? '',
                'skill_tier_assigned'  => $row['skill_tier_assigned']  ?: null,
                'jersey_size'          => $row['jersey_size']          ?? '',
                'notes'                => $row['notes']                ?? '',
                'sandbagging_flag'     => (bool) $row['sandbagging_flag'],
                'age'                  => $row['age'] ? (int) $row['age'] : null,
                'payment_status'       => $row['payment_status']       ?? 'waived',
                'player_type'          => $row['player_type']          ?? 'sub',
                'division_requested'   => $row['division_requested']   ?? '',
                'status'               => $row['status']               ?? 'approved',
                'is_alternate'         => true,
                'available_days'       => $avail_days,
                'max_games_per_day'    => $row['max_games_per_day'] ? (int) $row['max_games_per_day'] : 1,
                'late_game_available'  => (bool) ( $row['late_game_available'] ?? false ),
                'division_eligibility' => $div_elig,
                'times_activated'      => (int) ( $row['times_activated'] ?? 0 ),
                'last_activated_at'    => $row['last_activated_at'] ?: null,
                'registration_id'      => (int) $row['registration_id'],
                'years_experience'     => $row['years_experience'] !== null ? (int) $row['years_experience'] : null,
                'is_goalie'            => ( $row['position'] === 'goaltender' || (int) $row['is_goalie'] === 1 ),
                'games_attended'       => $att[ (int) $row['id'] ][0] ?? null,
                'games_scheduled'      => $att[ (int) $row['id'] ][1] ?? null,
                'requests_sent'        => $resp[ (int) $row['id'] ][0] ?? 0,
                'requests_answered'    => $resp[ (int) $row['id'] ][1] ?? 0,
                'requests_yes'         => $resp[ (int) $row['id'] ][2] ?? 0,
            ];
        }, $rows );

        return new WP_REST_Response( $alternates, 200 );
    }

    // -------------------------------------------------------------------------
    // PATCH /alternates/{id}/activate
    // -------------------------------------------------------------------------
    public static function activate_alternate( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;

        $player_id = (int) $request->get_param( 'id' );
        $body      = $request->get_json_params();
        $season_id = self::get_season_id();

        // ── Sanitize all inputs ───────────────────────────────────────────────
        $team      = sanitize_text_field( $body['team']      ?? '' );
        $division  = sanitize_key(        $body['division']  ?? '' );
        $game_date = sanitize_text_field( $body['game_date'] ?? '' );
        $reason    = sanitize_text_field( $body['reason']    ?? '' );
        $notes     = sanitize_text_field( $body['notes']     ?? '' );

        // ── Require minimum fields ────────────────────────────────────────────
        if ( ! $player_id || ! $team || ! $division || ! $game_date ) {
            return new WP_REST_Response(
                [ 'activated' => false, 'error' => 'Missing required fields: team, division, game_date' ],
                400
            );
        }

        $user = wp_get_current_user();
        $res  = self::record_activation( $player_id, $team, $division, $game_date, $reason, $notes,
                    $user && $user->exists() ? $user->display_name : 'Committee' );

        if ( ! empty( $res['duplicate'] ) ) {
            return new WP_REST_Response( [
                'activated' => false, 'duplicate' => true, 'log_id' => $res['log_id'],
                'message'   => 'Activation already recorded for this player, team, division, and date.',
            ], 409 );
        }
        if ( empty( $res['ok'] ) ) {
            return new WP_REST_Response( [ 'activated' => false, 'error' => 'Database insert failed.' ], 500 );
        }
        return new WP_REST_Response( [ 'activated' => true, 'log_id' => $res['log_id'], 'player_id' => $player_id ], 200 );
    }

    /**
     * Shared by the manual activate button and the email-reply flow.
     * Returns [ ok, duplicate, log_id ].
     */
    public static function record_activation( int $player_id, string $team, string $division, string $game_date,
                                              string $reason, string $notes, string $by ): array {
        global $wpdb;
        $season_id = self::get_season_id();

        $existing_id = $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}grsh_audit_logs
              WHERE wp_user_id = %d AND season_id = %d AND action = 'alternate_activated'
                AND JSON_UNQUOTE( JSON_EXTRACT( after_value, '$.date' ) )     = %s
                AND JSON_UNQUOTE( JSON_EXTRACT( after_value, '$.division' ) ) = %s
                AND JSON_UNQUOTE( JSON_EXTRACT( after_value, '$.team' ) )     = %s
              LIMIT 1",
            $player_id, $season_id, $game_date, $division, $team
        ) );
        if ( $existing_id ) {
            return [ 'ok' => false, 'duplicate' => true, 'log_id' => (int) $existing_id ];
        }

        $inserted = $wpdb->insert( "{$wpdb->prefix}grsh_audit_logs", [
            'season_id'    => $season_id,
            'wp_user_id'   => $player_id,
            'action'       => 'alternate_activated',
            'object_type'  => 'registration',
            'object_id'    => $player_id,
            'notes'        => $notes,
            'user_display' => $by,
            'after_value'  => wp_json_encode( [ 'team' => $team, 'division' => $division, 'date' => $game_date, 'reason' => $reason ] ),
        ] );
        if ( ! $inserted ) {
            return [ 'ok' => false, 'duplicate' => false, 'log_id' => 0 ];
        }
        $log_id = (int) $wpdb->insert_id;

        $wpdb->query( $wpdb->prepare(
            "UPDATE {$wpdb->prefix}grsh_availability
                SET times_activated = times_activated + 1, last_activated_at = %s
              WHERE player_id = %d AND season_id = %d",
            current_time( 'mysql' ), $player_id, $season_id
        ) );

        return [ 'ok' => true, 'duplicate' => false, 'log_id' => $log_id ];
    }


    // =========================================================================
    // Remove from the sub pool
    //
    // What "delete" means here, on purpose:
    //  - This season's sub registration, availability and email requests go.
    //  - The player record itself goes only if nothing else points at it (other
    //    seasons, roster rows, history, activations, captain links). Otherwise
    //    it stays so history and the Activation log still show a name.
    //  - Someone on a team roster this season cannot be removed until they are
    //    taken off that roster (the rosters table forbids it, and silently
    //    dropping a rostered player would be worse).
    //  - A "primary" registrant who is merely flagged as an alternate keeps
    //    their registration; only the sub flag and availability are removed.
    //  - Everything removed is saved in the audit log so it can be restored,
    //    and the WPForms entry is remembered so a re-import cannot bring the
    //    person back (a brand new form entry still can, on purpose).
    // =========================================================================

    const TOMBSTONE = 'alternate_removed_tombstone';

    private static function t( string $name ): string {
        global $wpdb;
        return $wpdb->prefix . $name;
    }

    private static function table_exists( string $table ): bool {
        global $wpdb;
        return $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ) === $table;
    }

    /** Everything we need to know before touching a sub. null = no such player. */
    public static function build_impact( int $player_id ): ?array {
        global $wpdb;
        $season_id = self::get_season_id();

        $player = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . self::t( 'grsh_players' ) . ' WHERE id = %d', $player_id ), ARRAY_A );
        if ( ! $player ) { return null; }
        $reg = $wpdb->get_row( $wpdb->prepare(
            'SELECT * FROM ' . self::t( 'grsh_registrations' ) . ' WHERE player_id = %d AND season_id = %d LIMIT 1',
            $player_id, $season_id ), ARRAY_A );

        $rosters = $wpdb->get_results( $wpdb->prepare(
            'SELECT r.id, t.name AS team, t.division FROM ' . self::t( 'grsh_rosters' ) . ' r
               LEFT JOIN ' . self::t( 'grsh_teams' ) . ' t ON t.id = r.team_id
              WHERE r.player_id = %d AND r.season_id = %d', $player_id, $season_id ), ARRAY_A ) ?: [];

        $acts_this = (int) $wpdb->get_var( $wpdb->prepare(
            'SELECT COUNT(*) FROM ' . self::t( 'grsh_audit_logs' ) . " WHERE wp_user_id = %d AND season_id = %d AND action = 'alternate_activated'",
            $player_id, $season_id ) );
        $acts_all = (int) $wpdb->get_var( $wpdb->prepare(
            'SELECT COUNT(*) FROM ' . self::t( 'grsh_audit_logs' ) . " WHERE wp_user_id = %d AND action = 'alternate_activated'", $player_id ) );

        $req_total = 0; $req_pending = 0; $req_other = 0;
        $rt = self::t( 'grsh_sub_requests' );
        if ( self::table_exists( $rt ) ) {
            $req_total   = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$rt} WHERE player_id = %d AND season_id = %d", $player_id, $season_id ) );
            $req_pending = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$rt} WHERE player_id = %d AND season_id = %d AND status = 'pending'", $player_id, $season_id ) );
            $req_other   = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$rt} WHERE player_id = %d AND season_id <> %d", $player_id, $season_id ) );
        }

        $other_regs = (int) $wpdb->get_var( $wpdb->prepare(
            'SELECT COUNT(*) FROM ' . self::t( 'grsh_registrations' ) . ' WHERE player_id = %d AND season_id <> %d', $player_id, $season_id ) );
        $other_rosters = (int) $wpdb->get_var( $wpdb->prepare(
            'SELECT COUNT(*) FROM ' . self::t( 'grsh_rosters' ) . ' WHERE player_id = %d AND season_id <> %d', $player_id, $season_id ) );
        $history = self::table_exists( self::t( 'grsh_player_history' ) )
            ? (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM ' . self::t( 'grsh_player_history' ) . ' WHERE player_id = %d', $player_id ) ) : 0;
        $captain = (int) $wpdb->get_var( $wpdb->prepare(
            'SELECT COUNT(*) FROM ' . self::t( 'grsh_teams' ) . ' WHERE captain_player_id = %d', $player_id ) );

        $is_primary = $reg && ( $reg['player_type'] ?? 'sub' ) !== 'sub';
        $keep_reasons = [];
        if ( $is_primary )     { $keep_reasons[] = 'registered as a regular player this season'; }
        if ( $other_regs )     { $keep_reasons[] = 'has ' . $other_regs . ' registration(s) in other seasons'; }
        if ( $other_rosters )  { $keep_reasons[] = 'was on a roster in another season'; }
        if ( $history )        { $keep_reasons[] = 'has player history'; }
        if ( $acts_all )       { $keep_reasons[] = 'was activated ' . $acts_all . ' time(s), which the Activation log still lists'; }
        if ( $req_other )      { $keep_reasons[] = 'has e-mail requests from other seasons'; }
        if ( $captain )        { $keep_reasons[] = 'is a team captain'; }

        $blockers = [];
        foreach ( $rosters as $r ) {
            $blockers[] = 'On the roster of ' . ( $r['team'] ?: 'a team' ) . ( $r['division'] ? ' (' . $r['division'] . ')' : '' ) . '. Take them off the roster first.';
        }

        $warnings = [];
        if ( $reg && ( $reg['payment_status'] ?? '' ) === 'paid' ) { $warnings[] = 'Marked as paid. Removing the registration does not refund anything.'; }

        $name = trim( ( $player['first_name'] ?? '' ) . ' ' . ( $player['last_name'] ?? '' ) );
        return [
            'player_id'      => $player_id,
            'name'           => $name,
            'email'          => $player['email'] ?? '',
            'has_registration' => (bool) $reg,
            'mode'           => $is_primary ? 'unflag' : 'remove_registration',
            'delete_player'  => ! $keep_reasons,
            'keep_reasons'   => $keep_reasons,
            'blockers'       => $blockers,
            'warnings'       => $warnings,
            'activations_this_season' => $acts_this,
            'requests_total' => $req_total,
            'requests_pending' => $req_pending,
            'wpforms_entry_id' => $reg && $reg['wpforms_entry_id'] ? (int) $reg['wpforms_entry_id'] : null,
            'can_remove'     => ! $blockers,
        ];
    }

    public static function removal_impact( WP_REST_Request $request ): WP_REST_Response {
        $impact = self::build_impact( (int) $request->get_param( 'id' ) );
        if ( ! $impact ) { return new WP_REST_Response( [ 'error' => 'That player no longer exists.' ], 404 ); }
        return new WP_REST_Response( $impact, 200 );
    }

    public static function remove_alternate( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $player_id = (int) $request->get_param( 'id' );
        $body      = $request->get_json_params() ?: [];
        $season_id = self::get_season_id();

        if ( ( $body['confirm'] ?? '' ) !== 'DELETE' ) {
            return new WP_REST_Response( [ 'removed' => false, 'error' => 'Type DELETE to confirm. Nothing was removed.' ], 400 );
        }
        $impact = self::build_impact( $player_id );
        if ( ! $impact ) { return new WP_REST_Response( [ 'removed' => false, 'error' => 'That player no longer exists.' ], 404 ); }
        if ( ! $impact['can_remove'] ) {
            return new WP_REST_Response( [ 'removed' => false, 'error' => implode( ' ', $impact['blockers'] ), 'blockers' => $impact['blockers'] ], 409 );
        }

        $pt = self::t( 'grsh_players' ); $rt = self::t( 'grsh_registrations' ); $at = self::t( 'grsh_availability' ); $qt = self::t( 'grsh_sub_requests' );
        $snap = [
            'player'       => $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$pt} WHERE id = %d", $player_id ), ARRAY_A ),
            'registration' => $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$rt} WHERE player_id = %d AND season_id = %d", $player_id, $season_id ), ARRAY_A ),
            'availability' => $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$at} WHERE player_id = %d AND season_id = %d", $player_id, $season_id ), ARRAY_A ) ?: [],
            'requests'     => self::table_exists( $qt )
                ? ( $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$qt} WHERE player_id = %d AND season_id = %d", $player_id, $season_id ), ARRAY_A ) ?: [] ) : [],
        ];

        $wpdb->suppress_errors( true );
        $wpdb->query( 'START TRANSACTION' );
        $failed = '';
        $step = function ( $ok ) use ( $wpdb, &$failed ) { if ( $ok === false && ! $failed ) { $failed = $wpdb->last_error ?: 'database error'; } };

        if ( self::table_exists( $qt ) ) { $step( $wpdb->delete( $qt, [ 'player_id' => $player_id, 'season_id' => $season_id ] ) ); }
        $step( $wpdb->delete( $at, [ 'player_id' => $player_id, 'season_id' => $season_id ] ) );
        if ( $impact['mode'] === 'remove_registration' && $snap['registration'] ) {
            $step( $wpdb->delete( $rt, [ 'id' => (int) $snap['registration']['id'] ] ) );
        }
        if ( $impact['delete_player'] ) {
            $step( $wpdb->delete( $pt, [ 'id' => $player_id ] ) );
        } else {
            $step( $wpdb->update( $pt, [ 'is_alternate' => 0 ], [ 'id' => $player_id ] ) );
        }

        if ( $failed ) {
            $wpdb->query( 'ROLLBACK' );
            $wpdb->suppress_errors( false );
            return new WP_REST_Response( [ 'removed' => false, 'error' => 'Removal failed and was rolled back; nothing changed. (' . $failed . ')' ], 500 );
        }
        $wpdb->query( 'COMMIT' );
        $wpdb->suppress_errors( false );

        $user = wp_get_current_user();
        $wpdb->insert( self::t( 'grsh_audit_logs' ), [
            'season_id'    => $season_id,
            'wp_user_id'   => get_current_user_id() ?: 0,
            'user_display' => $user && $user->exists() ? $user->display_name : 'Admin',
            'action'       => 'alternate_removed',
            'object_type'  => 'player',
            'object_id'    => $player_id,
            'before_value' => wp_json_encode( $snap ),
            'after_value'  => wp_json_encode( [ 'name' => $impact['name'], 'mode' => $impact['mode'], 'player_deleted' => $impact['delete_player'],
                                                 'wpforms_entry_id' => $impact['wpforms_entry_id'] ] ),
            'notes'        => 'Removed ' . $impact['name'] . ' from the sub pool.',
        ] );
        $log_id = (int) $wpdb->insert_id;

        // Remember the form entry so a bulk re-import does not resurrect them.
        if ( $impact['wpforms_entry_id'] ) {
            $wpdb->insert( self::t( 'grsh_audit_logs' ), [
                'season_id' => $season_id, 'wp_user_id' => get_current_user_id() ?: 0, 'action' => self::TOMBSTONE,
                'object_type' => 'wpforms_entry', 'object_id' => $impact['wpforms_entry_id'],
                'notes' => 'Entry ' . $impact['wpforms_entry_id'] . ' was removed from the sub pool; import skips it. Linked to log #' . $log_id . '.',
            ] );
        }

        return new WP_REST_Response( [ 'removed' => true, 'log_id' => $log_id, 'player_id' => $player_id,
                                       'player_deleted' => $impact['delete_player'], 'name' => $impact['name'] ], 200 );
    }

    public static function list_removed( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $al   = self::t( 'grsh_audit_logs' );
        $rows = $wpdb->get_results(
            "SELECT id, user_display, created_at, after_value, object_id FROM {$al}
              WHERE action = 'alternate_removed'
                AND id NOT IN ( SELECT object_id FROM {$al} WHERE action = 'alternate_restored' )
              ORDER BY id DESC LIMIT 25", ARRAY_A ) ?: [];
        $out = array_map( function ( $r ) {
            $a = json_decode( (string) $r['after_value'], true ) ?: [];
            return [ 'log_id' => (int) $r['id'], 'player_id' => (int) $r['object_id'], 'name' => $a['name'] ?? 'Unknown',
                     'removed_by' => $r['user_display'], 'removed_at' => $r['created_at'], 'player_deleted' => ! empty( $a['player_deleted'] ) ];
        }, $rows );
        return new WP_REST_Response( $out, 200 );
    }

    public static function restore_alternate( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $log_id = (int) $request->get_param( 'log_id' );
        $al = self::t( 'grsh_audit_logs' );
        $log = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$al} WHERE id = %d AND action = 'alternate_removed'", $log_id ), ARRAY_A );
        if ( ! $log ) { return new WP_REST_Response( [ 'restored' => false, 'error' => 'That removal record was not found.' ], 404 ); }
        if ( $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$al} WHERE action = 'alternate_restored' AND object_id = %d LIMIT 1", $log_id ) ) ) {
            return new WP_REST_Response( [ 'restored' => false, 'error' => 'Already restored.' ], 409 );
        }
        $snap = json_decode( (string) $log['before_value'], true );
        if ( ! is_array( $snap ) || empty( $snap['player']['id'] ) ) {
            return new WP_REST_Response( [ 'restored' => false, 'error' => 'The saved copy is unreadable, so this cannot be restored.' ], 500 );
        }

        $pt = self::t( 'grsh_players' ); $rt = self::t( 'grsh_registrations' ); $at = self::t( 'grsh_availability' ); $qt = self::t( 'grsh_sub_requests' );
        $pid = (int) $snap['player']['id'];

        $existing = $wpdb->get_row( $wpdb->prepare( "SELECT id FROM {$pt} WHERE id = %d", $pid ), ARRAY_A );
        if ( ! $existing ) {
            $clash = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$pt} WHERE email = %s LIMIT 1", $snap['player']['email'] ) );
            if ( $clash ) {
                return new WP_REST_Response( [ 'restored' => false, 'error' => 'Someone with the same e-mail address now exists (player #' . (int) $clash . '). Resolve that first.' ], 409 );
            }
        }
        if ( ! empty( $snap['registration'] ) ) {
            $dupe = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$rt} WHERE player_id = %d AND season_id = %d LIMIT 1", $pid, (int) $snap['registration']['season_id'] ) );
            if ( $dupe ) { return new WP_REST_Response( [ 'restored' => false, 'error' => 'This player has registered again since. Nothing to restore.' ], 409 ); }
        }

        $wpdb->suppress_errors( true );
        $wpdb->query( 'START TRANSACTION' );
        $failed = '';
        $step = function ( $ok ) use ( $wpdb, &$failed ) { if ( $ok === false && ! $failed ) { $failed = $wpdb->last_error ?: 'database error'; } };

        if ( ! $existing ) { $step( $wpdb->insert( $pt, $snap['player'] ) ); }
        else               { $step( $wpdb->update( $pt, [ 'is_alternate' => (int) ( $snap['player']['is_alternate'] ?? 1 ) ], [ 'id' => $pid ] ) ); }
        if ( ! empty( $snap['registration'] ) ) { $step( $wpdb->insert( $rt, $snap['registration'] ) ); }
        foreach ( (array) ( $snap['availability'] ?? [] ) as $row ) { $step( $wpdb->insert( $at, $row ) ); }
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
            'season_id' => self::get_season_id(), 'wp_user_id' => get_current_user_id() ?: 0,
            'user_display' => $user && $user->exists() ? $user->display_name : 'Admin',
            'action' => 'alternate_restored', 'object_type' => 'player', 'object_id' => $log_id,
            'notes' => 'Restored ' . ( $after['name'] ?? 'player' ) . ' to the sub pool (undo of log #' . $log_id . ').',
        ] );
        return new WP_REST_Response( [ 'restored' => true, 'player_id' => $pid, 'name' => $after['name'] ?? '' ], 200 );
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------
    private static function get_season_id(): int {
        global $wpdb;
        static $id = null;
        if ( $id === null ) {
            $id = (int) $wpdb->get_var( $wpdb->prepare(
                "SELECT id FROM {$wpdb->prefix}grsh_seasons WHERE season_year = %d LIMIT 1",
                GRSH_Sync_Engine::SEASON
            ) );
        }
        return $id ?: 1;
    }
}
