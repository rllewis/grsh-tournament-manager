import { useState, useEffect, useRef, useCallback } from "react";

const API   = window.grshConfig?.apiUrl || "/wp-json/grsh/v1";
const NONCE = window.grshConfig?.nonce  || "";
const USER  = window.grshConfig?.userDisplay || "Committee member";
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB — #18

// ─── Config ───────────────────────────────────────────────────────────────────
const DIVISION_LABEL = { gold_open:"Gold Open","45a":"45A",senior_b:"Senior B",senior_c:"Senior C",womens:"Womens" };
const DIVISION_COLOR = {
  gold_open:{ bg:"#FEF9E7",color:"#92601A",border:"#F5D77E" },
  "45a":    { bg:"#E8F6F8",color:"#1A5F6B",border:"#9DD5DC" },
  senior_b: { bg:"#F3EEF9",color:"#4A3070",border:"#C4AEED" },
  senior_c: { bg:"#FDF0E8",color:"#7A3318",border:"#F5B993" },
  womens:   { bg:"#FDE8F0",color:"#7A1845",border:"#F5A3C7" },
};
const CHAMP_STYLE = {
  winner:     { icon:"🏆",label:"Champion",  bg:"#FFFBEB",color:"#92400E" },
  runner_up:  { icon:"🥈",label:"Runner-up", bg:"#F3F4F6",color:"#374151" },
  participant:{ icon:"🏒",label:"Participant",bg:"#F9F8F4",color:"#888"   },
  none:       { icon:"—", label:"Sub / n/a", bg:"#F9F8F4",color:"#bbb"   },
};
// Full column schema — #11
const SCHEMA = [
  { col:"first_name",         req:true,  type:"string",  example:"Mike" },
  { col:"last_name",          req:true,  type:"string",  example:"Hartley" },
  { col:"email",              req:true,  type:"email",   example:"m.hartley@email.com" },
  { col:"season_year",        req:true,  type:"integer", example:"2025" },
  { col:"division_played",    req:true,  type:"enum",    example:"gold_open" },
  { col:"skill_tier_reported",req:false, type:"enum",    example:"A2" },
  { col:"team_name",          req:false, type:"string",  example:"Team Red" },
  { col:"championship_result",req:false, type:"enum",    example:"winner" },
  { col:"was_captain",        req:false, type:"boolean", example:"1" },
  { col:"was_alternate",      req:false, type:"boolean", example:"0" },
  { col:"games_scheduled",    req:false, type:"integer", example:"6" },
  { col:"games_attended",     req:false, type:"integer", example:"6" },
  { col:"no_show_count",      req:false, type:"integer", example:"0" },
  { col:"finish_position",    req:false, type:"integer", example:"1" },
];
// Sample rows for inline preview — #13
const SAMPLE_ROWS = [
  { first_name:"Mike", last_name:"Hartley", email:"m.hartley@email.com", season_year:2025, division_played:"gold_open", skill_tier_reported:"A2", championship_result:"winner", was_captain:1, games_scheduled:6, games_attended:6 },
  { first_name:"Janet",last_name:"Ruiz",    email:"j.ruiz@email.com",    season_year:2025, division_played:"senior_c", skill_tier_reported:"C1", championship_result:"participant", was_captain:0, games_scheduled:6, games_attended:5 },
];
// IMPORT_MODES — #19
const IMPORT_MODES = [
  { value:"append",  label:"Add new records only",       desc:"Skip rows that already exist (safe)" },
  { value:"upsert",  label:"Update existing + add new",  desc:"Overwrite matching records and add new ones" },
];

// ─── Tiny helpers ─────────────────────────────────────────────────────────────
function Pill({ bg, color, border, children, small }) {
  return (
    <span style={{ display:"inline-block",background:bg,color,border:`1px solid ${border||bg}`,
      fontSize:small?10:11,fontFamily:"'DM Mono',monospace",fontWeight:500,
      padding:small?"1px 6px":"2px 8px",borderRadius:99,whiteSpace:"nowrap" }}>
      {children}
    </span>
  );
}
function fmtBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024*1024) return `${(b/1024).toFixed(1)} KB`;
  return `${(b/1024/1024).toFixed(1)} MB`;
}
function parseCSVPreview(text, maxRows=5) {
  const lines = text.trim().split("\n").filter(Boolean);
  if (!lines.length) return { headers:[], rows:[], total:0 };
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g,""));
  const rows = lines.slice(1, maxRows+1).map(l =>
    l.split(",").map(c => c.trim().replace(/^"|"$/g,""))
  );
  return { headers, rows, total: lines.length - 1 };
}
function detectColumnMapping(headers) {
  // Auto-map common variations to canonical names — #26
  const ALIASES = {
    firstname:["firstname","first_name","fname","given_name"],
    lastname: ["lastname","last_name","lname","surname","family_name"],
    email:    ["email","email_address","emailaddress","e_mail"],
    season_year:["season_year","season","year","season_yr"],
    division_played:["division_played","division","div","division_name"],
    skill_tier_reported:["skill_tier_reported","skill_tier","tier","level"],
    championship_result:["championship_result","championship","result","finish_result"],
    team_name:["team_name","team","team_colour","team_color"],
    was_captain:["was_captain","captain","is_captain"],
    was_alternate:["was_alternate","alternate","is_alternate","is_sub","sub"],
    games_scheduled:["games_scheduled","scheduled","total_games"],
    games_attended:["games_attended","attended","games_played"],
    no_show_count:["no_show_count","no_shows","noshows","missed"],
  };
  const map = {};
  headers.forEach(h => {
    const norm = h.toLowerCase().replace(/\s+/g,"_");
    for (const [canon, variants] of Object.entries(ALIASES)) {
      if (variants.includes(norm)) { map[h] = canon; break; }
    }
    if (!map[h]) map[h] = h; // keep as-is if no match
  });
  return map;
}

// ─── Progress steps during import — #5 ────────────────────────────────────────
function ImportProgress({ step }) {
  const steps = ["Reading file","Validating rows","Writing records","Done"];
  return (
    <div style={{ padding:"32px 24px",textAlign:"center" }}>
      <div style={{ display:"flex",justifyContent:"center",alignItems:"center",gap:0,marginBottom:20 }}>
        {steps.map((s,i) => {
          const done = i < step;
          const active = i === step;
          return (
            <div key={s} style={{ display:"flex",alignItems:"center" }}>
              <div style={{ textAlign:"center" }}>
                <div style={{
                  width:28,height:28,borderRadius:"50%",margin:"0 auto 6px",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  background:done?"#166534":active?"#1a1a2e":"#F0EEE8",
                  color:done||active?"#fff":"#bbb",
                  fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:600,
                  transition:"all .3s",
                }}>
                  {done ? "✓" : i+1}
                </div>
                <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:active?"#1a1a2e":"#aaa",
                  textTransform:"uppercase",letterSpacing:".05em",maxWidth:64 }}>{s}</div>
              </div>
              {i < steps.length-1 && (
                <div style={{ width:40,height:2,background:done?"#166534":"#E8E6DF",
                  margin:"0 4px",marginBottom:22,transition:"background .3s" }} />
              )}
            </div>
          );
        })}
      </div>
      <p style={{ fontFamily:"'DM Mono',monospace",fontSize:12,color:"#aaa",margin:0 }}>
        {steps[step] || "Done"}…
      </p>
    </div>
  );
}

// ─── File preview before import — #4 ──────────────────────────────────────────
function FilePreview({ file, preview, colMap, setColMap, importMode, setImportMode, onConfirm, onCancel }) {
  const CANONICAL = SCHEMA.map(s => s.col);
  const unmapped = preview.headers.filter(h => !CANONICAL.includes(colMap[h]));

  return (
    <div style={{ border:"1px solid #E8E6DF",borderRadius:12,background:"#fff",overflow:"hidden" }}>
      {/* File info bar */}
      <div style={{ padding:"14px 18px",borderBottom:"1px solid #F0EEE8",
        background:"#FAFAF8",display:"flex",alignItems:"center",gap:12 }}>
        <span style={{ fontSize:20 }}>📄</span>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:700,color:"#1a1a2e" }}>
            {file.name}
          </div>
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",marginTop:2 }}>
            {fmtBytes(file.size)} · {preview.total} rows detected · {preview.headers.length} columns
          </div>
        </div>
        <button onClick={onCancel} style={{ fontFamily:"'DM Mono',monospace",fontSize:11,
          background:"transparent",border:"1px solid #E8E6DF",color:"#888",
          padding:"4px 10px",borderRadius:6,cursor:"pointer" }}>✕ Remove</button>
      </div>

      {/* Column mapping — #26 */}
      {unmapped.length > 0 && (
        <div style={{ padding:"14px 18px",background:"#FFFBEB",borderBottom:"1px solid #FDE68A" }}>
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#92400E",
            textTransform:"uppercase",letterSpacing:".07em",marginBottom:8 }}>
            ⚠ {unmapped.length} column{unmapped.length>1?"s":""} need{unmapped.length===1?"s":""} mapping
          </div>
          {unmapped.map(h => (
            <div key={h} style={{ display:"flex",alignItems:"center",gap:10,marginBottom:6 }}>
              <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#555",minWidth:160 }}>"{h}"</span>
              <span style={{ color:"#aaa",fontSize:12 }}>→</span>
              <select
                value={colMap[h]||""}
                onChange={e => setColMap(m => ({...m,[h]:e.target.value}))}
                style={{ fontFamily:"'DM Mono',monospace",fontSize:11,background:"#fff",
                  border:"1px solid #E8E6DF",borderRadius:6,padding:"4px 8px",color:"#333",minWidth:180 }}
              >
                <option value="">Skip this column</option>
                {CANONICAL.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      {/* Sample data table */}
      <div style={{ padding:"14px 18px",borderBottom:"1px solid #F0EEE8" }}>
        <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",
          textTransform:"uppercase",letterSpacing:".07em",marginBottom:8 }}>
          Preview — first {Math.min(preview.rows.length,5)} rows
        </div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%",borderCollapse:"collapse",fontSize:10 }}>
            <thead>
              <tr>
                {preview.headers.map(h => (
                  <th key={h} style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",
                    textTransform:"uppercase",padding:"4px 8px",textAlign:"left",
                    background:"#FAFAF8",borderBottom:"1px solid #F0EEE8",whiteSpace:"nowrap" }}>
                    {h}
                    {colMap[h] && colMap[h]!==h && (
                      <span style={{ color:"#166534",marginLeft:4 }}>→{colMap[h]}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row,i) => (
                <tr key={i} style={{ borderBottom:"1px solid #F9F8F4" }}>
                  {row.map((cell,j) => (
                    <td key={j} style={{ fontFamily:"'DM Mono',monospace",fontSize:10,
                      color:"#555",padding:"4px 8px",whiteSpace:"nowrap" }}>{cell||"—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Import mode — #19 */}
      <div style={{ padding:"14px 18px",borderBottom:"1px solid #F0EEE8" }}>
        <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",
          textTransform:"uppercase",letterSpacing:".07em",marginBottom:8 }}>Import mode</div>
        {IMPORT_MODES.map(m => (
          <label key={m.value} style={{ display:"flex",alignItems:"flex-start",gap:8,
            marginBottom:8,cursor:"pointer" }}>
            <input type="radio" name="importMode" value={m.value}
              checked={importMode===m.value}
              onChange={() => setImportMode(m.value)}
              style={{ marginTop:2,flexShrink:0 }} />
            <div>
              <div style={{ fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:600,color:"#1a1a2e" }}>{m.label}</div>
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa" }}>{m.desc}</div>
            </div>
          </label>
        ))}
      </div>

      {/* Confirm actions */}
      <div style={{ padding:"14px 18px",display:"flex",gap:10 }}>
        <button onClick={onCancel} style={{ fontFamily:"'DM Mono',monospace",fontSize:12,
          background:"#F6F5F0",border:"1px solid #E8E6DF",color:"#666",
          padding:"9px 18px",borderRadius:8,cursor:"pointer" }}>
          ← Choose a different file
        </button>
        <button onClick={onConfirm} style={{ fontFamily:"'DM Mono',monospace",fontSize:12,
          fontWeight:500,background:"#1a1a2e",color:"#D4A017",border:"none",
          padding:"9px 24px",borderRadius:8,cursor:"pointer" }}>
          Import {preview.total} rows →
        </button>
      </div>
    </div>
  );
}

// ─── Import result card — #6 #7 ───────────────────────────────────────────────
function ImportResult({ result, onViewRecords, onUndo, canUndo }) {
  const [errExpanded, setErrExpanded] = useState(false);
  const [warnExpanded,setWarnExpanded]= useState(false);
  const errorCount = result.errors?.length || 0;
  const warnCount  = result.warnings?.length || 0;

  if (!result.success) return (
    <div style={{ border:"1px solid #FCA5A5",background:"#FEF2F2",borderRadius:10,padding:"18px 20px" }}>
      <p style={{ fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,color:"#991B1B",margin:"0 0 6px" }}>
        ✗ Import failed
      </p>
      <p style={{ fontFamily:"'DM Mono',monospace",fontSize:12,color:"#991B1B",margin:0 }}>
        {result.message || "Unknown error — check your CSV format and try again."}
      </p>
    </div>
  );

  return (
    <div style={{ border:"1px solid #86EFAC",background:"#F0FDF4",borderRadius:10,overflow:"hidden" }}>
      {/* Summary row */}
      <div style={{ padding:"16px 20px",borderBottom: (errorCount||warnCount)?"1px solid #BBF7D0":"none" }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10 }}>
          <div>
            <p style={{ fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,color:"#166534",margin:"0 0 10px" }}>
              ✅ Import complete
            </p>
            <div style={{ display:"flex",gap:20,flexWrap:"wrap" }}>
              {[
                { label:"Total rows",val:result.total },
                { label:"Imported",  val:result.imported,color:"#166534" },
                { label:"Updated",   val:result.updated||0,color:result.updated>0?"#1A4F8A":undefined },
                { label:"Skipped",   val:result.skipped||0,color:result.skipped>0?"#92400E":undefined },
                { label:"Errors",    val:errorCount,       color:errorCount>0?"#991B1B":undefined },
              ].map(s => (
                <div key={s.label}>
                  <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",
                    textTransform:"uppercase",letterSpacing:".06em",marginBottom:2 }}>{s.label}</div>
                  <div style={{ fontFamily:"'Fraunces',serif",fontSize:20,fontWeight:700,
                    color:s.color||"#1a1a2e" }}>{s.val}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display:"flex",gap:8 }}>
            {canUndo && (
              <button onClick={onUndo} style={{ fontFamily:"'DM Mono',monospace",fontSize:11,
                background:"#FEF3C7",border:"1px solid #FDE68A",color:"#92400E",
                padding:"6px 14px",borderRadius:8,cursor:"pointer" }}>
                ↩ Undo import
              </button>
            )}
            <button onClick={onViewRecords} style={{ fontFamily:"'DM Mono',monospace",fontSize:11,
              background:"#1a1a2e",color:"#D4A017",border:"none",
              padding:"6px 14px",borderRadius:8,cursor:"pointer" }}>
              View imported records →
            </button>
          </div>
        </div>
      </div>

      {/* Warnings expandable — #7 */}
      {warnCount > 0 && (
        <div style={{ borderBottom:errorCount?"1px solid #BBF7D0":"none" }}>
          <button onClick={()=>setWarnExpanded(w=>!w)} style={{
            display:"flex",justifyContent:"space-between",alignItems:"center",
            width:"100%",padding:"10px 20px",background:"transparent",border:"none",
            cursor:"pointer",textAlign:"left",
          }}>
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#92400E",fontWeight:500 }}>
              ⚠ {warnCount} warning{warnCount>1?"s":""}
            </span>
            <span style={{ fontSize:12,color:"#aaa" }}>{warnExpanded?"▲":"▼"}</span>
          </button>
          {warnExpanded && (
            <div style={{ padding:"0 20px 12px" }}>
              {result.warnings.map((w,i) => (
                <div key={i} style={{ fontFamily:"'DM Mono',monospace",fontSize:11,
                  color:"#92400E",padding:"3px 0",borderTop:"1px solid #FEF3C7" }}>
                  ⚠ {w}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error table expandable — #7 */}
      {errorCount > 0 && (
        <div>
          <button onClick={()=>setErrExpanded(e=>!e)} style={{
            display:"flex",justifyContent:"space-between",alignItems:"center",
            width:"100%",padding:"10px 20px",background:"transparent",border:"none",
            cursor:"pointer",textAlign:"left",
          }}>
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#991B1B",fontWeight:500 }}>
              ✗ {errorCount} error{errorCount>1?"s":""}
            </span>
            <div style={{ display:"flex",alignItems:"center",gap:10 }}>
              <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#166534" }}>
                ↓ Download error report
              </span>
              <span style={{ fontSize:12,color:"#aaa" }}>{errExpanded?"▲":"▼"}</span>
            </div>
          </button>
          {errExpanded && (
            <div style={{ padding:"0 20px 12px",overflowX:"auto" }}>
              <table style={{ width:"100%",borderCollapse:"collapse",fontSize:11 }}>
                <thead>
                  <tr>
                    {["Row #","Field","Error"].map(h => (
                      <th key={h} style={{ fontFamily:"'DM Mono',monospace",fontSize:9,
                        color:"#aaa",textTransform:"uppercase",textAlign:"left",
                        padding:"4px 8px",background:"#FEF2F2",borderBottom:"1px solid #FCA5A5" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((e,i) => (
                    <tr key={i} style={{ borderBottom:"1px solid #FEE2E2" }}>
                      <td style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#991B1B",
                        padding:"4px 8px",fontWeight:600 }}>{e.row||i+2}</td>
                      <td style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#555",padding:"4px 8px" }}>{e.field||"—"}</td>
                      <td style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#991B1B",padding:"4px 8px" }}>{typeof e==="string"?e:e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Drop zone — #9 #10 hover + file info ─────────────────────────────────────
function DropZone({ onFile, fileRef }) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragEnter={()=>setDragging(true)}
      onDragLeave={()=>setDragging(false)}
      onDrop={handleDrop}
      onClick={()=>fileRef.current?.click()}
      onKeyDown={e=>(e.key==="Enter"||e.key===" ")&&fileRef.current?.click()}
      tabIndex={0}
      role="button"
      aria-label="Drop CSV file or press Enter to browse"
      style={{
        border:`2px dashed ${dragging?"#1a1a2e":"#D0CEC6"}`,
        borderRadius:12,
        background:dragging?"#EEF2FF":"#fff",
        padding:"48px 24px",
        textAlign:"center",
        cursor:"pointer",
        transition:"all .2s",
        outline:"none",
      }}
    >
      <input ref={fileRef} type="file" accept=".csv" style={{ display:"none" }}
        onChange={e=>onFile(e.target.files[0])} />
      <div style={{ fontSize:36,marginBottom:12 }}>{dragging?"📥":"📂"}</div>
      <p style={{ fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,color:"#1a1a2e",margin:"0 0 6px" }}>
        {dragging ? "Release to upload" : "Drop your CSV here"}
      </p>
      <p style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#aaa",margin:"0 0 8px" }}>
        or click to browse &nbsp;·&nbsp; press Enter
      </p>
      {/* Constraints — #18 #24 */}
      <p style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#bbb",margin:0 }}>
        .csv only &nbsp;·&nbsp; Max 5 MB &nbsp;·&nbsp; UTF-8 encoding &nbsp;·&nbsp; Comma-separated
      </p>
    </div>
  );
}

// ─── Import log entry — #3 #20 ────────────────────────────────────────────────
function ImportLogEntry({ job, onUndo }) {
  const [expanded, setExpanded] = useState(false);
  const canUndo = job.canUndo;
  return (
    <div style={{ border:"1px solid #E8E6DF",borderRadius:8,marginBottom:8,overflow:"hidden" }}>
      <div style={{ display:"flex",alignItems:"center",gap:12,padding:"10px 14px",
        background:"#FAFAF8",cursor:"pointer" }}
        onClick={()=>setExpanded(e=>!e)}>
        <span style={{ fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:700,color:"#1a1a2e" }}>
          {job.filename}
        </span>
        <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",flex:1 }}>
          {job.rows_imported} rows · {job.timestamp} · by {job.imported_by}
        </span>
        {job.errors>0 && (
          <Pill bg="#FEF2F2" color="#991B1B" small>✗ {job.errors} errors</Pill>
        )}
        <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa" }}>
          {expanded?"▲":"▼"}
        </span>
      </div>
      {expanded && (
        <div style={{ padding:"12px 14px",borderTop:"1px solid #F0EEE8" }}>
          <div style={{ display:"flex",gap:20,marginBottom:12,flexWrap:"wrap" }}>
            {[["Imported",job.rows_imported,"#166534"],["Skipped",job.rows_skipped,"#92400E"],["Errors",job.errors,"#991B1B"],["Mode",job.mode]].map(([l,v,c])=>(
              <div key={l}>
                <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",textTransform:"uppercase",letterSpacing:".06em",marginBottom:2 }}>{l}</div>
                <div style={{ fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,color:c||"#1a1a2e" }}>{v}</div>
              </div>
            ))}
          </div>
          {canUndo && (
            <button onClick={()=>onUndo(job.id)} style={{ fontFamily:"'DM Mono',monospace",
              fontSize:11,background:"#FEF3C7",border:"1px solid #FDE68A",color:"#92400E",
              padding:"5px 12px",borderRadius:6,cursor:"pointer" }}>
              ↩ Undo this import
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Clear all confirmation — #27 ─────────────────────────────────────────────
function ClearAllModal({ recordCount, onConfirm, onCancel }) {
  const [typed, setTyped] = useState("");
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.5)",
      zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center" }}>
      <div style={{ background:"#fff",borderRadius:14,padding:"28px",maxWidth:420,width:"90vw",
        boxShadow:"0 24px 60px rgba(0,0,0,.22)" }}>
        <div style={{ fontSize:32,textAlign:"center",marginBottom:12 }}>⚠️</div>
        <h2 style={{ fontFamily:"'Fraunces',serif",fontSize:20,fontWeight:700,
          color:"#991B1B",textAlign:"center",margin:"0 0 10px" }}>Clear all imported history</h2>
        <p style={{ fontFamily:"'DM Mono',monospace",fontSize:12,color:"#555",
          textAlign:"center",margin:"0 0 20px",lineHeight:1.6 }}>
          This will permanently delete <strong>{recordCount} records</strong> from all import jobs.
          This action cannot be undone.
        </p>
        <label style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",
          textTransform:"uppercase",letterSpacing:".07em",display:"block",marginBottom:6 }}>
          Type DELETE to confirm
        </label>
        <input value={typed} onChange={e=>setTyped(e.target.value)} autoFocus
          style={{ width:"100%",fontFamily:"'DM Mono',monospace",fontSize:14,
            border:"1px solid #FCA5A5",borderRadius:6,padding:"8px 10px",
            color:"#991B1B",outline:"none",marginBottom:14 }} />
        <div style={{ display:"flex",gap:10 }}>
          <button onClick={onCancel} style={{ flex:1,fontFamily:"'DM Mono',monospace",fontSize:12,
            background:"#F6F5F0",border:"1px solid #E8E6DF",color:"#666",
            padding:"10px",borderRadius:8,cursor:"pointer" }}>Cancel</button>
          <button onClick={onConfirm} disabled={typed!=="DELETE"} style={{
            flex:1,fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:500,
            background:typed==="DELETE"?"#991B1B":"#ccc",color:"#fff",border:"none",
            padding:"10px",borderRadius:8,cursor:typed==="DELETE"?"pointer":"not-allowed" }}>
            Delete all records
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Confirmation modal for season scope — #16 ────────────────────────────────
function ImportConfirmModal({ preview, importMode, onConfirm, onCancel }) {
  const seasons    = [...new Set(preview.rows.map(r => r[3]).filter(Boolean))];
  const rowCount   = preview.total;
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.45)",
      zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center" }}>
      <div style={{ background:"#fff",borderRadius:14,padding:"28px",maxWidth:440,width:"90vw",
        boxShadow:"0 24px 60px rgba(0,0,0,.22)" }}>
        <h2 style={{ fontFamily:"'Fraunces',serif",fontSize:19,fontWeight:700,
          color:"#1a1a2e",margin:"0 0 12px" }}>Confirm import</h2>
        <div style={{ background:"#F6F5F0",borderRadius:8,padding:"12px 14px",marginBottom:16 }}>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            {[["Rows to import",rowCount],["Import mode",importMode],["Seasons detected",seasons.join(", ")||"—"]].map(([l,v])=>(
              <div key={l}>
                <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",
                  textTransform:"uppercase",letterSpacing:".06em",marginBottom:2 }}>{l}</div>
                <div style={{ fontFamily:"'Fraunces',serif",fontSize:14,fontWeight:700,color:"#1a1a2e" }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        <p style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#888",margin:"0 0 18px",lineHeight:1.6 }}>
          This will write {rowCount} history record{rowCount!==1?"s":""} to the database.
          You can undo within 10 minutes if something looks wrong.
        </p>
        <div style={{ display:"flex",gap:10 }}>
          <button onClick={onCancel} style={{ flex:1,fontFamily:"'DM Mono',monospace",fontSize:12,
            background:"#F6F5F0",border:"1px solid #E8E6DF",color:"#666",
            padding:"10px",borderRadius:8,cursor:"pointer" }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex:2,fontFamily:"'DM Mono',monospace",fontSize:12,
            fontWeight:500,background:"#1a1a2e",color:"#D4A017",border:"none",
            padding:"10px",borderRadius:8,cursor:"pointer" }}>
            Confirm — import {rowCount} rows
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Help guide modal — full import reference ─────────────────────────────────
function HelpGuideModal({ onClose }) {
  const [section, setSection] = useState("overview");

  const SECTIONS = [
    { key:"overview",  label:"Overview" },
    { key:"steps",     label:"Step-by-step" },
    { key:"columns",   label:"Column reference" },
    { key:"errors",    label:"Common errors" },
    { key:"faq",       label:"FAQ" },
  ];

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.5)",
      zIndex:9999,display:"flex",alignItems:"flex-start",justifyContent:"center",
      padding:"40px 16px",overflowY:"auto" }}
      onClick={onClose}>
      <div style={{ background:"#fff",borderRadius:16,width:"100%",maxWidth:700,
        boxShadow:"0 32px 80px rgba(0,0,0,.25)",overflow:"hidden" }}
        onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding:"22px 28px 18px",borderBottom:"1px solid #F0EEE8",
          display:"flex",alignItems:"center",justifyContent:"space-between",
          background:"#1a1a2e" }}>
          <div>
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#D4A017",
              letterSpacing:".1em",textTransform:"uppercase",marginBottom:4 }}>
              Import guide
            </div>
            <h2 style={{ fontFamily:"'Fraunces',serif",fontSize:20,fontWeight:700,
              color:"#fff",margin:0 }}>
              How to import player history
            </h2>
          </div>
          <button onClick={onClose} style={{ background:"none",border:"none",
            fontSize:18,color:"#D4A017",cursor:"pointer",padding:"4px 8px" }}>✕</button>
        </div>

        {/* Tab nav */}
        <div style={{ display:"flex",gap:0,borderBottom:"1px solid #F0EEE8",
          overflowX:"auto",background:"#FAFAF8" }}>
          {SECTIONS.map(s=>(
            <button key={s.key} onClick={()=>setSection(s.key)} style={{
              fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,
              padding:"10px 16px",background:"transparent",border:"none",
              borderBottom:`2px solid ${section===s.key?"#1a1a2e":"transparent"}`,
              color:section===s.key?"#1a1a2e":"#888",cursor:"pointer",
              whiteSpace:"nowrap",transition:"all .15s",
            }}>{s.label}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding:"24px 28px",maxHeight:"65vh",overflowY:"auto" }}>

          {/* ── OVERVIEW ── */}
          {section === "overview" && (
            <div>
              <p style={gP}>The Import Player History page lets you load prior season records from a CSV file.
                Once imported, these records power three key features in the GRSH Tournament Manager:</p>
              <div style={{ display:"flex",flexDirection:"column",gap:10,marginBottom:20 }}>
                {[
                  { icon:"⚠", title:"Sandbagging detection",
                    body:"If a returning player's self-reported tier is significantly lower than their historical tier, the system flags them for committee review." },
                  { icon:"↩", title:"Carry-forward data",
                    body:"Returning player names, emails, positions, and tier history are pre-filled in their 2027 registration for faster setup." },
                  { icon:"🏆", title:"Career history panel",
                    body:"The History page shows each player's full season-by-season record — divisions, teams, tier progression, championships, and attendance." },
                ].map(item=>(
                  <div key={item.title} style={{ display:"flex",gap:12,padding:"12px 14px",
                    background:"#F6F5F0",borderRadius:8 }}>
                    <span style={{ fontSize:20,flexShrink:0 }}>{item.icon}</span>
                    <div>
                      <div style={{ fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:700,
                        color:"#1a1a2e",marginBottom:3 }}>{item.title}</div>
                      <div style={{ fontFamily:"'DM Mono',monospace",fontSize:11,
                        color:"#666",lineHeight:1.6 }}>{item.body}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ background:"#E0F0FF",borderRadius:8,padding:"12px 14px",
                fontFamily:"'DM Mono',monospace",fontSize:11,color:"#1A4F8A",lineHeight:1.6 }}>
                💡 <strong>Tip:</strong> Import history before opening player registrations.
                The sandbagging detector only runs when a player's history record already exists
                at the time they submit their form.
              </div>
            </div>
          )}

          {/* ── STEP BY STEP ── */}
          {section === "steps" && (
            <div>
              {[
                {
                  n:"1",title:"Download the template",
                  steps:[
                    "Click the ↓ Download template button inside Step 1 on the Import CSV tab.",
                    "The file grsh-history-import-template.csv will download to your computer.",
                    "Open it in Excel, Google Sheets, or Numbers. It includes 3 example rows showing the correct format.",
                    "Do not rename or reorder the column headers — the importer matches on exact header names.",
                  ],
                },
                {
                  n:"2",title:"Fill in your data",
                  steps:[
                    "Add one row per player per season. If Mike Hartley played in 2024, 2025, and 2026, he gets three rows.",
                    "Required columns must be filled: first_name, last_name, email, season_year, division_played.",
                    "Optional columns can be left blank — the importer skips empty cells without errors.",
                    "Save the file as CSV (comma-separated). In Excel: File → Save As → CSV UTF-8.",
                    "Keep the file under 5 MB. A full season of 80 players is typically under 50 KB.",
                  ],
                },
                {
                  n:"3",title:"Upload and preview",
                  steps:[
                    "Drag your CSV onto the drop zone, or click it to open the file browser.",
                    "A preview of the first 5 rows will appear before anything is written to the database.",
                    "If any column names in your file don't exactly match the expected names, a mapping section appears — use the dropdowns to connect your columns to the right fields.",
                    "Choose your import mode: Add new records only (safe default) or Update existing + add new.",
                  ],
                },
                {
                  n:"4",title:"Confirm and import",
                  steps:[
                    "A confirmation dialog shows you the number of rows, detected seasons, and import mode.",
                    "Click Confirm to run the import. A progress indicator shows each stage.",
                    "After import, a result card shows how many rows were imported, updated, skipped, or errored.",
                    "You have 10 minutes to undo the import if something looks wrong — the undo banner appears at the top of the page.",
                  ],
                },
              ].map(step=>(
                <div key={step.n} style={{ marginBottom:20 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:10 }}>
                    <div style={{ width:26,height:26,borderRadius:"50%",background:"#1a1a2e",
                      color:"#D4A017",display:"flex",alignItems:"center",justifyContent:"center",
                      fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:700,flexShrink:0 }}>{step.n}</div>
                    <span style={{ fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:700,color:"#1a1a2e" }}>{step.title}</span>
                  </div>
                  <ol style={{ margin:0,paddingLeft:20 }}>
                    {step.steps.map((s,i)=>(
                      <li key={i} style={{ fontFamily:"'DM Mono',monospace",fontSize:11,
                        color:"#555",lineHeight:1.7,marginBottom:4 }}>{s}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}

          {/* ── COLUMN REFERENCE ── */}
          {section === "columns" && (
            <div>
              <p style={gP}>Every column the importer recognises is listed below.
                Required columns must be present in your CSV.
                Optional columns are skipped if blank or missing entirely.</p>
              {[
                { group:"Player identity", cols:[
                  { col:"first_name",    req:true,  type:"Text",    notes:"Player's first name. Max 100 characters." },
                  { col:"last_name",     req:true,  type:"Text",    notes:"Player's last name. Max 100 characters." },
                  { col:"email",         req:true,  type:"Email",   notes:"Used to match returning players. Must be a valid email address." },
                ]},
                { group:"Season record", cols:[
                  { col:"season_year",      req:true,  type:"Integer", notes:"4-digit year. e.g. 2024, 2025, 2026" },
                  { col:"division_played",  req:true,  type:"Enum",    notes:"gold_open · 45a · senior_b · senior_c · womens" },
                  { col:"team_name",        req:false, type:"Text",    notes:"e.g. Team Red, Team Gold. Used in the history panel." },
                  { col:"finish_position",  req:false, type:"Integer", notes:"Numeric finish. 1 = first place." },
                  { col:"championship_result",req:false,type:"Enum",   notes:"winner · runner_up · participant · none" },
                ]},
                { group:"Player role", cols:[
                  { col:"was_captain",   req:false, type:"Boolean", notes:"1, true, or yes if this player was team captain." },
                  { col:"was_alternate", req:false, type:"Boolean", notes:"1, true, or yes if this player was a sub/alternate." },
                ]},
                { group:"Skill", cols:[
                  { col:"skill_tier_reported",req:false,type:"Enum",  notes:"A1–A3, B1–B3, C1–C2, R1–R3. Self-reported tier for that season." },
                ]},
                { group:"Attendance", cols:[
                  { col:"games_scheduled",req:false,type:"Integer",notes:"Total regular season games the player was scheduled for." },
                  { col:"games_attended", req:false,type:"Integer",notes:"Games the player actually attended." },
                  { col:"no_show_count",  req:false,type:"Integer",notes:"Number of games missed without notice. Drives the no-show flag." },
                ]},
              ].map(group=>(
                <div key={group.group} style={{ marginBottom:18 }}>
                  <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",
                    textTransform:"uppercase",letterSpacing:".08em",
                    borderBottom:"1px solid #F0EEE8",paddingBottom:6,marginBottom:8 }}>
                    {group.group}
                  </div>
                  {group.cols.map(c=>(
                    <div key={c.col} style={{ display:"grid",
                      gridTemplateColumns:"180px 60px 70px 1fr",
                      gap:8,padding:"6px 0",borderBottom:"1px solid #F9F8F4",
                      alignItems:"start" }}>
                      <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,
                        color:"#1a1a2e",fontWeight:500 }}>{c.col}</span>
                      <span>
                        {c.req
                          ? <span style={{ fontFamily:"'DM Mono',monospace",fontSize:9,
                              background:"#E6F4EA",color:"#1E6B3A",padding:"1px 6px",
                              borderRadius:99 }}>Required</span>
                          : <span style={{ fontFamily:"'DM Mono',monospace",fontSize:9,
                              background:"#F3F4F6",color:"#888",padding:"1px 6px",
                              borderRadius:99 }}>Optional</span>}
                      </span>
                      <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#888" }}>{c.type}</span>
                      <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#555",lineHeight:1.5 }}>{c.notes}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* ── COMMON ERRORS ── */}
          {section === "errors" && (
            <div>
              {[
                { err:"Missing required column: email",
                  cause:"The column header in your CSV doesn't match exactly. Common variants: Email, EMAIL, email_address.",
                  fix:"Rename the column to exactly email (lowercase). Or use the column mapping interface that appears in the file preview." },
                { err:"Invalid division value: 'Gold Open'",
                  cause:"The division_played column must use the slug format, not the display label.",
                  fix:"Replace 'Gold Open' with gold_open. See the full list of valid values in the Column reference tab." },
                { err:"Row skipped: duplicate record",
                  cause:"A record for this player + season already exists in the database.",
                  fix:"Switch import mode to 'Update existing + add new' if you want to overwrite existing records. Otherwise the row is safely skipped." },
                { err:"Invalid email format on row 14",
                  cause:"The email field contains a value that isn't a valid email address.",
                  fix:"Fix the email in your CSV and re-import. The error report shows the exact row number and field." },
                { err:"season_year must be a 4-digit integer",
                  cause:"The season column contains a value like '25' (2-digit) or 'Season 2025' (with text).",
                  fix:"Use a plain 4-digit year: 2024, 2025, 2026. Remove any surrounding text." },
                { err:"File encoding error / garbled characters",
                  cause:"The CSV was saved with a non-UTF-8 encoding (e.g. Windows-1252 or Latin-1). Common with older Excel versions on Windows.",
                  fix:"In Excel, use File → Save As → CSV UTF-8 (with BOM). In Google Sheets, File → Download → CSV always exports UTF-8." },
                { err:"Import completes but no records appear in History",
                  cause:"The player emails in the CSV don't match any registered player emails. History records are linked by email.",
                  fix:"Verify the email addresses in your CSV exactly match the emails in the Players table. Case-insensitive, but must otherwise be identical." },
              ].map((item,i)=>(
                <div key={i} style={{ marginBottom:14,padding:"12px 14px",
                  background:"#FAFAF8",borderRadius:8,borderLeft:"3px solid #E8E6DF" }}>
                  <div style={{ fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:600,
                    color:"#991B1B",marginBottom:6 }}>✗ {item.err}</div>
                  <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#555",
                    marginBottom:4 }}><strong style={{ color:"#92400E" }}>Why:</strong> {item.cause}</div>
                  <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#555" }}>
                    <strong style={{ color:"#166534" }}>Fix:</strong> {item.fix}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── FAQ ── */}
          {section === "faq" && (
            <div>
              {[
                { q:"Can I import multiple seasons at once?",
                  a:"Yes. Put all seasons in the same CSV — one row per player per season. The importer handles any number of seasons in a single file." },
                { q:"What happens if I import the same player twice?",
                  a:"In 'Add new records only' mode, duplicate rows (same email + season_year) are skipped. In 'Update existing + add new' mode, the existing record is overwritten with the new data." },
                { q:"Do I have to fill in all the optional columns?",
                  a:"No. Required columns are first_name, last_name, email, season_year, and division_played. Everything else is optional. Leave optional columns blank or remove them entirely." },
                { q:"Can I import history for players who haven't registered yet for 2027?",
                  a:"Yes. History records are stored independently. The sandbagging and carry-forward features activate when the player submits their 2027 registration form." },
                { q:"How do I undo an import?",
                  a:"Within 10 minutes of importing, an amber undo banner appears at the top of the page. Click 'Undo last import' to remove all records from that import job. After 10 minutes the undo window closes." },
                { q:"Can I import data from a different system?",
                  a:"Yes. Download the template, match your column names to the expected headers, and use the column mapping interface in the file preview if any headers don't match exactly." },
                { q:"My CSV has extra columns — will they cause errors?",
                  a:"No. Unrecognised columns are ignored. Only columns matching the expected names are imported." },
                { q:"What is the maximum file size?",
                  a:"5 MB. A full season of 80 players is typically under 50 KB, so this limit only applies to large multi-year imports of hundreds of players." },
                { q:"Does importing history affect the live Players page?",
                  a:"Not directly. History records are stored in a separate table. They influence sandbagging flags and returning player detection, but do not modify a player's current 2027 registration." },
              ].map((item,i)=>(
                <div key={i} style={{ marginBottom:14,paddingBottom:14,
                  borderBottom:"1px solid #F0EEE8" }}>
                  <div style={{ fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:700,
                    color:"#1a1a2e",marginBottom:5 }}>Q: {item.q}</div>
                  <div style={{ fontFamily:"'DM Mono',monospace",fontSize:11,
                    color:"#555",lineHeight:1.7 }}>{item.a}</div>
                </div>
              ))}
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={{ padding:"14px 28px",borderTop:"1px solid #F0EEE8",
          background:"#FAFAF8",display:"flex",justifyContent:"space-between",
          alignItems:"center" }}>
          <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa" }}>
            GRSH Tournament Manager · Import Guide
          </span>
          <button onClick={onClose} style={{ fontFamily:"'DM Mono',monospace",fontSize:12,
            background:"#1a1a2e",color:"#D4A017",border:"none",
            padding:"8px 20px",borderRadius:8,cursor:"pointer" }}>
            Close guide
          </button>
        </div>
      </div>
    </div>
  );
}
const gP = { fontFamily:"'DM Mono',monospace",fontSize:11,color:"#555",lineHeight:1.7,marginBottom:16 };

// ─── Main component ───────────────────────────────────────────────────────────
export default function HistoryImport() {
  const [tab,          setTab]          = useState("import");
  const [stats,        setStats]        = useState(null);
  const [records,      setRecords]      = useState([]);
  const [total,        setTotal]        = useState(0);
  const [page,         setPage]         = useState(1);
  const [filterDiv,    setFilterDiv]    = useState("");
  const [filterYear,   setFilterYear]   = useState("");
  const [filterJobId,  setFilterJobId]  = useState("");

  // Import flow state
  const [selectedFile,  setSelectedFile]  = useState(null);
  const [filePreview,   setFilePreview]   = useState(null);   // #4
  const [colMap,        setColMap]        = useState({});     // #26
  const [importMode,    setImportMode]    = useState("append"); // #19
  const [importStep,    setImportStep]    = useState(-1);     // #5 -1=idle 0-3=progress
  const [result,        setResult]        = useState(null);   // #6
  const [undoJobId,     setUndoJobId]     = useState(null);   // #8
  const [undoTimer,     setUndoTimer]     = useState(null);   // #8 seconds remaining
  const [importLog,     setImportLog]     = useState([]);     // #3
  const [showClearAll,  setShowClearAll]  = useState(false);  // #27
  const [showConfirm,   setShowConfirm]   = useState(false);  // #16
  const [showSchema,    setShowSchema]    = useState(false);  // #11
  const [showSample,    setShowSample]    = useState(false);  // #13
  const [showHelp,      setShowHelp]      = useState(false);  // #30
  const [deleting,      setDeleting]      = useState(null);
  const [toast,         setToast]         = useState(null);

  const showToast = (msg, dur=3500) => { setToast(msg); setTimeout(() => setToast(null), dur); };

  const fileRef = useRef();
  const undoInterval = useRef(null);

  useEffect(()=>{ loadStats(); loadLog(); },[]);
  useEffect(()=>{ if(tab==="records") loadRecords(); },[tab,page,filterDiv,filterYear,filterJobId]);

  // Undo countdown — #8
  useEffect(()=>{
    if (undoJobId && undoTimer===null) {
      setUndoTimer(600); // 10 minutes
      undoInterval.current = setInterval(()=>{
        setUndoTimer(t=>{
          if(t<=1){ clearInterval(undoInterval.current); setUndoJobId(null); return null; }
          return t-1;
        });
      },1000);
    }
    return ()=>{ if(!undoJobId) clearInterval(undoInterval.current); };
  },[undoJobId]);

  const loadStats = async () => {
    try {
      const r = await fetch(`${API}/history/stats`, { headers: { "X-WP-Nonce": NONCE } });
      if (r.ok) { setStats(await r.json()); return; }
    } catch {}
    // Only fall back to mock if API failed and we have no stats yet
    setStats(s => s || { total_records:0, champions:0, sandbagging:0, no_shows:0, seasons:[] });
  };
  const loadLog = async () => {
    try {
      const r = await fetch(`${API}/history/import-log`,{headers:{"X-WP-Nonce":NONCE}});
      if(r.ok) setImportLog(await r.json());
    } catch{}
  };
  const loadRecords = async () => {
    try {
      const p = new URLSearchParams({page,per_page:20});
      if(filterDiv)    p.set("division",filterDiv);
      if(filterYear)   p.set("season_year",filterYear);
      if(filterJobId)  p.set("job_id",filterJobId);
      const r = await fetch(`${API}/history/records?${p}`,{headers:{"X-WP-Nonce":NONCE}});
      if(r.ok){ const d=await r.json(); setRecords(d.records||[]); setTotal(d.total||0); }
    } catch{}
  };

  // File selected — parse preview before any upload — #4
  const handleFileSelect = async (file) => {
    if (!file) return;
    // Validate file type — #18
    if (!file.name.endsWith(".csv")) {
      alert("Please select a .csv file.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      alert(`File too large. Maximum size is 5 MB. Your file is ${fmtBytes(file.size)}.`);
      return;
    }
    const text = await file.text();
    const preview = parseCSVPreview(text, 5);
    if (!preview.headers.length) { alert("CSV appears empty or unreadable."); return; }
    const colMapping = detectColumnMapping(preview.headers);
    setSelectedFile(file);
    setFilePreview({ ...preview, rawText:text });
    setColMap(colMapping);
    setResult(null);
    setImportStep(-1);
  };

  // Confirmed — run the actual import — #5 #16
  const runImport = async () => {
    setShowConfirm(false);
    setImportStep(0);
    await delay(400);
    setImportStep(1);
    const form = new FormData();
    form.append("csv", selectedFile);
    form.append("import_mode", importMode);
    form.append("col_map", JSON.stringify(colMap));
    try {
      setImportStep(2);
      const res = await fetch(`${API}/history/import`,{
        method:"POST",headers:{"X-WP-Nonce":NONCE},body:form,
      });
      const data = await res.json();
      setImportStep(3);
      await delay(600);
      setImportStep(-1);
      setResult(data);
      if(data.success){
        loadStats(); loadLog();
        // Start undo window — #8
        if(data.job_id){ setUndoJobId(data.job_id); setUndoTimer(null); }
      }
    } catch{
      setImportStep(-1);
      setResult({ success:false, message:"Network error — please try again." });
    }
    setSelectedFile(null);
    setFilePreview(null);
  };

  const handleUndo = async (jobId) => {
    try {
      await fetch(`${API}/history/import-log/${jobId}/undo`,{
        method:"POST",headers:{"X-WP-Nonce":NONCE},
      });
      setUndoJobId(null); setUndoTimer(null);
      loadStats(); loadLog(); loadRecords();
      setResult(null);
      alert("Import undone successfully.");
    } catch{ alert("Undo failed — please contact your admin."); }
  };

  const handleClearAll = async () => {
    setShowClearAll(false);
    setDeleting("all");
    try {
      const res = await fetch(`${API}/history/records`, {
        method: "DELETE",
        headers: { "X-WP-Nonce": NONCE, "Content-Type": "application/json" },
      });
      if (res.ok) {
        // Clear all local state immediately — don't wait for refetch
        setRecords([]);
        setTotal(0);
        setStats(s => ({ ...s, total_records:0, champions:0, sandbagging:0, no_shows:0, seasons:[] }));
        setImportLog([]);
        setUndoJobId(null);
        setUndoTimer(null);
        setResult(null);
        showToast("✓ All history cleared");
        // Confirm from server
        loadStats(); loadLog(); loadRecords();
      } else {
        const body = await res.json().catch(() => ({}));
        showToast(`✗ Delete failed: ${body.message || `HTTP ${res.status}`}`);
      }
    } catch (err) {
      showToast("✗ Network error — history was not cleared. Try again.");
    } finally {
      setDeleting(null);
    }
  };

  // Generate and download the CSV template entirely in the browser —
  // no REST endpoint required. Includes all columns + 2 example rows.
  const downloadTemplate = () => {
    const headers = SCHEMA.map(s => s.col);
    const row1 = [
      "Mike","Hartley","m.hartley@email.com","2025","gold_open",
      "A2","Team Red","winner","1","0","6","6","0","1",
    ];
    const row2 = [
      "Janet","Ruiz","j.ruiz@email.com","2025","senior_c",
      "C1","Team Blue","participant","0","0","6","5","1","2",
    ];
    const row3 = [
      "Linda","Tran","l.tran@email.com","2024","45a",
      "R3","Team Gold","winner","1","0","5","5","0","1",
    ];
    const lines = [headers, row1, row2, row3]
      .map(r => r.map(c => `"${c}"`).join(","))
      .join("\n");
    const blob = new Blob([lines], { type:"text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = "grsh-history-import-template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const delay = ms => new Promise(r=>setTimeout(r,ms));
  const PER_PAGE = 20;
  const totalPages = Math.ceil(total/PER_PAGE);
  const s = stats || {};
  // hasRecords is true if either the stats API returned a count OR
  // the records tab already has rows (handles missing /history/stats endpoint)
  const hasRecords = (s.total_records || 0) > 0 || total > 0;

  return (
    <div style={{ fontFamily:"'Fraunces',Georgia,serif",background:"#F6F5F0",
      minHeight:"100vh",padding:"28px 32px 60px",maxWidth:1200 }}>
      <style>{`
        *{box-sizing:border-box}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        @keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @media(max-width:768px){
          .hist-grid3{grid-template-columns:1fr!important}
          .hist-stats{grid-template-columns:repeat(2,1fr)!important}
          .hist-header{flex-direction:column!important}
        }
        /* Suppress WP admin bar Minimize button */
        button[value="Minimize"]{display:none!important}
        .hist-clear-btn:hover{background:#FEF2F2!important;border-color:#FCA5A5!important}
        .hist-tab-btn:hover{background:#F6F5F0!important;color:#1a1a2e!important}
        .hist-stat-card:hover{border-color:#D0CEC6!important;transform:translateY(-1px)}
        .hist-stat-card{transition:all .15s}
      `}</style>

      {/* Toast notification */}
      {toast && (
        <div style={{ position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",
          fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:500,
          background: toast.startsWith("✗") ? "#991B1B" : "#1a1a2e",
          color: toast.startsWith("✗") ? "#fff" : "#D4A017",
          padding:"10px 22px",borderRadius:99,zIndex:9999,
          animation:"slideUp .25s ease",whiteSpace:"nowrap",
          boxShadow:"0 8px 24px rgba(0,0,0,.18)" }}>
          {toast}
        </div>
      )}

      {/* Help guide modal — #30 */}
      {showHelp && <HelpGuideModal onClose={()=>setShowHelp(false)} />}

      {/* Clear-all confirmation modal — #27 */}
      {showClearAll && (
        <ClearAllModal
          recordCount={s.total_records||0}
          onConfirm={handleClearAll}
          onCancel={()=>setShowClearAll(false)}
        />
      )}

      {/* Scope confirmation before import — #16 */}
      {showConfirm && filePreview && (
        <ImportConfirmModal
          preview={filePreview}
          importMode={importMode}
          onConfirm={runImport}
          onCancel={()=>setShowConfirm(false)}
        />
      )}

      {/* Header — #25 clearer title, #28 plain English subtitle */}
      <div className="hist-header" style={{ display:"flex",justifyContent:"space-between",
        alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12 }}>
        <div>
          <div style={{ display:"inline-block",fontFamily:"'DM Mono',monospace",fontSize:10,
            fontWeight:500,letterSpacing:".1em",textTransform:"uppercase",
            background:"#1a1a2e",color:"#D4A017",padding:"3px 12px",borderRadius:99,marginBottom:8 }}>
            Historical import
          </div>
          {/* #25 — renamed title */}
          <h1 style={{ fontFamily:"'Fraunces',serif",fontSize:28,fontWeight:700,
            color:"#1a1a2e",margin:"0 0 4px",letterSpacing:"-.5px" }}>
            Load Prior Season Records
          </h1>
          {/* #28 — plain English subtitle */}
          <p style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#999",margin:"0 0 2px" }}>
            Import CSV files so the system can flag tier mismatches and pre-fill returning player data for the 2027 draft.
          </p>
          {/* #30 — help link opens modal */}
          <a href="#" onClick={e=>{e.preventDefault();setShowHelp(true);}}
            style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#1a1a2e",
            textDecoration:"underline" }}>
            Need help? See the import guide →
          </a>
        </div>
      </div>

      {/* Undo banner — #8 */}
      {undoJobId && undoTimer !== null && (
        <div style={{ background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:10,
          padding:"12px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:12 }}>
          <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#92400E",flex:1 }}>
            ↩ Import can be undone for {Math.floor(undoTimer/60)}:{String(undoTimer%60).padStart(2,"0")}
          </span>
          <button onClick={()=>handleUndo(undoJobId)} style={{ fontFamily:"'DM Mono',monospace",
            fontSize:11,background:"#92400E",color:"#fff",border:"none",
            padding:"5px 14px",borderRadius:6,cursor:"pointer" }}>
            Undo last import
          </button>
          <button onClick={()=>{setUndoJobId(null);setUndoTimer(null);}} style={{
            background:"transparent",border:"none",color:"#aaa",fontSize:14,cursor:"pointer" }}>✕</button>
        </div>
      )}

      {/* Stats bar — #1 empty state OR clickable chips — #17 */}
      {!hasRecords ? (
        <div style={{ background:"#fff",border:"1px dashed #E8E6DF",borderRadius:12,
          padding:"24px",textAlign:"center",marginBottom:20 }}>
          <div style={{ fontSize:32,marginBottom:8 }}>🏒</div>
          <p style={{ fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,color:"#1a1a2e",margin:"0 0 4px" }}>
            No history imported yet
          </p>
          <p style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#aaa",margin:0 }}>
            Follow Step 1 below to download the template and get started.
          </p>
        </div>
      ) : (
        <div className="hist-stats" style={{ display:"grid",
          gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:20 }}>
          {[
            { label:"Total records",    val:s.total_records||0, color:"#1a1a2e", href:null },
            { label:"Past champions",   val:s.champions||0,     color:"#92400E", href:`/wp-admin/admin.php?page=grsh-tm-history&filter=champions` },
            { label:"Sandbagging flags",val:s.sandbagging||0,   color:"#991B1B", href:`/wp-admin/admin.php?page=grsh-tm-history&filter=sandbagging` },
            { label:"No-show flags",    val:s.no_shows||0,      color:"#7A4518", href:`/wp-admin/admin.php?page=grsh-tm-history&filter=noshows` },
            { label:"Seasons on record",val:s.seasons?.length||0,color:"#1a1a2e",href:null },
          ].map(chip => (
            chip.href ? (
              <a key={chip.label} href={chip.href} style={{ textDecoration:"none" }}>
                <div style={{ background:"#fff",border:"1px solid #E8E6DF",borderRadius:10,
                  padding:"14px 16px",cursor:"pointer",transition:"border-color .15s" }}>
                  <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",
                    textTransform:"uppercase",letterSpacing:".07em",margin:"0 0 6px" }}>{chip.label}</div>
                  <div style={{ fontFamily:"'Fraunces',serif",fontSize:28,fontWeight:700,
                    color:chip.color,lineHeight:1 }}>{chip.val}</div>
                  <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",marginTop:4 }}>
                    View in History →
                  </div>
                </div>
              </a>
            ) : (
              <div key={chip.label} className="hist-stat-card" style={{ background:"#fff",border:"1px solid #E8E6DF",
                borderRadius:10,padding:"14px 16px" }}>
                <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",
                  textTransform:"uppercase",letterSpacing:".07em",margin:"0 0 6px" }}>{chip.label}</div>
                <div style={{ fontFamily:"'Fraunces',serif",fontSize:28,fontWeight:700,
                  color:chip.color,lineHeight:1 }}>{chip.val}</div>
              </div>
            )
          ))}
        </div>
      )}

      {/* Tabs — #14 renamed, live record count from state */}
      <div style={{ display:"flex",gap:6,marginBottom:16 }}>
        {[
          { key:"import",  label:"Import CSV" },
          { key:"records", label:`Imported Records${total>0?" · "+total.toLocaleString():""}` },
          { key:"log",     label:`Import Log${importLog.length>0?" · "+importLog.length:""}` },
        ].map(t => (
          <button key={t.key} onClick={()=>setTab(t.key)}
            className="hist-tab-btn"
            style={{
              fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:500,
              padding:"8px 16px",borderRadius:8,cursor:"pointer",transition:"all .15s",
              background:tab===t.key?"#1a1a2e":"transparent",
              color:tab===t.key?"#D4A017":"#888",
              border:`1px solid ${tab===t.key?"#1a1a2e":"#E8E6DF"}`,
            }}>{t.label}</button>
        ))}
      </div>

      {/* ── IMPORT TAB ───────────────────────────────────────────────────── */}
      {tab === "import" && (
        <div style={{ display:"flex",flexDirection:"column",gap:16 }}>

          {/* Step cards — #2 download button inside step 1, #21 connectors, #23 honest timing */}
          <div style={{ background:"#fff",border:"1px solid #E8E6DF",borderRadius:12,padding:"18px 20px" }}>
            <p style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",
              textTransform:"uppercase",letterSpacing:".08em",margin:"0 0 14px" }}>
              How to import
            </p>
            <div className="hist-grid3" style={{ display:"grid",gridTemplateColumns:"1fr auto 1fr auto 1fr",gap:0 }}>
              {[
                {
                  step:"1",title:"Download the template",
                  body:"Get the CSV template with example rows for the correct format.",
                  action: <button onClick={downloadTemplate} style={{
                    fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,
                    background:"#1a1a2e",color:"#D4A017",border:"none",
                    padding:"6px 14px",borderRadius:6,cursor:"pointer",marginTop:10 }}>
                    ↓ Download template
                  </button>
                },
                {
                  step:"2",title:"Fill in your data",
                  body:"One row per player per season. Typically takes under a minute for a full season.",
                  action: <button onClick={()=>setShowSample(s=>!s)} style={{
                    fontFamily:"'DM Mono',monospace",fontSize:10,
                    background:"transparent",border:"1px solid #E8E6DF",color:"#888",
                    padding:"4px 10px",borderRadius:6,cursor:"pointer",marginTop:10 }}>
                    {showSample?"Hide":"Show"} example rows
                  </button>
                },
                {
                  step:"3",title:"Upload and import",
                  body:"Drop your completed CSV on the drop zone below. A preview appears before anything is written.",
                  action:null
                },
              ].map((s,i) => (
                <>
                  <div key={s.step} style={{ background:"#F6F5F0",borderRadius:8,padding:"14px",
                    minWidth:0 }}>
                    <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:8 }}>
                      <div style={{ width:24,height:24,borderRadius:"50%",background:"#1a1a2e",
                        color:"#D4A017",display:"flex",alignItems:"center",justifyContent:"center",
                        fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:600,flexShrink:0 }}>{s.step}</div>
                      <p style={{ fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:700,color:"#1a1a2e",margin:0 }}>{s.title}</p>
                    </div>
                    <p style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#888",margin:0,lineHeight:1.5 }}>{s.body}</p>
                    {s.action}
                  </div>
                  {/* #21 — connector arrows */}
                  {i < 2 && (
                    <div key={`arr-${i}`} style={{ display:"flex",alignItems:"center",justifyContent:"center",
                      padding:"0 8px",color:"#D0CEC6",fontSize:20,paddingTop:8 }}>→</div>
                  )}
                </>
              ))}
            </div>
          </div>

          {/* Sample data inline — #13 */}
          {showSample && (
            <div style={{ background:"#fff",border:"1px solid #E8E6DF",borderRadius:12,padding:"18px 20px",overflowX:"auto" }}>
              <p style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",
                textTransform:"uppercase",letterSpacing:".08em",margin:"0 0 10px" }}>
                Sample data — 2 example rows
              </p>
              <table style={{ borderCollapse:"collapse",fontSize:10,minWidth:600 }}>
                <thead>
                  <tr>
                    {Object.keys(SAMPLE_ROWS[0]).map(h=>(
                      <th key={h} style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",
                        textTransform:"uppercase",padding:"4px 8px",textAlign:"left",
                        background:"#FAFAF8",borderBottom:"1px solid #E8E6DF",whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SAMPLE_ROWS.map((row,i)=>(
                    <tr key={i} style={{ borderBottom:"1px solid #F3F2ED" }}>
                      {Object.values(row).map((v,j)=>(
                        <td key={j} style={{ fontFamily:"'DM Mono',monospace",fontSize:10,
                          color:"#555",padding:"5px 8px",whiteSpace:"nowrap" }}>{String(v)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Column schema reference — #11 */}
          <div style={{ background:"#fff",border:"1px solid #E8E6DF",borderRadius:12,overflow:"hidden" }}>
            <button onClick={()=>setShowSchema(s=>!s)}
              style={{ width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"14px 18px",background:"transparent",border:"none",cursor:"pointer",textAlign:"left" }}>
              <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",
                textTransform:"uppercase",letterSpacing:".08em" }}>Column schema reference</span>
              <span style={{ fontSize:12,color:"#aaa" }}>{showSchema?"▲":"▼"}</span>
            </button>
            {showSchema && (
              <div style={{ borderTop:"1px solid #F0EEE8",overflowX:"auto" }}>
                <table style={{ width:"100%",borderCollapse:"collapse" }}>
                  <thead>
                    <tr>
                      {["Column","Required","Type","Example"].map(h=>(
                        <th key={h} style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",
                          textTransform:"uppercase",padding:"8px 12px",textAlign:"left",
                          background:"#FAFAF8",borderBottom:"1px solid #E8E6DF" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SCHEMA.map(col=>(
                      <tr key={col.col} style={{ borderBottom:"1px solid #F3F2ED" }}>
                        <td style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#1a1a2e",
                          fontWeight:500,padding:"7px 12px" }}>{col.col}</td>
                        <td style={{ padding:"7px 12px" }}>
                          {col.req
                            ? <Pill bg="#E6F4EA" color="#1E6B3A" small>Required</Pill>
                            : <Pill bg="#F3F4F6" color="#888" small>Optional</Pill>}
                        </td>
                        <td style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#888",padding:"7px 12px" }}>{col.type}</td>
                        <td style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#555",padding:"7px 12px" }}>{col.example}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Valid values inline — #12 */}
                <div style={{ padding:"14px 18px",borderTop:"1px solid #F0EEE8",
                  display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }}>
                  <div>
                    <p style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",
                      textTransform:"uppercase",margin:"0 0 6px" }}>division_played valid values</p>
                    <div style={{ display:"flex",gap:4,flexWrap:"wrap" }}>
                      {Object.entries(DIVISION_LABEL).map(([k,v])=>{
                        const dc=DIVISION_COLOR[k]||{};
                        return <Pill key={k} bg={dc.bg} color={dc.color} border={dc.border} small>{k}</Pill>;
                      })}
                    </div>
                  </div>
                  <div>
                    <p style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",
                      textTransform:"uppercase",margin:"0 0 6px" }}>championship_result valid values</p>
                    <div style={{ display:"flex",gap:4,flexWrap:"wrap" }}>
                      {Object.entries(CHAMP_STYLE).map(([k,v])=>(
                        <span key={k} style={{ fontFamily:"'DM Mono',monospace",fontSize:10,
                          background:v.bg,color:v.color,padding:"2px 7px",borderRadius:99 }}>{k}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",
                      textTransform:"uppercase",margin:"0 0 6px" }}>boolean fields</p>
                    <p style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#555",margin:0 }}>
                      1 or 0 &nbsp;·&nbsp; yes / no &nbsp;·&nbsp; true / false
                    </p>
                  </div>
                  <div>
                    <p style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",
                      textTransform:"uppercase",margin:"0 0 6px" }}>season_year</p>
                    <p style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#555",margin:0 }}>
                      4-digit year — e.g. 2024, 2025, 2026
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Import area — progress / preview / dropzone */}
          {importStep >= 0 ? (
            <div style={{ background:"#fff",border:"1px solid #E8E6DF",borderRadius:12,overflow:"hidden" }}>
              <ImportProgress step={importStep} />
            </div>
          ) : selectedFile && filePreview ? (
            <FilePreview
              file={selectedFile}
              preview={filePreview}
              colMap={colMap}
              setColMap={setColMap}
              importMode={importMode}
              setImportMode={setImportMode}
              onConfirm={()=>setShowConfirm(true)}
              onCancel={()=>{ setSelectedFile(null); setFilePreview(null); }}
            />
          ) : (
            <DropZone onFile={handleFileSelect} fileRef={fileRef} />
          )}

          {/* Import result — #6 #7 */}
          {result && (
            <ImportResult
              result={result}
              onViewRecords={()=>setTab("records")}
              onUndo={()=>undoJobId&&handleUndo(undoJobId)}
              canUndo={!!undoJobId}
            />
          )}
        </div>
      )}

      {/* ── RECORDS TAB — #22 filters ────────────────────────────────────── */}
      {tab === "records" && (
        <div>
          <div style={{ display:"flex",gap:10,marginBottom:12,flexWrap:"wrap",
            background:"#fff",border:"1px solid #E8E6DF",borderRadius:10,padding:"12px 14px" }}>
            {[
              { label:"Season", val:filterYear, set:(v)=>{setFilterYear(v);setPage(1);},
                opts:((s.seasons||[]).map(y=>({value:y,label:String(y)}))) },
              { label:"Division",val:filterDiv,  set:(v)=>{setFilterDiv(v);setPage(1);},
                opts:Object.entries(DIVISION_LABEL).map(([k,v])=>({value:k,label:v})) },
              { label:"Import job",val:filterJobId,set:(v)=>{setFilterJobId(v);setPage(1);},
                opts:importLog.map(j=>({value:j.id,label:`${j.timestamp} — ${j.filename}`})) },
            ].map(f=>(
              <div key={f.label} style={{ display:"flex",flexDirection:"column",gap:4 }}>
                <label style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",
                  textTransform:"uppercase",letterSpacing:".07em" }}>{f.label}</label>
                <select value={f.val} onChange={e=>f.set(e.target.value)} style={{
                  fontFamily:"'DM Mono',monospace",fontSize:12,background:"#F6F5F0",
                  border:"1px solid #E8E6DF",borderRadius:6,padding:"6px 10px",
                  color:"#333",outline:"none",minWidth:130 }}>
                  <option value="">All</option>
                  {f.opts.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            ))}
            {/* Clear all — #27 */}
            {hasRecords && (
              <div style={{ display:"flex",flexDirection:"column",justifyContent:"flex-end",marginLeft:"auto" }}>
                <button
                  className="hist-clear-btn"
                  onClick={()=>setShowClearAll(true)}
                  disabled={deleting==="all"}
                  style={{ fontFamily:"'DM Mono',monospace",
                    fontSize:11,background:"transparent",border:"1px solid #FCA5A5",color:"#DC2626",
                    padding:"6px 14px",borderRadius:6,cursor:deleting?"not-allowed":"pointer",
                    display:"flex",alignItems:"center",gap:6,opacity:deleting?0.6:1,
                    transition:"all .15s" }}>
                  {deleting==="all"
                    ? <><span style={{ display:"inline-block",width:10,height:10,border:"1.5px solid #DC2626",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.7s linear infinite" }}></span> Deleting…</>
                    : <><span style={{ fontSize:13 }}>🗑</span> Clear all history</>
                  }
                </button>
              </div>
            )}
          </div>

          {/* Records table */}
          <div style={{ background:"#fff",border:"1px solid #E8E6DF",borderRadius:10,overflow:"hidden" }}>
            <table style={{ width:"100%",borderCollapse:"collapse" }}>
              <thead>
                <tr>
                  {["Player","Season","Division","Team","Result","Tier","Attendance","Flags"].map(h=>(
                    <th key={h} style={{ fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:500,
                      color:"#888",textTransform:"uppercase",letterSpacing:".07em",
                      padding:"10px 12px",textAlign:"left",borderBottom:"1px solid #E8E6DF",
                      background:"#FAFAF8",whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding:"52px 24px",textAlign:"center" }}>
                    <div style={{ fontSize:28,marginBottom:8 }}>🏒</div>
                    <p style={{ fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,
                      color:"#1a1a2e",margin:"0 0 6px" }}>
                      {total===0?"No imported records yet":"No records match these filters"}
                    </p>
                    <p style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#aaa",margin:0 }}>
                      {total===0?"Go to Import CSV to load your first season.":"Try changing the filters above."}
                    </p>
                  </td></tr>
                ) : records.map(r=>{
                  const dc    = DIVISION_COLOR[r.division_played]||{};
                  const champ = CHAMP_STYLE[r.championship_result]||CHAMP_STYLE.none;
                  const attend= r.games_scheduled>0 ? Math.round(r.games_attended/r.games_scheduled*100) : null;
                  const initials=`${r.first_name[0]}${r.last_name[0]}`;
                  return (
                    <tr key={r.id} style={{ borderBottom:"1px solid #F3F2ED" }}>
                      <td style={{ padding:"10px 12px",verticalAlign:"middle" }}>
                        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                          <div style={{ width:28,height:28,borderRadius:"50%",background:"#1a1a2e",
                            color:"#D4A017",display:"flex",alignItems:"center",justifyContent:"center",
                            fontFamily:"'DM Mono',monospace",fontSize:9,fontWeight:500,flexShrink:0 }}>{initials}</div>
                          <div>
                            <p style={{ fontFamily:"'Fraunces',serif",fontSize:12,fontWeight:600,color:"#1a1a2e",margin:0 }}>
                              {r.first_name} {r.last_name}
                            </p>
                            <p style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#bbb",margin:0 }}>{r.email}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding:"10px 12px",verticalAlign:"middle" }}>
                        <span style={{ fontFamily:"'Fraunces',serif",fontSize:14,fontWeight:700,color:"#1a1a2e" }}>{r.season_year}</span>
                      </td>
                      <td style={{ padding:"10px 12px",verticalAlign:"middle" }}>
                        <Pill bg={dc.bg} color={dc.color} border={dc.border} small>{DIVISION_LABEL[r.division_played]||r.division_played}</Pill>
                      </td>
                      <td style={{ padding:"10px 12px",verticalAlign:"middle" }}>
                        <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#555" }}>{r.team_name||"—"}</span>
                      </td>
                      <td style={{ padding:"10px 12px",verticalAlign:"middle" }}>
                        <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,
                          background:champ.bg,color:champ.color,padding:"2px 7px",borderRadius:99 }}>
                          {champ.icon} {champ.label}
                        </span>
                      </td>
                      <td style={{ padding:"10px 12px",verticalAlign:"middle" }}>
                        {r.skill_tier_reported
                          ? <Pill bg="#E8F0FE" color="#1A3F8F" small>{r.skill_tier_reported}</Pill>
                          : <span style={{ color:"#ccc" }}>—</span>}
                      </td>
                      <td style={{ padding:"10px 12px",verticalAlign:"middle" }}>
                        {attend!==null ? (
                          <div>
                            <div style={{ height:3,width:60,background:"#F0EEE8",borderRadius:99,overflow:"hidden",marginBottom:3 }}>
                              <div style={{ height:"100%",width:`${attend}%`,background:attend<80?"#DC2626":"#166534",borderRadius:99 }} />
                            </div>
                            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:attend<80?"#DC2626":"#666" }}>
                              {r.games_attended}/{r.games_scheduled}
                            </span>
                          </div>
                        ) : <span style={{ color:"#ccc" }}>—</span>}
                      </td>
                      <td style={{ padding:"10px 12px",verticalAlign:"middle" }}>
                        <div style={{ display:"flex",gap:3,flexWrap:"wrap" }}>
                          {r.was_captain==1 && <Pill bg="#1a1a2e" color="#D4A017" small>Captain</Pill>}
                          {r.was_alternate==1 && <Pill bg="#EDE9FE" color="#4C1D95" small>Sub</Pill>}
                          {r.sandbagging_flag==1 && <Pill bg="#FEF2F2" color="#991B1B" small>⚠ Sandbagging</Pill>}
                          {r.no_show_count>0 && <Pill bg="#FEF3C7" color="#92400E" small>🚫 {r.no_show_count} no-show{r.no_show_count>1?"s":""}</Pill>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination — #22 */}
          {totalPages > 1 && (
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12 }}>
              <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#aaa" }}>
                Page {page} of {totalPages} · {total} records
              </span>
              <div style={{ display:"flex",gap:6 }}>
                <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}
                  style={{ fontFamily:"'DM Mono',monospace",fontSize:11,background:"#fff",
                    border:"1px solid #E8E6DF",color:"#555",padding:"6px 12px",
                    borderRadius:6,cursor:"pointer" }}>← Prev</button>
                <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}
                  style={{ fontFamily:"'DM Mono',monospace",fontSize:11,background:"#fff",
                    border:"1px solid #E8E6DF",color:"#555",padding:"6px 12px",
                    borderRadius:6,cursor:"pointer" }}>Next →</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── IMPORT LOG TAB — #3 #20 ──────────────────────────────────────── */}
      {tab === "log" && (
        <div>
          <p style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#aaa",marginBottom:12 }}>
            Every import run is recorded here with the user, file, and row counts.
          </p>
          {importLog.length === 0 ? (
            <div style={{ background:"#fff",border:"1px solid #E8E6DF",borderRadius:12,
              padding:"48px 24px",textAlign:"center" }}>
              <div style={{ fontSize:28,marginBottom:8 }}>📋</div>
              <p style={{ fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,color:"#1a1a2e",margin:"0 0 4px" }}>
                No imports yet
              </p>
              <p style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#aaa",margin:0 }}>
                Import log entries will appear here after your first CSV upload.
              </p>
            </div>
          ) : importLog.map(job => (
            <ImportLogEntry key={job.id} job={job} onUndo={handleUndo} />
          ))}
        </div>
      )}

    </div>
  );
}
