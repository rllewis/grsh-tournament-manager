<?php
/**
 * GRSH Captain Sync — the captain and team-deposit reconciliation page for Gold Rush Senior Hockey.
 *
 * What changed (2026-11-17): this class used to copy the Tahoe Champions Cup captain form (ID 2273) into the GRSH
 * teams table. That form is a different tournament with different divisions (40+/45+/50+), which the GRSH teams table
 * cannot hold, so the old sync wrote blank divisions or failed silently, put TCC teams into the GRSH season, and
 * overwrote names. It no longer touches form 2273 at all. TCC needs its own design before anything syncs.
 *
 * What it does now, for GRSH only:
 *   - shows every captain team this season and how far each is (invited, logged in, roster started, deposit, paid);
 *   - reads the live team registration form (GRSH_Team_Deposit::FORM_ID) and the test clone, and finds entries whose
 *     deposit never reached the team (the form fired when no team could be matched), with a preview of exactly what
 *     recording each one would write;
 *   - records those deposits on request, using the same code as the live form hook, with undo;
 *   - flags data problems (blank/invalid division, missing captain, no login account, duplicate team names).
 * It never creates teams, players or accounts. Teams come from Invite Captain / captain signup.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class GRSH_Captain_Sync {

    const TCC_FORM_ID = 2273;          // Tahoe Champions Cup. Read-only here: counted, never synced.
    const MAX_BATCH   = 25;
    const VALID_DIVISIONS = [ 'gold_open', '45a', 'senior_b', 'senior_c', 'womens' ]; // the grsh_teams.division ENUM
    const PENDING_TRANSIENT = 'grsh_cs_pending';
    const MAX_DELETE  = 50;
    const NUDGE_COOLDOWN_DAYS = 3;
    const HISTORY_ACTIONS = [ 'captain_sync_deposit', 'captain_sync_undo', 'captain_sync_division', 'captain_sync_team_deleted', 'captain_sync_team_restored', 'captain_sync_captain',
                              'captain_sync_invite_revoked', 'captain_sync_captain_detached', 'captain_sync_captain_reattached', 'captain_sync_note' ];
    const NOTES_OPT   = 'grsh_cs_notes';
    const NOTE_TAGS   = [ '', 'phoned', 'paying_by_check', 'waiting', 'dropped', 'vip' ];
    const IDLE_DAYS   = 14;           // a team with no activity this long is "idle"
    const SIMILAR_PCT = 85;           // team names this alike in one division are flagged as possible duplicates

    public static function register_hooks(): void {
        // Priority 20: after grsh_register_admin_menu() creates the parent menu.
        add_action( 'admin_menu', [ __CLASS__, 'register_admin_page' ], 20 );
        add_action( 'rest_api_init', [ __CLASS__, 'register_routes' ] );
    }

    // -------------------------------------------------------------------------
    // Menu + routes
    // -------------------------------------------------------------------------

    public static function register_admin_page(): void {
        $n     = self::pending_count_cached();
        $label = __( 'Captain Sync', 'grsh' );
        $menu  = $n > 0 ? $label . ' <span class="awaiting-mod">' . (int) $n . '</span>' : $label;
        add_submenu_page( 'grsh-tm-dashboard', $label, $menu, 'manage_options', 'grsh-captain-sync', 'grsh_render_app_shell' );
    }

    public static function register_routes(): void {
        $perm = fn() => current_user_can( 'manage_options' );
        register_rest_route( 'grsh/v1', '/captain-sync/overview', [
            'methods' => WP_REST_Server::READABLE, 'callback' => [ __CLASS__, 'rest_overview' ], 'permission_callback' => $perm,
        ] );
        register_rest_route( 'grsh/v1', '/captain-sync/record', [
            'methods' => WP_REST_Server::CREATABLE, 'callback' => [ __CLASS__, 'rest_record' ], 'permission_callback' => $perm,
        ] );
        register_rest_route( 'grsh/v1', '/captain-sync/undo', [
            'methods' => WP_REST_Server::CREATABLE, 'callback' => [ __CLASS__, 'rest_undo' ], 'permission_callback' => $perm,
        ] );
        register_rest_route( 'grsh/v1', '/captain-sync/team-division', [
            'methods' => WP_REST_Server::CREATABLE, 'callback' => [ __CLASS__, 'rest_team_division' ], 'permission_callback' => $perm,
        ] );
        register_rest_route( 'grsh/v1', '/captain-sync/delete-teams', [
            'methods' => WP_REST_Server::CREATABLE, 'callback' => [ __CLASS__, 'rest_delete_teams' ], 'permission_callback' => $perm,
        ] );
        register_rest_route( 'grsh/v1', '/captain-sync/restore-team', [
            'methods' => WP_REST_Server::CREATABLE, 'callback' => [ __CLASS__, 'rest_restore_team' ], 'permission_callback' => $perm,
        ] );
        register_rest_route( 'grsh/v1', '/captain-sync/team-captain', [
            'methods' => WP_REST_Server::CREATABLE, 'callback' => [ __CLASS__, 'rest_team_captain' ], 'permission_callback' => $perm,
        ] );
        register_rest_route( 'grsh/v1', '/captain-sync/players', [
            'methods' => WP_REST_Server::READABLE, 'callback' => [ __CLASS__, 'rest_players' ], 'permission_callback' => $perm,
        ] );
        register_rest_route( 'grsh/v1', '/captain-sync/nudge', [
            'methods' => WP_REST_Server::CREATABLE, 'callback' => [ __CLASS__, 'rest_nudge' ], 'permission_callback' => $perm,
        ] );
        foreach ( [ 'remove-team' => 'rest_remove_team', 'revoke-invite' => 'rest_revoke_invite', 'detach-captain' => 'rest_detach_captain',
                    'reattach-captain' => 'rest_reattach_captain', 'note' => 'rest_note', 'digest' => 'rest_digest' ] as $route => $cb ) {
            register_rest_route( 'grsh/v1', '/captain-sync/' . $route, [ 'methods' => WP_REST_Server::CREATABLE, 'callback' => [ __CLASS__, $cb ], 'permission_callback' => $perm ] );
        }
        register_rest_route( 'grsh/v1', '/captain-sync/team-detail', [
            'methods' => WP_REST_Server::READABLE, 'callback' => [ __CLASS__, 'rest_team_detail' ], 'permission_callback' => $perm,
        ] );
    }

    // -------------------------------------------------------------------------
    // Reading the world
    // -------------------------------------------------------------------------

    private static function settings(): array {
        return class_exists( 'GRSH_Settings' ) ? (array) GRSH_Settings::get() : [];
    }

    /** The season in Settings. No fallback: a missing season is reported, never replaced by season 1. */
    private static function season(): array {
        global $wpdb;
        $year = (int) ( self::settings()['season_year'] ?? 0 );
        $id   = $year ? (int) $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}grsh_seasons WHERE season_year = %d LIMIT 1", $year ) ) : 0;
        return [ 'id' => $id, 'year' => $year, 'exists' => $id > 0 ];
    }

    private static function form_ids(): array {
        return [
            'live' => defined( 'GRSH_Team_Deposit::FORM_ID' ) ? (int) constant( 'GRSH_Team_Deposit::FORM_ID' ) : 0,
            'test' => defined( 'GRSH_Team_Deposit::TEST_FORM_ID' ) ? (int) constant( 'GRSH_Team_Deposit::TEST_FORM_ID' ) : 0,
        ];
    }

    /** Which parts of the WPForms entries table exist. WPForms Lite has none of it, and column sets differ by version. */
    private static function entry_columns(): array {
        global $wpdb;
        $t = $wpdb->prefix . 'wpforms_entries';
        $out = [ 'table' => false, 'status' => false, 'user_id' => false, 'date' => false ];
        if ( ! $wpdb->get_var( "SHOW TABLES LIKE '{$t}'" ) ) {
            return $out;
        }
        $out['table'] = true;
        foreach ( [ 'status', 'user_id', 'date' ] as $c ) {
            $out[ $c ] = (bool) $wpdb->get_var( "SHOW COLUMNS FROM {$t} LIKE '{$c}'" );
        }
        return $out;
    }

    private static function form_info( int $form_id, array $cols ): array {
        global $wpdb;
        $info = [ 'id' => $form_id, 'exists' => false, 'title' => '', 'entries' => null, 'last_entry' => null ];
        if ( ! $form_id ) {
            return $info;
        }
        $post = $wpdb->get_row( $wpdb->prepare(
            "SELECT ID, post_title, post_status FROM {$wpdb->posts} WHERE ID = %d AND post_type = 'wpforms'", $form_id
        ), ARRAY_A );
        if ( $post && $post['post_status'] !== 'trash' ) {
            $info['exists'] = true;
            $info['title']  = (string) $post['post_title'];
        }
        if ( $cols['table'] ) {
            $t     = $wpdb->prefix . 'wpforms_entries';
            $where = $cols['status'] ? " AND status NOT IN ('spam','trash')" : '';
            $info['entries'] = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$t} WHERE form_id = %d{$where}", $form_id ) );
            if ( $cols['date'] ) {
                $info['last_entry'] = $wpdb->get_var( $wpdb->prepare( "SELECT MAX(date) FROM {$t} WHERE form_id = %d{$where}", $form_id ) ) ?: null;
            }
        }
        return $info;
    }

    /** Entries for the live and test team forms, oldest first. Spam and trash excluded. */
    private static function load_entries( array $cols, array $forms ): array {
        global $wpdb;
        $ids = array_values( array_filter( [ $forms['live'], $forms['test'] ] ) );
        if ( ! $cols['table'] || ! $ids ) {
            return [];
        }
        $t   = $wpdb->prefix . 'wpforms_entries';
        $sel = 'entry_id, form_id' . ( $cols['user_id'] ? ', user_id' : ', 0 AS user_id' ) . ( $cols['date'] ? ', date' : ", '' AS date" );
        $sql = "SELECT {$sel} FROM {$t} WHERE form_id IN (" . implode( ',', array_map( 'intval', $ids ) ) . ')'
             . ( $cols['status'] ? " AND status NOT IN ('spam','trash')" : '' ) . ' ORDER BY entry_id ASC LIMIT 500';
        return $wpdb->get_results( $sql, ARRAY_A ) ?: [];
    }

    /** WPForms stores entry dates in GMT (to my knowledge; the page shows the date used so a wrong guess is visible). */
    private static function entry_local_datetime( string $gmt ): string {
        if ( $gmt === '' ) {
            return current_time( 'mysql' );
        }
        return function_exists( 'get_date_from_gmt' ) ? (string) get_date_from_gmt( $gmt, 'Y-m-d H:i:s' ) : $gmt;
    }

    private static function teams( int $season_id ): array {
        global $wpdb;
        if ( ! $season_id ) {
            return [];
        }
        $rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT t.*, p.first_name AS cap_first, p.last_name AS cap_last, p.email AS cap_email, p.wp_user_id AS cap_user,
                    (SELECT COUNT(*) FROM {$wpdb->prefix}grsh_rosters r WHERE r.team_id = t.id) AS roster_size
             FROM {$wpdb->prefix}grsh_teams t
             LEFT JOIN {$wpdb->prefix}grsh_players p ON p.id = t.captain_player_id
             WHERE t.season_id = %d AND t.team_type = 'full_team'
             ORDER BY t.division, t.name", $season_id
        ), ARRAY_A ) ?: [];
        return $rows;
    }

    private static function min_players(): int {
        return class_exists( 'GRSH_Scoring' ) && defined( 'GRSH_Scoring::FULL_TEAM_MIN_PLAYERS' ) ? (int) constant( 'GRSH_Scoring::FULL_TEAM_MIN_PLAYERS' ) : 11;
    }

    private static function account_state( $user_id ): string {
        $user_id = (int) $user_id;
        if ( ! $user_id ) {
            return 'none';
        }
        $u = function_exists( 'get_userdata' ) ? get_userdata( $user_id ) : null;
        if ( ! $u ) {
            return 'none';
        }
        return ( isset( $u->user_activation_key ) && $u->user_activation_key !== '' ) ? 'pending' : 'active';
    }

    private static function stage( array $t ): string {
        if ( $t['payment_status'] === 'paid_in_full' ) { return 'paid'; }
        if ( ! empty( $t['deposit_paid_at'] ) )        { return 'deposit'; }
        if ( $t['roster_size'] > 0 )                   { return 'roster'; }
        if ( $t['account'] === 'active' )              { return 'active'; }
        return 'invited';
    }

    /**
     * Everything the page shows, in one pass. Pure reading; nothing is written.
     */
    public static function build_overview(): array {
        global $wpdb;
        $season = self::season();
        $forms  = self::form_ids();
        $cols   = self::entry_columns();
        $min    = self::min_players();
        $active = [];
        if ( class_exists( 'GRSH_Settings' ) && method_exists( 'GRSH_Settings', 'get_active_divisions' ) ) {
            foreach ( (array) GRSH_Settings::get_active_divisions() as $d ) { $active[ $d['key'] ] = $d['label']; }
        }

        $raw_teams = self::teams( $season['id'] );
        $hist_rows = self::history_rows_by_team( array_map( fn( $r ) => (int) $r['id'], $raw_teams ) );
        $nudged    = self::last_nudges();
        $notes     = self::notes();
        $activity  = self::last_activity();
        $now_ts    = strtotime( (string) current_time( 'mysql' ) ) ?: time();
        $issues    = [];
        $teams     = [];
        $by_cap    = [];
        $name_seen = [];
        foreach ( $raw_teams as $t ) {
            $t['roster_size'] = (int) $t['roster_size'];
            $t['account']     = $t['captain_player_id'] ? self::account_state( $t['cap_user'] ) : 'none';
            $dv_ok            = in_array( (string) $t['division'], self::VALID_DIVISIONS, true );
            $by_cap[ (int) $t['captain_player_id'] ][] = (int) $t['id'];
            $key = strtolower( trim( (string) $t['division'] ) . '|' . trim( (string) $t['name'] ) );
            $name_seen[ $key ][] = (int) $t['id'];
            $teams[ (int) $t['id'] ] = [
                'id' => (int) $t['id'], 'name' => (string) $t['name'], 'division' => (string) $t['division'], 'division_ok' => $dv_ok,
                'division_label' => $active[ $t['division'] ] ?? '',
                'captain' => $t['captain_player_id'] ? [ 'player_id' => (int) $t['captain_player_id'], 'name' => trim( $t['cap_first'] . ' ' . $t['cap_last'] ), 'email' => (string) $t['cap_email'] ] : null,
                'account' => $t['account'], 'roster_size' => $t['roster_size'], 'min_players' => $min,
                'payment_status' => (string) $t['payment_status'], 'deposit_paid_at' => $t['deposit_paid_at'], 'fee_tier' => $t['fee_tier'],
                'fee_total' => $t['fee_total'] !== null ? (float) $t['fee_total'] : null, 'balance_due' => $t['balance_due'] !== null ? (float) $t['balance_due'] : null,
                'entries' => 0, 'stage' => self::stage( $t ),
                'created_at' => (string) ( $t['created_at'] ?? '' ),
                'age_days' => ! empty( $t['created_at'] ) && strtotime( (string) $t['created_at'] ) ? max( 0, (int) floor( ( $now_ts - strtotime( (string) $t['created_at'] ) ) / 86400 ) ) : null,
                'deposit_amount' => $t['deposit_amount'] !== null ? (float) $t['deposit_amount'] : null,
                'history_rows' => $hist_rows[ (int) $t['id'] ] ?? 0,
                'last_nudged_at' => $nudged[ (int) $t['id'] ] ?? null,
                'test_flags' => self::test_flags( $t ),
                'note' => $notes[ (int) $t['id'] ] ?? null,
                'idle_days' => self::idle_days( $t, $activity[ (int) $t['id'] ] ?? '', $now_ts ),
            ];
            $teams[ (int) $t['id'] ]['looks_test'] = ! empty( $teams[ (int) $t['id'] ]['test_flags'] );
            if ( ! $dv_ok ) {
                $issues[] = [ 'key' => 'team_division', 'level' => 'bad', 'team_id' => (int) $t['id'],
                    'title' => 'Team "' . $t['name'] . '" has no valid division', 'detail' => $t['division'] === '' ? 'The division is blank. This is what the old Captain Sync left behind when it wrote a Tahoe Champions Cup division the table cannot hold.' : 'The stored division "' . $t['division'] . '" is not a GRSH division.',
                    'fix' => [ 'type' => 'division', 'team_id' => (int) $t['id'] ] ];
            }
            if ( ! $t['captain_player_id'] || $t['cap_email'] === null ) {
                $issues[] = [ 'key' => 'team_captain', 'level' => 'bad', 'team_id' => (int) $t['id'], 'title' => 'Team "' . $t['name'] . '" has no captain on file', 'detail' => 'Without a captain the team cannot log in, get deposit emails or be matched to a form entry.', 'fix' => [ 'type' => 'captain', 'team_id' => (int) $t['id'] ] ];
            } elseif ( $t['account'] === 'none' ) {
                $issues[] = [ 'key' => 'captain_account', 'level' => 'warn', 'team_id' => (int) $t['id'], 'title' => $t['cap_first'] . ' ' . $t['cap_last'] . ' (team "' . $t['name'] . '") has no login account', 'detail' => 'Deposits and rosters are matched by login. Send an invite.', 'fix' => [ 'type' => 'link', 'page' => 'grsh-tm-invite-captain', 'label' => 'Open Invite Captain' ] ];
            } elseif ( $t['account'] === 'pending' ) {
                $issues[] = [ 'key' => 'captain_password', 'level' => 'info', 'team_id' => (int) $t['id'], 'title' => $t['cap_first'] . ' ' . $t['cap_last'] . ' has not set a password yet', 'detail' => 'Invited, not activated.' ];
            }
        }
        foreach ( $name_seen as $ids ) {
            if ( count( $ids ) > 1 ) {
                $issues[] = [ 'key' => 'duplicate_team', 'level' => 'warn', 'team_id' => $ids[0], 'title' => 'Two teams share the name "' . $teams[ $ids[0] ]['name'] . '" in the same division', 'detail' => 'Team ids ' . implode(', ', $ids) . '. Rename or remove one.' ];
            }
        }
        foreach ( $by_cap as $pid => $ids ) {
            if ( $pid && count( $ids ) > 1 ) {
                $issues[] = [ 'key' => 'captain_two_teams', 'level' => 'warn', 'team_id' => $ids[0], 'title' => 'One captain is on ' . count( $ids ) . ' teams', 'detail' => 'Deposit entries can only match one of them. Team ids ' . implode(', ', $ids) . '.' ];
            }
        }

        // Possible duplicates: very similar names in one division, or one captain email on two teams.
        $tl = array_values( $teams ); $n_tl = min( count( $tl ), 200 ); $flagged = [];
        for ( $i = 0; $i < $n_tl; $i++ ) {
            for ( $j = $i + 1; $j < $n_tl; $j++ ) {
                $a = $tl[ $i ]; $b = $tl[ $j ];
                $an = strtolower( trim( $a['name'] ) ); $bn = strtolower( trim( $b['name'] ) );
                if ( $an === $bn ) { continue; }   // exact matches already have their own problem above
                similar_text( $an, $bn, $pct );
                $same_mail = $a['captain'] && $b['captain'] && $a['captain']['email'] !== '' && strtolower( $a['captain']['email'] ) === strtolower( $b['captain']['email'] ) && $a['captain']['player_id'] !== $b['captain']['player_id'];
                if ( ( $a['division'] === $b['division'] && $pct >= self::SIMILAR_PCT ) || $same_mail ) {
                    $k = $a['id'] . '-' . $b['id']; if ( isset( $flagged[ $k ] ) ) { continue; } $flagged[ $k ] = true;
                    $issues[] = [ 'key' => 'near_duplicate_team', 'level' => 'warn', 'team_id' => $a['id'], 'title' => '"' . $a['name'] . '" and "' . $b['name'] . '" may be the same team',
                        'detail' => $same_mail ? 'Two captain records share one email address.' : 'The names are ' . (int) round( $pct ) . '% alike in the same division. Team ids ' . $a['id'] . ' and ' . $b['id'] . '.' ];
                }
            }
        }
        foreach ( $teams as $tm ) {
            $f = $tm['division_ok'] ? self::format_of( $tm['division'] ) : 'both';
            if ( $f === 'draft' ) {
                $issues[] = [ 'key' => 'team_in_draft_division', 'level' => 'warn', 'team_id' => $tm['id'], 'title' => 'Team "' . $tm['name'] . '" is in a division set to Draft only',
                    'detail' => 'Settings says ' . ( $tm['division_label'] ?: $tm['division'] ) . ' is filled by the draft, not by registered teams. Change the division on the team or the Format in Settings.' ];
            }
            if ( ! empty( $tm['note']['follow_up'] ) && $tm['note']['follow_up'] <= substr( (string) current_time( 'mysql' ), 0, 10 ) ) {
                $issues[] = [ 'key' => 'follow_up_due', 'level' => 'info', 'team_id' => $tm['id'], 'title' => 'Follow-up due for "' . $tm['name'] . '"', 'detail' => (string) ( $tm['note']['note'] ?? '' ) ];
            }
        }

        $by_name = [];
        foreach ( $teams as $tm ) { $by_name[ strtolower( trim( $tm['name'] ) ) ][] = $tm['id']; }
        foreach ( $by_name as $ids ) {
            $divs = array_unique( array_map( fn( $i ) => $teams[ $i ]['division'], $ids ) );
            if ( count( $ids ) > 1 && count( $divs ) > 1 ) {
                $issues[] = [ 'key' => 'name_across_divisions', 'level' => 'warn', 'team_id' => $ids[0], 'title' => 'The name "' . $teams[ $ids[0] ]['name'] . '" is used by ' . count( $ids ) . ' teams in different divisions', 'detail' => 'Team ids ' . implode( ', ', $ids ) . '. Usually one of them is a leftover. Check which is real.' ];
            }
        }

        // Entries -> teams
        $entries   = [];
        $paid_seen = [];   // team_id => true once an earlier entry already counts for it
        $pending   = 0;
        foreach ( self::load_entries( $cols, $forms ) as $e ) {
            $row = [ 'entry_id' => (int) $e['entry_id'], 'form' => (int) $e['form_id'] === $forms['test'] ? 'test' : 'live', 'date' => (string) $e['date'],
                     'user_id' => (int) $e['user_id'], 'team_id' => null, 'team' => null, 'captain' => null, 'state' => '', 'would' => null ];
            if ( $row['form'] === 'test' ) {
                $row['state'] = 'test';
                $entries[] = $row;
                continue;
            }
            $team = null;
            if ( $row['user_id'] ) {
                $pid = (int) $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}grsh_players WHERE wp_user_id = %d", $row['user_id'] ) );
                if ( $pid ) {
                    foreach ( $teams as $tm ) {
                        if ( $tm['captain'] && $tm['captain']['player_id'] === $pid ) { $team = $tm; break; }
                    }
                    $row['state'] = $team ? '' : 'no_team';
                } else {
                    $row['state'] = 'no_player';
                }
            } else {
                $row['state'] = 'no_user';
            }
            if ( $team ) {
                $row['team_id'] = $team['id']; $row['team'] = $team['name']; $row['captain'] = $team['captain']['name'];
                $teams[ $team['id'] ]['entries']++;
                if ( ! empty( $paid_seen[ $team['id'] ] ) ) {
                    $row['state'] = 'duplicate';
                } elseif ( ! empty( $team['deposit_paid_at'] ) ) {
                    $row['state'] = 'recorded'; $paid_seen[ $team['id'] ] = true;
                } else {
                    $row['state'] = 'needs_recording'; $paid_seen[ $team['id'] ] = true; $pending++;
                    $local = self::entry_local_datetime( $row['date'] );
                    $row['would'] = class_exists( 'GRSH_Team_Deposit' ) ? GRSH_Team_Deposit::preview_deposit( $local ) : null;
                    $row['date_used'] = $local;
                }
            } else {
                $label = [ 'no_team' => 'has no team this season', 'no_player' => 'is not a known player', 'no_user' => 'was submitted without a login' ][ $row['state'] ] ?? '';
                $issues[] = [ 'key' => 'entry_' . $row['state'], 'level' => $row['state'] === 'no_team' ? 'bad' : 'warn', 'entry_id' => $row['entry_id'],
                    'title' => 'Form entry #' . $row['entry_id'] . ' ' . $label, 'detail' => 'A deposit form was submitted but cannot be matched to a captain team. Match it by hand in WPForms, then record it, or create the team first.' ];
            }
            $entries[] = $row;
        }
        foreach ( $entries as $row ) {
            if ( $row['state'] === 'needs_recording' ) {
                $issues[] = [ 'key' => 'needs_recording', 'level' => 'bad', 'entry_id' => $row['entry_id'], 'team_id' => $row['team_id'],
                    'title' => 'Deposit for "' . $row['team'] . '" was never recorded', 'detail' => 'Entry #' . $row['entry_id'] . ' is on the form but the team shows no deposit. Preview and record it below.',
                    'fix' => [ 'type' => 'record', 'entry_id' => $row['entry_id'] ] ];
            }
        }

        // Which teams can be deleted for good: no players, no money, no matched form entry, no history rows.
        foreach ( $teams as $id => $tm ) {
            $teams[ $id ]['delete'] = self::delete_check( $tm );
        }
        $test_ids = array_values( array_filter( array_keys( $teams ), fn( $i ) => $teams[ $i ]['looks_test'] ) );
        if ( $test_ids ) {
            $issues[] = [ 'key' => 'test_data', 'level' => 'warn', 'title' => count( $test_ids ) . ( count( $test_ids ) === 1 ? ' team looks' : ' teams look' ) . ' like test data',
                'detail' => 'Names with "test" in them or captain emails with a + alias. Review them in Clean-up and remove the ones that are not real.', 'fix' => [ 'type' => 'cleanup' ] ];
        }

        // health / wiring
        $health = [
            [ 'key' => 'season',  'ok' => $season['exists'], 'text' => $season['exists'] ? 'Season ' . $season['year'] . ' found.' : 'Settings says season ' . ( $season['year'] ?: '(none)' ) . ', but no season with that year exists. Nothing can be recorded until it does.' ],
            [ 'key' => 'entries', 'ok' => $cols['table'], 'text' => $cols['table'] ? 'WPForms entries are readable.' : 'WPForms entries table not found (WPForms Lite does not keep entries). Deposits cannot be checked.' ],
            [ 'key' => 'hook',    'ok' => class_exists( 'GRSH_Team_Deposit' ) && ( ! function_exists( 'has_action' ) || has_action( 'wpforms_process_complete', [ 'GRSH_Team_Deposit', 'on_deposit_form_submit' ] ) !== false ), 'text' => class_exists( 'GRSH_Team_Deposit' ) ? 'Live deposit hook is loaded.' : 'Team deposit code is not loaded.' ],
            [ 'key' => 'live',    'ok' => true, 'text' => '' ],
        ];
        $health = array_values( array_filter( $health, fn( $h ) => $h['text'] !== '' ) );
        $live = self::form_info( $forms['live'], $cols );
        $test = self::form_info( $forms['test'], $cols );
        foreach ( [ 'live' => $live, 'test' => $test ] as $k => $f ) {
            $health[] = [ 'key' => 'form_' . $k, 'ok' => $f['exists'], 'text' => $f['exists'] ? ucfirst( $k ) . ' form #' . $f['id'] . ' "' . $f['title'] . '" found.' : ucfirst( $k ) . ' form #' . $f['id'] . ' not found in WPForms.' ];
        }

        $tcc = self::form_info( self::TCC_FORM_ID, $cols );

        $funnel = [ 'teams' => count( $teams ), 'logged_in' => 0, 'roster' => 0, 'deposit' => 0, 'paid' => 0 ];
        foreach ( $teams as $t ) {
            if ( $t['account'] === 'active' ) { $funnel['logged_in']++; }
            if ( $t['roster_size'] > 0 )      { $funnel['roster']++; }
            if ( $t['deposit_paid_at'] )      { $funnel['deposit']++; }
            if ( $t['payment_status'] === 'paid_in_full' ) { $funnel['paid']++; }
        }

        $money   = self::money( $teams );
        $balance = self::division_balance( $teams, $active );

        return [
            'money' => $money, 'balance' => $balance, 'cooldown_days' => self::NUDGE_COOLDOWN_DAYS,
            'season' => $season, 'health' => $health, 'forms' => [ 'live' => $live, 'test' => $test ],
            'tcc' => [ 'form_id' => self::TCC_FORM_ID, 'exists' => $tcc['exists'], 'entries' => $tcc['entries'], 'synced' => false,
                       'note' => 'Tahoe Champions Cup is a separate tournament with its own divisions. It is not synced into GRSH. It needs its own design first.' ],
            'funnel' => $funnel, 'teams' => array_values( $teams ), 'entries' => $entries, 'issues' => $issues,
            'pending' => $pending, 'history' => self::history(), 'divisions' => self::division_options( $active ),
            'last_entry_at' => self::last_entry_at( $entries ),
            'min_players' => $min, 'can_write' => $season['exists'],
            'generated_at' => current_time( 'mysql' ),
        ];
    }

    private static function division_options( array $active ): array {
        $labels = [ 'gold_open' => 'Gold Open', '45a' => '45A', 'senior_b' => 'Senior B', 'senior_c' => 'Senior C', 'womens' => 'Women\'s' ];
        $out = [];
        foreach ( self::VALID_DIVISIONS as $k ) { $out[] = [ 'key' => $k, 'label' => $active[ $k ] ?? $labels[ $k ], 'active' => isset( $active[ $k ] ) ]; }
        return $out;
    }

    // -------------------------------------------------------------------------
    // History + audit
    // -------------------------------------------------------------------------

    private static function audit( string $action, ?int $team_id, ?array $before, ?array $after, string $notes ): int {
        global $wpdb;
        $wpdb->insert( "{$wpdb->prefix}grsh_audit_logs", [
            'season_id' => self::season()['id'] ?: null, 'wp_user_id' => get_current_user_id() ?: 0,
            'user_display' => ( ! function_exists( 'is_user_logged_in' ) || is_user_logged_in() ) ? ( wp_get_current_user()->display_name ?: 'unknown' ) : 'system',
            'action' => $action, 'object_type' => 'team', 'object_id' => $team_id,
            'before_value' => $before ? wp_json_encode( $before ) : null, 'after_value' => $after ? wp_json_encode( $after ) : null, 'notes' => $notes,
        ] );
        return (int) $wpdb->insert_id;
    }

    private static function history(): array {
        global $wpdb;
        $in   = "'" . implode( "','", self::HISTORY_ACTIONS ) . "'";
        $rows = $wpdb->get_results(
            "SELECT id, user_display, action, object_id, before_value, after_value, notes, created_at
             FROM {$wpdb->prefix}grsh_audit_logs WHERE action IN ({$in})
             ORDER BY id DESC LIMIT 40", ARRAY_A ) ?: [];
        $undone = []; $restored = [];
        foreach ( $rows as $r ) {
            $u = json_decode( (string) $r['after_value'], true );
            if ( $r['action'] === 'captain_sync_undo' && ! empty( $u['undid'] ) )          { $undone[ (int) $u['undid'] ] = true; }
            if ( $r['action'] === 'captain_sync_team_restored' && ! empty( $u['restored'] ) ) { $restored[ (int) $u['restored'] ] = true; }
        }
        $out = [];
        foreach ( $rows as $r ) {
            $after  = json_decode( (string) $r['after_value'], true ) ?: [];
            $item = [ 'id' => (int) $r['id'], 'action' => $r['action'], 'team_id' => (int) $r['object_id'], 'by' => $r['user_display'], 'at' => $r['created_at'], 'notes' => (string) $r['notes'],
                      'undone' => isset( $undone[ (int) $r['id'] ] ) || isset( $restored[ (int) $r['id'] ] ), 'can_undo' => false, 'can_restore' => false, 'can_reattach' => false ];
            if ( $r['action'] === 'captain_sync_deposit' && ! $item['undone'] ) {
                $item['can_undo'] = self::team_matches( (int) $r['object_id'], $after['after'] ?? [] );
            }
            if ( $r['action'] === 'captain_sync_team_deleted' && ! $item['undone'] ) {
                $item['can_restore'] = ! self::team_exists( (int) $r['object_id'] ) && is_array( json_decode( (string) $r['before_value'], true ) );
            }
            if ( $r['action'] === 'captain_sync_captain_detached' && ! $item['undone'] ) {
                $b = json_decode( (string) $r['before_value'], true ) ?: [];
                $item['can_reattach'] = ! empty( $b['captain_player_id'] ) && self::team_exists( (int) $r['object_id'] ) && self::team_captain_id( (int) $r['object_id'] ) === 0
                    && ! self::captain_elsewhere( (int) $b['captain_player_id'], (int) $r['object_id'] );
            }
            $out[] = $item;
        }
        return $out;
    }

    private static function team_captain_id( int $team_id ): int {
        global $wpdb;
        return (int) $wpdb->get_var( $wpdb->prepare( "SELECT captain_player_id FROM {$wpdb->prefix}grsh_teams WHERE id = %d", $team_id ) );
    }

    private static function captain_elsewhere( int $player_id, int $except_team ): bool {
        global $wpdb;
        return (bool) $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}grsh_teams WHERE captain_player_id = %d AND id <> %d AND season_id = %d LIMIT 1", $player_id, $except_team, self::season()['id'] ) );
    }

    /** True when the team still holds exactly the deposit values we wrote (nobody changed them since). */
    private static function team_matches( int $team_id, array $after ): bool {
        global $wpdb;
        if ( ! $after ) { return false; }
        $t = $wpdb->get_row( $wpdb->prepare( "SELECT fee_total, fee_tier, deposit_amount, deposit_paid_at, balance_due, payment_status FROM {$wpdb->prefix}grsh_teams WHERE id = %d", $team_id ), ARRAY_A );
        if ( ! $t ) { return false; }
        foreach ( [ 'fee_tier', 'deposit_paid_at', 'payment_status' ] as $k ) { if ( (string) $t[ $k ] !== (string) ( $after[ $k ] ?? '' ) ) { return false; } }
        foreach ( [ 'fee_total', 'deposit_amount', 'balance_due' ] as $k ) { if ( abs( (float) $t[ $k ] - (float) ( $after[ $k ] ?? 0 ) ) > 0.001 ) { return false; } }
        return true;
    }

    // -------------------------------------------------------------------------
    // REST
    // -------------------------------------------------------------------------

    public static function rest_overview(): WP_REST_Response {
        return new WP_REST_Response( self::build_overview(), 200 );
    }

    public static function rest_record( WP_REST_Request $request ): WP_REST_Response {
        $body = (array) $request->get_json_params();
        if ( ! $body && method_exists( $request, 'get_params' ) ) { $body = (array) $request->get_params(); }
        $ids = array_values( array_unique( array_filter( array_map( 'intval', (array) ( $body['entry_ids'] ?? [] ) ) ) ) );
        $send = ! empty( $body['send_email'] );
        if ( empty( $body['confirm'] ) ) {
            return new WP_REST_Response( [ 'success' => false, 'message' => 'Confirmation is required before anything is written.' ], 400 );
        }
        if ( ! $ids ) {
            return new WP_REST_Response( [ 'success' => false, 'message' => 'No entries selected.' ], 400 );
        }
        if ( count( $ids ) > self::MAX_BATCH ) {
            return new WP_REST_Response( [ 'success' => false, 'message' => 'At most ' . self::MAX_BATCH . ' entries per request.' ], 400 );
        }
        if ( ! class_exists( 'GRSH_Team_Deposit' ) ) {
            return new WP_REST_Response( [ 'success' => false, 'message' => 'Team deposit code is not loaded.' ], 500 );
        }
        $season = self::season();
        if ( ! $season['exists'] ) {
            return new WP_REST_Response( [ 'success' => false, 'message' => 'Season ' . ( $season['year'] ?: '(none)' ) . ' from Settings does not exist, so nothing can be recorded.' ], 409 );
        }

        // Always decide from a fresh read, never from what the browser says.
        $ov = self::build_overview();
        $by_entry = [];
        foreach ( $ov['entries'] as $e ) { $by_entry[ $e['entry_id'] ] = $e; }
        global $wpdb;
        $results = [];
        $done = 0;
        foreach ( $ids as $id ) {
            $e = $by_entry[ $id ] ?? null;
            $res = [ 'entry_id' => $id, 'team' => $e['team'] ?? null, 'team_id' => $e['team_id'] ?? null, 'status' => 'skipped', 'message' => '' ];
            if ( ! $e ) { $res['message'] = 'Entry not found on the team forms.'; }
            elseif ( $e['state'] === 'test' ) { $res['message'] = 'Entries from the test form are never recorded.'; }
            elseif ( $e['state'] !== 'needs_recording' ) { $res['message'] = [ 'recorded' => 'Already recorded.', 'duplicate' => 'Another entry already covers this team.', 'no_team' => 'No team for this captain this season.', 'no_player' => 'Not a known player.', 'no_user' => 'Submitted without a login.' ][ $e['state'] ] ?? 'Nothing to record.'; }
            else {
                $team = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}grsh_teams WHERE id = %d", (int) $e['team_id'] ), ARRAY_A );
                if ( ! $team ) { $res['status'] = 'error'; $res['message'] = 'Team no longer exists.'; }
                elseif ( (int) $team['season_id'] !== $season['id'] ) { $res['status'] = 'error'; $res['message'] = 'That team belongs to a different season.'; }
                else {
                    $r = GRSH_Team_Deposit::record_deposit( $team, $id, $e['date_used'] ?? null, $send );
                    if ( ! empty( $r['recorded'] ) ) {
                        $aid = self::audit( 'captain_sync_deposit', (int) $team['id'], $r['before'], [ 'entry_id' => $id, 'after' => $r['after'], 'email_sent' => $send ],
                            'Recorded deposit from form entry #' . $id . ' (paid ' . ( $e['date_used'] ?? '' ) . ', ' . $r['fee_tier'] . ' tier)' );
                        $res += [ 'audit_id' => $aid ];
                        $res['status'] = 'recorded'; $res['message'] = 'Recorded: ' . $r['fee_tier'] . ' tier, $' . number_format( $r['fee_total'], 2 ) . ' total, $' . number_format( $r['balance_due'], 2 ) . ' balance.';
                        $res['fee_total'] = $r['fee_total']; $res['fee_tier'] = $r['fee_tier']; $res['balance_due'] = $r['balance_due'];
                        $done++;
                    } else { $res['message'] = 'Already recorded.'; }
                }
            }
            $results[] = $res;
        }
        self::clear_pending_cache();
        return new WP_REST_Response( [
            'success' => true, 'recorded' => $done, 'results' => $results,
            'message' => $done ? "Recorded {$done} deposit" . ( $done === 1 ? '' : 's' ) . '.' : 'Nothing was recorded.',
        ], 200 );
    }

    public static function rest_undo( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $id = (int) ( ( (array) $request->get_json_params() )['audit_id'] ?? $request->get_param( 'audit_id' ) );
        $row = $id ? $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}grsh_audit_logs WHERE id = %d AND action = 'captain_sync_deposit'", $id ), ARRAY_A ) : null;
        if ( ! $row ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'That change was not found.' ], 404 ); }
        $item = null;
        foreach ( self::history() as $h ) { if ( $h['id'] === $id ) { $item = $h; break; } }
        if ( ! $item )            { return new WP_REST_Response( [ 'success' => false, 'message' => 'This change is too old to undo from here (only the latest 30 are kept in the list).' ], 409 ); }
        if ( $item['undone'] )    { return new WP_REST_Response( [ 'success' => false, 'message' => 'Already undone.' ], 409 ); }
        if ( ! $item['can_undo'] ){ return new WP_REST_Response( [ 'success' => false, 'message' => 'The team has changed since this was recorded, so it cannot be undone safely.' ], 409 ); }
        $before = json_decode( (string) $row['before_value'], true );
        if ( ! is_array( $before ) ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'No undo data was saved for this change.' ], 409 ); }
        $team_id = (int) $row['object_id'];
        $wpdb->update( "{$wpdb->prefix}grsh_teams", [
            'fee_total' => $before['fee_total'] ?? null, 'fee_tier' => $before['fee_tier'] ?? null, 'deposit_amount' => $before['deposit_amount'] ?? null,
            'deposit_paid_at' => $before['deposit_paid_at'] ?? null, 'balance_due' => $before['balance_due'] ?? null, 'payment_status' => $before['payment_status'] ?? 'unpaid',
        ], [ 'id' => $team_id ] );
        self::audit( 'captain_sync_undo', $team_id, null, [ 'undid' => $id ], 'Undid captain sync deposit #' . $id );
        self::clear_pending_cache();
        return new WP_REST_Response( [ 'success' => true, 'message' => 'Deposit removed from the team. A confirmation email that was already sent cannot be unsent.' ], 200 );
    }

    public static function rest_team_division( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $b = (array) $request->get_json_params();
        $team_id  = (int) ( $b['team_id'] ?? 0 );
        $division = (string) ( $b['division'] ?? '' );
        if ( ! in_array( $division, self::VALID_DIVISIONS, true ) ) {
            return new WP_REST_Response( [ 'success' => false, 'message' => 'Choose a valid GRSH division.' ], 400 );
        }
        $team = $team_id ? $wpdb->get_row( $wpdb->prepare( "SELECT id, name, division, team_type FROM {$wpdb->prefix}grsh_teams WHERE id = %d", $team_id ), ARRAY_A ) : null;
        if ( ! $team || $team['team_type'] !== 'full_team' ) {
            return new WP_REST_Response( [ 'success' => false, 'message' => 'Team not found.' ], 404 );
        }
        $wpdb->update( "{$wpdb->prefix}grsh_teams", [ 'division' => $division ], [ 'id' => $team_id ] );
        self::audit( 'captain_sync_division', $team_id, [ 'division' => $team['division'] ], [ 'division' => $division ], 'Division set for "' . $team['name'] . '"' );
        return new WP_REST_Response( [ 'success' => true, 'message' => 'Division saved.' ], 200 );
    }

    // -------------------------------------------------------------------------
    // Clean-up, money, balance helpers
    // -------------------------------------------------------------------------

    private static function table_exists( string $name ): bool {
        global $wpdb;
        return (bool) $wpdb->get_var( "SHOW TABLES LIKE '{$wpdb->prefix}{$name}'" );
    }

    private static function team_exists( int $id ): bool {
        global $wpdb;
        return $id > 0 && (bool) $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}grsh_teams WHERE id = %d", $id ) );
    }

    /** team_id => number of player-history rows pointing at it (history has no foreign key, so a delete would orphan them). */
    private static function history_rows_by_team( array $ids ): array {
        global $wpdb;
        $ids = array_values( array_filter( array_map( 'intval', $ids ) ) );
        if ( ! $ids || ! self::table_exists( 'grsh_player_history' ) ) { return []; }
        $rows = $wpdb->get_results( "SELECT team_id, COUNT(*) AS n FROM {$wpdb->prefix}grsh_player_history WHERE team_id IN (" . implode( ',', $ids ) . ') GROUP BY team_id', ARRAY_A ) ?: [];
        $out = [];
        foreach ( $rows as $r ) { $out[ (int) $r['team_id'] ] = (int) $r['n']; }
        return $out;
    }

    /** team_id => when the captain was last nudged from this page. */
    private static function last_nudges(): array {
        global $wpdb;
        $rows = $wpdb->get_results( "SELECT object_id, MAX(created_at) AS at FROM {$wpdb->prefix}grsh_audit_logs WHERE action = 'captain_sync_nudge' GROUP BY object_id", ARRAY_A ) ?: [];
        $out = [];
        foreach ( $rows as $r ) { $out[ (int) $r['object_id'] ] = (string) $r['at']; }
        return $out;
    }

    /** Why a team looks like dummy data. Only a hint: nothing is removed without a human picking it. */
    public static function test_flags( array $t ): array {
        $flags = [];
        foreach ( [ (string) ( $t['name'] ?? '' ), trim( ( $t['cap_first'] ?? '' ) . ' ' . ( $t['cap_last'] ?? '' ) ) ] as $n ) {
            if ( preg_match( '/\b(test|dummy|demo|sample|fake)\b/i', $n ) ) { $flags[] = 'test_name'; break; }
        }
        $email = (string) ( $t['cap_email'] ?? '' );
        $local = strpos( $email, '@' ) !== false ? substr( $email, 0, strpos( $email, '@' ) ) : $email;
        if ( strpos( $local, '+' ) !== false ) { $flags[] = 'alias_email'; }
        return $flags;
    }

    /** A team may be deleted for good only when nothing real hangs off it. */
    private static function delete_check( array $t ): array {
        $why = [];
        if ( (int) $t['roster_size'] > 0 ) { $why[] = 'it has ' . (int) $t['roster_size'] . ( (int) $t['roster_size'] === 1 ? ' player' : ' players' ) . ' on the roster'; }
        if ( $t['payment_status'] !== 'unpaid' || ! empty( $t['deposit_paid_at'] ) || (float) ( $t['deposit_amount'] ?? 0 ) > 0 ) { $why[] = 'a payment is recorded on it'; }
        if ( (int) $t['entries'] > 0 ) { $why[] = 'a deposit form entry belongs to its captain'; }
        if ( (int) ( $t['history_rows'] ?? 0 ) > 0 ) { $why[] = 'player history points at it'; }
        return [ 'allowed' => ! $why, 'reasons' => $why ];
    }

    private static function money( array $teams ): array {
        $s      = self::settings();
        $early  = (float) ( $s['team_fee_early_amount'] ?? 0 );
        $late   = (float) ( $s['team_fee_late_amount'] ?? 0 );
        $cutoff = (string) ( $s['team_fee_early_cutoff_date'] ?? '' );
        $now    = class_exists( 'GRSH_Team_Deposit' ) && method_exists( 'GRSH_Team_Deposit', 'preview_deposit' ) ? GRSH_Team_Deposit::preview_deposit() : [];
        $fee_now = (float) ( $now['fee_total'] ?? $early );
        $deposit = (float) ( $now['deposit_amount'] ?? ( $s['team_deposit_amount'] ?? 0 ) );
        $collected = 0.0; $outstanding = 0.0; $paying = 0; $waiting = 0;
        foreach ( $teams as $t ) {
            if ( ! empty( $t['deposit_paid_at'] ) ) {
                $paying++;
                if ( $t['payment_status'] === 'paid_in_full' ) { $collected += (float) ( $t['fee_total'] ?? $t['deposit_amount'] ?? 0 ); }
                else {
                    $collected   += (float) ( $t['deposit_amount'] ?? 0 );
                    $outstanding += $t['balance_due'] !== null ? (float) $t['balance_due'] : max( 0, (float) ( $t['fee_total'] ?? 0 ) - (float) ( $t['deposit_amount'] ?? 0 ) );
                }
            } else {
                $waiting++;
            }
        }
        $today = substr( (string) current_time( 'mysql' ), 0, 10 );
        $days_left = null;
        if ( $cutoff !== '' && strtotime( $cutoff ) !== false ) {
            $d = (int) floor( ( strtotime( $cutoff ) - strtotime( $today ) ) / 86400 );
            $days_left = $d >= 0 ? $d : null;
        }
        return [
            'collected' => round( $collected, 2 ), 'outstanding' => round( $outstanding, 2 ), 'paying' => $paying, 'waiting' => $waiting,
            'fee_now' => $fee_now, 'tier_now' => (string) ( $now['fee_tier'] ?? '' ), 'early' => $early, 'late' => $late, 'deposit' => $deposit,
            'potential_now' => round( $waiting * $fee_now, 2 ), 'potential_late' => round( $waiting * $late, 2 ),
            'saves_per_team' => ( ( $now['fee_tier'] ?? '' ) === 'early' && $late > $early ) ? round( $late - $early, 2 ) : 0.0,
            'cutoff' => $cutoff, 'days_left' => $days_left, 'balance_due_date' => (string) ( $s['team_balance_due_date'] ?? '' ),
        ];
    }

    private static function division_balance( array $teams, array $active ): array {
        $counts = [];
        foreach ( $teams as $t ) { $counts[ $t['division'] ] = ( $counts[ $t['division'] ] ?? 0 ) + 1; }
        $rows = [];
        $list = class_exists( 'GRSH_Settings' ) && method_exists( 'GRSH_Settings', 'get_active_divisions' ) ? (array) GRSH_Settings::get_active_divisions() : [];
        foreach ( $list as $d ) {
            $k = (string) $d['key']; $n = $counts[ $k ] ?? 0;
            $fmt = isset( $d['format'] ) && in_array( $d['format'], [ 'draft', 'teams', 'both' ], true ) ? $d['format'] : 'both';
            $teams_cfg = isset( $d['teams'] ) && $d['teams'] !== null ? (int) $d['teams'] : null;
            $reg = (int) ( $d['reg_teams'] ?? 0 );
            // Registered teams only fill the registered slots. A draft-only division expects none.
            if ( $fmt === 'draft' )                  { $exp = null; }
            elseif ( $fmt === 'both' && $reg > 0 )   { $exp = $reg; }
            else                                     { $exp = $teams_cfg; }
            $rows[] = [ 'key' => $k, 'label' => (string) ( $d['label'] ?? $k ), 'format' => $fmt, 'expected' => $exp, 'actual' => $n, 'delta' => $exp === null ? null : $n - $exp ];
            unset( $counts[ $k ] );
        }
        return [ 'rows' => $rows, 'other' => array_sum( $counts ) ];
    }

    /** Format of one division from Settings ('both' when Settings has no such field, as before the Format setting existed). */
    private static function format_of( string $key ): string {
        if ( class_exists( 'GRSH_Settings' ) && method_exists( 'GRSH_Settings', 'division_format' ) ) { return (string) GRSH_Settings::division_format( $key ); }
        return 'both';
    }

    private static function last_entry_at( array $entries ): ?string {
        $best = null;
        foreach ( $entries as $e ) { if ( ( $e['form'] ?? '' ) === 'live' && ( $best === null || (string) $e['date'] > $best ) ) { $best = (string) $e['date']; } }
        return $best;
    }

    /** team_id => latest audit-log time for that team (any action), used to spot teams that went quiet. */
    private static function last_activity(): array {
        global $wpdb;
        $rows = $wpdb->get_results( "SELECT object_id, MAX(created_at) AS at FROM {$wpdb->prefix}grsh_audit_logs WHERE object_type = 'team' AND object_id IS NOT NULL GROUP BY object_id", ARRAY_A ) ?: [];
        $out = [];
        foreach ( $rows as $r ) { $out[ (int) $r['object_id'] ] = (string) $r['at']; }
        return $out;
    }

    /** Days since anything happened to a team that has not paid a deposit yet. Null once a deposit is in (idle no longer matters). */
    public static function idle_days( array $t, string $last_audit, int $now_ts ): ?int {
        if ( ! empty( $t['deposit_paid_at'] ) ) { return null; }
        $best = 0;
        foreach ( [ (string) ( $t['created_at'] ?? '' ), $last_audit ] as $d ) { $ts = $d !== '' ? strtotime( $d ) : false; if ( $ts && $ts > $best ) { $best = $ts; } }
        return $best ? max( 0, (int) floor( ( $now_ts - $best ) / 86400 ) ) : null;
    }

    private static function notes(): array {
        $v = get_option( self::NOTES_OPT, [] );
        return is_array( $v ) ? $v : [];
    }

    private static function login_url(): string {
        return function_exists( 'wp_login_url' ) ? (string) wp_login_url() : home_url( '/' );
    }

    // -------------------------------------------------------------------------
    // REST: delete / restore / captain / players / nudge
    // -------------------------------------------------------------------------

    public static function rest_delete_teams( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $b   = (array) $request->get_json_params();
        $ids = array_values( array_unique( array_filter( array_map( 'intval', (array) ( $b['team_ids'] ?? [] ) ) ) ) );
        if ( ( $b['confirm'] ?? '' ) !== 'DELETE' ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'Type DELETE to confirm. Nothing was deleted.' ], 400 ); }
        if ( ! $ids || count( $ids ) > self::MAX_DELETE ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'Choose between 1 and ' . self::MAX_DELETE . ' teams.' ], 400 ); }
        if ( ! self::season()['exists'] ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'The season in Settings does not exist, so nothing can be changed.' ], 409 ); }
        $by = []; foreach ( self::build_overview()['teams'] as $t ) { $by[ $t['id'] ] = $t; }
        $results = []; $deleted = 0;
        foreach ( $ids as $id ) {
            $t = $by[ $id ] ?? null;
            if ( ! $t ) { $results[] = [ 'team_id' => $id, 'status' => 'skipped', 'name' => '', 'message' => 'Not found in this season.' ]; continue; }
            if ( ! $t['delete']['allowed'] ) { $results[] = [ 'team_id' => $id, 'status' => 'skipped', 'name' => $t['name'], 'message' => 'Kept: ' . implode( ' and ', $t['delete']['reasons'] ) . '.' ]; continue; }
            $row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}grsh_teams WHERE id = %d AND team_type = 'full_team'", $id ), ARRAY_A );
            if ( ! $row ) { $results[] = [ 'team_id' => $id, 'status' => 'skipped', 'name' => $t['name'], 'message' => 'Not found.' ]; continue; }
            $ok = $wpdb->delete( "{$wpdb->prefix}grsh_teams", [ 'id' => $id ] );
            if ( ! $ok ) { $results[] = [ 'team_id' => $id, 'status' => 'error', 'name' => $t['name'], 'message' => 'The database refused: ' . ( $wpdb->last_error ?: 'unknown reason' ) ]; continue; }
            self::audit( 'captain_sync_team_deleted', $id, $row, null, 'Deleted team "' . $t['name'] . '" (no players, no payments)' );
            $deleted++;
            $results[] = [ 'team_id' => $id, 'status' => 'deleted', 'name' => $t['name'], 'message' => 'Deleted.' ];
        }
        self::clear_pending_cache();
        return new WP_REST_Response( [ 'success' => true, 'deleted' => $deleted, 'results' => $results,
            'message' => $deleted ? 'Deleted ' . $deleted . ( $deleted === 1 ? ' team.' : ' teams.' ) . ' Captain accounts and player records were not touched.' : 'Nothing was deleted.' ], 200 );
    }

    public static function rest_restore_team( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $id = (int) ( ( (array) $request->get_json_params() )['audit_id'] ?? 0 );
        $row = $id ? $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}grsh_audit_logs WHERE id = %d AND action = 'captain_sync_team_deleted'", $id ), ARRAY_A ) : null;
        if ( ! $row ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'That deletion was not found.' ], 404 ); }
        $item = null; foreach ( self::history() as $h ) { if ( $h['id'] === $id ) { $item = $h; break; } }
        if ( ! $item )                { return new WP_REST_Response( [ 'success' => false, 'message' => 'This deletion is too old to restore from here.' ], 409 ); }
        if ( $item['undone'] )        { return new WP_REST_Response( [ 'success' => false, 'message' => 'Already restored.' ], 409 ); }
        if ( ! $item['can_restore'] ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'A team with that id exists again, so it cannot be restored.' ], 409 ); }
        $snap = json_decode( (string) $row['before_value'], true );
        if ( ! empty( $snap['captain_player_id'] ) && ! $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}grsh_players WHERE id = %d", (int) $snap['captain_player_id'] ) ) ) { $snap['captain_player_id'] = null; }
        $rosters = isset( $snap['_rosters'] ) && is_array( $snap['_rosters'] ) ? $snap['_rosters'] : [];
        unset( $snap['_rosters'], $snap['_forced'] );
        $ok = $wpdb->insert( "{$wpdb->prefix}grsh_teams", $snap );
        if ( $ok ) {
            foreach ( $rosters as $rr ) {
                if ( ! is_array( $rr ) ) { continue; }
                if ( ! empty( $rr['id'] ) && $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}grsh_rosters WHERE id = %d", (int) $rr['id'] ) ) ) { continue; }
                $wpdb->insert( "{$wpdb->prefix}grsh_rosters", $rr );
            }
        }
        if ( ! $ok ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'The database refused: ' . ( $wpdb->last_error ?: 'unknown reason' ) ], 500 ); }
        self::audit( 'captain_sync_team_restored', (int) $row['object_id'], null, [ 'restored' => $id ], 'Restored deleted team "' . ( $snap['name'] ?? '' ) . '"' );
        self::clear_pending_cache();
        return new WP_REST_Response( [ 'success' => true, 'message' => 'Team restored.' ], 200 );
    }

    public static function rest_team_captain( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $b = (array) $request->get_json_params();
        $team_id = (int) ( $b['team_id'] ?? 0 ); $player_id = (int) ( $b['player_id'] ?? 0 );
        $season = self::season();
        if ( ! $season['exists'] ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'The season in Settings does not exist, so nothing can be changed.' ], 409 ); }
        $team = $team_id ? $wpdb->get_row( $wpdb->prepare( "SELECT id, name, season_id, team_type, captain_player_id FROM {$wpdb->prefix}grsh_teams WHERE id = %d", $team_id ), ARRAY_A ) : null;
        if ( ! $team || $team['team_type'] !== 'full_team' || (int) $team['season_id'] !== $season['id'] ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'Team not found in this season.' ], 404 ); }
        $pl = $player_id ? $wpdb->get_row( $wpdb->prepare( "SELECT id, first_name, last_name, wp_user_id FROM {$wpdb->prefix}grsh_players WHERE id = %d", $player_id ), ARRAY_A ) : null;
        if ( ! $pl ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'Player not found.' ], 404 ); }
        $other = $wpdb->get_row( $wpdb->prepare( "SELECT id, name FROM {$wpdb->prefix}grsh_teams WHERE captain_player_id = %d AND season_id = %d AND id <> %d LIMIT 1", $player_id, $season['id'], $team_id ), ARRAY_A );
        if ( $other ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'That player already captains "' . $other['name'] . '". A captain can only be on one team.' ], 409 ); }
        $wpdb->update( "{$wpdb->prefix}grsh_teams", [ 'captain_player_id' => $player_id ], [ 'id' => $team_id ] );
        $name = trim( $pl['first_name'] . ' ' . $pl['last_name'] );
        self::audit( 'captain_sync_captain', $team_id, [ 'captain_player_id' => $team['captain_player_id'] ], [ 'captain_player_id' => $player_id ], 'Captain of "' . $team['name'] . '" set to ' . $name );
        $acct = self::account_state( $pl['wp_user_id'] );
        return new WP_REST_Response( [ 'success' => true, 'message' => $name . ' is now captain of "' . $team['name'] . '".' . ( $acct === 'none' ? ' They have no login yet, so send an invite.' : ( $acct === 'pending' ? ' They have not set a password yet.' : '' ) ) ], 200 );
    }

    public static function rest_players( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $q = trim( (string) $request->get_param( 'q' ) );
        if ( strlen( $q ) < 2 ) { return new WP_REST_Response( [ 'players' => [] ], 200 ); }
        $where = []; $args = [];
        foreach ( array_slice( preg_split( '/\s+/', $q ), 0, 3 ) as $tok ) {
            $like = '%' . ( method_exists( $wpdb, 'esc_like' ) ? $wpdb->esc_like( $tok ) : addcslashes( $tok, '_%\\' ) ) . '%';
            $where[] = '(first_name LIKE %s OR last_name LIKE %s OR email LIKE %s)'; array_push( $args, $like, $like, $like );
        }
        $rows = $wpdb->get_results( $wpdb->prepare( "SELECT id, first_name, last_name, email, wp_user_id FROM {$wpdb->prefix}grsh_players WHERE " . implode( ' AND ', $where ) . ' ORDER BY last_name, first_name LIMIT 8', $args ), ARRAY_A ) ?: [];
        $out = [];
        foreach ( $rows as $r ) { $out[] = [ 'id' => (int) $r['id'], 'name' => trim( $r['first_name'] . ' ' . $r['last_name'] ), 'email' => (string) $r['email'], 'account' => self::account_state( $r['wp_user_id'] ) ]; }
        return new WP_REST_Response( [ 'players' => $out ], 200 );
    }

    public static function rest_nudge( WP_REST_Request $request ): WP_REST_Response {
        $b   = (array) $request->get_json_params();
        $dry = ! empty( $b['dry_run'] );
        $ids = array_values( array_unique( array_filter( array_map( 'intval', (array) ( $b['team_ids'] ?? [] ) ) ) ) );
        if ( ! $dry && empty( $b['confirm'] ) ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'Confirmation is required before emailing anyone.' ], 400 ); }
        if ( ! $ids || count( $ids ) > self::MAX_BATCH ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'Choose between 1 and ' . self::MAX_BATCH . ' teams.' ], 400 ); }
        $ov = self::build_overview();
        if ( ! $ov['season']['exists'] ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'The season in Settings does not exist.' ], 409 ); }
        $by = []; foreach ( $ov['teams'] as $t ) { $by[ $t['id'] ] = $t; }
        $money = $ov['money']; $year = $ov['season']['year']; $min = $ov['min_players']; $url = self::login_url();
        $headers = class_exists( 'GRSH_Settings' ) && method_exists( 'GRSH_Settings', 'mail_headers' ) ? (array) GRSH_Settings::mail_headers() : [];
        $now = strtotime( (string) current_time( 'mysql' ) ) ?: time();
        $results = []; $sent = 0;
        foreach ( $ids as $id ) {
            $t = $by[ $id ] ?? null;
            $r = [ 'team_id' => $id, 'name' => $t['name'] ?? '', 'to' => '', 'status' => 'skipped', 'message' => '' ];
            if ( ! $t )                                               { $r['message'] = 'Not found in this season.'; }
            elseif ( ! $t['captain'] || ! is_email( $t['captain']['email'] ) ) { $r['message'] = 'No valid captain email on file.'; }
            elseif ( in_array( $t['stage'], [ 'deposit', 'paid' ], true ) )     { $r['message'] = 'Already past the deposit step.'; }
            elseif ( $t['looks_test'] )                               { $r['message'] = 'Looks like test data, so it is not emailed.'; }
            elseif ( $t['last_nudged_at'] && ( $now - strtotime( $t['last_nudged_at'] ) ) < self::NUDGE_COOLDOWN_DAYS * 86400 ) {
                $d = (int) floor( ( $now - strtotime( $t['last_nudged_at'] ) ) / 86400 );
                $r['message'] = 'Nudged ' . ( $d === 0 ? 'today' : $d . ' day' . ( $d === 1 ? '' : 's' ) . ' ago' ) . '. Wait ' . self::NUDGE_COOLDOWN_DAYS . ' days between reminders.';
            } else {
                $first = trim( strtok( $t['captain']['name'], ' ' ) ) ?: 'Captain';
                $team  = $t['name'];
                if ( $t['stage'] === 'invited' )    { $line = 'Your team "' . $team . '" is set up for the ' . $year . " Gold Rush Senior Hockey tournament, but we have not seen you sign in yet.\n\nSign in to start your roster: " . $url; }
                elseif ( $t['stage'] === 'active' ) { $line = 'You are signed in, but "' . $team . '" has no players on its roster yet. We need at least ' . $min . " players.\n\nAdd them here: " . $url; }
                else {
                    $line = '"' . $team . '" has ' . $t['roster_size'] . ' of ' . $min . ' players on the roster. The next step is the team deposit' . ( $money['deposit'] > 0 ? ' of $' . number_format( $money['deposit'], 2 ) : '' ) . '.';
                    if ( $money['tier_now'] === 'early' && $money['days_left'] !== null && $money['saves_per_team'] > 0 ) { $line .= ' Paying by ' . $money['cutoff'] . ' keeps the early fee ($' . number_format( $money['early'], 2 ) . ' instead of $' . number_format( $money['late'], 2 ) . ').'; }
                    $line .= "\n\nSign in: " . $url;
                }
                $r['to'] = $t['captain']['email']; $r['subject'] = 'Your ' . $year . ' Gold Rush team: next step'; $r['body'] = 'Hi ' . $first . ",\n\n" . $line . "\n\nThanks,\nGold Rush Senior Hockey";
                if ( $dry ) { $r['status'] = 'ready'; $r['message'] = 'Ready to send.'; }
                elseif ( wp_mail( $r['to'], $r['subject'], $r['body'], $headers ) ) {
                    $r['status'] = 'sent'; $r['message'] = 'Sent.'; $sent++;
                    self::audit( 'captain_sync_nudge', $id, null, [ 'to' => $r['to'], 'stage' => $t['stage'] ], 'Reminder emailed to the captain of "' . $team . '"' );
                } else { $r['status'] = 'failed'; $r['message'] = 'WordPress could not send the email. Check WP Mail SMTP.'; }
            }
            if ( ! $dry ) { unset( $r['body'] ); }
            $results[] = $r;
        }
        return new WP_REST_Response( [ 'success' => true, 'dry_run' => $dry, 'sent' => $sent, 'results' => $results ], 200 );
    }

    // -------------------------------------------------------------------------
    // REST: remove a team with things attached, revoke invite, detach captain, notes, detail, digest
    // -------------------------------------------------------------------------

    private static function find_team( int $id ): ?array {
        foreach ( self::build_overview()['teams'] as $t ) { if ( $t['id'] === $id ) { return $t; } }
        return null;
    }

    /** What removing a team would take and keep. Pure reading. */
    public static function removal_impact( array $t ): array {
        $removes = [ 'the team record' ]; $keeps = [ 'captain login accounts', 'player records', 'WPForms entries' ]; $blocked = []; $needs_ack = false;
        if ( (int) $t['roster_size'] > 0 ) { $removes[] = (int) $t['roster_size'] . ' roster row' . ( (int) $t['roster_size'] === 1 ? '' : 's' ) . ' (the players themselves are kept)'; $needs_ack = true; }
        if ( $t['payment_status'] !== 'unpaid' || ! empty( $t['deposit_paid_at'] ) || (float) ( $t['deposit_amount'] ?? 0 ) > 0 ) { $removes[] = 'the recorded payment (' . ( $t['payment_status'] ?: 'deposit' ) . ')'; $needs_ack = true; }
        if ( (int) ( $t['history_rows'] ?? 0 ) > 0 ) { $blocked[] = 'player history points at this team (' . (int) $t['history_rows'] . ' rows), so removing it would orphan them'; }
        if ( (int) $t['entries'] > 0 ) { $keeps[] = 'the deposit form entry (it stays in WPForms; it will show as unmatched)'; }
        if ( ( $t['account'] ?? '' ) === 'pending' ) { $keeps[] = 'the captain\'s pending invite link (revoke it separately)'; }
        return [ 'removes' => $removes, 'keeps' => $keeps, 'blocked' => $blocked, 'needs_ack' => $needs_ack, 'allowed' => ! $blocked ];
    }

    public static function rest_remove_team( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $b = (array) $request->get_json_params();
        $id = (int) ( $b['team_id'] ?? 0 );
        if ( ! self::season()['exists'] ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'The season in Settings does not exist, so nothing can be changed.' ], 409 ); }
        $t = $id ? self::find_team( $id ) : null;
        if ( ! $t ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'Team not found in this season.' ], 404 ); }
        $imp = self::removal_impact( $t );
        if ( ! empty( $b['dry_run'] ) ) { return new WP_REST_Response( [ 'success' => true, 'dry_run' => true, 'team' => [ 'id' => $t['id'], 'name' => $t['name'] ], 'impact' => $imp ], 200 ); }
        if ( ! $imp['allowed'] ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'Kept: ' . implode( ' and ', $imp['blocked'] ) . '.', 'impact' => $imp ], 409 ); }
        $reason = trim( (string) ( $b['reason'] ?? '' ) );
        if ( strlen( $reason ) < 3 ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'Give a short reason. It goes in the history.' ], 400 ); }
        if ( strtolower( trim( (string) ( $b['confirm_name'] ?? '' ) ) ) !== strtolower( trim( $t['name'] ) ) ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'Type the team name exactly to confirm. Nothing was removed.' ], 400 ); }
        if ( $imp['needs_ack'] && empty( $b['acknowledge'] ) ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'This team has players or a recorded payment. Tick the box to confirm you understand. Nothing was removed.' ], 400 ); }
        $row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}grsh_teams WHERE id = %d AND team_type = 'full_team'", $id ), ARRAY_A );
        if ( ! $row ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'Not found.' ], 404 ); }
        $rosters = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}grsh_rosters WHERE team_id = %d", $id ), ARRAY_A ) ?: [];
        $snap = $row; $snap['_rosters'] = $rosters; $snap['_forced'] = true;
        if ( $rosters ) { $wpdb->delete( "{$wpdb->prefix}grsh_rosters", [ 'team_id' => $id ] ); }
        $ok = $wpdb->delete( "{$wpdb->prefix}grsh_teams", [ 'id' => $id ] );
        if ( ! $ok ) {
            foreach ( $rosters as $rr ) { $wpdb->insert( "{$wpdb->prefix}grsh_rosters", $rr ); }   // put them back: all or nothing
            return new WP_REST_Response( [ 'success' => false, 'message' => 'The database refused: ' . ( $wpdb->last_error ?: 'unknown reason' ) . '. Nothing was removed.' ], 500 );
        }
        self::audit( 'captain_sync_team_deleted', $id, $snap, null, 'Removed team "' . $t['name'] . '" (' . $reason . ')' . ( $rosters ? ', with ' . count( $rosters ) . ' roster rows' : '' ) );
        self::clear_pending_cache();
        return new WP_REST_Response( [ 'success' => true, 'message' => 'Removed "' . $t['name'] . '". You can restore it from History. Captain accounts and player records were not touched.', 'impact' => $imp ], 200 );
    }

    /** Clear a captain's unused invite link. Returns true when a link was actually cleared. */
    private static function clear_invite( int $user_id ): bool {
        global $wpdb;
        if ( ! $user_id || self::account_state( $user_id ) !== 'pending' ) { return false; }
        $tbl = isset( $wpdb->users ) && $wpdb->users ? $wpdb->users : $wpdb->prefix . 'users';
        $wpdb->update( $tbl, [ 'user_activation_key' => '' ], [ 'ID' => $user_id ] );
        if ( function_exists( 'clean_user_cache' ) ) { clean_user_cache( $user_id ); }
        return true;
    }

    public static function rest_revoke_invite( WP_REST_Request $request ): WP_REST_Response {
        $b = (array) $request->get_json_params();
        $t = self::find_team( (int) ( $b['team_id'] ?? 0 ) );
        if ( ! $t ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'Team not found in this season.' ], 404 ); }
        $reason = trim( (string) ( $b['reason'] ?? '' ) );
        if ( strlen( $reason ) < 3 ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'Give a short reason. It goes in the history.' ], 400 ); }
        if ( ! $t['captain'] || $t['account'] !== 'pending' ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'There is no unused invite on this team. The captain has either signed in already or never had a login.' ], 409 ); }
        global $wpdb;
        $uid = (int) $wpdb->get_var( $wpdb->prepare( "SELECT wp_user_id FROM {$wpdb->prefix}grsh_players WHERE id = %d", $t['captain']['player_id'] ) );
        if ( ! self::clear_invite( $uid ) ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'The invite could not be found.' ], 409 ); }
        self::audit( 'captain_sync_invite_revoked', $t['id'], [ 'user_id' => $uid, 'captain' => $t['captain']['email'] ], null, 'Invite link revoked for "' . $t['name'] . '" (' . $reason . ')' );
        self::clear_pending_cache();
        return new WP_REST_Response( [ 'success' => true, 'message' => 'The invite link no longer works. To invite them again, use Invite Captain; that makes a new link.' ], 200 );
    }

    public static function rest_detach_captain( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $b = (array) $request->get_json_params();
        $t = self::find_team( (int) ( $b['team_id'] ?? 0 ) );
        if ( ! $t ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'Team not found in this season.' ], 404 ); }
        if ( ! $t['captain'] ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'This team has no captain to detach.' ], 409 ); }
        $reason = trim( (string) ( $b['reason'] ?? '' ) );
        if ( strlen( $reason ) < 3 ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'Give a short reason. It goes in the history.' ], 400 ); }
        $pid = (int) $t['captain']['player_id'];
        $revoked = false;
        if ( ! empty( $b['revoke_invite'] ) ) {
            $uid = (int) $wpdb->get_var( $wpdb->prepare( "SELECT wp_user_id FROM {$wpdb->prefix}grsh_players WHERE id = %d", $pid ) );
            $revoked = self::clear_invite( $uid );
        }
        $wpdb->update( "{$wpdb->prefix}grsh_teams", [ 'captain_player_id' => null ], [ 'id' => $t['id'] ] );
        self::audit( 'captain_sync_captain_detached', $t['id'], [ 'captain_player_id' => $pid, 'captain' => $t['captain']['name'], 'invite_revoked' => $revoked ], null, 'Captain ' . $t['captain']['name'] . ' detached from "' . $t['name'] . '" (' . $reason . ')' . ( $revoked ? ', invite revoked' : '' ) );
        self::clear_pending_cache();
        return new WP_REST_Response( [ 'success' => true, 'message' => $t['captain']['name'] . ' is no longer captain of "' . $t['name'] . '". Their account and player record are untouched.' . ( $revoked ? ' Their invite link was revoked and cannot be restored by Undo.' : '' ) ], 200 );
    }

    public static function rest_reattach_captain( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $id = (int) ( ( (array) $request->get_json_params() )['audit_id'] ?? 0 );
        $row = $id ? $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}grsh_audit_logs WHERE id = %d AND action = 'captain_sync_captain_detached'", $id ), ARRAY_A ) : null;
        if ( ! $row ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'That change was not found.' ], 404 ); }
        $item = null; foreach ( self::history() as $h ) { if ( $h['id'] === $id ) { $item = $h; break; } }
        if ( ! $item || $item['undone'] || ! $item['can_reattach'] ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'This cannot be undone any more (the team has a captain again, the captain is on another team, or the team is gone).' ], 409 ); }
        $b = json_decode( (string) $row['before_value'], true );
        $wpdb->update( "{$wpdb->prefix}grsh_teams", [ 'captain_player_id' => (int) $b['captain_player_id'] ], [ 'id' => (int) $row['object_id'] ] );
        self::audit( 'captain_sync_captain_reattached', (int) $row['object_id'], null, [ 'restored' => $id, 'captain_player_id' => (int) $b['captain_player_id'] ], 'Captain put back after detach' );
        self::clear_pending_cache();
        return new WP_REST_Response( [ 'success' => true, 'message' => 'The captain is back on the team.' . ( ! empty( $b['invite_revoked'] ) ? ' Their invite link stays revoked; send a new one from Invite Captain.' : '' ) ], 200 );
    }

    public static function rest_note( WP_REST_Request $request ): WP_REST_Response {
        $b = (array) $request->get_json_params();
        $id = (int) ( $b['team_id'] ?? 0 );
        if ( ! $id || ! self::team_exists( $id ) ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'Team not found.' ], 404 ); }
        $text = trim( (string) ( $b['note'] ?? '' ) );
        if ( strlen( $text ) > 500 ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'Keep the note to 500 characters.' ], 400 ); }
        $tag = (string) ( $b['tag'] ?? '' );
        if ( ! in_array( $tag, self::NOTE_TAGS, true ) ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'Unknown tag.' ], 400 ); }
        $fu = trim( (string) ( $b['follow_up'] ?? '' ) );
        if ( $fu !== '' && ( ! preg_match( '/^(\d{4})-(\d{2})-(\d{2})$/', $fu, $m ) || ! checkdate( (int) $m[2], (int) $m[3], (int) $m[1] ) ) ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'The follow-up date is not a real date.' ], 400 ); }
        $all = self::notes();
        if ( $text === '' && $tag === '' && $fu === '' ) { unset( $all[ $id ] ); }
        else { $all[ $id ] = [ 'note' => sanitize_textarea_field( $text ), 'tag' => $tag, 'follow_up' => $fu, 'by' => wp_get_current_user()->display_name ?: 'unknown', 'at' => (string) current_time( 'mysql' ) ]; }
        update_option( self::NOTES_OPT, $all, false );
        return new WP_REST_Response( [ 'success' => true, 'note' => $all[ $id ] ?? null, 'message' => isset( $all[ $id ] ) ? 'Note saved.' : 'Note cleared.' ], 200 );
    }

    public static function rest_team_detail( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $id = (int) $request->get_param( 'team_id' );
        $t = $id ? self::find_team( $id ) : null;
        if ( ! $t ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'Team not found in this season.' ], 404 ); }
        $rows = $wpdb->get_results( $wpdb->prepare( "SELECT id, user_display, action, notes, created_at FROM {$wpdb->prefix}grsh_audit_logs WHERE object_type = 'team' AND object_id = %d ORDER BY id DESC LIMIT 30", $id ), ARRAY_A ) ?: [];
        $timeline = [];
        foreach ( $rows as $r ) { $timeline[] = [ 'at' => (string) $r['created_at'], 'by' => (string) $r['user_display'], 'action' => (string) $r['action'], 'notes' => (string) $r['notes'] ]; }
        $players = $wpdb->get_results( $wpdb->prepare( "SELECT p.first_name, p.last_name FROM {$wpdb->prefix}grsh_rosters ro JOIN {$wpdb->prefix}grsh_players p ON p.id = ro.player_id WHERE ro.team_id = %d ORDER BY p.last_name, p.first_name LIMIT 60", $id ), ARRAY_A ) ?: [];
        $ledger = [];
        if ( ! empty( $t['deposit_paid_at'] ) ) { $ledger[] = [ 'label' => 'Deposit' . ( $t['fee_tier'] ? ' (' . $t['fee_tier'] . ' fee)' : '' ), 'amount' => (float) ( $t['deposit_amount'] ?? 0 ), 'date' => (string) $t['deposit_paid_at'], 'state' => 'paid' ]; }
        if ( $t['fee_total'] !== null ) { $ledger[] = [ 'label' => 'Team fee total', 'amount' => (float) $t['fee_total'], 'date' => '', 'state' => 'plan' ]; }
        if ( $t['balance_due'] !== null && $t['payment_status'] !== 'paid_in_full' ) { $ledger[] = [ 'label' => 'Balance still due', 'amount' => (float) $t['balance_due'], 'date' => (string) ( self::settings()['team_balance_due_date'] ?? '' ), 'state' => 'due' ]; }
        if ( $t['payment_status'] === 'paid_in_full' ) { $ledger[] = [ 'label' => 'Paid in full', 'amount' => (float) ( $t['fee_total'] ?? 0 ), 'date' => '', 'state' => 'paid' ]; }
        return new WP_REST_Response( [ 'success' => true, 'timeline' => $timeline, 'players' => array_map( function ( $p ) { return trim( $p['first_name'] . ' ' . $p['last_name'] ); }, $players ), 'ledger' => $ledger, 'impact' => self::removal_impact( $t ) ], 200 );
    }

    /** Plain-text list of what needs the secretary. Pure: takes the overview, returns text. */
    public static function digest_text( array $ov ): string {
        $lines = [];
        if ( ! empty( $ov['pending'] ) ) { $lines[] = $ov['pending'] . ' deposit' . ( $ov['pending'] === 1 ? '' : 's' ) . ' paid on the form but not on the team.'; }
        $bad = 0; $warn = 0; foreach ( (array) ( $ov['issues'] ?? [] ) as $i ) { if ( ( $i['level'] ?? '' ) === 'bad' ) { $bad++; } elseif ( ( $i['level'] ?? '' ) === 'warn' ) { $warn++; } }
        if ( $bad || $warn ) { $lines[] = $bad . ' problem' . ( $bad === 1 ? '' : 's' ) . ' to fix and ' . $warn . ' to look at on the Problems tab.'; }
        $idle = 0; $due = [];
        foreach ( (array) ( $ov['teams'] ?? [] ) as $t ) {
            if ( isset( $t['idle_days'] ) && $t['idle_days'] !== null && $t['idle_days'] >= self::IDLE_DAYS ) { $idle++; }
            if ( ! empty( $t['note']['follow_up'] ) && $t['note']['follow_up'] <= substr( (string) ( $ov['generated_at'] ?? '' ), 0, 10 ) ) { $due[] = $t['name'] . ( $t['note']['note'] ? ': ' . $t['note']['note'] : '' ); }
        }
        if ( $idle ) { $lines[] = $idle . ' team' . ( $idle === 1 ? ' has' : 's have' ) . ' had no activity for ' . self::IDLE_DAYS . ' days or more and no deposit.'; }
        foreach ( $due as $d ) { $lines[] = 'Follow-up due: ' . $d; }
        $m = $ov['money'] ?? [];
        if ( ! empty( $m['tier_now'] ) && $m['tier_now'] === 'early' && isset( $m['days_left'] ) && $m['days_left'] !== null && ! empty( $m['waiting'] ) ) { $lines[] = 'The early fee ends in ' . $m['days_left'] . ' day' . ( $m['days_left'] === 1 ? '' : 's' ) . '; ' . $m['waiting'] . ' team' . ( $m['waiting'] === 1 ? '' : 's' ) . ' still to pay.'; }
        if ( ! $lines ) { return "Nothing needs you right now. Every deposit is on its team and no team has gone quiet."; }
        return "Captain Sync: what needs you\n\n- " . implode( "\n- ", $lines );
    }

    public static function rest_digest( WP_REST_Request $request ): WP_REST_Response {
        $b = (array) $request->get_json_params();
        $text = self::digest_text( self::build_overview() );
        if ( empty( $b['send'] ) ) { return new WP_REST_Response( [ 'success' => true, 'sent' => false, 'text' => $text ], 200 ); }
        $u = wp_get_current_user();   // only ever the signed-in admin's own address
        if ( ! $u || ! is_email( $u->user_email ) ) { return new WP_REST_Response( [ 'success' => false, 'message' => 'Your WordPress account has no valid email address.' ], 409 ); }
        $headers = class_exists( 'GRSH_Settings' ) && method_exists( 'GRSH_Settings', 'mail_headers' ) ? (array) GRSH_Settings::mail_headers() : [];
        $ok = wp_mail( $u->user_email, 'Captain Sync: what needs you', $text, $headers );
        return new WP_REST_Response( [ 'success' => (bool) $ok, 'sent' => (bool) $ok, 'to' => $u->user_email, 'text' => $text, 'message' => $ok ? 'Sent to ' . $u->user_email . '.' : 'WordPress could not send the email. Check WP Mail SMTP.' ], $ok ? 200 : 500 );
    }

    // -------------------------------------------------------------------------
    // Menu badge
    // -------------------------------------------------------------------------

    private static function clear_pending_cache(): void {
        if ( function_exists( 'delete_transient' ) ) { delete_transient( self::PENDING_TRANSIENT ); }
    }

    private static function pending_count_cached(): int {
        $v = get_transient( self::PENDING_TRANSIENT );
        if ( $v !== false ) { return (int) $v; }
        $n = 0;
        try { $n = (int) self::build_overview()['pending']; } catch ( \Throwable $e ) { $n = 0; }
        set_transient( self::PENDING_TRANSIENT, $n, 300 );
        return $n;
    }
}
