<?php
/**
 * Gold Rush Senior Hockey — Historical Player Import Engine
 * Plugin: GRSH Tournament Manager
 * Developer: Tech Tribe Consulting
 *
 * Handles importing player history from prior seasons via CSV upload.
 *
 * REST endpoints:
 *   POST   /grsh/v1/history/import                  — upload a CSV. dry_run=1 checks it and writes nothing.
 *   GET    /grsh/v1/history/template                — download blank CSV template
 *   GET    /grsh/v1/history/stats                   — stat cards, coverage map, last import
 *   GET    /grsh/v1/history/records                 — history rows (filters: season_year, division, q, job_id)
 *   GET    /grsh/v1/history/import-logs             — one entry per import, with undo state
 *   POST   /grsh/v1/history/import-logs/{id}/undo   — undo the most recent import (restores old values)
 *   DELETE /grsh/v1/history/records/{id}            — remove a history record
 *   DELETE /grsh/v1/history/records                 — clear all history
 *
 * Import options: import_mode = append (default; existing records are kept) | upsert (existing records are updated,
 * blank cells keep the stored value); on_error = skip (default; bad rows are skipped) | stop (nothing is written
 * if any row is bad).
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

    /** History columns an import may write (everything except the ids and the source marker). */
    const WRITE_COLS = [
        'division_played' => '%s', 'team_name' => '%s', 'finish_position' => '%d', 'championship_result' => '%s',
        'was_captain' => '%d', 'was_alternate' => '%d', 'was_emergency_goalie' => '%d', 'skill_tier_reported' => '%s',
        'sandbagging_flag' => '%d', 'games_scheduled' => '%d', 'games_attended' => '%d', 'no_show_count' => '%d',
        'committee_notes' => '%s',
    ];

    /** Common header spellings → canonical column (used when a file is sent without the page's own mapping). */
    const HEADER_ALIASES = [
        'firstname' => 'first_name', 'fname' => 'first_name', 'given_name' => 'first_name', 'first' => 'first_name',
        'lastname' => 'last_name', 'lname' => 'last_name', 'surname' => 'last_name', 'family_name' => 'last_name', 'last' => 'last_name',
        'email_address' => 'email', 'emailaddress' => 'email', 'e_mail' => 'email', 'e-mail' => 'email',
        'season' => 'season_year', 'year' => 'season_year', 'season_yr' => 'season_year',
        'division' => 'division_played', 'div' => 'division_played', 'division_name' => 'division_played',
        'tier' => 'skill_tier_reported', 'skill_tier' => 'skill_tier_reported', 'level' => 'skill_tier_reported',
        'team' => 'team_name', 'team_colour' => 'team_name', 'team_color' => 'team_name',
        'championship' => 'championship_result', 'result' => 'championship_result',
        'captain' => 'was_captain', 'is_captain' => 'was_captain',
        'alternate' => 'was_alternate', 'is_alternate' => 'was_alternate', 'is_sub' => 'was_alternate', 'sub' => 'was_alternate',
        'scheduled' => 'games_scheduled', 'total_games' => 'games_scheduled',
        'attended' => 'games_attended', 'games_played' => 'games_attended',
        'no_shows' => 'no_show_count', 'noshows' => 'no_show_count', 'missed' => 'no_show_count',
        'notes' => 'committee_notes', 'finish' => 'finish_position',
    ];

    const VALID_DIVISIONS = [
        'gold_open', '45a', 'senior_b', 'senior_c', 'womens',
    ];

    const VALID_CHAMP_RESULTS = [
        'winner', 'runner_up', 'participant', 'none',
    ];

    const MAX_BYTES = 5242880; // 5 MB, same limit the page shows
    const MAX_ROW_DETAIL = 2000;

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
                'q'           => [ 'sanitize_callback' => 'sanitize_text_field' ],
                'job_id'      => [ 'sanitize_callback' => 'absint' ],
                'page'        => [ 'sanitize_callback' => 'absint', 'default' => 1 ],
                'per_page'    => [ 'sanitize_callback' => 'absint', 'default' => 50 ],
            ],
        ] );

        register_rest_route( 'grsh/v1', '/history/import-logs', [
            'methods'             => 'GET',
            'callback'            => [ $this, 'rest_get_import_logs' ],
            'permission_callback' => [ $this, 'rest_permission_check' ],
            'args'                => [
                'limit' => [ 'sanitize_callback' => 'absint', 'default' => 20 ],
            ],
        ] );

        register_rest_route( 'grsh/v1', '/history/import-logs/(?P<id>\d+)/undo', [
            'methods'             => 'POST',
            'callback'            => [ $this, 'rest_undo_import' ],
            'permission_callback' => [ $this, 'rest_permission_check' ],
        ] );

        register_rest_route( 'grsh/v1', '/history/records/(?P<id>\d+)', [
            'methods'             => 'DELETE',
            'callback'            => [ $this, 'rest_delete_record' ],
            'permission_callback' => [ $this, 'rest_permission_check' ],
            'args'                => [
                'id' => [
                    'validate_callback' => function ( $v ) { return is_numeric( $v ); },
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
    // REST: Import CSV (dry_run=1 checks the file and writes nothing)
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

        if ( isset( $file['size'] ) && (int) $file['size'] > self::MAX_BYTES ) {
            return new WP_REST_Response( [ 'success' => false, 'message' => 'File is larger than 5 MB.' ], 413 );
        }

        $mode   = $request->get_param( 'import_mode' ) === 'upsert' ? 'upsert' : 'append';
        $policy = $request->get_param( 'on_error' ) === 'stop' ? 'stop' : 'skip';
        $dry    = in_array( strtolower( (string) $request->get_param( 'dry_run' ) ), [ '1', 'true', 'yes' ], true );

        $parsed = $this->parse_csv( $file['tmp_name'] );
        $rows   = $parsed['rows'];

        if ( empty( $rows ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'message' => 'CSV file is empty or could not be parsed.',
            ], 400 );
        }

        $header_check = $this->validate_headers( $parsed['headers'] );
        if ( ! empty( $header_check['missing'] ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'message' => 'CSV is missing required columns: ' . implode( ', ', $header_check['missing'] ),
                'missing' => $header_check['missing'],
            ], 400 );
        }

        global $wpdb;
        if ( ! $dry ) {
            $wpdb->query( 'START TRANSACTION' );
        }

        try {
            $r = $this->process_rows( $rows, $parsed['headers'], $mode, $dry, $policy );

            $job_id = null;
            if ( ! $dry ) {
                $wpdb->query( 'COMMIT' );
                if ( empty( $r['blocked'] ) ) {
                    $job_id = $this->log_import( $r, $mode, basename( $file['name'] ) );
                }
            }

            $errors = []; $warnings = [];
            foreach ( $r['issues'] as $x ) {
                $txt = ( $x['line'] ? 'Line ' . $x['line'] . ': ' : '' ) . $x['message'];
                if ( $x['level'] === 'error' )   { $errors[]   = $txt; }
                if ( $x['level'] === 'warning' ) { $warnings[] = $txt; }
            }

            $blocked = ! empty( $r['blocked'] );

            return new WP_REST_Response( [
                'success'         => ! $blocked,
                'dry_run'         => $dry,
                'blocked'         => $blocked,
                'message'         => $blocked ? 'Nothing was imported: ' . count( $errors ) . ' problem' . ( count( $errors ) === 1 ? '' : 's' ) . ' found and "stop on error" is on.' : '',
                'job_id'          => $job_id,
                'mode'            => $mode,
                'total'           => $r['total'],
                'imported'        => $r['imported'],
                'updated'         => $r['updated'],
                'unchanged'       => $r['unchanged'],
                'skipped'         => $r['skipped'],
                'new_players'     => $r['new_players'],
                'matched_players' => $r['matched_players'],
                'new_seasons'     => array_values( $r['new_seasons'] ),
                'tier_warnings'   => $r['tier_warnings'],
                'no_show_players' => $r['no_show_players'],
                'warnings'        => $warnings,
                'errors'          => $errors,
                'issues'          => array_slice( $r['issues'], 0, 3000 ),
                'rows'            => $dry ? $r['rows'] : [],
                'rows_truncated'  => $r['rows_truncated'],
            ], 200 );

        } catch ( Exception $e ) {
            if ( ! $dry ) { $wpdb->query( 'ROLLBACK' ); }
            return new WP_REST_Response( [
                'success' => false,
                'message' => 'Import failed: ' . $e->getMessage(),
            ], 500 );
        }
    }

    // -------------------------------------------------------------------------
    // Row processing — one code path for the dry run and the real import, so the
    // check always predicts what the import will do.
    // -------------------------------------------------------------------------

    private function process_rows( array $rows, array $present_headers, string $mode, bool $dry, string $policy ): array {
        global $wpdb;

        $out = [
            'total' => count( $rows ), 'imported' => 0, 'updated' => 0, 'unchanged' => 0, 'skipped' => 0,
            'new_players' => 0, 'matched_players' => 0, 'new_seasons' => [], 'tier_warnings' => 0, 'no_show_players' => 0,
            'issues' => [], 'rows' => [], 'rows_truncated' => false, 'blocked' => false, 'snapshot' => [
                'inserted' => [], 'updated' => [], 'players' => [], 'seasons' => [], 'affected' => [],
            ],
        ];
        $snap =& $out['snapshot'];
        $hist = "{$wpdb->prefix}grsh_player_history";

        // Pass 1 — validate every row.
        $prepared = []; $bad = 0;
        foreach ( $rows as $i => $raw ) {
            $line  = $i + 2;
            $row   = $this->normalise_row( $raw );
            $found = $this->check_row( $row );
            $has_err = false;
            foreach ( $found as $x ) { if ( $x['level'] === 'error' ) { $has_err = true; } }
            if ( $has_err ) { $bad++; }
            $prepared[] = [ 'line' => $line, 'row' => $row, 'issues' => $found, 'bad' => $has_err ];
        }
        $out['blocked'] = ( $policy === 'stop' && $bad > 0 );
        $write = ! $dry && ! $out['blocked'];

        $seen = []; $pending_players = []; $matched_seen = []; $noshow_seen = [];

        foreach ( $prepared as $p ) {
            $line = $p['line']; $row = $p['row'];
            $res = [ 'line' => $line, 'name' => trim( ( $row['first_name'] ?? '' ) . ' ' . ( $row['last_name'] ?? '' ) ), 'email' => $row['email'] ?? '',
                     'season_year' => $row['season_year'] ?? '', 'division' => $row['division_played'] ?? '', 'action' => 'skip', 'player' => '',
                     'note' => '', 'changes' => (object) [], 'lookalike' => null ];

            foreach ( $p['issues'] as $x ) { $out['issues'][] = [ 'line' => $line, 'level' => $x['level'], 'field' => $x['field'], 'message' => $x['message'] ]; }

            if ( $p['bad'] ) {
                $res['action'] = 'error'; $res['note'] = $out['blocked'] ? 'Not imported (stop on error is on).' : 'Skipped: this row has a problem.';
                $out['skipped']++;
                $this->push_row( $out, $res );
                continue;
            }
            if ( $out['blocked'] ) {
                $res['note'] = 'Not imported (stop on error is on).'; $out['skipped']++;
                $this->push_row( $out, $res );
                continue;
            }

            foreach ( $p['issues'] as $x ) { if ( $x['field'] === 'skill_tier_reported' && strpos( $x['message'], 'Possible sandbagging' ) === 0 ) { $out['tier_warnings']++; } }

            $email = strtolower( sanitize_email( $row['email'] ) );
            $year  = (int) $row['season_year'];
            $key   = $email . '|' . $year;

            if ( isset( $seen[ $key ] ) ) {
                $res['note'] = 'Same player and season as row ' . $seen[ $key ] . ' in this file; this row is skipped.';
                $out['issues'][] = [ 'line' => $line, 'level' => 'warning', 'field' => 'email', 'message' => $res['note'] ];
                $out['skipped']++;
                $this->push_row( $out, $res );
                continue;
            }
            $seen[ $key ] = $line;

            // Player: matched by email, or new (with a look-alike warning).
            $player = $this->find_player( $email );
            $player_id = null;
            if ( $player ) {
                $player_id = (int) $player['id'];
                $res['player'] = 'matched';
                if ( ! isset( $matched_seen[ $email ] ) ) { $matched_seen[ $email ] = true; $out['matched_players']++; }
                if ( strtolower( trim( $player['last_name'] ) ) !== strtolower( trim( $row['last_name'] ) ) ) {
                    $m = "This email belongs to {$player['first_name']} {$player['last_name']} but the file says {$row['first_name']} {$row['last_name']}.";
                    $out['issues'][] = [ 'line' => $line, 'level' => 'warning', 'field' => 'last_name', 'message' => $m ];
                    $res['note'] = $m;
                }
            } elseif ( isset( $pending_players[ $email ] ) ) {
                $res['player'] = 'new';
            } else {
                $res['player'] = 'new';
                $look = $this->find_lookalike( $row, $email );
                if ( $look ) {
                    $res['lookalike'] = $look;
                    $m = "No player has this email, but {$look['name']} ({$look['email']}) is on file. Typo or a new address?";
                    $out['issues'][] = [ 'line' => $line, 'level' => 'warning', 'field' => 'email', 'message' => $m ];
                    $res['note'] = $m;
                }
                $out['new_players']++;
                if ( $write ) {
                    $player_id = $this->create_player( $row, $email );
                    if ( ! $player_id ) {
                        $out['issues'][] = [ 'line' => $line, 'level' => 'error', 'field' => 'email', 'message' => 'Could not create the player; row skipped.' ];
                        $res['action'] = 'error'; $res['note'] = 'Could not create the player.'; $out['skipped']++; $out['new_players']--;
                        $this->push_row( $out, $res );
                        continue;
                    }
                    $snap['players'][] = $player_id;
                } else {
                    $pending_players[ $email ] = true;
                }
            }

            // Season.
            $season_id = $this->find_season( $year );
            if ( ! $season_id ) {
                $out['new_seasons'][ $year ] = $year;
                if ( $write ) { $season_id = $this->create_season( $year ); $snap['seasons'][] = $season_id; }
            }

            // Existing record for this player + season?
            $existing = ( $player_id && $season_id ) ? $wpdb->get_row( $wpdb->prepare(
                "SELECT * FROM {$hist} WHERE player_id = %d AND season_id = %d LIMIT 1", $player_id, $season_id ), ARRAY_A ) : null;

            if ( $existing && $mode === 'append' ) {
                $res['action'] = 'skip';
                $res['note'] = ( $res['note'] ? $res['note'] . ' ' : '' ) . "Already on record for {$year}; kept as is.";
                $out['skipped']++;
                $this->push_row( $out, $res );
                continue;
            }

            if ( $existing ) {
                $new = $this->build_columns( $row, $present_headers, true );
                $changes = []; $apply = [];
                foreach ( $new as $col => $val ) {
                    $old = $existing[ $col ] ?? null;
                    if ( (string) $old !== (string) $val ) { $changes[ $col ] = [ $old, $val ]; $apply[ $col ] = $val; }
                }
                if ( ! $changes ) {
                    $res['action'] = 'unchanged'; $res['note'] = ( $res['note'] ? $res['note'] . ' ' : '' ) . 'Matches what is already stored.';
                    $out['unchanged']++;
                    $this->push_row( $out, $res );
                    continue;
                }
                $res['action'] = 'update'; $res['changes'] = $changes;
                if ( $write ) {
                    $before = []; foreach ( $changes as $c => $pair ) { $before[ $c ] = $pair[0]; }
                    $fmt = []; foreach ( $apply as $c => $_v ) { $fmt[] = self::WRITE_COLS[ $c ]; }
                    $wpdb->update( $hist, $apply, [ 'id' => (int) $existing['id'] ], $fmt, [ '%d' ] );
                    $snap['updated'][] = [ 'id' => (int) $existing['id'], 'before' => $before ];
                    $snap['affected'][ $player_id ] = $player_id;
                }
                $out['updated']++;
            } else {
                $res['action'] = 'insert';
                if ( $write ) {
                    $data = $this->build_columns( $row, $present_headers, false );
                    $data['player_id'] = $player_id; $data['season_id'] = $season_id; $data['import_source'] = 'csv';
                    $fmt = [];
                    foreach ( $data as $c => $_v ) { $fmt[] = isset( self::WRITE_COLS[ $c ] ) ? self::WRITE_COLS[ $c ] : ( $c === 'import_source' ? '%s' : '%d' ); }
                    $ok = $wpdb->insert( $hist, $data, $fmt );
                    if ( ! $ok ) {
                        $out['issues'][] = [ 'line' => $line, 'level' => 'error', 'field' => '', 'message' => 'The record could not be saved.' ];
                        $res['action'] = 'error'; $res['note'] = 'The record could not be saved.'; $out['skipped']++;
                        $this->push_row( $out, $res );
                        continue;
                    }
                    $snap['inserted'][] = (int) $wpdb->insert_id;
                    $snap['affected'][ $player_id ] = $player_id;
                }
                $out['imported']++;
            }

            if ( (int) ( $row['no_show_count'] ?? 0 ) > 0 && ! isset( $noshow_seen[ $email ] ) ) { $noshow_seen[ $email ] = true; $out['no_show_players']++; }
            $this->push_row( $out, $res );
        }

        if ( $write ) {
            foreach ( $snap['affected'] as $pid ) { $this->update_player_reliability( (int) $pid ); }
            $snap['affected'] = array_values( $snap['affected'] );
        }
        $snap['affected'] = array_values( $snap['affected'] );

        return $out;
    }

    private function push_row( array &$out, array $res ): void {
        if ( count( $out['rows'] ) >= self::MAX_ROW_DETAIL ) { $out['rows_truncated'] = true; return; }
        $out['rows'][] = $res;
    }

    /** Columns to write for one row. On update, only columns present in the file with a non-blank cell (blank keeps the stored value). */
    private function build_columns( array $row, array $present, bool $for_update ): array {
        $data = [];
        foreach ( self::WRITE_COLS as $col => $fmt ) {
            $has = in_array( $col, $present, true );
            $val = isset( $row[ $col ] ) ? $row[ $col ] : '';
            if ( $for_update && ( ! $has || $val === '' ) ) { continue; }
            switch ( $col ) {
                case 'division_played':     $data[ $col ] = $val; break;
                case 'team_name':           $data[ $col ] = sanitize_text_field( $val ) ?: null; break;
                case 'championship_result': $data[ $col ] = $val !== '' ? $val : 'none'; break;
                case 'skill_tier_reported': $data[ $col ] = sanitize_text_field( $val ) ?: null; break;
                case 'committee_notes':     $data[ $col ] = sanitize_textarea_field( $val ) ?: null; break;
                case 'was_captain': case 'was_alternate': case 'was_emergency_goalie': case 'sandbagging_flag':
                    $data[ $col ] = $this->parse_bool( $val ); break;
                case 'no_show_count':       $data[ $col ] = (int) $val; break;
                default:                    $data[ $col ] = $val === '' ? null : (int) $val;
            }
        }
        return $data;
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
    // REST: Stats (cards, coverage map, last import)
    // -------------------------------------------------------------------------

    public function rest_get_stats(): WP_REST_Response {
        global $wpdb;
        $h = "{$wpdb->prefix}grsh_player_history";

        $total = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$h}" );

        $seasons = $wpdb->get_col(
            "SELECT DISTINCT s.season_year
             FROM {$h} h
             JOIN {$wpdb->prefix}grsh_seasons s ON s.id = h.season_id
             ORDER BY s.season_year DESC"
        ) ?: [];

        $one = function ( $where ) use ( $wpdb, $h ) {
            return (int) $wpdb->get_var( "SELECT COUNT(DISTINCT player_id) FROM {$h} WHERE {$where}" );
        };

        $coverage = [];
        $cov_rows = $wpdb->get_results(
            "SELECT s.season_year AS season_year, h.division_played AS division, COUNT(*) AS n
             FROM {$h} h
             JOIN {$wpdb->prefix}grsh_seasons s ON s.id = h.season_id
             GROUP BY s.season_year, h.division_played
             ORDER BY s.season_year DESC", ARRAY_A ) ?: [];
        foreach ( $cov_rows as $c ) {
            $coverage[] = [ 'season_year' => (int) $c['season_year'], 'division' => (string) $c['division'], 'n' => (int) $c['n'] ];
        }

        $jobs = $this->jobs( 1 );

        return new WP_REST_Response( [
            'total'          => $total,
            'total_records'  => $total,
            'players'        => (int) $wpdb->get_var( "SELECT COUNT(DISTINCT player_id) FROM {$h}" ),
            'seasons'        => array_map( 'intval', $seasons ),
            'seasons_count'  => count( $seasons ),
            'champions'      => $one( "championship_result = 'winner'" ),
            'captains'       => $one( 'was_captain = 1' ),
            'sandbagging'    => $one( 'sandbagging_flag = 1' ),
            'no_shows'       => $one( 'no_show_count > 0' ),
            'coverage'       => $coverage,
            'last_import'    => $jobs ? $jobs[0] : null,
        ], 200 );
    }

    // -------------------------------------------------------------------------
    // REST: Get records
    // -------------------------------------------------------------------------

    public function rest_get_records( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;

        $season_year = $request->get_param( 'season_year' );
        $division    = $request->get_param( 'division' );
        $q           = trim( (string) $request->get_param( 'q' ) );
        $job_id      = (int) $request->get_param( 'job_id' );
        $page        = max( 1, (int) $request->get_param( 'page' ) );
        $per_page    = min( 500, max( 1, (int) $request->get_param( 'per_page' ) ) );
        $offset      = ( $page - 1 ) * $per_page;

        $where  = [ '1=1' ];
        $params = [];

        if ( $season_year ) {
            $where[]  = 's.season_year = %d';
            $params[] = (int) $season_year;
        }
        if ( $division ) {
            $where[]  = 'h.division_played = %s';
            $params[] = $division;
        }
        if ( $q !== '' ) {
            foreach ( preg_split( '/\s+/', $q ) as $term ) {
                if ( $term === '' ) { continue; }
                $like = '%' . $wpdb->esc_like( $term ) . '%';
                $where[]  = '(p.first_name LIKE %s OR p.last_name LIKE %s OR p.email LIKE %s)';
                $params[] = $like; $params[] = $like; $params[] = $like;
            }
        }
        if ( $job_id ) {
            $ids = $this->job_row_ids( $job_id );
            $where[] = $ids ? 'h.id IN (' . implode( ',', array_map( 'intval', $ids ) ) . ')' : '1=0';
        }

        $where_sql = implode( ' AND ', $where );
        $hist = "{$wpdb->prefix}grsh_player_history";

        $count_sql = "SELECT COUNT(*)
             FROM {$hist} h
             JOIN {$wpdb->prefix}grsh_seasons s ON s.id = h.season_id
             JOIN {$wpdb->prefix}grsh_players  p ON p.id = h.player_id
             WHERE {$where_sql}";
        $total = (int) $wpdb->get_var( $params ? $wpdb->prepare( $count_sql, ...$params ) : $count_sql );

        $list_sql = "SELECT
                h.id, h.player_id,
                h.division_played, h.team_name,
                h.finish_position, h.championship_result,
                h.was_captain, h.was_alternate, h.was_emergency_goalie,
                h.skill_tier_reported, h.sandbagging_flag,
                h.games_scheduled, h.games_attended, h.no_show_count,
                h.committee_notes, h.import_source,
                s.season_year,
                p.first_name, p.last_name, p.email
             FROM {$hist} h
             JOIN {$wpdb->prefix}grsh_seasons s ON s.id = h.season_id
             JOIN {$wpdb->prefix}grsh_players  p ON p.id = h.player_id
             WHERE {$where_sql}
             ORDER BY s.season_year DESC, p.last_name ASC, p.first_name ASC
             LIMIT %d OFFSET %d";
        $records = $wpdb->get_results( $wpdb->prepare( $list_sql, ...array_merge( $params, [ $per_page, $offset ] ) ), ARRAY_A ) ?: [];

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

        $id = (int) $request->get_param( 'id' );

        $record = $wpdb->get_row( $wpdb->prepare(
            "SELECT h.*, p.email FROM {$wpdb->prefix}grsh_player_history h
             JOIN {$wpdb->prefix}grsh_players p ON p.id = h.player_id
             WHERE h.id = %d",
            $id
        ), ARRAY_A );

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

        $this->update_player_reliability( (int) $record['player_id'] );

        return new WP_REST_Response( [ 'success' => true, 'deleted' => $id ], 200 );
    }

    // -------------------------------------------------------------------------
    // REST: Delete ALL records (clear all history)
    // -------------------------------------------------------------------------

    public function rest_delete_all_records(): WP_REST_Response {
        global $wpdb;
        $h = "{$wpdb->prefix}grsh_player_history";

        $count = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$h}" );
        // Only players that HAD history get their history-derived stats reset; everyone else is left alone.
        $pids = array_map( 'intval', $wpdb->get_col( "SELECT DISTINCT player_id FROM {$h}" ) ?: [] );

        $wpdb->query( "TRUNCATE TABLE {$h}" );
        $wpdb->query( "TRUNCATE TABLE {$wpdb->prefix}grsh_import_logs" );

        if ( $pids ) {
            $wpdb->query(
                "UPDATE {$wpdb->prefix}grsh_players
                 SET attendance_rating = NULL, no_show_count = 0
                 WHERE id IN (" . implode( ',', $pids ) . ')'
            );
        }

        return new WP_REST_Response( [
            'success' => true,
            'deleted' => $count,
            'message' => "{$count} record" . ( $count !== 1 ? 's' : '' ) . ' deleted.',
        ], 200 );
    }

    // -------------------------------------------------------------------------
    // CSV parsing — handles a UTF-8 byte-order mark (Excel "CSV UTF-8"), Windows-1252 files,
    // comma / semicolon / tab separators and quoted fields that contain commas or line breaks.
    // -------------------------------------------------------------------------

    private function parse_csv( string $file_path ): array {
        $raw = @file_get_contents( $file_path );
        if ( $raw === false || $raw === '' ) { return [ 'headers' => [], 'rows' => [] ]; }

        if ( substr( $raw, 0, 3 ) === "\xEF\xBB\xBF" ) { $raw = substr( $raw, 3 ); }
        if ( function_exists( 'mb_check_encoding' ) && ! mb_check_encoding( $raw, 'UTF-8' ) ) {
            $raw = mb_convert_encoding( $raw, 'UTF-8', 'Windows-1252' );
        }

        $first = strtok( $raw, "\n" ) ?: '';
        $delim = ',';
        $best  = substr_count( $first, ',' );
        foreach ( [ ';' => ';', "\t" => "\t" ] as $d ) {
            if ( substr_count( $first, $d ) > $best ) { $best = substr_count( $first, $d ); $delim = $d; }
        }

        $handle = fopen( 'php://temp', 'r+' );
        fwrite( $handle, $raw ); rewind( $handle );

        $rows = []; $headers = null;
        while ( ( $line = fgetcsv( $handle, 0, $delim, '"', '\\' ) ) !== false ) {
            if ( empty( array_filter( $line, function ( $c ) { return trim( (string) $c ) !== ''; } ) ) ) { continue; }

            if ( $headers === null ) {
                $headers = array_map( [ $this, 'canonical_header' ], $line );
                continue;
            }

            while ( count( $line ) < count( $headers ) ) { $line[] = ''; }
            $row = array_combine( $headers, array_slice( $line, 0, count( $headers ) ) );
            $rows[] = array_map( function ( $v ) { return trim( (string) $v ); }, $row );
        }
        fclose( $handle );

        return [ 'headers' => (array) $headers, 'rows' => $rows ];
    }

    private function canonical_header( $h ): string {
        $h = strtolower( trim( str_replace( "\xEF\xBB\xBF", '', (string) $h ) ) );
        $h = preg_replace( '/[\s\-]+/', '_', $h );
        if ( isset( self::COLUMN_MAP[ $h ] ) ) { return $h; }
        return self::HEADER_ALIASES[ $h ] ?? $h;
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

    public static function norm_division( string $v ): string {
        $k = trim( preg_replace( '/[^a-z0-9]+/', '_', strtolower( trim( $v ) ) ), '_' );
        $map = [
            'gold_open' => 'gold_open', 'goldopen' => 'gold_open', 'gold' => 'gold_open', 'open' => 'gold_open',
            '45a' => '45a', '45_a' => '45a', '45_plus_a' => '45a', 'o45_a' => '45a', 'over_45_a' => '45a',
            'senior_b' => 'senior_b', 'seniorb' => 'senior_b', 'sr_b' => 'senior_b',
            'senior_c' => 'senior_c', 'seniorc' => 'senior_c', 'sr_c' => 'senior_c',
            'womens' => 'womens', 'women' => 'womens', 'women_s' => 'womens', 'woman' => 'womens', 'womens_division' => 'womens',
        ];
        return $map[ $k ] ?? $k;
    }

    public static function norm_champ( string $v ): string {
        $k = trim( preg_replace( '/[^a-z0-9]+/', '_', strtolower( trim( $v ) ) ), '_' );
        $map = [
            'winner' => 'winner', 'champion' => 'winner', 'champions' => 'winner', 'won' => 'winner', '1st' => 'winner',
            'runner_up' => 'runner_up', 'runnerup' => 'runner_up', 'finalist' => 'runner_up', '2nd' => 'runner_up', 'second' => 'runner_up',
            'participant' => 'participant', 'played' => 'participant',
            'none' => 'none', 'n_a' => 'none', 'na' => 'none', 'sub' => 'none',
        ];
        return $map[ $k ] ?? ( $k === '' ? '' : $k );
    }

    /** Trim, fix known label spellings (Gold Open → gold_open) and upper-case tiers. */
    private function normalise_row( array $row ): array {
        foreach ( $row as $k => $v ) { $row[ $k ] = trim( (string) $v ); }
        if ( isset( $row['division_played'] ) && $row['division_played'] !== '' ) { $row['division_played'] = self::norm_division( $row['division_played'] ); }
        if ( isset( $row['championship_result'] ) && $row['championship_result'] !== '' ) { $row['championship_result'] = self::norm_champ( $row['championship_result'] ); }
        if ( isset( $row['skill_tier_reported'] ) ) { $row['skill_tier_reported'] = strtoupper( $row['skill_tier_reported'] ); }
        if ( isset( $row['email'] ) ) { $row['email'] = trim( $row['email'] ); }
        return $row;
    }

    /** @return array<int,array{level:string,field:string,message:string}> */
    private function check_row( array $row ): array {
        $out = [];
        $add = function ( $level, $field, $msg ) use ( &$out ) { $out[] = [ 'level' => $level, 'field' => $field, 'message' => $msg ]; };
        $g   = function ( $k ) use ( $row ) { return isset( $row[ $k ] ) ? (string) $row[ $k ] : ''; };

        foreach ( self::COLUMN_MAP as $col => $config ) {
            if ( $config['required'] && $g( $col ) === '' ) { $add( 'error', $col, "Missing required field '{$col}'." ); }
        }

        if ( $g( 'email' ) !== '' && ! is_email( $g( 'email' ) ) ) { $add( 'error', 'email', "Invalid email '{$g('email')}'." ); }

        if ( $g( 'season_year' ) !== '' ) {
            if ( ! preg_match( '/^\d{4}$/', $g( 'season_year' ) ) || (int) $g( 'season_year' ) < 2000 || (int) $g( 'season_year' ) > 2100 ) {
                $add( 'error', 'season_year', "season_year '{$g('season_year')}' must be a 4-digit year between 2000 and 2100." );
            }
        }

        if ( $g( 'division_played' ) !== '' && ! in_array( $g( 'division_played' ), self::VALID_DIVISIONS, true ) ) {
            $add( 'error', 'division_played', "division_played '{$g('division_played')}' is not valid. Accepted: " . implode( ', ', self::VALID_DIVISIONS ) . '.' );
        }

        if ( $g( 'championship_result' ) !== '' && ! in_array( $g( 'championship_result' ), self::VALID_CHAMP_RESULTS, true ) ) {
            $add( 'error', 'championship_result', "championship_result '{$g('championship_result')}' is not valid. Accepted: " . implode( ', ', self::VALID_CHAMP_RESULTS ) . '.' );
        }

        foreach ( [ 'finish_position', 'games_scheduled', 'games_attended', 'no_show_count' ] as $n ) {
            if ( $g( $n ) !== '' && ( ! preg_match( '/^\d+$/', $g( $n ) ) || (int) $g( $n ) > 255 ) ) {
                $add( 'error', $n, "{$n} '{$g($n)}' must be a whole number from 0 to 255." );
            }
        }

        foreach ( [ 'was_captain', 'was_alternate', 'was_emergency_goalie', 'sandbagging_flag' ] as $b ) {
            if ( $g( $b ) !== '' && ! in_array( strtolower( $g( $b ) ), [ '1', '0', 'true', 'false', 'yes', 'no', 'y', 'n' ], true ) ) {
                $add( 'warning', $b, "{$b} '{$g($b)}' is not yes/no or 1/0; it will be saved as no." );
            }
        }

        $tier = $g( 'skill_tier_reported' );
        if ( $tier !== '' && ! preg_match( '/^[ABCR][1-3]$/', $tier ) ) {
            $add( 'warning', 'skill_tier_reported', "Tier '{$tier}' is not one of A1–A3, B1–B3, C1–C3, R1–R3." );
        }

        if ( $g( 'games_attended' ) !== '' && $g( 'games_scheduled' ) !== '' && ctype_digit( $g( 'games_attended' ) ) && ctype_digit( $g( 'games_scheduled' ) ) ) {
            if ( (int) $g( 'games_attended' ) > (int) $g( 'games_scheduled' ) ) {
                $add( 'warning', 'games_attended', "games_attended ({$g('games_attended')}) is more than games_scheduled ({$g('games_scheduled')}); values may be swapped." );
            }
        }

        if ( $tier !== '' && $g( 'division_played' ) !== '' ) {
            if ( in_array( substr( $tier, 0, 1 ), [ 'A', 'B' ], true ) && in_array( $g( 'division_played' ), [ 'senior_b', 'senior_c' ], true ) ) {
                $add( 'warning', 'skill_tier_reported', "Possible sandbagging: tier {$tier} in {$g('division_played')}." );
            }
        }

        return $out;
    }

    // -------------------------------------------------------------------------
    // Players and seasons
    // -------------------------------------------------------------------------

    private function find_player( string $email ): ?array {
        global $wpdb;
        $r = $wpdb->get_row( $wpdb->prepare(
            "SELECT id, first_name, last_name, email FROM {$wpdb->prefix}grsh_players WHERE LOWER(email) = %s LIMIT 1", $email ), ARRAY_A );
        return $r ?: null;
    }

    /** A player with the same last name and the same first initial but a different email. */
    private function find_lookalike( array $row, string $email ): ?array {
        global $wpdb;
        $last  = strtolower( trim( $row['last_name'] ) );
        $first = strtolower( trim( $row['first_name'] ) );
        if ( $last === '' || $first === '' ) { return null; }
        $cands = $wpdb->get_results( $wpdb->prepare(
            "SELECT id, first_name, last_name, email FROM {$wpdb->prefix}grsh_players WHERE LOWER(last_name) = %s LIMIT 10", $last ), ARRAY_A ) ?: [];
        foreach ( $cands as $c ) {
            if ( strtolower( $c['email'] ) === $email ) { continue; }
            if ( strtolower( substr( $c['first_name'], 0, 1 ) ) === substr( $first, 0, 1 ) ) {
                return [ 'id' => (int) $c['id'], 'name' => trim( $c['first_name'] . ' ' . $c['last_name'] ), 'email' => $c['email'] ];
            }
        }
        return null;
    }

    private function create_player( array $row, string $email ): ?int {
        global $wpdb;
        $ok = $wpdb->insert(
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
        return $ok ? (int) $wpdb->insert_id : null;
    }

    private function find_season( int $year ): int {
        global $wpdb;
        return (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}grsh_seasons WHERE season_year = %d LIMIT 1", $year ) );
    }

    private function create_season( int $year ): int {
        global $wpdb;
        $wpdb->insert(
            "{$wpdb->prefix}grsh_seasons",
            [ 'season_year' => $year, 'label' => "Gold Rush {$year}", 'form_id' => 0, 'status' => 'complete' ],
            [ '%d', '%s', '%d', '%s' ]
        );
        return (int) $wpdb->insert_id;
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
        ), ARRAY_A );

        if ( ! $stats || ! $stats['total_scheduled'] ) {
            return;
        }

        $rating = round( ( (float) $stats['total_attended'] / (float) $stats['total_scheduled'] ) * 100, 2 );

        $wpdb->update(
            "{$wpdb->prefix}grsh_players",
            [
                'attendance_rating' => $rating,
                'no_show_count'     => (int) $stats['total_no_shows'],
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
    // Import log — one row per import, with the data needed to undo it
    // -------------------------------------------------------------------------

    private function ensure_import_log_table(): void {
        global $wpdb;

        $table   = "{$wpdb->prefix}grsh_import_logs";
        $charset = $wpdb->get_charset_collate();

        if ( $wpdb->get_var( "SHOW TABLES LIKE '{$table}'" ) !== $table ) {
            $sql = "CREATE TABLE {$table} (
                id           bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
                wp_user_id   bigint(20) UNSIGNED NOT NULL DEFAULT 0,
                user_display varchar(255)        NOT NULL DEFAULT '',
                filename     varchar(255)        NOT NULL DEFAULT '',
                imported     int(11)             NOT NULL DEFAULT 0,
                updated      int(11)             NOT NULL DEFAULT 0,
                unchanged    int(11)             NOT NULL DEFAULT 0,
                skipped      int(11)             NOT NULL DEFAULT 0,
                total        int(11)             NOT NULL DEFAULT 0,
                mode         varchar(20)         NOT NULL DEFAULT 'append',
                errors       longtext            NOT NULL,
                warnings     longtext            NOT NULL,
                notes        text                NOT NULL,
                snapshot     longtext            NULL,
                undone_at    datetime            NULL,
                created_at   datetime            NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id)
            ) {$charset};";
            require_once ABSPATH . 'wp-admin/includes/upgrade.php';
            dbDelta( $sql );
            return;
        }

        // Older installs: add the columns the undo feature needs.
        $adds = [
            'unchanged' => 'int(11) NOT NULL DEFAULT 0',
            'mode'      => "varchar(20) NOT NULL DEFAULT 'append'",
            'snapshot'  => 'longtext NULL',
            'undone_at' => 'datetime NULL',
        ];
        foreach ( $adds as $col => $def ) {
            if ( ! $wpdb->get_var( "SHOW COLUMNS FROM {$table} LIKE '{$col}'" ) ) {
                $wpdb->query( "ALTER TABLE {$table} ADD COLUMN {$col} {$def}" );
            }
        }
    }

    /** @return int|null the job id */
    private function log_import( array $r, string $mode, string $filename ): ?int {
        global $wpdb;

        $this->ensure_import_log_table();
        $table = "{$wpdb->prefix}grsh_import_logs";

        $errors = []; $warnings = [];
        foreach ( $r['issues'] as $x ) {
            $txt = ( $x['line'] ? 'Line ' . $x['line'] . ': ' : '' ) . $x['message'];
            if ( $x['level'] === 'error' )   { $errors[]   = $txt; }
            if ( $x['level'] === 'warning' ) { $warnings[] = $txt; }
        }

        $ok = $wpdb->insert(
            $table,
            [
                'wp_user_id'   => get_current_user_id(),
                'user_display' => wp_get_current_user()->display_name ?: 'system',
                'filename'     => $filename,
                'imported'     => $r['imported'],
                'updated'      => $r['updated'],
                'unchanged'    => $r['unchanged'],
                'skipped'      => $r['skipped'],
                'total'        => $r['total'],
                'mode'         => $mode,
                'errors'       => wp_json_encode( array_slice( $errors, 0, 200 ) ),
                'warnings'     => wp_json_encode( array_slice( $warnings, 0, 200 ) ),
                'notes'        => "CSV '{$filename}': {$r['imported']} added, {$r['updated']} updated, {$r['unchanged']} unchanged, {$r['skipped']} skipped of {$r['total']} rows.",
                // An import that changed nothing is still logged, but has nothing to undo and must not block undoing an earlier one.
                'snapshot'     => ( $r['imported'] + $r['updated'] > 0 ) ? wp_json_encode( $r['snapshot'] ) : null,
                'created_at'   => current_time( 'mysql' ),
            ],
            [ '%d', '%s', '%s', '%d', '%d', '%d', '%d', '%d', '%s', '%s', '%s', '%s', '%s', '%s' ]
        );

        return $ok ? (int) $wpdb->insert_id : null;
    }

    /** Job list, newest first. The newest job that still has undo data and is not undone is the only one that can be undone. */
    private function jobs( int $limit ): array {
        global $wpdb;
        $this->ensure_import_log_table();
        $table = "{$wpdb->prefix}grsh_import_logs";

        $rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT id, user_display, filename, imported, updated, unchanged, skipped, total, mode, errors, warnings, notes, undone_at, created_at,
                    (snapshot IS NOT NULL AND snapshot <> '') AS has_snapshot
             FROM {$table} ORDER BY id DESC LIMIT %d", $limit ), ARRAY_A ) ?: [];

        $latest = (int) $wpdb->get_var(
            "SELECT id FROM {$table} WHERE undone_at IS NULL AND snapshot IS NOT NULL AND snapshot <> '' ORDER BY id DESC LIMIT 1" );

        return array_map( function ( $row ) use ( $latest ) {
            $errs = json_decode( (string) $row['errors'], true ) ?: [];
            $wrns = json_decode( (string) $row['warnings'], true ) ?: [];
            return [
                'id'            => (int) $row['id'],
                'user'          => $row['user_display'],
                'filename'      => $row['filename'],
                'mode'          => $row['mode'] ?: 'append',
                'imported'      => (int) $row['imported'],
                'updated'       => (int) $row['updated'],
                'unchanged'     => (int) $row['unchanged'],
                'skipped'       => (int) $row['skipped'],
                'total'         => (int) $row['total'],
                'errors'        => $errs,
                'warnings'      => $wrns,
                'error_count'   => count( $errs ),
                'warning_count' => count( $wrns ),
                'notes'         => $row['notes'],
                'timestamp'     => $row['created_at'],
                'undone'        => ! empty( $row['undone_at'] ),
                'undone_at'     => $row['undone_at'],
                'has_undo_data' => (bool) $row['has_snapshot'],
                'can_undo'      => ( (int) $row['id'] === $latest ),
            ];
        }, $rows );
    }

    private function job_row_ids( int $job_id ): array {
        global $wpdb;
        $this->ensure_import_log_table();
        $snap = json_decode( (string) $wpdb->get_var( $wpdb->prepare(
            "SELECT snapshot FROM {$wpdb->prefix}grsh_import_logs WHERE id = %d", $job_id ) ), true );
        if ( ! is_array( $snap ) ) { return []; }
        $ids = isset( $snap['inserted'] ) ? (array) $snap['inserted'] : [];
        foreach ( (array) ( $snap['updated'] ?? [] ) as $u ) { $ids[] = (int) $u['id']; }
        return $ids;
    }

    public function rest_get_import_logs( WP_REST_Request $request ): WP_REST_Response {
        $limit = min( 50, max( 1, (int) $request->get_param( 'limit' ) ) );
        return new WP_REST_Response( $this->jobs( $limit ), 200 );
    }

    // -------------------------------------------------------------------------
    // REST: Undo an import (most recent one only)
    // -------------------------------------------------------------------------

    public function rest_undo_import( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $id = (int) $request->get_param( 'id' );
        $this->ensure_import_log_table();
        $logs = "{$wpdb->prefix}grsh_import_logs";
        $hist = "{$wpdb->prefix}grsh_player_history";

        $job = $wpdb->get_row( $wpdb->prepare( "SELECT id, snapshot, undone_at FROM {$logs} WHERE id = %d", $id ), ARRAY_A );
        if ( ! $job ) {
            return new WP_REST_Response( [ 'success' => false, 'message' => 'That import was not found.' ], 404 );
        }
        if ( ! empty( $job['undone_at'] ) ) {
            return new WP_REST_Response( [ 'success' => false, 'message' => 'That import was already undone.' ], 409 );
        }
        $snap = json_decode( (string) $job['snapshot'], true );
        if ( ! is_array( $snap ) ) {
            return new WP_REST_Response( [ 'success' => false, 'message' => 'This import has no undo data (it ran before undo was available).' ], 409 );
        }
        $latest = (int) $wpdb->get_var(
            "SELECT id FROM {$logs} WHERE undone_at IS NULL AND snapshot IS NOT NULL AND snapshot <> '' ORDER BY id DESC LIMIT 1" );
        if ( $latest !== $id ) {
            return new WP_REST_Response( [ 'success' => false,
                'message' => "Only the most recent import can be undone. Undo import #{$latest} first." ], 409 );
        }

        $removed = 0; $restored = 0; $players_removed = 0; $seasons_removed = 0;
        $affected = array_map( 'intval', (array) ( $snap['affected'] ?? [] ) );

        foreach ( (array) ( $snap['inserted'] ?? [] ) as $hid ) {
            $removed += (int) $wpdb->delete( $hist, [ 'id' => (int) $hid ], [ '%d' ] );
        }
        foreach ( (array) ( $snap['updated'] ?? [] ) as $u ) {
            $before = (array) $u['before'];
            $fmt = []; $data = [];
            foreach ( $before as $c => $v ) {
                if ( ! isset( self::WRITE_COLS[ $c ] ) ) { continue; }
                $data[ $c ] = $v; $fmt[] = self::WRITE_COLS[ $c ];
            }
            if ( $data && $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$hist} WHERE id = %d", (int) $u['id'] ) ) ) {
                $wpdb->update( $hist, $data, [ 'id' => (int) $u['id'] ], $fmt, [ '%d' ] );
                $restored++;
            }
        }

        // Remove players this import created, but only if nothing else points at them now.
        foreach ( array_map( 'intval', (array) ( $snap['players'] ?? [] ) ) as $pid ) {
            $has_hist = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$hist} WHERE player_id = %d", $pid ) );
            $has_reg  = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->prefix}grsh_registrations WHERE player_id = %d", $pid ) );
            if ( ! $has_hist && ! $has_reg ) {
                $players_removed += (int) $wpdb->delete( "{$wpdb->prefix}grsh_players", [ 'id' => $pid ], [ '%d' ] );
            }
        }
        foreach ( array_map( 'intval', (array) ( $snap['seasons'] ?? [] ) ) as $sid ) {
            $n  = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$hist} WHERE season_id = %d", $sid ) );
            $n += (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->prefix}grsh_registrations WHERE season_id = %d", $sid ) );
            $n += (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->prefix}grsh_teams WHERE season_id = %d", $sid ) );
            if ( ! $n ) { $seasons_removed += (int) $wpdb->delete( "{$wpdb->prefix}grsh_seasons", [ 'id' => $sid ], [ '%d' ] ); }
        }

        foreach ( $affected as $pid ) { $this->update_player_reliability( $pid ); }

        $wpdb->update( $logs, [ 'undone_at' => current_time( 'mysql' ) ], [ 'id' => $id ], [ '%s' ], [ '%d' ] );

        return new WP_REST_Response( [
            'success'         => true,
            'removed'         => $removed,
            'restored'        => $restored,
            'players_removed' => $players_removed,
            'seasons_removed' => $seasons_removed,
            'message'         => "Import #{$id} undone: {$removed} added record" . ( $removed === 1 ? '' : 's' ) . " removed, {$restored} updated record" . ( $restored === 1 ? '' : 's' ) . ' restored.',
        ], 200 );
    }
}
