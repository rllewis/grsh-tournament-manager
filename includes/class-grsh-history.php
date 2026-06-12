<?php
/**
 * GRSH History — REST API endpoints for player history page.
 *
 * GET /wp-json/grsh/v1/history/players  → players with multi-season history
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

class GRSH_History {

    public static function register_hooks(): void {
        add_action( 'rest_api_init', [ __CLASS__, 'register_routes' ] );
    }

    public static function register_routes(): void {
        register_rest_route( 'grsh/v1', '/history/players', [
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => [ __CLASS__, 'get_players' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );
    }

    public static function check_permission(): bool {
        return current_user_can( 'manage_options' ) || current_user_can( 'grsh_committee' );
    }

    public static function get_players( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;

        // Players with at least one history record
        $players = $wpdb->get_results(
            "SELECT
                p.id, p.first_name, p.last_name, p.email,
                p.position, p.skill_tier_reported, p.skill_tier_assigned,
                p.sandbagging_flag, p.no_show_count, p.attendance_rating
             FROM {$wpdb->prefix}grsh_players p
             WHERE EXISTS (
                SELECT 1 FROM {$wpdb->prefix}grsh_player_history h WHERE h.player_id = p.id
             )
             ORDER BY p.last_name ASC, p.first_name ASC",
            ARRAY_A
        ) ?: [];

        if ( empty( $players ) ) {
            // No history yet — return current season players with empty history
            $players = $wpdb->get_results(
                "SELECT p.id, p.first_name, p.last_name, p.email,
                        p.position, p.skill_tier_reported, p.skill_tier_assigned,
                        p.sandbagging_flag, p.no_show_count, p.attendance_rating
                 FROM {$wpdb->prefix}grsh_players p
                 ORDER BY p.last_name ASC",
                ARRAY_A
            ) ?: [];
        }

        $player_ids = array_column( $players, 'id' );

        // Fetch all history rows for these players
        $history_rows = ! empty( $player_ids )
            ? $wpdb->get_results(
                "SELECT h.*, s.season_year
                 FROM {$wpdb->prefix}grsh_player_history h
                 JOIN {$wpdb->prefix}grsh_seasons s ON s.id = h.season_id
                 WHERE h.player_id IN (" . implode( ',', array_map( 'absint', $player_ids ) ) . ")
                 ORDER BY s.season_year DESC",
                ARRAY_A
            ) : [];

        // Group history by player
        $history_by_player = [];
        foreach ( $history_rows as $row ) {
            $history_by_player[ $row['player_id'] ][] = [
                'season'          => (int) $row['season_year'],
                'division'        => $row['division']        ?? '',
                'team'            => $row['team_name']       ?? '',
                'finish'          => $row['finish_position'] ? (int) $row['finish_position'] : null,
                'championship'    => $row['championship']    ?? 'none',
                'was_captain'     => (bool) $row['was_captain'],
                'was_alternate'   => (bool) $row['was_alternate'],
                'skill_tier'      => $row['skill_tier']      ?? '',
                'games_scheduled' => (int) ( $row['games_scheduled'] ?? 0 ),
                'games_attended'  => (int) ( $row['games_attended']  ?? 0 ),
                'no_show'         => (int) ( $row['no_show_count']   ?? 0 ),
            ];
        }

        $result = array_map( function( $player ) use ( $history_by_player ) {
            return [
                'id'                  => (int) $player['id'],
                'first_name'          => $player['first_name'],
                'last_name'           => $player['last_name'],
                'email'               => $player['email'],
                'position'            => $player['position']            ?: null,
                'skill_tier_reported' => $player['skill_tier_reported'] ?? '',
                'skill_tier_assigned' => $player['skill_tier_assigned'] ?: null,
                'sandbagging_flag'    => (bool) $player['sandbagging_flag'],
                'no_show_count'       => (int) ( $player['no_show_count']    ?? 0 ),
                'attendance_rating'   => $player['attendance_rating'] !== null
                                        ? (float) $player['attendance_rating'] : null,
                'history'             => $history_by_player[ $player['id'] ] ?? [],
            ];
        }, $players );

        return new WP_REST_Response( $result, 200 );
    }
}
