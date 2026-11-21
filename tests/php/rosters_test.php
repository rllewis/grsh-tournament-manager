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

echo "7b. player locks (stay put)\n";
$poolp = D( GRSH_Rosters::get_rosters( R( [ 'division' => 'gold_open' ] ) ) )['pool'][0]['id'];
$r = GRSH_Rosters::save_locks( R( [], [ 'division' => 'gold_open', 'locks' => [ $x, $x, $poolp, 0 ] ] ) ); $pl7 = D( $r );
eq( $r->status, 200, 'save locks 200' ); eq( $pl7['locks'], [ $x ], 'only the player on a team is held, duplicates and pool players dropped' );
$teamx = $db->get_var( "SELECT team_id FROM wp_grsh_rosters WHERE player_id = $x" );
$r = GRSH_Rosters::post_moves( R( [], [ 'division' => 'gold_open', 'moves' => [ [ 'player_id' => $x, 'team_id' => $T3 ] ] ] ) );
eq( $r->status, 409, 'moving a locked player is refused' ); ok( strpos( $r->data['error'] ?? $r->data['message'] ?? json_encode( $r->data ), 'locked' ) !== false, 'with a plain reason' );
eq( $db->get_var( "SELECT team_id FROM wp_grsh_rosters WHERE player_id = $x" ), $teamx, 'and nothing moved' );
$r = GRSH_Rosters::post_moves( R( [], [ 'division' => 'gold_open', 'moves' => [ [ 'player_id' => $x, 'team_id' => null ] ] ] ) ); eq( $r->status, 409, 'sending a locked player to the pool is refused too' );
$r = GRSH_Rosters::post_moves( R( [], [ 'division' => 'gold_open', 'moves' => [ [ 'player_id' => $y, 'team_id' => (int) $teamx ] ] ] ) ); eq( $r->status, 200, 'other players still move' );
$r = GRSH_Rosters::save_locks( R( [], [ 'division' => 'nope', 'locks' => [ $x ] ] ) ); eq( $r->status, 400, 'unknown division 400' );
ok( (bool) $db->get_var( "SELECT COUNT(*) FROM wp_grsh_audit_logs WHERE action = 'roster_locks'" ), 'lock change is audited' );
$r = GRSH_Rosters::save_locks( R( [], [ 'division' => 'gold_open', 'locks' => [] ] ) ); eq( D( $r )['locks'], [], 'unlock clears the lock' );
$r = GRSH_Rosters::post_moves( R( [], [ 'division' => 'gold_open', 'moves' => [ [ 'player_id' => $y, 'team_id' => $T1 ] ] ] ) ); eq( $r->status, 200, 'move allowed again' );
update_option( 'grsh_roster_plocks_gold_open', [ $poolp ], false );   // a stale lock on someone no longer on a team
eq( D( GRSH_Rosters::get_rosters( R( [ 'division' => 'gold_open' ] ) ) )['locks'], [], 'a stale lock on a player who is not on a team is ignored' );
GRSH_Rosters::save_locks( R( [], [ 'division' => 'gold_open', 'locks' => [] ] ) );

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


echo "13. publish preview and activity feed\n";
$GLOBALS['mails'] = []; $meta_before = json_encode( D( GRSH_Rosters::get_rosters( R( [ 'division' => 'gold_open' ] ) ) )['published'] );
$pv = GRSH_Rosters::publish_preview( R( [ 'division' => 'gold_open' ] ) ); $pd = D( $pv );
eq( $pv->status, 200, 'preview 200' ); ok( $pd['dry_run'] === true, 'marked dry run' );
ok( $pd['will_send'] > 0 && count( $pd['recipients'] ) === min( 60, $pd['will_send'] ), 'recipients listed' );
ok( strpos( json_encode( $pd ), '@x.test' ) !== false && ! preg_match( '/[a-z]{2,}[a-z0-9]*@x\.test/i', json_encode( $pd['recipients'] ) ), 'emails are masked (first letter and domain only)' );
ok( $pd['sample_subject'] !== '' && strpos( $pd['sample_subject'], 'you\'re on' ) !== false, 'sample subject' );
eq( $GLOBALS['mails'], [], 'preview sends nothing' ); eq( json_encode( D( GRSH_Rosters::get_rosters( R( [ 'division' => 'gold_open' ] ) ) )['published'] ), $meta_before, 'preview changes no publish state' );
$pd2 = D( GRSH_Rosters::publish_preview( R( [ 'division' => 'gold_open' ] ) ) );
$bad_one = $db->get_var( "SELECT p.id FROM wp_grsh_players p JOIN wp_grsh_rosters r ON r.player_id = p.id LIMIT 1" );
$db->pdo->exec( "UPDATE wp_grsh_players SET email = 'broken' WHERE id = " . (int) $bad_one );
$pd3 = D( GRSH_Rosters::publish_preview( R( [ 'division' => 'gold_open' ] ) ) );
eq( $pd3['will_skip'], $pd2['will_skip'] + 1, 'a player with a bad address is listed as skipped' ); ok( $pd3['skipped'][0]['reason'] === 'no valid email address', 'with the reason' );
eq( GRSH_Rosters::publish_preview( R( [ 'division' => 'nope' ] ) )->status, 400, 'unknown division' );

$ac = GRSH_Rosters::activity( R( [ 'division' => 'gold_open' ] ) ); $ad = D( $ac );
eq( $ac->status, 200, 'activity 200' ); ok( count( $ad['items'] ) > 3 && isset( $ad['items'][0]['title'], $ad['items'][0]['by'], $ad['items'][0]['at'] ), 'activity lists changes with title, who and when' );
ok( in_array( 'Players moved', array_column( $ad['items'], 'title' ), true ), 'moves are titled' );
eq( $ad['changes_since_publish'], 0, 'nothing changed since publish yet' );
$db->pdo->exec( "INSERT INTO wp_grsh_audit_logs (season_id, user_display, action, object_type, after_value, notes, created_at) VALUES (" . (int) D( GRSH_Rosters::get_rosters( R( [ 'division' => 'gold_open' ] ) ) )['season_id'] . ", 'Tester', 'roster_moves', 'roster', '{\"division\":\"gold_open\",\"moved\":1}', 'late move', '2099-01-01 00:00:00')" );
eq( D( GRSH_Rosters::activity( R( [ 'division' => 'gold_open' ] ) ) )['changes_since_publish'], 1, 'a move after publishing is counted' );
eq( D( GRSH_Rosters::get_rosters( R( [ 'division' => 'gold_open' ] ) ) )['changes_since_publish'], 1, 'and shown in the main payload' );
eq( D( GRSH_Rosters::activity( R( [ 'division' => '45a' ] ) ) )['items'], [], 'another division sees none of it' );
$pl = D( GRSH_Rosters::get_rosters( R( [ 'division' => 'gold_open' ] ) ) )['plans']; ok( ! $pl || isset( $pl[0]['assign'] ), 'plans carry their assignment for comparing' );
foreach ( [ 'publish-preview', 'activity' ] as $rt ) { GRSH_Rosters::register_routes(); ok( isset( $GLOBALS['routes'][ 'grsh/v1/rosters/' . $rt ] ), "route $rt registered" ); }

echo "14. Board summary (counts only)\n";
if ( ! function_exists( 'rest_ensure_response' ) ) { function rest_ensure_response( $d ) { return new WP_REST_Response( $d, 200 ); } }
if ( ! function_exists( 'admin_url' ) ) { function admin_url( $p = '' ) { return 'https://x.test/wp-admin/' . $p; } }
require __DIR__ . '/../../includes/class-grsh-board-summary.php';
$full = D( GRSH_Rosters::get_rosters( R( [ 'division' => 'gold_open' ] ) ) );
$ovg  = array_column( $full['divisions'], null, 'key' )['gold_open'];
$bs   = GRSH_Board_Summary::build(); $by14 = array_column( $bs['divisions'], null, 'key' );
ok( isset( $by14['gold_open'] ), 'gold_open row present' ); $g = $by14['gold_open'];
eq( [ $g['on_teams'], $g['in_draft'] ], [ $ovg['assigned'], $ovg['total'] ], 'on-teams and in-draft match the Rosters tab' );
eq( $g['in_pool'], $g['in_draft'] - $g['on_teams'], 'pool is the rest of the draft' );
eq( $g['teams_created'], count( $full['teams'] ), 'teams created match the Rosters page' );
eq( $g['name'], $full['division_label'], 'name matches the Rosters tab label' );
ok( $g['registered'] >= $g['paid'] && $g['unpaid'] === $g['registered'] - $g['paid'], 'paid + unpaid add up to registered' );
eq( $g['stage'], 'Published', 'stage reflects the published roster' );
ok( $g['capacity'] === 0 || abs( $g['fill_pct'] - round( $g['registered'] / $g['capacity'] * 100, 1 ) ) < 0.01, 'fill percent follows capacity' );
eq( $bs['totals']['teams_created'], array_sum( array_column( $bs['divisions'], 'teams_created' ) ), 'totals add the divisions' );
eq( $bs['totals']['registered'], array_sum( array_column( $bs['divisions'], 'registered' ) ), 'registered total adds up' );
ok( isset( $bs['generated_at'], $bs['season'], $bs['admin_link'] ), 'has timestamp, season and admin link' );
$json = json_encode( $bs ); $leak = false;
foreach ( array_keys( $by_last ) as $ln ) { if ( $ln !== '' && stripos( $json, '"' . $ln ) !== false || stripos( $json, $ln . '"' ) !== false ) { $leak = true; } }
ok( strpos( $json, '@' ) === false && ! $leak, 'no emails and no player names in the summary' );
$GLOBALS['user_can'] = false; ok( GRSH_Board_Summary::can_view() === false, 'people without access are refused' ); $GLOBALS['user_can'] = true;
ok( GRSH_Board_Summary::can_view() === true, 'admins and board viewers are allowed' );
GRSH_Board_Summary::register_routes(); ok( isset( $GLOBALS['routes']['grsh/v1/tournament/board-summary'] ), 'route registered' );

echo "15. Treasurer money snapshot\n";
global $wpdb;
$wpdb->pdo->exec( "UPDATE wp_grsh_registrations SET amount_paid = 125 WHERE season_id = 1 AND payment_status = 'paid'" );
$wpdb->pdo->exec( "UPDATE wp_grsh_registrations SET amount_paid = 0, payment_status = 'waived' WHERE id = (SELECT MIN(id) FROM wp_grsh_registrations WHERE season_id = 1 AND payment_status = 'paid')" );
$wpdb->pdo->exec( "INSERT INTO wp_grsh_teams (season_id, division, team_type, name, fee_total, deposit_amount, deposit_paid_at, balance_due, payment_status) VALUES
  (1,'gold_open','full_team','Reg A',1750,500,'2026-10-01',1250,'deposit_paid'),
  (1,'gold_open','full_team','Reg B',1750,500,'2026-10-02',0,'paid_in_full'),
  (1,'gold_open','full_team','Reg C',NULL,NULL,NULL,NULL,'unpaid')" );
$m  = GRSH_Board_Summary::build()['money']; $mg = array_column( $m['divisions'], null, 'key' )['gold_open'];
$exp_paid = (int) $wpdb->get_var( "SELECT COUNT(*) FROM wp_grsh_registrations WHERE season_id=1 AND status<>'rejected' AND payment_status='paid' AND division_requested IN ('gold_open')" );
eq( $mg['players_paid'], $exp_paid, 'paid player count matches registrations' );
eq( $mg['players_collected'], round( $exp_paid * 125, 2 ), 'player money = paid registrations only (waived adds nothing)' );
ok( $mg['players_waived'] === 1, 'waived player counted, not as money' );
eq( [ $mg['teams'], $mg['teams_deposit_paid'], $mg['teams_paid_full'] ], [ 3, 2, 1 ], 'team counts: made, deposit paid, paid in full' );
eq( $mg['teams_collected'], 2250.0, 'team money = deposit + full fee (500 + 1750)' );
eq( $mg['teams_outstanding'], 1250.0, 'team balance still owed' );
eq( $m['total_collected'], round( $m['players_collected'] + $m['teams_collected'], 2 ), 'total adds players and teams' );
eq( $m['players_collected'], round( array_sum( array_column( $m['divisions'], 'players_collected' ) ), 2 ), 'player total adds the divisions' );
$json = json_encode( GRSH_Board_Summary::build() );
ok( strpos( $json, '@' ) === false && stripos( $json, 'Reg A' ) === false && stripos( $json, 'Skate' ) === false, 'money block has no emails, team names or player names' );

echo "\n$pass passed, $fail failed\n";
exit( $fail ? 1 : 0 );
