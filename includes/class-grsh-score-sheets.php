<?php
/**
 * GRSH Score Sheets — batch print-ready game score sheets with rosters filled in.
 *
 * Rebuilt 2026-11-17. What was wrong with the first version:
 *   - the roster table was hard-capped at 16 numbered rows, so a 17th player silently vanished from the printed sheet;
 *   - a game whose team could not be found was skipped without a word (you could print fewer sheets than you queued);
 *   - "temporary debug hardening" switched PHP error display on and printed stack traces to the browser;
 *   - get_season_id() ended in "?: 1", so a missing season quietly meant season 1;
 *   - any team id was accepted, including teams from another season.
 * Now: every rostered player prints, anything skipped is listed at the top of the print page, errors go to the log,
 * and a missing season is reported instead of replaced.
 *
 * Added: roster readiness warnings, one-sheet preview, schedule import from SportsPress events, saved batches, print
 * history with a roster snapshot, "changed since last print" flags, print order and cover page, print comfort options,
 * captain / alternate markers, a back page for goals and extra penalties, and a QR code on every sheet that opens
 * the print record (admins only) so staff can compare the paper roster with what was printed.
 *
 * The sheet itself is plain HTML that the browser prints (no PDF library on this host).
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class GRSH_Score_Sheets {

    const MAX_GAMES   = 60;      // games per print run
    const MAX_BATCHES = 30;
    const MAX_LOG     = 10;
    const MAX_ARENAS  = 20;
    const MIN_ROWS    = 16;      // numbered roster rows printed at minimum (more rows are added if the roster is bigger)
    const OPT_BATCHES = 'grsh_ss_batches';
    const OPT_ARENAS  = 'grsh_ss_arenas';
    const OPT_LOG     = 'grsh_ss_print_log';
    const OPT_SNAPS   = 'grsh_ss_roster_snaps';
    const TYPES       = [ 'REG' => 'Regular', 'MAKEUP' => 'Makeup', 'PLAYOFF' => 'Play-off', 'CHAMP' => 'Championship' ];
    const ORDERS      = [ 'queue', 'time', 'arena' ];

    public static function register_hooks(): void {
        // Priority 20: must fire AFTER grsh_register_admin_menu() creates the parent menu.
        add_action( 'admin_menu', [ __CLASS__, 'register_admin_page' ], 20 );
        add_action( 'rest_api_init', [ __CLASS__, 'register_routes' ] );
        add_action( 'admin_post_grsh_print_score_sheets', [ __CLASS__, 'handle_print_request' ] );
    }

    public static function register_admin_page(): void {
        add_submenu_page( 'grsh-tm-dashboard', __( 'Print Score Sheets', 'grsh' ), __( 'Print Score Sheets', 'grsh' ), 'manage_options', 'grsh-score-sheets', 'grsh_render_app_shell' );
    }

    public static function register_routes(): void {
        $perm = function () { return current_user_can( 'manage_options' ); };
        $r = function ( $path, $methods, $cb ) use ( $perm ) {
            register_rest_route( 'grsh/v1', '/score-sheets/' . $path, [ 'methods' => $methods, 'callback' => [ __CLASS__, $cb ], 'permission_callback' => $perm ] );
        };
        $r( 'overview', WP_REST_Server::READABLE, 'rest_overview' );
        $r( 'preview', WP_REST_Server::CREATABLE, 'rest_preview' );
        $r( 'batch-save', WP_REST_Server::CREATABLE, 'rest_batch_save' );
        $r( 'batch-delete', WP_REST_Server::CREATABLE, 'rest_batch_delete' );
        $r( 'record', WP_REST_Server::READABLE, 'rest_record' );
    }

    // -------------------------------------------------------------------------
    // Data
    // -------------------------------------------------------------------------

    /** The season in Settings. No fallback: a missing season is reported, never replaced by season 1. */
    public static function season(): array {
        global $wpdb;
        $year = class_exists( 'GRSH_Settings' ) ? (int) ( GRSH_Settings::get()['season_year'] ?? 0 ) : 0;
        $id   = $year ? (int) $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}grsh_seasons WHERE season_year = %d LIMIT 1", $year ) ) : 0;
        return [ 'id' => $id, 'year' => $year, 'exists' => $id > 0 ];
    }

    private static function division_rules(): array {
        $out = [];
        if ( class_exists( 'GRSH_Settings' ) ) {
            foreach ( GRSH_Settings::get_active_divisions() as $d ) {
                $out[ $d['key'] ] = [
                    'label'      => (string) ( $d['label'] ?? $d['key'] ),
                    'min_roster' => isset( $d['min_roster'] ) ? (int) $d['min_roster'] : null,
                    'max_roster' => isset( $d['max_roster'] ) ? (int) $d['max_roster'] : null,
                    'goalie_min' => isset( $d['goalie_min'] ) ? (int) $d['goalie_min'] : null,
                    'goalie_max' => isset( $d['goalie_max'] ) ? (int) $d['goalie_max'] : null,
                ];
            }
        }
        return $out;
    }

    private static function division_label( string $key, array $rules ): string {
        return $rules[ $key ]['label'] ?? $key;
    }

    /** Roster rows for every team in the season, sorted for printing: goalies first, then jersey number with blanks last. */
    private static function load_rosters( int $season_id ): array {
        global $wpdb;
        $rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT ro.team_id, ro.player_id, ro.jersey_number, ro.is_captain, ro.is_alternate,
                    COALESCE(NULLIF(ro.position_assigned, ''), p.position) AS pos, p.first_name, p.last_name
             FROM {$wpdb->prefix}grsh_rosters ro JOIN {$wpdb->prefix}grsh_players p ON p.id = ro.player_id
             WHERE ro.season_id = %d", $season_id
        ), ARRAY_A ) ?: [];
        $by = [];
        foreach ( $rows as $r ) {
            $by[ (int) $r['team_id'] ][] = [
                'player_id' => (int) $r['player_id'],
                'name'      => trim( $r['first_name'] . ' ' . $r['last_name'] ),
                'jersey'    => ( $r['jersey_number'] === null || $r['jersey_number'] === '' ) ? null : (int) $r['jersey_number'],
                'goalie'    => $r['pos'] === 'goaltender',
                'captain'   => (int) $r['is_captain'] === 1,
                'alternate' => (int) $r['is_alternate'] === 1,
            ];
        }
        foreach ( $by as $tid => $list ) {
            usort( $list, function ( $a, $b ) {
                if ( $a['goalie'] !== $b['goalie'] ) { return $a['goalie'] ? -1 : 1; }
                $aj = $a['jersey'] === null ? 9999 : $a['jersey'];
                $bj = $b['jersey'] === null ? 9999 : $b['jersey'];
                return $aj <=> $bj ?: strcmp( $a['name'], $b['name'] );
            } );
            $by[ $tid ] = $list;
        }
        return $by;
    }

    /** Warnings that matter at the rink. level: bad = fix before printing, warn = check it, info = FYI. */
    public static function team_warnings( array $players, array $rule ): array {
        $w = [];
        $n = count( $players );
        if ( $n === 0 ) {
            return [ [ 'code' => 'no_roster', 'level' => 'bad', 'text' => 'No players on the roster. The sheet will print empty.' ] ];
        }
        $goalies = count( array_filter( $players, function ( $p ) { return $p['goalie']; } ) );
        if ( $rule['min_roster'] !== null && $n < $rule['min_roster'] ) { $w[] = [ 'code' => 'under_min', 'level' => 'warn', 'text' => "Only {$n} players (minimum {$rule['min_roster']})." ]; }
        if ( $rule['max_roster'] !== null && $n > $rule['max_roster'] ) { $w[] = [ 'code' => 'over_max', 'level' => 'warn', 'text' => "{$n} players (maximum {$rule['max_roster']})." ]; }
        if ( $goalies === 0 ) { $w[] = [ 'code' => 'no_goalie', 'level' => 'warn', 'text' => 'No goalie on the roster.' ]; }
        elseif ( $rule['goalie_max'] !== null && $goalies > $rule['goalie_max'] ) { $w[] = [ 'code' => 'many_goalies', 'level' => 'info', 'text' => "{$goalies} goalies (maximum {$rule['goalie_max']})." ]; }
        $missing = array_map( function ( $p ) { return $p['name']; }, array_filter( $players, function ( $p ) { return $p['jersey'] === null; } ) );
        if ( $missing ) { $w[] = [ 'code' => 'no_jersey', 'level' => 'warn', 'text' => 'No jersey number: ' . implode( ', ', array_slice( $missing, 0, 4 ) ) . ( count( $missing ) > 4 ? ' and ' . ( count( $missing ) - 4 ) . ' more' : '' ) . '.' ]; }
        $seen = []; $dups = [];
        foreach ( $players as $p ) {
            if ( $p['jersey'] === null ) { continue; }
            if ( isset( $seen[ $p['jersey'] ] ) ) { $dups[ $p['jersey'] ] = true; }
            $seen[ $p['jersey'] ] = true;
        }
        if ( $dups ) { $w[] = [ 'code' => 'dup_jersey', 'level' => 'bad', 'text' => 'Two players share number ' . implode( ', ', array_keys( $dups ) ) . '.' ]; }
        return $w;
    }

    /** What changed on a roster since the last time its sheet was printed. null = never printed or unchanged. */
    public static function changes_since_print( array $players, ?array $snap ): ?array {
        if ( ! $snap || empty( $snap['players'] ) ) { return null; }
        $now = [];
        foreach ( $players as $p ) { $now[ $p['player_id'] ] = $p; }
        $added = []; $removed = []; $jersey = [];
        foreach ( $now as $id => $p ) {
            if ( ! isset( $snap['players'][ $id ] ) ) { $added[] = $p['name']; }
            elseif ( ( $snap['players'][ $id ]['jersey'] ?? null ) !== $p['jersey'] ) { $jersey[] = $p['name']; }
        }
        foreach ( $snap['players'] as $id => $s ) {
            if ( ! isset( $now[ $id ] ) ) { $removed[] = (string) ( $s['name'] ?? '#' . $id ); }
        }
        if ( ! $added && ! $removed && ! $jersey ) { return null; }
        return [ 'at' => (string) ( $snap['at'] ?? '' ), 'added' => $added, 'removed' => $removed, 'jersey' => $jersey ];
    }

    private static function team_list( array $season ): array {
        global $wpdb;
        if ( ! $season['exists'] ) { return []; }
        $rules   = self::division_rules();
        $rosters = self::load_rosters( $season['id'] );
        $snaps   = (array) get_option( self::OPT_SNAPS, [] );
        $rows    = $wpdb->get_results( $wpdb->prepare(
            "SELECT id, name, division, team_type, captain_player_id FROM {$wpdb->prefix}grsh_teams WHERE season_id = %d ORDER BY name ASC", $season['id']
        ), ARRAY_A ) ?: [];
        $out = [];
        foreach ( $rows as $t ) {
            $id      = (int) $t['id'];
            $players = $rosters[ $id ] ?? [];
            $rule    = $rules[ $t['division'] ] ?? [ 'label' => (string) $t['division'], 'min_roster' => null, 'max_roster' => null, 'goalie_min' => null, 'goalie_max' => null ];
            $out[] = [
                'id'             => $id,
                'name'           => (string) $t['name'],
                'division'       => (string) $t['division'],
                'division_label' => $rule['label'],
                'type'           => (string) $t['team_type'],
                'players'        => count( $players ),
                'goalies'        => count( array_filter( $players, function ( $p ) { return $p['goalie']; } ) ),
                'warnings'       => self::team_warnings( $players, $rule ),
                'changed'        => self::changes_since_print( $players, $snaps[ $id ] ?? null ),
                'last_printed'   => $snaps[ $id ]['at'] ?? null,
            ];
        }
        return $out;
    }

    /** Upcoming SportsPress events whose two teams match GRSH teams by name. Empty when SportsPress is not there. */
    private static function schedule( array $teams ): array {
        global $wpdb;
        if ( ! post_type_exists( 'sp_event' ) ) { return [ 'available' => false, 'events' => [] ]; }
        $norm = function ( $s ) { return preg_replace( '/[^a-z0-9]+/', '', strtolower( (string) $s ) ); };
        $map  = [];
        foreach ( $teams as $t ) { $map[ $norm( $t['name'] ) ] = $t['id']; }
        $today = gmdate( 'Y-m-d 00:00:00', time() - DAY_IN_SECONDS );
        $evs = $wpdb->get_results( $wpdb->prepare(
            "SELECT ID, post_date FROM {$wpdb->posts} WHERE post_type = 'sp_event' AND post_status IN ('publish','future') AND post_date >= %s ORDER BY post_date ASC LIMIT 80", $today
        ), ARRAY_A ) ?: [];
        $out = [];
        foreach ( $evs as $e ) {
            $ids = $wpdb->get_col( $wpdb->prepare( "SELECT meta_value FROM {$wpdb->postmeta} WHERE post_id = %d AND meta_key = 'sp_team' AND meta_value <> '0' ORDER BY meta_id ASC", (int) $e['ID'] ) );
            if ( count( $ids ) < 2 ) { continue; }
            $names = [];
            foreach ( array_slice( $ids, 0, 2 ) as $tid ) {
                $names[] = (string) $wpdb->get_var( $wpdb->prepare( "SELECT post_title FROM {$wpdb->posts} WHERE ID = %d", (int) $tid ) );
            }
            $venue = '';
            if ( function_exists( 'wp_get_object_terms' ) ) {
                $terms = wp_get_object_terms( (int) $e['ID'], 'sp_venue', [ 'fields' => 'names' ] );
                if ( is_array( $terms ) && $terms ) { $venue = (string) $terms[0]; }
            }
            $out[] = [
                'id' => (int) $e['ID'], 'date' => substr( $e['post_date'], 0, 10 ), 'time' => substr( $e['post_date'], 11, 5 ), 'arena' => $venue,
                'home_name' => $names[0], 'away_name' => $names[1],
                'home_id' => $map[ $norm( $names[0] ) ] ?? 0, 'away_id' => $map[ $norm( $names[1] ) ] ?? 0,
            ];
        }
        return [ 'available' => true, 'events' => $out ];
    }

    public static function build_overview(): array {
        $season = self::season();
        $teams  = self::team_list( $season );
        return [
            'season'     => $season,
            'teams'      => $teams,
            'types'      => self::TYPES,
            'max_games'  => self::MAX_GAMES,
            'arenas'     => array_values( (array) get_option( self::OPT_ARENAS, [] ) ),
            'batches'    => array_values( (array) get_option( self::OPT_BATCHES, [] ) ),
            'log'        => array_map( function ( $l ) { unset( $l['rosters'] ); return $l; }, array_values( (array) get_option( self::OPT_LOG, [] ) ) ),
            'schedule'   => self::schedule( $teams ),
            'qr_ready'   => self::qr_script() !== '',
            'print_url'  => function_exists( 'admin_url' ) ? admin_url( 'admin-post.php' ) : '',
            'print_nonce' => function_exists( 'wp_create_nonce' ) ? wp_create_nonce( 'grsh_print_score_sheets' ) : '',
            'generated_at' => current_time( 'mysql' ),
        ];
    }

    public static function rest_overview(): WP_REST_Response {
        return new WP_REST_Response( self::build_overview(), 200 );
    }

    /** One print record by id ("p123abc"), with the rosters as they were printed. */
    public static function print_record( string $id ): ?array {
        foreach ( (array) get_option( self::OPT_LOG, [] ) as $l ) {
            if ( ( $l['id'] ?? '' ) === $id ) { return $l; }
        }
        return null;
    }

    public static function rest_record( WP_REST_Request $req ) {
        $rec = self::print_record( sanitize_text_field( (string) $req->get_param( 'id' ) ) );
        if ( ! $rec ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'That print record is no longer stored. Only the last ' . self::MAX_LOG . ' print runs are kept.' ], 404 ); }
        return new WP_REST_Response( [ 'success' => true, 'record' => $rec ], 200 );
    }

    // -------------------------------------------------------------------------
    // Input cleaning
    // -------------------------------------------------------------------------

    public static function clean_matchup( $m ): array {
        $m = is_array( $m ) ? $m : [];
        $date = (string) ( $m['date'] ?? '' ); $time = (string) ( $m['game_time'] ?? $m['time'] ?? '' );
        $type = strtoupper( (string) ( $m['type'] ?? 'REG' ) );
        return [
            'home_id'   => max( 0, (int) ( $m['home_id'] ?? 0 ) ),
            'away_id'   => max( 0, (int) ( $m['away_id'] ?? 0 ) ),
            'date'      => preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date ) ? $date : '',
            'game_time' => preg_match( '/^\d{2}:\d{2}$/', $time ) ? $time : '',
            'arena'     => mb_substr( sanitize_text_field( (string) ( $m['arena'] ?? '' ) ), 0, 80 ),
            'game_no'   => mb_substr( sanitize_text_field( (string) ( $m['game_no'] ?? '' ) ), 0, 20 ),
            'type'      => isset( self::TYPES[ $type ] ) ? $type : 'REG',
        ];
    }

    public static function clean_options( $o ): array {
        $o   = is_array( $o ) ? $o : [];
        $ord = (string) ( $o['order'] ?? 'queue' );
        return [
            'font'     => ( $o['font'] ?? '' ) === 'large' ? 'large' : 'normal',
            'back'     => ! empty( $o['back'] ),
            'cover'    => ! empty( $o['cover'] ),
            'spares'   => min( 10, max( 0, (int) ( $o['spares'] ?? 0 ) ) ),
            'order'    => in_array( $ord, self::ORDERS, true ) ? $ord : 'queue',
        ];
    }

    private static function clean_matchups( $raw ): array {
        $out = [];
        foreach ( (array) $raw as $m ) {
            if ( count( $out ) >= self::MAX_GAMES ) { break; }
            $out[] = self::clean_matchup( $m );
        }
        return $out;
    }

    public static function order_matchups( array $list, string $order ): array {
        if ( $order === 'queue' ) { return $list; }
        foreach ( $list as $i => $m ) { $list[ $i ]['_i'] = $i; }
        usort( $list, function ( $a, $b ) use ( $order ) {
            $ka = $order === 'arena' ? [ strtolower( $a['arena'] ), $a['date'], $a['game_time'] ] : [ $a['date'], $a['game_time'], strtolower( $a['arena'] ) ];
            $kb = $order === 'arena' ? [ strtolower( $b['arena'] ), $b['date'], $b['game_time'] ] : [ $b['date'], $b['game_time'], strtolower( $b['arena'] ) ];
            // blanks last so unscheduled games do not jump to the front
            foreach ( [ 0, 1, 2 ] as $k ) {
                $x = $ka[ $k ] === '' ? "\xff" : $ka[ $k ]; $y = $kb[ $k ] === '' ? "\xff" : $kb[ $k ];
                $c = strcmp( $x, $y ); if ( $c !== 0 ) { return $c; }
            }
            return $a['_i'] <=> $b['_i'];
        } );
        foreach ( $list as $i => $m ) { unset( $list[ $i ]['_i'] ); }
        return $list;
    }

    // -------------------------------------------------------------------------
    // Saved batches and arenas
    // -------------------------------------------------------------------------

    private static function remember_arenas( array $matchups ): void {
        $list = array_values( (array) get_option( self::OPT_ARENAS, [] ) );
        foreach ( $matchups as $m ) {
            $a = trim( $m['arena'] );
            if ( $a === '' ) { continue; }
            $list = array_values( array_filter( $list, function ( $x ) use ( $a ) { return strcasecmp( $x, $a ) !== 0; } ) );
            array_unshift( $list, $a );
        }
        update_option( self::OPT_ARENAS, array_slice( $list, 0, self::MAX_ARENAS ), false );
    }

    public static function rest_batch_save( WP_REST_Request $req ) {
        $p    = (array) $req->get_json_params();
        $name = mb_substr( sanitize_text_field( (string) ( $p['name'] ?? '' ) ), 0, 60 );
        if ( $name === '' ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'Give the batch a name.' ], 400 ); }
        $games = self::clean_matchups( $p['matchups'] ?? [] );
        if ( ! $games ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'Add at least one game before saving.' ], 400 ); }
        $batches = array_values( (array) get_option( self::OPT_BATCHES, [] ) );
        $now     = current_time( 'mysql' );
        $found   = false;
        foreach ( $batches as $i => $b ) {
            if ( strcasecmp( $b['name'], $name ) === 0 ) {
                $batches[ $i ] = [ 'id' => $b['id'], 'name' => $name, 'saved_at' => $now, 'matchups' => $games, 'options' => self::clean_options( $p['options'] ?? [] ) ];
                $found = true; break;
            }
        }
        if ( ! $found ) {
            if ( count( $batches ) >= self::MAX_BATCHES ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'You already have ' . self::MAX_BATCHES . ' saved batches. Delete one first.' ], 400 ); }
            array_unshift( $batches, [ 'id' => 'b' . substr( md5( $name . microtime( true ) ), 0, 8 ), 'name' => $name, 'saved_at' => $now, 'matchups' => $games, 'options' => self::clean_options( $p['options'] ?? [] ) ] );
        }
        update_option( self::OPT_BATCHES, $batches, false );
        self::remember_arenas( $games );
        return new WP_REST_Response( [ 'success' => true, 'message' => ( $found ? 'Updated "' : 'Saved "' ) . $name . '".', 'batches' => $batches ], 200 );
    }

    public static function rest_batch_delete( WP_REST_Request $req ) {
        $id = sanitize_key( (string) $req->get_param( 'id' ) );
        $batches = array_values( array_filter( (array) get_option( self::OPT_BATCHES, [] ), function ( $b ) use ( $id ) { return ( $b['id'] ?? '' ) !== $id; } ) );
        update_option( self::OPT_BATCHES, $batches, false );
        return new WP_REST_Response( [ 'success' => true, 'batches' => $batches ], 200 );
    }

    // -------------------------------------------------------------------------
    // Building sheets
    // -------------------------------------------------------------------------

    /** Sheet data for one team id. id 0 is the blank side, printed empty for hand-writing at the rink. */
    private static function team_sheet( int $team_id, array $season, array $teams_by_id, array $rosters, array $rules ): array {
        if ( $team_id === 0 ) {
            return [ 'ok' => true, 'id' => 0, 'name' => '', 'division_label' => '', 'players' => [], 'warnings' => [] ];
        }
        if ( ! isset( $teams_by_id[ $team_id ] ) ) {
            return [ 'ok' => false, 'reason' => 'team #' . $team_id . ' is not on this season' ];
        }
        $t       = $teams_by_id[ $team_id ];
        $players = $rosters[ $team_id ] ?? [];
        $rule    = $rules[ $t['division'] ] ?? [ 'label' => $t['division'], 'min_roster' => null, 'max_roster' => null, 'goalie_min' => null, 'goalie_max' => null ];
        return [ 'ok' => true, 'id' => $team_id, 'name' => (string) $t['name'], 'division_label' => $rule['label'], 'players' => $players, 'warnings' => self::team_warnings( $players, $rule ), 'captain_player_id' => (int) $t['captain_player_id'] ];
    }

    /** Turns cleaned matchups into printable sheets plus a list of the ones that had to be skipped. */
    public static function build_sheets( array $matchups ): array {
        global $wpdb;
        $season = self::season();
        $sheets = []; $skipped = [];
        if ( ! $season['exists'] ) {
            foreach ( $matchups as $i => $m ) { $skipped[] = [ 'index' => $i + 1, 'label' => 'Game ' . ( $i + 1 ), 'reason' => 'the season in Settings does not exist' ]; }
            return [ 'sheets' => [], 'skipped' => $skipped, 'season' => $season ];
        }
        $teams_by_id = [];
        foreach ( $wpdb->get_results( $wpdb->prepare( "SELECT id, name, division, captain_player_id FROM {$wpdb->prefix}grsh_teams WHERE season_id = %d", $season['id'] ), ARRAY_A ) ?: [] as $t ) { $teams_by_id[ (int) $t['id'] ] = $t; }
        $rosters = self::load_rosters( $season['id'] );
        $rules   = self::division_rules();
        foreach ( $matchups as $i => $m ) {
            $label = 'Game ' . ( $i + 1 ) . ( $m['game_no'] !== '' ? ' (#' . $m['game_no'] . ')' : '' );
            if ( $m['home_id'] !== 0 && $m['home_id'] === $m['away_id'] ) { $skipped[] = [ 'index' => $i + 1, 'label' => $label, 'reason' => 'home and away are the same team' ]; continue; }
            $home = self::team_sheet( $m['home_id'], $season, $teams_by_id, $rosters, $rules );
            $away = self::team_sheet( $m['away_id'], $season, $teams_by_id, $rosters, $rules );
            if ( ! $home['ok'] || ! $away['ok'] ) {
                $skipped[] = [ 'index' => $i + 1, 'label' => $label, 'reason' => ! $home['ok'] ? 'home ' . $home['reason'] : 'away ' . $away['reason'] ];
                continue;
            }
            $sheets[] = [ 'home' => $home, 'away' => $away ] + $m;
        }
        return [ 'sheets' => $sheets, 'skipped' => $skipped, 'season' => $season ];
    }

    // -------------------------------------------------------------------------
    // Print
    // -------------------------------------------------------------------------

    public static function handle_print_request(): void {
        if ( ! current_user_can( 'manage_options' ) ) { wp_die( 'Not allowed.' ); }
        check_admin_referer( 'grsh_print_score_sheets', 'grsh_print_nonce' );
        $matchups = self::clean_matchups( json_decode( (string) wp_unslash( $_POST['matchups'] ?? '' ), true ) );
        $options  = self::clean_options( json_decode( (string) wp_unslash( $_POST['options'] ?? '' ), true ) );
        if ( ! $matchups && $options['spares'] === 0 ) { wp_die( 'No games were sent to print. Go back and add at least one game.' ); }
        try {
            $html = self::print_document( $matchups, $options );
            header( 'Content-Type: text/html; charset=utf-8' );
            echo $html; // phpcs:ignore WordPress.Security.EscapeOutput -- every value is escaped while the document is built
        } catch ( \Throwable $e ) {
            error_log( 'GRSH score sheets: ' . $e->getMessage() . ' at ' . $e->getFile() . ':' . $e->getLine() );
            wp_die( 'The score sheets could not be built. The details were written to the PHP error log. Nothing was printed or changed.' );
        }
        exit;
    }

    /** Builds the whole print page, records the run, and updates the roster snapshots. */
    public static function print_document( array $matchups, array $options ): string {
        $matchups = self::order_matchups( $matchups, $options['order'] );
        $built    = self::build_sheets( $matchups );
        $sheets   = $built['sheets'];
        $print_id = 'p' . substr( md5( microtime( true ) . count( $sheets ) ), 0, 10 );
        $changes  = [];
        if ( $sheets ) { $changes = self::record_print( $print_id, $sheets, $options, $built['skipped'] ); }
        return self::render_document( $sheets, $options, $built['skipped'], $changes, $print_id, false );
    }

    private static function record_print( string $print_id, array $sheets, array $options, array $skipped ): array {
        $snaps = (array) get_option( self::OPT_SNAPS, [] );
        $now   = current_time( 'mysql' );
        $changes = []; $rosters = [];
        foreach ( $sheets as $s ) {
            foreach ( [ 'home', 'away' ] as $side ) {
                $t = $s[ $side ]; $id = $t['id'];
                if ( ! $id || isset( $rosters[ $id ] ) ) { continue; }
                $c = self::changes_since_print( $t['players'], $snaps[ $id ] ?? null );
                if ( $c ) { $changes[ $id ] = [ 'name' => $t['name'] ] + $c; }
                $rosters[ $id ] = [ 'name' => $t['name'], 'players' => array_map( function ( $p ) { return [ $p['jersey'], $p['name'], $p['goalie'] ? 'G' : '' ]; }, $t['players'] ) ];
                $snap = [];
                foreach ( $t['players'] as $p ) { $snap[ $p['player_id'] ] = [ 'name' => $p['name'], 'jersey' => $p['jersey'] ]; }
                $snaps[ $id ] = [ 'at' => $now, 'players' => $snap ];
            }
        }
        update_option( self::OPT_SNAPS, $snaps, false );
        $user = function_exists( 'wp_get_current_user' ) ? wp_get_current_user() : null;
        $log  = array_values( (array) get_option( self::OPT_LOG, [] ) );
        array_unshift( $log, [
            'id' => $print_id, 'at' => $now, 'by' => $user && ! empty( $user->display_name ) ? (string) $user->display_name : 'Admin',
            'count' => count( $sheets ), 'skipped' => count( $skipped ), 'options' => $options,
            'games' => array_map( function ( $s ) {
                return [ 'home' => $s['home']['name'], 'away' => $s['away']['name'], 'home_id' => $s['home']['id'], 'away_id' => $s['away']['id'], 'date' => $s['date'], 'game_time' => $s['game_time'], 'arena' => $s['arena'], 'game_no' => $s['game_no'], 'type' => $s['type'] ];
            }, $sheets ),
            'rosters' => $rosters,
        ] );
        update_option( self::OPT_LOG, array_slice( $log, 0, self::MAX_LOG ), false );
        self::remember_arenas( array_map( function ( $s ) { return [ 'arena' => $s['arena'] ]; }, $sheets ) );
        return $changes;
    }

    /** One sheet, for the in-page preview. Does not print, log or snapshot. */
    public static function rest_preview( WP_REST_Request $req ) {
        $p       = (array) $req->get_json_params();
        $matchup = self::clean_matchup( $p['matchup'] ?? [] );
        $options = self::clean_options( $p['options'] ?? [] );
        $built   = self::build_sheets( [ $matchup ] );
        return new WP_REST_Response( [
            'success' => true, 'skipped' => $built['skipped'],
            'html'    => self::render_document( $built['sheets'], $options, [], [], 'preview', true ),
        ], 200 );
    }

    // -------------------------------------------------------------------------
    // Rendering
    // -------------------------------------------------------------------------

    private static function qr_script(): string {
        $file = defined( 'GRSH_PLUGIN_DIR' ) ? GRSH_PLUGIN_DIR . 'assets/vendor/qrcode-generator.js' : dirname( __DIR__ ) . '/assets/vendor/qrcode-generator.js';
        return is_readable( $file ) ? (string) file_get_contents( $file ) : '';
    }

    private static function pretty_date( string $d ): string {
        if ( $d === '' ) { return ''; }
        $t = strtotime( $d . ' 12:00:00 UTC' );
        return $t ? gmdate( 'D M j, Y', $t ) : $d;
    }

    private static function pretty_time( string $t ): string {
        if ( $t === '' ) { return ''; }
        $x = strtotime( '2000-01-01 ' . $t . ':00 UTC' );
        return $x ? gmdate( 'g:i A', $x ) : $t;
    }

    private static function css( string $font ): string {
        $f = $font === 'large' ? 10 : 8;
        return '@page{size:letter landscape;margin:0.3in}*{box-sizing:border-box}'
            . 'body{font-family:Arial,Helvetica,sans-serif;color:#1a1a2e;margin:0;background:#fff}'
            . '.bar{position:sticky;top:0;z-index:5;padding:10px 16px;background:#1a1a2e;color:#fff;display:flex;gap:14px;align-items:center;flex-wrap:wrap}'
            . '.bar b{color:#D4A017}.bar button{background:#D4A017;color:#1a1a2e;border:0;border-radius:8px;padding:9px 18px;font-weight:700;font-size:14px;cursor:pointer}'
            . '.notes{padding:10px 16px;background:#fff7e0;border-bottom:1px solid #e0c36a;font-size:13px}.notes.bad{background:#fdecea;border-color:#e6a5a0}.notes ul{margin:4px 0 0 18px;padding:0}'
            . '.sheet{page-break-after:always;padding:6px 4px 0;position:relative}.sheet:last-child{page-break-after:auto}'
            . 'table{border-collapse:collapse;width:100%}th,td{border:1px solid #1a1a2e;font-size:' . $f . 'px;padding:2px 3px;text-align:center}'
            . '.dense th,.dense td{font-size:' . ( $f - 1 ) . 'px;padding:1px 2px}'
            . 'th{background:#1a1a2e;color:#D4A017;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
            . '.title{text-align:center;font-size:22px;font-weight:bold;margin:0}.subtitle{text-align:center;font-size:11px;font-weight:bold;margin:2px 0 8px}'
            . '.cols{display:flex;gap:8px;align-items:flex-start}.col{flex:1}'
            . '.lbl{font-weight:bold;font-size:' . ( $f + 0.5 ) . 'px;margin:6px 0 2px}'
            . '.goalie-row td{background:#FCE8B8;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
            . '.info-table td{text-align:left}.info-table td:first-child{font-weight:bold;width:60px}.name{text-align:left}'
            . '.qr{position:absolute;right:6px;top:2px;width:54px;height:54px}.qr svg{width:54px;height:54px}'
            . '.qrcap{position:absolute;right:6px;top:56px;width:54px;font-size:6px;text-align:center;color:#555}'
            . '.cover table td,.cover table th{font-size:11px;padding:4px 6px}.cover h2{margin:6px 0}'
            . '.blank-line{display:inline-block;width:180px;border-bottom:1px solid #1a1a2e}'
            . '.spare{color:#777;font-size:9px;text-align:center}'
            . '@media print{.bar,.notes{display:none}}';
    }

    private static function roster_table( array $team, string $dense ): string {
        $players = $team['players'];
        $goalies = array_values( array_filter( $players, function ( $p ) { return $p['goalie']; } ) );
        $g       = $goalies[0] ?? null;
        $rest    = [];
        $skipped_first = false;
        foreach ( $players as $p ) {
            if ( $p['goalie'] && ! $skipped_first && $g && $p['player_id'] === $g['player_id'] ) { $skipped_first = true; continue; }
            $rest[] = $p;
        }
        $mark = function ( array $p, bool $extra_goalie ) use ( $team ) {
            $m = '';
            if ( $p['captain'] || ( ! empty( $team['captain_player_id'] ) && $p['player_id'] === $team['captain_player_id'] ) ) { $m .= ' (C)'; }
            elseif ( $p['alternate'] ) { $m .= ' (A)'; }
            if ( $extra_goalie ) { $m .= ' (G)'; }
            return esc_html( $p['name'] ) . $m;
        };
        $rows = '<tr class="goalie-row"><td>Goalie</td><td>' . ( $g && $g['jersey'] !== null ? esc_html( (string) $g['jersey'] ) : '' ) . '</td><td class="name">' . ( $g ? $mark( $g, false ) : '' ) . '</td></tr>';
        $n = max( self::MIN_ROWS, count( $rest ) );
        for ( $i = 0; $i < $n; $i++ ) {
            $p = $rest[ $i ] ?? null;
            $rows .= '<tr><td>' . ( $i + 1 ) . '</td><td>' . ( $p && $p['jersey'] !== null ? esc_html( (string) $p['jersey'] ) : '' ) . '</td><td class="name">' . ( $p ? $mark( $p, $p['goalie'] ) : '' ) . '</td></tr>';
        }
        $rows .= '<tr><td colspan="3" class="name" style="font-weight:bold;background:#f3f1e8">SUBS / LATE ADDITIONS</td></tr>';
        for ( $i = 0; $i < 2; $i++ ) { $rows .= '<tr><td>&nbsp;</td><td></td><td></td></tr>'; }
        return '<table class="' . $dense . '"><tr><th>Pos</th><th>#</th><th>Name</th></tr>' . $rows . '</table>';
    }

    private static function side_label( array $team ): string {
        return $team['name'] !== '' ? esc_html( $team['name'] ) . ' (' . esc_html( $team['division_label'] ) . ')' : '<span class="blank-line">&nbsp;</span>';
    }

    private static function render_sheet( array $s, array $o, string $qr_url ): string {
        $dense = ( count( $s['home']['players'] ) > 18 || count( $s['away']['players'] ) > 18 ) ? 'dense' : '';
        $h = '<div class="sheet ' . $dense . '">';
        if ( $qr_url !== '' ) { $h .= '<div class="qr" data-url="' . esc_attr( $qr_url ) . '"></div><div class="qrcap">scan: print record</div>'; }
        $h .= '<p class="title">GOLD RUSH ADULT HOCKEY TOURNAMENT</p><p class="subtitle">OFFICIAL SCORE SHEET</p><div class="cols">';
        $h .= '<div class="col" style="flex:1.5"><div class="lbl">HOME: ' . self::side_label( $s['home'] ) . '</div>' . self::roster_table( $s['home'], $dense ) . '</div>';
        $h .= '<div class="col" style="flex:1"><div class="lbl">GAME INFO</div><table class="info-table">';
        $info = [ 'Date' => self::pretty_date( $s['date'] ), 'Time' => self::pretty_time( $s['game_time'] ), 'Arena' => $s['arena'], 'Game #' => $s['game_no'], 'Type' => self::TYPES[ $s['type'] ] ?? '' ];
        foreach ( $info as $k => $v ) { $h .= '<tr><td>' . esc_html( $k ) . '</td><td>' . esc_html( $v ) . '</td></tr>'; }
        $h .= '</table><div class="lbl">SCORING BY PERIODS</div><table><tr><th></th><th>1</th><th>2</th><th>OT</th><th>TOTAL</th></tr>'
            . '<tr><td>HOME</td><td></td><td></td><td></td><td></td></tr><tr><td>VISITOR</td><td></td><td></td><td></td><td></td></tr></table></div>';
        $h .= '<div class="col" style="flex:1.5"><div class="lbl">AWAY: ' . self::side_label( $s['away'] ) . '</div>' . self::roster_table( $s['away'], $dense ) . '</div></div>';
        $h .= '<div class="cols" style="margin-top:8px">';
        foreach ( [ 'HOME', 'AWAY' ] as $side ) {
            if ( $side === 'AWAY' ) {
                $h .= '<div class="col" style="flex:2"><div class="lbl">SIGNATURES</div><table class="info-table"><tr><td>Scorer</td><td>&nbsp;</td></tr><tr><td>Referee 1</td><td>&nbsp;</td></tr><tr><td>Referee 2</td><td>&nbsp;</td></tr></table></div>';
            }
            $h .= '<div class="col"><div class="lbl">' . $side . ' GOALKEEPING STATS</div><table><tr><th></th><th>1</th><th>2</th><th>OT/SO</th><th>TOTAL</th></tr>';
            foreach ( [ 'GOALKEEPER', 'SHOTS', 'SAVES' ] as $row ) { $h .= '<tr><td>' . $row . '</td><td></td><td></td><td></td><td></td></tr>'; }
            $h .= '</table></div>';
        }
        $h .= '</div><div class="cols" style="margin-top:8px">';
        foreach ( [ 'HOME', 'AWAY' ] as $side ) {
            $h .= '<div class="col"><div class="lbl">' . $side . ' PENALTIES</div><table><tr><th>Half</th><th>#</th><th>Offense</th><th>Min</th><th>Off</th><th>On</th></tr>';
            for ( $i = 0; $i < 4; $i++ ) { $h .= '<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>'; }
            $h .= '</table></div>';
        }
        $h .= '</div></div>';
        if ( $o['back'] ) { $h .= self::render_back( $s ); }
        return $h;
    }

    /** Back page: goal log and more penalty rows, so the front stays readable. */
    private static function render_back( array $s ): string {
        $h = '<div class="sheet"><p class="title" style="font-size:16px">' . esc_html( ( $s['home']['name'] ?: 'HOME' ) . ' vs ' . ( $s['away']['name'] ?: 'AWAY' ) ) . ' - GAME LOG</p>';
        $h .= '<div class="cols" style="margin-top:6px"><div class="col" style="flex:1.4"><div class="lbl">GOALS</div><table><tr><th>#</th><th>Per</th><th>Time</th><th>Team</th><th>Scorer #</th><th>Assist 1</th><th>Assist 2</th></tr>';
        for ( $i = 1; $i <= 14; $i++ ) { $h .= '<tr><td>' . $i . '</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>'; }
        $h .= '</table></div><div class="col" style="flex:1">';
        foreach ( [ 'HOME', 'AWAY' ] as $side ) {
            $h .= '<div class="lbl">' . $side . ' PENALTIES (continued)</div><table><tr><th>Half</th><th>#</th><th>Offense</th><th>Min</th><th>Off</th><th>On</th></tr>';
            for ( $i = 0; $i < 5; $i++ ) { $h .= '<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>'; }
            $h .= '</table>';
        }
        $h .= '</div></div><div class="lbl" style="margin-top:10px">NOTES / PROTESTS</div><table><tr><td style="height:60px"></td></tr></table></div>';
        return $h;
    }

    private static function render_cover( array $sheets, array $o ): string {
        $h = '<div class="sheet cover"><p class="title">GOLD RUSH ADULT HOCKEY TOURNAMENT</p><p class="subtitle">SCORE SHEET PACKET</p><h2>' . count( $sheets ) . ' games</h2><table><tr><th>#</th><th>Date</th><th>Time</th><th>Arena</th><th>Game #</th><th>Type</th><th>Home</th><th>Away</th></tr>';
        foreach ( $sheets as $i => $s ) {
            $h .= '<tr><td>' . ( $i + 1 ) . '</td><td>' . esc_html( self::pretty_date( $s['date'] ) ) . '</td><td>' . esc_html( self::pretty_time( $s['game_time'] ) ) . '</td><td>' . esc_html( $s['arena'] ) . '</td><td>' . esc_html( $s['game_no'] )
                . '</td><td>' . esc_html( self::TYPES[ $s['type'] ] ?? '' ) . '</td><td>' . esc_html( $s['home']['name'] ?: '(blank)' ) . '</td><td>' . esc_html( $s['away']['name'] ?: '(blank)' ) . '</td></tr>';
        }
        $h .= '</table>' . ( $o['spares'] ? '<p class="spare">Plus ' . (int) $o['spares'] . ' blank spare sheet' . ( $o['spares'] > 1 ? 's' : '' ) . ' at the end.</p>' : '' ) . '</div>';
        return $h;
    }

    public static function render_document( array $sheets, array $o, array $skipped, array $changes, string $print_id, bool $preview ): string {
        $blank = [ 'ok' => true, 'id' => 0, 'name' => '', 'division_label' => '', 'players' => [], 'warnings' => [] ];
        $spares = [];
        for ( $i = 0; $i < $o['spares']; $i++ ) { $spares[] = [ 'home' => $blank, 'away' => $blank, 'date' => '', 'game_time' => '', 'arena' => '', 'game_no' => '', 'type' => 'REG' ]; }
        $h = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Gold Rush Adult Hockey Tournament - Score Sheets</title><style>' . self::css( $o['font'] ) . '</style></head><body>';
        if ( ! $preview ) {
            $pages = count( $sheets ) + count( $spares );
            $h .= '<div class="bar"><span><b>' . $pages . '</b> sheet' . ( $pages === 1 ? '' : 's' ) . ' ready' . ( $o['back'] ? ' (two-sided)' : '' ) . '</span><button type="button" onclick="window.print()">Print or save as PDF</button><span>Letter, landscape. Choose "Background graphics" in the print dialog for the dark header rows.</span></div>';
            if ( $skipped ) {
                $h .= '<div class="notes bad"><b>' . count( $skipped ) . ' game' . ( count( $skipped ) === 1 ? ' was' : 's were' ) . ' NOT printed:</b><ul>';
                foreach ( $skipped as $s ) { $h .= '<li>' . esc_html( $s['label'] . ': ' . $s['reason'] ) . '</li>'; }
                $h .= '</ul></div>';
            }
            $warn = [];
            foreach ( $sheets as $s ) { foreach ( [ 'home', 'away' ] as $side ) { $t = $s[ $side ]; if ( $t['id'] && ! isset( $warn[ $t['id'] ] ) ) { foreach ( $t['warnings'] as $w ) { if ( $w['level'] !== 'info' ) { $warn[ $t['id'] ][] = $t['name'] . ': ' . $w['text']; } } } } }
            $lines = [];
            foreach ( $warn as $list ) { foreach ( $list as $l ) { $lines[] = $l; } }
            foreach ( $changes as $c ) {
                $bits = [];
                if ( $c['added'] ) { $bits[] = 'added ' . implode( ', ', $c['added'] ); }
                if ( $c['removed'] ) { $bits[] = 'removed ' . implode( ', ', $c['removed'] ); }
                if ( $c['jersey'] ) { $bits[] = 'new number for ' . implode( ', ', $c['jersey'] ); }
                $lines[] = $c['name'] . ' changed since last print: ' . implode( '; ', $bits ) . '.';
            }
            if ( $lines ) { $h .= '<div class="notes"><b>Check before you print:</b><ul>'; foreach ( $lines as $l ) { $h .= '<li>' . esc_html( $l ) . '</li>'; } $h .= '</ul></div>'; }
            if ( $o['cover'] && $sheets ) { $h .= self::render_cover( $sheets, $o ); }
        }
        foreach ( $sheets as $i => $s ) {
            $url = ( $preview || ! function_exists( 'admin_url' ) ) ? '' : admin_url( 'admin.php?page=grsh-score-sheets&sheet=' . $print_id . '-' . ( $i + 1 ) );
            $h .= self::render_sheet( $s, $o, $url );
        }
        foreach ( $spares as $s ) { $h .= self::render_sheet( $s, $o, '' ); }
        $qr = $preview ? '' : self::qr_script();
        if ( $qr !== '' ) {
            $h .= '<script>' . str_replace( '</script', '<\/script', $qr ) . '</script><script>(function(){try{document.querySelectorAll(".qr[data-url]").forEach(function(el){var q=qrcode(0,"M");q.addData(el.getAttribute("data-url"));q.make();el.innerHTML=q.createSvgTag({cellSize:3,margin:0,scalable:true});});}catch(e){}})();</script>';
        }
        return $h . '</body></html>';
    }
}
