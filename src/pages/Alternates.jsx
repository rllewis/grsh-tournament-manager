// Alternates.jsx — v3
// Real data only (no mock fallbacks): activation log, tournament dates, teams all come from the server.
// New: email sub requests (first YES wins), coverage heat map, goalie safety net,
//      fit check before activation, reliability + fair call order.

import { useState, useMemo, useEffect, useCallback } from "react";
import { computeScore, TIER_DESCRIPTIONS } from "../lib/playerScoring";

const API   = window.grshConfig?.apiUrl || "/wp-json/grsh/v1";
const NONCE = window.grshConfig?.nonce  || "";

// ─── Look & feel ──────────────────────────────────────────────────────────────
const F_HEAD = "'Fraunces',Georgia,serif";
const F_NUM  = "'DM Mono',monospace";                       // numbers, tiers, phone only
const F_UI   = "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
const INK = "#1a1a2e", MUTED = "#555566", SOFT = "#6b6b7b", LINE = "#E2E0D8", PAPER = "#F6F5F0", GOLD = "#D4A017";

const FALLBACK_DIVISIONS = [
  { key:"gold_open", label:"Gold Open" }, { key:"45a", label:"45A" },
  { key:"senior_b", label:"Senior B" },   { key:"senior_c", label:"Senior C" },
  { key:"womens", label:"Womens" },
];
const POSITION_LABEL = { defenseman:"Defense", center:"Center", winger:"Winger", goaltender:"Goalie" };
const TIER_COLOR = (t) => {
  if(!t) return { bg:"#F3F4F6",color:"#4B5563" };
  const f=t[0];
  if(f==="A") return { bg:"#FCE8E8",color:"#7A1818" };
  if(f==="B") return { bg:"#FEF0E8",color:"#7A4518" };
  if(f==="C") return { bg:"#FEF9E7",color:"#6B4E0E" };
  return { bg:"#E8F0FE",color:"#1A3F8F" };
};
const DAYS = ["thursday","friday","saturday","sunday"];
const DAY_SHORT = { thursday:"Thu",friday:"Fri",saturday:"Sat",sunday:"Sun" };
const AVATAR_COLORS = ["#1a1a2e","#1E3A5F","#3B1F5E","#1F4E3B","#5E3B1F","#4A1F1F","#1F3D4E","#3D2B1F"];
const avatarColor = (id) => AVATAR_COLORS[id % AVATAR_COLORS.length];
const TIER_ORDER = ["A1","A2","A3","B1","B2","B3","C1","C2","R1","R2","R3"];
const REASONS = [["injury","Injury"],["illness","Illness"],["short_roster","Short roster"],["no_show","No-show"],["other","Other"]];

const pad = (n) => String(n).padStart(2,"0");
const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const todayIso = isoLocal(new Date());

// Thu–Sun dates from the tournament start (a Thursday). Without a start date we only know day names.
function buildDays(start){
  const out = {};
  DAYS.forEach((d,i)=>{
    if(!start){ out[d]={ key:d, iso:d, label:"", short:DAY_SHORT[d] }; return; }
    const dt = new Date(start+"T12:00:00");
    dt.setDate(dt.getDate()+i);
    out[d] = { key:d, iso:isoLocal(dt), label:dt.toLocaleDateString("en-US",{month:"short",day:"numeric"}), short:DAY_SHORT[d] };
  });
  return out;
}
const dayText = (dm,d) => d ? `${dm[d].short}${dm[d].label?" "+dm[d].label:""}` : "";
const cleanNote = (n) => (/created from historical import/i.test(n||"") ? "" : (n||""));
const goalieOf = (a) => a.position==="goaltender" || a.is_goalie;
const eligibleFor = (a,div) => !div || !a.division_eligibility.length || a.division_eligibility.includes(div);
const availableOn = (a,day) => !day || a.available_days.includes(day);

// ─── Reliability + call order ─────────────────────────────────────────────────
// Reliability = average of (games attended / scheduled) and (email requests answered / sent).
function reliability(a){
  const parts=[];
  if(a.games_scheduled>0) parts.push(a.games_attended/a.games_scheduled);
  if(a.requests_sent>0)   parts.push(a.requests_answered/a.requests_sent);
  return parts.length ? Math.round(parts.reduce((x,y)=>x+y,0)/parts.length*100) : null;
}
function callScore(a,{div,day,needGoalie}={}){
  if(!eligibleFor(a,div)) return -1;
  if(!availableOn(a,day)) return -1;
  if(a.today_activations>=a.max_games_per_day) return -1;
  if(needGoalie && !goalieOf(a)) return -1;
  let s=100;
  const t=TIER_ORDER.indexOf(a.skill_tier_reported);
  s += (t<0?0:(10-t))*3;
  s -= a.times_activated*5;                        // fairness: spread the calls around
  if(a.late_game_available) s+=5;
  s += a.available_days.length*2 + a.max_games_per_day*3;
  const r=reliability(a);
  if(r!==null) s += (r-75)/2.5;
  return Math.max(0,s);
}
function whyChips(a){
  const out=[];
  if(a.times_activated===0) out.push("Not used yet");
  else out.push(`${a.times_activated}× used`);
  const r=reliability(a);
  if(r!==null) out.push(`${r}% reliable`);
  if(a.late_game_available) out.push("Late games OK");
  out.push(`${a.available_days.length} day${a.available_days.length===1?"":"s"}`);
  return out;
}

// ─── Small pieces ─────────────────────────────────────────────────────────────
function Pill({ bg,color,border,children,small,title }) {
  return (
    <span title={title} style={{ display:"inline-block",background:bg,color,border:`1px solid ${border||bg}`,
      fontSize:small?12:13,fontFamily:F_NUM,fontWeight:500,padding:small?"1px 7px":"2px 9px",
      borderRadius:99,whiteSpace:"nowrap" }}>{children}</span>
  );
}
function TierPill({ tier }) {
  if(!tier) return null;
  const tc=TIER_COLOR(tier);
  return <Pill {...tc} small title={`${tier} — ${TIER_DESCRIPTIONS[tier]||"Skill tier"} · ${computeScore(tier,0,0)} pts base`}>{tier}</Pill>;
}
function GoalieTag() {
  return <span style={{ fontFamily:F_UI,fontSize:12,background:"#FCE8E8",color:"#7A1818",padding:"1px 7px",
    borderRadius:99,border:"1px solid #f5c6c6",fontWeight:600 }}>Goalie</span>;
}
function Avatar({ alt,size=34 }) {
  return (
    <div style={{ width:size,height:size,borderRadius:"50%",background:avatarColor(alt.id),color:GOLD,flexShrink:0,
      display:"flex",alignItems:"center",justifyContent:"center",fontFamily:F_NUM,fontSize:size>32?12:11,fontWeight:500 }}>
      {(alt.first_name||"?")[0]}{(alt.last_name||"?")[0]}
    </div>
  );
}
function StatusLine({ alt,dm }) {
  const maxed = alt.today_activations>=alt.max_games_per_day;
  const todayDay = DAYS.find(d=>dm[d].iso===todayIso);
  const availToday = todayDay && alt.available_days.includes(todayDay) && !maxed;
  if(maxed) return <Pill bg="#FEE2E2" color="#991B1B" small>Maxed today</Pill>;
  if(availToday) return <span style={{ fontFamily:F_UI,fontSize:12,color:"#166534",fontWeight:600 }}>● Available today</span>;
  if(alt.times_activated===0) return <span style={{ fontFamily:F_UI,fontSize:12,color:SOFT }}>Not used yet</span>;
  return <span style={{ fontFamily:F_UI,fontSize:12,color:MUTED }}>{alt.times_activated}× used</span>;
}
function RelBadge({ alt }) {
  const r=reliability(alt);
  if(r===null) return <span style={{ fontFamily:F_UI,fontSize:12,color:SOFT }} title="No attendance or reply history yet">No history</span>;
  const good=r>=85, bad=r<60;
  return <span title={`Attendance and reply rate combined: ${r}%`} style={{ fontFamily:F_UI,fontSize:12,fontWeight:600,
    color:good?"#7A5A00":bad?"#991B1B":MUTED }}>{good?"★ ":""}{r}% reliable</span>;
}
function AvailabilityChips({ days,filterDay,dm }) {
  return (
    <div style={{ display:"flex",gap:4 }}>
      {DAYS.map(d=>{
        const avail=days.includes(d), isF=filterDay===d;
        return (
          <div key={d} title={`${dayText(dm,d)}${avail?" — available":" — not available"}`} style={{
            padding:"2px 7px",borderRadius:5,minWidth:38,textAlign:"center",
            background:avail?(isF?GOLD:INK):"#EFEDE6",border:`1px solid ${avail?(isF?"#B8860B":INK):"#E2E0D8"}` }}>
            <div style={{ fontFamily:F_UI,fontSize:12,fontWeight:600,color:avail?(isF?INK:GOLD):"#9a9aa6",lineHeight:1.3 }}>{DAY_SHORT[d]}</div>
          </div>
        );
      })}
    </div>
  );
}
const btnDark = { fontFamily:F_UI,fontSize:13,fontWeight:600,background:INK,color:GOLD,border:"none",padding:"8px 14px",borderRadius:8,cursor:"pointer" };
const btnLight = { fontFamily:F_UI,fontSize:13,background:"#fff",border:`1px solid ${LINE}`,color:MUTED,padding:"8px 14px",borderRadius:8,cursor:"pointer" };
const lbl = { fontFamily:F_UI,fontSize:12,color:MUTED,fontWeight:600,display:"block",marginBottom:5 };
const inp = { fontFamily:F_UI,fontSize:14,background:PAPER,border:`1px solid ${LINE}`,borderRadius:6,padding:"7px 10px",color:INK,outline:"none",width:"100%",boxSizing:"border-box" };

function Modal({ title,sub,onClose,children,width=520 }) {
  return (
    <div role="dialog" aria-modal="true" style={{ position:"fixed",inset:0,background:"rgba(20,20,40,.5)",zIndex:100000,
      display:"flex",alignItems:"center",justifyContent:"center" }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ width,maxWidth:"94vw",maxHeight:"92vh",overflowY:"auto",background:"#fff",
        borderRadius:16,boxShadow:"0 24px 60px rgba(0,0,0,.25)" }}>
        <div style={{ padding:"16px 22px",background:INK,display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
          <div>
            <div style={{ fontFamily:F_HEAD,fontSize:19,fontWeight:700,color:"#fff" }}>{title}</div>
            {sub && <div style={{ fontFamily:F_UI,fontSize:13,color:"rgba(212,160,23,.85)",marginTop:2 }}>{sub}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background:"none",border:"none",fontSize:18,color:GOLD,cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ padding:"18px 22px 22px" }}>{children}</div>
      </div>
    </div>
  );
}

// ─── Activate (with fit check) ────────────────────────────────────────────────
function ActivateModal({ alt, meta, dm, log, preset, onConfirm, onClose }) {
  const divOptions = alt.division_eligibility.length ? alt.division_eligibility : (meta?.divisions||FALLBACK_DIVISIONS).map(d=>d.key);
  const divLabel = (k) => (meta?.divisions||FALLBACK_DIVISIONS).find(d=>d.key===k)?.label || k;
  const dayOptions = alt.available_days.length ? DAYS.filter(d=>alt.available_days.includes(d)) : DAYS;

  const [day,setDay]=useState(preset?.day && dayOptions.includes(preset.day) ? preset.day : "");
  const [div,setDiv]=useState(preset?.division && divOptions.includes(preset.division) ? preset.division : (divOptions[0]||""));
  const [teamId,setTeamId]=useState("");
  const [teamText,setTeamText]=useState("");
  const [reason,setReason]=useState("injury");
  const [notes,setNotes]=useState("");

  const teams = (meta?.teams||[]).filter(t=>t.division===div);
  const team  = teams.find(t=>String(t.id)===String(teamId));
  const teamName = team ? team.name : teamText.trim();
  const gameDate = day ? dm[day].iso : "";

  const MAX = meta?.max_player_score || 32;
  const myRaw = computeScore(alt.skill_tier_assigned||alt.skill_tier_reported, alt.years_experience||0, 0);
  const my100 = Math.round(myRaw/MAX*1000)/10;
  let before=null, after=null;
  if(team && team.players>0){
    before = team.avg_100;
    after  = Math.round(((team.score_sum+myRaw)/(team.players+1))/MAX*1000)/10;
  }

  const sameDay   = log.filter(e=>e.alternate_id===alt.id && day && e.game_date===gameDate);
  const dupe      = sameDay.some(e=>e.team===teamName && e.division===div);
  const overMax   = sameDay.length >= alt.max_games_per_day;
  const warnings=[];
  if(alt.sandbagging_flag) warnings.push("Flagged as a possible sandbagger — check their tier before placing them.");
  if(before!==null && my100-before>12) warnings.push(`Noticeably stronger than this team (${my100} vs team average ${before}).`);
  if(team && team.players>0 && team.goalies===0 && !goalieOf(alt)) warnings.push("This team has no goalie on its roster.");
  if(team && team.goalies>=1 && goalieOf(alt)) warnings.push("This team already has a goalie.");
  if(!day) {/* nothing */} else if(overMax) warnings.push(`Already at ${alt.max_games_per_day} game(s) that day.`);

  const canSubmit = day && div && teamName && !dupe && !overMax;

  return (
    <Modal title={`${alt.first_name} ${alt.last_name}`} sub={`Activate sub${alt.phone?" · "+alt.phone:""}`} onClose={onClose}>
      <div style={{ display:"flex",flexDirection:"column",gap:13 }}>
        <div style={{ background:PAPER,borderRadius:8,padding:"10px 12px" }}>
          <AvailabilityChips days={alt.available_days} filterDay={day} dm={dm} />
          <div style={{ fontFamily:F_UI,fontSize:12,color:MUTED,marginTop:6 }}>
            {alt.late_game_available?"Can play late games":"No late games"} · up to {alt.max_games_per_day}/day · <RelBadge alt={alt} />
          </div>
        </div>
        <div>
          <label style={lbl}>Game day *</label>
          <select value={day} onChange={e=>setDay(e.target.value)} style={inp}>
            <option value="">Select day…</option>
            {dayOptions.map(d=><option key={d} value={d}>{dayText(dm,d)}</option>)}
          </select>
          {!meta?.tournament_start && <div style={{ fontFamily:F_UI,fontSize:12,color:"#92400E",marginTop:4 }}>Tournament dates aren't set — the log will show the day name only.</div>}
        </div>
        <div>
          <label style={lbl}>Division *</label>
          <select value={div} onChange={e=>{setDiv(e.target.value);setTeamId("");}} style={inp}>
            {divOptions.map(d=><option key={d} value={d}>{divLabel(d)}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Team *</label>
          {teams.length>0 ? (
            <select value={teamId} onChange={e=>setTeamId(e.target.value)} style={inp}>
              <option value="">Select team…</option>
              {teams.map(t=><option key={t.id} value={t.id}>{t.name} ({t.players} players)</option>)}
            </select>
          ) : (
            <input value={teamText} onChange={e=>setTeamText(e.target.value)} placeholder="Team name" style={inp} />
          )}
        </div>

        {(before!==null || warnings.length>0 || dupe) && (
          <div style={{ border:`1px solid ${LINE}`,borderRadius:10,padding:"10px 12px",background:"#FCFBF7" }}>
            <div style={{ fontFamily:F_UI,fontSize:12,fontWeight:700,color:INK,marginBottom:6 }}>Fit check</div>
            {before!==null && (
              <div style={{ fontFamily:F_UI,fontSize:13,color:INK,marginBottom:warnings.length?6:0 }}>
                Team skill average <b style={{ fontFamily:F_NUM }}>{before}</b> → <b style={{ fontFamily:F_NUM }}>{after}</b>
                <span style={{ color:SOFT }}> (sub scores {my100})</span>
              </div>
            )}
            {dupe && <div style={{ fontFamily:F_UI,fontSize:13,color:"#991B1B",fontWeight:600 }}>Already logged for this team and game day.</div>}
            {warnings.map((w,i)=><div key={i} style={{ fontFamily:F_UI,fontSize:13,color:"#92400E",marginTop:2 }}>⚠ {w}</div>)}
          </div>
        )}

        <div>
          <label style={lbl}>Reason</label>
          <select value={reason} onChange={e=>setReason(e.target.value)} style={inp}>
            {REASONS.map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Notes (optional)</label>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="Who they're replacing, anything else…" style={{ ...inp,resize:"vertical" }} />
        </div>
        <div style={{ display:"flex",gap:10 }}>
          <button onClick={onClose} style={{ ...btnLight,flex:1 }}>Cancel</button>
          <button disabled={!canSubmit} onClick={()=>onConfirm({ team:teamName, div, day, reason, notes })}
            style={{ ...btnDark,flex:2,background:canSubmit?INK:"#ccc",color:canSubmit?GOLD:"#fff",cursor:canSubmit?"pointer":"not-allowed" }}>
            Confirm activation →
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Email request ────────────────────────────────────────────────────────────
function RequestModal({ pool, meta, dm, preset, onClose, onSent }) {
  const divs = meta?.divisions?.length ? meta.divisions : FALLBACK_DIVISIONS;
  const [div,setDiv]=useState(preset?.division || divs[0]?.key || "");
  const [day,setDay]=useState(preset?.day || "");
  const [teamId,setTeamId]=useState("");
  const [teamText,setTeamText]=useState("");
  const [goalie,setGoalie]=useState(!!preset?.needGoalie);
  const [note,setNote]=useState("");
  const [picked,setPicked]=useState(null);       // null = use the auto top-3
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");
  const [result,setResult]=useState(null);

  const ranked = useMemo(()=>pool
    .map(a=>({ a, s:callScore(a,{div,day,needGoalie:goalie}) }))
    .filter(x=>x.s>=0).sort((x,y)=>y.s-x.s).map(x=>x.a),[pool,div,day,goalie]);
  const chosen = picked ?? (preset?.ids?.length ? preset.ids : ranked.slice(0,3).map(a=>a.id));
  const toggle = (id) => setPicked(chosen.includes(id) ? chosen.filter(i=>i!==id) : chosen.length<6 ? [...chosen,id] : chosen);

  const teams=(meta?.teams||[]).filter(t=>t.division===div);
  const team=teams.find(t=>String(t.id)===String(teamId));
  const teamName=team?team.name:teamText.trim();
  const canSend = chosen.length>0 && teamName && day && !busy;

  const send = async () => {
    setBusy(true); setErr("");
    try{
      const res = await fetch(`${API}/alternates/requests`,{ method:"POST",
        headers:{"Content-Type":"application/json","X-WP-Nonce":NONCE},
        body:JSON.stringify({ player_ids:chosen, team:teamName, division:div, game_date:dm[day].iso,
          game_label:dayText(dm,day), position:goalie?"goaltender":"", note }) });
      const d = await res.json();
      if(!res.ok) setErr(d?.error||d?.message||"Send failed.");
      else { setResult(d); onSent&&onSent(); }
    }catch(e){ setErr("Network error — check the Requests tab before trying again."); }
    setBusy(false);
  };

  if(result){
    const ok=result.results.filter(r=>r.status==="sent").length;
    const bad=result.results.length-ok;
    return (
      <Modal title="Requests sent" onClose={onClose}>
        <p style={{ fontFamily:F_UI,fontSize:14,color:INK,margin:"0 0 10px" }}>{ok} email{ok===1?"":"s"} sent{bad?`, ${bad} not sent`:""}. The first person to click Yes gets the spot — it is logged automatically and the others are told it's filled.</p>
        {result.results.filter(r=>r.status!=="sent").map((r,i)=><div key={i} style={{ fontFamily:F_UI,fontSize:13,color:"#991B1B" }}>Player {r.player_id}: {r.reason||r.status}</div>)}
        <button onClick={onClose} style={{ ...btnDark,marginTop:14 }}>Done</button>
      </Modal>
    );
  }
  return (
    <Modal title="Ask subs by email" sub="One tap Yes / No — first Yes wins" onClose={onClose} width={560}>
      <div style={{ display:"flex",flexDirection:"column",gap:13 }}>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
          <div><label style={lbl}>Division *</label>
            <select value={div} onChange={e=>{setDiv(e.target.value);setTeamId("");setPicked(null);}} style={inp}>
              {divs.map(d=><option key={d.key} value={d.key}>{d.label}</option>)}
            </select></div>
          <div><label style={lbl}>Game day *</label>
            <select value={day} onChange={e=>{setDay(e.target.value);setPicked(null);}} style={inp}>
              <option value="">Select day…</option>
              {DAYS.map(d=><option key={d} value={d}>{dayText(dm,d)}</option>)}
            </select></div>
        </div>
        <div><label style={lbl}>Team *</label>
          {teams.length>0 ? (
            <select value={teamId} onChange={e=>setTeamId(e.target.value)} style={inp}>
              <option value="">Select team…</option>
              {teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          ) : <input value={teamText} onChange={e=>setTeamText(e.target.value)} placeholder="Team name" style={inp} />}
        </div>
        <label style={{ display:"flex",gap:8,alignItems:"center",fontFamily:F_UI,fontSize:14,color:INK }}>
          <input type="checkbox" checked={goalie} onChange={e=>{setGoalie(e.target.checked);setPicked(null);}} /> We need a goalie
        </label>
        <div>
          <label style={lbl}>Who to ask (up to 6) — best match first</label>
          <div style={{ border:`1px solid ${LINE}`,borderRadius:8,maxHeight:210,overflowY:"auto" }}>
            {ranked.length===0 && <div style={{ padding:12,fontFamily:F_UI,fontSize:13,color:SOFT }}>No subs match this division and day.</div>}
            {ranked.map((a,i)=>(
              <label key={a.id} style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderBottom:`1px solid #F0EEE8`,cursor:"pointer" }}>
                <input type="checkbox" checked={chosen.includes(a.id)} onChange={()=>toggle(a.id)} />
                <span style={{ fontFamily:F_NUM,fontSize:12,color:SOFT,width:18 }}>{i+1}</span>
                <span style={{ fontFamily:F_UI,fontSize:14,fontWeight:600,color:INK,flex:1 }}>{a.first_name} {a.last_name}</span>
                <TierPill tier={a.skill_tier_reported} />
                <RelBadge alt={a} />
              </label>
            ))}
          </div>
        </div>
        <div><label style={lbl}>Message to include (optional)</label>
          <textarea value={note} onChange={e=>setNote(e.target.value)} rows={2} placeholder="Start time, rink, anything they should know" style={{ ...inp,resize:"vertical" }} /></div>
        {err && <div style={{ fontFamily:F_UI,fontSize:13,color:"#991B1B" }}>{err}</div>}
        <div style={{ display:"flex",gap:10 }}>
          <button onClick={onClose} style={{ ...btnLight,flex:1 }}>Cancel</button>
          <button onClick={send} disabled={!canSend} style={{ ...btnDark,flex:2,background:canSend?INK:"#ccc",color:canSend?GOLD:"#fff",cursor:canSend?"pointer":"not-allowed" }}>
            {busy?"Sending…":`Email ${chosen.length} sub${chosen.length===1?"":"s"} →`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Recruit goalies (reuses the renewal invite email) ───────────────────────
function RecruitGoaliesModal({ onClose, onSent }) {
  const [cands,setCands]=useState(null);
  const [sel,setSel]=useState([]);
  const [url,setUrl]=useState(""); const [subject,setSubject]=useState(""); const [body,setBody]=useState("");
  const [busy,setBusy]=useState(false); const [err,setErr]=useState(""); const [done,setDone]=useState(null);
  useEffect(()=>{
    const h={headers:{"X-WP-Nonce":NONCE}};
    fetch(`${API}/alternates/goalie-candidates`,h).then(r=>r.ok?r.json():[]).then(d=>setCands(Array.isArray(d)?d:[])).catch(()=>setCands([]));
    fetch(`${API}/renewals`,h).then(r=>r.ok?r.json():null).then(d=>{
      const s=d?.settings||{}; setUrl(s.registration_url||""); setSubject(s.subject||""); setBody(s.body||"");
    }).catch(()=>{});
  },[]);
  const toggle=(id)=>setSel(s=>s.includes(id)?s.filter(i=>i!==id):[...s,id]);
  const send=async()=>{
    setBusy(true); setErr("");
    try{
      const res=await fetch(`${API}/renewals/send`,{method:"POST",headers:{"Content-Type":"application/json","X-WP-Nonce":NONCE},
        body:JSON.stringify({ player_ids:sel, registration_url:url, subject, body })});
      const d=await res.json();
      if(!res.ok) setErr(d?.error||d?.message||"Send failed."); else { setDone(d); onSent&&onSent(); }
    }catch(e){ setErr("Network error — nothing was confirmed sent."); }
    setBusy(false);
  };
  if(done) return (
    <Modal title="Invites sent" onClose={onClose}>
      <p style={{ fontFamily:F_UI,fontSize:14,color:INK }}>Each goalie got their personal registration link. Remind them to choose sub when they register — they show up in the pool once they do.</p>
      <button onClick={onClose} style={btnDark}>Done</button>
    </Modal>
  );
  return (
    <Modal title="Recruit goalies" sub="Returning goalies who haven't registered this season" onClose={onClose} width={580}>
      <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
        <div style={{ border:`1px solid ${LINE}`,borderRadius:8,maxHeight:220,overflowY:"auto" }}>
          {cands===null && <div style={{ padding:12,fontFamily:F_UI,fontSize:13,color:SOFT }}>Loading…</div>}
          {cands && cands.length===0 && <div style={{ padding:12,fontFamily:F_UI,fontSize:13,color:SOFT }}>No unregistered returning goalies found.</div>}
          {(cands||[]).map(c=>(
            <label key={c.id} style={{ display:"flex",gap:10,alignItems:"center",padding:"8px 12px",borderBottom:"1px solid #F0EEE8",cursor:"pointer" }}>
              <input type="checkbox" checked={sel.includes(c.id)} onChange={()=>toggle(c.id)} />
              <span style={{ fontFamily:F_UI,fontSize:14,fontWeight:600,color:INK,flex:1 }}>{c.first_name} {c.last_name}</span>
              <span style={{ fontFamily:F_NUM,fontSize:12,color:SOFT }}>{c.last_played_year?`last played ${c.last_played_year}`:"no history"}</span>
            </label>
          ))}
        </div>
        <div><label style={lbl}>Registration page URL</label><input value={url} onChange={e=>setUrl(e.target.value)} style={inp} /></div>
        <div><label style={lbl}>Subject</label><input value={subject} onChange={e=>setSubject(e.target.value)} style={inp} /></div>
        <div><label style={lbl}>Message (keep {"{link}"} in it)</label><textarea rows={5} value={body} onChange={e=>setBody(e.target.value)} style={{ ...inp,resize:"vertical" }} /></div>
        {err && <div style={{ fontFamily:F_UI,fontSize:13,color:"#991B1B" }}>{err}</div>}
        <div style={{ display:"flex",gap:10 }}>
          <button onClick={onClose} style={{ ...btnLight,flex:1 }}>Cancel</button>
          <button disabled={!sel.length||busy} onClick={send} style={{ ...btnDark,flex:2,background:sel.length?INK:"#ccc",color:sel.length?GOLD:"#fff" }}>
            {busy?"Sending…":`Invite ${sel.length} goalie${sel.length===1?"":"s"} →`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Smart dispatch (who should I call?) ─────────────────────────────────────
function SmartDispatch({ pool, divs, filterDiv, filterDay, dm, onActivate, onAsk, onClose }) {
  const [skip,setSkip]=useState(new Set());
  const ranked = useMemo(()=>pool.filter(a=>!skip.has(a.id))
    .map(a=>({ a, s:callScore(a,{div:filterDiv,day:filterDay}) })).filter(x=>x.s>=0).sort((x,y)=>y.s-x.s),[pool,skip,filterDiv,filterDay]);
  const top = ranked.slice(0,4);
  return (
    <div style={{ background:INK,borderRadius:14,overflow:"hidden",marginBottom:18 }}>
      <div style={{ padding:"14px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid rgba(255,255,255,.1)" }}>
        <div>
          <div style={{ fontFamily:F_HEAD,fontSize:18,fontWeight:700,color:"#fff" }}>Who should I call?</div>
          <div style={{ fontFamily:F_UI,fontSize:13,color:"rgba(255,255,255,.65)" }}>
            Best tier, fewest past calls, most reliable{filterDiv?` · ${divs.find(d=>d.key===filterDiv)?.label||filterDiv}`:""}{filterDay?` · ${dayText(dm,filterDay)}`:""}
          </div>
        </div>
        <div style={{ display:"flex",gap:8 }}>
          {top.length>0 && <button onClick={()=>onAsk(top.slice(0,3).map(x=>x.a.id))} style={{ ...btnDark,background:GOLD,color:INK }}>Email top {Math.min(3,top.length)} →</button>}
          <button onClick={onClose} style={{ fontFamily:F_UI,fontSize:13,background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",color:"#fff",padding:"7px 12px",borderRadius:8,cursor:"pointer" }}>Hide</button>
        </div>
      </div>
      {top.length===0 ? <div style={{ padding:24,textAlign:"center",fontFamily:F_UI,fontSize:14,color:"rgba(255,255,255,.7)" }}>No available subs match these filters.</div> :
        top.map(({a},i)=>(
          <div key={a.id} style={{ display:"flex",alignItems:"center",gap:12,padding:"12px 20px",borderBottom:"1px solid rgba(255,255,255,.07)",background:i===0?"rgba(212,160,23,.1)":"transparent" }}>
            <div style={{ fontFamily:F_NUM,fontSize:14,color:i===0?GOLD:"rgba(255,255,255,.5)",width:20 }}>{i+1}</div>
            <div style={{ flex:1,minWidth:0 }}>
              <div style={{ fontFamily:F_HEAD,fontSize:15,fontWeight:700,color:i===0?GOLD:"#fff" }}>{a.first_name} {a.last_name} {goalieOf(a)&&<span style={{ fontFamily:F_UI,fontSize:12,color:"#f5c6c6",fontWeight:400 }}>· goalie</span>}</div>
              <div style={{ fontFamily:F_UI,fontSize:12.5,color:"rgba(255,255,255,.65)" }}>{[a.phone,...whyChips(a)].filter(Boolean).join(" · ")}</div>
            </div>
            <button onClick={()=>setSkip(s=>new Set([...s,a.id]))} style={{ fontFamily:F_UI,fontSize:12,background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.2)",color:"rgba(255,255,255,.8)",padding:"5px 10px",borderRadius:6,cursor:"pointer" }}>Skip</button>
            <button onClick={()=>onActivate(a)} style={{ fontFamily:F_UI,fontSize:12,fontWeight:700,background:i===0?GOLD:"transparent",color:i===0?INK:GOLD,border:`1px solid ${GOLD}`,padding:"5px 12px",borderRadius:6,cursor:"pointer" }}>Activate →</button>
          </div>
        ))}
    </div>
  );
}

// ─── Pool rows / cards ───────────────────────────────────────────────────────
const LIST_COLS = "34px minmax(160px,1.5fr) 62px minmax(110px,1fr) 190px minmax(130px,1fr) 100px";
function ListHeader() {
  return (
    <div style={{ display:"grid",gridTemplateColumns:LIST_COLS,gap:12,padding:"9px 16px",background:"#FAFAF8",borderBottom:`1px solid ${LINE}`,
      fontFamily:F_UI,fontSize:12,fontWeight:600,color:MUTED }}>
      <span /><span>Player</span><span>Tier</span><span>Divisions</span><span>Available</span><span>Usage</span><span />
    </div>
  );
}
function ListRow({ alt, dm, divLabel, filterDay, onActivate }) {
  const maxed = alt.today_activations>=alt.max_games_per_day;
  return (
    <div style={{ display:"grid",gridTemplateColumns:LIST_COLS,gap:12,alignItems:"center",padding:"10px 16px",borderBottom:"1px solid #F0EEE8",background:maxed?"#FEF7F7":"transparent" }}>
      <Avatar alt={alt} size={32} />
      <div style={{ minWidth:0 }}>
        <div style={{ fontFamily:F_HEAD,fontSize:15,fontWeight:700,color:INK }}>{alt.first_name} {alt.last_name} {goalieOf(alt)&&<GoalieTag />}</div>
        <div style={{ fontFamily:F_UI,fontSize:12.5,color:MUTED,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{alt.phone||alt.email}</div>
      </div>
      <div><TierPill tier={alt.skill_tier_reported} /></div>
      <div style={{ fontFamily:F_UI,fontSize:13,color:MUTED }}>{alt.division_eligibility.length?alt.division_eligibility.map(divLabel).join(", "):"All"}</div>
      <AvailabilityChips days={alt.available_days} filterDay={filterDay} dm={dm} />
      <div style={{ display:"flex",flexDirection:"column",gap:2 }}><StatusLine alt={alt} dm={dm} /><RelBadge alt={alt} /></div>
      <button onClick={()=>!maxed&&onActivate(alt)} disabled={maxed} style={{ ...btnDark,padding:"6px 10px",fontSize:12,background:maxed?"#EFEDE6":INK,color:maxed?"#8a8a96":GOLD,cursor:maxed?"not-allowed":"pointer" }}>{maxed?"Maxed":"Activate →"}</button>
    </div>
  );
}
function AlternateCard({ alt, dm, divLabel, filterDay, onActivate, onNoteChange }) {
  const [editing,setEditing]=useState(false);
  const [note,setNote]=useState(cleanNote(alt.notes));
  const maxed = alt.today_activations>=alt.max_games_per_day;
  return (
    <div style={{ background:"#fff",border:`1px solid ${maxed?"#FCA5A5":LINE}`,borderRadius:12,overflow:"hidden" }}>
      <div style={{ padding:"14px 16px",borderBottom:"1px solid #F0EEE8" }}>
        <div style={{ display:"flex",gap:10,alignItems:"center" }}>
          <Avatar alt={alt} size={38} />
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ fontFamily:F_HEAD,fontSize:16,fontWeight:700,color:INK }}>{alt.first_name} {alt.last_name}</div>
            {alt.phone && <a href={`tel:${alt.phone}`} style={{ fontFamily:F_NUM,fontSize:13,color:INK,textDecoration:"none" }}>{alt.phone}</a>}
          </div>
          <div style={{ textAlign:"right" }}><StatusLine alt={alt} dm={dm} /><div><RelBadge alt={alt} /></div></div>
        </div>
        <div style={{ display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",marginTop:8 }}>
          <TierPill tier={alt.skill_tier_reported} />
          {alt.position && !goalieOf(alt) && <span style={{ fontFamily:F_UI,fontSize:13,color:MUTED }}>{POSITION_LABEL[alt.position]}</span>}
          {goalieOf(alt) && <GoalieTag />}
          {alt.age && <span style={{ fontFamily:F_UI,fontSize:13,color:MUTED }}>Age {alt.age}</span>}
        </div>
      </div>
      <div style={{ padding:"12px 16px",display:"flex",flexDirection:"column",gap:10 }}>
        <div>
          <div style={lbl}>Available</div>
          <AvailabilityChips days={alt.available_days} filterDay={filterDay} dm={dm} />
          <div style={{ fontFamily:F_UI,fontSize:12.5,color:MUTED,marginTop:5 }}>Up to {alt.max_games_per_day}/day · {alt.late_game_available?"late games OK":"no late games"}</div>
        </div>
        <div>
          <div style={lbl}>Divisions</div>
          <div style={{ fontFamily:F_UI,fontSize:13,color:INK }}>{alt.division_eligibility.length?alt.division_eligibility.map(divLabel).join(", "):"All divisions"}</div>
        </div>
        <div>
          <div style={{ display:"flex",justifyContent:"space-between" }}>
            <div style={lbl}>Notes</div>
            <button onClick={()=>setEditing(e=>!e)} style={{ fontFamily:F_UI,fontSize:12,background:"none",border:"none",color:MUTED,cursor:"pointer",textDecoration:"underline" }}>{editing?"Cancel":"Edit"}</button>
          </div>
          {editing ? (
            <div style={{ display:"flex",gap:6 }}>
              <input value={note} onChange={e=>setNote(e.target.value)} style={inp} />
              <button onClick={()=>{onNoteChange(alt.id,note);setEditing(false);}} style={{ ...btnDark,padding:"4px 12px" }}>Save</button>
            </div>
          ) : <div style={{ fontFamily:F_UI,fontSize:13,color:note?INK:SOFT }}>{note||"No notes"}</div>}
        </div>
      </div>
      <div style={{ padding:"10px 16px 14px",borderTop:"1px solid #F0EEE8" }}>
        <button onClick={()=>!maxed&&onActivate(alt)} disabled={maxed} style={{ ...btnDark,width:"100%",background:maxed?"#EFEDE6":INK,color:maxed?"#8a8a96":GOLD,cursor:maxed?"not-allowed":"pointer" }}>{maxed?"Maxed out today":"Activate sub →"}</button>
      </div>
    </div>
  );
}

// ─── Coverage (heat map + goalie safety net) ─────────────────────────────────
function CoverageTab({ pool, divs, dm, onPick, onAsk, onRecruit }) {
  const cell = (div,day) => {
    const m = pool.filter(a=>eligibleFor(a,div)&&a.available_days.includes(day));
    return { n:m.length, g:m.filter(goalieOf).length, d:m.filter(a=>a.position==="defenseman").length,
             c:m.filter(a=>a.position==="center").length, w:m.filter(a=>a.position==="winger").length };
  };
  const grid = divs.map(dv=>({ dv, cells:DAYS.map(d=>cell(dv.key,d)) }));
  const noGoalie = grid.filter(r=>r.cells.every(c=>c.g===0));
  const partial  = grid.filter(r=>r.cells.some(c=>c.g===0) && !r.cells.every(c=>c.g===0));
  const shade = (c) => {
    if(c.n===0) return { bg:"#FDE2E2",fg:"#7A1818" };
    if(c.g===0) return { bg:"#FEF1DC",fg:"#7A4A00" };
    const k=Math.min(c.n,6)/6;
    return { bg:`rgba(26,26,46,${0.08+k*0.5})`, fg:k>0.55?"#fff":INK };
  };
  return (
    <div>
      <div style={{ background:"#fff",border:`1px solid ${LINE}`,borderRadius:12,padding:"16px 18px",marginBottom:16,overflowX:"auto" }}>
        <div style={{ fontFamily:F_HEAD,fontSize:17,fontWeight:700,color:INK,marginBottom:2 }}>Who can cover what</div>
        <div style={{ fontFamily:F_UI,fontSize:13,color:MUTED,marginBottom:12 }}>Subs available per division and day. Orange means no goalie sub, red means nobody. Click a cell to see them.</div>
        <table style={{ borderCollapse:"separate",borderSpacing:6,minWidth:520 }}>
          <thead><tr><th />{DAYS.map(d=><th key={d} style={{ fontFamily:F_UI,fontSize:13,fontWeight:600,color:INK,padding:"0 4px 4px" }}>{dayText(dm,d)}</th>)}</tr></thead>
          <tbody>
            {grid.map(({dv,cells})=>(
              <tr key={dv.key}>
                <td style={{ fontFamily:F_UI,fontSize:14,fontWeight:600,color:INK,paddingRight:10,whiteSpace:"nowrap" }}>{dv.label}</td>
                {cells.map((c,i)=>{
                  const s=shade(c);
                  return (
                    <td key={i} onClick={()=>onPick(dv.key,DAYS[i])} title={`${c.n} subs: ${c.d} D · ${c.c} C · ${c.w} W · ${c.g} G`}
                      style={{ background:s.bg,color:s.fg,borderRadius:8,textAlign:"center",padding:"10px 8px",minWidth:92,cursor:"pointer" }}>
                      <div style={{ fontFamily:F_NUM,fontSize:18,fontWeight:600 }}>{c.n}</div>
                      <div style={{ fontFamily:F_UI,fontSize:12 }}>{c.g>0?`${c.g} goalie${c.g>1?"s":""}`:"no goalie"}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ background:"#fff",border:`1px solid ${noGoalie.length?"#F5C2C2":LINE}`,borderRadius:12,padding:"16px 18px" }}>
        <div style={{ fontFamily:F_HEAD,fontSize:17,fontWeight:700,color:INK,marginBottom:6 }}>Goalie safety net</div>
        {noGoalie.length===0 && partial.length===0 && <div style={{ fontFamily:F_UI,fontSize:14,color:INK }}>Every division has a goalie sub on every day.</div>}
        {noGoalie.length>0 && <div style={{ fontFamily:F_UI,fontSize:14,color:"#991B1B",marginBottom:6 }}><b>No goalie sub at all:</b> {noGoalie.map(r=>r.dv.label).join(", ")}. If a starting goalie can't play, those divisions have no backup.</div>}
        {partial.length>0 && <div style={{ fontFamily:F_UI,fontSize:14,color:"#92400E",marginBottom:6 }}><b>Gaps on some days:</b> {partial.map(r=>`${r.dv.label} (${DAYS.map((d,i)=>r.cells[i].g===0?DAY_SHORT[d]:null).filter(Boolean).join(", ")})`).join(" · ")}</div>}
        <div style={{ display:"flex",gap:8,marginTop:8,flexWrap:"wrap" }}>
          <button onClick={onRecruit} style={btnDark}>Recruit goalies from returning players</button>
          <button onClick={()=>onAsk({ needGoalie:true })} style={btnLight}>Email goalie subs for a game</button>
        </div>
      </div>
    </div>
  );
}

// ─── Requests tab ────────────────────────────────────────────────────────────
const REQ_STATUS = { sent:["Waiting",MUTED], yes:["Said yes","#166534"], no:["Can't","#6b6b7b"], filled:["Spot filled","#6b6b7b"], expired:["No reply","#92400E"], failed:["Not sent","#991B1B"] };
function RequestsTab({ requests, divLabel, dm, onRefresh, onNew }) {
  return (
    <div style={{ background:"#fff",border:`1px solid ${LINE}`,borderRadius:12,overflow:"hidden" }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",borderBottom:"1px solid #F0EEE8" }}>
        <div style={{ fontFamily:F_HEAD,fontSize:17,fontWeight:700,color:INK }}>Email requests</div>
        <div style={{ display:"flex",gap:8 }}><button onClick={onRefresh} style={btnLight}>Refresh</button><button onClick={()=>onNew()} style={btnDark}>New request</button></div>
      </div>
      {requests.length===0 ? (
        <div style={{ padding:"40px 24px",textAlign:"center",fontFamily:F_UI,fontSize:14,color:MUTED }}>No requests yet. Pick a game and ask a few subs at once — the first to tap Yes gets the spot.</div>
      ) : requests.map(g=>{
        const filled=!!g.filled_by;
        const dayKey = DAYS.find(d=>dm[d].iso===g.game_date);
        return (
          <div key={g.group_id} style={{ padding:"12px 18px",borderBottom:"1px solid #F0EEE8" }}>
            <div style={{ display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap" }}>
              <div style={{ fontFamily:F_UI,fontSize:14,fontWeight:600,color:INK }}>{divLabel(g.division)} · {g.team} · {dayKey?dayText(dm,dayKey):g.game_date}{g.position==="goaltender"?" · goalie":""}</div>
              <div style={{ fontFamily:F_UI,fontSize:13,fontWeight:600,color:filled?"#166534":MUTED }}>{filled?`✓ Filled by ${g.filled_by}`:"Open"}</div>
            </div>
            <div style={{ display:"flex",gap:6,flexWrap:"wrap",marginTop:6 }}>
              {g.recipients.map((r,i)=>{ const [t,c]=REQ_STATUS[r.status]||[r.status,MUTED];
                return <span key={i} style={{ fontFamily:F_UI,fontSize:12.5,border:`1px solid ${LINE}`,borderRadius:99,padding:"2px 10px",color:c }}>{r.name} · {t}</span>; })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function Alternates() {
  const [alts,setAlts]=useState(null);
  const [loadErr,setLoadErr]=useState("");
  const [log,setLog]=useState([]);
  const [meta,setMeta]=useState(null);
  const [requests,setRequests]=useState([]);
  const [tab,setTab]=useState("pool");
  const [view,setView]=useState(null);               // null = auto by pool size
  const [filterDiv,setFilterDiv]=useState("");
  const [filterPos,setFilterPos]=useState("");
  const [filterDay,setFilterDay]=useState("");
  const [filterGoalie,setFilterGoalie]=useState(false);
  const [more,setMore]=useState(false);
  const [search,setSearch]=useState("");
  const [sortKey,setSortKey]=useState("call");
  const [activating,setActivating]=useState(null);   // { alt, preset }
  const [asking,setAsking]=useState(null);           // preset object
  const [recruiting,setRecruiting]=useState(false);
  const [showDispatch,setShowDispatch]=useState(false);
  const [toast,setToast]=useState(null);
  const [editDates,setEditDates]=useState(false);
  const [startDraft,setStartDraft]=useState("");

  const showToast=(m)=>{ setToast(m); setTimeout(()=>setToast(null),3800); };
  const headers={"Content-Type":"application/json","X-WP-Nonce":NONCE};

  const loadAlts=useCallback(()=>{
    fetch(`${API}/alternates`,{headers}).then(r=>r.ok?r.json():Promise.reject(new Error(`Server returned ${r.status}`)))
      .then(d=>{ if(!Array.isArray(d)) throw new Error("Unexpected response"); setAlts(d.map(a=>({ ...a,
          available_days:a.available_days||[], division_eligibility:a.division_eligibility||[], max_games_per_day:a.max_games_per_day||1,
          times_activated:a.times_activated||0 }))); setLoadErr(""); })
      .catch(e=>{ setLoadErr(e.message||"Could not load alternates"); setAlts(prev=>prev||[]); });
  },[]);
  const loadLog=useCallback(()=>{ fetch(`${API}/alternates/log`,{headers}).then(r=>r.ok?r.json():[]).then(d=>setLog(Array.isArray(d)?d:[])).catch(()=>{}); },[]);
  const loadMeta=useCallback(()=>{ fetch(`${API}/alternates/meta`,{headers}).then(r=>r.ok?r.json():null).then(d=>{ if(d) setMeta(d); }).catch(()=>{}); },[]);
  const loadReq=useCallback(()=>{ fetch(`${API}/alternates/requests`,{headers}).then(r=>r.ok?r.json():[]).then(d=>setRequests(Array.isArray(d)?d:[])).catch(()=>{}); },[]);
  useEffect(()=>{ loadAlts(); loadLog(); loadMeta(); loadReq(); },[]);
  useEffect(()=>{ if(tab!=="requests") return; const t=setInterval(()=>{loadReq();loadLog();loadAlts();},30000); return ()=>clearInterval(t); },[tab]);

  const dm   = useMemo(()=>buildDays(meta?.tournament_start||""),[meta?.tournament_start]);
  const divs = meta?.divisions?.length ? meta.divisions : FALLBACK_DIVISIONS;
  const divLabel = (k)=>divs.find(d=>d.key===k)?.label || k;

  const pool = useMemo(()=>(alts||[]).map(a=>({ ...a, today_activations:log.filter(e=>e.alternate_id===a.id&&e.game_date===todayIso).length })),[alts,log]);

  const saveStart = async () => {
    try{
      const res=await fetch(`${API}/alternates/meta`,{method:"POST",headers,body:JSON.stringify({tournament_start:startDraft})});
      const d=await res.json();
      if(!res.ok){ showToast(d?.error||"Could not save the date"); return; }
      setEditDates(false); loadMeta(); showToast("Tournament dates saved");
    }catch(e){ showToast("Could not save the date"); }
  };

  const confirmActivation = async (alt,{team,div,day,reason,notes}) => {
    setActivating(null);
    try{
      const res=await fetch(`${API}/alternates/${alt.id}/activate`,{method:"PATCH",headers,
        body:JSON.stringify({ team, division:div, game_date:dm[day].iso, reason, notes })});
      if(res.status===409){ showToast("Already logged for this game — skipped"); return; }
      if(!res.ok) throw new Error(`Server error ${res.status}`);
      loadLog(); loadAlts();
      showToast(`${alt.first_name} ${alt.last_name} activated for ${divLabel(div)} ${team}`);
    }catch(e){ showToast("Activation failed — check your connection and try again"); }
  };
  const noteChange=(id,note)=>setAlts(as=>as.map(a=>a.id===id?{...a,notes:note}:a));

  const filtered = useMemo(()=>{
    let a=[...pool];
    if(search) a=a.filter(x=>`${x.first_name} ${x.last_name} ${x.email}`.toLowerCase().includes(search.toLowerCase()));
    if(filterDiv) a=a.filter(x=>eligibleFor(x,filterDiv));
    if(filterPos) a=a.filter(x=>x.position===filterPos);
    if(filterDay) a=a.filter(x=>x.available_days.includes(filterDay));
    if(filterGoalie) a=a.filter(goalieOf);
    a.sort((x,y)=>{
      if(sortKey==="tier") return TIER_ORDER.indexOf(x.skill_tier_reported)-TIER_ORDER.indexOf(y.skill_tier_reported);
      if(sortKey==="usage") return x.times_activated-y.times_activated;
      if(sortKey==="avail") return y.available_days.length-x.available_days.length;
      if(sortKey==="rel") return (reliability(y)??-1)-(reliability(x)??-1);
      return callScore(y,{})-callScore(x,{});
    });
    return a;
  },[pool,search,filterDiv,filterPos,filterDay,filterGoalie,sortKey]);

  const goalieCount = pool.filter(goalieOf).length;
  const neverUsed   = pool.filter(a=>a.times_activated===0).length;
  const uncovered   = divs.filter(dv=>!pool.some(a=>goalieOf(a)&&eligibleFor(a,dv.key)));
  const activeFilters=[filterDiv,filterPos,filterDay].filter(Boolean).length+(filterGoalie?1:0)+(search?1:0);
  const reset=()=>{setFilterDiv("");setFilterPos("");setFilterDay("");setFilterGoalie(false);setSearch("");};
  const curView = view || (pool.length<=12 ? "list" : "card");

  const exportCSV=()=>{
    const rows=[["Name","Email","Phone","Tier","Position","Age","Divisions","Available Days","Max/Day","Late Games","Times Activated","Reliability %"],
      ...filtered.map(a=>[`${a.first_name} ${a.last_name}`,a.email,a.phone,a.skill_tier_reported,POSITION_LABEL[a.position]||"",a.age||"",
        a.division_eligibility.map(divLabel).join("|"),a.available_days.map(d=>DAY_SHORT[d]).join("|"),a.max_games_per_day,a.late_game_available?"Yes":"No",a.times_activated,reliability(a)??""])];
    const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    const el=document.createElement("a"); el.href=url; el.download="grsh-alternates.csv"; el.click(); URL.revokeObjectURL(url);
  };

  const openActivate=(alt,preset)=>setActivating({alt,preset});
  const tabs=[["pool","Sub pool"],["coverage","Coverage"],["requests",`Requests${requests.some(g=>!g.filled_by)?" ·  "+requests.filter(g=>!g.filled_by).length+" open":""}`],["log",`Activation log · ${log.length}`]];
  const startLabel = meta?.tournament_start ? `${dayText(dm,"thursday")} – ${dayText(dm,"sunday")}` : "";

  return (
    <div style={{ fontFamily:F_UI,background:PAPER,minHeight:"100vh",padding:"24px 28px 60px",maxWidth:1300,color:INK }}>
      <style>{`*{box-sizing:border-box} @media(max-width:768px){.alt-grid{grid-template-columns:1fr!important}}`}</style>

      {/* Header */}
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10,marginBottom:12 }}>
        <div>
          <h1 style={{ fontFamily:F_HEAD,fontSize:28,fontWeight:700,margin:"0 0 3px",letterSpacing:"-.5px" }}>Alternates</h1>
          <div style={{ fontSize:14,color:MUTED }}>
            {pool.length} subs · {goalieCount} goalie{goalieCount===1?"":"s"} · {neverUsed} not used yet · {log.length} activation{log.length===1?"":"s"} this season
            {startLabel && !editDates && <> · {startLabel} <button onClick={()=>{setStartDraft(meta.tournament_start);setEditDates(true);}} style={{ background:"none",border:"none",color:MUTED,textDecoration:"underline",cursor:"pointer",fontSize:13 }}>change</button></>}
          </div>
        </div>
        <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
          <button onClick={()=>setShowDispatch(d=>!d)} style={btnDark}>⚡ Who should I call?</button>
          <button onClick={()=>setAsking({})} style={btnDark}>✉ Ask subs by email</button>
          <button onClick={exportCSV} style={btnLight}>Export</button>
        </div>
      </div>

      {loadErr && (
        <div style={{ background:"#FEF2F2",border:"1px solid #FCA5A5",borderRadius:10,padding:"10px 16px",marginBottom:12,fontSize:14,color:"#991B1B",display:"flex",justifyContent:"space-between",gap:10 }}>
          <span>Couldn't load the sub pool ({loadErr}). Nothing below is made up — it will fill in once the server answers.</span>
          <button onClick={loadAlts} style={{ ...btnLight,padding:"3px 12px" }}>Retry</button>
        </div>
      )}

      {(meta && (!meta.tournament_start || editDates)) && (
        <div style={{ background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:10,padding:"10px 16px",marginBottom:12,display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",fontSize:14,color:"#7A4A00" }}>
          <span>{editDates?"Tournament Thursday:":"Set the tournament's Thursday so game days show real dates."}</span>
          <input type="date" value={startDraft} onChange={e=>setStartDraft(e.target.value)} style={{ ...inp,width:170 }} />
          {startDraft && new Date(startDraft+"T12:00:00").getDay()!==4 && <span style={{ fontSize:13 }}>That isn't a Thursday.</span>}
          <button onClick={saveStart} disabled={!startDraft} style={btnDark}>Save</button>
          {editDates && <button onClick={()=>setEditDates(false)} style={btnLight}>Cancel</button>}
        </div>
      )}

      {alts!==null && uncovered.length>0 && (
        <div style={{ background:"#FEF3C7",border:"1px solid #FDE68A",borderRadius:10,padding:"10px 16px",marginBottom:12,display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap",fontSize:14,color:"#7A4A00" }}>
          <span><b>{goalieCount===0?"No goalie subs registered.":`No goalie sub for ${uncovered.map(d=>d.label).join(", ")}.`}</b> If a starting goalie can't play, those divisions have no backup.</span>
          <button onClick={()=>setRecruiting(true)} style={btnDark}>Recruit goalies</button>
        </div>
      )}

      {showDispatch && <SmartDispatch pool={pool} divs={divs} filterDiv={filterDiv} filterDay={filterDay} dm={dm}
        onActivate={(a)=>openActivate(a,{division:filterDiv,day:filterDay})} onAsk={(ids)=>setAsking({ids,division:filterDiv,day:filterDay})} onClose={()=>setShowDispatch(false)} />}

      {/* Tabs */}
      <div style={{ display:"flex",gap:6,marginBottom:14,flexWrap:"wrap" }}>
        {tabs.map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{ fontFamily:F_UI,fontSize:14,fontWeight:600,padding:"8px 16px",borderRadius:8,cursor:"pointer",
            background:tab===k?INK:"transparent",color:tab===k?GOLD:MUTED,border:`1px solid ${tab===k?INK:LINE}` }}>{l}</button>
        ))}
      </div>

      {tab==="coverage" && <CoverageTab pool={pool} divs={divs} dm={dm}
        onPick={(div,day)=>{setFilterDiv(div);setFilterDay(day);setTab("pool");}} onAsk={setAsking} onRecruit={()=>setRecruiting(true)} />}

      {tab==="requests" && <RequestsTab requests={requests} divLabel={divLabel} dm={dm} onRefresh={()=>{loadReq();loadLog();}} onNew={()=>setAsking({})} />}

      {tab==="pool" && (
        <>
          {/* One-row filter bar */}
          <div style={{ display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:more?8:12 }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name or email" style={{ ...inp,width:210 }} />
            <div style={{ display:"flex",gap:5,flexWrap:"wrap" }}>
              {divs.map(d=>(
                <button key={d.key} onClick={()=>setFilterDiv(v=>v===d.key?"":d.key)} style={{ fontFamily:F_UI,fontSize:13,fontWeight:filterDiv===d.key?700:500,
                  background:filterDiv===d.key?INK:"#fff",color:filterDiv===d.key?GOLD:MUTED,border:`1px solid ${filterDiv===d.key?INK:LINE}`,padding:"5px 11px",borderRadius:99,cursor:"pointer" }}>{d.label}</button>
              ))}
            </div>
            <button onClick={()=>setMore(m=>!m)} style={{ ...btnLight,padding:"5px 12px" }}>{more?"Fewer filters":"More filters"}</button>
            <span style={{ fontSize:13,color:MUTED,marginLeft:"auto" }}>{filtered.length} of {pool.length}</span>
            {activeFilters>0 && <button onClick={reset} style={{ ...btnLight,padding:"5px 12px" }}>Reset ({activeFilters})</button>}
            <div style={{ display:"flex",border:`1px solid ${LINE}`,borderRadius:8,overflow:"hidden" }}>
              {[["list","List"],["card","Cards"]].map(([v,l])=>(
                <button key={v} onClick={()=>setView(v)} style={{ fontFamily:F_UI,fontSize:13,background:curView===v?INK:"#fff",color:curView===v?GOLD:MUTED,border:"none",padding:"6px 12px",cursor:"pointer" }}>{l}</button>
              ))}
            </div>
          </div>
          {more && (
            <div style={{ display:"flex",gap:14,flexWrap:"wrap",alignItems:"flex-end",background:"#fff",border:`1px solid ${LINE}`,borderRadius:10,padding:"12px 14px",marginBottom:12 }}>
              <div><label style={lbl}>Available day</label>
                <select value={filterDay} onChange={e=>setFilterDay(e.target.value)} style={{ ...inp,width:170 }}>
                  <option value="">Any day</option>{DAYS.map(d=><option key={d} value={d}>{dayText(dm,d)}</option>)}</select></div>
              <div><label style={lbl}>Position</label>
                <select value={filterPos} onChange={e=>setFilterPos(e.target.value)} style={{ ...inp,width:150 }}>
                  <option value="">All positions</option>{Object.entries(POSITION_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
              <div><label style={lbl}>Sort by</label>
                <select value={sortKey} onChange={e=>setSortKey(e.target.value)} style={{ ...inp,width:190 }}>
                  <option value="call">Call order (best first)</option><option value="tier">Tier</option><option value="usage">Least used</option>
                  <option value="rel">Most reliable</option><option value="avail">Most days available</option></select></div>
              <label style={{ display:"flex",gap:6,alignItems:"center",fontSize:14,color:INK,paddingBottom:8 }}>
                <input type="checkbox" checked={filterGoalie} onChange={e=>setFilterGoalie(e.target.checked)} /> Goalies only</label>
              <details style={{ marginLeft:"auto",fontSize:13,color:MUTED }}>
                <summary style={{ cursor:"pointer" }}>Tier guide</summary>
                <div style={{ position:"absolute",background:"#fff",border:`1px solid ${LINE}`,borderRadius:10,padding:"10px 14px",boxShadow:"0 8px 24px rgba(0,0,0,.12)",zIndex:50 }}>
                  {TIER_ORDER.map(t=><div key={t} style={{ display:"flex",gap:10,fontSize:13,padding:"1px 0" }}><span style={{ fontFamily:F_NUM,width:28 }}>{t}</span><span style={{ color:MUTED,flex:1 }}>{TIER_DESCRIPTIONS[t]}</span><span style={{ fontFamily:F_NUM }}>{computeScore(t,0,0)}</span></div>)}
                </div>
              </details>
            </div>
          )}

          {alts===null ? <div style={{ padding:40,textAlign:"center",color:MUTED }}>Loading…</div>
          : filtered.length===0 ? (
            <div style={{ background:"#fff",border:`1px solid ${LINE}`,borderRadius:12,padding:"44px 24px",textAlign:"center" }}>
              <div style={{ fontFamily:F_HEAD,fontSize:17,fontWeight:700,marginBottom:6 }}>{pool.length===0?"No subs registered yet":"No subs match these filters"}</div>
              {activeFilters>0 && <button onClick={reset} style={btnDark}>Reset filters</button>}
            </div>
          ) : curView==="list" ? (
            <div style={{ background:"#fff",border:`1px solid ${LINE}`,borderRadius:12,overflow:"hidden" }}>
              <ListHeader />
              {filtered.map(a=><ListRow key={a.id} alt={a} dm={dm} divLabel={divLabel} filterDay={filterDay} onActivate={(x)=>openActivate(x,{division:filterDiv,day:filterDay})} />)}
            </div>
          ) : (
            <div className="alt-grid" style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))",gap:14 }}>
              {filtered.map(a=><AlternateCard key={a.id} alt={a} dm={dm} divLabel={divLabel} filterDay={filterDay} onActivate={(x)=>openActivate(x,{division:filterDiv,day:filterDay})} onNoteChange={noteChange} />)}
            </div>
          )}
        </>
      )}

      {tab==="log" && (
        <div style={{ background:"#fff",border:`1px solid ${LINE}`,borderRadius:12,overflow:"hidden" }}>
          {log.length===0 ? (
            <div style={{ padding:"44px 24px",textAlign:"center",fontSize:14,color:MUTED }}>No activations yet this season. When a sub is activated — by you or by an email reply — it shows up here.</div>
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%",borderCollapse:"collapse" }}>
                <thead><tr>{["Sub","Division","Team","Game day","Reason","By","Notes"].map(h=>(
                  <th key={h} style={{ fontFamily:F_UI,fontSize:12,fontWeight:600,color:MUTED,padding:"10px 14px",textAlign:"left",borderBottom:`1px solid ${LINE}`,background:"#FAFAF8" }}>{h}</th>))}</tr></thead>
                <tbody>{log.map(e=>{
                  const dk=DAYS.find(d=>dm[d].iso===e.game_date);
                  return (
                    <tr key={e.id} style={{ borderBottom:"1px solid #F0EEE8" }}>
                      <td style={{ padding:"10px 14px",fontFamily:F_HEAD,fontSize:14,fontWeight:600 }}>{e.player_name}</td>
                      <td style={{ padding:"10px 14px",fontSize:13,color:INK }}>{divLabel(e.division)}</td>
                      <td style={{ padding:"10px 14px",fontSize:13,color:INK }}>{e.team}</td>
                      <td style={{ padding:"10px 14px",fontSize:13,color:INK }}>{dk?dayText(dm,dk):e.game_date}</td>
                      <td style={{ padding:"10px 14px",fontSize:13,color:MUTED }}>{(e.reason||"").replace("_"," ")}</td>
                      <td style={{ padding:"10px 14px",fontSize:13,color:INK }}>{e.activated_by}</td>
                      <td style={{ padding:"10px 14px",fontSize:13,color:MUTED }}>{e.notes||"—"}</td>
                    </tr>); })}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activating && <ActivateModal alt={activating.alt} meta={meta} dm={dm} log={log} preset={activating.preset}
        onConfirm={(d)=>confirmActivation(activating.alt,d)} onClose={()=>setActivating(null)} />}
      {asking && <RequestModal pool={pool} meta={meta} dm={dm} preset={asking} onClose={()=>setAsking(null)} onSent={()=>{loadReq();}} />}
      {recruiting && <RecruitGoaliesModal onClose={()=>setRecruiting(false)} onSent={()=>{}} />}

      {toast && (
        <div style={{ position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",fontSize:14,fontWeight:600,background:INK,color:GOLD,
          padding:"11px 22px",borderRadius:99,boxShadow:"0 8px 24px rgba(0,0,0,.2)",zIndex:200000 }}>{toast}</div>
      )}
    </div>
  );
}
