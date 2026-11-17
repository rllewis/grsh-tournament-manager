<?php
/**
 * GRSH Reports Tools — the live data behind the Reports page.
 *
 * GET    /reports/overview        one call: reconciled KPIs, divisions, teams, payments, issues, forecast, history
 * GET    /reports/export?id=      CSV for one report (JSON {filename, csv, rows}); the page turns it into a download
 * POST   /reports/reminders       {send:false} previews, {send:true} emails unpaid players (7-day cooldown, max 100)
 * POST   /reports/fee             {fee} sets the per-player registration fee (blank clears it)
 * POST   /reports/share           {days} creates a read-only, expiring, numbers-only link
 * GET    /reports/shares          lists active links (never the token)
 * DELETE /reports/share/{id}      revokes a link
 * GET    /reports/shared/{token}  PUBLIC: the read-only page behind a share link (aggregate numbers only, no names)
 *
 * Rules this file keeps: a number that cannot be measured is null (the page shows "—"); every count is over
 * primary, active registrations (withdrawn and waitlist are out; subs are counted apart); the payment
 * breakdown always adds up to the registered total; nothing is sent, shared or changed without a POST.
 * Runs on PHP 7.4 — no match, str_contains or nullsafe.
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

class GRSH_Reports_Tools {

    const FEE_OPT      = 'grsh_player_fee';
    const SNAP_OPT     = 'grsh_reports_snapshots';
    const REMIND_OPT   = 'grsh_pay_reminders';
    const SHARE_OPT    = 'grsh_reports_shares';
    const COOLDOWN     = 604800;   // 7 days between reminders to the same player
    const MAX_SEND     = 100;
    const SNAP_KEEP    = 60;
    const SNAP_EVERY   = 21600;    // snapshot at most every 6 hours
    const SINCE_MIN    = 72000;    // "since last time" compares with a snapshot at least 20 hours old
    const MAX_SHARES   = 5;
    const UNPAID_CAP   = 500;

    /** Registration statuses that no longer count toward the tournament. */
    private static $inactive = [ 'withdrawn', 'waitlist' ];
    private static $colours  = [ 'gold_open' => '#D4A017', '45a' => '#2196a8', 'senior_b' => '#7B5EA7', 'senior_c' => '#B05E3A', 'womens' => '#B8336A' ];

    const EXPORTS = [
        'players'   => [ 'Player pool',     'Every active registration: contact, division, payment, tier, age' ],
        'unpaid'    => [ 'Unpaid players',  'Who still owes, how long, and whether they were reminded' ],
        'parity'    => [ 'Parity report',   'Each team: skill, age, parity score, goalies and recommendation' ],
        'goalies'   => [ 'Goalie summary',  'Each team and who covers it, plus goalies not yet placed' ],
        'divisions' => [ 'Division summary', 'Registered, paid, capacity, minimum and goalie counts per division' ],
        'audit'     => [ 'Audit log',       'The last 1,000 admin actions this season' ],
    ];

    public static function register_hooks(): void {
        add_action( 'rest_api_init', [ __CLASS__, 'register_routes' ] );
    }

    public static function register_routes(): void {
        $ns = 'grsh/v1';
        $p  = [ __CLASS__, 'permission' ];
        register_rest_route( $ns, '/reports/overview',  [ 'methods' => WP_REST_Server::READABLE,  'callback' => [ __CLASS__, 'get_overview' ],  'permission_callback' => $p ] );
        register_rest_route( $ns, '/reports/export',    [ 'methods' => WP_REST_Server::READABLE,  'callback' => [ __CLASS__, 'get_export' ],    'permission_callback' => $p ] );
        register_rest_route( $ns, '/reports/reminders', [ 'methods' => WP_REST_Server::CREATABLE, 'callback' => [ __CLASS__, 'post_reminders' ], 'permission_callback' => $p ] );
        register_rest_route( $ns, '/reports/fee',       [ 'methods' => WP_REST_Server::CREATABLE, 'callback' => [ __CLASS__, 'post_fee' ],       'permission_callback' => $p ] );
        register_rest_route( $ns, '/reports/share',     [ 'methods' => WP_REST_Server::CREATABLE, 'callback' => [ __CLASS__, 'post_share' ],     'permission_callback' => $p ] );
        register_rest_route( $ns, '/reports/shares',    [ 'methods' => WP_REST_Server::READABLE,  'callback' => [ __CLASS__, 'get_shares' ],     'permission_callback' => $p ] );
        register_rest_route( $ns, '/reports/share/(?P<id>[a-f0-9]{12})', [ 'methods' => WP_REST_Server::DELETABLE, 'callback' => [ __CLASS__, 'delete_share' ], 'permission_callback' => $p ] );
        register_rest_route( $ns, '/reports/shared/(?P<token>[a-f0-9]{32})', [ 'methods' => WP_REST_Server::READABLE, 'callback' => [ __CLASS__, 'get_shared' ], 'permission_callback' => [ __CLASS__, 'open' ] ] );
    }

    public static function permission(): bool { return current_user_can( 'manage_options' ) || current_user_can( 'grsh_committee' ); }
    /** The shared page is public on purpose; the unguessable token is the key and the page holds numbers only. */
    public static function open(): bool { return true; }

    // ── small helpers ─────────────────────────────────────────────────────────

    private static function season_year(): int { return class_exists( 'GRSH_Sync_Engine' ) ? (int) GRSH_Sync_Engine::SEASON : (int) gmdate( 'Y' ); }

    private static function season_id(): int {
        global $wpdb;
        $id = (int) $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}grsh_seasons WHERE season_year = %d LIMIT 1", self::season_year() ) );
        return $id ?: 1;
    }

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

    private static function audit( string $action, string $type, $object_id, array $after, string $notes ): void {
        global $wpdb;
        $u = wp_get_current_user();
        $wpdb->insert( "{$wpdb->prefix}grsh_audit_logs", [
            'season_id' => self::season_id(), 'wp_user_id' => get_current_user_id() ?: 0,
            'user_display' => ( $u && $u->exists() ) ? $u->display_name : 'Committee',
            'action' => $action, 'object_type' => $type, 'object_id' => $object_id,
            'after_value' => wp_json_encode( $after ), 'notes' => $notes,
        ] );
    }

    /** From header from Settings (empty = WordPress default). */
    private static function mail_headers(): array {
        return ( class_exists( 'GRSH_Settings' ) && method_exists( 'GRSH_Settings', 'mail_headers' ) ) ? GRSH_Settings::mail_headers() : [];
    }

    private static function money( $n ): string { return '$' . number_format( (float) $n, 2 ); }

    /** The per-player fee: the one the committee set, else the typical amount paid, else unknown (null). */
    public static function fee_info( array $paid_amounts = [] ): array {
        $set = get_option( self::FEE_OPT, '' );
        if ( $set !== '' && $set !== false && (float) $set > 0 ) { return [ 'fee' => round( (float) $set, 2 ), 'source' => 'set' ]; }
        $paid_amounts = array_values( array_filter( array_map( 'floatval', $paid_amounts ), function ( $a ) { return $a > 0; } ) );
        if ( $paid_amounts ) {
            sort( $paid_amounts );
            $n   = count( $paid_amounts );
            $mid = $n % 2 ? $paid_amounts[ ( $n - 1 ) / 2 ] : ( $paid_amounts[ $n / 2 - 1 ] + $paid_amounts[ $n / 2 ] ) / 2;
            return [ 'fee' => round( $mid, 2 ), 'source' => 'estimated' ];
        }
        return [ 'fee' => null, 'source' => null ];
    }

    // ── the one place the numbers are computed ────────────────────────────────

    public static function data( bool $record = false ): array {
        global $wpdb;
        $sid  = self::season_id();
        $year = self::season_year();
        $set  = class_exists( 'GRSH_Settings' ) ? (array) GRSH_Settings::get() : [];

        $cfgs = [];
        foreach ( (array) ( $set['divisions'] ?? [] ) as $d ) {
            if ( empty( $d['key'] ) || empty( $d['enabled'] ) ) { continue; }
            $cfgs[ (string) $d['key'] ] = [ 'label' => (string) ( $d['label'] ?? $d['key'] ), 'teams' => (int) ( $d['teams'] ?? 0 ), 'min' => (int) ( $d['min_roster'] ?? 0 ), 'max' => (int) ( $d['max_roster'] ?? 0 ) ];
        }

        $rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT r.id AS reg_id, r.player_id, r.player_type, r.status, r.payment_status, r.amount_paid, r.created_at, r.age,
                    COALESCE(r.division_assigned, r.division_requested) AS div_key,
                    p.first_name, p.last_name, p.email, p.position, p.is_goalie, p.skill_tier_assigned, p.skill_tier_reported, p.sandbagging_flag,
                    (SELECT COUNT(*) FROM {$wpdb->prefix}grsh_rosters ro WHERE ro.player_id = r.player_id AND ro.season_id = r.season_id) AS on_roster
               FROM {$wpdb->prefix}grsh_registrations r
               JOIN {$wpdb->prefix}grsh_players p ON p.id = r.player_id
              WHERE r.season_id = %d", $sid
        ), ARRAY_A ) ?: [];

        $divs = [];
        $ensure = function ( string $k ) use ( &$divs, $cfgs ) {
            if ( ! isset( $divs[ $k ] ) ) {
                $c = $cfgs[ $k ] ?? null;
                $divs[ $k ] = [
                    'key' => $k, 'label' => $c ? $c['label'] : ( $k === 'unassigned' ? 'No division' : ucwords( str_replace( '_', ' ', $k ) ) ),
                    'color' => self::$colours[ $k ] ?? '#666666', 'configured' => (bool) $c,
                    'registered' => 0, 'settled' => 0, 'paid' => 0, 'unpaid' => 0, 'subs' => 0, 'goalies' => 0, 'goalies_unplaced' => 0,
                    'planned_teams' => $c ? $c['teams'] : 0, 'min_needed' => $c ? $c['teams'] * $c['min'] : 0, 'capacity' => $c ? $c['teams'] * $c['max'] : 0,
                    'tiers' => [ 'A' => 0, 'B' => 0, 'C' => 0, 'R' => 0, '?' => 0 ], 'age' => [ 'n' => 0, 'min' => null, 'avg' => null, 'max' => null ],
                    'teams' => [], 'teams_count' => 0, 'avg_parity' => null,
                ];
            }
        };
        foreach ( $cfgs as $k => $c ) { $ensure( $k ); }

        $bd = [ 'paid' => 0, 'waived' => 0, 'pending' => 0, 'failed' => 0, 'refunded' => 0, 'other' => 0 ];
        $tot = [ 'registered' => 0, 'subs' => 0, 'inactive' => 0, 'goalies' => 0, 'goalies_unplaced' => 0, 'sandbagging' => 0, 'tier_unknown' => 0 ];
        $tiers = [ 'A' => 0, 'B' => 0, 'C' => 0, 'R' => 0, '?' => 0 ];
        $paid_amounts = []; $collected = 0.0; $unpaid_raw = []; $flags = []; $ages = []; $div_ages = []; $by_day = []; $unplaced_names = [];
        $last_reg = '';
        foreach ( $rows as $r ) {
            if ( in_array( $r['status'], self::$inactive, true ) ) { $tot['inactive']++; continue; }
            $k = (string) ( $r['div_key'] ?: 'unassigned' );
            $ensure( $k );
            if ( $r['player_type'] === 'sub' ) { $divs[ $k ]['subs']++; $tot['subs']++; continue; }
            $tot['registered']++; $divs[ $k ]['registered']++;
            $ps = (string) $r['payment_status'];
            if ( isset( $bd[ $ps ] ) ) { $bd[ $ps ]++; } else { $bd['other']++; }
            $amt = (float) $r['amount_paid'];
            if ( $ps === 'paid' ) { $collected += $amt; $paid_amounts[] = $amt; $divs[ $k ]['paid']++; }
            if ( $ps === 'paid' || $ps === 'waived' ) { $divs[ $k ]['settled']++; }
            if ( $ps === 'pending' || $ps === 'failed' ) {
                $divs[ $k ]['unpaid']++;
                $unpaid_raw[] = [ 'player_id' => (int) $r['player_id'], 'name' => trim( $r['first_name'] . ' ' . $r['last_name'] ), 'email' => (string) $r['email'], 'division' => $k, 'status' => $ps, 'paid_so_far' => $amt, 'created_at' => (string) $r['created_at'] ];
            }
            $isg = ( $r['position'] === 'goaltender' || (int) $r['is_goalie'] === 1 );
            if ( $isg ) {
                $divs[ $k ]['goalies']++; $tot['goalies']++;
                if ( (int) $r['on_roster'] === 0 ) { $divs[ $k ]['goalies_unplaced']++; $tot['goalies_unplaced']++; $unplaced_names[] = [ 'name' => trim( $r['first_name'] . ' ' . $r['last_name'] ), 'division' => $k ]; }
            }
            $t = self::tier_letter( $r['skill_tier_assigned'], $r['skill_tier_reported'] );
            $divs[ $k ]['tiers'][ $t ]++; $tiers[ $t ]++;
            if ( $t === '?' ) { $tot['tier_unknown']++; }
            if ( (int) $r['sandbagging_flag'] === 1 ) { $tot['sandbagging']++; if ( count( $flags ) < 10 ) { $flags[] = [ 'id' => (int) $r['player_id'], 'player' => trim( $r['first_name'] . ' ' . $r['last_name'] ), 'tier' => (string) ( $r['skill_tier_assigned'] ?: $r['skill_tier_reported'] ), 'division' => $k ]; } }
            $age = (int) $r['age'];
            if ( $age > 0 ) { $ages[] = $age; $div_ages[ $k ][] = $age; }
            $day = substr( (string) $r['created_at'], 0, 10 );
            if ( $day !== '' && $day !== '0000-00-00' ) { $by_day[ $day ] = ( $by_day[ $day ] ?? 0 ) + 1; if ( $day > $last_reg ) { $last_reg = $day; } }
        }
        foreach ( $div_ages as $k => $list ) {
            $divs[ $k ]['age'] = [ 'n' => count( $list ), 'min' => min( $list ), 'avg' => round( array_sum( $list ) / count( $list ), 1 ), 'max' => max( $list ) ];
        }

        // ── payments: the breakdown always adds up ──
        $fee = self::fee_info( $paid_amounts );
        $unpaid = [];
        $owed = 0.0;
        $remind = (array) get_option( self::REMIND_OPT, [] );
        $now = time();
        foreach ( $unpaid_raw as $u ) {
            $due = $fee['fee'] === null ? null : max( 0.0, $fee['fee'] - $u['paid_so_far'] );
            if ( $due !== null ) { $owed += $due; }
            $ts = strtotime( $u['created_at'] . ' UTC' );
            $last = isset( $remind[ $u['player_id'] ] ) ? (int) $remind[ $u['player_id'] ] : 0;
            $unpaid[] = [ 'player_id' => $u['player_id'], 'name' => $u['name'], 'division' => $u['division'], 'status' => $u['status'], 'owes' => $due === null ? null : round( $due, 2 ),
                'days_waiting' => $ts ? max( 0, (int) floor( ( $now - $ts ) / 86400 ) ) : null, 'has_email' => is_email( $u['email'] ) ? true : false,
                'reminded_at' => $last ? gmdate( 'c', $last ) : null, 'can_remind' => is_email( $u['email'] ) && ( $now - $last ) >= self::COOLDOWN ];
        }
        usort( $unpaid, function ( $a, $b ) { return ( $b['days_waiting'] ?? -1 ) <=> ( $a['days_waiting'] ?? -1 ); } );
        $n_unpaid = $bd['pending'] + $bd['failed'];
        $reg = $tot['registered'];
        $payments = [
            'breakdown' => $bd, 'registered' => $reg, 'adds_up' => array_sum( $bd ) === $reg,
            'settled' => $bd['paid'] + $bd['waived'], 'unpaid' => $n_unpaid,
            'pct_paid' => $reg > 0 ? (int) round( 100 * $bd['paid'] / $reg ) : null,
            'pct_settled' => $reg > 0 ? (int) round( 100 * ( $bd['paid'] + $bd['waived'] ) / $reg ) : null,
            'fee' => $fee['fee'], 'fee_source' => $fee['source'],
            'collected' => round( $collected, 2 ), 'owed' => $fee['fee'] === null && $n_unpaid > 0 ? null : round( $owed, 2 ),
        ];

        // ── teams and parity come from the existing parity endpoint so the thresholds live in one place ──
        $teams_no_goalie = []; $bands = [ 'rebalance_below' => 60, 'rebalance_above' => 85, 'review_below' => 65, 'review_above' => 80 ];
        $team_total = 0;
        if ( class_exists( 'GRSH_Reports' ) ) {
            $pr = GRSH_Reports::get_parity( new WP_REST_Request() );
            $pd = is_object( $pr ) && method_exists( $pr, 'get_data' ) ? $pr->get_data() : ( is_object( $pr ) ? $pr->data : [] );
            foreach ( (array) $pd as $d ) {
                $k = (string) $d['division'];
                $ensure( $k );
                $pars = [];
                foreach ( (array) $d['teams'] as $t ) {
                    $divs[ $k ]['teams'][] = $t; $team_total++;
                    if ( $t['parity_score'] !== null ) { $pars[] = (float) $t['parity_score']; }
                    if ( (int) $t['goalies'] === 0 ) { $teams_no_goalie[] = [ 'division' => $k, 'label' => $divs[ $k ]['label'], 'team' => $t['name'], 'players' => (int) $t['players'] ]; }
                }
                $divs[ $k ]['teams_count'] = count( $divs[ $k ]['teams'] );
                $divs[ $k ]['avg_parity']  = $pars ? round( array_sum( $pars ) / count( $pars ), 1 ) : null;
            }
        }
        $tot['teams'] = $team_total; $tot['teams_no_goalie'] = count( $teams_no_goalie );

        // ── registration window ──
        $closes = self::clean_date( $set['registration_closes'] ?? '' );
        $opens  = self::clean_date( $set['registration_opens'] ?? '' );
        $today  = current_time( 'Y-m-d' );
        $days_to_close = $closes ? (int) floor( ( strtotime( $closes . ' UTC' ) - strtotime( $today . ' UTC' ) ) / 86400 ) : null;
        $window = [ 'opens' => $opens, 'closes' => $closes, 'days_to_close' => $days_to_close, 'state' => $days_to_close === null ? 'unknown' : ( $days_to_close < 0 ? 'closed' : 'open' ) ];

        // ── forecast (honest or absent) ──
        $cap_total = 0; $min_total = 0;
        foreach ( $divs as $d ) { $cap_total += $d['capacity']; $min_total += $d['min_needed']; }
        $forecast = self::forecast( $by_day, $reg, $days_to_close, $cap_total, $min_total );

        // ── issues, verdict, summary ──
        $issues  = self::issues( $divs, $payments, $teams_no_goalie, $tot, $window, $unplaced_names );
        $verdict = self::verdict( $issues, $reg );
        $div_list = array_values( $divs );
        usort( $div_list, function ( $a, $b ) use ( $cfgs ) {
            $ka = array_search( $a['key'], array_keys( $cfgs ), true ); $kb = array_search( $b['key'], array_keys( $cfgs ), true );
            return ( $ka === false ? 99 : $ka ) <=> ( $kb === false ? 99 : $kb );
        } );
        $out = [
            'season' => [ 'year' => $year, 'label' => (string) ( $set['season_label'] ?? 'Season ' . $year ) ],
            'generated_at' => gmdate( 'c' ), 'last_registration_day' => $last_reg !== '' ? $last_reg : null,
            'registration' => $window, 'totals' => $tot + [ 'capacity' => $cap_total, 'min_needed' => $min_total ],
            'payments' => $payments, 'divisions' => $div_list, 'teams_no_goalie' => $teams_no_goalie, 'goalies_unplaced' => $unplaced_names,
            'unpaid' => array_slice( $unpaid, 0, self::UNPAID_CAP ), 'flags' => $flags, 'tiers' => $tiers,
            'ages' => self::age_summary( $ages ), 'registrations_by_day' => $by_day, 'forecast' => $forecast,
            'issues' => $issues, 'verdict' => $verdict, 'parity_bands' => $bands,
            'cooldown_days' => (int) ( self::COOLDOWN / 86400 ),
            'exports' => array_map( function ( $id, $e ) { return [ 'id' => $id, 'title' => $e[0], 'desc' => $e[1] ]; }, array_keys( self::EXPORTS ), array_values( self::EXPORTS ) ),
        ];
        $out['summary_text'] = self::summary_text( $out );
        $snap = self::snapshots( $out, $record );
        $out['since'] = $snap['since']; $out['history'] = $snap['history'];
        return $out;
    }

    private static function age_summary( array $ages ): array {
        $bands = [ [ '<40', 0, 39 ], [ '40-44', 40, 44 ], [ '45-49', 45, 49 ], [ '50-54', 50, 54 ], [ '55-59', 55, 59 ], [ '60-64', 60, 64 ], [ '65+', 65, 200 ] ];
        $n = count( $ages );
        $out = [ 'n' => $n, 'min' => $n ? min( $ages ) : null, 'avg' => $n ? round( array_sum( $ages ) / $n, 1 ) : null, 'max' => $n ? max( $ages ) : null, 'bands' => [] ];
        foreach ( $bands as $b ) { $c = 0; foreach ( $ages as $a ) { if ( $a >= $b[1] && $a <= $b[2] ) { $c++; } } $out['bands'][] = [ 'label' => $b[0], 'n' => $c ]; }
        return $out;
    }

    /** Needs 10+ registrations spread over 7+ days and a future close date; otherwise says why it cannot. */
    private static function forecast( array $by_day, int $reg, $days_left, int $cap, int $min ): array {
        $base = [ 'projected' => null, 'per_day' => null, 'days_left' => $days_left, 'capacity' => $cap ?: null, 'min_needed' => $min ?: null, 'reason' => '' ];
        if ( $days_left === null ) { $base['reason'] = 'No registration close date is set in Settings.'; return $base; }
        if ( $days_left < 0 )     { $base['reason'] = 'Registration has closed.'; return $base; }
        if ( $reg < 10 || count( $by_day ) < 3 ) { $base['reason'] = 'Not enough registrations yet to project a trend.'; return $base; }
        ksort( $by_day );
        $days = array_keys( $by_day );
        $span = (int) floor( ( strtotime( end( $days ) . ' UTC' ) - strtotime( $days[0] . ' UTC' ) ) / 86400 ) + 1;
        if ( $span < 7 ) { $base['reason'] = 'Registrations cover less than a week, which is too short to project.'; return $base; }
        $window = min( 14, $span ); $cut = gmdate( 'Y-m-d', strtotime( end( $days ) . ' UTC' ) - ( $window - 1 ) * 86400 ); $recent = 0;
        foreach ( $by_day as $d => $c ) { if ( $d >= $cut ) { $recent += $c; } }
        $rate = $recent / $window;
        $base['per_day'] = round( $rate, 2 );
        $base['projected'] = (int) round( $reg + $rate * $days_left );
        $base['basis'] = "pace over the last {$window} days, using the date each registration was recorded here";
        return $base;
    }

    private static function issues( array $divs, array $pay, array $no_goalie, array $tot, array $win, array $unplaced ): array {
        $soon = $win['days_to_close'] !== null && $win['days_to_close'] >= 0 && $win['days_to_close'] <= 14;
        $out = [];
        $add = function ( $id, $sev, $title, $detail, $fix, $count = null ) use ( &$out ) { $out[] = [ 'id' => $id, 'severity' => $sev, 'title' => $title, 'detail' => $detail, 'fix' => $fix, 'count' => $count ]; };
        if ( $pay['unpaid'] > 0 ) {
            $owed = $pay['owed'] === null ? '' : ' (' . self::money( $pay['owed'] ) . ' owed)';
            $add( 'unpaid', $soon ? 'high' : 'medium', $pay['unpaid'] . ' unpaid registration' . ( $pay['unpaid'] === 1 ? '' : 's' ) . $owed,
                $soon ? 'Registration closes in ' . $win['days_to_close'] . ' days.' : 'Send a reminder before the close date.', [ 'tab' => 'payments', 'label' => 'Review and remind' ], $pay['unpaid'] );
        }
        foreach ( array_slice( $no_goalie, 0, 12 ) as $t ) {
            $avail = 0; foreach ( $unplaced as $g ) { if ( $g['division'] === $t['division'] ) { $avail++; } }
            $add( 'goalie_' . $t['division'] . '_' . md5( $t['team'] ), 'high', $t['team'] . ' (' . $t['label'] . ') has no goalie',
                $avail > 0 ? $avail . ' registered goalie' . ( $avail === 1 ? ' is' : 's are' ) . ' not on a roster yet in this division.' : 'No unplaced goalie is registered in this division.', [ 'page' => 'grsh-tm-rosters', 'label' => 'Open Rosters' ] );
        }
        foreach ( $divs as $d ) {
            if ( ! $d['configured'] && $d['key'] !== 'unassigned' ) { continue; }
            if ( $d['key'] === 'unassigned' && $d['registered'] > 0 ) { $add( 'nodiv', 'medium', $d['registered'] . ' registered with no division', 'They will not appear in any division count or draft.', [ 'page' => 'grsh-tm-players', 'label' => 'Open Players' ], $d['registered'] ); continue; }
            if ( $d['min_needed'] > 0 && $d['registered'] < $d['min_needed'] ) {
                $short = $d['min_needed'] - $d['registered'];
                $add( 'short_' . $d['key'], $soon ? 'high' : 'medium', $d['label'] . ' is ' . $short . ' short of its minimum', $d['registered'] . ' registered, ' . $d['min_needed'] . ' needed for ' . $d['planned_teams'] . ' teams.', [ 'tab' => 'overview', 'label' => 'See divisions' ], $short );
            }
            if ( $d['capacity'] > 0 && $d['registered'] > $d['capacity'] ) { $add( 'over_' . $d['key'], 'medium', $d['label'] . ' is over capacity', $d['registered'] . ' registered for ' . $d['capacity'] . ' spots.', [ 'page' => 'grsh-tm-settings', 'label' => 'Settings' ] ); }
            foreach ( $d['teams'] as $t ) {
                if ( $t['action'] === 'rebalance' && $t['parity_score'] !== null ) { $add( 'par_' . $d['key'] . md5( $t['name'] ), 'medium', $t['name'] . ' parity ' . $t['parity_score'] . ' is outside 60-85', $d['label'] . ': rebalance before the draft is final.', [ 'page' => 'grsh-tm-rosters', 'label' => 'Open Rosters' ] ); }
            }
        }
        if ( $tot['sandbagging'] > 0 ) { $add( 'sandbag', 'low', $tot['sandbagging'] . ' player' . ( $tot['sandbagging'] === 1 ? '' : 's' ) . ' flagged for tier review', 'Committee decision pending.', [ 'tab' => 'review', 'label' => 'See flagged players' ], $tot['sandbagging'] ); }
        if ( $tot['tier_unknown'] > 0 ) { $add( 'tiers', 'low', $tot['tier_unknown'] . ' with no skill tier', 'They count as unknown in tier balance.', [ 'page' => 'grsh-tm-players', 'label' => 'Open Players' ], $tot['tier_unknown'] ); }
        $rank = [ 'high' => 0, 'medium' => 1, 'low' => 2 ];
        usort( $out, function ( $a, $b ) use ( $rank ) { return $rank[ $a['severity'] ] <=> $rank[ $b['severity'] ]; } );
        return $out;
    }

    private static function verdict( array $issues, int $reg ): array {
        if ( $reg === 0 ) { return [ 'level' => 'empty', 'headline' => 'No registrations yet.' ]; }
        $h = 0; $m = 0; foreach ( $issues as $i ) { if ( $i['severity'] === 'high' ) { $h++; } elseif ( $i['severity'] === 'medium' ) { $m++; } }
        if ( $h > 0 ) { return [ 'level' => 'blocked', 'headline' => $h . ' thing' . ( $h === 1 ? '' : 's' ) . ' need' . ( $h === 1 ? 's' : '' ) . ' fixing before the draft.' ]; }
        if ( $m > 0 ) { return [ 'level' => 'attention', 'headline' => $m . ' thing' . ( $m === 1 ? '' : 's' ) . ' to review.' ]; }
        return [ 'level' => 'ready', 'headline' => 'Nothing is blocking the draft.' ];
    }

    private static function summary_text( array $d ): string {
        $t = $d['totals']; $p = $d['payments']; $w = $d['registration'];
        if ( $t['registered'] === 0 ) { return 'No players have registered for ' . $d['season']['label'] . ' yet.'; }
        $s  = $t['registered'] . ' players are registered for ' . $d['season']['label'] . '. ';
        $s .= $p['pct_paid'] . '% have paid' . ( $p['breakdown']['waived'] ? ' and ' . $p['breakdown']['waived'] . ' are waived' : '' ) . '; ';
        $s .= $p['unpaid'] === 0 ? 'nobody owes anything. ' : $p['unpaid'] . ' still owe' . ( $p['owed'] !== null ? ' ' . self::money( $p['owed'] ) : '' ) . '. ';
        if ( $w['days_to_close'] !== null ) { $s .= $w['days_to_close'] >= 0 ? 'Registration closes in ' . $w['days_to_close'] . ' days. ' : 'Registration has closed. '; }
        $s .= $t['teams'] > 0 ? ( $t['teams_no_goalie'] === 0 ? 'Every team has a goalie. ' : $t['teams_no_goalie'] . ' of ' . $t['teams'] . ' teams have no goalie. ' ) : 'Teams have not been created yet. ';
        $s .= $d['verdict']['headline'];
        return $s;
    }

    // ── snapshots: "what changed since last time" and report history ──

    private static function snapshots( array $d, bool $record ): array {
        $list = array_values( (array) get_option( self::SNAP_OPT, [] ) );
        $now  = time();
        $mine = [ 'ts' => $now, 'registered' => $d['totals']['registered'], 'paid' => $d['payments']['breakdown']['paid'], 'unpaid' => $d['payments']['unpaid'], 'collected' => $d['payments']['collected'], 'goalies' => $d['totals']['goalies'], 'no_goalie' => $d['totals']['teams_no_goalie'] ];
        $since = null;
        for ( $i = count( $list ) - 1; $i >= 0; $i-- ) {
            if ( $now - (int) $list[ $i ]['ts'] >= self::SINCE_MIN ) {
                $o = $list[ $i ];
                $since = [ 'ts' => gmdate( 'c', (int) $o['ts'] ), 'days' => (int) floor( ( $now - (int) $o['ts'] ) / 86400 ),
                    'registered' => $mine['registered'] - (int) $o['registered'], 'paid' => $mine['paid'] - (int) $o['paid'], 'unpaid' => $mine['unpaid'] - (int) $o['unpaid'],
                    'collected' => round( $mine['collected'] - (float) $o['collected'], 2 ), 'no_goalie' => $mine['no_goalie'] - (int) $o['no_goalie'] ];
                break;
            }
        }
        if ( $record && ( ! $list || $now - (int) end( $list )['ts'] >= self::SNAP_EVERY ) ) {
            $list[] = $mine; $list = array_slice( $list, -self::SNAP_KEEP );
            update_option( self::SNAP_OPT, $list, false );
        }
        $hist = array_map( function ( $s ) { return [ 'at' => gmdate( 'c', (int) $s['ts'] ), 'registered' => (int) $s['registered'], 'paid' => (int) $s['paid'], 'unpaid' => (int) $s['unpaid'], 'collected' => (float) $s['collected'] ]; }, array_reverse( array_slice( $list, -12 ) ) );
        return [ 'since' => $since, 'history' => $hist ];
    }

    // ── routes ────────────────────────────────────────────────────────────────

    public static function get_overview( WP_REST_Request $request ): WP_REST_Response {
        return new WP_REST_Response( self::data( true ), 200 );
    }

    public static function post_fee( WP_REST_Request $request ): WP_REST_Response {
        $raw = $request->get_json_params() ?: [];
        $v   = isset( $raw['fee'] ) ? trim( (string) $raw['fee'] ) : '';
        if ( $v === '' ) { delete_option( self::FEE_OPT ); self::audit( 'player_fee_cleared', 'season', null, [], 'Player fee cleared' ); return new WP_REST_Response( self::data(), 200 ); }
        if ( ! is_numeric( $v ) || (float) $v <= 0 || (float) $v > 5000 ) { return new WP_REST_Response( [ 'error' => 'Enter an amount between 1 and 5000, for example 200.' ], 400 ); }
        update_option( self::FEE_OPT, round( (float) $v, 2 ), false );
        self::audit( 'player_fee_set', 'season', null, [ 'fee' => round( (float) $v, 2 ) ], 'Player registration fee set to ' . self::money( $v ) );
        return new WP_REST_Response( self::data(), 200 );
    }

    // ── exports ───────────────────────────────────────────────────────────────

    private static function cell( $v ): string {
        $s = (string) $v;
        if ( $s !== '' && ! is_numeric( $s ) && strpbrk( $s[0], "=+-@\t\r" ) !== false ) { $s = "'" . $s; }   // stops spreadsheet formula injection
        return '"' . str_replace( '"', '""', $s ) . '"';
    }

    private static function csv( array $head, array $rows ): string {
        $lines = [ implode( ',', array_map( [ __CLASS__, 'cell' ], $head ) ) ];
        foreach ( $rows as $r ) { $lines[] = implode( ',', array_map( [ __CLASS__, 'cell' ], $r ) ); }
        return "\xEF\xBB\xBF" . implode( "\r\n", $lines ) . "\r\n";
    }

    public static function build_export( string $id ): ?array {
        global $wpdb;
        if ( ! isset( self::EXPORTS[ $id ] ) ) { return null; }
        $sid = self::season_id();
        $head = []; $rows = [];
        if ( $id === 'players' ) {
            $head = [ 'First name', 'Last name', 'Email', 'Division', 'Type', 'Status', 'Payment', 'Amount paid', 'Position', 'Goalie', 'Skill tier', 'Age', 'Flagged for tier review' ];
            $q = $wpdb->get_results( $wpdb->prepare(
                "SELECT p.first_name, p.last_name, p.email, COALESCE(r.division_assigned, r.division_requested) AS d, r.player_type, r.status, r.payment_status, r.amount_paid, p.position, p.is_goalie, p.skill_tier_assigned, p.skill_tier_reported, r.age, p.sandbagging_flag
                   FROM {$wpdb->prefix}grsh_registrations r JOIN {$wpdb->prefix}grsh_players p ON p.id = r.player_id
                  WHERE r.season_id = %d AND r.status NOT IN ('withdrawn','waitlist') ORDER BY d, p.last_name, p.first_name", $sid ), ARRAY_A ) ?: [];
            foreach ( $q as $r ) { $rows[] = [ $r['first_name'], $r['last_name'], $r['email'], $r['d'], $r['player_type'], $r['status'], $r['payment_status'], $r['amount_paid'], $r['position'], (int) $r['is_goalie'] ? 'yes' : 'no', $r['skill_tier_assigned'] ?: $r['skill_tier_reported'], $r['age'], (int) $r['sandbagging_flag'] ? 'yes' : 'no' ]; }
        } elseif ( $id === 'audit' ) {
            $head = [ 'When', 'Who', 'Action', 'Object', 'Notes' ];
            $q = $wpdb->get_results( $wpdb->prepare( "SELECT created_at, user_display, action, object_type, notes FROM {$wpdb->prefix}grsh_audit_logs WHERE season_id = %d OR season_id IS NULL ORDER BY id DESC LIMIT 1000", $sid ), ARRAY_A ) ?: [];
            foreach ( $q as $r ) { $rows[] = [ $r['created_at'], $r['user_display'], $r['action'], $r['object_type'], $r['notes'] ]; }
        } else {
            $d = self::data();
            if ( $id === 'unpaid' ) {
                $head = [ 'Player', 'Division', 'Payment status', 'Owes', 'Days waiting', 'Has email', 'Last reminded' ];
                foreach ( $d['unpaid'] as $u ) { $rows[] = [ $u['name'], $u['division'], $u['status'], $u['owes'] === null ? '' : $u['owes'], $u['days_waiting'] === null ? '' : $u['days_waiting'], $u['has_email'] ? 'yes' : 'no', $u['reminded_at'] ?: '' ]; }
            } elseif ( $id === 'parity' ) {
                $head = [ 'Division', 'Team', 'Players', 'Skill', 'Age', 'Parity', 'Goalies', 'Defense', 'Center', 'Wing', 'Recommendation' ];
                foreach ( $d['divisions'] as $dv ) { foreach ( $dv['teams'] as $t ) { $rows[] = [ $dv['label'], $t['name'], $t['players'], $t['skill_score'] ?? '', $t['age_score'] ?? '', $t['parity_score'] ?? '', $t['goalies'], $t['defense'], $t['center'], $t['wing'], $t['action'] ]; } }
            } elseif ( $id === 'goalies' ) {
                $head = [ 'Division', 'Team', 'Goalies on team', 'Covered' ];
                foreach ( $d['divisions'] as $dv ) { foreach ( $dv['teams'] as $t ) { $rows[] = [ $dv['label'], $t['name'], $t['goalies'], (int) $t['goalies'] > 0 ? 'yes' : 'NO' ]; } }
                foreach ( $d['goalies_unplaced'] as $g ) { $rows[] = [ $g['division'], '(not on a roster)', $g['name'], '' ]; }
            } else {
                $head = [ 'Division', 'Registered', 'Paid or waived', 'Unpaid', 'Minimum needed', 'Capacity', 'Subs', 'Goalies', 'Goalies not placed', 'Teams', 'Average parity' ];
                foreach ( $d['divisions'] as $dv ) { $rows[] = [ $dv['label'], $dv['registered'], $dv['settled'], $dv['unpaid'], $dv['min_needed'] ?: '', $dv['capacity'] ?: '', $dv['subs'], $dv['goalies'], $dv['goalies_unplaced'], $dv['teams_count'], $dv['avg_parity'] ?? '' ]; }
            }
        }
        return [ 'filename' => 'grsh-' . $id . '-' . self::season_year() . '-' . gmdate( 'Y-m-d' ) . '.csv', 'csv' => self::csv( $head, $rows ), 'rows' => count( $rows ) ];
    }

    public static function get_export( WP_REST_Request $request ): WP_REST_Response {
        $out = self::build_export( sanitize_key( (string) $request->get_param( 'id' ) ) );
        if ( $out === null ) { return new WP_REST_Response( [ 'error' => 'Unknown report.' ], 404 ); }
        self::audit( 'report_exported', 'report', null, [ 'rows' => $out['rows'] ], 'Exported ' . $out['filename'] );
        return new WP_REST_Response( $out, 200 );
    }

    // ── payment reminders: preview first, send only on an explicit {send:true} ──

    private static function reminder_text( string $first, string $season, string $note ): array {
        $subject = $season . ': your registration payment is still open';
        $body = "Hi " . ( $first !== '' ? $first : 'there' ) . ",\n\nOur records show your payment for " . $season . " is still outstanding."
              . ( $note !== '' ? "\n\n" . $note : '' )
              . "\n\nIf you have already paid, just reply to this email and we will correct our records.\n\nThanks,\nGold Rush Senior Hockey";
        return [ $subject, $body ];
    }

    public static function post_reminders( WP_REST_Request $request ) {
        $body = $request->get_json_params() ?: [];
        $send = ( $body['send'] ?? false ) === true;
        $note = mb_substr( trim( wp_strip_all_tags( (string) ( $body['note'] ?? '' ) ) ), 0, 500 );
        $only = isset( $body['ids'] ) && is_array( $body['ids'] ) ? array_map( 'absint', $body['ids'] ) : null;
        $d = self::data();
        $label = $d['season']['label'];
        $elig = []; $cool = 0; $noem = 0;
        foreach ( $d['unpaid'] as $u ) {
            if ( $only !== null && ! in_array( $u['player_id'], $only, true ) ) { continue; }
            if ( ! $u['has_email'] ) { $noem++; continue; }
            if ( ! $u['can_remind'] ) { $cool++; continue; }
            $elig[] = $u;
        }
        $capped = count( $elig ) > self::MAX_SEND;
        $elig = array_slice( $elig, 0, self::MAX_SEND );
        $sample = self::reminder_text( 'Alex', $label, $note );
        $result = [ 'mode' => $send ? 'sent' : 'preview', 'eligible' => count( $elig ), 'skipped_recent' => $cool, 'skipped_no_email' => $noem, 'capped' => $capped,
                    'names' => array_slice( array_column( $elig, 'name' ), 0, 8 ), 'subject' => $sample[0], 'body' => $sample[1], 'sent' => 0, 'failed' => 0 ];
        if ( ! $send ) { return new WP_REST_Response( $result, 200 ); }
        if ( ! $elig ) { return new WP_REST_Response( [ 'error' => 'Nobody is eligible: everyone unpaid was reminded in the last ' . $d['cooldown_days'] . ' days or has no email.' ] + $result, 400 ); }
        global $wpdb;
        $remind = (array) get_option( self::REMIND_OPT, [] );
        foreach ( $elig as $u ) {
            $em = (string) $wpdb->get_var( $wpdb->prepare( "SELECT email FROM {$wpdb->prefix}grsh_players WHERE id = %d", $u['player_id'] ) );
            if ( ! is_email( $em ) ) { $result['failed']++; continue; }
            $first = trim( (string) strtok( $u['name'], ' ' ) );
            $m = self::reminder_text( $first, $label, $note );
            if ( wp_mail( $em, $m[0], $m[1], self::mail_headers() ) ) { $remind[ $u['player_id'] ] = time(); $result['sent']++; } else { $result['failed']++; }
        }
        update_option( self::REMIND_OPT, $remind, false );
        self::audit( 'payment_reminders_sent', 'registration', null, [ 'sent' => $result['sent'], 'failed' => $result['failed'] ], 'Payment reminders: ' . $result['sent'] . ' sent, ' . $result['failed'] . ' failed' );
        return new WP_REST_Response( $result, 200 );
    }

    // ── share links ───────────────────────────────────────────────────────────

    private static function live_shares(): array {
        $s = (array) get_option( self::SHARE_OPT, [] ); $now = time(); $keep = [];
        foreach ( $s as $h => $v ) { if ( (int) $v['exp'] > $now ) { $keep[ $h ] = $v; } }
        if ( count( $keep ) !== count( $s ) ) { update_option( self::SHARE_OPT, $keep, false ); }
        return $keep;
    }

    public static function post_share( WP_REST_Request $request ) {
        $body = $request->get_json_params() ?: [];
        $days = max( 1, min( 30, (int) ( $body['days'] ?? 7 ) ) );
        $live = self::live_shares();
        if ( count( $live ) >= self::MAX_SHARES ) { return new WP_REST_Response( [ 'error' => 'There are already ' . self::MAX_SHARES . ' active share links. Revoke one first.' ], 400 ); }
        $token = bin2hex( random_bytes( 16 ) );
        $hash  = hash( 'sha256', $token );
        $u = wp_get_current_user();
        $live[ $hash ] = [ 'created' => time(), 'exp' => time() + $days * 86400, 'by' => ( $u && $u->exists() ) ? $u->display_name : 'Committee' ];
        update_option( self::SHARE_OPT, $live, false );
        self::audit( 'report_share_created', 'report', null, [ 'days' => $days, 'id' => substr( $hash, 0, 12 ) ], 'Read-only report link created, expires in ' . $days . ' days' );
        return new WP_REST_Response( [ 'url' => rest_url( 'grsh/v1/reports/shared/' . $token ), 'id' => substr( $hash, 0, 12 ), 'expires' => gmdate( 'c', $live[ $hash ]['exp'] ), 'note' => 'Copy the link now. For security it is not shown again.' ], 200 );
    }

    public static function get_shares( WP_REST_Request $request ): WP_REST_Response {
        $out = [];
        foreach ( self::live_shares() as $h => $v ) { $out[] = [ 'id' => substr( $h, 0, 12 ), 'created' => gmdate( 'c', (int) $v['created'] ), 'expires' => gmdate( 'c', (int) $v['exp'] ), 'by' => (string) $v['by'] ]; }
        return new WP_REST_Response( $out, 200 );
    }

    public static function delete_share( WP_REST_Request $request ): WP_REST_Response {
        $id = (string) $request->get_param( 'id' );
        $live = self::live_shares(); $hit = false;
        foreach ( array_keys( $live ) as $h ) { if ( substr( $h, 0, 12 ) === $id ) { unset( $live[ $h ] ); $hit = true; } }
        if ( ! $hit ) { return new WP_REST_Response( [ 'error' => 'That link is already gone.' ], 404 ); }
        update_option( self::SHARE_OPT, $live, false );
        self::audit( 'report_share_revoked', 'report', null, [ 'id' => $id ], 'Read-only report link revoked' );
        return new WP_REST_Response( [ 'revoked' => $id ], 200 );
    }

    /** HTML for a valid token, or null. Numbers only: no names, no emails. */
    public static function shared_html( string $token ): ?string {
        if ( ! preg_match( '/^[a-f0-9]{32}$/', $token ) ) { return null; }
        $hash = hash( 'sha256', $token ); $ok = false;
        foreach ( self::live_shares() as $h => $v ) { if ( hash_equals( (string) $h, $hash ) ) { $ok = true; } }
        if ( ! $ok ) { return null; }
        $d = self::data(); $p = $d['payments']; $t = $d['totals'];
        $e = function ( $s ) { return esc_html( (string) $s ); };
        $v = function ( $x ) { return $x === null ? '—' : (string) $x; };
        $rows = '';
        foreach ( $d['divisions'] as $dv ) {
            $rows .= '<tr><td>' . $e( $dv['label'] ) . '</td><td>' . (int) $dv['registered'] . ( $dv['capacity'] ? ' / ' . (int) $dv['capacity'] : '' ) . '</td><td>' . (int) $dv['settled'] . '</td><td>' . (int) $dv['unpaid'] . '</td><td>' . (int) $dv['goalies'] . '</td><td>' . $e( $v( $dv['avg_parity'] ) ) . '</td></tr>';
        }
        return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' . $e( $d['season']['label'] ) . ' report</title>'
            . '<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;background:#F6F5F0;color:#1a1a2e}main{max-width:860px;margin:0 auto;padding:24px}h1{font-family:Georgia,serif;margin:0 0 4px}.k{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}.k div{background:#fff;border:1px solid #E2E0D8;border-radius:10px;padding:12px 16px;min-width:130px}.k b{display:block;font-size:28px}table{width:100%;border-collapse:collapse;background:#fff}th,td{padding:8px 10px;border-bottom:1px solid #E2E0D8;text-align:left}small{color:#555566}</style></head><body><main>'
            . '<h1>' . $e( $d['season']['label'] ) . '</h1><small>Read-only snapshot, ' . $e( gmdate( 'M j, Y g:i a' ) ) . ' UTC. Totals only; no player names.</small>'
            . '<p><strong>' . $e( $d['verdict']['headline'] ) . '</strong></p><p>' . $e( $d['summary_text'] ) . '</p>'
            . '<div class="k"><div>Registered<b>' . (int) $t['registered'] . '</b></div><div>Paid<b>' . $e( $v( $p['pct_paid'] ) ) . ( $p['pct_paid'] === null ? '' : '%' ) . '</b></div><div>Unpaid<b>' . (int) $p['unpaid'] . '</b></div><div>Teams without goalie<b>' . (int) $t['teams_no_goalie'] . '</b></div></div>'
            . '<table><thead><tr><th>Division</th><th>Registered</th><th>Paid or waived</th><th>Unpaid</th><th>Goalies</th><th>Avg parity</th></tr></thead><tbody>' . $rows . '</tbody></table></main></body></html>';
    }

    public static function get_shared( WP_REST_Request $request ) {
        $html = self::shared_html( (string) $request->get_param( 'token' ) );
        if ( $html === null ) { return new WP_REST_Response( [ 'error' => 'This link is invalid or has expired.' ], 404 ); }
        if ( ! headers_sent() ) {
            header( 'Content-Type: text/html; charset=UTF-8' ); header( 'X-Robots-Tag: noindex, nofollow' ); header( 'Cache-Control: private, no-store' ); header( 'Referrer-Policy: no-referrer' );
        }
        echo $html; // phpcs:ignore WordPress.Security.EscapeOutput -- every value is escaped above
        exit;
    }
}
