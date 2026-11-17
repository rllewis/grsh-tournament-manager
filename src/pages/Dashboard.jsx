// Dashboard.jsx — v3
// Every number on this page comes from the server (GET /dashboard and GET /sync/status). There is no mock data:
// if something cannot be measured it shows "—", and if a request fails the card says so and offers a retry.
//
// Includes: do-this-next card · readiness with counts and an explanation · click-through everywhere ·
//           last-sync status · tournament date + milestones · per-division capacity, goalies, stage and links ·
//           real flags, recent registrations and activity · print summary · refreshes when you return to the tab.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { readiness, BAND, bandFor, fmtPct, ago, daysUntil, prettyDate, actionLabel, nextActions, fillState, num } from "../lib/dashboardEngine";

const API   = window.grshConfig?.apiUrl || "/wp-json/grsh/v1";
const NONCE = window.grshConfig?.nonce  || "";

const F_HEAD = "'Fraunces',Georgia,serif";
const F_NUM  = "'DM Mono',monospace";
const F_UI   = "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
const INK = "#1a1a2e", MUTED = "#555566", SOFT = "#6b6b7b", LINE = "#E2E0D8", PAPER = "#F6F5F0", GOLD = "#D4A017", WHITE = "#fff";

const adminUrl = (page, params = "") => `/wp-admin/admin.php?page=${page}${params ? (params[0] === "?" ? "&" + params.slice(1) : params) : ""}`;

async function api(path, opts = {}) {
  try {
    const r = await fetch(`${API}${path}`, { credentials: "same-origin", ...opts, headers: { "Content-Type": "application/json", "X-WP-Nonce": NONCE, ...(opts.headers || {}) } });
    let json = null; try { json = await r.json(); } catch (e) { /* not JSON */ }
    if (!r.ok) return { ok: false, error: (json && (json.error || json.message)) || `The server answered ${r.status}.`, status: r.status };
    return { ok: true, data: json };
  } catch (e) { return { ok: false, error: "Could not reach the server. Check your connection." }; }
}

const card = { background: WHITE, border: `1px solid ${LINE}`, borderRadius: 12 };
const btn = (kind = "ghost", extra = {}) => ({
  fontFamily: F_UI, fontSize: 14, fontWeight: 600, padding: "8px 14px", borderRadius: 8, cursor: "pointer", lineHeight: 1.2, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6,
  border: kind === "primary" ? `1px solid ${INK}` : `1px solid ${LINE}`, background: kind === "primary" ? INK : WHITE, color: kind === "primary" ? WHITE : INK, ...extra,
});
const SEV = { high: { bg: "#FEE2E2", color: "#991B1B", label: "Urgent" }, medium: { bg: "#FEF3C7", color: "#92400E", label: "Soon" }, low: { bg: "#E0F2FE", color: "#075985", label: "When ready" } };
const STAGE = { draft: { label: "Drafting", bg: "#F3F4F6", color: "#4B5563" }, locked: { label: "Locked", bg: "#FEF3C7", color: "#92400E" }, published: { label: "Published", bg: "#DCFCE7", color: "#166534" } };

function Card({ title, right, children, id, error, onRetry, pad = true }) {
  return (
    <section id={id} style={{ ...card, marginBottom: 16, overflow: "hidden" }}>
      {(title || right) && <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "12px 18px", borderBottom: `1px solid ${LINE}` }}>
        <h2 style={{ margin: 0, fontFamily: F_UI, fontSize: 15, fontWeight: 700, color: INK }}>{title}</h2>{right}
      </div>}
      {error ? <div role="alert" style={{ padding: 16, color: "#991B1B", fontSize: 14 }}>{error} {onRetry && <button style={btn("ghost", { marginLeft: 8, padding: "4px 10px" })} onClick={onRetry}>Retry</button>}</div>
        : <div style={pad ? { padding: 18 } : {}}>{children}</div>}
    </section>
  );
}

function Gauge({ score, basis, total }) {
  const band = BAND[bandFor(score)];
  const r = 64, c = 2 * Math.PI * r, arc = c * 0.75, dash = score === null ? 0 : (score / 100) * arc;
  return (
    <div style={{ textAlign: "center", flexShrink: 0, width: 190 }}>
      <svg width="170" height="150" viewBox="0 0 170 150" role="img" aria-label={score === null ? "Readiness not measurable yet" : `Readiness ${score} out of 100, ${band.label}`}>
        <g transform="rotate(135 85 85)">
          <circle cx="85" cy="85" r={r} fill="none" stroke="#EEECE4" strokeWidth="12" strokeDasharray={`${arc} ${c - arc}`} strokeLinecap="round" />
          <circle cx="85" cy="85" r={r} fill="none" stroke={band.ring} strokeWidth="12" strokeDasharray={`${dash} ${c - dash}`} strokeLinecap="round" />
        </g>
        <text x="85" y="88" textAnchor="middle" style={{ fontFamily: F_HEAD, fontSize: 40, fontWeight: 700, fill: band.color }}>{score === null ? "—" : score}</text>
        <text x="85" y="108" textAnchor="middle" style={{ fontFamily: F_NUM, fontSize: 12, fill: SOFT }}>{score === null ? "" : "out of 100"}</text>
      </svg>
      <div style={{ fontFamily: F_UI, fontWeight: 700, fontSize: 14, color: band.color, marginTop: -6 }}>{band.label}</div>
      <div style={{ fontFamily: F_UI, fontSize: 12, color: SOFT, marginTop: 2 }}>{basis === 0 ? "Nothing to measure yet" : `Based on ${basis} of ${total} measures`}</div>
    </div>
  );
}

const ROW_LINK = { registration: "grsh-tm-players", payments: "grsh-tm-players", approvals: "grsh-tm-players", rosters: "grsh-tm-rosters" };
const ROW_NOTE = {
  registration: (r, m) => (m ? `${r.have} registered · minimum needed ${r.of} · room for ${m.room} more` : ""),
  payments: (r) => `${r.have} of ${r.of} paid or waived`,
  approvals: (r) => `${r.have} of ${r.of} approved`,
  rosters: (r) => `${r.have} of ${r.of} teams have enough players and a goalie`,
};
const ROW_NOTE_EMPTY = { registration: "Set teams and roster sizes in Settings to measure this.", payments: "No registered players yet.", approvals: "No registered players yet.", rosters: "No teams created yet." };

export default function Dashboard() {
  const [dash, setDash]       = useState(null);
  const [dashErr, setDashErr] = useState("");
  const [sync, setSync]       = useState(null);     // /sync/status
  const [syncErr, setSyncErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult]   = useState(null);
  const [dateEdit, setDateEdit] = useState(false);
  const [dateVal, setDateVal] = useState("");
  const [dateMsg, setDateMsg] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(0);
  const busy = useRef(false);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([api("/dashboard"), api("/sync/status")]);
    if (a.ok) { setDash(a.data); setDashErr(""); } else setDashErr(a.error);
    if (b.ok) { setSync(b.data); setSyncErr(""); } else setSyncErr(b.error);
    setFetchedAt(Date.now()); setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  // refresh when you come back to the tab, so you never act on a view that is hours old
  useEffect(() => {
    const h = () => { if (document.visibilityState === "visible" && Date.now() - fetchedAt > 60000) load(); };
    document.addEventListener("visibilitychange", h); return () => document.removeEventListener("visibilitychange", h);
  }, [fetchedAt, load]);

  const doSync = async () => {
    if (busy.current) return;                 // a double click must not start a second import
    busy.current = true; setSyncing(true); setResult(null);
    const r = await api("/sync", { method: "POST" });
    setResult(r.ok ? { ok: !(r.data.errors && r.data.errors.length), data: r.data } : { ok: false, error: r.error });
    await load(); setSyncing(false); busy.current = false;
  };

  const saveDate = async (v) => {
    setDateMsg("");
    const r = await api("/dashboard/tournament-date", { method: "POST", body: JSON.stringify({ date: v }) });
    if (r.ok) { setDash(r.data); setDateEdit(false); } else setDateMsg(r.error);
  };

  const ready = useMemo(() => readiness(dash && dash.metrics), [dash]);
  const actions = useMemo(() => nextActions(dash, { unsynced: sync ? sync.unsynced : null }), [dash, sync]);
  const days = dash ? daysUntil(dash.tournament_date) : null;
  const goTo = (page, params) => { window.location.href = adminUrl(page, params); };

  if (loading) return <div style={{ padding: 40, fontFamily: F_UI, color: MUTED }}>Loading the dashboard…</div>;

  const t = dash ? dash.totals : null;
  const stats = [
    { label: "Form entries", value: sync ? sync.total_entries : null, sub: "submitted in WPForms", page: "grsh-tm-players", color: INK, err: syncErr },
    { label: "Waiting to import", value: sync ? sync.unsynced : null, sub: sync && sync.unsynced > 0 ? "press Sync to bring them in" : "everything is imported", color: sync && sync.unsynced > 0 ? "#6B21A8" : "#166534", err: syncErr, onClick: () => document.getElementById("sync-btn") && document.getElementById("sync-btn").focus() },
    { label: "Registered players", value: t ? t.registered : null, sub: "counted toward the tournament", page: "grsh-tm-players", color: INK, err: dashErr },
    { label: "Unpaid", value: t ? t.unpaid : null, sub: t && t.unpaid > 0 ? "payment still pending" : "nobody owes", page: "grsh-tm-players", color: t && t.unpaid > 0 ? "#92400E" : "#166534", err: dashErr },
    { label: "Alternates", value: t ? t.alternates : null, sub: "signed up as subs", page: "grsh-tm-alternates", color: "#1E3A8A", err: dashErr },
    { label: "Sandbagging flags", value: t ? t.sandbagging_flags : null, sub: t && t.sandbagging_flags > 0 ? "need a committee decision" : "none to review", page: "grsh-tm-players", color: t && t.sandbagging_flags > 0 ? "#991B1B" : "#166534", err: dashErr },
  ];

  return (
    <div style={{ fontFamily: F_UI, color: INK, padding: "20px 24px 60px", maxWidth: 1300 }}>
      <style>{`
        .grsh-card-link:hover{background:#FAFAF8!important}
        .grsh-card-link:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid ${GOLD};outline-offset:2px}
        @media(max-width:900px){.grsh-two{grid-template-columns:1fr!important}.grsh-ready{flex-direction:column!important;align-items:stretch!important}}
        @media print{body *{visibility:hidden!important}.grsh-printable,.grsh-printable *{visibility:visible!important}.grsh-printable{position:absolute;left:0;top:0;width:100%}.grsh-noprint{display:none!important}}
      `}</style>

      <div className="grsh-printable">
        {/* header */}
        <header style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <span style={{ background: INK, color: GOLD, fontFamily: F_NUM, fontSize: 12, letterSpacing: ".06em", borderRadius: 99, padding: "4px 12px" }}>
            SEASON {dash ? dash.season.year : "—"}{dash && dash.season.status ? ` · ${dash.season.status.toUpperCase()}` : ""}
          </span>
          <h1 style={{ margin: 0, fontFamily: F_HEAD, fontSize: 28 }}>{dash ? `Season ${dash.season.year} Overview` : "Season Overview"}</h1>
          {days !== null ? (
            <span title={prettyDate(dash.tournament_date)} style={{ background: days <= 30 && days >= 0 ? "#FEF3C7" : PAPER, border: `1px solid ${LINE}`, borderRadius: 99, padding: "4px 12px", fontSize: 13 }}>
              <b style={{ fontFamily: F_HEAD, fontSize: 16 }}>{Math.abs(days)}</b> day{Math.abs(days) === 1 ? "" : "s"} {days >= 0 ? "to" : "since"} the tournament
            </span>
          ) : dash && <a href="#dates" className="grsh-noprint" style={{ fontSize: 13, color: "#92400E" }}>Set the tournament date</a>}
          <span style={{ flex: 1 }} />
          <div className="grsh-noprint" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: dash && dash.sync_failures_7d > 0 ? "#991B1B" : SOFT }} id="sync">
              {dash && dash.last_sync ? `Last import ${dash.last_sync.ok ? "succeeded" : "FAILED"} ${ago(dash.last_sync.at, dash.server_now)}${dash.last_sync.by ? ` (${dash.last_sync.by})` : ""}` : "No import has run yet"}
            </span>
            <button id="sync-btn" style={btn("primary", { opacity: syncing ? 0.7 : 1 })} disabled={syncing} onClick={doSync}>{syncing ? "Importing…" : "Sync from WPForms"}</button>
            <button style={btn()} onClick={() => window.print()}>Print summary</button>
          </div>
        </header>

        <div role="status" aria-live="polite">
          {result && (
            <div style={{ ...card, padding: "10px 16px", marginBottom: 14, borderColor: result.ok ? "#86EFAC" : "#FCA5A5", background: result.ok ? "#F0FDF4" : "#FEF2F2", color: result.ok ? "#166534" : "#991B1B", fontSize: 14 }}>
              {result.error ? `Import did not run: ${result.error}`
                : result.ok ? (result.data.message && !result.data.imported ? result.data.message : `Import complete — ${num(result.data.imported) ?? 0} new registration${result.data.imported === 1 ? "" : "s"} added.`)
                : `Import finished with problems — ${num(result.data.imported) ?? 0} added, ${num(result.data.skipped) ?? 0} skipped. See Recent activity for the reasons.`}
            </div>
          )}
        </div>

        {dashErr && !dash && <Card title="Dashboard data" error={`The dashboard could not load: ${dashErr}`} onRetry={load} />}

        {/* do this next */}
        {dash && (
          <section style={{ ...card, marginBottom: 16, padding: "14px 18px", borderLeft: `5px solid ${actions.length ? (actions[0].severity === "high" ? "#DC2626" : GOLD) : "#22c55e"}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: SOFT, letterSpacing: ".06em", marginBottom: 6 }}>DO THIS NEXT</div>
            {actions.length === 0 ? <div style={{ fontSize: 16, color: "#166534", fontWeight: 600 }}>Nothing needs your attention right now.</div> : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 17, fontWeight: 700, flex: 1, minWidth: 240 }}>{actions[0].text}</span>
                  <a className="grsh-noprint" style={btn("primary")} href={adminUrl(actions[0].page, actions[0].params.startsWith("#") ? "" : actions[0].params) + (actions[0].params.startsWith("#") ? actions[0].params : "")}>Go there →</a>
                </div>
                {actions.length > 1 && (
                  <div style={{ marginTop: 10 }}>
                    {(showAll ? actions.slice(1) : actions.slice(1, 4)).map((a) => (
                      <a key={a.key} href={adminUrl(a.page, a.params.startsWith("#") ? "" : a.params) + (a.params.startsWith("#") ? a.params : "")} style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 0", color: INK, textDecoration: "none", fontSize: 14 }}>
                        <span style={{ background: SEV[a.severity].bg, color: SEV[a.severity].color, borderRadius: 99, padding: "1px 8px", fontSize: 11, fontWeight: 700, minWidth: 64, textAlign: "center" }}>{SEV[a.severity].label}</span>{a.text}
                      </a>
                    ))}
                    {actions.length > 4 && <button className="grsh-noprint" style={{ ...btn("ghost"), padding: "3px 10px", fontSize: 13, marginTop: 6 }} onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : `Show all ${actions.length}`}</button>}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* readiness */}
        {dash && (
          <Card title="Tournament readiness" pad>
            <div className="grsh-ready" style={{ display: "flex", gap: 28, alignItems: "center" }}>
              <Gauge score={ready.score} basis={ready.basis} total={ready.total} />
              <div style={{ flex: 1, display: "grid", gap: 14 }}>
                {ready.rows.map((row) => {
                  const m = dash.metrics[row.key];
                  const col = row.pct === null ? SOFT : row.pct >= 90 ? "#166534" : row.pct >= 70 ? INK : row.pct >= 50 ? "#92400E" : "#991B1B";
                  return (
                    <a key={row.key} href={adminUrl(ROW_LINK[row.key])} className="grsh-card-link" style={{ textDecoration: "none", color: INK, display: "block", padding: "2px 4px", borderRadius: 6 }} title={`${row.label} — counts ${row.weight}% of the readiness score. Click to open.`}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600 }}>
                        <span>{row.label}</span><span style={{ fontFamily: F_NUM, color: col }}>{fmtPct(row.pct)} <span style={{ color: SOFT, fontWeight: 400, fontSize: 12 }}>({row.weight}%)</span></span>
                      </div>
                      <div style={{ height: 8, background: "#EEECE4", borderRadius: 99, margin: "5px 0", overflow: "hidden" }}><div style={{ width: `${row.pct === null ? 0 : row.pct}%`, height: "100%", background: col }} /></div>
                      <div style={{ fontSize: 13, color: SOFT }}>{m ? ROW_NOTE[row.key](m, row.key === "registration" ? m : null) : ROW_NOTE_EMPTY[row.key]}</div>
                    </a>
                  );
                })}
              </div>
            </div>
            <details style={{ marginTop: 14, fontSize: 13, color: MUTED }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>How is this calculated?</summary>
              <p style={{ margin: "8px 0 0" }}>Each measure is a simple count: for example “7 of 7 paid”. The score is the weighted average of the measures that can be measured (registration 30%, payments 25%, approvals 25%, rosters 20%). A measure with nothing to count yet — like rosters before any team exists — is left out instead of counted as zero, and the score says how many measures it used. “Minimum needed” is the number of teams times the minimum roster size for each division, from Settings.</p>
            </details>
          </Card>
        )}

        {/* stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 10, marginBottom: 16 }}>
          {stats.map((s) => {
            const body = (
              <>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: s.color }} />
                <div style={{ fontSize: 13, color: SOFT, fontWeight: 600, marginTop: 6 }}>{s.label}</div>
                <div style={{ fontFamily: F_HEAD, fontSize: 32, fontWeight: 700, color: s.err ? SOFT : s.color, lineHeight: 1.15 }}>{s.err ? "—" : num(s.value) === null ? "—" : s.value}</div>
                <div style={{ fontSize: 12, color: s.err ? "#991B1B" : SOFT }}>{s.err ? "could not load" : s.sub}</div>
              </>
            );
            const st = { ...card, position: "relative", padding: "12px 14px", textDecoration: "none", color: INK, display: "block", textAlign: "left", cursor: "pointer", font: "inherit" };
            return s.onClick
              ? <button key={s.label} className="grsh-card-link" onClick={s.onClick} style={st}>{body}</button>
              : <a key={s.label} className="grsh-card-link" href={adminUrl(s.page)} style={st}>{body}</a>;
          })}
        </div>

        {/* dates */}
        {dash && (
          <Card id="dates" title="Key dates" right={!dateEdit && <button className="grsh-noprint" style={btn("ghost", { padding: "4px 10px", fontSize: 13 })} onClick={() => { setDateVal(dash.tournament_date); setDateEdit(true); }}>{dash.tournament_date ? "Change tournament date" : "Set tournament date"}</button>}>
            {dateEdit && (
              <div className="grsh-noprint" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
                <label style={{ fontSize: 14 }}>Tournament date <input type="date" value={dateVal} onChange={(e) => setDateVal(e.target.value)} style={{ marginLeft: 6, padding: 6, border: `1px solid ${LINE}`, borderRadius: 8 }} /></label>
                <button style={btn("primary")} onClick={() => saveDate(dateVal)}>Save</button>
                <button style={btn()} onClick={() => setDateEdit(false)}>Cancel</button>
                {dash.tournament_date && <button style={btn()} onClick={() => saveDate("")}>Clear date</button>}
                {dateMsg && <span role="alert" style={{ color: "#991B1B", fontSize: 13 }}>{dateMsg}</span>}
              </div>
            )}
            {dash.milestones.length === 0 ? <div style={{ color: SOFT, fontSize: 14 }}>No dates set yet. Registration and draft dates come from Settings; the tournament date is set here.</div> : (
              <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
                {dash.milestones.map((m) => {
                  const d = daysUntil(m.date), past = d !== null && d < 0;
                  return (
                    <li key={m.key} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, opacity: past ? 0.6 : 1 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 5, background: past ? "#22c55e" : d === 0 ? "#DC2626" : GOLD }} aria-hidden="true" />
                      <b style={{ minWidth: 150 }}>{m.label}</b><span>{prettyDate(m.date)}</span>
                      <span style={{ color: SOFT }}>{d === null ? "" : d === 0 ? "today" : past ? `${-d} day${d === -1 ? "" : "s"} ago` : `in ${d} day${d === 1 ? "" : "s"}`}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        )}

        {/* divisions */}
        {dash && (
          <Card title="Divisions" pad={false} right={<span style={{ fontSize: 13, color: SOFT }}>Bar = registered. Marker = minimum needed.</span>}>
            {dash.divisions.length === 0 ? <div style={{ padding: 18, color: SOFT }}>No divisions are switched on in Settings.</div> : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))" }}>
                {dash.divisions.map((v) => {
                  const f = fillState(v), tot = Object.values(v.tiers).reduce((a, b) => a + b, 0);
                  const st = STAGE[v.stage] || STAGE.draft;
                  const pctBar = f.cap ? Math.min(100, (f.have / f.cap) * 100) : 0, mark = f.cap ? (f.need / f.cap) * 100 : null;
                  const goalieNeed = v.planned_teams;
                  return (
                    <div key={v.key} style={{ padding: "16px 18px", borderRight: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`, borderTop: `4px solid ${v.color}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <h3 style={{ margin: 0, fontFamily: F_HEAD, fontSize: 18, color: v.color, flex: 1 }}>{v.label}</h3>
                        <span style={{ background: st.bg, color: st.color, borderRadius: 99, padding: "2px 9px", fontSize: 12, fontWeight: 700 }}>{v.draft_status === "active" || v.draft_status === "paused" ? `Draft ${v.draft_status}` : st.label}</span>
                      </div>
                      <div style={{ fontSize: 14, margin: "8px 0 4px" }}><b style={{ fontFamily: F_HEAD, fontSize: 24 }}>{v.registered}</b> registered{f.need ? <span style={{ color: SOFT }}> · need {f.need}, room for {f.room} more</span> : <span style={{ color: SOFT }}> · set teams in Settings</span>}</div>
                      {f.cap ? (
                        <div style={{ position: "relative", height: 8, background: "#EEECE4", borderRadius: 99, margin: "6px 0 10px" }} title={`${f.have} registered; minimum ${f.need}; capacity ${f.cap}`}>
                          <div style={{ width: `${pctBar}%`, height: "100%", borderRadius: 99, background: f.state === "short" ? "#f59e0b" : v.color }} />
                          <div style={{ position: "absolute", top: -3, left: `${mark}%`, height: 14, width: 2, background: INK }} />
                        </div>
                      ) : null}
                      {f.state === "short" && <div style={{ fontSize: 13, color: "#92400E" }}>{f.short} short of the minimum</div>}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", fontSize: 13, margin: "10px 0" }}>
                        <span><b>{v.paid}</b> of {v.registered} paid{v.unpaid > 0 ? <span style={{ color: "#92400E" }}> ({v.unpaid} owe)</span> : ""}</span>
                        <span><b>{v.goalies}</b> goalie{v.goalies === 1 ? "" : "s"}{goalieNeed ? <span style={{ color: v.goalies < goalieNeed ? "#991B1B" : SOFT }}> (need {goalieNeed})</span> : ""}</span>
                        <span><b>{v.subs}</b> alternate{v.subs === 1 ? "" : "s"}</span>
                        <span><b>{v.teams}</b> of {v.planned_teams} team{v.planned_teams === 1 ? "" : "s"} · {v.rostered} rostered</span>
                      </div>
                      {tot > 0 && (
                        <div aria-label="Skill tier mix" style={{ marginBottom: 10 }}>
                          <div style={{ display: "flex", height: 8, borderRadius: 99, overflow: "hidden", gap: 1 }}>
                            {[["A", "#E8A0A0"], ["B", "#EDBA94"], ["C", "#EAD08A"], ["R", "#9CB8EC"]].filter(([k]) => v.tiers[k] > 0).map(([k, c]) => <div key={k} title={`Tier ${k}: ${v.tiers[k]}`} style={{ flex: v.tiers[k], background: c, minWidth: 4 }} />)}
                          </div>
                          <div style={{ fontSize: 12, color: SOFT, marginTop: 3 }}>Tiers: {["A", "B", "C", "R"].filter((k) => v.tiers[k] > 0).map((k) => `${k} ${v.tiers[k]}`).join(" · ")}{v.tiers["?"] > 0 ? ` · unrated ${v.tiers["?"]}` : ""}</div>
                        </div>
                      )}
                      <div className="grsh-noprint" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <a style={btn("ghost", { padding: "5px 10px", fontSize: 13 })} href={adminUrl("grsh-tm-rosters", `?division=${encodeURIComponent(v.key)}`)}>Rosters</a>
                        <a style={btn("ghost", { padding: "5px 10px", fontSize: 13 })} href={adminUrl("grsh-tm-draft")}>Draft</a>
                        <a style={btn("ghost", { padding: "5px 10px", fontSize: 13 })} href={adminUrl("grsh-tm-players")}>Players</a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        <div className="grsh-two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* flags */}
          <Card title={dash && dash.flags.length ? `Sandbagging flags (${dash.totals.sandbagging_flags})` : "Sandbagging flags"} error={dashErr && !dash ? dashErr : ""} onRetry={load} pad={false}>
            {dash && (dash.flags.length === 0 ? <div style={{ padding: 18, color: "#166534", fontSize: 14 }}>No flagged players.</div> : dash.flags.map((f) => (
              <a key={f.id} href={adminUrl("grsh-tm-players")} className="grsh-card-link" style={{ display: "block", padding: "10px 18px", borderBottom: `1px solid ${LINE}`, textDecoration: "none", color: INK }}>
                <b>{f.player}</b><div style={{ fontSize: 13, color: SOFT }}>Rated {f.tier || "?"}, asked for {String(f.division).replace(/_/g, " ")}</div>
              </a>
            )))}
          </Card>
          {/* recent registrations */}
          <Card title="Recent registrations" error={syncErr && !sync ? syncErr : ""} onRetry={load} pad={false} right={<a href={adminUrl("grsh-tm-players")} style={{ fontSize: 13 }}>View all →</a>}>
            {sync && ((sync.recent_imports || []).length === 0 ? <div style={{ padding: 18, color: SOFT, fontSize: 14 }}>No registrations yet.</div> : sync.recent_imports.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 18px", borderBottom: `1px solid ${LINE}`, fontSize: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}><b>{r.name}</b>{r.type === "sub" && <span style={{ marginLeft: 6, fontSize: 11, background: "#EDE9FE", color: "#4C1D95", padding: "1px 6px", borderRadius: 4 }}>ALT</span>}<div style={{ fontSize: 12, color: SOFT }}>{String(r.division || "").replace(/_/g, " ")}{r.position && r.position !== "—" ? ` · ${r.position}` : ""}{r.time ? ` · ${r.time}` : ""}</div></div>
                <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: r.status === "paid" ? "#DCFCE7" : r.status === "pending" ? "#FEF3C7" : "#EDE9FE", color: r.status === "paid" ? "#166534" : r.status === "pending" ? "#92400E" : "#4C1D95" }}>{r.status}</span>
              </div>
            )))}
          </Card>
        </div>

        {/* activity */}
        {dash && (
          <Card id="activity" title="Recent activity" right={<span style={{ fontSize: 13, color: SOFT }}>From the audit log</span>} pad={false}>
            {dash.activity.length === 0 ? <div style={{ padding: 18, color: SOFT, fontSize: 14 }}>Nothing logged yet.</div> : dash.activity.map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 18px", borderBottom: `1px solid ${LINE}`, fontSize: 14 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: a.action === "sync_failed" ? "#DC2626" : "#D0CEC6" }} aria-hidden="true" />
                <div style={{ flex: 1 }}><b>{actionLabel(a.action)}</b>{a.notes ? <span style={{ color: MUTED }}> — {a.notes}</span> : null}</div>
                <span style={{ fontSize: 12, color: SOFT }}>{a.by ? `${a.by} · ` : ""}{ago(a.at, dash.server_now)}</span>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
