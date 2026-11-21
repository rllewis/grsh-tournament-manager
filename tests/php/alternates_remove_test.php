<?php
// GRSH_Alternates: remove from sub pool (impact, guards, snapshot, restore, tombstone) on the SQLite shim.
require __DIR__ . '/harness.php';
require __DIR__ . '/../../includes/class-grsh-alternates.php';
$pass = 0; $fail = 0;
function ok( $c, $m ) { global $pass, $fail; if ( $c ) { $pass++; } else { $fail++; echo "  FAIL: $m\n"; } }
function eq( $a, $b, $m ) { ok( $a === $b, $m . ' (got ' . json_encode( $a ) . ', want ' . json_encode( $b ) . ')' ); }

$db = fresh_db( sys_get_temp_dir() . '/grsh_alt.sqlite' );
$db->pdo->exec( "
DROP TABLE wp_grsh_players; DROP TABLE wp_grsh_registrations; DROP TABLE wp_grsh_audit_logs;
CREATE TABLE wp_grsh_players (id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT, last_name TEXT, email TEXT UNIQUE, phone TEXT, position TEXT, is_goalie INT DEFAULT 0,
  skill_tier_reported TEXT, is_alternate INT DEFAULT 0, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE wp_grsh_registrations (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id INT, season_id INT, wpforms_entry_id INT, player_type TEXT DEFAULT 'primary',
  status TEXT DEFAULT 'approved', payment_status TEXT DEFAULT 'waived', UNIQUE (player_id, season_id));
CREATE TABLE wp_grsh_availability (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id INT, season_id INT, registration_id INT, available_days TEXT, times_activated INT DEFAULT 0, UNIQUE (player_id, season_id));
CREATE TABLE wp_grsh_sub_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id INT, season_id INT, status TEXT DEFAULT 'pending', team TEXT);
CREATE TABLE wp_grsh_audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, season_id INT, wp_user_id INT, user_display TEXT, action TEXT, object_type TEXT, object_id INT,
  before_value TEXT, after_value TEXT, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
" );

function sub( $first, $entry = null, $type = 'sub', $extra = [] ) {
    global $db;
    $db->insert( 'wp_grsh_players', [ 'first_name' => $first, 'last_name' => 'Sub', 'email' => strtolower( $first ) . '@x.test', 'is_alternate' => $type === 'sub' ? 1 : 0 ] );
    $pid = $db->insert_id;
    $db->insert( 'wp_grsh_registrations', array_merge( [ 'player_id' => $pid, 'season_id' => 1, 'wpforms_entry_id' => $entry, 'player_type' => $type ], $extra ) );
    $rid = $db->insert_id;
    $db->insert( 'wp_grsh_availability', [ 'player_id' => $pid, 'season_id' => 1, 'registration_id' => $rid, 'available_days' => '["friday"]' ] );
    return $pid;
}
function del( $pid, $confirm = 'DELETE' ) { return GRSH_Alternates::remove_alternate( new WP_REST_Request( [ 'id' => $pid ], [ 'confirm' => $confirm ] ) ); }
function impact( $pid ) { return GRSH_Alternates::removal_impact( new WP_REST_Request( [ 'id' => $pid ] ) ); }
function n( $t, $w = '1' ) { global $db; return (int) $db->get_var( "SELECT COUNT(*) FROM $t WHERE $w" ); }

// ---- permission split -------------------------------------------------------------------------------------------------
$GLOBALS['user_can'] = false; ok( ! GRSH_Alternates::check_admin(), 'non-admin cannot remove' );
$GLOBALS['user_can'] = true;  ok( GRSH_Alternates::check_admin(), 'admin can remove' );
ok( isset( $GLOBALS['routes'] ) , 'harness ok' );
GRSH_Alternates::register_routes();
foreach ( [ '/alternates/(?P<id>\d+)/removal-impact', '/alternates/(?P<id>\d+)', '/alternates/removed', '/alternates/removed/(?P<log_id>\d+)/restore' ] as $p ) {
    ok( isset( $GLOBALS['routes'][ 'grsh/v1' . $p ] ), "route $p registered" );
}
ok( $GLOBALS['routes']['grsh/v1/alternates/(?P<id>\d+)']['permission_callback'] === [ 'GRSH_Alternates', 'check_admin' ], 'delete route is admin-only' );
ok( $GLOBALS['routes']['grsh/v1/alternates/(?P<id>\d+)/activate']['permission_callback'] === [ 'GRSH_Alternates', 'check_permission' ], 'activate still open to committee' );

// ---- 1. clean sub: everything goes, player deleted, tombstone written ----------------------------------------------------------
$a = sub( 'Ann', 9001 );
$i = impact( $a )->data;
eq( [ $i['can_remove'], $i['delete_player'], $i['mode'] ], [ true, true, 'remove_registration' ], 'clean sub: removable, player goes too' );
eq( del( $a, 'nope' )->status, 400, 'wrong confirmation refused' ); eq( n( 'wp_grsh_players' ), 1, 'nothing removed without DELETE' );
$r = del( $a ); eq( $r->status, 200, 'removed' ); ok( $r->data['player_deleted'], 'player record deleted' );
eq( [ n( 'wp_grsh_players' ), n( 'wp_grsh_registrations' ), n( 'wp_grsh_availability' ) ], [ 0, 0, 0 ], 'all three rows gone' );
eq( n( 'wp_grsh_audit_logs', "action='alternate_removed_tombstone' AND object_id=9001" ), 1, 'form entry remembered' );
eq( del( $a )->status, 404, 'removing twice is a clean 404' );
$list = GRSH_Alternates::list_removed( new WP_REST_Request() )->data; eq( count( $list ), 1, 'shows in Recently removed' ); eq( $list[0]['name'], 'Ann Sub', 'with the name' );

// ---- 2. restore puts back the same ids ----------------------------------------------------------------------------------------------
$rs = GRSH_Alternates::restore_alternate( new WP_REST_Request( [ 'log_id' => $r->data['log_id'] ] ) );
eq( $rs->status, 200, 'restored' ); eq( [ n( 'wp_grsh_players', "id=$a" ), n( 'wp_grsh_registrations', "player_id=$a AND wpforms_entry_id=9001" ), n( 'wp_grsh_availability', "player_id=$a AND available_days='[\"friday\"]'" ) ], [ 1, 1, 1 ], 'player, registration, availability are back with the same ids' );
eq( n( 'wp_grsh_audit_logs', "action='alternate_removed_tombstone'" ), 0, 'tombstone lifted so the entry can sync again' );
eq( count( GRSH_Alternates::list_removed( new WP_REST_Request() )->data ), 0, 'gone from Recently removed' );
eq( GRSH_Alternates::restore_alternate( new WP_REST_Request( [ 'log_id' => $r->data['log_id'] ] ) )->status, 409, 'cannot restore twice' );
eq( GRSH_Alternates::restore_alternate( new WP_REST_Request( [ 'log_id' => 99999 ] ) )->status, 404, 'unknown removal is 404' );

// ---- 3. on a roster this season: blocked, nothing touched ------------------------------------------------------------------------------
$db->insert( 'wp_grsh_teams', [ 'season_id' => 1, 'division' => 'gold_open', 'name' => 'Team Gold' ] ); $team = $db->insert_id;
$db->insert( 'wp_grsh_rosters', [ 'season_id' => 1, 'team_id' => $team, 'player_id' => $a, 'registration_id' => 1 ] );
$i = impact( $a )->data; ok( ! $i['can_remove'] && strpos( $i['blockers'][0], 'Team Gold' ) !== false, 'blocker names the team' );
$r = del( $a ); eq( $r->status, 409, 'delete refused while rostered' ); eq( n( 'wp_grsh_registrations', "player_id=$a" ), 1, 'registration untouched' );
$db->query( "DELETE FROM wp_grsh_rosters" );

// ---- 4. has history elsewhere: pool entry goes, player kept -----------------------------------------------------------------------------
$db->insert( 'wp_grsh_player_history', [ 'player_id' => $a, 'season_id' => 2 ] );
$i = impact( $a )->data; ok( ! $i['delete_player'] && in_array( 'has player history', $i['keep_reasons'], true ), 'history keeps the person' );
$r = del( $a ); eq( $r->status, 200, 'removed from pool' ); ok( ! $r->data['player_deleted'], 'player record kept' );
eq( [ n( 'wp_grsh_players', "id=$a AND is_alternate=0" ), n( 'wp_grsh_registrations', "player_id=$a" ), n( 'wp_grsh_availability', "player_id=$a" ) ], [ 1, 0, 0 ], 'flag cleared, registration + availability gone' );
GRSH_Alternates::restore_alternate( new WP_REST_Request( [ 'log_id' => $r->data['log_id'] ] ) );
eq( [ n( 'wp_grsh_players', "id=$a AND is_alternate=1" ), n( 'wp_grsh_registrations', "player_id=$a" ) ], [ 1, 1 ], 'restore sets the sub flag back and re-adds the registration' );
$db->query( "DELETE FROM wp_grsh_player_history" );

// ---- 5. activations in the log keep the person (Activation log needs the name) ----------------------------------------------------------
$db->insert( 'wp_grsh_audit_logs', [ 'season_id' => 1, 'wp_user_id' => $a, 'action' => 'alternate_activated', 'object_type' => 'registration', 'object_id' => $a, 'after_value' => '{}' ] );
$i = impact( $a )->data; ok( ! $i['delete_player'] && $i['activations_this_season'] === 1, 'activated sub is kept as a record' );
$r = del( $a ); ok( ! $r->data['player_deleted'], 'activated sub: record kept' ); eq( n( 'wp_grsh_audit_logs', "action='alternate_activated'" ), 1, 'activation history untouched' );
GRSH_Alternates::restore_alternate( new WP_REST_Request( [ 'log_id' => $r->data['log_id'] ] ) );

// ---- 6. pending e-mail requests are cleaned, and restored ---------------------------------------------------------------------------------
$db->insert( 'wp_grsh_sub_requests', [ 'player_id' => $a, 'season_id' => 1, 'status' => 'pending', 'team' => 'T' ] );
$db->insert( 'wp_grsh_sub_requests', [ 'player_id' => $a, 'season_id' => 1, 'status' => 'yes', 'team' => 'T' ] );
$i = impact( $a )->data; eq( [ $i['requests_total'], $i['requests_pending'] ], [ 2, 1 ], 'impact counts requests' );
$r = del( $a ); eq( n( 'wp_grsh_sub_requests', "player_id=$a" ), 0, 'requests removed' );
GRSH_Alternates::restore_alternate( new WP_REST_Request( [ 'log_id' => $r->data['log_id'] ] ) ); eq( n( 'wp_grsh_sub_requests', "player_id=$a" ), 2, 'requests restored' );

// ---- 7. regular player flagged as alternate: registration is NOT deleted ----------------------------------------------------------------------
$p = sub( 'Pat', 9100, 'primary' ); $db->update( 'wp_grsh_players', [ 'is_alternate' => 1 ], [ 'id' => $p ] );
$i = impact( $p )->data; eq( [ $i['mode'], $i['delete_player'] ], [ 'unflag', false ], 'regular player: only the sub flag goes' );
$r = del( $p ); eq( [ n( 'wp_grsh_registrations', "player_id=$p" ), n( 'wp_grsh_players', "id=$p AND is_alternate=0" ), n( 'wp_grsh_availability', "player_id=$p" ) ], [ 1, 1, 0 ], 'registration kept, flag off, availability gone' );

// ---- 8. paid warning; unknown player ---------------------------------------------------------------------------------------------------------------
$q = sub( 'Quin', 9200, 'sub', [ 'payment_status' => 'paid' ] ); ok( count( impact( $q )->data['warnings'] ) === 1, 'paid registration warns' );
eq( impact( 424242 )->status, 404, 'impact for a missing player is 404' );

// ---- 9. restore conflicts ------------------------------------------------------------------------------------------------------------------------
$z = sub( 'Zed', 9300 ); $r = del( $z );   // clean: player row deleted
$db->insert( 'wp_grsh_players', [ 'first_name' => 'Other', 'last_name' => 'Zed', 'email' => 'zed@x.test' ] );
$rs = GRSH_Alternates::restore_alternate( new WP_REST_Request( [ 'log_id' => $r->data['log_id'] ] ) );
eq( $rs->status, 409, 'restore refused when the e-mail now belongs to someone else' ); ok( strpos( $rs->data['error'], 'same e-mail' ) !== false, 'says why' );

// ---- 10. sync engine tombstone ------------------------------------------------------------------------------------------------------------------------
$src = file_get_contents( __DIR__ . '/../../includes/class-grsh-sync-engine.php' );
ok( strpos( $src, "alternate_removed_tombstone" ) !== false, 'sync engine checks the tombstone' );
$w = sub( 'Wes', 9400 ); del( $w );
if ( ! class_exists( 'GRSH_Sync_Engine_Probe' ) ) {
    // run the real method without loading the whole engine's dependencies
    preg_match( '/private function entry_already_imported\(.*?\n    }\n/s', $src, $m );
    eval( 'class GRSH_Sync_Engine_Probe { public ' . substr( $m[0], strlen( 'private ' ) ) . ' }' );
}
$probe = new GRSH_Sync_Engine_Probe();
ok( $probe->entry_already_imported( 9400 ), 'removed sub entry counts as already imported' );
ok( ! $probe->entry_already_imported( 9999 ), 'unrelated entry still imports' );
$db->insert( 'wp_grsh_players', [ 'first_name' => 'Nu', 'last_name' => 'Sub', 'email' => 'nu@x.test' ] ); $db->insert( 'wp_grsh_registrations', [ 'player_id' => $db->insert_id, 'season_id' => 1, 'wpforms_entry_id' => 9500 ] );
ok( $probe->entry_already_imported( 9500 ), 'normal already-imported check still works' );

echo "\nalternates_remove: $pass passed, $fail failed\n"; exit( $fail ? 1 : 0 );
