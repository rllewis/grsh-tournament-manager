<?php
require __DIR__ . '/harness.php';
$inc = $argv[1] ?? __DIR__ . '/../../includes';
require $inc . '/class-grsh-scoring.php';
require $argv[2] ?? __DIR__ . '/../../includes/class-grsh-rosters.php';

$pass = 0; $fail = 0;
function ok( $cond, $msg ) { global $pass, $fail; if ( $cond ) { $pass++; } else { $fail++; echo "  FAIL: $msg\n"; } }
function eq( $a, $b, $msg ) { ok( $a === $b, $msg . ' (got ' . json_encode( $a ) . ', want ' . json_encode( $b ) . ')' ); }
function R( $params = [], $json = null ) { return new WP_REST_Request( $params, $json ); }
function D( $resp ) { return $resp->data; }

$db = fresh_db( sys_get_temp_dir() . '/grsh_test.sqlite' );
seed_players( $db );
$GLOBALS['wpdb'] = $db;

echo "1. payload\n";
$r = GRSH_Rosters::get_rosters( R( [ 'division' => 'gold_open' ] ) ); $p = D( $r );
eq( $r->status, 200, 'GET 200' );
eq( count( $p['teams'] ), 3, '3 teams' );
eq( count( $p['pool'] ), 22, 'pool is exactly the 22 real players (no sub/alt/rejected/other division)' );
eq( $p['config']['min_roster'], 7, 'settings min_roster used' );
eq( $p['stage'], 'draft', 'stage draft' );
eq( $p['pool'][0]['returning_seasons'], [ 2026 ], 'returning seasons attached' );
ok( isset( $p['pool'][0]['years_experience'] ), 'years present' );
$ids = array_column( $p['pool'], 'id' );
$by_last = array_column( $p['pool'], 'id', 'last_name' );
$t = array_column( $p['teams'], 'id' ); list( $T1, $T2, $T3 ) = $t;
$d45 = D( GRSH_Rosters::get_rosters( R( [ 'division' => '45a' ] ) ) );
eq( count( $d45['pool'] ), 1, '45a alias o45_a included' );
$bad = GRSH_Rosters::get_rosters( R( [ 'division' => 'nope' ] ) ); eq( $bad->status, 400, 'unknown division 400' );

echo "2. single assign + move + unassign\n";
$a = $ids[0]; $b = $ids[1];
$r = GRSH_Rosters::assign_player( R( [], [ 'player_id' => $a, 'team_id' => $T1 ] ) ); $p = D( $r );
eq( $r->status, 200, 'assign 200' ); eq( count( $p['pool'] ), 21, 'pool shrinks' ); eq( count( $p['teams'][0]['players'] ), 1, 'team has player' );
$row = $db->get_row( "SELECT * FROM wp_grsh_rosters WHERE player_id = $a" );
eq( $row['assignment_type'], 'manual', 'type manual' ); ok( (int) $row['registration_id'] > 0, 'registration id resolved' ); ok( $row['position_assigned'] !== null, 'position snapshot' );
$r = GRSH_Rosters::assign_player( R( [], [ 'player_id' => $a, 'team_id' => $T2 ] ) ); $p = D( $r );
eq( count( $p['teams'][0]['players'] ), 0, 'moved off team 1' ); eq( count( $p['teams'][1]['players'] ), 1, 'onto team 2' );
eq( (int) $db->get_var( "SELECT COUNT(*) FROM wp_grsh_rosters WHERE player_id = $a" ), 1, 'exactly one roster row (no dup)' );
$rid = $p['teams'][1]['players'][0]['roster_id'];
$r = GRSH_Rosters::remove_player( R( [ 'roster_id' => $rid ] ) ); eq( count( D( $r )['pool'] ), 22, 'unassign returns to pool' );
$r = GRSH_Rosters::remove_player( R( [ 'roster_id' => 99999 ] ) ); eq( $r->status, 404, 'unknown roster id 404' );

echo "3. batch moves, atomic failure, wrong-division player\n";
$mv = []; foreach ( array_slice( $ids, 0, 9 ) as $i => $pid ) { $mv[] = [ 'player_id' => $pid, 'team_id' => [ $T1, $T2, $T3 ][ $i % 3 ] ]; }
$r = GRSH_Rosters::post_moves( R( [], [ 'division' => 'gold_open', 'moves' => $mv, 'type' => 'auto' ] ) ); $p = D( $r );
eq( $p['move_result']['moved'], 9, '9 moved' ); eq( count( $p['pool'] ), 13, 'pool 13' );
eq( $db->get_var( "SELECT assignment_type FROM wp_grsh_rosters LIMIT 1" ), 'auto', 'auto type recorded' );
$before = $db->get_var( "SELECT COUNT(*) FROM wp_grsh_rosters" );
$sr = $db->get_var( "SELECT id FROM wp_grsh_players WHERE last_name='Decoy' AND first_name='SrB'" );
$r = GRSH_Rosters::post_moves( R( [], [ 'division' => 'gold_open', 'moves' => [ [ 'player_id' => $ids[10], 'team_id' => $T1 ], [ 'player_id' => (int) $sr, 'team_id' => $T1 ] ] ] ) );
eq( $r->status, 400, 'other-division player rejected' ); eq( $db->get_var( "SELECT COUNT(*) FROM wp_grsh_rosters" ), $before, 'nothing partially applied' );
$r = GRSH_Rosters::post_moves( R( [], [ 'division' => 'gold_open', 'moves' => [ [ 'player_id' => $ids[10], 'team_id' => 9999 ] ] ] ) ); eq( $r->status, 400, 'foreign team rejected' );
$r = GRSH_Rosters::post_moves( R( [], [ 'division' => 'gold_open', 'moves' => [] ] ) ); eq( $r->status, 400, 'empty moves 400' );
$r = GRSH_Rosters::post_moves( R( [], [ 'division' => 'gold_open', 'moves' => [ [ 'player_id' => $ids[0], 'team_id' => $T1 ] ] ] ) );
eq( D( $r )['move_result']['moved'], 0, 'no-op move counted as skipped' );

echo "4. captain\n";
$cap = D( GRSH_Rosters::get_rosters( R( [ 'division' => 'gold_open' ] ) ) )['teams'][0]['players'][0]['id'];
$r = GRSH_Rosters::set_captain( R( [], [ 'team_id' => $T1, 'player_id' => $cap ] ) ); $p = D( $r );
eq( $p['teams'][0]['captain_player_id'], $cap, 'captain set' );
$r = GRSH_Rosters::set_captain( R( [], [ 'team_id' => $T2, 'player_id' => $cap ] ) ); eq( $r->status, 400, 'captain must be on that team' );
GRSH_Rosters::post_moves( R( [], [ 'division' => 'gold_open', 'moves' => [ [ 'player_id' => $cap, 'team_id' => $T2 ] ] ] ) );
eq( D( GRSH_Rosters::get_rosters( R( [ 'division' => 'gold_open' ] ) ) )['teams'][0]['captain_player_id'], null, 'captain cleared when moved off' );

echo "5. locks + draft guard\n";
$mover = D( GRSH_Rosters::get_rosters( R( [ 'division' => 'gold_open' ] ) ) )['pool'][0]['id'];
GRSH_Rosters::update_team( R( [ 'id' => $T3 ], [ 'draft_locked' => true ] ) );
$r = GRSH_Rosters::post_moves( R( [], [ 'division' => 'gold_open', 'moves' => [ [ 'player_id' => $mover, 'team_id' => $T3 ] ] ] ) );
eq( $r->status, 409, 'cannot add to locked team' );
$t3p = D( GRSH_Rosters::get_rosters( R( [ 'division' => 'gold_open' ] ) ) )['teams'][2]['players'][0]['id'];
$r = GRSH_Rosters::post_moves( R( [], [ 'division' => 'gold_open', 'moves' => [ [ 'player_id' => $t3p, 'team_id' => null ] ] ] ) );
eq( $r->status, 409, 'cannot remove from locked team' );
GRSH_Rosters::update_team( R( [ 'id' => $T3 ], [ 'draft_locked' => false ] ) );
update_option( 'grsh_draft_state_gold_open', [ 'status' => 'active' ] );
$r = GRSH_Rosters::post_moves( R( [], [ 'division' => 'gold_open', 'moves' => [ [ 'player_id' => $mover, 'team_id' => $T3 ] ] ] ) );
eq( $r->status, 409, 'active draft blocks edits' ); ok( strpos( D( $r )['error'], 'Draft page' ) !== false, 'message points at Draft page' );
update_option( 'grsh_draft_state_gold_open', [ 'status' => 'paused' ] );
eq( GRSH_Rosters::create_team( R( [], [ 'division' => 'gold_open', 'name' => 'X' ] ) )->status, 409, 'paused draft blocks team create' );
update_option( 'grsh_draft_state_gold_open', [ 'status' => 'complete' ] );
eq( GRSH_Rosters::post_moves( R( [], [ 'division' => 'gold_open', 'moves' => [ [ 'player_id' => $mover, 'team_id' => $T3 ] ] ] ) )->status, 200, 'complete draft allows edits' );

echo "6. teams\n";
$r = GRSH_Rosters::create_team( R( [], [ 'division' => 'gold_open', 'name' => 'team gold' ] ) ); eq( $r->status, 409, 'duplicate name (case-insens) 409' );
$r = GRSH_Rosters::create_team( R( [], [ 'division' => 'gold_open', 'name' => '   ' ] ) ); eq( $r->status, 400, 'blank name 400' );
$r = GRSH_Rosters::create_team( R( [], [ 'division' => 'gold_open', 'name' => 'Team Green', 'colour' => 'javascript:x' ] ) ); eq( $r->status, 201, 'create 201' );
$gid = D( $r )['created_id']; eq( $db->get_var( "SELECT colour FROM wp_grsh_teams WHERE id=$gid" ), '#666666', 'bad colour sanitised' );
eq( (int) $db->get_var( "SELECT draft_order FROM wp_grsh_teams WHERE id=$gid" ), 4, 'draft order appended' );
$r = GRSH_Rosters::update_team( R( [ 'id' => $gid ], [ 'name' => 'Team Gold' ] ) ); eq( $r->status, 409, 'rename to existing 409' );
$r = GRSH_Rosters::update_team( R( [ 'id' => $gid ], [] ) ); eq( $r->status, 400, 'empty patch 400' );
GRSH_Rosters::post_moves( R( [], [ 'division' => 'gold_open', 'moves' => [ [ 'player_id' => $mover, 'team_id' => $gid ] ] ] ) );
$r = GRSH_Rosters::delete_team( R( [ 'id' => $gid ] ) ); eq( $r->status, 409, 'delete non-empty needs force' ); eq( D( $r )['players'], 1, 'reports player count' );
$r = GRSH_Rosters::delete_team( R( [ 'id' => $gid, 'force' => 1 ] ) ); eq( $r->status, 200, 'force delete ok' );
ok( in_array( $mover, array_column( D( $r )['pool'], 'id' ), true ), 'player back in pool after team delete' );

echo "7. pins + gate\n";
$all = D( GRSH_Rosters::get_rosters( R( [ 'division' => 'gold_open' ] ) ) );
$x = $all['teams'][0]['players'][0]['id']; $y = $all['teams'][0]['players'][1]['id'];
$r = GRSH_Rosters::save_pins( R( [], [ 'division' => 'gold_open', 'pins' => [ [ 'a' => $x, 'b' => $y, 'type' => 'apart' ], [ 'a' => $y, 'b' => $x, 'type' => 'apart' ], [ 'a' => $x, 'b' => $x, 'type' => 'together' ], [ 'a' => 1, 'b' => 2, 'type' => 'bogus' ] ] ] ) );
eq( count( D( $r )['pins'] ), 1, 'pins deduped/invalid dropped' );
ok( (bool) array_filter( D( $r )['gate'], function ( $c ) { return $c['key'] === 'pins'; } ), 'gate reports broken apart rule' );

echo "8. plans\n";
$r = GRSH_Rosters::save_plan( R( [], [ 'division' => 'gold_open', 'name' => 'Plan A' ] ) ); $p = D( $r ); eq( count( $p['plans'] ), 1, 'plan saved' );
$snapA = $db->get_results( "SELECT player_id, team_id FROM wp_grsh_rosters ORDER BY player_id" );
$pid = $p['plans'][0]['id'];
GRSH_Rosters::post_moves( R( [], [ 'division' => 'gold_open', 'moves' => [ [ 'player_id' => $x, 'team_id' => $T3 ], [ 'player_id' => $y, 'team_id' => null ] ] ] ) );
$r = GRSH_Rosters::restore_plan( R( [], [ 'division' => 'gold_open', 'plan_id' => $pid ] ) );
eq( $r->status, 200, 'restore ok' );
eq( $db->get_results( "SELECT player_id, team_id FROM wp_grsh_rosters ORDER BY player_id" ), $snapA, 'restore reproduces snapshot exactly' );
for ( $i = 0; $i < 14; $i++ ) { GRSH_Rosters::save_plan( R( [], [ 'division' => 'gold_open', 'name' => "P$i" ] ) ); }
eq( count( D( GRSH_Rosters::get_rosters( R( [ 'division' => 'gold_open' ] ) ) )['plans'] ), 12, 'plans capped at 12' );
eq( GRSH_Rosters::restore_plan( R( [], [ 'division' => 'gold_open', 'plan_id' => 'deadbeef' ] ) )->status, 404, 'missing plan 404' );
$pl = D( GRSH_Rosters::get_rosters( R( [ 'division' => 'gold_open' ] ) ) )['plans'][0]['id'];
eq( count( D( GRSH_Rosters::delete_plan( R( [ 'plan_id' => $pl, 'division' => 'gold_open' ] ) ) )['plans'] ), 11, 'plan deleted' );

echo "9. publish gate + review\n";
$r = GRSH_Rosters::publish( R( [], [ 'division' => 'gold_open' ] ) ); eq( $r->status, 409, 'publish blocked while teams open' );
$fill = D( GRSH_Rosters::get_rosters( R( [ 'division' => 'gold_open' ] ) ) );
$mv = []; $k = 0; foreach ( $fill['pool'] as $pl ) { $mv[] = [ 'player_id' => $pl['id'], 'team_id' => [ $T1, $T2, $T3 ][ $k++ % 3 ] ]; }
GRSH_Rosters::post_moves( R( [], [ 'division' => 'gold_open', 'moves' => $mv ] ) );
$p = D( GRSH_Rosters::get_rosters( R( [ 'division' => 'gold_open' ] ) ) );
eq( count( $p['pool'] ), 0, 'everyone placed' );
// goalie check: strip goalies from team 2 to prove a fail
$g2 = array_values( array_filter( $p['teams'][1]['players'], function ( $x ) { return $x['is_goalie']; } ) );
if ( $g2 ) { GRSH_Rosters::post_moves( R( [], [ 'division' => 'gold_open', 'moves' => [ [ 'player_id' => $g2[0]['id'], 'team_id' => $T1 ] ] ] ) ); }
$p = D( GRSH_Rosters::get_rosters( R( [ 'division' => 'gold_open' ] ) ) );
$goalie_chk = array_values( array_filter( $p['gate'], function ( $c ) { return $c['key'] === 'goalies'; } ) );
$has_goalie_fail = $goalie_chk && $goalie_chk[0]['level'] === 'fail';
echo "   (goalie gate level: " . ( $goalie_chk ? $goalie_chk[0]['level'] : 'none' ) . ")\n";
// review link
$r = GRSH_Rosters::toggle_review( R( [], [ 'division' => 'gold_open', 'enable' => true ] ) ); $p = D( $r );
ok( $p['review']['active'] && preg_match( '/grsh_roster_review=[a-f0-9]{24}/', $p['review']['url'] ), 'review url' ); eq( $p['stage'], 'review', 'stage review' );
preg_match( '/=([a-f0-9]{24})/', $p['review']['url'], $m ); $key = $m[1];
$f = GRSH_Rosters::review_feedback( R( [], [ 'key' => $key, 'team_id' => $T1, 'action' => 'approve', 'name' => 'Dana <b>M</b>' ] ) ); eq( $f->status, 200, 'approve ok' );
GRSH_Rosters::review_feedback( R( [], [ 'key' => $key, 'team_id' => $T1, 'action' => 'approve', 'name' => 'dana m' ] ) );
$f = GRSH_Rosters::review_feedback( R( [], [ 'key' => $key, 'team_id' => $T2, 'action' => 'comment', 'name' => 'Lee', 'text' => '<script>x</script>Too strong' ] ) ); eq( $f->status, 200, 'comment ok' );
$p = D( GRSH_Rosters::get_rosters( R( [ 'division' => 'gold_open' ] ) ) );
eq( count( $p['review']['approvals'][ $T1 ] ), 1, 'approval deduped by name (case-insens)' );
ok( strpos( $p['review']['comments'][0]['text'], '<' ) === false, 'comment stripped of tags' );
eq( GRSH_Rosters::review_feedback( R( [], [ 'key' => 'zz', 'action' => 'approve', 'name' => 'x' ] ) )->status, 404, 'bad key 404' );
eq( GRSH_Rosters::review_feedback( R( [], [ 'key' => $key, 'team_id' => 999, 'action' => 'approve', 'name' => 'x' ] ) )->status, 400, 'unknown team 400' );
eq( GRSH_Rosters::review_feedback( R( [], [ 'key' => $key, 'team_id' => $T1, 'action' => 'comment', 'name' => 'x', 'text' => '' ] ) )->status, 400, 'empty comment 400' );
eq( GRSH_Rosters::review_feedback( R( [], [ 'key' => $key, 'team_id' => $T1, 'action' => 'approve', 'name' => '' ] ) )->status, 400, 'missing name 400' );
for ( $i = 0; $i < 25; $i++ ) { $last = GRSH_Rosters::review_feedback( R( [], [ 'key' => $key, 'team_id' => $T1, 'action' => 'comment', 'name' => 'Spam', 'text' => 'hi' ] ) ); }
eq( $last->status, 429, 'rate limited' );
$p = D( GRSH_Rosters::toggle_review( R( [], [ 'division' => 'gold_open', 'enable' => false ] ) ) );
ok( ! $p['review']['active'], 'review off' ); eq( GRSH_Rosters::review_feedback( R( [], [ 'key' => $key, 'action' => 'approve', 'name' => 'x' ] ) )->status, 404, 'revoked link dead' );

echo "10. publish\n";
foreach ( [ $T1, $T2, $T3 ] as $tid ) { GRSH_Rosters::update_team( R( [ 'id' => $tid ], [ 'draft_locked' => true ] ) ); }
$p = D( GRSH_Rosters::get_rosters( R( [ 'division' => 'gold_open' ] ) ) ); eq( $p['stage'], 'locked', 'stage locked' );
$r = GRSH_Rosters::publish( R( [], [ 'division' => 'gold_open' ] ) );
if ( $has_goalie_fail ) { eq( $r->status, 409, 'publish blocked: team without goalie' ); echo "   (blocked by gate as expected; fixing goalies)\n";
    foreach ( $p['teams'] as $t ) { if ( ! array_filter( $t['players'], function ( $x ) { return $x['is_goalie']; } ) ) { $mid = $t['id']; } }
    GRSH_Rosters::update_team( R( [ 'id' => $T1 ], [ 'draft_locked' => false ] ) ); GRSH_Rosters::update_team( R( [ 'id' => $mid ], [ 'draft_locked' => false ] ) );
    $g = array_values( array_filter( D( GRSH_Rosters::get_rosters( R( [ 'division' => 'gold_open' ] ) ) )['teams'][0]['players'], function ( $x ) { return $x['is_goalie']; } ) );
    GRSH_Rosters::post_moves( R( [], [ 'division' => 'gold_open', 'moves' => [ [ 'player_id' => $g[0]['id'], 'team_id' => $mid ] ] ] ) );
    foreach ( [ $T1, $mid ] as $tid ) { GRSH_Rosters::update_team( R( [ 'id' => $tid ], [ 'draft_locked' => true ] ) ); }
    $r = GRSH_Rosters::publish( R( [], [ 'division' => 'gold_open' ] ) ); }
eq( $r->status, 200, 'publish ok once gate passes' ); $pr = D( $r )['publish_result'];
eq( $pr['sent'], 22, '22 emails sent' ); eq( count( $GLOBALS['mails'] ), 22, 'wp_mail called 22x' ); ok( strpos( $GLOBALS['mails'][0][2], 'grsh_roster_pub=' ) !== false, 'email has results link' );
eq( D( $r )['stage'], 'published', 'stage published' );
eq( GRSH_Rosters::publish( R( [], [ 'division' => 'gold_open' ] ) )->status, 409, 'second publish refused' );
eq( GRSH_Rosters::publish( R( [], [ 'division' => 'gold_open', 'resend' => true ] ) )->status, 200, 'resend allowed' );

echo "11. sportspress dry run\n";
eq( D( GRSH_Rosters::sportspress_preview( R( [ 'division' => 'gold_open' ] ) ) )['available'], false, 'unavailable without SportsPress' );
$GLOBALS['post_types'] = [ 'sp_team', 'sp_player' ];
$db->insert( 'wp_posts', [ 'post_type' => 'sp_team', 'post_status' => 'publish', 'post_title' => 'team gold' ] );
$db->insert( 'wp_posts', [ 'post_type' => 'sp_player', 'post_status' => 'publish', 'post_title' => 'Ann Skate0' ] );
$sp = D( GRSH_Rosters::sportspress_preview( R( [ 'division' => 'gold_open' ] ) ) );
ok( $sp['available'] && $sp['dry_run'], 'dry run flag' ); eq( $sp['unmatched_teams'], 2, '2 unmatched teams' ); eq( $sp['unmatched_players'], 21, '21 unmatched players' );
eq( (int) $db->get_var( "SELECT COUNT(*) FROM wp_posts" ), 2, 'dry run wrote nothing' );

echo "12. audit trail + payload privacy\n";
ok( (int) $db->get_var( "SELECT COUNT(*) FROM wp_grsh_audit_logs WHERE object_type='roster'" ) > 10, 'audit rows written' );
$pj = json_encode( D( GRSH_Rosters::get_rosters( R( [ 'division' => 'gold_open' ] ) ) ) );
ok( strpos( $pj, '@x.test' ) === false, 'no emails in admin payload' );

echo "\n$pass passed, $fail failed\n";
exit( $fail ? 1 : 0 );
