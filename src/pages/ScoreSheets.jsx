import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import * as I from "../lib/importEngine";
import * as E from "../lib/scoreEngine";

const API = (window.grshConfig && window.grshConfig.apiUrl) || "/wp-json/grsh/v1";
const NONCE = (window.grshConfig && window.grshConfig.nonce) || "";
const DRAFT_KEY = "grsh_ss_draft_v1";

const ICONS = {
  check: "M5 13l4 4L19 7", x: "M6 6l12 12M18 6 6 18",
  alert: "M12 8v5m0 3.5v.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  info: "M12 11v5m0-8.5v.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", print: "M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z",
  trash: "M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3", copy: "M9 9h10v11H9zM5 15V4h10", eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  up: "M6 15l6-6 6 6", down: "M6 9l6 6 6-6", plus: "M12 5v14M5 12h14", swap: "M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7",
  save: "M5 3h11l3 3v15H5zM8 3v6h8V3M8 21v-7h8v7", download: "M12 4v12m0 0 4-4m-4 4-4-4M4 20h16", cal: "M7 3v4m10-4v4M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  clock: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7", qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z",
};
function Ic({ n, s = 18 }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={ICONS[n]} /></svg>;
}
async function call(path, opts) {
  const o = opts || {};
  try {
    const res = await fetch(API + path, { ...o, headers: { "X-WP-Nonce": NONCE, ...(o.headers || {}) } });
    let j = null; try { j = await res.json(); } catch (e) { /* not json */ }
    return { ok: res.ok, status: res.status, j: j || {} };
  } catch (e) { return { ok: false, status: 0, j: { message: "Could not reach the server. Check your connection and try again." } }; }
}
const post = (path, body) => call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const saveText = (name, text) => {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const Pill = ({ tone, children }) => <span className={"gc-pill " + (tone || "mute")}>{children}</span>;

function Modal({ title, onClose, children, wide }) {
  const ref = useRef(null); const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement; const el = ref.current;
    const first = el && el.querySelector("[data-autofocus],button,input,select,textarea,[href]"); if (first) first.focus();
    const key = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== "Tab" || !el) return;
      const f = [...el.querySelectorAll("button,input,select,textarea,[href]")].filter((n) => !n.disabled); if (!f.length) return;
      const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); if (prev && prev.focus) prev.focus(); };
  }, []);
  return (
    <div className="gc-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={"gc-modal" + (wide ? " wide" : "")} role="dialog" aria-modal="true" aria-labelledby="gc-modal-t" ref={ref}>
        <div className="gc-modal-h"><h2 id="gc-modal-t" className="gc-h2">{title}</h2><button type="button" className="gc-x" aria-label="Close" onClick={onClose}><Ic n="x" /></button></div>
        {children}
      </div>
    </div>
  );
}

// Scales the 11in x 8.5in sheet down to whatever width the dialog has.
function PreviewFrame({ html }) {
  const box = useRef(null); const [scale, setScale] = useState(0.8);
  useEffect(() => {
    const el = box.current; if (!el) return undefined;
    const fit = () => { const w = el.clientWidth; if (w) setScale(Math.min(1, w / 1056)); };
    fit();
    if (typeof ResizeObserver === "undefined") { window.addEventListener("resize", fit); return () => window.removeEventListener("resize", fit); }
    const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect();
  }, []);
  return <div className="ss-prev" ref={box} style={{ height: 816 * scale }}><iframe title="Score sheet preview" sandbox="" srcDoc={html} style={{ transform: `scale(${scale})` }} /></div>;
}

function Seg({ value, onChange, name, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="ss-seg">
      {E.TYPES.map((t) => (
        <label key={t.key} className={value === t.key ? "on" : ""}><input type="radio" name={name} value={t.key} checked={value === t.key} onChange={() => onChange(t.key)} />{t.label}</label>
      ))}
    </div>
  );
}

// One game's fields. Used by the "add a game" form and by every queued game, so they always look and behave the same.
function GameFields({ v, onChange, options, arenas, idp, onEnter }) {
  const f = (k) => (e) => onChange({ [k]: e.target.value });
  const num = (k) => (e) => onChange({ [k]: Number(e.target.value) || 0 });
  const enter = (e) => { if (e.key === "Enter" && onEnter) { e.preventDefault(); onEnter(); } };
  const dl = idp + "-arenas";
  const opt = (o) => <option key={o.id} value={o.id}>{o.label}{o.level === "bad" ? "  (fix first)" : o.level === "warn" ? "  (check roster)" : ""}</option>;
  return (
    <div className="ss-fields" onKeyDown={enter}>
      <div className="ss-pair">
        <div><label className="gc-lbl" htmlFor={idp + "-h"}>Home</label>
          <select id={idp + "-h"} className="gc-select" value={v.home_id} onChange={num("home_id")}><option value={0}>Blank / TBD (write in by hand)</option>{options.map(opt)}</select></div>
        <button type="button" className="gc-btn ghost sm ss-swap" aria-label="Swap home and away" onClick={() => onChange({ home_id: v.away_id, away_id: v.home_id })}><Ic n="swap" s={16} /></button>
        <div><label className="gc-lbl" htmlFor={idp + "-a"}>Away</label>
          <select id={idp + "-a"} className="gc-select" value={v.away_id} onChange={num("away_id")}><option value={0}>Blank / TBD (write in by hand)</option>{options.map(opt)}</select></div>
      </div>
      <div className="ss-row4">
        <div><label className="gc-lbl" htmlFor={idp + "-d"}>Date</label><input id={idp + "-d"} className="gc-input" type="date" value={v.date} onChange={f("date")} /></div>
        <div><label className="gc-lbl" htmlFor={idp + "-t"}>Time</label><input id={idp + "-t"} className="gc-input" type="time" value={v.game_time} onChange={f("game_time")} /></div>
        <div><label className="gc-lbl" htmlFor={idp + "-r"}>Arena</label><input id={idp + "-r"} className="gc-input" list={dl} value={v.arena} maxLength={80} onChange={f("arena")} /><datalist id={dl}>{arenas.map((a) => <option key={a} value={a} />)}</datalist></div>
        <div><label className="gc-lbl" htmlFor={idp + "-n"}>Game #</label><input id={idp + "-n"} className="gc-input" value={v.game_no} maxLength={20} onChange={f("game_no")} /></div>
      </div>
      <Seg value={v.type} onChange={(t) => onChange({ type: t })} name={idp + "-type"} label="Game type" />
    </div>
  );
}

function GameCard({ g, i, n, options, arenas, checks, teamsById, onChange, onRemove, onDup, onMove, onPreview }) {
  const worst = checks.some((c) => c.level === "bad") ? "bad" : checks.some((c) => c.level === "warn") ? "warn" : "ok";
  return (
    <li className={"ss-game " + worst}>
      <div className="ss-game-h">
        <span className="ss-num">{i + 1}</span>
        <h3 className="gc-h3 gc-grow">{E.gameLabel(g, Object.values(teamsById))}</h3>
        <button type="button" className="gc-btn ghost sm" aria-label={`Move game ${i + 1} up`} disabled={i === 0} onClick={() => onMove(g.uid, -1)}><Ic n="up" s={14} /></button>
        <button type="button" className="gc-btn ghost sm" aria-label={`Move game ${i + 1} down`} disabled={i === n - 1} onClick={() => onMove(g.uid, 1)}><Ic n="down" s={14} /></button>
        <button type="button" className="gc-btn ghost sm" onClick={() => onPreview(g)}><Ic n="eye" s={14} /> Preview</button>
        <button type="button" className="gc-btn ghost sm" aria-label={`Duplicate game ${i + 1}`} onClick={() => onDup(g.uid)}><Ic n="copy" s={14} /></button>
        <button type="button" className="gc-btn ghost sm" aria-label={`Remove game ${i + 1}`} onClick={() => onRemove(g.uid)}><Ic n="trash" s={14} /></button>
      </div>
      <GameFields v={g} onChange={(p) => onChange(g.uid, p)} options={options} arenas={arenas} idp={"q" + g.uid} />
      {checks.length ? <ul className="ss-checks">{checks.map((c, k) => <li key={k} className={c.level}><Ic n={c.level === "info" ? "info" : "alert"} s={14} /> <span>{c.text}</span></li>)}</ul> : null}
    </li>
  );
}

function loadDraft() {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY); if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || !Array.isArray(d.queue)) return null;
    return { queue: d.queue.slice(0, E.MAX_GAMES).map((g) => E.blankGame({ ...g, uid: undefined })), options: { ...E.DEFAULT_OPTIONS, ...(d.options || {}) } };
  } catch (e) { return null; }
}

export default function ScoreSheets() {
  const [ov, setOv] = useState(null); const [err, setErr] = useState(""); const [loading, setLoading] = useState(true);
  const draft = useRef(loadDraft());
  const [queue, setQueue] = useState(draft.current ? draft.current.queue : []);
  const [options, setOptions] = useState(draft.current ? draft.current.options : E.DEFAULT_OPTIONS);
  const [tab, setTab] = useState("build"); const [addTab, setAddTab] = useState("one");
  const [includeDraft, setIncludeDraft] = useState(false);
  const [one, setOne] = useState(() => E.blankGame());
  const [series, setSeries] = useState({ count: 4, date: "", start: "", gap: 75, arena: "", firstNo: "", type: "REG" });
  const [paste, setPaste] = useState(""); const [parsed, setParsed] = useState(null);
  const [picked, setPicked] = useState([]);
  const [modal, setModal] = useState(null); const [toasts, setToasts] = useState([]);
  const [batchName, setBatchName] = useState("");
  const [preview, setPreview] = useState(null); const [record, setRecord] = useState(null);
  const formRef = useRef(null); const reqId = useRef(0); const boot = useRef(false);

  const toast = useCallback((msg, tone) => {
    const id = Date.now() + Math.random(); setToasts((t) => [...t, { id, msg, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const load = useCallback(async (quiet) => {
    const id = ++reqId.current; if (!quiet) setLoading(true);
    const r = await call("/score-sheets/overview");
    if (id !== reqId.current) return;
    setLoading(false);
    if (!r.ok) { setErr(r.j.message || "Could not load the score sheet tool. Nothing was changed."); return; }
    setErr(""); setOv(r.j);
  }, []);
  useEffect(() => { load(false); }, [load]);

  // Keep the working queue across refreshes.
  useEffect(() => {
    try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ queue: queue.map(({ uid, ...rest }) => rest), options })); } catch (e) { /* storage blocked: the queue still works */ }
  }, [queue, options]);

  // A QR code on a printed sheet opens this page with ?sheet=<print id>-<game number>.
  useEffect(() => {
    if (boot.current) return; boot.current = true;
    const s = new URLSearchParams(window.location.search).get("sheet");
    if (s) openRecord(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const teams = ov ? ov.teams : [];
  const teamsById = useMemo(() => { const m = {}; teams.forEach((t) => { m[t.id] = t; }); return m; }, [teams]);
  const opts = useMemo(() => E.teamOptions(teams, includeDraft || queue.some((g) => [g.home_id, g.away_id].some((id) => teamsById[id] && teamsById[id].type === "draft"))), [teams, includeDraft, queue, teamsById]);
  const checks = useMemo(() => E.checkQueue(queue, teams), [queue, teams]);
  const sum = useMemo(() => E.queueSummary(queue, teams), [queue, teams]);
  const counts = useMemo(() => E.sheetCount(queue, options), [queue, options]);
  const arenas = ov ? ov.arenas : [];
  const canPrint = !!(ov && ov.season.exists && queue.length && !sum.tooMany);

  const patch = (uid, p) => setQueue((q) => q.map((g) => (g.uid === uid ? { ...g, ...p } : g)));
  const remove = (uid) => setQueue((q) => q.filter((g) => g.uid !== uid));
  const dup = (uid) => setQueue((q) => { const i = q.findIndex((g) => g.uid === uid); if (i < 0 || q.length >= E.MAX_GAMES) return q; const c = { ...q[i], uid: E.newUid(), game_no: E.nextGameNo(q[i].game_no) }; return [...q.slice(0, i + 1), c, ...q.slice(i + 1)]; });
  const move = (uid, d) => setQueue((q) => { const i = q.findIndex((g) => g.uid === uid); const j = i + d; if (i < 0 || j < 0 || j >= q.length) return q; const c = q.slice(); [c[i], c[j]] = [c[j], c[i]]; return c; });
  const addGames = (games, msg) => {
    const room = E.MAX_GAMES - queue.length;
    if (room <= 0) { toast(`The queue is full (${E.MAX_GAMES} games). Print or remove some first.`, "bad"); return; }
    setQueue((q) => [...q, ...games.slice(0, room)]);
    toast(games.length > room ? `Added ${room} of ${games.length} games. The queue holds ${E.MAX_GAMES}.` : msg || `Added ${I.plural(games.length, "game")}.`, games.length > room ? "bad" : "");
  };

  const addOne = () => {
    if (one.home_id && one.home_id === one.away_id) { toast("Home and away must be different teams.", "bad"); return; }
    addGames([E.blankGame({ ...one, uid: undefined })], "Added " + E.gameLabel(one, teams) + ".");
    setOne((o) => ({ ...o, home_id: 0, away_id: 0, game_no: E.nextGameNo(o.game_no), game_time: o.game_time }));
  };
  const addSeries = () => {
    const s = E.buildSeries({ count: series.count, date: series.date, start: series.start, gap: series.gap, arena: series.arena, firstNo: series.firstNo, type: series.type });
    if (!s.length) { toast("Enter how many games to add.", "bad"); return; }
    addGames(s, `Added ${I.plural(s.length, "game")}. Choose the teams on each card.`);
    setSeries((x) => ({ ...x, firstNo: E.nextGameNo(s[s.length - 1].game_no) }));
  };
  const readPaste = () => setParsed(E.parseSchedule(paste, teams, { arena: one.arena, type: one.type }));
  const addParsed = () => { if (parsed && parsed.games.length) { addGames(parsed.games); setParsed(null); setPaste(""); } };
  const events = ov && ov.schedule ? ov.schedule.events : [];
  const addPicked = () => {
    const evs = events.filter((e) => picked.includes(e.id));
    addGames(evs.map((e) => E.eventToGame(e, one.type)));
    setPicked([]);
  };

  const saveBatch = async () => {
    const name = batchName.trim(); if (!name) return;
    const r = await post("/score-sheets/batch-save", E.savePayload(name, queue, options));
    toast(r.j.message || (r.ok ? "Saved." : "Could not save."), r.ok && r.j.success ? "" : "bad");
    if (r.ok && r.j.success) { setModal(null); load(true); }
  };
  const deleteBatch = async (id) => {
    const r = await post("/score-sheets/batch-delete", { id });
    toast(r.ok ? "Batch deleted." : r.j.message || "Could not delete.", r.ok ? "" : "bad"); setModal(null); load(true);
  };
  const useGames = (games, opt, replace) => {
    setQueue((q) => (replace ? games : [...q, ...games].slice(0, E.MAX_GAMES)));
    if (opt) setOptions({ ...E.DEFAULT_OPTIONS, ...opt });
    setModal(null); setTab("build");
  };
  const askLoad = (games, opt, dropped, label) => {
    if (!games.length) { toast(dropped ? "Every game in that batch uses a team that is gone." : "That batch has no games.", "bad"); return; }
    const note = dropped ? ` ${I.plural(dropped, "game")} used a team that no longer exists and was left out.` : "";
    if (!queue.length) { useGames(games, opt, true); toast(`Loaded ${label}.${note}`, dropped ? "bad" : ""); return; }
    setModal({ t: "load", games, opt, note, label });
  };
  const loadBatch = (b) => { const r = E.loadBatch(b, teams); askLoad(r.games, b.options, r.dropped, `"${b.name}"`); };
  const reloadRun = (l) => {
    const r = E.loadBatch({ matchups: (l.games || []).map((g) => ({ home_id: g.home_id, away_id: g.away_id, date: g.date, game_time: g.game_time, arena: g.arena, game_no: g.game_no, type: g.type })) }, teams);
    askLoad(r.games, l.options, r.dropped, "that print run");
  };

  const openPreview = async (g) => {
    setPreview({ loading: true, g });
    const r = await post("/score-sheets/preview", { matchup: { home_id: g.home_id, away_id: g.away_id, date: g.date, game_time: g.game_time, arena: g.arena, game_no: g.game_no, type: g.type }, options });
    setPreview(r.ok && r.j.success ? { g, html: r.j.html, skipped: r.j.skipped || [] } : { g, error: r.j.message || "Could not build the preview." });
  };
  async function openRecord(sid) {
    const m = String(sid).match(/^(p[a-z0-9]+)(?:-(\d+))?$/i);
    if (!m) { toast("That QR code is not a print record.", "bad"); return; }
    setRecord({ loading: true });
    const r = await call("/score-sheets/record?id=" + encodeURIComponent(m[1]));
    setRecord(r.ok && r.j.success ? { rec: r.j.record, n: m[2] ? Number(m[2]) : 0 } : { error: r.j.message || "Could not find that print record." });
  }

  const doPrint = () => {
    setModal(null);
    if (!formRef.current) return;
    formRef.current.submit();
    toast("Opened the score sheets in a new tab. If nothing appeared, allow pop-ups for this site.");
    window.setTimeout(() => load(true), 2500);
  };
  const askPrint = () => { if (!canPrint) return; if (sum.bad || sum.warn) setModal({ t: "print" }); else doPrint(); };
  const payload = E.printPayload(queue, options);
  const setOpt = (p) => setOptions((o) => ({ ...o, ...p }));
  const tplCsv = "Date,Time,Home,Away,Arena,Game #,Type\n2027-01-16,7:30 PM,Team Name,Other Team,Tahoe Ice,1,Regular\n";

  if (loading && !ov) return <div className="gc"><style>{CSS}</style><div className="gc-wrap"><p className="gc-sub" role="status" style={{ padding: 40 }}><span className="gc-spin" /> Loading teams and rosters…</p></div></div>;
  if (err && !ov) return <div className="gc"><style>{CSS}</style><div className="gc-wrap"><div className="gc-card" role="alert"><h2 className="gc-h2">Print Score Sheets did not load</h2><p>{err}</p><p className="gc-sub">Nothing was changed.</p><button type="button" className="gc-btn" onClick={() => load(false)}>Try again</button></div></div></div>;

  const tabs = [["build", "Build a batch", queue.length], ["batches", "Saved batches", ov.batches.length], ["history", "Print history", ov.log.length]];
  const bad = checks.reduce((n, c) => n + c.filter((x) => x.level === "bad").length, 0);

  return (
    <div className="gc">
      <style>{CSS}</style>
      <header className="gc-hero">
        <div className="gc-hero-in">
          <div>
            <p className="gc-kicker">Gold Rush Senior Hockey</p>
            <h1 className="gc-h1">Print Score Sheets</h1>
            <p className="gc-lead">Line up the games, check each roster, then print. Rosters, numbers, captains and goalies fill in on their own.</p>
            <span className="gc-last"><Ic n="cal" s={15} /> Season {ov.season.year || "not set"}{ov.season.exists ? "" : " (missing)"} · {I.plural(teams.length, "team")}</span>
          </div>
          <div className="gc-hero-btns"><button type="button" className="gc-btn onnavy" onClick={() => load(true)}><Ic n="refresh" s={16} /> Refresh rosters</button></div>
        </div>
      </header>

      <div className="gc-wrap">
        {err ? <p className="gc-alert bad" role="alert"><Ic n="alert" s={16} /> {err}</p> : null}
        {!ov.season.exists ? <p className="gc-alert bad" role="alert"><Ic n="alert" s={16} /> <span>The season in Settings ({ov.season.year || "none"}) does not exist, so no teams can be listed. Fix it in Settings first. Blank sheets are not available either.</span></p> : null}

        <div className={"gc-verdict " + (sum.bad ? "warn" : sum.games ? "ok" : "info")} role="status">
          <span className="gc-vic"><Ic n={sum.games && !sum.bad ? "check" : sum.bad ? "alert" : "info"} /></span>
          <div className="gc-grow"><h2 className="gc-h3">{sum.text}</h2><p>{sum.games ? `${I.plural(counts.sheets, "sheet")}, ${I.plural(counts.pages, "page")} to print${options.back ? " (two-sided)" : ""}.` : "Add games below, paste a schedule, or load a saved batch."}{sum.tooMany ? ` The limit is ${E.MAX_GAMES} games per print.` : ""}</p></div>
          <button type="button" className="gc-btn gold" disabled={!canPrint} onClick={askPrint}><Ic n="print" s={16} /> Print {sum.games ? I.plural(counts.sheets, "sheet") : "score sheets"}</button>
        </div>

        <div className="gc-tabs" role="tablist" aria-label="Score sheet sections">
          {tabs.map(([k, l, n]) => (
            <button key={k} type="button" role="tab" id={"gc-tab-" + k} aria-selected={tab === k} aria-controls={"gc-panel-" + k} tabIndex={tab === k ? 0 : -1} className="gc-tab" onClick={() => setTab(k)}
              onKeyDown={(e) => { const ks = tabs.map((x) => x[0]); const i = ks.indexOf(k); if (e.key === "ArrowRight") setTab(ks[(i + 1) % ks.length]); if (e.key === "ArrowLeft") setTab(ks[(i + ks.length - 1) % ks.length]); }}>
              {l}{n ? <span className="gc-badge">{n}</span> : null}
            </button>
          ))}
        </div>

        {tab === "build" ? (
          <div role="tabpanel" id="gc-panel-build" aria-labelledby="gc-tab-build" className="ss-two">
            <section className="gc-card ss-add" aria-labelledby="ss-add-t">
              <h2 id="ss-add-t" className="gc-h2">Add games</h2>
              <div className="ss-addtabs" role="tablist" aria-label="Ways to add games">
                {[["one", "One game"], ["series", "Time slots"], ["paste", "Paste schedule"], ...(ov.schedule.available ? [["sched", "Site schedule"]] : [])].map(([k, l]) => (
                  <button key={k} type="button" role="tab" aria-selected={addTab === k} className={"ss-addtab" + (addTab === k ? " on" : "")} onClick={() => setAddTab(k)}>{l}</button>
                ))}
              </div>
              <label className="gc-check"><input type="checkbox" checked={includeDraft} onChange={(e) => setIncludeDraft(e.target.checked)} /> Include draft-format teams in the lists</label>

              {addTab === "one" ? (
                <div>
                  <GameFields v={one} onChange={(p) => setOne((o) => ({ ...o, ...p }))} options={opts} arenas={arenas} idp="one" onEnter={addOne} />
                  <div className="gc-actions"><button type="button" className="gc-btn gold" onClick={addOne}><Ic n="plus" s={16} /> Add to batch</button></div>
                  <p className="gc-sub">After each add, the teams clear and the game number counts up. Date, time and arena stay.</p>
                </div>
              ) : null}

              {addTab === "series" ? (
                <div className="ss-fields">
                  <p className="gc-sub">Adds a run of games on one date with the times stepped for you. Pick the teams on each card afterwards.</p>
                  <div className="ss-row4">
                    <div><label className="gc-lbl" htmlFor="se-c">How many</label><input id="se-c" className="gc-input" type="number" min="1" max={E.MAX_GAMES} value={series.count} onChange={(e) => setSeries({ ...series, count: e.target.value })} /></div>
                    <div><label className="gc-lbl" htmlFor="se-d">Date</label><input id="se-d" className="gc-input" type="date" value={series.date} onChange={(e) => setSeries({ ...series, date: e.target.value })} /></div>
                    <div><label className="gc-lbl" htmlFor="se-s">First puck drop</label><input id="se-s" className="gc-input" type="time" value={series.start} onChange={(e) => setSeries({ ...series, start: e.target.value })} /></div>
                    <div><label className="gc-lbl" htmlFor="se-g">Minutes apart</label><input id="se-g" className="gc-input" type="number" min="0" max="600" step="5" value={series.gap} onChange={(e) => setSeries({ ...series, gap: e.target.value })} /></div>
                  </div>
                  <div className="ss-row4">
                    <div className="ss-span2"><label className="gc-lbl" htmlFor="se-a">Arena</label><input id="se-a" className="gc-input" list="se-arenas" value={series.arena} onChange={(e) => setSeries({ ...series, arena: e.target.value })} /><datalist id="se-arenas">{arenas.map((a) => <option key={a} value={a} />)}</datalist></div>
                    <div><label className="gc-lbl" htmlFor="se-n">First game #</label><input id="se-n" className="gc-input" value={series.firstNo} onChange={(e) => setSeries({ ...series, firstNo: e.target.value })} /></div>
                  </div>
                  <Seg value={series.type} onChange={(t) => setSeries({ ...series, type: t })} name="se-type" label="Game type" />
                  <div className="gc-actions"><button type="button" className="gc-btn gold" onClick={addSeries}><Ic n="plus" s={16} /> Add {I.plural(Math.max(0, Math.floor(Number(series.count) || 0)), "game")}</button></div>
                </div>
              ) : null}

              {addTab === "paste" ? (
                <div>
                  <p className="gc-sub">Paste rows from Excel or a CSV: date, time, home, away, arena, game #, type. Team names are matched for you; use TBD for a blank side.</p>
                  <label className="gc-lbl" htmlFor="ss-paste">Schedule rows</label>
                  <textarea id="ss-paste" className="gc-input ss-ta" rows={6} value={paste} onChange={(e) => { setPaste(e.target.value); setParsed(null); }} placeholder="2027-01-16, 7:30 PM, Team Ann, Team Bo, Tahoe Ice, 7" />
                  <div className="gc-actions">
                    <button type="button" className="gc-btn" disabled={!paste.trim()} onClick={readPaste}>Check the rows</button>
                    <button type="button" className="gc-link" onClick={() => saveText("score-sheet-schedule-template.csv", tplCsv)}><Ic n="download" s={14} /> Template CSV</button>
                  </div>
                  {parsed ? (
                    <div className="ss-parsed" role="status">
                      <p><b>{I.plural(parsed.games.length, "game")} read</b>{parsed.problems.length ? `, ${I.plural(parsed.problems.length, "row")} need fixing` : ""}.</p>
                      {parsed.problems.length ? <ul className="gc-res">{parsed.problems.map((p) => <li key={p.line}><Pill tone="bad">line {p.line}</Pill> {p.reason}</li>)}</ul> : null}
                      <button type="button" className="gc-btn gold" disabled={!parsed.games.length} onClick={addParsed}>Add {I.plural(parsed.games.length, "game")}{parsed.problems.length ? " (skip the problem rows)" : ""}</button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {addTab === "sched" ? (
                <div>
                  <p className="gc-sub">Upcoming games from the site schedule (SportsPress). Only games where both team names match a GRSH team can be added.</p>
                  {events.length ? (
                    <ul className="ss-events">
                      {events.map((e) => {
                        const okE = (e.home_id || /^(tbd|blank)$/i.test(e.home_name)) && (e.away_id || /^(tbd|blank)$/i.test(e.away_name));
                        return (
                          <li key={e.id}><label className={"gc-opt" + (picked.includes(e.id) ? " on" : "")}>
                            <input type="checkbox" disabled={!okE} checked={picked.includes(e.id)} onChange={() => setPicked((p) => (p.includes(e.id) ? p.filter((x) => x !== e.id) : [...p, e.id]))} />
                            <span><b>{e.home_name} vs {e.away_name}</b> <span className="gc-sub">{E.prettyDate(e.date)} {E.prettyTime(e.time)}{e.arena ? " · " + e.arena : ""}</span>{okE ? null : <span className="gc-neg"> team name does not match</span>}</span>
                          </label></li>
                        );
                      })}
                    </ul>
                  ) : <p className="gc-empty">No upcoming games on the site schedule.</p>}
                  <div className="gc-actions"><button type="button" className="gc-btn gold" disabled={!picked.length} onClick={addPicked}>Add {I.plural(picked.length, "selected game")}</button>
                    {events.length ? <button type="button" className="gc-link" onClick={() => setPicked(events.filter((e) => e.home_id && e.away_id).map((e) => e.id))}>Select all that match</button> : null}</div>
                </div>
              ) : null}
            </section>

            <div>
              <section className="gc-card" aria-labelledby="ss-q-t">
                <div className="gc-card-h"><h2 id="ss-q-t" className="gc-h2">Queued games ({queue.length})</h2>
                  <span className="gc-grow" />
                  <button type="button" className="gc-btn ghost sm" disabled={!queue.length} onClick={() => { setBatchName(""); setModal({ t: "save" }); }}><Ic n="save" s={14} /> Save batch</button>
                  <button type="button" className="gc-btn ghost sm" disabled={!queue.length} onClick={() => setModal({ t: "clear" })}><Ic n="trash" s={14} /> Clear</button></div>
                {queue.length ? (
                  <ul className="ss-games">
                    {queue.map((g, i) => <GameCard key={g.uid} g={g} i={i} n={queue.length} options={opts} arenas={arenas} checks={checks[i] || []} teamsById={teamsById} onChange={patch} onRemove={remove} onDup={dup} onMove={move} onPreview={openPreview} />)}
                  </ul>
                ) : <div className="gc-empty"><p><b>No games yet.</b></p><p className="gc-sub">Use Add games on the left. Your list is kept if you leave this page.</p></div>}
              </section>

              <section className="gc-card" aria-labelledby="ss-o-t">
                <h2 id="ss-o-t" className="gc-h2">Print options</h2>
                <div className="ss-opts">
                  <div><span className="gc-lbl" id="ss-font-l">Text size</span>
                    <div className="ss-seg" role="radiogroup" aria-labelledby="ss-font-l">{[["normal", "Normal"], ["large", "Large (easier to write on)"]].map(([k, l]) => <label key={k} className={options.font === k ? "on" : ""}><input type="radio" name="ss-font" checked={options.font === k} onChange={() => setOpt({ font: k })} />{l}</label>)}</div></div>
                  <div><label className="gc-lbl" htmlFor="ss-order">Print order</label>
                    <select id="ss-order" className="gc-select" value={options.order} onChange={(e) => setOpt({ order: e.target.value })}><option value="queue">As listed above</option><option value="time">By date and time</option><option value="arena">By arena, then time</option></select></div>
                  <div><label className="gc-lbl" htmlFor="ss-spares">Blank spare sheets</label><input id="ss-spares" className="gc-input" type="number" min="0" max="10" value={options.spares} onChange={(e) => setOpt({ spares: Math.min(10, Math.max(0, Number(e.target.value) || 0)) })} /></div>
                </div>
                <label className="gc-check"><input type="checkbox" checked={options.back} onChange={(e) => setOpt({ back: e.target.checked })} /> Back page with a goal log and extra penalty rows (print two-sided)</label>
                <label className="gc-check"><input type="checkbox" checked={options.cover} onChange={(e) => setOpt({ cover: e.target.checked })} /> Cover page listing every game</label>
                <p className="gc-sub"><Ic n="qr" s={13} /> Every sheet carries a small QR code. Scanning it while logged in opens a record of the roster as it was printed.{ov.qr_ready ? "" : " (The QR script file is missing, so codes will not appear.)"}</p>
              </section>
            </div>
          </div>
        ) : null}

        {tab === "batches" ? (
          <div role="tabpanel" id="gc-panel-batches" aria-labelledby="gc-tab-batches" className="gc-card">
            <p className="gc-note">A saved batch keeps the games and print options so you can print the same day again next week. Teams that have since been removed are left out when you load one.</p>
            {ov.batches.length ? <ul className="ss-list">{ov.batches.map((b) => (
              <li key={b.id}><div className="gc-grow"><b>{b.name}</b><span className="gc-sub">{I.plural(b.matchups.length, "game")} · saved {I.fmtStamp(b.saved_at)}</span></div>
                <button type="button" className="gc-btn" onClick={() => loadBatch(b)}>Load</button>
                <button type="button" className="gc-btn ghost" aria-label={`Delete ${b.name}`} onClick={() => setModal({ t: "delbatch", b })}><Ic n="trash" s={15} /></button></li>
            ))}</ul> : <div className="gc-empty"><p>No saved batches yet. Build a list, then press Save batch.</p></div>}
          </div>
        ) : null}

        {tab === "history" ? (
          <div role="tabpanel" id="gc-panel-history" aria-labelledby="gc-tab-history" className="gc-card">
            <p className="gc-note">The last {10} print runs. Each keeps the rosters exactly as they were printed.</p>
            {ov.log.length ? <ul className="ss-list">{ov.log.map((l) => (
              <li key={l.id}><div className="gc-grow"><b>{I.plural(l.count, "sheet")}</b> <span className="gc-sub">{I.fmtStamp(l.at)} · {l.by}{l.skipped ? ` · ${l.skipped} skipped` : ""}</span>
                <span className="gc-sub">{(l.games || []).slice(0, 3).map((g) => `${g.home || "Blank"} vs ${g.away || "Blank"}`).join(" · ")}{(l.games || []).length > 3 ? ` · +${l.games.length - 3} more` : ""}</span></div>
                <button type="button" className="gc-btn" onClick={() => reloadRun(l)}>Print again</button>
                <button type="button" className="gc-btn ghost" onClick={() => openRecord(l.id)}>View rosters</button></li>
            ))}</ul> : <div className="gc-empty"><p>Nothing has been printed yet.</p></div>}
          </div>
        ) : null}

        {tab === "build" && queue.length ? (
          <div className="gc-sticky ss-bar">
            <span aria-live="polite"><b>{I.plural(counts.sheets, "sheet")}</b> · {I.plural(counts.pages, "page")}{sum.bad ? ` · ${I.plural(bad, "problem")}` : ""}</span>
            <span className="gc-grow" />
            <button type="button" className="gc-btn gold" disabled={!canPrint} onClick={askPrint}><Ic n="print" s={16} /> Print</button>
          </div>
        ) : null}
      </div>

      <form ref={formRef} method="post" action={ov.print_url} target="_blank" style={{ display: "none" }}>
        <input type="hidden" name="action" value="grsh_print_score_sheets" />
        <input type="hidden" name="grsh_print_nonce" value={ov.print_nonce} />
        <input type="hidden" name="matchups" value={payload.matchups} />
        <input type="hidden" name="options" value={payload.options} />
      </form>

      {modal && modal.t === "print" ? (
        <Modal title="Check before printing" onClose={() => setModal(null)}>
          <p>{sum.bad ? `${I.plural(sum.bad, "game")} will probably not print correctly.` : ""} {sum.warn ? `${I.plural(sum.warn, "game")} ${sum.warn === 1 ? "has" : "have"} roster notes.` : ""} The same notes also appear at the top of the print page.</p>
          <ul className="ss-checks big">{queue.flatMap((g, i) => (checks[i] || []).filter((c) => c.level !== "info").map((c, k) => <li key={i + "-" + k} className={c.level}><Ic n="alert" s={14} /> <span><b>Game {i + 1}:</b> {c.text}</span></li>))}</ul>
          <div className="gc-actions"><button type="button" className="gc-btn gold" data-autofocus onClick={doPrint}><Ic n="print" s={16} /> Print anyway</button><button type="button" className="gc-btn ghost" onClick={() => setModal(null)}>Go back and fix</button></div>
        </Modal>
      ) : null}
      {modal && modal.t === "clear" ? (
        <Modal title="Clear the whole queue?" onClose={() => setModal(null)}>
          <p>This removes all {queue.length} games from the list. Saved batches are not touched.</p>
          <div className="gc-actions"><button type="button" className="gc-btn danger" data-autofocus onClick={() => { setQueue([]); setModal(null); }}>Clear {I.plural(queue.length, "game")}</button><button type="button" className="gc-btn ghost" onClick={() => setModal(null)}>Keep them</button></div>
        </Modal>
      ) : null}
      {modal && modal.t === "save" ? (
        <Modal title="Save this batch" onClose={() => setModal(null)}>
          <label className="gc-lbl" htmlFor="ss-bn">Name</label>
          <input id="ss-bn" data-autofocus className="gc-input" value={batchName} maxLength={60} placeholder="Saturday day 1" onChange={(e) => setBatchName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveBatch(); }} />
          <p className="gc-sub">Saving with a name you already used updates that batch.</p>
          <div className="gc-actions"><button type="button" className="gc-btn gold" disabled={!batchName.trim()} onClick={saveBatch}>Save</button><button type="button" className="gc-btn ghost" onClick={() => setModal(null)}>Cancel</button></div>
        </Modal>
      ) : null}
      {modal && modal.t === "delbatch" ? (
        <Modal title={`Delete "${modal.b.name}"?`} onClose={() => setModal(null)}>
          <p>This removes the saved batch. It does not change your current list.</p>
          <div className="gc-actions"><button type="button" className="gc-btn danger" data-autofocus onClick={() => deleteBatch(modal.b.id)}>Delete batch</button><button type="button" className="gc-btn ghost" onClick={() => setModal(null)}>Keep it</button></div>
        </Modal>
      ) : null}
      {modal && modal.t === "load" ? (
        <Modal title="You already have games queued" onClose={() => setModal(null)}>
          <p>Load {modal.label}: replace your {I.plural(queue.length, "queued game")} or add to them?{modal.note}</p>
          <div className="gc-actions"><button type="button" className="gc-btn gold" data-autofocus onClick={() => useGames(modal.games, modal.opt, true)}>Replace the list</button><button type="button" className="gc-btn" onClick={() => useGames(modal.games, null, false)}>Add to the list</button><button type="button" className="gc-btn ghost" onClick={() => setModal(null)}>Cancel</button></div>
        </Modal>
      ) : null}

      {preview ? (
        <Modal title="Sheet preview" onClose={() => setPreview(null)} wide>
          {preview.loading ? <p className="gc-sub" role="status"><span className="gc-spin" /> Building the preview…</p> : preview.error ? <p className="gc-alert bad" role="alert"><Ic n="alert" s={16} /> {preview.error}</p> : (
            <>
              {preview.skipped && preview.skipped.length ? <p className="gc-alert bad" role="alert"><Ic n="alert" s={16} /> <span>This game would not print: {preview.skipped[0].reason}.</span></p> : null}
              <PreviewFrame html={preview.html} />
              <p className="gc-sub">This is the front of the sheet as it will print. Header rows are dark: turn on "Background graphics" in the print dialog.</p>
            </>
          )}
          <div className="gc-actions"><button type="button" className="gc-btn ghost" data-autofocus onClick={() => setPreview(null)}>Close</button></div>
        </Modal>
      ) : null}

      {record ? (
        <Modal title="Print record" onClose={() => setRecord(null)} wide>
          {record.loading ? <p className="gc-sub" role="status"><span className="gc-spin" /> Looking it up…</p> : record.error ? <p className="gc-alert bad" role="alert"><Ic n="alert" s={16} /> {record.error}</p> : (
            <>
              <p>Printed {I.fmtStamp(record.rec.at)} by {record.rec.by}. {I.plural(record.rec.count, "sheet")}.</p>
              {(() => {
                const g = record.n ? record.rec.games[record.n - 1] : null;
                const sides = g ? [[g.home, g.home_id], [g.away, g.away_id]] : Object.entries(record.rec.rosters || {}).map(([id, r]) => [r.name, Number(id)]);
                return (
                  <>
                    {g ? <p><b>Game {record.n}: {g.home || "Blank"} vs {g.away || "Blank"}</b><br /><span className="gc-sub">{E.prettyDate(g.date)} {E.prettyTime(g.game_time)}{g.arena ? " · " + g.arena : ""}{g.game_no ? " · game #" + g.game_no : ""}</span></p> : null}
                    <div className="ss-rec">{sides.map(([name, id]) => { const r = (record.rec.rosters || {})[id]; return (
                      <div key={id || name}><h3 className="gc-h3">{name || "Blank"}</h3>
                        {r ? <table className="ss-roster"><thead><tr><th scope="col">#</th><th scope="col">Name</th></tr></thead><tbody>{r.players.map((p, k) => <tr key={k}><td>{p[0] === null || p[0] === undefined ? "—" : p[0]}</td><td>{p[1]}{p[2] === "G" ? " (G)" : ""}</td></tr>)}</tbody></table> : <p className="gc-sub">Blank side: filled in by hand.</p>}
                      </div>); })}</div>
                    <p className="gc-sub">This is the roster as printed. If the paper sheet disagrees, the paper was edited or printed from an older version.</p>
                  </>
                );
              })()}
            </>
          )}
          <div className="gc-actions"><button type="button" className="gc-btn ghost" data-autofocus onClick={() => setRecord(null)}>Close</button></div>
        </Modal>
      ) : null}

      <div className="gc-toasts" role="status" aria-live="polite">{toasts.map((t) => <div key={t.id} className={"gc-toast" + (t.tone === "bad" ? " bad" : "")}>{t.msg}</div>)}</div>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=DM+Mono:wght@400;500&display=swap');
.gc{--navy:#1a1a2e;--gold:#d4a017;--goldt:#7a5a05;--cream:#f6f5f0;--line:#e3e0d6;--mut:#55556a;--ok:#1f6f46;--okb:#e6f4ec;--warn:#85540a;--warnb:#fdf3dc;--bad:#b3261e;--badb:#fdeceb;--info:#27578f;--infob:#e8f0fa;
 font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:14px;line-height:1.55;color:var(--navy);background:var(--cream);margin:0 -20px;padding:0 20px 56px;min-height:100vh;box-sizing:border-box}
.gc *,.gc *::before,.gc *::after{box-sizing:border-box}
.gc button,.gc select,.gc input,.gc textarea{font-family:inherit;font-size:inherit;color:inherit}
.gc button:focus-visible,.gc select:focus-visible,.gc input:focus-visible,.gc textarea:focus-visible,.gc [tabindex]:focus-visible,.gc a:focus-visible,.gc summary:focus-visible{outline:3px solid var(--gold);outline-offset:2px}
.gc-wrap{max-width:1180px;margin:0 auto}
.gc-hero{background:linear-gradient(135deg,#1a1a2e 0%,#2a2a4a 100%);color:#fff;border-radius:0 0 18px 18px;margin:0 -20px 22px;padding:30px 20px 26px;position:relative;overflow:hidden}
.gc-hero::after{content:"";position:absolute;right:-60px;top:-60px;width:260px;height:260px;border-radius:50%;background:radial-gradient(circle,rgba(212,160,23,.35),transparent 70%)}
.gc-hero-in{max-width:1180px;margin:0 auto;display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end;justify-content:space-between;position:relative;z-index:1}
.gc-kicker{color:#f0cf6e;font-size:12px;letter-spacing:.14em;text-transform:uppercase;margin:0 0 6px}
.gc-h1{font-family:'Fraunces',Georgia,serif;font-size:34px;line-height:1.1;margin:0 0 8px;font-weight:700;color:#fff}
.gc-lead{margin:0;color:#e4e4ee;max-width:640px}
.gc-last{margin-top:12px;display:inline-flex;gap:8px;align-items:center;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:5px 14px;font-size:13px;color:#fff}
.gc-h2{font-family:'Fraunces',Georgia,serif;font-size:21px;margin:0;font-weight:600;color:var(--navy)}
.gc-h3{font-family:'Fraunces',Georgia,serif;font-size:17px;margin:0;font-weight:600}
.gc-sub{color:var(--mut);font-size:13px}
.gc-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin-bottom:20px}
.gc-stat{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px;display:flex;gap:12px;align-items:center;min-height:84px}
.gc-stat-ic{width:40px;height:40px;border-radius:11px;background:var(--cream);color:var(--goldt);display:grid;place-items:center;flex:none}
.gc-stat-n{font-family:'Fraunces',Georgia,serif;font-size:27px;font-weight:700;line-height:1}
.gc-stat-l{color:var(--mut);font-size:13px;margin-top:3px}.gc-stat-s{color:var(--mut);font-size:12px}
.gc-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:20px;margin-bottom:20px}
.gc-card-h{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:baseline;justify-content:space-between;margin-bottom:12px}
.gc-covwrap{overflow-x:auto}
.gc-cov{border-collapse:separate;border-spacing:4px;width:100%;min-width:420px}
.gc-cov th{font-weight:500;text-align:left;font-size:13px;color:var(--mut);padding:4px 8px}
.gc-cov td{text-align:center;border-radius:8px;padding:8px;font-weight:500;background:#f1efe7;color:var(--mut)}
.gc-cov td.h1{background:#f6e7b5}.gc-cov td.h2{background:#efcf6c}.gc-cov td.h3{background:#e2b73a}.gc-cov td.h4{background:#d4a017;color:var(--navy)}
.gc-cov td.h1,.gc-cov td.h2,.gc-cov td.h3{color:var(--navy)}
.gc-gap{font-size:12px;font-weight:400}
.gc-note{margin:10px 0 0;color:var(--mut);font-size:13px}
.gc-tabs{display:flex;gap:4px;border-bottom:2px solid var(--line);margin-bottom:20px;overflow-x:auto}
.gc-tab{background:none;border:0;padding:12px 18px;cursor:pointer;color:var(--mut);font-weight:500;border-bottom:3px solid transparent;margin-bottom:-2px;white-space:nowrap;display:inline-flex;gap:8px;align-items:center;min-height:44px}
.gc-tab[aria-selected=true]{color:var(--navy);border-bottom-color:var(--gold)}
.gc-tab:hover{color:var(--navy)}
.gc-badge{background:var(--navy);color:#fff;border-radius:999px;padding:0 8px;font-size:12px;line-height:20px}
.gc-steps{display:flex;gap:6px;margin:0 0 20px;padding:0;list-style:none;flex-wrap:wrap}
.gc-step{display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:#fff;border:1px solid var(--line);color:var(--mut);font-size:13px}
.gc-step b{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--cream);font-size:12px}
.gc-step.on{border-color:var(--navy);color:var(--navy);font-weight:500}.gc-step.on b{background:var(--navy);color:#fff}
.gc-step.done b{background:var(--ok);color:#fff}
.gc-grid2{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:20px}
@media(max-width:900px){.gc-grid2{grid-template-columns:1fr}.gc-h1{font-size:28px}}
.gc-drop{border:2px dashed #b9b49f;border-radius:16px;background:#fff;padding:34px 20px;text-align:center;cursor:pointer;transition:border-color .15s,background .15s}
.gc-drop:hover,.gc-drop.over{border-color:var(--gold);background:#fffaf0}
.gc-drop-ic{width:56px;height:56px;border-radius:16px;background:var(--navy);color:var(--gold);display:grid;place-items:center;margin:0 auto 12px}
.gc-drop strong{display:block;font-family:'Fraunces',Georgia,serif;font-size:19px;font-weight:600;margin-bottom:4px}
.gc-or{display:flex;align-items:center;gap:12px;color:var(--mut);margin:16px 0;font-size:13px}.gc-or::before,.gc-or::after{content:"";flex:1;height:1px;background:var(--line)}
.gc-ta{width:100%;min-height:96px;border:1px solid #b9b49f;border-radius:10px;padding:10px;background:#fff;resize:vertical}
.gc-btn{border:0;border-radius:10px;padding:10px 18px;cursor:pointer;font-weight:500;display:inline-flex;gap:8px;align-items:center;justify-content:center;min-height:44px;background:var(--navy);color:#fff;transition:transform .1s,background .15s}
.gc-btn:hover:not(:disabled){background:#2d2d52}.gc-btn:active:not(:disabled){transform:translateY(1px)}
.gc-btn.gold{background:var(--gold);color:var(--navy)}.gc-btn.gold:hover:not(:disabled){background:#e3b12b}
.gc-btn.ghost{background:#fff;color:var(--navy);border:1px solid #b9b49f}.gc-btn.ghost:hover:not(:disabled){background:var(--cream)}
.gc-btn.danger{background:var(--bad)}.gc-btn.danger:hover:not(:disabled){background:#8f1d17}
.gc-btn.onnavy{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.3)}.gc-btn.onnavy:hover{background:rgba(255,255,255,.2)}
.gc-btn:disabled{opacity:.5;cursor:not-allowed}
.gc-link{background:none;border:0;color:var(--navy);text-decoration:underline;cursor:pointer;padding:6px;min-height:32px}.gc-link:disabled{opacity:.5;cursor:default;text-decoration:none}
.gc-file{display:flex;gap:12px;align-items:center;flex-wrap:wrap;background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px 16px;margin-bottom:16px}
.gc-file-ic{width:40px;height:40px;border-radius:10px;background:var(--cream);display:grid;place-items:center;color:var(--goldt)}
.gc-file-meta{flex:1;min-width:160px}.gc-file-meta b{display:block;word-break:break-all}
.gc-sec{border-top:1px solid var(--line);padding:18px 0 4px;margin-top:16px}
.gc-sec-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.gc-verdict{display:flex;gap:14px;align-items:flex-start;border-radius:14px;padding:16px 18px;border:1px solid}
.gc-verdict.ok{background:var(--okb);border-color:#a9d6bd}.gc-verdict.warn{background:var(--warnb);border-color:#ecd093}.gc-verdict.bad{background:var(--badb);border-color:#efb3ae}.gc-verdict.info{background:var(--infob);border-color:#b6cdea}
.gc-verdict h3{margin:0 0 2px}.gc-verdict p{margin:0;color:#33334a}
.gc-vic{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;color:#fff;flex:none}
.ok .gc-vic{background:var(--ok)}.warn .gc-vic{background:var(--warn)}.bad .gc-vic{background:var(--bad)}.info .gc-vic{background:var(--info)}
.gc-bar{display:flex;height:14px;border-radius:7px;overflow:hidden;background:var(--line);margin:16px 0 8px}
.gc-bar i{display:block;min-width:3px}
.gc-bar .insert{background:#2e9e6b}.gc-bar .update{background:#3b78c4}.gc-bar .unchanged{background:#a7a79c}.gc-bar .skip{background:#d9a21b}.gc-bar .error{background:#c9453b}
.gc-legend{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13px;color:#33334a;margin:0 0 4px;padding:0;list-style:none}
.gc-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px}
.gc-opts{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin-top:8px}
.gc-opt{border:2px solid var(--line);border-radius:12px;padding:12px 14px;cursor:pointer;display:block;background:#fff}
.gc-opt:has(input:checked){border-color:var(--navy);background:#fbfaf5}
.gc-opt:has(input:focus-visible){outline:3px solid var(--gold);outline-offset:2px}
.gc-opt input{margin-right:8px;accent-color:var(--navy)}
.gc-opt b{font-weight:500}.gc-opt span{display:block;color:var(--mut);font-size:13px;margin-top:2px;padding-left:24px}
.gc-select{border:1px solid #b9b49f;border-radius:8px;padding:8px 10px;background:#fff;min-height:40px;max-width:100%}
.gc-input{border:1px solid #b9b49f;border-radius:8px;padding:8px 12px;background:#fff;min-height:40px;min-width:0}
.gc-tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px;margin-top:10px;background:#fff}
.gc-table{width:100%;border-collapse:collapse;font-size:13px}
.gc-table th{text-align:left;font-weight:500;color:var(--mut);background:#faf9f4;padding:10px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
.gc-table td{padding:10px 12px;border-bottom:1px solid #efede4;vertical-align:top}
.gc-table tr:last-child td{border-bottom:0}
.gc-strong{font-weight:500;display:block}.gc-sm{display:block;font-size:12px;color:var(--mut)}.gc-dim{color:var(--mut)}
.gc-detail{min-width:200px;max-width:420px}
.gc-diff{margin:0 0 4px;padding:0;list-style:none}.gc-diff li{background:var(--infob);border-radius:6px;padding:2px 8px;margin-bottom:3px;display:inline-block}
.gc-pill{display:inline-block;border-radius:999px;padding:1px 10px;font-size:12px;font-weight:500;border:1px solid transparent;white-space:nowrap}
.gc-pill.ok{background:var(--okb);color:var(--ok)}.gc-pill.warn{background:var(--warnb);color:var(--warn)}.gc-pill.bad{background:var(--badb);color:var(--bad)}.gc-pill.info{background:var(--infob);color:var(--info)}.gc-pill.mute{background:#eeece4;color:#4a4a5c}
.gc-chips{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}
.gc-chip{background:#fff;border:1px solid #b9b49f;border-radius:999px;padding:6px 14px;cursor:pointer;min-height:36px}
.gc-chip.on{background:var(--navy);border-color:var(--navy);color:#fff}.gc-chip b{font-weight:500;margin-left:4px}
.gc-pager{display:flex;gap:14px;align-items:center;justify-content:center;margin-top:12px}
.gc-alert{display:flex;gap:8px;align-items:flex-start;border-radius:10px;padding:10px 12px;margin:8px 0;font-size:13px}
.gc-alert.bad{background:var(--badb);color:#7d1a14}.gc-alert.warn{background:var(--warnb);color:#6b4308}.gc-alert.info{background:var(--infob);color:#1d4573}
.gc-alert svg{flex:none;margin-top:2px}
.gc-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:18px}
.gc-spin{width:16px;height:16px;border-radius:50%;border:2px solid #b9b49f;border-top-color:var(--navy);animation:gc-sp .8s linear infinite;display:inline-block}
@keyframes gc-sp{to{transform:rotate(360deg)}}
.gc-done{text-align:center;padding:10px 0 4px}
.gc-done-ic{width:64px;height:64px;border-radius:50%;background:var(--ok);color:#fff;display:grid;place-items:center;margin:0 auto 12px;animation:gc-pop .4s ease-out}
@keyframes gc-pop{0%{transform:scale(.4);opacity:0}100%{transform:scale(1);opacity:1}}
.gc-counts{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:18px 0}
.gc-count{background:var(--cream);border-radius:12px;padding:12px}.gc-count b{display:block;font-family:'Fraunces',Georgia,serif;font-size:26px}
.gc-unlock{text-align:left;max-width:640px;margin:0 auto;padding:0;list-style:none}
.gc-unlock li{display:flex;gap:10px;margin:8px 0;align-items:flex-start}.gc-unlock svg{color:var(--ok);flex:none;margin-top:3px}
.gc-guide{width:100%}
.gc-guide summary{cursor:pointer;font-weight:500;min-height:32px}
.gc-guide dl{margin:10px 0 0}.gc-guide dt{font-weight:500;margin-top:10px}.gc-guide dd{margin:0;color:var(--mut);font-size:13px}
.gc-req{color:var(--bad);font-size:12px;margin-left:6px}
.gc-bar-f{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px}
.gc-bar-f .grow{flex:1;min-width:200px;position:relative}.gc-bar-f .grow input{width:100%;padding-left:36px}.gc-bar-f .grow svg{position:absolute;left:10px;top:11px;color:var(--mut)}
.gc-log{border:1px solid var(--line);border-radius:14px;background:#fff;padding:16px;margin-bottom:12px}
.gc-log-h{display:flex;flex-wrap:wrap;gap:8px 14px;justify-content:space-between;align-items:flex-start}
.gc-log.undone{opacity:.75}
.gc-log ul{margin:8px 0 0;padding-left:20px;color:#33334a;font-size:13px}
.gc-empty{text-align:center;padding:40px 16px;color:var(--mut)}.gc-empty .gc-drop-ic{background:var(--cream);color:var(--goldt)}
.gc-scrim{position:fixed;inset:0;background:rgba(26,26,46,.55);display:grid;place-items:center;z-index:100000;padding:16px}
.gc-modal{background:#fff;border-radius:16px;padding:24px;width:100%;max-width:480px;max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.35)}
.gc-modal.wide{max-width:640px}.gc-modal p{margin:10px 0}
.gc-toasts{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:100001;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none}
.gc-toast{background:var(--navy);color:#fff;border-radius:10px;padding:10px 18px;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:90vw;animation:gc-up .25s ease-out}
.gc-toast.bad{background:var(--bad)}
@keyframes gc-up{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}
.gc-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media(prefers-reduced-motion:reduce){.gc *,.gc *::before,.gc *::after{animation:none!important;transition:none!important}}

.gc-hero-btns{display:flex;gap:10px;flex-wrap:wrap;position:relative;z-index:1}
.gc-health{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 20px}
.gc-chip2{display:inline-flex;gap:6px;align-items:center;border-radius:999px;padding:4px 12px;font-size:13px;border:1px solid}
.gc-chip2.ok{background:var(--okb);color:var(--ok);border-color:#a9d6bd}.gc-chip2.bad{background:var(--badb);color:#8f1d17;border-color:#efb3ae}
.gc-fun{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.gc-fun-step{background:var(--cream);border:2px solid transparent;border-radius:14px;padding:12px 14px;text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:2px}
.gc-fun-step:hover{border-color:#cfc9b4}.gc-fun-step.on{border-color:var(--navy);background:#fff}
.gc-fun-n{font-family:'Fraunces',Georgia,serif;font-size:28px;font-weight:700;line-height:1}
.gc-fun-l{font-weight:500}.gc-fun-p{color:var(--mut);font-size:12px}
.gc-fun-bar{display:block;height:6px;border-radius:3px;background:#e4e1d4;margin:6px 0 2px;overflow:hidden}.gc-fun-bar i{display:block;height:100%;background:var(--gold)}
.gc-dots{display:inline-flex;gap:4px}.gc-dots i{width:10px;height:10px;border-radius:50%;background:#dcd8c8}.gc-dots i.on{background:var(--ok)}
.gc-inline{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px}
.gc-grow{flex:1;min-width:0}.gc-search{position:relative;min-width:200px}.gc-search input{width:100%;padding-left:36px}.gc-search svg{position:absolute;left:10px;top:11px;color:var(--mut)}
.gc-check{display:inline-flex;gap:8px;align-items:center;cursor:pointer}.gc-check input{accent-color:var(--navy);width:16px;height:16px}
.gc-a{color:var(--navy);text-decoration:underline}
.gc-prog{position:relative;height:30px;border-radius:8px;background:var(--cream);overflow:hidden;margin:12px 0}.gc-prog i{position:absolute;inset:0 auto 0 0;background:#efcf6c;transition:width .2s}.gc-prog span{position:relative;display:block;text-align:center;line-height:30px;font-size:13px}
.gc-res{margin:8px 0;padding:0;list-style:none;font-size:13px}.gc-res li{margin:4px 0}
.gc-issues{margin:0;padding:0;list-style:none}.gc-issue{display:flex;gap:12px;align-items:flex-start;padding:14px 4px;border-bottom:1px solid var(--line)}.gc-issue:last-child{border-bottom:0}
.gc-issue-ic{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;flex:none;color:#fff}.gc-issue.bad .gc-issue-ic{background:var(--bad)}.gc-issue.warn .gc-issue-ic{background:var(--warn)}.gc-issue.info .gc-issue-ic{background:var(--info)}
.gc-issue-b{flex:1;min-width:0}.gc-issue-b p{margin:2px 0 6px;color:#33334a;font-size:13px}
a.gc-btn{text-decoration:none}
.gc-badge.hot{background:var(--bad)}

.gc{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.gc-hero,.gc-hero *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.gc-lbl{display:block;font-weight:500;margin:10px 0 4px}
.gc-pre{white-space:pre-wrap;background:var(--cream);border:1px solid var(--line);border-radius:10px;padding:12px;font-size:13px;margin:8px 0;max-height:240px;overflow:auto}
.gc-det{margin:12px 0;border:1px solid var(--line);border-radius:10px;padding:8px 12px;background:#fff}.gc-det summary{cursor:pointer;min-height:32px;display:flex;align-items:center}
.gc-dl{display:grid;grid-template-columns:120px 1fr;gap:6px 12px;margin:14px 0}.gc-dl dt{color:var(--mut)}.gc-dl dd{margin:0}
.gc-neg{color:var(--bad);font-weight:500}
.gc-x{background:none;border:0;cursor:pointer;width:44px;height:44px;border-radius:10px;display:grid;place-items:center;color:var(--navy)}.gc-x:hover{background:var(--cream)}
.gc-modal-h{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.gc-mails{list-style:none;margin:8px 0;padding:0;max-height:200px;overflow:auto}.gc-mails li{padding:6px 0;border-bottom:1px solid var(--line)}.gc-mails li:last-child{border-bottom:0}
.gc-pl{margin:8px 0;max-height:260px;overflow:auto}
.gc-pl .gc-opt{display:flex;gap:10px;align-items:center;margin:6px 0;padding:10px 12px}.gc-pl .gc-opt.on{border-color:var(--navy);background:#fbfaf5}
.gc-pl .gc-opt span:nth-child(2){flex:1;min-width:0;word-break:break-word}
.gc-hero-btns{display:flex;gap:10px;flex-wrap:wrap;position:relative;z-index:1}
.gc-health{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 20px}
.gc-chip2{display:inline-flex;gap:6px;align-items:center;border-radius:999px;padding:4px 12px;font-size:13px;border:1px solid;background:#fff;cursor:default}
button.gc-chip2{cursor:pointer;min-height:32px}
.gc-chip2.ok{background:var(--okb);color:var(--ok);border-color:#a9d6bd}.gc-chip2.bad{background:var(--badb);color:#8f1d17;border-color:#efb3ae}.gc-chip2.mute{background:#eeece4;color:#33334a;border-color:#d4d0c0}
.gc-verdict{margin-bottom:14px;align-items:center}.gc-grow{flex:1;min-width:0}
.gc-fun{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.gc-fun-step{background:var(--cream);border:2px solid transparent;border-radius:14px;padding:12px 14px;text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:2px}
.gc-fun-step:hover{border-color:#cfc9b4}.gc-fun-step.on{border-color:var(--navy);background:#fff}
.gc-fun-n{font-family:'Fraunces',Georgia,serif;font-size:28px;font-weight:700;line-height:1}
.gc-fun-l{font-weight:500}.gc-fun-p{color:var(--mut);font-size:12px}
.gc-fun-bar{display:block;height:6px;border-radius:3px;background:#e4e1d4;margin:6px 0 2px;overflow:hidden}.gc-fun-bar i{display:block;height:100%;background:var(--gold)}
.gc-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
@media(max-width:900px){.gc-two{grid-template-columns:1fr}}
.gc-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.gc-tile{background:var(--cream);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:2px}
.gc-tile-n{font-family:'Fraunces',Georgia,serif;font-size:24px;font-weight:700;line-height:1.1}.gc-tile-l{color:var(--mut);font-size:13px}
.gc-dv{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px}
.gc-dv-h{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-bottom:4px}.gc-dv-h b{flex:1}
.gc-dv-bar{display:block;height:8px;border-radius:4px;background:#e4e1d4;overflow:hidden}.gc-dv-bar i{display:block;height:100%;background:var(--ok)}.gc-dv-bar i.warn{background:var(--warn)}.gc-dv-bar i.info{background:var(--info)}
.gc-acts{list-style:none;margin:0;padding:0}
.gc-act{display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)}.gc-act:last-child{border-bottom:0}
.gc-act .gc-grow{display:flex;flex-direction:column}
.gc-act-n{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;flex:none;color:#fff;font-weight:500;background:var(--info)}
.gc-act.bad .gc-act-n{background:var(--bad)}.gc-act.warn .gc-act-n{background:var(--warn)}
.gc-teams{list-style:none;margin:12px 0 18px;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.gc-team{border:1px solid var(--line);border-radius:14px;padding:14px;background:#fff;display:flex;flex-direction:column;gap:8px}
.gc-team.test{border-style:dashed;border-color:#d9a21b;background:#fffdf5}
.gc-team-h{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.gc-team-name{background:none;border:0;padding:0;font-family:'Fraunces',Georgia,serif;font-size:18px;font-weight:600;text-align:left;cursor:pointer;text-decoration:underline;text-decoration-color:var(--gold);text-underline-offset:4px;min-height:32px}
.gc-team-cap{margin:0;display:flex;flex-direction:column;gap:2px;align-items:flex-start}
.gc-team-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.gc-team-next{margin:0;font-size:13px;color:#33334a}
.gc-btn.sm{min-height:32px;padding:4px 10px;font-size:13px}
.gc-dots{display:inline-flex;gap:4px}.gc-dots i{width:10px;height:10px;border-radius:50%;background:#dcd8c8}.gc-dots i.on{background:var(--ok)}
.gc-sm{display:block;color:var(--mut);font-size:12px;word-break:break-all}.gc-strong{font-weight:500}.gc-dim{color:var(--mut)}
.gc-inline{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px}
.gc-search{position:relative;min-width:200px}.gc-search input{width:100%;padding-left:36px}.gc-search svg{position:absolute;left:10px;top:13px;color:var(--mut)}
.gc-check{display:inline-flex;gap:8px;align-items:center;cursor:pointer;min-height:32px}.gc-check input{accent-color:var(--navy);width:16px;height:16px}
.gc-a{color:var(--navy);text-decoration:underline}
.gc-prog{position:relative;height:30px;border-radius:8px;background:var(--cream);overflow:hidden;margin:12px 0}.gc-prog i{position:absolute;inset:0 auto 0 0;background:#efcf6c;transition:width .2s}.gc-prog span{position:relative;display:block;text-align:center;line-height:30px;font-size:13px}
.gc-res{margin:8px 0;padding:0;list-style:none;font-size:13px}.gc-res li{margin:4px 0}
.gc-issues{margin:0;padding:0;list-style:none}.gc-issue{display:flex;gap:12px;align-items:flex-start;padding:14px 4px;border-bottom:1px solid var(--line)}.gc-issue:last-child{border-bottom:0}
.gc-issue-ic{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;flex:none;color:#fff}.gc-issue.bad .gc-issue-ic{background:var(--bad)}.gc-issue.warn .gc-issue-ic{background:var(--warn)}.gc-issue.info .gc-issue-ic{background:var(--info)}
.gc-issue-b{flex:1;min-width:0}.gc-issue-b p{margin:2px 0 6px;color:#33334a;font-size:13px}
a.gc-btn{text-decoration:none}.gc-badge.hot{background:var(--bad)}
.gc-clean{list-style:none;margin:0;padding:0}.gc-clean li{border-bottom:1px solid var(--line)}.gc-clean li:last-child{border-bottom:0}
.gc-clean-row{display:flex;gap:12px;align-items:flex-start;padding:10px 4px;cursor:pointer}.gc-clean-row input{margin-top:4px;width:18px;height:18px;accent-color:var(--bad)}
.gc-clean-row .gc-grow{display:flex;flex-direction:column;gap:2px}.gc-why{color:var(--warn)}
.gc-sticky{position:sticky;bottom:0;display:flex;gap:12px;align-items:center;flex-wrap:wrap;background:#fff;border-top:2px solid var(--line);margin:18px -20px -20px;padding:12px 20px;border-radius:0 0 16px 16px}
.gc-scrim.side{place-items:stretch end;padding:0}
.gc-modal.drawer{max-width:440px;width:100%;height:100%;max-height:100vh;border-radius:16px 0 0 16px;animation:gc-in .2s ease-out}
@keyframes gc-in{from{transform:translateX(30px);opacity:0}to{transform:none;opacity:1}}
.gc-tl{list-style:none;margin:14px 0;padding:0}.gc-tl li{display:flex;gap:12px;align-items:flex-start;padding:6px 0;position:relative;color:var(--mut)}
.gc-tl li.on{color:var(--navy)}
.gc-tl li:not(:last-child)::before{content:"";position:absolute;left:10px;top:28px;bottom:-6px;width:2px;background:var(--line)}
.gc-tl-dot{width:22px;height:22px;border-radius:50%;border:2px solid #cfcab6;display:grid;place-items:center;flex:none;background:#fff;color:#fff}.gc-tl li.on .gc-tl-dot{background:var(--ok);border-color:var(--ok)}
.gc-danger-zone{margin-top:18px;border:1px dashed #d9a21b;border-radius:12px;padding:12px}.gc-lock{margin-top:18px}
@media(max-width:600px){.gc-modal.drawer{max-width:100%;border-radius:0}.gc-dl{grid-template-columns:1fr}.gc-verdict{flex-wrap:wrap}.gc-act{flex-wrap:wrap}}
@media(prefers-reduced-motion:reduce){.gc *{animation:none!important;transition:none!important}}
@media print{.gc-scrim,.gc-toasts{display:none}}

.gc-modal.wide{max-width:min(980px,96vw)}
.ss-two{display:grid;grid-template-columns:minmax(320px,400px) minmax(0,1fr);gap:20px;align-items:start}
.ss-two>div,.ss-two>section{min-width:0}
@media(max-width:1000px){.ss-two{grid-template-columns:1fr}}
.ss-add{position:sticky;top:44px}
@media(max-width:1000px){.ss-add{position:static}}
.ss-addtabs{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}
.ss-addtab{border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 14px;cursor:pointer;min-height:36px}
.ss-addtab.on{background:var(--navy);color:#fff;border-color:var(--navy)}
.ss-fields{display:flex;flex-direction:column;gap:6px}
.ss-pair{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:8px;align-items:end}
.ss-pair .gc-select{width:100%}
.ss-swap{margin-bottom:2px}
.ss-row4{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}
.ss-row4 .gc-input,.ss-row4 .gc-select{width:100%}
.ss-span2{grid-column:span 2}
.ss-seg{display:flex;flex-wrap:wrap;gap:0;margin:8px 0 2px;border:1px solid var(--line);border-radius:10px;overflow:hidden;width:fit-content;max-width:100%}
.ss-seg label{padding:7px 14px;cursor:pointer;border-right:1px solid var(--line);background:#fff;min-height:36px;display:flex;align-items:center}
.ss-seg label:last-child{border-right:0}.ss-seg label.on{background:var(--navy);color:#fff}
.ss-seg input{position:absolute;opacity:0;pointer-events:none}.ss-seg label:focus-within{outline:3px solid var(--gold);outline-offset:-3px}
.ss-ta{width:100%;font-family:'DM Mono',ui-monospace,monospace;font-size:13px}
.ss-parsed{margin-top:12px;border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--cream)}
.ss-events{list-style:none;margin:10px 0;padding:0;max-height:320px;overflow:auto}
.ss-games{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-direction:column;gap:14px}
.ss-game{border:1px solid var(--line);border-left:6px solid var(--ok);border-radius:14px;padding:14px;background:#fff}
.ss-game.warn{border-left-color:var(--warn)}.ss-game.bad{border-left-color:var(--bad)}
.ss-game-h{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px}
.ss-num{width:28px;height:28px;border-radius:50%;background:var(--navy);color:#fff;display:grid;place-items:center;flex:none;font-weight:500}
.ss-checks{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:4px;font-size:13px}
.ss-checks li{display:flex;gap:8px;align-items:flex-start;border-radius:8px;padding:5px 9px}
.ss-checks svg{flex:none;margin-top:3px}
.ss-checks .bad{background:var(--badb);color:#7d1a14}.ss-checks .warn{background:var(--warnb);color:#6b4308}.ss-checks .info{background:var(--infob);color:#1d4573}
.ss-checks.big{max-height:300px;overflow:auto}
.ss-opts{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:8px}
.ss-list{list-style:none;margin:0;padding:0}.ss-list li{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px 2px;border-bottom:1px solid var(--line)}.ss-list li:last-child{border-bottom:0}
.ss-list .gc-grow{display:flex;flex-direction:column;gap:2px}
.ss-prev{position:relative;width:100%;overflow:hidden;border:1px solid var(--line);border-radius:10px;background:#fff}
.ss-prev iframe{position:absolute;left:0;top:0;width:1056px;height:816px;border:0;transform-origin:0 0;background:#fff}
.ss-rec{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin:10px 0}
.ss-roster{width:100%;border-collapse:collapse;font-size:13px}.ss-roster th,.ss-roster td{border-bottom:1px solid var(--line);padding:3px 8px;text-align:left}.ss-roster th{background:var(--cream)}
.gc-sticky.ss-bar{position:sticky;bottom:12px;margin:14px 0 0;border:2px solid var(--line);border-radius:14px;box-shadow:0 6px 24px rgba(26,26,46,.18);z-index:4}
@media(max-width:600px){.ss-pair{grid-template-columns:1fr}.ss-swap{justify-self:center}}
`;
