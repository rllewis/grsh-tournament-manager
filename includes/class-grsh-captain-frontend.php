<?php
/**
 * GRSH Captain Frontend — shortcode + asset loader for the self-service
 * full-team roster builder. Renders entirely outside wp-admin, since
 * captains use the 'grsh_captain' role, not 'grsh_committee'/'manage_options'.
 *
 * Usage: place [grsh_captain_roster] on any WP page.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class GRSH_Captain_Frontend {

    const SHORTCODE = 'grsh_captain_roster';

    public static function register_hooks(): void {
        add_shortcode( self::SHORTCODE, [ __CLASS__, 'render_shortcode' ] );
        add_action( 'wp_enqueue_scripts', [ __CLASS__, 'maybe_enqueue_assets' ] );
    }

    public static function render_shortcode(): string {
        // Public read-only share view bypasses the login/capability gate
        // entirely — token validation happens client-side against the
        // public share REST endpoint, not here.
        if ( isset( $_GET['grsh_share_team'], $_GET['grsh_share_token'] ) ) {
            return '<div id="grsh-captain-app" class="grsh-captain-root"></div>';
        }

        if ( ! is_user_logged_in() ) {
            return '<p>' . esc_html__( 'Please log in to manage your team roster.', 'grsh' )
                 . ' <a href="' . esc_url( wp_login_url( get_permalink() ) ) . '">'
                 . esc_html__( 'Log in', 'grsh' ) . '</a></p>';
        }

        if ( ! current_user_can( 'grsh_manage_own_roster' ) && ! current_user_can( 'manage_options' ) ) {
            return '<p>' . esc_html__(
                'Your account does not have team captain access. Contact the board if you believe this is a mistake.',
                'grsh'
            ) . '</p>';
        }

        return '<div id="grsh-captain-app" class="grsh-captain-root"></div>';
    }

    /**
     * Only enqueue the captain bundle on pages that actually use the
     * shortcode, and only for logged-in users.
     */
    public static function maybe_enqueue_assets(): void {
        $is_share_view = isset( $_GET['grsh_share_team'], $_GET['grsh_share_token'] );
        if ( ! is_user_logged_in() && ! $is_share_view ) {
            return;
        }
        global $post;
        if ( ! $post instanceof WP_Post || ! has_shortcode( $post->post_content, self::SHORTCODE ) ) {
            return;
        }

        $asset_file = GRSH_PLUGIN_DIR . 'dist/grsh-captain.asset.php';
        $asset      = file_exists( $asset_file )
            ? require $asset_file
            : [ 'dependencies' => [], 'version' => GRSH_VERSION ];

        wp_enqueue_script(
            'grsh-captain',
            GRSH_PLUGIN_URL . 'dist/grsh-captain.js',
            $asset['dependencies'],
            $asset['version'],
            true
        );

        wp_enqueue_style(
            'grsh-captain',
            GRSH_PLUGIN_URL . 'dist/grsh-captain.css',
            [],
            $asset['version']
        );

        wp_localize_script( 'grsh-captain', 'grshCaptainConfig', [
            'apiUrl' => esc_url_raw( rest_url( 'grsh/v1' ) ),
            'nonce'  => wp_create_nonce( 'wp_rest' ),
        ] );
    }
}
