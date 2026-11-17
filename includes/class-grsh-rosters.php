<?php
/**
 * GRSH Rosters — REST API + public review/results pages.
 *
 * Every change is saved the moment it is made (there is no separate "Save" step).
 *
 * Admin routes (manage_options or grsh_committee):
 *   GET    /rosters?division=            teams, pool, pins, plans, gate checks, review + publish status
 *   POST   /rosters/teams                create team           PATCH/DELETE /rosters/teams/{id}
 *   POST   /rosters/assign               move one player (legacy shape)   DELETE /rosters/assign/{roster_id}
 *   POST   /rosters/moves                move many players in one transaction (auto-balance, swaps, undo)
 *   POST   /rosters/captain              set a team's captain
 *   POST   /rosters/pins                 keep-together / keep-apart rules
 *   POST   /rosters/plans                save a named snapshot     POST /rosters/plans/restore    DELETE /rosters/plans/{id}
 *   POST   /rosters/review               turn the committee review link on/off
 *   POST   /rosters/publish              email players + create the public results page
 *   GET    /rosters/sportspress          dry run: which SportsPress teams/players match (writes nothing)
 * Public (token only):
 *   POST   /rosters/review/feedback      committee approve / comment
 *   ?grsh_roster_review=KEY, ?grsh_roster_pub=KEY   read-only pages
 *
 * PHP 7.4 compatible (the live site runs 7.4): no match, no str_contains, no nullsafe.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class GRSH_Rosters {

    const LOCK        = 'grsh_draft';          // shared with GRSH_Draft so picks and roster edits never interleave
    const DRAFT_OPT   = 'grsh_draft_state_';
    const META_OPT    = 'grsh_roster_meta_';
    const PINS_OPT    = 'grsh_roster_pins_';
    const PLANS_OPT   = 'grsh_roster_plans_';
    const FB_OPT      = 'grsh_roster_fb_';
    const MAX_PLANS   = 12;
    const MAX_FB      = 200;
    const MAX_PINS    = 60;
    const MAX_EMAILS  = 200;
    const DIV_ENUM    = [ 'gold_open', '45a', 'senior_b', 'senior_c', 'womens' ];
    const DIV_ALIASES = [ '45a' => [ '45a', 'o45_a' ] ];

    public static function register_hooks(): void {
        add_action( 'rest_api_init', [ __CLASS__, 'register_routes' ] );
        add_action( 'wp', [ __CLASS__, 'handle_landing' ] );
    }

    public static function register_routes(): void {
        $ns = 'grsh/v1';
        $p  = [ __CLASS__, 'check_permission' ];

        register_rest_route( $ns, '/rosters', [ 'methods' => 'GET', 'callback' => [ __CLASS__, 'get_rosters' ], 'permission_callback' => $p ] );
        register_rest_route( $ns, '/rosters/teams', [ 'methods' => 'POST', 'callback' => [ __CLASS__, 'create_team' ], 'permission_callback' => $p ] );
        register_rest_route( $ns, '/rosters/teams/(?P<id>\d+)', [
            [ 'methods' => 'PATCH',  'callback' => [ __CLASS__, 'update_team' ], 'permission_callback' => $p ],
            [ 'methods' => 'DELETE', 'callback' => [ __CLASS__, 'delete_team' ], 'permission_callback' => $p ],
        ] );
        register_rest_route( $ns, '/rosters/assign', [ 'methods' => 'POST', 'callback' => [ __CLASS__, 'assign_player' ], 'permission_callback' => $p ] );
        register_rest_route( $ns, '/rosters/assign/(?P<roster_id>\d+)', [ 'methods' => 'DELETE', 'callback' => [ __CLASS__, 'remove_player' ], 'permission_callback' => $p ] );
        register_rest_route( $ns, '/rosters/moves', [ 'methods' => 'POST', 'callback' => [ __CLASS__, 'post_moves' ], 'permission_callback' => $p ] );
        register_rest_route( $ns, '/rosters/captain', [ 'methods' => 'POST', 'callback' => [ __CLASS__, 'set_captain' ], 'permission_callback' => $p ] );
        register_rest_route( $ns, '/rosters/pins', [ 'methods' => 'POST', 'callback' => [ __CLASS__, 'save_pins' ], 'permission_callback' => $p ] );
        register_rest_route( $ns, '/rosters/plans', [ 'methods' => 'POST', 'callback' => [ __CLASS__, 'save_plan' ], 'permission_callback' => $p ] );
        register_rest_route( $ns, '/rosters/plans/restore', [ 'methods' => 'POST', 'callback' => [ __CLASS__, 'restore_plan' ], 'permission_callback' => $p ] );
        register_rest_route( $ns, '/rosters/plans/(?P<plan_id>[a-f0-9]{6,24})', [ 'methods' => 'DELETE', 'callback' => [ __CLASS__, 'delete_plan' ], 'permission_callback' => $p ] );
        register_rest_route( $ns, '/rosters/review', [ 'methods' => 'POST', 'callback' => [ __CLASS__, 'toggle_review' ], 'permission_callback' => $p ] );
        register_rest_route( $ns, '/rosters/publish', [ 'methods' => 'POST', 'callback' => [ __CLASS__, 'publish' ], 'permission_callback' => $p ] );
        register_rest_route( $ns, '/rosters/sportspress', [ 'methods' => 'GET', 'callback' => [ __CLASS__, 'sportspress_preview' ], 'permission_callback' => $p ] );
        register_rest_route( $ns, '/rosters/review/feedback', [ 'methods' => 'POST', 'callback' => [ __CLASS__, 'review_feedback' ], 'permission_callback' => '__return_true' ] );
    }

    public static function check_permission(): bool {
        return current_user_can( 'manage_options' ) || current_user_can( 'grsh_committee' );
    }

    // -------------------------------------------------------------------------
    // Small helpers
    // -------------------------------------------------------------------------

    private static function season_id(): int {
        global $wpdb;
        $year = class_exists( 'GRSH_Sync_Engine' ) ? GRSH_Sync_Engine::SEASON : (int) gmdate( 'Y' );
        $id   = (int) $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}grsh_seasons WHERE season_year = %d LIMIT 1", $year ) );
        return $id ?: 1;
    }

    private static function err( string $msg, int $status = 400, array $extra = [] ): WP_REST_Response {
        return new WP_REST_Response( array_merge( [ 'error' => $msg ], $extra ), $status );
    }

    private static function audit( string $action, ?int $object_id, array $after, string $notes = '' ): void {
        global $wpdb;
        $u = function_exists( 'wp_get_current_user' ) ? wp_get_current_user() : null;
        $wpdb->insert( "{$wpdb->prefix}grsh_audit_logs", [
            'season_id'    => self::season_id(),
            'wp_user_id'   => get_current_user_id() ?: 0,
            'user_display' => ( $u && $u->exists() ) ? $u->display_name : 'Committee link',
            'action'       => $action,
            'object_type'  => 'roster',
            'object_id'    => $object_id,
            'after_value'  => wp_json_encode( $after ),
            'notes'        => $notes,
            'ip_address'   => $_SERVER['REMOTE_ADDR'] ?? null,
        ] );
    }

    /** Run $fn while holding the shared draft/roster lock. Returns WP_Error('busy') if it can't be had. */
    private static function with_lock( callable $fn ) {
        global $wpdb;
        $got = $wpdb->get_var( "SELECT GET_LOCK('" . self::LOCK . "', 5)" );
        if ( (int) $got !== 1 ) {
            return new WP_Error( 'busy', 'Another change is being saved — try again in a second.', [ 'status' => 409 ] );
        }
        try {
            return $fn();
        } finally {
            $wpdb->get_var( "SELECT RELEASE_LOCK('" . self::LOCK . "')" );
        }
    }

    private static function wp_err( WP_Error $e ): WP_REST_Response {
        $d = $e->get_error_data();
        return self::err( $e->get_error_message(), (int) ( is_array( $d ) && isset( $d['status'] ) ? $d['status'] : 400 ) );
    }

    private static function aliases( string $div ): array {
        return self::DIV_ALIASES[ $div ] ?? [ $div ];
    }

    /** Settings for one division (roster min/max, goalie limits, label, planned team count). */
    private static function division_cfg( string $key ): array {
        $cfg = [ 'key' => $key, 'label' => ucwords( str_replace( '_', ' ', $key ) ), 'teams' => 0, 'min_roster' => 6, 'max_roster' => 12, 'goalie_min' => 1, 'goalie_max' => 2 ];
        if ( class_exists( 'GRSH_Settings' ) ) {
            foreach ( GRSH_Settings::get_active_divisions() as $d ) {
                if ( ( $d['key'] ?? '' ) === $key ) {
                    foreach ( [ 'teams', 'min_roster', 'max_roster', 'goalie_min', 'goalie_max' ] as $k ) {
                        if ( isset( $d[ $k ] ) ) { $cfg[ $k ] = (int) $d[ $k ]; }
                    }
                    if ( ! empty( $d['label'] ) ) { $cfg['label'] = (string) $d['label']; }
                }
            }
        }
        return $cfg;
    }

    /** Division keys we know about: enabled in Settings plus any that already have draft teams. */
    private static function known_divisions( int $sid ): array {
        global $wpdb;
        $keys = [];
        if ( class_exists( 'GRSH_Settings' ) ) {
            foreach ( GRSH_Settings::get_active_divisions() as $d ) {
                if ( ! empty( $d['key'] ) ) { $keys[] = (string) $d['key']; }
            }
        }
        $rows = $wpdb->get_col( $wpdb->prepare(
            "SELECT DISTINCT division FROM {$wpdb->prefix}grsh_teams WHERE season_id = %d AND team_type = 'draft'", $sid
        ) ) ?: [];
        foreach ( $rows as $k ) {
            if ( ! in_array( $k, $keys, true ) ) { $keys[] = (string) $k; }
        }
        return $keys;
    }

    /** @return string|WP_Error */
    private static function resolve_div( $raw ) {
        $sid   = self::season_id();
        $known = self::known_divisions( $sid );
        $d     = sanitize_key( (string) ( $raw ?? '' ) );
        if ( $d === '' ) {
            return $known ? $known[0] : 'gold_open';
        }
        if ( ! in_array( $d, $known, true ) && ! in_array( $d, self::DIV_ENUM, true ) ) {
            return new WP_Error( 'bad_division', 'Unknown division.', [ 'status' => 400 ] );
        }
        return $d;
    }

    private static function draft_status( string $div ): string {
        $s = get_option( self::DRAFT_OPT . $div, [] );
        return ( is_array( $s ) && ! empty( $s['status'] ) ) ? (string) $s['status'] : 'ready';
    }

    /** Draft in progress? Roster edits would fight the draft, so they are refused. */
    private static function draft_guard( string $div ): ?WP_Error {
        $st = self::draft_status( $div );
        if ( $st === 'active' || $st === 'paused' ) {
            return new WP_Error( 'draft_live', 'The draft for this division is in progress. Finish it (or reset it) on the Draft page before editing rosters here.', [ 'status' => 409 ] );
        }
        return null;
    }

    private static function meta_get( string $div ): array {
        $m = get_option( self::META_OPT . $div, [] );
        return wp_parse_args( is_array( $m ) ? $m : [], [ 'review_key' => '', 'pub_key' => '', 'published_at' => '', 'publish_result' => [] ] );
    }

    private static function meta_save( string $div, array $m ): void {
        update_option( self::META_OPT . $div, $m, false );
    }

    // -------------------------------------------------------------------------
    // Data loaders
    // -------------------------------------------------------------------------

    private static function fmt_player( array $r ): array {
        return [
            'id'                  => (int) $r['id'],
            'first_name'          => (string) $r['first_name'],
            'last_name'           => (string) $r['last_name'],
            'position'            => ! empty( $r['position'] ) ? $r['position'] : null,
            'is_goalie'           => ( ( $r['position'] ?? '' ) === 'goaltender' || (int) ( $r['is_goalie'] ?? 0 ) === 1 ),
            'skill_tier_reported' => (string) ( $r['skill_tier_reported'] ?? '' ),
            'skill_tier_assigned' => ! empty( $r['skill_tier_assigned'] ) ? $r['skill_tier_assigned'] : null,
            'years_experience'    => ( isset( $r['years_experience'] ) && $r['years_experience'] !== null && $r['years_experience'] !== '' ) ? (int) $r['years_experience'] : null,
            'sandbagging_flag'    => (bool) ( $r['sandbagging_flag'] ?? 0 ),
            'age'                 => ! empty( $r['age'] ) ? (int) $r['age'] : null,
            'payment_status'      => (string) ( $r['payment_status'] ?? 'pending' ),
            'registration_id'     => isset( $r['registration_id'] ) ? (int) $r['registration_id'] : null,
        ];
    }

    private static function score( array $p ): float {
        $tier = $p['skill_tier_assigned'] ?: ( $p['skill_tier_reported'] ?? '' );
        return GRSH_Scoring::compute_score( (string) $tier, (int) ( $p['years_experience'] ?? 0 ) );
    }

    private static function teams_rows( int $sid, string $div ): array {
        global $wpdb;
        return $wpdb->get_results( $wpdb->prepare(
            "SELECT id, name, colour, draft_order, draft_locked, captain_player_id
               FROM {$wpdb->prefix}grsh_teams
              WHERE season_id = %d AND division = %s AND team_type = 'draft'
           ORDER BY COALESCE(draft_order, 255), name",
            $sid, $div
        ), ARRAY_A ) ?: [];
    }

    private static function pool( int $sid, string $div ): array {
        global $wpdb;
        $keys = self::aliases( $div );
        $ph   = implode( ',', array_fill( 0, count( $keys ), '%s' ) );
        $rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT p.id, p.first_name, p.last_name, p.position, p.is_goalie, p.skill_tier_reported, p.skill_tier_assigned,
                    p.sandbagging_flag, p.years_experience, r.age, r.payment_status, r.id AS registration_id
               FROM {$wpdb->prefix}grsh_players p
               JOIN {$wpdb->prefix}grsh_registrations r ON r.player_id = p.id AND r.season_id = %d
              WHERE r.status <> 'rejected'
                AND COALESCE(r.player_type,'primary') <> 'sub'
                AND COALESCE(p.is_alternate,0) = 0
                AND r.division_requested IN ($ph)
                AND NOT EXISTS ( SELECT 1 FROM {$wpdb->prefix}grsh_rosters ro WHERE ro.player_id = p.id AND ro.season_id = %d )
           ORDER BY p.last_name ASC, p.first_name ASC",
            array_merge( [ $sid ], $keys, [ $sid ] )
        ), ARRAY_A ) ?: [];
        return array_map( [ __CLASS__, 'fmt_player' ], $rows );
    }

    /** Roster rows for these teams → [team_id => [player...]] */
    private static function roster_players( int $sid, array $team_ids ): array {
        global $wpdb;
        if ( ! $team_ids ) { return []; }
        $ph   = implode( ',', array_fill( 0, count( $team_ids ), '%d' ) );
        $rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT ro.id AS roster_id, ro.team_id, ro.is_captain, ro.assignment_type, ro.draft_round, ro.draft_pick,
                    ro.position_assigned, ro.skill_tier_at_draft,
                    p.id, p.first_name, p.last_name, p.position, p.is_goalie, p.skill_tier_reported, p.skill_tier_assigned,
                    p.sandbagging_flag, p.years_experience, r.age, r.payment_status, ro.registration_id
               FROM {$wpdb->prefix}grsh_rosters ro
               JOIN {$wpdb->prefix}grsh_players p ON p.id = ro.player_id
          LEFT JOIN {$wpdb->prefix}grsh_registrations r ON r.id = ro.registration_id
              WHERE ro.season_id = %d AND ro.team_id IN ($ph)
           ORDER BY ro.draft_pick ASC, p.last_name ASC, p.first_name ASC",
            array_merge( [ $sid ], $team_ids )
        ), ARRAY_A ) ?: [];
        $by = [];
        foreach ( $rows as $r ) {
            if ( empty( $r['position'] ) && ! empty( $r['position_assigned'] ) ) { $r['position'] = $r['position_assigned']; }
            $pl = self::fmt_player( $r );
            $pl['roster_id']       = (int) $r['roster_id'];
            $pl['is_captain']      = (bool) $r['is_captain'];
            $pl['assignment_type'] = (string) $r['assignment_type'];
            $pl['draft_round']     = $r['draft_round'] ? (int) $r['draft_round'] : null;
            $pl['draft_pick']      = $r['draft_pick'] ? (int) $r['draft_pick'] : null;
            $by[ (int) $r['team_id'] ][] = $pl;
        }
        return $by;
    }

    /** Add returning_seasons to a list of players (one query). */
    private static function with_history( array $players ): array {
        global $wpdb;
        if ( ! $players ) { return $players; }
        $ids  = implode( ',', array_map( function ( $p ) { return (int) $p['id']; }, $players ) );
        $hist = $wpdb->get_results(
            "SELECT h.player_id, s.season_year FROM {$wpdb->prefix}grsh_player_history h
               JOIN {$wpdb->prefix}grsh_seasons s ON s.id = h.season_id
              WHERE h.player_id IN ($ids)", ARRAY_A
        ) ?: [];
        $by = [];
        foreach ( $hist as $h ) { $by[ (int) $h['player_id'] ][] = (int) $h['season_year']; }
        foreach ( $players as &$p ) {
            $y = array_values( array_unique( $by[ $p['id'] ] ?? [] ) );
            rsort( $y );
            $p['returning_seasons'] = $y;
        }
        unset( $p );
        return $players;
    }

    private static function pins_get( string $div ): array {
        $p = get_option( self::PINS_OPT . $div, [] );
        return is_array( $p ) ? $p : [];
    }

    private static function plans_get( string $div ): array {
        $p = get_option( self::PLANS_OPT . $div, [] );
        return is_array( $p ) ? $p : [];
    }

    private static function fb_get( string $div ): array {
        $p = get_option( self::FB_OPT . $div, [] );
        return is_array( $p ) ? $p : [];
    }

    /** Division overview for the tabs: planned teams, players, % assigned. */
    private static function divisions_overview( int $sid ): array {
        global $wpdb;
        $out    = [];
        $assigned = [];
        $rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT t.division, COUNT(ro.id) AS n FROM {$wpdb->prefix}grsh_teams t
          LEFT JOIN {$wpdb->prefix}grsh_rosters ro ON ro.team_id = t.id
              WHERE t.season_id = %d AND t.team_type = 'draft' GROUP BY t.division", $sid
        ), ARRAY_A ) ?: [];
        foreach ( $rows as $r ) { $assigned[ $r['division'] ] = (int) $r['n']; }
        $teams = [];
        $trows = $wpdb->get_results( $wpdb->prepare(
            "SELECT division, COUNT(*) AS n FROM {$wpdb->prefix}grsh_teams WHERE season_id = %d AND team_type = 'draft' GROUP BY division", $sid
        ), ARRAY_A ) ?: [];
        foreach ( $trows as $r ) { $teams[ $r['division'] ] = (int) $r['n']; }
        foreach ( self::known_divisions( $sid ) as $key ) {
            $cfg  = self::division_cfg( $key );
            $pool = count( self::pool( $sid, $key ) );
            $a    = $assigned[ $key ] ?? 0;
            $tot  = $a + $pool;
            $out[] = [ 'key' => $key, 'label' => $cfg['label'], 'teams' => $teams[ $key ] ?? 0,
                       'assigned' => $a, 'total' => $tot, 'pct' => $tot > 0 ? (int) round( $a / $tot * 100 ) : 0 ];
        }
        return $out;
    }

    // -------------------------------------------------------------------------
    // Metrics + publish gate (same math as the Draft page and GRSH_Scoring)
    // -------------------------------------------------------------------------

    /** @return array [ team_id => [ n, avg_raw, norm, parity, band, goalies ] ] */
    private static function team_metrics( array $teams ): array {
        $rows = [];
        foreach ( $teams as $t ) {
            $sc = array_map( [ __CLASS__, 'score' ], $t['players'] );
            $n  = count( $sc );
            $rows[ $t['id'] ] = [
                'n' => $n, 'avg_raw' => $n ? array_sum( $sc ) / $n : null,
                'goalies' => count( array_filter( $t['players'], function ( $p ) { return $p['is_goalie']; } ) ),
            ];
        }
        $with = array_filter( $rows, function ( $r ) { return $r['avg_raw'] !== null; } );
        $div_avg = $with ? array_sum( array_column( $with, 'avg_raw' ) ) / count( $with ) : null;
        foreach ( $rows as $id => &$r ) {
            if ( $r['avg_raw'] === null ) {
                $r['norm'] = null; $r['parity'] = null; $r['band'] = 'none';
            } else {
                $r['norm']   = round( $r['avg_raw'] / GRSH_Scoring::MAX_PLAYER_SCORE * 100, 1 );
                $r['parity'] = GRSH_Scoring::relative_parity_score( $r['avg_raw'], $div_avg );
                $r['band']   = GRSH_Scoring::parity_action( $r['parity'] );
            }
        }
        unset( $r );
        return $rows;
    }

    private static function pin_violations( array $pins, array $teams ): array {
        $where = [];
        foreach ( $teams as $t ) { foreach ( $t['players'] as $p ) { $where[ $p['id'] ] = $t['id']; } }
        $bad = [];
        foreach ( $pins as $pin ) {
            $a = $where[ $pin['a'] ] ?? null; $b = $where[ $pin['b'] ] ?? null;
            if ( $a === null || $b === null ) { continue; }
            if ( $pin['type'] === 'together' && $a !== $b ) { $bad[] = $pin; }
            if ( $pin['type'] === 'apart' && $a === $b )    { $bad[] = $pin; }
        }
        return $bad;
    }

    /** Checks shown before Committee Review / Publish. level: ok | warn | fail (fail blocks publishing). */
    private static function gate( array $cfg, array $teams, array $pool, array $pins, array $meta, array $fb ): array {
        $g = [];
        $n = count( $teams );
        if ( $n < 2 ) {
            $g[] = [ 'key' => 'teams', 'level' => 'fail', 'text' => $n === 0 ? 'No teams yet — add teams for this division.' : 'Only one team — a division needs at least two.' ];
            return $g;
        }
        $g[] = [ 'key' => 'teams', 'level' => 'ok', 'text' => $n . ' teams' ];
        $m = self::team_metrics( $teams );

        $nog = [];
        $many = [];
        $small = [];
        $big = [];
        foreach ( $teams as $t ) {
            $r = $m[ $t['id'] ];
            if ( $r['goalies'] < $cfg['goalie_min'] ) { $nog[] = $t['name']; }
            if ( $r['goalies'] > $cfg['goalie_max'] ) { $many[] = $t['name']; }
            if ( $r['n'] < $cfg['min_roster'] ) { $small[] = $t['name'] . ' (' . $r['n'] . ')'; }
            if ( $r['n'] > $cfg['max_roster'] ) { $big[] = $t['name'] . ' (' . $r['n'] . ')'; }
        }
        $g[] = $nog ? [ 'key' => 'goalies', 'level' => 'fail', 'text' => 'Needs a goalie: ' . implode( ', ', $nog ) ]
                    : [ 'key' => 'goalies', 'level' => 'ok', 'text' => 'Every team has a goalie' ];
        if ( $many ) { $g[] = [ 'key' => 'goalies_max', 'level' => 'warn', 'text' => 'More than ' . $cfg['goalie_max'] . ' goalies: ' . implode( ', ', $many ) ]; }
        if ( $small ) { $g[] = [ 'key' => 'min', 'level' => 'warn', 'text' => 'Below the ' . $cfg['min_roster'] . '-player minimum: ' . implode( ', ', $small ) ]; }
        if ( $big )   { $g[] = [ 'key' => 'max', 'level' => 'warn', 'text' => 'Above the ' . $cfg['max_roster'] . '-player maximum: ' . implode( ', ', $big ) ]; }
        if ( $pool )  { $g[] = [ 'key' => 'pool', 'level' => 'warn', 'text' => count( $pool ) . ' player' . ( count( $pool ) === 1 ? '' : 's' ) . ' not on a team yet' ]; }

        $off = [];
        foreach ( $teams as $t ) { if ( in_array( $m[ $t['id'] ]['band'], [ 'review', 'rebalance' ], true ) ) { $off[] = $t['name'] . ' (' . $m[ $t['id'] ]['band'] . ')'; } }
        $g[] = $off ? [ 'key' => 'parity', 'level' => 'warn', 'text' => 'Balance outside the target band: ' . implode( ', ', $off ) ]
                    : [ 'key' => 'parity', 'level' => 'ok', 'text' => 'Teams are balanced' ];

        $unpaid = 0; $flags = 0;
        foreach ( $teams as $t ) { foreach ( $t['players'] as $p ) {
            if ( $p['payment_status'] !== 'paid' ) { $unpaid++; }
            if ( $p['sandbagging_flag'] ) { $flags++; }
        } }
        if ( $unpaid ) { $g[] = [ 'key' => 'unpaid', 'level' => 'warn', 'text' => $unpaid . ' rostered player' . ( $unpaid === 1 ? ' has' : 's have' ) . ' not paid' ]; }
        if ( $flags )  { $g[] = [ 'key' => 'flags', 'level' => 'warn', 'text' => $flags . ' sandbagging flag' . ( $flags === 1 ? '' : 's' ) . ' on rostered players' ]; }

        $bad = self::pin_violations( $pins, $teams );
        if ( $bad ) { $g[] = [ 'key' => 'pins', 'level' => 'warn', 'text' => count( $bad ) . ' keep-together / keep-apart rule' . ( count( $bad ) === 1 ? ' is' : 's are' ) . ' broken' ]; }

        $unlocked = array_filter( $teams, function ( $t ) { return ! $t['locked']; } );
        $g[] = $unlocked ? [ 'key' => 'locked', 'level' => 'fail', 'text' => 'Lock every team before publishing (' . count( $unlocked ) . ' still open)' ]
                         : [ 'key' => 'locked', 'level' => 'ok', 'text' => 'All teams locked' ];

        if ( $meta['review_key'] ) {
            $approved = [];
            foreach ( $fb as $f ) { if ( $f['action'] === 'approve' && $f['team_id'] ) { $approved[ (int) $f['team_id'] ] = true; } }
            $c = count( array_intersect_key( $approved, array_flip( array_map( function ( $t ) { return $t['id']; }, $teams ) ) ) );
            $g[] = [ 'key' => 'review', 'level' => $c >= $n ? 'ok' : 'warn', 'text' => 'Committee approvals: ' . $c . ' of ' . $n . ' teams' ];
        }
        return $g;
    }

    // -------------------------------------------------------------------------
    // Payload
    // -------------------------------------------------------------------------

    private static function payload( string $div ): array {
        $sid   = self::season_id();
        $cfg   = self::division_cfg( $div );
        $rows  = self::teams_rows( $sid, $div );
        $by    = self::roster_players( $sid, array_map( function ( $t ) { return (int) $t['id']; }, $rows ) );
        $pool  = self::pool( $sid, $div );
        $meta  = self::meta_get( $div );
        $fb    = self::fb_get( $div );

        $teams = array_map( function ( $t ) use ( $by ) {
            return [
                'id' => (int) $t['id'], 'name' => $t['name'], 'colour' => $t['colour'] ?: '#666666',
                'locked' => (bool) $t['draft_locked'], 'draft_order' => $t['draft_order'] !== null ? (int) $t['draft_order'] : null,
                'captain_player_id' => $t['captain_player_id'] ? (int) $t['captain_player_id'] : null,
                'players' => $by[ (int) $t['id'] ] ?? [],
            ];
        }, $rows );

        // history for everyone shown (pool + rostered) in one query
        $all = $pool;
        foreach ( $teams as $t ) { foreach ( $t['players'] as $p ) { $all[] = $p; } }
        $hist_by = [];
        foreach ( self::with_history( array_map( function ( $p ) { return [ 'id' => $p['id'] ]; }, $all ) ) as $h ) { $hist_by[ $h['id'] ] = $h['returning_seasons']; }
        foreach ( $pool as &$p ) { $p['returning_seasons'] = $hist_by[ $p['id'] ] ?? []; }
        unset( $p );
        foreach ( $teams as &$t ) { foreach ( $t['players'] as &$p ) { $p['returning_seasons'] = $hist_by[ $p['id'] ] ?? []; } unset( $p ); }
        unset( $t );

        // pins that still point at players in this division
        $valid = [];
        foreach ( $all as $p ) { $valid[ $p['id'] ] = true; }
        $pins = array_values( array_filter( self::pins_get( $div ), function ( $pin ) use ( $valid ) { return isset( $valid[ $pin['a'] ], $valid[ $pin['b'] ] ); } ) );

        $plans = array_map( function ( $pl ) {
            return [ 'id' => $pl['id'], 'name' => $pl['name'], 'created_at' => $pl['created_at'], 'by' => $pl['by'], 'count' => count( $pl['assign'] ) ];
        }, self::plans_get( $div ) );

        $locked_all = $teams && ! array_filter( $teams, function ( $t ) { return ! $t['locked']; } );
        $stage = $meta['published_at'] ? 'published' : ( $locked_all ? 'locked' : ( $meta['review_key'] ? 'review' : 'draft' ) );

        $approvals = [];
        foreach ( $fb as $f ) {
            if ( $f['action'] === 'approve' && $f['team_id'] ) { $approvals[ (int) $f['team_id'] ][] = $f['name']; }
        }

        return [
            'season_id' => $sid,
            'divisions' => self::divisions_overview( $sid ),
            'division' => $div, 'division_label' => $cfg['label'],
            'config' => [ 'min_roster' => $cfg['min_roster'], 'max_roster' => $cfg['max_roster'], 'goalie_min' => $cfg['goalie_min'], 'goalie_max' => $cfg['goalie_max'], 'planned_teams' => $cfg['teams'] ],
            'max_player_score' => GRSH_Scoring::MAX_PLAYER_SCORE,
            'parity' => [ 'rebalance_low' => GRSH_Scoring::PARITY_REBALANCE_LOW, 'review_low' => GRSH_Scoring::PARITY_REVIEW_LOW,
                          'review_high' => GRSH_Scoring::PARITY_REVIEW_HIGH, 'rebalance_high' => GRSH_Scoring::PARITY_REBALANCE_HIGH ],
            'draft_status' => self::draft_status( $div ),
            'teams' => $teams, 'pool' => $pool, 'pins' => $pins, 'plans' => $plans,
            'stage' => $stage,
            'gate' => self::gate( $cfg, $teams, $pool, $pins, $meta, $fb ),
            'review' => [ 'active' => (bool) $meta['review_key'], 'url' => $meta['review_key'] ? add_query_arg( 'grsh_roster_review', $meta['review_key'], home_url( '/' ) ) : '',
                          'approvals' => $approvals, 'comments' => array_values( array_filter( $fb, function ( $f ) { return $f['action'] === 'comment'; } ) ) ],
            'published' => [ 'at' => $meta['published_at'], 'url' => $meta['pub_key'] ? add_query_arg( 'grsh_roster_pub', $meta['pub_key'], home_url( '/' ) ) : '', 'result' => $meta['publish_result'] ],
        ];
    }

    private static function out( string $div, array $extra = [], int $status = 200 ): WP_REST_Response {
        return new WP_REST_Response( array_merge( self::payload( $div ), $extra ), $status );
    }

    // -------------------------------------------------------------------------
    // GET /rosters
    // -------------------------------------------------------------------------

    public static function get_rosters( WP_REST_Request $request ): WP_REST_Response {
        $div = self::resolve_div( $request->get_param( 'division' ) );
        if ( is_wp_error( $div ) ) { return self::wp_err( $div ); }
        return self::out( $div );
    }

    // -------------------------------------------------------------------------
    // Teams
    // -------------------------------------------------------------------------

    private static function team_row( int $id ): ?array {
        global $wpdb;
        $r = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}grsh_teams WHERE id = %d", $id ), ARRAY_A );
        return $r ?: null;
    }

    private static function name_taken( int $sid, string $div, string $name, int $except = 0 ): bool {
        global $wpdb;
        return (bool) $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}grsh_teams WHERE season_id = %d AND division = %s AND team_type = 'draft' AND LOWER(name) = LOWER(%s) AND id <> %d LIMIT 1",
            $sid, $div, $name, $except
        ) );
    }

    public static function create_team( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $body = $request->get_json_params() ?: [];
        $div  = self::resolve_div( $body['division'] ?? '' );
        if ( is_wp_error( $div ) ) { return self::wp_err( $div ); }
        if ( ! in_array( $div, self::DIV_ENUM, true ) ) { return self::err( 'That division can\'t hold teams.' ); }
        if ( $g = self::draft_guard( $div ) ) { return self::wp_err( $g ); }
        $name = trim( sanitize_text_field( (string) ( $body['name'] ?? '' ) ) );
        if ( $name === '' ) { return self::err( 'Team name is required.' ); }
        $name = function_exists( 'mb_substr' ) ? mb_substr( $name, 0, 100 ) : substr( $name, 0, 100 );
        $sid = self::season_id();
        if ( self::name_taken( $sid, $div, $name ) ) { return self::err( 'A team with that name already exists in this division.', 409 ); }
        $colour = sanitize_hex_color( (string) ( $body['colour'] ?? '#666666' ) ) ?: '#666666';
        $order  = 1 + (int) $wpdb->get_var( $wpdb->prepare( "SELECT COALESCE(MAX(draft_order),0) FROM {$wpdb->prefix}grsh_teams WHERE season_id = %d AND division = %s AND team_type = 'draft'", $sid, $div ) );
        $ok = $wpdb->insert( "{$wpdb->prefix}grsh_teams", [ 'season_id' => $sid, 'division' => $div, 'team_type' => 'draft', 'name' => $name, 'colour' => $colour, 'draft_order' => min( 255, $order ), 'draft_locked' => 0 ] );
        if ( $ok === false ) { return self::err( 'Could not create the team.', 500 ); }
        $new_id = (int) $wpdb->insert_id;   // capture before the audit insert overwrites it
        self::audit( 'roster_team_created', $new_id, [ 'division' => $div, 'name' => $name ] );
        return self::out( $div, [ 'created_id' => $new_id ], 201 );
    }

    public static function update_team( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $id   = (int) $request->get_param( 'id' );
        $team = self::team_row( $id );
        if ( ! $team ) { return self::err( 'Team not found.', 404 ); }
        $div  = (string) $team['division'];
        $body = $request->get_json_params() ?: [];
        $data = [];
        if ( array_key_exists( 'name', $body ) ) {
            $name = trim( sanitize_text_field( (string) $body['name'] ) );
            if ( $name === '' ) { return self::err( 'Team name can\'t be empty.' ); }
            $name = function_exists( 'mb_substr' ) ? mb_substr( $name, 0, 100 ) : substr( $name, 0, 100 );
            if ( self::name_taken( (int) $team['season_id'], $div, $name, $id ) ) { return self::err( 'A team with that name already exists in this division.', 409 ); }
            $data['name'] = $name;
        }
        if ( array_key_exists( 'colour', $body ) ) { $data['colour'] = sanitize_hex_color( (string) $body['colour'] ) ?: '#666666'; }
        if ( array_key_exists( 'draft_locked', $body ) ) { $data['draft_locked'] = $body['draft_locked'] ? 1 : 0; }
        if ( array_key_exists( 'draft_order', $body ) ) { $data['draft_order'] = max( 1, min( 255, (int) $body['draft_order'] ) ); }
        if ( ! $data ) { return self::err( 'Nothing to update.' ); }
        if ( isset( $data['name'] ) || isset( $data['draft_order'] ) ) {
            if ( $g = self::draft_guard( $div ) ) { return self::wp_err( $g ); }
        }
        $wpdb->update( "{$wpdb->prefix}grsh_teams", $data, [ 'id' => $id ] );
        self::audit( 'roster_team_updated', $id, $data );
        return self::out( $div );
    }

    public static function delete_team( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $id   = (int) $request->get_param( 'id' );
        $team = self::team_row( $id );
        if ( ! $team ) { return self::err( 'Team not found.', 404 ); }
        $div = (string) $team['division'];
        if ( $g = self::draft_guard( $div ) ) { return self::wp_err( $g ); }
        if ( (int) $team['draft_locked'] === 1 ) { return self::err( 'Unlock the team before deleting it.', 409 ); }
        $n = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->prefix}grsh_rosters WHERE team_id = %d", $id ) );
        if ( $n > 0 && ! $request->get_param( 'force' ) ) {
            return self::err( 'This team has ' . $n . ' player' . ( $n === 1 ? '' : 's' ) . '. Deleting it sends them back to the pool.', 409, [ 'players' => $n ] );
        }
        $res = self::with_lock( function () use ( $wpdb, $id ) {
            $wpdb->delete( "{$wpdb->prefix}grsh_rosters", [ 'team_id' => $id ] );
            $wpdb->delete( "{$wpdb->prefix}grsh_teams", [ 'id' => $id ] );
            return true;
        } );
        if ( is_wp_error( $res ) ) { return self::wp_err( $res ); }
        self::audit( 'roster_team_deleted', $id, [ 'division' => $div, 'name' => $team['name'], 'players_returned' => $n ] );
        return self::out( $div );
    }

    // -------------------------------------------------------------------------
    // Moves (the one write path for player placement)
    // -------------------------------------------------------------------------

    /**
     * @param array $moves [ [player_id, team_id|null], ... ]
     * @return array|WP_Error  [ moved, skipped ]
     */
    private static function apply_moves( string $div, array $moves, string $type, string $note ) {
        global $wpdb;
        if ( $g = self::draft_guard( $div ) ) { return $g; }
        $sid   = self::season_id();
        $teams = [];
        foreach ( self::teams_rows( $sid, $div ) as $t ) { $teams[ (int) $t['id'] ] = $t; }
        if ( ! $teams ) { return new WP_Error( 'no_teams', 'This division has no teams yet.', [ 'status' => 400 ] ); }

        $cur = [];  // player_id => [roster_id, team_id, is_captain]
        $ph  = implode( ',', array_fill( 0, count( $teams ), '%d' ) );
        foreach ( $wpdb->get_results( $wpdb->prepare(
            "SELECT id, team_id, player_id, is_captain FROM {$wpdb->prefix}grsh_rosters WHERE season_id = %d AND team_id IN ($ph)",
            array_merge( [ $sid ], array_keys( $teams ) )
        ), ARRAY_A ) ?: [] as $r ) {
            $cur[ (int) $r['player_id'] ] = [ 'roster_id' => (int) $r['id'], 'team_id' => (int) $r['team_id'], 'is_captain' => (int) $r['is_captain'] ];
        }
        $pool_players = [];
        foreach ( self::pool( $sid, $div ) as $p ) { $pool_players[ $p['id'] ] = $p; }

        $plan = [];
        foreach ( $moves as $m ) {
            $pid = absint( $m['player_id'] ?? 0 );
            $tid = ( isset( $m['team_id'] ) && $m['team_id'] !== null && $m['team_id'] !== '' ) ? absint( $m['team_id'] ) : null;
            if ( ! $pid ) { return new WP_Error( 'bad_move', 'Each move needs a player_id.', [ 'status' => 400 ] ); }
            if ( ! isset( $cur[ $pid ] ) && ! isset( $pool_players[ $pid ] ) ) {
                return new WP_Error( 'bad_player', 'Player ' . $pid . ' isn\'t part of this division\'s pool or rosters.', [ 'status' => 400 ] );
            }
            if ( $tid !== null && ! isset( $teams[ $tid ] ) ) { return new WP_Error( 'bad_team', 'Team ' . $tid . ' isn\'t in this division.', [ 'status' => 400 ] ); }
            $plan[ $pid ] = $tid;  // last move for a player wins
        }

        $todo = [];
        $skipped = 0;
        foreach ( $plan as $pid => $tid ) {
            $from = $cur[ $pid ]['team_id'] ?? null;
            if ( $from === $tid ) { $skipped++; continue; }
            if ( $from !== null && (int) $teams[ $from ]['draft_locked'] === 1 ) {
                return new WP_Error( 'locked', $teams[ $from ]['name'] . ' is locked. Unlock it to move players off it.', [ 'status' => 409 ] );
            }
            if ( $tid !== null && (int) $teams[ $tid ]['draft_locked'] === 1 ) {
                return new WP_Error( 'locked', $teams[ $tid ]['name'] . ' is locked. Unlock it to add players.', [ 'status' => 409 ] );
            }
            $todo[ $pid ] = [ $from, $tid ];
        }
        if ( ! $todo ) { return [ 'moved' => 0, 'skipped' => $skipped ]; }

        // registration ids for anyone being placed
        $place_ids = array_keys( array_filter( $todo, function ( $x ) { return $x[1] !== null; } ) );
        $reg = [];
        if ( $place_ids ) {
            $in = implode( ',', array_map( 'intval', $place_ids ) );
            foreach ( $wpdb->get_results( $wpdb->prepare(
                "SELECT player_id, id FROM {$wpdb->prefix}grsh_registrations WHERE season_id = %d AND status <> 'rejected' AND player_id IN ($in) ORDER BY id DESC", $sid
            ), ARRAY_A ) ?: [] as $r ) {
                if ( ! isset( $reg[ (int) $r['player_id'] ] ) ) { $reg[ (int) $r['player_id'] ] = (int) $r['id']; }
            }
        }

        $res = self::with_lock( function () use ( $wpdb, $todo, $cur, $teams, $pool_players, $reg, $sid, $type ) {
            $wpdb->query( 'START TRANSACTION' );
            foreach ( $todo as $pid => $mv ) {
                list( $from, $to ) = $mv;
                if ( $from !== null ) {
                    $wpdb->delete( "{$wpdb->prefix}grsh_rosters", [ 'id' => $cur[ $pid ]['roster_id'] ] );
                    if ( (int) $teams[ $from ]['captain_player_id'] === $pid ) {
                        $wpdb->update( "{$wpdb->prefix}grsh_teams", [ 'captain_player_id' => null ], [ 'id' => $from ] );
                    }
                }
                if ( $to !== null ) {
                    $p = $pool_players[ $pid ] ?? null;
                    if ( $p === null ) {
                        $row = $wpdb->get_row( $wpdb->prepare( "SELECT position, skill_tier_assigned, skill_tier_reported FROM {$wpdb->prefix}grsh_players WHERE id = %d", $pid ), ARRAY_A ) ?: [];
                        $pos = $row['position'] ?? null; $tier = ( $row['skill_tier_assigned'] ?? '' ) ?: ( $row['skill_tier_reported'] ?? '' );
                    } else {
                        $pos = $p['position']; $tier = $p['skill_tier_assigned'] ?: $p['skill_tier_reported'];
                    }
                    $ok = $wpdb->insert( "{$wpdb->prefix}grsh_rosters", [
                        'season_id' => $sid, 'team_id' => $to, 'player_id' => $pid, 'registration_id' => $reg[ $pid ] ?? 0,
                        'assignment_type' => $type, 'is_captain' => 0, 'is_alternate' => 0,
                        'position_assigned' => in_array( $pos, [ 'defenseman', 'center', 'winger', 'goaltender' ], true ) ? $pos : null,
                        'skill_tier_at_draft' => $tier ?: null,
                        'assigned_by' => get_current_user_id(), 'assigned_at' => current_time( 'mysql' ),
                    ] );
                    if ( $ok === false ) {
                        $err = $wpdb->last_error;
                        $wpdb->query( 'ROLLBACK' );
                        return new WP_Error( 'db', 'Could not save the move' . ( $err ? ' (' . $err . ')' : '' ) . '. Nothing was changed.', [ 'status' => 500 ] );
                    }
                }
            }
            $wpdb->query( 'COMMIT' );
            return true;
        } );
        if ( is_wp_error( $res ) ) { return $res; }
        self::audit( 'roster_moves', null, [ 'division' => $div, 'moved' => count( $todo ), 'type' => $type ], $note );
        return [ 'moved' => count( $todo ), 'skipped' => $skipped ];
    }

    private static function run_moves( string $div, array $moves, string $type, string $note ): WP_REST_Response {
        $r = self::apply_moves( $div, $moves, $type, $note );
        if ( is_wp_error( $r ) ) { return self::wp_err( $r ); }
        return self::out( $div, [ 'move_result' => $r ] );
    }

    public static function post_moves( WP_REST_Request $request ): WP_REST_Response {
        $body  = $request->get_json_params() ?: [];
        $div   = self::resolve_div( $body['division'] ?? '' );
        if ( is_wp_error( $div ) ) { return self::wp_err( $div ); }
        $moves = isset( $body['moves'] ) && is_array( $body['moves'] ) ? array_slice( $body['moves'], 0, 400 ) : [];
        if ( ! $moves ) { return self::err( 'No moves given.' ); }
        $type = ( $body['type'] ?? '' ) === 'auto' ? 'auto' : 'manual';
        return self::run_moves( $div, $moves, $type, sanitize_text_field( (string) ( $body['note'] ?? '' ) ) );
    }

    /** Legacy single assign: { player_id, team_id }. */
    public static function assign_player( WP_REST_Request $request ): WP_REST_Response {
        $body = $request->get_json_params() ?: [];
        $team = self::team_row( absint( $body['team_id'] ?? 0 ) );
        if ( ! $team || empty( $body['player_id'] ) ) { return self::err( 'player_id and a valid team_id are required.' ); }
        return self::run_moves( (string) $team['division'], [ [ 'player_id' => (int) $body['player_id'], 'team_id' => (int) $team['id'] ] ], 'manual', 'assign' );
    }

    public static function remove_player( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $row = $wpdb->get_row( $wpdb->prepare(
            "SELECT ro.player_id, t.division FROM {$wpdb->prefix}grsh_rosters ro JOIN {$wpdb->prefix}grsh_teams t ON t.id = ro.team_id WHERE ro.id = %d",
            (int) $request->get_param( 'roster_id' )
        ), ARRAY_A );
        if ( ! $row ) { return self::err( 'That roster entry no longer exists.', 404 ); }
        return self::run_moves( (string) $row['division'], [ [ 'player_id' => (int) $row['player_id'], 'team_id' => null ] ], 'manual', 'unassign' );
    }

    public static function set_captain( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $body = $request->get_json_params() ?: [];
        $team = self::team_row( absint( $body['team_id'] ?? 0 ) );
        $pid  = absint( $body['player_id'] ?? 0 );
        if ( ! $team || ! $pid ) { return self::err( 'team_id and player_id are required.' ); }
        $div = (string) $team['division'];
        if ( (int) $team['draft_locked'] === 1 ) { return self::err( 'Unlock the team to change its captain.', 409 ); }
        $on = (int) $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}grsh_rosters WHERE team_id = %d AND player_id = %d", (int) $team['id'], $pid ) );
        if ( ! $on ) { return self::err( 'That player isn\'t on this team.' ); }
        $res = self::with_lock( function () use ( $wpdb, $team, $pid ) {
            $wpdb->update( "{$wpdb->prefix}grsh_rosters", [ 'is_captain' => 0 ], [ 'team_id' => (int) $team['id'] ] );
            $wpdb->update( "{$wpdb->prefix}grsh_rosters", [ 'is_captain' => 1 ], [ 'team_id' => (int) $team['id'], 'player_id' => $pid ] );
            $wpdb->update( "{$wpdb->prefix}grsh_teams", [ 'captain_player_id' => $pid ], [ 'id' => (int) $team['id'] ] );
            return true;
        } );
        if ( is_wp_error( $res ) ) { return self::wp_err( $res ); }
        self::audit( 'roster_captain', (int) $team['id'], [ 'player_id' => $pid ] );
        return self::out( $div );
    }

    // -------------------------------------------------------------------------
    // Pins
    // -------------------------------------------------------------------------

    public static function save_pins( WP_REST_Request $request ): WP_REST_Response {
        $body = $request->get_json_params() ?: [];
        $div  = self::resolve_div( $body['division'] ?? '' );
        if ( is_wp_error( $div ) ) { return self::wp_err( $div ); }
        $pins = []; $seen = [];
        foreach ( (array) ( $body['pins'] ?? [] ) as $p ) {
            $a = absint( $p['a'] ?? 0 ); $b = absint( $p['b'] ?? 0 );
            $type = ( $p['type'] ?? '' ) === 'apart' ? 'apart' : ( ( $p['type'] ?? '' ) === 'together' ? 'together' : '' );
            if ( ! $a || ! $b || $a === $b || $type === '' ) { continue; }
            $k = min( $a, $b ) . '-' . max( $a, $b );
            if ( isset( $seen[ $k ] ) ) { continue; }
            $seen[ $k ] = true;
            $pins[] = [ 'a' => $a, 'b' => $b, 'type' => $type ];
        }
        if ( count( $pins ) > self::MAX_PINS ) { return self::err( 'Too many rules (max ' . self::MAX_PINS . ').' ); }
        update_option( self::PINS_OPT . $div, $pins, false );
        self::audit( 'roster_pins', null, [ 'division' => $div, 'count' => count( $pins ) ] );
        return self::out( $div );
    }

    // -------------------------------------------------------------------------
    // Plans (named snapshots)
    // -------------------------------------------------------------------------

    private static function current_assign( string $div ): array {
        $sid = self::season_id();
        $teams = self::teams_rows( $sid, $div );
        $by = self::roster_players( $sid, array_map( function ( $t ) { return (int) $t['id']; }, $teams ) );
        $map = [];
        foreach ( $by as $tid => $players ) { foreach ( $players as $p ) { $map[ $p['id'] ] = (int) $tid; } }
        return $map;
    }

    public static function save_plan( WP_REST_Request $request ): WP_REST_Response {
        $body = $request->get_json_params() ?: [];
        $div  = self::resolve_div( $body['division'] ?? '' );
        if ( is_wp_error( $div ) ) { return self::wp_err( $div ); }
        $name = trim( sanitize_text_field( (string) ( $body['name'] ?? '' ) ) );
        if ( $name === '' ) { $name = 'Plan ' . current_time( 'M j, g:ia' ); }
        $name = function_exists( 'mb_substr' ) ? mb_substr( $name, 0, 60 ) : substr( $name, 0, 60 );
        $assign = self::current_assign( $div );
        if ( ! $assign ) { return self::err( 'Nothing to save — no players are on teams yet.' ); }
        $u = wp_get_current_user();
        $plans = self::plans_get( $div );
        $plans[] = [ 'id' => bin2hex( random_bytes( 6 ) ), 'name' => $name, 'created_at' => current_time( 'mysql' ), 'by' => ( $u && $u->exists() ) ? $u->display_name : '', 'assign' => $assign ];
        $plans = array_slice( $plans, -self::MAX_PLANS );
        update_option( self::PLANS_OPT . $div, $plans, false );
        self::audit( 'roster_plan_saved', null, [ 'division' => $div, 'name' => $name, 'players' => count( $assign ) ] );
        return self::out( $div );
    }

    public static function delete_plan( WP_REST_Request $request ): WP_REST_Response {
        $div = self::resolve_div( $request->get_param( 'division' ) );
        if ( is_wp_error( $div ) ) { return self::wp_err( $div ); }
        $id = (string) $request->get_param( 'plan_id' );
        $plans = array_values( array_filter( self::plans_get( $div ), function ( $p ) use ( $id ) { return $p['id'] !== $id; } ) );
        update_option( self::PLANS_OPT . $div, $plans, false );
        return self::out( $div );
    }

    public static function restore_plan( WP_REST_Request $request ): WP_REST_Response {
        $body = $request->get_json_params() ?: [];
        $div  = self::resolve_div( $body['division'] ?? '' );
        if ( is_wp_error( $div ) ) { return self::wp_err( $div ); }
        $id = sanitize_text_field( (string) ( $body['plan_id'] ?? '' ) );
        $plan = null;
        foreach ( self::plans_get( $div ) as $p ) { if ( $p['id'] === $id ) { $plan = $p; } }
        if ( ! $plan ) { return self::err( 'That plan no longer exists.', 404 ); }

        $sid   = self::season_id();
        $teams = [];
        foreach ( self::teams_rows( $sid, $div ) as $t ) { $teams[ (int) $t['id'] ] = true; }
        $cur   = self::current_assign( $div );
        $pool  = [];
        foreach ( self::pool( $sid, $div ) as $p ) { $pool[ $p['id'] ] = true; }

        $moves = []; $skipped = 0;
        foreach ( $cur as $pid => $tid ) {
            if ( ! isset( $plan['assign'][ $pid ] ) || ! isset( $teams[ (int) $plan['assign'][ $pid ] ] ) ) { $moves[] = [ 'player_id' => $pid, 'team_id' => null ]; }
        }
        foreach ( $plan['assign'] as $pid => $tid ) {
            $pid = (int) $pid;
            if ( ! isset( $teams[ (int) $tid ] ) || ( ! isset( $cur[ $pid ] ) && ! isset( $pool[ $pid ] ) ) ) { $skipped++; continue; }
            $moves[] = [ 'player_id' => $pid, 'team_id' => (int) $tid ];
        }
        $r = self::apply_moves( $div, $moves, 'manual', 'restore plan: ' . $plan['name'] );
        if ( is_wp_error( $r ) ) { return self::wp_err( $r ); }
        $r['skipped'] += $skipped;
        return self::out( $div, [ 'move_result' => $r ] );
    }

    // -------------------------------------------------------------------------
    // Committee review link + feedback
    // -------------------------------------------------------------------------

    public static function toggle_review( WP_REST_Request $request ): WP_REST_Response {
        $body = $request->get_json_params() ?: [];
        $div  = self::resolve_div( $body['division'] ?? '' );
        if ( is_wp_error( $div ) ) { return self::wp_err( $div ); }
        $meta = self::meta_get( $div );
        if ( ! empty( $body['enable'] ) ) {
            if ( ! $meta['review_key'] ) {
                $meta['review_key'] = bin2hex( random_bytes( 12 ) );
                update_option( 'grsh_roster_review_' . $meta['review_key'], $div, false );
            }
        } else {
            if ( $meta['review_key'] ) { delete_option( 'grsh_roster_review_' . $meta['review_key'] ); }
            $meta['review_key'] = '';
        }
        self::meta_save( $div, $meta );
        self::audit( 'roster_review_link', null, [ 'division' => $div, 'active' => (bool) $meta['review_key'] ] );
        return self::out( $div );
    }

    public static function review_feedback( WP_REST_Request $request ): WP_REST_Response {
        $body = $request->get_json_params() ?: [];
        $key  = sanitize_text_field( (string) ( $body['key'] ?? '' ) );
        if ( ! preg_match( '/^[a-f0-9]{24}$/', $key ) ) { return self::err( 'This review link isn\'t valid.', 404 ); }
        $div = get_option( 'grsh_roster_review_' . $key );
        if ( ! $div ) { return self::err( 'This review link is no longer active.', 404 ); }
        $div = (string) $div;

        $ip   = 'grsh_rfb_' . md5( $_SERVER['REMOTE_ADDR'] ?? 'x' );
        $hits = (int) get_transient( $ip );
        if ( $hits >= 20 ) { return self::err( 'Too many submissions — please try again later.', 429 ); }
        set_transient( $ip, $hits + 1, HOUR_IN_SECONDS );

        $name   = trim( wp_strip_all_tags( (string) ( $body['name'] ?? '' ) ) );
        $text   = trim( wp_strip_all_tags( (string) ( $body['text'] ?? '' ) ) );
        $action = ( $body['action'] ?? '' ) === 'approve' ? 'approve' : 'comment';
        $tid    = absint( $body['team_id'] ?? 0 );
        $name   = function_exists( 'mb_substr' ) ? mb_substr( $name, 0, 80 ) : substr( $name, 0, 80 );
        $text   = function_exists( 'mb_substr' ) ? mb_substr( $text, 0, 500 ) : substr( $text, 0, 500 );
        if ( $name === '' ) { return self::err( 'Please enter your name.' ); }
        if ( $action === 'comment' && $text === '' ) { return self::err( 'Please write a comment.' ); }
        if ( $tid ) {
            $ok = false;
            foreach ( self::teams_rows( self::season_id(), $div ) as $t ) { if ( (int) $t['id'] === $tid ) { $ok = true; } }
            if ( ! $ok ) { return self::err( 'Unknown team.' ); }
        }
        $fb = self::fb_get( $div );
        if ( $action === 'approve' ) {
            $fb = array_values( array_filter( $fb, function ( $f ) use ( $tid, $name ) { return ! ( $f['action'] === 'approve' && (int) $f['team_id'] === $tid && strtolower( $f['name'] ) === strtolower( $name ) ); } ) );
        }
        $fb[] = [ 'id' => bin2hex( random_bytes( 4 ) ), 'team_id' => $tid, 'action' => $action, 'name' => $name, 'text' => $text, 'at' => current_time( 'mysql' ) ];
        $fb = array_slice( $fb, -self::MAX_FB );
        update_option( self::FB_OPT . $div, $fb, false );
        self::audit( 'roster_review_feedback', $tid ?: null, [ 'division' => $div, 'action' => $action, 'by' => $name ] );
        return new WP_REST_Response( [ 'ok' => true ], 200 );
    }

    // -------------------------------------------------------------------------
    // Publish
    // -------------------------------------------------------------------------

    public static function publish( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $body = $request->get_json_params() ?: [];
        $div  = self::resolve_div( $body['division'] ?? '' );
        if ( is_wp_error( $div ) ) { return self::wp_err( $div ); }
        if ( $g = self::draft_guard( $div ) ) { return self::wp_err( $g ); }
        $p = self::payload( $div );
        $fails = array_values( array_filter( $p['gate'], function ( $c ) { return $c['level'] === 'fail'; } ) );
        if ( $fails ) { return self::err( 'Fix these before publishing: ' . implode( ' ', array_column( $fails, 'text' ) ), 409, [ 'gate' => $p['gate'] ] ); }
        $meta = self::meta_get( $div );
        if ( $meta['published_at'] && empty( $body['resend'] ) ) { return self::err( 'Already published ' . $meta['published_at'] . '. Use resend to email everyone again.', 409 ); }
        if ( ! $meta['pub_key'] ) { $meta['pub_key'] = bin2hex( random_bytes( 12 ) ); }
        update_option( 'grsh_roster_pub_' . $meta['pub_key'], $div, false );
        $url = add_query_arg( 'grsh_roster_pub', $meta['pub_key'], home_url( '/' ) );

        $team_of = [];
        foreach ( $p['teams'] as $t ) { foreach ( $t['players'] as $pl ) { $team_of[ $pl['id'] ] = $t['name']; } }
        $emails = $team_of ? $wpdb->get_results( "SELECT id, first_name, email FROM {$wpdb->prefix}grsh_players WHERE id IN (" . implode( ',', array_map( 'intval', array_keys( $team_of ) ) ) . ')', ARRAY_A ) : [];
        $sent = 0; $failed = 0; $skipped = 0;
        foreach ( (array) $emails as $e ) {
            if ( $sent + $failed >= self::MAX_EMAILS || ! is_email( $e['email'] ) ) { $skipped++; continue; }
            $ok = wp_mail( $e['email'], 'Gold Rush ' . $p['division_label'] . ": you're on " . $team_of[ (int) $e['id'] ],
                '<p>Hi ' . esc_html( $e['first_name'] ) . ',</p><p>Rosters are set and you are on <strong>' . esc_html( $team_of[ (int) $e['id'] ] ) . '</strong>.</p>'
                . '<p>See every roster: <a href="' . esc_url( $url ) . '">' . esc_html( $url ) . '</a></p><p>Gold Rush Senior Hockey</p>',
                [ 'Content-Type: text/html; charset=UTF-8' ] );
            $ok ? $sent++ : $failed++;
        }
        $meta['published_at']   = current_time( 'mysql' );
        $meta['publish_result'] = [ 'sent' => $sent, 'failed' => $failed, 'skipped' => $skipped ];
        self::meta_save( $div, $meta );
        self::audit( 'roster_published', null, [ 'division' => $div ] + $meta['publish_result'] );
        return self::out( $div, [ 'publish_result' => $meta['publish_result'] ] );
    }

    /** Dry run only: which published rosters line up with existing SportsPress teams/players. Writes nothing. */
    public static function sportspress_preview( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $div = self::resolve_div( $request->get_param( 'division' ) );
        if ( is_wp_error( $div ) ) { return self::wp_err( $div ); }
        if ( ! post_type_exists( 'sp_team' ) ) { return new WP_REST_Response( [ 'available' => false ], 200 ); }
        $p = self::payload( $div );
        $find = function ( string $type, string $title ) use ( $wpdb ) {
            return (int) $wpdb->get_var( $wpdb->prepare(
                "SELECT ID FROM {$wpdb->posts} WHERE post_type = %s AND post_status IN ('publish','draft','pending','future','private') AND LOWER(post_title) = LOWER(%s) LIMIT 1", $type, $title
            ) );
        };
        $out = []; $miss_teams = 0; $miss_players = 0;
        foreach ( $p['teams'] as $t ) {
            $tid = $find( 'sp_team', $t['name'] );
            if ( ! $tid ) { $miss_teams++; }
            $pl_out = [];
            foreach ( $t['players'] as $pl ) {
                $pid = $find( 'sp_player', trim( $pl['first_name'] . ' ' . $pl['last_name'] ) );
                if ( ! $pid ) { $miss_players++; }
                $pl_out[] = [ 'name' => trim( $pl['first_name'] . ' ' . $pl['last_name'] ), 'matched' => (bool) $pid ];
            }
            $out[] = [ 'team' => $t['name'], 'matched' => (bool) $tid, 'players' => $pl_out ];
        }
        return new WP_REST_Response( [ 'available' => true, 'dry_run' => true, 'teams' => $out, 'unmatched_teams' => $miss_teams, 'unmatched_players' => $miss_players ], 200 );
    }

    // -------------------------------------------------------------------------
    // Public pages (token only, no emails, no payment/age/flags)
    // -------------------------------------------------------------------------

    public static function handle_landing(): void {
        if ( is_admin() ) { return; }
        if ( ! empty( $_GET['grsh_roster_review'] ) ) {
            $key = sanitize_text_field( wp_unslash( $_GET['grsh_roster_review'] ) );
            if ( preg_match( '/^[a-f0-9]{24}$/', $key ) && ( $div = get_option( 'grsh_roster_review_' . $key ) ) ) { self::review_page( (string) $div, $key ); }
        }
        if ( ! empty( $_GET['grsh_roster_pub'] ) ) {
            $key = sanitize_text_field( wp_unslash( $_GET['grsh_roster_pub'] ) );
            if ( preg_match( '/^[a-f0-9]{24}$/', $key ) && ( $div = get_option( 'grsh_roster_pub_' . $key ) ) ) { self::pub_page( (string) $div ); }
        }
    }

    private static function shell_start( string $title ): void {
        nocache_headers();
        status_header( 200 );
        header( 'Content-Type: text/html; charset=UTF-8' );
        echo '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
           . '<meta name="robots" content="noindex,nofollow"><title>' . esc_html( $title ) . '</title>'
           . '<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f5f0;margin:0;padding:16px;color:#1a1a2e}'
           . '.card{background:#fff;border-radius:14px;padding:16px;margin:0 auto 12px;max-width:680px;box-shadow:0 4px 18px rgba(0,0,0,.07)}'
           . 'h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:0 0 8px}.m{color:#555566;font-size:14px}'
           . '.row{display:flex;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid #f0eee8;font-size:15px}.row b{flex:1;font-weight:600}'
           . 'button{font-size:14px;font-weight:700;background:#1a1a2e;color:#D4A017;border:0;border-radius:8px;padding:8px 12px;cursor:pointer}button.alt{background:#fff;color:#1a1a2e;border:1px solid #e2e0d8}'
           . 'input,textarea{font-size:16px;padding:8px;border:1px solid #e2e0d8;border-radius:8px;width:100%;box-sizing:border-box;margin:4px 0}'
           . '.pill{font-size:12px;font-weight:700;border-radius:99px;padding:2px 9px}</style></head><body>';
    }

    private static function pub_page( string $div ): void {
        $p = self::payload( $div );
        self::shell_start( $p['division_label'] . ' rosters' );
        echo '<div class="card"><h1>' . esc_html( $p['division_label'] ) . ' — rosters</h1><div class="m">Gold Rush Senior Hockey</div></div>';
        foreach ( $p['teams'] as $t ) {
            echo '<div class="card"><h2 style="color:' . esc_attr( $t['colour'] ) . '">' . esc_html( $t['name'] ) . '</h2>';
            foreach ( $t['players'] as $pl ) {
                $pos = $pl['position'] ? ( $pl['position'] === 'goaltender' ? 'Goalie' : ucfirst( $pl['position'] ) ) : '';
                echo '<div class="row"><b>' . esc_html( $pl['first_name'] . ' ' . $pl['last_name'] ) . ( $pl['is_captain'] ? ' (C)' : '' ) . '</b><span class="m">' . esc_html( $pos ) . '</span></div>';
            }
            echo '</div>';
        }
        echo '</body></html>';
        exit;
    }

    private static function review_page( string $div, string $key ): void {
        $p = self::payload( $div );
        $m = self::team_metrics( $p['teams'] );
        self::shell_start( $p['division_label'] . ' roster review' );
        $api = esc_url( rest_url( 'grsh/v1/rosters/review/feedback' ) );
        echo '<div class="card"><h1>' . esc_html( $p['division_label'] ) . ' — committee review</h1>'
           . '<div class="m">Look over each team, then approve it or leave a comment. Balance bands use the same scoring as the admin board.</div>'
           . '<label class="m" style="display:block;margin-top:10px">Your name</label><input id="nm" maxlength="80" placeholder="Your name"><div id="msg" class="m" role="status"></div></div>';
        $bands = [ 'balanced' => [ '#DCFCE7', '#166534', 'Balanced' ], 'review' => [ '#FEF3C7', '#92400E', 'Review' ], 'rebalance' => [ '#FEE2E2', '#991B1B', 'Rebalance' ], 'none' => [ '#F3F4F6', '#555566', '—' ] ];
        foreach ( $p['teams'] as $t ) {
            $r = $m[ $t['id'] ]; $b = $bands[ $r['band'] ];
            echo '<div class="card"><h2 style="color:' . esc_attr( $t['colour'] ) . '">' . esc_html( $t['name'] )
               . ' <span class="pill" style="background:' . esc_attr( $b[0] ) . ';color:' . esc_attr( $b[1] ) . '">' . esc_html( $b[2] ) . '</span></h2>'
               . '<div class="m">' . (int) $r['n'] . ' players · average score ' . ( $r['norm'] === null ? '—' : esc_html( (string) $r['norm'] ) ) . ' · goalies ' . (int) $r['goalies'] . '</div>';
            foreach ( $t['players'] as $pl ) {
                $pos = $pl['position'] ? ( $pl['position'] === 'goaltender' ? 'Goalie' : ucfirst( $pl['position'] ) ) : '';
                $tier = $pl['skill_tier_assigned'] ?: $pl['skill_tier_reported'];
                echo '<div class="row"><b>' . esc_html( $pl['first_name'] . ' ' . $pl['last_name'] ) . ( $pl['is_captain'] ? ' (C)' : '' ) . '</b><span class="m">' . esc_html( $pos ) . '</span><span class="m">' . esc_html( (string) $tier ) . '</span></div>';
            }
            echo '<textarea id="tx' . (int) $t['id'] . '" rows="2" maxlength="500" placeholder="Comment (optional for approve)"></textarea>'
               . '<button onclick="send(' . (int) $t['id'] . ',\'approve\')">Approve</button> <button class="alt" onclick="send(' . (int) $t['id'] . ',\'comment\')">Send comment</button></div>';
        }
        echo '<script>var API=' . wp_json_encode( $api ) . ',KEY=' . wp_json_encode( $key ) . ';'
           . 'function send(t,a){var n=document.getElementById("nm").value.trim(),x=document.getElementById("tx"+t).value;var m=document.getElementById("msg");'
           . 'if(!n){m.textContent="Please enter your name first.";return}'
           . 'fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:KEY,team_id:t,action:a,name:n,text:x})})'
           . '.then(function(r){return r.json()}).then(function(d){m.textContent=d.error?d.error:"Thanks — recorded.";if(!d.error){document.getElementById("tx"+t).value=""}})'
           . '.catch(function(){m.textContent="Network problem — nothing was saved."})}</script></body></html>';
        exit;
    }
}
