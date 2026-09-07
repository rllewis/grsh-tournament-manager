# GRSH Tournament Manager — Board Test Data Plan

Live production site (grsht.com), 2027 season. Since there's no isolated
test season in this build (registration always writes to whichever season
is marked "open" in Settings — currently 2027), the safe path is: tag every
dummy record so it's unmistakable and mechanically deletable, run the real
workflow through the real UI, then run the cleanup script below.

## Tagging convention (use this for every piece of dummy data)

| What | Convention | Why |
|---|---|---|
| Every test player's email | `anything@grshtest.invalid` | `.invalid` is a domain reserved by RFC 2606 — it can never resolve or collide with a real inbox. `grsh_players.email` is also UNIQUE, so this guarantees no dummy record can silently merge with a real person's record. |
| Every test team name | Starts with `ZZTEST - ` (e.g. `ZZTEST - Ice Wolves`) | Sorts to the bottom of team lists, unmistakable to board members mid-test, and the cleanup script matches on it directly. |
| Notes / committee notes field, where the form/UI exposes one | `BOARD TEST DATA - safe to delete` | Belt-and-suspenders human-readable flag; not load-bearing for cleanup, the email domain is. |

Do not use a real board member's personal email for any test signup, even
with a "+test" suffix — a typo in the tag is a typo away from a real
person's registration getting deleted later. Use the `.invalid` domain, no
exceptions.

## Test scenario, mapped to the real workflow

**1. Single-player registration** (tests the public WPForms flow → sync →
`wp_grsh_players` / `wp_grsh_registrations`)
- Have 2-3 board members submit the live registration form (form ID 5047)
  using a fake name and a `@grshtest.invalid` email.
- Submit at least one with the "sub / alternate" checkbox checked (form
  field 84) — this is what sets `is_alternate = 1` and is what the
  Alternates admin page and draft pool both key off of.

**2. Full-team (captain) registration + alternates** (tests
`[grsh_captain_signup]` → `GRSH_Captain_Provision` → WP account + player +
`full_team`)
- Submit the public "Register My Team" form with a `@grshtest.invalid`
  email and a team name starting `ZZTEST - `. This creates a real WP user
  (role `grsh_captain`) and sends that user a password-set email — so use
  an email you or a board member can actually receive, still on the
  `.invalid`... **note:** `.invalid` addresses cannot receive mail, so the
  captain won't get the password-set link. Two options: (a) accept that
  and just add the team's players from the admin side (Admin → Full Teams,
  which can edit any captain's roster without needing the captain to log
  in), or (b) use the admin "Invite a Captain" tool instead of the public
  form, entering a real inbox you control but still tagging the *team
  name* `ZZTEST - `. Recommend (a) — keeps 100% of the tagging on the
  `.invalid` domain with zero manual cleanup of a real inbox.
- From Admin → Full Teams, add enough dummy players (`@grshtest.invalid`)
  to hit the division's `min_roster`, so team-size validation gets
  exercised too.

**3. Alternates activation** (tests `GRSH_Alternates::activate_alternate`)
- On the Alternates admin page, find one of the `is_alternate=1` test
  players from step 1 and log an activation (team, division, game date).
  Confirms the audit-log write and the duplicate-guard both work.

**4. Run the draft** (tests `Draft.jsx`'s live snake-draft board →
`POST /rosters/assign` with `assignment_type=draft`)
- Create 2+ draft-type teams (Rosters page → Add Team), names prefixed
  `ZZTEST - `.
- Open the Draft board, run a live round or two picking your test players
  from step 1 onto those teams. Confirms the timer, snake order, and that
  `draft_round`/`draft_pick` persist correctly.

**5. Print rosters** (tests the print modal in `Rosters.jsx` for
draft-formed teams, and the equivalent in `FullTeamRosters.jsx` for the
captain-registered team)
- Open Print on both pages, confirm the sheet renders your test teams/
  players correctly.

## Cleanup

Run `tools/cleanup-test-data.sql` (same folder tree, `tools/`) against the
production database — via SiteGround's phpMyAdmin (Site Tools → Databases
→ phpMyAdmin) or `wp db query` over WP-CLI if you have SSH set up. It's
built as: a **dry-run section first** (read-only SELECTs so you can see
exactly what will be deleted before anything runs), then the actual
deletes in FK-safe order.

**One thing SQL alone won't clean up:** if you went with option (b) above
and used the admin "Invite a Captain" tool with a real inbox, that
captain's WP user account isn't part of the plugin's own tables — remove
it from WordPress directly. Cleanest way: WP Admin → Users, search the
test email, delete the account (WordPress will ask whether to reassign or
delete their content — since it's a throwaway test account, delete). If
you have WP-CLI: `wp user list --search="*@grshtest.invalid*"` then
`wp user delete <ID>` per match. Using `wp_delete_user()` (via the admin
screen or WP-CLI) rather than raw SQL on `wp_users` matters here — raw SQL
deletion leaves orphaned rows in `wp_usermeta` and stale session tokens
behind.

## Still need from Lorenzo to actually run steps 1-5 via Claude

- The live URL(s) for the registration form and the `[grsh_captain_signup]`
  page.
- Whether Claude should drive this via Chrome (only against a session
  already logged into wp-admin — Claude won't enter admin credentials) or
  whether this doc is the checklist for the board to run themselves.
