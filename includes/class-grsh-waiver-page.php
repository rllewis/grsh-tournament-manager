<?php
/**
 * GRSH Waiver Page — standalone, token-gated public page for roster
 * players (added by a captain via GRSH_Captain_Roster::add_player_to_team())
 * to sign their own waiver. Deliberately NOT part of the React captain
 * SPA (GRSH_Captain_Frontend) — this is a single static form, and a full
 * SPA build for one text field + a wall of legal text would be overkill.
 *
 * URL: grsht.com/roster-waiver/{registration_id}/{token}/
 *
 * The token is never stored — it's an HMAC of the registration_id, so
 * there is nothing new in the database for this feature at all. Anyone
 * with a valid registration_id + the site secret can derive the same
 * token, which is exactly the property we want: the emailed link IS the
 * credential, nothing else gates access.
 *
 * Requires GRSH_WAIVER_SECRET to be defined (wp-config.php ideally).
 * Falls back to AUTH_KEY if not defined so this never fatals, but that
 * fallback is weaker (AUTH_KEY rotates if anyone ever regenerates WP
 * salts) — define GRSH_WAIVER_SECRET explicitly before relying on this
 * in production.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class GRSH_Waiver_Page {

    const QV_REG   = 'grsh_waiver_reg';    const QV_TOKEN = 'grsh_waiver_token';

    public static function register_hooks(): void {
        add_action( 'init', [ __CLASS__, 'register_rewrite' ] );
        add_filter( 'query_vars', [ __CLASS__, 'register_query_vars' ] );
        add_action( 'template_redirect', [ __CLASS__, 'maybe_render' ] );
    }

    public static function register_rewrite(): void {
        add_rewrite_rule(
            '^roster-waiver/([0-9]+)/([a-f0-9]{64})/?$',
            'index.php?' . self::QV_REG . '=$matches[1]&' . self::QV_TOKEN . '=$matches[2]',
            'top'
        );
    }

    public static function register_query_vars( array $vars ): array {
        $vars[] = self::QV_REG;
        $vars[] = self::QV_TOKEN;
        return $vars;
    }

    /**
     * Deterministic, unguessable, nothing stored. Same registration_id
     * always produces the same token given the same secret — that's the
     * whole point, it lets the emailed link be regenerated/resent later
     * without needing to look anything up first.
     */
    public static function make_token( int $registration_id ): string {
        $secret = defined( 'GRSH_WAIVER_SECRET' ) ? GRSH_WAIVER_SECRET : AUTH_KEY;
        return hash_hmac( 'sha256', (string) $registration_id, $secret );
    }

    public static function build_url( int $registration_id ): string {
        return home_url( '/roster-waiver/' . $registration_id . '/' . self::make_token( $registration_id ) . '/' );
    }

    public static function maybe_render(): void {        $registration_id = (int) get_query_var( self::QV_REG );
        $token            = (string) get_query_var( self::QV_TOKEN );

        if ( ! $registration_id || ! $token ) {
            return; // Not our URL — let WordPress handle it normally.
        }

        if ( ! hash_equals( self::make_token( $registration_id ), $token ) ) {
            wp_die( esc_html__( 'Invalid or expired waiver link. Contact your captain or GRSH for a new one.', 'grsh' ), '', [ 'response' => 403 ] );
        }

        global $wpdb;
        $reg = $wpdb->get_row( $wpdb->prepare(
            "SELECT r.id, r.esignature, r.signed_at, p.first_name, p.last_name
             FROM {$wpdb->prefix}grsh_registrations r
             JOIN {$wpdb->prefix}grsh_players p ON p.id = r.player_id
             WHERE r.id = %d",
            $registration_id
        ), ARRAY_A );

        if ( ! $reg ) {
            wp_die( esc_html__( 'Registration not found.', 'grsh' ), '', [ 'response' => 404 ] );
        }

        if ( $_SERVER['REQUEST_METHOD'] === 'POST' && empty( $reg['signed_at'] ) ) {
            self::handle_submit( $registration_id, $reg );
            return; // handle_submit() renders its own confirmation and exits.
        }

        self::render_page( $reg );
        exit;
    }
    private static function handle_submit( int $registration_id, array $reg ): void {
        $esignature = isset( $_POST['esignature'] ) ? sanitize_text_field( wp_unslash( $_POST['esignature'] ) ) : '';

        if ( $esignature === '' ) {
            self::render_page( $reg, esc_html__( 'Please type your full legal name to sign.', 'grsh' ) );
            exit;
        }

        global $wpdb;
        $wpdb->update(
            "{$wpdb->prefix}grsh_registrations",
            [ 'esignature' => $esignature, 'signed_at' => current_time( 'mysql' ) ],
            [ 'id' => $registration_id ]
        );

        self::render_confirmation( $reg['first_name'] );
        exit;
    }

    private static function render_page( array $reg, string $error = '' ): void {
        if ( ! empty( $reg['signed_at'] ) ) {
            self::render_confirmation( $reg['first_name'], $reg['signed_at'] );
            return;
        }
        $waiver_html = self::get_waiver_text(); // see note below
        ?>
<!DOCTYPE html><html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo( 'charset' ); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?php esc_html_e( 'Sign Your Waiver — Gold Rush Senior Hockey', 'grsh' ); ?></title>
<style>
body{font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;line-height:1.5;color:#222;}
.waiver-text{background:#f7f7f7;border:1px solid #ddd;border-radius:4px;padding:1rem 1.25rem;max-height:50vh;overflow-y:auto;margin-bottom:1.5rem;}
.waiver-text p{margin:0 0 .75rem;}
input[type=text]{width:100%;padding:.6rem;font-size:1rem;box-sizing:border-box;margin-bottom:.75rem;}
button{padding:.7rem 1.4rem;font-size:1rem;background:#0d3b66;color:#fff;border:0;border-radius:4px;cursor:pointer;}
.error{color:#a02020;margin-bottom:1rem;}
</style>
</head>
<body>
<h1><?php esc_html_e( 'Sign Your Waiver', 'grsh' ); ?></h1>
<p><?php echo esc_html( sprintf( __( 'Hi %s — please read the full waiver below, then type your full legal name to sign.', 'grsh' ), $reg['first_name'] ) ); ?></p>
<?php if ( $error ): ?><p class="error"><?php echo esc_html( $error ); ?></p><?php endif; ?>
<div class="waiver-text"><?php echo $waiver_html; // phpcs:ignore -- trusted static admin-authored HTML, not user input ?></div>
<form method="post">
<label for="esignature"><strong><?php esc_html_e( 'Electronic Signature (type your full legal name)', 'grsh' ); ?></strong></label>
<input type="text" id="esignature" name="esignature" required>
<button type="submit"><?php esc_html_e( 'Sign & Submit', 'grsh' ); ?></button>
</form>
</body>
</html>
        <?php
    }

    private static function render_confirmation( string $first_name, string $signed_at = '' ): void {        ?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head><meta charset="<?php bloginfo( 'charset' ); ?>"><title><?php esc_html_e( 'Waiver Signed', 'grsh' ); ?></title></head>
<body style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:600px;margin:3rem auto;padding:0 1rem;">
<h1><?php esc_html_e( "You're all set", 'grsh' ); ?></h1>
<p><?php
if ( $signed_at ) {
    echo esc_html( sprintf( __( 'Thanks %1$s — this waiver was already signed on %2$s.', 'grsh' ), $first_name, date_i18n( get_option( 'date_format' ), strtotime( $signed_at ) ) ) );
} else {
    echo esc_html( sprintf( __( 'Thanks %s — your waiver is on file. Nothing else to do here.', 'grsh' ), $first_name ) );
}
?></p>
</body>
</html>
        <?php
    }

    /**
     * TODO: replace with the actual copy-pasted 8-section waiver HTML
     * (identical text to the "Waiver Full Text (Sections 1-8)" field on
     * form 5047) before this goes live. Left as a placeholder here
     * deliberately rather than retyped/paraphrased from memory.
     */
    private static function get_waiver_text(): string {
        return '<p><em>[Paste the exact 8-section waiver HTML here — same text as form 5047\'s "Waiver Full Text" field.]</em></p>';
    }
}