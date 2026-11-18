import * as E from "./.build/scoreEngine.mjs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  FAIL:", m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
const T = (id, name, extra = {}) => ({ id, name, division: "gold_open", division_label: "Gold Open", type: "full_team", warnings: [], changed: null, ...extra });
const teams = [T(1, "Team Ann"), T(2, "Team Bo"), T(3, "Draft Squad", { type: "draft" }), T(4, "Ice Wolves"), T(5, "Ice Wolves Two")];

console.log("1. dates and times");
eq(E.parseDate("2027-01-16"), "2027-01-16", "ISO");
eq(E.parseDate("1/16/2027"), "2027-01-16", "US slash");
eq(E.parseDate("1/6/27"), "2027-01-06", "two-digit year");
eq(E.parseDate("Jan 16, 2027"), "2027-01-16", "month name");
eq(E.parseDate("Sat Jan 16, 2027"), "2027-01-16", "with weekday");
eq(E.parseDate("January 16th 2027"), "2027-01-16", "long month and ordinal");
eq(E.parseDate("2027-02-30"), "", "impossible date");
eq(E.parseDate("13/1/2027"), "", "month 13");
eq(E.parseDate("garbage"), "", "garbage");
eq(E.parseDate(""), "", "blank");
eq(E.parseTime("19:30"), "19:30", "24 hour");
eq(E.parseTime("7:30 PM"), "19:30", "12 hour pm");
eq(E.parseTime("7pm"), "19:00", "bare pm");
eq(E.parseTime("12am"), "00:00", "midnight");
eq(E.parseTime("12:15 pm"), "12:15", "noon hour");
eq(E.parseTime("25:00"), "", "bad hour");
eq(E.parseTime("7:75"), "", "bad minute");
eq(E.parseTime("13pm"), "", "13pm");
eq(E.addMinutes("19:30", 75), "20:45", "add minutes");
eq(E.addMinutes("23:00", 120), "23:59", "does not wrap past midnight");
eq(E.addMinutes("", 30), "", "blank stays blank");
eq(E.prettyTime("19:30"), "7:30 PM", "pretty pm");
eq(E.prettyTime("00:05"), "12:05 AM", "pretty midnight");
eq(E.prettyDate("2027-01-16"), "Sat Jan 16, 2027", "pretty date matches the server");
eq(E.nextGameNo("7"), "8", "numeric");
eq(E.nextGameNo("G-09"), "G-10", "prefix and padding");
eq(E.nextGameNo("A9"), "A10", "carry");
eq(E.nextGameNo(""), "", "blank stays blank");
eq(E.nextGameNo("Final"), "Final", "no digits is left alone");

console.log("2. teams");
eq(E.teamOptions(teams, false).map((o) => o.id), [4, 5, 1, 2], "draft-format teams hidden by default, sorted");
eq(E.teamOptions(teams, true).length, 5, "or shown on request");
eq(E.readiness(T(1, "x", { warnings: [{ level: "info" }, { level: "warn" }] })).level, "warn", "worst warning wins");
eq(E.readiness(T(1, "x")).level, "ok", "no warnings is ok");
eq(E.readiness(null).level, "ok", "null team");
eq(E.changeText({ added: ["A"], removed: ["B", "C"], jersey: ["D"] }), "added A; removed B, C; new number for D", "change text");
eq(E.changeText(null), "", "no change");
eq(E.matchTeam("team ann", teams), { id: 1, found: true }, "case-insensitive exact");
eq(E.matchTeam("TBD", teams), { id: 0, found: true }, "TBD is the blank side");
eq(E.matchTeam("", teams), { id: 0, found: true }, "empty is the blank side");
eq(E.matchTeam("Ice Wolves", teams).id, 4, "exact wins over a longer partial");
ok(!E.matchTeam("Ice", teams).found, "ambiguous partial is not guessed");
eq(E.matchTeam("Squad", teams).id, 3, "single partial match");
ok(!E.matchTeam("Nobody", teams).found, "unknown");

console.log("3. pasted schedule");
const csv = `Date,Time,Home,Away,Arena,Game #,Type
2027-01-16,7:30 PM,Team Ann,Team Bo,Tahoe Ice,7,Regular
1/17/2027,9am,Team Bo,TBD,"Rink, North",8,playoff
bad date,7pm,Team Ann,Team Bo
2027-01-18,25:00,Team Ann,Team Bo,Rink,9
2027-01-18,7pm,Nobody,Team Bo
2027-01-18,7pm,Team Ann
`;
const r = E.parseSchedule(csv, teams, { arena: "Default Rink" });
eq(r.games.length, 2, "two good rows, header skipped");
eq([r.games[0].home_id, r.games[0].away_id, r.games[0].date, r.games[0].game_time, r.games[0].arena, r.games[0].game_no, r.games[0].type], [1, 2, "2027-01-16", "19:30", "Tahoe Ice", "7", "REG"], "first row fields");
eq([r.games[1].away_id, r.games[1].arena, r.games[1].type, r.games[1].game_time], [0, "Rink, North", "PLAYOFF", "09:00"], "quoted comma, TBD, type by name");
eq(r.problems.length, 4, "four bad rows are reported, not dropped silently");
ok(r.problems[0].reason.includes("date") && r.problems[0].line === 4, "bad date names the line");
ok(r.problems[1].reason.includes("time"), "bad time");
ok(r.problems[2].reason.includes("home team"), "unknown home team");
ok(r.problems[3].reason.includes("at least"), "too few columns");
const tsv = "2027-01-16\t19:30\tTeam Ann\tTeam Bo\tTahoe Ice\t3";
eq(E.parseSchedule(tsv, teams).games.length, 1, "tab-separated (pasted from Excel)");
eq(E.parseSchedule("", teams), { games: [], problems: [] }, "empty paste");
eq(E.parseSchedule("2027-01-16,7pm,Team Ann,Team Bo", teams, { arena: "Default Rink", type: "MAKEUP" }).games[0].arena, "Default Rink", "default arena fills blanks");
eq(E.parseSchedule("2027-01-16,,Team Ann,Team Bo", teams).games[0].game_time, "", "blank time allowed");
eq(E.eventToGame({ home_id: 1, away_id: 0, date: "2027-01-16", time: "19:30", arena: "X" }, "CHAMP").type, "CHAMP", "event becomes a game");

console.log("4. series");
const s = E.buildSeries({ count: 4, date: "1/16/2027", start: "9:00 AM", gap: 75, arena: "Tahoe Ice", firstNo: "12", type: "REG" });
eq(s.map((g) => g.game_time), ["09:00", "10:15", "11:30", "12:45"], "times step by the gap");
eq(s.map((g) => g.game_no), ["12", "13", "14", "15"], "numbers count up");
ok(s.every((g) => g.date === "2027-01-16" && g.arena === "Tahoe Ice" && g.home_id === 0), "same date and arena, teams left blank");
eq(new Set(s.map((g) => g.uid)).size, 4, "every game has its own id");
eq(E.buildSeries({ count: 500, start: "", gap: 30 }).length, E.MAX_GAMES, "series is capped");
eq(E.buildSeries({ count: 2, start: "", gap: 30 }).map((g) => g.game_time), ["", ""], "no start time, no times");
eq(E.buildSeries({ count: -3 }).length, 0, "negative count");

console.log("5. checking the queue");
const warnTeams = [T(1, "Team Ann", { warnings: [{ level: "warn", text: "No goalie on the roster." }, { level: "info", text: "FYI" }], changed: { added: ["Z"], removed: [], jersey: [] } }), T(2, "Team Bo"), T(4, "Ice Wolves")];
const G = (o) => E.blankGame(o);
let q = [G({ home_id: 1, away_id: 2, date: "2027-01-16", game_time: "19:30", arena: "R1", game_no: "7" })];
let c = E.checkQueue(q, warnTeams)[0];
ok(c.some((x) => x.text.includes("No goalie")), "roster warning bubbles up");
ok(!c.some((x) => x.text.includes("FYI")), "info-level roster notes stay out of the queue");
ok(c.some((x) => x.text.includes("changed since the last print") && x.text.includes("added Z")), "changed-since-print flag");
q = [G({ home_id: 1, away_id: 1, date: "2027-01-16" })]; ok(E.checkQueue(q, warnTeams)[0].some((x) => x.level === "bad" && x.text.includes("same team")), "same team is bad");
q = [G({ home_id: 99, away_id: 2, date: "2027-01-16" })]; ok(E.checkQueue(q, warnTeams)[0].some((x) => x.level === "bad" && x.text.includes("not on this season")), "removed team is bad");
q = [G({ home_id: 2, away_id: 4, date: "2027-01-16", game_time: "10:00" }), G({ home_id: 4, away_id: 1, date: "2027-01-16", game_time: "10:00" })];
c = E.checkQueue(q, warnTeams); ok(c[0].some((x) => x.level === "bad" && x.text.includes("two games at the same time")) && c[1].some((x) => x.level === "bad" && x.text.includes("two games")), "team double-booked is bad on both rows");
q = [G({ home_id: 2, away_id: 4, date: "2027-01-16", game_time: "10:00" }), G({ home_id: 2, away_id: 4, date: "2027-01-16", game_time: "11:15" })];
ok(!E.checkQueue(q, warnTeams)[0].some((x) => x.text.includes("same time")), "different times are fine");
q = [G({ home_id: 2, away_id: 0, date: "2027-01-16", game_time: "10:00", arena: "Rink A" }), G({ home_id: 4, away_id: 0, date: "2027-01-16", game_time: "10:00", arena: "rink a" })];
ok(E.checkQueue(q, warnTeams)[0].some((x) => x.level === "warn" && x.text.includes("arena")), "arena clash is a warning, case-insensitive");
q = [G({ game_no: "5" }), G({ game_no: "5" }), G({ game_no: "6" })];
c = E.checkQueue(q, warnTeams); ok(c[0].some((x) => x.text.includes("used more than once")) && c[1].some((x) => x.text.includes("used more than once")) && !c[2].some((x) => x.text.includes("used more")), "duplicate game numbers");
ok(E.checkQueue([G({})], warnTeams)[0].some((x) => x.text.includes("Blank sheet")), "blank game is explained");
const sum = E.queueSummary([G({ home_id: 1, away_id: 1 }), G({ home_id: 2, away_id: 4, date: "2027-01-16" }), G({})], warnTeams);
eq([sum.games, sum.bad, sum.blank, sum.ready], [3, 1, 1, false], "summary counts");
ok(E.queueSummary([G({ home_id: 2, away_id: 4, date: "2027-01-16" })], warnTeams).ready, "clean queue is ready");
eq(E.queueSummary([], warnTeams).ready, false, "empty queue is not ready");
eq(E.queueSummary([], warnTeams).text, "Nothing queued yet", "empty text");
ok(E.queueSummary([G({ home_id: 2, away_id: 4, date: "2027-01-16" })], warnTeams).text.includes("all clear"), "all clear text");

console.log("6. print and batches");
const pp = E.printPayload([G({ home_id: "2", away_id: 4, arena: "R" })], { back: true });
const sent = JSON.parse(pp.matchups); ok(!("uid" in sent[0]), "client id is not sent"); eq(sent[0].home_id, 2, "ids are numbers");
eq(JSON.parse(pp.options), { font: "normal", back: true, cover: false, spares: 0, order: "queue" }, "options filled with defaults");
eq(E.savePayload("  Sat  ", [G({ home_id: 1, away_id: 2 })], {}).name, "Sat", "name trimmed");
const lb = E.loadBatch({ matchups: [{ home_id: 1, away_id: 2 }, { home_id: 77, away_id: 2 }, { home_id: 0, away_id: 0 }] }, teams);
eq([lb.games.length, lb.dropped], [2, 1], "saved games with deleted teams are dropped and counted");
ok(lb.games.every((g) => g.uid), "loaded games get fresh ids");
eq(E.gameLabel({ home_id: 1, away_id: 0 }, teams), "Team Ann vs Blank", "label");
eq(E.gameLabel({ home_id: 99, away_id: 1 }, teams), "(removed team) vs Team Ann", "label for a removed team");
const unsorted = [G({ home_id: 1, date: "2027-01-17", game_time: "09:00", arena: "B" }), G({ home_id: 2, date: "2027-01-16", game_time: "20:00", arena: "A" }), G({ home_id: 3 }), G({ home_id: 4, date: "2027-01-16", game_time: "20:00", arena: "A" })];
eq(E.sortGames(unsorted, "time").map((g) => g.home_id), [2, 4, 1, 3], "time order is stable, unscheduled last (same as the server)");
eq(E.sortGames(unsorted, "queue").map((g) => g.home_id), [1, 2, 3, 4], "queue order untouched");
eq(unsorted.map((g) => g.home_id), [1, 2, 3, 4], "sorting does not change the original");
eq(E.sheetCount([G({}), G({})], { back: true, cover: true, spares: 2 }), { sheets: 4, pages: 9 }, "pages: 4 sheets two-sided plus a cover");
eq(E.sheetCount([], { cover: true }), { sheets: 0, pages: 0 }, "no cover page for nothing");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
