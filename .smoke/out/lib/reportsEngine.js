"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.VERDICT = exports.SEVERITY = void 0;
exports.ageMinutes = ageMinutes;
exports.ago = ago;
exports.dayBars = dayBars;
exports.delta = delta;
exports.fillState = fillState;
exports.matchName = void 0;
exports.money = money;
exports.num = void 0;
exports.parityBand = parityBand;
exports.safeFilename = exports.pctText = void 0;
exports.sortTeams = sortTeams;
// reportsEngine.js — pure helpers behind the Reports page (no React, no network).
// Same rule as the Dashboard: a number that cannot be measured is null and the page shows "—". Never NaN, never a fake $0.

/** A finite number or null. */
const num = v => {
  if (v === null || v === undefined || typeof v === "boolean") return null;
  const n = typeof v === "string" && v.trim() === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** "$1,234" (or "$1,234.50" when there are cents); "—" when unknown. */
exports.num = num;
function money(v) {
  const n = num(v);
  if (n === null) return "—";
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  return "$" + n.toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2
  });
}
const pctText = v => num(v) === null ? "—" : `${Math.round(v)}%`;

/** "+3", "−2" or "no change"; null when the change is unknown. */
exports.pctText = pctText;
function delta(v) {
  const n = num(v);
  if (n === null) return null;
  if (n === 0) return "no change";
  return (n > 0 ? "+" : "−") + Math.abs(Math.round(n * 100) / 100);
}

/** "5 min ago" from an ISO string or "YYYY-MM-DD HH:MM:SS" (treated as UTC). */
function ago(iso, now = Date.now()) {
  if (!iso) return "";
  const t = Date.parse(/Z|[+-]\d\d:?\d\d$/.test(iso) ? iso : String(iso).replace(" ", "T") + "Z");
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/** Hours since the data was generated, or null. Used to warn when a page has been open a long time. */
function ageMinutes(iso, now = Date.now()) {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? Math.max(0, Math.round((now - t) / 60000)) : null;
}

/** Parity band from the server's own thresholds, so the page and the rule can never disagree. */
function parityBand(score, bands) {
  const s = num(score);
  const b = bands || {
    rebalance_below: 60,
    rebalance_above: 85,
    review_below: 65,
    review_above: 80
  };
  if (s === null) return {
    key: "unknown",
    label: "Not calculated",
    color: "#6b6b7b",
    bg: "#F3F4F6"
  };
  if (s < b.rebalance_below || s > b.rebalance_above) return {
    key: "rebalance",
    label: "Rebalance",
    color: "#991B1B",
    bg: "#FEE2E2"
  };
  if (s < b.review_below || s > b.review_above) return {
    key: "review",
    label: "Review",
    color: "#92400E",
    bg: "#FEF3C7"
  };
  return {
    key: "balanced",
    label: "Balanced",
    color: "#166534",
    bg: "#DCFCE7"
  };
}
const RANK = {
  rebalance: 0,
  review: 1,
  unknown: 2,
  balanced: 3
};
/** Worst teams first, so the ones that need action are not buried under the fine ones. */
function sortTeams(teams, bands) {
  return [...(teams || [])].sort((a, b) => {
    const ra = RANK[parityBand(a.parity_score, bands).key],
      rb = RANK[parityBand(b.parity_score, bands).key];
    return ra - rb || (num(a.parity_score) ?? 999) - (num(b.parity_score) ?? 999) || String(a.name).localeCompare(String(b.name));
  });
}

/** How full a division is against its minimum and capacity. */
function fillState(registered, min, cap) {
  const r = num(registered) ?? 0,
    mn = num(min) ?? 0,
    cp = num(cap) ?? 0;
  if (!mn && !cp) return {
    state: "unknown",
    short: 0,
    pct: null
  };
  if (cp && r > cp) return {
    state: "over",
    short: 0,
    pct: 100
  };
  if (mn && r < mn) return {
    state: "short",
    short: mn - r,
    pct: cp ? Math.round(r / cp * 100) : Math.round(r / mn * 100)
  };
  if (cp && r >= cp) return {
    state: "full",
    short: 0,
    pct: 100
  };
  return {
    state: "ok",
    short: 0,
    pct: cp ? Math.round(r / cp * 100) : 100
  };
}

/** A contiguous run of the last `days` days ending today, with zeros filled in (for the sparkline). */
function dayBars(byDay, days = 30, today = new Date()) {
  const out = [];
  const end = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end - i * 86400000).toISOString().slice(0, 10);
    out.push({
      date: d,
      n: Number((byDay || {})[d]) || 0
    });
  }
  return out;
}
const VERDICT = exports.VERDICT = {
  ready: {
    bg: "#DCFCE7",
    border: "#86EFAC",
    color: "#14532D",
    icon: "✓"
  },
  attention: {
    bg: "#FEF3C7",
    border: "#FCD34D",
    color: "#78350F",
    icon: "!"
  },
  blocked: {
    bg: "#FEE2E2",
    border: "#FCA5A5",
    color: "#7F1D1D",
    icon: "✕"
  },
  empty: {
    bg: "#F3F4F6",
    border: "#D1D5DB",
    color: "#374151",
    icon: "–"
  }
};
const SEVERITY = exports.SEVERITY = {
  high: {
    bg: "#FEE2E2",
    color: "#991B1B",
    label: "Urgent"
  },
  medium: {
    bg: "#FEF3C7",
    color: "#92400E",
    label: "Soon"
  },
  low: {
    bg: "#E0F2FE",
    color: "#075985",
    label: "When ready"
  }
};

/** Case-insensitive name filter that never throws on null. */
const matchName = (name, q) => !q || String(name || "").toLowerCase().includes(String(q).trim().toLowerCase());

/** Safe filename for a download: keeps letters, digits, dot, dash and underscore only. */
exports.matchName = matchName;
const safeFilename = n => String(n || "report.csv").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80) || "report.csv";
exports.safeFilename = safeFilename;