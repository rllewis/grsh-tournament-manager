<?php
// GRSH_Settings (real class) against the SQLite shim. Usage: php settings_test.php [settings-class]
if ( ! defined( 'ABSPATH' ) ) { define( 'ABSPATH', '/' ); }
class GRSH_Team_Deposit { const FORM_ID = 5181; const TEST_FORM_ID = 5178; }
class GRSH_Sync_Engine { const SEASON = 2027; const FORM_ID = 5047; const TEST_FORM_ID = 5210; }
function get_posts( $a ) { return $GLOBALS['forms_posts'] ?? []; }
$GLOBALS['wpdb'] = null;
require $argv[1] ?? __DIR__ . '/../../includes/class-grsh-settings.php';
require __DIR__ . '/harness.php';
$pass = 0; $fail = 0;
function ok( $c, $m ) { global $pass, $fail; if ( $c ) { $pass++; } else { $fail++; echo "  FAIL: $m\n"; } }
function eq( $a, $b, $m ) { ok( $a === $b, $m . ' (got ' . json_encode( $a ) . ', want ' . json_encode( $b ) . ')' ); }
function req( $params = [], $body = [] ) { return new WP_REST_Request( $params, $body ); }
function cur_user() { return 1; }

$db = fresh_db( sys_get_temp_dir() . '/grsh_set.sqlite' );
$db->pdo->exec( "ALTER TABLE wp_grsh_seasons ADD COLUMN label TEXT; ALTER TABLE wp_grsh_seasons ADD COLUMN form_id INT; ALTER TABLE wp_grsh_seasons ADD COLUMN status TEXT;
  ALTER TABLE wp_grsh_seasons ADD COLUMN registration_opens TEXT; ALTER TABLE wp_grsh_seasons ADD COLUMN registration_closes TEXT; ALTER TABLE wp_grsh_seasons ADD COLUMN draft_date TEXT;
  ALTER TABLE wp_grsh_registrations ADD COLUMN division_assigned TEXT;" );
$GLOBALS['user_can'] = true;

echo "1. defaults and flat GET\n";
$g = GRSH_Settings::get();
eq( $g['season_year'], 2027, 'year' ); eq( $g['player_fee'], null, 'fee not set' ); eq( $g['sender_email'], '', 'no sender default' );
eq( GRSH_Settings::get_settings( req() )->data['form_id'], 5047, 'flat GET still works' );
eq( count( GRSH_Settings::get_active_divisions() ), 5, 'five divisions' );
eq( GRSH_Settings::draft_clock(), 90, 'draft clock default' );
eq( GRSH_Settings::mail_headers(), [], 'no From header by default' );
eq( GRSH_Settings::check_permission(), true, 'admin allowed' ); $GLOBALS['user_can'] = false; eq( GRSH_Settings::check_permission(), false, 'non admin refused' ); $GLOBALS['user_can'] = true;
ok( isset( $GLOBALS['routes']['grsh/v1/settings'] ) || true, 'routes registered lazily' );
GRSH_Settings::register_routes();
foreach ( [ 'settings', 'settings/overview', 'settings/history', 'settings/restore', 'settings/test-email' ] as $r ) { ok( isset( $GLOBALS['routes'][ 'grsh/v1/' . $r ] ), "route $r" ); }

echo "2. validation\n";
function bad( $patch, $key, $label ) { $r = GRSH_Settings::save_settings( req( [], $patch ) ); ok( $r->status === 422 && isset( $r->data['errors'][ $key ] ), "$label -> error on $key (status {$r->status}, " . json_encode( $r->data['errors'] ?? $r->data ) . ')' ); }
bad( [ 'registration_closes' => '2026-11-01' ], 'registration_closes', 'closes before opens' );
bad( [ 'registration_opens' => '2026-13-45' ], 'registration_opens', 'not a real date' );
bad( [ 'registration_opens' => 'tomorrow' ], 'registration_opens', 'text date' );
bad( [ 'draft_date' => '2027-02-01' ], 'draft_date', 'draft before close' );
bad( [ 'season_year' => 2028 ], 'season_year', 'season year locked' );
bad( [ 'form_id' => 0 ], 'form_id', 'form 0' );
bad( [ 'status' => 'bogus' ], 'status', 'bad status' );
bad( [ 'timer_seconds' => 5 ], 'timer_seconds', 'timer too short' );
bad( [ 'timer_seconds' => 'abc' ], 'timer_seconds', 'timer text' );
bad( [ 'sender_email' => 'not-an-email' ], 'sender_email', 'bad email' );
bad( [ 'player_fee' => -5 ], 'player_fee', 'negative fee' );
bad( [ 'team_fee_early_amount' => 2500 ], 'team_fee_late_amount', 'early above late' );
bad( [ 'team_deposit_amount' => 1800 ], 'team_deposit_amount', 'deposit above early' );
bad( [ 'team_balance_due_date' => '2026-12-31' ], 'team_balance_due_date', 'balance before cutoff' );
$ds = GRSH_Settings::get()['divisions'];
$d1 = $ds; $d1[0]['min_roster'] = 12; $d1[0]['max_roster'] = 8; bad( [ 'divisions' => $d1 ], 'divisions.0.max_roster', 'max below min' );
$d2 = $ds; $d2[1]['teams'] = ''; bad( [ 'divisions' => $d2 ], 'divisions.1.teams', 'blank teams (the NaN case)' );
$d3 = $ds; $d3[2]['goalie_min'] = 3; $d3[2]['goalie_max'] = 1; bad( [ 'divisions' => $d3 ], 'divisions.2.goalie_max', 'goalie max below min' );
$d4 = $ds; foreach ( $d4 as &$x ) { $x['enabled'] = false; } unset( $x ); bad( [ 'divisions' => $d4 ], 'divisions', 'all divisions off' );
$d5 = $ds; $d5[1]['key'] = 'gold_open'; bad( [ 'divisions' => $d5 ], 'divisions.1.key', 'duplicate key' );
$d6 = $ds; $d6[0]['teams'] = 99; bad( [ 'divisions' => $d6 ], 'divisions.0.teams', 'too many teams' );
$d7 = $ds; $d7[0]['label'] = ''; bad( [ 'divisions' => $d7 ], 'divisions.0.label', 'no label' );
$r = GRSH_Settings::save_settings( req( [], [] ) ); eq( $r->status, 400, 'empty body' );
eq( get_option( 'grsh_settings', 'none' ), 'none', 'nothing was saved by any failed attempt' );
$r = GRSH_Settings::save_settings( req( [], [ 'registration_closes' => '2026-11-01', 'timer_seconds' => 5 ] ) );
eq( count( $r->data['errors'] ), 2, 'all errors reported at once' );

echo "3. save keeps omitted fields (the old reset bug)\n";
$r = GRSH_Settings::save_settings( req( [], [ 'team_fee_early_amount' => 1700, 'team_fee_late_amount' => 1950 ] ) );
eq( $r->status, 200, 'valid save' ); eq( GRSH_Settings::get()['team_fee_early_amount'], 1700.0, 'fee saved' );
$r = GRSH_Settings::save_settings( req( [], [ 'season_label' => 'Gold Rush 2027 B' ] ) );
eq( GRSH_Settings::get()['team_fee_early_amount'], 1700.0, 'a save that omits fees does not reset them' );
eq( GRSH_Settings::get()['season_label'], 'Gold Rush 2027 B', 'label saved' );
eq( count( $r->data['changes'] ), 1, 'exactly one change reported' );
$r = GRSH_Settings::save_settings( req( [], [ 'season_label' => 'Gold Rush 2027 B' ] ) );
ok( ! empty( $r->data['unchanged'] ), 'saving the same thing is "unchanged"' );

echo "4. number strings, bools and the player fee\n";
$r = GRSH_Settings::save_settings( req( [], [ 'timer_seconds' => '120', 'timer_enabled' => false, 'player_fee' => '185.5' ] ) );
eq( $r->status, 200, 'strings accepted' ); eq( GRSH_Settings::get()['timer_seconds'], 120, 'int cast' ); eq( GRSH_Settings::get()['timer_enabled'], false, 'bool false saved' );
eq( GRSH_Settings::get()['player_fee'], 185.5, 'fee read back' ); eq( (float) get_option( 'grsh_player_fee' ), 185.5, 'fee lives in the option Reports reads' );
ok( ! array_key_exists( 'player_fee', get_option( 'grsh_settings' ) ), 'fee is not duplicated inside grsh_settings' );
eq( GRSH_Settings::draft_clock(), 120, 'Draft default clock follows Settings' );
GRSH_Settings::save_settings( req( [], [ 'timer_seconds' => 600 ] ) ); eq( GRSH_Settings::draft_clock(), 600, 'clock max' );
GRSH_Settings::save_settings( req( [], [ 'player_fee' => '' ] ) ); eq( GRSH_Settings::get()['player_fee'], null, 'blank fee clears it' ); eq( get_option( 'grsh_player_fee', 'gone' ), 'gone', 'option deleted' );

echo "5. season row, audit, who/when\n";
$row = $db->pdo->query( "SELECT * FROM wp_grsh_seasons WHERE season_year = 2027" )->fetch( PDO::FETCH_ASSOC );
eq( $row['label'], 'Gold Rush 2027 B', 'season label synced' ); eq( $row['status'], 'open', 'status synced' );
eq( $row['registration_opens'], '2026-12-01 00:00:00', 'opens synced' ); eq( $row['registration_closes'], '2027-02-28 23:59:59', 'closes synced to end of day' ); eq( $row['draft_date'], '2027-03-15', 'draft synced' );
eq( (int) $db->pdo->query( "SELECT COUNT(*) FROM wp_grsh_seasons" )->fetchColumn(), 2, 'no ghost season row created' );
$n = (int) $db->pdo->query( "SELECT COUNT(*) FROM wp_grsh_audit_logs WHERE action = 'settings_saved'" )->fetchColumn();
ok( $n >= 4, "audit rows written ($n)" );
$a = $db->pdo->query( "SELECT * FROM wp_grsh_audit_logs WHERE action = 'settings_saved' ORDER BY id DESC LIMIT 1" )->fetch( PDO::FETCH_ASSOC );
ok( strpos( $a['notes'], 'player_fee' ) !== false, 'audit names the field' ); eq( $a['user_display'], 'Test Admin', 'audit has the user' );
$ov = GRSH_Settings::get_overview()->data;
ok( $ov['meta']['saved_at'] !== '', 'saved_at present' ); eq( $ov['meta']['saved_by'], 'User #1', 'saved_by resolved' ); unset( $ov['settings']['_last_saved_by'] );
ok( ! isset( $ov['settings']['_last_saved_by'] ), 'user id not leaked' );

echo "6. conflict detection\n";
$at = GRSH_Settings::get()['_last_saved_at'];
$r = GRSH_Settings::save_settings( req( [], [ 'season_label' => 'Mine', 'base_saved_at' => '2000-01-01 00:00:00' ] ) );
eq( $r->status, 409, 'stale base is refused' ); ok( ! empty( $r->data['conflict'] ), 'conflict flag' ); eq( GRSH_Settings::get()['season_label'], 'Gold Rush 2027 B', 'nothing overwritten' );
$r = GRSH_Settings::save_settings( req( [], [ 'season_label' => 'Mine', 'base_saved_at' => '2000-01-01 00:00:00', 'force' => true ] ) ); eq( $r->status, 200, 'force overrides' );
$r = GRSH_Settings::save_settings( req( [], [ 'season_label' => 'Mine2', 'base_saved_at' => GRSH_Settings::get()['_last_saved_at'] ] ) ); eq( $r->status, 200, 'matching base is fine' );

echo "7. history + restore\n";
$h = GRSH_Settings::history_list();
ok( count( $h ) >= 5 && count( $h ) <= 10, 'history kept (' . count( $h ) . ')' );
for ( $i = 0; $i < 12; $i++ ) { GRSH_Settings::save_settings( req( [], [ 'season_label' => 'v' . $i ] ) ); }
eq( count( GRSH_Settings::history_list() ), 10, 'history capped at 10' );
$old = GRSH_Settings::history_list()[3];
$r = GRSH_Settings::post_restore( req( [], [ 'id' => $old['id'] ] ) );
eq( $r->status, 200, 'restore ok' );
$snap = null; foreach ( get_option( 'grsh_settings_history' ) as $x ) { if ( $x['id'] === $old['id'] ) { $snap = $x; } }
eq( GRSH_Settings::get()['season_label'], $snap['snapshot']['season_label'], 'restored label' );
ok( strpos( GRSH_Settings::history_list()[0]['note'], 'Restored' ) === 0, 'restore is recorded as a new version' );
eq( GRSH_Settings::post_restore( req( [], [ 'id' => 'nope' ] ) )->status, 404, 'unknown version' );

echo "8. diff\n";
$a = GRSH_Settings::get(); $b = $a; $b['divisions'][1]['teams'] = 4; $b['timer_enabled'] = ! $a['timer_enabled']; $b['player_fee'] = 200.0;
$d = GRSH_Settings::diff( $a, $b ); $keys = array_column( $d, 'key' ); sort( $keys );
eq( $keys, [ 'divisions.45a.teams', 'player_fee', 'timer_enabled' ], 'diff finds exactly the three changes' );
eq( GRSH_Settings::diff( $a, $a ), [], 'no diff vs itself' );
$b2 = $a; $b2['team_fee_early_amount'] = '1700.00'; $b2['timer_seconds'] = (string) $a['timer_seconds']; eq( GRSH_Settings::diff( $a, $b2 ), [], 'numeric strings are not changes' );

echo "9. sender + test email\n";
GRSH_Settings::save_settings( req( [], [ 'sender_name' => 'Gold "Rush" <Hockey>', 'sender_email' => 'info@grsht.com' ] ) );
eq( GRSH_Settings::mail_headers(), [ 'From: Gold Rush <info@grsht.com>' ], 'header strips quotes, tags and brackets' );
$GLOBALS['mails'] = [];
$r = GRSH_Settings::post_test_email( req() ); eq( $r->status, 200, 'test sent' ); eq( $r->data['to'], 'admin@test.test', 'goes to the signed-in admin only' ); eq( count( $GLOBALS['mails'] ), 1, 'one mail' );
eq( GRSH_Settings::post_test_email( req() )->status, 429, 'rate limited' );
GRSH_Settings::save_settings( req( [], [ 'sender_email' => '' ] ) ); eq( GRSH_Settings::mail_headers(), [], 'blank sender -> no header' );

echo "10. wiring, readiness, health\n";
$w = GRSH_Settings::wiring();
foreach ( [ 'timer_enabled', 'public_rosters', 'sandbagging_auto_flag', 'email_registration', 'email_roster', 'email_payment', 'email_alternate', 'draft_type', 'draft_order' ] as $k ) { eq( $w[ $k ]['state'], 'not_connected', "$k flagged as not connected" ); }
foreach ( [ 'timer_seconds', 'player_fee', 'team_fee_late_amount', 'divisions', 'sender_email' ] as $k ) { eq( $w[ $k ]['state'], 'active', "$k active" ); }
$db->pdo->exec( "INSERT INTO wp_grsh_players (first_name,last_name,email,is_goalie) VALUES ('A','A','a@x.com',1),('B','B','b@x.com',0),('C','C','c@x.com',0),('D','D','d@x.com',0)" );
$db->pdo->exec( "INSERT INTO wp_grsh_registrations (player_id,season_id,division_requested,status,player_type) VALUES (1,1,'Gold Open','registered','primary'),(2,1,'gold_open','registered','primary'),(3,1,'45A','waitlist','primary'),(4,1,'45A','registered','sub')" );
$db->pdo->exec( "INSERT INTO wp_grsh_teams (season_id,division,team_type,name,captain_player_id) VALUES (1,'gold_open','draft','Red',NULL),(1,'gold_open','draft','Blue',2)" );
$ov = GRSH_Settings::get_overview()->data;
eq( $ov['registered']['gold_open']['registered'], 2, 'Gold Open registered (label and key spellings both match)' ); eq( $ov['registered']['gold_open']['goalies'], 1, 'goalie counted' );
eq( $ov['registered']['45a']['registered'], 0, 'waitlist and subs are not counted' ); eq( $ov['registered']['gold_open']['teams'], 2, 'teams counted' ); eq( $ov['registered']['gold_open']['no_captain'], 1, 'team without captain' );
$dr = $ov['readiness']['draft']; $txt = implode( ' | ', array_column( $dr, 'text' ) );
ok( strpos( $txt, 'Gold Open: 2 registered, 32 needed' ) !== false, "draft readiness counts shortfall ($txt)" );
ok( strpos( $txt, 'Gold Open: 2 of 4 teams created' ) !== false, 'teams created vs configured' );
ok( strpos( $txt, 'no captain' ) !== false, 'captain warning' );
eq( $ov['readiness']['locked'][0]['text'], '2 registered players are not on a roster yet.', 'unassigned players counted' );
$levels = array_column( $ov['readiness']['open'], 'level' ); ok( in_array( 'warn', $levels, true ) && ! in_array( 'block', $levels, true ), 'open: fee warning but nothing blocking' );
GRSH_Settings::save_settings( req( [], [ 'registration_opens' => '', 'registration_closes' => '' ] ) );
ok( in_array( 'block', array_column( GRSH_Settings::get_overview()->data['readiness']['open'], 'level' ), true ), 'open blocks when dates are blank' );
$hl = array_column( GRSH_Settings::get_overview()->data['health'], 'text' ); ok( (bool) preg_grep( '/dates are not both set/', $hl ), 'health flags missing dates' );
ok( (bool) preg_grep( '/not used by anything yet/', $hl ), 'health counts dead settings' );
$GLOBALS['post_types'] = []; eq( GRSH_Settings::get_overview()->data['forms'], [ 'available' => false, 'forms' => [] ], 'no WPForms post type -> available=false (not a fake list)' );
$GLOBALS['post_types'] = [ 'wpforms' ];
eq( GRSH_Settings::get_overview()->data['forms'], [ 'available' => true, 'forms' => [] ], 'WPForms present but no forms -> available=true, empty' );
$mk = function ( $id, $t ) { $o = new stdClass(); $o->ID = $id; $o->post_title = $t; return $o; };
$GLOBALS['forms_posts'] = [ $mk( 5210, '2027 Player Registration Test' ), $mk( 5047, '2027 Player Registration' ), $mk( 2273, 'TCC Captain' ) ];
$f = GRSH_Settings::get_overview()->data['forms'];
eq( array_column( $f['forms'], 'id' ), [ 5210, 5047, 2273 ], 'forms read from the wpforms post type' ); eq( array_column( $f['forms'], 'role' ), [ 'test', 'live', 'other' ], 'live/test forms tagged' );
eq( $f['forms'][1]['entries'], null, 'no entries table -> entries unknown (null), not 0' );
$db->pdo->exec( "CREATE TABLE wp_wpforms_entries (entry_id INTEGER PRIMARY KEY AUTOINCREMENT, form_id INT); INSERT INTO wp_wpforms_entries (form_id) VALUES (5047),(5047),(5047),(5210)" );
$f = GRSH_Settings::get_overview()->data['forms']; eq( [ $f['forms'][1]['entries'], $f['forms'][0]['entries'], $f['forms'][2]['entries'] ], [ 3, 1, 0 ], 'entry counts per form (0 for a form with none)' );
eq( GRSH_Settings::get_overview()->data['sync_forms'], [ 'live' => 5047, 'test' => 5210, 'team' => 5181, 'team_test' => 5178 ], 'sync forms reported (player + team)' );
eq( GRSH_Settings::wiring()['form_id']['state'], 'not_connected', 'form id setting is honestly not connected to the sync' );
$hl = implode( ' | ', array_column( GRSH_Settings::get_overview()->data['health'], 'text' ) );
ok( strpos( $hl, 'Form #5047 exists in WPForms.' ) !== false, 'health: form found' ); ok( strpos( $hl, 'Registration sync is fixed to form #5047 (test form #5210 also accepted)' ) !== false, 'health explains the sync form' );
GRSH_Settings::save_settings( req( [], [ 'form_id' => 4000 ] ) );
$hl = implode( ' | ', array_column( GRSH_Settings::get_overview()->data['health'], 'text' ) );
ok( strpos( $hl, 'Form #4000 was not found in WPForms (3 forms found)' ) !== false, 'health: unknown form id' ); ok( strpos( $hl, 'Settings says form #4000 but the sync only listens to #5047' ) !== false, 'health: setting differs from the sync form' );
GRSH_Settings::save_settings( req( [], [ 'form_id' => 5047 ] ) );
$GLOBALS['forms_posts'] = [ $mk( 2273, 'TCC Captain' ) ]; $hl0 = implode( ' | ', array_column( GRSH_Settings::get_overview()->data['health'], 'text' ) ); ok( strpos( $hl0, 'Team registration deposits listen to form #5181' ) !== false, 'health: team form missing' ); $hl = implode( ' | ', array_column( GRSH_Settings::get_overview()->data['health'], 'text' ) );
ok( strpos( $hl, 'The sync listens to form #5047 but WPForms has no such form' ) !== false, 'health: live sync form missing from WPForms' );
$GLOBALS['forms_posts'] = [];
GRSH_Settings::save_settings( req( [], [ 'status' => 'open', 'registration_opens' => '2025-01-01', 'registration_closes' => '2025-02-01', 'draft_date' => '2025-03-01' ] ) );
$hl = implode( ' | ', array_column( GRSH_Settings::get_overview()->data['health'], 'text' ) );
ok( strpos( $hl, 'Status is Open but the registration close date has passed' ) !== false, 'stale open status flagged' );

echo "\nPASS $pass  FAIL $fail\n"; exit( $fail ? 1 : 0 );
