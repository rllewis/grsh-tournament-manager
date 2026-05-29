import { useState } from "react";

const API   = window.grshConfig?.apiUrl || "/wp-json/grsh/v1";
const NONCE = window.grshConfig?.nonce  || "";

const DEFAULT_SETTINGS = {
  season_year: 2027, form_id: 5047, season_label: "Gold Rush 2027",
  registration_opens: "2026-12-01", registration_closes: "2027-02-28",
  draft_date: "2027-03-15", status: "open",
  timer_enabled: true, timer_seconds: 90,
  divisions: [
    { key:"gold_open", label:"Gold Open",  enabled:true, teams:4, min_roster:8, max_roster:12, goalie_min:1, goalie_max:2 },
    { key:"45a",       label:"45A",        enabled:true, teams:3, min_roster:7, max_roster:11, goalie_min:1, goalie_max:2 },
    { key:"senior_b",  label:"Senior B",   enabled:true, teams:3, min_roster:7, max_roster:11, goalie_min:1, goalie_max:2 },
    { key:"senior_c",  label:"Senior C",   enabled:true, teams:2, min_roster:8, max_roster:12, goalie_min:1, goalie_max:2 },
    { key:"womens",    label:"Womens",     enabled:false, teams:2, min_roster:8, max_roster:12, goalie_min:1, goalie_max:2 },
  ],
  email_registration: true, email_roster: true, email_payment: true, email_alternate: true,
  public_rosters: false,
  sandbagging_auto_flag: true,
};

const STATUS_OPTIONS = ["setup","open","draft","locked","complete"];

function Toggle({ value, onChange, label, sub }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 0", borderBottom:"1px solid #F6F5F0" }}>
      <div>
        <p style={{ fontFamily:"'Fraunces',serif", fontSize:13, fontWeight:600, color:"#1a1a2e", margin:"0 0 2px" }}>{label}</p>
        {sub && <p style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#aaa", margin:0 }}>{sub}</p>}
      </div>
      <div
        onClick={() => onChange(!value)}
        style={{
          width:44, height:24, borderRadius:99, background:value?"#1a1a2e":"#E8E6DF",
          cursor:"pointer", position:"relative", transition:"background .2s", flexShrink:0,
        }}
      >
        <div style={{
          position:"absolute", top:3, left:value?20:3, width:18, height:18,
          borderRadius:"50%", background:"#fff",
          transition:"left .2s", boxShadow:"0 1px 4px rgba(0,0,0,.2)",
        }} />
      </div>
    </div>
  );
}

function FieldGroup({ label, children }) {
  return (
    <div style={styles.fieldGroup}>
      <p style={styles.fieldGroupLabel}>{label}</p>
      {children}
    </div>
  );
}

export default function Settings() {
  const [cfg, setCfg] = useState(DEFAULT_SETTINGS);
  const [saved, setSaved]       = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [activeTab, setActiveTab] = useState("season");

  const set = (key, val) => setCfg(c => ({ ...c, [key]:val }));
  const setDiv = (idx, key, val) => setCfg(c => ({
    ...c,
    divisions: c.divisions.map((d, i) => i===idx ? { ...d, [key]:val } : d),
  }));

  const handleSave = async () => {
    setSaveError(false);
    try {
      const res = await fetch(`${API}/settings`, {
        method: "POST",
        headers: { "X-WP-Nonce": NONCE, "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        setSaveError(true);
        setTimeout(() => setSaveError(false), 3000);
      }
    } catch (e) {
      setSaveError(true);
      setTimeout(() => setSaveError(false), 3000);
    }
  };

  return (
    <div style={styles.root}>

      <div style={styles.header}>
        <div>
          <div style={styles.seasonPill}>Admin</div>
          <h1 style={styles.title}>Settings</h1>
          <p style={styles.subtitle}>Season configuration · divisions · email · permissions</p>
        </div>
        <button
          onClick={handleSave}
          style={{
            ...styles.saveBtn,
            background: saved ? "#166534" : saveError ? "#991B1B" : "#1a1a2e",
            color: saved || saveError ? "#fff" : "#D4A017",
          }}
        >
          {saved ? "✓ Saved" : saveError ? "✗ Save failed — backend not connected" : "Save settings"}
        </button>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {[
          { key:"season",    label:"Season" },
          { key:"divisions", label:"Divisions" },
          { key:"draft",     label:"Draft" },
          { key:"email",     label:"Email" },
          { key:"access",    label:"Access" },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            ...styles.tab,
            background: activeTab===t.key ? "#1a1a2e" : "transparent",
            color:      activeTab===t.key ? "#D4A017"  : "#888",
            border:     `1px solid ${activeTab===t.key ? "#1a1a2e" : "#E8E6DF"}`,
          }}>{t.label}</button>
        ))}
      </div>

      {/* Season tab */}
      {activeTab === "season" && (
        <div style={styles.settingsCard}>
          <FieldGroup label="Season details">
            <div style={styles.formGrid}>
              <div>
                <label style={styles.label}>Season year</label>
                <input value={cfg.season_year} onChange={e => set("season_year", e.target.value)} style={styles.input} type="number" />
              </div>
              <div>
                <label style={styles.label}>Season label</label>
                <input value={cfg.season_label} onChange={e => set("season_label", e.target.value)} style={styles.input} />
              </div>
              <div>
                <label style={styles.label}>WPForms form ID</label>
                <input value={cfg.form_id} onChange={e => set("form_id", e.target.value)} style={styles.input} type="number" />
              </div>
              <div>
                <label style={styles.label}>Season status</label>
                <select value={cfg.status} onChange={e => set("status", e.target.value)} style={styles.select}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                </select>
              </div>
            </div>
          </FieldGroup>
          <FieldGroup label="Dates">
            <div style={styles.formGrid}>
              <div>
                <label style={styles.label}>Registration opens</label>
                <input type="date" value={cfg.registration_opens} onChange={e => set("registration_opens", e.target.value)} style={styles.input} />
              </div>
              <div>
                <label style={styles.label}>Registration closes</label>
                <input type="date" value={cfg.registration_closes} onChange={e => set("registration_closes", e.target.value)} style={styles.input} />
              </div>
              <div>
                <label style={styles.label}>Draft date</label>
                <input type="date" value={cfg.draft_date} onChange={e => set("draft_date", e.target.value)} style={styles.input} />
              </div>
            </div>
          </FieldGroup>
          <FieldGroup label="Intelligence">
            <Toggle value={cfg.sandbagging_auto_flag} onChange={v => set("sandbagging_auto_flag", v)}
              label="Auto-flag sandbagging" sub="Flag players whose registered tier doesn't match their prior division history" />
          </FieldGroup>
        </div>
      )}

      {/* Divisions tab */}
      {activeTab === "divisions" && (
        <div style={styles.settingsCard}>
          {cfg.divisions.map((div, idx) => (
            <div key={div.key} style={{ padding:"16px 22px", borderBottom:"1px solid #F6F5F0", opacity:div.enabled?1:.5 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:div.enabled?14:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontFamily:"'Fraunces',serif", fontSize:15, fontWeight:700, color:"#1a1a2e" }}>{div.label}</span>
                  {!div.enabled && <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#bbb" }}>disabled</span>}
                </div>
                <Toggle value={div.enabled} onChange={v => setDiv(idx,"enabled",v)} label="" />
              </div>
              {div.enabled && (
                <div style={styles.formGrid}>
                  <div>
                    <label style={styles.label}>Number of teams</label>
                    <input type="number" value={div.teams} onChange={e => setDiv(idx,"teams",parseInt(e.target.value))} style={styles.input} min={1} max={8} />
                  </div>
                  <div>
                    <label style={styles.label}>Min roster size</label>
                    <input type="number" value={div.min_roster} onChange={e => setDiv(idx,"min_roster",parseInt(e.target.value))} style={styles.input} min={4} />
                  </div>
                  <div>
                    <label style={styles.label}>Max roster size</label>
                    <input type="number" value={div.max_roster} onChange={e => setDiv(idx,"max_roster",parseInt(e.target.value))} style={styles.input} min={4} />
                  </div>
                  <div>
                    <label style={styles.label}>Min goalies</label>
                    <input type="number" value={div.goalie_min} onChange={e => setDiv(idx,"goalie_min",parseInt(e.target.value))} style={styles.input} min={1} />
                  </div>
                  <div>
                    <label style={styles.label}>Max goalies</label>
                    <input type="number" value={div.goalie_max} onChange={e => setDiv(idx,"goalie_max",parseInt(e.target.value))} style={styles.input} min={1} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Draft tab */}
      {activeTab === "draft" && (
        <div style={styles.settingsCard}>
          <FieldGroup label="Timer">
            <Toggle value={cfg.timer_enabled} onChange={v => set("timer_enabled", v)}
              label="Enable draft timer" sub="Countdown clock shown during each pick — pauses on timeout" />
            {cfg.timer_enabled && (
              <div style={{ marginTop:14 }}>
                <label style={styles.label}>Timer duration (seconds)</label>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <input type="range" min={30} max={180} step={10}
                    value={cfg.timer_seconds} onChange={e => set("timer_seconds", parseInt(e.target.value))}
                    style={{ flex:1 }}
                  />
                  <span style={{ fontFamily:"'Fraunces',serif", fontSize:20, fontWeight:700, color:"#1a1a2e", minWidth:40 }}>{cfg.timer_seconds}s</span>
                </div>
              </div>
            )}
          </FieldGroup>
          <FieldGroup label="Draft format">
            <div style={styles.formGrid}>
              <div>
                <label style={styles.label}>Draft type</label>
                <select style={styles.select}><option>Snake draft</option><option>Linear draft</option><option>Auto-balance</option></select>
              </div>
              <div>
                <label style={styles.label}>Draft order</label>
                <select style={styles.select}><option>Random</option><option>Weighted (prior season)</option><option>Lottery</option><option>Manual</option></select>
              </div>
            </div>
          </FieldGroup>
        </div>
      )}

      {/* Email tab */}
      {activeTab === "email" && (
        <div style={styles.settingsCard}>
          <FieldGroup label="Automated emails">
            <Toggle value={cfg.email_registration} onChange={v => set("email_registration",v)}
              label="Registration confirmation" sub="Send immediately when a player submits the registration form" />
            <Toggle value={cfg.email_roster} onChange={v => set("email_roster",v)}
              label="Roster finalized" sub="Send to all players and captains when rosters are published" />
            <Toggle value={cfg.email_payment} onChange={v => set("email_payment",v)}
              label="Payment reminder" sub="Send to unpaid players 7 days after registration" />
            <Toggle value={cfg.email_alternate} onChange={v => set("email_alternate",v)}
              label="Alternate activation" sub="Notify sub and team captain when a sub is activated" />
          </FieldGroup>
          <FieldGroup label="Sender details">
            <div style={styles.formGrid}>
              <div>
                <label style={styles.label}>From name</label>
                <input defaultValue="Gold Rush Tournament" style={styles.input} />
              </div>
              <div>
                <label style={styles.label}>From email</label>
                <input defaultValue="tournament@goldrush.ca" style={styles.input} type="email" />
              </div>
            </div>
          </FieldGroup>
        </div>
      )}

      {/* Access tab */}
      {activeTab === "access" && (
        <div style={styles.settingsCard}>
          <FieldGroup label="Visibility">
            <Toggle value={cfg.public_rosters} onChange={v => set("public_rosters",v)}
              label="Public roster pages" sub="Allow players to view rosters without logging in" />
          </FieldGroup>
          <FieldGroup label="User roles">
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr>
                    {["Role","Sync import","Edit roster","Run draft","Send email","View reports"].map(h => (
                      <th key={h} style={styles.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { role:"Super Admin",       sync:true,  edit:true,  draft:true,  email:true,  reports:true  },
                    { role:"Committee",         sync:true,  edit:true,  draft:true,  email:true,  reports:true  },
                    { role:"Captain",           sync:false, edit:false, draft:false, email:false, reports:false },
                    { role:"Read Only",         sync:false, edit:false, draft:false, email:false, reports:true  },
                  ].map(r => (
                    <tr key={r.role} style={{ borderBottom:"1px solid #F3F2ED" }}>
                      <td style={styles.td}><span style={{ fontFamily:"'Fraunces',serif", fontSize:13, fontWeight:600, color:"#1a1a2e" }}>{r.role}</span></td>
                      {[r.sync,r.edit,r.draft,r.email,r.reports].map((v,i) => (
                        <td key={i} style={{ ...styles.td, textAlign:"center" }}>
                          <span style={{ fontSize:14 }}>{v ? "✓" : "—"}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </FieldGroup>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap');
        *{box-sizing:border-box}
        input[type=range]{accent-color:#1a1a2e}
      `}</style>
    </div>
  );
}

const styles = {
  root:{ fontFamily:"'Fraunces',Georgia,serif", background:"#F6F5F0", minHeight:"100vh", padding:"28px 32px 60px", maxWidth:1000 },
  header:{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12 },
  seasonPill:{ display:"inline-block", fontFamily:"'DM Mono',monospace", fontSize:10, fontWeight:500, letterSpacing:".1em", textTransform:"uppercase", background:"#1a1a2e", color:"#D4A017", padding:"3px 12px", borderRadius:99, marginBottom:8 },
  title:{ fontFamily:"'Fraunces',serif", fontSize:28, fontWeight:700, color:"#1a1a2e", margin:"0 0 3px", letterSpacing:"-.5px" },
  subtitle:{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#999", margin:0 },
  saveBtn:{ fontFamily:"'DM Mono',monospace", fontSize:12, fontWeight:500, border:"none", padding:"9px 20px", borderRadius:8, cursor:"pointer", transition:"background .3s, color .3s" },
  tabs:{ display:"flex", gap:6, marginBottom:18, flexWrap:"wrap" },
  tab:{ fontFamily:"'DM Mono',monospace", fontSize:12, fontWeight:500, padding:"8px 16px", borderRadius:8, cursor:"pointer", transition:"all .15s" },
  settingsCard:{ background:"#fff", border:"1px solid #E8E6DF", borderRadius:12, overflow:"hidden" },
  fieldGroup:{ padding:"18px 22px", borderBottom:"1px solid #F6F5F0" },
  fieldGroupLabel:{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#aaa", textTransform:"uppercase", letterSpacing:".08em", margin:"0 0 14px" },
  formGrid:{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:14 },
  label:{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#888", textTransform:"uppercase", letterSpacing:".07em", display:"block", marginBottom:6 },
  input:{ fontFamily:"'DM Mono',monospace", fontSize:12, width:"100%", background:"#F6F5F0", border:"1px solid #E8E6DF", borderRadius:6, padding:"7px 10px", color:"#333", outline:"none" },
  select:{ fontFamily:"'DM Mono',monospace", fontSize:12, width:"100%", background:"#F6F5F0", border:"1px solid #E8E6DF", borderRadius:6, padding:"7px 10px", color:"#333", outline:"none" },
  th:{ fontFamily:"'DM Mono',monospace", fontSize:10, fontWeight:500, color:"#888", textTransform:"uppercase", letterSpacing:".07em", padding:"10px 14px", textAlign:"left", borderBottom:"1px solid #E8E6DF", background:"#FAFAF8" },
  td:{ padding:"11px 14px", verticalAlign:"middle" },
};
