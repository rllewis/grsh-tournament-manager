<?php
// GRSH_Dashboard against the SQLite shim. Usage: php dashboard_test.php [includes-dir] [dashboard-class]
require __DIR__ . '/harness.php';
$inc = $argv[1] ?? __DIR__ . '/../../includes';
require $argv[2] ?? __DIR__ . '/../../includes/class-grsh-dashboard.php';

$pass = 0; $fail = 0;
function ok( $c, $m ) { global $pass, $fail; if ( $c ) { $pass++; } else { $fail++; echo "  FAIL: $m\n"; } }
function eq( $a, $b, $m ) { ok( $a === $b, $m . ' (got ' . json_encode( $a ) . ', want ' . json_encode( $b ) . ')' ); }

// the shim's registrations table predates these columns; the real schema has them
$db = fresh_db( sys_get_temp_dir() . '/grsh_dash.sqlite' );
$db->pdo->exec( "ALTER TABLE wp_grsh_registrations ADD COLUMN division_assigned TEXT; ALTER TABLE wp_grsh_registrations ADD COLUMN imported_at TEXT;
                 ALTER TABLE wp_grsh_audit_logs ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP;" );
$GLOBALS['wpdb'] = $db;

echo "1. empty season: nothing measurable, nothing invented\n";
$p = GRSH_Dashboard::payload();
eq( $p['totals']['registered'], 0, 'no registrations' );
eq( $p['metrics']['payments'], null, 'payments null (not 0%)' );
eq( $p['metrics']['approvals'], null, 'approvals null' );
eq( $p['metrics']['rosters'], null, 'rosters null with no teams' );
eq( $p['tournament_date'], '', 'no tournament date invented' );
eq( $p['last_sync'], null, 'no last sync' );
eq( $p['flags'], [], 'no flags' );
ok( is_array( $p['activity'] ), 'activity is an array' );
ok( $p['server_now'] !== '', 'server clock present' );

echo "2. seeded season\n";
seed_players( $db );
// make a few registrations approved/assigned and waived so every branch is exercised
$db->pdo->exec( "UPDATE wp_grsh_registrations SET status='approved' WHERE id IN (1,2,3,4)" );
$db->pdo->exec( "UPDATE wp_grsh_registrations SET status='assigned' WHERE id = 5" );
$db->pdo->exec( "UPDATE wp_grsh_registrations SET payment_status='waived' WHERE id = 7" );
$db->pdo->exec( "UPDATE wp_grsh_registrations SET status='withdrawn' WHERE id = 8" );           // drops out of every count
$db->pdo->exec( "UPDATE wp_grsh_registrations SET division_assigned='45a' WHERE id = 9" );      // committee moved a player
$p = GRSH_Dashboard::payload();
$by = []; foreach ( $p['divisions'] as $d ) { $by[ $d['key'] ] = $d; }
// 22 gold requested - 1 withdrawn - 1 moved to 45a = 20, + 'Alt' + 'Rej' decoys (primary, still active) = 22
eq( $by['gold_open']['registered'], 22, 'gold_open registered (withdrawn excluded, reassigned excluded)' );
eq( $by['gold_open']['subs'], 1, 'sub counted separately, not as a registered player' );
ok( $by['45a']['registered'] >= 1, '45a has the reassigned player' );
eq( $by['gold_open']['paid'], 21, 'paid = paid + waived (1 pending unpaid)' );
eq( $by['gold_open']['unpaid'], 1, 'one unpaid' );
eq( $by['gold_open']['goalies'], 3, '3 goalies' );
eq( $by['gold_open']['teams'], 3, '3 teams' );
eq( $by['gold_open']['planned_teams'], 3, 'planned teams from settings' );
eq( $by['gold_open']['min_needed'], 21, 'min needed = teams x min roster (3 x 7)' );
eq( $by['gold_open']['capacity'], 36, 'capacity = teams x max roster (3 x 12)' );
eq( $by['gold_open']['approved'], 5, 'approved counts approved + assigned' );
eq( $p['totals']['unpaid'], 1, 'unpaid total matches' );
eq( $p['totals']['sandbagging_flags'], 1, 'sandbagging total from players table (not the audit log)' );
eq( count( $p['flags'] ), 1, 'flag list has the player' );
eq( $p['metrics']['payments']['of'], $p['totals']['registered'], 'payments denominator = registered' );
eq( $p['metrics']['registration']['of'], 21 + 14, 'registration needed = sum over enabled divisions (21 + 14)' );
ok( $p['metrics']['registration']['have'] === $p['totals']['registered'], 'registration have = registered' );
eq( $p['metrics']['rosters'], [ 'have' => 0, 'of' => 3 ], 'rosters: 3 teams, none ready yet' );
$tier = $by['gold_open']['tiers']; eq( array_sum( $tier ), $by['gold_open']['registered'], 'tier mix sums to registered' );
eq( $by['gold_open']['stage'], 'draft', 'stage draft' );

echo "3. rosters feed readiness and stage\n";
$gids = $db->pdo->query( "SELECT id FROM wp_grsh_players WHERE position='goaltender' ORDER BY id" )->fetchAll( PDO::FETCH_COLUMN );
$others = $db->pdo->query( "SELECT id FROM wp_grsh_players WHERE position<>'goaltender' AND last_name LIKE 'Skate%' ORDER BY id LIMIT 6" )->fetchAll( PDO::FETCH_COLUMN );
$team1 = (int) $db->pdo->query( "SELECT id FROM wp_grsh_teams ORDER BY id LIMIT 1" )->fetchColumn();
$db->insert( 'wp_grsh_rosters', [ 'season_id' => 1, 'team_id' => $team1, 'player_id' => $gids[0] ] );
foreach ( $others as $o ) { $db->insert( 'wp_grsh_rosters', [ 'season_id' => 1, 'team_id' => $team1, 'player_id' => $o ] ); }
$p = GRSH_Dashboard::payload(); $g = null; foreach ( $p['divisions'] as $d ) { if ( $d['key'] === 'gold_open' ) { $g = $d; } }
eq( $g['rostered'], 7, '7 on rosters' );
eq( $g['teams_ready'], 1, 'one team has 7 players and a goalie' );
eq( $p['metrics']['rosters'], [ 'have' => 1, 'of' => 3 ], 'rosters 1 of 3' );
$db->pdo->exec( "UPDATE wp_grsh_teams SET draft_locked = 1" );
$p = GRSH_Dashboard::payload(); foreach ( $p['divisions'] as $d ) { if ( $d['key'] === 'gold_open' ) { $g = $d; } }
eq( $g['stage'], 'locked', 'all teams locked -> locked' );
update_option( 'grsh_roster_meta_gold_open', [ 'published_at' => '2026-11-20 10:00:00' ] );
update_option( 'grsh_draft_state_gold_open', [ 'status' => 'paused' ] );
$p = GRSH_Dashboard::payload(); foreach ( $p['divisions'] as $d ) { if ( $d['key'] === 'gold_open' ) { $g = $d; } }
eq( $g['stage'], 'published', 'published_at -> published' ); eq( $g['draft_status'], 'paused', 'draft status read' );

echo "4. sync status and activity\n";
$ins = function ( $action, $notes = '', $season = 1, $at = null ) use ( $db ) {
    $db->insert( 'wp_grsh_audit_logs', [ 'season_id' => $season, 'wp_user_id' => 1, 'user_display' => 'Lorenzo', 'action' => $action, 'notes' => $notes, 'created_at' => $at ?: gmdate( 'Y-m-d H:i:s' ) ] );
};
$ins( 'player_imported', '', 2027 );                      // the sync engine logs the YEAR as season_id
$ins( 'sync_failed', 'bad row', 2027 );
$ins( 'sync_failed', 'old failure', 2027, gmdate( 'Y-m-d H:i:s', time() - 20 * 86400 ) );
for ( $i = 0; $i < 12; $i++ ) { $ins( 'roster_assign', "n$i" ); }
$p = GRSH_Dashboard::payload();
eq( $p['last_sync']['ok'], false, 'latest sync entry was a failure' );
eq( $p['last_sync']['by'], 'Lorenzo', 'last sync by' );
eq( $p['sync_failures_7d'], 1, 'only failures in the last 7 days counted (old one excluded)' );
eq( count( $p['activity'] ), 8, 'activity capped at 8' );
$db->pdo->exec( "DELETE FROM wp_grsh_audit_logs" );
$ins( 'player_imported', '', 2027 ); $ins( 'tournament_date_set', 'x', 2027 ); $ins( 'other_year', 'y', 1999 );
$p = GRSH_Dashboard::payload();
eq( $p['last_sync']['ok'], true, 'successful import -> ok' );
eq( array_column( $p['activity'], 'action' ), [ 'tournament_date_set', 'player_imported' ], 'activity includes rows logged under the year, excludes other seasons' );

echo "5. tournament date + milestones\n";
$GLOBALS['user_can'] = true;
$r = GRSH_Dashboard::set_date( new WP_REST_Request( [], [ 'date' => '2027-04-09' ] ) );
eq( $r->status, 200, 'valid date saved' ); eq( $r->data['tournament_date'], '2027-04-09', 'returned in payload' );
ok( in_array( 'tournament', array_column( $r->data['milestones'], 'key' ), true ), 'tournament is a milestone' );
$dates = array_column( $r->data['milestones'], 'date' ); $sorted = $dates; sort( $sorted ); eq( $dates, $sorted, 'milestones sorted by date' );
foreach ( [ '2027-13-45', 'April 9', '2027-4-9x', '<script>' ] as $bad ) {
    $r = GRSH_Dashboard::set_date( new WP_REST_Request( [], [ 'date' => $bad ] ) ); eq( $r->status, 400, "rejects '$bad'" );
}
eq( get_option( 'grsh_tournament_date' ), '2027-04-09', 'bad input did not overwrite the saved date' );
$r = GRSH_Dashboard::set_date( new WP_REST_Request( [], [ 'date' => '' ] ) ); eq( $r->data['tournament_date'], '', 'empty clears the date' );
$n = (int) $db->pdo->query( "SELECT COUNT(*) FROM wp_grsh_audit_logs WHERE action='tournament_date_set'" )->fetchColumn(); ok( $n >= 2, 'date changes are audit-logged' );

echo "6. routes and permissions\n";
GRSH_Dashboard::register_routes();
ok( isset( $GLOBALS['routes']['grsh/v1/dashboard'] ) && isset( $GLOBALS['routes']['grsh/v1/dashboard/tournament-date'] ), 'both routes registered' );
$GLOBALS['user_can'] = false; ok( GRSH_Dashboard::permission() === false, 'no capability -> denied' ); $GLOBALS['user_can'] = true;
$json = json_encode( GRSH_Dashboard::payload() ); ok( strpos( $json, '@x.test' ) === false, 'payload contains no email addresses' );
ok( strpos( $json, 'NaN' ) === false && strpos( $json, 'INF' ) === false, 'payload has no NaN/INF' );

echo "\n$pass passed, $fail failed\n"; exit( $fail ? 1 : 0 );
