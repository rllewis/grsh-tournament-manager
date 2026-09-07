<?php
/**
 * GRSH Captain Signup — public self-service "Register My Team" form.
 *
 * Usage: place [grsh_captain_signup] on any WP page. A visitor who is not
 * yet a captain fills in their name, email, team name, and division; the
 * public REST route below calls the same GRSH_Captain_Provision::provision()
 * helper the admin "Invite a Captain" tool uses, so the outcome is always
 * identical: a WP account (role grsh_captain), a linked player record, and
 * a first full_team. No staff involvement required.
 *
 * Built 2026-08-19 to close "Worth building later" item #2 from the GRSH
 * registration staff doc, and the doc's Open Loop: a way to get a captain
 * an account without staff doing it by hand in the Users screen.
 *
 * Tier-1 hardening (2026-08-19): nonce check, per-IP rate limit, a
 * fill-time check, and an audit trail on every attempt (see
 * log_attempt()) on top of the original honeypot. Still no CAPTCHA — if
 * this form gets hit by anything more determined than opportunistic
 * bots, the next step is Cloudflare Turnstile or moving account
 * creation onto WPForms' User Registration addon (Lorenzo confirmed his
 * WPForms Pro license includes it) instead of this custom route.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class GRSH_Captain_Signup {

    const SHORTCODE = 'grsh_captain_signup';

    // Tier-1 hardening added 2026-08-19 after a security review flagged
    // this route as having only a honeypot: no nonce (a bot could POST
    // straight to the REST route with no page load at all), no rate
    // limit, no timing check, and no record of attempts. See
    // log_attempt() / is_rate_limited() / handle_signup() below.
    const RATE_LIMIT_MAX    = 5;              // attempts per IP
    const RATE_LIMIT_WINDOW = HOUR_IN_SECONDS;
    const MIN_FILL_SECONDS  = 3;              // faster than this is a bot, not a human

    public static function register_hooks(): void {
        add_shortcode( self::SHORTCODE, [ __CLASS__, 'render_shortcode' ] );
        add_action( 'wp_enqueue_scripts', [ __CLASS__, 'maybe_enqueue_assets' ] );
        add_action( 'rest_api_init', [ __CLASS__, 'register_routes' ] );
    }

    public static function register_routes(): void {
        register_rest_route( 'grsh/v1', '/captain/signup', [
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => [ __CLASS__, 'handle_signup' ],
            // Intentionally public — this is the whole point of the form.
            // No one is logged in yet when they submit it.
            'permission_callback' => '__return_true',
        ] );
    }

    public static function handle_signup( WP_REST_Request $request ): WP_REST_Response {
        $ip    = self::get_client_ip();
        $body  = (array) $request->get_json_params();
        $email = (string) ( $body['email'] ?? '' );

        // Rate limit first, and count this attempt toward it, before doing
        // any other work — so retries against a failing check still burn
        // down the per-IP budget instead of getting unlimited free tries.
        if ( self::is_rate_limited( $ip ) ) {
            self::log_attempt( 'captain_signup_rejected_rate_limit', $email, $ip );
            return new WP_REST_Response(
                [ 'error' => 'Too many attempts from this connection. Try again in an hour.' ],
                429
            );
        }
        self::bump_rate_limit( $ip );

        // Requires having actually loaded the signup page first (that's
        // where the nonce comes from) — blocks a bot that POSTs straight
        // to this route with no page load at all.
        $nonce = $request->get_header( 'X-GRSH-Nonce' );
        if ( ! wp_verify_nonce( (string) $nonce, 'grsh_captain_signup' ) ) {
            self::log_attempt( 'captain_signup_rejected_nonce', $email, $ip );
            return new WP_REST_Response(
                [ 'error' => 'Your session expired. Please reload the page and try again.' ],
                403
            );
        }

        // Honeypot: a real visitor never fills in a field named "website"
        // because it's hidden with CSS. Bots filling every field trip it.
        if ( ! empty( $body['website'] ) ) {
            self::log_attempt( 'captain_signup_rejected_honeypot', $email, $ip );
            // Report success so the bot doesn't learn the honeypot failed.
            return new WP_REST_Response( [ 'ok' => true ], 201 );
        }

        // Timing: a human can't fill four fields in under a few seconds.
        // A bot that scraped the nonce and skipped straight to POST
        // usually can't fake this without also faking the delay.
        $rendered_at = (int) ( $body['rendered_at'] ?? 0 );
        if ( $rendered_at && ( time() - $rendered_at ) < self::MIN_FILL_SECONDS ) {
            self::log_attempt( 'captain_signup_rejected_timing', $email, $ip );
            return new WP_REST_Response( [ 'ok' => true ], 201 );
        }

        $result = GRSH_Captain_Provision::provision(
            (string) ( $body['name'] ?? '' ),
            $email,
            (string) ( $body['team_name'] ?? '' ),
            (string) ( $body['division'] ?? '' )
        );

        if ( empty( $result['ok'] ) ) {
            self::log_attempt( 'captain_signup_rejected_validation', $email, $ip, $result['error'] ?? '' );
            return new WP_REST_Response(
                [ 'error' => $result['error'] ?? 'Could not register your team.' ],
                $result['status'] ?? 400
            );
        }

        self::log_attempt( 'captain_signup_success', $email, $ip );

        // Don't echo account/team internals back to an unauthenticated
        // caller beyond what the form needs to show a confirmation.
        return new WP_REST_Response( [
            'ok'           => true,
            'created_user' => $result['created_user'],
            'team_name'    => $result['name'] ?? '',
        ], 201 );
    }

    public static function render_shortcode(): string {
        // Someone who is already a captain (or admin) doesn't need to
        // sign up again — point them at their roster instead.
        if ( is_user_logged_in() && ( current_user_can( 'grsh_manage_own_roster' ) || current_user_can( 'manage_options' ) ) ) {
            return '<p>' . esc_html__( 'You already have an account.', 'grsh' )
                 . ' <a href="' . esc_url( self::get_roster_page_url() ) . '">'
                 . esc_html__( 'Go to your team roster', 'grsh' ) . '</a></p>';
        }

        return '<div id="grsh-captain-signup-root" class="grsh-captain-signup-root"></div>';
    }

    /**
     * Only enqueue on pages that actually use the shortcode — same guard
     * pattern as GRSH_Captain_Frontend::maybe_enqueue_assets().
     */
    public static function maybe_enqueue_assets(): void {
        global $post;
        if ( ! $post instanceof WP_Post || ! has_shortcode( $post->post_content, self::SHORTCODE ) ) {
            return;
        }

        wp_enqueue_script(
            'grsh-captain-signup',
            GRSH_PLUGIN_URL . 'assets/captain-signup.js',
            [],
            GRSH_VERSION,
            true
        );
        wp_localize_script( 'grsh-captain-signup', 'grshCaptainSignupConfig', [
            'url'        => esc_url_raw( rest_url( 'grsh/v1/captain/signup' ) ),
            // Custom nonce action, not the built-in wp_rest one — this route
            // is intentionally public (no cookie auth), so we just need proof
            // the caller loaded this page, not who they are.
            'nonce'      => wp_create_nonce( 'grsh_captain_signup' ),
            'renderedAt' => time(),
            'divisions'  => class_exists( 'GRSH_Settings' ) ? GRSH_Settings::get_active_divisions() : [],
            'loginUrl'   => wp_login_url( self::get_roster_page_url() ),
        ] );
    }

    private static function get_roster_page_url(): string {
        global $wpdb;
        $post_id = $wpdb->get_var(
            "SELECT ID FROM {$wpdb->posts}
             WHERE post_status = 'publish' AND post_type = 'page'
             AND post_content LIKE '%[grsh_captain_roster%' LIMIT 1"
        );
        return $post_id ? get_permalink( (int) $post_id ) : home_url( '/roster/' );
    }

    // -------------------------------------------------------------------------
    // Tier-1 hardening helpers (added 2026-08-19)
    // -------------------------------------------------------------------------

    /**
     * Best-effort client IP. Note: on hosting behind a reverse proxy or
     * CDN (e.g. if SiteGround/Cloudflare sits in front), REMOTE_ADDR can
     * be the proxy's IP rather than the visitor's, which would make every
     * visitor share one rate-limit bucket. Not confirmed either way for
     * grsht.com's current hosting — if the rate limit turns out to trip
     * for real visitors, check for an X-Forwarded-For/CF-Connecting-IP
     * header from a *trusted* proxy before trusting REMOTE_ADDR alone.
     */
    private static function get_client_ip(): string {
        return sanitize_text_field( (string) ( $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0' ) );
    }

    private static function rate_limit_key( string $ip ): string {
        return 'grsh_signup_rl_' . md5( $ip );
    }

    private static function is_rate_limited( string $ip ): bool {
        return (int) get_transient( self::rate_limit_key( $ip ) ) >= self::RATE_LIMIT_MAX;
    }

    private static function bump_rate_limit( string $ip ): void {
        $key   = self::rate_limit_key( $ip );
        $count = (int) get_transient( $key );
        set_transient( $key, $count + 1, self::RATE_LIMIT_WINDOW );
    }

    /**
     * Writes to wp_grsh_audit_logs for every signup attempt — accepted or
     * rejected — so abuse is visible in the admin instead of silent.
     * wp_user_id is always 0 here: the actor is an anonymous visitor, not
     * a logged-in WP user, matching the existing 'system'-style rows this
     * table already carries elsewhere (see GRSH_Sync_Engine::log_audit()).
     */
    private static function log_attempt( string $action, string $email, string $ip, string $notes = '' ): void {
        global $wpdb;
        $wpdb->insert(
            "{$wpdb->prefix}grsh_audit_logs",
            [
                'wp_user_id'   => 0,
                'user_display' => 'public signup form',
                'action'       => $action,
                'object_type'  => 'captain_signup',
                'notes'        => trim( $email . ( $notes ? " — {$notes}" : '' ) ),
                'ip_address'   => $ip,
            ],
            [ '%d', '%s', '%s', '%s', '%s', '%s' ]
        );
    }
}
