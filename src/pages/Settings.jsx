import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  STATUSES, IRREVERSIBLE, toNum, fmtDate, localToday, timelineModel, validate, diff, errorTabCounts, tabOfError, teamFeeFor, capacity, divisionWarnings,
  rolloverPlan, exportPayload, importPayload, buildPayload, money, FIELD_LABELS,
} from "../lib/settingsEngine";

const API = (window.grshConfig && window.grshConfig.apiUrl) || "/wp-json/grsh/v1";
const NONCE = (window.grshConfig && window.grshConfig.nonce) || "";
const H = { "X-WP-Nonce": NONCE, "Content-Type": "application/json" };

const TABS = [["season", "Season"], ["divisions", "Divisions"], ["fees", "Fees"], ["draft", "Draft"], ["email", "Email"], ["access", "Access"], ["health", "Health"]];
const STATUS_HELP = { setup: "Building the season. Not taking registrations.", open: "Taking registrations.", draft: "Registration closed, running the draft.", locked: "Rosters are final.", complete: "Season is over." };
const DRAFT_TYPES = [["snake", "Snake draft"], ["linear", "Linear draft"], ["auto_balance", "Auto-balance"]];
const DRAFT_ORDERS = [["random", "Random"], ["weighted", "Weighted (prior season)"], ["lottery", "Lottery"], ["manual", "Manual"]];
const ROLES = [
  ["Administrator", [1, 1, 1, 1, 1, 1]], ["Committee", [1, 1, 1, 1, 1, 0]], ["Captain", [0, 0, 0, 0, 1, 1]], ["Read Only", [0, 0, 0, 0, 1, 0]],
];

const fmtStamp = (s) => { if (!s) return ""; const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.exec(s); return m ? `${fmtDate(m[1])} at ${m[2]}:${m[3]}` : s; };
const saveBlob = (name, text, type) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

async function api(path, opts) {
  const res = await fetch(`${API}${path}`, { headers: H, ...(opts || {}) });
  let j = null; try { j = await res.json(); } catch (e) { /* not json */ }
  return { ok: res.ok, status: res.status, j: j || {} };
}

function Wire({ ov, k }) {
  const w = ov && ov.wiring && ov.wiring[k];
  if (!w) return null;
  return w.state === "not_connected"
    ? <span className="gs-wire off" title="This is saved, but no other part of the plugin reads it yet, so changing it does nothing today.">Not connected yet</span>
    : <span className="gs-wire on">Used by: {w.used_by}</span>;
}
function Switch({ id, checked, onChange, label, hint, ov, k }) {
  return (
    <div className="gs-row">
      <div className="gs-rowtxt">
        <label id={id + "-l"} htmlFor={id} className="gs-rowlabel">{label}</label>
        {hint && <p id={id + "-h"} className="gs-hint">{hint}</p>}
        {k && <Wire ov={ov} k={k} />}
      </div>
      <button type="button" role="switch" id={id} aria-checked={!!checked} aria-labelledby={id + "-l"} aria-describedby={hint ? id + "-h" : undefined}
        className={"gs-sw" + (checked ? " on" : "")} onClick={() => onChange(!checked)}><span /></button>
    </div>
  );
}
function Field({ id, label, hint, error, children, wide }) {
  return (
    <div className={"gs-f" + (wide ? " wide" : "")}>
      <label htmlFor={id} className="gs-lab">{label}</label>
      {children}
      {error ? <p className="gs-err" role="alert" id={id + "-e"}>{error}</p> : hint ? <p className="gs-hint">{hint}</p> : null}
    </div>
  );
}
const Group = ({ title, children }) => <section className="gs-group"><h2 className="gs-gl">{title}</h2>{children}</section>;

function Timeline({ opens, closes, draft, today }) {
  const t = timelineModel({ opens, closes, draft, today });
  const [a, b, c] = ["opens", "closes", "draft"].map(k => t.points.find(p => p.key === k));
  const tone = { open: "green", before: "blue", closed: "amber", after: "grey", unset: "grey" }[t.phase];
  return (
    <div className="gs-tl" aria-label="Season timeline">
      <div className="gs-tlhead">
        <span className={"gs-pill " + tone}>● {t.label}</span>
        {t.note && <span className={"gs-tlnote " + tone}>{t.note}</span>}
      </div>
      {t.points.length >= 2 ? (
        <div className="gs-bar" role="img" aria-label={t.points.map(p => `${p.label} ${fmtDate(p.ymd)}`).join(", ")}>
          {a && b && <i className="seg green" style={{ left: a.pct + "%", width: Math.max(0, b.pct - a.pct) + "%" }} />}
          {b && c && <i className="seg amber" style={{ left: b.pct + "%", width: Math.max(0, c.pct - b.pct) + "%" }} />}
          {t.points.map(p => <b key={p.key} className="tick" style={{ left: p.pct + "%" }} />)}
          {t.todayPct !== null && <u className="today" style={{ left: t.todayPct + "%" }}><em>Today</em></u>}
        </div>
      ) : <p className="gs-hint">Set the dates to see the season laid out to scale.</p>}
      <div className="gs-tlfoot">
        {t.points.map(p => <span key={p.key}>{p.label}: <strong>{fmtDate(p.ymd)}</strong></span>)}
      </div>
      {t.problems.map(x => <p key={x} className="gs-err" role="alert">{x}</p>)}
    </div>
  );
}

export default function Settings() {
  const [load, setLoad] = useState({ state: "loading", msg: "" });
  const [ov, setOv] = useState(null);
  const [base, setBase] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [srvErr, setSrvErr] = useState({});
  const [tab, setTab] = useState("season");
  const [review, setReview] = useState(false);
  const [ack, setAck] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [conflict, setConflict] = useState(false);
  const [pending, setPending] = useState(null);
  const [mail, setMail] = useState(null);
  const [restoreId, setRestoreId] = useState(null);
  const [imp, setImp] = useState(null);
  const [feeDate, setFeeDate] = useState("");
  const busy = useRef(false);

  const fetchAll = useCallback(async (keepEdits) => {
    setLoad({ state: "loading", msg: "" });
    try {
      const r = await api("/settings/overview");
      if (!r.ok) {
        const why = r.status === 403 ? "Your account is not allowed to open Settings (it needs a WordPress Administrator)." : (r.j.message || r.j.error || `The server answered HTTP ${r.status}.`);
        setLoad({ state: "error", msg: why }); return;
      }
      setOv(r.j); setBase(r.j.settings); if (!keepEdits) { setCfg(r.j.settings); setSrvErr({}); }
      setFeeDate((d) => d || r.j.today); setLoad({ state: "ready", msg: "" });
    } catch (e) { setLoad({ state: "error", msg: "Could not reach the server." }); }
  }, []);
  useEffect(() => { fetchAll(false); }, [fetchAll]);

  const changes = useMemo(() => (base && cfg ? diff(base, cfg) : []), [base, cfg]);
  const dirty = changes.length > 0;
  const clientErr = useMemo(() => (cfg ? validate(cfg) : {}), [cfg]);
  const err = useMemo(() => ({ ...srvErr, ...clientErr }), [srvErr, clientErr]);
  const errCount = Object.keys(err).length;
  const tabErr = useMemo(() => errorTabCounts(err), [err]);
  const today = (ov && ov.today) || localToday();

  useEffect(() => {
    if (!dirty) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const set = (k, v) => { setCfg((c) => ({ ...c, [k]: v })); setSrvErr((e) => { if (!(k in e)) return e; const n = { ...e }; delete n[k]; return n; }); setMsg(null); };
  const setDiv = (i, k, v) => {
    setCfg((c) => ({ ...c, divisions: c.divisions.map((d, x) => (x === i ? { ...d, [k]: v } : d)) }));
    setSrvErr((e) => { const key = `divisions.${i}.${k}`; if (!(key in e)) return e; const n = { ...e }; delete n[key]; return n; }); setMsg(null);
  };
  const P = (k, extra) => ({ id: "f-" + k, value: cfg[k] === null || cfg[k] === undefined ? "" : cfg[k], onChange: (e) => set(k, e.target.value),
    "aria-invalid": !!err[k], "aria-describedby": err[k] ? "f-" + k + "-e" : undefined, className: "gs-in" + (err[k] ? " bad" : ""), ...extra });

  const discard = () => { setCfg(base); setSrvErr({}); setMsg(null); setPending(null); setConflict(false); };

  const openReview = () => { setAck(false); setReview(true); };
  const warnings = useMemo(() => (ov && base && cfg ? divisionWarnings(base, cfg, ov.registered) : []), [ov, base, cfg]);
  const irreversible = cfg && base && cfg.status !== base.status && IRREVERSIBLE.includes(cfg.status);
  const statusChecks = ov && cfg && base && cfg.status !== base.status ? (ov.readiness[cfg.status] || []).filter((c) => c.level !== "ok") : [];

  const save = async (force) => {
    if (busy.current) return; busy.current = true; setSaving(true); setMsg(null);
    try {
      const body = { ...buildPayload(cfg, ov.meta.saved_at), ...(force ? { force: true } : {}) };
      const r = await api("/settings", { method: "POST", body: JSON.stringify(body) });
      if (r.ok) {
        setBase(r.j.settings); setCfg(r.j.settings); setSrvErr({}); setConflict(false); setReview(false);
        setOv((o) => ({ ...o, settings: r.j.settings, meta: { ...o.meta, ...(r.j.meta || {}) }, history: r.j.history || o.history }));
        setMsg({ kind: "ok", text: r.j.unchanged ? "Nothing changed." : `Saved ${r.j.changes.length} change${r.j.changes.length === 1 ? "" : "s"} at ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.` });
        fetchAll(true);
      } else if (r.status === 422) {
        setSrvErr(r.j.errors || {}); setReview(false);
        const first = Object.keys(r.j.errors || {})[0]; if (first) setTab(tabOfError(first));
        setMsg({ kind: "bad", text: r.j.error || "Fix the highlighted fields." });
      } else if (r.status === 409) {
        setReview(false); setConflict(true); setMsg({ kind: "bad", text: r.j.error });
      } else setMsg({ kind: "bad", text: r.j.error || r.j.message || `Save failed (HTTP ${r.status}). Your edits are still here.` });
    } catch (e) { setMsg({ kind: "bad", text: "Could not reach the server. Your edits are still here and nothing was saved." }); }
    finally { busy.current = false; setSaving(false); }
  };

  const sendTest = async () => {
    if (busy.current) return; busy.current = true; setMail({ state: "sending" });
    try { const r = await api("/settings/test-email", { method: "POST", body: "{}" }); setMail(r.ok ? { state: "ok", ...r.j } : { state: "bad", text: r.j.error || `HTTP ${r.status}` }); }
    catch (e) { setMail({ state: "bad", text: "Could not reach the server." }); }
    finally { busy.current = false; }
  };
  const restore = async (id) => {
    if (busy.current) return; busy.current = true; setMsg(null);
    try {
      const r = await api("/settings/restore", { method: "POST", body: JSON.stringify({ id }) });
      if (r.ok) { setRestoreId(null); setMsg({ kind: "ok", text: "Restored that version." }); await fetchAll(false); }
      else setMsg({ kind: "bad", text: r.j.error || `Restore failed (HTTP ${r.status}).` });
    } catch (e) { setMsg({ kind: "bad", text: "Could not reach the server." }); }
    finally { busy.current = false; }
  };
  const onKeyTabs = (e) => {
    const i = TABS.findIndex((t) => t[0] === tab); let n = i;
    if (e.key === "ArrowRight") n = (i + 1) % TABS.length; else if (e.key === "ArrowLeft") n = (i + TABS.length - 1) % TABS.length; else return;
    e.preventDefault(); setTab(TABS[n][0]); const el = document.getElementById("gs-tab-" + TABS[n][0]); if (el) el.focus();
  };
  const onImport = (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const r = importPayload(String(rd.result));
      if (!r.ok) { setImp({ kind: "bad", text: r.error }); return; }
      setCfg((c) => ({ ...c, ...r.settings, season_year: c.season_year }));
      setImp({ kind: "ok", text: `Loaded ${Object.keys(r.settings).length} settings from ${f.name}. Nothing is saved yet. Press Review & save to check them.` + (r.ignored.length ? ` Ignored: ${r.ignored.join(", ")}.` : "") });
    };
    rd.readAsText(f); e.target.value = "";
  };

  if (load.state === "loading" && !cfg) return <div className="gs-root"><Styles /><p className="gs-load" role="status">Loading settings…</p></div>;
  if (load.state === "error" && !cfg) {
    return (
      <div className="gs-root"><Styles />
        <div className="gs-fail" role="alert">
          <h2>Settings could not be loaded</h2>
          <p>{load.msg}</p>
          <p className="gs-hint">The form is hidden on purpose. If it showed default values you could save them over your real settings.</p>
          <button className="gs-btn primary" onClick={() => fetchAll(false)}>Try again</button>
        </div>
      </div>
    );
  }
  if (!cfg || !ov) return null;

  const statusIdx = STATUSES.indexOf(cfg.status);
  const regd = ov.registered || {};
  const healthBad = (ov.health || []).filter((h) => h.level === "bad" || h.level === "warn").length;
  const plan = rolloverPlan(cfg);
  const fee = teamFeeFor(cfg, feeDate || today);
  const formList = ov.forms && ov.forms.available ? ov.forms.forms : null;
  const sync = (ov && ov.sync_forms) || null;
  const formKnown = formList ? formList.find((f) => f.id === toNum(cfg.form_id)) : null;
  const sw = (k, label, hint) => <Switch id={"sw-" + k} checked={cfg[k]} onChange={(v) => set(k, v)} label={label} hint={hint} ov={ov} k={k} />;

  return (
    <div className="gs-root">
      <Styles />
      <header className="gs-head">
        <div>
          <div className="gs-eyebrow"><span className="gs-tag">Admin</span><span className={"gs-pill s-" + base.status}>{base.status.charAt(0).toUpperCase() + base.status.slice(1)}</span></div>
          <h1 className="gs-title">Settings</h1>
          <p className="gs-sub">Season · divisions · fees · draft · email · access</p>
          <p className="gs-saved" aria-live="polite">
            {ov.meta.saved_at ? <>Last saved {ov.meta.saved_by ? "by " + ov.meta.saved_by + " " : ""}on {fmtStamp(ov.meta.saved_at)}</> : "Never saved from this page. Showing built-in defaults."}
          </p>
        </div>
        <div className="gs-actions">
          <button className="gs-btn ghost" disabled={!dirty || saving} onClick={discard}>Discard changes</button>
          <button className="gs-btn primary" disabled={!dirty || saving || errCount > 0} onClick={openReview}
            title={errCount ? "Fix the highlighted fields first" : dirty ? "See exactly what will change" : "Nothing to save"}>
            {saving ? "Saving…" : dirty ? `Review & save (${changes.length})` : "Saved"}
          </button>
        </div>
      </header>

      {msg && <div className={"gs-banner " + msg.kind} role={msg.kind === "bad" ? "alert" : "status"}>{msg.text}
        {conflict && <span className="gs-bact"><button className="gs-btn small" onClick={() => { if (!dirty || window.confirm("Reload and lose your unsaved edits?")) { setConflict(false); setMsg(null); fetchAll(false); } }}>Reload their version</button>
          <button className="gs-btn small danger" onClick={() => save(true)}>Overwrite with mine</button></span>}
      </div>}
      {load.state === "error" && <div className="gs-banner bad" role="alert">Could not refresh from the server: {load.msg}</div>}

      <div className="gs-tabs" role="tablist" aria-label="Settings sections" onKeyDown={onKeyTabs}>
        {TABS.map(([k, l]) => (
          <button key={k} id={"gs-tab-" + k} role="tab" aria-selected={tab === k} aria-controls={"gs-panel-" + k} tabIndex={tab === k ? 0 : -1}
            className={"gs-tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>
            {l}{tabErr[k] ? <span className="gs-badge bad" aria-label={tabErr[k] + " problems"}>{tabErr[k]}</span> : k === "health" && healthBad ? <span className="gs-badge warn" aria-label={healthBad + " to check"}>{healthBad}</span> : null}
          </button>
        ))}
      </div>

      <div className="gs-card" role="tabpanel" id={"gs-panel-" + tab} aria-labelledby={"gs-tab-" + tab}>
        {tab === "season" && <>
          <Group title="Season timeline"><Timeline opens={cfg.registration_opens} closes={cfg.registration_closes} draft={cfg.draft_date} today={today} /></Group>
          <Group title="Where the season is">
            <ol className="gs-steps" aria-label="Season status">
              {STATUSES.map((s, i) => (
                <li key={s}><button type="button" className={"gs-step" + (i < statusIdx ? " done" : "") + (i === statusIdx ? " now" : "")} aria-current={i === statusIdx ? "step" : undefined}
                  onClick={() => { if (s !== cfg.status) setPending(s); }}><span className="n">{i < statusIdx ? "✓" : i + 1}</span>{s.charAt(0).toUpperCase() + s.slice(1)}</button></li>
              ))}
            </ol>
            <p className="gs-hint">{STATUS_HELP[cfg.status]}{cfg.status !== base.status && <strong> Not saved yet.</strong>}</p>
            {err.status && <p className="gs-err" role="alert">{err.status}</p>}
            {pending && (
              <div className="gs-panel" role="region" aria-label={"Move to " + pending}>
                <h4>Move to “{pending}”?</h4>
                <ul className="gs-checks">
                  {(ov.readiness[pending] || []).length === 0 && <li className="ok">Nothing to check for this step.</li>}
                  {(ov.readiness[pending] || []).map((c, i) => <li key={i} className={c.level}>{c.text}{c.tab && <button className="gs-link" onClick={() => setTab(c.tab)}>Fix</button>}</li>)}
                </ul>
                {IRREVERSIBLE.includes(pending) && <p className="gs-warn">This step is meant to be final. You can still change it back here, but captains and players may already have been told.</p>}
                <div className="gs-btnrow">
                  <button className="gs-btn primary" disabled={(ov.readiness[pending] || []).some((c) => c.level === "block")} onClick={() => { set("status", pending); setPending(null); }}>Use “{pending}” (not saved yet)</button>
                  <button className="gs-btn ghost" onClick={() => setPending(null)}>Cancel</button>
                </div>
              </div>
            )}
          </Group>
          <Group title="Season details">
            <div className="gs-grid">
              <Field id="f-season_year" label="Season year" hint={`Fixed at ${ov.locked_year} by the sync code. Next season is a code change, not a setting.`}>
                <input id="f-season_year" className="gs-in locked" value={cfg.season_year} readOnly aria-readonly="true" />
              </Field>
              <Field id="f-season_label" label="Season label" error={err.season_label}><input {...P("season_label")} /></Field>
              <Field id="f-form_id" label="Player registration form (WPForms)" error={err.form_id}
                hint={formList ? (formKnown ? `${formKnown.title}${formKnown.entries !== null ? " · " + formKnown.entries + " entries" : ""}` : "") : "WPForms could not be read here, so type the form ID."}>
                {formList ? (
                  <select {...P("form_id", { onChange: (e) => set("form_id", e.target.value) })}>
                    {!formKnown && <option value={cfg.form_id}>#{cfg.form_id} (not found in WPForms)</option>}
                    {formList.map((f) => <option key={f.id} value={f.id}>{f.title} (#{f.id}){f.entries !== null ? ` · ${f.entries} entries` : ""}</option>)}
                  </select>
                ) : <input type="number" min="1" {...P("form_id")} />}
                {formList && !formKnown && <p className="gs-note" role="status">Form #{cfg.form_id} was not found in the WPForms list ({formList.length} forms found).</p>}
                <p className="gs-note">{sync && sync.live ? `Not connected yet: the sync is fixed in code. Player registration (draft) = form #${sync.live}${sync.test ? `, test #${sync.test}` : ""}. Team registration = form #${sync.team || "?"}${sync.team_test ? `, test #${sync.team_test}` : ""}. Changing this box does not change what syncs.` : "Not connected yet: the sync does not read this setting."}</p>
              </Field>
            </div>
          </Group>
          <Group title="Dates">
            <div className="gs-grid">
              <Field id="f-registration_opens" label="Registration opens" error={err.registration_opens}><input type="date" {...P("registration_opens")} /></Field>
              <Field id="f-registration_closes" label="Registration closes" error={err.registration_closes}><input type="date" {...P("registration_closes")} /></Field>
              <Field id="f-draft_date" label="Draft date" error={err.draft_date}><input type="date" {...P("draft_date")} /></Field>
            </div>
          </Group>
          <Group title="Intelligence">{sw("sandbagging_auto_flag", "Auto-flag sandbagging", "Flag players whose registered tier does not match their prior division history, in red on the Draft board.")}</Group>
        </>}

        {tab === "divisions" && <>
          <Group title="Divisions">
            <p className="gs-hint">Roster spots = teams × max roster. “Needed” = teams × min roster. The bar shows registered players against both.</p>
            {err.divisions && <p className="gs-err" role="alert">{err.divisions}</p>}
          </Group>
          {cfg.divisions.map((d, i) => {
            const cap = capacity(d), n = (regd[d.key] && regd[d.key].registered) || 0, g = (regd[d.key] && regd[d.key].goalies) || 0;
            const pct = cap.slots ? Math.min(100, Math.round((n / cap.slots) * 100)) : 0, needPct = cap.slots && cap.needed ? Math.round((cap.needed / cap.slots) * 100) : 0;
            const e = (f) => err[`divisions.${i}.${f}`];
            const num = (f, lab) => <Field id={`d${i}-${f}`} label={lab} error={e(f)}><input type="number" id={`d${i}-${f}`} value={d[f] === null || d[f] === undefined ? "" : d[f]} onChange={(ev) => setDiv(i, f, ev.target.value)} aria-invalid={!!e(f)} aria-describedby={e(f) ? `d${i}-${f}-e` : undefined} className={"gs-in" + (e(f) ? " bad" : "")} /></Field>;
            return (
              <section key={d.key} className={"gs-div" + (d.enabled ? "" : " off")} aria-label={d.label}>
                <div className="gs-divhead">
                  <div className="gs-divname"><input aria-label={d.label + " name"} className={"gs-in name" + (e("label") ? " bad" : "")} value={d.label} onChange={(ev) => setDiv(i, "label", ev.target.value)} /><code>{d.key}</code>{e("label") && <span className="gs-err">{e("label")}</span>}</div>
                  <button type="button" role="switch" aria-checked={!!d.enabled} aria-label={"Enable " + d.label} className={"gs-sw" + (d.enabled ? " on" : "")} onClick={() => setDiv(i, "enabled", !d.enabled)}><span /></button>
                </div>
                {d.enabled && <>
                  <div className="gs-grid five">{num("teams", "Teams")}{num("min_roster", "Min roster")}{num("max_roster", "Max roster")}{num("goalie_min", "Min goalies")}{num("goalie_max", "Max goalies")}</div>
                  <div className="gs-cap">
                    <div className="gs-meter" role="img" aria-label={`${n} registered of ${cap.slots === null ? "unknown" : cap.slots} spots`}><i className={n > (cap.slots || Infinity) ? "over" : ""} style={{ width: pct + "%" }} />{needPct > 0 && <b style={{ left: needPct + "%" }} title="Minimum needed" />}</div>
                    <p className="gs-hint"><strong>{n}</strong> registered ({g} goalie{g === 1 ? "" : "s"}) · <strong>{cap.slots === null ? "—" : cap.slots}</strong> spots · <strong>{cap.needed === null ? "—" : cap.needed}</strong> needed to run{cap.goalies !== null && g < cap.goalies ? <span className="gs-warn"> · needs {cap.goalies} goalies</span> : null}</p>
                  </div>
                </>}
                {!d.enabled && n > 0 && <p className="gs-warn">{n} registered player{n === 1 ? "" : "s"} will be hidden while this division is off.</p>}
              </section>
            );
          })}
        </>}

        {tab === "fees" && <>
          <Group title="Player fee">
            <div className="gs-grid">
              <Field id="f-player_fee" label="Fee per player (USD)" error={err.player_fee} hint="Reports uses this for “amount owed” and payment reminders. Blank = not set.">
                <input type="number" min="0" step="0.01" placeholder="not set" {...P("player_fee")} />
              </Field>
            </div>
            <Wire ov={ov} k="player_fee" />
          </Group>
          <Group title="Team fees (full-team entries)">
            <div className="gs-grid">
              <Field id="f-team_deposit_amount" label="Deposit" error={err.team_deposit_amount}><input type="number" min="0" step="0.01" {...P("team_deposit_amount")} /></Field>
              <Field id="f-team_fee_early_amount" label="Early total" error={err.team_fee_early_amount}><input type="number" min="0" step="0.01" {...P("team_fee_early_amount")} /></Field>
              <Field id="f-team_fee_late_amount" label="Late total" error={err.team_fee_late_amount}><input type="number" min="0" step="0.01" {...P("team_fee_late_amount")} /></Field>
              <Field id="f-team_fee_early_cutoff_date" label="Early fee if deposit paid by" error={err.team_fee_early_cutoff_date}><input type="date" {...P("team_fee_early_cutoff_date")} /></Field>
              <Field id="f-team_balance_due_date" label="Balance due" error={err.team_balance_due_date}><input type="date" {...P("team_balance_due_date")} /></Field>
            </div>
            <Wire ov={ov} k="team_fee_late_amount" />
            <div className="gs-try" aria-live="polite">
              <label htmlFor="f-feedate" className="gs-lab">Try it: a team pays its deposit on</label>
              <input id="f-feedate" type="date" className="gs-in short" value={feeDate} onChange={(e) => setFeeDate(e.target.value)} />
              <p className="gs-result">{fee ? <>That team gets the <strong>{fee.tier}</strong> fee: <strong>{money(fee.total)}</strong> total, <strong>{money(fee.balance)}</strong> due on {fmtDate(cfg.team_balance_due_date)} after the {money(fee.deposit)} deposit.
                {fee.tier === "early" ? ` ${fee.daysFromCutoff === 0 ? "Last day for the early fee." : Math.abs(fee.daysFromCutoff) + " days before the cutoff."}` : ` ${fee.daysFromCutoff} day${fee.daysFromCutoff === 1 ? "" : "s"} past the cutoff. Paying earlier would have saved ${money(fee.saving)}.`}</> : "Fill in the amounts and dates to see an example."}</p>
            </div>
          </Group>
          <Group title="Reminders">
            <div className="gs-grid">
              <Field id="f-team_deposit_nudge_days" label="Nudge for deposit (days before cutoff)" error={err.team_deposit_nudge_days}><input type="number" {...P("team_deposit_nudge_days")} /></Field>
              <Field id="f-team_balance_reminder_days" label="Balance reminder (days before due)" error={err.team_balance_reminder_days}><input type="number" {...P("team_balance_reminder_days")} /></Field>
            </div>
            {sw("email_team_deposit_nudge", "Deposit nudge emails", "Remind team captains to pay the deposit before the early-fee cutoff.")}
            {sw("email_team_balance", "Balance reminder emails", "Remind team captains before the balance is due.")}
          </Group>
        </>}

        {tab === "draft" && <>
          <Group title="Pick clock">
            {sw("timer_enabled", "Enable draft timer", "Countdown clock for each pick.")}
            <div className="gs-grid">
              <Field id="f-timer_seconds" label="Seconds per pick" error={err.timer_seconds} hint="The Draft page starts with this value. You can still change it when you press Start.">
                <div className="gs-range"><input type="range" min="15" max="180" step="5" aria-label="Seconds per pick (slider)" value={Math.min(180, Math.max(15, toNum(cfg.timer_seconds) || 90))} onChange={(e) => set("timer_seconds", e.target.value)} /><input type="number" {...P("timer_seconds", { className: "gs-in short" + (err.timer_seconds ? " bad" : "") })} /></div>
              </Field>
            </div>
            <Wire ov={ov} k="timer_seconds" />
          </Group>
          <Group title="Draft format">
            <div className="gs-grid">
              <Field id="f-draft_type" label="Draft type"><select {...P("draft_type")}>{DRAFT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><Wire ov={ov} k="draft_type" /></Field>
              <Field id="f-draft_order" label="Draft order"><select {...P("draft_order")}>{DRAFT_ORDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><Wire ov={ov} k="draft_order" /></Field>
            </div>
            <p className="gs-hint">These two are saved so your choice is not lost, but the Draft page does not read them yet. Set order on the Draft page.</p>
          </Group>
        </>}

        {tab === "email" && <>
          <Group title="Automated emails">
            {sw("email_registration", "Registration confirmation", "When a player submits the registration form.")}
            {sw("email_roster", "Roster finalized", "To players and captains when rosters are published.")}
            {sw("email_payment", "Payment reminder", "To unpaid players. Reports has a manual reminder button that does work today.")}
            {sw("email_alternate", "Alternate activation", "When a sub is activated.")}
          </Group>
          <Group title="Sender">
            <div className="gs-grid">
              <Field id="f-sender_name" label="From name" error={err.sender_name}><input placeholder="Gold Rush Senior Hockey" {...P("sender_name")} /></Field>
              <Field id="f-sender_email" label="From email" error={err.sender_email} hint={`Leave blank to use the WordPress default. Best if it ends in @${ov.mail.site_domain || "your site"}.`}><input type="email" placeholder={"tournament@" + (ov.mail.site_domain || "yoursite.com")} {...P("sender_email")} /></Field>
            </div>
            <Wire ov={ov} k="sender_email" />
          </Group>
          <Group title="Check it works">
            <p className="gs-hint">Mail plugin: {ov.mail.smtp ? <strong className="gs-okt">SMTP plugin active</strong> : <strong className="gs-warn">no SMTP plugin found. Mail may go to spam.</strong>}. The test goes only to your own account address{ov.mail.to ? <> (<strong>{ov.mail.to}</strong>)</> : ""} and uses the <em>saved</em> sender{dirty ? ", so save first" : ""}.</p>
            <div className="gs-btnrow"><button className="gs-btn" onClick={sendTest} disabled={!ov.mail.to || (mail && mail.state === "sending")}>{mail && mail.state === "sending" ? "Sending…" : "Send me a test email"}</button></div>
            {mail && mail.state === "ok" && <p className="gs-okt" role="status">Sent to {mail.to}{mail.from ? " from " + mail.from : ""}. Check that it arrived and is not in spam.</p>}
            {mail && mail.state === "bad" && <p className="gs-err" role="alert">{mail.text}</p>}
          </Group>
        </>}

        {tab === "access" && <>
          <Group title="Visibility">{sw("public_rosters", "Public roster pages", "Let players view rosters without logging in.")}</Group>
          <Group title="User roles (reference only)">
            <p className="gs-hint">Roles and permissions are set in the plugin code, not here.</p>
            <div className="gs-tablewrap"><table className="gs-table"><caption className="sr">What each role can do</caption>
              <thead><tr>{["Role", "Sync import", "Edit roster", "Run draft", "Send email", "View roster", "Manage own roster"].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
              <tbody>{ROLES.map(([r, v]) => <tr key={r}><th scope="row">{r}</th>{v.map((x, i) => <td key={i} className={x ? "yes" : "no"}><span aria-hidden="true">{x ? "✓" : "—"}</span><span className="sr">{x ? "yes" : "no"}</span></td>)}</tr>)}</tbody></table></div>
            <p className="gs-hint">The GRSH admin menu currently needs a full WordPress Administrator account. A Committee or Read Only user who is not also an Administrator will not see it.</p>
          </Group>
        </>}

        {tab === "health" && <>
          <Group title="Health check">
            <ul className="gs-checks">{(ov.health || []).map((h, i) => <li key={i} className={h.level}>{h.text}{h.tab && h.level !== "ok" && <button className="gs-link" onClick={() => setTab(h.tab)}>Go there</button>}</li>)}</ul>
            <div className="gs-btnrow"><button className="gs-btn small" onClick={() => fetchAll(true)}>Re-check</button><span className="gs-hint">Based on saved settings.</span></div>
          </Group>
          <Group title="Version history (last 10 saves)">
            {(!ov.history || ov.history.length === 0) && <p className="gs-hint">No saved versions yet. The next save will be recorded here.</p>}
            <ul className="gs-hist">{(ov.history || []).map((h) => (
              <li key={h.id}>
                <details><summary><strong>{fmtStamp(h.at)}</strong> · {h.by || "unknown"} · {h.count} change{h.count === 1 ? "" : "s"}{/^Restored/.test(h.note) ? " · restore" : ""}</summary>
                  <ul className="gs-chg">{h.changes.map((c) => <li key={c.key}><span>{labelOf(c.key, cfg)}</span> <del>{show(c.key, c.from)}</del> → <ins>{show(c.key, c.to)}</ins></li>)}{h.count > h.changes.length && <li>…and {h.count - h.changes.length} more</li>}</ul>
                </details>
                {restoreId === h.id ? <span className="gs-confirm"> Put these settings back{dirty ? " (your unsaved edits will be discarded)" : ""}? <button className="gs-btn small danger" onClick={() => restore(h.id)}>Yes, restore</button><button className="gs-btn small ghost" onClick={() => setRestoreId(null)}>No</button></span>
                  : <button className="gs-btn small ghost" onClick={() => setRestoreId(h.id)}>Restore this version</button>}
              </li>))}</ul>
          </Group>
          <Group title="Back up or copy settings">
            <div className="gs-btnrow">
              <button className="gs-btn" onClick={() => saveBlob(`grsh-settings-${today}.json`, JSON.stringify(exportPayload(cfg), null, 2), "application/json")}>Download settings (JSON)</button>
              <label className="gs-btn" htmlFor="gs-import">Load settings from a file…</label><input id="gs-import" type="file" accept="application/json,.json" className="sr" onChange={onImport} />
            </div>
            {imp && <p className={imp.kind === "ok" ? "gs-okt" : "gs-err"} role={imp.kind === "ok" ? "status" : "alert"}>{imp.text}</p>}
          </Group>
          <Group title="Next season planner">
            <p className="gs-hint">A starting point for {plan.season_year}: same divisions and fees, every date moved one year. This only prepares a file. The season year is fixed in code, so switching seasons is a developer step.</p>
            <div className="gs-tablewrap"><table className="gs-table"><caption className="sr">Next season plan</caption><thead><tr><th scope="col">Setting</th><th scope="col">This season</th><th scope="col">{plan.season_year}</th></tr></thead>
              <tbody>{[["season_label"], ["registration_opens"], ["registration_closes"], ["draft_date"], ["team_fee_early_cutoff_date"], ["team_balance_due_date"]].map(([k]) => <tr key={k}><th scope="row">{FIELD_LABELS[k]}</th><td>{show(k, cfg[k])}</td><td>{show(k, plan[k])}</td></tr>)}</tbody></table></div>
            <div className="gs-btnrow"><button className="gs-btn" onClick={() => saveBlob(`grsh-next-season-${plan.season_year}.json`, JSON.stringify({ ...exportPayload({ ...cfg, ...plan }), note: "Planning file only. Not applied to the site." }, null, 2), "application/json")}>Download {plan.season_year} plan</button></div>
          </Group>
        </>}
      </div>

      {dirty && !review && (
        <div className="gs-bottom" role="region" aria-label="Unsaved changes">
          <span>{changes.length} unsaved change{changes.length === 1 ? "" : "s"}{errCount ? ` · ${errCount} problem${errCount === 1 ? "" : "s"} to fix` : ""}</span>
          <span><button className="gs-btn ghost" onClick={discard}>Discard</button><button className="gs-btn primary" disabled={errCount > 0 || saving} onClick={openReview}>Review & save</button></span>
        </div>
      )}

      {review && (
        <div className="gs-modal" role="dialog" aria-modal="true" aria-labelledby="gs-rv-t">
          <div className="gs-dlg">
            <h2 id="gs-rv-t">Review {changes.length} change{changes.length === 1 ? "" : "s"}</h2>
            <ul className="gs-chg big">{changes.map((c) => <li key={c.key}><span>{c.label}</span><span><del>{c.from}</del> → <ins>{c.to}</ins></span></li>)}</ul>
            {warnings.map((w) => <p key={w} className="gs-warn" role="alert">⚠ {w}</p>)}
            {statusChecks.length > 0 && <div className="gs-panel"><h4>Before moving to “{cfg.status}”</h4><ul className="gs-checks">{statusChecks.map((c, i) => <li key={i} className={c.level}>{c.text}</li>)}</ul></div>}
            {irreversible && <label className="gs-ack"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I understand “{cfg.status}” is meant to be final.</label>}
            <p className="gs-hint">Every save is logged with your name and kept in Version history so you can undo it.</p>
            <div className="gs-btnrow">
              <button className="gs-btn primary" disabled={saving || (irreversible && !ack)} onClick={() => save(false)}>{saving ? "Saving…" : `Save ${changes.length} change${changes.length === 1 ? "" : "s"}`}</button>
              <button className="gs-btn ghost" onClick={() => setReview(false)}>Keep editing</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function labelOf(key, cfg) {
  if (key.startsWith("divisions.")) { const [, dk, f] = key.split("."); const d = (cfg.divisions || []).find((x) => x.key === dk); return `${d ? d.label : dk} · ${f.replace("_", " ")}`; }
  return FIELD_LABELS[key] || key;
}
function show(key, v) {
  if (v === null || v === undefined || v === "") return "not set";
  if (typeof v === "boolean") return v ? "On" : "Off";
  if (/_(amount)$|^player_fee$/.test(key)) return money(v);
  if (/date$|_opens$|_closes$/.test(key)) return fmtDate(v);
  return String(v);
}

function Styles() {
  return (
    <style>{`
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap');
.gs-root{--ink:#1a1a2e;--mut:#5b5b55;--line:#dcd9cf;--bg:#f6f5f0;--gold:#d4a017;--ok:#0f6e56;--bad:#a32d2d;--warn:#8a5a0b;font-family:'Fraunces',Georgia,serif;background:var(--bg);color:var(--ink);padding:24px 28px 90px;max-width:1040px;box-sizing:border-box}
.gs-root *{box-sizing:border-box}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.gs-head{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-start;margin-bottom:16px}
.gs-eyebrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;line-height:1.5;margin:0 0 8px;position:relative}
.gs-tag{font:500 11px 'DM Mono',monospace;letter-spacing:.1em;text-transform:uppercase;background:var(--ink);color:var(--gold);padding:3px 12px;border-radius:99px}
.gs-pill{font:500 12px 'DM Mono',monospace;border:1px solid var(--line);background:#fff;padding:2px 10px;border-radius:99px;display:inline-block}
.gs-pill.green,.gs-pill.s-open{color:var(--ok);border-color:#9fe1cb;background:#e1f5ee}.gs-pill.blue,.gs-pill.s-setup{color:#185fa5;border-color:#b5d4f4;background:#e6f1fb}
.gs-pill.amber,.gs-pill.s-draft{color:var(--warn);border-color:#fac775;background:#faeeda}.gs-pill.s-locked{color:var(--bad);border-color:#f7c1c1;background:#fceBEB}.gs-pill.grey,.gs-pill.s-complete{color:var(--mut);background:#f1efe8}
.gs-root h1.gs-title{display:block;font-size:30px;line-height:1.2;font-weight:700;margin:0 0 4px;padding:0;letter-spacing:-.5px;position:relative}
.gs-in[type=text],select.gs-in{text-overflow:ellipsis}select.gs-in{min-width:0;max-width:100%}
.gs-note{font:12px 'DM Mono',monospace;color:var(--mut);margin:6px 0 0;line-height:1.5}
.gs-sub{font:13px 'DM Mono',monospace;color:var(--mut);margin:0}.gs-saved{font:12px 'DM Mono',monospace;color:var(--mut);margin:6px 0 0}
.gs-actions{display:flex;gap:8px;flex-wrap:wrap}
.gs-btn{font:500 13px 'DM Mono',monospace;border:1px solid var(--ink);background:#fff;color:var(--ink);padding:9px 16px;border-radius:8px;cursor:pointer;display:inline-block;text-decoration:none}
.gs-btn:hover:not(:disabled){background:#efede4}.gs-btn.primary{background:var(--ink);color:var(--gold)}.gs-btn.primary:hover:not(:disabled){background:#2c2c4a}
.gs-btn.ghost{border-color:var(--line);color:var(--mut)}.gs-btn.danger{border-color:var(--bad);color:var(--bad)}.gs-btn.small{padding:5px 11px;font-size:12px}
.gs-btn:disabled{opacity:.45;cursor:not-allowed}
.gs-btn:focus-visible,.gs-tab:focus-visible,.gs-in:focus-visible,.gs-sw:focus-visible,.gs-step:focus-visible,.gs-link:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #2a6df4;outline-offset:2px}
.gs-banner{border:1px solid var(--line);border-radius:8px;padding:10px 14px;margin-bottom:12px;font:13px 'DM Mono',monospace;display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between}
.gs-banner.ok{background:#e1f5ee;border-color:#9fe1cb;color:#0b5a46}.gs-banner.bad{background:#fceaea;border-color:#f0b4b4;color:#7d1f1f}.gs-bact{display:flex;gap:8px}
.gs-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
.gs-tab{font:500 13px 'DM Mono',monospace;padding:8px 16px;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--mut);cursor:pointer}
.gs-tab.on{background:var(--ink);color:var(--gold);border-color:var(--ink)}
.gs-badge{margin-left:7px;font:600 11px 'DM Mono',monospace;border-radius:99px;padding:1px 7px;color:#fff}.gs-badge.bad{background:var(--bad)}.gs-badge.warn{background:#b7791f}
.gs-card{background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden}
.gs-group{padding:18px 22px;border-bottom:1px solid #efede4}.gs-group:last-child{border-bottom:0}
.gs-gl{font:500 12px 'DM Mono',monospace;color:var(--mut);text-transform:uppercase;letter-spacing:.08em;margin:0 0 12px}
.gs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px 16px}.gs-grid.five{grid-template-columns:repeat(auto-fill,minmax(130px,1fr))}
.gs-lab{font:500 12px 'DM Mono',monospace;color:#44443f;text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:6px}
.gs-in{font:14px 'DM Mono',monospace;width:100%;min-height:38px;background:#faf9f5;border:1px solid #bdb9ab;border-radius:6px;padding:7px 10px;color:#222}
.gs-in.locked{background:#eeece4;color:var(--mut)}.gs-in.short{width:110px}.gs-in.name{font:600 16px 'Fraunces',serif;max-width:260px;background:#fff}
.gs-in.bad{border-color:var(--bad);background:#fff6f6}
.gs-hint{font:12.5px/1.45 'DM Mono',monospace;color:var(--mut);margin:5px 0 0}.gs-err{font:600 12.5px 'DM Mono',monospace;color:var(--bad);margin:5px 0 0}.gs-warn{font:600 12.5px/1.45 'DM Mono',monospace;color:var(--warn);margin:6px 0 0}.gs-okt{font:600 12.5px 'DM Mono',monospace;color:var(--ok)}
.gs-row{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:12px 0;border-bottom:1px solid #f1efe7}.gs-row:last-child{border-bottom:0}
.gs-rowlabel{font:600 15px 'Fraunces',serif;display:block}.gs-rowtxt{flex:1}
.gs-wire{display:inline-block;font:500 11px 'DM Mono',monospace;border-radius:4px;padding:2px 7px;margin-top:6px}.gs-wire.off{background:#faeeda;color:#7a4f08;border:1px solid #fac775}.gs-wire.on{color:var(--mut);padding-left:0}
.gs-sw{width:48px;height:28px;border-radius:99px;border:1px solid #9a968a;background:#e1ded3;position:relative;cursor:pointer;flex-shrink:0;padding:0}
.gs-sw span{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.3);transition:left .15s}.gs-sw.on{background:var(--ink);border-color:var(--ink)}.gs-sw.on span{left:23px}
.gs-tl{background:#f6f5f0;border-radius:10px;padding:14px 16px}.gs-tlhead{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:26px}.gs-tlnote{font:600 13px 'DM Mono',monospace}.gs-tlnote.green{color:var(--ok)}.gs-tlnote.amber{color:var(--warn)}.gs-tlnote.blue{color:#185fa5}
.gs-bar{position:relative;height:10px;background:#dedbd0;border-radius:6px;margin:0 6px 14px}.gs-bar .seg{position:absolute;top:0;bottom:0;display:block}.gs-bar .seg.green{background:#1d9e75}.gs-bar .seg.amber{background:#e8b04a}
.gs-bar .tick{position:absolute;top:-3px;width:3px;height:16px;background:var(--ink);transform:translateX(-1px)}
.gs-bar .today{position:absolute;top:-10px;width:0;height:30px;border-left:2px dashed #2a6df4;text-decoration:none}.gs-bar .today em{position:absolute;top:-14px;left:-18px;font:600 11px 'DM Mono',monospace;color:#2a6df4;font-style:normal}
.gs-tlfoot{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;font:12.5px 'DM Mono',monospace;color:var(--mut)}.gs-tlfoot strong{color:var(--ink)}
.gs-steps{list-style:none;display:flex;gap:6px;flex-wrap:wrap;padding:0;margin:0 0 6px}
.gs-step{font:500 13px 'DM Mono',monospace;border:1px solid var(--line);background:#fff;border-radius:99px;padding:6px 14px 6px 8px;cursor:pointer;display:flex;align-items:center;gap:8px;color:var(--mut)}
.gs-step .n{width:22px;height:22px;border-radius:50%;background:#e7e4da;display:inline-flex;align-items:center;justify-content:center;font-size:11px}.gs-step.done .n{background:#1d9e75;color:#fff}.gs-step.now{border-color:var(--ink);color:var(--ink);background:#f4f2ea}.gs-step.now .n{background:var(--ink);color:var(--gold)}
.gs-panel{border:1px solid var(--line);background:#faf9f5;border-radius:10px;padding:12px 16px;margin-top:10px}.gs-panel h4{margin:0 0 8px;font-size:15px}
.gs-checks{list-style:none;margin:0;padding:0}.gs-checks li{font:13px/1.4 'DM Mono',monospace;padding:5px 0 5px 24px;position:relative}
.gs-checks li:before{position:absolute;left:0;top:5px;font-weight:700}.gs-checks .ok:before{content:"✓";color:var(--ok)}.gs-checks .warn:before{content:"!";color:#b7791f}.gs-checks .block:before,.gs-checks .bad:before{content:"✕";color:var(--bad)}.gs-checks .info:before{content:"i";color:#185fa5}
.gs-checks .block,.gs-checks .bad{color:var(--bad)}
.gs-link{font:600 12px 'DM Mono',monospace;background:none;border:0;color:#185fa5;text-decoration:underline;cursor:pointer;margin-left:8px}
.gs-btnrow{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}
.gs-div{padding:16px 22px;border-bottom:1px solid #efede4}.gs-div.off{background:#fbfaf6}.gs-divhead{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px}.gs-divname{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.gs-divname code{font:11px 'DM Mono',monospace;background:#efede4;border-radius:4px;padding:2px 6px;color:var(--mut)}
.gs-cap{margin-top:12px}.gs-meter{position:relative;height:10px;border-radius:6px;background:#e5e2d8;overflow:visible}.gs-meter i{display:block;height:100%;background:#1d9e75;border-radius:6px}.gs-meter i.over{background:var(--bad)}.gs-meter b{position:absolute;top:-3px;width:2px;height:16px;background:var(--ink)}
.gs-try{margin-top:14px;padding:12px 16px;background:#f6f5f0;border-radius:10px}.gs-result{font:13.5px/1.5 'DM Mono',monospace;margin:8px 0 0}
.gs-range{display:flex;gap:12px;align-items:center}.gs-range input[type=range]{flex:1;accent-color:var(--ink)}
.gs-table{width:100%;border-collapse:collapse;font:13px 'DM Mono',monospace}.gs-table th,.gs-table td{padding:9px 12px;border-bottom:1px solid #efede4;text-align:left}.gs-table thead th{background:#faf9f5;color:#44443f;font-weight:500;text-transform:uppercase;font-size:11px;letter-spacing:.06em}
.gs-table td.yes{color:var(--ok);font-weight:700;text-align:center}.gs-table td.no{color:#8a8678;text-align:center}.gs-tablewrap{overflow-x:auto}
.gs-hist{list-style:none;padding:0;margin:0}.gs-hist>li{padding:10px 0;border-bottom:1px solid #f1efe7;font:13px 'DM Mono',monospace}.gs-hist summary{cursor:pointer;margin-bottom:6px}
.gs-chg{list-style:none;margin:6px 0 8px;padding:0 0 0 12px;font:12.5px/1.6 'DM Mono',monospace;color:#33332f}.gs-chg span:first-child{font-weight:600;margin-right:6px}del{color:var(--bad);background:#fdeeee;text-decoration:line-through;padding:0 3px}ins{color:#0b5a46;background:#e6f6ef;text-decoration:none;padding:0 3px}
.gs-chg.big{padding:0;margin:0 0 12px;max-height:46vh;overflow:auto}.gs-chg.big li{display:flex;justify-content:space-between;gap:16px;padding:8px 0;border-bottom:1px solid #efede4}
.gs-confirm{display:inline-flex;gap:8px;align-items:center;margin-left:8px;flex-wrap:wrap}
.gs-bottom{position:sticky;bottom:12px;margin-top:14px;background:var(--ink);color:#fff;border-radius:10px;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;font:13px 'DM Mono',monospace;box-shadow:0 6px 24px rgba(0,0,0,.25)}.gs-bottom .gs-btn{margin-left:8px}
.gs-modal{position:fixed;inset:0;background:rgba(20,20,40,.55);display:flex;align-items:center;justify-content:center;z-index:100000;padding:16px}.gs-dlg{background:#fff;border-radius:14px;max-width:640px;width:100%;max-height:90vh;overflow:auto;padding:22px 24px}.gs-dlg h2{margin:0 0 12px;font-size:22px}
.gs-ack{display:flex;gap:8px;align-items:center;font:13px 'DM Mono',monospace;margin:10px 0}
.gs-fail{background:#fff;border:1px solid #f0b4b4;border-radius:12px;padding:22px;max-width:560px}.gs-fail h2{margin:0 0 8px;color:var(--bad)}.gs-load{font:14px 'DM Mono',monospace;color:var(--mut)}
@media (max-width:640px){.gs-root{padding:16px 12px 90px}.gs-title{font-size:24px}}
@media print{.gs-actions,.gs-tabs,.gs-bottom{display:none}}
`}</style>
  );
}
