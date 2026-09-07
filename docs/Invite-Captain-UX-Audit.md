# Invite Captain — UX/Dev Audit & Feature Ideas

Written 2026-09-01 (via Cowork), prompted by a live screenshot of
GRSH → Invite Captain throwing "This captain already has a team this
season" for Kevin Weeks / team "Suspects" / Senior B.

## Troubleshooting note on the triggering screenshot

The submitted captain email was `russell.lorenzo.lewis@gmail.com`
(Lorenzo's own personal inbox) under the name "Kevin Weeks" — a real,
existing captain (Skatetown Bandits). This is the exact anti-pattern
`docs/board-test-data-plan.md` already warns against: testing with a
real captain's identity and a real personal inbox instead of the
`@grshtest.invalid` convention. **The error itself is correct
behavior** — the plugin is properly refusing to give one captain two
teams — not a bug. If this was meant as a test, re-run it with a fake
name and a `.invalid` email per the existing convention.

## What's actually wrong with the page today

- The error is a dead end: plain text, no link to the existing team,
  no suggested next action, for what is a common/expected collision
  case (re-inviting a real captain by mistake).
- No pre-submit validation — all four fields get filled and the button
  clicked before the duplicate is discovered. A debounced async email
  lookup could catch this before submit is even possible.
- No typeahead/autocomplete against existing GRSH Captain accounts, so
  a typo'd email risks creating an orphan duplicate account for a real
  person.
- The SportsPress "theme doesn't declare support" promo banner eats a
  large share of the viewport above a single-purpose task screen —
  worth permanently dismissing or hiding on this specific admin page.
- The error renders as plain gray text rather than WordPress's native
  `notice-error` banner pattern, so it's easy to miss and inconsistent
  with the rest of wp-admin.

## Concrete improvements

- Inline async email lookup with a status chip (new captain / already
  has a team, linking to it) before the Send Invite button is enabled.
- Typeahead on Captain name + email against existing captain accounts.
- A running table below the form: pending/accepted invites this
  season, with resend/revoke actions — turns this from fire-and-forget
  into an auditable list.
- Error state upgraded to a real `notice-error` banner with a direct
  "View Kevin Weeks's existing team" link instead of dead-end text.
- Live roster-count indicator on the Division dropdown so staff don't
  overbook a division blind.
- Resend cooldown enforced in the UI — the staff reference doc already
  tells testers "don't resend more than once or twice"; that rule
  belongs in the interface, not in someone's memory.

## Five features nobody asked for yet

1. **Smart duplicate-resolution modal** — on collision, open the
   existing team inline (roster count, division, status) with one-click
   choices: view/edit that team, or confirm this is a different person
   needing a different email. Replaces today's dead end with a
   one-screen resolution.
2. **Live "Season Health" rail** — a persistent sidebar across every
   GRSH admin screen showing invited/accepted/stalled captain counts,
   roster fill vs. division minimums, and player totals vs. the same
   date last season.
3. **Invite timeline per captain** — sent → opened → account created →
   roster started → submitted, as status dots, so staff see who's
   stuck and where without guessing who to follow up with.
4. **"Preview as captain" mode** — staff-only, read-only impersonation
   of exactly what an invited captain sees after clicking their setup
   link, catching broken flows (like this project's own documented
   Invite-Captain 404 bug) before a real captain hits them.
5. **Paste-to-import on this screen** — staff already rebuild rosters
   manually from emailed spreadsheets per the doc's own fallback
   section; letting someone paste a whole name/email/division block
   here, auto-parsed with a review step, collapses that into one
   paste-and-confirm action.

## 2026-09-01 build — round 1 shipped

Built, not linted (no PHP in the Cowork sandbox), not deployed:
existing-team link on the duplicate error (both the admin invite tool
and the public signup form, since they share `GRSH_Captain_Provision`/
`GRSH_Captain_Roster::create_team_for_player()`), a debounced pre-
submit duplicate-email check (new `GET /grsh/v1/admin/captains/check`
route, calls `GRSH_Captain_Provision::check_existing_team()` — read-
only, no side effects), the SportsPress promo banner hidden on this
page only (scoped by body class, not global), WP-native
`notice-error`/`notice-warning`/`notice-success` styling replacing
plain text output, and an 8-second cooldown on Send Invite after a
successful send. Files touched: `includes/class-grsh-captain-
roster.php`, `includes/class-grsh-captain-provision.php`,
`includes/class-grsh-captain-invite.php`,
`assets/captain-invite-admin.js`. Deploy via FileZilla, then retest
the Kevin Weeks duplicate-captain case that prompted this.

## Round 2 — requested but not yet designed/built (2026-09-01)

Lorenzo confirmed the pending-invites summary is wanted (see request:
"page should display a summary of invites sent so Admin don't
forget"). This needs a small new log table — nothing in the plugin
currently records an invite event, only whether a *duplicate team*
exists at submit time. Proposed shape once built: a persistent table
on this page — captain, email, team, division, status (Invited /
Account Created / Roster Started / Submitted), sent date, resend/
revoke actions.

Ten further ideas, not yet built, roughly ordered by how self-
contained they are (top = smallest, bottom = most design work):

1. Plain-English inline error translation — extend the JS's existing
   stale-nonce special-case ("Cookie check failed" → readable text) to
   any REST error, not just that one.
2. Ten-second "Undo" toast after Send Invite (Gmail-style) before the
   account-creation email actually fires.
3. Fuzzy name-matching on the duplicate check, not just exact-email —
   the current check (and the one just shipped) would miss a captain
   using a different address entirely.
4. Auto-expiring invite link rendered as a scannable QR code, for
   signing captains up in person at the rink.
5. A single automated 48-hour nudge via the plugin's existing Uncanny
   Automator integration if a captain hasn't set their password yet,
   then stops — enforces the staff doc's own "don't resend more than
   once or twice" rule in software instead of memory.
6. Self-correction link in the captain's own setup email, so a typo'd
   phone/name staff entered can be fixed by the captain directly.
7. Roster-completeness heat-map by division on this page, tying "who
   was invited" to "who's actually done" in one glance.
8. A small always-visible flow diagram — Invited → Account Created →
   Password Set → Roster Started → Submitted → Reviewed — stamped with
   live counts per stage, showing where captains actually drop off.
9. "Copy last season's captains" bulk action at season rollover — a
   pre-filled review list of returning captains instead of re-typing
   everyone.
10. Print-friendly Welcome Packet PDF (invite confirmation + roster-app
    quickstart + division rules), generated the same way the plugin
    already generates score sheets.


## Round 3 — three deferred items built, one intentionally left parked (2026-09-01)

Lorenzo made the calls the deferred items needed: QR check-in should carry
the *same* security profile as the emailed link (not a weaker parallel
mechanism); the self-correction link stays narrow — name/phone only,
never email or auth; season-rollover copy-forward is not ready to define
yet (parked, no work done); Welcome Packet's division-rules section
should pull live from grsht.com/division/, never a hardcoded snapshot.

**Fixed first, before building anything new**: the Round 2 "10-second
Undo" toast was actually only clickable for about one second.
`renderUndo()` rewrote `#grsh-invite-undo`'s `innerHTML` on every 1s
tick to update the countdown number, which silently destroyed and
recreated the `<a id="grsh-invite-undo-link">` element each time — the
click listener was only ever attached to the first, throwaway copy.
Fixed by rendering the markup once, attaching the listener once, and
updating only the countdown `<span>`'s text node on each tick.
`node --check` passed.

**QR check-in — built.** New admin-only REST route
`GET /grsh/v1/admin/captains/reset-link?team_id=X` regenerates the same
WordPress-core password-reset key `wp_new_user_notification()` would
have emailed (`get_password_reset_key()`, same URL shape) — not a
separate, weaker link. Regenerating invalidates whatever was previously
emailed/shown; that's intentional (one valid link at a time). Rendered
client-side as a QR code via a vendored copy of
`kazuhikoarase/qrcode-generator` v1.4.4 (MIT, `assets/vendor/qrcode.js`,
verified byte-for-byte against the published npm package before
vendoring — deliberately not CDN-loaded, since the encoded payload is a
live single-use credential that should never transit a third-party
host). A "QR / Link" action appears on any summary-table row still
password-pending, including the optimistic row appended right after a
successful invite. Logs `captain_invite_qr_generated` to the existing
audit table.

**Self-correction link — built, narrow scope.** A brand-new captain
account now also gets a SEPARATE follow-up email (never merged into
`wp_new_user_notification()`) with a one-time link, valid 3 days,
scoped to first/last name and phone only — cannot touch email, password,
or roles. Token is a random 40-char string; only its `wp_hash()` is
stored (as user meta), never the raw token. The link serves a small
public HTML form directly from a REST route
(`GET /grsh/v1/captain/correction?token=...`) via the
`rest_pre_serve_request` filter — the same technique the grsh-board
plugin's public meeting-view route already uses, so no new WP page or
shortcode was needed. Submitting (`POST` to the same route) validates
the token, applies the change to `wp_grsh_players`, and deletes the
token's meta keys outright — single-use, no replay. Logs
`captain_self_correction`.

**Welcome Packet PDF — built, same pattern as Print Score Sheets.** New
`includes/class-grsh-welcome-packet.php`, registered in the plugin
loader. No PDF library (this host still has no Composer/vendor access)
— renders print-ready HTML in a new tab via `admin-post.php`, same as
score sheets. Content: invite confirmation (captain/team/division/
email), a roster-app quickstart, and the CURRENT division rules — read
directly from the `division` page's `post_content` in the database and
run through `apply_filters('the_content', ...)`, the same call
WordPress's own `the_content()` template tag makes, rather than an
HTTP round-trip to the site's own front end. This also means it
correctly resolves Elementor-built content (Elementor hooks
`the_content`), and never depends on this server's own outbound network
access. A "Welcome Packet" link (nonce-protected via `wp_nonce_url()`)
sits next to every row in the summary table.

**Season rollover — deliberately not built.** Lorenzo said the
"who counts as returning" rule isn't ready to define. No code written.

**Verification this session**: `php -l` (Bitnami PHP at
`C:\Bitnami\wordpress-5.9-0\php\php.exe`, the only PHP found on this
machine) on all three touched/new PHP files, and `node --check` on both
JS files (`captain-invite-admin.js`, the vendored `qrcode.js`) — all
clean. Nothing has been tested against a live WordPress database or
deployed; the Kevin Weeks duplicate-captain retest from Round 1 is
still outstanding too.

**Deploy checklist (FileZilla), all in `grsh-tournament-manager/`**:
- `includes/class-grsh-captain-invite.php` (Undo fix + QR + correction routes)
- `includes/class-grsh-captain-provision.php` (unchanged this round, already deployed-pending from Round 2 — reconfirm it's included)
- `assets/captain-invite-admin.js` (Undo fix + QR popup)
- `assets/vendor/qrcode.js` (new file — vendored library)
- `includes/class-grsh-welcome-packet.php` (new file)
- `grsh-tournament-manager.php` (new include + hook registration line)

No Permalinks flush needed — no new REST route *prefix*, just new
routes and a new admin-post action, both registered the standard way.
After deploy: retest Kevin Weeks (Round 1's original trigger), send one
real test invite to confirm the correction email arrives and its link
works exactly once, and generate a QR for a pending invite to confirm
it actually scans to the real password-set page.
