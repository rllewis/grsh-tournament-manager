import { JSDOM } from "jsdom";
import path from "path"; import fs from "fs"; import babel from "@babel/core"; import { createRequire } from "module";
const require = createRequire(import.meta.url); const root = process.cwd();
for (const f of ["pages/Settings.jsx", "lib/settingsEngine.js"]) {
  fs.mkdirSync(path.dirname(path.join(root, ".smoke/out", f)), { recursive: true });
  const r = babel.transformFileSync(path.join(root, "src", f), { presets: [["@babel/preset-env", { targets: { node: "current" }, modules: "commonjs" }], ["@babel/preset-react", { runtime: "automatic" }]], babelrc: false, configFile: false });
  fs.writeFileSync(path.join(root, ".smoke/out", f.replace(/\.jsx$/, ".js")), r.code);
}
const dom = new JSDOM("<!doctype html><div id=root></div>", { url: "http://x/wp-admin/admin.php?page=grsh-tm-settings", pretendToBeVisual: true });
const g = globalThis; g.window = dom.window; g.document = dom.window.document; Object.defineProperty(g, "navigator", { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement; g.IS_REACT_ACT_ENVIRONMENT = true; g.localStorage = dom.window.localStorage; g.FileReader = dom.window.FileReader; g.File = dom.window.File;
dom.window.grshConfig = { apiUrl: "/api", nonce: "n" }; dom.window.confirm = () => true;
const blobs = []; dom.window.URL.createObjectURL = (b) => { blobs.push(b); return "blob:x"; }; dom.window.URL.revokeObjectURL = () => {}; g.URL = dom.window.URL; g.Blob = dom.window.Blob;
const clicks = []; dom.window.HTMLAnchorElement.prototype.click = function () { clicks.push(this.download); };

const D = (key, label, n = {}) => ({ key, label, enabled: true, teams: 4, min_roster: 8, max_roster: 12, goalie_min: 1, goalie_max: 2, ...n });
let S, mode = { load: "ok", post: "ok" }, calls = [], saveSeq = 0;
const fresh = () => ({ season_year: 2027, season_label: "Gold Rush 2027", form_id: 5047, status: "open", registration_opens: "2026-11-16", registration_closes: "2027-02-28", draft_date: "2027-03-15",
  timer_enabled: true, timer_seconds: 90, draft_type: "snake", draft_order: "random", divisions: [D("gold_open", "Gold Open"), D("45a", "45A", { teams: 3, min_roster: 7, max_roster: 11 })],
  email_registration: true, email_roster: true, email_payment: true, email_alternate: true, email_team_balance: true, email_team_deposit_nudge: true, sender_name: "", sender_email: "", player_fee: null,
  team_deposit_amount: 500, team_fee_early_amount: 1750, team_fee_late_amount: 2000, team_fee_early_cutoff_date: "2027-01-06", team_balance_due_date: "2027-03-08", team_deposit_nudge_days: 10, team_balance_reminder_days: 14,
  public_rosters: false, sandbagging_auto_flag: true, _last_saved_at: "2026-11-16 09:30:00" });
S = fresh();
const OV = () => ({ settings: S, meta: { saved_at: S._last_saved_at, saved_by: "Lorenzo" }, today: "2026-11-17", locked_year: 2027,
  wiring: { timer_enabled: { state: "not_connected", used_by: "" }, draft_type: { state: "not_connected", used_by: "" }, draft_order: { state: "not_connected", used_by: "" }, public_rosters: { state: "not_connected", used_by: "" }, email_registration: { state: "not_connected", used_by: "" }, timer_seconds: { state: "active", used_by: "Draft page default clock" }, player_fee: { state: "active", used_by: "Reports" }, team_fee_late_amount: { state: "active", used_by: "Team fee tiers" }, sender_email: { state: "active", used_by: "Reminders" }, sandbagging_auto_flag: { state: "not_connected", used_by: "" } },
  registered: { gold_open: { registered: 24, goalies: 3, teams: 4, no_captain: 0 }, "45a": { registered: 2, goalies: 0, teams: 0, no_captain: 0 } },
  readiness: { setup: [], open: [{ level: "ok", text: "Registration dates are set." }], draft: [{ level: "warn", text: "Gold Open: 24 registered, 32 needed for 4 teams." }], locked: [{ level: "warn", text: "2 registered players are not on a roster yet." }], complete: [{ level: "ok", text: "fine" }] },
  health: [{ level: "warn", text: "No player fee is set.", tab: "fees" }, { level: "ok", text: "Registration dates are in order." }],
  forms: { available: true, forms: [{ id: 5047, title: "Gold Rush 2027 Registration", entries: 26 }, { id: 4000, title: "Old Form", entries: 3 }] },
  mail: { smtp: true, to: "admin@x.com", site_domain: "grsht.com" },
  history: [{ id: "abc12345", at: "2026-11-15 10:00:00", by: "Lorenzo", note: "Saved", count: 2, changes: [{ key: "status", from: "setup", to: "open" }, { key: "divisions.45a.teams", from: 2, to: 3 }] }] });
const J = (o, s = 200) => ({ ok: s < 400, status: s, json: async () => o });
g.fetch = async (url, o = {}) => {
  const m = o.method || "GET"; calls.push([m, url, o.body ? JSON.parse(o.body) : null]);
  if (url.endsWith("/settings/overview")) { if (mode.load === "fail") return J({ message: "boom" }, 500); return J(OV()); }
  if (url.endsWith("/settings/test-email")) return J({ sent: true, to: "admin@x.com", from: "", smtp: true });
  if (url.endsWith("/settings/restore")) { S = { ...S, status: "setup", _last_saved_at: "2026-11-17 15:00:00" }; return J({ saved: true, settings: S, changes: [{}] }); }
  if (url.endsWith("/settings") && m === "POST") {
    const b = JSON.parse(o.body);
    if (mode.post === "422") return J({ error: "Fix 1 problem before saving.", errors: { sender_email: "Server says that address is blocked." } }, 422);
    if (mode.post === "409") return J({ error: "These settings changed while you were editing (saved by Sam at 2026-11-17 14:00:00).", conflict: true }, 409);
    const keys = Object.keys(b).filter((k) => k !== "base_saved_at" && k !== "force" && k !== "divisions" && JSON.stringify(b[k]) !== JSON.stringify(S[k]) && !(b[k] === null && S[k] === null));
    S = { ...S, ...b, _last_saved_at: "2026-11-17 14:" + String(20 + ++saveSeq).padStart(2, "0") + ":00" }; delete S.base_saved_at; delete S.force;
    return J({ saved: true, changes: keys.map((k) => ({ key: k })), settings: S, meta: { saved_at: S._last_saved_at, saved_by: "Lorenzo" }, history: OV().history });
  }
  return J({}, 404);
};
const Set = require(path.join(root, ".smoke/out/pages/Settings.js")).default;
const React = (await import(path.join(root, "node_modules/react/index.js"))).default; const { createRoot } = await import(path.join(root, "node_modules/react-dom/client.js")); const { act } = React;
const tick = () => new Promise((r) => setTimeout(r, 30)); let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("ok  ", m); };
const rootEl = createRoot(document.getElementById("root"));
const text = () => document.body.textContent; const $ = (s) => document.querySelector(s);
const btn = (t) => [...document.querySelectorAll("button")].find((b) => b.textContent.includes(t));
const run = async (fn) => { await act(async () => { await fn(); await tick(); await tick(); }); };
const setVal = (el, v) => { const proto = el.tagName === "SELECT" ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new dom.window.Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); };
const tabTo = async (name) => run(async () => document.getElementById("gs-tab-" + name).click());
const posts = () => calls.filter((c) => c[0] === "POST" && c[1].endsWith("/settings"));

// A. load failure shows an error, never defaults
mode.load = "fail";
await run(async () => rootEl.render(React.createElement(Set)));
ok(text().includes("Settings could not be loaded") && text().includes("boom"), "load failure shows the reason");
ok(!$("#f-season_label") && !btn("Review") && !btn("Save settings"), "no form and no save button when load failed (defaults are never shown)");
mode.load = "ok"; await run(async () => btn("Try again").click());
ok(!!$("#f-season_label"), "retry loads the form");

// B. dates and timeline
ok(text().includes("Registration open") && text().includes("Closes in 103 days"), "timeline: open, 103 days (PDF said 102)");
ok(text().includes("Feb 28, 2027") && text().includes("Nov 16, 2026") && text().includes("Mar 15, 2027"), "timeline dates match the inputs (no off-by-one)");
ok($("#f-registration_closes").value === "2027-02-28", "date input value untouched");
ok(!!document.querySelector(".gs-bar .today"), "today marker drawn");
ok(text().includes("Last saved by Lorenzo on Nov 16, 2026 at 09:30"), "last saved by/at shown");
ok($("#f-season_year").readOnly && text().includes("Fixed at 2027"), "season year is read-only with the reason");
ok(document.querySelectorAll("#f-form_id option").length === 2 && text().includes("Gold Rush 2027 Registration · 26 entries"), "WPForms picker with entry counts");

// C. accessibility basics
ok(document.querySelectorAll("[role=tab]").length === 7 && $("[role=tablist]"), "7 ARIA tabs");
ok($("#sw-sandbagging_auto_flag").getAttribute("role") === "switch" && $("#sw-sandbagging_auto_flag").getAttribute("aria-checked") === "true", "toggle is a real switch with state");
ok(document.querySelector("label[for=f-season_label]"), "inputs have labels");
await run(async () => $("#gs-tab-season").dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
ok($("#gs-tab-divisions").getAttribute("aria-selected") === "true", "arrow key moves to the next tab");
await tabTo("season");

// D. not connected honesty
await tabTo("draft");
ok(document.querySelectorAll(".gs-wire.off").length >= 3, "draft tab flags not-connected settings");
ok(text().includes("Used by: Draft page default clock"), "connected setting says what uses it");
await tabTo("access"); ok(text().includes("Not connected yet"), "public rosters flagged"); await tabTo("season");

// E. edit -> review -> save
await run(async () => setVal($("#f-season_label"), "Gold Rush 2027 Reg"));
ok(text().includes("1 unsaved change"), "unsaved bar");
let ev = new dom.window.Event("beforeunload", { cancelable: true }); dom.window.dispatchEvent(ev); ok(ev.defaultPrevented, "leaving the page while dirty is blocked");
await run(async () => btn("Review & save").click());
ok($("[role=dialog]") && text().includes("Review 1 change") && text().includes("Season label"), "review dialog lists the change");
ok(text().includes("Gold Rush 2027") && text().includes("Gold Rush 2027 Reg"), "shows before and after");
await run(async () => { const b = btn("Save 1 change"); b.click(); b.click(); });
ok(posts().length === 1, "double click saves exactly once (" + posts().length + ")");
const body = posts()[0][2];
ok(body.base_saved_at === "2026-11-16 09:30:00", "sends the conflict token"); ok(body.form_id === 5047 && typeof body.form_id === "number", "numbers sent as numbers");
ok(!("_last_saved_at" in body) && !("_last_saved_by" in body), "private keys not sent");
ok(text().includes("Saved 1 change") && !text().includes("unsaved change"), "success banner, dirty cleared");
ok(text().includes("Nov 17, 2026 at 14:21") || text().includes("14:21"), "last saved updated");

// F. validation
await run(async () => setVal($("#f-registration_closes"), "2026-11-01"));
ok(text().includes("Registration closes before it opens."), "closes-before-opens error shown");
ok(btn("Review & save").disabled, "cannot save while invalid");
ok(document.querySelector("#gs-tab-season .gs-badge.bad"), "tab shows a red count");
ok($("#f-registration_closes").getAttribute("aria-invalid") === "true", "aria-invalid set");
await run(async () => btn("Discard changes").click());
ok($("#f-registration_closes").value === "2027-02-28" && !text().includes("unsaved"), "discard goes back to the last SAVED values");
await tabTo("draft"); await run(async () => setVal($("#f-timer_seconds"), "")); ok(text().includes("Timer must be 15 to 600 seconds."), "blank timer is an error, not NaN"); await run(async () => btn("Discard changes").click());

// G. server errors: 422
await tabTo("email"); await run(async () => setVal($("#f-sender_email"), "a@b.com"));
mode.post = "422"; await run(async () => btn("Review & save").click()); await run(async () => btn("Save 1 change").click());
ok(text().includes("Server says that address is blocked."), "server field error shown on its field");
ok($("#gs-tab-email").getAttribute("aria-selected") === "true", "jumped to the tab with the problem");
ok(!$("[role=dialog]"), "dialog closed"); ok(btn("Review & save").disabled, "save blocked until fixed");
await run(async () => setVal($("#f-sender_email"), "c@d.com")); ok(!text().includes("Server says that address is blocked."), "editing the field clears the server error");
// H. 409 conflict
mode.post = "409"; await run(async () => btn("Review & save").click()); await run(async () => btn("Save 1 change").click());
ok(text().includes("changed while you were editing") && btn("Overwrite with mine") && btn("Reload their version"), "conflict offers reload or overwrite");
mode.post = "ok"; const before = posts().length; await run(async () => btn("Overwrite with mine").click());
ok(posts().length === before + 1 && posts()[posts().length - 1][2].force === true, "overwrite sends force"); ok(text().includes("Saved"), "saved after overwrite");

// I. status stepper
await tabTo("season"); await run(async () => btn("Locked").click());
ok(text().includes("Move to “locked”?") && text().includes("2 registered players are not on a roster yet."), "checklist for the next status");
await run(async () => btn("Use “locked”").click()); ok(text().includes("Not saved yet."), "status change marked unsaved");
await run(async () => btn("Review & save").click());
ok(text().includes("Before moving to “locked”") && text().includes("not on a roster yet"), "review repeats the warnings");
ok(btn("Save 1 change").disabled, "irreversible status needs the checkbox"); await run(async () => $(".gs-ack input").click()); ok(!btn("Save 1 change").disabled, "checkbox unlocks save");
await run(async () => btn("Keep editing").click()); await run(async () => btn("Discard changes").click());

// J. disabling a division with players
await tabTo("divisions"); ok(text().includes("24 of 48") && text().includes("32 to run"), "capacity math: 24 of 48 spots, 32 to run");
await run(async () => $("[aria-label='Enable Gold Open']").click());
ok(text().includes("24 registered players will be hidden"), "inline warning when turning a division off");
await run(async () => btn("Review & save").click()); ok(text().includes("is being turned off but has 24 registered players"), "review warns too"); await run(async () => btn("Keep editing").click()); await run(async () => btn("Discard changes").click());
await run(async () => setVal($("#d1-teams"), "")); ok(text().includes("3 to") === false && !!$("#d1-teams-e"), "blank division number is an error"); await run(async () => btn("Discard changes").click());

// K. fees
await tabTo("fees"); await run(async () => setVal($("#f-feedate"), "2027-01-06"));
ok(/early fee/.test(text()) && text().includes("$1,750") && text().includes("$1,250") && text().includes("Last day for the early fee"), "fee example: on the cutoff day is early");
await run(async () => setVal($("#f-feedate"), "2027-01-07")); ok(/late fee/.test(text()) && text().includes("$2,000") && text().includes("would have saved $250"), "fee example: day after is late");
await run(async () => setVal($("#f-team_fee_early_amount"), "2500")); ok(text().includes("The late fee is lower than the early fee."), "early above late caught"); await run(async () => btn("Discard changes").click());
await run(async () => setVal($("#f-player_fee"), "185")); await run(async () => btn("Review & save").click()); ok(text().includes("Player fee") && text().includes("not set") && text().includes("$185"), "diff shows fee not set -> $185"); await run(async () => btn("Save 1 change").click());
ok(posts()[posts().length - 1][2].player_fee === 185, "fee posted as a number");

// L. email test
await tabTo("email"); await run(async () => btn("Send me a test email").click());
ok(calls.some((c) => c[1].endsWith("/settings/test-email")) && text().includes("Sent to admin@x.com"), "test email sent to the admin's own address");

// M. health + history + export/import
await tabTo("health"); ok(text().includes("No player fee is set.") && !!btn("Go there"), "health list with fix links");
await run(async () => btn("Restore this version").click()); ok(text().includes("Put these settings back"), "restore asks first");
await run(async () => btn("Yes, restore").click()); ok(calls.some((c) => c[1].endsWith("/settings/restore") && c[2].id === "abc12345"), "restore posted"); ok(text().includes("Restored that version."), "restore confirmed");
await run(async () => btn("Download settings (JSON)").click());
const readBlob = (b) => new Promise((res) => { const r = new dom.window.FileReader(); r.onload = () => res(String(r.result)); r.readAsText(b); });
const exp = JSON.parse(await readBlob(blobs[blobs.length - 1])); ok(exp.format === "grsh-settings" && exp.settings.divisions.length === 2 && clicks[clicks.length - 1] === "grsh-settings-2026-11-17.json", "export file");
ok(text().includes("Gold Rush 2028") && text().includes("Feb 28, 2028"), "next-season plan shifts dates one year");
const input = $("#gs-import"); const file = new dom.window.File([JSON.stringify({ format: "grsh-settings", settings: { status: "draft", evil: 1 } })], "s.json", { type: "application/json" });
Object.defineProperty(input, "files", { value: [file], configurable: true }); await run(async () => { input.dispatchEvent(new dom.window.Event("change", { bubbles: true })); await new Promise((r) => setTimeout(r, 80)); });
ok(text().includes("Loaded 1 settings from s.json") && text().includes("Ignored: evil"), "import loads known keys, ignores the rest"); ok(text().includes("1 unsaved change"), "imported values are unsaved until reviewed");
await run(async () => btn("Discard changes").click());
await run(async () => { const f2 = new dom.window.File(["{nope"], "bad.json"); Object.defineProperty(input, "files", { value: [f2], configurable: true }); input.dispatchEvent(new dom.window.Event("change", { bubbles: true })); await new Promise((r) => setTimeout(r, 80)); });
ok(text().includes("not valid JSON"), "bad import file refused");


// N. division format
await run(async () => btn("Discard changes") && btn("Discard changes").click());
await tabTo("divisions");
ok(!!document.querySelector('[role=radiogroup][aria-label="Gold Open format"]'), "format selector is on each division");
const seg = (div, name) => [...document.querySelectorAll(`[role=radiogroup][aria-label="${div} format"] button`)].find((b) => b.textContent === name);
ok(seg("Gold Open", "Both").getAttribute("aria-checked") === "true", "a division with no saved format shows Both (old behaviour)");
ok(text().includes("Season at a glance") && text().includes("Draft teams"), "what-if table shown");
ok(!!document.querySelector('button[aria-label="One more team in Gold Open"]'), "teams stepper");
await run(async () => seg("45A", "Registered teams").click());
ok(seg("45A", "Registered teams").getAttribute("aria-checked") === "true" && text().includes("1 unsaved change") || text().includes("unsaved change"), "picking a format marks the page unsaved");
ok(text().includes("Registered teams in") || text().includes("registered teams in"), "teams division shows registered-team tile");
await run(async () => seg("Gold Open", "Draft").click());
ok(!!document.querySelector(".gs-dot"), "tab shows an unsaved-changes dot");
await run(async () => btn("Review").click());
ok(text().includes("format") && text().includes("Registered teams"), "review lists the format change in plain words");
await run(async () => btn("Keep editing").click());
await run(async () => { mode.post = "ok"; btn("Review & save") && 0; });
await run(async () => btn("Discard changes").click());
// both: registered-team stepper
await run(async () => seg("Gold Open", "Both").click());
ok(!!document.querySelector('button[aria-label="One more registered team in Gold Open"]'), "Both shows the registered-team stepper");
await run(async () => document.querySelector('button[aria-label="One more registered team in Gold Open"]').click());
ok(text().includes("1 registered + 3 drafted"), "split shown as 1 registered + 3 drafted");
ok(text().includes("6 players") === false, "no stray text");
await run(async () => btn("Discard changes").click());
// toggle label + fees forecast
ok(text().includes("Enabled"), "division toggle says Enabled");
await tabTo("fees"); ok(text().includes("Revenue forecast") && text().includes("registered-team slots"), "fee forecast panel");

console.log(fails ? `\n${fails} FAILED` : "\nall smoke checks passed"); process.exit(fails ? 1 : 0);
