import { useState, useEffect, useRef } from "react";

const API   = window.grshConfig?.apiUrl || "/wp-json/grsh/v1";
const NONCE = window.grshConfig?.nonce  || "";
const USER  = window.grshConfig?.userDisplay || "Committee";

// ─── Data fetchers ────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  try {
    const r = await fetch(`${API}${path}`, { headers: { "X-WP-Nonce": NONCE }, ...opts });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

// ─── Mock data ────────────────────────────────────────────────────────────────
const MOCK_STATUS = {
  season:2027, total_entries:84, total_imported:81, unsynced:3,
  unpaid:7, subs:12, warnings:2, goalies:15,
  approved:68, draft_eligible:52, teams_created:4, season_status:"open",
  last_synced:"8 min ago", tournament_date:"2027-04-09",
  cap_per_division:30,
};
const MOCK_DIVISIONS = [
  { name:"Gold Open",  slug:"gold_open", color:"#D4A017", registered:22, paid:20, subs:3, goalies:4, cap:30,
    tiers:{ A:4, B:8, C:6, R:4 }, prior_year:20, unpaid:2 },
  { name:"45A",        slug:"45a",       color:"#2196a8", registered:19, paid:17, subs:3, goalies:3, cap:24,
    tiers:{ A:1, B:5, C:8, R:5 }, prior_year:21, unpaid:2 },
  { name:"Senior B",   slug:"senior_b",  color:"#7B5EA7", registered:26, paid:25, subs:4, goalies:5, cap:32,
    tiers:{ A:0, B:6, C:12, R:8 }, prior_year:24, unpaid:1 },
  { name:"Senior C",   slug:"senior_c",  color:"#B05E3A", registered:17, paid:16, subs:2, goalies:3, cap:24,
    tiers:{ A:0, B:2, C:8, R:7 }, prior_year:19, unpaid:1 },
];
const MOCK_WARNINGS = [
  { id:1, type:"sandbagging", player:"Mike Hartley",  detail:"Tier A2 requested Senior C",  time:"2h ago", link:"grsh-tm-players" },
  { id:2, type:"sandbagging", player:"Dave Kowalski", detail:"Tier B1 requested Senior B",  time:"5h ago", link:"grsh-tm-players" },
];
const MOCK_RECENT = [
  { id:81, name:"Chris Fontaine",  type:"primary", division:"Gold Open", position:"Winger",     status:"paid",    time:"12m ago" },
  { id:80, name:"Sarah Mitchell",  type:"primary", division:"45A",       position:"Defense",    status:"paid",    time:"34m ago" },
  { id:79, name:"Tom Breslin",     type:"sub",     division:"Senior B",  position:"—",          status:"waived",  time:"1h ago"  },
  { id:78, name:"Janet Ruiz",      type:"primary", division:"Senior C",  position:"Goaltender", status:"pending", time:"2h ago"  },
  { id:77, name:"Paul Nguyen",     type:"primary", division:"Gold Open", position:"Center",     status:"paid",    time:"3h ago"  },
];
const MOCK_ACTIVITY = [
  { action:"Tier override", detail:"A2→B1 · Mike Hartley", user:"Lorenzo", time:"2h ago" },
  { action:"Player approved", detail:"Sarah Mitchell", user:"Lorenzo", time:"3h ago" },
  { action:"Sync completed", detail:"3 new registrations", user:"System", time:"4h ago" },
  { action:"Warning flagged", detail:"Dave Kowalski sandbagging", user:"System", time:"5h ago" },
];
const DIV_COLOR = { "Gold Open":"#D4A017","45A":"#2196a8","Senior B":"#7B5EA7","Senior C":"#B05E3A" };
const STATUS_STYLE = {
  paid:   { bg:"#E6F4EA",color:"#1E6B3A" },
  pending:{ bg:"#FEF3C7",color:"#92400E" },
  waived: { bg:"#EDE9FE",color:"#4C1D95" },
};

// ─── Tournament Readiness Score — WOW FEATURE ────────────────────────────────
function computeReadiness(status, divisions) {
  const regPct = Math.min(100,
    divisions.reduce((s,d)=>s+d.registered,0) /
    Math.max(1, divisions.reduce((s,d)=>s+(d.cap||30),0)) * 100
  );
  const payPct = status.total_imported > 0
    ? Math.round(((status.total_imported - status.unpaid) / status.total_imported) * 100) : 0;
  const appPct = status.total_imported > 0
    ? Math.round((status.approved / Math.max(1, status.total_imported)) * 100) : 0;
  const rosterPct = status.teams_created > 0 ? Math.min(100,
    (status.goalies / Math.max(1, status.teams_created)) >= 1 ? 100 : 50
  ) : 0;
  const score = Math.round(regPct*0.30 + payPct*0.25 + appPct*0.25 + rosterPct*0.20);
  return {
    score, regPct, payPct, appPct, rosterPct,
    label: score >= 90?"Tournament ready":score>=70?"On track":score>=50?"Needs attention":"Getting started",
    color: score>=90?"#166534":score>=70?"#1a1a2e":score>=50?"#92400E":"#991B1B",
    ring:  score>=90?"#22c55e":score>=70?"#1a1a2e":score>=50?"#f59e0b":"#ef4444",
  };
}

function ReadinessGauge({ score, ring, label, color, drivers, animating }) {
  const r = 72, cx = 96, cy = 96;
  const circ = 2 * Math.PI * r;
  const dash  = (score / 100) * circ * 0.75;
  const gap   = circ - dash;
  const rotate = -225;

  return (
    <div style={{ display:"flex",alignItems:"center",gap:32,padding:"24px 28px",
      background:"#fff",border:"1px solid #E8E6DF",borderRadius:16,marginBottom:24 }}>
      {/* Gauge */}
      <div style={{ position:"relative",flexShrink:0 }}>
        <svg width="192" height="192" viewBox="0 0 192 192">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F0EEE8" strokeWidth="12"
            strokeDasharray={`${circ*0.75} ${circ*0.25}`}
            strokeDashoffset={circ*0.375}
            strokeLinecap="round"
            transform={`rotate(${rotate} ${cx} ${cy})`}/>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={ring} strokeWidth="12"
            strokeDasharray={`${animating?0:dash} ${gap+circ*0.25}`}
            strokeDashoffset={circ*0.375}
            strokeLinecap="round"
            transform={`rotate(${rotate} ${cx} ${cy})`}
            style={{ transition:"stroke-dasharray 1.4s cubic-bezier(.4,0,.2,1)" }}/>
          <text x={cx} y={cy-8} textAnchor="middle"
            style={{ fontFamily:"'Fraunces',serif",fontSize:36,fontWeight:700,fill:color }}>
            {animating?0:score}
          </text>
          <text x={cx} y={cx+18} textAnchor="middle"
            style={{ fontFamily:"'DM Mono',monospace",fontSize:11,fill:"#aaa" }}>
            / 100
          </text>
        </svg>
        <div style={{ position:"absolute",bottom:16,left:0,right:0,textAlign:"center",
          fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,color }}>
          {label}
        </div>
      </div>

      {/* Drivers */}
      <div style={{ flex:1 }}>
        <div style={{ fontFamily:"'Fraunces',serif",fontSize:18,fontWeight:700,
          color:"#1a1a2e",marginBottom:4 }}>Tournament Readiness</div>
        <div style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#aaa",marginBottom:16 }}>
          Composite score across 4 key metrics
        </div>
        <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
          {drivers.map(d => {
            const dc = d.pct>=90?"#166534":d.pct>=70?"#1a1a2e":d.pct>=50?"#92400E":"#991B1B";
            return (
              <div key={d.label}>
                <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
                  <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#555" }}>
                    {d.label}
                  </span>
                  <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:600,color:dc }}>
                    {d.pct}%
                    <span style={{ fontWeight:400,color:"#aaa",marginLeft:4 }}>({d.weight})</span>
                  </span>
                </div>
                <div style={{ height:5,background:"#F0EEE8",borderRadius:99,overflow:"hidden" }}>
                  <div style={{ height:"100%",background:dc,borderRadius:99,
                    width:`${animating?0:d.pct}%`,transition:"width 1.4s cubic-bezier(.4,0,.2,1)" }}/>
                </div>
                {d.action && (
                  <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#92400E",marginTop:2 }}>
                    → {d.action}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Countdown chip ───────────────────────────────────────────────────────────
function Countdown({ dateStr }) {
  const days = Math.max(0, Math.ceil((new Date(dateStr)-new Date())/(1000*60*60*24)));
  const urgent = days <= 30;
  return (
    <div style={{ display:"inline-flex",alignItems:"center",gap:6,
      background:urgent?"#FEF3C7":"#F6F5F0",
      border:`1px solid ${urgent?"#FDE68A":"#E8E6DF"}`,
      borderRadius:99,padding:"4px 12px",cursor:"default" }}>
      <span style={{ fontFamily:"'Fraunces',serif",fontSize:14,fontWeight:700,
        color:urgent?"#92400E":"#1a1a2e" }}>{days}</span>
      <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,
        color:urgent?"#92400E":"#888" }}>days to tournament</span>
    </div>
  );
}

// ─── Priority banner ──────────────────────────────────────────────────────────
function PriorityBanner({ status, warnings }) {
  const items = [];
  if (status.unpaid > 0)    items.push(`${status.unpaid} players unpaid`);
  if (status.unsynced > 0)  items.push(`${status.unsynced} unsynced entries`);
  if (warnings.length > 0)  items.push(`${warnings.length} sandbagging flags`);
  if (items.length === 0) return (
    <div style={{ background:"#F0FDF4",border:"1px solid #86EFAC",borderRadius:10,
      padding:"10px 18px",marginBottom:16,
      fontFamily:"'DM Mono',monospace",fontSize:12,color:"#166534" }}>
      ✓ All clear — no items require attention today
    </div>
  );
  return (
    <div style={{ background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:10,
      padding:"10px 18px",marginBottom:16,
      display:"flex",alignItems:"center",gap:12,flexWrap:"wrap" }}>
      <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#92400E",fontWeight:500 }}>
        Needs attention:
      </span>
      {items.map((item,i) => (
        <span key={i} style={{ fontFamily:"'DM Mono',monospace",fontSize:11,
          background:"#FEF3C7",color:"#92400E",padding:"2px 10px",
          borderRadius:99,border:"1px solid #FDE68A" }}>
          {item}
        </span>
      ))}
    </div>
  );
}

// ─── Draft readiness pipeline ─────────────────────────────────────────────────
function DraftPipeline({ status }) {
  const steps = [
    { label:"Registration",  done: status.season_status !== "open" || status.total_imported > 50,
      link:"grsh-tm-players",    sub:`${status.total_imported} registered` },
    { label:"Players approved", done: status.approved >= status.total_imported * 0.9,
      link:"grsh-tm-players",    sub:`${status.approved||0} of ${status.total_imported}` },
    { label:"Teams created",    done: status.teams_created > 0,
      link:"grsh-tm-rosters",    sub:`${status.teams_created||0} teams` },
    { label:"Draft complete",   done: false,
      link:"grsh-tm-draft",      sub:"Not started" },
  ];
  return (
    <div style={{ background:"#fff",border:"1px solid #E8E6DF",borderRadius:12,
      padding:"16px 20px",marginBottom:24 }}>
      <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",
        textTransform:"uppercase",letterSpacing:".08em",marginBottom:14 }}>
        Draft readiness pipeline
      </div>
      <div style={{ display:"flex",alignItems:"center" }}>
        {steps.map((step,i) => (
          <div key={step.label} style={{ display:"flex",alignItems:"center",flex:i<steps.length-1?1:"none" }}>
            <a href={`/wp-admin/admin.php?page=${step.link}`}
              style={{ textDecoration:"none",display:"flex",flexDirection:"column",alignItems:"center",minWidth:100 }}>
              <div style={{
                width:28,height:28,borderRadius:"50%",
                background:step.done?"#166534":"#F0EEE8",
                border:`2px solid ${step.done?"#166534":"#D0CEC6"}`,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:600,
                color:step.done?"#fff":"#bbb",marginBottom:4,
              }}>{step.done?"✓":i+1}</div>
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,
                color:step.done?"#166534":"#888",fontWeight:step.done?600:400,
                textAlign:"center",lineHeight:1.3 }}>{step.label}</div>
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,
                color:"#bbb",textAlign:"center" }}>{step.sub}</div>
            </a>
            {i < steps.length-1 && (
              <div style={{ height:2,flex:1,margin:"0 8px",marginBottom:28,
                background:step.done?"#22c55e":"#E8E6DF" }}/>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── First-run setup checklist ────────────────────────────────────────────────
function SetupChecklist() {
  return (
    <div style={{ background:"#EEF2FF",border:"1px solid #C7D2FE",borderRadius:12,
      padding:"20px 24px",marginBottom:24 }}>
      <div style={{ fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,
        color:"#1a1a2e",marginBottom:4 }}>Welcome — let's get started</div>
      <div style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#555",marginBottom:16 }}>
        Complete these steps to prepare the 2027 tournament
      </div>
      {[
        { n:1, label:"Import player history (2021–2025)",  link:"grsh-tm-history-import",   done:false },
        { n:2, label:"Open WPForms registration form",     link:"grsh-tm-settings",         done:false },
        { n:3, label:"Sync registrations from WPForms",    link:"grsh-tm-dashboard",         done:false },
        { n:4, label:"Approve all registered players",     link:"grsh-tm-players",           done:false },
        { n:5, label:"Create teams and run draft",         link:"grsh-tm-draft",             done:false },
      ].map(step => (
        <div key={step.n} style={{ display:"flex",alignItems:"center",gap:10,
          padding:"8px 0",borderBottom:"1px solid #C7D2FE" }}>
          <div style={{ width:22,height:22,borderRadius:"50%",
            background:step.done?"#166534":"#E8E6DF",
            display:"flex",alignItems:"center",justifyContent:"center",
            fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:600,
            color:step.done?"#fff":"#888",flexShrink:0 }}>
            {step.done?"✓":step.n}
          </div>
          <a href={`/wp-admin/admin.php?page=${step.link}`}
            style={{ fontFamily:"'DM Mono',monospace",fontSize:12,
              color:"#1a1a2e",textDecoration:"none",flex:1 }}>
            {step.label}
          </a>
          <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa" }}>→</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [status,    setStatus]    = useState(MOCK_STATUS);
  const [divisions, setDivisions] = useState(MOCK_DIVISIONS);
  const [syncing,   setSyncing]   = useState(false);
  const [syncResult,setSyncResult]= useState(null);
  const [lastSync,  setLastSync]  = useState(MOCK_STATUS.last_synced);
  const [gaugeAnim, setGaugeAnim] = useState(true);
  const [showSearch,setShowSearch]= useState(false);
  const [search,    setSearch]    = useState("");
  const isFirstRun = status.total_imported === 0;

  useEffect(() => {
    apiFetch("/sync/status").then(d => { if(d) { setStatus(d); setLastSync(d.last_synced||"—"); }});
    apiFetch("/history/division-breakdown").then(d => { if(d) setDivisions(d); });
    setTimeout(()=>setGaugeAnim(false), 100);
  }, []);

  const handleSync = async () => {
    setSyncing(true); setSyncResult(null);
    const r = await apiFetch("/sync",{method:"POST"});
    if(r) setSyncResult(r);
    const d = await apiFetch("/sync/status");
    if(d) { setStatus(d); setLastSync("just now"); }
    setSyncing(false);
  };

  const pct = status.total_entries > 0
    ? Math.round((status.total_imported / status.total_entries) * 100) : 0;

  const ready = computeReadiness(status, divisions);

  const readinessDrivers = [
    { label:"Registration fill rate", pct:Math.round(ready.regPct), weight:"30%",
      action: ready.regPct < 80 ? "Registration not yet full" : null },
    { label:"Payment completion",     pct:Math.round(ready.payPct), weight:"25%",
      action: status.unpaid > 0 ? `${status.unpaid} players still unpaid` : null },
    { label:"Player approvals",       pct:Math.round(ready.appPct), weight:"25%",
      action: ready.appPct < 90 ? "Review players page" : null },
    { label:"Roster readiness",       pct:Math.round(ready.rosterPct), weight:"20%",
      action: status.teams_created === 0 ? "No teams created yet" : null },
  ];

  const navigate = (slug) => {
    window.location.href = `/wp-admin/admin.php?page=${slug}`;
  };

  return (
    <div style={{ fontFamily:"'Fraunces',Georgia,serif",background:"#F6F5F0",
      minHeight:"100vh",padding:"24px 28px 60px",maxWidth:1300 }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @media(max-width:768px){
          .dash-stats{grid-template-columns:repeat(2,1fr)!important}
          .dash-two-col{grid-template-columns:1fr!important}
          .dash-div-grid{grid-template-columns:1fr 1fr!important}
          .dash-header{flex-direction:column!important;gap:12px!important}
        }
        .metric-card:hover{background:#FAFAF8!important;cursor:pointer}
        .div-card:hover{background:#FAFAF8!important;cursor:pointer}
        .quick-btn:hover{background:#1a1a2e!important;color:#D4A017!important}
        .warn-row:hover{background:#FFF7ED!important}
        .recent-row:hover{background:#FAFAF8!important}
      `}</style>

      {/* ── HEADER — #2 #4 #13 #22 #28 compressed, descriptive, search ──── */}
      <div className="dash-header" style={{ display:"flex",justifyContent:"space-between",
        alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10 }}>
        <div style={{ display:"flex",alignItems:"center",gap:12,flexWrap:"wrap" }}>
          {/* #11 season status in pill */}
          <div style={{ display:"inline-flex",alignItems:"center",gap:6,
            background:"#1a1a2e",borderRadius:99,padding:"4px 12px" }}>
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,
              fontWeight:500,color:"#D4A017",letterSpacing:".08em" }}>
              SEASON 2027
            </span>
            <span style={{ width:6,height:6,borderRadius:"50%",
              background:status.season_status==="open"?"#22c55e":"#aaa",
              display:"inline-block" }}/>
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:9,
              color:"#D4A017",textTransform:"uppercase" }}>
              {status.season_status||"open"}
            </span>
          </div>
          {/* #30 title renamed */}
          <h1 style={{ fontFamily:"'Fraunces',serif",fontSize:24,fontWeight:700,
            color:"#1a1a2e",margin:0 }}>Season 2027 Overview</h1>
          {/* #5 countdown */}
          <Countdown dateStr={status.tournament_date||"2027-04-09"} />
        </div>

        <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
          {/* #23 search */}
          {showSearch && (
            <input autoFocus value={search}
              onChange={e=>setSearch(e.target.value)}
              onBlur={()=>{if(!search)setShowSearch(false)}}
              placeholder="Search players, registrations…"
              onKeyDown={e=>{if(e.key==="Enter"&&search){navigate(`grsh-tm-players`);setShowSearch(false);}}}
              style={{ fontFamily:"'DM Mono',monospace",fontSize:12,
                background:"#fff",border:"1px solid #E8E6DF",borderRadius:8,
                padding:"7px 12px",outline:"none",width:240,color:"#333" }}/>
          )}
          <button onClick={()=>setShowSearch(s=>!s)} style={{
            fontFamily:"'DM Mono',monospace",fontSize:12,background:"#fff",
            border:"1px solid #E8E6DF",color:"#666",padding:"7px 12px",
            borderRadius:8,cursor:"pointer" }}>
            ⌕
          </button>
          {/* #12 last synced + refresh */}
          <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",
            padding:"7px 0" }}>
            Synced {lastSync}
          </span>
          {/* #4 button renamed */}
          <button onClick={handleSync} disabled={syncing}
            style={{ fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:500,
              background:"#1a1a2e",color:"#D4A017",border:"none",
              padding:"8px 16px",borderRadius:8,cursor:"pointer",
              opacity:syncing?0.7:1,display:"flex",alignItems:"center",gap:6 }}>
            <span style={{ display:"inline-block",
              animation:syncing?"spin 1s linear infinite":"none" }}>⟳</span>
            {syncing?"Syncing…":"Sync from WPForms"}
          </button>
          {/* #28 export dropdown */}
          <button onClick={()=>navigate("grsh-tm-players")}
            style={{ fontFamily:"'DM Mono',monospace",fontSize:12,background:"#F6F5F0",
              border:"1px solid #E8E6DF",color:"#666",padding:"8px 12px",
              borderRadius:8,cursor:"pointer" }}>↓ Export</button>
        </div>
      </div>

      {/* Sync result banner */}
      {syncResult && (
        <div style={{ border:`1px solid ${syncResult.errors?.length?"#FCA5A5":"#86EFAC"}`,
          background:syncResult.errors?.length?"#FEF2F2":"#F0FDF4",
          borderRadius:10,padding:"10px 18px",marginBottom:14,
          fontFamily:"'DM Mono',monospace",fontSize:12,
          color:syncResult.errors?.length?"#991B1B":"#166534" }}>
          {syncResult.errors?.length
            ? `Import completed with errors — ${syncResult.skipped} skipped.`
            : `✓ Import complete — ${syncResult.imported} new registrations added.`}
        </div>
      )}

      {/* #1 priority banner */}
      <PriorityBanner status={status} warnings={MOCK_WARNINGS} />

      {/* #27 first-run setup checklist */}
      {isFirstRun && <SetupChecklist />}

      {/* ── WOW: TOURNAMENT READINESS GAUGE ─────────────────────────────── */}
      <ReadinessGauge
        score={ready.score}
        ring={ready.ring}
        label={ready.label}
        color={ready.color}
        drivers={readinessDrivers}
        animating={gaugeAnim}
      />

      {/* ── STAT CARDS — #2 #3 #13 #14 #16 #25 zero-value collapse ─────── */}
      <div className="dash-stats" style={{ display:"grid",
        gridTemplateColumns:"repeat(6,1fr)",gap:10,marginBottom:20 }}>
        {[
          { label:"Total registered", value:status.total_entries,   sub:"form submissions",
            accent:"#1a1a2e", link:"grsh-tm-players",  important:true },
          { label:"Imported",         value:status.total_imported,  sub:`${pct}% synced`,
            accent:"#166534", link:"grsh-tm-players",  important:true },
          { label:"Unpaid",           value:status.unpaid,          sub:"payment pending",
            accent:status.unpaid>0?"#92400E":"#166534",
            link:"grsh-tm-players",  important:status.unpaid>0 },
          { label:"Alternates",       value:status.subs,            sub:"registered",
            accent:"#1E3A8A", link:"grsh-tm-alternates",important:true },
          { label:"Unsynced",         value:status.unsynced,        sub:"awaiting sync",
            accent:status.unsynced>0?"#6B21A8":"#166534",
            link:"grsh-tm-dashboard",important:status.unsynced>0 },
          { label:"Warnings",         value:status.warnings,        sub:"require review",
            accent:status.warnings>0?"#991B1B":"#166534",
            link:"grsh-tm-players",  important:status.warnings>0 },
        ].map(m => (
          m.value===0 && !m.important ? null :
          <div key={m.label} className="metric-card"
            onClick={()=>navigate(m.link)}
            style={{ background:"#fff",border:"1px solid #E8E6DF",borderRadius:10,
              padding:"14px 16px",cursor:"pointer",transition:"background .12s",
              position:"relative",overflow:"hidden" }}>
            <div style={{ position:"absolute",top:0,left:0,right:0,height:3,background:m.accent }}/>
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",
              textTransform:"uppercase",letterSpacing:".07em",margin:"8px 0 4px" }}>{m.label}</div>
            <div style={{ fontFamily:"'Fraunces',serif",fontSize:28,fontWeight:700,
              color:m.accent,lineHeight:1,marginBottom:3 }}>{m.value}</div>
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#bbb" }}>{m.sub}</div>
            {/* #16 YoY delta placeholder */}
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#ccc",marginTop:4 }}>
              View →
            </div>
          </div>
        ))}
      </div>

      {/* #18 quick action shortcuts */}
      <div style={{ display:"flex",gap:8,marginBottom:20,flexWrap:"wrap" }}>
        <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",
          textTransform:"uppercase",letterSpacing:".07em",
          display:"flex",alignItems:"center",marginRight:4 }}>Quick actions</div>
        {[
          { label:"Sync WPForms",   icon:"⟳", link:"grsh-tm-dashboard",    action:handleSync },
          { label:"View warnings",  icon:"⚠", link:"grsh-tm-players"         },
          { label:"Go to draft",    icon:"⬡", link:"grsh-tm-draft"           },
          { label:"Export CSV",     icon:"↓", link:"grsh-tm-players"         },
          { label:"Import history", icon:"↑", link:"grsh-tm-history-import"  },
        ].map(q => (
          <button key={q.label} className="quick-btn"
            onClick={()=>q.action?q.action():navigate(q.link)}
            style={{ fontFamily:"'DM Mono',monospace",fontSize:11,
              background:"#fff",border:"1px solid #E8E6DF",color:"#555",
              padding:"6px 14px",borderRadius:8,cursor:"pointer",
              transition:"all .15s",display:"flex",alignItems:"center",gap:5 }}>
            <span>{q.icon}</span>{q.label}
          </button>
        ))}
      </div>

      {/* #6 sync status (replaces progress bar) */}
      <div style={{ background:"#fff",border:"1px solid #E8E6DF",borderRadius:12,
        padding:"16px 22px",marginBottom:20 }}>
        <div style={{ display:"flex",justifyContent:"space-between",
          alignItems:"center",marginBottom:10 }}>
          <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#555",
            textTransform:"uppercase",letterSpacing:".08em" }}>
            WPForms sync status
          </span>
          <div style={{ display:"flex",alignItems:"center",gap:12 }}>
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#aaa" }}>
              Last synced {lastSync}
            </span>
            <span style={{ fontFamily:"'Fraunces',serif",fontSize:18,fontWeight:700,
              color:"#1a1a2e" }}>{pct}%</span>
          </div>
        </div>
        <div style={{ height:8,background:"#E8E6DF",borderRadius:99,overflow:"hidden",marginBottom:8 }}>
          <div style={{ height:"100%",background:"#1a1a2e",borderRadius:99,
            width:`${pct}%`,transition:"width .8s ease" }}/>
        </div>
        <div style={{ display:"flex",justifyContent:"space-between",
          fontFamily:"'DM Mono',monospace",fontSize:11,color:"#aaa" }}>
          <span>{status.total_imported} of {status.total_entries} entries imported</span>
          {status.unsynced>0
            ? <span style={{ color:"#92400E" }}>{status.unsynced} entries awaiting sync</span>
            : <span style={{ color:"#166534" }}>✓ All entries synced</span>}
        </div>
      </div>

      {/* #10 draft readiness pipeline */}
      <DraftPipeline status={status} />

      {/* ── TWO-COL: warnings + recent ──────────────────────────────────── */}
      <div className="dash-two-col" style={{ display:"grid",
        gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20 }}>

        {/* #17 warnings full-width treatment */}
        <div style={{ background:"#fff",
          border:`1px solid ${MOCK_WARNINGS.length>0?"#FCA5A5":"#86EFAC"}`,
          borderLeft:`4px solid ${MOCK_WARNINGS.length>0?"#DC2626":"#22c55e"}`,
          borderRadius:12,overflow:"hidden" }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",
            padding:"14px 18px",borderBottom:"1px solid #F0EEE8" }}>
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,
              textTransform:"uppercase",letterSpacing:".07em",
              color:MOCK_WARNINGS.length>0?"#991B1B":"#166534" }}>
              {MOCK_WARNINGS.length>0?"⚠ Active warnings":"✓ No warnings"}
            </span>
            {MOCK_WARNINGS.length>0 && (
              <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,
                background:"#FEF2F2",color:"#991B1B",padding:"2px 10px",
                borderRadius:99,border:"1px solid #FCA5A5" }}>
                {MOCK_WARNINGS.length}
              </span>
            )}
          </div>
          {MOCK_WARNINGS.length===0 ? (
            <div style={{ padding:"20px 18px",fontFamily:"'DM Mono',monospace",
              fontSize:12,color:"#166534",textAlign:"center" }}>
              All players clear for 2027
            </div>
          ) : MOCK_WARNINGS.map(w => (
            <div key={w.id} className="warn-row"
              style={{ display:"flex",alignItems:"flex-start",gap:10,
                padding:"12px 18px",borderBottom:"1px solid #F6F5F0",
                cursor:"pointer",transition:"background .12s" }}
              onClick={()=>navigate(w.link)}>
              <div style={{ width:8,height:8,borderRadius:"50%",background:"#DC2626",
                flexShrink:0,marginTop:5 }}/>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:600,
                  color:"#1a1a2e",marginBottom:2 }}>{w.player}</div>
                <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#888" }}>
                  {w.detail}
                </div>
              </div>
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#bbb",
                flexShrink:0 }}>{w.time}</div>
            </div>
          ))}
        </div>

        {/* #7 recent imports with empty state */}
        <div style={{ background:"#fff",border:"1px solid #E8E6DF",
          borderRadius:12,overflow:"hidden" }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",
            padding:"14px 18px",borderBottom:"1px solid #F0EEE8" }}>
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,
              textTransform:"uppercase",letterSpacing:".07em",color:"#444" }}>
              Recent registrations
            </span>
            <button onClick={()=>navigate("grsh-tm-players")} style={{
              fontFamily:"'DM Mono',monospace",fontSize:10,background:"transparent",
              border:"none",color:"#1a1a2e",cursor:"pointer",textDecoration:"underline" }}>
              View all →
            </button>
          </div>
          {MOCK_RECENT.length===0 ? (
            <div style={{ padding:"28px 18px",textAlign:"center" }}>
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#aaa",
                marginBottom:10 }}>No registrations yet</div>
              <button onClick={handleSync} style={{ fontFamily:"'DM Mono',monospace",
                fontSize:11,background:"#1a1a2e",color:"#D4A017",border:"none",
                padding:"6px 14px",borderRadius:6,cursor:"pointer" }}>
                Sync from WPForms
              </button>
            </div>
          ) : MOCK_RECENT.map(r => (
            <div key={r.id} className="recent-row"
              style={{ display:"flex",alignItems:"center",gap:10,
                padding:"10px 18px",borderBottom:"1px solid #F6F5F0",
                cursor:"pointer",transition:"background .12s" }}>
              <div style={{ width:32,height:32,borderRadius:"50%",background:"#1a1a2e",
                color:"#D4A017",display:"flex",alignItems:"center",justifyContent:"center",
                fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:500,flexShrink:0 }}>
                {r.name.split(" ").map(n=>n[0]).join("").slice(0,2)}
              </div>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:600,
                  color:"#1a1a2e",display:"flex",alignItems:"center",gap:5 }}>
                  {r.name}
                  {r.type==="sub" && (
                    <span style={{ fontFamily:"'DM Mono',monospace",fontSize:8,
                      background:"#EDE9FE",color:"#4C1D95",padding:"1px 5px",
                      borderRadius:3 }}>ALT</span>
                  )}
                </div>
                <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#888" }}>
                  <span style={{ color:DIV_COLOR[r.division]||"#555",fontWeight:500 }}>
                    {r.division}
                  </span>
                  {r.position!=="—"&&<> · {r.position}</>}
                  {" · "}{r.time}
                </div>
              </div>
              <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:500,
                background:STATUS_STYLE[r.status]?.bg,color:STATUS_STYLE[r.status]?.color,
                padding:"2px 8px",borderRadius:99 }}>{r.status}</span>
            </div>
          ))}
        </div>

      </div>

      {/* ── DIVISION BREAKDOWN — #8 #9 #15 #19 #20 #24 #26 #29 ─────────── */}
      <div style={{ background:"#fff",border:"1px solid #E8E6DF",
        borderRadius:12,overflow:"hidden",marginBottom:20 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",
          padding:"14px 20px",borderBottom:"1px solid #F0EEE8" }}>
          <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,
            textTransform:"uppercase",letterSpacing:".07em",color:"#444" }}>
            Division breakdown
          </span>
          <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa" }}>
            Click a division to filter players
          </span>
        </div>
        <div className="dash-div-grid" style={{ display:"grid",
          gridTemplateColumns:"repeat(4,1fr)" }}>
          {divisions.map((d,i) => {
            const payPct = Math.round((d.paid/d.registered)*100);
            const fillPct = Math.round((d.registered/(d.cap||30))*100);
            const payOk  = payPct >= 90;
            const delta  = d.registered - (d.prior_year||d.registered);
            const totalTier = d.tiers.A+d.tiers.B+d.tiers.C+d.tiers.R;
            return (
              <div key={d.name} className="div-card"
                onClick={()=>navigate(`grsh-tm-players`)}
                style={{ padding:"18px 18px 14px",cursor:"pointer",
                  borderRight:i<divisions.length-1?"1px solid #F0EEE8":"none",
                  transition:"background .12s",position:"relative",overflow:"hidden" }}>
                <div style={{ position:"absolute",top:0,left:0,right:0,height:4,background:d.color }}/>
                {/* #9 clickable division name */}
                <div style={{ fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:700,
                  color:d.color,marginBottom:4,marginTop:4 }}>{d.name}</div>
                {/* #15 fill vs cap */}
                <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",marginBottom:12 }}>
                  {d.registered} / {d.cap||30} cap
                  {/* #16 YoY delta */}
                  {delta!==0 && (
                    <span style={{ marginLeft:6,
                      color:delta>0?"#166534":"#991B1B",fontWeight:600 }}>
                      {delta>0?"↑":"↓"}{Math.abs(delta)}
                    </span>
                  )}
                </div>
                {/* Stats grid */}
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 0",marginBottom:12 }}>
                  {[
                    [d.registered,"registered"],
                    [d.paid,"paid"],
                    [`${d.goalies}G`,"goalies"],
                    [`${d.subs}`, "alternates"],
                  ].map(([v,l]) => (
                    <div key={l}>
                      <div style={{ fontFamily:"'Fraunces',serif",fontSize:18,fontWeight:700,
                        color:"#1a1a2e",lineHeight:1 }}>{v}</div>
                      <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",
                        textTransform:"uppercase",letterSpacing:".05em" }}>{l}</div>
                    </div>
                  ))}
                </div>
                {/* #20 payment bar with 95% target line */}
                <div style={{ position:"relative",marginBottom:4 }}>
                  <div style={{ height:6,background:"#F0EEE8",borderRadius:99,overflow:"hidden" }}>
                    <div style={{ height:"100%",borderRadius:99,
                      background:payOk?d.color:"#f59e0b",
                      width:`${payPct}%`,transition:"width .8s ease" }}/>
                  </div>
                  {/* 95% target dashed line */}
                  <div style={{ position:"absolute",top:-2,left:"95%",
                    height:10,width:1,background:"#aaa",borderLeft:"1px dashed #aaa" }}/>
                </div>
                <div style={{ display:"flex",justifyContent:"space-between",
                  fontFamily:"'DM Mono',monospace",fontSize:9 }}>
                  <span style={{ color:payOk?"#166534":"#92400E",fontWeight:500 }}>
                    {payPct}% paid {!payOk&&`· ${d.unpaid||d.registered-d.paid} unpaid`}
                  </span>
                  <span style={{ color:"#aaa" }}>95% target</span>
                </div>
                {/* #26 #29 tier distribution bar */}
                <div style={{ marginTop:10 }}>
                  <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",marginBottom:3 }}>
                    Tier mix
                  </div>
                  <div style={{ display:"flex",height:6,borderRadius:99,overflow:"hidden",gap:1 }}>
                    {[
                      {count:d.tiers.A,color:"#FCE8E8",label:"A"},
                      {count:d.tiers.B,color:"#FEF0E8",label:"B"},
                      {count:d.tiers.C,color:"#FEF9E7",label:"C"},
                      {count:d.tiers.R,color:"#E8F0FE",label:"R"},
                    ].filter(t=>t.count>0).map(t => (
                      <div key={t.label} title={`${t.label} tier: ${t.count} players`}
                        style={{ flex:t.count,background:t.color,
                          minWidth:t.count>0?4:0 }}/>
                    ))}
                  </div>
                  <div style={{ display:"flex",gap:8,marginTop:3 }}>
                    {[
                      {count:d.tiers.A,color:"#7A1818",label:"A"},
                      {count:d.tiers.B,color:"#7A4518",label:"B"},
                      {count:d.tiers.C,color:"#7A5A18",label:"C"},
                      {count:d.tiers.R,color:"#1A3F8F",label:"R"},
                    ].filter(t=>t.count>0).map(t=>(
                      <span key={t.label} style={{ fontFamily:"'DM Mono',monospace",
                        fontSize:8,color:t.color }}>{t.label}:{t.count}</span>
                    ))}
                  </div>
                </div>
                {/* #24 alternates available chip */}
                {d.subs > 0 && (
                  <div style={{ marginTop:8,display:"inline-block",
                    fontFamily:"'DM Mono',monospace",fontSize:9,
                    background:"#EDE9FE",color:"#4C1D95",
                    padding:"2px 8px",borderRadius:99 }}>
                    {d.subs} alternates available →
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* #19 goalie summary callout */}
      {(() => {
        const total = divisions.reduce((s,d)=>s+d.goalies,0);
        const perDiv = (total/Math.max(1,divisions.length)).toFixed(1);
        const lowDivs = divisions.filter(d=>d.goalies<2).map(d=>d.name);
        return (
          <div style={{ background:lowDivs.length>0?"#FFFBEB":"#F0FDF4",
            border:`1px solid ${lowDivs.length>0?"#FDE68A":"#86EFAC"}`,
            borderRadius:10,padding:"10px 18px",marginBottom:20,
            display:"flex",alignItems:"center",gap:12 }}>
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,
              color:lowDivs.length>0?"#92400E":"#166534" }}>
              {lowDivs.length>0
                ? `⚠ ${lowDivs.join(", ")} may be short on goalies — fewer than 2 registered`
                : `✓ ${total} goalies across ${divisions.length} divisions (${perDiv} avg)`}
            </span>
          </div>
        );
      })()}

      {/* #21 activity feed */}
      <div style={{ background:"#fff",border:"1px solid #E8E6DF",
        borderRadius:12,overflow:"hidden" }}>
        <div style={{ padding:"14px 20px",borderBottom:"1px solid #F0EEE8",
          display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,
            textTransform:"uppercase",letterSpacing:".07em",color:"#444" }}>
            Recent activity
          </span>
          <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa" }}>
            Audit log
          </span>
        </div>
        {MOCK_ACTIVITY.map((a,i) => (
          <div key={i} style={{ display:"flex",alignItems:"center",gap:12,
            padding:"10px 20px",borderBottom:"1px solid #F9F8F4" }}>
            <div style={{ width:28,height:28,borderRadius:"50%",background:"#F6F5F0",
              display:"flex",alignItems:"center",justifyContent:"center",
              fontFamily:"'DM Mono',monospace",fontSize:9,color:"#888",flexShrink:0 }}>
              {a.user.slice(0,2).toUpperCase()}
            </div>
            <div style={{ flex:1 }}>
              <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,
                color:"#1a1a2e",fontWeight:500 }}>{a.action}</span>
              <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#888" }}>
                {" — "}{a.detail}
              </span>
            </div>
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,
              color:"#bbb",flexShrink:0 }}>{a.time}</div>
          </div>
        ))}
      </div>

    </div>
  );
}
