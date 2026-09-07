<?php
/**
 * GRSH Rosters — REST API endpoints.
 *
 * GET    /wp-json/grsh/v1/rosters                    → teams + roster members for current season
 * POST   /wp-json/grsh/v1/rosters/teams              → create a new team
 * PATCH  /wp-json/grsh/v1/rosters/teams/{id}         → update team (name, colour, captain)
 * DELETE /wp-json/grsh/v1/rosters/teams/{id}         → delete a team
 * POST   /wp-json/grsh/v1/rosters/assign             → assign player to team
 * DELETE /wp-json/grsh/v1/rosters/assign/{roster_id} → remove player from team
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class GRSH_Rosters {

    public static function register_hooks(): void {
        add_action( 'rest_api_init', [ __CLASS__, 'register_routes' ] );
    }

    public static function register_routes(): void {
        $ns = 'grsh/v1';

        register_rest_route( $ns, '/rosters', [
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => [ __CLASS__, 'get_rosters' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        register_rest_route( $ns, '/rosters/teams', [
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => [ __CLASS__, 'create_team' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        register_rest_route( $ns, '/rosters/teams/(?P<id>\d+)', [
            [
                'methods'             => 'PATCH',
                'callback'            => [ __CLASS__, 'update_team' ],
                'permission_callback' => [ __CLASS__, 'check_permission' ],
            ],
            [
                'methods'             => WP_REST_Server::DELETABLE,
                'callback'            => [ __CLASS__, 'delete_team' ],
                'permission_callback' => [ __CLASS__, 'check_permission' ],
            ],
        ] );

        register_rest_route( $ns, '/rosters/assign', [
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => [ __CLASS__, 'assign_player' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        register_rest_route( $ns, '/rosters/assign/(?P<roster_id>\d+)', [
            'methods'             => WP_REST_Server::DELETABLE,
            'callback'            => [ __CLASS__, 'remove_player' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );
    }

    public static function check_permission(): bool {
        return current_user_can( 'manage_options' )
            || current_user_can( 'grsh_committee' );
    }

    // -------------------------------------------------------------------------
    // GET /rosters — full teams + players
    // -------------------------------------------------------------------------

    public static function get_rosters( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $season_id = self::get_season_id();

        // Teams
        $teams = $wpdb->get_results( $wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}grsh_teams
             WHERE season_id = %d
             ORDER BY draft_order ASC, name ASC",
            $season_id
        ), ARRAY_A ) ?: [];

        // Roster rows with player data for this season
        $roster_rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT
                ro.id            AS roster_id,
                ro.team_id,
                ro.player_id,
                ro.registration_id,
                ro.assignment_type,
                ro.draft_round,
                ro.draft_pick,
                ro.is_captain,
                ro.is_alternate,
                ro.position_assigned,
                ro.skill_tier_at_draft,
                p.first_name,
                p.last_name,
                p.email,
                p.position,
                p.skill_tier_reported,
                p.skill_tier_assigned,
                p.sandbagging_flag,
                p.is_goalie,
                r.age,
                r.payment_status,
                r.player_type,
                r.division_requested
             FROM {$wpdb->prefix}grsh_rosters ro
             JOIN {$wpdb->prefix}grsh_players p  ON p.id  = ro.player_id
             JOIN {$wpdb->prefix}grsh_registrations r
                  ON r.id = ro.registration_id
             WHERE ro.season_id = %d
             ORDER BY ro.team_id ASC, ro.draft_round ASC, ro.draft_pick ASC",
            $season_id
        ), ARRAY_A ) ?: [];

        // Unassigned players — registered this season, not yet on a roster
        $assigned_ids = array_column( $roster_rows, 'player_id' );
        $unassigned = self::get_unassigned_players( $season_id, $assigned_ids );

        // Group roster rows by team
        $players_by_team = [];
        foreach ( $roster_rows as $row ) {
            $players_by_team[ $row['team_id'] ][] = self::format_roster_player( $row );
        }

        $formatted_teams = array_map( function( $team ) use ( $players_by_team ) {
            return [
                'id'                => (int) $team['id'],
                'season_id'         => (int) $team['season_id'],
                'division'          => $team['division'],
                'name'              => $team['name'],
                'colour'            => $team['colour'] ?? '#666666',
                'captain_player_id' => $team['captain_player_id'] ? (int) $team['captain_player_id'] : null,
                'skill_score'       => $team['skill_score'] !== null ? (float) $team['skill_score'] : null,
                'age_score'         => $team['age_score']   !== null ? (float) $team['age_score']   : null,
                'parity_score'      => $team['parity_score'] !== null ? (float) $team['parity_score'] : null,
                'draft_order'       => $team['draft_order'] !== null ? (int) $team['draft_order'] : null,
                'draft_locked'      => (bool) $team['draft_locked'],
                'players'           => $players_by_team[ $team['id'] ] ?? [],
            ];
        }, $teams );

        return new WP_REST_Response( [
            'season_id'  => $season_id,
            'teams'      => $formatted_teams,
            'unassigned' => $unassigned,
        ], 200 );
    }

    // -------------------------------------------------------------------------
    // POST /rosters/teams — create team
    // -------------------------------------------------------------------------

    public static function create_team( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $body      = $request->get_json_params();
        $season_id = self::get_season_id();

        $allowed = [ 'division', 'name', 'colour', 'draft_order' ];
        $data    = array_intersect_key( $body, array_flip( $allowed ) );

        if ( empty( $data['name'] ) ) {
            return new WP_REST_Response( [ 'error' => 'Team name is required.' ], 400 );
        }

        $data['season_id']    = $season_id;
        $data['name']         = sanitize_text_field( $data['name'] );
        $data['colour']       = sanitize_hex_color( $data['colour'] ?? '#666666' ) ?: '#666666';
        $data['division']     = sanitize_key( $data['division'] ?? 'gold_open' );
        $data['draft_locked'] = 0;

        $wpdb->insert( "{$wpdb->prefix}grsh_teams", $data );
        $team_id = (int) $wpdb->insert_id;

        return new WP_REST_Response( [ 'id' => $team_id, 'created' => true ], 201 );
    }

    // -------------------------------------------------------------------------
    // PATCH /rosters/teams/{id}
    // -------------------------------------------------------------------------

    public static function update_team( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $team_id = (int) $request->get_param( 'id' );
        $body    = $request->get_json_params();

        $allowed = [ 'name', 'colour', 'captain_player_id', 'draft_order', 'draft_locked' ];
        $data    = array_intersect_key( $body, array_flip( $allowed ) );

        if ( isset( $data['name'] ) )   $data['name']   = sanitize_text_field( $data['name'] );
        if ( isset( $data['colour'] ) ) $data['colour'] = sanitize_hex_color( $data['colour'] ) ?: '#666666';

        $wpdb->update( "{$wpdb->prefix}grsh_teams", $data, [ 'id' => $team_id ] );
        return new WP_REST_Response( [ 'updated' => true ], 200 );
    }

    // -------------------------------------------------------------------------
    // DELETE /rosters/teams/{id}
    // -------------------------------------------------------------------------

    public static function delete_team( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $team_id   = (int) $request->get_param( 'id' );
        $season_id = self::get_season_id();

        // Remove roster assignments for this team first
        $wpdb->delete( "{$wpdb->prefix}grsh_rosters", [
            'team_id'   => $team_id,
            'season_id' => $season_id,
        ] );
        $wpdb->delete( "{$wpdb->prefix}grsh_teams", [ 'id' => $team_id ] );

        return new WP_REST_Response( [ 'deleted' => true ], 200 );
    }

    // -------------------------------------------------------------------------
    // POST /rosters/assign — assign player to team
    // -------------------------------------------------------------------------

    public static function assign_player( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $body      = $request->get_json_params();
        $season_id = self::get_season_id();

        $player_id       = absint( $body['player_id']       ?? 0 );
        $team_id         = absint( $body['team_id']         ?? 0 );
        $registration_id = absint( $body['registration_id'] ?? 0 );

        if ( ! $player_id || ! $team_id ) {
            return new WP_REST_Response( [ 'error' => 'player_id and team_id are required.' ], 400 );
        }

        // Resolve registration_id if not provided
        if ( ! $registration_id ) {
            $registration_id = (int) $wpdb->get_var( $wpdb->prepare(
                "SELECT id FROM {$wpdb->prefix}grsh_registrations
                 WHERE player_id = %d AND season_id = %d LIMIT 1",
                $player_id, $season_id
            ) );
        }

        // Remove from any existing team first
        $wpdb->delete( "{$wpdb->prefix}grsh_rosters", [
            'player_id' => $player_id,
            'season_id' => $season_id,
        ] );

        $wpdb->insert( "{$wpdb->prefix}grsh_rosters", [
            'season_id'       => $season_id,
            'team_id'         => $team_id,
            'player_id'       => $player_id,
            'registration_id' => $registration_id,
            'assignment_type' => sanitize_key( $body['assignment_type'] ?? 'manual' ),
            'is_captain'      => (int) ( $body['is_captain']  ?? 0 ),
            'is_alternate'    => (int) ( $body['is_alternate'] ?? 0 ),
            'assigned_by'     => get_current_user_id(),
            'assigned_at'     => current_time( 'mysql' ),
        ] );

        return new WP_REST_Response( [ 'roster_id' => (int) $wpdb->insert_id, 'assigned' => true ], 201 );
    }

    // -------------------------------------------------------------------------
    // DELETE /rosters/assign/{roster_id}
    // -------------------------------------------------------------------------

    public static function remove_player( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $roster_id = (int) $request->get_param( 'roster_id' );
        $wpdb->delete( "{$wpdb->prefix}grsh_rosters", [ 'id' => $roster_id ] );
        return new WP_REST_Response( [ 'removed' => true ], 200 );
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

    private static function get_unassigned_players( int $season_id, array $assigned_ids ): array {
        global $wpdb;

        $placeholders = ! empty( $assigned_ids )
            ? 'AND p.id NOT IN (' . implode( ',', array_map( 'absint', $assigned_ids ) ) . ')'
            : '';

        $rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT
                p.id, p.first_name, p.last_name, p.email,
                p.position, p.skill_tier_reported, p.skill_tier_assigned,
                p.sandbagging_flag, p.is_goalie,
                r.age, r.payment_status, r.player_type,
                r.division_requested, r.id AS registration_id
             FROM {$wpdb->prefix}grsh_players p
             JOIN {$wpdb->prefix}grsh_registrations r
                  ON r.player_id = p.id AND r.season_id = %d
             WHERE r.status != 'rejected'
             {$placeholders}
             ORDER BY p.last_name ASC",
            $season_id
        ), ARRAY_A ) ?: [];

        return array_map( function( $row ) {
            return [
                'id'                  => (int) $row['id'],
                'first_name'          => $row['first_name'],
                'last_name'           => $row['last_name'],
                'email'               => $row['email'],
                'position'            => $row['position'] ?: null,
                'skill_tier_reported' => $row['skill_tier_reported'] ?? '',
                'skill_tier_assigned' => $row['skill_tier_assigned'] ?: null,
                'sandbagging_flag'    => (bool) $row['sandbagging_flag'],
                'is_goalie'           => (bool) $row['is_goalie'],
                'age'                 => $row['age'] ? (int) $row['age'] : null,
                'payment_status'      => $row['payment_status'] ?? 'pending',
                'player_type'         => $row['player_type']    ?? 'primary',
                'division_requested'  => $row['division_requested'] ?? '',
                'registration_id'     => (int) $row['registration_id'],
            ];
        }, $rows );
    }

    private static function format_roster_player( array $row ): array {
        return [
            'roster_id'           => (int) $row['roster_id'],
            'id'                  => (int) $row['player_id'],
            'player_id'           => (int) $row['player_id'],
            'registration_id'     => (int) $row['registration_id'],
            'first_name'          => $row['first_name'],
            'last_name'           => $row['last_name'],
            'email'               => $row['email'],
            'position'            => $row['position']            ?: $row['position_assigned'] ?: null,
            'skill_tier_reported' => $row['skill_tier_reported'] ?? '',
            'skill_tier_assigned' => $row['skill_tier_assigned'] ?: $row['skill_tier_at_draft'] ?: null,
            'sandbagging_flag'    => (bool) $row['sandbagging_flag'],
            'is_goalie'           => (bool) $row['is_goalie'],
            'is_captain'          => (bool) $row['is_captain'],
            'is_alternate'        => (bool) $row['is_alternate'],
            'age'                 => $row['age'] ? (int) $row['age'] : null,
            'payment_status'      => $row['payment_status']     ?? 'pending',
            'player_type'         => $row['player_type']        ?? 'primary',
            'division_requested'  => $row['division_requested'] ?? '',
            'assignment_type'     => $row['assignment_type']    ?? 'manual',
            'draft_round'         => $row['draft_round'] ? (int) $row['draft_round'] : null,
            'draft_pick'          => $row['draft_pick']  ? (int) $row['draft_pick']  : null,
        ];
    }
}
