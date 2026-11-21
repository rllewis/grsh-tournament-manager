/**
 * Full Team Rosters - list rows, filters, bulk bar, and the Remove / Restore dialogs.
 * Removal itself is done by Captain Sync's endpoints (admin-only, impact preview, typed name, history,
 * restore); this file is only the doorway to them from the Full Team Rosters page.
 */

import { useState, useEffect } from "react";
import {
  statusOf, SORTS, waiverText, waiversComplete, testReason, duplicateText, canConfirmRemove,
} from "../lib/fullTeamsEngine";

const MONO = "'DM Mono',monospace";
const SERIF = "'Fraunces',serif";

export const BAND_COLOR = {
  balanced:  { bg: "#E8F8EF", color: "#1A5C35", label: "Balanced" },
  review:    { bg: "#FEF3C7", color: "#92400E", label: "Review" },
  rebalance: { bg: "#FEE2E2", color: "#991B1B", label: "Rebalance" },
};
const STATUS_COLOR = {
  not_submitted: { bg: "#FEF3C7", color: "#92400E" },
  sent_back:     { bg: "#FFEDD5", color: "#9A3412" },
  submitted:     { bg: "#E0F2FE", color: "#075985" },
  under_review:  { bg: "#EDE9FE", color: "#5B21B6" },
  approved:      { bg: "#E8F8EF", color: "#1A5C35" },
  change_pending: { bg: "#FFEDD5", color: "#9A3412" },
};
const PAY_COLOR = {
  none:    { bg: "#F3F4F6", color: "#6B7280" },
  deposit: { bg: "#E0F2FE", color: "#075985" },
  paid:    { bg: "#E8F8EF", color: "#1A5C35" },
};

export function Pill({ bg, color, children, title }) {
  return <span title={title} style={{ display: "inline-block", background: bg, color, fontSize: 10,
    fontFamily: MONO, fontWeight: 500, padding: "1px 6px", borderRadius: 99, whiteSpace: "nowrap" }}>{children}</span>;
}

export const inp = { fontFamily: MONO, fontSize: 12, background: "#fff", border: "1px solid #E8E6DF",
  borderRadius: 6, padding: "7px 9px", color: "#1a1a2e", outline: "none", boxSizing: "border-box" };
const btn = { fontFamily: MONO, fontSize: 12, fontWeight: 600, background: "#1a1a2e", color: "#D4A017",
  border: "none", padding: "8px 14px", borderRadius: 8, cursor: "pointer" };
const btnGhost = { fontFamily: MONO, fontSize: 12, background: "#fff", color: "#1a1a2e",
  border: "1px solid #D9D6CB", padding: "7px 12px", borderRadius: 8, cursor: "pointer" };
const btnDanger = { fontFamily: MONO, fontSize: 12, fontWeight: 600, background: "#B91C1C", color: "#fff",
  border: "none", padding: "8px 14px", borderRadius: 8, cursor: "pointer" };
const btnDangerGhost = { fontFamily: MONO, fontSize: 12, fontWeight: 600, background: "#fff", color: "#B91C1C",
  border: "1px solid #FCA5A5", padding: "7px 12px", borderRadius: 8, cursor: "pointer" };

export function StatusPill({ team }) {
  const s = statusOf(team);
  const c = STATUS_COLOR[s.key] || STATUS_COLOR.submitted;
  return <Pill bg={c.bg} color={c.color}>{s.label}</Pill>;
}

// Column widths shared by the header and every row so they line up.
const W = { box: 22, players: 62, goalies: 62, waivers: 62, pay: 92, band: 112, status: 112 };

// ─── One team row ────────────────────────────────────────────────────────────
export function TeamRow({ team, selected, canManage, onToggle, onOpen }) {
  const band = BAND_COLOR[team.parity_action] || BAND_COLOR.balanced;
  const understaffed = team.player_count < team.min_players;
  const pay = PAY_COLOR[team.payment?.key] || PAY_COLOR.none;
  const dupText = duplicateText(team);
  const cell = (w, extra = {}) => ({ width: w, flexShrink: 0, fontFamily: MONO, fontSize: 11, ...extra });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: selected ? "#FFFBEB" : "#fff",
      border: `1px solid ${selected ? "#D4A017" : "#E8E6DF"}`, borderRadius: 10, marginBottom: 8, minWidth: 880 }}>
      {canManage && (
        <input type="checkbox" checked={selected} onChange={() => onToggle(team.id)}
          aria-label={`Select ${team.name} for bulk actions`} style={{ width: 16, height: 16, flexShrink: 0, cursor: "pointer" }} />
      )}
      <div onClick={() => onOpen(team)} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(team); } }}
        style={{ flex: 1, minWidth: 190, cursor: "pointer" }}>
        <div style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 700, color: "#1a1a2e", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {team.name}
          {team.looks_test && <Pill bg="#EDE9FE" color="#5B21B6" title={testReason(team)}>Test?</Pill>}
          {dupText && <Pill bg="#FEE2E2" color="#991B1B" title={`Another team has this name: ${dupText}`}>Same name as another team</Pill>}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: "#999", marginTop: 2 }}>
          {team.division_label} · Captain: {team.captain_name || "—"}{team.captain_email ? ` (${team.captain_email})` : ""}
          {team.created_at ? ` · created ${new Date(team.created_at.replace(" ", "T")).toLocaleDateString([], { dateStyle: "medium" })}` : ""}
        </div>
      </div>
      <div style={cell(W.players, { color: understaffed ? "#991B1B" : "#1a1a2e" })}
        title={`Players on the roster, out of the ${team.min_players} minimum to ${team.max_players} maximum`}>
        {team.player_count}/{team.min_players}-{team.max_players}
      </div>
      <div style={cell(W.goalies, { color: team.goalie_count < 1 ? "#991B1B" : "#1a1a2e" })}>
        {team.goalie_count} goalie{team.goalie_count === 1 ? "" : "s"}
      </div>
      <div style={cell(W.waivers, { color: waiversComplete(team) ? "#1A5C35" : "#1a1a2e" })} title="Players who have signed their waiver, out of the roster">
        {waiverText(team)}
      </div>
      <div style={cell(W.pay)}>
        <Pill bg={pay.bg} color={pay.color}>{team.payment?.label || "No deposit"}</Pill>
      </div>
      <div style={cell(W.band, { display: "flex", alignItems: "center", gap: 6 })}
        title="Balance band from the team's parity score (board view): Balanced, Review or Rebalance">
        <span style={{ fontFamily: SERIF, fontSize: 13, fontWeight: 700, color: "#1a1a2e", minWidth: 32, textAlign: "right" }}>
          {team.parity_score !== null && team.parity_score !== undefined ? team.parity_score.toFixed(1) : "—"}
        </span>
        <Pill bg={band.bg} color={band.color}>{band.label}</Pill>
      </div>
      <div style={cell(W.status)}><StatusPill team={team} /></div>
    </div>
  );
}

export function ColumnHeader({ canManage }) {
  const h = (w, t, extra = {}) => <div style={{ width: w, flexShrink: 0, ...extra }}>{t}</div>;
  return (
    <div style={{ display: "flex", gap: 12, padding: "0 14px 6px", fontFamily: MONO, fontSize: 10, color: "#999",
      textTransform: "uppercase", letterSpacing: ".05em", minWidth: 880 }}>
      {canManage && h(W.box, "")}
      <div style={{ flex: 1, minWidth: 190 }}>Team</div>
      {h(W.players, "Players")}{h(W.goalies, "Goalies")}{h(W.waivers, "Waivers")}{h(W.pay, "Payment")}{h(W.band, "Balance")}{h(W.status, "Status")}
    </div>
  );
}

// ─── Search, filters, bulk bar ───────────────────────────────────────────────
export function ListToolbar({ filters, setFilters, divisions, summary, canManage, selectedCount, shownCount,
  onSelectTest, onSelectShown, onClearSelection, onBulkRemove }) {
  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const dirty = filters.q || filters.division !== "all" || filters.status !== "all" || filters.show !== "all";
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ fontFamily: MONO, fontSize: 11, color: "#777", margin: "0 0 10px" }}>
        {summary.total} team{summary.total === 1 ? "" : "s"}
        {" · "}{summary.notSubmitted} not submitted
        {summary.needReview > 0 && ` · ${summary.needReview} waiting for review`}
        {summary.looksTest > 0 && ` · ${summary.looksTest} look like test data`}
        {summary.duplicates > 0 && ` · ${summary.duplicates} share a name with another team`}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input style={{ ...inp, flex: "1 1 220px", minWidth: 180 }} placeholder="Search team, captain, email or division"
          aria-label="Search teams" value={filters.q} onChange={(e) => set("q", e.target.value)} />
        <select style={inp} aria-label="Division" value={filters.division} onChange={(e) => set("division", e.target.value)}>
          <option value="all">All divisions</option>
          {divisions.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
        <select style={inp} aria-label="Status" value={filters.status} onChange={(e) => set("status", e.target.value)}>
          <option value="all">Any status</option>
          <option value="not_submitted">Not submitted</option>
          <option value="submitted">Submitted</option>
          <option value="under_review">Under review</option>
          <option value="approved">Approved</option>
          <option value="sent_back">Sent back</option>
          <option value="change_pending">Change requested</option>
        </select>
        <select style={inp} aria-label="Test data" value={filters.show} onChange={(e) => set("show", e.target.value)}>
          <option value="all">All teams</option>
          <option value="test">Only teams that look like test data</option>
          <option value="real">Hide teams that look like test data</option>
        </select>
        <select style={inp} aria-label="Sort" value={filters.sort} onChange={(e) => set("sort", e.target.value)}>
          {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {dirty && <button style={btnGhost} onClick={() => setFilters({ q: "", division: "all", status: "all", show: "all", sort: filters.sort })}>Clear filters</button>}
      </div>
      {canManage && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
          {summary.looksTest > 0 && <button style={btnGhost} onClick={onSelectTest}>Select teams that look like test data ({summary.looksTest})</button>}
          {shownCount > 0 && <button style={btnGhost} onClick={onSelectShown}>Select all shown ({shownCount})</button>}
          {selectedCount > 0 && <button style={btnGhost} onClick={onClearSelection}>Clear selection</button>}
          {selectedCount > 0 && <button style={btnDangerGhost} onClick={onBulkRemove}>Remove {selectedCount} selected…</button>}
        </div>
      )}
    </div>
  );
}

// ─── Modal shell ─────────────────────────────────────────────────────────────
export function Modal({ title, onClose, children, busy }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,.55)", zIndex: 100000, display: "flex",
      alignItems: "center", justifyContent: "center", padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} style={{ background: "#fff", borderRadius: 14, width: "100%",
        maxWidth: 520, maxHeight: "88vh", overflowY: "auto", padding: 20, boxShadow: "0 20px 60px rgba(0,0,0,.35)" }}>
        <h2 style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 700, margin: "0 0 12px", color: "#1a1a2e" }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

const note = (bg, color) => ({ fontFamily: MONO, fontSize: 11, color, background: bg, borderRadius: 6, padding: "8px 10px", margin: "8px 0" });
const ul = { fontFamily: MONO, fontSize: 11, color: "#444", margin: "4px 0 10px", paddingLeft: 18, lineHeight: 1.5 };
const label = { fontFamily: MONO, fontSize: 11, color: "#666", display: "block", margin: "10px 0 4px" };

// ─── Remove one team (dry run first, then the typed confirmation) ───────────
export function RemoveTeamDialog({ team, api, onClose, onRemoved }) {
  const [impact, setImpact] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [reason, setReason] = useState(team.looks_test ? "Test team" : "");
  const [typed, setTyped] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let live = true;
    api("/captain-sync/remove-team", { method: "POST", body: JSON.stringify({ team_id: team.id, dry_run: true }) })
      .then((r) => { if (live) setImpact(r.impact); })
      .catch((e) => { if (live) setLoadErr(e.message); });
    return () => { live = false; };
  }, [api, team.id]);

  const ok = impact && impact.allowed && canConfirmRemove({ reason, typedName: typed, teamName: team.name, needsAck: impact.needs_ack, acknowledged: ack });

  const submit = () => {
    setBusy(true); setErr("");
    api("/captain-sync/remove-team", { method: "POST", body: JSON.stringify({
      team_id: team.id, reason: reason.trim(), confirm_name: typed.trim(), acknowledge: ack }) })
      .then((r) => onRemoved(r.message))
      .catch((e) => { setErr(e.message); setBusy(false); });
  };

  return (
    <Modal title={`Remove "${team.name}"?`} onClose={onClose} busy={busy}>
      {!impact && !loadErr && <p style={{ fontFamily: MONO, fontSize: 12, color: "#888" }}>Checking what this would take…</p>}
      {loadErr && <div style={note("#FEF2F2", "#991B1B")}>{loadErr}</div>}
      {impact && (
        <>
          <p style={{ fontFamily: MONO, fontSize: 11, color: "#666", margin: "0 0 2px" }}>This will remove:</p>
          <ul style={ul}>{impact.removes.map((x, i) => <li key={i}>{x}</li>)}</ul>
          <p style={{ fontFamily: MONO, fontSize: 11, color: "#666", margin: "0 0 2px" }}>This will keep:</p>
          <ul style={ul}>{impact.keeps.map((x, i) => <li key={i}>{x}</li>)}</ul>
          {!impact.allowed && (
            <div style={note("#FEF2F2", "#991B1B")}>
              This team cannot be removed here: {impact.blocked.join(" and ")}. Nothing was changed.
            </div>
          )}
          {impact.allowed && (
            <>
              <p style={note("#F0F9FF", "#075985")}>
                You can undo this from Recently removed at the bottom of the list. The team record and its roster rows come back; invite links that were revoked do not.
              </p>
              <label style={label} htmlFor="rm-reason">Reason (goes in the history)</label>
              <input id="rm-reason" style={{ ...inp, width: "100%" }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. test team" />
              <label style={label} htmlFor="rm-name">Type the team name to confirm: <strong>{team.name}</strong></label>
              <input id="rm-name" style={{ ...inp, width: "100%" }} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
              {impact.needs_ack && (
                <label style={{ ...label, display: "flex", gap: 8, alignItems: "flex-start", color: "#92400E" }}>
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 2 }} />
                  This team has players or a recorded payment. I understand they come off the team and the payment record goes with it.
                </label>
              )}
            </>
          )}
        </>
      )}
      {err && <div style={note("#FEF2F2", "#991B1B")}>{err}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button style={btnGhost} onClick={onClose} disabled={busy}>Cancel</button>
        {impact && impact.allowed && (
          <button style={{ ...btnDanger, opacity: ok && !busy ? 1 : 0.45 }} disabled={!ok || busy} onClick={submit}>
            {busy ? "Removing…" : "Remove team"}
          </button>
        )}
      </div>
    </Modal>
  );
}

// ─── Remove several (only teams with nothing attached; the rest are explained) ─
export function BulkRemoveDialog({ plan, api, onClose, onDone }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const n = plan.removable.length;
  const ok = n > 0 && typed === "DELETE";

  const submit = () => {
    setBusy(true); setErr("");
    api("/captain-sync/delete-teams", { method: "POST", body: JSON.stringify({
      team_ids: plan.removable.map((t) => t.id), confirm: "DELETE" }) })
      .then((r) => onDone(r.message || "Done."))
      .catch((e) => { setErr(e.message); setBusy(false); });
  };

  return (
    <Modal title={n > 0 ? `Remove ${n} team${n === 1 ? "" : "s"}?` : "Nothing can be removed in bulk"} onClose={onClose} busy={busy}>
      {n > 0 && (
        <>
          <p style={{ fontFamily: MONO, fontSize: 11, color: "#666", margin: "0 0 2px" }}>These have no players, no payment and no deposit entry, so they go:</p>
          <ul style={ul}>{plan.removable.map((t) => <li key={t.id}>{t.name}</li>)}</ul>
        </>
      )}
      {plan.kept.length > 0 && (
        <>
          <p style={{ fontFamily: MONO, fontSize: 11, color: "#666", margin: "0 0 2px" }}>These stay, because something real is attached:</p>
          <ul style={ul}>{plan.kept.map((t) => <li key={t.id}><strong>{t.name}</strong>: {t.reasons.join(" and ")}</li>)}</ul>
          <p style={note("#FFFBEB", "#92400E")}>To remove one of those, open the team and use Remove team. It shows exactly what would go.</p>
        </>
      )}
      {n > 0 && (
        <>
          <p style={note("#F0F9FF", "#075985")}>Captain accounts and player records are not touched, and every removal can be restored from Recently removed.</p>
          <label style={label} htmlFor="bulk-confirm">Type DELETE to confirm</label>
          <input id="bulk-confirm" style={{ ...inp, width: "100%" }} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </>
      )}
      {err && <div style={note("#FEF2F2", "#991B1B")}>{err}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button style={btnGhost} onClick={onClose} disabled={busy}>{n > 0 ? "Cancel" : "Close"}</button>
        {n > 0 && <button style={{ ...btnDanger, opacity: ok && !busy ? 1 : 0.45 }} disabled={!ok || busy} onClick={submit}>{busy ? "Removing…" : `Remove ${n}`}</button>}
      </div>
    </Modal>
  );
}

// ─── Recently removed, with Restore ──────────────────────────────────────────
export function RemovedPanel({ items, divisionLabels, busyId, onRestore }) {
  const [open, setOpen] = useState(false);
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginTop: 22, background: "#fff", border: "1px solid #E8E6DF", borderRadius: 10, padding: "10px 14px" }}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        style={{ fontFamily: MONO, fontSize: 12, background: "transparent", border: "none", cursor: "pointer", color: "#1a1a2e", padding: 0 }}>
        {open ? "▾" : "▸"} Recently removed ({items.length})
      </button>
      {open && items.map((it) => (
        <div key={it.audit_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderTop: "1px solid #F0EEE6", marginTop: 8, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 240px" }}>
            <div style={{ fontFamily: SERIF, fontSize: 13, fontWeight: 700, color: "#1a1a2e" }}>{it.name || `Team #${it.team_id}`}</div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: "#999" }}>
              {divisionLabels[it.division] || it.division || "No division"}
              {it.players > 0 ? ` · ${it.players} roster row${it.players === 1 ? "" : "s"}` : ""}
              {` · removed by ${it.removed_by || "unknown"}`}
              {it.removed_at ? ` on ${new Date(it.removed_at.replace(" ", "T")).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}` : ""}
            </div>
          </div>
          {it.can_restore
            ? <button style={btnGhost} disabled={busyId === it.audit_id} onClick={() => onRestore(it)}>{busyId === it.audit_id ? "Restoring…" : "Restore"}</button>
            : <span style={{ fontFamily: MONO, fontSize: 10, color: "#999" }}>Cannot restore: a team with this id exists again</span>}
        </div>
      ))}
    </div>
  );
}

// ─── Danger zone at the bottom of a team's page ──────────────────────────────
export function DangerZone({ team, onRemove }) {
  return (
    <div style={{ marginTop: 28, border: "1px solid #FCA5A5", borderRadius: 10, padding: 14, background: "#FFF8F8" }}>
      <p style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 700, color: "#991B1B", margin: "0 0 4px" }}>Remove this team</p>
      <p style={{ fontFamily: MONO, fontSize: 11, color: "#7F1D1D", margin: "0 0 10px", lineHeight: 1.5 }}>
        {team.looks_test ? "This looks like test data. " : ""}
        Takes the team and its roster rows out of the season. Players, captain logins and form entries are kept, and you can restore it afterwards from Recently removed on the list.
      </p>
      <button style={btnDangerGhost} onClick={onRemove}>Remove team…</button>
    </div>
  );
}
