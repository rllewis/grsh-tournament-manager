import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { computeScore, formatReturningBadge } from "../lib/playerScoring";

const API   = window.grshConfig?.apiUrl || "/wp-json/grsh/v1";
const NONCE = window.grshConfig?.nonce  || "";

// -------------------------------------------------------------------------
// Mock data
// -------------------------------------------------------------------------

const MOCK_TEAMS = [
  { id: 1, name: "Team Gold",  colour: "#D4A017", draft_order: 1, players: [] },
  { id: 2, name: "Team Blue",  colour: "#1E3A8A", draft_order: 2, players: [] },
  { id: 3, name: "Team Red",   colour: "#991B1B", draft_order: 3, players: [] },
  { id: 4, name: "Team Green", colour: "#166534", draft_order: 4, players: [] },
];

const MOCK_PLAYERS = [
  { id: 1,  first_name: "Linda",   last_name: "Tran",       position: "goaltender", skill_tier_reported: "R2", age: 53 },
  { id: 2,  first_name: "Frank",   last_name: "Dolan",      position: "goaltender", skill_tier_reported: "R1", age: 52 },
  { id: 3,  first_name: "Dave",    last_name: "Kowalski",   position: "defenseman", skill_tier_reported: "B1", age: 47, sandbagging_flag: true },
  { id: 4,  first_name: "Sarah",   last_name: "Mitchell",   position: "defenseman", skill_tier_reported: "B3", age: 46 },
  { id: 5,  first_name: "Tanya",   last_name: "Singh",      position: "defenseman", skill_tier_reported: "B3", age: 46 },
  { id: 6,  first_name: "Derek",   last_name: "Paulson",    position: "defenseman", skill_tier_reported: "C1", age: 50 },
  { id: 7,  first_name: "Norm",    last_name: "Fitzgerald", position: "defenseman", skill_tier_reported: "R2", age: 51 },
  { id: 8,  first_name: "Chris",   last_name: "Fontaine",   position: "winger",     skill_tier_reported: "R1", age: 48 },
  { id: 9,  first_name: "Gail",    last_name: "Preston",    position: "winger",     skill_tier_reported: "C1", age: 49 },
  { id: 10, first_name: "Mike",    last_name: "Hartley",    position: "winger",     skill_tier_reported: "A2", age: 49, sandbagging_flag: true },
  { id: 11, first_name: "Karen",   last_name: "Osei",       position: "winger",     skill_tier_reported: "B3", age: 46 },
  { id: 12, first_name: "James",   last_name: "Whitmore",   position: "winger",     skill_tier_reported: "B2", age: 43 },
  { id: 13, first_name: "Carla",   last_name: "Vance",      position: "center",     skill_tier_reported: "R2", age: 45 },
  { id: 14, first_name: "Paul",    last_name: "Nguyen",     position: "center",     skill_tier_reported: "R1", age: 44 },
  { id: 15, first_name: "Ray",     last_name: "Dominguez",  position: "center",     skill_tier_reported: "C2", age: 55 },
  { id: 16, first_name: "Brenda",  last_name: "Cho",        position: "center",     skill_tier_reported: "R1", age: 44 },
];

const POSITION_COLOR = {
  defenseman: { bg:"#E8F0FE", color:"#1A3F8F" },
  center:     { bg:"#E8F8EF", color:"#1A5C35" },
  winger:     { bg:"#FDF3E8", color:"#7A4A18" },
  goaltender: { bg:"#FCE8E8", color:"#7A1818" },
};
const POSITION_LABEL = { defenseman:"D", center:"C", winger:"W", goaltender:"G" };
const TIER_COLOR = (t) => {
  if (!t) return { bg:"#F3F4F6", color:"#6B7280" };
  const f = t[0];
  if (f==="A") return { bg:"#FCE8E8", color:"#7A1818" };
  if (f==="B") return { bg:"#FEF0E8", color:"#7A4518" };
  if (f==="C") return { bg:"#FEF9E7", color:"#7A5A18" };
  return { bg:"#E8F0FE", color:"#1A3F8F" };
};

const TIMER_DEFAULT = 90;

// -------------------------------------------------------------------------
// Snake draft order generator
// -------------------------------------------------------------------------
function buildSnakeOrder(teamCount, rounds) {
  const picks = [];
  for (let r = 0; r < rounds; r++) {
    const order = r % 2 === 0
      ? Array.from({ length: teamCount }, (_, i) => i)
      : Array.from({ length: teamCount }, (_, i) => teamCount - 1 - i);
    order.forEach(ti => picks.push({ round: r + 1, teamIndex: ti }));
  }
  return picks;
}

// -------------------------------------------------------------------------
// Sub-components
// -------------------------------------------------------------------------

function Pill({ bg, color, children, small }) {
  return (
    <span style={{
      display:"inline-block", background:bg, color,
      fontSize: small ? 9 : 10,
      fontFamily:"'DM Mono',monospace", fontWeight:500,
      padding: small ? "1px 4px" : "1px 6px",
      borderRadius:99, whiteSpace:"nowrap",
    }}>{children}</span>
  );
}

function TimerRing({ seconds, max, color }) {
  const r = 28, circ = 2 * Math.PI * r;
  const pct = seconds / max;
  const dash = circ * pct;
  const urgent = seconds <= 15;
  return (
    <svg width={70} height={70} style={{ transform:"rotate(-90deg)" }}>
      <circle cx={35} cy={35} r={r} fill="none" stroke="#F0EEE8" strokeWidth={5} />
      <circle
        cx={35} cy={35} r={r} fill="none"
        stroke={urgent ? "#DC2626" : color}
        strokeWidth={5}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition:"stroke-dasharray .95s linear, stroke .3s" }}
      />
      <text
        x={35} y={35}
        textAnchor="middle" dominantBaseline="central"
        style={{ transform:"rotate(90deg)", transformOrigin:"35px 35px" }}
        fill={urgent ? "#DC2626" : "#1a1a2e"}
        fontSize={14} fontWeight={700}
        fontFamily="'Fraunces',serif"
      >{seconds}</text>
    </svg>
  );
}

function PlayerRow({ player, onPick, active, picked }) {
  const [hover, setHover] = useState(false);
  const pc = POSITION_COLOR[player.position] || {};
  const tc = TIER_COLOR(player.skill_tier_reported);
  const initials = `${player.first_name[0]}${player.last_name[0]}`;
  const years      = player.years_experience || 0;
  const adjustment = player.committee_score_adjustment || 0;
  const score = computeScore(player.skill_tier_reported, years, adjustment);
  const returningBadge = formatReturningBadge(player.returning_seasons);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => !picked && active && onPick(player)}
      style={{
        display:"flex", alignItems:"center", gap:10,
        padding:"9px 14px",
        background: picked ? "#F9F8F4" : hover && active ? "#F0F4FF" : "#fff",
        borderBottom:"1px solid #F3F2ED",
        cursor: picked ? "default" : active ? "pointer" : "not-allowed",
        opacity: picked ? 0.4 : 1,
        transition:"background .12s",
        position:"relative",
      }}
    >
      {player.sandbagging_flag && !picked && (
        <div style={{ position:"absolute", left:0, top:0, bottom:0, width:3, background:"#EF4444", borderRadius:"0 2px 2px 0" }} />
      )}
      <div style={{
        width:30, height:30, borderRadius:"50%",
        background: picked ? "#E0DED8" : "#1a1a2e",
        color: picked ? "#aaa" : "#D4A017",
        display:"flex", alignItems:"center", justifyContent:"center",
        fontFamily:"'DM Mono',monospace", fontSize:10, fontWeight:500, flexShrink:0,
      }}>{initials}</div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{
          fontFamily:"'Fraunces',serif", fontSize:13, fontWeight:600,
          color: picked ? "#bbb" : "#1a1a2e",
          display:"flex", alignItems:"center", gap:5,
        }}>
          {player.first_name} {player.last_name}
          {player.sandbagging_flag && !picked && <span style={{ fontSize:9, color:"#EF4444" }}>⚠</span>}
          {returningBadge && !picked && (
            <span style={{
              fontFamily:"'DM Mono',monospace", fontSize:8, fontWeight:700,
              background:"#1a1a2e", color:"#D4A017",
              padding:"1px 4px", borderRadius:3, letterSpacing:".04em",
            }}>{returningBadge}</span>
          )}
          {picked && <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"#ccc" }}>picked</span>}
        </div>
        <div style={{ display:"flex", gap:4, marginTop:2, alignItems:"center" }}>
          <Pill {...pc} small>{POSITION_LABEL[player.position]}</Pill>
          <Pill {...tc} small>{player.skill_tier_reported}</Pill>
          <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"#888" }}>
            {years} yrs · <strong style={{ color:"#1a1a2e" }}>{score.toFixed(1)}</strong>
            {adjustment !== 0 && (
              <span style={{ color: adjustment > 0 ? "#166534" : "#991B1B", marginLeft:3 }}>
                ({adjustment > 0 ? "+" : ""}{adjustment})
              </span>
            )}
          </span>
        </div>
      </div>
      {active && !picked && hover && (
        <div style={{
          fontFamily:"'DM Mono',monospace", fontSize:10, fontWeight:500,
          background:"#1a1a2e", color:"#D4A017",
          padding:"3px 10px", borderRadius:5,
          flexShrink:0,
        }}>Pick →</div>
      )}
    </div>
  );
}

function DraftPickCard({ pick, teams }) {
  const team = teams.find(t => t.id === pick.teamId);
  const pc = POSITION_COLOR[pick.player.position] || {};
  const tc = TIER_COLOR(pick.player.skill_tier_reported);
  const initials = `${pick.player.first_name[0]}${pick.player.last_name[0]}`;
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:8,
      padding:"7px 10px",
      border:`1px solid ${team?.colour}22`,
      borderLeft:`3px solid ${team?.colour}`,
      borderRadius:7, background:"#fff", marginBottom:5,
    }}>
      <div style={{
        width:24, height:24, borderRadius:"50%",
        background: team?.colour,
        color:"#fff", display:"flex", alignItems:"center",
        justifyContent:"center",
        fontFamily:"'DM Mono',monospace", fontSize:9, fontWeight:500, flexShrink:0,
      }}>{initials}</div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontFamily:"'Fraunces',serif", fontSize:11, fontWeight:600, color:"#1a1a2e" }}>
          {pick.player.first_name} {pick.player.last_name}
        </div>
        <div style={{ display:"flex", gap:3, marginTop:1 }}>
          <Pill {...pc} small>{POSITION_LABEL[pick.player.position]}</Pill>
          <Pill {...tc} small>{pick.player.skill_tier_reported}</Pill>
        </div>
      </div>
      <div style={{ textAlign:"right", flexShrink:0 }}>
        <div style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"#aaa" }}>R{pick.round} · P{pick.pick}</div>
        <div style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color: team?.colour, fontWeight:500 }}>{team?.name}</div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Main component
// -------------------------------------------------------------------------

export default function Draft() {
  const [teams, setTeams]           = useState([]);
  const [available, setAvailable]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState(null);

  // Derived once teams/players are loaded
  const ROUNDS      = teams.length > 0 && available.length > 0
    ? Math.ceil(available.length / teams.length) : 0;
  const snakeOrder  = useMemo(
    () => teams.length > 0 ? buildSnakeOrder(teams.length, ROUNDS) : [],
    [teams.length, ROUNDS]
  );
  const [picks, setPicks]           = useState([]);
  const [currentPickIdx, setCurrentPickIdx] = useState(0);
  const [timer, setTimer]           = useState(TIMER_DEFAULT);
  const [timerOn, setTimerOn]       = useState(false);
  const [timerEnabled, setTimerEnabled] = useState(true);
  const [draftState, setDraftState] = useState("ready"); // ready | active | paused | complete
  const [filterPos, setFilterPos]   = useState("");
  const [history, setHistory]       = useState([]); // for undo
  const [showConfirm, setShowConfirm] = useState(false); // pre-draft confirmation modal
  const intervalRef = useRef(null);

  const currentPick = snakeOrder[currentPickIdx];
  const currentTeam = currentPick ? teams[currentPick.teamIndex] : null;
  const isDone = currentPickIdx >= snakeOrder.length || available.length === 0;

  // ---- Load teams + available players from rosters API -------------------
  // Falls back to mock data if the endpoint returns 404 (rosters not yet
  // set up) so the draft UI is always usable. A warning banner is shown
  // when mock data is active so the committee knows rosters aren't live.
  const [usingMock, setUsingMock] = useState(false);

  const loadDraft = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    fetch(`${API}/rosters`, { headers: { "X-WP-Nonce": NONCE } })
      .then(r => {
        if (r.status === 404) {
          // Rosters endpoint not yet registered — use mock so draft is usable
          setUsingMock(true);
          setTeams(MOCK_TEAMS);
          setAvailable(MOCK_PLAYERS);
          setLoading(false);
          return null;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        if (!data) return; // already handled 404 above
        const liveteams = (data.teams ?? []).map(t => ({
          ...t,
          players: [],
        }));
        setTeams(liveteams.length > 0 ? liveteams : MOCK_TEAMS);
        setAvailable(data.unassigned ?? MOCK_PLAYERS);
        setUsingMock(liveteams.length === 0);
        setLoading(false);
      })
      .catch(err => {
        // Network error — fall back to mock so draft can still be run offline
        console.warn("GRSH Draft: rosters fetch failed, using mock data.", err.message);
        setUsingMock(true);
        setTeams(MOCK_TEAMS);
        setAvailable(MOCK_PLAYERS);
        setLoadError(err.message); // kept for the warning banner, not a blocker
        setLoading(false);
      });
  }, []);

  useEffect(() => { loadDraft(); }, [loadDraft]);

  // ---- Timer ---------------------------------------------------------------
  useEffect(() => {
    if (timerOn && timerEnabled) {
      intervalRef.current = setInterval(() => {
        setTimer(t => {
          if (t <= 1) {
            clearInterval(intervalRef.current);
            setTimerOn(false);
            // Auto-skip on timeout — just pause for admin action
            setDraftState("paused");
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [timerOn, timerEnabled]);

  const startTimer = () => { setTimer(TIMER_DEFAULT); setTimerOn(true); };
  const pauseTimer = () => { setTimerOn(false); setDraftState("paused"); };
  const resumeTimer = () => { setTimerOn(true); setDraftState("active"); };
  const resetTimer = () => { clearInterval(intervalRef.current); setTimer(TIMER_DEFAULT); setTimerOn(false); };

  // ---- Draft actions -------------------------------------------------------
  const startDraft = () => {
    // Show confirmation modal instead of starting immediately
    setShowConfirm(true);
  };

  const confirmStartDraft = () => {
    setShowConfirm(false);
    setDraftState("active");
    if (timerEnabled) startTimer();
  };

  const makePick = useCallback((player) => {
    if (draftState !== "active" || !currentTeam) return;

    const pickRecord = {
      round: currentPick.round,
      pick: currentPickIdx + 1,
      teamId: currentTeam.id,
      player,
    };

    // Save undo state
    setHistory(h => [...h, { picks, available, teams, currentPickIdx }]);

    // Update teams
    setTeams(ts => ts.map(t =>
      t.id === currentTeam.id ? { ...t, players: [...t.players, player] } : t
    ));

    // Remove from available
    setAvailable(a => a.filter(p => p.id !== player.id));

    // Record pick
    setPicks(ps => [...ps, pickRecord]);

    // Advance
    const nextIdx = currentPickIdx + 1;
    setCurrentPickIdx(nextIdx);

    if (nextIdx >= snakeOrder.length || available.length === 1) {
      setDraftState("complete");
      setTimerOn(false);
    } else {
      resetTimer();
      if (timerEnabled) setTimeout(() => { setTimer(TIMER_DEFAULT); setTimerOn(true); }, 200);
    }
  }, [draftState, currentTeam, currentPick, currentPickIdx, picks, available, teams, snakeOrder]);

  const undoPick = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setPicks(prev.picks);
    setAvailable(prev.available);
    setTeams(prev.teams);
    setCurrentPickIdx(prev.currentPickIdx);
    resetTimer();
    setDraftState("paused");
  };

  const resetDraft = () => {
    setPicks([]);
    setCurrentPickIdx(0);
    setHistory([]);
    resetTimer();
    setDraftState("ready");
    loadDraft(); // re-fetch fresh roster state
  };

  // ---- Filtered pool -------------------------------------------------------
  // Sort by composite draft score DESC so the strongest available player is
  // surfaced first — the typical committee draft order.
  const filteredAvailable = useMemo(() =>
    available
      .filter(p => !filterPos || p.position === filterPos)
      .sort((a, b) => {
        const av = computeScore(a.skill_tier_reported, a.years_experience, a.committee_score_adjustment);
        const bv = computeScore(b.skill_tier_reported, b.years_experience, b.committee_score_adjustment);
        return bv - av;
      }),
  [available, filterPos]);

  // ---- Round display -------------------------------------------------------
  const currentRound = currentPick?.round || ROUNDS;
  const isSnakeReversed = currentRound % 2 === 0;
  const pickedIds = new Set(picks.map(p => p.player.id));

  if (loading) return (
    <div style={{ padding: 48, fontFamily: "'DM Mono',monospace", fontSize: 13, color: "#aaa" }}>
      Loading draft data...
    </div>
  );

  if (teams.length === 0) return (
    <div style={{ padding: 48, fontFamily: "'DM Mono',monospace", fontSize: 13, color: "#aaa" }}>
      No teams created yet — go to Rosters to create teams before running the draft.
    </div>
  );

  return (
    <div style={styles.root}>

      {/* Mock data / API warning banner */}
      {usingMock && (
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          background:"#FEF9C3", borderBottom:"1px solid #FDE047",
          padding:"8px 20px", gap:12, flexShrink:0,
          fontFamily:"'DM Mono',monospace", fontSize:11,
        }}>
          <span style={{ color:"#713F12" }}>
            ⚠ {loadError
              ? `Rosters API error (${loadError}) — running with sample data. Upload class-grsh-rosters.php to load live rosters.`
              : "No live rosters found — running with sample data. Create teams in Rosters first."
            }
          </span>
          <button onClick={loadDraft} style={{
            fontFamily:"'DM Mono',monospace", fontSize:11, padding:"3px 10px",
            background:"#fff", border:"1px solid #FDE047", borderRadius:5,
            color:"#713F12", cursor:"pointer",
          }}>↺ Retry</button>
        </div>
      )}

      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.seasonPill}>Season 2027</div>
          <h1 style={styles.title}>Snake Draft</h1>
          <p style={styles.subtitle}>
            Gold Open · {MOCK_TEAMS.length} teams · {ROUNDS} rounds · {MOCK_PLAYERS.length} players
          </p>
        </div>
        <div style={styles.headerActions}>
          {draftState === "ready" && (
            <button style={styles.startBtn} onClick={startDraft}>▶ Start draft</button>
          )}
          {draftState === "active" && (
            <button style={styles.pauseBtn} onClick={pauseTimer}>⏸ Pause</button>
          )}
          {draftState === "paused" && (
            <button style={styles.startBtn} onClick={resumeTimer}>▶ Resume</button>
          )}
          {(draftState === "active" || draftState === "paused") && (
            <button style={styles.undoBtn} onClick={undoPick} disabled={history.length === 0}>
              ↩ Undo
            </button>
          )}
          {(draftState !== "ready") && (
            <button style={styles.resetBtn} onClick={resetDraft}>↺ Reset</button>
          )}
        </div>
      </div>

      {/* Draft complete banner */}
      {draftState === "complete" && (
        <div style={styles.completeBanner}>
          ✓ Draft complete — all {picks.length} picks made. Review rosters and publish.
        </div>
      )}

      {/* Main layout */}
      <div style={styles.mainLayout}>

        {/* Left — player pool */}
        <div style={styles.poolPanel}>
          <div style={styles.poolHeader}>
            <span style={styles.poolTitle}>Available players</span>
            <span style={styles.poolCount}>{available.length} remaining</span>
          </div>
          <div style={styles.poolFilters}>
            {[
              { value:"",           label:"All" },
              { value:"goaltender", label:"G" },
              { value:"defenseman", label:"D" },
              { value:"center",     label:"C" },
              { value:"winger",     label:"W" },
            ].map(f => (
              <button key={f.value} onClick={() => setFilterPos(f.value)} style={{
                ...styles.posBtn,
                background: filterPos === f.value ? "#1a1a2e" : "#F6F5F0",
                color:      filterPos === f.value ? "#D4A017"  : "#888",
                border:     `1px solid ${filterPos === f.value ? "#1a1a2e" : "#E8E6DF"}`,
              }}>{f.label}</button>
            ))}
          </div>
          <div style={styles.scoreCaption}>
            Sorted by score · range 3.0 – 27.0
          </div>
          <div style={styles.playerList}>
            {filteredAvailable.map(p => (
              <PlayerRow
                key={p.id}
                player={p}
                onPick={makePick}
                active={draftState === "active"}
                picked={pickedIds.has(p.id)}
              />
            ))}
            {filteredAvailable.length === 0 && (
              <div style={styles.emptyPool}>No players in this position</div>
            )}
          </div>
        </div>

        {/* Center — draft board + controls */}
        <div style={styles.centerPanel}>

          {/* Active pick indicator */}
          <div style={{
            ...styles.activePickCard,
            borderColor: draftState === "complete" ? "#86EFAC" : currentTeam?.colour || "#E8E6DF",
            background: draftState === "complete" ? "#F0FDF4" : "#fff",
          }}>
            {draftState === "complete" ? (
              <div style={{ textAlign:"center", padding:"10px 0" }}>
                <p style={{ fontFamily:"'Fraunces',serif", fontSize:20, fontWeight:700, color:"#166534", margin:"0 0 4px" }}>Draft complete</p>
                <p style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#888" }}>{picks.length} picks recorded</p>
              </div>
            ) : draftState === "ready" ? (
              <div style={{ textAlign:"center", padding:"10px 0" }}>
                <p style={{ fontFamily:"'Fraunces',serif", fontSize:16, fontWeight:700, color:"#1a1a2e", margin:"0 0 4px" }}>Ready to draft</p>
                <p style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#aaa", marginBottom:16 }}>Review the checklist before starting</p>
                <div style={{ textAlign:"left", maxWidth:380, margin:"0 auto" }}>
                  {[
                    { ok: teams.length > 0,    text: `${teams.length} teams configured (${teams.map(t=>t.name).join(", ")})` },
                    { ok: available.length > 0, text: `${available.length} players available in pool` },
                    { ok: available.length > 0, text: `Score range: ${available.length>0?Math.min(...available.map(p=>computeScore(p.skill_tier_reported,p.years_experience||0,0))).toFixed(1):"—"} – ${available.length>0?Math.max(...available.map(p=>computeScore(p.skill_tier_reported,p.years_experience||0,0))).toFixed(1):"—"}` },
                    { ok: teams.length > 0,    text: `Draft date: March 15, 2027` },
                    { ok: available.filter(p=>p.sandbagging_flag).length === 0, warn: available.filter(p=>p.sandbagging_flag).length > 0, text: available.filter(p=>p.sandbagging_flag).length > 0 ? `${available.filter(p=>p.sandbagging_flag).length} sandbagging flag(s) — review recommended` : "No sandbagging flags" },
                  ].map((item, i) => (
                    <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"8px 0", borderBottom:"1px solid #F0EEE8", fontFamily:"'DM Mono',monospace", fontSize:12, color: item.ok ? "#555" : "#aaa" }}>
                      <span style={{ color: item.ok ? (item.warn ? "#BA7517" : "#1D9E75") : "#D3D1C7", fontSize:14, flexShrink:0 }}>{item.ok ? (item.warn ? "⚠" : "✓") : "○"}</span>
                      {item.text}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={styles.activePickInner}>
                <div style={{ flex:1 }}>
                  <p style={styles.nowPickingLabel}>Now picking</p>
                  <p style={{ ...styles.nowPickingTeam, color: currentTeam?.colour }}>
                    {currentTeam?.name}
                  </p>
                  <div style={styles.roundPill}>
                    Round {currentRound} · Pick {currentPickIdx + 1} of {snakeOrder.length}
                    <span style={{ marginLeft:8, opacity:.6 }}>{isSnakeReversed ? "◀ reverse" : "▶ forward"}</span>
                  </div>
                </div>
                {timerEnabled && (
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                    <TimerRing seconds={timer} max={TIMER_DEFAULT} color={currentTeam?.colour || "#1a1a2e"} />
                    <button
                      onClick={() => setTimerEnabled(false)}
                      style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"#bbb", background:"none", border:"none", cursor:"pointer" }}
                    >disable timer</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Draft order strip */}
          <div style={styles.orderStrip}>
            <p style={styles.orderLabel}>
              Round {currentRound} order {isSnakeReversed ? "(reverse)" : "(forward)"}
            </p>
            <div style={styles.orderRow}>
              {(isSnakeReversed ? [...teams].reverse() : teams).map((t, i) => {
                const globalIdx = isSnakeReversed
                  ? (currentRound - 1) * teams.length + (teams.length - 1 - i)
                  : (currentRound - 1) * teams.length + i;
                const isCurrent = globalIdx === currentPickIdx && draftState !== "complete";
                const isPast    = globalIdx < currentPickIdx;
                return (
                  <div key={t.id} style={{
                    ...styles.orderTeam,
                    background: isCurrent ? t.colour : isPast ? "#F0EEE8" : "#F6F5F0",
                    border: `1px solid ${isCurrent ? t.colour : "#E8E6DF"}`,
                    opacity: isPast ? 0.5 : 1,
                    transform: isCurrent ? "scale(1.06)" : "scale(1)",
                    transition:"all .2s",
                  }}>
                    <span style={{
                      fontFamily:"'DM Mono',monospace", fontSize:10, fontWeight:500,
                      color: isCurrent ? "#fff" : isPast ? "#bbb" : "#555",
                    }}>{t.name.split(" ")[1]}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Team pick grids */}
          <div style={styles.teamGrid}>
            {teams.map(t => (
              <div key={t.id} style={{ ...styles.teamPickCol, borderTop:`3px solid ${t.colour}` }}>
                <div style={styles.teamPickHeader}>
                  <span style={{ ...styles.teamPickName, color: t.colour }}>{t.name}</span>
                  <span style={styles.teamPickCount}>{t.players.length}</span>
                </div>
                <div style={styles.teamPickList}>
                  {t.players.map(p => {
                    const pc = POSITION_COLOR[p.position] || {};
                    const tc = TIER_COLOR(p.skill_tier_reported);
                    const initials = `${p.first_name[0]}${p.last_name[0]}`;
                    return (
                      <div key={p.id} style={styles.teamPickRow}>
                        <div style={{ ...styles.teamPickAvatar, background: t.colour }}>{initials}</div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={styles.teamPickPlayerName}>{p.first_name} {p.last_name}</div>
                          <div style={{ display:"flex", gap:3 }}>
                            <Pill {...pc} small>{POSITION_LABEL[p.position]}</Pill>
                            <Pill {...tc} small>{p.skill_tier_reported}</Pill>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {t.players.length === 0 && (
                    <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#ddd", padding:"12px 0", textAlign:"center" }}>No picks yet</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right — pick history */}
        <div style={styles.historyPanel}>
          <div style={styles.historyHeader}>
            <span style={styles.historyTitle}>Pick history</span>
            <span style={styles.historyCount}>{picks.length}</span>
          </div>
          <div style={styles.historyList}>
            {picks.length === 0 ? (
              <div style={styles.historyEmpty}>No picks yet</div>
            ) : (
              [...picks].reverse().map((pick, i) => (
                <DraftPickCard key={i} pick={pick} teams={teams} />
              ))
            )}
          </div>
        </div>

      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap');
        *{box-sizing:border-box}
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
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
    padding:"24px 24px 60px",
  },
  header: {
    display:"flex", justifyContent:"space-between", alignItems:"flex-start",
    marginBottom:16, flexWrap:"wrap", gap:12,
  },
  seasonPill: {
    display:"inline-block",
    fontFamily:"'DM Mono',monospace", fontSize:10, fontWeight:500,
    letterSpacing:".1em", textTransform:"uppercase",
    background:"#1a1a2e", color:"#D4A017",
    padding:"3px 12px", borderRadius:99, marginBottom:8,
  },
  title: {
    fontFamily:"'Fraunces',serif", fontSize:26, fontWeight:700,
    color:"#1a1a2e", margin:"0 0 3px", letterSpacing:"-.5px",
  },
  subtitle: {
    fontFamily:"'DM Mono',monospace", fontSize:11, color:"#999", margin:0,
  },
  headerActions: { display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" },
  startBtn: {
    fontFamily:"'DM Mono',monospace", fontSize:12, fontWeight:500,
    background:"#1a1a2e", color:"#D4A017", border:"none",
    padding:"9px 18px", borderRadius:8, cursor:"pointer",
  },
  pauseBtn: {
    fontFamily:"'DM Mono',monospace", fontSize:12,
    background:"#fff", color:"#555", border:"1px solid #E8E6DF",
    padding:"9px 16px", borderRadius:8, cursor:"pointer",
  },
  undoBtn: {
    fontFamily:"'DM Mono',monospace", fontSize:12,
    background:"#fff", color:"#555", border:"1px solid #E8E6DF",
    padding:"9px 16px", borderRadius:8, cursor:"pointer",
  },
  resetBtn: {
    fontFamily:"'DM Mono',monospace", fontSize:12,
    background:"#FEF2F2", color:"#991B1B", border:"1px solid #FCA5A5",
    padding:"9px 14px", borderRadius:8, cursor:"pointer",
  },
  completeBanner: {
    fontFamily:"'DM Mono',monospace", fontSize:12, fontWeight:500,
    background:"#F0FDF4", color:"#166534", border:"1px solid #86EFAC",
    borderRadius:8, padding:"11px 16px", marginBottom:16,
  },
  mainLayout: {
    display:"grid",
    gridTemplateColumns:"240px 1fr 220px",
    gap:14,
    alignItems:"start",
  },
  poolPanel: {
    background:"#fff", border:"1px solid #E8E6DF", borderRadius:12, overflow:"hidden",
  },
  poolHeader: {
    display:"flex", justifyContent:"space-between", alignItems:"center",
    padding:"12px 14px 8px", borderBottom:"1px solid #F0EEE8",
  },
  poolTitle: {
    fontFamily:"'DM Mono',monospace", fontSize:11, fontWeight:500,
    textTransform:"uppercase", letterSpacing:".07em", color:"#555",
  },
  poolCount: {
    fontFamily:"'DM Mono',monospace", fontSize:11,
    background:"#F6F5F0", color:"#888",
    padding:"2px 9px", borderRadius:99, border:"1px solid #E8E6DF",
  },
  poolFilters: {
    display:"flex", gap:4, padding:"7px 10px",
    borderBottom:"1px solid #F0EEE8", flexWrap:"wrap",
  },
  posBtn: {
    fontFamily:"'DM Mono',monospace", fontSize:10, fontWeight:500,
    padding:"3px 9px", borderRadius:5, cursor:"pointer",
  },
  playerList: { overflowY:"auto", maxHeight:520 },
  scoreCaption: {
    fontFamily:"'DM Mono',monospace", fontSize:9,
    color:"#aaa", padding:"4px 14px",
    borderBottom:"1px solid #F0EEE8",
    background:"#FAFAF8",
    textTransform:"uppercase", letterSpacing:".06em",
  },
  emptyPool: {
    fontFamily:"'DM Mono',monospace", fontSize:11, color:"#ccc",
    textAlign:"center", padding:"24px 0",
  },
  centerPanel: { display:"flex", flexDirection:"column", gap:12 },
  activePickCard: {
    border:"2px solid", borderRadius:12, padding:"16px 18px",
    transition:"border-color .3s, background .3s",
  },
  activePickInner: { display:"flex", alignItems:"center", gap:16 },
  nowPickingLabel: {
    fontFamily:"'DM Mono',monospace", fontSize:10, color:"#aaa",
    textTransform:"uppercase", letterSpacing:".08em", margin:"0 0 4px",
  },
  nowPickingTeam: {
    fontFamily:"'Fraunces',serif", fontSize:22, fontWeight:700,
    margin:"0 0 6px", letterSpacing:"-.3px",
  },
  roundPill: {
    fontFamily:"'DM Mono',monospace", fontSize:11, color:"#888",
    display:"inline-flex", alignItems:"center", gap:4,
  },
  orderStrip: {
    background:"#fff", border:"1px solid #E8E6DF", borderRadius:10, padding:"12px 14px",
  },
  orderLabel: {
    fontFamily:"'DM Mono',monospace", fontSize:10, color:"#aaa",
    textTransform:"uppercase", letterSpacing:".07em", margin:"0 0 8px",
  },
  orderRow: { display:"flex", gap:6 },
  orderTeam: {
    flex:1, padding:"6px 4px", borderRadius:7,
    display:"flex", alignItems:"center", justifyContent:"center",
  },
  teamGrid: { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 },
  teamPickCol: {
    background:"#fff", border:"1px solid #E8E6DF", borderRadius:10, overflow:"hidden",
  },
  teamPickHeader: {
    display:"flex", justifyContent:"space-between", alignItems:"center",
    padding:"9px 10px", borderBottom:"1px solid #F0EEE8",
  },
  teamPickName: {
    fontFamily:"'Fraunces',serif", fontSize:12, fontWeight:700,
  },
  teamPickCount: {
    fontFamily:"'DM Mono',monospace", fontSize:11,
    background:"#F6F5F0", color:"#888",
    padding:"1px 7px", borderRadius:99, border:"1px solid #E8E6DF",
  },
  teamPickList: { padding:"8px 8px", display:"flex", flexDirection:"column", gap:5, minHeight:60 },
  teamPickRow: { display:"flex", alignItems:"center", gap:6 },
  teamPickAvatar: {
    width:22, height:22, borderRadius:"50%",
    color:"#fff", display:"flex", alignItems:"center", justifyContent:"center",
    fontFamily:"'DM Mono',monospace", fontSize:8, fontWeight:500, flexShrink:0,
  },
  teamPickPlayerName: {
    fontFamily:"'Fraunces',serif", fontSize:11, fontWeight:600, color:"#1a1a2e",
    marginBottom:2,
  },
  historyPanel: {
    background:"#fff", border:"1px solid #E8E6DF", borderRadius:12, overflow:"hidden",
  },
  historyHeader: {
    display:"flex", justifyContent:"space-between", alignItems:"center",
    padding:"12px 12px 8px", borderBottom:"1px solid #F0EEE8",
  },
  historyTitle: {
    fontFamily:"'DM Mono',monospace", fontSize:11, fontWeight:500,
    textTransform:"uppercase", letterSpacing:".07em", color:"#555",
  },
  historyCount: {
    fontFamily:"'DM Mono',monospace", fontSize:11,
    background:"#F6F5F0", color:"#888",
    padding:"2px 9px", borderRadius:99, border:"1px solid #E8E6DF",
  },
  historyList: { padding:"10px", overflowY:"auto", maxHeight:560 },
  historyEmpty: {
    fontFamily:"'DM Mono',monospace", fontSize:11, color:"#ccc",
    textAlign:"center", padding:"24px 0",
  },
};
