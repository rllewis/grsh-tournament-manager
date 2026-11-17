import * as D from "./.build/dashboardEngine.mjs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  FAIL:", m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

console.log("safe numbers");
eq(D.num(undefined), null, "undefined → null"); eq(D.num(null), null, "null → null"); eq(D.num(""), null, "empty string → null"); eq(D.num("7"), 7, "'7' → 7"); eq(D.num(NaN), null, "NaN → null"); eq(D.num(Infinity), null, "Infinity → null");
eq(D.pct(7, 7), 100, "7/7"); eq(D.pct(0, 5), 0, "0/5 is a real 0"); eq(D.pct(1, 0), null, "x/0 → null (never Infinity/NaN)"); eq(D.pct(undefined, 5), null, "missing have → null"); eq(D.pct(9, 5), 100, "capped at 100"); eq(D.pct(-1, 5), 0, "floored at 0");
eq(D.fmtPct(null), "—", "null shows dash"); eq(D.fmtPct(0), "0%", "real zero shows 0%"); eq(D.fmtPct(undefined), "—", "undefined shows dash");

console.log("readiness: the bug from the screenshot");
// The old page computed Math.round(undefined / n) → NaN and fed it into the score. Here every missing input is excluded.
const shot = { registration: { have: 7, of: 35 }, payments: { have: 7, of: 7 }, approvals: undefined, rosters: null };
const r = D.readiness(shot);
ok(Number.isFinite(r.score), "score is a finite number with missing inputs"); eq(r.basis, 2, "based on 2 of 4 measures"); eq(r.total, 4, "out of 4");
eq(r.score, Math.round((20 * 30 + 100 * 25) / 55), "re-weighted over available measures only");
ok(r.rows.every((x) => x.pct === null || Number.isFinite(x.pct)), "no NaN in any row");
eq(r.rows.find((x) => x.key === "approvals").pct, null, "missing approvals shows as null, not NaN%");
eq(D.readiness({}).score, null, "nothing measurable → null score"); eq(D.readiness(null).score, null, "null metrics → null score"); eq(D.readiness(undefined).basis, 0, "undefined metrics → basis 0");
eq(D.readiness({ payments: { have: 0, of: 5 } }).score, 0, "a measured 0% is a real 0");
const full = D.readiness({ registration: { have: 40, of: 35 }, payments: { have: 40, of: 40 }, approvals: { have: 40, of: 40 }, rosters: { have: 6, of: 6 } });
eq(full.score, 100, "everything done → 100"); eq(D.bandFor(100), "ready", "100 ready"); eq(D.bandFor(75), "track", "75 on track"); eq(D.bandFor(55), "attention", "55 attention"); eq(D.bandFor(10), "start", "10 start"); eq(D.bandFor(null), "none", "null → none");
ok(D.BAND.none.label.length > 0 && D.BAND[D.bandFor(null)], "band for null exists");

console.log("time");
eq(D.ago("2026-11-17 10:00:00", "2026-11-17 10:00:20"), "just now", "20s"); eq(D.ago("2026-11-17 10:00:00", "2026-11-17 10:05:00"), "5 min ago", "5 min");
eq(D.ago("2026-11-17 08:00:00", "2026-11-17 10:00:00"), "2 hours ago", "2 hours"); eq(D.ago("2026-11-16 10:00:00", "2026-11-17 10:00:00"), "1 day ago", "1 day singular");
eq(D.ago("garbage", "2026-11-17 10:00:00"), "", "bad input → empty"); eq(D.ago(null, null), "", "null → empty"); eq(D.ago("2026-11-17 11:00:00", "2026-11-17 10:00:00"), "just now", "future clamps to now");
eq(D.daysUntil("2027-04-09", new Date(2026, 10, 17)), 143, "Nov 17 2026 → Apr 9 2027 is 143 days"); eq(D.daysUntil("2026-11-17", new Date(2026, 10, 17)), 0, "today is 0"); eq(D.daysUntil("2026-11-10", new Date(2026, 10, 17)), -7, "past negative");
eq(D.daysUntil("", new Date()), null, "empty → null"); eq(D.daysUntil("nope", new Date()), null, "bad → null"); eq(D.daysUntil(undefined, new Date()), null, "undefined → null");
ok(D.prettyDate("2027-04-09").includes("2027"), "pretty date"); eq(D.prettyDate("x"), "", "bad pretty → empty");
eq(D.actionLabel("sync_failed"), "Import failed", "known action label"); eq(D.actionLabel("some_new_action"), "Some new action", "unknown action humanised"); eq(D.actionLabel(null), "", "null action");

console.log("next actions");
const div = (o) => ({ key: "gold_open", label: "Gold Open", configured: true, registered: 20, goalies: 3, planned_teams: 3, teams: 0, stage: "draft", rostered: 0, ...o });
const base = { sync_failures_7d: 0, tournament_date: "2027-04-09", totals: { sandbagging_flags: 0, unpaid: 0, registered: 20 }, metrics: { approvals: { have: 20, of: 20 } }, divisions: [div({ teams: 3, stage: "locked" })] };
eq(D.nextActions(null), [], "null payload → none"); eq(D.nextActions({}).length >= 0, true, "empty payload doesn't throw");
eq(D.nextActions(base)[0].key, "publish_gold_open", "all else clear → publish is next");
const busy = { ...base, sync_failures_7d: 2, tournament_date: "", totals: { sandbagging_flags: 2, unpaid: 1, registered: 20 }, metrics: { approvals: { have: 15, of: 20 } }, divisions: [div({ goalies: 1 })] };
const a = D.nextActions(busy, { unsynced: 6 });
eq(a[0].key, "sync_failed", "failures come first"); ok(a.map((x) => x.key).includes("unsynced"), "unsynced listed");
ok(a.findIndex((x) => x.severity === "high") < a.findIndex((x) => x.severity === "medium"), "high before medium");
ok(a.some((x) => x.key === "date"), "missing date listed"); ok(a.some((x) => x.key === "goalies_gold_open" && /2 more goalies/.test(x.text)), "goalie shortfall (3 teams, 1 goalie → 2 more)");
ok(a.some((x) => x.key === "teams_gold_open" && x.params === "?division=gold_open"), "no teams → rosters link carries division");
ok(a.some((x) => /1 player still owes/.test(x.text)), "singular grammar: 1 player still owes"); ok(a.some((x) => /5 players not approved/.test(x.text)), "5 not approved");
ok(D.nextActions({ ...base, divisions: [div({ configured: false, teams: 0 })] }).every((x) => !x.key.startsWith("teams_")), "unconfigured division ignored");
eq(D.nextActions(base, { unsynced: null }).some((x) => x.key === "unsynced"), false, "unknown unsynced doesn't raise a false alarm");

console.log("fill state");
eq(D.fillState({ registered: 10, min_needed: 21, capacity: 36 }).state, "short", "short"); eq(D.fillState({ registered: 10, min_needed: 21, capacity: 36 }).short, 11, "11 short");
eq(D.fillState({ registered: 25, min_needed: 21, capacity: 36 }).state, "ok", "ok"); eq(D.fillState({ registered: 36, min_needed: 21, capacity: 36 }).state, "full", "full");
eq(D.fillState({ registered: 5, min_needed: 0, capacity: 0 }).state, "unknown", "no config → unknown (no divide by zero)"); eq(D.fillState(null).state, "unknown", "null → unknown");

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
