/**
 * GRSH Captain Roster — self-service full-team roster builder.
 * Front-end only (no wp-admin access needed). Mounted via [grsh_captain_roster].
 *
 * Drop this file at: src/pages/CaptainRoster.jsx
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { TIER_VALUES, TIER_DESCRIPTIONS } from "../lib/playerScoring";

const POSITION_LABEL  = { defenseman: "Defense", center: "Center", winger: "Winger", goaltender: "Goalie" };
const POSITION_SHORT  = { defenseman: "D", center: "C", winger: "W", goaltender: "G" };
const POSITION_TARGET = { defenseman: 3, center: 2, winger: 3, goaltender: 1 };
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
const BALANCE_VISIBLE_AT = 6; // suppress the band before the roster has enough players for it to mean anything

const API = typeof window !== "undefined" ? window.grshCaptainConfig || {} : {};

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API.apiUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-WP-Nonce": API.nonce,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data.error || "Request failed"), { data });
  }
  return data;
}

function Pill({ bg, color, children }) {
  return (
    <span style={{
      display: "inline-block", background: bg, color, fontSize: 10,
      fontFamily: "'DM Mono',monospace", fontWeight: 500,
      padding: "1px 6px", borderRadius: 99, whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

// Persistent label above a field — placeholder text alone disappears once
// the user types, so it can't be relied on as the only field identifier.
function Field({ label, children }) {
  return (
    <div>
      <label style={lbl}>{label}</label>
      {children}
    </div>
  );
}

// ─── Position quota chips ───────────────────────────────────────────────────
function PositionChips({ counts }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {Object.keys(POSITION_SHORT).map((key) => {
        const count = counts?.[key] || 0;
        const target = POSITION_TARGET[key];
        let bg = "#F6F5F0", color = "#aaa", border = "#E8E6DF";
        if (count > 0 && count < target) { bg = "#FEF3C7"; color = "#92400E"; border = "#FEF3C7"; }
        if (count >= target) { bg = "#E8F8EF"; color = "#1A5C35"; border = "#E8F8EF"; }
        return (
          <div key={key} title={`${POSITION_LABEL[key]}: ${count} of ${target}+`}
            style={{ display: "flex", flexDirection: "column", alignItems: "center",
              background: bg, border: `1px solid ${border}`, borderRadius: 8,
              padding: "5px 9px", minWidth: 38 }}>
            <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, fontWeight: 600, color }}>
              {POSITION_SHORT[key]}
            </span>
            <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 14, fontWeight: 600, color }}>
              {count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function getNudge(position, counts) {
  if (!position || !counts) return null;
  const selectedCount = counts[position] || 0;
  if (selectedCount < POSITION_TARGET[position]) return null;
  const empty = Object.keys(POSITION_TARGET).find((k) => k !== position && (counts[k] || 0) === 0);
  if (!empty) return null;
  const sLabel = POSITION_LABEL[position].toLowerCase();
  const eLabel = POSITION_LABEL[empty].toLowerCase();
  return `You already have ${selectedCount} ${sLabel}${selectedCount === 1 ? "" : "s"} and 0 ${eLabel}s — consider recruiting ${eLabel} next.`;
}

// ─── Create-team step ───────────────────────────────────────────────────────
function CreateTeamForm({ divisions, onCreate, busy, error }) {
  const [name, setName] = useState("");
  const [division, setDivision] = useState(divisions[0]?.key || "");

  return (
    <div style={{ background: "#fff", border: "1px solid #E8E6DF", borderRadius: 12, padding: 24, maxWidth: 420 }}>
      <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 700, color: "#1a1a2e", margin: "0 0 4px" }}>
        Set up your team
      </h2>
      <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#aaa", margin: "0 0 18px" }}>
        You'll add players in the next step.
      </p>

      <label style={lbl}>Team name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} style={inp} placeholder="Riverside Reapers" />

      <label style={lbl}>Division</label>
      <select value={division} onChange={(e) => setDivision(e.target.value)} style={inp}>
        {divisions.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
      </select>

      {error && <div style={errBox}>{error}</div>}

      <button
        disabled={busy || !name.trim()}
        onClick={() => onCreate({ name: name.trim(), division })}
        style={{ ...btnPrimary, width: "100%", marginTop: 14, opacity: busy ? 0.6 : 1 }}
      >
        {busy ? "Creating…" : "Create team"}
      </button>
    </div>
  );
}

// ─── Add-player form ────────────────────────────────────────────────────────
function nextAvailableJersey(existing) {
  const used = new Set(existing.map(Number));
  for (let n = 1; n <= 99; n++) if (!used.has(n)) return n;
  return "";
}

function AddPlayerForm({ onAdd, busy, error, locked, existingJerseys, positionCounts }) {
  const suggested = nextAvailableJersey(existingJerseys);
  const blank = { first_name: "", last_name: "", email: "", age: "", position: "",
    skill_tier_reported: "", years_experience: "", jersey_number: String(suggested), is_captain: false };
  const [form, setForm] = useState(blank);
  const [lookupHit, setLookupHit] = useState(false);
  const firstNameRef = useRef(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const canSubmit = form.first_name.trim() && form.last_name.trim() && form.email.trim()
    && form.position && form.skill_tier_reported;
  const jerseyTaken = form.jersey_number !== "" && existingJerseys.includes(Number(form.jersey_number));
  const nudge = getNudge(form.position, positionCounts);

  const submit = async () => {
    const ok = await onAdd(form);
    if (ok) {
      setForm({ ...blank, jersey_number: String(nextAvailableJersey([...existingJerseys])) });
      setLookupHit(false);
      firstNameRef.current?.focus();
    }
  };

  const handleEmailBlur = async () => {
    const email = form.email.trim();
    if (!email.includes("@")) return;
    try {
      const res = await apiFetch(`/captain/lookup-player?email=${encodeURIComponent(email)}`);
      if (res.found) {
        setForm((f) => ({
          ...f,
          position: f.position || res.position || "",
          skill_tier_reported: f.skill_tier_reported || res.skill_tier_reported || "",
          years_experience: f.years_experience || String(res.years_experience || ""),
        }));
        setLookupHit(true);
      }
    } catch { /* lookup failing silently is fine — it's just a convenience */ }
  };

  if (locked) return null;

  return (
    <div style={{ background: "#FAFAF8", border: "1px solid #E8E6DF", borderRadius: 12, padding: 18, marginBottom: 18 }}>
      <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#888", margin: "0 0 12px",
        textTransform: "uppercase", letterSpacing: ".06em" }}>Add a player</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 8, marginBottom: 8 }}>
        <Field label="First name">
          <input ref={firstNameRef} style={inp} value={form.first_name}
            onChange={(e) => set("first_name", e.target.value)} />
        </Field>
        <Field label="Last name">
          <input style={inp} value={form.last_name}
            onChange={(e) => set("last_name", e.target.value)} />
        </Field>
        <Field label="Email">
          <input style={inp} value={form.email}
            onChange={(e) => set("email", e.target.value)} onBlur={handleEmailBlur} />
        </Field>
        <Field label="Age">
          <input style={inp} type="number" value={form.age}
            onChange={(e) => set("age", e.target.value)} />
        </Field>
      </div>

      {lookupHit && (
        <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#1A5C35", margin: "0 0 8px" }}>
          ✓ Found this player from a previous season — position, tier, and years pre-filled.
        </p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 8, marginBottom: 4 }}>
        <Field label="Position">
          <select style={inp} value={form.position} onChange={(e) => set("position", e.target.value)}>
            <option value="">Choose…</option>
            {Object.entries(POSITION_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Experience tier">
          <select style={inp} value={form.skill_tier_reported}
            onChange={(e) => set("skill_tier_reported", e.target.value)}>
            <option value="">Choose…</option>
            {Object.keys(TIER_VALUES).map((t) => (
              <option key={t} value={t}>{t} — {TIER_DESCRIPTIONS[t]}</option>
            ))}
          </select>
        </Field>
        <Field label="Years playing">
          <input style={inp} type="number" value={form.years_experience}
            onChange={(e) => set("years_experience", e.target.value)} />
        </Field>
        <Field label="Jersey #">
          <input style={{ ...inp, borderColor: jerseyTaken ? "#FCA5A5" : "#E8E6DF" }} type="number"
            placeholder={`e.g. ${suggested}`} value={form.jersey_number}
            onChange={(e) => set("jersey_number", e.target.value)} />
        </Field>
      </div>

      {jerseyTaken && (
        <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#991B1B", margin: "0 0 8px" }}>
          Jersey #{form.jersey_number} is already taken on this roster.
        </p>
      )}
      {nudge && (
        <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#92400E", margin: "0 0 8px" }}>
          {nudge}
        </p>
      )}

      <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'DM Mono',monospace",
        fontSize: 11, color: "#666", marginBottom: 10 }}>
        <input type="checkbox" checked={form.is_captain} onChange={(e) => set("is_captain", e.target.checked)} />
        This is me (the captain)
      </label>

      {error && <div style={errBox}>{error}</div>}

      <button disabled={busy || !canSubmit || jerseyTaken} onClick={submit}
        style={{ ...btnPrimary, width: "100%", opacity: (busy || !canSubmit || jerseyTaken) ? 0.5 : 1 }}>
        {busy ? "Adding…" : "Add to roster"}
      </button>
    </div>
  );
}

// ─── Bulk paste import — smart parsing ──────────────────────────────────────
const FIELD_KEYS = ["first_name", "last_name", "email", "age", "position",
  "skill_tier_reported", "years_experience", "jersey_number"];
const HEADER_ALIASES = {
  first: "first_name", firstname: "first_name",
  last: "last_name", lastname: "last_name",
  email: "email", age: "age",
  position: "position", pos: "position",
  tier: "skill_tier_reported", experience: "skill_tier_reported",
  years: "years_experience", yrs: "years_experience",
  jersey: "jersey_number", number: "jersey_number",
};
const POSITION_SYNONYMS = {
  defenseman: "defenseman", defense: "defenseman", d: "defenseman",
  center: "center", c: "center",
  winger: "winger", wing: "winger", w: "winger",
  goaltender: "goaltender", goalie: "goaltender", g: "goaltender",
};
const TIER_PATTERN = /^[ABCR][123]$/i;

function normalizeHeaderCell(cell) {
  return HEADER_ALIASES[cell.trim().toLowerCase().replace(/[^a-z]/g, "")] || null;
}

// A header row has recognizable field names and no '@' anywhere — a real
// data row's email column would always contain one.
function detectHeader(cells) {
  if (cells.some((c) => c.includes("@"))) return null;
  const mapped = cells.map(normalizeHeaderCell);
  return mapped.filter(Boolean).length >= 3 ? mapped : null;
}

// Self-heals a row when a value landed in the wrong column (e.g. two
// columns swapped) — checks whether the value in the *expected* slot
// actually looks right, and if not, searches the rest of the row for a
// value that does, rather than failing outright.
function selfHeal(obj) {
  const values = Object.values(obj).filter((v) => typeof v === "string");

  if (obj.email && !obj.email.includes("@")) {
    obj.email = values.find((v) => v.includes("@")) || obj.email;
  }
  if (obj.skill_tier_reported && !TIER_PATTERN.test(obj.skill_tier_reported)) {
    const found = values.find((v) => TIER_PATTERN.test(v));
    if (found) obj.skill_tier_reported = found;
  }
  if (obj.skill_tier_reported) obj.skill_tier_reported = obj.skill_tier_reported.toUpperCase();

  const posKey = (obj.position || "").trim().toLowerCase();
  if (obj.position && !POSITION_SYNONYMS[posKey]) {
    const found = values.find((v) => POSITION_SYNONYMS[v.trim().toLowerCase()]);
    if (found) obj.position = found;
  }
  if (obj.position) obj.position = POSITION_SYNONYMS[obj.position.trim().toLowerCase()] || obj.position;

  return obj;
}

function parseBulkText(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];

  const firstCells = lines[0].split(/\t|,/).map((c) => c.trim());
  const headerMap = detectHeader(firstCells);
  const dataLines = headerMap ? lines.slice(1) : lines;

  return dataLines.map((line, i) => {
    const cells = line.split(/\t|,/).map((c) => c.trim());
    const fields = {};
    if (headerMap) {
      headerMap.forEach((key, idx) => { if (key) fields[key] = cells[idx] || ""; });
    } else {
      FIELD_KEYS.forEach((key, idx) => { fields[key] = cells[idx] || ""; });
    }
    selfHeal(fields);

    const problems = [];
    if (!fields.first_name) problems.push("missing first name");
    if (!fields.last_name) problems.push("missing last name");
    if (!fields.email || !fields.email.includes("@")) problems.push("missing/invalid email");
    if (!fields.position || !POSITION_SYNONYMS[fields.position.trim().toLowerCase()] && !["defenseman","center","winger","goaltender"].includes(fields.position)) {
      problems.push("unrecognized position");
    }
    if (!fields.skill_tier_reported || !TIER_PATTERN.test(fields.skill_tier_reported)) {
      problems.push("unrecognized tier");
    }

    return { line: i + 1, raw: line, fields, problems };
  });
}

function BulkPasteImport({ onAdd, locked }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const preview = useMemo(() => parseBulkText(text), [text]);
  const validCount = preview.filter((r) => r.problems.length === 0).length;
  const problemCount = preview.length - validCount;

  if (locked) return null;

  const run = async () => {
    setBusy(true);
    let added = 0, failed = 0;
    for (const row of preview) {
      if (row.problems.length > 0) { failed++; continue; }
      const ok = await onAdd({ ...row.fields, is_captain: false });
      if (ok) added++; else failed++;
    }
    setResult({ added, failed });
    setText("");
    setBusy(false);
  };

  return (
    <div style={{ marginBottom: 18 }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, background: "transparent",
          border: "1px solid #E8E6DF", color: "#666", padding: "6px 12px", borderRadius: 8, cursor: "pointer" }}>
        {open ? "Hide bulk import" : "Paste from a spreadsheet instead"}
      </button>
      {open && (
        <div style={{ background: "#FAFAF8", border: "1px solid #E8E6DF", borderRadius: 12, padding: 14, marginTop: 8 }}>
          <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#888", margin: "0 0 8px" }}>
            One player per line, tab or comma separated. Include a header row (first, last, email, age,
            position, tier, years, jersey) in any order, or just paste the values directly.
          </p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
            style={{ ...inp, fontFamily: "'DM Mono',monospace", width: "100%", resize: "vertical" }}
            placeholder={"Marcus,Chen,marcus@example.com,34,winger,B1,12,14"} />

          {preview.length > 0 && (
            <div style={{ margin: "8px 0" }}>
              <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: problemCount ? "#92400E" : "#1A5C35",
                margin: "0 0 4px" }}>
                {preview.length} row{preview.length === 1 ? "" : "s"} detected — {validCount} look good
                {problemCount ? `, ${problemCount} have problems` : ""}.
              </p>
              {preview.filter((r) => r.problems.length > 0).map((r) => (
                <p key={r.line} style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#991B1B", margin: "2px 0" }}>
                  Line {r.line}: {r.problems.join(", ")}
                </p>
              ))}
            </div>
          )}

          <button disabled={busy || !validCount} onClick={run}
            style={{ ...btnPrimary, marginTop: 8, opacity: (busy || !validCount) ? 0.5 : 1 }}>
            {busy ? "Importing…" : `Import ${validCount || ""} player${validCount === 1 ? "" : "s"}`}
          </button>
          {result && (
            <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#666", marginTop: 6 }}>
              Added {result.added}{result.failed ? `, ${result.failed} skipped (duplicate, missing field, or roster full)` : ""}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Share link ──────────────────────────────────────────────────────────────
function ShareLink() {
  const [url, setUrl] = useState(null);
  const [busy, setBusy] = useState(false);

  const fetchLink = () => {
    setBusy(true);
    apiFetch("/captain/team/share-link").then((r) => setUrl(r.url)).finally(() => setBusy(false));
  };

  return (
    <div style={{ marginBottom: 18 }}>
      {!url ? (
        <button disabled={busy} onClick={fetchLink}
          style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, background: "transparent",
            border: "1px solid #E8E6DF", color: "#666", padding: "6px 12px", borderRadius: 8, cursor: "pointer" }}>
          {busy ? "Generating…" : "Get a view-only link for assistant coaches"}
        </button>
      ) : (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input readOnly value={url} onClick={(e) => e.target.select()}
            style={{ ...inp, flex: 1, minWidth: 220, fontSize: 11 }} />
          <button onClick={() => navigator.clipboard?.writeText(url)}
            style={{ ...btnPrimary, padding: "7px 12px", fontSize: 11 }}>Copy</button>
        </div>
      )}
    </div>
  );
}

// ─── Roster row ─────────────────────────────────────────────────────────────
function RosterRow({ player, onRemove, locked }) {
  const pc = POSITION_COLOR[player.position] || {};
  const initials = `${player.first_name?.[0] || "?"}${player.last_name?.[0] || ""}`;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
      background: "#fff", border: "1px solid #E8E6DF", borderRadius: 10, marginBottom: 6 }}>
      <div style={{ width: 28, textAlign: "center", fontFamily: "'DM Mono',monospace",
        fontSize: 12, fontWeight: 600, color: "#aaa" }}>
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
          </span>
        </div>
      </div>
      {!locked && (
        <button onClick={() => onRemove(player.roster_id)} title="Remove"
          style={{ ...iconBtn, color: "#DC2626" }}>✕</button>
      )}
    </div>
  );
}

// ─── Shared inline style tokens ─────────────────────────────────────────────
const lbl = { display: "block", fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#888",
  textTransform: "uppercase", letterSpacing: ".06em", margin: "10px 0 4px" };
const inp = { fontFamily: "'DM Mono',monospace", fontSize: 12, width: "100%",
  background: "#fff", border: "1px solid #E8E6DF", borderRadius: 6, padding: "7px 9px",
  color: "#1a1a2e", outline: "none", boxSizing: "border-box" };
const btnPrimary = { fontFamily: "'DM Mono',monospace", fontSize: 12, fontWeight: 600,
  background: "#1a1a2e", color: "#D4A017", border: "none", padding: "10px 16px",
  borderRadius: 8, cursor: "pointer" };
const iconBtn = { width: 28, height: 28, border: "none", background: "transparent",
  cursor: "pointer", fontSize: 13, flexShrink: 0 };
const errBox = { fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#991B1B",
  background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 6,
  padding: "6px 10px", margin: "8px 0" };

// ─── Shared (view-only) destination for the share link ─────────────────────
function SharedView({ teamId, token }) {
  const [team, setTeam] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch(`/captain/share/${teamId}/${token}`)
      .then(setTeam)
      .catch((e) => setError(e.message));
  }, [teamId, token]);

  if (error) {
    return <div style={page}><div style={errBox}>{error}</div></div>;
  }
  if (!team) {
    return <div style={{ ...page, padding: 40 }}>
      <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#aaa" }}>Loading…</p>
    </div>;
  }

  const band = BAND_COLOR[team.parity_action] || BAND_COLOR.balanced;
  const showBalance = team.player_count >= BALANCE_VISIBLE_AT;
  const updatedLabel = team.updated_at
    ? new Date(team.updated_at.replace(" ", "T")).toLocaleString([], { dateStyle: "short", timeStyle: "short" })
    : null;

  return (
    <div style={page}>
      <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#aaa", textTransform: "uppercase",
        letterSpacing: ".06em", margin: "0 0 4px" }}>View-only roster</p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700, color: "#1a1a2e", margin: "0 0 2px" }}>
          {team.name}
        </h1>
        <Pill bg={team.draft_locked ? "#E8F8EF" : "#FEF3C7"} color={team.draft_locked ? "#1A5C35" : "#92400E"}>
          {team.draft_locked ? "Submitted" : "Draft"}
        </Pill>
      </div>
      <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#aaa", margin: 0 }}>
        {team.division_label}
      </p>
      {updatedLabel && (
        <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#bbb", margin: "0 0 16px" }}>
          Updated {updatedLabel}
        </p>
      )}

      {team.players.map((p) => (
        <RosterRow key={p.roster_id} player={p} onRemove={() => {}} locked={true} />
      ))}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10, margin: "16px 0" }}>
        <Stat label="Roster size" value={`${team.player_count} / ${team.min_players}-${team.max_players}`} />
        <div style={{ background: "#F6F5F0", borderRadius: 8, padding: 12 }}>
          <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#888", margin: "0 0 8px" }}>Positions</p>
          <PositionChips counts={team.position_counts} />
        </div>
        <Stat label="Average age" value={team.age_score ?? "—"} />
        <div style={{ background: "#F6F5F0", borderRadius: 8, padding: 12 }}>
          <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#888", margin: "0 0 4px" }}>Team balance</p>
          {showBalance ? <Pill bg={band.bg} color={band.color}>{band.label}</Pill>
            : <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 13, color: "#aaa" }}>Keep building</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
export default function CaptainRoster() {
  const shareParams = new URLSearchParams(window.location.search);
  const shareTeam   = shareParams.get("grsh_share_team");
  const shareToken  = shareParams.get("grsh_share_token");
  if (shareTeam && shareToken) {
    return <SharedView teamId={shareTeam} token={shareToken} />;
  }

  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState({ divisions: [] });
  const [team, setTeam] = useState(null);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const load = useCallback(() => {
    apiFetch("/captain/team").then((data) => {
      setSetup(data);
      setTeam(data.team);
      setLoading(false);
    }).catch((e) => { setFormError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = (payload) => {
    setBusy(true); setFormError("");
    apiFetch("/captain/team", { method: "POST", body: JSON.stringify(payload) })
      .then((t) => setTeam(t))
      .catch((e) => setFormError(e.message))
      .finally(() => setBusy(false));
  };

  const handleAdd = (payload) => {
    setBusy(true); setFormError("");
    return apiFetch("/captain/team/players", { method: "POST", body: JSON.stringify(payload) })
      .then((t) => { setTeam(t); return true; })
      .catch((e) => {
        setFormError(e.data?.debug ? `${e.message} (${e.data.debug})` : e.message);
        return false;
      })
      .finally(() => setBusy(false));
  };

  const handleRemove = (rosterId) => {
    apiFetch(`/captain/team/players/${rosterId}`, { method: "DELETE" })
      .then((t) => setTeam(t))
      .catch((e) => setFormError(e.message));
  };

  const handleSubmitRoster = () => {
    setBusy(true); setSubmitError(null);
    apiFetch("/captain/team/submit", { method: "POST" })
      .then((t) => setTeam(t))
      .catch((e) => setSubmitError(e.data?.gaps?.join(", ") || e.message))
      .finally(() => setBusy(false));
  };

  if (loading) {
    return <div style={{ ...page, padding: 40 }}>
      <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#aaa" }}>Loading…</p>
    </div>;
  }

  if (!team) {
    return <div style={page}>
      <CreateTeamForm divisions={setup.divisions} onCreate={handleCreate} busy={busy} error={formError} />
    </div>;
  }

  const band = BAND_COLOR[team.parity_action] || BAND_COLOR.balanced;
  const showBalance = team.player_count >= BALANCE_VISIBLE_AT;
  const existingJerseys = team.players.map((p) => p.jersey_number).filter((j) => j !== null);
  const updatedLabel = team.updated_at
    ? new Date(team.updated_at.replace(" ", "T")).toLocaleString([], { dateStyle: "short", timeStyle: "short" })
    : null;
  const readyNotSubmitted = !team.draft_locked && team.gaps.length === 0;

  return (
    <div style={page}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div>
          <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700, color: "#1a1a2e", margin: "0 0 2px" }}>
            {team.name}
          </h1>
          <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#aaa", margin: 0 }}>
            {team.division_label}
          </p>
        </div>
        <Pill bg={team.draft_locked ? "#E8F8EF" : "#FEF3C7"} color={team.draft_locked ? "#1A5C35" : "#92400E"}>
          {team.draft_locked ? "Submitted" : "Draft"}
        </Pill>
      </div>

      {updatedLabel && (
        <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#bbb", margin: "0 0 16px" }}>
          Updated {updatedLabel}
        </p>
      )}

      <ShareLink />
      <BulkPasteImport onAdd={handleAdd} locked={team.draft_locked} />

      <AddPlayerForm onAdd={handleAdd} busy={busy} error={formError} locked={team.draft_locked}
        existingJerseys={existingJerseys} positionCounts={team.position_counts} />

      {team.players.map((p) => (
        <RosterRow key={p.roster_id} player={p} onRemove={handleRemove} locked={team.draft_locked} />
      ))}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10,
        margin: "16px 0" }}>
        <Stat label="Roster size" value={`${team.player_count} / ${team.min_players}-${team.max_players}`} />
        <div style={{ background: "#F6F5F0", borderRadius: 8, padding: 12 }}>
          <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#888", margin: "0 0 8px" }}>Positions</p>
          <PositionChips counts={team.position_counts} />
        </div>
        <Stat label="Average age" value={team.age_score ?? "—"} />
        <div style={{ background: "#F6F5F0", borderRadius: 8, padding: 12 }}>
          <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#888", margin: "0 0 4px" }}>Team balance</p>
          {showBalance ? (
            <Pill bg={band.bg} color={band.color}>{band.label}</Pill>
          ) : (
            <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 13, color: "#aaa" }}>Keep building</span>
          )}
        </div>
      </div>

      {!team.draft_locked && team.gaps.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#FEF3C7",
          color: "#92400E", borderRadius: 8, padding: "10px 14px", fontFamily: "'DM Mono',monospace",
          fontSize: 11, marginBottom: 14 }}>
          Still need: {team.gaps.join(", ")}
        </div>
      )}

      {readyNotSubmitted && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#E8F8EF",
          color: "#1A5C35", borderRadius: 8, padding: "10px 14px", fontFamily: "'DM Mono',monospace",
          fontSize: 12, fontWeight: 600, marginBottom: 14 }}>
          🎉 Minimum met with a goalie rostered — ready to submit.
        </div>
      )}

      {!team.draft_locked && (
        <>
          {submitError && <div style={errBox}>Not ready: {submitError}</div>}
          <button disabled={busy || !team.can_submit} onClick={handleSubmitRoster}
            style={{ ...btnPrimary, width: "100%", opacity: (busy || !team.can_submit) ? 0.4 : 1 }}>
            Submit roster for board review
          </button>
        </>
      )}

      {team.draft_locked && (
        <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#1A5C35" }}>
          ✓ Roster submitted. Contact the board if changes are needed.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ background: "#F6F5F0", borderRadius: 8, padding: 12 }}>
      <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#888", margin: "0 0 4px" }}>{label}</p>
      <p style={{ fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>{value}</p>
    </div>
  );
}

const page = { fontFamily: "'Fraunces',Georgia,serif", background: "#F6F5F0",
  minHeight: "100vh", padding: "20px 20px 60px", maxWidth: 640, margin: "0 auto" };
