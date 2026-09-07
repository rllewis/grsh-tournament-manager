<?php
/**
 * GRSH Captain Roster — front-end REST API for self-service, full-team
 * (pre-formed team) roster registration. Separate from class-grsh-rosters.php,
 * which is the board-only API for draft-built teams.
 *
 * Every mutating endpoint resolves "my team" server-side from the logged-in
 * WP user — a team_id is never trusted from the request body, so one
 * captain cannot edit another captain's roster.
 *
 * GET    /wp-json/grsh/v1/captain/team                    → my team + setup options
 * POST   /wp-json/grsh/v1/captain/team                    → create my team
 * POST   /wp-json/grsh/v1/captain/team/players             → add a player
 * DELETE /wp-json/grsh/v1/captain/team/players/{roster_id} → remove a player
 * POST   /wp-json/grsh/v1/captain/team/submit               → lock roster for board review
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class GRSH_Captain_Roster {

    public static function register_hooks(): void {
        add_action( 'rest_api_init', [ __CLASS__, 'register_routes' ] );
    }

    public static function register_routes(): void {
        $ns = 'grsh/v1';

        register_rest_route( $ns, '/captain/team', [
            [
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => [ __CLASS__, 'get_team' ],
                'permission_callback' => [ __CLASS__, 'check_permission' ],
            ],
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [ __CLASS__, 'create_team' ],
                'permission_callback' => [ __CLASS__, 'check_permission' ],
            ],
        ] );

        register_rest_route( $ns, '/captain/team/players', [
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => [ __CLASS__, 'add_player' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        register_rest_route( $ns, '/captain/team/players/(?P<roster_id>\d+)', [
            'methods'             => WP_REST_Server::DELETABLE,
            'callback'            => [ __CLASS__, 'remove_player' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        register_rest_route( $ns, '/captain/team/submit', [
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => [ __CLASS__, 'submit_roster' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        register_rest_route( $ns, '/captain/lookup-player', [
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => [ __CLASS__, 'lookup_player' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        register_rest_route( $ns, '/captain/team/share-link', [
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => [ __CLASS__, 'get_share_link' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        // Public, token-gated — not login-gated — so an assistant coach
        // without a WP account can view roster status via the link.
        register_rest_route( $ns, '/captain/share/(?P<team_id>\d+)/(?P<token>[a-f0-9]+)', [
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => [ __CLASS__, 'view_shared_team' ],
            'permission_callback' => '__return_true',
        ] );
    }

    public static function check_permission(): bool {
        return current_user_can( 'grsh_manage_own_roster' ) || current_user_can( 'manage_options' );
    }

    private static function get_season_id(): int {
        global $wpdb;
        static $id = null;
        if ( $id === null ) {
            // Reads the configured season_year from Settings rather than
            // GRSH_Sync_Engine::SEASON, so full-team rosters always track
            // whichever season is actually set in the admin Settings page —
            // not a hardcoded constant tied to the individual-player sync
            // engine, which a different install may not even be using.
            $season_year = (int) ( GRSH_Settings::get()['season_year'] ?? 0 );
            $id = (int) $wpdb->get_var( $wpdb->prepare(
                "SELECT id FROM {$wpdb->prefix}grsh_seasons WHERE season_year = %d LIMIT 1",
                $season_year
            ) );
        }
        return $id ?: 1;
    }

    // -------------------------------------------------------------------------
    // GET /captain/team
    // -------------------------------------------------------------------------

    public static function get_team( WP_REST_Request $request ): WP_REST_Response {
        $season_id = self::get_season_id();
        $team      = self::get_my_team( $season_id );

        return new WP_REST_Response( [
            'team'      => $team ? self::format_team( (int) $team['id'], $season_id ) : null,
            'divisions' => array_map(
                fn( $d ) => [ 'key' => $d['key'], 'label' => $d['label'] ],
                GRSH_Settings::get_active_divisions()
            ),
            'tiers'     => array_map(
                fn( $k, $v ) => [ 'key' => $k, 'label' => $k, 'value' => $v ],
                array_keys( GRSH_Scoring::TIER_VALUES ),
                GRSH_Scoring::TIER_VALUES
            ),
            'min_players' => GRSH_Scoring::FULL_TEAM_MIN_PLAYERS,
            'max_players' => GRSH_Scoring::FULL_TEAM_MAX_PLAYERS,
        ], 200 );
    }

    private static function get_current_player_id(): ?int {
        global $wpdb;
        $user_id = get_current_user_id();
        if ( ! $user_id ) {
            return null;
        }
        $player_id = $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}grsh_players WHERE wp_user_id = %d LIMIT 1",
            $user_id
        ) );
        return $player_id ? (int) $player_id : null;
    }

    private static function get_my_team( int $season_id ): ?array {
        global $wpdb;
        $player_id = self::get_current_player_id();
        if ( ! $player_id ) {
            return null;
        }
        $team = $wpdb->get_row( $wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}grsh_teams
             WHERE season_id = %d AND team_type = 'full_team' AND captain_player_id = %d
             LIMIT 1",
            $season_id, $player_id
        ), ARRAY_A );
        return $team ?: null;
    }

    // -------------------------------------------------------------------------
    // POST /captain/team — create my team
    // -------------------------------------------------------------------------

    public static function create_team( WP_REST_Request $request ): WP_REST_Response {
        $season_id = self::get_season_id();
        $body      = (array) $request->get_json_params();

        $player_id = self::get_or_create_self_player();
        if ( ! $player_id ) {
            return new WP_REST_Response( [ 'error' => 'Could not link your account to a player record.' ], 500 );
        }

        $result = self::create_team_for_player(
            $player_id,
            $season_id,
            (string) ( $body['name'] ?? '' ),
            (string) ( $body['division'] ?? '' )
        );

        if ( isset( $result['error'] ) ) {
            return new WP_REST_Response( [ 'error' => $result['error'] ], $result['status'] ?? 400 );
        }

        return new WP_REST_Response( $result, 201 );
    }

    /**
     * Core team-creation logic, extracted 2026-08-19 so it has exactly
     * one caller-independent implementation. Used by:
     *   - create_team() above (player resolved from the logged-in user)
     *   - GRSH_Captain_Provision (player resolved from a brand-new
     *     account — used by both the admin "Invite a Captain" tool and
     *     the public [grsh_captain_signup] form, since neither has a
     *     logged-in captain yet when this runs)
     * Same validation, same "already has a team" guard, either way —
     * matches the existing add_player_to_team() / remove_player_from_roster()
     * pattern in this file (shared core, never silently diverges by caller).
     *
     * @return array Either the formatted team (success) or
     *               ['error' => string, 'status' => int] (failure).
     */
    public static function create_team_for_player( int $player_id, int $season_id, string $name, string $division ): array {
        global $wpdb;

        $existing_team_id = $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}grsh_teams
             WHERE season_id = %d AND team_type = 'full_team' AND captain_player_id = %d LIMIT 1",
            $season_id, $player_id
        ) );
        if ( $existing_team_id ) {
            // Surface which team, so callers (the admin Invite Captain
            // tool especially) can link straight to it instead of leaving
            // staff to go hunt for it manually. Added 2026-09-01.
            $existing = $wpdb->get_row( $wpdb->prepare(
                "SELECT id, name, division FROM {$wpdb->prefix}grsh_teams WHERE id = %d",
                (int) $existing_team_id
            ), ARRAY_A );
            return [
                'error'         => 'This captain already has a team this season.',
                'status'        => 409,
                'existing_team' => $existing ? [
                    'id'       => (int) $existing['id'],
                    'name'     => (string) $existing['name'],
                    'division' => (string) $existing['division'],
                ] : null,
            ];
        }

        $name     = sanitize_text_field( trim( $name ) );
        $division = sanitize_key( $division );

        if ( ! $name ) {
            return [ 'error' => 'Team name is required.', 'status' => 400 ];
        }
        $valid_divisions = array_column( GRSH_Settings::get_active_divisions(), 'key' );
        if ( ! in_array( $division, $valid_divisions, true ) ) {
            return [ 'error' => 'Choose a valid division.', 'status' => 400 ];
        }

        $wpdb->insert( "{$wpdb->prefix}grsh_teams", [
            'season_id'         => $season_id,
            'division'          => $division,
            'team_type'         => 'full_team',
            'name'              => $name,
            'colour'            => '#666666',
            'captain_player_id' => $player_id,
            'draft_locked'      => 0,
        ] );

        return self::format_team( (int) $wpdb->insert_id, $season_id );
    }

    private static function get_or_create_self_player(): ?int {
        global $wpdb;
        $user = wp_get_current_user();
        if ( ! $user || ! $user->ID ) {
            return null;
        }

        $player_id = $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}grsh_players WHERE wp_user_id = %d", $user->ID
        ) );
        if ( $player_id ) {
            return (int) $player_id;
        }

        // Fall back to matching by email — e.g. they registered individually
        // in a prior season — and link that existing record to this account.
        $player_id = $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}grsh_players WHERE email = %s", $user->user_email
        ) );
        if ( $player_id ) {
            $wpdb->update( "{$wpdb->prefix}grsh_players", [ 'wp_user_id' => $user->ID ], [ 'id' => $player_id ] );
            return (int) $player_id;
        }

        $name_parts = explode( ' ', $user->display_name, 2 );
        $wpdb->insert( "{$wpdb->prefix}grsh_players", [
            'first_name' => $name_parts[0] ?? $user->display_name,
            'last_name'  => $name_parts[1] ?? '',
            'email'      => $user->user_email,
            'wp_user_id' => $user->ID,
        ] );
        return (int) $wpdb->insert_id;
    }

    // -------------------------------------------------------------------------
    // POST /captain/team/players — add a player to my team
    // -------------------------------------------------------------------------

    public static function add_player( WP_REST_Request $request ): WP_REST_Response {
        $season_id = self::get_season_id();
        $team      = self::get_my_team( $season_id );
        if ( ! $team ) {
            return new WP_REST_Response( [ 'error' => 'Set up your team before adding players.' ], 400 );
        }
        return self::add_player_to_team( $team, $season_id, (array) $request->get_json_params() );
    }

    /**
     * Core add-player logic, reused by both the captain-facing endpoint
     * above (team resolved via "my team") and the board-side admin
     * endpoint (team resolved by explicit team_id) — same validation,
     * same duplicate-roster guard, same jersey-conflict handling either
     * way, so behavior never silently diverges between the two callers.
     */
    public static function add_player_to_team( array $team, int $season_id, array $body ): WP_REST_Response {
        global $wpdb;
        $first_name = sanitize_text_field( $body['first_name'] ?? '' );
        $last_name  = sanitize_text_field( $body['last_name']  ?? '' );
        $email      = sanitize_email( $body['email'] ?? '' );
        $position   = sanitize_key( $body['position'] ?? '' );
        $tier       = sanitize_text_field( $body['skill_tier_reported'] ?? '' );
        $years      = absint( $body['years_experience'] ?? 0 );
        $age        = isset( $body['age'] ) && $body['age'] !== '' ? absint( $body['age'] ) : null;
        $jersey     = isset( $body['jersey_number'] ) && $body['jersey_number'] !== ''
                      ? absint( $body['jersey_number'] ) : null;
        $is_captain = ! empty( $body['is_captain'] ) ? 1 : 0;

        if ( ! $first_name || ! $last_name || ! is_email( $email ) ) {
            return new WP_REST_Response( [ 'error' => 'First name, last name, and a valid email are required.' ], 400 );
        }
        if ( ! in_array( $position, [ 'defenseman', 'center', 'winger', 'goaltender' ], true ) ) {
            return new WP_REST_Response( [ 'error' => 'Choose a valid position.' ], 400 );
        }
        if ( ! array_key_exists( $tier, GRSH_Scoring::TIER_VALUES ) ) {
            return new WP_REST_Response( [ 'error' => 'Choose a valid experience tier.' ], 400 );
        }

        $current_count = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->prefix}grsh_rosters WHERE team_id = %d", $team['id']
        ) );
        if ( $current_count >= GRSH_Scoring::FULL_TEAM_MAX_PLAYERS ) {
            return new WP_REST_Response(
                [ 'error' => 'Roster is full (' . GRSH_Scoring::FULL_TEAM_MAX_PLAYERS . ' max).' ], 400
            );
        }

        // Find-or-create the player by email — the system-wide identity key.
        $player_id = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}grsh_players WHERE email = %s", $email
        ) );

        if ( $player_id ) {
            // Duplicate-roster guard: is this person already on a DIFFERENT
            // team this season?
            $existing_team = $wpdb->get_row( $wpdb->prepare(
                "SELECT t.id, t.name FROM {$wpdb->prefix}grsh_rosters ro
                 JOIN {$wpdb->prefix}grsh_teams t ON t.id = ro.team_id
                 WHERE ro.player_id = %d AND ro.season_id = %d",
                $player_id, $season_id
            ), ARRAY_A );
            if ( $existing_team && (int) $existing_team['id'] !== (int) $team['id'] ) {
                return new WP_REST_Response( [
                    'error' => "{$first_name} {$last_name} is already rostered to {$existing_team['name']} this season.",
                ], 409 );
            }

            // Update captain-reported fields only — never touch
            // skill_tier_assigned (committee override) or sandbagging_flag.
            $wpdb->update( "{$wpdb->prefix}grsh_players", [
                'first_name'          => $first_name,
                'last_name'           => $last_name,
                'position'            => $position,
                'skill_tier_reported' => $tier,
                'years_experience'    => $years,
                'is_goalie'           => $position === 'goaltender' ? 1 : 0,
            ], [ 'id' => $player_id ] );
        } else {
            $wpdb->insert( "{$wpdb->prefix}grsh_players", [
                'first_name'          => $first_name,
                'last_name'           => $last_name,
                'email'               => $email,
                'position'            => $position,
                'skill_tier_reported' => $tier,
                'years_experience'    => $years,
                'is_goalie'           => $position === 'goaltender' ? 1 : 0,
            ] );
            $player_id = (int) $wpdb->insert_id;
            if ( ! $player_id ) {
                return new WP_REST_Response(
                    [ 'error' => 'Could not create player record.', 'debug' => $wpdb->last_error ], 500
                );
            }
        }

        // Find-or-create this season's registration row.
        $registration_id = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}grsh_registrations WHERE player_id = %d AND season_id = %d",
            $player_id, $season_id
        ) );
        if ( ! $registration_id ) {
            $wpdb->insert( "{$wpdb->prefix}grsh_registrations", [
                'player_id'          => $player_id,
                'season_id'          => $season_id,
                'form_id'            => null,
                'source'             => 'manual',
                'player_type'        => 'primary',
                'division_requested' => $team['division'],
                'age'                => $age,
                'status'             => 'assigned',
            ] );
            $registration_id = (int) $wpdb->insert_id;
            if ( ! $registration_id ) {
                return new WP_REST_Response(
                    [ 'error' => 'Could not create registration record.', 'debug' => $wpdb->last_error ], 500
                );
            }
        } else {
            $wpdb->update( "{$wpdb->prefix}grsh_registrations",
                [ 'age' => $age, 'status' => 'assigned' ],
                [ 'id' => $registration_id ]
            );
        }

        $inserted = $wpdb->insert( "{$wpdb->prefix}grsh_rosters", [
            'season_id'           => $season_id,
            'team_id'             => $team['id'],
            'player_id'           => $player_id,
            'registration_id'     => $registration_id,
            'assignment_type'     => 'manual',
            'is_captain'          => $is_captain,
            'jersey_number'       => $jersey,
            'position_assigned'   => $position,
            'skill_tier_at_draft' => $tier,
            'assigned_by'         => get_current_user_id(),
            'assigned_at'         => current_time( 'mysql' ),
        ] );

        if ( $inserted === false ) {
            if ( $jersey !== null && str_contains( $wpdb->last_error, 'uq_team_jersey' ) ) {
                return new WP_REST_Response( [ 'error' => "Jersey #{$jersey} is already taken on this roster." ], 409 );
            }
            return new WP_REST_Response(
                [ 'error' => 'Could not add player to roster.', 'debug' => $wpdb->last_error ], 500
            );
        }

        self::recalculate_team_scores( (int) $team['id'] );

        return new WP_REST_Response( self::format_team( (int) $team['id'], $season_id ), 201 );
    }

    // -------------------------------------------------------------------------
    // DELETE /captain/team/players/{roster_id}
    // -------------------------------------------------------------------------

    public static function remove_player( WP_REST_Request $request ): WP_REST_Response {
        $season_id = self::get_season_id();
        $team      = self::get_my_team( $season_id );
        if ( ! $team ) {
            return new WP_REST_Response( [ 'error' => 'No team found.' ], 404 );
        }

        $roster_id = (int) $request->get_param( 'roster_id' );
        if ( ! self::remove_player_from_roster( (int) $team['id'], $roster_id ) ) {
            return new WP_REST_Response( [ 'error' => 'Player not found on your roster.' ], 404 );
        }

        return new WP_REST_Response( self::format_team( (int) $team['id'], $season_id ), 200 );
    }

    /**
     * Core remove logic, reused by the admin endpoint too. Returns false
     * if the roster row doesn't belong to the given team (the caller
     * decides what error message fits its own context).
     */
    public static function remove_player_from_roster( int $team_id, int $roster_id ): bool {
        global $wpdb;
        $owned = $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}grsh_rosters WHERE id = %d AND team_id = %d",
            $roster_id, $team_id
        ) );
        if ( ! $owned ) {
            return false;
        }
        $wpdb->delete( "{$wpdb->prefix}grsh_rosters", [ 'id' => $roster_id ] );
        self::recalculate_team_scores( $team_id );
        return true;
    }

    // -------------------------------------------------------------------------
    // POST /captain/team/submit — lock roster for board review
    // -------------------------------------------------------------------------

    public static function submit_roster( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $season_id = self::get_season_id();
        $team      = self::get_my_team( $season_id );
        if ( ! $team ) {
            return new WP_REST_Response( [ 'error' => 'No team found.' ], 404 );
        }

        $formatted = self::format_team( (int) $team['id'], $season_id );
        if ( ! $formatted['can_submit'] ) {
            return new WP_REST_Response(
                [ 'error' => 'Roster is not ready to submit.', 'gaps' => $formatted['gaps'] ], 422
            );
        }

        $wpdb->update( "{$wpdb->prefix}grsh_teams", [ 'draft_locked' => 1 ], [ 'id' => $team['id'] ] );

        return new WP_REST_Response( self::format_team( (int) $team['id'], $season_id ), 200 );
    }

    // -------------------------------------------------------------------------
    // Score recalculation + response formatting
    // -------------------------------------------------------------------------

    public static function recalculate_team_scores( int $team_id ): void {
        global $wpdb;
        $rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT p.skill_tier_reported AS tier, p.years_experience AS years,
                    p.position, r.age
             FROM {$wpdb->prefix}grsh_rosters ro
             JOIN {$wpdb->prefix}grsh_players p ON p.id = ro.player_id
             JOIN {$wpdb->prefix}grsh_registrations r ON r.id = ro.registration_id
             WHERE ro.team_id = %d",
            $team_id
        ), ARRAY_A ) ?: [];

        $skaters = []; $goalies = []; $ages = [];
        foreach ( $rows as $row ) {
            $entry = [ 'tier' => $row['tier'], 'years' => (int) $row['years'], 'adjustment' => 0 ];
            if ( $row['position'] === 'goaltender' ) {
                $goalies[] = $entry;
            } else {
                $skaters[] = $entry;
            }
            if ( $row['age'] !== null ) {
                $ages[] = (int) $row['age'];
            }
        }

        $skill_score = GRSH_Scoring::team_skill_score( array_merge( $skaters, $goalies ) );

        $team_row     = $wpdb->get_row( $wpdb->prepare(
            "SELECT division, season_id FROM {$wpdb->prefix}grsh_teams WHERE id = %d", $team_id
        ), ARRAY_A );
        $division_avg = $team_row
            ? self::get_division_average_skill( $team_id, $team_row['division'], (int) $team_row['season_id'] )
            : null;
        $parity_score = $skill_score !== null ? GRSH_Scoring::relative_parity_score( $skill_score, $division_avg ) : null;

        $wpdb->update( "{$wpdb->prefix}grsh_teams", [
            'skill_score'  => $skill_score,
            'age_score'    => GRSH_Scoring::team_average_age( $ages ),
            'parity_score' => $parity_score,
        ], [ 'id' => $team_id ] );
    }

    /**
     * Average skill_score of OTHER full_team teams in the same
     * division/season — the peer group this team's parity is judged
     * against. Excludes itself and any teams with no score yet.
     */
    private static function get_division_average_skill( int $excluding_team_id, string $division, int $season_id ): ?float {
        global $wpdb;
        $avg = $wpdb->get_var( $wpdb->prepare(
            "SELECT AVG(skill_score) FROM {$wpdb->prefix}grsh_teams
             WHERE season_id = %d AND division = %s AND team_type = 'full_team'
             AND id != %d AND skill_score IS NOT NULL",
            $season_id, $division, $excluding_team_id
        ) );
        return $avg !== null ? (float) $avg : null;
    }

    /**
     * Captain-facing team payload. Deliberately omits the raw skill_score /
     * parity_score numbers — per the locked design, captains see a balance
     * band only (parity_action), the exact numbers are board-only via the
     * existing /reports/parity endpoint. age_score IS exposed, since it was
     * requested as a visible "team average age" stat, not a hidden score.
     */
    private static function format_team( int $team_id, int $season_id ): array {
        global $wpdb;
        $team = $wpdb->get_row( $wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}grsh_teams WHERE id = %d", $team_id
        ), ARRAY_A );

        $rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT ro.id AS roster_id, ro.jersey_number, ro.is_captain,
                    p.id AS player_id, p.first_name, p.last_name, p.email,
                    p.position, p.skill_tier_reported, p.years_experience,
                    r.age
             FROM {$wpdb->prefix}grsh_rosters ro
             JOIN {$wpdb->prefix}grsh_players p ON p.id = ro.player_id
             JOIN {$wpdb->prefix}grsh_registrations r ON r.id = ro.registration_id
             WHERE ro.team_id = %d
             ORDER BY ro.id ASC",
            $team_id
        ), ARRAY_A ) ?: [];

        $players = array_map( fn( $row ) => [
            'roster_id'           => (int) $row['roster_id'],
            'player_id'           => (int) $row['player_id'],
            'first_name'          => $row['first_name'],
            'last_name'           => $row['last_name'],
            'email'               => $row['email'],
            'position'            => $row['position'],
            'skill_tier_reported' => $row['skill_tier_reported'],
            'years_experience'    => (int) $row['years_experience'],
            'age'                 => $row['age'] !== null ? (int) $row['age'] : null,
            'jersey_number'       => $row['jersey_number'] !== null ? (int) $row['jersey_number'] : null,
            'is_captain'          => (bool) $row['is_captain'],
        ], $rows );

        $goalie_count = count( array_filter( $players, fn( $p ) => $p['position'] === 'goaltender' ) );
        $count        = count( $players );
        $parity_score = $team['parity_score'] !== null ? (float) $team['parity_score'] : null;

        $position_counts = [ 'defenseman' => 0, 'center' => 0, 'winger' => 0, 'goaltender' => 0 ];
        foreach ( $players as $p ) {
            if ( isset( $position_counts[ $p['position'] ] ) ) {
                $position_counts[ $p['position'] ]++;
            }
        }

        $gaps = [];
        if ( $count < GRSH_Scoring::FULL_TEAM_MIN_PLAYERS ) {
            $needed = GRSH_Scoring::FULL_TEAM_MIN_PLAYERS - $count;
            $gaps[] = "{$needed} more player" . ( $needed === 1 ? '' : 's' ) . ' to reach the minimum';
        }
        if ( $goalie_count < GRSH_Scoring::FULL_TEAM_GOALIE_MIN ) {
            $gaps[] = 'a goalie';
        }

        $division_label = $team['division'];
        foreach ( GRSH_Settings::get_active_divisions() as $d ) {
            if ( $d['key'] === $team['division'] ) {
                $division_label = $d['label'];
                break;
            }
        }

        return [
            'id'            => (int) $team['id'],
            'name'          => $team['name'],
            'division'      => $team['division'],
            'division_label' => $division_label,
            'draft_locked'  => (bool) $team['draft_locked'],
            'updated_at'    => $team['updated_at'],
            'age_score'     => $team['age_score'] !== null ? (float) $team['age_score'] : null,
            'parity_action' => GRSH_Scoring::parity_action( $parity_score ),
            'players'       => $players,
            'player_count'  => $count,
            'goalie_count'  => $goalie_count,
            'position_counts' => $position_counts,
            'min_players'   => GRSH_Scoring::FULL_TEAM_MIN_PLAYERS,
            'max_players'   => GRSH_Scoring::FULL_TEAM_MAX_PLAYERS,
            'gaps'          => $gaps,
            'can_submit'    => empty( $gaps ) && $count <= GRSH_Scoring::FULL_TEAM_MAX_PLAYERS,
        ];
    }

    /**
     * Board-facing payload — everything format_team() returns, plus the
     * exact skill_score/parity_score numbers (board-only, never sent to
     * captains) and per-player "added by" attribution from assigned_by.
     */
    public static function format_team_for_board( int $team_id, int $season_id ): array {
        global $wpdb;
        $base = self::format_team( $team_id, $season_id );

        $team = $wpdb->get_row( $wpdb->prepare(
            "SELECT skill_score, parity_score, captain_player_id
             FROM {$wpdb->prefix}grsh_teams WHERE id = %d", $team_id
        ), ARRAY_A );

        $base['skill_score']  = $team['skill_score']  !== null ? (float) $team['skill_score']  : null;
        $base['parity_score'] = $team['parity_score'] !== null ? (float) $team['parity_score'] : null;

        $captain = $team['captain_player_id'] ? $wpdb->get_row( $wpdb->prepare(
            "SELECT first_name, last_name FROM {$wpdb->prefix}grsh_players WHERE id = %d",
            $team['captain_player_id']
        ), ARRAY_A ) : null;
        $base['captain_name'] = $captain ? trim( "{$captain['first_name']} {$captain['last_name']}" ) : null;

        $assigned_rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT id AS roster_id, assigned_by FROM {$wpdb->prefix}grsh_rosters WHERE team_id = %d", $team_id
        ), ARRAY_A ) ?: [];
        $added_by = [];
        foreach ( $assigned_rows as $row ) {
            $user = $row['assigned_by'] ? get_userdata( (int) $row['assigned_by'] ) : false;
            $added_by[ (int) $row['roster_id'] ] = $user ? $user->display_name : null;
        }
        foreach ( $base['players'] as &$p ) {
            $p['added_by'] = $added_by[ $p['roster_id'] ] ?? null;
        }

        return $base;
    }

    // -------------------------------------------------------------------------
    // GET /captain/lookup-player — returning-player autofill
    // -------------------------------------------------------------------------

    public static function lookup_player( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $email = sanitize_email( (string) $request->get_param( 'email' ) );
        if ( ! is_email( $email ) ) {
            return new WP_REST_Response( [ 'found' => false ], 200 );
        }

        $player = $wpdb->get_row( $wpdb->prepare(
            "SELECT position, skill_tier_reported, years_experience
             FROM {$wpdb->prefix}grsh_players WHERE email = %s", $email
        ), ARRAY_A );

        if ( ! $player ) {
            return new WP_REST_Response( [ 'found' => false ], 200 );
        }

        return new WP_REST_Response( [
            'found'               => true,
            'position'            => $player['position'],
            'skill_tier_reported' => $player['skill_tier_reported'],
            'years_experience'    => (int) $player['years_experience'],
        ], 200 );
    }

    // -------------------------------------------------------------------------
    // Share link — token is signed, not stored, so no new DB column needed.
    // -------------------------------------------------------------------------

    private static function share_token( int $team_id ): string {
        return substr( hash_hmac( 'sha256', (string) $team_id, wp_salt( 'auth' ) ), 0, 24 );
    }

    public static function get_share_link( WP_REST_Request $request ): WP_REST_Response {
        $season_id = self::get_season_id();
        $team      = self::get_my_team( $season_id );
        if ( ! $team ) {
            return new WP_REST_Response( [ 'error' => 'No team found.' ], 404 );
        }
        $token    = self::share_token( (int) $team['id'] );
        $page_url = self::get_captain_page_url();

        // If the page can't be located for some reason, fall back to the
        // raw REST URL rather than failing outright — not pretty, but
        // functional.
        $url = $page_url
            ? add_query_arg(
                [ 'grsh_share_team' => $team['id'], 'grsh_share_token' => $token ],
                $page_url
              )
            : rest_url( "grsh/v1/captain/share/{$team['id']}/{$token}" );

        return new WP_REST_Response( [ 'url' => $url ], 200 );
    }

    /**
     * Find the front-end page carrying [grsh_captain_roster], so share
     * links point at the actual rendered page rather than the raw REST
     * endpoint.
     */
    private static function get_captain_page_url(): ?string {
        global $wpdb;
        $post_id = $wpdb->get_var( $wpdb->prepare(
            "SELECT ID FROM {$wpdb->posts}
             WHERE post_status = 'publish' AND post_type IN ('page','post')
             AND post_content LIKE %s LIMIT 1",
            '%' . $wpdb->esc_like( '[' . GRSH_Captain_Frontend::SHORTCODE ) . '%'
        ) );
        return $post_id ? get_permalink( (int) $post_id ) : null;
    }

    public static function view_shared_team( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $team_id = (int) $request->get_param( 'team_id' );
        $token   = (string) $request->get_param( 'token' );

        if ( ! hash_equals( self::share_token( $team_id ), $token ) ) {
            $response = new WP_REST_Response( [ 'error' => 'Invalid or expired link.' ], 403 );
        } else {
            $season_id = (int) $wpdb->get_var( $wpdb->prepare(
                "SELECT season_id FROM {$wpdb->prefix}grsh_teams WHERE id = %d", $team_id
            ) );
            $response = $season_id
                ? new WP_REST_Response( self::format_team( $team_id, $season_id ), 200 )
                : new WP_REST_Response( [ 'error' => 'Team not found.' ], 404 );
        }

        // This route is intentionally public (no login), so WP-Optimize's
        // usual "skip cache for logged-in users" rule does not protect it —
        // confirmed in production: an anonymous (incognito) hit got cached
        // and then served stale to every subsequent anonymous visit, fully
        // disconnected from the real roster underneath. Tell every caching
        // layer explicitly not to store this.
        $response->header( 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0' );
        $response->header( 'Pragma', 'no-cache' );

        return $response;
    }
}
