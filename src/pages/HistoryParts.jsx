// Player History: the page's own building blocks (banner, KPI chips, filters, table, menus, toast). Rules live in historyEngine.js.
import { Component, useEffect, useRef, useState } from "react";
import {
  DIVISION_LABEL, DIVISION_KEYS, DIVISION_COLOR, TIER_COLOR, TREND, GAP_FILTER_LABEL, EMPTY_COL_NOTE, MONO, fL, sel, TH, TD,
  titleCase, tierTrend, tierDelta, latestTier, highlightParts, adminUrl,
} from "./historyShared.js";
import { TierSparkline, DNAAvatar } from "./HistoryWidgets.jsx";

const ghost = { fontFamily: MONO, fontSize: 12, background: "#F6F5F0", color: "#333", border: "1px solid #D8D6CE", padding: "6px 12px", borderRadius: 7, cursor: "pointer", height: 32, whiteSpace: "nowrap" };
const dark = { ...ghost, background: "#1a1a2e", color: "#D4A017", border: "1px solid #1a1a2e" };
const menuBox = { position: "absolute", right: 0, top: "calc(100% + 4px)", background: "#fff", border: "1px solid #D8D6CE", borderRadius: 10, padding: 6, zIndex: 300, minWidth: 210, boxShadow: "0 8px 32px rgba(0,0,0,.14)", textAlign: "left" };
const menuItem = { display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "8px 12px", fontSize: 13, fontFamily: MONO, cursor: "pointer", borderRadius: 6, color: "#222", textDecoration: "none", boxSizing: "border-box" };

/** Close a popup on a click outside or Escape. Escape is marked handled so the page does not also close the drawer. */
export function useDismiss(ref, open, close) {
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); };
    const key = (e) => { if (e.key === "Escape") { e.preventDefault(); close(); } };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open, ref, close]);
}

// ─── Error boundary: one broken widget should not blank the whole page ───────
export class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { try { console.error("Player History:", this.props.label, err); } catch (e) { /* ignore */ } }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div role="alert" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 10, padding: "12px 16px", margin: 12, color: "#991B1B", fontSize: 14 }}>
        <b>{this.props.label || "This part"} hit a problem and was switched off.</b> The rest of the page still works.
        <div style={{ marginTop: 8 }}>
          <button type="button" style={ghost} onClick={() => { this.setState({ err: null }); if (this.props.onReset) this.props.onReset(); }}>Try again</button>
        </div>
      </div>
    );
  }
}

/** Text with the search terms marked. */
export function Hl({ text, terms }) {
  const parts = highlightParts(text, terms);
  if (parts.length === 1 && !parts[0].hit) return <>{parts[0].t}</>;
  return <>{parts.map((x, i) => (x.hit ? <mark key={i} style={{ background: "#FDE68A", color: "inherit", borderRadius: 2, padding: 0 }}>{x.t}</mark> : <span key={i}>{x.t}</span>))}</>;
}

// ─── Freshness + review summary ──────────────────────────────────────────────
export function FreshnessLine({ overview, overviewErr, fresh }) {
  const lastImp = overview && overview.last_import;
  const tone = fresh.level === "old" ? { bg: "#FEF2F2", bd: "#FCA5A5", fg: "#991B1B" } : fresh.level === "stale" || fresh.level === "none" ? { bg: "#FFFBEB", bd: "#FDE68A", fg: "#92400E" } : null;
  return (
    <div style={{ marginTop: 6 }}>
      <p style={{ fontFamily: MONO, fontSize: 12, color: "#555", margin: 0 }}>
        {lastImp ? <>Source: {lastImp.file || "import file"} · imported by {lastImp.by || "unknown"} · {lastImp.at} · {lastImp.imported} added, {lastImp.updated} updated{lastImp.skipped ? `, ${lastImp.skipped} skipped` : ""} </> : overviewErr ? "Import details unavailable. " : "No import recorded. "}
        <a href={adminUrl("grsh-tm-history-import")} style={{ color: "#1a1a2e" }}>Import History →</a>
      </p>
      {tone && !overviewErr && (
        <div role="status" style={{ marginTop: 8, background: tone.bg, border: `1px solid ${tone.bd}`, color: tone.fg, borderRadius: 8, padding: "8px 12px", fontSize: 13, maxWidth: 640 }}>
          <b>{fresh.text}</b>{fresh.level === "old" || fresh.level === "stale" ? " Tiers and attendance here may be older than what players did last season. Re-import before using this for the draft." : " Import the past seasons so tiers and attendance can be checked."}
        </div>
      )}
    </div>
  );
}

export function ReviewSummary({ items, onGap, onTab, ready }) {
  if (!ready) return null;
  if (!items.length) return <p style={{ fontFamily: MONO, fontSize: 12, color: "#166534", margin: "8px 0 0" }}>✓ All data checks are clear.</p>;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }} aria-label="What needs review">
      {items.map((it, i) => (
        <button key={i} type="button" onClick={() => (it.tab === "gaps" ? onGap(it.key) : onTab(it.tab))}
          style={{ fontFamily: MONO, fontSize: 12, background: "#FEF3C7", color: "#7A4A0A", border: "1px solid #FDE68A", borderRadius: 99, padding: "3px 10px", cursor: "pointer" }}>
          <b>{it.count}</b> {it.label}
        </button>
      ))}
    </div>
  );
}

// ─── KPI chips (these are the quick filters) ─────────────────────────────────
export function KpiBar({ s, f, toggle, recentCount }) {
  const chips = [
    { k: "total", label: "On record", val: s.total, color: "#1a1a2e" },
    { k: "champs", label: "Past champions", val: s.champions, color: "#92400E", on: f.champs, tip: "Players who won a championship in any season." },
    { k: "captains", label: "Captains", val: s.captainsTracked ? s.captains : null, color: "#4C1D95", on: f.captains, tip: s.captainsTracked ? "Players who captained a team in any season." : "No season is marked as captain, so this is not tracked in the imported data yet." },
    { k: "warn", label: "Sandbagging flags", val: s.sandbagging, color: "#991B1B", on: f.warn, tip: "Players the committee flagged for playing below their real level. A zero means nobody has been flagged." },
    { k: "noShow", label: "Has no-shows", val: s.noShowsKnown ? s.noShows : null, color: "#7A4518", on: f.noShow, tip: s.noShowsKnown ? "Players with at least one no-show." : "No season has attendance recorded, so no-shows cannot be counted yet." },
    { k: "recent", label: "Active recently", val: recentCount, color: "#166534", on: f.recent, tip: "Played in the latest season or the one before it." },
  ];
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }} role="group" aria-label="Quick filters">
      {chips.map((c) => {
        const tracked = c.val !== null;
        const clickable = c.k !== "total" && tracked;
        return (
          <button type="button" key={c.k} onClick={clickable ? () => toggle(c.k) : undefined} disabled={!clickable && c.k !== "total"}
            aria-pressed={clickable ? !!c.on : undefined} title={c.tip}
            style={{ font: "inherit", display: "flex", alignItems: "center", gap: 8, background: c.on ? "#E8E6DF" : "#fff", border: `1px solid ${c.on ? "#1a1a2e" : "#D8D6CE"}`, borderRadius: 99, padding: "5px 14px", cursor: clickable ? "pointer" : "default", opacity: tracked ? 1 : 0.85 }}>
            <span style={{ fontFamily: "'Fraunces',serif", fontSize: tracked ? 16 : 12, fontWeight: 700, color: tracked ? c.color : "#555", lineHeight: 1 }}>{tracked ? c.val : "Not tracked yet"}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: "#555", textTransform: "uppercase", letterSpacing: ".05em" }}>{c.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Coverage strip ──────────────────────────────────────────────────────────
const COVER_GAP = { tier: "no_tier", division: "no_division", team: "no_team", attendance: "no_games", email: "no_email" };
export function CoverageStrip({ cov, onShowGap }) {
  if (!cov.length || !cov[0].total) return null;
  return (
    <div style={{ background: "#fff", border: "1px solid #E8E6DF", borderRadius: 10, padding: "8px 14px", marginBottom: 12 }}>
      <div style={{ fontFamily: MONO, fontSize: 12, color: "#555", marginBottom: 6 }}>How complete the records are (players with at least one season filled in)</div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        {cov.map((c) => (
          <button key={c.key} type="button" disabled={c.pct === 100} onClick={() => onShowGap(COVER_GAP[c.key])} title={c.pct === 100 ? "Complete" : `Show the ${c.total - c.count} players missing this`}
            style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: c.pct === 100 ? "default" : "pointer", minWidth: 110 }}>
            <div style={{ fontFamily: MONO, fontSize: 12, color: "#333" }}>{c.label} <b style={{ color: c.pct >= 90 ? "#166534" : c.pct >= 50 ? "#92400E" : "#991B1B" }}>{c.pct}%</b></div>
            <div style={{ height: 5, background: "#F0EEE8", borderRadius: 99, marginTop: 3, overflow: "hidden" }}>
              <div style={{ width: `${c.pct}%`, height: "100%", background: c.pct >= 90 ? "#22c55e" : c.pct >= 50 ? "#D4A017" : "#EF4444" }} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Saved views ─────────────────────────────────────────────────────────────
export function SavedViews({ builtin, saved, activeId, onApply, onSave, onDelete, canSave }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const pill = (v, mine) => (
    <span key={v.id} style={{ display: "inline-flex", alignItems: "center" }}>
      <button type="button" onClick={() => onApply(v)} aria-pressed={activeId === v.id}
        style={{ ...ghost, height: 28, padding: "3px 10px", background: activeId === v.id ? "#1a1a2e" : "#fff", color: activeId === v.id ? "#D4A017" : "#333", borderRadius: mine ? "99px 0 0 99px" : 99 }}>{v.name}</button>
      {mine && <button type="button" aria-label={`Delete saved view ${v.name}`} onClick={() => onDelete(v)} style={{ ...ghost, height: 28, padding: "3px 8px", borderRadius: "0 99px 99px 0", borderLeft: "none", background: "#fff", color: "#555" }}>✕</button>}
    </span>
  );
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
      <span style={{ fontFamily: MONO, fontSize: 12, color: "#555" }}>Views:</span>
      {builtin.map((v) => pill(v, false))}
      {saved.map((v) => pill(v, true))}
      {naming ? (
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onSave(name.trim()); setName(""); setNaming(false); } }} style={{ display: "inline-flex", gap: 4 }}>
          <input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Name this view" aria-label="Name for the saved view" style={{ ...sel, minWidth: 150 }} />
          <button type="submit" style={dark} disabled={!name.trim()}>Save</button>
          <button type="button" style={ghost} onClick={() => { setNaming(false); setName(""); }}>Cancel</button>
        </form>
      ) : (
        <button type="button" style={{ ...ghost, height: 28, padding: "3px 10px" }} disabled={!canSave} title={canSave ? "Keep the current filters and sort as a view on this computer" : "Turn on a filter first"} onClick={() => setNaming(true)}>+ Save current view</button>
      )}
    </div>
  );
}

// ─── Filter bar ──────────────────────────────────────────────────────────────
export function FilterBar({ f, set, seasons, searchRef, onClear, activeCount, children }) {
  return (
    <div style={{ padding: "10px 14px", display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 240px", maxWidth: 360 }}>
        <label htmlFor="hx-search" style={fL}>Search <span style={{ textTransform: "none", letterSpacing: 0, color: "#555" }}>(press / to jump here)</span></label>
        <div style={{ position: "relative" }}>
          <span aria-hidden="true" style={{ position: "absolute", top: 6, left: 9, color: "#555", fontSize: 14, pointerEvents: "none" }}>⌕</span>
          <input id="hx-search" ref={searchRef} value={f.q} onChange={(e) => set("q", e.target.value)} placeholder='Name, email, tier, team… e.g. kevin kings'
            style={{ ...sel, width: "100%", boxSizing: "border-box", paddingLeft: 26, background: "#fff" }} />
        </div>
      </div>
      <div><label htmlFor="hx-div" style={fL}>Prior division</label>
        <select id="hx-div" value={f.div} onChange={(e) => set("div", e.target.value)} style={sel}><option value="">All divisions</option>{DIVISION_KEYS.map((d) => <option key={d} value={d}>{DIVISION_LABEL[d]}</option>)}</select></div>
      <div><label htmlFor="hx-season" style={fL}>Season</label>
        <select id="hx-season" value={f.season} onChange={(e) => set("season", e.target.value)} style={sel}><option value="">All seasons</option>{seasons.map((y) => <option key={y} value={y}>{y}</option>)}</select></div>
      <div><label htmlFor="hx-rel" style={fL}>Attendance</label>
        <select id="hx-rel" value={f.reliability} onChange={(e) => set("reliability", e.target.value)} style={sel}>
          <option value="">Any</option><option value="perfect">Perfect (100%)</option><option value="concern">Under 80%</option><option value="noshows">Has no-shows</option></select></div>
      <div><label htmlFor="hx-miss" style={fL}>Missing data</label>
        <select id="hx-miss" value={f.missing} onChange={(e) => set("missing", e.target.value)} style={sel}>
          <option value="">Nothing selected</option>{Object.keys(GAP_FILTER_LABEL).map((k) => <option key={k} value={k}>{GAP_FILTER_LABEL[k]}</option>)}</select></div>
      {activeCount > 0 && <button type="button" onClick={onClear} style={{ ...ghost, background: "#FEE2E2", color: "#991B1B", borderColor: "#FCA5A5" }}>Clear all ({activeCount})</button>}
      {children}
    </div>
  );
}

export function ActiveChips({ chips, onRemove, restored }) {
  if (!chips.length) return null;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "0 14px 10px", alignItems: "center" }} aria-label="Active filters">
      {restored && <span style={{ fontFamily: MONO, fontSize: 12, color: "#7A4A0A", background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 99, padding: "2px 10px" }}>Filters restored from your last visit</span>}
      {chips.map((c) => (
        <span key={c.key} style={{ fontFamily: MONO, fontSize: 12, background: "#EEF2FF", color: "#1a1a2e", padding: "2px 4px 2px 10px", borderRadius: 99, display: "inline-flex", alignItems: "center", gap: 2 }}>
          {c.label}
          <button type="button" onClick={() => onRemove(c.key)} aria-label={`Remove filter: ${c.label}`} style={{ background: "none", border: "none", cursor: "pointer", color: "#555", fontSize: 13, padding: "0 6px" }}>✕</button>
        </span>
      ))}
    </div>
  );
}

// ─── Columns, density, export ────────────────────────────────────────────────
export const ALL_COLS = [
  { k: "player", l: "Player" }, { k: "seasons", l: "Seasons" }, { k: "champs", l: "Championships" },
  { k: "divisions", l: "Prior divisions" }, { k: "tier", l: "Tier / trend" }, { k: "attendance", l: "Attendance" }, { k: "flags", l: "Flags" },
];

export function ColumnsMenu({ visible, onToggle, emptyCols, showEmpty, setShowEmpty }) {
  const [open, setOpen] = useState(false); const ref = useRef(null);
  useDismiss(ref, open, () => setOpen(false));
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" style={ghost} onClick={() => setOpen((o) => !o)} aria-haspopup="true" aria-expanded={open}>⊞ Columns</button>
      {open && (
        <div style={{ ...menuBox, padding: "10px 12px" }}>
          {ALL_COLS.map((c) => (
            <label key={c.k} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", cursor: c.k === "player" ? "default" : "pointer", fontFamily: MONO, fontSize: 12, color: "#333" }}>
              <input type="checkbox" checked={visible.includes(c.k)} disabled={c.k === "player"} onChange={() => onToggle(c.k)} />
              {c.l}{emptyCols.includes(c.k) ? <span style={{ color: "#555" }}> (no data)</span> : null}
            </label>
          ))}
          {emptyCols.length > 0 && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0 2px", borderTop: "1px solid #F0EEE8", marginTop: 6, fontFamily: MONO, fontSize: 12, color: "#333" }}>
              <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} /> Show columns with no data
            </label>
          )}
        </div>
      )}
    </div>
  );
}

export function DensityToggle({ density, setDensity }) {
  return (
    <div role="group" aria-label="Row size" style={{ display: "inline-flex" }}>
      {[["comfortable", "Comfortable"], ["compact", "Compact"]].map(([k, l], i) => (
        <button key={k} type="button" onClick={() => setDensity(k)} aria-pressed={density === k}
          style={{ ...ghost, borderRadius: i === 0 ? "7px 0 0 7px" : "0 7px 7px 0", background: density === k ? "#1a1a2e" : "#F6F5F0", color: density === k ? "#D4A017" : "#333", marginLeft: i ? -1 : 0 }}>{l}</button>
      ))}
    </div>
  );
}

export function ExportMenu({ filteredCount, totalCount, pickedCount, onExport }) {
  const [open, setOpen] = useState(false); const ref = useRef(null);
  useDismiss(ref, open, () => setOpen(false));
  const go = (scope) => { setOpen(false); onExport(scope); };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" style={ghost} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>↓ Export CSV ▾</button>
      {open && (
        <div role="menu" style={menuBox}>
          <button role="menuitem" type="button" style={menuItem} onClick={() => go("filtered")} disabled={!filteredCount}>What you see now ({filteredCount})</button>
          <button role="menuitem" type="button" style={menuItem} onClick={() => go("all")} disabled={!totalCount}>Every player ({totalCount})</button>
          <button role="menuitem" type="button" style={{ ...menuItem, opacity: pickedCount ? 1 : 0.5 }} onClick={() => go("selected")} disabled={!pickedCount}>Selected rows ({pickedCount})</button>
          <div style={{ fontFamily: MONO, fontSize: 12, color: "#555", padding: "6px 12px 2px" }}>Uses the columns shown in the table.</div>
        </div>
      )}
    </div>
  );
}

export function BulkBar({ count, filteredCount, onSelectAll, onCopy, onExport, onClear }) {
  if (!count) return null;
  return (
    <div role="region" aria-label="Selected players" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", background: "#1a1a2e", color: "#fff", borderRadius: 10, padding: "8px 14px", marginBottom: 10 }}>
      <b style={{ fontFamily: MONO, fontSize: 13 }}>{count} selected</b>
      {count < filteredCount && <button type="button" style={{ ...ghost, height: 28 }} onClick={onSelectAll}>Select all {filteredCount} shown by the filters</button>}
      <button type="button" style={{ ...ghost, height: 28 }} onClick={onCopy}>Copy emails</button>
      <button type="button" style={{ ...ghost, height: 28 }} onClick={onExport}>Export CSV</button>
      <button type="button" style={{ ...ghost, height: 28, marginLeft: "auto" }} onClick={onClear}>Clear selection</button>
    </div>
  );
}

// ─── Toast with optional undo ────────────────────────────────────────────────
export function Toast({ toast, onUndo, onClose }) {
  return (
    <div role="status" aria-live="polite" style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 2000, pointerEvents: toast ? "auto" : "none" }}>
      {toast && (
        <div className="hx-toast" style={{ fontFamily: MONO, fontSize: 13, fontWeight: 500, background: "#1a1a2e", color: "#D4A017", padding: "9px 12px 9px 20px", borderRadius: 99, boxShadow: "0 8px 24px rgba(0,0,0,.2)", display: "flex", alignItems: "center", gap: 12, whiteSpace: "nowrap" }}>
          <span>{toast.msg}</span>
          {toast.undo && <button type="button" onClick={onUndo} style={{ background: "#D4A017", color: "#1a1a2e", border: "none", borderRadius: 99, padding: "4px 12px", fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Undo</button>}
          <button type="button" onClick={onClose} aria-label="Dismiss message" style={{ background: "none", border: "none", color: "#D4A017", cursor: "pointer", fontSize: 14, padding: "0 4px" }}>✕</button>
        </div>
      )}
    </div>
  );
}

// ─── Table ───────────────────────────────────────────────────────────────────
function SortBtn({ k, label, sortKey, sortDir, onSort }) {
  const on = sortKey === k;
  return (
    <button type="button" onClick={() => onSort(k)} title={`Sort by ${label.toLowerCase()}`}
      style={{ background: "none", border: "none", padding: 0, margin: 0, font: "inherit", color: on ? "#1a1a2e" : "inherit", textTransform: "inherit", letterSpacing: "inherit", cursor: "pointer", fontWeight: on ? 700 : 500 }}>
      {label}<span aria-hidden="true" style={{ marginLeft: 4, opacity: on ? 1 : 0.35 }}>{on ? (sortDir === "asc" ? "↑" : "↓") : "↕"}</span>
    </button>
  );
}

function Th({ keys, sortKey, sortDir, top, children, style }) {
  const on = keys && keys.includes(sortKey);
  return <th scope="col" aria-sort={keys ? (on ? (sortDir === "asc" ? "ascending" : "descending") : "none") : undefined} style={{ ...TH, position: "sticky", top, zIndex: 10, ...style }}>{children}</th>;
}

function RowMenu({ p, onOpen, onCopyEmail, onSimilar }) {
  const [open, setOpen] = useState(false); const ref = useRef(null);
  useDismiss(ref, open, () => setOpen(false));
  const run = (fn) => (e) => { e.stopPropagation(); setOpen(false); fn(); };
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }} onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label={`More actions for ${titleCase(p.first_name)} ${titleCase(p.last_name)}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        style={{ background: open ? "#EEF2FF" : "none", border: "1px solid transparent", borderRadius: 6, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "2px 8px", color: "#333" }}>⋯</button>
      {open && (
        <div role="menu" style={menuBox}>
          <button role="menuitem" type="button" style={menuItem} onClick={run(onOpen)}>Open details</button>
          <button role="menuitem" type="button" style={{ ...menuItem, opacity: p.email ? 1 : 0.5 }} disabled={!p.email} onClick={run(onCopyEmail)}>Copy email</button>
          <button role="menuitem" type="button" style={menuItem} onClick={run(onSimilar)}>Find the same last name</button>
          <a role="menuitem" style={menuItem} href={adminUrl("grsh-tm-players")}>Open Players page →</a>
        </div>
      )}
    </div>
  );
}

function TierCell({ p, compact }) {
  const trend = tierTrend(p.history);
  const info = TREND[trend];
  const lt = latestTier(p);
  const d = tierDelta(p.history);
  const tc = TIER_COLOR(lt);
  const n = p.history.filter((h) => h.skill_tier).length;
  if (!lt) return <span title="No skill tier is recorded for this player in any season." style={{ fontFamily: MONO, fontSize: 12, color: "#991B1B" }}>No tier</span>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, background: tc.bg, color: tc.color, padding: "2px 8px", borderRadius: 99 }}>{lt}</span>
      {!compact && n > 1 && <TierSparkline history={p.history} />}
      {d ? (
        <span title={`${info.label}: ${d.from} in ${d.fromSeason} to ${d.to} in ${d.toSeason}`} style={{ fontFamily: MONO, fontSize: 12, color: info.color, fontWeight: 600 }}>
          {d.from === d.to ? "no change" : `${d.from} → ${d.to}`} <span aria-hidden="true">{info.arrow}{d.steps !== 0 ? Math.abs(d.steps) : ""}</span><span className="hx-sr"> {info.label}</span>
        </span>
      ) : (
        <span title="Not enough tier history: only one season has a tier, so there is no trend yet." style={{ fontFamily: MONO, fontSize: 12, color: "#555" }}>1 season</span>
      )}
    </div>
  );
}

function Pill({ children, bg, fg, bd, title }) {
  return <span title={title} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 500, background: bg, color: fg, padding: "1px 7px", borderRadius: 99, border: `1px solid ${bd}`, whiteSpace: "nowrap" }}>{children}</span>;
}

export function PlayersTable({ rows, cols, density, sortKey, sortDir, onSort, selectedId, onOpen, terms, latestSeason, dupIdx, picked, onPick, onPickShown, top, onCopyEmail, onSimilar, onReviewDupes, emptyState }) {
  const compact = density === "compact";
  const pad = compact ? "6px 14px" : TD.padding;
  const td = { ...TD, padding: pad };
  const allShown = rows.length > 0 && rows.every((p) => picked.has(p.id));
  const sp = { sortKey, sortDir, onSort };
  const has = (k) => cols.includes(k);
  return (
    <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 640 }}>
      <caption className="hx-sr">Players with their history, one row per player. Column headers are buttons that sort the table.</caption>
      <thead>
        <tr>
          <Th top={top} style={{ width: 34, padding: "10px 6px 10px 14px" }}><input type="checkbox" aria-label="Select every player shown" checked={allShown} onChange={(e) => onPickShown(e.target.checked)} /></Th>
          {has("player") && <Th keys={["last_name", "last_active"]} top={top} {...sp}><SortBtn k="last_name" label="Player" {...sp} /> <span style={{ opacity: 0.5 }}>·</span> <SortBtn k="last_active" label="Last active" {...sp} /></Th>}
          {has("seasons") && <Th keys={["seasons"]} top={top} {...sp}><SortBtn k="seasons" label="Seasons" {...sp} /></Th>}
          {has("champs") && <Th keys={["champs"]} top={top} {...sp}><SortBtn k="champs" label="Championships" {...sp} /></Th>}
          {has("divisions") && <Th keys={["division"]} top={top} {...sp}><SortBtn k="division" label="Prior divisions" {...sp} /></Th>}
          {has("tier") && <Th keys={["tier", "trend"]} top={top} {...sp}><SortBtn k="tier" label="Tier" {...sp} /> <span style={{ opacity: 0.5 }}>·</span> <SortBtn k="trend" label="Trend" {...sp} /></Th>}
          {has("attendance") && <Th keys={["attendance"]} top={top} {...sp}><SortBtn k="attendance" label="Attendance" {...sp} /></Th>}
          {has("flags") && <Th keys={["flags"]} top={top} {...sp}><SortBtn k="flags" label="Flags" {...sp} /></Th>}
          <Th top={top} style={{ width: 44 }}><span className="hx-sr">Actions</span></Th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && <tr><td colSpan={12} style={{ padding: "48px 24px", textAlign: "center" }}>{emptyState}</td></tr>}
        {rows.map((p) => {
          const name = `${titleCase(p.first_name)} ${titleCase(p.last_name)}`;
          const champs = p.history.filter((h) => h.championship === "winner");
          const capN = p.history.filter((h) => h.was_captain).length;
          const divs = [...new Set(p.history.map((h) => h.division).filter(Boolean))];
          const last = p.history[0] ? p.history[0].season : null;
          const recent = last != null && latestSeason && last >= latestSeason - 1;
          const inactive = last != null && latestSeason && last < latestSeason - 2;
          const sel_ = selectedId === p.id;
          const bg = sel_ ? "#EEF2FF" : p.sandbagging_flag ? "#FFFBEB" : "#fff";
          const dup = dupIdx[p.id];
          const cell = { ...td, background: bg };
          return (
            <tr key={p.id} className="hrow" data-row-id={p.id} tabIndex={0} aria-selected={sel_}
              onClick={() => onOpen(p)} onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); onOpen(p); } }}
              style={{ cursor: "pointer" }}>
              <td style={{ ...cell, width: 34, padding: "0 6px 0 14px", borderLeft: `3px solid ${sel_ ? "#1a1a2e" : p.sandbagging_flag ? "#FDE68A" : "transparent"}` }} onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" aria-label={`Select ${name}`} checked={picked.has(p.id)} onChange={() => onPick(p.id)} />
              </td>
              {has("player") && (
                <td style={cell}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {!compact && <DNAAvatar player={p} size={32} />}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: "'Fraunces',serif", fontSize: 14, fontWeight: 600, color: "#1a1a2e", display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                        <span><Hl text={name} terms={terms} /></span>
                        {champs.length > 0 && <span title="Past champion" aria-label="Past champion">🏆</span>}
                        {p.sandbagging_flag && <span title="Sandbagging flag" style={{ color: "#B91C1C" }}><span aria-hidden="true">⚠</span><span className="hx-sr">Sandbagging flag</span></span>}
                        {capN > 0 && <Pill bg="#EDE9FE" fg="#4C1D95" bd="#DDD6FE" title={`${capN}× captain`}>C</Pill>}
                        {dup && <button type="button" onClick={(e) => { e.stopPropagation(); onReviewDupes(); }} title={`${dup.why}: ${dup.other}`} style={{ background: "#FEF3C7", color: "#7A4A0A", border: "1px solid #FDE68A", borderRadius: 99, fontFamily: MONO, fontSize: 12, padding: "0 7px", cursor: "pointer" }}>Possible duplicate</button>}
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: p.email ? "#555" : "#991B1B" }}>{p.email ? <Hl text={p.email} terms={terms} /> : "No email on record"}{compact && last != null ? ` · last ${last}` : ""}</div>
                      {!compact && last != null && (
                        <div style={{ fontFamily: MONO, fontSize: 12, color: recent ? "#166534" : "#555", marginTop: 1 }}>
                          Last active {last} · {recent ? "recent" : inactive ? "inactive" : "a while ago"}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
              )}
              {has("seasons") && (
                <td style={cell}>
                  <span style={{ fontFamily: "'Fraunces',serif", fontSize: 16, fontWeight: 700, color: "#1a1a2e" }}>{p.history.length}</span>
                  <div style={{ fontFamily: MONO, fontSize: 12, marginTop: 2, color: "#555" }}>
                    {compact ? (p.history.length > 1 ? `${p.history[p.history.length - 1].season}–${p.history[0].season}` : p.history[0]?.season) : p.history.map((h, i) => <span key={h.season} style={{ marginRight: 4, color: i === 0 ? "#1a1a2e" : "#555", fontWeight: i === 0 ? 700 : 400 }}>{h.season}</span>)}
                  </div>
                </td>
              )}
              {has("champs") && (
                <td style={cell}>{champs.length > 0 ? <div><b style={{ fontFamily: "'Fraunces',serif", color: "#92400E" }}>🏆 {champs.length}×</b>{capN > 0 && <span style={{ fontFamily: MONO, fontSize: 12, color: "#555" }}> ({capN}× captain)</span>}<div style={{ fontFamily: MONO, fontSize: 12, color: "#92400E" }}>{champs.map((h) => h.season).join(", ")}</div></div> : <span style={{ color: "#555" }}>—</span>}</td>
              )}
              {has("divisions") && (
                <td style={cell}>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    {divs.slice(0, 1).map((d) => { const dc = DIVISION_COLOR[d] || {}; return <Pill key={d} bg={dc.bg || "#F6F5F0"} fg={dc.color || "#555"} bd={dc.border || "#E8E6DF"}>{DIVISION_LABEL[d] || d}</Pill>; })}
                    {divs.length === 0 && <span title="No division recorded" style={{ fontFamily: MONO, fontSize: 12, color: "#991B1B" }}>None</span>}
                    {divs.length > 1 && <span style={{ fontFamily: MONO, fontSize: 12, color: "#555", cursor: "help" }} title={divs.slice(1).map((d) => DIVISION_LABEL[d] || d).join(", ")}>+{divs.length - 1}</span>}
                  </div>
                </td>
              )}
              {has("tier") && <td style={cell}><TierCell p={p} compact={compact} /></td>}
              {has("attendance") && (
                <td style={{ ...cell, minWidth: 100 }}>
                  {p.attendance_rating != null ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 48, height: 5, background: "#F0EEE8", borderRadius: 99, overflow: "hidden", flexShrink: 0 }}><div style={{ height: "100%", width: `${p.attendance_rating}%`, background: p.attendance_rating === 100 ? "#22c55e" : p.attendance_rating >= 80 ? "#1a1a2e" : "#EF4444" }} /></div>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: p.attendance_rating >= 80 ? "#333" : "#991B1B", fontWeight: 600 }}>{p.attendance_rating}%</span>
                    </div>
                  ) : <span title="Attendance was never recorded for this player" style={{ fontFamily: MONO, fontSize: 12, color: "#555" }}>—</span>}
                  {p.no_show_count > 0 && <div style={{ fontFamily: MONO, fontSize: 12, color: "#92400E", marginTop: 2 }}>{p.no_show_count} no-show{p.no_show_count > 1 ? "s" : ""}</div>}
                </td>
              )}
              {has("flags") && (
                <td style={cell}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start" }}>
                    {p.sandbagging_flag && <Pill bg="#FEF2F2" fg="#991B1B" bd="#FCA5A5">⚠ Sandbagging</Pill>}
                    {p.no_show_count > 0 && <Pill bg="#FEF3C7" fg="#92400E" bd="#FDE68A">🚫 {p.no_show_count} no-show{p.no_show_count > 1 ? "s" : ""}</Pill>}
                    {!p.sandbagging_flag && p.no_show_count === 0 && <span style={{ color: "#555" }}>—</span>}
                  </div>
                </td>
              )}
              <td style={{ ...cell, width: 44, textAlign: "right", padding: compact ? "6px 8px 6px 4px" : "11px 8px 11px 4px" }}>
                <RowMenu p={p} onOpen={() => onOpen(p)} onCopyEmail={() => onCopyEmail(p)} onSimilar={() => onSimilar(p)} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function EmptyColumnsNote({ hidden, onShow }) {
  if (!hidden.length) return null;
  return (
    <p style={{ fontFamily: MONO, fontSize: 12, color: "#555", margin: "0 0 8px" }}>
      Hidden because no player has anything to show: {hidden.map((k) => EMPTY_COL_NOTE[k]).join("; ")}. <button type="button" onClick={onShow} style={{ background: "none", border: "none", color: "#1a1a2e", textDecoration: "underline", cursor: "pointer", font: "inherit", padding: 0 }}>Show anyway</button>
    </p>
  );
}

export function TableFooter({ shown, total, onMore, onAll }) {
  if (total === 0) return null;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", padding: "14px 0 24px", fontFamily: MONO, fontSize: 12, color: "#555" }}>
      <span>Showing {shown} of {total}</span>
      {shown < total && <button type="button" style={ghost} onClick={onMore}>Show 50 more</button>}
      {shown < total && total - shown > 50 && <button type="button" style={ghost} onClick={onAll}>Show all {total}</button>}
    </div>
  );
}

export const btnGhost = ghost;
export const btnDark = dark;
