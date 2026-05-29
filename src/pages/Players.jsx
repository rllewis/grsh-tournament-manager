import { useState, useMemo } from "react";

const API = window.grshConfig?.apiUrl || "/wp-json/grsh/v1";
const NONCE = window.grshConfig?.nonce || "";

// -------------------------------------------------------------------------
// Mock data — replaced by real API in production
// -------------------------------------------------------------------------

const MOCK_PLAYERS = [
  { id: 1,  first_name: "Chris",   last_name: "Fontaine",  email: "c.fontaine@email.com",  age: 48, position: "winger",     skill_tier_reported: "R1", skill_tier_assigned: null,  division_requested: "gold_open", division_assigned: null,  player_type: "primary", payment_status: "paid",    status: "approved",       is_alternate: false, sandbagging_flag: false, jersey_size: "L",   notes: "" },
  { id: 2,  first_name: "Sarah",   last_name: "Mitchell",  email: "s.mitchell@email.com",  age: 46, position: "defenseman", skill_tier_reported: "B3", skill_tier_assigned: null,  division_requested: "45a",       division_assigned: null,  player_type: "primary", payment_status: "paid",    status: "approved",       is_alternate: false, sandbagging_flag: false, jersey_size: "M",   notes: "" },
  { id: 3,  first_name: "Tom",     last_name: "Breslin",   email: "t.breslin@email.com",   age: 52, position: null,         skill_tier_reported: "R2", skill_tier_assigned: null,  division_requested: "senior_b",  division_assigned: null,  player_type: "sub",     payment_status: "waived",  status: "approved",       is_alternate: true,  sandbagging_flag: false, jersey_size: "XL",  notes: "" },
  { id: 4,  first_name: "Janet",   last_name: "Ruiz",      email: "j.ruiz@email.com",      age: 51, position: "goaltender", skill_tier_reported: "C1", skill_tier_assigned: null,  division_requested: "senior_c",  division_assigned: null,  player_type: "primary", payment_status: "pending", status: "registered",     is_alternate: false, sandbagging_flag: false, jersey_size: "Goalie", notes: "" },
  { id: 5,  first_name: "Paul",    last_name: "Nguyen",    email: "p.nguyen@email.com",    age: 44, position: "center",     skill_tier_reported: "R1", skill_tier_assigned: null,  division_requested: "gold_open", division_assigned: null,  player_type: "primary", payment_status: "paid",    status: "approved",       is_alternate: false, sandbagging_flag: false, jersey_size: "M",   notes: "" },
  { id: 6,  first_name: "Mike",    last_name: "Hartley",   email: "m.hartley@email.com",   age: 49, position: "winger",     skill_tier_reported: "A2", skill_tier_assigned: null,  division_requested: "senior_c",  division_assigned: null,  player_type: "primary", payment_status: "paid",    status: "approved",       is_alternate: false, sandbagging_flag: true,  jersey_size: "L",   notes: "Prior div Gold Open" },
  { id: 7,  first_name: "Dave",    last_name: "Kowalski",  email: "d.kowalski@email.com",  age: 47, position: "defenseman", skill_tier_reported: "B1", skill_tier_assigned: null,  division_requested: "senior_b",  division_assigned: null,  player_type: "primary", payment_status: "paid",    status: "approved",       is_alternate: false, sandbagging_flag: true,  jersey_size: "2XL", notes: "" },
  { id: 8,  first_name: "Linda",   last_name: "Tran",      email: "l.tran@email.com",      age: 53, position: "goaltender", skill_tier_reported: "R2", skill_tier_assigned: null,  division_requested: "45a",       division_assigned: null,  player_type: "primary", payment_status: "paid",    status: "draft_eligible", is_alternate: false, sandbagging_flag: false, jersey_size: "Goalie", notes: "" },
  { id: 9,  first_name: "Ray",     last_name: "Dominguez", email: "r.dominguez@email.com", age: 55, position: "center",     skill_tier_reported: "C2", skill_tier_assigned: null,  division_requested: "senior_b",  division_assigned: null,  player_type: "primary", payment_status: "pending", status: "registered",     is_alternate: false, sandbagging_flag: false, jersey_size: "L",   notes: "" },
  { id: 10, first_name: "Karen",   last_name: "Osei",      email: "k.osei@email.com",      age: 46, position: "winger",     skill_tier_reported: "B2", skill_tier_assigned: "B3", division_requested: "gold_open", division_assigned: null,  player_type: "primary", payment_status: "paid",    status: "approved",       is_alternate: false, sandbagging_flag: false, jersey_size: "S",   notes: "Committee override B2→B3" },
  { id: 11, first_name: "Scott",   last_name: "Lemieux",   email: "s.lemieux@email.com",   age: 50, position: "defenseman", skill_tier_reported: "R3", skill_tier_assigned: null,  division_requested: "senior_c",  division_assigned: null,  player_type: "primary", payment_status: "paid",    status: "draft_eligible", is_alternate: false, sandbagging_flag: false, jersey_size: "XL",  notes: "" },
  { id: 12, first_name: "Amy",     last_name: "Buchanan",  email: "a.buchanan@email.com",  age: 48, position: null,         skill_tier_reported: "R1", skill_tier_assigned: null,  division_requested: "gold_open", division_assigned: null,  player_type: "sub",     payment_status: "waived",  status: "approved",       is_alternate: true,  sandbagging_flag: false, jersey_size: "M",   notes: "" },
];

// -------------------------------------------------------------------------
// Config maps
// -------------------------------------------------------------------------

const DIVISION_LABEL = {
  gold_open: "Gold Open", "45a": "45A",
  senior_b: "Senior B",  senior_c: "Senior C", womens: "Womens",
};
const DIVISION_COLOR = {
  gold_open: { bg: "#FEF9E7", color: "#92601A", border: "#F5D77E" },
  "45a":     { bg: "#E8F6F8", color: "#1A5F6B", border: "#9DD5DC" },
  senior_b:  { bg: "#F3EEF9", color: "#4A3070", border: "#C4AEED" },
  senior_c:  { bg: "#FDF0E8", color: "#7A3318", border: "#F5B993" },
  womens:    { bg: "#FDE8F0", color: "#7A1845", border: "#F5A3C7" },
};
const POSITION_LABEL = {
  defenseman: "Defense", center: "Center",
  winger: "Winger", goaltender: "Goalie",
};
const POSITION_COLOR = {
  defenseman: { bg: "#E8F0FE", color: "#1A3F8F" },
  center:     { bg: "#E8F8EF", color: "#1A5C35" },
  winger:     { bg: "#FDF3E8", color: "#7A4A18" },
  goaltender: { bg: "#FCE8E8", color: "#7A1818" },
};
const STATUS_COLOR = {
  registered:     { bg: "#F3F4F6", color: "#374151" },
  approved:       { bg: "#E6F4EA", color: "#1E6B3A" },
  draft_eligible: { bg: "#E0F0FF", color: "#1A4F8A" },
  assigned:       { bg: "#F0FDF4", color: "#166534" },
  withdrawn:      { bg: "#FEE2E2", color: "#991B1B" },
};
const PAYMENT_COLOR = {
  paid:    { bg: "#E6F4EA", color: "#1E6B3A" },
  pending: { bg: "#FEF3C7", color: "#92400E" },
  waived:  { bg: "#EDE9FE", color: "#4C1D95" },
  refunded:{ bg: "#FEE2E2", color: "#991B1B" },
};
const TIER_COLOR = (tier) => {
  if (!tier) return { bg: "#F3F4F6", color: "#6B7280" };
  const t = tier[0];
  if (t === "A") return { bg: "#FCE8E8", color: "#7A1818" };
  if (t === "B") return { bg: "#FEF0E8", color: "#7A4518" };
  if (t === "C") return { bg: "#FEF9E7", color: "#7A5A18" };
  return { bg: "#E8F0FE", color: "#1A3F8F" };
};

const ALL_DIVISIONS  = ["gold_open","45a","senior_b","senior_c"];
const ALL_POSITIONS  = ["defenseman","center","winger","goaltender"];
const ALL_STATUSES   = ["registered","approved","draft_eligible","assigned","withdrawn"];
const ALL_PAYMENTS   = ["paid","pending","waived","refunded"];
const ALL_TYPES      = ["primary","sub"];

// -------------------------------------------------------------------------
// Sub-components
// -------------------------------------------------------------------------

function Pill({ bg, color, border, children, small }) {
  return (
    <span style={{
      display: "inline-block",
      background: bg,
      color,
      border: `1px solid ${border || bg}`,
      fontSize: small ? 10 : 11,
      fontFamily: "'DM Mono', monospace",
      fontWeight: 500,
      padding: small ? "1px 6px" : "2px 8px",
      borderRadius: 99,
      whiteSpace: "nowrap",
      letterSpacing: "0.04em",
    }}>
      {children}
    </span>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={styles.filterLabel}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={styles.filterSelect}
      >
        <option value="">All</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function PlayerDrawer({ player, onClose, onSave }) {
  const [tier, setTier] = useState(player.skill_tier_assigned || player.skill_tier_reported || "");
  const [notes, setNotes] = useState(player.notes || "");
  const [status, setStatus] = useState(player.status || "");

  const initials = `${player.first_name[0]}${player.last_name[0]}`;
  const dc = DIVISION_COLOR[player.division_requested] || {};
  const tc = TIER_COLOR(tier);

  return (
    <div style={styles.drawerOverlay} onClick={onClose}>
      <div style={styles.drawer} onClick={e => e.stopPropagation()}>
        <div style={styles.drawerHeader}>
          <div style={styles.drawerAvatar}>{initials}</div>
          <div>
            <p style={styles.drawerName}>{player.first_name} {player.last_name}</p>
            <p style={styles.drawerEmail}>{player.email}</p>
          </div>
          <button style={styles.drawerClose} onClick={onClose}>✕</button>
        </div>

        {player.sandbagging_flag && (
          <div style={styles.sandbaggingAlert}>
            ⚠ Sandbagging review — skill tier vs division mismatch. Committee action required.
          </div>
        )}

        <div style={styles.drawerSection}>
          <p style={styles.drawerSectionLabel}>Player info</p>
          <div style={styles.drawerGrid}>
            {[
              ["Age", player.age],
              ["Phone", player.phone || "—"],
              ["Jersey", player.jersey_size || "—"],
              ["Type", player.player_type],
            ].map(([k, v]) => (
              <div key={k}>
                <p style={styles.drawerFieldLabel}>{k}</p>
                <p style={styles.drawerFieldVal}>{v}</p>
              </div>
            ))}
          </div>
        </div>

        <div style={styles.drawerSection}>
          <p style={styles.drawerSectionLabel}>Hockey</p>
          <div style={styles.drawerGrid}>
            <div>
              <p style={styles.drawerFieldLabel}>Self-reported tier</p>
              <Pill {...TIER_COLOR(player.skill_tier_reported)}>{player.skill_tier_reported || "—"}</Pill>
            </div>
            <div>
              <p style={styles.drawerFieldLabel}>Position</p>
              {player.position
                ? <Pill {...POSITION_COLOR[player.position]}>{POSITION_LABEL[player.position]}</Pill>
                : <span style={{ color: "#bbb", fontSize: 13 }}>—</span>}
            </div>
            <div>
              <p style={styles.drawerFieldLabel}>Division requested</p>
              <Pill {...dc}>{DIVISION_LABEL[player.division_requested] || "—"}</Pill>
            </div>
            <div>
              <p style={styles.drawerFieldLabel}>Payment</p>
              <Pill {...PAYMENT_COLOR[player.payment_status]}>{player.payment_status}</Pill>
            </div>
          </div>
        </div>

        <div style={styles.drawerSection}>
          <p style={styles.drawerSectionLabel}>Committee overrides</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={styles.drawerFieldLabel}>Skill tier override</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                {["A1","A2","A3","B1","B2","B3","C1","C2","R1","R2","R3"].map(t => (
                  <button
                    key={t}
                    onClick={() => setTier(t)}
                    style={{
                      ...styles.tierBtn,
                      background: tier === t ? TIER_COLOR(t).bg : "#F6F5F0",
                      color: tier === t ? TIER_COLOR(t).color : "#888",
                      border: `1px solid ${tier === t ? TIER_COLOR(t).color : "#E8E6DF"}`,
                      fontWeight: tier === t ? 600 : 400,
                    }}
                  >{t}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={styles.drawerFieldLabel}>Workflow status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                style={{ ...styles.filterSelect, marginTop: 6, width: "100%" }}
              >
                {ALL_STATUSES.map(s => (
                  <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={styles.drawerFieldLabel}>Committee notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                style={styles.drawerTextarea}
                placeholder="Add internal notes..."
              />
            </div>
          </div>
        </div>

        <div style={styles.drawerActions}>
          <button style={styles.drawerCancel} onClick={onClose}>Cancel</button>
          <button style={styles.drawerSave} onClick={() => onSave({ ...player, skill_tier_assigned: tier, notes, status })}>
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Main component
// -------------------------------------------------------------------------

export default function Players() {
  const [players, setPlayers]         = useState(MOCK_PLAYERS);
  const [search, setSearch]           = useState("");
  const [filterDiv, setFilterDiv]     = useState("");
  const [filterPos, setFilterPos]     = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPayment, setFilterPayment] = useState("");
  const [filterType, setFilterType]   = useState("");
  const [filterWarn, setFilterWarn]   = useState(false);
  const [selected, setSelected]       = useState(null);
  const [sortKey, setSortKey]         = useState("last_name");
  const [sortDir, setSortDir]         = useState("asc");

  const filtered = useMemo(() => {
    let p = [...players];
    if (search)        p = p.filter(x => `${x.first_name} ${x.last_name} ${x.email}`.toLowerCase().includes(search.toLowerCase()));
    if (filterDiv)     p = p.filter(x => x.division_requested === filterDiv);
    if (filterPos)     p = p.filter(x => x.position === filterPos);
    if (filterStatus)  p = p.filter(x => x.status === filterStatus);
    if (filterPayment) p = p.filter(x => x.payment_status === filterPayment);
    if (filterType)    p = p.filter(x => x.player_type === filterType);
    if (filterWarn)    p = p.filter(x => x.sandbagging_flag);
    p.sort((a, b) => {
      let av = a[sortKey] ?? "", bv = b[sortKey] ?? "";
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
    return p;
  }, [players, search, filterDiv, filterPos, filterStatus, filterPayment, filterType, filterWarn, sortKey, sortDir]);

  const stats = useMemo(() => ({
    total:    players.length,
    paid:     players.filter(p => p.payment_status === "paid").length,
    unpaid:   players.filter(p => p.payment_status === "pending").length,
    subs:     players.filter(p => p.player_type === "sub").length,
    warnings: players.filter(p => p.sandbagging_flag).length,
    goalies:  players.filter(p => p.position === "goaltender").length,
  }), [players]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const handleSave = (updated) => {
    setPlayers(ps => ps.map(p => p.id === updated.id ? updated : p));
    setSelected(null);
  };

  const clearFilters = () => {
    setSearch(""); setFilterDiv(""); setFilterPos("");
    setFilterStatus(""); setFilterPayment(""); setFilterType(""); setFilterWarn(false);
  };

  const SortIcon = ({ k }) => (
    <span style={{ marginLeft: 4, opacity: sortKey === k ? 1 : 0.25, fontSize: 10 }}>
      {sortKey === k ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
    </span>
  );

  const activeFilters = [filterDiv, filterPos, filterStatus, filterPayment, filterType].filter(Boolean).length + (filterWarn ? 1 : 0);

  return (
    <div style={styles.root}>

      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.seasonPill}>Season 2027</div>
          <h1 style={styles.title}>Players</h1>
          <p style={styles.subtitle}>Player pool · {players.length} registered</p>
        </div>
        <button style={styles.exportBtn}>↓ Export CSV</button>
      </div>

      {/* Stats bar */}
      <div style={styles.statsBar}>
        {[
          { label: "Total",    val: stats.total,    color: "#1a1a2e" },
          { label: "Paid",     val: stats.paid,     color: "#166534" },
          { label: "Unpaid",   val: stats.unpaid,   color: "#92400E" },
          { label: "Subs",     val: stats.subs,     color: "#4C1D95" },
          { label: "Goalies",  val: stats.goalies,  color: "#1E3A8A" },
          { label: "Warnings", val: stats.warnings, color: "#991B1B" },
        ].map(s => (
          <div key={s.label} style={styles.statChip}>
            <span style={{ ...styles.statVal, color: s.color }}>{s.val}</span>
            <span style={styles.statLabel}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={styles.filterBar}>
        <div style={styles.searchWrap}>
          <span style={styles.searchIcon}>⌕</span>
          <input
            type="text"
            placeholder="Search name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={styles.searchInput}
          />
        </div>
        <FilterSelect label="Division" value={filterDiv} onChange={setFilterDiv}
          options={ALL_DIVISIONS.map(d => ({ value: d, label: DIVISION_LABEL[d] }))} />
        <FilterSelect label="Position" value={filterPos} onChange={setFilterPos}
          options={ALL_POSITIONS.map(p => ({ value: p, label: POSITION_LABEL[p] }))} />
        <FilterSelect label="Status" value={filterStatus} onChange={setFilterStatus}
          options={ALL_STATUSES.map(s => ({ value: s, label: s.replace(/_/g," ") }))} />
        <FilterSelect label="Payment" value={filterPayment} onChange={setFilterPayment}
          options={ALL_PAYMENTS.map(p => ({ value: p, label: p }))} />
        <FilterSelect label="Type" value={filterType} onChange={setFilterType}
          options={ALL_TYPES.map(t => ({ value: t, label: t }))} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={styles.filterLabel}>Warnings</label>
          <button
            onClick={() => setFilterWarn(w => !w)}
            style={{ ...styles.warnToggle, background: filterWarn ? "#FEE2E2" : "#F6F5F0", color: filterWarn ? "#991B1B" : "#888", border: `1px solid ${filterWarn ? "#FCA5A5" : "#E8E6DF"}` }}
          >⚠ Only</button>
        </div>
        {activeFilters > 0 && (
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <button onClick={clearFilters} style={styles.clearBtn}>
              Clear {activeFilters}
            </button>
          </div>
        )}
      </div>

      {/* Results count */}
      <div style={styles.resultsRow}>
        <span style={styles.resultsCount}>
          Showing <strong>{filtered.length}</strong> of {players.length} players
        </span>
      </div>

      {/* Table */}
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              {[
                { key: "last_name",          label: "Player" },
                { key: "division_requested", label: "Division" },
                { key: "position",           label: "Position" },
                { key: "skill_tier_reported",label: "Tier" },
                { key: "age",                label: "Age" },
                { key: "player_type",        label: "Type" },
                { key: "payment_status",     label: "Payment" },
                { key: "status",             label: "Status" },
              ].map(col => (
                <th key={col.key} style={styles.th} onClick={() => handleSort(col.key)}>
                  {col.label}<SortIcon k={col.key} />
                </th>
              ))}
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const initials = `${p.first_name[0]}${p.last_name[0]}`;
              const dc = DIVISION_COLOR[p.division_requested] || {};
              const pc = p.position ? POSITION_COLOR[p.position] : null;
              const tc = TIER_COLOR(p.skill_tier_assigned || p.skill_tier_reported);
              const sc = STATUS_COLOR[p.status] || {};
              const payc = PAYMENT_COLOR[p.payment_status] || {};

              return (
                <tr
                  key={p.id}
                  style={{
                    ...styles.tr,
                    background: p.sandbagging_flag ? "#FFFBEB" : "transparent",
                    cursor: "pointer",
                  }}
                  onClick={() => setSelected(p)}
                >
                  <td style={styles.td}>
                    <div style={styles.playerCell}>
                      <div style={styles.playerAvatar}>{initials}</div>
                      <div>
                        <div style={styles.playerName}>
                          {p.first_name} {p.last_name}
                          {p.sandbagging_flag && <span style={styles.warnDot} title="Sandbagging review">⚠</span>}
                          {p.skill_tier_assigned && <span style={styles.overrideDot} title="Tier overridden">✎</span>}
                        </div>
                        <div style={styles.playerEmail}>{p.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={styles.td}>
                    <Pill {...dc}>{DIVISION_LABEL[p.division_requested] || "—"}</Pill>
                  </td>
                  <td style={styles.td}>
                    {pc
                      ? <Pill {...pc}>{POSITION_LABEL[p.position]}</Pill>
                      : <span style={{ color: "#ccc", fontSize: 13 }}>—</span>}
                  </td>
                  <td style={styles.td}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <Pill {...tc} small>{p.skill_tier_assigned || p.skill_tier_reported || "—"}</Pill>
                      {p.skill_tier_assigned && (
                        <span style={styles.overrideLabel}>
                          was {p.skill_tier_reported}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={styles.td}>
                    <span style={styles.ageVal}>{p.age}</span>
                  </td>
                  <td style={styles.td}>
                    {p.player_type === "sub"
                      ? <Pill bg="#EDE9FE" color="#4C1D95">Sub</Pill>
                      : <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#aaa" }}>Primary</span>}
                  </td>
                  <td style={styles.td}>
                    <Pill {...payc}>{p.payment_status}</Pill>
                  </td>
                  <td style={styles.td}>
                    <Pill {...sc}>{p.status.replace(/_/g," ")}</Pill>
                  </td>
                  <td style={styles.td}>
                    <button
                      style={styles.editBtn}
                      onClick={e => { e.stopPropagation(); setSelected(p); }}
                    >Edit</button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: "48px 24px", textAlign: "center", color: "#bbb", fontFamily: "'DM Mono',monospace", fontSize: 13 }}>
                  No players match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Drawer */}
      {selected && (
        <PlayerDrawer
          player={selected}
          onClose={() => setSelected(null)}
          onSave={handleSave}
        />
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap');
        * { box-sizing: border-box; }
        tr.hover-row:hover td { background: #F9F8F3 !important; }
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
    padding: "28px 32px 60px",
    maxWidth: 1280,
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
    letterSpacing: ".04em",
  },
  exportBtn: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 12,
    fontWeight: 500,
    background: "#fff",
    color: "#444",
    border: "1px solid #E8E6DF",
    padding: "9px 18px",
    borderRadius: 8,
    cursor: "pointer",
  },
  statsBar: {
    display: "flex",
    gap: 10,
    marginBottom: 18,
    flexWrap: "wrap",
  },
  statChip: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "#fff",
    border: "1px solid #E8E6DF",
    borderRadius: 99,
    padding: "5px 14px",
  },
  statVal: {
    fontFamily: "'Fraunces',serif",
    fontSize: 16,
    fontWeight: 700,
    lineHeight: 1,
  },
  statLabel: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 10,
    color: "#aaa",
    textTransform: "uppercase",
    letterSpacing: ".07em",
  },
  filterBar: {
    display: "flex",
    gap: 12,
    alignItems: "flex-end",
    marginBottom: 12,
    flexWrap: "wrap",
    background: "#fff",
    border: "1px solid #E8E6DF",
    borderRadius: 10,
    padding: "14px 16px",
  },
  filterLabel: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 10,
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: ".07em",
  },
  filterSelect: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 12,
    background: "#F6F5F0",
    border: "1px solid #E8E6DF",
    borderRadius: 6,
    padding: "6px 10px",
    color: "#333",
    outline: "none",
    minWidth: 110,
  },
  searchWrap: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  searchIcon: {
    position: "absolute",
    bottom: 8,
    left: 10,
    color: "#aaa",
    fontSize: 16,
    pointerEvents: "none",
  },
  searchInput: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 12,
    background: "#F6F5F0",
    border: "1px solid #E8E6DF",
    borderRadius: 6,
    padding: "6px 10px 6px 28px",
    color: "#333",
    outline: "none",
    width: 200,
    marginTop: 18,
  },
  warnToggle: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 11,
    fontWeight: 500,
    padding: "6px 12px",
    borderRadius: 6,
    cursor: "pointer",
  },
  clearBtn: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 11,
    background: "#1a1a2e",
    color: "#D4A017",
    border: "none",
    padding: "6px 14px",
    borderRadius: 6,
    cursor: "pointer",
  },
  resultsRow: {
    marginBottom: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  resultsCount: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 11,
    color: "#999",
  },
  tableWrap: {
    background: "#fff",
    border: "1px solid #E8E6DF",
    borderRadius: 10,
    overflow: "hidden",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "fixed",
  },
  th: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 10,
    fontWeight: 500,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: ".07em",
    padding: "11px 14px",
    textAlign: "left",
    borderBottom: "1px solid #E8E6DF",
    background: "#FAFAF8",
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
  },
  tr: {
    borderBottom: "1px solid #F3F2ED",
    transition: "background 0.12s",
  },
  td: {
    padding: "10px 14px",
    verticalAlign: "middle",
  },
  playerCell: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  playerAvatar: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: "#1a1a2e",
    color: "#D4A017",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'DM Mono',monospace",
    fontSize: 11,
    fontWeight: 500,
    flexShrink: 0,
  },
  playerName: {
    fontFamily: "'Fraunces',serif",
    fontSize: 13,
    fontWeight: 600,
    color: "#1a1a2e",
    display: "flex",
    alignItems: "center",
    gap: 5,
  },
  playerEmail: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 10,
    color: "#bbb",
  },
  warnDot: {
    fontSize: 11,
    color: "#DC2626",
  },
  overrideDot: {
    fontSize: 11,
    color: "#2563EB",
  },
  overrideLabel: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 9,
    color: "#bbb",
  },
  ageVal: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 13,
    color: "#555",
  },
  editBtn: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 11,
    background: "transparent",
    border: "1px solid #E8E6DF",
    color: "#666",
    padding: "4px 12px",
    borderRadius: 6,
    cursor: "pointer",
  },
  drawerOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.35)",
    zIndex: 1000,
    display: "flex",
    justifyContent: "flex-end",
  },
  drawer: {
    width: 420,
    background: "#fff",
    height: "100%",
    overflowY: "auto",
    padding: "0 0 40px",
    display: "flex",
    flexDirection: "column",
  },
  drawerHeader: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "24px 24px 20px",
    borderBottom: "1px solid #F0EEE8",
    position: "relative",
  },
  drawerAvatar: {
    width: 44,
    height: 44,
    borderRadius: "50%",
    background: "#1a1a2e",
    color: "#D4A017",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'DM Mono',monospace",
    fontSize: 14,
    fontWeight: 500,
    flexShrink: 0,
  },
  drawerName: {
    fontFamily: "'Fraunces',serif",
    fontSize: 17,
    fontWeight: 700,
    color: "#1a1a2e",
    margin: "0 0 3px",
  },
  drawerEmail: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 11,
    color: "#999",
    margin: 0,
  },
  drawerClose: {
    position: "absolute",
    top: 20,
    right: 20,
    background: "none",
    border: "none",
    fontSize: 16,
    color: "#aaa",
    cursor: "pointer",
  },
  sandbaggingAlert: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 11,
    background: "#FFFBEB",
    borderBottom: "1px solid #FDE68A",
    color: "#92400E",
    padding: "10px 24px",
    fontWeight: 500,
  },
  drawerSection: {
    padding: "18px 24px",
    borderBottom: "1px solid #F0EEE8",
  },
  drawerSectionLabel: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 10,
    color: "#aaa",
    textTransform: "uppercase",
    letterSpacing: ".08em",
    margin: "0 0 12px",
  },
  drawerGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 14,
  },
  drawerFieldLabel: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 10,
    color: "#bbb",
    textTransform: "uppercase",
    letterSpacing: ".06em",
    margin: "0 0 4px",
  },
  drawerFieldVal: {
    fontFamily: "'Fraunces',serif",
    fontSize: 14,
    color: "#1a1a2e",
    margin: 0,
    fontWeight: 600,
  },
  tierBtn: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 11,
    padding: "4px 10px",
    borderRadius: 6,
    cursor: "pointer",
  },
  drawerTextarea: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 12,
    width: "100%",
    background: "#F6F5F0",
    border: "1px solid #E8E6DF",
    borderRadius: 6,
    padding: "8px 10px",
    color: "#333",
    outline: "none",
    resize: "vertical",
  },
  drawerActions: {
    display: "flex",
    gap: 10,
    padding: "20px 24px 0",
    marginTop: "auto",
  },
  drawerCancel: {
    flex: 1,
    fontFamily: "'DM Mono',monospace",
    fontSize: 12,
    background: "#F6F5F0",
    border: "1px solid #E8E6DF",
    color: "#666",
    padding: "10px",
    borderRadius: 8,
    cursor: "pointer",
  },
  drawerSave: {
    flex: 2,
    fontFamily: "'DM Mono',monospace",
    fontSize: 12,
    fontWeight: 500,
    background: "#1a1a2e",
    color: "#D4A017",
    border: "none",
    padding: "10px",
    borderRadius: 8,
    cursor: "pointer",
  },
};
