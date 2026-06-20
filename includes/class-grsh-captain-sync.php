<?php
/**
 * GRSH Captain Sync - Tahoe Champions Cup
 *
 * Syncs the Team Captain Registration WPForms entries (Form ID 2273) into
 * the plugin's own wp_grsh_teams / wp_grsh_players tables, so a captain's
 * existing registration becomes a "full_team" the captain-roster module
 * already knows how to manage. Deliberately syncs ONLY team + captain
 * identity (team name, division, captain name/email/phone) - not jersey
 * colours, logo, or assistant captain, since those don't map to any
 * roster-validated field. The captain adds every actual roster player
 * (including themselves and any assistant) through the existing
 * [grsh_captain_roster] front-end, which already collects position,
 * skill tier, and jersey number correctly.
 *
 * Two entry points, same pattern as GRSH_Sync_Engine:
 *   1. Automatic - fires on wpforms_process_complete for FORM_ID
 *   2. Manual    - "Sync Now" button on a small admin page, for backfilling
 *                  entries submitted before this sync existed and for
 *                  safely re-running if a registration is edited.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class GRSH_Captain_Sync {

    const FORM_ID = 2273;

    // WPForms field IDs on the Tahoe Champions Cup registration form.
    const FIELD_CAPTAIN_NAME  = '1';
    const FIELD_CAPTAIN_EMAIL = '2';
    const FIELD_CAPTAIN_PHONE = '3';
    const FIELD_TEAM_NAME     = '6';
    const FIELD_DIVISION      = '19';

    public static function register_hooks(): void {
        add_action( 'wpforms_process_complete', [ __CLASS__, 'on_form_submit' ], 10, 4 );
        // Priority 20: must fire AFTER grsh_register_admin_menu() (default
        // priority 10) creates the 'grsh-tm-dashboard' parent menu, or
        // add_submenu_page() computes a page hook that doesn't match what
        // WordPress looks up later — producing a malformed sidebar link
        // and "Sorry, you are not allowed to access this page" even for
        // an Administrator account.
        add_action( 'admin_menu', [ __CLASS__, 'register_admin_page' ], 20 );
        add_action( 'rest_api_init', [ __CLASS__, 'register_routes' ] );
    }

    // -------------------------------------------------------------------------
    // Automatic - real-time sync on form submit
    // -------------------------------------------------------------------------

    public static function on_form_submit( array $fields, array $entry, array $form_data, int $entry_id ): void {
        if ( (int) $form_data['id'] !== self::FORM_ID ) {
            return;
        }
        self::sync_one_entry( $fields );
    }

    // -------------------------------------------------------------------------
    // Manual - admin page with a "Sync Now" button for backfill / re-runs
    // -------------------------------------------------------------------------

    public static function register_admin_page(): void {
        add_submenu_page(
            'grsh-tm-dashboard',
            __( 'Captain Sync', 'grsh' ),
            __( 'Captain Sync', 'grsh' ),
            'manage_options',
            'grsh-captain-sync',
            [ __CLASS__, 'render_admin_page' ]
        );
    }

    public static function register_routes(): void {
        register_rest_route( 'grsh/v1', '/admin/captain-sync/run', [
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => [ __CLASS__, 'run_backfill' ],
            'permission_callback' => fn() => current_user_can( 'manage_options' ),
        ] );
    }

    public static function render_admin_page(): void {
        if ( ! current_user_can( 'manage_options' ) ) {
            wp_die( 'Not allowed.' );
        }

        wp_enqueue_script(
            'grsh-captain-sync-admin',
            GRSH_PLUGIN_URL . 'assets/captain-sync-admin.js',
            [],
            GRSH_VERSION,
            true
        );
        wp_localize_script( 'grsh-captain-sync-admin', 'grshCaptainSyncConfig', [
            'url'   => esc_url_raw( rest_url( 'grsh/v1/admin/captain-sync/run' ) ),
            'nonce' => wp_create_nonce( 'wp_rest' ),
        ] );

        echo '<div class="wrap">';
        echo '<h1>' . esc_html__( 'Captain Sync', 'grsh' ) . '</h1>';
        echo '<p>' . esc_html__( 'Pulls every Team Captain Registration entry (Form ID 2273) and creates or updates the matching team and captain record. Safe to run more than once - existing teams are updated, not duplicated.', 'grsh' ) . '</p>';
        echo '<button type="button" id="grsh-sync-run" class="button button-primary">' . esc_html__( 'Sync Now', 'grsh' ) . '</button>';
        echo '<pre id="grsh-sync-output" style="margin-top:1em;background:#fff;padding:1em;border:1px solid #ccd0d4;white-space:pre-wrap;"></pre>';
        echo '</div>';
    }

    public static function run_backfill(): WP_REST_Response {
        global $wpdb;
        $table = $wpdb->prefix . 'wpforms_entries';
        $rows  = $wpdb->get_results( $wpdb->prepare(
            "SELECT entry_id, fields FROM {$table} WHERE form_id = %d ORDER BY entry_id ASC",
            self::FORM_ID
        ), ARRAY_A ) ?: [];

        $results = [ 'processed' => 0, 'created' => 0, 'updated' => 0, 'errors' => [] ];

        foreach ( $rows as $row ) {
            $fields = json_decode( $row['fields'], true );
            if ( ! is_array( $fields ) ) {
                $results['errors'][] = "Entry {$row['entry_id']}: could not decode fields.";
                continue;
            }
            $outcome = self::sync_one_entry( $fields );
            $results['processed']++;
            if ( isset( $outcome['error'] ) ) {
                $results['errors'][] = "Entry {$row['entry_id']}: {$outcome['error']}";
            } elseif ( $outcome['action'] === 'created' ) {
                $results['created']++;
            } else {
                $results['updated']++;
            }
        }

        return new WP_REST_Response( $results, 200 );
    }

    // -------------------------------------------------------------------------
    // Core sync logic - shared by both entry points
    // -------------------------------------------------------------------------

    private static function sync_one_entry( array $fields ): array {
        $captain_email = sanitize_email( (string) self::field_value( $fields, self::FIELD_CAPTAIN_EMAIL ) );
        if ( ! is_email( $captain_email ) ) {
            return [ 'error' => 'Missing or invalid captain email - skipped.' ];
        }

        $captain_name_raw = trim( (string) self::field_value( $fields, self::FIELD_CAPTAIN_NAME ) );
        $name_parts        = explode( ' ', $captain_name_raw, 2 );
        $first_name        = sanitize_text_field( $name_parts[0] ?? '' );
        $last_name         = sanitize_text_field( $name_parts[1] ?? '' );

        $captain_phone = sanitize_text_field( (string) self::field_value( $fields, self::FIELD_CAPTAIN_PHONE ) );
        $team_name     = sanitize_text_field( (string) self::field_value( $fields, self::FIELD_TEAM_NAME ) );
        $division      = self::transform_division( (string) self::field_value( $fields, self::FIELD_DIVISION ) );

        if ( ! $team_name ) {
            return [ 'error' => 'Missing team name - skipped.' ];
        }

        $season_id   = self::get_season_id();
        $player_id   = self::find_or_create_captain_player( $captain_email, $first_name, $last_name, $captain_phone );
        $team_result = self::find_or_create_team( $season_id, $player_id, $team_name, $division );

        return [
            'action'  => $team_result['action'],
            'team_id' => $team_result['team_id'],
            'captain' => $captain_email,
        ];
    }

    private static function field_value( array $fields, string $field_id ) {
        return $fields[ $field_id ]['value'] ?? null;
    }

    private static function transform_division( string $raw ): string {
        $raw = trim( $raw );
        $map = [
            '40+' => '40_plus',
            '45+' => '45_plus',
            '50+' => '50_plus',
        ];
        return $map[ $raw ] ?? sanitize_key( $raw );
    }

    private static function get_season_id(): int {
        global $wpdb;
        $season_year = (int) ( GRSH_Settings::get()['season_year'] ?? 0 );
        $id = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}grsh_seasons WHERE season_year = %d LIMIT 1",
            $season_year
        ) );
        return $id ?: 1;
    }

    private static function find_or_create_captain_player( string $email, string $first_name, string $last_name, string $phone ): int {
        global $wpdb;
        $player_id = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}grsh_players WHERE email = %s", $email
        ) );

        if ( $player_id ) {
            $wpdb->update( "{$wpdb->prefix}grsh_players", [
                'first_name' => $first_name,
                'last_name'  => $last_name,
                'phone'      => $phone,
            ], [ 'id' => $player_id ] );
            return $player_id;
        }

        $wpdb->insert( "{$wpdb->prefix}grsh_players", [
            'first_name' => $first_name,
            'last_name'  => $last_name,
            'email'      => $email,
            'phone'      => $phone,
        ] );
        return (int) $wpdb->insert_id;
    }

    private static function find_or_create_team( int $season_id, int $captain_player_id, string $team_name, string $division ): array {
        global $wpdb;
        $team_id = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}grsh_teams
             WHERE season_id = %d AND team_type = 'full_team' AND captain_player_id = %d LIMIT 1",
            $season_id, $captain_player_id
        ) );

        if ( $team_id ) {
            $wpdb->update( "{$wpdb->prefix}grsh_teams", [
                'name'     => $team_name,
                'division' => $division,
            ], [ 'id' => $team_id ] );
            return [ 'action' => 'updated', 'team_id' => $team_id ];
        }

        $wpdb->insert( "{$wpdb->prefix}grsh_teams", [
            'season_id'         => $season_id,
            'division'          => $division,
            'team_type'         => 'full_team',
            'name'              => $team_name,
            'colour'            => '#666666',
            'captain_player_id' => $captain_player_id,
            'draft_locked'      => 0,
        ] );
        return [ 'action' => 'created', 'team_id' => (int) $wpdb->insert_id ];
    }
}
