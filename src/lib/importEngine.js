// Import History — pure logic (no DOM, no fetch) so it can be tested on its own.
// Reads a CSV / pasted spreadsheet, matches its columns to ours, rebuilds a clean file to send, and prepares
// the numbers the page shows. The server does the real validation; nothing here is trusted for writes.

export const COLUMNS = [
  { col: "first_name",           req: true,  type: "Text",    example: "Mike",                group: "Player",  note: "First name." },
  { col: "last_name",            req: true,  type: "Text",    example: "Hartley",             group: "Player",  note: "Last name." },
  { col: "email",                req: true,  type: "Email",   example: "m.hartley@email.com", group: "Player",  note: "Used to match returning players." },
  { col: "season_year",          req: true,  type: "Year",    example: "2025",                group: "Season",  note: "4-digit year." },
  { col: "division_played",      req: true,  type: "Choice",  example: "gold_open",           group: "Season",  note: "gold_open, 45a, senior_b, senior_c or womens. Common spellings like “Gold Open” are fixed for you." },
  { col: "team_name",            req: false, type: "Text",    example: "Team Red",            group: "Season",  note: "Shown in the History panel." },
  { col: "finish_position",      req: false, type: "Number",  example: "1",                   group: "Season",  note: "Regular-season rank, 0–255." },
  { col: "championship_result",  req: false, type: "Choice",  example: "winner",              group: "Season",  note: "winner, runner_up, participant or none." },
  { col: "was_captain",          req: false, type: "Yes/No",  example: "1",                   group: "Role",    note: "1, yes or true." },
  { col: "was_alternate",        req: false, type: "Yes/No",  example: "0",                   group: "Role",    note: "1, yes or true." },
  { col: "was_emergency_goalie", req: false, type: "Yes/No",  example: "0",                   group: "Role",    note: "1, yes or true." },
  { col: "skill_tier_reported",  req: false, type: "Tier",    example: "A2",                  group: "Skill",   note: "A1–A3, B1–B3, C1–C3 or R1–R3." },
  { col: "games_scheduled",      req: false, type: "Number",  example: "6",                   group: "Attendance", note: "0–255." },
  { col: "games_attended",       req: false, type: "Number",  example: "6",                   group: "Attendance", note: "0–255." },
  { col: "no_show_count",        req: false, type: "Number",  example: "0",                   group: "Attendance", note: "Games missed without notice." },
  { col: "sandbagging_flag",     req: false, type: "Yes/No",  example: "0",                   group: "Review",  note: "Only set this if the committee already flagged the player." },
  { col: "committee_notes",      req: false, type: "Text",    example: "",                    group: "Review",  note: "Free text." },
];
export const COLUMN_KEYS = COLUMNS.map((c) => c.col);
export const REQUIRED = COLUMNS.filter((c) => c.req).map((c) => c.col);

export const DIVISIONS = { gold_open: "Gold Open", "45a": "45A", senior_b: "Senior B", senior_c: "Senior C", womens: "Women’s" };
export const CHAMPS = { winner: "Champion", runner_up: "Runner-up", participant: "Participant", none: "Sub / n/a" };

// Same spellings the server accepts.
export const ALIASES = {
  firstname: "first_name", fname: "first_name", given_name: "first_name", first: "first_name",
  lastname: "last_name", lname: "last_name", surname: "last_name", family_name: "last_name", last: "last_name",
  email_address: "email", emailaddress: "email", e_mail: "email",
  season: "season_year", year: "season_year", season_yr: "season_year",
  division: "division_played", div: "division_played", division_name: "division_played",
  tier: "skill_tier_reported", skill_tier: "skill_tier_reported", level: "skill_tier_reported",
  team: "team_name", team_colour: "team_name", team_color: "team_name",
  championship: "championship_result", result: "championship_result",
  captain: "was_captain", is_captain: "was_captain",
  alternate: "was_alternate", is_alternate: "was_alternate", is_sub: "was_alternate", sub: "was_alternate",
  scheduled: "games_scheduled", total_games: "games_scheduled",
  attended: "games_attended", games_played: "games_attended",
  no_shows: "no_show_count", noshows: "no_show_count", missed: "no_show_count",
  notes: "committee_notes", finish: "finish_position",
};

// ── Reading a file ────────────────────────────────────────────────────────────────────────────
export function stripBom(text) { return String(text).replace(/^﻿/, ""); }

export function detectDelimiter(text) {
  const t = stripBom(text);
  let inQ = false; const n = { ",": 0, ";": 0, "\t": 0 };
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '"') { if (inQ && t[i + 1] === '"') { i++; } else { inQ = !inQ; } continue; }
    if (!inQ && (c === "\n" || c === "\r")) { if (n[","] + n[";"] + n["\t"] > 0) break; else continue; }
    if (!inQ && c in n) { n[c]++; }
  }
  let best = ",";
  for (const d of [";", "\t"]) { if (n[d] > n[best]) best = d; }
  return best;
}

// RFC-4180-style parser: quoted fields may hold the delimiter, quotes ("") and line breaks. Blank lines are dropped.
export function parseDelimited(text, delim) {
  const t = stripBom(text);
  const rows = []; let row = []; let field = ""; let inQ = false; let any = false;
  const endField = () => { row.push(field); field = ""; };
  const endRow = () => { endField(); if (row.some((c) => String(c).trim() !== "")) rows.push(row); row = []; any = false; };
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQ) {
      if (c === '"') { if (t[i + 1] === '"') { field += '"'; i++; } else { inQ = false; } } else { field += c; }
      continue;
    }
    if (c === '"' && field === "") { inQ = true; any = true; continue; }
    if (c === delim) { endField(); any = true; continue; }
    if (c === "\r") { if (t[i + 1] === "\n") i++; endRow(); continue; }
    if (c === "\n") { endRow(); continue; }
    field += c; any = true;
  }
  if (any || field !== "" || row.length) endRow();
  return rows;
}

export function parseTable(text) {
  const delimiter = detectDelimiter(text);
  const all = parseDelimited(text, delimiter);
  if (!all.length) return { delimiter, headers: [], rows: [], rowCount: 0 };
  const headers = all[0].map((h) => String(h).trim());
  const width = headers.length;
  const rows = all.slice(1).map((r) => {
    const out = r.slice(0, width).map((c) => String(c).trim());
    while (out.length < width) out.push("");
    return out;
  });
  return { delimiter, headers, rows, rowCount: rows.length };
}

// ── Matching columns ──────────────────────────────────────────────────────────────────────────
export function normHeader(h) { return String(h || "").replace(/^﻿/, "").trim().toLowerCase().replace(/[\s\-]+/g, "_"); }

export function levenshtein(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

function guess(h) {
  const k = normHeader(h);
  if (COLUMN_KEYS.includes(k)) return { col: k, how: "exact" };
  if (ALIASES[k]) return { col: ALIASES[k], how: "alias" };
  let best = null;
  const pool = [...COLUMN_KEYS, ...Object.keys(ALIASES).filter((a) => a.length >= 5)];
  for (const cand of pool) {
    const d = levenshtein(k, cand);
    if (d <= 2 && k.length >= 5 && (!best || d < best.d)) best = { d, cand };
  }
  if (best) { const col = COLUMN_KEYS.includes(best.cand) ? best.cand : ALIASES[best.cand]; return { col, how: "fuzzy" }; }
  return { col: "", how: "none" };
}

// Returns one entry per file column: { index, raw, col, how, dup }. A canonical column is only used once (first wins).
export function autoMap(headers) {
  const used = new Set();
  return headers.map((raw, index) => {
    const g = guess(raw);
    if (g.col && used.has(g.col)) return { index, raw, col: "", how: "duplicate", dup: g.col };
    if (g.col) used.add(g.col);
    return { index, raw, col: g.col, how: g.how };
  });
}

// User picked a column in a dropdown. Setting a column that another file column already holds moves it.
export function setMapping(map, index, col) {
  return map.map((m) => {
    if (m.index === index) return { ...m, col, how: col ? "manual" : "none", dup: undefined };
    if (col && m.col === col) return { ...m, col: "", how: "none" };
    return m;
  });
}

export function missingRequired(map) { const have = new Set(map.map((m) => m.col).filter(Boolean)); return REQUIRED.filter((c) => !have.has(c)); }
export function needsReview(map) { return map.filter((m) => m.how === "fuzzy" || m.how === "duplicate"); }
export function unusedColumns(map) { return map.filter((m) => !m.col); }

// Canonical rows ({column: value}) in file order; blank rows are already gone, so row n here is data row n (line n + 1 in the sheet).
export function toRecords(parsed, map) {
  const use = map.filter((m) => m.col);
  return parsed.rows.map((r) => { const o = {}; for (const m of use) o[m.col] = (r[m.index] || "").trim(); return o; });
}

// ── Files we send / hand back ─────────────────────────────────────────────────────────────────
const needsQuote = /[",\r\n]/;
export function csvCell(v, guardFormulas) {
  let s = v === null || v === undefined ? "" : String(v);
  if (guardFormulas && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return needsQuote.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function toCSV(headers, rows, opts = {}) {
  return [headers, ...rows].map((r) => r.map((c) => csvCell(c, opts.guardFormulas)).join(",")).join("\r\n") + "\r\n";
}

// Rows with nothing in any matched column are dropped before sending (the server drops them too), so we keep the
// original position of each kept row. kept[n-1] is the index in parsed.rows of server data row n.
export function keptIndex(parsed, map) {
  const use = map.filter((m) => m.col);
  const kept = [];
  parsed.rows.forEach((r, i) => { if (use.some((m) => String(r[m.index] || "").trim() !== "")) kept.push(i); });
  return kept;
}
// Clean, canonical, UTF-8 comma CSV: only the columns we recognise, in our order.
export function canonicalCSV(parsed, map) {
  const use = COLUMN_KEYS.filter((c) => map.some((m) => m.col === c));
  const recs = toRecords(parsed, map);
  const kept = keptIndex(parsed, map);
  return toCSV(use, kept.map((i) => use.map((c) => recs[i][c])));
}
// Server line L (header is line 1) -> line number in the user's own sheet (header is line 1).
export function sheetLine(kept, serverLine) { const i = kept[serverLine - 2]; return i === undefined ? serverLine : i + 2; }

// The “fix-it” file: the original rows that were rejected, with a problem column up front.
export function errorReportCSV(parsed, problems, kept) {
  const byRow = new Map(); for (const p of problems) { byRow.set(p.row, (byRow.get(p.row) || []).concat(p.messages)); }
  const at = (k) => (kept ? kept[k - 1] : k - 1);
  const rows = [...byRow.keys()].sort((a, b) => a - b).map((k) => [byRow.get(k).join(" | "), ...(parsed.rows[at(k)] || [])]);
  return toCSV(["problem", ...parsed.headers], rows, { guardFormulas: true });
}
// server issue lines are numbered like the server numbers them: data row n = line n + 1
export function problemsFromRows(rows, issues) {
  const msgs = new Map();
  for (const x of issues || []) { if (x.level !== "error") continue; const r = x.line - 1; msgs.set(r, (msgs.get(r) || []).concat((x.field ? x.field + ": " : "") + x.message)); }
  return [...msgs.entries()].map(([row, messages]) => ({ row, messages }));
}

export function templateCSV() {
  const rows = [
    ["Mike", "Hartley", "m.hartley@email.com", "2025", "gold_open", "Team Red", "1", "winner", "1", "0", "0", "A2", "6", "6", "0", "0", ""],
    ["Janet", "Ruiz", "j.ruiz@email.com", "2025", "senior_c", "Team Blue", "2", "participant", "0", "0", "0", "C1", "6", "5", "1", "0", ""],
    ["Linda", "Tran", "l.tran@email.com", "2024", "45a", "Team Gold", "1", "winner", "1", "0", "0", "R3", "5", "5", "0", "0", ""],
  ];
  return toCSV(COLUMN_KEYS, rows);
}

// ── Numbers for the screen ────────────────────────────────────────────────────────────────────
export function countActions(rows) {
  const c = { insert: 0, update: 0, unchanged: 0, skip: 0, error: 0 };
  for (const r of rows || []) { if (c[r.action] !== undefined) c[r.action]++; }
  return c;
}

export function summaryBar(c) {
  const total = c.insert + c.update + c.unchanged + c.skip + c.error;
  const seg = [["insert", "New", c.insert], ["update", "Update", c.update], ["unchanged", "Unchanged", c.unchanged], ["skip", "Skipped", c.skip], ["error", "Problem", c.error]];
  return seg.map(([key, label, n]) => ({ key, label, n, pct: total ? Math.round((n / total) * 1000) / 10 : 0 }));
}

// One plain-English headline for a check result from the server.
export function verdict(res) {
  if (!res) return null;
  if (res.blocked) return { tone: "bad", headline: "Nothing will be imported", detail: res.message || "Some rows have problems and “stop on error” is on." };
  const w = (res.imported || 0) + (res.updated || 0);
  const errs = (res.rows || []).filter((r) => r.action === "error").length;
  if (!w && errs) return { tone: "bad", headline: "Nothing can be imported yet", detail: `${errs} row${errs === 1 ? "" : "s"} have problems. Download the fix-it file, correct them and upload again.` };
  if (!w) return { tone: "info", headline: "Nothing new to write", detail: "Every valid row is already on record (or identical to what is stored)." };
  if (errs) return { tone: "warn", headline: `${w} row${w === 1 ? "" : "s"} ready, ${errs} need fixing`, detail: "The problem rows will be skipped. You can import the rest now and fix those later." };
  return { tone: "ok", headline: `Ready to import ${w} row${w === 1 ? "" : "s"}`, detail: "Nothing has been written yet. Review the list, then import." };
}

export function impactLines(r) {
  const out = [];
  if (!r) return out;
  const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
  if (r.new_players) out.push({ key: "new_players", text: `${plural(r.new_players, "new player was", "new players were")} added to your player list.` });
  if (r.matched_players) out.push({ key: "matched", text: `${plural(r.matched_players, "player", "players")} matched an existing email, so their history now carries forward.` });
  if (r.new_seasons && r.new_seasons.length) out.push({ key: "seasons", text: `New season${r.new_seasons.length === 1 ? "" : "s"} on record: ${r.new_seasons.join(", ")}.` });
  if (r.tier_warnings) out.push({ key: "tier", text: `${plural(r.tier_warnings, "row shows", "rows show")} a high tier in a lower division (possible sandbagging). Review them in History.` });
  if (r.no_show_players) out.push({ key: "noshow", text: `${plural(r.no_show_players, "player has", "players have")} recorded no-shows.` });
  return out;
}

// Season × division grid for the coverage map. A gap is a season/division pair with no records, where that division has
// records in at least one other season.
export function coverageGrid(coverage) {
  const seasons = [...new Set((coverage || []).map((c) => c.season_year))].sort((a, b) => b - a);
  const keys = Object.keys(DIVISIONS);
  const divisions = keys.filter((d) => (coverage || []).some((c) => c.division === d));
  const cells = {}; let max = 0;
  for (const c of coverage || []) { cells[c.season_year + "|" + c.division] = c.n; if (c.n > max) max = c.n; }
  const gaps = [];
  for (const s of seasons) for (const d of divisions) { if (!cells[s + "|" + d]) gaps.push({ season: s, division: d }); }
  return { seasons, divisions, cells, max, gaps };
}
export function heat(n, max) { if (!n || !max) return 0; return Math.min(4, Math.max(1, Math.ceil((n / max) * 4))); }

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// "2026-11-17 14:31:00" → "Nov 17, 2026 · 2:31 pm" (read as written; no time-zone guessing)
export function fmtStamp(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s || ""));
  if (!m) return String(s || "");
  const h = +m[4]; const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]} · ${h12}:${m[5]} ${h < 12 ? "am" : "pm"}`;
}
export function fmtBytes(b) { if (b < 1024) return b + " B"; if (b < 1048576) return (b / 1024).toFixed(1) + " KB"; return (b / 1048576).toFixed(1) + " MB"; }
export function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }

export function fieldLabel(col) { return String(col || "").replace(/_/g, " "); }
export function diffText(change, col) {
  const show = (v) => (v === null || v === undefined || v === "" ? "empty" : String(v));
  return `${fieldLabel(col)}: ${show(change[0])} → ${show(change[1])}`;
}

// ── Reading bytes / writing records ───────────────────────────────────────────────────────────
// UTF-8 when valid; otherwise Windows-1252 (what older Excel on Windows saves as "CSV").
export function decodeBytes(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(u8); } catch (e) { return new TextDecoder("windows-1252").decode(u8); }
}

// Records from /history/records back into a file that can be imported again.
export function recordsCSV(records) {
  const b = (v) => (v === true || v === 1 || v === "1" ? "1" : "0");
  const rows = (records || []).map((r) => COLUMN_KEYS.map((c) => {
    if (["was_captain", "was_alternate", "was_emergency_goalie", "sandbagging_flag"].includes(c)) return b(r[c]);
    return r[c] === null || r[c] === undefined ? "" : r[c];
  }));
  return toCSV(COLUMN_KEYS, rows, { guardFormulas: true });
}
export function isCsvName(name) { return /\.(csv|txt)$/i.test(String(name || "")); }
export const MAX_BYTES = 5 * 1024 * 1024;

// Division spellings people actually type -> our keys. Unknown values come back unchanged.
export function normDivision(v) {
  const k = String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const m = { goldopen: "gold_open", gold: "gold_open", open: "gold_open", "45a": "45a", "45": "45a", seniorb: "senior_b", b: "senior_b", seniorc: "senior_c", c: "senior_c", womens: "womens", women: "womens", womans: "womens", ladies: "womens" };
  return m[k] || String(v || "");
}
