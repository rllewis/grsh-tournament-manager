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

        register_rest_route( $ns, '/captain/team/players/(?P<roster_id>\d+)/waiver', [
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => [ __CLASS__, 'resend_waiver' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        register_rest_route( $ns, '/captain/team/players/(?P<roster_id>\d+)/email', [
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => [ __CLASS__, 'update_player_email' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        register_rest_route( $ns, '/captain/team/players/(?P<roster_id>\d+)/waiver-link', [
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => [ __CLASS__, 'get_waiver_link' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        register_rest_route( $ns, '/captain/team/players/(?P<roster_id>\d+)/details', [
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => [ __CLASS__, 'update_player_details' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        register_rest_route( $ns, '/captain/team/remind', [
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => [ __CLASS__, 'remind_unsigned' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        register_rest_route( $ns, '/captain/team/submit', [
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => [ __CLASS__, 'submit_roster' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        register_rest_route( $ns, '/captain/team/update', [
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => [ __CLASS__, 'update_team' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        register_rest_route( $ns, '/captain/team/change-request', [
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => [ __CLASS__, 'request_change' ],
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
            'divisions' => self::divisions_payload( $season_id ),
            'registration' => self::registration_payload(),
            'fees'         => self::fees_payload(),
            'tiers'     => array_map(
                fn( $k, $v ) => [ 'key' => $k, 'label' => $k, 'value' => $v ],
                array_keys( GRSH_Scoring::TIER_VALUES ),
                GRSH_Scoring::TIER_VALUES
            ),
            'min_players' => GRSH_Scoring::FULL_TEAM_MIN_PLAYERS,
            'max_players' => GRSH_Scoring::FULL_TEAM_MAX_PLAYERS,
            'goalie_min'  => GRSH_Scoring::FULL_TEAM_GOALIE_MIN,
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

        $want = sanitize_key( (string) ( $body['division'] ?? '' ) );
        if ( $want !== '' && self::division_full( $want, $season_id ) ) {
            return new WP_REST_Response( [ 'error' => 'That division has no team spots left. Pick another division or contact the board.' ], 409 );
        }

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

        if ( self::team_name_taken( $name, $season_id ) ) {
            return [ 'error' => 'Another team already uses that name. Pick a different name.', 'status' => 409 ];
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
        // Tier is optional at add time (quick-add), required before submit.
        // An empty tier is stored as NULL and ignored by team scoring.
        if ( $tier !== '' && ! array_key_exists( $tier, GRSH_Scoring::TIER_VALUES ) ) {
            return new WP_REST_Response( [ 'error' => 'Choose a valid experience tier.' ], 400 );
        }
        $tier_db = $tier !== '' ? $tier : null;

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
            $player_update = [
                'first_name'  => $first_name,
                'last_name'   => $last_name,
                'position'    => $position,
                'is_goalie'   => $position === 'goaltender' ? 1 : 0,
            ];
            // Quick-add leaves tier/years blank: never wipe values a
            // returning player already has on file.
            if ( $tier_db !== null ) {
                $player_update['skill_tier_reported'] = $tier_db;
            }
            if ( isset( $body['years_experience'] ) && $body['years_experience'] !== '' ) {
                $player_update['years_experience'] = $years;
            }
            $wpdb->update( "{$wpdb->prefix}grsh_players", $player_update, [ 'id' => $player_id ] );
            if ( $tier_db === null ) {
                // Roster snapshot should reflect the stored tier, not blank.
                $tier_db = $wpdb->get_var( $wpdb->prepare(
                    "SELECT skill_tier_reported FROM {$wpdb->prefix}grsh_players WHERE id = %d", $player_id
                ) ) ?: null;
            }
        } else {
            $wpdb->insert( "{$wpdb->prefix}grsh_players", [
                'first_name'          => $first_name,
                'last_name'           => $last_name,
                'email'               => $email,
                'position'            => $position,
                'skill_tier_reported' => $tier_db,
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
            'skill_tier_at_draft' => $tier_db,
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

        // Send the player their own waiver link — never the captain's
        // problem to relay. Only for a registration that isn't already
        // signed, so re-adding a returning player who signed a prior
        // season/team doesn't spam them with a redundant email.
        // "Signed" means signed on the v2 waiver form, not registrations.signed_at
        // (the player-registration form's own waiver also sets that).
        if ( class_exists( 'GRSH_Waiver_WPForms' ) && ! GRSH_Waiver_WPForms::is_signed( (int) $registration_id ) ) {
            // WPForms v2 waiver link, prefilled. Signing marks the
            // registration signed via wpforms_process_complete.
            GRSH_Waiver_WPForms::send( (int) $registration_id, 'initial' );
        }

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
    // Waiver actions: resend one, edit email, remind everyone unsigned
    // -------------------------------------------------------------------------

    /** Roster row (with registration + email) that belongs to this team, or null. */
    private static function get_team_roster_row( int $team_id, int $roster_id ): ?array {
        global $wpdb;
        $row = $wpdb->get_row( $wpdb->prepare(
            "SELECT ro.id AS roster_id, ro.registration_id, ro.player_id, p.email, p.wp_user_id, r.signed_at
             FROM {$wpdb->prefix}grsh_rosters ro
             JOIN {$wpdb->prefix}grsh_players p ON p.id = ro.player_id
             JOIN {$wpdb->prefix}grsh_registrations r ON r.id = ro.registration_id
             WHERE ro.id = %d AND ro.team_id = %d",
            $roster_id, $team_id
        ), ARRAY_A );
        return $row ?: null;
    }

    public static function resend_waiver( WP_REST_Request $request ): WP_REST_Response {
        $season_id = self::get_season_id();
        $team      = self::get_my_team( $season_id );
        if ( ! $team ) {
            return new WP_REST_Response( [ 'error' => 'No team found.' ], 404 );
        }
        $row = self::get_team_roster_row( (int) $team['id'], (int) $request->get_param( 'roster_id' ) );
        if ( ! $row ) {
            return new WP_REST_Response( [ 'error' => 'Player not found on your roster.' ], 404 );
        }
        if ( GRSH_Waiver_WPForms::is_signed( (int) $row['registration_id'] ) ) {
            return new WP_REST_Response( [ 'error' => 'This player has already signed.' ], 409 );
        }
        $wait = GRSH_Waiver_WPForms::cooldown_remaining( (int) $row['registration_id'], GRSH_Waiver_WPForms::RESEND_COOLDOWN );
        if ( $wait > 0 ) {
            return new WP_REST_Response( [
                'error' => 'A waiver email was just sent. You can resend in ' . max( 1, (int) ceil( $wait / 60 ) ) . ' minute(s).',
            ], 429 );
        }
        if ( ! GRSH_Waiver_WPForms::send( (int) $row['registration_id'], 'resend' ) ) {
            return new WP_REST_Response( [ 'error' => 'The email could not be sent. Check the address and try again.' ], 502 );
        }
        return new WP_REST_Response( self::format_team( (int) $team['id'], $season_id ), 200 );
    }

    /**
     * Fix a typo'd address. Safe cases only: the player has not signed, has
     * no WP account linked, and the new address is not already another
     * player record (email is the system-wide identity key).
     */
    public static function update_player_email( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $season_id = self::get_season_id();
        $team      = self::get_my_team( $season_id );
        if ( ! $team ) {
            return new WP_REST_Response( [ 'error' => 'No team found.' ], 404 );
        }
        $row = self::get_team_roster_row( (int) $team['id'], (int) $request->get_param( 'roster_id' ) );
        if ( ! $row ) {
            return new WP_REST_Response( [ 'error' => 'Player not found on your roster.' ], 404 );
        }
        $body  = (array) $request->get_json_params();
        $email = sanitize_email( $body['email'] ?? '' );
        if ( ! is_email( $email ) ) {
            return new WP_REST_Response( [ 'error' => 'Enter a valid email address.' ], 400 );
        }
        if ( GRSH_Waiver_WPForms::is_signed( (int) $row['registration_id'] ) || ! empty( $row['wp_user_id'] ) ) {
            return new WP_REST_Response( [ 'error' => 'This player\'s email can\'t be changed here. Contact the board.' ], 409 );
        }
        $taken = $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}grsh_players WHERE email = %s AND id != %d",
            $email, (int) $row['player_id']
        ) );
        if ( $taken ) {
            return new WP_REST_Response( [ 'error' => 'That email already belongs to another player. Remove this player and add them with that address instead.' ], 409 );
        }
        $wpdb->update( "{$wpdb->prefix}grsh_players", [ 'email' => $email ], [ 'id' => (int) $row['player_id'] ] );
        GRSH_Waiver_WPForms::send( (int) $row['registration_id'], 'initial' );
        return new WP_REST_Response( self::format_team( (int) $team['id'], $season_id ), 200 );
    }

    /** Waiver link for the captain to text to a player. Captain-only: never in the public share payload. */
    public static function get_waiver_link( WP_REST_Request $request ): WP_REST_Response {
        $season_id = self::get_season_id();
        $team      = self::get_my_team( $season_id );
        if ( ! $team ) {
            return new WP_REST_Response( [ 'error' => 'No team found.' ], 404 );
        }
        $row = self::get_team_roster_row( (int) $team['id'], (int) $request->get_param( 'roster_id' ) );
        if ( ! $row ) {
            return new WP_REST_Response( [ 'error' => 'Player not found on your roster.' ], 404 );
        }
        $ctx = GRSH_Waiver_WPForms::load_context( (int) $row['registration_id'] );
        if ( ! $ctx ) {
            return new WP_REST_Response( [ 'error' => 'Player record not found.' ], 404 );
        }
        $response = new WP_REST_Response( [ 'url' => GRSH_Waiver_WPForms::build_url( (int) $row['registration_id'], $ctx ) ], 200 );
        $response->header( 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0' );
        return $response;
    }

    /** Fill in details left blank at quick-add time (tier, years, age, jersey). */
    public static function update_player_details( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $season_id = self::get_season_id();
        $team      = self::get_my_team( $season_id );
        if ( ! $team ) {
            return new WP_REST_Response( [ 'error' => 'No team found.' ], 404 );
        }
        $row = self::get_team_roster_row( (int) $team['id'], (int) $request->get_param( 'roster_id' ) );
        if ( ! $row ) {
            return new WP_REST_Response( [ 'error' => 'Player not found on your roster.' ], 404 );
        }
        $body = (array) $request->get_json_params();

        if ( array_key_exists( 'skill_tier_reported', $body ) ) {
            $tier = sanitize_text_field( (string) $body['skill_tier_reported'] );
            if ( ! array_key_exists( $tier, GRSH_Scoring::TIER_VALUES ) ) {
                return new WP_REST_Response( [ 'error' => 'Choose a valid experience level.' ], 400 );
            }
            $wpdb->update( "{$wpdb->prefix}grsh_players", [ 'skill_tier_reported' => $tier ], [ 'id' => (int) $row['player_id'] ] );
            $wpdb->update( "{$wpdb->prefix}grsh_rosters", [ 'skill_tier_at_draft' => $tier ], [ 'id' => (int) $row['roster_id'] ] );
        }
        if ( isset( $body['years_experience'] ) && $body['years_experience'] !== '' ) {
            $wpdb->update( "{$wpdb->prefix}grsh_players", [ 'years_experience' => absint( $body['years_experience'] ) ], [ 'id' => (int) $row['player_id'] ] );
        }
        if ( isset( $body['age'] ) && $body['age'] !== '' ) {
            $wpdb->update( "{$wpdb->prefix}grsh_registrations", [ 'age' => absint( $body['age'] ) ], [ 'id' => (int) $row['registration_id'] ] );
        }
        if ( isset( $body['jersey_number'] ) && $body['jersey_number'] !== '' ) {
            $ok = $wpdb->update( "{$wpdb->prefix}grsh_rosters", [ 'jersey_number' => absint( $body['jersey_number'] ) ], [ 'id' => (int) $row['roster_id'] ] );
            if ( $ok === false ) {
                return new WP_REST_Response( [ 'error' => 'That jersey number is already taken on this roster.' ], 409 );
            }
        }

        self::recalculate_team_scores( (int) $team['id'] );
        return new WP_REST_Response( self::format_team( (int) $team['id'], $season_id ), 200 );
    }

    /** Remind every unsigned player not emailed in the last 24 hours. */
    public static function remind_unsigned( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $season_id = self::get_season_id();
        $team      = self::get_my_team( $season_id );
        if ( ! $team ) {
            return new WP_REST_Response( [ 'error' => 'No team found.' ], 404 );
        }
        $rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT ro.registration_id FROM {$wpdb->prefix}grsh_rosters ro
             JOIN {$wpdb->prefix}grsh_registrations r ON r.id = ro.registration_id
             WHERE ro.team_id = %d",
            (int) $team['id']
        ), ARRAY_A ) ?: [];

        $sent = 0; $skipped = 0;
        foreach ( $rows as $r ) {
            $reg = (int) $r['registration_id'];
            if ( GRSH_Waiver_WPForms::is_signed( $reg ) ) {
                continue; // signed players aren't "skipped", just not part of the reminder
            }
            if ( GRSH_Waiver_WPForms::cooldown_remaining( $reg, GRSH_Waiver_WPForms::REMIND_COOLDOWN ) > 0 ) {
                $skipped++;
                continue;
            }
            GRSH_Waiver_WPForms::send( $reg, 'reminder' ) ? $sent++ : $skipped++;
        }
        $out = self::format_team( (int) $team['id'], $season_id );
        $out['remind_result'] = [ 'sent' => $sent, 'skipped' => $skipped ];
        return new WP_REST_Response( $out, 200 );
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
        GRSH_Team_Review::mark_submitted( (int) $team['id'] );

        return new WP_REST_Response( self::format_team( (int) $team['id'], $season_id ), 200 );
    }

    // -------------------------------------------------------------------------
    // Team setup helpers: division capacity, name check, registration + fee info
    // -------------------------------------------------------------------------

    /** @return array<string,mixed>|null */
    private static function division_row( string $key ): ?array {
        foreach ( GRSH_Settings::get_active_divisions() as $d ) {
            if ( $d['key'] === $key ) {
                return GRSH_Settings::fill_division( $d );
            }
        }
        return null;
    }

    /** True when a division has a registered-team cap and it is already used up. No cap configured = never full. */
    private static function division_full( string $key, int $season_id, int $exclude_team_id = 0 ): bool {
        global $wpdb;
        $row = self::division_row( $key );
        if ( ! $row ) {
            return false;
        }
        $slots = (int) $row['reg_teams'];
        if ( $slots <= 0 ) {
            return false;
        }
        $taken = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->prefix}grsh_teams
             WHERE season_id = %d AND team_type = 'full_team' AND division = %s AND id <> %d",
            $season_id, $key, $exclude_team_id
        ) );
        return $taken >= $slots;
    }

    private static function team_name_taken( string $name, int $season_id, int $exclude_team_id = 0 ): bool {
        global $wpdb;
        return (bool) $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}grsh_teams
             WHERE season_id = %d AND LOWER(name) = LOWER(%s) AND id <> %d LIMIT 1",
            $season_id, $name, $exclude_team_id
        ) );
    }

    private static function divisions_payload( int $season_id ): array {
        global $wpdb;
        $taken = [];
        $rows  = $wpdb->get_results( $wpdb->prepare(
            "SELECT division, COUNT(*) AS n FROM {$wpdb->prefix}grsh_teams
             WHERE season_id = %d AND team_type = 'full_team' GROUP BY division",
            $season_id
        ), ARRAY_A ) ?: [];
        foreach ( $rows as $r ) {
            $taken[ $r['division'] ] = (int) $r['n'];
        }
        $list = GRSH_Settings::divisions_for( 'full_team' );
        if ( ! $list ) {
            $list = GRSH_Settings::get_active_divisions();
        }
        $out = [];
        foreach ( $list as $d ) {
            $d     = GRSH_Settings::fill_division( $d );
            $slots = (int) $d['reg_teams'];
            $out[] = [
                'key'   => $d['key'],
                'label' => $d['label'],
                'spots' => $slots > 0 ? $slots : null,
                'taken' => $taken[ $d['key'] ] ?? 0,
            ];
        }
        return $out;
    }

    private static function registration_payload(): array {
        $s      = GRSH_Settings::get();
        $opens  = (string) ( $s['registration_opens'] ?? '' );
        $closes = (string) ( $s['registration_closes'] ?? '' );
        $today  = current_time( 'Y-m-d' );
        $state  = 'open';
        if ( $opens !== '' && $today < $opens ) {
            $state = 'not_open';
        } elseif ( $closes !== '' && $today > $closes ) {
            $state = 'closed';
        }
        $days_left = null;
        if ( $state === 'open' && $closes !== '' && strtotime( $closes ) ) {
            $days_left = (int) floor( ( strtotime( $closes ) - strtotime( $today ) ) / DAY_IN_SECONDS );
        }
        return [
            'state'     => $state,
            'opens'     => $opens !== '' ? $opens : null,
            'closes'    => $closes !== '' ? $closes : null,
            'days_left' => $days_left,
        ];
    }

    private static function fees_payload(): array {
        $s      = GRSH_Settings::get();
        $cutoff = (string) ( $s['team_fee_early_cutoff_date'] ?? '' );
        $due    = (string) ( $s['team_balance_due_date'] ?? '' );
        return [
            'deposit'          => (float) ( $s['team_deposit_amount'] ?? 500 ),
            'early_amount'     => (float) ( $s['team_fee_early_amount'] ?? 0 ),
            'late_amount'      => (float) ( $s['team_fee_late_amount'] ?? 0 ),
            'early_cutoff'     => $cutoff !== '' ? $cutoff : null,
            'balance_due_date' => $due !== '' ? $due : null,
            // Set via the grsh_team_deposit_url filter or the grsh_team_deposit_url option.
            'deposit_url'      => (string) apply_filters( 'grsh_team_deposit_url', (string) get_option( 'grsh_team_deposit_url', '' ) ),
        ];
    }

    /** Shared (view-only) link payload: roster only, never fees or board notes. */
    private static function public_share_payload( int $team_id, int $season_id ): array {
        $out = self::format_team( $team_id, $season_id );
        unset( $out['payment'], $out['review'] );
        return $out;
    }

    // -------------------------------------------------------------------------
    // POST /captain/team/update - rename or change division (before submit)
    // -------------------------------------------------------------------------

    public static function update_team( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $season_id = self::get_season_id();
        $team      = self::get_my_team( $season_id );
        if ( ! $team ) {
            return new WP_REST_Response( [ 'error' => 'No team found.' ], 404 );
        }
        if ( (int) $team['draft_locked'] === 1 ) {
            return new WP_REST_Response( [ 'error' => 'Your roster is submitted. Use Request a change instead.' ], 409 );
        }

        $body     = (array) $request->get_json_params();
        $name     = sanitize_text_field( trim( (string) ( $body['name'] ?? $team['name'] ) ) );
        $division = sanitize_key( (string) ( $body['division'] ?? $team['division'] ) );

        if ( $name === '' ) {
            return new WP_REST_Response( [ 'error' => 'Team name is required.' ], 400 );
        }
        if ( strlen( $name ) > 100 ) {
            return new WP_REST_Response( [ 'error' => 'Team name is too long.' ], 400 );
        }
        $valid = array_column( GRSH_Settings::get_active_divisions(), 'key' );
        if ( ! in_array( $division, $valid, true ) ) {
            return new WP_REST_Response( [ 'error' => 'Choose a valid division.' ], 400 );
        }
        if ( self::team_name_taken( $name, $season_id, (int) $team['id'] ) ) {
            return new WP_REST_Response( [ 'error' => 'Another team already uses that name. Pick a different name.' ], 409 );
        }
        $division_changed = $division !== $team['division'];
        if ( $division_changed && self::division_full( $division, $season_id, (int) $team['id'] ) ) {
            return new WP_REST_Response( [ 'error' => 'That division has no team spots left.' ], 409 );
        }

        $wpdb->update(
            "{$wpdb->prefix}grsh_teams",
            [ 'name' => $name, 'division' => $division ],
            [ 'id' => (int) $team['id'] ]
        );
        if ( $division_changed ) {
            self::recalculate_team_scores( (int) $team['id'] );
        }
        return new WP_REST_Response( self::format_team( (int) $team['id'], $season_id ), 200 );
    }

    // -------------------------------------------------------------------------
    // POST /captain/team/change-request - ask the board for a change after submit
    // -------------------------------------------------------------------------

    public static function request_change( WP_REST_Request $request ): WP_REST_Response {
        $season_id = self::get_season_id();
        $team      = self::get_my_team( $season_id );
        if ( ! $team ) {
            return new WP_REST_Response( [ 'error' => 'No team found.' ], 404 );
        }
        if ( (int) $team['draft_locked'] !== 1 ) {
            return new WP_REST_Response( [ 'error' => 'Your roster is not submitted yet, so you can edit it directly.' ], 409 );
        }
        $body   = (array) $request->get_json_params();
        $result = GRSH_Team_Review::request_change( (int) $team['id'], (string) ( $body['message'] ?? '' ) );
        if ( empty( $result['ok'] ) ) {
            return new WP_REST_Response( [ 'error' => $result['error'] ?? 'Could not send your request.' ], 400 );
        }
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
            if ( $row['age'] !== null ) {
                $ages[] = (int) $row['age'];
            }
            // Quick-add players may have no tier yet. Leave them out of the
            // skill score entirely: counting them as 0 would drag the
            // team's balance band down until the captain fills them in.
            if ( empty( $row['tier'] ) ) {
                continue;
            }
            $entry = [ 'tier' => $row['tier'], 'years' => (int) $row['years'], 'adjustment' => 0 ];
            if ( $row['position'] === 'goaltender' ) {
                $goalies[] = $entry;
            } else {
                $skaters[] = $entry;
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
                    r.age, r.id AS registration_id, r.signed_at
             FROM {$wpdb->prefix}grsh_rosters ro
             JOIN {$wpdb->prefix}grsh_players p ON p.id = ro.player_id
             JOIN {$wpdb->prefix}grsh_registrations r ON r.id = ro.registration_id
             WHERE ro.team_id = %d
             ORDER BY ro.id ASC",
            $team_id
        ), ARRAY_A ) ?: [];

        $players = array_map( function ( $row ) {
            $signed = GRSH_Waiver_WPForms::is_signed( (int) $row['registration_id'] );
            $ws     = GRSH_Waiver_WPForms::status_for( (int) $row['registration_id'], $signed );
            return [
            'registration_id'     => (int) $row['registration_id'],
            'waiver_status'       => $ws['status'],
            'waiver_sent_at'      => $ws['sent_at'] ? gmdate( 'c', $ws['sent_at'] ) : null,
            'needs_details'       => empty( $row['skill_tier_reported'] ),
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
            'waiver_signed'       => $signed,
            ];
        }, $rows );

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
        // Experience level is optional when adding, required to submit.
        $untiered = count( array_filter( $players, fn( $p ) => $p['needs_details'] ) );
        if ( $untiered > 0 ) {
            $gaps[] = "experience level for {$untiered} player" . ( $untiered === 1 ? '' : 's' );
        }
        // Unsigned waivers WARN but never block submit: a captain can't
        // force a player to sign. Board sees the count; rink check-in
        // enforces it.
        $unsigned = count( array_filter( $players, fn( $p ) => ! $p['waiver_signed'] ) );
        $warnings = [];
        if ( $unsigned > 0 ) {
            $warnings[] = "{$unsigned} player" . ( $unsigned === 1 ? '' : 's' ) . ' still need to sign their waiver';
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
            'warnings'      => $warnings,
            'waivers_signed' => $count - $unsigned,
            'waivers_total'  => $count,
            'can_submit'    => empty( $gaps ) && $count <= GRSH_Scoring::FULL_TEAM_MAX_PLAYERS,
            'review'        => GRSH_Team_Review::public_view( (int) $team['id'], (bool) $team['draft_locked'] ),
            'payment'       => [
                'deposit_paid'    => ! empty( $team['deposit_paid_at'] ),
                'deposit_paid_at' => $team['deposit_paid_at'] ?? null,
                'deposit_amount'  => isset( $team['deposit_amount'] ) ? (float) $team['deposit_amount'] : null,
                'fee_total'       => isset( $team['fee_total'] ) ? (float) $team['fee_total'] : null,
                'fee_tier'        => $team['fee_tier'] ?? null,
                'balance_due'     => isset( $team['balance_due'] ) ? (float) $team['balance_due'] : null,
                'status'          => $team['payment_status'] ?? null,
            ],
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
                ? new WP_REST_Response( self::public_share_payload( $team_id, $season_id ), 200 )
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
