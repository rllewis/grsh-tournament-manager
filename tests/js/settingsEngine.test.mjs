import * as E from "./.build/settingsEngine.mjs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  FAIL:", m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

console.log("1. dates are calendar days, never timezone-shifted");
const TZ = process.env.TZ || "";
eq(E.fmtDate("2027-02-28"), "Feb 28, 2027", "the PDF bug: Feb 28 stays Feb 28 (TZ=" + TZ + ")");
eq(E.fmtDate("2026-11-16"), "Nov 16, 2026", "Nov 16 stays Nov 16");
eq(E.fmtDate("2027-03-15"), "Mar 15, 2027", "Mar 15");
eq(E.fmtDate("2027-02-30"), "—", "impossible date");
eq(E.fmtDate(""), "—", "blank");
eq(E.ymdToDays("2027-13-01"), null, "month 13");
eq(E.daysBetween("2026-11-17", "2027-02-28"), 103, "103 days to close (the PDF said 102)");
eq(E.daysBetween("2027-03-13", "2027-03-14"), 1, "DST weekend is still 1 day");
eq(E.daysBetween("2026-11-01", "2026-11-02"), 1, "fall-back weekend is still 1 day");
eq(E.addDays("2027-02-28", 1), "2027-03-01", "add day across Feb");
eq(E.addDays("2028-02-28", 1), "2028-02-29", "leap day");
eq(E.addYears("2028-02-29", 1), "2029-02-28", "Feb 29 + 1y -> Feb 28");
eq(E.addYears("2027-03-15", 1), "2028-03-15", "plain +1y");
eq(E.localToday(new Date(2026, 10, 17, 23, 59)), "2026-11-17", "local today uses local parts");
eq(E.toNum(""), null, "blank is null"); eq(E.toNum("12"), 12, "string number"); eq(E.toNum("abc"), null, "text"); eq(E.toNum(NaN), null, "NaN is null");

console.log("2. timeline");
let t = E.timelineModel({ opens: "2026-11-16", closes: "2027-02-28", draft: "2027-03-15", today: "2026-11-17" });
eq(t.phase, "open", "open now"); eq(t.note, "Closes in 103 days", "days to close"); eq(t.label, "Registration open", "label");
ok(t.points.length === 3 && t.points[0].pct < t.points[1].pct && t.points[1].pct < t.points[2].pct, "points ordered left to right");
ok(t.todayPct > t.points[0].pct && t.todayPct < t.points[1].pct, "today marker sits between opens and closes");
ok(t.points.every(p => p.pct >= 0 && p.pct <= 100) && t.todayPct >= 0 && t.todayPct <= 100, "everything inside the bar");
const span1 = t.points[1].pct - t.points[0].pct, span2 = t.points[2].pct - t.points[1].pct;
ok(span1 > span2 * 4, "to scale: 104 days vs 15 days (" + span1 + " vs " + span2 + ")");
eq(E.timelineModel({ opens: "2026-12-01", closes: "2027-02-28", draft: "2027-03-15", today: "2026-11-17" }).note, "Opens in 14 days", "before opening");
eq(E.timelineModel({ opens: "2026-11-01", closes: "2026-11-17", draft: "2027-03-15", today: "2026-11-17" }).note, "Closes today", "closes today");
eq(E.timelineModel({ opens: "2026-11-01", closes: "2026-11-10", draft: "2026-11-30", today: "2026-11-17" }).note, "Draft in 13 days", "closed, draft pending");
eq(E.timelineModel({ opens: "2026-11-01", closes: "2026-11-10", draft: "2026-11-12", today: "2026-11-17" }).phase, "after", "after draft");
eq(E.timelineModel({ opens: "", closes: "", draft: "", today: "2026-11-17" }).phase, "unset", "no dates");
eq(E.timelineModel({ opens: "2027-03-01", closes: "2027-02-01", draft: "2027-01-01", today: "2026-11-17" }).problems.length, 2, "out-of-order dates reported");
eq(E.timelineModel({ opens: "2026-11-01", closes: "2026-12-01", draft: "", today: "2026-12-05" }).note, "No draft date set", "closed, no draft date");

console.log("3. validation");
const good = () => ({ season_label: "Gold Rush 2027", form_id: 5047, status: "open", registration_opens: "2026-12-01", registration_closes: "2027-02-28", draft_date: "2027-03-15",
  timer_seconds: 90, sender_email: "", sender_name: "", player_fee: null, team_deposit_amount: 500, team_fee_early_amount: 1750, team_fee_late_amount: 2000,
  team_fee_early_cutoff_date: "2027-01-06", team_balance_due_date: "2027-03-08", team_deposit_nudge_days: 10, team_balance_reminder_days: 14,
  divisions: [{ key: "gold_open", label: "Gold Open", enabled: true, teams: 4, min_roster: 8, max_roster: 12, goalie_min: 1, goalie_max: 2 }, { key: "45a", label: "45A", enabled: true, teams: 3, min_roster: 7, max_roster: 11, goalie_min: 1, goalie_max: 2 }] });
eq(E.validate(good()), {}, "good config has no errors");
const bad = (patch, key, label) => { const c = { ...good(), ...patch }; ok(!!E.validate(c)[key], `${label} -> ${key} (${JSON.stringify(E.validate(c))})`); };
bad({ registration_closes: "2026-11-01" }, "registration_closes", "closes before opens");
bad({ draft_date: "2027-02-01" }, "draft_date", "draft before close");
bad({ registration_opens: "2026-02-30" }, "registration_opens", "impossible date");
bad({ timer_seconds: "" }, "timer_seconds", "blank timer (was NaN)");
bad({ timer_seconds: 5 }, "timer_seconds", "short timer");
bad({ sender_email: "nope" }, "sender_email", "bad email");
bad({ player_fee: "-3" }, "player_fee", "negative fee");
bad({ player_fee: "abc" }, "player_fee", "text fee");
bad({ team_fee_early_amount: 2500 }, "team_fee_late_amount", "early above late");
bad({ team_deposit_amount: 1800 }, "team_deposit_amount", "deposit above early");
bad({ team_balance_due_date: "2026-12-31" }, "team_balance_due_date", "balance before cutoff");
bad({ form_id: "" }, "form_id", "blank form");
bad({ season_label: "  " }, "season_label", "blank label");
bad({ team_deposit_nudge_days: 0 }, "team_deposit_nudge_days", "zero days");
ok(E.validate({ ...good(), player_fee: "" }).player_fee === undefined, "blank fee is fine (not set)");
const dv = (p) => ({ ...good(), divisions: [{ ...good().divisions[0], ...p }, good().divisions[1]] });
ok(E.validate(dv({ teams: "" }))["divisions.0.teams"], "blank teams (was NaN -> 0)");
ok(E.validate(dv({ max_roster: 6 }))["divisions.0.max_roster"], "max below min");
ok(E.validate(dv({ goalie_min: 3, goalie_max: 1 }))["divisions.0.goalie_max"], "goalie max below min");
ok(E.validate(dv({ goalie_max: 6, max_roster: 5, min_roster: 5 }))["divisions.0.goalie_max"], "more goalie spots than roster spots");
ok(E.validate(dv({ label: "" }))["divisions.0.label"], "no name");
ok(E.validate({ ...good(), divisions: [{ ...good().divisions[0], enabled: false }] }).divisions, "all off");
eq(E.tabOfError("divisions.1.teams"), "divisions", "tab for division error"); eq(E.tabOfError("sender_email"), "email", "tab for email"); eq(E.tabOfError("team_fee_late_amount"), "fees", "tab for fee");
eq(E.errorTabCounts({ "divisions.0.teams": "x", "divisions.1.teams": "y", form_id: "z" }), { divisions: 2, season: 1 }, "tab counts");

console.log("4. diff");
const a = good(), b = good(); b.status = "draft"; b.divisions[1].teams = 4; b.divisions[0].enabled = false; b.player_fee = "185"; b.team_fee_early_amount = "1750.00"; b.timer_seconds = "90";
const d = E.diff(a, b);
eq(d.map(x => x.key).sort(), ["divisions.45a.teams", "divisions.gold_open.enabled", "player_fee", "status"], "four real changes, numeric strings ignored");
eq(d.find(x => x.key === "player_fee").to, "$185", "fee formatted"); eq(d.find(x => x.key === "player_fee").from, "not set", "blank shown as not set");
eq(d.find(x => x.key === "divisions.gold_open.enabled").label, "Gold Open · enabled", "division label"); eq(d.find(x => x.key === "divisions.gold_open.enabled").to, "Off", "bool shown");
eq(E.diff(a, a), [], "no self diff");
eq(E.fmtValue("registration_closes", "2027-02-28"), "Feb 28, 2027", "date formatting in diff");
eq(E.money(1750), "$1,750", "money whole"); eq(E.money(185.5), "$185.50", "money cents"); eq(E.money(null), "—", "money null");
eq(E.diff({ ...a, timer_enabled: true }, { ...a, timer_enabled: false })[0].to, "Off", "boolean toggle");

console.log("5. fees, capacity, warnings");
let f = E.teamFeeFor(good(), "2027-01-06"); eq(f.tier, "early", "paid on the cutoff day is early (server uses <=)"); eq(f.total, 1750, "early total"); eq(f.balance, 1250, "balance after deposit");
f = E.teamFeeFor(good(), "2027-01-07"); eq(f.tier, "late", "day after cutoff is late"); eq(f.total, 2000, "late total"); eq(f.daysFromCutoff, 1, "1 day late"); eq(f.saving, 250, "early saves 250");
eq(E.teamFeeFor({ ...good(), team_fee_early_cutoff_date: "" }, "2027-01-01"), null, "unknown when cutoff missing");
eq(E.capacity({ teams: 4, max_roster: 12, min_roster: 8, goalie_min: 1 }), { slots: 48, needed: 32, goalies: 4 }, "capacity math");
eq(E.capacity({ teams: "", max_roster: 12, min_roster: 8 }).slots, null, "blank teams -> unknown");
const reg = { gold_open: { registered: 24 }, "45a": { registered: 40 } };
const w = E.divisionWarnings(good(), { ...good(), divisions: [{ ...good().divisions[0], enabled: false }, good().divisions[1]] }, reg);
ok(w.some(x => /Gold Open is being turned off but has 24 registered players/.test(x)), "disable with players warns"); ok(w.some(x => /45A: 40 players registered but only 33 roster spots/.test(x)), "capacity below registered warns");
eq(E.divisionWarnings(good(), good(), { gold_open: { registered: 24 } }), [], "no warning when fine");
eq(E.divisionWarnings(good(), { ...good(), divisions: [{ ...good().divisions[0], enabled: false }, good().divisions[1]] }, {}).length, 0, "disabling an empty division is silent");

console.log("6. rollover / export / import / payload");
const g = { ...good(), season_year: 2027 };
const r = E.rolloverPlan(g);
eq(r.season_year, 2028, "next year"); eq(r.season_label, "Gold Rush 2028", "label year swapped"); eq(r.status, "setup", "starts in setup");
eq(r.registration_closes, "2028-02-28", "dates +1y"); eq(r.team_fee_early_cutoff_date, "2028-01-06", "fee cutoff +1y"); eq(r.divisions.length, 2, "divisions copied"); ok(r.divisions[0] !== g.divisions[0], "divisions are copies");
const ex = E.exportPayload(g, new Date("2026-11-17T12:00:00Z"));
eq(ex.format, "grsh-settings", "format tag"); ok(ex.settings.divisions && !ex.settings._last_saved_at, "no private fields");
const im = E.importPayload(JSON.stringify(ex)); ok(im.ok && im.settings.team_fee_late_amount === 2000, "round trip");
ok(!E.importPayload("{nope").ok, "bad json refused"); ok(!E.importPayload('{"format":"other"}').ok, "wrong format refused"); ok(!E.importPayload('{"format":"grsh-settings","settings":{}}').ok, "empty refused");
const im2 = E.importPayload(JSON.stringify({ format: "grsh-settings", settings: { status: "draft", evil: 1, __proto__x: 2 } })); eq(im2.settings, { status: "draft" }, "unknown keys dropped"); eq(im2.ignored.sort(), ["__proto__x", "evil"], "ignored reported");
const p = E.buildPayload({ ...good(), _last_saved_at: "x", form_id: "5047", timer_seconds: "", divisions: [{ ...good().divisions[0], teams: "4" }] }, "2026-11-17 10:00:00");
eq(p.form_id, 5047, "form id to number"); eq(p.timer_seconds, "", "blank stays blank for the server to name"); eq(p.divisions[0].teams, 4, "division number"); ok(!("_last_saved_at" in p), "private keys stripped"); eq(p.base_saved_at, "2026-11-17 10:00:00", "conflict token sent"); eq(p.player_fee, null, "blank fee -> null");
eq(E.wiringState({ a: { state: "not_connected" } }, "a"), "not_connected", "wiring state"); eq(E.wiringState({}, "zzz"), "active", "unknown defaults to active");

console.log(`\nPASS ${pass}  FAIL ${fail}`); process.exit(fail ? 1 : 0);
