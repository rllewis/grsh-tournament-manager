<?php
/**
 * class-grsh-history-api.php
 * REST API routes for the Import History page.
 *
 * 
 * Registers under: /wp-json/grsh/v1/history/...
 *
 * Routes:
 *   GET    /history/stats            — KPI counts for the stats bar
 *   GET    /history/import-log       — list of past import jobs
 *   GET    /history/records          — paginated player history records
 *   POST   /history/import           — upload + write a CSV
 *   DELETE /history/records          — clear all history records
 *   POST   /history/import-log/{id}/undo — undo a specific import job
 *
 * DB tables expected:
 *   {prefix}grsh_player_history      — one row per player per season
 *   {prefix}grsh_import_jobs         — one row per CSV import run
 *
 * To activate: add the following to your main plugin file:
 *   require_once plugin_dir_path(__FILE__) . 'includes/class-grsh-history-api.php';
 *   add_action('rest_api_init', ['GRSH_History_API', 'register_routes']);
 *   add_action('admin_init',    ['GRSH_History_API', 'maybe_create_tables']);
 */

if ( ! defined( 'ABSPATH' ) ) exit;

class GRSH_History_API {

    const NAMESPACE  = 'grsh/v1';
    const HISTORY_TBL = 'grsh_player_history';
    const JOBS_TBL    = 'grsh_import_jobs';

    // ── Table creation ────────────────────────────────────────────
    public static function maybe_create_tables() {
        global $wpdb;
        $c = $wpdb->get_charset_collate();
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        dbDelta( "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}" . self::HISTORY_TBL . " (
            id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            import_job_id        BIGINT UNSIGNED DEFAULT NULL,
            first_name           VARCHAR(100) NOT NULL,
            last_name            VARCHAR(100) NOT NULL,
            email                VARCHAR(200) NOT NULL,
            season_year          SMALLINT UNSIGNED NOT NULL,
            division_played      VARCHAR(50)  NOT NULL,
            skill_tier_reported  VARCHAR(10)  DEFAULT NULL,
            team_name            VARCHAR(200) DEFAULT NULL,
            championship_result  VARCHAR(30)  DEFAULT 'none',
            was_captain          TINYINT(1)   DEFAULT 0,
            was_alternate        TINYINT(1)   DEFAULT 0,
            games_scheduled      TINYINT UNSIGNED DEFAULT NULL,
            games_attended       TINYINT UNSIGNED DEFAULT NULL,
            no_show_count        TINYINT UNSIGNED DEFAULT 0,
            finish_position      TINYINT UNSIGNED DEFAULT NULL,
            sandbagging_flag     TINYINT(1)   DEFAULT 0,
            created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY email (email),
            KEY season_year (season_year),
            KEY division_played (division_played),
            KEY import_job_id (import_job_id)
        ) $c;" );

        dbDelta( "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}" . self::JOBS_TBL . " (
            id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            filename      VARCHAR(255) NOT NULL,
            rows_imported INT DEFAULT 0,
            rows_skipped  INT DEFAULT 0,
            errors        INT DEFAULT 0,
            mode          VARCHAR(20) DEFAULT 'append',
            imported_by   VARCHAR(200) DEFAULT '',
            timestamp     DATETIME DEFAULT CURRENT_TIMESTAMP,
            undone        TINYINT(1) DEFAULT 0,
            PRIMARY KEY (id)
        ) $c;" );
    }

    // ── Bootstrap hook (matches pattern used by other GRSH classes) ─
    public static function register_routes_on_init(): void {
        add_action( 'rest_api_init', [ __CLASS__, 'register_routes' ] );
        add_action( 'admin_init',    [ __CLASS__, 'maybe_create_tables' ] );
    }

    // ── Route registration ────────────────────────────────────────
    public static function register_routes() {
        $ns = self::NAMESPACE;

        // GET /history/stats
        register_rest_route( $ns, '/history/stats', [
            'methods'             => 'GET',
            'callback'            => [ __CLASS__, 'get_stats' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        // GET /history/import-log
        register_rest_route( $ns, '/history/import-log', [
            'methods'             => 'GET',
            'callback'            => [ __CLASS__, 'get_import_log' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        // GET /history/records
        register_rest_route( $ns, '/history/records', [
            'methods'             => 'GET',
            'callback'            => [ __CLASS__, 'get_records' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        // DELETE /history/records  ← the one that was 404-ing
        register_rest_route( $ns, '/history/records', [
            'methods'             => 'DELETE',
            'callback'            => [ __CLASS__, 'delete_all_records' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        // POST /history/import
        register_rest_route( $ns, '/history/import', [
            'methods'             => 'POST',
            'callback'            => [ __CLASS__, 'handle_import' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        // POST /history/import-log/{id}/undo
        register_rest_route( $ns, '/history/import-log/(?P<id>\d+)/undo', [
            'methods'             => 'POST',
            'callback'            => [ __CLASS__, 'undo_import' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
            'args'                => [
                'id' => [ 'required' => true, 'type' => 'integer', 'minimum' => 1 ],
            ],
        ] );
    }

    // ── Permission check ──────────────────────────────────────────
    public static function check_permission( WP_REST_Request $req ) {
        return current_user_can( 'manage_options' );
    }

    // ── GET /history/stats ────────────────────────────────────────
    public static function get_stats( WP_REST_Request $req ) {
        global $wpdb;
        $ht = $wpdb->prefix . self::HISTORY_TBL;

        $total      = (int) $wpdb->get_var( "SELECT COUNT(*) FROM $ht" );
        $champions  = (int) $wpdb->get_var( "SELECT COUNT(*) FROM $ht WHERE championship_result = 'winner'" );
        $sandbagging= (int) $wpdb->get_var( "SELECT COUNT(*) FROM $ht WHERE sandbagging_flag = 1" );
        $no_shows   = (int) $wpdb->get_var( "SELECT COUNT(*) FROM $ht WHERE no_show_count > 0" );
        $seasons    = $wpdb->get_col( "SELECT DISTINCT season_year FROM $ht ORDER BY season_year DESC" );

        return rest_ensure_response( [
            'total_records' => $total,
            'champions'     => $champions,
            'sandbagging'   => $sandbagging,
            'no_shows'      => $no_shows,
            'seasons'       => array_map( 'intval', $seasons ),
        ] );
    }

    // ── GET /history/import-log ───────────────────────────────────
    public static function get_import_log( WP_REST_Request $req ) {
        global $wpdb;
        $jt   = $wpdb->prefix . self::JOBS_TBL;
        $jobs = $wpdb->get_results(
            "SELECT * FROM $jt WHERE undone = 0 ORDER BY timestamp DESC LIMIT 50"
        );

        $now = time();
        return rest_ensure_response( array_map( function( $job ) use ( $now ) {
            $ts      = strtotime( $job->timestamp );
            $age_min = ( $now - $ts ) / 60;
            return [
                'id'           => (int) $job->id,
                'filename'     => $job->filename,
                'rows_imported'=> (int) $job->rows_imported,
                'rows_skipped' => (int) $job->rows_skipped,
                'errors'       => (int) $job->errors,
                'mode'         => $job->mode,
                'imported_by'  => $job->imported_by,
                'timestamp'    => date( 'M j, Y g:ia', $ts ),
                // Undo window: 10 minutes
                'canUndo'      => $age_min < 10,
            ];
        }, $jobs ?: [] ) );
    }

    // ── GET /history/records ──────────────────────────────────────
    public static function get_records( WP_REST_Request $req ) {
        global $wpdb;
        $ht       = $wpdb->prefix . self::HISTORY_TBL;
        $page     = max( 1, (int) $req->get_param('page') );
        $per_page = max( 1, min( 100, (int) ( $req->get_param('per_page') ?: 20 ) ) );
        $offset   = ( $page - 1 ) * $per_page;

        $where  = '1=1';
        $params = [];

        if ( $div = sanitize_text_field( $req->get_param('division') ) ) {
            $where   .= ' AND division_played = %s';
            $params[] = $div;
        }
        if ( $yr = (int) $req->get_param('season_year') ) {
            $where   .= ' AND season_year = %d';
            $params[] = $yr;
        }
        if ( $job = (int) $req->get_param('job_id') ) {
            $where   .= ' AND import_job_id = %d';
            $params[] = $job;
        }

        $sql_where = $params ? $wpdb->prepare( $where, ...$params ) : $where;

        $total   = (int) $wpdb->get_var( "SELECT COUNT(*) FROM $ht WHERE $sql_where" );
        $records = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM $ht WHERE $sql_where ORDER BY season_year DESC, last_name ASC LIMIT %d OFFSET %d",
                $per_page, $offset
            )
        );

        return rest_ensure_response( [
            'records' => $records ?: [],
            'total'   => $total,
            'page'    => $page,
            'pages'   => (int) ceil( $total / $per_page ),
        ] );
    }

    // ── DELETE /history/records  ←  THE FIX ──────────────────────
    public static function delete_all_records( WP_REST_Request $req ) {
        global $wpdb;
        $ht = $wpdb->prefix . self::HISTORY_TBL;
        $jt = $wpdb->prefix . self::JOBS_TBL;

        // Count before delete so we can return how many were removed
        $count = (int) $wpdb->get_var( "SELECT COUNT(*) FROM $ht" );

        // Truncate is faster than DELETE for full-table clear;
        // use DELETE if you need to preserve AUTO_INCREMENT state.
        $result_h = $wpdb->query( "TRUNCATE TABLE $ht" );
        $result_j = $wpdb->query( "TRUNCATE TABLE $jt" );

        if ( $result_h === false || $result_j === false ) {
            return new WP_Error(
                'delete_failed',
                'Database error: ' . $wpdb->last_error,
                [ 'status' => 500 ]
            );
        }

        return rest_ensure_response( [
            'success'  => true,
            'deleted'  => $count,
            'message'  => "$count record" . ( $count !== 1 ? 's' : '' ) . " deleted.",
        ] );
    }

    // ── POST /history/import ──────────────────────────────────────
    public static function handle_import( WP_REST_Request $req ) {
        global $wpdb;
        $ht = $wpdb->prefix . self::HISTORY_TBL;
        $jt = $wpdb->prefix . self::JOBS_TBL;

        $files = $req->get_file_params();
        if ( empty( $files['csv']['tmp_name'] ) ) {
            return new WP_Error( 'no_file', 'No CSV file received.', [ 'status' => 400 ] );
        }

        $tmp      = $files['csv']['tmp_name'];
        $filename = sanitize_file_name( $files['csv']['name'] );
        $mode     = in_array( $req->get_param('import_mode'), ['append','upsert'], true )
                    ? $req->get_param('import_mode') : 'append';
        $col_map  = json_decode( $req->get_param('col_map') ?: '{}', true ) ?: [];

        // Parse CSV
        $handle = fopen( $tmp, 'r' );
        if ( ! $handle ) {
            return new WP_Error( 'read_error', 'Could not read uploaded file.', [ 'status' => 400 ] );
        }

        $headers = fgetcsv( $handle );
        if ( ! $headers ) {
            fclose( $handle );
            return new WP_Error( 'empty_csv', 'CSV file appears empty.', [ 'status' => 400 ] );
        }

        // Normalise headers using col_map
        $headers = array_map( function( $h ) use ( $col_map ) {
            $h = trim( $h, " \t\n\r\0\x0B\"" );
            return $col_map[ $h ] ?? $h;
        }, $headers );

        $imported = 0;
        $skipped  = 0;
        $errors   = [];
        $row_num  = 1;
        $current_user = wp_get_current_user();

        $REQUIRED = [ 'first_name','last_name','email','season_year','division_played' ];
        $VALID_DIVISIONS = [ 'gold_open','45a','senior_b','senior_c','womens' ];
        $VALID_TIERS     = [ 'A1','A2','A3','B1','B2','B3','C1','C2','R1','R2','R3' ];
        $VALID_RESULTS   = [ 'winner','runner_up','participant','none' ];

        while ( ( $row = fgetcsv( $handle ) ) !== false ) {
            $row_num++;
            if ( count( $row ) < 2 ) { $skipped++; continue; }

            $data = [];
            foreach ( $headers as $i => $col ) {
                $data[ $col ] = isset( $row[ $i ] ) ? trim( $row[ $i ] ) : '';
            }

            // Required field validation
            $row_errors = [];
            foreach ( $REQUIRED as $f ) {
                if ( empty( $data[ $f ] ) ) $row_errors[] = "Missing required field: $f";
            }
            if ( ! empty( $data['email'] ) && ! is_email( $data['email'] ) ) {
                $row_errors[] = "Invalid email: {$data['email']}";
            }
            if ( ! empty( $data['division_played'] ) && ! in_array( $data['division_played'], $VALID_DIVISIONS, true ) ) {
                $row_errors[] = "Unknown division: {$data['division_played']}";
            }

            if ( ! empty( $row_errors ) ) {
                foreach ( $row_errors as $e ) {
                    $errors[] = [ 'row' => $row_num, 'field' => '', 'message' => $e ];
                }
                $skipped++;
                continue;
            }

            // Upsert / append check
            if ( $mode === 'append' ) {
                $exists = $wpdb->get_var( $wpdb->prepare(
                    "SELECT id FROM $ht WHERE email=%s AND season_year=%d AND division_played=%s LIMIT 1",
                    $data['email'], (int)$data['season_year'], $data['division_played']
                ) );
                if ( $exists ) { $skipped++; continue; }
            }

            // Sandbagging flag: tier is A or B but division is senior_b or senior_c
            $tier = strtoupper( trim( $data['skill_tier_reported'] ?? '' ) );
            $div  = $data['division_played'] ?? '';
            $sandbagging = (
                in_array( $div, ['senior_b','senior_c'], true ) &&
                in_array( $tier[0] ?? '', ['A','B'], true )
            ) ? 1 : 0;

            $insert = [
                'import_job_id'       => 0, // filled after job row created
                'first_name'          => sanitize_text_field( $data['first_name'] ),
                'last_name'           => sanitize_text_field( $data['last_name'] ),
                'email'               => sanitize_email( $data['email'] ),
                'season_year'         => (int) $data['season_year'],
                'division_played'     => sanitize_text_field( $div ),
                'skill_tier_reported' => in_array( $tier, $VALID_TIERS, true ) ? $tier : null,
                'team_name'           => sanitize_text_field( $data['team_name'] ?? '' ) ?: null,
                'championship_result' => in_array( $data['championship_result']??'', $VALID_RESULTS, true )
                                         ? $data['championship_result'] : 'none',
                'was_captain'         => self::parse_bool( $data['was_captain'] ?? '' ),
                'was_alternate'       => self::parse_bool( $data['was_alternate'] ?? '' ),
                'games_scheduled'     => is_numeric( $data['games_scheduled'] ?? '' ) ? (int)$data['games_scheduled'] : null,
                'games_attended'      => is_numeric( $data['games_attended'] ?? '' )  ? (int)$data['games_attended']  : null,
                'no_show_count'       => (int)( $data['no_show_count'] ?? 0 ),
                'finish_position'     => is_numeric( $data['finish_position'] ?? '' ) ? (int)$data['finish_position'] : null,
                'sandbagging_flag'    => $sandbagging,
            ];

            if ( $mode === 'upsert' ) {
                $existing_id = $wpdb->get_var( $wpdb->prepare(
                    "SELECT id FROM $ht WHERE email=%s AND season_year=%d AND division_played=%s LIMIT 1",
                    $insert['email'], $insert['season_year'], $insert['division_played']
                ) );
                if ( $existing_id ) {
                    $wpdb->update( $ht, $insert, [ 'id' => $existing_id ] );
                    $imported++;
                    continue;
                }
            }

            if ( $wpdb->insert( $ht, $insert ) ) {
                $imported++;
            } else {
                $errors[] = [ 'row' => $row_num, 'field' => 'db', 'message' => $wpdb->last_error ];
                $skipped++;
            }
        }
        fclose( $handle );

        // Create job record
        $wpdb->insert( $jt, [
            'filename'      => $filename,
            'rows_imported' => $imported,
            'rows_skipped'  => $skipped,
            'errors'        => count( $errors ),
            'mode'          => $mode,
            'imported_by'   => $current_user->display_name,
        ] );
        $job_id = (int) $wpdb->insert_id;

        // Back-fill job_id on inserted rows (those without one)
        if ( $job_id && $imported > 0 ) {
            $wpdb->query( $wpdb->prepare(
                "UPDATE $ht SET import_job_id = %d WHERE import_job_id = 0 ORDER BY id DESC LIMIT %d",
                $job_id, $imported
            ) );
        }

        return rest_ensure_response( [
            'success'  => $imported > 0,
            'job_id'   => $job_id,
            'total'    => $imported + $skipped,
            'imported' => $imported,
            'skipped'  => $skipped,
            'errors'   => $errors,
            'warnings' => [],
            'message'  => $imported > 0
                ? "Imported $imported row" . ( $imported !== 1 ? 's' : '' ) . "."
                : "Nothing was imported — check errors below.",
        ] );
    }

    // ── POST /history/import-log/{id}/undo ───────────────────────
    public static function undo_import( WP_REST_Request $req ) {
        global $wpdb;
        $ht     = $wpdb->prefix . self::HISTORY_TBL;
        $jt     = $wpdb->prefix . self::JOBS_TBL;
        $job_id = (int) $req->get_param('id');

        $job = $wpdb->get_row( $wpdb->prepare(
            "SELECT * FROM $jt WHERE id=%d AND undone=0", $job_id
        ) );

        if ( ! $job ) {
            return new WP_Error(
                'not_found',
                'Import job not found or already undone.',
                [ 'status' => 404 ]
            );
        }

        // Check 10-minute undo window
        $age_min = ( time() - strtotime( $job->timestamp ) ) / 60;
        if ( $age_min > 10 ) {
            return new WP_Error(
                'undo_expired',
                'Undo window has expired (10 minutes). Records cannot be removed.',
                [ 'status' => 403 ]
            );
        }

        $deleted = $wpdb->query( $wpdb->prepare(
            "DELETE FROM $ht WHERE import_job_id = %d", $job_id
        ) );

        $wpdb->update( $jt, [ 'undone' => 1 ], [ 'id' => $job_id ] );

        return rest_ensure_response( [
            'success' => true,
            'deleted' => (int) $deleted,
            'message' => "Import #$job_id undone. $deleted record" . ( $deleted !== 1 ? 's' : '' ) . " removed.",
        ] );
    }

    // ── Helpers ───────────────────────────────────────────────────
    private static function parse_bool( string $v ): int {
        return in_array( strtolower( trim($v) ), ['1','yes','true','y'], true ) ? 1 : 0;
    }
}
