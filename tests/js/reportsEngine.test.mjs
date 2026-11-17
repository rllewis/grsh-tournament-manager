import * as R from "./.build/reportsEngine.mjs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  FAIL:", m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

console.log("numbers and money");
eq(R.num(null), null, "null"); eq(R.num(undefined), null, "undefined"); eq(R.num(""), null, "empty"); eq(R.num("12.5"), 12.5, "string number"); eq(R.num(NaN), null, "NaN"); eq(R.num(false), null, "boolean");
eq(R.money(null), "—", "unknown money is a dash, not $0"); eq(R.money(undefined), "—", "undefined money"); eq(R.money(0), "$0", "a real zero is $0"); eq(R.money(1400), "$1,400", "thousands"); eq(R.money(150.5), "$150.50", "cents kept when present"); eq(R.money("200"), "$200", "numeric string");
eq(R.pctText(null), "—", "pct null"); eq(R.pctText(0), "0%", "pct zero is real"); eq(R.pctText(96.4), "96%", "pct rounds");
eq(R.delta(3), "+3", "plus"); eq(R.delta(-2), "−2", "minus uses a real minus sign"); eq(R.delta(0), "no change", "zero"); eq(R.delta(null), null, "unknown change is null"); eq(R.delta(1.234), "+1.23", "decimals trimmed");

console.log("time");
const now = Date.parse("2026-11-17T12:00:00Z");
eq(R.ago("2026-11-17T11:59:50Z", now), "just now", "10s"); eq(R.ago("2026-11-17T11:50:00Z", now), "10 min ago", "10 min"); eq(R.ago("2026-11-17T10:00:00Z", now), "2 hours ago", "2h"); eq(R.ago("2026-11-16 12:00:00", now), "1 day ago", "SQL date is read as UTC");
eq(R.ago("garbage", now), "", "garbage"); eq(R.ago(null, now), "", "null"); eq(R.ago("2026-11-17T13:00:00Z", now), "just now", "future clamps");
eq(R.ageMinutes("2026-11-17T11:00:00Z", now), 60, "60 minutes"); eq(R.ageMinutes("nope", now), null, "bad iso");

console.log("parity bands follow the server thresholds");
eq(R.parityBand(72).key, "balanced", "72 balanced"); eq(R.parityBand(65).key, "balanced", "65 edge balanced"); eq(R.parityBand(80).key, "balanced", "80 edge balanced"); eq(R.parityBand(64.9).key, "review", "64.9 review"); eq(R.parityBand(81).key, "review", "81 review");
eq(R.parityBand(59.9).key, "rebalance", "59.9 rebalance"); eq(R.parityBand(85.1).key, "rebalance", "85.1 rebalance"); eq(R.parityBand(null).key, "unknown", "null unknown"); eq(R.parityBand("x").key, "unknown", "junk unknown");
eq(R.parityBand(70, { rebalance_below: 75, rebalance_above: 90, review_below: 80, review_above: 88 }).key, "rebalance", "custom bands respected");
const t = R.sortTeams([{ name: "B", parity_score: 72 }, { name: "A", parity_score: 55 }, { name: "C", parity_score: null }, { name: "D", parity_score: 63 }]);
eq(t.map((x) => x.name), ["A", "D", "C", "B"], "rebalance, review, not-calculated, balanced"); eq(R.sortTeams(null), [], "null list"); 

console.log("fill state");
eq(R.fillState(10, 21, 36).state, "short", "below minimum"); eq(R.fillState(10, 21, 36).short, 11, "short by 11"); eq(R.fillState(24, 21, 36).state, "ok", "between"); eq(R.fillState(36, 21, 36).state, "full", "at capacity"); eq(R.fillState(40, 21, 36).state, "over", "over");
eq(R.fillState(5, 0, 0).state, "unknown", "no config"); eq(R.fillState(undefined, 21, 36).short, 21, "undefined registered is 0");

console.log("sparkline and filters");
const bars = R.dayBars({ "2026-11-17": 3, "2026-11-15": 2 }, 5, new Date(2026, 10, 17));
eq(bars.length, 5, "5 days"); eq(bars.map((b) => b.n), [0, 0, 2, 0, 3], "zeros filled, today last"); eq(R.dayBars(null, 3, new Date(2026, 10, 17)).map((b) => b.n), [0, 0, 0], "null input");
ok(R.matchName("Pat Lee", "lee") && R.matchName("Pat Lee", "") && !R.matchName("Pat Lee", "zed") && !R.matchName(null, "x"), "name match");
eq(R.safeFilename("grsh-players-2027-11-17.csv"), "grsh-players-2027-11-17.csv", "normal name kept"); eq(R.safeFilename("../../etc/passwd"), ".._.._etc_passwd", "path tricks neutralised"); eq(R.safeFilename(""), "report.csv", "empty falls back");
ok(R.VERDICT.blocked && R.VERDICT.ready && R.VERDICT.attention && R.VERDICT.empty && R.SEVERITY.high && R.SEVERITY.medium && R.SEVERITY.low, "style tables complete");
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
