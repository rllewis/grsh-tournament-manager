<?php
/**
 * GRSH Renewal Invites
 *
 * One-click "come back for next season" invitations for returning players.
 *
 *  - POST /grsh/v1/renewals/send   send (or re-send) invites to a list of players
 *  - GET  /grsh/v1/renewals        invite status per player for the current season
 *
 * Each invite carries an unguessable token in the link (?grsh_renew=TOKEN).
 * Visiting the link records the "opened" event and pre-fills name / email /
 * phone in the WPForms registration form on that page. "Registered" and "Paid"
 * are NOT stored here — they are derived from the real registration rows, so the
 * funnel can never disagree with the Players table.
 *
 * @package GRSH_Tournament_Manager
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class GRSH_Renewals {

    const DB_VERSION_OPTION = 'grsh_renewals_db_ver';
    const DB_VERSION        = '1';
    const SETTINGS_OPTION   = 'grsh_renewal_settings';
    const TOKEN_TTL_DAYS    = 120;
    const MAX_PER_REQUEST   = 100;

    public static function register_hooks(): void {
        add_action( 'rest_api_init', [ __CLASS__, 'register_routes' ] );
        // Public landing: record the open + pre-fill the registration form.
        add_action( 'wp', [ __CLASS__, 'handle_landing' ] );
    }

    // -------------------------------------------------------------------------
    // Table
    // -------------------------------------------------------------------------

    private static function table(): string {
        global $wpdb;
        return $wpdb->prefix . 'grsh_renewal_invites';
    }

    private static function ensure_table(): void {
        if ( get_option( self::DB_VERSION_OPTION ) === self::DB_VERSION ) {
            return;
        }
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        $charset = $wpdb->get_charset_collate();
        $table   = self::table();
        dbDelta( "CREATE TABLE {$table} (
            id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            player_id   BIGINT UNSIGNED NOT NULL,
            season_id   BIGINT UNSIGNED NOT NULL,
            email       VARCHAR(190) NOT NULL,
            token       CHAR(64) NOT NULL,
            sent_at     DATETIME NOT NULL,
            send_count  INT UNSIGNED NOT NULL DEFAULT 1,
            opened_at   DATETIME DEFAULT NULL,
            open_count  INT UNSIGNED NOT NULL DEFAULT 0,
            sent_by     BIGINT UNSIGNED DEFAULT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY uq_player_season (player_id, season_id),
            UNIQUE KEY uq_token (token)
        ) {$charset};" );
        update_option( self::DB_VERSION_OPTION, self::DB_VERSION, false );
    }

    // -------------------------------------------------------------------------
    // REST
    // -------------------------------------------------------------------------

    public static function register_routes(): void {
        register_rest_route( 'grsh/v1', '/renewals', [
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => [ __CLASS__, 'get_renewals' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );
        register_rest_route( 'grsh/v1', '/renewals/send', [
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => [ __CLASS__, 'send_invites' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
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

    /** GET /renewals — saved composer defaults + per-player invite status. */
    public static function get_renewals( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        self::ensure_table();

        $rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT player_id, sent_at, send_count, opened_at, open_count
               FROM " . self::table() . " WHERE season_id = %d",
            self::season_id()
        ), ARRAY_A ) ?: [];

        $invites = [];
        foreach ( $rows as $r ) {
            $invites[ (int) $r['player_id'] ] = [
                'sent_at'    => $r['sent_at'],
                'send_count' => (int) $r['send_count'],
                'opened_at'  => $r['opened_at'],
                'open_count' => (int) $r['open_count'],
            ];
        }

        return new WP_REST_Response( [
            'invites'  => $invites,
            'settings' => self::get_settings(),
        ], 200 );
    }

    /** POST /renewals/send */
    public static function send_invites( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        self::ensure_table();

        $body = $request->get_json_params();
        $ids  = array_values( array_unique( array_filter( array_map( 'absint', (array) ( $body['player_ids'] ?? [] ) ) ) ) );
        $url  = esc_url_raw( trim( (string) ( $body['registration_url'] ?? '' ) ) );
        $subj = sanitize_text_field( (string) ( $body['subject'] ?? '' ) );
        $msg  = sanitize_textarea_field( (string) ( $body['body'] ?? '' ) );

        if ( ! $ids ) {
            return new WP_REST_Response( [ 'error' => 'No players selected.' ], 400 );
        }
        if ( count( $ids ) > self::MAX_PER_REQUEST ) {
            return new WP_REST_Response( [ 'error' => 'Send at most ' . self::MAX_PER_REQUEST . ' invites at a time.' ], 400 );
        }
        if ( ! $url || ! wp_http_validate_url( $url ) ) {
            return new WP_REST_Response( [ 'error' => 'Enter a valid registration page URL (https://…).' ], 400 );
        }
        if ( strpos( $msg, '{link}' ) === false ) {
            return new WP_REST_Response( [ 'error' => 'The message must contain {link} so players get their personal link.' ], 400 );
        }
        if ( $subj === '' ) {
            return new WP_REST_Response( [ 'error' => 'Subject is required.' ], 400 );
        }

        update_option( self::SETTINGS_OPTION, [
            'registration_url' => $url,
            'subject'          => $subj,
            'body'             => $msg,
        ], false );

        $season_id = self::season_id();
        $place     = implode( ',', array_fill( 0, count( $ids ), '%d' ) );
        $players   = $wpdb->get_results( $wpdb->prepare(
            "SELECT p.id, p.first_name, p.last_name, p.email, r.id AS registration_id
               FROM {$wpdb->prefix}grsh_players p
          LEFT JOIN {$wpdb->prefix}grsh_registrations r
                 ON r.player_id = p.id AND r.season_id = %d
              WHERE p.id IN ($place)",
            array_merge( [ $season_id ], $ids )
        ), ARRAY_A ) ?: [];

        $sent = 0; $skipped = []; $failed = [];
        $now  = current_time( 'mysql' );
        $year = class_exists( 'GRSH_Sync_Engine' ) ? GRSH_Sync_Engine::SEASON : gmdate( 'Y' );

        foreach ( $players as $p ) {
            $name = trim( $p['first_name'] . ' ' . $p['last_name'] );
            if ( ! empty( $p['registration_id'] ) ) {
                $skipped[] = [ 'id' => (int) $p['id'], 'name' => $name, 'reason' => 'already registered' ];
                continue;
            }
            if ( ! is_email( $p['email'] ) ) {
                $skipped[] = [ 'id' => (int) $p['id'], 'name' => $name, 'reason' => 'no valid email' ];
                continue;
            }

            // Re-use the player's token on re-send so earlier emails keep working.
            $token = $wpdb->get_var( $wpdb->prepare(
                "SELECT token FROM " . self::table() . " WHERE player_id = %d AND season_id = %d",
                $p['id'], $season_id
            ) );
            $is_new = ! $token;
            if ( $is_new ) {
                $token = bin2hex( random_bytes( 32 ) );
            }

            $link    = add_query_arg( 'grsh_renew', $token, $url );
            $subject = str_replace( [ '{first_name}', '{season}' ], [ $p['first_name'], $year ], $subj );
            $text    = str_replace( [ '{first_name}', '{season}', '{link}' ], [ $p['first_name'], $year, $link ], $msg );
            // Plain-text body, made clickable. Everything but the link is escaped.
            $html    = nl2br( esc_html( $text ) );
            $html    = str_replace( esc_html( $link ), '<a href="' . esc_url( $link ) . '">' . esc_html( $link ) . '</a>', $html );

            $ok = wp_mail( $p['email'], $subject, $html, [ 'Content-Type: text/html; charset=UTF-8' ] );
            if ( ! $ok ) {
                $failed[] = [ 'id' => (int) $p['id'], 'name' => $name ];
                continue;
            }

            if ( $is_new ) {
                $wpdb->insert( self::table(), [
                    'player_id' => (int) $p['id'],
                    'season_id' => $season_id,
                    'email'     => $p['email'],
                    'token'     => $token,
                    'sent_at'   => $now,
                    'sent_by'   => get_current_user_id(),
                ], [ '%d', '%d', '%s', '%s', '%s', '%d' ] );
            } else {
                $wpdb->query( $wpdb->prepare(
                    "UPDATE " . self::table() . " SET sent_at = %s, send_count = send_count + 1, sent_by = %d
                      WHERE player_id = %d AND season_id = %d",
                    $now, get_current_user_id(), $p['id'], $season_id
                ) );
            }
            $sent++;
        }

        return new WP_REST_Response( [
            'sent'    => $sent,
            'skipped' => $skipped,
            'failed'  => $failed,
        ], 200 );
    }

    public static function get_settings(): array {
        $saved = get_option( self::SETTINGS_OPTION, [] );
        $saved = is_array( $saved ) ? $saved : [];
        return array_merge( [
            'registration_url' => '',
            'subject'          => 'Gold Rush {season} registration is open — {first_name}, are you in?',
            'body'             => "Hi {first_name},\n\nGold Rush {season} registration is open and we'd love to have you back.\n\nYour details are already filled in. It takes about a minute:\n{link}\n\nSee you on the ice,\nGold Rush Senior Hockey",
        ], $saved );
    }

    // -------------------------------------------------------------------------
    // Public landing page — open tracking + form pre-fill
    // -------------------------------------------------------------------------

    public static function handle_landing(): void {
        if ( is_admin() || empty( $_GET['grsh_renew'] ) ) {
            return;
        }
        $token = sanitize_text_field( wp_unslash( $_GET['grsh_renew'] ) );
        if ( ! preg_match( '/^[a-f0-9]{64}$/', $token ) ) {
            return;
        }
        global $wpdb;
        self::ensure_table();

        $row = $wpdb->get_row( $wpdb->prepare(
            "SELECT i.id, i.sent_at, p.first_name, p.last_name, p.email, p.phone
               FROM " . self::table() . " i
               JOIN {$wpdb->prefix}grsh_players p ON p.id = i.player_id
              WHERE i.token = %s",
            $token
        ), ARRAY_A );

        if ( ! $row ) {
            return;
        }
        if ( strtotime( $row['sent_at'] ) < time() - self::TOKEN_TTL_DAYS * DAY_IN_SECONDS ) {
            return; // expired link: no tracking, no pre-fill
        }

        $wpdb->query( $wpdb->prepare(
            "UPDATE " . self::table() . "
                SET opened_at = COALESCE(opened_at, %s), open_count = open_count + 1
              WHERE id = %d",
            current_time( 'mysql' ), $row['id']
        ) );

        $data = [
            'first' => $row['first_name'],
            'last'  => $row['last_name'],
            'email' => $row['email'],
            'phone' => $row['phone'],
        ];

        // Field IDs match the WPForms registration form map (20 = name, 21 = email, 22 = phone).
        add_action( 'wp_footer', function () use ( $data ) {
            ?>
<script>
(function(){
  var d = <?php echo wp_json_encode( $data ); ?>;
  function set(sel, val){
    document.querySelectorAll(sel).forEach(function(el){
      if(!el.value){ el.value = val; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }
    });
  }
  function fill(){
    set('.wpforms-form input[name="wpforms[fields][20][first]"]', d.first);
    set('.wpforms-form input[name="wpforms[fields][20][last]"]',  d.last);
    set('.wpforms-form input[name="wpforms[fields][21]"], .wpforms-form input[name="wpforms[fields][21][primary]"], .wpforms-form input[name="wpforms[fields][21][secondary]"]', d.email);
    set('.wpforms-form input[name="wpforms[fields][22]"]', d.phone);
  }
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', fill); } else { fill(); }
  setTimeout(fill, 800); // after WPForms/input-mask init
})();
</script>
            <?php
        }, 99 );
    }
}
