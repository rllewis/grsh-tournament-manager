// Reports.jsx — v3
// Every number on this page comes from the server (GET /reports/overview). There is no mock data:
// if something cannot be measured it shows "—", and if a request fails the page says so and offers a retry.
//
// Includes: readiness verdict + worklist with fix links · reconciled KPIs (paid + waived + unpaid always add up to registered) ·
//           real money (collected, owed from the player fee) · reminders with preview, cooldown and confirm · parity with the
//           real thresholds · goalie coverage and unplaced goalies · registration pace forecast (or an honest "not enough data") ·
//           change since last visit and history · real CSV exports and board pack · read-only expiring share links · print.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { num, money, pctText, delta, ago, ageMinutes, parityBand, sortTeams, fillState, dayBars, VERDICT, SEVERITY, matchName, safeFilename } from "../lib/reportsEngine";

const API   = window.grshConfig?.apiUrl || "/wp-json/grsh/v1";
const NONCE = window.grshConfig?.nonce  || "";

const F_HEAD = "'Fraunces',Georgia,serif";
const F_NUM  = "'DM Mono',monospace";
const F_UI   = "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
const INK = "#1a1a2e", MUTED = "#555566", SOFT = "#6b6b7b", LINE = "#E2E0D8", PAPER = "#F6F5F0", GOLD = "#D4A017", WHITE = "#fff";
const adminUrl = (page) => `/wp-admin/admin.php?page=${page}`;

async function api(path, opts = {}) {
  try {
    const r = await fetch(`${API}${path}`, { credentials: "same-origin", ...opts, headers: { "Content-Type": "application/json", "X-WP-Nonce": NONCE, ...(opts.headers || {}) } });
    let json = null; try { json = await r.json(); } catch (e) { /* not JSON */ }
    if (!r.ok) return { ok: false, error: (json && (json.error || json.message)) || `The server answered ${r.status}.`, status: r.status, data: json };
    return { ok: true, data: json };
  } catch (e) { return { ok: false, error: "Could not reach the server. Check your connection." }; }
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = safeFilename(name); document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const card = { background: WHITE, border: `1px solid ${LINE}`, borderRadius: 12 };
const btn = (kind = "ghost", extra = {}) => ({
  fontFamily: F_UI, fontSize: 14, fontWeight: 600, padding: "8px 14px", borderRadius: 8, cursor: "pointer", lineHeight: 1.2, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6,
  border: kind === "primary" ? `1px solid ${INK}` : `1px solid ${LINE}`, background: kind === "primary" ? INK : WHITE, color: kind === "primary" ? WHITE : INK, ...extra,
});
const TH = { textAlign: "left", fontFamily: F_NUM, fontSize: 11, fontWeight: 500, color: MUTED, letterSpacing: ".04em", textTransform: "uppercase", padding: "8px 10px", borderBottom: `1px solid ${LINE}`, whiteSpace: "nowrap" };
const TD = { padding: "9px 10px", borderBottom: `1px solid ${LINE}`, fontSize: 14, color: INK, verticalAlign: "middle" };

function Pill({ bg, color, children, title }) {
  return <span title={title} style={{ display: "inline-block", background: bg, color, fontFamily: F_NUM, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99, whiteSpace: "nowrap" }}>{children}</span>;
}

function Card({ title, right, children, pad = true, id }) {
  return (
    <section id={id} style={{ ...card, marginBottom: 16 }}>
      {(title || right) && (
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 18px", borderBottom: `1px solid ${LINE}`, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontFamily: F_NUM, fontSize: 12, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: MUTED }}>{title}</h2>
          {right}
        </header>
      )}
      <div style={{ padding: pad ? 18 : 0 }}>{children}</div>
    </section>
  );
}

function Kpi({ label, value, sub, tone, onClick, change, hint }) {
  const color = tone === "bad" ? "#991B1B" : tone === "warn" ? "#92400E" : tone === "good" ? "#166534" : INK;
  return (
    <button type="button" onClick={onClick} title={hint} style={{ ...card, textAlign: "left", padding: "16px 18px", cursor: onClick ? "pointer" : "default", font: "inherit", width: "100%" }}>
      <div style={{ fontFamily: F_NUM, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: MUTED }}>{label}</div>
      <div style={{ fontFamily: F_HEAD, fontSize: 38, fontWeight: 700, color, lineHeight: 1.1, margin: "4px 0" }}>{value}</div>
      <div style={{ fontSize: 13, color: MUTED }}>{sub}</div>
      {change ? <div style={{ fontFamily: F_NUM, fontSize: 11, color: SOFT, marginTop: 4 }}>{change}</div> : null}
    </button>
  );
}

function Skeleton() {
  const b = (h, w = "100%") => <div style={{ height: h, width: w, background: "#ECEAE2", borderRadius: 8, marginBottom: 12 }} />;
  return <div aria-busy="true" aria-label="Loading reports" style={{ padding: 4 }}>{b(28, "40%")}{b(70)}<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>{[0, 1, 2, 3].map((i) => <div key={i}>{b(110)}</div>)}</div>{b(260)}</div>;
}

function Bar({ pct, color = INK, h = 8, bg = "#ECEAE2", label }) {
  const p = num(pct) === null ? 0 : Math.max(0, Math.min(100, pct));
  return <div role="img" aria-label={label} style={{ background: bg, borderRadius: 99, height: h, overflow: "hidden", width: "100%" }}><div style={{ width: `${p}%`, height: "100%", background: color }} /></div>;
}

const TABS = [
  ["overview", "Overview"], ["worklist", "To fix"], ["parity", "Parity"], ["payments", "Payments"], ["goalies", "Goalies"], ["review", "Review"], ["exports", "Export"], ["history", "History & sharing"], ["help", "Help"],
];

// ─────────────────────────────────────────────────────────────────────────────
export default function Reports() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(() => { const h = (window.location.hash || "").replace("#", ""); return TABS.some((t) => t[0] === h) ? h : "overview"; });
  const [div, setDiv] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState("");
  const [q, setQ] = useState("");
  const [rem, setRem] = useState(null);      // reminder dialog state
  const [feeText, setFeeText] = useState("");
  const [shares, setShares] = useState([]);
  const [newLink, setNewLink] = useState(null);
  const [days, setDays] = useState(7);
  const loadedAt = useRef(0);
  const locks = useRef({});   // blocks a second click from starting the same action twice
  const once = async (key, fn) => { if (locks.current[key]) return; locks.current[key] = true; try { await fn(); } finally { locks.current[key] = false; } };
  const toastTimer = useRef(0);

  const say = useCallback((m) => { setToast(m); window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(""), 6000); }, []);

  const load = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    const r = await api("/reports/overview");
    if (r.ok) { setData(r.data); setErr(""); loadedAt.current = Date.now(); } else if (!silent || !data) { setErr(r.error); }
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadShares = useCallback(async () => { const r = await api("/reports/shares"); if (r.ok) setShares(r.data || []); }, []);

  useEffect(() => { load(false); loadShares(); }, [load, loadShares]);
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible" && Date.now() - loadedAt.current > 120000) load(true); };
    document.addEventListener("visibilitychange", onVis); return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);
  useEffect(() => { try { window.history.replaceState(null, "", `#${tab}`); } catch (e) { /* ignore */ } }, [tab]);
  useEffect(() => {
    const st = document.createElement("style"); st.id = "grsh-reports-print";
    st.textContent = "@media print{#adminmenumain,#wpadminbar,#wpfooter,.grsh-noprint{display:none!important}#wpcontent,#wpfooter{margin-left:0!important}body{background:#fff!important}.grsh-print-title{display:block!important}}.grsh-print-title{display:none}";
    document.head.appendChild(st); return () => st.remove();
  }, []);
  useEffect(() => { if (data && data.payments) setFeeText(data.payments.fee_source === "set" ? String(data.payments.fee) : ""); }, [data && data.payments && data.payments.fee, data && data.payments && data.payments.fee_source]); // eslint-disable-line react-hooks/exhaustive-deps

  const divs = data ? data.divisions : [];
  const shown = useMemo(() => (div ? divs.filter((d) => d.key === div) : divs), [divs, div]);

  // ── actions ──
  const downloadExport = (id) => once("exp-" + id, async () => {
    setBusy("exp-" + id);
    const r = await api(`/reports/export?id=${encodeURIComponent(id)}`);
    setBusy("");
    if (!r.ok) { say(`Could not build that export. ${r.error}`); return; }
    saveBlob(new Blob([r.data.csv], { type: "text/csv;charset=utf-8" }), r.data.filename);
    say(`Downloaded ${r.data.filename} (${r.data.rows} row${r.data.rows === 1 ? "" : "s"}).`);
  });

  const boardPack = () => once("pack", async () => {
    setBusy("pack");
    try {
      const r = await fetch(`${API}/reports/board-meeting-pack`, { method: "POST", credentials: "same-origin", headers: { "X-WP-Nonce": NONCE } });
      if (!r.ok) { say(`The board pack could not be built (the server answered ${r.status}).`); setBusy(""); return; }
      const blob = await r.blob();
      const cd = r.headers.get("Content-Disposition") || ""; const m = /filename="?([^";]+)/.exec(cd);
      const name = m ? m[1] : "GRSH-Board-Pack.html";
      saveBlob(blob, name);
      say(/\.html$/i.test(name) ? "Saved as a web page because no PDF library is installed. Open it and use Print → Save as PDF." : "Board pack downloaded.");
    } catch (e) { say("Could not reach the server to build the board pack."); }
    setBusy("");
  });

  const saveFee = () => once("fee", async () => {
    setBusy("fee");
    const r = await api("/reports/fee", { method: "POST", body: JSON.stringify({ fee: feeText.trim() }) });
    setBusy("");
    if (r.ok) { setData(r.data); say(feeText.trim() ? "Player fee saved." : "Player fee cleared. Amounts owed fall back to what players paid."); } else { say(r.error); }
  });

  const openReminders = async (ids) => {
    setRem({ loading: true, ids: ids || null, note: "" });
    const r = await api("/reports/reminders", { method: "POST", body: JSON.stringify({ send: false, ids: ids || undefined }) });
    setRem(r.ok ? { ...r.data, ids: ids || null, note: "" } : { error: r.error });
  };
  const sendReminders = () => once("send", async () => {
    setRem((s) => ({ ...s, sending: true }));
    const r = await api("/reports/reminders", { method: "POST", body: JSON.stringify({ send: true, ids: rem.ids || undefined, note: rem.note }) });
    if (r.ok) { setRem((s) => ({ ...s, sending: false, done: r.data })); load(true); } else { setRem((s) => ({ ...s, sending: false, error: r.error })); }
  });

  const createLink = () => once("share", async () => {
    setBusy("share");
    const r = await api("/reports/share", { method: "POST", body: JSON.stringify({ days }) });
    setBusy("");
    if (r.ok) { setNewLink(r.data); loadShares(); } else { say(r.error); }
  });
  const revoke = async (id) => {
    const r = await api(`/reports/share/${id}`, { method: "DELETE" });
    if (r.ok) { say("Link revoked. It no longer works."); setNewLink(null); loadShares(); } else { say(r.error); }
  };
  const copy = async (text, what) => {
    try { await navigator.clipboard.writeText(text); say(`${what} copied.`); } catch (e) { say("Could not copy automatically. Select the text and copy it."); }
  };

  const goTab = (t) => { setTab(t); window.scrollTo && window.scrollTo({ top: 0, behavior: "smooth" }); };
  const onTabKey = (e) => {
    const i = TABS.findIndex((t) => t[0] === tab);
    if (e.key === "ArrowRight") { setTab(TABS[(i + 1) % TABS.length][0]); e.preventDefault(); }
    if (e.key === "ArrowLeft") { setTab(TABS[(i + TABS.length - 1) % TABS.length][0]); e.preventDefault(); }
  };

  // ── states ──
  if (loading && !data) return <div style={{ padding: "20px 24px", fontFamily: F_UI }}><Skeleton /></div>;
  if (err && !data) {
    return (
      <div style={{ padding: "40px 24px", fontFamily: F_UI, maxWidth: 560 }}>
        <h1 style={{ fontFamily: F_HEAD, fontSize: 28, margin: "0 0 8px" }}>Reports could not load</h1>
        <p style={{ color: MUTED, fontSize: 15 }}>{err}</p>
        <button style={btn("primary")} onClick={() => load(false)}>Try again</button>
      </div>
    );
  }

  const d = data, p = d.payments, t = d.totals, v = d.verdict, vs = VERDICT[v.level] || VERDICT.empty, since = d.since;
  const stale = ageMinutes(d.generated_at) > 30;
  const bd = p.breakdown;
  const sinceTxt = (n) => (since ? delta(n) && `${delta(n)} since ${since.days} day${since.days === 1 ? "" : "s"} ago` : null);
  const divLabel = (k) => (divs.find((x) => x.key === k) || {}).label || k;
  const unpaidShown = d.unpaid.filter((u) => (!div || u.division === div) && matchName(u.name, q));
  const goalieNoDiv = d.teams_no_goalie.filter((x) => !div || x.division === div);
  const unplaced = d.goalies_unplaced.filter((x) => !div || x.division === div);

  return (
    <div style={{ padding: "16px 24px 48px", fontFamily: F_UI, color: INK, maxWidth: 1180 }}>
      <h1 className="grsh-print-title" style={{ fontFamily: F_HEAD }}>{d.season.label} — Reports ({new Date(d.generated_at).toLocaleString()})</h1>

      {/* header */}
      <div className="grsh-noprint" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: F_NUM, fontSize: 12, letterSpacing: ".1em", color: GOLD, fontWeight: 600 }}>SEASON {d.season.year}</div>
          <h1 style={{ fontFamily: F_HEAD, fontSize: 36, margin: "2px 0 4px", lineHeight: 1.1 }}>Reports</h1>
          <div style={{ fontSize: 14, color: MUTED }}>
            Data as of {new Date(d.generated_at).toLocaleString()} ({ago(d.generated_at)}){stale ? <strong style={{ color: "#92400E" }}> · may be stale</strong> : null} ·{" "}
            <button type="button" onClick={() => load(true)} style={{ background: "none", border: "none", padding: 0, color: INK, textDecoration: "underline", cursor: "pointer", fontSize: 14 }}>{loading ? "Refreshing…" : "Refresh"}</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btn()} onClick={() => goTab("history")}>Share link</button>
          <button style={btn()} onClick={() => window.print()}>Print this page</button>
          <button style={btn("primary")} onClick={boardPack} disabled={busy === "pack"}>{busy === "pack" ? "Building…" : "Board pack"}</button>
        </div>
      </div>

      {err ? <div role="alert" style={{ ...card, background: "#FEF3C7", borderColor: "#FCD34D", padding: "10px 14px", marginBottom: 12, fontSize: 14 }}>The last refresh failed ({err}). You are looking at older data. <button style={{ ...btn(), padding: "4px 10px", marginLeft: 8 }} onClick={() => load(true)}>Retry</button></div> : null}

      {/* verdict */}
      <div role="status" style={{ background: vs.bg, border: `1px solid ${vs.border}`, color: vs.color, borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: 99, background: vs.color, color: vs.bg, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{vs.icon}</span>
          <strong style={{ fontSize: 17 }}>{v.headline}</strong>
          {d.issues.length > 0 ? <button className="grsh-noprint" style={{ ...btn(), marginLeft: "auto", padding: "5px 12px", fontSize: 13 }} onClick={() => goTab("worklist")}>See all {d.issues.length}</button> : null}
        </div>
        {d.issues.slice(0, 3).map((i) => (
          <div key={i.id} style={{ fontSize: 14, marginTop: 6, paddingLeft: 36 }}>• {i.title}{i.detail ? <span style={{ opacity: 0.85 }}> — {i.detail}</span> : null}</div>
        ))}
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginBottom: 16 }}>
        <Kpi label="Registered" value={t.registered} sub={t.min_needed ? `of ${t.min_needed} minimum · ${t.capacity} spots` : "players, subs not counted"} change={sinceTxt(since && since.registered)} onClick={() => goTab("overview")} />
        <Kpi label="Paid" value={pctText(p.pct_paid)} tone={p.pct_paid === null ? undefined : p.pct_paid >= 95 ? "good" : "warn"} sub={`${bd.paid} paid${bd.waived ? ` · ${bd.waived} waived` : ""}`} hint={`${bd.paid} paid + ${bd.waived} waived + ${bd.pending} pending + ${bd.failed} failed + ${bd.refunded} refunded = ${p.registered}`} change={sinceTxt(since && since.paid)} onClick={() => goTab("payments")} />
        <Kpi label="Outstanding" value={p.unpaid} tone={p.unpaid > 0 ? "warn" : "good"} sub={p.unpaid === 0 ? "nobody owes anything" : p.owed === null ? "set the player fee to see $ owed" : `${money(p.owed)} owed`} change={sinceTxt(since && since.unpaid)} onClick={() => goTab("payments")} />
        <Kpi label="Goalies" value={t.goalies} tone={t.teams_no_goalie > 0 ? "bad" : t.teams > 0 ? "good" : undefined} sub={t.teams === 0 ? "no teams created yet" : t.teams_no_goalie > 0 ? `${t.teams_no_goalie} team${t.teams_no_goalie === 1 ? "" : "s"} with no goalie` : "every team covered"} change={t.goalies_unplaced ? `${t.goalies_unplaced} not on a roster yet` : null} onClick={() => goTab("goalies")} />
      </div>

      {/* division filter */}
      <div className="grsh-noprint" role="group" aria-label="Filter by division" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ fontFamily: F_NUM, fontSize: 12, color: MUTED }}>DIVISION</span>
        {[{ key: "", label: "All divisions" }, ...divs.filter((x) => x.registered > 0 || x.configured).map((x) => ({ key: x.key, label: x.label }))].map((o) => (
          <button key={o.key || "all"} type="button" aria-pressed={div === o.key} onClick={() => setDiv(o.key)} style={{ ...btn(div === o.key ? "primary" : "ghost"), padding: "6px 14px", fontSize: 13, borderRadius: 99 }}>{o.label}</button>
        ))}
      </div>

      {/* tabs */}
      <div className="grsh-noprint" role="tablist" aria-label="Report sections" onKeyDown={onTabKey} style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16, borderBottom: `1px solid ${LINE}`, paddingBottom: 10 }}>
        {TABS.map(([k, label]) => {
          const n = k === "worklist" ? d.issues.length : k === "payments" ? p.unpaid : k === "goalies" ? t.teams_no_goalie : k === "review" ? t.sandbagging : 0;
          const on = tab === k;
          return (
            <button key={k} role="tab" id={`tab-${k}`} aria-selected={on} aria-controls={`panel-${k}`} tabIndex={on ? 0 : -1} onClick={() => setTab(k)}
              style={{ ...btn(on ? "primary" : "ghost"), padding: "7px 13px", fontSize: 13 }}>
              {label}{n > 0 ? <span style={{ fontFamily: F_NUM, fontSize: 11, background: on ? "rgba(255,255,255,.22)" : "#FEF3C7", color: on ? WHITE : "#92400E", borderRadius: 99, padding: "0 7px" }}>{n}</span> : null}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>

        {/* ───────────────────────── OVERVIEW ───────────────────────── */}
        {tab === "overview" && (
          <>
            <Card title="Plain-English summary" right={<button className="grsh-noprint" style={{ ...btn(), padding: "5px 12px", fontSize: 13 }} onClick={() => copy(d.summary_text, "Summary")}>Copy</button>}>
              <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6 }}>{d.summary_text}</p>
              <p style={{ margin: "8px 0 0", fontSize: 12, color: SOFT }}>Written from the numbers on this page, so it always matches them. Nothing is sent to an outside service.</p>
            </Card>

            <Card title="Divisions" pad={false}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                  <thead><tr><th style={TH}>Division</th><th style={TH}>Registered</th><th style={TH}>Paid</th><th style={TH}>Unpaid</th><th style={TH}>Goalies</th><th style={TH}>Avg parity</th><th style={TH}>Tiers A / B / C / R / ?</th></tr></thead>
                  <tbody>
                    {shown.map((x) => {
                      const f = fillState(x.registered, x.min_needed, x.capacity);
                      const col = f.state === "short" ? "#B45309" : f.state === "over" ? "#991B1B" : "#166534";
                      const b = parityBand(x.avg_parity, d.parity_bands);
                      return (
                        <tr key={x.key}>
                          <td style={TD}><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 99, background: x.color, marginRight: 8 }} /><strong>{x.label}</strong>{!x.configured ? <div style={{ fontSize: 11, color: "#92400E" }}>not set up in Settings</div> : null}</td>
                          <td style={{ ...TD, minWidth: 190 }}>
                            <div style={{ fontFamily: F_NUM, fontSize: 13 }}>{x.registered}{x.capacity ? ` / ${x.capacity}` : ""}{x.min_needed ? <span style={{ color: MUTED }}> · min {x.min_needed}</span> : null}</div>
                            <Bar pct={f.pct} color={col} label={`${x.label}: ${x.registered} registered`} />
                            {f.state === "short" ? <div style={{ fontSize: 12, color: "#B45309", marginTop: 2 }}>{f.short} short of minimum</div> : f.state === "over" ? <div style={{ fontSize: 12, color: "#991B1B", marginTop: 2 }}>over capacity</div> : null}
                          </td>
                          <td style={TD}>{x.settled}</td>
                          <td style={{ ...TD, color: x.unpaid ? "#92400E" : INK, fontWeight: x.unpaid ? 600 : 400 }}>{x.unpaid}</td>
                          <td style={TD}>{x.goalies}{x.goalies_unplaced ? <span style={{ fontSize: 12, color: MUTED }}> ({x.goalies_unplaced} unplaced)</span> : null}</td>
                          <td style={TD}>{x.avg_parity === null ? "—" : <Pill bg={b.bg} color={b.color}>{x.avg_parity} {b.label}</Pill>}</td>
                          <td style={{ ...TD, fontFamily: F_NUM, fontSize: 13 }}>{["A", "B", "C", "R", "?"].map((k) => x.tiers[k]).join(" / ")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16 }}>
              <Card title="Will we fill?">
                {d.forecast.projected === null ? (
                  <p style={{ margin: 0, fontSize: 15, color: MUTED }}>{d.forecast.reason} A projection appears once there is enough history, so this page never guesses.</p>
                ) : (
                  <>
                    <div style={{ fontFamily: F_HEAD, fontSize: 34, fontWeight: 700 }}>about {d.forecast.projected}</div>
                    <p style={{ margin: "4px 0 8px", fontSize: 14, color: MUTED }}>players by the close date, at {d.forecast.per_day} per day over the next {d.forecast.days_left} days.
                      {d.forecast.min_needed ? (d.forecast.projected >= d.forecast.min_needed ? ` That meets the minimum of ${d.forecast.min_needed}.` : ` That is short of the minimum of ${d.forecast.min_needed}.`) : ""}
                      {d.forecast.capacity ? ` Capacity is ${d.forecast.capacity}.` : ""}</p>
                    <p style={{ margin: 0, fontSize: 12, color: SOFT }}>An estimate from {d.forecast.basis}.</p>
                  </>
                )}
              </Card>
              <Card title="Registrations, last 30 days">
                {(() => {
                  const bars = dayBars(d.registrations_by_day, 30); const mx = Math.max(1, ...bars.map((b) => b.n)); const total = bars.reduce((s, b) => s + b.n, 0);
                  return (
                    <>
                      <svg viewBox="0 0 300 70" width="100%" role="img" aria-label={`${total} registrations recorded in the last 30 days`}>
                        {bars.map((b, i) => <rect key={b.date} x={i * 10 + 1} y={68 - (b.n / mx) * 64} width="8" height={Math.max(b.n ? 2 : 0, (b.n / mx) * 64)} fill={INK}><title>{b.date}: {b.n}</title></rect>)}
                        <line x1="0" y1="68.5" x2="300" y2="68.5" stroke={LINE} />
                      </svg>
                      <p style={{ margin: "6px 0 0", fontSize: 13, color: MUTED }}>{total} recorded in 30 days{d.last_registration_day ? ` · latest ${d.last_registration_day}` : ""}. Dates are when each registration was recorded here.</p>
                    </>
                  );
                })()}
              </Card>
              <Card title="Skill tiers">
                {["A", "B", "C", "R", "?"].map((k) => (
                  <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span style={{ width: 70, fontFamily: F_NUM, fontSize: 13 }}>{k === "?" ? "No tier" : `Tier ${k}`}</span>
                    <Bar pct={t.registered ? (d.tiers[k] / t.registered) * 100 : 0} color={k === "?" ? "#9CA3AF" : INK} label={`${d.tiers[k]} players`} />
                    <span style={{ width: 34, textAlign: "right", fontFamily: F_NUM, fontSize: 13 }}>{d.tiers[k]}</span>
                  </div>
                ))}
              </Card>
              <Card title="Ages">
                {d.ages.n === 0 ? <p style={{ margin: 0, color: MUTED, fontSize: 14 }}>No ages are recorded for this season’s registrations.</p> : (
                  <>
                    <p style={{ margin: "0 0 8px", fontSize: 14, color: MUTED }}>Average {d.ages.avg} · youngest {d.ages.min} · oldest {d.ages.max} · {d.ages.n} of {t.registered} have an age on file.</p>
                    {d.ages.bands.map((b) => (
                      <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                        <span style={{ width: 56, fontFamily: F_NUM, fontSize: 12 }}>{b.label}</span><Bar pct={(b.n / d.ages.n) * 100} label={`${b.n} players aged ${b.label}`} /><span style={{ width: 30, textAlign: "right", fontFamily: F_NUM, fontSize: 12 }}>{b.n}</span>
                      </div>
                    ))}
                  </>
                )}
              </Card>
            </div>
          </>
        )}

        {/* ───────────────────────── WORKLIST ───────────────────────── */}
        {tab === "worklist" && (
          <Card title={`To fix (${d.issues.length})`}>
            {d.issues.length === 0 ? <p style={{ margin: 0, fontSize: 16 }}>{t.registered === 0 ? "Nothing to fix yet. No one has registered." : "Nothing to fix. Every check on this page passes."}</p> : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
                {d.issues.filter((i) => !div || i.id.indexOf(div) !== -1 || ["unpaid", "sandbag", "tiers", "nodiv"].indexOf(i.id) !== -1).map((i) => {
                  const sv = SEVERITY[i.severity];
                  return (
                    <li key={i.id} style={{ border: `1px solid ${LINE}`, borderLeft: `5px solid ${sv.color}`, borderRadius: 10, padding: "12px 16px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      <Pill bg={sv.bg} color={sv.color}>{sv.label}</Pill>
                      <div style={{ flex: 1, minWidth: 220 }}><div style={{ fontWeight: 600, fontSize: 15 }}>{i.title}</div>{i.detail ? <div style={{ fontSize: 13, color: MUTED }}>{i.detail}</div> : null}</div>
                      {i.fix.page ? <a href={adminUrl(i.fix.page)} style={btn()}>{i.fix.label} →</a> : <button style={btn()} onClick={() => goTab(i.fix.tab)}>{i.fix.label} →</button>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}

        {/* ───────────────────────── PARITY ───────────────────────── */}
        {tab === "parity" && (
          <>
            <Card title="How to read parity">
              <p style={{ margin: 0, fontSize: 14, color: MUTED, lineHeight: 1.6 }}>Parity compares each team’s skill and age against the others in its division. <strong style={{ color: "#166534" }}>Balanced</strong> is {d.parity_bands.review_below}–{d.parity_bands.review_above}. <strong style={{ color: "#92400E" }}>Review</strong> is {d.parity_bands.rebalance_below}–{d.parity_bands.review_below} or {d.parity_bands.review_above}–{d.parity_bands.rebalance_above}. <strong style={{ color: "#991B1B" }}>Rebalance</strong> is outside {d.parity_bands.rebalance_below}–{d.parity_bands.rebalance_above}. These are the same limits the rest of the plugin uses. Worst teams are listed first.</p>
            </Card>
            {shown.map((x) => (
              <Card key={x.key} title={`${x.label} · ${x.teams.length} team${x.teams.length === 1 ? "" : "s"} · ${x.registered} players`}>
                {x.teams.length === 0 ? <p style={{ margin: 0, color: MUTED, fontSize: 14 }}>No teams have been created for this division yet, so there is no parity to show.</p> : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
                      <thead><tr><th style={TH}>Team</th><th style={TH}>Players</th><th style={TH}>Skill</th><th style={TH}>Age</th><th style={TH}>Parity</th><th style={TH} title="Goalies / Defense / Centers / Wingers">G / D / C / W</th></tr></thead>
                      <tbody>
                        {sortTeams(x.teams, d.parity_bands).map((tm) => {
                          const b = parityBand(tm.parity_score, d.parity_bands);
                          return (
                            <tr key={tm.name}>
                              <td style={TD}><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 99, background: tm.colour, marginRight: 8 }} /><strong>{tm.name}</strong></td>
                              <td style={TD}>{tm.players}</td>
                              <td style={{ ...TD, fontFamily: F_NUM }}>{tm.skill_score ?? "—"}</td>
                              <td style={{ ...TD, fontFamily: F_NUM }}>{tm.age_score ?? "—"}</td>
                              <td style={TD}><Pill bg={b.bg} color={b.color}>{tm.parity_score ?? "—"} · {b.label}</Pill></td>
                              <td style={{ ...TD, fontFamily: F_NUM, fontSize: 13, color: tm.goalies === 0 ? "#991B1B" : INK, fontWeight: tm.goalies === 0 ? 700 : 400 }}>{tm.goalies} / {tm.defense} / {tm.center} / {tm.wing}{tm.goalies === 0 ? "  no goalie" : ""}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            ))}
          </>
        )}

        {/* ───────────────────────── PAYMENTS ───────────────────────── */}
        {tab === "payments" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginBottom: 16 }}>
              <Kpi label="Collected" value={money(p.collected)} tone="good" sub="the sum players actually paid" />
              <Kpi label="Still owed" value={p.owed === null ? "—" : money(p.owed)} tone={p.owed ? "warn" : undefined} sub={p.owed === null ? "set the player fee below" : p.fee_source === "estimated" ? `at about ${money(p.fee)} each (estimated)` : `at ${money(p.fee)} each`} />
              <div style={{ ...card, padding: "16px 18px" }}>
                <label htmlFor="fee" style={{ fontFamily: F_NUM, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: MUTED }}>Player fee</label>
                <div style={{ display: "flex", gap: 8, margin: "8px 0 6px" }}>
                  <input id="fee" inputMode="decimal" value={feeText} onChange={(e) => setFeeText(e.target.value)} placeholder={p.fee ? String(p.fee) : "e.g. 200"} style={{ fontSize: 16, padding: "7px 10px", border: `1px solid ${LINE}`, borderRadius: 8, width: 110 }} />
                  <button style={btn("primary")} onClick={saveFee} disabled={busy === "fee"}>{busy === "fee" ? "Saving…" : "Save"}</button>
                </div>
                <div style={{ fontSize: 12, color: SOFT }}>{p.fee_source === "set" ? "Set by the committee." : p.fee_source === "estimated" ? "Not set. Using the typical amount paid. Save a fee to make it exact." : "Not set and nobody has paid yet, so amounts owed are unknown."}</div>
              </div>
            </div>

            <Card title="Where every registration stands">
              <div style={{ display: "flex", height: 16, borderRadius: 99, overflow: "hidden", background: "#ECEAE2" }} role="img" aria-label={`${bd.paid} paid, ${bd.waived} waived, ${bd.pending} pending, ${bd.failed} failed, ${bd.refunded} refunded`}>
                {[["paid", "#166534"], ["waived", "#6D28D9"], ["pending", "#D97706"], ["failed", "#991B1B"], ["refunded", "#6B7280"]].map(([k, c]) => (bd[k] && p.registered ? <div key={k} style={{ width: `${(bd[k] / p.registered) * 100}%`, background: c }} title={`${k}: ${bd[k]}`} /> : null))}
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10, fontSize: 14 }}>
                {[["Paid", bd.paid, "#166534"], ["Waived", bd.waived, "#6D28D9"], ["Pending", bd.pending, "#B45309"], ["Failed", bd.failed, "#991B1B"], ["Refunded", bd.refunded, "#4B5563"]].map(([l, n, c]) => <span key={l}><span aria-hidden="true" style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: c, marginRight: 6 }} />{l} <strong>{n}</strong></span>)}
              </div>
              <p style={{ margin: "10px 0 0", fontSize: 12, color: SOFT }}>{bd.paid} + {bd.waived} + {bd.pending} + {bd.failed} + {bd.refunded}{bd.other ? ` + ${bd.other} other` : ""} = {p.registered} registered{p.adds_up ? "" : " (this does not add up. Please tell the developer.)"}. Subs and withdrawn players are not counted.</p>
            </Card>

            <Card title={`Unpaid players (${unpaidShown.length}${unpaidShown.length !== d.unpaid.length ? ` of ${d.unpaid.length}` : ""})`}
              right={<div className="grsh-noprint" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input aria-label="Search unpaid players" placeholder="Search name…" value={q} onChange={(e) => setQ(e.target.value)} style={{ fontSize: 14, padding: "6px 10px", border: `1px solid ${LINE}`, borderRadius: 8 }} />
                <button style={btn("primary")} disabled={!d.unpaid.some((u) => u.can_remind)} onClick={() => openReminders(null)}>Send reminders…</button>
              </div>} pad={false}>
              {unpaidShown.length === 0 ? <p style={{ padding: 18, margin: 0, fontSize: 15 }}>{d.unpaid.length === 0 ? "Nobody owes anything." : "No unpaid players match."}</p> : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                    <thead><tr><th style={TH}>Player</th><th style={TH}>Division</th><th style={TH}>Status</th><th style={TH}>Owes</th><th style={TH}>Waiting</th><th style={TH}>Last reminded</th><th style={TH} /></tr></thead>
                    <tbody>
                      {unpaidShown.map((u) => (
                        <tr key={u.player_id}>
                          <td style={TD}><strong>{u.name}</strong></td><td style={TD}>{divLabel(u.division)}</td>
                          <td style={TD}><Pill bg={u.status === "failed" ? "#FEE2E2" : "#FEF3C7"} color={u.status === "failed" ? "#991B1B" : "#92400E"}>{u.status}</Pill></td>
                          <td style={{ ...TD, fontFamily: F_NUM }}>{money(u.owes)}</td>
                          <td style={{ ...TD, color: (u.days_waiting || 0) > 30 ? "#991B1B" : INK, fontWeight: (u.days_waiting || 0) > 30 ? 700 : 400 }}>{u.days_waiting === null ? "—" : `${u.days_waiting} day${u.days_waiting === 1 ? "" : "s"}`}</td>
                          <td style={{ ...TD, fontSize: 13, color: MUTED }}>{u.reminded_at ? ago(u.reminded_at) : !u.has_email ? "no email on file" : "never"}</td>
                          <td style={TD}><button className="grsh-noprint" style={{ ...btn(), padding: "4px 10px", fontSize: 13 }} disabled={!u.can_remind} onClick={() => openReminders([u.player_id])} title={u.can_remind ? "" : u.has_email ? `Reminded in the last ${d.cooldown_days} days` : "No email on file"}>Remind</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}

        {/* ───────────────────────── GOALIES ───────────────────────── */}
        {tab === "goalies" && (
          <>
            <Card title="Teams without a goalie">
              {goalieNoDiv.length === 0 ? <p style={{ margin: 0, fontSize: 15 }}>{t.teams === 0 ? "No teams have been created yet." : "Every team has a goalie."}</p> : (
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
                  {goalieNoDiv.map((g) => <li key={g.division + g.team} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><Pill bg="#FEE2E2" color="#991B1B">No goalie</Pill><strong>{g.team}</strong><span style={{ color: MUTED }}>{g.label} · {g.players} player{g.players === 1 ? "" : "s"}</span></li>)}
                </ul>
              )}
              {goalieNoDiv.length > 0 ? <p style={{ margin: "12px 0 0" }}><a href={adminUrl("grsh-tm-rosters")} style={btn()}>Open Rosters to assign one →</a></p> : null}
            </Card>
            <Card title={`Registered goalies not on a roster (${unplaced.length})`}>
              {unplaced.length === 0 ? <p style={{ margin: 0, fontSize: 15 }}>Every registered goalie is on a roster.</p> : (
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8, fontSize: 15 }}>{unplaced.map((g) => <li key={g.name + g.division}><strong>{g.name}</strong> <span style={{ color: MUTED }}>· {divLabel(g.division)}</span></li>)}</ul>
              )}
            </Card>
          </>
        )}

        {/* ───────────────────────── REVIEW ───────────────────────── */}
        {tab === "review" && (
          <Card title={`Flagged for tier review (${t.sandbagging})`}>
            {d.flags.length === 0 ? <p style={{ margin: 0, fontSize: 15 }}>No players are flagged this season.</p> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={TH}>Player</th><th style={TH}>Tier</th><th style={TH}>Division</th></tr></thead>
                  <tbody>{d.flags.filter((f) => !div || f.division === div).map((f) => <tr key={f.id}><td style={TD}><strong>{f.player}</strong></td><td style={{ ...TD, fontFamily: F_NUM }}>{f.tier || "—"}</td><td style={TD}>{divLabel(f.division)}</td></tr>)}</tbody>
                </table>
              </div>
            )}
            {t.sandbagging > d.flags.length ? <p style={{ fontSize: 13, color: MUTED }}>Showing the first {d.flags.length} of {t.sandbagging}.</p> : null}
            <p style={{ margin: "12px 0 0", fontSize: 13, color: MUTED }}>{t.tier_unknown} registered player{t.tier_unknown === 1 ? " has" : "s have"} no skill tier. <a href={adminUrl("grsh-tm-players")} style={{ color: INK }}>Open Players →</a></p>
          </Card>
        )}

        {/* ───────────────────────── EXPORT ───────────────────────── */}
        {tab === "exports" && (
          <>
            <Card title="Download as CSV (opens in Excel or Google Sheets)">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
                {d.exports.map((e) => (
                  <div key={e.id} style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                    <strong style={{ fontSize: 15 }}>{e.title}</strong><span style={{ fontSize: 13, color: MUTED, flex: 1 }}>{e.desc}</span>
                    <button style={btn()} onClick={() => downloadExport(e.id)} disabled={busy === "exp-" + e.id}>{busy === "exp-" + e.id ? "Building…" : "Download CSV"}</button>
                  </div>
                ))}
              </div>
              <p style={{ margin: "12px 0 0", fontSize: 12, color: SOFT }}>Files are built on the server from live data and named with today’s date. Player exports contain emails, so store them with care. Each download is recorded in the audit log.</p>
            </Card>
            <Card title="Board meeting pack">
              <p style={{ margin: "0 0 10px", fontSize: 14, color: MUTED }}>A formatted summary of the numbers above: registration, payments, parity, goalies and action items, built when you click.</p>
              <button style={btn("primary")} onClick={boardPack} disabled={busy === "pack"}>{busy === "pack" ? "Building…" : "Download board pack"}</button>
            </Card>
          </>
        )}

        {/* ───────────────────────── HISTORY & SHARING ───────────────────────── */}
        {tab === "history" && (
          <>
            <Card title="Share a read-only link">
              <p style={{ margin: "0 0 12px", fontSize: 14, color: MUTED, lineHeight: 1.6 }}>Anyone with the link can see totals only: counts, percentages and division tables. No player names, no emails. The link expires on its own and you can revoke it at any time.</p>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <label htmlFor="days" style={{ fontSize: 14 }}>Expires in</label>
                <select id="days" value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ fontSize: 15, padding: "6px 8px", borderRadius: 8, border: `1px solid ${LINE}` }}>{[1, 3, 7, 14, 30].map((n) => <option key={n} value={n}>{n} day{n === 1 ? "" : "s"}</option>)}</select>
                <button style={btn("primary")} onClick={createLink} disabled={busy === "share"}>{busy === "share" ? "Creating…" : "Create link"}</button>
              </div>
              {newLink ? (
                <div role="status" style={{ marginTop: 14, padding: 12, background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 10 }}>
                  <div style={{ fontSize: 13, marginBottom: 6 }}><strong>Copy this now.</strong> {newLink.note}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><input readOnly aria-label="Share link" value={newLink.url} onFocus={(e) => e.target.select()} style={{ flex: 1, minWidth: 260, fontFamily: F_NUM, fontSize: 12, padding: "7px 10px", border: `1px solid ${LINE}`, borderRadius: 8 }} /><button style={btn()} onClick={() => copy(newLink.url, "Link")}>Copy</button></div>
                </div>
              ) : null}
              <h3 style={{ fontFamily: F_NUM, fontSize: 12, color: MUTED, letterSpacing: ".06em", textTransform: "uppercase", margin: "18px 0 8px" }}>Active links ({shares.length})</h3>
              {shares.length === 0 ? <p style={{ margin: 0, fontSize: 14, color: MUTED }}>No active links.</p> : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>{shares.map((s) => (
                  <li key={s.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 14 }}>
                    <span style={{ fontFamily: F_NUM, fontSize: 12 }}>…{s.id.slice(0, 6)}</span><span>created {ago(s.created)} by {s.by}</span><span style={{ color: MUTED }}>expires {new Date(s.expires).toLocaleDateString()}</span>
                    <button style={{ ...btn(), padding: "3px 10px", fontSize: 13, marginLeft: "auto" }} onClick={() => revoke(s.id)}>Revoke</button>
                  </li>))}</ul>
              )}
            </Card>
            <Card title="Report history" pad={false}>
              {d.history.length === 0 ? <p style={{ padding: 18, margin: 0, color: MUTED }}>Nothing recorded yet.</p> : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={TH}>Recorded</th><th style={TH}>Registered</th><th style={TH}>Paid</th><th style={TH}>Unpaid</th><th style={TH}>Collected</th></tr></thead>
                  <tbody>{d.history.map((h) => <tr key={h.at}><td style={TD}>{new Date(h.at).toLocaleString()}</td><td style={TD}>{h.registered}</td><td style={TD}>{h.paid}</td><td style={TD}>{h.unpaid}</td><td style={{ ...TD, fontFamily: F_NUM }}>{money(h.collected)}</td></tr>)}</tbody>
                </table>
              )}
              <p style={{ margin: 0, padding: "10px 18px 14px", fontSize: 12, color: SOFT }}>A snapshot is recorded automatically when someone opens this page, at most every 6 hours. It is what powers “since last visit”.</p>
            </Card>
          </>
        )}

        {/* ───────────────────────── HELP ───────────────────────── */}
        {tab === "help" && (
          <Card title="How these numbers work">
            <dl style={{ margin: 0, display: "grid", gap: 14, fontSize: 14, lineHeight: 1.6 }}>
              {[
                ["What counts as “registered”?", "Primary players whose registration is active. Substitutes, withdrawn players and the waitlist are not counted. Paid + waived + pending + failed + refunded always equals registered."],
                ["Where does “owed” come from?", "The player fee on the Payments tab. If you have not set one, the page uses the typical amount players have paid and says it is an estimate. If neither exists it shows a dash, never $0."],
                ["What do the reminder emails say?", "A short plain note that the payment is still open and asking them to reply if they already paid. You see the exact wording and who gets it before anything is sent. A player is never emailed twice within " + d.cooldown_days + " days, and each send is limited to " + 100 + " people."],
                ["What is in a share link?", "Totals only. It has a long random code, expires, and can be revoked. If you want a name-level view, use the CSV exports instead."],
                ["Why might a forecast be missing?", "It needs at least 10 registrations over at least a week and a registration close date in Settings. Otherwise it tells you why, rather than guessing."],
                ["How fresh is the data?", "It is read from the database each time you open or refresh this page. To pull in new WPForms entries first, use Sync on the Dashboard or Players page."],
              ].map(([k, a]) => <div key={k}><dt style={{ fontWeight: 700 }}>{k}</dt><dd style={{ margin: 0, color: MUTED }}>{a}</dd></div>)}
            </dl>
          </Card>
        )}
      </div>

      {/* reminder dialog */}
      {rem ? (
        <div role="dialog" aria-modal="true" aria-label="Send payment reminders" onKeyDown={(e) => { if (e.key === "Escape") setRem(null); }} style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100000, padding: 16 }}>
          <div style={{ ...card, maxWidth: 560, width: "100%", maxHeight: "90vh", overflow: "auto", padding: 22 }}>
            {rem.loading ? <p>Checking who can be reminded…</p> : rem.error && !rem.eligible && !rem.done ? (
              <><h2 style={{ marginTop: 0, fontFamily: F_HEAD }}>Could not prepare reminders</h2><p style={{ color: MUTED }}>{rem.error}</p><button style={btn()} onClick={() => setRem(null)}>Close</button></>
            ) : rem.done ? (
              <><h2 style={{ marginTop: 0, fontFamily: F_HEAD }}>Reminders sent</h2><p style={{ fontSize: 15 }}>{rem.done.sent} email{rem.done.sent === 1 ? "" : "s"} sent{rem.done.failed ? `, ${rem.done.failed} could not be sent` : ""}. They will not be reminded again for {d.cooldown_days} days.</p><button style={btn("primary")} onClick={() => setRem(null)}>Done</button></>
            ) : (
              <>
                <h2 style={{ marginTop: 0, fontFamily: F_HEAD }}>Send {rem.eligible} reminder{rem.eligible === 1 ? "" : "s"}?</h2>
                <p style={{ margin: "0 0 8px", fontSize: 14, color: MUTED }}>{rem.names.join(", ")}{rem.eligible > rem.names.length ? ` and ${rem.eligible - rem.names.length} more` : ""}.
                  {rem.skipped_recent ? ` ${rem.skipped_recent} skipped (reminded in the last ${d.cooldown_days} days).` : ""}{rem.skipped_no_email ? ` ${rem.skipped_no_email} skipped (no email on file).` : ""}{rem.capped ? " Only the first 100 will be sent now." : ""}</p>
                <div style={{ background: PAPER, border: `1px solid ${LINE}`, borderRadius: 8, padding: 12, fontSize: 13, whiteSpace: "pre-wrap", marginBottom: 10 }}><strong>{rem.subject}</strong>{"\n\n"}{rem.body}</div>
                <label htmlFor="note" style={{ fontSize: 13 }}>Add a line of your own (optional)</label>
                <textarea id="note" maxLength={500} rows={2} value={rem.note} onChange={(e) => setRem((s) => ({ ...s, note: e.target.value }))} style={{ width: "100%", boxSizing: "border-box", fontSize: 14, padding: 8, border: `1px solid ${LINE}`, borderRadius: 8, margin: "4px 0 12px", fontFamily: F_UI }} />
                {rem.error ? <p role="alert" style={{ color: "#991B1B", fontSize: 14 }}>{rem.error}</p> : null}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button style={btn()} onClick={() => setRem(null)}>Cancel</button>
                  <button style={btn("primary")} disabled={rem.sending || !rem.eligible} onClick={sendReminders}>{rem.sending ? "Sending…" : `Send ${rem.eligible} email${rem.eligible === 1 ? "" : "s"}`}</button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      <div role="status" aria-live="polite" style={{ position: "fixed", left: 24, bottom: 24, maxWidth: 420, zIndex: 100001 }}>
        {toast ? <div style={{ background: INK, color: WHITE, padding: "12px 16px", borderRadius: 10, fontSize: 14, boxShadow: "0 6px 24px rgba(0,0,0,.25)" }}>{toast}</div> : null}
      </div>
    </div>
  );
}
