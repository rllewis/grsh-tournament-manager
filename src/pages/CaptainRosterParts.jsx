/**
 * Captain roster - team setup, review/submit and post-submit pieces.
 * Split out of CaptainRoster.jsx so that file stays readable.
 *
 * Drop this file at: src/pages/CaptainRosterParts.jsx
 */

import { useState, useEffect } from "react";

// Small copies of the page's style tokens (kept local so there is no import cycle).
const BODY = "system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "'Fraunces',serif";
const lbl = { display: "block", fontFamily: BODY, fontSize: 12, color: "#5c5c5c",
  textTransform: "uppercase", letterSpacing: ".06em", margin: "12px 0 4px" };
const inp = { fontFamily: BODY, fontSize: 16, width: "100%", background: "#fff",
  border: "1px solid #8f8c80", borderRadius: 8, padding: "10px 11px", color: "#1a1a2e",
  outline: "none", boxSizing: "border-box" };
const btnPrimary = { fontFamily: BODY, fontSize: 14, fontWeight: 600, background: "#1a1a2e",
  color: "#D4A017", border: "none", padding: "10px 16px", borderRadius: 8, cursor: "pointer", minHeight: 44 };
const btnSecondary = { fontFamily: BODY, fontSize: 14, background: "#fff", color: "#1a1a2e",
  border: "1px solid #C9C6BB", borderRadius: 8, padding: "10px 14px", minHeight: 44, cursor: "pointer" };
const errBox = { fontFamily: BODY, fontSize: 13, color: "#991B1B", background: "#FEF2F2",
  border: "1px solid #FCA5A5", borderRadius: 6, padding: "6px 10px", margin: "8px 0" };
const card = { background: "#fff", border: "1px solid #D9D6CB", borderRadius: 12, padding: "14px 16px", marginBottom: 14 };

const POSITION_LABEL = { defenseman: "Defense", center: "Center", winger: "Winger", goaltender: "Goalie" };
const POSITION_SHORT = { goaltender: "G", defenseman: "D", center: "C", winger: "W" };

export const REVIEW_STYLE = {
  submitted:         { bg: "#E8F8EF", color: "#1A5C35" },
  under_review:      { bg: "#E8F0FE", color: "#1A3F8F" },
  approved:          { bg: "#DCFCE7", color: "#14532D" },
  changes_requested: { bg: "#FEE2E2", color: "#991B1B" },
  change_pending:    { bg: "#FEF3C7", color: "#92400E" },
};

// ─── helpers ────────────────────────────────────────────────────────────────
export function fmtDate(iso) {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}
const money = (n) => (n === null || n === undefined ? "" : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const localToday = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};

// ─── Registration window banner ─────────────────────────────────────────────
export function RegistrationBanner({ reg }) {
  if (!reg) return null;
  let tone; let text;
  if (reg.state === "not_open") {
    tone = { bg: "#E8F0FE", color: "#1A3F8F" };
    text = `Registration opens ${fmtDate(reg.opens)}. You can set up your team and add players now.`;
  } else if (reg.state === "closed") {
    tone = { bg: "#FEE2E2", color: "#991B1B" };
    text = `Registration closed ${fmtDate(reg.closes)}. Contact the board if you still need to register.`;
  } else if (reg.closes) {
    const urgent = reg.days_left !== null && reg.days_left <= 14;
    tone = urgent ? { bg: "#FEF3C7", color: "#92400E" } : { bg: "#ECEAE2", color: "#3d3d3d" };
    text = `Registration closes ${fmtDate(reg.closes)}${reg.days_left !== null ? ` (${reg.days_left} day${reg.days_left === 1 ? "" : "s"} left)` : ""}.`;
  } else {
    return null;
  }
  return (
    <div role="status" style={{ background: tone.bg, color: tone.color, borderRadius: 8, padding: "9px 14px",
      fontFamily: BODY, fontSize: 14, marginBottom: 14 }}>{text}</div>
  );
}

// ─── Create team (no default division; cards show spots left) ───────────────
export function CreateTeamForm({ divisions, setup, onCreate, busy, error }) {
  const [name, setName] = useState("");
  const [division, setDivision] = useState("");
  const gMin = setup?.goalie_min ?? 1;

  return (
    <div style={{ ...card, padding: 24, maxWidth: 560 }}>
      <h2 style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: "#1a1a2e", margin: "0 0 4px" }}>
        Set up your team
      </h2>
      <p style={{ fontFamily: BODY, fontSize: 14, color: "#5c5c5c", margin: "0 0 4px" }}>
        This takes about a minute. Next you add players, and each one gets their own waiver by email.
      </p>

      <label style={lbl} htmlFor="grsh-team-name">Team name</label>
      <input id="grsh-team-name" value={name} onChange={(e) => setName(e.target.value)} style={inp}
        placeholder="Riverside Reapers" autoComplete="off" />

      <label style={lbl} id="grsh-div-label">Division</label>
      <p style={{ fontFamily: BODY, fontSize: 13, color: "#5c5c5c", margin: "0 0 8px" }}>
        Choose the division your team will play in. You can change it until you submit your roster.
      </p>
      <div role="radiogroup" aria-labelledby="grsh-div-label" style={{ display: "grid", gap: 8 }}>
        {divisions.map((d) => {
          const full = !!d.spots && d.taken >= d.spots;
          const left = d.spots ? Math.max(0, d.spots - d.taken) : null;
          const on = division === d.key;
          return (
            <button key={d.key} type="button" role="radio" aria-checked={on} disabled={full}
              onClick={() => setDivision(d.key)}
              style={{ textAlign: "left", minHeight: 56, borderRadius: 10, padding: "10px 14px",
                cursor: full ? "not-allowed" : "pointer", fontFamily: BODY,
                border: `2px solid ${on ? "#1a1a2e" : "#C9C6BB"}`,
                background: on ? "#1a1a2e" : "#fff", color: on ? "#D4A017" : "#1a1a2e",
                opacity: full ? 0.5 : 1, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{d.label}</span>
              <span style={{ fontSize: 13, color: on ? "#D4A017" : "#5c5c5c" }}>
                {full ? "Full" : left !== null ? `${left} of ${d.spots} team spot${d.spots === 1 ? "" : "s"} left` : "Open"}
              </span>
            </button>
          );
        })}
      </div>
      {setup?.min_players && (
        <p style={{ fontFamily: BODY, fontSize: 13, color: "#5c5c5c", margin: "10px 0 0" }}>
          Every roster needs {setup.min_players} to {setup.max_players} players, including at least {gMin} goalie{gMin === 1 ? "" : "s"}.
        </p>
      )}

      {error && <div style={errBox} role="alert">{error}</div>}

      <button disabled={busy || !name.trim() || !division}
        onClick={() => onCreate({ name: name.trim(), division })}
        style={{ ...btnPrimary, width: "100%", marginTop: 14, minHeight: 48,
          opacity: busy || !name.trim() || !division ? 0.5 : 1 }}>
        {busy ? "Creating…" : "Create team"}
      </button>
      {(!name.trim() || !division) && (
        <p style={{ fontFamily: BODY, fontSize: 13, color: "#5c5c5c", margin: "8px 0 0" }}>
          Still need: {[!name.trim() && "a team name", !division && "a division"].filter(Boolean).join(" and ")}.
        </p>
      )}
    </div>
  );
}

// ─── Edit team (name / division, before submit) ─────────────────────────────
export function EditTeamPanel({ team, divisions, onSave, onCancel }) {
  const [name, setName] = useState(team.name);
  const [division, setDivision] = useState(team.division);
  const [err, setErr] = useState("");
  const [working, setWorking] = useState(false);
  const changedDivision = division !== team.division;

  const save = async () => {
    setWorking(true); setErr("");
    try { await onSave({ name: name.trim(), division }); }
    catch (e) { setErr(e.message || "Could not save."); setWorking(false); }
  };

  return (
    <div style={{ borderTop: "1px solid #E8E6DF", marginTop: 12, paddingTop: 4 }}>
      <label style={lbl} htmlFor="grsh-edit-name">Team name</label>
      <input id="grsh-edit-name" style={inp} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      <label style={lbl} htmlFor="grsh-edit-div">Division</label>
      <select id="grsh-edit-div" style={inp} value={division} onChange={(e) => setDivision(e.target.value)}>
        {divisions.map((d) => {
          const full = !!d.spots && d.taken >= d.spots && d.key !== team.division;
          return <option key={d.key} value={d.key} disabled={full}>{d.label}{full ? " (full)" : ""}</option>;
        })}
      </select>
      {changedDivision && (
        <p style={{ fontFamily: BODY, fontSize: 13, color: "#7C3A0A", margin: "8px 0 0" }}>
          Changing divisions re-checks your team's balance. Your players stay on the roster.
        </p>
      )}
      {err && <div style={errBox} role="alert">{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button style={{ ...btnPrimary, opacity: working || !name.trim() ? 0.5 : 1 }} disabled={working || !name.trim()} onClick={save}>
          {working ? "Saving…" : "Save changes"}
        </button>
        <button style={btnSecondary} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Board sent it back ─────────────────────────────────────────────────────
export function SentBackBanner({ review }) {
  if (!review || review.status !== "changes_requested") return null;
  return (
    <div role="status" style={{ background: "#FEE2E2", color: "#991B1B", borderRadius: 8, padding: "10px 14px",
      fontFamily: BODY, fontSize: 14, marginBottom: 14 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>The board sent your roster back for changes.</div>
      {review.board_note && <div style={{ marginBottom: 4 }}>Note from the board: {review.board_note}</div>}
      <div>Make your changes, then submit again.</div>
    </div>
  );
}

// ─── Status tracker (after submit) ──────────────────────────────────────────
const TRACK = [["submitted", "Submitted"], ["under_review", "Under review"], ["approved", "Approved"]];

function reachedStep(review) {
  const idx = TRACK.findIndex(([k]) => k === review.status);
  if (idx >= 0) return idx;
  let reached = 0; // change_pending: work out how far it got from the history
  (review.history || []).forEach((h) => {
    if (h.event === "Roster submitted") reached = 0;
    if (h.event === "Under review") reached = 1;
    if (h.event === "Approved") reached = 2;
  });
  return reached;
}

export function StatusTracker({ team }) {
  const review = team.review || {};
  const idx = reachedStep(review);
  const pending = review.status === "change_pending";
  const paid = !!team.payment?.deposit_paid;
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <strong style={{ fontFamily: BODY, fontSize: 15, color: "#1a1a2e" }}>Where your roster stands</strong>
        {review.submitted_at && (
          <span style={{ fontFamily: BODY, fontSize: 13, color: "#5c5c5c" }}>
            Submitted {new Date(review.submitted_at).toLocaleDateString([], { month: "short", day: "numeric" })}
          </span>
        )}
      </div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", gap: 6 }}>
        {TRACK.map(([k, label], i) => {
          const done = i <= idx;
          return (
            <li key={k} style={{ flex: 1, textAlign: "center", fontFamily: BODY, fontSize: 13 }}>
              <div aria-hidden="true" style={{ height: 6, borderRadius: 99, background: done ? "#1A5C35" : "#ECEAE2", marginBottom: 6 }} />
              <span style={{ fontWeight: i === idx ? 700 : 400, color: done ? "#1A5C35" : "#6b6b6b" }}>
                {done ? "✓ " : ""}{label}
              </span>
            </li>
          );
        })}
      </ol>
      {review.board_note && !pending && (
        <p style={{ fontFamily: BODY, fontSize: 14, color: "#3d3d3d", margin: "10px 0 0" }}>Note from the board: {review.board_note}</p>
      )}
      {pending && (
        <p style={{ fontFamily: BODY, fontSize: 14, color: "#92400E", margin: "10px 0 0" }}>
          Change request sent: "{review.change_request}". The board will follow up.
        </p>
      )}
      {!paid && (
        <p style={{ fontFamily: BODY, fontSize: 13, color: "#5c5c5c", margin: "10px 0 0" }}>
          Next: pay your team deposit (see Team fee below).
        </p>
      )}
    </div>
  );
}

// ─── Request a change (after submit) ────────────────────────────────────────
export function ChangeRequestBox({ team, onSend }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [working, setWorking] = useState(false);
  const pending = team.review?.status === "change_pending";

  const send = async () => {
    setWorking(true); setErr("");
    try { await onSend(text.trim()); setOpen(false); setText(""); }
    catch (e) { setErr(e.message || "Could not send your request."); }
    finally { setWorking(false); }
  };

  if (!open) {
    return (
      <button style={btnSecondary} onClick={() => setOpen(true)}>
        {pending ? "Update your change request" : "Request a change"}
      </button>
    );
  }
  return (
    <div style={{ ...card, marginBottom: 0 }}>
      <label style={{ ...lbl, marginTop: 0 }} htmlFor="grsh-change-text">What do you need changed?</label>
      <textarea id="grsh-change-text" rows={4} value={text} onChange={(e) => setText(e.target.value)}
        style={{ ...inp, resize: "vertical" }}
        placeholder="Example: Swap Bobby Smith for Dan Jones, Dan plays defense." />
      {err && <div style={errBox} role="alert">{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button style={{ ...btnPrimary, opacity: working || text.trim().length < 10 ? 0.5 : 1 }}
          disabled={working || text.trim().length < 10} onClick={send}>
          {working ? "Sending…" : "Send to the board"}
        </button>
        <button style={btnSecondary} onClick={() => { setOpen(false); setErr(""); }}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Team fee / deposit ─────────────────────────────────────────────────────
export function PaymentCard({ team, fees }) {
  const pay = team.payment || {};
  if (!fees || (!fees.deposit && !pay.deposit_paid)) return null;
  const early = fees.early_cutoff && localToday() <= fees.early_cutoff;

  return (
    <div style={card}>
      <strong style={{ fontFamily: BODY, fontSize: 15, color: "#1a1a2e" }}>Team fee</strong>
      {pay.deposit_paid ? (
        <div style={{ fontFamily: BODY, fontSize: 14, color: "#3d3d3d", marginTop: 6, lineHeight: 1.5 }}>
          <div style={{ color: "#14532D", fontWeight: 600 }}>
            ✓ Deposit paid{pay.deposit_paid_at ? ` ${fmtDate(String(pay.deposit_paid_at).slice(0, 10))}` : ""}
          </div>
          {pay.fee_total ? <div>Team fee {money(pay.fee_total)}{pay.fee_tier ? ` (${pay.fee_tier})` : ""}</div> : null}
          {pay.balance_due > 0
            ? <div>Balance {money(pay.balance_due)} due {fmtDate(fees.balance_due_date)}</div>
            : <div style={{ color: "#14532D", fontWeight: 600 }}>✓ Paid in full</div>}
        </div>
      ) : (
        <div style={{ fontFamily: BODY, fontSize: 14, color: "#3d3d3d", marginTop: 6, lineHeight: 1.5 }}>
          <div>A {money(fees.deposit)} deposit holds your spot.</div>
          {fees.early_amount ? (
            <div>
              Your team fee is {money(fees.early_amount)} if you pay the deposit by {fmtDate(fees.early_cutoff)}, and {money(fees.late_amount)} after that.
              {early ? " You are still in the early window." : " The early window has passed."}
            </div>
          ) : null}
          {fees.balance_due_date ? <div>The balance is due {fmtDate(fees.balance_due_date)}.</div> : null}
          {fees.deposit_url
            ? <a href={fees.deposit_url} style={{ ...btnPrimary, display: "inline-block", marginTop: 10, textDecoration: "none", lineHeight: "24px" }}>Pay deposit</a>
            : <div style={{ marginTop: 6, color: "#5c5c5c" }}>Pay the deposit through the team registration form.</div>}
        </div>
      )}
    </div>
  );
}

// ─── Review before submit ───────────────────────────────────────────────────
export function ReviewDialog({ team, busy, error, onConfirm, onClose }) {
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const unsigned = team.waivers_total - team.waivers_signed;
  const pc = team.position_counts || {};
  return (
    <>
      <div onClick={onClose} aria-hidden="true"
        style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(26,26,46,.55)", zIndex: 9997 }} />
      <div role="dialog" aria-modal="true" aria-label="Review your roster before submitting"
        style={{ position: "fixed", zIndex: 9998, left: "50%", top: "50%", transform: "translate(-50%,-50%)",
          width: "min(560px, calc(100vw - 24px))", maxHeight: "90vh", overflowY: "auto", boxSizing: "border-box",
          background: "#fff", borderRadius: 14, padding: 20, boxShadow: "0 12px 40px rgba(0,0,0,.35)" }}>
        <h2 style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: "#1a1a2e", margin: "0 0 4px" }}>
          Review before you submit
        </h2>
        <p style={{ fontFamily: BODY, fontSize: 14, color: "#3d3d3d", margin: "0 0 10px" }}>
          {team.name} · {team.division_label} · {team.player_count} players
        </p>
        <p style={{ fontFamily: BODY, fontSize: 14, color: "#3d3d3d", margin: "0 0 10px" }}>
          {Object.keys(POSITION_SHORT).map((k) => `${POSITION_SHORT[k]} ${pc[k] || 0}`).join("  ·  ")}
        </p>

        <div style={{ border: "1px solid #E8E6DF", borderRadius: 8, maxHeight: 190, overflowY: "auto", marginBottom: 10 }}>
          {team.players.map((p) => (
            <div key={p.roster_id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 10px",
              borderBottom: "1px solid #F1EFE8", fontFamily: BODY, fontSize: 14 }}>
              <span>{p.first_name} {p.last_name} <span style={{ color: "#6b6b6b" }}>({POSITION_SHORT[p.position] || "?"})</span></span>
              <span style={{ color: p.waiver_signed ? "#14532D" : "#92400E" }}>{p.waiver_signed ? "Waiver signed" : "Waiver not signed"}</span>
            </div>
          ))}
        </div>

        {unsigned > 0 && (
          <p style={{ fontFamily: BODY, fontSize: 13, color: "#7C3A0A", background: "#FEF3C7", borderRadius: 8, padding: "8px 10px", margin: "0 0 10px" }}>
            {unsigned} player{unsigned === 1 ? " has" : "s have"} not signed a waiver yet. You can still submit. They must sign before they can play, and we keep reminding them.
          </p>
        )}

        <div style={{ fontFamily: BODY, fontSize: 14, color: "#3d3d3d", margin: "0 0 10px" }}>
          <strong>What happens next</strong>
          <ol style={{ margin: "4px 0 0", paddingLeft: 20, lineHeight: 1.5 }}>
            <li>Your roster locks and goes to the board.</li>
            <li>You get a confirmation email.</li>
            <li>You can follow the status on this page and ask for changes if you need them.</li>
          </ol>
        </div>

        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontFamily: BODY, fontSize: 14, color: "#1a1a2e", margin: "0 0 10px" }}>
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1 }} />
          Names, emails and positions are correct.
        </label>

        {error && <div style={errBox} role="alert">Not ready: {error}</div>}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={{ ...btnPrimary, flex: "1 1 200px", opacity: !ok || busy ? 0.5 : 1 }} disabled={!ok || busy} onClick={onConfirm}>
            {busy ? "Submitting…" : "Submit roster"}
          </button>
          <button style={btnSecondary} onClick={onClose}>Go back</button>
        </div>
      </div>
    </>
  );
}

// ─── Printable roster (opens a print window; "Save as PDF" works from there) ─
export function printRosterSheet(team) {
  const w = window.open("", "_blank");
  if (!w) return false;
  const rows = team.players.map((p) =>
    `<tr><td>${p.jersey_number ?? ""}</td><td>${esc(p.first_name)} ${esc(p.last_name)}${p.is_captain ? " (C)" : ""}</td>`
    + `<td>${esc(POSITION_LABEL[p.position] || "")}</td><td>${esc(p.skill_tier_reported || "")}</td>`
    + `<td>${p.waiver_signed ? "Signed" : "Not signed"}</td><td class="box"></td></tr>`
  ).join("");
  const printed = new Date().toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(team.name)} roster</title>`
    + `<style>body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:28px}h1{margin:0 0 2px;font-size:24px}`
    + `p{margin:2px 0 14px;color:#444}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:7px 8px;font-size:14px;text-align:left}`
    + `th{background:#eee}td.box{width:70px}.foot{margin-top:14px;font-size:12px;color:#555}</style></head><body>`
    + `<h1>${esc(team.name)}</h1><p>${esc(team.division_label)} · Gold Rush Senior Hockey · ${team.player_count} players</p>`
    + `<table><thead><tr><th>#</th><th>Name</th><th>Position</th><th>Level</th><th>Waiver</th><th>Checked in</th></tr></thead><tbody>${rows}</tbody></table>`
    + `<p class="foot">Printed ${esc(printed)}. Waiver status is as of printing.</p></body></html>`
  );
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch (e) { /* user can print from the window */ } }, 300);
  return true;
}
