<?php
/**
 * Plugin Name:       GRSH Tournament Manager
 * Plugin URI:        https://techtribeconsulting.com
 * Description:       Gold Rush Senior Hockey — Tournament Management Platform.
 *                    Player registration sync, roster management, snake draft,
 *                    auto-balance, historical tracking, and communications.
 * Version:           1.1.0
 * Requires at least: 6.4
 * Requires PHP:      8.1
 * Author:            Tech Tribe Consulting
 * Author URI:        https://techtribeconsulting.com
 * License:           Proprietary
 * Text Domain:       grsh
 * Domain Path:       /languages
 *
 * CHANGELOG v1.1.0
 * - Womens division now enabled=true in defaults → appears in Players capacity
 *   grid and Reports parity even at 0 registrations.
 * - New REST endpoint: GET /grsh/v1/players/divisions — returns all enabled
 *   divisions with registration counts, used by the Players page capacity grid.
 * - New REST endpoint: GET /grsh/v1/reports/summary — aggregated KPI card data.
 * - New REST endpoint: POST /grsh/v1/reports/board-meeting-pack — generates a
 *   downloadable board meeting pack (PDF if dompdf present, HTML fallback).
 * - GRSH_Settings::get_active_divisions() static helper added — single source
 *   of truth for "which divisions are active" used by Players and Reports.
 * - Settings save now stamps _last_saved_by and _last_saved_at for audit trail.
 * - GRSH_Reports::get_parity() seeds divisions from settings so divisions with
 *   zero teams still appear in the parity table.
 * - GRSH_Reports::get_unpaid() now returns count and total_owed at top level.
 * - GRSH_Reports::get_parity() now computes and returns action recommendation
 *   (balanced / review / rebalance) per team server-side.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( 'GRSH_VERSION',     '1.1.0' );
define( 'GRSH_PLUGIN_FILE', __FILE__ );
define( 'GRSH_PLUGIN_DIR',  plugin_dir_path( __FILE__ ) );
define( 'GRSH_PLUGIN_URL',  plugin_dir_url( __FILE__ ) );
define( 'GRSH_PLUGIN_BASE', plugin_basename( __FILE__ ) );

// -------------------------------------------------------------------------
// Explicit includes — load every class in dependency order.
// GRSH_Settings must load before GRSH_Players and GRSH_Reports because both
// call GRSH_Settings::get_active_divisions() at REST-request time.
// -------------------------------------------------------------------------

// Load players class — try both the current and legacy filename silently.
// class-grsh-players-api.php is the current name; class-grsh-players.php
// is the original name on installs that haven't been updated yet.
// class_exists guard in grsh_bootstrap() handles whichever class name the file defines.
foreach ( [ 'class-grsh-players-api.php', 'class-grsh-players.php' ] as $_grsh_players_file ) {
    $_grsh_players_path = GRSH_PLUGIN_DIR . 'includes/' . $_grsh_players_file;
    if ( file_exists( $_grsh_players_path ) ) {
        require_once $_grsh_players_path;
        break;
    }
}
unset( $_grsh_players_file, $_grsh_players_path );

$grsh_includes = [
    'class-grsh-database.php',        // DB schema + install/uninstall
    'class-grsh-settings.php',        // Settings API  ← must come before players/reports
    'class-grsh-field-mapper.php',    // WPForms field map
    'class-grsh-scoring.php',         // Draft score engine
    'class-grsh-sync-engine.php',     // WPForms sync + /sync REST routes
    'class-grsh-rosters.php',         // GET/POST/PATCH/DELETE /rosters — needed by Draft + Rosters pages
    'class-grsh-captain-roster.php',  // Front-end self-service full-team roster registration
    'class-grsh-captain-frontend.php',// Captain shortcode + asset enqueue
    'class-grsh-captain-provision.php', // Shared name+email → WP account + team (used by Invite + Signup)
    'class-grsh-captain-invite.php',  // Admin "Invite a Captain" tool
    'class-grsh-captain-signup.php',  // Public [grsh_captain_signup] self-service form
    'class-grsh-captain-sync.php',    // Tahoe Champions Cup: syncs WPForms 2273 → full_team
    'class-grsh-admin-full-teams.php',// Board view/edit/override for full-team rosters
    'class-grsh-alternates.php',      // Alternates REST routes
    'class-grsh-reports.php',         // Reports REST routes
    'class-grsh-history-import.php',  // CSV history import + all /history/* REST routes
    'class-grsh-score-sheets.php',    // Batch print-ready game score sheets, rosters auto-filled
    'class-grsh-team-deposit.php',    // Full-team $500 deposit + balance reminder (fee_total set by staff)
    'class-grsh-welcome-packet.php',  // Print-ready captain welcome packet (Invite Captain Round 3)
    'class-grsh-waiver-page.php',     // Standalone token-gated roster-player waiver signing page
];

foreach ( $grsh_includes as $grsh_file ) {
    $grsh_path = GRSH_PLUGIN_DIR . 'includes/' . $grsh_file;
    if ( file_exists( $grsh_path ) ) {
        require_once $grsh_path;
    } else {
        add_action( 'admin_notices', function() use ( $grsh_file ) {
            echo '<div class="notice notice-error"><p>'
                . '<strong>GRSH:</strong> Missing include: <code>'
                . esc_html( $grsh_file )
                . '</code> — upload it to the <code>includes/</code> folder.</p></div>';
        } );
    }
}
unset( $grsh_includes, $grsh_file, $grsh_path );

// -------------------------------------------------------------------------
// Activation / Deactivation / Uninstall
// -------------------------------------------------------------------------

function grsh_activate(): void {
    if ( version_compare( PHP_VERSION, '8.1', '<' ) ) {
        deactivate_plugins( GRSH_PLUGIN_BASE );
        wp_die( esc_html__( 'GRSH Tournament Manager requires PHP 8.1 or higher.', 'grsh' ) );
    }
    if ( version_compare( get_bloginfo( 'version' ), '6.4', '<' ) ) {
        deactivate_plugins( GRSH_PLUGIN_BASE );
        wp_die( esc_html__( 'GRSH Tournament Manager requires WordPress 6.4 or higher.', 'grsh' ) );
    }
    if ( ! class_exists( 'WPForms' ) ) {
        deactivate_plugins( GRSH_PLUGIN_BASE );
        wp_die( esc_html__( 'GRSH Tournament Manager requires WPForms Pro to be installed and active.', 'grsh' ) );
    }
    GRSH_Database::install();
    grsh_create_default_season();
    grsh_register_roles();
    flush_rewrite_rules();
    set_transient( 'grsh_activation_notice', true, 30 );
}
register_activation_hook( GRSH_PLUGIN_FILE, 'grsh_activate' );

function grsh_deactivate(): void {
    if ( class_exists( 'GRSH_Team_Deposit' ) ) {
        GRSH_Team_Deposit::unschedule();
    }
    flush_rewrite_rules();
}
register_deactivation_hook( GRSH_PLUGIN_FILE, 'grsh_deactivate' );

function grsh_uninstall(): void {
    GRSH_Database::uninstall();
    grsh_remove_roles();
    delete_option( 'grsh_settings' );
    delete_option( 'grsh_db_version' );
}
register_uninstall_hook( GRSH_PLUGIN_FILE, 'grsh_uninstall' );

// -------------------------------------------------------------------------
// Bootstrap
// -------------------------------------------------------------------------

function grsh_bootstrap(): void {
    load_plugin_textdomain( 'grsh', false, dirname( GRSH_PLUGIN_BASE ) . '/languages' );

    // Apply any pending schema upgrades before routes/queries run.
    if ( class_exists( 'GRSH_Database' ) ) {
        GRSH_Database::maybe_upgrade();
    }

    // 1.2.0: grant existing GRSH Captain accounts the new self-service
    // roster capability without requiring plugin deactivate/reactivate.
    $captain_role = get_role( 'grsh_captain' );
    if ( $captain_role && ! $captain_role->has_cap( 'grsh_manage_own_roster' ) ) {
        $captain_role->add_cap( 'grsh_manage_own_roster' );
    }

    // REST API routes register on every request (including frontend AJAX).
    // Do NOT gate behind is_admin() — React app gets 404s otherwise.
    // Each call is guarded with class_exists so a missing or misnamed file
    // shows an admin notice instead of a fatal error.
    if ( class_exists( 'GRSH_Players_API' ) )    { GRSH_Players_API::register_hooks(); }
    elseif ( class_exists( 'GRSH_Players' ) )    { GRSH_Players::register_hooks(); }
    if ( class_exists( 'GRSH_Sync_Engine' ) )    { GRSH_Sync_Engine::register_hooks(); }
    if ( class_exists( 'GRSH_Rosters' ) )        { GRSH_Rosters::register_hooks(); }
    if ( class_exists( 'GRSH_Captain_Roster' ) )   { GRSH_Captain_Roster::register_hooks(); }
    if ( class_exists( 'GRSH_Captain_Frontend' ) ) { GRSH_Captain_Frontend::register_hooks(); }
    // GRSH_Captain_Provision is a static-only helper (no hooks of its own) —
    // it just needs to be loaded before Invite/Signup call it, which the
    // $grsh_includes order above guarantees.
    if ( class_exists( 'GRSH_Captain_Invite' ) )   { GRSH_Captain_Invite::register_hooks(); }
    if ( class_exists( 'GRSH_Captain_Signup' ) )   { GRSH_Captain_Signup::register_hooks(); }
    if ( class_exists( 'GRSH_Captain_Sync' ) )     { GRSH_Captain_Sync::register_hooks(); }
    if ( class_exists( 'GRSH_Admin_Full_Teams' ) ) { GRSH_Admin_Full_Teams::register_hooks(); }
    if ( class_exists( 'GRSH_Alternates' ) )     { GRSH_Alternates::register_hooks(); }
    if ( class_exists( 'GRSH_History_Import' ) ) { GRSH_History_Import::register_hooks(); }
    if ( class_exists( 'GRSH_History_API' ) )    { GRSH_History_API::register_routes_on_init(); }
    if ( class_exists( 'GRSH_Settings' ) )       { GRSH_Settings::register_hooks(); }
    if ( class_exists( 'GRSH_Reports' ) )        { GRSH_Reports::register_hooks(); }
    if ( class_exists( 'GRSH_Score_Sheets' ) )   { GRSH_Score_Sheets::register_hooks(); }
    if ( class_exists( 'GRSH_Team_Deposit' ) )   { GRSH_Team_Deposit::register_hooks(); }
    if ( class_exists( 'GRSH_Welcome_Packet' ) ) { GRSH_Welcome_Packet::register_hooks(); }
    if ( class_exists( 'GRSH_Waiver_Page' ) )    { GRSH_Waiver_Page::register_hooks(); }

    // Admin-only: menu, notices, assets.
    add_action( 'admin_menu',            'grsh_register_admin_menu' );
    add_action( 'admin_notices',         'grsh_activation_notice' );
    add_action( 'admin_enqueue_scripts', 'grsh_enqueue_admin_assets' );

    if ( ! class_exists( 'WPForms' ) ) {
        add_action( 'admin_notices', 'grsh_notice_wpforms_missing' );
    }
}
add_action( 'plugins_loaded', 'grsh_bootstrap' );

// -------------------------------------------------------------------------
// User roles
// -------------------------------------------------------------------------

function grsh_register_roles(): void {
    add_role( 'grsh_committee', __( 'GRSH Committee', 'grsh' ), [
        'read'             => true,
        'grsh_committee'   => true,
        'grsh_view_roster' => true,
        'grsh_edit_roster' => true,
        'grsh_run_draft'   => true,
        'grsh_sync_import' => true,
        'grsh_send_email'  => true,
    ] );
    add_role( 'grsh_captain',  __( 'GRSH Captain',   'grsh' ), [ 'read' => true, 'grsh_view_roster' => true, 'grsh_manage_own_roster' => true ] );
    add_role( 'grsh_readonly', __( 'GRSH Read Only', 'grsh' ), [ 'read' => true, 'grsh_view_roster' => true ] );

    $admin = get_role( 'administrator' );
    if ( $admin ) {
        foreach ( [ 'grsh_committee','grsh_view_roster','grsh_edit_roster','grsh_run_draft','grsh_sync_import','grsh_send_email' ] as $cap ) {
            $admin->add_cap( $cap );
        }
    }
}

function grsh_remove_roles(): void {
    remove_role( 'grsh_committee' );
    remove_role( 'grsh_captain' );
    remove_role( 'grsh_readonly' );
    $admin = get_role( 'administrator' );
    if ( $admin ) {
        foreach ( [ 'grsh_committee','grsh_view_roster','grsh_edit_roster','grsh_run_draft','grsh_sync_import','grsh_send_email' ] as $cap ) {
            $admin->remove_cap( $cap );
        }
    }
}

// -------------------------------------------------------------------------
// Admin menu
// -------------------------------------------------------------------------

function grsh_register_admin_menu(): void {
    add_menu_page(
        __( 'GRSH Tournament', 'grsh' ),
        __( 'GRSH', 'grsh' ),
        'manage_options',
        'grsh-tm-dashboard',
        'grsh_render_app_shell',
        'dashicons-awards',
        30
    );

    $subpages = [
        'grsh-tm-dashboard'      => __( 'Dashboard',      'grsh' ),
        'grsh-tm-players'        => __( 'Players',        'grsh' ),
        'grsh-tm-rosters'        => __( 'Rosters',        'grsh' ),
        'grsh-tm-full-teams'     => __( 'Full Team Rosters', 'grsh' ),
        'grsh-tm-draft'          => __( 'Draft',          'grsh' ),
        'grsh-tm-alternates'     => __( 'Alternates',     'grsh' ),
        'grsh-tm-history'        => __( 'History',        'grsh' ),
        'grsh-tm-reports'        => __( 'Reports',        'grsh' ),
        'grsh-tm-settings'       => __( 'Settings',       'grsh' ),
        'grsh-tm-history-import' => __( 'Import History', 'grsh' ),
    ];

    foreach ( $subpages as $slug => $label ) {
        add_submenu_page(
            'grsh-tm-dashboard',
            $label,
            $label,
            'manage_options',
            $slug,
            'grsh_render_app_shell'
        );
    }
}

function grsh_render_app_shell(): void {
    echo '<div id="grsh-app" class="grsh-admin-root"></div>';
}

// -------------------------------------------------------------------------
// Asset enqueue
// -------------------------------------------------------------------------

function grsh_enqueue_admin_assets( string $hook ): void {
    if ( ! str_contains( $hook, 'grsh-tm' ) ) {
        return;
    }

    $asset_file = GRSH_PLUGIN_DIR . 'dist/grsh-admin.asset.php';
    $asset      = file_exists( $asset_file )
        ? require $asset_file
        : [ 'dependencies' => [], 'version' => GRSH_VERSION ];

    wp_enqueue_script(
        'grsh-admin',
        GRSH_PLUGIN_URL . 'dist/grsh-admin.js',
        $asset['dependencies'],
        $asset['version'],
        true
    );

    wp_enqueue_style(
        'grsh-admin',
        GRSH_PLUGIN_URL . 'dist/grsh-admin.css',
        [],
        $asset['version']
    );

    wp_localize_script( 'grsh-admin', 'grshConfig', [
        'apiUrl'    => esc_url_raw( rest_url( 'grsh/v1' ) ),
        'nonce'     => wp_create_nonce( 'wp_rest' ),
        'season'    => GRSH_Sync_Engine::SEASON,
        'formId'    => GRSH_Sync_Engine::FORM_ID,
        'userCaps'  => grsh_get_current_user_caps(),
        'adminUrl'  => admin_url(),
        'pluginUrl' => GRSH_PLUGIN_URL,
        'version'   => GRSH_VERSION,
    ] );
}

function grsh_get_current_user_caps(): array {
    return [
        'committee'   => current_user_can( 'grsh_committee' ),
        'edit_roster' => current_user_can( 'grsh_edit_roster' ),
        'run_draft'   => current_user_can( 'grsh_run_draft' ),
        'sync_import' => current_user_can( 'grsh_sync_import' ),
        'send_email'  => current_user_can( 'grsh_send_email' ),
        'view_roster' => current_user_can( 'grsh_view_roster' ),
        'super_admin' => current_user_can( 'manage_options' ),
    ];
}

// -------------------------------------------------------------------------
// Default season setup
// -------------------------------------------------------------------------

function grsh_create_default_season(): void {
    global $wpdb;
    $exists = $wpdb->get_var( $wpdb->prepare(
        "SELECT id FROM {$wpdb->prefix}grsh_seasons WHERE season_year = %d", 2027
    ) );
    if ( $exists ) return;
    $wpdb->insert(
        "{$wpdb->prefix}grsh_seasons",
        [ 'season_year' => 2027, 'label' => 'Gold Rush 2027', 'form_id' => GRSH_Sync_Engine::FORM_ID, 'status' => 'open' ],
        [ '%d', '%s', '%d', '%s' ]
    );
}

// -------------------------------------------------------------------------
// Admin notices
// -------------------------------------------------------------------------

function grsh_activation_notice(): void {
    if ( ! get_transient( 'grsh_activation_notice' ) ) return;
    delete_transient( 'grsh_activation_notice' );
    ?>
    <div class="notice notice-success is-dismissible">
        <p>
            <strong><?php esc_html_e( 'GRSH Tournament Manager v1.1.0 activated.', 'grsh' ); ?></strong>
            <?php esc_html_e( 'Database tables created. Season 2027 is ready.', 'grsh' ); ?>
            <a href="<?php echo esc_url( admin_url( 'admin.php?page=grsh-tm-dashboard' ) ); ?>">
                <?php esc_html_e( 'Go to Dashboard →', 'grsh' ); ?>
            </a>
        </p>
    </div>
    <?php
}

function grsh_notice_wpforms_missing(): void {
    ?>
    <div class="notice notice-error">
        <p>
            <strong><?php esc_html_e( 'GRSH Tournament Manager:', 'grsh' ); ?></strong>
            <?php esc_html_e( 'WPForms Pro is required but not active. Player registration sync is disabled.', 'grsh' ); ?>
        </p>
    </div>
    <?php
}
