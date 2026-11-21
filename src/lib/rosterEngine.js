// rosterEngine.js — pure functions behind the Rosters board (no React, no network).
// Scores come from playerScoring.js so the board, the Draft page and the PHP gate agree.
import { computeScore } from "./playerScoring";

export const POS_LABEL = { goaltender: "Goalie", defenseman: "Defense", center: "Center", winger: "Wing" };
export const POS_SHORT = { goaltender: "G", defenseman: "D", center: "C", winger: "W" };

export const tierOf  = (p) => p.skill_tier_assigned || p.skill_tier_reported || "";
export const scoreOf = (p) => computeScore(tierOf(p), p.years_experience || 0, 0);
const effPos = (p) => (p.is_goalie ? "goaltender" : p.position || "");

// ── Team stats (same maths as GRSH_Scoring::relative_parity_score / parity_action) ──
export function teamStats(teams, MAX = 32) {
  const rows = teams.map((t) => {
    const sc = t.players.map(scoreOf);
    const raw = sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : null;
    return { id: t.id, n: sc.length, raw, norm: raw === null ? null : (raw / MAX) * 100, goalies: t.players.filter((p) => effPos(p) === "goaltender").length };
  });
  const withP = rows.filter((r) => r.raw !== null);
  const divRaw = withP.length ? withP.reduce((a, r) => a + r.raw, 0) / withP.length : null;
  rows.forEach((r) => {
    r.parity = r.raw === null || divRaw === null || divRaw <= 0 ? null : Math.max(0, Math.min(100, 80 - (Math.abs(r.raw - divRaw) / divRaw) * 60));
  });
  return { rows, divRaw };
}

export const bandOf = (par, th) =>
  par === null || par === undefined ? "none"
  : par < th.rebalance_low || par > th.rebalance_high ? "rebalance"
  : par < th.review_low || par > th.review_high ? "review" : "balanced";

export const spreadOf = (stats) => {
  const v = stats.rows.map((r) => r.norm).filter((x) => x !== null);
  return v.length ? Math.max(...v) - Math.min(...v) : 0;
};

// ── Slots: what a team still needs, shown as ghost slots ──
export function targetSize(cfg, teamCount, totalPlayers) {
  if (!teamCount) return cfg.min_roster;
  const even = Math.ceil(totalPlayers / teamCount);
  return Math.max(cfg.min_roster, Math.min(cfg.max_roster, even));
}

export function slotTemplate(cfg, target) {
  const slots = [];
  for (let i = 0; i < Math.max(1, cfg.goalie_min); i++) slots.push({ key: `G${i}`, pos: "goaltender", label: "Goalie" });
  for (let i = 0; i < 2; i++) slots.push({ key: `D${i}`, pos: "defenseman", label: "Defense" });
  slots.push({ key: "C0", pos: "center", label: "Center" });
  for (let i = 0; i < 2; i++) slots.push({ key: `W${i}`, pos: "winger", label: "Wing" });
  while (slots.length < target) slots.push({ key: `F${slots.length}`, pos: "", label: "Any position" });
  return slots;
}

// Put a team's players into the template: specific positions first, rest fill "any" slots, extras go after.
export function fillSlots(team, template) {
  const left = [...team.players].sort((a, b) => scoreOf(b) - scoreOf(a));
  const take = (pos) => { const i = left.findIndex((p) => effPos(p) === pos); return i >= 0 ? left.splice(i, 1)[0] : null; };
  const out = template.map((s) => ({ slot: s, player: s.pos ? take(s.pos) : null }));
  out.forEach((o) => { if (!o.player && !o.slot.pos && left.length) o.player = left.shift(); });
  // a required slot that is still empty may be covered by a leftover of any kind only in "any" slots (handled above)
  const extras = left.map((p, i) => ({ slot: { key: `X${i}`, pos: "", label: "Extra" }, player: p }));
  return [...out, ...extras];
}

// ── Pins ──
export function pinIndex(pins) {
  const together = pins.filter((p) => p.type === "together");
  const apart = new Map();
  pins.filter((p) => p.type === "apart").forEach((p) => {
    if (!apart.has(p.a)) apart.set(p.a, new Set());
    if (!apart.has(p.b)) apart.set(p.b, new Set());
    apart.get(p.a).add(p.b); apart.get(p.b).add(p.a);
  });
  const parent = new Map();
  const find = (x) => { if (!parent.has(x)) parent.set(x, x); while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  together.forEach((p) => { const a = find(p.a), b = find(p.b); if (a !== b) parent.set(a, b); });
  return { together, apart, find };
}

export function pinViolations(pins, teams) {
  const where = new Map();
  teams.forEach((t) => t.players.forEach((p) => where.set(p.id, t.id)));
  return pins.filter((p) => {
    const a = where.get(p.a), b = where.get(p.b);
    if (a === undefined || b === undefined) return false;
    return p.type === "together" ? a !== b : a === b;
  });
}

export const assignMap = (teams) => {
  const m = {};
  teams.forEach((t) => t.players.forEach((p) => { m[p.id] = t.id; }));
  return m;
};

/** moves that turn assignment `from` into `to` (maps of playerId→teamId; missing = pool). */
export function diffAssign(from, to) {
  const ids = new Set([...Object.keys(from), ...Object.keys(to)]);
  const moves = [];
  ids.forEach((k) => {
    const a = from[k] ?? null, b = to[k] ?? null;
    if (a !== b) moves.push({ player_id: Number(k), team_id: b });
  });
  return moves;
}

// ── Cost used by auto-balance and the swap finder ──
function costOf(buckets, ctx) {
  // buckets: [{ id, players }]
  const avgs = buckets.map((b) => (b.players.length ? b.players.reduce((s, p) => s + scoreOf(p), 0) / b.players.length : null));
  const have = avgs.filter((a) => a !== null);
  const mean = have.length ? have.reduce((a, b) => a + b, 0) / have.length : 0;
  let c = 0;
  avgs.forEach((a) => { if (a !== null) c += (a - mean) * (a - mean) * 10; });
  const where = new Map();
  buckets.forEach((b, i) => {
    const n = b.players.length;
    c += (n - ctx.target) * (n - ctx.target) * 0.6;
    if (n > ctx.max) c += (n - ctx.max) * 50;
    const g = b.players.filter((p) => effPos(p) === "goaltender").length;
    if (g < ctx.goalieMin) c += (ctx.goalieMin - g) * 400;
    if (g > ctx.goalieMax) c += (g - ctx.goalieMax) * 400;
    b.players.forEach((p) => where.set(p.id, i));
  });
  ["defenseman", "center", "winger"].forEach((pos) => {
    const counts = buckets.map((b) => b.players.filter((p) => effPos(p) === pos).length);
    const m = counts.reduce((a, b) => a + b, 0) / Math.max(1, counts.length);
    counts.forEach((x) => { c += (x - m) * (x - m) * 0.4; });
  });
  ctx.pins.forEach((p) => {
    const a = where.get(p.a), b = where.get(p.b);
    if (a === undefined || b === undefined) return;
    if (p.type === "together" && a !== b) c += 600;
    if (p.type === "apart" && a === b) c += 600;
  });
  return c;
}

const byIdAsc = (a, b) => a.id - b.id;

/**
 * Propose teams.
 *  mode "rebalance": every player on an unlocked team plus the pool can move.
 *  mode "fill":      only the pool moves; current rosters stay put.
 * Locked teams are never touched and never receive anyone.
 */
export function proposeBalance(teams, pool, pins, cfg, opts = {}) {
  const mode = opts.mode === "fill" ? "fill" : "rebalance";
  const MAX = opts.max || 32;
  const totalPlayers = pool.length + teams.reduce((s, t) => s + t.players.length, 0);
  const ctx = {
    target: opts.target || targetSize(cfg, teams.length, totalPlayers),
    max: cfg.max_roster, goalieMin: cfg.goalie_min, goalieMax: cfg.goalie_max, pins,
  };
  const open = teams.filter((t) => !t.locked);
  if (!open.length) return { moves: [], assignment: assignMap(teams), error: "Every team is locked." };

  const held = new Set(opts.locks || []);                       // players locked to their team
  const fixedFor = (t) => (t.locked || mode === "fill" ? t.players : t.players.filter((p) => held.has(p.id)));
  const movable = [
    ...pool,
    ...(mode === "rebalance" ? open.flatMap((t) => t.players.filter((p) => !held.has(p.id))) : []),
  ].sort(byIdAsc);
  const origin = new Map(); // playerId → current team id or null
  pool.forEach((p) => origin.set(p.id, null));
  teams.forEach((t) => t.players.forEach((p) => origin.set(p.id, t.id)));

  const buckets = teams.map((t) => ({ id: t.id, locked: t.locked, players: [...fixedFor(t)] }));
  const openBuckets = buckets.filter((b) => !b.locked);

  // units: together-groups stay as one block
  const idx = pinIndex(pins);
  const groups = new Map();
  movable.forEach((p) => {
    const root = idx.find(p.id);
    const inTogether = idx.together.some((x) => x.a === p.id || x.b === p.id);
    const key = inTogether ? `g${root}` : `p${p.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  });
  const units = [...groups.values()].sort((a, b) => {
    const ga = a.some((p) => effPos(p) === "goaltender") ? 1 : 0, gb = b.some((p) => effPos(p) === "goaltender") ? 1 : 0;
    if (ga !== gb) return gb - ga;
    const sa = a.reduce((s, p) => s + scoreOf(p), 0) / a.length, sb = b.reduce((s, p) => s + scoreOf(p), 0) / b.length;
    return sb - sa || a[0].id - b[0].id;
  });

  const apartOk = (bucket, unit) => unit.every((p) => {
    const set = idx.apart.get(p.id);
    return !set || !bucket.players.some((q) => set.has(q.id));
  });
  const total = (b) => b.players.reduce((s, p) => s + scoreOf(p), 0);

  units.forEach((unit) => {
    const hasG = unit.some((p) => effPos(p) === "goaltender");
    let cands = openBuckets.filter((b) => apartOk(b, unit) && b.players.length + unit.length <= Math.max(ctx.target, 1) + (hasG ? 1 : 0));
    if (!cands.length) cands = openBuckets.filter((b) => apartOk(b, unit));
    if (!cands.length) cands = openBuckets;
    if (hasG) {
      const needG = cands.filter((b) => b.players.filter((p) => effPos(p) === "goaltender").length < ctx.goalieMin);
      if (needG.length) cands = needG;
    }
    // LPT: strongest remaining unit goes to the team with the lowest running total (per player so sizes can differ)
    let best = null, bestCost = Infinity;
    cands.forEach((b) => {
      const mean = b.players.length ? total(b) / b.players.length : 0;
      const c = mean * 10 + b.players.length * 3;
      if (c < bestCost) { bestCost = c; best = b; }
    });
    best.players.push(...unit);
  });

  // local search: swaps and single moves between open buckets, accept only real improvements
  const lockedIds = new Set(); // players that may not move
  buckets.forEach((b) => fixedFor(teams.find((t) => t.id === b.id)).forEach((p) => lockedIds.add(p.id)));
  const current = () => costOf(buckets, ctx);
  let cost = current();
  for (let pass = 0; pass < 25; pass++) {
    let improved = false;
    for (let i = 0; i < openBuckets.length; i++) {
      for (let j = i + 1; j < openBuckets.length; j++) {
        const A = openBuckets[i], B = openBuckets[j];
        for (let x = 0; x < A.players.length; x++) {
          if (lockedIds.has(A.players[x].id)) continue;
          for (let y = 0; y < B.players.length; y++) {
            if (lockedIds.has(B.players[y].id)) continue;
            const pa = A.players[x], pb = B.players[y];
            A.players[x] = pb; B.players[y] = pa;
            const c = current();
            if (c < cost - 1e-9) { cost = c; improved = true; } else { A.players[x] = pa; B.players[y] = pb; }
          }
        }
      }
    }
    for (const A of openBuckets) {
      for (const B of openBuckets) {
        if (A === B) continue;
        for (let x = A.players.length - 1; x >= 0; x--) {
          const p = A.players[x];
          if (lockedIds.has(p.id)) continue;
          A.players.splice(x, 1); B.players.push(p);
          const c = current();
          if (c < cost - 1e-9) { cost = c; improved = true; } else { B.players.pop(); A.players.splice(x, 0, p); }
        }
      }
    }
    if (!improved) break;
  }

  const assignment = {};
  buckets.forEach((b) => b.players.forEach((p) => { assignment[p.id] = b.id; }));
  const moves = [];
  movable.forEach((p) => {
    const to = assignment[p.id] ?? null;
    if ((origin.get(p.id) ?? null) !== to) moves.push({ player: p, player_id: p.id, from: origin.get(p.id) ?? null, to });
  });
  const afterTeams = buckets.map((b) => ({ id: b.id, locked: b.locked, players: b.players }));
  return { moves, assignment, afterTeams, cost, mode, target: ctx.target };
}

/** Best single swaps between two different open teams. Returns up to `limit`, best first. */
export function findSwaps(teams, pins, cfg, opts = {}) {
  const limit = opts.limit || 5;
  const total = teams.reduce((s, t) => s + t.players.length, 0);
  const ctx = { target: targetSize(cfg, teams.length, total), max: cfg.max_roster, goalieMin: cfg.goalie_min, goalieMax: cfg.goalie_max, pins };
  const open = teams.filter((t) => !t.locked);
  const held = new Set(opts.locks || []);
  const baseBuckets = teams.map((t) => ({ id: t.id, players: [...t.players] }));
  const base = costOf(baseBuckets, ctx);
  const MAX = opts.max || 32;
  const spread = (bs) => spreadOf(teamStats(bs, MAX));
  const baseSpread = spread(baseBuckets);
  const out = [];
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      for (const pa of open[i].players) {
        if (held.has(pa.id)) continue;
        for (const pb of open[j].players) {
          if (held.has(pb.id)) continue;
          const bs = baseBuckets.map((b) => {
            if (b.id === open[i].id) return { id: b.id, players: b.players.map((p) => (p.id === pa.id ? pb : p)) };
            if (b.id === open[j].id) return { id: b.id, players: b.players.map((p) => (p.id === pb.id ? pa : p)) };
            return b;
          });
          const c = costOf(bs, ctx);
          const gain = base - c;
          if (gain > 0.05) out.push({ a: pa, b: pb, teamA: open[i].id, teamB: open[j].id, gain, spreadBefore: baseSpread, spreadAfter: spread(bs), samePos: effPos(pa) === effPos(pb) });
        }
      }
    }
  }
  return out.sort((x, y) => y.gain - x.gain || x.a.id - y.a.id || x.b.id - y.b.id).slice(0, limit);
}

/** What happens to the target team (and the one the player leaves) if `player` lands on `teamId`. */
export function projectMove(teams, player, teamId, MAX = 32) {
  const moved = teams.map((t) => ({
    ...t,
    players: t.id === teamId ? [...t.players.filter((p) => p.id !== player.id), player] : t.players.filter((p) => p.id !== player.id),
  }));
  const before = teamStats(teams, MAX), after = teamStats(moved, MAX);
  const row = (s, id) => s.rows.find((r) => r.id === id);
  return { before: row(before, teamId), after: row(after, teamId), stats: after, teams: moved };
}

/** Ranked suggestions for one team: fills required slots, pulls the team toward the division average, honours pins. */
export function suggestFor(team, teams, pool, pins, cfg, MAX = 32, limit = 3) {
  const stats = teamStats(teams, MAX);
  const target = stats.divRaw ?? 0;
  const tp = team.players, n = tp.length;
  const sum = tp.reduce((a, p) => a + scoreOf(p), 0);
  const cnt = (pos) => tp.filter((p) => effPos(p) === pos).length;
  const need = { goaltender: Math.max(0, cfg.goalie_min - cnt("goaltender")), defenseman: Math.max(0, 2 - cnt("defenseman")), center: Math.max(0, 1 - cnt("center")), winger: Math.max(0, 2 - cnt("winger")) };
  const idx = pinIndex(pins);
  const onTeam = new Set(tp.map((p) => p.id));
  return pool.map((p) => {
    const pos = effPos(p), reasons = []; let fit = 0;
    if (idx.apart.get(p.id) && [...idx.apart.get(p.id)].some((q) => onTeam.has(q))) return { player: p, fit: -1e6, reasons: ["Keep-apart rule with someone on this team"], blocked: true };
    if (pos === "goaltender" && cnt("goaltender") >= cfg.goalie_max) return { player: p, fit: -1e5, reasons: ["Team already has its maximum goalies"], blocked: true };
    if (need[pos] > 0) { fit += pos === "goaltender" ? 30 : 8; reasons.push(`Fills an open ${POS_LABEL[pos].toLowerCase()} spot`); }
    else if (pos) { fit -= 4; }
    if (idx.together.some((x) => (x.a === p.id && onTeam.has(x.b)) || (x.b === p.id && onTeam.has(x.a)))) { fit += 12; reasons.push("Keep-together partner is on this team"); }
    if (n > 0) {
      const gain = Math.abs(sum / n - target) - Math.abs((sum + scoreOf(p)) / (n + 1) - target);
      fit += gain * 4;
      if (gain > 0.3) reasons.push("Moves the team toward the division average");
      else if (gain < -0.3) reasons.push("Pulls the team away from the division average");
    } else { fit += scoreOf(p) * 0.1; }
    if (!reasons.length) reasons.push(`Score ${scoreOf(p).toFixed(1)}`);
    return { player: p, fit, reasons };
  }).filter((x) => !x.blocked).sort((a, b) => b.fit - a.fit || a.player.id - b.player.id).slice(0, limit);
}

/** Live health per team (0-100) with plain-language issues. Server gate stays the source of truth for publishing. */
export function teamHealth(team, teams, pins, cfg, th, MAX = 32) {
  if (!team.players.length) return { score: null, issues: [] };
  const stats = teamStats(teams, MAX);
  const row = stats.rows.find((r) => r.id === team.id);
  const issues = [];
  const goalies = row.goalies;
  const cnt = (pos) => team.players.filter((p) => effPos(p) === pos).length;
  if (goalies < cfg.goalie_min) issues.push("Needs a goalie");
  if (goalies > cfg.goalie_max) issues.push(`More than ${cfg.goalie_max} goalies`);
  if (cnt("defenseman") < 2) issues.push("Needs 2+ defense");
  if (cnt("center") < 1) issues.push("Needs a center");
  if (cnt("winger") < 2) issues.push("Needs 2+ wings");
  if (team.players.length < cfg.min_roster) issues.push(`Below ${cfg.min_roster}-player minimum`);
  if (team.players.length > cfg.max_roster) issues.push(`Above ${cfg.max_roster}-player maximum`);
  const unpaid = team.players.filter((p) => p.payment_status !== "paid").length;
  const flags = team.players.filter((p) => p.sandbagging_flag).length;
  if (unpaid) issues.push(`${unpaid} unpaid`);
  if (flags) issues.push(`${flags} sandbagging flag${flags > 1 ? "s" : ""}`);
  const band = bandOf(row.parity, th);
  if (band !== "balanced" && band !== "none") issues.push(`Balance: ${band}`);
  pinViolations(pins, [team]).forEach(() => {}); // pins are cross-team; reported at board level
  const posOk = cnt("defenseman") >= 2 && cnt("center") >= 1 && cnt("winger") >= 2;
  const score = Math.round(
    (row.parity === null ? 50 : Math.min(100, (row.parity / 80) * 100)) * 0.3 +
    (goalies >= cfg.goalie_min && goalies <= cfg.goalie_max ? 100 : 0) * 0.2 +
    (posOk ? 100 : 40) * 0.25 +
    (1 - unpaid / team.players.length) * 100 * 0.15 +
    (1 - flags / team.players.length) * 100 * 0.1
  );
  return { score, issues, band };
}

// ───────────────────────── v4 additions ─────────────────────────

// Tab label: what the numbers mean, and nothing at all when a division has no players.
export function divisionTabLabel(d) {
  if (!d || !d.total) return { text: "no players", muted: true, title: "No players are registered in this division yet." };
  return { text: `${d.assigned} of ${d.total} placed`, muted: false, title: `${d.assigned} of ${d.total} players are on a team (${d.pct}%).` };
}

// Per-team position counts against what the division needs. Only goalies have a configured minimum; the others warn when empty.
export function positionNeeds(team, cfg) {
  const n = { goaltender: 0, defenseman: 0, center: 0, winger: 0 };
  (team.players || []).forEach((p) => { const k = effPos(p); if (n[k] !== undefined) n[k]++; });
  const total = (team.players || []).length;
  const gMin = Math.max(1, cfg.goalie_min || 1), gMax = cfg.goalie_max || gMin;
  const row = (pos, tone, need) => ({ pos, short: POS_SHORT[pos], label: POS_LABEL[pos], have: n[pos], need, tone });
  return [
    row("goaltender", n.goaltender < gMin ? "bad" : n.goaltender > gMax ? "warn" : "ok", `${gMin}${gMax > gMin ? `-${gMax}` : ""}`),
    ...["defenseman", "center", "winger"].map((pos) => row(pos, total >= 4 && n[pos] === 0 ? "warn" : "ok", "")),
  ];
}

// One plain sentence for why a swap helps.
export function explainSwap(s, teams, MAX = 32) {
  const st = teamStats(teams, MAX); const get = (id) => st.rows.find((r) => r.id === id);
  const a = get(s.teamA), b = get(s.teamB); const nm = (id) => (teams.find((t) => t.id === id) || {}).name || "?";
  if (!a || !b || a.raw === null || b.raw === null) return "";
  const hi = a.raw >= b.raw ? { id: s.teamA, r: a, give: s.a, get: s.b } : { id: s.teamB, r: b, give: s.b, get: s.a };
  const lo = hi.id === s.teamA ? { id: s.teamB, r: b } : { id: s.teamA, r: a };
  const diff = Math.abs(scoreOf(hi.give) - scoreOf(hi.get));
  return `${nm(hi.id)} averages ${hi.r.raw.toFixed(1)} and ${nm(lo.id)} ${lo.r.raw.toFixed(1)}. This moves ${diff.toFixed(1)} score points of strength from ${nm(hi.id)} to ${nm(lo.id)}.`;
}

// Compare two assignments (player id -> team id; missing = pool). Used for "plan vs now" and "plan vs plan".
export function comparePlans(from, to, byId, teams, MAX = 32) {
  const moves = [];
  const ids = new Set([...Object.keys(from || {}), ...Object.keys(to || {})].map(Number));
  ids.forEach((id) => {
    const a = (from || {})[id] ?? null, b = (to || {})[id] ?? null;
    if (a !== b && byId.get(id)) moves.push({ player: byId.get(id), from: a, to: b });
  });
  const build = (asg) => {
    const all = [...byId.values()];
    return teams.map((t) => ({ ...t, players: all.filter((p) => (asg || {})[p.id] === t.id) }));
  };
  const spread = (asg) => spreadOf(teamStats(build(asg), MAX));
  moves.sort((x, y) => scoreOf(y.player) - scoreOf(x.player) || x.player.id - y.player.id);
  return { moves, spreadFrom: spread(from), spreadTo: spread(to) };
}

// Current rosters as an assignment map, so a plan can be compared with "now".
export const currentAssign = (teams) => { const m = {}; teams.forEach((t) => t.players.forEach((p) => { m[p.id] = t.id; })); return m; };

// Next free team names: "Team A", "Team B"... skipping names already used (case-insensitive).
export function plannedTeamNames(existing, count) {
  const used = new Set((existing || []).map((n) => String(n).trim().toLowerCase()));
  const out = []; let i = 0;
  while (out.length < count && i < 702) {
    const letters = i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26));
    const name = `Team ${letters}`; i++;
    if (!used.has(name.toLowerCase())) out.push(name);
  }
  return out;
}

// What blocks publishing, with the one thing to press to fix it.
const FIX = {
  teams: { act: "newteams", label: "Add teams" }, goalies: { act: "balance", label: "Fill goalies" }, locked: { act: "lockall", label: "Lock all teams" },
  pool: { act: "balance", label: "Auto-balance" }, min: { act: "balance", label: "Auto-balance" }, max: { act: "balance", label: "Auto-balance" },
  parity: { act: "swaps", label: "Find swaps" }, pins: { act: "swaps", label: "Find swaps" },
};
export function blockers(gate) {
  return (gate || []).filter((g) => g.level === "fail").map((g) => ({ key: g.key, text: g.text, fix: FIX[g.key] || null }));
}
export function warnings(gate) {
  return (gate || []).filter((g) => g.level === "warn").map((g) => ({ key: g.key, text: g.text, fix: FIX[g.key] || null }));
}

// Why a control is switched off ("" when it is on).
export function whyDisabled(kind, { readOnly, teams, undo }) {
  if (readOnly) return "Editing is off while the draft is running or rosters are published.";
  if (kind === "balance" && !teams) return "Add a team first.";
  if (kind === "swaps" && teams < 2) return "Needs at least two teams.";
  if (kind === "undo" && !undo) return "Nothing to undo yet.";
  return "";
}

export const KEY_ITEMS = [
  { mark: "●", label: "Red dot", text: "Payment not marked paid." },
  { mark: "B2", label: "Tier chip", text: "Skill tier (A, B, C, then R for recreational), with its level." },
  { mark: "13.0", label: "Number", text: "Player score: tier plus years played." },
  { mark: "R1", label: "Purple chip", text: "Returning player, with seasons played." },
  { mark: "⚑", label: "Flag", text: "Sandbagging flag to review." },
  { mark: "🔒", label: "Lock", text: "Locked to this team: auto-balance and swaps leave them here, and moving them by hand is blocked." },
  { mark: "📌", label: "Pin", text: "Has a keep-together or keep-apart rule." },
  { mark: "C", label: "Gold C", text: "Team captain." },
];


// ── v5: per-player locks and the rules summary ──
/**
 * One row per player who has any lock, rule or role that limits where they can go.
 * Rows: { player, teamId, teamName, held, teamLocked, captain, rules:[{type, other, met, otherTeam}], broken }
 * Players who only sit on a locked team are counted in `onLockedTeams`, not listed.
 */
export function lockSummary(teams, pins, locks, byId) {
  const where = new Map(), name = new Map(), tl = new Map();
  teams.forEach((t) => { name.set(t.id, t.name); tl.set(t.id, !!t.locked); t.players.forEach((p) => where.set(p.id, t.id)); });
  const held = new Set(locks || []);
  const rows = new Map();
  const row = (id) => {
    if (!rows.has(id)) {
      const player = byId.get(id); if (!player) return null;
      const tid = where.has(id) ? where.get(id) : null;
      rows.set(id, { player, teamId: tid, teamName: tid === null ? "Unassigned" : name.get(tid), held: false, teamLocked: tid !== null && tl.get(tid), captain: false, rules: [], broken: 0 });
    }
    return rows.get(id);
  };
  held.forEach((id) => { const r = row(id); if (r) r.held = true; });
  teams.forEach((t) => { if (t.captain_player_id) { const r = row(t.captain_player_id); if (r) r.captain = true; } });
  (pins || []).forEach((x) => {
    [[x.a, x.b], [x.b, x.a]].forEach(([me, other]) => {
      const r = row(me); const o = byId.get(other); if (!r || !o) return;
      const ta = where.has(me) ? where.get(me) : null, tb = where.has(other) ? where.get(other) : null;
      const placed = ta !== null && tb !== null;
      const met = !placed ? null : x.type === "together" ? ta === tb : ta !== tb;
      r.rules.push({ type: x.type, other: o, met, otherTeam: tb === null ? "Unassigned" : name.get(tb) });
      if (met === false) r.broken++;
    });
  });
  const list = [...rows.values()].sort((a, b) => (b.broken - a.broken) || (Number(b.held) - Number(a.held)) || String(a.player.last_name).localeCompare(String(b.player.last_name)));
  const onLockedTeams = teams.filter((t) => t.locked).reduce((n, t) => n + t.players.length, 0);
  return { rows: list, held: list.filter((r) => r.held).length, ruled: list.filter((r) => r.rules.length).length, broken: pinViolations(pins || [], teams).length, captains: list.filter((r) => r.captain).length, onLockedTeams };
}

/** Why a move would be refused because of a player lock; null when allowed. */
export function lockBlock(playerId, toTeamId, teams, locks) {
  if (!(locks || []).includes(playerId)) return null;
  const cur = teams.find((t) => t.players.some((p) => p.id === playerId));
  if (!cur || cur.id === toTeamId) return null;
  return `Locked to ${cur.name}. Unlock the player first.`;
}
