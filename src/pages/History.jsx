import { useState, useMemo } from "react";

// -------------------------------------------------------------------------
// Mock data
// -------------------------------------------------------------------------

const MOCK_PLAYERS = [
  {
    id: 3,  first_name: "Dave",   last_name: "Kowalski",
    email: "d.kowalski@email.com", age: 47,
    skill_tier_reported: "B1", skill_tier_assigned: null,
    position: "defenseman", sandbagging_flag: true,
    no_show_count: 0, attendance_rating: 100,
    history: [
      { season: 2026, division: "gold_open", team: "Team Gold",  finish: 1, championship: "winner",      was_captain: true,  was_alternate: false, skill_tier: "B1", games_scheduled: 6, games_attended: 6, no_show: 0 },
      { season: 2025, division: "gold_open", team: "Team Blue",  finish: 2, championship: "runner_up",   was_captain: false, was_alternate: false, skill_tier: "B2", games_scheduled: 6, games_attended: 6, no_show: 0 },
      { season: 2024, division: "senior_b",  team: "Team Red",   finish: 3, championship: "participant", was_captain: false, was_alternate: false, skill_tier: "C1", games_scheduled: 5, games_attended: 5, no_show: 0 },
    ],
  },
  {
    id: 10, first_name: "Mike",   last_name: "Hartley",
    email: "m.hartley@email.com", age: 49,
    skill_tier_reported: "A2", skill_tier_assigned: null,
    position: "winger", sandbagging_flag: true,
    no_show_count: 0, attendance_rating: 100,
    history: [
      { season: 2026, division: "gold_open", team: "Team Red",   finish: 1, championship: "winner",      was_captain: true,  was_alternate: false, skill_tier: "A2", games_scheduled: 6, games_attended: 6, no_show: 0 },
      { season: 2025, division: "gold_open", team: "Team Gold",  finish: 1, championship: "winner",      was_captain: false, was_alternate: false, skill_tier: "A2", games_scheduled: 6, games_attended: 6, no_show: 0 },
      { season: 2024, division: "gold_open", team: "Team Blue",  finish: 2, championship: "runner_up",   was_captain: false, was_alternate: false, skill_tier: "A1", games_scheduled: 5, games_attended: 5, no_show: 0 },
    ],
  },
  {
    id: 4,  first_name: "Janet",  last_name: "Ruiz",
    email: "j.ruiz@email.com", age: 51,
    skill_tier_reported: "C1", skill_tier_assigned: null,
    position: "goaltender", sandbagging_flag: false,
    no_show_count: 1, attendance_rating: 83,
    history: [
      { season: 2026, division: "senior_c",  team: "Team Blue",  finish: 2, championship: "runner_up",   was_captain: false, was_alternate: false, skill_tier: "C1", games_scheduled: 6, games_attended: 5, no_show: 1 },
      { season: 2025, division: "senior_c",  team: "Team Gold",  finish: 3, championship: "participant", was_captain: false, was_alternate: false, skill_tier: "C2", games_scheduled: 6, games_attended: 6, no_show: 0 },
    ],
  },
  {
    id: 12, first_name: "Amy",    last_name: "Buchanan",
    email: "a.buchanan@email.com", age: 48,
    skill_tier_reported: "R1", skill_tier_assigned: null,
    position: null, sandbagging_flag: false,
    no_show_count: 0, attendance_rating: 100,
    history: [
      { season: 2026, division: "gold_open", team: "Sub pool",   finish: null, championship: "none",    was_captain: false, was_alternate: true,  skill_tier: "R1", games_scheduled: 3, games_attended: 3, no_show: 0 },
      { season: 2025, division: "gold_open", team: "Team Red",   finish: 3,    championship: "participant", was_captain: false, was_alternate: false, skill_tier: "R2", games_scheduled: 6, games_attended: 6, no_show: 0 },
    ],
  },
  {
    id: 8,  first_name: "Linda",  last_name: "Tran",
    email: "l.tran@email.com", age: 53,
    skill_tier_reported: "R2", skill_tier_assigned: null,
    position: "goaltender", sandbagging_flag: false,
    no_show_count: 0, attendance_rating: 100,
    history: [
      { season: 2026, division: "45a",       team: "Team Gold",  finish: 1, championship: "winner",      was_captain: false, was_alternate: false, skill_tier: "R2", games_scheduled: 6, games_attended: 6, no_show: 0 },
      { season: 2025, division: "45a",       team: "Team Blue",  finish: 2, championship: "runner_up",   was_captain: false, was_alternate: false, skill_tier: "R3", games_scheduled: 6, games_attended: 6, no_show: 0 },
      { season: 2024, division: "45a",       team: "Team Gold",  finish: 1, championship: "winner",      was_captain: true,  was_alternate: false, skill_tier: "R3", games_scheduled: 5, games_attended: 5, no_show: 0 },
    ],
  },
  {
    id: 9,  first_name: "Ray",    last_name: "Dominguez",
    email: "r.dominguez@email.com", age: 55,
    skill_tier_reported: "C2", skill_tier_assigned: null,
    position: "center", sandbagging_flag: false,
    no_show_count: 2, attendance_rating: 67,
    history: [
      { season: 2026, division: "senior_b",  team: "Team Red",   finish: 3, championship: "participant", was_captain: false, was_alternate: false, skill_tier: "C2", games_scheduled: 6, games_attended: 4, no_show: 2 },
      { season: 2025, division: "senior_b",  team: "Team Blue",  finish: 1, championship: "winner",      was_captain: true,  was_alternate: false, skill_tier: "C1", games_scheduled: 5, games_attended: 5, no_show: 0 },
    ],
  },
];

// -------------------------------------------------------------------------
// Config
// -------------------------------------------------------------------------

const DIVISION_LABEL = {
  gold_open:"Gold Open", "45a":"45A", senior_b:"Senior B", senior_c:"Senior C",
};
const DIVISION_COLOR = {
  gold_open:{ bg:"#FEF9E7", color:"#92601A", border:"#F5D77E" },
  "45a":    { bg:"#E8F6F8", color:"#1A5F6B", border:"#9DD5DC" },
  senior_b: { bg:"#F3EEF9", color:"#4A3070", border:"#C4AEED" },
  senior_c: { bg:"#FDF0E8", color:"#7A3318", border:"#F5B993" },
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
const CHAMP_STYLE = {
  winner:      { icon:"🏆", label:"Champion",    bg:"#FFFBEB", color:"#92400E" },
  runner_up:   { icon:"🥈", label:"Runner-up",   bg:"#F3F4F6", color:"#374151" },
  participant: { icon:"🏒", label:"Participant",  bg:"#F9F8F4", color:"#888"    },
  none:        { icon:"—",  label:"Sub / n/a",   bg:"#F9F8F4", color:"#bbb"    },
};

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

function AttendanceBar({ rating, noShows }) {
  const color = rating >= 90 ? "#166534" : rating >= 70 ? "#92400E" : "#991B1B";
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#aaa" }}>Attendance</span>
        <span style={{ fontFamily:"'Fraunces',serif", fontSize:12, fontWeight:700, color }}>{rating}%</span>
      </div>
      <div style={{ height:4, background:"#F0EEE8", borderRadius:99, overflow:"hidden", marginBottom:4 }}>
        <div style={{ height:"100%", width:`${rating}%`, background:color, borderRadius:99 }} />
      </div>
      {noShows > 0 && (
        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"#DC2626" }}>
          {noShows} no-show{noShows>1?"s":""}
        </span>
      )}
    </div>
  );
}

function PlayerHistoryDrawer({ player, onClose }) {
  const championships = player.history.filter(h => h.championship === "winner").length;
  const seasons = player.history.length;
  const captainSeasons = player.history.filter(h => h.was_captain).length;
  const initials = `${player.first_name[0]}${player.last_name[0]}`;
  const tc = TIER_COLOR(player.skill_tier_reported);
  const pc = player.position ? POSITION_COLOR[player.position] : null;

  return (
    <div style={styles.drawerOverlay} onClick={onClose}>
      <div style={styles.drawer} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={styles.drawerHeader}>
          <div style={styles.drawerAvatar}>{initials}</div>
          <div style={{ flex:1 }}>
            <p style={styles.drawerName}>{player.first_name} {player.last_name}</p>
            <p style={styles.drawerEmail}>{player.email}</p>
            <div style={{ display:"flex", gap:4, marginTop:4 }}>
              {pc && <Pill {...pc} small>{POSITION_LABEL[player.position]}</Pill>}
              <Pill {...tc} small>{player.skill_tier_reported}</Pill>
              {player.sandbagging_flag && (
                <Pill bg="#FEF2F2" color="#991B1B" small>⚠ Sandbagging review</Pill>
              )}
            </div>
          </div>
          <button style={styles.drawerClose} onClick={onClose}>✕</button>
        </div>

        {/* Career summary */}
        <div style={styles.drawerSection}>
          <p style={styles.drawerSectionLabel}>Career summary</p>
          <div style={styles.summaryGrid}>
            {[
              { label:"Seasons",      val:seasons },
              { label:"Championships",val:championships, color: championships > 0 ? "#92400E" : undefined },
              { label:"Captain",      val:`${captainSeasons}×` },
              { label:"Attendance",   val:`${player.attendance_rating}%`, color: player.attendance_rating < 80 ? "#991B1B" : "#166534" },
            ].map(s => (
              <div key={s.label} style={styles.summaryCard}>
                <p style={styles.summaryVal(s.color)}>{s.val}</p>
                <p style={styles.summaryLabel}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Season by season */}
        <div style={styles.drawerSection}>
          <p style={styles.drawerSectionLabel}>Season history</p>
          {player.history.map((h, i) => {
            const dc = DIVISION_COLOR[h.division] || {};
            const htc = TIER_COLOR(h.skill_tier);
            const champ = CHAMP_STYLE[h.championship] || CHAMP_STYLE.none;
            const attend = h.games_scheduled > 0
              ? Math.round((h.games_attended / h.games_scheduled) * 100) : 100;
            return (
              <div key={i} style={{
                border:"1px solid #F0EEE8", borderRadius:10,
                padding:"12px 14px", marginBottom:10,
                background: h.championship === "winner" ? "#FFFBEB" : "#FAFAF8",
              }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                  <div>
                    <span style={{ fontFamily:"'Fraunces',serif", fontSize:15, fontWeight:700, color:"#1a1a2e" }}>
                      {h.season}
                    </span>
                    {h.was_captain && (
                      <span style={{
                        fontFamily:"'DM Mono',monospace", fontSize:9, fontWeight:700,
                        background:"#1a1a2e", color:"#D4A017",
                        padding:"1px 6px", borderRadius:3, marginLeft:6,
                      }}>CAPTAIN</span>
                    )}
                    {h.was_alternate && (
                      <span style={{
                        fontFamily:"'DM Mono',monospace", fontSize:9, fontWeight:500,
                        background:"#EDE9FE", color:"#4C1D95",
                        padding:"1px 6px", borderRadius:3, marginLeft:6,
                      }}>SUB</span>
                    )}
                  </div>
                  <span style={{
                    fontFamily:"'DM Mono',monospace", fontSize:11,
                    background:champ.bg, color:champ.color,
                    padding:"2px 8px", borderRadius:99,
                  }}>{champ.icon} {champ.label}</span>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  <div>
                    <p style={styles.histFieldLabel}>Division</p>
                    <Pill {...dc} small>{DIVISION_LABEL[h.division] || h.division}</Pill>
                  </div>
                  <div>
                    <p style={styles.histFieldLabel}>Team</p>
                    <p style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#555" }}>{h.team}</p>
                  </div>
                  <div>
                    <p style={styles.histFieldLabel}>Skill tier</p>
                    <Pill {...htc} small>{h.skill_tier}</Pill>
                  </div>
                  <div>
                    <p style={styles.histFieldLabel}>Attendance</p>
                    <p style={{
                      fontFamily:"'Fraunces',serif", fontSize:13, fontWeight:700,
                      color: attend < 80 ? "#991B1B" : "#166534",
                    }}>
                      {h.games_attended}/{h.games_scheduled}
                      {h.no_show > 0 && <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"#DC2626", marginLeft:4 }}>({h.no_show} no-show)</span>}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Main component
// -------------------------------------------------------------------------

export default function History() {
  const [players]           = useState(MOCK_PLAYERS);
  const [search, setSearch] = useState("");
  const [filterDiv, setFilterDiv] = useState("");
  const [filterWarn, setFilterWarn] = useState(false);
  const [filterReliability, setFilterReliability] = useState("");
  const [selected, setSelected] = useState(null);
  const [sortKey, setSortKey] = useState("last_name");
  const [sortDir, setSortDir] = useState("asc");

  const filtered = useMemo(() => {
    let p = [...players];
    if (search) p = p.filter(x =>
      `${x.first_name} ${x.last_name} ${x.email}`.toLowerCase().includes(search.toLowerCase())
    );
    if (filterDiv) p = p.filter(x =>
      x.history.some(h => h.division === filterDiv)
    );
    if (filterWarn) p = p.filter(x => x.sandbagging_flag);
    if (filterReliability === "perfect") p = p.filter(x => x.attendance_rating === 100);
    if (filterReliability === "concern") p = p.filter(x => x.attendance_rating < 80);

    p.sort((a, b) => {
      let av, bv;
      if (sortKey === "seasons")       { av = a.history.length; bv = b.history.length; }
      else if (sortKey === "champs")   { av = a.history.filter(h=>h.championship==="winner").length; bv = b.history.filter(h=>h.championship==="winner").length; }
      else if (sortKey === "attendance"){ av = a.attendance_rating; bv = b.attendance_rating; }
      else { av = (a[sortKey]||"").toString().toLowerCase(); bv = (b[sortKey]||"").toString().toLowerCase(); }
      return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
    return p;
  }, [players, search, filterDiv, filterWarn, filterReliability, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d==="asc"?"desc":"asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ k }) => (
    <span style={{ marginLeft:4, opacity: sortKey===k ? 1 : 0.25, fontSize:10 }}>
      {sortKey===k ? (sortDir==="asc"?"↑":"↓") : "↕"}
    </span>
  );

  const stats = useMemo(() => ({
    total:       players.length,
    sandbagging: players.filter(p => p.sandbagging_flag).length,
    champions:   players.filter(p => p.history.some(h => h.championship==="winner")).length,
    noShows:     players.filter(p => p.no_show_count > 0).length,
  }), [players]);

  return (
    <div style={styles.root}>

      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.seasonPill}>Historical records</div>
          <h1 style={styles.title}>Player History</h1>
          <p style={styles.subtitle}>Cross-season tracking · {players.length} players on record</p>
        </div>
        <button style={styles.exportBtn}>↓ Export history</button>
      </div>

      {/* Stats */}
      <div style={styles.statsBar}>
        {[
          { label:"On record",     val:stats.total,       color:"#1a1a2e" },
          { label:"Past champions",val:stats.champions,   color:"#92400E" },
          { label:"Sandbagging",   val:stats.sandbagging, color:"#991B1B" },
          { label:"No-show flag",  val:stats.noShows,     color:"#7A4518" },
        ].map(s => (
          <div key={s.label} style={styles.statChip}>
            <span style={{ ...styles.statVal, color:s.color }}>{s.val}</span>
            <span style={styles.statLabel}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={styles.filterBar}>
        <div style={styles.searchWrap}>
          <span style={styles.searchIcon}>⌕</span>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search player..." style={styles.searchInput}
          />
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
          <label style={styles.filterLabel}>Prior division</label>
          <select value={filterDiv} onChange={e => setFilterDiv(e.target.value)} style={styles.filterSelect}>
            <option value="">All divisions</option>
            {["gold_open","45a","senior_b","senior_c"].map(d => (
              <option key={d} value={d}>{DIVISION_LABEL[d]}</option>
            ))}
          </select>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
          <label style={styles.filterLabel}>Reliability</label>
          <select value={filterReliability} onChange={e => setFilterReliability(e.target.value)} style={styles.filterSelect}>
            <option value="">Any</option>
            <option value="perfect">Perfect (100%)</option>
            <option value="concern">Concern (&lt;80%)</option>
          </select>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:4, justifyContent:"flex-end" }}>
          <label style={styles.filterLabel}>Sandbagging</label>
          <button
            onClick={() => setFilterWarn(w => !w)}
            style={{
              ...styles.toggleBtn,
              background: filterWarn ? "#FEF2F2" : "#F6F5F0",
              color:      filterWarn ? "#991B1B"  : "#888",
              border:     `1px solid ${filterWarn ? "#FCA5A5" : "#E8E6DF"}`,
            }}
          >⚠ Only</button>
        </div>
        {(search || filterDiv || filterReliability || filterWarn) && (
          <div style={{ display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
            <button onClick={() => { setSearch(""); setFilterDiv(""); setFilterReliability(""); setFilterWarn(false); }} style={styles.clearBtn}>
              Clear filters
            </button>
          </div>
        )}
      </div>

      <p style={styles.resultsLabel}>
        Showing <strong>{filtered.length}</strong> of {players.length} players
      </p>

      {/* Table */}
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              {[
                { key:"last_name",   label:"Player" },
                { key:"seasons",     label:"Seasons" },
                { key:"champs",      label:"Championships" },
                { key:"",            label:"Prior divisions" },
                { key:"",            label:"Skill tier" },
                { key:"attendance",  label:"Attendance" },
                { key:"",            label:"Flags" },
              ].map((col, i) => (
                <th key={i} style={styles.th} onClick={() => col.key && handleSort(col.key)}>
                  {col.label}
                  {col.key && <SortIcon k={col.key} />}
                </th>
              ))}
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const initials = `${p.first_name[0]}${p.last_name[0]}`;
              const tc = TIER_COLOR(p.skill_tier_reported);
              const pc = p.position ? POSITION_COLOR[p.position] : null;
              const championships = p.history.filter(h => h.championship==="winner").length;
              const captainSeasons = p.history.filter(h => h.was_captain).length;
              const divisions = [...new Set(p.history.map(h => h.division))];
              const latestSeason = p.history[0];

              return (
                <tr key={p.id} style={{ ...styles.tr, cursor:"pointer", background: p.sandbagging_flag ? "#FFFBEB" : "transparent" }}
                  onClick={() => setSelected(p)}>
                  <td style={styles.td}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div style={styles.tableAvatar}>{initials}</div>
                      <div>
                        <div style={{ fontFamily:"'Fraunces',serif", fontSize:13, fontWeight:600, color:"#1a1a2e", display:"flex", alignItems:"center", gap:5 }}>
                          {p.first_name} {p.last_name}
                          {p.sandbagging_flag && <span style={{ fontSize:10, color:"#EF4444" }}>⚠</span>}
                        </div>
                        <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#bbb" }}>{p.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={styles.td}>
                    <span style={{ fontFamily:"'Fraunces',serif", fontSize:16, fontWeight:700, color:"#1a1a2e" }}>{p.history.length}</span>
                  </td>
                  <td style={styles.td}>
                    {championships > 0 ? (
                      <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                        <span style={{ fontSize:14 }}>🏆</span>
                        <span style={{ fontFamily:"'Fraunces',serif", fontSize:14, fontWeight:700, color:"#92400E" }}>{championships}×</span>
                        {captainSeasons > 0 && <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"#aaa" }}>({captainSeasons}× captain)</span>}
                      </div>
                    ) : (
                      <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#ccc" }}>—</span>
                    )}
                  </td>
                  <td style={styles.td}>
                    <div style={{ display:"flex", gap:3, flexWrap:"wrap" }}>
                      {divisions.map(d => {
                        const dc = DIVISION_COLOR[d] || {};
                        return <Pill key={d} bg={dc.bg} color={dc.color} border={dc.border} small>{DIVISION_LABEL[d]||d}</Pill>;
                      })}
                    </div>
                  </td>
                  <td style={styles.td}>
                    <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                      <Pill {...tc} small>{p.skill_tier_reported}</Pill>
                      {latestSeason && latestSeason.skill_tier !== p.skill_tier_reported && (
                        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"#bbb" }}>
                          was {latestSeason.skill_tier}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={styles.td}>
                    <AttendanceBar rating={p.attendance_rating} noShows={p.no_show_count} />
                  </td>
                  <td style={styles.td}>
                    <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                      {p.sandbagging_flag && <Pill bg="#FEF2F2" color="#991B1B" small>Sandbagging</Pill>}
                      {p.no_show_count > 0 && <Pill bg="#FEF3C7" color="#92400E" small>{p.no_show_count} no-show{p.no_show_count>1?"s":""}</Pill>}
                      {!p.sandbagging_flag && p.no_show_count === 0 && (
                        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#ccc" }}>—</span>
                      )}
                    </div>
                  </td>
                  <td style={styles.td}>
                    <button style={styles.viewBtn} onClick={e => { e.stopPropagation(); setSelected(p); }}>
                      View →
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={8} style={{ padding:"48px 0", textAlign:"center", fontFamily:"'DM Mono',monospace", fontSize:12, color:"#bbb" }}>
                No players match the current filters.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Drawer */}
      {selected && (
        <PlayerHistoryDrawer player={selected} onClose={() => setSelected(null)} />
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap');
        *{box-sizing:border-box}
        tr:hover td{background:#F9F8F3 !important}
      `}</style>
    </div>
  );
}

// -------------------------------------------------------------------------
// Styles
// -------------------------------------------------------------------------

const styles = {
  root:{ fontFamily:"'Fraunces',Georgia,serif", background:"#F6F5F0", minHeight:"100vh", padding:"28px 32px 60px", maxWidth:1280 },
  header:{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12 },
  seasonPill:{ display:"inline-block", fontFamily:"'DM Mono',monospace", fontSize:10, fontWeight:500, letterSpacing:".1em", textTransform:"uppercase", background:"#1a1a2e", color:"#D4A017", padding:"3px 12px", borderRadius:99, marginBottom:8 },
  title:{ fontFamily:"'Fraunces',serif", fontSize:28, fontWeight:700, color:"#1a1a2e", margin:"0 0 3px", letterSpacing:"-.5px" },
  subtitle:{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#999", margin:0 },
  exportBtn:{ fontFamily:"'DM Mono',monospace", fontSize:12, background:"#fff", color:"#444", border:"1px solid #E8E6DF", padding:"9px 18px", borderRadius:8, cursor:"pointer" },
  statsBar:{ display:"flex", gap:10, marginBottom:18, flexWrap:"wrap" },
  statChip:{ display:"flex", alignItems:"center", gap:6, background:"#fff", border:"1px solid #E8E6DF", borderRadius:99, padding:"5px 14px" },
  statVal:{ fontFamily:"'Fraunces',serif", fontSize:16, fontWeight:700, lineHeight:1 },
  statLabel:{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#aaa", textTransform:"uppercase", letterSpacing:".07em" },
  filterBar:{ display:"flex", gap:12, alignItems:"flex-end", flexWrap:"wrap", background:"#fff", border:"1px solid #E8E6DF", borderRadius:10, padding:"14px 16px", marginBottom:12 },
  filterLabel:{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#aaa", textTransform:"uppercase", letterSpacing:".07em" },
  filterSelect:{ fontFamily:"'DM Mono',monospace", fontSize:12, background:"#F6F5F0", border:"1px solid #E8E6DF", borderRadius:6, padding:"6px 10px", color:"#333", outline:"none", minWidth:130 },
  searchWrap:{ position:"relative", display:"flex", flexDirection:"column", gap:4 },
  searchIcon:{ position:"absolute", bottom:8, left:10, color:"#aaa", fontSize:16, pointerEvents:"none" },
  searchInput:{ fontFamily:"'DM Mono',monospace", fontSize:12, background:"#F6F5F0", border:"1px solid #E8E6DF", borderRadius:6, padding:"6px 10px 6px 28px", color:"#333", outline:"none", width:200, marginTop:18 },
  toggleBtn:{ fontFamily:"'DM Mono',monospace", fontSize:11, fontWeight:500, padding:"6px 12px", borderRadius:6, cursor:"pointer" },
  clearBtn:{ fontFamily:"'DM Mono',monospace", fontSize:11, background:"#1a1a2e", color:"#D4A017", border:"none", padding:"6px 14px", borderRadius:6, cursor:"pointer" },
  resultsLabel:{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#aaa", marginBottom:10 },
  tableWrap:{ background:"#fff", border:"1px solid #E8E6DF", borderRadius:10, overflow:"hidden" },
  table:{ width:"100%", borderCollapse:"collapse" },
  th:{ fontFamily:"'DM Mono',monospace", fontSize:10, fontWeight:500, color:"#888", textTransform:"uppercase", letterSpacing:".07em", padding:"11px 14px", textAlign:"left", borderBottom:"1px solid #E8E6DF", background:"#FAFAF8", cursor:"pointer", userSelect:"none", whiteSpace:"nowrap" },
  tr:{ borderBottom:"1px solid #F3F2ED", transition:"background .12s" },
  td:{ padding:"11px 14px", verticalAlign:"middle" },
  tableAvatar:{ width:32, height:32, borderRadius:"50%", background:"#1a1a2e", color:"#D4A017", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Mono',monospace", fontSize:11, fontWeight:500, flexShrink:0 },
  viewBtn:{ fontFamily:"'DM Mono',monospace", fontSize:11, background:"transparent", border:"1px solid #E8E6DF", color:"#666", padding:"4px 12px", borderRadius:6, cursor:"pointer" },
  drawerOverlay:{ position:"fixed", inset:0, background:"rgba(0,0,0,.35)", zIndex:1000, display:"flex", justifyContent:"flex-end" },
  drawer:{ width:460, background:"#fff", height:"100%", overflowY:"auto", display:"flex", flexDirection:"column" },
  drawerHeader:{ display:"flex", alignItems:"center", gap:14, padding:"22px 22px 18px", borderBottom:"1px solid #F0EEE8", position:"relative" },
  drawerAvatar:{ width:44, height:44, borderRadius:"50%", background:"#1a1a2e", color:"#D4A017", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Mono',monospace", fontSize:14, fontWeight:500, flexShrink:0 },
  drawerName:{ fontFamily:"'Fraunces',serif", fontSize:17, fontWeight:700, color:"#1a1a2e", margin:"0 0 3px" },
  drawerEmail:{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#aaa", margin:"0 0 6px" },
  drawerClose:{ position:"absolute", top:20, right:20, background:"none", border:"none", fontSize:16, color:"#aaa", cursor:"pointer" },
  drawerSection:{ padding:"18px 22px", borderBottom:"1px solid #F0EEE8" },
  drawerSectionLabel:{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#aaa", textTransform:"uppercase", letterSpacing:".08em", margin:"0 0 12px" },
  summaryGrid:{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 },
  summaryCard:{ background:"#F6F5F0", borderRadius:8, padding:"10px 10px 8px", textAlign:"center" },
  summaryVal:(color) => ({ fontFamily:"'Fraunces',serif", fontSize:20, fontWeight:700, color:color||"#1a1a2e", margin:"0 0 2px" }),
  summaryLabel:{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"#aaa", textTransform:"uppercase", letterSpacing:".06em", margin:0 },
  histFieldLabel:{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"#bbb", textTransform:"uppercase", letterSpacing:".06em", margin:"0 0 4px" },
};
