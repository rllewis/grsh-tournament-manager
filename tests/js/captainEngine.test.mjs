import * as E from "./.build/captainEngine.mjs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  FAIL:", m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
const T = (id, stage, extra = {}) => ({ id, name: "Team " + id, stage, captain: { name: "Cap " + id, email: `c${id}@x.test` }, account: "active", roster_size: 0, payment_status: "unpaid", ...extra });

console.log("1. funnel is cumulative");
const teams = [T(1, "invited"), T(2, "active"), T(3, "roster"), T(4, "deposit"), T(5, "paid")];
eq(E.funnelSteps(teams).map((s) => s.n), [5, 4, 3, 2, 1], "each step counts teams at or beyond it");
eq(E.funnelSteps(teams).map((s) => s.pct), [100, 80, 60, 40, 20], "percentages of all teams");
eq(E.funnelSteps([]).map((s) => s.pct), [0, 0, 0, 0, 0], "no teams, no NaN");
eq(E.stageIndex("bogus"), 0, "unknown stage is the first");

console.log("2. headline");
const base = { season: { exists: true, year: 2027 }, pending: 0, issues: [], teams: [T(1, "roster")] };
eq(E.verdict(null), null, "no data");
eq(E.verdict({ ...base, season: { exists: false, year: 2099 } }).tone, "bad", "missing season is bad");
ok(E.verdict({ ...base, season: { exists: false, year: 2099 } }).detail.includes("2099"), "names the missing year");
eq(E.verdict({ ...base, pending: 2 }).headline, "2 deposits never reached their teams", "pending plural");
eq(E.verdict({ ...base, pending: 1 }).headline, "1 deposit never reached its team", "pending singular");
eq(E.verdict({ ...base, issues: [{ level: "bad" }] }).tone, "warn", "problems without pending");
eq(E.verdict({ ...base, issues: [{ level: "warn" }] }).headline, "1 thing worth a look", "warnings");
eq(E.verdict({ ...base, teams: [] }).tone, "info", "no teams");
eq(E.verdict(base).tone, "ok", "all clear");
eq(E.verdict({ ...base, pending: 3, issues: [{ level: "bad" }] }).tone, "bad", "pending wins over problems");

console.log("3. teams list");
const ts = [T(1, "invited", { name: "Red Wings", captain: { name: "Ann Lee", email: "ann@x.test" } }), T(2, "paid", { name: "Blue" })];
eq(E.filterTeams(ts, { q: "ann" }).map((t) => t.id), [1], "search by captain");
eq(E.filterTeams(ts, { q: "RED" }).map((t) => t.id), [1], "case-insensitive team name");
eq(E.filterTeams(ts, { stage: "deposit" }).map((t) => t.id), [2], "stage filter means at least that far");
eq(E.filterTeams(ts, { problemsOnly: true, problemTeamIds: [2] }).map((t) => t.id), [2], "problems only");
eq(E.filterTeams(ts, {}).length, 2, "no filter");
eq(E.nextStep(T(1, "invited", { captain: null })), "Add a captain", "no captain");
eq(E.nextStep(T(1, "invited", { account: "none" })), "Send an invite", "no account");
eq(E.nextStep(T(1, "invited", { account: "pending" })), "Waiting for the captain to set a password", "pending");
eq(E.nextStep(T(1, "active")), "Waiting for a roster", "no roster");
eq(E.nextStep(T(1, "roster", { roster_size: 4 })), "Waiting for the deposit", "no deposit");
eq(E.nextStep(T(1, "deposit", { roster_size: 4, deposit_paid_at: "x" })), "Balance due", "balance");
eq(E.nextStep(T(1, "paid", { roster_size: 4, deposit_paid_at: "x", payment_status: "paid_in_full" })), "Done", "done");

console.log("4. deposits");
const entries = [
  { entry_id: 1, state: "needs_recording", would: { fee_tier: "early", balance_due: 1250, deposit_amount: 500 } },
  { entry_id: 2, state: "needs_recording", would: { fee_tier: "late", balance_due: 1500, deposit_amount: 500 } },
  { entry_id: 3, state: "recorded", would: null }, { entry_id: 4, state: "test" },
];
eq(E.recordSummary(entries, [1, 2, 3, 4], false), { count: 2, early: 1, late: 1, balance: 2750, deposit: 1000, email: false }, "summary counts only entries that will be written");
eq(E.recordSummary(entries, [], true).count, 0, "nothing selected"); eq(E.recordSummary(entries, [1], true).email, true, "email flag carried");
eq(E.chunk([1, 2, 3, 4, 5, 6, 7], 3), [[1, 2, 3], [4, 5, 6], [7]], "batches"); eq(E.chunk([], 5), [], "empty");
eq(E.tallyResults([{ status: "recorded" }, { status: "recorded" }, { status: "skipped" }, { status: "error" }, { status: "?" }]), { recorded: 2, skipped: 1, error: 1 }, "tally");
eq([E.entryState("needs_recording").tone, E.entryState("test").tone, E.entryState("zzz").label], ["bad", "mute", "zzz"], "state labels");
eq(E.money(1750), "$1,750.00", "money"); eq(E.money(null), "—", "null money"); eq(E.statusLabel("deposit_paid"), "deposit paid", "status label");

console.log("5. problems and exports");
const iss = [{ level: "info", title: "b", team_id: 3 }, { level: "bad", title: "z", team_id: 1 }, { level: "warn", title: "a", team_id: 2 }, { level: "bad", title: "c" }];
eq(E.groupIssues(iss).map((i) => i.level), ["bad", "bad", "warn", "info"], "worst first");
eq(E.groupIssues(iss).map((i) => i.title).slice(0, 2), ["c", "z"], "then alphabetical");
eq(E.issueCounts(iss), { bad: 2, warn: 1, info: 1 }, "counts");
eq(E.problemTeamIds(iss).sort(), [1, 2], "info items do not count as team problems");
const csv = E.teamsCSV({ teams: [T(1, "roster", { name: "=EVIL", division: "gold_open", fee_total: 1750, balance_due: 1250 })] });
eq(csv.split("\r\n")[0], "team,division,captain,captain_email,account,roster_size,stage,payment_status,fee_tier,fee_total,balance_due,age_days,looks_test,last_nudged_at", "teams header");
ok(csv.split("\r\n")[1].startsWith("'=EVIL,"), "formula in a team name is neutralised in the export");
const ecsv = E.entriesCSV({ entries: [{ entry_id: 9, form: "live", date: "2027-01-05 10:00:00", team: "A", captain: "B", state: "needs_recording", would: { fee_tier: "early", fee_total: 1750, balance_due: 1250 } }, { entry_id: 10, form: "test", state: "test" }] });
eq(ecsv.split("\r\n")[1], "9,live,2027-01-05 10:00:00,A,B,needs_recording,early,1750,1250", "entry row"); eq(ecsv.split("\r\n")[2], "10,test,,,,test,,,", "entry without a preview");


console.log("6. clean-up groups and delete confirmation");
const D = (ok, why = []) => ({ allowed: ok, reasons: why });
const cl = [
  T(1, "invited", { looks_test: true, test_flags: ["test_name", "alias_email"], delete: D(true) }),
  T(2, "invited", { looks_test: false, delete: D(true), captain: null }),
  T(3, "roster", { looks_test: true, test_flags: ["alias_email"], delete: D(false, ["it has 12 players on the roster"]) }),
  T(4, "deposit", { looks_test: false, delete: D(false, ["a payment is recorded on it"]) }),
];
const g = E.cleanupGroups(cl);
eq([g.suspect.map((t) => t.id), g.other.map((t) => t.id), g.protected.map((t) => t.id), g.deletable], [[1], [2], [3, 4], 2], "suspect, other deletable and protected piles");
eq(E.cleanupGroups([]).deletable, 0, "empty");
eq(E.testReasons(cl[0]), ['has "test" in a name', "captain email uses a + alias"], "plain reasons");
eq([E.deleteWordOk("DELETE"), E.deleteWordOk(" delete "), E.deleteWordOk("del"), E.deleteWordOk(""), E.deleteWordOk(null)], [true, true, false, false, false], "typed word check");
const ds = E.deleteSummary(cl, [1, 2, 3]);
eq([ds.picked, ds.ok.map((t) => t.id), ds.blocked.map((t) => t.id), ds.withCaptain], [3, [1, 2], [3], 1], "what the dialog will say");

console.log("7. stuck days, reminders");
eq([E.stuckDays({ stage: "invited", age_days: 12 }), E.stuckDays({ stage: "deposit", age_days: 40 }), E.stuckDays({ stage: "roster", age_days: null }), E.stuckDays(null)], [12, 0, 0, 0], "stuck only before the deposit");
eq([E.stuckTone(2), E.stuckTone(7), E.stuckTone(14)], ["mute", "warn", "bad"], "tone thresholds");
eq([E.ageLabel(0), E.ageLabel(1), E.ageLabel(9), E.ageLabel(null)], ["today", "1 day", "9 days", ""], "age text");
const now = Date.parse("2027-01-10T12:00:00Z");
const nt = [T(1, "invited"), T(2, "deposit"), T(3, "invited", { looks_test: true }), T(4, "invited", { captain: null }), T(5, "active", { last_nudged_at: "2027-01-10 08:00:00" }), T(6, "active", { last_nudged_at: "2027-01-01 08:00:00" })];
eq(E.nudgeCandidates(nt, 3, now).map((t) => t.id), [1, 6], "skips paid, test, no captain and recently nudged");
eq(E.filterTeamsMore([{ stage: "invited", age_days: 10, captain: {} }, { stage: "invited", age_days: 2, captain: null }], { stuck: 7 }).length, 1, "stuck filter");
eq(E.filterTeamsMore([{ stage: "invited", age_days: 10, captain: {} }, { stage: "invited", age_days: 2, captain: null }], { noCaptain: true }).length, 1, "no-captain filter");

console.log("8. money and balance wording");
const M = { tier_now: "early", days_left: 40, waiting: 8, saves_per_team: 250, fee_now: 1750 };
eq(E.earlyBirdLine(M), "Early fee ends in 40 days. 8 teams still to pay. Each team saves $250.00.", "early-bird line");
eq(E.earlyBirdLine({ ...M, tier_now: "late", days_left: null }), "The early fee has ended. 8 teams still to pay at $1,750.00.", "late line");
eq(E.earlyBirdLine({ ...M, waiting: 0 }), "Every team has paid a deposit.", "all paid"); eq(E.earlyBirdLine(null), "", "no data");
eq([E.balanceStatus({ expected: 3, actual: 3, delta: 0 }), E.balanceStatus({ expected: 3, actual: 5, delta: 2 }), E.balanceStatus({ expected: 3, actual: 1, delta: -2 }), E.balanceStatus({ expected: null, actual: 1, delta: null })].map((x) => x.label), ["On target", "2 over", "2 to find", "1 team"], "division status");
eq(E.healthSummary([{ ok: true }, { ok: false, text: "x" }, { ok: true }]).okCount, 2, "health ok count"); eq(E.healthSummary([{ ok: true }]).allOk, true, "all ok"); eq(E.healthSummary([]).allOk, false, "none is not ok");

console.log("9. next-best actions");
const base2 = { season: { exists: true, year: 2027 }, pending: 0, issues: [], teams: [], balance: { rows: [] }, money: { tier_now: "late", waiting: 0, days_left: null }, cooldown_days: 3 };
eq(E.actionQueue(null), [], "no data"); eq(E.actionQueue({ ...base2, season: { exists: false } }), [], "no season, no actions"); eq(E.actionQueue(base2), [], "nothing to do");
const busy = { ...base2, pending: 2, teams: [T(1, "invited", { division_ok: false, age_days: 10, looks_test: true, delete: D(true) }), T(2, "invited", { division_ok: true, captain: null, age_days: 1, delete: D(true) }), T(3, "invited", { division_ok: true, age_days: 9, delete: D(true) })],
  balance: { rows: [{ label: "Gold Open", delta: 2 }] }, money: { tier_now: "early", waiting: 3, days_left: 10 } };
const q = E.actionQueue(busy);
eq(q.map((a) => a.key), ["record", "division", "cleanup", "captain", "nudge", "balance"], "ranked, capped at six");
eq(q[0].title, "Record 2 deposits", "plural"); eq(q[2].title, "Remove 1 test team", "test teams"); eq(q[3].go, { tab: "teams", filter: "nocaptain" }, "deep link into the teams tab");
eq(E.actionQueue({ ...base2, money: { tier_now: "early", waiting: 3, days_left: 10 }, teams: [T(1, "invited", { division_ok: true, age_days: 1, delete: D(false) })] }).map((a) => a.key), ["earlybird"], "early-bird nudge on its own");
eq(E.actionQueue({ ...base2, money: { tier_now: "early", waiting: 3, days_left: 90 } }).length, 0, "early-bird only inside three weeks");
eq(E.verdict({ ...base2, pending: 1, issues: [{ level: "warn" }] }).cta, { tab: "deposits", label: "Review deposits" }, "verdict CTA for deposits"); ok(E.verdict({ ...base2, pending: 1, issues: [{ level: "warn" }] }).detail.includes("1 other problem"), "verdict mentions other problems");
eq(E.verdict({ ...base2, issues: [{ level: "bad" }], teams: [T(1, "roster")] }).cta.tab, "problems", "verdict CTA for problems");
eq(E.historyTitle("captain_sync_team_deleted"), "Team deleted", "history title"); eq(E.historyTitle("zzz"), "zzz", "unknown action");
const csv2 = E.teamsCSV({ teams: [T(1, "invited", { name: "N", division: "45a", age_days: 4, looks_test: true, last_nudged_at: "2027-01-01 08:00:00" })] });
ok(csv2.split("\r\n")[0].endsWith("age_days,looks_test,last_nudged_at") && csv2.split("\r\n")[1].endsWith(",4,yes,2027-01-01 08:00:00"), "teams export has age, test flag and last nudge");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
