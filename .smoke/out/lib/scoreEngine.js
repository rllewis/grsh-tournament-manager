"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TYPES = exports.MAX_GAMES = exports.DEFAULT_OPTIONS = void 0;
exports.addMinutes = addMinutes;
exports.blankGame = blankGame;
exports.buildSeries = buildSeries;
exports.changeText = changeText;
exports.checkQueue = checkQueue;
exports.eventToGame = eventToGame;
exports.gameLabel = void 0;
exports.loadBatch = loadBatch;
exports.matchTeam = matchTeam;
exports.newUid = void 0;
exports.nextGameNo = nextGameNo;
exports.norm = void 0;
exports.parseDate = parseDate;
exports.parseSchedule = parseSchedule;
exports.parseTime = parseTime;
exports.prettyDate = prettyDate;
exports.prettyTime = prettyTime;
exports.printPayload = void 0;
exports.queueSummary = queueSummary;
exports.readiness = readiness;
exports.savePayload = void 0;
exports.sheetCount = sheetCount;
exports.sortGames = sortGames;
exports.teamOptions = teamOptions;
exports.typeLabel = void 0;
var _importEngine = require("./importEngine");
// Print Score Sheets — pure logic (no DOM, no fetch), so it can be tested on its own.

const TYPES = exports.TYPES = [{
  key: "REG",
  label: "Regular"
}, {
  key: "MAKEUP",
  label: "Makeup"
}, {
  key: "PLAYOFF",
  label: "Play-off"
}, {
  key: "CHAMP",
  label: "Championship"
}];
const typeLabel = k => (TYPES.find(t => t.key === k) || TYPES[0]).label;
exports.typeLabel = typeLabel;
const MAX_GAMES = exports.MAX_GAMES = 60;
const DEFAULT_OPTIONS = exports.DEFAULT_OPTIONS = {
  font: "normal",
  back: false,
  cover: false,
  spares: 0,
  order: "queue"
};
let seq = 0;
const newUid = () => "g" + Date.now().toString(36) + (seq++).toString(36);
exports.newUid = newUid;
function blankGame(over) {
  const g = {
    home_id: 0,
    away_id: 0,
    date: "",
    game_time: "",
    arena: "",
    game_no: "",
    type: "REG",
    ...(over || {})
  };
  if (!g.uid) g.uid = newUid();
  return g;
}

// ---- dates and times --------------------------------------------------------

const MONTHS = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12
};
const pad = n => String(n).padStart(2, "0");
const validYMD = (y, m, d) => {
  if (m < 1 || m > 12 || d < 1) return false;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= last;
};

// Accepts 2027-01-16, 1/16/2027, 1/16/27, Jan 16 2027, "Sat Jan 16, 2027". Returns YYYY-MM-DD or "".
function parseDate(s) {
  const t = String(s || "").trim();
  if (!t) return "";
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let y, mo, d;
  if (m) {
    y = +m[1];
    mo = +m[2];
    d = +m[3];
  } else if (m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)) {
    mo = +m[1];
    d = +m[2];
    y = +m[3];
    if (m[3].length === 2) y += 2000;
  } else if (m = t.match(/^(?:[A-Za-z]{3,9},?\s+)?([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/)) {
    mo = MONTHS[m[1].slice(0, 4).toLowerCase()] || MONTHS[m[1].slice(0, 3).toLowerCase()];
    d = +m[2];
    y = +m[3];
  } else return "";
  return mo && validYMD(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : "";
}

// Accepts 19:30, 7:30 PM, 7pm, 7:30pm. Returns HH:MM (24h) or "".
function parseTime(s) {
  const t = String(s || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return "";
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/);
  if (!m) return "";
  let h = +m[1];
  const mi = m[2] ? +m[2] : 0;
  if (mi > 59) return "";
  if (m[3]) {
    if (h < 1 || h > 12) return "";
    if (m[3] === "pm" && h < 12) h += 12;
    if (m[3] === "am" && h === 12) h = 0;
  } else if (h > 23) return "";
  return `${pad(h)}:${pad(mi)}`;
}
function addMinutes(hhmm, mins) {
  const t = parseTime(hhmm);
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, Math.max(0, h * 60 + m + Number(mins || 0)));
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}
function prettyTime(hhmm) {
  const t = parseTime(hhmm);
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h >= 12 ? "PM" : "AM"}`;
}
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function prettyDate(ymd) {
  const p = parseDate(ymd);
  if (!p) return "";
  const [y, m, d] = p.split("-").map(Number);
  return `${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${MON[m - 1]} ${d}, ${y}`;
}

// "7" -> "8", "G-12" -> "G-13", "" -> "1"? No: blank stays blank (the person has not numbered games).
function nextGameNo(s) {
  const t = String(s || "").trim();
  if (!t) return "";
  const m = t.match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return t;
  return m[1] + String(+m[2] + 1).padStart(m[2].length, "0") + m[3];
}

// ---- teams ------------------------------------------------------------------

const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
exports.norm = norm;
function teamOptions(teams, includeDraft) {
  return (teams || []).filter(t => includeDraft || t.type !== "draft").map(t => ({
    id: t.id,
    label: `${t.name} (${t.division_label || t.division})`,
    level: readiness(t).level
  })).sort((a, b) => a.label.localeCompare(b.label));
}
const RANK = {
  ok: 0,
  info: 1,
  warn: 2,
  bad: 3
};
// Worst warning on a team: "ok" | "info" | "warn" | "bad".
function readiness(team) {
  let level = "ok";
  for (const w of team && team.warnings || []) if (RANK[w.level] > RANK[level]) level = w.level;
  return {
    level,
    warnings: team && team.warnings || []
  };
}
function changeText(c) {
  if (!c) return "";
  const bits = [];
  if (c.added && c.added.length) bits.push("added " + c.added.join(", "));
  if (c.removed && c.removed.length) bits.push("removed " + c.removed.join(", "));
  if (c.jersey && c.jersey.length) bits.push("new number for " + c.jersey.join(", "));
  return bits.join("; ");
}

// Matches a pasted team name to a GRSH team. Exact (ignoring case and punctuation) first, then a single unambiguous partial.
// Blank / "TBD" / "?" mean the blank side (id 0). Returns { id, found }.
function matchTeam(name, teams) {
  const n = norm(name);
  if (!n || n === "tbd" || n === "blank" || n === "na") return {
    id: 0,
    found: true
  };
  const exact = (teams || []).filter(t => norm(t.name) === n);
  if (exact.length === 1) return {
    id: exact[0].id,
    found: true
  };
  if (exact.length > 1) return {
    id: 0,
    found: false,
    why: "more than one team is called that"
  };
  const part = (teams || []).filter(t => norm(t.name).includes(n) || n.length >= 4 && n.includes(norm(t.name)) && norm(t.name).length >= 4);
  if (part.length === 1) return {
    id: part[0].id,
    found: true
  };
  return {
    id: 0,
    found: false,
    why: part.length > 1 ? "matches " + part.length + " teams" : "no team with that name"
  };
}

// ---- pasted schedule --------------------------------------------------------

const HEAD = /^(date|day)\b/i;
const splitLine = line => {
  if (line.includes("\t")) return line.split("\t").map(x => x.trim());
  const out = [];
  let cur = "";
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;else if (ch === "," && !q) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
};

// Columns: date, time, home, away, arena, game #, type. A header row is skipped. Returns { games, problems }.
function parseSchedule(text, teams, defaults) {
  const def = defaults || {};
  const games = [];
  const problems = [];
  const lines = String(text || "").split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const c = splitLine(line);
    if (i === 0 && HEAD.test(c[0])) return;
    const n = i + 1;
    if (c.length < 4) {
      problems.push({
        line: n,
        text: line,
        reason: "needs at least date, time, home and away"
      });
      return;
    }
    const date = parseDate(c[0]);
    const time = parseTime(c[1]);
    if (!date) {
      problems.push({
        line: n,
        text: line,
        reason: "could not read the date \"" + c[0] + "\""
      });
      return;
    }
    if (c[1] && !time) {
      problems.push({
        line: n,
        text: line,
        reason: "could not read the time \"" + c[1] + "\""
      });
      return;
    }
    const home = matchTeam(c[2], teams);
    const away = matchTeam(c[3], teams);
    if (!home.found) {
      problems.push({
        line: n,
        text: line,
        reason: "home team \"" + c[2] + "\": " + home.why
      });
      return;
    }
    if (!away.found) {
      problems.push({
        line: n,
        text: line,
        reason: "away team \"" + c[3] + "\": " + away.why
      });
      return;
    }
    const rawType = String(c[6] || "").trim().toLowerCase();
    const type = TYPES.find(t => t.key.toLowerCase() === rawType || t.label.toLowerCase() === rawType);
    games.push(blankGame({
      home_id: home.id,
      away_id: away.id,
      date,
      game_time: time,
      arena: c[4] || def.arena || "",
      game_no: c[5] || "",
      type: type ? type.key : def.type || "REG"
    }));
  });
  return {
    games,
    problems
  };
}
function eventToGame(ev, type) {
  return blankGame({
    home_id: ev.home_id || 0,
    away_id: ev.away_id || 0,
    date: ev.date || "",
    game_time: ev.time || "",
    arena: ev.arena || "",
    game_no: "",
    type: type || "REG"
  });
}

// ---- series -----------------------------------------------------------------

// Adds `count` games on one date/arena, `gap` minutes apart, numbering from `firstNo`.
function buildSeries({
  count,
  date,
  start,
  gap,
  arena,
  firstNo,
  type
}) {
  const n = Math.max(0, Math.min(MAX_GAMES, Math.floor(Number(count) || 0)));
  const out = [];
  let no = firstNo || "";
  let time = parseTime(start);
  for (let i = 0; i < n; i++) {
    out.push(blankGame({
      date: parseDate(date),
      game_time: time,
      arena: arena || "",
      game_no: no,
      type: type || "REG"
    }));
    no = nextGameNo(no);
    time = time ? addMinutes(time, gap) : "";
  }
  return out;
}

// ---- checking the queue -----------------------------------------------------

// Problems for every game. level bad = will not print right, warn = check it, info = FYI.
function checkQueue(queue, teams) {
  const byId = {};
  (teams || []).forEach(t => {
    byId[t.id] = t;
  });
  const out = (queue || []).map(() => []);
  const slot = {};
  const nos = {};
  (queue || []).forEach((g, i) => {
    const add = (level, text) => out[i].push({
      level,
      text
    });
    for (const [side, id] of [["Home", g.home_id], ["Away", g.away_id]]) {
      if (id && !byId[id]) {
        add("bad", `${side} team is not on this season any more.`);
        continue;
      }
      const t = byId[id];
      if (t) for (const w of t.warnings || []) if (w.level !== "info") add(w.level, `${side}: ${t.name}: ${w.text}`);
      if (t && t.changed) add("warn", `${side}: ${t.name} changed since the last print (${changeText(t.changed)}).`);
    }
    if (g.home_id && g.home_id === g.away_id) add("bad", "Home and away are the same team.");
    if (!g.home_id && !g.away_id) add("info", "Blank sheet: both teams are filled in by hand.");
    if (!g.date) add("info", "No date.");
    if (g.game_no) (nos[g.game_no.toLowerCase()] = nos[g.game_no.toLowerCase()] || []).push(i);
    if (g.date && g.game_time) {
      for (const id of [g.home_id, g.away_id]) {
        if (!id) continue;
        const k = `${id}|${g.date}|${g.game_time}`;
        (slot[k] = slot[k] || []).push(i);
      }
      if (g.arena) {
        const k = `A|${g.arena.toLowerCase()}|${g.date}|${g.game_time}`;
        (slot[k] = slot[k] || []).push(i);
      }
    }
  });
  Object.keys(nos).forEach(k => {
    if (nos[k].length > 1) nos[k].forEach(i => out[i].push({
      level: "warn",
      text: `Game number ${queue[i].game_no} is used more than once.`
    }));
  });
  Object.keys(slot).forEach(k => {
    const rows = [...new Set(slot[k])];
    if (rows.length < 2) return;
    rows.forEach(i => out[i].push(k.startsWith("A|") ? {
      level: "warn",
      text: "Another game uses this arena at the same time."
    } : {
      level: "bad",
      text: "A team is in two games at the same time."
    }));
  });
  return out;
}
function queueSummary(queue, teams) {
  const checks = checkQueue(queue, teams);
  let bad = 0,
    warn = 0,
    blank = 0;
  checks.forEach(list => {
    if (list.some(x => x.level === "bad")) bad++;else if (list.some(x => x.level === "warn")) warn++;
  });
  (queue || []).forEach(g => {
    if (!g.home_id && !g.away_id) blank++;
  });
  const n = (queue || []).length;
  return {
    games: n,
    bad,
    warn,
    blank,
    ready: n > 0 && bad === 0,
    tooMany: n > MAX_GAMES,
    text: n === 0 ? "Nothing queued yet" : `${(0, _importEngine.plural)(n, "game")}${bad ? `, ${bad} to fix` : warn ? `, ${(0, _importEngine.plural)(warn, "to check", "to check")}` : ", all clear"}`
  };
}

// ---- print + saved batches --------------------------------------------------

const clean = g => ({
  home_id: Number(g.home_id) || 0,
  away_id: Number(g.away_id) || 0,
  date: g.date || "",
  game_time: g.game_time || "",
  arena: g.arena || "",
  game_no: g.game_no || "",
  type: g.type || "REG"
});
const printPayload = (queue, options) => ({
  matchups: JSON.stringify((queue || []).map(clean)),
  options: JSON.stringify({
    ...DEFAULT_OPTIONS,
    ...(options || {})
  })
});
exports.printPayload = printPayload;
const savePayload = (name, queue, options) => ({
  name: String(name || "").trim(),
  matchups: (queue || []).map(clean),
  options: {
    ...DEFAULT_OPTIONS,
    ...(options || {})
  }
});

// Loads a saved batch, dropping games whose teams are gone. Returns { games, dropped }.
exports.savePayload = savePayload;
function loadBatch(batch, teams) {
  const ids = new Set((teams || []).map(t => t.id));
  const games = [];
  let dropped = 0;
  for (const m of batch && batch.matchups || []) {
    if (m.home_id && !ids.has(m.home_id) || m.away_id && !ids.has(m.away_id)) {
      dropped++;
      continue;
    }
    games.push(blankGame(m));
  }
  return {
    games,
    dropped
  };
}
const gameLabel = (g, teams) => {
  const name = id => {
    const t = (teams || []).find(x => x.id === id);
    return t ? t.name : id ? "(removed team)" : "Blank";
  };
  return `${name(g.home_id)} vs ${name(g.away_id)}`;
};
exports.gameLabel = gameLabel;
function sortGames(list, order) {
  const items = list.map((g, i) => ({
    g,
    i
  }));
  const key = g => order === "arena" ? [(g.arena || "").toLowerCase(), g.date, g.game_time] : [g.date, g.game_time, (g.arena || "").toLowerCase()];
  if (order === "queue") return list.slice();
  items.sort((a, b) => {
    const ka = key(a.g),
      kb = key(b.g);
    for (let k = 0; k < 3; k++) {
      const x = ka[k] === "" ? "￿" : ka[k],
        y = kb[k] === "" ? "￿" : kb[k];
      if (x !== y) return x < y ? -1 : 1;
    }
    return a.i - b.i;
  });
  return items.map(x => x.g);
}
function sheetCount(queue, options) {
  const o = {
    ...DEFAULT_OPTIONS,
    ...(options || {})
  };
  const sheets = (queue || []).length + Number(o.spares || 0);
  return {
    sheets,
    pages: sheets * (o.back ? 2 : 1) + (o.cover && (queue || []).length ? 1 : 0)
  };
}