<?php
/**
 * GRSH Settings — REST API for plugin configuration.
 *
 * GET  /grsh/v1/settings            flat settings (kept for other callers)
 * POST /grsh/v1/settings            validate + save (422 with per-field errors, 409 if someone else saved first)
 * GET  /grsh/v1/settings/overview   everything the Settings page needs in one call
 * GET  /grsh/v1/settings/history    last 10 saved versions
 * POST /grsh/v1/settings/restore    put an old version back (validated, recorded as a new version)
 * POST /grsh/v1/settings/test-email send a test to the signed-in admin's own address only
 *
 * CHANGELOG v1.2.0
 * - Every field is validated (dates real and in order, numbers in range, min <= max, fees early <= late).
 * - A field the caller does not send keeps its saved value (the old save reset the team-fee fields to defaults
 *   every time because the page never sent them).
 * - season_year is locked to the sync code's SEASON constant; editing it used to create a season row nothing read.
 * - Dates are also written to wp_grsh_seasons (they never were).
 * - New: sender name/email, draft type/order, player fee (stored in option grsh_player_fee, which Reports reads),
 *   10-version history with restore, audit-log entry per save, wiring map (which settings anything actually reads),
 *   readiness checks per status, health checks, WPForms list, test email.
 * - GRSH_Settings::draft_clock() feeds the Draft page's default clock; mail_headers() sets From on GRSH emails.
 * PHP 7.4 compatible.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class GRSH_Settings {

    const OPTION_KEY   = 'grsh_settings';
    const HISTORY_KEY  = 'grsh_settings_history';
    const FEE_OPT      = 'grsh_player_fee';
    const HISTORY_KEEP = 10;
    const STATUSES     = [ 'setup', 'open', 'draft', 'locked', 'complete' ];
    const DRAFT_TYPES  = [ 'snake', 'linear', 'auto_balance' ];
    const DRAFT_ORDERS = [ 'random', 'weighted', 'lottery', 'manual' ];
    /** How a division fills its teams: draft pool, captain-registered teams, or a mix. A missing value means 'both' (the old behaviour). */
    const FORMATS      = [ 'draft', 'teams', 'both' ];

    public static function register_hooks(): void {
        add_action( 'rest_api_init', [ __CLASS__, 'register_routes' ] );
    }

    public static function register_routes(): void {
        $perm = [ __CLASS__, 'check_permission' ];
        register_rest_route( 'grsh/v1', '/settings', [
            [ 'methods' => WP_REST_Server::READABLE,  'callback' => [ __CLASS__, 'get_settings' ],  'permission_callback' => $perm ],
            [ 'methods' => WP_REST_Server::CREATABLE, 'callback' => [ __CLASS__, 'save_settings' ], 'permission_callback' => $perm ],
        ] );
        register_rest_route( 'grsh/v1', '/settings/overview',   [ 'methods' => WP_REST_Server::READABLE,  'callback' => [ __CLASS__, 'get_overview' ],   'permission_callback' => $perm ] );
        register_rest_route( 'grsh/v1', '/settings/history',    [ 'methods' => WP_REST_Server::READABLE,  'callback' => [ __CLASS__, 'get_history' ],    'permission_callback' => $perm ] );
        register_rest_route( 'grsh/v1', '/settings/restore',    [ 'methods' => WP_REST_Server::CREATABLE, 'callback' => [ __CLASS__, 'post_restore' ],   'permission_callback' => $perm ] );
        register_rest_route( 'grsh/v1', '/settings/test-email', [ 'methods' => WP_REST_Server::CREATABLE, 'callback' => [ __CLASS__, 'post_test_email' ], 'permission_callback' => $perm ] );
    }

    /** Only administrators (manage_options) may read or write settings. */
    public static function check_permission(): bool {
        return current_user_can( 'manage_options' );
    }

    // ── Read ─────────────────────────────────────────────────────────────────

    public static function get_settings( WP_REST_Request $request ): WP_REST_Response {
        return new WP_REST_Response( self::get(), 200 );
    }

    /** Saved settings merged over defaults. */
    public static function get(): array {
        $saved = get_option( self::OPTION_KEY, [] );
        if ( ! is_array( $saved ) ) {
            $saved = [];
        }
        $merged = array_merge( self::defaults(), $saved );
        // The saved division list is the source of truth once it exists (no deep merge).
        if ( ! empty( $saved['divisions'] ) && is_array( $saved['divisions'] ) ) {
            $merged['divisions'] = $saved['divisions'];
        }
        // Player fee lives in its own option so the Reports page and this page edit the same number.
        $fee = get_option( self::FEE_OPT, '' );
        $merged['divisions'] = array_map( [ __CLASS__, 'fill_division' ], (array) $merged['divisions'] );
        $merged['player_fee'] = ( $fee !== '' && $fee !== false && (float) $fee > 0 ) ? round( (float) $fee, 2 ) : null;
        $merged['season_year'] = self::locked_year();
        return $merged;
    }

    public static function get_active_divisions(): array {
        $settings  = self::get();
        $divisions = $settings['divisions'] ?? [];
        return array_values( array_filter( $divisions, function ( $d ) { return ! empty( $d['enabled'] ); } ) );
    }

    /** Give a saved division row the format fields it may not have yet. Missing format = 'both', so nothing changes until someone picks one. */
    public static function fill_division( $d ): array {
        $d = (array) $d;
        $f = isset( $d['format'] ) && in_array( $d['format'], self::FORMATS, true ) ? $d['format'] : 'both';
        $d['format'] = $f;
        $t = (int) ( $d['teams'] ?? 0 );
        $r = (int) ( $d['reg_teams'] ?? 0 );
        $d['reg_teams'] = $f === 'draft' ? 0 : ( $f === 'teams' ? $t : max( 0, min( $t, $r ) ) );
        return $d;
    }

    /** Format of one division by key ('both' when unknown, so an unrecognised key is never blocked). */
    public static function division_format( string $key ): string {
        foreach ( (array) ( self::get()['divisions'] ?? [] ) as $d ) {
            if ( ( $d['key'] ?? '' ) === $key ) { return self::fill_division( $d )['format']; }
        }
        return 'both';
    }

    /** Enabled divisions that can hold a given kind of team: 'full_team' (registered team) or 'draft'. */
    public static function divisions_for( string $type ): array {
        return array_values( array_filter( self::get_active_divisions(), function ( $d ) use ( $type ) {
            $f = self::fill_division( $d )['format'];
            return $f === 'both' || ( $type === 'full_team' ? $f === 'teams' : $f === 'draft' );
        } ) );
    }

    /** [ draft slots, registered-team slots ] for a division row. */
    public static function slots( array $d ): array {
        $d = self::fill_division( $d );
        $t = (int) $d['teams'];
        return [ $t - (int) $d['reg_teams'], (int) $d['reg_teams'] ];
    }

    /** Draft clock default (seconds) from Settings, clamped to what the Draft page allows. */
    public static function draft_clock(): int {
        $s = (int) ( self::get()['timer_seconds'] ?? 90 );
        return max( 15, min( 600, $s ?: 90 ) );
    }

    /** From header for GRSH emails when a valid sender is saved; empty array means "leave WordPress default". */
    public static function mail_headers(): array {
        $s = self::get();
        $e = trim( (string) ( $s['sender_email'] ?? '' ) );
        if ( ! is_email( $e ) ) {
            return [];
        }
        $n = trim( str_replace( [ '"', "\r", "\n", '<', '>' ], '', (string) ( $s['sender_name'] ?? '' ) ) );
        return [ 'From: ' . ( $n !== '' ? $n . ' <' . $e . '>' : $e ) ];
    }

    private static function locked_year(): int {
        return class_exists( 'GRSH_Sync_Engine' ) ? (int) GRSH_Sync_Engine::SEASON : 2027;
    }

    public static function get_overview(): WP_REST_Response {
        $s = self::get();
        $m = self::metrics( $s );
        $u = wp_get_current_user();
        $by = ! empty( $s['_last_saved_by'] ) ? self::user_name( (int) $s['_last_saved_by'] ) : '';
        $public = $s;
        unset( $public['_last_saved_by'] );
        return new WP_REST_Response( [
            'settings'   => $public,
            'meta'       => [ 'saved_at' => (string) ( $s['_last_saved_at'] ?? '' ), 'saved_by' => $by ],
            'today'      => current_time( 'Y-m-d' ),
            'locked_year' => self::locked_year(),
            'wiring'     => self::wiring(),
            'registered' => $m['by_div'],
            'readiness'  => self::readiness( $s, $m ),
            'health'     => self::health( $s, $m ),
            'forms'      => self::forms(),
            'sync_forms' => self::sync_forms(),
            'mail'       => [ 'smtp' => self::smtp_detected(), 'to' => ( $u && $u->exists() ) ? (string) $u->user_email : '', 'site_domain' => self::site_domain() ],
            'history'    => self::history_list(),
        ], 200 );
    }

    // ── Save ─────────────────────────────────────────────────────────────────

    public static function save_settings( WP_REST_Request $request ): WP_REST_Response {
        $body = $request->get_json_params();
        if ( empty( $body ) || ! is_array( $body ) ) {
            return new WP_REST_Response( [ 'error' => 'Invalid request body — expected JSON object.' ], 400 );
        }
        $cur = self::get();
        $stored_at = (string) ( $cur['_last_saved_at'] ?? '' );
        if ( empty( $body['force'] ) && ! empty( $body['base_saved_at'] ) && $stored_at !== '' && (string) $body['base_saved_at'] !== $stored_at ) {
            $who = ! empty( $cur['_last_saved_by'] ) ? self::user_name( (int) $cur['_last_saved_by'] ) : 'someone';
            return new WP_REST_Response( [ 'error' => 'These settings changed while you were editing (saved by ' . $who . ' at ' . $stored_at . '). Reload to see their changes, or save again to overwrite them.', 'conflict' => true, 'saved_at' => $stored_at ], 409 );
        }
        $r = self::normalize( $body, $cur );
        if ( $r['errors'] ) {
            $n = count( $r['errors'] );
            return new WP_REST_Response( [ 'error' => 'Fix ' . $n . ' problem' . ( $n === 1 ? '' : 's' ) . ' before saving.', 'errors' => $r['errors'] ], 422 );
        }
        $imp = self::impact_errors( $r['clean'], $cur );
        if ( $imp ) {
            $n = count( $imp );
            return new WP_REST_Response( [ 'error' => $n . ' change' . ( $n === 1 ? '' : 's' ) . ' would break teams that already exist.', 'errors' => $imp ], 422 );
        }
        $res = self::commit( $r['clean'], $cur, 'Saved from Settings' );
        return new WP_REST_Response( $res, 200 );
    }

    /**
     * Things a save would break in data that already exists. Only values that CHANGED are checked,
     * so a division that was already off-spec never locks the whole page.
     * @return array<string,string> errors keyed like normalize() errors
     */
    public static function impact_errors( array $clean, array $cur ): array {
        $e = [];
        $m = self::metrics( $clean );
        $old = [];
        foreach ( (array) ( $cur['divisions'] ?? [] ) as $d ) { $old[ $d['key'] ] = self::fill_division( $d ); }
        foreach ( array_values( (array) ( $clean['divisions'] ?? [] ) ) as $i => $d ) {
            if ( empty( $d['enabled'] ) ) { continue; }
            $x = ( $m['by_div'][ $d['key'] ] ?? [] ) + [ 'teams' => 0, 'full_teams' => 0, 'max_roster_n' => 0 ];
            $was = $old[ $d['key'] ] ?? null;
            $p = 'divisions.' . $i . '.';
            if ( $was && $was['format'] !== $d['format'] ) {
                if ( $d['format'] === 'draft' && $x['full_teams'] > 0 ) { $e[ $p . 'format' ] = $x['full_teams'] . ' registered team' . ( $x['full_teams'] === 1 ? '' : 's' ) . ' already exist in ' . $d['label'] . '. Remove or move them before switching to Draft.'; }
                if ( $d['format'] === 'teams' && $x['teams'] > 0 ) { $e[ $p . 'format' ] = $x['teams'] . ' draft team' . ( $x['teams'] === 1 ? '' : 's' ) . ' already exist in ' . $d['label'] . '. Remove them before switching to Registered teams.'; }
            }
            $made = (int) $x['teams'] + (int) $x['full_teams'];
            if ( $was && (int) $was['teams'] !== (int) $d['teams'] && (int) $d['teams'] < $made ) { $e[ $p . 'teams' ] = $d['label'] . ' already has ' . $made . ' team' . ( $made === 1 ? '' : 's' ) . ' created, so it cannot go below that.'; }
            if ( $was && (int) $was['max_roster'] !== (int) $d['max_roster'] && (int) $d['max_roster'] < (int) $x['max_roster_n'] ) { $e[ $p . 'max_roster' ] = 'A ' . $d['label'] . ' team already has ' . (int) $x['max_roster_n'] . ' players, so the max cannot go below that.'; }
        }
        return $e;
    }

    public static function post_restore( WP_REST_Request $request ): WP_REST_Response {
        $body = $request->get_json_params();
        $id   = is_array( $body ) ? sanitize_key( $body['id'] ?? '' ) : '';
        $hist = self::history_raw();
        $hit  = null;
        foreach ( $hist as $h ) {
            if ( $h['id'] === $id ) { $hit = $h; break; }
        }
        if ( ! $hit ) {
            return new WP_REST_Response( [ 'error' => 'That version is no longer in the history.' ], 404 );
        }
        $cur = self::get();
        $r = self::normalize( (array) $hit['snapshot'], $cur );
        if ( $r['errors'] ) {
            return new WP_REST_Response( [ 'error' => 'That version no longer passes today\'s rules: ' . implode( ' ', array_slice( array_values( $r['errors'] ), 0, 3 ) ), 'errors' => $r['errors'] ], 422 );
        }
        $imp = self::impact_errors( $r['clean'], $cur );
        if ( $imp ) { return new WP_REST_Response( [ 'error' => 'That version would break teams that already exist: ' . implode( ' ', array_slice( array_values( $imp ), 0, 2 ) ), 'errors' => $imp ], 422 ); }
        $res = self::commit( $r['clean'], $cur, 'Restored the version from ' . $hit['at'] );
        return new WP_REST_Response( $res, 200 );
    }

    /** Write settings, sync the season row, keep history, log to the audit trail. */
    private static function commit( array $clean, array $cur, string $note ): array {
        $changes = self::diff( $cur, $clean );
        if ( ! $changes ) {
            return [ 'saved' => true, 'unchanged' => true, 'changes' => [], 'settings' => $cur, 'meta' => [ 'saved_at' => (string) ( $cur['_last_saved_at'] ?? '' ) ] ];
        }
        $fee = $clean['player_fee'];
        $snapshot = $clean;
        unset( $clean['player_fee'] );
        $clean['_last_saved_by'] = get_current_user_id();
        $clean['_last_saved_at'] = current_time( 'mysql' );
        update_option( self::OPTION_KEY, $clean, false );
        if ( $fee === null ) { delete_option( self::FEE_OPT ); } else { update_option( self::FEE_OPT, $fee, false ); }
        self::sync_season( $clean );

        $hist = self::history_raw();
        array_unshift( $hist, [
            'id' => substr( md5( microtime( true ) . get_current_user_id() ), 0, 8 ),
            'at' => $clean['_last_saved_at'], 'by_id' => get_current_user_id(), 'by' => self::user_name( get_current_user_id() ),
            'note' => $note, 'changes' => $changes, 'snapshot' => $snapshot,
        ] );
        update_option( self::HISTORY_KEY, array_slice( $hist, 0, self::HISTORY_KEEP ), false );
        self::audit( $changes, $note );

        $out = $clean;
        $out['player_fee'] = $fee;
        unset( $out['_last_saved_by'] );
        return [ 'saved' => true, 'changes' => $changes, 'settings' => $out, 'meta' => [ 'saved_at' => $clean['_last_saved_at'], 'saved_by' => self::user_name( get_current_user_id() ) ], 'history' => self::history_list() ];
    }

    // ── Validation ───────────────────────────────────────────────────────────

    private static function valid_date( $v ): bool {
        if ( ! is_string( $v ) || ! preg_match( '/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m ) ) { return false; }
        return checkdate( (int) $m[2], (int) $m[3], (int) $m[1] );
    }

    private static function num( $v ) {
        if ( is_int( $v ) || is_float( $v ) ) { return $v; }
        if ( is_string( $v ) && trim( $v ) !== '' && is_numeric( trim( $v ) ) ) { return $v + 0; }
        return null;
    }

    /**
     * Validate and normalise. Starts from the current settings so a field the caller omits is kept.
     * @return array{clean:array,errors:array}
     */
    public static function normalize( array $raw, array $cur ): array {
        $e = [];
        $o = $cur;
        unset( $o['_last_saved_by'], $o['_last_saved_at'] );
        $has = function ( $k ) use ( $raw ) { return array_key_exists( $k, $raw ); };
        $int = function ( $k, $min, $max, $label ) use ( &$o, &$e, $raw, $has ) {
            if ( ! $has( $k ) ) { return; }
            $n = self::num( $raw[ $k ] );
            if ( $n === null || floor( $n ) != $n ) { $e[ $k ] = $label . ' must be a whole number.'; return; }
            if ( $n < $min || $n > $max ) { $e[ $k ] = $label . ' must be between ' . $min . ' and ' . $max . '.'; return; }
            $o[ $k ] = (int) $n;
        };
        $money = function ( $k, $label ) use ( &$o, &$e, $raw, $has ) {
            if ( ! $has( $k ) ) { return; }
            $n = self::num( $raw[ $k ] );
            if ( $n === null || $n < 0 || $n > 20000 ) { $e[ $k ] = $label . ' must be an amount between 0 and 20,000.'; return; }
            $o[ $k ] = round( (float) $n, 2 );
        };
        $date = function ( $k, $label, $allow_empty ) use ( &$o, &$e, $raw, $has ) {
            if ( ! $has( $k ) ) { return; }
            $v = trim( (string) $raw[ $k ] );
            if ( $v === '' ) { if ( $allow_empty ) { $o[ $k ] = ''; } else { $e[ $k ] = $label . ' is required.'; } return; }
            if ( ! self::valid_date( $v ) ) { $e[ $k ] = $label . ' is not a real date.'; return; }
            $o[ $k ] = $v;
        };
        $flag = function ( $k ) use ( &$o, $raw, $has ) { if ( $has( $k ) ) { $o[ $k ] = ! empty( $raw[ $k ] ); } };

        // Season
        $lock = self::locked_year();
        if ( $has( 'season_year' ) && (int) $raw['season_year'] !== $lock ) {
            $e['season_year'] = 'Season year is fixed at ' . $lock . ' by the sync code. Next season needs a code change, not a setting.';
        }
        $o['season_year'] = $lock;
        if ( $has( 'season_label' ) ) {
            $v = sanitize_text_field( (string) $raw['season_label'] );
            if ( $v === '' || strlen( $v ) > 100 ) { $e['season_label'] = 'Season label is required (100 characters at most).'; } else { $o['season_label'] = $v; }
        }
        if ( $has( 'form_id' ) ) {
            $n = self::num( $raw['form_id'] );
            if ( $n === null || $n < 1 || floor( $n ) != $n ) { $e['form_id'] = 'Pick the registration form (a WPForms ID, 1 or higher).'; } else { $o['form_id'] = (int) $n; }
        }
        if ( $has( 'status' ) ) {
            $v = sanitize_key( (string) $raw['status'] );
            if ( ! in_array( $v, self::STATUSES, true ) ) { $e['status'] = 'Status must be one of: ' . implode( ', ', self::STATUSES ) . '.'; } else { $o['status'] = $v; }
        }
        $date( 'registration_opens', 'Registration opens', true );
        $date( 'registration_closes', 'Registration closes', true );
        $date( 'draft_date', 'Draft date', true );
        if ( ! isset( $e['registration_opens'], $e['registration_closes'] ) && $o['registration_opens'] !== '' && $o['registration_closes'] !== '' && $o['registration_opens'] > $o['registration_closes'] ) {
            $e['registration_closes'] = 'Registration closes before it opens.';
        }
        if ( ! isset( $e['registration_closes'], $e['draft_date'] ) && $o['registration_closes'] !== '' && $o['draft_date'] !== '' && $o['draft_date'] < $o['registration_closes'] ) {
            $e['draft_date'] = 'The draft is before registration closes.';
        }

        // Draft
        $flag( 'timer_enabled' );
        $int( 'timer_seconds', 15, 600, 'Timer' );
        if ( $has( 'draft_type' ) )  { $v = sanitize_key( (string) $raw['draft_type'] );  if ( in_array( $v, self::DRAFT_TYPES, true ) )  { $o['draft_type'] = $v; }  else { $e['draft_type'] = 'Unknown draft type.'; } }
        if ( $has( 'draft_order' ) ) { $v = sanitize_key( (string) $raw['draft_order'] ); if ( in_array( $v, self::DRAFT_ORDERS, true ) ) { $o['draft_order'] = $v; } else { $e['draft_order'] = 'Unknown draft order.'; } }

        // Email
        foreach ( [ 'email_registration', 'email_roster', 'email_payment', 'email_alternate', 'email_team_balance', 'email_team_deposit_nudge', 'public_rosters', 'sandbagging_auto_flag' ] as $k ) { $flag( $k ); }
        if ( $has( 'sender_name' ) ) {
            $v = sanitize_text_field( (string) $raw['sender_name'] );
            if ( strlen( $v ) > 80 ) { $e['sender_name'] = 'From name is too long (80 characters at most).'; } else { $o['sender_name'] = $v; }
        }
        if ( $has( 'sender_email' ) ) {
            $v = trim( (string) $raw['sender_email'] );
            if ( $v !== '' && ! is_email( $v ) ) { $e['sender_email'] = 'That is not a valid email address.'; } else { $o['sender_email'] = $v; }
        }

        // Fees
        if ( $has( 'player_fee' ) ) {
            if ( $raw['player_fee'] === null || trim( (string) $raw['player_fee'] ) === '' ) { $o['player_fee'] = null; }
            else {
                $n = self::num( $raw['player_fee'] );
                if ( $n === null || $n <= 0 || $n > 5000 ) { $e['player_fee'] = 'Player fee must be an amount between 1 and 5,000 (or blank for "not set").'; } else { $o['player_fee'] = round( (float) $n, 2 ); }
            }
        }
        $money( 'team_deposit_amount', 'Deposit' );
        $money( 'team_fee_early_amount', 'Early team fee' );
        $money( 'team_fee_late_amount', 'Late team fee' );
        $date( 'team_fee_early_cutoff_date', 'Early-fee cutoff', false );
        $date( 'team_balance_due_date', 'Balance due date', false );
        $int( 'team_deposit_nudge_days', 1, 60, 'Deposit nudge' );
        $int( 'team_balance_reminder_days', 1, 60, 'Balance reminder' );
        if ( ! isset( $e['team_fee_early_amount'], $e['team_fee_late_amount'] ) && $o['team_fee_early_amount'] > $o['team_fee_late_amount'] ) { $e['team_fee_late_amount'] = 'The late fee is lower than the early fee.'; }
        if ( ! isset( $e['team_deposit_amount'], $e['team_fee_early_amount'] ) && $o['team_deposit_amount'] > $o['team_fee_early_amount'] ) { $e['team_deposit_amount'] = 'The deposit is more than the early team fee.'; }
        if ( ! isset( $e['team_fee_early_cutoff_date'], $e['team_balance_due_date'] ) && $o['team_fee_early_cutoff_date'] > $o['team_balance_due_date'] ) { $e['team_balance_due_date'] = 'The balance is due before the early-fee cutoff.'; }

        // Divisions
        if ( $has( 'divisions' ) ) {
            $out = []; $seen = [];
            if ( ! is_array( $raw['divisions'] ) || ! $raw['divisions'] ) { $e['divisions'] = 'At least one division is required.'; }
            else {
                foreach ( array_values( $raw['divisions'] ) as $i => $d ) {
                    if ( ! is_array( $d ) ) { continue; }
                    $p = 'divisions.' . $i . '.';
                    $key = sanitize_key( (string) ( $d['key'] ?? '' ) );
                    $label = sanitize_text_field( (string) ( $d['label'] ?? '' ) );
                    if ( $key === '' || isset( $seen[ $key ] ) ) { $e[ $p . 'key' ] = 'Division key is missing or duplicated.'; }
                    $seen[ $key ] = true;
                    if ( $label === '' ) { $e[ $p . 'label' ] = 'Division name is required.'; }
                    $row = [ 'key' => $key, 'label' => $label, 'enabled' => ! empty( $d['enabled'] ) ];
                    // Format: keep the saved one when the caller does not send it (older clients), else validate.
                    $was = 'both'; $was_reg = 0;
                    foreach ( (array) ( $cur['divisions'] ?? [] ) as $cd ) { if ( ( $cd['key'] ?? '' ) === $key ) { $cf = self::fill_division( $cd ); $was = $cf['format']; $was_reg = (int) $cf['reg_teams']; } }
                    $fmt = array_key_exists( 'format', $d ) ? (string) $d['format'] : $was;
                    if ( ! in_array( $fmt, self::FORMATS, true ) ) { $e[ $p . 'format' ] = 'Format must be Draft, Registered teams or Both.'; $fmt = 'both'; }
                    $row['format'] = $fmt;
                    foreach ( [ 'teams' => [ 1, 16, 'Teams' ], 'min_roster' => [ 4, 30, 'Min roster' ], 'max_roster' => [ 4, 40, 'Max roster' ], 'goalie_min' => [ 0, 4, 'Min goalies' ], 'goalie_max' => [ 0, 6, 'Max goalies' ] ] as $f => $rule ) {
                        $n = self::num( $d[ $f ] ?? null );
                        if ( $n === null || floor( $n ) != $n || $n < $rule[0] || $n > $rule[1] ) { $e[ $p . $f ] = $rule[2] . ' must be a whole number from ' . $rule[0] . ' to ' . $rule[1] . '.'; $row[ $f ] = null; }
                        else { $row[ $f ] = (int) $n; }
                    }
                    $regn = array_key_exists( 'reg_teams', $d ) ? self::num( $d['reg_teams'] ) : $was_reg;
                    if ( $regn === null || floor( $regn ) != $regn || $regn < 0 ) { $e[ $p . 'reg_teams' ] = 'Registered-team slots must be a whole number, 0 or more.'; $regn = 0; }
                    if ( $row['format'] === 'draft' ) { $regn = 0; }
                    elseif ( $row['format'] === 'teams' ) { $regn = (int) $row['teams']; }
                    elseif ( $row['teams'] !== null && $regn > $row['teams'] ) { $e[ $p . 'reg_teams' ] = 'More registered-team slots than teams in the division.'; }
                    $row['reg_teams'] = (int) $regn;
                    if ( $row['min_roster'] !== null && $row['max_roster'] !== null && $row['max_roster'] < $row['min_roster'] ) { $e[ $p . 'max_roster' ] = 'Max roster is below min roster.'; }
                    if ( $row['goalie_min'] !== null && $row['goalie_max'] !== null && $row['goalie_max'] < $row['goalie_min'] ) { $e[ $p . 'goalie_max' ] = 'Max goalies is below min goalies.'; }
                    if ( $row['goalie_max'] !== null && $row['max_roster'] !== null && $row['goalie_max'] > $row['max_roster'] ) { $e[ $p . 'goalie_max' ] = 'More goalie spots than roster spots.'; }
                    $out[] = $row;
                }
                if ( $out && ! array_filter( $out, function ( $r ) { return $r['enabled']; } ) ) { $e['divisions'] = 'Enable at least one division.'; }
                $o['divisions'] = $out;
            }
        }
        return [ 'clean' => $o, 'errors' => $e ];
    }

    // ── Diff / history / audit ───────────────────────────────────────────────

    private static function flat( array $s ): array {
        $f = [];
        foreach ( $s as $k => $v ) {
            if ( $k === 'divisions' || ( isset( $k[0] ) && $k[0] === '_' ) ) { continue; }
            $f[ $k ] = $v;
        }
        foreach ( (array) ( $s['divisions'] ?? [] ) as $d ) {
            foreach ( [ 'enabled', 'format', 'reg_teams', 'teams', 'min_roster', 'max_roster', 'goalie_min', 'goalie_max', 'label' ] as $x ) {
                $f[ 'divisions.' . ( $d['key'] ?? '?' ) . '.' . $x ] = $d[ $x ] ?? null;
            }
        }
        return $f;
    }

    private static function same( $a, $b ): bool {
        if ( is_bool( $a ) || is_bool( $b ) ) { return (bool) $a === (bool) $b; }
        if ( $a === null || $b === null ) { return $a === $b || ( $a === '' && $b === null ) || ( $a === null && $b === '' ); }
        if ( is_numeric( $a ) && is_numeric( $b ) ) { return (float) $a === (float) $b; }
        return (string) $a === (string) $b;
    }

    public static function diff( array $old, array $new ): array {
        $a = self::flat( $old ); $b = self::flat( $new ); $out = [];
        foreach ( array_unique( array_merge( array_keys( $a ), array_keys( $b ) ) ) as $k ) {
            $x = array_key_exists( $k, $a ) ? $a[ $k ] : null;
            $y = array_key_exists( $k, $b ) ? $b[ $k ] : null;
            if ( ! self::same( $x, $y ) ) { $out[] = [ 'key' => $k, 'from' => $x, 'to' => $y ]; }
        }
        return $out;
    }

    private static function history_raw(): array {
        $h = get_option( self::HISTORY_KEY, [] );
        return is_array( $h ) ? array_values( array_filter( $h, 'is_array' ) ) : [];
    }

    public static function history_list(): array {
        $out = [];
        foreach ( self::history_raw() as $h ) {
            $out[] = [ 'id' => $h['id'], 'at' => $h['at'], 'by' => $h['by'] ?? '', 'note' => $h['note'] ?? '', 'count' => count( (array) ( $h['changes'] ?? [] ) ),
                       'changes' => array_slice( (array) ( $h['changes'] ?? [] ), 0, 12 ) ];
        }
        return $out;
    }

    public static function get_history(): WP_REST_Response {
        return new WP_REST_Response( self::history_list(), 200 );
    }

    private static function user_name( int $id ): string {
        $u = function_exists( 'get_userdata' ) ? get_userdata( $id ) : false;
        return ( $u && ! empty( $u->display_name ) ) ? (string) $u->display_name : ( $id ? 'User #' . $id : '' );
    }

    private static function audit( array $changes, string $note ): void {
        global $wpdb;
        $u = wp_get_current_user();
        $keys = array_slice( array_column( $changes, 'key' ), 0, 25 );
        $wpdb->insert( "{$wpdb->prefix}grsh_audit_logs", [
            'season_id' => self::season_row_id(), 'wp_user_id' => get_current_user_id() ?: 0,
            'user_display' => ( $u && $u->exists() ) ? $u->display_name : 'Admin',
            'action' => 'settings_saved', 'object_type' => 'settings', 'object_id' => 0,
            'after_value' => wp_json_encode( $changes ), 'notes' => $note . ' (' . count( $changes ) . ' change' . ( count( $changes ) === 1 ? '' : 's' ) . ': ' . implode( ', ', $keys ) . ')',
        ] );
    }

    private static function season_row_id() {
        global $wpdb;
        $id = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}grsh_seasons WHERE season_year = %d", self::locked_year() ) );
        return $id ? (int) $id : null;
    }

    private static function sync_season( array $s ): void {
        global $wpdb;
        $table = $wpdb->prefix . 'grsh_seasons';
        $exists = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$table} WHERE season_year = %d", $s['season_year'] ) );
        $data = [ 'label' => $s['season_label'], 'form_id' => $s['form_id'], 'status' => $s['status'] ];
        $fmt  = [ '%s', '%d', '%s' ];
        if ( ! empty( $s['registration_opens'] ) )  { $data['registration_opens']  = $s['registration_opens'] . ' 00:00:00';  $fmt[] = '%s'; }
        if ( ! empty( $s['registration_closes'] ) ) { $data['registration_closes'] = $s['registration_closes'] . ' 23:59:59'; $fmt[] = '%s'; }
        if ( ! empty( $s['draft_date'] ) )          { $data['draft_date']          = $s['draft_date'];                        $fmt[] = '%s'; }
        if ( $exists ) { $wpdb->update( $table, $data, [ 'season_year' => $s['season_year'] ], $fmt, [ '%d' ] ); }
        else           { $wpdb->insert( $table, array_merge( [ 'season_year' => $s['season_year'] ], $data ), array_merge( [ '%d' ], $fmt ) ); }
    }

    // ── Wiring map: which saved settings does any other code read? ──────────

    public static function wiring(): array {
        $on  = function ( $by ) { return [ 'state' => 'active', 'used_by' => $by ]; };
        $off = function () { return [ 'state' => 'not_connected', 'used_by' => '' ]; };
        return [
            'season_label' => $on( 'Dashboard, Reports' ), 'form_id' => $off(), 'status' => $on( 'Season row, Dashboard' ),
            'registration_opens' => $on( 'Dashboard, Reports' ), 'registration_closes' => $on( 'Dashboard, Reports' ), 'draft_date' => $on( 'Draft checks, Dashboard' ),
            'divisions' => $on( 'Players, Rosters, Draft, Reports' ), 'player_fee' => $on( 'Reports (amount owed, reminders)' ),
            'team_deposit_amount' => $on( 'Team deposit emails' ), 'team_fee_early_amount' => $on( 'Team fee tiers' ), 'team_fee_late_amount' => $on( 'Team fee tiers' ),
            'team_fee_early_cutoff_date' => $on( 'Team fee tiers' ), 'team_balance_due_date' => $on( 'Team balance emails' ),
            'team_deposit_nudge_days' => $on( 'Team deposit emails' ), 'team_balance_reminder_days' => $on( 'Team balance emails' ),
            'email_team_balance' => $on( 'Team balance emails' ), 'email_team_deposit_nudge' => $on( 'Team deposit emails' ),
            'timer_seconds' => $on( 'Draft page default clock (before a draft starts)' ),
            'sender_name' => $on( 'Payment reminders, team fee emails, test email' ), 'sender_email' => $on( 'Payment reminders, team fee emails, test email' ),
            'timer_enabled' => $off(), 'draft_type' => $off(), 'draft_order' => $off(),
            'email_registration' => $off(), 'email_roster' => $off(), 'email_payment' => $off(), 'email_alternate' => $off(),
            'public_rosters' => $off(), 'sandbagging_auto_flag' => $off(),
        ];
    }

    // ── Live numbers for readiness / division warnings ──────────────────────

    private static function nk( $s ): string { return preg_replace( '/[^a-z0-9]/', '', strtolower( (string) $s ) ); }

    private static function metrics( array $s ): array {
        global $wpdb;
        $m = [ 'total' => 0, 'by_div' => [], 'teams' => [], 'unassigned' => 0, 'roster' => [] ];
        $divs = (array) ( $s['divisions'] ?? [] );
        $idx = [];
        foreach ( $divs as $d ) { $idx[ self::nk( $d['key'] ) ] = $d['key']; $idx[ self::nk( $d['label'] ) ] = $d['key']; $m['by_div'][ $d['key'] ] = [ 'registered' => 0, 'goalies' => 0, 'teams' => 0, 'no_captain' => 0, 'full_teams' => 0, 'max_roster_n' => 0 ]; }
        $sid = self::season_row_id();
        if ( ! $sid ) { return $m; }
        $p = $wpdb->prefix;
        $rows = $wpdb->get_results( $wpdb->prepare( "SELECT r.division_requested AS d, COUNT(*) AS n, SUM(CASE WHEN pl.is_goalie = 1 THEN 1 ELSE 0 END) AS g
            FROM {$p}grsh_registrations r JOIN {$p}grsh_players pl ON pl.id = r.player_id
            WHERE r.season_id = %d AND r.player_type = 'primary' AND r.status NOT IN ('withdrawn','waitlist') GROUP BY r.division_requested", $sid ), ARRAY_A ) ?: [];
        foreach ( $rows as $r ) {
            $m['total'] += (int) $r['n'];
            $k = $idx[ self::nk( $r['d'] ) ] ?? null;
            if ( $k !== null ) { $m['by_div'][ $k ]['registered'] += (int) $r['n']; $m['by_div'][ $k ]['goalies'] += (int) $r['g']; }
        }
        $trs = $wpdb->get_results( $wpdb->prepare( "SELECT t.id, t.division, t.name, t.captain_player_id, COUNT(ro.id) AS n
            FROM {$p}grsh_teams t LEFT JOIN {$p}grsh_rosters ro ON ro.team_id = t.id WHERE t.season_id = %d AND t.team_type = 'draft' GROUP BY t.id", $sid ), ARRAY_A ) ?: [];
        foreach ( $trs as $t ) {
            $k = $idx[ self::nk( $t['division'] ) ] ?? null;
            if ( $k === null ) { continue; }
            $m['by_div'][ $k ]['teams']++;
            if ( empty( $t['captain_player_id'] ) ) { $m['by_div'][ $k ]['no_captain']++; }
            $m['roster'][] = [ 'division' => $k, 'team' => $t['name'], 'n' => (int) $t['n'] ];
            if ( (int) $t['n'] > $m['by_div'][ $k ]['max_roster_n'] ) { $m['by_div'][ $k ]['max_roster_n'] = (int) $t['n']; }
        }
        $fts = $wpdb->get_results( $wpdb->prepare( "SELECT t.division, COUNT(*) AS n FROM {$p}grsh_teams t WHERE t.season_id = %d AND t.team_type = 'full_team' GROUP BY t.division", $sid ), ARRAY_A ) ?: [];
        foreach ( $fts as $t ) {
            $k = $idx[ self::nk( $t['division'] ) ] ?? null;
            if ( $k !== null ) { $m['by_div'][ $k ]['full_teams'] += (int) $t['n']; }
        }
        $m['unassigned'] = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$p}grsh_registrations r WHERE r.season_id = %d AND r.player_type = 'primary' AND r.status NOT IN ('withdrawn','waitlist')
            AND NOT EXISTS (SELECT 1 FROM {$p}grsh_rosters ro WHERE ro.player_id = r.player_id AND ro.season_id = r.season_id)", $sid ) );
        return $m;
    }

    /** Checklist for moving to each status. level: ok | warn | block. Only "block" stops the Review button. */
    public static function readiness( array $s, array $m ): array {
        $c = function ( $level, $text, $tab = '' ) { return [ 'level' => $level, 'text' => $text, 'tab' => $tab ]; };
        $enabled = self::get_enabled( $s );
        $out = [ 'setup' => [], 'open' => [], 'draft' => [], 'locked' => [], 'complete' => [] ];

        $out['open'][] = ( $s['registration_opens'] !== '' && $s['registration_closes'] !== '' ) ? $c( 'ok', 'Registration dates are set.' ) : $c( 'block', 'Set when registration opens and closes.', 'season' );
        $out['open'][] = ! empty( $s['form_id'] ) ? $c( 'ok', 'Registration form is chosen.' ) : $c( 'block', 'Choose the registration form.', 'season' );
        $out['open'][] = $enabled ? $c( 'ok', count( $enabled ) . ' division' . ( count( $enabled ) === 1 ? '' : 's' ) . ' enabled.' ) : $c( 'block', 'Enable at least one division.', 'divisions' );
        $out['open'][] = $s['player_fee'] ? $c( 'ok', 'Player fee is set.' ) : $c( 'warn', 'No player fee is set, so unpaid players show "amount not set" on Reports.', 'fees' );

        $out['draft'][] = $m['total'] > 0 ? $c( 'ok', $m['total'] . ' players registered.' ) : $c( 'block', 'Nobody has registered yet.' );
        foreach ( $enabled as $d ) {
            $x = ( $m['by_div'][ $d['key'] ] ?? [] ) + [ 'registered' => 0, 'goalies' => 0, 'teams' => 0, 'no_captain' => 0, 'full_teams' => 0 ];
            list( $dslots, $tslots ) = self::slots( $d );
            $fmt = self::fill_division( $d )['format'];
            if ( $fmt !== 'teams' && $dslots > 0 ) {
                // Only the draft slots draw from the player pool, so only they set what is needed.
                $need = $dslots * (int) $d['min_roster'];
                if ( $x['registered'] < $need ) { $out['draft'][] = $c( 'warn', $d['label'] . ': ' . $x['registered'] . ' registered, ' . $need . ' needed for ' . $dslots . ' draft team' . ( $dslots === 1 ? '' : 's' ) . '.', 'divisions' ); }
                $gneed = $dslots * (int) $d['goalie_min'];
                if ( $x['goalies'] < $gneed ) { $out['draft'][] = $c( 'warn', $d['label'] . ': ' . $x['goalies'] . ' goalie' . ( $x['goalies'] === 1 ? '' : 's' ) . ' registered, ' . $gneed . ' needed.', 'divisions' ); }
                if ( $x['teams'] < $dslots ) { $out['draft'][] = $c( 'warn', $d['label'] . ': ' . $x['teams'] . ' of ' . $dslots . ' draft teams created.' ); }
                if ( $x['no_captain'] > 0 ) { $out['draft'][] = $c( 'warn', $d['label'] . ': ' . $x['no_captain'] . ' team' . ( $x['no_captain'] === 1 ? ' has' : 's have' ) . ' no captain.' ); }
            }
            if ( $fmt !== 'draft' && $tslots > 0 && $x['full_teams'] < $tslots ) { $out['draft'][] = $c( 'warn', $d['label'] . ': ' . $x['full_teams'] . ' of ' . $tslots . ' registered teams are in.', 'divisions' ); }
            if ( $fmt === 'draft' && $x['full_teams'] > 0 ) { $out['draft'][] = $c( 'warn', $d['label'] . ' is set to Draft but has ' . $x['full_teams'] . ' registered team' . ( $x['full_teams'] === 1 ? '' : 's' ) . '.', 'divisions' ); }
            if ( $fmt === 'teams' && $x['teams'] > 0 ) { $out['draft'][] = $c( 'warn', $d['label'] . ' is set to Registered teams but has ' . $x['teams'] . ' draft team' . ( $x['teams'] === 1 ? '' : 's' ) . '.', 'divisions' ); }
        }
        $out['draft'][] = $s['draft_date'] !== '' ? $c( 'ok', 'Draft date is set.' ) : $c( 'warn', 'No draft date is set.', 'season' );

        $out['locked'][] = $m['unassigned'] === 0 ? $c( 'ok', 'Everyone registered is on a roster.' ) : $c( 'warn', $m['unassigned'] . ' registered player' . ( $m['unassigned'] === 1 ? ' is' : 's are' ) . ' not on a roster yet.' );
        $short = 0; $min = [];
        foreach ( $enabled as $d ) { $min[ $d['key'] ] = (int) $d['min_roster']; }
        foreach ( $m['roster'] as $r ) { if ( isset( $min[ $r['division'] ] ) && $r['n'] < $min[ $r['division'] ] ) { $short++; } }
        $out['locked'][] = $short === 0 ? $c( 'ok', 'No team is under its minimum roster.' ) : $c( 'warn', $short . ' team' . ( $short === 1 ? ' is' : 's are' ) . ' under the minimum roster.' );
        $out['complete'] = $out['locked'];
        return $out;
    }

    private static function get_enabled( array $s ): array {
        return array_values( array_filter( (array) ( $s['divisions'] ?? [] ), function ( $d ) { return ! empty( $d['enabled'] ); } ) );
    }

    // ── Health ───────────────────────────────────────────────────────────────

    private static function site_domain(): string {
        $h = (string) parse_url( home_url(), PHP_URL_HOST );
        return preg_replace( '/^www\./', '', $h );
    }

    private static function smtp_detected(): bool {
        if ( defined( 'WPMS_PLUGIN_VER' ) || class_exists( 'WPMailSMTP\\Core' ) ) { return true; }
        return function_exists( 'is_plugin_active' ) && is_plugin_active( 'wp-mail-smtp/wp_mail_smtp.php' );
    }

    public static function health( array $s, array $m ): array {
        $h = function ( $level, $text, $tab = '' ) { return [ 'level' => $level, 'text' => $text, 'tab' => $tab ]; };
        $out = [];
        $f = self::forms();
        $sf = self::sync_forms();
        if ( $f['available'] ) {
            $ids = array_column( $f['forms'], 'id' );
            $out[] = in_array( (int) $s['form_id'], $ids, true ) ? $h( 'ok', 'Form #' . (int) $s['form_id'] . ' exists in WPForms.' ) : $h( 'bad', 'Form #' . (int) $s['form_id'] . ' was not found in WPForms (' . count( $ids ) . ' forms found).', 'season' );
            if ( $sf['live'] && ! in_array( $sf['live'], $ids, true ) ) { $out[] = $h( 'bad', 'The sync listens to form #' . $sf['live'] . ' but WPForms has no such form. New registrations will not sync.', 'season' ); }
        } else {
            $out[] = $h( 'info', 'WPForms is not available here, so forms cannot be checked.', 'season' );
        }
        if ( $f['available'] && $sf['team'] && ! in_array( $sf['team'], array_column( $f['forms'], 'id' ), true ) ) { $out[] = $h( 'bad', 'Team registration deposits listen to form #' . $sf['team'] . ' but WPForms has no such form.', 'season' ); }
        if ( $sf['live'] ) {
            $out[] = (int) $s['form_id'] === $sf['live']
                ? $h( 'info', 'Registration sync is fixed to form #' . $sf['live'] . ( $sf['test'] ? ' (test form #' . $sf['test'] . ' also accepted)' : '' ) . ' in the plugin code.' )
                : $h( 'warn', 'Settings says form #' . (int) $s['form_id'] . ' but the sync only listens to #' . $sf['live'] . '. Changing the form here does not change what syncs.', 'season' );
        }
        $today = current_time( 'Y-m-d' );
        $o = $s['registration_opens']; $c = $s['registration_closes']; $d = $s['draft_date'];
        if ( $o === '' || $c === '' ) { $out[] = $h( 'warn', 'Registration dates are not both set.', 'season' ); }
        elseif ( $o > $c ) { $out[] = $h( 'bad', 'Registration closes before it opens.', 'season' ); }
        else { $out[] = $h( 'ok', 'Registration dates are in order.' ); }
        if ( $s['status'] === 'open' && $c !== '' && $c < $today ) { $out[] = $h( 'warn', 'Status is Open but the registration close date has passed.', 'season' ); }
        if ( $s['status'] === 'setup' && $o !== '' && $c !== '' && $o <= $today && $today <= $c ) { $out[] = $h( 'warn', 'The registration window is open but status is still Setup.', 'season' ); }
        if ( $d !== '' && $d < $today && in_array( $s['status'], [ 'setup', 'open' ], true ) ) { $out[] = $h( 'warn', 'The draft date is in the past but status is still ' . ucfirst( $s['status'] ) . '.', 'season' ); }
        $out[] = $s['player_fee'] ? $h( 'ok', 'Player fee is set.' ) : $h( 'warn', 'No player fee is set.', 'fees' );
        $bad_fmt = 0;
        foreach ( self::get_enabled( $s ) as $d ) {
            $x = $m['by_div'][ $d['key'] ] ?? [];
            $fmt = self::fill_division( $d )['format'];
            if ( ( $fmt === 'draft' && ! empty( $x['full_teams'] ) ) || ( $fmt === 'teams' && ! empty( $x['teams'] ) ) ) {
                $bad_fmt++;
                $out[] = $h( 'warn', $d['label'] . ' is set to ' . ( $fmt === 'draft' ? 'Draft' : 'Registered teams' ) . ' but has teams of the other kind. Captain Sync and the deposit emails still see them.', 'divisions' );
            }
        }
        if ( ! $bad_fmt ) { $out[] = $h( 'ok', 'Every division\'s teams match its format.' ); }
        $out[] = self::get_enabled( $s ) ? $h( 'ok', count( self::get_enabled( $s ) ) . ' divisions enabled.' ) : $h( 'bad', 'No division is enabled.', 'divisions' );
        $out[] = self::smtp_detected() ? $h( 'ok', 'An SMTP mail plugin is active.' ) : $h( 'warn', 'No SMTP plugin detected. Emails may land in spam or not send.', 'email' );
        $se = trim( (string) $s['sender_email'] );
        if ( $se === '' ) { $out[] = $h( 'info', 'No From address saved, so emails use the WordPress default.', 'email' ); }
        else {
            $dom = strtolower( substr( strrchr( $se, '@' ) ?: '@', 1 ) );
            $out[] = ( $dom === self::site_domain() || self::smtp_detected() ) ? $h( 'ok', 'From address ' . $se . ' looks fine.' ) : $h( 'warn', 'From address is on ' . $dom . ' but this site is ' . self::site_domain() . '. Many mail servers reject that.', 'email' );
        }
        $dead = 0;
        foreach ( self::wiring() as $k => $w ) { if ( $w['state'] === 'not_connected' ) { $dead++; } }
        $out[] = $h( 'info', $dead . ' saved settings are not used by anything yet (marked "Not connected yet" on their tabs).' );
        return $out;
    }

    /** Form IDs the registration sync actually listens to (hard-coded in the sync engine). */
    public static function sync_forms(): array {
        $c = function ( $cls, $k ) { return defined( $cls . '::' . $k ) ? (int) constant( $cls . '::' . $k ) : null; };
        return [
            'live'      => $c( 'GRSH_Sync_Engine', 'FORM_ID' ),
            'test'      => $c( 'GRSH_Sync_Engine', 'TEST_FORM_ID' ),
            'team'      => $c( 'GRSH_Team_Deposit', 'FORM_ID' ),
            'team_test' => $c( 'GRSH_Team_Deposit', 'TEST_FORM_ID' ),
        ];
    }

    /**
     * WPForms forms with entry counts. Reads the "wpforms" post type directly (works on every WPForms version; the
     * wpforms()->form shortcut was removed in newer releases, which made every form look "not found").
     * available=false only when WPForms' post type is not registered, never when the list is merely empty.
     */
    public static function forms(): array {
        if ( ! post_type_exists( 'wpforms' ) || ! function_exists( 'get_posts' ) ) { return [ 'available' => false, 'forms' => [] ]; }
        global $wpdb;
        $posts = get_posts( [ 'post_type' => 'wpforms', 'post_status' => [ 'publish', 'draft', 'private' ], 'numberposts' => -1, 'orderby' => 'ID', 'order' => 'DESC' ] );
        $counts = null;
        try {
            $prev = method_exists( $wpdb, 'suppress_errors' ) ? $wpdb->suppress_errors( true ) : null;
            $rows = $wpdb->get_results( "SELECT form_id, COUNT(*) AS n FROM {$wpdb->prefix}wpforms_entries GROUP BY form_id", ARRAY_A );
            if ( $prev !== null ) { $wpdb->suppress_errors( $prev ); }
            if ( is_array( $rows ) && $rows && empty( $wpdb->last_error ) ) { $counts = []; foreach ( $rows as $r ) { $counts[ (int) $r['form_id'] ] = (int) $r['n']; } }
        } catch ( \Throwable $e ) { $counts = null; }
        $sf = self::sync_forms();
        $out = [];
        foreach ( (array) $posts as $f ) {
            $id = (int) $f->ID;
            $out[] = [ 'id' => $id, 'title' => (string) $f->post_title, 'entries' => $counts === null ? null : ( $counts[ $id ] ?? 0 ),
                       'role' => $id === $sf['live'] ? 'live' : ( $id === $sf['test'] ? 'test' : 'other' ) ];
        }
        return [ 'available' => true, 'forms' => $out ];
    }

    // ── Test email ───────────────────────────────────────────────────────────

    public static function post_test_email( WP_REST_Request $request ): WP_REST_Response {
        $u = wp_get_current_user();
        $to = ( $u && $u->exists() ) ? (string) $u->user_email : '';
        if ( ! is_email( $to ) ) { return new WP_REST_Response( [ 'error' => 'Your WordPress account has no valid email address to send the test to.' ], 400 ); }
        if ( get_transient( 'grsh_settings_testmail' ) ) { return new WP_REST_Response( [ 'error' => 'A test was sent a moment ago. Wait 30 seconds.' ], 429 ); }
        set_transient( 'grsh_settings_testmail', 1, 30 );
        $headers = self::mail_headers();
        $s = self::get();
        $body = "This is a test from the Gold Rush Tournament Manager.\n\nIf you can read it, the From address and mail setup work.\nFrom: " . ( $headers ? str_replace( 'From: ', '', $headers[0] ) : 'WordPress default' ) . "\nSeason: " . $s['season_label'] . "\n";
        $ok = wp_mail( $to, 'GRSH test email', $body, $headers );
        return new WP_REST_Response( [ 'sent' => (bool) $ok, 'to' => $to, 'from' => $headers ? str_replace( 'From: ', '', $headers[0] ) : '', 'smtp' => self::smtp_detected(),
            'error' => $ok ? null : 'WordPress could not send the email. Check the SMTP plugin settings.' ], $ok ? 200 : 502 );
    }

    // ── Defaults (must stay in sync with DEFAULT_SETTINGS in Settings.jsx) ──

    private static function defaults(): array {
        return [
            'season_year' => 2027, 'season_label' => 'Gold Rush 2027', 'form_id' => 5047, 'status' => 'open',
            'registration_opens' => '2026-12-01', 'registration_closes' => '2027-02-28', 'draft_date' => '2027-03-15',
            'timer_enabled' => true, 'timer_seconds' => 90, 'draft_type' => 'snake', 'draft_order' => 'random',
            'divisions' => [
                [ 'key' => 'gold_open', 'label' => 'Gold Open', 'enabled' => true, 'format' => 'both', 'reg_teams' => 0, 'teams' => 4, 'min_roster' => 8, 'max_roster' => 12, 'goalie_min' => 1, 'goalie_max' => 2 ],
                [ 'key' => '45a',       'label' => '45A',       'enabled' => true, 'format' => 'both', 'reg_teams' => 0, 'teams' => 3, 'min_roster' => 7, 'max_roster' => 11, 'goalie_min' => 1, 'goalie_max' => 2 ],
                [ 'key' => 'senior_b',  'label' => 'Senior B',  'enabled' => true, 'format' => 'both', 'reg_teams' => 0, 'teams' => 3, 'min_roster' => 7, 'max_roster' => 11, 'goalie_min' => 1, 'goalie_max' => 2 ],
                [ 'key' => 'senior_c',  'label' => 'Senior C',  'enabled' => true, 'format' => 'both', 'reg_teams' => 0, 'teams' => 2, 'min_roster' => 8, 'max_roster' => 12, 'goalie_min' => 1, 'goalie_max' => 2 ],
                [ 'key' => 'womens',    'label' => 'Womens',    'enabled' => true, 'format' => 'both', 'reg_teams' => 0, 'teams' => 2, 'min_roster' => 8, 'max_roster' => 12, 'goalie_min' => 1, 'goalie_max' => 2 ],
            ],
            'email_registration' => true, 'email_roster' => true, 'email_payment' => true, 'email_alternate' => true,
            'email_team_balance' => true, 'email_team_deposit_nudge' => true, 'sender_name' => '', 'sender_email' => '',
            'player_fee' => null,
            'team_deposit_amount' => 500.00, 'team_fee_early_amount' => 1750.00, 'team_fee_late_amount' => 2000.00,
            'team_fee_early_cutoff_date' => '2027-01-06', 'team_balance_due_date' => '2027-03-08',
            'team_deposit_nudge_days' => 10, 'team_balance_reminder_days' => 14,
            'public_rosters' => false, 'sandbagging_auto_flag' => true,
            '_last_saved_by' => 0, '_last_saved_at' => '',
        ];
    }
}
