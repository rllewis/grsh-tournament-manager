<?php
/**
 * GRSH Sub Requests + Alternates support endpoints
 *
 *  GET  /grsh/v1/alternates/meta               tournament start date, divisions, teams (score sums, goalies)
 *  POST /grsh/v1/alternates/meta               save tournament start date (Thursday)
 *  GET  /grsh/v1/alternates/log                real activation log (from the audit log)
 *  GET  /grsh/v1/alternates/requests           recent sub requests, grouped, with per-recipient status
 *  POST /grsh/v1/alternates/requests           email a request to up to 6 subs with YES / NO links
 *  GET  /grsh/v1/alternates/goalie-candidates  returning goalies not yet on the sub list
 *
 * Public landing (?grsh_sub=TOKEN&a=yes|no): shows a confirm button; the answer is only
 * recorded when the button is POSTed, so email link-scanners can't "click YES" for a sub.
 * First YES for a request wins: the other recipients are marked "filled" and get a short
 * "spot filled" email, the activation is written to the log, and the requester is emailed.
 *
 * @package GRSH_Tournament_Manager
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class GRSH_Sub_Requests {

    const DB_VERSION_OPTION = 'grsh_subreq_db_ver';
    const DB_VERSION        = '1';
    const START_OPTION      = 'grsh_tournament_start';
    const MAX_RECIPIENTS    = 6;
    const EXPIRY_HOURS      = 72;

    public static function register_hooks(): void {
        add_action( 'rest_api_init', [ __CLASS__, 'register_routes' ] );
        add_action( 'wp', [ __CLASS__, 'handle_landing' ] );
    }

    // -------------------------------------------------------------------------
    // Table
    // -------------------------------------------------------------------------

    public static function table(): string {
        global $wpdb;
        return $wpdb->prefix . 'grsh_sub_requests';
    }

    public static function ensure_table(): void {
        if ( get_option( self::DB_VERSION_OPTION ) === self::DB_VERSION ) {
            return;
        }
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        $charset = $wpdb->get_charset_collate();
        $table   = self::table();
        dbDelta( "CREATE TABLE {$table} (
            id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            group_id      CHAR(16) NOT NULL,
            player_id     BIGINT UNSIGNED NOT NULL,
            season_id     BIGINT UNSIGNED NOT NULL,
            email         VARCHAR(190) NOT NULL,
            token         CHAR(64) NOT NULL,
            team          VARCHAR(100) NOT NULL,
            division      VARCHAR(30) NOT NULL,
            game_date     VARCHAR(20) NOT NULL,
            position      VARCHAR(20) DEFAULT NULL,
            note          TEXT DEFAULT NULL,
            status        VARCHAR(10) NOT NULL DEFAULT 'sent',
            sent_at       DATETIME NOT NULL,
            responded_at  DATETIME DEFAULT NULL,
            created_by    BIGINT UNSIGNED NOT NULL DEFAULT 0,
            PRIMARY KEY  (id),
            UNIQUE KEY uq_token (token),
            KEY idx_group (group_id),
            KEY idx_player (player_id)
        ) {$charset};" );
        update_option( self::DB_VERSION_OPTION, self::DB_VERSION, false );
    }

    // -------------------------------------------------------------------------
    // Routes
    // -------------------------------------------------------------------------

    public static function register_routes(): void {
        $ns   = 'grsh/v1';
        $perm = [ __CLASS__, 'check_permission' ];

        register_rest_route( $ns, '/alternates/meta', [
            [ 'methods' => WP_REST_Server::READABLE, 'callback' => [ __CLASS__, 'get_meta' ],  'permission_callback' => $perm ],
            [ 'methods' => 'POST',                   'callback' => [ __CLASS__, 'save_meta' ], 'permission_callback' => $perm ],
        ] );
        register_rest_route( $ns, '/alternates/log', [
            'methods' => WP_REST_Server::READABLE, 'callback' => [ __CLASS__, 'get_log' ], 'permission_callback' => $perm,
        ] );
        register_rest_route( $ns, '/alternates/requests', [
            [ 'methods' => WP_REST_Server::READABLE, 'callback' => [ __CLASS__, 'list_requests' ],  'permission_callback' => $perm ],
            [ 'methods' => 'POST',                   'callback' => [ __CLASS__, 'create_request' ], 'permission_callback' => $perm ],
        ] );
        register_rest_route( $ns, '/alternates/goalie-candidates', [
            'methods' => WP_REST_Server::READABLE, 'callback' => [ __CLASS__, 'goalie_candidates' ], 'permission_callback' => $perm,
        ] );
    }

    public static function check_permission(): bool {
        return current_user_can( 'manage_options' ) || current_user_can( 'grsh_committee' );
    }

    private static function season_id(): int {
        global $wpdb;
        $year = class_exists( 'GRSH_Sync_Engine' ) ? GRSH_Sync_Engine::SEASON : (int) gmdate( 'Y' );
        $id   = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}grsh_seasons WHERE season_year = %d LIMIT 1",
            $year
        ) );
        return $id ?: 1;
    }

    // -------------------------------------------------------------------------
    // GET/POST /alternates/meta
    // -------------------------------------------------------------------------

    public static function get_meta(): WP_REST_Response {
        global $wpdb;
        $season_id = self::season_id();

        $divisions = [];
        if ( class_exists( 'GRSH_Settings' ) ) {
            foreach ( GRSH_Settings::get_active_divisions() as $d ) {
                $divisions[] = [
                    'key'        => $d['key']   ?? '',
                    'label'      => $d['label'] ?? ( $d['key'] ?? '' ),
                    'max_roster' => (int) ( $d['max_roster'] ?? 0 ),
                ];
            }
        }

        $rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT t.id AS team_id, t.name, t.division,
                    p.position, p.is_goalie, p.years_experience,
                    COALESCE(NULLIF(p.skill_tier_assigned,''), p.skill_tier_reported) AS tier
               FROM {$wpdb->prefix}grsh_teams t
          LEFT JOIN {$wpdb->prefix}grsh_rosters ro ON ro.team_id = t.id
          LEFT JOIN {$wpdb->prefix}grsh_players p  ON p.id = ro.player_id
              WHERE t.season_id = %d
           ORDER BY t.division, t.name",
            $season_id
        ), ARRAY_A ) ?: [];

        $teams = [];
        foreach ( $rows as $r ) {
            $id = (int) $r['team_id'];
            if ( ! isset( $teams[ $id ] ) ) {
                $teams[ $id ] = [ 'id' => $id, 'name' => $r['name'], 'division' => $r['division'],
                                  'players' => 0, 'score_sum' => 0.0, 'goalies' => 0 ];
            }
            if ( $r['tier'] !== null || $r['position'] !== null ) {
                $teams[ $id ]['players']++;
                $teams[ $id ]['score_sum'] += GRSH_Scoring::compute_score( (string) $r['tier'], (int) $r['years_experience'] );
                if ( $r['position'] === 'goaltender' || (int) $r['is_goalie'] === 1 ) {
                    $teams[ $id ]['goalies']++;
                }
            }
        }
        foreach ( $teams as &$t ) {
            $t['score_sum'] = round( $t['score_sum'], 2 );
            $t['avg_100']   = $t['players'] ? GRSH_Scoring::normalize_to_100( $t['score_sum'] / $t['players'] ) : null;
        }
        unset( $t );

        return new WP_REST_Response( [
            'tournament_start' => (string) get_option( self::START_OPTION, '' ),
            'season_year'      => class_exists( 'GRSH_Sync_Engine' ) ? GRSH_Sync_Engine::SEASON : null,
            'max_player_score' => GRSH_Scoring::MAX_PLAYER_SCORE,
            'divisions'        => $divisions,
            'teams'            => array_values( $teams ),
        ], 200 );
    }

    public static function save_meta( WP_REST_Request $request ): WP_REST_Response {
        $start = sanitize_text_field( (string) $request->get_param( 'tournament_start' ) );
        if ( $start !== '' ) {
            $d = DateTime::createFromFormat( '!Y-m-d', $start );
            if ( ! $d || $d->format( 'Y-m-d' ) !== $start ) {
                return new WP_REST_Response( [ 'error' => 'Use a valid date (YYYY-MM-DD).' ], 400 );
            }
        }
        update_option( self::START_OPTION, $start, false );
        return new WP_REST_Response( [ 'ok' => true, 'tournament_start' => $start ], 200 );
    }

    // -------------------------------------------------------------------------
    // GET /alternates/log
    // -------------------------------------------------------------------------

    public static function get_log(): WP_REST_Response {
        global $wpdb;
        $rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT l.id, l.wp_user_id AS player_id, l.after_value, l.notes, l.user_display, l.created_at,
                    p.first_name, p.last_name
               FROM {$wpdb->prefix}grsh_audit_logs l
          LEFT JOIN {$wpdb->prefix}grsh_players p ON p.id = l.wp_user_id
              WHERE l.action = 'alternate_activated' AND l.season_id = %d
           ORDER BY l.id DESC LIMIT 200",
            self::season_id()
        ), ARRAY_A ) ?: [];

        $out = [];
        foreach ( $rows as $r ) {
            $v = json_decode( (string) $r['after_value'], true ) ?: [];
            $out[] = [
                'id'           => (int) $r['id'],
                'alternate_id' => (int) $r['player_id'],
                'player_name'  => trim( $r['first_name'] . ' ' . $r['last_name'] ) ?: 'Unknown player',
                'team'         => $v['team']     ?? '',
                'division'     => $v['division'] ?? '',
                'game_date'    => $v['date']     ?? '',
                'reason'       => $v['reason']   ?? '',
                'activated_by' => $r['user_display'] ?: 'Committee',
                'notes'        => $r['notes'] ?? '',
                'logged_at'    => $r['created_at'],
            ];
        }
        return new WP_REST_Response( $out, 200 );
    }

    // -------------------------------------------------------------------------
    // GET /alternates/goalie-candidates
    // -------------------------------------------------------------------------

    public static function goalie_candidates(): WP_REST_Response {
        global $wpdb;
        $sid  = self::season_id();
        $rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT p.id, p.first_name, p.last_name, p.email,
                    (SELECT MAX(s.season_year) FROM {$wpdb->prefix}grsh_player_history h
                       JOIN {$wpdb->prefix}grsh_seasons s ON s.id = h.season_id
                      WHERE h.player_id = p.id) AS last_played_year
               FROM {$wpdb->prefix}grsh_players p
              WHERE ( p.position = 'goaltender' OR p.is_goalie = 1 )
                AND p.email <> ''
                AND NOT EXISTS ( SELECT 1 FROM {$wpdb->prefix}grsh_registrations r
                                  WHERE r.player_id = p.id AND r.season_id = %d )
           ORDER BY last_played_year DESC, p.last_name ASC
              LIMIT 100",
            $sid
        ), ARRAY_A ) ?: [];

        foreach ( $rows as &$r ) {
            $r['id'] = (int) $r['id'];
            $r['last_played_year'] = $r['last_played_year'] ? (int) $r['last_played_year'] : null;
        }
        return new WP_REST_Response( $rows, 200 );
    }

    // -------------------------------------------------------------------------
    // POST /alternates/requests
    // -------------------------------------------------------------------------

    public static function create_request( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        self::ensure_table();

        $b        = $request->get_json_params();
        $ids      = array_values( array_unique( array_filter( array_map( 'absint', (array) ( $b['player_ids'] ?? [] ) ) ) ) );
        $team     = sanitize_text_field( (string) ( $b['team'] ?? '' ) );
        $division = sanitize_key( (string) ( $b['division'] ?? '' ) );
        $date     = sanitize_text_field( (string) ( $b['game_date'] ?? '' ) );
        $date_lbl = sanitize_text_field( (string) ( $b['game_label'] ?? $date ) );
        $position = sanitize_key( (string) ( $b['position'] ?? '' ) );
        $note     = sanitize_textarea_field( (string) ( $b['note'] ?? '' ) );

        if ( ! $ids ) {
            return new WP_REST_Response( [ 'error' => 'Choose at least one sub.' ], 400 );
        }
        if ( count( $ids ) > self::MAX_RECIPIENTS ) {
            return new WP_REST_Response( [ 'error' => 'Ask at most ' . self::MAX_RECIPIENTS . ' subs at a time.' ], 400 );
        }
        if ( $team === '' || $division === '' || $date === '' ) {
            return new WP_REST_Response( [ 'error' => 'Team, division and game day are required.' ], 400 );
        }

        $place = implode( ',', array_fill( 0, count( $ids ), '%d' ) );
        $subs  = $wpdb->get_results( $wpdb->prepare(
            "SELECT id, first_name, last_name, email FROM {$wpdb->prefix}grsh_players WHERE id IN ($place)",
            $ids
        ), ARRAY_A ) ?: [];

        $season_id = self::season_id();
        $group     = substr( bin2hex( random_bytes( 8 ) ), 0, 16 );
        $now       = current_time( 'mysql' );
        $by        = get_current_user_id();
        $results   = [];

        foreach ( $subs as $s ) {
            if ( ! is_email( $s['email'] ) ) {
                $results[] = [ 'player_id' => (int) $s['id'], 'status' => 'skipped', 'reason' => 'No valid email' ];
                continue;
            }
            $token = bin2hex( random_bytes( 32 ) );
            $wpdb->insert( self::table(), [
                'group_id'   => $group,
                'player_id'  => (int) $s['id'],
                'season_id'  => $season_id,
                'email'      => $s['email'],
                'token'      => $token,
                'team'       => $team,
                'division'   => $division,
                'game_date'  => $date,
                'position'   => $position ?: null,
                'note'       => $note ?: null,
                'status'     => 'sent',
                'sent_at'    => $now,
                'created_by' => $by,
            ] );
            $req_id = (int) $wpdb->insert_id;   // capture now: wp_mail() or a mail-log plugin may insert rows and change insert_id
            if ( ! $req_id ) {
                $results[] = [ 'player_id' => (int) $s['id'], 'status' => 'failed', 'reason' => 'Could not save the request' ];
                continue;
            }

            $base = home_url( '/' );
            $yes  = add_query_arg( [ 'grsh_sub' => $token, 'a' => 'yes' ], $base );
            $no   = add_query_arg( [ 'grsh_sub' => $token, 'a' => 'no' ],  $base );
            $div_label = self::division_label( $division );

            $subject = sprintf( 'Sub request: %s %s — %s', $div_label, $team, $date_lbl );
            $html    = self::email_html( $s['first_name'], [
                'Team'     => $team,
                'Division' => $div_label,
                'When'     => $date_lbl,
                'Position' => $position ? ucfirst( $position === 'goaltender' ? 'goalie' : $position ) : '',
            ], $note, $yes, $no );

            $ok = wp_mail( $s['email'], $subject, $html, [ 'Content-Type: text/html; charset=UTF-8' ] );
            if ( ! $ok ) {
                $wpdb->update( self::table(), [ 'status' => 'failed' ], [ 'id' => $req_id ] );
            }
            $results[] = [ 'player_id' => (int) $s['id'], 'status' => $ok ? 'sent' : 'failed',
                           'reason' => $ok ? '' : 'Email could not be sent' ];
        }

        return new WP_REST_Response( [ 'ok' => true, 'group_id' => $group, 'results' => $results ], 200 );
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

    private static function email_html( string $first, array $facts, string $note, string $yes, string $no ): string {
        $rows = '';
        foreach ( $facts as $k => $v ) {
            if ( $v === '' ) { continue; }
            $rows .= '<tr><td style="padding:4px 14px 4px 0;color:#6b7280">' . esc_html( $k ) . '</td><td style="padding:4px 0"><strong>' . esc_html( $v ) . '</strong></td></tr>';
        }
        $note_html = $note ? '<p style="margin:14px 0;padding:10px 12px;background:#f6f5f0;border-radius:6px">' . nl2br( esc_html( $note ) ) . '</p>' : '';
        return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a2e;max-width:520px">'
            . '<p>Hi ' . esc_html( $first ) . ',</p>'
            . '<p>We need a sub. Can you play?</p>'
            . '<table style="border-collapse:collapse;margin:8px 0">' . $rows . '</table>'
            . $note_html
            . '<p style="margin:22px 0">'
            . '<a href="' . esc_url( $yes ) . '" style="background:#1a1a2e;color:#D4A017;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;margin-right:10px">Yes, I can play</a>'
            . '<a href="' . esc_url( $no ) . '" style="background:#f0eee8;color:#555;padding:12px 22px;border-radius:8px;text-decoration:none">Can\'t make it</a>'
            . '</p>'
            . '<p style="color:#6b7280;font-size:13px">First yes gets the spot. You will be asked to confirm on the next page.</p>'
            . '<p>Gold Rush Senior Hockey</p></div>';
    }

    // -------------------------------------------------------------------------
    // GET /alternates/requests
    // -------------------------------------------------------------------------

    public static function list_requests(): WP_REST_Response {
        global $wpdb;
        self::ensure_table();
        $rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT r.group_id, r.player_id, r.team, r.division, r.game_date, r.position, r.status,
                    r.sent_at, r.responded_at, p.first_name, p.last_name
               FROM " . self::table() . " r
          LEFT JOIN {$wpdb->prefix}grsh_players p ON p.id = r.player_id
              WHERE r.season_id = %d
           ORDER BY r.sent_at DESC, r.id ASC
              LIMIT 200",
            self::season_id()
        ), ARRAY_A ) ?: [];

        $cutoff = time() - self::EXPIRY_HOURS * HOUR_IN_SECONDS;
        $groups = [];
        foreach ( $rows as $r ) {
            $g = $r['group_id'];
            if ( ! isset( $groups[ $g ] ) ) {
                $groups[ $g ] = [ 'group_id' => $g, 'team' => $r['team'], 'division' => $r['division'],
                                  'game_date' => $r['game_date'], 'position' => $r['position'],
                                  'sent_at' => $r['sent_at'], 'filled_by' => null, 'recipients' => [] ];
            }
            $status = $r['status'];
            if ( $status === 'sent' && strtotime( $r['sent_at'] ) < $cutoff ) {
                $status = 'expired';
            }
            $name = trim( $r['first_name'] . ' ' . $r['last_name'] );
            if ( $status === 'yes' ) {
                $groups[ $g ]['filled_by'] = $name;
            }
            $groups[ $g ]['recipients'][] = [ 'player_id' => (int) $r['player_id'], 'name' => $name,
                                              'status' => $status, 'responded_at' => $r['responded_at'] ];
        }
        return new WP_REST_Response( array_slice( array_values( $groups ), 0, 25 ), 200 );
    }

    // -------------------------------------------------------------------------
    // Public landing page
    // -------------------------------------------------------------------------

    public static function handle_landing(): void {
        if ( is_admin() || empty( $_REQUEST['grsh_sub'] ) ) {
            return;
        }
        $token = sanitize_text_field( wp_unslash( $_REQUEST['grsh_sub'] ) );
        if ( ! preg_match( '/^[a-f0-9]{64}$/', $token ) ) {
            return;
        }
        global $wpdb;
        self::ensure_table();

        $row = $wpdb->get_row( $wpdb->prepare(
            "SELECT r.*, p.first_name, p.last_name FROM " . self::table() . " r
               JOIN {$wpdb->prefix}grsh_players p ON p.id = r.player_id
              WHERE r.token = %s",
            $token
        ), ARRAY_A );
        if ( ! $row ) {
            return;
        }

        $answer = isset( $_REQUEST['a'] ) && $_REQUEST['a'] === 'no' ? 'no' : 'yes';
        $is_post = isset( $_SERVER['REQUEST_METHOD'] ) && $_SERVER['REQUEST_METHOD'] === 'POST' && ! empty( $_POST['grsh_sub_confirm'] );
        $facts = sprintf( '%s %s — %s', self::division_label( $row['division'] ), $row['team'], $row['game_date'] );

        if ( $row['status'] !== 'sent' ) {
            self::page( 'Already handled', self::status_text( $row['status'] ), $facts );
        }
        if ( strtotime( $row['sent_at'] ) < time() - self::EXPIRY_HOURS * HOUR_IN_SECONDS ) {
            self::page( 'This request has expired', 'Sorry — this sub request is more than ' . self::EXPIRY_HOURS . ' hours old.', $facts );
        }

        if ( ! $is_post ) {
            $label = $answer === 'yes' ? 'Yes, I can play' : "No, I can't make it";
            $form  = '<form method="post"><input type="hidden" name="grsh_sub" value="' . esc_attr( $token ) . '">'
                   . '<input type="hidden" name="a" value="' . esc_attr( $answer ) . '">'
                   . '<input type="hidden" name="grsh_sub_confirm" value="1">'
                   . '<button type="submit" style="font-size:16px;padding:12px 26px;border:0;border-radius:8px;background:#1a1a2e;color:#D4A017;cursor:pointer">'
                   . esc_html( $label ) . '</button></form>';
            self::page( 'Confirm your answer', 'Hi ' . esc_html( $row['first_name'] ) . ' — please confirm:', $facts, $form );
        }

        self::process_answer( $row, $answer, $facts );
    }

    private static function status_text( string $status ): string {
        switch ( $status ) {
            case 'yes':    return 'You already said yes — you are confirmed. See you on the ice!';
            case 'no':     return 'You already told us you can\'t make it. Thanks for letting us know.';
            case 'filled': return 'This spot has already been filled. Thanks for answering — we will ask again next time.';
            default:       return 'This request is no longer open.';
        }
    }

    private static function process_answer( array $row, string $answer, string $facts ): void {
        global $wpdb;
        $t   = self::table();
        $now = current_time( 'mysql' );

        if ( $answer === 'no' ) {
            $wpdb->update( $t, [ 'status' => 'no', 'responded_at' => $now ], [ 'id' => $row['id'], 'status' => 'sent' ] );
            self::page( 'Thanks for letting us know', 'We have marked you as unavailable for this one.', $facts );
        }

        // First YES wins — atomic: only succeeds if nobody else in the group is already 'yes'.
        $wpdb->query( $wpdb->prepare(
            "UPDATE {$t} SET status = 'yes', responded_at = %s
              WHERE id = %d AND status = 'sent'
                AND NOT EXISTS ( SELECT 1 FROM ( SELECT id FROM {$t} WHERE group_id = %s AND status = 'yes' ) x )",
            $now, $row['id'], $row['group_id']
        ) );

        if ( ! $wpdb->rows_affected ) {
            $wpdb->update( $t, [ 'status' => 'filled', 'responded_at' => $now ], [ 'id' => $row['id'], 'status' => 'sent' ] );
            self::page( 'Spot already filled', 'Thanks for answering — someone else confirmed first. We will ask again next time.', $facts );
        }

        // Winner: release the others, log the activation, tell the requester.
        $others = $wpdb->get_results( $wpdb->prepare(
            "SELECT r.id, r.email, p.first_name FROM {$t} r
               JOIN {$wpdb->prefix}grsh_players p ON p.id = r.player_id
              WHERE r.group_id = %s AND r.status = 'sent' AND r.id <> %d",
            $row['group_id'], $row['id']
        ), ARRAY_A ) ?: [];
        $wpdb->query( $wpdb->prepare(
            "UPDATE {$t} SET status = 'filled' WHERE group_id = %s AND status = 'sent' AND id <> %d",
            $row['group_id'], $row['id']
        ) );
        foreach ( $others as $o ) {
            wp_mail( $o['email'], 'Sub spot filled — ' . $facts,
                '<p>Hi ' . esc_html( $o['first_name'] ) . ',</p><p>Thanks — the spot for <strong>' . esc_html( $facts )
                . '</strong> has been filled. No action needed.</p><p>Gold Rush Senior Hockey</p>',
                [ 'Content-Type: text/html; charset=UTF-8' ] );
        }

        if ( class_exists( 'GRSH_Alternates' ) ) {
            GRSH_Alternates::record_activation(
                (int) $row['player_id'], $row['team'], $row['division'], $row['game_date'],
                'short_roster', 'Confirmed by email request', 'Sub (email reply)'
            );
        }

        $creator = (int) $row['created_by'] ? get_userdata( (int) $row['created_by'] ) : null;
        $to      = $creator && is_email( $creator->user_email ) ? $creator->user_email : get_option( 'admin_email' );
        wp_mail( $to, 'Sub confirmed: ' . $row['first_name'] . ' ' . $row['last_name'] . ' — ' . $facts,
            '<p><strong>' . esc_html( $row['first_name'] . ' ' . $row['last_name'] ) . '</strong> said yes for <strong>'
            . esc_html( $facts ) . '</strong>.</p><p>The activation is logged and the other ' . count( $others )
            . ' sub(s) were told the spot is filled.</p>',
            [ 'Content-Type: text/html; charset=UTF-8' ] );

        self::page( "You're confirmed!", 'Thanks, ' . esc_html( $row['first_name'] ) . ' — you have the spot. The captain will be in touch.', $facts );
    }

    /** Minimal standalone page (no theme needed). Ends the request. */
    private static function page( string $title, string $message, string $facts, string $extra = '' ): void {
        nocache_headers();
        status_header( 200 );
        header( 'Content-Type: text/html; charset=UTF-8' );
        echo '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
           . '<meta name="robots" content="noindex,nofollow"><title>' . esc_html( $title ) . '</title></head>'
           . '<body style="font-family:Arial,Helvetica,sans-serif;background:#f6f5f0;margin:0;padding:40px 16px">'
           . '<div style="max-width:460px;margin:0 auto;background:#fff;border-radius:14px;padding:28px 26px;box-shadow:0 8px 30px rgba(0,0,0,.08)">'
           . '<h1 style="font-size:22px;margin:0 0 10px;color:#1a1a2e">' . esc_html( $title ) . '</h1>'
           . '<p style="color:#333;line-height:1.5">' . $message . '</p>'
           . '<p style="background:#f6f5f0;padding:10px 12px;border-radius:8px;color:#1a1a2e"><strong>' . esc_html( $facts ) . '</strong></p>'
           . $extra
           . '</div></body></html>';
        exit;
    }
}
