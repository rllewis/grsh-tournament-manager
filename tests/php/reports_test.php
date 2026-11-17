<?php
// GRSH_Reports_Tools (+ the patched GRSH_Reports) against the SQLite shim. Usage: php reports_test.php [tools-class] [reports-class]
require __DIR__ . '/harness.php';
require $argv[2] ?? __DIR__ . '/../../includes/class-grsh-reports.php';
require $argv[1] ?? __DIR__ . '/../../includes/class-grsh-reports-tools.php';
$pass = 0; $fail = 0;
function ok( $c, $m ) { global $pass, $fail; if ( $c ) { $pass++; } else { $fail++; echo "  FAIL: $m\n"; } }
function eq( $a, $b, $m ) { ok( $a === $b, $m . ' (got ' . json_encode( $a ) . ', want ' . json_encode( $b ) . ')' ); }
function req( $params = [], $body = [] ) { return new WP_REST_Request( $params, $body ); }
function dat( $r ) { return $r->data; }

$db = fresh_db( sys_get_temp_dir() . '/grsh_rep.sqlite' );
$db->pdo->exec( "ALTER TABLE wp_grsh_registrations ADD COLUMN division_assigned TEXT; ALTER TABLE wp_grsh_registrations ADD COLUMN amount_paid REAL DEFAULT 0; ALTER TABLE wp_grsh_registrations ADD COLUMN created_at TEXT;
                 ALTER TABLE wp_grsh_teams ADD COLUMN skill_score REAL; ALTER TABLE wp_grsh_teams ADD COLUMN age_score REAL; ALTER TABLE wp_grsh_teams ADD COLUMN parity_score REAL;
                 ALTER TABLE wp_grsh_audit_logs ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP;" );
$GLOBALS['user_can'] = true;

echo "1. empty season: nothing measurable, nothing invented\n";
$d = GRSH_Reports_Tools::data();
eq( $d['totals']['registered'], 0, 'no registrations' );
eq( $d['payments']['pct_paid'], null, 'pct paid is null, not 0' );
eq( $d['payments']['fee'], null, 'no fee known' );
eq( $d['verdict']['level'], 'empty', 'verdict empty' );
eq( $d['forecast']['projected'], null, 'no forecast' );
eq( $d['since'], null, 'no previous snapshot' );
ok( $d['payments']['adds_up'], 'empty breakdown adds up' );
ok( strpos( $d['summary_text'], 'No players have registered' ) === 0, 'summary says nobody registered' );

echo "2. seeded season\n";
seed_players( $db );
$db->pdo->exec( "UPDATE wp_grsh_registrations SET amount_paid = 200 WHERE payment_status = 'paid'" );
for ( $i = 1; $i <= 27; $i++ ) { $db->pdo->exec( "UPDATE wp_grsh_registrations SET created_at = '" . gmdate( 'Y-m-d H:i:s', time() - ( $i % 20 ) * 86400 ) . "' WHERE id = $i" ); }
$d = GRSH_Reports_Tools::data();
$p = $d['payments'];
eq( $d['totals']['registered'], 26, '26 primary active (sub excluded)' );
eq( $d['totals']['subs'], 1, 'sub counted apart' );
eq( $p['breakdown']['paid'], 25, '25 paid' );
eq( $p['unpaid'], 1, '1 unpaid' );
ok( $p['adds_up'], 'breakdown adds up to registered' );
eq( array_sum( $p['breakdown'] ), $d['totals']['registered'], 'paid+waived+pending+failed+refunded = registered' );
eq( $p['fee'], 200.0, 'fee estimated from what players paid' ); eq( $p['fee_source'], 'estimated', 'source says estimated' );
eq( $p['owed'], 200.0, 'owed = fee for the one unpaid' ); eq( $p['collected'], 5000.0, 'collected is the sum actually paid' );
eq( $p['pct_paid'], 96, '25/26 = 96%' );
$by = []; foreach ( $d['divisions'] as $x ) { $by[ $x['key'] ] = $x; }
eq( $by['gold_open']['registered'], 24, 'gold_open: 22 + Alt + Rej' ); eq( $by['gold_open']['unpaid'], 1, 'gold unpaid' ); eq( $by['gold_open']['subs'], 1, 'gold sub' );
eq( $by['gold_open']['min_needed'], 21, 'min needed 3 x 7' ); eq( $by['gold_open']['capacity'], 36, 'capacity 3 x 12' );
eq( array_sum( $by['gold_open']['tiers'] ), 24, 'tier mix sums to registered' );
eq( $by['gold_open']['age']['n'], 24, 'age counted for all with an age' );
ok( isset( $by['o45_a'] ) && $by['o45_a']['configured'] === false, 'unconfigured division is shown, flagged not configured' );
eq( array_sum( array_map( function ( $x ) { return $x['registered']; }, $d['divisions'] ) ), 26, 'divisions add up to the total' );
eq( $d['totals']['sandbagging'], 1, 'sandbagging counted from players' );
eq( count( $d['unpaid'] ), 1, 'unpaid list' ); eq( $d['unpaid'][0]['owes'], 200.0, 'row owes the fee' ); ok( $d['unpaid'][0]['has_email'] && $d['unpaid'][0]['can_remind'], 'has email and can be reminded' );

echo "3. withdrawn drops out of every count; fee set; partial payment\n";
$db->pdo->exec( "UPDATE wp_grsh_registrations SET status='withdrawn' WHERE id = 1" );
$d = GRSH_Reports_Tools::data(); eq( $d['totals']['registered'], 25, 'withdrawn not counted' ); eq( $d['totals']['inactive'], 1, 'inactive tracked' );
$r = GRSH_Reports_Tools::post_fee( req( [], [ 'fee' => '150' ] ) ); eq( dat( $r )['payments']['fee'], 150.0, 'fee set' ); eq( dat( $r )['payments']['fee_source'], 'set', 'source set' ); eq( dat( $r )['payments']['owed'], 150.0, 'owed uses set fee' );
$db->pdo->exec( "UPDATE wp_grsh_registrations SET amount_paid = 50 WHERE payment_status = 'pending'" );
eq( GRSH_Reports_Tools::data()['payments']['owed'], 100.0, 'partial payment reduces what is owed' );
eq( dat( GRSH_Reports_Tools::post_fee( req( [], [ 'fee' => 'abc' ] ) ) )['error'] !== null, true, 'bad fee rejected' );
eq( GRSH_Reports_Tools::post_fee( req( [], [ 'fee' => '0' ] ) )->status, 400, 'zero fee rejected' );
eq( GRSH_Reports_Tools::post_fee( req( [], [ 'fee' => '99999' ] ) )->status, 400, 'absurd fee rejected' );
$r = GRSH_Reports_Tools::post_fee( req( [], [ 'fee' => '' ] ) ); eq( dat( $r )['payments']['fee_source'], 'estimated', 'cleared fee falls back to estimate' );
$db->pdo->exec( "UPDATE wp_grsh_registrations SET amount_paid = 0" );   // nobody paid anything, no fee set
$d = GRSH_Reports_Tools::data(); eq( $d['payments']['fee'], null, 'no fee when nothing paid and none set' ); eq( $d['payments']['owed'], null, 'owed unknown, not $0' );
ok( strpos( $d['summary_text'], '$0' ) === false, 'summary never prints a made-up $0' );
$db->pdo->exec( "UPDATE wp_grsh_registrations SET amount_paid = 200 WHERE payment_status = 'paid'; UPDATE wp_grsh_registrations SET status='registered' WHERE id = 1" );

echo "4. teams, goalies, parity, issues\n";
$db->pdo->exec( "UPDATE wp_grsh_teams SET skill_score=70, age_score=72, parity_score=72 WHERE id IN (1,2); UPDATE wp_grsh_teams SET skill_score=50, age_score=50, parity_score=55 WHERE id = 3" );
$db->pdo->exec( "INSERT INTO wp_grsh_rosters (season_id, team_id, player_id) VALUES (1,1,1),(1,2,10),(1,1,2),(1,3,3)" );   // goalies 1 and 10 placed; team 3 has no goalie
$d = GRSH_Reports_Tools::data(); $by = []; foreach ( $d['divisions'] as $x ) { $by[ $x['key'] ] = $x; }
eq( $d['totals']['teams'], 3, '3 teams' ); eq( $d['totals']['teams_no_goalie'], 1, 'one team has no goalie' ); eq( $d['teams_no_goalie'][0]['team'], 'Team Red', 'it is Team Red' );
eq( $d['totals']['goalies_unplaced'], 1, 'one registered goalie is not on a roster' );
eq( $by['gold_open']['avg_parity'], 66.3, 'average parity of the three teams' );
$ids = array_column( $d['issues'], 'id' ); $sev = []; foreach ( $d['issues'] as $i ) { $sev[ $i['id'] ] = $i['severity']; }
ok( (bool) preg_grep( '/^goalie_gold_open_/', $ids ), 'goalie issue present' ); ok( (bool) preg_grep( '/^par_gold_open/', $ids ), 'rebalance issue present (55 is outside 60-85)' ); ok( in_array( 'unpaid', $ids, true ), 'unpaid issue present' );
eq( $d['issues'][0]['severity'], 'high', 'issues sorted worst first' ); eq( $d['verdict']['level'], 'blocked', 'verdict blocked while a team has no goalie' );
foreach ( $d['issues'] as $i ) { ok( ! empty( $i['fix'] ) && ! empty( $i['fix']['label'] ), 'every issue has a fix: ' . $i['id'] ); }
$gi = null; foreach ( $d['issues'] as $i ) { if ( strpos( $i['id'], 'goalie_' ) === 0 ) { $gi = $i; } } ok( strpos( $gi['detail'], '1 registered goalie is not on a roster' ) !== false, 'goalie issue names the unplaced goalie' );

echo "5. forecast is honest\n";
$d = GRSH_Reports_Tools::data(); $f = $d['forecast'];
if ( $d['registration']['days_to_close'] !== null && $d['registration']['days_to_close'] >= 0 ) {
    ok( $f['projected'] !== null && $f['per_day'] > 0, 'projects with 10+ registrations over 7+ days' );
    ok( $f['projected'] >= $d['totals']['registered'], 'projection is never below what is registered' );
} else { ok( $f['projected'] === null && $f['reason'] !== '', 'closed or no date: says why it cannot project' ); }
$few = GRSH_Reports_Tools::data(); $db->pdo->exec( "UPDATE wp_grsh_registrations SET status = 'withdrawn' WHERE id > 5" );
$d = GRSH_Reports_Tools::data(); eq( $d['forecast']['projected'], null, 'too few registrations: no projection' ); ok( $d['forecast']['reason'] !== '', 'and it says why' );
$db->pdo->exec( "UPDATE wp_grsh_registrations SET status = 'registered' WHERE id > 5 AND id <= 22" );

echo "6. snapshots: change since last time, history\n";
delete_option( GRSH_Reports_Tools::SNAP_OPT );
$d = GRSH_Reports_Tools::data( true ); eq( count( $d['history'] ), 1, 'first visit records a snapshot' ); eq( $d['since'], null, 'but nothing to compare to yet' );
GRSH_Reports_Tools::data( true ); eq( count( get_option( GRSH_Reports_Tools::SNAP_OPT ) ), 1, 'a second visit within 6 hours adds nothing' );
update_option( GRSH_Reports_Tools::SNAP_OPT, [ [ 'ts' => time() - 3 * 86400, 'registered' => 10, 'paid' => 8, 'unpaid' => 2, 'collected' => 1600, 'goalies' => 2, 'no_goalie' => 2 ] ] );
$d = GRSH_Reports_Tools::data( true ); eq( $d['since']['days'], 3, 'compares with the snapshot from 3 days ago' ); eq( $d['since']['registered'], $d['totals']['registered'] - 10, 'registered change' ); eq( $d['since']['unpaid'], $d['payments']['unpaid'] - 2, 'unpaid change' );
eq( count( $d['history'] ), 2, 'history now has 2 entries, newest first' ); ok( $d['history'][0]['at'] >= $d['history'][1]['at'], 'newest first' );
GRSH_Reports_Tools::data( false ); eq( count( get_option( GRSH_Reports_Tools::SNAP_OPT ) ), 2, 'record=false never writes' );

echo "7. exports\n";
foreach ( array_keys( GRSH_Reports_Tools::EXPORTS ) as $id ) { $e = GRSH_Reports_Tools::build_export( $id ); ok( $e !== null && strpos( $e['csv'], "\xEF\xBB\xBF" ) === 0 && preg_match( '/^grsh-' . $id . '-2027-\d{4}-\d{2}-\d{2}\.csv$/', $e['filename'] ), "export $id builds with BOM and dated filename" ); }
eq( GRSH_Reports_Tools::build_export( 'nope' ), null, 'unknown export is null' ); eq( GRSH_Reports_Tools::get_export( req( [ 'id' => 'nope' ] ) )->status, 404, 'unknown export is a 404' );
$e = GRSH_Reports_Tools::build_export( 'players' ); eq( $e['rows'], (int) $db->get_var( "SELECT COUNT(*) FROM wp_grsh_registrations WHERE season_id = 1 AND status NOT IN ('withdrawn','waitlist')" ), 'players export = every active registration (subs included, withdrawn out)' );
$db->pdo->exec( "UPDATE wp_grsh_players SET first_name = '=HYPERLINK(\"x\")' WHERE id = 2" );
$e = GRSH_Reports_Tools::build_export( 'players' ); ok( strpos( $e['csv'], "\"'=HYPERLINK" ) !== false && strpos( $e['csv'], '"=HYPERLINK' ) === false, 'formula injection is defused' );
$db->pdo->exec( "UPDATE wp_grsh_players SET first_name = 'Bob, \"The\" Skate' WHERE id = 2" );
ok( strpos( GRSH_Reports_Tools::build_export( 'players' )['csv'], '"Bob, ""The"" Skate"' ) !== false, 'commas and quotes are escaped' );
$u = GRSH_Reports_Tools::build_export( 'unpaid' ); eq( $u['rows'], 1, 'unpaid export one row' );
$a0 = (int) $db->get_var( "SELECT COUNT(*) FROM wp_grsh_audit_logs WHERE action = 'report_exported'" ); GRSH_Reports_Tools::get_export( req( [ 'id' => 'parity' ] ) ); eq( (int) $db->get_var( "SELECT COUNT(*) FROM wp_grsh_audit_logs WHERE action = 'report_exported'" ), $a0 + 1, 'export is audited' );

echo "8. reminders: preview never sends; send needs true; cooldown\n";
$GLOBALS['mails'] = [];
$r = dat( GRSH_Reports_Tools::post_reminders( req( [], [ 'send' => false ] ) ) );
eq( $r['mode'], 'preview', 'preview mode' ); eq( $r['eligible'], 1, 'one eligible' ); eq( count( $GLOBALS['mails'] ), 0, 'preview sent nothing' );
ok( strpos( $r['body'], 'reply to this email' ) !== false && strpos( $r['body'], 'http' ) === false, 'body asks for a reply and has no invented payment link' );
GRSH_Reports_Tools::post_reminders( req( [], [ 'send' => 'true' ] ) ); eq( count( $GLOBALS['mails'] ), 0, "send must be literal true ('true' string does not send)" );
GRSH_Reports_Tools::post_reminders( req( [], [ 'send' => 1 ] ) ); eq( count( $GLOBALS['mails'] ), 0, 'send must be literal true (1 does not send)' );
$res = GRSH_Reports_Tools::post_reminders( req( [], [ 'send' => true, 'note' => '<b>Deadline is Friday</b><script>x</script>' ] ) ); $r = dat( $res );
eq( $r['sent'], 1, 'sent one' ); eq( count( $GLOBALS['mails'] ), 1, 'one email' ); eq( $GLOBALS['mails'][0][0], 'flo@x.test', 'to the unpaid player' ); ok( strpos( $GLOBALS['mails'][0][2], '<' ) === false, 'tags stripped from the note' ); ok( strpos( $GLOBALS['mails'][0][2], 'Deadline is Friday' ) !== false, 'note included' );
$res = GRSH_Reports_Tools::post_reminders( req( [], [ 'send' => true ] ) ); eq( $res->status, 400, 'second send is refused (cooldown)' ); eq( count( $GLOBALS['mails'] ), 1, 'no duplicate email' );
$r = dat( GRSH_Reports_Tools::post_reminders( req( [], [ 'send' => false ] ) ) ); eq( $r['eligible'], 0, 'nobody eligible now' ); eq( $r['skipped_recent'], 1, 'counted as recently reminded' );
eq( GRSH_Reports_Tools::data()['unpaid'][0]['can_remind'], false, 'row shows it cannot be reminded yet' ); ok( GRSH_Reports_Tools::data()['unpaid'][0]['reminded_at'] !== null, 'row shows when' );
ok( (int) $db->get_var( "SELECT COUNT(*) FROM wp_grsh_audit_logs WHERE action = 'payment_reminders_sent'" ) === 1, 'sending is audited' );
$db->pdo->exec( "UPDATE wp_grsh_players SET email = '' WHERE id = 6" ); delete_option( GRSH_Reports_Tools::REMIND_OPT );
$r = dat( GRSH_Reports_Tools::post_reminders( req( [], [ 'send' => false ] ) ) ); eq( $r['skipped_no_email'], 1, 'no-email player is counted, not emailed' );

echo "9. share links\n";
$db->pdo->exec( "UPDATE wp_grsh_players SET email = 'flo@x.test' WHERE id = 6" );
$s = dat( GRSH_Reports_Tools::post_share( req( [], [ 'days' => 7 ] ) ) ); ok( preg_match( '#/reports/shared/([a-f0-9]{32})$#', $s['url'], $m ) === 1, 'url ends in a 32-hex token' ); $tok = $m[1];
$opt = get_option( GRSH_Reports_Tools::SHARE_OPT ); ok( ! isset( $opt[ $tok ] ) && isset( $opt[ hash( 'sha256', $tok ) ] ), 'only the hash is stored, never the token' );
$h = GRSH_Reports_Tools::shared_html( $tok ); ok( $h !== null && strpos( $h, 'noindex' ) !== false, 'valid token renders, marked noindex' );
ok( strpos( $h, 'Skate' ) === false && strpos( $h, '@x.test' ) === false, 'shared page has no player names or emails' ); ok( strpos( $h, 'Gold Open' ) !== false, 'shared page has division totals' );
eq( GRSH_Reports_Tools::shared_html( str_repeat( 'a', 32 ) ), null, 'wrong token is null' ); eq( GRSH_Reports_Tools::shared_html( 'short' ), null, 'malformed token is null' ); eq( GRSH_Reports_Tools::shared_html( '' ), null, 'empty token is null' );
eq( count( dat( GRSH_Reports_Tools::get_shares( req() ) ) ), 1, 'one active link listed' ); ok( ! isset( dat( GRSH_Reports_Tools::get_shares( req() ) )[0]['token'] ), 'listing never includes the token' );
$h12 = substr( hash( 'sha256', $tok ), 0, 12 );
eq( dat( GRSH_Reports_Tools::delete_share( req( [ 'id' => $h12 ] ) ) )['revoked'], $h12, 'revoked' ); eq( GRSH_Reports_Tools::shared_html( $tok ), null, 'revoked link stops working' ); eq( GRSH_Reports_Tools::delete_share( req( [ 'id' => $h12 ] ) )->status, 404, 'revoking twice is a 404' );
$s = dat( GRSH_Reports_Tools::post_share( req( [], [ 'days' => 7 ] ) ) ); preg_match( '#([a-f0-9]{32})$#', $s['url'], $m ); $tok = $m[1];
$o = get_option( GRSH_Reports_Tools::SHARE_OPT ); $o[ hash( 'sha256', $tok ) ]['exp'] = time() - 10; update_option( GRSH_Reports_Tools::SHARE_OPT, $o ); eq( GRSH_Reports_Tools::shared_html( $tok ), null, 'expired link stops working' );
eq( count( get_option( GRSH_Reports_Tools::SHARE_OPT ) ), 0, 'expired link is purged' );
for ( $i = 0; $i < 5; $i++ ) { GRSH_Reports_Tools::post_share( req( [], [ 'days' => 1 ] ) ); } eq( GRSH_Reports_Tools::post_share( req( [], [ 'days' => 1 ] ) )->status, 400, 'sixth active link is refused' );
$o = get_option( GRSH_Reports_Tools::SHARE_OPT ); $d1 = array_values( $o )[0]; ok( $d1['exp'] - $d1['created'] === 86400, 'days respected' );
delete_option( GRSH_Reports_Tools::SHARE_OPT ); $s = dat( GRSH_Reports_Tools::post_share( req( [], [ 'days' => 999 ] ) ) ); $o = array_values( get_option( GRSH_Reports_Tools::SHARE_OPT ) )[0]; ok( $o['exp'] - $o['created'] === 30 * 86400, 'lifetime capped at 30 days' );

echo "10. the old API now agrees with the new one\n";
$GLOBALS['wpdb']->pdo->exec( "UPDATE wp_grsh_registrations SET status='withdrawn' WHERE id = 25" );
$new = GRSH_Reports_Tools::data(); $sum = dat( GRSH_Reports::get_summary( req() ) ); $un = dat( GRSH_Reports::get_unpaid( req() ) );
eq( $sum['registered'], $new['totals']['registered'], 'summary registered matches' ); eq( $sum['paid'] + $sum['waived'] + $sum['outstanding'], $sum['registered'], 'summary: paid + waived + outstanding = registered' );
eq( $sum['outstanding_amount'], $new['payments']['owed'], 'summary owed matches' ); eq( $un['count'], $new['payments']['unpaid'], 'unpaid count matches' ); eq( $un['total_owed'], $new['payments']['owed'], 'unpaid total matches' );
eq( $sum['teams_no_goalie'], $new['totals']['teams_no_goalie'], 'goalie gap matches' );
$par = dat( GRSH_Reports::get_parity( req() ) ); $pg = null; foreach ( $par as $x ) { if ( $x['division'] === 'gold_open' ) { $pg = $x; } } eq( $pg['registered'], (int) $db->get_var( "SELECT COUNT(*) FROM wp_grsh_registrations WHERE season_id = 1 AND division_requested = 'gold_open' AND player_type = 'primary' AND status NOT IN ('withdrawn','waitlist')" ), 'old parity endpoint skips withdrawn and waitlist' );

echo "11. permissions\n";
$GLOBALS['user_can'] = false; ok( GRSH_Reports_Tools::permission() === false, 'no committee role = no access' ); ok( GRSH_Reports_Tools::open() === true, 'shared page route is open by design' ); $GLOBALS['user_can'] = true;
GRSH_Reports_Tools::register_routes(); foreach ( [ '/reports/overview', '/reports/export', '/reports/reminders', '/reports/fee', '/reports/share', '/reports/shares', '/reports/shared/(?P<token>[a-f0-9]{32})', '/reports/share/(?P<id>[a-f0-9]{12})' ] as $rt ) { ok( isset( $GLOBALS['routes'][ 'grsh/v1' . $rt ] ), "route registered: $rt" ); }
foreach ( $GLOBALS['routes'] as $path => $args ) { if ( strpos( $path, 'grsh/v1/reports/' ) === 0 && strpos( $path, '/shared/' ) === false && strpos( $path, '/reports/parity' ) === false && strpos( $path, 'unpaid' ) === false && strpos( $path, 'goalies' ) === false && strpos( $path, 'summary' ) === false && strpos( $path, 'board' ) === false ) { ok( $args['permission_callback'] !== [ 'GRSH_Reports_Tools', 'open' ], "only /shared is public: $path" ); } }

echo "\n$pass passed, $fail failed\n"; exit( $fail ? 1 : 0 );
