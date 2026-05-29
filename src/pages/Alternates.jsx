import { useState, useMemo } from "react";

// -------------------------------------------------------------------------
// Mock data
// -------------------------------------------------------------------------

const MOCK_ALTERNATES = [
  {
    id: 3,  first_name: "Tom",    last_name: "Breslin",
    position: null, skill_tier_reported: "R2", age: 52,
    player_type: "sub", payment_status: "waived",
    jersey_size: "XL", is_alternate: true,
    available_days: ["friday","saturday","sunday"],
    max_games_per_day: 2, late_game_available: true,
    division_eligibility: ["senior_b","senior_c"],
    times_activated: 0, last_activated_at: null,
    status: "approved", notes: "",
  },
  {
    id: 12, first_name: "Amy",    last_name: "Buchanan",
    position: null, skill_tier_reported: "R1", age: 48,
    player_type: "sub", payment_status: "waived",
    jersey_size: "M", is_alternate: true,
    available_days: ["saturday"],
    max_games_per_day: 1, late_game_available: false,
    division_eligibility: ["gold_open"],
    times_activated: 2, last_activated_at: "2026-03-14",
    status: "approved", notes: "Reliable — showed both times",
  },
  {
    id: 22, first_name: "Marco",  last_name: "Reyes",
    position: "goaltender", skill_tier_reported: "C1", age: 50,
    player_type: "sub", payment_status: "waived",
    jersey_size: "Goalie", is_alternate: true,
    available_days: ["thursday","friday","saturday","sunday"],
    max_games_per_day: 3, late_game_available: true,
    division_eligibility: ["45a","senior_b","senior_c"],
    times_activated: 1, last_activated_at: "2026-03-15",
    status: "approved", notes: "Emergency goalie — call first",
  },
  {
    id: 23, first_name: "Diane",  last_name: "Korte",
    position: "defenseman", skill_tier_reported: "B2", age: 45,
    player_type: "sub", payment_status: "waived",
    jersey_size: "S", is_alternate: true,
    available_days: ["saturday","sunday"],
    max_games_per_day: 2, late_game_available: true,
    division_eligibility: ["gold_open","45a"],
    times_activated: 0, last_activated_at: null,
    status: "approved", notes: "",
  },
  {
    id: 24, first_name: "Kevin",  last_name: "Marsh",
    position: "winger", skill_tier_reported: "C2", age: 55,
    player_type: "sub", payment_status: "waived",
    jersey_size: "2XL", is_alternate: true,
    available_days: ["friday","saturday"],
    max_games_per_day: 1, late_game_available: false,
    division_eligibility: ["senior_c"],
    times_activated: 3, last_activated_at: "2026-03-16",
    status: "approved", notes: "Used frequently last season",
  },
  {
    id: 25, first_name: "Priya",  last_name: "Nair",
    position: "center", skill_tier_reported: "R3", age: 43,
    player_type: "sub", payment_status: "waived",
    jersey_size: "M", is_alternate: true,
    available_days: ["sunday"],
    max_games_per_day: 1, late_game_available: false,
    division_eligibility: ["senior_b","senior_c"],
    times_activated: 0, last_activated_at: null,
    status: "approved", notes: "Only available Sundays",
  },
  {
    id: 26, first_name: "Brian",  last_name: "Halloran",
    position: "winger", skill_tier_reported: "B1", age: 44,
    player_type: "sub", payment_status: "waived",
    jersey_size: "L", is_alternate: true,
    available_days: ["thursday","friday","saturday","sunday"],
    max_games_per_day: 3, late_game_available: true,
    division_eligibility: ["gold_open","45a","senior_b"],
    times_activated: 1, last_activated_at: "2026-03-13",
    status: "approved", notes: "",
  },
  {
    id: 27, first_name: "Lena",   last_name: "Fischer",
    position: "goaltender", skill_tier_reported: "R2", age: 48,
    player_type: "sub", payment_status: "waived",
    jersey_size: "Goalie", is_alternate: true,
    available_days: ["saturday","sunday"],
    max_games_per_day: 2, late_game_available: true,
    division_eligibility: ["gold_open","45a"],
    times_activated: 0, last_activated_at: null,
    status: "approved", notes: "Backup goalie — Gold Open preferred",
  },
];

const MOCK_ACTIVATION_LOG = [
  { id: 1, alternate_id: 12, player_name: "Amy Buchanan",   team: "Team Gold",  division: "Gold Open", game_date: "2026-03-14", activated_by: "Admin", notes: "Replaced Chris Fontaine — injury" },
  { id: 2, alternate_id: 22, player_name: "Marco Reyes",    team: "Team Blue",  division: "45A",       game_date: "2026-03-15", activated_by: "Admin", notes: "Emergency goalie — Janet Ruiz unavailable" },
  { id: 3, alternate_id: 24, player_name: "Kevin Marsh",    team: "Team Red",   division: "Senior C",  game_date: "2026-03-16", activated_by: "Admin", notes: "" },
  { id: 4, alternate_id: 12, player_name: "Amy Buchanan",   team: "Team Gold",  division: "Gold Open", game_date: "2026-03-17", activated_by: "Admin", notes: "Second activation — short roster" },
  { id: 5, alternate_id: 26, player_name: "Brian Halloran", team: "Team Blue",  division: "45A",       game_date: "2026-03-13", activated_by: "Admin", notes: "" },
];

// -------------------------------------------------------------------------
// Config
// -------------------------------------------------------------------------

const DIVISION_LABEL = {
  gold_open:"Gold Open", "45a":"45A",
  senior_b:"Senior B", senior_c:"Senior C", womens:"Womens",
};
const DIVISION_COLOR = {
  gold_open: { bg:"#FEF9E7", color:"#92601A", border:"#F5D77E" },
  "45a":     { bg:"#E8F6F8", color:"#1A5F6B", border:"#9DD5DC" },
  senior_b:  { bg:"#F3EEF9", color:"#4A3070", border:"#C4AEED" },
  senior_c:  { bg:"#FDF0E8", color:"#7A3318", border:"#F5B993" },
};
const POSITION_LABEL = { defenseman:"Defense", center:"Center", winger:"Winger", goaltender:"Goalie" };
const POSITION_COLOR = {
  defenseman:{ bg:"#E8F0FE", color:"#1A3F8F" },
  center:    { bg:"#E8F8EF", color:"#1A5C35" },
  winger:    { bg:"#FDF3E8", color:"#7A4A18" },
  goaltender:{ bg:"#FCE8E8", color:"#7A1818" },
};
const TIER_COLOR = (t) => {
  if(!t) return { bg:"#F3F4F6", color:"#6B7280" };
  const f=t[0];
  if(f==="A") return { bg:"#FCE8E8", color:"#7A1818" };
  if(f==="B") return { bg:"#FEF0E8", color:"#7A4518" };
  if(f==="C") return { bg:"#FEF9E7", color:"#7A5A18" };
  return { bg:"#E8F0FE", color:"#1A3F8F" };
};
const DAYS = ["thursday","friday","saturday","sunday"];
const DAY_SHORT = { thursday:"Thu", friday:"Fri", saturday:"Sat", sunday:"Sun" };

// -------------------------------------------------------------------------
// Sub-components
// -------------------------------------------------------------------------

function Pill({ bg, color, border, children, small }) {
  return (
    <span style={{
      display:"inline-block", background:bg, color,
      border:`1px solid ${border||bg}`,
      fontSize: small ? 10 : 11,
      fontFamily:"'DM Mono',monospace", fontWeight:500,
      padding: small ? "1px 6px" : "2px 8px",
      borderRadius:99, whiteSpace:"nowrap",
    }}>{children}</span>
  );
}

function AvailabilityDots({ days }) {
  return (
    <div style={{ display:"flex", gap:3 }}>
      {DAYS.map(d => (
        <div key={d} style={{
          width:28, height:22,
          borderRadius:4,
          background: days.includes(d) ? "#1a1a2e" : "#F0EEE8",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontFamily:"'DM Mono',monospace", fontSize:9, fontWeight:500,
          color: days.includes(d) ? "#D4A017" : "#ccc",
        }}>{DAY_SHORT[d]}</div>
      ))}
    </div>
  );
}

function ReliabilityBadge({ count }) {
  if (count === 0) return <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#bbb" }}>Never used</span>;
  if (count >= 3)  return <Pill bg="#E6F4EA" color="#1E6B3A" small>★ {count}× reliable</Pill>;
  return <Pill bg="#F3F4F6" color="#555" small>{count}× used</Pill>;
}

function ActivateModal({ alternate, onConfirm, onClose }) {
  const [team,  setTeam]  = useState("");
  const [div,   setDiv]   = useState(alternate.division_eligibility[0] || "");
  const [date,  setDate]  = useState("");
  const [notes, setNotes] = useState("");

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div>
            <p style={styles.modalTitle}>Activate sub</p>
            <p style={styles.modalSub}>{alternate.first_name} {alternate.last_name}</p>
          </div>
          <button style={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        <div style={styles.modalBody}>
          <div style={styles.modalSection}>
            <p style={styles.modalFieldLabel}>Sub availability</p>
            <AvailabilityDots days={alternate.available_days} />
            <p style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#aaa", marginTop:6 }}>
              Max {alternate.max_games_per_day} game{alternate.max_games_per_day>1?"s":""}/day
              {alternate.late_game_available ? " · Late games ✓" : " · No late games"}
            </p>
          </div>

          <div style={styles.modalSection}>
            <label style={styles.modalFieldLabel}>Assign to team</label>
            <input
              type="text"
              value={team}
              onChange={e => setTeam(e.target.value)}
              placeholder="e.g. Team Gold"
              style={styles.modalInput}
            />
          </div>

          <div style={styles.modalSection}>
            <label style={styles.modalFieldLabel}>Division</label>
            <select value={div} onChange={e => setDiv(e.target.value)} style={styles.modalSelect}>
              {alternate.division_eligibility.map(d => (
                <option key={d} value={d}>{DIVISION_LABEL[d]}</option>
              ))}
            </select>
          </div>

          <div style={styles.modalSection}>
            <label style={styles.modalFieldLabel}>Game date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={styles.modalInput}
            />
          </div>

          <div style={styles.modalSection}>
            <label style={styles.modalFieldLabel}>Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Reason for activation..."
              style={styles.modalTextarea}
            />
          </div>
        </div>

        <div style={styles.modalFooter}>
          <button style={styles.modalCancelBtn} onClick={onClose}>Cancel</button>
          <button
            style={{ ...styles.modalConfirmBtn, opacity: (!team||!date) ? 0.5 : 1 }}
            onClick={() => (team && date) && onConfirm({ alternate, team, div, date, notes })}
          >
            Confirm activation
          </button>
        </div>
      </div>
    </div>
  );
}

function AlternateCard({ alt, onActivate }) {
  const [hover, setHover] = useState(false);
  const tc = TIER_COLOR(alt.skill_tier_reported);
  const pc = alt.position ? POSITION_COLOR[alt.position] : null;
  const initials = `${alt.first_name[0]}${alt.last_name[0]}`;
  const isGoalie = alt.position === "goaltender";

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? "#FAFAF8" : "#fff",
        border:`1px solid ${hover ? "#D0CEC6" : "#E8E6DF"}`,
        borderRadius:12,
        padding:"16px",
        transition:"all .15s",
        position:"relative",
        overflow:"hidden",
      }}
    >
      {isGoalie && (
        <div style={{
          position:"absolute", top:0, left:0, right:0, height:3,
          background:"#7A1818", borderRadius:"12px 12px 0 0",
        }} />
      )}

      {/* Top row */}
      <div style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:12 }}>
        <div style={{
          width:38, height:38, borderRadius:"50%",
          background:"#1a1a2e", color:"#D4A017",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontFamily:"'DM Mono',monospace", fontSize:12, fontWeight:500, flexShrink:0,
          boxShadow: isGoalie ? "0 0 0 2px #fff, 0 0 0 4px #7A1818" : "none",
        }}>{initials}</div>
        <div style={{ flex:1 }}>
          <p style={{
            fontFamily:"'Fraunces',serif", fontSize:14, fontWeight:700,
            color:"#1a1a2e", margin:"0 0 4px",
            display:"flex", alignItems:"center", gap:6,
          }}>
            {alt.first_name} {alt.last_name}
            {isGoalie && <span style={{
              fontFamily:"'DM Mono',monospace", fontSize:9, fontWeight:700,
              background:"#FCE8E8", color:"#7A1818",
              padding:"1px 6px", borderRadius:4, letterSpacing:".05em",
            }}>GOALIE</span>}
          </p>
          <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
            {pc && <Pill {...pc} small>{POSITION_LABEL[alt.position]}</Pill>}
            <Pill {...tc} small>{alt.skill_tier_reported}</Pill>
            <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#bbb" }}>age {alt.age}</span>
          </div>
        </div>
        <div>
          <ReliabilityBadge count={alt.times_activated} />
        </div>
      </div>

      {/* Availability */}
      <div style={{ marginBottom:10 }}>
        <p style={styles.cardSectionLabel}>Availability</p>
        <AvailabilityDots days={alt.available_days} />
        <div style={{ display:"flex", gap:10, marginTop:6 }}>
          <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#888" }}>
            Max {alt.max_games_per_day}/day
          </span>
          <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color: alt.late_game_available ? "#166534" : "#991B1B" }}>
            {alt.late_game_available ? "✓ Late games" : "✗ No late games"}
          </span>
        </div>
      </div>

      {/* Division eligibility */}
      <div style={{ marginBottom:12 }}>
        <p style={styles.cardSectionLabel}>Division eligibility</p>
        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
          {alt.division_eligibility.map(d => {
            const dc = DIVISION_COLOR[d] || {};
            return <Pill key={d} bg={dc.bg} color={dc.color} border={dc.border} small>{DIVISION_LABEL[d]}</Pill>;
          })}
        </div>
      </div>

      {/* Notes */}
      {alt.notes && (
        <p style={{
          fontFamily:"'DM Mono',monospace", fontSize:10, color:"#888",
          background:"#F6F5F0", borderRadius:6, padding:"6px 8px",
          margin:"0 0 12px", lineHeight:1.5,
        }}>{alt.notes}</p>
      )}

      {/* Activate button */}
      <button
        onClick={() => onActivate(alt)}
        style={{
          width:"100%",
          fontFamily:"'DM Mono',monospace", fontSize:11, fontWeight:500,
          background: hover ? "#1a1a2e" : "#F6F5F0",
          color: hover ? "#D4A017" : "#555",
          border:`1px solid ${hover ? "#1a1a2e" : "#E8E6DF"}`,
          padding:"8px 0", borderRadius:8, cursor:"pointer",
          transition:"all .15s",
        }}
      >
        Activate sub →
      </button>
    </div>
  );
}

// -------------------------------------------------------------------------
// Main component
// -------------------------------------------------------------------------

export default function Alternates() {
  const [alternates, setAlternates]   = useState(MOCK_ALTERNATES);
  const [activationLog, setActivationLog] = useState(MOCK_ACTIVATION_LOG);
  const [activating, setActivating]   = useState(null);
  const [filterDiv,  setFilterDiv]    = useState("");
  const [filterPos,  setFilterPos]    = useState("");
  const [filterDay,  setFilterDay]    = useState("");
  const [filterGoalie, setFilterGoalie] = useState(false);
  const [activeTab,  setActiveTab]    = useState("pool"); // pool | log
  const [toastMsg,   setToastMsg]     = useState("");

  const filtered = useMemo(() => {
    let a = [...alternates];
    if (filterDiv)    a = a.filter(x => x.division_eligibility.includes(filterDiv));
    if (filterPos)    a = a.filter(x => x.position === filterPos);
    if (filterDay)    a = a.filter(x => x.available_days.includes(filterDay));
    if (filterGoalie) a = a.filter(x => x.position === "goaltender");
    return a;
  }, [alternates, filterDiv, filterPos, filterDay, filterGoalie]);

  const stats = useMemo(() => ({
    total:    alternates.length,
    goalies:  alternates.filter(a => a.position === "goaltender").length,
    saturday: alternates.filter(a => a.available_days.includes("saturday")).length,
    activated: activationLog.length,
  }), [alternates, activationLog]);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3000);
  };

  const handleConfirmActivation = ({ alternate, team, div, date, notes }) => {
    // Update times_activated
    setAlternates(as => as.map(a =>
      a.id === alternate.id
        ? { ...a, times_activated: a.times_activated + 1, last_activated_at: date }
        : a
    ));
    // Log it
    setActivationLog(log => [
      {
        id: log.length + 1,
        alternate_id: alternate.id,
        player_name: `${alternate.first_name} ${alternate.last_name}`,
        team, division: div, game_date: date,
        activated_by: "Admin",
        notes,
      },
      ...log,
    ]);
    setActivating(null);
    showToast(`✓ ${alternate.first_name} ${alternate.last_name} activated for ${DIVISION_LABEL[div]}`);
  };

  return (
    <div style={styles.root}>

      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.seasonPill}>Season 2027</div>
          <h1 style={styles.title}>Alternates</h1>
          <p style={styles.subtitle}>Sub pool · {alternates.length} registered alternates</p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button style={styles.exportBtn}>↓ Export subs</button>
        </div>
      </div>

      {/* Stats bar */}
      <div style={styles.statsBar}>
        {[
          { label:"Total subs",    val:stats.total,     color:"#1a1a2e" },
          { label:"Goalies",       val:stats.goalies,   color:"#7A1818" },
          { label:"Sat available", val:stats.saturday,  color:"#1A5F6B" },
          { label:"Activations",   val:stats.activated, color:"#166534" },
        ].map(s => (
          <div key={s.label} style={styles.statChip}>
            <span style={{ ...styles.statVal, color:s.color }}>{s.val}</span>
            <span style={styles.statLabel}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {[
          { key:"pool", label:"Sub pool" },
          { key:"log",  label:`Activation log (${activationLog.length})` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              ...styles.tab,
              background: activeTab===t.key ? "#1a1a2e" : "transparent",
              color:      activeTab===t.key ? "#D4A017"  : "#888",
              border:     `1px solid ${activeTab===t.key ? "#1a1a2e" : "#E8E6DF"}`,
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* Pool tab */}
      {activeTab === "pool" && (
        <>
          {/* Filters */}
          <div style={styles.filterBar}>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              <label style={styles.filterLabel}>Division</label>
              <select value={filterDiv} onChange={e => setFilterDiv(e.target.value)} style={styles.filterSelect}>
                <option value="">All divisions</option>
                {["gold_open","45a","senior_b","senior_c"].map(d => (
                  <option key={d} value={d}>{DIVISION_LABEL[d]}</option>
                ))}
              </select>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              <label style={styles.filterLabel}>Position</label>
              <select value={filterPos} onChange={e => setFilterPos(e.target.value)} style={styles.filterSelect}>
                <option value="">All positions</option>
                {["goaltender","defenseman","center","winger"].map(p => (
                  <option key={p} value={p}>{POSITION_LABEL[p]}</option>
                ))}
              </select>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              <label style={styles.filterLabel}>Available day</label>
              <select value={filterDay} onChange={e => setFilterDay(e.target.value)} style={styles.filterSelect}>
                <option value="">Any day</option>
                {DAYS.map(d => (
                  <option key={d} value={d}>{DAY_SHORT[d]}</option>
                ))}
              </select>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:4, justifyContent:"flex-end" }}>
              <label style={styles.filterLabel}>Goalies only</label>
              <button
                onClick={() => setFilterGoalie(g => !g)}
                style={{
                  ...styles.toggleBtn,
                  background: filterGoalie ? "#FCE8E8" : "#F6F5F0",
                  color:      filterGoalie ? "#7A1818"  : "#888",
                  border:     `1px solid ${filterGoalie ? "#F5A0A0" : "#E8E6DF"}`,
                }}
              >🥅 Goalies</button>
            </div>
            {(filterDiv || filterPos || filterDay || filterGoalie) && (
              <div style={{ display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
                <button
                  onClick={() => { setFilterDiv(""); setFilterPos(""); setFilterDay(""); setFilterGoalie(false); }}
                  style={styles.clearBtn}
                >Clear filters</button>
              </div>
            )}
          </div>

          <p style={styles.resultsLabel}>
            Showing <strong>{filtered.length}</strong> of {alternates.length} subs
          </p>

          {/* Card grid */}
          <div style={styles.cardGrid}>
            {filtered.map(alt => (
              <AlternateCard key={alt.id} alt={alt} onActivate={setActivating} />
            ))}
            {filtered.length === 0 && (
              <div style={{ gridColumn:"1/-1", textAlign:"center", padding:"48px 0" }}>
                <p style={{ fontFamily:"'Fraunces',serif", fontSize:16, color:"#bbb", fontWeight:600, margin:"0 0 4px" }}>No subs match filters</p>
                <p style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#ccc" }}>Try clearing the filters</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Activation log tab */}
      {activeTab === "log" && (
        <div style={styles.logPanel}>
          <div style={styles.logHeader}>
            <span style={styles.logTitle}>Activation history</span>
            <span style={styles.logCount}>{activationLog.length} total</span>
          </div>
          {activationLog.length === 0 ? (
            <div style={{ padding:"48px 0", textAlign:"center", fontFamily:"'DM Mono',monospace", fontSize:12, color:"#ccc" }}>
              No activations recorded yet
            </div>
          ) : (
            <table style={styles.logTable}>
              <thead>
                <tr>
                  {["Player","Team","Division","Game date","Notes","Activated by"].map(h => (
                    <th key={h} style={styles.logTh}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activationLog.map(log => {
                  const dc = DIVISION_COLOR[log.division] || DIVISION_COLOR[Object.keys(DIVISION_LABEL).find(k => DIVISION_LABEL[k]===log.division)] || {};
                  const divKey = Object.keys(DIVISION_LABEL).find(k => DIVISION_LABEL[k] === log.division) || log.division;
                  const dcolor = DIVISION_COLOR[divKey] || { bg:"#F3F4F6", color:"#374151" };
                  return (
                    <tr key={log.id} style={{ borderBottom:"1px solid #F3F2ED" }}>
                      <td style={styles.logTd}>
                        <span style={{ fontFamily:"'Fraunces',serif", fontSize:13, fontWeight:600, color:"#1a1a2e" }}>
                          {log.player_name}
                        </span>
                      </td>
                      <td style={styles.logTd}>
                        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:12, color:"#555" }}>{log.team}</span>
                      </td>
                      <td style={styles.logTd}>
                        <Pill bg={dcolor.bg} color={dcolor.color} small>
                          {DIVISION_LABEL[log.division] || log.division}
                        </Pill>
                      </td>
                      <td style={styles.logTd}>
                        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:12, color:"#555" }}>{log.game_date}</span>
                      </td>
                      <td style={styles.logTd}>
                        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#888" }}>
                          {log.notes || "—"}
                        </span>
                      </td>
                      <td style={styles.logTd}>
                        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#aaa" }}>{log.activated_by}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Activation modal */}
      {activating && (
        <ActivateModal
          alternate={activating}
          onConfirm={handleConfirmActivation}
          onClose={() => setActivating(null)}
        />
      )}

      {/* Toast */}
      {toastMsg && (
        <div style={styles.toast}>{toastMsg}</div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap');
        *{box-sizing:border-box}
        @keyframes slideUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
      `}</style>
    </div>
  );
}

// -------------------------------------------------------------------------
// Styles
// -------------------------------------------------------------------------

const styles = {
  root: {
    fontFamily:"'Fraunces',Georgia,serif",
    background:"#F6F5F0",
    minHeight:"100vh",
    padding:"28px 32px 60px",
    maxWidth:1280,
  },
  header: {
    display:"flex", justifyContent:"space-between", alignItems:"flex-start",
    marginBottom:20, flexWrap:"wrap", gap:12,
  },
  seasonPill: {
    display:"inline-block",
    fontFamily:"'DM Mono',monospace", fontSize:10, fontWeight:500,
    letterSpacing:".1em", textTransform:"uppercase",
    background:"#1a1a2e", color:"#D4A017",
    padding:"3px 12px", borderRadius:99, marginBottom:8,
  },
  title: {
    fontFamily:"'Fraunces',serif", fontSize:28, fontWeight:700,
    color:"#1a1a2e", margin:"0 0 3px", letterSpacing:"-.5px",
  },
  subtitle: {
    fontFamily:"'DM Mono',monospace", fontSize:11, color:"#999", margin:0,
  },
  exportBtn: {
    fontFamily:"'DM Mono',monospace", fontSize:12,
    background:"#fff", color:"#444", border:"1px solid #E8E6DF",
    padding:"9px 18px", borderRadius:8, cursor:"pointer",
  },
  statsBar: { display:"flex", gap:10, marginBottom:18, flexWrap:"wrap" },
  statChip: {
    display:"flex", alignItems:"center", gap:6,
    background:"#fff", border:"1px solid #E8E6DF",
    borderRadius:99, padding:"5px 14px",
  },
  statVal: { fontFamily:"'Fraunces',serif", fontSize:16, fontWeight:700, lineHeight:1 },
  statLabel: {
    fontFamily:"'DM Mono',monospace", fontSize:10, color:"#aaa",
    textTransform:"uppercase", letterSpacing:".07em",
  },
  tabs: { display:"flex", gap:6, marginBottom:16 },
  tab: {
    fontFamily:"'DM Mono',monospace", fontSize:12, fontWeight:500,
    padding:"8px 16px", borderRadius:8, cursor:"pointer",
    transition:"all .15s",
  },
  filterBar: {
    display:"flex", gap:12, alignItems:"flex-end", flexWrap:"wrap",
    background:"#fff", border:"1px solid #E8E6DF",
    borderRadius:10, padding:"14px 16px", marginBottom:12,
  },
  filterLabel: {
    fontFamily:"'DM Mono',monospace", fontSize:10, color:"#aaa",
    textTransform:"uppercase", letterSpacing:".07em",
  },
  filterSelect: {
    fontFamily:"'DM Mono',monospace", fontSize:12,
    background:"#F6F5F0", border:"1px solid #E8E6DF",
    borderRadius:6, padding:"6px 10px", color:"#333",
    outline:"none", minWidth:130,
  },
  toggleBtn: {
    fontFamily:"'DM Mono',monospace", fontSize:11, fontWeight:500,
    padding:"6px 12px", borderRadius:6, cursor:"pointer",
  },
  clearBtn: {
    fontFamily:"'DM Mono',monospace", fontSize:11,
    background:"#1a1a2e", color:"#D4A017",
    border:"none", padding:"6px 14px", borderRadius:6, cursor:"pointer",
  },
  resultsLabel: {
    fontFamily:"'DM Mono',monospace", fontSize:11, color:"#aaa", marginBottom:14,
  },
  cardGrid: {
    display:"grid",
    gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))",
    gap:14,
  },
  cardSectionLabel: {
    fontFamily:"'DM Mono',monospace", fontSize:10, color:"#aaa",
    textTransform:"uppercase", letterSpacing:".07em", margin:"0 0 6px",
  },
  logPanel: {
    background:"#fff", border:"1px solid #E8E6DF", borderRadius:12, overflow:"hidden",
  },
  logHeader: {
    display:"flex", justifyContent:"space-between", alignItems:"center",
    padding:"14px 18px", borderBottom:"1px solid #F0EEE8",
  },
  logTitle: {
    fontFamily:"'DM Mono',monospace", fontSize:11, fontWeight:500,
    textTransform:"uppercase", letterSpacing:".07em", color:"#555",
  },
  logCount: {
    fontFamily:"'DM Mono',monospace", fontSize:11,
    background:"#F6F5F0", color:"#888",
    padding:"2px 10px", borderRadius:99, border:"1px solid #E8E6DF",
  },
  logTable: { width:"100%", borderCollapse:"collapse" },
  logTh: {
    fontFamily:"'DM Mono',monospace", fontSize:10, fontWeight:500,
    color:"#888", textTransform:"uppercase", letterSpacing:".07em",
    padding:"10px 16px", textAlign:"left",
    borderBottom:"1px solid #E8E6DF", background:"#FAFAF8",
  },
  logTd: { padding:"11px 16px", verticalAlign:"middle" },
  modalOverlay: {
    position:"fixed", inset:0,
    background:"rgba(0,0,0,0.4)", zIndex:1000,
    display:"flex", alignItems:"center", justifyContent:"center",
  },
  modal: {
    width:420, background:"#fff", borderRadius:16,
    overflow:"hidden", boxShadow:"0 24px 60px rgba(0,0,0,.18)",
    animation:"slideUp .25s ease",
  },
  modalHeader: {
    display:"flex", justifyContent:"space-between", alignItems:"flex-start",
    padding:"20px 22px 16px", borderBottom:"1px solid #F0EEE8",
  },
  modalTitle: {
    fontFamily:"'DM Mono',monospace", fontSize:10, color:"#aaa",
    textTransform:"uppercase", letterSpacing:".08em", margin:"0 0 4px",
  },
  modalSub: {
    fontFamily:"'Fraunces',serif", fontSize:18, fontWeight:700,
    color:"#1a1a2e", margin:0,
  },
  modalClose: {
    background:"none", border:"none", fontSize:16, color:"#aaa", cursor:"pointer",
  },
  modalBody: { padding:"16px 22px", display:"flex", flexDirection:"column", gap:14 },
  modalSection: {},
  modalFieldLabel: {
    fontFamily:"'DM Mono',monospace", fontSize:10, color:"#aaa",
    textTransform:"uppercase", letterSpacing:".07em",
    display:"block", marginBottom:6,
  },
  modalInput: {
    fontFamily:"'DM Mono',monospace", fontSize:12,
    width:"100%", background:"#F6F5F0", border:"1px solid #E8E6DF",
    borderRadius:6, padding:"7px 10px", color:"#333", outline:"none",
  },
  modalSelect: {
    fontFamily:"'DM Mono',monospace", fontSize:12,
    width:"100%", background:"#F6F5F0", border:"1px solid #E8E6DF",
    borderRadius:6, padding:"7px 10px", color:"#333", outline:"none",
  },
  modalTextarea: {
    fontFamily:"'DM Mono',monospace", fontSize:12,
    width:"100%", background:"#F6F5F0", border:"1px solid #E8E6DF",
    borderRadius:6, padding:"7px 10px", color:"#333", outline:"none",
    resize:"vertical",
  },
  modalFooter: {
    display:"flex", gap:10, padding:"14px 22px 20px",
    borderTop:"1px solid #F0EEE8",
  },
  modalCancelBtn: {
    flex:1, fontFamily:"'DM Mono',monospace", fontSize:12,
    background:"#F6F5F0", border:"1px solid #E8E6DF", color:"#666",
    padding:"10px", borderRadius:8, cursor:"pointer",
  },
  modalConfirmBtn: {
    flex:2, fontFamily:"'DM Mono',monospace", fontSize:12, fontWeight:500,
    background:"#1a1a2e", color:"#D4A017", border:"none",
    padding:"10px", borderRadius:8, cursor:"pointer", transition:"opacity .15s",
  },
  toast: {
    position:"fixed", bottom:28, left:"50%",
    transform:"translateX(-50%)",
    fontFamily:"'DM Mono',monospace", fontSize:12, fontWeight:500,
    background:"#1a1a2e", color:"#D4A017",
    padding:"11px 22px", borderRadius:99,
    boxShadow:"0 8px 24px rgba(0,0,0,.2)",
    zIndex:2000,
    animation:"slideUp .25s ease",
    whiteSpace:"nowrap",
  },
};
