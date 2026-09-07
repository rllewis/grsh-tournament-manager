<?php
/**
 * GRSH Welcome Packet — print-ready "you're in" packet for a newly
 * invited captain: invite confirmation, a roster-app quickstart, and
 * the current division rules pulled live from the public Division page.
 *
 * Same no-PDF-library pattern as class-grsh-score-sheets.php: this host
 * has no Composer/vendor access, so this renders plain HTML styled for
 * print and relies on the browser's own Print / Save-as-PDF, opened in
 * a new tab from a "Welcome Packet" link next to each row on the Invite
 * Captain admin page.
 *
 * Round 3 (2026-09-01) — one of the four items originally deferred from
 * the Invite-Captain-UX-Audit "ten wow features" list; scoped and built
 * once Lorenzo confirmed the division-rules content should be pulled
 * live from grsht.com/division/ rather than hardcoded, so this never
 * drifts out of sync with whatever's actually published.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class GRSH_Welcome_Packet {

    public static function register_hooks(): void {
        add_action( 'admin_post_grsh_welcome_packet', [ __CLASS__, 'handle_request' ] );
    }

    public static function handle_request(): void {
        if ( ! current_user_can( 'manage_options' ) && ! current_user_can( 'grsh_committee' ) ) {
            wp_die( 'Not allowed.' );
        }

        $team_id = isset( $_GET['team_id'] ) ? (int) $_GET['team_id'] : 0;
        check_admin_referer( 'grsh_welcome_packet_' . $team_id );

        // Same debug-hardening reasoning as GRSH_Score_Sheets::
        // handle_print_request() — this runs outside the normal page
        // lifecycle via admin-post.php, so a fatal here can otherwise
        // produce a blank response with no clue why.
        ini_set( 'display_errors', '1' );
        error_reporting( E_ALL );

        try {
            self::render( $team_id );
        } catch ( \Throwable $e ) {
            header( 'Content-Type: text/plain; charset=utf-8' );
            echo "GRSH Welcome Packet error - please copy this entire message:\n\n";
            echo $e->getMessage() . "\n\n";
            echo $e->getFile() . ':' . $e->getLine() . "\n\n";
            echo $e->getTraceAsString();
            exit;
        }
    }

    private static function render( int $team_id ): void {
        global $wpdb;

        $team = $team_id ? $wpdb->get_row( $wpdb->prepare(
            "SELECT t.name AS team_name, t.division, p.first_name, p.last_name, p.email
             FROM {$wpdb->prefix}grsh_teams t
             INNER JOIN {$wpdb->prefix}grsh_players p ON p.id = t.captain_player_id
             WHERE t.id = %d",
            $team_id
        ), ARRAY_A ) : null;

        if ( ! $team ) {
            wp_die( 'No invited captain found for that team.' );
        }

        $division_label = self::division_label( $team['division'] );
        $captain_name   = trim( $team['first_name'] . ' ' . $team['last_name'] );
        $roster_url     = self::get_roster_page_url();
        $rules_html     = self::get_division_rules_html();

        header( 'Content-Type: text/html; charset=utf-8' );

        echo '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">';
        echo '<title>' . esc_html( $team['team_name'] ) . ' — Welcome Packet</title><style>';
        echo '@page{size:letter portrait;margin:0.5in}';
        echo '*{box-sizing:border-box}';
        echo 'body{font-family:Arial,Helvetica,sans-serif;color:#1a1a2e;margin:0}';
        echo '.toolbar{padding:10px;background:#1a1a2e;text-align:center}';
        echo '.toolbar p{color:#D4A017;font-weight:bold;margin:0;font-size:13px}';
        echo '.page{padding:20px}';
        echo 'h1{font-size:24px;margin:0 0 4px}';
        echo 'h2{font-size:16px;border-bottom:2px solid #1a1a2e;padding-bottom:4px;margin:24px 0 10px}';
        echo '.subtitle{color:#646970;margin:0 0 20px}';
        echo '.info-table{border-collapse:collapse;margin-bottom:8px}';
        echo '.info-table td{padding:3px 10px 3px 0;font-size:14px}';
        echo '.info-table td:first-child{font-weight:bold;width:120px}';
        echo '.steps{margin:0;padding-left:20px}';
        echo '.steps li{margin-bottom:8px;font-size:14px}';
        echo '.rules-content{font-size:13px;line-height:1.5}';
        echo '.rules-content img{max-width:100%}';
        echo '@media print{.toolbar{display:none}}';
        echo '</style></head><body>';
        echo '<div class="toolbar"><p>Use your browser Print command (Ctrl+P or File &gt; Print) to print or save as PDF.</p></div>';
        echo '<div class="page">';

        echo '<h1>Welcome to Gold Rush Senior Hockey</h1>';
        echo '<p class="subtitle">Captain welcome packet</p>';

        echo '<h2>Your invite</h2>';
        echo '<table class="info-table">';
        echo '<tr><td>Captain</td><td>' . esc_html( $captain_name ) . '</td></tr>';
        echo '<tr><td>Team</td><td>' . esc_html( $team['team_name'] ) . '</td></tr>';
        echo '<tr><td>Division</td><td>' . esc_html( $division_label ) . '</td></tr>';
        echo '<tr><td>Email on file</td><td>' . esc_html( $team['email'] ) . '</td></tr>';
        echo '</table>';
        echo '<p>Name or phone wrong? Use the one-time "fix a typo" link emailed to you when your account was created — it doesn\'t need a password.</p>';

        echo '<h2>Building your roster — quickstart</h2>';
        echo '<ol class="steps">';
        echo '<li>Check your email for the "Set your password" link and finish creating your account.</li>';
        echo '<li>Log in, then go to your roster page: ' . esc_html( $roster_url ) . '</li>';
        echo '<li>Add each player by name, position, and jersey number. Mark exactly one goaltender.</li>';
        echo '<li>Your team needs a full roster to be tournament-ready — the roster page shows your live count as you go.</li>';
        echo '<li>Questions or a player who won\'t save correctly — contact the board rather than re-inviting yourself.</li>';
        echo '</ol>';

        echo '<h2>Division rules — ' . esc_html( $division_label ) . '</h2>';
        echo '<div class="rules-content">' . $rules_html . '</div>';

        echo '</div></body></html>';
        exit;
    }

    private static function division_label( string $key ): string {
        if ( class_exists( 'GRSH_Settings' ) ) {
            foreach ( GRSH_Settings::get_active_divisions() as $d ) {
                if ( $d['key'] === $key ) {
                    return $d['label'];
                }
            }
        }
        return $key;
    }

    /**
     * Pulls the CURRENT content of the public /division/ page and runs
     * it through the same 'the_content' filter chain the theme itself
     * uses when rendering the page live — this reads the page from the
     * database directly rather than making an HTTP round-trip to the
     * site's own front end, so it works even if the page is Elementor-
     * built (Elementor hooks 'the_content', so this still renders
     * correctly) and never depends on this server's own outbound
     * network access. Lorenzo's explicit call (2026-09-01): pull live,
     * never hardcode a snapshot, so this can't go stale.
     */
    private static function get_division_rules_html(): string {
        global $wpdb;

        $post = $wpdb->get_row(
            "SELECT ID, post_content FROM {$wpdb->posts}
             WHERE post_name = 'division' AND post_type = 'page' AND post_status = 'publish'
             LIMIT 1",
            ARRAY_A
        );

        if ( ! $post ) {
            return '<p><em>Could not load the current division rules automatically — see '
                . esc_html( home_url( '/division/' ) ) . ' directly.</em></p>';
        }

        // apply_filters( 'the_content', ... ) is what actually resolves
        // Elementor's stored JSON/shortcodes into real markup — this is
        // the same call WordPress core's own the_content() template tag
        // makes, just invoked directly instead of inside The Loop.
        $rendered = apply_filters( 'the_content', $post['post_content'] );

        return $rendered !== '' ? $rendered : '<p><em>The division page has no content yet.</em></p>';
    }

    /** Same lookup GRSH_Captain_Invite uses — kept independent to avoid a cross-file dependency for one query. */
    private static function get_roster_page_url(): string {
        global $wpdb;
        $post_id = $wpdb->get_var(
            "SELECT ID FROM {$wpdb->posts}
             WHERE post_status = 'publish' AND post_type = 'page'
             AND post_content LIKE '%[grsh_captain_roster%' LIMIT 1"
        );
        return $post_id ? get_permalink( (int) $post_id ) : home_url( '/roster/' );
    }
}
