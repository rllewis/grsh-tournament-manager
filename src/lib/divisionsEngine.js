// Division list for the Players page, built from Settings so it matches Settings and Rosters.
// Pure functions only (tested in tests/js/divisionsEngine.test.mjs).

/** Turn the GET /players/divisions rows into the lookups the Players page uses. Returns null when there is nothing usable. */
export function normalizeDivisions(rows) {
  if (!Array.isArray(rows)) return null;
  const list = rows.filter((r) => r && typeof r.key === "string" && r.key !== "");
  if (!list.length) return null;
  const seen = new Set(), order = [], labels = {}, caps = {}, formats = {}, info = {};
  list.forEach((r) => {
    if (seen.has(r.key)) return; seen.add(r.key);
    const format = ["draft", "teams", "both"].includes(r.format) ? r.format : "both";
    const cap = Number.isFinite(Number(r.capacity)) ? Math.max(0, Math.round(Number(r.capacity))) : 0;
    order.push(r.key);
    labels[r.key] = String(r.label || r.key);
    caps[r.key] = format === "teams" ? 0 : cap;
    formats[r.key] = format;
    info[r.key] = { draftTeams: Number(r.draft_teams) || 0, regTeams: Number(r.reg_teams) || 0, maxRoster: Number(r.max_roster) || 0, teams: Number(r.teams) || 0 };
  });
  return { order, labels, caps, formats, info };
}

/** Replace the contents of the page's lookup objects in place so every component sees the new values. */
export function applyDivisions(norm, target) {
  if (!norm) return false;
  target.order.length = 0; target.order.push(...norm.order);
  ["labels", "caps", "formats", "info"].forEach((k) => { Object.keys(target[k]).forEach((x) => delete target[k][x]); Object.assign(target[k], norm[k]); });
  return true;
}

/** What a capacity card should say for n registered players in a division. */
export function capacityView(n, key, d) {
  const fmt = d.formats[key] || "both", cap = d.caps[key];
  const inf = d.info[key] || { draftTeams: 0, regTeams: 0, maxRoster: 0, teams: 0 };
  if (fmt === "teams") return { kind: "teams", text: `${n} · teams only`, pct: 0, over: false, title: `${d.labels[key] || key}: registered teams only (${inf.regTeams} team${inf.regTeams === 1 ? "" : "s"}), no draft spots.` };
  if (!(cap > 0)) return { kind: "none", text: `${n} · no spots set`, pct: 0, over: false, title: "No draft spots are set for this division in Settings." };
  const pct = Math.min(100, Math.round((n / cap) * 100));
  const mixed = fmt === "both" && inf.regTeams > 0;
  return { kind: "draft", text: `${n}/${cap}`, pct, over: n > cap, title: `${inf.draftTeams} draft team${inf.draftTeams === 1 ? "" : "s"} × ${inf.maxRoster} players${mixed ? ` (plus ${inf.regTeams} registered team${inf.regTeams === 1 ? "" : "s"} not counted)` : ""}` };
}

/** Registrants whose division is not in the list (switched off in Settings). */
export function offListCount(players, order) {
  const on = new Set(order);
  return (players || []).filter((p) => p && p.division_requested && !on.has(p.division_requested)).length;
}
