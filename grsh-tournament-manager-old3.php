<?php
/**
 * Plugin Name:       GRSH Tournament Manager
 * Plugin URI:        https://techtribeconsulting.com
 * Description:       Gold Rush Senior Hockey — Tournament Management Platform.
 *                    Player registration sync, roster management, snake draft,
 *                    auto-balance, historical tracking, and communications.
 * Version:           1.4.0
 * Requires at least: 6.4
 * Requires PHP:      8.1
 * Tested up to:      6.7
 * Author:            Tech Tribe Consulting
 * Author URI:        https://techtribeconsulting.com
 * License:           Proprietary
 * Update URI:        false
 * Text Domain:       grsh
 * Domain Path:       /languages
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// -------------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------------

define( 'GRSH_VERSION',     '1.4.0' );
define( 'GRSH_PLUGIN_FILE', __FILE__ );
define( 'GRSH_PLUGIN_DIR',  plugin_dir_path( __FILE__ ) );
define( 'GRSH_PLUGIN_URL',  plugin_dir_url( __FILE__ ) );
define( 'GRSH_PLUGIN_BASE', plugin_basename( __FILE__ ) );

// -------------------------------------------------------------------------
// Autoloader
// -------------------------------------------------------------------------

/**
 * Simple PSR-4 style autoloader for GRSH_ classes.
 *
 * Class name              → File path
 * GRSH_Database           → includes/class-grsh-database.php
 * GRSH_Field_Mapper       → includes/class-grsh-field-mapper.php
 * GRSH_Sync_Engine        → includes/class-grsh-sync-engine.php
 * GRSH_History_Import     → includes/class-grsh-history-import.php
 */
spl_autoload_register( function ( string $class ): void {
    if ( ! str_starts_with( $class, 'GRSH_' ) ) {
        return;
    }
    $filename  = 'class-' . strtolower( str_replace( '_', '-', $class ) ) . '.php';
    $file_path = GRSH_PLUGIN_DIR . 'includes/' . $filename;
    if ( file_exists( $file_path ) ) {
        require_once $file_path;
    }
} );

// -------------------------------------------------------------------------
// Activation / Deactivation / Uninstall
// -------------------------------------------------------------------------

/**
 * Plugin activation — create database tables, set defaults.
 */
function grsh_activate(): void {
    // Minimum PHP version check
    if ( version_compare( PHP_VERSION, '8.1', '<' ) ) {
        deactivate_plugins( GRSH_PLUGIN_BASE );
        wp_die(
            esc_html__(
                'GRSH Tournament Manager requires PHP 8.1 or higher.',
                'grsh'
            )
        );
    }

    // Minimum WordPress version check
    if ( version_compare( get_bloginfo( 'version' ), '6.4', '<' ) ) {
        deactivate_plugins( GRSH_PLUGIN_BASE );
        wp_die(
            esc_html__(
                'GRSH Tournament Manager requires WordPress 6.4 or higher.',
                'grsh'
            )
        );
    }

    // WPForms check — soft warning only, sync features disabled without it
    if ( ! class_exists( 'WPForms' ) ) {
        set_transient( 'grsh_wpforms_missing_notice', true, 60 );
    }

    // Create database tables
    GRSH_Database::install();

    // Create default season record for 2027
    grsh_create_default_season();

    // Register custom user roles
    grsh_register_roles();

    // Flush rewrite rules for REST API endpoints
    flush_rewrite_rules();

    // Set activation flag for admin notice
    set_transient( 'grsh_activation_notice', true, 30 );
}
register_activation_hook( GRSH_PLUGIN_FILE, 'grsh_activate' );

/**
 * Plugin deactivation — flush rewrite rules only.
 * Data is preserved — use uninstall for full removal.
 */
function grsh_deactivate(): void {
    flush_rewrite_rules();
}
register_deactivation_hook( GRSH_PLUGIN_FILE, 'grsh_deactivate' );

/**
 * Plugin uninstall — remove all data.
 * Only runs when deleted via WP admin, not on deactivation.
 */
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

/**
 * Main plugin bootstrap — runs on plugins_loaded.
 * Loads text domain, registers hooks, initialises modules.
 */
function grsh_bootstrap(): void {

    // Load translations
    load_plugin_textdomain(
        'grsh',
        false,
        dirname( GRSH_PLUGIN_BASE ) . '/languages'
    );

    // WPForms optional — show notice and skip sync hooks if not active
    if ( ! class_exists( 'WPForms' ) ) {
        add_action( 'admin_notices', 'grsh_notice_wpforms_missing' );
    } else {
        // Register sync engine hooks only when WPForms is available
        GRSH_Sync_Engine::register_hooks();
    }

    // Register history import REST API endpoints
    GRSH_History_Import::register_hooks();

    // Register admin dashboard
    if ( is_admin() ) {
        grsh_register_admin_menu();
        add_action( 'admin_notices', 'grsh_activation_notice' );
    }

    // Enqueue React admin app assets
    add_action( 'admin_enqueue_scripts', 'grsh_enqueue_admin_assets' );
}
add_action( 'plugins_loaded', 'grsh_bootstrap' );

// -------------------------------------------------------------------------
// User roles
// -------------------------------------------------------------------------

/**
 * Register custom GRSH user roles.
 */
function grsh_register_roles(): void {

    // Tournament Committee — manage rosters, drafts, players
    add_role( 'grsh_committee', __( 'GRSH Committee', 'grsh' ), [
        'read'             => true,
        'grsh_committee'   => true,
        'grsh_view_roster' => true,
        'grsh_edit_roster' => true,
        'grsh_run_draft'   => true,
        'grsh_sync_import' => true,
        'grsh_send_email'  => true,
    ] );

    // Captain — view assigned roster only
    add_role( 'grsh_captain', __( 'GRSH Captain', 'grsh' ), [
        'read'             => true,
        'grsh_view_roster' => true,
    ] );

    // Read only — reports and exports
    add_role( 'grsh_readonly', __( 'GRSH Read Only', 'grsh' ), [
        'read'             => true,
        'grsh_view_roster' => true,
    ] );

    // Grant Super Admin all GRSH capabilities
    $admin = get_role( 'administrator' );
    if ( $admin ) {
        foreach ( [
            'grsh_committee',
            'grsh_view_roster',
            'grsh_edit_roster',
            'grsh_run_draft',
            'grsh_sync_import',
            'grsh_send_email',
        ] as $cap ) {
            $admin->add_cap( $cap );
        }
    }
}

/**
 * Remove GRSH roles on uninstall.
 */
function grsh_remove_roles(): void {
    remove_role( 'grsh_committee' );
    remove_role( 'grsh_captain' );
    remove_role( 'grsh_readonly' );

    $admin = get_role( 'administrator' );
    if ( $admin ) {
        foreach ( [
            'grsh_committee', 'grsh_view_roster', 'grsh_edit_roster',
            'grsh_run_draft', 'grsh_sync_import', 'grsh_send_email',
        ] as $cap ) {
            $admin->remove_cap( $cap );
        }
    }
}

// -------------------------------------------------------------------------
// Admin menu + React app shell
// -------------------------------------------------------------------------

/**
 * Register the GRSH admin menu and submenu pages.
 * All pages render the same React app root — routing handled client-side.
 */
function grsh_register_admin_menu(): void {

    add_menu_page(
        __( 'GRSH Tournament', 'grsh' ),
        __( 'GRSH', 'grsh' ),
        'manage_options',
        'grsh-dashboard',
        'grsh_render_app_shell',
        'dashicons-awards',
        30
    );

    // Workaround: use manage_options for all pages to bypass capability
    // filtering conflicts with SportsPress/object cache. Custom GRSH caps
    // are still granted to roles and checked client-side via grshConfig.userCaps.
    $subpages = [
        'grsh-dashboard'      => [ 'label' => __( 'Dashboard',      'grsh' ), 'cap' => 'manage_options' ],
        'grsh-players'        => [ 'label' => __( 'Players',        'grsh' ), 'cap' => 'manage_options' ],
        'grsh-rosters'        => [ 'label' => __( 'Rosters',        'grsh' ), 'cap' => 'manage_options' ],
        'grsh-draft'          => [ 'label' => __( 'Draft',          'grsh' ), 'cap' => 'manage_options' ],
        'grsh-alternates'     => [ 'label' => __( 'Alternates',     'grsh' ), 'cap' => 'manage_options' ],
        'grsh-history'        => [ 'label' => __( 'History',        'grsh' ), 'cap' => 'manage_options' ],
        'grsh-reports'        => [ 'label' => __( 'Reports',        'grsh' ), 'cap' => 'manage_options' ],
        'grsh-settings'       => [ 'label' => __( 'Settings',       'grsh' ), 'cap' => 'manage_options' ],
        'grsh-history-import' => [ 'label' => __( 'Import History', 'grsh' ), 'cap' => 'manage_options' ],
    ];

    foreach ( $subpages as $slug => $page ) {
        add_submenu_page(
            'grsh-dashboard',
            $page['label'],
            $page['label'],
            $page['cap'],
            $slug,
            'grsh_render_app_shell'
        );
    }
}

/**
 * Render the React app mount point.
 * All admin pages output this — React Router handles client-side navigation.
 */
function grsh_render_app_shell(): void {
    echo '<div id="grsh-app" class="grsh-admin-root"></div>';
}

/**
 * Fix GRSH submenu URLs to use admin.php?page= format.
 * WordPress sometimes generates clean URLs for custom menu slugs,
 * which causes 404s. This forces the correct format.
 */
function grsh_fix_admin_urls(): void {
    global $submenu;
    if ( ! isset( $submenu['grsh-dashboard'] ) ) {
        return;
    }
    foreach ( $submenu['grsh-dashboard'] as &$item ) {
        $slug = $item[2];
        if ( strpos( $slug, 'grsh-' ) === 0 && strpos( $slug, 'admin.php' ) === false ) {
            $item[2] = 'admin.php?page=' . $slug;
        }
    }
}
add_action( 'admin_menu', 'grsh_fix_admin_urls', 999 );

// -------------------------------------------------------------------------
// Asset enqueue
// -------------------------------------------------------------------------

/**
 * Enqueue the React admin app (built with Vite).
 */
function grsh_enqueue_admin_assets( string $hook ): void {

    // Only load on GRSH admin pages
    if ( ! str_contains( $hook, 'grsh' ) ) {
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

    if ( file_exists( GRSH_PLUGIN_DIR . 'dist/grsh-admin.css' ) ) {
        wp_enqueue_style(
            'grsh-admin',
            GRSH_PLUGIN_URL . 'dist/grsh-admin.css',
            [],
            $asset['version']
        );
    }

    // Pass config to React app via wp_localize_script
    wp_localize_script( 'grsh-admin', 'grshConfig', [
        'apiUrl'    => esc_url_raw( rest_url( 'grsh/v1' ) ),
        'nonce'     => wp_create_nonce( 'wp_rest' ),
        'season'    => GRSH_Sync_Engine::SEASON,
        'formId'    => GRSH_Sync_Engine::FORM_ID,
        'userCaps'  => grsh_get_current_user_caps(),
        'adminUrl'  => admin_url(),
        'pluginUrl' => GRSH_PLUGIN_URL,
    ] );
}

/**
 * Return current user's GRSH capabilities for React app permission checks.
 */
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

/**
 * Insert the 2027 season record if it doesn't already exist.
 */
function grsh_create_default_season(): void {
    global $wpdb;

    $exists = $wpdb->get_var( $wpdb->prepare(
        "SELECT id FROM {$wpdb->prefix}grsh_seasons WHERE season_year = %d",
        2027
    ) );

    if ( $exists ) {
        return;
    }

    $wpdb->insert(
        "{$wpdb->prefix}grsh_seasons",
        [
            'season_year' => 2027,
            'label'       => 'Gold Rush 2027',
            'form_id'     => GRSH_Sync_Engine::FORM_ID,
            'status'      => 'open',
        ],
        [ '%d', '%s', '%d', '%s' ]
    );
}

// -------------------------------------------------------------------------
// Admin notices
// -------------------------------------------------------------------------

/**
 * Show a success notice after first activation.
 */
function grsh_activation_notice(): void {
    if ( ! get_transient( 'grsh_activation_notice' ) ) {
        return;
    }
    delete_transient( 'grsh_activation_notice' );
    ?>
    <div class="notice notice-success is-dismissible">
        <p>
            <strong><?php esc_html_e( 'GRSH Tournament Manager activated.', 'grsh' ); ?></strong>
            <?php esc_html_e( 'Database tables created. Season 2027 is ready.', 'grsh' ); ?>
            <a href="<?php echo esc_url( admin_url( 'admin.php?page=grsh-dashboard' ) ); ?>">
                <?php esc_html_e( 'Go to Dashboard →', 'grsh' ); ?>
            </a>
        </p>
    </div>
    <?php
}

/**
 * Show a warning notice if WPForms is not active.
 */
function grsh_notice_wpforms_missing(): void {
    ?>
    <div class="notice notice-error">
        <p>
            <strong><?php esc_html_e( 'GRSH Tournament Manager:', 'grsh' ); ?></strong>
            <?php esc_html_e(
                'WPForms Pro is required but not active. Player registration sync is disabled.',
                'grsh'
            ); ?>
        </p>
    </div>
    <?php
}
