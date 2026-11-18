<?php
// GRSH_Score_Sheets against the SQLite shim. Usage: php score_sheets_test.php [class-file]
if ( ! defined( 'ABSPATH' ) ) { define( 'ABSPATH', '/' ); }
define( 'DAY_IN_SECONDS', 86400 );
class GRSH_Settings {
    static $s = [ 'season_year' => 2027 ];
    static function get() { return self::$s; }
    static function get_active_divisions() {
        return [ [ 'key' => 'gold_open', 'label' => 'Gold Open', 'min_roster' => 7, 'max_roster' => 12, 'goalie_min' => 1, 'goalie_max' => 2 ],
                 [ 'key' => '45a', 'label' => '45A', 'min_roster' => 7, 'max_roster' => 11, 'goalie_min' => 1, 'goalie_max' => 2 ] ];
    }
}
function __( $s, $d = '' ) { return $s; }
function add_submenu_page( ...$a ) { $GLOBALS['submenu'][] = $a; }
function wp_create_nonce( $a ) { return 'nonce-' . $a; }
function admin_url( $p = '' ) { return 'https://grsht.test/wp-admin/' . $p; }
function wp_die( $m ) { throw new RuntimeException( 'wp_die: ' . $m ); }
function check_admin_referer( $a, $b ) { return true; }
function wp_get_object_terms( $id, $tax, $a ) { return $GLOBALS['venues'][ $id ] ?? []; }
require __DIR__ . '/harness.php';
require $argv[1] ?? __DIR__ . '/../../includes/class-grsh-score-sheets.php';

$pass = 0; $fail = 0;
function ok( $c, $m ) { global $pass, $fail; if ( $c ) { $pass++; } else { $fail++; echo "  FAIL: $m\n"; } }
function eq( $a, $b, $m ) { ok( $a === $b, $m . ' (got ' . json_encode( $a ) . ', want ' . json_encode( $b ) . ')' ); }
function has( $hay, $needle, $m ) { ok( strpos( $hay, $needle ) !== false, $m ); }
function lacks( $hay, $needle, $m ) { ok( strpos( $hay, $needle ) === false, $m ); }
function req( $json, $params = [] ) { return new WP_REST_Request( $params, $json ); }

$db = fresh_db( sys_get_temp_dir() . '/grsh_ss.sqlite' );
$db->pdo->exec( "CREATE TABLE wp_postmeta (meta_id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INT, meta_key TEXT, meta_value TEXT);" );
$db->pdo->exec( "DROP TABLE wp_grsh_players; DROP TABLE wp_grsh_rosters; DROP TABLE wp_grsh_teams;
CREATE TABLE wp_grsh_players (id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT, last_name TEXT, position TEXT);
CREATE TABLE wp_grsh_teams (id INTEGER PRIMARY KEY AUTOINCREMENT, season_id INT, division TEXT, team_type TEXT DEFAULT 'full_team', name TEXT, captain_player_id INT);
CREATE TABLE wp_grsh_rosters (id INTEGER PRIMARY KEY AUTOINCREMENT, season_id INT, team_id INT, player_id INT, is_captain INT DEFAULT 0, is_alternate INT DEFAULT 0, jersey_number INT, position_assigned TEXT);" );
$db->insert( 'wp_grsh_seasons', [ 'id' => 1, 'season_year' => 2027 ] );
$db->insert( 'wp_grsh_seasons', [ 'id' => 2, 'season_year' => 2026 ] );

function mk_team( $name, $div = 'gold_open', $season = 1, $type = 'full_team' ) { global $db; $db->insert( 'wp_grsh_teams', [ 'season_id' => $season, 'division' => $div, 'name' => $name, 'team_type' => $type ] ); return $db->insert_id; }
function mk_p( $team, $first, $last, $jersey, $pos = 'winger', $extra = [] ) {
    global $db; $db->insert( 'wp_grsh_players', [ 'first_name' => $first, 'last_name' => $last, 'position' => $pos ] ); $pid = $db->insert_id;
    $db->insert( 'wp_grsh_rosters', array_merge( [ 'season_id' => 1, 'team_id' => $team, 'player_id' => $pid, 'jersey_number' => $jersey ], $extra ) ); return $pid;
}
function fill( $team, $n, $goalies = 1, $start = 1, $prefix = 'P' ) { for ( $i = 0; $i < $goalies; $i++ ) { mk_p( $team, 'G' . $team . $i, 'Goalie', 30 + $i, 'goaltender' ); } for ( $i = 0; $i < $n; $i++ ) { mk_p( $team, $prefix . $team . '_' . $i, 'Skater', $start + $i ); } }
function m( $h, $a, $extra = [] ) { return GRSH_Score_Sheets::clean_matchup( array_merge( [ 'home_id' => $h, 'away_id' => $a ], $extra ) ); }
$opts = GRSH_Score_Sheets::clean_options( [] );

$tA = mk_team( 'Team Ann' ); fill( $tA, 11 );
$tB = mk_team( 'Team Bo', '45a' ); fill( $tB, 9 );
$tBig = mk_team( 'Big Roster' ); fill( $tBig, 21 );              // 21 skaters + 1 goalie: the old sheet dropped everything past row 16
$tEmpty = mk_team( 'Empty Team' );
$tOld = mk_team( 'Last Year Team', 'gold_open', 2 );
$tDraft = mk_team( 'Draft Squad', 'gold_open', 1, 'draft' );

echo "season\n";
$ov = GRSH_Score_Sheets::build_overview();
eq( $ov['season']['id'], 1, 'season found' );
eq( $ov['print_nonce'], 'nonce-grsh_print_score_sheets', 'overview hands the page its print nonce' );
has( $ov['print_url'], 'admin-post.php', 'and the print URL' );
eq( count( $ov['teams'] ), 5, 'teams of this season only, including draft-format ones' );
GRSH_Settings::$s['season_year'] = 2099;
$ov2 = GRSH_Score_Sheets::build_overview();
eq( $ov2['teams'], [], 'missing season lists no teams (no fallback to season 1)' );
$b = GRSH_Score_Sheets::build_sheets( [ m( $tA, $tB ) ] );
eq( count( $b['sheets'] ), 0, 'missing season prints nothing' );
eq( count( $b['skipped'] ), 1, 'and says so' );
has( $b['skipped'][0]['reason'], 'season', 'reason names the season' );
GRSH_Settings::$s['season_year'] = 2027;

echo "roster cap bug\n";
$b = GRSH_Score_Sheets::build_sheets( [ m( $tBig, $tA ) ] );
$doc = GRSH_Score_Sheets::render_document( $b['sheets'], $opts, [], [], 'p1', true );
$allShown = true; for ( $i = 0; $i < 21; $i++ ) { if ( strpos( $doc, 'P' . $tBig . '_' . $i . ' Skater' ) === false ) { $allShown = false; } }
ok( $allShown, 'all 21 skaters of a big roster are printed' );
has( $doc, 'class="sheet dense"', 'dense layout kicks in above 18 players' );
$doc2 = GRSH_Score_Sheets::render_document( GRSH_Score_Sheets::build_sheets( [ m( $tA, $tB ) ] )['sheets'], $opts, [], [], 'p1', true );
lacks( $doc2, 'sheet dense', 'normal roster is not dense' );
eq( substr_count( $doc2, 'class="goalie-row"' ), 2, 'goalie row on both sides' );

echo "skips are reported\n";
$b = GRSH_Score_Sheets::build_sheets( [ m( $tA, 9999 ), m( $tA, $tOld ), m( $tA, $tA ), m( 0, 0 ), m( $tA, $tB ) ] );
eq( count( $b['sheets'] ), 2, 'blank-vs-blank and a valid game are kept' );
eq( count( $b['skipped'] ), 3, 'unknown team, other-season team and same-team games are skipped' );
has( $b['skipped'][0]['reason'], 'not on this season', 'unknown team reason' );
has( $b['skipped'][1]['reason'], 'not on this season', 'other-season team reason' );
has( $b['skipped'][2]['reason'], 'same team', 'same team reason' );
$html = GRSH_Score_Sheets::render_document( $b['sheets'], $opts, $b['skipped'], [], 'p1', false );
has( $html, '3 games were NOT printed', 'print page lists the skipped games at the top' );
has( $html, 'Game 1: away team #9999 is not on this season', 'skipped reason shown with the game label' );
$html1 = GRSH_Score_Sheets::render_document( $b['sheets'], $opts, [ $b['skipped'][0] ], [], 'p1', false );
has( $html1, '1 game was NOT printed', 'singular wording' );

echo "readiness warnings\n";
$rule = [ 'min_roster' => 7, 'max_roster' => 12, 'goalie_min' => 1, 'goalie_max' => 2 ];
$P = function ( $j, $g = false, $n = 'X' ) { static $i = 0; $i++; return [ 'player_id' => $i, 'name' => $n . $i, 'jersey' => $j, 'goalie' => $g, 'captain' => false, 'alternate' => false ]; };
$codes = function ( $players ) use ( $rule ) { return array_column( GRSH_Score_Sheets::team_warnings( $players, $rule ), 'code' ); };
eq( $codes( [] ), [ 'no_roster' ], 'empty roster is the only warning' );
$ok = [ $P( 1, true ) ]; for ( $i = 2; $i <= 8; $i++ ) { $ok[] = $P( $i ); }
eq( $codes( $ok ), [], 'a healthy roster has no warnings' );
ok( in_array( 'under_min', $codes( array_slice( $ok, 0, 5 ) ), true ), 'under minimum' );
$many = $ok; for ( $i = 20; $i < 26; $i++ ) { $many[] = $P( $i ); }
ok( in_array( 'over_max', $codes( $many ), true ), 'over maximum' );
ok( in_array( 'no_goalie', $codes( array_slice( $ok, 1 ) ), true ), 'no goalie' );
$g3 = $ok; $g3[] = $P( 40, true ); $g3[] = $P( 41, true );
ok( in_array( 'many_goalies', $codes( $g3 ), true ), 'too many goalies is info' );
$nj = $ok; $nj[] = $P( null ); ok( in_array( 'no_jersey', $codes( $nj ), true ), 'missing jersey number' );
$dj = $ok; $dj[] = $P( 3 ); ok( in_array( 'dup_jersey', $codes( $dj ), true ), 'duplicate jersey number' );
$lv = array_column( GRSH_Score_Sheets::team_warnings( $dj, $rule ), 'level', 'code' ); eq( $lv['dup_jersey'], 'bad', 'duplicate number is bad' );
$o = GRSH_Score_Sheets::build_overview(); $row = null; foreach ( $o['teams'] as $t ) { if ( $t['id'] === $tEmpty ) { $row = $t; } }
eq( $row['warnings'][0]['code'], 'no_roster', 'overview carries warnings per team' );

echo "markers and ordering\n";
$tM = mk_team( 'Marked' );
mk_p( $tM, 'Cap', 'Tain', 9, 'winger', [ 'is_captain' => 1 ] ); mk_p( $tM, 'Alt', 'Ernate', 5, 'winger', [ 'is_alternate' => 1 ] );
mk_p( $tM, 'Gina', 'One', 31, 'goaltender' ); mk_p( $tM, 'Gus', 'Two', 35, 'goaltender' ); mk_p( $tM, 'No', 'Number', null );
$b = GRSH_Score_Sheets::build_sheets( [ m( $tM, 0 ) ] );
$doc = GRSH_Score_Sheets::render_document( $b['sheets'], $opts, [], [], 'p1', true );
has( $doc, 'Cap Tain (C)', 'captain marked (C)' );
has( $doc, 'Alt Ernate (A)', 'alternate marked (A)' );
has( $doc, 'Gus Two (G)', 'second goalie marked (G)' );
$posG = strpos( $doc, 'Gina One' ); $posA = strpos( $doc, 'Alt Ernate' ); $posN = strpos( $doc, 'No Number' );
ok( $posG < $posA && $posA < strpos( $doc, 'Cap Tain' ) && strpos( $doc, 'Cap Tain' ) < $posN, 'goalie first, then by jersey number, unnumbered last' );
has( $doc, 'SUBS / LATE ADDITIONS', 'subs block' );

echo "changes since print\n";
$players = [ [ 'player_id' => 1, 'name' => 'A', 'jersey' => 1 ], [ 'player_id' => 2, 'name' => 'B', 'jersey' => 2 ] ];
eq( GRSH_Score_Sheets::changes_since_print( $players, null ), null, 'never printed means no change flag' );
$snap = [ 'at' => 'T', 'players' => [ 1 => [ 'name' => 'A', 'jersey' => 1 ], 2 => [ 'name' => 'B', 'jersey' => 2 ] ] ];
eq( GRSH_Score_Sheets::changes_since_print( $players, $snap ), null, 'identical roster is not flagged' );
$c = GRSH_Score_Sheets::changes_since_print( array_merge( $players, [ [ 'player_id' => 3, 'name' => 'C', 'jersey' => 3 ] ] ), $snap );
eq( $c['added'], [ 'C' ], 'added player' );
$c = GRSH_Score_Sheets::changes_since_print( [ $players[0] ], $snap ); eq( $c['removed'], [ 'B' ], 'removed player' );
$p2 = $players; $p2[1]['jersey'] = 22; $c = GRSH_Score_Sheets::changes_since_print( $p2, $snap ); eq( $c['jersey'], [ 'B' ], 'number change' );

echo "printing, log and snapshots\n";
$GLOBALS['wpdb']->query( "DELETE FROM wp_options WHERE option_name LIKE 'grsh_ss_%'" );
$html = GRSH_Score_Sheets::print_document( [ m( $tA, $tB, [ 'date' => '2027-01-16', 'game_time' => '19:30', 'arena' => 'Tahoe Ice', 'game_no' => '7' ] ) ], $opts );
has( $html, 'Sat Jan 16, 2027', 'date is spelled out' );
has( $html, '7:30 PM', 'time is 12-hour' );
has( $html, 'Tahoe Ice', 'arena printed' );
has( $html, 'data-url="https://grsht.test/wp-admin/admin.php?page=grsh-score-sheets&amp;sheet=p', 'sheet carries a QR target' );
has( $html, 'qrcode(0,"M")', 'QR renderer is on the page' );
$log = get_option( 'grsh_ss_print_log' ); eq( count( $log ), 1, 'one log entry' );
eq( $log[0]['count'], 1, 'log counts the sheets' );
ok( isset( $log[0]['rosters'][ $tA ] ) && isset( $log[0]['rosters'][ $tB ] ), 'log keeps the rosters as printed' );
ok( preg_match( '/sheet=(p[a-f0-9]{10})-1/', $html, $mm ) && GRSH_Score_Sheets::print_record( $mm[1] ) !== null, 'QR id resolves to a stored record' );
$snaps = get_option( 'grsh_ss_roster_snaps' ); ok( isset( $snaps[ $tA ] ), 'snapshot taken for printed team' );
ok( ! isset( $snaps[ $tEmpty ] ), 'no snapshot for a team that was not printed' );
mk_p( $tA, 'Late', 'Adder', 77 );
$ov = GRSH_Score_Sheets::build_overview(); $row = null; foreach ( $ov['teams'] as $t ) { if ( $t['id'] === $tA ) { $row = $t; } }
eq( $row['changed']['added'], [ 'Late Adder' ], 'overview flags the late addition' );
$html = GRSH_Score_Sheets::print_document( [ m( $tA, 0 ) ], $opts );
has( $html, 'Team Ann changed since last print: added Late Adder', 'print page warns about the change' );
$ov = GRSH_Score_Sheets::build_overview(); $row = null; foreach ( $ov['teams'] as $t ) { if ( $t['id'] === $tA ) { $row = $t; } }
eq( $row['changed'], null, 'flag clears after the new print' );
ok( ! isset( $ov['log'][0]['rosters'] ), 'overview log omits bulky rosters' );
$before = count( get_option( 'grsh_ss_print_log' ) );
$resp = GRSH_Score_Sheets::rest_preview( req( [ 'matchup' => m( $tA, $tB ), 'options' => [] ] ) );
eq( count( get_option( 'grsh_ss_print_log' ) ), $before, 'preview does not write a log entry' );
lacks( $resp->data['html'], 'data-url', 'preview has no QR target' );
has( $resp->data['html'], 'Team Ann', 'preview shows the sheet' );
for ( $i = 0; $i < 14; $i++ ) { GRSH_Score_Sheets::print_document( [ m( $tA, $tB ) ], $opts ); }
eq( count( get_option( 'grsh_ss_print_log' ) ), 10, 'log keeps only the last 10 runs' );
$rec = GRSH_Score_Sheets::rest_record( req( null, [ 'id' => 'nope' ] ) ); eq( $rec->status, 404, 'unknown record is a 404' );
$id = get_option( 'grsh_ss_print_log' )[0]['id']; $rec = GRSH_Score_Sheets::rest_record( req( null, [ 'id' => $id ] ) ); ok( $rec->data['success'] && isset( $rec->data['record']['rosters'] ), 'record route returns rosters' );

echo "options\n";
$o2 = GRSH_Score_Sheets::clean_options( [ 'font' => 'large', 'back' => true, 'cover' => true, 'spares' => 3, 'order' => 'time' ] );
$html = GRSH_Score_Sheets::print_document( [ m( $tA, $tB, [ 'game_time' => '20:00' ] ), m( $tB, $tA, [ 'game_time' => '18:00' ] ) ], $o2 );
has( $html, 'SCORE SHEET PACKET', 'cover page' );
has( $html, 'GAME LOG', 'back page with goal log' );
eq( substr_count( $html, 'OFFICIAL SCORE SHEET' ), 5, '2 games + 3 spares' );
has( $html, '5</b> sheet', 'sheet count in the toolbar' );
has( $html, 'two-sided', 'toolbar says two-sided' );
has( $html, 'font-size:10px', 'large font option' );
ok( strpos( $html, '6:00 PM' ) < strpos( $html, '8:00 PM' ), 'sorted by time' );
$c = GRSH_Score_Sheets::clean_options( [ 'spares' => 99, 'order' => 'bogus', 'font' => 'huge' ] );
eq( [ $c['spares'], $c['order'], $c['font'] ], [ 10, 'queue', 'normal' ], 'options are clamped' );
$list = [ m( 1, 2, [ 'date' => '2027-01-17', 'game_time' => '09:00', 'arena' => 'B Rink' ] ), m( 3, 4, [ 'date' => '2027-01-16', 'game_time' => '20:00', 'arena' => 'A Rink' ] ), m( 5, 6, [ 'date' => '', 'game_time' => '', 'arena' => '' ] ), m( 7, 8, [ 'date' => '2027-01-16', 'game_time' => '20:00', 'arena' => 'A Rink' ] ) ];
eq( array_column( GRSH_Score_Sheets::order_matchups( $list, 'time' ), 'home_id' ), [ 3, 7, 1, 5 ], 'time order: stable for ties, unscheduled last' );
eq( array_column( GRSH_Score_Sheets::order_matchups( $list, 'arena' ), 'home_id' ), [ 3, 7, 1, 5 ], 'arena order' );
eq( array_column( GRSH_Score_Sheets::order_matchups( $list, 'queue' ), 'home_id' ), [ 1, 3, 5, 7 ], 'queue order untouched' );

echo "cleaning and escaping\n";
$c = GRSH_Score_Sheets::clean_matchup( [ 'home_id' => '12', 'away_id' => -4, 'date' => '2027-13-xx', 'game_time' => '7pm', 'arena' => str_repeat( 'x', 200 ), 'game_no' => str_repeat( '9', 50 ), 'type' => 'junk' ] );
eq( [ $c['home_id'], $c['away_id'], $c['date'], $c['game_time'], $c['type'] ], [ 12, 0, '', '', 'REG' ], 'bad inputs become safe defaults' );
eq( strlen( $c['arena'] ), 80, 'arena capped' ); eq( strlen( $c['game_no'] ), 20, 'game number capped' );
$b = GRSH_Score_Sheets::build_sheets( [ m( $tA, 0, [ 'arena' => '<script>alert(1)</script>Rink' ] ) ] );
$doc = GRSH_Score_Sheets::render_document( $b['sheets'], $opts, [], [], 'p1', true );
lacks( $doc, '<script>alert(1)', 'arena is escaped on the sheet' );
$tX = mk_team( 'Evil <b>Team</b>' ); $b = GRSH_Score_Sheets::build_sheets( [ m( $tX, 0 ) ] );
lacks( GRSH_Score_Sheets::render_document( $b['sheets'], $opts, [], [], 'p1', true ), 'Evil <b>', 'team name is escaped' );
$many = []; for ( $i = 0; $i < 80; $i++ ) { $many[] = [ 'home_id' => $tA, 'away_id' => $tB ]; }
$r = GRSH_Score_Sheets::rest_batch_save( req( [ 'name' => 'Big', 'matchups' => $many ] ) );
eq( count( $r->data['batches'][0]['matchups'] ), 60, 'a run is capped at 60 games' );

echo "batches and arenas\n";
$GLOBALS['wpdb']->query( "DELETE FROM wp_options WHERE option_name LIKE 'grsh_ss_%'" );
$r = GRSH_Score_Sheets::rest_batch_save( req( [ 'name' => '', 'matchups' => [ m( $tA, $tB ) ] ] ) ); eq( $r->status, 400, 'name required' );
$r = GRSH_Score_Sheets::rest_batch_save( req( [ 'name' => 'Empty', 'matchups' => [] ] ) ); eq( $r->status, 400, 'games required' );
$r = GRSH_Score_Sheets::rest_batch_save( req( [ 'name' => 'Sat Day 1', 'matchups' => [ m( $tA, $tB, [ 'arena' => 'Tahoe Ice' ] ) ], 'options' => [ 'back' => true ] ] ) );
ok( $r->data['success'] && count( $r->data['batches'] ) === 1, 'batch saved' ); ok( $r->data['batches'][0]['options']['back'], 'batch keeps its print options' );
$r = GRSH_Score_Sheets::rest_batch_save( req( [ 'name' => 'sat day 1', 'matchups' => [ m( $tA, $tB ), m( $tB, $tA ) ] ] ) );
eq( count( $r->data['batches'] ), 1, 'same name (any case) updates instead of duplicating' ); eq( count( $r->data['batches'][0]['matchups'] ), 2, 'updated games' );
has( $r->data['message'], 'Updated', 'message says updated' );
$id = $r->data['batches'][0]['id'];
for ( $i = 0; $i < 29; $i++ ) { GRSH_Score_Sheets::rest_batch_save( req( [ 'name' => 'B' . $i, 'matchups' => [ m( $tA, $tB ) ] ] ) ); }
$r = GRSH_Score_Sheets::rest_batch_save( req( [ 'name' => 'One too many', 'matchups' => [ m( $tA, $tB ) ] ] ) ); eq( $r->status, 400, '31st batch refused' );
$r = GRSH_Score_Sheets::rest_batch_delete( req( [ 'id' => $id ] ) ); eq( count( $r->data['batches'] ), 29, 'batch deleted' );
$ar = get_option( 'grsh_ss_arenas' ); ok( in_array( 'Tahoe Ice', $ar, true ), 'arena remembered from a saved batch' );
foreach ( [ 'A1', 'a1', 'B2' ] as $a ) { GRSH_Score_Sheets::rest_batch_save( req( [ 'name' => 'x' . $a . mt_rand(), 'matchups' => [ m( $tA, $tB, [ 'arena' => $a ] ) ] ] ) ); $GLOBALS['wpdb']->query( "DELETE FROM wp_options WHERE option_name='grsh_ss_batches'" ); }
$ar = get_option( 'grsh_ss_arenas' ); eq( array_slice( $ar, 0, 2 ), [ 'B2', 'a1' ], 'arenas: newest first, case-insensitive dedupe' );
for ( $i = 0; $i < 30; $i++ ) { GRSH_Score_Sheets::rest_batch_save( req( [ 'name' => 'q' . $i, 'matchups' => [ m( $tA, $tB, [ 'arena' => 'Rink' . $i ] ) ] ] ) ); $GLOBALS['wpdb']->query( "DELETE FROM wp_options WHERE option_name='grsh_ss_batches'" ); }
eq( count( get_option( 'grsh_ss_arenas' ) ), 20, 'arena list capped at 20' );

echo "schedule import\n";
$o = GRSH_Score_Sheets::build_overview(); eq( $o['schedule']['available'], false, 'no SportsPress means no schedule' );
$GLOBALS['post_types'][] = 'sp_event'; $GLOBALS['wpdb']->postmeta = 'wp_postmeta';
function mk_sp( $title, $date ) { global $db; $db->insert( 'wp_posts', [ 'post_type' => 'sp_team', 'post_status' => 'publish', 'post_title' => $title ] ); return $db->insert_id; }
$sa = mk_sp( 'TEAM ann!', 0 ); $sb = mk_sp( 'Team Bo', 0 ); $sx = mk_sp( 'Mystery FC', 0 );
$fut = gmdate( 'Y-m-d 19:30:00', time() + 2 * DAY_IN_SECONDS );
function mk_ev( $date, $teams ) { global $db; $db->pdo->exec( "ALTER TABLE wp_posts ADD COLUMN post_date TEXT" ); }
try { $db->pdo->exec( "ALTER TABLE wp_posts ADD COLUMN post_date TEXT" ); } catch ( Throwable $e ) {}
$db->insert( 'wp_posts', [ 'post_type' => 'sp_event', 'post_status' => 'publish', 'post_title' => 'e1', 'post_date' => $fut ] ); $e1 = $db->insert_id;
$db->insert( 'wp_posts', [ 'post_type' => 'sp_event', 'post_status' => 'publish', 'post_title' => 'e2', 'post_date' => $fut ] ); $e2 = $db->insert_id;
$db->insert( 'wp_posts', [ 'post_type' => 'sp_event', 'post_status' => 'publish', 'post_title' => 'e3', 'post_date' => $fut ] ); $e3 = $db->insert_id;
$db->insert( 'wp_posts', [ 'post_type' => 'sp_event', 'post_status' => 'publish', 'post_title' => 'old', 'post_date' => '2020-01-01 10:00:00' ] ); $e4 = $db->insert_id;
foreach ( [ [ $e1, $sa ], [ $e1, $sb ], [ $e2, $sb ], [ $e2, $sx ], [ $e3, $sa ], [ $e4, $sa ], [ $e4, $sb ] ] as $pair ) { $db->insert( 'wp_postmeta', [ 'post_id' => $pair[0], 'meta_key' => 'sp_team', 'meta_value' => $pair[1] ] ); }
$GLOBALS['venues'][ $e1 ] = [ 'Tahoe Ice Rink' ];
$o = GRSH_Score_Sheets::build_overview(); $ev = $o['schedule']['events'];
eq( $o['schedule']['available'], true, 'SportsPress present' );
eq( count( $ev ), 2, 'old events and one-team events are left out' );
eq( [ $ev[0]['home_id'], $ev[0]['away_id'] ], [ $tA, $tB ], 'team names match ignoring case and punctuation' );
eq( $ev[0]['arena'], 'Tahoe Ice Rink', 'venue carried over' ); eq( $ev[0]['time'], '19:30', 'time carried over' );
eq( [ $ev[1]['home_id'], $ev[1]['away_id'] ], [ $tB, 0 ], 'unknown SportsPress team stays unmatched (0)' );

echo "safety\n";
$src = file_get_contents( $argv[1] ?? __DIR__ . '/../../includes/class-grsh-score-sheets.php' );
lacks( $src, 'display_errors', 'no debug hardening left in' );
lacks( $src, 'getTraceAsString', 'stack traces are never printed' );
ok( ! preg_match( '/\?:\s*1\s*;/', $src ), 'no silent fallback to season 1' );
foreach ( [ 'overview', 'preview', 'batch-save', 'batch-delete', 'record' ] as $r ) {
    $route = $GLOBALS['routes'][ 'grsh/v1/score-sheets/' . $r ] ?? null; GRSH_Score_Sheets::register_routes();
    $route = $GLOBALS['routes'][ 'grsh/v1/score-sheets/' . $r ] ?? null;
    ok( $route && call_user_func( $route['permission_callback'] ) === true, "route $r exists" );
    $GLOBALS['user_can'] = false; ok( $route && call_user_func( $route['permission_callback'] ) === false, "route $r needs manage_options" ); $GLOBALS['user_can'] = true;
}
$GLOBALS['user_can'] = false;
try { GRSH_Score_Sheets::handle_print_request(); ok( false, 'print refuses non-admins' ); } catch ( RuntimeException $e ) { has( $e->getMessage(), 'Not allowed', 'print refuses non-admins' ); }
$GLOBALS['user_can'] = true;
$_POST = [ 'matchups' => '[]', 'options' => '{}' ];
try { GRSH_Score_Sheets::handle_print_request(); ok( false, 'empty print is refused' ); } catch ( RuntimeException $e ) { has( $e->getMessage(), 'No games', 'empty print is refused with a clear message' ); }
$_POST = [ 'matchups' => '{bad json', 'options' => '' ];
try { GRSH_Score_Sheets::handle_print_request(); ok( false, 'bad json refused' ); } catch ( RuntimeException $e ) { ok( true, 'bad json refused' ); }

if ( getenv( 'SS_DUMP' ) ) {
    $GLOBALS['wpdb']->query( "DELETE FROM wp_options WHERE option_name LIKE 'grsh_ss_%'" );
    file_put_contents( getenv( 'SS_DUMP' ) . '/a.html', GRSH_Score_Sheets::print_document( [ m( $tA, $tB, [ 'date' => '2027-01-16', 'game_time' => '19:30', 'arena' => 'Tahoe Ice', 'game_no' => '7' ] ), m( $tBig, $tM ) ], GRSH_Score_Sheets::clean_options( [] ) ) );
    file_put_contents( getenv( 'SS_DUMP' ) . '/b.html', GRSH_Score_Sheets::print_document( [ m( $tBig, $tM ), m( $tA, $tB ) ], GRSH_Score_Sheets::clean_options( [ 'font' => 'large', 'back' => true, 'cover' => true, 'spares' => 1 ] ) ) );
}
echo "\nPASS $pass FAIL $fail\n";
exit( $fail ? 1 : 0 );
