/**
 * GRSH Captain Roster — self-service full-team roster builder.
 * Front-end only (no wp-admin access needed). Mounted via [grsh_captain_roster].
 *
 * Drop this file at: src/pages/CaptainRoster.jsx
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { TIER_VALUES, TIER_DESCRIPTIONS } from "../lib/playerScoring";
import {
  CreateTeamForm, EditTeamPanel, RegistrationBanner, SentBackBanner, StatusTracker,
  ChangeRequestBox, PaymentCard, ReviewDialog, printRosterSheet, REVIEW_STYLE,
} from "./CaptainRosterParts";

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

// Body text uses the system sans stack so the page matches the rest of the site;
// Fraunces stays on headings.
const BODY = "system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

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
      display: "inline-block", background: bg, color, fontSize: 12,
      fontFamily: BODY, fontWeight: 500,
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
            <span style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color }}>
              {POSITION_SHORT[key]}
            </span>
            <span style={{ fontFamily: BODY, fontSize: 14, fontWeight: 600, color }}>
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

// Inline styles can't do media queries, so layout switches on this.
function useIsWide(px = 900) {
  const q = `(min-width: ${px}px)`;
  const get = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(q).matches : false);
  const [wide, setWide] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    on();
    if (m.addEventListener) m.addEventListener("change", on); else m.addListener(on);
    return () => { if (m.removeEventListener) m.removeEventListener("change", on); else m.removeListener(on); };
  }, [q]);
  return wide;
}

// Phone add-player sheet. Tracks the visual viewport so the on-screen keyboard
// (notably iOS Safari) doesn't cover the form's buttons.
function BottomSheet({ onClose, children }) {
  const [vp, setVp] = useState({ h: typeof window !== "undefined" ? window.innerHeight : 700, off: 0 });
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const upd = () => setVp({ h: vv.height, off: Math.max(0, window.innerHeight - vv.height - vv.offsetTop) });
    upd();
    vv.addEventListener("resize", upd);
    vv.addEventListener("scroll", upd);
    return () => { vv.removeEventListener("resize", upd); vv.removeEventListener("scroll", upd); };
  }, []);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [onClose]);
  return (
    <>
      <div onClick={onClose} aria-hidden="true"
        style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(26,26,46,.45)", zIndex: 9997 }} />
      <div role="dialog" aria-modal="true" aria-label="Add a player"
        style={{ position: "fixed", left: 0, right: 0, bottom: vp.off, zIndex: 9998, background: "#fff",
          borderRadius: "16px 16px 0 0", maxHeight: Math.round(vp.h * 0.94), overflowY: "auto",
          boxSizing: "border-box", padding: "12px 14px calc(14px + env(safe-area-inset-bottom))",
          boxShadow: "0 -6px 24px rgba(0,0,0,.25)" }}>
        {children}
      </div>
    </>
  );
}

// ─── Quick-add form ─────────────────────────────────────────────────────────
// Required: first name, last name, email, position. Everything else lives
// under "More details" so a captain can enter a whole roster in one sitting
// and fill in levels later. After each add the form clears and keeps focus.
const QUICK_POSITIONS = [
  ["goaltender", "G", "Goalie"],
  ["defenseman", "D", "Defense"],
  ["center", "C", "Center"],
  ["winger", "W", "Wing"],
];
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function QuickAddForm({ onAdd, busy, error, locked, positionCounts, presetPosition, onClose, closeLabel }) {
  const blank = { first_name: "", last_name: "", email: "", age: "", position: "",
    skill_tier_reported: "", years_experience: "", jersey_number: "", is_captain: false };
  const [form, setForm] = useState(blank);
  const [lookupHit, setLookupHit] = useState(false);
  const [touched, setTouched] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [added, setAdded] = useState("");
  const firstNameRef = useRef(null);
  const wrapRef = useRef(null);
  const set = (k, v) => { setAdded(""); setForm((f) => ({ ...f, [k]: v })); };

  // "Still need a goalie" banner → preselects Goalie and jumps here.
  useEffect(() => {
    if (!presetPosition) return;
    if (presetPosition.position) set("position", presetPosition.position);
    wrapRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    firstNameRef.current?.focus();
  }, [presetPosition]);

  const missing = [];
  if (!form.first_name.trim()) missing.push("first name");
  if (!form.last_name.trim()) missing.push("last name");
  if (!EMAIL_OK.test(form.email.trim())) missing.push("a valid email");
  if (!form.position) missing.push("a position");
  const anyTyped = form.first_name || form.last_name || form.email || form.position;
  const nudge = getNudge(form.position, positionCounts);

  const submit = async (e) => {
    e?.preventDefault();
    setTouched(true);
    if (missing.length) return;
    const ok = await onAdd(form);
    if (ok) {
      setAdded(`${form.first_name.trim()} ${form.last_name.trim()}`.trim());
      setForm(blank);
      setLookupHit(false);
      setTouched(false);
      firstNameRef.current?.focus();
    }
  };

  const handleEmailBlur = async () => {
    const email = form.email.trim();
    if (!EMAIL_OK.test(email)) return;
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
    } catch { /* lookup is a convenience only */ }
  };

  if (locked) return null;

  return (
    <form ref={wrapRef} onSubmit={submit} noValidate
      style={{ background: "#FAFAF8", border: "1px solid #D9D6CB", borderRadius: 12, padding: 18, marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <p style={{ fontFamily: BODY, fontSize: 13, color: "#4b4b4b", margin: "0 0 4px",
          textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }}>Add a player</p>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close add player form"
            style={{ ...linkBtn, minHeight: 32, padding: "2px 10px" }}>{closeLabel || "Close ✕"}</button>
        )}
      </div>
      <p style={{ fontFamily: BODY, fontSize: 13, color: "#5c5c5c", margin: "0 0 10px" }}>
        We email each player their waiver as soon as you add them.
      </p>
      {added && (
        <p role="status" style={{ fontFamily: BODY, fontSize: 14, fontWeight: 600, color: "#14532D",
          background: "#DCFCE7", borderRadius: 8, padding: "8px 10px", margin: "0 0 10px" }}>
          ✓ Added {added}. Their waiver is on its way.
        </p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
        <Field label="First name">
          <input ref={firstNameRef} style={inp} value={form.first_name} autoComplete="off"
            onChange={(e) => set("first_name", e.target.value)} />
        </Field>
        <Field label="Last name">
          <input style={inp} value={form.last_name} autoComplete="off"
            onChange={(e) => set("last_name", e.target.value)} />
        </Field>
      </div>
      <Field label="Email (their waiver is sent here)">
        <input style={inp} type="email" inputMode="email" value={form.email} autoComplete="off"
          onChange={(e) => set("email", e.target.value)} onBlur={handleEmailBlur} />
      </Field>

      {lookupHit && (
        <p style={{ fontFamily: BODY, fontSize: 13, color: "#14532D", margin: "8px 0 0" }}>
          ✓ Found this player from a previous season. Position and level pre-filled.
        </p>
      )}

      <label style={lbl}>Position</label>
      <div role="group" aria-label="Position" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
        {QUICK_POSITIONS.map(([key, short, label]) => {
          const on = form.position === key;
          return (
            <button key={key} type="button" aria-pressed={on} onClick={() => set("position", on ? "" : key)}
              style={{ minHeight: 48, borderRadius: 10, cursor: "pointer",
                border: `2px solid ${on ? "#1a1a2e" : "#C9C6BB"}`,
                background: on ? "#1a1a2e" : "#fff", color: on ? "#D4A017" : "#1a1a2e",
                fontFamily: BODY, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", padding: "4px 2px" }}>
              <span style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{short}</span>
              <span style={{ fontSize: 12 }}>{label}</span>
            </button>
          );
        })}
      </div>

      {nudge && (
        <p style={{ fontFamily: BODY, fontSize: 13, color: "#7C3A0A", margin: "8px 0 0" }}>{nudge}</p>
      )}

      <details style={{ marginTop: 12 }} onToggle={(e) => setDetailsOpen(e.currentTarget.open)}>
        <summary style={{ fontFamily: BODY, fontSize: 14, color: "#1a1a2e", cursor: "pointer",
          minHeight: 32, display: "flex", alignItems: "center", gap: 6, listStyle: "none", fontWeight: 600 }}>
          <span aria-hidden="true" style={{ fontSize: 12 }}>{detailsOpen ? "▾" : "▸"}</span>
          More details (age, experience level, jersey #) — optional
        </summary>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8 }}>
          <Field label="Age">
            <input style={inp} type="number" inputMode="numeric" value={form.age}
              onChange={(e) => set("age", e.target.value)} />
          </Field>
          <Field label="Experience level">
            <select style={inp} value={form.skill_tier_reported}
              onChange={(e) => set("skill_tier_reported", e.target.value)}>
              <option value="">Choose later</option>
              {Object.keys(TIER_VALUES).map((t) => (
                <option key={t} value={t}>{t} — {TIER_DESCRIPTIONS[t]}</option>
              ))}
            </select>
          </Field>
          <Field label="Years playing">
            <input style={inp} type="number" inputMode="numeric" value={form.years_experience}
              onChange={(e) => set("years_experience", e.target.value)} />
          </Field>
          <Field label="Jersey #">
            <input style={inp} type="number" inputMode="numeric" value={form.jersey_number}
              onChange={(e) => set("jersey_number", e.target.value)} />
          </Field>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: BODY,
          fontSize: 14, color: "#3d3d3d", margin: "10px 0 0", minHeight: 32 }}>
          <input type="checkbox" checked={form.is_captain} onChange={(e) => set("is_captain", e.target.checked)}
            style={{ width: 20, height: 20 }} />
          This is me (the captain)
        </label>
      </details>

      {error && <div style={errBox} role="alert">{error}</div>}

      <button type="submit" disabled={busy} aria-disabled={busy || missing.length > 0}
        style={{ ...btnPrimary, width: "100%", marginTop: 14, minHeight: 48,
          opacity: busy ? 0.6 : 1 }}>
        {busy ? "Adding…" : "Add to roster"}
      </button>
      {(touched || anyTyped) && missing.length > 0 && (
        <p role="status" style={{ fontFamily: BODY, fontSize: 13, margin: "8px 0 0",
          color: touched ? "#991B1B" : "#5c5c5c" }}>
          To add this player, still need: {missing.join(", ")}.
        </p>
      )}
    </form>
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
        style={{ fontFamily: BODY, fontSize: 13, background: "transparent",
          border: "1px solid #E8E6DF", color: "#3d3d3d", padding: "6px 12px", borderRadius: 8, cursor: "pointer" }}>
        {open ? "Hide bulk import" : "Paste from a spreadsheet instead"}
      </button>
      {open && (
        <div style={{ background: "#FAFAF8", border: "1px solid #E8E6DF", borderRadius: 12, padding: 14, marginTop: 8 }}>
          <p style={{ fontFamily: BODY, fontSize: 13, color: "#5c5c5c", margin: "0 0 8px" }}>
            One player per line, tab or comma separated. Include a header row (first, last, email, age,
            position, tier, years, jersey) in any order, or just paste the values directly.
          </p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
            style={{ ...inp, fontFamily: BODY, width: "100%", resize: "vertical" }}
            placeholder={"Marcus,Chen,marcus@example.com,34,winger,B1,12,14"} />

          {preview.length > 0 && (
            <div style={{ margin: "8px 0" }}>
              <p style={{ fontFamily: BODY, fontSize: 13, color: problemCount ? "#92400E" : "#1A5C35",
                margin: "0 0 4px" }}>
                {preview.length} row{preview.length === 1 ? "" : "s"} detected — {validCount} look good
                {problemCount ? `, ${problemCount} have problems` : ""}.
              </p>
              {preview.filter((r) => r.problems.length > 0).map((r) => (
                <p key={r.line} style={{ fontFamily: BODY, fontSize: 12, color: "#991B1B", margin: "2px 0" }}>
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
            <p style={{ fontFamily: BODY, fontSize: 13, color: "#3d3d3d", marginTop: 6 }}>
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
          style={{ fontFamily: BODY, fontSize: 13, background: "transparent",
            border: "1px solid #E8E6DF", color: "#3d3d3d", padding: "6px 12px", borderRadius: 8, cursor: "pointer" }}>
          {busy ? "Generating…" : "Get a view-only link for assistant coaches"}
        </button>
      ) : (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input readOnly value={url} onClick={(e) => e.target.select()}
            style={{ ...inp, flex: 1, minWidth: 220, fontSize: 13 }} />
          <button onClick={() => navigator.clipboard?.writeText(url)}
            style={{ ...btnPrimary, padding: "7px 12px", fontSize: 13 }}>Copy</button>
        </div>
      )}
    </div>
  );
}

// ─── Roster row ─────────────────────────────────────────────────────────────
function agoLabel(iso) {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return "just now";
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function waiverChip(p) {
  switch (p.waiver_status) {
    case "signed": return { bg: "#DCFCE7", color: "#14532D", text: "Signed ✓" };
    case "failed": return { bg: "#FEE2E2", color: "#991B1B", text: "Email failed ⚠" };
    case "sent":   return { bg: "#FEF3C7", color: "#7C3A0A", text: `Sent · ${agoLabel(p.waiver_sent_at)}` };
    default:       return { bg: "#ECEAE2", color: "#3d3d3d", text: "Not sent" };
  }
}

const linkBtn = { fontFamily: BODY, fontSize: 13, background: "#fff",
  border: "1px solid #C9C6BB", color: "#1a1a2e", borderRadius: 8, padding: "6px 10px",
  minHeight: 36, cursor: "pointer" };

function RosterRow({ player, onRemove, locked, onResend, onSaveEmail, onCopyLink, onSaveTier }) {
  const pc = POSITION_COLOR[player.position] || {};
  const initials = `${player.first_name?.[0] || "?"}${player.last_name?.[0] || ""}`;
  const chip = waiverChip(player);
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(player.email || "");
  const [msg, setMsg] = useState("");
  const [working, setWorking] = useState(false);

  const run = async (fn, okMsg) => {
    setWorking(true); setMsg("");
    try { await fn(); if (okMsg) setMsg(okMsg); }
    catch (e) { setMsg(e.message || "Something went wrong."); }
    finally { setWorking(false); }
  };
  const unsigned = player.waiver_status !== "signed";
  const canAct = unsigned && onResend;

  return (
    <div id={`roster-row-${player.roster_id}`}
      style={{ padding: "10px 12px", background: "#fff", border: "1px solid #D9D6CB", borderRadius: 10, marginBottom: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 34, textAlign: "center", fontFamily: BODY,
          fontSize: 14, fontWeight: 600, color: "#5c5c5c" }}>
          {player.jersey_number !== null ? `#${player.jersey_number}` : "—"}
        </div>
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#1a1a2e", color: "#D4A017",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          fontFamily: BODY, fontSize: 13, fontWeight: 500 }}>{initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Fraunces',serif", fontSize: 16, fontWeight: 600, color: "#1a1a2e",
            display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {player.first_name} {player.last_name}
            {player.is_captain && <Pill bg="#1a1a2e" color="#D4A017">C</Pill>}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
            {pc.bg && <Pill bg={pc.bg} color={pc.color}>{POSITION_LABEL[player.position]}</Pill>}
            {player.needs_details
              ? <Pill bg="#FEF3C7" color="#7C3A0A">Needs level</Pill>
              : <Pill bg="#ECEAE2" color="#3d3d3d">{player.skill_tier_reported}</Pill>}
            <Pill bg={chip.bg} color={chip.color}>{chip.text}</Pill>
          </div>
        </div>
        {!locked && (
          <button onClick={() => onRemove(player.roster_id)} title="Remove" aria-label={`Remove ${player.first_name}`}
            style={{ ...iconBtn, width: 40, height: 40, color: "#B91C1C", fontSize: 16 }}>✕</button>
        )}
      </div>

      {player.needs_details && onSaveTier && (
        <div style={{ marginTop: 8 }}>
          <label style={{ ...lbl, margin: "0 0 4px" }}>Experience level (needed before you submit)</label>
          <select style={inp} defaultValue="" disabled={working}
            onChange={(e) => e.target.value && run(() => onSaveTier(player.roster_id, e.target.value))}>
            <option value="">Choose…</option>
            {Object.keys(TIER_VALUES).map((t) => (
              <option key={t} value={t}>{t} — {TIER_DESCRIPTIONS[t]}</option>
            ))}
          </select>
        </div>
      )}

      {canAct && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <button style={linkBtn} disabled={working} onClick={() => run(() => onResend(player.roster_id), "Waiver email sent.")}>Resend</button>
          <button style={linkBtn} disabled={working} onClick={() => setEditing((v) => !v)}>Edit email</button>
          <button style={linkBtn} disabled={working} onClick={() => run(() => onCopyLink(player.roster_id), "Link copied. Paste it into a text.")}>Copy waiver link</button>
        </div>
      )}
      {canAct && editing && (
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <input style={{ ...inp, flex: 1, minWidth: 200 }} type="email" inputMode="email" value={email}
            onChange={(e) => setEmail(e.target.value)} />
          <button style={{ ...btnPrimary, padding: "8px 14px" }} disabled={working || !EMAIL_OK.test(email.trim())}
            onClick={() => run(async () => { await onSaveEmail(player.roster_id, email.trim()); setEditing(false); }, "Email updated and waiver sent.")}>
            Save and resend
          </button>
        </div>
      )}
      {msg && <p role="status" style={{ fontFamily: BODY, fontSize: 13, color: "#3d3d3d", margin: "6px 0 0" }}>{msg}</p>}
    </div>
  );
}

// ─── Shared inline style tokens ─────────────────────────────────────────────
const lbl = { display: "block", fontFamily: BODY, fontSize: 12, color: "#5c5c5c",
  textTransform: "uppercase", letterSpacing: ".06em", margin: "10px 0 4px" };
const inp = { fontFamily: BODY, fontSize: 16, width: "100%",
  background: "#fff", border: "1px solid #8f8c80", borderRadius: 8, padding: "10px 11px",
  color: "#1a1a2e", outline: "none", boxSizing: "border-box" };
const btnPrimary = { fontFamily: BODY, fontSize: 12, fontWeight: 600,
  background: "#1a1a2e", color: "#D4A017", border: "none", padding: "10px 16px",
  borderRadius: 8, cursor: "pointer" };
const iconBtn = { width: 28, height: 28, border: "none", background: "transparent",
  cursor: "pointer", fontSize: 13, flexShrink: 0 };
const errBox = { fontFamily: BODY, fontSize: 13, color: "#991B1B",
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
      <p style={{ fontFamily: BODY, fontSize: 12, color: "#5c5c5c" }}>Loading…</p>
    </div>;
  }

  const band = BAND_COLOR[team.parity_action] || BAND_COLOR.balanced;
  const showBalance = team.player_count >= BALANCE_VISIBLE_AT;
  const updatedLabel = team.updated_at
    ? new Date(team.updated_at.replace(" ", "T")).toLocaleString([], { dateStyle: "short", timeStyle: "short" })
    : null;

  return (
    <div style={page}>
      <p style={{ fontFamily: BODY, fontSize: 12, color: "#5c5c5c", textTransform: "uppercase",
        letterSpacing: ".06em", margin: "0 0 4px" }}>View-only roster</p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700, color: "#1a1a2e", margin: "0 0 2px" }}>
          {team.name}
        </h1>
        <Pill bg={team.draft_locked ? "#E8F8EF" : "#FEF3C7"} color={team.draft_locked ? "#1A5C35" : "#92400E"}>
          {team.draft_locked ? "Submitted" : "Not submitted yet"}
        </Pill>
      </div>
      <p style={{ fontFamily: BODY, fontSize: 13, color: "#5c5c5c", margin: 0 }}>
        {team.division_label}
      </p>
      {updatedLabel && (
        <p style={{ fontFamily: BODY, fontSize: 12, color: "#5c5c5c", margin: "0 0 16px" }}>
          Updated {updatedLabel}
        </p>
      )}

      {team.players.map((p) => (
        <RosterRow key={p.roster_id} player={p} onRemove={() => {}} locked={true} />
      ))}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10, margin: "16px 0" }}>
        <Stat label="Roster size" value={`${team.player_count} / ${team.min_players}-${team.max_players}`} />
        <div style={{ background: "#F6F5F0", borderRadius: 8, padding: 12 }}>
          <p style={{ fontFamily: BODY, fontSize: 12, color: "#5c5c5c", margin: "0 0 8px" }}>Positions</p>
          <PositionChips counts={team.position_counts} />
        </div>
        <Stat label="Average age" value={team.age_score ?? "—"} />
        <div style={{ background: "#F6F5F0", borderRadius: 8, padding: 12 }}>
          <p style={{ fontFamily: BODY, fontSize: 12, color: "#5c5c5c", margin: "0 0 4px" }}>Team balance</p>
          {showBalance ? <Pill bg={band.bg} color={band.color}>{band.label}</Pill>
            : <span style={{ fontFamily: BODY, fontSize: 13, color: "#5c5c5c" }}>Keep building</span>}
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
  const [remindMsg, setRemindMsg] = useState("");
  const [presetPosition, setPresetPosition] = useState(null);
  // Phone only: whether the add-player sheet is open. On wide screens the form is always shown.
  const [addOpen, setAddOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const isWide = useIsWide(900);
  const [editing, setEditing] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [printMsg, setPrintMsg] = useState("");

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

  // Waiver + detail actions. Each returns the promise so RosterRow can show
  // its own inline success/error message.
  const handleResend = (id) =>
    apiFetch(`/captain/team/players/${id}/waiver`, { method: "POST" }).then(setTeam);
  const handleSaveEmail = (id, email) =>
    apiFetch(`/captain/team/players/${id}/email`, { method: "POST", body: JSON.stringify({ email }) }).then(setTeam);
  const handleCopyLink = async (id) => {
    const r = await apiFetch(`/captain/team/players/${id}/waiver-link`);
    await navigator.clipboard.writeText(r.url);
  };
  const handleSaveTier = (id, tier) =>
    apiFetch(`/captain/team/players/${id}/details`, {
      method: "POST", body: JSON.stringify({ skill_tier_reported: tier }),
    }).then(setTeam);
  const handleRemind = () => {
    setBusy(true); setRemindMsg("");
    apiFetch("/captain/team/remind", { method: "POST" })
      .then((t) => {
        setTeam(t);
        const r = t.remind_result || {};
        setRemindMsg(r.sent
          ? `Reminder sent to ${r.sent} player${r.sent === 1 ? "" : "s"}.${r.skipped ? ` ${r.skipped} skipped (emailed in the last 24 hours).` : ""}`
          : "Everyone unsigned was already emailed in the last 24 hours.");
      })
      .catch((e) => setRemindMsg(e.message))
      .finally(() => setBusy(false));
  };

  const handleSubmitRoster = () => {
    setBusy(true); setSubmitError(null);
    apiFetch("/captain/team/submit", { method: "POST" })
      .then((t) => { setTeam(t); setReviewOpen(false); })
      .catch((e) => setSubmitError(e.data?.gaps?.join(", ") || e.message))
      .finally(() => setBusy(false));
  };

  // Rename / change division before submit. Rejects with the server message so the panel can show it.
  const handleUpdateTeam = (payload) =>
    apiFetch("/captain/team/update", { method: "POST", body: JSON.stringify(payload) })
      .then((t) => { setTeam(t); setEditing(false); });

  // After submit: ask the board for a change.
  const handleChangeRequest = (message) =>
    apiFetch("/captain/team/change-request", { method: "POST", body: JSON.stringify({ message }) })
      .then((t) => setTeam(t));

  if (loading) {
    return <div style={{ ...page, padding: 40 }}>
      <p style={{ fontFamily: BODY, fontSize: 12, color: "#5c5c5c" }}>Loading…</p>
    </div>;
  }

  if (!team) {
    return <div style={page}>
      <RegistrationBanner reg={setup.registration} />
      <CreateTeamForm divisions={setup.divisions} setup={setup} onCreate={handleCreate} busy={busy} error={formError} />
    </div>;
  }

  const band = BAND_COLOR[team.parity_action] || BAND_COLOR.balanced;
  const showBalance = team.player_count >= BALANCE_VISIBLE_AT;
  const existingJerseys = team.players.map((p) => p.jersey_number).filter((j) => j !== null);
  const updatedLabel = team.updated_at
    ? new Date(team.updated_at.replace(" ", "T")).toLocaleString([], { dateStyle: "short", timeStyle: "short" })
    : null;
  const readyNotSubmitted = !team.draft_locked && team.gaps.length === 0;
  const sheetOpen = !isWide && addOpen;
  const reviewStatus = team.review?.status || "";
  const pillStyle = team.draft_locked
    ? (REVIEW_STYLE[reviewStatus] || REVIEW_STYLE.submitted)
    : (reviewStatus === "changes_requested" ? REVIEW_STYLE.changes_requested : { bg: "#FEF3C7", color: "#92400E" });
  const pillLabel = team.draft_locked
    ? (team.review?.label || "Submitted")
    : (reviewStatus === "changes_requested" ? "Changes requested" : "Not submitted yet");
  const handlePrint = () => {
    setPrintMsg(printRosterSheet(team) ? "" : "Your browser blocked the print window. Allow pop-ups for this site and try again.");
  };

  return (
    <div style={{ ...page, maxWidth: isWide ? 1040 : 640,
      paddingBottom: !isWide && !team.draft_locked ? 110 : 60 }}>
      <div style={{ background: "#fff", border: "1px solid #D9D6CB", borderRadius: 12,
        padding: "14px 16px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div>
            <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700, color: "#1a1a2e", margin: "0 0 2px" }}>
              {team.name}
            </h1>
            <p style={{ fontFamily: BODY, fontSize: 14, color: "#5c5c5c", margin: 0 }}>
              {team.division_label}
            </p>
            {!team.draft_locked && !editing && (
              <button style={{ ...linkBtn, minHeight: 32, padding: "2px 10px", marginTop: 8 }} onClick={() => setEditing(true)}>
                Edit team
              </button>
            )}
          </div>
          <Pill bg={pillStyle.bg} color={pillStyle.color}>{pillLabel}</Pill>
        </div>
        {editing && !team.draft_locked && (
          <EditTeamPanel team={team} divisions={setup.divisions} onSave={handleUpdateTeam} onCancel={() => setEditing(false)} />
        )}
        <div aria-hidden="true" style={{ height: 8, background: "#ECEAE2", borderRadius: 99, margin: "12px 0 8px", overflow: "hidden" }}>
          <div style={{ width: `${Math.min(100, Math.round((team.player_count / (team.min_players || 1)) * 100))}%`,
            height: "100%", background: team.player_count >= team.min_players ? "#1A5C35" : "#D4A017" }} />
        </div>
        <p style={{ fontFamily: BODY, fontSize: 15, fontWeight: 600, color: "#1a1a2e", margin: 0 }}>
          {team.player_count} player{team.player_count === 1 ? "" : "s"} (minimum {team.min_players})
          {team.waivers_total > 0 ? ` · ${team.waivers_signed} of ${team.waivers_total} waivers signed` : ""}
        </p>
      </div>

      <RegistrationBanner reg={setup.registration} />
      <SentBackBanner review={team.review} />
      {team.draft_locked && <StatusTracker team={team} />}

      {!team.draft_locked && team.gaps.length > 0 && (
        <div style={{ background: "#FEF3C7", color: "#7C3A0A", borderRadius: 8, padding: "10px 14px",
          fontFamily: BODY, fontSize: 14, marginBottom: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>To submit, you still need:</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {team.gaps.map((g) => {
              const isGoalie = g.startsWith("a goalie");
              const isLevel  = g.startsWith("experience level");
              const onTap = () => {
                if (isLevel) {
                  const first = team.players.find((p) => p.needs_details);
                  document.getElementById(`roster-row-${first?.roster_id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                } else {
                  setPresetPosition({ position: isGoalie ? "goaltender" : "", n: Date.now() });
                  if (!isWide) setAddOpen(true);
                }
              };
              if (/minimum/i.test(g)) return <span key={g} style={{ alignSelf: "center" }}>{g}</span>;
              return (
                <button key={g} onClick={onTap}
                  style={{ ...linkBtn, background: "#fff", borderColor: "#7C3A0A", color: "#7C3A0A" }}>
                  {g} →
                </button>
              );
            })}
          </div>
        </div>
      )}

      {readyNotSubmitted && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#E8F8EF",
          color: "#1A5C35", borderRadius: 8, padding: "10px 14px", fontFamily: BODY,
          fontSize: 12, fontWeight: 600, marginBottom: 14 }}>
          🎉 Minimum met with a goalie rostered — ready to submit.
        </div>
      )}


      <div style={isWide ? { display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(0,1fr)", gap: 20, alignItems: "start" } : {}}>
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
            flexWrap: "wrap", margin: "0 0 10px" }}>
            <p style={{ fontFamily: BODY, fontSize: 14, fontWeight: 700, color: "#1a1a2e", margin: 0,
              textTransform: "uppercase", letterSpacing: ".06em" }}>Roster · {team.player_count}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {team.player_count > 0 && team.waivers_signed < team.waivers_total && (
                <button style={{ ...linkBtn, minHeight: 40 }} disabled={busy} onClick={handleRemind}>
                  Remind everyone unsigned ({team.waivers_total - team.waivers_signed})
                </button>
              )}
              <button style={{ ...linkBtn, minHeight: 40 }} aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)}>
                More {moreOpen ? "▴" : "▾"}
              </button>
            </div>
          </div>
          {remindMsg && (
            <p role="status" style={{ fontFamily: BODY, fontSize: 13, color: "#3d3d3d", margin: "0 0 8px" }}>{remindMsg}</p>
          )}
          {moreOpen && (
            <div style={{ background: "#FAFAF8", border: "1px solid #D9D6CB", borderRadius: 12, padding: 12, marginBottom: 12 }}>
              <ShareLink />
              {team.player_count > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <button style={linkBtn} onClick={handlePrint}>Print roster (or save as PDF)</button>
                  {printMsg && <p role="status" style={{ fontFamily: BODY, fontSize: 13, color: "#991B1B", margin: "6px 0 0" }}>{printMsg}</p>}
                </div>
              )}
              <BulkPasteImport onAdd={handleAdd} locked={team.draft_locked} />
            </div>
          )}

          {team.players.length === 0 && !team.draft_locked && (
            <div style={{ border: "2px dashed #C9C6BB", borderRadius: 12, padding: 20, textAlign: "center",
              fontFamily: BODY, fontSize: 15, color: "#3d3d3d", marginBottom: 10 }}>
              <p style={{ margin: "0 0 10px" }}>No players yet.</p>
              {isWide
                ? <p style={{ margin: 0 }}>Add your first player with the form on the right.</p>
                : <button style={{ ...btnPrimary, minHeight: 48, fontSize: 14 }}
                    onClick={() => { setPresetPosition(null); setAddOpen(true); }}>+ Add your first player</button>}
            </div>
          )}

          {team.players.map((p) => (
            <RosterRow key={p.roster_id} player={p} onRemove={handleRemove} locked={team.draft_locked}
              onResend={handleResend} onSaveEmail={handleSaveEmail} onCopyLink={handleCopyLink}
              onSaveTier={handleSaveTier} />
          ))}
        </div>

        {isWide && !team.draft_locked && (
          <div style={{ position: "sticky", top: 100, maxHeight: "calc(100vh - 120px)", overflowY: "auto" }}>
            <QuickAddForm onAdd={handleAdd} busy={busy} error={formError} locked={team.draft_locked}
              positionCounts={team.position_counts} presetPosition={presetPosition} />
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10,
        margin: "16px 0" }}>
        <Stat label="Roster size" value={`${team.player_count} / ${team.min_players}-${team.max_players}`} />
        <div style={{ background: "#F6F5F0", borderRadius: 8, padding: 12 }}>
          <p style={{ fontFamily: BODY, fontSize: 12, color: "#5c5c5c", margin: "0 0 8px" }}>Positions</p>
          <PositionChips counts={team.position_counts} />
        </div>
        <Stat label="Average age" value={team.age_score ?? "—"} />
        <div style={{ background: "#F6F5F0", borderRadius: 8, padding: 12 }}>
          <p style={{ fontFamily: BODY, fontSize: 12, color: "#5c5c5c", margin: "0 0 4px" }}>Team balance</p>
          {showBalance ? (
            <Pill bg={band.bg} color={band.color}>{band.label}</Pill>
          ) : (
            <span style={{ fontFamily: BODY, fontSize: 13, color: "#5c5c5c" }}>Keep building</span>
          )}
        </div>
      </div>

      <PaymentCard team={team} fees={setup.fees} />

      {!team.draft_locked && (
        <>
          {submitError && !reviewOpen && <div style={errBox}>Not ready: {submitError}</div>}
          {team.can_submit && team.warnings?.length > 0 && (
            <p style={{ fontFamily: BODY, fontSize: 13, color: "#7C3A0A", margin: "0 0 8px" }}>
              You can submit now. {team.warnings.join(". ")}. Use "Remind everyone unsigned" above to chase them.
            </p>
          )}
          <button disabled={busy || !team.can_submit} onClick={() => { setSubmitError(null); setReviewOpen(true); }}
            style={{ ...btnPrimary, width: "100%", minHeight: 48, fontSize: 14,
              opacity: (busy || !team.can_submit) ? 0.45 : 1 }}>
            Review and submit roster
          </button>
          {!team.can_submit && (
            <p style={{ fontFamily: BODY, fontSize: 13, color: "#5c5c5c", margin: "8px 0 0" }}>
              This unlocks once the items above are done.
            </p>
          )}
        </>
      )}

      {team.draft_locked && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
          <ChangeRequestBox team={team} onSend={handleChangeRequest} />
          <button style={{ ...linkBtn, minHeight: 44 }} onClick={handlePrint}>Print roster (or save as PDF)</button>
        </div>
      )}
      {team.draft_locked && printMsg && (
        <p role="status" style={{ fontFamily: BODY, fontSize: 13, color: "#991B1B", margin: "8px 0 0" }}>{printMsg}</p>
      )}
      {updatedLabel && (
        <p style={{ fontFamily: BODY, fontSize: 12, color: "#6b6b6b", margin: "14px 0 0" }}>Last saved {updatedLabel}</p>
      )}

      {!isWide && !team.draft_locked && !sheetOpen && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 9990, background: "#fff",
          borderTop: "1px solid #D9D6CB", padding: "10px 16px calc(10px + env(safe-area-inset-bottom))" }}>
          <button style={{ ...btnPrimary, width: "100%", minHeight: 52, fontSize: 15 }}
            onClick={() => { setPresetPosition(null); setAddOpen(true); }}>+ Add player</button>
        </div>
      )}
      {sheetOpen && !team.draft_locked && (
        <BottomSheet onClose={() => setAddOpen(false)}>
          <QuickAddForm onAdd={handleAdd} busy={busy} error={formError} locked={team.draft_locked}
            positionCounts={team.position_counts} presetPosition={presetPosition}
            onClose={() => setAddOpen(false)} closeLabel="Done" />
        </BottomSheet>
      )}
      {reviewOpen && !team.draft_locked && (
        <ReviewDialog team={team} busy={busy} error={submitError}
          onConfirm={handleSubmitRoster} onClose={() => setReviewOpen(false)} />
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ background: "#F6F5F0", borderRadius: 8, padding: 12 }}>
      <p style={{ fontFamily: BODY, fontSize: 12, color: "#5c5c5c", margin: "0 0 4px" }}>{label}</p>
      <p style={{ fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>{value}</p>
    </div>
  );
}

// Extra top padding keeps the theme's floating logo badge from sitting on
// top of the team header card.
const page = { fontFamily: "'Fraunces',Georgia,serif", background: "#F6F5F0",
  minHeight: "100vh", padding: "72px 20px 60px", maxWidth: 640, margin: "0 auto" };
