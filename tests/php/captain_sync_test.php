<?php
// GRSH_Captain_Sync + GRSH_Team_Deposit::record_deposit against the SQLite shim.
// Usage: php captain_sync_test.php [sync-class] [deposit-class]
if ( ! defined( 'ABSPATH' ) ) { define( 'ABSPATH', '/' ); }
class GRSH_Settings {
    static $s = [ 'season_year' => 2027, 'team_deposit_amount' => 500.0, 'team_fee_early_amount' => 1750.0, 'team_fee_late_amount' => 2000.0,
                  'team_fee_early_cutoff_date' => '2027-01-06', 'team_balance_due_date' => '2027-03-08' ];
    static function get() { return self::$s; }
    static function mail_headers() { return []; }
    static function get_active_divisions() { return [ [ 'key' => 'gold_open', 'label' => 'Gold Open', 'teams' => 3 ], [ 'key' => '45a', 'label' => '45A', 'teams' => 2 ] ]; }
}
class GRSH_Scoring { const FULL_TEAM_MIN_PLAYERS = 11; }
$GLOBALS['users'] = [];
function get_userdata( $id ) { return $GLOBALS['users'][ $id ] ?? false; }
function get_date_from_gmt( $d, $f ) { return $d; }   // test site is on UTC
function is_user_logged_in() { return true; }
function apply_filters( $t, $v ) { return $v; }
$GLOBALS['submenu'] = [];
function add_submenu_page( ...$a ) { $GLOBALS['submenu'][] = $a; }
function __( $s, $d = '' ) { return $s; }
require __DIR__ . '/harness.php';
require $argv[2] ?? __DIR__ . '/../../includes/class-grsh-team-deposit.php';
require $argv[1] ?? __DIR__ . '/../../includes/class-grsh-captain-sync.php';

$pass = 0; $fail = 0;
function ok( $c, $m ) { global $pass, $fail; if ( $c ) { $pass++; } else { $fail++; echo "  FAIL: $m\n"; } }
function eq( $a, $b, $m ) { ok( $a === $b, $m . ' (got ' . json_encode( $a ) . ', want ' . json_encode( $b ) . ')' ); }
function req( $json ) { return new WP_REST_Request( [], $json ); }
function team( $id ) { global $db; return $db->get_row( "SELECT * FROM wp_grsh_teams WHERE id = $id" ); }
function ov() { return GRSH_Captain_Sync::build_overview(); }
function entry_state( $ov, $id ) { foreach ( $ov['entries'] as $e ) { if ( $e['entry_id'] === $id ) { return $e['state']; } } return null; }
function has_issue( $ov, $key, $field = null, $val = null ) { foreach ( $ov['issues'] as $i ) { if ( $i['key'] === $key && ( $field === null || ( $i[ $field ] ?? null ) === $val ) ) { return true; } } return false; }

$SCHEMA = "
DROP TABLE IF EXISTS wp_grsh_player_history; DROP TABLE IF EXISTS wp_wpforms_entries; DROP TABLE wp_grsh_teams; DROP TABLE wp_grsh_players; DROP TABLE wp_grsh_audit_logs;
CREATE TABLE wp_grsh_players (id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT, last_name TEXT, email TEXT, phone TEXT, wp_user_id INT);
CREATE TABLE wp_grsh_teams (id INTEGER PRIMARY KEY AUTOINCREMENT, season_id INT, division TEXT, team_type TEXT DEFAULT 'draft', name TEXT, colour TEXT, captain_player_id INT,
  draft_order INT, draft_locked INT DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP, fee_total REAL, fee_tier TEXT, deposit_amount REAL, deposit_paid_at TEXT, balance_due REAL, balance_paid_at TEXT, payment_status TEXT DEFAULT 'unpaid');
CREATE TABLE wp_grsh_audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, season_id INT, wp_user_id INT, user_display TEXT, action TEXT, object_type TEXT, object_id INT,
  before_value TEXT, after_value TEXT, notes TEXT, ip_address TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE wp_wpforms_entries (entry_id INTEGER PRIMARY KEY AUTOINCREMENT, form_id INT, user_id INT, status TEXT DEFAULT '', date TEXT);
CREATE TABLE wp_grsh_player_history (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id INT, season_id INT, team_id INT);
";
$db = fresh_db( sys_get_temp_dir() . '/grsh_cs.sqlite' );
$db->pdo->exec( $SCHEMA );
foreach ( [ 5181 => '2027 Team Registration Form', 5178 => '2027 Team Registration Form | TEST', 2273 => 'Team Captain Registration' ] as $id => $t ) {
    $db->insert( 'wp_posts', [ 'ID' => $id, 'post_type' => 'wpforms', 'post_status' => 'publish', 'post_title' => $t ] );
}
function mk_player( $first, $user, $email = null ) { global $db; $db->insert( 'wp_grsh_players', [ 'first_name' => $first, 'last_name' => 'Cap', 'email' => $email ?? strtolower( $first ) . '@x.test', 'wp_user_id' => $user ] ); return $db->insert_id; }
function mk_team( $name, $div, $cap, $season = 1, $extra = [] ) { global $db; $db->insert( 'wp_grsh_teams', array_merge( [ 'season_id' => $season, 'division' => $div, 'team_type' => 'full_team', 'name' => $name, 'captain_player_id' => $cap ], $extra ) ); return $db->insert_id; }
function mk_entry( $form, $user, $date, $status = '' ) { global $db; $db->insert( 'wp_wpforms_entries', [ 'form_id' => $form, 'user_id' => $user, 'date' => $date, 'status' => $status ] ); return $db->insert_id; }
function mk_roster( $team, $n ) { global $db; for ( $i = 0; $i < $n; $i++ ) { $db->insert( 'wp_grsh_rosters', [ 'season_id' => 1, 'team_id' => $team, 'player_id' => 1000 + $team * 100 + $i, 'registration_id' => 1 ] ); } }

$GLOBALS['users'][11] = (object) [ 'user_activation_key' => '' ];
$GLOBALS['users'][12] = (object) [ 'user_activation_key' => 'abc' ];
$GLOBALS['users'][14] = (object) [ 'user_activation_key' => '' ];
$GLOBALS['users'][16] = (object) [ 'user_activation_key' => '' ];
$pA = mk_player( 'Ann', 11 ); $pB = mk_player( 'Bo', 12 ); $pC = mk_player( 'Cy', null ); $pD = mk_player( 'Di', 14 ); $pE = mk_player( 'Ed', 15 ); $pF = mk_player( 'Flo', 16 );
$tA = mk_team( 'Team Ann', 'gold_open', $pA ); mk_roster( $tA, 12 );
$tB = mk_team( 'Team Bo', '45a', $pB, 1, [ 'deposit_paid_at' => '2027-01-02 09:00:00', 'fee_total' => 1750, 'fee_tier' => 'early', 'deposit_amount' => 500, 'balance_due' => 1250, 'payment_status' => 'deposit_paid' ] );
$tC = mk_team( 'Team Cy', 'gold_open', $pC );
$tD = mk_team( 'Team Di', '', $pD );                                  // blank division: what the old TCC sync left behind
$tF = mk_team( 'Team Flo', 'gold_open', $pF );
mk_team( 'Team Ann', 'gold_open', mk_player( 'Gus', null ) );          // duplicate name in same division
mk_team( 'Old Season Team', 'gold_open', mk_player( 'Hal', 18 ), 2 );  // other season: not listed
$e1 = mk_entry( 5181, 11, '2027-01-05 10:00:00' );   // Ann, before the cutoff -> early
$e2 = mk_entry( 5181, 11, '2027-01-07 10:00:00' );   // Ann again -> duplicate
$e3 = mk_entry( 5181, 12, '2027-01-02 09:00:00' );   // Bo, already recorded
$e4 = mk_entry( 5181, 99, '2027-01-03 09:00:00' );   // unknown user
$e5 = mk_entry( 5181, 0,  '2027-01-03 09:00:00' );   // no login
$e6 = mk_entry( 5178, 14, '2027-01-03 09:00:00' );   // test form
$e7 = mk_entry( 5181, 15, '2027-01-03 09:00:00' );   // Ed has no team
$e8 = mk_entry( 5181, 16, '2027-02-01 09:00:00' );   // Flo, after cutoff -> late
$e9 = mk_entry( 5181, 11, '2027-01-04 09:00:00', 'spam' );
$t0 = mk_entry( 2273, 11, '2027-01-04 09:00:00' ); $t1 = mk_entry( 2273, 12, '2027-01-04 09:00:00' );
$teams_before = (int) $db->get_var( "SELECT COUNT(*) FROM wp_grsh_teams" );

echo "1. the old TCC sync is gone\n";
ok( ! method_exists( 'GRSH_Captain_Sync', 'on_form_submit' ), 'no form-submit hook any more' );
ok( ! method_exists( 'GRSH_Captain_Sync', 'run_backfill' ), 'no backfill any more' );
$o = ov();
eq( $o['tcc']['synced'], false, 'TCC reported as not synced' ); eq( $o['tcc']['entries'], 2, 'TCC entries are only counted' );
eq( (int) $db->get_var( "SELECT COUNT(*) FROM wp_grsh_teams" ), $teams_before, 'nothing was created from form 2273 entries' );

echo "2. overview reads, never writes\n";
$snap = json_encode( $db->get_results( "SELECT * FROM wp_grsh_teams" ) ) . json_encode( $db->get_results( "SELECT * FROM wp_grsh_audit_logs" ) );
$o = ov();
eq( json_encode( $db->get_results( "SELECT * FROM wp_grsh_teams" ) ) . json_encode( $db->get_results( "SELECT * FROM wp_grsh_audit_logs" ) ), $snap, 'overview changed nothing' );
eq( $o['season'], [ 'id' => 1, 'year' => 2027, 'exists' => true ], 'season' );
eq( count( $o['teams'] ), 6, 'six teams this season, other season excluded' );
eq( entry_state( $o, $e1 ), 'needs_recording', 'first entry for an unpaid team needs recording' );
eq( entry_state( $o, $e2 ), 'duplicate', 'second entry for the same team is a duplicate' );
eq( entry_state( $o, $e3 ), 'recorded', 'paid team entry is recorded' );
eq( entry_state( $o, $e4 ), 'no_player', 'unknown user' ); eq( entry_state( $o, $e5 ), 'no_user', 'no login' );
eq( entry_state( $o, $e6 ), 'test', 'test form' ); eq( entry_state( $o, $e7 ), 'no_team', 'player without a team' );
eq( entry_state( $o, $e8 ), 'needs_recording', 'Flo needs recording' ); eq( entry_state( $o, $e9 ), null, 'spam entry excluded' );
eq( $o['pending'], 2, 'two deposits pending' );
$w = null; foreach ( $o['entries'] as $e ) { if ( $e['entry_id'] === $e1 ) { $w = $e['would']; } }
eq( [ $w['fee_tier'], $w['fee_total'], $w['balance_due'], $w['payment_status'] ], [ 'early', 1750.0, 1250.0, 'deposit_paid' ], 'preview uses the entry date (early)' );
$w8 = null; foreach ( $o['entries'] as $e ) { if ( $e['entry_id'] === $e8 ) { $w8 = $e['would']; } }
eq( [ $w8['fee_tier'], $w8['fee_total'] ], [ 'late', 2000.0 ], 'preview late tier after cutoff' );
eq( $o['funnel'], [ 'teams' => 6, 'logged_in' => 3, 'roster' => 1, 'deposit' => 1, 'paid' => 0 ], 'funnel counts' );
$st = []; foreach ( $o['teams'] as $t ) { $st[ $t['name'] . $t['id'] ] = $t['stage']; }
eq( $st[ 'Team Ann' . $tA ], 'roster', 'Ann has a roster' ); eq( $st[ 'Team Bo' . $tB ], 'deposit', 'Bo paid a deposit' ); eq( $st[ 'Team Cy' . $tC ], 'invited', 'Cy never logged in' );

echo "3. problems found\n";
ok( has_issue( $o, 'team_division', 'team_id', $tD ), 'blank division flagged with a fix' );
ok( has_issue( $o, 'captain_account', 'team_id', $tC ), 'captain with no account' );
ok( has_issue( $o, 'captain_password', 'team_id', $tB ), 'captain who has not set a password' );
ok( has_issue( $o, 'duplicate_team' ), 'duplicate team name' );
ok( has_issue( $o, 'needs_recording', 'entry_id', $e1 ), 'unrecorded deposit flagged' );
ok( has_issue( $o, 'entry_no_team', 'entry_id', $e7 ), 'entry with no team flagged' );
ok( ! has_issue( $o, 'entry_no_team', 'entry_id', $e6 ), 'test entry is not a problem' );

echo "4. recording a deposit\n";
$r = GRSH_Captain_Sync::rest_record( req( [ 'entry_ids' => [ $e1 ] ] ) ); eq( $r->status, 400, 'refused without confirm' );
$r = GRSH_Captain_Sync::rest_record( req( [ 'entry_ids' => [], 'confirm' => true ] ) ); eq( $r->status, 400, 'refused with nothing selected' );
$r = GRSH_Captain_Sync::rest_record( req( [ 'entry_ids' => range( 1, 26 ), 'confirm' => true ] ) ); eq( $r->status, 400, 'refused over the batch limit' );
$r = GRSH_Captain_Sync::rest_record( req( [ 'entry_ids' => [ $e6, $e3, $e2, $e4, 999 ], 'confirm' => true ] ) );
eq( array_map( fn( $x ) => $x['status'], $r->data['results'] ), [ 'skipped', 'skipped', 'skipped', 'skipped', 'skipped' ], 'test, recorded, duplicate, unmatched and unknown entries are skipped' );
eq( (int) $db->get_var( "SELECT COUNT(*) FROM wp_grsh_audit_logs" ), 0, 'skips write no audit rows' );
$GLOBALS['mails'] = [];
$r = GRSH_Captain_Sync::rest_record( req( [ 'entry_ids' => [ $e1 ], 'confirm' => true ] ) );
eq( $r->data['recorded'], 1, 'one recorded' );
$t = team( $tA );
eq( [ $t['fee_tier'], (float) $t['fee_total'], (float) $t['balance_due'], $t['payment_status'], $t['deposit_paid_at'] ], [ 'early', 1750.0, 1250.0, 'deposit_paid', '2027-01-05 10:00:00' ], 'early tier from the ENTRY date, not today, and the entry date is the paid date' );
eq( count( $GLOBALS['mails'] ), 0, 'no email unless asked' );
eq( (int) $db->get_var( "SELECT COUNT(*) FROM wp_grsh_audit_logs WHERE action='team_deposit_paid'" ), 1, 'the live-form audit row is written' );
eq( (int) $db->get_var( "SELECT COUNT(*) FROM wp_grsh_audit_logs WHERE action='captain_sync_deposit'" ), 1, 'and a sync audit row with undo data' );
$r2 = GRSH_Captain_Sync::rest_record( req( [ 'entry_ids' => [ $e1 ], 'confirm' => true ] ) );
eq( $r2->data['recorded'], 0, 'running it again records nothing' ); eq( $r2->data['results'][0]['message'], 'Already recorded.', 'and says why' );
$r3 = GRSH_Captain_Sync::rest_record( req( [ 'entry_ids' => [ $e8 ], 'confirm' => true, 'send_email' => true ] ) );
$t = team( $tF ); eq( [ $t['fee_tier'], (float) $t['fee_total'], (float) $t['balance_due'] ], [ 'late', 2000.0, 1500.0 ], 'late tier after the cutoff' );
eq( count( $GLOBALS['mails'] ), 1, 'email sent when asked' ); eq( $GLOBALS['mails'][0][0], 'flo@x.test', 'to the captain' );
eq( ov()['pending'], 0, 'nothing pending now' );
eq( entry_state( ov(), $e1 ), 'recorded', 'entry now shows as recorded' );

echo "5. undo\n";
$hist = ov()['history']; $first = null; foreach ( $hist as $h ) { if ( $h['action'] === 'captain_sync_deposit' && $h['team_id'] === $tA ) { $first = $h; } }
ok( $first && $first['can_undo'], 'latest recording can be undone' );
$db->pdo->exec( "UPDATE wp_grsh_teams SET balance_due = 900 WHERE id = $tF" );
$flo = null; foreach ( ov()['history'] as $h ) { if ( $h['team_id'] === $tF ) { $flo = $h; } }
ok( $flo && ! $flo['can_undo'], 'a team edited since is not undoable' );
eq( GRSH_Captain_Sync::rest_undo( req( [ 'audit_id' => $flo['id'] ] ) )->status, 409, 'and the server refuses' );
eq( (float) team( $tF )['balance_due'], 900.0, 'refused undo changed nothing' );
$u = GRSH_Captain_Sync::rest_undo( req( [ 'audit_id' => $first['id'] ] ) ); eq( $u->status, 200, 'undo works' );
$t = team( $tA ); eq( [ $t['fee_total'], $t['fee_tier'], $t['deposit_paid_at'], $t['balance_due'], $t['payment_status'] ], [ null, null, null, null, 'unpaid' ], 'team is back to unpaid with empty money fields' );
eq( GRSH_Captain_Sync::rest_undo( req( [ 'audit_id' => $first['id'] ] ) )->status, 409, 'undo twice is refused' );
eq( GRSH_Captain_Sync::rest_undo( req( [ 'audit_id' => 99999 ] ) )->status, 404, 'unknown change' );
eq( entry_state( ov(), $e1 ), 'needs_recording', 'the entry is pending again after undo' );
$gone = null; foreach ( ov()['history'] as $h ) { if ( $h['id'] === $first['id'] ) { $gone = $h; } } ok( $gone && $gone['undone'], 'history marks it undone' );

echo "6. season guard\n";
$db->pdo->exec( "UPDATE wp_grsh_teams SET season_id = 2 WHERE id = $tA" );
$r = GRSH_Captain_Sync::rest_record( req( [ 'entry_ids' => [ $e1 ], 'confirm' => true ] ) );
eq( team( $tA )['deposit_paid_at'], null, 'a team from another season is not written' );
$db->pdo->exec( "UPDATE wp_grsh_teams SET season_id = 1 WHERE id = $tA" );
GRSH_Settings::$s['season_year'] = 2099;
$o = ov(); eq( [ $o['season']['exists'], $o['can_write'], count( $o['teams'] ) ], [ false, false, 0 ], 'missing season is reported, not replaced by season 1' );
eq( $o['health'][0]['ok'], false, 'health says so' );
$r = GRSH_Captain_Sync::rest_record( req( [ 'entry_ids' => [ $e1 ], 'confirm' => true ] ) ); eq( $r->status, 409, 'and nothing is recorded' );
GRSH_Settings::$s['season_year'] = 2027;

echo "7. fixing a division\n";
eq( GRSH_Captain_Sync::rest_team_division( req( [ 'team_id' => $tD, 'division' => '40_plus' ] ) )->status, 400, 'a Tahoe division is refused' );
eq( GRSH_Captain_Sync::rest_team_division( req( [ 'team_id' => 9999, 'division' => 'womens' ] ) )->status, 404, 'unknown team' );
$db->insert( 'wp_grsh_teams', [ 'season_id' => 1, 'division' => 'gold_open', 'team_type' => 'draft', 'name' => 'Draft team' ] ); $dt = $db->insert_id;
eq( GRSH_Captain_Sync::rest_team_division( req( [ 'team_id' => $dt, 'division' => 'womens' ] ) )->status, 404, 'draft teams are not touched here' );
eq( GRSH_Captain_Sync::rest_team_division( req( [ 'team_id' => $tD, 'division' => 'womens' ] ) )->status, 200, 'valid division saved' );
eq( team( $tD )['division'], 'womens', 'stored' );
ok( ! has_issue( ov(), 'team_division' ), 'the problem is gone' );
eq( (int) $db->get_var( "SELECT COUNT(*) FROM wp_grsh_audit_logs WHERE action='captain_sync_division'" ), 1, 'audited' );

echo "8. wiring and edge cases\n";
GRSH_Captain_Sync::register_routes();
foreach ( [ 'overview', 'record', 'undo', 'team-division' ] as $r ) { ok( isset( $GLOBALS['routes'][ 'grsh/v1/captain-sync/' . $r ] ), "route $r registered" ); }
$GLOBALS['user_can'] = false; ok( ! ( $GLOBALS['routes']['grsh/v1/captain-sync/record']['permission_callback'] )(), 'admins only' ); $GLOBALS['user_can'] = true;
ok( ! isset( $GLOBALS['routes']['grsh/v1/admin/captain-sync/run'] ), 'old backfill route is gone' );
$GLOBALS['submenu'] = []; $db->pdo->exec( "DELETE FROM wp_options" );
GRSH_Captain_Sync::register_admin_page();
ok( strpos( $GLOBALS['submenu'][0][2], 'awaiting-mod' ) !== false, 'menu badge shows pending deposits' ); eq( $GLOBALS['submenu'][0][5], 'grsh_render_app_shell', 'renders the React shell' );
$db->pdo->exec( "DROP TABLE wp_wpforms_entries" );
$o = ov(); eq( $o['entries'], [], 'no entries table: no crash' ); $h = []; foreach ( $o['health'] as $x ) { $h[ $x['key'] ] = $x['ok']; } eq( $h['entries'], false, 'and health explains it' );
$db->pdo->exec( "CREATE TABLE wp_wpforms_entries (entry_id INTEGER PRIMARY KEY AUTOINCREMENT, form_id INT)" ); $db->pdo->exec( "INSERT INTO wp_wpforms_entries (form_id) VALUES (5181)" );
$o = ov(); eq( count( $o['entries'] ), 1, 'entries table without user_id/status/date columns still reads' ); eq( $o['entries'][0]['state'], 'no_user', 'and cannot be matched' );


// ------------------------------------------------------------------------------------------------
// Part B: clean-up, captain assignment, nudges, money, division balance. Fresh database.
// ------------------------------------------------------------------------------------------------
$db = fresh_db( sys_get_temp_dir() . '/grsh_cs_b.sqlite' ); $db->pdo->exec( $SCHEMA );
foreach ( [ 5181 => 'Team form', 5178 => 'Team form TEST', 2273 => 'TCC' ] as $id => $t ) { $db->insert( 'wp_posts', [ 'ID' => $id, 'post_type' => 'wpforms', 'post_status' => 'publish', 'post_title' => $t ] ); }
$GLOBALS['users'] = [ 41 => (object) [ 'user_activation_key' => '' ], 42 => (object) [ 'user_activation_key' => '' ], 43 => (object) [ 'user_activation_key' => 'k' ], 44 => (object) [ 'user_activation_key' => '' ], 45 => (object) [ 'user_activation_key' => '' ], 46 => (object) [ 'user_activation_key' => '' ] ];
$GLOBALS['mails'] = [];
$pa = mk_player( 'Al', 41 ); $pb = mk_player( 'Bea', 42 ); $pc = mk_player( 'Test', null, 'lorenzo+tc@x.test' ); $pe = mk_player( 'Eve', 43, 'eve+x@x.test' ); $pf = mk_player( 'Fay', 44 ); $ph = mk_player( 'Hal', 45 ); $pz = mk_player( 'Zed', 46 );
$a = mk_team( 'Real A', 'gold_open', $pa ); mk_roster( $a, 12 );
$b = mk_team( 'Paid B', '45a', $pb, 1, [ 'deposit_paid_at' => '2027-01-02 09:00:00', 'fee_total' => 1750, 'fee_tier' => 'early', 'deposit_amount' => 500, 'balance_due' => 1250, 'payment_status' => 'deposit_paid' ] );
$c = mk_team( 'Test Captain Squad', 'gold_open', $pc );
$d = mk_team( 'Skatetown', 'gold_open', null );
$e = mk_team( 'Alias Team', '45a', $pe );
$f = mk_team( 'Entry Team', 'gold_open', $pf ); mk_entry( 5181, 44, '2027-01-03 09:00:00' );
$g = mk_team( 'History Team', '45a', null ); $db->insert( 'wp_grsh_player_history', [ 'player_id' => 1, 'season_id' => 1, 'team_id' => $g ] );
$h = mk_team( 'Boom', 'gold_open', $ph ); $i = mk_team( 'boom', '45a', null );
$old = mk_team( 'Old Season Team', 'gold_open', null, 2 );
$players_before = (int) $db->get_var( 'SELECT COUNT(*) FROM wp_grsh_players' );
function trow( $o, $id ) { foreach ( $o['teams'] as $t ) { if ( $t['id'] === $id ) { return $t; } } return null; }

echo "9. test-data hints and what may be deleted\n";
$o = ov();
eq( trow( $o, $c )['test_flags'], [ 'test_name', 'alias_email' ], 'a "Test" name is flagged, and so is its + alias email' ); eq( trow( $o, $e )['test_flags'], [ 'alias_email' ], 'a + alias email is flagged' );
eq( trow( $o, $a )['looks_test'], false, 'a real team is not flagged' ); eq( trow( $o, $d )['looks_test'], false, 'an empty team with no captain is not called test data' );
eq( trow( $o, $c )['delete']['allowed'], true, 'empty test team can be deleted' ); eq( trow( $o, $d )['delete']['allowed'], true, 'empty team without a captain can be deleted' );
eq( trow( $o, $a )['delete'], [ 'allowed' => false, 'reasons' => [ 'it has 12 players on the roster' ] ], 'a team with players is protected, with a plain reason' );
eq( trow( $o, $b )['delete']['reasons'], [ 'a payment is recorded on it' ], 'a team with a payment is protected' );
eq( trow( $o, $f )['delete']['reasons'], [ 'a deposit form entry belongs to its captain' ], 'a team whose captain has a deposit entry is protected' );
eq( trow( $o, $g )['delete']['reasons'], [ 'player history points at it' ], 'a team with history rows is protected' );
ok( has_issue( $o, 'test_data' ), 'summary issue points at the clean-up' ); ok( has_issue( $o, 'name_across_divisions' ), 'same name in two divisions is flagged' );
ok( trow( $o, $c )['age_days'] === 0, 'age in days is reported' ); eq( trow( $o, $c )['last_nudged_at'], null, 'never nudged' );

echo "10. permanent delete\n";
$snap_t = (int) $db->get_var( 'SELECT COUNT(*) FROM wp_grsh_teams' );
eq( GRSH_Captain_Sync::rest_delete_teams( req( [ 'team_ids' => [ $c ] ] ) )->status, 400, 'refused without typing DELETE' );
eq( GRSH_Captain_Sync::rest_delete_teams( req( [ 'team_ids' => [ $c ], 'confirm' => 'yes' ] ) )->status, 400, 'refused with the wrong word' );
eq( GRSH_Captain_Sync::rest_delete_teams( req( [ 'team_ids' => [], 'confirm' => 'DELETE' ] ) )->status, 400, 'refused with nothing chosen' );
eq( GRSH_Captain_Sync::rest_delete_teams( req( [ 'team_ids' => range( 1, 51 ), 'confirm' => 'DELETE' ] ) )->status, 400, 'refused over the limit' );
eq( (int) $db->get_var( 'SELECT COUNT(*) FROM wp_grsh_teams' ), $snap_t, 'refusals deleted nothing' );
$r = GRSH_Captain_Sync::rest_delete_teams( req( [ 'team_ids' => [ $c, $d, $e, $a, $b, $f, $g, 9999, $old ], 'confirm' => 'DELETE' ] ) );
eq( array_map( fn( $x ) => $x['status'], $r->data['results'] ), [ 'deleted', 'deleted', 'deleted', 'skipped', 'skipped', 'skipped', 'skipped', 'skipped', 'skipped' ], 'only empty teams are deleted' );
eq( $r->data['deleted'], 3, 'three deleted' );
eq( (int) $db->get_var( 'SELECT COUNT(*) FROM wp_grsh_teams' ), $snap_t - 3, 'exactly three rows gone' );
foreach ( [ $a, $b, $f, $g, $old, $h, $i ] as $keep ) { ok( team( $keep ) !== null, "team $keep still exists" ); }
foreach ( [ $c, $d, $e ] as $gone ) { eq( team( $gone ), null, "team $gone is gone" ); }
eq( (int) $db->get_var( 'SELECT COUNT(*) FROM wp_grsh_players' ), $players_before, 'player records are untouched' );
eq( $r->data['results'][3]['message'], 'Kept: it has 12 players on the roster.', 'the skip says why' );
eq( (int) $db->get_var( "SELECT COUNT(*) FROM wp_grsh_audit_logs WHERE action='captain_sync_team_deleted'" ), 3, 'each deletion is audited' );
$snap = json_decode( $db->get_var( "SELECT before_value FROM wp_grsh_audit_logs WHERE action='captain_sync_team_deleted' AND object_id = $c" ), true ); eq( $snap['name'], 'Test Captain Squad', 'the audit row keeps a snapshot of the team' );
$o = ov(); eq( count( $o['teams'] ), 6, 'overview no longer lists them' ); ok( ! has_issue( $o, 'test_data' ) && ! has_issue( $o, 'team_captain', 'team_id', $d ), 'their problems are gone too' );
GRSH_Captain_Sync::register_routes();
foreach ( [ 'delete-teams', 'restore-team', 'team-captain', 'players', 'nudge' ] as $rt ) { ok( isset( $GLOBALS['routes'][ 'grsh/v1/captain-sync/' . $rt ] ), "route $rt registered" ); $GLOBALS['user_can'] = false; ok( ! ( $GLOBALS['routes'][ 'grsh/v1/captain-sync/' . $rt ]['permission_callback'] )(), "$rt is admin only" ); $GLOBALS['user_can'] = true; }

echo "11. restore\n";
$hist = ov()['history']; $hc = null; $hd = null; $he = null; foreach ( $hist as $x ) { if ( $x['action'] === 'captain_sync_team_deleted' ) { if ( $x['team_id'] === $c ) { $hc = $x; } if ( $x['team_id'] === $d ) { $hd = $x; } if ( $x['team_id'] === $e ) { $he = $x; } } }
ok( $hc && $hc['can_restore'], 'a deleted team can be restored' );
$rr = GRSH_Captain_Sync::rest_restore_team( req( [ 'audit_id' => $hc['id'] ] ) ); eq( $rr->status, 200, 'restore works' );
eq( [ team( $c )['name'], (int) team( $c )['id'] ], [ 'Test Captain Squad', $c ], 'restored with the same id and name' );
eq( GRSH_Captain_Sync::rest_restore_team( req( [ 'audit_id' => $hc['id'] ] ) )->status, 409, 'restoring twice is refused' );
eq( GRSH_Captain_Sync::rest_restore_team( req( [ 'audit_id' => 99999 ] ) )->status, 404, 'unknown deletion' );
$db->insert( 'wp_grsh_teams', [ 'id' => $e, 'season_id' => 1, 'division' => 'gold_open', 'team_type' => 'full_team', 'name' => 'Squatter' ] );
eq( GRSH_Captain_Sync::rest_restore_team( req( [ 'audit_id' => $he['id'] ] ) )->status, 409, 'cannot restore over a team that now uses the id' ); eq( team( $e )['name'], 'Squatter', 'and the other team is untouched' );
$db->pdo->exec( "DELETE FROM wp_grsh_players WHERE id = $pc" );
$db->pdo->exec( "DELETE FROM wp_grsh_teams WHERE id = $c" );
$hist = ov()['history']; foreach ( $hist as $x ) { if ( $x['id'] === $hc['id'] ) { ok( $x['undone'], 'history marks it restored' ); } }

echo "12. assigning a captain\n";
eq( GRSH_Captain_Sync::rest_team_captain( req( [ 'team_id' => $d, 'player_id' => $pz ] ) )->status, 404, 'a deleted team cannot be edited' );
$d2 = mk_team( 'No Captain FC', 'gold_open', null );
$r = GRSH_Captain_Sync::rest_team_captain( req( [ 'team_id' => $d2, 'player_id' => $pz ] ) ); eq( $r->status, 200, 'assigned' );
eq( (int) team( $d2 )['captain_player_id'], $pz, 'stored' ); ok( strpos( $r->data['message'], 'Zed Cap' ) !== false, 'message names the captain' ); ok( strpos( $r->data['message'], 'invite' ) === false, 'no invite hint for an active account' );
eq( (int) $db->get_var( "SELECT COUNT(*) FROM wp_grsh_audit_logs WHERE action='captain_sync_captain'" ), 1, 'audited' );
eq( GRSH_Captain_Sync::rest_team_captain( req( [ 'team_id' => $a, 'player_id' => $pz ] ) )->status, 409, 'a captain cannot be on two teams' ); eq( (int) team( $a )['captain_player_id'], $pa, 'and the first team is untouched' );
eq( GRSH_Captain_Sync::rest_team_captain( req( [ 'team_id' => $d2, 'player_id' => 9999 ] ) )->status, 404, 'unknown player' );
eq( GRSH_Captain_Sync::rest_team_captain( req( [ 'team_id' => $old, 'player_id' => $pz ] ) )->status, 404, 'a team from another season is not editable here' );
$pn = mk_player( 'Nia', null ); $r = GRSH_Captain_Sync::rest_team_captain( req( [ 'team_id' => $i, 'player_id' => $pn ] ) ); ok( strpos( $r->data['message'], 'send an invite' ) !== false, 'a captain with no login gets an invite hint' );
$pl = GRSH_Captain_Sync::rest_players( new WP_REST_Request( [ 'q' => 'a' ] ) ); eq( $pl->data['players'], [], 'search needs two characters' );
$pl = GRSH_Captain_Sync::rest_players( new WP_REST_Request( [ 'q' => 'Zed Cap' ] ) ); eq( array_map( fn( $x ) => $x['name'], $pl->data['players'] ), [ 'Zed Cap' ], 'name search across two words' );
eq( GRSH_Captain_Sync::rest_players( new WP_REST_Request( [ 'q' => 'nobody-here' ] ) )->data['players'], [], 'no match' );

echo "13. nudging captains\n";
$dry = GRSH_Captain_Sync::rest_nudge( req( [ 'team_ids' => [ $a, $h, $b, $f, $g, 9999 ], 'dry_run' => true ] ) );
$st = []; foreach ( $dry->data['results'] as $x ) { $st[ $x['team_id'] ] = $x; }
eq( [ $st[ $a ]['status'], $st[ $h ]['status'], $st[ $f ]['status'] ], [ 'ready', 'ready', 'ready' ], 'captains at roster/login steps are ready' );
ok( strpos( $st[ $h ]['body'], 'no players on its roster' ) !== false && $st[ $h ]['to'] === 'hal@x.test', 'logged-in captain with no roster gets the roster message' );
ok( strpos( $st[ $a ]['body'], '12 of 11 players' ) !== false && strpos( $st[ $a ]['body'], 'deposit' ) !== false, 'roster-stage captain gets the deposit message' );
eq( $st[ $b ]['message'], 'Already past the deposit step.', 'a paid team is skipped' ); eq( $st[ $g ]['message'], 'No valid captain email on file.', 'no captain, no email' ); eq( $st[ 9999 ]['status'], 'skipped', 'unknown team skipped' );
eq( count( $GLOBALS['mails'] ), 0, 'a dry run sends nothing' ); eq( (int) $db->get_var( "SELECT COUNT(*) FROM wp_grsh_audit_logs WHERE action='captain_sync_nudge'" ), 0, 'and logs nothing' );
eq( GRSH_Captain_Sync::rest_nudge( req( [ 'team_ids' => [ $a ] ] ) )->status, 400, 'a real send needs confirmation' ); eq( count( $GLOBALS['mails'] ), 0, 'nothing sent without it' );
eq( GRSH_Captain_Sync::rest_nudge( req( [ 'team_ids' => range( 1, 26 ), 'confirm' => true ] ) )->status, 400, 'batch limit' );
$tt = mk_team( 'Test Duds', 'gold_open', mk_player( 'Test', null, 'dud@x.test' ) );
$r = GRSH_Captain_Sync::rest_nudge( req( [ 'team_ids' => [ $a, $h, $tt ], 'confirm' => true ] ) );
eq( $r->data['sent'], 2, 'two sent' ); eq( array_map( fn( $m ) => $m[0], $GLOBALS['mails'] ), [ 'al@x.test', 'hal@x.test' ], 'to the right captains' );
eq( array_map( fn( $x ) => $x['status'], $r->data['results'] ), [ 'sent', 'sent', 'skipped' ], 'a team that looks like test data is never emailed' );
eq( (int) $db->get_var( "SELECT COUNT(*) FROM wp_grsh_audit_logs WHERE action='captain_sync_nudge'" ), 2, 'each send is logged' );
$r = GRSH_Captain_Sync::rest_nudge( req( [ 'team_ids' => [ $a, $h ], 'confirm' => true ] ) );
eq( array_map( fn( $x ) => $x['status'], $r->data['results'] ), [ 'skipped', 'skipped' ], 'a second nudge the same day is refused' ); ok( strpos( $r->data['results'][0]['message'], 'Nudged today' ) !== false, 'and says so' ); eq( count( $GLOBALS['mails'] ), 2, 'no extra email' );
ok( trow( ov(), $a )['last_nudged_at'] !== null, 'overview shows when the captain was last nudged' );
$db->pdo->exec( "UPDATE wp_grsh_audit_logs SET created_at = datetime('now','-5 days') WHERE action='captain_sync_nudge'" );
eq( GRSH_Captain_Sync::rest_nudge( req( [ 'team_ids' => [ $a ], 'confirm' => true ] ) )->data['sent'], 1, 'after the cool-down a reminder can go again' );

echo "14. money and division balance\n";
$o = ov(); $m = $o['money']; $today = gmdate( 'Y-m-d' ); $tier = $today <= '2027-01-06' ? 'early' : 'late'; $fee = $tier === 'early' ? 1750.0 : 2000.0;
$nteams = count( $o['teams'] );
eq( [ $m['collected'], $m['outstanding'], $m['paying'], $m['waiting'] ], [ 500.0, 1250.0, 1, $nteams - 1 ], 'collected, outstanding and counts' );
eq( [ $m['tier_now'], $m['fee_now'], $m['potential_now'] ], [ $tier, $fee, round( ( $nteams - 1 ) * $fee, 2 ) ], 'the fee for teams that pay today' );
eq( $m['potential_late'], round( ( $nteams - 1 ) * 2000, 2 ), 'what the same teams would pay late' ); eq( $m['saves_per_team'], $tier === 'early' ? 250.0 : 0.0, 'early-bird saving per team' );
eq( $m['cutoff'], '2027-01-06', 'cutoff date' ); eq( $m['days_left'], $today <= '2027-01-06' ? (int) floor( ( strtotime( '2027-01-06' ) - strtotime( $today ) ) / 86400 ) : null, 'days to the cutoff, nothing after it' );
$bal = []; foreach ( $o['balance']['rows'] as $x ) { $bal[ $x['key'] ] = $x; }
eq( [ $bal['gold_open']['expected'], $bal['gold_open']['actual'], $bal['gold_open']['delta'] ], [ 3, 6, 3 ], 'Gold Open count against Settings' ); eq( $bal['45a']['actual'], 3, '45A count' ); eq( $o['balance']['other'], 0, 'no teams outside the divisions' );
$db->pdo->exec( "UPDATE wp_grsh_teams SET division = '' WHERE id = $h" ); eq( ov()['balance']['other'], 1, 'a team with a bad division is counted as other' );
GRSH_Settings::$s['season_year'] = 2099; eq( GRSH_Captain_Sync::rest_delete_teams( req( [ 'team_ids' => [ $d2 ], 'confirm' => 'DELETE' ] ) )->status, 409, 'nothing is deleted when the season is missing' ); eq( GRSH_Captain_Sync::rest_team_captain( req( [ 'team_id' => $d2, 'player_id' => $pz ] ) )->status, 409, 'nor re-assigned' ); eq( GRSH_Captain_Sync::rest_nudge( req( [ 'team_ids' => [ $a ], 'dry_run' => true ] ) )->status, 409, 'nor nudged' ); GRSH_Settings::$s['season_year'] = 2027;

echo "\nPASS $pass  FAIL $fail\n"; exit( $fail ? 1 : 0 );
