<?php
/**
 * GRSH Waiver ↔ WPForms bridge.
 *
 * The roster page emails each captain-added player a link to the WPForms
 * "GRSH Tournament Waiver" Form Page, prefilled with their name, email,
 * team and division. A hidden "Player ID" field carries "{registration_id}-{token}".
 * When the form is submitted, wpforms_process_complete verifies the token
 * and marks the registration signed, so the captain's roster shows
 * "Signed" with no manual step. The PDF copy for the rink is produced by
 * the WPForms PDF Addon on that same form — nothing here touches PDFs.
 *
 * Replaces the placeholder-text GRSH_Waiver_Page flow for roster players
 * (that class is left in place so old links don't 404, but is no longer
 * used to send new emails).
 *
 * Config (all optional — defaults match form 5675 / Form Page slug waiver-2027):
 *   define( 'GRSH_WAIVER_FORM_ID', 5675 );  or filter grsh_waiver_form_id
 *   define( 'GRSH_WAIVER_SLUG', 'waiver-2027' );  or filter grsh_waiver_slug
 *
 * Field IDs on that form: 33 name, 44 email, 59 team, 60 division,
 * 61 captain email, 62 player id (hidden). Change FIELD_* if the form is rebuilt.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class GRSH_Waiver_WPForms {

    const DEFAULT_FORM_ID = 5675;
    // Verified live 2026-11-19 12:55 after the form was saved: /waiver-2027/ serves
    // form 5675 (200, all fields prefill); the older long address now 404s.
    // Must match Form Pages > Permalink on the form.
    const DEFAULT_SLUG    = 'waiver-2027';

    const FIELD_NAME          = 33;
    const FIELD_EMAIL         = 44;
    const FIELD_TEAM          = 59;
    const FIELD_DIVISION      = 60;
    const FIELD_CAPTAIN_EMAIL = 61;
    const FIELD_PLAYER_ID     = 62;

    const LOG_OPTION          = 'grsh_waiver_send_log';
    const RESEND_COOLDOWN     = HOUR_IN_SECONDS;
    const REMIND_COOLDOWN     = DAY_IN_SECONDS;

    public static function register_hooks(): void {
        add_action( 'wpforms_process_complete', [ __CLASS__, 'on_form_submitted' ], 10, 4 );
        add_action( 'wp_mail_failed',           [ __CLASS__, 'on_mail_failed' ] );
    }

    // ---------------------------------------------------------------- config

    public static function form_id(): int {
        $id = defined( 'GRSH_WAIVER_FORM_ID' ) ? (int) GRSH_WAIVER_FORM_ID : self::DEFAULT_FORM_ID;
        return (int) apply_filters( 'grsh_waiver_form_id', $id );
    }

    public static function slug(): string {
        $slug = defined( 'GRSH_WAIVER_SLUG' ) ? (string) GRSH_WAIVER_SLUG : self::DEFAULT_SLUG;
        return (string) apply_filters( 'grsh_waiver_slug', $slug );
    }

    // ----------------------------------------------------------------- token

    /** 32-hex-char HMAC bound to the registration id. Not guessable without the site secret. */
    public static function make_token( int $registration_id ): string {
        $secret = defined( 'GRSH_WAIVER_SECRET' ) ? GRSH_WAIVER_SECRET : AUTH_KEY;
        return substr( hash_hmac( 'sha256', 'wpf-waiver:' . $registration_id, $secret ), 0, 32 );
    }

    public static function player_id_value( int $registration_id ): string {
        return $registration_id . '-' . self::make_token( $registration_id );
    }

    /** @return int registration id, or 0 if the value is malformed / forged. */
    public static function verify_player_id_value( string $value ): int {
        if ( ! preg_match( '/^(\d+)-([a-f0-9]{32})$/', trim( $value ), $m ) ) {
            return 0;
        }
        $reg_id = (int) $m[1];
        return ( $reg_id > 0 && hash_equals( self::make_token( $reg_id ), $m[2] ) ) ? $reg_id : 0;
    }

    // ------------------------------------------------------------------- URL

    public static function build_url( int $registration_id, array $ctx ): string {
        $f = self::form_id();
        $p = 'wpf' . $f . '_';
        $args = [
            $p . self::FIELD_NAME . '_first' => (string) ( $ctx['first_name'] ?? '' ),
            $p . self::FIELD_NAME . '_last'  => (string) ( $ctx['last_name'] ?? '' ),
            $p . self::FIELD_EMAIL           => (string) ( $ctx['email'] ?? '' ),
            $p . self::FIELD_TEAM            => (string) ( $ctx['team'] ?? '' ),
            $p . self::FIELD_DIVISION        => (string) ( $ctx['division'] ?? '' ),
            $p . self::FIELD_CAPTAIN_EMAIL   => (string) ( $ctx['captain_email'] ?? '' ),
            $p . self::FIELD_PLAYER_ID       => self::player_id_value( $registration_id ),
        ];
        return add_query_arg( array_map( 'rawurlencode', $args ), home_url( '/' . self::slug() . '/' ) );
    }

    // --------------------------------------------------------------- context

    /** Everything needed to build the link + email for one registration. */
    public static function load_context( int $registration_id ): ?array {
        global $wpdb;
        $row = $wpdb->get_row( $wpdb->prepare(
            "SELECT p.first_name, p.last_name, p.email, r.signed_at,
                    t.name AS team, t.division, cp.email AS captain_email
             FROM {$wpdb->prefix}grsh_registrations r
             JOIN {$wpdb->prefix}grsh_players p ON p.id = r.player_id
             LEFT JOIN {$wpdb->prefix}grsh_rosters ro ON ro.registration_id = r.id
             LEFT JOIN {$wpdb->prefix}grsh_teams t ON t.id = ro.team_id
             LEFT JOIN {$wpdb->prefix}grsh_players cp ON cp.id = t.captain_player_id
             WHERE r.id = %d LIMIT 1",
            $registration_id
        ), ARRAY_A );
        if ( ! $row ) {
            return null;
        }
        $division = (string) $row['division'];
        foreach ( GRSH_Settings::get_active_divisions() as $d ) {
            if ( $d['key'] === $division ) {
                $division = $d['label'];
                break;
            }
        }
        $row['division'] = $division;
        return $row;
    }

    // ------------------------------------------------------------------ send

    /**
     * Email the player their waiver link. Skips already-signed registrations.
     * $kind: 'initial' | 'resend' | 'reminder' (changes subject/intro only).
     */
    public static function send( int $registration_id, string $kind = 'initial' ): bool {
        $ctx = self::load_context( $registration_id );
        if ( ! $ctx || self::is_signed( $registration_id ) || ! is_email( $ctx['email'] ) ) {
            return false;
        }
        $url   = self::build_url( $registration_id, $ctx );
        $first = $ctx['first_name'];
        $team  = $ctx['team'] ?: 'your team';

        $subject = $kind === 'reminder'
            ? __( 'Reminder: sign your waiver — Gold Rush Senior Hockey', 'grsh' )
            : __( 'Sign your waiver — Gold Rush Senior Hockey', 'grsh' );
        $intro = $kind === 'reminder'
            ? sprintf( "Hi %s,\n\nQuick reminder: we still need your signed waiver for %s.", $first, $team )
            : sprintf( "Hi %s,\n\nYour captain added you to the %s roster for Gold Rush Senior Hockey.", $first, $team );
        $body = $intro . "\n\nIt takes about two minutes. Your name and team are already filled in:\n\n"
              . $url . "\n\nThis link is just for you, please don't forward it. "
              . "You will get a copy of the signed waiver by email.\n\nGold Rush Senior Hockey";

        // Clear any earlier failure, then record the attempt BEFORE sending so
        // a wp_mail_failed callback (fired during wp_mail) can flag this one.
        self::log_update( $registration_id, [ 'sent_at' => time(), 'kind' => $kind, 'failed' => false ] );
        $GLOBALS['grsh_waiver_sending_reg'] = $registration_id;
        $ok = wp_mail( $ctx['email'], $subject, $body );
        unset( $GLOBALS['grsh_waiver_sending_reg'] );
        if ( ! $ok ) {
            self::log_update( $registration_id, [ 'failed' => true ] );
        }
        return (bool) $ok;
    }

    public static function on_mail_failed( $error ): void {
        if ( ! empty( $GLOBALS['grsh_waiver_sending_reg'] ) ) {
            self::log_update( (int) $GLOBALS['grsh_waiver_sending_reg'], [ 'failed' => true ] );
        }
    }

    // ---------------------------------------------------------------- status

    private static function log_all(): array {
        $log = get_option( self::LOG_OPTION, [] );
        return is_array( $log ) ? $log : [];
    }

    private static function log_update( int $registration_id, array $fields ): void {
        $log = self::log_all();
        $log[ $registration_id ] = array_merge( $log[ $registration_id ] ?? [], $fields );
        update_option( self::LOG_OPTION, $log, false );
    }

    /**
     * True only when this registration signed THIS waiver (the WPForms v2
     * form). registrations.signed_at is NOT used: the 2027 Player
     * Registration form's own waiver also writes it via the sync engine, so
     * a player who registered individually would show "Signed" here without
     * ever receiving or signing the rink's waiver / PDF.
     */
    public static function is_signed( int $registration_id ): bool {
        return ! empty( self::log_all()[ $registration_id ]['signed_v2'] );
    }

    /** @return array{status:string,sent_at:?int} status: signed | sent | failed | not_sent */
    public static function status_for( int $registration_id, bool $signed ): array {
        $entry   = self::log_all()[ $registration_id ] ?? [];
        $sent_at = isset( $entry['sent_at'] ) ? (int) $entry['sent_at'] : null;
        if ( $signed ) {
            return [ 'status' => 'signed', 'sent_at' => $sent_at ];
        }
        if ( ! empty( $entry['failed'] ) ) {
            return [ 'status' => 'failed', 'sent_at' => $sent_at ];
        }
        return [ 'status' => $sent_at ? 'sent' : 'not_sent', 'sent_at' => $sent_at ];
    }

    /** Seconds until another send is allowed for this registration (0 = ok now). */
    public static function cooldown_remaining( int $registration_id, int $cooldown ): int {
        $sent = (int) ( self::log_all()[ $registration_id ]['sent_at'] ?? 0 );
        return max( 0, $sent + $cooldown - time() );
    }

    // ------------------------------------------------------- form submission

    /**
     * wpforms_process_complete( $fields, $entry, $form_data, $entry_id )
     * Marks the registration signed only if the hidden Player ID token verifies.
     */
    public static function on_form_submitted( $fields, $entry, $form_data, $entry_id ): void {
        global $wpdb;
        if ( (int) ( $form_data['id'] ?? 0 ) !== self::form_id() ) {
            return;
        }
        $raw = (string) ( $fields[ self::FIELD_PLAYER_ID ]['value'] ?? '' );
        $registration_id = self::verify_player_id_value( $raw );
        if ( ! $registration_id ) {
            return; // walk-up / direct signing: no roster link to update.
        }

        // The roster's Signed status keys off this, not signed_at.
        self::log_update( $registration_id, [ 'signed_v2' => time() ] );

        $name = trim( (string) ( $fields[ self::FIELD_NAME ]['value'] ?? '' ) );
        // Keep the first signature time if somehow submitted twice.
        $already = $wpdb->get_var( $wpdb->prepare(
            "SELECT signed_at FROM {$wpdb->prefix}grsh_registrations WHERE id = %d", $registration_id
        ) );
        if ( $already ) {
            return;
        }
        $wpdb->update(
            "{$wpdb->prefix}grsh_registrations",
            [
                'waiver_accepted' => 1,
                'esignature'      => mb_substr( sanitize_text_field( $name ), 0, 200 ),
                'signed_at'       => current_time( 'mysql' ),
            ],
            [ 'id' => $registration_id ]
        );
    }
}
