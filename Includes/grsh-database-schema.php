<?php
/**
 * Gold Rush Senior Hockey — Database Schema
 * Plugin: GRSH Tournament Manager
 * Developer: Tech Tribe Consulting
 *
 * 
 *    
 * Registers and creates all custom database tables.
 * Called on plugin activation via register_activation_hook().
 *
 * Tables:
 *   wp_grsh_seasons           — tournament seasons
 *   wp_grsh_players           — master player records
 *   wp_grsh_registrations     — per-season registration entries
 *   wp_grsh_availability      — sub/alternate scheduling data
 *   wp_grsh_teams             — teams per season/division
 *   wp_grsh_rosters           — player-to-team assignments
 *   wp_grsh_player_history    — historical season records
 *   wp_grsh_audit_logs        — admin action audit trail
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class GRSH_Database {

    const DB_VERSION     = '1.2.0';
    const DB_VERSION_KEY = 'grsh_db_version';

    /**
     * Run on plugin activation.
     */
    public static function install(): void {
        self::create_tables();
        update_option( self::DB_VERSION_KEY, self::DB_VERSION );
    }

    /**
     * Run on every page load via 'plugins_loaded'. Re-running create_tables()
     * lets dbDelta safely add new columns/keys to already-deployed tables
     * (team_type, jersey_number, uq_team_jersey). The form_id NOT NULL → NULL
     * change is a constraint loosening dbDelta does not reliably apply, so
     * it is run explicitly and guarded so it only fires once.
     *
     * Added in 1.2.0 — full-team (captain-registered) roster support.
     */
    public static function maybe_upgrade(): void {
        $installed = get_option( self::DB_VERSION_KEY, '0' );
        if ( version_compare( $installed, self::DB_VERSION, '>=' ) ) {
            return;
        }

        global $wpdb;
        self::create_tables();

        $column = $wpdb->get_row( $wpdb->prepare(
            "SELECT IS_NULLABLE FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND COLUMN_NAME = 'form_id'",
            DB_NAME, "{$wpdb->prefix}grsh_registrations"
        ) );
        if ( $column && $column->IS_NULLABLE === 'NO' ) {
            $wpdb->query(
                "ALTER TABLE {$wpdb->prefix}grsh_registrations
                 MODIFY form_id INT UNSIGNED DEFAULT NULL"
            );
        }

        update_option( self::DB_VERSION_KEY, self::DB_VERSION );
    }

    /**
     * Create all tables using dbDelta for safe upgrades.
     */
    public static function create_tables(): void {
        global $wpdb;

        $charset = $wpdb->get_charset_collate();

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        // -----------------------------------------------------------------
        // 1. SEASONS
        //    One row per tournament year.
        // -----------------------------------------------------------------
        dbDelta( "
            CREATE TABLE {$wpdb->prefix}grsh_seasons (
                id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
                season_year     SMALLINT UNSIGNED NOT NULL,
                label           VARCHAR(100) NOT NULL,
                form_id         INT UNSIGNED NOT NULL COMMENT 'WPForms form ID for this season',
                status          ENUM('setup','open','draft','locked','complete')
                                    NOT NULL DEFAULT 'setup',
                registration_opens  DATETIME DEFAULT NULL,
                registration_closes DATETIME DEFAULT NULL,
                draft_date          DATE DEFAULT NULL,
                created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY     (id),
                UNIQUE KEY      uq_season_year (season_year)
            ) $charset;
        " );

        // -----------------------------------------------------------------
        // 2. PLAYERS
        //    Master record — one row per unique person across all seasons.
        //    Identity deduplication is done here.
        // -----------------------------------------------------------------
        dbDelta( "
            CREATE TABLE {$wpdb->prefix}grsh_players (
                id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,

                -- Identity
                first_name          VARCHAR(100) NOT NULL,
                last_name           VARCHAR(100) NOT NULL,
                email               VARCHAR(191) NOT NULL,
                phone               VARCHAR(30) DEFAULT NULL,

                -- Hockey profile
                position            ENUM(
                                        'defenseman','center','winger','goaltender'
                                    ) DEFAULT NULL,
                skill_tier_reported VARCHAR(5) DEFAULT NULL
                                    COMMENT 'Self-reported: A1-A3, B1-B3, C1-C2, R1-R3',
                skill_tier_assigned VARCHAR(5) DEFAULT NULL
                                    COMMENT 'Committee override',
                current_league      VARCHAR(50) DEFAULT NULL,
                years_experience    TINYINT UNSIGNED DEFAULT NULL,

                -- Equipment
                jersey_size         ENUM('Small','Medium','Large','XL','2XL','3XL','Goalie')
                                        DEFAULT NULL,
                tshirt_size         ENUM('Small','Medium','Large','XL','2XL','3XL')
                                        DEFAULT NULL,
                tshirt_type         ENUM('Short Sleeve','Long Sleeve') DEFAULT NULL,

                -- Status flags
                is_alternate        TINYINT(1) NOT NULL DEFAULT 0,
                is_goalie           TINYINT(1) NOT NULL DEFAULT 0,
                is_locked           TINYINT(1) NOT NULL DEFAULT 0
                                    COMMENT 'Prevent accidental reassignment',
                sandbagging_flag    TINYINT(1) NOT NULL DEFAULT 0,
                suspended           TINYINT(1) NOT NULL DEFAULT 0,

                -- Reliability (updated after each season)
                attendance_rating   DECIMAL(5,2) DEFAULT NULL
                                    COMMENT 'Percentage of games attended',
                no_show_count       SMALLINT UNSIGNED NOT NULL DEFAULT 0,

                -- Admin
                notes               TEXT DEFAULT NULL,
                wp_user_id          BIGINT UNSIGNED DEFAULT NULL
                                    COMMENT 'Linked WP user if exists',

                created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP,

                PRIMARY KEY         (id),
                UNIQUE KEY          uq_email (email),
                KEY                 idx_last_name (last_name),
                KEY                 idx_position (position),
                KEY                 idx_skill_tier (skill_tier_reported),
                KEY                 idx_is_alternate (is_alternate),
                KEY                 idx_sandbagging (sandbagging_flag)
            ) $charset;
        " );

        // -----------------------------------------------------------------
        // 3. REGISTRATIONS
        //    One row per player per season.
        //    Links a player record to a specific season's form submission.
        // -----------------------------------------------------------------
        dbDelta( "
            CREATE TABLE {$wpdb->prefix}grsh_registrations (
                id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
                player_id           INT UNSIGNED NOT NULL,
                season_id           INT UNSIGNED NOT NULL,

                -- Source
                form_id             INT UNSIGNED DEFAULT NULL
                                    COMMENT 'WPForms form ID; NULL for manually-created (captain) registrations',
                wpforms_entry_id    BIGINT UNSIGNED DEFAULT NULL
                                    COMMENT 'WPForms entry ID for lookup',
                source              ENUM('wpforms','csv','manual')
                                        NOT NULL DEFAULT 'wpforms',

                -- Registration type
                player_type         ENUM('primary','sub') NOT NULL DEFAULT 'primary',

                -- Division
                division_requested  ENUM(
                                        'gold_open','45a','senior_b','senior_c','womens'
                                    ) DEFAULT NULL,
                division_assigned   ENUM(
                                        'gold_open','45a','senior_b','senior_c','womens'
                                    ) DEFAULT NULL
                                    COMMENT 'Set by committee, may differ from requested',

                -- Age at time of registration
                age                 TINYINT UNSIGNED DEFAULT NULL,

                -- Payment
                amount_paid         DECIMAL(8,2) NOT NULL DEFAULT 0.00,
                payment_method      ENUM('paypal','credit_card','waived','comp','other')
                                        DEFAULT NULL,
                payment_status      ENUM('paid','pending','waived','refunded','failed')
                                        NOT NULL DEFAULT 'pending',
                payment_date        DATETIME DEFAULT NULL,

                -- Legal
                waiver_accepted     TINYINT(1) NOT NULL DEFAULT 0,
                esignature          VARCHAR(200) DEFAULT NULL,
                signed_at           DATETIME DEFAULT NULL,

                -- Workflow status
                status              ENUM(
                                        'registered','approved','draft_eligible',
                                        'assigned','waitlist','withdrawn',
                                        'injured_reserve','suspended'
                                    ) NOT NULL DEFAULT 'registered',

                -- Admin
                committee_notes     TEXT DEFAULT NULL,
                imported_at         DATETIME DEFAULT NULL
                                    COMMENT 'When sync engine processed this entry',

                created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP,

                PRIMARY KEY         (id),
                UNIQUE KEY          uq_player_season (player_id, season_id),
                UNIQUE KEY          uq_wpforms_entry (wpforms_entry_id),
                KEY                 idx_season (season_id),
                KEY                 idx_player_type (player_type),
                KEY                 idx_division_requested (division_requested),
                KEY                 idx_payment_status (payment_status),
                KEY                 idx_status (status),

                CONSTRAINT fk_reg_player
                    FOREIGN KEY (player_id)
                    REFERENCES {$wpdb->prefix}grsh_players (id)
                    ON DELETE RESTRICT,

                CONSTRAINT fk_reg_season
                    FOREIGN KEY (season_id)
                    REFERENCES {$wpdb->prefix}grsh_seasons (id)
                    ON DELETE RESTRICT
            ) $charset;
        " );

        // -----------------------------------------------------------------
        // 4. AVAILABILITY
        //    Sub/alternate scheduling preferences.
        //    One row per registration (subs only).
        // -----------------------------------------------------------------
        dbDelta( "
            CREATE TABLE {$wpdb->prefix}grsh_availability (
                id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
                player_id           INT UNSIGNED NOT NULL,
                season_id           INT UNSIGNED NOT NULL,
                registration_id     INT UNSIGNED NOT NULL,

                -- Scheduling preferences (from form fields 89, 86, 87, 88)
                available_days      JSON DEFAULT NULL
                                    COMMENT 'e.g. [\"thursday\",\"friday\",\"saturday\"]',
                max_games_per_day   TINYINT UNSIGNED DEFAULT NULL,
                late_game_available TINYINT(1) DEFAULT NULL,
                division_eligibility JSON DEFAULT NULL
                                    COMMENT 'e.g. [\"gold_open\",\"senior_b\"]',

                -- Activation tracking
                times_activated     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
                last_activated_at   DATETIME DEFAULT NULL,

                created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP,

                PRIMARY KEY         (id),
                UNIQUE KEY          uq_player_season (player_id, season_id),
                KEY                 idx_season (season_id),
                KEY                 idx_late_game (late_game_available),

                CONSTRAINT fk_avail_player
                    FOREIGN KEY (player_id)
                    REFERENCES {$wpdb->prefix}grsh_players (id)
                    ON DELETE RESTRICT,

                CONSTRAINT fk_avail_season
                    FOREIGN KEY (season_id)
                    REFERENCES {$wpdb->prefix}grsh_seasons (id)
                    ON DELETE RESTRICT,

                CONSTRAINT fk_avail_registration
                    FOREIGN KEY (registration_id)
                    REFERENCES {$wpdb->prefix}grsh_registrations (id)
                    ON DELETE CASCADE
            ) $charset;
        " );

        // -----------------------------------------------------------------
        // 5. TEAMS
        //    One row per team per season per division.
        // -----------------------------------------------------------------
        dbDelta( "
            CREATE TABLE {$wpdb->prefix}grsh_teams (
                id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
                season_id           INT UNSIGNED NOT NULL,
                division            ENUM(
                                        'gold_open','45a','senior_b','senior_c','womens'
                                    ) NOT NULL,
                team_type           ENUM('draft','full_team') NOT NULL DEFAULT 'draft'
                                    COMMENT 'How this team was formed — drives which roster rules apply',
                name                VARCHAR(100) NOT NULL,
                colour              VARCHAR(50) DEFAULT NULL,
                captain_player_id   INT UNSIGNED DEFAULT NULL,

                -- Parity scores (computed by auto-balance engine)
                skill_score         DECIMAL(8,4) DEFAULT NULL,
                age_score           DECIMAL(8,4) DEFAULT NULL,
                parity_score        DECIMAL(8,4) DEFAULT NULL,

                -- Draft
                draft_order         TINYINT UNSIGNED DEFAULT NULL,
                draft_locked        TINYINT(1) NOT NULL DEFAULT 0,

                created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP,

                PRIMARY KEY         (id),
                KEY                 idx_season_division (season_id, division),

                CONSTRAINT fk_team_season
                    FOREIGN KEY (season_id)
                    REFERENCES {$wpdb->prefix}grsh_seasons (id)
                    ON DELETE RESTRICT,

                CONSTRAINT fk_team_captain
                    FOREIGN KEY (captain_player_id)
                    REFERENCES {$wpdb->prefix}grsh_players (id)
                    ON DELETE SET NULL
            ) $charset;
        " );

        // -----------------------------------------------------------------
        // 6. ROSTERS
        //    Player-to-team assignments. One row per player per team.
        // -----------------------------------------------------------------
        dbDelta( "
            CREATE TABLE {$wpdb->prefix}grsh_rosters (
                id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
                season_id           INT UNSIGNED NOT NULL,
                team_id             INT UNSIGNED NOT NULL,
                player_id           INT UNSIGNED NOT NULL,
                registration_id     INT UNSIGNED NOT NULL,

                -- Assignment metadata
                assignment_type     ENUM('draft','auto','manual') NOT NULL DEFAULT 'manual',
                draft_round         TINYINT UNSIGNED DEFAULT NULL,
                draft_pick          TINYINT UNSIGNED DEFAULT NULL,
                is_captain          TINYINT(1) NOT NULL DEFAULT 0,
                is_alternate        TINYINT(1) NOT NULL DEFAULT 0,
                jersey_number       TINYINT UNSIGNED DEFAULT NULL
                                    COMMENT 'Unique within team_id; the same number may be reused on a different team',

                -- Snapshot at time of assignment
                position_assigned   ENUM(
                                        'defenseman','center','winger','goaltender'
                                    ) DEFAULT NULL,
                skill_tier_at_draft VARCHAR(5) DEFAULT NULL,

                assigned_by         BIGINT UNSIGNED DEFAULT NULL
                                    COMMENT 'WP user ID of admin who made assignment',
                assigned_at         DATETIME DEFAULT NULL,

                created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP,

                PRIMARY KEY         (id),
                UNIQUE KEY          uq_player_team (player_id, team_id),
                UNIQUE KEY          uq_team_jersey (team_id, jersey_number),
                KEY                 idx_season (season_id),
                KEY                 idx_team (team_id),
                KEY                 idx_player (player_id),

                CONSTRAINT fk_roster_season
                    FOREIGN KEY (season_id)
                    REFERENCES {$wpdb->prefix}grsh_seasons (id)
                    ON DELETE RESTRICT,

                CONSTRAINT fk_roster_team
                    FOREIGN KEY (team_id)
                    REFERENCES {$wpdb->prefix}grsh_teams (id)
                    ON DELETE RESTRICT,

                CONSTRAINT fk_roster_player
                    FOREIGN KEY (player_id)
                    REFERENCES {$wpdb->prefix}grsh_players (id)
                    ON DELETE RESTRICT,

                CONSTRAINT fk_roster_registration
                    FOREIGN KEY (registration_id)
                    REFERENCES {$wpdb->prefix}grsh_registrations (id)
                    ON DELETE RESTRICT
            ) $charset;
        " );

        // -----------------------------------------------------------------
        // 7. PLAYER HISTORY
        //    Post-season record written after each tournament completes.
        //    Drives sandbagging detection and carry-forward logic.
        // -----------------------------------------------------------------
        dbDelta( "
            CREATE TABLE {$wpdb->prefix}grsh_player_history (
                id                      INT UNSIGNED NOT NULL AUTO_INCREMENT,
                player_id               INT UNSIGNED NOT NULL,
                season_id               INT UNSIGNED NOT NULL,

                -- Division & team
                division_played         ENUM(
                                            'gold_open','45a','senior_b','senior_c','womens'
                                        ) DEFAULT NULL,
                team_id                 INT UNSIGNED DEFAULT NULL,
                team_name               VARCHAR(100) DEFAULT NULL,

                -- Season outcome
                finish_position         TINYINT UNSIGNED DEFAULT NULL
                                        COMMENT 'Regular season rank',
                championship_result     ENUM('winner','runner_up','participant','none')
                                            NOT NULL DEFAULT 'none',

                -- Roles
                was_captain             TINYINT(1) NOT NULL DEFAULT 0,
                was_alternate           TINYINT(1) NOT NULL DEFAULT 0,
                was_emergency_goalie    TINYINT(1) NOT NULL DEFAULT 0,

                -- Skill snapshot
                skill_tier_reported     VARCHAR(5) DEFAULT NULL,
                skill_tier_assigned     VARCHAR(5) DEFAULT NULL,
                sandbagging_flag        TINYINT(1) NOT NULL DEFAULT 0,

                -- Reliability
                games_scheduled         TINYINT UNSIGNED DEFAULT NULL,
                games_attended          TINYINT UNSIGNED DEFAULT NULL,
                no_show_count           TINYINT UNSIGNED NOT NULL DEFAULT 0,
                late_withdrawal_flag    TINYINT(1) NOT NULL DEFAULT 0,

                -- Import metadata
                import_source           ENUM('platform','csv','manual')
                                            NOT NULL DEFAULT 'platform',

                -- Admin
                committee_notes         TEXT DEFAULT NULL,

                created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                                            ON UPDATE CURRENT_TIMESTAMP,

                PRIMARY KEY             (id),
                UNIQUE KEY              uq_player_season (player_id, season_id),
                KEY                     idx_season (season_id),
                KEY                     idx_division (division_played),
                KEY                     idx_championship (championship_result),
                KEY                     idx_sandbagging (sandbagging_flag),

                CONSTRAINT fk_hist_player
                    FOREIGN KEY (player_id)
                    REFERENCES {$wpdb->prefix}grsh_players (id)
                    ON DELETE RESTRICT,

                CONSTRAINT fk_hist_season
                    FOREIGN KEY (season_id)
                    REFERENCES {$wpdb->prefix}grsh_seasons (id)
                    ON DELETE RESTRICT
            ) $charset;
        " );

        // -----------------------------------------------------------------
        // 8. AUDIT LOGS
        //    Immutable record of every admin action.
        //    No foreign key constraints — must survive record deletion.
        // -----------------------------------------------------------------
        dbDelta( "
            CREATE TABLE {$wpdb->prefix}grsh_audit_logs (
                id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                season_id       INT UNSIGNED DEFAULT NULL,

                -- Who
                wp_user_id      BIGINT UNSIGNED NOT NULL,
                user_display    VARCHAR(200) DEFAULT NULL
                                COMMENT 'Snapshot of display name at time of action',

                -- What
                action          VARCHAR(100) NOT NULL
                                COMMENT 'e.g. roster_assign, skill_override, draft_pick',
                object_type     VARCHAR(50) DEFAULT NULL
                                COMMENT 'e.g. player, team, roster, registration',
                object_id       INT UNSIGNED DEFAULT NULL,

                -- Change detail
                before_value    JSON DEFAULT NULL,
                after_value     JSON DEFAULT NULL,
                notes           TEXT DEFAULT NULL,

                -- Context
                ip_address      VARCHAR(45) DEFAULT NULL,
                user_agent      VARCHAR(255) DEFAULT NULL,

                created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

                PRIMARY KEY     (id),
                KEY             idx_season (season_id),
                KEY             idx_action (action),
                KEY             idx_object (object_type, object_id),
                KEY             idx_user (wp_user_id),
                KEY             idx_created (created_at)
            ) $charset;
        " );
    }

    /**
     * Drop all tables — used during plugin uninstall only.
     * Order respects foreign key constraints.
     */
    public static function uninstall(): void {
        global $wpdb;

        $tables = [
            'grsh_audit_logs',
            'grsh_player_history',
            'grsh_rosters',
            'grsh_availability',
            'grsh_registrations',
            'grsh_teams',
            'grsh_players',
            'grsh_seasons',
        ];

        $wpdb->query( 'SET FOREIGN_KEY_CHECKS = 0' );
        foreach ( $tables as $table ) {
            $wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}{$table}" );
        }
        $wpdb->query( 'SET FOREIGN_KEY_CHECKS = 1' );

        delete_option( self::DB_VERSION_KEY );
    }
}
