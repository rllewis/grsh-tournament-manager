// Pure helpers for the Settings page. No React, no network, no Date-timezone surprises:
// every date is a "YYYY-MM-DD" string handled as whole calendar days (UTC math on the parts).

export const STATUSES = ["setup", "open", "draft", "locked", "complete"];
export const IRREVERSIBLE = ["locked", "complete"];
/** How a division fills its teams. A row with no format is "both", which is how every division behaved before this setting existed. */
export const FORMATS = ["draft", "teams", "both"];
export const FORMAT_LABEL = { draft: "Draft", teams: "Registered teams", both: "Both" };
export const FORMAT_HELP = {
  draft: "Players register one by one and the draft builds the teams.",
  teams: "Captains register whole teams and pay a deposit. No draft.",
  both: "Some slots are registered teams, the rest are filled by the draft.",
};
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function toNum(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v.trim());
  return Number.isFinite(n) ? n : null;
}

// ── dates ───────────────────────────────────────────────────────────────────
export function ymdToDays(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof s === "string" ? s : "");
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const t = Date.UTC(y, mo - 1, d);
  const c = new Date(t);
  if (c.getUTCFullYear() !== y || c.getUTCMonth() !== mo - 1 || c.getUTCDate() !== d) return null;
  return Math.round(t / 86400000);
}
export function daysToYmd(n) {
  const d = new Date(n * 86400000);
  return `${String(d.getUTCFullYear()).padStart(4, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
export const addDays = (s, n) => { const d = ymdToDays(s); return d === null ? null : daysToYmd(d + n); };
export const daysBetween = (a, b) => { const x = ymdToDays(a), y = ymdToDays(b); return x === null || y === null ? null : y - x; };
export function addYears(s, n) {
  const d = ymdToDays(s); if (d === null) return null;
  const [y, m, day] = s.split("-").map(Number);
  const cand = `${String(y + n).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return ymdToDays(cand) === null ? `${String(y + n).padStart(4, "0")}-${String(m).padStart(2, "0")}-28` : cand; // Feb 29 -> Feb 28
}
export function fmtDate(s) {
  const d = ymdToDays(s); if (d === null) return "—";
  const [y, m, day] = s.split("-").map(Number);
  return `${MON[m - 1]} ${day}, ${y}`;
}
export function localToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Phase + to-scale positions for the season timeline. */
export function timelineModel({ opens, closes, draft, today }) {
  const o = ymdToDays(opens), c = ymdToDays(closes), d = ymdToDays(draft), t = ymdToDays(today);
  const points = [];
  if (o !== null) points.push({ key: "opens", label: "Opens", ymd: opens, day: o });
  if (c !== null) points.push({ key: "closes", label: "Closes", ymd: closes, day: c });
  if (d !== null) points.push({ key: "draft", label: "Draft", ymd: draft, day: d });
  let phase = "unset", label = "Dates not set", note = "";
  const problems = [];
  if (o !== null && c !== null && o > c) problems.push("Registration closes before it opens.");
  if (c !== null && d !== null && d < c) problems.push("The draft is before registration closes.");
  if (t !== null && o !== null && c !== null) {
    if (t < o) { phase = "before"; label = "Registration not open yet"; note = `Opens in ${plural(o - t, "day")}`; }
    else if (t <= c) { phase = "open"; label = "Registration open"; note = t === c ? "Closes today" : `Closes in ${plural(c - t, "day")}`; }
    else if (d === null || t <= d) { phase = "closed"; label = "Registration closed"; note = d !== null ? (t === d ? "Draft is today" : `Draft in ${plural(d - t, "day")}`) : "No draft date set"; }
    else { phase = "after"; label = "Draft date has passed"; note = `${plural(t - d, "day")} ago`; }
  }
  const days = points.map(p => p.day).concat(t === null ? [] : [t]);
  let todayPct = null;
  if (points.length >= 2) {
    const lo = Math.min(...days) - 3, hi = Math.max(...days) + 3, span = Math.max(1, hi - lo);
    points.forEach(p => { p.pct = Math.round(((p.day - lo) / span) * 1000) / 10; });
    if (t !== null) todayPct = Math.round(((t - lo) / span) * 1000) / 10;
  } else points.forEach(p => { p.pct = 50; });
  return { phase, label, note, points, todayPct, problems };
}

// ── labels, formatting, diff ────────────────────────────────────────────────
export const FIELD_LABELS = {
  season_label: "Season label", form_id: "Registration form", status: "Season status",
  registration_opens: "Registration opens", registration_closes: "Registration closes", draft_date: "Draft date",
  timer_enabled: "Draft timer on", timer_seconds: "Draft timer (seconds)", draft_type: "Draft type", draft_order: "Draft order",
  email_registration: "Registration confirmation email", email_roster: "Roster finalized email", email_payment: "Payment reminder email", email_alternate: "Alternate activation email",
  email_team_balance: "Team balance emails", email_team_deposit_nudge: "Team deposit nudges", sender_name: "From name", sender_email: "From email",
  player_fee: "Player fee", team_deposit_amount: "Team deposit", team_fee_early_amount: "Early team fee", team_fee_late_amount: "Late team fee",
  team_fee_early_cutoff_date: "Early-fee cutoff", team_balance_due_date: "Balance due date", team_deposit_nudge_days: "Deposit nudge (days)", team_balance_reminder_days: "Balance reminder (days)",
  public_rosters: "Public roster pages", sandbagging_auto_flag: "Auto-flag sandbagging",
};
const DIV_FIELDS = { enabled: "enabled", format: "format", reg_teams: "registered-team slots", teams: "teams", min_roster: "min roster", max_roster: "max roster", goalie_min: "min goalies", goalie_max: "max goalies", label: "name" };
const MONEY = new Set(["player_fee", "team_deposit_amount", "team_fee_early_amount", "team_fee_late_amount"]);
const DATES = new Set(["registration_opens", "registration_closes", "draft_date", "team_fee_early_cutoff_date", "team_balance_due_date"]);
export const money = (n) => { const v = toNum(n); return v === null ? "—" : "$" + v.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }); };

export function labelFor(key, cfg) {
  if (key.startsWith("divisions.")) {
    const [, dk, f] = key.split(".");
    const d = ((cfg && cfg.divisions) || []).find(x => x.key === dk);
    return `${d ? d.label : dk} · ${DIV_FIELDS[f] || f}`;
  }
  return FIELD_LABELS[key] || key;
}
export function fmtValue(key, v) {
  if (v === null || v === undefined || v === "") return "not set";
  if (typeof v === "boolean") return v ? "On" : "Off";
  if (key.endsWith(".enabled")) return v ? "On" : "Off";
  if (key.endsWith(".format")) return FORMAT_LABEL[v] || String(v);
  if (MONEY.has(key)) return money(v);
  if (DATES.has(key)) return fmtDate(v);
  return String(v);
}
function flat(cfg) {
  const f = {};
  Object.keys(cfg || {}).forEach(k => { if (k !== "divisions" && k[0] !== "_") f[k] = cfg[k]; });
  ((cfg && cfg.divisions) || []).forEach(d => Object.keys(DIV_FIELDS).forEach(x => { f[`divisions.${d.key}.${x}`] = d[x]; }));
  return f;
}
function same(a, b) {
  if (typeof a === "boolean" || typeof b === "boolean") return !!a === !!b;
  const e = (v) => v === null || v === undefined || v === "";
  if (e(a) || e(b)) return e(a) && e(b);
  const x = toNum(a), y = toNum(b);
  if (x !== null && y !== null) return x === y;
  return String(a) === String(b);
}
export function diff(oldCfg, newCfg) {
  const a = flat(oldCfg), b = flat(newCfg), out = [];
  new Set([...Object.keys(a), ...Object.keys(b)]).forEach(k => {
    if (!same(a[k], b[k])) out.push({ key: k, label: labelFor(k, newCfg), from: fmtValue(k, a[k]), to: fmtValue(k, b[k]), rawFrom: a[k], rawTo: b[k] });
  });
  return out;
}

// ── validation (mirrors GRSH_Settings::normalize so errors show before the round trip) ──
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function validate(cfg) {
  const e = {};
  const w = (k, m) => { if (!e[k]) e[k] = m; };
  if (!String(cfg.season_label || "").trim()) w("season_label", "Season label is required.");
  const fid = toNum(cfg.form_id);
  if (fid === null || fid < 1 || !Number.isInteger(fid)) w("form_id", "Pick the registration form.");
  if (!STATUSES.includes(cfg.status)) w("status", "Pick a status.");
  ["registration_opens", "registration_closes", "draft_date"].forEach(k => { const v = cfg[k]; if (v && ymdToDays(v) === null) w(k, "Not a real date."); });
  const o = ymdToDays(cfg.registration_opens), c = ymdToDays(cfg.registration_closes), d = ymdToDays(cfg.draft_date);
  if (o !== null && c !== null && o > c) w("registration_closes", "Registration closes before it opens.");
  if (c !== null && d !== null && d < c) w("draft_date", "The draft is before registration closes.");
  const ts = toNum(cfg.timer_seconds);
  if (ts === null || !Number.isInteger(ts) || ts < 15 || ts > 600) w("timer_seconds", "Timer must be 15 to 600 seconds.");
  if (cfg.sender_email && !EMAIL.test(String(cfg.sender_email).trim())) w("sender_email", "That is not a valid email address.");
  if (String(cfg.sender_name || "").length > 80) w("sender_name", "Too long (80 characters at most).");
  if (cfg.player_fee !== null && cfg.player_fee !== undefined && String(cfg.player_fee).trim() !== "") {
    const f = toNum(cfg.player_fee); if (f === null || f <= 0 || f > 5000) w("player_fee", "Enter an amount from 1 to 5,000, or leave blank.");
  }
  ["team_deposit_amount", "team_fee_early_amount", "team_fee_late_amount"].forEach(k => { const v = toNum(cfg[k]); if (v === null || v < 0 || v > 20000) w(k, "Enter an amount from 0 to 20,000."); });
  const dep = toNum(cfg.team_deposit_amount), ea = toNum(cfg.team_fee_early_amount), la = toNum(cfg.team_fee_late_amount);
  if (ea !== null && la !== null && ea > la) w("team_fee_late_amount", "The late fee is lower than the early fee.");
  if (dep !== null && ea !== null && dep > ea) w("team_deposit_amount", "The deposit is more than the early team fee.");
  ["team_fee_early_cutoff_date", "team_balance_due_date"].forEach(k => { if (ymdToDays(cfg[k]) === null) w(k, "Pick a real date."); });
  const cut = ymdToDays(cfg.team_fee_early_cutoff_date), due = ymdToDays(cfg.team_balance_due_date);
  if (cut !== null && due !== null && cut > due) w("team_balance_due_date", "The balance is due before the early-fee cutoff.");
  ["team_deposit_nudge_days", "team_balance_reminder_days"].forEach(k => { const v = toNum(cfg[k]); if (v === null || !Number.isInteger(v) || v < 1 || v > 60) w(k, "1 to 60 days."); });
  const seen = new Set();
  (cfg.divisions || []).forEach((dv, i) => {
    const p = `divisions.${i}.`;
    if (!String(dv.label || "").trim()) w(p + "label", "Name is required.");
    if (seen.has(dv.key)) w(p + "key", "Duplicate division."); seen.add(dv.key);
    if (dv.format !== undefined && !FORMATS.includes(dv.format)) w(p + "format", "Pick Draft, Registered teams or Both.");
    const rt = toNum(dv.reg_teams), tm = toNum(dv.teams);
    if (dv.format === "both" && dv.reg_teams !== undefined && dv.reg_teams !== "" && (rt === null || !Number.isInteger(rt) || rt < 0)) w(p + "reg_teams", "0 or more.");
    else if (dv.format === "both" && rt !== null && tm !== null && rt > tm) w(p + "reg_teams", "More registered-team slots than teams.");
    const R = { teams: [1, 16], min_roster: [4, 30], max_roster: [4, 40], goalie_min: [0, 4], goalie_max: [0, 6] };
    Object.keys(R).forEach(f => { const n = toNum(dv[f]); if (n === null || !Number.isInteger(n) || n < R[f][0] || n > R[f][1]) w(p + f, `${R[f][0]} to ${R[f][1]}.`); });
    const mn = toNum(dv.min_roster), mx = toNum(dv.max_roster), gn = toNum(dv.goalie_min), gx = toNum(dv.goalie_max);
    if (mn !== null && mx !== null && mx < mn) w(p + "max_roster", "Below min roster.");
    if (gn !== null && gx !== null && gx < gn) w(p + "goalie_max", "Below min goalies.");
    if (gx !== null && mx !== null && gx > mx) w(p + "goalie_max", "More goalies than roster spots.");
  });
  if ((cfg.divisions || []).length && !(cfg.divisions || []).some(x => x.enabled)) w("divisions", "Enable at least one division.");
  return e;
}
/** Errors that belong to a tab, so the tab can show a red count. */
export function tabOfError(key) {
  if (key.startsWith("divisions")) return "divisions";
  if (["season_label", "form_id", "status", "registration_opens", "registration_closes", "draft_date"].includes(key)) return "season";
  if (["player_fee", "team_deposit_amount", "team_fee_early_amount", "team_fee_late_amount", "team_fee_early_cutoff_date", "team_balance_due_date", "team_deposit_nudge_days", "team_balance_reminder_days"].includes(key)) return "fees";
  if (["timer_seconds", "draft_type", "draft_order"].includes(key)) return "draft";
  if (["sender_name", "sender_email"].includes(key)) return "email";
  return "season";
}

// ── money, capacity, warnings ───────────────────────────────────────────────
/** Same rule as the server: paid on or before the cutoff date -> early fee. */
export function teamFeeFor(cfg, paidYmd) {
  const cut = ymdToDays(cfg.team_fee_early_cutoff_date), p = ymdToDays(paidYmd);
  const dep = toNum(cfg.team_deposit_amount), ea = toNum(cfg.team_fee_early_amount), la = toNum(cfg.team_fee_late_amount);
  if (cut === null || p === null || dep === null || ea === null || la === null) return null;
  const early = p <= cut, total = early ? ea : la;
  return { tier: early ? "early" : "late", total, deposit: dep, balance: Math.max(0, total - dep), daysFromCutoff: p - cut, saving: la - ea };
}
/** Fill the format fields a saved row may not have. Mirrors GRSH_Settings::fill_division(). */
export function fillDivision(d) {
  const f = FORMATS.includes(d && d.format) ? d.format : "both";
  const t = toNum(d && d.teams), r = toNum(d && d.reg_teams) || 0;
  const reg = f === "draft" ? 0 : f === "teams" ? (t || 0) : Math.max(0, Math.min(t || 0, r));
  return { ...d, format: f, reg_teams: reg };
}
/** Teams a division fills from the draft pool vs by captain registration. Null while Teams is blank. */
export function slotSplit(dv) {
  const d = fillDivision(dv), t = toNum(d.teams);
  if (t === null) return { draft: null, teams: null, total: null };
  return { draft: t - d.reg_teams, teams: d.reg_teams, total: t };
}
/** Draft pool math. Only draft slots draw on registered players, so a "teams" division needs none. */
export function capacity(dv) {
  const sp = slotSplit(dv), mx = toNum(dv.max_roster), mn = toNum(dv.min_roster), g = toNum(dv.goalie_min);
  if (sp.draft === null || mx === null || mn === null) return { slots: null, needed: null, goalies: null };
  return { slots: sp.draft * mx, needed: sp.draft * mn, goalies: g === null ? null : sp.draft * g };
}
/** The what-if panel: given who has registered, what does this division still need. */
export function whatIf(dv, reg) {
  const sp = slotSplit(dv), cap = capacity(dv), n = (reg && reg.registered) || 0, g = (reg && reg.goalies) || 0;
  const full = (reg && reg.full_teams) || 0;
  if (sp.total === null || cap.slots === null) return null;
  const fmt = fillDivision(dv).format;
  const out = { format: fmt, draftSlots: sp.draft, teamSlots: sp.teams, registered: n, goalies: g, fullTeams: full };
  if (fmt !== "teams") {
    out.spotsLeft = cap.slots - n; out.needMore = Math.max(0, cap.needed - n);
    out.goalieGap = cap.goalies === null ? 0 : Math.max(0, cap.goalies - g);
    out.pct = cap.slots ? Math.min(100, Math.round((n / cap.slots) * 100)) : 0;
    out.runs = n >= cap.needed && out.goalieGap === 0;
  }
  if (fmt !== "draft") { out.teamsLeft = Math.max(0, sp.teams - full); out.teamsFull = sp.teams > 0 && full >= sp.teams; }
  return out;
}
/** Changes that would break teams that already exist. Mirrors GRSH_Settings::impact_errors(); only values that CHANGED are checked. */
export function impactErrors(oldCfg, newCfg, registered) {
  const e = {}, old = new Map(((oldCfg && oldCfg.divisions) || []).map(d => [d.key, fillDivision(d)]));
  ((newCfg && newCfg.divisions) || []).forEach((d0, i) => {
    const d = fillDivision(d0); if (!d.enabled) return;
    const rg = (registered && registered[d.key]) || {}, was = old.get(d.key), p = `divisions.${i}.`;
    if (!was) return;
    const full = rg.full_teams || 0, drafts = rg.teams || 0, made = full + drafts;
    if (was.format !== d.format) {
      if (d.format === "draft" && full > 0) e[p + "format"] = `${plural(full, "registered team")} already exist in ${d.label}. Remove or move them before switching to Draft.`;
      if (d.format === "teams" && drafts > 0) e[p + "format"] = `${plural(drafts, "draft team")} already exist in ${d.label}. Remove them before switching to Registered teams.`;
    }
    const t = toNum(d.teams), mx = toNum(d.max_roster);
    if (t !== null && toNum(was.teams) !== t && t < made) e[p + "teams"] = `${d.label} already has ${plural(made, "team")} created, so it cannot go below that.`;
    if (mx !== null && toNum(was.max_roster) !== mx && mx < (rg.max_roster_n || 0)) e[p + "max_roster"] = `A ${d.label} team already has ${plural(rg.max_roster_n, "player")}, so the max cannot go below that.`;
  });
  return e;
}
/** Revenue forecast from what the settings say (not what has been paid). */
export function revenueForecast(cfg, regd) {
  const n = (k) => toNum(cfg[k]) || 0;
  let teamSlots = 0, players = 0;
  (cfg.divisions || []).forEach(d => { if (!d.enabled) return; teamSlots += slotSplit(d).teams || 0; players += (regd && regd[d.key] && regd[d.key].registered) || 0; });
  const early = teamSlots * n("team_fee_early_amount"), late = teamSlots * n("team_fee_late_amount"), dep = teamSlots * n("team_deposit_amount");
  const pf = toNum(cfg.player_fee);
  return { teamSlots, deposits: dep, earlyTotal: early, lateTotal: late, upsideIfLate: late - early, players, playerRevenue: pf === null ? null : players * pf };
}
/** Go-live gate: what stands between the saved season and a new status. */
export function gate(readiness, status) {
  const list = (readiness && readiness[status]) || [];
  return { blockers: list.filter(c => c.level === "block"), warnings: list.filter(c => c.level === "warn"), ok: list.filter(c => c.level === "ok") };
}
export function divisionWarnings(oldCfg, newCfg, registered) {
  const out = [];
  const old = new Map(((oldCfg && oldCfg.divisions) || []).map(d => [d.key, fillDivision(d)]));
  ((newCfg && newCfg.divisions) || []).forEach(d0 => {
    const d = fillDivision(d0), rg = (registered && registered[d.key]) || {};
    const n = rg.registered || 0, was = old.get(d.key);
    if (was && was.enabled && !d.enabled && n > 0) out.push(`${d.label} is being turned off but has ${plural(n, "registered player")}. They will disappear from Players, Rosters and Reports.`);
    if (d.enabled) {
      const cap = capacity(d).slots;
      if (cap !== null && d.format !== "teams" && n > cap) out.push(`${d.label}: ${plural(n, "player")} registered but only ${cap} roster spots (${slotSplit(d).draft} draft teams × ${d.max_roster}).`);
      if (was && was.format !== d.format) {
        if (d.format === "draft" && rg.full_teams > 0) out.push(`${d.label} is going to Draft but has ${plural(rg.full_teams, "registered team")}. Captain Sync and deposit emails will still see them.`);
        if (d.format === "teams" && rg.teams > 0) out.push(`${d.label} is going to Registered teams but has ${plural(rg.teams, "draft team")}.`);
      }
    }
  });
  return out;
}

// ── rollover plan / export / import ─────────────────────────────────────────
const SETTING_KEYS = Object.keys(FIELD_LABELS).concat(["divisions"]);
export function rolloverPlan(cfg, years = 1) {
  const y = (toNum(cfg.season_year) || 0) + years;
  const shift = (s) => addYears(s, years) || "";
  const label = String(cfg.season_label || "").replace(String(cfg.season_year), String(y)) || `Gold Rush ${y}`;
  return {
    season_year: y, season_label: label, status: "setup",
    registration_opens: shift(cfg.registration_opens), registration_closes: shift(cfg.registration_closes), draft_date: shift(cfg.draft_date),
    team_fee_early_cutoff_date: shift(cfg.team_fee_early_cutoff_date), team_balance_due_date: shift(cfg.team_balance_due_date),
    player_fee: cfg.player_fee, team_deposit_amount: cfg.team_deposit_amount, team_fee_early_amount: cfg.team_fee_early_amount, team_fee_late_amount: cfg.team_fee_late_amount,
    divisions: (cfg.divisions || []).map(d => ({ ...d })),
  };
}
export function exportPayload(cfg, now = new Date()) {
  const settings = {}; SETTING_KEYS.forEach(k => { if (cfg[k] !== undefined) settings[k] = cfg[k]; });
  return { format: "grsh-settings", version: 1, exported: now.toISOString(), season_year: cfg.season_year, settings };
}
export function importPayload(text) {
  let j; try { j = JSON.parse(text); } catch (e) { return { ok: false, error: "That file is not valid JSON." }; }
  if (!j || j.format !== "grsh-settings" || typeof j.settings !== "object" || j.settings === null) return { ok: false, error: "That is not a GRSH settings export." };
  const settings = {}, ignored = [];
  Object.keys(j.settings).forEach(k => { if (SETTING_KEYS.includes(k)) settings[k] = j.settings[k]; else ignored.push(k); });
  if (!Object.keys(settings).length) return { ok: false, error: "The file has no settings in it." };
  return { ok: true, settings, ignored, season_year: j.season_year };
}
/** What to POST: numbers as numbers, blanks stay blank so the server can name the problem. */
export function buildPayload(cfg, savedAt) {
  const n = (v) => { const x = toNum(v); return x === null ? (v === undefined ? "" : v) : x; };
  const out = { ...cfg };
  ["form_id", "timer_seconds", "team_deposit_amount", "team_fee_early_amount", "team_fee_late_amount", "team_deposit_nudge_days", "team_balance_reminder_days"].forEach(k => { out[k] = n(cfg[k]); });
  out.player_fee = cfg.player_fee === null || cfg.player_fee === undefined || String(cfg.player_fee).trim() === "" ? null : n(cfg.player_fee);
  out.divisions = (cfg.divisions || []).map(d => ({ ...fillDivision(d), reg_teams: fillDivision({ ...d, teams: n(d.teams) }).reg_teams, teams: n(d.teams), min_roster: n(d.min_roster), max_roster: n(d.max_roster), goalie_min: n(d.goalie_min), goalie_max: n(d.goalie_max) }));
  Object.keys(out).forEach(k => { if (k[0] === "_") delete out[k]; });
  if (savedAt) out.base_saved_at = savedAt;
  return out;
}
export function errorTabCounts(errors) {
  const c = {}; Object.keys(errors).forEach(k => { const t = tabOfError(k); c[t] = (c[t] || 0) + 1; }); return c;
}
export function wiringState(wiring, key) { return (wiring && wiring[key] && wiring[key].state) || "active"; }
export function mapServerErrors(errors) { return errors || {}; }
