import { useState, useMemo, useCallback, useEffect, useRef } from "react";

// ─── Config ───────────────────────────────────────────────────────────────────
const TIER_ORDER = ["A1","A2","A3","B1","B2","B3","C1","C2","R1","R2","R3"];
const POSITION_LABEL = { defenseman:"Defense",center:"Center",winger:"Winger",goaltender:"Goalie" };
const POSITION_COLOR = {
  defenseman:{ bg:"#E8F0FE",color:"#1A3F8F" },
  center:    { bg:"#E8F8EF",color:"#1A5C35" },
  winger:    { bg:"#FDF3E8",color:"#7A4A18" },
  goaltender:{ bg:"#FCE8E8",color:"#7A1818" },
};
const TIER_COLOR = (t) => {
  if(!t) return { bg:"#F3F4F6",color:"#6B7280" };
  const f=t[0];
  if(f==="A") return { bg:"#FCE8E8",color:"#7A1818" };
  if(f==="B") return { bg:"#FEF0E8",color:"#7A4518" };
  if(f==="C") return { bg:"#FEF9E7",color:"#7A5A18" };
  return { bg:"#E8F0FE",color:"#1A3F8F" };
};
const DIV_LABEL = { gold_open:"Gold Open","45a":"45A",senior_b:"Senior B",senior_c:"Senior C" };
const DIV_COLOR = { gold_open:"#D4A017","45a":"#2196a8",senior_b:"#7B5EA7",senior_c:"#B05E3A" };
const TEAM_COLORS = ["#D4A017","#1E3A8A","#991B1B","#166534","#7B5EA7","#B05E3A"];
const TARGET_SIZE = 8;

// ─── Draft score ─────────────────────────────────────────────────────────────
function draftScore(p) {
  const base = [,,,,,,,,,5,4,3,7,6,9,10,11,13,14,15][TIER_ORDER.indexOf(p.skill_tier_reported||"")+4] || 5;
  return base + Math.min((p.years_experience||5), 60)/5;
}

// ─── Mock data ────────────────────────────────────────────────────────────────
const ALL_DIVISIONS = ["gold_open","45a","senior_b","senior_c"];
const MOCK_PLAYERS_BY_DIV = {
  gold_open:[
    { id:1,  first_name:"Chris",   last_name:"Fontaine",  position:"winger",     skill_tier_reported:"R1", age:48, payment_status:"paid",    sandbagging_flag:false, years_experience:10 },
    { id:2,  first_name:"Sarah",   last_name:"Mitchell",  position:"defenseman", skill_tier_reported:"B3", age:46, payment_status:"paid",    sandbagging_flag:false, years_experience:18 },
    { id:5,  first_name:"Paul",    last_name:"Nguyen",    position:"center",     skill_tier_reported:"R1", age:44, payment_status:"paid",    sandbagging_flag:false, years_experience:10 },
    { id:6,  first_name:"Mike",    last_name:"Hartley",   position:"winger",     skill_tier_reported:"A2", age:49, payment_status:"paid",    sandbagging_flag:true,  years_experience:22 },
    { id:10, first_name:"Karen",   last_name:"Osei",      position:"winger",     skill_tier_reported:"B2", age:46, payment_status:"paid",    sandbagging_flag:false, years_experience:17 },
    { id:14, first_name:"Derek",   last_name:"Paulson",   position:"defenseman", skill_tier_reported:"C1", age:50, payment_status:"paid",    sandbagging_flag:false, years_experience:8  },
    { id:15, first_name:"Carla",   last_name:"Vance",     position:"center",     skill_tier_reported:"R2", age:45, payment_status:"paid",    sandbagging_flag:false, years_experience:5  },
    { id:16, first_name:"James",   last_name:"Whitmore",  position:"winger",     skill_tier_reported:"B2", age:43, payment_status:"pending", sandbagging_flag:false, years_experience:17 },
    { id:8,  first_name:"Linda",   last_name:"Tran",      position:"goaltender", skill_tier_reported:"R2", age:53, payment_status:"paid",    sandbagging_flag:false, years_experience:15 },
    { id:7,  first_name:"Dave",    last_name:"Kowalski",  position:"defenseman", skill_tier_reported:"B1", age:47, payment_status:"paid",    sandbagging_flag:true,  years_experience:20 },
    { id:11, first_name:"Scott",   last_name:"Lemieux",   position:"defenseman", skill_tier_reported:"R3", age:50, payment_status:"paid",    sandbagging_flag:false, years_experience:9  },
    { id:13, first_name:"Brenda",  last_name:"Cho",       position:"center",     skill_tier_reported:"R1", age:44, payment_status:"paid",    sandbagging_flag:false, years_experience:10 },
    { id:4,  first_name:"Janet",   last_name:"Ruiz",      position:"goaltender", skill_tier_reported:"C1", age:51, payment_status:"pending", sandbagging_flag:false, years_experience:8  },
    { id:9,  first_name:"Ray",     last_name:"Dominguez", position:"center",     skill_tier_reported:"C2", age:55, payment_status:"pending", sandbagging_flag:false, years_experience:6  },
    { id:17, first_name:"Hector",  last_name:"Morales",   position:"winger",     skill_tier_reported:"R2", age:48, payment_status:"paid",    sandbagging_flag:false, years_experience:5  },
    { id:18, first_name:"Tanya",   last_name:"Singh",     position:"defenseman", skill_tier_reported:"B3", age:46, payment_status:"paid",    sandbagging_flag:false, years_experience:18 },
    { id:19, first_name:"Frank",   last_name:"Dolan",     position:"goaltender", skill_tier_reported:"R1", age:52, payment_status:"paid",    sandbagging_flag:false, years_experience:10 },
    { id:20, first_name:"Gail",    last_name:"Preston",   position:"winger",     skill_tier_reported:"C1", age:49, payment_status:"paid",    sandbagging_flag:false, years_experience:8  },
    { id:21, first_name:"Norm",    last_name:"Fitzgerald",position:"defenseman", skill_tier_reported:"R2", age:51, payment_status:"paid",    sandbagging_flag:false, years_experience:5  },
    { id:22, first_name:"Cleo",    last_name:"Barron",    position:"center",     skill_tier_reported:"B3", age:47, payment_status:"paid",    sandbagging_flag:false, years_experience:18 },
    { id:23, first_name:"Mitch",   last_name:"Carver",    position:"winger",     skill_tier_reported:"R1", age:44, payment_status:"paid",    sandbagging_flag:false, years_experience:10 },
    { id:24, first_name:"Donna",   last_name:"Walsh",     position:"defenseman", skill_tier_reported:"C2", age:48, payment_status:"paid",    sandbagging_flag:false, years_experience:6  },
  ],
  "45a":[
    { id:30, first_name:"Art",     last_name:"Becker",    position:"center",     skill_tier_reported:"C1", age:50, payment_status:"paid",    sandbagging_flag:false, years_experience:8  },
    { id:31, first_name:"Fiona",   last_name:"Hunt",      position:"winger",     skill_tier_reported:"R1", age:46, payment_status:"paid",    sandbagging_flag:false, years_experience:10 },
    { id:32, first_name:"Glen",    last_name:"Muir",      position:"goaltender", skill_tier_reported:"C2", age:52, payment_status:"paid",    sandbagging_flag:false, years_experience:6  },
  ],
  senior_b:[
    { id:40, first_name:"Bob",     last_name:"Crane",     position:"winger",     skill_tier_reported:"R2", age:56, payment_status:"paid",    sandbagging_flag:false, years_experience:5  },
    { id:41, first_name:"Cathy",   last_name:"Drew",      position:"defenseman", skill_tier_reported:"C1", age:54, payment_status:"paid",    sandbagging_flag:false, years_experience:8  },
  ],
  senior_c:[
    { id:50, first_name:"Hugh",    last_name:"Pine",      position:"center",     skill_tier_reported:"R3", age:58, payment_status:"paid",    sandbagging_flag:false, years_experience:3  },
  ],
};

function buildInitialState() {
  const teams = {
    gold_open:[
      { id:1,name:"Team Gold",colour:"#D4A017",division:"gold_open",draft_order:1,locked:false,players:[] },
      { id:2,name:"Team Blue",colour:"#1E3A8A",division:"gold_open",draft_order:2,locked:false,players:[] },
      { id:3,name:"Team Red", colour:"#991B1B",division:"gold_open",draft_order:3,locked:false,players:[] },
    ],
    "45a":[
      { id:4,name:"Team Teal",colour:"#2196a8",division:"45a",draft_order:1,locked:false,players:[] },
    ],
    senior_b:[
      { id:5,name:"Team Purple",colour:"#7B5EA7",division:"senior_b",draft_order:1,locked:false,players:[] },
    ],
    senior_c:[
      { id:6,name:"Team Ember",colour:"#B05E3A",division:"senior_c",draft_order:1,locked:false,players:[] },
    ],
  };
  const unassigned = {};
  ALL_DIVISIONS.forEach(d => { unassigned[d] = [...(MOCK_PLAYERS_BY_DIV[d]||[])]; });
  return { teams, unassigned };
}

// ─── WOW 1: Auto-balance ──────────────────────────────────────────────────────
function autoBalance(players, teamCount) {
  const sorted = [...players].sort((a,b) => draftScore(b)-draftScore(a));
  const buckets = Array.from({length:teamCount},()=>[]);
  sorted.forEach((p,i) => buckets[i % teamCount].push(p));
  return buckets;
}

// ─── WOW 5: Health score ─────────────────────────────────────────────────────
function teamHealth(team, allTeamsInDiv) {
  if(!team.players.length) return { score:0, issues:["No players assigned"] };
  const issues = [];
  const totals  = allTeamsInDiv.map(t=>t.players.reduce((s,p)=>s+draftScore(p),0));
  const myScore = team.players.reduce((s,p)=>s+draftScore(p),0);
  const avg     = totals.reduce((s,v)=>s+v,0)/Math.max(1,totals.length);
  const balPct  = avg>0 ? Math.max(0,100-Math.abs(myScore-avg)/avg*100) : 50;

  const hasGoalie   = team.players.some(p=>p.position==="goaltender");
  const posCounts   = {defenseman:0,center:0,winger:0,goaltender:0};
  team.players.forEach(p=>{ if(p.position) posCounts[p.position]++; });
  const unpaid      = team.players.filter(p=>p.payment_status!=="paid").length;
  const sandbag     = team.players.filter(p=>p.sandbagging_flag).length;
  const posComplete = posCounts.defenseman>=2&&posCounts.center>=1&&posCounts.winger>=2;

  if(!hasGoalie)    issues.push("No goalie assigned");
  if(!posComplete)  issues.push("Position gaps (need 2D/1C/2W min)");
  if(unpaid>0)      issues.push(`${unpaid} player${unpaid>1?"s":""} unpaid`);
  if(sandbag>0)     issues.push(`${sandbag} sandbagging flag${sandbag>1?"s":""} unresolved`);

  const score = Math.round(
    balPct*0.30 +
    (hasGoalie?100:0)*0.20 +
    (posComplete?100:40)*0.25 +
    ((1-unpaid/Math.max(1,team.players.length))*100)*0.15 +
    ((1-sandbag/Math.max(1,team.players.length))*100)*0.10
  );
  const color = score>=85?"#166534":score>=65?"#92400E":"#991B1B";
  return { score, issues, color, balPct };
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Pill({ bg,color,border,children,small }) {
  return <span style={{ display:"inline-block",background:bg,color,
    border:`1px solid ${border||bg}`,fontSize:small?9:11,
    fontFamily:"'DM Mono',monospace",fontWeight:500,
    padding:small?"1px 5px":"2px 8px",borderRadius:99,whiteSpace:"nowrap" }}>{children}</span>;
}

// WOW 2: Live Parity Radar ────────────────────────────────────────────────────
function RadarChart({ team, allTeams }) {
  const size = 96, cx = 48, cy = 48, r = 34;
  const axes = [
    { label:"Skill",  val: (() => { const s=team.players.reduce((a,p)=>a+draftScore(p),0); const avg=allTeams.map(t=>t.players.reduce((a,p)=>a+draftScore(p),0)).reduce((a,v)=>a+v,0)/Math.max(1,allTeams.length); return avg>0?Math.min(100,(s/avg)*80):50; })() },
    { label:"Defense",val: Math.min(100,team.players.filter(p=>p.position==="defenseman").length*40) },
    { label:"Offense",val: Math.min(100,(team.players.filter(p=>p.position==="winger"||p.position==="center").length)*25) },
    { label:"Goal",   val: team.players.some(p=>p.position==="goaltender")?80:0 },
    { label:"Exp",    val: Math.min(100,team.players.reduce((a,p)=>a+(p.years_experience||5),0)/Math.max(1,team.players.length)*6) },
  ];
  const toXY = (angle,val) => {
    const a = angle - Math.PI/2;
    const scale = (val/100)*r;
    return { x: cx+Math.cos(a)*scale, y: cy+Math.sin(a)*scale };
  };
  const pts = axes.map((ax,i) => toXY((i/axes.length)*Math.PI*2, ax.val));
  const polygon = pts.map(p=>`${p.x},${p.y}`).join(" ");
  const ideal   = axes.map((_,i) => toXY((i/axes.length)*Math.PI*2, 75));
  const idealPoly = ideal.map(p=>`${p.x},${p.y}`).join(" ");
  return (
    <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:4 }}>
      <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",
        textTransform:"uppercase",letterSpacing:".07em" }}>Team profile</div>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Grid rings */}
        {[25,50,75,100].map(v=>(
          <polygon key={v}
            points={axes.map((_,i)=>{const p=toXY((i/axes.length)*Math.PI*2,v);return `${p.x},${p.y}`;}).join(" ")}
            fill="none" stroke="#F0EEE8" strokeWidth="0.5"/>
        ))}
        {/* Ideal overlay */}
        <polygon points={idealPoly} fill="rgba(26,26,46,.04)" stroke="#E8E6DF" strokeWidth="1" strokeDasharray="2 2"/>
        {/* Data polygon */}
        <polygon points={polygon} fill={`${team.colour}22`} stroke={team.colour} strokeWidth="1.5"/>
        {/* Axis labels */}
        {axes.map((ax,i) => {
          const p = toXY((i/axes.length)*Math.PI*2, 115);
          return <text key={ax.label} x={p.x} y={p.y} textAnchor="middle"
            dominantBaseline="central" style={{ fontFamily:"'DM Mono',monospace",fontSize:6,fill:"#aaa" }}>{ax.label}</text>;
        })}
      </svg>
    </div>
  );
}

// WOW 5: Health gauge ─────────────────────────────────────────────────────────
function HealthGauge({ score, color, onClick }) {
  const r=14,cx=16,cy=16,circ=2*Math.PI*r;
  const dash=(score/100)*circ*0.75;
  return (
    <div onClick={onClick} style={{ cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2 }}>
      <svg width="32" height="32" viewBox="0 0 32 32">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F0EEE8" strokeWidth="3"
          strokeDasharray={`${circ*0.75} ${circ*0.25}`} strokeDashoffset={circ*0.375}
          strokeLinecap="round" transform="rotate(-225 16 16)"/>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={`${dash} ${circ-dash+circ*0.25}`} strokeDashoffset={circ*0.375}
          strokeLinecap="round" transform="rotate(-225 16 16)"
          style={{ transition:"stroke-dasharray 1s ease" }}/>
        <text x="16" y="17" textAnchor="middle" dominantBaseline="central"
          style={{ fontFamily:"'DM Mono',monospace",fontSize:7,fontWeight:700,fill:color }}>{score}</text>
      </svg>
      <span style={{ fontFamily:"'DM Mono',monospace",fontSize:7,color:"#aaa" }}>health</span>
    </div>
  );
}

// Draggable player card ────────────────────────────────────────────────────────
function PlayerCard({ player, teamColor, onRemove, onMakeCaptain, compact }) {
  const [hover,setHover]=useState(false);
  const tier = player.skill_tier_assigned||player.skill_tier_reported;
  const tc   = TIER_COLOR(tier);
  const pc   = player.position ? POSITION_COLOR[player.position] : null;
  const init = `${player.first_name[0]}${player.last_name[0]}`;
  return (
    <div draggable
      onDragStart={e=>e.dataTransfer.setData("playerId",String(player.id))}
      onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
      style={{ display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"7px 9px",border:`1px solid ${player.sandbagging_flag?"#FDE68A":hover?"#D0CEC6":"#E8E6DF"}`,
        borderRadius:8,background:hover?"#FAFAF8":"#fff",cursor:"grab",
        borderTop:player.sandbagging_flag?"2px solid #EF4444":undefined,
        position:"relative",userSelect:"none",transition:"all .1s" }}>
      <div style={{ display:"flex",alignItems:"center",gap:7,flex:1,minWidth:0 }}>
        <div style={{ width:26,height:26,borderRadius:"50%",flexShrink:0,
          background:teamColor||"#1a1a2e",color:"#D4A017",
          display:"flex",alignItems:"center",justifyContent:"center",
          fontFamily:"'DM Mono',monospace",fontSize:9,fontWeight:500,
          boxShadow:player.is_captain?`0 0 0 2px #fff,0 0 0 3px ${teamColor||"#D4A017"}`:"none" }}>
          {init}
        </div>
        <div style={{ minWidth:0 }}>
          <div style={{ fontFamily:"'Fraunces',serif",fontSize:12,fontWeight:600,
            color:"#1a1a2e",whiteSpace:"nowrap",overflow:"hidden",
            textOverflow:"ellipsis",display:"flex",alignItems:"center",gap:4 }}>
            {player.first_name} {player.last_name}
            {player.is_captain&&<span style={{ fontFamily:"'DM Mono',monospace",fontSize:8,
              fontWeight:700,border:`1px solid ${teamColor||"#D4A017"}`,
              color:teamColor||"#D4A017",padding:"0 3px",borderRadius:2 }}>C</span>}
            {player.sandbagging_flag&&<span style={{ fontSize:9,color:"#EF4444" }}>⚠</span>}
          </div>
          <div style={{ display:"flex",gap:3,alignItems:"center",marginTop:2,flexWrap:"wrap" }}>
            {pc&&<span style={{ fontFamily:"'DM Mono',monospace",fontSize:8,fontWeight:500,
              background:pc.bg,color:pc.color,padding:"1px 4px",borderRadius:99 }}>
              {POSITION_LABEL[player.position]}</span>}
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:8,fontWeight:500,
              background:tc.bg,color:tc.color,padding:"1px 4px",borderRadius:99 }}>{tier||"?"}</span>
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#bbb" }}>
              {player.age}
            </span>
            {player.payment_status==="pending"&&
              <span style={{ fontFamily:"'DM Mono',monospace",fontSize:8,
                background:"#FEF3C7",color:"#92400E",padding:"1px 4px",borderRadius:99 }}>$</span>}
          </div>
        </div>
      </div>
      {(onRemove||onMakeCaptain)&&hover&&(
        <div style={{ display:"flex",gap:3,flexShrink:0,marginLeft:4 }}>
          {onMakeCaptain&&!player.is_captain&&(
            <button onClick={e=>{e.stopPropagation();onMakeCaptain(player.id)}}
              style={actBtn} title="Make captain">C</button>
          )}
          {onRemove&&(
            <button onClick={e=>{e.stopPropagation();onRemove(player.id)}}
              style={{...actBtn,color:"#DC2626"}} title="Return to pool">✕</button>
          )}
        </div>
      )}
    </div>
  );
}

// Team column ─────────────────────────────────────────────────────────────────
function TeamColumn({ team, allTeams, onDrop, onRemovePlayer, onMakeCaptain, onNameChange, onLock, targetSize, showRadar, showHealth }) {
  const [dragOver, setDragOver] = useState(false);
  const [editName, setEditName] = useState(false);
  const [nameVal,  setNameVal]  = useState(team.name);
  const [showHealthPanel, setShowHealthPanel] = useState(false);

  const pos = useMemo(()=>{ const c={defenseman:0,center:0,winger:0,goaltender:0}; team.players.forEach(p=>{if(p.position)c[p.position]++;}); return c; },[team.players]);
  const hasGoalie  = pos.goaltender>=1;
  const missingDef = pos.defenseman<2;
  const scoreTotal = useMemo(()=>team.players.reduce((s,p)=>s+draftScore(p),0).toFixed(1),[team.players]);
  const avgScore   = useMemo(()=>allTeams.map(t=>t.players.reduce((s,p)=>s+draftScore(p),0)).reduce((a,v)=>a+v,0)/Math.max(1,allTeams.length),[allTeams]);
  const parityColor= scoreTotal>=avgScore*0.9&&scoreTotal<=avgScore*1.1?"#166634":scoreTotal>=avgScore*0.8?"#92400E":"#991B1B";
  const health     = useMemo(()=>teamHealth(team,allTeams),[team,allTeams]);
  const tierGroups = useMemo(()=>{const g={A:0,B:0,C:0,R:0};team.players.forEach(p=>{const f=(p.skill_tier_reported||"R")[0];if(g[f]!==undefined)g[f]++;});return g;},[team.players]);

  return (
    <div style={{ background:"#fff",border:`1px solid ${dragOver?team.colour:"#E8E6DF"}`,
      borderRadius:12,overflow:"hidden",transition:"border-color .15s",
      opacity:team.locked?0.85:1,flexShrink:0,width:240 }}>

      {/* Colour accent + lock indicator */}
      <div style={{ height:4,background:team.locked?"#aaa":team.colour }} />

      {/* Team header */}
      <div style={{ padding:"12px 14px 10px",borderBottom:"1px solid #F0EEE8" }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8 }}>
          {/* #14 editable team name */}
          {editName ? (
            <input value={nameVal} autoFocus
              onChange={e=>setNameVal(e.target.value)}
              onBlur={()=>{onNameChange(team.id,nameVal);setEditName(false);}}
              onKeyDown={e=>{if(e.key==="Enter"){onNameChange(team.id,nameVal);setEditName(false);}}}
              style={{ fontFamily:"'Fraunces',serif",fontSize:14,fontWeight:700,color:"#1a1a2e",
                border:"none",borderBottom:"2px solid #1a1a2e",outline:"none",
                background:"transparent",width:"100%" }} />
          ) : (
            <div style={{ display:"flex",alignItems:"center",gap:6,cursor:"text",flex:1 }}
              onDoubleClick={()=>!team.locked&&setEditName(true)}>
              <div style={{ width:10,height:10,borderRadius:"50%",background:team.colour,flexShrink:0 }}/>
              <span style={{ fontFamily:"'Fraunces',serif",fontSize:14,fontWeight:700,color:"#1a1a2e" }}>
                {team.name}
              </span>
              {!team.locked&&<span style={{ fontFamily:"'DM Mono',monospace",fontSize:8,color:"#ccc" }}>✎</span>}
            </div>
          )}
          <div style={{ display:"flex",alignItems:"center",gap:5 }}>
            {/* WOW 5 health gauge */}
            {showHealth && <HealthGauge score={health.score} color={health.color} onClick={()=>setShowHealthPanel(h=>!h)} />}
            {/* #18 lock button */}
            <button onClick={()=>onLock(team.id)}
              style={{ fontFamily:"'DM Mono',monospace",fontSize:9,
                background:team.locked?"#FEF3C7":"#F6F5F0",
                color:team.locked?"#92400E":"#aaa",
                border:`1px solid ${team.locked?"#FDE68A":"#E8E6DF"}`,
                padding:"2px 8px",borderRadius:4,cursor:"pointer" }}>
              {team.locked?"🔒 Locked":"Lock"}
            </button>
          </div>
        </div>

        {/* Player count + score — #8 #11 */}
        <div style={{ display:"flex",justifyContent:"space-between",marginBottom:8 }}>
          <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,
            color:team.players.length>targetSize?"#92400E":team.players.length===targetSize?"#166534":"#aaa" }}>
            {team.players.length}/{targetSize} players
          </span>
          <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#888" }}>
            Score: <strong style={{ color:parityColor }}>{scoreTotal}</strong>
          </span>
        </div>

        {/* WOW 5 health issues */}
        {showHealthPanel && health.issues.length > 0 && (
          <div style={{ background:"#FEF2F2",border:"1px solid #FCA5A5",borderRadius:6,
            padding:"6px 10px",marginBottom:8 }}>
            {health.issues.map((iss,i)=>(
              <div key={i} style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#991B1B" }}>
                ✗ {iss}
              </div>
            ))}
          </div>
        )}

        {/* Position breakdown — #28 #10 */}
        <div style={{ display:"flex",gap:4,marginBottom:6 }}>
          {[{k:"goaltender",l:"G",min:1},{k:"defenseman",l:"D",min:2},{k:"center",l:"C",min:1},{k:"winger",l:"W",min:2}].map(({k,l,min})=>{
            const count=pos[k],ok=count>=min;
            return (
              <div key={k} style={{ display:"flex",flexDirection:"column",alignItems:"center",
                background:ok?"#E6F4EA":"#FEE2E2",borderRadius:4,padding:"3px 6px" }}>
                <span style={{ fontFamily:"'DM Mono',monospace",fontSize:8,fontWeight:700,
                  color:ok?"#166534":"#991B1B" }}>{l}</span>
                <span style={{ fontFamily:"'DM Mono',monospace",fontSize:9,fontWeight:600,
                  color:ok?"#166534":"#991B1B" }}>{count}</span>
              </div>
            );
          })}
        </div>

        {/* WOW 3: Tier distribution bar — #9 */}
        <div style={{ marginBottom:6 }}>
          <div style={{ height:5,display:"flex",gap:1,borderRadius:99,overflow:"hidden" }}>
            {[{k:"A",c:"#FCE8E8",sc:"#7A1818"},{k:"B",c:"#FEF0E8",sc:"#7A4518"},{k:"C",c:"#FEF9E7",sc:"#7A5A18"},{k:"R",c:"#E8F0FE",sc:"#1A3F8F"}].filter(t=>tierGroups[t.k]>0).map(t=>(
              <div key={t.k} style={{ flex:tierGroups[t.k],background:t.c }} title={`${t.k} tier: ${tierGroups[t.k]}`}/>
            ))}
            {team.players.length===0&&<div style={{ flex:1,background:"#F0EEE8" }}/>}
          </div>
          <div style={{ display:"flex",gap:6,marginTop:2 }}>
            {Object.entries(tierGroups).filter(([,v])=>v>0).map(([k,v])=>(
              <span key={k} style={{ fontFamily:"'DM Mono',monospace",fontSize:7,
                color:k==="A"?"#7A1818":k==="B"?"#7A4518":k==="C"?"#7A5A18":"#1A3F8F" }}>
                {k}:{v}
              </span>
            ))}
          </div>
        </div>

        {/* WOW 2: Radar */}
        {showRadar && team.players.length > 0 && <RadarChart team={team} allTeams={allTeams} />}

        {/* Warnings */}
        {!hasGoalie&&<div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#991B1B",
          background:"#FEF2F2",border:"1px solid #FCA5A5",borderRadius:4,
          padding:"3px 8px",marginTop:4 }}>⚠ No goalie assigned</div>}
        {missingDef&&<div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#92400E",
          background:"#FEF3C7",border:"1px solid #FDE68A",borderRadius:4,
          padding:"3px 8px",marginTop:4 }}>⚠ Needs 2+ defensemen</div>}
      </div>

      {/* Drop zone */}
      <div onDragOver={e=>{e.preventDefault();if(!team.locked)setDragOver(true);}}
        onDragLeave={()=>setDragOver(false)}
        onDrop={e=>{e.preventDefault();setDragOver(false);if(team.locked)return;const id=parseInt(e.dataTransfer.getData("playerId"));onDrop(id,team.id);}}
        style={{ minHeight:100,padding:"8px",display:"flex",flexDirection:"column",gap:5,
          background:dragOver?"#F0F4FF":team.locked?"#F9F8F4":"#FAFAF8",
          borderTop:`2px dashed ${dragOver?team.colour:"transparent"}`,
          transition:"all .15s" }}>
        {team.players.length===0&&(
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#ccc",
            textAlign:"center",padding:"20px 0" }}>
            {team.locked?"Team locked":"Drop players here"}
          </div>
        )}
        {team.players.map(p=>(
          <PlayerCard key={p.id} player={p} teamColor={team.colour}
            onRemove={team.locked?null:(pid)=>onRemovePlayer(pid,team.id)}
            onMakeCaptain={team.locked?null:(pid)=>onMakeCaptain(pid,team.id)} />
        ))}
      </div>
    </div>
  );
}

// ─── WOW 4: Roster freeze workflow ───────────────────────────────────────────
function RosterStatusBar({ teams, onNotify, notified }) {
  const allLocked = teams.length>0&&teams.every(t=>t.locked);
  const stages = ["Draft","Committee Review","Locked","Published"];
  const stage  = notified?3:allLocked?2:teams.some(t=>t.locked)?1:0;
  return (
    <div style={{ background:"#1a1a2e",borderRadius:10,padding:"12px 18px",
      marginBottom:16,display:"flex",alignItems:"center",gap:16,flexWrap:"wrap" }}>
      <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#D4A017",
        textTransform:"uppercase",letterSpacing:".08em" }}>Roster Status</span>
      <div style={{ display:"flex",alignItems:"center",flex:1,minWidth:200 }}>
        {stages.map((s,i)=>(
          <div key={s} style={{ display:"flex",alignItems:"center",flex:i<stages.length-1?1:"none" }}>
            <div style={{ display:"flex",flexDirection:"column",alignItems:"center" }}>
              <div style={{ width:18,height:18,borderRadius:"50%",
                background:i<=stage?"#D4A017":"rgba(255,255,255,.1)",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontFamily:"'DM Mono',monospace",fontSize:8,fontWeight:700,
                color:i<=stage?"#1a1a2e":"rgba(255,255,255,.3)" }}>
                {i<stage?"✓":i+1}
              </div>
              <span style={{ fontFamily:"'DM Mono',monospace",fontSize:7,
                color:i===stage?"#D4A017":"rgba(255,255,255,.3)",
                marginTop:3,whiteSpace:"nowrap" }}>{s}</span>
            </div>
            {i<stages.length-1&&<div style={{ flex:1,height:1,background:i<stage?"#D4A017":"rgba(255,255,255,.1)",margin:"0 4px",marginBottom:14 }}/>}
          </div>
        ))}
      </div>
      {stage===2&&!notified&&(
        <button onClick={onNotify}
          style={{ fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,
            background:"#D4A017",color:"#1a1a2e",border:"none",
            padding:"6px 14px",borderRadius:6,cursor:"pointer" }}>
          📧 Notify players
        </button>
      )}
      {notified&&(
        <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#22c55e" }}>
          ✓ Players notified
        </span>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Rosters() {
  const init = buildInitialState();
  const [teams,      setTeams]      = useState(init.teams);
  const [unassigned, setUnassigned] = useState(init.unassigned);
  const [division,   setDivision]   = useState("gold_open");
  const [filterPos,  setFilterPos]  = useState("");
  const [search,     setSearch]     = useState("");
  const [showRadar,  setShowRadar]  = useState(false);
  const [showHealth, setShowHealth] = useState(true);
  const [showCompare,setShowCompare]= useState(false);
  const [notified,   setNotified]   = useState(false);
  const [undoStack,  setUndoStack]  = useState([]);
  const [showUndo,   setShowUndo]   = useState(false);
  const [toast,      setToast]      = useState(null);
  const [showValidate,setShowValidate]=useState(false);
  const [showPrint,  setShowPrint]  = useState(false);
  const [showAddTeam,setShowAddTeam]=useState(false);
  const [newTeamName,setNewTeamName]=useState("");
  const [newTeamColor,setNewTeamColor]=useState("#D4A017");
  const undoTimer = useRef(null);

  const divTeams    = teams[division]||[];
  const divPool     = unassigned[division]||[];
  const allLocked   = divTeams.length>0&&divTeams.every(t=>t.locked);

  const showToast = (msg) => { setToast(msg); setTimeout(()=>setToast(null),3000); };

  // #13 undo helper
  const snapshot = () => ({ teams:JSON.parse(JSON.stringify(teams)), unassigned:JSON.parse(JSON.stringify(unassigned)) });
  const pushUndo = (state) => {
    setUndoStack(s=>[state,...s].slice(0,10));
    setShowUndo(true);
    clearTimeout(undoTimer.current);
    undoTimer.current=setTimeout(()=>setShowUndo(false),10000);
  };
  const handleUndo = () => {
    if(!undoStack.length) return;
    const [prev,...rest]=undoStack;
    setTeams(prev.teams); setUnassigned(prev.unassigned);
    setUndoStack(rest); setShowUndo(false);
    showToast("↩ Undo applied");
  };

  // Drop handler
  const handleDrop = (playerId, teamId) => {
    const state = snapshot();
    const fromPool = divPool.find(p=>p.id===playerId);
    const fromTeam = divTeams.find(t=>t.players.find(p=>p.id===playerId));
    if(!fromPool&&!fromTeam) return;
    pushUndo(state);
    if(fromPool) {
      setUnassigned(u=>({...u,[division]:u[division].filter(p=>p.id!==playerId)}));
      setTeams(ts=>({...ts,[division]:ts[division].map(t=>t.id===teamId?{...t,players:[...t.players,{...fromPool,is_captain:false}]}:t)}));
    } else if(fromTeam&&fromTeam.id!==teamId) {
      const player=fromTeam.players.find(p=>p.id===playerId);
      setTeams(ts=>({...ts,[division]:ts[division].map(t=>{
        if(t.id===fromTeam.id) return{...t,players:t.players.filter(p=>p.id!==playerId)};
        if(t.id===teamId)      return{...t,players:[...t.players,{...player,is_captain:false}]};
        return t;
      })}));
    }
  };

  const handleRemove = (playerId, teamId) => {
    const state=snapshot();
    const team=divTeams.find(t=>t.id===teamId);
    const player=team?.players.find(p=>p.id===playerId);
    if(!player) return;
    pushUndo(state);
    setTeams(ts=>({...ts,[division]:ts[division].map(t=>t.id===teamId?{...t,players:t.players.filter(p=>p.id!==playerId)}:t)}));
    setUnassigned(u=>({...u,[division]:[...u[division],{...player,is_captain:false}]}));
  };

  const handleMakeCaptain = (pid,tid) => {
    setTeams(ts=>({...ts,[division]:ts[division].map(t=>t.id===tid?{...t,players:t.players.map(p=>({...p,is_captain:p.id===pid}))}:t)}));
  };

  const handleNameChange = (tid,name) => {
    setTeams(ts=>({...ts,[division]:ts[division].map(t=>t.id===tid?{...t,name}:t)}));
  };

  const handleLock = (tid) => {
    setTeams(ts=>({...ts,[division]:ts[division].map(t=>t.id===tid?{...t,locked:!t.locked}:t)}));
  };

  // WOW 1: Auto-balance
  const handleAutoBalance = () => {
    const allPlayers=[...divPool,...divTeams.flatMap(t=>t.players)];
    const buckets=autoBalance(allPlayers,divTeams.length);
    setUnassigned(u=>({...u,[division]:[]}));
    setTeams(ts=>({...ts,[division]:ts[division].map((t,i)=>({...t,players:(buckets[i]||[]).map(p=>({...p,is_captain:false}))}))}));
    showToast("⚖ Teams auto-balanced by draft score");
  };

  // Add team
  const handleAddTeam = () => {
    const newId = Date.now();
    setTeams(ts=>({...ts,[division]:[...ts[division],{id:newId,name:newTeamName||`Team ${ts[division].length+1}`,colour:newTeamColor,division,draft_order:ts[division].length+1,locked:false,players:[]}]}));
    setShowAddTeam(false); setNewTeamName(""); showToast("Team created");
  };

  // Pre-save validation
  const validationIssues = useMemo(()=>{
    const issues=[];
    if(divPool.length>0) issues.push(`${divPool.length} players still unassigned`);
    divTeams.forEach(t=>{
      if(!t.players.some(p=>p.position==="goaltender")) issues.push(`${t.name}: no goalie`);
      if(t.players.length<4) issues.push(`${t.name}: too few players (${t.players.length})`);
    });
    return issues;
  },[divTeams,divPool]);

  // Export CSV — #22
  const exportCSV = () => {
    const rows=[["Team","Name","Email","Tier","Position","Age","Payment"]];
    divTeams.forEach(t=>t.players.forEach(p=>rows.push([t.name,`${p.first_name} ${p.last_name}`,"",p.skill_tier_reported,POSITION_LABEL[p.position]||"",p.age,p.payment_status])));
    const csv=rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=`grsh-rosters-${division}.csv`;a.click();URL.revokeObjectURL(url);
  };

  // Keyboard undo
  useEffect(()=>{
    const h=(e)=>{if((e.ctrlKey||e.metaKey)&&e.key==="z"&&undoStack.length){e.preventDefault();handleUndo();}};
    window.addEventListener("keydown",h);
    return()=>window.removeEventListener("keydown",h);
  },[undoStack]);

  // Division overview stats
  const divStats = useMemo(()=>ALL_DIVISIONS.map(d=>{
    const ts=teams[d]||[]; const pool=unassigned[d]||[];
    const total=ts.reduce((s,t)=>s+t.players.length,0)+pool.length;
    const assigned=ts.reduce((s,t)=>s+t.players.length,0);
    return { div:d, assigned, total, pct:total>0?Math.round(assigned/total*100):0 };
  }),[teams,unassigned]);

  const filteredPool = useMemo(()=>divPool.filter(p=>
    (!filterPos||p.position===filterPos) &&
    (!search||`${p.first_name} ${p.last_name}`.toLowerCase().includes(search.toLowerCase()))
  ),[divPool,filterPos,search]);

  const totalAssigned = divTeams.reduce((s,t)=>s+t.players.length,0);
  const totalInDiv    = totalAssigned+divPool.length;
  const pct           = totalInDiv>0?Math.round(totalAssigned/totalInDiv*100):0;

  return (
    <div style={{ fontFamily:"'Fraunces',Georgia,serif",background:"#F6F5F0",
      minHeight:"100vh",padding:"20px 24px 60px" }}>
      <style>{`
        *{box-sizing:border-box}
        @keyframes slideUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}
        @media(max-width:768px){.roster-board{flex-direction:column!important} .roster-header{flex-direction:column!important}}
      `}</style>

      {/* Header */}
      <div className="roster-header" style={{ display:"flex",justifyContent:"space-between",
        alignItems:"flex-start",marginBottom:14,flexWrap:"wrap",gap:10 }}>
        <div>
          <div style={{ display:"inline-block",fontFamily:"'DM Mono',monospace",fontSize:10,
            fontWeight:500,letterSpacing:".1em",textTransform:"uppercase",
            background:"#1a1a2e",color:"#D4A017",padding:"3px 12px",
            borderRadius:99,marginBottom:6 }}>Season 2027</div>
          <h1 style={{ fontFamily:"'Fraunces',serif",fontSize:26,fontWeight:700,
            color:"#1a1a2e",margin:"0 0 3px",letterSpacing:"-.5px" }}>Rosters</h1>
          {/* #24 subtitle rewritten */}
          <p style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#aaa",margin:0 }}>
            Build teams for {DIV_LABEL[division]} · Season 2027
          </p>
        </div>
        <div style={{ display:"flex",gap:8,alignItems:"center",flexWrap:"wrap" }}>
          {/* WOW 1 */}
          <button onClick={handleAutoBalance} style={{ fontFamily:"'DM Mono',monospace",
            fontSize:11,fontWeight:500,background:"#EEF2FF",
            border:"1px solid #C7D2FE",color:"#1a1a2e",
            padding:"7px 14px",borderRadius:8,cursor:"pointer" }}>
            ⚖ Auto-balance
          </button>
          {/* Compare toggle — #23 */}
          <button onClick={()=>setShowCompare(c=>!c)} style={{ fontFamily:"'DM Mono',monospace",
            fontSize:11,background:showCompare?"#1a1a2e":"#fff",
            color:showCompare?"#D4A017":"#666",
            border:`1px solid ${showCompare?"#1a1a2e":"#E8E6DF"}`,
            padding:"7px 14px",borderRadius:8,cursor:"pointer" }}>
            ⇔ Compare
          </button>
          {/* Radar toggle — WOW 2 */}
          <button onClick={()=>setShowRadar(r=>!r)} style={{ fontFamily:"'DM Mono',monospace",
            fontSize:11,background:showRadar?"#1a1a2e":"#fff",
            color:showRadar?"#D4A017":"#666",
            border:`1px solid ${showRadar?"#1a1a2e":"#E8E6DF"}`,
            padding:"7px 14px",borderRadius:8,cursor:"pointer" }}>
            🕸 Radar
          </button>
          {/* Print preview — #15 */}
          <button onClick={()=>setShowPrint(true)} style={{ fontFamily:"'DM Mono',monospace",
            fontSize:11,background:"#fff",border:"1px solid #E8E6DF",color:"#666",
            padding:"7px 14px",borderRadius:8,cursor:"pointer" }}>⎙ Print</button>
          {/* Export — #22 */}
          <button onClick={exportCSV} style={{ fontFamily:"'DM Mono',monospace",
            fontSize:11,background:"#fff",border:"1px solid #E8E6DF",color:"#666",
            padding:"7px 14px",borderRadius:8,cursor:"pointer" }}>↓ Export</button>
          {/* Save with validation — #27 */}
          <button onClick={()=>validationIssues.length?setShowValidate(true):showToast("✓ Rosters saved")}
            style={{ fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:500,
              background:"#1a1a2e",color:"#D4A017",border:"none",
              padding:"8px 18px",borderRadius:8,cursor:"pointer" }}>
            {validationIssues.length>0?`Save (${validationIssues.length} issues)`:"Save rosters ✓"}
          </button>
        </div>
      </div>

      {/* WOW 4: Status bar */}
      <RosterStatusBar teams={divTeams} onNotify={()=>{setNotified(true);showToast(`📧 Notified ${totalAssigned} players`);}} notified={notified} />

      {/* #3 Division tabs with completion — #19 overview */}
      <div style={{ display:"flex",gap:6,marginBottom:14,flexWrap:"wrap" }}>
        {divStats.map(ds=>(
          <button key={ds.div} onClick={()=>setDivision(ds.div)} style={{
            fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,
            padding:"7px 14px",borderRadius:8,cursor:"pointer",transition:"all .15s",
            background:division===ds.div?"#1a1a2e":"#fff",
            color:division===ds.div?"#D4A017":"#666",
            border:`1px solid ${division===ds.div?"#1a1a2e":"#E8E6DF"}`,
            display:"flex",alignItems:"center",gap:8 }}>
            <span>{DIV_LABEL[ds.div]}</span>
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:9,
              background:ds.pct===100?"#E6F4EA":division===ds.div?"rgba(212,160,23,.2)":"#F6F5F0",
              color:ds.pct===100?"#166534":division===ds.div?"#D4A017":"#aaa",
              padding:"1px 6px",borderRadius:99 }}>
              {ds.pct}%
            </span>
          </button>
        ))}
        {/* Add team */}
        <button onClick={()=>setShowAddTeam(true)} style={{ fontFamily:"'DM Mono',monospace",
          fontSize:11,background:"#F6F5F0",border:"1px dashed #D0CEC6",color:"#aaa",
          padding:"7px 14px",borderRadius:8,cursor:"pointer" }}>+ Add team</button>
      </div>

      {/* #4 Progress bar with context */}
      <div style={{ background:"#fff",border:"1px solid #E8E6DF",borderRadius:10,
        padding:"14px 18px",marginBottom:16 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 }}>
          <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#555",
            textTransform:"uppercase",letterSpacing:".08em" }}>
            {DIV_LABEL[division]} roster assignment
          </span>
          <div style={{ display:"flex",alignItems:"center",gap:12 }}>
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#888" }}>
              {totalAssigned} of {totalInDiv} players assigned · {divPool.length} remaining
            </span>
            <span style={{ fontFamily:"'Fraunces',serif",fontSize:18,fontWeight:700,
              color:pct===100?"#166534":"#1a1a2e" }}>{pct}%</span>
          </div>
        </div>
        <div style={{ height:7,background:"#E8E6DF",borderRadius:99,overflow:"hidden" }}>
          <div style={{ height:"100%",background:pct===100?"#22c55e":"#1a1a2e",
            borderRadius:99,width:`${pct}%`,transition:"width .6s ease" }}/>
        </div>
        {/* #26 empty pool celebration */}
        {pct===100&&divPool.length===0&&(
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#166534",
            marginTop:6,fontWeight:500 }}>
            ✅ All {totalAssigned} players assigned — {DIV_LABEL[division]} is ready!
          </div>
        )}
      </div>

      {/* WOW 3 compare table — #23 */}
      {showCompare && divTeams.length > 1 && (
        <div style={{ background:"#fff",border:"1px solid #E8E6DF",borderRadius:12,
          overflow:"hidden",marginBottom:16 }}>
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",
            textTransform:"uppercase",letterSpacing:".08em",
            padding:"12px 16px",borderBottom:"1px solid #F0EEE8" }}>
            Team comparison
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%",borderCollapse:"collapse" }}>
              <thead>
                <tr>
                  <th style={cmpTh}>Metric</th>
                  {divTeams.map(t=>(
                    <th key={t.id} style={{ ...cmpTh,color:t.colour }}>{t.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label:"Players",    fn:t=>t.players.length },
                  { label:"Score total",fn:t=>t.players.reduce((s,p)=>s+draftScore(p),0).toFixed(1) },
                  { label:"Goalie",     fn:t=>t.players.some(p=>p.position==="goaltender")?"✓":"✗" },
                  { label:"Defense",    fn:t=>t.players.filter(p=>p.position==="defenseman").length },
                  { label:"Unpaid",     fn:t=>t.players.filter(p=>p.payment_status!=="paid").length },
                  { label:"⚠ Flags",   fn:t=>t.players.filter(p=>p.sandbagging_flag).length },
                  { label:"Health",     fn:t=>teamHealth(t,divTeams).score },
                ].map(row=>(
                  <tr key={row.label} style={{ borderBottom:"1px solid #F3F2ED" }}>
                    <td style={cmpTd}>{row.label}</td>
                    {divTeams.map(t=>(
                      <td key={t.id} style={{ ...cmpTd,textAlign:"center",fontWeight:600,
                        color:row.label==="Goalie"?(row.fn(t)==="✓"?"#166534":"#991B1B"):"#1a1a2e" }}>
                        {row.fn(t)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Board layout */}
      <div className="roster-board" style={{ display:"flex",gap:12,alignItems:"flex-start" }}>

        {/* Teams area — scrollable horizontally */}
        <div style={{ flex:1,display:"flex",gap:12,overflowX:"auto",alignItems:"flex-start",minWidth:0,paddingBottom:8 }}>
          {divTeams.length===0 ? (
            <div style={{ background:"#fff",border:"2px dashed #D0CEC6",borderRadius:12,
              padding:"48px 24px",textAlign:"center",minWidth:240 }}>
              <div style={{ fontSize:32,marginBottom:10 }}>🏒</div>
              <p style={{ fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,
                color:"#1a1a2e",margin:"0 0 6px" }}>No teams yet</p>
              <p style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#aaa",margin:"0 0 16px" }}>
                Create your first team for {DIV_LABEL[division]}
              </p>
              <button onClick={()=>setShowAddTeam(true)} style={{ fontFamily:"'DM Mono',monospace",
                fontSize:12,background:"#1a1a2e",color:"#D4A017",border:"none",
                padding:"8px 20px",borderRadius:8,cursor:"pointer" }}>+ Create team</button>
            </div>
          ) : divTeams.map(team=>(
            <TeamColumn key={team.id} team={team} allTeams={divTeams}
              onDrop={handleDrop}
              onRemovePlayer={handleRemove}
              onMakeCaptain={handleMakeCaptain}
              onNameChange={handleNameChange}
              onLock={handleLock}
              targetSize={TARGET_SIZE}
              showRadar={showRadar}
              showHealth={showHealth} />
          ))}
        </div>

        {/* Pool panel */}
        <div style={{ width:220,flexShrink:0,background:"#fff",
          border:"1px solid #E8E6DF",borderRadius:12,overflow:"hidden" }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",
            padding:"12px 14px 10px",borderBottom:"1px solid #F0EEE8" }}>
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,
              textTransform:"uppercase",letterSpacing:".07em",color:"#555" }}>
              Pool
            </span>
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,
              background:"#F6F5F0",color:"#888",padding:"2px 9px",
              borderRadius:99,border:"1px solid #E8E6DF" }}>{divPool.length}</span>
          </div>

          {/* #6 Search in pool */}
          <div style={{ padding:"8px 10px",borderBottom:"1px solid #F0EEE8" }}>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Find a player…"
              style={{ fontFamily:"'DM Mono',monospace",fontSize:11,width:"100%",
                background:"#F6F5F0",border:"1px solid #E8E6DF",borderRadius:6,
                padding:"5px 8px",color:"#333",outline:"none" }} />
          </div>

          {/* #5 position filters — wrapped, no overflow */}
          <div style={{ display:"flex",gap:3,flexWrap:"wrap",padding:"8px 10px",
            borderBottom:"1px solid #F0EEE8" }}>
            {["","goaltender","defenseman","center","winger"].map(pos=>(
              <button key={pos} onClick={()=>setFilterPos(pos)} style={{
                fontFamily:"'DM Mono',monospace",fontSize:9,fontWeight:500,
                padding:"3px 7px",borderRadius:4,cursor:"pointer",
                background:filterPos===pos?"#1a1a2e":"#F6F5F0",
                color:filterPos===pos?"#D4A017":"#888",
                border:`1px solid ${filterPos===pos?"#1a1a2e":"#E8E6DF"}` }}>
                {pos?POSITION_LABEL[pos].slice(0,5):"All"}
              </button>
            ))}
          </div>

          {/* #20 bulk assign */}
          {filteredPool.length > 0 && divTeams.length > 0 && (
            <div style={{ padding:"6px 10px",borderBottom:"1px solid #F0EEE8",
              display:"flex",gap:5,alignItems:"center" }}>
              <select defaultValue="" onChange={e=>{
                if(!e.target.value) return;
                const tid=parseInt(e.target.value);
                filteredPool.forEach(p=>handleDrop(p.id,tid));
                e.target.value="";
              }} style={{ fontFamily:"'DM Mono',monospace",fontSize:9,flex:1,
                background:"#F6F5F0",border:"1px solid #E8E6DF",borderRadius:4,
                padding:"3px 5px",color:"#555",outline:"none" }}>
                <option value="">Bulk assign to…</option>
                {divTeams.filter(t=>!t.locked).map(t=>
                  <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}

          {/* Pool list */}
          <div onDragOver={e=>e.preventDefault()}
            onDrop={e=>{e.preventDefault();const pid=parseInt(e.dataTransfer.getData("playerId"));const ft=divTeams.find(t=>t.players.find(p=>p.id===pid));if(ft)handleRemove(pid,ft.id);}}
            style={{ padding:"8px",display:"flex",flexDirection:"column",gap:5,
              minHeight:160,maxHeight:480,overflowY:"auto" }}>
            {filteredPool.length===0 ? (
              <div style={{ display:"flex",flexDirection:"column",alignItems:"center",
                justifyContent:"center",height:120,
                background:divPool.length===0?"#F0FDF4":"transparent",
                borderRadius:8,transition:"background .3s" }}>
                {divPool.length===0 ? (
                  <>
                    <div style={{ fontSize:22,marginBottom:4 }}>✅</div>
                    <p style={{ fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:700,
                      color:"#166534",margin:"0 0 2px" }}>All assigned!</p>
                    <p style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",margin:0 }}>
                      Pool is empty
                    </p>
                  </>
                ) : (
                  <p style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#ccc",textAlign:"center" }}>
                    No players match filters
                  </p>
                )}
              </div>
            ) : filteredPool.map(p=>(
              <PlayerCard key={p.id} player={p} />
            ))}
          </div>

          {/* Parity comparison — #7 */}
          {divTeams.length>0&&(
            <div style={{ padding:"12px 14px",borderTop:"1px solid #F0EEE8" }}>
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",
                textTransform:"uppercase",letterSpacing:".07em",marginBottom:8 }}>
                Parity · target avg {divTeams.length>0?(divTeams.reduce((s,t)=>s+t.players.reduce((a,p)=>a+draftScore(p),0),0)/Math.max(1,divTeams.length)).toFixed(1):"—"}
              </div>
              {divTeams.map(t=>{
                const sc=t.players.reduce((s,p)=>s+draftScore(p),0);
                const avg=divTeams.reduce((s,tt)=>s+tt.players.reduce((a,p)=>a+draftScore(p),0),0)/Math.max(1,divTeams.length);
                const pct2=avg>0?Math.min(100,(sc/avg)*80):0;
                const col=sc>=avg*0.9&&sc<=avg*1.1?"#166534":sc>=avg*0.8?"#92400E":"#991B1B";
                return (
                  <div key={t.id} style={{ marginBottom:8 }}>
                    <div style={{ display:"flex",justifyContent:"space-between",marginBottom:3 }}>
                      <span style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#555",
                        display:"flex",alignItems:"center",gap:4 }}>
                        <span style={{ width:6,height:6,borderRadius:"50%",background:t.colour,display:"inline-block" }}/>
                        {t.name}
                      </span>
                      <span style={{ fontFamily:"'Fraunces',serif",fontSize:11,fontWeight:700,color:col }}>
                        {sc.toFixed(0)}
                      </span>
                    </div>
                    <div style={{ height:3,background:"#F0EEE8",borderRadius:99,overflow:"hidden" }}>
                      <div style={{ height:"100%",width:`${pct2}%`,background:t.colour,
                        borderRadius:99,transition:"width .5s ease" }}/>
                    </div>
                  </div>
                );
              })}
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:8,color:"#bbb",marginTop:4 }}>
                75+ ✓ balanced · 65–74 △ review · &lt;65 ✗ rebalance
              </div>
            </div>
          )}
        </div>
      </div>

      {/* #13 Undo banner */}
      {showUndo && (
        <div style={{ position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",
          background:"#1a1a2e",borderRadius:99,padding:"10px 20px",
          display:"flex",alignItems:"center",gap:12,
          boxShadow:"0 8px 24px rgba(0,0,0,.2)",zIndex:999,
          animation:"slideUp .25s ease" }}>
          <span style={{ fontFamily:"'DM Mono',monospace",fontSize:12,color:"#D4A017" }}>
            Player moved
          </span>
          <button onClick={handleUndo} style={{ fontFamily:"'DM Mono',monospace",fontSize:12,
            background:"#D4A017",color:"#1a1a2e",border:"none",
            padding:"4px 14px",borderRadius:99,cursor:"pointer",fontWeight:600 }}>
            ↩ Undo
          </button>
          <button onClick={()=>setShowUndo(false)} style={{ background:"none",border:"none",
            color:"rgba(212,160,23,.4)",fontSize:14,cursor:"pointer" }}>✕</button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed",bottom:78,left:"50%",transform:"translateX(-50%)",
          fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:500,
          background:"#1a1a2e",color:"#D4A017",padding:"10px 22px",
          borderRadius:99,boxShadow:"0 8px 24px rgba(0,0,0,.2)",
          zIndex:1000,animation:"slideUp .25s ease",whiteSpace:"nowrap" }}>
          {toast}
        </div>
      )}

      {/* #27 Validation modal */}
      {showValidate && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.45)",
          zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center" }}>
          <div style={{ background:"#fff",borderRadius:14,padding:"28px",
            maxWidth:420,width:"90vw",boxShadow:"0 24px 60px rgba(0,0,0,.22)" }}>
            <h2 style={{ fontFamily:"'Fraunces',serif",fontSize:18,fontWeight:700,
              color:"#1a1a2e",margin:"0 0 6px" }}>Pre-save validation</h2>
            <p style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#888",margin:"0 0 16px" }}>
              Resolve these issues or override to save anyway.
            </p>
            {validationIssues.map((iss,i)=>(
              <div key={i} style={{ fontFamily:"'DM Mono',monospace",fontSize:11,
                color:"#991B1B",padding:"6px 10px",background:"#FEF2F2",
                borderRadius:6,marginBottom:6 }}>✗ {iss}</div>
            ))}
            <div style={{ display:"flex",gap:10,marginTop:18 }}>
              <button onClick={()=>setShowValidate(false)} style={{ flex:1,
                fontFamily:"'DM Mono',monospace",fontSize:12,background:"#F6F5F0",
                border:"1px solid #E8E6DF",color:"#666",padding:"10px",
                borderRadius:8,cursor:"pointer" }}>Go back</button>
              <button onClick={()=>{setShowValidate(false);showToast("✓ Rosters saved with overrides");}}
                style={{ flex:1,fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:500,
                  background:"#1a1a2e",color:"#D4A017",border:"none",
                  padding:"10px",borderRadius:8,cursor:"pointer" }}>
                Save anyway →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* #15 Print preview */}
      {showPrint && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.5)",
          zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",
          padding:"20px" }}>
          <div style={{ background:"#fff",borderRadius:14,maxWidth:560,width:"100%",
            maxHeight:"80vh",overflow:"auto",boxShadow:"0 24px 60px rgba(0,0,0,.22)" }}>
            <div style={{ padding:"18px 22px 14px",borderBottom:"1px solid #F0EEE8",
              display:"flex",justifyContent:"space-between" }}>
              <span style={{ fontFamily:"'Fraunces',serif",fontSize:17,fontWeight:700,color:"#1a1a2e" }}>
                Print preview — {DIV_LABEL[division]}
              </span>
              <button onClick={()=>setShowPrint(false)} style={{ background:"none",border:"none",
                fontSize:14,color:"#aaa",cursor:"pointer" }}>✕</button>
            </div>
            <div style={{ padding:"18px 22px" }}>
              {divTeams.map(t=>(
                <div key={t.id} style={{ marginBottom:20 }}>
                  <div style={{ fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:700,
                    color:t.colour,marginBottom:8,display:"flex",alignItems:"center",gap:6 }}>
                    <span style={{ width:10,height:10,borderRadius:"50%",background:t.colour,display:"inline-block" }}/>
                    {t.name}
                  </div>
                  {t.players.map(p=>(
                    <div key={p.id} style={{ fontFamily:"'DM Mono',monospace",fontSize:11,
                      color:"#555",padding:"4px 0",borderBottom:"1px solid #F9F8F4",
                      display:"flex",gap:12 }}>
                      <span style={{ flex:1 }}>{p.first_name} {p.last_name}{p.is_captain?" (C)":""}</span>
                      <span>{POSITION_LABEL[p.position]||"—"}</span>
                      <span>{p.skill_tier_reported}</span>
                    </div>
                  ))}
                  {t.players.length===0&&<div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#ccc" }}>No players assigned</div>}
                </div>
              ))}
            </div>
            <div style={{ padding:"14px 22px 20px",borderTop:"1px solid #F0EEE8",
              display:"flex",gap:10 }}>
              <button onClick={()=>setShowPrint(false)} style={{ flex:1,
                fontFamily:"'DM Mono',monospace",fontSize:12,background:"#F6F5F0",
                border:"1px solid #E8E6DF",color:"#666",padding:"9px",
                borderRadius:8,cursor:"pointer" }}>Cancel</button>
              <button onClick={()=>window.print()} style={{ flex:2,
                fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:500,
                background:"#1a1a2e",color:"#D4A017",border:"none",
                padding:"9px",borderRadius:8,cursor:"pointer" }}>
                ⎙ Print this roster
              </button>
            </div>
          </div>
        </div>
      )}

      {/* #2 Add team modal */}
      {showAddTeam && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.45)",
          zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center" }}>
          <div style={{ background:"#fff",borderRadius:14,padding:"24px",
            maxWidth:380,width:"90vw",boxShadow:"0 24px 60px rgba(0,0,0,.22)" }}>
            <h2 style={{ fontFamily:"'Fraunces',serif",fontSize:17,fontWeight:700,
              color:"#1a1a2e",margin:"0 0 16px" }}>Create team</h2>
            <div style={{ marginBottom:12 }}>
              <label style={fL}>Team name</label>
              <input value={newTeamName} onChange={e=>setNewTeamName(e.target.value)}
                placeholder={`Team ${divTeams.length+1}`}
                style={inputS} />
            </div>
            <div style={{ marginBottom:18 }}>
              <label style={fL}>Jersey colour</label>
              <div style={{ display:"flex",gap:8 }}>
                {TEAM_COLORS.map(c=>(
                  <div key={c} onClick={()=>setNewTeamColor(c)}
                    style={{ width:28,height:28,borderRadius:"50%",background:c,cursor:"pointer",
                      border:`3px solid ${newTeamColor===c?"#1a1a2e":"transparent"}`,
                      boxShadow:newTeamColor===c?"0 0 0 1px #fff inset":"none",transition:"all .15s" }}/>
                ))}
              </div>
            </div>
            <div style={{ display:"flex",gap:10 }}>
              <button onClick={()=>setShowAddTeam(false)} style={{ flex:1,
                fontFamily:"'DM Mono',monospace",fontSize:12,background:"#F6F5F0",
                border:"1px solid #E8E6DF",color:"#666",padding:"9px",borderRadius:8,cursor:"pointer" }}>Cancel</button>
              <button onClick={handleAddTeam} style={{ flex:2,fontFamily:"'DM Mono',monospace",
                fontSize:12,fontWeight:500,background:"#1a1a2e",color:"#D4A017",
                border:"none",padding:"9px",borderRadius:8,cursor:"pointer" }}>
                Create team →
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

const fL    = { fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:".07em",display:"block",marginBottom:5 };
const inputS= { fontFamily:"'DM Mono',monospace",fontSize:12,background:"#F6F5F0",border:"1px solid #E8E6DF",borderRadius:6,padding:"7px 10px",color:"#333",outline:"none",width:"100%" };
const actBtn= { fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:600,background:"#F6F5F0",border:"1px solid #E8E6DF",color:"#555",width:22,height:22,borderRadius:5,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0 };
const cmpTh = { fontFamily:"'DM Mono',monospace",fontSize:9,color:"#888",textTransform:"uppercase",letterSpacing:".07em",padding:"8px 12px",textAlign:"left",borderBottom:"1px solid #E8E6DF",background:"#FAFAF8",whiteSpace:"nowrap" };
const cmpTd = { fontFamily:"'DM Mono',monospace",fontSize:11,color:"#555",padding:"7px 12px",borderBottom:"1px solid #F3F2ED" };
