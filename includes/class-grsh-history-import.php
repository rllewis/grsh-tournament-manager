<?php
/**
 * Gold Rush Senior Hockey — Historical Player Import Engine
 * Plugin: GRSH Tournament Manager
 * Developer: Tech Tribe Consulting
 *
 * Handles importing player history from prior seasons via CSV upload.
 *
 * REST endpoints:
 *   POST   /grsh/v1/history/import        — upload and process CSV
 *   GET    /grsh/v1/history/template      — download blank CSV template
 *   GET    /grsh/v1/history/stats         — stat card counts
 *   GET    /grsh/v1/history/records       — all history rows with filters
 *   GET    /grsh/v1/history/import-logs   — *** NEW *** per-import session log
 *   DELETE /grsh/v1/history/records/{id}  — remove a history record
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

        register_rest_route( 'grsh/v1', '/history/import', [
            'methods'             => 'POST',
            'callback'            => [ $this, 'rest_import_csv' ],
            'permission_callback' => [ $this, 'rest_permission_check' ],
        ] );

        register_rest_route( 'grsh/v1', '/history/template', [
            'methods'             => 'GET',
            'callback'            => [ $this, 'rest_download_template' ],
            'permission_callback' => [ $this, 'rest_permission_check' ],
        ] );

        register_rest_route( 'grsh/v1', '/history/stats', [
            'methods'             => 'GET',
            'callback'            => [ $this, 'rest_get_stats' ],
            'permission_callback' => [ $this, 'rest_permission_check' ],
        ] );

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

        // ── FIX: New endpoint so the Import Log tab can actually load data ──
        register_rest_route( 'grsh/v1', '/history/import-logs', [
            'methods'             => 'GET',
            'callback'            => [ $this, 'rest_get_import_logs' ],
            'permission_callback' => [ $this, 'rest_permission_check' ],
            'args'                => [
                'limit' => [ 'sanitize_callback' => 'absint', 'default' => 20 ],
            ],
        ] );

        register_rest_route( 'grsh/v1', '/history/records/(?P<id>\d+)', [
            'methods'             => 'DELETE',
            'callback'            => [ $this, 'rest_delete_record' ],
            'permission_callback' => [ $this, 'rest_permission_check' ],
            'args'                => [
                'id' => [
                    'validate_callback' => fn( $v ) => is_numeric( $v ),
                    'sanitize_callback' => 'absint',
                ],
            ],
        ] );

        // DELETE /history/records — clear ALL history (React "Clear all history" button)
        register_rest_route( 'grsh/v1', '/history/records', [
            'methods'             => 'DELETE',
            'callback'            => [ $this, 'rest_delete_all_records' ],
            'permission_callback' => [ $this, 'rest_permission_check' ],
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

        $ext = strtolower( pathinfo( $file['name'], PATHINFO_EXTENSION ) );
        if ( ! in_array( $ext, [ 'csv', 'txt' ], true ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'message' => 'File must be a CSV (.csv or .txt).',
            ], 400 );
        }

        $rows = $this->parse_csv( $file['tmp_name'] );

        if ( empty( $rows ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'message' => 'CSV file is empty or could not be parsed.',
            ], 400 );
        }

        $header_check = $this->validate_headers( array_keys( $rows[0] ) );
        if ( ! empty( $header_check['missing'] ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'message' => 'CSV is missing required columns: ' . implode( ', ', $header_check['missing'] ),
            ], 400 );
        }

        $imported  = 0;
        $skipped   = 0;
        $updated   = 0;
        $errors    = [];
        $warnings  = [];

        global $wpdb;
        $wpdb->query( 'START TRANSACTION' );

        try {
            foreach ( $rows as $i => $row ) {
                $line = $i + 2;

                $validation = $this->validate_row( $row, $line );
                if ( ! empty( $validation['errors'] ) ) {
                    $errors  = array_merge( $errors, $validation['errors'] );
                    $skipped++;
                    continue;
                }

                if ( ! empty( $validation['warnings'] ) ) {
                    $warnings = array_merge( $warnings, $validation['warnings'] );
                }

                $player_id = $this->resolve_player( $row );
                if ( ! $player_id ) {
                    $errors[] = "Line {$line}: Could not resolve or create player for email {$row['email']} — skipped.";
                    $skipped++;
                    continue;
                }

                $season_id = $this->resolve_season( (int) $row['season_year'] );

                $existing = $wpdb->get_var( $wpdb->prepare(
                    "SELECT id FROM {$wpdb->prefix}grsh_player_history
                     WHERE player_id = %d AND season_id = %d",
                    $player_id, $season_id
                ) );

                if ( $existing ) {
                    $warnings[] = "Line {$line}: {$row['email']} season {$row['season_year']} already existed — record updated.";
                    $this->update_history_record( (int) $existing, $row, $player_id, $season_id );
                    $updated++;
                } else {
                    $this->insert_history_record( $row, $player_id, $season_id );
                }

                $this->update_player_reliability( $player_id );
                $imported++;
            }

            $wpdb->query( 'COMMIT' );

            // ── FIX: pass full errors + warnings arrays to the log ──
            $this->log_import(
                $imported,
                $skipped,
                $updated,
                count( $rows ),
                basename( $file['name'] ),
                $errors,
                $warnings
            );

            return new WP_REST_Response( [
                'success'  => true,
                'imported' => $imported,
                'updated'  => $updated,
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
        fputcsv( $out, array_keys( self::COLUMN_MAP ) );

        $examples = [
            [ 'Dave',  'Kowalski', 'd.kowalski@email.com', '2026', 'gold_open', 'Team Gold', '1', 'winner',     '1', '0', '0', 'B1', '6', '6', '0', '0', ''                    ],
            [ 'Janet', 'Ruiz',     'j.ruiz@email.com',     '2026', 'senior_c',  'Team Blue', '2', 'runner_up',  '0', '0', '1', 'C1', '6', '5', '1', '0', 'Goalie sub used twice' ],
            [ 'Amy',   'Buchanan', 'a.buchanan@email.com', '2026', 'gold_open', 'Sub pool',  '',  'none',       '0', '1', '0', 'R1', '3', '3', '0', '0', ''                    ],
        ];

        foreach ( $examples as $row ) {
            fputcsv( $out, $row );
        }

        fclose( $out );
        exit;
    }

    // -------------------------------------------------------------------------
    // REST: Stats
    // ── FIX: added captains + seasons_count; renamed total_records → total
    //         so React reads data.total consistently with /history/records
    // -------------------------------------------------------------------------

    public function rest_get_stats(): WP_REST_Response {
        global $wpdb;

        // Total imported rows
        $total = (int) $wpdb->get_var(
            "SELECT COUNT(*) FROM {$wpdb->prefix}grsh_player_history"
        );

        // Distinct seasons
        $seasons = $wpdb->get_col(
            "SELECT DISTINCT s.season_year
             FROM {$wpdb->prefix}grsh_player_history h
             JOIN {$wpdb->prefix}grsh_seasons s ON s.id = h.season_id
             ORDER BY s.season_year DESC"
        ) ?: [];

        // Past champions (distinct players who won at least once)
        $champions = (int) $wpdb->get_var(
            "SELECT COUNT(DISTINCT player_id)
             FROM {$wpdb->prefix}grsh_player_history
             WHERE championship_result = 'winner'"
        );

        // Captains — FIX: was missing from original, caused 0 in React stat chip
        $captains = (int) $wpdb->get_var(
            "SELECT COUNT(DISTINCT player_id)
             FROM {$wpdb->prefix}grsh_player_history
             WHERE was_captain = 1"
        );

        // Sandbagging flags
        $sandbagging = (int) $wpdb->get_var(
            "SELECT COUNT(DISTINCT player_id)
             FROM {$wpdb->prefix}grsh_player_history
             WHERE sandbagging_flag = 1"
        );

        // No-shows
        $no_shows = (int) $wpdb->get_var(
            "SELECT COUNT(DISTINCT player_id)
             FROM {$wpdb->prefix}grsh_player_history
             WHERE no_show_count > 0"
        );

        return new WP_REST_Response( [
            // ── FIX: React reads data.total — was data.total_records (mismatch) ──
            'total'          => $total,
            'total_records'  => $total,    // keep alias for backward compat
            'seasons'        => array_map( 'intval', $seasons ),
            'seasons_count'  => count( $seasons ),
            'champions'      => $champions,
            'captains'       => $captains,
            'sandbagging'    => $sandbagging,
            'no_shows'       => $no_shows,
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
        $per_page    = min( 500, max( 1, (int) $request->get_param( 'per_page' ) ) );
        $offset      = ( $page - 1 ) * $per_page;

        $where  = [ '1=1' ];
        $params = [];

        if ( $season_year ) {
            $where[]  = 's.season_year = %d';
            $params[] = $season_year;
        }
        if ( $division ) {
            $where[]  = 'h.division_played = %s';
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
                h.id, h.player_id,
                h.division_played, h.team_name,
                h.finish_position, h.championship_result,
                h.was_captain, h.was_alternate, h.was_emergency_goalie,
                h.skill_tier_reported, h.sandbagging_flag,
                h.games_scheduled, h.games_attended, h.no_show_count,
                h.committee_notes, h.import_source,
                s.season_year,
                p.first_name, p.last_name, p.email
             FROM {$wpdb->prefix}grsh_player_history h
             JOIN {$wpdb->prefix}grsh_seasons s ON s.id = h.season_id
             JOIN {$wpdb->prefix}grsh_players  p ON p.id = h.player_id
             WHERE {$where_sql}
             ORDER BY s.season_year DESC, p.last_name ASC
             LIMIT %d OFFSET %d",
            ...[...$params, $per_page, $offset]
        ), ARRAY_A ) ?: [];

        // Cast booleans so JS receives true/false not "0"/"1" ── FIX
        $records = array_map( function ( $r ) {
            $r['season_year']      = (int) $r['season_year'];
            $r['was_captain']      = (bool) (int) $r['was_captain'];
            $r['was_alternate']    = (bool) (int) $r['was_alternate'];
            $r['sandbagging_flag'] = (bool) (int) $r['sandbagging_flag'];
            $r['games_scheduled']  = $r['games_scheduled'] !== null ? (int) $r['games_scheduled'] : null;
            $r['games_attended']   = $r['games_attended']  !== null ? (int) $r['games_attended']  : null;
            $r['no_show_count']    = (int) ( $r['no_show_count'] ?? 0 );
            return $r;
        }, $records );

        return new WP_REST_Response( [
            'records'     => $records,
            'total'       => $total,
            'page'        => $page,
            'per_page'    => $per_page,
            'total_pages' => (int) ceil( $total / max( 1, $per_page ) ),
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

        $this->update_player_reliability( (int) $record->player_id );

        return new WP_REST_Response( [ 'success' => true, 'deleted' => $id ], 200 );
    }

    // -------------------------------------------------------------------------
    // REST: Delete ALL records (clear all history)
    // Called by DELETE /grsh/v1/history/records from the React "Clear all history" button
    // -------------------------------------------------------------------------

    public function rest_delete_all_records(): WP_REST_Response {
        global $wpdb;

        $count = (int) $wpdb->get_var(
            "SELECT COUNT(*) FROM {$wpdb->prefix}grsh_player_history"
        );

        $wpdb->query( "TRUNCATE TABLE {$wpdb->prefix}grsh_player_history" );
        $wpdb->query( "TRUNCATE TABLE {$wpdb->prefix}grsh_import_logs" );

        // Reset per-player reliability stats derived from history
        $wpdb->query(
            "UPDATE {$wpdb->prefix}grsh_players
             SET attendance_rating = NULL, no_show_count = 0"
        );

        return new WP_REST_Response( [
            'success' => true,
            'deleted' => $count,
            'message' => "{$count} record" . ( $count !== 1 ? 's' : '' ) . ' deleted.',
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
            if ( empty( array_filter( $line ) ) ) {
                continue;
            }

            if ( $headers === null ) {
                $headers = array_map(
                    fn( $h ) => strtolower( trim( str_replace( ' ', '_', $h ) ) ),
                    $line
                );
                continue;
            }

            while ( count( $line ) < count( $headers ) ) {
                $line[] = '';
            }

            $row    = array_combine( $headers, array_slice( $line, 0, count( $headers ) ) );
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

        foreach ( self::COLUMN_MAP as $col => $config ) {
            if ( $config['required'] && empty( $row[ $col ] ) ) {
                $errors[] = "Line {$line}: Missing required field '{$col}'.";
            }
        }

        if ( ! empty( $row['email'] ) && ! is_email( $row['email'] ) ) {
            $errors[] = "Line {$line}: Invalid email '{$row['email']}'.";
        }

        if ( ! empty( $row['season_year'] ) ) {
            $year = (int) $row['season_year'];
            if ( $year < 2000 || $year > 2100 ) {
                $errors[] = "Line {$line}: season_year '{$row['season_year']}' is not a valid year (2000–2100).";
            }
        }

        if ( ! empty( $row['division_played'] ) ) {
            $div = strtolower( trim( $row['division_played'] ) );
            if ( ! in_array( $div, self::VALID_DIVISIONS, true ) ) {
                $errors[] = "Line {$line}: division_played '{$row['division_played']}' not valid. Accepted: " . implode( ', ', self::VALID_DIVISIONS ) . ". Check spelling and case.";
            }
        }

        if ( ! empty( $row['championship_result'] ) ) {
            $champ = strtolower( trim( $row['championship_result'] ) );
            if ( ! in_array( $champ, self::VALID_CHAMP_RESULTS, true ) ) {
                $errors[] = "Line {$line}: championship_result '{$row['championship_result']}' not valid. Accepted: " . implode( ', ', self::VALID_CHAMP_RESULTS );
            }
        }

        if ( ! empty( $row['games_attended'] ) && ! empty( $row['games_scheduled'] ) ) {
            if ( (int) $row['games_attended'] > (int) $row['games_scheduled'] ) {
                $warnings[] = "Line {$line}: games_attended ({$row['games_attended']}) > games_scheduled ({$row['games_scheduled']}) — values may be transposed.";
            }
        }

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

    private function resolve_player( array $row ): ?int {
        global $wpdb;

        $email = sanitize_email( $row['email'] );

        $player_id = $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}grsh_players WHERE email = %s LIMIT 1",
            $email
        ) );

        if ( $player_id ) {
            return (int) $player_id;
        }

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
            'finish_position'      => ( isset( $row['finish_position'] ) && $row['finish_position'] !== '' ) ? (int) $row['finish_position'] : null,
            'championship_result'  => strtolower( sanitize_text_field( $row['championship_result'] ?? 'none' ) ) ?: 'none',
            'was_captain'          => $this->parse_bool( $row['was_captain']          ?? '0' ),
            'was_alternate'        => $this->parse_bool( $row['was_alternate']         ?? '0' ),
            'was_emergency_goalie' => $this->parse_bool( $row['was_emergency_goalie']  ?? '0' ),
            'skill_tier_reported'  => sanitize_text_field( $row['skill_tier_reported'] ?? '' ) ?: null,
            'sandbagging_flag'     => $this->parse_bool( $row['sandbagging_flag']      ?? '0' ),
            'games_scheduled'      => ( isset( $row['games_scheduled'] ) && $row['games_scheduled'] !== '' ) ? (int) $row['games_scheduled'] : null,
            'games_attended'       => ( isset( $row['games_attended']  ) && $row['games_attended']  !== '' ) ? (int) $row['games_attended']  : null,
            'no_show_count'        => (int) ( $row['no_show_count'] ?? 0 ),
            'committee_notes'      => sanitize_textarea_field( $row['committee_notes'] ?? '' ) ?: null,
            'import_source'        => 'csv',
        ];
    }

    private function build_history_format(): array {
        return [
            '%d', '%d',             // player_id, season_id
            '%s', '%s', '%d', '%s', // division, team, finish, championship
            '%d', '%d', '%d',       // was_captain, was_alternate, was_emergency_goalie
            '%s', '%d',             // skill_tier, sandbagging_flag
            '%d', '%d', '%d',       // games_scheduled, games_attended, no_show_count
            '%s', '%s',             // committee_notes, import_source
        ];
    }

    // -------------------------------------------------------------------------
    // Reliability recalculation
    // -------------------------------------------------------------------------

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

        $rating = round( ( (float) $stats->total_attended / (float) $stats->total_scheduled ) * 100, 2 );

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
        return in_array( strtolower( (string) $value ), [ '1', 'true', 'yes', 'y' ], true ) ? 1 : 0;
    }

    // -------------------------------------------------------------------------
    // Import log — dedicated table, zero dependency on grsh_audit_logs schema
    // -------------------------------------------------------------------------

    /**
     * Ensure the grsh_import_logs table exists.
     *
     * Uses dbDelta so it is safe to call on every import — it only creates
     * the table if missing, never drops or truncates existing data.
     * Called lazily from log_import() and rest_get_import_logs() so no
     * activation hook or plugin update is required.
     */
    private function ensure_import_log_table(): void {
        global $wpdb;

        $table   = "{$wpdb->prefix}grsh_import_logs";
        $charset = $wpdb->get_charset_collate();

        // Quick bail if table already exists — avoids dbDelta overhead
        if ( $wpdb->get_var( "SHOW TABLES LIKE '{$table}'" ) === $table ) {
            return;
        }

        $sql = "CREATE TABLE {$table} (
            id           bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            wp_user_id   bigint(20) UNSIGNED NOT NULL DEFAULT 0,
            user_display varchar(255)        NOT NULL DEFAULT '',
            filename     varchar(255)        NOT NULL DEFAULT '',
            imported     int(11)             NOT NULL DEFAULT 0,
            updated      int(11)             NOT NULL DEFAULT 0,
            skipped      int(11)             NOT NULL DEFAULT 0,
            total        int(11)             NOT NULL DEFAULT 0,
            errors       longtext            NOT NULL,
            warnings     longtext            NOT NULL,
            notes        text                NOT NULL,
            created_at   datetime            NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id)
        ) {$charset};";

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta( $sql );
    }

    /**
     * Persist one import session to grsh_import_logs.
     *
     * Writes to a self-managed table (not grsh_audit_logs) so there is
     * no dependency on the plugin installer's schema for that table.
     * The table is created lazily via ensure_import_log_table() if absent.
     */
    private function log_import(
        int    $imported,
        int    $skipped,
        int    $updated,
        int    $total,
        string $filename,
        array  $errors   = [],
        array  $warnings = []
    ): void {
        global $wpdb;

        $this->ensure_import_log_table();

        $table = "{$wpdb->prefix}grsh_import_logs";

        $result = $wpdb->insert(
            $table,
            [
                'wp_user_id'   => get_current_user_id(),
                'user_display' => wp_get_current_user()->display_name ?: 'system',
                'filename'     => $filename,
                'imported'     => $imported,
                'updated'      => $updated,
                'skipped'      => $skipped,
                'total'        => $total,
                'errors'       => wp_json_encode( array_values( $errors ) ),
                'warnings'     => wp_json_encode( array_values( $warnings ) ),
                'notes'        => "CSV '{$filename}': {$imported} inserted, {$updated} updated, {$skipped} skipped of {$total} rows.",
            ],
            [ '%d', '%s', '%s', '%d', '%d', '%d', '%d', '%s', '%s', '%s' ]
        );

        // If insert failed, fall back to wp_options so the log is never lost
        if ( $result === false ) {
            $fallback = get_option( 'grsh_import_logs_fallback', [] );
            array_unshift( $fallback, [
                'id'        => time(),
                'user'      => wp_get_current_user()->display_name ?: 'system',
                'filename'  => $filename,
                'imported'  => $imported,
                'updated'   => $updated,
                'skipped'   => $skipped,
                'total'     => $total,
                'errors'    => $errors,
                'warnings'  => $warnings,
                'notes'     => "CSV '{$filename}': {$imported} inserted, {$updated} updated, {$skipped} skipped of {$total} rows.",
                'timestamp' => current_time( 'mysql' ),
            ] );
            update_option( 'grsh_import_logs_fallback', array_slice( $fallback, 0, 50 ), false );
        }
    }

    /**
     * REST: Get import logs.
     *
     * Reads from grsh_import_logs (primary) with automatic fallback to
     * the wp_options emergency store if the table doesn't exist yet.
     * Called by the Import Log tab in HistoryImport.jsx via
     * GET /grsh/v1/history/import-logs
     */
    public function rest_get_import_logs( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;

        $limit = min( 50, max( 1, (int) $request->get_param( 'limit' ) ) );

        $this->ensure_import_log_table();

        $table = "{$wpdb->prefix}grsh_import_logs";

        // Primary: dedicated table
        $rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT id, wp_user_id, user_display, filename,
                    imported, updated, skipped, total,
                    errors, warnings, notes, created_at
             FROM {$table}
             ORDER BY id DESC
             LIMIT %d",
            $limit
        ), ARRAY_A );

        if ( is_array( $rows ) && count( $rows ) > 0 ) {
            $result = array_map( function ( $row ) {
                return [
                    'id'        => (int) $row['id'],
                    'user'      => $row['user_display'],
                    'filename'  => $row['filename'],
                    'imported'  => (int) $row['imported'],
                    'updated'   => (int) $row['updated'],
                    'skipped'   => (int) $row['skipped'],
                    'total'     => (int) $row['total'],
                    'errors'    => json_decode( $row['errors'],   true ) ?: [],
                    'warnings'  => json_decode( $row['warnings'], true ) ?: [],
                    'notes'     => $row['notes'],
                    'timestamp' => $row['created_at'],
                ];
            }, $rows );

            return new WP_REST_Response( $result, 200 );
        }

        // Fallback: wp_options store (used if table insert ever failed)
        $fallback = get_option( 'grsh_import_logs_fallback', [] );
        if ( ! empty( $fallback ) ) {
            return new WP_REST_Response( array_slice( $fallback, 0, $limit ), 200 );
        }

        return new WP_REST_Response( [], 200 );
    }
}
