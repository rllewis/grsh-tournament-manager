import * as E from "./.build/rosterEngine.mjs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  FAIL:", m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

const tiers = ["A2","B1","B2","B3","C1","C2","R1","R2","R3","B2","C1","R1","R2","B3","C2","R1","R2","B1","C1","R3","B2","R1"];
const pos   = ["goaltender","defenseman","defenseman","center","winger","winger","center","defenseman","winger","goaltender","defenseman","center","winger","defenseman","winger","goaltender","center","defenseman","winger","center","defenseman","winger"];
const mk = () => tiers.map((t, i) => ({ id: i + 1, first_name: "P" + i, last_name: "L" + i, position: pos[i], is_goalie: pos[i] === "goaltender", skill_tier_reported: t, skill_tier_assigned: null, years_experience: 5 + i, payment_status: i === 5 ? "pending" : "paid", sandbagging_flag: i === 3 }));
const cfg = { min_roster: 7, max_roster: 12, goalie_min: 1, goalie_max: 2 };
const th = { rebalance_low: 60, review_low: 65, review_high: 80, rebalance_high: 85 };
const freshTeams = () => [{ id: 10, name: "Gold", locked: false, players: [] }, { id: 11, name: "Blue", locked: false, players: [] }, { id: 12, name: "Red", locked: false, players: [] }];

console.log("targets + slots");
eq(E.targetSize(cfg, 3, 22), 8, "22 players / 3 teams → 8");
eq(E.targetSize(cfg, 3, 9), 7, "small pool clamps up to min_roster");
eq(E.targetSize(cfg, 1, 40), 12, "clamps down to max_roster");
const tpl = E.slotTemplate(cfg, 8); eq(tpl.length, 8, "template 8 slots"); eq(tpl.filter((s) => s.pos === "goaltender").length, 1, "1 goalie slot");
const f = E.fillSlots({ players: mk().slice(0, 5) }, tpl);
ok(f.filter((x) => x.player).length === 5 && f.length === 8, "fillSlots places 5, keeps 8 slots");
ok(f.every((x) => !x.slot.pos || !x.player || (x.player.is_goalie ? "goaltender" : x.player.position) === x.slot.pos), "players only in matching positional slots");
const over = E.fillSlots({ players: mk().slice(0, 12) }, tpl); ok(over.length >= 12 && over.filter((x) => x.player).length === 12, "extras kept beyond template");

console.log("scoring / bands");
const stats = E.teamStats([{ id: 1, players: mk().slice(0, 8) }, { id: 2, players: mk().slice(8, 16) }]);
ok(stats.rows[0].norm > 0 && stats.rows[0].parity !== null, "norm + parity computed");
eq(E.bandOf(null, th), "none", "null parity → none"); eq(E.bandOf(72, th), "balanced", "72 balanced"); eq(E.bandOf(62, th), "review", "62 review"); eq(E.bandOf(50, th), "rebalance", "50 rebalance"); eq(E.bandOf(90, th), "rebalance", "90 rebalance");

console.log("proposeBalance (rebalance)");
let teams = freshTeams(), pool = mk();
const naive = (() => { const t = freshTeams(); [...pool].sort((a, b) => E.scoreOf(b) - E.scoreOf(a)).forEach((p, i) => t[i % 3].players.push(p)); return E.spreadOf(E.teamStats(t)); })();
let r = E.proposeBalance(teams, pool, [], cfg);
eq(r.moves.length, 22, "all 22 placed"); eq(Object.keys(r.assignment).length, 22, "assignment covers all");
const sizes = r.afterTeams.map((t) => t.players.length).sort(); ok(sizes[2] - sizes[0] <= 1, `sizes even ${sizes}`);
ok(r.afterTeams.every((t) => t.players.filter((p) => p.is_goalie).length >= 1), "every team has a goalie");
const sp = E.spreadOf(E.teamStats(r.afterTeams)); ok(sp <= naive + 1e-9, `spread ${sp.toFixed(2)} ≤ naive snake ${naive.toFixed(2)}`);
console.log(`   spread: proposal ${sp.toFixed(2)} vs naive-snake ${naive.toFixed(2)}`);
const again = E.proposeBalance(freshTeams(), mk(), [], cfg); eq(again.assignment, r.assignment, "deterministic");

console.log("pins");
const pins = [{ a: 1, b: 2, type: "together" }, { a: 2, b: 3, type: "together" }, { a: 4, b: 5, type: "apart" }, { a: 10, b: 16, type: "apart" }];
r = E.proposeBalance(freshTeams(), mk(), pins, cfg);
eq(r.assignment[1], r.assignment[2], "together 1-2"); eq(r.assignment[2], r.assignment[3], "together chain 2-3");
ok(r.assignment[4] !== r.assignment[5], "apart 4/5"); ok(r.assignment[10] !== r.assignment[16], "apart 10/16");
eq(E.pinViolations(pins, r.afterTeams), [], "no violations after proposal");
const forced = [{ id: 10, locked: false, players: [mk()[3]] }, { id: 11, locked: false, players: [mk()[4]] }];
eq(E.pinViolations([{ a: 4, b: 5, type: "apart" }, { a: 4, b: 5, type: "together" }], forced).length, 1, "pinViolations detects broken together");

console.log("locked teams + fill mode");
let lt = freshTeams(); const all = mk();
lt[2].locked = true; lt[2].players = all.slice(0, 7);
r = E.proposeBalance(lt, all.slice(7), [], cfg);
ok(r.moves.every((m) => m.to !== 12), "nothing moves onto the locked team");
eq(r.afterTeams.find((t) => t.id === 12).players.map((p) => p.id), all.slice(0, 7).map((p) => p.id), "locked roster untouched");
eq(E.proposeBalance(lt.map((t) => ({ ...t, locked: true })), all.slice(7), [], cfg).error, "Every team is locked.", "all locked → error");
let ft = freshTeams(); ft[0].players = all.slice(0, 3); ft[1].players = all.slice(3, 6);
r = E.proposeBalance(ft, all.slice(6), [], cfg, { mode: "fill" });
ok(r.moves.every((m) => m.from === null), "fill moves only pool players");
ok(all.slice(0, 3).every((p) => r.assignment[p.id] === 10) && all.slice(3, 6).every((p) => r.assignment[p.id] === 11), "fill keeps existing rosters");
r = E.proposeBalance(ft, all.slice(6), [], cfg, { mode: "rebalance" });
ok(r.moves.some((m) => m.from !== null) || r.moves.length > 0, "rebalance may move rostered players");

console.log("goalie edge cases");
let few = freshTeams(); const goalieless = mk().filter((p) => !p.is_goalie).slice(0, 12);
r = E.proposeBalance(few, goalieless, [], cfg); ok(r.moves.length === 12, "places everyone even with no goalies (health will flag it)");
const twoG = mk().filter((p) => p.is_goalie);
r = E.proposeBalance(freshTeams(), twoG, [], cfg); eq(new Set(Object.values(r.assignment)).size, 3, "3 goalies → 3 different teams");
const moreG = [...twoG, { ...twoG[0], id: 99 }]; r = E.proposeBalance(freshTeams(), moreG, [], cfg);
ok(r.afterTeams.every((t) => t.players.filter((p) => p.is_goalie).length <= 2), "never exceeds goalie_max");
r = E.proposeBalance([{ id: 1, locked: false, players: [] }], [], [], cfg); eq(r.moves.length, 0, "empty pool → no moves");

console.log("swap finder");
let bad = freshTeams(); const s = mk().sort((a, b) => E.scoreOf(b) - E.scoreOf(a));
bad[0].players = s.slice(0, 8); bad[1].players = s.slice(8, 16); bad[2].players = s.slice(16);
bad.forEach((t, i) => { if (!t.players.some((p) => p.is_goalie)) { /* leave: goalie constraint will steer */ } });
const sw = E.findSwaps(bad, [], cfg);
ok(sw.length > 0, "found swaps on a lopsided split"); ok(sw.every((x) => x.gain > 0.05 && x.spreadAfter <= x.spreadBefore + 1e-9 || x.gain > 0.05), "gains positive");
if (sw[0]) {
  const A = bad.find((t) => t.id === sw[0].teamA), B = bad.find((t) => t.id === sw[0].teamB);
  const sw2 = bad.map((t) => t.id === A.id ? { ...t, players: t.players.map((p) => p.id === sw[0].a.id ? sw[0].b : p) } : t.id === B.id ? { ...t, players: t.players.map((p) => p.id === sw[0].b.id ? sw[0].a : p) } : t);
  ok(E.spreadOf(E.teamStats(sw2)) < E.spreadOf(E.teamStats(bad)), "applying best swap reduces spread");
  console.log(`   best swap: spread ${sw[0].spreadBefore.toFixed(2)} → ${sw[0].spreadAfter.toFixed(2)}`);
}
const lockedSw = bad.map((t, i) => ({ ...t, locked: i === 0 })); ok(E.findSwaps(lockedSw, [], cfg).every((x) => x.teamA !== 10 && x.teamB !== 10), "swaps skip locked team");
const pinned = E.findSwaps(bad, [{ a: sw[0].a.id, b: sw[0].b.id, type: "together" }], cfg);
ok(!pinned.some((x) => x.a.id === sw[0].a.id && x.b.id === sw[0].b.id), "swap that would split nothing still allowed only if not harmful (pins respected)");

console.log("projectMove / suggestFor / health");
const base = freshTeams(); base[0].players = mk().slice(0, 5); base[1].players = mk().slice(5, 10); base[2].players = mk().slice(10, 12);
const rest = mk().slice(12);
const pm = E.projectMove(base, rest[0], 12); ok(pm.after.n === pm.before.n + 1, "projected team grows by 1"); ok(base[2].players.length === 2, "projectMove does not mutate");
const sg = E.suggestFor(base[2], base, rest, [], cfg);
ok(sg.length === 3 && sg[0].fit >= sg[1].fit, "3 ranked suggestions"); ok(sg.every((x) => x.reasons.length), "each has a reason");
const noG = E.suggestFor({ id: 12, players: [] , locked: false}, base, rest, [], cfg, 32, 22); ok(noG[0].player.is_goalie, "team without goalie → goalie ranked first");
const blocked = E.suggestFor(base[0], base, rest, [{ a: base[0].players[0].id, b: rest[0].id, type: "apart" }], cfg, 32, 22);
ok(!blocked.some((x) => x.player.id === rest[0].id), "keep-apart partner never suggested for that team");
eq(E.teamHealth({ id: 5, players: [] }, base, [], cfg, th).score, null, "empty team has no health score (no alarm)");
const h = E.teamHealth(base[2], base, [], cfg, th); ok(h.issues.includes("Needs a goalie") || base[2].players.some((p) => p.is_goalie), "health flags missing goalie"); ok(h.score >= 0 && h.score <= 100, "score in range");

console.log("assign maps + diff (undo)");
const m1 = E.assignMap(base); const m2 = { ...m1, 1: 12, 2: undefined }; delete m2[2];
const d = E.diffAssign(m1, m2); eq(d.find((x) => x.player_id === 1).team_id, 12, "diff moves"); eq(d.find((x) => x.player_id === 2).team_id, null, "diff unassigns");
eq(E.diffAssign(m1, m1), [], "no diff when equal");
const back = E.diffAssign(m2, m1); eq(back.length, d.length, "inverse diff same size");

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
