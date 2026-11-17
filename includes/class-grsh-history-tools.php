<?php
/**
 * GRSH History Tools — what the Player History page needs beyond the import engine.
 *
 *   GET  /grsh/v1/history/overview          counts, data-quality checks, last import, who registered this season, likely duplicates
 *   POST /grsh/v1/history/records/{id}      fix one season row (tier, division, team, attendance, notes ...)
 *   POST /grsh/v1/history/players/{id}      fix a player's name or email
 *
 * Merging and "not a duplicate" reuse POST /players/merge and /players/not-duplicate (GRSH_Players_API).
 * PHP 7.4 compatible. Every edit is written to the audit log.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class GRSH_History_Tools {

    const TIERS = [ 'A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'R1', 'R2', 'R3' ];
    const DIVS  = [ 'gold_open', '45a', 'senior_b', 'senior_c', 'womens' ];
    const RESULTS = [ 'winner', 'runner_up', 'participant', 'none' ];
    const MAX_DUPES = 30;

    public static function register_hooks(): void {
        add_action( 'rest_api_init', [ __CLASS__, 'register_routes' ] );
    }

    public static function register_routes(): void {
        register_rest_route( 'grsh/v1', '/history/overview', [
            'methods' => 'GET', 'callback' => [ __CLASS__, 'get_overview' ], 'permission_callback' => [ __CLASS__, 'permission' ],
        ] );
        register_rest_route( 'grsh/v1', '/history/records/(?P<id>\d+)', [
            'methods' => 'POST,PUT,PATCH', 'callback' => [ __CLASS__, 'update_record' ], 'permission_callback' => [ __CLASS__, 'permission' ],
        ] );
        register_rest_route( 'grsh/v1', '/history/players/(?P<id>\d+)', [
            'methods' => 'POST,PUT,PATCH', 'callback' => [ __CLASS__, 'update_player' ], 'permission_callback' => [ __CLASS__, 'permission' ],
        ] );
    }

    public static function permission(): bool {
        return current_user_can( 'manage_options' ) || current_user_can( 'grsh_committee' );
    }

    private static function season_year(): int {
        return class_exists( 'GRSH_Sync_Engine' ) ? (int) GRSH_Sync_Engine::SEASON : (int) gmdate( 'Y' );
    }

    private static function season_id(): int {
        global $wpdb;
        $id = (int) $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}grsh_seasons WHERE season_year = %d LIMIT 1", self::season_year() ) );
        return $id ?: 0;
    }

    private static function audit( string $action, int $object_id, string $object_type, $before, $after, string $notes ): void {
        global $wpdb;
        $u = wp_get_current_user();
        $wpdb->insert( "{$wpdb->prefix}grsh_audit_logs", [
            'season_id'    => self::season_id() ?: null,
            'wp_user_id'   => get_current_user_id() ?: 0,
            'user_display' => ( $u && $u->exists() ) ? $u->display_name : 'Committee',
            'action'       => $action, 'object_type' => $object_type, 'object_id' => $object_id,
            'before_value' => wp_json_encode( $before ), 'after_value' => wp_json_encode( $after ), 'notes' => $notes,
        ] );
    }

    // -------------------------------------------------------------------------
    // GET /history/overview
    // -------------------------------------------------------------------------

    public static function get_overview( WP_REST_Request $request ): WP_REST_Response {
        return new WP_REST_Response( self::overview(), 200 );
    }

    public static function overview(): array {
        global $wpdb;
        $h = "{$wpdb->prefix}grsh_player_history";
        $p = "{$wpdb->prefix}grsh_players";
        $s = "{$wpdb->prefix}grsh_seasons";

        $rows    = (int) $wpdb->get_var( "SELECT COUNT(*) FROM $h" );
        $players = (int) $wpdb->get_var( "SELECT COUNT(DISTINCT player_id) FROM $h" );
        $seasons = array_map( 'intval', $wpdb->get_col( "SELECT DISTINCT s.season_year FROM $h x JOIN $s s ON s.id = x.season_id ORDER BY s.season_year DESC" ) ?: [] );

        // data-quality checks: each one counts something the page cannot know unless we tell it
        $q = [
            [ 'key' => 'no_tier',     'label' => 'Season rows with no skill tier',   'count' => (int) $wpdb->get_var( "SELECT COUNT(*) FROM $h WHERE skill_tier_reported IS NULL OR skill_tier_reported = ''" ),
              'hint' => 'Tier trends and the sandbagging check cannot work without a tier.' ],
            [ 'key' => 'no_division', 'label' => 'Season rows with no division',     'count' => (int) $wpdb->get_var( "SELECT COUNT(*) FROM $h WHERE division_played IS NULL OR division_played = ''" ),
              'hint' => 'These players will not show under any division filter.' ],
            [ 'key' => 'no_games',    'label' => 'Season rows with no attendance',   'count' => (int) $wpdb->get_var( "SELECT COUNT(*) FROM $h WHERE games_scheduled IS NULL" ),
              'hint' => 'Attendance and no-show counts show as "not recorded" for these.' ],
            [ 'key' => 'no_team',     'label' => 'Season rows with no team',         'count' => (int) $wpdb->get_var( "SELECT COUNT(*) FROM $h WHERE team_name IS NULL OR team_name = ''" ),
              'hint' => 'Team names are used by the season story and champions list.' ],
            [ 'key' => 'no_email',    'label' => 'Players with no email',            'count' => (int) $wpdb->get_var( "SELECT COUNT(DISTINCT x.player_id) FROM $h x JOIN $p p ON p.id = x.player_id WHERE p.email IS NULL OR p.email = ''" ),
              'hint' => 'They cannot be matched to a registration or invited back.' ],
        ];

        // last import (the log table is created on first import, so a missing table is normal)
        $last = null;
        if ( method_exists( $wpdb, 'suppress_errors' ) ) { $wpdb->suppress_errors( true ); }
        $row = $wpdb->get_row( "SELECT id, user_display, filename, imported, updated, skipped, created_at FROM {$wpdb->prefix}grsh_import_logs ORDER BY id DESC LIMIT 1", ARRAY_A );
        if ( method_exists( $wpdb, 'suppress_errors' ) ) { $wpdb->suppress_errors( false ); }
        if ( is_array( $row ) ) {
            $last = [ 'id' => (int) $row['id'], 'by' => (string) $row['user_display'], 'file' => (string) $row['filename'],
                      'imported' => (int) $row['imported'], 'updated' => (int) $row['updated'], 'skipped' => (int) $row['skipped'], 'at' => (string) $row['created_at'] ];
        }

        // who has registered for the current season (players with a live registration)
        $sid = self::season_id();
        $reg_ids = [];
        if ( $sid ) {
            $reg_ids = array_map( 'intval', $wpdb->get_col( $wpdb->prepare(
                "SELECT DISTINCT player_id FROM {$wpdb->prefix}grsh_registrations WHERE season_id = %d AND status NOT IN ('withdrawn','waitlist')", $sid
            ) ) ?: [] );
        }

        return [
            'rows' => $rows, 'players' => $players, 'seasons' => $seasons,
            'quality' => $q, 'last_import' => $last,
            'registered_year' => self::season_year(), 'registered_ids' => $reg_ids,
            'duplicates' => self::duplicates(),
        ];
    }

    private static function norm( $s ): string {
        return preg_replace( '/[^a-z0-9]/', '', strtolower( (string) $s ) );
    }

    /** Common short forms that are the same first name (Dave / David). Lower-case, letters only. */
    const NICKNAMES = [
        [ 'dave', 'david' ], [ 'mike', 'michael', 'mikey' ], [ 'bob', 'rob', 'robert', 'bobby', 'robbie' ], [ 'bill', 'will', 'william', 'billy' ],
        [ 'jim', 'jimmy', 'james' ], [ 'tom', 'tommy', 'thomas' ], [ 'steve', 'steven', 'stephen' ], [ 'chris', 'christopher' ], [ 'dan', 'danny', 'daniel' ],
        [ 'joe', 'joseph' ], [ 'matt', 'matthew' ], [ 'tony', 'anthony' ], [ 'rick', 'ricky', 'rich', 'richard', 'dick' ], [ 'jon', 'john', 'johnny', 'jonathan' ],
        [ 'nick', 'nicholas' ], [ 'andy', 'andrew', 'drew' ], [ 'ed', 'eddie', 'edward', 'ted' ], [ 'sam', 'samuel' ], [ 'ben', 'benjamin' ], [ 'greg', 'gregory' ],
        [ 'pat', 'patrick' ], [ 'don', 'donald' ], [ 'ken', 'kenneth' ], [ 'tim', 'timothy' ], [ 'charlie', 'charles', 'chuck' ], [ 'jeff', 'jeffrey', 'geoff', 'geoffrey' ],
        [ 'larry', 'lawrence' ], [ 'alex', 'alexander' ], [ 'ron', 'ronald' ], [ 'jerry', 'gerald' ], [ 'pete', 'peter' ], [ 'phil', 'philip' ], [ 'zach', 'zachary' ],
    ];

    private static function similar_first( string $a, string $b ): bool {
        if ( $a === '' || $b === '' ) { return false; }
        if ( $a === $b ) { return true; }
        foreach ( self::NICKNAMES as $g ) { if ( in_array( $a, $g, true ) && in_array( $b, $g, true ) ) { return true; } }
        $short = strlen( $a ) <= strlen( $b ) ? $a : $b; $long = $short === $a ? $b : $a;
        if ( strlen( $short ) >= 3 && strpos( $long, $short ) === 0 ) { return true; }   // Dave / David
        return strlen( $a ) >= 4 && strlen( $b ) >= 4 && levenshtein( $a, $b ) <= 1;
    }

    /** Pairs that might be one person. Two records with the same season are two different people, so those are never offered. */
    public static function duplicates(): array {
        global $wpdb;
        $h = "{$wpdb->prefix}grsh_player_history";
        $p = "{$wpdb->prefix}grsh_players";
        $s = "{$wpdb->prefix}grsh_seasons";
        $ps = $wpdb->get_results( "SELECT DISTINCT p.id, p.first_name, p.last_name, p.email FROM $p p JOIN $h x ON x.player_id = p.id ORDER BY p.id", ARRAY_A ) ?: [];
        if ( count( $ps ) < 2 ) { return []; }
        $by_player = [];
        foreach ( $wpdb->get_results( "SELECT x.player_id, s.season_year FROM $h x JOIN $s s ON s.id = x.season_id", ARRAY_A ) ?: [] as $r ) {
            $by_player[ (int) $r['player_id'] ][] = (int) $r['season_year'];
        }
        $dismissed = (array) get_option( 'grsh_dismissed_dupes', [] );

        $buckets = [];
        foreach ( $ps as $i => $r ) {
            $ln = self::norm( $r['last_name'] );
            if ( $ln !== '' ) { $buckets[ 'n:' . $ln ][] = $i; }
            $local = strstr( strtolower( (string) $r['email'] ), '@', true );
            if ( $local !== false && strlen( $local ) >= 6 ) { $buckets[ 'e:' . self::norm( $local ) ][] = $i; }
        }

        $out = []; $seen = [];
        foreach ( $buckets as $key => $idx ) {
            if ( count( $idx ) < 2 ) { continue; }
            for ( $x = 0; $x < count( $idx ); $x++ ) {
                for ( $y = $x + 1; $y < count( $idx ); $y++ ) {
                    $a = $ps[ $idx[ $x ] ]; $b = $ps[ $idx[ $y ] ];
                    $ida = (int) $a['id']; $idb = (int) $b['id'];
                    $pair = min( $ida, $idb ) . '-' . max( $ida, $idb );
                    if ( isset( $seen[ $pair ] ) || in_array( $pair, $dismissed, true ) ) { continue; }
                    $ya = $by_player[ $ida ] ?? []; $yb = $by_player[ $idb ] ?? [];
                    if ( array_intersect( $ya, $yb ) ) { continue; }          // same season on both = two people
                    $why = '';
                    if ( $key[0] === 'e' ) { $why = 'Same email name, different address'; }
                    elseif ( self::similar_first( self::norm( $a['first_name'] ), self::norm( $b['first_name'] ) ) ) { $why = 'Same last name, similar first name'; }
                    if ( $why === '' ) { continue; }
                    $seen[ $pair ] = true;
                    $out[] = [
                        'why' => $why,
                        'a' => [ 'id' => $ida, 'name' => trim( $a['first_name'] . ' ' . $a['last_name'] ), 'email' => (string) $a['email'], 'seasons' => $ya ],
                        'b' => [ 'id' => $idb, 'name' => trim( $b['first_name'] . ' ' . $b['last_name'] ), 'email' => (string) $b['email'], 'seasons' => $yb ],
                    ];
                    if ( count( $out ) >= self::MAX_DUPES ) { return $out; }
                }
            }
        }
        return $out;
    }

    // -------------------------------------------------------------------------
    // POST /history/records/{id}
    // -------------------------------------------------------------------------

    private static function bool01( $v ): int {
        return ( $v === true || $v === 1 || $v === '1' || $v === 'true' ) ? 1 : 0;
    }

    private static function small_int( $v, string $label, bool $nullable ) {
        if ( $v === null || $v === '' ) {
            if ( $nullable ) { return null; }
            return new WP_Error( 'bad', "$label is required." );
        }
        if ( ! is_numeric( $v ) || (int) $v < 0 || (int) $v > 255 || (string) (int) $v !== (string) (int) $v ) {
            return new WP_Error( 'bad', "$label must be a whole number from 0 to 255." );
        }
        return (int) $v;
    }

    public static function update_record( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $id = absint( $request->get_param( 'id' ) );
        $t  = "{$wpdb->prefix}grsh_player_history";
        $cur = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $t WHERE id = %d", $id ), ARRAY_A );
        if ( ! $cur ) { return new WP_REST_Response( [ 'error' => 'That history row no longer exists.' ], 404 ); }

        $body = $request->get_json_params();
        if ( ! is_array( $body ) ) { $body = []; }
        $set = [];
        $fail = function ( string $m ) { return new WP_REST_Response( [ 'error' => $m ], 400 ); };

        if ( array_key_exists( 'skill_tier_reported', $body ) ) {
            $v = strtoupper( trim( (string) $body['skill_tier_reported'] ) );
            if ( $v !== '' && ! in_array( $v, self::TIERS, true ) ) { return $fail( 'Tier must be one of ' . implode( ', ', self::TIERS ) . ', or blank.' ); }
            $set['skill_tier_reported'] = $v === '' ? null : $v;
        }
        if ( array_key_exists( 'division_played', $body ) ) {
            $v = sanitize_key( (string) $body['division_played'] );
            if ( $v !== '' && ! in_array( $v, self::DIVS, true ) ) { return $fail( 'That division is not one this plugin knows.' ); }
            $set['division_played'] = $v === '' ? null : $v;
        }
        if ( array_key_exists( 'team_name', $body ) ) {
            $v = sanitize_text_field( (string) $body['team_name'] );
            if ( strlen( $v ) > 100 ) { return $fail( 'Team name is too long (100 characters at most).' ); }
            $set['team_name'] = $v === '' ? null : $v;
        }
        if ( array_key_exists( 'championship_result', $body ) ) {
            $v = sanitize_key( (string) $body['championship_result'] );
            if ( ! in_array( $v, self::RESULTS, true ) ) { return $fail( 'Result must be winner, runner_up, participant or none.' ); }
            $set['championship_result'] = $v;
        }
        foreach ( [ 'games_scheduled' => 'Games scheduled', 'games_attended' => 'Games attended' ] as $k => $label ) {
            if ( array_key_exists( $k, $body ) ) {
                $v = self::small_int( $body[ $k ], $label, true );
                if ( is_wp_error( $v ) ) { return $fail( $v->get_error_message() ); }
                $set[ $k ] = $v;
            }
        }
        if ( array_key_exists( 'no_show_count', $body ) ) {
            $v = self::small_int( $body['no_show_count'], 'No-shows', false );
            if ( is_wp_error( $v ) ) { return $fail( $v->get_error_message() ); }
            $set['no_show_count'] = $v;
        }
        foreach ( [ 'sandbagging_flag', 'was_captain' ] as $k ) {
            if ( array_key_exists( $k, $body ) ) { $set[ $k ] = self::bool01( $body[ $k ] ); }
        }
        if ( array_key_exists( 'committee_notes', $body ) ) {
            $v = trim( wp_strip_all_tags( (string) $body['committee_notes'] ) );
            if ( strlen( $v ) > 2000 ) { return $fail( 'Notes are limited to 2000 characters.' ); }
            $set['committee_notes'] = $v === '' ? null : $v;
        }

        if ( ! $set ) { return $fail( 'Nothing to change.' ); }
        $gs = array_key_exists( 'games_scheduled', $set ) ? $set['games_scheduled'] : ( $cur['games_scheduled'] === null ? null : (int) $cur['games_scheduled'] );
        $ga = array_key_exists( 'games_attended',  $set ) ? $set['games_attended']  : ( $cur['games_attended']  === null ? null : (int) $cur['games_attended'] );
        if ( $gs !== null && $ga !== null && $ga > $gs ) { return $fail( 'Games attended cannot be more than games scheduled.' ); }

        $before = []; foreach ( $set as $k => $_ ) { $before[ $k ] = $cur[ $k ]; }
        $wpdb->update( $t, $set, [ 'id' => $id ] );
        self::audit( 'history_record_edited', $id, 'player_history', $before, $set, 'History row ' . $id . ' edited: ' . implode( ', ', array_keys( $set ) ) );

        return new WP_REST_Response( [ 'ok' => true, 'id' => $id, 'changed' => $set ], 200 );
    }

    // -------------------------------------------------------------------------
    // POST /history/players/{id}
    // -------------------------------------------------------------------------

    public static function update_player( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $id = absint( $request->get_param( 'id' ) );
        $t  = "{$wpdb->prefix}grsh_players";
        $cur = $wpdb->get_row( $wpdb->prepare( "SELECT id, first_name, last_name, email FROM $t WHERE id = %d", $id ), ARRAY_A );
        if ( ! $cur ) { return new WP_REST_Response( [ 'error' => 'That player no longer exists.' ], 404 ); }
        $body = $request->get_json_params();
        if ( ! is_array( $body ) ) { $body = []; }
        $set = [];

        foreach ( [ 'first_name' => 'First name', 'last_name' => 'Last name' ] as $k => $label ) {
            if ( array_key_exists( $k, $body ) ) {
                $v = trim( sanitize_text_field( (string) $body[ $k ] ) );
                if ( $v === '' ) { return new WP_REST_Response( [ 'error' => "$label cannot be blank." ], 400 ); }
                if ( strlen( $v ) > 100 ) { return new WP_REST_Response( [ 'error' => "$label is too long." ], 400 ); }
                $set[ $k ] = $v;
            }
        }
        if ( array_key_exists( 'email', $body ) ) {
            $v = strtolower( trim( (string) $body['email'] ) );
            if ( $v === '' || ! is_email( $v ) ) { return new WP_REST_Response( [ 'error' => 'Enter a valid email address.' ], 400 ); }
            $other = (int) $wpdb->get_var( $wpdb->prepare( "SELECT id FROM $t WHERE LOWER(email) = %s AND id <> %d LIMIT 1", $v, $id ) );
            if ( $other ) {
                return new WP_REST_Response( [ 'error' => 'Another player already has that email. If they are the same person, use Merge instead.', 'other_id' => $other ], 409 );
            }
            $set['email'] = $v;
        }
        if ( ! $set ) { return new WP_REST_Response( [ 'error' => 'Nothing to change.' ], 400 ); }

        $before = []; foreach ( $set as $k => $_ ) { $before[ $k ] = $cur[ $k ]; }
        $wpdb->update( $t, $set, [ 'id' => $id ] );
        self::audit( 'history_player_edited', $id, 'player', $before, $set, 'Player ' . $id . ' edited from History: ' . implode( ', ', array_keys( $set ) ) );
        return new WP_REST_Response( array_merge( [ 'ok' => true, 'id' => $id ], $set ), 200 );
    }
}
