// Alternates.jsx — v2
// FIXES APPLIED:
//  1. handleConfirmActivation now calls PATCH /wp-json/grsh/v1/alternates/{id}/activate
//  2. 409 duplicate response handled — shows toast, does NOT update state
//  3. State updated with real log_id returned from server (not log.length + 1)
//  4. API and NONCE constants now actually used

import { useState, useMemo, useEffect } from "react";

const API   = window.grshConfig?.apiUrl || "/wp-json/grsh/v1";
const NONCE = window.grshConfig?.nonce  || "";

// ─── Mock data ────────────────────────────────────────────────────────────────
const MOCK_ALTERNATES = [
  { id:3,  first_name:"Tom",   last_name:"Breslin",  email:"t.breslin@email.com",  phone:"+19165550101",
    position:null,          skill_tier_reported:"R2", age:52, jersey_size:"XL",
    available_days:["friday","saturday","sunday"], max_games_per_day:2, late_game_available:true,
    division_eligibility:["senior_b","senior_c"], times_activated:0, last_activated_at:null,
    status:"approved", notes:"",       priority:1, today_activations:0 },
  { id:12, first_name:"Amy",   last_name:"Buchanan", email:"a.buchanan@email.com", phone:"+19165550102",
    position:null,          skill_tier_reported:"R1", age:48, jersey_size:"M",
    available_days:["saturday"], max_games_per_day:1, late_game_available:false,
    division_eligibility:["gold_open"], times_activated:2, last_activated_at:"2026-03-14",
    status:"approved", notes:"Reliable — showed both times", priority:4, today_activations:0 },
  { id:22, first_name:"Marco", last_name:"Reyes",    email:"m.reyes@email.com",    phone:"+19165550103",
    position:"goaltender",  skill_tier_reported:"C1", age:50, jersey_size:"Goalie",
    available_days:["thursday","friday","saturday","sunday"], max_games_per_day:3, late_game_available:true,
    division_eligibility:["45a","senior_b","senior_c"], times_activated:1, last_activated_at:"2026-03-15",
    status:"approved", notes:"Emergency goalie — call first", priority:2, today_activations:0 },
  { id:23, first_name:"Diane", last_name:"Korte",    email:"d.korte@email.com",    phone:"+19165550104",
    position:"defenseman",  skill_tier_reported:"B2", age:45, jersey_size:"S",
    available_days:["saturday","sunday"], max_games_per_day:2, late_game_available:true,
    division_eligibility:["gold_open","45a"], times_activated:0, last_activated_at:null,
    status:"approved", notes:"", priority:3, today_activations:0 },
  { id:24, first_name:"Kevin", last_name:"Marsh",    email:"k.marsh@email.com",    phone:"+19165550105",
    position:"winger",      skill_tier_reported:"C2", age:55, jersey_size:"2XL",
    available_days:["friday","saturday"], max_games_per_day:1, late_game_available:false,
    division_eligibility:["senior_c"], times_activated:3, last_activated_at:"2026-03-16",
    status:"approved", notes:"Used frequently last season", priority:6, today_activations:1 },
  { id:25, first_name:"Priya", last_name:"Nair",     email:"p.nair@email.com",     phone:"+19165550106",
    position:"center",      skill_tier_reported:"R3", age:43, jersey_size:"M",
    available_days:["sunday"], max_games_per_day:1, late_game_available:false,
    division_eligibility:["senior_b","senior_c"], times_activated:0, last_activated_at:null,
    status:"approved", notes:"Only available Sundays", priority:7, today_activations:0 },
  { id:26, first_name:"Brian", last_name:"Halloran", email:"b.halloran@email.com", phone:"+19165550107",
    position:"winger",      skill_tier_reported:"B1", age:44, jersey_size:"L",
    available_days:["thursday","friday","saturday","sunday"], max_games_per_day:3, late_game_available:true,
    division_eligibility:["gold_open","45a","senior_b"], times_activated:1, last_activated_at:"2026-03-13",
    status:"approved", notes:"", priority:2, today_activations:0 },
  { id:27, first_name:"Lena",  last_name:"Fischer",  email:"l.fischer@email.com",  phone:"+19165550108",
    position:"goaltender",  skill_tier_reported:"R2", age:48, jersey_size:"Goalie",
    available_days:["saturday","sunday"], max_games_per_day:2, late_game_available:true,
    division_eligibility:["gold_open","45a"], times_activated:0, last_activated_at:null,
    status:"approved", notes:"Backup goalie — Gold Open preferred", priority:3, today_activations:0 },
];

const MOCK_LOG = [
  { id:1, alternate_id:12, player_name:"Amy Buchanan",   team:"Team Gold", division:"gold_open", game_date:"2026-03-14", activated_by:"Lorenzo", reason:"injury",       notes:"Replaced Chris Fontaine" },
  { id:2, alternate_id:22, player_name:"Marco Reyes",    team:"Team Blue", division:"45a",       game_date:"2026-03-15", activated_by:"Lorenzo", reason:"illness",      notes:"Emergency goalie" },
  { id:3, alternate_id:24, player_name:"Kevin Marsh",    team:"Team Red",  division:"senior_c",  game_date:"2026-03-16", activated_by:"Lorenzo", reason:"short_roster", notes:"" },
  { id:4, alternate_id:12, player_name:"Amy Buchanan",   team:"Team Gold", division:"gold_open", game_date:"2026-03-17", activated_by:"Lorenzo", reason:"short_roster", notes:"Second activation" },
  { id:5, alternate_id:26, player_name:"Brian Halloran", team:"Team Blue", division:"45a",       game_date:"2026-03-13", activated_by:"Lorenzo", reason:"injury",       notes:"" },
];

const TOURNAMENT_DATES = {
  thursday:"Apr 10", friday:"Apr 11", saturday:"Apr 12", sunday:"Apr 13",
};

const DIVISION_LABEL = { gold_open:"Gold Open","45a":"45A",senior_b:"Senior B",senior_c:"Senior C",womens:"Womens" };
const DIVISION_COLOR = {
  gold_open:{ bg:"#FEF9E7",color:"#92601A",border:"#F5D77E" },
  "45a":    { bg:"#E8F6F8",color:"#1A5F6B",border:"#9DD5DC" },
  senior_b: { bg:"#F3EEF9",color:"#4A3070",border:"#C4AEED" },
  senior_c: { bg:"#FDF0E8",color:"#7A3318",border:"#F5B993" },
};
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
const DAYS = ["thursday","friday","saturday","sunday"];
const DAY_SHORT = { thursday:"Thu",friday:"Fri",saturday:"Sat",sunday:"Sun" };
const AVATAR_COLORS = ["#1a1a2e","#1E3A5F","#3B1F5E","#1F4E3B","#5E3B1F","#4A1F1F","#1F3D4E","#3D2B1F"];
const avatarColor = (id) => AVATAR_COLORS[id % AVATAR_COLORS.length];
const TIER_ORDER = ["A1","A2","A3","B1","B2","B3","C1","C2","R1","R2","R3"];

// ─── WOW: Smart Sub Dispatch scoring ─────────────────────────────────────────
function scoreAlternate(alt, division, day) {
  let score = 100;
  if (division && !alt.division_eligibility.includes(division)) return -1;
  if (day && !alt.available_days.includes(day)) return -1;
  if (alt.today_activations >= alt.max_games_per_day) return -1;
  const tierIdx = TIER_ORDER.indexOf(alt.skill_tier_reported);
  score += (10 - tierIdx) * 3;
  score -= alt.times_activated * 5;
  if (alt.late_game_available) score += 5;
  score += alt.available_days.length * 2;
  score += alt.max_games_per_day * 3;
  return Math.max(0, score);
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Pill({ bg, color, border, children, small }) {
  return (
    <span style={{ display:"inline-block",background:bg,color,
      border:`1px solid ${border||bg}`,
      fontSize:small?10:11,fontFamily:"'DM Mono',monospace",fontWeight:500,
      padding:small?"1px 6px":"2px 8px",borderRadius:99,whiteSpace:"nowrap" }}>
      {children}
    </span>
  );
}

function UsageBadge({ count, maxed }) {
  if (maxed) return <Pill bg="#FEE2E2" color="#991B1B" small>Maxed today</Pill>;
  if (count === 0) return <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#22c55e",fontWeight:500 }}>● Never used</span>;
  if (count >= 3)  return <Pill bg="#FEF3C7" color="#92400E" small>★ {count}× — reliable</Pill>;
  return <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#888" }}>{count}× used</span>;
}

function AvailabilityChips({ days, filterDay }) {
  return (
    <div style={{ display:"flex",gap:4,flexWrap:"wrap" }}>
      {DAYS.map(d => {
        const avail = days.includes(d);
        const isFilter = filterDay === d;
        return (
          <div key={d} title={`${DAY_SHORT[d]} ${TOURNAMENT_DATES[d]}`} style={{
            padding:"3px 8px",borderRadius:4,
            background:avail?(isFilter?"#D4A017":"#1a1a2e"):"#F0EEE8",
            border:`1px solid ${avail?(isFilter?"#B8860B":"#1a1a2e"):"#E8E6DF"}`,
            display:"flex",flexDirection:"column",alignItems:"center",
          }}>
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:9,fontWeight:600,
              color:avail?"#D4A017":"#ccc" }}>{DAY_SHORT[d]}</span>
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:7,
              color:avail?"rgba(212,160,23,.7)":"#ddd" }}>{TOURNAMENT_DATES[d]}</span>
          </div>
        );
      })}
    </div>
  );
}

function TierPositionRow({ tier, position }) {
  const tc = TIER_COLOR(tier);
  const pc = position ? POSITION_COLOR[position] : null;
  return (
    <div style={{ display:"flex",gap:5,alignItems:"center",flexWrap:"wrap",marginBottom:8 }}>
      {tier && <Pill {...tc} small>{tier}</Pill>}
      {pc && <Pill {...pc} small>{POSITION_LABEL[position]}</Pill>}
      {position==="goaltender" && (
        <span style={{ fontFamily:"'DM Mono',monospace",fontSize:9,
          background:"#FCE8E8",color:"#7A1818",padding:"1px 6px",
          borderRadius:99,border:"1px solid #f5c6c6",fontWeight:600 }}>
          🥅 GOALIE
        </span>
      )}
    </div>
  );
}

// ─── Activate modal ───────────────────────────────────────────────────────────
function ActivateModal({ alternate, onConfirm, onClose }) {
  const [team,   setTeam]   = useState("");
  const [div,    setDiv]    = useState(alternate.division_eligibility[0]||"");
  const [day,    setDay]    = useState("");
  const [reason, setReason] = useState("injury");
  const [notes,  setNotes]  = useState("");
  const canSubmit = team && div && day;

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.45)",
      zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center" }}
      onClick={onClose}>
      <div style={{ width:440,background:"#fff",borderRadius:16,overflow:"hidden",
        boxShadow:"0 24px 60px rgba(0,0,0,.2)",animation:"slideUp .25s ease" }}
        onClick={e=>e.stopPropagation()}>
        <div style={{ padding:"18px 22px 14px",borderBottom:"1px solid #F0EEE8",
          background:"#1a1a2e",display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
          <div>
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#D4A017",
              textTransform:"uppercase",letterSpacing:".1em",marginBottom:4 }}>Activate alternate</div>
            <div style={{ fontFamily:"'Fraunces',serif",fontSize:18,fontWeight:700,color:"#fff" }}>
              {alternate.first_name} {alternate.last_name}
            </div>
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"rgba(212,160,23,.7)",marginTop:2 }}>
              {alternate.phone}
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none",border:"none",
            fontSize:16,color:"#D4A017",cursor:"pointer" }}>✕</button>
        </div>

        <div style={{ padding:"18px 22px",display:"flex",flexDirection:"column",gap:14 }}>
          <div style={{ background:"#F6F5F0",borderRadius:8,padding:"10px 12px" }}>
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",
              textTransform:"uppercase",marginBottom:6 }}>Sub availability</div>
            <AvailabilityChips days={alternate.available_days} filterDay={null} />
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#888",marginTop:6 }}>
              {alternate.late_game_available ? "✓ Available for late games" : "✗ Not available for late games"}
              {" · "}Max {alternate.max_games_per_day}/day
            </div>
          </div>

          <div>
            <label style={fL}>Game day *</label>
            <select value={day} onChange={e=>setDay(e.target.value)} style={selS}>
              <option value="">Select day…</option>
              {DAYS.filter(d=>alternate.available_days.includes(d)).map(d=>(
                <option key={d} value={d}>{DAY_SHORT[d]} — {TOURNAMENT_DATES[d]}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={fL}>Division *</label>
            <select value={div} onChange={e=>setDiv(e.target.value)} style={selS}>
              {alternate.division_eligibility.map(d=>(
                <option key={d} value={d}>{DIVISION_LABEL[d]||d}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={fL}>Team *</label>
            <input value={team} onChange={e=>setTeam(e.target.value)}
              placeholder="e.g. Team Red" style={inputS} />
          </div>
          <div>
            <label style={fL}>Reason</label>
            <select value={reason} onChange={e=>setReason(e.target.value)} style={selS}>
              {["injury","illness","short_roster","no_show","other"].map(r=>(
                <option key={r} value={r}>{r.replace("_"," ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={fL}>Notes (optional)</label>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)}
              rows={2} placeholder="Who they're replacing, any other context…"
              style={{ ...inputS,resize:"vertical" }} />
          </div>
        </div>

        <div style={{ display:"flex",gap:10,padding:"14px 22px 20px",borderTop:"1px solid #F0EEE8" }}>
          <button onClick={onClose} style={{ flex:1,fontFamily:"'DM Mono',monospace",fontSize:12,
            background:"#F6F5F0",border:"1px solid #E8E6DF",color:"#666",
            padding:"10px",borderRadius:8,cursor:"pointer" }}>Cancel</button>
          <button onClick={()=>canSubmit&&onConfirm({team,div,day,reason,notes})}
            disabled={!canSubmit} style={{ flex:2,fontFamily:"'DM Mono',monospace",fontSize:12,
              fontWeight:500,background:canSubmit?"#1a1a2e":"#ccc",color:canSubmit?"#D4A017":"#fff",
              border:"none",padding:"10px",borderRadius:8,cursor:canSubmit?"pointer":"not-allowed",
              transition:"all .15s" }}>
            Confirm activation →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Smart Sub Dispatch ───────────────────────────────────────────────────────
function SmartDispatch({ alternates, filterDiv, filterDay, onActivate, onDismiss }) {
  const [unavailable, setUnavailable] = useState(new Set());

  const ranked = useMemo(() => {
    return alternates
      .filter(a => !unavailable.has(a.id))
      .map(a => ({ ...a, dispatchScore: scoreAlternate(a, filterDiv, filterDay) }))
      .filter(a => a.dispatchScore >= 0)
      .sort((a, b) => b.dispatchScore - a.dispatchScore);
  }, [alternates, filterDiv, filterDay, unavailable]);

  const markUnavailable = (id) => setUnavailable(s => new Set([...s, id]));

  return (
    <div style={{ background:"#1a1a2e",borderRadius:14,overflow:"hidden",marginBottom:20,
      boxShadow:"0 8px 32px rgba(26,26,46,.25)" }}>
      <div style={{ padding:"18px 22px 14px",borderBottom:"1px solid rgba(255,255,255,.08)",
        display:"flex",justifyContent:"space-between",alignItems:"center" }}>
        <div>
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#D4A017",
            letterSpacing:".12em",textTransform:"uppercase",marginBottom:4 }}>
            ⚡ Smart Sub Dispatch
          </div>
          <div style={{ fontFamily:"'Fraunces',serif",fontSize:18,fontWeight:700,color:"#fff" }}>
            Who should I call?
          </div>
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:11,
            color:"rgba(255,255,255,.4)",marginTop:2 }}>
            Ranked by tier · availability · activation history
            {filterDiv && ` · filtered to ${DIVISION_LABEL[filterDiv]||filterDiv}`}
            {filterDay && ` · ${DAY_SHORT[filterDay]} ${TOURNAMENT_DATES[filterDay]}`}
          </div>
        </div>
        <button onClick={onDismiss} style={{ background:"rgba(255,255,255,.08)",
          border:"1px solid rgba(255,255,255,.12)",color:"rgba(255,255,255,.5)",
          fontFamily:"'DM Mono',monospace",fontSize:11,padding:"6px 12px",
          borderRadius:8,cursor:"pointer" }}>Hide</button>
      </div>

      {ranked.length === 0 ? (
        <div style={{ padding:"28px 22px",fontFamily:"'DM Mono',monospace",
          fontSize:12,color:"rgba(255,255,255,.3)",textAlign:"center" }}>
          No available alternates match these filters
        </div>
      ) : (
        <div>
          {ranked.slice(0, 4).map((a, i) => {
            const tc   = TIER_COLOR(a.skill_tier_reported);
            const isFirst = i === 0;
            const maxed   = a.today_activations >= a.max_games_per_day;
            return (
              <div key={a.id} style={{
                display:"flex",alignItems:"center",gap:14,padding:"14px 22px",
                borderBottom:"1px solid rgba(255,255,255,.06)",
                background:isFirst?"rgba(212,160,23,.08)":"transparent",
                transition:"background .15s",
              }}>
                <div style={{ width:26,height:26,borderRadius:"50%",flexShrink:0,
                  background:isFirst?"#D4A017":"rgba(255,255,255,.1)",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:700,
                  color:isFirst?"#1a1a2e":"rgba(255,255,255,.3)" }}>{i+1}</div>
                <div style={{ width:36,height:36,borderRadius:"50%",flexShrink:0,
                  background:avatarColor(a.id),color:"#D4A017",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500 }}>
                  {a.first_name[0]}{a.last_name[0]}
                </div>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:3 }}>
                    <span style={{ fontFamily:"'Fraunces',serif",fontSize:14,
                      fontWeight:700,color:isFirst?"#D4A017":"#fff" }}>
                      {a.first_name} {a.last_name}
                    </span>
                    <Pill {...tc} small>{a.skill_tier_reported}</Pill>
                    {a.position==="goaltender" && (
                      <span style={{ fontFamily:"'DM Mono',monospace",fontSize:8,
                        background:"rgba(252,232,232,.15)",color:"#f5c6c6",
                        padding:"1px 5px",borderRadius:3 }}>🥅 GOALIE</span>
                    )}
                    {isFirst && (
                      <span style={{ fontFamily:"'DM Mono',monospace",fontSize:8,
                        background:"#D4A017",color:"#1a1a2e",fontWeight:700,
                        padding:"1px 6px",borderRadius:3 }}>CALL FIRST</span>
                    )}
                  </div>
                  <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,
                    color:"rgba(255,255,255,.35)",display:"flex",gap:10 }}>
                    <span>{a.phone}</span>
                    <span>·</span>
                    <span>{a.division_eligibility.map(d=>DIVISION_LABEL[d]||d).join(", ")}</span>
                    <span>·</span>
                    <span>{a.times_activated===0?"Never used":`${a.times_activated}× used`}</span>
                  </div>
                </div>
                <div style={{ fontFamily:"'Fraunces',serif",fontSize:18,fontWeight:700,
                  color:isFirst?"#D4A017":"rgba(255,255,255,.3)",textAlign:"right",
                  minWidth:36,flexShrink:0 }}>{Math.round(a.dispatchScore)}</div>
                <div style={{ display:"flex",gap:6,flexShrink:0 }}>
                  <button onClick={()=>markUnavailable(a.id)} style={{
                    fontFamily:"'DM Mono',monospace",fontSize:10,
                    background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",
                    color:"rgba(255,255,255,.4)",padding:"5px 10px",borderRadius:6,cursor:"pointer" }}>
                    Unavailable
                  </button>
                  <button onClick={()=>onActivate(a)} style={{
                    fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:500,
                    background:isFirst?"#D4A017":"rgba(212,160,23,.15)",
                    color:isFirst?"#1a1a2e":"#D4A017",
                    border:`1px solid ${isFirst?"#D4A017":"rgba(212,160,23,.3)"}`,
                    padding:"5px 12px",borderRadius:6,cursor:"pointer" }}>
                    Activate →
                  </button>
                </div>
              </div>
            );
          })}
          {ranked.length > 4 && (
            <div style={{ padding:"10px 22px",fontFamily:"'DM Mono',monospace",
              fontSize:10,color:"rgba(255,255,255,.25)" }}>
              + {ranked.length-4} more alternates available
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Alternate card ───────────────────────────────────────────────────────────
function AlternateCard({ alt, view, filterDay, onActivate, onNoteChange }) {
  const [editingNote, setEditingNote] = useState(false);
  const [note, setNote] = useState(alt.notes || "");
  const tc    = TIER_COLOR(alt.skill_tier_reported);
  const pc    = alt.position ? POSITION_COLOR[alt.position] : null;
  const maxed = alt.today_activations >= alt.max_games_per_day;

  const saveNote = () => {
    onNoteChange(alt.id, note);
    setEditingNote(false);
  };

  if (view === "list") {
    return (
      <div style={{ display:"flex",alignItems:"center",gap:12,
        padding:"11px 16px",borderBottom:"1px solid #F3F2ED",
        background:maxed?"#FEF2F2":"transparent",cursor:"default" }}>
        <div style={{ width:32,height:32,borderRadius:"50%",
          background:avatarColor(alt.id),color:"#D4A017",
          display:"flex",alignItems:"center",justifyContent:"center",
          fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,flexShrink:0 }}>
          {alt.first_name[0]}{alt.last_name[0]}
        </div>
        <div style={{ minWidth:160 }}>
          <div style={{ fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:700,
            color:"#1a1a2e",marginBottom:2 }}>
            {alt.first_name} {alt.last_name}
            {alt.position==="goaltender" && <span style={{ marginLeft:5,fontSize:10 }}>🥅</span>}
          </div>
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa" }}>
            {alt.email}
          </div>
        </div>
        <div style={{ minWidth:48 }}><Pill {...tc} small>{alt.skill_tier_reported}</Pill></div>
        <div style={{ flex:1,display:"flex",gap:3,flexWrap:"wrap" }}>
          {alt.division_eligibility.slice(0,2).map(d=>{
            const dc=DIVISION_COLOR[d]||{};
            return <Pill key={d} {...dc} small>{DIVISION_LABEL[d]||d}</Pill>;
          })}
          {alt.division_eligibility.length>2&&<span style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa" }}>+{alt.division_eligibility.length-2}</span>}
        </div>
        <AvailabilityChips days={alt.available_days} filterDay={filterDay} />
        <div style={{ minWidth:80 }}>
          <UsageBadge count={alt.times_activated} maxed={maxed} />
        </div>
        <div style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#888",minWidth:30,textAlign:"right" }}>
          {alt.age}
        </div>
        <button onClick={()=>onActivate(alt)} disabled={maxed}
          style={{ fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:500,
            background:maxed?"#F0EEE8":"#1a1a2e",color:maxed?"#aaa":"#D4A017",
            border:"none",padding:"5px 12px",borderRadius:6,
            cursor:maxed?"not-allowed":"pointer",flexShrink:0 }}>
          {maxed?"Maxed":"Activate →"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ background:"#fff",border:`1px solid ${maxed?"#FCA5A5":"#E8E6DF"}`,
      borderRadius:12,overflow:"hidden",
      borderTop:`4px solid ${maxed?"#EF4444":avatarColor(alt.id)}` }}>
      <div style={{ padding:"14px 16px 10px",borderBottom:"1px solid #F0EEE8" }}>
        <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:6 }}>
          <div style={{ width:36,height:36,borderRadius:"50%",
            background:avatarColor(alt.id),color:"#D4A017",flexShrink:0,
            display:"flex",alignItems:"center",justifyContent:"center",
            fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:500 }}>
            {alt.first_name[0]}{alt.last_name[0]}
          </div>
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:700,
              color:"#1a1a2e",lineHeight:1.2,marginBottom:3 }}>
              {alt.first_name} {alt.last_name}
            </div>
            <a href={`tel:${alt.phone}`} style={{ fontFamily:"'DM Mono',monospace",
              fontSize:11,color:"#1a1a2e",textDecoration:"none",fontWeight:500,display:"block" }}>
              {alt.phone}
            </a>
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",marginTop:1 }}>
              {alt.email}
            </div>
          </div>
          <div style={{ textAlign:"right" }}>
            <UsageBadge count={alt.times_activated} maxed={maxed} />
            {alt.today_activations > 0 && (
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,
                color:maxed?"#991B1B":"#92400E",marginTop:3 }}>
                {alt.today_activations}/{alt.max_games_per_day} today
              </div>
            )}
          </div>
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:6,flexWrap:"wrap" }}>
          {alt.skill_tier_reported && <Pill {...tc} small>{alt.skill_tier_reported}</Pill>}
          {pc && <Pill {...pc} small>{POSITION_LABEL[alt.position]}</Pill>}
          {alt.position==="goaltender" && (
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:8,
              background:"#FCE8E8",color:"#7A1818",padding:"1px 6px",
              borderRadius:99,border:"1px solid #f5c6c6",fontWeight:600 }}>🥅 GOALIE</span>
          )}
          {alt.age && (
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa" }}>
              Age {alt.age}
            </span>
          )}
          {alt.jersey_size && (
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa" }}>
              Jersey {alt.jersey_size}
            </span>
          )}
        </div>
      </div>

      <div style={{ padding:"12px 16px",display:"flex",flexDirection:"column",gap:10 }}>
        <div>
          <div style={cL}>Availability</div>
          <AvailabilityChips days={alt.available_days} filterDay={filterDay} />
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,
            color:"#aaa",marginTop:4,display:"flex",gap:10 }}>
            <span>Max {alt.max_games_per_day}/day</span>
            <span style={{ color:alt.late_game_available?"#166534":"#991B1B",fontWeight:500 }}>
              {alt.late_game_available?"✓ Late games":"✗ No late games"}
            </span>
          </div>
        </div>

        <div>
          <div style={cL}>Division eligibility</div>
          <div style={{ display:"flex",gap:4,flexWrap:"wrap" }}>
            {alt.division_eligibility.length > 0
              ? alt.division_eligibility.map(d => {
                  const dc=DIVISION_COLOR[d]||{};
                  return <Pill key={d} bg={dc.bg} color={dc.color} border={dc.border} small>{DIVISION_LABEL[d]||d}</Pill>;
                })
              : <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa" }}>All divisions</span>}
          </div>
        </div>

        <div>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
            <div style={cL}>Notes</div>
            <button onClick={()=>setEditingNote(e=>!e)} style={{
              fontFamily:"'DM Mono',monospace",fontSize:9,background:"transparent",
              border:"none",color:"#aaa",cursor:"pointer",textDecoration:"underline" }}>
              {editingNote?"Save":"Edit"}
            </button>
          </div>
          {editingNote ? (
            <div style={{ display:"flex",gap:6 }}>
              <input value={note} onChange={e=>setNote(e.target.value)}
                style={{ ...inputS,flex:1,fontSize:11 }} />
              <button onClick={saveNote} style={{ fontFamily:"'DM Mono',monospace",fontSize:10,
                background:"#1a1a2e",color:"#D4A017",border:"none",
                padding:"4px 10px",borderRadius:5,cursor:"pointer" }}>✓</button>
            </div>
          ) : (
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,
              color:note?"#555":"#ccc",fontStyle:note?"normal":"italic" }}>
              {note || "+ Add note"}
            </div>
          )}
        </div>

        <a href="/wp-admin/admin.php?page=grsh-tm-history"
          style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#1a1a2e",
            textDecoration:"underline",display:"block" }}>
          View tournament history →
        </a>
      </div>

      <div style={{ padding:"12px 16px 14px",borderTop:"1px solid #F0EEE8" }}>
        <button onClick={()=>!maxed&&onActivate(alt)} disabled={maxed}
          style={{ width:"100%",fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:500,
            background:maxed?"#F0EEE8":"#1a1a2e",
            color:maxed?"#aaa":"#D4A017",
            border:`1px solid ${maxed?"#E8E6DF":"transparent"}`,
            padding:"10px",borderRadius:8,cursor:maxed?"not-allowed":"pointer",
            transition:"all .15s" }}>
          {maxed?"Maxed out today":"Activate sub →"}
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Alternates() {
  const [alternates,   setAlternates]   = useState(MOCK_ALTERNATES);
  const [log,          setLog]          = useState(MOCK_LOG);
  const [tab,          setTab]          = useState("pool");
  const [view,         setView]         = useState("card");
  const [filterDiv,    setFilterDiv]    = useState("");
  const [filterPos,    setFilterPos]    = useState("");
  const [filterDay,    setFilterDay]    = useState("");
  const [filterGoalie, setFilterGoalie] = useState(false);
  const [search,       setSearch]       = useState("");
  const [sortKey,      setSortKey]      = useState("priority");
  const [activating,   setActivating]   = useState(null);
  const [toast,        setToast]        = useState(null);
  const [showDispatch, setShowDispatch] = useState(false);
  const [compareIds,   setCompareIds]   = useState([]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(()=>setToast(null), 3500);
  };

  const handleActivate = (alt) => setActivating(alt);

  // ── FIX: handleConfirmActivation now calls the REST API ───────────────────
  // Changes from v1:
  //   • Calls PATCH /wp-json/grsh/v1/alternates/{id}/activate
  //   • Uses real X-WP-Nonce from window.grshConfig
  //   • Handles 409 duplicate — shows toast, skips state update
  //   • Uses server-returned log_id instead of log.length + 1
  const handleConfirmActivation = async (alt, { team, div, day, reason, notes }) => {
    setActivating(null); // close modal immediately — don't wait on network

    try {
      const res = await fetch(`${API}/alternates/${alt.id}/activate`, {
        method:  "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-WP-Nonce":   NONCE,
        },
        body: JSON.stringify({
          team,
          division:  div,
          game_date: day,
          reason,
          notes,
        }),
      });

      // 409 = duplicate already recorded on the server
      if (res.status === 409) {
        showToast("⚠ Already activated for this game — skipped");
        return;
      }

      if (!res.ok) {
        throw new Error(`Server error ${res.status}`);
      }

      // Server returns { activated: true, log_id: <int>, player_id: <int> }
      const saved = await res.json();

      // Update log with real DB id from server
      setLog(l => [{
        id:           saved.log_id,
        alternate_id: alt.id,
        player_name:  `${alt.first_name} ${alt.last_name}`,
        team,
        division:     div,
        game_date:    day,
        activated_by: "Lorenzo",
        reason,
        notes,
      }, ...l]);

      // Increment local counters
      setAlternates(as => as.map(a =>
        a.id === alt.id
          ? { ...a, times_activated: a.times_activated + 1, today_activations: a.today_activations + 1 }
          : a
      ));

      showToast(`✓ ${alt.first_name} ${alt.last_name} activated for ${DIVISION_LABEL[div]||div}`);

    } catch (err) {
      console.error("Activation error:", err);
      showToast("⚠ Activation failed — check connection and try again");
    }
  };
  // ─────────────────────────────────────────────────────────────────────────

  const handleNoteChange = (id, note) => {
    setAlternates(as => as.map(a => a.id===id ? {...a,notes:note} : a));
  };

  const toggleCompare = (id) => {
    setCompareIds(ids => ids.includes(id)
      ? ids.filter(i=>i!==id)
      : ids.length < 2 ? [...ids,id] : ids
    );
  };

  const filtered = useMemo(() => {
    let a = [...alternates];
    if (search) a = a.filter(x =>
      `${x.first_name} ${x.last_name} ${x.email}`.toLowerCase().includes(search.toLowerCase())
    );
    if (filterDiv)    a = a.filter(x => x.division_eligibility.includes(filterDiv));
    if (filterPos)    a = a.filter(x => x.position === filterPos);
    if (filterDay)    a = a.filter(x => x.available_days.includes(filterDay));
    if (filterGoalie) a = a.filter(x => x.position === "goaltender");
    a.sort((x, y) => {
      if (sortKey==="tier")  return TIER_ORDER.indexOf(x.skill_tier_reported) - TIER_ORDER.indexOf(y.skill_tier_reported);
      if (sortKey==="usage") return x.times_activated - y.times_activated;
      if (sortKey==="avail") return y.available_days.length - x.available_days.length;
      return (x.priority||99) - (y.priority||99);
    });
    return a;
  }, [alternates, search, filterDiv, filterPos, filterDay, filterGoalie, sortKey]);

  const stats = useMemo(() => ({
    total:    alternates.length,
    goalies:  alternates.filter(a=>a.position==="goaltender").length,
    satAvail: alternates.filter(a=>a.available_days.includes("saturday")).length,
    activated:log.length,
    neverUsed:alternates.filter(a=>a.times_activated===0).length,
  }), [alternates, log]);

  const goalieAlert  = stats.goalies === 0;
  const compareAlts  = alternates.filter(a => compareIds.includes(a.id));
  const activeFilters = [filterDiv,filterPos,filterDay].filter(Boolean).length+(filterGoalie?1:0);
  const clearFilters  = ()=>{setFilterDiv("");setFilterPos("");setFilterDay("");setFilterGoalie(false);setSearch("");};

  const exportCSV = () => {
    const rows = [
      ["Name","Email","Phone","Tier","Position","Age","Division Eligibility",
       "Available Days","Max/Day","Late Games","Times Activated"],
      ...filtered.map(a=>[
        `${a.first_name} ${a.last_name}`,a.email,a.phone,
        a.skill_tier_reported,POSITION_LABEL[a.position]||"—",a.age||"—",
        a.division_eligibility.map(d=>DIVISION_LABEL[d]||d).join("|"),
        a.available_days.map(d=>DAY_SHORT[d]).join("|"),
        a.max_games_per_day,a.late_game_available?"Yes":"No",
        a.times_activated,
      ])
    ];
    const csv  = rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv],{type:"text/csv"});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href=url; a.download="grsh-alternates.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ fontFamily:"'Fraunces',Georgia,serif",background:"#F6F5F0",
      minHeight:"100vh",padding:"24px 28px 60px",maxWidth:1300 }}>
      <style>{`
        *{box-sizing:border-box}
        @keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @media(max-width:768px){
          .alt-grid{grid-template-columns:1fr!important}
          .alt-header{flex-direction:column!important}
          .alt-stats{flex-wrap:wrap!important}
        }
        .alt-card:hover{box-shadow:0 4px 16px rgba(0,0,0,.08)!important}
        .chipbtn:hover{background:#E8E6DF!important}
      `}</style>

      {/* ── HEADER ── */}
      <div className="alt-header" style={{ display:"flex",justifyContent:"space-between",
        alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:10 }}>
        <div>
          <div style={{ display:"inline-block",fontFamily:"'DM Mono',monospace",fontSize:10,
            fontWeight:500,letterSpacing:".1em",textTransform:"uppercase",
            background:"#1a1a2e",color:"#D4A017",padding:"3px 12px",
            borderRadius:99,marginBottom:8 }}>Season 2027</div>
          <h1 style={{ fontFamily:"'Fraunces',serif",fontSize:28,fontWeight:700,
            color:"#1a1a2e",margin:"0 0 3px",letterSpacing:"-.5px" }}>Alternates</h1>
          <p style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#aaa",margin:0 }}>
            Available alternates pool · {alternates.length} registered
          </p>
        </div>
        <div style={{ display:"flex",gap:8,alignItems:"center",flexWrap:"wrap" }}>
          <button onClick={()=>setShowDispatch(d=>!d)} style={{
            fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:500,
            background:"#1a1a2e",color:"#D4A017",border:"none",
            padding:"8px 16px",borderRadius:8,cursor:"pointer",
            display:"flex",alignItems:"center",gap:6 }}>
            ⚡ Find best available
          </button>
          <div style={{ display:"flex",background:"#fff",border:"1px solid #E8E6DF",
            borderRadius:8,overflow:"hidden" }}>
            {["card","list"].map(v=>(
              <button key={v} onClick={()=>setView(v)} style={{
                fontFamily:"'DM Mono',monospace",fontSize:11,
                background:view===v?"#1a1a2e":"transparent",
                color:view===v?"#D4A017":"#888",border:"none",
                padding:"7px 12px",cursor:"pointer" }}>
                {v==="card"?"⊞ Cards":"☰ List"}
              </button>
            ))}
          </div>
          <button onClick={exportCSV} style={{ fontFamily:"'DM Mono',monospace",
            fontSize:12,background:"#fff",border:"1px solid #E8E6DF",color:"#666",
            padding:"8px 14px",borderRadius:8,cursor:"pointer" }}>↓ Export sub list</button>
        </div>
      </div>

      {goalieAlert && (
        <div style={{ background:"#FEF3C7",border:"1px solid #FDE68A",borderRadius:10,
          padding:"10px 16px",marginBottom:14,fontFamily:"'DM Mono',monospace",
          fontSize:11,color:"#92400E",fontWeight:500 }}>
          ⚠ No goalie alternates registered — divisions are exposed if a starting goalie is unavailable.
        </div>
      )}

      {filterDay && filtered.length === 0 && (
        <div style={{ background:"#FEF2F2",border:"1px solid #FCA5A5",borderRadius:10,
          padding:"10px 16px",marginBottom:14,fontFamily:"'DM Mono',monospace",
          fontSize:11,color:"#991B1B" }}>
          ⚠ No alternates available {DAY_SHORT[filterDay]} {TOURNAMENT_DATES[filterDay]} — check division coordinators.
        </div>
      )}

      {showDispatch && (
        <SmartDispatch
          alternates={alternates}
          filterDiv={filterDiv}
          filterDay={filterDay}
          onActivate={handleActivate}
          onDismiss={()=>setShowDispatch(false)}
        />
      )}

      {/* ── STATS BAR ── */}
      <div className="alt-stats" style={{ display:"flex",gap:10,marginBottom:16,flexWrap:"wrap" }}>
        {[
          { label:"Total subs",    val:stats.total,    color:"#1a1a2e", filter:null },
          { label:"Goalies",       val:stats.goalies,  color:"#7A1818", filter:()=>setFilterGoalie(f=>!f) },
          { label:"Sat available", val:stats.satAvail, color:"#1A5F6B", filter:()=>setFilterDay(d=>d==="saturday"?"":"saturday") },
          { label:"Activations",   val:stats.activated,color:"#4A3070", filter:()=>setTab("log") },
          { label:"Never used",    val:stats.neverUsed,color:"#166534", filter:()=>setSortKey("usage") },
        ].map(chip=>(
          <div key={chip.label} className="chipbtn"
            onClick={chip.filter} style={{
              display:"flex",alignItems:"center",gap:8,
              background:"#fff",border:"1px solid #E8E6DF",
              borderRadius:99,padding:"6px 14px",
              cursor:chip.filter?"pointer":"default",
              transition:"background .12s",userSelect:"none" }}>
            <span style={{ fontFamily:"'Fraunces',serif",fontSize:16,
              fontWeight:700,color:chip.color,lineHeight:1 }}>{chip.val}</span>
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,
              color:"#aaa",textTransform:"uppercase",letterSpacing:".07em" }}>
              {chip.label}
            </span>
          </div>
        ))}
      </div>

      {/* ── TABS ── */}
      <div style={{ display:"flex",gap:6,marginBottom:14 }}>
        {[
          { key:"pool", label:"Available Alternates" },
          { key:"log",  label:`Activation log · ${log.length} active` },
        ].map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)} style={{
            fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:500,
            padding:"8px 16px",borderRadius:8,cursor:"pointer",transition:"all .15s",
            background:tab===t.key?"#1a1a2e":"transparent",
            color:tab===t.key?"#D4A017":"#888",
            border:`1px solid ${tab===t.key?"#1a1a2e":"#E8E6DF"}` }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── POOL TAB ── */}
      {tab === "pool" && (
        <>
          <div style={{ display:"flex",gap:12,alignItems:"flex-end",flexWrap:"wrap",
            background:"#fff",border:"1px solid #E8E6DF",borderRadius:10,
            padding:"14px 16px",marginBottom:12 }}>
            <div style={{ display:"flex",flexDirection:"column",gap:4 }}>
              <label style={fL}>Search</label>
              <div style={{ position:"relative" }}>
                <span style={{ position:"absolute",top:7,left:8,color:"#aaa",fontSize:14 }}>⌕</span>
                <input value={search} onChange={e=>setSearch(e.target.value)}
                  placeholder="Name or email…"
                  style={{ ...inputS,paddingLeft:26,minWidth:160 }} />
              </div>
            </div>
            <div style={{ display:"flex",flexDirection:"column",gap:4 }}>
              <label style={fL}>Division</label>
              <div style={{ display:"flex",gap:4 }}>
                {["gold_open","45a","senior_b","senior_c"].map(d=>(
                  <button key={d} onClick={()=>setFilterDiv(v=>v===d?"":d)}
                    style={{ fontFamily:"'DM Mono',monospace",fontSize:10,
                      background:filterDiv===d?(DIVISION_COLOR[d]?.bg||"#F6F5F0"):"#F6F5F0",
                      color:filterDiv===d?(DIVISION_COLOR[d]?.color||"#333"):"#888",
                      border:`1px solid ${filterDiv===d?(DIVISION_COLOR[d]?.border||"#E8E6DF"):"#E8E6DF"}`,
                      padding:"4px 8px",borderRadius:6,cursor:"pointer" }}>
                    {DIVISION_LABEL[d]}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display:"flex",flexDirection:"column",gap:4 }}>
              <label style={fL}>Available day</label>
              <select value={filterDay} onChange={e=>setFilterDay(e.target.value)} style={selS}>
                <option value="">Any day</option>
                {DAYS.map(d=><option key={d} value={d}>{DAY_SHORT[d]} — {TOURNAMENT_DATES[d]}</option>)}
              </select>
            </div>
            <div style={{ display:"flex",flexDirection:"column",gap:4 }}>
              <label style={fL}>Position</label>
              <select value={filterPos} onChange={e=>setFilterPos(e.target.value)} style={selS}>
                <option value="">All positions</option>
                {Object.entries(POSITION_LABEL).map(([k,v])=>(
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div style={{ display:"flex",flexDirection:"column",gap:4 }}>
              <label style={fL}>Sort by</label>
              <select value={sortKey} onChange={e=>setSortKey(e.target.value)} style={selS}>
                <option value="priority">Call order</option>
                <option value="tier">Tier (best first)</option>
                <option value="usage">Usage (least used)</option>
                <option value="avail">Availability (most days)</option>
              </select>
            </div>
            <div style={{ display:"flex",flexDirection:"column",gap:4,justifyContent:"flex-end" }}>
              <button onClick={()=>setFilterGoalie(g=>!g)} style={{
                fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,
                padding:"6px 12px",borderRadius:6,cursor:"pointer",
                background:filterGoalie?"#FCE8E8":"#F6F5F0",
                color:filterGoalie?"#7A1818":"#888",
                border:`1px solid ${filterGoalie?"#f5c6c6":"#E8E6DF"}` }}>
                🥅 Goalies only
              </button>
            </div>
            {activeFilters > 0 && (
              <div style={{ display:"flex",flexDirection:"column",justifyContent:"flex-end" }}>
                <button onClick={clearFilters} style={{
                  fontFamily:"'DM Mono',monospace",fontSize:11,
                  background:"#1a1a2e",color:"#D4A017",border:"none",
                  padding:"6px 14px",borderRadius:6,cursor:"pointer" }}>
                  Clear {activeFilters}
                </button>
              </div>
            )}
          </div>

          <div style={{ display:"flex",justifyContent:"space-between",
            alignItems:"center",marginBottom:12 }}>
            <p style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#aaa",margin:0 }}>
              Showing {filtered.length} of {alternates.length} alternates
            </p>
            {compareIds.length > 0 && (
              <button onClick={()=>setCompareIds([])} style={{
                fontFamily:"'DM Mono',monospace",fontSize:11,
                background:"#EEF2FF",border:"1px solid #C7D2FE",color:"#1a1a2e",
                padding:"4px 12px",borderRadius:6,cursor:"pointer" }}>
                Comparing {compareIds.length} — Clear
              </button>
            )}
          </div>

          {compareAlts.length === 2 && (
            <div style={{ background:"#fff",border:"1px solid #C7D2FE",borderRadius:12,
              padding:"16px 20px",marginBottom:16 }}>
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",
                textTransform:"uppercase",letterSpacing:".08em",marginBottom:12 }}>
                Side-by-side comparison
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
                {compareAlts.map(a => {
                  const tc=TIER_COLOR(a.skill_tier_reported);
                  return (
                    <div key={a.id}>
                      <div style={{ fontFamily:"'Fraunces',serif",fontSize:14,fontWeight:700,
                        color:"#1a1a2e",marginBottom:8 }}>{a.first_name} {a.last_name}</div>
                      {[
                        ["Tier", <Pill key="t" {...tc} small>{a.skill_tier_reported}</Pill>],
                        ["Position", a.position?POSITION_LABEL[a.position]:"—"],
                        ["Age", a.age||"—"],
                        ["Available", a.available_days.map(d=>DAY_SHORT[d]).join(", ")],
                        ["Max/day", a.max_games_per_day],
                        ["Late games", a.late_game_available?"Yes":"No"],
                        ["Times used", a.times_activated],
                        ["Divisions", a.division_eligibility.map(d=>DIVISION_LABEL[d]||d).join(", ")],
                      ].map(([k,v])=>(
                        <div key={k} style={{ display:"flex",gap:10,padding:"4px 0",
                          borderBottom:"1px solid #F9F8F4" }}>
                          <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,
                            color:"#aaa",minWidth:80 }}>{k}</span>
                          <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,
                            color:"#333" }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {view === "card" ? (
            <div className="alt-grid" style={{ display:"grid",
              gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14 }}>
              {filtered.length === 0 ? (
                <div style={{ gridColumn:"1/-1",background:"#fff",border:"1px solid #E8E6DF",
                  borderRadius:12,padding:"52px 24px",textAlign:"center" }}>
                  <div style={{ fontSize:28,marginBottom:8 }}>🏒</div>
                  <p style={{ fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,
                    color:"#1a1a2e",margin:"0 0 6px" }}>No alternates match</p>
                  <p style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#aaa",margin:"0 0 16px" }}>
                    Try adjusting your filters.
                  </p>
                  <button onClick={clearFilters} style={{ fontFamily:"'DM Mono',monospace",
                    fontSize:12,background:"#1a1a2e",color:"#D4A017",border:"none",
                    padding:"8px 20px",borderRadius:8,cursor:"pointer" }}>
                    Clear filters
                  </button>
                </div>
              ) : filtered.map(a => (
                <AlternateCard key={a.id} alt={a} view="card"
                  filterDay={filterDay}
                  onActivate={handleActivate}
                  onNoteChange={handleNoteChange} />
              ))}
            </div>
          ) : (
            <div style={{ background:"#fff",border:"1px solid #E8E6DF",
              borderRadius:12,overflow:"hidden" }}>
              <table style={{ width:"100%",borderCollapse:"collapse" }}>
                <thead>
                  <tr>
                    {["Player","Tier","Division","Availability","Usage","Age",""].map(h=>(
                      <th key={h} style={{ fontFamily:"'DM Mono',monospace",fontSize:10,
                        fontWeight:500,color:"#888",textTransform:"uppercase",
                        letterSpacing:".07em",padding:"10px 16px",textAlign:"left",
                        borderBottom:"1px solid #E8E6DF",background:"#FAFAF8",
                        whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(a=>(
                    <AlternateCard key={a.id} alt={a} view="list"
                      filterDay={filterDay}
                      onActivate={handleActivate}
                      onNoteChange={handleNoteChange} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── ACTIVATION LOG TAB ── */}
      {tab === "log" && (
        <div style={{ background:"#fff",border:"1px solid #E8E6DF",
          borderRadius:12,overflow:"hidden" }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",
            padding:"14px 18px",borderBottom:"1px solid #F0EEE8" }}>
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,
              textTransform:"uppercase",letterSpacing:".07em",color:"#555" }}>
              Activation log
            </span>
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,
              background:"#F6F5F0",color:"#888",padding:"2px 10px",
              borderRadius:99,border:"1px solid #E8E6DF" }}>
              {log.length} total
            </span>
          </div>
          {log.length === 0 ? (
            <div style={{ padding:"48px 24px",textAlign:"center" }}>
              <div style={{ fontSize:28,marginBottom:8 }}>📋</div>
              <p style={{ fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,
                color:"#1a1a2e",margin:"0 0 6px" }}>No activations yet</p>
              <p style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#aaa",margin:0 }}>
                When you activate an alternate for a game, the record appears here
                — including name, team, division, date, reason, and who approved it.
              </p>
            </div>
          ) : (
            <table style={{ width:"100%",borderCollapse:"collapse" }}>
              <thead>
                <tr>
                  {["Alternate","Team","Division","Game date","Reason","Activated by","Notes"].map(h=>(
                    <th key={h} style={{ fontFamily:"'DM Mono',monospace",fontSize:10,
                      fontWeight:500,color:"#888",textTransform:"uppercase",
                      letterSpacing:".07em",padding:"10px 16px",textAlign:"left",
                      borderBottom:"1px solid #E8E6DF",background:"#FAFAF8",
                      whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {log.map(e=>{
                  const dc=DIVISION_COLOR[e.division]||{};
                  return (
                    <tr key={e.id} style={{ borderBottom:"1px solid #F3F2ED" }}>
                      <td style={{ padding:"11px 16px",fontFamily:"'Fraunces',serif",
                        fontSize:13,fontWeight:600,color:"#1a1a2e" }}>{e.player_name}</td>
                      <td style={{ padding:"11px 16px",fontFamily:"'DM Mono',monospace",
                        fontSize:11,color:"#555" }}>{e.team}</td>
                      <td style={{ padding:"11px 16px" }}>
                        <Pill bg={dc.bg} color={dc.color} border={dc.border} small>
                          {DIVISION_LABEL[e.division]||e.division}
                        </Pill>
                      </td>
                      <td style={{ padding:"11px 16px",fontFamily:"'DM Mono',monospace",
                        fontSize:11,color:"#555" }}>{e.game_date}</td>
                      <td style={{ padding:"11px 16px",fontFamily:"'DM Mono',monospace",
                        fontSize:10,color:"#888" }}>{(e.reason||"").replace("_"," ")}</td>
                      <td style={{ padding:"11px 16px",fontFamily:"'DM Mono',monospace",
                        fontSize:11,color:"#555" }}>{e.activated_by}</td>
                      <td style={{ padding:"11px 16px",fontFamily:"'DM Mono',monospace",
                        fontSize:10,color:"#aaa" }}>{e.notes||"—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activating && (
        <ActivateModal
          alternate={activating}
          onConfirm={(data)=>handleConfirmActivation(activating,data)}
          onClose={()=>setActivating(null)}
        />
      )}

      {toast && (
        <div style={{ position:"fixed",bottom:28,left:"50%",
          transform:"translateX(-50%)",
          fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:500,
          background:"#1a1a2e",color:"#D4A017",
          padding:"11px 22px",borderRadius:99,
          boxShadow:"0 8px 24px rgba(0,0,0,.2)",
          zIndex:2000,animation:"slideUp .25s ease",whiteSpace:"nowrap" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ─── Shared style constants ───────────────────────────────────────────────────
const fL = { fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",
  textTransform:"uppercase",letterSpacing:".07em",display:"block",marginBottom:5 };
const cL = { fontFamily:"'DM Mono',monospace",fontSize:9,color:"#bbb",
  textTransform:"uppercase",letterSpacing:".07em",marginBottom:4 };
const selS = { fontFamily:"'DM Mono',monospace",fontSize:12,background:"#F6F5F0",
  border:"1px solid #E8E6DF",borderRadius:6,padding:"6px 10px",
  color:"#333",outline:"none",minWidth:130 };
const inputS = { fontFamily:"'DM Mono',monospace",fontSize:12,background:"#F6F5F0",
  border:"1px solid #E8E6DF",borderRadius:6,padding:"6px 10px",
  color:"#333",outline:"none",width:"100%" };
