-- ============================================================================
-- GRSH Tournament Manager — Test Data Cleanup
-- ============================================================================
-- Removes ONLY data tagged per the board test convention:
--   players : email LIKE '%@grshtest.invalid'
--   teams   : name  LIKE 'ZZTEST - %'
--
-- Safe to run against the LIVE production database — it never touches a
-- row that doesn't match one of the two markers above. Real registrations
-- and real teams are untouched no matter how many exist alongside the test
-- data or how the season/settings have changed since the test was run.
--
-- Adjust the "wp_" prefix below if your table prefix isn't "wp_".
--
-- HOW TO RUN
--   1. Run STEP 0 + STEP 1 (dry run) only. Read the output. Confirm every
--      row listed is genuinely test data before going further.
--   2. Only then run STEP 2 (the actual deletes), top to bottom, in order —
--      the order matters because of foreign key constraints.
--   3. Read the note at the bottom about WordPress user accounts — this
--      script does not touch wp_users/wp_usermeta on purpose.
-- ============================================================================


-- ============================================================================
-- STEP 0 — build the working list of test player/team IDs (read-only, temp table)
-- ============================================================================
DROP TEMPORARY TABLE IF EXISTS tmp_grsh_test_player_ids;
CREATE TEMPORARY TABLE tmp_grsh_test_player_ids AS
    SELECT id, first_name, last_name, email
    FROM wp_grsh_players
    WHERE email LIKE '%@grshtest.invalid';

DROP TEMPORARY TABLE IF EXISTS tmp_grsh_test_team_ids;
CREATE TEMPORARY TABLE tmp_grsh_test_team_ids AS
    SELECT id, name, season_id
    FROM wp_grsh_teams
    WHERE name LIKE 'ZZTEST - %';


-- ============================================================================
-- STEP 1 — DRY RUN: review before deleting anything
-- ============================================================================

-- Players that will be deleted
SELECT * FROM tmp_grsh_test_player_ids;

-- Teams that will be deleted
SELECT * FROM tmp_grsh_test_team_ids;

-- Registrations that will be deleted
SELECT r.*
FROM wp_grsh_registrations r
WHERE r.player_id IN (SELECT id FROM tmp_grsh_test_player_ids);

-- Roster assignments that will be deleted (by test player OR test team)
SELECT ro.*
FROM wp_grsh_rosters ro
WHERE ro.player_id IN (SELECT id FROM tmp_grsh_test_player_ids)
   OR ro.team_id   IN (SELECT id FROM tmp_grsh_test_team_ids);

-- Availability / alternate rows that will be deleted
SELECT a.*
FROM wp_grsh_availability a
WHERE a.player_id IN (SELECT id FROM tmp_grsh_test_player_ids);

-- Player history rows that will be deleted (normally empty for brand-new
-- test players, included for completeness in case you re-ran a test
-- season more than once)
SELECT h.*
FROM wp_grsh_player_history h
WHERE h.player_id IN (SELECT id FROM tmp_grsh_test_player_ids);

-- Audit log rows referencing test players or test teams
SELECT al.*
FROM wp_grsh_audit_logs al
WHERE (al.object_type = 'player'       AND al.object_id IN (SELECT id FROM tmp_grsh_test_player_ids))
   OR (al.object_type = 'registration' AND al.object_id IN (SELECT id FROM tmp_grsh_test_player_ids))
   OR (al.object_type = 'team'         AND al.object_id IN (SELECT id FROM tmp_grsh_test_team_ids))
   OR (al.wp_user_id   IN (SELECT id FROM tmp_grsh_test_player_ids) AND al.action = 'alternate_activated');

-- STOP HERE. Read every result above. Every row must be recognizably a
-- test entry (grshtest.invalid email or ZZTEST- team name) before you
-- proceed to STEP 2.


-- ============================================================================
-- STEP 2 — ACTUAL DELETES (run only after reviewing STEP 1)
-- Order respects foreign key constraints: children before parents.
-- ============================================================================

-- 2a. Audit logs referencing test players/teams (no FK constraint, but
--     tidy up anyway so the audit trail doesn't carry orphaned test rows)
DELETE al FROM wp_grsh_audit_logs al
WHERE (al.object_type = 'player'       AND al.object_id IN (SELECT id FROM tmp_grsh_test_player_ids))
   OR (al.object_type = 'registration' AND al.object_id IN (SELECT id FROM tmp_grsh_test_player_ids))
   OR (al.object_type = 'team'         AND al.object_id IN (SELECT id FROM tmp_grsh_test_team_ids))
   OR (al.wp_user_id   IN (SELECT id FROM tmp_grsh_test_player_ids) AND al.action = 'alternate_activated');

-- 2b. Player history
DELETE h FROM wp_grsh_player_history h
WHERE h.player_id IN (SELECT id FROM tmp_grsh_test_player_ids);

-- 2c. Roster assignments (by test player OR test team, so a real player
--     accidentally rostered onto a test team also gets un-rostered —
--     check the STEP 1 dry run output for this case, it should be empty
--     in a clean test run)
DELETE ro FROM wp_grsh_rosters ro
WHERE ro.player_id IN (SELECT id FROM tmp_grsh_test_player_ids)
   OR ro.team_id   IN (SELECT id FROM tmp_grsh_test_team_ids);

-- 2d. Availability (sub/alternate scheduling rows)
DELETE a FROM wp_grsh_availability a
WHERE a.player_id IN (SELECT id FROM tmp_grsh_test_player_ids);

-- 2e. Registrations
DELETE r FROM wp_grsh_registrations r
WHERE r.player_id IN (SELECT id FROM tmp_grsh_test_player_ids);

-- 2f. Teams (direct filter, not via the temp table, to avoid MySQL error
--     1093 "can't specify target table for update in FROM clause")
DELETE FROM wp_grsh_teams
WHERE name LIKE 'ZZTEST - %';

-- 2g. Players (direct filter, same reason as 2f)
DELETE FROM wp_grsh_players
WHERE email LIKE '%@grshtest.invalid';

DROP TEMPORARY TABLE IF EXISTS tmp_grsh_test_player_ids;
DROP TEMPORARY TABLE IF EXISTS tmp_grsh_test_team_ids;


-- ============================================================================
-- NOT covered by this script — WordPress user accounts
-- ============================================================================
-- If any test captain was provisioned through the admin "Invite a Captain"
-- tool with a real (non-.invalid) inbox, that created an actual wp_users
-- row via wp_insert_user(). Don't delete it with raw SQL here — that
-- leaves orphaned wp_usermeta rows and stale session tokens behind.
-- Instead:
--   WP Admin → Users → search the test email → Delete (choose "delete"
--   rather than "attribute content to another user" when prompted)
-- or, with WP-CLI over SSH:
--   wp user list --search="*@grshtest.invalid*"
--   wp user delete <ID>   (repeat per match)
