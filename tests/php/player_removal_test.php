<?php
// GRSH_Player_Removal: admin-only removal of a 2027 player (impact, guards, rosters, snapshot, undo, tombstone) on the SQLite shim.
require __DIR__ . '/harness.php';
require __DIR__ . '/../../includes/class-grsh-player-removal.php';
$pass = 0; $fail = 0;
function ok( $c, $m ) { global $pass, $fail; if ( $c ) { $pass++; } else { $fail++; echo "  FAIL: $m\n"; } }
function eq( $a, $b, $m ) { ok( $a === $b, $m . ' (got ' . json_encode( $a ) . ', want ' . json_encode( $b ) . ')' ); }

$db = fresh_db( sys_get_temp_dir() . '/grsh_prem.sqlite' );
$db->pdo->exec( "
DROP TABLE wp_grsh_players; DROP TABLE wp_grsh_registrations; DROP TABLE wp_grsh_audit_logs; DROP TABLE wp_grsh_teams; DROP TABLE wp_grsh_rosters;
CREATE TABLE wp_grsh_players (id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT, last_name TEXT, email TEXT UNIQUE, position TEXT, skill_tier_reported TEXT, is_alternate INT DEFAULT 0);
CREATE TABLE wp_grsh_registrations (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id INT, season_id INT, wpforms_entry_id INT, player_type TEXT DEFAULT 'primary',
  status TEXT DEFAULT 'registered', payment_status TEXT DEFAULT 'pending', division_requested TEXT, UNIQUE (player_id, season_id));
CREATE TABLE wp_grsh_teams (id INTEGER PRIMARY KEY AUTOINCREMENT, season_id INT, division TEXT, team_type TEXT DEFAULT 'draft', name TEXT, captain_player_id INT);
CREATE TABLE wp_grsh_rosters (id INTEGER PRIMARY KEY AUTOINCREMENT, season_id INT, team_id INT, player_id INT, registration_id INT);
CREATE TABLE wp_grsh_availability (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id INT, season_id INT, registration_id INT, available_days TEXT);
CREATE TABLE wp_grsh_sub_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id INT, season_id INT, status TEXT DEFAULT 'pending');
CREATE TABLE wp_grsh_audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, season_id INT, wp_user_id INT, user_display TEXT, action TEXT, object_type TEXT, object_id INT,
  before_value TEXT, after_value TEXT, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
" );
function pl( $first, $entry = null, $extra = [] ) {
    global $db;
    $db->insert( 'wp_grsh_players', [ 'first_name' => $first, 'last_name' => 'T', 'email' => strtolower( $first ) . '@x.test' ] ); $pid = $db->insert_id;
    $db->insert( 'wp_grsh_registrations', array_merge( [ 'player_id' => $pid, 'season_id' => 1, 'wpforms_entry_id' => $entry, 'division_requested' => 'gold_open' ], $extra ) );
    return $pid;
}
function team( $div = 'gold_open', $name = 'Team A', $cap = null ) { global $db; $db->insert( 'wp_grsh_teams', [ 'season_id' => 1, 'division' => $div, 'name' => $name, 'captain_player_id' => $cap ] ); return $db->insert_id; }
function roster( $team, $pid ) { global $db; $db->insert( 'wp_grsh_rosters', [ 'season_id' => 1, 'team_id' => $team, 'player_id' => $pid ] ); }
function del( $pid, $c = 'DELETE' ) { return GRSH_Player_Removal::remove_player( new WP_REST_Request( [ 'id' => $pid ], [ 'confirm' => $c ] ) ); }
function impact( $pid ) { return GRSH_Player_Removal::removal_impact( new WP_REST_Request( [ 'id' => $pid ] ) ); }
function undo( $log ) { return GRSH_Player_Removal::restore_player( new WP_REST_Request( [ 'log_id' => $log ] ) ); }
function n( $t, $w = '1' ) { global $db; return (int) $db->get_var( "SELECT COUNT(*) FROM $t WHERE $w" ); }

echo "1. admin only, routes\n";
$GLOBALS['user_can'] = false; ok( ! GRSH_Player_Removal::check_admin(), 'committee-only user cannot remove' );
$GLOBALS['user_can'] = true;  ok( GRSH_Player_Removal::check_admin(), 'admin can' );
GRSH_Player_Removal::register_routes();
foreach ( [ '/players/removed', '/players/removed/(?P<log_id>\d+)/restore', '/players/(?P<id>\d+)/removal-impact', '/players/(?P<id>\d+)/remove' ] as $p ) {
    ok( isset( $GLOBALS['routes'][ 'grsh/v1' . $p ] ), "route $p" );
    ok( $GLOBALS['routes'][ 'grsh/v1' . $p ]['permission_callback'] === [ 'GRSH_Player_Removal', 'check_admin' ], "$p is admin-only" );
}

echo "2. the real case: two test players, assigned to a team, unpaid\n";
$a = pl( 'Max', 9001 ); $b = pl( 'Tyler', 9002 ); $t = team(); roster( $t, $a ); roster( $t, $b );
$i = impact( $a )->data;
eq( [ $i['can_remove'], $i['delete_player'], $i['roster_spots'] ], [ true, true, [ 'Team A (gold_open)' ] ], 'removable; roster spot listed; record goes too' );
eq( del( $a, 'nope' )->status, 400, 'wrong confirmation refused' ); eq( n( 'wp_grsh_players' ), 2, 'nothing removed without DELETE' );
$r = del( $a ); eq( $r->status, 200, 'removed' ); ok( $r->data['player_deleted'], 'player record deleted' );
eq( [ n( 'wp_grsh_players', "id=$a" ), n( 'wp_grsh_registrations', "player_id=$a" ), n( 'wp_grsh_rosters', "player_id=$a" ) ], [ 0, 0, 0 ], 'player, registration, roster spot gone' );
eq( [ n( 'wp_grsh_players', "id=$b" ), n( 'wp_grsh_rosters', "player_id=$b" ), n( 'wp_grsh_teams' ) ], [ 1, 1, 1 ], 'the other player and the team are untouched' );
eq( n( 'wp_grsh_audit_logs', "action='alternate_removed_tombstone' AND object_id=9001" ), 1, 'form entry remembered' );
eq( del( $a )->status, 404, 'removing twice is a clean 404' );

echo "3. undo\n";
$l = GRSH_Player_Removal::list_removed( new WP_REST_Request() )->data; eq( [ count( $l ), $l[0]['name'] ], [ 1, 'Max T' ], 'listed under Recently removed' );
$u = undo( $r->data['log_id'] ); eq( $u->status, 200, 'restored' );
eq( [ n( 'wp_grsh_players', "id=$a" ), n( 'wp_grsh_registrations', "player_id=$a AND wpforms_entry_id=9001" ), n( 'wp_grsh_rosters', "player_id=$a AND team_id=$t" ) ], [ 1, 1, 1 ], 'same ids back, roster spot too' );
eq( n( 'wp_grsh_audit_logs', "action='alternate_removed_tombstone'" ), 0, 'tombstone lifted' );
eq( [ undo( $r->data['log_id'] )->status, undo( 9999 )->status ], [ 409, 404 ], 'cannot restore twice; unknown id 404' );

echo "4. guards\n";
$c = pl( 'Cap' ); $t2 = team( 'senior_b', 'Wolves', $c ); roster( $t2, $c );
$i = impact( $c )->data; ok( ! $i['can_remove'] && strpos( $i['blockers'][0], 'Captain' ) !== false, 'captain is blocked' );
eq( del( $c )->status, 409, 'delete refused for a captain' ); eq( n( 'wp_grsh_registrations', "player_id=$c" ), 1, 'nothing touched' );
$d = pl( 'Pub' ); $t3 = team( '45a', 'Icemen' ); roster( $t3, $d ); update_option( 'grsh_roster_meta_45a', [ 'published_at' => '2026-12-01 10:00:00' ] );
$i = impact( $d )->data; ok( ! $i['can_remove'] && strpos( $i['blockers'][0], 'published' ) !== false, 'published roster blocks' ); eq( del( $d )->status, 409, 'refused' );
update_option( 'grsh_roster_meta_45a', [] ); eq( del( $d )->status, 200, 'allowed once unpublished' );

echo "5. keeps the person when other things use them\n";
$h = pl( 'Hist' ); $db->insert( 'wp_grsh_player_history', [ 'player_id' => $h, 'season_id' => 2 ] );
$i = impact( $h )->data; ok( ! $i['delete_player'] && in_array( 'has player history', $i['keep_reasons'], true ), 'history keeps the record' );
$r = del( $h ); ok( ! $r->data['player_deleted'], 'record kept' ); eq( [ n( 'wp_grsh_players', "id=$h" ), n( 'wp_grsh_registrations', "player_id=$h" ) ], [ 1, 0 ], 'person stays, 2027 registration gone' );
undo( $r->data['log_id'] ); eq( n( 'wp_grsh_registrations', "player_id=$h" ), 1, 'undo brings the registration back' );
$o = pl( 'Prev' ); $db->insert( 'wp_grsh_registrations', [ 'player_id' => $o, 'season_id' => 2 ] );
ok( ! impact( $o )->data['delete_player'], 'a 2026 registration keeps the record' );
$act = pl( 'Act' ); $db->insert( 'wp_grsh_audit_logs', [ 'season_id' => 1, 'wp_user_id' => $act, 'action' => 'alternate_activated', 'object_type' => 'x', 'object_id' => 1 ] );
ok( ! impact( $act )->data['delete_player'], 'activation history keeps the record' );

echo "6. sub requests, paid warning, nothing to remove\n";
$s = pl( 'Subby', null, [ 'payment_status' => 'paid' ] ); $db->insert( 'wp_grsh_sub_requests', [ 'player_id' => $s, 'season_id' => 1 ] );
$i = impact( $s )->data; eq( [ count( $i['warnings'] ), $i['sub_requests'] ], [ 1, 1 ], 'paid warns, request counted' );
$r = del( $s ); eq( n( 'wp_grsh_sub_requests', "player_id=$s" ), 0, 'requests removed' ); undo( $r->data['log_id'] ); eq( n( 'wp_grsh_sub_requests', "player_id=$s" ), 1, 'and restored' );
$db->insert( 'wp_grsh_players', [ 'first_name' => 'Ret', 'last_name' => 'T', 'email' => 'ret@x.test' ] ); $ret = $db->insert_id;
eq( [ impact( $ret )->data['can_remove'], del( $ret )->status ], [ false, 409 ], 'returning player with no 2027 registration: nothing to remove' );
eq( impact( 424242 )->status, 404, 'missing player 404' );

echo "7. restore conflicts\n";
$z = pl( 'Zed', 9300 ); $r = del( $z ); $db->insert( 'wp_grsh_players', [ 'first_name' => 'Other', 'last_name' => 'Zed', 'email' => 'zed@x.test' ] );
$rs = undo( $r->data['log_id'] ); eq( $rs->status, 409, 'refused when the e-mail now belongs to someone else' );
$y = pl( 'Yan' ); $ty = team( 'gold_open', 'Gone' ); roster( $ty, $y ); $r = del( $y ); $db->query( "DELETE FROM wp_grsh_teams WHERE id=$ty" );
$rs = undo( $r->data['log_id'] ); eq( $rs->status, 409, 'refused when the team no longer exists' ); eq( n( 'wp_grsh_players', "id=$y" ), 0, 'and nothing half-restored' );

echo "8. wiring\n";
$main = file_get_contents( __DIR__ . '/../../grsh-tournament-manager.php' );
ok( $main === false || strpos( $main, 'class-grsh-player-removal.php' ) !== false, 'plugin loads the class (checked when the main file is present)' );
echo "\nplayer_removal: $pass passed, $fail failed\n"; exit( $fail ? 1 : 0 );
