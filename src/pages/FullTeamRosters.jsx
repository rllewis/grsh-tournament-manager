/**
 * GRSH Full Team Rosters — board-side view/edit/override for captain-
 * registered (full-team) rosters. Admin-only.
 *
 * Drop this file at: src/pages/FullTeamRosters.jsx
 */

import { useState, useEffect, useCallback } from "react";
import { filterAndSort, summarize, testTeamIds, bulkPlan } from "../lib/fullTeamsEngine";
import {
  TeamRow, ColumnHeader, ListToolbar, RemoveTeamDialog, BulkRemoveDialog, RemovedPanel, DangerZone,
} from "./FullTeamRostersParts";

const CONFIG = typeof window !== "undefined" ? window.grshConfig || {} : {};

async function apiFetch(path, options = {}) {
  const res = await fetch(`${CONFIG.apiUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-WP-Nonce": CONFIG.nonce,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || data.message || "Request failed"), { data });
  return data;
}

const POSITION_LABEL = { defenseman: "Defense", center: "Center", winger: "Winger", goaltender: "Goalie" };
const POSITION_COLOR = {
  defenseman: { bg: "#E8F0FE", color: "#1A3F8F" },
  center:     { bg: "#E8F8EF", color: "#1A5C35" },
  winger:     { bg: "#FDF3E8", color: "#7A4A18" },
  goaltender: { bg: "#FCE8E8", color: "#7A1818" },
};
const BAND_COLOR = {
  balanced:  { bg: "#E8F8EF", color: "#1A5C35", label: "Balanced" },
  review:    { bg: "#FEF3C7", color: "#92400E", label: "Review" },
  rebalance: { bg: "#FEE2E2", color: "#991B1B", label: "Rebalance" },
};
const TIER_OPTIONS = ["A1","A2","A3","B1","B2","B3","C1","C2","R1","R2","R3"];

function Pill({ bg, color, children }) {
  return <span style={{ display: "inline-block", background: bg, color, fontSize: 10,
    fontFamily: "'DM Mono',monospace", fontWeight: 500, padding: "1px 6px", borderRadius: 99,
    whiteSpace: "nowrap" }}>{children}</span>;
}

const inp = { fontFamily: "'DM Mono',monospace", fontSize: 12, width: "100%",
  background: "#fff", border: "1px solid #E8E6DF", borderRadius: 6, padding: "7px 9px",
  color: "#1a1a2e", outline: "none", boxSizing: "border-box" };
const btnPrimary = { fontFamily: "'DM Mono',monospace", fontSize: 12, fontWeight: 600,
  background: "#1a1a2e", color: "#D4A017", border: "none", padding: "9px 16px",
  borderRadius: 8, cursor: "pointer" };
const errBox = { fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#991B1B",
  background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 6, padding: "6px 10px", margin: "8px 0" };

// ─── Detail view — add-player form ──────────────────────────────────────────
function AddPlayerForm({ onAdd, busy, error }) {
  const blank = { first_name: "", last_name: "", email: "", age: "", position: "",
    skill_tier_reported: "", years_experience: "", jersey_number: "", is_captain: false };
  const [form, setForm] = useState(blank);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const canSubmit = form.first_name.trim() && form.last_name.trim() && form.email.trim()
    && form.position && form.skill_tier_reported;

  const submit = async () => {
    const ok = await onAdd(form);
    if (ok) setForm(blank);
  };

  return (
    <div style={{ background: "#FAFAF8", border: "1px solid #E8E6DF", borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#888", margin: "0 0 10px",
        textTransform: "uppercase", letterSpacing: ".06em" }}>Add a player</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 8, marginBottom: 8 }}>
        <input style={inp} placeholder="First name" value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
        <input style={inp} placeholder="Last name" value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
        <input style={inp} placeholder="Email" value={form.email} onChange={(e) => set("email", e.target.value)} />
        <input style={inp} type="number" placeholder="Age" value={form.age} onChange={(e) => set("age", e.target.value)} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 8, marginBottom: 8 }}>
        <select style={inp} value={form.position} onChange={(e) => set("position", e.target.value)}>
          <option value="">Position</option>
          {Object.entries(POSITION_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select style={inp} value={form.skill_tier_reported} onChange={(e) => set("skill_tier_reported", e.target.value)}>
          <option value="">Tier</option>
          {TIER_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input style={inp} type="number" placeholder="Years" value={form.years_experience} onChange={(e) => set("years_experience", e.target.value)} />
        <input style={inp} type="number" placeholder="Jersey #" value={form.jersey_number} onChange={(e) => set("jersey_number", e.target.value)} />
      </div>
      {error && <div style={errBox}>{error}</div>}
      <button disabled={busy || !canSubmit} onClick={submit}
        style={{ ...btnPrimary, width: "100%", opacity: (busy || !canSubmit) ? 0.5 : 1 }}>
        {busy ? "Adding…" : "Add to roster"}
      </button>
    </div>
  );
}

// ─── Detail view — roster row with "added by" attribution ──────────────────
function PlayerRow({ player, onRemove }) {
  const pc = POSITION_COLOR[player.position] || {};
  const initials = `${player.first_name?.[0] || "?"}${player.last_name?.[0] || ""}`;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
      background: "#fff", border: "1px solid #E8E6DF", borderRadius: 10, marginBottom: 6 }}>
      <div style={{ width: 28, textAlign: "center", fontFamily: "'DM Mono',monospace", fontSize: 12,
        fontWeight: 600, color: "#aaa" }}>
        {player.jersey_number !== null ? `#${player.jersey_number}` : "—"}
      </div>
      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#1a1a2e", color: "#D4A017",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        fontFamily: "'DM Mono',monospace", fontSize: 11, fontWeight: 500 }}>{initials}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Fraunces',serif", fontSize: 13, fontWeight: 600, color: "#1a1a2e",
          display: "flex", alignItems: "center", gap: 5 }}>
          {player.first_name} {player.last_name}
          {player.is_captain && <Pill bg="#1a1a2e" color="#D4A017">C</Pill>}
        </div>
        <div style={{ display: "flex", gap: 5, marginTop: 3, flexWrap: "wrap" }}>
          {pc.bg && <Pill bg={pc.bg} color={pc.color}>{POSITION_LABEL[player.position]}</Pill>}
          <Pill bg="#F6F5F0" color="#888">{player.skill_tier_reported}</Pill>
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#bbb" }}>
            {player.age ? `age ${player.age}` : ""} {player.years_experience ? `· ${player.years_experience} yrs` : ""}
            {player.added_by ? ` · added by ${player.added_by}` : ""}
          </span>
        </div>
      </div>
      <button onClick={() => onRemove(player.roster_id)} title="Remove" style={{ width: 28, height: 28,
        border: "none", background: "transparent", cursor: "pointer", fontSize: 13, color: "#DC2626" }}>✕</button>
    </div>
  );
}

// ─── Board review controls (status the captain sees) ────────────────────────
function ReviewControls({ team, busy, onSet }) {
  const [note, setNote] = useState("");
  const r = team.review || {};
  const mono = "'DM Mono',monospace";
  return (
    <div style={{ background: "#FAFAF8", border: "1px solid #E8E6DF", borderRadius: 10, padding: 12, marginTop: 14 }}>
      <p style={{ fontFamily: mono, fontSize: 11, color: "#666", margin: "0 0 6px" }}>
        Review status: <strong>{r.label || "Submitted"}</strong>
      </p>
      {r.change_request && (
        <p style={{ fontFamily: mono, fontSize: 12, color: "#92400E", background: "#FEF3C7", borderRadius: 6, padding: "6px 8px", margin: "0 0 8px" }}>
          Captain asked for a change: {r.change_request}
        </p>
      )}
      <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note the captain will see"
        style={{ fontFamily: mono, fontSize: 12, width: "100%", boxSizing: "border-box", border: "1px solid #D9D6CB",
          borderRadius: 6, padding: 8, marginBottom: 8, resize: "vertical" }} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button disabled={busy} onClick={() => onSet("under_review", note)} style={{ ...btnPrimary, opacity: busy ? 0.5 : 1 }}>Mark under review</button>
        <button disabled={busy} onClick={() => onSet("approved", note)} style={{ ...btnPrimary, opacity: busy ? 0.5 : 1 }}>Approve</button>
        <button disabled={busy} onClick={() => onSet("changes_requested", note)} style={{ ...btnPrimary, opacity: busy ? 0.5 : 1 }}>Send back for changes</button>
      </div>
      <p style={{ fontFamily: mono, fontSize: 10, color: "#999", margin: "8px 0 0" }}>
        Approve and Send back email the captain. Send back also unlocks the roster so they can edit.
      </p>
    </div>
  );
}

// ─── Detail view ─────────────────────────────────────────────────────────────
function TeamDetail({ teamId, listTeam, onBack, onRemoved }) {
  const [team, setTeam] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiFetch(`/admin/full-teams/${teamId}`).then(setTeam).catch((e) => setError(e.message));
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = (payload) => {
    setBusy(true); setError("");
    return apiFetch(`/admin/full-teams/${teamId}/players`, { method: "POST", body: JSON.stringify(payload) })
      .then((t) => { setTeam(t); return true; })
      .catch((e) => { setError(e.data?.debug ? `${e.message} (${e.data.debug})` : e.message); return false; })
      .finally(() => setBusy(false));
  };

  const handleRemove = (rosterId) => {
    apiFetch(`/admin/full-teams/${teamId}/players/${rosterId}`, { method: "DELETE" })
      .then(setTeam).catch((e) => setError(e.message));
  };

  const handleReview = (status, note) => {
    setBusy(true); setError("");
    return apiFetch(`/admin/full-teams/${teamId}/review`, { method: "POST", body: JSON.stringify({ status, note }) })
      .then(setTeam).catch((e) => setError(e.message)).finally(() => setBusy(false));
  };

  const handleUnlock = () => {
    setBusy(true);
    apiFetch(`/admin/full-teams/${teamId}/unlock`, { method: "POST" })
      .then(setTeam).catch((e) => setError(e.message)).finally(() => setBusy(false));
  };

  if (!team) return <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#aaa" }}>Loading…</p>;
  const band = BAND_COLOR[team.parity_action] || BAND_COLOR.balanced;

  return (
    <div>
      <button onClick={onBack} style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, background: "transparent",
        border: "none", color: "#888", cursor: "pointer", padding: 0, marginBottom: 14 }}>← Back to all teams</button>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 700, color: "#1a1a2e", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          {team.name}
          {listTeam?.looks_test && <Pill bg="#EDE9FE" color="#5B21B6">Test?</Pill>}
        </h2>
        <Pill bg={team.draft_locked ? "#E8F8EF" : "#FEF3C7"} color={team.draft_locked ? "#1A5C35" : "#92400E"}>
          {team.draft_locked ? (team.review?.label || "Submitted") : (team.review?.status === "changes_requested" ? "Sent back" : "Not submitted")}
        </Pill>
      </div>
      <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#aaa", margin: "0 0 4px" }}>
        {team.division_label} · Captain: {team.captain_name || "—"}
      </p>
      {team.updated_at && (
        <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#bbb", margin: "0 0 16px" }}>
          Updated {new Date(team.updated_at.replace(" ", "T")).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
        </p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 10, marginBottom: 16 }}>
        <div style={{ background: "#F6F5F0", borderRadius: 8, padding: 10 }}>
          <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#888", margin: "0 0 2px" }}>Players</p>
          <p style={{ fontFamily: "'Fraunces',serif", fontSize: 16, fontWeight: 700, margin: 0 }}>
            {team.player_count}/{team.min_players}-{team.max_players}
          </p>
        </div>
        <div style={{ background: "#F6F5F0", borderRadius: 8, padding: 10 }}>
          <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#888", margin: "0 0 2px" }}>Skill score</p>
          <p style={{ fontFamily: "'Fraunces',serif", fontSize: 16, fontWeight: 700, margin: 0 }}>
            {team.skill_score !== null ? team.skill_score.toFixed(1) : "—"}
          </p>
        </div>
        <div style={{ background: "#F6F5F0", borderRadius: 8, padding: 10 }}>
          <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#888", margin: "0 0 2px" }}>Parity score</p>
          <p style={{ fontFamily: "'Fraunces',serif", fontSize: 16, fontWeight: 700, margin: 0 }}>
            {team.parity_score !== null ? team.parity_score.toFixed(1) : "—"}
          </p>
        </div>
        <div style={{ background: "#F6F5F0", borderRadius: 8, padding: 10 }}>
          <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#888", margin: "0 0 2px" }}>Band</p>
          <Pill bg={band.bg} color={band.color}>{band.label}</Pill>
        </div>
      </div>

      <AddPlayerForm onAdd={handleAdd} busy={busy} error={error} />

      {team.players.map((p) => <PlayerRow key={p.roster_id} player={p} onRemove={handleRemove} />)}

      {team.draft_locked && <ReviewControls team={team} busy={busy} onSet={handleReview} />}

      {team.draft_locked && (
        <button disabled={busy} onClick={handleUnlock}
          style={{ ...btnPrimary, width: "100%", marginTop: 14, opacity: busy ? 0.5 : 1 }}>
          {busy ? "Unlocking…" : "Unlock roster (allow further changes)"}
        </button>
      )}

      {listTeam?.cleanup?.can_manage && <DangerZone team={listTeam} onRemove={() => setRemoving(true)} />}
      {removing && (
        <RemoveTeamDialog team={listTeam} api={apiFetch} onClose={() => setRemoving(false)} onRemoved={(msg) => { setRemoving(false); onRemoved(msg); }} />
      )}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
export default function FullTeamRosters() {
  const [teams, setTeams] = useState(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);       // the list row for the open team
  const [filters, setFilters] = useState({ q: "", division: "all", status: "all", show: "all", sort: "division" });
  const [picked, setPicked] = useState([]);              // team ids ticked for bulk removal
  const [notice, setNotice] = useState(null);            // { type: "ok" | "err", text }
  const [bulkOpen, setBulkOpen] = useState(false);
  const [removed, setRemoved] = useState([]);
  const [restoringId, setRestoringId] = useState(null);

  const load = useCallback(() => {
    apiFetch("/admin/full-teams").then((t) => { setTeams(t); setError(""); }).catch((e) => setError(e.message));
  }, []);

  // Admin-only; a committee member simply gets nothing back and the panel stays hidden.
  const loadRemoved = useCallback(() => {
    apiFetch("/admin/full-teams/removed").then(setRemoved).catch(() => setRemoved([]));
  }, []);

  useEffect(() => { load(); loadRemoved(); }, [load, loadRemoved]);

  // Drop ticks for teams that no longer exist after a reload.
  useEffect(() => {
    if (teams) setPicked((p) => p.filter((id) => teams.some((t) => t.id === id)));
  }, [teams]);

  const afterChange = (text) => {
    setNotice({ type: "ok", text });
    setSelected(null); setBulkOpen(false); setPicked([]);
    load(); loadRemoved();
  };

  const handleRestore = (item) => {
    setRestoringId(item.audit_id);
    apiFetch("/captain-sync/restore-team", { method: "POST", body: JSON.stringify({ audit_id: item.audit_id }) })
      .then((r) => { setNotice({ type: "ok", text: r.message || "Team restored." }); load(); loadRemoved(); })
      .catch((e) => setNotice({ type: "err", text: e.message }))
      .finally(() => setRestoringId(null));
  };

  const page = { fontFamily: "'Fraunces',Georgia,serif", background: "#F6F5F0",
    minHeight: "100vh", padding: "20px 24px 60px" };

  if (selected) {
    return (
      <div style={page}>
        <TeamDetail teamId={selected.id} listTeam={selected} onBack={() => { setSelected(null); load(); }} onRemoved={afterChange} />
      </div>
    );
  }

  const canManage = !!teams && teams.some((t) => t.cleanup && t.cleanup.can_manage);
  const shown = teams ? filterAndSort(teams, filters) : [];
  const summary = summarize(teams || []);
  const divisions = [];
  (teams || []).forEach((t) => { if (!divisions.some((d) => d.key === t.division)) divisions.push({ key: t.division, label: t.division_label }); });
  const divisionLabels = Object.fromEntries(divisions.map((d) => [d.key, d.label]));
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div style={page}>
      <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 700, color: "#1a1a2e", margin: "0 0 4px" }}>
        Full Team Rosters
      </h1>
      <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#aaa", margin: "0 0 14px" }}>
        Captain-registered (pre-formed) teams — separate from the draft pool.
      </p>

      {notice && (
        <div role="status" style={{ ...errBox, color: notice.type === "ok" ? "#14532D" : "#991B1B",
          background: notice.type === "ok" ? "#F0FDF4" : "#FEF2F2", border: `1px solid ${notice.type === "ok" ? "#86EFAC" : "#FCA5A5"}`,
          display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" style={{ background: "transparent", border: "none", cursor: "pointer", color: "inherit" }}>✕</button>
        </div>
      )}
      {error && <div style={errBox}>{error}</div>}
      {!teams && !error && <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#aaa" }}>Loading…</p>}
      {teams && teams.length === 0 && (
        <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#aaa" }}>
          No full-team registrations yet this season.
        </p>
      )}

      {teams && teams.length > 0 && (
        <>
          <ListToolbar filters={filters} setFilters={setFilters} divisions={divisions} summary={summary} canManage={canManage}
            selectedCount={picked.length} shownCount={shown.length}
            onSelectTest={() => setPicked(testTeamIds(teams))}
            onSelectShown={() => setPicked(shown.map((t) => t.id))}
            onClearSelection={() => setPicked([])}
            onBulkRemove={() => setBulkOpen(true)} />
          <div style={{ overflowX: "auto" }}>
            <ColumnHeader canManage={canManage} />
            {shown.map((t) => (
              <TeamRow key={t.id} team={t} canManage={canManage} selected={picked.includes(t.id)} onToggle={toggle} onOpen={setSelected} />
            ))}
          </div>
          {shown.length === 0 && (
            <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#888" }}>
              No teams match these filters.{" "}
              <button style={{ background: "transparent", border: "none", color: "#1a1a2e", textDecoration: "underline", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit", padding: 0 }}
                onClick={() => setFilters({ q: "", division: "all", status: "all", show: "all", sort: filters.sort })}>Clear filters</button>
            </p>
          )}
        </>
      )}

      <RemovedPanel items={removed} divisionLabels={divisionLabels} busyId={restoringId} onRestore={handleRestore} />

      {bulkOpen && (
        <BulkRemoveDialog plan={bulkPlan(teams || [], picked)} api={apiFetch} onClose={() => setBulkOpen(false)} onDone={afterChange} />
      )}
    </div>
  );
}
