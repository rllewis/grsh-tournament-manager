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

        // Teams removed from Captain Sync / this page, newest first, with what is needed to restore them.
        // Admin-only, same as the Captain Sync endpoints that do the removing and restoring.
        register_rest_route( $ns, '/admin/full-teams/removed', [
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => [ __CLASS__, 'removed_teams' ],
            'permission_callback' => fn() => current_user_can( 'manage_options' ),
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

        register_rest_route( $ns, '/admin/full-teams/(?P<team_id>\d+)/review', [
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => [ __CLASS__, 'review_team' ],
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

        // t.* so payment and created_at columns come along without a hand-kept column list.
        $teams = $wpdb->get_results( $wpdb->prepare(
            "SELECT t.*, p.first_name AS captain_first, p.last_name AS captain_last, p.email AS captain_email
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

        $can_manage = current_user_can( 'manage_options' );
        $waivers    = self::waiver_counts( array_map( fn( $t ) => (int) $t['id'], $teams ) );
        $removable  = $can_manage ? self::removal_map() : [];

        // Teams sharing a name (any division) are flagged so a leftover is easy to spot.
        $by_name = [];
        foreach ( $teams as $t ) {
            $by_name[ strtolower( trim( (string) $t['name'] ) ) ][] = $t;
        }

        $result = array_map( function ( $t ) use ( $wpdb, $label_for, $waivers, $removable, $by_name, $can_manage ) {
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
            $id           = (int) $t['id'];
            $locked       = (bool) $t['draft_locked'];
            $review       = GRSH_Team_Review::public_view( $id, $locked );

            $dups = [];
            foreach ( $by_name[ strtolower( trim( (string) $t['name'] ) ) ] ?? [] as $o ) {
                if ( (int) $o['id'] === $id ) {
                    continue;
                }
                $dups[] = [
                    'id'             => (int) $o['id'],
                    'captain_name'   => trim( "{$o['captain_first']} {$o['captain_last']}" ) ?: null,
                    'division_label' => $label_for( $o['division'] ),
                    'same_division'  => $o['division'] === $t['division'],
                ];
            }

            // One honest payment word: the old "-" read as missing data.
            if ( ( $t['payment_status'] ?? '' ) === 'paid_in_full' ) {
                $payment = [ 'key' => 'paid', 'label' => 'Paid in full' ];
            } elseif ( ! empty( $t['deposit_paid_at'] ) ) {
                $payment = [ 'key' => 'deposit', 'label' => 'Deposit paid' ];
            } else {
                $payment = [ 'key' => 'none', 'label' => 'No deposit' ];
            }

            // Same rule Captain Sync uses to hint at dummy data (names with "test", + alias emails).
            $flags = class_exists( 'GRSH_Captain_Sync' ) ? GRSH_Captain_Sync::test_flags( [
                'name'      => $t['name'],
                'cap_first' => $t['captain_first'],
                'cap_last'  => $t['captain_last'],
                'cap_email' => $t['captain_email'],
            ] ) : [];

            $w = $waivers[ $id ] ?? [ 'signed' => 0, 'total' => 0 ];

            return [
                'id'             => $id,
                'name'           => $t['name'],
                'division'       => $t['division'],
                'division_label' => $label_for( $t['division'] ),
                'captain_name'   => trim( "{$t['captain_first']} {$t['captain_last']}" ) ?: null,
                'captain_email'  => $t['captain_email'] ?: null,
                'player_count'   => $player_count,
                'goalie_count'   => $goalie_count,
                'min_players'    => GRSH_Scoring::FULL_TEAM_MIN_PLAYERS,
                'max_players'    => GRSH_Scoring::FULL_TEAM_MAX_PLAYERS,
                'skill_score'    => $t['skill_score'] !== null ? (float) $t['skill_score'] : null,
                'parity_score'   => $parity_score,
                'parity_action'  => GRSH_Scoring::parity_action( $parity_score ),
                'draft_locked'   => $locked,
                'updated_at'     => $t['updated_at'],
                'created_at'     => $t['created_at'] ?? null,
                'review_status'  => $review['status'],
                'review_label'   => $review['label'],
                'waivers_signed' => $w['signed'],
                'waivers_total'  => $w['total'],
                'payment'        => $payment,
                'looks_test'     => ! empty( $flags ),
                'test_flags'     => $flags,
                'duplicates'     => $dups,
                // Removal itself is done by Captain Sync's endpoints (admin-only). Committee members
                // get can_manage = false and the page hides every remove control.
                'cleanup'        => [
                    'can_manage' => $can_manage,
                    'removal'    => $removable[ $id ] ?? null,
                ],
            ];
        }, $teams );

        return new WP_REST_Response( $result, 200 );
    }

    /**
     * team_id => whether Captain Sync's bulk delete would take it, and why not. Read straight from Captain
     * Sync's own overview so the rule lives in one place. Returns [] if that cannot be read, in which
     * case the page simply offers no bulk removal and still links to Captain Sync.
     */
    private static function removal_map(): array {
        if ( ! class_exists( 'GRSH_Captain_Sync' ) ) {
            return [];
        }
        try {
            $overview = GRSH_Captain_Sync::build_overview();
        } catch ( \Throwable $e ) {
            return [];
        }
        $map = [];
        foreach ( (array) ( $overview['teams'] ?? [] ) as $t ) {
            $map[ (int) $t['id'] ] = [
                'bulk_allowed' => ! empty( $t['delete']['allowed'] ),
                'reasons'      => array_values( (array) ( $t['delete']['reasons'] ?? [] ) ),
                'idle_days'    => $t['idle_days'] ?? null,
            ];
        }
        return $map;
    }

    /** team_id => [signed, total] using the same is_signed() the captain page uses. */
    private static function waiver_counts( array $team_ids ): array {
        global $wpdb;
        $out = [];
        if ( ! $team_ids ) {
            return $out;
        }
        $rows = $wpdb->get_results(
            "SELECT team_id, registration_id FROM {$wpdb->prefix}grsh_rosters WHERE team_id IN ("
            . implode( ',', array_map( 'intval', $team_ids ) ) . ')',
            ARRAY_A
        ) ?: [];
        foreach ( $rows as $r ) {
            $tid = (int) $r['team_id'];
            if ( ! isset( $out[ $tid ] ) ) {
                $out[ $tid ] = [ 'signed' => 0, 'total' => 0 ];
            }
            $out[ $tid ]['total']++;
            if ( class_exists( 'GRSH_Waiver_WPForms' ) && GRSH_Waiver_WPForms::is_signed( (int) $r['registration_id'] ) ) {
                $out[ $tid ]['signed']++;
            }
        }
        return $out;
    }

    // -------------------------------------------------------------------------
    // GET /admin/full-teams/removed - recently removed teams (restorable)
    // -------------------------------------------------------------------------

    public static function removed_teams(): WP_REST_Response {
        global $wpdb;
        $logs = "{$wpdb->prefix}grsh_audit_logs";
        $rows = $wpdb->get_results(
            "SELECT id, user_display, object_id, before_value, notes, created_at
             FROM {$logs} WHERE action = 'captain_sync_team_deleted' ORDER BY id DESC LIMIT 20",
            ARRAY_A
        ) ?: [];

        // A removal that was already restored is done with; hide it.
        $restored = [];
        $rr = $wpdb->get_results(
            "SELECT after_value FROM {$logs} WHERE action = 'captain_sync_team_restored' ORDER BY id DESC LIMIT 60",
            ARRAY_A
        ) ?: [];
        foreach ( $rr as $r ) {
            $a = json_decode( (string) $r['after_value'], true );
            if ( ! empty( $a['restored'] ) ) {
                $restored[ (int) $a['restored'] ] = true;
            }
        }

        $out = [];
        foreach ( $rows as $r ) {
            if ( isset( $restored[ (int) $r['id'] ] ) ) {
                continue;
            }
            $snap = json_decode( (string) $r['before_value'], true );
            if ( ! is_array( $snap ) ) {
                continue;
            }
            $exists = (bool) $wpdb->get_var( $wpdb->prepare(
                "SELECT id FROM {$wpdb->prefix}grsh_teams WHERE id = %d", (int) $r['object_id']
            ) );
            $out[] = [
                'audit_id'    => (int) $r['id'],
                'team_id'     => (int) $r['object_id'],
                'name'        => (string) ( $snap['name'] ?? '' ),
                'division'    => (string) ( $snap['division'] ?? '' ),
                'players'     => isset( $snap['_rosters'] ) && is_array( $snap['_rosters'] ) ? count( $snap['_rosters'] ) : 0,
                'removed_by'  => (string) $r['user_display'],
                'removed_at'  => (string) $r['created_at'],
                'can_restore' => ! $exists,
                'notes'       => (string) $r['notes'],
            ];
        }
        return new WP_REST_Response( $out, 200 );
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
        if ( class_exists( 'GRSH_Team_Review' ) ) {
            $body = (array) $request->get_json_params();
            GRSH_Team_Review::board_set( $team_id, 'changes_requested', (string) ( $body['note'] ?? '' ), wp_get_current_user()->display_name );
        }
        return new WP_REST_Response(
            GRSH_Captain_Roster::format_team_for_board( $team_id, (int) $team['season_id'] ), 200
        );
    }

    // -------------------------------------------------------------------------
    // POST /admin/full-teams/{team_id}/review - set the status the captain sees
    // -------------------------------------------------------------------------

    public static function review_team( WP_REST_Request $request ): WP_REST_Response {
        $team_id = (int) $request->get_param( 'team_id' );
        $team    = self::find_team( $team_id );
        if ( ! $team ) {
            return new WP_REST_Response( [ 'error' => 'Team not found.' ], 404 );
        }
        $body   = (array) $request->get_json_params();
        $result = GRSH_Team_Review::board_set(
            $team_id,
            (string) ( $body['status'] ?? '' ),
            (string) ( $body['note'] ?? '' ),
            wp_get_current_user()->display_name
        );
        if ( empty( $result['ok'] ) ) {
            return new WP_REST_Response( [ 'error' => $result['error'] ?? 'Could not update the status.' ], 400 );
        }
        return new WP_REST_Response(
            GRSH_Captain_Roster::format_team_for_board( $team_id, (int) $team['season_id'] ), 200
        );
    }
}
