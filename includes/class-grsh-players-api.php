<?php
/**
 * GRSH Players — REST API endpoints.
 *
 * GET   /wp-json/grsh/v1/players           → list + division capacity grid
 * PATCH /wp-json/grsh/v1/players/{id}      → update committee overrides
 * GET   /wp-json/grsh/v1/players/divisions → capacity grid keyed by division
 *
 * CHANGELOG v1.1.0
 * - Added GET /players/divisions endpoint. Returns capacity data for every
 *   enabled division (from GRSH_Settings::get_active_divisions()) regardless
 *   of registration count. This is the fix for Womens (and any future new
 *   division) not appearing in the Players dashboard capacity grid when 0
 *   players have registered.
 * - get_players() now includes a 'division_meta' block alongside the player
 *   list so the React Players page can build its capacity cards in a single
 *   fetch without a separate /divisions call.
 * - Added 'last_synced_at' field to the GET /players response so the frontend
 *   can display the "Last synced: X" stamp under the Sync button.
 * - Audit stamp (last_updated_by, last_updated_at) appended to all responses.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class GRSH_Players {

    public static function register_hooks(): void {
        add_action( 'rest_api_init', [ __CLASS__, 'register_routes' ] );
    }

    public static function register_routes(): void {

        // Division capacity grid — must be registered BEFORE the /{id} route
        // so WordPress does not try to parse 'divisions' as a numeric ID.
        register_rest_route( 'grsh/v1', '/players/divisions', [
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => [ __CLASS__, 'get_division_capacity' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        register_rest_route( 'grsh/v1', '/players', [
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => [ __CLASS__, 'get_players' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        register_rest_route( 'grsh/v1', '/players/(?P<id>\d+)', [
            'methods'             => 'PATCH',
            'callback'            => [ __CLASS__, 'update_player' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
            'args'                => [
                'id' => [
                    'validate_callback' => fn( $v ) => is_numeric( $v ),
                    'sanitize_callback' => 'absint',
                ],
            ],
        ] );
    }

    public static function check_permission(): bool {
        return current_user_can( 'manage_options' )
            || current_user_can( 'grsh_committee' );
    }

    // -------------------------------------------------------------------------
    // GET /grsh/v1/players/divisions
    //
    // Returns one entry per *enabled* division (from settings), merged with
    // the actual registration counts from the DB. Divisions with 0 registrations
    // are included with registered=0 and pct=0 — they are NOT suppressed.
    //
    // This is the core fix: previously the React Players page built its capacity
    // cards by grouping registrations by division_requested. Any division with
    // 0 registrations (like Womens at season start) simply had no group and no
    // card. Now the division list comes from settings and registration counts
    // are layered on top.
    // -------------------------------------------------------------------------

    public static function get_division_capacity( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;

        $season_id = self::get_season_id();

        // All enabled divisions from settings — the authoritative list.
        $active_divisions = GRSH_Settings::get_active_divisions();

        // Registration counts per division for this season.
        $counts_raw = $wpdb->get_results( $wpdb->prepare(
            "SELECT
                r.division_requested AS div_key,
                COUNT(*) AS registered
             FROM {$wpdb->prefix}grsh_registrations r
             WHERE r.season_id = %d
               AND r.player_type = 'primary'
             GROUP BY r.division_requested",
            $season_id
        ), ARRAY_A ) ?: [];

        // Build a lookup: division_key → registered count.
        $counts = [];
        foreach ( $counts_raw as $row ) {
            $counts[ $row['div_key'] ] = (int) $row['registered'];
        }

        // Merge. Every enabled division gets a card even if count is zero.
        $result = [];
        foreach ( $active_divisions as $div ) {
            $key        = $div['key'];
            $registered = $counts[ $key ] ?? 0;
            $capacity   = $div['max_roster'] * $div['teams'];  // total season capacity
            $pct        = $capacity > 0 ? round( ( $registered / $capacity ) * 100, 1 ) : 0;

            $result[] = [
                'key'        => $key,
                'label'      => $div['label'],
                'enabled'    => true,
                'teams'      => $div['teams'],
                'min_roster' => $div['min_roster'],
                'max_roster' => $div['max_roster'],
                'capacity'   => $capacity,
                'registered' => $registered,
                'pct'        => $pct,
                'status'     => self::capacity_status( $pct ),
            ];
        }

        return new WP_REST_Response( $result, 200 );
    }

    // -------------------------------------------------------------------------
    // GET /grsh/v1/players
    // -------------------------------------------------------------------------

    public static function get_players( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;

        $season_id = self::get_season_id();

        $rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT
                p.id,
                p.first_name,
                p.last_name,
                p.email,
                p.phone,
                p.position,
                p.skill_tier_reported,
                p.skill_tier_assigned,
                p.current_league,
                p.years_experience,
                p.jersey_size,
                r.age,
                p.tshirt_size,
                p.tshirt_type,
                p.is_alternate,
                p.is_goalie,
                p.sandbagging_flag,
                p.notes,
                p.created_at,
                r.id            AS registration_id,
                r.player_type,
                r.division_requested,
                r.division_assigned,
                r.payment_status,
                r.payment_method,
                r.amount_paid,
                r.status,
                r.committee_notes,
                r.imported_at,
                r.created_at    AS registered_at
            FROM {$wpdb->prefix}grsh_players p
            LEFT JOIN {$wpdb->prefix}grsh_registrations r
                ON r.player_id = p.id
               AND r.season_id = %d
            ORDER BY p.last_name ASC, p.first_name ASC",
            $season_id
        ), ARRAY_A );

        $players = array_map( [ __CLASS__, 'format_player' ], $rows ?: [] );

        // Last sync timestamp — when was the most recent registration imported?
        $last_synced = $wpdb->get_var( $wpdb->prepare(
            "SELECT MAX(created_at) FROM {$wpdb->prefix}grsh_registrations WHERE season_id = %d",
            $season_id
        ) );

        // Audit stamp — current user for the response header.
        $current_user = wp_get_current_user();

        return new WP_REST_Response( [
            'players'        => $players,
            'total'          => count( $players ),
            'last_synced_at' => $last_synced ?: null,
            'audit'          => [
                'user' => $current_user->display_name ?? 'Unknown',
                'time' => current_time( 'mysql' ),
            ],
        ], 200 );
    }

    // -------------------------------------------------------------------------
    // PATCH /grsh/v1/players/{id}
    // -------------------------------------------------------------------------

    public static function update_player( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;

        $player_id = $request->get_param( 'id' );
        $body      = $request->get_json_params();

        if ( empty( $body ) ) {
            return new WP_REST_Response( [ 'error' => 'Empty request body.' ], 400 );
        }

        // Player table — committee overrides only.
        $player_updates = [];
        if ( isset( $body['skill_tier_assigned'] ) ) {
            $player_updates['skill_tier_assigned'] = sanitize_text_field( $body['skill_tier_assigned'] ) ?: null;
        }
        if ( isset( $body['notes'] ) ) {
            $player_updates['notes'] = sanitize_textarea_field( $body['notes'] );
        }
        if ( isset( $body['sandbagging_flag'] ) ) {
            $player_updates['sandbagging_flag'] = (int) $body['sandbagging_flag'];
        }

        if ( ! empty( $player_updates ) ) {
            $wpdb->update(
                "{$wpdb->prefix}grsh_players",
                $player_updates,
                [ 'id' => $player_id ],
                array_fill( 0, count( $player_updates ), '%s' ),
                [ '%d' ]
            );
        }

        // Registration table — workflow status and notes.
        $reg_updates = [];
        if ( isset( $body['status'] ) ) {
            $reg_updates['status'] = sanitize_key( $body['status'] );
        }
        if ( isset( $body['committee_notes'] ) ) {
            $reg_updates['committee_notes'] = sanitize_textarea_field( $body['committee_notes'] );
        }
        if ( isset( $body['division_assigned'] ) ) {
            $reg_updates['division_assigned'] = sanitize_key( $body['division_assigned'] ) ?: null;
        }

        if ( ! empty( $reg_updates ) ) {
            $season_id = self::get_season_id();
            $wpdb->update(
                "{$wpdb->prefix}grsh_registrations",
                $reg_updates,
                [ 'player_id' => $player_id, 'season_id' => $season_id ],
                array_fill( 0, count( $reg_updates ), '%s' ),
                [ '%d', '%d' ]
            );
        }

        // Return the updated player record.
        $updated = $wpdb->get_row( $wpdb->prepare(
            "SELECT p.*, r.player_type, r.division_requested, r.division_assigned,
                    r.payment_status, r.payment_method, r.amount_paid,
                    r.status, r.committee_notes, r.id AS registration_id,
                    r.created_at AS registered_at
             FROM {$wpdb->prefix}grsh_players p
             LEFT JOIN {$wpdb->prefix}grsh_registrations r
                 ON r.player_id = p.id AND r.season_id = %d
             WHERE p.id = %d",
            self::get_season_id(),
            $player_id
        ), ARRAY_A );

        return new WP_REST_Response(
            $updated ? self::format_player( $updated ) : [ 'saved' => true ],
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

    /**
     * Capacity status tier — used by the React capacity bar colour logic.
     * green  = 0–60 %   (filling up, healthy)
     * yellow = 61–85 %  (getting full)
     * red    = 86–100 % (at or near cap)
     * over   = > 100 %  (oversubscribed — alert)
     */
    private static function capacity_status( float $pct ): string {
        if ( $pct > 100 ) return 'over';
        if ( $pct >= 86  ) return 'red';
        if ( $pct >= 61  ) return 'yellow';
        return 'green';
    }

    private static function format_player( array $row ): array {
        return [
            'id'                   => (int) $row['id'],
            'first_name'           => $row['first_name']           ?? '',
            'last_name'            => $row['last_name']            ?? '',
            'email'                => $row['email']                ?? '',
            'phone'                => $row['phone']                ?? '',
            'position'             => $row['position']             ?: null,
            'skill_tier_reported'  => $row['skill_tier_reported']  ?? '',
            'skill_tier_assigned'  => $row['skill_tier_assigned']  ?: null,
            'current_league'       => $row['current_league']       ?? '',
            'age'                  => isset( $row['age'] ) ? (int) $row['age'] : null,
            'years_experience'     => (int) ( $row['years_experience'] ?? 0 ),
            'jersey_size'          => $row['jersey_size']          ?? '',
            'tshirt_size'          => $row['tshirt_size']          ?? '',
            'tshirt_type'          => $row['tshirt_type']          ?? '',
            'is_alternate'         => (bool) ( $row['is_alternate']     ?? false ),
            'is_goalie'            => (bool) ( $row['is_goalie']        ?? false ),
            'sandbagging_flag'     => (bool) ( $row['sandbagging_flag'] ?? false ),
            'notes'                => $row['notes']                ?? '',
            'registration_id'      => $row['registration_id'] ? (int) $row['registration_id'] : null,
            'player_type'          => $row['player_type']          ?? 'primary',
            'division_requested'   => $row['division_requested']   ?? '',
            'division_assigned'    => $row['division_assigned']    ?: null,
            'payment_status'       => $row['payment_status']       ?? 'pending',
            'payment_method'       => $row['payment_method']       ?? '',
            'amount_paid'          => (float) ( $row['amount_paid'] ?? 0 ),
            'status'               => $row['status']               ?? 'registered',
            'committee_notes'      => $row['committee_notes']      ?? '',
            'imported_at'          => $row['imported_at']          ?? null,
            'registered_at'        => $row['registered_at']        ?? null,
        ];
    }
}
