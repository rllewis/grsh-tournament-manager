import * as E from "./.build/fullTeamsEngine.mjs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  FAIL:", m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

const T = (o) => ({ id: 1, name: "Kings", division: "senior_b", division_label: "Senior B", captain_name: "Kevin Weeks", captain_email: "kevin@example.com",
  player_count: 0, draft_locked: false, review_status: "", looks_test: false, test_flags: [], duplicates: [], created_at: "2026-11-01 10:00:00",
  waivers_signed: 0, waivers_total: 0, cleanup: { can_manage: true, removal: { bulk_allowed: true, reasons: [] } }, ...o });

console.log("statusOf");
eq(E.statusOf(T({})).key, "not_submitted", "unlocked, no review = not submitted");
eq(E.statusOf(T({})).label, "Not submitted", "label says what it means (was Draft)");
eq(E.statusOf(T({ review_status: "changes_requested" })).key, "sent_back", "unlocked after send-back = sent back");
eq(E.statusOf(T({ draft_locked: true })).key, "submitted", "locked with no review status = submitted");
eq(E.statusOf(T({ draft_locked: true, review_status: "under_review" })).key, "under_review", "under review");
eq(E.statusOf(T({ draft_locked: true, review_status: "approved" })).key, "approved", "approved");
eq(E.statusOf(T({ draft_locked: true, review_status: "change_pending" })).label, "Change requested", "captain change request");
eq(E.statusOf(null).key, "not_submitted", "null team does not throw");

console.log("filterAndSort");
const teams = [
  T({ id: 1, name: "Kings", player_count: 5 }),
  T({ id: 2, name: "Aces", division: "45a", division_label: "45A", captain_name: "Lorenzo Lewis", captain_email: "lorenzo+t@example.com", looks_test: true, player_count: 11, draft_locked: true, created_at: "2026-11-10 09:00:00" }),
  T({ id: 3, name: "Bears", division: "senior_b", division_label: "Senior B", captain_name: "Pat Roe", player_count: 2, created_at: "2026-11-15 09:00:00" }),
];
eq(E.filterAndSort(teams, {}).map((t) => t.id), [2, 3, 1], "default sort: division label, then name (45A, Senior B Bears, Senior B Kings)");
eq(E.filterAndSort(teams, { sort: "name" }).map((t) => t.id), [2, 3, 1], "name sort");
eq(E.filterAndSort(teams, { sort: "newest" }).map((t) => t.id), [3, 2, 1], "newest first");
eq(E.filterAndSort(teams, { sort: "players_low" }).map((t) => t.id), [3, 1, 2], "fewest players first");
eq(E.filterAndSort(teams, { q: "lorenzo" }).map((t) => t.id), [2], "search finds captain name");
eq(E.filterAndSort(teams, { q: "KEVIN@" }).map((t) => t.id), [3, 1], "search is case-insensitive and finds captain email (the default captain email is shared by the fixtures)");
eq(E.filterAndSort(teams, { q: "45a" }).map((t) => t.id), [2], "search finds division label");
eq(E.filterAndSort(teams, { division: "senior_b" }).map((t) => t.id), [3, 1], "division filter");
eq(E.filterAndSort(teams, { division: "all" }).length, 3, "division all keeps everything");
eq(E.filterAndSort(teams, { status: "submitted" }).map((t) => t.id), [2], "status filter");
eq(E.filterAndSort(teams, { show: "test" }).map((t) => t.id), [2], "show test-looking only");
eq(E.filterAndSort(teams, { show: "real" }).map((t) => t.id), [3, 1], "hide test-looking");
eq(E.filterAndSort(null, {}), [], "non-array is an empty list");
const before = JSON.stringify(teams); E.filterAndSort(teams, { sort: "name" });
ok(JSON.stringify(teams) === before, "input array is not reordered in place");

console.log("summarize / testTeamIds");
const sm = E.summarize([...teams, T({ id: 4, name: "Kings", duplicates: [{ id: 1 }] })]);
eq(sm, { total: 4, notSubmitted: 3, needReview: 1, looksTest: 1, duplicates: 1 }, "summary counts");
eq(E.testTeamIds(teams), [2], "test ids");

console.log("bulkPlan");
const bt = [
  T({ id: 1 }),
  T({ id: 2, cleanup: { can_manage: true, removal: { bulk_allowed: false, reasons: ["it has 3 players on the roster"] } } }),
  T({ id: 3, cleanup: { can_manage: true, removal: null } }),
  T({ id: 4 }),
];
const plan = E.bulkPlan(bt, [1, 2, 3]);
eq(plan.removable, [{ id: 1, name: "Kings" }], "only bulk-allowed teams are removable");
eq(plan.kept.map((k) => k.id), [2, 3], "the rest are kept");
eq(plan.kept[0].reasons, ["it has 3 players on the roster"], "kept team carries Captain Sync's reason");
ok(plan.kept[1].reasons[0].includes("could not be read"), "team with no removal info is kept, never guessed removable");
eq(E.bulkPlan(bt, []).removable, [], "nothing picked, nothing removable");
eq(E.bulkPlan(bt, [99]).removable, [], "unknown id ignored");

console.log("canConfirmRemove");
const base = { reason: "test team", typedName: "Kings", teamName: "Kings", needsAck: false, acknowledged: false };
ok(E.canConfirmRemove(base), "reason, matching name: ok");
ok(!E.canConfirmRemove({ ...base, reason: "ab" }), "reason under 3 characters");
ok(!E.canConfirmRemove({ ...base, reason: "   " }), "blank reason");
ok(!E.canConfirmRemove({ ...base, typedName: "King" }), "partial name");
ok(E.canConfirmRemove({ ...base, typedName: " kings " }), "name match ignores case and outer spaces");
ok(!E.canConfirmRemove({ ...base, needsAck: true }), "players or money need the tick");
ok(E.canConfirmRemove({ ...base, needsAck: true, acknowledged: true }), "ticked");
ok(!E.canConfirmRemove({ ...base, teamName: "", typedName: "" }), "empty team name never confirms");

console.log("text helpers");
eq(E.waiverText(T({})), "—", "empty roster shows a dash");
eq(E.waiverText(T({ waivers_signed: 7, waivers_total: 11 })), "7/11", "signed over total");
ok(E.waiversComplete(T({ waivers_signed: 11, waivers_total: 11 })), "all signed");
ok(!E.waiversComplete(T({})), "empty roster is not complete");
ok(E.testReason(T({ test_flags: ["test_name", "alias_email"] })).includes("+ alias"), "reason names both flags");
eq(E.testReason(T({})), "", "no flags, no reason");
ok(E.duplicateText(T({ duplicates: [{ same_division: true, division_label: "Senior B", captain_name: "Lorenzo Lewis" }] })).includes("same division"), "duplicate text");
eq(E.duplicateText(T({})), "", "no duplicates, no text");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
