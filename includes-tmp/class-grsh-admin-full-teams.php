<?php
/**
 * GRSH Admin Full Teams — board-side view/edit/override for captain-
 * registered full-team rosters. Reuses GRSH_Captain_Roster's validation
 * and persistence logic (add_player_to_team, remove_player_from_roster,
 * recalculate_team_scores, format_team_for_board) scoped to an explicit
 * team_id rather than "my own team", so board members can manage any
 * captain's roster, not just their own.
 *
 * GET    /wp-json/grsh/v1/admin/full-teams                              → list
 * GET    /wp-json/grsh/v1/admin/full-teams/{team_id}                    → detail
 * POST   /wp-json/grsh/v1/admin/full-teams/{team_id}/players             → add
 * DELETE /wp-json/grsh/v1/admin/full-teams/{team_id}/players/{roster_id} → remove
 * POST   /wp-json/grsh/v1/admin/full-teams/{team_id}/unlock              → unlock
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class GRSH_Admin_Full_Teams {

    public static function register_hooks(): void {
        add_action( 'rest_api_init', [ __CLASS__, 'register_routes' ] );
    }

    public static function register_routes(): void {
        $ns = 'grsh/v1';

        register_rest_route( $ns, '/admin/full-teams', [
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => [ __CLASS__, 'list_teams' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        register_rest_route( $ns, '/admin/full-teams/(?P<team_id>\d+)', [
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => [ __CLASS__, 'get_team' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        register_rest_route( $ns, '/admin/full-teams/(?P<team_id>\d+)/players', [
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => [ __CLASS__, 'add_player' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        register_rest_route( $ns, '/admin/full-teams/(?P<team_id>\d+)/players/(?P<roster_id>\d+)', [
            'methods'             => WP_REST_Server::DELETABLE,
            'callback'            => [ __CLASS__, 'remove_player' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        register_rest_route( $ns, '/admin/full-teams/(?P<team_id>\d+)/unlock', [
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => [ __CLASS__, 'unlock_team' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );
    }

    public static function check_permission(): bool {
        return current_user_can( 'manage_options' ) || current_user_can( 'grsh_committee' );
    }

    private static function get_season_id(): int {
        global $wpdb;
        static $id = null;
        if ( $id === null ) {
            // Same fix as GRSH_Captain_Roster::get_season_id() — read the
            // configured season_year from Settings, not the sync engine's
            // hardcoded constant.
            $season_year = (int) ( GRSH_Settings::get()['season_year'] ?? 0 );
            $id = (int) $wpdb->get_var( $wpdb->prepare(
                "SELECT id FROM {$wpdb->prefix}grsh_seasons WHERE season_year = %d LIMIT 1",
                $season_year
            ) );
        }
        return $id ?: 1;
    }

    private static function find_team( int $team_id ): ?array {
        global $wpdb;
        $team = $wpdb->get_row( $wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}grsh_teams WHERE id = %d AND team_type = 'full_team'", $team_id
        ), ARRAY_A );
        return $team ?: null;
    }

    // -------------------------------------------------------------------------
    // GET /admin/full-teams — list every full-team registration this season
    // -------------------------------------------------------------------------

    public static function list_teams( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $season_id = self::get_season_id();

        $teams = $wpdb->get_results( $wpdb->prepare(
            "SELECT t.id, t.name, t.division, t.draft_locked, t.skill_score, t.parity_score, t.updated_at,
                    p.first_name AS captain_first, p.last_name AS captain_last
             FROM {$wpdb->prefix}grsh_teams t
             LEFT JOIN {$wpdb->prefix}grsh_players p ON p.id = t.captain_player_id
             WHERE t.season_id = %d AND t.team_type = 'full_team'
             ORDER BY t.division, t.name",
            $season_id
        ), ARRAY_A ) ?: [];

        $divisions = GRSH_Settings::get_active_divisions();
        $label_for = function ( $key ) use ( $divisions ) {
            foreach ( $divisions as $d ) {
                if ( $d['key'] === $key ) {
                    return $d['label'];
                }
            }
            return $key;
        };

        $result = array_map( function ( $t ) use ( $wpdb, $label_for ) {
            $player_count = (int) $wpdb->get_var( $wpdb->prepare(
                "SELECT COUNT(*) FROM {$wpdb->prefix}grsh_rosters WHERE team_id = %d", $t['id']
            ) );
            $goalie_count = (int) $wpdb->get_var( $wpdb->prepare(
                "SELECT COUNT(*) FROM {$wpdb->prefix}grsh_rosters ro
                 JOIN {$wpdb->prefix}grsh_players p ON p.id = ro.player_id
                 WHERE ro.team_id = %d AND p.position = 'goaltender'",
                $t['id']
            ) );
            $parity_score = $t['parity_score'] !== null ? (float) $t['parity_score'] : null;

            return [
                'id'             => (int) $t['id'],
                'name'           => $t['name'],
                'division'       => $t['division'],
                'division_label' => $label_for( $t['division'] ),
                'captain_name'   => trim( "{$t['captain_first']} {$t['captain_last']}" ) ?: null,
                'player_count'   => $player_count,
                'goalie_count'   => $goalie_count,
                'min_players'    => GRSH_Scoring::FULL_TEAM_MIN_PLAYERS,
                'max_players'    => GRSH_Scoring::FULL_TEAM_MAX_PLAYERS,
                'skill_score'    => $t['skill_score'] !== null ? (float) $t['skill_score'] : null,
                'parity_score'   => $parity_score,
                'parity_action'  => GRSH_Scoring::parity_action( $parity_score ),
                'draft_locked'   => (bool) $t['draft_locked'],
                'updated_at'     => $t['updated_at'],
            ];
        }, $teams );

        return new WP_REST_Response( $result, 200 );
    }

    // -------------------------------------------------------------------------
    // GET /admin/full-teams/{team_id} — full board detail
    // -------------------------------------------------------------------------

    public static function get_team( WP_REST_Request $request ): WP_REST_Response {
        $team_id = (int) $request->get_param( 'team_id' );
        $team    = self::find_team( $team_id );
        if ( ! $team ) {
            return new WP_REST_Response( [ 'error' => 'Team not found.' ], 404 );
        }
        return new WP_REST_Response(
            GRSH_Captain_Roster::format_team_for_board( $team_id, (int) $team['season_id'] ), 200
        );
    }

    // -------------------------------------------------------------------------
    // POST /admin/full-teams/{team_id}/players — add a player to any team
    // -------------------------------------------------------------------------

    public static function add_player( WP_REST_Request $request ): WP_REST_Response {
        $team_id = (int) $request->get_param( 'team_id' );
        $team    = self::find_team( $team_id );
        if ( ! $team ) {
            return new WP_REST_Response( [ 'error' => 'Team not found.' ], 404 );
        }

        $response = GRSH_Captain_Roster::add_player_to_team(
            $team, (int) $team['season_id'], (array) $request->get_json_params()
        );

        // Re-fetch as the board-formatted shape (exact scores, added_by)
        // on success, since add_player_to_team returns the captain-safe
        // shape by default.
        if ( $response->get_status() < 300 ) {
            return new WP_REST_Response(
                GRSH_Captain_Roster::format_team_for_board( $team_id, (int) $team['season_id'] ),
                $response->get_status()
            );
        }
        return $response;
    }

    // -------------------------------------------------------------------------
    // DELETE /admin/full-teams/{team_id}/players/{roster_id}
    // -------------------------------------------------------------------------

    public static function remove_player( WP_REST_Request $request ): WP_REST_Response {
        $team_id   = (int) $request->get_param( 'team_id' );
        $roster_id = (int) $request->get_param( 'roster_id' );
        $team      = self::find_team( $team_id );
        if ( ! $team ) {
            return new WP_REST_Response( [ 'error' => 'Team not found.' ], 404 );
        }
        if ( ! GRSH_Captain_Roster::remove_player_from_roster( $team_id, $roster_id ) ) {
            return new WP_REST_Response( [ 'error' => 'Player not found on this roster.' ], 404 );
        }
        return new WP_REST_Response(
            GRSH_Captain_Roster::format_team_for_board( $team_id, (int) $team['season_id'] ), 200
        );
    }

    // -------------------------------------------------------------------------
    // POST /admin/full-teams/{team_id}/unlock — the board override
    // -------------------------------------------------------------------------

    public static function unlock_team( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $team_id = (int) $request->get_param( 'team_id' );
        $team    = self::find_team( $team_id );
        if ( ! $team ) {
            return new WP_REST_Response( [ 'error' => 'Team not found.' ], 404 );
        }
        $wpdb->update( "{$wpdb->prefix}grsh_teams", [ 'draft_locked' => 0 ], [ 'id' => $team_id ] );
        return new WP_REST_Response(
            GRSH_Captain_Roster::format_team_for_board( $team_id, (int) $team['season_id'] ), 200
        );
    }
}
