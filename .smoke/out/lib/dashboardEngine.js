"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.actionLabel = exports.WEIGHTS = exports.METRIC_LABEL = exports.BAND = void 0;
exports.ago = ago;
exports.bandFor = void 0;
exports.daysUntil = daysUntil;
exports.fillState = fillState;
exports.fmtPct = void 0;
exports.nextActions = nextActions;
exports.num = void 0;
exports.pct = pct;
exports.prettyDate = prettyDate;
exports.readiness = readiness;
// dashboardEngine.js — pure helpers behind the Dashboard (no React, no network).
// The rule here: a number that cannot be measured is null, and the page shows "—". Never NaN, never a fake 0%.

const WEIGHTS = exports.WEIGHTS = {
  registration: 30,
  payments: 25,
  approvals: 25,
  rosters: 20
};
const METRIC_LABEL = exports.METRIC_LABEL = {
  registration: "Registered vs. minimum needed",
  payments: "Payments settled",
  approvals: "Players approved",
  rosters: "Teams ready (roster size + goalie)"
};

/** A finite number or null. */
const num = v => {
  if (v === null || v === undefined || typeof v === "boolean") return null; // Number(null) is 0 — that must never pass as a real zero
  const n = typeof v === "string" && v.trim() === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** have/of as a whole percent, capped 0-100, or null when it cannot be measured. */
exports.num = num;
function pct(have, of) {
  const h = num(have),
    o = num(of);
  if (h === null || o === null || o <= 0) return null;
  return Math.max(0, Math.min(100, Math.round(h / o * 100)));
}
const fmtPct = p => p === null || p === undefined ? "—" : `${p}%`;
exports.fmtPct = fmtPct;
const bandFor = score => score === null || score === undefined ? "none" : score >= 90 ? "ready" : score >= 70 ? "track" : score >= 50 ? "attention" : "start";
exports.bandFor = bandFor;
const BAND = exports.BAND = {
  ready: {
    label: "Tournament ready",
    color: "#166534",
    ring: "#22c55e"
  },
  track: {
    label: "On track",
    color: "#1a1a2e",
    ring: "#1a1a2e"
  },
  attention: {
    label: "Needs attention",
    color: "#92400E",
    ring: "#f59e0b"
  },
  start: {
    label: "Getting started",
    color: "#991B1B",
    ring: "#ef4444"
  },
  none: {
    label: "Not enough data yet",
    color: "#6b6b7b",
    ring: "#D0CEC6"
  }
};

/**
 * Readiness from the server's metric pairs. Measures that are null are left out and the rest re-weighted,
 * so a missing measure can never drag the score to NaN or to a misleading 0.
 * Returns { score|null, basis, total, rows[] } where each row is { key, label, have, of, pct|null, weight, action? }.
 */
function readiness(metrics) {
  const m = metrics || {};
  const rows = Object.keys(WEIGHTS).map(key => {
    const v = m[key] || null;
    const have = v ? num(v.have) : null,
      of = v ? num(v.of) : null;
    return {
      key,
      label: METRIC_LABEL[key],
      have,
      of,
      pct: v ? pct(have, of) : null,
      weight: WEIGHTS[key]
    };
  });
  const live = rows.filter(r => r.pct !== null);
  const wsum = live.reduce((s, r) => s + r.weight, 0);
  const score = wsum > 0 ? Math.round(live.reduce((s, r) => s + r.pct * r.weight, 0) / wsum) : null;
  return {
    score,
    basis: live.length,
    total: rows.length,
    rows
  };
}

// ── time ──
const parseDb = s => {
  // "YYYY-MM-DD HH:MM:SS" from the database clock; both sides come from the same clock
  if (typeof s !== "string") return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
};

/** "5 min ago" from two database timestamps (so browser clock and time zone never matter). */
function ago(at, now) {
  const a = parseDb(at),
    n = parseDb(now);
  if (a === null || n === null) return "";
  const s = Math.max(0, Math.round((n - a) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) {
    const h = Math.round(s / 3600);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  const d = Math.round(s / 86400);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/** Whole days from `today` (a Date) to a YYYY-MM-DD string, or null. Negative = in the past. */
function daysUntil(dateStr, today = new Date()) {
  const m = typeof dateStr === "string" && dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const n = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((t - n) / 86400000);
}
function prettyDate(dateStr) {
  const m = typeof dateStr === "string" && dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
}
const ACTION_LABEL = {
  player_imported: "Player imported",
  sync_failed: "Import failed",
  import_warning: "Import warning",
  sandbagging_review: "Sandbagging flagged",
  tournament_date_set: "Tournament date",
  roster_moves: "Roster moves",
  roster_team_created: "Team added",
  roster_team_updated: "Team changed",
  roster_plan_saved: "Plan saved",
  roster_published: "Rosters published",
  roster_review_link: "Review link",
  roster_pins: "Pairing rules",
  draft_started: "Draft started",
  draft_pick: "Draft pick",
  skill_override: "Tier changed"
};
const actionLabel = a => ACTION_LABEL[a] || String(a || "").replace(/_/g, " ").replace(/^./, c => c.toUpperCase());

// ── what to do next ──
/** Ordered, plain-language to-do list from the dashboard payload. Most urgent first. */
exports.actionLabel = actionLabel;
function nextActions(d, extra = {}) {
  if (!d) return [];
  const out = [];
  const push = (key, severity, text, page, params) => out.push({
    key,
    severity,
    text,
    page,
    params: params || ""
  });
  const unsynced = num(extra.unsynced);
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (num(d.sync_failures_7d) > 0) push("sync_failed", "high", `${plural(d.sync_failures_7d, "import")} failed this week. Check Recent activity before syncing again.`, "grsh-tm-dashboard", "#activity");
  if (unsynced > 0) push("unsynced", "high", `${plural(unsynced, "form entry")} not imported yet. Press “Sync from WPForms”.`, "grsh-tm-dashboard", "#sync");
  if (!d.tournament_date) push("date", "medium", "Set the tournament date so the countdown and milestones work.", "grsh-tm-dashboard", "#dates");
  const flags = num(d.totals && d.totals.sandbagging_flags);
  if (flags > 0) push("flags", "high", `${plural(flags, "sandbagging flag")} waiting for a committee decision.`, "grsh-tm-players");
  const unpaid = num(d.totals && d.totals.unpaid);
  if (unpaid > 0) push("unpaid", "medium", `${plural(unpaid, "player")} still ${unpaid === 1 ? "owes" : "owe"} payment.`, "grsh-tm-players");
  const reg = num(d.totals && d.totals.registered),
    appr = d.metrics && d.metrics.approvals ? num(d.metrics.approvals.have) : null;
  if (reg > 0 && appr !== null && reg - appr > 0) push("approve", "medium", `${plural(reg - appr, "player")} not approved yet.`, "grsh-tm-players");
  (d.divisions || []).forEach(v => {
    if (!v.configured) return;
    const link = `?division=${encodeURIComponent(v.key)}`;
    if (v.registered > 0 && v.planned_teams > 0 && v.teams === 0) push(`teams_${v.key}`, "medium", `${v.label}: no teams created yet.`, "grsh-tm-rosters", link);
    const needG = v.planned_teams > 0 ? v.planned_teams - v.goalies : 0;
    if (needG > 0 && v.registered > 0) push(`goalies_${v.key}`, "high", `${v.label}: needs ${plural(needG, "more goalie")} for ${v.planned_teams} teams.`, "grsh-tm-players");
    if (v.teams > 0 && v.stage === "draft") push(`finish_${v.key}`, "low", `${v.label}: rosters not locked yet (${v.rostered} players on ${plural(v.teams, "team")}).`, "grsh-tm-rosters", link);else if (v.teams > 0 && v.stage === "locked") push(`publish_${v.key}`, "low", `${v.label}: rosters are locked — ready to publish.`, "grsh-tm-rosters", link);
  });
  const order = {
    high: 0,
    medium: 1,
    low: 2
  };
  return out.map((x, i) => ({
    ...x,
    i
  })).sort((a, b) => order[a.severity] - order[b.severity] || a.i - b.i).map(({
    i,
    ...x
  }) => x);
}

/** Where a division stands against what it needs. */
function fillState(v) {
  const have = num(v && v.registered) ?? 0,
    need = num(v && v.min_needed),
    cap = num(v && v.capacity);
  if (!need || !cap) return {
    state: "unknown",
    have,
    need: null,
    cap: null,
    short: null,
    room: null
  };
  return {
    state: have < need ? "short" : have >= cap ? "full" : "ok",
    have,
    need,
    cap,
    short: Math.max(0, need - have),
    room: Math.max(0, cap - have)
  };
}