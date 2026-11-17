"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.bandOf = exports.assignMap = exports.POS_SHORT = exports.POS_LABEL = void 0;
exports.diffAssign = diffAssign;
exports.fillSlots = fillSlots;
exports.findSwaps = findSwaps;
exports.pinIndex = pinIndex;
exports.pinViolations = pinViolations;
exports.projectMove = projectMove;
exports.proposeBalance = proposeBalance;
exports.scoreOf = void 0;
exports.slotTemplate = slotTemplate;
exports.spreadOf = void 0;
exports.suggestFor = suggestFor;
exports.targetSize = targetSize;
exports.teamHealth = teamHealth;
exports.teamStats = teamStats;
exports.tierOf = void 0;
var _playerScoring = require("./playerScoring");
// rosterEngine.js — pure functions behind the Rosters board (no React, no network).
// Scores come from playerScoring.js so the board, the Draft page and the PHP gate agree.

const POS_LABEL = exports.POS_LABEL = {
  goaltender: "Goalie",
  defenseman: "Defense",
  center: "Center",
  winger: "Wing"
};
const POS_SHORT = exports.POS_SHORT = {
  goaltender: "G",
  defenseman: "D",
  center: "C",
  winger: "W"
};
const tierOf = p => p.skill_tier_assigned || p.skill_tier_reported || "";
exports.tierOf = tierOf;
const scoreOf = p => (0, _playerScoring.computeScore)(tierOf(p), p.years_experience || 0, 0);
exports.scoreOf = scoreOf;
const effPos = p => p.is_goalie ? "goaltender" : p.position || "";

// ── Team stats (same maths as GRSH_Scoring::relative_parity_score / parity_action) ──
function teamStats(teams, MAX = 32) {
  const rows = teams.map(t => {
    const sc = t.players.map(scoreOf);
    const raw = sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : null;
    return {
      id: t.id,
      n: sc.length,
      raw,
      norm: raw === null ? null : raw / MAX * 100,
      goalies: t.players.filter(p => effPos(p) === "goaltender").length
    };
  });
  const withP = rows.filter(r => r.raw !== null);
  const divRaw = withP.length ? withP.reduce((a, r) => a + r.raw, 0) / withP.length : null;
  rows.forEach(r => {
    r.parity = r.raw === null || divRaw === null || divRaw <= 0 ? null : Math.max(0, Math.min(100, 80 - Math.abs(r.raw - divRaw) / divRaw * 60));
  });
  return {
    rows,
    divRaw
  };
}
const bandOf = (par, th) => par === null || par === undefined ? "none" : par < th.rebalance_low || par > th.rebalance_high ? "rebalance" : par < th.review_low || par > th.review_high ? "review" : "balanced";
exports.bandOf = bandOf;
const spreadOf = stats => {
  const v = stats.rows.map(r => r.norm).filter(x => x !== null);
  return v.length ? Math.max(...v) - Math.min(...v) : 0;
};

// ── Slots: what a team still needs, shown as ghost slots ──
exports.spreadOf = spreadOf;
function targetSize(cfg, teamCount, totalPlayers) {
  if (!teamCount) return cfg.min_roster;
  const even = Math.ceil(totalPlayers / teamCount);
  return Math.max(cfg.min_roster, Math.min(cfg.max_roster, even));
}
function slotTemplate(cfg, target) {
  const slots = [];
  for (let i = 0; i < Math.max(1, cfg.goalie_min); i++) slots.push({
    key: `G${i}`,
    pos: "goaltender",
    label: "Goalie"
  });
  for (let i = 0; i < 2; i++) slots.push({
    key: `D${i}`,
    pos: "defenseman",
    label: "Defense"
  });
  slots.push({
    key: "C0",
    pos: "center",
    label: "Center"
  });
  for (let i = 0; i < 2; i++) slots.push({
    key: `W${i}`,
    pos: "winger",
    label: "Wing"
  });
  while (slots.length < target) slots.push({
    key: `F${slots.length}`,
    pos: "",
    label: "Any position"
  });
  return slots;
}

// Put a team's players into the template: specific positions first, rest fill "any" slots, extras go after.
function fillSlots(team, template) {
  const left = [...team.players].sort((a, b) => scoreOf(b) - scoreOf(a));
  const take = pos => {
    const i = left.findIndex(p => effPos(p) === pos);
    return i >= 0 ? left.splice(i, 1)[0] : null;
  };
  const out = template.map(s => ({
    slot: s,
    player: s.pos ? take(s.pos) : null
  }));
  out.forEach(o => {
    if (!o.player && !o.slot.pos && left.length) o.player = left.shift();
  });
  // a required slot that is still empty may be covered by a leftover of any kind only in "any" slots (handled above)
  const extras = left.map((p, i) => ({
    slot: {
      key: `X${i}`,
      pos: "",
      label: "Extra"
    },
    player: p
  }));
  return [...out, ...extras];
}

// ── Pins ──
function pinIndex(pins) {
  const together = pins.filter(p => p.type === "together");
  const apart = new Map();
  pins.filter(p => p.type === "apart").forEach(p => {
    if (!apart.has(p.a)) apart.set(p.a, new Set());
    if (!apart.has(p.b)) apart.set(p.b, new Set());
    apart.get(p.a).add(p.b);
    apart.get(p.b).add(p.a);
  });
  const parent = new Map();
  const find = x => {
    if (!parent.has(x)) parent.set(x, x);
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  together.forEach(p => {
    const a = find(p.a),
      b = find(p.b);
    if (a !== b) parent.set(a, b);
  });
  return {
    together,
    apart,
    find
  };
}
function pinViolations(pins, teams) {
  const where = new Map();
  teams.forEach(t => t.players.forEach(p => where.set(p.id, t.id)));
  return pins.filter(p => {
    const a = where.get(p.a),
      b = where.get(p.b);
    if (a === undefined || b === undefined) return false;
    return p.type === "together" ? a !== b : a === b;
  });
}
const assignMap = teams => {
  const m = {};
  teams.forEach(t => t.players.forEach(p => {
    m[p.id] = t.id;
  }));
  return m;
};

/** moves that turn assignment `from` into `to` (maps of playerId→teamId; missing = pool). */
exports.assignMap = assignMap;
function diffAssign(from, to) {
  const ids = new Set([...Object.keys(from), ...Object.keys(to)]);
  const moves = [];
  ids.forEach(k => {
    const a = from[k] ?? null,
      b = to[k] ?? null;
    if (a !== b) moves.push({
      player_id: Number(k),
      team_id: b
    });
  });
  return moves;
}

// ── Cost used by auto-balance and the swap finder ──
function costOf(buckets, ctx) {
  // buckets: [{ id, players }]
  const avgs = buckets.map(b => b.players.length ? b.players.reduce((s, p) => s + scoreOf(p), 0) / b.players.length : null);
  const have = avgs.filter(a => a !== null);
  const mean = have.length ? have.reduce((a, b) => a + b, 0) / have.length : 0;
  let c = 0;
  avgs.forEach(a => {
    if (a !== null) c += (a - mean) * (a - mean) * 10;
  });
  const where = new Map();
  buckets.forEach((b, i) => {
    const n = b.players.length;
    c += (n - ctx.target) * (n - ctx.target) * 0.6;
    if (n > ctx.max) c += (n - ctx.max) * 50;
    const g = b.players.filter(p => effPos(p) === "goaltender").length;
    if (g < ctx.goalieMin) c += (ctx.goalieMin - g) * 400;
    if (g > ctx.goalieMax) c += (g - ctx.goalieMax) * 400;
    b.players.forEach(p => where.set(p.id, i));
  });
  ["defenseman", "center", "winger"].forEach(pos => {
    const counts = buckets.map(b => b.players.filter(p => effPos(p) === pos).length);
    const m = counts.reduce((a, b) => a + b, 0) / Math.max(1, counts.length);
    counts.forEach(x => {
      c += (x - m) * (x - m) * 0.4;
    });
  });
  ctx.pins.forEach(p => {
    const a = where.get(p.a),
      b = where.get(p.b);
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
function proposeBalance(teams, pool, pins, cfg, opts = {}) {
  const mode = opts.mode === "fill" ? "fill" : "rebalance";
  const MAX = opts.max || 32;
  const totalPlayers = pool.length + teams.reduce((s, t) => s + t.players.length, 0);
  const ctx = {
    target: opts.target || targetSize(cfg, teams.length, totalPlayers),
    max: cfg.max_roster,
    goalieMin: cfg.goalie_min,
    goalieMax: cfg.goalie_max,
    pins
  };
  const open = teams.filter(t => !t.locked);
  if (!open.length) return {
    moves: [],
    assignment: assignMap(teams),
    error: "Every team is locked."
  };
  const fixedFor = t => t.locked || mode === "fill" ? t.players : [];
  const movable = [...pool, ...(mode === "rebalance" ? open.flatMap(t => t.players) : [])].sort(byIdAsc);
  const origin = new Map(); // playerId → current team id or null
  pool.forEach(p => origin.set(p.id, null));
  teams.forEach(t => t.players.forEach(p => origin.set(p.id, t.id)));
  const buckets = teams.map(t => ({
    id: t.id,
    locked: t.locked,
    players: [...fixedFor(t)]
  }));
  const openBuckets = buckets.filter(b => !b.locked);

  // units: together-groups stay as one block
  const idx = pinIndex(pins);
  const groups = new Map();
  movable.forEach(p => {
    const root = idx.find(p.id);
    const inTogether = idx.together.some(x => x.a === p.id || x.b === p.id);
    const key = inTogether ? `g${root}` : `p${p.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  });
  const units = [...groups.values()].sort((a, b) => {
    const ga = a.some(p => effPos(p) === "goaltender") ? 1 : 0,
      gb = b.some(p => effPos(p) === "goaltender") ? 1 : 0;
    if (ga !== gb) return gb - ga;
    const sa = a.reduce((s, p) => s + scoreOf(p), 0) / a.length,
      sb = b.reduce((s, p) => s + scoreOf(p), 0) / b.length;
    return sb - sa || a[0].id - b[0].id;
  });
  const apartOk = (bucket, unit) => unit.every(p => {
    const set = idx.apart.get(p.id);
    return !set || !bucket.players.some(q => set.has(q.id));
  });
  const total = b => b.players.reduce((s, p) => s + scoreOf(p), 0);
  units.forEach(unit => {
    const hasG = unit.some(p => effPos(p) === "goaltender");
    let cands = openBuckets.filter(b => apartOk(b, unit) && b.players.length + unit.length <= Math.max(ctx.target, 1) + (hasG ? 1 : 0));
    if (!cands.length) cands = openBuckets.filter(b => apartOk(b, unit));
    if (!cands.length) cands = openBuckets;
    if (hasG) {
      const needG = cands.filter(b => b.players.filter(p => effPos(p) === "goaltender").length < ctx.goalieMin);
      if (needG.length) cands = needG;
    }
    // LPT: strongest remaining unit goes to the team with the lowest running total (per player so sizes can differ)
    let best = null,
      bestCost = Infinity;
    cands.forEach(b => {
      const mean = b.players.length ? total(b) / b.players.length : 0;
      const c = mean * 10 + b.players.length * 3;
      if (c < bestCost) {
        bestCost = c;
        best = b;
      }
    });
    best.players.push(...unit);
  });

  // local search: swaps and single moves between open buckets, accept only real improvements
  const lockedIds = new Set(); // players that may not move
  buckets.forEach(b => fixedFor(teams.find(t => t.id === b.id)).forEach(p => lockedIds.add(p.id)));
  const current = () => costOf(buckets, ctx);
  let cost = current();
  for (let pass = 0; pass < 25; pass++) {
    let improved = false;
    for (let i = 0; i < openBuckets.length; i++) {
      for (let j = i + 1; j < openBuckets.length; j++) {
        const A = openBuckets[i],
          B = openBuckets[j];
        for (let x = 0; x < A.players.length; x++) {
          if (lockedIds.has(A.players[x].id)) continue;
          for (let y = 0; y < B.players.length; y++) {
            if (lockedIds.has(B.players[y].id)) continue;
            const pa = A.players[x],
              pb = B.players[y];
            A.players[x] = pb;
            B.players[y] = pa;
            const c = current();
            if (c < cost - 1e-9) {
              cost = c;
              improved = true;
            } else {
              A.players[x] = pa;
              B.players[y] = pb;
            }
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
          A.players.splice(x, 1);
          B.players.push(p);
          const c = current();
          if (c < cost - 1e-9) {
            cost = c;
            improved = true;
          } else {
            B.players.pop();
            A.players.splice(x, 0, p);
          }
        }
      }
    }
    if (!improved) break;
  }
  const assignment = {};
  buckets.forEach(b => b.players.forEach(p => {
    assignment[p.id] = b.id;
  }));
  const moves = [];
  movable.forEach(p => {
    const to = assignment[p.id] ?? null;
    if ((origin.get(p.id) ?? null) !== to) moves.push({
      player: p,
      player_id: p.id,
      from: origin.get(p.id) ?? null,
      to
    });
  });
  const afterTeams = buckets.map(b => ({
    id: b.id,
    locked: b.locked,
    players: b.players
  }));
  return {
    moves,
    assignment,
    afterTeams,
    cost,
    mode,
    target: ctx.target
  };
}

/** Best single swaps between two different open teams. Returns up to `limit`, best first. */
function findSwaps(teams, pins, cfg, opts = {}) {
  const limit = opts.limit || 5;
  const total = teams.reduce((s, t) => s + t.players.length, 0);
  const ctx = {
    target: targetSize(cfg, teams.length, total),
    max: cfg.max_roster,
    goalieMin: cfg.goalie_min,
    goalieMax: cfg.goalie_max,
    pins
  };
  const open = teams.filter(t => !t.locked);
  const baseBuckets = teams.map(t => ({
    id: t.id,
    players: [...t.players]
  }));
  const base = costOf(baseBuckets, ctx);
  const MAX = opts.max || 32;
  const spread = bs => spreadOf(teamStats(bs, MAX));
  const baseSpread = spread(baseBuckets);
  const out = [];
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      for (const pa of open[i].players) {
        for (const pb of open[j].players) {
          const bs = baseBuckets.map(b => {
            if (b.id === open[i].id) return {
              id: b.id,
              players: b.players.map(p => p.id === pa.id ? pb : p)
            };
            if (b.id === open[j].id) return {
              id: b.id,
              players: b.players.map(p => p.id === pb.id ? pa : p)
            };
            return b;
          });
          const c = costOf(bs, ctx);
          const gain = base - c;
          if (gain > 0.05) out.push({
            a: pa,
            b: pb,
            teamA: open[i].id,
            teamB: open[j].id,
            gain,
            spreadBefore: baseSpread,
            spreadAfter: spread(bs),
            samePos: effPos(pa) === effPos(pb)
          });
        }
      }
    }
  }
  return out.sort((x, y) => y.gain - x.gain || x.a.id - y.a.id || x.b.id - y.b.id).slice(0, limit);
}

/** What happens to the target team (and the one the player leaves) if `player` lands on `teamId`. */
function projectMove(teams, player, teamId, MAX = 32) {
  const moved = teams.map(t => ({
    ...t,
    players: t.id === teamId ? [...t.players.filter(p => p.id !== player.id), player] : t.players.filter(p => p.id !== player.id)
  }));
  const before = teamStats(teams, MAX),
    after = teamStats(moved, MAX);
  const row = (s, id) => s.rows.find(r => r.id === id);
  return {
    before: row(before, teamId),
    after: row(after, teamId),
    stats: after,
    teams: moved
  };
}

/** Ranked suggestions for one team: fills required slots, pulls the team toward the division average, honours pins. */
function suggestFor(team, teams, pool, pins, cfg, MAX = 32, limit = 3) {
  const stats = teamStats(teams, MAX);
  const target = stats.divRaw ?? 0;
  const tp = team.players,
    n = tp.length;
  const sum = tp.reduce((a, p) => a + scoreOf(p), 0);
  const cnt = pos => tp.filter(p => effPos(p) === pos).length;
  const need = {
    goaltender: Math.max(0, cfg.goalie_min - cnt("goaltender")),
    defenseman: Math.max(0, 2 - cnt("defenseman")),
    center: Math.max(0, 1 - cnt("center")),
    winger: Math.max(0, 2 - cnt("winger"))
  };
  const idx = pinIndex(pins);
  const onTeam = new Set(tp.map(p => p.id));
  return pool.map(p => {
    const pos = effPos(p),
      reasons = [];
    let fit = 0;
    if (idx.apart.get(p.id) && [...idx.apart.get(p.id)].some(q => onTeam.has(q))) return {
      player: p,
      fit: -1e6,
      reasons: ["Keep-apart rule with someone on this team"],
      blocked: true
    };
    if (pos === "goaltender" && cnt("goaltender") >= cfg.goalie_max) return {
      player: p,
      fit: -1e5,
      reasons: ["Team already has its maximum goalies"],
      blocked: true
    };
    if (need[pos] > 0) {
      fit += pos === "goaltender" ? 30 : 8;
      reasons.push(`Fills an open ${POS_LABEL[pos].toLowerCase()} spot`);
    } else if (pos) {
      fit -= 4;
    }
    if (idx.together.some(x => x.a === p.id && onTeam.has(x.b) || x.b === p.id && onTeam.has(x.a))) {
      fit += 12;
      reasons.push("Keep-together partner is on this team");
    }
    if (n > 0) {
      const gain = Math.abs(sum / n - target) - Math.abs((sum + scoreOf(p)) / (n + 1) - target);
      fit += gain * 4;
      if (gain > 0.3) reasons.push("Moves the team toward the division average");else if (gain < -0.3) reasons.push("Pulls the team away from the division average");
    } else {
      fit += scoreOf(p) * 0.1;
    }
    if (!reasons.length) reasons.push(`Score ${scoreOf(p).toFixed(1)}`);
    return {
      player: p,
      fit,
      reasons
    };
  }).filter(x => !x.blocked).sort((a, b) => b.fit - a.fit || a.player.id - b.player.id).slice(0, limit);
}

/** Live health per team (0-100) with plain-language issues. Server gate stays the source of truth for publishing. */
function teamHealth(team, teams, pins, cfg, th, MAX = 32) {
  if (!team.players.length) return {
    score: null,
    issues: []
  };
  const stats = teamStats(teams, MAX);
  const row = stats.rows.find(r => r.id === team.id);
  const issues = [];
  const goalies = row.goalies;
  const cnt = pos => team.players.filter(p => effPos(p) === pos).length;
  if (goalies < cfg.goalie_min) issues.push("Needs a goalie");
  if (goalies > cfg.goalie_max) issues.push(`More than ${cfg.goalie_max} goalies`);
  if (cnt("defenseman") < 2) issues.push("Needs 2+ defense");
  if (cnt("center") < 1) issues.push("Needs a center");
  if (cnt("winger") < 2) issues.push("Needs 2+ wings");
  if (team.players.length < cfg.min_roster) issues.push(`Below ${cfg.min_roster}-player minimum`);
  if (team.players.length > cfg.max_roster) issues.push(`Above ${cfg.max_roster}-player maximum`);
  const unpaid = team.players.filter(p => p.payment_status !== "paid").length;
  const flags = team.players.filter(p => p.sandbagging_flag).length;
  if (unpaid) issues.push(`${unpaid} unpaid`);
  if (flags) issues.push(`${flags} sandbagging flag${flags > 1 ? "s" : ""}`);
  const band = bandOf(row.parity, th);
  if (band !== "balanced" && band !== "none") issues.push(`Balance: ${band}`);
  pinViolations(pins, [team]).forEach(() => {}); // pins are cross-team; reported at board level
  const posOk = cnt("defenseman") >= 2 && cnt("center") >= 1 && cnt("winger") >= 2;
  const score = Math.round((row.parity === null ? 50 : Math.min(100, row.parity / 80 * 100)) * 0.3 + (goalies >= cfg.goalie_min && goalies <= cfg.goalie_max ? 100 : 0) * 0.2 + (posOk ? 100 : 40) * 0.25 + (1 - unpaid / team.players.length) * 100 * 0.15 + (1 - flags / team.players.length) * 100 * 0.1);
  return {
    score,
    issues,
    band
  };
}