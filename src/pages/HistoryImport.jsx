import { useState, useEffect, useRef } from "react";

const API   = window.grshConfig?.apiUrl || "/wp-json/grsh/v1";
const NONCE = window.grshConfig?.nonce  || "";

const DIVISION_LABEL = {
  gold_open:"Gold Open", "45a":"45A",
  senior_b:"Senior B", senior_c:"Senior C", womens:"Womens",
};
const DIVISION_COLOR = {
  gold_open:{ bg:"#FEF9E7", color:"#92601A", border:"#F5D77E" },
  "45a":    { bg:"#E8F6F8", color:"#1A5F6B", border:"#9DD5DC" },
  senior_b: { bg:"#F3EEF9", color:"#4A3070", border:"#C4AEED" },
  senior_c: { bg:"#FDF0E8", color:"#7A3318", border:"#F5B993" },
};
const CHAMP_STYLE = {
  winner:      { icon:"🏆", label:"Champion",   bg:"#FFFBEB", color:"#92400E" },
  runner_up:   { icon:"🥈", label:"Runner-up",  bg:"#F3F4F6", color:"#374151" },
  participant: { icon:"🏒", label:"Participant", bg:"#F9F8F4", color:"#888"   },
  none:        { icon:"—",  label:"Sub / n/a",  bg:"#F9F8F4", color:"#bbb"   },
};

function Pill({ bg, color, border, children, small }) {
  return (
    <span style={{
      display:"inline-block", background:bg, color,
      border:`1px solid ${border||bg}`,
      fontSize:small?10:11, fontFamily:"'DM Mono',monospace",
      fontWeight:500, padding:small?"1px 6px":"2px 8px",
      borderRadius:99, whiteSpace:"nowrap",
    }}>{children}</span>
  );
}

function StatCard({ label, val, color }) {
  return (
    <div style={{ background:"#fff", border:"1px solid #E8E6DF", borderRadius:10, padding:"14px 16px" }}>
      <p style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#aaa", textTransform:"uppercase", letterSpacing:".07em", margin:"0 0 6px" }}>{label}</p>
      <p style={{ fontFamily:"'Fraunces',serif", fontSize:28, fontWeight:700, color:color||"#1a1a2e", margin:0, lineHeight:1 }}>{val}</p>
    </div>
  );
}

export default function HistoryImport() {
  const [tab,        setTab]        = useState("import");
  const [stats,      setStats]      = useState(null);
  const [records,    setRecords]    = useState([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [filterDiv,  setFilterDiv]  = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [dragging,   setDragging]   = useState(false);
  const [importing,  setImporting]  = useState(false);
  const [result,     setResult]     = useState(null);
  const [deleting,   setDeleting]   = useState(null);
  const fileRef = useRef();

  useEffect(() => { loadStats(); }, []);
  useEffect(() => {
    if (tab === "records") loadRecords();
  }, [tab, page, filterDiv, filterYear]);

  const loadStats = async () => {
    try {
      const res = await fetch(`${API}/history/stats`, { headers:{ "X-WP-Nonce":NONCE } });
      if (res.ok) setStats(await res.json());
    } catch(e) {}
  };

  const loadRecords = async () => {
    try {
      const params = new URLSearchParams({ page, per_page:20 });
      if (filterDiv)  params.set("division", filterDiv);
      if (filterYear) params.set("season_year", filterYear);
      const res = await fetch(`${API}/history/records?${params}`, { headers:{ "X-WP-Nonce":NONCE } });
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
        setTotal(data.total || 0);
      }
    } catch(e) {}
  };

  const handleFile = async (file) => {
    if (!file) return;
    setImporting(true);
    setResult(null);
    const form = new FormData();
    form.append("csv", file);
    try {
      const res = await fetch(`${API}/history/import`, {
        method:"POST",
        headers:{ "X-WP-Nonce":NONCE },
        body:form,
      });
      const data = await res.json();
      setResult(data);
      if (data.success) { loadStats(); }
    } catch(e) {
      setResult({ success:false, message:"Network error — please try again." });
    }
    setImporting(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleDelete = async (id) => {
    if ( !window.confirm( "Delete this history record? This cannot be undone." ) ) return;
    setDeleting(id);
    try {
      await fetch(`${API}/history/records/${id}`, {
        method:"DELETE",
        headers:{ "X-WP-Nonce":NONCE },
      });
      loadRecords();
      loadStats();
    } catch(e) {}
    setDeleting(null);
  };

  const downloadTemplate = () => {
    window.location.href = `${API}/history/template?_wpnonce=${NONCE}`;
  };

  const PER_PAGE = 20;
  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div style={S.root}>

      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={S.pill}>Historical import</div>
          <h1 style={S.title}>Import Player History</h1>
          <p style={S.subtitle}>Load prior season records from CSV — drives sandbagging detection and carry-forward</p>
        </div>
        <button style={S.templateBtn} onClick={downloadTemplate}>
          ↓ Download CSV template
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))", gap:10, marginBottom:20 }}>
          <StatCard label="Total records"    val={stats.total_records} />
          <StatCard label="Past champions"   val={stats.champions}     color="#92400E" />
          <StatCard label="Sandbagging flags" val={stats.sandbagging}  color="#991B1B" />
          <StatCard label="No-show flags"    val={stats.no_shows}      color="#7A4518" />
          <StatCard label="Seasons on record" val={stats.seasons?.length || 0} />
        </div>
      )}

      {/* Tabs */}
      <div style={S.tabs}>
        {[
          { key:"import",  label:"Import CSV" },
          { key:"records", label:`Browse records (${total})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            ...S.tab,
            background: tab===t.key ? "#1a1a2e" : "transparent",
            color:      tab===t.key ? "#D4A017"  : "#888",
            border:     `1px solid ${tab===t.key ? "#1a1a2e" : "#E8E6DF"}`,
          }}>{t.label}</button>
        ))}
      </div>

      {/* Import tab */}
      {tab === "import" && (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

          {/* Instructions */}
          <div style={S.card}>
            <p style={S.cardLabel}>How to import</p>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
              {[
                { step:"1", title:"Download the template", body:"Click Download CSV template above. It includes example rows showing the correct format for each column." },
                { step:"2", title:"Fill in your data", body:"Add one row per player per season. Required columns: first_name, last_name, email, season_year, division_played. All others are optional." },
                { step:"3", title:"Upload and import", body:"Drag the completed CSV onto the drop zone below or click to browse. The import runs instantly and shows a detailed result." },
              ].map(s => (
                <div key={s.step} style={{ background:"#F6F5F0", borderRadius:8, padding:"14px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                    <div style={{ width:24, height:24, borderRadius:"50%", background:"#1a1a2e", color:"#D4A017", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Mono',monospace", fontSize:11, fontWeight:600, flexShrink:0 }}>{s.step}</div>
                    <p style={{ fontFamily:"'Fraunces',serif", fontSize:13, fontWeight:700, color:"#1a1a2e", margin:0 }}>{s.title}</p>
                  </div>
                  <p style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#888", margin:0, lineHeight:1.5 }}>{s.body}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Valid values reference */}
          <div style={S.card}>
            <p style={S.cardLabel}>Valid values reference</p>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <div>
                <p style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#aaa", textTransform:"uppercase", margin:"0 0 6px" }}>division_played</p>
                <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                  {Object.entries(DIVISION_LABEL).map(([k,v]) => {
                    const dc = DIVISION_COLOR[k]||{};
                    return <Pill key={k} bg={dc.bg} color={dc.color} border={dc.border} small>{k}</Pill>;
                  })}
                </div>
              </div>
              <div>
                <p style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#aaa", textTransform:"uppercase", margin:"0 0 6px" }}>championship_result</p>
                <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                  {Object.entries(CHAMP_STYLE).map(([k,v]) => (
                    <span key={k} style={{ fontFamily:"'DM Mono',monospace", fontSize:10, background:v.bg, color:v.color, padding:"2px 7px", borderRadius:99 }}>{k}</span>
                  ))}
                </div>
              </div>
              <div>
                <p style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#aaa", textTransform:"uppercase", margin:"0 0 6px" }}>Boolean fields (was_captain, was_alternate, etc.)</p>
                <p style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#555", margin:0 }}>Use 1 or 0 &nbsp;·&nbsp; yes or no &nbsp;·&nbsp; true or false</p>
              </div>
              <div>
                <p style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#aaa", textTransform:"uppercase", margin:"0 0 6px" }}>season_year</p>
                <p style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#555", margin:0 }}>4-digit year &nbsp;·&nbsp; e.g. 2024, 2025, 2026</p>
              </div>
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              border:`2px dashed ${dragging ? "#1a1a2e" : "#D0CEC6"}`,
              borderRadius:12,
              background: dragging ? "#F0F4FF" : "#fff",
              padding:"48px 24px",
              textAlign:"center",
              cursor:"pointer",
              transition:"all .2s",
            }}
          >
            <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display:"none" }} onChange={e => handleFile(e.target.files[0])} />
            {importing ? (
              <div>
                <p style={{ fontFamily:"'Fraunces',serif", fontSize:18, fontWeight:700, color:"#1a1a2e", margin:"0 0 4px" }}>Importing...</p>
                <p style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#aaa", margin:0 }}>Processing rows</p>
              </div>
            ) : (
              <div>
                <p style={{ fontSize:32, margin:"0 0 10px" }}>📂</p>
                <p style={{ fontFamily:"'Fraunces',serif", fontSize:16, fontWeight:700, color:"#1a1a2e", margin:"0 0 4px" }}>Drop your CSV here</p>
                <p style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#aaa", margin:0 }}>or click to browse &nbsp;·&nbsp; .csv files only</p>
              </div>
            )}
          </div>

          {/* Import result */}
          {result && (
            <div style={{
              border:`1px solid ${result.success ? "#86EFAC" : "#FCA5A5"}`,
              background: result.success ? "#F0FDF4" : "#FEF2F2",
              borderRadius:10, padding:"16px 20px",
            }}>
              <p style={{ fontFamily:"'Fraunces',serif", fontSize:16, fontWeight:700, color: result.success ? "#166534" : "#991B1B", margin:"0 0 8px" }}>
                {result.success ? `✓ Import complete` : `✗ Import failed`}
              </p>
              {result.success && (
                <div style={{ display:"flex", gap:20, marginBottom: (result.warnings?.length||result.errors?.length) ? 12 : 0 }}>
                  {[
                    { label:"Total rows",  val:result.total    },
                    { label:"Imported",    val:result.imported, color:"#166534" },
                    { label:"Skipped",     val:result.skipped,  color: result.skipped>0?"#991B1B":undefined },
                  ].map(s => (
                    <div key={s.label}>
                      <p style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#aaa", margin:"0 0 2px" }}>{s.label}</p>
                      <p style={{ fontFamily:"'Fraunces',serif", fontSize:20, fontWeight:700, color:s.color||"#1a1a2e", margin:0 }}>{s.val}</p>
                    </div>
                  ))}
                </div>
              )}
              {!result.success && result.message && (
                <p style={{ fontFamily:"'DM Mono',monospace", fontSize:12, color:"#991B1B", margin:0 }}>{result.message}</p>
              )}
              {result.warnings?.length > 0 && (
                <div style={{ marginTop:10 }}>
                  <p style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#92400E", textTransform:"uppercase", letterSpacing:".06em", margin:"0 0 6px" }}>Warnings ({result.warnings.length})</p>
                  {result.warnings.map((w,i) => <p key={i} style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#92400E", margin:"0 0 3px" }}>⚠ {w}</p>)}
                </div>
              )}
              {result.errors?.length > 0 && (
                <div style={{ marginTop:10 }}>
                  <p style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#991B1B", textTransform:"uppercase", letterSpacing:".06em", margin:"0 0 6px" }}>Errors ({result.errors.length})</p>
                  {result.errors.map((e,i) => <p key={i} style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#991B1B", margin:"0 0 3px" }}>✗ {e}</p>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Records tab */}
      {tab === "records" && (
        <div>
          <div style={{ display:"flex", gap:10, marginBottom:12, flexWrap:"wrap", background:"#fff", border:"1px solid #E8E6DF", borderRadius:10, padding:"12px 14px" }}>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              <label style={S.filterLabel}>Season</label>
              <select value={filterYear} onChange={e => { setFilterYear(e.target.value); setPage(1); }} style={S.select}>
                <option value="">All seasons</option>
                {(stats?.seasons||[]).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              <label style={S.filterLabel}>Division</label>
              <select value={filterDiv} onChange={e => { setFilterDiv(e.target.value); setPage(1); }} style={S.select}>
                <option value="">All divisions</option>
                {Object.entries(DIVISION_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          <div style={{ background:"#fff", border:"1px solid #E8E6DF", borderRadius:10, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr>
                  {["Player","Season","Division","Team","Result","Tier","Attendance","Flags",""].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr><td colSpan={9} style={{ padding:"40px", textAlign:"center", fontFamily:"'DM Mono',monospace", fontSize:12, color:"#bbb" }}>
                    {total === 0 ? "No history records yet. Import a CSV to get started." : "No records match the current filters."}
                  </td></tr>
                ) : records.map(r => {
                  const dc    = DIVISION_COLOR[r.division_played] || {};
                  const champ = CHAMP_STYLE[r.championship_result] || CHAMP_STYLE.none;
                  const attend = r.games_scheduled > 0 ? Math.round((r.games_attended/r.games_scheduled)*100) : null;
                  const initials = `${r.first_name[0]}${r.last_name[0]}`;
                  return (
                    <tr key={r.id} style={{ borderBottom:"1px solid #F3F2ED" }}>
                      <td style={S.td}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <div style={{ width:28, height:28, borderRadius:"50%", background:"#1a1a2e", color:"#D4A017", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Mono',monospace", fontSize:9, fontWeight:500, flexShrink:0 }}>{initials}</div>
                          <div>
                            <p style={{ fontFamily:"'Fraunces',serif", fontSize:12, fontWeight:600, color:"#1a1a2e", margin:0 }}>{r.first_name} {r.last_name}</p>
                            <p style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"#bbb", margin:0 }}>{r.email}</p>
                          </div>
                        </div>
                      </td>
                      <td style={S.td}><span style={{ fontFamily:"'Fraunces',serif", fontSize:14, fontWeight:700, color:"#1a1a2e" }}>{r.season_year}</span></td>
                      <td style={S.td}><Pill bg={dc.bg} color={dc.color} border={dc.border} small>{DIVISION_LABEL[r.division_played]||r.division_played}</Pill></td>
                      <td style={S.td}><span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#555" }}>{r.team_name||"—"}</span></td>
                      <td style={S.td}><span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, background:champ.bg, color:champ.color, padding:"2px 7px", borderRadius:99 }}>{champ.icon} {champ.label}</span></td>
                      <td style={S.td}>{r.skill_tier_reported ? <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, background:"#E8F0FE", color:"#1A3F8F", padding:"2px 6px", borderRadius:99 }}>{r.skill_tier_reported}</span> : <span style={{ color:"#ccc" }}>—</span>}</td>
                      <td style={S.td}>
                        {attend !== null ? (
                          <div>
                            <div style={{ height:3, width:60, background:"#F0EEE8", borderRadius:99, overflow:"hidden", marginBottom:3 }}>
                              <div style={{ height:"100%", width:`${attend}%`, background: attend<80?"#DC2626":"#166534", borderRadius:99 }} />
                            </div>
                            <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color: attend<80?"#DC2626":"#666" }}>{r.games_attended}/{r.games_scheduled}</span>
                          </div>
                        ) : <span style={{ color:"#ccc" }}>—</span>}
                      </td>
                      <td style={S.td}>
                        <div style={{ display:"flex", gap:3, flexWrap:"wrap" }}>
                          {r.was_captain==1 && <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, background:"#1a1a2e", color:"#D4A017", padding:"1px 5px", borderRadius:3 }}>C</span>}
                          {r.was_alternate==1 && <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, background:"#EDE9FE", color:"#4C1D95", padding:"1px 5px", borderRadius:3 }}>SUB</span>}
                          {r.sandbagging_flag==1 && <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, background:"#FEF2F2", color:"#991B1B", padding:"1px 5px", borderRadius:3 }}>⚠</span>}
                          {r.no_show_count>0 && <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, background:"#FEF3C7", color:"#92400E", padding:"1px 5px", borderRadius:3 }}>{r.no_show_count} NS</span>}
                        </div>
                      </td>
                      <td style={S.td}>
                        <button
                          onClick={() => handleDelete(r.id)}
                          disabled={deleting===r.id}
                          style={{ fontFamily:"'DM Mono',monospace", fontSize:10, background:"transparent", border:"1px solid #FCA5A5", color:"#DC2626", padding:"3px 8px", borderRadius:5, cursor:"pointer", opacity: deleting === r.id ? 0.5 : 1 }}
                        >Delete</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:12 }}>
              <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#aaa" }}>Page {page} of {totalPages} · {total} records</span>
              <div style={{ display:"flex", gap:6 }}>
                <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1} style={S.pageBtn}>← Prev</button>
                <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages} style={S.pageBtn}>Next →</button>
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap');*{box-sizing:border-box}`}</style>
    </div>
  );
}

const S = {
  root:{ fontFamily:"'Fraunces',Georgia,serif", background:"#F6F5F0", minHeight:"100vh", padding:"28px 32px 60px", maxWidth:1200 },
  header:{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12 },
  pill:{ display:"inline-block", fontFamily:"'DM Mono',monospace", fontSize:10, fontWeight:500, letterSpacing:".1em", textTransform:"uppercase", background:"#1a1a2e", color:"#D4A017", padding:"3px 12px", borderRadius:99, marginBottom:8 },
  title:{ fontFamily:"'Fraunces',serif", fontSize:28, fontWeight:700, color:"#1a1a2e", margin:"0 0 3px", letterSpacing:"-.5px" },
  subtitle:{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#999", margin:0 },
  templateBtn:{ fontFamily:"'DM Mono',monospace", fontSize:12, fontWeight:500, background:"#1a1a2e", color:"#D4A017", border:"none", padding:"9px 18px", borderRadius:8, cursor:"pointer" },
  tabs:{ display:"flex", gap:6, marginBottom:16 },
  tab:{ fontFamily:"'DM Mono',monospace", fontSize:12, fontWeight:500, padding:"8px 16px", borderRadius:8, cursor:"pointer", transition:"all .15s" },
  card:{ background:"#fff", border:"1px solid #E8E6DF", borderRadius:12, padding:"18px 20px" },
  cardLabel:{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#aaa", textTransform:"uppercase", letterSpacing:".08em", margin:"0 0 14px" },
  filterLabel:{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#aaa", textTransform:"uppercase", letterSpacing:".07em" },
  select:{ fontFamily:"'DM Mono',monospace", fontSize:12, background:"#F6F5F0", border:"1px solid #E8E6DF", borderRadius:6, padding:"6px 10px", color:"#333", outline:"none", minWidth:130 },
  th:{ fontFamily:"'DM Mono',monospace", fontSize:10, fontWeight:500, color:"#888", textTransform:"uppercase", letterSpacing:".07em", padding:"10px 12px", textAlign:"left", borderBottom:"1px solid #E8E6DF", background:"#FAFAF8" },
  td:{ padding:"10px 12px", verticalAlign:"middle" },
  pageBtn:{ fontFamily:"'DM Mono',monospace", fontSize:11, background:"#fff", border:"1px solid #E8E6DF", color:"#555", padding:"6px 12px", borderRadius:6, cursor:"pointer" },
};
