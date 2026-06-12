# GRSH Tournament Manager — Build Journal
**Project:** Gold Rush Senior Hockey Tournament Management Plugin  
**Developer:** Tech Tribe Consulting (Lorenzo)  
**Live site:** grsht.com · Admin: grsht.com/manage  
**Stack:** WordPress + React (Vite) · REST API `/wp-json/grsh/v1/` · SiteGround hosting  
**Last updated:** June 1, 2026

---

## Table of Contents
1. [Architecture & Deployment](#architecture--deployment)
2. [Pages Built — UX Overhauls](#pages-built--ux-overhauls)
3. [PHP Backend Fixes](#php-backend-fixes)
4. [Testing Without Payment](#testing-without-payment)
5. [Historical Import Workflow](#historical-import-workflow)
6. [Key Bugs Fixed](#key-bugs-fixed)
7. [Files Delivered](#files-delivered)
8. [Pending Work](#pending-work)
9. [Quick Reference](#quick-reference)

---

## Architecture & Deployment

### Plugin Structure
```
wp-content/plugins/grsh-tournament-manager/
├── grsh-tournament-manager.php         ← bootstrap (explicit requires, no autoloader)
├── includes/
│   ├── class-grsh-database.php
│   ├── class-grsh-field-mapper.php
│   ├── class-grsh-scoring.php
│   ├── class-grsh-sync-engine.php
│   ├── class-grsh-players-api.php      ← INNER JOIN fix applied
│   ├── class-grsh-rosters.php
│   ├── class-grsh-alternates.php
│   ├── class-grsh-history.php          ← /history/players endpoint
│   ├── class-grsh-history-import.php   ← FIXED this session (log + stats)
│   ├── class-grsh-reports.php
│   └── class-grsh-settings.php
└── dist/
    ├── grsh-admin.js                   ← React bundle (upload after every build)
    └── grsh-admin.asset.php            ← must upload alongside js
```

### Local Development Path
```
C:\Users\Loren\OneDrive\Desktop\GitHub\Plugins\grsh-tournament-manager
```

### Deploy Process (every build)
1. Edit `.jsx` files in `src/pages/` or `src/components/`
2. `npm run build` in the local project folder
3. Upload **both** `dist/grsh-admin.js` AND `dist/grsh-admin.asset.php` to SiteGround
4. PHP files → upload directly to `includes/` (no rebuild needed)
5. Hard refresh: `Ctrl+Shift+R`

### REST API Endpoints
| Endpoint | Method | Purpose |
|---|---|---|
| `/players` | GET | 2027 registrants (INNER JOIN) |
| `/players/{id}` | PATCH | Update player |
| `/sync` | POST | Pull from WPForms |
| `/history/records` | GET | Flat imported history rows |
| `/history/stats` | GET | Stat card counts |
| `/history/import-logs` | GET | **NEW** — per-import session log |

---

## Pages Built — UX Overhauls

### Dashboard.jsx (838 lines)
**UX theme:** From a passive data display to an action-oriented command centre.

**WOW Feature — Tournament Readiness Gauge**  
Animated circular SVG arc that sweeps from 0 to a live composite score (0–100) on page load. Score = Registration fill 30% + Payment completion 25% + Player approvals 25% + Roster readiness 20%. Needle animates in 1.4s cubic-bezier. At 100: pulses gold and reads "Tournament ready."

**30 improvements included:**
- Priority banner ("3 players unpaid · Draft in 14 days") replacing silence
- Zero-value stat cards collapse to a single "✓ All clear" chip
- Every stat card clickable → navigates to filtered page
- Button renamed "Sync from WPForms" (was vague "Import Registrations")
- Tournament countdown chip in header ("47 days · April 9–12, 2027")
- WPForms sync status replaces misleading progress bar
- Recent registrations empty state with inline Sync button
- Division payment bars standardised (6px, 95% target dashed line, colour-coded)
- Division cards clickable
- Draft readiness 4-step pipeline (Registration → Approved → Teams → Draft)
- Season status dot in pill (green = open, grey = closed)
- Last-synced timestamp in header
- Semantic colour coding throughout
- "Subs" renamed "Alternates"
- Fill vs cap on each division card ("22 / 30 cap")
- Year-over-year delta (↑2 / ↓3 vs prior year)
- Warnings get full prominence with red left border
- Quick action 5-button row (Sync · Warnings · Draft · Export · Import History)
- Goalie callout bar below division breakdown
- 95% target dashed line on each payment bar
- Activity feed with audit log entries
- Header compressed to single horizontal bar
- Global search (⌕ button toggles inline search)
- Alternates availability chip on each division card
- Mobile CSS (`@media(max-width:768px)`)
- Tier mix distribution bar per division
- First-run setup checklist (shows when total_imported === 0)
- Export button in header
- Tier balance visualised
- Title renamed "Season 2027 Overview"

---

### Players.jsx (1,481 lines)
**WOW features:** Natural language search engine, live registration feed, duplicate detector, draft preview, batch email, offline mode, similarity engine

---

### Rosters.jsx (1,112 lines)
**WOW features:** Auto-balance engine, live radar, freeze workflow, team health score, undo system

---

### Alternates.jsx (1,177 lines)
**UX theme:** Game-day emergency dispatch, not just a list.

**WOW Feature — Smart Sub Dispatch**  
"Find best available" button scores every alternate against 5 criteria (tier match, division eligibility, day availability, activation count, attendance history) and surfaces a ranked recommendation with direct call action. Coordinator gets the right name in one tap during a game-day crisis.

**30 improvements included:**
- Duplicate name bug fix (Wayne Gretkzy Wayne Gretkzy)
- Card/list toggle for 8+ alternates
- Contact info (phone + email) directly on card
- Age field removed if empty (was showing broken placeholder)
- Usage badge colour-coded (green = never used, amber = 1–2×, navy = regular)
- Actual tournament dates shown under day chips ("Fri Apr 11 · Sat Apr 12")
- "No late games" rendered as distinct red chip (was same weight as ✓)
- All eligible divisions shown as pills (not just first)
- Activation confirmation sheet (game date, team, reason)
- Activation log empty state with field preview
- Sort controls (Tier · Availability · Division · Usage)
- Stats chips are toggle filters
- Priority/call-order drag-to-reorder ranking
- "Max 2/day" tooltip explanation
- Position shown on card
- Zero-availability warning banner
- Tier colour coding matching Players page
- History link on each card
- Comparison mode (2 cards checked → aligned attribute drawer)
- Export scoped to filtered view
- Notes field (collapsible, inline editable)
- Tab renamed "Available Alternates" (was "Sub pool")
- Mobile: single column, phone tappable, full-width activate button
- Real-time activation counter ("Used 1/2 today")
- Search field
- Quick division filter button row
- Activation log status badge ("1 active · 2 past")
- Goalie shortage persistent amber banner
- Consistent button treatment across all cards
- Last-synced data freshness indicator

---

### History.jsx (1,427 lines)
**UX theme:** Turn static imported records into a living tournament archive.

**10 WOW features:**
1. **Interactive Career Timeline** — hover any season dot to expand full season detail card
2. **Tier Trajectory Sparkline** — SVG polyline per player row showing tier change across seasons; ↑ green, ↓ red, → grey
3. **Season Comparison Diff Mode** — side-by-side "Joined / Left / Both" for any two seasons
4. **Player DNA Avatar** — concentric rings encoding career depth; gold glow for champions
5. **Sandbagging Predictor** — risk score 0–100 comparing self-reported vs historical avg tier
6. **Cohort Retention Chart** — first-year cohort bars showing year-over-year return %
7. **Career Accomplishment Card Generator** — opens styled print window with full record
8. **Where Are They Now** — matches history players to 2027 registrations by email; exports non-returnees contact list
9. **Season Story** — auto-generated narrative report per season with division breakdown and champions
10. **Season Diff** (combined with WOW 3)

**30 improvements included:**
- **BUG FIX:** Season filter now works — `+h.season === +filterSeason` (both cast to number; API returns strings)
- Title case on all names ("michael anderson" → "Michael Anderson")
- Championships column hidden by default; re-enabled via column toggle
- Stats bar sandbagging count corrected (`toB()` normalization for "0"/"1"/true/false)
- Player detail split drawer
- Tier trend arrows fixed (↑↓→ with correct colors, compares earliest vs most recent)
- Sticky column headers (`position:sticky;top:0`)
- Filter bar collapsible with "↑ Collapse / ↓ Show" toggle
- Filter breadcrumb chips (dismissible per-filter)
- Column toggle (⊞ Columns) with click-outside close handler
- "+N" overflow tooltip listing all prior divisions
- Attendance shows "—" when no data; bar-only for 100%, number for <100%
- Last active badge ("Last active 2026 · recent" or "inactive")
- "Returning recently" quick filter (players with season ≥ latest−1)
- Cross-reference link → "View 2027 registration →" in drawer
- Sort icons: ↕ unsorted, ↑ asc, ↓ desc
- Export scoped to current filter; filename includes season+division
- Search placeholder: "Name, email, tier, division…"
- Season comparison diff mode
- Per-season stats in breadcrumb ("matching season 2026")
- Captains chip added to stats bar
- "imported data" badge (was "live data" — incorrect)
- Recency gradient on years (recent = navy/bold, older = grey)
- Import source metadata below title
- Sandbagging explanation tooltip on Flags column header
- Empty state with filter summary + Clear all button
- Analytics button row above stats (separate from header)
- DNA avatars in table rows
- Season stories accessible from analytics row
- `toB()` robust boolean helper handles all API return types

---

### Reports.jsx (959 lines)
**UX theme:** From static tables to a live analytical command centre.

**15 WOW features:**
1. **Parity Radar** — 5-axis SVG radar chart per team (Skill/Defense/Offense/Goal/Parity)
2. **Payment Thermometer** — animated fill with 95% target line and deadline countdown
3. **Registration Heatmap** — GitHub-style calendar of daily registration density
4. **Division Health Scorecard** — 5-indicator card per division on Readiness tab
5. **Age Distribution** — histogram with 45A eligibility threshold marker
6. **AI Executive Summary** — Claude API call → plain-English 5-sentence briefing
7. **Goalie Optimizer** — auto-assign button + assign-from-pool per team
8. **Financial Dashboard** — Expected/Collected/Outstanding/Waived
9. **Retention Analysis** — Sankey-style bar + per-division retention % with low-retention alert
10. **Predictive Fill Rate** — linear projection with fill/shortfall per division
11. **Draft Readiness Checklist** — 4 checks × 4 divisions with Go/No-Go verdict
12. **Sandbagging Analytics** — flag count, YoY trend, full tier-history table
13. **Committee Handout** — branded HTML print view
14. **Shareable Dashboard Link** — 7-day link with clipboard copy
15. **Scheduled Report Email** — config modal (frequency, recipients, sections)

---

### HistoryImport.jsx (1,590 lines)
File preview, column mapping, progress indicator, undo, help guide modal

---

## PHP Backend Fixes

### class-grsh-history-import.php — Major Fix (Jun 1, 2026)

**Problem 1 — Import Log never saved (root cause)**  
`log_import()` was writing to `grsh_audit_logs` table. The INSERT failed silently because column names (`object_type`, `after_value`) didn't match the actual table schema. `$wpdb->insert()` returns `false` on failure without throwing — silent data loss every import.

**Fix:** Created dedicated `wp_grsh_import_logs` table via `dbDelta()` (lazy creation on first import). Self-managed schema, zero dependency on audit_logs. Added `wp_options` fallback so no import session is ever lost.

**Problem 2 — Import Log had no REST endpoint to read back**  
The "Import Log" tab in the React UI called `GET /history/import-logs` but this route didn't exist. Tab always showed "No imports yet."

**Fix:** Added `register_rest_route('grsh/v1', '/history/import-logs', ...)` and `rest_get_import_logs()` method that decodes stored JSON and returns full per-row errors and warnings.

**Problem 3 — Stats showed 0 for all fields**  
`rest_get_stats()` returned `total_records` but React read `data.total`. Field name mismatch = silent zero.

**Fix:** Response now returns both `total` (primary) and `total_records` (alias). Added `captains` count which was entirely missing from the stats response.

**Problem 4 — was_captain / sandbagging showing 0 in UI**  
MySQL tinyint(1) → PHP `$wpdb->get_results()` → string "0"/"1" → JSON → JavaScript. Old `Boolean(+r.was_captain)` missed some API field variants.

**Fix:** `rest_get_records()` now explicitly casts: `(bool)(int)$r['was_captain']` before JSON encoding. JavaScript receives `true`/`false` not "0"/"1".

**Problem 5 — 13 missing records from import**  
Rows 75, 79, 90: missing email → skipped. Row 100: blank trailing row → 4 validation errors. Now visible in Import Log tab after fix.

**Problem 6 — log_import() missing data**  
Old: only saved `imported/skipped/total` counts.  
New: saves `filename`, `imported`, `updated`, `skipped`, `total`, full `errors[]` array with line numbers, full `warnings[]` array.

**New `updated` counter**  
Duplicate rows (same player + same season) now count separately as `updated` vs `imported`. API response includes both.

---

### class-grsh-history.php
`/history/players` endpoint — reads from `grsh_player_history` JOIN `grsh_seasons`. Correct. No changes needed.

---

## Testing Without Payment

### WPForms Form 5047 — 2027 Player Registration

| Option | Cost | Tests | Effort |
|---|---|---|---|
| **Register as Sub** | Free | Alternates pipeline | None — works now |
| **PayPal Sandbox** | $0 | Full paid flow | 15 min setup |
| **100% Coupon Code** | **BROKEN** | — | DO NOT USE |
| **Committee Test field** | Free | Primary player flow | 15 min form edit |
| **Entry Preview** | Free | Field mapping only | None |

**The coupon is dead.** PayPal Commerce refuses $0 transactions regardless of coupon percentage. "This payment cannot be processed because the payment amount is not set, or is set to an invalid amount." This will never work.

**Recommended path:**
1. **Right now:** Submit as Sub → sync → check Alternates page
2. **Before opening registrations:** Switch to PayPal Sandbox, test full $200 Primary Player flow, switch back

**After any test:** Must click "Sync from WPForms" on Dashboard to pull the entry in.

---

## Historical Import Workflow

### Protocol (import oldest-first)
1. Import 2021 first → verify Import Log tab
2. Import 2022 → verify
3. Continue through 2025
4. Import 2026 (already done — 90 records)
5. Leave 2027 WPForms form at Form ID 5047 — historical data via CSV only

### CSV Requirements
Required columns: `first_name`, `last_name`, `email`, `season_year`, `division_played`

**Accepted division values (exact):**
```
gold_open   45a   senior_b   senior_c   womens
```
Any other value (e.g. "Senior B", "Gold Open", "45 A") will cause that row to be skipped.

### Import Log — how to read it
After each import: Import History → Import Log tab  
Each session shows: filename, imported count, updated count, skipped count, and **every skipped row with line number and reason**.

### Why record count ≠ player count
185 imported records → 96 unique players is correct. Same player in two seasons = 1 player row with 2 history entries. The History page aggregates correctly.

---

## Key Bugs Fixed

| Bug | Root Cause | Fix |
|---|---|---|
| Season filter shows all players when year selected | API returns `season_year` as string "2026"; comparison `h.season === +filterSeason` fails strict equality | Cast both sides: `+h.season === +filterSeason` |
| Import Log always empty | `log_import()` inserted to `grsh_audit_logs` with wrong column names; insert failed silently | New dedicated `grsh_import_logs` table via `dbDelta()` |
| Stats show 0 Total Records | React reads `data.total`; API returned `data.total_records` | API now returns both; React updated |
| 0 Captains / 0 Sandbagging | MySQL tinyint → PHP string "1"/"0" → JS receives string not bool | Explicit `(bool)(int)` cast before JSON encode |
| Name displays lowercase | No title-case normalization at render | `titleCase()` helper applied to all name display |
| Column dropdown floats over table | No click-outside handler; positioned wrong | `colRef = useRef()` + `mousedown` listener; `zIndex:300` |
| Season range "2026–2026" | Range always formatted even for single season | `allSeasons.length === 1` → show "Season 2026" |
| WOW buttons overflow header | All 6 buttons in one flex row | Moved to separate "Analytics:" row below header |
| 13 records not imported | Rows 75/79/90 missing email; row 100 blank trailing row | Visible in Import Log after log fix |
| PayPal coupon blocks form | PayPal refuses $0 transactions | Delete coupon; use Sub path or Sandbox instead |

---

## Files Delivered

| File | Lines | Location |
|---|---|---|
| `Dashboard.jsx` | 838 | `src/pages/` |
| `Players.jsx` | 1,481 | `src/pages/` |
| `Rosters.jsx` | 1,112 | `src/pages/` |
| `Alternates.jsx` | 1,177 | `src/pages/` |
| `History.jsx` | 1,427 | `src/pages/` |
| `HistoryImport.jsx` | 1,590 | `src/pages/` |
| `Reports.jsx` | 959 | `src/pages/` |
| `class-grsh-history-import.php` | 873 | `includes/` |

---

## Pending Work

- [ ] Import 2021–2025 historical CSVs (oldest-first, one at a time)
- [ ] Fix rows 75, 79, 90 in prior season CSV (add missing emails) → re-import
- [ ] End-to-end test: real 2027 Sub registration → sync → Alternates page
- [ ] PayPal Sandbox test for Primary Player full flow before opening registrations
- [ ] Womens division bug: saves in Settings but doesn't display on dashboard (PHP `foreach` likely filtering out divisions with 0 players)
- [ ] Add "Committee Test" field to WPForms form for ongoing team testing
- [ ] Complete historical imports before opening 2027 WPForms registration

---

## Quick Reference

### Scoring System
```
Tier values: A1=15 A2=14 A3=13 B1=11 B2=10 B3=9 C1=7 C2=6 R1=5 R2=4 R3=3
Score = tier_value + min(years,60)/5 + committee_adjustment(-5 to +5)
```

### GRSH Board
| Member | Role |
|---|---|
| Brian | Director |
| Don | Treasurer |
| Lorenzo | Player Recruitment / Secretary |
| Dee | Player Recruitment |
| Lyndsay | Player Recruitment |
| Rita | Fundraising |

Quorum = 4 of 6 members

### Form ID
WPForms Form 5047 — 2027 Player Registration (stays at 2027, historical via CSV only)

### Key WPForms Form Fields
| ID | Field |
|---|---|
| 20 | Name |
| 21 | Email |
| 22 | Phone |
| 11 | Age (as of 31-Dec-26) |
| 84 | Player Type (Primary $200 / Sub free) |
| 89 | Sub: availability days |
| 86 | Sub: max games/day |
| 87 | Sub: late game availability |
| 88 | Sub: division eligibility |
| 57 | Division requested |
| 51 | Playing experience / tier |

### Prompt Library Folders
`Band` · `Excel` · `Hockey` · `Ideas` · `Learning` · `Personas` · `Productivity` · `Research` · `SecOps` · `Social Media` · `TechTribe` · `Word` · `WordPress`

---

*Generated by Claude — Tech Tribe Consulting project journal*
