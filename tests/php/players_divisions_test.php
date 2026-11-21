<?php
// GET /players/divisions must give the Players page the same divisions, labels, order and spots as Settings. Usage: php players_divisions_test.php
if ( ! defined( 'ABSPATH' ) ) { define( 'ABSPATH', '/' ); }
class GRSH_Team_Deposit { const FORM_ID = 5181; const TEST_FORM_ID = 5178; }
class GRSH_Sync_Engine { const SEASON = 2027; const FORM_ID = 5047; const TEST_FORM_ID = 5210; }
function get_posts( $a ) { return []; }
$GLOBALS['wpdb'] = null;
require __DIR__ . '/../../includes/class-grsh-settings.php';
require __DIR__ . '/harness.php';
require __DIR__ . '/../../includes/class-grsh-players-api.php';
$pass = 0; $fail = 0;
function ok( $c, $m ) { global $pass, $fail; if ( $c ) { $pass++; } else { $fail++; echo "  FAIL: $m\n"; } }
function eq( $a, $b, $m ) { ok( $a === $b, $m . ' (got ' . json_encode( $a ) . ', want ' . json_encode( $b ) . ')' ); }
$db = fresh_db( sys_get_temp_dir() . '/grsh_pd.sqlite' );
$GLOBALS['user_can'] = true;

$rows = function () { return GRSH_Players::get_division_capacity( new WP_REST_Request( [], [] ) )->data; };

echo "1. matches Settings\n";
$cfg = GRSH_Settings::get_active_divisions();
$r = $rows();
eq( array_column( $r, 'key' ), array_column( $cfg, 'key' ), 'same divisions in the same order as Settings' );
eq( array_column( $r, 'label' ), array_column( $cfg, 'label' ), 'same labels as Settings' );
foreach ( $r as $i => $row ) {
    list( $dt, $rt ) = GRSH_Settings::slots( $cfg[ $i ] );
    eq( $row['capacity'], $dt * (int) $cfg[ $i ]['max_roster'], $row['key'] . ' capacity = draft teams x max roster' );
    eq( [ $row['draft_teams'], $row['reg_teams'], $row['teams'] ], [ $dt, $rt, (int) $cfg[ $i ]['teams'] ], $row['key'] . ' slot split matches Settings' );
}

echo "2. follows a Settings change\n";
$s = GRSH_Settings::get(); $d = $s['divisions'];
$d[0]['format'] = 'both'; $d[0]['teams'] = 4; $d[0]['reg_teams'] = 1; $d[0]['max_roster'] = 12; if ( $d[0]['min_roster'] > 12 ) { $d[0]['min_roster'] = 8; }
$d[1]['format'] = 'teams'; $d[1]['teams'] = 2; $d[1]['reg_teams'] = 2;
$d[2]['enabled'] = false;
update_option( GRSH_Settings::OPTION_KEY, array_merge( $s, [ 'divisions' => $d ] ) );
$r = $rows(); $by = array_column( $r, null, 'key' );
eq( $by[ $d[0]['key'] ]['capacity'], 36, 'both: 3 draft teams x 12, the registered team slot is not counted' );
eq( $by[ $d[0]['key'] ]['format'], 'both', 'format reported' );
eq( $by[ $d[1]['key'] ]['capacity'], 0, 'teams-only division has no draft spots' );
eq( $by[ $d[1]['key'] ]['format'], 'teams', 'teams format reported' );
ok( ! isset( $by[ $d[2]['key'] ] ), 'a division switched off in Settings disappears' );

echo "3. registration counts\n";
$k = $d[0]['key'];
$n0 = $by[ $k ]['registered'];
$db->pdo->exec( "INSERT INTO wp_grsh_registrations (player_id, season_id, division_requested, player_type, status) VALUES (9001, 1, '$k', 'primary', 'registered')" );
$by2 = array_column( $rows(), null, 'key' );
eq( $by2[ $k ]['registered'], $n0 + 1, 'a new registration is counted' );
eq( $by2[ $k ]['pct'], round( ( $n0 + 1 ) / 36 * 100, 1 ), 'percent uses the new capacity' );
ok( isset( $by2[ $d[1]['key'] ] ), 'a division with zero registrations still gets a card' );

echo "\n$pass passed, $fail failed\n"; exit( $fail ? 1 : 0 );
