<?php
/**
 * GRSH Draft — server-side snake draft
 *
 * Until now the draft lived only in the browser: a refresh lost every pick and nothing
 * was written to the rosters. This class makes the server the source of truth.
 *
 *  GET  /grsh/v1/draft?division=      full state: teams, pool, picks, clock, preflight checks
 *  POST /grsh/v1/draft/start          validate preflight, start the clock
 *  POST /grsh/v1/draft/pick           make a pick for the team on the clock (writes grsh_rosters)
 *  POST /grsh/v1/draft/undo           undo the last pick
 *  POST /grsh/v1/draft/pause|resume
 *  POST /grsh/v1/draft/trade          swap two upcoming picks
 *  POST /grsh/v1/draft/reset          remove this division's draft picks and state
 *  POST /grsh/v1/draft/captain-links  create/email private phone links for captains
 *  POST /grsh/v1/draft/publish        email every drafted player + create a shareable recap
 *  GET  /grsh/v1/draft/captain        (token) captain's phone view
 *  POST /grsh/v1/draft/captain/pick   (token) captain picks when on the clock
 *
 * Public pages: ?grsh_draft_captain=TOKEN and ?grsh_draft_recap=KEY
 *
 * @package GRSH_Tournament_Manager
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class GRSH_Draft {

    const STATE_OPT     = 'grsh_draft_state_';
    const CLOCK_DEFAULT = 90;
    const MAX_EMAILS    = 200;
    // Some imports store 45A as o45_a — accept both when building a division's pool.
    const DIV_ALIASES   = [ '45a' => [ '45a', 'o45_a' ] ];

    public static function register_hooks(): void {
        add_action( 'rest_api_init', [ __CLASS__, 'register_routes' ] );
        add_action( 'wp', [ __CLASS__, 'handle_landing' ] );
    }

    // -------------------------------------------------------------------------
    // Routes
    // -------------------------------------------------------------------------

    public static function register_routes(): void {
        $ns   = 'grsh/v1';
        $perm = [ __CLASS__, 'check_permission' ];
        register_rest_route( $ns, '/draft', [ 'methods' => 'GET', 'callback' => [ __CLASS__, 'get_draft' ], 'permission_callback' => $perm ] );
        foreach ( [ 'start', 'pick', 'undo', 'pause', 'resume', 'trade', 'reset', 'captain-links', 'publish' ] as $a ) {
            register_rest_route( $ns, '/draft/' . $a, [
                'methods' => 'POST',
                'callback' => [ __CLASS__, 'action_' . str_replace( '-', '_', $a ) ],
                'permission_callback' => $perm,
            ] );
        }
        register_rest_route( $ns, '/draft/captain', [ 'methods' => 'GET', 'callback' => [ __CLASS__, 'captain_view' ], 'permission_callback' => '__return_true' ] );
        register_rest_route( $ns, '/draft/captain/pick', [ 'methods' => 'POST', 'callback' => [ __CLASS__, 'captain_pick' ], 'permission_callback' => '__return_true' ] );
    }

    public static function check_permission(): bool {
        return current_user_can( 'manage_options' ) || current_user_can( 'grsh_committee' );
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private static function season_id(): int {
        global $wpdb;
        $year = class_exists( 'GRSH_Sync_Engine' ) ? GRSH_Sync_Engine::SEASON : (int) gmdate( 'Y' );
        $id   = (int) $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}grsh_seasons WHERE season_year = %d LIMIT 1", $year ) );
        return $id ?: 1;
    }

    private static function division_keys( string $div ): array {
        return self::DIV_ALIASES[ $div ] ?? [ $div ];
    }

    private static function division_label( string $key ): string {
        if ( class_exists( 'GRSH_Settings' ) ) {
            foreach ( GRSH_Settings::get_active_divisions() as $d ) {
                if ( ( $d['key'] ?? '' ) === $key ) {
                    return (string) ( $d['label'] ?? $key );
                }
            }
        }
        return ucwords( str_replace( '_', ' ', $key ) );
    }

    /** Default pick clock: the Settings value when available, else the built-in 90 seconds. */
    private static function default_clock(): int {
        return class_exists( 'GRSH_Settings' ) && method_exists( 'GRSH_Settings', 'draft_clock' ) ? GRSH_Settings::draft_clock() : self::CLOCK_DEFAULT;
    }

    private static function state_get( string $div ): array {
        $s = get_option( self::STATE_OPT . $div, [] );
        $out = wp_parse_args( is_array( $s ) ? $s : [], [
            'status' => 'ready', 'rounds' => 0, 'order' => [], 'overrides' => [],
            'clock_seconds' => self::default_clock(), 'deadline_ts' => 0, 'paused_remaining' => 0,
            'captain_tokens' => [], 'notified_slot' => -1, 'recap_key' => '', 'published_at' => '', 'started_at' => '',
        ] );
        // Before the draft starts, the clock follows Settings (the committee can still override it when starting).
        if ( $out['status'] === 'ready' ) { $out['clock_seconds'] = self::default_clock(); }
        return $out;
    }

    private static function state_save( string $div, array $s ): void {
        update_option( self::STATE_OPT . $div, $s, false );
    }

    private static function audit( string $action, ?int $object_id, array $after, string $notes = '' ): void {
        global $wpdb;
        $u = wp_get_current_user();
        $wpdb->insert( "{$wpdb->prefix}grsh_audit_logs", [
            'season_id'    => self::season_id(),
            'wp_user_id'   => get_current_user_id() ?: 0,
            'user_display' => ( $u && $u->exists() ) ? $u->display_name : 'Captain link',
            'action'       => $action,
            'object_type'  => 'draft',
            'object_id'    => $object_id,
            'after_value'  => wp_json_encode( $after ),
            'notes'        => $notes,
            'ip_address'   => $_SERVER['REMOTE_ADDR'] ?? null,
        ] );
    }

    private static function lock( callable $fn ) {
        global $wpdb;
        $got = $wpdb->get_var( "SELECT GET_LOCK('grsh_draft', 5)" );
        if ( (int) $got !== 1 ) {
            return new WP_Error( 'busy', 'Another pick is being saved — try again in a second.', [ 'status' => 409 ] );
        }
        try {
            return $fn();
        } finally {
            $wpdb->get_var( "SELECT RELEASE_LOCK('grsh_draft')" );
        }
    }

    private static function err( WP_Error $e ): WP_REST_Response {
        $st = (int) ( $e->get_error_data()['status'] ?? 400 );
        return new WP_REST_Response( [ 'error' => $e->get_error_message() ], $st );
    }

    private static function fmt_player( array $r ): array {
        return [
            'id'                  => (int) $r['id'],
            'first_name'          => $r['first_name'],
            'last_name'           => $r['last_name'],
            'position'            => $r['position'] ?: null,
            'is_goalie'           => ( $r['position'] === 'goaltender' || (int) ( $r['is_goalie'] ?? 0 ) === 1 ),
            'skill_tier_reported' => $r['skill_tier_reported'] ?? '',
            'skill_tier_assigned' => ( $r['skill_tier_assigned'] ?? '' ) ?: null,
            'years_experience'    => $r['years_experience'] !== null ? (int) $r['years_experience'] : null,
            'sandbagging_flag'    => (bool) ( $r['sandbagging_flag'] ?? 0 ),
            'age'                 => ! empty( $r['age'] ) ? (int) $r['age'] : null,
            'registration_id'     => isset( $r['registration_id'] ) ? (int) $r['registration_id'] : null,
        ];
    }

    private static function score( array $p ): float {
        $tier = $p['skill_tier_assigned'] ?: ( $p['skill_tier_reported'] ?? '' );
        return GRSH_Scoring::compute_score( (string) $tier, (int) ( $p['years_experience'] ?? 0 ) );
    }

    // ---- data loaders --------------------------------------------------------

    private static function divisions( int $sid ): array {
        global $wpdb;
        $rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT division, COUNT(*) AS n FROM {$wpdb->prefix}grsh_teams WHERE season_id = %d AND team_type = 'draft' GROUP BY division", $sid
        ), ARRAY_A ) ?: [];
        $out = [];
        foreach ( $rows as $r ) {
            $out[] = [ 'key' => $r['division'], 'label' => self::division_label( $r['division'] ), 'teams' => (int) $r['n'] ];
        }
        return $out;
    }

    private static function teams( int $sid, string $div ): array {
        global $wpdb;
        return $wpdb->get_results( $wpdb->prepare(
            "SELECT t.id, t.name, t.colour, t.draft_order, t.captain_player_id, p.email AS captain_email
               FROM {$wpdb->prefix}grsh_teams t
          LEFT JOIN {$wpdb->prefix}grsh_players p ON p.id = t.captain_player_id
              WHERE t.season_id = %d AND t.division = %s AND t.team_type = 'draft'
           ORDER BY COALESCE(t.draft_order, 255), t.name",
            $sid, $div
        ), ARRAY_A ) ?: [];
    }

    private static function pool( int $sid, string $div ): array {
        global $wpdb;
        $keys = self::division_keys( $div );
        $ph   = implode( ',', array_fill( 0, count( $keys ), '%s' ) );
        $rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT p.id, p.first_name, p.last_name, p.position, p.is_goalie, p.skill_tier_reported, p.skill_tier_assigned,
                    p.sandbagging_flag, p.years_experience, r.age, r.id AS registration_id
               FROM {$wpdb->prefix}grsh_players p
               JOIN {$wpdb->prefix}grsh_registrations r ON r.player_id = p.id AND r.season_id = %d
              WHERE r.status <> 'rejected'
                AND COALESCE(r.player_type,'primary') <> 'sub'
                AND COALESCE(p.is_alternate,0) = 0
                AND r.division_requested IN ($ph)
                AND NOT EXISTS ( SELECT 1 FROM {$wpdb->prefix}grsh_rosters ro WHERE ro.player_id = p.id AND ro.season_id = %d )
           ORDER BY p.last_name ASC",
            array_merge( [ $sid ], $keys, [ $sid ] )
        ), ARRAY_A ) ?: [];

        $pool = array_map( [ __CLASS__, 'fmt_player' ], $rows );
        if ( $pool ) {
            $ids  = implode( ',', array_map( fn( $p ) => (int) $p['id'], $pool ) );
            $hist = $wpdb->get_results(
                "SELECT h.player_id, s.season_year FROM {$wpdb->prefix}grsh_player_history h
                   JOIN {$wpdb->prefix}grsh_seasons s ON s.id = h.season_id
                  WHERE h.player_id IN ($ids)",
                ARRAY_A
            ) ?: [];
            $by = [];
            foreach ( $hist as $h ) {
                $by[ (int) $h['player_id'] ][] = (int) $h['season_year'];
            }
            foreach ( $pool as &$p ) {
                $y = array_values( array_unique( $by[ $p['id'] ] ?? [] ) );
                rsort( $y );
                $p['returning_seasons'] = $y;
            }
            unset( $p );
        }
        return $pool;
    }

    /** Roster rows for these teams, split into team players + ordered pick list. */
    private static function rosters( int $sid, array $team_ids ): array {
        global $wpdb;
        if ( ! $team_ids ) {
            return [ [], [] ];
        }
        $ph   = implode( ',', array_fill( 0, count( $team_ids ), '%d' ) );
        $rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT ro.team_id, ro.draft_round, ro.draft_pick, ro.assignment_type, ro.assigned_at,
                    p.id, p.first_name, p.last_name, p.position, p.is_goalie, p.skill_tier_reported, p.skill_tier_assigned,
                    p.sandbagging_flag, p.years_experience, r.age
               FROM {$wpdb->prefix}grsh_rosters ro
               JOIN {$wpdb->prefix}grsh_players p ON p.id = ro.player_id
          LEFT JOIN {$wpdb->prefix}grsh_registrations r ON r.id = ro.registration_id
              WHERE ro.season_id = %d AND ro.team_id IN ($ph)
           ORDER BY ro.draft_pick ASC, ro.id ASC",
            array_merge( [ $sid ], $team_ids )
        ), ARRAY_A ) ?: [];

        $by_team = [];
        $picks   = [];
        foreach ( $rows as $r ) {
            $pl = self::fmt_player( $r );
            $by_team[ (int) $r['team_id'] ][] = $pl;
            if ( $r['assignment_type'] === 'draft' && (int) $r['draft_pick'] > 0 ) {
                $picks[] = [ 'pick' => (int) $r['draft_pick'], 'round' => (int) $r['draft_round'], 'team_id' => (int) $r['team_id'], 'player' => $pl ];
            }
        }
        usort( $picks, fn( $a, $b ) => $a['pick'] <=> $b['pick'] );
        return [ $by_team, $picks ];
    }

    /** Team that owns overall slot $i (0-based) — snake order plus any trades. */
    private static function slot_team( array $state, int $i ): ?int {
        $order = array_map( 'intval', $state['order'] );
        $n     = count( $order );
        if ( ! $n ) {
            return null;
        }
        if ( isset( $state['overrides'][ $i ] ) ) {
            return (int) $state['overrides'][ $i ];
        }
        $r = intdiv( $i, $n );
        $p = $i % $n;
        return $order[ $r % 2 === 0 ? $p : $n - 1 - $p ];
    }

    private static function preflight( array $teams, array $pool, array $by_team, array $picks, string $div ): array {
        $out = [];
        $n   = count( $teams );
        $url = admin_url( 'admin.php?page=grsh-tm-rosters' );
        $label = self::division_label( $div );

        if ( $n < 2 ) {
            $out[] = [ 'key' => 'teams', 'level' => 'fail', 'text' => "Need at least 2 draft teams in {$label} (found {$n}).", 'fix' => 'Create teams in Rosters', 'url' => $url ];
        } else {
            $out[] = [ 'key' => 'teams', 'level' => 'ok', 'text' => "{$n} {$label} teams: " . implode( ', ', array_column( $teams, 'name' ) ) ];
        }
        $names = array_count_values( array_map( fn( $t ) => strtolower( trim( $t['name'] ) ), $teams ) );
        foreach ( $names as $nm => $c ) {
            if ( $c > 1 ) {
                $out[] = [ 'key' => 'dupes', 'level' => 'fail', 'text' => "{$c} teams share the name \"{$nm}\" — rename one so the board is readable.", 'fix' => 'Rename in Rosters', 'url' => $url ];
            }
        }
        $drafted = count( $picks );
        $total   = count( $pool ) + array_sum( array_map( 'count', $by_team ) );
        if ( $n >= 2 && $total < $n ) {
            $out[] = [ 'key' => 'pool', 'level' => 'fail', 'text' => "Only {$total} players for {$n} teams — every team needs at least one. Check registrations and division requests.", 'fix' => 'Review players', 'url' => admin_url( 'admin.php?page=grsh-tm-players' ) ];
        } else {
            $out[] = [ 'key' => 'pool', 'level' => 'ok', 'text' => count( $pool ) . ' players in the ' . $label . ' draft pool' . ( $drafted ? " ({$drafted} already drafted)" : '' ) ];
        }
        if ( $n >= 2 && $total >= $n && $total % $n !== 0 ) {
            $extra = $total % $n;
            $out[] = [ 'key' => 'uneven', 'level' => 'warn', 'text' => "{$total} players over {$n} teams is uneven: the last round has {$extra} pick" . ( $extra === 1 ? '' : 's' ) . '.' ];
        }
        $goalies = count( array_filter( $pool, fn( $p ) => $p['is_goalie'] ) );
        foreach ( $by_team as $pl ) {
            $goalies += count( array_filter( $pl, fn( $p ) => $p['is_goalie'] ) );
        }
        if ( $n >= 2 && $goalies < $n ) {
            $out[] = [ 'key' => 'goalies', 'level' => 'warn', 'text' => "{$goalies} goalie" . ( $goalies === 1 ? '' : 's' ) . " for {$n} teams — some teams will play without one." ];
        }
        $noyrs = count( array_filter( $pool, fn( $p ) => $p['years_experience'] === null ) );
        if ( $noyrs ) {
            $out[] = [ 'key' => 'years', 'level' => 'warn', 'text' => "{$noyrs} player" . ( $noyrs === 1 ? ' has' : 's have' ) . ' no years of experience on file — scored as 0.' ];
        }
        $sb = count( array_filter( $pool, fn( $p ) => $p['sandbagging_flag'] ) );
        if ( $sb ) {
            $out[] = [ 'key' => 'sandbag', 'level' => 'warn', 'text' => "{$sb} sandbagging flag" . ( $sb === 1 ? '' : 's' ) . ' in the pool — review before drafting.' ];
        }
        $no_order = count( array_filter( $teams, fn( $t ) => $t['draft_order'] === null ) );
        if ( $n >= 2 && $no_order ) {
            $out[] = [ 'key' => 'order', 'level' => 'warn', 'text' => "{$no_order} team" . ( $no_order === 1 ? ' has' : 's have' ) . ' no draft order set — using alphabetical order for those.' ];
        }
        $settings = class_exists( 'GRSH_Settings' ) ? GRSH_Settings::get() : [];
        $dd = $settings['draft_date'] ?? '';
        $out[] = $dd
            ? [ 'key' => 'date', 'level' => 'ok', 'text' => 'Draft date: ' . date_i18n( 'F j, Y', strtotime( $dd ) ) ]
            : [ 'key' => 'date', 'level' => 'warn', 'text' => 'No draft date set in Settings.', 'fix' => 'Open Settings', 'url' => admin_url( 'admin.php?page=grsh-tm-settings' ) ];
        $with_email = count( array_filter( $teams, fn( $t ) => is_email( (string) $t['captain_email'] ) ) );
        if ( $n >= 2 ) {
            $out[] = [ 'key' => 'captains', 'level' => $with_email === $n ? 'ok' : 'warn',
                'text' => "{$with_email} of {$n} teams have a captain with an email (needed for phone picks)." ];
        }
        return $out;
    }

    private static function payload( string $div ): array {
        $sid   = self::season_id();
        $teams = self::teams( $sid, $div );
        $pool  = self::pool( $sid, $div );
        list( $by_team, $picks ) = self::rosters( $sid, array_map( fn( $t ) => (int) $t['id'], $teams ) );
        $state = self::state_get( $div );

        $drafted = count( $picks );
        $n       = count( $teams );
        $total_players = count( $pool ) + array_sum( array_map( 'count', $by_team ) );
        // Rounds are fixed when the draft starts; before that, show what it would be.
        $rounds = (int) $state['rounds'] ?: ( $n ? (int) ceil( $total_players / $n ) : 0 );
        $total_slots = $rounds * $n;

        // Resolve the order for display (before start, from current team order).
        $st_for_order = $state;
        if ( empty( $st_for_order['order'] ) ) {
            $st_for_order['order'] = array_map( fn( $t ) => (int) $t['id'], $teams );
        }
        $slots = [];
        for ( $i = 0; $i < $total_slots; $i++ ) {
            $slots[] = self::slot_team( $st_for_order, $i );
        }
        $status = $state['status'];
        if ( $status === 'active' && ( $drafted >= $total_slots || ! $pool ) ) {
            $status = 'complete';
        }

        $remaining = null;
        if ( $status === 'active' ) {
            $remaining = max( 0, (int) $state['deadline_ts'] - time() );
        } elseif ( $status === 'paused' ) {
            $remaining = (int) $state['paused_remaining'];
        }

        $teams_out = array_map( function ( $t ) use ( $by_team, $state ) {
            return [
                'id' => (int) $t['id'], 'name' => $t['name'], 'colour' => $t['colour'] ?: '#666666',
                'draft_order' => $t['draft_order'] !== null ? (int) $t['draft_order'] : null,
                'captain_has_email' => is_email( (string) $t['captain_email'] ),
                'captain_link' => isset( $state['captain_tokens'][ $t['id'] ] ),
                'players' => $by_team[ (int) $t['id'] ] ?? [],
            ];
        }, $teams );

        $recap_url = $state['recap_key'] ? add_query_arg( 'grsh_draft_recap', $state['recap_key'], home_url( '/' ) ) : '';

        return [
            'season_id'  => $sid,
            'server_now' => time(),
            'divisions'  => self::divisions( $sid ),
            'division'   => $div,
            'division_label' => self::division_label( $div ),
            'max_player_score' => GRSH_Scoring::MAX_PLAYER_SCORE,
            'parity'     => [ 'rebalance_low' => GRSH_Scoring::PARITY_REBALANCE_LOW, 'review_low' => GRSH_Scoring::PARITY_REVIEW_LOW,
                              'review_high' => GRSH_Scoring::PARITY_REVIEW_HIGH, 'rebalance_high' => GRSH_Scoring::PARITY_REBALANCE_HIGH ],
            'teams'      => $teams_out,
            'pool'       => $pool,
            'picks'      => $picks,
            'preflight'  => self::preflight( $teams, $pool, $by_team, $picks, $div ),
            'state'      => [
                'status' => $status, 'rounds' => $rounds, 'total_slots' => $total_slots, 'next_pick' => $drafted + 1,
                'slots' => $slots, 'clock_seconds' => (int) $state['clock_seconds'], 'remaining' => $remaining,
                'captain_links' => ! empty( $state['captain_tokens'] ), 'published_at' => $state['published_at'], 'recap_url' => $recap_url,
            ],
        ];
    }

    private static function div_from( WP_REST_Request $r ): string {
        $div = sanitize_key( (string) ( $r->get_param( 'division' ) ?? '' ) );
        if ( $div ) {
            return $div;
        }
        $list = self::divisions( self::season_id() );
        return $list ? $list[0]['key'] : 'gold_open';
    }

    // -------------------------------------------------------------------------
    // Admin endpoints
    // -------------------------------------------------------------------------

    public static function get_draft( WP_REST_Request $r ): WP_REST_Response {
        return new WP_REST_Response( self::payload( self::div_from( $r ) ), 200 );
    }

    public static function action_start( WP_REST_Request $r ): WP_REST_Response {
        $div = self::div_from( $r );
        $res = self::lock( function () use ( $div, $r ) {
            $p = self::payload( $div );
            foreach ( $p['preflight'] as $c ) {
                if ( $c['level'] === 'fail' ) {
                    return new WP_Error( 'preflight', 'Cannot start: ' . $c['text'], [ 'status' => 422 ] );
                }
            }
            $s = self::state_get( $div );
            $clock = (int) $r->get_param( 'clock_seconds' );
            $s['clock_seconds'] = max( 15, min( 600, $clock ?: (int) $s['clock_seconds'] ?: self::default_clock() ) );
            if ( empty( $s['order'] ) || $s['status'] === 'ready' ) {
                $s['order'] = array_map( fn( $t ) => (int) $t['id'], $p['teams'] );
                $total = count( $p['pool'] ) + array_sum( array_map( fn( $t ) => count( $t['players'] ), $p['teams'] ) );
                $s['rounds'] = (int) ceil( $total / max( 1, count( $p['teams'] ) ) );
            }
            $s['status']      = 'active';
            $s['deadline_ts'] = time() + $s['clock_seconds'];
            $s['started_at']  = $s['started_at'] ?: current_time( 'mysql' );
            self::state_save( $div, $s );
            self::audit( 'draft_started', null, [ 'division' => $div, 'rounds' => $s['rounds'], 'clock' => $s['clock_seconds'] ] );
            self::notify_on_clock( $div );
            return true;
        } );
        if ( is_wp_error( $res ) ) { return self::err( $res ); }
        return new WP_REST_Response( self::payload( $div ), 200 );
    }

    /** Shared by the admin pick and the captain's phone pick. */
    private static function do_pick( string $div, int $player_id, ?int $require_team ) {
        global $wpdb;
        return self::lock( function () use ( $div, $player_id, $require_team, $wpdb ) {
            $sid = self::season_id();
            $s   = self::state_get( $div );
            if ( $s['status'] !== 'active' ) {
                return new WP_Error( 'state', 'The draft is not running.', [ 'status' => 409 ] );
            }
            $teams = self::teams( $sid, $div );
            list( , $picks ) = self::rosters( $sid, array_map( fn( $t ) => (int) $t['id'], $teams ) );
            $made  = count( $picks );
            $total = (int) $s['rounds'] * count( $s['order'] );
            if ( $made >= $total ) {
                return new WP_Error( 'state', 'Every pick has been made.', [ 'status' => 409 ] );
            }
            $team_id = self::slot_team( $s, $made );
            if ( $require_team !== null && $require_team !== $team_id ) {
                return new WP_Error( 'clock', 'Your team is not on the clock.', [ 'status' => 409 ] );
            }
            $pool = self::pool( $sid, $div );
            $found = null;
            foreach ( $pool as $p ) {
                if ( $p['id'] === $player_id ) { $found = $p; break; }
            }
            if ( ! $found ) {
                return new WP_Error( 'player', 'That player is no longer available.', [ 'status' => 409 ] );
            }
            $n = count( $s['order'] );
            $ok = $wpdb->insert( "{$wpdb->prefix}grsh_rosters", [
                'season_id' => $sid, 'team_id' => $team_id, 'player_id' => $player_id,
                'registration_id' => (int) $found['registration_id'], 'assignment_type' => 'draft',
                'draft_round' => intdiv( $made, $n ) + 1, 'draft_pick' => $made + 1,
                'assigned_by' => get_current_user_id(), 'assigned_at' => current_time( 'mysql' ),
                'position_assigned' => $found['position'], 'skill_tier_at_draft' => $found['skill_tier_assigned'] ?: $found['skill_tier_reported'],
            ] );
            if ( ! $ok ) {
                return new WP_Error( 'db', 'Could not save the pick: ' . $wpdb->last_error, [ 'status' => 500 ] );
            }
            self::audit( 'draft_pick', $player_id, [ 'division' => $div, 'pick' => $made + 1, 'team_id' => $team_id ] );
            if ( $made + 1 >= $total || count( $pool ) <= 1 ) {
                $s['status'] = 'complete';
                $s['deadline_ts'] = 0;
                self::state_save( $div, $s );
            } else {
                $s['deadline_ts'] = time() + (int) $s['clock_seconds'];
                self::state_save( $div, $s );
                self::notify_on_clock( $div );
            }
            return true;
        } );
    }

    public static function action_pick( WP_REST_Request $r ): WP_REST_Response {
        $div = self::div_from( $r );
        $res = self::do_pick( $div, absint( $r->get_param( 'player_id' ) ), $r->get_param( 'team_id' ) ? absint( $r->get_param( 'team_id' ) ) : null );
        if ( is_wp_error( $res ) ) { return self::err( $res ); }
        return new WP_REST_Response( self::payload( $div ), 200 );
    }

    public static function action_undo( WP_REST_Request $r ): WP_REST_Response {
        global $wpdb;
        $div = self::div_from( $r );
        $res = self::lock( function () use ( $div, $wpdb ) {
            $sid   = self::season_id();
            $teams = self::teams( $sid, $div );
            $ids   = array_map( fn( $t ) => (int) $t['id'], $teams );
            if ( ! $ids ) { return new WP_Error( 'none', 'No teams.', [ 'status' => 404 ] ); }
            $ph  = implode( ',', array_fill( 0, count( $ids ), '%d' ) );
            $row = $wpdb->get_row( $wpdb->prepare(
                "SELECT id, player_id, draft_pick FROM {$wpdb->prefix}grsh_rosters
                  WHERE season_id = %d AND assignment_type = 'draft' AND draft_pick > 0 AND team_id IN ($ph)
               ORDER BY draft_pick DESC LIMIT 1", array_merge( [ $sid ], $ids ) ), ARRAY_A );
            if ( ! $row ) { return new WP_Error( 'none', 'Nothing to undo.', [ 'status' => 409 ] ); }
            $wpdb->delete( "{$wpdb->prefix}grsh_rosters", [ 'id' => (int) $row['id'] ] );
            $s = self::state_get( $div );
            if ( $s['status'] === 'complete' ) { $s['status'] = 'active'; }
            $s['deadline_ts'] = time() + (int) $s['clock_seconds'];
            $s['notified_slot'] = -1;
            self::state_save( $div, $s );
            self::audit( 'draft_undo', (int) $row['player_id'], [ 'division' => $div, 'pick' => (int) $row['draft_pick'] ] );
            return true;
        } );
        if ( is_wp_error( $res ) ) { return self::err( $res ); }
        return new WP_REST_Response( self::payload( $div ), 200 );
    }

    public static function action_pause( WP_REST_Request $r ): WP_REST_Response {
        $div = self::div_from( $r );
        $s = self::state_get( $div );
        if ( $s['status'] === 'active' ) {
            $s['paused_remaining'] = max( 0, (int) $s['deadline_ts'] - time() );
            $s['status'] = 'paused';
            self::state_save( $div, $s );
        }
        return new WP_REST_Response( self::payload( $div ), 200 );
    }

    public static function action_resume( WP_REST_Request $r ): WP_REST_Response {
        $div = self::div_from( $r );
        $s = self::state_get( $div );
        if ( $s['status'] === 'paused' ) {
            $s['status'] = 'active';
            $s['deadline_ts'] = time() + max( 10, (int) $s['paused_remaining'] );
            self::state_save( $div, $s );
        }
        return new WP_REST_Response( self::payload( $div ), 200 );
    }

    public static function action_trade( WP_REST_Request $r ): WP_REST_Response {
        $div = self::div_from( $r );
        $a = absint( $r->get_param( 'pick_a' ) );
        $b = absint( $r->get_param( 'pick_b' ) );
        $res = self::lock( function () use ( $div, $a, $b ) {
            $sid = self::season_id();
            $s   = self::state_get( $div );
            $teams = self::teams( $sid, $div );
            list( , $picks ) = self::rosters( $sid, array_map( fn( $t ) => (int) $t['id'], $teams ) );
            $made  = count( $picks );
            $total = (int) $s['rounds'] * count( $s['order'] );
            if ( ! $a || ! $b || $a === $b || $a <= $made || $b <= $made || $a > $total || $b > $total ) {
                return new WP_Error( 'trade', 'Choose two different upcoming picks.', [ 'status' => 422 ] );
            }
            $ta = self::slot_team( $s, $a - 1 );
            $tb = self::slot_team( $s, $b - 1 );
            if ( $ta === $tb ) {
                return new WP_Error( 'trade', 'Both picks already belong to the same team.', [ 'status' => 422 ] );
            }
            $s['overrides'][ $a - 1 ] = $tb;
            $s['overrides'][ $b - 1 ] = $ta;
            $s['notified_slot'] = -1;
            self::state_save( $div, $s );
            self::audit( 'draft_trade', null, [ 'division' => $div, 'pick_a' => $a, 'team_a' => $ta, 'pick_b' => $b, 'team_b' => $tb ] );
            return true;
        } );
        if ( is_wp_error( $res ) ) { return self::err( $res ); }
        return new WP_REST_Response( self::payload( $div ), 200 );
    }

    public static function action_reset( WP_REST_Request $r ): WP_REST_Response {
        global $wpdb;
        $div = self::div_from( $r );
        if ( ! $r->get_param( 'confirm' ) ) {
            return new WP_REST_Response( [ 'error' => 'Confirmation required.' ], 400 );
        }
        $res = self::lock( function () use ( $div, $wpdb ) {
            $sid = self::season_id();
            $ids = array_map( fn( $t ) => (int) $t['id'], self::teams( $sid, $div ) );
            if ( $ids ) {
                $ph = implode( ',', array_fill( 0, count( $ids ), '%d' ) );
                $wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->prefix}grsh_rosters WHERE season_id = %d AND assignment_type = 'draft' AND team_id IN ($ph)", array_merge( [ $sid ], $ids ) ) );
            }
            $old = self::state_get( $div );
            foreach ( $old['captain_tokens'] as $tok ) { delete_option( 'grsh_draft_cap_' . $tok ); }
            delete_option( self::STATE_OPT . $div );
            self::audit( 'draft_reset', null, [ 'division' => $div ] );
            return true;
        } );
        if ( is_wp_error( $res ) ) { return self::err( $res ); }
        return new WP_REST_Response( self::payload( $div ), 200 );
    }

    // ---- captain links + on-the-clock email ------------------------------------

    public static function action_captain_links( WP_REST_Request $r ): WP_REST_Response {
        $div   = self::div_from( $r );
        $sid   = self::season_id();
        $s     = self::state_get( $div );
        $send  = (bool) $r->get_param( 'send' );
        $sent  = 0; $missing = [];
        foreach ( self::teams( $sid, $div ) as $t ) {
            $email = (string) $t['captain_email'];
            if ( ! is_email( $email ) ) { $missing[] = $t['name']; continue; }
            $tid = (int) $t['id'];
            if ( empty( $s['captain_tokens'][ $tid ] ) ) {
                $tok = bin2hex( random_bytes( 32 ) );
                $s['captain_tokens'][ $tid ] = $tok;
                update_option( 'grsh_draft_cap_' . $tok, [ 'division' => $div, 'team_id' => $tid ], false );
            }
            if ( $send && $sent < self::MAX_EMAILS ) {
                $link = add_query_arg( 'grsh_draft_captain', $s['captain_tokens'][ $tid ], home_url( '/' ) );
                $ok = wp_mail( $email, 'Your Gold Rush draft link — ' . $t['name'],
                    '<p>Hi,</p><p>This is your private link for the <strong>' . esc_html( self::division_label( $div ) ) . '</strong> draft. '
                    . 'Open it on your phone to see the board and make your picks when <strong>' . esc_html( $t['name'] ) . '</strong> is on the clock. Please do not share it.</p>'
                    . '<p><a href="' . esc_url( $link ) . '">' . esc_html( $link ) . '</a></p><p>Gold Rush Senior Hockey</p>',
                    [ 'Content-Type: text/html; charset=UTF-8' ] );
                $sent += $ok ? 1 : 0;
            }
        }
        self::state_save( $div, $s );
        self::audit( 'draft_captain_links', null, [ 'division' => $div, 'sent' => $sent, 'no_email' => $missing ] );
        $p = self::payload( $div );
        $p['links_result'] = [ 'sent' => $sent, 'missing_email' => $missing ];
        return new WP_REST_Response( $p, 200 );
    }

    private static function notify_on_clock( string $div ): void {
        $s = self::state_get( $div );
        if ( $s['status'] !== 'active' || empty( $s['captain_tokens'] ) ) { return; }
        $sid   = self::season_id();
        $teams = self::teams( $sid, $div );
        list( , $picks ) = self::rosters( $sid, array_map( fn( $t ) => (int) $t['id'], $teams ) );
        $slot = count( $picks );
        if ( (int) $s['notified_slot'] === $slot ) { return; }
        $tid = self::slot_team( $s, $slot );
        if ( ! $tid || empty( $s['captain_tokens'][ $tid ] ) ) { return; }
        foreach ( $teams as $t ) {
            if ( (int) $t['id'] === $tid && is_email( (string) $t['captain_email'] ) ) {
                $link = add_query_arg( 'grsh_draft_captain', $s['captain_tokens'][ $tid ], home_url( '/' ) );
                wp_mail( $t['captain_email'], "You're on the clock — " . $t['name'],
                    '<p><strong>' . esc_html( $t['name'] ) . '</strong> is on the clock (pick #' . ( $slot + 1 ) . ').</p><p><a href="' . esc_url( $link ) . '">Make your pick</a></p>',
                    [ 'Content-Type: text/html; charset=UTF-8' ] );
            }
        }
        $s['notified_slot'] = $slot;
        self::state_save( $div, $s );
    }

    // ---- publish ------------------------------------------------------------------

    public static function action_publish( WP_REST_Request $r ): WP_REST_Response {
        global $wpdb;
        $div = self::div_from( $r );
        $s   = self::state_get( $div );
        $p   = self::payload( $div );
        if ( $p['state']['status'] !== 'complete' ) {
            return new WP_REST_Response( [ 'error' => 'Finish the draft before publishing.' ], 409 );
        }
        if ( $s['published_at'] && ! $r->get_param( 'resend' ) ) {
            return new WP_REST_Response( [ 'error' => 'Already published ' . $s['published_at'] . '. Use resend to email everyone again.' ], 409 );
        }
        if ( ! $s['recap_key'] ) {
            $s['recap_key'] = bin2hex( random_bytes( 12 ) );
        }
        update_option( 'grsh_draft_recap_' . $s['recap_key'], $div, false );
        $recap = add_query_arg( 'grsh_draft_recap', $s['recap_key'], home_url( '/' ) );

        $ids = [];
        foreach ( $p['teams'] as $t ) { foreach ( $t['players'] as $pl ) { $ids[ $pl['id'] ] = $t['name']; } }
        $emails = $ids ? $wpdb->get_results( "SELECT id, first_name, email FROM {$wpdb->prefix}grsh_players WHERE id IN (" . implode( ',', array_map( 'intval', array_keys( $ids ) ) ) . ')', ARRAY_A ) : [];
        $sent = 0; $failed = 0; $skipped = 0;
        foreach ( $emails as $e ) {
            if ( $sent + $failed >= self::MAX_EMAILS ) { $skipped++; continue; }
            if ( ! is_email( $e['email'] ) ) { $skipped++; continue; }
            $team = $ids[ (int) $e['id'] ];
            $ok = wp_mail( $e['email'], 'Gold Rush ' . self::division_label( $div ) . ": you're on " . $team,
                '<p>Hi ' . esc_html( $e['first_name'] ) . ',</p><p>The draft is done and you were picked for <strong>' . esc_html( $team ) . '</strong>.</p>'
                . '<p>See every roster: <a href="' . esc_url( $recap ) . '">' . esc_html( $recap ) . '</a></p><p>Gold Rush Senior Hockey</p>',
                [ 'Content-Type: text/html; charset=UTF-8' ] );
            $ok ? $sent++ : $failed++;
        }
        $s['published_at'] = current_time( 'mysql' );
        self::state_save( $div, $s );
        self::audit( 'draft_published', null, [ 'division' => $div, 'sent' => $sent, 'failed' => $failed, 'skipped' => $skipped ] );
        $out = self::payload( $div );
        $out['publish_result'] = [ 'sent' => $sent, 'failed' => $failed, 'skipped' => $skipped ];
        return new WP_REST_Response( $out, 200 );
    }

    // -------------------------------------------------------------------------
    // Captain endpoints (token only)
    // -------------------------------------------------------------------------

    private static function captain_ctx( string $token ) {
        if ( ! preg_match( '/^[a-f0-9]{64}$/', $token ) ) { return null; }
        $c = get_option( 'grsh_draft_cap_' . $token );
        return is_array( $c ) && ! empty( $c['division'] ) ? $c : null;
    }

    public static function captain_view( WP_REST_Request $r ): WP_REST_Response {
        $c = self::captain_ctx( (string) $r->get_param( 'token' ) );
        if ( ! $c ) { return new WP_REST_Response( [ 'error' => 'This link is not valid.' ], 404 ); }
        $p  = self::payload( $c['division'] );
        $st = $p['state'];
        $slot = $st['next_pick'] - 1;
        $on_clock = $st['slots'][ $slot ] ?? null;
        $mine = null; $names = [];
        foreach ( $p['teams'] as $t ) {
            $names[ $t['id'] ] = $t['name'];
            if ( $t['id'] === (int) $c['team_id'] ) { $mine = $t; }
        }
        $pool = array_map( function ( $pl ) {
            return [ 'id' => $pl['id'], 'name' => $pl['first_name'] . ' ' . $pl['last_name'], 'position' => $pl['position'], 'goalie' => $pl['is_goalie'],
                     'tier' => $pl['skill_tier_assigned'] ?: $pl['skill_tier_reported'], 'years' => $pl['years_experience'], 'score' => self::score( $pl ) ];
        }, $p['pool'] );
        usort( $pool, fn( $a, $b ) => $b['score'] <=> $a['score'] );
        return new WP_REST_Response( [
            'division' => $p['division_label'], 'team' => $mine ? $mine['name'] : '', 'status' => $st['status'],
            'on_clock_team' => $on_clock ? ( $names[ $on_clock ] ?? '' ) : '', 'my_turn' => $st['status'] === 'active' && $on_clock === (int) $c['team_id'],
            'pick' => $st['next_pick'], 'total' => $st['total_slots'], 'remaining' => $st['remaining'],
            'roster' => $mine ? array_map( fn( $pl ) => $pl['first_name'] . ' ' . $pl['last_name'] . ( $pl['position'] ? ' · ' . $pl['position'] : '' ), $mine['players'] ) : [],
            'recent' => array_map( fn( $pk ) => '#' . $pk['pick'] . ' ' . ( $names[ $pk['team_id'] ] ?? '' ) . ': ' . $pk['player']['first_name'] . ' ' . $pk['player']['last_name'], array_slice( array_reverse( $p['picks'] ), 0, 5 ) ),
            'pool' => $pool,
        ], 200 );
    }

    public static function captain_pick( WP_REST_Request $r ): WP_REST_Response {
        $c = self::captain_ctx( (string) $r->get_param( 'token' ) );
        if ( ! $c ) { return new WP_REST_Response( [ 'error' => 'This link is not valid.' ], 404 ); }
        $res = self::do_pick( $c['division'], absint( $r->get_param( 'player_id' ) ), (int) $c['team_id'] );
        if ( is_wp_error( $res ) ) { return self::err( $res ); }
        return new WP_REST_Response( [ 'ok' => true ], 200 );
    }

    // -------------------------------------------------------------------------
    // Public landing pages
    // -------------------------------------------------------------------------

    public static function handle_landing(): void {
        if ( is_admin() ) { return; }
        if ( ! empty( $_GET['grsh_draft_captain'] ) ) {
            $tok = sanitize_text_field( wp_unslash( $_GET['grsh_draft_captain'] ) );
            if ( self::captain_ctx( $tok ) ) { self::captain_page( $tok ); }
        }
        if ( ! empty( $_GET['grsh_draft_recap'] ) ) {
            $key = sanitize_text_field( wp_unslash( $_GET['grsh_draft_recap'] ) );
            if ( preg_match( '/^[a-f0-9]{24}$/', $key ) ) {
                $div = get_option( 'grsh_draft_recap_' . $key );
                if ( $div ) { self::recap_page( (string) $div ); }
            }
        }
    }

    private static function shell_start( string $title ): void {
        nocache_headers();
        status_header( 200 );
        header( 'Content-Type: text/html; charset=UTF-8' );
        echo '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
           . '<meta name="robots" content="noindex,nofollow"><title>' . esc_html( $title ) . '</title>'
           . '<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f5f0;margin:0;padding:16px;color:#1a1a2e}'
           . '.card{background:#fff;border-radius:14px;padding:16px;margin:0 auto 12px;max-width:640px;box-shadow:0 4px 18px rgba(0,0,0,.07)}'
           . 'h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:0 0 8px}.m{color:#555566;font-size:14px}'
           . '.row{display:flex;gap:8px;align-items:center;padding:9px 0;border-bottom:1px solid #f0eee8}.row b{flex:1}'
           . 'button{font-size:15px;font-weight:700;background:#1a1a2e;color:#D4A017;border:0;border-radius:8px;padding:9px 14px}button[disabled]{background:#ddd;color:#888}'
           . 'input,select{font-size:16px;padding:8px;border:1px solid #e2e0d8;border-radius:8px}.clock{background:#D4A017;color:#1a1a2e}'
           . '</style></head><body>';
    }

    private static function captain_page( string $token ): void {
        self::shell_start( 'Draft — your picks' );
        $api = esc_url( rest_url( 'grsh/v1/draft/captain' ) );
        echo '<div class="card" id="head"><h1>Loading…</h1></div><div class="card" id="mine"></div><div class="card"><h2>Available players</h2>'
           . '<input id="q" placeholder="Search" style="width:100%;box-sizing:border-box;margin-bottom:6px">'
           . '<select id="pos" style="width:100%;margin-bottom:6px"><option value="">All positions</option><option value="goaltender">Goalies</option><option value="defenseman">Defense</option><option value="center">Centers</option><option value="winger">Wingers</option></select>'
           . '<div id="pool"></div></div><div class="card"><h2>Recent picks</h2><div id="recent" class="m"></div></div>';
        echo '<script>var API=' . wp_json_encode( $api ) . ',TOK=' . wp_json_encode( $token ) . ',D=null;'
           . 'function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!==undefined)e.textContent=x;return e}'
           . 'function load(){fetch(API+"?token="+TOK).then(function(r){return r.json()}).then(function(d){D=d;draw()}).catch(function(){})}'
           . 'function draw(){if(!D)return;if(D.error){document.getElementById("head").textContent=D.error;return}'
           . 'var h=document.getElementById("head");h.innerHTML="";h.appendChild(el("h1","",D.team+" — "+D.division));'
           . 'var s=D.status==="active"?(D.my_turn?"YOU ARE ON THE CLOCK — pick #"+D.pick+(D.remaining!==null?" ("+D.remaining+"s)":""):"On the clock: "+D.on_clock_team+" (pick #"+D.pick+" of "+D.total+")"):(D.status==="complete"?"The draft is complete.":(D.status==="paused"?"Draft paused.":"The draft has not started."));'
           . 'var b=el("div","m",s);if(D.my_turn)b.className="card clock";h.appendChild(b);'
           . 'var m=document.getElementById("mine");m.innerHTML="";m.appendChild(el("h2","","Your roster ("+D.roster.length+")"));D.roster.forEach(function(x){m.appendChild(el("div","m",x))});if(!D.roster.length)m.appendChild(el("div","m","No picks yet"));'
           . 'var q=document.getElementById("q").value.toLowerCase(),p=document.getElementById("pos").value,pl=document.getElementById("pool");pl.innerHTML="";'
           . 'D.pool.filter(function(x){return(!q||x.name.toLowerCase().indexOf(q)>-1)&&(!p||x.position===p||(p==="goaltender"&&x.goalie))}).slice(0,80).forEach(function(x){'
           . 'var r=el("div","row");r.appendChild(el("b","",x.name));r.appendChild(el("span","m",(x.position||"?")+" · "+(x.tier||"")+" · "+x.score.toFixed(1)));'
           . 'var bt=el("button","","Pick");bt.disabled=!D.my_turn;bt.onclick=function(){if(confirm("Pick "+x.name+"?"))pick(x.id)};r.appendChild(bt);pl.appendChild(r)});'
           . 'var rc=document.getElementById("recent");rc.innerHTML="";D.recent.forEach(function(x){rc.appendChild(el("div","",x))});}'
           . 'function pick(id){fetch(API+"/pick",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:TOK,player_id:id})}).then(function(r){return r.json()}).then(function(d){if(d.error)alert(d.error);load()})}'
           . 'document.getElementById("q").oninput=draw;document.getElementById("pos").onchange=draw;load();setInterval(load,4000);</script></body></html>';
        exit;
    }

    private static function recap_page( string $div ): void {
        $p = self::payload( $div );
        self::shell_start( $p['division_label'] . ' draft results' );
        echo '<div class="card"><h1>' . esc_html( $p['division_label'] ) . ' — draft results</h1><div class="m">Gold Rush Senior Hockey</div></div>';
        foreach ( $p['teams'] as $t ) {
            echo '<div class="card"><h2 style="color:' . esc_attr( $t['colour'] ) . '">' . esc_html( $t['name'] ) . '</h2>';
            foreach ( $t['players'] as $pl ) {
                echo '<div class="row"><b>' . esc_html( $pl['first_name'] . ' ' . $pl['last_name'] ) . '</b><span class="m">' . esc_html( $pl['position'] ? ucfirst( $pl['position'] === 'goaltender' ? 'goalie' : $pl['position'] ) : '' ) . '</span></div>';
            }
            echo '</div>';
        }
        echo '</body></html>';
        exit;
    }
}
