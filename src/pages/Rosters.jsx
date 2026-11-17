// Rosters.jsx — v3
// Real data, autosaved. Every action is saved to the server as it happens and the server sends back the whole
// division, so this page and the Draft page can never drift apart. No mock players, no fake Save button.
//
// Features: ghost slots · drag-over impact preview · sticky balance bar · auto-balance with per-move review ·
//           swap finder · keep-together / keep-apart rules · plans + autosave + undo · player peek card ·
//           committee review link + publish gate · publish with SportsPress dry run · print cards + reveal mode.

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { formatReturningBadge, scoreBreakdown, TIER_DESCRIPTIONS } from "../lib/playerScoring";
import {
  POS_LABEL, POS_SHORT, tierOf, scoreOf, teamStats, bandOf, spreadOf, targetSize, slotTemplate, fillSlots,
  pinViolations, assignMap, diffAssign, proposeBalance, findSwaps, projectMove, suggestFor, teamHealth,
} from "../lib/rosterEngine";

const API   = window.grshConfig?.apiUrl || "/wp-json/grsh/v1";
const NONCE = window.grshConfig?.nonce  || "";

const F_HEAD = "'Fraunces',Georgia,serif";
const F_NUM  = "'DM Mono',monospace";
const F_UI   = "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
const INK = "#1a1a2e", MUTED = "#555566", SOFT = "#6b6b7b", LINE = "#E2E0D8", PAPER = "#F6F5F0", GOLD = "#D4A017", WHITE = "#fff";

const POS_COLOR = {
  defenseman: { bg: "#E8F0FE", color: "#1A3F8F" }, center: { bg: "#E8F8EF", color: "#1A5C35" },
  winger: { bg: "#FDF3E8", color: "#7A4A18" },     goaltender: { bg: "#FCE8E8", color: "#7A1818" },
};
const TIER_COLOR = (t) => {
  if (!t) return { bg: "#F3F4F6", color: "#4B5563" };
  const f = t[0];
  if (f === "A") return { bg: "#FCE8E8", color: "#7A1818" };
  if (f === "B") return { bg: "#FEF0E8", color: "#7A4518" };
  if (f === "C") return { bg: "#FEF9E7", color: "#6B4E0E" };
  return { bg: "#E8F0FE", color: "#1A3F8F" };
};
const BAND = {
  balanced:  { label: "Balanced",  color: "#166534", bg: "#DCFCE7" },
  review:    { label: "Review",    color: "#92400E", bg: "#FEF3C7" },
  rebalance: { label: "Rebalance", color: "#991B1B", bg: "#FEE2E2" },
  none:      { label: "—",         color: SOFT,      bg: "#F3F4F6" },
};
const STAGES = [
  { key: "draft", label: "Draft" }, { key: "review", label: "Committee review" },
  { key: "locked", label: "Locked" }, { key: "published", label: "Published" },
];
const fullName = (p) => `${p.first_name} ${p.last_name}`.trim();
const effPos = (p) => (p.is_goalie ? "goaltender" : p.position || "");
const hhmm = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// ─── small UI pieces ─────────────────────────────────────────────────────────
const btn = (kind = "ghost", extra = {}) => ({
  fontFamily: F_UI, fontSize: 13, fontWeight: 600, padding: "7px 12px", borderRadius: 8, cursor: "pointer", lineHeight: 1.2,
  border: kind === "primary" ? `1px solid ${INK}` : kind === "danger" ? "1px solid #B91C1C" : `1px solid ${LINE}`,
  background: kind === "primary" ? INK : kind === "danger" ? "#B91C1C" : WHITE,
  color: kind === "primary" || kind === "danger" ? WHITE : INK, ...extra,
});
const chip = (c, extra = {}) => ({ display: "inline-block", fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: c.bg, color: c.color, whiteSpace: "nowrap", ...extra });

function PosDot({ p }) {
  const c = POS_COLOR[effPos(p)] || { bg: "#F3F4F6", color: SOFT };
  return <span title={POS_LABEL[effPos(p)] || "No position"} style={{ ...chip(c), width: 20, textAlign: "center", padding: "2px 0", fontFamily: F_NUM }}>{POS_SHORT[effPos(p)] || "?"}</span>;
}

function PlayerRow({ p, dense, onPeek, draggable, onDragStart, onDragEnd, captain, pinned, selected }) {
  const tier = tierOf(p), tc = TIER_COLOR(tier), rb = formatReturningBadge((p.returning_seasons || []).length);
  return (
    <div draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={() => onPeek && onPeek(p)}
      style={{ display: "flex", alignItems: "center", gap: 7, padding: dense ? "5px 8px" : "7px 10px", background: selected ? "#FFF8E1" : WHITE,
        border: `1px solid ${selected ? GOLD : LINE}`, borderRadius: 8, cursor: draggable ? "grab" : "pointer", fontFamily: F_UI, fontSize: 13, color: INK, userSelect: "none" }}>
      <PosDot p={p} />
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>
        {fullName(p)}{captain && <span title="Captain" style={{ marginLeft: 5, color: GOLD, fontWeight: 800 }}>C</span>}
      </span>
      {pinned && <span title="Has a keep-together / keep-apart rule" style={{ fontSize: 11 }}>📌</span>}
      {p.payment_status !== "paid" && <span title={`Payment: ${p.payment_status}`} style={{ width: 7, height: 7, borderRadius: 4, background: "#DC2626" }} />}
      {p.sandbagging_flag && <span title="Sandbagging flag" style={{ fontSize: 11 }}>⚑</span>}
      {rb && <span title="Returning player" style={chip({ bg: "#F3E8FF", color: "#6B21A8" })}>{rb}</span>}
      <span title={`Skill tier ${tier || "unassigned"}`} style={chip(tc)}>{tier || "—"}</span>
      <span title="Player score (tier + years)" style={{ fontFamily: F_NUM, fontSize: 12, color: MUTED, width: 34, textAlign: "right" }}>{scoreOf(p).toFixed(1)}</span>
    </div>
  );
}

function Modal({ title, onClose, children, width = 560, footer }) {
  useEffect(() => { const h = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,20,40,.45)", zIndex: 100000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}
        style={{ background: WHITE, borderRadius: 14, width: "100%", maxWidth: width, maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.3)", fontFamily: F_UI, color: INK }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${LINE}`, display: "flex", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontFamily: F_HEAD, fontSize: 19, flex: 1 }}>{title}</h3>
          <button onClick={onClose} aria-label="Close" style={btn("ghost", { padding: "4px 10px" })}>✕</button>
        </div>
        <div style={{ padding: 18, overflowY: "auto" }}>{children}</div>
        {footer && <div style={{ padding: "12px 18px", borderTop: `1px solid ${LINE}`, display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>{footer}</div>}
      </div>
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────
export default function Rosters() {
  const [div, setDiv]         = useState(() => new URLSearchParams(window.location.search).get("division") || "");
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState("");
  const [saving, setSaving]   = useState(0);
  const [savedAt, setSavedAt] = useState("");
  const [toast, setToast]     = useState(null);
  const [undo, setUndo]       = useState([]);
  const [peek, setPeek]       = useState(null);       // player id
  const [modal, setModal]     = useState(null);       // {kind, ...}
  const [posF, setPosF]       = useState("all");
  const [q, setQ]             = useState("");
  const [sortBy, setSortBy]   = useState("score");
  const [drag, setDrag]       = useState(null);       // player id
  const [hover, setHover]     = useState(null);       // team id | "pool"
  const [suggestTeam, setSuggestTeam] = useState(null);
  const [reveal, setReveal]   = useState(null);       // {i, shown}
  const [printing, setPrinting] = useState(false);
  const dataRef = useRef(null); dataRef.current = data;

  const flash = useCallback((msg, kind = "ok") => { setToast({ msg, kind }); window.clearTimeout(flash.t); flash.t = window.setTimeout(() => setToast(null), kind === "err" ? 7000 : 3500); }, []);

  // one fetch helper: sends the nonce, surfaces server messages, and always applies a returned division payload
  const call = useCallback(async (path, method = "GET", body) => {
    setSaving((n) => n + 1);
    try {
      const res = await fetch(`${API}${path}`, { method, headers: { "Content-Type": "application/json", "X-WP-Nonce": NONCE }, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
      let json = null; try { json = await res.json(); } catch (e) { /* non-JSON error page */ }
      if (!res.ok) { const m = (json && (json.error || json.message)) || `Request failed (${res.status}).`; const e = new Error(m); e.json = json; e.status = res.status; throw e; }
      if (json && json.teams && json.pool) { setData(json); if (method !== "GET") setSavedAt(hhmm()); }
      return json;
    } finally { setSaving((n) => n - 1); }
  }, []);

  const load = useCallback(async (d) => {
    setLoading(true); setErr("");
    try {
      const json = await call(`/rosters${d ? `?division=${encodeURIComponent(d)}` : ""}`);
      if (json && json.division) { setDiv(json.division); const u = new URL(window.location.href); u.searchParams.set("division", json.division); window.history.replaceState({}, "", u); }
      setUndo([]); setPeek(null);
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }, [call]);

  useEffect(() => { load(div); /* eslint-disable-next-line */ }, []);

  // ── derived ────────────────────────────────────────────────────────────────
  const cfg   = data?.config || { min_roster: 8, max_roster: 12, goalie_min: 1, goalie_max: 2 };
  const th    = data?.parity || { rebalance_low: 60, review_low: 65, review_high: 80, rebalance_high: 85 };
  const MAX   = data?.max_player_score || 32;
  const teams = data?.teams || [], pool = data?.pool || [], pins = data?.pins || [];
  const live  = data && (data.draft_status === "active" || data.draft_status === "paused");
  const readOnly = !!live || data?.stage === "published";
  const stats = useMemo(() => teamStats(teams, MAX), [teams, MAX]);
  const totalPlayers = pool.length + teams.reduce((s, t) => s + t.players.length, 0);
  const target = targetSize(cfg, teams.length, totalPlayers);
  const template = useMemo(() => slotTemplate(cfg, target), [cfg, target]);
  const violations = useMemo(() => pinViolations(pins, teams), [pins, teams]);
  const pinned = useMemo(() => { const s = new Set(); pins.forEach((p) => { s.add(p.a); s.add(p.b); }); return s; }, [pins]);
  const allPlayers = useMemo(() => [...pool, ...teams.flatMap((t) => t.players)], [pool, teams]);
  const byId = useMemo(() => { const m = new Map(); allPlayers.forEach((p) => m.set(p.id, p)); return m; }, [allPlayers]);
  const teamOf = useMemo(() => assignMap(teams), [teams]);
  const counts = useMemo(() => ({ all: pool.length, goaltender: pool.filter((p) => effPos(p) === "goaltender").length, defenseman: pool.filter((p) => effPos(p) === "defenseman").length, center: pool.filter((p) => effPos(p) === "center").length, winger: pool.filter((p) => effPos(p) === "winger").length }), [pool]);
  const shownPool = useMemo(() => {
    const s = q.trim().toLowerCase();
    const r = pool.filter((p) => (posF === "all" || effPos(p) === posF) && (!s || fullName(p).toLowerCase().includes(s)));
    return r.sort((a, b) => sortBy === "name" ? a.last_name.localeCompare(b.last_name) : scoreOf(b) - scoreOf(a) || a.id - b.id);
  }, [pool, posF, q, sortBy]);
  const proj = useMemo(() => {
    if (!drag || typeof hover !== "number") return null;
    const pl = byId.get(drag); if (!pl) return null;
    return projectMove(teams, pl, hover, MAX);
  }, [drag, hover, teams, byId, MAX]);

  // ── actions ────────────────────────────────────────────────────────────────
  const guard = () => { if (readOnly) { flash(live ? "A draft is in progress for this division — finish it on the Draft page first." : "Rosters are published. Unpublish is not available here.", "err"); return true; } return false; };

  const applyLocal = (d, moves) => {
    const nd = { ...d, teams: d.teams.map((t) => ({ ...t, players: [...t.players] })), pool: [...d.pool] };
    moves.forEach((m) => {
      let pl = null;
      nd.pool = nd.pool.filter((p) => { if (p.id === m.player_id) { pl = p; return false; } return true; });
      nd.teams.forEach((t) => { t.players = t.players.filter((p) => { if (p.id === m.player_id) { pl = p; return false; } return true; }); });
      if (!pl) return;
      if (m.team_id === null || m.team_id === undefined) nd.pool.push(pl); else { const t = nd.teams.find((x) => x.id === m.team_id); if (t) t.players.push(pl); else nd.pool.push(pl); }
    });
    return nd;
  };

  const doMoves = useCallback(async (moves, { type = "manual", note = "", record = true } = {}) => {
    const d = dataRef.current; if (!d || !moves.length) return false;
    const before = assignMap(d.teams);
    const inverse = moves.map((m) => ({ player_id: m.player_id, team_id: before[m.player_id] ?? null }));
    setData(applyLocal(d, moves));                       // optimistic: the card moves now
    try {
      await call("/rosters/moves", "POST", { division: d.division, moves: moves.map((m) => ({ player_id: m.player_id, team_id: m.team_id ?? null })), type, note });
      if (record) setUndo((u) => [...u.slice(-29), { inverse, label: note || `${moves.length} move${moves.length > 1 ? "s" : ""}` }]);
      return true;
    } catch (e) { flash(e.message, "err"); setData(d); load(d.division); return false; }
  }, [call, flash, load]);

  const doUndo = useCallback(async () => {
    if (readOnly) return;
    const last = undo[undo.length - 1]; if (!last) return;
    setUndo((u) => u.slice(0, -1));
    const ok = await doMoves(last.inverse, { record: false, note: "undo" });
    if (ok) flash(`Undid: ${last.label}`);
  }, [undo, doMoves, flash, readOnly]);

  useEffect(() => {
    const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) { e.preventDefault(); doUndo(); } };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [doUndo]);

  const dropOn = (teamIdOrPool) => {
    const id = drag; setDrag(null); setHover(null);
    if (!id || guard()) return;
    const to = teamIdOrPool === "pool" ? null : teamIdOrPool;
    const cur = teamOf[id] ?? null; if (cur === to) return;
    const t = to === null ? null : teams.find((x) => x.id === to);
    if (t && t.locked) { flash(`${t.name} is locked. Unlock it to add players.`, "err"); return; }
    const from = cur === null ? null : teams.find((x) => x.id === cur);
    if (from && from.locked) { flash(`${from.name} is locked. Unlock it to move players.`, "err"); return; }
    doMoves([{ player_id: id, team_id: to }], { note: `${fullName(byId.get(id))} → ${t ? t.name : "pool"}` });
  };

  const patchTeam = async (id, body) => { if (guard()) return; try { await call(`/rosters/teams/${id}`, "PATCH", body); } catch (e) { flash(e.message, "err"); } };
  const addTeam = async (name) => { if (guard()) return; try { await call("/rosters/teams", "POST", { division: data.division, name }); flash(`Added ${name}`); } catch (e) { flash(e.message, "err"); } };
  const delTeam = async (t) => {
    if (guard()) return;
    try { await call(`/rosters/teams/${t.id}`, "DELETE"); flash(`Deleted ${t.name}`); }
    catch (e) { if (e.status === 409 && e.json?.players) { if (window.confirm(`${t.name} has ${e.json.players} player(s). Delete it and send them back to the pool?`)) { try { await call(`/rosters/teams/${t.id}?force=1`, "DELETE"); } catch (e2) { flash(e2.message, "err"); } } } else flash(e.message, "err"); }
  };
  const setCaptain = async (t, p) => { if (guard()) return; try { await call("/rosters/captain", "POST", { team_id: t.id, player_id: p.id }); flash(`${fullName(p)} is captain of ${t.name}`); } catch (e) { flash(e.message, "err"); } };
  const savePins = async (next) => { try { await call("/rosters/pins", "POST", { division: data.division, pins: next }); } catch (e) { flash(e.message, "err"); } };
  const lockAll = async (lock) => { if (guard()) return; try { for (const t of teams) { if (!!t.locked !== lock) await call(`/rosters/teams/${t.id}`, "PATCH", { draft_locked: lock }); } flash(lock ? "All teams locked" : "All teams unlocked"); } catch (e) { flash(e.message, "err"); } };

  // ── render helpers ─────────────────────────────────────────────────────────
  if (loading && !data) return <div style={{ padding: 40, fontFamily: F_UI, color: MUTED }}>Loading rosters…</div>;
  if (err && !data) return (
    <div style={{ padding: 40, fontFamily: F_UI, color: INK }}>
      <h2 style={{ fontFamily: F_HEAD }}>Rosters could not load</h2>
      <p style={{ color: "#991B1B" }}>{err}</p>
      <button style={btn("primary")} onClick={() => load(div)}>Try again</button>
    </div>
  );

  const rowFor = (id) => stats.rows.find((r) => r.id === id);
  const stageIdx = STAGES.findIndex((s) => s.key === data.stage);

  return (
    <div style={{ fontFamily: F_UI, color: INK, padding: "16px 20px 60px", maxWidth: 1700, margin: "0 auto" }} onDragEnd={() => { setDrag(null); setHover(null); }}>
      <style>{`@media print{body *{visibility:hidden!important}.grsh-print,.grsh-print *{visibility:visible!important}.grsh-print{position:absolute;left:0;top:0;width:100%}}`}</style>

      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <h1 style={{ margin: 0, fontFamily: F_HEAD, fontSize: 28 }}>Rosters</h1>
        <span style={{ fontSize: 12, color: SOFT }}>{saving > 0 ? "Saving…" : savedAt ? `All changes saved ${savedAt}` : "Changes save automatically"}</span>
        <span style={{ flex: 1 }} />
      </div>

      {/* division tabs */}
      <div role="tablist" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {data.divisions.map((d) => (
          <button key={d.key} role="tab" aria-selected={d.key === data.division} onClick={() => d.key !== data.division && load(d.key)}
            style={{ ...btn(d.key === data.division ? "primary" : "ghost"), display: "flex", gap: 8, alignItems: "center" }}>
            {d.label}<span style={{ fontFamily: F_NUM, fontSize: 11, opacity: .8 }}>{d.assigned}/{d.total} · {d.pct}%</span>
          </button>
        ))}
      </div>

      {live && <div style={{ background: "#FEF3C7", border: "1px solid #F59E0B", color: "#92400E", padding: "10px 14px", borderRadius: 10, marginBottom: 12, fontSize: 14 }}>
        The draft for this division is <b>{data.draft_status}</b>. Editing is off here until it finishes or is reset on the Draft page — otherwise the two pages would overwrite each other.
      </div>}
      {data.stage === "published" && <div style={{ background: "#DCFCE7", border: "1px solid #86EFAC", color: "#166534", padding: "10px 14px", borderRadius: 10, marginBottom: 12, fontSize: 14 }}>
        Published {data.published.at}. Rosters are read-only.</div>}

      {/* stepper */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {STAGES.map((s, i) => (
          <button key={s.key} onClick={() => setModal({ kind: "publish", focus: s.key })}
            style={{ ...btn("ghost"), background: i === stageIdx ? "#FFF8E1" : i < stageIdx ? "#DCFCE7" : WHITE, borderColor: i === stageIdx ? GOLD : LINE }}>
            {i < stageIdx ? "✓ " : `${i + 1}. `}{s.label}
          </button>
        ))}
        <span style={{ fontSize: 12, color: SOFT, alignSelf: "center", marginLeft: 6 }}>
          {data.gate.filter((g) => g.level === "fail").length ? `${data.gate.filter((g) => g.level === "fail").length} blocker${data.gate.filter((g) => g.level === "fail").length > 1 ? "s" : ""} before publishing` : "No blockers"}
        </span>
      </div>

      {/* sticky balance bar */}
      <div style={{ position: "sticky", top: 32, zIndex: 50, background: PAPER, paddingBottom: 8 }}>
        <div style={{ background: WHITE, border: `1px solid ${LINE}`, borderRadius: 12, padding: "10px 12px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1, minWidth: 260 }}>
            {teams.length === 0 && <span style={{ color: SOFT, fontSize: 13 }}>Add teams to see balance.</span>}
            {teams.map((t) => {
              const r = rowFor(t.id), b = BAND[bandOf(r?.parity ?? null, th)];
              return (
                <div key={t.id} title={`${t.name}: average score ${r?.raw?.toFixed(1) ?? "—"}, balance ${r?.parity?.toFixed(0) ?? "—"}`} style={{ minWidth: 110 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700 }}>
                    <span style={{ color: t.colour }}>{t.name}</span><span style={{ fontFamily: F_NUM, color: b.color }}>{r?.parity === null || r?.parity === undefined ? "—" : r.parity.toFixed(0)}</span>
                  </div>
                  <div style={{ height: 8, background: "#EEE", borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${Math.min(100, r?.norm ?? 0)}%`, height: "100%", background: t.colour }} /></div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 12, color: MUTED, textAlign: "right" }}>
            <div>Spread <b style={{ fontFamily: F_NUM }}>{spreadOf(stats).toFixed(1)}</b> pts</div>
            <div>{pool.length} unassigned · target {target}/team</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button style={btn("primary")} disabled={readOnly || !teams.length} onClick={() => setModal({ kind: "balance", mode: pool.length && teams.some((t) => t.players.length) ? "fill" : "rebalance" })}>Auto-balance…</button>
            <button style={btn()} disabled={readOnly || teams.length < 2} onClick={() => setModal({ kind: "swaps" })}>Find swaps</button>
            <button style={btn()} disabled={!undo.length || readOnly} onClick={doUndo} title="Ctrl+Z">Undo{undo.length ? ` (${undo.length})` : ""}</button>
            <button style={btn()} onClick={() => setModal({ kind: "plans" })}>Plans ({data.plans.length})</button>
            <button style={btn()} onClick={() => setModal({ kind: "print" })}>Print / Reveal</button>
          </div>
        </div>
        {violations.length > 0 && <div style={{ marginTop: 6, fontSize: 12, color: "#92400E", background: "#FEF3C7", borderRadius: 8, padding: "6px 10px" }}>
          {violations.length} keep-together / keep-apart rule{violations.length > 1 ? "s are" : " is"} broken:{" "}
          {violations.slice(0, 3).map((v) => `${fullName(byId.get(v.a) || { first_name: "?", last_name: "" })} ${v.type === "together" ? "&" : "≠"} ${fullName(byId.get(v.b) || { first_name: "?", last_name: "" })}`).join("; ")}
        </div>}
      </div>

      {/* board: teams + pool */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 16, alignItems: "start" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(270px,1fr))", gap: 12 }}>
          {teams.map((t) => {
            const r = rowFor(t.id), band = bandOf(r?.parity ?? null, th), b = BAND[band];
            const h = teamHealth(t, teams, pins, cfg, th, MAX);
            const slots = fillSlots(t, template);
            const isHover = hover === t.id && drag;
            const sg = suggestTeam === t.id ? suggestFor(t, teams, pool, pins, cfg, MAX, 3) : null;
            return (
              <div key={t.id}
                onDragOver={(e) => { if (drag && !readOnly) { e.preventDefault(); setHover(t.id); } }}
                onDragLeave={() => setHover((x) => (x === t.id ? null : x))}
                onDrop={(e) => { e.preventDefault(); dropOn(t.id); }}
                style={{ background: WHITE, border: `2px solid ${isHover ? GOLD : LINE}`, borderTop: `5px solid ${t.colour}`, borderRadius: 12, padding: 10, opacity: t.locked ? 0.92 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ flex: 1, fontFamily: F_HEAD, fontSize: 18, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.locked && "🔒 "}{t.name}</div>
                  <span title="Balance vs. the other teams" style={chip(b)}>{b.label}{r?.parity != null ? ` ${r.parity.toFixed(0)}` : ""}</span>
                </div>
                <div style={{ display: "flex", gap: 10, fontSize: 12, color: MUTED, margin: "4px 0 8px", flexWrap: "wrap" }}>
                  <span>{t.players.length}/{target} players</span>
                  <span>Avg score <b style={{ fontFamily: F_NUM }}>{r?.raw != null ? r.raw.toFixed(1) : "—"}</b></span>
                  {h.score !== null && <span title={h.issues.join(" · ") || "No issues"}>Health <b style={{ fontFamily: F_NUM, color: h.score >= 80 ? "#166534" : h.score >= 60 ? "#92400E" : "#991B1B" }}>{h.score}</b></span>}
                </div>
                {isHover && proj && (
                  <div style={{ background: "#FFF8E1", border: `1px dashed ${GOLD}`, borderRadius: 8, padding: "5px 8px", fontSize: 12, marginBottom: 8 }}>
                    If dropped here: balance <b>{proj.before?.parity != null ? proj.before.parity.toFixed(0) : "—"}</b> → <b>{proj.after?.parity != null ? proj.after.parity.toFixed(0) : "—"}</b>
                    {" "}({BAND[bandOf(proj.after?.parity ?? null, th)].label}), avg {proj.after?.raw != null ? proj.after.raw.toFixed(1) : "—"}
                  </div>
                )}
                <div style={{ display: "grid", gap: 4 }}>
                  {slots.map((s) => s.player ? (
                    <PlayerRow key={s.player.id} p={s.player} dense captain={t.captain_player_id === s.player.id} pinned={pinned.has(s.player.id)} selected={peek === s.player.id}
                      draggable={!readOnly && !t.locked} onPeek={(p) => setPeek(p.id)}
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(s.player.id)); e.dataTransfer.effectAllowed = "move"; setDrag(s.player.id); }} onDragEnd={() => { setDrag(null); setHover(null); }} />
                  ) : (
                    <button key={s.slot.key} disabled={readOnly || t.locked} onClick={() => setSuggestTeam(suggestTeam === t.id ? null : t.id)}
                      style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 8px", border: `1.5px dashed ${s.slot.pos ? "#C9C6BA" : "#E5E3DB"}`, borderRadius: 8, background: "transparent", color: SOFT, fontSize: 12, cursor: "pointer", fontFamily: F_UI, textAlign: "left" }}>
                      <span style={{ ...chip({ bg: "#F3F4F6", color: SOFT }), width: 20, textAlign: "center", padding: "2px 0" }}>{POS_SHORT[s.slot.pos] || "+"}</span>
                      {s.slot.label} needed
                    </button>
                  ))}
                </div>
                {sg && (
                  <div style={{ marginTop: 8, borderTop: `1px solid ${LINE}`, paddingTop: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: SOFT, marginBottom: 4 }}>BEST FITS FROM THE POOL</div>
                    {sg.length === 0 && <div style={{ fontSize: 12, color: SOFT }}>No one in the pool fits.</div>}
                    {sg.map((x) => (
                      <div key={x.player.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <div style={{ flex: 1, fontSize: 12 }}><b>{fullName(x.player)}</b> <span style={{ color: SOFT }}>— {x.reasons[0]}</span></div>
                        <button style={btn("ghost", { padding: "3px 8px", fontSize: 12 })} onClick={() => doMoves([{ player_id: x.player.id, team_id: t.id }], { note: `${fullName(x.player)} → ${t.name}` })}>Add</button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  <button style={btn("ghost", { padding: "4px 8px", fontSize: 12 })} disabled={readOnly} onClick={() => patchTeam(t.id, { draft_locked: !t.locked })}>{t.locked ? "Unlock" : "Lock"}</button>
                  <button style={btn("ghost", { padding: "4px 8px", fontSize: 12 })} disabled={readOnly || t.locked} onClick={() => setModal({ kind: "teamedit", team: t })}>Edit</button>
                  {h.issues.length > 0 && <span title={h.issues.join(" · ")} style={{ fontSize: 11, color: "#92400E", alignSelf: "center" }}>⚠ {h.issues[0]}{h.issues.length > 1 ? ` +${h.issues.length - 1}` : ""}</span>}
                </div>
              </div>
            );
          })}
          {!readOnly && (
            <button onClick={() => setModal({ kind: "newteam" })} style={{ border: `2px dashed ${LINE}`, borderRadius: 12, background: "transparent", color: MUTED, minHeight: 120, cursor: "pointer", fontFamily: F_UI, fontSize: 14, fontWeight: 600 }}>
              + Add team{cfg.planned_teams ? ` (${teams.length}/${cfg.planned_teams} planned)` : ""}
            </button>
          )}
        </div>

        {/* sticky compact pool */}
        <div onDragOver={(e) => { if (drag && !readOnly) { e.preventDefault(); setHover("pool"); } }} onDrop={(e) => { e.preventDefault(); dropOn("pool"); }}
          style={{ position: "sticky", top: 168, maxHeight: "calc(100vh - 190px)", display: "flex", flexDirection: "column", background: WHITE, border: `2px solid ${hover === "pool" && drag ? GOLD : LINE}`, borderRadius: 12 }}>
          <div style={{ padding: "10px 10px 6px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <div style={{ fontFamily: F_HEAD, fontSize: 18, fontWeight: 700, flex: 1 }}>Unassigned</div>
              <span style={{ fontSize: 12, color: SOFT }}>{pool.length} players</span>
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "8px 0" }}>
              {[["all", "All"], ["goaltender", "Goalies"], ["defenseman", "Defense"], ["center", "Center"], ["winger", "Wing"]].map(([k, l]) => (
                <button key={k} onClick={() => setPosF(k)} style={{ ...btn(posF === k ? "primary" : "ghost"), padding: "3px 8px", fontSize: 12 }}>{l} <span style={{ fontFamily: F_NUM, opacity: .8 }}>{counts[k]}</span></button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name…" aria-label="Search players" style={{ flex: 1, padding: "6px 8px", border: `1px solid ${LINE}`, borderRadius: 8, fontFamily: F_UI, fontSize: 13 }} />
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort pool" style={{ border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 12, padding: "0 6px" }}>
                <option value="score">Score ↓</option><option value="name">Name</option>
              </select>
            </div>
          </div>
          <div style={{ overflowY: "auto", padding: "4px 10px 10px", display: "grid", gap: 4 }}>
            {shownPool.length === 0 && <div style={{ fontSize: 13, color: SOFT, padding: 12, textAlign: "center" }}>{pool.length === 0 ? "Everyone is on a team." : "No one matches that filter."}</div>}
            {shownPool.map((p) => (
              <PlayerRow key={p.id} p={p} dense pinned={pinned.has(p.id)} selected={peek === p.id} draggable={!readOnly} onPeek={(x) => setPeek(x.id)}
                onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(p.id)); e.dataTransfer.effectAllowed = "move"; setDrag(p.id); }} onDragEnd={() => { setDrag(null); setHover(null); }} />
            ))}
          </div>
        </div>
      </div>

      {/* peek card */}
      {peek && byId.get(peek) && <PeekCard p={byId.get(peek)} teams={teams} pins={pins} byId={byId} allPlayers={allPlayers} teamOf={teamOf} readOnly={readOnly}
        onClose={() => setPeek(null)} onMove={(tid) => { const pl = byId.get(peek); const t = tid === null ? null : teams.find((x) => x.id === tid); doMoves([{ player_id: peek, team_id: tid }], { note: `${fullName(pl)} → ${t ? t.name : "pool"}` }); }}
        onCaptain={(t) => setCaptain(t, byId.get(peek))} onPins={savePins} />}

      {/* modals */}
      {modal?.kind === "newteam" && <TextModal title="Add a team" label="Team name" cta="Add team" onClose={() => setModal(null)} onSubmit={async (v) => { await addTeam(v); setModal(null); }} />}
      {modal?.kind === "teamedit" && <TeamEditModal team={modal.team} onClose={() => setModal(null)} onSave={async (b) => { await patchTeam(modal.team.id, b); setModal(null); }} onDelete={async () => { setModal(null); await delTeam(modal.team); }} />}
      {modal?.kind === "balance" && <BalanceModal teams={teams} pool={pool} pins={pins} cfg={cfg} th={th} MAX={MAX} initialMode={modal.mode} onClose={() => setModal(null)}
        onApply={async (moves) => { setModal(null); if (moves.length) { const ok = await doMoves(moves.map((m) => ({ player_id: m.player_id, team_id: m.to })), { type: "auto", note: `Auto-balance (${moves.length} moves)` }); if (ok) flash(`Applied ${moves.length} move${moves.length > 1 ? "s" : ""}. Undo is available.`); } }} />}
      {modal?.kind === "swaps" && <SwapsModal teams={teams} pins={pins} cfg={cfg} MAX={MAX} onClose={() => setModal(null)}
        onApply={async (s) => { setModal(null); await doMoves([{ player_id: s.a.id, team_id: s.teamB }, { player_id: s.b.id, team_id: s.teamA }], { note: `Swap ${fullName(s.a)} ⇄ ${fullName(s.b)}` }); }} />}
      {modal?.kind === "plans" && <PlansModal plans={data.plans} readOnly={readOnly} onClose={() => setModal(null)}
        onSave={async (name) => { try { await call("/rosters/plans", "POST", { division: data.division, name }); flash("Plan saved"); } catch (e) { flash(e.message, "err"); } }}
        onRestore={async (id) => { if (guard()) return; try { await call("/rosters/plans/restore", "POST", { division: data.division, plan_id: id }); setUndo([]); flash("Plan restored"); setModal(null); } catch (e) { flash(e.message, "err"); } }}
        onDelete={async (id) => { try { await call(`/rosters/plans/${id}`, "DELETE"); } catch (e) { flash(e.message, "err"); } }} />}
      {modal?.kind === "publish" && <PublishModal data={data} readOnly={readOnly} teams={teams} onClose={() => setModal(null)} call={call} flash={flash} lockAll={lockAll} />}
      {modal?.kind === "print" && <Modal title="Print rosters / Reveal" onClose={() => setModal(null)} width={440}>
        <p style={{ marginTop: 0, color: MUTED, fontSize: 14 }}>Print one clean card per team (names and positions only — no emails, ages, or payment info), or run a reveal where each team's players appear one click at a time.</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn("primary")} onClick={() => { setModal(null); setPrinting(true); window.setTimeout(() => { window.print(); setPrinting(false); }, 150); }}>Print roster cards</button>
          <button style={btn()} onClick={() => { setModal(null); setReveal({ i: 0, shown: 0 }); }}>Start reveal</button>
        </div>
      </Modal>}

      {printing && <div className="grsh-print" style={{ position: "fixed", inset: 0, background: WHITE, zIndex: 99999, padding: 24, overflow: "auto" }}>
        <h1 style={{ fontFamily: F_HEAD }}>{data.division_label} — Rosters</h1>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 16 }}>
          {teams.map((t) => <div key={t.id} style={{ border: `2px solid ${t.colour}`, borderRadius: 10, padding: 12, breakInside: "avoid" }}>
            <h2 style={{ margin: "0 0 8px", fontFamily: F_HEAD, color: t.colour }}>{t.name}</h2>
            {[...t.players].sort((a, b) => a.last_name.localeCompare(b.last_name)).map((p) => <div key={p.id} style={{ display: "flex", gap: 8, padding: "2px 0", fontSize: 14 }}><span style={{ width: 54, color: SOFT }}>{POS_LABEL[effPos(p)] || ""}</span><span>{fullName(p)}{t.captain_player_id === p.id ? " (C)" : ""}</span></div>)}
          </div>)}
        </div>
      </div>}

      {reveal && teams[reveal.i] && <RevealView teams={teams} state={reveal} setState={setReveal} />}

      {toast && <div role="status" style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: toast.kind === "err" ? "#991B1B" : INK, color: WHITE, padding: "10px 18px", borderRadius: 10, zIndex: 100001, fontSize: 14, maxWidth: "80vw" }}>{toast.msg}</div>}
    </div>
  );
}

// ─── peek card ───────────────────────────────────────────────────────────────
function PeekCard({ p, teams, pins, byId, allPlayers, teamOf, readOnly, onClose, onMove, onCaptain, onPins }) {
  const tier = tierOf(p), bd = scoreBreakdown(tier, p.years_experience || 0, 0), cur = teamOf[p.id] ?? null, team = teams.find((t) => t.id === cur);
  const mine = pins.filter((x) => x.a === p.id || x.b === p.id);
  const [other, setOther] = useState(""), [type, setType] = useState("together");
  const others = allPlayers.filter((x) => x.id !== p.id).sort((a, b) => a.last_name.localeCompare(b.last_name));
  return (
    <div style={{ position: "fixed", top: 40, right: 0, bottom: 0, width: 330, background: WHITE, borderLeft: `1px solid ${LINE}`, boxShadow: "-8px 0 30px rgba(0,0,0,.12)", zIndex: 90000, padding: 16, overflowY: "auto", fontFamily: F_UI, color: INK }}>
      <div style={{ display: "flex", alignItems: "center" }}><h3 style={{ margin: 0, fontFamily: F_HEAD, fontSize: 20, flex: 1 }}>{fullName(p)}</h3><button style={btn("ghost", { padding: "3px 9px" })} onClick={onClose} aria-label="Close player card">✕</button></div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
        <PosDot p={p} /><span style={chip(TIER_COLOR(tier))}>Tier {tier || "—"}</span>
        {formatReturningBadge((p.returning_seasons || []).length) && <span style={chip({ bg: "#F3E8FF", color: "#6B21A8" })}>{formatReturningBadge((p.returning_seasons || []).length)}</span>}
        {p.sandbagging_flag && <span style={chip({ bg: "#FEE2E2", color: "#991B1B" })}>Sandbagging flag</span>}
      </div>
      <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}><tbody>
        {[["Score", scoreOf(p).toFixed(1)], ["Age", p.age ?? "—"], ["Years played", p.years_experience ?? "—"], ["Payment", p.payment_status], ["Returning seasons", (p.returning_seasons || []).length ? p.returning_seasons.join(", ") : "New"], ["Team", team ? team.name : "Unassigned"]].map(([k, v]) => (
          <tr key={k}><td style={{ padding: "4px 0", color: SOFT }}>{k}</td><td style={{ padding: "4px 0", textAlign: "right", fontWeight: 600 }}>{v}</td></tr>))}
      </tbody></table>
      <div style={{ background: PAPER, borderRadius: 8, padding: 10, fontSize: 12, margin: "10px 0", color: MUTED }}>
        <b>How the score is built:</b> tier {bd.tierValue} + years {bd.yearsContrib} ({bd.yearsCapped} yrs ÷ 5) = {scoreOf(p).toFixed(1)}
        {TIER_DESCRIPTIONS?.[tier] && <div style={{ marginTop: 4 }}>{TIER_DESCRIPTIONS[tier]}</div>}
      </div>
      {!readOnly && <>
        <label style={{ fontSize: 12, fontWeight: 700, color: SOFT }}>MOVE TO</label>
        <select value={cur ?? ""} onChange={(e) => onMove(e.target.value === "" ? null : Number(e.target.value))} style={{ width: "100%", padding: 8, border: `1px solid ${LINE}`, borderRadius: 8, margin: "4px 0 8px", fontSize: 14 }}>
          <option value="">Unassigned (pool)</option>
          {teams.map((t) => <option key={t.id} value={t.id} disabled={t.locked && t.id !== cur}>{t.name}{t.locked ? " (locked)" : ""}</option>)}
        </select>
        {team && !team.locked && team.captain_player_id !== p.id && <button style={btn("ghost", { marginBottom: 10 })} onClick={() => onCaptain(team)}>Make captain of {team.name}</button>}
        <div style={{ fontSize: 12, fontWeight: 700, color: SOFT, margin: "10px 0 4px" }}>KEEP TOGETHER / APART</div>
        {mine.map((x, i) => { const o = byId.get(x.a === p.id ? x.b : x.a); return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 4 }}>
            <span style={chip(x.type === "together" ? { bg: "#DCFCE7", color: "#166534" } : { bg: "#FEE2E2", color: "#991B1B" })}>{x.type === "together" ? "Together" : "Apart"}</span>
            <span style={{ flex: 1 }}>{o ? fullName(o) : "?"}</span>
            <button style={btn("ghost", { padding: "2px 7px" })} onClick={() => onPins(pins.filter((y) => y !== x))} aria-label="Remove rule">✕</button>
          </div>); })}
        <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
          <select value={type} onChange={(e) => setType(e.target.value)} style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: 6, fontSize: 13 }}><option value="together">Together with</option><option value="apart">Apart from</option></select>
          <select value={other} onChange={(e) => setOther(e.target.value)} style={{ flex: 1, minWidth: 0, border: `1px solid ${LINE}`, borderRadius: 8, padding: 6, fontSize: 13 }}><option value="">Pick a player…</option>{others.map((o) => <option key={o.id} value={o.id}>{fullName(o)}</option>)}</select>
          <button style={btn("primary", { padding: "5px 10px" })} disabled={!other} onClick={() => { onPins([...pins.filter((y) => !((y.a === p.id && y.b === Number(other)) || (y.b === p.id && y.a === Number(other)))), { a: p.id, b: Number(other), type }]); setOther(""); }}>Add</button>
        </div>
      </>}
    </div>
  );
}

// ─── modals ──────────────────────────────────────────────────────────────────
function TextModal({ title, label, cta, onClose, onSubmit }) {
  const [v, setV] = useState("");
  return <Modal title={title} onClose={onClose} width={400} footer={<><button style={btn()} onClick={onClose}>Cancel</button><button style={btn("primary")} disabled={!v.trim()} onClick={() => onSubmit(v.trim())}>{cta}</button></>}>
    <label style={{ fontSize: 13, fontWeight: 600 }}>{label}<input autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && v.trim()) onSubmit(v.trim()); }} style={{ display: "block", width: "100%", marginTop: 6, padding: 9, border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 15, boxSizing: "border-box" }} /></label>
  </Modal>;
}

function TeamEditModal({ team, onClose, onSave, onDelete }) {
  const [name, setName] = useState(team.name), [colour, setColour] = useState(team.colour || "#666666");
  return <Modal title={`Edit ${team.name}`} onClose={onClose} width={420} footer={<><button style={btn("danger")} onClick={onDelete}>Delete team</button><span style={{ flex: 1 }} /><button style={btn()} onClick={onClose}>Cancel</button><button style={btn("primary")} onClick={() => onSave({ name, colour })}>Save</button></>}>
    <label style={{ fontSize: 13, fontWeight: 600 }}>Name<input value={name} onChange={(e) => setName(e.target.value)} style={{ display: "block", width: "100%", marginTop: 6, padding: 9, border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 15, boxSizing: "border-box" }} /></label>
    <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginTop: 12 }}>Colour <input type="color" value={colour} onChange={(e) => setColour(e.target.value)} style={{ verticalAlign: "middle", marginLeft: 8 }} /></label>
  </Modal>;
}

function BalanceModal({ teams, pool, pins, cfg, th, MAX, initialMode, onClose, onApply }) {
  const [mode, setMode] = useState(initialMode);
  const prop = useMemo(() => proposeBalance(teams, pool, pins, cfg, { mode, max: MAX }), [teams, pool, pins, cfg, mode, MAX]);
  const [off, setOff] = useState({});               // player ids the user unticked
  useEffect(() => setOff({}), [mode]);
  const accepted = (prop.moves || []).filter((m) => !off[m.player_id]);
  const after = useMemo(() => {
    const asg = assignMap(teams); accepted.forEach((m) => { if (m.to === null) delete asg[m.player_id]; else asg[m.player_id] = m.to; });
    const all = [...pool, ...teams.flatMap((t) => t.players)];
    return teams.map((t) => ({ ...t, players: all.filter((p) => asg[p.id] === t.id) }));
  }, [teams, pool, accepted]);
  const sBefore = teamStats(teams, MAX), sAfter = teamStats(after, MAX);
  const viol = pinViolations(pins, after);
  const nameOf = (id) => (id === null ? "Pool" : teams.find((t) => t.id === id)?.name || "?");
  return <Modal title="Auto-balance" onClose={onClose} width={700}
    footer={<><button style={btn()} onClick={onClose}>Cancel</button><button style={btn("primary")} disabled={!accepted.length} onClick={() => onApply(accepted)}>Apply {accepted.length} move{accepted.length === 1 ? "" : "s"}</button></>}>
    <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
      <button style={btn(mode === "fill" ? "primary" : "ghost")} onClick={() => setMode("fill")}>Fill only (keep current rosters)</button>
      <button style={btn(mode === "rebalance" ? "primary" : "ghost")} onClick={() => setMode("rebalance")}>Rebalance everything</button>
    </div>
    {prop.error ? <p style={{ color: "#991B1B" }}>{prop.error}</p> : <>
      <p style={{ margin: "0 0 8px", fontSize: 13, color: MUTED }}>Nothing is saved until you press Apply. Untick any move you don't want. Locked teams are never touched. Goalies, keep-together and keep-apart rules are respected.</p>
      <div style={{ fontSize: 14, marginBottom: 10 }}>Spread between teams: <b style={{ fontFamily: F_NUM }}>{spreadOf(sBefore).toFixed(1)}</b> → <b style={{ fontFamily: F_NUM }}>{spreadOf(sAfter).toFixed(1)}</b> pts</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {after.map((t) => { const b = sBefore.rows.find((r) => r.id === t.id), a = sAfter.rows.find((r) => r.id === t.id), band = BAND[bandOf(a?.parity ?? null, th)];
          return <div key={t.id} style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: "5px 9px", fontSize: 12 }}><b style={{ color: t.colour }}>{t.name}</b><div>{t.players.length} players · avg {a?.raw != null ? a.raw.toFixed(1) : "—"}</div><div style={{ color: band.color }}>Balance {b?.parity != null ? b.parity.toFixed(0) : "—"} → {a?.parity != null ? a.parity.toFixed(0) : "—"} ({band.label})</div></div>; })}
      </div>
      {viol.length > 0 && <div style={{ background: "#FEF3C7", color: "#92400E", borderRadius: 8, padding: "6px 10px", fontSize: 12, marginBottom: 8 }}>With your selection, {viol.length} keep-together / keep-apart rule(s) would be broken.</div>}
      {prop.moves.length === 0 && <p style={{ color: SOFT }}>No changes proposed — this is already the best arrangement I can find.</p>}
      <div style={{ display: "grid", gap: 3 }}>
        {prop.moves.map((m) => <label key={m.player_id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, padding: "4px 6px", borderRadius: 6, background: off[m.player_id] ? "#F9F9F6" : "#F6FAF6", cursor: "pointer" }}>
          <input type="checkbox" checked={!off[m.player_id]} onChange={() => setOff((o) => ({ ...o, [m.player_id]: !o[m.player_id] }))} />
          <PosDot p={m.player} /><span style={{ flex: 1 }}>{fullName(m.player)} <span style={{ color: SOFT }}>({tierOf(m.player) || "—"}, {scoreOf(m.player).toFixed(1)})</span></span>
          <span style={{ color: SOFT }}>{nameOf(m.from)} → <b style={{ color: INK }}>{nameOf(m.to)}</b></span>
        </label>)}
      </div>
    </>}
  </Modal>;
}

function SwapsModal({ teams, pins, cfg, MAX, onClose, onApply }) {
  const list = useMemo(() => findSwaps(teams, pins, cfg, { limit: 6, max: MAX }), [teams, pins, cfg, MAX]);
  const nm = (id) => teams.find((t) => t.id === id)?.name || "?";
  return <Modal title="Swap finder" onClose={onClose} width={620}>
    <p style={{ marginTop: 0, fontSize: 13, color: MUTED }}>One-for-one swaps between open teams that improve balance without breaking goalie or keep-together / keep-apart rules.</p>
    {list.length === 0 && <p style={{ color: SOFT }}>No swap improves things. The teams are about as even as these players allow.</p>}
    {list.map((s, i) => <div key={i} style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: 10, marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, fontSize: 13 }}>
        <div><b>{fullName(s.a)}</b> <span style={{ color: SOFT }}>({nm(s.teamA)}, {scoreOf(s.a).toFixed(1)})</span> ⇄ <b>{fullName(s.b)}</b> <span style={{ color: SOFT }}>({nm(s.teamB)}, {scoreOf(s.b).toFixed(1)})</span></div>
        <div style={{ color: MUTED, fontSize: 12 }}>Spread {s.spreadBefore.toFixed(1)} → {s.spreadAfter.toFixed(1)} pts{s.samePos ? " · same position" : " · different positions"}</div>
      </div>
      <button style={btn("primary")} onClick={() => onApply(s)}>Apply</button>
    </div>)}
  </Modal>;
}

function PlansModal({ plans, readOnly, onClose, onSave, onRestore, onDelete }) {
  const [name, setName] = useState("");
  return <Modal title="Plans (saved versions)" onClose={onClose} width={520}>
    <p style={{ marginTop: 0, fontSize: 13, color: MUTED }}>Save the current rosters under a name to try another idea, then come back to it. Restoring only moves players — it never deletes anyone.</p>
    <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Balanced v2" style={{ flex: 1, padding: 8, border: `1px solid ${LINE}`, borderRadius: 8 }} />
      <button style={btn("primary")} onClick={() => { onSave(name); setName(""); }}>Save current</button>
    </div>
    {plans.length === 0 && <p style={{ color: SOFT, fontSize: 13 }}>No saved plans yet.</p>}
    {plans.map((p) => <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: `1px solid ${LINE}` }}>
      <div style={{ flex: 1 }}><b>{p.name}</b><div style={{ fontSize: 12, color: SOFT }}>{p.created_at}{p.by ? ` · ${p.by}` : ""} · {p.count} players</div></div>
      <button style={btn()} disabled={readOnly} onClick={() => onRestore(p.id)}>Restore</button>
      <button style={btn("ghost")} onClick={() => onDelete(p.id)} aria-label={`Delete plan ${p.name}`}>✕</button>
    </div>)}
  </Modal>;
}

function PublishModal({ data, readOnly, teams, onClose, call, flash, lockAll }) {
  const [sp, setSp] = useState(null), [busy, setBusy] = useState(false);
  const fails = data.gate.filter((g) => g.level === "fail"), published = data.stage === "published";
  const ICON = { ok: "✅", warn: "⚠️", fail: "⛔" };
  const copy = (t) => { try { navigator.clipboard.writeText(t); flash("Link copied"); } catch (e) { flash("Copy failed — select and copy the link manually.", "err"); } };
  const toggleReview = async (enable) => { try { await call("/rosters/review", "POST", { division: data.division, enable }); } catch (e) { flash(e.message, "err"); } };
  const checkSp = async () => { try { setSp(await call(`/rosters/sportspress?division=${encodeURIComponent(data.division)}`)); } catch (e) { flash(e.message, "err"); } };
  const publish = async (resend) => {
    if (!window.confirm(resend ? "Email every rostered player again?" : "Publish rosters and email each rostered player their team?")) return;
    setBusy(true);
    try { const r = await call("/rosters/publish", "POST", { division: data.division, resend }); const pr = r.publish_result || {}; flash(`Published. Emails sent: ${pr.sent || 0}, failed: ${pr.failed || 0}, skipped: ${pr.skipped || 0}`); }
    catch (e) { flash(e.message, "err"); } finally { setBusy(false); }
  };
  return <Modal title="Review & publish" onClose={onClose} width={640}
    footer={published ? <button style={btn()} disabled={busy} onClick={() => publish(true)}>Resend emails</button>
      : <button style={btn("primary")} disabled={busy || fails.length > 0} onClick={() => publish(false)} title={fails.length ? "Fix the blockers first" : ""}>Publish & email players</button>}>
    <h4 style={{ margin: "0 0 6px", fontFamily: F_HEAD }}>Checklist</h4>
    {data.gate.map((g) => <div key={g.key} style={{ fontSize: 14, padding: "3px 0" }}>{ICON[g.level]} {g.text}</div>)}
    {!published && <div style={{ margin: "10px 0" }}>
      <button style={btn()} onClick={() => lockAll(true)} disabled={!teams.length}>Lock all teams</button>{" "}
      <button style={btn("ghost")} onClick={() => lockAll(false)} disabled={!teams.length}>Unlock all</button>
    </div>}
    <h4 style={{ margin: "16px 0 6px", fontFamily: F_HEAD }}>Committee review link</h4>
    {data.review.active ? <>
      <div style={{ display: "flex", gap: 6 }}><input readOnly value={data.review.url} onFocus={(e) => e.target.select()} style={{ flex: 1, padding: 8, border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 12 }} /><button style={btn()} onClick={() => copy(data.review.url)}>Copy</button><button style={btn("ghost")} onClick={() => toggleReview(false)}>Turn off</button></div>
      <p style={{ fontSize: 12, color: SOFT, margin: "6px 0" }}>Anyone with this link can view rosters (names, positions and tier only) and leave comments or approve a team. Turn it off when you are done.</p>
      {teams.map((t) => <div key={t.id} style={{ fontSize: 13 }}>{(data.review.approvals[t.id] || []).length ? "✅" : "⬜"} {t.name}{(data.review.approvals[t.id] || []).length ? ` — approved by ${data.review.approvals[t.id].join(", ")}` : ""}</div>)}
      {data.review.comments.length > 0 && <div style={{ marginTop: 8 }}>{data.review.comments.map((c) => <div key={c.id} style={{ fontSize: 13, background: PAPER, borderRadius: 8, padding: "6px 10px", marginBottom: 4 }}><b>{c.name}</b>{c.team_id ? ` on ${teams.find((t) => t.id === c.team_id)?.name || "a team"}` : ""}: {c.text}</div>)}</div>}
    </> : <button style={btn()} disabled={readOnly} onClick={() => toggleReview(true)}>Create review link</button>}
    {published && data.published.url && <><h4 style={{ margin: "16px 0 6px", fontFamily: F_HEAD }}>Public roster page</h4>
      <div style={{ display: "flex", gap: 6 }}><input readOnly value={data.published.url} onFocus={(e) => e.target.select()} style={{ flex: 1, padding: 8, border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 12 }} /><button style={btn()} onClick={() => copy(data.published.url)}>Copy</button></div></>}
    <h4 style={{ margin: "16px 0 6px", fontFamily: F_HEAD }}>SportsPress check (dry run)</h4>
    <p style={{ fontSize: 12, color: SOFT, margin: "0 0 6px" }}>Shows which teams and players already exist in SportsPress. Nothing is created or changed.</p>
    <button style={btn()} onClick={checkSp}>Run check</button>
    {sp && (!sp.available ? <p style={{ fontSize: 13, color: SOFT }}>SportsPress is not active on this site.</p> : <div style={{ marginTop: 8, fontSize: 13 }}>
      <div><b>{sp.unmatched_teams}</b> team(s) and <b>{sp.unmatched_players}</b> player(s) have no SportsPress match by name.</div>
      {sp.teams.map((t) => <div key={t.team} style={{ marginTop: 4 }}>{t.matched ? "✅" : "⛔"} {t.team}{t.players.filter((p) => !p.matched).length ? <span style={{ color: SOFT }}> — no match: {t.players.filter((p) => !p.matched).map((p) => p.name).join(", ")}</span> : ""}</div>)}
    </div>)}
  </Modal>;
}

function RevealView({ teams, state, setState }) {
  const t = teams[state.i], players = [...t.players].sort((a, b) => scoreOf(b) - scoreOf(a));
  const next = useCallback(() => setState((s) => (s.shown < players.length ? { ...s, shown: s.shown + 1 } : s.i < teams.length - 1 ? { i: s.i + 1, shown: 0 } : s)), [players.length, teams.length, setState]);
  useEffect(() => { const h = (e) => { if (e.key === "Escape") setState(null); else if (e.key === " " || e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); next(); } }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [next, setState]);
  return <div onClick={next} style={{ position: "fixed", inset: 0, background: "#0f1020", color: WHITE, zIndex: 100002, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: F_UI, cursor: "pointer" }}>
    <div style={{ position: "absolute", top: 16, right: 20 }}><button style={btn("ghost")} onClick={(e) => { e.stopPropagation(); setState(null); }}>Exit (Esc)</button></div>
    <h1 style={{ fontFamily: F_HEAD, fontSize: 64, margin: 0, color: t.colour === "#666666" ? GOLD : t.colour }}>{t.name}</h1>
    <div style={{ marginTop: 24, display: "grid", gap: 8, minHeight: 300 }}>
      {players.slice(0, state.shown).map((p) => <div key={p.id} style={{ fontSize: 30, display: "flex", gap: 16 }}><span style={{ width: 120, color: "#9aa" }}>{POS_LABEL[effPos(p)] || ""}</span><span>{fullName(p)}{t.captain_player_id === p.id ? " (C)" : ""}</span></div>)}
    </div>
    <div style={{ position: "absolute", bottom: 20, color: "#889", fontSize: 14 }}>Click, Space or → to reveal · Team {state.i + 1} of {teams.length} · {state.shown}/{players.length}</div>
  </div>;
}
