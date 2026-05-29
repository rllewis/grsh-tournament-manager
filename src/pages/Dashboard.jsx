import { useState, useEffect } from "react";

const API = window.grshConfig?.apiUrl || "/wp-json/grsh/v1";
const NONCE = window.grshConfig?.nonce || "";

async function fetchStatus() {
  const res = await fetch(`${API}/sync/status`, {
    headers: { "X-WP-Nonce": NONCE },
  });
  return res.ok ? res.json() : null;
}

async function triggerSync() {
  const res = await fetch(`${API}/sync`, {
    method: "POST",
    headers: { "X-WP-Nonce": NONCE },
  });
  return res.json();
}

const MOCK = {
  season: 2027,
  total_entries: 84,
  total_imported: 81,
  unsynced: 3,
  unpaid: 7,
  subs: 12,
  warnings: 2,
};

const MOCK_WARNINGS = [
  { id: 1, type: "sandbagging", player: "Mike Hartley", detail: "Skill tier A2 requested Senior C — committee review required", time: "2h ago" },
  { id: 2, type: "sandbagging", player: "Dave Kowalski", detail: "Skill tier B1 requested Senior B — committee review required", time: "5h ago" },
];

const MOCK_RECENT = [
  { id: 81, name: "Chris Fontaine", type: "primary", division: "Gold Open", position: "Winger", status: "paid", time: "12m ago" },
  { id: 80, name: "Sarah Mitchell", type: "primary", division: "45A", position: "Defense", status: "paid", time: "34m ago" },
  { id: 79, name: "Tom Breslin", type: "sub", division: "Senior B", position: "—", status: "waived", time: "1h ago" },
  { id: 78, name: "Janet Ruiz", type: "primary", division: "Senior C", position: "Goaltender", status: "pending", time: "2h ago" },
  { id: 77, name: "Paul Nguyen", type: "primary", division: "Gold Open", position: "Center", status: "paid", time: "3h ago" },
];

const DIVISION_COLORS = {
  "Gold Open": "#D4A017",
  "45A": "#2196a8",
  "Senior B": "#7B5EA7",
  "Senior C": "#B05E3A",
};

const STATUS_STYLE = {
  paid:    { bg: "#E6F4EA", color: "#1E6B3A" },
  pending: { bg: "#FEF3C7", color: "#92400E" },
  waived:  { bg: "#EDE9FE", color: "#4C1D95" },
};

export default function Dashboard() {
  const [status, setStatus] = useState(MOCK);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchStatus()
      .then((data) => { if (data) setStatus(data); })
      .finally(() => setLoading(false));
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    const result = await triggerSync();
    setSyncResult(result);
    const updated = await fetchStatus();
    if (updated) setStatus(updated);
    setSyncing(false);
  };

  const pct = status.total_entries > 0
    ? Math.round((status.total_imported / status.total_entries) * 100)
    : 0;

  return (
    <div style={styles.root}>

      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.seasonPill}>Season {status.season}</div>
          <h1 style={styles.title}>Dashboard</h1>
          <p style={styles.subtitle}>Gold Rush Senior Hockey · Tournament Management</p>
        </div>
        <div style={styles.headerActions}>
          {status.unsynced > 0 && (
            <div style={styles.unsyncedBadge}>
              {status.unsynced} unsynced
            </div>
          )}
          <button
            style={{ ...styles.syncBtn, opacity: syncing ? 0.7 : 1 }}
            onClick={handleSync}
            disabled={syncing}
          >
            <span style={{ display: "inline-block", animation: syncing ? "spin 1s linear infinite" : "none" }}>
              ⟳
            </span>
            {syncing ? " Importing..." : " Import Registrations"}
          </button>
        </div>
      </div>

      {/* Sync result banner */}
      {syncResult && (
        <div style={{
          ...styles.syncBanner,
          background: syncResult.errors?.length ? "#FEF2F2" : "#F0FDF4",
          borderColor: syncResult.errors?.length ? "#FCA5A5" : "#86EFAC",
          color: syncResult.errors?.length ? "#991B1B" : "#166534",
        }}>
          {syncResult.errors?.length
            ? `Import completed with errors: ${syncResult.skipped} skipped.`
            : `✓ Import complete — ${syncResult.imported} new player${syncResult.imported !== 1 ? "s" : ""} added.`}
        </div>
      )}

      {/* Metric cards */}
      <div style={styles.metricsGrid}>
        {[
          { label: "Total registered", value: status.total_entries, sub: "form submissions", accent: "#1a1a2e" },
          { label: "Imported", value: status.total_imported, sub: `${pct}% of total`, accent: "#166534" },
          { label: "Unpaid", value: status.unpaid, sub: "payment pending", accent: "#92400E" },
          { label: "Subs registered", value: status.subs, sub: "alternates", accent: "#1E3A8A" },
          { label: "Unsynced entries", value: status.unsynced, sub: "awaiting import", accent: "#6B21A8" },
          { label: "Active warnings", value: status.warnings, sub: "require review", accent: "#991B1B" },
        ].map((m) => (
          <div key={m.label} style={styles.metricCard}>
            <div style={styles.metricAccent(m.accent)} />
            <p style={styles.metricLabel}>{m.label}</p>
            <p style={{ ...styles.metricValue, color: m.accent }}>{m.value}</p>
            <p style={styles.metricSub}>{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Import progress bar */}
      <div style={styles.progressSection}>
        <div style={styles.progressHeader}>
          <span style={styles.progressLabel}>Registration import progress</span>
          <span style={styles.progressPct}>{pct}%</span>
        </div>
        <div style={styles.progressTrack}>
          <div style={{ ...styles.progressFill, width: `${pct}%` }} />
        </div>
        <div style={styles.progressLegend}>
          <span>{status.total_imported} imported</span>
          <span>{status.unsynced} pending</span>
        </div>
      </div>

      {/* Two column — warnings + recent */}
      <div style={styles.twoCol}>

        {/* Warnings */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <span style={styles.panelTitle}>⚠ Active warnings</span>
            <span style={styles.panelCount}>{MOCK_WARNINGS.length}</span>
          </div>
          {MOCK_WARNINGS.length === 0 ? (
            <div style={styles.emptyState}>No warnings — all clear</div>
          ) : (
            MOCK_WARNINGS.map((w) => (
              <div key={w.id} style={styles.warningRow}>
                <div style={styles.warningDot} />
                <div style={{ flex: 1 }}>
                  <div style={styles.warningPlayer}>{w.player}</div>
                  <div style={styles.warningDetail}>{w.detail}</div>
                </div>
                <div style={styles.warningTime}>{w.time}</div>
              </div>
            ))
          )}
        </div>

        {/* Recent imports */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <span style={styles.panelTitle}>Recent imports</span>
            <span style={styles.panelCount}>{MOCK_RECENT.length}</span>
          </div>
          {MOCK_RECENT.map((r) => (
            <div key={r.id} style={styles.recentRow}>
              <div style={styles.avatar}>
                {r.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.recentName}>
                  {r.name}
                  {r.type === "sub" && <span style={styles.subTag}>SUB</span>}
                </div>
                <div style={styles.recentMeta}>
                  <span style={{ color: DIVISION_COLORS[r.division] || "#555", fontWeight: 500 }}>
                    {r.division}
                  </span>
                  {r.position !== "—" && <> · {r.position}</>}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <span style={{ ...styles.statusPill, background: STATUS_STYLE[r.status]?.bg, color: STATUS_STYLE[r.status]?.color }}>
                  {r.status}
                </span>
                <span style={styles.recentTime}>{r.time}</span>
              </div>
            </div>
          ))}
        </div>

      </div>

      {/* Division breakdown */}
      <div style={styles.panel}>
        <div style={styles.panelHeader}>
          <span style={styles.panelTitle}>Division breakdown</span>
        </div>
        <div style={styles.divisionGrid}>
          {[
            { name: "Gold Open", registered: 22, paid: 20, subs: 3, goalies: 4 },
            { name: "45A", registered: 19, paid: 17, subs: 3, goalies: 3 },
            { name: "Senior B", registered: 26, paid: 25, subs: 4, goalies: 5 },
            { name: "Senior C", registered: 17, paid: 16, subs: 2, goalies: 3 },
          ].map((d) => (
            <div key={d.name} style={styles.divisionCard(DIVISION_COLORS[d.name])}>
              <div style={styles.divisionAccent(DIVISION_COLORS[d.name])} />
              <p style={{ ...styles.divisionName, color: DIVISION_COLORS[d.name] }}>{d.name}</p>
              <div style={styles.divisionStats}>
                <div style={styles.divisionStat}>
                  <span style={styles.divisionStatVal}>{d.registered}</span>
                  <span style={styles.divisionStatLabel}>registered</span>
                </div>
                <div style={styles.divisionStat}>
                  <span style={styles.divisionStatVal}>{d.paid}</span>
                  <span style={styles.divisionStatLabel}>paid</span>
                </div>
                <div style={styles.divisionStat}>
                  <span style={styles.divisionStatVal}>{d.subs}</span>
                  <span style={styles.divisionStatLabel}>subs</span>
                </div>
                <div style={styles.divisionStat}>
                  <span style={styles.divisionStatVal}>{d.goalies}</span>
                  <span style={styles.divisionStatLabel}>goalies</span>
                </div>
              </div>
              <div style={styles.divisionBar}>
                <div style={{
                  ...styles.divisionBarFill,
                  width: `${Math.round((d.paid / d.registered) * 100)}%`,
                  background: DIVISION_COLORS[d.name],
                }} />
              </div>
              <p style={styles.divisionBarLabel}>
                {Math.round((d.paid / d.registered) * 100)}% paid
              </p>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Fraunces:wght@400;600;700&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .grsh-root * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}

const styles = {
  root: {
    fontFamily: "'Fraunces', Georgia, serif",
    background: "#F6F5F0",
    minHeight: "100vh",
    padding: "32px 36px 60px",
    maxWidth: 1200,
    animation: "fadeUp 0.4s ease both",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 32,
    flexWrap: "wrap",
    gap: 16,
  },
  seasonPill: {
    display: "inline-block",
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    background: "#1a1a2e",
    color: "#D4A017",
    padding: "4px 12px",
    borderRadius: 99,
    marginBottom: 10,
  },
  title: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 32,
    fontWeight: 700,
    color: "#1a1a2e",
    margin: "0 0 4px",
    letterSpacing: "-0.5px",
  },
  subtitle: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 12,
    color: "#888",
    margin: 0,
    letterSpacing: "0.04em",
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  unsyncedBadge: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 12,
    background: "#FEF3C7",
    color: "#92400E",
    border: "1px solid #FDE68A",
    padding: "6px 14px",
    borderRadius: 99,
    fontWeight: 500,
  },
  syncBtn: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 13,
    fontWeight: 500,
    background: "#1a1a2e",
    color: "#D4A017",
    border: "none",
    padding: "10px 20px",
    borderRadius: 8,
    cursor: "pointer",
    letterSpacing: "0.03em",
    transition: "opacity 0.2s",
  },
  syncBanner: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 13,
    padding: "12px 16px",
    borderRadius: 8,
    border: "1px solid",
    marginBottom: 24,
    fontWeight: 500,
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 14,
    marginBottom: 28,
  },
  metricCard: {
    background: "#fff",
    borderRadius: 12,
    padding: "20px 20px 16px",
    position: "relative",
    overflow: "hidden",
    border: "1px solid #E8E6DF",
  },
  metricAccent: (color) => ({
    position: "absolute",
    top: 0, left: 0,
    width: "100%",
    height: 3,
    background: color,
    borderRadius: "12px 12px 0 0",
  }),
  metricLabel: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    color: "#888",
    margin: "0 0 8px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  metricValue: {
    fontFamily: "'Fraunces', serif",
    fontSize: 36,
    fontWeight: 700,
    margin: "0 0 4px",
    lineHeight: 1,
  },
  metricSub: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    color: "#aaa",
    margin: 0,
  },
  progressSection: {
    background: "#fff",
    border: "1px solid #E8E6DF",
    borderRadius: 12,
    padding: "20px 24px",
    marginBottom: 24,
  },
  progressHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  progressLabel: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 12,
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  progressPct: {
    fontFamily: "'Fraunces', serif",
    fontSize: 20,
    fontWeight: 700,
    color: "#1a1a2e",
  },
  progressTrack: {
    height: 8,
    background: "#E8E6DF",
    borderRadius: 99,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressFill: {
    height: "100%",
    background: "linear-gradient(90deg, #1a1a2e, #2d4a8a)",
    borderRadius: 99,
    transition: "width 0.6s ease",
  },
  progressLegend: {
    display: "flex",
    justifyContent: "space-between",
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    color: "#aaa",
  },
  twoCol: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 20,
    marginBottom: 24,
  },
  panel: {
    background: "#fff",
    border: "1px solid #E8E6DF",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 0,
  },
  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    borderBottom: "1px solid #E8E6DF",
  },
  panelTitle: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 12,
    fontWeight: 500,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#444",
  },
  panelCount: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 12,
    background: "#F6F5F0",
    color: "#666",
    padding: "2px 10px",
    borderRadius: 99,
    border: "1px solid #E8E6DF",
  },
  emptyState: {
    padding: "24px 20px",
    fontFamily: "'DM Mono', monospace",
    fontSize: 12,
    color: "#aaa",
    textAlign: "center",
  },
  warningRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "14px 20px",
    borderBottom: "1px solid #F6F5F0",
  },
  warningDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#DC2626",
    flexShrink: 0,
    marginTop: 5,
  },
  warningPlayer: {
    fontFamily: "'Fraunces', serif",
    fontSize: 14,
    fontWeight: 600,
    color: "#1a1a2e",
    marginBottom: 2,
  },
  warningDetail: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    color: "#888",
    lineHeight: 1.5,
  },
  warningTime: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    color: "#bbb",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  recentRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 20px",
    borderBottom: "1px solid #F6F5F0",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: "#1a1a2e",
    color: "#D4A017",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'DM Mono', monospace",
    fontSize: 12,
    fontWeight: 500,
    flexShrink: 0,
  },
  recentName: {
    fontFamily: "'Fraunces', serif",
    fontSize: 14,
    fontWeight: 600,
    color: "#1a1a2e",
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  subTag: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 9,
    fontWeight: 500,
    background: "#EDE9FE",
    color: "#4C1D95",
    padding: "1px 6px",
    borderRadius: 4,
    letterSpacing: "0.06em",
  },
  recentMeta: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    color: "#888",
  },
  statusPill: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 10,
    fontWeight: 500,
    padding: "2px 8px",
    borderRadius: 99,
    textTransform: "lowercase",
  },
  recentTime: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 10,
    color: "#bbb",
  },
  divisionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 0,
  },
  divisionCard: (color) => ({
    padding: "20px 20px 16px",
    borderRight: "1px solid #F6F5F0",
    position: "relative",
    overflow: "hidden",
  }),
  divisionAccent: (color) => ({
    position: "absolute",
    top: 0, left: 0,
    width: "100%",
    height: 3,
    background: color,
  }),
  divisionName: {
    fontFamily: "'Fraunces', serif",
    fontSize: 15,
    fontWeight: 700,
    margin: "0 0 14px",
  },
  divisionStats: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "8px 0",
    marginBottom: 14,
  },
  divisionStat: {
    display: "flex",
    flexDirection: "column",
  },
  divisionStatVal: {
    fontFamily: "'Fraunces', serif",
    fontSize: 22,
    fontWeight: 700,
    color: "#1a1a2e",
    lineHeight: 1,
  },
  divisionStatLabel: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 10,
    color: "#aaa",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  divisionBar: {
    height: 4,
    background: "#E8E6DF",
    borderRadius: 99,
    overflow: "hidden",
    marginBottom: 6,
  },
  divisionBarFill: {
    height: "100%",
    borderRadius: 99,
    transition: "width 0.6s ease",
  },
  divisionBarLabel: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 10,
    color: "#aaa",
    margin: 0,
  },
};
