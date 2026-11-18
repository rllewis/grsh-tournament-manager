// Captain Sync — pure logic (no DOM, no fetch), so it can be tested on its own.
import { toCSV, plural } from "./importEngine";

export const STAGES = [
  { key: "invited", label: "Invited", help: "Team exists, captain has not logged in yet." },
  { key: "active", label: "Logged in", help: "Captain has set a password and can sign in." },
  { key: "roster", label: "Roster started", help: "At least one player is on the roster." },
  { key: "deposit", label: "Deposit paid", help: "The deposit is recorded on the team." },
  { key: "paid", label: "Paid in full", help: "Nothing left to pay." },
];
const ORDER = STAGES.map((s) => s.key);
export const stageIndex = (k) => Math.max(0, ORDER.indexOf(k));

// How many teams have reached each step (a team that paid has also logged in, started a roster... so counts are cumulative
// from the stage the team is at, not from separate flags).
export function funnelSteps(teams) {
  const total = (teams || []).length;
  return STAGES.map((s, i) => {
    const n = (teams || []).filter((t) => stageIndex(t.stage) >= i).length;
    return { key: s.key, label: s.label, help: s.help, n, pct: total ? Math.round((n / total) * 100) : 0 };
  });
}

export const ENTRY_STATES = {
  needs_recording: { label: "Not recorded", tone: "bad", help: "The form was submitted but the team shows no deposit." },
  recorded: { label: "Recorded", tone: "ok", help: "The deposit is on the team." },
  duplicate: { label: "Duplicate", tone: "mute", help: "An earlier entry already covers this team." },
  test: { label: "Test form", tone: "mute", help: "Entries from the $1 test form are never recorded." },
  no_team: { label: "No team", tone: "bad", help: "This captain has no team this season." },
  no_player: { label: "Unknown user", tone: "warn", help: "The logged-in user is not a known player." },
  no_user: { label: "No login", tone: "warn", help: "Submitted without being logged in, so it cannot be matched." },
};
export const entryState = (s) => ENTRY_STATES[s] || { label: s || "?", tone: "mute", help: "" };

// One plain headline for the whole page.
export function verdict(ov) {
  if (!ov) return null;
  if (!ov.season || !ov.season.exists) return { tone: "bad", headline: "No season to write to", detail: `Settings says season ${ov.season && ov.season.year ? ov.season.year : "(none)"}, but it does not exist. Nothing can be recorded until it does.` };
  const bad = (ov.issues || []).filter((i) => i.level === "bad").length;
  const warn = (ov.issues || []).filter((i) => i.level === "warn").length;
  const probs = bad + warn;
  if (ov.pending > 0) return { tone: "bad", headline: `${plural(ov.pending, "deposit")} never reached ${ov.pending === 1 ? "its team" : "their teams"}`, detail: "A captain paid through the form but the team shows no deposit." + (probs ? ` ${plural(probs, "other problem")} also listed.` : ""), cta: { tab: "deposits", label: "Review deposits" } };
  if (bad) return { tone: "warn", headline: `${plural(bad, "problem")} to fix`, detail: "None of them are deposits waiting to be recorded.", cta: { tab: "problems", label: "See problems" } };
  if (warn) return { tone: "warn", headline: `${plural(warn, "thing")} worth a look`, detail: "Nothing is broken, but a few teams need attention.", cta: { tab: "problems", label: "See problems" } };
  if (!(ov.teams || []).length) return { tone: "info", headline: "No captain teams this season yet", detail: "Invite a captain to create the first one." };
  return { tone: "ok", headline: "Every deposit is on its team", detail: "Captains, teams and form entries line up." };
}

export function issueCounts(issues) {
  const c = { bad: 0, warn: 0, info: 0 };
  for (const i of issues || []) { if (c[i.level] !== undefined) c[i.level]++; }
  return c;
}

export function filterTeams(teams, { q = "", stage = "", problemsOnly = false, problemTeamIds = [] } = {}) {
  const needle = String(q).trim().toLowerCase();
  const probs = new Set(problemTeamIds);
  return (teams || []).filter((t) => {
    if (stage && stageIndex(t.stage) < stageIndex(stage)) return false;
    if (problemsOnly && !probs.has(t.id)) return false;
    if (!needle) return true;
    return [t.name, t.captain && t.captain.name, t.captain && t.captain.email].some((v) => String(v || "").toLowerCase().includes(needle));
  });
}

export function nextStep(t) {
  if (!t.captain) return "Add a captain";
  if (t.account === "none") return "Send an invite";
  if (t.account === "pending") return "Waiting for the captain to set a password";
  if (t.roster_size === 0) return "Waiting for a roster";
  if (!t.deposit_paid_at) return "Waiting for the deposit";
  if (t.payment_status !== "paid_in_full") return "Balance due";
  return "Done";
}

export const money = (n) => (n === null || n === undefined ? "—" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

const AFTER_LABEL = { deposit_paid: "deposit paid", paid_in_full: "paid in full", unpaid: "unpaid" };
export const statusLabel = (s) => AFTER_LABEL[s] || s || "unpaid";

// What a confirmation dialog tells the admin before anything is written.
export function recordSummary(entries, ids, sendEmail) {
  const pick = (entries || []).filter((e) => ids.includes(e.entry_id) && e.state === "needs_recording" && e.would);
  const early = pick.filter((e) => e.would.fee_tier === "early").length;
  const late = pick.filter((e) => e.would.fee_tier === "late").length;
  const balance = pick.reduce((s, e) => s + (e.would.balance_due || 0), 0);
  return { count: pick.length, early, late, balance, deposit: pick.reduce((s, e) => s + (e.would.deposit_amount || 0), 0), email: !!sendEmail };
}

export function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }

// Totals for the result card after recording in batches.
export function tallyResults(results) {
  const t = { recorded: 0, skipped: 0, error: 0 };
  for (const r of results || []) { if (t[r.status] !== undefined) t[r.status]++; }
  return t;
}

export function teamsCSV(ov) {
  const rows = (ov.teams || []).map((t) => [t.name, t.division || "", t.captain ? t.captain.name : "", t.captain ? t.captain.email : "", t.account, t.roster_size, t.stage, t.payment_status, t.fee_tier || "", t.fee_total ?? "", t.balance_due ?? "", t.age_days ?? "", t.looks_test ? "yes" : "", t.last_nudged_at || ""]);
  return toCSV(["team", "division", "captain", "captain_email", "account", "roster_size", "stage", "payment_status", "fee_tier", "fee_total", "balance_due", "age_days", "looks_test", "last_nudged_at"], rows, { guardFormulas: true });
}
export function entriesCSV(ov) {
  const rows = (ov.entries || []).map((e) => [e.entry_id, e.form, e.date, e.team || "", e.captain || "", e.state, e.would ? e.would.fee_tier : "", e.would ? e.would.fee_total : "", e.would ? e.would.balance_due : ""]);
  return toCSV(["entry_id", "form", "date_gmt", "team", "captain", "state", "would_tier", "would_fee_total", "would_balance_due"], rows, { guardFormulas: true });
}

// Problems grouped for the tab, worst first.
export function groupIssues(issues) {
  const order = { bad: 0, warn: 1, info: 2 };
  return [...(issues || [])].sort((a, b) => (order[a.level] - order[b.level]) || String(a.title).localeCompare(String(b.title)));
}
export const problemTeamIds = (issues) => [...new Set((issues || []).filter((i) => i.team_id && i.level !== "info").map((i) => i.team_id))];


// ---------------------------------------------------------------------------------------------------------------
// Clean-up, nudges, money, division balance, next actions
// ---------------------------------------------------------------------------------------------------------------

export const ageLabel = (d) => (d === null || d === undefined ? "" : d === 0 ? "today" : d === 1 ? "1 day" : d + " days");

// Days a captain team has been sitting before the deposit step. Zero once a deposit exists.
export function stuckDays(t) {
  if (!t || t.age_days === null || t.age_days === undefined) return 0;
  return ["invited", "active", "roster"].includes(t.stage) ? t.age_days : 0;
}
export const stuckTone = (d) => (d >= 14 ? "bad" : d >= 7 ? "warn" : "mute");

export const TEST_REASON = { test_name: "has \"test\" in a name", alias_email: "captain email uses a + alias" };
export const testReasons = (t) => (t.test_flags || []).map((f) => TEST_REASON[f] || f);

// Three piles for the clean-up tab.
export function cleanupGroups(teams) {
  const list = teams || [];
  const suspect = list.filter((t) => t.looks_test && t.delete && t.delete.allowed);
  const other = list.filter((t) => !t.looks_test && t.delete && t.delete.allowed);
  const protectedTeams = list.filter((t) => !(t.delete && t.delete.allowed));
  return { suspect, other, protected: protectedTeams, deletable: suspect.length + other.length };
}

export const DELETE_WORD = "DELETE";
export const deleteWordOk = (txt) => String(txt || "").trim().toUpperCase() === DELETE_WORD;

export function deleteSummary(teams, ids) {
  const pick = (teams || []).filter((t) => ids.includes(t.id));
  const ok = pick.filter((t) => t.delete && t.delete.allowed);
  return { picked: pick.length, ok, blocked: pick.filter((t) => !(t.delete && t.delete.allowed)), withCaptain: ok.filter((t) => t.captain).length };
}

// Teams a reminder email makes sense for, mirrored from the server rules so the button can show a count.
export function nudgeCandidates(teams, cooldownDays = 3, nowMs = Date.now()) {
  return (teams || []).filter((t) => {
    if (!t.captain || !t.captain.email || t.looks_test) return false;
    if (["deposit", "paid"].includes(t.stage)) return false;
    if (t.last_nudged_at) {
      const when = Date.parse(String(t.last_nudged_at).replace(" ", "T") + "Z");
      if (!Number.isNaN(when) && nowMs - when < cooldownDays * 86400000 - 14 * 3600000) return false; // site time vs UTC drift, final say is the server's
    }
    return true;
  });
}

export function healthSummary(health) {
  const list = health || [];
  const failed = list.filter((h) => !h.ok);
  return { failed, okCount: list.length - failed.length, allOk: failed.length === 0 && list.length > 0 };
}

export function balanceStatus(row) {
  if (!row || row.expected === null || row.expected === undefined) return { tone: "mute", label: `${row.actual} team${row.actual === 1 ? "" : "s"}` };
  if (row.delta === 0) return { tone: "ok", label: "On target" };
  if (row.delta > 0) return { tone: "warn", label: `${row.delta} over` };
  return { tone: "info", label: `${-row.delta} to find` };
}

export function earlyBirdLine(m) {
  if (!m) return "";
  if (m.tier_now === "early" && m.days_left !== null && m.waiting > 0) {
    const save = m.saves_per_team > 0 ? ` Each team saves ${money(m.saves_per_team)}.` : "";
    return `Early fee ends in ${plural(m.days_left, "day")}. ${plural(m.waiting, "team")} still to pay.${save}`;
  }
  if (m.tier_now === "late" && m.waiting > 0) return `The early fee has ended. ${plural(m.waiting, "team")} still to pay at ${money(m.fee_now)}.`;
  return m.waiting === 0 ? "Every team has paid a deposit." : "";
}

// One ranked to-do list. Most urgent first, at most six.
export function actionQueue(ov) {
  if (!ov || !ov.season || !ov.season.exists) return [];
  const out = [];
  const teams = ov.teams || [];
  if (ov.pending > 0) out.push({ key: "record", tone: "bad", title: `Record ${plural(ov.pending, "deposit")}`, detail: "Paid on the form, missing on the team.", cta: "Review", go: { tab: "deposits" } });
  const noDiv = teams.filter((t) => !t.division_ok).length;
  if (noDiv) out.push({ key: "division", tone: "bad", title: `Fix ${plural(noDiv, "division")}`, detail: "Blank or invalid, so the team cannot be placed.", cta: "Fix", go: { tab: "problems" } });
  const g = cleanupGroups(teams);
  if (g.suspect.length) out.push({ key: "cleanup", tone: "warn", title: `Remove ${plural(g.suspect.length, "test team")}`, detail: "Dummy data is skewing every number on this page.", cta: "Clean up", go: { tab: "cleanup" } });
  const noCap = teams.filter((t) => !t.captain && !t.looks_test).length;
  if (noCap) out.push({ key: "captain", tone: "warn", title: `Assign a captain to ${plural(noCap, "team")}`, detail: "No captain means no login, no deposit email and no form match.", cta: "Assign", go: { tab: "teams", filter: "nocaptain" } });
  const nudge = nudgeCandidates(teams, ov.cooldown_days || 3).filter((t) => stuckDays(t) >= 7).length;
  if (nudge) out.push({ key: "nudge", tone: "warn", title: `Remind ${plural(nudge, "captain")} stuck for a week or more`, detail: "One preview, one click.", cta: "Preview", go: { tab: "teams", action: "nudge", minStuck: 7 } });
  const over = ((ov.balance && ov.balance.rows) || []).filter((r) => r.delta !== null && r.delta > 0);
  if (over.length) out.push({ key: "balance", tone: "info", title: `${over.map((r) => r.label).join(", ")} ${over.length === 1 ? "has" : "have"} more teams than planned`, detail: "Usually leftovers. Check the clean-up tab.", cta: "Look", go: { tab: "cleanup" } });
  const eb = ov.money && ov.money.tier_now === "early" && ov.money.days_left !== null && ov.money.days_left <= 21 && ov.money.waiting > 0;
  if (eb) out.push({ key: "earlybird", tone: "info", title: `Early fee ends in ${plural(ov.money.days_left, "day")}`, detail: `${plural(ov.money.waiting, "team")} still to pay.`, cta: "Remind", go: { tab: "teams", action: "nudge", minStuck: 0 } });
  return out.slice(0, 6);
}

export function filterTeamsMore(teams, { stuck = 0, noCaptain = false } = {}) {
  return (teams || []).filter((t) => (!stuck || stuckDays(t) >= stuck) && (!noCaptain || !t.captain));
}

export function historyTitle(a) {
  return { captain_sync_deposit: "Deposit recorded", captain_sync_undo: "Deposit removed (undo)", captain_sync_division: "Division changed", captain_sync_team_deleted: "Team deleted", captain_sync_team_restored: "Team restored", captain_sync_captain: "Captain changed" }[a] || a;
}
