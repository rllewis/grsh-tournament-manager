/**
 * GRSH Full Team Rosters — board-side view/edit/override for captain-
 * registered (full-team) rosters. Admin-only.
 *
 * Drop this file at: src/pages/FullTeamRosters.jsx
 */

import { useState, useEffect, useCallback } from "react";

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
  if (!res.ok) throw Object.assign(new Error(data.error || "Request failed"), { data });
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

// ─── List view ───────────────────────────────────────────────────────────────
function TeamRow({ team, onSelect, checked, onToggleCheck }) {
  const band = BAND_COLOR[team.parity_action] || BAND_COLOR.balanced;
  const understaffed = team.player_count < team.min_players;
  return (
    <div onClick={() => onSelect(team.id)} style={{ display: "flex", alignItems: "center", gap: 14,
      padding: "12px 16px", background: "#fff", border: "1px solid #E8E6DF", borderRadius: 10,
      marginBottom: 8, cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onClick={(e) => e.stopPropagation()}
        onChange={() => onToggleCheck(team.id)}
        style={{ width: 16, height: 16, flexShrink: 0, cursor: "pointer" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Fraunces',serif", fontSize: 14, fontWeight: 700, color: "#1a1a2e" }}>
          {team.name}
        </div>
        <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#aaa" }}>
          {team.division_label} · Captain: {team.captain_name || "—"}
        </div>
      </div>
      <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: understaffed ? "#991B1B" : "#1a1a2e",
        minWidth: 70 }}>
        {team.player_count}/{team.min_players}-{team.max_players}
      </div>
      <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: team.goalie_count < 1 ? "#991B1B" : "#1a1a2e",
        minWidth: 70 }}>
        {team.goalie_count} goalie{team.goalie_count === 1 ? "" : "s"}
      </div>
      <div style={{ fontFamily: "'Fraunces',serif", fontSize: 13, fontWeight: 700, color: "#1a1a2e",
        minWidth: 44, textAlign: "right" }}>
        {team.parity_score !== null ? team.parity_score.toFixed(1) : "—"}
      </div>
      <Pill bg={band.bg} color={band.color}>{band.label}</Pill>
      <Pill bg={team.draft_locked ? "#E8F8EF" : "#FEF3C7"} color={team.draft_locked ? "#1A5C35" : "#92400E"}>
        {team.draft_locked ? "Submitted" : "Draft"}
      </Pill>
    </div>
  );
}

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

// ─── Detail view ─────────────────────────────────────────────────────────────
function TeamDetail({ teamId, onBack }) {
  const [team, setTeam] = useState(null);
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
        <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>
          {team.name}
        </h2>
        <Pill bg={team.draft_locked ? "#E8F8EF" : "#FEF3C7"} color={team.draft_locked ? "#1A5C35" : "#92400E"}>
          {team.draft_locked ? "Submitted" : "Draft"}
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

      {team.draft_locked && (
        <button disabled={busy} onClick={handleUnlock}
          style={{ ...btnPrimary, width: "100%", marginTop: 14, opacity: busy ? 0.5 : 1 }}>
          {busy ? "Unlocking…" : "Unlock roster (allow further changes)"}
        </button>
      )}
    </div>
  );
}

// ─── Print modal ─────────────────────────────────────────────────────────────
// Fetches full roster detail (list endpoint only returns summaries) and
// prints only this element — @media print isolates it via visibility
// rather than relying on the browser to rasterize whatever's on screen.
function PrintRostersModal({ teams, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .grsh-print-area, .grsh-print-area * { visibility: visible; }
          .grsh-print-area { position: absolute; top: 0; left: 0; width: 100%;
            max-height: none !important; overflow: visible !important;
            box-shadow: none !important; border-radius: 0 !important; }
          .grsh-print-hide { display: none !important; }
          .grsh-print-team { page-break-inside: avoid; }
        }
      `}</style>
      <div className="grsh-print-area" style={{ background: "#fff", borderRadius: 14, maxWidth: 640,
        width: "100%", maxHeight: "85vh", overflow: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.22)" }}>
        <div className="grsh-print-hide" style={{ padding: "18px 22px 14px", borderBottom: "1px solid #F0EEE8",
          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "'Fraunces',serif", fontSize: 17, fontWeight: 700, color: "#1a1a2e" }}>
            Print preview — {teams.length} team{teams.length === 1 ? "" : "s"}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 14,
            color: "#aaa", cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: "18px 22px" }}>
          {teams.map((t) => (
            <div key={t.id} className="grsh-print-team" style={{ marginBottom: 22 }}>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 15, fontWeight: 700, color: "#1a1a2e", marginBottom: 2 }}>
                {t.name}
              </div>
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#aaa", marginBottom: 8 }}>
                {t.division_label} · Captain: {t.captain_name || "—"}
              </div>
              {(t.players || []).map((p) => (
                <div key={p.roster_id} style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#333",
                  padding: "4px 0", borderBottom: "1px solid #F9F8F4", display: "flex", gap: 12 }}>
                  <span style={{ width: 30, color: "#aaa" }}>{p.jersey_number !== null ? `#${p.jersey_number}` : ""}</span>
                  <span style={{ flex: 1 }}>{p.first_name} {p.last_name}{p.is_captain ? " (C)" : ""}</span>
                  <span style={{ width: 60 }}>{POSITION_LABEL[p.position] || "—"}</span>
                  <span style={{ width: 34 }}>{p.skill_tier_reported}</span>
                </div>
              ))}
              {(!t.players || t.players.length === 0) && (
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#ccc" }}>No players on roster</div>
              )}
            </div>
          ))}
        </div>
        <div className="grsh-print-hide" style={{ padding: "14px 22px 20px", borderTop: "1px solid #F0EEE8", display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, fontFamily: "'DM Mono',monospace", fontSize: 12,
            background: "#F6F5F0", border: "1px solid #E8E6DF", color: "#666", padding: 9, borderRadius: 8, cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={() => window.print()} style={{ flex: 2, ...btnPrimary, padding: 9 }}>
            ⎙ Print {teams.length} roster{teams.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
export default function FullTeamRosters() {
  const [teams, setTeams] = useState(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [checkedIds, setCheckedIds] = useState([]);
  const [printTeams, setPrintTeams] = useState(null);
  const [printLoading, setPrintLoading] = useState(false);
  const [printError, setPrintError] = useState("");

  const load = useCallback(() => {
    apiFetch("/admin/full-teams").then(setTeams).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Print — the list endpoint only returns team summaries (no player
  // rosters), so fetch full detail per selected team before printing.
  const toggleCheck = (id) => {
    setCheckedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };
  const toggleCheckAll = () => {
    if (!teams) return;
    setCheckedIds((ids) => (ids.length === teams.length ? [] : teams.map((t) => t.id)));
  };
  const handlePrintSelected = () => {
    setPrintError(""); setPrintLoading(true);
    Promise.all(checkedIds.map((id) => apiFetch(`/admin/full-teams/${id}`)))
      .then((results) => { setPrintTeams(results); setPrintLoading(false); })
      .catch((e) => { setPrintError(e.message); setPrintLoading(false); });
  };

  const page = { fontFamily: "'Fraunces',Georgia,serif", background: "#F6F5F0",
    minHeight: "100vh", padding: "20px 24px 60px" };

  if (selected) {
    return (
      <div style={page}>
        <TeamDetail teamId={selected} onBack={() => { setSelected(null); load(); }} />
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div>
          <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 700, color: "#1a1a2e", margin: "0 0 4px" }}>
            Full Team Rosters
          </h1>
          <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#aaa", margin: 0 }}>
            Captain-registered (pre-formed) teams — separate from the draft pool.
          </p>
        </div>
        {teams && teams.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6,
              fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#888", cursor: "pointer" }}>
              <input type="checkbox" checked={checkedIds.length === teams.length} onChange={toggleCheckAll}
                style={{ width: 14, height: 14, cursor: "pointer" }} />
              Select all
            </label>
            <button disabled={checkedIds.length === 0 || printLoading} onClick={handlePrintSelected}
              style={{ ...btnPrimary, opacity: (checkedIds.length === 0 || printLoading) ? 0.5 : 1 }}>
              {printLoading ? "Loading…" : `⎙ Print selected (${checkedIds.length})`}
            </button>
          </div>
        )}
      </div>

      {error && <div style={errBox}>{error}</div>}
      {printError && <div style={errBox}>{printError}</div>}
      {!teams && !error && <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#aaa" }}>Loading…</p>}
      {teams && teams.length === 0 && (
        <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#aaa" }}>
          No full-team registrations yet this season.
        </p>
      )}
      {teams && teams.map((t) => (
        <TeamRow key={t.id} team={t} onSelect={setSelected}
          checked={checkedIds.includes(t.id)} onToggleCheck={toggleCheck} />
      ))}

      {printTeams && <PrintRostersModal teams={printTeams} onClose={() => setPrintTeams(null)} />}
    </div>
  );
}
