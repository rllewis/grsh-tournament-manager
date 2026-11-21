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

        // Duplicate handling — registered BEFORE the /{id} route.
        register_rest_route( 'grsh/v1', '/players/merge', [
            'methods'             => 'POST',
            'callback'            => [ __CLASS__, 'merge_players' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );
        register_rest_route( 'grsh/v1', '/players/not-duplicate', [
            'methods'             => 'POST',
            'callback'            => [ __CLASS__, 'dismiss_duplicate' ],
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

    // -------------------------------------------------------------------------
    // POST /grsh/v1/players/not-duplicate   { a, b }
    // Remembers that two records were reviewed and are different people.
    // -------------------------------------------------------------------------
    public static function dismiss_duplicate( WP_REST_Request $request ): WP_REST_Response {
        $a = absint( $request->get_param( 'a' ) );
        $b = absint( $request->get_param( 'b' ) );
        if ( ! $a || ! $b || $a === $b ) {
            return new WP_REST_Response( [ 'error' => 'Two different player ids are required.' ], 400 );
        }
        $key  = min( $a, $b ) . '-' . max( $a, $b );
        $list = (array) get_option( 'grsh_dismissed_dupes', [] );
        if ( ! in_array( $key, $list, true ) ) {
            $list[] = $key;
            update_option( 'grsh_dismissed_dupes', $list, false );
        }
        return new WP_REST_Response( [ 'ok' => true, 'key' => $key ], 200 );
    }

    // -------------------------------------------------------------------------
    // POST /grsh/v1/players/merge   { keep_id, remove_id }
    //
    // Folds the "remove" player into the "keep" player: every row that points at
    // the removed player (history, registrations, rosters, availability, renewal
    // invites, team captain, ...) is re-pointed at the kept player, empty fields
    // on the kept player are filled from the removed one, the removed player's
    // email is recorded in the kept player's notes, and the removed row is
    // deleted. All-or-nothing: any database error rolls everything back.
    //
    // Refuses when both players have a history or registration row for the
    // SAME season — that means they are two different people, not a duplicate.
    // -------------------------------------------------------------------------
    public static function merge_players( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;

        $keep_id   = absint( $request->get_param( 'keep_id' ) );
        $remove_id = absint( $request->get_param( 'remove_id' ) );
        if ( ! $keep_id || ! $remove_id || $keep_id === $remove_id ) {
            return new WP_REST_Response( [ 'error' => 'Choose two different players.' ], 400 );
        }

        $pt   = "{$wpdb->prefix}grsh_players";
        $keep = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $pt WHERE id = %d", $keep_id ), ARRAY_A );
        $rem  = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $pt WHERE id = %d", $remove_id ), ARRAY_A );
        if ( ! $keep || ! $rem ) {
            return new WP_REST_Response( [ 'error' => 'One of those players no longer exists. Reload the page.' ], 404 );
        }

        // Same-season guard.
        foreach ( [ 'grsh_player_history' => 'history', 'grsh_registrations' => 'registration' ] as $tbl => $label ) {
            $clash = $wpdb->get_col( $wpdb->prepare(
                "SELECT a.season_id FROM {$wpdb->prefix}$tbl a
                 JOIN {$wpdb->prefix}$tbl b ON b.season_id = a.season_id AND b.player_id = %d
                 WHERE a.player_id = %d",
                $keep_id, $remove_id
            ) );
            if ( $clash ) {
                return new WP_REST_Response( [
                    'error' => "Both records have a $label row for the same season. That means they are two different people, so they were not merged.",
                ], 409 );
            }
        }

        // Every table that references a player.
        $refs = $wpdb->get_results( $wpdb->prepare(
            "SELECT TABLE_NAME AS t, COLUMN_NAME AS c
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME LIKE %s
               AND COLUMN_NAME IN ('player_id','captain_player_id')
               AND TABLE_NAME <> %s",
            $wpdb->esc_like( $wpdb->prefix . 'grsh_' ) . '%',
            "{$wpdb->prefix}grsh_audit_logs"
        ), ARRAY_A );

        $wpdb->suppress_errors( true );
        $wpdb->query( 'START TRANSACTION' );
        $moved  = [];
        $failed = '';

        foreach ( (array) $refs as $r ) {
            $wpdb->query( $wpdb->prepare(
                "UPDATE `{$r['t']}` SET `{$r['c']}` = %d WHERE `{$r['c']}` = %d",
                $keep_id, $remove_id
            ) );
            if ( $wpdb->last_error ) {
                $failed = $wpdb->last_error;
                break;
            }
            if ( $wpdb->rows_affected ) {
                $moved[ $r['t'] ] = (int) $wpdb->rows_affected;
            }
        }

        if ( ! $failed ) {
            // Fill gaps on the kept record; keep a trace of the removed identity.
            $fill = [ 'phone', 'position', 'skill_tier_reported', 'years_experience',
                      'jersey_size', 'tshirt_size', 'tshirt_type', 'current_league', 'wp_user_id' ];
            $upd = [];
            foreach ( $fill as $f ) {
                if ( ( ! isset( $keep[ $f ] ) || $keep[ $f ] === '' || $keep[ $f ] === null )
                     && isset( $rem[ $f ] ) && $rem[ $f ] !== '' && $rem[ $f ] !== null ) {
                    $upd[ $f ] = $rem[ $f ];
                }
            }
            $stamp = sprintf( 'Merged from #%d (%s %s, %s) on %s.',
                $remove_id, $rem['first_name'], $rem['last_name'], $rem['email'], current_time( 'Y-m-d' ) );
            $upd['notes'] = trim( ( $keep['notes'] ?? '' ) . "\n" . $stamp );
            $wpdb->update( $pt, $upd, [ 'id' => $keep_id ] );
            if ( $wpdb->last_error ) {
                $failed = $wpdb->last_error;
            }
        }

        if ( ! $failed ) {
            $wpdb->delete( $pt, [ 'id' => $remove_id ], [ '%d' ] );
            if ( $wpdb->last_error ) {
                $failed = $wpdb->last_error;
            }
        }

        if ( $failed ) {
            $wpdb->query( 'ROLLBACK' );
            $wpdb->suppress_errors( false );
            return new WP_REST_Response( [
                'error' => 'Merge failed and was rolled back; nothing changed. (' . $failed . ')',
            ], 500 );
        }

        $wpdb->query( 'COMMIT' );
        $wpdb->suppress_errors( false );

        $wpdb->insert( "{$wpdb->prefix}grsh_audit_logs", [
            'season_id'    => null,
            'wp_user_id'   => get_current_user_id() ?: 0,
            'user_display' => wp_get_current_user()->display_name ?? 'system',
            'action'       => 'player_merged',
            'object_type'  => 'player',
            'object_id'    => $keep_id,
            'before_value' => wp_json_encode( [ 'removed' => $rem ] ),
            'after_value'  => wp_json_encode( [ 'kept_id' => $keep_id, 'moved' => $moved ] ),
            'notes'        => "Merged player #$remove_id into #$keep_id.",
            'ip_address'   => $_SERVER['REMOTE_ADDR'] ?? null,
        ] );

        return new WP_REST_Response( [ 'ok' => true, 'kept_id' => $keep_id, 'removed_id' => $remove_id, 'moved' => $moved ], 200 );
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

        // Merge. Every enabled division gets a card even if count is zero, in the same order and with the
        // same labels and spots as Settings and Rosters. Capacity counts DRAFT spots only (teams x max roster
        // minus the slots Settings gives to registered teams), the same number the Settings readiness uses.
        $result = [];
        foreach ( $active_divisions as $div ) {
            $div        = GRSH_Settings::fill_division( $div );
            $key        = $div['key'];
            $registered = $counts[ $key ] ?? 0;
            list( $draft_teams, $reg_teams ) = GRSH_Settings::slots( $div );
            $capacity   = $draft_teams * (int) $div['max_roster'];
            $pct        = $capacity > 0 ? round( ( $registered / $capacity ) * 100, 1 ) : 0;

            $result[] = [
                'key'         => $key,
                'label'       => $div['label'],
                'enabled'     => true,
                'format'      => $div['format'],
                'teams'       => (int) $div['teams'],
                'draft_teams' => $draft_teams,
                'reg_teams'   => $reg_teams,
                'min_roster'  => (int) $div['min_roster'],
                'max_roster'  => (int) $div['max_roster'],
                'capacity'    => $capacity,
                'registered'  => $registered,
                'pct'         => $pct,
                'status'      => self::capacity_status( $pct ),
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
                r.created_at    AS registered_at,
                ( SELECT MAX(s2.season_year)
                    FROM {$wpdb->prefix}grsh_player_history h2
                    JOIN {$wpdb->prefix}grsh_seasons s2 ON s2.id = h2.season_id
                   WHERE h2.player_id = p.id ) AS last_played_year,
                ( SELECT COUNT(*)
                    FROM {$wpdb->prefix}grsh_player_history h3
                   WHERE h3.player_id = p.id ) AS history_count
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
            'dismissed_duplicates' => array_values( (array) get_option( 'grsh_dismissed_dupes', [] ) ),
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
        // Repair names saved as "First Last" in both columns by the older sync mapper.
        $first = trim( (string) ( $row['first_name'] ?? '' ) );
        $last  = trim( (string) ( $row['last_name']  ?? '' ) );
        if ( $first !== '' && $first === $last && str_contains( $first, ' ' ) ) {
            $parts = explode( ' ', $first, 2 );
            $first = $parts[0];
            $last  = $parts[1];
        }
        $row['first_name'] = $first;
        $row['last_name']  = $last;

        // A player with no registration row for the current season has NOT registered yet
        // (e.g. created from the historical import). Do not default them to
        // "pending" / "registered" — that makes returning players look like unpaid registrants.
        $registered = array_key_exists( 'registration_id', $row ) ? ! empty( $row['registration_id'] ) : true;

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
            'registered_this_season' => $registered,
            'last_played_year'     => ! empty( $row['last_played_year'] ) ? (int) $row['last_played_year'] : null,
            'history_count'        => (int) ( $row['history_count'] ?? 0 ),
            'payment_status'       => $registered ? ( $row['payment_status'] ?? 'pending' ) : null,
            'payment_method'       => $row['payment_method']       ?? '',
            'amount_paid'          => (float) ( $row['amount_paid'] ?? 0 ),
            'status'               => $registered ? ( $row['status'] ?? 'registered' ) : 'returning',
            'committee_notes'      => $row['committee_notes']      ?? '',
            'imported_at'          => $row['imported_at']          ?? null,
            'registered_at'        => $row['registered_at']        ?? null,
        ];
    }
}
