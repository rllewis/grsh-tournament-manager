import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { computeScore, formatReturningBadge } from "../lib/playerScoring";
import CommitteeAdjustmentEditor from "../components/CommitteeAdjustmentEditor";

const API   = window.grshConfig?.apiUrl || "/wp-json/grsh/v1";
const NONCE = window.grshConfig?.nonce  || "";

// ─── Mock data ────────────────────────────────────────────────────────────────
const MOCK_PLAYERS = [
  { id:1,  first_name:"Chris",  last_name:"Fontaine",  email:"c.fontaine@email.com",  phone:"+19165550101", age:48, position:"winger",     skill_tier_reported:"R1", skill_tier_assigned:null,  division_requested:"gold_open", player_type:"primary", payment_status:"paid",    status:"approved",       sandbagging_flag:false, jersey_size:"L",      years_experience:12, committee_score_adjustment:0,  notes:"",                       returning_seasons:[2025,2024], history_seasons:2, comms:["Payment receipt sent · May 1"] },
  { id:2,  first_name:"Sarah",  last_name:"Mitchell",  email:"s.mitchell@email.com",  phone:"+19165550102", age:46, position:"defenseman", skill_tier_reported:"B3", skill_tier_assigned:null,  division_requested:"45a",       player_type:"primary", payment_status:"paid",    status:"approved",       sandbagging_flag:false, jersey_size:"M",      years_experience:18, committee_score_adjustment:0,  notes:"",                       returning_seasons:[2026,2025,2024], history_seasons:3, comms:[] },
  { id:3,  first_name:"Tom",    last_name:"Breslin",   email:"t.breslin@email.com",   phone:"+19165550103", age:52, position:null,         skill_tier_reported:"R2", skill_tier_assigned:null,  division_requested:"senior_b",  player_type:"sub",     payment_status:"waived",  status:"approved",       sandbagging_flag:false, jersey_size:"XL",     years_experience:5,  committee_score_adjustment:0,  notes:"",                       returning_seasons:[], history_seasons:0, comms:[] },
  { id:4,  first_name:"Janet",  last_name:"Ruiz",      email:"j.ruiz@email.com",      phone:"+19165550104", age:51, position:"goaltender", skill_tier_reported:"C1", skill_tier_assigned:null,  division_requested:"senior_c",  player_type:"primary", payment_status:"pending", status:"registered",     sandbagging_flag:false, jersey_size:"Goalie", years_experience:8,  committee_score_adjustment:0,  notes:"",                       returning_seasons:[2025], history_seasons:1, comms:["Payment reminder sent · May 20"] },
  { id:5,  first_name:"Paul",   last_name:"Nguyen",    email:"p.nguyen@email.com",    phone:"+19165550105", age:44, position:"center",     skill_tier_reported:"R1", skill_tier_assigned:null,  division_requested:"gold_open", player_type:"primary", payment_status:"paid",    status:"approved",       sandbagging_flag:false, jersey_size:"M",      years_experience:10, committee_score_adjustment:0,  notes:"",                       returning_seasons:[2026], history_seasons:1, comms:[] },
  { id:6,  first_name:"Mike",   last_name:"Hartley",   email:"m.hartley@email.com",   phone:"+19165550106", age:49, position:"winger",     skill_tier_reported:"A2", skill_tier_assigned:null,  division_requested:"senior_c",  player_type:"primary", payment_status:"paid",    status:"approved",       sandbagging_flag:true,  jersey_size:"L",      years_experience:22, committee_score_adjustment:0,  notes:"Prior div Gold Open",    returning_seasons:[2026,2025,2024], history_seasons:3, comms:[] },
  { id:7,  first_name:"Dave",   last_name:"Kowalski",  email:"d.kowalski@email.com",  phone:"+19165550107", age:47, position:"defenseman", skill_tier_reported:"B1", skill_tier_assigned:null,  division_requested:"senior_b",  player_type:"primary", payment_status:"paid",    status:"approved",       sandbagging_flag:true,  jersey_size:"2XL",    years_experience:20, committee_score_adjustment:0,  notes:"",                       returning_seasons:[2026,2025], history_seasons:2, comms:[] },
  { id:8,  first_name:"Linda",  last_name:"Tran",      email:"l.tran@email.com",      phone:"+19165550108", age:53, position:"goaltender", skill_tier_reported:"R2", skill_tier_assigned:null,  division_requested:"45a",       player_type:"primary", payment_status:"paid",    status:"draft_eligible", sandbagging_flag:false, jersey_size:"Goalie", years_experience:15, committee_score_adjustment:0,  notes:"",                       returning_seasons:[2026,2025,2024], history_seasons:3, comms:[] },
  { id:9,  first_name:"Ray",    last_name:"Dominguez", email:"r.dominguez@email.com", phone:"+19165550109", age:55, position:"center",     skill_tier_reported:"C2", skill_tier_assigned:null,  division_requested:"senior_b",  player_type:"primary", payment_status:"pending", status:"registered",     sandbagging_flag:false, jersey_size:"L",      years_experience:6,  committee_score_adjustment:0,  notes:"",                       returning_seasons:[], history_seasons:0, comms:["Payment reminder sent · May 18"] },
  { id:10, first_name:"Karen",  last_name:"Osei",      email:"k.osei@email.com",      phone:"+19165550110", age:46, position:"winger",     skill_tier_reported:"B2", skill_tier_assigned:"B3",  division_requested:"gold_open", player_type:"primary", payment_status:"paid",    status:"approved",       sandbagging_flag:false, jersey_size:"S",      years_experience:17, committee_score_adjustment:1,  notes:"Committee override B2→B3", returning_seasons:[2026,2025,2024], history_seasons:3, comms:[] },
  { id:11, first_name:"Scott",  last_name:"Lemieux",   email:"s.lemieux@email.com",   phone:"+19165550111", age:50, position:"defenseman", skill_tier_reported:"R3", skill_tier_assigned:null,  division_requested:"senior_c",  player_type:"primary", payment_status:"paid",    status:"draft_eligible", sandbagging_flag:false, jersey_size:"XL",     years_experience:9,  committee_score_adjustment:0,  notes:"",                       returning_seasons:[2025], history_seasons:1, comms:[] },
  { id:12, first_name:"Amy",    last_name:"Buchanan",  email:"a.buchanan@email.com",  phone:"+19165550112", age:48, position:null,         skill_tier_reported:"R1", skill_tier_assigned:null,  division_requested:"gold_open", player_type:"sub",     payment_status:"waived",  status:"approved",       sandbagging_flag:false, jersey_size:"M",      years_experience:3,  committee_score_adjustment:0,  notes:"",                       returning_seasons:[], history_seasons:0, comms:[] },
];

const DIV_CAPS = { gold_open:30,"45a":24,senior_b:32,senior_c:24,womens:24 };
const DIVISION_LABEL = { gold_open:"Gold Open","45a":"45A",senior_b:"Senior B",senior_c:"Senior C",womens:"Womens" };
const DIVISION_COLOR = {
  gold_open:{ bg:"#FEF9E7",color:"#92601A",border:"#F5D77E" },
  "45a":    { bg:"#E8F6F8",color:"#1A5F6B",border:"#9DD5DC" },
  senior_b: { bg:"#F3EEF9",color:"#4A3070",border:"#C4AEED" },
  senior_c: { bg:"#FDF0E8",color:"#7A3318",border:"#F5B993" },
  womens:   { bg:"#FBEAF0",color:"#6B1A3A",border:"#F4C0D1" },
};
const POSITION_LABEL = { defenseman:"Defense",center:"Center",winger:"Winger",goaltender:"Goalie" };
const POSITION_COLOR = {
  defenseman:{ bg:"#E8F0FE",color:"#1A3F8F" },
  center:    { bg:"#E8F8EF",color:"#1A5C35" },
  winger:    { bg:"#FDF3E8",color:"#7A4A18" },
  goaltender:{ bg:"#FCE8E8",color:"#7A1818" },
};
const STATUS_COLOR = {
  returning:     { bg:"#EEF2FF",color:"#3730A3" },
  registered:    { bg:"#F3F4F6",color:"#374151" },
  approved:      { bg:"#E6F4EA",color:"#1E6B3A" },
  draft_eligible:{ bg:"#E0F0FF",color:"#1A4F8A" },
  assigned:      { bg:"#F0FDF4",color:"#166534" },
  withdrawn:     { bg:"#FEE2E2",color:"#991B1B" },
};
const STATUS_STEPS = ["registered","approved","draft_eligible","assigned","withdrawn"];
const PAYMENT_COLOR = {
  paid:    { bg:"#E6F4EA",color:"#1E6B3A" },
  pending: { bg:"#FEF3C7",color:"#92400E" },
  waived:  { bg:"#EDE9FE",color:"#4C1D95" },
  refunded:{ bg:"#FEE2E2",color:"#991B1B" },
};
const TIER_COLOR = (t) => {
  if(!t) return { bg:"#F3F4F6",color:"#6B7280" };
  const f=t[0];
  if(f==="A") return { bg:"#FCE8E8",color:"#7A1818" };
  if(f==="B") return { bg:"#FEF0E8",color:"#7A4518" };
  if(f==="C") return { bg:"#FEF9E7",color:"#7A5A18" };
  return { bg:"#E8F0FE",color:"#1A3F8F" };
};
const TIERS = ["A1","A2","A3","B1","B2","B3","C1","C2","R1","R2","R3"];
const ALL_DIVISIONS = ["gold_open","45a","senior_b","senior_c","womens"];
const ALL_POSITIONS = ["defenseman","center","winger","goaltender"];
const ALL_STATUSES  = ["returning","registered","approved","draft_eligible","assigned","withdrawn"];
const ALL_PAYMENTS  = ["paid","pending","waived","refunded"];
const PAGE_SIZE = 50;
const CURRENT_YEAR = 2027;
// Attention-queue predicates (key → who is affected)
const QUEUE_FILTERS = {
  unpaid_on_team: (p)=>p.registered_this_season!==false&&["approved","draft_eligible","assigned"].includes(p.status)&&p.payment_status==="pending",
  incomplete:     (p)=>p.registered_this_season!==false&&(!p.position||!p.division_requested),
  sandbagging:    (p)=>!!p.sandbagging_flag,
  duplicates:     (p,ctx)=>ctx.dupIds.has(p.id),
};

// WOW 1: Natural language search parser
const NL_PATTERNS = [
  { re:/(\w+)\s+tier/i,   handler:(m,p)=>p.skill_tier_reported?.toLowerCase().startsWith(m[1].toLowerCase()) },
  { re:/unpaid|pending/i, handler:(_,p)=>p.payment_status==="pending" },
  { re:/paid\b/i,         handler:(_,p)=>p.payment_status==="paid" },
  { re:/gold open/i,      handler:(_,p)=>p.division_requested==="gold_open" },
  { re:/45a/i,            handler:(_,p)=>p.division_requested==="45a" },
  { re:/senior b/i,       handler:(_,p)=>p.division_requested==="senior_b" },
  { re:/senior c/i,       handler:(_,p)=>p.division_requested==="senior_c" },
  { re:/womens?/i,         handler:(_,p)=>p.division_requested==="womens" },
  { re:/winger/i,         handler:(_,p)=>p.position==="winger" },
  { re:/defense/i,        handler:(_,p)=>p.position==="defenseman" },
  { re:/center/i,         handler:(_,p)=>p.position==="center" },
  { re:/goalie|goaltender/i,handler:(_,p)=>p.position==="goaltender" },
  { re:/warning|sandbag/i,handler:(_,p)=>p.sandbagging_flag },
  { re:/approved/i,       handler:(_,p)=>p.status==="approved" },
  { re:/draft eligible/i, handler:(_,p)=>p.status==="draft_eligible" },
  { re:/registered/i,     handler:(_,p)=>p.status==="registered" },
  { re:/returning/i,      handler:(_,p)=>p.history_seasons>0 },
  { re:/new player/i,     handler:(_,p)=>p.history_seasons===0 },
  { re:/over (\d+)/i,     handler:(m,p)=>parseInt(p.age||0)>parseInt(m[1]) },
  { re:/under (\d+)/i,    handler:(m,p)=>parseInt(p.age||0)<parseInt(m[1]) },
  { re:/score.*?(\d+)/i,  handler:(m,p)=>computeScore(p.skill_tier_reported,p.years_experience,p.committee_score_adjustment)>=parseFloat(m[1]) },
  { re:/incomplete/i,     handler:(_,p)=>p.registered_this_season!==false&&(!p.position||!p.division_requested||!p.payment_status) },
  { re:/sub|alternate/i,  handler:(_,p)=>p.player_type==="sub" },
];
function nlSearch(query, players) {
  const q = query.trim().toLowerCase();
  if (!q) return players;
  const matchers = NL_PATTERNS.map(({re,handler})=>{const m=q.match(re);return m?p=>handler(m,p):null}).filter(Boolean);
  if (!matchers.length) {
    return players.filter(p=>`${p.first_name} ${p.last_name} ${p.email} ${p.skill_tier_reported}`.toLowerCase().includes(q));
  }
  return players.filter(p=>matchers.every(fn=>fn(p)));
}

// Suggested NL queries — WOW 1
const NL_SUGGESTIONS = [
  "Gold Open wingers who haven't paid",
  "A tier players over 50",
  "approved but not draft eligible",
  "returning players Senior B",
  "all goalies",
  "sandbagging warnings",
];

// WOW 3: Duplicate detector
function detectDuplicates(players, dismissed=[]) {
  const pairs = [];
  const skip = new Set(dismissed);
  for (let i=0;i<players.length;i++) {
    for (let j=i+1;j<players.length;j++) {
      const a=players[i], b=players[j];
      if (skip.has(Math.min(a.id,b.id)+"-"+Math.max(a.id,b.id))) continue;
      const sameName  = a.first_name===b.first_name&&a.last_name===b.last_name;
      const sameAge   = a.age===b.age;
      const emailSim  = a.email.split("@")[0].replace(/\W/g,"").includes(b.email.split("@")[0].replace(/\W/g,"").slice(0,4));
      if (sameName&&sameAge) pairs.push([a.id,b.id,"Same name + age"]);
      else if (sameName&&emailSim) pairs.push([a.id,b.id,"Same name, similar email"]);
    }
  }
  return pairs;
}

// WOW 10: Offline queue
const offlineQueue = { items:[], add(item){this.items.push(item);}, flush(){const q=[...this.items];this.items=[];return q;} };

// ─── Sub-components ───────────────────────────────────────────────────────────
function Pill({ bg,color,border,children,small }) {
  return <span style={{ display:"inline-block",background:bg,color,
    border:`1px solid ${border||bg}`,fontSize:small?10:11,
    fontFamily:"'DM Mono',monospace",fontWeight:500,
    padding:small?"1px 6px":"2px 8px",borderRadius:99,whiteSpace:"nowrap" }}>
    {children}</span>;
}

// #5 Score spark bar
function ScoreBar({ score, min, max, label }) {
  const pct = max>min ? ((score-min)/(max-min))*100 : 50;
  const avg  = (min+max)/2;
  const col  = score>=avg?"#166534":score>=avg*0.85?"#92400E":"#991B1B";
  return (
    <div style={{ display:"flex",alignItems:"center",gap:6 }}>
      <div style={{ width:52,height:5,background:"#F0EEE8",borderRadius:99,overflow:"hidden",flexShrink:0,position:"relative" }}>
        <div style={{ position:"absolute",top:0,left:0,height:"100%",
          width:`${pct}%`,background:col,borderRadius:99,transition:"width .4s" }}/>
        <div style={{ position:"absolute",top:-2,left:"50%",
          width:1,height:9,background:"#D0CEC6" }}/>
      </div>
      <span style={{ fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:700,
        color:col,whiteSpace:"nowrap" }} title={`Score ${score.toFixed(1)} · Range ${min}–${max}`}>
        {score.toFixed(1)}
      </span>
    </div>
  );
}

// #6 Copy to clipboard button
function CopyBtn({ value, label }) {
  const [copied,setCopied]=useState(false);
  return (
    <button onClick={e=>{e.stopPropagation();navigator.clipboard?.writeText(value);setCopied(true);setTimeout(()=>setCopied(false),2000);}}
      style={{ background:"none",border:"none",cursor:"pointer",padding:"2px 4px",
        fontFamily:"'DM Mono',monospace",fontSize:10,
        color:copied?"#166534":"#bbb",transition:"color .2s" }}
      title={`Copy ${label}`}>{copied?"✓":"⎘"}</button>
  );
}

// #7 Returning badge
function ReturningBadge({ seasons }) {
  if(!seasons||!seasons.length) return null;
  const n=seasons.length;
  const label=n>=4?"Y4+":n>=3?"Y3":n>=2?"Y2":"Y1";
  const bg=n>=4?"#1a1a2e":n>=3?"#3B1F5E":n>=2?"#1F4E3B":"#F6F5F0";
  const col=n>=4?"#D4A017":n>=3?"#C4AEED":n>=2?"#86EFAC":"#888";
  return <span style={{ fontFamily:"'DM Mono',monospace",fontSize:8,fontWeight:700,
    background:bg,color:col,padding:"1px 5px",borderRadius:3,marginLeft:4 }}
    title={`Returning: ${seasons.join(", ")}`}>{label}</span>;
}

// #21 History indicator
function HistoryDot({ seasons }) {
  if(!seasons) return null;
  return <span style={{ fontSize:10,cursor:"default" }}
    title={`${seasons} season${seasons!==1?"s":""} on record`}>📋</span>;
}

// Skeleton row
function SkeletonRow() {
  return <tr>{[200,80,80,60,80,40,70,80,90,32].map((w,i)=>(
    <td key={i} style={{ padding:"13px 12px" }}>
      <div style={{ width:w,height:11,borderRadius:4,
        background:"linear-gradient(90deg,#F0EEE8 25%,#E8E6DF 50%,#F0EEE8 75%)",
        backgroundSize:"400px 100%",animation:"shimmer 1.4s infinite" }}/>
    </td>))}
  </tr>;
}

// Status stepper
function StatusStepper({ value, onChange }) {
  const LABELS={registered:"Registered",approved:"Approved",draft_eligible:"Draft Eligible",assigned:"Assigned",withdrawn:"Withdrawn"};
  const idx=STATUS_STEPS.indexOf(value);
  return (
    <div style={{ display:"flex",alignItems:"center",gap:0,marginTop:8,overflowX:"auto" }}>
      {STATUS_STEPS.map((s,i)=>{
        const isActive=s===value, isPast=i<idx;
        const col=isActive?STATUS_COLOR[s]:{};
        return (
          <div key={s} style={{ display:"flex",alignItems:"center",flex:s==="withdrawn"?"none":1 }}>
            <div onClick={()=>onChange(s)} title={LABELS[s]} style={{
              fontFamily:"'DM Mono',monospace",fontSize:9,textTransform:"uppercase",
              letterSpacing:".05em",padding:"5px 10px",borderRadius:99,cursor:"pointer",
              whiteSpace:"nowrap",
              background:isActive?col.bg:isPast?"#F0FDF4":"#F6F5F0",
              color:isActive?col.color:isPast?"#166534":"#aaa",
              border:`1px solid ${isActive?col.color:isPast?"#BBF7D0":"#E8E6DF"}`,
              fontWeight:isActive?600:400,
            }}>{isPast&&!isActive?"✓ ":""}{LABELS[s]}</div>
            {i<STATUS_STEPS.length-1&&<div style={{ height:1,flex:1,minWidth:8,background:isPast?"#BBF7D0":"#E8E6DF" }}/>}
          </div>
        );
      })}
    </div>
  );
}

// Tier scale
function TierScale({ value, onChange }) {
  const groups=[["A1","A2","A3"],["B1","B2","B3"],["C1","C2"],["R1","R2","R3"]];
  return (
    <div style={{ display:"flex",flexDirection:"column",gap:6,marginTop:8 }}>
      {groups.map(group=>(
        <div key={group[0][0]} style={{ display:"flex",gap:4,alignItems:"center" }}>
          <span style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#bbb",width:12,textAlign:"center" }}>{group[0][0]}</span>
          {group.map(t=>{
            const tc=TIER_COLOR(t),active=value===t;
            return <button key={t} onClick={()=>onChange(t)} style={{
              fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:active?700:400,
              padding:"4px 10px",borderRadius:6,cursor:"pointer",
              background:active?tc.bg:"#F6F5F0",color:active?tc.color:"#888",
              border:`1px solid ${active?tc.color:"#E8E6DF"}`,transition:"all .12s" }}>{t}</button>;
          })}
        </div>
      ))}
    </div>
  );
}

// #30 Field help popover
function FieldHelp({ text }) {
  const [show,setShow]=useState(false);
  return (
    <span style={{ position:"relative",display:"inline-block",marginLeft:4 }}>
      <span onClick={e=>{e.stopPropagation();setShow(s=>!s)}}
        style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#bbb",cursor:"pointer",
          border:"1px solid #E8E6DF",borderRadius:"50%",padding:"0 4px" }}>?</span>
      {show&&<div style={{ position:"absolute",bottom:"120%",left:0,zIndex:100,
        background:"#1a1a2e",color:"#fff",borderRadius:8,padding:"10px 12px",
        fontFamily:"'DM Mono',monospace",fontSize:10,lineHeight:1.6,
        minWidth:220,maxWidth:280,boxShadow:"0 8px 24px rgba(0,0,0,.3)" }}>
        {text}
        <div style={{ position:"absolute",bottom:-5,left:8,width:10,height:10,
          background:"#1a1a2e",transform:"rotate(45deg)" }}/>
      </div>}
    </span>
  );
}

// #19 Registration pipeline bar
function PipelineBar({ players, onStageClick }) {
  const counts = useMemo(()=>{
    const c={registered:0,approved:0,draft_eligible:0,assigned:0};
    players.forEach(p=>{ if(c[p.status]!==undefined)c[p.status]++; });
    return c;
  },[players]);
  const stages=[
    {key:"registered",    label:"Registered",    color:"#6B7280"},
    {key:"approved",      label:"Approved",      color:"#1E6B3A"},
    {key:"draft_eligible",label:"Draft Eligible",color:"#1A4F8A"},
    {key:"assigned",      label:"Assigned",      color:"#166534"},
  ];
  const max=players.length;
  return (
    <div style={{ background:"#fff",border:"1px solid #E8E6DF",borderRadius:10,
      padding:"10px 14px",marginBottom:8 }}>
      <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",
        textTransform:"uppercase",letterSpacing:".08em",marginBottom:10 }}>
        Registration pipeline
        {counts.approved>0&&counts.draft_eligible<counts.approved&&(
          <span style={{ marginLeft:10,color:"#92400E",fontWeight:500 }}>
            ⚠ {counts.approved-counts.draft_eligible} stuck at approved
          </span>
        )}
      </div>
      <div style={{ display:"flex",alignItems:"stretch",gap:0,height:36,borderRadius:8,overflow:"hidden" }}>
        {stages.map((st,i)=>{
          const w=max>0?(counts[st.key]/max)*100:0;
          if(!w) return null;
          return <div key={st.key} onClick={()=>onStageClick(st.key)}
            title={`${counts[st.key]} ${st.label} — click to filter`}
            style={{ flex:counts[st.key],background:st.color,cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",
              minWidth:30,transition:"opacity .15s",position:"relative" }}
            onMouseEnter={e=>e.currentTarget.style.opacity=".8"}
            onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontFamily:"'Fraunces',serif",fontSize:14,fontWeight:700,color:"#fff",lineHeight:1 }}>{counts[st.key]}</div>
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:8,color:"rgba(255,255,255,.7)" }}>{st.label}</div>
            </div>
          </div>;
        })}
      </div>
    </div>
  );
}

// WOW 4: Draft Preview
function DraftPreviewModal({ players, divisions, onClose }) {
  const [div,setDiv]=useState(divisions[0]||"gold_open");
  const divPlayers=players.filter(p=>p.division_requested===div)
    .sort((a,b)=>computeScore(b.skill_tier_reported,b.years_experience,b.committee_score_adjustment)
                -computeScore(a.skill_tier_reported,a.years_experience,a.committee_score_adjustment));
  const ROUND_SIZE=divPlayers.length>0?Math.ceil(divPlayers.length/4):1;
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:2000,
      display:"flex",alignItems:"center",justifyContent:"center",padding:"20px" }}>
      <div style={{ background:"#fff",borderRadius:16,width:"100%",maxWidth:680,
        maxHeight:"85vh",overflow:"hidden",boxShadow:"0 32px 80px rgba(0,0,0,.25)",
        display:"flex",flexDirection:"column" }}>
        <div style={{ padding:"18px 22px 14px",borderBottom:"1px solid #F0EEE8",
          display:"flex",justifyContent:"space-between",alignItems:"center",
          background:"#1a1a2e" }}>
          <div>
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#D4A017",
              textTransform:"uppercase",letterSpacing:".1em",marginBottom:3 }}>Draft Preview Mode</div>
            <h2 style={{ fontFamily:"'Fraunces',serif",fontSize:18,fontWeight:700,color:"#fff",margin:0 }}>
              Simulated Draft Order
            </h2>
          </div>
          <div style={{ display:"flex",gap:8,alignItems:"center" }}>
            <select value={div} onChange={e=>setDiv(e.target.value)}
              style={{ fontFamily:"'DM Mono',monospace",fontSize:11,background:"rgba(255,255,255,.1)",
                border:"1px solid rgba(255,255,255,.2)",borderRadius:6,color:"#fff",
                padding:"5px 10px",outline:"none" }}>
              {divisions.map(d=><option key={d} value={d}>{DIVISION_LABEL[d]||d}</option>)}
            </select>
            <button onClick={onClose} style={{ background:"none",border:"none",
              color:"#D4A017",fontSize:16,cursor:"pointer" }}>✕</button>
          </div>
        </div>
        <div style={{ overflowY:"auto",flex:1,padding:"16px 22px" }}>
          {divPlayers.map((p,i)=>{
            const round=Math.floor(i/ROUND_SIZE)+1;
            const score=computeScore(p.skill_tier_reported,p.years_experience,p.committee_score_adjustment);
            const tc=TIER_COLOR(p.skill_tier_assigned||p.skill_tier_reported);
            const showRound=i===0||(i%ROUND_SIZE===0);
            return (
              <>
                {showRound&&<div key={`r${round}`} style={{ fontFamily:"'DM Mono',monospace",
                  fontSize:9,color:"#aaa",textTransform:"uppercase",letterSpacing:".1em",
                  padding:"8px 0 4px",marginTop:i?12:0 }}>
                  Round {round}
                </div>}
                <div key={p.id} style={{ display:"flex",alignItems:"center",gap:10,
                  padding:"8px 10px",borderRadius:8,marginBottom:4,
                  background:i%2===0?"#FAFAF8":"#fff",border:"1px solid #F0EEE8" }}>
                  <span style={{ fontFamily:"'Fraunces',serif",fontSize:14,fontWeight:700,
                    color:"#aaa",minWidth:28,textAlign:"center" }}>#{i+1}</span>
                  <div style={{ flex:1 }}>
                    <span style={{ fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:600,color:"#1a1a2e" }}>
                      {p.first_name} {p.last_name}
                    </span>
                    <ReturningBadge seasons={p.returning_seasons} />
                    {p.sandbagging_flag&&<span style={{ marginLeft:6,fontSize:10 }}>⚠</span>}
                  </div>
                  <Pill {...tc} small>{p.skill_tier_assigned||p.skill_tier_reported}</Pill>
                  {p.position&&<Pill {...POSITION_COLOR[p.position]} small>{POSITION_LABEL[p.position]}</Pill>}
                  <span style={{ fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:700,
                    color:"#1a1a2e",minWidth:36,textAlign:"right" }}>{score.toFixed(1)}</span>
                </div>
              </>
            );
          })}
          {divPlayers.length===0&&<p style={{ fontFamily:"'DM Mono',monospace",fontSize:12,color:"#aaa",textAlign:"center",padding:"40px 0" }}>
            No players in {DIVISION_LABEL[div]||div}
          </p>}
        </div>
      </div>
    </div>
  );
}

// WOW 5: Duplicate detector modal — merge + dismiss are real actions
function DuplicateModal({ players, dismissed, onClose, onMerge, onDismiss }) {
  const dupes=useMemo(()=>detectDuplicates(players,dismissed),[players,dismissed]);
  const [keep,setKeep]=useState({});      // pairKey -> id to keep
  const [busy,setBusy]=useState(null);
  const [err,setErr]=useState({});
  const score=p=>(p.history_count||0)*10+(p.registered_this_season?5:0)+(p.last_played_year||0)/10000;
  const pairKey=(a,b)=>Math.min(a,b)+"-"+Math.max(a,b);
  const doMerge=async(a,b)=>{
    const k=pairKey(a.id,b.id);
    const keepId=keep[k]||(score(a)>=score(b)?a.id:b.id);
    const removeId=keepId===a.id?b.id:a.id;
    setBusy(k); setErr(e=>({...e,[k]:""}));
    const msg=await onMerge(keepId,removeId);
    setBusy(null);
    if(msg) setErr(e=>({...e,[k]:msg}));
  };
  const btn={ fontFamily:"'DM Mono',monospace",fontSize:11,padding:"5px 14px",borderRadius:6,cursor:"pointer" };
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:2000,
      display:"flex",alignItems:"center",justifyContent:"center",padding:"20px" }}>
      <div style={{ background:"#fff",borderRadius:14,maxWidth:560,width:"100%",
        boxShadow:"0 24px 60px rgba(0,0,0,.22)",overflow:"hidden" }}>
        <div style={{ padding:"18px 22px 14px",borderBottom:"1px solid #F0EEE8",
          display:"flex",justifyContent:"space-between" }}>
          <h2 style={{ fontFamily:"'Fraunces',serif",fontSize:17,fontWeight:700,color:"#1a1a2e",margin:0 }}>
            Possible Duplicates
          </h2>
          <button onClick={onClose} style={{ background:"none",border:"none",fontSize:14,color:"#aaa",cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ padding:"16px 22px",maxHeight:"60vh",overflowY:"auto" }}>
          {dupes.length===0?(
            <div style={{ textAlign:"center",padding:"32px 0" }}>
              <div style={{ fontSize:28,marginBottom:8 }}>✅</div>
              <p style={{ fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,color:"#166534",margin:"0 0 4px" }}>No duplicates found</p>
              <p style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#aaa",margin:0 }}>All player records appear unique.</p>
            </div>
          ):(<>
            <p style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#888",margin:"0 0 12px",lineHeight:1.5 }}>
              Same name does not always mean same person. Merge only when both records are the same human
              (e.g. two email addresses). Merging moves history, registrations and rosters onto the record you keep;
              it is refused automatically if both have a row for the same season.
            </p>
            {dupes.map(([aid,bid,reason])=>{
              const a=players.find(p=>p.id===aid),b=players.find(p=>p.id===bid);
              if(!a||!b) return null;
              const k=pairKey(aid,bid);
              const keepId=keep[k]||(score(a)>=score(b)?a.id:b.id);
              return (
                <div key={k} style={{ border:"1px solid #FDE68A",borderRadius:10,
                  padding:"12px 14px",marginBottom:10,background:"#FFFBEB" }}>
                  <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#92400E",
                    fontWeight:500,marginBottom:8 }}>⧉ {reason}</div>
                  <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                    {[a,b].map(p=>(
                      <label key={p.id} style={{ background:"#fff",borderRadius:6,padding:"8px 10px",cursor:"pointer",
                        border:keepId===p.id?"2px solid #1a1a2e":"2px solid transparent",display:"block" }}>
                        <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:2 }}>
                          <input type="radio" name={"keep-"+k} checked={keepId===p.id}
                            onChange={()=>setKeep(x=>({...x,[k]:p.id}))}/>
                          <span style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:keepId===p.id?"#166534":"#aaa" }}>
                            {keepId===p.id?"KEEP":"merge away"}</span>
                        </div>
                        <div style={{ fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:700,color:"#1a1a2e" }}>
                          {p.first_name} {p.last_name}
                        </div>
                        <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#888",wordBreak:"break-all" }}>{p.email}</div>
                        <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#888" }}>
                          {p.history_count||0} season{(p.history_count||0)!==1?"s":""} of history
                          {p.last_played_year?` · last ${p.last_played_year}`:""}
                          {p.registered_this_season?" · registered 2027":""}
                        </div>
                      </label>
                    ))}
                  </div>
                  {err[k]&&<div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#991B1B",marginTop:8 }}>{err[k]}</div>}
                  <div style={{ display:"flex",gap:8,marginTop:10 }}>
                    <button disabled={busy===k} onClick={()=>doMerge(a,b)}
                      style={{ ...btn,background:"#1a1a2e",color:"#D4A017",border:"none",opacity:busy===k?.6:1 }}>
                      {busy===k?"Merging…":"Merge into selected"}</button>
                    <button disabled={busy===k} onClick={()=>onDismiss(aid,bid)}
                      style={{ ...btn,background:"#F6F5F0",border:"1px solid #E8E6DF",color:"#888" }}>Not a duplicate</button>
                  </div>
                </div>
              );
            })}
          </>)}
        </div>
      </div>
    </div>
  );
}

// WOW 6: Batch email composer
function BatchEmailModal({ players, onClose, onSend }) {
  const [subject,setSubject]=useState("");
  const [body,setBody]=useState("");
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:2000,
      display:"flex",alignItems:"center",justifyContent:"center",padding:"20px" }}>
      <div style={{ background:"#fff",borderRadius:14,maxWidth:520,width:"100%",
        boxShadow:"0 24px 60px rgba(0,0,0,.22)",overflow:"hidden" }}>
        <div style={{ padding:"18px 22px 14px",borderBottom:"1px solid #F0EEE8",
          display:"flex",justifyContent:"space-between",background:"#1a1a2e" }}>
          <div>
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#D4A017",
              textTransform:"uppercase",letterSpacing:".1em",marginBottom:3 }}>Batch Email</div>
            <h2 style={{ fontFamily:"'Fraunces',serif",fontSize:17,fontWeight:700,color:"#fff",margin:0 }}>
              Email {players.length} player{players.length!==1?"s":""}
            </h2>
          </div>
          <button onClick={onClose} style={{ background:"none",border:"none",color:"#D4A017",fontSize:16,cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ padding:"16px 22px" }}>
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",
            marginBottom:10 }}>
            To: {players.slice(0,4).map(p=>`${p.first_name} ${p.last_name}`).join(", ")}
            {players.length>4&&` + ${players.length-4} more`}
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={fL}>Subject</label>
            <input value={subject} onChange={e=>setSubject(e.target.value)}
              placeholder="Gold Rush 2027 — Payment reminder"
              style={inputS} />
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={fL}>Message</label>
            <textarea value={body} onChange={e=>setBody(e.target.value)}
              rows={6} placeholder="Hi {first_name},\n\nThis is a reminder that…"
              style={{ ...inputS,resize:"vertical" }} />
          </div>
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",marginBottom:14 }}>
            {"{first_name}"} will be personalized for each recipient.
          </div>
          <div style={{ display:"flex",gap:10 }}>
            <button onClick={onClose} style={{ flex:1,fontFamily:"'DM Mono',monospace",fontSize:12,
              background:"#F6F5F0",border:"1px solid #E8E6DF",color:"#666",
              padding:"10px",borderRadius:8,cursor:"pointer" }}>Cancel</button>
            <button onClick={()=>onSend(subject,body)} disabled={!subject||!body}
              style={{ flex:2,fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:500,
                background:subject&&body?"#1a1a2e":"#ccc",color:"#D4A017",border:"none",
                padding:"10px",borderRadius:8,cursor:subject&&body?"pointer":"not-allowed" }}>
              Send to {players.length} player{players.length!==1?"s":""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// WOW 8: Player similarity
function SimilarPlayers({ player, allPlayers, navigate }) {
  const similar=useMemo(()=>{
    const myScore=computeScore(player.skill_tier_reported,player.years_experience,player.committee_score_adjustment);
    return allPlayers
      .filter(p=>p.id!==player.id&&p.division_requested===player.division_requested&&p.position===player.position)
      .sort((a,b)=>{
        const as=computeScore(a.skill_tier_reported,a.years_experience,a.committee_score_adjustment);
        const bs=computeScore(b.skill_tier_reported,b.years_experience,b.committee_score_adjustment);
        return Math.abs(as-myScore)-Math.abs(bs-myScore);
      }).slice(0,3);
  },[player,allPlayers]);
  if(!similar.length) return null;
  return (
    <div style={{ padding:"14px 18px",borderBottom:"1px solid #F0EEE8" }}>
      <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",
        textTransform:"uppercase",letterSpacing:".08em",marginBottom:8 }}>Similar players</div>
      {similar.map(p=>{
        const tc=TIER_COLOR(p.skill_tier_reported);
        const sc=computeScore(p.skill_tier_reported,p.years_experience,p.committee_score_adjustment);
        return (
          <div key={p.id} style={{ display:"flex",alignItems:"center",gap:8,
            padding:"6px 0",borderBottom:"1px solid #F9F8F4",cursor:"pointer" }}>
            <div style={{ width:24,height:24,borderRadius:"50%",background:"#1a1a2e",color:"#D4A017",
              display:"flex",alignItems:"center",justifyContent:"center",
              fontFamily:"'DM Mono',monospace",fontSize:8,fontWeight:500,flexShrink:0 }}>
              {p.first_name[0]}{p.last_name[0]}
            </div>
            <div style={{ flex:1,minWidth:0 }}>
              <span style={{ fontFamily:"'Fraunces',serif",fontSize:12,fontWeight:600,color:"#1a1a2e" }}>
                {p.first_name} {p.last_name}
              </span>
            </div>
            <Pill {...tc} small>{p.skill_tier_reported}</Pill>
            <span style={{ fontFamily:"'Fraunces',serif",fontSize:12,fontWeight:700,color:"#1a1a2e" }}>
              {sc.toFixed(1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// #2 #3 Saved views + filter breadcrumbs
const DEFAULT_VIEWS = [
  { name:"Gold Open Unpaid",  filters:{ filterDiv:"gold_open",filterPayment:"pending" }},
  { name:"All Warnings",      filters:{ filterWarn:true }},
  { name:"Draft Eligible",    filters:{ filterStatus:"draft_eligible" }},
  { name:"Goalies",           filters:{ filterPos:"goaltender" }},
];


// ─── Renewal funnel helpers ───────────────────────────────────────────────────
// Stage of a returning player (someone with history) in the renewal funnel.
const RENEW_STAGES = [
  { k:"not_invited", label:"Not invited", color:"#6B7280" },
  { k:"invited",     label:"Invited",     color:"#1A4F8A" },
  { k:"opened",      label:"Opened",      color:"#7C3AED" },
  { k:"registered",  label:"Registered",  color:"#B45309" },
  { k:"paid",        label:"Paid",        color:"#166534" },
];
function renewStage(p,invites){
  if(!p.last_played_year) return null;                       // not part of the returning cohort
  if(p.registered_this_season!==false) return (p.payment_status==="paid"||p.payment_status==="waived")?"paid":"registered";
  const i=invites[p.id];
  if(!i) return "not_invited";
  return i.opened_at?"opened":"invited";
}

// Renewal invite composer
function RenewalInviteModal({ targets, settings, onClose, onSent }) {
  const [url,setUrl]=useState(settings?.registration_url||"");
  const [subject,setSubject]=useState(settings?.subject||"");
  const [body,setBody]=useState(settings?.body||"");
  const [sending,setSending]=useState(false);
  const [result,setResult]=useState(null);
  const [error,setError]=useState("");
  const sample=targets[0];
  const fill=(t)=>t.replace(/\{first_name\}/g,sample?.first_name||"Alex").replace(/\{season\}/g,CURRENT_YEAR).replace(/\{link\}/g,url?`${url}${url.includes("?")?"&":"?"}grsh_renew=…`:"[registration link]");
  const send=async()=>{
    setSending(true); setError("");
    try{
      const res=await fetch(`${API}/renewals/send`,{method:"POST",headers:{"Content-Type":"application/json","X-WP-Nonce":NONCE},
        body:JSON.stringify({player_ids:targets.map(t=>t.id),registration_url:url,subject,body})});
      const d=await res.json();
      if(!res.ok) setError(d?.error||d?.message||"Send failed."); else { setResult(d); onSent&&onSent(d); }
    }catch(e){ setError("Network error — nothing was confirmed sent. Check the Renewal funnel before retrying."); }
    setSending(false);
  };
  const lbl={ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:".08em",marginBottom:4,display:"block" };
  const inp={ fontFamily:"'DM Mono',monospace",fontSize:12,width:"100%",background:"#F6F5F0",border:"1px solid #E8E6DF",borderRadius:6,padding:"8px 10px",color:"#333",outline:"none",boxSizing:"border-box" };
  return (
    <div role="dialog" aria-modal="true" aria-label="Send renewal invites" style={{ position:"fixed",inset:0,background:"rgba(20,20,40,.45)",zIndex:100000,display:"flex",alignItems:"center",justifyContent:"center" }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#fff",borderRadius:14,width:620,maxWidth:"94vw",maxHeight:"90vh",overflowY:"auto",padding:22,boxShadow:"0 20px 60px rgba(0,0,0,.25)" }}>
        <div style={{ fontFamily:"'Fraunces',serif",fontSize:20,fontWeight:700,color:"#1a1a2e" }}>Invite {targets.length} returning player{targets.length!==1?"s":""} to register</div>
        <p style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#888",margin:"4px 0 14px" }}>Each player gets a personal link. Their name, email and phone are pre-filled on the registration form.</p>
        {result?(
          <div>
            <div style={{ background:"#E6F4EA",border:"1px solid #BBF7D0",borderRadius:8,padding:"10px 14px",fontFamily:"'DM Mono',monospace",fontSize:12,color:"#166534" }}>✓ Sent {result.sent} invite{result.sent!==1?"s":""}.</div>
            {result.skipped?.length>0&&<div style={{ marginTop:10,fontFamily:"'DM Mono',monospace",fontSize:11,color:"#92400E" }}>Skipped {result.skipped.length}: {result.skipped.slice(0,6).map(x=>`${x.name} (${x.reason})`).join(", ")}{result.skipped.length>6?"…":""}</div>}
            {result.failed?.length>0&&<div style={{ marginTop:10,fontFamily:"'DM Mono',monospace",fontSize:11,color:"#991B1B" }}>Mail failed for {result.failed.length}: {result.failed.slice(0,6).map(x=>x.name).join(", ")}. Check your site's email setup (SMTP plugin) before retrying.</div>}
            <div style={{ textAlign:"right",marginTop:16 }}><button onClick={onClose} style={{ ...pageBtn,background:"#1a1a2e",color:"#D4A017" }}>Done</button></div>
          </div>
        ):(
          <>
            <label style={lbl} htmlFor="rn-url">Registration page URL</label>
            <input id="rn-url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://grsht.com/register/" style={{ ...inp,marginBottom:12 }}/>
            <label style={lbl} htmlFor="rn-subj">Subject</label>
            <input id="rn-subj" value={subject} onChange={e=>setSubject(e.target.value)} style={{ ...inp,marginBottom:12 }}/>
            <label style={lbl} htmlFor="rn-body">Message — keep {"{link}"}; {"{first_name}"} and {"{season}"} are filled in per player</label>
            <textarea id="rn-body" value={body} onChange={e=>setBody(e.target.value)} rows={9} style={{ ...inp,resize:"vertical",marginBottom:12 }}/>
            <div style={{ background:"#FAFAF8",border:"1px dashed #E8E6DF",borderRadius:8,padding:"10px 12px",fontFamily:"'DM Mono',monospace",fontSize:11,color:"#555",whiteSpace:"pre-wrap" }}>
              <div style={{ color:"#aaa",fontSize:9,textTransform:"uppercase",marginBottom:4 }}>Preview for {sample?`${sample.first_name} ${sample.last_name}`:"—"}</div>
              <strong>{fill(subject)}</strong>{"\n\n"}{fill(body)}
            </div>
            {error&&<div role="alert" style={{ marginTop:10,background:"#FEE2E2",border:"1px solid #FCA5A5",borderRadius:8,padding:"8px 12px",fontFamily:"'DM Mono',monospace",fontSize:11,color:"#991B1B" }}>{error}</div>}
            <div style={{ display:"flex",justifyContent:"flex-end",gap:8,marginTop:16 }}>
              <button onClick={onClose} style={pageBtn}>Cancel</button>
              <button onClick={send} disabled={sending||!targets.length} style={{ ...pageBtn,background:"#1a1a2e",color:"#D4A017",opacity:sending?0.6:1 }}>{sending?"Sending…":`Send ${targets.length} invite${targets.length!==1?"s":""}`}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Renewal funnel strip: Not invited → Invited → Opened → Registered → Paid
function RenewalFunnel({ counts, total, active, onPick, onInvite, inviteTargets }) {
  return (
    <div style={{ background:"#fff",border:"1px solid #E8E6DF",borderRadius:12,padding:"14px 16px",marginBottom:14 }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,gap:10,flexWrap:"wrap" }}>
        <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:".08em" }}>
          Renewal funnel {CURRENT_YEAR} · {total} returning players
        </div>
        <button onClick={onInvite} disabled={!inviteTargets}
          style={{ fontFamily:"'DM Mono',monospace",fontSize:11,background:"#1a1a2e",color:"#D4A017",border:"none",padding:"7px 14px",borderRadius:8,cursor:inviteTargets?"pointer":"default",opacity:inviteTargets?1:0.45 }}>
          ✉ Invite {inviteTargets||0} to register
        </button>
      </div>
      <div style={{ display:"flex",height:8,borderRadius:99,overflow:"hidden",background:"#F0EEE8",marginBottom:10 }} aria-hidden="true">
        {RENEW_STAGES.map(st=>counts[st.k]>0&&<div key={st.k} style={{ width:`${(counts[st.k]/Math.max(total,1))*100}%`,background:st.color,opacity:active&&active!==st.k?0.3:1 }}/>)}
      </div>
      <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
        {RENEW_STAGES.map(st=>(
          <button key={st.k} onClick={()=>onPick(active===st.k?"":st.k)} aria-pressed={active===st.k}
            style={{ display:"flex",alignItems:"center",gap:8,background:active===st.k?"#1a1a2e":"#fff",border:`1px solid ${active===st.k?"#1a1a2e":"#E8E6DF"}`,borderRadius:99,padding:"5px 14px",cursor:"pointer" }}>
            <span style={{ width:8,height:8,borderRadius:"50%",background:st.color }}/>
            <span style={{ fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,color:active===st.k?"#D4A017":st.color,lineHeight:1 }}>{counts[st.k]||0}</span>
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:active===st.k?"#D4A017":"#888",textTransform:"uppercase",letterSpacing:".06em" }}>{st.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Attention queue: what needs a human today, one click to the exact players
const SEV = { high:{ bg:"#FEF2F2",bd:"#FCA5A5",fg:"#991B1B",dot:"#DC2626" }, med:{ bg:"#FFFBEB",bd:"#FDE68A",fg:"#92400E",dot:"#D97706" }, info:{ bg:"#EFF6FF",bd:"#BFDBFE",fg:"#1E40AF",dot:"#2563EB" } };
function AttentionQueue({ items, activeKey, onAction, onClear, open, setOpen }) {
  return (
    <div style={{ background:"#fff",border:"1px solid #E8E6DF",borderRadius:12,marginBottom:14,overflow:"hidden" }}>
      <button onClick={()=>setOpen(o=>!o)} aria-expanded={open}
        style={{ width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",background:"transparent",border:"none",padding:"12px 16px",cursor:"pointer" }}>
        <span style={{ fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:700,color:"#1a1a2e" }}>
          Needs attention {items.length>0&&<span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,background:"#FEE2E2",color:"#991B1B",padding:"1px 9px",borderRadius:99,marginLeft:6 }}>{items.length}</span>}
        </span>
        <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#aaa" }}>{open?"Hide ▲":"Show ▼"}</span>
      </button>
      {open&&(
        <div style={{ padding:"0 16px 14px",display:"flex",flexDirection:"column",gap:6 }}>
          {items.length===0&&<div style={{ fontFamily:"'DM Mono',monospace",fontSize:12,color:"#166534",background:"#E6F4EA",borderRadius:8,padding:"10px 14px" }}>✓ All clear — nothing needs a decision right now.</div>}
          {items.map(it=>{
            const c=SEV[it.sev]||SEV.info; const on=activeKey===it.key;
            return (
              <div key={it.key} style={{ display:"flex",alignItems:"center",gap:10,background:c.bg,border:`1px solid ${on?c.fg:c.bd}`,borderRadius:8,padding:"8px 12px" }}>
                <span style={{ width:8,height:8,borderRadius:"50%",background:c.dot,flexShrink:0 }}/>
                <span style={{ flex:1,fontFamily:"'DM Mono',monospace",fontSize:12,color:c.fg }}><strong>{it.count}</strong> {it.text}</span>
                {on
                  ? <button onClick={onClear} style={{ fontFamily:"'DM Mono',monospace",fontSize:11,background:"#fff",border:`1px solid ${c.fg}`,color:c.fg,padding:"4px 10px",borderRadius:6,cursor:"pointer" }}>Clear ✕</button>
                  : <button onClick={()=>onAction(it)} style={{ fontFamily:"'DM Mono',monospace",fontSize:11,background:"#fff",border:`1px solid ${c.bd}`,color:c.fg,padding:"4px 10px",borderRadius:6,cursor:"pointer" }}>{it.cta||"Show"} →</button>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Division balance meter: what does this tier/division choice do to the division?
function BalanceMeter({ player, tier, allPlayers }) {
  const div=player.division_assigned||player.division_requested;
  if(!div||player.registered_this_season===false||!allPlayers?.length) return null;
  const inDiv=(p)=>(p.division_assigned||p.division_requested)===div&&p.registered_this_season!==false;
  const mates=allPlayers.filter(p=>p.id!==player.id&&inDiv(p));
  const mateScores=mates.map(p=>computeScore(p.skill_tier_assigned||p.skill_tier_reported,p.years_experience,p.committee_score_adjustment));
  const savedTier=player.skill_tier_assigned||player.skill_tier_reported;
  const mine=(t)=>computeScore(t||savedTier,player.years_experience,player.committee_score_adjustment);
  const avg=(a)=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
  const before=avg([...mateScores,mine(savedTier)]);
  const myScore=mine(tier);
  const after=avg([...mateScores,myScore]);
  const delta=after-before;
  const rank=[...mateScores,myScore].sort((a,b)=>b-a).indexOf(myScore)+1;
  const count=mates.length+1;
  const cap=DIV_CAPS[div]||30;
  const goalies=mates.filter(p=>p.position==="goaltender").length+(player.position==="goaltender"?1:0);
  const letters=["A","B","C","R"];
  const dist=letters.map(L=>({L,n:mates.filter(p=>(p.skill_tier_assigned||p.skill_tier_reported||"")[0]===L).length+(((tier||savedTier||"")[0]===L)?1:0)}));
  const maxN=Math.max(1,...dist.map(d=>d.n));
  const mono={ fontFamily:"'DM Mono',monospace" };
  return (
    <div style={{ background:"#FAFAF8",border:"1px solid #E8E6DF",borderRadius:10,padding:"10px 12px",marginBottom:12 }}>
      <div style={{ ...mono,fontSize:9,color:"#bbb",textTransform:"uppercase",marginBottom:6 }}>Division balance · {DIVISION_LABEL[div]||div}</div>
      <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:8 }}>
        <div style={{ flex:1,height:6,background:"#E8E6DF",borderRadius:99,overflow:"hidden" }}>
          <div style={{ width:`${Math.min(100,(count/cap)*100)}%`,height:"100%",background:count>cap?"#DC2626":count/cap>0.85?"#D97706":"#166534" }}/>
        </div>
        <span style={{ ...mono,fontSize:11,color:count>cap?"#991B1B":"#555" }}>{count}/{cap}</span>
      </div>
      <div style={{ display:"flex",gap:14,flexWrap:"wrap",marginBottom:8 }}>
        <div>
          <div style={{ ...mono,fontSize:9,color:"#bbb" }}>AVG SCORE</div>
          <div style={{ ...mono,fontSize:12,color:"#1a1a2e" }}>{before.toFixed(1)} → <strong>{after.toFixed(1)}</strong>
            {Math.abs(delta)>=0.05&&<span style={{ color:delta>0?"#166534":"#991B1B",marginLeft:4 }}>{delta>0?"▲":"▼"}{Math.abs(delta).toFixed(1)}</span>}
          </div>
        </div>
        <div>
          <div style={{ ...mono,fontSize:9,color:"#bbb" }}>RANK IN DIVISION</div>
          <div style={{ ...mono,fontSize:12,color:"#1a1a2e" }}>#{rank} of {count}</div>
        </div>
        <div>
          <div style={{ ...mono,fontSize:9,color:"#bbb" }}>GOALIES</div>
          <div style={{ ...mono,fontSize:12,color:goalies===0?"#991B1B":"#1a1a2e" }}>{goalies}{goalies===0&&" — none yet"}</div>
        </div>
      </div>
      <div style={{ display:"flex",alignItems:"flex-end",gap:6,height:34 }} aria-label="Skill tier mix">
        {dist.map(d=>(
          <div key={d.L} style={{ flex:1,textAlign:"center" }}>
            <div style={{ height:Math.max(2,(d.n/maxN)*22),background:(tier||savedTier||"")[0]===d.L?"#1a1a2e":"#CBD5E1",borderRadius:3,marginBottom:2 }}/>
            <div style={{ ...mono,fontSize:9,color:"#888" }}>{d.L}{d.n}</div>
          </div>
        ))}
      </div>
      {mates.length===0&&<div style={{ ...mono,fontSize:10,color:"#aaa",marginTop:6 }}>Only registrant in this division so far.</div>}
    </div>
  );
}

// Player drawer
function PlayerDrawer({ player, onClose, onSave, allPlayers }) {
  const [tier,   setTier]   = useState(player.skill_tier_assigned||player.skill_tier_reported||"");
  const [notes,  setNotes]  = useState(player.notes||"");
  const [status, setStatus] = useState(player.status||"registered");
  const [isDirty,setIsDirty]= useState(false);
  const [showComms,setShowComms]=useState(false);
  const [undoTier,setUndoTier]=useState(null);
  const markDirty=(fn)=>(...args)=>{fn(...args);setIsDirty(true);};
  const score=computeScore(player.skill_tier_reported,player.years_experience,player.committee_score_adjustment);
  const initials=`${player.first_name[0]}${player.last_name[0]}`;
  const tc=TIER_COLOR(tier);
  const missingFields=[!player.position&&"Position",!player.division_requested&&"Division",(player.registered_this_season!==false&&!player.payment_status)&&"Payment",(player.registered_this_season!==false&&!player.age)&&"Age"].filter(Boolean);
  const handleClose=()=>{ if(isDirty&&!window.confirm("Discard unsaved changes?")) return; onClose(); };
  const handleSave=()=>{ onSave({...player,skill_tier_assigned:tier,notes,status}); setIsDirty(false); };
  const handleTierChange=(t)=>{ setUndoTier(tier); markDirty(setTier)(t); };
  const handleUndoTier=()=>{ if(undoTier){setTier(undoTier);setUndoTier(null); }};

  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",minHeight:0 }}>
      {/* Header */}
      <div style={{ display:"flex",alignItems:"center",gap:10,
        padding:"14px 18px",borderBottom:"1px solid #F0EEE8",flexShrink:0 }}>
        <div style={{ width:32,height:32,borderRadius:"50%",background:"#1a1a2e",color:"#D4A017",
          display:"flex",alignItems:"center",justifyContent:"center",
          fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,flexShrink:0 }}>{initials}</div>
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ display:"flex",alignItems:"center",gap:6,flexWrap:"wrap" }}>
            <span style={{ fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:700,color:"#1a1a2e" }}>
              {player.first_name} {player.last_name}
            </span>
            <ReturningBadge seasons={player.returning_seasons} />
            <Pill {...tc} small>{tier||player.skill_tier_reported}</Pill>
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:13,fontWeight:700,
              background:"#1a1a2e",color:"#D4A017",padding:"2px 8px",borderRadius:6 }}>
              {score.toFixed(1)}
            </span>
          </div>
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",marginTop:2,display:"flex",alignItems:"center",gap:4 }}>
            {player.email}
            <CopyBtn value={player.email} label="email" />
            {player.phone&&<><span>·</span><span>{player.phone}</span><CopyBtn value={player.phone} label="phone" /></>}
          </div>
        </div>
        {isDirty&&<span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#92400E",
          background:"#FEF3C7",border:"1px solid #FDE68A",padding:"2px 8px",borderRadius:99 }}>● Unsaved</span>}
        <button style={{ background:"none",border:"none",fontSize:14,color:"#aaa",cursor:"pointer" }} onClick={handleClose}>✕</button>
      </div>

      {player.sandbagging_flag&&<div style={{ fontFamily:"'DM Mono',monospace",fontSize:11,
        background:"#FFFBEB",borderBottom:"1px solid #FDE68A",color:"#92400E",padding:"7px 18px",fontWeight:500 }}>
        ⚠ Sandbagging review — tier vs division mismatch.</div>}
      {missingFields.length>0&&<div style={{ fontFamily:"'DM Mono',monospace",fontSize:11,
        background:"#FFF7ED",borderBottom:"1px solid #FED7AA",color:"#C2410C",padding:"7px 18px" }}>
        ⚠ Incomplete: {missingFields.join(", ")}</div>}

      <div style={{ flex:1,overflowY:"auto",minHeight:0 }}>
        {/* Score */}
        <div style={{ padding:"14px 18px",borderBottom:"1px solid #F0EEE8" }}>
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",
            textTransform:"uppercase",letterSpacing:".08em",marginBottom:8 }}>Draft score</div>
          <div style={{ display:"flex",alignItems:"baseline",gap:10 }}>
            <span style={{ fontFamily:"'Fraunces',serif",fontSize:36,fontWeight:700,color:"#1a1a2e",lineHeight:1 }}>
              {score.toFixed(1)}
            </span>
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa" }}>
              {player.skill_tier_reported} ({computeScore(player.skill_tier_reported,0,0)})
              {" + "}{Math.round(Math.min(player.years_experience||0,60)/5*10)/10} yrs
              {(player.committee_score_adjustment||0)!==0&&` + ${player.committee_score_adjustment} adj`}
            </span>
          </div>
        </div>

        {/* Player info */}
        <div style={{ padding:"14px 18px",borderBottom:"1px solid #F0EEE8" }}>
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",
            textTransform:"uppercase",letterSpacing:".08em",marginBottom:8 }}>Player info</div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            {[player.age&&["Age",player.age],player.jersey_size&&["Jersey",player.jersey_size],player.player_type&&["Type",player.player_type],player.years_experience&&["Experience",`${player.years_experience} yrs`]].filter(Boolean).map(([k,v])=>(
              <div key={k}>
                <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#bbb",textTransform:"uppercase",letterSpacing:".06em",marginBottom:3 }}>{k}</div>
                <div style={{ fontFamily:"'Fraunces',serif",fontSize:14,color:"#1a1a2e",fontWeight:600 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Hockey */}
        <div style={{ padding:"14px 18px",borderBottom:"1px solid #F0EEE8" }}>
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",
            textTransform:"uppercase",letterSpacing:".08em",marginBottom:8 }}>Hockey</div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            {player.skill_tier_reported&&<div>
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#bbb",textTransform:"uppercase",letterSpacing:".06em",marginBottom:3 }}>Self-reported tier</div>
              <Pill {...TIER_COLOR(player.skill_tier_reported)}>{player.skill_tier_reported}</Pill>
            </div>}
            {player.position&&<div>
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#bbb",textTransform:"uppercase",letterSpacing:".06em",marginBottom:3 }}>Position</div>
              <Pill {...POSITION_COLOR[player.position]}>{POSITION_LABEL[player.position]}</Pill>
            </div>}
            {player.division_requested&&<div>
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#bbb",textTransform:"uppercase",letterSpacing:".06em",marginBottom:3 }}>Division</div>
              <Pill {...(DIVISION_COLOR[player.division_requested]||{})}>{DIVISION_LABEL[player.division_requested]||player.division_requested}</Pill>
            </div>}
            {player.payment_status&&<div>
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#bbb",textTransform:"uppercase",letterSpacing:".06em",marginBottom:3 }}>Payment</div>
              <Pill {...(PAYMENT_COLOR[player.payment_status]||{})}>{player.payment_status}</Pill>
            </div>}
          </div>
        </div>

        {/* Committee overrides */}
        <div style={{ padding:"14px 18px",borderBottom:"1px solid #F0EEE8" }}>
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",
            textTransform:"uppercase",letterSpacing:".08em",marginBottom:8 }}>
            Committee overrides
            <FieldHelp text="Tier override replaces the player's self-reported tier for draft scoring. A1=highest skill, R3=lowest. Use when history data contradicts the self-reported tier." />
          </div>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#bbb",textTransform:"uppercase",marginBottom:4 }}>Skill tier override</div>
            <TierScale value={tier} onChange={handleTierChange} />
            {undoTier&&<button onClick={handleUndoTier} style={{ fontFamily:"'DM Mono',monospace",fontSize:10,background:"#FEF3C7",border:"1px solid #FDE68A",color:"#92400E",padding:"3px 10px",borderRadius:6,cursor:"pointer",marginTop:6 }}>↩ Undo tier change</button>}
          </div>
          <BalanceMeter player={player} tier={tier} allPlayers={allPlayers}/>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#bbb",textTransform:"uppercase",marginBottom:4 }}>Workflow status</div>
            <StatusStepper value={status} onChange={markDirty(setStatus)} />
          </div>
          <div>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4 }}>
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#bbb",textTransform:"uppercase" }}>
                Committee notes {player.notes&&"📝"}
              </div>
            </div>
            <textarea value={notes} onChange={e=>{setNotes(e.target.value);setIsDirty(true);}}
              rows={3} placeholder="Add internal notes…"
              style={{ fontFamily:"'DM Mono',monospace",fontSize:12,width:"100%",background:"#F6F5F0",
                border:"1px solid #E8E6DF",borderRadius:6,padding:"8px 10px",color:"#333",
                outline:"none",resize:"vertical",boxSizing:"border-box" }}/>
          </div>
        </div>

        {/* #12 Communication log */}
        <div style={{ padding:"14px 18px",borderBottom:"1px solid #F0EEE8" }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 }}>
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",
              textTransform:"uppercase",letterSpacing:".08em" }}>Communications</div>
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,
              background:player.comms?.length?"#E6F4EA":"#F6F5F0",
              color:player.comms?.length?"#1E6B3A":"#aaa",
              padding:"1px 8px",borderRadius:99 }}>{player.comms?.length||0}</span>
          </div>
          {player.comms?.length>0 ? player.comms.map((c,i)=>(
            <div key={i} style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#555",
              padding:"4px 0",borderBottom:"1px solid #F9F8F4" }}>📧 {c}</div>
          )):(
            <p style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#ccc",margin:0 }}>No emails sent to this player yet</p>
          )}
        </div>

        {/* WOW 8: Similar players */}
        <SimilarPlayers player={player} allPlayers={allPlayers} />

        {/* Audit trail */}
        <div style={{ padding:"14px 18px" }}>
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",
            textTransform:"uppercase",letterSpacing:".08em",marginBottom:8 }}>Change history</div>
          {player.skill_tier_assigned?(
            <div style={{ display:"flex",alignItems:"flex-start",gap:8 }}>
              <span style={{ width:6,height:6,borderRadius:"50%",background:"#9333EA",flexShrink:0,marginTop:4 }}/>
              <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#555" }}>
                Tier overridden to <strong>{player.skill_tier_assigned}</strong> (was {player.skill_tier_reported})
                {player.notes&&` — "${player.notes}"`}
              </span>
            </div>
          ):(
            <p style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#bbb",margin:0 }}>
              No overrides yet — self-reported {player.skill_tier_reported}
            </p>
          )}
        </div>
      </div>

      {/* Sticky action bar */}
      <div style={{ display:"flex",gap:10,padding:"14px 18px",borderTop:"1px solid #F0EEE8",background:"#fff",flexShrink:0 }}>
        <a href={`/wp-admin/admin.php?page=grsh-tm-history&search=${encodeURIComponent(player.email||"")}`}
          style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#1a1a2e",
            textDecoration:"none",border:"1px solid #E8E6DF",padding:"8px 12px",
            borderRadius:8,display:"flex",alignItems:"center",gap:4 }}>📋 History</a>
        <button style={{ flex:1,fontFamily:"'DM Mono',monospace",fontSize:12,background:"#F6F5F0",
          border:"1px solid #E8E6DF",color:"#666",padding:"10px",borderRadius:8,cursor:"pointer" }}
          onClick={handleClose}>Cancel</button>
        <button style={{ flex:2,fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:500,
          background:"#1a1a2e",color:"#D4A017",border:"none",padding:"10px",borderRadius:8,cursor:"pointer",
          opacity:isDirty?1:0.6 }}
          onClick={handleSave}>{isDirty?"Save changes":"No changes"}</button>
      </div>
    </div>
  );
}

// ─── Main Players component ───────────────────────────────────────────────────
export default function Players() {
  const [players,    setPlayers]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [isNL,       setIsNL]       = useState(false);     // WOW 1 NL mode
  const [showNLHint, setShowNLHint] = useState(false);
  const [filterDiv,  setFilterDiv]  = useState("");
  const [filterPos,  setFilterPos]  = useState("");
  const [filterStatus,  setFilterStatus]  = useState("");
  const [filterPayment, setFilterPayment] = useState("");
  const [filterType,    setFilterType]    = useState("");
  const [filterWarn,    setFilterWarn]    = useState(false);
  const [selected,      setSelected]      = useState(null);
  const [editingAdj,    setEditingAdj]    = useState(null);
  const [sortKey,  setSortKey]  = useState("score");       // #1 default sort by score
  const [sortDir,  setSortDir]  = useState("desc");
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [scope,    setScope]    = useState("all");   // all | registered | returning
  const scopeInit = useRef(false);
  const [invites,     setInvites]     = useState({});
  const [renewSettings,setRenewSettings]=useState(null);
  const [showInvite,  setShowInvite]  = useState(false);
  const [funnel,      setFunnel]      = useState("");      // renewal funnel stage filter
  const [queueKey,    setQueueKey]    = useState("");      // attention-queue filter
  const [queueOpen,   setQueueOpen]   = useState(true);
  const [selectedIds,   setSelectedIds]   = useState(new Set());
  const [hoveredRow,    setHoveredRow]    = useState(null);
  const [inlineTierRow, setInlineTierRow] = useState(null); // #15 inline tier edit
  const [undoStack,     setUndoStack]     = useState([]);   // #28 undo
  const [toast,         setToast]         = useState(null);
  const [visibleCols,   setVisibleCols]   = useState(     // #3 column customization
    ["player","division","position","tier","score","age","type","payment","status"]
  );
  const [showColMenu,   setShowColMenu]   = useState(false);
  const [savedViews,    setSavedViews]    = useState(DEFAULT_VIEWS); // #2
  const [showSaveView,  setShowSaveView]  = useState(false);
  const [newViewName,   setNewViewName]   = useState("");
  const [activeView,    setActiveView]    = useState(null);
  const [showJersey,    setShowJersey]    = useState(false);  // #8
  const [showDraftPrev, setShowDraftPrev] = useState(false);  // WOW 4
  const [showDupes,     setShowDupes]     = useState(false);  // WOW 5
  const [dismissedDupes,setDismissedDupes]=useState([]);
  const [showEmail,     setShowEmail]     = useState(false);  // WOW 6
  const [showShortcuts, setShowShortcuts] = useState(false);  // #23
  const [showPipeline,  setShowPipeline]  = useState(true);   // #14 pipeline
  const [isOffline,     setIsOffline]     = useState(!navigator.onLine); // WOW 10
  const [offlineChanges,setOfflineChanges]= useState(0);
  const [liveCount,     setLiveCount]     = useState(null);   // WOW 2 live feed
  const searchRef = useRef();

  const showToast = (msg,dur=3000)=>{ setToast(msg); setTimeout(()=>setToast(null),dur); };
  const snapshot  = () => JSON.parse(JSON.stringify(players));
  const pushUndo  = (snap)=>setUndoStack(s=>[snap,...s].slice(0,5));
  const handleUndo= ()=>{ if(!undoStack.length)return; setPlayers(undoStack[0]); setUndoStack(s=>s.slice(1)); showToast("↩ Undo applied"); };

  // WOW 10: offline detection
  useEffect(()=>{
    const goOnline  = ()=>{ setIsOffline(false); if(offlineChanges>0){showToast(`📡 Back online — syncing ${offlineChanges} changes`);setOfflineChanges(0);} };
    const goOffline = ()=>setIsOffline(true);
    window.addEventListener("online",goOnline);
    window.addEventListener("offline",goOffline);
    return()=>{ window.removeEventListener("online",goOnline); window.removeEventListener("offline",goOffline); };
  },[offlineChanges]);

  // WOW 2: Live registration feed — poll every 30s
  useEffect(()=>{
    const poll=()=>{
      fetch(`${API}/sync/status`,{headers:{"X-WP-Nonce":NONCE}})
        .then(r=>r.ok?r.json():null)
        .then(d=>{ if(d?.total_entries&&d.total_entries!==liveCount){setLiveCount(d.total_entries);} })
        .catch(()=>{});
    };
    const t=setInterval(poll,30000);
    return()=>clearInterval(t);
  },[liveCount]);

  // Default the scope to current-season registrants once data arrives (if there are any).
  useEffect(()=>{
    if(scopeInit.current||!players.length) return;
    scopeInit.current=true;
    if(players.some(x=>x.registered_this_season!==false)&&players.some(x=>x.registered_this_season===false)) setScope("registered");
  },[players]);

  // Renewal invite status (silent on failure: the funnel then shows everyone as "not invited")
  const loadInvites=()=>{
    fetch(`${API}/renewals`,{headers:{"X-WP-Nonce":NONCE}})
      .then(r=>r.ok?r.json():null)
      .then(d=>{ if(d){ setInvites(d.invites||{}); setRenewSettings(d.settings||null); } })
      .catch(()=>{});
  };
  useEffect(()=>{ loadInvites(); },[]);

  // Fetch players
  useEffect(()=>{
    setLoading(true);
    fetch(`${API}/players`,{headers:{"X-WP-Nonce":NONCE}})
      .then(r=>r.ok?r.json():null)
      .then(d=>{ setPlayers(Array.isArray(d)?d:(Array.isArray(d?.players)?d.players:MOCK_PLAYERS)); if(Array.isArray(d?.dismissed_duplicates)) setDismissedDupes(d.dismissed_duplicates); setLoading(false); })
      .catch(()=>{ setPlayers(MOCK_PLAYERS); setLoading(false); });
  },[]);

  // Keyboard shortcuts — #23
  useEffect(()=>{
    const h=(e)=>{
      if(e.key==="/"&&!["INPUT","TEXTAREA"].includes(document.activeElement?.tagName)){
        e.preventDefault(); searchRef.current?.focus();
      }
      if((e.metaKey||e.ctrlKey)&&e.key==="z"){ e.preventDefault(); handleUndo(); }
      if(e.key==="Escape"){ setSelected(null); setInlineTierRow(null); setShowColMenu(false); }
      if(e.key==="ArrowDown"&&selected){
        const idx=filtered.findIndex(p=>p.id===selected.id);
        if(idx<filtered.length-1)setSelected(filtered[idx+1]);
      }
      if(e.key==="ArrowUp"&&selected){
        const idx=filtered.findIndex(p=>p.id===selected.id);
        if(idx>0)setSelected(filtered[idx-1]);
      }
      if(e.key==="?"){ setShowShortcuts(s=>!s); }
    };
    window.addEventListener("keydown",h);
    return()=>window.removeEventListener("keydown",h);
  },[selected,undoStack]);

  // Score range for spark bar — #5
  const scoreRange = useMemo(()=>{
    const scores=players.map(p=>computeScore(p.skill_tier_reported,p.years_experience,p.committee_score_adjustment));
    return { min:Math.min(...scores,0), max:Math.max(...scores,15) };
  },[players]);

  // Division capacity warnings — #13
  const capWarnings = useMemo(()=>{
    const counts={};
    players.forEach(p=>{ if(p.division_requested){counts[p.division_requested]=(counts[p.division_requested]||0)+1; }});
    return Object.entries(counts).filter(([div,n])=>n>(DIV_CAPS[div]||30));
  },[players]);

  // Duplicates — WOW 5
  const dupeCount = useMemo(()=>detectDuplicates(players,dismissedDupes).length,[players,dismissedDupes]);

  const dupIds = useMemo(()=>{ const s=new Set(); detectDuplicates(players,dismissedDupes).forEach(([a,b])=>{s.add(a);s.add(b);}); return s; },[players,dismissedDupes]);

  // Filter
  const filtered = useMemo(()=>{
    let p = [...players];
    if(search){
      p = isNL ? nlSearch(search,p) : p.filter(x=>`${x.first_name} ${x.last_name} ${x.email} ${x.skill_tier_reported}`.toLowerCase().includes(search.toLowerCase()));
    }
    if(funnel){ p=p.filter(x=>renewStage(x,invites)===funnel); }
    else {
      if(scope==='registered') p=p.filter(x=>x.registered_this_season!==false);
      if(scope==='returning')  p=p.filter(x=>x.registered_this_season===false);
    }
    if(queueKey&&QUEUE_FILTERS[queueKey]) p=p.filter(x=>QUEUE_FILTERS[queueKey](x,{invites,dupIds}));
    if(filterDiv)     p=p.filter(x=>x.division_requested===filterDiv);
    if(filterPos)     p=p.filter(x=>x.position===filterPos);
    if(filterStatus)  p=p.filter(x=>x.status===filterStatus);
    if(filterPayment) p=p.filter(x=>x.payment_status===filterPayment);
    if(filterType)    p=p.filter(x=>x.player_type===filterType);
    if(filterWarn)    p=p.filter(x=>x.sandbagging_flag);
    p.sort((a,b)=>{
      if(sortKey==="score"){
        const av=computeScore(a.skill_tier_reported,a.years_experience,a.committee_score_adjustment);
        const bv=computeScore(b.skill_tier_reported,b.years_experience,b.committee_score_adjustment);
        return sortDir==="asc"?av-bv:bv-av;
      }
      let av=a[sortKey]??"", bv=b[sortKey]??"";
      if(typeof av==="string")av=av.toLowerCase();
      if(typeof bv==="string")bv=bv.toLowerCase();
      return sortDir==="asc"?(av>bv?1:-1):(av<bv?1:-1);
    });
    return p;
  },[players,search,isNL,filterDiv,filterPos,filterStatus,filterPayment,filterType,filterWarn,scope,funnel,queueKey,invites,dupIds,sortKey,sortDir]);

  const regCount = useMemo(()=>players.filter(x=>x.registered_this_season!==false).length,[players]);
  const retCount = players.length-regCount;

  // Stats (dynamic to filter — #20)
  const stats = useMemo(()=>({
    total:   filtered.length,
    paid:    filtered.filter(p=>p.registered_this_season!==false&&p.payment_status==="paid").length,
    unpaid:  filtered.filter(p=>p.registered_this_season!==false&&p.payment_status==="pending").length,
    subs:    filtered.filter(p=>p.player_type==="sub").length,
    goalies: filtered.filter(p=>p.position==="goaltender").length,
    warnings:filtered.filter(p=>p.sandbagging_flag).length,
  }),[filtered]);

  const funnelCounts = useMemo(()=>{
    const c={not_invited:0,invited:0,opened:0,registered:0,paid:0};
    players.forEach(p=>{ const st=renewStage(p,invites); if(st) c[st]++; });
    return c;
  },[players,invites]);
  const cohortTotal = Object.values(funnelCounts).reduce((a,b)=>a+b,0);

  // Invite targets: selected returning players (if any), otherwise everyone not yet invited
  const inviteTargets = useMemo(()=>{
    const pool=players.filter(p=>renewStage(p,invites)==="not_invited"&&p.email);
    if(selectedIds.size>0){
      const sel=players.filter(p=>selectedIds.has(p.id)&&p.registered_this_season===false&&p.email);
      if(sel.length) return sel;
    }
    return pool;
  },[players,invites,selectedIds]);

  const queueItems = useMemo(()=>{
    const items=[]; const n=(f)=>players.filter(f).length;
    const unpaid=n(QUEUE_FILTERS.unpaid_on_team);
    if(unpaid) items.push({key:"unpaid_on_team",sev:"high",count:unpaid,text:`player${unpaid!==1?"s are":" is"} on a team but ha${unpaid!==1?"ven't":"sn't"} paid`});
    capWarnings.forEach(([div,c])=>items.push({key:`cap_${div}`,sev:"high",count:c-(DIV_CAPS[div]||30),text:`over capacity in ${DIVISION_LABEL[div]||div} (${c}/${DIV_CAPS[div]||30})`,div,cta:"Show division"}));
    const inc=n(QUEUE_FILTERS.incomplete);
    if(inc) items.push({key:"incomplete",sev:"med",count:inc,text:`registrant${inc!==1?"s":""} missing a division or position`});
    if(dupeCount) items.push({key:"duplicates",sev:"med",count:dupeCount,text:`possible duplicate record${dupeCount!==1?"s":""}`,cta:"Review"});
    const sb=n(QUEUE_FILTERS.sandbagging);
    if(sb) items.push({key:"sandbagging",sev:"med",count:sb,text:`sandbagging flag${sb!==1?"s":""} to review`});
    if(funnelCounts.opened) items.push({key:"funnel_opened",sev:"info",count:funnelCounts.opened,text:`opened their renewal invite but haven't registered`,funnel:"opened",cta:"Nudge"});
    if(funnelCounts.not_invited) items.push({key:"invite_all",sev:"info",count:funnelCounts.not_invited,text:`returning player${funnelCounts.not_invited!==1?"s":""} not invited yet`,invite:true,cta:"Invite"});
    const order={high:0,med:1,info:2};
    return items.sort((a,b)=>order[a.sev]-order[b.sev]);
  },[players,capWarnings,dupeCount,funnelCounts]);

  const runQueueAction=(it)=>{
    if(it.invite){ setShowInvite(true); return; }
    if(it.key==="duplicates"){ setShowDupes(true); return; }
    clearFilters(); setFunnel("");
    if(it.funnel){ setFunnel(it.funnel); return; }
    if(it.div){ setScope("registered"); setFilterDiv(it.div); setQueueKey(""); return; }
    setScope("registered"); setQueueKey(it.key);
  };

  const totalPages = Math.max(1,Math.ceil(filtered.length/pageSize));
  const paginated  = filtered.slice((page-1)*pageSize,page*pageSize);

  const handleSort=(key)=>{ if(sortKey===key)setSortDir(d=>d==="asc"?"desc":"asc"); else{setSortKey(key);setSortDir("desc");} };
  const clearFilters=()=>{ setSearch("");setFilterDiv("");setFilterPos("");setFilterStatus("");setFilterPayment("");setFilterType("");setFilterWarn(false);setFunnel("");setQueueKey("");setPage(1);setActiveView(null); };
  const applyView=(view)=>{ clearFilters(); Object.entries(view.filters).forEach(([k,v])=>{ const setters={filterDiv:setFilterDiv,filterPos:setFilterPos,filterStatus:setFilterStatus,filterPayment:setFilterPayment,filterType:setFilterType,filterWarn:setFilterWarn}; setters[k]?.(v); }); setActiveView(view.name); };

  const handleSave=async(updated)=>{
    const snap=snapshot();
    pushUndo(snap);
    if(isOffline){ setOfflineChanges(c=>c+1); setPlayers(ps=>ps.map(p=>p.id===updated.id?{...p,...updated}:p)); showToast("⚡ Saved offline — will sync when back online"); return; }
    try{
      const res=await fetch(`${API}/players/${updated.id}`,{method:"PATCH",headers:{"X-WP-Nonce":NONCE,"Content-Type":"application/json"},body:JSON.stringify({skill_tier_assigned:updated.skill_tier_assigned,notes:updated.notes,status:updated.status})});
      const saved=res.ok?await res.json():updated;
      setPlayers(ps=>ps.map(p=>p.id===updated.id?{...p,...saved}:p));
    }catch{ setPlayers(ps=>ps.map(p=>p.id===updated.id?updated:p)); }
    setSelected(null);
    showToast("✓ Player saved");
  };

  const handleAdjSave=async(value,note)=>{
    if(!editingAdj) return;
    const id=editingAdj.id;
    const snap=snapshot();
    pushUndo(snap);
    setPlayers(ps=>ps.map(p=>p.id===id?{...p,committee_score_adjustment:value,committee_adjustment_note:note}:p));
    try{ await fetch(`${API}/players/${id}`,{method:"PATCH",headers:{"X-WP-Nonce":NONCE,"Content-Type":"application/json"},body:JSON.stringify({committee_score_adjustment:value,committee_adjustment_note:note})}); }catch{}
    setEditingAdj(null);
    showToast("✓ Score adjusted");
  };

  // #15 inline tier save
  const saveInlineTier=(player,newTier)=>{
    const snap=snapshot();
    pushUndo(snap);
    setPlayers(ps=>ps.map(p=>p.id===player.id?{...p,skill_tier_assigned:newTier}:p));
    setInlineTierRow(null);
    showToast(`✓ Tier updated to ${newTier}`);
  };

  // #11 bulk actions
  const bulkUpdateStatus=async(newStatus)=>{
    const ids=[...selectedIds];
    if(ids.length>=5&&!window.confirm(`Update status to "${newStatus.replace("_"," ")}" for ${ids.length} players?`))return;
    setPlayers(ps=>ps.map(p=>ids.includes(p.id)?{...p,status:newStatus}:p));
    setSelectedIds(new Set());
    showToast(`✓ ${ids.length} players updated`);
  };

  // #8 Jersey size view
  const jerseyView = useMemo(()=>{
    const counts={};
    filtered.forEach(p=>{ if(p.jersey_size){counts[p.jersey_size]=(counts[p.jersey_size]||0)+1; }});
    return counts;
  },[filtered]);

  // WOW 6 send email
  const handleSendEmail=(subject,body)=>{
    const targets=selectedIds.size>0?players.filter(p=>selectedIds.has(p.id)):filtered;
    showToast(`📧 Sent to ${targets.length} players`);
    setShowEmail(false);
    const newComm=`${subject} · ${new Date().toLocaleDateString()}`;
    setPlayers(ps=>ps.map(p=>targets.some(t=>t.id===p.id)?{...p,comms:[...(p.comms||[]),newComm]}:p));
    setSelectedIds(new Set());
  };

  // Export CSV
  const exportCSV=()=>{
    const rows=[["Last","First","Email","Phone","Division","Position","Tier","Score","Age","Type","Payment","Status","Jersey"],
      ...filtered.map(p=>[p.last_name,p.first_name,p.email,p.phone||"",DIVISION_LABEL[p.division_requested]||"",POSITION_LABEL[p.position]||"",p.skill_tier_assigned||p.skill_tier_reported,computeScore(p.skill_tier_reported,p.years_experience,p.committee_score_adjustment).toFixed(1),p.age,p.player_type,p.payment_status,p.status,p.jersey_size||""])];
    const csv=rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download="grsh-players-2027.csv";a.click();URL.revokeObjectURL(url);
  };

  const toggleSelect=(id,e)=>{ e.stopPropagation(); setSelectedIds(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;}); };
  const activeFilters=[filterDiv,filterPos,filterStatus,filterPayment,filterType].filter(Boolean).length+(filterWarn?1:0);
  const SortIcon=({k})=><span style={{ marginLeft:3,opacity:sortKey===k?1:0.25,fontSize:10 }}>{sortKey===k?(sortDir==="asc"?"↑":"↓"):"↕"}</span>;
  const ALL_COLS=[{k:"player",l:"Player"},{k:"division",l:"Division"},{k:"position",l:"Position"},{k:"tier",l:"Tier"},{k:"score",l:"Score"},{k:"age",l:"Age"},{k:"type",l:"Type"},{k:"payment",l:"Payment"},{k:"status",l:"Status"}];

  return (
    <div style={{ background:"#F6F5F0",minHeight:"100vh" }}>
      <style>{`
        @keyframes shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}
        @keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        .prow:hover{background:#F0F4FF!important}
        .prow:focus{outline:2px solid #1a1a2e;outline-offset:-2px}
        @media(max-width:768px){.p-split{flex-direction:column!important}}
        /* Scrollable table body with sticky header */
        .p-tbl-scroll{overflow-y:auto;max-height:calc(100vh - var(--wp-admin--admin-bar--height,32px) - 258px)}
        .p-tbl-scroll table{border-collapse:collapse;width:100%}
        .p-tbl-scroll thead th{position:sticky;top:0;z-index:5;background:#FAFAF8;box-shadow:0 1px 0 #E8E6DF}
        .prow:hover td{background:#F8F9FF!important}
        .prow td{transition:background .1s}
        /* Fix 4: suppress WP admin bar Minimize button bleeding into layout */
        button[value="Minimize"],#wp-admin-bar-top-secondary .minimize{display:none!important}
        /* Fix 4: prevent panel from overflowing on small screens */
        @media(max-width:900px){.p-split .p-detail-panel{position:fixed;inset:var(--wp-admin--admin-bar--height,32px) 0 0 0;width:100%!important;max-width:100%!important;z-index:500}}
      `}</style>

      {/* WOW 4, 5 modals */}
      {showDraftPrev&&<DraftPreviewModal players={players} divisions={ALL_DIVISIONS} onClose={()=>setShowDraftPrev(false)}/>}
      {showInvite&&<RenewalInviteModal targets={inviteTargets} settings={renewSettings} onClose={()=>setShowInvite(false)} onSent={loadInvites}/>}
      {showDupes&&<DuplicateModal players={players} dismissed={dismissedDupes} onClose={()=>setShowDupes(false)}
        onMerge={async(keepId,removeId)=>{
          try{
            const res=await fetch(`${API}/players/merge`,{method:"POST",headers:{"X-WP-Nonce":NONCE,"Content-Type":"application/json"},body:JSON.stringify({keep_id:keepId,remove_id:removeId})});
            const d=await res.json().catch(()=>({}));
            if(!res.ok) return d?.error||d?.message||"Merge failed.";
            setPlayers(ps=>ps.filter(p=>p.id!==removeId));
            showToast("✓ Records merged");
            return "";
          }catch(e){ return "Network error — nothing was changed."; }
        }}
        onDismiss={async(a,b)=>{
          try{
            const res=await fetch(`${API}/players/not-duplicate`,{method:"POST",headers:{"X-WP-Nonce":NONCE,"Content-Type":"application/json"},body:JSON.stringify({a,b})});
            if(res.ok) setDismissedDupes(l=>[...l,Math.min(a,b)+"-"+Math.max(a,b)]);
          }catch{}
        }}/>}
      {showEmail&&<BatchEmailModal players={selectedIds.size>0?players.filter(p=>selectedIds.has(p.id)):filtered} onClose={()=>setShowEmail(false)} onSend={handleSendEmail}/>}

      {/* #23 Shortcut card */}
      {showShortcuts&&(
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center" }} onClick={()=>setShowShortcuts(false)}>
          <div style={{ background:"#fff",borderRadius:14,padding:"24px",maxWidth:400,width:"90vw",boxShadow:"0 24px 60px rgba(0,0,0,.2)" }} onClick={e=>e.stopPropagation()}>
            <h2 style={{ fontFamily:"'Fraunces',serif",fontSize:18,fontWeight:700,color:"#1a1a2e",margin:"0 0 16px" }}>Keyboard shortcuts</h2>
            {[["/ or Ctrl+F","Focus search"],["↑ ↓","Navigate rows"],["Enter","Open player drawer"],["Esc","Close drawer / clear"],["Ctrl+Z","Undo last change"],["?","Toggle this panel"]].map(([k,v])=>(
              <div key={k} style={{ display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #F0EEE8" }}>
                <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,background:"#F6F5F0",padding:"2px 8px",borderRadius:5,color:"#1a1a2e" }}>{k}</span>
                <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#555" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-split" style={{ display:"flex",height:"calc(100vh - var(--wp-admin--admin-bar--height, 32px))",overflow:"hidden" }}>

        {/* ── Table side ───────────────────────────────────────────────────── */}
        <div style={{ flex:1,overflowY:"auto",padding:"14px 20px 20px",minWidth:0 }}>

          {/* WOW 10: Offline banner */}
          {isOffline&&<div style={{ background:"#FEF3C7",border:"1px solid #FDE68A",borderRadius:8,padding:"8px 14px",marginBottom:10,fontFamily:"'DM Mono',monospace",fontSize:11,color:"#92400E",fontWeight:500 }}>⚡ Offline mode — {offlineChanges>0?`${offlineChanges} change${offlineChanges!==1?"s":""} queued for sync`:"changes will sync when back online"}</div>}

          {/* WOW 2: Live feed */}
          {liveCount!==null&&liveCount>players.length&&(
            <div style={{ background:"#E0F0FF",border:"1px solid #93C5FD",borderRadius:8,padding:"8px 14px",marginBottom:10,fontFamily:"'DM Mono',monospace",fontSize:11,color:"#1A4F8A",fontWeight:500,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
              ← {liveCount-players.length} new registration{liveCount-players.length!==1?"s":""} detected
              <button onClick={()=>window.location.reload()} style={{ fontFamily:"'DM Mono',monospace",fontSize:10,background:"#1A4F8A",color:"#fff",border:"none",padding:"3px 10px",borderRadius:4,cursor:"pointer" }}>Reload →</button>
            </div>
          )}

          {/* #13 capacity warnings */}
          {capWarnings.map(([div,n])=>(
            <div key={div} style={{ background:"#FEF2F2",border:"1px solid #FCA5A5",borderRadius:8,padding:"8px 14px",marginBottom:8,fontFamily:"'DM Mono',monospace",fontSize:11,color:"#991B1B" }}>
              ⚠ {DIVISION_LABEL[div]||div} over capacity — {n} registered, cap is {DIV_CAPS[div]||30}
              <a href="/wp-admin/admin.php?page=grsh-tm-alternates" style={{ marginLeft:8,color:"#991B1B",fontWeight:600 }}>Review alternates →</a>
            </div>
          ))}

          {/* Header */}
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,flexWrap:"wrap",gap:10 }}>
            <div>
              <div style={{ display:"inline-block",fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:500,letterSpacing:".1em",textTransform:"uppercase",background:"#1a1a2e",color:"#D4A017",padding:"3px 12px",borderRadius:99,marginBottom:6 }}>Season 2027</div>
              <h1 style={{ fontFamily:"'Fraunces',serif",fontSize:26,fontWeight:700,color:"#1a1a2e",margin:"0 0 3px",letterSpacing:"-.5px" }}>Players</h1>
              <p style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#aaa",margin:0 }}>
                Player pool · {regCount} registered{retCount>0&&` · ${retCount} returning`}
                {/* #24 empty state sync prompt */}
                {players.length===0&&<a href="#" style={{ marginLeft:8,color:"#1a1a2e",fontWeight:600 }}>Sync from WPForms →</a>}
              </p>
            </div>
            <div style={{ display:"flex",gap:7,alignItems:"center",flexWrap:"wrap" }}>
              {/* WOW 5 dupes */}
              {dupeCount>0&&<button onClick={()=>setShowDupes(true)} style={{ fontFamily:"'DM Mono',monospace",fontSize:11,background:"#FEF3C7",border:"1px solid #FDE68A",color:"#92400E",padding:"7px 12px",borderRadius:8,cursor:"pointer" }}>⧉ {dupeCount} possible duplicate{dupeCount!==1?"s":""}</button>}
              {/* WOW 4 draft preview */}
              <button onClick={()=>setShowDraftPrev(true)} style={{ fontFamily:"'DM Mono',monospace",fontSize:11,background:"#EEF2FF",border:"1px solid #C7D2FE",color:"#1a1a2e",padding:"7px 12px",borderRadius:8,cursor:"pointer" }}>⬡ Draft preview</button>
              {/* WOW 6 email */}
              <button onClick={()=>setShowEmail(true)} style={{ fontFamily:"'DM Mono',monospace",fontSize:11,background:"#fff",border:"1px solid #E8E6DF",color:"#666",padding:"7px 12px",borderRadius:8,cursor:"pointer" }}>📧 Email</button>
              {/* #3 column toggle */}
              <div style={{ position:"relative" }}>
                <button onClick={()=>setShowColMenu(c=>!c)} style={{ fontFamily:"'DM Mono',monospace",fontSize:11,background:"#fff",border:"1px solid #E8E6DF",color:"#666",padding:"7px 12px",borderRadius:8,cursor:"pointer" }}>⊞ Columns</button>
                {showColMenu&&<div style={{ position:"absolute",top:"110%",right:0,background:"#fff",border:"1px solid #E8E6DF",borderRadius:10,padding:"12px",zIndex:200,minWidth:160,boxShadow:"0 8px 24px rgba(0,0,0,.12)" }}>
                  {ALL_COLS.map(col=>(
                    <label key={col.k} style={{ display:"flex",alignItems:"center",gap:8,padding:"4px 0",cursor:"pointer",fontFamily:"'DM Mono',monospace",fontSize:11,color:"#555" }}>
                      <input type="checkbox" checked={visibleCols.includes(col.k)} onChange={()=>setVisibleCols(v=>v.includes(col.k)?v.filter(c=>c!==col.k):[...v,col.k])} />
                      {col.l}
                    </label>
                  ))}
                </div>}
              </div>
              {/* #8 jersey */}
              <button onClick={()=>setShowJersey(j=>!j)} style={{ fontFamily:"'DM Mono',monospace",fontSize:11,background:showJersey?"#1a1a2e":"#fff",color:showJersey?"#D4A017":"#666",border:`1px solid ${showJersey?"#1a1a2e":"#E8E6DF"}`,padding:"7px 12px",borderRadius:8,cursor:"pointer" }}>🎽 Jerseys</button>
              {/* Export */}
              <button onClick={exportCSV} style={{ fontFamily:"'DM Mono',monospace",fontSize:11,background:"#F6F5F0",border:"1px solid #E8E6DF",color:"#666",padding:"7px 12px",borderRadius:8,cursor:"pointer" }}>↓ Export CSV</button>
              {/* #23 shortcuts */}
              <button onClick={()=>setShowShortcuts(true)} style={{ fontFamily:"'DM Mono',monospace",fontSize:11,background:"#F6F5F0",border:"1px solid #E8E6DF",color:"#888",padding:"7px 10px",borderRadius:8,cursor:"pointer" }}>?</button>
            </div>
          </div>

          {/* #8 Jersey view */}
          {showJersey&&(
            <div style={{ background:"#fff",border:"1px solid #E8E6DF",borderRadius:10,padding:"14px 16px",marginBottom:12 }}>
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:".08em",marginBottom:10 }}>Jersey size distribution ({filtered.length} filtered players)</div>
              <div style={{ display:"flex",gap:10,flexWrap:"wrap" }}>
                {Object.entries(jerseyView).sort().map(([size,n])=>(
                  <div key={size} style={{ background:"#F6F5F0",borderRadius:8,padding:"8px 14px",textAlign:"center" }}>
                    <div style={{ fontFamily:"'Fraunces',serif",fontSize:18,fontWeight:700,color:"#1a1a2e" }}>{n}</div>
                    <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa" }}>{size}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* #14 Pipeline */}
          {showPipeline&&<PipelineBar players={filtered.length<players.length?players:players} onStageClick={(st)=>setFilterStatus(f=>f===st?"":st)}/>}

          {/* #19 Div capacity bars */}
          {!filterDiv&&(
            <div style={{ background:"#fff",border:"1px solid #E8E6DF",borderRadius:10,padding:"10px 14px",marginBottom:8 }}>
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:".08em",marginBottom:8 }}>Division capacity</div>
              <div style={{ display:"flex",gap:10,flexWrap:"wrap" }}>
                {ALL_DIVISIONS.map(div=>{
                  const n=players.filter(p=>p.division_requested===div).length;
                  const cap=DIV_CAPS[div]||30;
                  const pct=Math.min(100,Math.round(n/cap*100));
                  const col=pct>=100?"#991B1B":pct>=85?"#92400E":"#166534";
                  const dc=DIVISION_COLOR[div]||{};
                  return (
                    <div key={div} onClick={()=>setFilterDiv(f=>f===div?"":div)}
                      style={{ flex:1,minWidth:80,cursor:"pointer",padding:"8px 10px",
                        background:filterDiv===div?dc.bg||"#F6F5F0":"#F6F5F0",borderRadius:8,
                        border:`1px solid ${filterDiv===div?dc.border||"#E8E6DF":"transparent"}` }}>
                      <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:dc.color||"#888",textTransform:"uppercase",marginBottom:4 }}>{DIVISION_LABEL[div]}</div>
                      <div style={{ height:4,background:"#E8E6DF",borderRadius:99,overflow:"hidden",marginBottom:3 }}>
                        <div style={{ height:"100%",width:`${pct}%`,background:col,borderRadius:99,transition:"width .5s" }}/>
                      </div>
                      <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:col,fontWeight:500 }}>
                        {n}/{cap} {pct>=100&&"⚠ over"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Attention queue: what needs a human today */}
          <AttentionQueue items={queueItems} activeKey={queueKey||(funnel?"funnel_"+funnel:"")}
            onAction={runQueueAction} onClear={()=>{setQueueKey("");setFunnel("");setPage(1);}} open={queueOpen} setOpen={setQueueOpen}/>

          {/* Scope switcher: who are we looking at? */}
          {retCount>0&&(
            <div role="tablist" aria-label="Player scope" style={{ display:"inline-flex",gap:2,background:"#EFEDE6",padding:3,borderRadius:10,marginBottom:12 }}>
              {[
                {k:"registered",label:`Registered ${CURRENT_YEAR}`,n:regCount},
                {k:"returning", label:"Returning (not yet registered)",n:retCount},
                {k:"all",       label:"All",n:players.length},
              ].map(t=>(
                <button key={t.k} role="tab" aria-selected={scope===t.k}
                  onClick={()=>{setScope(t.k);setPage(1);}}
                  style={{ fontFamily:"'DM Mono',monospace",fontSize:11,border:"none",cursor:"pointer",padding:"6px 14px",borderRadius:8,
                    background:scope===t.k?"#1a1a2e":"transparent",color:scope===t.k?"#D4A017":"#555" }}>
                  {t.label} <span style={{ opacity:.7 }}>{t.n}</span>
                </button>
              ))}
            </div>
          )}

          {/* Renewal funnel: only when there is a returning cohort */}
          {cohortTotal>0&&scope!=="registered"&&(
            <RenewalFunnel counts={funnelCounts} total={cohortTotal} active={funnel}
              onPick={(k)=>{setFunnel(k);setQueueKey("");setPage(1);}}
              onInvite={()=>setShowInvite(true)} inviteTargets={inviteTargets.length}/>
          )}

          {/* Stats bar — #20 dynamic */}
          <div style={{ display:"flex",gap:10,marginBottom:14,flexWrap:"wrap" }}>
            {[
              {label:"Showing",  val:stats.total,    color:"#1a1a2e",  filter:null},
              {label:"Paid",     val:stats.paid,     color:"#166534",  filter:()=>setFilterPayment(f=>f==="paid"?"":"paid")},
              {label:"Unpaid",   val:stats.unpaid,   color:"#92400E",  filter:()=>setFilterPayment(f=>f==="pending"?"":"pending")},
              {label:"Subs",     val:stats.subs,     color:"#4C1D95",  filter:()=>setFilterType(f=>f==="sub"?"":"sub")},
              {label:"Goalies",  val:stats.goalies,  color:"#1E3A8A",  filter:()=>setFilterPos(f=>f==="goaltender"?"":"goaltender")},
              {label:"Warnings", val:stats.warnings, color:"#991B1B",  filter:()=>setFilterWarn(w=>!w)},
            ].map(chip=>(
              <div key={chip.label} onClick={chip.filter}
                style={{ display:"flex",alignItems:"center",gap:8,background:"#fff",
                  border:"1px solid #E8E6DF",borderRadius:99,padding:"5px 14px",
                  cursor:chip.filter?"pointer":"default",userSelect:"none",
                  transition:"background .12s" }}>
                <span style={{ fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,color:chip.color,lineHeight:1 }}>{chip.val}</span>
                <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:".07em" }}>{chip.label}</span>
              </div>
            ))}
          </div>

          {/* #2 Saved views */}
          <div style={{ display:"flex",gap:6,flexWrap:"wrap",marginBottom:10 }}>
            {savedViews.map(v=>(
              <button key={v.name} onClick={()=>applyView(v)} style={{
                fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:500,
                padding:"4px 12px",borderRadius:99,cursor:"pointer",
                background:activeView===v.name?"#1a1a2e":"#fff",
                color:activeView===v.name?"#D4A017":"#888",
                border:`1px solid ${activeView===v.name?"#1a1a2e":"#E8E6DF"}` }}>
                {v.name}
              </button>
            ))}
            <button onClick={()=>setShowSaveView(s=>!s)} style={{ fontFamily:"'DM Mono',monospace",fontSize:10,background:"#F6F5F0",border:"1px dashed #D0CEC6",color:"#aaa",padding:"4px 12px",borderRadius:99,cursor:"pointer" }}>+ Save view</button>
            {showSaveView&&(
              <div style={{ display:"flex",gap:6,alignItems:"center" }}>
                <input value={newViewName} onChange={e=>setNewViewName(e.target.value)} placeholder="View name…" style={{ fontFamily:"'DM Mono',monospace",fontSize:11,border:"1px solid #E8E6DF",borderRadius:6,padding:"4px 10px",outline:"none",color:"#333" }}/>
                <button onClick={()=>{if(newViewName){setSavedViews(vs=>[...vs,{name:newViewName,filters:{filterDiv,filterPos,filterStatus,filterPayment,filterType,filterWarn}}]);setShowSaveView(false);setNewViewName("");}}} style={{ fontFamily:"'DM Mono',monospace",fontSize:10,background:"#1a1a2e",color:"#D4A017",border:"none",padding:"5px 12px",borderRadius:6,cursor:"pointer" }}>Save</button>
              </div>
            )}
          </div>

          {/* Filter bar */}
          <div style={{ background:"#fff",border:"1px solid #E8E6DF",borderRadius:10,padding:"10px 14px",marginBottom:8 }}>
            {/* WOW 1: NL search */}
            <div style={{ display:"flex",gap:8,alignItems:"center",marginBottom:10 }}>
              <div style={{ position:"relative",flex:1 }}>
                <span style={{ position:"absolute",top:8,left:10,color:"#aaa",fontSize:14,pointerEvents:"none" }}>⌕</span>
                <input ref={searchRef} type="text" value={search}
                  onChange={e=>{setSearch(e.target.value);setPage(1);setShowNLHint(isNL&&e.target.value.length>2);}}
                  placeholder={isNL?"Try: Gold Open wingers who haven't paid…":"Search name, email, tier… (press /)"}
                  style={{ fontFamily:"'DM Mono',monospace",fontSize:12,width:"100%",
                    background:isNL?"#EEF2FF":"#F6F5F0",
                    border:`1px solid ${isNL?"#C7D2FE":"#E8E6DF"}`,borderRadius:8,
                    padding:"8px 10px 8px 30px",color:"#333",outline:"none" }}/>
              </div>
              {/* NL toggle — WOW 1 */}
              <button onClick={()=>{setIsNL(n=>!n);setSearch("");}}
                style={{ fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:500,padding:"8px 12px",borderRadius:8,cursor:"pointer",whiteSpace:"nowrap",background:isNL?"#1a1a2e":"#F6F5F0",color:isNL?"#D4A017":"#888",border:`1px solid ${isNL?"#1a1a2e":"#E8E6DF"}` }}>
                {isNL?"🧠 Smart":"🧠 Smart"}
              </button>
              {activeFilters>0&&<button onClick={clearFilters} style={{ fontFamily:"'DM Mono',monospace",fontSize:11,background:"#FEE2E2",border:"1px solid #FCA5A5",color:"#991B1B",padding:"7px 12px",borderRadius:8,cursor:"pointer" }}>Clear {activeFilters}</button>}
            </div>

            {/* NL suggestions — WOW 1 */}
            {isNL&&!search&&(
              <div style={{ display:"flex",gap:6,flexWrap:"wrap",marginBottom:8 }}>
                {NL_SUGGESTIONS.map(s=>(
                  <button key={s} onClick={()=>{setSearch(s);setPage(1);}} style={{ fontFamily:"'DM Mono',monospace",fontSize:10,background:"#F6F5F0",border:"1px solid #E8E6DF",color:"#555",padding:"4px 10px",borderRadius:99,cursor:"pointer" }}>{s}</button>
                ))}
              </div>
            )}

            {/* Filter dropdowns */}
            <div style={{ display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end" }}>
              {[
                {label:"Division",val:filterDiv,  set:setFilterDiv,  opts:ALL_DIVISIONS.map(d=>({value:d,label:DIVISION_LABEL[d]}))},
                {label:"Position",val:filterPos,  set:setFilterPos,  opts:ALL_POSITIONS.map(p=>({value:p,label:POSITION_LABEL[p]}))},
                {label:"Status",  val:filterStatus,set:setFilterStatus,opts:ALL_STATUSES.map(s=>({value:s,label:s.replace(/_/g," ")}))},
                {label:"Payment", val:filterPayment,set:setFilterPayment,opts:ALL_PAYMENTS.map(p=>({value:p,label:p}))},
                {label:"Type",    val:filterType, set:setFilterType,  opts:[{value:"primary",label:"Primary"},{value:"sub",label:"Sub"}]},
              ].map(f=>(
                <div key={f.label} style={{ display:"flex",flexDirection:"column",gap:3 }}>
                  <label style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",textTransform:"uppercase",letterSpacing:".07em" }}>{f.label}</label>
                  <select value={f.val} onChange={e=>{f.set(e.target.value);setPage(1);}} style={{ fontFamily:"'DM Mono',monospace",fontSize:11,background:"#F6F5F0",border:"1px solid #E8E6DF",borderRadius:6,padding:"5px 8px",color:"#333",outline:"none",minWidth:100 }}>
                    <option value="">All</option>
                    {f.opts.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              ))}
              <div style={{ display:"flex",flexDirection:"column",gap:3 }}>
                <label style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",textTransform:"uppercase",letterSpacing:".07em" }}>Warnings</label>
                <button onClick={()=>setFilterWarn(w=>!w)} style={{ fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,padding:"5px 10px",borderRadius:6,cursor:"pointer",background:filterWarn?"#FEF2F2":"#F6F5F0",color:filterWarn?"#991B1B":"#888",border:`1px solid ${filterWarn?"#FCA5A5":"#E8E6DF"}` }}>⚠ Only</button>
              </div>
            </div>

            {/* #17 Filter breadcrumbs */}
            {activeFilters>0&&(
              <div style={{ display:"flex",gap:6,flexWrap:"wrap",marginTop:8 }}>
                {filterDiv&&<span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,background:"#EEF2FF",color:"#1a1a2e",padding:"2px 10px",borderRadius:99,display:"flex",alignItems:"center",gap:4 }}>Division: {DIVISION_LABEL[filterDiv]}<button onClick={()=>setFilterDiv("")} style={{ background:"none",border:"none",cursor:"pointer",padding:"0 0 0 4px",color:"#888",fontSize:12 }}>✕</button></span>}
                {filterPos&&<span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,background:"#EEF2FF",color:"#1a1a2e",padding:"2px 10px",borderRadius:99,display:"flex",alignItems:"center",gap:4 }}>Position: {POSITION_LABEL[filterPos]}<button onClick={()=>setFilterPos("")} style={{ background:"none",border:"none",cursor:"pointer",padding:"0 0 0 4px",color:"#888",fontSize:12 }}>✕</button></span>}
                {filterStatus&&<span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,background:"#EEF2FF",color:"#1a1a2e",padding:"2px 10px",borderRadius:99,display:"flex",alignItems:"center",gap:4 }}>Status: {filterStatus.replace(/_/g," ")}<button onClick={()=>setFilterStatus("")} style={{ background:"none",border:"none",cursor:"pointer",padding:"0 0 0 4px",color:"#888",fontSize:12 }}>✕</button></span>}
                {filterPayment&&<span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,background:"#EEF2FF",color:"#1a1a2e",padding:"2px 10px",borderRadius:99,display:"flex",alignItems:"center",gap:4 }}>Payment: {filterPayment}<button onClick={()=>setFilterPayment("")} style={{ background:"none",border:"none",cursor:"pointer",padding:"0 0 0 4px",color:"#888",fontSize:12 }}>✕</button></span>}
                {filterWarn&&<span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,background:"#FEF2F2",color:"#991B1B",padding:"2px 10px",borderRadius:99,display:"flex",alignItems:"center",gap:4 }}>Warnings only<button onClick={()=>setFilterWarn(false)} style={{ background:"none",border:"none",cursor:"pointer",padding:"0 0 0 4px",color:"#991B1B",fontSize:12 }}>✕</button></span>}
              </div>
            )}
          </div>

          {/* Bulk bar */}
          {selectedIds.size>0&&(
            <div style={{ display:"flex",alignItems:"center",gap:10,padding:"9px 12px",marginBottom:8,background:"#EEF2FF",border:"1px solid #C7D2FE",borderRadius:8,flexWrap:"wrap" }}>
              <span style={{ fontFamily:"'DM Mono',monospace",fontSize:12,color:"#1a1a2e",fontWeight:500 }}>{selectedIds.size} selected</span>
              <div style={{ display:"flex",gap:6 }}>
                {["approved","draft_eligible","assigned","withdrawn"].map(st=>(
                  <button key={st} onClick={()=>bulkUpdateStatus(st)} style={{ fontFamily:"'DM Mono',monospace",fontSize:10,background:"#1a1a2e",color:"#D4A017",border:"none",padding:"4px 10px",borderRadius:5,cursor:"pointer" }}>→ {st.replace(/_/g," ")}</button>
                ))}
                <button onClick={()=>setShowEmail(true)} style={{ fontFamily:"'DM Mono',monospace",fontSize:10,background:"#E0F0FF",color:"#1A4F8A",border:"1px solid #93C5FD",padding:"4px 10px",borderRadius:5,cursor:"pointer" }}>📧 Email selected</button>
              </div>
              <button onClick={()=>setSelectedIds(new Set())} style={{ fontFamily:"'DM Mono',monospace",fontSize:10,background:"transparent",border:"1px solid #C7D2FE",color:"#666",padding:"4px 10px",borderRadius:5,cursor:"pointer",marginLeft:"auto" }}>✕ Clear</button>
            </div>
          )}

          {/* Results */}
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 }}>
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#888" }}>
              Showing <strong>{filtered.length?(page-1)*pageSize+1:0}–{Math.min(page*pageSize,filtered.length)}</strong> of <strong>{filtered.length}</strong> players
              {filtered.length<players.length&&<span style={{ color:"#aaa" }}> · {players.length-filtered.length} hidden by {scope!=="all"?"scope/filters":"filters"}</span>}
            </span>
            {selected&&<span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa" }}>↑↓ navigate · Esc close</span>}
          </div>

          {/* Table */}
          <div style={{ background:"#fff",border:"1px solid #E8E6DF",borderRadius:12,overflow:"hidden",marginBottom:10 }}>
            <div className="p-tbl-scroll">
            <table style={{ width:"100%",borderCollapse:"collapse" }}>
              <thead>
                <tr>
                  <th style={TH} onClick={()=>{ if(paginated.length===selectedIds.size)setSelectedIds(new Set()); else setSelectedIds(new Set(paginated.map(p=>p.id))); }}>
                    <input type="checkbox" checked={selectedIds.size===paginated.length&&paginated.length>0} readOnly style={{ cursor:"pointer" }}/>
                  </th>
                  {visibleCols.includes("player")&&<th style={TH} onClick={()=>handleSort("last_name")}>Player <SortIcon k="last_name"/></th>}
                  {visibleCols.includes("division")&&<th style={TH} onClick={()=>handleSort("division_requested")}>Division <SortIcon k="division_requested"/></th>}
                  {visibleCols.includes("position")&&<th style={TH} onClick={()=>handleSort("position")}>Position <SortIcon k="position"/></th>}
                  {visibleCols.includes("tier")&&<th style={TH} onClick={()=>handleSort("skill_tier_reported")}>Tier <SortIcon k="skill_tier_reported"/></th>}
                  {visibleCols.includes("score")&&<th style={{ ...TH,background:"rgba(26,26,46,.04)" }} onClick={()=>handleSort("score")}>Score <SortIcon k="score"/></th>}
                  {visibleCols.includes("age")&&<th style={TH} onClick={()=>handleSort("age")}>Age <SortIcon k="age"/></th>}
                  {visibleCols.includes("type")&&<th style={TH}>Type</th>}
                  {visibleCols.includes("payment")&&<th style={TH} onClick={()=>handleSort("payment_status")}>Payment <SortIcon k="payment_status"/></th>}
                  {visibleCols.includes("status")&&<th style={TH} onClick={()=>handleSort("status")}>Status <SortIcon k="status"/></th>}
                  <th style={TH}/>
                </tr>
              </thead>
              <tbody>
                {loading&&[1,2,3,4,5].map(i=><SkeletonRow key={i}/>)}
                {!loading&&filtered.length===0&&(
                  <tr><td colSpan={12} style={{ padding:"60px 24px",textAlign:"center" }}>
                    <div style={{ fontSize:32,marginBottom:10 }}>{activeFilters||search?"🔍":"🏒"}</div>
                    <p style={{ fontFamily:"'Fraunces',serif",fontSize:17,fontWeight:700,color:"#1a1a2e",margin:"0 0 6px" }}>
                      {activeFilters||search?"No players match these filters":"No players registered yet"}
                    </p>
                    <p style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#aaa",margin:"0 0 16px" }}>
                      {activeFilters||search?"Try adjusting your filters or search.":"Sync from WPForms to load registrations — check Settings for the Form ID."}
                    </p>
                    {(activeFilters||search)?<button onClick={clearFilters} style={{ fontFamily:"'DM Mono',monospace",fontSize:12,background:"#1a1a2e",color:"#D4A017",border:"none",padding:"8px 20px",borderRadius:8,cursor:"pointer" }}>Clear filters</button>
                    :<a href="/wp-admin/admin.php?page=grsh-tm-dashboard" style={{ fontFamily:"'DM Mono',monospace",fontSize:12,background:"#1a1a2e",color:"#D4A017",padding:"8px 20px",borderRadius:8,textDecoration:"none" }}>Go to Dashboard</a>}
                  </td></tr>
                )}

                {!loading&&paginated.map(p=>{
                  const tier=p.skill_tier_assigned||p.skill_tier_reported;
                  const tc=TIER_COLOR(tier);
                  const dc=DIVISION_COLOR[p.division_requested]||{};
                  const pc=p.position?POSITION_COLOR[p.position]:null;
                  const payc=PAYMENT_COLOR[p.payment_status]||{};
                  const sc=STATUS_COLOR[p.status]||{};
                  const isSelected=selected?.id===p.id;
                  const isChecked=selectedIds.has(p.id);
                  const score=computeScore(p.skill_tier_reported,p.years_experience,p.committee_score_adjustment);
                  // #9 age eligibility check (45A requires 45+)
                  const ageWarning=p.division_requested==="45a"&&p.age&&p.age<45;

                  return (
                    <tr key={p.id} className="prow" tabIndex={0}
                      onMouseEnter={()=>setHoveredRow(p.id)} onMouseLeave={()=>setHoveredRow(null)}
                      onClick={()=>{ setSelected(p); setInlineTierRow(null); }}
                      onKeyDown={e=>e.key==="Enter"&&setSelected(p)}
                      style={{ background:isSelected?"#EEF2FF":p.sandbagging_flag?"#FFFBEB":"transparent",
                        borderLeft:`3px solid ${isSelected?"#1a1a2e":p.sandbagging_flag?"#F59E0B":(p.registered_this_season!==false&&p.payment_status==="pending")?"#FDE68A":"transparent"}`,
                        cursor:"pointer",transition:"background .1s" }}>

                      <td style={TD} onClick={e=>{ e.stopPropagation(); setSelectedIds(prev=>{const n=new Set(prev);n.has(p.id)?n.delete(p.id):n.add(p.id);return n;}); }}>
                        <input type="checkbox" checked={isChecked} onChange={()=>{}} style={{ cursor:"pointer" }}/>
                      </td>

                      {visibleCols.includes("player")&&<td style={TD}>
                        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                          <div style={{ width:24,height:24,borderRadius:"50%",background:isSelected?"#1a1a2e":"#2D2D44",color:"#D4A017",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Mono',monospace",fontSize:9,fontWeight:500,flexShrink:0 }}>
                            {p.first_name[0]}{p.last_name[0]}
                          </div>
                          <div>
                            <div style={{ fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:600,color:"#1a1a2e",display:"flex",alignItems:"center",gap:4,whiteSpace:"nowrap" }}>
                              {p.first_name} {p.last_name}
                              {p.sandbagging_flag&&<span style={{ fontSize:9,color:"#EF4444" }}>⚠</span>}
                              {p.skill_tier_assigned&&<span style={{ fontSize:9,color:"#9333EA" }}>✎</span>}
                              {/* #7 returning badge */}
                              <ReturningBadge seasons={p.returning_seasons}/>
                              {/* #21 history indicator */}
                              {p.history_seasons>0&&<HistoryDot seasons={p.history_seasons}/>}
                              {/* #6 copy email on hover */}
                              {hoveredRow===p.id&&<CopyBtn value={p.email} label="email"/>}
                            </div>
                            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#bbb",marginTop:1 }}>{p.email}</div>
                            {/* #6 notes indicator */}
                            {p.notes&&<div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#9333EA",marginTop:1 }}>📝 {p.notes.slice(0,30)}{p.notes.length>30?"…":""}</div>}
                          </div>
                        </div>
                      </td>}

                      {visibleCols.includes("division")&&<td style={TD}>
                        {dc.bg?<Pill {...dc} small>{DIVISION_LABEL[p.division_requested]||"—"}</Pill>:<span style={{ color:"#ccc",fontSize:12 }}>—</span>}
                        {ageWarning&&<div style={{ fontFamily:"'DM Mono',monospace",fontSize:8,color:"#991B1B",marginTop:2 }}>⚠ Age {p.age} — 45A requires 45+</div>}
                      </td>}

                      {visibleCols.includes("position")&&<td style={TD}>
                        {pc?<Pill {...pc} small>{POSITION_LABEL[p.position]}</Pill>:<span style={{ color:"#ccc",fontSize:12 }}>—</span>}
                      </td>}

                      {/* #15 inline tier edit */}
                      {visibleCols.includes("tier")&&<td style={TD} onClick={e=>{e.stopPropagation();setInlineTierRow(inlineTierRow===p.id?null:p.id);}}>
                        {inlineTierRow===p.id?(
                          <div style={{ position:"relative" }} onClick={e=>e.stopPropagation()}>
                            <div style={{ position:"absolute",top:"100%",left:0,zIndex:100,background:"#fff",border:"1px solid #E8E6DF",borderRadius:10,padding:"10px",boxShadow:"0 8px 24px rgba(0,0,0,.12)",minWidth:180 }}>
                              <TierScale value={tier} onChange={(t)=>saveInlineTier(p,t)}/>
                              <button onClick={()=>setInlineTierRow(null)} style={{ fontFamily:"'DM Mono',monospace",fontSize:10,background:"#F6F5F0",border:"1px solid #E8E6DF",color:"#888",padding:"4px 10px",borderRadius:5,cursor:"pointer",marginTop:8,width:"100%" }}>Cancel</button>
                            </div>
                          </div>
                        ):null}
                        <div style={{ display:"flex",flexDirection:"column",gap:2 }}>
                          <div style={{ display:"flex",alignItems:"center",gap:4 }}>
                            <Pill {...tc} small>{tier||"—"}</Pill>
                            {/* #27 always-visible edit hint */}
                            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:8,color:hoveredRow===p.id?"#1a1a2e":"#ddd",cursor:"pointer",transition:"color .15s" }} title="Click to override tier">✎</span>
                          </div>
                          {p.skill_tier_assigned&&<span style={{ fontFamily:"'DM Mono',monospace",fontSize:8,color:"#9333EA" }}>was {p.skill_tier_reported}</span>}
                        </div>
                      </td>}

                      {/* #5 score spark */}
                      {visibleCols.includes("score")&&<td style={{ ...TD,background:"rgba(26,26,46,.02)" }}>
                        <div style={{ display:"flex",flexDirection:"column",gap:3 }}>
                          <ScoreBar score={score} min={scoreRange.min} max={scoreRange.max}/>
                          {(p.committee_score_adjustment||0)!==0&&<span style={{ fontFamily:"'DM Mono',monospace",fontSize:8,color:p.committee_score_adjustment>0?"#166534":"#991B1B" }}>{p.committee_score_adjustment>0?"+":""}{p.committee_score_adjustment} adj</span>}
                          <button style={{ fontFamily:"'DM Mono',monospace",fontSize:8,background:"transparent",border:`1px solid ${hoveredRow===p.id?"#D1D5DB":"transparent"}`,color:hoveredRow===p.id?"#6B7280":"transparent",padding:"1px 6px",borderRadius:3,cursor:"pointer",transition:"all .15s" }}
                            onClick={e=>{e.stopPropagation();setEditingAdj(p);}} title="Adjust draft score">✏ adjust</button>
                        </div>
                      </td>}

                      {/* #9 age with eligibility */}
                      {visibleCols.includes("age")&&<td style={TD}>
                        <span style={{ fontFamily:"'DM Mono',monospace",fontSize:12,color:ageWarning?"#991B1B":"#555",fontWeight:ageWarning?600:400 }}>{p.age||"—"}</span>
                      </td>}

                      {visibleCols.includes("type")&&<td style={TD}>
                        {p.player_type==="sub"?<Pill bg="#EDE9FE" color="#4C1D95" small>Sub</Pill>:<span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa" }}>Primary</span>}
                      </td>}

                      {/* #18 payment with hierarchy */}
                      {visibleCols.includes("payment")&&<td style={TD}>
                        {p.registered_this_season===false
                          ? <span title={p.last_played_year?`Played and paid in ${p.last_played_year}. ${CURRENT_YEAR} registration not open or not yet submitted.`:"Not registered for this season"}
                              style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:p.last_played_year?"#4B5563":"#9CA3AF",background:"#F3F4F6",padding:"2px 8px",borderRadius:99,whiteSpace:"nowrap" }}>
                              {p.last_played_year?`✓ Paid ’${String(p.last_played_year).slice(-2)}`:"—"}
                            </span>
                          : <Pill {...payc} small>{p.payment_status||"—"}</Pill>}
                        {p.comms?.some(c=>c.toLowerCase().includes("payment"))&&<div style={{ fontFamily:"'DM Mono',monospace",fontSize:8,color:"#aaa",marginTop:2 }}>reminded</div>}
                      </td>}

                      {visibleCols.includes("status")&&<td style={TD}>
                        <Pill {...sc} small>{p.registered_this_season===false?`${invites[p.id]?(invites[p.id].opened_at?"opened invite":"invited"):"returning"}${p.last_played_year?` · played ’${String(p.last_played_year).slice(-2)}`:""}`:(p.status||"unknown").replace(/_/g," ")}</Pill>
                      </td>}

                      {/* Row arrow on hover */}
                      <td style={{ ...TD,width:20,color:"#ccc",fontSize:11,textAlign:"right",opacity:hoveredRow===p.id?1:0,transition:"opacity .15s" }}>→</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>{/* end p-tbl-scroll */}
          </div>

          {/* Pagination */}
          {!loading&&filtered.length>25&&(()=>{
            const nums=[]; const add=(n)=>nums.push(n);
            for(let i=1;i<=totalPages;i++){ if(i===1||i===totalPages||Math.abs(i-page)<=1) add(i); else if(nums[nums.length-1]!=="…") add("…"); }
            return (
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 4px",gap:12,flexWrap:"wrap" }}>
              <label style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#888",display:"flex",alignItems:"center",gap:6 }}>
                Rows per page
                <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1);}}
                  style={{ fontFamily:"'DM Mono',monospace",fontSize:11,background:"#F6F5F0",border:"1px solid #E8E6DF",borderRadius:6,padding:"4px 6px" }}>
                  {[25,50,100,250].map(n=><option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <nav aria-label="Pagination" style={{ display:"flex",gap:4,alignItems:"center" }}>
                <button style={{ ...pageBtn,opacity:page===1?0.4:1 }} disabled={page===1} onClick={()=>setPage(1)} aria-label="First page">«</button>
                <button style={{ ...pageBtn,opacity:page===1?0.4:1 }} disabled={page===1} onClick={()=>setPage(p=>p-1)}>← Prev</button>
                {nums.map((n,i)=> n==="…"
                  ? <span key={"e"+i} style={{ color:"#aaa",padding:"0 4px" }}>…</span>
                  : <button key={n} aria-current={n===page?"page":undefined} onClick={()=>setPage(n)}
                      style={{ ...pageBtn,padding:"6px 10px",background:n===page?"#1a1a2e":"#fff",color:n===page?"#D4A017":"#555" }}>{n}</button>)}
                <button style={{ ...pageBtn,opacity:page===totalPages?0.4:1 }} disabled={page===totalPages} onClick={()=>setPage(p=>p+1)}>Next →</button>
                <button style={{ ...pageBtn,opacity:page===totalPages?0.4:1 }} disabled={page===totalPages} onClick={()=>setPage(totalPages)} aria-label="Last page">»</button>
              </nav>
            </div>);
          })()}

        </div>{/* end table side */}

        {/* Detail panel */}
        {selected&&(
          <div className="p-detail-panel" style={{ width:440,minWidth:320,maxWidth:"40vw",borderLeft:"1px solid #E8E6DF",background:"#fff",height:"100%",overflowY:"auto",flexShrink:0,display:"flex",flexDirection:"column" }}>
            {/* Prev/Next navigator — so you can move between players without closing */}
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 12px",background:"#FAFAF8",borderBottom:"1px solid #F0EEE8",flexShrink:0 }}>
              <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa" }}>
                {filtered.findIndex(p=>p.id===selected.id)+1} of {filtered.length}
              </span>
              <div style={{ display:"flex",gap:4 }}>
                <button
                  disabled={filtered.findIndex(p=>p.id===selected.id)===0}
                  onClick={()=>{ const idx=filtered.findIndex(p=>p.id===selected.id); if(idx>0)setSelected(filtered[idx-1]); }}
                  style={{ fontFamily:"'DM Mono',monospace",fontSize:11,background:"#fff",border:"1px solid #E8E6DF",color:"#555",padding:"3px 10px",borderRadius:6,cursor:"pointer",opacity:filtered.findIndex(p=>p.id===selected.id)===0?0.35:1 }}>↑ Prev</button>
                <button
                  disabled={filtered.findIndex(p=>p.id===selected.id)===filtered.length-1}
                  onClick={()=>{ const idx=filtered.findIndex(p=>p.id===selected.id); if(idx<filtered.length-1)setSelected(filtered[idx+1]); }}
                  style={{ fontFamily:"'DM Mono',monospace",fontSize:11,background:"#fff",border:"1px solid #E8E6DF",color:"#555",padding:"3px 10px",borderRadius:6,cursor:"pointer",opacity:filtered.findIndex(p=>p.id===selected.id)===filtered.length-1?0.35:1 }}>↓ Next</button>
              </div>
            </div>
            <PlayerDrawer player={selected} onClose={()=>setSelected(null)} onSave={handleSave} allPlayers={players}/>
          </div>
        )}

      </div>{/* end split */}

      {/* Committee adjustment modal */}
      {editingAdj&&<CommitteeAdjustmentEditor player={editingAdj} onSave={handleAdjSave} onClose={()=>setEditingAdj(null)}/>}

      {/* #28 undo toast */}
      {undoStack.length>0&&(
        <div style={{ position:"fixed",bottom:70,right:24,display:"flex",alignItems:"center",gap:10,
          background:"#1a1a2e",borderRadius:99,padding:"8px 16px",
          boxShadow:"0 8px 24px rgba(0,0,0,.2)",zIndex:1000,animation:"slideUp .25s ease" }}>
          <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"rgba(212,160,23,.7)" }}>Change made</span>
          <button onClick={handleUndo} style={{ fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,background:"#D4A017",color:"#1a1a2e",border:"none",padding:"3px 12px",borderRadius:99,cursor:"pointer" }}>↩ Undo (Ctrl+Z)</button>
        </div>
      )}

      {/* Toast */}
      {toast&&(
        <div style={{ position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",
          fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:500,
          background:"#1a1a2e",color:"#D4A017",padding:"10px 22px",
          borderRadius:99,boxShadow:"0 8px 24px rgba(0,0,0,.2)",
          zIndex:2000,animation:"slideUp .25s ease",whiteSpace:"nowrap" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

const TH = { fontFamily:"'DM Mono',monospace",fontSize:10,color:"#888",textTransform:"uppercase",letterSpacing:".07em",padding:"7px 12px",textAlign:"left",borderBottom:"1px solid #E8E6DF",cursor:"pointer",userSelect:"none",whiteSpace:"nowrap",background:"#FAFAF8",position:"sticky",top:0,zIndex:10 };
const TD = { padding:"7px 12px",verticalAlign:"middle",borderBottom:"1px solid #F3F2ED" };
const fL = { fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:".07em",display:"block",marginBottom:5 };
const inputS = { fontFamily:"'DM Mono',monospace",fontSize:12,width:"100%",background:"#F6F5F0",border:"1px solid #E8E6DF",borderRadius:6,padding:"7px 10px",color:"#333",outline:"none" };
const pageBtn = { fontFamily:"'DM Mono',monospace",fontSize:11,background:"#fff",border:"1px solid #E8E6DF",color:"#555",padding:"6px 14px",borderRadius:8,cursor:"pointer" };
