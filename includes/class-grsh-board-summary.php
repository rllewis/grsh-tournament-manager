<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * GRSH_Board_Summary - read-only Tournament Manager summary for the GRSH Board plugin.
 *
 * The Board's "Tournament data" panel (Player Recruitment section), its Finalize snapshot and the PDF
 * inset all call GET /wp-json/grsh/v1/tournament/board-summary. The numbers are the same ones the
 * Rosters tabs and Settings use (GRSH_Rosters::board_rows).
 *
 * PRIVACY: the response goes into minutes that are published and printed, so it holds head counts only.
 * Never a name, email, score, payment detail or note about a person.
 */
class GRSH_Board_Summary {

    public static function register_hooks(): void {
        add_action( 'rest_api_init', [ __CLASS__, 'register_routes' ] );
    }

    public static function register_routes(): void {
        register_rest_route( 'grsh/v1', '/tournament/board-summary', [
            'methods'             => 'GET',
            'callback'            => [ __CLASS__, 'handle' ],
            'permission_callback' => [ __CLASS__, 'can_view' ],
        ] );
    }

    /** Admins, or Board plugin roles that may see integration panels. */
    public static function can_view(): bool {
        return current_user_can( 'manage_options' ) || current_user_can( 'grsh_view_integrations' );
    }

    public static function handle( $request = null ) {
        return rest_ensure_response( self::build() );
    }

    /** Treasurer snapshot: money collected from individual players and from registered teams. Totals only. */
    public static function money(): array {
        $rows = class_exists( 'GRSH_Rosters' ) ? GRSH_Rosters::money_rows() : [];
        $sum  = function ( $k ) use ( $rows ) { return array_sum( array_column( $rows, $k ) ); };
        $pc = round( (float) $sum( 'players_collected' ), 2 );
        $tc = round( (float) $sum( 'teams_collected' ), 2 );
        return [
            'players_collected' => $pc, 'teams_collected' => $tc, 'total_collected' => round( $pc + $tc, 2 ),
            'teams_outstanding' => round( (float) $sum( 'teams_outstanding' ), 2 ),
            'players_registered' => (int) $sum( 'players_registered' ), 'players_paid' => (int) $sum( 'players_paid' ),
            'players_waived' => (int) $sum( 'players_waived' ), 'players_owing' => (int) $sum( 'players_owing' ),
            'players_refunded' => (int) $sum( 'players_refunded' ),
            'teams' => (int) $sum( 'teams' ), 'teams_deposit_paid' => (int) $sum( 'teams_deposit_paid' ), 'teams_paid_full' => (int) $sum( 'teams_paid_full' ),
            'divisions' => $rows,
        ];
    }

    public static function build(): array {
        $rows = class_exists( 'GRSH_Rosters' ) ? GRSH_Rosters::board_rows() : [];
        $sum  = function ( $k ) use ( $rows ) { return (int) array_sum( array_column( $rows, $k ) ); };
        return [
            'season'       => class_exists( 'GRSH_Sync_Engine' ) ? (int) GRSH_Sync_Engine::SEASON : (int) gmdate( 'Y' ),
            'generated_at' => current_time( 'mysql' ),
            'totals'       => [
                'registered' => $sum( 'registered' ), 'unpaid' => $sum( 'unpaid' ),
                'in_draft' => $sum( 'in_draft' ), 'on_teams' => $sum( 'on_teams' ), 'in_pool' => $sum( 'in_pool' ),
                'teams_created' => $sum( 'teams_created' ), 'teams_planned' => $sum( 'teams_planned' ),
                'reg_teams_created' => $sum( 'reg_teams_created' ), 'reg_teams_planned' => $sum( 'reg_teams_planned' ),
                'capacity' => $sum( 'capacity' ),
            ],
            'divisions'    => $rows,
            'money'        => self::money(),
            'admin_link'   => function_exists( 'admin_url' ) ? admin_url( 'admin.php?page=grsh-tm-rosters' ) : '',
        ];
    }
}
