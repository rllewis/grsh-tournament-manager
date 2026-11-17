// Draft.jsx — v3
// The draft now lives on the server: picks are saved to the rosters as they happen, the clock is server-side,
// and captains can pick from their phones. No mock data — if something is wrong, the page says so.
//
// Features: preflight that can fail · live parity meter with pick preview · best-fit suggestions · TV mode ·
//           mock draft · pick clock + undo + trades · captain phone links · publish + recap.

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { computeScore, formatReturningBadge, TIER_DESCRIPTIONS } from "../lib/playerScoring";

const API   = window.grshConfig?.apiUrl || "/wp-json/grsh/v1";
const NONCE = window.grshConfig?.nonce  || "";

const F_HEAD = "'Fraunces',Georgia,serif";
const F_NUM  = "'DM Mono',monospace";
const F_UI   = "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
const INK = "#1a1a2e", MUTED = "#555566", SOFT = "#6b6b7b", LINE = "#E2E0D8", PAPER = "#F6F5F0", GOLD = "#D4A017";

const POS_LABEL = { defenseman:"Defense", center:"Center", winger:"Wing", goaltender:"Goalie" };
const POS_COLOR = {
  defenseman:{ bg:"#E8F0FE", color:"#1A3F8F" }, center:{ bg:"#E8F8EF", color:"#1A5C35" },
  winger:{ bg:"#FDF3E8", color:"#7A4A18" },     goaltender:{ bg:"#FCE8E8", color:"#7A1818" },
};
const TIER_COLOR = (t) => {
  if (!t) return { bg:"#F3F4F6", color:"#4B5563" };
  const f = t[0];
  if (f==="A") return { bg:"#FCE8E8", color:"#7A1818" };
  if (f==="B") return { bg:"#FEF0E8", color:"#7A4518" };
  if (f==="C") return { bg:"#FEF9E7", color:"#6B4E0E" };
  return { bg:"#E8F0FE", color:"#1A3F8F" };
};
const BAND = {
  balanced:  { label:"Balanced",  color:"#166534", bg:"#DCFCE7" },
  review:    { label:"Review",    color:"#92400E", bg:"#FEF3C7" },
  rebalance: { label:"Rebalance", color:"#991B1B", bg:"#FEE2E2" },
  none:      { label:"—",         color:SOFT,      bg:"#F3F4F6" },
};

// ─── Scoring / engine helpers ────────────────────────────────────────────────
const tierOf  = (p) => p.skill_tier_assigned || p.skill_tier_reported || "";
const scoreOf = (p) => computeScore(tierOf(p), p.years_experience || 0, 0);

function teamStats(teams, MAX) {
  const rows = teams.map(t => {
    const sc  = t.players.map(scoreOf);
    const raw = sc.length ? sc.reduce((a,b)=>a+b,0)/sc.length : null;
    return { id:t.id, n:sc.length, raw, norm: raw===null ? null : raw/MAX*100, goalies:t.players.filter(p=>p.is_goalie).length };
  });
  const withP = rows.filter(r=>r.raw!==null);
  const divRaw = withP.length ? withP.reduce((a,r)=>a+r.raw,0)/withP.length : null;
  rows.forEach(r => {
    r.parity = (r.raw===null || divRaw===null || divRaw<=0) ? null : Math.max(0, Math.min(100, 80 - Math.abs(r.raw-divRaw)/divRaw*60));
  });
  return { rows, divRaw };
}
const bandOf = (par, th) => par===null || par===undefined ? "none"
  : (par < th.rebalance_low || par > th.rebalance_high) ? "rebalance"
  : (par < th.review_low || par > th.review_high) ? "review" : "balanced";

// Rank the pool for one team: best score, adjusted for goalie need, positional balance and parity pull.
function bestFit(team, teams, pool, picksLeft, divRaw) {
  const tp = team.players, n = tp.length;
  const sum = tp.reduce((a,p)=>a+scoreOf(p),0);
  const avg = n ? sum/n : null;
  const target = divRaw ?? (pool.length ? pool.reduce((a,p)=>a+scoreOf(p),0)/pool.length : 0);
  const goalies = tp.filter(p=>p.is_goalie).length;
  const cnt = (t,pos) => t.players.filter(p=>p.position===pos).length;
  const avgCnt = (pos) => teams.reduce((a,t)=>a+cnt(t,pos),0)/Math.max(1,teams.length);
  return pool.map(p => {
    const s = scoreOf(p); const reasons = [`Score ${s.toFixed(1)}`]; let fit = s;
    if (p.is_goalie) {
      if (goalies===0) { const urgent = picksLeft<=2; fit += urgent?30:10; reasons.push(urgent?"No goalie yet and few picks left":"Fills the goalie spot"); }
      else { fit -= 20; reasons.push("Team already has a goalie"); }
    } else if (p.position) {
      const adj = Math.max(-2, Math.min(2, avgCnt(p.position)-cnt(team,p.position)))*1.5;
      fit += adj; if (adj>=1.5) reasons.push(`Short on ${POS_LABEL[p.position].toLowerCase()}`);
    }
    if (avg!==null) {
      const gain = Math.abs(avg-target) - Math.abs((sum+s)/(n+1)-target);
      fit += gain*4;
      if (gain>0.3) reasons.push("Moves team toward the division average");
      else if (gain<-0.3) reasons.push("Pulls team away from the division average");
    }
    return { player:p, fit, reasons };
  }).sort((a,b)=>b.fit-a.fit);
}

function simulate(teams, pool, slots, made, MAX) {
  const T = teams.map(t=>({ ...t, players:[...t.players] })); let P = [...pool];
  for (let i=made; i<slots.length && P.length; i++) {
    const t = T.find(x=>x.id===slots[i]); if (!t) continue;
    const { divRaw } = teamStats(T, MAX);
    const best = bestFit(t, T, P, slots.slice(i).filter(id=>id===t.id).length, divRaw)[0];
    t.players.push(best.player); P = P.filter(p=>p.id!==best.player.id);
  }
  return T;
}

// ─── Small UI pieces ─────────────────────────────────────────────────────────
function Pill({ bg, color, children, title }) {
  return <span title={title} style={{ display:"inline-block", background:bg, color, fontSize:12, fontFamily:F_UI, fontWeight:600,
    padding:"1px 8px", borderRadius:99, whiteSpace:"nowrap" }}>{children}</span>;
}
const btnDark  = { fontFamily:F_UI, fontSize:14, fontWeight:700, background:INK, color:GOLD, border:"none", padding:"9px 16px", borderRadius:8, cursor:"pointer" };
const btnLight = { fontFamily:F_UI, fontSize:14, background:"#fff", color:MUTED, border:`1px solid ${LINE}`, padding:"9px 14px", borderRadius:8, cursor:"pointer" };
const btnDanger= { ...btnLight, background:"#FEF2F2", color:"#991B1B", border:"1px solid #FCA5A5" };
const inp = { fontFamily:F_UI, fontSize:14, background:PAPER, border:`1px solid ${LINE}`, borderRadius:6, padding:"7px 10px", color:INK, outline:"none", width:"100%", boxSizing:"border-box" };
const lbl = { fontFamily:F_UI, fontSize:12, color:MUTED, fontWeight:600, display:"block", marginBottom:5 };

function Modal({ title, onClose, children, width=520 }) {
  return (
    <div role="dialog" aria-modal="true" style={{ position:"fixed", inset:0, background:"rgba(20,20,40,.5)", zIndex:100002, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ width, maxWidth:"94vw", maxHeight:"92vh", overflowY:"auto", background:"#fff", borderRadius:16, boxShadow:"0 24px 60px rgba(0,0,0,.25)" }}>
        <div style={{ padding:"14px 20px", background:INK, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontFamily:F_HEAD, fontSize:18, fontWeight:700, color:"#fff" }}>{title}</div>
          <button onClick={onClose} aria-label="Close" style={{ background:"none", border:"none", fontSize:18, color:GOLD, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ padding:"18px 20px 22px" }}>{children}</div>
      </div>
    </div>
  );
}

function PlayerRow({ player, active, onPick, onHover }) {
  const pc = POS_COLOR[player.position] || { bg:"#F3F4F6", color:SOFT };
  const tier = tierOf(player), tc = TIER_COLOR(tier);
  const ret = formatReturningBadge(player.returning_seasons);
  const yrs = player.years_experience;
  return (
    <div onMouseEnter={()=>onHover(player.id)} onMouseLeave={()=>onHover(null)} onClick={()=>active && onPick(player)}
      style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 14px", borderBottom:"1px solid #F3F2ED", background:"#fff",
        cursor:active?"pointer":"default", position:"relative" }}>
      {player.sandbagging_flag && <div title="Sandbagging flag" style={{ position:"absolute", left:0, top:0, bottom:0, width:3, background:"#EF4444" }} />}
      <div style={{ width:32, height:32, borderRadius:"50%", background:INK, color:GOLD, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:F_NUM, fontSize:12, flexShrink:0 }}>
        {(player.first_name||"?")[0]}{(player.last_name||"?")[0]}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontFamily:F_HEAD, fontSize:15, fontWeight:700, color:INK }}>
          {player.first_name} {player.last_name}
          {player.sandbagging_flag && <span title="Sandbagging flag" style={{ marginLeft:5, color:"#EF4444", fontSize:12 }}>⚠</span>}
          {ret && <span style={{ marginLeft:6, fontFamily:F_UI, fontSize:11, fontWeight:700, background:INK, color:GOLD, padding:"1px 6px", borderRadius:4 }}>{ret}</span>}
        </div>
        <div style={{ display:"flex", gap:5, marginTop:3, alignItems:"center", flexWrap:"wrap" }}>
          <Pill {...pc}>{POS_LABEL[player.position] || "Pos ?"}</Pill>
          <Pill {...TIER_COLOR(tier)} title={`${tier} — ${TIER_DESCRIPTIONS[tier]||"Skill tier"}`}>{tier||"No tier"}</Pill>
          <span style={{ fontFamily:F_UI, fontSize:13, color:MUTED }} title="Score = tier points + years of experience ÷ 5">
            {yrs===null ? "yrs —" : `${yrs} yrs`} · <b style={{ fontFamily:F_NUM, color:INK }}>{scoreOf(player).toFixed(1)}</b>
          </span>
        </div>
      </div>
      {active && <span style={{ fontFamily:F_UI, fontSize:13, fontWeight:700, color:INK, background:"#F6E9B8", padding:"3px 10px", borderRadius:6 }}>Pick</span>}
    </div>
  );
}

function ClockRing({ seconds, max, color, size=76 }) {
  const r = size*0.4, circ = 2*Math.PI*r, urgent = seconds<=15;
  return (
    <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#F0EEE8" strokeWidth={size*0.07} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={urgent?"#DC2626":color} strokeWidth={size*0.07}
        strokeDasharray={`${circ*Math.max(0,Math.min(1,seconds/Math.max(1,max)))} ${circ}`} strokeLinecap="round" style={{ transition:"stroke-dasharray .9s linear" }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central" style={{ transform:"rotate(90deg)", transformOrigin:`${size/2}px ${size/2}px` }}
        fill={urgent?"#DC2626":INK} fontSize={size*0.26} fontWeight={700} fontFamily={F_HEAD}>{seconds}</text>
    </svg>
  );
}

// Live parity bars: average score per team, division average marker, ghost bar = effect of hovered player.
function ParityMeter({ teams, stats, th, MAX, hover, clockTeamId }) {
  const maxNorm = Math.max(40, ...stats.rows.map(r=>r.norm||0), ...(hover ? [hover.projNorm||0] : []));
  const divNorm = stats.divRaw!==null ? stats.divRaw/MAX*100 : null;
  return (
    <div style={{ background:"#fff", border:`1px solid ${LINE}`, borderRadius:12, padding:"14px 16px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:8 }}>
        <div style={{ fontFamily:F_HEAD, fontSize:16, fontWeight:700, color:INK }}>Team balance</div>
        <div style={{ fontFamily:F_UI, fontSize:13, color:MUTED }}>
          {hover ? `Hover preview: ${hover.name} → ${hover.projNorm.toFixed(1)} for this team` : "Average skill score per team. Hover a player to preview a pick."}
        </div>
      </div>
      {teams.map(t => {
        const r = stats.rows.find(x=>x.id===t.id); const band = BAND[bandOf(r.parity, th)];
        const w = (v)=>`${Math.max(0, Math.min(100, (v||0)/maxNorm*100))}%`;
        return (
          <div key={t.id} style={{ display:"flex", alignItems:"center", gap:10, margin:"5px 0" }}>
            <div style={{ width:130, fontFamily:F_UI, fontSize:13, fontWeight:t.id===clockTeamId?700:500, color:INK, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{t.name}</div>
            <div style={{ flex:1, position:"relative", height:16, background:"#F3F2ED", borderRadius:5 }}>
              {r.norm!==null && <div style={{ position:"absolute", left:0, top:0, bottom:0, width:w(r.norm), background:t.colour, borderRadius:5, opacity:.9 }} />}
              {hover && t.id===clockTeamId && <div style={{ position:"absolute", left:0, top:3, bottom:3, width:w(hover.projNorm), border:`2px dashed ${INK}`, borderRadius:5 }} />}
              {divNorm!==null && <div title="Division average" style={{ position:"absolute", left:w(divNorm), top:-3, bottom:-3, width:2, background:INK }} />}
            </div>
            <div style={{ width:46, textAlign:"right", fontFamily:F_NUM, fontSize:13, color:INK }}>{r.norm===null?"—":r.norm.toFixed(1)}</div>
            <Pill bg={band.bg} color={band.color}>{band.label}{r.parity!==null?` ${Math.round(r.parity)}`:""}</Pill>
          </div>
        );
      })}
    </div>
  );
}

// ─── TV mode ─────────────────────────────────────────────────────────────────
function TvMode({ data, stats, remaining, clockTeam, onClose }) {
  const st = data.state, th = data.parity;
  const last = [...data.picks].reverse().slice(0,4);
  const nameOf = (id)=>data.teams.find(t=>t.id===id)?.name||"";
  return (
    <div style={{ position:"fixed", inset:0, background:INK, color:"#fff", zIndex:100001, overflow:"auto", padding:"28px 36px", fontFamily:F_UI }}>
      <button onClick={onClose} style={{ position:"absolute", top:16, right:20, background:"rgba(255,255,255,.12)", color:"#fff", border:"1px solid rgba(255,255,255,.3)", borderRadius:8, padding:"6px 14px", fontSize:15, cursor:"pointer" }}>Exit (Esc)</button>
      <div style={{ fontSize:20, color:GOLD, letterSpacing:".08em", textTransform:"uppercase" }}>{data.division_label} draft · Season 2027</div>
      <div style={{ display:"flex", gap:40, alignItems:"center", margin:"14px 0 26px", flexWrap:"wrap" }}>
        <div>
          <div style={{ fontSize:22, color:"rgba(255,255,255,.7)" }}>
            {st.status==="complete" ? "Draft complete" : st.status==="active" ? `On the clock — pick ${st.next_pick} of ${st.total_slots}` : st.status==="paused" ? "Paused" : "Waiting to start"}
          </div>
          <div style={{ fontFamily:F_HEAD, fontSize:84, fontWeight:700, lineHeight:1.05, color:clockTeam?clockTeam.colour:"#fff", filter:"brightness(1.35)" }}>{st.status==="complete" ? "✓" : clockTeam?.name || "—"}</div>
        </div>
        {remaining!==null && st.status!=="complete" && <div style={{ fontFamily:F_HEAD, fontSize:120, fontWeight:700, color:remaining<=15?"#F87171":GOLD }}>{remaining}</div>}
      </div>
      <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:26 }}>
        {last.map(pk=>(
          <div key={pk.pick} style={{ background:"rgba(255,255,255,.08)", borderRadius:12, padding:"10px 16px", fontSize:20 }}>
            <span style={{ color:GOLD }}>#{pk.pick}</span> {pk.player.first_name} {pk.player.last_name} <span style={{ color:"rgba(255,255,255,.6)" }}>→ {nameOf(pk.team_id)}</span>
          </div>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:`repeat(${Math.min(4, data.teams.length)},1fr)`, gap:16 }}>
        {data.teams.map(t=>{
          const r = stats.rows.find(x=>x.id===t.id); const band = BAND[bandOf(r.parity, th)];
          return (
            <div key={t.id} style={{ background:"rgba(255,255,255,.06)", borderTop:`5px solid ${t.colour}`, borderRadius:12, padding:"12px 16px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
                <div style={{ fontFamily:F_HEAD, fontSize:26, fontWeight:700 }}>{t.name}</div>
                <div style={{ fontSize:18, color:band.bg }}>{band.label}</div>
              </div>
              {t.players.map(p=><div key={p.id} style={{ fontSize:18, padding:"2px 0", color:"rgba(255,255,255,.9)" }}>{p.first_name} {p.last_name} <span style={{ color:"rgba(255,255,255,.5)", fontSize:15 }}>{POS_LABEL[p.position]||""}</span></div>)}
              {t.players.length===0 && <div style={{ fontSize:16, color:"rgba(255,255,255,.4)" }}>No picks yet</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function Draft() {
  const [data, setData]       = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [division, setDivision] = useState("");
  const [busy, setBusy]       = useState(false);
  const [now, setNow]         = useState(Date.now());
  const fetchedAt             = useRef(Date.now());
  const [filterPos, setFilterPos] = useState("");
  const [hoverId, setHoverId] = useState(null);
  const [tv, setTv]           = useState(false);
  const [modal, setModal]     = useState(null);        // trade | captains | mock | reset | publish
  const [toast, setToast]     = useState(null);
  const [clockInput, setClockInput] = useState(90);
  const [tradeA, setTradeA]   = useState(""); const [tradeB, setTradeB] = useState("");
  const [resetText, setResetText] = useState("");
  const [mock, setMock]       = useState(null);
  const [linkInfo, setLinkInfo] = useState(null);

  const showToast = (m)=>{ setToast(m); setTimeout(()=>setToast(null), 4200); };
  const H = { "Content-Type":"application/json", "X-WP-Nonce":NONCE };

  const accept = (d) => { setData(d); fetchedAt.current = Date.now(); setLoadErr(""); if (d.division && d.division!==division) setDivision(d.division); };

  const load = useCallback((div) => {
    fetch(`${API}/draft${div?`?division=${encodeURIComponent(div)}`:""}`, { headers:H })
      .then(r => r.ok ? r.json() : r.json().catch(()=>({})).then(j=>Promise.reject(new Error(j?.message||j?.error||`Server returned ${r.status}`))))
      .then(accept)
      .catch(e => setLoadErr(e.message||"Could not load the draft"));
  }, []);
  useEffect(()=>{ load(division); }, [division]);

  const act = async (path, body={}, ok) => {
    setBusy(true);
    try {
      const res = await fetch(`${API}/draft/${path}`, { method:"POST", headers:H, body:JSON.stringify({ division, ...body }) });
      const d = await res.json().catch(()=>({}));
      if (!res.ok) { showToast(d?.error||d?.message||`Error ${res.status}`); load(division); }
      else { accept(d); if (ok) showToast(ok); }
      return res.ok ? d : null;
    } catch (e) { showToast("Network error — nothing was changed. Refresh to check the board."); return null; }
    finally { setBusy(false); }
  };

  const st = data?.state;
  // 1-second tick + 4-second poll while the draft is live (keeps the TV, phones and this tab in sync)
  useEffect(()=>{ const t=setInterval(()=>setNow(Date.now()),1000); return ()=>clearInterval(t); },[]);
  useEffect(()=>{
    if (!st || (st.status!=="active" && st.status!=="paused")) return;
    const t=setInterval(()=>{ if(!busy) load(division); }, 4000);
    return ()=>clearInterval(t);
  }, [st?.status, division, busy]);
  useEffect(()=>{ const k=(e)=>{ if(e.key==="Escape") setTv(false); }; window.addEventListener("keydown",k); return ()=>window.removeEventListener("keydown",k); },[]);

  const MAX   = data?.max_player_score || 32;
  const teams = data?.teams || [];
  const pool  = data?.pool  || [];
  const slots = st?.slots || [];
  const made  = data ? data.picks.length : 0;
  const stats = useMemo(()=>teamStats(teams, MAX), [teams, MAX]);
  const live  = st && (st.status==="active" || st.status==="paused");
  const clockTeamId = live ? slots[made] : null;
  const clockTeam   = teams.find(t=>t.id===clockTeamId) || null;
  const remaining = !st || st.remaining===null ? null : st.status==="active" ? Math.max(0, st.remaining - Math.floor((now-fetchedAt.current)/1000)) : st.remaining;
  const failing = (data?.preflight||[]).some(c=>c.level==="fail");

  const fits = useMemo(()=>{
    if (!live || !clockTeam) return [];
    return bestFit(clockTeam, teams, pool, slots.slice(made).filter(id=>id===clockTeam.id).length, stats.divRaw);
  }, [live, clockTeam, teams, pool, slots, made, stats.divRaw]);

  const hover = useMemo(()=>{
    if (!hoverId || !clockTeam || !live) return null;
    const p = pool.find(x=>x.id===hoverId); if (!p) return null;
    const sc = clockTeam.players.map(scoreOf);
    return { name:`${p.first_name} ${p.last_name}`, projNorm: ((sc.reduce((a,b)=>a+b,0)+scoreOf(p))/(sc.length+1))/MAX*100 };
  }, [hoverId, clockTeam, live, pool, MAX]);

  const poolShown = useMemo(()=>pool.filter(p=>!filterPos || (filterPos==="goaltender"?p.is_goalie:p.position===filterPos)).sort((a,b)=>scoreOf(b)-scoreOf(a)), [pool, filterPos]);
  const scoreRange = pool.length ? `${Math.min(...pool.map(scoreOf)).toFixed(1)} – ${Math.max(...pool.map(scoreOf)).toFixed(1)}` : "—";
  const posCount = (k)=> k==="" ? pool.length : k==="goaltender" ? pool.filter(p=>p.is_goalie).length : pool.filter(p=>p.position===k).length;

  const pick = (player) => {
    if (busy || !clockTeam) return;
    act("pick", { player_id:player.id, team_id:clockTeam.id });
  };
  const runMock = () => { setMock(simulate(teams, pool, slots, made, MAX)); setModal("mock"); };
  const mockStats = mock ? teamStats(mock, MAX) : null;

  const teamName = (id)=>teams.find(t=>t.id===id)?.name||"";
  const upcoming = slots.map((id,i)=>({ n:i+1, id })).filter(s=>s.n>made);
  const currentRound = st && teams.length ? Math.floor(Math.min(made, Math.max(0,st.total_slots-1))/teams.length)+1 : 1;
  const roundSlots = st && teams.length ? slots.slice((currentRound-1)*teams.length, currentRound*teams.length) : [];

  // ---- render states ----
  if (loadErr && !data) return (
    <div style={{ padding:40, fontFamily:F_UI }}>
      <div style={{ background:"#FEF2F2", border:"1px solid #FCA5A5", borderRadius:10, padding:"14px 18px", color:"#991B1B", maxWidth:640 }}>
        Couldn't load the draft ({loadErr}). Make sure the plugin files from this update are uploaded.
        <div><button onClick={()=>load(division)} style={{ ...btnLight, marginTop:10 }}>Retry</button></div>
      </div>
    </div>
  );
  if (!data) return <div style={{ padding:48, fontFamily:F_UI, color:SOFT }}>Loading draft…</div>;
  if (data.divisions.length===0) return (
    <div style={{ padding:40, fontFamily:F_UI, maxWidth:640 }}>
      <h1 style={{ fontFamily:F_HEAD, color:INK }}>Snake Draft</h1>
      <p style={{ color:MUTED, fontSize:15 }}>There are no draft teams yet. Create teams (type "draft") in Rosters, then come back.</p>
      <a href="/wp-admin/admin.php?page=grsh-tm-rosters" style={{ ...btnDark, textDecoration:"none", display:"inline-block" }}>Open Rosters</a>
    </div>
  );

  const rows = (
    <>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12, marginBottom:14 }}>
        <div>
          <h1 style={{ fontFamily:F_HEAD, fontSize:28, fontWeight:700, color:INK, margin:"0 0 3px", letterSpacing:"-.5px" }}>Snake Draft</h1>
          <div style={{ fontFamily:F_UI, fontSize:14, color:MUTED, display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
            {data.divisions.length>1
              ? <select value={data.division} onChange={e=>{ setData(null); setDivision(e.target.value); }} disabled={live} style={{ ...inp, width:"auto", padding:"3px 8px" }}>
                  {data.divisions.map(d=><option key={d.key} value={d.key}>{d.label}</option>)}</select>
              : <b>{data.division_label}</b>}
            <span>· {teams.length} teams · {st.rounds} round{st.rounds===1?"":"s"} · {pool.length} available · {made} of {st.total_slots} picks made</span>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
          {st.status==="active" && <button style={btnLight} disabled={busy} onClick={()=>act("pause")}>⏸ Pause</button>}
          {st.status==="paused" && <button style={btnDark} disabled={busy} onClick={()=>act("resume")}>▶ Resume</button>}
          {live && <button style={btnLight} disabled={busy || made===0} onClick={()=>act("undo",{},"Last pick undone")}>↩ Undo</button>}
          {live && <button style={btnLight} onClick={()=>{ setTradeA(""); setTradeB(""); setModal("trade"); }}>⇄ Trade picks</button>}
          <button style={btnLight} onClick={()=>{ setLinkInfo(null); setModal("captains"); }}>📱 Captain links</button>
          {st.status!=="complete" && pool.length>0 && teams.length>1 && <button style={btnLight} onClick={runMock}>🧪 Mock draft</button>}
          <button style={btnLight} onClick={()=>setTv(true)}>📺 TV mode</button>
          {(live || made>0) && st.status!=="complete" && <button style={btnDanger} onClick={()=>{ setResetText(""); setModal("reset"); }}>↺ Reset</button>}
        </div>
      </div>

      {loadErr && <div style={{ background:"#FEF3C7", border:"1px solid #FDE68A", borderRadius:8, padding:"8px 14px", marginBottom:10, fontFamily:F_UI, fontSize:14, color:"#7A4A00" }}>Lost connection ({loadErr}). The board may be out of date — it retries every few seconds.</div>}

      <div style={{ display:"grid", gridTemplateColumns:"270px 1fr 240px", gap:14, alignItems:"start" }}>
        {/* Pool */}
        <div style={{ background:"#fff", border:`1px solid ${LINE}`, borderRadius:12, overflow:"hidden" }}>
          <div style={{ display:"flex", justifyContent:"space-between", padding:"12px 14px 8px", borderBottom:"1px solid #F0EEE8" }}>
            <span style={{ fontFamily:F_UI, fontSize:14, fontWeight:700, color:INK }}>Available players</span>
            <span style={{ fontFamily:F_NUM, fontSize:13, color:MUTED }}>{pool.length}</span>
          </div>
          <div style={{ display:"flex", gap:5, padding:"8px 10px", flexWrap:"wrap", borderBottom:"1px solid #F0EEE8" }}>
            {[["", "All"],["goaltender","Goalie"],["defenseman","Defense"],["center","Center"],["winger","Wing"]].map(([k,l])=>(
              <button key={k} onClick={()=>setFilterPos(k)} style={{ fontFamily:F_UI, fontSize:13, fontWeight:600, padding:"3px 9px", borderRadius:6, cursor:"pointer",
                background:filterPos===k?INK:"#F6F5F0", color:filterPos===k?GOLD:MUTED, border:`1px solid ${filterPos===k?INK:LINE}` }}>{l} {posCount(k)}</button>
            ))}
          </div>
          <div style={{ fontFamily:F_UI, fontSize:12, color:SOFT, padding:"5px 14px", background:"#FAFAF8", borderBottom:"1px solid #F0EEE8" }}>Best score first · range {scoreRange}</div>
          <div style={{ maxHeight:600, overflowY:"auto" }}>
            {poolShown.map(p=><PlayerRow key={p.id} player={p} active={st.status==="active" && !busy} onPick={pick} onHover={setHoverId} />)}
            {poolShown.length===0 && <div style={{ fontFamily:F_UI, fontSize:14, color:SOFT, textAlign:"center", padding:"24px 0" }}>{pool.length===0?"Nobody left in the pool":"No players in this position"}</div>}
          </div>
        </div>

        {/* Center */}
        <div style={{ display:"flex", flexDirection:"column", gap:12, minWidth:0 }}>
          <div style={{ background:"#fff", border:`2px solid ${st.status==="complete"?"#86EFAC":clockTeam?.colour||LINE}`, borderRadius:12, padding:"16px 18px" }}>
            {st.status==="ready" && (
              <div>
                <div style={{ fontFamily:F_HEAD, fontSize:19, fontWeight:700, color:INK }}>Ready to draft?</div>
                <div style={{ fontFamily:F_UI, fontSize:14, color:MUTED, marginBottom:10 }}>{failing ? "Fix the red items before you can start." : "Everything required is in place. Review the warnings, then start."}</div>
                {data.preflight.map((c,i)=>{
                  const col = c.level==="ok" ? "#166534" : c.level==="warn" ? "#92400E" : "#991B1B";
                  return (
                    <div key={i} style={{ display:"flex", gap:10, padding:"8px 0", borderBottom:"1px solid #F0EEE8", fontFamily:F_UI, fontSize:14, color:INK }}>
                      <span style={{ color:col, fontWeight:700, width:16 }}>{c.level==="ok"?"✓":c.level==="warn"?"!":"✕"}</span>
                      <span style={{ flex:1 }}>{c.text}</span>
                      {c.url && <a href={c.url} style={{ color:col, fontSize:13, whiteSpace:"nowrap" }}>{c.fix} →</a>}
                    </div>
                  );
                })}
                <div style={{ display:"flex", gap:10, alignItems:"center", marginTop:14, flexWrap:"wrap" }}>
                  <label style={{ fontFamily:F_UI, fontSize:13, color:MUTED }}>Pick clock (seconds)
                    <input type="number" min={15} max={600} value={clockInput} onChange={e=>setClockInput(+e.target.value)} style={{ ...inp, width:80, marginLeft:8 }} /></label>
                  <button disabled={failing||busy} onClick={()=>act("start",{ clock_seconds:clockInput },"Draft started")}
                    style={{ ...btnDark, background:failing?"#ccc":INK, color:failing?"#fff":GOLD, cursor:failing?"not-allowed":"pointer" }}>▶ Start draft</button>
                  {!failing && <button style={btnLight} onClick={runMock}>🧪 Try a mock draft first</button>}
                </div>
              </div>
            )}

            {live && (
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ fontFamily:F_UI, fontSize:13, color:MUTED }}>{st.status==="paused"?"Paused — next up":"On the clock"} · pick {made+1} of {st.total_slots} · round {currentRound}</div>
                    <div style={{ fontFamily:F_HEAD, fontSize:30, fontWeight:700, color:clockTeam?.colour, lineHeight:1.15 }}>{clockTeam?.name}</div>
                  </div>
                  {remaining!==null && <ClockRing seconds={remaining} max={st.clock_seconds} color={clockTeam?.colour||INK} />}
                </div>
                {st.status==="active" && remaining===0 && (
                  <div style={{ marginTop:10, background:"#FEE2E2", color:"#991B1B", fontFamily:F_UI, fontSize:14, padding:"8px 12px", borderRadius:8 }}>
                    Time's up for {clockTeam?.name}. Pick for them, auto-pick the best fit, or trade the pick.
                  </div>
                )}
                {fits.length>0 && (
                  <div style={{ marginTop:12 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                      <div style={{ fontFamily:F_UI, fontSize:13, fontWeight:700, color:INK }}>Best fit for {clockTeam?.name}</div>
                      <button style={{ ...btnLight, padding:"4px 10px", fontSize:13 }} disabled={busy||st.status!=="active"} onClick={()=>pick(fits[0].player)}>Auto-pick #1</button>
                    </div>
                    {fits.slice(0,3).map((f,i)=>(
                      <div key={f.player.id} onMouseEnter={()=>setHoverId(f.player.id)} onMouseLeave={()=>setHoverId(null)}
                        style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 10px", background:i===0?"#FBF4DC":PAPER, borderRadius:8, marginBottom:5 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontFamily:F_HEAD, fontSize:15, fontWeight:700, color:INK }}>{i+1}. {f.player.first_name} {f.player.last_name} <span style={{ fontFamily:F_UI, fontSize:12, color:MUTED, fontWeight:400 }}>{POS_LABEL[f.player.position]||""}</span></div>
                          <div style={{ fontFamily:F_UI, fontSize:12.5, color:MUTED }}>{f.reasons.join(" · ")}</div>
                        </div>
                        <button disabled={busy||st.status!=="active"} onClick={()=>pick(f.player)} style={{ ...btnDark, padding:"5px 12px", fontSize:13 }}>Pick</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {st.status==="complete" && (
              <div>
                <div style={{ fontFamily:F_HEAD, fontSize:21, fontWeight:700, color:"#166534" }}>Draft complete — {made} picks saved</div>
                <div style={{ fontFamily:F_UI, fontSize:14, color:MUTED, margin:"4px 0 10px" }}>
                  The rosters are already saved. {st.published_at ? `Published ${st.published_at}.` : "Publish to email every player their team and create a shareable results page."}
                </div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  <button style={btnDark} onClick={()=>setModal("publish")}>{st.published_at?"Re-send / view results":"Publish results"}</button>
                  {st.recap_url && <a href={st.recap_url} target="_blank" rel="noreferrer" style={{ ...btnLight, textDecoration:"none" }}>Open results page</a>}
                  <button style={btnLight} disabled={busy} onClick={()=>act("undo",{},"Last pick undone")}>↩ Undo last pick</button>
                </div>
              </div>
            )}
          </div>

          {/* Round order (full names, honors trades) */}
          {st.total_slots>0 && (
            <div style={{ background:"#fff", border:`1px solid ${LINE}`, borderRadius:10, padding:"10px 14px" }}>
              <div style={{ fontFamily:F_UI, fontSize:13, fontWeight:700, color:INK, marginBottom:6 }}>Round {currentRound} order</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {roundSlots.map((id,i)=>{
                  const t = teams.find(x=>x.id===id); const g=(currentRound-1)*teams.length+i;
                  const cur = live && g===made, past = g<made;
                  return (
                    <div key={g} style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", borderRadius:8,
                      background:cur?t?.colour:past?"#F0EEE8":PAPER, border:`1px solid ${cur?t?.colour:LINE}`, opacity:past?.6:1 }}>
                      <span style={{ fontFamily:F_NUM, fontSize:12, color:cur?"#fff":SOFT }}>#{g+1}</span>
                      <span style={{ fontFamily:F_UI, fontSize:13, fontWeight:cur?700:500, color:cur?"#fff":INK }}>{t?.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <ParityMeter teams={teams} stats={stats} th={data.parity} MAX={MAX} hover={hover} clockTeamId={clockTeamId} />

          {/* Teams */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))", gap:10 }}>
            {teams.map(t=>{
              const r = stats.rows.find(x=>x.id===t.id);
              return (
                <div key={t.id} style={{ background:"#fff", border:`1px solid ${LINE}`, borderTop:`4px solid ${t.colour}`, borderRadius:10, overflow:"hidden" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 12px", borderBottom:t.players.length?"1px solid #F0EEE8":"none" }}>
                    <span style={{ fontFamily:F_HEAD, fontSize:15, fontWeight:700, color:t.colour, filter:"brightness(.85)" }}>{t.name}</span>
                    <span style={{ fontFamily:F_UI, fontSize:13, color:MUTED }}>{t.players.length} · {r.norm===null?"—":r.norm.toFixed(1)}</span>
                  </div>
                  {t.players.length>0 && (
                    <div style={{ padding:"6px 12px 8px" }}>
                      {t.players.map(p=>(
                        <div key={p.id} style={{ display:"flex", gap:6, alignItems:"center", padding:"2px 0", fontFamily:F_UI, fontSize:13.5, color:INK }}>
                          <span style={{ flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.first_name} {p.last_name}</span>
                          <Pill {...(POS_COLOR[p.position]||{bg:"#F3F4F6",color:SOFT})}>{(POS_LABEL[p.position]||"?").slice(0,4)}</Pill>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Pick history */}
        <div style={{ background:"#fff", border:`1px solid ${LINE}`, borderRadius:12, overflow:"hidden" }}>
          <div style={{ display:"flex", justifyContent:"space-between", padding:"12px 14px 8px", borderBottom:"1px solid #F0EEE8" }}>
            <span style={{ fontFamily:F_UI, fontSize:14, fontWeight:700, color:INK }}>Pick history</span>
            <span style={{ fontFamily:F_NUM, fontSize:13, color:MUTED }}>{made}</span>
          </div>
          <div style={{ padding:10, maxHeight:640, overflowY:"auto" }}>
            {made===0 && <div style={{ fontFamily:F_UI, fontSize:14, color:SOFT, textAlign:"center", padding:"20px 0" }}>No picks yet</div>}
            {[...data.picks].reverse().map(pk=>{
              const t = teams.find(x=>x.id===pk.team_id);
              return (
                <div key={pk.pick} style={{ padding:"6px 10px", borderLeft:`3px solid ${t?.colour}`, background:PAPER, borderRadius:6, marginBottom:5 }}>
                  <div style={{ fontFamily:F_UI, fontSize:13.5, fontWeight:600, color:INK }}>{pk.player.first_name} {pk.player.last_name}</div>
                  <div style={{ fontFamily:F_UI, fontSize:12.5, color:MUTED }}>#{pk.pick} · R{pk.round} · {t?.name}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div style={{ fontFamily:F_UI, background:PAPER, minHeight:"100vh", padding:"24px 24px 60px", color:INK }}>
      <style>{`*{box-sizing:border-box}`}</style>
      {rows}

      {tv && <TvMode data={data} stats={stats} remaining={remaining} clockTeam={clockTeam} onClose={()=>setTv(false)} />}

      {modal==="trade" && (
        <Modal title="Trade picks" onClose={()=>setModal(null)}>
          <p style={{ fontFamily:F_UI, fontSize:14, color:MUTED, marginTop:0 }}>Swap two upcoming picks between teams. Past picks can't be traded.</p>
          {[["First pick",tradeA,setTradeA],["Second pick",tradeB,setTradeB]].map(([l,v,s])=>(
            <div key={l} style={{ marginBottom:10 }}><label style={lbl}>{l}</label>
              <select value={v} onChange={e=>s(e.target.value)} style={inp}>
                <option value="">Select…</option>
                {upcoming.map(u=><option key={u.n} value={u.n}>#{u.n} · round {Math.floor((u.n-1)/teams.length)+1} · {teamName(u.id)}</option>)}
              </select></div>
          ))}
          <button disabled={!tradeA||!tradeB||tradeA===tradeB||busy} style={btnDark}
            onClick={async()=>{ const ok=await act("trade",{ pick_a:+tradeA, pick_b:+tradeB },"Picks swapped"); if(ok) setModal(null); }}>Swap picks</button>
        </Modal>
      )}

      {modal==="captains" && (
        <Modal title="Captain phone links" onClose={()=>setModal(null)}>
          <p style={{ fontFamily:F_UI, fontSize:14, color:MUTED, marginTop:0 }}>Each captain gets a private link. On their phone they see the board and can pick only when their team is on the clock — they're emailed when it's their turn. Links are tied to a team: don't forward them.</p>
          {teams.map(t=>(
            <div key={t.id} style={{ display:"flex", gap:8, padding:"6px 0", borderBottom:"1px solid #F0EEE8", fontFamily:F_UI, fontSize:14 }}>
              <span style={{ flex:1 }}>{t.name}</span>
              <span style={{ color:t.captain_has_email?"#166534":"#991B1B" }}>{t.captain_has_email?(t.captain_link?"link ready":"captain has email"):"no captain email"}</span>
            </div>
          ))}
          {linkInfo && <div style={{ fontFamily:F_UI, fontSize:14, margin:"10px 0", color:INK }}>{linkInfo.sent} email{linkInfo.sent===1?"":"s"} sent{linkInfo.missing_email.length?`. No email for: ${linkInfo.missing_email.join(", ")}`:""}.</div>}
          <div style={{ display:"flex", gap:8, marginTop:12 }}>
            <button style={btnDark} disabled={busy} onClick={async()=>{ const d=await act("captain-links",{ send:true }); if(d) setLinkInfo(d.links_result); }}>Email links to captains</button>
          </div>
          {!teams.some(t=>t.captain_has_email) && <p style={{ fontFamily:F_UI, fontSize:13, color:"#92400E" }}>No team has a captain with an email yet. Set captains in Rosters first.</p>}
        </Modal>
      )}

      {modal==="mock" && mock && (
        <Modal title="Mock draft result" onClose={()=>setModal(null)} width={600}>
          <p style={{ fontFamily:F_UI, fontSize:14, color:MUTED, marginTop:0 }}>A practice run where every team takes its best fit. <b>Nothing was saved.</b></p>
          {(() => {
            const norms = mockStats.rows.map(r=>r.norm).filter(v=>v!==null);
            const spread = norms.length ? Math.max(...norms)-Math.min(...norms) : 0;
            const noG = mockStats.rows.filter(r=>r.goalies===0).length;
            return (
              <>
                <div style={{ fontFamily:F_UI, fontSize:14, color:INK, marginBottom:8 }}>Spread between strongest and weakest team: <b style={{ fontFamily:F_NUM }}>{spread.toFixed(1)}</b> points · {noG===0?"every team has a goalie":`${noG} team${noG===1?"":"s"} without a goalie`}</div>
                <ParityMeter teams={mock} stats={mockStats} th={data.parity} MAX={MAX} hover={null} clockTeamId={null} />
                <div style={{ fontFamily:F_UI, fontSize:13, color:MUTED, marginTop:10 }}>If the spread is large or a band shows Rebalance, look at the pool and team order before drafting for real.</div>
              </>
            );
          })()}
        </Modal>
      )}

      {modal==="reset" && (
        <Modal title="Reset this draft?" onClose={()=>setModal(null)}>
          <p style={{ fontFamily:F_UI, fontSize:14, color:"#991B1B", marginTop:0 }}>This removes all {made} draft picks for {data.division_label} and returns those players to the pool. Trades and the clock are cleared too. It cannot be undone.</p>
          <label style={lbl}>Type RESET to confirm</label>
          <input value={resetText} onChange={e=>setResetText(e.target.value)} style={{ ...inp, marginBottom:12 }} />
          <button disabled={resetText!=="RESET"||busy} style={btnDanger} onClick={async()=>{ const ok=await act("reset",{ confirm:true },"Draft reset"); if(ok) setModal(null); }}>Reset draft</button>
        </Modal>
      )}

      {modal==="publish" && (
        <Modal title="Publish draft results" onClose={()=>setModal(null)}>
          <p style={{ fontFamily:F_UI, fontSize:14, color:MUTED, marginTop:0 }}>Emails every drafted player their team and a link to the shareable results page. {st.published_at && <b>Already published {st.published_at}.</b>}</p>
          <button disabled={busy} style={btnDark} onClick={async()=>{
            const d = await act("publish",{ resend: !!st.published_at });
            if(d?.publish_result) showToast(`${d.publish_result.sent} emailed${d.publish_result.failed?`, ${d.publish_result.failed} failed`:""}${d.publish_result.skipped?`, ${d.publish_result.skipped} skipped (no email)`:""}`);
            if(d) setModal(null);
          }}>{st.published_at?"Send again":"Email all players"}</button>
        </Modal>
      )}

      {toast && <div style={{ position:"fixed", bottom:28, left:"50%", transform:"translateX(-50%)", fontFamily:F_UI, fontSize:14, fontWeight:600, background:INK, color:GOLD,
        padding:"11px 22px", borderRadius:99, boxShadow:"0 8px 24px rgba(0,0,0,.2)", zIndex:200000 }}>{toast}</div>}
    </div>
  );
}
