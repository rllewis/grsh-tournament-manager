<?php
/**
 * GRSH Scoring — Draft & Roster Score Engine
 *
 * Server-side mirror of src/lib/playerScoring.js. Every constant and formula
 * here MUST stay in sync with that file — if one changes, change both.
 *
 * This file is listed in the plugin bootstrap's $grsh_includes array
 * ('class-grsh-scoring.php' — "Draft score engine") but did not exist on
 * disk before this. That means GRSH_Scoring has not been computing or
 * validating any score server-side — draft scores were client-side only.
 * Creating this file also backfills that gap for the existing draft engine,
 * not just the new full-team roster feature.
 *
 * wp_grsh_teams.skill_score / age_score / parity_score are 0-100 scale,
 * per GRSH_Reports::get_parity() banding (65-80 = balanced). The methods
 * here are the only place that scale should be produced, so draft-built
 * and full-team (captain-registered) teams stay comparable.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class GRSH_Scoring {

    // -----------------------------------------------------------------
    // Tier value lookup — must match TIER_VALUES in playerScoring.js
    // -----------------------------------------------------------------

    public const TIER_VALUES = [
        'A1' => 15, 'A2' => 14, 'A3' => 13,
        'B1' => 11, 'B2' => 10, 'B3' =>  9,
        'C1' =>  7, 'C2' =>  6,
        'R1' =>  5, 'R2' =>  4, 'R3' =>  3,
    ];

    public const YEARS_CAP        = 60;
    public const YEARS_DIVISOR    = 5;
    public const ADJUSTMENT_RANGE = 5;

    // Highest possible single-player score: top tier + max years contrib +
    // max adjustment. Used to normalise the 0-100 team-level scores.
    public const MAX_PLAYER_SCORE = 32; // 15 + (60/5) + 5

    // Full-team (captain-registered) roster rules — separate from the
    // per-division min_roster/max_roster/goalie_min/goalie_max in
    // GRSH_Settings, which apply only to draft-built teams.
    public const FULL_TEAM_MIN_PLAYERS = 11;
    public const FULL_TEAM_MAX_PLAYERS = 15;
    public const FULL_TEAM_GOALIE_MIN  = 1;
    public const FULL_TEAM_GOALIE_MAX  = 1;

    // Parity banding thresholds — must match GRSH_Reports::get_parity().
    public const PARITY_REBALANCE_LOW  = 60;
    public const PARITY_REVIEW_LOW     = 65;
    public const PARITY_REVIEW_HIGH    = 80;
    public const PARITY_REBALANCE_HIGH = 85;

    /**
     * Composite draft score for one player.
     * Formula: tier_value + min(years, 60) / 5 + committee_adjustment
     */
    public static function compute_score( string $tier, int $years = 0, float $adjustment = 0 ): float {
        $tier_value    = self::TIER_VALUES[ $tier ] ?? 0;
        $capped_years  = min( max( $years, 0 ), self::YEARS_CAP );
        $years_contrib = $capped_years / self::YEARS_DIVISOR;
        $clamped       = max( -self::ADJUSTMENT_RANGE, min( self::ADJUSTMENT_RANGE, $adjustment ) );

        return round( ( $tier_value + $years_contrib + $clamped ) * 10 ) / 10;
    }

    /**
     * Normalise a raw compute_score() result to a 0-100 scale for storage
     * in wp_grsh_teams.skill_score, comparable across draft and full_team.
     */
    public static function normalize_to_100( float $raw_score ): float {
        return round( ( $raw_score / self::MAX_PLAYER_SCORE ) * 100, 1 );
    }

    /**
     * Average normalised skill score across a list of players, 0-100.
     * Each $player is ['tier' => string, 'years' => int, 'adjustment' => float].
     */
    public static function team_skill_score( array $players ): ?float {
        if ( empty( $players ) ) {
            return null;
        }
        $total = 0;
        foreach ( $players as $p ) {
            $total += self::compute_score(
                $p['tier'] ?? '',
                (int) ( $p['years'] ?? 0 ),
                (float) ( $p['adjustment'] ?? 0 )
            );
        }
        return self::normalize_to_100( $total / count( $players ) );
    }

    /**
     * Literal team average age — NOT normalised to 0-100, stored as-is in
     * wp_grsh_teams.age_score. This is a descriptive stat, not a balance
     * sub-score, per the full-team roster spec.
     */
    public static function team_average_age( array $ages ): ?float {
        $ages = array_filter( $ages, fn( $a ) => $a !== null && $a !== '' );
        if ( empty( $ages ) ) {
            return null;
        }
        return round( array_sum( $ages ) / count( $ages ), 1 );
    }

    /**
     * Parity relative to peer full-teams in the same division/season —
     * NOT an absolute score against MAX_PLAYER_SCORE. A recreational
     * roster can be perfectly balanced even though its raw skill_score is
     * naturally low against an elite-tier ceiling; what actually matters
     * for fairness is whether this team is roughly as strong as the teams
     * it will compete against. 80 at zero deviation (top of "balanced"),
     * falling toward 0 as deviation grows, either direction. With no peer
     * data yet (first team registered in a division), 72.5 is returned —
     * a neutral mid-"balanced" default rather than a misleading verdict.
     */
    public static function relative_parity_score( float $my_score, ?float $division_avg ): float {
        if ( $division_avg === null || $division_avg <= 0 ) {
            return 72.5;
        }
        $deviation = abs( $my_score - $division_avg ) / $division_avg;
        return max( 0, min( 100, 80 - ( $deviation * 60 ) ) );
    }

    /**
     * Parity banding label — mirrors GRSH_Reports::get_parity() exactly so
     * the board report, board pack PDF, and any captain-facing UI agree.
     */
    public static function parity_action( ?float $parity ): string {
        if ( $parity === null ) {
            return 'balanced';
        }
        if ( $parity < self::PARITY_REBALANCE_LOW || $parity > self::PARITY_REBALANCE_HIGH ) {
            return 'rebalance';
        }
        if ( $parity < self::PARITY_REVIEW_LOW || $parity > self::PARITY_REVIEW_HIGH ) {
            return 'review';
        }
        return 'balanced';
    }

    /**
     * Sandbagging detection — mirrors isSandbagging() in playerScoring.js.
     */
    public static function is_sandbagging( string $tier, string $division_requested ): bool {
        $band = $tier !== '' ? $tier[0] : '';
        if ( $band === 'A' && $division_requested !== 'gold_open' ) {
            return true;
        }
        if ( $band === 'B' && in_array( $division_requested, [ 'senior_b', 'senior_c' ], true ) ) {
            return true;
        }
        return false;
    }
}
