<?php
/**
 * GRSH Team Review - what happens to a captain's roster after they submit it.
 *
 * Until now "submit" only set grsh_teams.draft_locked = 1 and the captain heard
 * nothing back. This class adds a small status record per team (kept in one
 * option so no schema change is needed):
 *
 *   submitted          captain submitted, board has not looked yet
 *   under_review       board is looking at it
 *   approved           board approved it
 *   changes_requested  board sent it back (team is unlocked, note shown to captain)
 *   change_pending     captain asked for a change after submitting
 *
 * It also sends the plain-text emails around those moments and runs a daily
 * waiver digest to captains. Email respects Settings > email_roster.
 *
 * Board-side: POST /admin/full-teams/{id}/review (see GRSH_Admin_Full_Teams).
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class GRSH_Team_Review {

    const OPT            = 'grsh_team_review';
    const DIGEST_HOOK    = 'grsh_captain_waiver_digest_daily';
    const DIGEST_MIN_GAP = 259200; // 3 days: resend an unchanged digest at most this often

    const LABELS = [
        'submitted'         => 'Submitted',
        'under_review'      => 'Under review',
        'approved'          => 'Approved',
        'changes_requested' => 'Changes requested',
        'change_pending'    => 'Change request sent',
    ];

    public static function register_hooks(): void {
        add_action( self::DIGEST_HOOK, [ __CLASS__, 'run_digest' ] );
        add_action( 'init', [ __CLASS__, 'ensure_scheduled' ] );
    }

    public static function ensure_scheduled(): void {
        if ( ! wp_next_scheduled( self::DIGEST_HOOK ) ) {
            wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', self::DIGEST_HOOK );
        }
    }

    public static function unschedule(): void {
        wp_clear_scheduled_hook( self::DIGEST_HOOK );
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    public static function get( int $team_id ): array {
        $all  = get_option( self::OPT, [] );
        $meta = ( is_array( $all ) && isset( $all[ $team_id ] ) && is_array( $all[ $team_id ] ) ) ? $all[ $team_id ] : [];
        return $meta + [
            'status'         => '',
            'submitted_at'   => null,
            'updated_at'     => null,
            'board_note'     => '',
            'change_request' => '',
            'history'        => [],
            'digest'         => [],
        ];
    }

    private static function save( int $team_id, array $meta ): void {
        $all = get_option( self::OPT, [] );
        if ( ! is_array( $all ) ) {
            $all = [];
        }
        $meta['updated_at'] = gmdate( 'c' );
        $all[ $team_id ]    = $meta;
        update_option( self::OPT, $all, false );
    }

    private static function add_history( array $meta, string $event, string $note = '', string $by = '' ): array {
        $meta['history'][] = [ 'at' => gmdate( 'c' ), 'event' => $event, 'note' => $note, 'by' => $by ];
        $meta['history']   = array_slice( $meta['history'], -30 );
        return $meta;
    }

    private static function cut( string $s, int $n ): string {
        return function_exists( 'mb_substr' ) ? mb_substr( $s, 0, $n ) : substr( $s, 0, $n );
    }

    /**
     * What the captain is allowed to see. $locked is the live draft_locked flag
     * so a team submitted before this feature existed still shows as Submitted.
     */
    public static function public_view( int $team_id, bool $locked ): array {
        $m      = self::get( $team_id );
        $status = (string) $m['status'];
        if ( $status === '' && $locked ) {
            $status = 'submitted';
        }
        $history = [];
        foreach ( array_slice( (array) $m['history'], -6 ) as $h ) {
            $history[] = [
                'at'    => $h['at'] ?? null,
                'event' => $h['event'] ?? '',
                'note'  => $h['note'] ?? '',
            ];
        }
        return [
            'status'         => $status,
            'label'          => self::LABELS[ $status ] ?? '',
            'submitted_at'   => $m['submitted_at'],
            'updated_at'     => $m['updated_at'],
            'board_note'     => (string) $m['board_note'],
            'change_request' => (string) $m['change_request'],
            'history'        => $history,
        ];
    }

    // ---------------------------------------------------------------------
    // Captain actions
    // ---------------------------------------------------------------------

    public static function mark_submitted( int $team_id ): void {
        $m                   = self::get( $team_id );
        $m['status']         = 'submitted';
        $m['submitted_at']   = gmdate( 'c' );
        $m['board_note']     = '';
        $m['change_request'] = '';
        $m                   = self::add_history( $m, 'Roster submitted', '', 'captain' );
        self::save( $team_id, $m );

        $t = self::team_row( $team_id );
        if ( ! $t ) {
            return;
        }
        $n = (int) $t['player_count'];
        self::mail_captain( $team_id, 'We got your roster for ' . $t['name'],
            "Hi {$t['captain_first']},\n\n"
            . "We got your roster for {$t['name']} ({$t['division_label']}) with {$n} player" . ( $n === 1 ? '' : 's' ) . ".\n\n"
            . "The board will review it. You can see where it stands on your roster page:\n" . self::roster_url() . "\n\n"
            . "If you need to change anything after submitting, use the Request a change button on that page.\n\n"
            . "Gold Rush Senior Hockey"
        );
        self::mail_board( 'Roster submitted: ' . $t['name'] . ' (' . $t['division_label'] . ')',
            "{$t['name']} ({$t['division_label']}) submitted a roster with {$n} player" . ( $n === 1 ? '' : 's' ) . ".\n"
            . "Captain: {$t['captain_name']}\n\n"
            . "Review it in the GRSH admin under Full Teams."
        );
    }

    /** @return array{ok:bool,error?:string} */
    public static function request_change( int $team_id, string $message ): array {
        $message = trim( wp_strip_all_tags( $message ) );
        if ( strlen( $message ) < 10 ) {
            return [ 'ok' => false, 'error' => 'Tell us what you need changed, in a sentence or two.' ];
        }
        $message = self::cut( $message, 1000 );

        $m                   = self::get( $team_id );
        $m['status']         = 'change_pending';
        $m['change_request'] = $message;
        $m                   = self::add_history( $m, 'Change requested', $message, 'captain' );
        self::save( $team_id, $m );

        $t = self::team_row( $team_id );
        if ( $t ) {
            self::mail_board( 'Roster change request: ' . $t['name'] . ' (' . $t['division_label'] . ')',
                "{$t['captain_name']} asked for a change to the {$t['name']} roster:\n\n{$message}\n\n"
                . "To let them edit, open the team in the GRSH admin under Full Teams and choose Send back for changes."
            );
            self::mail_captain( $team_id, 'We got your change request for ' . $t['name'],
                "Hi {$t['captain_first']},\n\nWe got your request:\n\n{$message}\n\n"
                . "The board will follow up. You can check the status on your roster page:\n" . self::roster_url() . "\n\nGold Rush Senior Hockey"
            );
        }
        return [ 'ok' => true ];
    }

    // ---------------------------------------------------------------------
    // Board actions
    // ---------------------------------------------------------------------

    /** @return array{ok:bool,error?:string} */
    public static function board_set( int $team_id, string $status, string $note = '', string $by = 'board' ): array {
        global $wpdb;
        $allowed = [ 'submitted', 'under_review', 'approved', 'changes_requested' ];
        if ( ! in_array( $status, $allowed, true ) ) {
            return [ 'ok' => false, 'error' => 'Unknown status.' ];
        }
        $note = self::cut( trim( wp_strip_all_tags( $note ) ), 1000 );

        $m               = self::get( $team_id );
        $m['status']     = $status;
        $m['board_note'] = $note;
        // approved / under_review keep any open change request visible to the board.
        if ( in_array( $status, [ 'changes_requested', 'submitted' ], true ) ) {
            $m['change_request'] = '';
        }
        $m = self::add_history( $m, self::LABELS[ $status ], $note, $by );
        self::save( $team_id, $m );

        $t = self::team_row( $team_id );

        if ( $status === 'changes_requested' ) {
            $wpdb->update( "{$wpdb->prefix}grsh_teams", [ 'draft_locked' => 0 ], [ 'id' => $team_id ] );
            if ( $t ) {
                self::mail_captain( $team_id, 'Your roster needs changes: ' . $t['name'],
                    "Hi {$t['captain_first']},\n\nThe board sent your {$t['name']} roster back so you can edit it."
                    . ( $note !== '' ? "\n\nNote from the board:\n{$note}" : '' )
                    . "\n\nMake your changes and submit again on your roster page:\n" . self::roster_url() . "\n\nGold Rush Senior Hockey"
                );
            }
        } elseif ( $status === 'approved' && $t ) {
            self::mail_captain( $team_id, 'Your roster is approved: ' . $t['name'],
                "Hi {$t['captain_first']},\n\nThe board approved your {$t['name']} roster."
                . ( $note !== '' ? "\n\nNote from the board:\n{$note}" : '' )
                . "\n\nNeed a change later? Use Request a change on your roster page:\n" . self::roster_url() . "\n\nGold Rush Senior Hockey"
            );
        }
        return [ 'ok' => true ];
    }

    // ---------------------------------------------------------------------
    // Waiver digest (daily cron)
    // ---------------------------------------------------------------------

    public static function run_digest(): void {
        global $wpdb;
        if ( ! self::email_enabled() ) {
            return;
        }
        $year  = (int) ( GRSH_Settings::get()['season_year'] ?? 0 );
        $teams = $wpdb->get_results( $wpdb->prepare(
            "SELECT t.id FROM {$wpdb->prefix}grsh_teams t
             JOIN {$wpdb->prefix}grsh_seasons s ON s.id = t.season_id
             WHERE t.team_type = 'full_team' AND s.season_year = %d",
            $year
        ), ARRAY_A ) ?: [];

        foreach ( $teams as $row ) {
            $team_id = (int) $row['id'];
            $rows    = $wpdb->get_results( $wpdb->prepare(
                "SELECT r.id AS registration_id, p.first_name, p.last_name
                 FROM {$wpdb->prefix}grsh_rosters ro
                 JOIN {$wpdb->prefix}grsh_players p ON p.id = ro.player_id
                 JOIN {$wpdb->prefix}grsh_registrations r ON r.id = ro.registration_id
                 WHERE ro.team_id = %d ORDER BY ro.id ASC",
                $team_id
            ), ARRAY_A ) ?: [];
            if ( ! $rows ) {
                continue;
            }

            $lines = [];
            $sig   = [];
            foreach ( $rows as $r ) {
                $reg = (int) $r['registration_id'];
                if ( GRSH_Waiver_WPForms::is_signed( $reg ) ) {
                    continue;
                }
                $ws     = GRSH_Waiver_WPForms::status_for( $reg, false );
                $name   = trim( $r['first_name'] . ' ' . $r['last_name'] );
                $sig[]  = $reg . ':' . $ws['status'];
                if ( $ws['status'] === 'failed' ) {
                    $lines[] = "- {$name}: the email did not go through. Check the address on your roster page.";
                } elseif ( $ws['status'] === 'sent' && $ws['sent_at'] ) {
                    $days    = max( 0, (int) floor( ( time() - (int) $ws['sent_at'] ) / DAY_IN_SECONDS ) );
                    $lines[] = "- {$name}: emailed " . ( $days === 0 ? 'today' : $days . ' day' . ( $days === 1 ? '' : 's' ) . ' ago' ) . ', not signed yet.';
                } else {
                    $lines[] = "- {$name}: no waiver email sent yet.";
                }
            }
            if ( ! $lines ) {
                continue; // everyone signed
            }

            $meta = self::get( $team_id );
            $hash = md5( implode( '|', $sig ) );
            $last = (int) ( $meta['digest']['sent_at'] ?? 0 );
            if ( ( $meta['digest']['sig'] ?? '' ) === $hash && ( time() - $last ) < self::DIGEST_MIN_GAP ) {
                continue; // nothing changed and we mailed recently
            }

            $t = self::team_row( $team_id );
            if ( ! $t ) {
                continue;
            }
            $total  = count( $rows );
            $signed = $total - count( $lines );
            $shown  = array_slice( $lines, 0, 25 );
            $more   = count( $lines ) > 25 ? "\n(and " . ( count( $lines ) - 25 ) . ' more)' : '';
            $sent   = self::mail_captain( $team_id, 'Waiver update for ' . $t['name'] . ': ' . $signed . ' of ' . $total . ' signed',
                "Hi {$t['captain_first']},\n\n{$signed} of {$total} players on {$t['name']} have signed their waiver. Still waiting on:\n\n"
                . implode( "\n", $shown ) . $more
                . "\n\nYou can resend a waiver or remind everyone on your roster page:\n" . self::roster_url() . "\n\nGold Rush Senior Hockey"
            );
            if ( $sent ) {
                $meta['digest'] = [ 'sig' => $hash, 'sent_at' => time() ];
                self::save( $team_id, $meta );
            }
        }
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    private static function email_enabled(): bool {
        $s = class_exists( 'GRSH_Settings' ) ? GRSH_Settings::get() : [];
        return ! ( array_key_exists( 'email_roster', $s ) && ! $s['email_roster'] );
    }

    private static function roster_url(): string {
        return (string) apply_filters( 'grsh_captain_roster_url', home_url( '/roster/' ) );
    }

    private static function headers(): array {
        return class_exists( 'GRSH_Settings' ) ? GRSH_Settings::mail_headers() : [];
    }

    /** @return array<string,mixed>|null */
    private static function team_row( int $team_id ): ?array {
        global $wpdb;
        $t = $wpdb->get_row( $wpdb->prepare(
            "SELECT t.id, t.name, t.division, t.captain_player_id,
                    p.first_name, p.last_name, p.email
             FROM {$wpdb->prefix}grsh_teams t
             LEFT JOIN {$wpdb->prefix}grsh_players p ON p.id = t.captain_player_id
             WHERE t.id = %d",
            $team_id
        ), ARRAY_A );
        if ( ! $t ) {
            return null;
        }
        $label = $t['division'];
        foreach ( GRSH_Settings::get_active_divisions() as $d ) {
            if ( $d['key'] === $t['division'] ) {
                $label = $d['label'];
                break;
            }
        }
        $count = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->prefix}grsh_rosters WHERE team_id = %d", $team_id
        ) );
        $first = trim( (string) $t['first_name'] );
        return [
            'name'           => $t['name'],
            'division_label' => $label,
            'captain_first'  => $first !== '' ? $first : 'there',
            'captain_name'   => trim( $t['first_name'] . ' ' . $t['last_name'] ),
            'captain_email'  => (string) $t['email'],
            'player_count'   => $count,
        ];
    }

    private static function mail_captain( int $team_id, string $subject, string $body ): bool {
        if ( ! self::email_enabled() ) {
            return false;
        }
        $t = self::team_row( $team_id );
        if ( ! $t || ! is_email( $t['captain_email'] ) ) {
            return false;
        }
        return (bool) wp_mail( $t['captain_email'], $subject, $body, self::headers() );
    }

    private static function mail_board( string $subject, string $body ): bool {
        $to = (string) apply_filters( 'grsh_board_notification_email', get_option( 'admin_email' ) );
        if ( ! is_email( $to ) ) {
            return false;
        }
        return (bool) wp_mail( $to, $subject, $body, self::headers() );
    }
}
