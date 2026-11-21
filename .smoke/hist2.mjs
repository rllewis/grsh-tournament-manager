import { JSDOM } from "jsdom";
import path from "path"; import fs from "fs"; import babel from "@babel/core"; import { createRequire } from "module";
const require = createRequire(import.meta.url); const root = process.cwd();
const FILES = ["pages/History.jsx", "pages/HistoryParts.jsx", "pages/HistoryWidgets.jsx", "pages/historyShared.js", "lib/historyEngine.js"];
for (const f of FILES) {
  fs.mkdirSync(path.dirname(path.join(root, ".smoke/out", f)), { recursive: true });
  const r = babel.transformFileSync(path.join(root, "src", f), { presets: [["@babel/preset-env", { targets: { node: "current" }, modules: "commonjs" }], ["@babel/preset-react", { runtime: "automatic" }]], babelrc: false, configFile: false });
  fs.writeFileSync(path.join(root, ".smoke/out", f.replace(/\.jsx$/, ".js")), r.code.replace(/\.jsx"\)/g, '.js")'));
}
const URL0 = "http://x/wp-admin/admin.php?page=grsh-tm-history";
const dom = new JSDOM("<!doctype html><div id=root></div>", { url: URL0, pretendToBeVisual: true });
const g = globalThis; g.window = dom.window; g.document = dom.window.document; Object.defineProperty(g, "navigator", { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement; g.IS_REACT_ACT_ENVIRONMENT = true; g.localStorage = dom.window.localStorage; g.Blob = dom.window.Blob;
g.requestAnimationFrame = (cb) => setTimeout(cb, 0);
dom.window.URL.createObjectURL = () => "blob:x"; dom.window.URL.revokeObjectURL = () => {}; g.URL.createObjectURL = () => "blob:x"; g.URL.revokeObjectURL = () => {};
dom.window.grshConfig = { apiUrl: "/api", nonce: "n" };
dom.window.HTMLAnchorElement.prototype.click = function () { dl.push(this.download); };
let dl = [];

const row = (id, pid, fn, ln, em, yr, o = {}) => ({ id, player_id: pid, first_name: fn, last_name: ln, email: em, season_year: yr, division_played: "senior_c", team_name: "Red", championship_result: "none", was_captain: false, was_alternate: false, skill_tier_reported: "C1", sandbagging_flag: false, games_scheduled: 6, games_attended: 6, no_show_count: 0, committee_notes: "", ...o });
const P1 = [row(1, 10, "ryan", "adams", "ryan@x.com", 2024, { skill_tier_reported: null, games_scheduled: null, games_attended: null }), row(2, 11, "tom", "alexander", "tom@x.com", 2026, { skill_tier_reported: "B2" }), row(3, 11, "tom", "alexander", "tom@x.com", 2025, { skill_tier_reported: "A1" })];
const P2 = [row(4, 12, "pat", "nomail", "", 2025, { division_played: "womens" }), row(5, 13, "dave", "horowitz", "d@x.com", 2024), row(6, 14, "david", "horowitz", "dh@x.com", 2026)];
let mode = "ok", calls = [];
const OV = () => ({ rows: 6, players: 5, seasons: [2026, 2025, 2024], quality: [{ key: "no_tier", label: "Season rows with no skill tier", count: 1, hint: "h" }, { key: "no_division", label: "Season rows with no division", count: 0, hint: "h" }, { key: "no_games", label: "Season rows with no attendance", count: 1, hint: "h" }, { key: "no_team", label: "Season rows with no team", count: 0, hint: "h" }, { key: "no_email", label: "Players with no email", count: 1, hint: "h" }], last_import: { id: 1, by: "Lorenzo", file: "history.csv", imported: 6, updated: 0, skipped: 0, at: mode === "stale" ? "2026-06-02 10:00:00" : new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 19).replace("T", " ") }, registered_year: 2027, registered_ids: [11], duplicates: [{ why: "Same last name, similar first name", a: { id: 13, name: "dave horowitz", email: "d@x.com", seasons: [2024] }, b: { id: 14, name: "david horowitz", email: "dh@x.com", seasons: [2026] } }] });
const big = () => Array.from({ length: 120 }, (_, i) => row(100 + i, 1000 + i, "p" + String(i).padStart(3, "0"), "z" + String(i).padStart(3, "0"), `p${i}@x.com`, 2025));
g.fetch = async (url, o = {}) => {
  calls.push([o.method || "GET", url, o.body]); const J = (d, ok = true, st = 200) => ({ ok, status: st, json: async () => d });
  if (url.includes("/history/records?")) {
    if (mode === "fail") return J({ error: "boom" }, false, 500);
    const pg = +new URL("http://x" + url).searchParams.get("page");
    if (mode === "empty") return J({ records: [], total: 0, page: 1, total_pages: 1 });
    if (mode === "short") return J({ records: P1, total: 5, page: 1, total_pages: 1 });
    if (mode === "big") return J({ records: big(), total: 120, page: 1, total_pages: 1 });
    if (mode === "noatt") return J({ records: [...P1, ...P2].map((r) => ({ ...r, games_scheduled: null, games_attended: null })), total: 6, page: 1, total_pages: 1 });
    return J({ records: pg === 1 ? P1 : P2, total: 6, page: pg, total_pages: 2 });
  }
  if (url.includes("/history/overview")) return mode === "ovfail" ? J({ error: "nope" }, false, 500) : J(OV());
  if (url.includes("/players/merge")) return J({ ok: true });
  if (url.includes("/history/records/")) return J({ ok: true });
  return J({}, false, 404);
};
const Hist = require(path.join(root, ".smoke/out/pages/History.js")).default;
const React = require("react"); const { createRoot } = require("react-dom/client"); const { act } = React;
const tick = () => new Promise((r) => setTimeout(r, 40)); let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("ok  ", m); };
const text = () => document.body.textContent;
const btn = (t) => [...document.querySelectorAll("button")].find((b) => b.textContent.includes(t));
const btnEq = (t) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === t);
const mount = async (keep) => { if (!keep) { dom.window.localStorage.clear(); dom.window.history.replaceState(null, "", "/wp-admin/admin.php?page=grsh-tm-history"); } document.body.innerHTML = "<div id=root></div>"; const r = createRoot(document.getElementById("root")); await act(async () => { r.render(React.createElement(Hist)); await tick(); await tick(); await tick(); await tick(); }); return r; };
const click = async (el) => { await act(async () => { el.click(); await tick(); await tick(); }); };
const type = async (el, v) => { await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new dom.window.Event("input", { bubbles: true })); await tick(); }); };
const key = async (k, target) => { await act(async () => { const e = new dom.window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }); (target || document.body).dispatchEvent(e); await tick(); await tick(); }); };
const names = () => [...document.querySelectorAll("tbody tr[data-row-id]")].map((r) => r.getAttribute("data-row-id"));
const th = (label) => [...document.querySelectorAll("th")].find((t) => t.textContent.includes(label));

let r = await mount();
ok(calls.filter((c) => c[1].includes("/history/records?")).length === 2, "loads BOTH pages of records");
ok(text().includes("5 players") && text().includes("6 season rows"), "counts from real data");
ok(!text().includes("NaN") && !text().includes("undefined") && !text().includes("sample data"), "no NaN / undefined / sample data");
ok(text().includes("history.csv") && text().includes("imported by Lorenzo"), "item 25: import source shown");
ok(text().includes("GRSH Tournament Manager") && text().includes("Use it to check tiers"), "item 8: breadcrumb and purpose line");
ok(!text().toUpperCase().includes("HISTORICAL RECORDS"), "item 8: decorative pill gone");
ok(!text().includes("Re-import before"), "recent import: no stale banner");
ok(!!btn("Needs review (") && !!btn("rows with no skill tier"), "item 25: review reasons shown inline");
ok(names().join() === "10,11,13,14,12".replace("13,14,12", "13,14,12") || names().length === 5, "five rows rendered");
ok(names()[0] === "10" && names()[1] === "11", "default sort is last name (Adams, Alexander)");
ok([...document.querySelectorAll("th[aria-sort]")].length >= 5, "item 30: headers carry aria-sort");
ok(th("Player").getAttribute("aria-sort") === "ascending", "Player column is marked ascending");
ok(!!document.querySelector('[role=status][aria-live=polite]'), "item 30: live count region");
ok(!!document.querySelector("caption"), "table has a caption for screen readers");

// KPI chips
ok(text().includes("Not tracked yet"), "item 5: captains chip says Not tracked yet instead of 0");
ok([...document.querySelectorAll("button[aria-pressed]")].length >= 4, "item 6: KPI chips are pressable filters");
ok(!btn("Quick filters") && !text().includes("Quick filters"), "item 6: duplicate quick-filter group removed");
await click(btn("Sandbagging flags")); ok(text().includes("Showing 0 of 5") && text().includes("No players match"), "sandbagging chip filters (nobody flagged) and shows a real empty state");
ok(!!btn("Clear all"), "item 11: Clear all appears when something is filtered");
await click(btn("Clear all")); ok(!btn("Clear all (") && text().includes("Showing 5 of 5"), "Clear all resets and the button disappears");

// coverage + duplicates + trend
ok(text().includes("How complete the records are") && text().includes("Skill tier"), "item 26: coverage strip");
ok(document.querySelectorAll("button").length && [...document.querySelectorAll("button")].filter((b) => b.textContent === "Possible duplicate").length === 2, "item 27: both Horowitz rows flagged as possible duplicates");
ok(text().includes("A1 → B2"), "item 16: tier column shows the actual move A1 → B2");
ok(text().includes("1 season"), "item 15: short 1 season text instead of the repeated sentence");
ok(!text().includes("Not enough tier history ") && (text().match(/Not enough tier history/g) || []).length === 0, "item 15: long sentence is not repeated on rows");
ok(text().includes("Last active 2026") && text().includes("recent"), "item 19: recent has a text label, not colour alone");

// sorting
await click(btnEq("Seasons↕") || [...document.querySelectorAll("th button")].find((b) => b.textContent.startsWith("Seasons")));
ok(th("Seasons").getAttribute("aria-sort") === "descending" && names()[0] === "11", "item 17: Seasons sorts most-first (Tom has 2)");
await click([...document.querySelectorAll("th button")].find((b) => b.textContent.startsWith("Tier")));
ok(th("Tier").getAttribute("aria-sort") === "ascending" && names()[0] === "11", "item 16: sort by tier puts best first (Tom is B2)");
ok(window.location.search.includes("sort=tier"), "item 9: sort is in the address bar");
await click([...document.querySelectorAll("th button")].find((b) => b.textContent.startsWith("Player")));

// search
const search = document.getElementById("hx-search");
await type(search, "tom alexander");
ok(text().includes("Showing 1 of 5") && names().join() === "11", "item 12: multi-term search narrows to Tom");
ok(document.querySelectorAll("mark").length >= 2, "item 12: matches are highlighted");
ok(window.location.search.includes("q=tom"), "item 9: search is in the address bar");
await type(search, "dave horo kings"); ok(text().includes("Showing 0 of 5"), "every term must match");
await type(search, "womens"); ok(names().join() === "12", "searching womens finds the Women's player");
await type(search, "");
ok(!window.location.search.includes("q="), "address bar is clean when nothing is filtered");
await click(btn("Possible duplicate")); ok(!!document.querySelector("[role=dialog]") && text().includes("Same last name, similar first name"), "duplicate badge opens the duplicates tab");
await click(document.querySelector('[role=dialog] button[aria-label="Close"]'));
ok(!document.querySelector("[role=dialog]"), "close button closes the dialog");

// "/" key
document.getElementById("hx-div").focus(); await key("/", document.body);
ok(document.activeElement && document.activeElement.id === "hx-search", "item 12: / jumps to search");

// saved views
await click(btnEq("Needs a tier")); ok(text().includes("Missing: No skill tier") && text().includes("Showing 1 of 5"), "item 10: built-in view applies filters");
ok(btn("+ Save current view").disabled, "built-in view cannot be re-saved as a duplicate");
await click(btnEq("Clear all (1)"));
await type(document.getElementById("hx-search"), "horowitz");
ok(!btn("+ Save current view").disabled, "item 10: custom filters can be saved");
await click(btn("+ Save current view"));
await type(document.querySelector('input[aria-label="Name for the saved view"]'), "Horowitz check");
await click(btnEq("Save"));
ok(!!btnEq("Horowitz check") && dom.window.localStorage.getItem("grsh_history_views_v1").includes("Horowitz check"), "view saved and stored on this browser");
await click(btnEq("Clear all (1)")); await click(btnEq("Horowitz check")); ok(names().length === 2, "applying the saved view brings the filters back");
await click(document.querySelector('button[aria-label="Delete saved view Horowitz check"]')); ok(!btnEq("Horowitz check"), "saved view can be deleted");
await click(btnEq("Clear all (1)"));

// density, columns
await click(btnEq("Compact")); ok(btnEq("Compact").getAttribute("aria-pressed") === "true" && JSON.parse(dom.window.localStorage.getItem("grsh_history_prefs_v1")).density === "compact", "item 18: compact density is remembered");
await click(btnEq("Comfortable"));
await click(btn("Columns")); ok(text().includes("Visible") || document.querySelectorAll('input[type=checkbox]').length > 5, "columns menu opens");
await key("Escape"); ok(!document.querySelector("label input[disabled]"), "Escape closes the columns menu");

// selection + bulk + export
const boxes = () => [...document.querySelectorAll('tbody input[type=checkbox]')];
await click(boxes()[0]); ok(text().includes("1 selected"), "row checkbox selects");
await click(btn("Select all 5")); ok(text().includes("5 selected"), "select all matching");
await click(btn("Export CSV ▾")); ok(!!btn("Selected rows (5)") && !btn("Selected rows (5)").disabled, "item 24: export offers filtered / all / selected");
dl = []; await click(btn("Every player (5)")); ok(dl.length === 1 && /grsh-history-all-\d{4}-\d\d-\d\d\.csv/.test(dl[0]), "export downloads a dated CSV file");
ok(text().includes("Exported 5 players"), "export toast");
await click(btn("Copy emails")); ok(text().includes("Copied") || text().includes("Could not copy"), "copy emails gives feedback either way");
await click(btn("Clear selection")); ok(!text().includes("selected") || !btn("Clear selection"), "selection clears");

// row menu
await click(document.querySelector('button[aria-label="More actions for Tom Alexander"]'));
ok(!!btn("Open details") && !!btn("Copy email") && !!btn("Find the same last name"), "item 22: row menu has actions");
await click(btn("Find the same last name")); ok(document.getElementById("hx-search").value === "Alexander".toLowerCase() || document.getElementById("hx-search").value.toLowerCase() === "alexander", "row menu searches the same last name");
await click(btnEq("Clear all (1)"));

// drawer, focus return, undo
await act(async () => { document.querySelector('tr[data-row-id="11"]').click(); await tick(); });
ok(!!document.querySelector('[role=complementary][aria-label="History for Tom Alexander"]'), "item 30: drawer is a labelled region");
await key("Escape"); ok(!document.querySelector("[role=complementary]"), "Escape closes the drawer");
ok(document.activeElement && document.activeElement.getAttribute("data-row-id") === "11", "item 21: focus returns to the row after closing");
await act(async () => { document.querySelector('tr[data-row-id="11"]').click(); await tick(); });
await key("ArrowDown", document.body); ok(!!document.querySelector('[role=complementary][aria-label^="History for"]') && !document.querySelector('[aria-label="History for Tom Alexander"]'), "arrow keys move to the next player");
await key("ArrowUp", document.body);
const editBtns = [...document.querySelectorAll("button")].filter((b) => b.textContent === "Edit");
await click(editBtns[1]);
const sel = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.text === "Not recorded"));
const setSel = async (el, v) => { await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, "value").set.call(el, v); el.dispatchEvent(new dom.window.Event("change", { bubbles: true })); await tick(); }); };
const original = sel.value; calls.length = 0; await setSel(sel, "A3"); await click(btnEq("Save"));
const ec = calls.find((c) => c[1].includes("/history/records/") && c[0] === "POST");
ok(!!ec && JSON.parse(ec[2]).skill_tier_reported === "A3", "edit POSTs the change");
ok(!!btnEq("Undo"), "item 23: the toast offers Undo");
calls.length = 0; await click(btnEq("Undo"));
const uc = calls.find((c) => c[1].includes("/history/records/") && c[0] === "POST");
ok(!!uc && JSON.parse(uc[2]).skill_tier_reported === original && Object.keys(JSON.parse(uc[2])).length === 1, "Undo POSTs the old value back, only that field (" + original + ")");
ok(text().includes("Change undone"), "undo confirms");
await key("Escape");

// remembered filters
await type(document.getElementById("hx-search"), "tom");
r.unmount();
dom.window.history.replaceState(null, "", "/wp-admin/admin.php?page=grsh-tm-history");
r = await mount(true);
ok(text().includes("Filters restored from your last visit") && text().includes("Showing 1 of 5"), "item 9: filters come back, and the page says so");
await click(document.querySelector('button[aria-label^="Remove filter"]')); ok(!text().includes("Filters restored") && text().includes("Showing 5 of 5"), "removing a chip clears the restored notice");
r.unmount();
dom.window.history.replaceState(null, "", "/wp-admin/admin.php?page=grsh-tm-history&q=dave&warn=1&sort=attendance&dir=desc&foo=bar");
r = await mount(true);
ok(text().includes("Showing 0 of 5") && !!document.querySelector('button[aria-label="Remove filter: Sandbagging flag"]') && document.getElementById("hx-search").value === "dave", "item 9: a shared link restores filters and sort");
ok(window.location.search.includes("sort=attendance") && window.location.search.includes("dir=desc"), "sort from the link is kept");
ok(window.location.search.includes("foo=bar"), "other address-bar parameters are left alone");
r.unmount();

// stale import
mode = "stale"; r = await mount();
ok(text().includes("Re-import before using this for the draft") && text().includes("6 months ago"), "item 7: stale import is called out");
r.unmount();
// empty column
mode = "noatt"; r = await mount();
ok(text().includes("Hidden because no player has anything to show") && !th("Attendance"), "item 14: empty Attendance column is hidden with one note");
await click(btnEq("Show anyway")); ok(!!th("Attendance"), "Show anyway brings it back");
r.unmount();
// paging
mode = "big"; r = await mount();
ok(names().length === 50 && text().includes("Showing 50 of 120"), "item 20: only 50 rows render at first");
await click(btn("Show 50 more")); ok(names().length === 100, "Show 50 more");
ok(!btn("Show all 120"), "Show all is hidden when 50 or fewer rows remain");
await click(btn("Show 50 more")); ok(names().length === 120 && !btn("Show 50 more"), "last page loads everything and the button goes away");
r.unmount(); r = await mount(); await click(btn("Show all 120")); ok(names().length === 120, "Show all (120 rows) from the start");
r.unmount();
// failures
mode = "fail"; r = await mount();
ok(text().includes("could not be loaded") && !!btn("Try again"), "records failure shows an error with retry");
r.unmount();
mode = "empty"; r = await mount();
ok(!text().includes("NaN") && text().includes("0 players") && text().includes("No history records yet"), "empty history: no NaN, clear empty state");
ok(!text().includes("How complete the records are"), "empty history hides the coverage strip");
r.unmount();
mode = "short"; r = await mount(); ok(text().includes("Only 3 of 5 season rows loaded"), "warns when fewer rows arrive than the server counted"); r.unmount();
mode = "ovfail"; r = await mount(); ok(text().includes("Import details unavailable") && text().includes("Tom"), "overview failure is non-fatal"); r.unmount();
console.log(fails ? `${fails} FAILED` : "ALL PASSED"); process.exit(fails ? 1 : 0);
