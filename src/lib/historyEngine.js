// Player History: every rule that decides what the page shows, with no React and no window access, so it can be tested.

export const DIVISION_LABEL = { gold_open: "Gold Open", "45a": "45A", senior_b: "Senior B", senior_c: "Senior C", womens: "Women's" };
export const DIVISION_KEYS = ["gold_open", "45a", "senior_b", "senior_c", "womens"];
export const TIER_ORDER = ["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "R1", "R2", "R3"];
export const TIER_VAL = (t) => TIER_ORDER.indexOf(t);
export const GAP_FILTER_LABEL = { no_tier: "No skill tier", no_division: "No division", no_games: "No attendance recorded", no_team: "No team", no_email: "No email" };

export const titleCase = (s) => (s ? String(s).replace(/\b\w/g, (c) => c.toUpperCase()) : "");
export const toB = (v) => v === true || v === 1 || v === "1" || v === "yes" || v === "Yes" || v === "true";

// ─── Flat API records → player objects ───────────────────────────────────────
export function aggregateRecords(records) {
  const map = {};
  let skipped = 0;
  records.forEach((r) => {
    const key = r.player_id ? "p" + r.player_id : (r.email || "").toLowerCase().trim();
    if (!key) { skipped++; return; }
    if (!map[key]) {
      map[key] = {
        id: r.player_id || r.id, first_name: r.first_name || "", last_name: r.last_name || "",
        email: r.email || "", skill_tier_reported: r.skill_tier_reported || r.skill_tier || null,
        position: r.position || null, sandbagging_flag: false,
        no_show_count: 0, attendance_rating: null, history: [], _latest: 0,
      };
    }
    const p = map[key];
    const isCaptain = toB(r.was_captain) || toB(r.is_captain);
    const isSandbag = toB(r.sandbagging_flag) || toB(r.is_sandbagging);
    const num = (v) => (v === null || v === undefined || v === "" ? null : +v);
    p.history.push({
      row_id: r.id, season: +r.season_year, division: r.division_played || r.division || "",
      team: r.team_name || r.team || "", finish: r.finish_position || r.finish || null,
      championship: r.championship_result || r.championship || "none",
      was_captain: isCaptain, sandbagging_flag: isSandbag, was_alternate: toB(r.was_alternate),
      skill_tier: r.skill_tier_reported || r.skill_tier || null,
      games_scheduled: num(r.games_scheduled), games_attended: num(r.games_attended),
      no_show: +r.no_show_count || 0, notes: r.committee_notes || "",
    });
    p.no_show_count += +r.no_show_count || 0;
    if (isSandbag) p.sandbagging_flag = true;
    if (+r.season_year > p._latest) {
      p._latest = +r.season_year;
      p.skill_tier_reported = r.skill_tier_reported || r.skill_tier || p.skill_tier_reported;
    }
  });
  const players = Object.values(map).map((p) => {
    delete p._latest;
    const sch = p.history.reduce((s, h) => s + (h.games_scheduled || 0), 0);
    const att = p.history.reduce((s, h) => s + (h.games_attended || 0), 0);
    p.attendance_rating = sch > 0 ? Math.round((att / sch) * 100) : null;
    p.games_recorded = p.history.some((h) => h.games_scheduled !== null);
    p.history.sort((a, b) => b.season - a.season);
    p.gaps = [];
    if (p.history.some((h) => !h.skill_tier)) p.gaps.push("no_tier");
    if (p.history.some((h) => !h.division)) p.gaps.push("no_division");
    if (p.history.some((h) => h.games_scheduled === null)) p.gaps.push("no_games");
    if (p.history.some((h) => !h.team)) p.gaps.push("no_team");
    if (!p.email) p.gaps.push("no_email");
    return p;
  });
  return { players, skipped };
}

// ─── Tier trend ──────────────────────────────────────────────────────────────
export function tierTrend(history) {
  const t = history.filter((h) => TIER_VAL(h.skill_tier) >= 0); // newest first
  if (t.length < 2) return "unknown";
  const newest = TIER_VAL(t[0].skill_tier);
  const earliest = TIER_VAL(t[t.length - 1].skill_tier);
  if (newest < earliest) return "improved";
  if (newest > earliest) return "declined";
  return "stable";
}
export const TREND = {
  improved: { arrow: "↑", color: "#166534", label: "Improving" },
  declined: { arrow: "↓", color: "#991B1B", label: "Declining" },
  stable: { arrow: "→", color: "#555", label: "Stable" },
  unknown: { arrow: "–", color: "#555", label: "Not enough tier history" },
};

/** Oldest known tier to newest known tier: {from, to, steps} where steps > 0 means better. null with fewer than two tiers. */
export function tierDelta(history) {
  const t = history.filter((h) => TIER_VAL(h.skill_tier) >= 0);
  if (t.length < 2) return null;
  const from = t[t.length - 1], to = t[0];
  return { from: from.skill_tier, to: to.skill_tier, fromSeason: from.season, toSeason: to.season, steps: TIER_VAL(from.skill_tier) - TIER_VAL(to.skill_tier) };
}

/** Latest known tier, or "". */
export function latestTier(p) {
  const h = p.history.find((x) => TIER_VAL(x.skill_tier) >= 0);
  return h ? h.skill_tier : "";
}

/** A tier change of 3+ steps between two seasons in a row. */
export function tierMoves(players) {
  const out = [];
  players.forEach((p) => {
    const t = p.history.filter((h) => TIER_VAL(h.skill_tier) >= 0).sort((a, b) => a.season - b.season);
    for (let i = 1; i < t.length; i++) {
      const d = TIER_VAL(t[i - 1].skill_tier) - TIER_VAL(t[i].skill_tier);
      if (Math.abs(d) >= 3) out.push({ player: p, from: t[i - 1], to: t[i], steps: Math.abs(d), better: d > 0 });
    }
  });
  return out.sort((a, b) => b.steps - a.steps);
}

// ─── Filters ─────────────────────────────────────────────────────────────────
export const DEFAULT_FILTERS = {
  q: "", div: "", season: "", reliability: "", missing: "",
  warn: false, champs: false, noShow: false, recent: false, captains: false,
};
export const FILTER_KEYS = Object.keys(DEFAULT_FILTERS);

export const seasonsOf = (players) => {
  const s = new Set();
  players.forEach((p) => p.history.forEach((h) => s.add(+h.season)));
  return [...s].sort((a, b) => b - a);
};

/** Split a search box value into lower-case terms. Every term has to match (AND). Quotes keep a phrase together. */
export function searchTerms(q) {
  const out = [];
  String(q || "").toLowerCase().replace(/"([^"]+)"|(\S+)/g, (_, phrase, word) => { out.push((phrase || word).trim()); return ""; });
  return out.filter(Boolean);
}

export function haystack(p) {
  return [
    p.first_name, p.last_name, p.email, latestTier(p) || p.skill_tier_reported || "",
    p.history.map((h) => `${DIVISION_LABEL[h.division] || ""} ${h.division || ""} ${h.team || ""} ${h.season} ${h.skill_tier || ""}`).join(" "),
  ].join(" ").toLowerCase();
}

export function matchesFilters(p, f, latestSeason) {
  const terms = searchTerms(f.q);
  if (terms.length) { const hay = haystack(p); if (!terms.every((t) => hay.includes(t))) return false; }
  if (f.div && !p.history.some((h) => h.division === f.div)) return false;
  if (f.season && !p.history.some((h) => +h.season === +f.season)) return false;
  if (f.missing && !p.gaps.includes(f.missing)) return false;
  if (f.warn && !p.sandbagging_flag) return false;
  if (f.champs && !p.history.some((h) => h.championship === "winner")) return false;
  if (f.noShow && !(p.no_show_count > 0)) return false;
  if (f.captains && !p.history.some((h) => h.was_captain)) return false;
  if (f.recent && !(latestSeason && p.history.some((h) => +h.season >= latestSeason - 1))) return false;
  // "Perfect" now means a recorded 100%. It used to include players with no attendance data at all.
  if (f.reliability === "perfect" && p.attendance_rating !== 100) return false;
  if (f.reliability === "concern" && !(p.attendance_rating != null && p.attendance_rating < 80)) return false;
  if (f.reliability === "noshows" && !(p.no_show_count > 0)) return false;
  return true;
}

// ─── Sorting ─────────────────────────────────────────────────────────────────
export const SORT_KEYS = ["last_name", "seasons", "champs", "division", "tier", "trend", "attendance", "last_active", "flags"];

function sortValue(p, key) {
  switch (key) {
    case "seasons": return p.history.length;
    case "champs": return p.history.filter((h) => h.championship === "winner").length;
    case "division": { const h = p.history.find((x) => x.division); return h ? (DIVISION_LABEL[h.division] || h.division).toLowerCase() : null; }
    case "tier": { const t = latestTier(p); return t ? TIER_VAL(t) : null; }       // A1 is lowest index, so ascending = best first
    case "trend": { const d = tierDelta(p.history); return d ? d.steps : null; }  // ascending = biggest drop first
    case "attendance": return p.attendance_rating;
    case "last_active": return p.history.length ? p.history[0].season : null;
    case "flags": return (p.sandbagging_flag ? 2 : 0) + (p.no_show_count > 0 ? 1 : 0);
    default: return String(p[key] || "").toLowerCase();
  }
}

/** Non-mutating. Rows with no value for the sort column always go last, in either direction. */
export function sortPlayers(players, key, dir) {
  const sign = dir === "desc" ? -1 : 1;
  const k = SORT_KEYS.includes(key) || key === "first_name" ? key : "last_name";
  return players
    .map((p, i) => ({ p, i, v: sortValue(p, k) }))
    .sort((a, b) => {
      const an = a.v === null || a.v === undefined, bn = b.v === null || b.v === undefined;
      if (an && bn) return a.i - b.i;
      if (an) return 1;
      if (bn) return -1;
      if (a.v < b.v) return -1 * sign;
      if (a.v > b.v) return 1 * sign;
      const ln = String(a.p.last_name || "").toLowerCase(), lm = String(b.p.last_name || "").toLowerCase();
      if (ln !== lm) return ln < lm ? -1 : 1;
      return a.i - b.i;
    })
    .map((x) => x.p);
}

export function filterAndSort(players, f, sortKey, sortDir) {
  const latest = seasonsOf(players)[0] || 0;
  return sortPlayers(players.filter((p) => matchesFilters(p, f, latest)), sortKey, sortDir);
}

/** Chips for the filters that are on: [{key, label}] */
export function activeFilterChips(f) {
  const out = [];
  if (f.q) out.push({ key: "q", label: `Search: ${f.q}` });
  if (f.div) out.push({ key: "div", label: `Division: ${DIVISION_LABEL[f.div] || f.div}` });
  if (f.season) out.push({ key: "season", label: `Season: ${f.season}` });
  if (f.reliability) out.push({ key: "reliability", label: `Attendance: ${({ perfect: "perfect (100%)", concern: "under 80%", noshows: "has no-shows" })[f.reliability] || f.reliability}` });
  if (f.missing) out.push({ key: "missing", label: `Missing: ${GAP_FILTER_LABEL[f.missing] || f.missing}` });
  if (f.warn) out.push({ key: "warn", label: "Sandbagging flag" });
  if (f.champs) out.push({ key: "champs", label: "Past champions" });
  if (f.captains) out.push({ key: "captains", label: "Past captains" });
  if (f.noShow) out.push({ key: "noShow", label: "Has no-shows" });
  if (f.recent) out.push({ key: "recent", label: "Played in the last 2 seasons" });
  return out;
}

// ─── Page numbers ────────────────────────────────────────────────────────────
export function stats(players) {
  const known = players.some((p) => p.games_recorded);
  const captainsTracked = players.some((p) => p.history.some((h) => h.was_captain));
  return {
    total: players.length,
    champions: players.filter((p) => p.history.some((h) => h.championship === "winner")).length,
    captains: players.filter((p) => p.history.some((h) => h.was_captain)).length,
    captainsTracked,
    sandbagging: players.filter((p) => p.sandbagging_flag).length,
    noShows: players.filter((p) => p.no_show_count > 0).length,
    noShowsKnown: known,
  };
}

/** How complete the data is, as whole percentages of players (tier/division/team/attendance: players with at least one row filled in). */
export function coverage(players) {
  const n = players.length;
  const pct = (c) => (n ? Math.round((c / n) * 100) : 0);
  const has = (fn) => players.filter(fn).length;
  const rows = [
    { key: "tier", label: "Skill tier", count: has((p) => p.history.some((h) => h.skill_tier)) },
    { key: "division", label: "Division", count: has((p) => p.history.some((h) => h.division)) },
    { key: "team", label: "Team", count: has((p) => p.history.some((h) => h.team)) },
    { key: "attendance", label: "Attendance", count: has((p) => p.games_recorded) },
    { key: "email", label: "Email", count: has((p) => !!p.email) },
  ];
  return rows.map((r) => ({ ...r, pct: pct(r.count), total: n }));
}

/** Columns where no player has anything to show, so the table can say so once instead of 200 times. */
export function emptyColumns(players) {
  const out = [];
  if (players.length && !players.some((p) => p.attendance_rating != null || p.no_show_count > 0)) out.push("attendance");
  if (players.length && !players.some((p) => p.sandbagging_flag || p.no_show_count > 0)) out.push("flags");
  if (players.length && !players.some((p) => p.history.some((h) => h.championship === "winner"))) out.push("champs");
  return out;
}
export const EMPTY_COL_NOTE = {
  attendance: "Attendance (not recorded for any season)",
  flags: "Flags (no sandbagging or no-show on record)",
  champs: "Championships (no champion on record)",
};

/** Age of the last import. level: none | ok | stale (60+ days) | old (150+ days) */
export function freshness(lastImportAt, now) {
  if (!lastImportAt) return { level: "none", days: null, text: "No import recorded." };
  const t = Date.parse(String(lastImportAt).replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(lastImportAt)) ? "" : "Z"));
  if (!Number.isFinite(t)) return { level: "none", days: null, text: "Last import date could not be read." };
  const days = Math.max(0, Math.floor(((now || Date.now()) - t) / 86400000));
  const level = days >= 150 ? "old" : days >= 60 ? "stale" : "ok";
  const ago = days === 0 ? "today" : days === 1 ? "yesterday" : days < 60 ? `${days} days ago` : `${Math.round(days / 30)} months ago`;
  return { level, days, text: `Last import ${ago}.` };
}

/** What needs a human, one line each: [{tab, label, count, key?}] */
export function reviewSummary(overview, players) {
  const out = [];
  ((overview && overview.quality) || []).forEach((q) => { if (q.count > 0) out.push({ tab: "gaps", key: q.key, count: q.count, label: q.label.replace(/^Season rows with /i, "rows with ").replace(/^Players with /i, "players with ") }); });
  const d = (overview && overview.duplicates) || [];
  if (d.length) out.push({ tab: "dupes", count: d.length, label: d.length === 1 ? "possible duplicate" : "possible duplicates" });
  const m = tierMoves(players || []).length;
  if (m) out.push({ tab: "moves", count: m, label: m === 1 ? "big tier move" : "big tier moves" });
  return out;
}

/** Map of player id → why the server thinks they may be a duplicate. */
export function duplicateIndex(overview) {
  const idx = {};
  ((overview && overview.duplicates) || []).forEach((d) => {
    idx[d.a.id] = { other: d.b.name, why: d.why };
    idx[d.b.id] = { other: d.a.name, why: d.why };
  });
  return idx;
}

// ─── Match highlighting ──────────────────────────────────────────────────────
/** Split text into [{t, hit}] around the search terms (case-insensitive, no regex injection). */
export function highlightParts(text, terms) {
  const s = String(text ?? "");
  const ts = (terms || []).filter(Boolean).map((x) => x.toLowerCase());
  if (!ts.length || !s) return [{ t: s, hit: false }];
  const low = s.toLowerCase();
  const mark = new Array(s.length).fill(false);
  ts.forEach((t) => { let i = low.indexOf(t); while (i !== -1) { for (let k = i; k < i + t.length; k++) mark[k] = true; i = low.indexOf(t, i + t.length); } });
  const out = []; let cur = "", hit = mark[0];
  for (let i = 0; i < s.length; i++) {
    if (mark[i] !== hit) { out.push({ t: cur, hit }); cur = ""; hit = mark[i]; }
    cur += s[i];
  }
  out.push({ t: cur, hit });
  return out;
}

// ─── Page size ───────────────────────────────────────────────────────────────
export const PAGE_SIZE = 50;
export const visibleCount = (total, shown) => Math.min(total, Math.max(PAGE_SIZE, shown));

// ─── URL + saved state ───────────────────────────────────────────────────────
const BOOL_KEYS = ["warn", "champs", "noShow", "recent", "captains"];
const URL_NAME = { q: "q", div: "div", season: "season", reliability: "rel", missing: "missing", warn: "warn", champs: "champs", noShow: "noshow", recent: "recent", captains: "captains" };

/** Only non-default values, so the address stays short and shareable. */
export function encodeState(f, sortKey, sortDir) {
  const p = new URLSearchParams();
  FILTER_KEYS.forEach((k) => { const v = f[k]; if (BOOL_KEYS.includes(k)) { if (v) p.set(URL_NAME[k], "1"); } else if (v) p.set(URL_NAME[k], String(v)); });
  if (sortKey && sortKey !== "last_name") p.set("sort", sortKey);
  if (sortDir && sortDir !== "asc") p.set("dir", sortDir);
  return p.toString();
}

export function decodeState(search) {
  const p = new URLSearchParams(search || "");
  const f = { ...DEFAULT_FILTERS };
  FILTER_KEYS.forEach((k) => {
    const v = p.get(URL_NAME[k]);
    if (BOOL_KEYS.includes(k)) f[k] = v === "1";
    else if (v) f[k] = String(v).slice(0, 120);
  });
  if (!f.q && p.get("search")) f.q = String(p.get("search")).slice(0, 120);   // the older link format
  const sortKey = SORT_KEYS.includes(p.get("sort")) ? p.get("sort") : "last_name";
  const sortDir = p.get("dir") === "desc" ? "desc" : "asc";
  const touched = FILTER_KEYS.some((k) => f[k] !== DEFAULT_FILTERS[k]) || p.has("sort") || p.has("dir");
  return { filters: f, sortKey, sortDir, touched };
}

/** Anything read back from localStorage is untrusted: keep only known keys and types. */
export function cleanFilters(raw) {
  const f = { ...DEFAULT_FILTERS };
  if (!raw || typeof raw !== "object") return f;
  FILTER_KEYS.forEach((k) => {
    if (BOOL_KEYS.includes(k)) f[k] = raw[k] === true;
    else if (typeof raw[k] === "string" || typeof raw[k] === "number") f[k] = String(raw[k]).slice(0, 120);
  });
  return f;
}

export function cleanSavedViews(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v) => v && typeof v.name === "string" && v.name.trim()).slice(0, 20).map((v, i) => ({
    id: typeof v.id === "string" ? v.id.slice(0, 40) : "v" + i, name: v.name.trim().slice(0, 40),
    filters: cleanFilters(v.filters), sortKey: SORT_KEYS.includes(v.sortKey) ? v.sortKey : "last_name", sortDir: v.sortDir === "desc" ? "desc" : "asc",
  }));
}

/** Views that ship with the page. */
export function builtinViews(latestSeason) {
  return [
    { id: "b-tier", name: "Needs a tier", builtin: true, filters: { ...DEFAULT_FILTERS, missing: "no_tier" }, sortKey: "last_name", sortDir: "asc" },
    { id: "b-returning", name: latestSeason ? `Returning (${latestSeason})` : "Returning", builtin: true, filters: { ...DEFAULT_FILTERS, season: latestSeason ? String(latestSeason) : "" }, sortKey: "tier", sortDir: "asc" },
    { id: "b-sandbag", name: "Possible sandbaggers", builtin: true, filters: { ...DEFAULT_FILTERS, warn: true }, sortKey: "trend", sortDir: "asc" },
  ];
}

export const sameFilters = (a, b) => FILTER_KEYS.every((k) => (a[k] || (BOOL_KEYS.includes(k) ? false : "")) === (b[k] || (BOOL_KEYS.includes(k) ? false : "")));

// ─── CSV ─────────────────────────────────────────────────────────────────────
/** Quote a cell, double any quotes, and stop spreadsheets from running text that starts with = + - @ as a formula. */
export function csvCell(c) {
  let s = String(c ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

export const CSV_COLUMNS = {
  player: { head: ["Last", "First", "Email"], cells: (p) => [titleCase(p.last_name), titleCase(p.first_name), p.email] },
  seasons: { head: ["Seasons", "Season years"], cells: (p) => [p.history.length, p.history.map((h) => h.season).join("|")] },
  champs: { head: ["Championships", "Captaincies"], cells: (p) => [p.history.filter((h) => h.championship === "winner").length, p.history.filter((h) => h.was_captain).length] },
  divisions: { head: ["Division history"], cells: (p) => [[...new Set(p.history.map((h) => DIVISION_LABEL[h.division] || h.division).filter(Boolean))].join("|")] },
  tier: { head: ["Latest tier", "Tier history"], cells: (p) => [latestTier(p), p.history.map((h) => `${h.season}:${h.skill_tier || ""}`).join("|")] },
  attendance: { head: ["Attendance %", "No-shows"], cells: (p) => [p.attendance_rating == null ? "" : p.attendance_rating, p.games_recorded ? p.no_show_count : ""] },
  flags: { head: ["Sandbagging"], cells: (p) => [p.sandbagging_flag ? "Yes" : "No"] },
};
const CSV_ORDER = ["player", "seasons", "champs", "divisions", "tier", "attendance", "flags"];

/** An empty attendance cell means "not recorded", not 0%. Columns follow what is visible on screen. */
export function buildCsv(players, cols) {
  const use = CSV_ORDER.filter((k) => k === "player" || (cols || CSV_ORDER).includes(k));
  const rows = [use.flatMap((k) => CSV_COLUMNS[k].head), ...players.map((p) => use.flatMap((k) => CSV_COLUMNS[k].cells(p)))];
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

// ─── Undo ────────────────────────────────────────────────────────────────────
/** The values a season row had before an edit, in the shape the save endpoint takes, for only the fields that changed. */
export function rowInit(h) {
  return {
    skill_tier_reported: h.skill_tier || "", division_played: h.division || "", team_name: h.team || "",
    championship_result: h.championship || "none",
    games_scheduled: h.games_scheduled === null || h.games_scheduled === undefined ? "" : String(h.games_scheduled),
    games_attended: h.games_attended === null || h.games_attended === undefined ? "" : String(h.games_attended),
    no_show_count: String(h.no_show || 0), sandbagging_flag: !!h.sandbagging_flag, committee_notes: h.notes || "",
  };
}
export function changedFields(init, now) {
  const out = {};
  Object.keys(now).forEach((k) => { if (now[k] !== init[k]) out[k] = now[k]; });
  return out;
}
export function inversePatch(init, changed) {
  const out = {};
  Object.keys(changed).forEach((k) => { out[k] = init[k]; });
  return out;
}
