import { useState, useMemo } from "react";

const MOCK_DIVISION_PARITY = [
  {
    division: "gold_open", label: "Gold Open",
    teams: [
      { name:"Team Gold",  colour:"#D4A017", players:8, skill_score:72.1, age_score:76.3, parity_score:74.2, goalies:1, defense:2, center:2, wing:3 },
      { name:"Team Blue",  colour:"#1E3A8A", players:8, skill_score:70.5, age_score:73.1, parity_score:71.8, goalies:1, defense:2, center:2, wing:3 },
      { name:"Team Red",   colour:"#991B1B", players:8, skill_score:67.0, age_score:70.0, parity_score:68.5, goalies:1, defense:2, center:2, wing:3 },
      { name:"Team Green", colour:"#166534", players:8, skill_score:69.3, age_score:71.8, parity_score:70.6, goalies:1, defense:2, center:2, wing:3 },
    ],
  },
  {
    division: "45a", label: "45A",
    teams: [
      { name:"Team Silver", colour:"#6B7280", players:7, skill_score:68.0, age_score:78.2, parity_score:73.1, goalies:1, defense:2, center:2, wing:2 },
      { name:"Team Bronze", colour:"#92400E", players:7, skill_score:66.5, age_score:75.0, parity_score:70.8, goalies:1, defense:2, center:1, wing:3 },
      { name:"Team Copper", colour:"#1A5F6B", players:7, skill_score:67.8, age_score:76.4, parity_score:72.1, goalies:1, defense:2, center:2, wing:2 },
    ],
  },
];

const MOCK_UNPAID = [
  { id:4,  name:"Janet Ruiz",     division:"Senior C", amount:100, type:"primary", days_since:12 },
  { id:9,  name:"Ray Dominguez",  division:"Senior B", amount:200, type:"primary", days_since:8  },
  { id:16, name:"James Whitmore", division:"Gold Open", amount:200, type:"primary", days_since:3  },
  { id:17, name:"Priya Nair",     division:"Senior B", amount:200, type:"primary", days_since:15 },
];

const MOCK_GOALIE = [
  { division:"Gold Open", teams:[{name:"Team Gold",colour:"#D4A017",goalies:["Linda Tran"]},{name:"Team Blue",colour:"#1E3A8A",goalies:["Janet Ruiz"]},{name:"Team Red",colour:"#991B1B",goalies:["Frank Dolan"]},{name:"Team Green",colour:"#166534",goalies:["Marco Reyes"]}], subs:["Lena Fischer"] },
  { division:"45A",       teams:[{name:"Team Silver",colour:"#6B7280",goalies:["Chris Wells"]},{name:"Team Bronze",colour:"#92400E",goalies:["Dana Yip"]},{name:"Team Copper",colour:"#1A5F6B",goalies:["Pete Garza"]}], subs:[] },
  { division:"Senior B",  teams:[{name:"Team Black",colour:"#1a1a2e",goalies:["Kim Park"]},{name:"Team White",colour:"#888",goalies:["Tom Bell"]},{name:"Team Navy",colour:"#1E3A8A",goalies:["Bev Chen"]}], subs:["Marco Reyes"] },
  { division:"Senior C",  teams:[{name:"Team Maroon",colour:"#7A1818",goalies:[]},{name:"Team Teal",colour:"#1A5F6B",goalies:["Alice Wong"]}], subs:[] },
];

const TIER_COLOR = (t) => {
  if(!t) return { bg:"#F3F4F6", color:"#6B7280" };
  const f=t[0];
  if(f==="A") return { bg:"#FCE8E8", color:"#7A1818" };
  if(f==="B") return { bg:"#FEF0E8", color:"#7A4518" };
  if(f==="C") return { bg:"#FEF9E7", color:"#7A5A18" };
  return { bg:"#E8F0FE", color:"#1A3F8F" };
};

function Pill({ bg, color, border, children, small }) {
  return <span style={{ display:"inline-block", background:bg, color, border:`1px solid ${border||bg}`, fontSize:small?10:11, fontFamily:"'DM Mono',monospace", fontWeight:500, padding:small?"1px 6px":"2px 8px", borderRadius:99, whiteSpace:"nowrap" }}>{children}</span>;
}

function ParityBar({ score, colour }) {
  const c = score >= 73 ? "#166534" : score >= 68 ? "#92400E" : "#991B1B";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <div style={{ flex:1, height:6, background:"#F0EEE8", borderRadius:99, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${score}%`, background:colour, borderRadius:99 }} />
      </div>
      <span style={{ fontFamily:"'Fraunces',serif", fontSize:13, fontWeight:700, color:c, minWidth:36, textAlign:"right" }}>{score.toFixed(1)}</span>
    </div>
  );
}

export default function Reports() {
  const [activeReport, setActiveReport] = useState("parity");
  const [exporting, setExporting] = useState("");

  const handleExport = (type) => {
    setExporting(type);
    setTimeout(() => setExporting(""), 1500);
  };

  const totalUnpaid = MOCK_UNPAID.reduce((s, p) => s + p.amount, 0);
  const goalieShortages = MOCK_GOALIE.filter(d => d.teams.some(t => t.goalies.length === 0));

  return (
    <div style={styles.root}>

      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.seasonPill}>Season 2027</div>
          <h1 style={styles.title}>Reports</h1>
          <p style={styles.subtitle}>Parity, payments, goalies, and exports</p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button style={styles.exportBtn} onClick={() => handleExport("csv")}>
            {exporting==="csv" ? "Exporting..." : "↓ Export all CSV"}
          </button>
          <button style={styles.exportBtn} onClick={() => handleExport("print")}>
            ⎙ Print rosters
          </button>
        </div>
      </div>

      {/* Report tabs */}
      <div style={styles.tabs}>
        {[
          { key:"parity",  label:"Parity report" },
          { key:"unpaid",  label:`Unpaid players (${MOCK_UNPAID.length})` },
          { key:"goalies", label:`Goalie assignments` },
          { key:"export",  label:"Export centre" },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveReport(t.key)} style={{
            ...styles.tab,
            background: activeReport===t.key ? "#1a1a2e" : "transparent",
            color:      activeReport===t.key ? "#D4A017"  : "#888",
            border:     `1px solid ${activeReport===t.key ? "#1a1a2e" : "#E8E6DF"}`,
          }}>{t.label}</button>
        ))}
      </div>

      {/* Parity report */}
      {activeReport === "parity" && (
        <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
          {MOCK_DIVISION_PARITY.map(div => (
            <div key={div.division} style={styles.reportCard}>
              <div style={styles.reportCardHeader}>
                <span style={styles.reportCardTitle}>{div.label}</span>
                <span style={styles.reportCardSub}>{div.teams.length} teams</span>
              </div>
              {/* Parity bars */}
              <div style={{ padding:"14px 18px 0", marginBottom:16 }}>
                {div.teams.map(t => (
                  <div key={t.name} style={{ marginBottom:10 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#555", display:"flex", alignItems:"center", gap:6 }}>
                        <span style={{ width:8, height:8, borderRadius:"50%", background:t.colour, display:"inline-block" }} />
                        {t.name}
                      </span>
                      <div style={{ display:"flex", gap:12 }}>
                        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#aaa" }}>Skill {t.skill_score.toFixed(1)}</span>
                        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#aaa" }}>Age {t.age_score.toFixed(1)}</span>
                      </div>
                    </div>
                    <ParityBar score={t.parity_score} colour={t.colour} />
                  </div>
                ))}
              </div>
              {/* Position grid */}
              <div style={{ padding:"0 18px 16px" }}>
                <p style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#aaa", textTransform:"uppercase", letterSpacing:".07em", margin:"0 0 10px" }}>Position breakdown</p>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                  <thead>
                    <tr>
                      {["Team","Players","Goalies","Defense","Centers","Wings"].map(h => (
                        <th key={h} style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#888", textTransform:"uppercase", letterSpacing:".06em", padding:"6px 10px", textAlign:"left", borderBottom:"1px solid #F0EEE8" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {div.teams.map(t => (
                      <tr key={t.name} style={{ borderBottom:"1px solid #F6F5F0" }}>
                        <td style={{ padding:"8px 10px" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                            <div style={{ width:8, height:8, borderRadius:"50%", background:t.colour }} />
                            <span style={{ fontFamily:"'Fraunces',serif", fontSize:12, fontWeight:600, color:"#1a1a2e" }}>{t.name}</span>
                          </div>
                        </td>
                        {[t.players, t.goalies, t.defense, t.center, t.wing].map((v, i) => (
                          <td key={i} style={{ padding:"8px 10px", fontFamily:"'Fraunces',serif", fontSize:14, fontWeight:700, color: (i===1&&v<1)||(i===2&&v<2) ? "#DC2626" : "#1a1a2e" }}>{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Parity delta */}
              <div style={{ padding:"12px 18px", background:"#F6F5F0", borderTop:"1px solid #F0EEE8" }}>
                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#888" }}>
                  Parity spread: <strong style={{ color: Math.max(...div.teams.map(t=>t.parity_score)) - Math.min(...div.teams.map(t=>t.parity_score)) > 8 ? "#991B1B" : "#166534" }}>
                    {(Math.max(...div.teams.map(t=>t.parity_score)) - Math.min(...div.teams.map(t=>t.parity_score))).toFixed(1)} pts
                  </strong>
                  <span style={{ marginLeft:8 }}>{Math.max(...div.teams.map(t=>t.parity_score)) - Math.min(...div.teams.map(t=>t.parity_score)) > 8 ? "⚠ Rebalance recommended" : "✓ Within acceptable range"}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Unpaid players */}
      {activeReport === "unpaid" && (
        <div style={styles.reportCard}>
          <div style={styles.reportCardHeader}>
            <span style={styles.reportCardTitle}>Unpaid registrations</span>
            <span style={{ fontFamily:"'Fraunces',serif", fontSize:16, fontWeight:700, color:"#92400E" }}>${totalUnpaid} outstanding</span>
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr>
                {["Player","Division","Amount","Type","Days overdue","Action"].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_UNPAID.map(p => (
                <tr key={p.id} style={{ borderBottom:"1px solid #F3F2ED" }}>
                  <td style={styles.td}><span style={{ fontFamily:"'Fraunces',serif", fontSize:13, fontWeight:600, color:"#1a1a2e" }}>{p.name}</span></td>
                  <td style={styles.td}><span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#555" }}>{p.division}</span></td>
                  <td style={styles.td}><span style={{ fontFamily:"'Fraunces',serif", fontSize:14, fontWeight:700, color:"#92400E" }}>${p.amount}</span></td>
                  <td style={styles.td}><span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#555" }}>{p.type}</span></td>
                  <td style={styles.td}>
                    <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color: p.days_since > 10 ? "#DC2626" : "#92400E", fontWeight: p.days_since > 10 ? 600 : 400 }}>
                      {p.days_since}d {p.days_since > 10 ? "⚠" : ""}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <button style={{ fontFamily:"'DM Mono',monospace", fontSize:10, background:"#1a1a2e", color:"#D4A017", border:"none", padding:"4px 10px", borderRadius:5, cursor:"pointer" }}>
                      Send reminder
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Goalie assignments */}
      {activeReport === "goalies" && (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {goalieShortages.length > 0 && (
            <div style={{ fontFamily:"'DM Mono',monospace", fontSize:12, fontWeight:500, background:"#FEF2F2", color:"#991B1B", border:"1px solid #FCA5A5", borderRadius:8, padding:"11px 16px" }}>
              ⚠ {goalieShortages.length} division{goalieShortages.length>1?"s":""} with teams missing a goalie
            </div>
          )}
          {MOCK_GOALIE.map(div => (
            <div key={div.division} style={styles.reportCard}>
              <div style={styles.reportCardHeader}>
                <span style={styles.reportCardTitle}>{div.division.replace("_"," ").replace(/^\w/,c=>c.toUpperCase())}</span>
                {div.subs.length > 0 && <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#166534" }}>Goalie sub available: {div.subs.join(", ")}</span>}
              </div>
              <div style={{ padding:"14px 18px", display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:10 }}>
                {div.teams.map(t => (
                  <div key={t.name} style={{ border:`1px solid ${t.goalies.length===0?"#FCA5A5":"#E8E6DF"}`, background:t.goalies.length===0?"#FEF2F2":"#F9F8F4", borderRadius:8, padding:"10px 12px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                      <div style={{ width:8, height:8, borderRadius:"50%", background:t.colour, flexShrink:0 }} />
                      <span style={{ fontFamily:"'Fraunces',serif", fontSize:12, fontWeight:700, color:"#1a1a2e" }}>{t.name}</span>
                    </div>
                    {t.goalies.length === 0 ? (
                      <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#DC2626", fontWeight:500 }}>⚠ No goalie assigned</div>
                    ) : (
                      t.goalies.map(g => (
                        <div key={g} style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#555", padding:"2px 0" }}>🥅 {g}</div>
                      ))
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Export centre */}
      {activeReport === "export" && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:14 }}>
          {[
            { title:"Player pool",     desc:"All players, tiers, payment status",           icon:"👥", type:"CSV" },
            { title:"Roster export",   desc:"Team rosters by division, printable format",   icon:"📋", type:"PDF" },
            { title:"Parity report",   desc:"Full parity breakdown all divisions",          icon:"⚖️",  type:"CSV" },
            { title:"Unpaid players",  desc:"Outstanding registrations and amounts",        icon:"💳", type:"CSV" },
            { title:"Goalie summary",  desc:"Goalie assignments across all divisions",      icon:"🥅", type:"CSV" },
            { title:"Alternate pool",  desc:"All subs with availability and eligibility",  icon:"📞", type:"CSV" },
            { title:"Audit log",       desc:"Full admin action history this season",        icon:"🔍", type:"CSV" },
            { title:"Draft history",   desc:"All picks round by round with timestamps",     icon:"🏒", type:"CSV" },
          ].map(e => (
            <div key={e.title} style={{ background:"#fff", border:"1px solid #E8E6DF", borderRadius:12, padding:"18px 18px 14px" }}>
              <div style={{ fontSize:24, marginBottom:10 }}>{e.icon}</div>
              <p style={{ fontFamily:"'Fraunces',serif", fontSize:14, fontWeight:700, color:"#1a1a2e", margin:"0 0 4px" }}>{e.title}</p>
              <p style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#999", margin:"0 0 14px", lineHeight:1.5 }}>{e.desc}</p>
              <button
                onClick={() => handleExport(e.title)}
                style={{
                  width:"100%",
                  fontFamily:"'DM Mono',monospace", fontSize:11, fontWeight:500,
                  background: exporting===e.title ? "#166534" : "#1a1a2e",
                  color: exporting===e.title ? "#fff" : "#D4A017",
                  border:"none", padding:"8px 0", borderRadius:7, cursor:"pointer",
                  transition:"background .3s",
                }}
              >
                {exporting===e.title ? "✓ Exported" : `↓ Download ${e.type}`}
              </button>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap');
        *{box-sizing:border-box}
      `}</style>
    </div>
  );
}

const styles = {
  root:{ fontFamily:"'Fraunces',Georgia,serif", background:"#F6F5F0", minHeight:"100vh", padding:"28px 32px 60px", maxWidth:1280 },
  header:{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12 },
  seasonPill:{ display:"inline-block", fontFamily:"'DM Mono',monospace", fontSize:10, fontWeight:500, letterSpacing:".1em", textTransform:"uppercase", background:"#1a1a2e", color:"#D4A017", padding:"3px 12px", borderRadius:99, marginBottom:8 },
  title:{ fontFamily:"'Fraunces',serif", fontSize:28, fontWeight:700, color:"#1a1a2e", margin:"0 0 3px", letterSpacing:"-.5px" },
  subtitle:{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#999", margin:0 },
  exportBtn:{ fontFamily:"'DM Mono',monospace", fontSize:12, background:"#fff", color:"#444", border:"1px solid #E8E6DF", padding:"9px 16px", borderRadius:8, cursor:"pointer" },
  tabs:{ display:"flex", gap:6, marginBottom:18, flexWrap:"wrap" },
  tab:{ fontFamily:"'DM Mono',monospace", fontSize:12, fontWeight:500, padding:"8px 16px", borderRadius:8, cursor:"pointer", transition:"all .15s" },
  reportCard:{ background:"#fff", border:"1px solid #E8E6DF", borderRadius:12, overflow:"hidden" },
  reportCardHeader:{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 18px", borderBottom:"1px solid #F0EEE8" },
  reportCardTitle:{ fontFamily:"'DM Mono',monospace", fontSize:11, fontWeight:500, textTransform:"uppercase", letterSpacing:".07em", color:"#555" },
  reportCardSub:{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#aaa" },
  th:{ fontFamily:"'DM Mono',monospace", fontSize:10, fontWeight:500, color:"#888", textTransform:"uppercase", letterSpacing:".07em", padding:"10px 14px", textAlign:"left", borderBottom:"1px solid #E8E6DF", background:"#FAFAF8" },
  td:{ padding:"11px 14px", verticalAlign:"middle" },
};
