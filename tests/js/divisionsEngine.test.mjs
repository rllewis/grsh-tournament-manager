import * as E from "./.build/divisionsEngine.mjs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  FAIL:", m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

console.log("normalize");
const rows = [
  { key: "gold_open", label: "Gold Open", format: "both", teams: 4, draft_teams: 3, reg_teams: 1, max_roster: 12, capacity: 36 },
  { key: "45a", label: "45+ A", format: "draft", teams: 2, draft_teams: 2, reg_teams: 0, max_roster: 12, capacity: 24 },
  { key: "womens", label: "Women's", format: "teams", teams: 2, draft_teams: 0, reg_teams: 2, max_roster: 14, capacity: 0 },
  { key: "gold_open", label: "dup", format: "draft", capacity: 1 },
  { label: "no key" }, null,
];
const n = E.normalizeDivisions(rows);
eq(n.order, ["gold_open", "45a", "womens"], "order follows Settings, duplicates and keyless rows dropped");
eq(n.labels["45a"], "45+ A", "label comes from Settings");
eq(n.caps, { gold_open: 36, "45a": 24, womens: 0 }, "capacity comes from Settings (draft spots only)");
eq(E.normalizeDivisions([]), null, "empty list is not usable");
eq(E.normalizeDivisions(null), null, "non-array is not usable");
eq(E.normalizeDivisions({ error: "x" }), null, "error object is not usable");
eq(E.normalizeDivisions([{ key: "a", label: "A", format: "weird", capacity: "abc" }]).formats.a, "both", "unknown format reads as both");
eq(E.normalizeDivisions([{ key: "a", capacity: -5 }]).caps.a, 0, "negative capacity clamps to 0");
eq(E.normalizeDivisions([{ key: "a" }]).labels.a, "a", "missing label falls back to the key");

console.log("apply in place");
const order = ["x", "y"], labels = { x: "X" }, caps = { x: 1 }, formats = {}, info = {};
const target = { order, labels, caps, formats, info };
ok(E.applyDivisions(n, target) === true, "applies");
ok(target.order === order && order.length === 3 && order[0] === "gold_open", "same array object, new contents");
ok(target.labels === labels && !("x" in labels) && labels.womens === "Women's", "old keys removed, new keys in");
ok(E.applyDivisions(null, target) === false && order.length === 3, "null leaves the page's fallback alone");

console.log("capacity view");
const d = n;
let v = E.capacityView(10, "gold_open", d);
eq([v.kind, v.text, v.pct, v.over], ["draft", "10/36", 28, false], "draft card");
ok(v.title.includes("3 draft teams × 12") && v.title.includes("1 registered team"), "tooltip explains the math and the registered slot");
v = E.capacityView(40, "gold_open", d); ok(v.over && v.pct === 100, "over capacity flagged, bar capped at 100");
v = E.capacityView(3, "womens", d); eq([v.kind, v.text, v.pct], ["teams", "3 · teams only", 0], "teams-only division has no draft bar");
v = E.capacityView(0, "45a", d); eq(v.text, "0/24", "zero registered still shows the spots");
v = E.capacityView(2, "nope", d); eq(v.kind, "none", "unknown division does not invent a number");
eq(E.capacityView(1, "a", E.normalizeDivisions([{ key: "a", label: "A", format: "draft", capacity: 0 }])).kind, "none", "a draft division with no spots says so");

console.log("off-list registrants");
eq(E.offListCount([{ division_requested: "senior_c" }, { division_requested: "45a" }, { division_requested: null }, {}], n.order), 1, "counts only players asking for a switched-off division");
eq(E.offListCount(null, []), 0, "null safe");

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
