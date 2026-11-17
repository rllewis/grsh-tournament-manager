<?php
// GRSH_History_Import against the SQLite shim. Usage: php history_import_test.php [class-file]
require __DIR__ . '/harness.php';
require $argv[1] ?? __DIR__ . '/../../includes/class-grsh-history-import.php';

class Req2 extends WP_REST_Request { public $files = []; function get_file_params() { return $this->files; } }

$pass = 0; $fail = 0;
function ok( $c, $m ) { global $pass, $fail; if ( $c ) { $pass++; } else { $fail++; echo "  FAIL: $m\n"; } }
function eq( $a, $b, $m ) { ok( $a === $b, $m . ' (got ' . json_encode( $a ) . ', want ' . json_encode( $b ) . ')' ); }

function make_csv( array $headers, array $rows, string $prefix = '', string $delim = ',' ): string {
    $f = tempnam( sys_get_temp_dir(), 'imp' );
    $h = fopen( $f, 'w' ); fwrite( $h, $prefix );
    fputcsv( $h, $headers, $delim ); foreach ( $rows as $r ) { fputcsv( $h, $r, $delim ); }
    fclose( $h ); return $f;
}
function call_import( $path, array $params = [], string $name = 'test.csv' ) {
    $r = new Req2( $params ); $r->files = [ 'csv' => [ 'name' => $name, 'tmp_name' => $path, 'size' => filesize( $path ) ] ];
    return ( new GRSH_History_Import() )->rest_import_csv( $r );
}
function count_of( $t ) { global $db; return (int) $db->get_var( "SELECT COUNT(*) FROM $t" ); }
function snapshot_counts() { return [ count_of( 'wp_grsh_players' ), count_of( 'wp_grsh_player_history' ), count_of( 'wp_grsh_seasons' ), count_of( 'wp_grsh_import_logs' ) ]; }

$db = fresh_db( sys_get_temp_dir() . '/grsh_imp.sqlite' );
$db->pdo->exec( "
DROP TABLE wp_grsh_players; DROP TABLE wp_grsh_seasons; DROP TABLE wp_grsh_player_history;
CREATE TABLE wp_grsh_players (id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT, last_name TEXT, email TEXT, skill_tier_reported TEXT, notes TEXT, attendance_rating REAL, no_show_count INT DEFAULT 0);
CREATE TABLE wp_grsh_seasons (id INTEGER PRIMARY KEY AUTOINCREMENT, season_year INT, label TEXT, form_id INT, status TEXT);
CREATE TABLE wp_grsh_player_history (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id INT, season_id INT, division_played TEXT, team_name TEXT, finish_position INT,
  championship_result TEXT DEFAULT 'none', was_captain INT DEFAULT 0, was_alternate INT DEFAULT 0, was_emergency_goalie INT DEFAULT 0, skill_tier_reported TEXT,
  sandbagging_flag INT DEFAULT 0, games_scheduled INT, games_attended INT, no_show_count INT DEFAULT 0, committee_notes TEXT, import_source TEXT);
CREATE TABLE wp_grsh_import_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, wp_user_id INT DEFAULT 0, user_display TEXT DEFAULT '', filename TEXT DEFAULT '', imported INT DEFAULT 0, updated INT DEFAULT 0,
  unchanged INT DEFAULT 0, skipped INT DEFAULT 0, total INT DEFAULT 0, mode TEXT DEFAULT 'append', errors TEXT, warnings TEXT, notes TEXT, snapshot TEXT, undone_at TEXT, created_at TEXT);
INSERT INTO wp_grsh_seasons (id, season_year, label, form_id, status) VALUES (1, 2025, 'GR 2025', 0, 'complete'), (2, 2024, 'GR 2024', 0, 'complete');
INSERT INTO wp_grsh_players (id, first_name, last_name, email) VALUES (1, 'Mike', 'Hartley', 'm.hartley@email.com'), (2, 'Janet', 'Ruiz', 'j.ruiz@email.com');
INSERT INTO wp_grsh_players (id, first_name, last_name, email, no_show_count) VALUES (3, 'Dana', 'Quinn', 'd.quinn@email.com', 5);
INSERT INTO wp_grsh_player_history (player_id, season_id, division_played, skill_tier_reported, championship_result, sandbagging_flag, games_scheduled, games_attended, committee_notes, import_source)
  VALUES (2, 1, 'senior_c', 'C1', 'participant', 1, 6, 5, 'Committee: watch', 'csv');
" );
$GLOBALS['user_can'] = true;
$H = new GRSH_History_Import();

$cols = [ 'first_name', 'last_name', 'email', 'season_year', 'division_played', 'skill_tier_reported', 'championship_result', 'was_captain', 'games_scheduled', 'games_attended', 'no_show_count' ];
$rowsA = [
    [ 'Mike', 'Hartley', 'm.hartley@email.com', '2025', 'gold_open', 'A2', 'winner', '1', '6', '6', '2' ],            // 2  new history for a known player
    [ 'Janet', 'Ruiz', 'j.ruiz@email.com', '2025', 'senior_c', 'C1', 'participant', '0', '6', '5', '0' ],            // 3  already on record
    [ 'New', 'Person', 'newp@x.com', '2023', 'Gold Open', 'b2', 'none', '0', '4', '4', '0' ],                         // 4  new player, new season, label fixed
    [ 'Mike', 'Hartley', 'm.hartley@email.com', '2025', 'gold_open', 'A2', 'winner', '1', '6', '6', '0' ],            // 5  duplicate inside the file
    [ 'Bad', 'Email', 'nope', '2025', 'gold_open', '', '', '', '', '', '' ],                                          // 6  error
    [ 'Bad', 'Year', 'by@x.com', 'Season 2025', 'gold_open', '', '', '', '', '', '' ],                                // 7  error
    [ 'Mike', 'Hartley', 'm.hartley@old.com', '2024', 'gold_open', 'A2', 'none', '0', '', '', '' ],                   // 8  look-alike (same name, other email)
    [ 'Janet', 'Rodriguez', 'j.ruiz@email.com', '2024', 'senior_b', 'B1', 'none', '0', '', '', '' ],                  // 9  name differs from the email's owner + tier warning
    [ 'Sam', 'Lee', 'sam.lee@x.com', '2025', "Women's", 'b1', 'none', 'yes', '', '', '' ],                           // 10 label fixes
    [ 'Too', 'Many', 'tm@x.com', '2025', 'gold_open', '', '', '', '300', '', '' ],                                   // 11 error (300 > 255)
];
$fileA = make_csv( $cols, $rowsA );

echo "1. dry run writes nothing\n";
$before = snapshot_counts();
$dry = call_import( $fileA, [ 'dry_run' => '1' ] )->data;
eq( snapshot_counts(), $before, 'no players, history, seasons or log rows written' );
eq( $dry['success'], true, 'dry run succeeds' ); eq( $dry['dry_run'], true, 'flagged as dry run' ); eq( $dry['job_id'], null, 'no job id' );
eq( $dry['total'], 10, '10 data rows' );
eq( [ $dry['imported'], $dry['updated'], $dry['unchanged'], $dry['skipped'] ], [ 5, 0, 0, 5 ], 'add 5, skip 5 (3 bad + 1 existing + 1 duplicate)' );
eq( $dry['imported'] + $dry['updated'] + $dry['unchanged'] + $dry['skipped'], $dry['total'], 'counts add up to total' );
eq( [ $dry['new_players'], $dry['matched_players'] ], [ 3, 2 ], '3 new players, 2 matched by email' );
eq( $dry['new_seasons'], [ 2023 ], 'season 2023 would be created' );
eq( $dry['tier_warnings'], 1, 'one tier warning' ); eq( $dry['no_show_players'], 1, 'one player with no-shows' );
$by = []; foreach ( $dry['rows'] as $r ) { $by[ $r['line'] ] = $r; }
eq( array_column( $dry['rows'], 'action' ), [ 'insert', 'skip', 'insert', 'skip', 'error', 'error', 'insert', 'insert', 'insert', 'error' ], 'row actions' );
eq( $by[4]['division'], 'gold_open', 'Gold Open fixed to gold_open' ); eq( $by[10]['division'], 'womens', "Women's fixed to womens" );
ok( strpos( $by[3]['note'], 'Already on record' ) !== false, 'existing record explained' );
ok( strpos( $by[5]['note'], 'row 2' ) !== false, 'duplicate points at the first row' );
eq( $by[8]['lookalike']['email'], 'm.hartley@email.com', 'look-alike found for the other email' );
ok( strpos( $by[9]['note'], 'belongs to Janet Ruiz' ) !== false, 'name mismatch explained' );
eq( $by[2]['player'], 'matched', 'known player matched' ); eq( $by[4]['player'], 'new', 'unknown player is new' );
$msgs = implode( ' | ', $dry['errors'] );
ok( strpos( $msgs, "Invalid email 'nope'" ) !== false, 'bad email reported' );
ok( strpos( $msgs, '4-digit year' ) !== false, 'bad year reported' );
ok( strpos( $msgs, '0 to 255' ) !== false, 'number range reported' );
ok( strpos( $msgs, 'Line 6:' ) !== false && strpos( $msgs, 'Line 7:' ) !== false && strpos( $msgs, 'Line 11:' ) !== false, 'error line numbers' );

echo "2. real import matches the dry run\n";
$live = call_import( $fileA )->data;
foreach ( [ 'imported', 'updated', 'unchanged', 'skipped', 'new_players', 'matched_players', 'tier_warnings', 'no_show_players', 'new_seasons', 'total' ] as $k ) { eq( $live[ $k ], $dry[ $k ], "live $k = dry $k" ); }
eq( $live['success'], true, 'live succeeds' ); ok( $live['job_id'] > 0, 'job id returned' ); eq( $live['rows'], [], 'live response has no row detail' );
eq( count_of( 'wp_grsh_player_history' ), 6, '1 + 5 history rows' ); eq( count_of( 'wp_grsh_players' ), 6, '3 + 3 new players' ); eq( count_of( 'wp_grsh_seasons' ), 3, '2 + 1 new season' );
eq( $db->get_var( "SELECT h.division_played FROM wp_grsh_player_history h JOIN wp_grsh_players p ON p.id=h.player_id WHERE p.email='newp@x.com'" ), 'gold_open', 'normalised division stored' );
eq( $db->get_var( "SELECT h.skill_tier_reported FROM wp_grsh_player_history h JOIN wp_grsh_players p ON p.id=h.player_id WHERE p.email='sam.lee@x.com'" ), 'B1', 'tier upper-cased' );
eq( $db->get_var( "SELECT notes FROM wp_grsh_players WHERE email='newp@x.com'" ), 'Created from historical import', 'new player marked as created by import' );
eq( $db->get_var( "SELECT attendance_rating FROM wp_grsh_players WHERE id=1" ), 100.0, 'reliability recalculated (6/6)' );
eq( $db->get_var( "SELECT committee_notes FROM wp_grsh_player_history WHERE player_id=2 AND season_id=1" ), 'Committee: watch', 'append mode kept the existing record untouched' );
$job1 = (int) $live['job_id'];

echo "3. log and stats\n";
$logs = $H->rest_get_import_logs( new Req2( [ 'limit' => 10 ] ) )->data;
eq( count( $logs ), 1, 'one log entry' ); eq( $logs[0]['id'], $job1, 'log id = job id' ); eq( $logs[0]['can_undo'], true, 'latest import can be undone' ); eq( $logs[0]['undone'], false, 'not undone' );
eq( $logs[0]['imported'], 5, 'log counts' ); eq( $logs[0]['error_count'], 3, 'log error count' ); eq( $logs[0]['mode'], 'append', 'log mode' );
$st = $H->rest_get_stats()->data;
eq( $st['total'], 6, 'stats total' ); eq( $st['players'], 5, 'distinct players with history' ); eq( $st['seasons'], [ 2025, 2024, 2023 ], 'seasons newest first' );
eq( $st['last_import']['id'], $job1, 'last import in stats' );
$cov = []; foreach ( $st['coverage'] as $c ) { $cov[ $c['season_year'] . '/' . $c['division'] ] = $c['n']; }
eq( $cov['2025/gold_open'], 1, 'coverage 2025 gold_open' ); eq( $cov['2025/womens'], 1, 'coverage 2025 womens' ); eq( $cov['2023/gold_open'], 1, 'coverage 2023' );

echo "4. records: job filter and search\n";
$rj = $H->rest_get_records( new Req2( [ 'job_id' => $job1, 'per_page' => 50, 'page' => 1 ] ) )->data;
eq( $rj['total'], 5, 'job filter returns the 5 added rows' );
$rq = $H->rest_get_records( new Req2( [ 'q' => 'sam lee', 'per_page' => 50, 'page' => 1 ] ) )->data;
eq( $rq['total'], 1, 'two-word search finds Sam Lee' ); eq( $rq['records'][0]['first_name'], 'Sam', 'search result' );
$rq = $H->rest_get_records( new Req2( [ 'q' => 'hartley', 'per_page' => 50, 'page' => 1 ] ) )->data;
eq( $rq['total'], 2, 'surname search finds Mike (2025) and the look-alike (2024)' );
eq( $H->rest_get_records( new Req2( [ 'job_id' => 9999 ] ) )->data['total'], 0, 'unknown job id returns nothing' );

echo "5. upsert: diff, blank keeps value, absent columns keep value\n";
$colsB = [ 'first_name', 'last_name', 'email', 'season_year', 'division_played', 'skill_tier_reported', 'team_name' ];
$fileB = make_csv( $colsB, [
    [ 'Janet', 'Ruiz', 'j.ruiz@email.com', '2025', 'senior_c', 'B3', '' ],            // tier changes C1 -> B3, blank team keeps
    [ 'Mike', 'Hartley', 'm.hartley@email.com', '2025', 'gold_open', 'A2', '' ],       // identical -> unchanged
] );
$d2 = call_import( $fileB, [ 'dry_run' => '1', 'import_mode' => 'upsert' ] )->data;
eq( [ $d2['imported'], $d2['updated'], $d2['unchanged'], $d2['skipped'] ], [ 0, 1, 1, 0 ], 'dry: 1 update, 1 unchanged' );
eq( json_decode( json_encode( $d2['rows'][0]['changes'] ), true ), [ 'skill_tier_reported' => [ 'C1', 'B3' ] ], 'diff shows old -> new' );
eq( $db->get_var( "SELECT skill_tier_reported FROM wp_grsh_player_history WHERE player_id=2 AND season_id=1" ), 'C1', 'dry run did not change the tier' );
$ap = call_import( $fileB, [ 'import_mode' => 'append' ] )->data;
eq( [ $ap['imported'], $ap['updated'], $ap['skipped'] ], [ 0, 0, 2 ], 'append mode: both rows already on record, nothing written' );
ok( $ap['job_id'] > 0, 'a no-change import is still logged' );
eq( $ap['total'], 2, 'append mode: both rows counted' );
$lj2 = call_import( $fileB, [ 'import_mode' => 'upsert' ] )->data; $job2 = (int) $lj2['job_id'];
eq( $db->get_var( "SELECT skill_tier_reported FROM wp_grsh_player_history WHERE player_id=2 AND season_id=1" ), 'B3', 'tier updated' );
eq( $db->get_var( "SELECT committee_notes FROM wp_grsh_player_history WHERE player_id=2 AND season_id=1" ), 'Committee: watch', 'committee notes survive (column absent from file)' );
eq( (int) $db->get_var( "SELECT sandbagging_flag FROM wp_grsh_player_history WHERE player_id=2 AND season_id=1" ), 1, 'sandbagging flag survives (column absent from file)' );
eq( (int) $db->get_var( "SELECT games_attended FROM wp_grsh_player_history WHERE player_id=2 AND season_id=1" ), 5, 'attendance survives' );

echo "6. undo\n";
$logs = $H->rest_get_import_logs( new Req2( [ 'limit' => 10 ] ) )->data;
eq( $logs[0]['id'], $job2, 'newest first' );
$noop = null; foreach ( $logs as $l ) { if ( $l['id'] === (int) $ap['job_id'] ) { $noop = $l; } }
eq( [ $noop['has_undo_data'], $noop['can_undo'] ], [ false, false ], 'the no-change import has nothing to undo and does not block the others' );
$flags = []; foreach ( $logs as $l ) { $flags[ $l['id'] ] = $l['can_undo']; }
eq( $flags[ $job2 ], true, 'newest can be undone' ); eq( $flags[ $job1 ], false, 'older cannot until the newer one is undone' );
$u = $H->rest_undo_import( new Req2( [ 'id' => $job1 ] ) );
eq( $u->status, 409, 'older import refused' ); ok( strpos( $u->data['message'], "#{$job2}" ) !== false, 'refusal names the import to undo first' );
$u = $H->rest_undo_import( new Req2( [ 'id' => $job2 ] ) );
eq( $u->status, 200, 'newest undone' ); eq( $u->data['restored'], 1, 'one record restored' );
eq( $db->get_var( "SELECT skill_tier_reported FROM wp_grsh_player_history WHERE player_id=2 AND season_id=1" ), 'C1', 'old tier restored' );
eq( $H->rest_undo_import( new Req2( [ 'id' => $job2 ] ) )->status, 409, 'second undo refused' );
$logs = $H->rest_get_import_logs( new Req2( [ 'limit' => 10 ] ) )->data; $flags = []; $und = [];
foreach ( $logs as $l ) { $flags[ $l['id'] ] = $l['can_undo']; $und[ $l['id'] ] = $l['undone']; }
eq( [ $flags[ $job1 ], $und[ $job2 ] ], [ true, true ], 'older import now eligible; newer marked undone' );
$u = $H->rest_undo_import( new Req2( [ 'id' => $job1 ] ) );
eq( $u->status, 200, 'first import undone' ); eq( [ $u->data['removed'], $u->data['players_removed'], $u->data['seasons_removed'] ], [ 5, 3, 1 ], '5 rows, 3 players, 1 season removed' );
eq( count_of( 'wp_grsh_player_history' ), 1, 'back to the one original row' ); eq( count_of( 'wp_grsh_players' ), 3, 'back to 3 players' ); eq( count_of( 'wp_grsh_seasons' ), 2, 'back to 2 seasons' );
eq( $H->rest_undo_import( new Req2( [ 'id' => 424242 ] ) )->status, 404, 'unknown job' );

echo "7. undo keeps players that gained other records\n";
$fileC = make_csv( [ 'first_name', 'last_name', 'email', 'season_year', 'division_played' ], [ [ 'Zed', 'Zimmer', 'zed@x.com', '2025', 'gold_open' ] ] );
$jc = (int) call_import( $fileC )->data['job_id'];
$zid = (int) $db->get_var( "SELECT id FROM wp_grsh_players WHERE email='zed@x.com'" );
$db->insert( 'wp_grsh_registrations', [ 'player_id' => $zid, 'season_id' => 1, 'status' => 'registered' ] );
$u = $H->rest_undo_import( new Req2( [ 'id' => $jc ] ) )->data;
eq( [ $u['removed'], $u['players_removed'] ], [ 1, 0 ], 'player with a registration is kept' );
eq( (int) $db->get_var( "SELECT COUNT(*) FROM wp_grsh_players WHERE id=$zid" ), 1, 'player still exists' );

echo "8. stop on error\n";
$before = snapshot_counts();
$st8 = call_import( $fileA, [ 'on_error' => 'stop' ] );
eq( $st8->data['success'], false, 'blocked' ); eq( $st8->data['blocked'], true, 'blocked flag' ); eq( $st8->data['imported'], 0, 'nothing imported' ); eq( $st8->data['job_id'], null, 'no job' );
eq( snapshot_counts(), $before, 'nothing written' ); ok( strpos( $st8->data['message'], 'stop on error' ) !== false, 'message explains' );
$good = make_csv( $cols, [ $rowsA[0], $rowsA[2] ] );
$st9 = call_import( $good, [ 'on_error' => 'stop' ] )->data;
eq( [ $st9['success'], $st9['imported'] ], [ true, 2 ], 'stop mode still imports a clean file' );
$jstop = (int) $st9['job_id']; $H->rest_undo_import( new Req2( [ 'id' => $jstop ] ) );

echo "9. file handling: Excel BOM, semicolons, tabs, header names, Windows-1252\n";
$bom = make_csv( [ 'first_name', 'last_name', 'email', 'season_year', 'division_played' ], [ [ 'Bo', 'Em', 'bo@x.com', '2025', 'gold_open' ] ], "\xEF\xBB\xBF" );
$r = call_import( $bom, [ 'dry_run' => '1' ] ); eq( $r->status, 200, 'BOM file accepted' ); eq( $r->data['imported'], 1, 'BOM file: row counted' );
$semi = make_csv( [ 'first_name', 'last_name', 'email', 'season_year', 'division_played' ], [ [ 'Se', 'Mi', 'se@x.com', '2025', 'gold_open' ] ], '', ';' );
eq( call_import( $semi, [ 'dry_run' => '1' ] )->data['imported'], 1, 'semicolon-separated accepted' );
$tab = make_csv( [ 'first_name', 'last_name', 'email', 'season_year', 'division_played' ], [ [ 'Ta', 'Bs', 'tb@x.com', '2025', 'gold_open' ] ], '', "\t" );
eq( call_import( $tab, [ 'dry_run' => '1' ] )->data['imported'], 1, 'tab-separated accepted' );
$al = make_csv( [ 'First Name', 'Last Name', 'Email Address', 'Season', 'Division' ], [ [ 'Al', 'Ias', 'al@x.com', '2025', 'Gold Open' ] ] );
$r = call_import( $al, [ 'dry_run' => '1' ] )->data; eq( [ $r['success'], $r['imported'] ], [ true, 1 ], 'common header spellings are mapped' );
$q = make_csv( [ 'first_name', 'last_name', 'email', 'season_year', 'division_played', 'committee_notes' ], [ [ 'Qu', 'Ote', 'qu@x.com', '2025', 'gold_open', "Smith, Jr. said \"hi\"\nsecond line" ] ] );
$jq = (int) call_import( $q )->data['job_id'];
eq( $db->get_var( "SELECT h.committee_notes FROM wp_grsh_player_history h JOIN wp_grsh_players p ON p.id=h.player_id WHERE p.email='qu@x.com'" ), "Smith, Jr. said \"hi\"\nsecond line", 'quoted comma, quote and line break survive' );
$H->rest_undo_import( new Req2( [ 'id' => $jq ] ) );
$w = tempnam( sys_get_temp_dir(), 'w' ); file_put_contents( $w, "first_name,last_name,email,season_year,division_played,committee_notes\nWi,Lli,wi@x.com,2025,gold_open,Fran\xE7ois\n" );
$jw = (int) call_import( $w )->data['job_id'];
eq( $db->get_var( "SELECT h.committee_notes FROM wp_grsh_player_history h JOIN wp_grsh_players p ON p.id=h.player_id WHERE p.email='wi@x.com'" ), 'François', 'Windows-1252 file converted to UTF-8' );
$H->rest_undo_import( new Req2( [ 'id' => $jw ] ) );
$miss = make_csv( [ 'first_name', 'last_name', 'season_year' ], [ [ 'A', 'B', '2025' ] ] );
$r = call_import( $miss ); eq( $r->status, 400, 'missing columns refused' ); eq( $r->data['missing'], [ 'email', 'division_played' ], 'missing columns listed' );
$bad = call_import( $fileA, [], 'data.pdf' ); eq( $bad->status, 400, 'wrong extension refused' );
$r = new Req2( [] ); eq( ( new GRSH_History_Import() )->rest_import_csv( $r )->status, 400, 'no file refused' );
$big = tempnam( sys_get_temp_dir(), 'b' ); file_put_contents( $big, 'x' );
$r = new Req2( [] ); $r->files = [ 'csv' => [ 'name' => 'a.csv', 'tmp_name' => $big, 'size' => 6000000 ] ]; eq( ( new GRSH_History_Import() )->rest_import_csv( $r )->status, 413, 'over 5 MB refused' );
$empty = tempnam( sys_get_temp_dir(), 'e' ); eq( call_import( $empty )->status, 400, 'empty file refused' );

echo "10. clear all only resets players that had history\n";
$jx = call_import( make_csv( $cols, [ $rowsA[0] ] ) )->data;
eq( (int) $db->get_var( "SELECT no_show_count FROM wp_grsh_players WHERE id=3" ), 5, 'Dana (no history) has 5 no-shows' );
eq( (int) $db->get_var( "SELECT no_show_count FROM wp_grsh_players WHERE id=1" ), 2, 'Mike has 2 from history' );
$c = $H->rest_delete_all_records()->data;
eq( $c['success'], true, 'cleared' ); eq( count_of( 'wp_grsh_player_history' ), 0, 'history empty' ); eq( count_of( 'wp_grsh_import_logs' ), 0, 'log empty' );
eq( (int) $db->get_var( "SELECT no_show_count FROM wp_grsh_players WHERE id=3" ), 5, 'Dana untouched' );
eq( (int) $db->get_var( "SELECT no_show_count FROM wp_grsh_players WHERE id=1" ), 0, 'Mike reset' );

echo "11. old log table gets the new columns\n";
$db->pdo->exec( "DROP TABLE wp_grsh_import_logs; CREATE TABLE wp_grsh_import_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, wp_user_id INT DEFAULT 0, user_display TEXT DEFAULT '', filename TEXT DEFAULT '', imported INT DEFAULT 0, updated INT DEFAULT 0, skipped INT DEFAULT 0, total INT DEFAULT 0, errors TEXT NOT NULL, warnings TEXT NOT NULL, notes TEXT NOT NULL, created_at TEXT);
 INSERT INTO wp_grsh_import_logs (filename, imported, errors, warnings, notes, created_at) VALUES ('old.csv', 4, '[]', '[]', 'x', '2026-01-01 10:00:00')" );
$logs = $H->rest_get_import_logs( new Req2( [ 'limit' => 10 ] ) )->data;
eq( count( $logs ), 1, 'old entry still listed' ); eq( $logs[0]['can_undo'], false, 'old entry has no undo data' ); eq( $logs[0]['has_undo_data'], false, 'flagged' );
eq( $H->rest_undo_import( new Req2( [ 'id' => $logs[0]['id'] ] ) )->status, 409, 'cannot undo an import that has no undo data' );
$j = (int) call_import( make_csv( $cols, [ $rowsA[0] ] ) )->data['job_id']; ok( $j > 0, 'import works after the migration' );

echo "12. permissions\n";
$GLOBALS['user_can'] = false; eq( $H->rest_permission_check(), false, 'denied without capability' ); $GLOBALS['user_can'] = true; eq( $H->rest_permission_check(), true, 'allowed with capability' );
eq( GRSH_History_Import::norm_division( '45A' ), '45a', '45A' ); eq( GRSH_History_Import::norm_division( 'Senior B' ), 'senior_b', 'Senior B' ); eq( GRSH_History_Import::norm_champ( 'Champion' ), 'winner', 'Champion' );
eq( GRSH_History_Import::norm_division( 'curling' ), 'curling', 'unknown label left alone so it is reported' );

echo "\nPASS $pass  FAIL $fail\n";
exit( $fail ? 1 : 0 );
