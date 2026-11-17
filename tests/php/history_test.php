<?php
// GRSH_History_Tools against the SQLite shim. Usage: php history_test.php [includes-dir] [class-file]
require __DIR__ . '/harness.php';
require $argv[2] ?? __DIR__ . '/../../includes/class-grsh-history-tools.php';
$pass = 0; $fail = 0;
function ok( $c, $m ) { global $pass, $fail; if ( $c ) { $pass++; } else { $fail++; echo "  FAIL: $m\n"; } }
function eq( $a, $b, $m ) { ok( $a === $b, $m . ' (got ' . json_encode( $a ) . ', want ' . json_encode( $b ) . ')' ); }
function req( $params = [], $body = [] ) { return new WP_REST_Request( $params, $body ); }

$db = fresh_db( sys_get_temp_dir() . '/grsh_hist.sqlite' );
$db->pdo->exec( "DROP TABLE wp_grsh_player_history;
 CREATE TABLE wp_grsh_player_history (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id INT, season_id INT, division_played TEXT, team_name TEXT, championship_result TEXT DEFAULT 'none',
   was_captain INT DEFAULT 0, skill_tier_reported TEXT, sandbagging_flag INT DEFAULT 0, games_scheduled INT, games_attended INT, no_show_count INT DEFAULT 0, committee_notes TEXT);
 ALTER TABLE wp_grsh_audit_logs ADD COLUMN before_value TEXT;
 INSERT INTO wp_grsh_seasons (id, season_year) VALUES (3, 2025);" );
$GLOBALS['user_can'] = true;

echo "1. empty history\n";
$o = GRSH_History_Tools::overview();
eq( $o['rows'], 0, 'no rows' ); eq( $o['players'], 0, 'no players' ); eq( $o['duplicates'], [], 'no duplicates' ); eq( $o['last_import'], null, 'no import yet' );
eq( $o['registered_ids'], [], 'nobody registered' );
foreach ( $o['quality'] as $q ) { eq( $q['count'], 0, 'quality ' . $q['key'] . ' = 0 on empty' ); }

echo "2. seeded history\n";
$P = function ( $f, $l, $e ) use ( $db ) { $db->insert( 'wp_grsh_players', [ 'first_name' => $f, 'last_name' => $l, 'email' => $e ] ); return $db->insert_id; };
$H = function ( $pid, $sid, $a = [] ) use ( $db ) { $db->insert( 'wp_grsh_player_history', array_merge( [ 'player_id' => $pid, 'season_id' => $sid, 'division_played' => 'gold_open', 'team_name' => 'Red', 'skill_tier_reported' => 'B2', 'games_scheduled' => 6, 'games_attended' => 6 ], $a ) ); return $db->insert_id; };
$dave  = $P( 'Dave', 'Horowitz', 'dave.horowitz@a.com' );   $david = $P( 'David', 'Horowitz', 'dh@b.com' );        // same person (no season overlap)
$twin1 = $P( 'Chris', 'Lee', 'chris1@x.com' );              $twin2 = $P( 'Chris', 'Lee', 'chris2@x.com' );      // same season = two people
$noem  = $P( 'Pat', 'Nomail', '' );
$sam1  = $P( 'Sam', 'Roberts', 'sam.roberts@one.com' );     $sam2  = $P( 'Samuel', 'Smith', 'sam.roberts@two.com' ); // same email name
$loner = $P( 'Ann', 'Solo', 'ann@solo.com' );
$r1 = $H( $dave, 2 ); $H( $david, 3 );
$H( $twin1, 2 ); $H( $twin2, 2 );
$H( $noem, 2, [ 'skill_tier_reported' => null, 'division_played' => null, 'team_name' => '', 'games_scheduled' => null, 'games_attended' => null ] );
$H( $sam1, 2 ); $H( $sam2, 3 ); $H( $loner, 2 );
$db->insert( 'wp_grsh_registrations', [ 'player_id' => $loner, 'season_id' => 1, 'status' => 'registered' ] );
$db->insert( 'wp_grsh_registrations', [ 'player_id' => $dave,  'season_id' => 1, 'status' => 'withdrawn' ] );
$o = GRSH_History_Tools::overview();
$q = []; foreach ( $o['quality'] as $x ) { $q[ $x['key'] ] = $x['count']; }
eq( $o['rows'], 8, '8 season rows' ); eq( $o['players'], 8, '8 players' ); eq( $o['seasons'], [ 2026, 2025 ], 'seasons newest first' );
eq( $q['no_tier'], 1, 'one row without tier' ); eq( $q['no_division'], 1, 'one row without division' ); eq( $q['no_games'], 1, 'one row without attendance' );
eq( $q['no_team'], 1, 'one row without team (blank string counts)' ); eq( $q['no_email'], 1, 'one player without email' );
eq( $o['registered_ids'], [ $loner ], 'registered this season = live registrations only (withdrawn excluded)' );
eq( $o['registered_year'], 2027, 'registered year' );
$pairs = array_map( function ( $d ) { return $d['a']['id'] . '-' . $d['b']['id']; }, $o['duplicates'] );
ok( in_array( $dave . '-' . $david, $pairs, true ), 'Dave/David Horowitz offered as possible duplicate' );
ok( ! in_array( $twin1 . '-' . $twin2, $pairs, true ), 'same-season twins are NOT offered (two people)' );
ok( in_array( $sam1 . '-' . $sam2, $pairs, true ), 'same email name on two addresses offered' );
eq( count( $o['duplicates'] ), 2, 'exactly two candidate pairs' );
update_option( 'grsh_dismissed_dupes', [ min( $dave, $david ) . '-' . max( $dave, $david ) ] );
eq( count( GRSH_History_Tools::overview()['duplicates'] ), 1, 'dismissed pair no longer offered' );

echo "3. import log\n";
$db->pdo->exec( "CREATE TABLE wp_grsh_import_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_display TEXT, filename TEXT, imported INT, updated INT, skipped INT, created_at TEXT);
  INSERT INTO wp_grsh_import_logs (user_display, filename, imported, updated, skipped, created_at) VALUES ('Lorenzo','history.csv',200,5,2,'2026-11-10 09:00:00')" );
$li = GRSH_History_Tools::overview()['last_import'];
eq( $li['file'], 'history.csv', 'last import file' ); eq( $li['imported'], 200, 'last import count' ); eq( $li['by'], 'Lorenzo', 'last import by' );

echo "4. edit a season row\n";
$res = GRSH_History_Tools::update_record( req( [ 'id' => $r1 ], [ 'skill_tier_reported' => 'a2', 'team_name' => ' Blue ', 'no_show_count' => 2, 'sandbagging_flag' => true ] ) );
eq( $res->status, 200, 'edit ok' );
$row = $db->get_row( "SELECT * FROM wp_grsh_player_history WHERE id = $r1" );
eq( $row['skill_tier_reported'], 'A2', 'tier upper-cased' ); eq( $row['team_name'], 'Blue', 'team trimmed' ); eq( (int) $row['no_show_count'], 2, 'no-shows saved' ); eq( (int) $row['sandbagging_flag'], 1, 'flag saved' );
$a = $db->get_row( "SELECT * FROM wp_grsh_audit_logs WHERE action = 'history_record_edited'" );
ok( $a !== null && strpos( $a['before_value'], 'B2' ) !== false, 'audit log keeps the old tier' );
eq( GRSH_History_Tools::update_record( req( [ 'id' => $r1 ], [ 'skill_tier_reported' => 'Z9' ] ) )->status, 400, 'bad tier rejected' );
eq( GRSH_History_Tools::update_record( req( [ 'id' => $r1 ], [ 'division_played' => 'bogus' ] ) )->status, 400, 'bad division rejected' );
eq( GRSH_History_Tools::update_record( req( [ 'id' => $r1 ], [ 'games_attended' => 9 ] ) )->status, 400, 'attended > scheduled rejected' );
eq( GRSH_History_Tools::update_record( req( [ 'id' => $r1 ], [ 'no_show_count' => -1 ] ) )->status, 400, 'negative no-shows rejected' );
eq( GRSH_History_Tools::update_record( req( [ 'id' => $r1 ], [ 'no_show_count' => 'abc' ] ) )->status, 400, 'non-number no-shows rejected' );
eq( GRSH_History_Tools::update_record( req( [ 'id' => $r1 ], [] ) )->status, 400, 'empty edit rejected' );
eq( GRSH_History_Tools::update_record( req( [ 'id' => 9999 ], [ 'team_name' => 'x' ] ) )->status, 404, 'missing row 404' );
GRSH_History_Tools::update_record( req( [ 'id' => $r1 ], [ 'skill_tier_reported' => '' ] ) );
eq( $db->get_var( "SELECT skill_tier_reported FROM wp_grsh_player_history WHERE id = $r1" ), null, 'blank tier clears to NULL' );
$res = GRSH_History_Tools::update_record( req( [ 'id' => $r1 ], [ 'team_name' => '<b>Red</b><script>x</script>', 'committee_notes' => '<i>late</i>' ] ) );
ok( strpos( $db->get_var( "SELECT team_name FROM wp_grsh_player_history WHERE id = $r1" ), '<' ) === false, 'markup stripped from team' );
ok( strpos( (string) $db->get_var( "SELECT committee_notes FROM wp_grsh_player_history WHERE id = $r1" ), '<' ) === false, 'markup stripped from notes' );

echo "5. edit a player\n";
eq( GRSH_History_Tools::update_player( req( [ 'id' => $noem ], [ 'email' => 'Pat@Mail.com' ] ) )->status, 200, 'email set' );
eq( $db->get_var( "SELECT email FROM wp_grsh_players WHERE id = $noem" ), 'pat@mail.com', 'email lower-cased' );
$res = GRSH_History_Tools::update_player( req( [ 'id' => $noem ], [ 'email' => 'ann@solo.com' ] ) );
eq( $res->status, 409, 'email of another player -> 409 (use Merge)' ); eq( $res->data['other_id'], $loner, 'names the other player' );
eq( GRSH_History_Tools::update_player( req( [ 'id' => $noem ], [ 'email' => 'not an email' ] ) )->status, 400, 'bad email rejected' );
eq( GRSH_History_Tools::update_player( req( [ 'id' => $noem ], [ 'first_name' => '  ' ] ) )->status, 400, 'blank name rejected' );
eq( GRSH_History_Tools::update_player( req( [ 'id' => $noem ], [ 'first_name' => 'Patricia', 'last_name' => 'Mail' ] ) )->status, 200, 'rename ok' );
eq( $db->get_var( "SELECT first_name FROM wp_grsh_players WHERE id = $noem" ), 'Patricia', 'name saved' );
eq( GRSH_History_Tools::update_player( req( [ 'id' => 9999 ], [ 'first_name' => 'x' ] ) )->status, 404, 'missing player 404' );

echo "6. routes and permissions\n";
GRSH_History_Tools::register_routes();
foreach ( [ '/history/overview', '/history/records/(?P<id>\d+)', '/history/players/(?P<id>\d+)' ] as $r ) { ok( isset( $GLOBALS['routes']['grsh/v1' . $r] ), "route $r registered" ); }
$GLOBALS['user_can'] = false; eq( GRSH_History_Tools::permission(), false, 'no capability -> denied' ); $GLOBALS['user_can'] = true;
ok( ! empty( $GLOBALS['routes']['grsh/v1/history/overview']['permission_callback'] ), 'permission callback on every route' );
ok( strpos( json_encode( GRSH_History_Tools::overview() ), 'NaN' ) === false, 'no NaN in payload' );
echo "\n$pass passed, $fail failed\n"; exit( $fail ? 1 : 0 );
