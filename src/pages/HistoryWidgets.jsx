// Player History: the analysis tools, the data-check dialog and the player drawer. Moved out of History.jsx unchanged except where noted.
import { useState, useMemo } from "react";
import { adminUrl, apiCall, DIVISION_COLOR, DIVISION_HUE, TIER_COLOR, avatarColor, DIVISION_LABEL, DIVISION_KEYS, TIER_ORDER, TIER_VAL, titleCase, tierTrend, TREND, tierMoves, csvCell, inversePatch } from "./historyShared.js";

// ─── WOW 2: Tier sparkline ────────────────────────────────────────────────────
export function TierSparkline({ history }) {
  const withTier = history.filter(h => TIER_VAL(h.skill_tier) >= 0);
  if (withTier.length < 2) {
    const tc = TIER_COLOR(withTier[0]?.skill_tier);
    return <span title={withTier.length ? "Only one season has a tier" : "No tier recorded"} style={{ fontFamily:"'DM Mono',monospace",fontSize:12,
      background:tc.bg,color:tc.color,padding:"1px 5px",borderRadius:3 }}>
      {withTier[0]?.skill_tier||"—"}
    </span>;
  }
  const vals = [...withTier].sort((a,b)=>a.season-b.season).map(h=>TIER_VAL(h.skill_tier));
  const min=Math.min(...vals), max=Math.max(...vals,min+1);
  const W=52, H=18, pad=2;
  const x=(i)=>pad+((i/(vals.length-1))*(W-pad*2));
  const y=(v)=>pad+((v-min)/(max-min+1))*(H-pad*2);
  const pts=vals.map((v,i)=>`${x(i)},${y(v)}`).join(" ");
  const trend=tierTrend(withTier);
  const col=trend==="improved"?"#166534":trend==="declined"?"#991B1B":"#6B7280";
  return (
    <div style={{ display:"flex",alignItems:"center",gap:5 }}>
      <svg width={W} height={H} style={{ flexShrink:0 }}>
        <polyline points={pts} fill="none" stroke={col} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        {vals.map((v,i)=><circle key={i} cx={x(i)} cy={y(v)} r={i===vals.length-1?2.5:1.5} fill={i===vals.length-1?col:"#E8E6DF"}/>)}
      </svg>
      <span style={{ fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:700,color:col }}>
        {TREND[trend].arrow}
      </span>
    </div>
  );
}

// ─── WOW 4: DNA avatar ────────────────────────────────────────────────────────
export function DNAAvatar({ player, size=32 }) {
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
      <div style={{ fontFamily:"'DM Mono',monospace",fontSize:12,color:"#6b6b7b",
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
                <span style={{ fontFamily:"'Fraunces',serif",fontSize:12,fontWeight:700,
                  color:"#1a1a2e" }}>{h.season}</span>
                <span style={{ fontFamily:"'DM Mono',monospace",fontSize:12,color:dc.color||"#888",
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
          fontFamily:"'DM Mono',monospace",fontSize:12,color:"#555",
          display:"grid",gridTemplateColumns:"1fr 1fr",gap:6 }}>
          {[
            ["Season",    sorted[hov].season],
            ["Division",  DIVISION_LABEL[sorted[hov].division]||sorted[hov].division],
            ["Team",      sorted[hov].team],
            ["Tier",      sorted[hov].skill_tier],
            ["Result",    sorted[hov].championship==="winner"?"🏆 Champion":sorted[hov].championship],
            ["Captain",   sorted[hov].was_captain?"Yes":"No"],
            ["Attended",  sorted[hov].games_scheduled===null?"not recorded":`${sorted[hov].games_attended??0}/${sorted[hov].games_scheduled} games`],
            ["No-shows",  sorted[hov].no_show],
          ].map(([k,v])=>(
            <div key={k} style={{ display:"flex",gap:6 }}>
              <span style={{ color:"#6b6b7b",minWidth:56 }}>{k}</span>
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
export function SandbagPredictor({ players, onClose }) {
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
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#D4A017",
              textTransform:"uppercase",letterSpacing:".1em",marginBottom:3}}>⚡ 2027 Risk Analysis</div>
            <h2 style={{fontFamily:"'Fraunces',serif",fontSize:18,fontWeight:700,color:"#fff",margin:0}}>
              Historical Sandbagging Predictor
            </h2>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"rgba(255,255,255,.4)",marginTop:3}}>
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
                  fontSize:12,fontWeight:600,color:grp.col,textTransform:"uppercase",
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
                      <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#666"}}>
                        Historical avg tier: {p.avgTier} · Self-reported for 2027: {p.skill_tier_reported}
                        {p.gap>0?" — registered LOWER than history":p.gap<0?" — registered HIGHER than history":" — consistent"}
                      </div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,color:grp.col}}>{p.riskScore}</div>
                      <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#6b6b7b"}}>risk score</div>
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
export function SeasonDiff({ players, onClose }) {
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
  const selS={fontFamily:"'DM Mono',monospace",fontSize:12,background:"rgba(255,255,255,.1)",
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
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#D4A017",
              textTransform:"uppercase",letterSpacing:".1em",marginBottom:3}}>Season Comparison</div>
            <h2 style={{fontFamily:"'Fraunces',serif",fontSize:17,fontWeight:700,color:"#fff",margin:0}}>
              Season diff view
            </h2>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <select value={yr1} onChange={e=>setYr1(+e.target.value)} style={selS}>
              {allYears.map(y=><option key={y} value={y}>{y}</option>)}
            </select>
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"rgba(255,255,255,.4)"}}>vs</span>
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
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#6b6b7b"}}>{col.subtitle}</div>
              </div>
              <div style={{padding:"8px 14px",maxHeight:380,overflowY:"auto"}}>
                {col.items.length===0?<p style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#6b6b7b",textAlign:"center",padding:"24px 0"}}>None</p>:
                col.items.map(p=>(
                  <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid rgba(0,0,0,.04)"}}>
                    <DNAAvatar player={p} size={22}/>
                    <div>
                      <div style={{fontFamily:"'Fraunces',serif",fontSize:12,fontWeight:600,color:"#1a1a2e"}}>
                        {titleCase(p.first_name)} {titleCase(p.last_name)}
                      </div>
                      <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#6b6b7b"}}>
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
export function CohortChart({ players, onClose }) {
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
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#D4A017",
              textTransform:"uppercase",letterSpacing:".1em",marginBottom:3}}>Cohort Analysis</div>
            <h2 style={{fontFamily:"'Fraunces',serif",fontSize:17,fontWeight:700,color:"#fff",margin:0}}>
              Player retention by cohort
            </h2>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#D4A017",fontSize:16,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{overflowY:"auto",flex:1,padding:"16px 22px"}}>
          <p style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#666",marginBottom:16}}>
            Each row shows a first-year cohort and how many returned in subsequent seasons.
          </p>
          {cohorts.map(c=>(
            <div key={c.year} style={{marginBottom:16,background:"#FAFAF8",borderRadius:10,padding:"12px 16px"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <span style={{fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:700,color:"#1a1a2e"}}>{c.year} cohort</span>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#6b6b7b"}}>{c.n} first-time players</span>
              </div>
              {c.retention.length===0&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#6b6b7b"}}>No subsequent seasons to show yet</span>}
              {c.retention.map(r=>{
                const col=r.pct>=70?"#166534":r.pct>=50?"#92400E":"#991B1B";
                return(
                  <div key={r.year} style={{display:"flex",alignItems:"center",gap:10,marginBottom:5}}>
                    <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#666",minWidth:36}}>{r.year}</span>
                    <div style={{flex:1,height:5,background:"#E8E6DF",borderRadius:99,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${r.pct}%`,background:col,borderRadius:99,transition:"width .8s ease"}}/>
                    </div>
                    <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:600,color:col,minWidth:36}}>{r.pct}%</span>
                    <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#6b6b7b"}}>{r.n}/{c.n}</span>
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

// ─── WOW 9: Where Are They Now (real registrations for the current season) ───
export function WhereAreTheyNow({ players, registeredIds, year, onClose }) {
  const known = registeredIds instanceof Set;
  const registered  = known ? players.filter(p=>registeredIds.has(p.id)) : [];
  const notReturned = known ? players.filter(p=>!registeredIds.has(p.id)).sort((a,b)=>(b.history[0]?.season||0)-(a.history[0]?.season||0)) : [];
  const pct = players.length>0 ? Math.round(registered.length/players.length*100) : null;
  const exportList=()=>{
    const rows=[["Last","First","Email","Last season","Last division"],
      ...notReturned.map(p=>[titleCase(p.last_name),titleCase(p.first_name),p.email,p.history[0]?.season||"",DIVISION_LABEL[p.history[0]?.division]||""])];
    const blob=new Blob([rows.map(r=>r.map(csvCell).join(",")).join("\n")],{type:"text/csv"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a");
    a.href=url; a.download=`grsh-not-yet-registered-${year}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  return(
    <div role="dialog" aria-modal="true" aria-label="Where are they now" style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:2000,
      display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#fff",borderRadius:14,maxWidth:600,width:"100%",
        maxHeight:"85vh",overflow:"hidden",display:"flex",flexDirection:"column",
        boxShadow:"0 32px 80px rgba(0,0,0,.25)"}}>
        <div style={{padding:"18px 22px 14px",background:"#1a1a2e",display:"flex",
          justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#D4A017",
              textTransform:"uppercase",letterSpacing:".1em",marginBottom:3}}>{year} registrations</div>
            <h2 style={{fontFamily:"'Fraunces',serif",fontSize:18,fontWeight:700,color:"#fff",margin:0}}>
              Where are they now?
            </h2>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"rgba(255,255,255,.6)",marginTop:3}}>
              {!known ? "Registration data could not be loaded." : pct===null ? "No players on record yet." : `${registered.length} of ${players.length} history players have registered for ${year} (${pct}%)`}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{background:"none",border:"none",color:"#D4A017",fontSize:18,cursor:"pointer"}}>✕</button>
        </div>
        {!known ? <div style={{padding:24,fontSize:14,color:"#991B1B"}}>The list of {year} registrations did not load, so nobody can be matched. Close this and use Reload on the page.</div> : (
        <div style={{overflowY:"auto",flex:1}}>
          <div style={{padding:"12px 22px",background:"#E6F4EA",borderBottom:"1px solid #86EFAC"}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#166534",fontWeight:600,marginBottom:8}}>
              ✓ Registered for {year} ({registered.length})
            </div>
            {registered.length===0&&<div style={{fontSize:13,color:"#166534"}}>Nobody yet.</div>}
            {registered.map(p=>(
              <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0"}}>
                <DNAAvatar player={p} size={24}/>
                <span style={{fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:600,color:"#1a1a2e"}}>{titleCase(p.first_name)} {titleCase(p.last_name)}</span>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#6b6b7b"}}>· last played {p.history[0]?.season}</span>
              </div>
            ))}
          </div>
          <div style={{padding:"12px 22px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,gap:8,flexWrap:"wrap"}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#991B1B",fontWeight:600}}>✗ Not yet registered ({notReturned.length})</div>
              <div style={{display:"flex",gap:6}}>
                <a href={adminUrl("grsh-tm-players")} style={{fontFamily:"'DM Mono',monospace",fontSize:12,background:"#F6F5F0",color:"#1a1a2e",border:"1px solid #E8E6DF",padding:"5px 12px",borderRadius:6,textDecoration:"none"}}>Send invites (Players → Renewals)</a>
                <button onClick={exportList} disabled={!notReturned.length} style={{fontFamily:"'DM Mono',monospace",fontSize:12,background:"#1a1a2e",color:"#D4A017",border:"none",padding:"5px 12px",borderRadius:6,cursor:notReturned.length?"pointer":"default",opacity:notReturned.length?1:.5}}>↓ Export contact list</button>
              </div>
            </div>
            {notReturned.map(p=>(
              <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid #F9F8F4"}}>
                <DNAAvatar player={p} size={24}/>
                <div style={{flex:1}}>
                  <span style={{fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:600,color:"#444"}}>{titleCase(p.first_name)} {titleCase(p.last_name)}</span>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#6b6b7b",marginLeft:6}}>last played {p.history[0]?.season} · {DIVISION_LABEL[p.history[0]?.division]||"no division"}{p.email?"":" · no email"}</span>
                </div>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:(p.history[0]?.season||0)>=year-2?"#166534":(p.history[0]?.season||0)>=year-4?"#92400E":"#6b6b7b"}}>
                  {(p.history[0]?.season||0)>=year-2?"Recent":"Inactive"}
                </span>
              </div>
            ))}
          </div>
        </div>)}
      </div>
    </div>
  );
}

// ─── WOW 10: Season story modal ───────────────────────────────────────────────
export function SeasonStory({ players, season, onClose }) {
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
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#D4A017",
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
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#6b6b7b",textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>Division breakdown</div>
            {Object.entries(divGroups).map(([div,ps])=>(
              <div key={div} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:DIVISION_HUE[div]||"#1a1a2e",flexShrink:0}}/>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#555",minWidth:80}}>{DIVISION_LABEL[div]||div}</span>
                <div style={{flex:1,height:5,background:"#F0EEE8",borderRadius:99,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${Math.round(ps.length/sp.length*100)}%`,background:DIVISION_HUE[div]||"#1a1a2e",borderRadius:99}}/>
                </div>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#666"}}>{ps.length} players</span>
              </div>
            ))}
          </div>
          {/* Champions */}
          {champs.length>0&&(
            <div style={{background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:10,padding:"14px 16px",marginBottom:16}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#92400E",textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>🏆 Champions</div>
              {champs.map(p=>(
                <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0"}}>
                  <DNAAvatar player={p} size={24}/>
                  <span style={{fontFamily:"'Fraunces',serif",fontSize:12,fontWeight:600,color:"#1a1a2e"}}>
                    {titleCase(p.first_name)} {titleCase(p.last_name)}
                  </span>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#6b6b7b"}}>
                    · {DIVISION_LABEL[p.history.find(h=>+h.season===+season)?.division]||""}
                    {p.history.find(h=>+h.season===+season)?.was_captain?" · Captain":""}
                  </span>
                </div>
              ))}
            </div>
          )}
          {/* New players */}
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#6b6b7b",textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>
            🆕 First-season players ({newPlayers.length})
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {newPlayers.map(p=>(
              <span key={p.id} style={{fontFamily:"'DM Mono',monospace",fontSize:12,
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

// ─── Needs review: data gaps, possible duplicates, big tier moves ───────────────
export function NeedsReview({ overview, overviewErr, players, startTab, onClose, onShowGap, onOpenPlayer, onMerge, onDismiss, busyKey }) {
  const [tab,setTab]=useState(startTab||"gaps");
  const [confirm,setConfirm]=useState(null);       // {key, keepId}
  const moves=useMemo(()=>tierMoves(players),[players]);
  const dupes=(overview&&overview.duplicates)||[];
  const quality=(overview&&overview.quality)||[];
  const gapTotal=quality.reduce((s,q)=>s+(q.count||0),0);
  const tabBtn=(k,l,n)=>(
    <button key={k} role="tab" aria-selected={tab===k} onClick={()=>{setTab(k);setConfirm(null);}} style={{fontFamily:"'DM Mono',monospace",fontSize:12,padding:"8px 14px",border:"none",borderBottom:`3px solid ${tab===k?"#D4A017":"transparent"}`,background:"none",color:tab===k?"#1a1a2e":"#6b6b7b",fontWeight:tab===k?700:500,cursor:"pointer"}}>
      {l} <span style={{background:n>0?"#FEF3C7":"#E6F4EA",color:n>0?"#92400E":"#166534",borderRadius:99,padding:"1px 8px",marginLeft:4}}>{n}</span>
    </button>);
  const pname=(p)=>`${titleCase(p.first_name)} ${titleCase(p.last_name)}`;
  const btn={fontFamily:"'DM Mono',monospace",fontSize:12,background:"#F6F5F0",border:"1px solid #E8E6DF",color:"#1a1a2e",padding:"6px 12px",borderRadius:6,cursor:"pointer"};
  return(
    <div role="dialog" aria-modal="true" aria-label="Needs review" style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#fff",borderRadius:14,maxWidth:720,width:"100%",maxHeight:"88vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 32px 80px rgba(0,0,0,.25)"}}>
        <div style={{padding:"16px 22px",background:"#1a1a2e",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <h2 style={{fontFamily:"'Fraunces',serif",fontSize:18,fontWeight:700,color:"#fff",margin:0}}>Needs review</h2>
          <button onClick={onClose} aria-label="Close" autoFocus style={{background:"none",border:"none",color:"#D4A017",fontSize:18,cursor:"pointer"}}>✕</button>
        </div>
        <div role="tablist" style={{display:"flex",borderBottom:"1px solid #E8E6DF",padding:"0 12px"}}>
          {tabBtn("gaps","Missing data",gapTotal)}{tabBtn("dupes","Possible duplicates",dupes.length)}{tabBtn("moves","Big tier moves",moves.length)}
        </div>
        <div style={{overflowY:"auto",flex:1,padding:"14px 22px 20px"}}>
          {overviewErr&&tab!=="moves"&&<div role="alert" style={{background:"#FEF2F2",border:"1px solid #FCA5A5",color:"#991B1B",padding:"10px 14px",borderRadius:8,fontSize:13}}>The data checks could not load: {overviewErr}</div>}
          {tab==="gaps"&&overview&&(
            <div>
              <p style={{fontSize:13,color:"#555",margin:"0 0 12px"}}>Dashes on this page usually mean "never recorded", not "none". These counts show where that is happening.</p>
              {quality.map(q=>(
                <div key={q.key} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid #F3F2ED"}}>
                  <span style={{fontFamily:"'Fraunces',serif",fontSize:20,fontWeight:700,minWidth:44,color:q.count>0?"#92400E":"#166534"}}>{q.count}</span>
                  <div style={{flex:1}}><div style={{fontSize:14,fontWeight:600}}>{q.label}</div><div style={{fontSize:12,color:"#6b6b7b"}}>{q.hint}</div></div>
                  {q.count>0&&<button style={btn} onClick={()=>onShowGap(q.key)}>Show players</button>}
                </div>
              ))}
            </div>
          )}
          {tab==="dupes"&&overview&&(
            <div>
              <p style={{fontSize:13,color:"#555",margin:"0 0 12px"}}>Two records with the same season are two different people, so those are never listed. Merging moves all history onto the record you keep and removes the other. Check before you confirm.</p>
              {dupes.length===0&&<div style={{padding:16,color:"#166534",fontSize:14}}>No likely duplicates.</div>}
              {dupes.map(d=>{
                const key=d.a.id+"-"+d.b.id;
                return(
                <div key={key} style={{border:"1px solid #E8E6DF",borderRadius:10,padding:"10px 14px",marginBottom:10}}>
                  <div style={{fontSize:12,color:"#92400E",marginBottom:6}}>{d.why}</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                    {[d.a,d.b].map(x=>(
                      <div key={x.id}><div style={{fontWeight:600,fontSize:14}}>{x.name}</div><div style={{fontSize:12,color:"#6b6b7b"}}>{x.email||"no email"}</div><div style={{fontSize:12,color:"#6b6b7b"}}>Seasons: {x.seasons.slice().sort().join(", ")||"none"}</div></div>
                    ))}
                  </div>
                  <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
                    {confirm&&confirm.key===key ? (
                      <>
                        <span style={{fontSize:13,alignSelf:"center"}}>Keep <b>{(confirm.keepId===d.a.id?d.a:d.b).name}</b> and remove the other?</span>
                        <button style={{...btn,background:"#1a1a2e",color:"#D4A017"}} disabled={busyKey===key} onClick={()=>{onMerge(d,confirm.keepId);setConfirm(null);}}>Yes, merge</button>
                        <button style={btn} onClick={()=>setConfirm(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button style={btn} disabled={busyKey===key} onClick={()=>setConfirm({key,keepId:d.a.id})}>Keep {d.a.name.split(" ")[0]}'s record</button>
                        <button style={btn} disabled={busyKey===key} onClick={()=>setConfirm({key,keepId:d.b.id})}>Keep {d.b.name.split(" ")[0]}'s record</button>
                        <button style={btn} disabled={busyKey===key} onClick={()=>onDismiss(d)}>Not the same person</button>
                      </>
                    )}
                  </div>
                </div>);
              })}
            </div>
          )}
          {tab==="moves"&&(
            <div>
              <p style={{fontSize:13,color:"#555",margin:"0 0 12px"}}>A skill tier that changed by 3 or more steps between two seasons in a row (for example B2 to A2). Often real, sometimes a typing mistake. Worth a look before the draft.</p>
              {moves.length===0&&<div style={{padding:16,color:"#166534",fontSize:14}}>No big tier moves.</div>}
              {moves.map((m,i)=>(
                <div key={m.player.id+"-"+i} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 0",borderBottom:"1px solid #F3F2ED"}}>
                  <div style={{flex:1}}><div style={{fontWeight:600,fontSize:14}}>{pname(m.player)}</div>
                    <div style={{fontSize:12,color:"#6b6b7b"}}>{m.from.season}: {m.from.skill_tier} → {m.to.season}: {m.to.skill_tier}</div></div>
                  <span style={{fontSize:12,fontWeight:700,color:m.better?"#166534":"#991B1B"}}>{m.better?"↑":"↓"} {m.steps} steps</span>
                  <button style={btn} onClick={()=>onOpenPlayer(m.player)}>Open</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Fix-in-place editors (drawer) ─────────────────────────────────────────────
const inp={fontFamily:"'DM Mono',monospace",fontSize:12,border:"1px solid #D8D6CE",borderRadius:6,padding:"5px 8px",background:"#fff",color:"#222",minWidth:0};
const lab={fontFamily:"'DM Mono',monospace",fontSize:12,color:"#6b6b7b",display:"flex",flexDirection:"column",gap:3};

function RowEditor({ h, onDone, onToast }) {
  const init={skill_tier_reported:h.skill_tier||"",division_played:h.division||"",team_name:h.team||"",championship_result:h.championship||"none",
    games_scheduled:h.games_scheduled===null?"":String(h.games_scheduled),games_attended:h.games_attended===null?"":String(h.games_attended),
    no_show_count:String(h.no_show||0),sandbagging_flag:!!h.sandbagging_flag,committee_notes:h.notes||""};
  const [f,setF]=useState(init);
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");
  const set=(k,v)=>setF(x=>({...x,[k]:v}));
  const save=async()=>{
    if(busy) return;
    const changed={}; Object.keys(f).forEach(k=>{ if(f[k]!==init[k]) changed[k]=f[k]; });
    if(!Object.keys(changed).length){ setErr("Nothing changed."); return; }
    setBusy(true); setErr("");
    const r=await apiCall(`/history/records/${h.row_id}`,{method:"POST",body:JSON.stringify(changed)});
    setBusy(false);
    if(!r.ok){ setErr(r.error); return; }
    // the server keeps a before/after audit row for every edit, so putting the old values back is just another save
    const undo=()=>apiCall(`/history/records/${h.row_id}`,{method:"POST",body:JSON.stringify(inversePatch(init,changed))});
    onToast("✓ Saved "+h.season,undo); onDone(true);
  };
  return(
    <div style={{background:"#FAFAF8",border:"1px solid #E8E6DF",borderRadius:8,padding:12,marginTop:8}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <label style={lab}>Skill tier<select value={f.skill_tier_reported} onChange={e=>set("skill_tier_reported",e.target.value)} style={inp}><option value="">Not recorded</option>{TIER_ORDER.map(t=><option key={t} value={t}>{t}</option>)}</select></label>
        <label style={lab}>Division<select value={f.division_played} onChange={e=>set("division_played",e.target.value)} style={inp}><option value="">Not recorded</option>{DIVISION_KEYS.map(d=><option key={d} value={d}>{DIVISION_LABEL[d]}</option>)}</select></label>
        <label style={lab}>Team<input value={f.team_name} maxLength={100} onChange={e=>set("team_name",e.target.value)} style={inp}/></label>
        <label style={lab}>Result<select value={f.championship_result} onChange={e=>set("championship_result",e.target.value)} style={inp}><option value="none">None</option><option value="participant">Participant</option><option value="runner_up">Runner-up</option><option value="winner">Champion</option></select></label>
        <label style={lab}>Games scheduled<input inputMode="numeric" value={f.games_scheduled} onChange={e=>set("games_scheduled",e.target.value)} style={inp} placeholder="not recorded"/></label>
        <label style={lab}>Games attended<input inputMode="numeric" value={f.games_attended} onChange={e=>set("games_attended",e.target.value)} style={inp} placeholder="not recorded"/></label>
        <label style={lab}>No-shows<input inputMode="numeric" value={f.no_show_count} onChange={e=>set("no_show_count",e.target.value)} style={inp}/></label>
        <label style={{...lab,flexDirection:"row",alignItems:"center",gap:6,paddingTop:16}}><input type="checkbox" checked={f.sandbagging_flag} onChange={e=>set("sandbagging_flag",e.target.checked)}/>Sandbagging flag</label>
      </div>
      <label style={{...lab,marginTop:8}}>Committee notes<textarea rows={2} maxLength={2000} value={f.committee_notes} onChange={e=>set("committee_notes",e.target.value)} style={{...inp,resize:"vertical"}}/></label>
      {err&&<div role="alert" style={{color:"#991B1B",fontSize:12,marginTop:6}}>{err}</div>}
      <div style={{display:"flex",gap:8,marginTop:10}}>
        <button onClick={save} disabled={busy} style={{...inp,background:"#1a1a2e",color:"#D4A017",border:"none",cursor:"pointer",padding:"6px 14px"}}>{busy?"Saving…":"Save"}</button>
        <button onClick={()=>onDone(false)} style={{...inp,cursor:"pointer",padding:"6px 14px"}}>Cancel</button>
      </div>
    </div>
  );
}

function PlayerEditor({ player, onDone, onToast }) {
  const init={first_name:player.first_name||"",last_name:player.last_name||"",email:player.email||""};
  const [f,setF]=useState(init); const [busy,setBusy]=useState(false); const [err,setErr]=useState("");
  const save=async()=>{
    if(busy) return;
    const changed={}; Object.keys(f).forEach(k=>{ if(f[k].trim()!==init[k]) changed[k]=f[k].trim(); });
    if(!Object.keys(changed).length){ setErr("Nothing changed."); return; }
    setBusy(true); setErr("");
    const r=await apiCall(`/history/players/${player.id}`,{method:"POST",body:JSON.stringify(changed)});
    setBusy(false);
    if(!r.ok){ setErr(r.error); return; }
    const undo=()=>apiCall(`/history/players/${player.id}`,{method:"POST",body:JSON.stringify(inversePatch(init,changed))});
    onToast("✓ Player saved",undo); onDone(true);
  };
  return(
    <div style={{background:"#FAFAF8",border:"1px solid #E8E6DF",borderRadius:8,padding:12,margin:"10px 18px"}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <label style={lab}>First name<input value={f.first_name} onChange={e=>setF({...f,first_name:e.target.value})} style={inp}/></label>
        <label style={lab}>Last name<input value={f.last_name} onChange={e=>setF({...f,last_name:e.target.value})} style={inp}/></label>
      </div>
      <label style={{...lab,marginTop:8}}>Email<input type="email" value={f.email} onChange={e=>setF({...f,email:e.target.value})} style={inp}/></label>
      {err&&<div role="alert" style={{color:"#991B1B",fontSize:12,marginTop:6}}>{err}</div>}
      <div style={{display:"flex",gap:8,marginTop:10}}>
        <button onClick={save} disabled={busy} style={{...inp,background:"#1a1a2e",color:"#D4A017",border:"none",cursor:"pointer",padding:"6px 14px"}}>{busy?"Saving…":"Save"}</button>
        <button onClick={()=>onDone(false)} style={{...inp,cursor:"pointer",padding:"6px 14px"}}>Cancel</button>
      </div>
    </div>
  );
}

// ─── History Panel (right drawer) ─────────────────────────────────────────────
export function HistoryPanel({ player, onClose, onSaved, onToast }) {
  const [editRow,setEditRow]=useState(null);
  const [editPlayer,setEditPlayer]=useState(false);
  const name      = `${titleCase(player.first_name)} ${titleCase(player.last_name)}`;
  const champs    = player.history.filter(h=>h.championship==="winner");
  const caps      = player.history.filter(h=>h.was_captain);
  const divisions = [...new Set(player.history.map(h=>h.division))];
  const trend     = tierTrend(player.history);
  const trendInfo = TREND[trend];
  const lastSeason= player.history[0]?.season;
  return(
    <div role="complementary" aria-label={`History for ${name}`} style={{display:"flex",flexDirection:"column",height:"calc(100vh - 32px)"}}>
      {/* Header */}
      <div style={{padding:"14px 18px",borderBottom:"1px solid #F0EEE8",flexShrink:0,
        display:"flex",alignItems:"center",gap:10}}>
        <DNAAvatar player={player} size={36}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:700,color:"#1a1a2e",
            display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            {name}
            {champs.length>0&&<span style={{fontSize:12}}>🏆</span>}
            {player.sandbagging_flag&&<span style={{fontSize:12,color:"#EF4444"}}>⚠</span>}
          </div>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:player.email?"#6b6b7b":"#991B1B",marginTop:1}}>
            {player.email||"No email on record"} <button onClick={()=>setEditPlayer(e=>!e)} aria-expanded={editPlayer} style={{background:"none",border:"none",color:"#1a1a2e",textDecoration:"underline",cursor:"pointer",fontSize:12,padding:0}}>Edit</button>
          </div>
        </div>
        {/* #14 Last active */}
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#6b6b7b",textTransform:"uppercase"}}>Last active</div>
          <div style={{fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:700,
            color:lastSeason>=new Date().getFullYear()-2?"#166534":lastSeason>=new Date().getFullYear()-4?"#92400E":"#6b6b7b"}}>{lastSeason}</div>
        </div>
        <button onClick={onClose} aria-label="Close player panel" style={{background:"none",border:"none",fontSize:16,color:"#555",cursor:"pointer",padding:"4px 8px"}}>✕</button>
      </div>

      {player.sandbagging_flag&&<div style={{fontFamily:"'DM Mono',monospace",fontSize:12,
        background:"#FFFBEB",borderBottom:"1px solid #FDE68A",color:"#92400E",
        padding:"7px 18px",fontWeight:500}}>
        ⚠ Sandbagging review — historical tier exceeds self-reported. Committee action required.
      </div>}

      <div style={{flex:1,overflowY:"auto",minHeight:0}}>
        {editPlayer&&<PlayerEditor player={player} onToast={onToast} onDone={(saved)=>{setEditPlayer(false);if(saved)onSaved();}}/>}
        {/* WOW 1: Career timeline */}
        <CareerTimeline player={player}/>

        {/* Career stats */}
        <div style={{padding:"14px 18px",borderBottom:"1px solid #F0EEE8"}}>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#6b6b7b",textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>Career summary</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
            {[
              ["Seasons",     player.history.length],
              ["Championships",champs.length],
              ["Captaincies", caps.length],
              ["Attendance",  player.attendance_rating!=null?`${player.attendance_rating}%`:"—"],
              ["No-shows",    player.games_recorded?player.no_show_count:"n/a"],
              ["Tier trend",  trend==="unknown"?"—":trendInfo.arrow+" "+trendInfo.label],
            ].map(([k,v])=>(
              <div key={k} style={{textAlign:"center",background:"#F6F5F0",borderRadius:8,padding:"8px"}}>
                <div style={{fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,color:"#1a1a2e"}}>{v}</div>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#6b6b7b",textTransform:"uppercase",marginTop:2}}>{k}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Season-by-season */}
        <div style={{padding:"14px 18px",borderBottom:"1px solid #F0EEE8"}}>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#6b6b7b",textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>Season by season</div>
          {player.history.map(h=>{
            const dc=DIVISION_COLOR[h.division]||{};
            const tc=TIER_COLOR(h.skill_tier);
            const isChamp=h.championship==="winner";
            const attOk=h.games_scheduled>0?Math.round((h.games_attended||0)/h.games_scheduled*100):null;
            return(
              <div key={h.row_id||h.season} style={{display:"flex",alignItems:"flex-start",gap:10,
                padding:"10px 0",borderBottom:"1px solid #F9F8F4"}}>
                {/* #26 Recency gradient */}
                <div style={{width:38,textAlign:"center",flexShrink:0}}>
                  <div style={{fontFamily:"'Fraunces',serif",fontSize:14,fontWeight:700,
                    color:h.season===player.history[0]?.season?"#1a1a2e":"#aaa"}}>{h.season}</div>
                </div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap",marginBottom:4}}>
                    {dc.bg?<span style={{fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:500,
                      background:dc.bg,color:dc.color,padding:"1px 6px",borderRadius:99,
                      border:`1px solid ${dc.border||dc.bg}`}}>{DIVISION_LABEL[h.division]||h.division}</span>
                      :<span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#991B1B",border:"1px dashed #FCA5A5",padding:"1px 6px",borderRadius:99}}>No division</span>}
                    {h.skill_tier?<span style={{fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:500,
                      background:tc.bg,color:tc.color,padding:"1px 5px",borderRadius:99}}>{h.skill_tier}</span>
                      :<span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#991B1B",border:"1px dashed #FCA5A5",padding:"1px 6px",borderRadius:99}}>No tier</span>}
                    {isChamp&&<span style={{fontSize:12}}>🏆</span>}
                    {h.was_captain&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:12,
                      background:"#EDE9FE",color:"#4C1D95",padding:"1px 5px",borderRadius:99}}>© Captain</span>}
                    {h.was_alternate&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:12,
                      background:"#F3F4F6",color:"#666",padding:"1px 5px",borderRadius:99}}>Sub</span>}
                  </div>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#6b6b7b"}}>
                    {h.team||"No team recorded"}{attOk!=null?` · ${attOk}% attendance`:" · attendance not recorded"}
                    {h.no_show>0&&<span style={{color:"#92400E"}}> · {h.no_show} no-show</span>}
                    {" "}<button onClick={()=>setEditRow(editRow===h.row_id?null:h.row_id)} style={{background:"none",border:"none",color:"#1a1a2e",textDecoration:"underline",cursor:"pointer",fontSize:12,padding:0}}>{editRow===h.row_id?"Close":"Edit"}</button>
                  </div>
                  {editRow===h.row_id&&<RowEditor h={h} onToast={onToast} onDone={(saved)=>{setEditRow(null);if(saved)onSaved();}}/>}
                </div>
              </div>
            );
          })}
        </div>

        {/* #16 cross-ref link */}
        <div style={{padding:"12px 18px",borderBottom:"1px solid #F0EEE8"}}>
          <a href={`/wp-admin/admin.php?page=grsh-tm-players`}
            style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#1a1a2e",textDecoration:"underline"}}>
            Open the Players page →
          </a>
        </div>

        {/* Divisions history */}
        <div style={{padding:"14px 18px"}}>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#6b6b7b",textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>All divisions played</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {divisions.map(d=>{const dc=DIVISION_COLOR[d]||{};return<span key={d} style={{fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:500,background:dc.bg||"#F6F5F0",color:dc.color||"#555",border:`1px solid ${dc.border||"#E8E6DF"}`,padding:"2px 8px",borderRadius:99}}>{DIVISION_LABEL[d]||d}</span>;})}
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div style={{padding:"12px 18px",borderTop:"1px solid #F0EEE8",display:"flex",gap:8,flexShrink:0}}>
        <button onClick={()=>generateCareerCard(player)}
          style={{flex:1,fontFamily:"'DM Mono',monospace",fontSize:12,background:"#F6F5F0",
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

