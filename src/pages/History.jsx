import { useState, useMemo, useEffect, useRef } from "react";

// ─── API ──────────────────────────────────────────────────────────────────────
const API   = window.grshConfig?.apiUrl || "/wp-json/grsh/v1";
const NONCE = window.grshConfig?.nonce  || "";

// ─── Config ───────────────────────────────────────────────────────────────────
const DIVISION_LABEL = { gold_open:"Gold Open","45a":"45A",senior_b:"Senior B",senior_c:"Senior C" };
const DIVISION_COLOR = {
  gold_open:{ bg:"#FEF9E7",color:"#92601A",border:"#F5D77E" },
  "45a":    { bg:"#E8F6F8",color:"#1A5F6B",border:"#9DD5DC" },
  senior_b: { bg:"#F3EEF9",color:"#4A3070",border:"#C4AEED" },
  senior_c: { bg:"#FDF0E8",color:"#7A3318",border:"#F5B993" },
};
const DIVISION_HUE = { gold_open:"#D4A017","45a":"#2196a8",senior_b:"#7B5EA7",senior_c:"#B05E3A" };
const POSITION_LABEL = { defenseman:"Defense",center:"Center",winger:"Winger",goaltender:"Goalie" };
const TIER_ORDER = ["A1","A2","A3","B1","B2","B3","C1","C2","R1","R2","R3"];
const TIER_VAL   = (t) => TIER_ORDER.indexOf(t);
const TIER_COLOR = (t) => {
  if(!t) return { bg:"#F3F4F6",color:"#6B7280" };
  const f=t[0];
  if(f==="A") return { bg:"#FCE8E8",color:"#7A1818" };
  if(f==="B") return { bg:"#FEF0E8",color:"#7A4518" };
  if(f==="C") return { bg:"#FEF9E7",color:"#7A5A18" };
  return { bg:"#E8F0FE",color:"#1A3F8F" };
};
const AVATAR_COLORS = ["#1a1a2e","#1E3A5F","#3B1F5E","#1F4E3B","#5E3B1F","#4A1F1F","#1F3D4E","#3D2B1F"];
const avatarColor = (id) => AVATAR_COLORS[id % AVATAR_COLORS.length];

// #2 Title-case helper
const titleCase = (s) => s ? s.replace(/\b\w/g,c=>c.toUpperCase()) : "";

// ─── Mock data (fallback when API unavailable) ────────────────────────────────
const MOCK_PLAYERS = [
  { id:3,  first_name:"dave",  last_name:"Kowalski",  email:"d.kowalski@email.com",  age:47, skill_tier_reported:"B1", position:"defenseman", sandbagging_flag:true,  no_show_count:0, attendance_rating:100,
    history:[
      { season:2026,division:"gold_open",team:"Team Gold",finish:1,championship:"winner",   was_captain:true, skill_tier:"B1",games_scheduled:6,games_attended:6,no_show:0},
      { season:2025,division:"gold_open",team:"Team Blue",finish:2,championship:"runner_up",was_captain:false,skill_tier:"B2",games_scheduled:6,games_attended:6,no_show:0},
      { season:2024,division:"senior_b", team:"Team Red", finish:3,championship:"participant",was_captain:false,skill_tier:"C1",games_scheduled:5,games_attended:5,no_show:0},
    ]},
  { id:10, first_name:"Mike",  last_name:"Hartley",   email:"m.hartley@email.com",   age:49, skill_tier_reported:"A2", position:"winger",     sandbagging_flag:true,  no_show_count:0, attendance_rating:100,
    history:[
      { season:2026,division:"gold_open",team:"Team Red", finish:1,championship:"winner",   was_captain:true, skill_tier:"A2",games_scheduled:6,games_attended:6,no_show:0},
      { season:2025,division:"gold_open",team:"Team Gold",finish:1,championship:"winner",   was_captain:false,skill_tier:"A2",games_scheduled:6,games_attended:6,no_show:0},
      { season:2024,division:"gold_open",team:"Team Blue",finish:2,championship:"runner_up",was_captain:false,skill_tier:"A1",games_scheduled:5,games_attended:5,no_show:0},
    ]},
  { id:4,  first_name:"Janet", last_name:"Ruiz",      email:"j.ruiz@email.com",      age:51, skill_tier_reported:"C1", position:"goaltender", sandbagging_flag:false, no_show_count:1, attendance_rating:83,
    history:[
      { season:2026,division:"senior_c",team:"Team Blue",finish:2,championship:"runner_up",  was_captain:false,skill_tier:"C1",games_scheduled:6,games_attended:5,no_show:1},
      { season:2025,division:"senior_c",team:"Team Gold",finish:3,championship:"participant",was_captain:false,skill_tier:"C2",games_scheduled:6,games_attended:6,no_show:0},
    ]},
  { id:12, first_name:"amy",   last_name:"buchanan",  email:"a.buchanan@email.com",  age:48, skill_tier_reported:"R1", position:null,         sandbagging_flag:false, no_show_count:0, attendance_rating:100,
    history:[
      { season:2026,division:"gold_open",team:"Sub pool",finish:null,championship:"none",      was_captain:false,skill_tier:"R1",games_scheduled:3,games_attended:3,no_show:0},
      { season:2025,division:"gold_open",team:"Team Red",finish:3,  championship:"participant",was_captain:false,skill_tier:"R2",games_scheduled:6,games_attended:6,no_show:0},
    ]},
  { id:8,  first_name:"Linda", last_name:"Tran",      email:"l.tran@email.com",      age:53, skill_tier_reported:"R2", position:"goaltender", sandbagging_flag:false, no_show_count:0, attendance_rating:100,
    history:[
      { season:2026,division:"45a",team:"Team Gold",finish:1,championship:"winner",   was_captain:false,skill_tier:"R2",games_scheduled:6,games_attended:6,no_show:0},
      { season:2025,division:"45a",team:"Team Blue",finish:2,championship:"runner_up",was_captain:false,skill_tier:"R3",games_scheduled:6,games_attended:6,no_show:0},
      { season:2024,division:"45a",team:"Team Gold",finish:1,championship:"winner",   was_captain:true, skill_tier:"R3",games_scheduled:5,games_attended:5,no_show:0},
    ]},
  { id:9,  first_name:"Ray",   last_name:"Dominguez", email:"r.dominguez@email.com", age:55, skill_tier_reported:"C2", position:"center",     sandbagging_flag:false, no_show_count:2, attendance_rating:67,
    history:[
      { season:2026,division:"senior_b",team:"Team Red", finish:3,championship:"participant",was_captain:false,skill_tier:"C2",games_scheduled:6,games_attended:4,no_show:2},
      { season:2025,division:"senior_b",team:"Team Blue",finish:1,championship:"winner",    was_captain:true, skill_tier:"C1",games_scheduled:5,games_attended:5,no_show:0},
    ]},
];

// ─── Aggregate flat API records → player objects ──────────────────────────────
const toB=(v)=>v===true||v===1||v==="1"||v==="yes"||v==="Yes"||v==="true";
function aggregateRecords(records) {
  const map = {};
  records.forEach(r => {
    const key = (r.email||"").toLowerCase().trim();
    if (!key) return;
    if (!map[key]) {
      map[key] = {
        id: r.id, first_name:r.first_name||"", last_name:r.last_name||"",
        email:r.email||"", skill_tier_reported:r.skill_tier_reported||r.skill_tier||null,
        position:r.position||null, sandbagging_flag:false,
        no_show_count:0, attendance_rating:null, history:[], _latest:0,
      };
    }
    const p = map[key];
    const isCaptain = toB(r.was_captain)||toB(r.is_captain);
    const isSandbag = toB(r.sandbagging_flag)||toB(r.is_sandbagging);
    p.history.push({
      season:          +r.season_year,
      division:        r.division_played||r.division||"",
      team:            r.team_name||r.team||"—",
      finish:          r.finish_position||r.finish||null,
      championship:    r.championship_result||r.championship||"none",
      was_captain:     isCaptain,
      sandbagging_flag:isSandbag,
      was_alternate:   toB(r.was_alternate),
      skill_tier:      r.skill_tier_reported||r.skill_tier||null,
      games_scheduled: +r.games_scheduled||0,
      games_attended:  +r.games_attended||0,
      no_show:         +r.no_show_count||0,
    });
    p.no_show_count += (+r.no_show_count||0);
    if (isSandbag) p.sandbagging_flag = true;
    if (+r.season_year > p._latest) {
      p._latest = +r.season_year;
      p.skill_tier_reported = r.skill_tier_reported||r.skill_tier||p.skill_tier_reported;
    }
  });
  return Object.values(map).map(p => {
    delete p._latest;
    const sch = p.history.reduce((s,h)=>s+(h.games_scheduled||0),0);
    const att = p.history.reduce((s,h)=>s+(h.games_attended||0),0);
    p.attendance_rating = sch>0 ? Math.round(att/sch*100) : null;
    p.history.sort((a,b)=>b.season-a.season);
    return p;
  });
}

// ─── Tier trend ───────────────────────────────────────────────────────────────
function tierTrend(history) {
  if (history.length < 2) return "stable";
  // earliest vs most recent — lower index in TIER_ORDER = better skill
  const newest   = TIER_VAL(history[0].skill_tier);
  const earliest = TIER_VAL(history[history.length-1].skill_tier);
  if (newest < earliest) return "improved";
  if (newest > earliest) return "declined";
  return "stable";
}
const TREND = {
  improved:{ arrow:"↑",color:"#166534",label:"Improving" },
  declined:{ arrow:"↓",color:"#991B1B",label:"Declining" },
  stable:  { arrow:"→",color:"#6B7280",label:"Stable"    },
};

// ─── WOW 2: Tier sparkline ────────────────────────────────────────────────────
function TierSparkline({ history }) {
  if (history.length < 2) {
    const tc = TIER_COLOR(history[0]?.skill_tier);
    return <span style={{ fontFamily:"'DM Mono',monospace",fontSize:9,
      background:tc.bg,color:tc.color,padding:"1px 5px",borderRadius:3 }}>
      {history[0]?.skill_tier||"—"}
    </span>;
  }
  const vals = [...history].sort((a,b)=>a.season-b.season).map(h=>TIER_VAL(h.skill_tier));
  const min=Math.min(...vals), max=Math.max(...vals,min+1);
  const W=52, H=18, pad=2;
  const x=(i)=>pad+((i/(vals.length-1))*(W-pad*2));
  const y=(v)=>pad+((v-min)/(max-min+1))*(H-pad*2);
  const pts=vals.map((v,i)=>`${x(i)},${y(v)}`).join(" ");
  const trend=tierTrend(history);
  const col=trend==="improved"?"#166534":trend==="declined"?"#991B1B":"#6B7280";
  return (
    <div style={{ display:"flex",alignItems:"center",gap:5 }}>
      <svg width={W} height={H} style={{ flexShrink:0 }}>
        <polyline points={pts} fill="none" stroke={col} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        {vals.map((v,i)=><circle key={i} cx={x(i)} cy={y(v)} r={i===vals.length-1?2.5:1.5} fill={i===vals.length-1?col:"#E8E6DF"}/>)}
      </svg>
      <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:700,color:col }}>
        {TREND[trend].arrow}
      </span>
    </div>
  );
}

// ─── WOW 4: DNA avatar ────────────────────────────────────────────────────────
function DNAAvatar({ player, size=32 }) {
  const seasons   = player.history.length;
  const champs    = player.history.filter(h=>h.championship==="winner").length;
  const att       = player.attendance_rating||100;
  const divs      = [...new Set(player.history.map(h=>h.division))];
  const baseColor = DIVISION_HUE[divs[0]] || avatarColor(player.id);
  const rings     = Math.min(seasons, 4);
  const glow      = champs > 0;
  const initials  = `${titleCase(player.first_name)[0]||""}${titleCase(player.last_name)[0]||""}`;
  return (
    <div style={{ position:"relative",width:size,height:size,flexShrink:0 }}>
      {/* Outer rings showing career depth */}
      {[...Array(rings)].map((_, i) => (
        <div key={i} style={{
          position:"absolute",
          inset: -(i+1)*2,
          borderRadius:"50%",
          border:`1px solid ${baseColor}`,
          opacity: 0.15 + i*0.05,
        }}/>
      ))}
      {/* Main circle */}
      <div style={{
        position:"absolute",inset:0,borderRadius:"50%",
        background:baseColor,
        boxShadow: glow ? `0 0 0 2px #fff, 0 0 0 3px #D4A017` : "none",
        display:"flex",alignItems:"center",justifyContent:"center",
        fontFamily:"'DM Mono',monospace",fontSize:size*0.32,fontWeight:500,color:"#D4A017",
      }}>
        {initials}
      </div>
    </div>
  );
}

// ─── WOW 1: Career Timeline ───────────────────────────────────────────────────
function CareerTimeline({ player }) {
  const sorted = [...player.history].sort((a,b)=>a.season-b.season);
  const [hov, setHov] = useState(null);
  return (
    <div style={{ padding:"16px 20px",borderBottom:"1px solid #F0EEE8" }}>
      <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",
        textTransform:"uppercase",letterSpacing:".08em",marginBottom:12 }}>
        Career timeline · {sorted[0]?.season}–{sorted[sorted.length-1]?.season}
      </div>
      <div style={{ display:"flex",alignItems:"center",gap:0,overflowX:"auto",paddingBottom:4 }}>
        {sorted.map((h,i)=>{
          const dc=DIVISION_COLOR[h.division]||{};
          const isChamp=h.championship==="winner";
          const isHov=hov===i;
          return (
            <div key={h.season} style={{ display:"flex",alignItems:"center",flex:1,minWidth:60 }}>
              <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:3,
                cursor:"pointer",flex:1 }}
                onMouseEnter={()=>setHov(i)} onMouseLeave={()=>setHov(null)}>
                {/* Season dot */}
                <div style={{
                  width:isChamp?22:16,height:isChamp?22:16,borderRadius:"50%",
                  background:isChamp?"#D4A017":dc.bg||"#F0EEE8",
                  border:`2px solid ${isChamp?"#B8860B":dc.border||"#E8E6DF"}`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:isChamp?10:8,
                  transition:"all .2s",transform:isHov?"scale(1.2)":"scale(1)",
                }}>
                  {isChamp?"🏆":h.was_captain?"©":""}
                </div>
                <span style={{ fontFamily:"'Fraunces',serif",fontSize:11,fontWeight:700,
                  color:"#1a1a2e" }}>{h.season}</span>
                <span style={{ fontFamily:"'DM Mono',monospace",fontSize:8,color:dc.color||"#888",
                  textAlign:"center",lineHeight:1.2 }}>
                  {DIVISION_LABEL[h.division]||h.division}
                </span>
              </div>
              {/* Connector line */}
              {i<sorted.length-1&&<div style={{ height:2,flex:0.5,background:"#E8E6DF",minWidth:8 }}/>}
            </div>
          );
        })}
      </div>
      {/* Expanded season detail on hover */}
      {hov!==null&&sorted[hov]&&(
        <div style={{ marginTop:10,background:"#F6F5F0",borderRadius:8,padding:"10px 12px",
          fontFamily:"'DM Mono',monospace",fontSize:10,color:"#555",
          display:"grid",gridTemplateColumns:"1fr 1fr",gap:6 }}>
          {[
            ["Season",    sorted[hov].season],
            ["Division",  DIVISION_LABEL[sorted[hov].division]||sorted[hov].division],
            ["Team",      sorted[hov].team],
            ["Tier",      sorted[hov].skill_tier],
            ["Result",    sorted[hov].championship==="winner"?"🏆 Champion":sorted[hov].championship],
            ["Captain",   sorted[hov].was_captain?"Yes":"No"],
            ["Attended",  `${sorted[hov].games_attended}/${sorted[hov].games_scheduled} games`],
            ["No-shows",  sorted[hov].no_show],
          ].map(([k,v])=>(
            <div key={k} style={{ display:"flex",gap:6 }}>
              <span style={{ color:"#aaa",minWidth:56 }}>{k}</span>
              <strong style={{ color:"#1a1a2e" }}>{v}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── WOW 8: Career card generator ────────────────────────────────────────────
function generateCareerCard(player) {
  const sorted=[...player.history].sort((a,b)=>a.season-b.season);
  const champs=player.history.filter(h=>h.championship==="winner");
  const caps  =player.history.filter(h=>h.was_captain);
  const divs  =[...new Set(player.history.map(h=>DIVISION_LABEL[h.division]||h.division))];
  const name  =`${titleCase(player.first_name)} ${titleCase(player.last_name)}`;
  const win=window.open("","_blank","width=500,height=360");
  if(!win)return;
  win.document.write(`<!DOCTYPE html><html><head><title>${name} · GRSH Career</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{background:#1a1a2e;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:Georgia,serif;padding:20px}
  .card{width:440px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4)}
  .head{background:#1a1a2e;padding:24px;display:flex;align-items:center;gap:16}
  .av{width:56px;height:56px;border-radius:50%;background:#D4A017;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:#1a1a2e;border:3px solid rgba(212,160,23,.3)}
  h1{font-size:20px;color:#fff;margin:0 0 3px}
  .sub{font-family:monospace;font-size:11px;color:rgba(255,255,255,.4)}
  .body{padding:20px;display:grid;grid-template-columns:1fr 1fr;gap:14}
  .stat{text-align:center;padding:12px;background:#F6F5F0;border-radius:8px}
  .val{font-size:24px;font-weight:700;color:#1a1a2e}
  .lab{font-family:monospace;font-size:9px;color:#aaa;text-transform:uppercase;letter-spacing:.07em;margin-top:3px}
  .timeline{background:#F6F5F0;padding:14px;margin:0 20px 20px;border-radius:8px}
  .tl-title{font-family:monospace;font-size:9px;color:#aaa;text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px}
  .tl-row{display:flex;align-items:center;gap:8;padding:3px 0;font-family:monospace;font-size:11px;color:#555}
  .tl-dot{width:8px;height:8px;border-radius:50%;background:#1a1a2e;flex-shrink:0}
  footer{background:#F6F5F0;padding:10px 20px;display:flex;justify-content:space-between;font-family:monospace;font-size:9px;color:#aaa;border-top:1px solid #E8E6DF}
  .badge{background:#D4A017;color:#1a1a2e;padding:1px 6px;border-radius:3px;font-weight:700}
  </style></head><body><div class="card">
  <div class="head">
    <div class="av">${name.split(" ").map(w=>w[0]).join("").slice(0,2)}</div>
    <div><h1>${name}</h1><div class="sub">${player.email}</div></div>
    ${champs.length>0?`<div style="margin-left:auto"><span class="badge">🏆 ${champs.length}× Champion</span></div>`:""}
  </div>
  <div class="body">
    <div class="stat"><div class="val">${player.history.length}</div><div class="lab">Seasons played</div></div>
    <div class="stat"><div class="val">${champs.length}</div><div class="lab">Championships</div></div>
    <div class="stat"><div class="val">${caps.length}</div><div class="lab">Seasons as captain</div></div>
    <div class="stat"><div class="val">${player.attendance_rating!=null?player.attendance_rating+"%":"—"}</div><div class="lab">Attendance rate</div></div>
  </div>
  <div class="timeline">
    <div class="tl-title">Career history</div>
    ${sorted.map(h=>`<div class="tl-row"><div class="tl-dot"></div><strong>${h.season}</strong> &nbsp; ${DIVISION_LABEL[h.division]||h.division} &nbsp; ${h.skill_tier} ${h.championship==="winner"?" · 🏆":""} ${h.was_captain?" · © Captain":""}</div>`).join("")}
  </div>
  <footer><span>Gold Rush Senior Hockey Tournament</span><span>Season 2027</span></footer>
  </div></body></html>`);
  win.document.close();
  setTimeout(()=>win.print(),500);
}

// ─── WOW 5: Sandbagging predictor ────────────────────────────────────────────
function SandbagPredictor({ players, onClose }) {
  const risks = useMemo(()=>{
    return players.map(p=>{
      const hist = p.history.filter(h=>h.skill_tier);
      if (!hist.length) return null;
      const avgIdx = hist.reduce((s,h)=>s+TIER_VAL(h.skill_tier),0)/hist.length;
      const curIdx = TIER_VAL(p.skill_tier_reported);
      const gap    = curIdx - avgIdx; // positive = reported lower tier than history = risk
      return { ...p, avgIdx, curIdx, gap,
        riskScore: Math.round(Math.min(100, Math.max(0, gap*20))),
        avgTier: TIER_ORDER[Math.round(avgIdx)]||"—",
      };
    }).filter(Boolean).sort((a,b)=>b.riskScore-a.riskScore);
  },[players]);
  const high   = risks.filter(p=>p.riskScore>=70);
  const medium = risks.filter(p=>p.riskScore>=40&&p.riskScore<70);
  const low    = risks.filter(p=>p.riskScore<40&&p.riskScore>0);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:2000,
      display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#fff",borderRadius:14,maxWidth:620,width:"100%",
        maxHeight:"85vh",overflow:"hidden",display:"flex",flexDirection:"column",
        boxShadow:"0 32px 80px rgba(0,0,0,.25)"}}>
        <div style={{padding:"18px 22px 14px",background:"#1a1a2e",display:"flex",
          justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#D4A017",
              textTransform:"uppercase",letterSpacing:".1em",marginBottom:3}}>⚡ 2027 Risk Analysis</div>
            <h2 style={{fontFamily:"'Fraunces',serif",fontSize:18,fontWeight:700,color:"#fff",margin:0}}>
              Historical Sandbagging Predictor
            </h2>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"rgba(255,255,255,.4)",marginTop:3}}>
              Compares 2027 self-reported tier against 5-season historical average
            </div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#D4A017",fontSize:16,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{overflowY:"auto",flex:1}}>
          {[{label:"High risk",items:high,col:"#991B1B",bg:"#FEF2F2",border:"#FCA5A5"},
            {label:"Medium risk",items:medium,col:"#92400E",bg:"#FFFBEB",border:"#FDE68A"},
            {label:"Low risk / consistent",items:low,col:"#166534",bg:"#F0FDF4",border:"#86EFAC"}].map(grp=>(
            grp.items.length>0&&(
              <div key={grp.label} style={{borderBottom:"1px solid #F0EEE8"}}>
                <div style={{padding:"10px 22px",background:grp.bg,fontFamily:"'DM Mono',monospace",
                  fontSize:10,fontWeight:600,color:grp.col,textTransform:"uppercase",
                  letterSpacing:".07em",display:"flex",justifyContent:"space-between"}}>
                  <span>{grp.label}</span>
                  <span>{grp.items.length} player{grp.items.length!==1?"s":""}</span>
                </div>
                {grp.items.map(p=>(
                  <div key={p.id} style={{display:"flex",alignItems:"center",gap:12,
                    padding:"10px 22px",borderBottom:"1px solid #F9F8F4"}}>
                    <DNAAvatar player={p} size={28}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:600,color:"#1a1a2e"}}>
                        {titleCase(p.first_name)} {titleCase(p.last_name)}
                      </div>
                      <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#888"}}>
                        Historical avg tier: {p.avgTier} · Self-reported for 2027: {p.skill_tier_reported}
                        {p.gap>0?" — registered LOWER than history":p.gap<0?" — registered HIGHER than history":" — consistent"}
                      </div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,color:grp.col}}>{p.riskScore}</div>
                      <div style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:"#aaa"}}>risk score</div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ))}
          {risks.every(p=>p.riskScore===0)&&(
            <div style={{padding:"48px 24px",textAlign:"center"}}>
              <div style={{fontSize:28,marginBottom:8}}>✅</div>
              <p style={{fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,color:"#166534",margin:0}}>
                All players consistent with historical tiers
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── WOW 3: Season diff mode ──────────────────────────────────────────────────
function SeasonDiff({ players, onClose }) {
  const allYears = useMemo(()=>{
    const s=new Set();players.forEach(p=>p.history.forEach(h=>s.add(h.season)));
    return [...s].sort((a,b)=>b-a);
  },[players]);
  const [yr1,setYr1] = useState(allYears[1]||allYears[0]);
  const [yr2,setYr2] = useState(allYears[0]);
  const s1=new Set(players.filter(p=>p.history.some(h=>+h.season===+yr1)).map(p=>p.email));
  const s2=new Set(players.filter(p=>p.history.some(h=>+h.season===+yr2)).map(p=>p.email));
  const joined   =players.filter(p=>s2.has(p.email)&&!s1.has(p.email));
  const left     =players.filter(p=>s1.has(p.email)&&!s2.has(p.email));
  const both     =players.filter(p=>s1.has(p.email)&&s2.has(p.email));
  const selS={fontFamily:"'DM Mono',monospace",fontSize:11,background:"rgba(255,255,255,.1)",
    border:"1px solid rgba(255,255,255,.2)",borderRadius:6,color:"#fff",padding:"5px 10px",outline:"none"};
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:2000,
      display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#fff",borderRadius:14,maxWidth:680,width:"100%",
        maxHeight:"85vh",overflow:"hidden",display:"flex",flexDirection:"column",
        boxShadow:"0 32px 80px rgba(0,0,0,.25)"}}>
        <div style={{padding:"18px 22px 14px",background:"#1a1a2e",display:"flex",
          justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
          <div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#D4A017",
              textTransform:"uppercase",letterSpacing:".1em",marginBottom:3}}>Season Comparison</div>
            <h2 style={{fontFamily:"'Fraunces',serif",fontSize:17,fontWeight:700,color:"#fff",margin:0}}>
              Season diff view
            </h2>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <select value={yr1} onChange={e=>setYr1(+e.target.value)} style={selS}>
              {allYears.map(y=><option key={y} value={y}>{y}</option>)}
            </select>
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"rgba(255,255,255,.4)"}}>vs</span>
            <select value={yr2} onChange={e=>setYr2(+e.target.value)} style={selS}>
              {allYears.map(y=><option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={onClose} style={{background:"none",border:"none",color:"#D4A017",fontSize:16,cursor:"pointer"}}>✕</button>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 2fr",overflowY:"auto",flex:1}}>
          {[
            {label:`Joined in ${yr2}`,subtitle:`New to ${yr2}`,items:joined,bg:"#F0FDF4",col:"#166534"},
            {label:`Left after ${yr1}`,subtitle:`Not in ${yr2}`,items:left,bg:"#FEF2F2",col:"#991B1B"},
            {label:"Played both seasons",subtitle:`${both.length} returning players`,items:both,bg:"#fff",col:"#1a1a2e"},
          ].map(col=>(
            <div key={col.label} style={{borderRight:"1px solid #F0EEE8",background:col.bg}}>
              <div style={{padding:"10px 14px",borderBottom:"1px solid #E8E6DF"}}>
                <div style={{fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:700,color:col.col}}>{col.label}</div>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa"}}>{col.subtitle}</div>
              </div>
              <div style={{padding:"8px 14px",maxHeight:380,overflowY:"auto"}}>
                {col.items.length===0?<p style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#ccc",textAlign:"center",padding:"24px 0"}}>None</p>:
                col.items.map(p=>(
                  <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid rgba(0,0,0,.04)"}}>
                    <DNAAvatar player={p} size={22}/>
                    <div>
                      <div style={{fontFamily:"'Fraunces',serif",fontSize:11,fontWeight:600,color:"#1a1a2e"}}>
                        {titleCase(p.first_name)} {titleCase(p.last_name)}
                      </div>
                      <div style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:"#aaa"}}>
                        {p.skill_tier_reported}
                        {col.items===both&&(() => {
                          const h1=p.history.find(h=>+h.season===+yr1);
                          const h2=p.history.find(h=>+h.season===+yr2);
                          if(!h1||!h2) return "";
                          const delta=TIER_VAL(h2.skill_tier)-TIER_VAL(h1.skill_tier);
                          return delta<0?" ↑ tier improved":delta>0?" ↓ tier declined":"";
                        })()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── WOW 7: Cohort retention ──────────────────────────────────────────────────
function CohortChart({ players, onClose }) {
  const allYears=useMemo(()=>{const s=new Set();players.forEach(p=>p.history.forEach(h=>s.add(+h.season)));return [...s].sort();},[players]);
  const cohorts=useMemo(()=>{
    return allYears.map(yr=>{
      const firstTimers=players.filter(p=>{
        const hs=[...p.history].sort((a,b)=>a.season-b.season);
        return hs[0]&&+hs[0].season===yr;
      });
      const retention=allYears.filter(y=>y>yr).map(y=>({
        year:y,
        n:firstTimers.filter(p=>p.history.some(h=>+h.season===y)).length,
        pct:firstTimers.length>0?Math.round(firstTimers.filter(p=>p.history.some(h=>+h.season===y)).length/firstTimers.length*100):0
      }));
      return { year:yr, n:firstTimers.length, retention };
    });
  },[players,allYears]);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:2000,
      display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#fff",borderRadius:14,maxWidth:640,width:"100%",
        maxHeight:"80vh",overflow:"hidden",display:"flex",flexDirection:"column",
        boxShadow:"0 32px 80px rgba(0,0,0,.25)"}}>
        <div style={{padding:"18px 22px 14px",background:"#1a1a2e",display:"flex",
          justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#D4A017",
              textTransform:"uppercase",letterSpacing:".1em",marginBottom:3}}>Cohort Analysis</div>
            <h2 style={{fontFamily:"'Fraunces',serif",fontSize:17,fontWeight:700,color:"#fff",margin:0}}>
              Player retention by cohort
            </h2>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#D4A017",fontSize:16,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{overflowY:"auto",flex:1,padding:"16px 22px"}}>
          <p style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#888",marginBottom:16}}>
            Each row shows a first-year cohort and how many returned in subsequent seasons.
          </p>
          {cohorts.map(c=>(
            <div key={c.year} style={{marginBottom:16,background:"#FAFAF8",borderRadius:10,padding:"12px 16px"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <span style={{fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:700,color:"#1a1a2e"}}>{c.year} cohort</span>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#aaa"}}>{c.n} first-time players</span>
              </div>
              {c.retention.length===0&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa"}}>No subsequent seasons to show yet</span>}
              {c.retention.map(r=>{
                const col=r.pct>=70?"#166534":r.pct>=50?"#92400E":"#991B1B";
                return(
                  <div key={r.year} style={{display:"flex",alignItems:"center",gap:10,marginBottom:5}}>
                    <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#888",minWidth:36}}>{r.year}</span>
                    <div style={{flex:1,height:5,background:"#E8E6DF",borderRadius:99,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${r.pct}%`,background:col,borderRadius:99,transition:"width .8s ease"}}/>
                    </div>
                    <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,fontWeight:600,color:col,minWidth:36}}>{r.pct}%</span>
                    <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa"}}>{r.n}/{c.n}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── WOW 9: Where Are They Now ────────────────────────────────────────────────
function WhereAreTheyNow({ players, onClose }) {
  const MOCK_2027_EMAILS=new Set([
    "d.kowalski@email.com","m.hartley@email.com","l.tran@email.com","a.buchanan@email.com",
  ]);
  const registered  =players.filter(p=>MOCK_2027_EMAILS.has(p.email));
  const notReturned =players.filter(p=>!MOCK_2027_EMAILS.has(p.email))
    .sort((a,b)=>b.history[0]?.season-a.history[0]?.season);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:2000,
      display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#fff",borderRadius:14,maxWidth:580,width:"100%",
        maxHeight:"85vh",overflow:"hidden",display:"flex",flexDirection:"column",
        boxShadow:"0 32px 80px rgba(0,0,0,.25)"}}>
        <div style={{padding:"18px 22px 14px",background:"#1a1a2e",display:"flex",
          justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#D4A017",
              textTransform:"uppercase",letterSpacing:".1em",marginBottom:3}}>2027 Matching</div>
            <h2 style={{fontFamily:"'Fraunces',serif",fontSize:17,fontWeight:700,color:"#fff",margin:0}}>
              Where are they now?
            </h2>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"rgba(255,255,255,.4)",marginTop:3}}>
              {registered.length} of {players.length} history players registered for 2027 ({Math.round(registered.length/players.length*100)}%)
            </div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#D4A017",fontSize:16,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{overflowY:"auto",flex:1}}>
          <div style={{padding:"12px 22px",background:"#E6F4EA",borderBottom:"1px solid #86EFAC"}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#166534",fontWeight:600,marginBottom:8}}>
              ✓ Registered for 2027 ({registered.length})
            </div>
            {registered.map(p=>(
              <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0"}}>
                <DNAAvatar player={p} size={24}/>
                <span style={{fontFamily:"'Fraunces',serif",fontSize:12,fontWeight:600,color:"#1a1a2e"}}>
                  {titleCase(p.first_name)} {titleCase(p.last_name)}
                </span>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa"}}>
                  · last played {p.history[0]?.season}
                </span>
              </div>
            ))}
          </div>
          <div style={{padding:"12px 22px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#991B1B",fontWeight:600}}>
                ✗ Not yet registered ({notReturned.length})
              </div>
              <button style={{fontFamily:"'DM Mono',monospace",fontSize:10,background:"#1a1a2e",color:"#D4A017",border:"none",padding:"4px 12px",borderRadius:6,cursor:"pointer"}}>
                ↓ Export contact list
              </button>
            </div>
            {notReturned.map(p=>(
              <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",borderBottom:"1px solid #F9F8F4"}}>
                <DNAAvatar player={p} size={24}/>
                <div style={{flex:1}}>
                  <span style={{fontFamily:"'Fraunces',serif",fontSize:12,fontWeight:600,color:"#555"}}>
                    {titleCase(p.first_name)} {titleCase(p.last_name)}
                  </span>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",marginLeft:6}}>
                    last played {p.history[0]?.season} · {DIVISION_LABEL[p.history[0]?.division]||"—"}
                  </span>
                </div>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:
                  p.history[0]?.season>=2025?"#166534":p.history[0]?.season>=2023?"#92400E":"#aaa"}}>
                  {p.history[0]?.season>=2025?"Recent":"Inactive"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── WOW 10: Season story modal ───────────────────────────────────────────────
function SeasonStory({ players, season, onClose }) {
  const sp  = players.filter(p=>p.history.some(h=>+h.season===+season));
  const champs  = sp.filter(p=>p.history.some(h=>+h.season===+season&&h.championship==="winner"));
  const newPlayers=sp.filter(p=>{const sorted=[...p.history].sort((a,b)=>a.season-b.season);return +sorted[0]?.season===+season;});
  const divGroups={};sp.forEach(p=>{const h=p.history.find(hh=>+hh.season===+season);if(h){(divGroups[h.division]=divGroups[h.division]||[]).push(p);}});
  const mostSeasoned=sp.slice().sort((a,b)=>b.history.length-a.history.length)[0];
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:2000,
      display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#fff",borderRadius:14,maxWidth:600,width:"100%",
        maxHeight:"85vh",overflow:"hidden",display:"flex",flexDirection:"column",
        boxShadow:"0 32px 80px rgba(0,0,0,.25)"}}>
        <div style={{padding:"20px 24px 16px",background:"#1a1a2e",display:"flex",
          justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#D4A017",
              textTransform:"uppercase",letterSpacing:".1em",marginBottom:3}}>Season story</div>
            <h2 style={{fontFamily:"'Fraunces',serif",fontSize:22,fontWeight:700,color:"#fff",margin:0}}>
              Gold Rush {season}
            </h2>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#D4A017",fontSize:16,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{overflowY:"auto",flex:1,padding:"20px 24px"}}>
          {/* Narrative */}
          <p style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#555",lineHeight:1.8,marginBottom:20}}>
            The {season} Gold Rush tournament brought together <strong style={{color:"#1a1a2e"}}>{sp.length} players</strong> across{" "}
            {Object.keys(divGroups).length} divisions — {newPlayers.length} of them playing in their first ever Gold Rush season.
            {champs.length>0&&` The championship was claimed by ${champs.map(p=>`${titleCase(p.first_name)} ${titleCase(p.last_name)}`).slice(0,3).join(", ")}.`}
            {mostSeasoned&&` ${titleCase(mostSeasoned.first_name)} ${titleCase(mostSeasoned.last_name)} was the most experienced player with ${mostSeasoned.history.length} seasons on record.`}
          </p>
          {/* Division breakdown */}
          <div style={{marginBottom:20}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>Division breakdown</div>
            {Object.entries(divGroups).map(([div,ps])=>(
              <div key={div} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:DIVISION_HUE[div]||"#1a1a2e",flexShrink:0}}/>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#555",minWidth:80}}>{DIVISION_LABEL[div]||div}</span>
                <div style={{flex:1,height:5,background:"#F0EEE8",borderRadius:99,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${Math.round(ps.length/sp.length*100)}%`,background:DIVISION_HUE[div]||"#1a1a2e",borderRadius:99}}/>
                </div>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#888"}}>{ps.length} players</span>
              </div>
            ))}
          </div>
          {/* Champions */}
          {champs.length>0&&(
            <div style={{background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:10,padding:"14px 16px",marginBottom:16}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#92400E",textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>🏆 Champions</div>
              {champs.map(p=>(
                <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0"}}>
                  <DNAAvatar player={p} size={24}/>
                  <span style={{fontFamily:"'Fraunces',serif",fontSize:12,fontWeight:600,color:"#1a1a2e"}}>
                    {titleCase(p.first_name)} {titleCase(p.last_name)}
                  </span>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa"}}>
                    · {DIVISION_LABEL[p.history.find(h=>+h.season===+season)?.division]||""}
                    {p.history.find(h=>+h.season===+season)?.was_captain?" · Captain":""}
                  </span>
                </div>
              ))}
            </div>
          )}
          {/* New players */}
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>
            🆕 First-season players ({newPlayers.length})
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {newPlayers.map(p=>(
              <span key={p.id} style={{fontFamily:"'DM Mono',monospace",fontSize:10,
                background:"#F6F5F0",color:"#555",padding:"2px 10px",borderRadius:99}}>
                {titleCase(p.first_name)} {titleCase(p.last_name)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── History Panel (right drawer) ─────────────────────────────────────────────
function HistoryPanel({ player, onClose }) {
  const name      = `${titleCase(player.first_name)} ${titleCase(player.last_name)}`;
  const champs    = player.history.filter(h=>h.championship==="winner");
  const caps      = player.history.filter(h=>h.was_captain);
  const divisions = [...new Set(player.history.map(h=>h.division))];
  const trend     = tierTrend(player.history);
  const trendInfo = TREND[trend];
  const lastSeason= player.history[0]?.season;
  return(
    <div style={{display:"flex",flexDirection:"column",height:"100vh"}}>
      {/* Header */}
      <div style={{padding:"14px 18px",borderBottom:"1px solid #F0EEE8",flexShrink:0,
        display:"flex",alignItems:"center",gap:10}}>
        <DNAAvatar player={player} size={36}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:700,color:"#1a1a2e",
            display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            {name}
            {champs.length>0&&<span style={{fontSize:10}}>🏆</span>}
            {player.sandbagging_flag&&<span style={{fontSize:10,color:"#EF4444"}}>⚠</span>}
          </div>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",marginTop:1}}>
            {player.email}
          </div>
        </div>
        {/* #14 Last active */}
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:"#aaa",textTransform:"uppercase"}}>Last active</div>
          <div style={{fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:700,
            color:lastSeason>=2025?"#166534":lastSeason>=2023?"#92400E":"#aaa"}}>{lastSeason}</div>
        </div>
        <button onClick={onClose} style={{background:"none",border:"none",fontSize:14,color:"#aaa",cursor:"pointer"}}>✕</button>
      </div>

      {player.sandbagging_flag&&<div style={{fontFamily:"'DM Mono',monospace",fontSize:11,
        background:"#FFFBEB",borderBottom:"1px solid #FDE68A",color:"#92400E",
        padding:"7px 18px",fontWeight:500}}>
        ⚠ Sandbagging review — historical tier exceeds self-reported. Committee action required.
      </div>}

      <div style={{flex:1,overflowY:"auto",minHeight:0}}>
        {/* WOW 1: Career timeline */}
        <CareerTimeline player={player}/>

        {/* Career stats */}
        <div style={{padding:"14px 18px",borderBottom:"1px solid #F0EEE8"}}>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>Career summary</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
            {[
              ["Seasons",     player.history.length],
              ["Championships",champs.length],
              ["Captaincies", caps.length],
              ["Attendance",  player.attendance_rating!=null?`${player.attendance_rating}%`:"—"],
              ["No-shows",    player.no_show_count],
              ["Tier trend",  trendInfo.arrow+` ${trend}`],
            ].map(([k,v])=>(
              <div key={k} style={{textAlign:"center",background:"#F6F5F0",borderRadius:8,padding:"8px"}}>
                <div style={{fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,color:"#1a1a2e"}}>{v}</div>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:"#aaa",textTransform:"uppercase",marginTop:2}}>{k}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Season-by-season */}
        <div style={{padding:"14px 18px",borderBottom:"1px solid #F0EEE8"}}>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>Season by season</div>
          {player.history.map(h=>{
            const dc=DIVISION_COLOR[h.division]||{};
            const tc=TIER_COLOR(h.skill_tier);
            const isChamp=h.championship==="winner";
            const attOk=h.games_scheduled>0?Math.round(h.games_attended/h.games_scheduled*100):null;
            return(
              <div key={h.season} style={{display:"flex",alignItems:"flex-start",gap:10,
                padding:"10px 0",borderBottom:"1px solid #F9F8F4"}}>
                {/* #26 Recency gradient */}
                <div style={{width:38,textAlign:"center",flexShrink:0}}>
                  <div style={{fontFamily:"'Fraunces',serif",fontSize:14,fontWeight:700,
                    color:h.season===player.history[0]?.season?"#1a1a2e":"#aaa"}}>{h.season}</div>
                </div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap",marginBottom:4}}>
                    {dc.bg&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:9,fontWeight:500,
                      background:dc.bg,color:dc.color,padding:"1px 6px",borderRadius:99,
                      border:`1px solid ${dc.border||dc.bg}`}}>{DIVISION_LABEL[h.division]||h.division}</span>}
                    <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,fontWeight:500,
                      background:tc.bg,color:tc.color,padding:"1px 5px",borderRadius:99}}>{h.skill_tier}</span>
                    {isChamp&&<span style={{fontSize:10}}>🏆</span>}
                    {h.was_captain&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:8,
                      background:"#EDE9FE",color:"#4C1D95",padding:"1px 5px",borderRadius:99}}>© Captain</span>}
                    {h.was_alternate&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:8,
                      background:"#F3F4F6",color:"#888",padding:"1px 5px",borderRadius:99}}>Sub</span>}
                  </div>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa"}}>
                    {h.team}{attOk!=null&&` · ${attOk}% attendance`}
                    {h.no_show>0&&<span style={{color:"#92400E"}}> · {h.no_show} no-show</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* #16 cross-ref link */}
        <div style={{padding:"12px 18px",borderBottom:"1px solid #F0EEE8"}}>
          <a href={`/wp-admin/admin.php?page=grsh-tm-players`}
            style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#1a1a2e",textDecoration:"underline"}}>
            View 2027 registration →
          </a>
        </div>

        {/* Divisions history */}
        <div style={{padding:"14px 18px"}}>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>All divisions played</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {divisions.map(d=>{const dc=DIVISION_COLOR[d]||{};return<span key={d} style={{fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:500,background:dc.bg||"#F6F5F0",color:dc.color||"#555",border:`1px solid ${dc.border||"#E8E6DF"}`,padding:"2px 8px",borderRadius:99}}>{DIVISION_LABEL[d]||d}</span>;})}
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div style={{padding:"12px 18px",borderTop:"1px solid #F0EEE8",display:"flex",gap:8,flexShrink:0}}>
        <button onClick={()=>generateCareerCard(player)}
          style={{flex:1,fontFamily:"'DM Mono',monospace",fontSize:11,background:"#F6F5F0",
            border:"1px solid #E8E6DF",color:"#555",padding:"8px",borderRadius:8,cursor:"pointer"}}>
          📄 Career card
        </button>
        <button onClick={onClose}
          style={{flex:2,fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:500,
            background:"#1a1a2e",color:"#D4A017",border:"none",padding:"8px",borderRadius:8,cursor:"pointer"}}>
          Close
        </button>
      </div>
    </div>
  );
}

// ─── Main History component ────────────────────────────────────────────────────
export default function History() {
  const [players,    setPlayers]    = useState(MOCK_PLAYERS);
  const [loadState,  setLoadState]  = useState("loading");
  const [search,     setSearch]     = useState("");
  const [filterDiv,  setFilterDiv]  = useState("");
  const [filterSeason,setFilterSeason]=useState("");
  const [filterReliability,setFilterReliability]=useState("");
  const [filterWarn, setFilterWarn] = useState(false);
  const [filterChamps,setFilterChamps]=useState(false);
  const [filterNoShow,setFilterNoShow]=useState(false);
  const [filterRecent,setFilterRecent]=useState(false); // #15
  const [selected,   setSelected]   = useState(null);
  const [sortKey,    setSortKey]    = useState("last_name");
  const [sortDir,    setSortDir]    = useState("asc");
  const [hoveredRow, setHoveredRow] = useState(null);
  const [showFilters,setShowFilters]=useState(true);    // #8 collapsible
  const [showCols,   setShowCols]   = useState(false);  // #10 column toggle
  const [visibleCols,setVisibleCols]=useState(["player","seasons","divisions","tier","attendance","flags"]); // championships hidden by default #3
  const [showPredictor,setShowPredictor]=useState(false); // WOW 5
  const [showDiff,   setShowDiff]   = useState(false);  // WOW 3
  const [showCohort, setShowCohort] = useState(false);  // WOW 7
  const [showWhere,  setShowWhere]  = useState(false);  // WOW 9
  const [showStory,  setShowStory]  = useState(null);   // WOW 10
  const [toast,      setToast]      = useState(null);
  const colRef = useRef(null); // click-outside for column toggle

  const showToast=(msg)=>{setToast(msg);setTimeout(()=>setToast(null),3000);};

  // Click-outside closes column toggle dropdown
  useEffect(()=>{
    const h=(e)=>{ if(colRef.current&&!colRef.current.contains(e.target)) setShowCols(false); };
    document.addEventListener("mousedown",h);
    return()=>document.removeEventListener("mousedown",h);
  },[]);

  // Fetch from API
  useEffect(()=>{
    let cancelled=false;
    setLoadState("loading");
    (async()=>{
      try{
        const res=await fetch(`${API}/history/records?per_page=500&page=1`,{headers:{"X-WP-Nonce":NONCE}});
        if(!res.ok) throw new Error(`HTTP ${res.status}`);
        const data=await res.json();
        const flat=Array.isArray(data)?data:(data.records||[]);
        if(cancelled) return;
        if(flat.length===0){setLoadState("done");return;}
        setPlayers(aggregateRecords(flat));
        setLoadState("done");
      }catch{
        if(!cancelled) setLoadState("error");
      }
    })();
    return()=>{cancelled=true;};
  },[]);

  // Keyboard nav
  useEffect(()=>{
    const h=(e)=>{
      if(e.key==="Escape"){setSelected(null);return;}
      if(!selected) return;
      const idx=filtered.findIndex(p=>p.id===selected.id);
      if(e.key==="ArrowDown"&&idx<filtered.length-1){e.preventDefault();setSelected(filtered[idx+1]);}
      if(e.key==="ArrowUp"&&idx>0){e.preventDefault();setSelected(filtered[idx-1]);}
    };
    window.addEventListener("keydown",h);
    return()=>window.removeEventListener("keydown",h);
  });

  const allSeasons=useMemo(()=>{
    const s=new Set();
    players.forEach(p=>p.history.forEach(h=>s.add(+h.season)));
    return [...s].sort((a,b)=>b-a);
  },[players]);

  // ── BUG FIX: cast both sides to number — season filter now works ──
  const filtered=useMemo(()=>{
    let p=[...players];
    if(search) p=p.filter(x=>
      `${x.first_name} ${x.last_name} ${x.email} ${x.skill_tier_reported} ${x.history.map(h=>DIVISION_LABEL[h.division]||"").join(" ")}`.toLowerCase().includes(search.toLowerCase())
    );
    if(filterDiv)    p=p.filter(x=>x.history.some(h=>h.division===filterDiv));
    if(filterSeason) p=p.filter(x=>x.history.some(h=>+h.season===+filterSeason)); // ← BUG FIX
    if(filterWarn)   p=p.filter(x=>x.sandbagging_flag);
    if(filterChamps) p=p.filter(x=>x.history.some(h=>h.championship==="winner"));
    if(filterNoShow) p=p.filter(x=>x.no_show_count>0);
    if(filterRecent) p=p.filter(x=>x.history.some(h=>+h.season>=allSeasons[0]-1)); // last 2 seasons
    if(filterReliability==="perfect") p=p.filter(x=>x.attendance_rating===100||x.attendance_rating==null);
    if(filterReliability==="concern") p=p.filter(x=>x.attendance_rating!=null&&x.attendance_rating<80);
    if(filterReliability==="noshows")  p=p.filter(x=>x.no_show_count>0);
    p.sort((a,b)=>{
      let av,bv;
      if(sortKey==="seasons")     {av=a.history.length;bv=b.history.length;}
      else if(sortKey==="champs") {av=a.history.filter(h=>h.championship==="winner").length;bv=b.history.filter(h=>h.championship==="winner").length;}
      else if(sortKey==="attendance"){av=a.attendance_rating??-1;bv=b.attendance_rating??-1;}
      else{av=(a[sortKey]||"").toString().toLowerCase();bv=(b[sortKey]||"").toString().toLowerCase();}
      return sortDir==="asc"?(av>bv?1:-1):(av<bv?1:-1);
    });
    return p;
  },[players,search,filterDiv,filterSeason,filterWarn,filterChamps,filterNoShow,filterRecent,filterReliability,sortKey,sortDir,allSeasons]);

  const handleSort=(key)=>{if(sortKey===key)setSortDir(d=>d==="asc"?"desc":"asc");else{setSortKey(key);setSortDir("asc");}};

  // #4 stats — robust normalization handles "0"/"1"/true/false from any API response
  const toBool=(v)=>v===true||v===1||v==="1"||v==="yes"||v==="Yes"||v==="true";
  const stats=useMemo(()=>({
    total:      players.length,
    champions:  players.filter(p=>p.history.some(h=>h.championship==="winner")).length,
    captains:   players.filter(p=>p.history.some(h=>toBool(h.was_captain))).length,
    sandbagging:players.filter(p=>toBool(p.sandbagging_flag)||p.history.some(h=>toBool(h.sandbagging_flag))).length,
    noShows:    players.filter(p=>p.no_show_count>0).length,
  }),[players]);

  const activeFilters=[filterDiv,filterSeason,filterReliability].filter(Boolean).length
    +(filterWarn?1:0)+(filterChamps?1:0)+(filterNoShow?1:0)+(filterRecent?1:0);

  const clearFilters=()=>{setSearch("");setFilterDiv("");setFilterSeason("");setFilterReliability("");setFilterWarn(false);setFilterChamps(false);setFilterNoShow(false);setFilterRecent(false);};

  // #18 export scoped to filter
  const exportCSV=()=>{
    const rows=[
      ["Last","First","Email","Seasons","Championships","Captaincies","Attendance%","No-Shows","Sandbagging","Division History","Tier History"],
      ...filtered.map(p=>[
        titleCase(p.last_name),titleCase(p.first_name),p.email,
        p.history.length,
        p.history.filter(h=>h.championship==="winner").length,
        p.history.filter(h=>h.was_captain).length,
        p.attendance_rating??0,p.no_show_count,
        p.sandbagging_flag?"Yes":"No",
        [...new Set(p.history.map(h=>DIVISION_LABEL[h.division]||h.division))].join("|"),
        p.history.map(h=>`${h.season}:${h.skill_tier}`).join("|"),
      ])
    ];
    const csv=rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=`grsh-history${filterSeason?"-"+filterSeason:""}${filterDiv?"-"+filterDiv:""}.csv`;a.click();
    URL.revokeObjectURL(url);
    showToast(`✓ Exported ${filtered.length} players`);
  };

  const SortIcon=({k})=><span style={{marginLeft:4,opacity:sortKey===k?1:0.25,fontSize:10}}>{sortKey===k?(sortDir==="asc"?"↑":"↓"):"↕"}</span>;
  const ALL_COLS=[{k:"player",l:"Player"},{k:"seasons",l:"Seasons"},{k:"champs",l:"Championships"},{k:"divisions",l:"Prior divisions"},{k:"tier",l:"Tier / trend"},{k:"attendance",l:"Attendance"},{k:"flags",l:"Flags"}];

  if(loadState==="loading") return(
    <div style={{padding:48,fontFamily:"'DM Mono',monospace",fontSize:13,color:"#aaa",background:"#F6F5F0",minHeight:"100vh"}}>
      <style>{`@keyframes shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}`}</style>
      <div style={{fontFamily:"'Fraunces',serif",fontSize:24,fontWeight:700,color:"#1a1a2e",marginBottom:6}}>Player History</div>
      <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#aaa",marginBottom:24}}>Loading imported records…</div>
      {[1,2,3,4,5].map(i=>(
        <div key={i} style={{height:52,borderRadius:8,marginBottom:8,
          background:"linear-gradient(90deg,#F0EEE8 25%,#E8E6DF 50%,#F0EEE8 75%)",
          backgroundSize:"400px 100%",animation:"shimmer 1.4s infinite"}}/>
      ))}
    </div>
  );

  return(
    <>
      <style>{`
        *{box-sizing:border-box}
        @keyframes shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}
        @keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .hrow:hover{background:#F0F4FF!important}
        .hrow:focus{outline:2px solid #1a1a2e;outline-offset:-2px}
        .hth{position:sticky;top:0;z-index:10}
        @media(max-width:768px){.hsplit{flex-direction:column!important}}
      `}</style>

      {/* WOW modals */}
      {showPredictor&&<SandbagPredictor players={players} onClose={()=>setShowPredictor(false)}/>}
      {showDiff&&<SeasonDiff players={players} onClose={()=>setShowDiff(false)}/>}
      {showCohort&&<CohortChart players={players} onClose={()=>setShowCohort(false)}/>}
      {showWhere&&<WhereAreTheyNow players={players} onClose={()=>setShowWhere(false)}/>}
      {showStory&&<SeasonStory players={players} season={showStory} onClose={()=>setShowStory(null)}/>}

      <div className="hsplit" style={{display:"flex",height:"100vh",overflow:"hidden",background:"#F6F5F0"}}>

        {/* ── Table panel ─────────────────────────────────────────────────── */}
        <div style={{flex:1,overflowY:"auto",padding:"22px 20px",minWidth:0}}>

          {/* #1/#27 data-state header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,flexWrap:"wrap",gap:10}}>
            <div>
              <div style={{display:"inline-block",fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:500,
                letterSpacing:".1em",textTransform:"uppercase",background:"#1a1a2e",color:"#D4A017",
                padding:"3px 12px",borderRadius:99,marginBottom:7}}>Historical records</div>
              <h1 style={{fontFamily:"'Fraunces',serif",fontSize:26,fontWeight:700,color:"#1a1a2e",margin:"0 0 3px",letterSpacing:"-.5px"}}>
                Player History
              </h1>
              <p style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#999",margin:0}}>
                Cross-season tracking · {players.length} players on record
                {loadState==="done"&&players.length>6&&(
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,background:"#E6F4EA",color:"#1E6B3A",padding:"1px 8px",borderRadius:99,marginLeft:8}}>
                    imported data
                  </span>
                )}
                {loadState==="error"&&(
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,background:"#FEF3C7",color:"#92400E",padding:"1px 8px",borderRadius:99,marginLeft:8}}>
                    sample data — API unavailable
                  </span>
                )}
              </p>
              {/* #27 import source — single season shows just the year */}
              {allSeasons.length>0&&(
                <p style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#bbb",margin:"4px 0 0"}}>
                  CSV import · {allSeasons.length===1
                    ? `Season ${allSeasons[0]}`
                    : `${allSeasons[allSeasons.length-1]}–${allSeasons[0]}`}
                  {" · "}{allSeasons.length} season{allSeasons.length!==1?"s":""} on record
                </p>
              )}
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <button onClick={exportCSV} style={{fontFamily:"'DM Mono',monospace",fontSize:11,background:"#F6F5F0",color:"#444",border:"1px solid #E8E6DF",padding:"8px 14px",borderRadius:8,cursor:"pointer",whiteSpace:"nowrap"}}>
                ↓ Export {filtered.length<players.length?`${filtered.length} filtered`:"all"}
              </button>
            </div>
          </div>

          {/* WOW tools row — separate line so it never overflows header */}
          <div style={{display:"flex",gap:5,marginBottom:12,flexWrap:"wrap"}}>
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",textTransform:"uppercase",letterSpacing:".07em",alignSelf:"center",marginRight:2}}>Analytics:</span>
            <button onClick={()=>setShowPredictor(true)} style={wowBtn}>⚡ Risk analysis</button>
            <button onClick={()=>setShowDiff(true)} style={wowBtn}>⇔ Compare seasons</button>
            <button onClick={()=>setShowCohort(true)} style={wowBtn}>📊 Cohort retention</button>
            <button onClick={()=>setShowWhere(true)} style={wowBtn}>🔍 Where are they?</button>
            {allSeasons.map(yr=>(
              <button key={yr} onClick={()=>setShowStory(yr)} style={wowBtn}>📖 {yr} story</button>
            ))}
          </div>

          {/* #24 stats bar — recalculates on filter, #23 captains chip */}
          <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
            {[
              {label:"On record",    val:stats.total,      color:"#1a1a2e",filter:null},
              {label:"Champions",    val:stats.champions,  color:"#92400E",filter:()=>setFilterChamps(f=>!f),active:filterChamps},
              {label:"Captains",     val:stats.captains,   color:"#4C1D95",filter:null},
              {label:"Sandbagging",  val:stats.sandbagging,color:"#991B1B",filter:()=>setFilterWarn(f=>!f),active:filterWarn},
              {label:"No-show flag", val:stats.noShows,    color:"#7A4518",filter:()=>setFilterNoShow(f=>!f),active:filterNoShow},
            ].map(chip=>(
              <div key={chip.label} onClick={chip.filter} style={{
                display:"flex",alignItems:"center",gap:8,
                background:chip.active?"#E8E6DF":"#fff",
                border:`1px solid ${chip.active?"#1a1a2e":"#E8E6DF"}`,
                borderRadius:99,padding:"5px 14px",
                cursor:chip.filter?"pointer":"default",userSelect:"none",transition:"background .12s",
              }}>
                <span style={{fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,color:chip.color,lineHeight:1}}>{chip.val}</span>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:".07em"}}>{chip.label}</span>
              </div>
            ))}
          </div>

          {/* #8 collapsible filter bar */}
          <div style={{marginBottom:12}}>
            <div style={{background:"#fff",border:"1px solid #E8E6DF",borderRadius:10,overflow:"hidden"}}>
              {/* Filter bar header row */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"10px 14px",cursor:"pointer",borderBottom:showFilters?"1px solid #F0EEE8":"none"}}
                onClick={()=>setShowFilters(f=>!f)}>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#555",fontWeight:500}}>
                  {showFilters?"↑ Collapse filters":"↓ Show filters"}
                  {activeFilters>0&&!showFilters&&(
                    <span style={{marginLeft:10,fontFamily:"'DM Mono',monospace",fontSize:9,
                      background:"#1a1a2e",color:"#D4A017",padding:"1px 8px",borderRadius:99}}>
                      {activeFilters} active
                    </span>
                  )}
                </span>
                <div style={{display:"flex",gap:8}} onClick={e=>e.stopPropagation()}>
                  {/* Column toggle — inside panel, click-outside handled */}
                  <div ref={colRef} style={{position:"relative"}}>
                    <button onClick={()=>setShowCols(c=>!c)}
                      style={{fontFamily:"'DM Mono',monospace",fontSize:10,
                        background:showCols?"#1a1a2e":"#F6F5F0",
                        color:showCols?"#D4A017":"#666",
                        border:`1px solid ${showCols?"#1a1a2e":"#E8E6DF"}`,
                        padding:"4px 10px",borderRadius:6,cursor:"pointer"}}>
                      ⊞ Columns
                    </button>
                    {showCols&&(
                      <div style={{position:"absolute",top:"110%",right:0,
                        background:"#fff",border:"1px solid #E8E6DF",borderRadius:10,
                        padding:"10px 12px",zIndex:300,minWidth:170,
                        boxShadow:"0 8px 32px rgba(0,0,0,.14)"}}>
                        <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",
                          textTransform:"uppercase",letterSpacing:".07em",marginBottom:8}}>
                          Visible columns
                        </div>
                        {ALL_COLS.map(col=>(
                          <label key={col.k} style={{display:"flex",alignItems:"center",gap:8,
                            padding:"5px 0",cursor:"pointer",borderBottom:"1px solid #F9F8F4",
                            fontFamily:"'DM Mono',monospace",fontSize:11,color:"#555"}}>
                            <input type="checkbox" checked={visibleCols.includes(col.k)}
                              onChange={()=>setVisibleCols(v=>v.includes(col.k)?v.filter(c=>c!==col.k):[...v,col.k])}/>
                            {col.l}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  {activeFilters>0&&(
                    <button onClick={clearFilters}
                      style={{fontFamily:"'DM Mono',monospace",fontSize:10,
                        background:"#FEE2E2",border:"1px solid #FCA5A5",color:"#991B1B",
                        padding:"4px 10px",borderRadius:6,cursor:"pointer"}}>
                      Clear {activeFilters}
                    </button>
                  )}
                </div>
              </div>
              {showFilters&&(
                <div style={{padding:"12px 14px",display:"flex",gap:12,alignItems:"flex-end",flexWrap:"wrap"}}>
                  {/* #19 search with updated placeholder */}
                  <div>
                    <label style={fL}>Search</label>
                    <div style={{position:"relative"}}>
                      <span style={{position:"absolute",top:7,left:8,color:"#aaa",fontSize:14,pointerEvents:"none"}}>⌕</span>
                      <input value={search} onChange={e=>{setSearch(e.target.value);}} placeholder="Name, email, tier, division…"
                        style={{fontFamily:"'DM Mono',monospace",fontSize:11,background:"#F6F5F0",border:"1px solid #E8E6DF",borderRadius:6,padding:"6px 10px 6px 26px",color:"#333",outline:"none",width:200}}/>
                    </div>
                  </div>
                  <div>
                    <label style={fL}>Prior division</label>
                    <select value={filterDiv} onChange={e=>setFilterDiv(e.target.value)} style={sel}>
                      <option value="">All divisions</option>
                      {["gold_open","45a","senior_b","senior_c"].map(d=><option key={d} value={d}>{DIVISION_LABEL[d]}</option>)}
                    </select>
                  </div>
                  {/* ── BUG FIX: season filter correctly casts values ── */}
                  <div>
                    <label style={fL}>Season</label>
                    <select value={filterSeason} onChange={e=>setFilterSeason(e.target.value)} style={sel}>
                      <option value="">All seasons</option>
                      {allSeasons.map(y=><option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={fL}>Attendance</label>
                    <select value={filterReliability} onChange={e=>setFilterReliability(e.target.value)} style={sel}>
                      <option value="">Any</option>
                      <option value="perfect">Perfect (100%)</option>
                      <option value="concern">Concern (&lt;80%)</option>
                      <option value="noshows">Has no-shows</option>
                    </select>
                  </div>
                  <div>
                    <label style={fL}>Quick filters</label>
                    <div style={{display:"flex",gap:5}}>
                      <button onClick={()=>setFilterWarn(w=>!w)} style={{fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:500,padding:"5px 10px",borderRadius:6,cursor:"pointer",background:filterWarn?"#FEF2F2":"#F6F5F0",color:filterWarn?"#991B1B":"#888",border:`1px solid ${filterWarn?"#FCA5A5":"#E8E6DF"}`}}>⚠ Flags</button>
                      {/* #15 returning filter */}
                      <button onClick={()=>setFilterRecent(r=>!r)} style={{fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:500,padding:"5px 10px",borderRadius:6,cursor:"pointer",background:filterRecent?"#E0F0FF":"#F6F5F0",color:filterRecent?"#1A4F8A":"#888",border:`1px solid ${filterRecent?"#93C5FD":"#E8E6DF"}`}}>Recent</button>
                      <button onClick={()=>setFilterChamps(c=>!c)} style={{fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:500,padding:"5px 10px",borderRadius:6,cursor:"pointer",background:filterChamps?"#FFFBEB":"#F6F5F0",color:filterChamps?"#92400E":"#888",border:`1px solid ${filterChamps?"#FDE68A":"#E8E6DF"}`}}>🏆 Champs</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* #9 Filter breadcrumbs */}
            {activeFilters>0&&(
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
                {filterDiv&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:10,background:"#EEF2FF",color:"#1a1a2e",padding:"2px 10px",borderRadius:99,display:"flex",alignItems:"center",gap:4}}>Division: {DIVISION_LABEL[filterDiv]}<button onClick={()=>setFilterDiv("")} style={{background:"none",border:"none",cursor:"pointer",padding:"0 0 0 4px",color:"#888",fontSize:12}}>✕</button></span>}
                {filterSeason&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:10,background:"#EEF2FF",color:"#1a1a2e",padding:"2px 10px",borderRadius:99,display:"flex",alignItems:"center",gap:4}}>Season: {filterSeason}<button onClick={()=>setFilterSeason("")} style={{background:"none",border:"none",cursor:"pointer",padding:"0 0 0 4px",color:"#888",fontSize:12}}>✕</button></span>}
                {filterReliability&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:10,background:"#EEF2FF",color:"#1a1a2e",padding:"2px 10px",borderRadius:99,display:"flex",alignItems:"center",gap:4}}>Attendance: {filterReliability}<button onClick={()=>setFilterReliability("")} style={{background:"none",border:"none",cursor:"pointer",padding:"0 0 0 4px",color:"#888",fontSize:12}}>✕</button></span>}
                {filterWarn&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:10,background:"#FEF2F2",color:"#991B1B",padding:"2px 10px",borderRadius:99,display:"flex",alignItems:"center",gap:4}}>Sandbagging only<button onClick={()=>setFilterWarn(false)} style={{background:"none",border:"none",cursor:"pointer",padding:"0 0 0 4px",color:"#991B1B",fontSize:12}}>✕</button></span>}
                {filterRecent&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:10,background:"#E0F0FF",color:"#1A4F8A",padding:"2px 10px",borderRadius:99,display:"flex",alignItems:"center",gap:4}}>Recent players<button onClick={()=>setFilterRecent(false)} style={{background:"none",border:"none",cursor:"pointer",padding:"0 0 0 4px",color:"#1A4F8A",fontSize:12}}>✕</button></span>}
                {filterChamps&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:10,background:"#FFFBEB",color:"#92400E",padding:"2px 10px",borderRadius:99,display:"flex",alignItems:"center",gap:4}}>Champions<button onClick={()=>setFilterChamps(false)} style={{background:"none",border:"none",cursor:"pointer",padding:"0 0 0 4px",color:"#92400E",fontSize:12}}>✕</button></span>}
              </div>
            )}
          </div>

          {/* Results row */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <p style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#888",margin:0}}>
              Showing <strong>{filtered.length}</strong> of {players.length} players
              {filterSeason&&<span style={{color:"#1a1a2e",fontWeight:600}}> matching season {filterSeason}</span>}
            </p>
            {selected&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa"}}>↑↓ navigate · Esc close</span>}
          </div>

          {/* Table with sticky headers — #7 */}
          <div style={{background:"#fff",border:"1px solid #E8E6DF",borderRadius:10,overflow:"hidden",marginBottom:16}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr>
                  {visibleCols.includes("player")     &&<th className="hth" style={TH} onClick={()=>handleSort("last_name")}>Player <SortIcon k="last_name"/></th>}
                  {visibleCols.includes("seasons")    &&<th className="hth" style={TH} onClick={()=>handleSort("seasons")}>Seasons <SortIcon k="seasons"/></th>}
                  {/* #3 championships hidden by default */}
                  {visibleCols.includes("champs")     &&<th className="hth" style={TH} onClick={()=>handleSort("champs")}>Championships <SortIcon k="champs"/></th>}
                  {visibleCols.includes("divisions")  &&<th className="hth" style={TH}>Prior divisions</th>}
                  {visibleCols.includes("tier")       &&<th className="hth" style={TH}>Tier / trend</th>}
                  {visibleCols.includes("attendance") &&<th className="hth" style={TH} onClick={()=>handleSort("attendance")}>Attendance <SortIcon k="attendance"/></th>}
                  {visibleCols.includes("flags")      &&<th className="hth" style={TH}>Flags <span title="Sandbagging: historical tier significantly exceeds self-reported. No-show: missed games without notice." style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#bbb",cursor:"help",border:"1px solid #E8E6DF",borderRadius:"50%",padding:"0 3px"}}>?</span></th>}
                  <th className="hth" style={TH}/>
                </tr>
              </thead>
              <tbody>
                {/* #30 empty state */}
                {filtered.length===0&&(
                  <tr><td colSpan={10} style={{padding:"60px 24px",textAlign:"center"}}>
                    <div style={{fontSize:28,marginBottom:10}}>{activeFilters||search?"🔍":"🏒"}</div>
                    <p style={{fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,color:"#1a1a2e",margin:"0 0 6px"}}>
                      {activeFilters||search?"No players match these filters":"No history records yet"}
                    </p>
                    <p style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#aaa",margin:"0 0 16px"}}>
                      {activeFilters||search?`Filtered to: ${[filterSeason&&`Season ${filterSeason}`,filterDiv&&DIVISION_LABEL[filterDiv]].filter(Boolean).join(" · ")||"current filters"} — try adjusting.`:"Import historical seasons via the Import History page."}
                    </p>
                    {(activeFilters||search)&&<button onClick={clearFilters} style={{fontFamily:"'DM Mono',monospace",fontSize:12,background:"#1a1a2e",color:"#D4A017",border:"none",padding:"8px 20px",borderRadius:8,cursor:"pointer"}}>Clear all filters</button>}
                  </td></tr>
                )}

                {filtered.map(p=>{
                  const name       = `${titleCase(p.first_name)} ${titleCase(p.last_name)}`; // #2 title case
                  const champs     = p.history.filter(h=>h.championship==="winner");
                  const captainSns = p.history.filter(h=>h.was_captain).length;
                  const divisions  = [...new Set(p.history.map(h=>h.division))];
                  const trend      = tierTrend(p.history);
                  const trendInfo  = TREND[trend];
                  const isSelected = selected?.id===p.id;
                  const lastSeason = p.history[0]?.season;
                  const isRecent   = lastSeason>=allSeasons[0]-1;

                  return(
                    <tr key={p.id} className="hrow" tabIndex={0}
                      onMouseEnter={()=>setHoveredRow(p.id)} onMouseLeave={()=>setHoveredRow(null)}
                      onClick={()=>setSelected(p)}
                      style={{background:isSelected?"#EEF2FF":p.sandbagging_flag?"#FFFBEB":"transparent",
                        borderLeft:`3px solid ${isSelected?"#1a1a2e":p.sandbagging_flag?"#FDE68A":"transparent"}`,
                        cursor:"pointer",transition:"background .1s"}}>

                      {visibleCols.includes("player")&&<td style={TD}>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          {/* WOW 4: DNA avatar */}
                          <DNAAvatar player={p} size={32}/>
                          <div>
                            <div style={{fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:600,color:"#1a1a2e",
                              display:"flex",alignItems:"center",gap:4}}>
                              {name}
                              {champs.length>0&&<span title="Past champion" style={{fontSize:9}}>🏆</span>}
                              {p.sandbagging_flag&&<span title="Sandbagging review" style={{fontSize:10,color:"#EF4444"}}>⚠</span>}
                              {captainSns>0&&<span title={`${captainSns}× captain`} style={{fontFamily:"'DM Mono',monospace",fontSize:8,background:"#EDE9FE",color:"#4C1D95",padding:"1px 4px",borderRadius:2}}>C</span>}
                            </div>
                            <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#bbb"}}>
                              {p.email}
                            </div>
                            {/* #14 Last active inline */}
                            <div style={{fontFamily:"'DM Mono',monospace",fontSize:8,
                              color:isRecent?"#166534":"#aaa",marginTop:1}}>
                              Last active {lastSeason}{isRecent?" ·  recent":lastSeason<allSeasons[0]-2?" · inactive":""}
                            </div>
                          </div>
                        </div>
                      </td>}

                      {visibleCols.includes("seasons")&&<td style={TD}>
                        <span style={{fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,color:"#1a1a2e"}}>{p.history.length}</span>
                        {/* #26 recency gradient on years */}
                        <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,marginTop:2,lineHeight:1.5}}>
                          {p.history.map(h=>h.season).sort((a,b)=>b-a).map((yr,i)=>(
                            <span key={yr} style={{color:i===0?"#1a1a2e":"#bbb",marginRight:3,fontWeight:i===0?600:400}}>{yr}</span>
                          ))}
                        </div>
                      </td>}

                      {/* #3 championships only if column shown */}
                      {visibleCols.includes("champs")&&<td style={TD}>
                        {champs.length>0?(
                          <div>
                            <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:2}}>
                              <span style={{fontSize:12}}>🏆</span>
                              <span style={{fontFamily:"'Fraunces',serif",fontSize:14,fontWeight:700,color:"#92400E"}}>{champs.length}×</span>
                              {captainSns>0&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:"#aaa"}}>({captainSns}× captain)</span>}
                            </div>
                            <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#92400E"}}>{champs.map(h=>h.season).join(", ")}</div>
                          </div>
                        ):<span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#ccc"}}>—</span>}
                      </td>}

                      {/* #11 overflow tooltip */}
                      {visibleCols.includes("divisions")&&<td style={TD}>
                        <div style={{display:"flex",gap:3,alignItems:"center",flexWrap:"nowrap"}}>
                          {divisions.slice(0,1).map(d=>{const dc=DIVISION_COLOR[d]||{};return(
                            <span key={d} style={{fontFamily:"'DM Mono',monospace",fontSize:9,fontWeight:500,
                              background:dc.bg||"#F6F5F0",color:dc.color||"#555",
                              border:`1px solid ${dc.border||"#E8E6DF"}`,padding:"1px 6px",borderRadius:99}}>
                              {DIVISION_LABEL[d]||d}
                            </span>
                          );})}
                          {divisions.length>1&&(
                            <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",cursor:"help"}}
                              title={divisions.slice(1).map(d=>DIVISION_LABEL[d]||d).join(", ")}>
                              +{divisions.length-1}
                            </span>
                          )}
                        </div>
                      </td>}

                      {/* WOW 2: Tier sparkline */}
                      {visibleCols.includes("tier")&&<td style={TD}>
                        <TierSparkline history={p.history}/>
                        {p.history.length<2&&(
                          <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:trendInfo.color,marginTop:2,display:"block"}}>
                            {trendInfo.arrow} {trendInfo.label}
                          </span>
                        )}
                      </td>}

                      {/* #29 attendance — bar only, number on hover */}
                      {visibleCols.includes("attendance")&&<td style={{...TD,minWidth:100}}>
                        {p.attendance_rating!=null?(
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <div style={{width:48,height:5,background:"#F0EEE8",borderRadius:99,overflow:"hidden",flexShrink:0}}>
                              <div style={{height:"100%",width:`${p.attendance_rating}%`,borderRadius:99,
                                background:p.attendance_rating===100?"#22c55e":p.attendance_rating>=80?"#1a1a2e":"#EF4444",
                                transition:"width .5s ease"}}/>
                            </div>
                            {/* Show % only when not 100% */}
                            {p.attendance_rating<100&&(
                              <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,
                                color:p.attendance_rating>=80?"#555":"#991B1B",fontWeight:600}}>
                                {p.attendance_rating}%
                              </span>
                            )}
                          </div>
                        ):(
                          <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#ccc"}}>—</span>
                        )}
                        {p.no_show_count>0&&(
                          <div style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:"#92400E",marginTop:2}}>
                            {p.no_show_count} no-show{p.no_show_count>1?"s":""}
                          </div>
                        )}
                      </td>}

                      {visibleCols.includes("flags")&&<td style={TD}>
                        <div style={{display:"flex",flexDirection:"column",gap:3}}>
                          {p.sandbagging_flag&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:9,fontWeight:500,background:"#FEF2F2",color:"#991B1B",padding:"1px 6px",borderRadius:99,border:"1px solid #FCA5A5"}}>⚠ Sandbagging</span>}
                          {p.no_show_count>0&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:9,fontWeight:500,background:"#FEF3C7",color:"#92400E",padding:"1px 6px",borderRadius:99,border:"1px solid #FDE68A"}}>🚫 {p.no_show_count} no-show{p.no_show_count>1?"s":""}</span>}
                          {!p.sandbagging_flag&&p.no_show_count===0&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#ccc"}}>—</span>}
                        </div>
                      </td>}

                      <td style={{...TD,width:24,color:"#ccc",fontSize:12,textAlign:"right",opacity:hoveredRow===p.id?1:0,transition:"opacity .15s"}}>→</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        </div>{/* end table panel */}

        {/* Detail panel */}
        {selected&&(
          <div style={{width:420,borderLeft:"1px solid #E8E6DF",background:"#fff",height:"100vh",overflowY:"auto",flexShrink:0}}>
            <HistoryPanel player={selected} onClose={()=>setSelected(null)}/>
          </div>
        )}

      </div>

      {toast&&<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:500,background:"#1a1a2e",color:"#D4A017",padding:"10px 22px",borderRadius:99,boxShadow:"0 8px 24px rgba(0,0,0,.2)",zIndex:2000,animation:"slideUp .25s ease",whiteSpace:"nowrap"}}>{toast}</div>}
    </>
  );
}

const wowBtn={fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:500,background:"#EEF2FF",border:"1px solid #C7D2FE",color:"#1a1a2e",padding:"7px 11px",borderRadius:7,cursor:"pointer"};
const fL={fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",textTransform:"uppercase",letterSpacing:".07em",display:"block",marginBottom:4};
const sel={fontFamily:"'DM Mono',monospace",fontSize:11,background:"#F6F5F0",border:"1px solid #E8E6DF",borderRadius:6,padding:"5px 8px",color:"#333",outline:"none",minWidth:120};
const TH={fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:500,color:"#888",textTransform:"uppercase",letterSpacing:".07em",padding:"11px 14px",textAlign:"left",borderBottom:"1px solid #E8E6DF",background:"#FAFAF8",cursor:"pointer",userSelect:"none",whiteSpace:"nowrap"};
const TD={padding:"11px 14px",verticalAlign:"middle",borderBottom:"1px solid #F3F2ED"};
