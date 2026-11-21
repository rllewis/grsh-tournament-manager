import assert from "node:assert/strict";
import * as E from "./.build/historyEngine.mjs";

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error("FAIL:", name, "\n", e.message); process.exitCode = 1; } };

const rows = [
  { id: 1, player_id: 10, first_name: "kevin", last_name: "weeks", email: "kw@x.com", season_year: 2024, division_played: "senior_b", team_name: "Kings", skill_tier_reported: "B3", games_scheduled: 4, games_attended: 4, championship_result: "winner", was_captain: "1" },
  { id: 2, player_id: 10, first_name: "kevin", last_name: "weeks", email: "kw@x.com", season_year: 2025, division_played: "senior_b", team_name: "Kings", skill_tier_reported: "B1", games_scheduled: 4, games_attended: 3, no_show_count: 1 },
  { id: 3, player_id: 11, first_name: "ann", last_name: "lee", email: "", season_year: 2025, division_played: "", team_name: "", skill_tier_reported: "", sandbagging_flag: "1" },
  { id: 4, player_id: 12, first_name: "bo", last_name: "ames", email: "bo@x.com", season_year: 2023, division_played: "womens", team_name: "Bears", skill_tier_reported: "A2" },
  { id: 5, player_id: 12, first_name: "bo", last_name: "ames", email: "bo@x.com", season_year: 2025, division_played: "womens", team_name: "Bears", skill_tier_reported: "C1" },
  { id: 6, first_name: "x", last_name: "y", email: "" },
];
const { players, skipped } = E.aggregateRecords(rows);
const by = (id) => players.find((p) => p.id === id);

t("aggregate groups rows and counts skipped", () => { assert.equal(players.length, 3); assert.equal(skipped, 1); assert.equal(by(10).history.length, 2); assert.equal(by(10).history[0].season, 2025); });
t("attendance and gaps", () => { assert.equal(by(10).attendance_rating, 88); assert.equal(by(11).attendance_rating, null); assert.deepEqual(by(11).gaps.sort(), ["no_division", "no_email", "no_games", "no_team", "no_tier"]); });
t("trend and delta", () => {
  assert.equal(E.tierTrend(by(10).history), "improved");
  assert.equal(E.tierTrend(by(12).history), "declined");
  assert.equal(E.tierTrend(by(11).history), "unknown");
  assert.deepEqual([E.tierDelta(by(10).history).from, E.tierDelta(by(10).history).to, E.tierDelta(by(10).history).steps], ["B3", "B1", 2]);
  assert.equal(E.tierDelta(by(11).history), null);
  assert.equal(E.latestTier(by(12)), "C1");
});
t("big moves need 3+ steps", () => { const m = E.tierMoves(players); assert.equal(m.length, 1); assert.equal(m[0].player.id, 12); assert.equal(m[0].better, false); });

t("search: multi term AND, phrases, case", () => {
  const f = (q) => E.filterAndSort(players, { ...E.DEFAULT_FILTERS, q }, "last_name", "asc").map((p) => p.id);
  assert.deepEqual(f("kevin kings"), [10]);
  assert.deepEqual(f("KEVIN bears"), []);
  assert.deepEqual(f('"senior b"'), [10]);
  assert.deepEqual(f("womens"), [12]);
  assert.deepEqual(f("  "), [12, 11, 10]);
});
t("filters", () => {
  const f = (o) => E.filterAndSort(players, { ...E.DEFAULT_FILTERS, ...o }, "last_name", "asc").map((p) => p.id);
  assert.deepEqual(f({ champs: true }), [10]);
  assert.deepEqual(f({ captains: true }), [10]);
  assert.deepEqual(f({ warn: true }), [11]);
  assert.deepEqual(f({ noShow: true }), [10]);
  assert.deepEqual(f({ season: "2023" }), [12]);
  assert.deepEqual(f({ missing: "no_tier" }), [11]);
  assert.deepEqual(f({ div: "womens" }), [12]);
  assert.deepEqual(f({ recent: true }), [12, 11, 10]);
  assert.deepEqual(f({ reliability: "concern" }), []);
});
t("perfect attendance no longer includes players with no attendance data", () => {
  const f = (o) => E.filterAndSort(players, { ...E.DEFAULT_FILTERS, ...o }, "last_name", "asc").map((p) => p.id);
  assert.deepEqual(f({ reliability: "perfect" }), []);
});
t("sort puts missing values last either way, and does not mutate", () => {
  const copy = players.slice();
  assert.deepEqual(E.sortPlayers(players, "attendance", "asc").map((p) => p.id), [10, 11, 12]);
  assert.deepEqual(E.sortPlayers(players, "attendance", "desc").map((p) => p.id), [10, 11, 12]);   // 11 and 12 have no data: last, original order
  assert.deepEqual(E.sortPlayers(players, "tier", "asc").map((p) => p.id), [10, 12, 11]);
  assert.deepEqual(E.sortPlayers(players, "last_active", "desc").map((p) => p.history[0].season), [2025, 2025, 2025]);
  assert.deepEqual(E.sortPlayers(players, "trend", "asc").map((p) => p.id)[0], 12);
  assert.deepEqual(players, copy);
});
t("chips match filters on", () => {
  assert.equal(E.activeFilterChips(E.DEFAULT_FILTERS).length, 0);
  assert.deepEqual(E.activeFilterChips({ ...E.DEFAULT_FILTERS, warn: true, season: "2025" }).map((c) => c.key), ["season", "warn"]);
});

t("stats say when something is not tracked", () => {
  const s = E.stats(players);
  assert.equal(s.captainsTracked, true); assert.equal(s.captains, 1); assert.equal(s.noShowsKnown, true); assert.equal(s.sandbagging, 1);
  assert.equal(E.stats(E.aggregateRecords([rows[3]]).players).captainsTracked, false);
});
t("coverage percentages", () => {
  const c = Object.fromEntries(E.coverage(players).map((r) => [r.key, r.pct]));
  assert.equal(c.tier, 67); assert.equal(c.email, 67); assert.equal(c.attendance, 33); assert.equal(E.coverage([])[0].pct, 0);
});
t("empty columns", () => {
  assert.deepEqual(E.emptyColumns(players), []);
  const bare = E.aggregateRecords([rows[3], rows[4]]).players;
  assert.deepEqual(E.emptyColumns(bare).sort(), ["attendance", "champs", "flags"]);
  assert.deepEqual(E.emptyColumns([]), []);
});
t("freshness", () => {
  const now = Date.parse("2026-11-19T12:00:00Z");
  assert.equal(E.freshness("2026-06-02 10:00:00", now).level, "old");
  assert.equal(E.freshness("2026-11-10 10:00:00", now).level, "ok");
  assert.equal(E.freshness("2026-09-01 10:00:00", now).level, "stale");
  assert.equal(E.freshness(null, now).level, "none");
  assert.equal(E.freshness("garbage", now).level, "none");
  assert.match(E.freshness("2026-11-19 01:00:00", now).text, /today/);
});
t("review summary and duplicate index", () => {
  const ov = { quality: [{ key: "no_tier", label: "Season rows with no skill tier", count: 3 }, { key: "no_team", label: "x", count: 0 }], duplicates: [{ why: "w", a: { id: 1, name: "A" }, b: { id: 2, name: "B" } }] };
  const s = E.reviewSummary(ov, players);
  assert.deepEqual(s.map((x) => x.tab), ["gaps", "dupes", "moves"]);
  assert.equal(s[0].label, "rows with no skill tier");
  assert.equal(E.duplicateIndex(ov)[2].other, "A");
  assert.deepEqual(E.reviewSummary(null, []), []);
});
t("highlight", () => {
  assert.deepEqual(E.highlightParts("Kevin Weeks", ["wee"]).map((x) => [x.t, x.hit]), [["Kevin ", false], ["Wee", true], ["ks", false]]);
  assert.deepEqual(E.highlightParts("a.b", ["."]).map((x) => x.hit), [false, true, false]);
  assert.deepEqual(E.highlightParts("", ["a"]), [{ t: "", hit: false }]);
  assert.deepEqual(E.highlightParts("abc", []), [{ t: "abc", hit: false }]);
});
t("paging", () => { assert.equal(E.visibleCount(205, 0), 50); assert.equal(E.visibleCount(20, 50), 20); assert.equal(E.visibleCount(205, 100), 100); });
t("url state round trip, ignores junk", () => {
  const f = { ...E.DEFAULT_FILTERS, season: "2025", warn: true, q: "kev lee" };
  const s = E.encodeState(f, "tier", "desc");
  const d = E.decodeState("?" + s);
  assert.deepEqual(d.filters, f); assert.equal(d.sortKey, "tier"); assert.equal(d.sortDir, "desc"); assert.equal(d.touched, true);
  assert.equal(E.encodeState(E.DEFAULT_FILTERS, "last_name", "asc"), "");
  assert.equal(E.decodeState("").touched, false);
  assert.equal(E.decodeState("?sort=__proto__&dir=sideways").sortKey, "last_name");
  assert.equal(E.decodeState("?search=abc").filters.q, "abc");
  assert.equal(E.decodeState("?q=" + "x".repeat(500)).filters.q.length, 120);
});
t("saved state from storage is cleaned", () => {
  assert.deepEqual(E.cleanFilters(null), E.DEFAULT_FILTERS);
  assert.equal(E.cleanFilters({ warn: "yes", div: { a: 1 }, evil: 1 }).warn, false);
  assert.equal(E.cleanFilters({ div: { a: 1 } }).div, "");
  const v = E.cleanSavedViews([{ name: "  Mine ", filters: { champs: true }, sortKey: "nope" }, { name: "" }, 5, null]);
  assert.equal(v.length, 1); assert.equal(v[0].name, "Mine"); assert.equal(v[0].sortKey, "last_name"); assert.equal(v[0].filters.champs, true);
  assert.deepEqual(E.cleanSavedViews("x"), []);
  assert.equal(E.cleanSavedViews(new Array(40).fill({ name: "a" })).length, 20);
});
t("builtin views and sameFilters", () => {
  const v = E.builtinViews(2025);
  assert.equal(v[1].filters.season, "2025");
  assert.equal(E.sameFilters(v[2].filters, { ...E.DEFAULT_FILTERS, warn: true }), true);
  assert.equal(E.sameFilters(v[2].filters, E.DEFAULT_FILTERS), false);
});
t("csv: quotes doubled, formulas neutralised, blanks stay blank", () => {
  assert.equal(E.csvCell('He said "hi"'), '"He said ""hi"""');
  assert.equal(E.csvCell("=SUM(A1)"), `"'=SUM(A1)"`);
  assert.equal(E.csvCell("@x"), `"'@x"`);
  assert.equal(E.csvCell(null), '""');
  const csv = E.buildCsv([by(11)], ["player", "attendance"]);
  const lines = csv.split("\r\n");
  assert.equal(lines[0], '"Last","First","Email","Attendance %","No-shows"');
  assert.equal(lines[1], '"Lee","Ann","","",""');
  assert.equal(E.buildCsv([by(10)], ["tier"]).split("\r\n")[0], '"Last","First","Email","Latest tier","Tier history"');
});
t("undo restores only what changed", () => {
  const h = by(10).history[0];
  const init = E.rowInit(h);
  const now = { ...init, skill_tier_reported: "A3", committee_notes: "x" };
  const ch = E.changedFields(init, now);
  assert.deepEqual(Object.keys(ch).sort(), ["committee_notes", "skill_tier_reported"]);
  assert.deepEqual(E.inversePatch(init, ch), { skill_tier_reported: "B1", committee_notes: "" });
  assert.equal(init.games_scheduled, "4");
  assert.equal(E.rowInit(by(11).history[0]).games_scheduled, "");
});

console.log(`historyEngine: ${n} groups passed`);
