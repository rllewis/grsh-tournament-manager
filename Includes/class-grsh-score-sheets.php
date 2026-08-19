<?php
/**
 * GRSH Score Sheets - Gold Rush Senior Hockey
 *
 * Lets an admin build a batch of matchups (home team, away team, date,
 * time, arena, game number, type) and generate print-ready score sheets
 * in a new browser tab - one page per matchup, rosters pulled live from
 * the database and sorted by jersey number, goalie shown in a separate
 * highlighted row. Everything else (scoring, shoot-out, penalties,
 * goalkeeping stats, signatures) stays blank, filled by hand at the rink.
 *
 * No PDF library involved - this renders plain HTML styled for print,
 * using the browser's own print/Save-as-PDF, since this host has no
 * Composer access to vendor a PHP PDF library.
 *
 * Ported from the Tahoe Champions Cup fork of this plugin (same schema,
 * only the division ENUM values differ — this file resolves division
 * labels dynamically via GRSH_Settings::get_active_divisions(), so no
 * division-specific changes were needed).
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class GRSH_Score_Sheets {

    public static function register_hooks(): void {
        // Priority 20: must fire AFTER grsh_register_admin_menu() creates
        // the parent menu, or this submenu registers with a mismatched
        // page hook - same bug class as the original Captain Sync issue.
        add_action( 'admin_menu', [ __CLASS__, 'register_admin_page' ], 20 );
        add_action( 'admin_post_grsh_print_score_sheets', [ __CLASS__, 'handle_print_request' ] );
    }

    public static function register_admin_page(): void {
        add_submenu_page(
            'grsh-tm-dashboard',
            __( 'Print Score Sheets', 'grsh' ),
            __( 'Print Score Sheets', 'grsh' ),
            'manage_options',
            'grsh-score-sheets',
            [ __CLASS__, 'render_admin_page' ]
        );
    }

    private static function get_season_id(): int {
        global $wpdb;
        $season_year = (int) ( GRSH_Settings::get()['season_year'] ?? 0 );
        $id = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}grsh_seasons WHERE season_year = %d LIMIT 1",
            $season_year
        ) );
        return $id ?: 1;
    }

    /** Teams available for the dropdowns, current season only. */
    private static function get_teams_for_dropdown(): array {
        global $wpdb;
        $season_id = self::get_season_id();
        return $wpdb->get_results( $wpdb->prepare(
            "SELECT id, name, division FROM {$wpdb->prefix}grsh_teams
             WHERE season_id = %d AND team_type = 'full_team' ORDER BY name ASC",
            $season_id
        ), ARRAY_A ) ?: [];
    }

    private static function division_label( string $key ): string {
        foreach ( GRSH_Settings::get_active_divisions() as $d ) {
            if ( $d['key'] === $key ) return $d['label'];
        }
        return $key;
    }

    /**
     * Returns ['name','division_label','goalie' => row|null, 'players' => [rows...]]
     * Goalie is whichever rostered player has position 'goaltender' with the
     * lowest jersey number; everyone else (including any second goalie,
     * an edge case the roster tool already discourages) is sorted by
     * jersey number ascending, nulls last, into the numbered rows.
     */
    private static function get_team_sheet_data( int $team_id ): ?array {
        global $wpdb;

        // team_id 0 = "— Blank / TBD —" selection from the dropdown, not a
        // real team. Return a blank shape instead of querying, so the sheet
        // prints with empty header + all-blank roster rows for hand-writing
        // at the rink, rather than being silently dropped from the batch.
        if ( $team_id === 0 ) {
            return [
                'name'           => '',
                'division_label' => '',
                'goalie'         => null,
                'players'        => [],
            ];
        }

        $team = $wpdb->get_row( $wpdb->prepare(
            "SELECT name, division FROM {$wpdb->prefix}grsh_teams WHERE id = %d", $team_id
        ), ARRAY_A );
        if ( ! $team ) return null;

        $players = $wpdb->get_results( $wpdb->prepare(
            "SELECT p.first_name, p.last_name, p.position, ro.jersey_number
             FROM {$wpdb->prefix}grsh_rosters ro
             JOIN {$wpdb->prefix}grsh_players p ON p.id = ro.player_id
             WHERE ro.team_id = %d
             ORDER BY (ro.jersey_number IS NULL), ro.jersey_number ASC",
            $team_id
        ), ARRAY_A ) ?: [];

        $goalie = null;
        $others = [];
        foreach ( $players as $p ) {
            if ( $goalie === null && $p['position'] === 'goaltender' ) {
                $goalie = $p;
            } else {
                $others[] = $p;
            }
        }

        return [
            'name'           => $team['name'],
            'division_label' => self::division_label( $team['division'] ),
            'goalie'         => $goalie,
            'players'        => $others,
        ];
    }

    public static function render_admin_page(): void {
        if ( ! current_user_can( 'manage_options' ) ) {
            wp_die( 'Not allowed.' );
        }

        wp_enqueue_script(
            'grsh-score-sheets-admin',
            GRSH_PLUGIN_URL . 'assets/score-sheets-admin.js',
            [],
            GRSH_VERSION,
            true
        );

        $teams = self::get_teams_for_dropdown();

        echo '<div class="wrap"><h1>' . esc_html__( 'Print Score Sheets', 'grsh' ) . '</h1>';
        echo '<p>' . esc_html__( 'Add one or more matchups to the batch, then generate all of them as print-ready score sheets in a new tab.', 'grsh' ) . '</p>';

        echo '<div style="display:flex;gap:20px;flex-wrap:wrap;max-width:900px;">';
        echo '<div style="flex:1;min-width:300px;background:#fff;border:1px solid #ccd0d4;border-radius:6px;padding:16px;">';
        echo '<h2 style="margin-top:0;">' . esc_html__( 'Add a matchup', 'grsh' ) . '</h2>';

        echo '<p><label>' . esc_html__( 'Home Team', 'grsh' ) . '<br><select id="grsh-home-team" style="width:100%;">';
        echo '<option value="0">' . esc_html__( '— Blank / TBD —', 'grsh' ) . '</option>';
        foreach ( $teams as $t ) {
            echo '<option value="' . esc_attr( $t['id'] ) . '">' . esc_html( $t['name'] . ' (' . self::division_label( $t['division'] ) . ')' ) . '</option>';
        }
        echo '</select></label></p>';

        echo '<p><label>' . esc_html__( 'Away Team', 'grsh' ) . '<br><select id="grsh-away-team" style="width:100%;">';
        echo '<option value="0">' . esc_html__( '— Blank / TBD —', 'grsh' ) . '</option>';
        foreach ( $teams as $t ) {
            echo '<option value="' . esc_attr( $t['id'] ) . '">' . esc_html( $t['name'] . ' (' . self::division_label( $t['division'] ) . ')' ) . '</option>';
        }
        echo '</select></label></p>';

        echo '<p><label>' . esc_html__( 'Date', 'grsh' ) . '<br><input type="date" id="grsh-date" style="width:100%;"></label></p>';
        echo '<p><label>' . esc_html__( 'Game Time', 'grsh' ) . '<br><input type="time" id="grsh-time" style="width:100%;"></label></p>';
        echo '<p><label>' . esc_html__( 'Arena', 'grsh' ) . '<br><input type="text" id="grsh-arena" style="width:100%;"></label></p>';
        echo '<p><label>' . esc_html__( 'Game No.', 'grsh' ) . '<br><input type="text" id="grsh-game-no" style="width:100%;"></label></p>';

        echo '<p>' . esc_html__( 'Type', 'grsh' ) . '<br>';
        foreach ( [ 'REG' => 'Regular', 'MAKEUP' => 'Makeup', 'PLAY-OFF' => 'Play-off', 'CHAMP' => 'Championship' ] as $val => $label ) {
            $checked = $val === 'REG' ? ' checked' : '';
            echo '<label style="margin-right:10px;"><input type="radio" name="grsh-type" value="' . esc_attr( $val ) . '"' . $checked . '> ' . esc_html( $label ) . '</label>';
        }
        echo '</p>';

        echo '<button type="button" id="grsh-add-matchup" class="button button-primary">' . esc_html__( 'Add to batch', 'grsh' ) . '</button>';
        echo '</div>';

        echo '<div style="flex:1;min-width:300px;background:#fff;border:1px solid #ccd0d4;border-radius:6px;padding:16px;">';
        echo '<h2 style="margin-top:0;">' . esc_html__( 'Queued matchups', 'grsh' ) . ' (<span id="grsh-queue-count">0</span>)</h2>';
        echo '<ul id="grsh-matchup-list" style="list-style:none;margin:0 0 16px;padding:0;"></ul>';

        echo '<form id="grsh-matchup-form" method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" target="_blank">';
        echo '<input type="hidden" name="action" value="grsh_print_score_sheets">';
        wp_nonce_field( 'grsh_print_score_sheets', 'grsh_print_nonce' );
        echo '<input type="hidden" name="matchups" id="grsh-matchups-json" value="">';
        echo '<button type="submit" id="grsh-generate-btn" class="button button-primary" disabled>' . esc_html__( 'Generate Score Sheets', 'grsh' ) . '</button>';
        echo '</form>';
        echo '</div>';
        echo '</div>';
        echo '</div>';
    }

    public static function handle_print_request(): void {
        if ( ! current_user_can( 'manage_options' ) ) {
            wp_die( 'Not allowed.' );
        }
        check_admin_referer( 'grsh_print_score_sheets', 'grsh_print_nonce' );

        // Temporary debug hardening: this handler runs outside the normal
        // page lifecycle (admin-post.php) so a fatal here can produce a
        // totally blank response on hosts with display_errors off. Force
        // errors to surface in the response instead of vanishing silently.
        ini_set( 'display_errors', '1' );
        error_reporting( E_ALL );

        try {
            self::do_handle_print_request();
        } catch ( \Throwable $e ) {
            header( 'Content-Type: text/plain; charset=utf-8' );
            echo "GRSH Score Sheets error - please copy this entire message:\n\n";
            echo $e->getMessage() . "\n\n";
            echo $e->getFile() . ':' . $e->getLine() . "\n\n";
            echo $e->getTraceAsString();
            exit;
        }
    }

    private static function do_handle_print_request(): void {
        $raw      = isset( $_POST['matchups'] ) ? wp_unslash( $_POST['matchups'] ) : '';
        $matchups = json_decode( $raw, true );
        if ( ! is_array( $matchups ) || empty( $matchups ) ) {
            wp_die( 'No matchups submitted.' );
        }

        $sheets = [];
        foreach ( $matchups as $m ) {
            $home = self::get_team_sheet_data( (int) ( $m['home_id'] ?? 0 ) );
            $away = self::get_team_sheet_data( (int) ( $m['away_id'] ?? 0 ) );
            if ( ! $home || ! $away ) {
                continue;
            }
            $sheets[] = [
                'home'      => $home,
                'away'      => $away,
                'date'      => sanitize_text_field( $m['date'] ?? '' ),
                'game_time' => sanitize_text_field( $m['game_time'] ?? '' ),
                'arena'     => sanitize_text_field( $m['arena'] ?? '' ),
                'game_no'   => sanitize_text_field( $m['game_no'] ?? '' ),
                'type'      => sanitize_text_field( $m['type'] ?? 'REG' ),
            ];
        }

        if ( empty( $sheets ) ) {
            wp_die( 'None of the submitted matchups matched a valid team.' );
        }

        header( 'Content-Type: text/html; charset=utf-8' );
        self::render_print_page( $sheets );
        exit;
    }

    private static function render_print_page( array $sheets ): void {
        echo '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">';
        echo '<title>Gold Rush Adult Hockey Tournament - Score Sheets</title><style>';
        echo '@page{size:letter landscape;margin:0.3in}';
        echo '*{box-sizing:border-box}';
        echo 'body{font-family:Arial,Helvetica,sans-serif;color:#1a1a2e;margin:0}';
        echo '.toolbar{padding:10px;background:#1a1a2e;text-align:center}';
        echo '.toolbar p{color:#D4A017;font-weight:bold;margin:0;font-size:13px}';
        echo '.sheet{page-break-after:always;padding:6px 4px 0}';
        echo '.sheet:last-child{page-break-after:auto}';
        echo 'table{border-collapse:collapse;width:100%}';
        echo 'th,td{border:1px solid #1a1a2e;font-size:8px;padding:2px 3px;text-align:center}';
        echo 'th{background:#1a1a2e;color:#D4A017}';
        echo '.title{text-align:center;font-size:22px;font-weight:bold;margin:0}';
        echo '.subtitle{text-align:center;font-size:11px;font-weight:bold;margin:2px 0 8px}';
        echo '.cols{display:flex;gap:8px;align-items:flex-start}';
        echo '.col{flex:1}';
        echo '.lbl{font-weight:bold;font-size:8.5px;margin:6px 0 2px}';
        echo '.goalie-row td{background:#FCE8B8;font-weight:bold}';
        echo '.info-table td{text-align:left}';
        echo '.info-table td:first-child{font-weight:bold;width:60px}';
        echo '@media print{.toolbar{display:none}.sheet{page-break-after:always}}';
        echo '</style></head><body>';
        echo '<div class="toolbar"><p>Use your browser Print command (Ctrl+P or File &gt; Print) to print or save as PDF.</p></div>';

        foreach ( $sheets as $s ) {
            echo '<div class="sheet">';
            echo '<p class="title">GOLD RUSH ADULT HOCKEY TOURNAMENT</p>';
            echo '<p class="subtitle">OFFICIAL SCORE SHEET</p>';
            echo '<div class="cols">';

            // Home roster
            $home_label = $s['home']['name'] !== ''
                ? esc_html( $s['home']['name'] ) . ' (' . esc_html( $s['home']['division_label'] ) . ')'
                : '<span style="display:inline-block;width:180px;border-bottom:1px solid #1a1a2e;">&nbsp;</span>';
            echo '<div class="col" style="flex:1.5">';
            echo '<div class="lbl">HOME: ' . $home_label . '</div>';
            echo self::render_roster_table( $s['home'] );
            echo '</div>';

            // Center info + periods
            echo '<div class="col" style="flex:1">';
            echo '<div class="lbl">GAME INFO</div>';
            echo '<table class="info-table">';
            foreach ( [ 'Date' => $s['date'], 'Time' => $s['game_time'], 'Arena' => $s['arena'], 'Game #' => $s['game_no'], 'Type' => $s['type'] ] as $k => $v ) {
                echo '<tr><td>' . esc_html( $k ) . '</td><td>' . esc_html( $v ) . '</td></tr>';
            }
            echo '</table>';
            echo '<div class="lbl">SCORING BY PERIODS</div>';
            echo '<table><tr><th></th><th>1</th><th>2</th><th>OT</th><th>TOTAL</th></tr>';
            echo '<tr><td>HOME</td><td></td><td></td><td></td><td></td></tr>';
            echo '<tr><td>VISITOR</td><td></td><td></td><td></td><td></td></tr></table>';
            echo '</div>';

            // Away roster
            $away_label = $s['away']['name'] !== ''
                ? esc_html( $s['away']['name'] ) . ' (' . esc_html( $s['away']['division_label'] ) . ')'
                : '<span style="display:inline-block;width:180px;border-bottom:1px solid #1a1a2e;">&nbsp;</span>';
            echo '<div class="col" style="flex:1.5">';
            echo '<div class="lbl">AWAY: ' . $away_label . '</div>';
            echo self::render_roster_table( $s['away'] );
            echo '</div>';
            echo '</div>'; // .cols

            // Goalkeeping + signatures
            echo '<div class="cols" style="margin-top:8px">';
            foreach ( [ 'HOME' => 'HOME', 'AWAY' => 'AWAY' ] as $side => $label ) {
                if ( $side === 'AWAY' ) {
                    echo '<div class="col" style="flex:2"><div class="lbl">SIGNATURES</div><table class="info-table">';
                    echo '<tr><td>Scorer</td><td>&nbsp;</td></tr>';
                    echo '<tr><td>Referee 1</td><td>&nbsp;</td></tr>';
                    echo '<tr><td>Referee 2</td><td>&nbsp;</td></tr>';
                    echo '</table></div>';
                }
                echo '<div class="col"><div class="lbl">' . esc_html( $label ) . ' GOALKEEPING STATS</div>';
                echo '<table><tr><th></th><th>1</th><th>2</th><th>OT/SO</th><th>TOTAL</th></tr>';
                foreach ( [ 'GOALKEEPER', 'SHOTS', 'SAVES' ] as $row ) {
                    echo '<tr><td>' . esc_html( $row ) . '</td><td></td><td></td><td></td><td></td></tr>';
                }
                echo '</table></div>';
            }
            echo '</div>';

            // Penalties
            echo '<div class="cols" style="margin-top:8px">';
            foreach ( [ 'HOME', 'AWAY' ] as $side ) {
                echo '<div class="col"><div class="lbl">' . esc_html( $side ) . ' PENALTIES</div>';
                echo '<table><tr><th>Half</th><th>#</th><th>Offense</th><th>Min</th><th>Off</th><th>On</th></tr>';
                for ( $i = 0; $i < 4; $i++ ) {
                    echo '<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>';
                }
                echo '</table></div>';
            }
            echo '</div>';
            echo '</div>'; // .sheet
        }
        echo '</body></html>';
    }

    public static function render_roster_table( array $team ): string {
        $rows = '';
        $g    = $team['goalie'];
        $rows .= '<tr class="goalie-row"><td>Goalie</td><td>'
            . ( $g ? esc_html( (string) $g['jersey_number'] ) : '' ) . '</td><td>'
            . ( $g ? esc_html( $g['first_name'] . ' ' . $g['last_name'] ) : '' ) . '</td></tr>';
        for ( $i = 0; $i < 16; $i++ ) {
            $p      = $team['players'][ $i ] ?? null;
            $jersey = $p ? esc_html( (string) $p['jersey_number'] ) : '';
            $name   = $p ? esc_html( $p['first_name'] . ' ' . $p['last_name'] ) : '';
            $rows  .= '<tr><td>' . ( $i + 1 ) . '</td><td>' . $jersey . '</td><td>' . $name . '</td></tr>';
        }
        return '<table><tr><th>Pos</th><th>#</th><th>Name</th></tr>' . $rows . '</table>';
    }
}
