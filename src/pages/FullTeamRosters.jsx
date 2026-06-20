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
function TeamRow({ team, onSelect }) {
  const band = BAND_COLOR[team.parity_action] || BAND_COLOR.balanced;
  const understaffed = team.player_count < team.min_players;
  return (
    <div onClick={() => onSelect(team.id)} style={{ display: "flex", alignItems: "center", gap: 14,
      padding: "12px 16px", background: "#fff", border: "1px solid #E8E6DF", borderRadius: 10,
      marginBottom: 8, cursor: "pointer" }}>
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

// ─── Main component ─────────────────────────────────────────────────────────
export default function FullTeamRosters() {
  const [teams, setTeams] = useState(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  const load = useCallback(() => {
    apiFetch("/admin/full-teams").then(setTeams).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

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
      <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 700, color: "#1a1a2e", margin: "0 0 4px" }}>
        Full Team Rosters
      </h1>
      <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#aaa", margin: "0 0 18px" }}>
        Captain-registered (pre-formed) teams — separate from the draft pool.
      </p>

      {error && <div style={errBox}>{error}</div>}
      {!teams && !error && <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#aaa" }}>Loading…</p>}
      {teams && teams.length === 0 && (
        <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#aaa" }}>
          No full-team registrations yet this season.
        </p>
      )}
      {teams && teams.map((t) => <TeamRow key={t.id} team={t} onSelect={setSelected} />)}
    </div>
  );
}
