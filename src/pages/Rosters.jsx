import { useState, useMemo, useRef } from "react";

// -------------------------------------------------------------------------
// Mock data
// -------------------------------------------------------------------------

const MOCK_UNASSIGNED = [
  { id: 1,  first_name: "Chris",   last_name: "Fontaine",  position: "winger",     skill_tier_assigned: null,  skill_tier_reported: "R1", age: 48, division_requested: "gold_open", payment_status: "paid",    player_type: "primary" },
  { id: 2,  first_name: "Sarah",   last_name: "Mitchell",  position: "defenseman", skill_tier_assigned: null,  skill_tier_reported: "B3", age: 46, division_requested: "gold_open", payment_status: "paid",    player_type: "primary" },
  { id: 5,  first_name: "Paul",    last_name: "Nguyen",    position: "center",     skill_tier_assigned: null,  skill_tier_reported: "R1", age: 44, division_requested: "gold_open", payment_status: "paid",    player_type: "primary" },
  { id: 6,  first_name: "Mike",    last_name: "Hartley",   position: "winger",     skill_tier_assigned: null,  skill_tier_reported: "A2", age: 49, division_requested: "gold_open", payment_status: "paid",    player_type: "primary", sandbagging_flag: true },
  { id: 10, first_name: "Karen",   last_name: "Osei",      position: "winger",     skill_tier_assigned: "B3", skill_tier_reported: "B2", age: 46, division_requested: "gold_open", payment_status: "paid",    player_type: "primary" },
  { id: 14, first_name: "Derek",   last_name: "Paulson",   position: "defenseman", skill_tier_assigned: null,  skill_tier_reported: "C1", age: 50, division_requested: "gold_open", payment_status: "paid",    player_type: "primary" },
  { id: 15, first_name: "Carla",   last_name: "Vance",     position: "center",     skill_tier_assigned: null,  skill_tier_reported: "R2", age: 45, division_requested: "gold_open", payment_status: "paid",    player_type: "primary" },
  { id: 16, first_name: "James",   last_name: "Whitmore",  position: "winger",     skill_tier_assigned: null,  skill_tier_reported: "B2", age: 43, division_requested: "gold_open", payment_status: "pending", player_type: "primary" },
];

const MOCK_TEAMS = [
  {
    id: 1, name: "Team Gold", colour: "#D4A017", division: "gold_open", draft_order: 1,
    parity_score: 74.2, skill_score: 72.1, age_score: 76.3,
    players: [
      { id: 8,  first_name: "Linda",   last_name: "Tran",      position: "goaltender", skill_tier_assigned: null,  skill_tier_reported: "R2", age: 53, payment_status: "paid",    player_type: "primary", is_captain: false },
      { id: 7,  first_name: "Dave",    last_name: "Kowalski",  position: "defenseman", skill_tier_assigned: null,  skill_tier_reported: "B1", age: 47, payment_status: "paid",    player_type: "primary", is_captain: true,  sandbagging_flag: true },
      { id: 11, first_name: "Scott",   last_name: "Lemieux",   position: "defenseman", skill_tier_assigned: null,  skill_tier_reported: "R3", age: 50, payment_status: "paid",    player_type: "primary", is_captain: false },
      { id: 13, first_name: "Brenda",  last_name: "Cho",       position: "center",     skill_tier_assigned: null,  skill_tier_reported: "R1", age: 44, payment_status: "paid",    player_type: "primary", is_captain: false },
    ],
  },
  {
    id: 2, name: "Team Blue", colour: "#1E3A8A", division: "gold_open", draft_order: 2,
    parity_score: 71.8, skill_score: 70.5, age_score: 73.1,
    players: [
      { id: 4,  first_name: "Janet",   last_name: "Ruiz",      position: "goaltender", skill_tier_assigned: null,  skill_tier_reported: "C1", age: 51, payment_status: "pending", player_type: "primary", is_captain: false },
      { id: 9,  first_name: "Ray",     last_name: "Dominguez", position: "center",     skill_tier_assigned: null,  skill_tier_reported: "C2", age: 55, payment_status: "pending", player_type: "primary", is_captain: true  },
      { id: 17, first_name: "Hector",  last_name: "Morales",   position: "winger",     skill_tier_assigned: null,  skill_tier_reported: "R2", age: 48, payment_status: "paid",    player_type: "primary", is_captain: false },
      { id: 18, first_name: "Tanya",   last_name: "Singh",     position: "defenseman", skill_tier_assigned: null,  skill_tier_reported: "B3", age: 46, payment_status: "paid",    player_type: "primary", is_captain: false },
    ],
  },
  {
    id: 3, name: "Team Red", colour: "#991B1B", division: "gold_open", draft_order: 3,
    parity_score: 68.5, skill_score: 67.0, age_score: 70.0,
    players: [
      { id: 19, first_name: "Frank",   last_name: "Dolan",     position: "goaltender", skill_tier_assigned: null,  skill_tier_reported: "R1", age: 52, payment_status: "paid",    player_type: "primary", is_captain: false },
      { id: 20, first_name: "Gail",    last_name: "Preston",   position: "winger",     skill_tier_assigned: null,  skill_tier_reported: "C1", age: 49, payment_status: "paid",    player_type: "primary", is_captain: true  },
      { id: 21, first_name: "Norm",    last_name: "Fitzgerald",position: "defenseman", skill_tier_assigned: null,  skill_tier_reported: "R2", age: 51, payment_status: "paid",    player_type: "primary", is_captain: false },
    ],
  },
];

// -------------------------------------------------------------------------
// Config
// -------------------------------------------------------------------------

const POSITION_LABEL = { defenseman:"Defense", center:"Center", winger:"Winger", goaltender:"Goalie" };
const POSITION_COLOR = {
  defenseman: { bg:"#E8F0FE", color:"#1A3F8F" },
  center:     { bg:"#E8F8EF", color:"#1A5C35" },
  winger:     { bg:"#FDF3E8", color:"#7A4A18" },
  goaltender: { bg:"#FCE8E8", color:"#7A1818" },
};
const TIER_COLOR = (t) => {
  if (!t) return { bg:"#F3F4F6", color:"#6B7280" };
  const f = t[0];
  if (f==="A") return { bg:"#FCE8E8", color:"#7A1818" };
  if (f==="B") return { bg:"#FEF0E8", color:"#7A4518" };
  if (f==="C") return { bg:"#FEF9E7", color:"#7A5A18" };
  return { bg:"#E8F0FE", color:"#1A3F8F" };
};
const PAYMENT_COLOR = {
  paid:    { bg:"#E6F4EA", color:"#1E6B3A" },
  pending: { bg:"#FEF3C7", color:"#92400E" },
  waived:  { bg:"#EDE9FE", color:"#4C1D95" },
};

// -------------------------------------------------------------------------
// Parity bar component
// -------------------------------------------------------------------------

function ParityBar({ score, color }) {
  const pct = Math.round(score);
  const getColor = (s) => s >= 75 ? "#166534" : s >= 65 ? "#92400E" : "#991B1B";
  return (
    <div style={{ width: "100%" }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#aaa", textTransform:"uppercase", letterSpacing:".06em" }}>Parity</span>
        <span style={{ fontFamily:"'Fraunces',serif", fontSize:13, fontWeight:700, color: getColor(score) }}>{pct}</span>
      </div>
      <div style={{ height:4, background:"#F0EEE8", borderRadius:99, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${pct}%`, background: getColor(score), borderRadius:99, transition:"width .5s ease" }} />
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Player card (draggable)
// -------------------------------------------------------------------------

function PlayerCard({ player, onDragStart, compact, showCaptain, onRemove, onMakeCaptain, teamColor }) {
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const tier = player.skill_tier_assigned || player.skill_tier_reported;
  const tc = TIER_COLOR(tier);
  const pc = player.position ? POSITION_COLOR[player.position] : null;
  const initials = `${player.first_name[0]}${player.last_name[0]}`;

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("playerId", String(player.id)); onDragStart && onDragStart(player); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setMenuOpen(false); }}
      style={{
        ...styles.playerCard,
        background: hover ? "#FAFAF8" : "#fff",
        borderColor: player.sandbagging_flag ? "#FDE68A" : hover ? "#D0CEC6" : "#E8E6DF",
        cursor: "grab",
        position: "relative",
      }}
    >
      {player.sandbagging_flag && (
        <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:"#EF4444", borderRadius:"8px 8px 0 0" }} />
      )}
      <div style={styles.cardLeft}>
        <div style={{
          ...styles.cardAvatar,
          background: teamColor || "#1a1a2e",
          border: player.is_captain ? `2px solid ${teamColor || "#D4A017"}` : "none",
          boxShadow: player.is_captain ? `0 0 0 2px #fff, 0 0 0 4px ${teamColor || "#D4A017"}` : "none",
        }}>
          {initials}
        </div>
        <div>
          <div style={styles.cardName}>
            {player.first_name} {player.last_name}
            {player.is_captain && <span style={{ ...styles.captainBadge, color: teamColor || "#D4A017", borderColor: teamColor || "#D4A017" }}>C</span>}
            {player.sandbagging_flag && <span style={{ fontSize:10, color:"#EF4444" }}>⚠</span>}
          </div>
          <div style={styles.cardMeta}>
            {pc && <span style={{ ...styles.miniPill, background:pc.bg, color:pc.color }}>{POSITION_LABEL[player.position]}</span>}
            <span style={{ ...styles.miniPill, ...tc }}>{tier || "?"}</span>
            <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#bbb" }}>age {player.age}</span>
          </div>
        </div>
      </div>
      {(onRemove || onMakeCaptain) && hover && (
        <div style={styles.cardActions}>
          {onMakeCaptain && !player.is_captain && (
            <button onClick={(e) => { e.stopPropagation(); onMakeCaptain(player.id); }} style={styles.cardActionBtn} title="Make captain">C</button>
          )}
          {onRemove && (
            <button onClick={(e) => { e.stopPropagation(); onRemove(player.id); }} style={{ ...styles.cardActionBtn, color:"#DC2626" }} title="Remove from team">✕</button>
          )}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------------
// Team column (drop zone)
// -------------------------------------------------------------------------

function TeamColumn({ team, onDrop, onRemovePlayer, onMakeCaptain }) {
  const [dragOver, setDragOver] = useState(false);

  const positionCounts = useMemo(() => {
    const c = { defenseman:0, center:0, winger:0, goaltender:0 };
    team.players.forEach(p => { if (p.position) c[p.position]++; });
    return c;
  }, [team.players]);

  const hasGoalie = positionCounts.goaltender >= 1;
  const hasBackupGoalie = positionCounts.goaltender >= 2;
  const missingDefense = positionCounts.defenseman < 2;

  return (
    <div style={styles.teamColumn}>
      {/* Team header */}
      <div style={{ ...styles.teamHeader, borderTop: `4px solid ${team.colour}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
          <div style={{ ...styles.teamColorDot, background: team.colour }} />
          <div>
            <p style={styles.teamName}>{team.name}</p>
            <p style={styles.teamSub}>Draft order #{team.draft_order} · {team.players.length} players</p>
          </div>
        </div>
        <ParityBar score={team.parity_score} color={team.colour} />

        {/* Position breakdown */}
        <div style={styles.posBreakdown}>
          {[
            { key:"goaltender", label:"G", min:1 },
            { key:"defenseman", label:"D", min:2 },
            { key:"center",     label:"C", min:1 },
            { key:"winger",     label:"W", min:2 },
          ].map(({ key, label, min }) => {
            const count = positionCounts[key];
            const ok = count >= min;
            return (
              <div key={key} style={styles.posChip}>
                <span style={{ ...styles.posLabel, color: ok ? "#166534" : "#DC2626" }}>{label}</span>
                <span style={{ ...styles.posCount, color: ok ? "#166534" : "#DC2626" }}>{count}</span>
              </div>
            );
          })}
        </div>

        {/* Warnings */}
        <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
          {!hasGoalie       && <div style={styles.teamWarning}>⚠ No goalie assigned</div>}
          {!hasBackupGoalie && hasGoalie && <div style={{ ...styles.teamWarning, background:"#FFFBEB", color:"#92400E", borderColor:"#FDE68A" }}>ℹ No backup goalie</div>}
          {missingDefense   && <div style={styles.teamWarning}>⚠ Needs 2+ defensemen</div>}
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const id = parseInt(e.dataTransfer.getData("playerId")); onDrop(id, team.id); }}
        style={{
          ...styles.dropZone,
          background: dragOver ? "#F0F4FF" : "#F9F8F4",
          borderColor: dragOver ? team.colour : "transparent",
          borderWidth: 2,
          borderStyle: dragOver ? "dashed" : "solid",
        }}
      >
        {team.players.length === 0 && (
          <div style={styles.dropEmpty}>Drop players here</div>
        )}
        {team.players.map(p => (
          <PlayerCard
            key={p.id}
            player={p}
            teamColor={team.colour}
            onRemove={(pid) => onRemovePlayer(pid, team.id)}
            onMakeCaptain={(pid) => onMakeCaptain(pid, team.id)}
          />
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Main component
// -------------------------------------------------------------------------

export default function Rosters() {
  const [teams, setTeams]           = useState(MOCK_TEAMS);
  const [unassigned, setUnassigned] = useState(MOCK_UNASSIGNED);
  const [division, setDivision]     = useState("gold_open");
  const [dragging, setDragging]     = useState(null);
  const [saved, setSaved]           = useState(false);
  const [filterPos, setFilterPos]   = useState("");

  const filteredUnassigned = useMemo(() =>
    unassigned.filter(p =>
      p.division_requested === division &&
      (!filterPos || p.position === filterPos)
    ),
  [unassigned, division, filterPos]);

  // Assign player to team
  const handleDrop = (playerId, teamId) => {
    const fromUnassigned = unassigned.find(p => p.id === playerId);
    const fromTeam = teams.find(t => t.players.find(p => p.id === playerId));

    if (fromUnassigned) {
      setUnassigned(u => u.filter(p => p.id !== playerId));
      setTeams(ts => ts.map(t => t.id === teamId
        ? { ...t, players: [...t.players, { ...fromUnassigned, is_captain: false }] }
        : t
      ));
    } else if (fromTeam && fromTeam.id !== teamId) {
      const player = fromTeam.players.find(p => p.id === playerId);
      setTeams(ts => ts.map(t => {
        if (t.id === fromTeam.id) return { ...t, players: t.players.filter(p => p.id !== playerId) };
        if (t.id === teamId)      return { ...t, players: [...t.players, { ...player, is_captain: false }] };
        return t;
      }));
    }
    setDragging(null);
  };

  // Remove player back to pool
  const handleRemove = (playerId, teamId) => {
    const team = teams.find(t => t.id === teamId);
    const player = team?.players.find(p => p.id === playerId);
    if (!player) return;
    setTeams(ts => ts.map(t => t.id === teamId
      ? { ...t, players: t.players.filter(p => p.id !== playerId) }
      : t
    ));
    setUnassigned(u => [...u, { ...player, is_captain: false }]);
  };

  // Set captain
  const handleMakeCaptain = (playerId, teamId) => {
    setTeams(ts => ts.map(t => t.id === teamId
      ? { ...t, players: t.players.map(p => ({ ...p, is_captain: p.id === playerId })) }
      : t
    ));
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const totalAssigned = teams.reduce((s, t) => s + t.players.length, 0);
  const totalPlayers  = totalAssigned + unassigned.filter(p => p.division_requested === division).length;

  return (
    <div style={styles.root}>

      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.seasonPill}>Season 2027</div>
          <h1 style={styles.title}>Rosters</h1>
          <p style={styles.subtitle}>Drag players onto teams · {totalAssigned} assigned · {filteredUnassigned.length} in pool</p>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
          <select
            value={division}
            onChange={e => setDivision(e.target.value)}
            style={styles.divisionSelect}
          >
            {[
              { value:"gold_open", label:"Gold Open" },
              { value:"45a",       label:"45A" },
              { value:"senior_b",  label:"Senior B" },
              { value:"senior_c",  label:"Senior C" },
            ].map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
          <button style={styles.printBtn}>⎙ Print rosters</button>
          <button
            style={{ ...styles.saveBtn, background: saved ? "#166534" : "#1a1a2e", color: saved ? "#fff" : "#D4A017" }}
            onClick={handleSave}
          >
            {saved ? "✓ Saved" : "Save rosters"}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={styles.progressWrap}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
          <span style={styles.progressLabel}>Roster assignment progress — Gold Open</span>
          <span style={styles.progressPct}>{totalPlayers > 0 ? Math.round((totalAssigned/totalPlayers)*100) : 0}%</span>
        </div>
        <div style={styles.progressTrack}>
          <div style={{ ...styles.progressFill, width: totalPlayers > 0 ? `${(totalAssigned/totalPlayers)*100}%` : "0%" }} />
        </div>
        <div style={styles.progressLegend}>
          <span>{totalAssigned} assigned to teams</span>
          <span>{filteredUnassigned.length} in unassigned pool</span>
        </div>
      </div>

      {/* Main layout — teams + pool */}
      <div style={styles.boardLayout}>

        {/* Team columns */}
        <div style={styles.teamsArea}>
          {teams.map(team => (
            <TeamColumn
              key={team.id}
              team={team}
              onDrop={handleDrop}
              onRemovePlayer={handleRemove}
              onMakeCaptain={handleMakeCaptain}
            />
          ))}
        </div>

        {/* Unassigned pool */}
        <div style={styles.poolColumn}>
          <div style={styles.poolHeader}>
            <p style={styles.poolTitle}>Unassigned pool</p>
            <span style={styles.poolCount}>{filteredUnassigned.length}</span>
          </div>

          {/* Pool filters */}
          <div style={styles.poolFilters}>
            {["", "goaltender", "defenseman", "center", "winger"].map(pos => (
              <button
                key={pos}
                onClick={() => setFilterPos(pos)}
                style={{
                  ...styles.posFilter,
                  background: filterPos === pos ? "#1a1a2e" : "#F6F5F0",
                  color: filterPos === pos ? "#D4A017" : "#888",
                  border: `1px solid ${filterPos === pos ? "#1a1a2e" : "#E8E6DF"}`,
                }}
              >
                {pos ? POSITION_LABEL[pos] : "All"}
              </button>
            ))}
          </div>

          {/* Drop zone for unassigned */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const pid = parseInt(e.dataTransfer.getData("playerId"));
              const fromTeam = teams.find(t => t.players.find(p => p.id === pid));
              if (fromTeam) handleRemove(pid, fromTeam.id);
            }}
            style={styles.pool}
          >
            {filteredUnassigned.length === 0 ? (
              <div style={styles.poolEmpty}>
                <p style={{ fontFamily:"'Fraunces',serif", fontSize:15, color:"#bbb", fontWeight:600, margin:"0 0 4px" }}>Pool empty</p>
                <p style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#ccc" }}>All players assigned</p>
              </div>
            ) : (
              filteredUnassigned.map(p => (
                <PlayerCard
                  key={p.id}
                  player={p}
                  onDragStart={() => setDragging(p)}
                />
              ))
            )}
          </div>

          {/* Parity comparison */}
          <div style={styles.parityPanel}>
            <p style={styles.parityTitle}>Team parity comparison</p>
            {teams.map(t => (
              <div key={t.id} style={{ marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                  <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#555", display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ width:8, height:8, borderRadius:"50%", background:t.colour, display:"inline-block" }} />
                    {t.name}
                  </span>
                  <span style={{ fontFamily:"'Fraunces',serif", fontSize:13, fontWeight:700, color: t.parity_score >= 73 ? "#166534" : t.parity_score >= 68 ? "#92400E" : "#991B1B" }}>
                    {t.parity_score.toFixed(1)}
                  </span>
                </div>
                <div style={{ height:3, background:"#F0EEE8", borderRadius:99, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${t.parity_score}%`, background:t.colour, borderRadius:99, transition:"width .5s ease" }} />
                </div>
              </div>
            ))}
            <div style={styles.parityLegend}>
              <span style={{ color:"#166534" }}>● 75+ balanced</span>
              <span style={{ color:"#92400E" }}>● 65–74 review</span>
              <span style={{ color:"#991B1B" }}>● &lt;65 rebalance</span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap');
        *{box-sizing:border-box}
      `}</style>
    </div>
  );
}

// -------------------------------------------------------------------------
// Styles
// -------------------------------------------------------------------------

const styles = {
  root: {
    fontFamily: "'Fraunces', Georgia, serif",
    background: "#F6F5F0",
    minHeight: "100vh",
    padding: "28px 28px 60px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
    flexWrap: "wrap",
    gap: 12,
  },
  seasonPill: {
    display: "inline-block",
    fontFamily: "'DM Mono',monospace",
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: ".1em",
    textTransform: "uppercase",
    background: "#1a1a2e",
    color: "#D4A017",
    padding: "3px 12px",
    borderRadius: 99,
    marginBottom: 8,
  },
  title: {
    fontFamily: "'Fraunces',serif",
    fontSize: 28,
    fontWeight: 700,
    color: "#1a1a2e",
    margin: "0 0 3px",
    letterSpacing: "-.5px",
  },
  subtitle: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 11,
    color: "#999",
    margin: 0,
  },
  divisionSelect: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 12,
    background: "#fff",
    border: "1px solid #E8E6DF",
    borderRadius: 8,
    padding: "8px 14px",
    color: "#333",
    outline: "none",
  },
  printBtn: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 12,
    background: "#fff",
    color: "#555",
    border: "1px solid #E8E6DF",
    padding: "9px 16px",
    borderRadius: 8,
    cursor: "pointer",
  },
  saveBtn: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 12,
    fontWeight: 500,
    border: "none",
    padding: "9px 18px",
    borderRadius: 8,
    cursor: "pointer",
    transition: "background .3s, color .3s",
  },
  progressWrap: {
    background: "#fff",
    border: "1px solid #E8E6DF",
    borderRadius: 10,
    padding: "16px 20px",
    marginBottom: 20,
  },
  progressLabel: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 11,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: ".07em",
  },
  progressPct: {
    fontFamily: "'Fraunces',serif",
    fontSize: 16,
    fontWeight: 700,
    color: "#1a1a2e",
  },
  progressTrack: {
    height: 6,
    background: "#E8E6DF",
    borderRadius: 99,
    overflow: "hidden",
    marginBottom: 6,
  },
  progressFill: {
    height: "100%",
    background: "#1a1a2e",
    borderRadius: 99,
    transition: "width .6s ease",
  },
  progressLegend: {
    display: "flex",
    justifyContent: "space-between",
    fontFamily: "'DM Mono',monospace",
    fontSize: 10,
    color: "#bbb",
  },
  boardLayout: {
    display: "grid",
    gridTemplateColumns: "1fr 260px",
    gap: 16,
    alignItems: "start",
  },
  teamsArea: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 14,
    alignItems: "start",
  },
  teamColumn: {
    display: "flex",
    flexDirection: "column",
    background: "#fff",
    border: "1px solid #E8E6DF",
    borderRadius: 12,
    overflow: "hidden",
  },
  teamHeader: {
    padding: "16px 14px 12px",
    borderBottom: "1px solid #F0EEE8",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  teamColorDot: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    flexShrink: 0,
  },
  teamName: {
    fontFamily: "'Fraunces',serif",
    fontSize: 15,
    fontWeight: 700,
    color: "#1a1a2e",
    margin: "0 0 1px",
  },
  teamSub: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 10,
    color: "#aaa",
    margin: 0,
  },
  posBreakdown: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
  },
  posChip: {
    display: "flex",
    alignItems: "center",
    gap: 3,
    background: "#F6F5F0",
    border: "1px solid #E8E6DF",
    borderRadius: 6,
    padding: "2px 8px",
  },
  posLabel: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 10,
    fontWeight: 500,
    textTransform: "uppercase",
    letterSpacing: ".05em",
  },
  posCount: {
    fontFamily: "'Fraunces',serif",
    fontSize: 13,
    fontWeight: 700,
  },
  teamWarning: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 10,
    background: "#FEF2F2",
    color: "#991B1B",
    border: "1px solid #FCA5A5",
    borderRadius: 5,
    padding: "3px 8px",
    fontWeight: 500,
  },
  dropZone: {
    minHeight: 120,
    padding: "10px 10px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    transition: "background .15s, border-color .15s",
    borderRadius: "0 0 12px 12px",
  },
  dropEmpty: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 11,
    color: "#ccc",
    textAlign: "center",
    padding: "20px 0",
  },
  playerCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 10px",
    border: "1px solid #E8E6DF",
    borderRadius: 8,
    transition: "background .12s, border-color .12s",
    userSelect: "none",
  },
  cardLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    flex: 1,
  },
  cardAvatar: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'DM Mono',monospace",
    fontSize: 10,
    fontWeight: 500,
    flexShrink: 0,
  },
  cardName: {
    fontFamily: "'Fraunces',serif",
    fontSize: 12,
    fontWeight: 600,
    color: "#1a1a2e",
    display: "flex",
    alignItems: "center",
    gap: 4,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  captainBadge: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 9,
    fontWeight: 700,
    border: "1px solid",
    padding: "0 4px",
    borderRadius: 3,
    flexShrink: 0,
  },
  cardMeta: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
    flexWrap: "wrap",
  },
  miniPill: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 9,
    fontWeight: 500,
    padding: "1px 5px",
    borderRadius: 99,
  },
  cardActions: {
    display: "flex",
    gap: 4,
    flexShrink: 0,
  },
  cardActionBtn: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 11,
    fontWeight: 600,
    background: "#F6F5F0",
    border: "1px solid #E8E6DF",
    color: "#555",
    width: 22,
    height: 22,
    borderRadius: 5,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  },
  poolColumn: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
    background: "#fff",
    border: "1px solid #E8E6DF",
    borderRadius: 12,
    overflow: "hidden",
  },
  poolHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 14px 10px",
    borderBottom: "1px solid #F0EEE8",
  },
  poolTitle: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 11,
    fontWeight: 500,
    textTransform: "uppercase",
    letterSpacing: ".07em",
    color: "#555",
    margin: 0,
  },
  poolCount: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 11,
    background: "#F6F5F0",
    color: "#888",
    padding: "2px 9px",
    borderRadius: 99,
    border: "1px solid #E8E6DF",
  },
  poolFilters: {
    display: "flex",
    gap: 4,
    flexWrap: "wrap",
    padding: "8px 10px",
    borderBottom: "1px solid #F0EEE8",
  },
  posFilter: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 10,
    fontWeight: 500,
    padding: "3px 8px",
    borderRadius: 5,
    cursor: "pointer",
    transition: "all .15s",
  },
  pool: {
    padding: "10px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minHeight: 200,
    maxHeight: 420,
    overflowY: "auto",
  },
  poolEmpty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: 120,
    color: "#ccc",
  },
  parityPanel: {
    padding: "14px",
    borderTop: "1px solid #F0EEE8",
  },
  parityTitle: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 10,
    fontWeight: 500,
    textTransform: "uppercase",
    letterSpacing: ".07em",
    color: "#aaa",
    margin: "0 0 12px",
  },
  parityLegend: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    fontFamily: "'DM Mono',monospace",
    fontSize: 9,
    marginTop: 10,
  },
};
