<?php
/**
 * GRSH Reports — REST API endpoints.
 *
 * GET  /wp-json/grsh/v1/reports/parity            → division/team parity scores
 * GET  /wp-json/grsh/v1/reports/unpaid            → unpaid registrations
 * GET  /wp-json/grsh/v1/reports/goalies           → goalie coverage by division/team
 * GET  /wp-json/grsh/v1/reports/summary           → season KPI summary card
 * POST /wp-json/grsh/v1/reports/board-meeting-pack → generate & stream board pack PDF
 *
 * CHANGELOG v1.2.0
 * - get_summary()/get_unpaid() now come from GRSH_Reports_Tools::data(): primary active registrations only,
 *   the payment breakdown adds up, and "owed" is the player fee (not amount_paid on unpaid rows). Unknown = null.
 * - Board pack prints "amount not set" instead of $0 when no fee is known.
 *
 * CHANGELOG v1.1.0
 * - get_parity(): now seeds division list from GRSH_Settings::get_active_divisions()
 *   instead of deriving it from teams rows alone. Divisions with 0 teams (including
 *   Womens at season start) appear with empty teams arrays rather than being absent.
 * - Added GET /reports/summary for the KPI cards row (registered, paid, outstanding,
 *   goalies uncovered). Previously the React Reports page had to call three separate
 *   endpoints and aggregate client-side.
 * - Added POST /reports/board-meeting-pack — generates an HTML board pack and returns
 *   it as a downloadable PDF via the WordPress HTTP API. Falls back to HTML download
 *   if no PDF library is available.
 * - division_label() now driven by active divisions from settings rather than a
 *   hardcoded map, so newly added divisions appear with their correct labels.
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

class GRSH_Reports {

    public static function register_hooks(): void {
        add_action( 'rest_api_init', [ __CLASS__, 'register_routes' ] );
    }

    public static function register_routes(): void {
        $ns = 'grsh/v1';

        register_rest_route( $ns, '/reports/parity', [
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => [ __CLASS__, 'get_parity' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        register_rest_route( $ns, '/reports/unpaid', [
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => [ __CLASS__, 'get_unpaid' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        register_rest_route( $ns, '/reports/goalies', [
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => [ __CLASS__, 'get_goalies' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        register_rest_route( $ns, '/reports/summary', [
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => [ __CLASS__, 'get_summary' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );

        register_rest_route( $ns, '/reports/board-meeting-pack', [
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => [ __CLASS__, 'generate_board_pack' ],
            'permission_callback' => [ __CLASS__, 'check_permission' ],
        ] );
    }

    public static function check_permission(): bool {
        return current_user_can( 'manage_options' ) || current_user_can( 'grsh_committee' );
    }

    // -------------------------------------------------------------------------
    // GET /reports/summary  — KPI card data
    // -------------------------------------------------------------------------

    public static function get_summary( WP_REST_Request $request ): WP_REST_Response {
        // v1.2.0: one source of truth. Counts are primary, active registrations only, so
        // registered = paid + waived + outstanding + refunded always adds up, and the amount
        // owed comes from the player fee (null when no fee is known) instead of amount_paid.
        $d = GRSH_Reports_Tools::data();
        $p = $d['payments'];
        return new WP_REST_Response( [
            'registered'         => (int) $d['totals']['registered'],
            'paid'               => (int) $p['breakdown']['paid'],
            'waived'             => (int) $p['breakdown']['waived'],
            'outstanding'        => (int) $p['unpaid'],
            'outstanding_amount' => $p['owed'],
            'goalie_total'       => (int) $d['totals']['goalies'],
            'teams_no_goalie'    => (int) $d['totals']['teams_no_goalie'],
            'sandbagging_flags'  => (int) $d['totals']['sandbagging'],
            'generated_at'       => current_time( 'mysql' ),
        ], 200 );
    }

    // -------------------------------------------------------------------------
    // GET /reports/parity — teams grouped by division with parity scores
    //
    // FIX: Division list is now seeded from GRSH_Settings::get_active_divisions()
    // so every enabled division appears in the response. Divisions with no teams
    // yet (e.g. Womens at season start) return an empty teams array with
    // registration counts and capacity pulled from settings.
    // -------------------------------------------------------------------------

    public static function get_parity( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $season_id = self::get_season_id();

        // Fetch teams that exist in the DB.
        $teams = $wpdb->get_results( $wpdb->prepare(
            "SELECT t.id, t.name, t.colour, t.division,
                    t.skill_score, t.age_score, t.parity_score,
                    COUNT(ro.id) AS player_count,
                    SUM(CASE WHEN p.is_goalie = 1         THEN 1 ELSE 0 END) AS goalie_count,
                    SUM(CASE WHEN p.position = 'defenseman' THEN 1 ELSE 0 END) AS defense_count,
                    SUM(CASE WHEN p.position = 'center'     THEN 1 ELSE 0 END) AS center_count,
                    SUM(CASE WHEN p.position = 'winger'     THEN 1 ELSE 0 END) AS wing_count
             FROM {$wpdb->prefix}grsh_teams t
             LEFT JOIN {$wpdb->prefix}grsh_rosters ro ON ro.team_id = t.id AND ro.season_id = %d
             LEFT JOIN {$wpdb->prefix}grsh_players  p  ON p.id = ro.player_id
             WHERE t.season_id = %d
             GROUP BY t.id
             ORDER BY t.division ASC, t.draft_order ASC",
            $season_id, $season_id
        ), ARRAY_A ) ?: [];

        // Registration counts per division (for divisions with no teams yet).
        $reg_counts_raw = $wpdb->get_results( $wpdb->prepare(
            "SELECT division_requested AS div_key, COUNT(*) AS cnt
             FROM {$wpdb->prefix}grsh_registrations
             WHERE season_id = %d AND player_type = 'primary' AND status NOT IN ('withdrawn','waitlist')
             GROUP BY division_requested",
            $season_id
        ), ARRAY_A ) ?: [];

        $reg_counts = [];
        foreach ( $reg_counts_raw as $rc ) {
            $reg_counts[ $rc['div_key'] ] = (int) $rc['cnt'];
        }

        // Seed divisions from settings — guarantees all enabled divisions appear.
        $active     = GRSH_Settings::get_active_divisions();
        $divisions  = [];
        foreach ( $active as $div_cfg ) {
            $key = $div_cfg['key'];
            $divisions[ $key ] = [
                'division'    => $key,
                'label'       => $div_cfg['label'],
                'capacity'    => $div_cfg['max_roster'] * $div_cfg['teams'],
                'registered'  => $reg_counts[ $key ] ?? 0,
                'teams'       => [],
            ];
        }

        // Layer team data over the seeded division map.
        foreach ( $teams as $team ) {
            $div = $team['division'];
            if ( ! isset( $divisions[ $div ] ) ) {
                // Team belongs to a division that isn't in settings (legacy data).
                $divisions[ $div ] = [
                    'division'   => $div,
                    'label'      => self::division_label( $div ),
                    'capacity'   => 0,
                    'registered' => $reg_counts[ $div ] ?? 0,
                    'teams'      => [],
                ];
            }

            // Determine action recommendation based on parity score.
            $parity = $team['parity_score'] !== null ? (float) $team['parity_score'] : null;
            $action = 'balanced';
            if ( $parity !== null ) {
                if ( $parity < 60 || $parity > 85 ) {
                    $action = 'rebalance';
                } elseif ( $parity < 65 || $parity > 80 ) {
                    $action = 'review';
                }
            }

            $divisions[ $div ]['teams'][] = [
                'name'         => $team['name'],
                'colour'       => $team['colour'] ?? '#666666',
                'players'      => (int) $team['player_count'],
                'skill_score'  => $parity !== null ? (float) $team['skill_score']  : null,
                'age_score'    => $parity !== null ? (float) $team['age_score']    : null,
                'parity_score' => $parity,
                'goalies'      => (int) $team['goalie_count'],
                'defense'      => (int) $team['defense_count'],
                'center'       => (int) $team['center_count'],
                'wing'         => (int) $team['wing_count'],
                'action'       => $action,
            ];
        }

        return new WP_REST_Response( array_values( $divisions ), 200 );
    }

    // -------------------------------------------------------------------------
    // GET /reports/unpaid
    // -------------------------------------------------------------------------

    public static function get_unpaid( WP_REST_Request $request ): WP_REST_Response {
        $d = GRSH_Reports_Tools::data();
        $unpaid = array_map( function ( $u ) {
            return [ 'id' => (int) $u['player_id'], 'name' => $u['name'], 'division' => $u['division'], 'amount' => $u['owes'], 'type' => 'primary', 'days_since' => (int) ( $u['days_waiting'] ?? 0 ) ];
        }, $d['unpaid'] );
        return new WP_REST_Response( [
            'players'    => $unpaid,
            'count'      => count( $unpaid ),
            'total_owed' => $d['payments']['owed'],
        ], 200 );
    }

    // -------------------------------------------------------------------------
    // GET /reports/goalies
    // -------------------------------------------------------------------------

    public static function get_goalies( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $season_id = self::get_season_id();

        $goalie_rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT
                t.id AS team_id, t.name AS team_name, t.colour, t.division,
                CONCAT(p.first_name,' ',p.last_name) AS goalie_name
             FROM {$wpdb->prefix}grsh_teams t
             LEFT JOIN {$wpdb->prefix}grsh_rosters ro ON ro.team_id = t.id AND ro.season_id = %d
             LEFT JOIN {$wpdb->prefix}grsh_players p
                  ON p.id = ro.player_id AND p.is_goalie = 1
             WHERE t.season_id = %d
             ORDER BY t.division ASC, t.draft_order ASC",
            $season_id, $season_id
        ), ARRAY_A ) ?: [];

        $goalie_subs = $wpdb->get_results( $wpdb->prepare(
            "SELECT
                CONCAT(p.first_name,' ',p.last_name) AS name,
                r.division_requested AS division
             FROM {$wpdb->prefix}grsh_players p
             JOIN {$wpdb->prefix}grsh_registrations r ON r.player_id = p.id AND r.season_id = %d
             WHERE p.is_alternate = 1 AND p.is_goalie = 1",
            $season_id
        ), ARRAY_A ) ?: [];

        $divisions = [];
        foreach ( $goalie_rows as $row ) {
            $div = $row['division'];
            if ( ! isset( $divisions[ $div ] ) ) {
                $divisions[ $div ] = [
                    'division' => $div,
                    'label'    => self::division_label( $div ),
                    'teams'    => [],
                    'subs'     => [],
                ];
            }
            $tid = $row['team_id'];
            if ( ! isset( $divisions[ $div ]['teams'][ $tid ] ) ) {
                $divisions[ $div ]['teams'][ $tid ] = [
                    'name'    => $row['team_name'],
                    'colour'  => $row['colour'] ?? '#666666',
                    'goalies' => [],
                    'covered' => false,
                ];
            }
            if ( $row['goalie_name'] ) {
                $divisions[ $div ]['teams'][ $tid ]['goalies'][] = $row['goalie_name'];
                $divisions[ $div ]['teams'][ $tid ]['covered']   = true;
            }
        }

        foreach ( $goalie_subs as $sub ) {
            $div = $sub['division'] ?? '';
            if ( isset( $divisions[ $div ] ) ) {
                $divisions[ $div ]['subs'][] = $sub['name'];
            }
        }

        $result = array_map( fn( $div ) => array_merge( $div, [
            'teams' => array_values( $div['teams'] ),
        ] ), array_values( $divisions ) );

        return new WP_REST_Response( $result, 200 );
    }

    // -------------------------------------------------------------------------
    // POST /reports/board-meeting-pack
    //
    // Aggregates data from parity, unpaid, goalies, and summary endpoints then
    // renders an HTML board pack. If dompdf or TCPDF is available in the plugin
    // directory it converts to PDF; otherwise it returns styled HTML with a
    // Content-Disposition: attachment header so the browser offers a download.
    //
    // The React frontend triggers this via:
    //   fetch( grshConfig.apiUrl + '/reports/board-meeting-pack', {
    //       method: 'POST',
    //       headers: { 'X-WP-Nonce': grshConfig.nonce },
    //   } )
    //   .then( r => r.blob() )
    //   .then( blob => {
    //       const url = URL.createObjectURL( blob );
    //       const a   = document.createElement( 'a' );
    //       a.href    = url;
    //       a.download = 'GRSH-Board-Pack-' + new Date().toISOString().slice(0,10) + '.pdf';
    //       a.click();
    //   } );
    // -------------------------------------------------------------------------

    public static function generate_board_pack( WP_REST_Request $request ): void {
        global $wpdb;

        $season_id  = self::get_season_id();
        $settings   = GRSH_Settings::get();
        $now        = current_time( 'mysql' );
        $date_label = date( 'F j, Y', strtotime( $now ) );

        // Gather all report data in one place.
        $summary_resp  = self::get_summary( new WP_REST_Request() );
        $parity_resp   = self::get_parity( new WP_REST_Request() );
        $unpaid_resp   = self::get_unpaid( new WP_REST_Request() );
        $goalies_resp  = self::get_goalies( new WP_REST_Request() );

        $summary = $summary_resp->get_data();
        $parity  = $parity_resp->get_data();
        $unpaid  = $unpaid_resp->get_data();
        $goalies = $goalies_resp->get_data();

        $season_label = esc_html( $settings['season_label'] ?? 'Gold Rush 2027' );
        $registered   = (int) ( $summary['registered']         ?? 0 );
        $paid         = (int) ( $summary['paid']               ?? 0 );
        $outstanding  = (int) ( $summary['outstanding']        ?? 0 );
        $owed_known   = isset( $summary['outstanding_amount'] ) && $summary['outstanding_amount'] !== null;
        $owed         = $owed_known ? number_format( (float) $summary['outstanding_amount'], 2 ) : '';
        $owed_txt     = $owed_known ? '$' . $owed : 'amount not set';
        $no_goalie    = (int) ( $summary['teams_no_goalie']    ?? 0 );
        $sandbagging  = (int) ( $summary['sandbagging_flags']  ?? 0 );

        // ── Build the HTML document ──────────────────────────────────────────

        ob_start();
        ?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>GRSH Board Meeting Pack — <?php echo $date_label; ?></title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #1a1a2e; background: #fff; }
  .page-break { page-break-before: always; }

  /* ── Header ── */
  .doc-header { background: #0F1E3C; color: #fff; padding: 24px 32px; margin-bottom: 0; }
  .doc-header h1 { font-size: 20pt; font-weight: bold; color: #C49A2A; letter-spacing: .5px; }
  .doc-header .sub { font-size: 10pt; color: rgba(255,255,255,.7); margin-top: 4px; }
  .doc-header .meta { font-size: 9pt; color: rgba(255,255,255,.5); margin-top: 8px; }

  /* ── Section titles ── */
  .section { padding: 24px 32px; border-bottom: 1px solid #E2E8F0; }
  .section:last-child { border-bottom: none; }
  .section-title { font-size: 13pt; font-weight: bold; color: #0F1E3C;
                   border-left: 4px solid #C49A2A; padding-left: 10px; margin-bottom: 16px; }

  /* ── KPI grid ── */
  .kpi-grid { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
  .kpi { background: #F0F4F8; border-radius: 6px; padding: 12px 16px; min-width: 140px; flex: 1; }
  .kpi.urgent { background: #FCEBEB; border-left: 3px solid #A32D2D; }
  .kpi.warn   { background: #FAEEDA; border-left: 3px solid #BA7517; }
  .kpi.good   { background: #E1F5EE; border-left: 3px solid #1D9E75; }
  .kpi-label  { font-size: 8pt; font-weight: bold; text-transform: uppercase;
                letter-spacing: .5px; color: #5F5E5A; margin-bottom: 4px; }
  .kpi-value  { font-size: 22pt; font-weight: bold; color: #0F1E3C; line-height: 1; }
  .kpi-sub    { font-size: 8pt; color: #888780; margin-top: 3px; }

  /* ── Health banner ── */
  .health-banner { background: #FAEEDA; border: 1px solid #FAC775; border-radius: 6px;
                   padding: 10px 14px; margin-bottom: 16px; font-size: 10pt; color: #854F0B; }
  .health-banner strong { color: #633806; }

  /* ── Tables ── */
  table { width: 100%; border-collapse: collapse; font-size: 10pt; margin-bottom: 12px; }
  th { background: #0F1E3C; color: #fff; padding: 8px 10px; text-align: left;
       font-size: 9pt; font-weight: bold; text-transform: uppercase; letter-spacing: .4px; }
  td { padding: 7px 10px; border-bottom: 1px solid #E2E8F0; vertical-align: top; }
  tr:nth-child(even) td { background: #F8FAFC; }
  tr:last-child td { border-bottom: none; }

  /* ── Parity bars ── */
  .bar-track { background: #E2E8F0; height: 8px; border-radius: 4px; overflow: hidden; min-width: 80px; }
  .bar-fill  { height: 100%; border-radius: 4px; }
  .action-balanced  { color: #0F6E56; font-weight: bold; }
  .action-review    { color: #854F0B; font-weight: bold; }
  .action-rebalance { color: #A32D2D; font-weight: bold; }

  /* ── Parity score chips ── */
  .score-chips { display: flex; gap: 6px; font-size: 9pt; color: #5F5E5A; }
  .score-chip  { white-space: nowrap; }
  .score-chip strong { color: #1a1a2e; }

  /* ── Position chips ── */
  .pos-chips { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
  .pos-chip  { font-size: 8pt; background: #E2E8F0; border-radius: 3px;
               padding: 1px 5px; color: #5F5E5A; }

  /* ── Division sub-header ── */
  .div-header { background: #F0F4F8; border-radius: 4px; padding: 8px 12px;
                margin: 12px 0 0; font-size: 10pt; font-weight: bold; color: #0F1E3C;
                display: flex; justify-content: space-between; }
  .div-header .cap { font-size: 9pt; font-weight: normal; color: #5F5E5A; }

  /* ── Goalie coverage ── */
  .covered     { color: #0F6E56; font-weight: bold; }
  .not-covered { color: #A32D2D; font-weight: bold; }

  /* ── Footer ── */
  .doc-footer { background: #F0F4F8; padding: 14px 32px; font-size: 8pt;
                color: #888780; display: flex; justify-content: space-between; }

  /* ── AI placeholder ── */
  .ai-box { background: #0F1E3C; border-radius: 6px; padding: 16px 20px;
             color: rgba(255,255,255,.8); font-size: 10pt; margin-bottom: 16px; }
  .ai-box .ai-label { font-size: 8pt; color: #C49A2A; font-weight: bold;
                      text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px; }
  .ai-box p { line-height: 1.6; color: rgba(255,255,255,.7); font-style: italic; font-size: 9.5pt; }

  @media print {
    .page-break { page-break-before: always; }
    body { font-size: 10pt; }
  }
</style>
</head>
<body>

<!-- ═══════════════════ HEADER ═══════════════════ -->
<div class="doc-header">
  <h1>GRSH Board Meeting Pack</h1>
  <div class="sub"><?php echo $season_label; ?> &nbsp;·&nbsp; Prepared for board review</div>
  <div class="meta">Generated: <?php echo esc_html( $date_label ); ?> &nbsp;·&nbsp; Confidential — Board use only</div>
</div>

<!-- ═══════════════════ SECTION 1: SEASON SUMMARY ═══════════════════ -->
<div class="section">
  <div class="section-title">Season at a Glance</div>

  <?php if ( $outstanding > 0 || $no_goalie > 0 ) : ?>
  <div class="health-banner">
    <strong>Action required:</strong>
    <?php
      $items = [];
      if ( $outstanding > 0 ) $items[] = "{$outstanding} unpaid registrations ({$owed_txt} outstanding)";
      if ( $no_goalie > 0    ) $items[] = "{$no_goalie} teams without a confirmed goalie";
      if ( $sandbagging > 0  ) $items[] = "{$sandbagging} sandbagging flag(s) need committee review";
      echo esc_html( implode( ' · ', $items ) );
    ?>
  </div>
  <?php endif; ?>

  <div class="kpi-grid">
    <div class="kpi good">
      <div class="kpi-label">Registered</div>
      <div class="kpi-value"><?php echo $registered; ?></div>
      <div class="kpi-sub">Players total</div>
    </div>
    <div class="kpi good">
      <div class="kpi-label">Paid</div>
      <div class="kpi-value"><?php echo $paid; ?></div>
      <div class="kpi-sub"><?php echo $registered > 0 ? round( ( $paid / $registered ) * 100 ) : 0; ?>% collected</div>
    </div>
    <div class="kpi <?php echo $outstanding > 0 ? 'urgent' : 'good'; ?>">
      <div class="kpi-label">Outstanding</div>
      <div class="kpi-value"><?php echo $outstanding; ?></div>
      <div class="kpi-sub"><?php echo esc_html( $owed_txt ); ?> owed</div>
    </div>
    <div class="kpi <?php echo $no_goalie > 0 ? 'warn' : 'good'; ?>">
      <div class="kpi-label">Teams no goalie</div>
      <div class="kpi-value"><?php echo $no_goalie; ?></div>
      <div class="kpi-sub">Need assignment</div>
    </div>
    <?php if ( $sandbagging > 0 ) : ?>
    <div class="kpi warn">
      <div class="kpi-label">Sandbagging flags</div>
      <div class="kpi-value"><?php echo $sandbagging; ?></div>
      <div class="kpi-sub">Require review</div>
    </div>
    <?php endif; ?>
  </div>

  <!-- AI Executive Summary placeholder -->
  <div class="ai-box">
    <div class="ai-label">AI Executive Summary</div>
    <p>
      <?php echo $season_label; ?> is currently
      <?php echo $registered > 0 ? 'underway with ' . $registered . ' registered players' : 'in the pre-registration phase'; ?>.
      <?php if ( $outstanding > 0 ) echo "Payment collection is at " . ( $registered > 0 ? round( ( $paid / $registered ) * 100 ) : 0 ) . "% — {$outstanding} registrations ({$owed_txt}) remain outstanding and should be followed up before the registration deadline."; ?>
      <?php if ( $no_goalie > 0 ) echo " {$no_goalie} team(s) currently have no confirmed goalie — the committee should prioritize goalie assignments before the draft date."; ?>
      <?php if ( $sandbagging > 0 ) echo " {$sandbagging} sandbagging flag(s) have been raised by the auto-detection system and require committee review prior to draft."; ?>
      <?php if ( $outstanding === 0 && $no_goalie === 0 && $sandbagging === 0 ) echo "All key indicators are healthy. No urgent action items for this meeting."; ?>
    </p>
  </div>
</div>

<!-- ═══════════════════ SECTION 2: PARITY REPORT ═══════════════════ -->
<div class="section page-break">
  <div class="section-title">Team Parity Report</div>
  <p style="font-size:9pt;color:#5F5E5A;margin-bottom:16px">
    Parity score 65–80 = ideal balance. Below 60 or above 85 = rebalance recommended.
    Skill, Age, and Parity scores are on a 0–100 scale.
  </p>

  <?php if ( empty( $parity ) ) : ?>
    <p style="color:#888;font-style:italic">No team data available for this season yet.</p>
  <?php else : ?>
    <?php foreach ( $parity as $div ) :
      $div_label = esc_html( $div['label'] ?? ucfirst( $div['division'] ) );
      $cap       = (int) ( $div['capacity']   ?? 0 );
      $reg       = (int) ( $div['registered'] ?? 0 );
      $teams     = $div['teams'] ?? [];
    ?>
    <div class="div-header">
      <span><?php echo $div_label; ?> &nbsp;&mdash;&nbsp; <?php echo count( $teams ); ?> teams</span>
      <span class="cap"><?php echo "{$reg} / {$cap} registered"; ?></span>
    </div>

    <?php if ( empty( $teams ) ) : ?>
      <p style="color:#888;font-size:9.5pt;padding:8px 12px;font-style:italic">
        No teams drafted yet — division is configured and accepting registrations.
      </p>
    <?php else : ?>
    <table>
      <thead>
        <tr>
          <th style="width:25%">Team</th>
          <th style="width:28%">Roster</th>
          <th style="width:30%">Parity bar</th>
          <th style="width:17%">Action</th>
        </tr>
      </thead>
      <tbody>
        <?php foreach ( $teams as $team ) :
          $parity_val = $team['parity_score'] !== null ? round( (float)$team['parity_score'], 1 ) : '—';
          $skill_val  = $team['skill_score']  !== null ? round( (float)$team['skill_score'],  1 ) : '—';
          $age_val    = $team['age_score']    !== null ? round( (float)$team['age_score'],    1 ) : '—';
          $bar_pct    = $team['parity_score'] !== null ? min( 100, round( (float)$team['parity_score'] ) ) : 0;
          $bar_color  = '#1D9E75';
          if ( $bar_pct < 60 || $bar_pct > 85 ) $bar_color = '#A32D2D';
          elseif ( $bar_pct < 65 || $bar_pct > 80 ) $bar_color = '#BA7517';
          $action_class = 'action-' . ( $team['action'] ?? 'balanced' );
          $action_label = ucfirst( $team['action'] ?? 'Balanced' );
          $dot_color    = esc_attr( $team['colour'] ?? '#666' );
        ?>
        <tr>
          <td>
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;
                         background:<?php echo $dot_color; ?>;margin-right:6px;vertical-align:middle;"></span>
            <?php echo esc_html( $team['name'] ); ?>
          </td>
          <td>
            <div style="margin-bottom:2px"><?php echo (int)$team['players']; ?> players</div>
            <div class="pos-chips">
              <span class="pos-chip">G:<?php echo (int)$team['goalies']; ?></span>
              <span class="pos-chip">D:<?php echo (int)$team['defense']; ?></span>
              <span class="pos-chip">C:<?php echo (int)$team['center']; ?></span>
              <span class="pos-chip">W:<?php echo (int)$team['wing']; ?></span>
            </div>
            <div class="score-chips" style="margin-top:4px">
              <span class="score-chip">Skill <strong><?php echo $skill_val; ?></strong></span>
              <span class="score-chip">Age <strong><?php echo $age_val; ?></strong></span>
              <span class="score-chip">Parity <strong><?php echo $parity_val; ?></strong></span>
            </div>
          </td>
          <td style="vertical-align:middle">
            <div class="bar-track">
              <div class="bar-fill" style="width:<?php echo $bar_pct; ?>%;background:<?php echo $bar_color; ?>;"></div>
            </div>
            <div style="font-size:8pt;color:#888;margin-top:2px"><?php echo $parity_val; ?> / 100</div>
          </td>
          <td class="<?php echo esc_attr( $action_class ); ?>"><?php echo $action_label; ?></td>
        </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
    <?php endif; ?>
    <?php endforeach; ?>
  <?php endif; ?>
</div>

<!-- ═══════════════════ SECTION 3: OUTSTANDING PAYMENTS ═══════════════════ -->
<div class="section page-break">
  <div class="section-title">Outstanding Payments</div>

  <?php $unpaid_players = $unpaid['players'] ?? []; ?>

  <?php if ( empty( $unpaid_players ) ) : ?>
    <p style="color:#1D9E75;font-weight:bold">All registered players have paid. No outstanding balances.</p>
  <?php else : ?>
    <p style="font-size:9.5pt;color:#5F5E5A;margin-bottom:12px">
      <?php echo count( $unpaid_players ); ?> player(s) &nbsp;&middot;&nbsp;
      Total outstanding: <strong><?php echo ( $unpaid['total_owed'] ?? null ) === null ? 'amount not set' : '$' . number_format( (float) $unpaid['total_owed'], 2 ); ?></strong>
    </p>
    <table>
      <thead>
        <tr>
          <th>Player</th>
          <th>Division</th>
          <th>Owes</th>
          <th>Days since reg.</th>
          <th>Recommended action</th>
        </tr>
      </thead>
      <tbody>
        <?php foreach ( $unpaid_players as $p ) :
          $days   = (int) ( $p['days_since'] ?? 0 );
          $action = $days > 30 ? 'Escalate — overdue' : ( $days > 14 ? 'Send reminder' : 'Monitor' );
          $action_color = $days > 30 ? '#A32D2D' : ( $days > 14 ? '#BA7517' : '#1D9E75' );
        ?>
        <tr>
          <td><?php echo esc_html( $p['name'] ); ?></td>
          <td><?php echo esc_html( self::division_label( $p['division'] ) ); ?></td>
          <td><?php echo $p['amount'] === null ? '&mdash;' : '$' . number_format( (float) $p['amount'], 2 ); ?></td>
          <td><?php echo $days; ?> days</td>
          <td style="color:<?php echo $action_color; ?>;font-weight:bold"><?php echo $action; ?></td>
        </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  <?php endif; ?>
</div>

<!-- ═══════════════════ SECTION 4: GOALIE COVERAGE ═══════════════════ -->
<div class="section page-break">
  <div class="section-title">Goalie Coverage</div>

  <?php if ( empty( $goalies ) ) : ?>
    <p style="color:#888;font-style:italic">No team/goalie data available yet.</p>
  <?php else : ?>
    <?php foreach ( $goalies as $gdiv ) : ?>
      <div class="div-header">
        <span><?php echo esc_html( $gdiv['label'] ?? $gdiv['division'] ); ?></span>
        <?php if ( ! empty( $gdiv['subs'] ) ) : ?>
          <span class="cap">Goalie subs: <?php echo esc_html( implode( ', ', $gdiv['subs'] ) ); ?></span>
        <?php endif; ?>
      </div>
      <table>
        <thead><tr><th style="width:40%">Team</th><th style="width:30%">Goalies</th><th style="width:30%">Coverage</th></tr></thead>
        <tbody>
          <?php foreach ( $gdiv['teams'] as $t ) :
            $covered = ! empty( $t['goalies'] );
          ?>
          <tr>
            <td>
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;
                           background:<?php echo esc_attr( $t['colour'] ); ?>;margin-right:6px;vertical-align:middle;"></span>
              <?php echo esc_html( $t['name'] ); ?>
            </td>
            <td><?php echo $covered ? esc_html( implode( ', ', $t['goalies'] ) ) : '<em style="color:#888">None assigned</em>'; ?></td>
            <td class="<?php echo $covered ? 'covered' : 'not-covered'; ?>">
              <?php echo $covered ? 'Covered' : 'UNCOVERED'; ?>
            </td>
          </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    <?php endforeach; ?>
  <?php endif; ?>
</div>

<!-- ═══════════════════ FOOTER ═══════════════════ -->
<div class="doc-footer">
  <span>Gold Rush Senior Hockey &nbsp;·&nbsp; <?php echo $season_label; ?></span>
  <span>Generated <?php echo esc_html( $now ); ?> &nbsp;·&nbsp; Confidential</span>
</div>

</body>
</html>
        <?php
        $html = ob_get_clean();

        // ── Try PDF conversion if dompdf is present ────────────────────────
        $dompdf_path = GRSH_PLUGIN_DIR . 'vendor/dompdf/dompdf/src/Dompdf.php';
        if ( file_exists( $dompdf_path ) ) {
            require_once $dompdf_path;
            $dompdf = new \Dompdf\Dompdf( [ 'defaultPaperSize' => 'letter', 'isHtml5ParserEnabled' => true ] );
            $dompdf->loadHtml( $html );
            $dompdf->render();
            $output   = $dompdf->output();
            $filename = 'GRSH-Board-Pack-' . date( 'Y-m-d' ) . '.pdf';
            header( 'Content-Type: application/pdf' );
            header( 'Content-Disposition: attachment; filename="' . $filename . '"' );
            header( 'Content-Length: ' . strlen( $output ) );
            header( 'Cache-Control: private, no-cache, no-store' );
            echo $output; // phpcs:ignore WordPress.Security.EscapeOutput
            exit;
        }

        // ── Fallback: serve styled HTML as a downloadable file ────────────
        $filename = 'GRSH-Board-Pack-' . date( 'Y-m-d' ) . '.html';
        header( 'Content-Type: text/html; charset=UTF-8' );
        header( 'Content-Disposition: attachment; filename="' . $filename . '"' );
        header( 'Cache-Control: private, no-cache, no-store' );
        echo $html; // phpcs:ignore WordPress.Security.EscapeOutput
        exit;
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private static function get_season_id(): int {
        global $wpdb;
        static $id = null;
        if ( $id === null ) {
            $id = (int) $wpdb->get_var( $wpdb->prepare(
                "SELECT id FROM {$wpdb->prefix}grsh_seasons WHERE season_year = %d LIMIT 1",
                GRSH_Sync_Engine::SEASON
            ) );
        }
        return $id ?: 1;
    }

    /**
     * Return the display label for a division key.
     * Driven by active divisions from settings; falls back to humanised key.
     */
    private static function division_label( string $key ): string {
        static $map = null;
        if ( $map === null ) {
            $map = [];
            foreach ( GRSH_Settings::get_active_divisions() as $div ) {
                $map[ $div['key'] ] = $div['label'];
            }
            // Fallbacks for data that pre-dates settings (imported seasons).
            $map += [
                'gold_open' => 'Gold Open',
                '45a'       => '45A',
                'senior_b'  => 'Senior B',
                'senior_c'  => 'Senior C',
                'womens'    => 'Womens',
            ];
        }
        return $map[ $key ] ?? ucfirst( str_replace( '_', ' ', $key ) );
    }
}
