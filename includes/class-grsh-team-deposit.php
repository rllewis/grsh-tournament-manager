<?php
/**
 * GRSH Team Deposit — deposit + tiered total fee tracking for full_team
 * (captain-registered) registrations.
 *
 * v2 (2026-08-20) — the 2027 fee model is now locked in by the board:
 *   - $500 deposit, same for every team, charged via WPForms the moment
 *     a captain submits the deposit form.
 *   - The total team fee is decided automatically the instant the
 *     deposit is paid, by comparing today's date against
 *     Settings.team_fee_early_cutoff_date:
 *       paid on/before cutoff  -> Settings.team_fee_early_amount ($1,750)
 *       paid after cutoff      -> Settings.team_fee_late_amount  ($2,000)
 *     No staff action needed for the normal case. The PATCH route below
 *     still exists as a manual override for real exceptions (e.g. a
 *     board-approved scholarship), but is no longer required.
 *   - The remaining balance (fee_total - 500) is due by
 *     Settings.team_balance_due_date, the same fixed date for every team.
 *
 * Three automated captain-facing emails:
 *   0. Deposit confirmation — sent once, immediately, from
 *      on_deposit_form_submit() itself. States exactly which tier this
 *      team landed in and the resulting balance — without this, a
 *      captain's only feedback was the generic WPForms confirmation
 *      page, and the next email they'd hear from us was the balance
 *      reminder much closer to the deadline.
 *   1. Deposit nudge — sent once, team_deposit_nudge_days before the
 *      early cutoff, to any full_team that hasn't paid a deposit yet.
 *      Encourages paying before the cutoff to lock in $1,750.
 *   2. Balance reminder — sent once, team_balance_reminder_days before
 *      team_balance_due_date, to any team with a deposit paid, a
 *      balance still owed, and no reminder sent yet.
 * Reminders 1 and 2 are both sent by a single daily WP-Cron sweep
 * (DAILY_CRON_HOOK) rather than per-team wp_schedule_single_event
 * calls, since every team shares the same two calendar dates.
 *
 * WHAT STILL NEEDS TO EXIST OUTSIDE THIS FILE:
 *   1. The WPForms deposit form itself (self::FORM_ID is 0 — a
 *      placeholder). See 2027-team-registration-form.json delivered
 *      2026-08-19 — import it, then set FORM_ID to the real ID.
 *   2. That form needs to sit on a page reachable only by a logged-in
 *      captain who already has a team registered — it does NOT create
 *      a team, only records a deposit against an existing one.
 *   3. Confirm/edit team_fee_early_amount / team_fee_late_amount /
 *      team_fee_early_cutoff_date / team_balance_due_date in GRSH →
 *      Settings once that page exposes them (defaults below match the
 *      2027 numbers: $1,750 by 1/6/27, else $2,000, balance due 3/8/27).
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class GRSH_Team_Deposit {

    const FORM_ID = 5181; // 2027-team-registration-form-v3-production, confirmed zero real submissions as of 2026-09-14
    const TEST_FORM_ID = 5178; // '2027 Team Registration Form | TEST' — pre-built $1 QA clone (this org's "Test C"), confirmed to exist 2026-09-14. Charges a real $1 via PayPal but is treated as a test submission end-to-end below: logged only, never written to grsh_teams' financial columns. This is the recommended board-testing path — see the branch in on_deposit_form_submit() below. Do NOT just add this as a second normal FORM_ID: its own field description confirms the backend would otherwise record a fake $500 deposit_amount (pulled from Settings, not from what PayPal actually charged) into the real table.
    const DAILY_CRON_HOOK = 'grsh_team_payment_reminders_daily';

    // Committee / Internal Test FIELD path (2026-09-14) — SUPERSEDED as of
    // the same day once TEST_FORM_ID (above) was confirmed to already
    // exist as a separate $1 QA clone form. Recommendation is to use
    // TEST_FORM_ID for board testing instead of building this field on
    // the live form — it keeps the test path off the live form entirely,
    // so a real captain can never see or misclick a free-bypass option.
    // Left in place, inert (REGISTRATION_TYPE_FIELD_ID stays null), in
    // case a field-level test option is ever wanted in addition. If it's
    // never built, this does nothing — safe to ignore.
    const REGISTRATION_TYPE_FIELD_ID = null;
    const INTERNAL_TEST_VALUE        = 'Committee / Internal Test';

    public static function register_hooks(): void {
        add_action( 'wpforms_process_complete', [ __CLASS__, 'on_deposit_form_submit' ], 10, 4 );
        add_action( 'rest_api_init', [ __CLASS__, 'register_routes' ] );
        add_action( self::DAILY_CRON_HOOK, [ __CLASS__, 'run_daily_reminder_sweep' ] );

        // Self-healing schedule: make sure the daily sweep is queued even
        // if activation never ran it (e.g. plugin updated in place).
        if ( ! wp_next_scheduled( self::DAILY_CRON_HOOK ) ) {
            wp_schedule_event( time(), 'daily', self::DAILY_CRON_HOOK );
        }
    }

    /**
     * Call from grsh_deactivate() so the cron doesn't fire after the
     * plugin is switched off.
     */
    public static function unschedule(): void {
        wp_clear_scheduled_hook( self::DAILY_CRON_HOOK );
    }

    // -------------------------------------------------------------------------
    // WPForms submission → deposit recorded, fee tier decided
    // -------------------------------------------------------------------------

    /**
     * Fires for every WPForms submission sitewide — must self-filter to
     * self::FORM_ID (or self::TEST_FORM_ID), same pattern as
     * GRSH_Captain_Sync::on_form_submit().
     */
    public static function on_deposit_form_submit( array $fields, array $entry, array $form_data, int $entry_id ): void {
        $submitted_form_id = (int) ( $form_data['id'] ?? 0 );
        if ( ! in_array( $submitted_form_id, [ self::FORM_ID, self::TEST_FORM_ID ], true ) ) {
            return;
        }

        $team = self::get_current_users_team();
        if ( ! $team ) {
            self::log_audit(
                'team_deposit_no_team_found', 'team', null, null, null,
                'Deposit form submitted (entry ' . $entry_id . ') but no full_team could be resolved for the logged-in user — deposit NOT recorded. Check manually.'
            );
            return;
        }

        // Test paths — logged only, never written to the team's real
        // financial columns. Two ways in, either is sufficient:
        //   1. The whole submission came through the separate $1 QA
        //      clone form (TEST_FORM_ID) — the recommended path.
        //   2. A "Committee / Internal Test" field was selected on the
        //      live form (REGISTRATION_TYPE_FIELD_ID) — only reachable
        //      if that field is ever added to the live form; as of
        //      2026-09-14 it hasn't been.
        // Checked before the idempotency guard below on purpose: a board
        // tester should be able to submit this more than once (e.g.
        // retesting after a fix) without tripping the "already paid"
        // duplicate-ignore branch that's meant for real deposits.
        $is_test_form  = ( $submitted_form_id === self::TEST_FORM_ID );
        $is_test_field = self::REGISTRATION_TYPE_FIELD_ID
            && self::field_value( $fields, self::REGISTRATION_TYPE_FIELD_ID ) === self::INTERNAL_TEST_VALUE;

        if ( $is_test_form || $is_test_field ) {
            $reason = $is_test_form
                ? 'Submitted via the $1 QA TEST clone form (form ' . self::TEST_FORM_ID . '), entry ' . $entry_id . '.'
                : 'Committee / Internal Test field selected on the live form, entry ' . $entry_id . '.';
            self::log_audit(
                'team_deposit_internal_test', 'team', (int) $team['id'], null, null,
                $reason . ' Team "' . ( $team['team_name'] ?? '' ) . '" — no PayPal-mode dependency, no fee_total/fee_tier/deposit_paid_at/balance_due/payment_status written, no confirmation email sent.'
            );
            return;
        }

        // Idempotency: a duplicate submit / webhook retry should not
        // silently overwrite an already-recorded deposit.
        if ( ! empty( $team['deposit_paid_at'] ) ) {
            self::log_audit(
                'team_deposit_duplicate_ignored', 'team', (int) $team['id'], null, null,
                'Deposit form submitted again (entry ' . $entry_id . ') for a team that already has deposit_paid_at set — ignored.'
            );
            return;
        }

        $settings       = GRSH_Settings::get();
        $deposit_amount = (float) ( $settings['team_deposit_amount'] ?? 500.00 );

        [ $fee_total, $fee_tier ] = self::determine_fee_total( $settings );
        $balance_due = max( 0.0, $fee_total - $deposit_amount );
        $status      = $balance_due <= 0 ? 'paid_in_full' : 'deposit_paid';

        global $wpdb;
        $wpdb->update(
            "{$wpdb->prefix}grsh_teams",
            [
                'fee_total'       => $fee_total,
                'fee_tier'        => $fee_tier,
                'deposit_amount'  => $deposit_amount,
                'deposit_paid_at' => current_time( 'mysql' ),
                'balance_due'     => $balance_due,
                'payment_status'  => $status,
            ],
            [ 'id' => (int) $team['id'] ]
        );

        self::log_audit(
            'team_deposit_paid', 'team', (int) $team['id'], null,
            [ 'deposit_amount' => $deposit_amount, 'fee_total' => $fee_total, 'fee_tier' => $fee_tier, 'balance_due' => $balance_due ],
            'Deposit form entry ' . $entry_id
        );

        // Tell the captain which tier they actually landed in right away —
        // otherwise the only confirmation they get is the generic WPForms
        // page, and the next email they'd hear from us is the balance
        // reminder much closer to the deadline.
        self::send_deposit_confirmation_email( (int) $team['id'], $team, $fee_total, $fee_tier, $balance_due, $deposit_amount, $settings );
    }

    /**
     * Same pattern as GRSH_Captain_Sync::field_value() — WPForms passes
     * $fields keyed by field ID, each entry holding a 'value' key.
     */
    private static function field_value( array $fields, string $field_id ) {
        return $fields[ $field_id ]['value'] ?? null;
    }

    /**
     * Compares today against Settings.team_fee_early_cutoff_date to decide
     * which locked-in total applies. Paid ON the cutoff date still counts
     * as early (inclusive).
     */
    private static function determine_fee_total( array $settings ): array {
        $cutoff = $settings['team_fee_early_cutoff_date'] ?? '';
        $early  = (float) ( $settings['team_fee_early_amount'] ?? 1750.00 );
        $late   = (float) ( $settings['team_fee_late_amount'] ?? 2000.00 );

        if ( $cutoff && strtotime( current_time( 'Y-m-d' ) ) <= strtotime( $cutoff ) ) {
            return [ $early, 'early' ];
        }
        return [ $late, 'late' ];
    }

    /**
     * Immediate confirmation of exactly which tier this team landed in.
     * Fires once, right after the deposit form is processed — separate
     * from (and much earlier than) the balance reminder sent by the
     * daily sweep. Not idempotency-guarded by its own column since
     * on_deposit_form_submit() already blocks duplicate calls via the
     * deposit_paid_at check before this is ever reached.
     */
    private static function send_deposit_confirmation_email(
        int $team_id, array $team, float $fee_total, string $fee_tier,
        float $balance_due, float $deposit_amount, array $settings
    ): void {
        global $wpdb;
        $captain = $team['captain_player_id'] ? $wpdb->get_row( $wpdb->prepare(
            "SELECT first_name, last_name, email FROM {$wpdb->prefix}grsh_players WHERE id = %d",
            (int) $team['captain_player_id']
        ), ARRAY_A ) : null;

        if ( ! $captain || ! is_email( $captain['email'] ) ) {
            self::log_audit(
                'team_deposit_confirmation_no_email', 'team', $team_id, null, null,
                'Could not find a valid captain email — deposit confirmation not sent.'
            );
            return;
        }

        $cutoff       = $settings['team_fee_early_cutoff_date'] ?? '';
        $due_date     = $settings['team_balance_due_date'] ?? '';
        $fee_total_f  = number_format( $fee_total, 2 );
        $balance_f    = number_format( $balance_due, 2 );
        $deposit_f    = number_format( $deposit_amount, 2 );
        $tier_phrase  = $fee_tier === 'early'
            ? "on or before {$cutoff}, so your team's total fee locks in at \${$fee_total_f}"
            : "after {$cutoff}, so your team's total fee is \${$fee_total_f}";

        $subject = sprintf( 'GRSH — %s deposit confirmed: $%s total, $%s balance due %s', $team['name'], $fee_total_f, $balance_f, $due_date );
        $body    = sprintf(
            "Hi %s,\n\nYour $%s deposit for %s has been received and your team's spot in the 2027 tournament is reserved.\n\n" .
            "This was paid %s.\n\n" .
            "After the $%s deposit, your remaining balance is $%s, due by %s. We'll send a reminder before then automatically — " .
            "you don't need to follow up with us.\n\nReply to this email or contact GRSH staff with questions.\n\nThanks,\nGold Rush Senior Hockey",
            $captain['first_name'], $deposit_f, $team['name'], $tier_phrase, $deposit_f, $balance_f, $due_date
        );

        /**
         * Lets Lorenzo customize the confirmation copy without touching
         * this file again.
         */
        $body = apply_filters( 'grsh_team_deposit_confirmation_body', $body, $team, $captain, $fee_total, $fee_tier, $balance_due );

        $sent = wp_mail( $captain['email'], $subject, $body, class_exists( 'GRSH_Settings' ) ? GRSH_Settings::mail_headers() : [] );

        self::log_audit(
            'team_deposit_confirmation_sent', 'team', $team_id, null,
            [ 'to' => $captain['email'], 'fee_total' => $fee_total, 'fee_tier' => $fee_tier, 'balance_due' => $balance_due, 'mail_result' => $sent ],
            null
        );
    }

    /**
     * Resolve the logged-in WP user → grsh_players row → their current
     * season's full_team, where they're the captain. Same query shape as
     * GRSH_Captain_Roster::get_my_team() — deliberately not reused via a
     * cross-class call so this file has no hard dependency on that class's
     * internals; if the lookup logic ever changes, update both.
     */
    private static function get_current_users_team(): ?array {
        $user_id = get_current_user_id();
        if ( ! $user_id ) {
            return null;
        }

        global $wpdb;
        $player_id = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}grsh_players WHERE wp_user_id = %d", $user_id
        ) );
        if ( ! $player_id ) {
            return null;
        }

        $season_id = self::get_season_id();

        $team = $wpdb->get_row( $wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}grsh_teams
             WHERE season_id = %d AND captain_player_id = %d AND team_type = 'full_team'
             LIMIT 1",
            $season_id, $player_id
        ), ARRAY_A );

        return $team ?: null;
    }

    private static function get_season_id(): int {
        global $wpdb;
        $season_year = (int) ( GRSH_Settings::get()['season_year'] ?? 0 );
        $id = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}grsh_seasons WHERE season_year = %d LIMIT 1",
            $season_year
        ) );
        return $id ?: 1;
    }

    // -------------------------------------------------------------------------
    // Daily reminder sweep — deposit nudge + balance reminder
    // -------------------------------------------------------------------------

    /**
     * Runs once a day. Both reminders are date-driven off fixed Settings
     * dates shared by every team, so a single sweep (rather than a
     * per-team scheduled event) is simpler and self-correcting if a
     * Settings date changes after the fact.
     */
    public static function run_daily_reminder_sweep(): void {
        self::send_pending_deposit_nudges();
        self::send_pending_balance_reminders();
    }

    private static function send_pending_deposit_nudges(): void {
        $settings = GRSH_Settings::get();
        if ( empty( $settings['email_team_deposit_nudge'] ) ) {
            return;
        }
        $cutoff = $settings['team_fee_early_cutoff_date'] ?? '';
        if ( ! $cutoff ) {
            return;
        }
        $days         = (int) ( $settings['team_deposit_nudge_days'] ?? 10 );
        $window_start = strtotime( $cutoff ) - ( $days * DAY_IN_SECONDS );
        $now          = time();

        // Outside the nudge window (too early, or cutoff already passed) — nothing to do.
        if ( $now < $window_start || $now > strtotime( $cutoff ) ) {
            return;
        }

        global $wpdb;
        $teams = $wpdb->get_results(
            "SELECT * FROM {$wpdb->prefix}grsh_teams
             WHERE team_type = 'full_team' AND deposit_paid_at IS NULL AND deposit_nudge_sent_at IS NULL",
            ARRAY_A
        );

        foreach ( $teams as $team ) {
            self::send_deposit_nudge_email( (int) $team['id'], $team );
        }
    }

    private static function send_deposit_nudge_email( int $team_id, array $team ): void {
        global $wpdb;
        $captain = $team['captain_player_id'] ? $wpdb->get_row( $wpdb->prepare(
            "SELECT first_name, last_name, email FROM {$wpdb->prefix}grsh_players WHERE id = %d",
            (int) $team['captain_player_id']
        ), ARRAY_A ) : null;

        if ( ! $captain || ! is_email( $captain['email'] ) ) {
            self::log_audit(
                'team_deposit_nudge_no_email', 'team', $team_id, null, null,
                'Could not find a valid captain email — deposit nudge not sent.'
            );
            return;
        }

        $settings = GRSH_Settings::get();
        $cutoff   = $settings['team_fee_early_cutoff_date'] ?? '';
        $early    = number_format( (float) ( $settings['team_fee_early_amount'] ?? 1750 ), 2 );
        $late     = number_format( (float) ( $settings['team_fee_late_amount'] ?? 2000 ), 2 );

        $subject = sprintf( 'GRSH — Pay your %s deposit by %s to lock in $%s', $team['name'], $cutoff, $early );
        $body    = sprintf(
            "Hi %s,\n\n%s's $500 deposit hasn't been paid yet. Pay by %s and your team's total fee is $%s. " .
            "After that date it's $%s instead.\n\nReply to this email or contact GRSH staff with questions.\n\nThanks,\nGold Rush Senior Hockey",
            $captain['first_name'], $team['name'], $cutoff, $early, $late
        );

        /**
         * Lets Lorenzo customize the nudge copy without touching this file again.
         */
        $body = apply_filters( 'grsh_team_deposit_nudge_body', $body, $team, $captain );

        $sent = wp_mail( $captain['email'], $subject, $body, class_exists( 'GRSH_Settings' ) ? GRSH_Settings::mail_headers() : [] );

        if ( $sent ) {
            $wpdb->update(
                "{$wpdb->prefix}grsh_teams",
                [ 'deposit_nudge_sent_at' => current_time( 'mysql' ) ],
                [ 'id' => $team_id ]
            );
        }

        self::log_audit(
            'team_deposit_nudge_sent', 'team', $team_id, null,
            [ 'to' => $captain['email'], 'mail_result' => $sent ], null
        );
    }

    private static function send_pending_balance_reminders(): void {
        $settings = GRSH_Settings::get();
        if ( empty( $settings['email_team_balance'] ) ) {
            return;
        }
        $due_date = $settings['team_balance_due_date'] ?? '';
        if ( ! $due_date ) {
            return;
        }
        $days         = (int) ( $settings['team_balance_reminder_days'] ?? 14 );
        $window_start = strtotime( $due_date ) - ( $days * DAY_IN_SECONDS );
        $now          = time();

        if ( $now < $window_start ) {
            return;
        }

        global $wpdb;
        $teams = $wpdb->get_results(
            "SELECT * FROM {$wpdb->prefix}grsh_teams
             WHERE team_type = 'full_team'
               AND deposit_paid_at IS NOT NULL
               AND balance_due IS NOT NULL AND balance_due > 0
               AND balance_paid_at IS NULL
               AND balance_reminder_sent_at IS NULL",
            ARRAY_A
        );

        foreach ( $teams as $team ) {
            self::send_balance_reminder_email( (int) $team['id'], $team );
        }
    }

    /**
     * Cron callback (invoked once per matching team from the daily sweep).
     * Re-checks state before sending — idempotent against duplicate cron
     * fires or a manual re-trigger.
     */
    private static function send_balance_reminder_email( int $team_id, array $team ): void {
        global $wpdb;
        $captain = $team['captain_player_id'] ? $wpdb->get_row( $wpdb->prepare(
            "SELECT first_name, last_name, email FROM {$wpdb->prefix}grsh_players WHERE id = %d",
            (int) $team['captain_player_id']
        ), ARRAY_A ) : null;

        if ( ! $captain || ! is_email( $captain['email'] ) ) {
            self::log_audit(
                'team_balance_reminder_no_email', 'team', $team_id, null, null,
                'Could not find a valid captain email — reminder not sent.'
            );
            return;
        }

        $settings = GRSH_Settings::get();
        $due_date = $settings['team_balance_due_date'] ?? '';
        $balance  = number_format( (float) $team['balance_due'], 2 );

        $subject = sprintf( 'GRSH — Remaining balance for %s: $%s due %s', $team['name'], $balance, $due_date );
        $body    = sprintf(
            "Hi %s,\n\nThanks for the $%s deposit on %s's registration. The remaining balance of $%s is due by %s.\n\n" .
            "Reply to this email or contact GRSH staff to arrange payment.\n\nThanks,\nGold Rush Senior Hockey",
            $captain['first_name'], number_format( (float) $team['deposit_amount'], 2 ), $team['name'], $balance, $due_date
        );

        /**
         * Lets Lorenzo customize the reminder copy (e.g. once a real
         * balance-payment link exists) without touching this file again.
         */
        $body = apply_filters( 'grsh_team_balance_reminder_body', $body, $team, $captain );

        $sent = wp_mail( $captain['email'], $subject, $body, class_exists( 'GRSH_Settings' ) ? GRSH_Settings::mail_headers() : [] );

        if ( $sent ) {
            $wpdb->update(
                "{$wpdb->prefix}grsh_teams",
                [ 'balance_reminder_sent_at' => current_time( 'mysql' ) ],
                [ 'id' => $team_id ]
            );
        }

        self::log_audit(
            'team_balance_reminder_sent', 'team', $team_id, null,
            [ 'to' => $captain['email'], 'balance_due' => $team['balance_due'], 'mail_result' => $sent ],
            null
        );
    }

    // -------------------------------------------------------------------------
    // REST: staff manual fee override (exception cases only — the normal
    // early/late tier is now decided automatically, see determine_fee_total())
    // -------------------------------------------------------------------------

    public static function register_routes(): void {
        register_rest_route( 'grsh/v1', '/admin/teams/(?P<id>\d+)/fee', [
            'methods'             => WP_REST_Server::EDITABLE, // PATCH
            'callback'            => [ __CLASS__, 'handle_set_fee' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
            'args'                => [
                'id' => [ 'validate_callback' => fn( $v ) => is_numeric( $v ) ],
            ],
        ] );
    }

    // Same permission shape as GRSH_Captain_Invite::check_permission() —
    // committee members and admins, never captains.
    public static function check_permission(): bool {
        return current_user_can( 'manage_options' ) || current_user_can( 'grsh_committee' );
    }

    public static function handle_set_fee( WP_REST_Request $request ): WP_REST_Response {
        $team_id = (int) $request->get_param( 'id' );
        $body    = (array) $request->get_json_params();

        if ( ! isset( $body['fee_total'] ) || ! is_numeric( $body['fee_total'] ) || (float) $body['fee_total'] < 0 ) {
            return new WP_REST_Response( [ 'error' => 'fee_total must be a non-negative number.' ], 400 );
        }
        $fee_total = round( (float) $body['fee_total'], 2 );

        global $wpdb;
        $team = $wpdb->get_row( $wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}grsh_teams WHERE id = %d", $team_id
        ), ARRAY_A );

        if ( ! $team ) {
            return new WP_REST_Response( [ 'error' => 'Team not found.' ], 404 );
        }
        if ( $team['team_type'] !== 'full_team' ) {
            return new WP_REST_Response( [ 'error' => 'Only full_team registrations track a fee/deposit.' ], 400 );
        }

        $deposit_amount = $team['deposit_amount'] !== null ? (float) $team['deposit_amount'] : 0.0;
        $balance_due    = max( 0.0, $fee_total - $deposit_amount );

        $status = 'unpaid';
        if ( ! empty( $team['deposit_paid_at'] ) ) {
            $status = $balance_due <= 0 ? 'paid_in_full' : 'deposit_paid';
        }

        $wpdb->update(
            "{$wpdb->prefix}grsh_teams",
            [
                'fee_total'      => $fee_total,
                'fee_tier'       => 'manual',
                'balance_due'    => $balance_due,
                'payment_status' => $status,
                // Manual override should get a fresh shot at a balance reminder
                // even if one already went out under the old total.
                'balance_reminder_sent_at' => null,
            ],
            [ 'id' => $team_id ]
        );

        self::log_audit(
            'team_fee_set', 'team', $team_id,
            [ 'fee_total' => $team['fee_total'] ],
            [ 'fee_total' => $fee_total, 'balance_due' => $balance_due ],
            'Manual staff override via PATCH /teams/{id}/fee'
        );

        return new WP_REST_Response( [
            'ok'             => true,
            'fee_total'      => $fee_total,
            'fee_tier'       => 'manual',
            'deposit_amount' => $deposit_amount,
            'balance_due'    => $balance_due,
            'payment_status' => $status,
        ], 200 );
    }

    // -------------------------------------------------------------------------
    // Audit logging — same shape as GRSH_Sync_Engine::log_audit() /
    // class-grsh-captain-signup.php's direct-insert pattern (wp_user_id=0
    // for system-triggered events like the daily cron sweep).
    // -------------------------------------------------------------------------

    private static function log_audit( string $action, string $object_type, ?int $object_id, ?array $before, ?array $after, ?string $notes ): void {
        global $wpdb;
        $wpdb->insert(
            "{$wpdb->prefix}grsh_audit_logs",
            [
                'season_id'    => self::get_season_id(),
                'wp_user_id'   => get_current_user_id() ?: 0,
                'user_display' => is_user_logged_in() ? ( wp_get_current_user()->display_name ?: 'unknown' ) : 'system',
                'action'       => $action,
                'object_type'  => $object_type,
                'object_id'    => $object_id,
                'before_value' => $before ? wp_json_encode( $before ) : null,
                'after_value'  => $after  ? wp_json_encode( $after )  : null,
                'notes'        => $notes,
            ]
        );
    }
}
