<?php
/**
 * GRSH_Dashboard — one honest read endpoint for the Dashboard page.
 *
 * GET  /grsh/v1/dashboard                 everything the page shows, computed from the database (no mock values)
 * POST /grsh/v1/dashboard/tournament-date  { date: "YYYY-MM-DD" | "" } — stored in its own option, never invented
 *
 * Every metric comes back as a pair (have / of) so the page can say "7 of 7 paid" instead of a bare percentage,
 * and as null when it cannot be measured (no teams yet, no registrations yet) so the page shows "—", never 0% or NaN.
 * PHP 7.4 compatible. No schema changes.
 *
 * @package GRSH_Tournament_Manager
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class GRSH_Dashboard {

    const DATE_OPT   = 'grsh_tournament_date';
    const DRAFT_OPT  = 'grsh_draft_state_';
    const META_OPT   = 'grsh_roster_meta_';
    const ACTIVITY_N = 8;

    /** Registration statuses that no longer count toward the tournament. */
    private static $inactive = [ 'withdrawn', 'waitlist' ];
    /** Statuses that mean "the committee has approved this player" (or a later step). */
    private static $approved = [ 'approved', 'draft_eligible', 'assigned' ];
    /** Payment statuses that mean "nothing more to collect". */
    private static $settled  = [ 'paid', 'waived' ];

    private static $colours = [
        'gold_open' => '#D4A017', '45a' => '#2196a8', 'senior_b' => '#7B5EA7', 'senior_c' => '#B05E3A', 'womens' => '#B8336A',
    ];

    public static function register_hooks(): void {
        add_action( 'rest_api_init', [ __CLASS__, 'register_routes' ] );
    }

    public static function register_routes(): void {
        $p = [ __CLASS__, 'permission' ];
        register_rest_route( 'grsh/v1', '/dashboard', [ 'methods' => 'GET', 'callback' => [ __CLASS__, 'get_dashboard' ], 'permission_callback' => $p ] );
        register_rest_route( 'grsh/v1', '/dashboard/tournament-date', [ 'methods' => 'POST', 'callback' => [ __CLASS__, 'set_date' ], 'permission_callback' => $p ] );
    }

    public static function permission(): bool {
        return current_user_can( 'manage_options' ) || current_user_can( 'grsh_committee' );
    }

    // -------------------------------------------------------------------------

    private static function season_id(): int {
        global $wpdb;
        $year = class_exists( 'GRSH_Sync_Engine' ) ? GRSH_Sync_Engine::SEASON : (int) gmdate( 'Y' );
        $id   = (int) $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}grsh_seasons WHERE season_year = %d LIMIT 1", $year ) );
        return $id ?: 1;
    }

    private static function season_year(): int {
        return class_exists( 'GRSH_Sync_Engine' ) ? (int) GRSH_Sync_Engine::SEASON : (int) gmdate( 'Y' );
    }

    private static function settings(): array {
        return class_exists( 'GRSH_Settings' ) ? (array) GRSH_Settings::get() : [];
    }

    /** Settings divisions that are switched on, keyed by division key. */
    private static function division_cfgs( array $settings ): array {
        $out = [];
        foreach ( (array) ( $settings['divisions'] ?? [] ) as $d ) {
            if ( empty( $d['key'] ) || empty( $d['enabled'] ) ) { continue; }
            $out[ (string) $d['key'] ] = [
                'key' => (string) $d['key'], 'label' => (string) ( $d['label'] ?? $d['key'] ),
                'teams' => (int) ( $d['teams'] ?? 0 ), 'min_roster' => (int) ( $d['min_roster'] ?? 0 ),
                'max_roster' => (int) ( $d['max_roster'] ?? 0 ), 'goalie_min' => (int) ( $d['goalie_min'] ?? 1 ),
            ];
        }
        return $out;
    }

    /** "YYYY-MM-DD" only; anything else is ignored rather than guessed at. */
    private static function clean_date( $v ): string {
        $v = trim( (string) $v );
        if ( $v === '' ) { return ''; }
        $d = DateTime::createFromFormat( '!Y-m-d', substr( $v, 0, 10 ) );
        return ( $d && $d->format( 'Y-m-d' ) === substr( $v, 0, 10 ) ) ? $d->format( 'Y-m-d' ) : '';
    }

    private static function tier_letter( $assigned, $reported ): string {
        $t = strtoupper( trim( (string) ( $assigned ?: $reported ) ) );
        $f = $t === '' ? '' : $t[0];
        return in_array( $f, [ 'A', 'B', 'C', 'R' ], true ) ? $f : '?';
    }

    private static function pair( int $have, int $of ): ?array {
        return $of > 0 ? [ 'have' => $have, 'of' => $of ] : null;
    }

    // -------------------------------------------------------------------------
    // GET /dashboard
    // -------------------------------------------------------------------------

    public static function get_dashboard( WP_REST_Request $request ): WP_REST_Response {
        return new WP_REST_Response( self::payload(), 200 );
    }

    public static function payload(): array {
        global $wpdb;
        $sid      = self::season_id();
        $year     = self::season_year();
        $settings = self::settings();
        $cfgs     = self::division_cfgs( $settings );

        // ── registrations joined to players, aggregated here so the maths is easy to test ──
        $rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT r.id AS reg_id, r.player_id, r.player_type, r.status, r.payment_status,
                    COALESCE(r.division_assigned, r.division_requested) AS div_key,
                    p.first_name, p.last_name, p.position, p.is_goalie, p.skill_tier_assigned, p.skill_tier_reported, p.sandbagging_flag
               FROM {$wpdb->prefix}grsh_registrations r
               JOIN {$wpdb->prefix}grsh_players p ON p.id = r.player_id
              WHERE r.season_id = %d", $sid
        ), ARRAY_A ) ?: [];

        $divs = [];
        $ensure = function ( string $k ) use ( &$divs, $cfgs ) {
            if ( ! isset( $divs[ $k ] ) ) {
                $c = $cfgs[ $k ] ?? null;
                $divs[ $k ] = [
                    'key' => $k, 'label' => $c ? $c['label'] : ucwords( str_replace( '_', ' ', $k ) ),
                    'color' => self::$colours[ $k ] ?? '#666666', 'configured' => (bool) $c,
                    'registered' => 0, 'paid' => 0, 'unpaid' => 0, 'approved' => 0, 'subs' => 0, 'goalies' => 0,
                    'tiers' => [ 'A' => 0, 'B' => 0, 'C' => 0, 'R' => 0, '?' => 0 ],
                    'planned_teams' => $c ? $c['teams'] : 0, 'min_needed' => $c ? $c['teams'] * $c['min_roster'] : 0, 'capacity' => $c ? $c['teams'] * $c['max_roster'] : 0,
                    'teams' => 0, 'rostered' => 0, 'teams_ready' => 0, 'locked' => 0, 'draft_status' => 'ready', 'stage' => 'draft', 'published_at' => '',
                ];
            }
        };
        foreach ( $cfgs as $k => $c ) { $ensure( $k ); }

        $tot = [ 'active' => 0, 'settled' => 0, 'approved' => 0, 'subs' => 0, 'goalies' => 0, 'pending_pay' => 0 ];
        $flags = [];
        foreach ( $rows as $r ) {
            if ( in_array( $r['status'], self::$inactive, true ) ) { continue; }
            $k = (string) ( $r['div_key'] ?: 'unassigned' );
            $ensure( $k );
            if ( $r['player_type'] === 'sub' ) { $divs[ $k ]['subs']++; $tot['subs']++; continue; }
            $isg = ( $r['position'] === 'goaltender' || (int) $r['is_goalie'] === 1 );
            $divs[ $k ]['registered']++; $tot['active']++;
            if ( in_array( $r['payment_status'], self::$settled, true ) ) { $divs[ $k ]['paid']++; $tot['settled']++; } else { $divs[ $k ]['unpaid']++; $tot['pending_pay']++; }
            if ( in_array( $r['status'], self::$approved, true ) ) { $divs[ $k ]['approved']++; $tot['approved']++; }
            if ( $isg ) { $divs[ $k ]['goalies']++; $tot['goalies']++; }
            $divs[ $k ]['tiers'][ self::tier_letter( $r['skill_tier_assigned'], $r['skill_tier_reported'] ) ]++;
            if ( (int) $r['sandbagging_flag'] === 1 && count( $flags ) < 10 ) {
                $flags[] = [ 'id' => (int) $r['player_id'], 'player' => trim( $r['first_name'] . ' ' . $r['last_name'] ), 'tier' => (string) ( $r['skill_tier_assigned'] ?: $r['skill_tier_reported'] ), 'division' => $k ];
            }
        }
        $flag_total = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->prefix}grsh_registrations r JOIN {$wpdb->prefix}grsh_players p ON p.id = r.player_id
              WHERE r.season_id = %d AND p.sandbagging_flag = 1 AND r.status NOT IN ('withdrawn','waitlist')", $sid
        ) );

        // ── teams + who is on them ──
        $trows = $wpdb->get_results( $wpdb->prepare(
            "SELECT t.id, t.division, t.draft_locked,
                    COUNT(ro.id) AS n,
                    SUM(CASE WHEN p.position = 'goaltender' OR p.is_goalie = 1 THEN 1 ELSE 0 END) AS g
               FROM {$wpdb->prefix}grsh_teams t
          LEFT JOIN {$wpdb->prefix}grsh_rosters ro ON ro.team_id = t.id
          LEFT JOIN {$wpdb->prefix}grsh_players p ON p.id = ro.player_id
              WHERE t.season_id = %d AND t.team_type = 'draft'
           GROUP BY t.id, t.division, t.draft_locked", $sid
        ), ARRAY_A ) ?: [];
        $teams_total = 0; $teams_ready = 0;
        foreach ( $trows as $t ) {
            $k = (string) $t['division']; $ensure( $k );
            $c = $cfgs[ $k ] ?? [ 'min_roster' => 0, 'goalie_min' => 1 ];
            $divs[ $k ]['teams']++; $divs[ $k ]['rostered'] += (int) $t['n']; $teams_total++;
            if ( (int) $t['draft_locked'] === 1 ) { $divs[ $k ]['locked']++; }
            if ( (int) $t['n'] >= max( 1, (int) $c['min_roster'] ) && (int) $t['g'] >= (int) $c['goalie_min'] ) { $divs[ $k ]['teams_ready']++; $teams_ready++; }
        }
        foreach ( $divs as $k => &$d ) {
            $st = get_option( self::DRAFT_OPT . $k, [] );
            $d['draft_status'] = ( is_array( $st ) && ! empty( $st['status'] ) ) ? (string) $st['status'] : 'ready';
            $meta = get_option( self::META_OPT . $k, [] );
            $d['published_at'] = ( is_array( $meta ) && ! empty( $meta['published_at'] ) ) ? (string) $meta['published_at'] : '';
            $d['stage'] = $d['published_at'] ? 'published' : ( $d['teams'] > 0 && $d['locked'] === $d['teams'] ? 'locked' : 'draft' );
        }
        unset( $d );

        // ── clock, last sync, activity ──
        $now = (string) $wpdb->get_var( 'SELECT CURRENT_TIMESTAMP' );
        $last = $wpdb->get_row(
            "SELECT created_at, action, user_display FROM {$wpdb->prefix}grsh_audit_logs WHERE action IN ('player_imported','sync_failed') ORDER BY id DESC LIMIT 1", ARRAY_A
        );
        $fail_cut = gmdate( 'Y-m-d H:i:s', strtotime( $now . ' UTC' ) - 7 * 86400 );
        $fails = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->prefix}grsh_audit_logs WHERE action = 'sync_failed' AND created_at >= %s", $fail_cut
        ) );
        $act = $wpdb->get_results( $wpdb->prepare(
            "SELECT id, action, user_display, notes, created_at FROM {$wpdb->prefix}grsh_audit_logs
              WHERE season_id IN (%d, %d) OR season_id IS NULL ORDER BY id DESC LIMIT %d", $sid, $year, self::ACTIVITY_N
        ), ARRAY_A ) ?: [];

        // ── dates ──
        $date  = self::clean_date( get_option( self::DATE_OPT, '' ) );
        $miles = [];
        foreach ( [ 'registration_opens' => 'Registration opens', 'registration_closes' => 'Registration closes', 'draft_date' => 'Draft day' ] as $k => $label ) {
            $dd = self::clean_date( $settings[ $k ] ?? '' );
            if ( $dd ) { $miles[] = [ 'key' => $k, 'label' => $label, 'date' => $dd ]; }
        }
        if ( $date ) { $miles[] = [ 'key' => 'tournament', 'label' => 'Tournament', 'date' => $date ]; }
        usort( $miles, function ( $a, $b ) { return strcmp( $a['date'], $b['date'] ); } );

        $need = 0; $cap = 0;
        foreach ( $cfgs as $c ) { $need += $c['teams'] * $c['min_roster']; $cap += $c['teams'] * $c['max_roster']; }

        $div_list = array_values( $divs );
        usort( $div_list, function ( $a, $b ) use ( $cfgs ) {
            $ka = array_search( $a['key'], array_keys( $cfgs ), true ); $kb = array_search( $b['key'], array_keys( $cfgs ), true );
            return ( $ka === false ? 99 : $ka ) <=> ( $kb === false ? 99 : $kb );
        } );

        return [
            'season' => [ 'id' => $sid, 'year' => $year, 'label' => (string) ( $settings['season_label'] ?? ( 'Gold Rush ' . $year ) ), 'status' => (string) ( $settings['status'] ?? '' ) ],
            'server_now' => $now,
            'tournament_date' => $date,
            'milestones' => $miles,
            'totals' => [
                'registered' => $tot['active'], 'alternates' => $tot['subs'], 'goalies' => $tot['goalies'],
                'unpaid' => $tot['pending_pay'], 'sandbagging_flags' => $flag_total,
            ],
            // each metric: { have, of } or null when it cannot be measured yet
            'metrics' => [
                'registration' => $need > 0 ? [ 'have' => $tot['active'], 'of' => $need, 'room' => max( 0, $cap - $tot['active'] ), 'capacity' => $cap ] : null,
                'payments'     => self::pair( $tot['settled'], $tot['active'] ),
                'approvals'    => self::pair( $tot['approved'], $tot['active'] ),
                'rosters'      => self::pair( $teams_ready, $teams_total ),
            ],
            'divisions' => $div_list,
            'flags' => $flags,
            'last_sync' => $last ? [ 'at' => (string) $last['created_at'], 'ok' => $last['action'] === 'player_imported', 'by' => (string) $last['user_display'] ] : null,
            'sync_failures_7d' => $fails,
            'activity' => array_map( function ( $a ) {
                return [ 'id' => (int) $a['id'], 'action' => (string) $a['action'], 'by' => (string) $a['user_display'], 'notes' => (string) $a['notes'], 'at' => (string) $a['created_at'] ];
            }, $act ),
        ];
    }

    // -------------------------------------------------------------------------
    // POST /dashboard/tournament-date
    // -------------------------------------------------------------------------

    public static function set_date( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $body = $request->get_json_params() ?: [];
        $raw  = trim( (string) ( $body['date'] ?? '' ) );
        $date = self::clean_date( $raw );
        if ( $raw !== '' && $date === '' ) {
            return new WP_REST_Response( [ 'error' => 'Use the format YYYY-MM-DD, for example 2027-04-09.' ], 400 );
        }
        update_option( self::DATE_OPT, $date, false );
        $u = wp_get_current_user();
        $wpdb->insert( "{$wpdb->prefix}grsh_audit_logs", [
            'season_id' => self::season_id(), 'wp_user_id' => get_current_user_id() ?: 0,
            'user_display' => ( $u && $u->exists() ) ? $u->display_name : 'Committee',
            'action' => 'tournament_date_set', 'object_type' => 'season', 'object_id' => null,
            'after_value' => wp_json_encode( [ 'date' => $date ] ), 'notes' => $date === '' ? 'Tournament date cleared' : 'Tournament date set to ' . $date,
        ] );
        return new WP_REST_Response( self::payload(), 200 );
    }
}
