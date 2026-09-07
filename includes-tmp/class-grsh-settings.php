<?php
/**
 * GRSH Settings — REST API endpoints for plugin configuration.
 *
 * GET  /wp-json/grsh/v1/settings  → return current settings
 * POST /wp-json/grsh/v1/settings  → save settings, update season row
 *
 * Settings are stored in wp_options under the key 'grsh_settings'.
 * The season_year, label, form_id, and status fields are also synced
 * to wp_grsh_seasons so the rest of the plugin stays consistent.
 *
 * CHANGELOG v1.1.0
 * - Womens division: enabled=true by default so it appears in the admin
 *   dashboard and player filters even when 0 players are registered.
 *   The previous enabled=false caused it to be invisible on the Players
 *   and Reports pages regardless of save state.
 * - Added audit_log_last_save: tracks who saved settings and when.
 * - Added get_active_divisions() static helper used by Reports and Players
 *   classes to build their division lists without duplicating the filter logic.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class GRSH_Settings {

    const OPTION_KEY = 'grsh_settings';

    /**
     * Register REST routes. Call from plugins_loaded or init.
     */
    public static function register_hooks(): void {
        add_action( 'rest_api_init', [ __CLASS__, 'register_routes' ] );
    }

    /**
     * Register the GET and POST routes.
     */
    public static function register_routes(): void {
        register_rest_route( 'grsh/v1', '/settings', [
            [
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => [ __CLASS__, 'get_settings' ],
                'permission_callback' => [ __CLASS__, 'check_permission' ],
            ],
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [ __CLASS__, 'save_settings' ],
                'permission_callback' => [ __CLASS__, 'check_permission' ],
            ],
        ] );
    }

    /**
     * Only administrators (manage_options) may read or write settings.
     */
    public static function check_permission(): bool {
        return current_user_can( 'manage_options' );
    }

    /**
     * GET /grsh/v1/settings
     * Returns merged defaults + saved options.
     */
    public static function get_settings( WP_REST_Request $request ): WP_REST_Response {
        return new WP_REST_Response( self::get(), 200 );
    }

    /**
     * POST /grsh/v1/settings
     * Validates and saves the incoming JSON body.
     */
    public static function save_settings( WP_REST_Request $request ): WP_REST_Response {
        $body = $request->get_json_params();

        if ( empty( $body ) || ! is_array( $body ) ) {
            return new WP_REST_Response(
                [ 'error' => 'Invalid request body — expected JSON object.' ],
                400
            );
        }

        $sanitized = self::sanitize( $body );

        // Stamp the save with current user + time for the audit trail.
        $sanitized['_last_saved_by'] = get_current_user_id();
        $sanitized['_last_saved_at'] = current_time( 'mysql' );

        update_option( self::OPTION_KEY, $sanitized, false );

        // Sync season fields to wp_grsh_seasons table.
        self::sync_season( $sanitized );

        return new WP_REST_Response( [ 'saved' => true, 'settings' => $sanitized ], 200 );
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /**
     * Return the current saved settings, merged over defaults.
     */
    public static function get(): array {
        $saved    = get_option( self::OPTION_KEY, [] );
        $defaults = self::defaults();

        if ( ! is_array( $saved ) ) {
            $saved = [];
        }

        // Merge top-level scalar fields.
        $merged = array_merge( $defaults, $saved );

        // Divisions: if the user has saved divisions, use those; otherwise use defaults.
        // We intentionally do NOT deep-merge — the saved array is the source of truth
        // once it exists, so new defaults don't silently overwrite user config.
        if ( ! empty( $saved['divisions'] ) && is_array( $saved['divisions'] ) ) {
            $merged['divisions'] = $saved['divisions'];
        }

        return $merged;
    }

    /**
     * Return only divisions where enabled === true.
     * Used by Players and Reports endpoints to build consistent division lists
     * without duplicating the filter logic.
     *
     * FIX: Previously the dashboard rendered division capacity cards by querying
     * registrations and grouping by division_requested — divisions with 0
     * registrations simply never appeared. Now callers use this helper to get
     * the authoritative division list from settings, and show 0/capacity for
     * any division with no registrations yet (including Womens).
     */
    public static function get_active_divisions(): array {
        $settings  = self::get();
        $divisions = $settings['divisions'] ?? [];

        return array_values(
            array_filter( $divisions, fn( $d ) => ! empty( $d['enabled'] ) )
        );
    }

    /**
     * Sanitize the incoming settings payload field by field.
     * Unknown keys are dropped.
     */
    private static function sanitize( array $raw ): array {
        $out = [];

        // Season
        $out['season_year']          = isset( $raw['season_year'] )          ? absint( $raw['season_year'] )                     : 2027;
        $out['season_label']         = isset( $raw['season_label'] )         ? sanitize_text_field( $raw['season_label'] )       : 'Gold Rush 2027';
        $out['form_id']              = isset( $raw['form_id'] )              ? absint( $raw['form_id'] )                         : 5047;
        $out['status']               = isset( $raw['status'] )               ? sanitize_key( $raw['status'] )                    : 'open';
        $out['registration_opens']   = isset( $raw['registration_opens'] )   ? sanitize_text_field( $raw['registration_opens'] ) : '';
        $out['registration_closes']  = isset( $raw['registration_closes'] )  ? sanitize_text_field( $raw['registration_closes'] ): '';
        $out['draft_date']           = isset( $raw['draft_date'] )           ? sanitize_text_field( $raw['draft_date'] )         : '';

        // Draft
        $out['timer_enabled']        = ! empty( $raw['timer_enabled'] );
        $out['timer_seconds']        = isset( $raw['timer_seconds'] )        ? absint( $raw['timer_seconds'] )                   : 90;

        // Email toggles
        $out['email_registration']   = ! empty( $raw['email_registration'] );
        $out['email_roster']         = ! empty( $raw['email_roster'] );
        $out['email_payment']        = ! empty( $raw['email_payment'] );
        $out['email_alternate']      = ! empty( $raw['email_alternate'] );
        $out['email_team_balance']   = ! empty( $raw['email_team_balance'] );
        $out['email_team_deposit_nudge'] = ! empty( $raw['email_team_deposit_nudge'] );

        // Team deposit / balance (added 1.3.0). 1.4.0: board locked the 2027
        // fee model — every full team gets the same early/late tiered total,
        // decided automatically by class-grsh-team-deposit.php from when the
        // deposit is paid vs team_fee_early_cutoff_date. No staff action
        // needed for the normal case; the PATCH /teams/{id}/fee route still
        // exists as a manual override for real exceptions only.
        $out['team_deposit_amount']          = isset( $raw['team_deposit_amount'] )          ? (float) $raw['team_deposit_amount']          : 500.00;
        $out['team_fee_early_amount']        = isset( $raw['team_fee_early_amount'] )        ? (float) $raw['team_fee_early_amount']        : 1750.00;
        $out['team_fee_late_amount']         = isset( $raw['team_fee_late_amount'] )         ? (float) $raw['team_fee_late_amount']         : 2000.00;
        $out['team_fee_early_cutoff_date']   = isset( $raw['team_fee_early_cutoff_date'] )   ? sanitize_text_field( $raw['team_fee_early_cutoff_date'] ) : '2027-01-06';
        $out['team_balance_due_date']        = isset( $raw['team_balance_due_date'] )        ? sanitize_text_field( $raw['team_balance_due_date'] )      : '2027-03-08';
        $out['team_deposit_nudge_days']      = isset( $raw['team_deposit_nudge_days'] )      ? absint( $raw['team_deposit_nudge_days'] )    : 10;
        $out['team_balance_reminder_days']   = isset( $raw['team_balance_reminder_days'] )    ? absint( $raw['team_balance_reminder_days'] ) : 14;

        // Access
        $out['public_rosters']        = ! empty( $raw['public_rosters'] );
        $out['sandbagging_auto_flag'] = ! empty( $raw['sandbagging_auto_flag'] );

        // Divisions array
        $out['divisions'] = [];
        if ( ! empty( $raw['divisions'] ) && is_array( $raw['divisions'] ) ) {
            foreach ( $raw['divisions'] as $div ) {
                if ( ! is_array( $div ) ) {
                    continue;
                }
                $out['divisions'][] = [
                    'key'        => sanitize_key( $div['key']        ?? '' ),
                    'label'      => sanitize_text_field( $div['label'] ?? '' ),
                    'enabled'    => ! empty( $div['enabled'] ),
                    'teams'      => absint( $div['teams']      ?? 2 ),
                    'min_roster' => absint( $div['min_roster'] ?? 6 ),
                    'max_roster' => absint( $div['max_roster'] ?? 12 ),
                    'goalie_min' => absint( $div['goalie_min'] ?? 1 ),
                    'goalie_max' => absint( $div['goalie_max'] ?? 2 ),
                ];
            }
        }

        return $out;
    }

    /**
     * Sync saved settings back to the wp_grsh_seasons table row.
     */
    private static function sync_season( array $settings ): void {
        global $wpdb;

        $table = $wpdb->prefix . 'grsh_seasons';

        $exists = $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$table} WHERE season_year = %d",
            $settings['season_year']
        ) );

        $data   = [
            'label'   => $settings['season_label'],
            'form_id' => $settings['form_id'],
            'status'  => $settings['status'],
        ];
        $format = [ '%s', '%d', '%s' ];

        if ( $exists ) {
            $wpdb->update(
                $table,
                $data,
                [ 'season_year' => $settings['season_year'] ],
                $format,
                [ '%d' ]
            );
        } else {
            $wpdb->insert(
                $table,
                array_merge( [ 'season_year' => $settings['season_year'] ], $data ),
                array_merge( [ '%d' ], $format )
            );
        }
    }

    /**
     * Default settings.
     *
     * KEY CHANGE: womens.enabled is now TRUE so it surfaces in every division
     * list, capacity grid, and filter bar from day one — even at 0 registrations.
     * Previously enabled=false caused it to be silently excluded from all
     * foreach loops that call get_active_divisions().
     *
     * Must stay in sync with DEFAULT_SETTINGS in Settings.jsx.
     */
    private static function defaults(): array {
        return [
            'season_year'          => 2027,
            'season_label'         => 'Gold Rush 2027',
            'form_id'              => 5047,
            'status'               => 'open',
            'registration_opens'   => '2026-12-01',
            'registration_closes'  => '2027-02-28',
            'draft_date'           => '2027-03-15',
            'timer_enabled'        => true,
            'timer_seconds'        => 90,
            'divisions'            => [
                [ 'key' => 'gold_open', 'label' => 'Gold Open', 'enabled' => true,  'teams' => 4, 'min_roster' => 8,  'max_roster' => 12, 'goalie_min' => 1, 'goalie_max' => 2 ],
                [ 'key' => '45a',       'label' => '45A',       'enabled' => true,  'teams' => 3, 'min_roster' => 7,  'max_roster' => 11, 'goalie_min' => 1, 'goalie_max' => 2 ],
                [ 'key' => 'senior_b',  'label' => 'Senior B',  'enabled' => true,  'teams' => 3, 'min_roster' => 7,  'max_roster' => 11, 'goalie_min' => 1, 'goalie_max' => 2 ],
                [ 'key' => 'senior_c',  'label' => 'Senior C',  'enabled' => true,  'teams' => 2, 'min_roster' => 8,  'max_roster' => 12, 'goalie_min' => 1, 'goalie_max' => 2 ],
                // FIX: enabled changed from false → true.
                // Womens now appears in the Players capacity grid, division filter tabs,
                // and Reports parity section even when 0 players are registered.
                [ 'key' => 'womens',    'label' => 'Womens',    'enabled' => true,  'teams' => 2, 'min_roster' => 8,  'max_roster' => 12, 'goalie_min' => 1, 'goalie_max' => 2 ],
            ],
            'email_registration'    => true,
            'email_roster'          => true,
            'email_payment'         => true,
            'email_alternate'       => true,
            'email_team_balance'    => true,
            'email_team_deposit_nudge' => true,
            // Team deposit / balance — see sanitize() for the 1.4.0 locked
            // fee model (early/late tiers decided by deposit timing).
            'team_deposit_amount'          => 500.00,
            'team_fee_early_amount'        => 1750.00,
            'team_fee_late_amount'         => 2000.00,
            'team_fee_early_cutoff_date'   => '2027-01-06',
            'team_balance_due_date'        => '2027-03-08',
            'team_deposit_nudge_days'      => 10,
            'team_balance_reminder_days'   => 14,
            'public_rosters'        => false,
            'sandbagging_auto_flag' => true,
            '_last_saved_by'        => 0,
            '_last_saved_at'        => '',
        ];
    }
}
