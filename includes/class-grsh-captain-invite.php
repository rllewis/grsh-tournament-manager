<?php
/**
 * GRSH Captain Invite — staff-facing "Invite a Captain" admin tool.
 *
 * Adds a submenu page under GRSH → Invite Captain with a plain form
 * (name, email, team name, division). Submitting it calls the shared
 * GRSH_Captain_Provision::provision() helper, so the result is identical
 * to what the public signup form (class-grsh-captain-signup.php) produces:
 * a real WP account (role grsh_captain), a linked player record, and a
 * first full_team — no more hand-building accounts in Users → Add New.
 *
 * Built 2026-08-19 to close "Worth building later" item #1 from the GRSH
 * registration staff doc: a one-click way for staff to invite a captain.
 *
 * Round 2 (2026-09-01): adds an "Invites this season" summary — reusing
 * the existing generic wp_grsh_audit_logs table rather than a new one —
 * plus a flow-diagram and per-division heat-map on the same page, and a
 * WP-Cron 48-hour nudge for captains who never finished setting a
 * password. See docs/Invite-Captain-UX-Audit.md for the full feature
 * list and what was deliberately deferred.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class GRSH_Captain_Invite {

    // WP-Cron hook name for the 48h "never set a password" nudge sweep.
    const NUDGE_HOOK = 'grsh_captain_invite_nudge_check';

    // How long a captain's self-correction link stays valid. Round 3
    // (2026-09-01) — deliberately narrow: name/phone only, single-use,
    // never touches email or auth, per Lorenzo's explicit call.
    const CORRECTION_TOKEN_TTL = 3 * DAY_IN_SECONDS;

    public static function register_hooks(): void {
        // Priority 20: must fire AFTER grsh_register_admin_menu() creates
        // the parent menu, or this submenu registers with a mismatched
        // page hook - same bug class as the original Captain Sync issue.
        add_action( 'admin_menu', [ __CLASS__, 'register_admin_page' ], 20 );
        add_action( 'rest_api_init', [ __CLASS__, 'register_routes' ] );
        add_action( 'admin_init', [ __CLASS__, 'maybe_schedule_nudge_cron' ] );
        add_action( self::NUDGE_HOOK, [ __CLASS__, 'run_nudge_check' ] );
    }

    public static function register_admin_page(): void {
        add_submenu_page(
            'grsh-tm-dashboard',
            __( 'Invite Captain', 'grsh' ),
            __( 'Invite Captain', 'grsh' ),
            'manage_options',
            'grsh-tm-invite-captain',
            [ __CLASS__, 'render_admin_page' ]
        );
    }

    /**
     * Idempotent — wp_next_scheduled() guards against double-scheduling
     * on every admin page load. Uses WP's built-in 'twicedaily' interval
     * rather than a custom one; a 12h cadence comfortably catches a
     * 48h-old invite without needing finer granularity. Added 2026-09-01.
     */
    public static function maybe_schedule_nudge_cron(): void {
        if ( ! wp_next_scheduled( self::NUDGE_HOOK ) ) {
            wp_schedule_event( time(), 'twicedaily', self::NUDGE_HOOK );
        }
    }

    public static function register_routes(): void {
        register_rest_route( 'grsh/v1', '/admin/captains/invite', [
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => [ __CLASS__, 'handle_invite' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        // Read-only duplicate pre-check, added 2026-09-01 — lets the form
        // warn staff *before* they fill out the whole form and submit,
        // instead of only finding out after. Never mutates anything.
        // 'name' added in Round 2 to power the fuzzy "possible duplicate"
        // check in GRSH_Captain_Provision::check_existing_team().
        register_rest_route( 'grsh/v1', '/admin/captains/check', [
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => [ __CLASS__, 'handle_check' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
            'args'                => [
                'email' => [ 'required' => false ],
                'name'  => [ 'required' => false ],
            ],
        ] );

        // Round 3 (2026-09-01): admin-only. Regenerates the same
        // password-reset-key link WordPress core would have emailed, so
        // staff can hand it to a captain as a QR code at the rink instead
        // of relying on email. Same security profile as the email link —
        // single active key, core-managed expiry — not a parallel weaker
        // mechanism.
        register_rest_route( 'grsh/v1', '/admin/captains/reset-link', [
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => [ __CLASS__, 'handle_reset_link' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
            'args'                => [ 'team_id' => [ 'required' => true ] ],
        ] );

        // Round 3 (2026-09-01): public — the token itself is the auth,
        // same model WordPress core's own password-reset flow already
        // uses. GET renders a small raw-HTML form (via
        // rest_pre_serve_request, same technique already used by the
        // grsh-board plugin's public meeting view); POST applies the
        // correction. Deliberately scoped to name/phone only — cannot
        // touch email, password, or roles.
        register_rest_route( 'grsh/v1', '/captain/correction', [
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => [ __CLASS__, 'handle_correction_page' ],
            'permission_callback' => '__return_true',
            'args'                => [ 'token' => [ 'required' => true ] ],
        ] );
        register_rest_route( 'grsh/v1', '/captain/correction', [
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => [ __CLASS__, 'handle_correction_submit' ],
            'permission_callback' => '__return_true',
        ] );
    }

    // Same permission shape as GRSH_Admin_Full_Teams::check_permission() —
    // committee members and admins, never captains, can invite captains.
    public static function check_permission(): bool {
        return current_user_can( 'manage_options' ) || current_user_can( 'grsh_committee' );
    }

    public static function handle_invite( WP_REST_Request $request ): WP_REST_Response {
        $body = (array) $request->get_json_params();

        $name      = (string) ( $body['name'] ?? '' );
        $email     = (string) ( $body['email'] ?? '' );
        $team_name = (string) ( $body['team_name'] ?? '' );
        $division  = (string) ( $body['division'] ?? '' );

        // Settings > Divisions > Format: a draft-only division takes no registered teams.
        if ( $division !== '' && class_exists( 'GRSH_Settings' ) && method_exists( 'GRSH_Settings', 'division_format' ) && GRSH_Settings::division_format( $division ) === 'draft' ) {
            return new WP_REST_Response( [ 'error' => 'That division is set to Draft in Settings, so it does not take registered teams. Change its Format to "Registered teams" or "Both" first.' ], 400 );
        }

        $result = GRSH_Captain_Provision::provision( $name, $email, $team_name, $division );

        if ( empty( $result['ok'] ) ) {
            return new WP_REST_Response(
                [
                    'error'         => $result['error'] ?? 'Could not invite captain.',
                    // Forwarded so the form can link straight to the
                    // existing team instead of a dead-end error. Added
                    // 2026-09-01.
                    'existing_team' => $result['existing_team'] ?? null,
                ],
                $result['status'] ?? 400
            );
        }

        // Audit log entry — this IS the data source for the "Invites this
        // season" summary table below (get_invite_summary()), reusing the
        // plugin's existing generic audit table instead of a new one.
        // Logged only on success, mirroring GRSH_Team_Deposit::log_audit()
        // callers elsewhere in the plugin. Added 2026-09-01.
        self::log_audit(
            'captain_invited',
            'team',
            (int) ( $result['id'] ?? 0 ),
            null,
            [
                'captain_name'  => $name,
                'captain_email' => $email,
                'team_name'     => $result['name'] ?? $team_name,
                'division'      => $result['division'] ?? $division,
                'user_id'       => (int) ( $result['user_id'] ?? 0 ),
                'created_user'  => (bool) ( $result['created_user'] ?? false ),
            ],
            null
        );

        // Round 3 (2026-09-01): a separate follow-up email with a
        // one-time "fix a typo" link — only for brand-new accounts, and
        // deliberately NOT merged into wp_new_user_notification()'s own
        // email (that override was the reason this idea was deferred in
        // the first audit pass).
        if ( ! empty( $result['created_user'] ) && ! empty( $result['user_id'] ) ) {
            self::send_correction_email(
                (int) $result['user_id'],
                (int) ( $result['captain_player_id'] ?? self::player_id_for_user( (int) $result['user_id'] ) ),
                $email,
                $name
            );
        }

        return new WP_REST_Response( $result, 201 );
    }

    /** Small lookup used only when a caller didn't already have the player_id handy. */
    private static function player_id_for_user( int $user_id ): int {
        global $wpdb;
        return (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}grsh_players WHERE wp_user_id = %d", $user_id
        ) );
    }

    public static function handle_check( WP_REST_Request $request ): WP_REST_Response {
        $email = (string) $request->get_param( 'email' );
        $name  = (string) $request->get_param( 'name' );
        return new WP_REST_Response( GRSH_Captain_Provision::check_existing_team( $name, $email ), 200 );
    }

    /**
     * Plain PHP form, enhanced with vanilla JS — matches the existing
     * captain-sync-admin.js pattern (assets/captain-invite-admin.js) rather
     * than a React bundle. Keeps this tool independent of the webpack build.
     */
    public static function render_admin_page(): void {
        if ( ! current_user_can( 'manage_options' ) && ! current_user_can( 'grsh_committee' ) ) {
            wp_die( esc_html__( 'You do not have permission to access this page.', 'grsh' ) );
        }

        // Vendored, not CDN-loaded — this SiteGround host's admin pages
        // shouldn't depend on a third-party script host being up, and
        // the encoded payload here is a live single-use auth link, which
        // should never transit any server but this one. MIT-licensed
        // kazuhikoarase/qrcode-generator v1.4.4, verified byte-for-byte
        // against the published npm package before vendoring. Added
        // 2026-09-01 (Round 3).
        wp_enqueue_script(
            'grsh-qrcode-vendor',
            GRSH_PLUGIN_URL . 'assets/vendor/qrcode.js',
            [],
            '1.4.4',
            true
        );
        wp_enqueue_script(
            'grsh-captain-invite-admin',
            GRSH_PLUGIN_URL . 'assets/captain-invite-admin.js',
            [ 'grsh-qrcode-vendor' ],
            GRSH_VERSION,
            true
        );
        wp_localize_script( 'grsh-captain-invite-admin', 'grshCaptainInviteConfig', [
            'url'           => esc_url_raw( rest_url( 'grsh/v1/admin/captains/invite' ) ),
            'checkUrl'      => esc_url_raw( rest_url( 'grsh/v1/admin/captains/check' ) ),
            'resetLinkUrl'  => esc_url_raw( rest_url( 'grsh/v1/admin/captains/reset-link' ) ),
            'nonce'         => wp_create_nonce( 'wp_rest' ),
            'divisions'     => class_exists( 'GRSH_Settings' ) ? GRSH_Settings::divisions_for( 'full_team' ) : [],
            'rosterUrl'     => self::get_roster_page_url(),
            'fullTeamsUrl'  => admin_url( 'admin.php?page=grsh-tm-full-teams' ),
        ] );

        $summary = self::get_invite_summary();

        // Visual pass (2026-09-02): season badge in the new page header,
        // and the overdue list that backs the funnel's warning note —
        // both computed here so the markup below stays plain output.
        $season_year     = (int) ( GRSH_Settings::get()['season_year'] ?? 0 );
        $overdue_invites = array_values( array_filter( $summary['invites'], function ( $inv ) {
            return $inv['nudged'] && ! $inv['password_set'];
        } ) );
        ?>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Work+Sans:wght@400;500;600&display=swap">
        <style>
            /*
             * This is a single-purpose task page — a promo/upsell banner
             * (e.g. SportsPress's "your theme doesn't declare support")
             * shouldn't compete with it for attention. Scoped to this
             * page only via the body class WordPress adds for this exact
             * submenu, so notices on every other admin screen are left
             * alone. Added 2026-09-01.
             *
             * Known limitation (2026-09-02 visual pass): this only ever
             * matched real WP core `.notice` markup. Redirection's review
             * nag and the SportsPress theme-support banner render their
             * own non-`.notice` containers, so neither is actually caught
             * — confirmed against Lorenzo's own screenshot of the live
             * page, both were still showing. Left as-is rather than
             * guessing a broader selector with no live DOM to check it
             * against; flagged separately.
             */
            body.grsh-tm-dashboard_page_grsh-tm-invite-captain .notice:not(#grsh-invite-precheck):not(#grsh-invite-output) {
                display: none;
            }

            /* ---- Visual pass, 2026-09-02: palette pulled from the Round 3
               Welcome Packet CSS (navy #1a1a2e / gold #D4A017) so this page,
               the funnel/heat-map/table, and the printed packet read as one
               product. Reviewed and approved as an HTML mockup before this
               landed in the live file — see docs/Invite-Captain-UX-Audit.md
               (Round 3 addendum). ---- */
            #grsh-invite-captain-wrap {
                --grsh-navy: #1A1A2E;
                --grsh-gold: #D4A017;
                --grsh-gold-deep: #A87D0E;
                --grsh-gold-tint: #FBF0D9;
                --grsh-bg: #F4F6F8;
                --grsh-surface: #FFFFFF;
                --grsh-surface-2: #EBEFF3;
                --grsh-border: #D9E0E7;
                --grsh-text: #2B2E38;
                --grsh-text-muted: #68707E;
                --grsh-inv: #5B7089;   --grsh-inv-bg: #E7ECF1;
                --grsh-pend: #B9800F; --grsh-pend-bg: #FBF0D9;
                --grsh-done: #1F7A4D; --grsh-done-bg: #E2F3EA;
                --grsh-over: #B84534; --grsh-over-bg: #FBE8E3;
                --grsh-heat-0: #E7EAF0;
                --grsh-heat-1: #CFDCE6;
                --grsh-heat-2: #EFC64D;
                --grsh-heat-3: #1F7A4D;
                --grsh-shadow: 0 1px 2px rgba(20,22,34,.06), 0 8px 20px -12px rgba(20,22,34,.14);
                font-family: "Work Sans", -apple-system, "Segoe UI", sans-serif;
                color: var(--grsh-text);
                max-width: 1180px;
            }
            #grsh-invite-captain-wrap h1,
            #grsh-invite-captain-wrap h2,
            #grsh-invite-captain-wrap .grsh-eyebrow,
            #grsh-invite-captain-wrap .grsh-season-badge,
            #grsh-invite-captain-wrap .grsh-funnel-num,
            #grsh-invite-captain-wrap .grsh-heat-pct,
            #grsh-invite-captain-wrap .grsh-avatar {
                font-family: "Oswald", "Arial Narrow", Impact, sans-serif;
            }
            #grsh-invite-captain-wrap .grsh-page-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; flex-wrap: wrap; margin: 6px 0 20px; }
            #grsh-invite-captain-wrap .grsh-eyebrow { font-weight: 500; font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: var(--grsh-gold-deep); margin: 0 0 6px; }
            #grsh-invite-captain-wrap h1 { font-weight: 600; font-size: 28px; letter-spacing: .01em; margin: 0 0 6px; color: var(--grsh-navy); }
            #grsh-invite-captain-wrap .grsh-sub { margin: 0; color: var(--grsh-text-muted); font-size: 14px; max-width: 56ch; }
            #grsh-invite-captain-wrap .grsh-season-badge { font-weight: 500; font-size: 13px; letter-spacing: .05em; background: var(--grsh-navy); color: var(--grsh-gold); padding: 8px 16px; border-radius: 8px; white-space: nowrap; }

            #grsh-invite-captain-wrap .grsh-grid-2 { display: grid; grid-template-columns: minmax(280px,360px) 1fr; gap: 18px; margin-bottom: 18px; align-items: start; }
            @media (max-width: 900px) { #grsh-invite-captain-wrap .grsh-grid-2 { grid-template-columns: 1fr; } }

            #grsh-invite-captain-wrap .grsh-card { background: var(--grsh-surface); border: 1px solid var(--grsh-border); border-radius: 14px; padding: 22px; box-shadow: var(--grsh-shadow); margin-bottom: 18px; }
            #grsh-invite-captain-wrap .grsh-grid-2 .grsh-card { margin-bottom: 0; }
            #grsh-invite-captain-wrap .grsh-card h2 { font-weight: 500; font-size: 17px; margin: 0 0 16px; color: var(--grsh-navy); }

            #grsh-invite-captain-wrap .grsh-field { display: block; margin-bottom: 14px; }
            #grsh-invite-captain-wrap .grsh-field span { display: block; font-size: 12.5px; font-weight: 600; color: var(--grsh-text-muted); margin-bottom: 5px; text-transform: uppercase; letter-spacing: .04em; }
            #grsh-invite-captain-wrap .grsh-field input,
            #grsh-invite-captain-wrap .grsh-field select { width: 100%; padding: 9px 11px; border: 1.5px solid var(--grsh-border); border-radius: 9px; font-size: 14.5px; background: var(--grsh-bg); color: var(--grsh-text); box-sizing: border-box; }
            #grsh-invite-captain-wrap .grsh-field input:focus,
            #grsh-invite-captain-wrap .grsh-field select:focus { outline: none; border-color: var(--grsh-gold); box-shadow: 0 0 0 3px var(--grsh-gold-tint); }
            #grsh-invite-captain-wrap .grsh-submit-row { margin: 4px 0 0; }
            #grsh-invite-captain-wrap #grsh-invite-submit.button-primary { width: 100%; background: var(--grsh-navy); border-color: var(--grsh-navy); color: var(--grsh-gold); border-radius: 9px; padding: 9px 18px; font-weight: 600; text-shadow: none; box-shadow: none; }
            #grsh-invite-captain-wrap #grsh-invite-submit.button-primary:hover,
            #grsh-invite-captain-wrap #grsh-invite-submit.button-primary:focus { background: #26264a; border-color: #26264a; color: var(--grsh-gold); }
            #grsh-invite-captain-wrap #grsh-invite-cooldown,
            #grsh-invite-captain-wrap #grsh-invite-undo { font-size: 12.5px; color: var(--grsh-text-muted); }

            #grsh-invite-captain-wrap .grsh-flow { display: flex; align-items: stretch; gap: 0; margin: 0 0 14px; }
            #grsh-invite-captain-wrap .grsh-flow-stage { flex: 1; background: var(--grsh-surface-2); border-radius: 12px; padding: 14px; text-align: center; border: 1.5px solid transparent; }
            #grsh-invite-captain-wrap .grsh-flow-stage[data-state="active"] { border-color: var(--grsh-inv); background: var(--grsh-inv-bg); }
            #grsh-invite-captain-wrap .grsh-flow-stage[data-state="mid"] { border-color: var(--grsh-pend); background: var(--grsh-pend-bg); }
            #grsh-invite-captain-wrap .grsh-flow-stage[data-state="done"] { border-color: var(--grsh-done); background: var(--grsh-done-bg); }
            #grsh-invite-captain-wrap .grsh-funnel-num { display: block; font-weight: 700; font-size: 30px; line-height: 1; color: var(--grsh-navy); }
            #grsh-invite-captain-wrap .grsh-flow-stage[data-state="active"] .grsh-funnel-num { color: var(--grsh-inv); }
            #grsh-invite-captain-wrap .grsh-flow-stage[data-state="mid"] .grsh-funnel-num { color: var(--grsh-pend); }
            #grsh-invite-captain-wrap .grsh-flow-stage[data-state="done"] .grsh-funnel-num { color: var(--grsh-done); }
            #grsh-invite-captain-wrap .grsh-flow-stage span { display: block; font-size: 11.5px; font-weight: 600; color: var(--grsh-text-muted); text-transform: uppercase; letter-spacing: .04em; margin-top: 4px; }
            #grsh-invite-captain-wrap .grsh-flow-arrow { flex: none; width: 28px; display: flex; align-items: center; justify-content: center; color: var(--grsh-border); font-size: 18px; }
            #grsh-invite-captain-wrap .grsh-flow-note { font-size: 13px; color: var(--grsh-over); background: var(--grsh-over-bg); border-radius: 10px; padding: 10px 12px; margin: 0; }

            #grsh-invite-captain-wrap .grsh-heatmap { display: grid; grid-template-columns: repeat(5,1fr); gap: 12px; }
            @media (max-width: 820px) { #grsh-invite-captain-wrap .grsh-heatmap { grid-template-columns: repeat(2,1fr); } }
            #grsh-invite-captain-wrap .grsh-heat-cell { border-radius: 12px; padding: 14px; border: 1px solid var(--grsh-border); background: var(--grsh-heat-0); }
            #grsh-invite-captain-wrap .grsh-heat-cell.t1 { background: var(--grsh-heat-1); }
            #grsh-invite-captain-wrap .grsh-heat-cell.t2 { background: var(--grsh-heat-2); border-color: var(--grsh-heat-2); }
            #grsh-invite-captain-wrap .grsh-heat-cell.t3 { background: var(--grsh-heat-3); border-color: var(--grsh-heat-3); }
            #grsh-invite-captain-wrap .grsh-heat-cell.t3 strong, #grsh-invite-captain-wrap .grsh-heat-cell.t3 .grsh-heat-pct, #grsh-invite-captain-wrap .grsh-heat-cell.t3 .grsh-heat-frac { color: #fff; }
            #grsh-invite-captain-wrap .grsh-heat-cell.t3 .grsh-heat-bar-track { background: rgba(255,255,255,.35); }
            #grsh-invite-captain-wrap .grsh-heat-cell.t3 .grsh-heat-bar-fill { background: #fff; }
            #grsh-invite-captain-wrap .grsh-heat-cell strong { display: block; font-size: 13px; font-weight: 600; color: var(--grsh-navy); margin: 0 0 10px; }
            #grsh-invite-captain-wrap .grsh-heat-bar-track { height: 6px; border-radius: 100px; background: rgba(0,0,0,.08); overflow: hidden; margin-bottom: 8px; }
            #grsh-invite-captain-wrap .grsh-heat-bar-fill { height: 100%; border-radius: 100px; background: var(--grsh-navy); }
            #grsh-invite-captain-wrap .grsh-heat-pct { font-weight: 600; font-size: 19px; color: var(--grsh-navy); }
            #grsh-invite-captain-wrap .grsh-heat-frac { font-size: 12px; color: var(--grsh-text-muted); margin-left: 4px; }

            #grsh-invite-captain-wrap table.grsh-roster-table { border-collapse: collapse; width: 100%; font-size: 13.5px; background: var(--grsh-surface); }
            #grsh-invite-captain-wrap table.grsh-roster-table th { text-align: left; font-size: 11.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--grsh-text-muted); font-weight: 600; padding: 0 12px 10px; border-bottom: 1px solid var(--grsh-border); }
            #grsh-invite-captain-wrap table.grsh-roster-table td { padding: 12px; border-bottom: 1px solid var(--grsh-border); vertical-align: middle; }
            #grsh-invite-captain-wrap table.grsh-roster-table tbody tr:last-child td { border-bottom: none; }
            #grsh-invite-captain-wrap table.grsh-roster-table tbody tr:hover { background: var(--grsh-surface-2); }
            #grsh-invite-captain-wrap .grsh-captain-cell { display: flex; align-items: center; gap: 10px; }
            #grsh-invite-captain-wrap .grsh-avatar { width: 30px; height: 30px; border-radius: 50%; flex: none; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px; color: #fff; }
            #grsh-invite-captain-wrap .grsh-cap-name { font-weight: 600; color: var(--grsh-text); display: block; }
            #grsh-invite-captain-wrap .grsh-cap-email { font-size: 12px; color: var(--grsh-text-muted); }
            #grsh-invite-captain-wrap .grsh-pill { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 100px; font-size: 12px; font-weight: 600; white-space: nowrap; }
            #grsh-invite-captain-wrap .grsh-pill.grsh-inv { background: var(--grsh-inv-bg); color: var(--grsh-inv); }
            #grsh-invite-captain-wrap .grsh-pill.grsh-pend { background: var(--grsh-pend-bg); color: var(--grsh-pend); }
            #grsh-invite-captain-wrap .grsh-pill.grsh-done { background: var(--grsh-done-bg); color: var(--grsh-done); }
            #grsh-invite-captain-wrap .grsh-pill.grsh-over { background: var(--grsh-over-bg); color: var(--grsh-over); }
            #grsh-invite-captain-wrap .grsh-roster-mini { display: flex; align-items: center; gap: 8px; min-width: 100px; }
            #grsh-invite-captain-wrap .grsh-roster-mini .grsh-heat-bar-track { flex: 1; margin: 0; }
            #grsh-invite-captain-wrap .grsh-roster-mini span { font-size: 12px; color: var(--grsh-text-muted); white-space: nowrap; }
            #grsh-invite-captain-wrap .grsh-actions { display: flex; gap: 6px; }
            #grsh-invite-captain-wrap .grsh-icon-btn { width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--grsh-border); background: var(--grsh-surface); display: inline-flex; align-items: center; justify-content: center; color: var(--grsh-text-muted); text-decoration: none; }
            #grsh-invite-captain-wrap .grsh-icon-btn:hover, #grsh-invite-captain-wrap .grsh-icon-btn:focus { border-color: var(--grsh-gold); color: var(--grsh-gold-deep); background: var(--grsh-gold-tint); }
            #grsh-invite-captain-wrap .grsh-icon-btn svg { width: 15px; height: 15px; }

            #grsh-invite-captain-wrap .grsh-empty-state { text-align: center; padding: 36px 20px 14px; color: var(--grsh-text-muted); font-size: 13.5px; }
            #grsh-invite-captain-wrap .grsh-empty-state strong { display: block; color: var(--grsh-navy); font-size: 15px; margin-bottom: 6px; }

            /* Round 3 (2026-09-01): plain overlay + box, no modal library —
               matches this page's existing no-build-step, vanilla-JS style. */
            #grsh-qr-overlay {
                display: none; position: fixed; inset: 0; background: rgba(20,20,32,0.55);
                z-index: 100000; align-items: center; justify-content: center;
            }
            #grsh-qr-box {
                background: #fff; border-radius: 10px; padding: 22px; max-width: 320px;
                text-align: center; font-family: "Work Sans", -apple-system, "Segoe UI", sans-serif;
            }
            #grsh-qr-box h3 { font-family: "Oswald", "Arial Narrow", Impact, sans-serif; color: #1A1A2E; margin-top: 0; }
            #grsh-qr-box canvas { margin: 10px auto; }
            #grsh-qr-box .grsh-qr-link-text {
                word-break: break-all; font-size: 11px; color: #68707E; margin: 8px 0;
            }
        </style>
        <div class="wrap" id="grsh-invite-captain-wrap">
            <header class="grsh-page-head">
                <div>
                    <p class="grsh-eyebrow"><?php esc_html_e( 'GRSH Tournament Manager', 'grsh' ); ?></p>
                    <h1><?php esc_html_e( 'Invite a Captain', 'grsh' ); ?></h1>
                    <p class="grsh-sub">
                        <?php esc_html_e(
                            'Creates their WordPress account, emails a password-set link, and starts their team — they finish their own roster from there.',
                            'grsh'
                        ); ?>
                    </p>
                </div>
                <?php if ( $season_year ) : ?>
                    <div class="grsh-season-badge"><?php echo esc_html( sprintf(
                        /* translators: %d: season year */
                        __( 'Season %d', 'grsh' ),
                        $season_year
                    ) ); ?></div>
                <?php endif; ?>
            </header>

            <div class="grsh-grid-2">
                <section class="grsh-card">
                    <h2><?php esc_html_e( 'New invite', 'grsh' ); ?></h2>
                    <form id="grsh-invite-captain-form" onsubmit="return false;">
                        <label class="grsh-field">
                            <span><?php esc_html_e( 'Captain name', 'grsh' ); ?></span>
                            <input type="text" id="grsh-invite-name" required>
                        </label>
                        <label class="grsh-field">
                            <span><?php esc_html_e( 'Captain email', 'grsh' ); ?></span>
                            <input type="email" id="grsh-invite-email" required>
                            <div id="grsh-invite-precheck"></div>
                        </label>
                        <label class="grsh-field">
                            <span><?php esc_html_e( 'Team name', 'grsh' ); ?></span>
                            <input type="text" id="grsh-invite-team-name" required>
                        </label>
                        <label class="grsh-field">
                            <span><?php esc_html_e( 'Division', 'grsh' ); ?></span>
                            <select id="grsh-invite-division" required></select>
                        </label>
                        <p class="grsh-submit-row">
                            <button type="submit" id="grsh-invite-submit" class="button button-primary">
                                <?php esc_html_e( 'Send Invite', 'grsh' ); ?>
                            </button>
                            <span id="grsh-invite-cooldown"></span>
                            <span id="grsh-invite-undo" style="margin-left:8px;"></span>
                        </p>
                    </form>
                    <div id="grsh-invite-output"></div>
                </section>

                <!-- Flow diagram: added 2026-09-01, one of the ten requested
                     "wow" features — a plain-English pipeline view so staff
                     can see at a glance where the season's captains are
                     stuck, not just a raw list. Restyled 2026-09-02: each
                     stage is colour-coded to match its status pill in the
                     table below, and an overdue note surfaces automatically
                     instead of staff having to scan the whole table for a
                     "Nudge sent" row. -->
                <section class="grsh-card">
                    <h2><?php esc_html_e( 'Where invites stand', 'grsh' ); ?></h2>
                    <div class="grsh-flow">
                        <div class="grsh-flow-stage" data-state="active">
                            <strong class="grsh-funnel-num"><?php echo (int) $summary['stage_counts']['invited']; ?></strong>
                            <span><?php esc_html_e( 'Invited', 'grsh' ); ?></span>
                        </div>
                        <div class="grsh-flow-arrow">&rarr;</div>
                        <div class="grsh-flow-stage" data-state="mid">
                            <strong class="grsh-funnel-num"><?php echo (int) $summary['stage_counts']['active']; ?></strong>
                            <span><?php esc_html_e( 'Password set', 'grsh' ); ?></span>
                        </div>
                        <div class="grsh-flow-arrow">&rarr;</div>
                        <div class="grsh-flow-stage" data-state="done">
                            <strong class="grsh-funnel-num"><?php echo (int) $summary['stage_counts']['roster_complete']; ?></strong>
                            <span><?php
                                printf(
                                    /* translators: %d: minimum roster size */
                                    esc_html__( 'Roster complete (%d+)', 'grsh' ),
                                    (int) $summary['min_players']
                                );
                            ?></span>
                        </div>
                    </div>
                    <?php if ( ! empty( $overdue_invites ) ) : ?>
                        <p class="grsh-flow-note">
                            <?php if ( 1 === count( $overdue_invites ) ) : ?>
                                <?php echo esc_html( sprintf(
                                    /* translators: %s: captain name */
                                    __( "%s hasn't set a password after 48h+ — the automatic nudge email already went out.", 'grsh' ),
                                    $overdue_invites[0]['captain']
                                ) ); ?>
                            <?php else : ?>
                                <?php echo esc_html( sprintf(
                                    /* translators: %d: number of captains */
                                    __( "%d captains still haven't set a password after 48h+ — automatic nudge emails already went out.", 'grsh' ),
                                    count( $overdue_invites )
                                ) ); ?>
                            <?php endif; ?>
                        </p>
                    <?php endif; ?>
                </section>
            </div>

            <!-- Per-division heat-map: added 2026-09-01, restyled
                 2026-09-02 to actually heat-color by percent complete
                 instead of a flat three-state card — colour is still
                 driven purely by roster completeness against
                 GRSH_Scoring::FULL_TEAM_MIN_PLAYERS, the same threshold
                 the captain-facing roster page already uses. -->
            <section class="grsh-card">
                <h2><?php esc_html_e( 'Roster completion by division', 'grsh' ); ?></h2>
                <?php if ( empty( $summary['divisions'] ) ) : ?>
                    <p><em><?php esc_html_e( 'No active divisions configured yet.', 'grsh' ); ?></em></p>
                <?php else : ?>
                    <div class="grsh-heatmap">
                        <?php foreach ( $summary['divisions'] as $div ) :
                            $pct  = $div['teams'] > 0 ? (int) round( $div['complete'] / $div['teams'] * 100 ) : 0;
                            $tier = 't0';
                            if ( $pct >= 100 ) {
                                $tier = 't3';
                            } elseif ( $pct >= 50 ) {
                                $tier = 't2';
                            } elseif ( $pct > 0 ) {
                                $tier = 't1';
                            }
                        ?>
                            <div class="grsh-heat-cell <?php echo esc_attr( $tier ); ?>">
                                <strong><?php echo esc_html( $div['label'] ); ?></strong>
                                <div class="grsh-heat-bar-track"><div class="grsh-heat-bar-fill" style="width:<?php echo (int) $pct; ?>%;"></div></div>
                                <span class="grsh-heat-pct"><?php echo (int) $pct; ?>%</span><span class="grsh-heat-frac"><?php
                                    printf(
                                        /* translators: 1: complete teams 2: total teams */
                                        esc_html__( '%1$d of %2$d teams', 'grsh' ),
                                        (int) $div['complete'],
                                        (int) $div['teams']
                                    );
                                ?></span>
                            </div>
                        <?php endforeach; ?>
                    </div>
                <?php endif; ?>
            </section>

            <!-- "Invites this season" table: the actual feature the user
                 asked for by name — "a summary of invites sent so Admin
                 don't forget." Server-rendered from the audit-log-backed
                 get_invite_summary(), so it's correct on first paint with
                 no extra fetch. Added 2026-09-01, restyled 2026-09-02:
                 avatar-initial rows and a status pill replace plain text
                 columns so a scan of the table shows exactly who needs a
                 nudge, and email/invited-date/nudge collapse into the
                 captain cell and the pill itself rather than three more
                 columns. -->
            <section class="grsh-card">
                <h2><?php esc_html_e( 'Captains this season', 'grsh' ); ?></h2>
                <table class="grsh-roster-table" id="grsh-invite-summary-table">
                    <thead>
                        <tr>
                            <th><?php esc_html_e( 'Captain', 'grsh' ); ?></th>
                            <th><?php esc_html_e( 'Team / Division', 'grsh' ); ?></th>
                            <th><?php esc_html_e( 'Status', 'grsh' ); ?></th>
                            <th><?php esc_html_e( 'Roster', 'grsh' ); ?></th>
                            <th><?php esc_html_e( 'Actions', 'grsh' ); ?></th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if ( empty( $summary['invites'] ) ) : ?>
                            <tr><td colspan="5">
                                <div class="grsh-empty-state">
                                    <strong><?php esc_html_e( 'No captains invited yet this season.', 'grsh' ); ?></strong>
                                    <?php esc_html_e( 'Fill in the form above to send the first one — it will show up here the moment it sends.', 'grsh' ); ?>
                                </div>
                            </td></tr>
                        <?php else : ?>
                            <?php foreach ( $summary['invites'] as $inv ) :
                                if ( $inv['roster_size'] >= $inv['roster_min'] ) {
                                    $state = 'done'; $label = __( 'Roster complete', 'grsh' );
                                } elseif ( $inv['password_set'] ) {
                                    $state = 'pend'; $label = __( 'Password set', 'grsh' );
                                } elseif ( $inv['nudged'] ) {
                                    $state = 'over'; $label = __( 'Nudge sent', 'grsh' );
                                } else {
                                    $state = 'inv'; $label = __( 'Invited', 'grsh' );
                                }
                                $roster_pct = $inv['roster_min'] > 0
                                    ? min( 100, (int) round( $inv['roster_size'] / $inv['roster_min'] * 100 ) )
                                    : 0;
                            ?>
                                <tr data-team-id="<?php echo (int) $inv['team_id']; ?>">
                                    <td>
                                        <div class="grsh-captain-cell">
                                            <div class="grsh-avatar" style="background:var(--grsh-<?php echo esc_attr( $state ); ?>);"><?php echo esc_html( self::initials( $inv['captain'] ) ); ?></div>
                                            <div>
                                                <span class="grsh-cap-name"><?php echo esc_html( $inv['captain'] ); ?></span>
                                                <span class="grsh-cap-email"><?php echo esc_html( $inv['email'] ); ?></span>
                                            </div>
                                        </div>
                                    </td>
                                    <td><?php echo esc_html( $inv['team'] . ' — ' . $inv['division'] ); ?></td>
                                    <td><span class="grsh-pill grsh-<?php echo esc_attr( $state ); ?>"><?php echo esc_html( $label ); ?></span></td>
                                    <td>
                                        <div class="grsh-roster-mini">
                                            <div class="grsh-heat-bar-track"><div class="grsh-heat-bar-fill" style="width:<?php echo (int) $roster_pct; ?>%;background:var(--grsh-<?php echo esc_attr( $state ); ?>);"></div></div>
                                            <span><?php echo (int) $inv['roster_size'] . '/' . (int) $inv['roster_min']; ?></span>
                                        </div>
                                    </td>
                                    <td>
                                        <div class="grsh-actions">
                                            <?php if ( ! $inv['password_set'] ) : ?>
                                                <a href="#" class="grsh-icon-btn grsh-qr-link" data-team-id="<?php echo (int) $inv['team_id']; ?>" data-name="<?php echo esc_attr( $inv['captain'] ); ?>" title="<?php esc_attr_e( 'QR / Link', 'grsh' ); ?>">
                                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h.01"/></svg>
                                                    <span class="screen-reader-text"><?php esc_html_e( 'QR / Link', 'grsh' ); ?></span>
                                                </a>
                                            <?php endif; ?>
                                            <a href="<?php echo esc_url( wp_nonce_url(
                                                    admin_url( 'admin-post.php?action=grsh_welcome_packet&team_id=' . (int) $inv['team_id'] ),
                                                    'grsh_welcome_packet_' . (int) $inv['team_id']
                                                ) ); ?>"
                                               class="grsh-icon-btn grsh-packet-link" target="_blank" rel="noopener" title="<?php esc_attr_e( 'Welcome Packet', 'grsh' ); ?>">
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
                                                <span class="screen-reader-text"><?php esc_html_e( 'Welcome Packet', 'grsh' ); ?></span>
                                            </a>
                                        </div>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </tbody>
                </table>
            </section>

            <!-- QR/link popup: added 2026-09-01 (Round 3). Rendered once,
                 reused for every row — see .grsh-qr-link click handler in
                 captain-invite-admin.js. -->
            <div id="grsh-qr-overlay">
                <div id="grsh-qr-box">
                    <h3 id="grsh-qr-title"></h3>
                    <canvas id="grsh-qr-canvas"></canvas>
                    <div class="grsh-qr-link-text" id="grsh-qr-link-text"></div>
                    <button type="button" id="grsh-qr-close" class="button"><?php esc_html_e( 'Close', 'grsh' ); ?></button>
                </div>
            </div>
        </div>
        <?php
    }

    /**
     * "M. Ortiz" -> "MO", "Cher" -> "CH". Used for the avatar-initial
     * badge in the restyled captains table (2026-09-02 visual pass).
     */
    private static function initials( string $name ): string {
        $parts = array_values( array_filter( preg_split( '/\s+/', trim( $name ) ) ) );
        if ( empty( $parts ) ) {
            return '—';
        }
        if ( 1 === count( $parts ) ) {
            return strtoupper( mb_substr( $parts[0], 0, 2 ) );
        }
        return strtoupper( mb_substr( reset( $parts ), 0, 1 ) . mb_substr( end( $parts ), 0, 1 ) );
    }

    /**
     * Finds the front-end page carrying [grsh_captain_roster], so the
     * success message can point at the real URL instead of a hardcoded
     * /roster/ guess that breaks if the page ever moves.
     */
    private static function get_roster_page_url(): string {
        global $wpdb;
        $post_id = $wpdb->get_var(
            "SELECT ID FROM {$wpdb->posts}
             WHERE post_status = 'publish' AND post_type = 'page'
             AND post_content LIKE '%[grsh_captain_roster%' LIMIT 1"
        );
        return $post_id ? get_permalink( (int) $post_id ) : home_url( '/roster/' );
    }

    /**
     * Builds the "Invites this season" table plus the flow-diagram and
     * heat-map counts, entirely from wp_grsh_audit_logs — no new table.
     * Re-reads current team/roster state for each invite (rather than
     * trusting the audit snapshot) so a renamed team or a roster that's
     * grown since the invite still shows correctly. Added 2026-09-01.
     *
     * @return array{
     *   stage_counts: array{invited:int, active:int, roster_complete:int},
     *   divisions: array<string, array{label:string, teams:int, complete:int, building:int}>,
     *   invites: array<int, array>,
     *   min_players: int
     * }
     */
    private static function get_invite_summary(): array {
        global $wpdb;
        $season_id   = self::get_season_id();
        $min_players = class_exists( 'GRSH_Scoring' ) ? GRSH_Scoring::FULL_TEAM_MIN_PLAYERS : 11;

        $rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT object_id AS team_id, after_value, created_at
             FROM {$wpdb->prefix}grsh_audit_logs
             WHERE season_id = %d AND action = 'captain_invited'
             ORDER BY created_at DESC",
            $season_id
        ), ARRAY_A ) ?: [];

        $nudged_team_ids = array_map( 'intval', (array) $wpdb->get_col( $wpdb->prepare(
            "SELECT DISTINCT object_id FROM {$wpdb->prefix}grsh_audit_logs
             WHERE season_id = %d AND action = 'captain_invite_nudged'",
            $season_id
        ) ) );

        $stage_counts   = [ 'invited' => 0, 'active' => 0, 'roster_complete' => 0 ];
        $division_stats = [];
        $active_divisions = class_exists( 'GRSH_Settings' ) ? GRSH_Settings::get_active_divisions() : [];
        foreach ( $active_divisions as $d ) {
            $division_stats[ $d['key'] ] = [
                'label' => $d['label'], 'teams' => 0, 'complete' => 0, 'building' => 0,
            ];
        }

        $invites = [];
        foreach ( $rows as $row ) {
            $team_id = (int) $row['team_id'];
            if ( ! $team_id ) {
                continue;
            }
            $team = $wpdb->get_row( $wpdb->prepare(
                "SELECT name, division FROM {$wpdb->prefix}grsh_teams WHERE id = %d", $team_id
            ), ARRAY_A );
            if ( ! $team ) {
                continue; // team was deleted since the invite
            }

            $data = json_decode( (string) $row['after_value'], true ) ?: [];
            $roster_size = (int) $wpdb->get_var( $wpdb->prepare(
                "SELECT COUNT(*) FROM {$wpdb->prefix}grsh_rosters WHERE team_id = %d", $team_id
            ) );

            $user_id      = (int) ( $data['user_id'] ?? 0 );
            $password_set = true;
            if ( $user_id ) {
                $user = get_userdata( $user_id );
                // A never-completed "set your password" flow leaves
                // user_activation_key populated; WP clears it on success.
                $password_set = $user ? ( $user->user_activation_key === '' ) : true;
            }

            $stage_counts['invited']++;
            if ( $password_set ) {
                $stage_counts['active']++;
            }
            if ( $roster_size >= $min_players ) {
                $stage_counts['roster_complete']++;
            }

            if ( isset( $division_stats[ $team['division'] ] ) ) {
                $division_stats[ $team['division'] ]['teams']++;
                if ( $roster_size >= $min_players ) {
                    $division_stats[ $team['division'] ]['complete']++;
                } else {
                    $division_stats[ $team['division'] ]['building']++;
                }
            }

            $invites[] = [
                'team_id'      => $team_id,
                'captain'      => (string) ( $data['captain_name'] ?? '—' ),
                'email'        => (string) ( $data['captain_email'] ?? '' ),
                'team'         => (string) $team['name'],
                'division'     => (string) $team['division'],
                'invited_at'   => (string) $row['created_at'],
                'password_set' => $password_set,
                'roster_size'  => $roster_size,
                'roster_min'   => $min_players,
                'nudged'       => in_array( $team_id, $nudged_team_ids, true ),
            ];
        }

        return [
            'stage_counts' => $stage_counts,
            'divisions'    => $division_stats,
            'invites'      => $invites,
            'min_players'  => $min_players,
        ];
    }

    /**
     * Fires on the 'twicedaily' cron sweep. Finds captains invited 48h+
     * ago who still haven't finished WordPress's own "set your password"
     * flow, and sends ONE plain reminder email each — never a second
     * copy, ever, for the same invite. Deliberately does NOT regenerate
     * or re-embed the password-set link itself (that's WordPress core's
     * wp_new_user_notification() reset-key flow); re-exposing or minting
     * a fresh auth link from a cron job is a bigger security surface
     * than this feature is worth, so the reminder just points the
     * captain back to their original email / the board contact instead.
     * Added 2026-09-01.
     */
    public static function run_nudge_check(): void {
        global $wpdb;
        $season_id = self::get_season_id();
        $cutoff    = gmdate( 'Y-m-d H:i:s', time() - ( 48 * HOUR_IN_SECONDS ) );

        // NOT EXISTS guards against ever nudging the same invite twice —
        // once a 'captain_invite_nudged' row exists for a team_id, that
        // team drops out of every future sweep, nudge-needed or not.
        $rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT al.object_id AS team_id, al.after_value
             FROM {$wpdb->prefix}grsh_audit_logs al
             WHERE al.season_id = %d
               AND al.action = 'captain_invited'
               AND al.created_at <= %s
               AND NOT EXISTS (
                   SELECT 1 FROM {$wpdb->prefix}grsh_audit_logs n
                   WHERE n.action = 'captain_invite_nudged' AND n.object_id = al.object_id
               )",
            $season_id,
            $cutoff
        ), ARRAY_A ) ?: [];

        foreach ( $rows as $row ) {
            $team_id = (int) $row['team_id'];
            $data    = json_decode( (string) $row['after_value'], true ) ?: [];
            $user_id = (int) ( $data['user_id'] ?? 0 );
            $email   = (string) ( $data['captain_email'] ?? '' );
            $name    = (string) ( $data['captain_name'] ?? '' );

            $user          = $user_id ? get_userdata( $user_id ) : false;
            $needs_nudge   = $user && $user->user_activation_key !== '';

            if ( $needs_nudge && $email ) {
                wp_mail(
                    $email,
                    __( 'GRSH — finish setting up your captain account', 'grsh' ),
                    sprintf(
                        /* translators: 1: captain first name or full name */
                        __(
                            "Hi %1\$s,\n\nThis is a reminder that your GRSH captain account is still waiting on you to set a password. Check your email for the \"Set your password\" message we sent when you were first invited — if you can't find it, reply to this email or contact the board and we'll help you get in.\n\nThanks,\nGRSH",
                            'grsh'
                        ),
                        $name ?: __( 'Captain', 'grsh' )
                    )
                );
            }

            // Logged either way — whether we actually emailed a reminder
            // or found the captain already finished setup on their own —
            // so this invite never enters the NOT EXISTS sweep again.
            self::log_audit(
                'captain_invite_nudged',
                'team',
                $team_id,
                null,
                [ 'emailed' => (bool) ( $needs_nudge && $email ) ],
                $needs_nudge ? 'Reminder sent — password not yet set 48h+ after invite.' : 'No nudge needed — captain had already completed setup.'
            );
        }
    }

    /**
     * Round 3 (2026-09-01) — admin-only. Regenerates the WordPress-core
     * password-reset key for a pending captain's account and returns the
     * exact same URL format wp_new_user_notification() would have
     * emailed, so it can be shown as a QR code for an in-person/rink
     * handoff. Deliberately reuses core's own reset-key mechanism instead
     * of inventing a separate, weaker link — same expiry, same
     * single-active-key behavior. Calling this again for the same
     * captain regenerates the key, which invalidates whatever was
     * previously emailed or shown; that is intentional (one valid link
     * at a time), not a bug.
     */
    public static function handle_reset_link( WP_REST_Request $request ): WP_REST_Response {
        $team_id = (int) $request->get_param( 'team_id' );
        global $wpdb;

        $row = $wpdb->get_row( $wpdb->prepare(
            "SELECT p.wp_user_id, p.first_name, p.last_name
             FROM {$wpdb->prefix}grsh_teams t
             INNER JOIN {$wpdb->prefix}grsh_players p ON p.id = t.captain_player_id
             WHERE t.id = %d",
            $team_id
        ), ARRAY_A );

        if ( ! $row || ! $row['wp_user_id'] ) {
            return new WP_REST_Response( [ 'error' => 'No captain account found for this team.' ], 404 );
        }

        $user = get_userdata( (int) $row['wp_user_id'] );
        if ( ! $user ) {
            return new WP_REST_Response( [ 'error' => 'No captain account found for this team.' ], 404 );
        }
        if ( $user->user_activation_key === '' ) {
            return new WP_REST_Response(
                [ 'error' => 'This captain already set a password — there is no pending code to show.' ],
                409
            );
        }

        $key = get_password_reset_key( $user );
        if ( is_wp_error( $key ) ) {
            return new WP_REST_Response( [ 'error' => 'Could not generate a code — try again.' ], 500 );
        }

        // Exact same URL shape as wp-includes/pluggable.php's
        // wp_new_user_notification(), so the QR/link behaves identically
        // to the emailed one.
        $link = network_site_url(
            'wp-login.php?action=rp&key=' . $key . '&login=' . rawurlencode( $user->user_login ),
            'login'
        );

        self::log_audit(
            'captain_invite_qr_generated',
            'team',
            $team_id,
            null,
            [ 'user_id' => $user->ID ],
            'Regenerated the reset-key link for an in-person/QR handoff — invalidates the previously emailed link.'
        );

        return new WP_REST_Response(
            [ 'link' => $link, 'name' => trim( $row['first_name'] . ' ' . $row['last_name'] ) ],
            200
        );
    }

    /**
     * Round 3 (2026-09-01) — sends a SEPARATE follow-up email with a
     * one-time link a captain can use, with no login, to fix a typo'd
     * name or phone number. Deliberately does not touch
     * wp_new_user_notification() or anything email/password/role related
     * — that scope was explicitly ruled out. The token itself never
     * leaves this method in plaintext except inside the emailed link;
     * only its wp_hash() is stored.
     */
    private static function send_correction_email( int $user_id, int $player_id, string $email, string $name ): void {
        if ( ! $user_id || ! $player_id || ! is_email( $email ) ) {
            return;
        }

        $raw_token = wp_generate_password( 40, false, false );
        update_user_meta( $user_id, 'grsh_correction_token_hash', wp_hash( $raw_token ) );
        update_user_meta( $user_id, 'grsh_correction_token_expires', time() + self::CORRECTION_TOKEN_TTL );
        update_user_meta( $user_id, 'grsh_correction_player_id', $player_id );

        $link = add_query_arg( [ 'token' => $raw_token ], rest_url( 'grsh/v1/captain/correction' ) );
        $days = (int) ( self::CORRECTION_TOKEN_TTL / DAY_IN_SECONDS );

        wp_mail(
            $email,
            __( 'GRSH — double check your name & phone number', 'grsh' ),
            sprintf(
                /* translators: 1: captain name, 2: correction link, 3: days until expiry */
                __(
                    "Hi %1\$s,\n\nA GRSH staff member just set up your captain account. If your name or phone number looks wrong, you can fix it yourself here — no password needed:\n\n%2\$s\n\nThis link only works once and expires in %3\$d days. It cannot change your email address or password; contact the board directly for that.\n\nThanks,\nGRSH",
                    'grsh'
                ),
                $name ?: __( 'Captain', 'grsh' ),
                $link,
                $days
            )
        );
    }

    /**
     * Looks a raw token up by its wp_hash() and returns the player record
     * to prefill, or ok=false for anything wrong with it. Deliberately
     * returns the same shape whether the token is unknown, expired, or
     * already used (its meta keys are deleted on use) — never reveals
     * which, so a stale link can't be used to probe for valid captains.
     */
    private static function verify_correction_token( string $token ): array {
        if ( $token === '' ) {
            return [ 'ok' => false ];
        }
        global $wpdb;
        $hash    = wp_hash( $token );
        $user_id = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT user_id FROM {$wpdb->usermeta} WHERE meta_key = 'grsh_correction_token_hash' AND meta_value = %s LIMIT 1",
            $hash
        ) );
        if ( ! $user_id ) {
            return [ 'ok' => false ];
        }
        $expires = (int) get_user_meta( $user_id, 'grsh_correction_token_expires', true );
        if ( ! $expires || $expires < time() ) {
            return [ 'ok' => false ];
        }
        $player_id = (int) get_user_meta( $user_id, 'grsh_correction_player_id', true );
        $player    = $player_id ? $wpdb->get_row( $wpdb->prepare(
            "SELECT first_name, last_name, phone FROM {$wpdb->prefix}grsh_players WHERE id = %d",
            $player_id
        ), ARRAY_A ) : null;
        if ( ! $player ) {
            return [ 'ok' => false ];
        }
        return [ 'ok' => true, 'user_id' => $user_id, 'player_id' => $player_id, 'player' => $player ];
    }

    /**
     * Renders the tiny public correction form as raw HTML rather than
     * JSON — same rest_pre_serve_request technique the grsh-board
     * plugin's public meeting-view route already uses, so no new WP page
     * or shortcode is needed for this to work.
     */
    public static function handle_correction_page( WP_REST_Request $request ) {
        $token = (string) $request->get_param( 'token' );
        $check = self::verify_correction_token( $token );

        add_filter( 'rest_pre_serve_request', function ( $served ) use ( $check, $token ) {
            header( 'Content-Type: text/html; charset=utf-8' );
            echo self::render_correction_html( $check, $token );
            return true;
        }, 10, 1 );

        return new WP_REST_Response( null, 200 );
    }

    private static function render_correction_html( array $check, string $token ): string {
        ob_start();
        echo '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">';
        echo '<meta name="viewport" content="width=device-width, initial-scale=1">';
        echo '<title>Update your details — GRSH</title><style>';
        echo 'body{font-family:Arial,Helvetica,sans-serif;max-width:420px;margin:40px auto;padding:0 16px;color:#1a1a2e}';
        echo 'label{display:block;margin:14px 0 4px;font-weight:bold}';
        echo 'input{width:100%;padding:8px;font-size:16px;box-sizing:border-box}';
        echo 'button{margin-top:18px;padding:10px 18px;font-size:15px;background:#1a1a2e;color:#D4A017;border:0;border-radius:4px;cursor:pointer}';
        echo '#msg{margin-top:14px;font-weight:bold}';
        echo '</style></head><body>';
        echo '<h1>Update your details</h1>';

        if ( empty( $check['ok'] ) ) {
            echo '<p>This link is invalid or has already been used. Links expire after ' . (int) ( self::CORRECTION_TOKEN_TTL / DAY_IN_SECONDS ) . ' days and only work once.</p>';
            echo '<p>Contact the board if you still need something fixed.</p>';
            echo '</body></html>';
            return (string) ob_get_clean();
        }

        $p = $check['player'];
        echo '<p>Only your name and phone number can be changed here — not your email or password.</p>';
        echo '<form id="grsh-correction-form">';
        echo '<label for="fn">First name</label><input id="fn" value="' . esc_attr( $p['first_name'] ) . '">';
        echo '<label for="ln">Last name</label><input id="ln" value="' . esc_attr( $p['last_name'] ) . '">';
        echo '<label for="ph">Phone</label><input id="ph" value="' . esc_attr( $p['phone'] ) . '" type="tel">';
        echo '<button type="submit">Save</button>';
        echo '</form><div id="msg"></div>';
        echo '<script>';
        echo 'document.getElementById("grsh-correction-form").addEventListener("submit",function(e){';
        echo 'e.preventDefault();';
        echo 'fetch(' . wp_json_encode( rest_url( 'grsh/v1/captain/correction' ) ) . ',{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({';
        echo 'token:' . wp_json_encode( $token ) . ',first_name:document.getElementById("fn").value,last_name:document.getElementById("ln").value,phone:document.getElementById("ph").value';
        echo '})}).then(function(r){return r.json().then(function(d){return {ok:r.ok,data:d};});}).then(function(res){';
        echo 'var m=document.getElementById("msg");';
        echo 'if(res.ok){m.textContent="Saved. You can close this page.";document.getElementById("grsh-correction-form").style.display="none";}';
        echo 'else{m.textContent="Error: "+(res.data.error||"could not save.");}';
        echo '});';
        echo '});';
        echo '</script></body></html>';
        return (string) ob_get_clean();
    }

    /**
     * POST target for the form in render_correction_html(). Single-use:
     * a successful save deletes the token's meta keys outright, so the
     * same link can never be replayed.
     */
    public static function handle_correction_submit( WP_REST_Request $request ): WP_REST_Response {
        $body  = (array) $request->get_json_params();
        $token = (string) ( $body['token'] ?? '' );
        $check = self::verify_correction_token( $token );
        if ( empty( $check['ok'] ) ) {
            return new WP_REST_Response( [ 'error' => 'This link is invalid or has expired.' ], 400 );
        }

        $first = sanitize_text_field( trim( (string) ( $body['first_name'] ?? '' ) ) );
        $last  = sanitize_text_field( trim( (string) ( $body['last_name'] ?? '' ) ) );
        $phone = sanitize_text_field( trim( (string) ( $body['phone'] ?? '' ) ) );

        if ( ! $first ) {
            return new WP_REST_Response( [ 'error' => 'First name is required.' ], 400 );
        }

        global $wpdb;
        $wpdb->update(
            "{$wpdb->prefix}grsh_players",
            [ 'first_name' => $first, 'last_name' => $last, 'phone' => $phone ],
            [ 'id' => $check['player_id'] ]
        );

        delete_user_meta( $check['user_id'], 'grsh_correction_token_hash' );
        delete_user_meta( $check['user_id'], 'grsh_correction_token_expires' );
        delete_user_meta( $check['user_id'], 'grsh_correction_player_id' );

        self::log_audit(
            'captain_self_correction',
            'player',
            $check['player_id'],
            $check['player'],
            [ 'first_name' => $first, 'last_name' => $last, 'phone' => $phone ],
            null
        );

        return new WP_REST_Response( [ 'ok' => true ], 200 );
    }

    /**
     * Same shape as GRSH_Team_Deposit::log_audit() / GRSH_Sync_Engine's —
     * reuses the plugin's existing generic audit table rather than
     * standing up a parallel one just for invites. Added 2026-09-01.
     */
    private static function log_audit( string $action, string $object_type, ?int $object_id, ?array $before, ?array $after, ?string $notes ): void {
        global $wpdb;
        $wpdb->insert(
            "{$wpdb->prefix}grsh_audit_logs",
            [
                'season_id'    => self::get_season_id(),
                'wp_user_id'   => get_current_user_id() ?: 0,
                'user_display' => is_user_logged_in() ? ( wp_get_current_user()->display_name ?: 'unknown' ) : 'system',
                'action'       => $action,
                'object_type'  => $object_type,
                'object_id'    => $object_id,
                'before_value' => $before ? wp_json_encode( $before ) : null,
                'after_value'  => $after ? wp_json_encode( $after ) : null,
                'notes'        => $notes,
            ]
        );
    }

    /**
     * Same pattern as GRSH_Captain_Provision::get_season_id() and
     * GRSH_Team_Deposit::get_season_id() — reads Settings, not a
     * hardcoded constant.
     */
    private static function get_season_id(): int {
        global $wpdb;
        $season_year = (int) ( GRSH_Settings::get()['season_year'] ?? 0 );
        $id = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}grsh_seasons WHERE season_year = %d LIMIT 1",
            $season_year
        ) );
        return $id ?: 1;
    }
}
