<?php
// Minimal WordPress + $wpdb shim (SQLite) so GRSH_Rosters can run for real in CI-less testing.
if ( ! defined( 'ABSPATH' ) ) { define( 'ABSPATH', __DIR__ . '/' ); }
define( 'HOUR_IN_SECONDS', 3600 );
define( 'ARRAY_A', 'ARRAY_A' );

class WP_Error { public $code; public $message; public $data;
    function __construct( $c = '', $m = '', $d = null ) { $this->code = $c; $this->message = $m; $this->data = $d; }
    function get_error_message() { return $this->message; } function get_error_data() { return $this->data; } }
function is_wp_error( $x ) { return $x instanceof WP_Error; }
class WP_REST_Response { public $data; public $status; function __construct( $d = null, $s = 200 ) { $this->data = $d; $this->status = $s; } }
class WP_REST_Server { const READABLE = 'GET'; const CREATABLE = 'POST'; const DELETABLE = 'DELETE'; }
class WP_REST_Request {
    public $p; public $j;
    function __construct( $params = [], $json = null ) { $this->p = $params; $this->j = $json; }
    function get_param( $k ) { return $this->p[ $k ] ?? ( is_array( $this->j ) ? ( $this->j[ $k ] ?? null ) : null ); }
    function get_json_params() { return $this->j; }
}

$GLOBALS['mails'] = [];
$GLOBALS['routes'] = [];
$GLOBALS['user_can'] = true;
$GLOBALS['post_types'] = [];
function add_action( ...$a ) {}
function register_rest_route( $ns, $path, $args ) { $GLOBALS['routes'][ $ns . $path ] = $args; }
function current_user_can( $c ) { return $GLOBALS['user_can']; }
function sanitize_key( $s ) { return preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $s ) ); }
function sanitize_text_field( $s ) { return trim( strip_tags( (string) $s ) ); }
function wp_strip_all_tags( $s ) { return strip_tags( (string) $s ); }
function sanitize_hex_color( $c ) { return preg_match( '/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/', (string) $c ) ? $c : ''; }
function absint( $n ) { return abs( (int) $n ); }
function wp_parse_args( $a, $d ) { return array_merge( $d, $a ); }
function wp_json_encode( $v ) { return json_encode( $v ); }
function current_time( $t ) { return $t === 'mysql' ? gmdate( 'Y-m-d H:i:s' ) : gmdate( $t ); }
function get_current_user_id() { return 1; }
function wp_get_current_user() { return new class { public $display_name = 'Test Admin'; public $user_email = 'admin@test.test'; function exists() { return true; } }; }
function is_email( $e ) { return (bool) filter_var( $e, FILTER_VALIDATE_EMAIL ); }
function wp_mail( $to, $subj, $body, $h = [] ) { $GLOBALS['mails'][] = [ $to, $subj, $body ]; return true; }
function esc_html( $s ) { return htmlspecialchars( (string) $s, ENT_QUOTES ); }
function esc_attr( $s ) { return htmlspecialchars( (string) $s, ENT_QUOTES ); }
function esc_url( $s ) { return htmlspecialchars( (string) $s, ENT_QUOTES ); }
function add_query_arg( $k, $v, $url ) { return rtrim( $url, '/' ) . '/?' . $k . '=' . $v; }
function home_url( $p = '/' ) { return 'https://grsht.test' . $p; }
function rest_url( $p = '' ) { return 'https://grsht.test/wp-json/' . $p; }
function wp_unslash( $s ) { return $s; }
function nocache_headers() {} function status_header( $c ) {}
function is_admin() { return false; }
function post_type_exists( $t ) { return in_array( $t, $GLOBALS['post_types'], true ); }
function get_option( $k, $d = false ) { global $wpdb; $v = $wpdb->get_var( $wpdb->prepare( "SELECT option_value FROM wp_options WHERE option_name = %s", $k ) ); return $v === null ? $d : unserialize( $v ); }
function update_option( $k, $v, $a = null ) { global $wpdb; $wpdb->query( $wpdb->prepare( "DELETE FROM wp_options WHERE option_name = %s", $k ) ); $wpdb->query( $wpdb->prepare( "INSERT INTO wp_options (option_name, option_value) VALUES (%s, %s)", $k, serialize( $v ) ) ); return true; }
function delete_option( $k ) { global $wpdb; $wpdb->query( $wpdb->prepare( "DELETE FROM wp_options WHERE option_name = %s", $k ) ); return true; }
function get_transient( $k ) { $v = get_option( '_t_' . $k, false ); return $v === false ? false : $v; }
function set_transient( $k, $v, $e ) { update_option( '_t_' . $k, $v ); return true; }

class wpdb {
    public $quiet = false; public $prefix = 'wp_'; public $posts = 'wp_posts'; public $insert_id = 0; public $last_error = ''; public $pdo;
    function __construct( $file ) {
        $this->pdo = new PDO( 'sqlite:' . $file );
        $this->pdo->setAttribute( PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION );
    }
    function prepare( $q, ...$args ) {
        if ( count( $args ) === 1 && is_array( $args[0] ) ) { $args = $args[0]; }
        $i = 0;
        return preg_replace_callback( '/%[ds]/', function ( $m ) use ( &$args, &$i ) {
            $v = $args[ $i++ ];
            return $m[0] === '%d' ? (string) (int) $v : $this->pdo->quote( (string) $v );
        }, $q );
    }
    function suppress_errors( $b = true ) { $this->quiet = $b; }
    private function run( $q ) {
        if ( preg_match( '/GET_LOCK|RELEASE_LOCK/', $q ) ) { return 'LOCK'; }
        try { return $this->pdo->query( $q ); }
        catch ( PDOException $e ) { if ( $this->quiet ) { return $this->pdo->query( 'SELECT 1 WHERE 0' ); } throw $e; }   // like MySQL with errors suppressed: no rows
    }
    function get_results( $q, $t = null ) { $r = $this->run( $q ); return $r === 'LOCK' ? [ [ 1 ] ] : $r->fetchAll( PDO::FETCH_ASSOC ); }
    function get_row( $q, $t = null ) { $r = $this->run( $q )->fetch( PDO::FETCH_ASSOC ); return $r ?: null; }
    function get_col( $q ) { return $this->run( $q )->fetchAll( PDO::FETCH_COLUMN ); }
    function get_var( $q ) { $r = $this->run( $q ); if ( $r === 'LOCK' ) { return 1; } $v = $r->fetchColumn(); return $v === false ? null : $v; }
    function query( $q ) {
        if ( preg_match( '/^START TRANSACTION/i', $q ) ) { $q = 'BEGIN'; }
        $this->pdo->exec( $q ); return true;
    }
    function insert( $t, $data ) {
        $cols = implode( ',', array_keys( $data ) );
        $ph = implode( ',', array_fill( 0, count( $data ), '?' ) );
        try { $s = $this->pdo->prepare( "INSERT INTO $t ($cols) VALUES ($ph)" ); $s->execute( array_values( $data ) ); }
        catch ( PDOException $e ) { $this->last_error = $e->getMessage(); return false; }
        $this->insert_id = (int) $this->pdo->lastInsertId(); return 1;
    }
    private function where( $w ) { $p = []; $v = []; foreach ( $w as $k => $val ) { $p[] = "$k = ?"; $v[] = $val; } return [ implode( ' AND ', $p ), $v ]; }
    function update( $t, $data, $w ) {
        $set = []; $v = []; foreach ( $data as $k => $val ) { $set[] = "$k = ?"; $v[] = $val; }
        list( $wc, $wv ) = $this->where( $w );
        $s = $this->pdo->prepare( "UPDATE $t SET " . implode( ',', $set ) . " WHERE $wc" ); $s->execute( array_merge( $v, $wv ) ); return $s->rowCount();
    }
    function delete( $t, $w ) { list( $wc, $wv ) = $this->where( $w ); $s = $this->pdo->prepare( "DELETE FROM $t WHERE $wc" ); $s->execute( $wv ); return $s->rowCount(); }
}

if ( ! class_exists( 'GRSH_Sync_Engine' ) ) { class GRSH_Sync_Engine { const SEASON = 2027; } }
if ( ! class_exists( 'GRSH_Settings' ) ) {
class GRSH_Settings {
    static function get() {
        return [ 'season_label' => 'Gold Rush 2027', 'status' => 'open', 'registration_opens' => '2026-12-01', 'registration_closes' => '2027-03-01', 'draft_date' => '2027-03-20',
                 'divisions' => array_map( function ( $d ) { return $d; }, self::get_active_divisions() ) ];
    }
    static function get_active_divisions() {
        return [
            [ 'key' => 'gold_open', 'label' => 'Gold Open', 'enabled' => true, 'teams' => 3, 'min_roster' => 7, 'max_roster' => 12, 'goalie_min' => 1, 'goalie_max' => 2 ],
            [ 'key' => '45a', 'label' => '45A', 'enabled' => true, 'teams' => 2, 'min_roster' => 7, 'max_roster' => 11, 'goalie_min' => 1, 'goalie_max' => 2 ],
        ];
    }
}
}

function fresh_db( $file ) {
    @unlink( $file );
    $GLOBALS['wpdb'] = $wpdb = new wpdb( $file );
    $wpdb->pdo->exec( "
    CREATE TABLE wp_options (option_name TEXT PRIMARY KEY, option_value TEXT);
    CREATE TABLE wp_posts (ID INTEGER PRIMARY KEY AUTOINCREMENT, post_type TEXT, post_status TEXT, post_title TEXT);
    CREATE TABLE wp_grsh_seasons (id INTEGER PRIMARY KEY, season_year INT);
    CREATE TABLE wp_grsh_players (id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT, last_name TEXT, email TEXT, position TEXT, is_goalie INT DEFAULT 0,
        skill_tier_reported TEXT, skill_tier_assigned TEXT, sandbagging_flag INT DEFAULT 0, years_experience INT, is_alternate INT DEFAULT 0);
    CREATE TABLE wp_grsh_registrations (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id INT, season_id INT, status TEXT DEFAULT 'registered', player_type TEXT DEFAULT 'primary',
        division_requested TEXT, age INT, payment_status TEXT DEFAULT 'paid');
    CREATE TABLE wp_grsh_teams (id INTEGER PRIMARY KEY AUTOINCREMENT, season_id INT, division TEXT, team_type TEXT DEFAULT 'draft', name TEXT, colour TEXT,
        captain_player_id INT, draft_order INT, draft_locked INT DEFAULT 0);
    CREATE TABLE wp_grsh_rosters (id INTEGER PRIMARY KEY AUTOINCREMENT, season_id INT, team_id INT, player_id INT, registration_id INT, assignment_type TEXT DEFAULT 'manual',
        draft_round INT, draft_pick INT, is_captain INT DEFAULT 0, is_alternate INT DEFAULT 0, jersey_number INT, position_assigned TEXT, skill_tier_at_draft TEXT,
        assigned_by INT, assigned_at TEXT, UNIQUE (player_id, team_id));
    CREATE TABLE wp_grsh_player_history (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id INT, season_id INT);
    CREATE TABLE wp_grsh_audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, season_id INT, wp_user_id INT, user_display TEXT, action TEXT, object_type TEXT, object_id INT,
        after_value TEXT, notes TEXT, ip_address TEXT);
    " );
    $wpdb->pdo->exec( "INSERT INTO wp_grsh_seasons (id, season_year) VALUES (1, 2027), (2, 2026)" );
    return $wpdb;
}

function seed_players( $wpdb ) {
    // 22 gold_open (3 goalies), plus decoys: a sub, an alternate, a rejected, a 45a (o45_a), a senior_b
    $tiers = [ 'A2','B1','B2','B3','C1','C2','R1','R2','R3','B2','C1','R1','R2','B3','C2','R1','R2','B1','C1','R3','B2','R1' ];
    $pos   = [ 'goaltender','defenseman','defenseman','center','winger','winger','center','defenseman','winger','goaltender','defenseman','center','winger','defenseman','winger','goaltender','center','defenseman','winger','center','defenseman','winger' ];
    $names = [ 'Ann','Bob','Cy','Di','Ed','Flo','Gus','Hal','Ivy','Jo','Kit','Lu','Max','Ned','Oz','Pia','Quin','Rey','Sol','Tia','Uma','Vic' ];
    foreach ( $names as $i => $n ) {
        $wpdb->insert( 'wp_grsh_players', [ 'first_name' => $n, 'last_name' => 'Skate' . $i, 'email' => strtolower( $n ) . '@x.test', 'position' => $pos[ $i ], 'is_goalie' => $pos[ $i ] === 'goaltender' ? 1 : 0,
            'skill_tier_reported' => $tiers[ $i ], 'years_experience' => 5 + $i, 'sandbagging_flag' => $i === 3 ? 1 : 0 ] );
        $wpdb->insert( 'wp_grsh_registrations', [ 'player_id' => $wpdb->insert_id, 'season_id' => 1, 'division_requested' => 'gold_open', 'age' => 40 + $i, 'payment_status' => $i === 5 ? 'pending' : 'paid' ] );
    }
    // decoys
    $dec = [ [ 'Sub', 'gold_open', 'sub', 'registered', 0 ], [ 'Alt', 'gold_open', 'primary', 'registered', 1 ], [ 'Rej', 'gold_open', 'primary', 'rejected', 0 ],
             [ 'FortyFive', 'o45_a', 'primary', 'registered', 0 ], [ 'SrB', 'senior_b', 'primary', 'registered', 0 ] ];
    foreach ( $dec as $d ) {
        $wpdb->insert( 'wp_grsh_players', [ 'first_name' => $d[0], 'last_name' => 'Decoy', 'email' => strtolower( $d[0] ) . '@x.test', 'position' => 'winger', 'skill_tier_reported' => 'R1', 'years_experience' => 3, 'is_alternate' => $d[4] ] );
        $wpdb->insert( 'wp_grsh_registrations', [ 'player_id' => $wpdb->insert_id, 'season_id' => 1, 'division_requested' => $d[1], 'player_type' => $d[2], 'status' => $d[3], 'age' => 50 ] );
    }
    foreach ( [ [ 'Team Gold', '#D4A017' ], [ 'Team Blue', '#1E3A8A' ], [ 'Team Red', '#991B1B' ] ] as $i => $t ) {
        $wpdb->insert( 'wp_grsh_teams', [ 'season_id' => 1, 'division' => 'gold_open', 'name' => $t[0], 'colour' => $t[1], 'draft_order' => $i + 1 ] );
    }
    $wpdb->insert( 'wp_grsh_player_history', [ 'player_id' => 1, 'season_id' => 2 ] );
}
