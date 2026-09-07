<?php
/**
 * GRSH Alternates — REST API endpoints.
 *
 * GET   /wp-json/grsh/v1/alternates                → list all subs/alternates
 * PATCH /wp-json/grsh/v1/alternates/{id}/activate  → log an activation
 *
 * FIXES (v3):
 *  1. Duplicate guard  — 409 if same player/team/division/game_date already in log
 *  2. Sanitized inputs — all body params cleaned before DB use
 *  3. Returns log_id   — real DB insert_id sent back so React uses server id
 *  4. game_date field  — body key corrected from 'date' → 'game_date'
 *  5. Column names     — corrected to match actual wp_grsh_audit_logs schema:
 *                        'player_id' → 'wp_user_id', added 'object_type'/'object_id'
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

class GRSH_Alternates {

    public static function register_hooks(): void {
        add_action( 'rest_api_init', [ __CLASS__, 'register_routes' ] );
    }

    public static function register_routes(): void {
        $ns = 'grsh/v1';

        register_rest_route( $ns, '/alternates', [
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => [ __CLASS__, 'get_alternates' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        register_rest_route( $ns, '/alternates/(?P<id>\d+)/activate', [
            'methods'             => 'PATCH',
            'callback'            => [ __CLASS__, 'activate_alternate' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );
    }

    public static function check_permission(): bool {
        return current_user_can( 'manage_options' ) || current_user_can( 'grsh_committee' );
    }

    // -------------------------------------------------------------------------
    // GET /alternates
    // -------------------------------------------------------------------------
    public static function get_alternates( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $season_id = self::get_season_id();

        $rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT
                p.id, p.first_name, p.last_name, p.email, p.phone,
                p.position, p.skill_tier_reported, p.skill_tier_assigned,
                p.jersey_size, p.notes, p.sandbagging_flag,
                r.id AS registration_id, r.age, r.payment_status,
                r.player_type, r.division_requested, r.status,
                a.available_days, a.max_games_per_day, a.late_game_available,
                a.division_eligibility, a.times_activated, a.last_activated_at
             FROM {$wpdb->prefix}grsh_players p
             JOIN {$wpdb->prefix}grsh_registrations r
                  ON r.player_id = p.id AND r.season_id = %d
             LEFT JOIN {$wpdb->prefix}grsh_availability a
                  ON a.player_id = p.id AND a.season_id = %d
             WHERE p.is_alternate = 1
             ORDER BY a.times_activated DESC, p.last_name ASC",
            $season_id, $season_id
        ), ARRAY_A ) ?: [];

        $alternates = array_map( function( $row ) {
            $avail_days = $row['available_days']
                ? ( json_decode( $row['available_days'], true ) ?: [] ) : [];
            $div_elig   = $row['division_eligibility']
                ? ( json_decode( $row['division_eligibility'], true ) ?: [] ) : [];

            return [
                'id'                   => (int) $row['id'],
                'first_name'           => $row['first_name'],
                'last_name'            => $row['last_name'],
                'email'                => $row['email'],
                'phone'                => $row['phone'] ?? '',
                'position'             => $row['position']             ?: null,
                'skill_tier_reported'  => $row['skill_tier_reported']  ?? '',
                'skill_tier_assigned'  => $row['skill_tier_assigned']  ?: null,
                'jersey_size'          => $row['jersey_size']          ?? '',
                'notes'                => $row['notes']                ?? '',
                'sandbagging_flag'     => (bool) $row['sandbagging_flag'],
                'age'                  => $row['age'] ? (int) $row['age'] : null,
                'payment_status'       => $row['payment_status']       ?? 'waived',
                'player_type'          => $row['player_type']          ?? 'sub',
                'division_requested'   => $row['division_requested']   ?? '',
                'status'               => $row['status']               ?? 'approved',
                'is_alternate'         => true,
                'available_days'       => $avail_days,
                'max_games_per_day'    => $row['max_games_per_day'] ? (int) $row['max_games_per_day'] : 1,
                'late_game_available'  => (bool) ( $row['late_game_available'] ?? false ),
                'division_eligibility' => $div_elig,
                'times_activated'      => (int) ( $row['times_activated'] ?? 0 ),
                'last_activated_at'    => $row['last_activated_at'] ?: null,
                'registration_id'      => (int) $row['registration_id'],
            ];
        }, $rows );

        return new WP_REST_Response( $alternates, 200 );
    }

    // -------------------------------------------------------------------------
    // PATCH /alternates/{id}/activate
    // -------------------------------------------------------------------------
    public static function activate_alternate( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;

        $player_id = (int) $request->get_param( 'id' );
        $body      = $request->get_json_params();
        $season_id = self::get_season_id();

        // ── Sanitize all inputs ───────────────────────────────────────────────
        $team      = sanitize_text_field( $body['team']      ?? '' );
        $division  = sanitize_key(        $body['division']  ?? '' );
        $game_date = sanitize_text_field( $body['game_date'] ?? '' );
        $reason    = sanitize_text_field( $body['reason']    ?? '' );
        $notes     = sanitize_text_field( $body['notes']     ?? '' );

        // ── Require minimum fields ────────────────────────────────────────────
        if ( ! $player_id || ! $team || ! $division || ! $game_date ) {
            return new WP_REST_Response(
                [ 'activated' => false, 'error' => 'Missing required fields: team, division, game_date' ],
                400
            );
        }

        // ── DUPLICATE GUARD ───────────────────────────────────────────────────
        // Uses actual column names from wp_grsh_audit_logs:
        //   wp_user_id (not player_id), season_id, action, after_value (JSON)
        $existing_id = $wpdb->get_var( $wpdb->prepare(
            "SELECT id
               FROM {$wpdb->prefix}grsh_audit_logs
              WHERE wp_user_id = %d
                AND season_id  = %d
                AND action     = 'alternate_activated'
                AND JSON_UNQUOTE( JSON_EXTRACT( after_value, '$.date' ) )     = %s
                AND JSON_UNQUOTE( JSON_EXTRACT( after_value, '$.division' ) ) = %s
                AND JSON_UNQUOTE( JSON_EXTRACT( after_value, '$.team' ) )     = %s
              LIMIT 1",
            $player_id,
            $season_id,
            $game_date,
            $division,
            $team
        ) );

        if ( $existing_id ) {
            return new WP_REST_Response(
                [
                    'activated' => false,
                    'duplicate' => true,
                    'log_id'    => (int) $existing_id,
                    'message'   => 'Activation already recorded for this player, team, division, and date.',
                ],
                409
            );
        }
        // ─────────────────────────────────────────────────────────────────────

        // ── Increment times_activated in grsh_availability ────────────────────
        $wpdb->query( $wpdb->prepare(
            "UPDATE {$wpdb->prefix}grsh_availability
                SET times_activated   = times_activated + 1,
                    last_activated_at = %s
              WHERE player_id = %d
                AND season_id = %d",
            current_time( 'mysql' ),
            $player_id,
            $season_id
        ) );

        // ── Insert audit log row ──────────────────────────────────────────────
        // Column names match confirmed wp_grsh_audit_logs schema:
        //   wp_user_id, season_id, action, object_type, object_id,
        //   notes, after_value, (ip_address and created_at auto-fill)
        $inserted = $wpdb->insert(
            "{$wpdb->prefix}grsh_audit_logs",
            [
                'season_id'   => $season_id,
                'wp_user_id'  => $player_id,
                'action'      => 'alternate_activated',
                'object_type' => 'registration',
                'object_id'   => $player_id,
                'notes'       => $notes,
                'after_value' => wp_json_encode( [
                    'team'     => $team,
                    'division' => $division,
                    'date'     => $game_date,
                    'reason'   => $reason,
                ] ),
            ]
        );

        if ( ! $inserted ) {
            return new WP_REST_Response(
                [ 'activated' => false, 'error' => 'Database insert failed.' ],
                500
            );
        }

        $log_id = (int) $wpdb->insert_id;

        return new WP_REST_Response(
            [
                'activated' => true,
                'log_id'    => $log_id,
                'player_id' => $player_id,
            ],
            200
        );
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------
    private static function get_season_id(): int {
        global $wpdb;
        static $id = null;
        if ( $id === null ) {
            $id = (int) $wpdb->get_var( $wpdb->prepare(
                "SELECT id FROM {$wpdb->prefix}grsh_seasons WHERE season_year = %d LIMIT 1",
                GRSH_Sync_Engine::SEASON
            ) );
        }
        return $id ?: 1;
    }
}
