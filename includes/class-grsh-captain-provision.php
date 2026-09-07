<?php
/**
 * GRSH Captain Provision — shared logic for turning a name + email into
 * a real WordPress account (role: grsh_captain) plus a first full_team,
 * without requiring the person to already be logged in.
 *
 * Built 2026-08-19 to close the gap found while writing staff
 * registration docs: nothing in this plugin ever called
 * wp_insert_user()/wp_new_user_notification() for a captain. Grepped
 * the whole plugin first to confirm — zero matches anywhere.
 *
 * Two callers, one implementation, so behavior never diverges:
 *   - GRSH_Captain_Invite   — staff-run "Invite a Captain" admin tool
 *   - GRSH_Captain_Signup   — public [grsh_captain_signup] self-serve form
 *
 * Deliberately does NOT touch class-grsh-captain-sync.php or its
 * FORM_ID=2273 — that file syncs a *Tahoe Champions Cup* WPForms form
 * and never created accounts even for its own intended entries. This
 * class is the actual account-creation piece; it was simply missing.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class GRSH_Captain_Provision {

    /**
     * @return array{
     *   ok: bool,
     *   error?: string,
     *   status?: int,
     *   user_id?: int,
     *   created_user?: bool,
     *   ...  // team fields (GRSH_Captain_Roster::format_team() shape) when ok
     * }
     */
    public static function provision( string $name, string $email, string $team_name, string $division ): array {
        $email = sanitize_email( trim( $email ) );
        if ( ! is_email( $email ) ) {
            return [ 'ok' => false, 'error' => 'A valid email address is required.', 'status' => 400 ];
        }

        $name = sanitize_text_field( trim( $name ) );
        if ( ! $name ) {
            return [ 'ok' => false, 'error' => 'Captain name is required.', 'status' => 400 ];
        }

        // Validate team name / division up front too, so we never create
        // an account and then fail on the team — cheap to check twice,
        // avoids leaving an orphaned account behind on a bad division key.
        $team_name_check = sanitize_text_field( trim( $team_name ) );
        if ( ! $team_name_check ) {
            return [ 'ok' => false, 'error' => 'Team name is required.', 'status' => 400 ];
        }
        $valid_divisions = class_exists( 'GRSH_Settings' )
            ? array_column( GRSH_Settings::get_active_divisions(), 'key' )
            : [];
        if ( ! in_array( sanitize_key( $division ), $valid_divisions, true ) ) {
            return [ 'ok' => false, 'error' => 'Choose a valid division.', 'status' => 400 ];
        }

        [ $user_id, $created_user ] = self::find_or_create_user( $name, $email );
        if ( ! $user_id ) {
            return [ 'ok' => false, 'error' => 'Could not create an account for that email.', 'status' => 500 ];
        }

        $player_id = self::find_or_create_player( $user_id, $name, $email );
        $season_id = self::get_season_id();

        $team_result = GRSH_Captain_Roster::create_team_for_player( $player_id, $season_id, $team_name, $division );
        if ( isset( $team_result['error'] ) ) {
            // Account may already have existed (created_user=false) or be
            // brand new — either way, leave it in place. A half-made
            // account with no team is harmless and recoverable (staff can
            // just try the invite again with a different team name), and
            // silently deleting a brand-new user here risks deleting one
            // that was actually a pre-existing real account we matched by
            // email.
            return [
                'ok'            => false,
                'error'         => $team_result['error'],
                'status'        => $team_result['status'] ?? 400,
                // Passed through so the admin Invite Captain tool can link
                // directly to the existing team on a duplicate. Added
                // 2026-09-01.
                'existing_team' => $team_result['existing_team'] ?? null,
            ];
        }

        return array_merge(
            [ 'ok' => true, 'user_id' => $user_id, 'created_user' => $created_user ],
            $team_result
        );
    }

    /**
     * Read-only pre-check for the admin Invite Captain form: does this
     * email already belong to a captain with a team this season? Never
     * creates a user, player, or team — purely a lookup, so it's safe to
     * call on every keystroke/blur without side effects. Added
     * 2026-09-01 to support an inline duplicate warning before submit.
     *
     * @return array{exists: bool, existing_team?: array|null}
     */
    public static function check_existing_team( string $name, string $email ): array {
        $email     = sanitize_email( trim( $email ) );
        $season_id = self::get_season_id();
        global $wpdb;

        $result = [ 'exists' => false, 'possible_matches' => [] ];

        if ( is_email( $email ) ) {
            $user = get_user_by( 'email', $email );
            if ( $user ) {
                $player_id = (int) $wpdb->get_var( $wpdb->prepare(
                    "SELECT id FROM {$wpdb->prefix}grsh_players WHERE wp_user_id = %d", $user->ID
                ) );
                if ( $player_id ) {
                    $existing = $wpdb->get_row( $wpdb->prepare(
                        "SELECT id, name, division FROM {$wpdb->prefix}grsh_teams
                         WHERE season_id = %d AND team_type = 'full_team' AND captain_player_id = %d LIMIT 1",
                        $season_id, $player_id
                    ), ARRAY_A );
                    if ( $existing ) {
                        $result['exists']        = true;
                        $result['existing_team'] = [
                            'id'       => (int) $existing['id'],
                            'name'     => (string) $existing['name'],
                            'division' => (string) $existing['division'],
                        ];
                    }
                }
            }
        }

        // Fuzzy name check, added 2026-09-01 — the exact-email check above
        // only catches a captain re-invited with the SAME address. A
        // slightly different or new email for the same real person (typo,
        // new inbox) sails right through it. This is advisory only, never
        // blocks submission — just a "did you mean" hint, since a name
        // match alone is not proof of identity.
        $name = trim( $name );
        if ( ! $result['exists'] && $name !== '' && strlen( $name ) >= 3 ) {
            $captains = $wpdb->get_results( $wpdb->prepare(
                "SELECT p.first_name, p.last_name, p.email, t.id AS team_id, t.name AS team_name, t.division
                 FROM {$wpdb->prefix}grsh_teams t
                 INNER JOIN {$wpdb->prefix}grsh_players p ON p.id = t.captain_player_id
                 WHERE t.season_id = %d AND t.team_type = 'full_team'",
                $season_id
            ), ARRAY_A );

            $needle = strtolower( $name );
            foreach ( (array) $captains as $c ) {
                $candidate = strtolower( trim( $c['first_name'] . ' ' . $c['last_name'] ) );
                if ( $candidate === '' ) {
                    continue;
                }
                similar_text( $needle, $candidate, $pct );
                // Also catches the exact-name-different-email case
                // directly, not just close spellings.
                if ( $pct >= 82.0 || $candidate === $needle ) {
                    $result['possible_matches'][] = [
                        'name'     => trim( $c['first_name'] . ' ' . $c['last_name'] ),
                        'email'    => (string) $c['email'],
                        'team_id'  => (int) $c['team_id'],
                        'team'     => (string) $c['team_name'],
                        'division' => (string) $c['division'],
                    ];
                }
            }
        }

        return $result;
    }

    /**
     * @return array{0: ?int, 1: bool} [user_id, was_newly_created]
     */
    private static function find_or_create_user( string $name, string $email ): array {
        $existing = get_user_by( 'email', $email );
        if ( $existing ) {
            if ( ! in_array( 'grsh_captain', (array) $existing->roles, true ) ) {
                $existing->add_role( 'grsh_captain' );
            }
            return [ $existing->ID, false ];
        }

        $name_parts = explode( ' ', $name, 2 );
        $username   = self::unique_username( $email );

        $user_id = wp_insert_user( [
            'user_login'   => $username,
            'user_email'   => $email,
            'user_pass'    => wp_generate_password( 20, true ),
            'first_name'   => $name_parts[0] ?? $name,
            'last_name'    => $name_parts[1] ?? '',
            'display_name' => $name,
            'role'         => 'grsh_captain',
        ] );

        if ( is_wp_error( $user_id ) ) {
            return [ null, false ];
        }

        // WordPress's own "set your password" email — this is the actual
        // fix for "captain gets an email to log in." Mode 'user' sends
        // only to the new user (a password-set link, never a plaintext
        // password), not an admin copy.
        wp_new_user_notification( $user_id, null, 'user' );

        return [ (int) $user_id, true ];
    }

    private static function unique_username( string $email ): string {
        $local = strtok( $email, '@' ) ?: 'captain';
        $base  = sanitize_user( $local, true );
        $base  = $base !== '' ? $base : 'captain';
        $try   = $base;
        $i     = 1;
        while ( username_exists( $try ) ) {
            $try = $base . $i;
            $i++;
        }
        return $try;
    }

    private static function find_or_create_player( int $user_id, string $name, string $email ): int {
        global $wpdb;

        $player_id = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}grsh_players WHERE wp_user_id = %d", $user_id
        ) );
        if ( $player_id ) {
            return $player_id;
        }

        // Same fallback as GRSH_Captain_Roster::get_or_create_self_player()
        // — link an existing player row (e.g. a prior individual
        // registration) rather than creating a duplicate.
        $player_id = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}grsh_players WHERE email = %s", $email
        ) );
        if ( $player_id ) {
            $wpdb->update( "{$wpdb->prefix}grsh_players", [ 'wp_user_id' => $user_id ], [ 'id' => $player_id ] );
            return $player_id;
        }

        $name_parts = explode( ' ', $name, 2 );
        $wpdb->insert( "{$wpdb->prefix}grsh_players", [
            'first_name' => $name_parts[0] ?? $name,
            'last_name'  => $name_parts[1] ?? '',
            'email'      => $email,
            'wp_user_id' => $user_id,
        ] );
        return (int) $wpdb->insert_id;
    }

    /**
     * Same pattern as GRSH_Captain_Roster::get_season_id() and
     * GRSH_Admin_Full_Teams::get_season_id() — reads Settings, not a
     * hardcoded constant.
     */
    private static function get_season_id(): int {
        global $wpdb;
        $season_year = (int) ( GRSH_Settings::get()['season_year'] ?? 0 );
        $id = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}grsh_seasons WHERE season_year = %d LIMIT 1",
            $season_year
        ) );
        return $id ?: 1;
    }
}
