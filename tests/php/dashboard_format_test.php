<?php
// Dashboard divisions follow each division's Settings format (draft / registered teams / both).
if ( ! defined( 'ABSPATH' ) ) { define( 'ABSPATH', '/' ); }
class GRSH_Settings {
    static function get() { return [ 'season_label' => 'Gold Rush 2027', 'status' => 'open', 'draft_date' => '2027-03-15', 'divisions' => self::get_active_divisions() ]; }
    static function get_active_divisions() {
        return [
            [ 'key' => 'gold_open', 'label' => 'Gold Open', 'enabled' => true, 'format' => 'draft', 'reg_teams' => 0, 'teams' => 4, 'min_roster' => 7, 'max_roster' => 12, 'goalie_min' => 1 ],
            [ 'key' => '45a',       'label' => '45A',       'enabled' => true, 'format' => 'teams', 'reg_teams' => 2, 'teams' => 2, 'min_roster' => 7, 'max_roster' => 11, 'goalie_min' => 1 ],
            [ 'key' => 'senior_b',  'label' => 'Senior B',  'enabled' => true, 'format' => 'both',  'reg_teams' => 1, 'teams' => 4, 'min_roster' => 7, 'max_roster' => 12, 'goalie_min' => 1 ],
            [ 'key' => 'senior_c',  'label' => 'Senior C',  'enabled' => true, 'teams' => 2, 'min_roster' => 7, 'max_roster' => 12, 'goalie_min' => 1 ],   // old row: no format key
            [ 'key' => 'womens',    'label' => 'Womens',    'enabled' => false, 'format' => 'teams', 'teams' => 2, 'min_roster' => 7, 'max_roster' => 12, 'goalie_min' => 1 ],
            [ 'key' => 'junk',      'label' => 'Junk',      'enabled' => true, 'format' => 'bogus', 'reg_teams' => 9, 'teams' => 3, 'min_roster' => 7, 'max_roster' => 10, 'goalie_min' => 0 ],
        ];
    }
}
require __DIR__ . '/harness.php';
require __DIR__ . '/../../includes/class-grsh-dashboard.php';
$pass = 0; $fail = 0;
function ok( $c, $m ) { global $pass, $fail; if ( $c ) { $pass++; } else { $fail++; echo "  FAIL: $m\n"; } }
function eq( $a, $b, $m ) { ok( $a === $b, $m . ' (got ' . json_encode( $a ) . ', want ' . json_encode( $b ) . ')' ); }

$db = fresh_db( sys_get_temp_dir() . '/grsh_dashfmt.sqlite' );
$db->pdo->exec( "ALTER TABLE wp_grsh_registrations ADD COLUMN division_assigned TEXT; ALTER TABLE wp_grsh_registrations ADD COLUMN imported_at TEXT;
                 ALTER TABLE wp_grsh_audit_logs ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP;" );
function player( $db, $first, $div, $goalie = 0 ) {
    $db->insert( 'wp_grsh_players', [ 'first_name' => $first, 'last_name' => 'T', 'email' => "$first@x.test", 'position' => $goalie ? 'goaltender' : 'winger', 'is_goalie' => $goalie, 'skill_tier_reported' => 'B1' ] );
    $db->insert( 'wp_grsh_registrations', [ 'player_id' => $db->insert_id, 'season_id' => 1, 'division_requested' => $div, 'payment_status' => 'paid' ] );
}
player( $db, 'A', 'gold_open', 1 ); player( $db, 'B', 'gold_open' ); player( $db, 'C', 'senior_b' ); player( $db, 'D', '45a' );
foreach ( [ [ '45a', 'full_team', 'Icemen' ], [ '45a', 'full_team', 'Blades' ], [ 'senior_b', 'full_team', 'Wolves' ], [ 'senior_b', 'draft', 'Draft 1' ] ] as $t ) {
    $db->insert( 'wp_grsh_teams', [ 'season_id' => 1, 'division' => $t[0], 'team_type' => $t[1], 'name' => $t[2] ] );
}
$p = GRSH_Dashboard::payload();
$by = []; foreach ( $p['divisions'] as $d ) { $by[ $d['key'] ] = $d; }

echo "1. draft-only division\n";
$g = $by['gold_open'];
eq( [ $g['format'], $g['draft_slots'], $g['reg_slots'], $g['planned_teams'] ], [ 'draft', 4, 0, 4 ], 'draft: 4 draft slots, 0 registered' );
eq( [ $g['min_needed'], $g['capacity'], $g['goalie_need'] ], [ 28, 48, 4 ], 'needs sized on draft slots (4 x 7, 4 x 12, 4 goalies)' );
eq( $g['stage'], 'draft', 'draft stage' );

echo "2. registered-teams-only division\n";
$t = $by['45a'];
eq( [ $t['format'], $t['draft_slots'], $t['reg_slots'], $t['full_teams'] ], [ 'teams', 0, 2, 2 ], 'teams: 0 draft slots, 2 registered, both in' );
eq( [ $t['min_needed'], $t['capacity'], $t['goalie_need'] ], [ 0, 0, 0 ], 'no player minimum, capacity or goalie quota (nobody is drafted)' );
eq( $t['stage'], 'teams', 'not "Drafting"' );
eq( $t['teams'], 0, 'draft teams = 0' ); eq( $t['registered'], 1, 'an individual who registered here is still counted (page can warn)' );

echo "3. mixed division\n";
$b = $by['senior_b'];
eq( [ $b['format'], $b['draft_slots'], $b['reg_slots'], $b['full_teams'], $b['teams'] ], [ 'both', 3, 1, 1, 1 ], 'both: 3 draft + 1 registered; 1 registered team in, 1 draft team made' );
eq( [ $b['min_needed'], $b['capacity'], $b['goalie_need'] ], [ 21, 36, 3 ], 'needs sized on the 3 draft slots only' );

echo "4. old row with no format, disabled division, junk values\n";
$c = $by['senior_c']; eq( [ $c['format'], $c['draft_slots'], $c['reg_slots'], $c['min_needed'] ], [ 'both', 2, 0, 14 ], 'missing format reads as before (all draft)' );
ok( ! isset( $by['womens'] ) || ! $by['womens']['configured'], 'disabled division not shown as configured' );
$j = $by['junk']; eq( [ $j['format'], $j['draft_slots'], $j['reg_slots'], $j['goalie_need'] ], [ 'both', 0, 3, 0 ], 'unknown format -> both; 9 registered slots is capped at the 3 teams (same as Settings); goalie_min 0 -> no quota' );

echo "5. totals follow the draft pool only\n";
eq( $p['metrics']['registration']['of'], 28 + 0 + 21 + 14 + 0, 'registration need = draft slots x min roster, summed (28+0+21+14+0)' );
eq( $p['metrics']['registration']['capacity'], 48 + 0 + 36 + 24 + 0, 'capacity = draft slots x max roster, summed' );

echo "6. published override and payload sanity\n";
update_option( 'grsh_roster_meta_45a', [ 'published_at' => '2026-12-01 10:00:00' ] );
$p = GRSH_Dashboard::payload(); foreach ( $p['divisions'] as $d ) { if ( $d['key'] === '45a' ) { $t = $d; } }
eq( $t['stage'], 'published', 'a published teams division reads Published' );
$json = json_encode( $p ); ok( strpos( $json, 'NaN' ) === false && strpos( $json, '@x.test' ) === false, 'no NaN, no emails' );

echo "\ndashboard_format: $pass passed, $fail failed\n"; exit( $fail ? 1 : 0 );
