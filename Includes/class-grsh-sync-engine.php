<?php
/**
 * Gold Rush Senior Hockey — Sync Engine
 * Plugin: GRSH Tournament Manager
 * Developer: Tech Tribe Consulting
 *
 * Listens for WPForms submissions and imports entries
 * into the GRSH custom database tables.
 *
 * Two entry points:
 *   1. Automatic — fires on wpforms_process_complete hook
 *   2. Manual    — called via REST API from React admin dashboard
 *
 * Dependencies:
 *   - GRSH_Field_Mapper  (class-grsh-field-mapper.php)
 *   - GRSH_Database      (class-grsh-database.php)
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class GRSH_Sync_Engine {

    const FORM_ID  = 5047;
    const SEASON   = 2027;

    private GRSH_Field_Mapper $mapper;

    public function __construct() {
        $this->mapper = new GRSH_Field_Mapper();
    }

    // -------------------------------------------------------------------------
    // Hook registration
    // -------------------------------------------------------------------------

    /**
     * Register WordPress hooks.
     * Called once from the plugin bootstrap file.
     */
    public static function register_hooks(): void {
        $engine = new self();

        // Automatic sync — fires immediately after form submission
        add_action(
            'wpforms_process_complete',
            [ $engine, 'on_form_submit' ],
            10,
            4
        );

        // REST API endpoint — manual import button in React dashboard
        add_action( 'rest_api_init', [ $engine, 'register_rest_routes' ] );
    }

    // -------------------------------------------------------------------------
    // Entry point 1 — automatic on form submit
    // -------------------------------------------------------------------------

    /**
     * Fires on wpforms_process_complete.
     *
     * @param array  $fields     Sanitised field values.
     * @param array  $entry      Raw entry data.
     * @param array  $form_data  Form settings.
     * @param int    $entry_id   WPForms entry ID.
     */
    public function on_form_submit(
        array $fields,
        array $entry,
        array $form_data,
        int   $entry_id
    ): void {

        // Only process our registration form
        if ( (int) $form_data['id'] !== self::FORM_ID ) {
            return;
        }

        // Check not already imported
        if ( $this->entry_already_imported( $entry_id ) ) {
            $this->log_audit(
                'sync_skipped',
                'registration',
                null,
                null,
                null,
                "WPForms entry {$entry_id} already imported — skipped."
            );
            return;
        }

        $wpforms_entry = $this->build_entry_array( $fields, $entry_id );
        $result        = $this->process_entry( $wpforms_entry, $entry_id );

        if ( ! empty( $result['errors'] ) ) {
            $this->log_sync_failure( $entry_id, $result['errors'] );
        }
    }

    // -------------------------------------------------------------------------
    // Entry point 2 — manual REST API import
    // -------------------------------------------------------------------------

    /**
     * Register REST routes for the React admin dashboard.
     */
    public function register_rest_routes(): void {

        // POST /wp-json/grsh/v1/sync — import all unsynced entries
        register_rest_route( 'grsh/v1', '/sync', [
            'methods'             => 'POST',
            'callback'            => [ $this, 'rest_sync_all' ],
            'permission_callback' => [ $this, 'rest_permission_check' ],
        ] );

        // POST /wp-json/grsh/v1/sync/{entry_id} — import single entry
        register_rest_route( 'grsh/v1', '/sync/(?P<entry_id>\d+)', [
            'methods'             => 'POST',
            'callback'            => [ $this, 'rest_sync_single' ],
            'permission_callback' => [ $this, 'rest_permission_check' ],
            'args'                => [
                'entry_id' => [
                    'validate_callback' => fn( $v ) => is_numeric( $v ),
                    'sanitize_callback' => 'absint',
                ],
            ],
        ] );

        // GET /wp-json/grsh/v1/sync/status — import stats for dashboard
        register_rest_route( 'grsh/v1', '/sync/status', [
            'methods'             => 'GET',
            'callback'            => [ $this, 'rest_sync_status' ],
            'permission_callback' => [ $this, 'rest_permission_check' ],
        ] );
    }

    /**
     * Only Tournament Committee and Super Admin can trigger imports.
     */
    public function rest_permission_check(): bool {
        return current_user_can( 'manage_options' )
            || current_user_can( 'grsh_committee' );
    }

    /**
     * Import all WPForms entries not yet synced.
     */
    public function rest_sync_all( WP_REST_Request $request ): WP_REST_Response {

        $entries = $this->get_unsynced_wpforms_entries();

        if ( empty( $entries ) ) {
            return new WP_REST_Response( [
                'success' => true,
                'message' => 'No new entries to import.',
                'imported' => 0,
                'skipped'  => 0,
                'errors'   => [],
            ], 200 );
        }

        $imported = 0;
        $skipped  = 0;
        $errors   = [];

        foreach ( $entries as $entry ) {
            $entry_id      = (int) $entry->entry_id;
            $wpforms_entry = $this->build_entry_array_from_db( $entry );
            $result        = $this->process_entry( $wpforms_entry, $entry_id );

            if ( empty( $result['errors'] ) ) {
                $imported++;
            } else {
                $skipped++;
                $errors[] = [
                    'entry_id' => $entry_id,
                    'errors'   => $result['errors'],
                ];
            }
        }

        return new WP_REST_Response( [
            'success'  => true,
            'imported' => $imported,
            'skipped'  => $skipped,
            'errors'   => $errors,
        ], 200 );
    }

    /**
     * Import a single WPForms entry by ID.
     */
    public function rest_sync_single( WP_REST_Request $request ): WP_REST_Response {

        $entry_id = $request->get_param( 'entry_id' );

        if ( $this->entry_already_imported( $entry_id ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'message' => "Entry {$entry_id} has already been imported.",
            ], 409 );
        }

        $entry = $this->get_wpforms_entry_by_id( $entry_id );

        if ( ! $entry ) {
            return new WP_REST_Response( [
                'success' => false,
                'message' => "WPForms entry {$entry_id} not found.",
            ], 404 );
        }

        $wpforms_entry = $this->build_entry_array_from_db( $entry );
        $result        = $this->process_entry( $wpforms_entry, $entry_id );

        return new WP_REST_Response( [
            'success'  => empty( $result['errors'] ),
            'player_id'        => $result['player_id'] ?? null,
            'registration_id'  => $result['registration_id'] ?? null,
            'warnings'         => $result['warnings'],
            'errors'           => $result['errors'],
        ], empty( $result['errors'] ) ? 200 : 422 );
    }

    /**
     * Return import stats for the React dashboard.
     */
    public function rest_sync_status( WP_REST_Request $request ): WP_REST_Response {

        global $wpdb;

        $total_entries  = $this->count_wpforms_entries();
        $total_imported = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->prefix}grsh_registrations
             WHERE season_id = %d AND source = 'wpforms'",
            self::SEASON
        ) );

        $unpaid = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->prefix}grsh_registrations
             WHERE season_id = %d AND payment_status = 'pending'",
            self::SEASON
        ) );

        $subs = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->prefix}grsh_registrations
             WHERE season_id = %d AND player_type = 'sub'",
            self::SEASON
        ) );

        $warnings = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->prefix}grsh_audit_logs
             WHERE season_id = %d AND action = 'sandbagging_review'",
            self::SEASON
        ) );

        return new WP_REST_Response( [
            'season'          => self::SEASON,
            'total_entries'   => $total_entries,
            'total_imported'  => $total_imported,
            'unsynced'        => max( 0, $total_entries - $total_imported ),
            'unpaid'          => $unpaid,
            'subs'            => $subs,
            'warnings'        => $warnings,
        ], 200 );
    }

    // -------------------------------------------------------------------------
    // Core import process
    // -------------------------------------------------------------------------

    /**
     * Process a single WPForms entry through the full import pipeline.
     *
     * Pipeline:
     *   1. Map fields via GRSH_Field_Mapper
     *   2. Validate mapped data
     *   3. Resolve player record (upsert)
     *   4. Create registration record
     *   5. Create availability record (subs only)
     *   6. Flag warnings to audit log
     *   7. Mark entry as imported
     *
     * @param  array $wpforms_entry  Structured entry from build_entry_array().
     * @param  int   $entry_id       WPForms entry ID.
     * @return array {
     *     player_id       : int|null,
     *     registration_id : int|null,
     *     warnings        : string[],
     *     errors          : string[],
     * }
     */
    private function process_entry( array $wpforms_entry, int $entry_id ): array {

        global $wpdb;

        // Step 1 — map fields
        $mapped = $this->mapper->map_entry( $wpforms_entry );

        // Step 2 — validate
        if ( ! empty( $mapped['errors'] ) ) {
            return [
                'player_id'       => null,
                'registration_id' => null,
                'warnings'        => $mapped['warnings'],
                'errors'          => $mapped['errors'],
            ];
        }

        $wpdb->query( 'START TRANSACTION' );

        try {

            // Step 3 — upsert player record
            $player_id = $this->upsert_player(
                $mapped['players'],
                $mapped['registrations']['player_type']
            );

            if ( ! $player_id ) {
                throw new RuntimeException( 'Failed to upsert player record.' );
            }

            // Step 4 — insert registration record
            $reg_data                 = $mapped['registrations'];
            $reg_data['player_id']    = $player_id;
            $reg_data['wpforms_entry_id'] = $entry_id;
            $reg_data['imported_at']  = current_time( 'mysql' );

            $reg_inserted = $wpdb->insert(
                "{$wpdb->prefix}grsh_registrations",
                $reg_data,
                $this->get_format_array( $reg_data )
            );

            if ( false === $reg_inserted ) {
                throw new RuntimeException(
                    'Failed to insert registration: ' . $wpdb->last_error
                );
            }

            $registration_id = (int) $wpdb->insert_id;

            // Step 5 — insert availability record (subs only)
            if ( ! empty( $mapped['availability'] ) ) {
                $avail_data                    = $mapped['availability'];
                $avail_data['player_id']       = $player_id;
                $avail_data['registration_id'] = $registration_id;

                $avail_inserted = $wpdb->insert(
                    "{$wpdb->prefix}grsh_availability",
                    $avail_data,
                    $this->get_format_array( $avail_data )
                );

                if ( false === $avail_inserted ) {
                    throw new RuntimeException(
                        'Failed to insert availability: ' . $wpdb->last_error
                    );
                }
            }

            // Step 6 — audit log
            $this->log_audit(
                'player_imported',
                'registration',
                $player_id,
                null,
                [ 'entry_id' => $entry_id ],
                null
            );

            // Step 6b — log any warnings (e.g. sandbagging)
            foreach ( $mapped['warnings'] as $warning ) {
                $action = str_starts_with( $warning, 'SANDBAGGING' )
                    ? 'sandbagging_review'
                    : 'import_warning';

                $this->log_audit(
                    $action,
                    'player',
                    $player_id,
                    null,
                    null,
                    $warning
                );
            }

            $wpdb->query( 'COMMIT' );

            return [
                'player_id'       => $player_id,
                'registration_id' => $registration_id,
                'warnings'        => $mapped['warnings'],
                'errors'          => [],
            ];

        } catch ( Exception $e ) {
            $wpdb->query( 'ROLLBACK' );

            $this->log_sync_failure( $entry_id, [ $e->getMessage() ] );

            return [
                'player_id'       => null,
                'registration_id' => null,
                'warnings'        => $mapped['warnings'] ?? [],
                'errors'          => [ $e->getMessage() ],
            ];
        }
    }

    // -------------------------------------------------------------------------
    // Player upsert — returning player detection
    // -------------------------------------------------------------------------

    /**
     * Insert a new player or update an existing one matched by email.
     * Returns the player ID.
     *
     * Returning player logic:
     *   - Match on email (primary key for deduplication)
     *   - Update mutable fields (phone, jersey size, notes)
     *   - Preserve committee overrides (skill_tier_assigned, sandbagging_flag)
     *   - Flag if self-reported skill tier has changed since last season
     *
     * @param  array  $player_data   Mapped player fields.
     * @param  string $player_type   'primary' | 'sub'
     * @return int|null              Player ID or null on failure.
     */
    private function upsert_player( array $player_data, string $player_type ): ?int {

        global $wpdb;

        $email      = sanitize_email( $player_data['email'] ?? '' );
        $existing   = $wpdb->get_row( $wpdb->prepare(
            "SELECT id, skill_tier_reported, skill_tier_assigned, sandbagging_flag
             FROM {$wpdb->prefix}grsh_players
             WHERE email = %s
             LIMIT 1",
            $email
        ) );

        if ( $existing ) {

            // Returning player — check for tier change
            $old_tier = $existing->skill_tier_reported;
            $new_tier = $player_data['skill_tier_reported'] ?? null;

            if ( $new_tier && $old_tier && $old_tier !== $new_tier ) {
                $this->log_audit(
                    'skill_tier_changed',
                    'player',
                    (int) $existing->id,
                    [ 'skill_tier_reported' => $old_tier ],
                    [ 'skill_tier_reported' => $new_tier ],
                    "Returning player changed skill tier from {$old_tier} to {$new_tier} — review."
                );
            }

            // Update mutable fields — preserve committee overrides
            $update_fields = array_intersect_key( $player_data, array_flip( [
                'first_name', 'last_name', 'phone',
                'age', 'skill_tier_reported', 'current_league',
                'years_experience', 'position', 'jersey_size',
                'tshirt_size', 'tshirt_type', 'notes',
                'is_alternate',
            ] ) );

            $wpdb->update(
                "{$wpdb->prefix}grsh_players",
                $update_fields,
                [ 'id' => $existing->id ],
                $this->get_format_array( $update_fields ),
                [ '%d' ]
            );

            return (int) $existing->id;
        }

        // New player — insert full record
        $player_data['is_alternate'] = ( $player_type === 'sub' ) ? 1 : 0;
        $player_data['is_goalie']    = ( ( $player_data['position'] ?? '' ) === 'goaltender' ) ? 1 : 0;

        $inserted = $wpdb->insert(
            "{$wpdb->prefix}grsh_players",
            $player_data,
            $this->get_format_array( $player_data )
        );

        return $inserted ? (int) $wpdb->insert_id : null;
    }

    // -------------------------------------------------------------------------
    // WPForms data access helpers
    // -------------------------------------------------------------------------

    /**
     * Fetch all WPForms entries for our form that have not been imported yet.
     */
    private function get_unsynced_wpforms_entries(): array {
        global $wpdb;

        return $wpdb->get_results( $wpdb->prepare(
            "SELECT e.*
             FROM {$wpdb->prefix}wpforms_entries e
             LEFT JOIN {$wpdb->prefix}grsh_registrations r
                 ON r.wpforms_entry_id = e.entry_id
             WHERE e.form_id = %d
               AND r.id IS NULL
             ORDER BY e.entry_id ASC",
            self::FORM_ID
        ) );
    }

    /**
     * Fetch a single WPForms entry by ID.
     */
    private function get_wpforms_entry_by_id( int $entry_id ): ?object {
        global $wpdb;

        return $wpdb->get_row( $wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}wpforms_entries WHERE entry_id = %d",
            $entry_id
        ) ) ?: null;
    }

    /**
     * Count total WPForms entries for the registration form.
     */
    private function count_wpforms_entries(): int {
        global $wpdb;

        return (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->prefix}wpforms_entries WHERE form_id = %d",
            self::FORM_ID
        ) );
    }

    /**
     * Check if a WPForms entry has already been imported.
     */
    private function entry_already_imported( int $entry_id ): bool {
        global $wpdb;

        return (bool) $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}grsh_registrations
             WHERE wpforms_entry_id = %d LIMIT 1",
            $entry_id
        ) );
    }

    /**
     * Build the entry array structure expected by GRSH_Field_Mapper
     * from a live WPForms $fields array (on_form_submit path).
     */
    private function build_entry_array( array $fields, int $entry_id ): array {
        $structured = [ 'fields' => [], 'meta' => [] ];
        foreach ( $fields as $field_id => $field ) {
            $structured['fields'][ (string) $field_id ] = $field;
        }
        $structured['meta']['entry_id'] = $entry_id;
        return $structured;
    }

    /**
     * Build the entry array structure expected by GRSH_Field_Mapper
     * from a WPForms DB row (manual import path).
     */
    private function build_entry_array_from_db( object $entry ): array {
        $fields = json_decode( $entry->fields ?? '{}', true ) ?: [];
        $meta   = [
            'entry_id'       => $entry->entry_id,
            'payment_status' => $entry->status ?? 'pending',
            'payment_type'   => $entry->payment_gateway ?? 'paypal',
        ];
        return [ 'fields' => $fields, 'meta' => $meta ];
    }

    // -------------------------------------------------------------------------
    // Audit logging
    // -------------------------------------------------------------------------

    /**
     * Write a row to wp_grsh_audit_logs.
     */
    private function log_audit(
        string  $action,
        string  $object_type,
        ?int    $object_id,
        ?array  $before,
        ?array  $after,
        ?string $notes
    ): void {
        global $wpdb;

        $wpdb->insert(
            "{$wpdb->prefix}grsh_audit_logs",
            [
                'season_id'    => self::SEASON,
                'wp_user_id'   => get_current_user_id() ?: 0,
                'user_display' => wp_get_current_user()->display_name ?? 'system',
                'action'       => $action,
                'object_type'  => $object_type,
                'object_id'    => $object_id,
                'before_value' => $before ? wp_json_encode( $before ) : null,
                'after_value'  => $after  ? wp_json_encode( $after )  : null,
                'notes'        => $notes,
                'ip_address'   => $_SERVER['REMOTE_ADDR'] ?? null,
            ],
            [ '%d', '%d', '%s', '%s', '%s', '%d', '%s', '%s', '%s', '%s' ]
        );
    }

    /**
     * Log a sync failure for visibility in the admin dashboard.
     */
    private function log_sync_failure( int $entry_id, array $errors ): void {
        $this->log_audit(
            'sync_failed',
            'registration',
            null,
            null,
            [ 'entry_id' => $entry_id, 'errors' => $errors ],
            implode( ' | ', $errors )
        );
    }

    // -------------------------------------------------------------------------
    // Utility
    // -------------------------------------------------------------------------

    /**
     * Build a wpdb format array (%s/%d/%f) from a data array.
     * Defaults all values to %s — safe for MySQL implicit casting.
     */
    private function get_format_array( array $data ): array {
        $integer_cols = [
            'age', 'years_experience', 'max_games_per_day', 'season_id',
            'player_id', 'team_id', 'registration_id', 'form_id',
            'is_alternate', 'is_goalie', 'is_locked', 'waiver_accepted',
            'late_game_available', 'sandbagging_flag',
        ];
        $decimal_cols = [ 'amount_paid' ];

        $formats = [];
        foreach ( array_keys( $data ) as $col ) {
            if ( in_array( $col, $integer_cols, true ) ) {
                $formats[] = '%d';
            } elseif ( in_array( $col, $decimal_cols, true ) ) {
                $formats[] = '%f';
            } else {
                $formats[] = '%s';
            }
        }
        return $formats;
    }
}
