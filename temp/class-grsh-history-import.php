<?php
/**
 * Gold Rush Senior Hockey — Historical Player Import Engine
 * Plugin: GRSH Tournament Manager
 * Developer: Tech Tribe Consulting
 *
 * Handles importing player history from prior seasons via CSV upload.
 *
 * REST endpoints:
 *   POST /grsh/v1/history/import        — upload and process CSV
 *   GET  /grsh/v1/history/template      — download blank CSV template
 *   GET  /grsh/v1/history/preview       — preview last uploaded CSV before commit
 *   DELETE /grsh/v1/history/import/{id} — remove a history record
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class GRSH_History_Import {

    // -------------------------------------------------------------------------
    // Column map — CSV header → DB column
    // -------------------------------------------------------------------------

    const COLUMN_MAP = [
        'first_name'           => [ 'required' => true,  'type' => 'string'  ],
        'last_name'            => [ 'required' => true,  'type' => 'string'  ],
        'email'                => [ 'required' => true,  'type' => 'email'   ],
        'season_year'          => [ 'required' => true,  'type' => 'integer' ],
        'division_played'      => [ 'required' => true,  'type' => 'string'  ],
        'team_name'            => [ 'required' => false, 'type' => 'string'  ],
        'finish_position'      => [ 'required' => false, 'type' => 'integer' ],
        'championship_result'  => [ 'required' => false, 'type' => 'string'  ],
        'was_captain'          => [ 'required' => false, 'type' => 'boolean' ],
        'was_alternate'        => [ 'required' => false, 'type' => 'boolean' ],
        'was_emergency_goalie' => [ 'required' => false, 'type' => 'boolean' ],
        'skill_tier_reported'  => [ 'required' => false, 'type' => 'string'  ],
        'games_scheduled'      => [ 'required' => false, 'type' => 'integer' ],
        'games_attended'       => [ 'required' => false, 'type' => 'integer' ],
        'no_show_count'        => [ 'required' => false, 'type' => 'integer' ],
        'sandbagging_flag'     => [ 'required' => false, 'type' => 'boolean' ],
        'committee_notes'      => [ 'required' => false, 'type' => 'string'  ],
    ];

    const VALID_DIVISIONS = [
        'gold_open', '45a', 'senior_b', 'senior_c', 'womens',
    ];

    const VALID_CHAMP_RESULTS = [
        'winner', 'runner_up', 'participant', 'none',
    ];

    // -------------------------------------------------------------------------
    // Hook registration
    // -------------------------------------------------------------------------

    public static function register_hooks(): void {
        add_action( 'rest_api_init', [ new self(), 'register_rest_routes' ] );
    }

    public function register_rest_routes(): void {

        // Upload and process CSV
        register_rest_route( 'grsh/v1', '/history/import', [
            'methods'             => 'POST',
            'callback'            => [ $this, 'rest_import_csv' ],
            'permission_callback' => [ $this, 'rest_permission_check' ],
        ] );

        // Download blank template
        register_rest_route( 'grsh/v1', '/history/template', [
            'methods'             => 'GET',
            'callback'            => [ $this, 'rest_download_template' ],
            'permission_callback' => [ $this, 'rest_permission_check' ],
        ] );

        // Get import stats and recent history
        register_rest_route( 'grsh/v1', '/history/stats', [
            'methods'             => 'GET',
            'callback'            => [ $this, 'rest_get_stats' ],
            'permission_callback' => [ $this, 'rest_permission_check' ],
        ] );

        // Get all history records with filters
        register_rest_route( 'grsh/v1', '/history/records', [
            'methods'             => 'GET',
            'callback'            => [ $this, 'rest_get_records' ],
            'permission_callback' => [ $this, 'rest_permission_check' ],
            'args'                => [
                'season_year' => [ 'sanitize_callback' => 'absint' ],
                'division'    => [ 'sanitize_callback' => 'sanitize_text_field' ],
                'page'        => [ 'sanitize_callback' => 'absint', 'default' => 1 ],
                'per_page'    => [ 'sanitize_callback' => 'absint', 'default' => 50 ],
            ],
        ] );

        // Delete a history record
        register_rest_route( 'grsh/v1', '/history/records/(?P<id>\d+)', [
            'methods'             => 'DELETE',
            'callback'            => [ $this, 'rest_delete_record' ],
            'permission_callback' => [ $this, 'rest_permission_check' ],
            'args'                => [
                'id' => [ 'validate_callback' => fn( $v ) => is_numeric( $v ), 'sanitize_callback' => 'absint' ],
            ],
        ] );
    }

    public function rest_permission_check(): bool {
        return current_user_can( 'manage_options' ) || current_user_can( 'grsh_committee' );
    }

    // -------------------------------------------------------------------------
    // REST: Import CSV
    // -------------------------------------------------------------------------

    public function rest_import_csv( WP_REST_Request $request ): WP_REST_Response {

        $files = $request->get_file_params();

        if ( empty( $files['csv'] ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'message' => 'No CSV file uploaded. Send the file as multipart form-data with key "csv".',
            ], 400 );
        }

        $file = $files['csv'];

        // Validate file type
        $ext = strtolower( pathinfo( $file['name'], PATHINFO_EXTENSION ) );
        if ( ! in_array( $ext, [ 'csv', 'txt' ], true ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'message' => 'File must be a CSV (.csv or .txt).',
            ], 400 );
        }

        // Parse CSV
        $rows = $this->parse_csv( $file['tmp_name'] );

        if ( empty( $rows ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'message' => 'CSV file is empty or could not be parsed.',
            ], 400 );
        }

        // Validate headers
        $header_check = $this->validate_headers( array_keys( $rows[0] ) );
        if ( ! empty( $header_check['missing'] ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'message' => 'CSV is missing required columns: ' . implode( ', ', $header_check['missing'] ),
            ], 400 );
        }

        // Process rows
        $imported  = 0;
        $skipped   = 0;
        $errors    = [];
        $warnings  = [];

        global $wpdb;
        $wpdb->query( 'START TRANSACTION' );

        try {
            foreach ( $rows as $i => $row ) {
                $line = $i + 2; // 1-indexed, +1 for header row

                // Validate row
                $validation = $this->validate_row( $row, $line );
                if ( ! empty( $validation['errors'] ) ) {
                    $errors = array_merge( $errors, $validation['errors'] );
                    $skipped++;
                    continue;
                }

                // Collect any row warnings
                if ( ! empty( $validation['warnings'] ) ) {
                    $warnings = array_merge( $warnings, $validation['warnings'] );
                }

                // Resolve or create player record
                $player_id = $this->resolve_player( $row );
                if ( ! $player_id ) {
                    $errors[] = "Line {$line}: Could not resolve player for email {$row['email']} — skipped.";
                    $skipped++;
                    continue;
                }

                // Resolve season record
                $season_id = $this->resolve_season( (int) $row['season_year'] );

                // Check for duplicate
                $existing = $wpdb->get_var( $wpdb->prepare(
                    "SELECT id FROM {$wpdb->prefix}grsh_player_history
                     WHERE player_id = %d AND season_id = %d",
                    $player_id, $season_id
                ) );

                if ( $existing ) {
                    $warnings[] = "Line {$line}: History record for {$row['email']} season {$row['season_year']} already exists — updated.";
                    $this->update_history_record( (int) $existing, $row, $player_id, $season_id );
                } else {
                    $this->insert_history_record( $row, $player_id, $season_id );
                }

                // Update player reliability stats
                $this->update_player_reliability( $player_id );

                $imported++;
            }

            $wpdb->query( 'COMMIT' );

            // Audit log
            $this->log_import( $imported, $skipped, count( $rows ) );

            return new WP_REST_Response( [
                'success'  => true,
                'imported' => $imported,
                'skipped'  => $skipped,
                'total'    => count( $rows ),
                'warnings' => $warnings,
                'errors'   => $errors,
            ], 200 );

        } catch ( Exception $e ) {
            $wpdb->query( 'ROLLBACK' );
            return new WP_REST_Response( [
                'success' => false,
                'message' => 'Import failed: ' . $e->getMessage(),
            ], 500 );
        }
    }

    // -------------------------------------------------------------------------
    // REST: Download CSV template
    // -------------------------------------------------------------------------

    public function rest_download_template(): void {
        header( 'Content-Type: text/csv' );
        header( 'Content-Disposition: attachment; filename="grsh-history-import-template.csv"' );
        header( 'Cache-Control: no-cache' );

        $out = fopen( 'php://output', 'w' );

        // Header row
        fputcsv( $out, array_keys( self::COLUMN_MAP ) );

        // Example rows
        $examples = [
            [
                'Dave', 'Kowalski', 'd.kowalski@email.com',
                '2026', 'gold_open', 'Team Gold', '1', 'winner',
                '1', '0', '0', 'B1', '6', '6', '0', '0', '',
            ],
            [
                'Janet', 'Ruiz', 'j.ruiz@email.com',
                '2026', 'senior_c', 'Team Blue', '2', 'runner_up',
                '0', '0', '1', 'C1', '6', '5', '1', '0', 'Goalie sub used twice',
            ],
            [
                'Amy', 'Buchanan', 'a.buchanan@email.com',
                '2026', 'gold_open', 'Sub pool', '', 'none',
                '0', '1', '0', 'R1', '3', '3', '0', '0', '',
            ],
        ];

        foreach ( $examples as $row ) {
            fputcsv( $out, $row );
        }

        fclose( $out );
        exit;
    }

    // -------------------------------------------------------------------------
    // REST: Get stats
    // -------------------------------------------------------------------------

    public function rest_get_stats(): WP_REST_Response {
        global $wpdb;

        $total_records = (int) $wpdb->get_var(
            "SELECT COUNT(*) FROM {$wpdb->prefix}grsh_player_history"
        );

        $seasons = $wpdb->get_col(
            "SELECT DISTINCT s.season_year
             FROM {$wpdb->prefix}grsh_player_history h
             JOIN {$wpdb->prefix}grsh_seasons s ON s.id = h.season_id
             ORDER BY s.season_year DESC"
        );

        $champions = (int) $wpdb->get_var(
            "SELECT COUNT(DISTINCT player_id)
             FROM {$wpdb->prefix}grsh_player_history
             WHERE championship_result = 'winner'"
        );

        $sandbagging = (int) $wpdb->get_var(
            "SELECT COUNT(DISTINCT player_id)
             FROM {$wpdb->prefix}grsh_player_history
             WHERE sandbagging_flag = 1"
        );

        $no_shows = (int) $wpdb->get_var(
            "SELECT COUNT(DISTINCT player_id)
             FROM {$wpdb->prefix}grsh_player_history
             WHERE no_show_count > 0"
        );

        return new WP_REST_Response( [
            'total_records' => $total_records,
            'seasons'       => $seasons,
            'champions'     => $champions,
            'sandbagging'   => $sandbagging,
            'no_shows'      => $no_shows,
        ], 200 );
    }

    // -------------------------------------------------------------------------
    // REST: Get records
    // -------------------------------------------------------------------------

    public function rest_get_records( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;

        $season_year = $request->get_param( 'season_year' );
        $division    = $request->get_param( 'division' );
        $page        = max( 1, (int) $request->get_param( 'page' ) );
        $per_page    = min( 100, max( 1, (int) $request->get_param( 'per_page' ) ) );
        $offset      = ( $page - 1 ) * $per_page;

        $where  = [ '1=1' ];
        $params = [];

        if ( $season_year ) {
            $where[]  = "s.season_year = %d";
            $params[] = $season_year;
        }
        if ( $division ) {
            $where[]  = "h.division_played = %s";
            $params[] = $division;
        }

        $where_sql = implode( ' AND ', $where );

        $total = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT COUNT(*)
             FROM {$wpdb->prefix}grsh_player_history h
             JOIN {$wpdb->prefix}grsh_seasons s ON s.id = h.season_id
             WHERE {$where_sql}",
            ...$params
        ) );

        $records = $wpdb->get_results( $wpdb->prepare(
            "SELECT
                h.id, h.player_id, h.division_played, h.team_name,
                h.finish_position, h.championship_result,
                h.was_captain, h.was_alternate, h.was_emergency_goalie,
                h.skill_tier_reported, h.sandbagging_flag,
                h.games_scheduled, h.games_attended, h.no_show_count,
                h.committee_notes, h.import_source,
                s.season_year,
                p.first_name, p.last_name, p.email
             FROM {$wpdb->prefix}grsh_player_history h
             JOIN {$wpdb->prefix}grsh_seasons s ON s.id = h.season_id
             JOIN {$wpdb->prefix}grsh_players p ON p.id = h.player_id
             WHERE {$where_sql}
             ORDER BY s.season_year DESC, p.last_name ASC
             LIMIT %d OFFSET %d",
            ...[...$params, $per_page, $offset]
        ) );

        return new WP_REST_Response( [
            'records'    => $records,
            'total'      => $total,
            'page'       => $page,
            'per_page'   => $per_page,
            'total_pages'=> (int) ceil( $total / $per_page ),
        ], 200 );
    }

    // -------------------------------------------------------------------------
    // REST: Delete record
    // -------------------------------------------------------------------------

    public function rest_delete_record( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;

        $id = $request->get_param( 'id' );

        $record = $wpdb->get_row( $wpdb->prepare(
            "SELECT h.*, p.email FROM {$wpdb->prefix}grsh_player_history h
             JOIN {$wpdb->prefix}grsh_players p ON p.id = h.player_id
             WHERE h.id = %d",
            $id
        ) );

        if ( ! $record ) {
            return new WP_REST_Response( [
                'success' => false,
                'message' => "History record {$id} not found.",
            ], 404 );
        }

        $wpdb->delete(
            "{$wpdb->prefix}grsh_player_history",
            [ 'id' => $id ],
            [ '%d' ]
        );

        // Recalculate reliability for this player
        $this->update_player_reliability( (int) $record->player_id );

        return new WP_REST_Response( [
            'success' => true,
            'deleted' => $id,
        ], 200 );
    }

    // -------------------------------------------------------------------------
    // CSV parsing
    // -------------------------------------------------------------------------

    private function parse_csv( string $file_path ): array {
        $rows   = [];
        $handle = fopen( $file_path, 'r' );

        if ( ! $handle ) {
            return [];
        }

        $headers = null;

        while ( ( $line = fgetcsv( $handle, 0, ',', '"', '\\' ) ) !== false ) {
            // Skip blank lines
            if ( empty( array_filter( $line ) ) ) {
                continue;
            }

            if ( $headers === null ) {
                // Normalise headers — trim, lowercase, replace spaces with underscores
                $headers = array_map(
                    fn( $h ) => strtolower( trim( str_replace( ' ', '_', $h ) ) ),
                    $line
                );
                continue;
            }

            // Pad short rows
            while ( count( $line ) < count( $headers ) ) {
                $line[] = '';
            }

            $row = array_combine( $headers, array_slice( $line, 0, count( $headers ) ) );
            $rows[] = array_map( 'trim', $row );
        }

        fclose( $handle );
        return $rows;
    }

    // -------------------------------------------------------------------------
    // Validation
    // -------------------------------------------------------------------------

    private function validate_headers( array $csv_headers ): array {
        $missing = [];
        foreach ( self::COLUMN_MAP as $col => $config ) {
            if ( $config['required'] && ! in_array( $col, $csv_headers, true ) ) {
                $missing[] = $col;
            }
        }
        return [ 'missing' => $missing ];
    }

    private function validate_row( array $row, int $line ): array {
        $errors   = [];
        $warnings = [];

        // Required fields
        foreach ( self::COLUMN_MAP as $col => $config ) {
            if ( $config['required'] && empty( $row[ $col ] ) ) {
                $errors[] = "Line {$line}: Missing required field '{$col}'.";
            }
        }

        // Email format
        if ( ! empty( $row['email'] ) && ! is_email( $row['email'] ) ) {
            $errors[] = "Line {$line}: Invalid email address '{$row['email']}'.";
        }

        // Season year
        if ( ! empty( $row['season_year'] ) ) {
            $year = (int) $row['season_year'];
            if ( $year < 2000 || $year > 2100 ) {
                $errors[] = "Line {$line}: season_year '{$row['season_year']}' is not a valid year.";
            }
        }

        // Division
        if ( ! empty( $row['division_played'] ) ) {
            $div = strtolower( $row['division_played'] );
            if ( ! in_array( $div, self::VALID_DIVISIONS, true ) ) {
                $errors[] = "Line {$line}: division_played '{$row['division_played']}' is not valid. Use: " . implode( ', ', self::VALID_DIVISIONS );
            }
        }

        // Championship result
        if ( ! empty( $row['championship_result'] ) ) {
            $champ = strtolower( $row['championship_result'] );
            if ( ! in_array( $champ, self::VALID_CHAMP_RESULTS, true ) ) {
                $errors[] = "Line {$line}: championship_result '{$row['championship_result']}' is not valid. Use: " . implode( ', ', self::VALID_CHAMP_RESULTS );
            }
        }

        // Attendance sanity check
        if ( ! empty( $row['games_attended'] ) && ! empty( $row['games_scheduled'] ) ) {
            if ( (int) $row['games_attended'] > (int) $row['games_scheduled'] ) {
                $warnings[] = "Line {$line}: games_attended ({$row['games_attended']}) exceeds games_scheduled ({$row['games_scheduled']}) — check values.";
            }
        }

        // Sandbagging auto-detection
        if ( ! empty( $row['skill_tier_reported'] ) && ! empty( $row['division_played'] ) ) {
            $tier = strtoupper( substr( $row['skill_tier_reported'], 0, 1 ) );
            $div  = strtolower( $row['division_played'] );
            if ( in_array( $tier, [ 'A', 'B' ], true ) && in_array( $div, [ 'senior_b', 'senior_c' ], true ) ) {
                $warnings[] = "Line {$line}: Possible sandbagging — tier {$row['skill_tier_reported']} in {$row['division_played']}.";
            }
        }

        return [ 'errors' => $errors, 'warnings' => $warnings ];
    }

    // -------------------------------------------------------------------------
    // Player resolution
    // -------------------------------------------------------------------------

    /**
     * Find existing player by email or create a minimal new record.
     */
    private function resolve_player( array $row ): ?int {
        global $wpdb;

        $email = sanitize_email( $row['email'] );

        // Try to find existing player
        $player_id = $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}grsh_players WHERE email = %s LIMIT 1",
            $email
        ) );

        if ( $player_id ) {
            return (int) $player_id;
        }

        // Create minimal player record from historical data
        $inserted = $wpdb->insert(
            "{$wpdb->prefix}grsh_players",
            [
                'first_name'          => sanitize_text_field( $row['first_name'] ),
                'last_name'           => sanitize_text_field( $row['last_name'] ),
                'email'               => $email,
                'skill_tier_reported' => sanitize_text_field( $row['skill_tier_reported'] ?? '' ) ?: null,
                'notes'               => 'Created from historical import',
            ],
            [ '%s', '%s', '%s', '%s', '%s' ]
        );

        return $inserted ? (int) $wpdb->insert_id : null;
    }

    // -------------------------------------------------------------------------
    // Season resolution
    // -------------------------------------------------------------------------

    /**
     * Find or create a season record for the given year.
     */
    private function resolve_season( int $year ): int {
        global $wpdb;

        $season_id = $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}grsh_seasons WHERE season_year = %d LIMIT 1",
            $year
        ) );

        if ( $season_id ) {
            return (int) $season_id;
        }

        $wpdb->insert(
            "{$wpdb->prefix}grsh_seasons",
            [
                'season_year' => $year,
                'label'       => "Gold Rush {$year}",
                'form_id'     => 0,
                'status'      => 'complete',
            ],
            [ '%d', '%s', '%d', '%s' ]
        );

        return (int) $wpdb->insert_id;
    }

    // -------------------------------------------------------------------------
    // DB writes
    // -------------------------------------------------------------------------

    private function insert_history_record( array $row, int $player_id, int $season_id ): void {
        global $wpdb;

        $wpdb->insert(
            "{$wpdb->prefix}grsh_player_history",
            $this->build_history_data( $row, $player_id, $season_id ),
            $this->build_history_format()
        );
    }

    private function update_history_record( int $id, array $row, int $player_id, int $season_id ): void {
        global $wpdb;

        $wpdb->update(
            "{$wpdb->prefix}grsh_player_history",
            $this->build_history_data( $row, $player_id, $season_id ),
            [ 'id' => $id ],
            $this->build_history_format(),
            [ '%d' ]
        );
    }

    private function build_history_data( array $row, int $player_id, int $season_id ): array {
        return [
            'player_id'            => $player_id,
            'season_id'            => $season_id,
            'division_played'      => strtolower( sanitize_text_field( $row['division_played'] ) ),
            'team_name'            => sanitize_text_field( $row['team_name'] ?? '' ) ?: null,
            'finish_position'      => isset( $row['finish_position'] ) && $row['finish_position'] !== '' ? (int) $row['finish_position'] : null,
            'championship_result'  => strtolower( sanitize_text_field( $row['championship_result'] ?? 'none' ) ) ?: 'none',
            'was_captain'          => $this->parse_bool( $row['was_captain'] ?? '0' ),
            'was_alternate'        => $this->parse_bool( $row['was_alternate'] ?? '0' ),
            'was_emergency_goalie' => $this->parse_bool( $row['was_emergency_goalie'] ?? '0' ),
            'skill_tier_reported'  => sanitize_text_field( $row['skill_tier_reported'] ?? '' ) ?: null,
            'sandbagging_flag'     => $this->parse_bool( $row['sandbagging_flag'] ?? '0' ),
            'games_scheduled'      => isset( $row['games_scheduled'] ) && $row['games_scheduled'] !== '' ? (int) $row['games_scheduled'] : null,
            'games_attended'       => isset( $row['games_attended'] ) && $row['games_attended'] !== '' ? (int) $row['games_attended'] : null,
            'no_show_count'        => (int) ( $row['no_show_count'] ?? 0 ),
            'committee_notes'      => sanitize_textarea_field( $row['committee_notes'] ?? '' ) ?: null,
            'import_source'        => 'csv',
        ];
    }

    private function build_history_format(): array {
        return [
            '%d', '%d', '%s', '%s', '%d', '%s',
            '%d', '%d', '%d', '%s', '%d',
            '%d', '%d', '%d', '%s', '%s',
        ];
    }

    // -------------------------------------------------------------------------
    // Reliability recalculation
    // -------------------------------------------------------------------------

    /**
     * Recalculate a player's attendance_rating and no_show_count
     * from their full history after any import or delete.
     */
    private function update_player_reliability( int $player_id ): void {
        global $wpdb;

        $stats = $wpdb->get_row( $wpdb->prepare(
            "SELECT
                SUM(games_scheduled) AS total_scheduled,
                SUM(games_attended)  AS total_attended,
                SUM(no_show_count)   AS total_no_shows
             FROM {$wpdb->prefix}grsh_player_history
             WHERE player_id = %d
               AND games_scheduled IS NOT NULL",
            $player_id
        ) );

        if ( ! $stats || ! $stats->total_scheduled ) {
            return;
        }

        $rating = round( ( $stats->total_attended / $stats->total_scheduled ) * 100, 2 );

        $wpdb->update(
            "{$wpdb->prefix}grsh_players",
            [
                'attendance_rating' => $rating,
                'no_show_count'     => (int) $stats->total_no_shows,
            ],
            [ 'id' => $player_id ],
            [ '%f', '%d' ],
            [ '%d' ]
        );
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private function parse_bool( $value ): int {
        if ( in_array( strtolower( (string) $value ), [ '1', 'true', 'yes', 'y' ], true ) ) {
            return 1;
        }
        return 0;
    }

    private function log_import( int $imported, int $skipped, int $total ): void {
        global $wpdb;

        $wpdb->insert(
            "{$wpdb->prefix}grsh_audit_logs",
            [
                'wp_user_id'   => get_current_user_id(),
                'user_display' => wp_get_current_user()->display_name ?? 'system',
                'action'       => 'history_csv_import',
                'object_type'  => 'player_history',
                'after_value'  => wp_json_encode( [
                    'imported' => $imported,
                    'skipped'  => $skipped,
                    'total'    => $total,
                ] ),
                'notes'        => "CSV import: {$imported} imported, {$skipped} skipped of {$total} total rows.",
            ],
            [ '%d', '%s', '%s', '%s', '%s', '%s' ]
        );
    }
}
