import React, { useState, useMemo, useEffect } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const SEASON    = 2027;
const REG_FEE   = 200;
const LAST_SYNC = "May 31, 2027 · 9:47 AM";
const DAYS_TO_CLOSE = 8;
const REG_CLOSE_DATE = "Feb 28, 2027";

// ─── Mock data ─────────────────────────────────────────────────────────────────
const MOCK_PARITY = [
  { division:"gold_open", label:"Gold Open", color:"#D4A017", cap:30, registered:22, paid:20, goalies:4, returning:16, prior_year:20,
    tiers:{A:4,B:8,C:6,R:4},
    teams:[
      {name:"Team Gold",  colour:"#D4A017",players:8,skill:72.1,age:76.3,parity:74.2,goalies:1,defense:2,center:2,wing:3},
      {name:"Team Blue",  colour:"#1E3A8A",players:8,skill:70.5,age:73.1,parity:71.8,goalies:1,defense:2,center:2,wing:3},
      {name:"Team Red",   colour:"#991B1B",players:8,skill:67.0,age:70.0,parity:68.5,goalies:1,defense:2,center:2,wing:3},
      {name:"Team Green", colour:"#166534",players:8,skill:69.3,age:71.8,parity:70.6,goalies:1,defense:2,center:2,wing:3},
    ],
    anomalies:["80% R-tier concentration — consider tier rebalance","Team Red parity 68.5 — borderline review"],
  },
  { division:"45a", label:"45A", color:"#2196a8", cap:24, registered:19, paid:17, goalies:3, returning:14, prior_year:21,
    tiers:{A:1,B:5,C:8,R:5},
    teams:[
      {name:"Team Silver",colour:"#6B7280",players:7,skill:68.0,age:78.2,parity:73.1,goalies:1,defense:2,center:2,wing:2},
      {name:"Team Bronze",colour:"#92400E",players:7,skill:66.5,age:75.0,parity:70.8,goalies:1,defense:2,center:1,wing:3},
      {name:"Team Copper",colour:"#1A5F6B",players:7,skill:67.8,age:76.4,parity:72.1,goalies:1,defense:2,center:2,wing:2},
    ],
    anomalies:[],
  },
  { division:"senior_b", label:"Senior B", color:"#7B5EA7", cap:32, registered:26, paid:25, goalies:5, returning:20, prior_year:24,
    tiers:{A:0,B:6,C:12,R:8},
    teams:[
      {name:"Team Black",colour:"#1a1a2e",players:9,skill:64.0,age:74.0,parity:69.0,goalies:1,defense:2,center:3,wing:3},
      {name:"Team White",colour:"#888",   players:9,skill:65.5,age:73.5,parity:69.5,goalies:2,defense:2,center:3,wing:2},
      {name:"Team Navy", colour:"#1E3A8A",players:8,skill:63.0,age:72.0,parity:67.5,goalies:1,defense:2,center:2,wing:3},
    ],
    anomalies:["Team Navy parity 67.5 — borderline rebalance"],
  },
  { division:"senior_c", label:"Senior C", color:"#B05E3A", cap:24, registered:17, paid:16, goalies:3, returning:10, prior_year:19,
    tiers:{A:0,B:2,C:8,R:7},
    teams:[
      {name:"Team Maroon",colour:"#7A1818",players:9,skill:60.0,age:72.0,parity:66.0,goalies:0,defense:3,center:2,wing:4},
      {name:"Team Teal",  colour:"#1A5F6B",players:8,skill:61.5,age:73.0,parity:67.3,goalies:1,defense:2,center:2,wing:3},
    ],
    anomalies:["Team Maroon has NO goalie — critical action required","Lowest retention (59%) — outreach recommended"],
  },
];

const MOCK_UNPAID = [
  {id:4, name:"Janet Ruiz",     division:"Senior C", email:"j.ruiz@email.com",   amount:200,days_since:12,reminder_sent:true},
  {id:9, name:"Ray Dominguez",  division:"Senior B", email:"r.dom@email.com",    amount:200,days_since:8, reminder_sent:true},
  {id:16,name:"James Whitmore", division:"Gold Open", email:"j.white@email.com", amount:200,days_since:3, reminder_sent:false},
  {id:17,name:"Priya Nair",     division:"Senior B", email:"p.nair@email.com",   amount:200,days_since:15,reminder_sent:true},
  {id:21,name:"Cleo Barron",    division:"Gold Open", email:"c.barr@email.com",  amount:200,days_since:6, reminder_sent:false},
  {id:28,name:"Doug Firth",     division:"45A",       email:"d.firth@email.com", amount:200,days_since:20,reminder_sent:true},
  {id:31,name:"Liz Hale",       division:"Senior C", email:"l.hale@email.com",   amount:200,days_since:1, reminder_sent:false},
];

const MOCK_GOALIE = [
  {division:"gold_open",label:"Gold Open",teams:[{name:"Team Gold",colour:"#D4A017",goalies:["Linda Tran"]},{name:"Team Blue",colour:"#1E3A8A",goalies:["Janet Ruiz"]},{name:"Team Red",colour:"#991B1B",goalies:["Frank Dolan"]},{name:"Team Green",colour:"#166534",goalies:["Marco Reyes"]}],pool:["Lena Fischer"]},
  {division:"45a",label:"45A",teams:[{name:"Team Silver",colour:"#6B7280",goalies:["Chris Wells"]},{name:"Team Bronze",colour:"#92400E",goalies:["Dana Yip"]},{name:"Team Copper",colour:"#1A5F6B",goalies:["Pete Garza"]}],pool:[]},
  {division:"senior_b",label:"Senior B",teams:[{name:"Team Black",colour:"#1a1a2e",goalies:["Kim Park"]},{name:"Team White",colour:"#888",goalies:["Tom Bell","Bev Chen"]},{name:"Team Navy",colour:"#1E3A8A",goalies:["Deb Hull"]}],pool:["Marco Reyes"]},
  {division:"senior_c",label:"Senior C",teams:[{name:"Team Maroon",colour:"#7A1818",goalies:[]},{name:"Team Teal",colour:"#1A5F6B",goalies:["Alice Wong"]}],pool:[]},
];

const MOCK_REG_DAYS = (() => {
  const data={};const base=new Date("2027-01-15");
  for(let i=0;i<105;i++){const d=new Date(base);d.setDate(d.getDate()+i);const k=d.toISOString().slice(0,10);data[k]=Math.random()<0.3?Math.floor(Math.random()*4):0;}
  ["2027-02-14","2027-02-15","2027-02-28","2027-03-01","2027-04-01","2027-04-02"].forEach(k=>{data[k]=Math.floor(Math.random()*8+6);});
  return data;
})();

const MOCK_SANDBAG=[
  {player:"Mike Hartley",  tier_history:"A2/A2/A3",self_reported:"Senior C",expected:"Gold Open",div:"senior_c",seasons:3},
  {player:"Dave Kowalski", tier_history:"B1/B2/C1",self_reported:"Senior B",expected:"Gold Open",div:"senior_b",seasons:3},
  {player:"James Whitmore",tier_history:"B2/B2",   self_reported:"Senior C",expected:"45A",      div:"senior_c",seasons:2},
];


// ─── FAQ Data ─────────────────────────────────────────────────────────────────
const FAQ_ITEMS = [
  {cat:"overview", icon:"📊", q:"What do the four KPI cards mean?", badge:null,
   a:[
     {type:"p",text:"The four cards give an instant season health snapshot:"},
     {type:"pills",items:[{cls:"blue",t:"Registered"},{cls:"",t:"total players in the pool (primary + subs)"}]},
     {type:"pills",items:[{cls:"green",t:"Paid"},{cls:"",t:"players who completed payment — % shown is your collection rate"}]},
     {type:"pills",items:[{cls:"red",t:"Outstanding"},{cls:"",t:"primary registrations with pending/failed payment — dollar total owed"}]},
     {type:"pills",items:[{cls:"amber",t:"Teams no goalie"},{cls:"",t:"teams with no confirmed goalie — needs resolving before draft day"}]},
     {type:"callout",kind:"info",text:"A red or amber card means action is needed before the next board step."},
   ]},
  {cat:"overview", icon:"🔄", q:"How current is the data on this page?", badge:"Data",
   a:[
     {type:"p",text:'The freshness badge shows when data was last pulled. Click Refresh to force a new pull from WPForms.'},
     {type:"callout",kind:"warn",text:"If you have just done a WPForms sync from Players, refresh Reports to see updated counts."},
     {type:"p",text:"The timestamp is server time (Pacific), not your local browser time."},
   ]},
  {cat:"overview", icon:"🧠", q:"What does the AI executive summary do and how accurate is it?", badge:"AI",
   a:[
     {type:"p",text:"The AI summary reads all live report data — registrations, payments, parity, goalies, sandbagging flags — and writes a plain-English paragraph suitable for reading aloud at a board meeting or pasting into minutes."},
     {type:"p",text:"It is generated on demand each time you click Generate summary. It is not stored between sessions."},
     {type:"callout",kind:"warn",text:"Always verify numbers against the KPI cards. The AI summary is a convenience tool, not an official record."},
   ]},
  {cat:"overview", icon:"⚠️", q:"When does the season health banner appear?", badge:"Action",
   a:[
     {type:"p",text:"The amber banner appears when at least one of these is true:"},
     {type:"steps",items:["One or more primary registrations have an outstanding payment","One or more teams have no confirmed goalie assignment","One or more sandbagging flags are unreviewed"]},
     {type:"p",text:"If none apply, the banner is hidden — a clean reports page means you're on track."},
   ]},
  {cat:"overview", icon:"🗂️", q:"When should I run the reports before a board meeting?", badge:"Best practice",
   a:[
     {type:"steps",items:["2 days before: sync WPForms from the Players page to pull the latest registrations","Day before: send payment reminders to all outstanding players","Morning of: refresh Reports, generate the AI summary, download the Board meeting pack","At the meeting: use the Share link for a live view, or distribute the PDF pack"]},
   ]},
  {cat:"parity", icon:"⚖️", q:"How is the parity score calculated?", badge:"Scores",
   a:[
     {type:"p",text:"Each team's parity score is a composite of three sub-scores on a 0–100 scale:"},
     {type:"steps",items:["Skill score — derived from each player's tier (A1–R3) and years of experience, averaged across the team","Age score — measures how evenly age is distributed; wide spread scores higher than clustering in one band","Parity score — weighted combination of skill and age balance relative to other teams in the same division"]},
     {type:"callout",kind:"info",text:"Ideal range: 65–80. Below 60 or above 85 triggers a Rebalance recommendation."},
   ]},
  {cat:"parity", icon:"🎯", q:"What do Balanced, Review, and Rebalance mean?", badge:"Action",
   a:[
     {type:"pills",items:[{cls:"green",t:"Balanced"},{cls:"",t:"parity 65–80 · within acceptable range, no action needed"}]},
     {type:"pills",items:[{cls:"amber",t:"Review"},{cls:"",t:"parity 61–64 or 81–85 · borderline, worth checking before draft"}]},
     {type:"pills",items:[{cls:"red",t:"Rebalance"},{cls:"",t:"parity below 60 or above 85 · swap players before the draft"}]},
     {type:"callout",kind:"warn",text:"Rebalance does not change rosters automatically. A committee member must go to Rosters, reassign players manually, then refresh Reports to confirm improvement."},
   ]},
  {cat:"parity", icon:"🥅", q:"What do the position chips (G, D, C, W) on each team row mean?", badge:null,
   a:[
     {type:"p",text:"The chips show current roster composition by position: G = goalies, D = defense, C = centers, W = wingers."},
     {type:"callout",kind:"warn",text:"A G:0 chip means the team has no goalie assigned — critical before draft. The health banner will also flag this."},
   ]},
  {cat:"parity", icon:"🔄", q:"What should I do if a team shows Rebalance?", badge:"Action",
   a:[
     {type:"steps",items:["Note which team is flagged and its current skill/age scores","Go to Rosters in the left navigation","Find players whose tier or age could move the score toward 65–80","Reassign players between teams using the roster tool","Return to Reports and click Refresh — parity scores will recalculate"]},
     {type:"callout",kind:"info",text:"Tip: swap players with opposite tier profiles — e.g. move an A-tier off the high-scoring team with an R-tier from the low-scoring team."},
   ]},
  {cat:"parity", icon:"🚩", q:"What is sandbagging and why does it affect parity?", badge:"Review",
   a:[
     {type:"p",text:"Sandbagging is when a player registers for a lower division than their skill history suggests — e.g. an A2/A2/A3 player registering for Senior C instead of Gold Open."},
     {type:"p",text:"The system auto-flags these players based on prior division history. Sandbagging inflates parity scores for the chosen division, making one team appear more balanced than it actually is."},
     {type:"p",text:"The committee should review all flags before the draft and either approve the placement with a note, or reassign the player."},
   ]},
  {cat:"parity", icon:"🏆", q:"What is Draft readiness and when is a division ready?", badge:"Pre-draft",
   a:[
     {type:"p",text:"Draft readiness checks minimum requirements before the snake draft can start:"},
     {type:"pills",items:[{cls:"green",t:"Players"},{cls:"",t:"at least min-roster × teams players registered and approved"}]},
     {type:"pills",items:[{cls:"green",t:"Goalies"},{cls:"",t:"at least one goalie assigned per team"}]},
     {type:"pills",items:[{cls:"green",t:"Payments"},{cls:"",t:"no outstanding payments on draft eligible list"}]},
     {type:"pills",items:[{cls:"green",t:"Flags"},{cls:"",t:"all sandbagging flags reviewed and resolved"}]},
     {type:"callout",kind:"warn",text:"The Draft page will not allow starting a division's draft until all four conditions are met."},
   ]},
  {cat:"payments", icon:"💳", q:"What does the Outstanding KPI include?", badge:null,
   a:[
     {type:"p",text:"Outstanding counts primary registrations (not subs) where payment status is pending or failed. The dollar figure is the total of registration fees not yet collected."},
     {type:"p",text:"Sub registrations are excluded — subs are typically on a separate payment arrangement. To see sub payment status, go to the Alternates page."},
   ]},
  {cat:"payments", icon:"📧", q:"How do I send a payment reminder from Reports?", badge:"Quick",
   a:[
     {type:"p",text:"Click the Send reminders link inside the Outstanding KPI card. This opens a pre-addressed email to all players with outstanding balances."},
     {type:"p",text:"Alternatively, go to the Unpaid players tab, select the players you want to contact, and use the bulk email button."},
     {type:"callout",kind:"info",text:"Reminder emails are logged against each player's record so you can track who has been contacted and when."},
   ]},
  {cat:"payments", icon:"⏰", q:"How long should I wait before escalating an outstanding payment?", badge:null,
   a:[
     {type:"pills",items:[{cls:"green",t:"0–14 days"},{cls:"",t:"monitor, no action needed yet"}]},
     {type:"pills",items:[{cls:"amber",t:"15–30 days"},{cls:"",t:"send a payment reminder email"}]},
     {type:"pills",items:[{cls:"red",t:"30+ days"},{cls:"",t:"escalate — committee votes on whether to hold spot or open to alternates"}]},
     {type:"p",text:"The board pack PDF shows the recommended action for each unpaid player automatically based on these thresholds."},
   ]},
  {cat:"payments", icon:"🧾", q:"A player paid outside the system (cash/e-transfer). How do I record it?", badge:null,
   a:[
     {type:"steps",items:["Go to Players and find the player","Open their detail drawer by clicking their row","Under Payment section, change status to Paid","Add a committee note recording the payment method and date"]},
     {type:"callout",kind:"warn",text:"Manual payment updates are logged with the name of the committee member who made the change, for audit purposes."},
   ]},
  {cat:"export", icon:"📦", q:"What is the Board meeting pack and what does it include?", badge:"New",
   a:[
     {type:"p",text:"The Board meeting pack is a single downloadable document generated from live data at the moment you click the button:"},
     {type:"steps",items:["Season KPI summary (registered, paid, outstanding, goalies)","AI-generated executive summary paragraph","Full parity report — all divisions, all teams, colour-coded bars and action states","Outstanding payments table with escalation recommendations","Goalie coverage by division and team"]},
     {type:"callout",kind:"info",text:"Downloads as PDF if the server has dompdf installed, or as print-ready HTML otherwise. Both formatted for Letter-size paper."},
   ]},
  {cat:"export", icon:"⬇️", q:"How do I generate and share the Board meeting pack?", badge:"Quick",
   a:[
     {type:"steps",items:["Download: Click Board meeting pack in the Export centre tab. A file downloads to your computer. Email it to board members before the meeting.","Share link: Click Share in the top action bar. This generates a read-only link board members can open in any browser — no login required."]},
     {type:"callout",kind:"warn",text:"Share links expire after 48 hours. Generate a fresh link on the day of the meeting for current data."},
   ]},
  {cat:"export", icon:"🖨️", q:"How do I print the report for a meeting handout?", badge:null,
   a:[
     {type:"p",text:"Click Print handout in the top action bar. This opens a printer-friendly version in a new tab, optimised for Letter-size paper."},
     {type:"callout",kind:"info",text:"Tip: select Landscape orientation in your print dialog for the parity table — it fits all columns without truncation."},
   ]},
  {cat:"export", icon:"📅", q:"Can I schedule reports to send automatically?", badge:"Feature",
   a:[
     {type:"p",text:"Yes — click Schedule in the top action bar. You can set a recurring schedule (e.g. the Friday before each board meeting) and choose which sections to include. Scheduled reports are emailed to all committee members."},
     {type:"p",text:"You can also add external email addresses for board members who don't have a system login."},
   ]},
  {cat:"export", icon:"📄", q:"Can I export individual sections as CSV or PDF?", badge:null,
   a:[
     {type:"p",text:"Yes — go to the Export centre tab. Each section has its own export card with format and filename pre-set (e.g. grsh-parity-2027.csv). Available exports include: Player pool CSV, Team rosters PDF, Parity CSV, Unpaid CSV, Goalies CSV, Alternates CSV, Full data ZIP."},
   ]},
  {cat:"roles", icon:"🔒", q:"Who can see the Reports page?", badge:null,
   a:[
     {type:"pills",items:[{cls:"blue",t:"Super Admin"},{cls:"",t:"full access — all reports, all exports, schedule management"}]},
     {type:"pills",items:[{cls:"green",t:"Committee"},{cls:"",t:"full access — all reports and exports"}]},
     {type:"pills",items:[{cls:"gray",t:"Read Only"},{cls:"",t:"can view reports but cannot export or generate the board pack"}]},
     {type:"pills",items:[{cls:"amber",t:"Captain"},{cls:"",t:"no access to Reports — sees their own roster only"}]},
     {type:"p",text:"Roles are managed under Settings → Access."},
   ]},
  {cat:"roles", icon:"👥", q:"Who on the GRSH board has system access?", badge:null,
   a:[
     {type:"steps",items:["Lorenzo — Super Admin · Player Recruitment, Secretary","Brian — Director · Committee access","Don — Treasurer · Committee access","Dee — Player Recruitment · Committee access","Lyndsay — Player Recruitment · Committee access","Rita — Fundraising · Committee access"]},
     {type:"callout",kind:"info",text:"Quorum for board votes is 4 of 6 members."},
   ]},
  {cat:"roles", icon:"🛡️", q:"Can board members edit data from the Reports page?", badge:null,
   a:[
     {type:"p",text:"No — the Reports page is read-only for all roles. To make changes:"},
     {type:"steps",items:["Payment status → Players → open player drawer","Roster changes → Rosters","Goalie assignments → Rosters → goalie assignment tool"]},
   ]},
];

const FAQ_CATS = [
  {key:"all",    label:"All questions", color:"#888"},
  {key:"overview", label:"Overview & KPIs", color:"#378ADD"},
  {key:"parity",   label:"Parity & teams",  color:"#1D9E75"},
  {key:"payments", label:"Payments",         color:"#BA7517"},
  {key:"export",   label:"Board pack & export", color:"#534AB7"},
  {key:"roles",    label:"Roles & access",   color:"#993556"},
];

const BADGE_STYLE = {
  "Action":      {bg:"#FCEBEB",color:"#791F1F"},
  "Review":      {bg:"#FCEBEB",color:"#791F1F"},
  "AI":          {bg:"#E6F1FB",color:"#0C447C"},
  "Data":        {bg:"#E6F1FB",color:"#0C447C"},
  "Scores":      {bg:"#E6F1FB",color:"#0C447C"},
  "Pre-draft":   {bg:"#E6F1FB",color:"#0C447C"},
  "Feature":     {bg:"#E6F1FB",color:"#0C447C"},
  "Quick":       {bg:"#EAF3DE",color:"#27500A"},
  "New":         {bg:"#EAF3DE",color:"#27500A"},
  "Best practice":{bg:"#EAF3DE",color:"#27500A"},
};

const PILL_CLS = {
  green: {bg:"#EAF3DE",color:"#27500A",border:"#C0DD97"},
  amber: {bg:"#FAEEDA",color:"#633806",border:"#FAC775"},
  red:   {bg:"#FCEBEB",color:"#791F1F",border:"#F7C1C1"},
  blue:  {bg:"#E6F1FB",color:"#0C447C",border:"#B5D4F4"},
  gray:  {bg:"#F1EFE8",color:"#444441",border:"#D3D1C7"},
  "":    {bg:"transparent",color:"#555",border:"transparent"},
};

// ─── FAQ Sub-components ────────────────────────────────────────────────────────
function FAQPill({cls,t}){
  const s=PILL_CLS[cls]||PILL_CLS[""];
  if(!cls)return <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#555"}}>{t}</span>;
  return <span style={{display:"inline-block",background:s.bg,color:s.color,border:`1px solid ${s.border}`,fontSize:10,fontFamily:"'DM Mono',monospace",fontWeight:500,padding:"1px 8px",borderRadius:99,whiteSpace:"nowrap"}}>{t}</span>;
}

function FAQAnswer({blocks}){
  return(
    <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#555",lineHeight:1.7}}>
      {blocks.map((b,i)=>{
        if(b.type==="p") return <p key={i} style={{margin:"0 0 8px"}}>{b.text}</p>;
        if(b.type==="pills") return(
          <div key={i} style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",margin:"4px 0"}}>
            {b.items.map((item,j)=><FAQPill key={j} cls={item.cls} t={item.t}/>)}
          </div>
        );
        if(b.type==="steps") return(
          <div key={i} style={{margin:"6px 0"}}>
            {b.items.map((s,j)=>(
              <div key={j} style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:6}}>
                <span style={{width:20,height:20,borderRadius:"50%",background:"#F0EEE8",border:"1px solid #E8E6DF",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:500,flexShrink:0,color:"#888"}}>{j+1}</span>
                <span style={{fontSize:12,color:"#555",lineHeight:1.5,paddingTop:1}}>{s}</span>
              </div>
            ))}
          </div>
        );
        if(b.type==="callout"){
          const isInfo=b.kind==="info";
          return(
            <div key={i} style={{borderLeft:`3px solid ${isInfo?"#378ADD":"#BA7517"}`,background:isInfo?"#E6F1FB":"#FAEEDA",borderRadius:"0 6px 6px 0",padding:"8px 12px",margin:"8px 0",fontSize:11,color:isInfo?"#0C447C":"#633806",lineHeight:1.6}}>
              {b.text}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

function FAQPanel(){
  const [search,setSearch]=React.useState("");
  const [cat,setCat]=React.useState("all");
  const [openIdx,setOpenIdx]=React.useState(null);

  const filtered=React.useMemo(()=>{
    const q=search.toLowerCase().trim();
    return FAQ_ITEMS.filter(f=>{
      const matchCat=cat==="all"||f.cat===cat;
      const matchQ=!q||f.q.toLowerCase().includes(q)||f.a.some(b=>b.text?.toLowerCase().includes(q)||b.items?.some(it=>it.t?.toLowerCase().includes(q)));
      return matchCat&&matchQ;
    });
  },[search,cat]);

  const grouped=React.useMemo(()=>{
    const order=["overview","parity","payments","export","roles"];
    const g={};
    filtered.forEach(f=>{(g[f.cat]=g[f.cat]||[]).push(f);});
    return cat==="all"?order.filter(c=>g[c]).map(c=>({cat:c,items:g[c]})):[{cat,items:filtered}];
  },[filtered,cat]);

  const catLabel={overview:"Overview & KPIs",parity:"Parity & teams",payments:"Payments",export:"Board pack & export",roles:"Roles & access"};

  return(
    <div style={{fontFamily:"'Fraunces',Georgia,serif"}}>
      {/* Search + header */}
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,marginBottom:14,flexWrap:"wrap"}}>
        <div>
          <h2 style={{fontFamily:"'Fraunces',serif",fontSize:20,fontWeight:700,color:"#1a1a2e",margin:"0 0 3px",letterSpacing:"-.3px"}}>Help & FAQ</h2>
          <p style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#aaa",margin:0}}>{FAQ_ITEMS.length} questions · searchable · updated for Season 2027</p>
        </div>
        <div style={{position:"relative",minWidth:220}}>
          <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:13,color:"#bbb",pointerEvents:"none"}}>⌕</span>
          <input type="text" value={search} onChange={e=>{setSearch(e.target.value);setOpenIdx(null);}}
            placeholder="Search questions…" aria-label="Search FAQ"
            style={{fontFamily:"'DM Mono',monospace",fontSize:12,width:"100%",padding:"8px 10px 8px 28px",border:"1px solid #E8E6DF",borderRadius:8,background:"#F6F5F0",color:"#333",outline:"none"}}/>
        </div>
      </div>

      {/* Category tabs */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:18}}>
        {FAQ_CATS.map(c=>(
          <button key={c.key} onClick={()=>{setCat(c.key);setOpenIdx(null);}}
            style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,padding:"6px 14px",borderRadius:99,cursor:"pointer",transition:"all .15s",
              background:cat===c.key?"#1a1a2e":"#fff",color:cat===c.key?"#D4A017":"#666",border:`1px solid ${cat===c.key?"#1a1a2e":"#E8E6DF"}`,
              display:"flex",alignItems:"center",gap:6}}>
            {c.key!=="all"&&<span style={{width:7,height:7,borderRadius:"50%",background:cat===c.key?"#D4A017":c.color,flexShrink:0}}/>}
            {c.label}
          </button>
        ))}
      </div>

      {/* FAQ list */}
      {filtered.length===0?(
        <div style={{textAlign:"center",padding:"48px 24px",color:"#aaa"}}>
          <div style={{fontSize:28,marginBottom:10}}>🔍</div>
          <p style={{fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,color:"#1a1a2e",margin:"0 0 6px"}}>No questions match</p>
          <p style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#aaa",margin:0}}>Try different keywords or clear the search.</p>
        </div>
      ):grouped.map(({cat:gc,items})=>(
        <div key={gc}>
          {cat==="all"&&<div style={{fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:500,color:"#aaa",textTransform:"uppercase",letterSpacing:".07em",margin:"18px 0 8px 2px"}}>{catLabel[gc]}</div>}
          {items.map((f,i)=>{
            const globalIdx=`${gc}-${i}`;
            const isOpen=openIdx===globalIdx;
            const badge=f.badge?BADGE_STYLE[f.badge]||BADGE_STYLE["Quick"]:null;
            return(
              <div key={globalIdx} style={{background:"#fff",border:"1px solid #E8E6DF",borderRadius:10,overflow:"hidden",marginBottom:6}}>
                <button onClick={()=>setOpenIdx(isOpen?null:globalIdx)}
                  style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"12px 16px",cursor:"pointer",background:"transparent",border:"none",textAlign:"left",transition:"background .12s"}}
                  aria-expanded={isOpen} onMouseEnter={e=>e.currentTarget.style.background="#FAFAF8"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <span style={{fontSize:15,flexShrink:0}}>{f.icon}</span>
                  <span style={{flex:1,fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:600,color:"#1a1a2e",lineHeight:1.4}}>{f.q}</span>
                  {badge&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:9,fontWeight:500,background:badge.bg,color:badge.color,padding:"2px 8px",borderRadius:99,flexShrink:0}}>{f.badge}</span>}
                  <span style={{fontSize:13,color:"#bbb",flexShrink:0,transform:isOpen?"rotate(180deg)":"rotate(0)",transition:"transform .2s",display:"inline-block"}}>▾</span>
                </button>
                {isOpen&&(
                  <div style={{padding:"0 16px 14px 41px",borderTop:"1px solid #F6F5F0"}}>
                    <FAQAnswer blocks={f.a}/>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const pColor=(s)=>s>=73?"#166534":s>=68?"#92400E":"#991B1B";
const pLabel=(s)=>s>=73?"Balanced":s>=68?"Review":"Rebalance";
const DIV_BG={gold_open:{bg:"#FEF9E7",color:"#92601A",border:"#F5D77E"},"45a":{bg:"#E8F6F8",color:"#1A5F6B",border:"#9DD5DC"},senior_b:{bg:"#F3EEF9",color:"#4A3070",border:"#C4AEED"},senior_c:{bg:"#FDF0E8",color:"#7A3318",border:"#F5B993"},womens:{bg:"#FBEAF0",color:"#6B1A3A",border:"#F4C0D1"}};
const totalReg   = MOCK_PARITY.reduce((s,d)=>s+d.registered,0);
const totalPaid  = MOCK_PARITY.reduce((s,d)=>s+d.paid,0);
const totalWaived= Math.round(totalReg*0.08);

function Pill({bg,color,border,children,small}){return <span style={{display:"inline-block",background:bg,color,border:`1px solid ${border||bg}`,fontSize:small?10:11,fontFamily:"'DM Mono',monospace",fontWeight:500,padding:small?"1px 6px":"2px 8px",borderRadius:99,whiteSpace:"nowrap"}}>{children}</span>;}

// ─── WOW 1: Parity Radar ─────────────────────────────────────────────────────
function ParityRadar({team,allTeams}){
  const size=110,cx=55,cy=55,r=36;
  const avg=(k)=>allTeams.reduce((s,t)=>s+t[k],0)/allTeams.length;
  const axes=[{l:"Skill",v:Math.min(100,(team.skill/avg("skill"))*75)},{l:"Defense",v:Math.min(100,team.defense*25)},{l:"Offense",v:Math.min(100,(team.center+team.wing)*14)},{l:"Goal",v:team.goalies>0?90:10},{l:"Parity",v:Math.min(100,team.parity)}];
  const toXY=(ang,val)=>{const a=ang-Math.PI/2,sc=(val/100)*r;return{x:cx+Math.cos(a)*sc,y:cy+Math.sin(a)*sc};};
  const pts=axes.map((ax,i)=>toXY((i/axes.length)*Math.PI*2,ax.v));
  const poly=pts.map(p=>`${p.x},${p.y}`).join(" ");
  const ideal=axes.map((_,i)=>toXY((i/axes.length)*Math.PI*2,75));
  return(
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{flexShrink:0}}>
      {[25,50,75,100].map(v=><polygon key={v} points={axes.map((_,i)=>{const p=toXY((i/axes.length)*Math.PI*2,v);return`${p.x},${p.y}`;}).join(" ")} fill="none" stroke="#F0EEE8" strokeWidth="0.5"/>)}
      <polygon points={ideal.map(p=>`${p.x},${p.y}`).join(" ")} fill="rgba(26,26,46,.04)" stroke="#E8E6DF" strokeWidth="1" strokeDasharray="2 2"/>
      <polygon points={poly} fill={`${team.colour}25`} stroke={team.colour} strokeWidth="1.5"/>
      {axes.map((ax,i)=>{const p=toXY((i/axes.length)*Math.PI*2,115);return<text key={ax.l} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" style={{fontFamily:"'DM Mono',monospace",fontSize:6,fill:"#aaa"}}>{ax.l}</text>;})}
    </svg>
  );
}

// ─── WOW 2: Payment Thermometer ──────────────────────────────────────────────
function PaymentThermometer({paid,total,pending}){
  const paidPct=total>0?Math.round(paid/total*100):0;
  const pendPct=total>0?Math.round(pending/total*100):0;
  const waivPct=Math.round(totalWaived/total*100)||5;
  return(
    <div style={{display:"flex",gap:20,alignItems:"flex-end",flexWrap:"wrap"}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
        <span style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:"#aaa",textTransform:"uppercase"}}>Collection</span>
        <div style={{width:36,height:160,background:"#F0EEE8",borderRadius:99,overflow:"hidden",position:"relative",border:"2px solid #E8E6DF"}}>
          <div style={{position:"absolute",bottom:`${paidPct+pendPct}%`,left:0,right:0,height:`${waivPct}%`,background:"#EDE9FE"}}/>
          <div style={{position:"absolute",bottom:`${paidPct}%`,left:0,right:0,height:`${pendPct}%`,background:"#FDE68A",animation:"pulse 2s infinite"}}/>
          <div style={{position:"absolute",bottom:0,left:0,right:0,height:`${paidPct}%`,background:"#22c55e",transition:"height 1.2s ease"}}/>
          <div style={{position:"absolute",bottom:"95%",left:0,right:0,height:1,background:"#1a1a2e",borderTop:"1px dashed #1a1a2e"}}/>
        </div>
        <span style={{fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,color:"#166534"}}>{paidPct}%</span>
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",gap:10}}>
        <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#92400E",fontWeight:500,background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:7,padding:"7px 12px"}}>
          ⏰ Registration closes in <strong>{DAYS_TO_CLOSE} days</strong> ({REG_CLOSE_DATE}) · {pending} players still unpaid
        </div>
        {[{l:"Collected",v:`$${paid*REG_FEE}`,c:"#166534",pct:paidPct},{l:"Outstanding",v:`$${pending*REG_FEE}`,c:"#92400E",pct:pendPct},{l:"Waived",v:`$${totalWaived*REG_FEE}`,c:"#4C1D95",pct:waivPct}].map(r=>(
          <div key={r.l}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#888"}}>{r.l}</span>
              <span style={{fontFamily:"'Fraunces',serif",fontSize:14,fontWeight:700,color:r.c}}>{r.v}</span>
            </div>
            <div style={{height:4,background:"#F0EEE8",borderRadius:99,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${r.pct}%`,background:r.c,borderRadius:99,transition:"width 1s ease"}}/>
            </div>
          </div>
        ))}
        <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa"}}>
          95% target line shown on thermometer · Expected total: ${totalReg*REG_FEE}
        </div>
      </div>
    </div>
  );
}

// ─── WOW 3: Registration Heatmap ─────────────────────────────────────────────
function RegHeatmap(){
  const entries=Object.entries(MOCK_REG_DAYS).sort();
  const weeks=[];let week=[];
  entries.forEach(([date,count],i)=>{week.push({date,count});if(week.length===7||(i===entries.length-1)){weeks.push([...week]);week=[];}});
  const getColor=(n)=>n===0?"#F0EEE8":n<=2?"#C4AEED":n<=5?"#7B5EA7":"#1a1a2e";
  return(
    <div>
      <div style={{overflowX:"auto"}}>
        <div style={{display:"flex",gap:2}}>
          {weeks.map((wk,wi)=>(
            <div key={wi} style={{display:"flex",flexDirection:"column",gap:2}}>
              {wk.map(({date,count})=>(
                <div key={date} title={`${date}: ${count} registration${count!==1?"s":""}`}
                  style={{width:11,height:11,borderRadius:2,background:getColor(count),cursor:count>0?"pointer":"default"}}
                  onMouseEnter={e=>e.currentTarget.style.opacity=".65"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}/>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6,marginTop:8}}>
        <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa"}}>Less</span>
        {["#F0EEE8","#C4AEED","#7B5EA7","#1a1a2e"].map(c=><div key={c} style={{width:9,height:9,borderRadius:2,background:c}}/>)}
        <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa"}}>More · Hover cell to see date + count · Spikes near deadlines indicate reminder timing for next season</span>
      </div>
    </div>
  );
}

// ─── WOW 4: Division Health Scorecard ────────────────────────────────────────
function HealthScorecard({divisions}){
  const indicators=(div)=>[
    {label:"Registration fill",  ok:div.registered>=(div.cap||30)*0.75,    val:`${div.registered}/${div.cap}`},
    {label:"Payment >90%",       ok:div.paid>=div.registered*0.9,           val:`${Math.round(div.paid/div.registered*100)}%`},
    {label:"Parity balance",     ok:div.teams.every(t=>t.parity>=68),       val:div.teams.length?`${div.teams.filter(t=>t.parity>=68).length}/${div.teams.length} balanced`:"No teams"},
    {label:"Goalie coverage",    ok:div.goalies>=div.teams.length&&div.teams.length>0,val:`${div.goalies}/${div.teams.length} teams`},
    {label:"No anomalies",       ok:div.anomalies.length===0,               val:div.anomalies.length===0?"Clear":`${div.anomalies.length} flag${div.anomalies.length>1?"s":""}`},
  ];
  return(
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
      {divisions.map(div=>{
        const inds=indicators(div);
        const score=inds.filter(i=>i.ok).length;
        const sc=score===inds.length?"#166534":score>=3?"#92400E":"#991B1B";
        return(
          <div key={div.division} style={{background:"#fff",border:`1px solid ${score===inds.length?"#86EFAC":score>=3?"#FDE68A":"#FCA5A5"}`,borderRadius:12,overflow:"hidden",borderTop:`4px solid ${div.color||"#1a1a2e"}`}}>
            <div style={{padding:"12px 14px 8px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <span style={{fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:700,color:div.color||"#1a1a2e"}}>{div.label}</span>
                <span style={{fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:700,color:sc}}>{score}/{inds.length}</span>
              </div>
              {inds.map(ind=>(
                <div key={ind.label} style={{display:"flex",alignItems:"center",gap:6,padding:"3px 0",borderBottom:"1px solid #F9F8F4"}}>
                  <span style={{fontSize:10,color:ind.ok?"#166534":"#991B1B",flexShrink:0}}>{ind.ok?"✓":"✗"}</span>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#555",flex:1}}>{ind.label}</span>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:ind.ok?"#aaa":"#92400E"}}>{ind.val}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── WOW 5: Age Distribution ─────────────────────────────────────────────────
const AGE_BANDS=[{min:35,max:39,label:"35–39"},{min:40,max:44,label:"40–44"},{min:45,max:49,label:"45–49"},{min:50,max:54,label:"50–54"},{min:55,max:59,label:"55–59"},{min:60,max:99,label:"60+"}];
const MOCK_AGES=[48,46,52,51,44,49,47,53,55,46,50,48,52,51,44,49,47,53,55,46,50,48,52,51,44,49,47,53,55,46,50,48,52,51,44,49,47,53,55,46,50,48,52,51,44,49,47,53,55,46,50,48,52,51,44,49,47,53,55,46,50,48,52,51,44,49,47,53,55,46,50,48,52,51,44,49,47,53,55,46,50,48,52,51];
function AgeDistribution(){
  const counts=AGE_BANDS.map(b=>({...b,n:MOCK_AGES.filter(a=>a>=b.min&&a<=b.max).length}));
  const max=Math.max(...counts.map(b=>b.n),1);
  const avg=(MOCK_AGES.reduce((s,a)=>s+a,0)/MOCK_AGES.length).toFixed(1);
  return(
    <div>
      <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",marginBottom:10}}>Average age: <strong style={{color:"#1a1a2e"}}>{avg}</strong> · {MOCK_AGES.length} players across all divisions</div>
      <div style={{display:"flex",alignItems:"flex-end",gap:6,height:80}}>
        {counts.map(b=>(
          <div key={b.label} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
            <span style={{fontFamily:"'Fraunces',serif",fontSize:11,fontWeight:700,color:"#1a1a2e"}}>{b.n}</span>
            <div style={{width:"100%",background:b.min===45?"#1a1a2e":"#1E3A8A",borderRadius:"4px 4px 0 0",height:`${Math.round((b.n/max)*60)}px`,transition:"height 1s ease",opacity:b.min===45?1:0.7}} title={`${b.label}: ${b.n} players${b.min===45?" — 45A eligibility threshold":""}`}/>
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:b.min===45?"#92400E":"#aaa",textAlign:"center"}}>{b.label}</span>
          </div>
        ))}
      </div>
      <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#92400E",marginTop:8}}>
        ⬆ Dark bar = 45A eligibility threshold (45+)
      </div>
    </div>
  );
}

// ─── WOW 6: AI Executive Summary ─────────────────────────────────────────────
function AIExecSummary({divisions}){
  const [summary,setSummary]=useState(null);
  const [loading,setLoading]=useState(false);
  const tReg=divisions.reduce((s,d)=>s+d.registered,0);
  const tPaid=divisions.reduce((s,d)=>s+d.paid,0);
  const goalieShort=divisions.filter(d=>d.teams.some(t=>t.goalies===0));
  const critDiv=divisions.filter(d=>d.anomalies.length>0);
  const avgParity=divisions.flatMap(d=>d.teams).reduce((s,t)=>s+t.parity,0)/Math.max(1,divisions.flatMap(d=>d.teams).length);
  const generate=async()=>{
    setLoading(true);
    const prompt=`You are the Gold Rush Senior Hockey Tournament director writing a 4-5 sentence executive summary for the committee. Season 2027: ${tReg} registered across 4 divisions. ${tPaid} paid (${Math.round(tPaid/tReg*100)}%). ${MOCK_UNPAID.length} still unpaid with ${DAYS_TO_CLOSE} days until close. ${goalieShort.length} divisions have teams missing goalies. Average parity: ${avgParity.toFixed(1)}. ${critDiv.length} divisions have anomalies. Be direct, use plain English. End with one specific action item.`;
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:prompt}]})});
      const data=await res.json();
      setSummary(data.content?.[0]?.text||"Unable to generate — check API.");
    }catch{
      setSummary(`The 2027 tournament is on track with ${tReg} players registered across four divisions and a ${Math.round(tPaid/tReg*100)}% payment completion rate. Team parity is averaging ${avgParity.toFixed(1)} — most teams fall within the balanced range. ${goalieShort.length>0?`${goalieShort.map(d=>d.label).join(" and ")} have teams without assigned goalies, which must be resolved before draft day.`:"All teams have at least one goalie."} ${MOCK_UNPAID.length} players have outstanding payments with ${DAYS_TO_CLOSE} days remaining until the deadline. Recommended action: send a final payment reminder to the ${MOCK_UNPAID.filter(p=>!p.reminder_sent).length} players who haven't yet received one.`);
    }
    setLoading(false);
  };
  return(
    <div style={{background:"#1a1a2e",borderRadius:12,padding:"18px 22px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
        <div>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#D4A017",textTransform:"uppercase",letterSpacing:".1em",marginBottom:3}}>🤖 AI Committee Briefing</div>
          <div style={{fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,color:"#fff"}}>Executive Summary</div>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"rgba(255,255,255,.35)",marginTop:2}}>Plain-English season overview generated from live data</div>
        </div>
        <div style={{display:"flex",gap:6}}>
          {summary&&<button onClick={()=>setSummary(null)} style={{fontFamily:"'DM Mono',monospace",fontSize:10,background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.15)",color:"rgba(255,255,255,.4)",padding:"5px 12px",borderRadius:6,cursor:"pointer"}}>↺ Regenerate</button>}
          <button onClick={generate} disabled={loading} style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,background:"#D4A017",color:"#1a1a2e",border:"none",padding:"7px 16px",borderRadius:8,cursor:"pointer",opacity:loading?0.7:1}}>
            {loading?"Generating…":"Generate summary"}
          </button>
        </div>
      </div>
      {loading&&<div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"rgba(212,160,23,.6)",animation:"pulse 1.5s infinite"}}>Analysing season data and generating briefing…</div>}
      {summary&&<p style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"rgba(255,255,255,.85)",lineHeight:1.9,margin:0}}>{summary}</p>}
      {!summary&&!loading&&<p style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"rgba(255,255,255,.3)",margin:0}}>Click "Generate summary" to produce a plain-English overview of the tournament's current state — useful for board meetings, committee check-ins, and stakeholder updates.</p>}
    </div>
  );
}

// ─── WOW 9: Retention Analysis ───────────────────────────────────────────────
function RetentionChart({divisions}){
  const tReg=divisions.reduce((s,d)=>s+d.registered,0);
  const tRet=divisions.reduce((s,d)=>s+d.returning,0);
  const newP=tReg-tRet;
  const retPct=Math.round(tRet/Math.max(1,tReg)*100);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"flex",gap:0,height:28,borderRadius:8,overflow:"hidden"}}>
        <div style={{flex:tRet,background:"#1a1a2e",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#D4A017",fontWeight:600}}>Returning {retPct}% ({tRet})</span>
        </div>
        <div style={{flex:newP,background:"#22c55e",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#fff",fontWeight:600}}>New {100-retPct}% ({newP})</span>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
        {divisions.map(div=>{
          const pct=Math.round(div.returning/Math.max(1,div.registered)*100);
          const col=pct>=70?"#166534":pct>=55?"#92400E":"#991B1B";
          return(
            <div key={div.division} style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:div.color||"#1a1a2e",flexShrink:0}}/>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#555",flex:1}}>{div.label}</span>
              <div style={{width:80,height:4,background:"#F0EEE8",borderRadius:99,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${pct}%`,background:col,borderRadius:99}}/>
              </div>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,fontWeight:600,color:col,minWidth:28,textAlign:"right"}}>{pct}%</span>
            </div>
          );
        })}
      </div>
      {divisions.some(d=>d.returning/Math.max(1,d.registered)<0.6)&&(
        <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#92400E",background:"#FFFBEB",padding:"6px 10px",borderRadius:6,border:"1px solid #FDE68A"}}>
          ⚠ {divisions.filter(d=>d.returning/Math.max(1,d.registered)<0.6).map(d=>d.label).join(", ")} — retention below 60%, targeted outreach recommended
        </div>
      )}
    </div>
  );
}

// ─── WOW 10: Predictive Fill Rate ────────────────────────────────────────────
function FillRatePredictor({divisions}){
  const DAYS_ACTIVE=105;
  return(
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {divisions.map(div=>{
        const rate=div.registered/DAYS_ACTIVE;
        const daysLeft=rate>0?Math.ceil((div.cap-div.registered)/rate):999;
        const willFill=daysLeft<=DAYS_TO_CLOSE;
        const pct=Math.round(div.registered/div.cap*100);
        return(
          <div key={div.division} style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:div.color||"#1a1a2e",flexShrink:0}}/>
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#555",minWidth:80}}>{div.label}</span>
            <div style={{flex:1,height:6,background:"#F0EEE8",borderRadius:99,overflow:"hidden",position:"relative"}}>
              <div style={{height:"100%",width:`${pct}%`,background:div.color||"#1a1a2e",borderRadius:99,transition:"width 1s ease"}}/>
              <div style={{position:"absolute",top:-2,left:"85%",height:10,width:1,background:"rgba(0,0,0,.3)"}}/>
            </div>
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#888",minWidth:48}}>{div.registered}/{div.cap}</span>
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,fontWeight:500,minWidth:140,color:willFill?"#166534":"#991B1B"}}>
              {willFill?"✓ On pace to fill":`⚠ ~${div.cap-div.registered} short at close`}
            </span>
          </div>
        );
      })}
      <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa"}}>
        ┼ marker = registration close deadline · Based on current daily registration rate
      </div>
    </div>
  );
}

// ─── WOW 11: Draft Readiness ──────────────────────────────────────────────────
function DraftReadiness({divisions}){
  const checks=divisions.flatMap(div=>[
    {div:div.label,check:"All teams have a goalie",ok:div.teams.every(t=>t.goalies>0),critical:true},
    {div:div.label,check:"Parity within range (68+)",ok:div.teams.every(t=>t.parity>=68),critical:false},
    {div:div.label,check:"Payment completion >90%",ok:div.paid>=div.registered*0.9,critical:false},
    {div:div.label,check:"No anomalies flagged",ok:div.anomalies.length===0,critical:false},
  ]);
  const critical=checks.filter(c=>c.critical&&!c.ok);
  const warnings=checks.filter(c=>!c.critical&&!c.ok);
  const allOk=checks.every(c=>c.ok);
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:12,padding:"14px 18px",background:allOk?"#F0FDF4":critical.length?"#FEF2F2":"#FFFBEB",borderBottom:"1px solid #F0EEE8"}}>
        <span style={{fontSize:22}}>{allOk?"🏒":critical.length?"🚫":"⚠"}</span>
        <div>
          <div style={{fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:700,color:allOk?"#166534":critical.length?"#991B1B":"#92400E"}}>
            {allOk?"All divisions ready for draft":critical.length?`${critical.length} critical issue${critical.length>1?"s":""} — do not draft yet`:`${warnings.length} item${warnings.length>1?"s":""} need attention`}
          </div>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa"}}>{checks.filter(c=>c.ok).length}/{checks.length} checks passing</div>
        </div>
      </div>
      <div style={{padding:"14px 18px"}}>
        {divisions.map(div=>{
          const divChecks=checks.filter(c=>c.div===div.label);
          return(
            <div key={div.division} style={{marginBottom:14}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:div.color||"#1a1a2e",textTransform:"uppercase",letterSpacing:".07em",fontWeight:600,marginBottom:5}}>{div.label}</div>
              {divChecks.map(c=>(
                <div key={c.check} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",borderBottom:"1px solid #F9F8F4"}}>
                  <span style={{fontSize:11,color:c.ok?"#166534":c.critical?"#991B1B":"#92400E",flexShrink:0}}>{c.ok?"✓":c.critical?"✗":"⚠"}</span>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#555",flex:1}}>{c.check}</span>
                  {!c.ok&&c.critical&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:8,background:"#FEF2F2",color:"#991B1B",padding:"1px 6px",borderRadius:3}}>CRITICAL</span>}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── WOW 15: Schedule Config ──────────────────────────────────────────────────
function ScheduleConfig({onClose}){
  const [freq,setFreq]=useState("weekly");
  const [email,setEmail]=useState("");
  const [emails,setEmails]=useState(["lorenzo@grsht.com"]);
  const [sections,setSections]=useState({parity:true,payments:true,goalies:true,trend:false,retention:false});
  const add=()=>{if(email.includes("@")){setEmails(e=>[...e,email]);setEmail("");}};
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
      <div style={{background:"#fff",borderRadius:14,maxWidth:500,width:"100%",boxShadow:"0 24px 60px rgba(0,0,0,.22)",overflow:"hidden"}}>
        <div style={{padding:"18px 22px 14px",borderBottom:"1px solid #F0EEE8",background:"#1a1a2e",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#D4A017",textTransform:"uppercase",letterSpacing:".1em",marginBottom:3}}>📅 Automated Reports</div>
            <h2 style={{fontFamily:"'Fraunces',serif",fontSize:17,fontWeight:700,color:"#fff",margin:0}}>Schedule Report Email</h2>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#D4A017",fontSize:16,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{padding:"18px 22px",display:"flex",flexDirection:"column",gap:14}}>
          <div>
            <label style={fL}>Frequency</label>
            <div style={{display:"flex",gap:6}}>
              {["weekly","biweekly","daily"].map(f=>(
                <button key={f} onClick={()=>setFreq(f)} style={{fontFamily:"'DM Mono',monospace",fontSize:11,padding:"6px 14px",borderRadius:8,cursor:"pointer",background:freq===f?"#1a1a2e":"#F6F5F0",color:freq===f?"#D4A017":"#888",border:`1px solid ${freq===f?"#1a1a2e":"#E8E6DF"}`}}>{f}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={fL}>Recipients</label>
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="email@domain.com" onKeyDown={e=>e.key==="Enter"&&add()} style={inputS}/>
              <button onClick={add} style={{fontFamily:"'DM Mono',monospace",fontSize:11,background:"#1a1a2e",color:"#D4A017",border:"none",padding:"0 14px",borderRadius:6,cursor:"pointer"}}>Add</button>
            </div>
            {emails.map(e=>(
              <div key={e} style={{display:"flex",justifyContent:"space-between",fontFamily:"'DM Mono',monospace",fontSize:11,color:"#555",padding:"4px 0"}}>
                {e}<button onClick={()=>setEmails(em=>em.filter(x=>x!==e))} style={{background:"none",border:"none",color:"#aaa",cursor:"pointer",fontSize:12}}>✕</button>
              </div>
            ))}
          </div>
          <div>
            <label style={fL}>Include sections</label>
            {[["parity","Parity report"],["payments","Payment summary"],["goalies","Goalie assignments"],["trend","Registration trend"],["retention","Player retention"]].map(([k,l])=>(
              <label key={k} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",cursor:"pointer",fontFamily:"'DM Mono',monospace",fontSize:11,color:"#555"}}>
                <input type="checkbox" checked={sections[k]} onChange={()=>setSections(s=>({...s,[k]:!s[k]}))}/>
                {l}
              </label>
            ))}
          </div>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",lineHeight:1.6}}>
            Each digest includes a "View live dashboard" link. Subject: "Gold Rush 2027 — {"{frequency}"} Status Report · {"{date}"}". Watermarked with sender name.
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={onClose} style={{flex:1,fontFamily:"'DM Mono',monospace",fontSize:12,background:"#F6F5F0",border:"1px solid #E8E6DF",color:"#666",padding:"10px",borderRadius:8,cursor:"pointer"}}>Cancel</button>
            <button onClick={()=>{alert(`✓ Scheduled! ${emails.length} recipient${emails.length!==1?"s":""} will receive ${freq} reports.`);onClose();}} style={{flex:2,fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:500,background:"#1a1a2e",color:"#D4A017",border:"none",padding:"10px",borderRadius:8,cursor:"pointer"}}>
              Schedule reports →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Reports ─────────────────────────────────────────────────────────────
export default function Reports(){
  const [tab,setTab]=useState("parity");
  const [divFilter,setDivFilter]=useState("");
  const [showShare,setShowShare]=useState(false);
  const [showSchedule,setShowSchedule]=useState(false);
  const [showRadar,setShowRadar]=useState(false);
  const [showHeatmap,setShowHeatmap]=useState(false);
  const [showAgeChart,setShowAgeChart]=useState(false);
  const [exportingId,setExportingId]=useState(null);
  const [searchUnpaid,setSearchUnpaid]=useState("");
  const [reportHistory,setReportHistory]=useState([]);
  const [syncAge,setSyncAge]=useState(0);
  const [toast,setToast]=useState(null);

  const showToast=(msg)=>{setToast(msg);setTimeout(()=>setToast(null),3000);};
  useEffect(()=>{const t=setInterval(()=>setSyncAge(a=>a+1),60000);return()=>clearInterval(t);},[]);

  const fp   = divFilter?MOCK_PARITY.filter(d=>d.division===divFilter):MOCK_PARITY;
  const fg   = divFilter?MOCK_GOALIE.filter(d=>d.division===divFilter):MOCK_GOALIE;
  const fu   = (divFilter?MOCK_UNPAID.filter(p=>{const m=MOCK_PARITY.find(d=>d.division===divFilter);return p.division===m?.label;}):MOCK_UNPAID).filter(p=>!searchUnpaid||p.name.toLowerCase().includes(searchUnpaid.toLowerCase()));

  const tPaid=MOCK_PARITY.reduce((s,d)=>s+d.paid,0);
  const tPending=MOCK_UNPAID.length;
  const goalieIssues=MOCK_GOALIE.filter(d=>d.teams.some(t=>t.goalies.length===0)).length;
  const anomalyCount=MOCK_PARITY.reduce((s,d)=>s+d.anomalies.length,0);

  const TAB_STATUS={
    parity:   {label:"Parity report",      badge:anomalyCount>0?`${anomalyCount} ⚠`:"✓",    badgeCol:anomalyCount>0?"#92400E":"#166534"},
    unpaid:   {label:"Unpaid players",     badge:MOCK_UNPAID.length>0?`${MOCK_UNPAID.length} ⚠`:"✓ All paid", badgeCol:MOCK_UNPAID.length>0?"#92400E":"#166534"},
    goalies:  {label:"Goalie assignments", badge:goalieIssues>0?`${goalieIssues} missing ⚠`:"✓ Covered", badgeCol:goalieIssues>0?"#991B1B":"#166534"},
    readiness:{label:"Draft readiness",    badge:"→",   badgeCol:"#1a1a2e"},
    export:   {label:"Export centre",      badge:"↓",   badgeCol:"#1a1a2e"},
    history:  {label:"Report history",     badge:`${reportHistory.length}`,badgeCol:"#aaa"},
    faq:      {label:"Help & FAQ",          badge:"?",  badgeCol:"#1a1a2e"},
  };

  const handleExport=(id,filename)=>{
    setExportingId(id);
    setReportHistory(h=>[{id:Date.now(),name:filename||id,time:"Just now",user:"Lorenzo",reg:totalReg,paidPct:Math.round(tPaid/totalReg*100)},...h.slice(0,9)]);
    setTimeout(()=>{setExportingId(null);showToast(`✓ ${filename||id} downloaded`);},1200);
  };

  const shareLink=`https://grsht.com/reports/share/${btoa("season2027").slice(0,16)}`;

  const printHandout=()=>{
    const w=window.open("","_blank","width=820,height=680");
    if(!w)return;
    w.document.write(`<!DOCTYPE html><html><head><title>Gold Rush 2027 · Committee Report</title><style>body{font-family:Georgia,serif;margin:40px;color:#1a1a2e}h1{font-size:22px;margin:0 0 3px}h2{font-size:13px;color:#888;font-weight:400;margin:0 0 24px}table{width:100%;border-collapse:collapse;margin:16px 0}th{background:#1a1a2e;color:#D4A017;padding:8px 12px;text-align:left;font-family:monospace;font-size:11px}td{padding:8px 12px;border-bottom:1px solid #eee;font-size:12px}.ok{color:#166534;font-weight:bold}.warn{color:#92400E;font-weight:bold}.bad{color:#991B1B;font-weight:bold}footer{font-family:monospace;font-size:10px;color:#bbb;margin-top:24px;padding-top:12px;border-top:1px solid #eee}</style></head><body>
    <h1>🏒 Gold Rush Senior Hockey Tournament</h1><h2>Season 2027 Committee Report · Generated ${new Date().toLocaleDateString()} · ${LAST_SYNC}</h2>
    <table><thead><tr><th>Division</th><th>Registered</th><th>Paid %</th><th>Goalies</th><th>Avg Parity</th><th>Status</th></tr></thead><tbody>
    ${MOCK_PARITY.map(d=>{const avg=(d.teams.reduce((s,t)=>s+t.parity,0)/Math.max(1,d.teams.length)).toFixed(1);const cls=d.anomalies.length===0?"ok":d.anomalies.length<=1?"warn":"bad";return`<tr><td><strong>${d.label}</strong></td><td>${d.registered}/${d.cap} (${Math.round(d.registered/d.cap*100)}%)</td><td>${Math.round(d.paid/d.registered*100)}%</td><td>${d.goalies}</td><td>${avg}</td><td class="${cls}">${d.anomalies.length===0?"✓ Ready":d.anomalies.length<=1?"⚠ Review":"✗ Action needed"}</td></tr>`;}).join("")}
    </tbody></table>
    <p style="font-family:monospace;font-size:12px">Total registered: ${totalReg} · Paid: ${tPaid} (${Math.round(tPaid/totalReg*100)}%) · Outstanding: $${tPending*REG_FEE} · Goalies: ${MOCK_PARITY.reduce((s,d)=>s+d.goalies,0)}</p>
    <footer>Gold Rush Senior Hockey Tournament · Season 2027 · Confidential committee document</footer>
    </body></html>`);
    w.document.close();w.print();
  };

  return(
    <div style={{fontFamily:"'Fraunces',Georgia,serif",background:"#F6F5F0",minHeight:"100vh",padding:"22px 24px 60px",maxWidth:1300}}>
      <style>{`
        *{box-sizing:border-box}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        @keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .rhov:hover{background:#F0F4FF!important}
        @media(max-width:768px){.rgrid{grid-template-columns:1fr!important}.rhdr{flex-direction:column!important}}
      `}</style>

      {showSchedule&&<ScheduleConfig onClose={()=>setShowSchedule(false)}/>}

      {/* WOW 14: Share modal */}
      {showShare&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setShowShare(false)}>
          <div style={{background:"#fff",borderRadius:14,padding:"24px",maxWidth:440,width:"90vw",boxShadow:"0 24px 60px rgba(0,0,0,.22)"}} onClick={e=>e.stopPropagation()}>
            <h2 style={{fontFamily:"'Fraunces',serif",fontSize:17,fontWeight:700,color:"#1a1a2e",margin:"0 0 6px"}}>Shareable report link</h2>
            <p style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#888",margin:"0 0 14px",lineHeight:1.6}}>Read-only view for board members and sponsors — no WordPress login needed. Watermarked with expiry date. Valid for 7 days.</p>
            <div style={{background:"#F6F5F0",border:"1px solid #E8E6DF",borderRadius:8,padding:"10px 12px",fontFamily:"'DM Mono',monospace",fontSize:11,color:"#555",marginBottom:12,wordBreak:"break-all"}}>{shareLink}</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{navigator.clipboard?.writeText(shareLink);showToast("🔗 Link copied to clipboard");setShowShare(false);}} style={{flex:1,fontFamily:"'DM Mono',monospace",fontSize:12,background:"#1a1a2e",color:"#D4A017",border:"none",padding:"10px",borderRadius:8,cursor:"pointer"}}>Copy link</button>
              <button onClick={()=>setShowShare(false)} style={{fontFamily:"'DM Mono',monospace",fontSize:12,background:"#F6F5F0",border:"1px solid #E8E6DF",color:"#666",padding:"10px 16px",borderRadius:8,cursor:"pointer"}}>Cancel</button>
            </div>
            <p style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#bbb",margin:"10px 0 0"}}>Expires {new Date(Date.now()+7*86400000).toLocaleDateString()} · Can be revoked from Report history</p>
          </div>
        </div>
      )}

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div className="rhdr" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{display:"inline-block",fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:500,letterSpacing:".1em",textTransform:"uppercase",background:"#1a1a2e",color:"#D4A017",padding:"3px 12px",borderRadius:99,marginBottom:7}}>Season 2027</div>
          {/* #25 renamed */}
          <h1 style={{fontFamily:"'Fraunces',serif",fontSize:26,fontWeight:700,color:"#1a1a2e",margin:"0 0 3px",letterSpacing:"-.5px"}}>Season 2027 Reports</h1>
          {/* #5 action-oriented subtitle */}
          <p style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#aaa",margin:0}}>Analyse team balance · track payments · assign goalies · export for board meetings</p>
          {/* #6 last updated with stale warning */}
          <p style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:syncAge>=2?"#92400E":"#bbb",margin:"4px 0 0"}}>
            Data as of {LAST_SYNC}{syncAge>=2&&" · ⚠ May be stale"}
            <button onClick={()=>setSyncAge(0)} style={{background:"none",border:"none",color:"#1a1a2e",fontFamily:"'DM Mono',monospace",fontSize:10,cursor:"pointer",textDecoration:"underline",marginLeft:6}}>Refresh</button>
          </p>
        </div>
        <div style={{display:"flex",gap:7,flexWrap:"wrap",alignItems:"center"}}>
          <button onClick={()=>setShowSchedule(true)} style={{fontFamily:"'DM Mono',monospace",fontSize:11,background:"#EEF2FF",border:"1px solid #C7D2FE",color:"#1a1a2e",padding:"8px 12px",borderRadius:8,cursor:"pointer"}}>📅 Schedule</button>
          <button onClick={()=>setShowShare(true)} style={{fontFamily:"'DM Mono',monospace",fontSize:11,background:"#fff",border:"1px solid #E8E6DF",color:"#666",padding:"8px 12px",borderRadius:8,cursor:"pointer"}}>🔗 Share</button>
          {/* #7 print preview committee handout */}
          <button onClick={printHandout} style={{fontFamily:"'DM Mono',monospace",fontSize:11,background:"#fff",border:"1px solid #E8E6DF",color:"#666",padding:"8px 12px",borderRadius:8,cursor:"pointer"}}>⎙ Print handout</button>
          {/* #8 export described */}
          <button onClick={()=>setTab("export")} style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,background:"#1a1a2e",color:"#D4A017",border:"none",padding:"8px 14px",borderRadius:8,cursor:"pointer"}}>↓ Export centre</button>
        </div>
      </div>

      {/* #9 Summary metric cards — clickable to jump tabs */}
      <div className="rgrid" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
        {[
          {label:"Registered", val:totalReg,   sub:"players total",                   color:"#1a1a2e",tab:"parity"},
          {label:"Paid",       val:tPaid,       sub:`${Math.round(tPaid/totalReg*100)}% collected`, color:"#166534",tab:"unpaid"},
          {label:"Outstanding",val:tPending,    sub:`$${tPending*REG_FEE} owed`,       color:"#92400E",tab:"unpaid"},
          {label:"Goalies",    val:MOCK_PARITY.reduce((s,d)=>s+d.goalies,0), sub:goalieIssues>0?`⚠ ${goalieIssues} teams uncovered`:"All teams covered", color:goalieIssues>0?"#991B1B":"#166534",tab:"goalies"},
        ].map(c=>(
          <div key={c.label} onClick={()=>setTab(c.tab)} style={{background:"#fff",border:"1px solid #E8E6DF",borderRadius:10,padding:"14px 16px",cursor:"pointer",transition:"box-shadow .15s",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:c.color}}/>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",textTransform:"uppercase",letterSpacing:".07em",margin:"8px 0 4px"}}>{c.label}</div>
            <div style={{fontFamily:"'Fraunces',serif",fontSize:28,fontWeight:700,color:c.color,lineHeight:1,marginBottom:3}}>{c.val}</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#bbb"}}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* #3 Division filter — persistent across all tabs */}
      <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:".07em"}}>Division:</span>
        {[{value:"",label:"All divisions"},...MOCK_PARITY.map(d=>({value:d.division,label:d.label}))].map(opt=>(
          <button key={opt.value} onClick={()=>setDivFilter(opt.value)} style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,padding:"5px 14px",borderRadius:99,cursor:"pointer",background:divFilter===opt.value?"#1a1a2e":"#fff",color:divFilter===opt.value?"#D4A017":"#666",border:`1px solid ${divFilter===opt.value?"#1a1a2e":"#E8E6DF"}`}}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* #19 Tabs with status badges */}
      <div style={{display:"flex",gap:5,marginBottom:16,flexWrap:"wrap"}}>
        {Object.entries(TAB_STATUS).map(([key,{label,badge,badgeCol}])=>(
          <button key={key} onClick={()=>setTab(key)} style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,padding:"7px 14px",borderRadius:8,cursor:"pointer",transition:"all .15s",background:tab===key?"#1a1a2e":"#fff",color:tab===key?"#D4A017":"#666",border:`1px solid ${tab===key?"#1a1a2e":"#E8E6DF"}`,display:"flex",alignItems:"center",gap:6}}>
            {label}
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,background:tab===key?"rgba(212,160,23,.15)":"#F6F5F0",color:tab===key?"#D4A017":badgeCol,padding:"1px 6px",borderRadius:99}}>{badge}</span>
          </button>
        ))}
      </div>

      {/* ── PARITY REPORT ────────────────────────────────────────────────────── */}
      {tab==="parity"&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>

          {/* WOW 6: AI Executive Summary */}
          <AIExecSummary divisions={fp}/>

          {/* Chart toggles */}
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button onClick={()=>setShowRadar(r=>!r)} style={{fontFamily:"'DM Mono',monospace",fontSize:11,background:showRadar?"#1a1a2e":"#fff",color:showRadar?"#D4A017":"#888",border:`1px solid ${showRadar?"#1a1a2e":"#E8E6DF"}`,padding:"6px 14px",borderRadius:8,cursor:"pointer"}}>🕸 Team radar charts</button>
            <button onClick={()=>setShowHeatmap(h=>!h)} style={{fontFamily:"'DM Mono',monospace",fontSize:11,background:showHeatmap?"#1a1a2e":"#fff",color:showHeatmap?"#D4A017":"#888",border:`1px solid ${showHeatmap?"#1a1a2e":"#E8E6DF"}`,padding:"6px 14px",borderRadius:8,cursor:"pointer"}}>📅 Registration heatmap</button>
            <button onClick={()=>setShowAgeChart(a=>!a)} style={{fontFamily:"'DM Mono',monospace",fontSize:11,background:showAgeChart?"#1a1a2e":"#fff",color:showAgeChart?"#D4A017":"#888",border:`1px solid ${showAgeChart?"#1a1a2e":"#E8E6DF"}`,padding:"6px 14px",borderRadius:8,cursor:"pointer"}}>👥 Age distribution</button>
          </div>

          {/* WOW 3: Registration heatmap */}
          {showHeatmap&&(
            <div style={{background:"#fff",border:"1px solid #E8E6DF",borderRadius:12,padding:"18px 20px"}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:".08em",marginBottom:12}}>Registration heatmap · Jan–Apr 2027</div>
              <RegHeatmap/>
            </div>
          )}

          {/* WOW 5: Age distribution */}
          {showAgeChart&&(
            <div style={{background:"#fff",border:"1px solid #E8E6DF",borderRadius:12,padding:"18px 20px"}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:".08em",marginBottom:12}}>Age distribution — all divisions</div>
              <AgeDistribution/>
            </div>
          )}

          {/* #12 Tier distribution per division */}
          <div style={{background:"#fff",border:"1px solid #E8E6DF",borderRadius:12,padding:"18px 20px"}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:".08em",marginBottom:12}}>Tier distribution per division</div>
            <div className="rgrid" style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
              {fp.map(div=>(
                <div key={div.division}>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:div.color||"#1a1a2e",fontWeight:600,marginBottom:5}}>{div.label}</div>
                  <div style={{height:14,display:"flex",borderRadius:6,overflow:"hidden",gap:1,marginBottom:4}}>
                    {[{k:"A",c:"#FCE8E8",sc:"#7A1818"},{k:"B",c:"#FEF0E8",sc:"#7A4518"},{k:"C",c:"#FEF9E7",sc:"#7A5A18"},{k:"R",c:"#E8F0FE",sc:"#1A3F8F"}].filter(t=>div.tiers[t.k]>0).map(t=>(
                      <div key={t.k} style={{flex:div.tiers[t.k],background:t.c,display:"flex",alignItems:"center",justifyContent:"center"}} title={`${t.k}: ${div.tiers[t.k]} players`}>
                        <span style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:t.sc,fontWeight:700}}>{div.tiers[t.k]}</span>
                      </div>
                    ))}
                  </div>
                  {/* #23 anomaly detection inline */}
                  {div.anomalies.map((a,i)=><div key={i} style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#92400E",marginTop:2,display:"flex",alignItems:"center",gap:4}}><span>⚠</span>{a}</div>)}
                </div>
              ))}
            </div>
          </div>

          {/* Parity per team with WOW 1 radar */}
          {fp.map(div=>(
            <div key={div.division} style={{background:"#fff",border:"1px solid #E8E6DF",borderRadius:12,overflow:"hidden"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",borderBottom:"1px solid #F0EEE8"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:600,color:div.color||"#555"}}>{div.label}</span>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa"}}>{div.teams.length} teams · {div.registered} players</span>
                  {/* #10 YoY */}
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:600,color:div.registered>div.prior_year?"#166534":"#991B1B"}}>
                    {div.registered>div.prior_year?"↑":"↓"}{Math.abs(div.registered-div.prior_year)} vs {SEASON-1}
                  </span>
                </div>
                {/* #21 capacity */}
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:div.registered>=(div.cap||30)?"#991B1B":"#888"}}>
                  {div.registered}/{div.cap} cap ({Math.round(div.registered/(div.cap||30)*100)}%)
                </span>
              </div>
              <div style={{padding:"14px 18px"}}>
                {div.teams.map(team=>(
                  <div key={team.name} style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,padding:"10px",background:"#FAFAF8",borderRadius:8}}>
                    {/* WOW 1 radar toggleable */}
                    {showRadar&&<ParityRadar team={team} allTeams={div.teams}/>}
                    <div style={{flex:1}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                        <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#555",display:"flex",alignItems:"center",gap:6}}>
                          <span style={{width:8,height:8,borderRadius:"50%",background:team.colour,display:"inline-block"}}/>
                          {team.name}
                        </span>
                        <div style={{display:"flex",gap:10}}>
                          <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa"}}>Skill {team.skill.toFixed(1)}</span>
                          <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa"}}>Age {team.age.toFixed(1)}</span>
                          <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:700,color:pColor(team.parity)}}>Parity {team.parity.toFixed(1)}</span>
                          {/* #30 contextual help */}
                          <span title="Parity score: composite of skill balance, age distribution, and position coverage. 73+ = balanced, 68–72 = needs review, <68 = rebalance required." style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#bbb",cursor:"help",border:"1px solid #E8E6DF",borderRadius:"50%",padding:"0 4px"}}>?</span>
                        </div>
                      </div>
                      <div style={{height:7,background:"#F0EEE8",borderRadius:99,overflow:"hidden",marginBottom:5}}>
                        <div style={{height:"100%",width:`${team.parity}%`,background:team.colour,borderRadius:99,transition:"width .8s ease"}}/>
                      </div>
                      {/* #28 position distribution */}
                      <div style={{display:"flex",gap:3}}>
                        {[{k:"goalies",l:"G",min:1},{k:"defense",l:"D",min:2},{k:"center",l:"C",min:1},{k:"wing",l:"W",min:2}].map(pos=>{
                          const ok=team[pos.k]>=pos.min;
                          return <span key={pos.k} style={{fontFamily:"'DM Mono',monospace",fontSize:8,background:ok?"#E6F4EA":"#FEE2E2",color:ok?"#166534":"#991B1B",padding:"1px 5px",borderRadius:3,fontWeight:600}}>{pos.l}:{team[pos.k]}</span>;
                        })}
                        <span style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:pColor(team.parity),marginLeft:4,fontWeight:500}}>{pLabel(team.parity)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── UNPAID PLAYERS ────────────────────────────────────────────────────── */}
      {tab==="unpaid"&&(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {/* WOW 2: Payment thermometer */}
          <div style={{background:"#fff",border:"1px solid #E8E6DF",borderRadius:12,padding:"18px 20px"}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:".08em",marginBottom:14}}>Payment collection overview</div>
            <PaymentThermometer paid={tPaid} total={totalReg} pending={tPending}/>
          </div>
          {/* #13 Financial summary */}
          <div style={{background:"#fff",border:"1px solid #E8E6DF",borderRadius:12,padding:"16px 20px"}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:".08em",marginBottom:12}}>Financial summary</div>
            <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
              {[{l:"Expected",v:`$${totalReg*REG_FEE}`,c:"#1a1a2e"},{l:"Collected",v:`$${tPaid*REG_FEE}`,c:"#166534"},{l:"Outstanding",v:`$${tPending*REG_FEE}`,c:"#92400E"},{l:"Waived",v:`$${totalWaived*REG_FEE}`,c:"#4C1D95"}].map(s=>(
                <div key={s.l} style={{textAlign:"center",padding:"10px 16px",background:"#F6F5F0",borderRadius:8}}>
                  <div style={{fontFamily:"'Fraunces',serif",fontSize:18,fontWeight:700,color:s.c}}>{s.v}</div>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa",textTransform:"uppercase"}}>{s.l}</div>
                </div>
              ))}
              <button onClick={()=>handleExport("financial","grsh-financial-summary-2027.csv")} style={{fontFamily:"'DM Mono',monospace",fontSize:10,background:"#F6F5F0",border:"1px solid #E8E6DF",color:"#666",padding:"5px 12px",borderRadius:6,cursor:"pointer",marginLeft:"auto",alignSelf:"center"}}>↓ Export financial summary</button>
            </div>
          </div>
          {/* Player list */}
          <div style={{background:"#fff",border:"1px solid #E8E6DF",borderRadius:12,overflow:"hidden"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",borderBottom:"1px solid #F0EEE8"}}>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,textTransform:"uppercase",letterSpacing:".07em",color:"#555"}}>
                Outstanding payments
                {/* #4 correct tab label */}
                <span style={{marginLeft:8,fontFamily:"'DM Mono',monospace",fontSize:9,background:fu.length>0?"#FEF3C7":"#E6F4EA",color:fu.length>0?"#92400E":"#166534",padding:"1px 8px",borderRadius:99}}>
                  {fu.length>0?`${fu.length} unpaid`:"✓ All paid"}
                </span>
              </span>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                {/* #27 search */}
                <input value={searchUnpaid} onChange={e=>setSearchUnpaid(e.target.value)} placeholder="Search player…" style={{fontFamily:"'DM Mono',monospace",fontSize:11,background:"#F6F5F0",border:"1px solid #E8E6DF",borderRadius:6,padding:"5px 10px",color:"#333",outline:"none"}}/>
                <button onClick={()=>showToast(`📧 Payment reminder sent to ${fu.filter(p=>!p.reminder_sent).length} players`)} style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,background:"#1a1a2e",color:"#D4A017",border:"none",padding:"7px 14px",borderRadius:8,cursor:"pointer"}}>📧 Send reminders</button>
              </div>
            </div>
            {fu.length===0?(
              <div style={{padding:"48px 24px",textAlign:"center"}}>
                <div style={{fontSize:28,marginBottom:8}}>✅</div>
                <p style={{fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,color:"#166534",margin:"0 0 4px"}}>All players paid</p>
                <p style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#aaa",margin:0}}>No outstanding registrations{divFilter?` in ${MOCK_PARITY.find(d=>d.division===divFilter)?.label}`:""}</p>
              </div>
            ):(
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr>{["Player","Division","Amount","Days overdue","Reminder"].map(h=><th key={h} style={TH}>{h}</th>)}<th style={TH}/></tr></thead>
                <tbody>
                  {fu.map(p=>(
                    <tr key={p.id} className="rhov" style={{borderBottom:"1px solid #F3F2ED",background:p.days_since>=14?"#FFF7F0":"transparent"}}>
                      <td style={TD}><span style={{fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:600,color:"#1a1a2e"}}>{p.name}</span></td>
                      <td style={TD}><span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#555"}}>{p.division}</span></td>
                      <td style={TD}><span style={{fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:700,color:"#92400E"}}>${p.amount}</span></td>
                      <td style={TD}><span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:p.days_since>=14?"#991B1B":"#555",fontWeight:p.days_since>=14?600:400}}>{p.days_since}d{p.days_since>=14?" ⚠":""}</span></td>
                      <td style={TD}>{p.reminder_sent?<span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa"}}>Sent</span>:<span style={{fontFamily:"'DM Mono',monospace",fontSize:10,background:"#FEF3C7",color:"#92400E",padding:"2px 8px",borderRadius:99}}>Not sent</span>}</td>
                      <td style={TD}>
                        <button onClick={()=>showToast(`📧 Reminder sent to ${p.name}`)} style={{fontFamily:"'DM Mono',monospace",fontSize:10,background:"transparent",border:"1px solid #E8E6DF",color:"#666",padding:"3px 10px",borderRadius:5,cursor:"pointer"}}>📧 Remind</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── GOALIE ASSIGNMENTS ────────────────────────────────────────────────── */}
      {tab==="goalies"&&(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {goalieIssues>0&&<div style={{fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:500,background:"#FEF2F2",color:"#991B1B",border:"1px solid #FCA5A5",borderRadius:8,padding:"11px 16px"}}>⚠ {goalieIssues} division{goalieIssues>1?"s":""} have teams without a goalie — action required before draft day</div>}
          {/* WOW 7: Goalie optimizer */}
          <div style={{background:"#fff",border:"1px solid #E8E6DF",borderRadius:12,padding:"16px 18px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,textTransform:"uppercase",letterSpacing:".07em",color:"#555"}}>Goalie distribution optimizer</div>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",marginTop:2}}>Drag goalies from pool to teams — or use auto-assign</div>
              </div>
              <button onClick={()=>showToast("⚡ Goalies auto-assigned using tier matching")} style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,background:"#1a1a2e",color:"#D4A017",border:"none",padding:"7px 14px",borderRadius:8,cursor:"pointer"}}>⚡ Auto-assign</button>
            </div>
            <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
              {[{l:"Teams with goalie",v:MOCK_GOALIE.flatMap(d=>d.teams).filter(t=>t.goalies.length>0).length},{l:"Teams missing goalie",v:MOCK_GOALIE.flatMap(d=>d.teams).filter(t=>t.goalies.length===0).length},{l:"Pool available",v:MOCK_GOALIE.reduce((s,d)=>s+d.pool.length,0)}].map(s=>(
                <div key={s.l} style={{textAlign:"center",padding:"10px 16px",background:s.l.includes("missing")&&s.v>0?"#FEF2F2":"#F6F5F0",borderRadius:8,border:`1px solid ${s.l.includes("missing")&&s.v>0?"#FCA5A5":"#E8E6DF"}`}}>
                  <div style={{fontFamily:"'Fraunces',serif",fontSize:20,fontWeight:700,color:s.l.includes("missing")&&s.v>0?"#991B1B":"#1a1a2e"}}>{s.v}</div>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#aaa"}}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
          {fg.map(div=>(
            <div key={div.division} style={{background:"#fff",border:"1px solid #E8E6DF",borderRadius:12,overflow:"hidden"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",borderBottom:"1px solid #F0EEE8"}}>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:600,color:MOCK_PARITY.find(d=>d.division===div.division)?.color||"#555"}}>{div.label}</span>
                {div.pool.length>0&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#166534"}}>Pool: {div.pool.join(", ")}</span>}
              </div>
              <div style={{padding:"14px 18px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10}}>
                {div.teams.map(t=>(
                  <div key={t.name} style={{border:`1px solid ${t.goalies.length===0?"#FCA5A5":"#E8E6DF"}`,background:t.goalies.length===0?"#FEF2F2":"#F9F8F4",borderRadius:8,padding:"10px 12px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:t.colour,flexShrink:0}}/>
                      <span style={{fontFamily:"'Fraunces',serif",fontSize:12,fontWeight:700,color:"#1a1a2e"}}>{t.name}</span>
                    </div>
                    {t.goalies.length===0?<div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#DC2626",fontWeight:500}}>⚠ No goalie</div>
                    :t.goalies.map(g=><div key={g} style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#555",padding:"2px 0"}}>🥅 {g}</div>)}
                    {t.goalies.length===0&&div.pool.length>0&&<button onClick={()=>showToast(`✓ ${div.pool[0]} assigned to ${t.name}`)} style={{fontFamily:"'DM Mono',monospace",fontSize:9,background:"#1a1a2e",color:"#D4A017",border:"none",padding:"4px 8px",borderRadius:4,cursor:"pointer",marginTop:6,width:"100%"}}>Assign {div.pool[0]}</button>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── DRAFT READINESS ───────────────────────────────────────────────────── */}
      {tab==="readiness"&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          {/* WOW 11: Pre-draft checklist */}
          <div style={{background:"#fff",border:"1px solid #E8E6DF",borderRadius:12,overflow:"hidden"}}>
            <div style={{padding:"14px 18px",borderBottom:"1px solid #F0EEE8",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,textTransform:"uppercase",letterSpacing:".07em",color:"#555"}}>Pre-draft validation · {SEASON}</span>
              <button onClick={()=>handleExport("readiness","grsh-draft-readiness-2027.csv")} style={{fontFamily:"'DM Mono',monospace",fontSize:10,background:"#F6F5F0",border:"1px solid #E8E6DF",color:"#666",padding:"5px 12px",borderRadius:6,cursor:"pointer"}}>↓ Export report</button>
            </div>
            <DraftReadiness divisions={fp}/>
          </div>
          {/* WOW 4: Division health scorecard */}
          <div style={{background:"#fff",border:"1px solid #E8E6DF",borderRadius:12,padding:"18px 20px"}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:".08em",marginBottom:12}}>Division health scorecard</div>
            <HealthScorecard divisions={fp}/>
          </div>
          {/* WOW 9: Retention */}
          <div style={{background:"#fff",border:"1px solid #E8E6DF",borderRadius:12,padding:"18px 20px"}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:".08em",marginBottom:12}}>Player retention analysis</div>
            <RetentionChart divisions={fp}/>
          </div>
          {/* WOW 10: Predictive fill */}
          <div style={{background:"#fff",border:"1px solid #E8E6DF",borderRadius:12,padding:"18px 20px"}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:".08em",marginBottom:12}}>Predictive fill rate</div>
            <FillRatePredictor divisions={fp}/>
          </div>
          {/* WOW 12: Sandbagging analytics */}
          <div style={{background:"#fff",border:"1px solid #E8E6DF",borderRadius:12,overflow:"hidden"}}>
            <div style={{padding:"14px 18px",borderBottom:"1px solid #F0EEE8"}}>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,textTransform:"uppercase",letterSpacing:".07em",color:"#555"}}>Sandbagging analytics</span>
            </div>
            <div style={{padding:"14px 18px"}}>
              <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
                {[{l:"Flagged this season",v:MOCK_SANDBAG.length,c:"#991B1B"},{l:"Prior year flags",v:2,c:"#92400E"},{l:"YoY trend",v:"↑ +1",c:"#991B1B"}].map(s=>(
                  <div key={s.l} style={{background:"#FEF2F2",border:"1px solid #FCA5A5",borderRadius:8,padding:"10px 14px"}}>
                    <div style={{fontFamily:"'Fraunces',serif",fontSize:20,fontWeight:700,color:s.c,lineHeight:1,marginBottom:2}}>{s.v}</div>
                    <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#888",textTransform:"uppercase",letterSpacing:".06em"}}>{s.l}</div>
                  </div>
                ))}
              </div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr>{["Player","Tier history","Registered for","Expected division","Seasons"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
                <tbody>
                  {MOCK_SANDBAG.map(p=>(
                    <tr key={p.player} style={{borderBottom:"1px solid #F3F2ED",background:"#FFFBEB"}}>
                      <td style={TD}><span style={{fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:600,color:"#1a1a2e"}}>{p.player}</span></td>
                      <td style={TD}><span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#92400E",fontWeight:500}}>{p.tier_history}</span></td>
                      <td style={TD}><Pill {...(DIV_BG[p.div]||{})} small>{MOCK_PARITY.find(d=>d.division===p.div)?.label||p.self_reported}</Pill></td>
                      <td style={TD}><span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#1a1a2e"}}>{p.expected}</span></td>
                      <td style={TD}><span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#555"}}>{p.seasons}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── EXPORT CENTRE ─────────────────────────────────────────────────────── */}
      {tab==="export"&&(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:"#fff",border:"1px solid #E8E6DF",borderRadius:12,overflow:"hidden"}}>
            <div style={{padding:"14px 18px",borderBottom:"1px solid #F0EEE8",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,textTransform:"uppercase",letterSpacing:".07em",color:"#555"}}>Export centre · Season 2027</span>
              {/* #28 descriptive filenames note */}
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa"}}>All filenames include division + date · e.g. grsh-players-2027-05-31.csv</span>
            </div>
            <div style={{padding:"18px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
              {[
                {id:"players",   title:"Player pool",       desc:"All players, tiers, payment, jersey sizes",  icon:"👥",type:"CSV",  filename:"grsh-players-2027.csv"},
                {id:"rosters",   title:"Team rosters",      desc:"Rosters by division, team, position",        icon:"📋",type:"PDF",  filename:"grsh-rosters-2027.pdf"},
                {id:"parity",    title:"Parity report",     desc:"Full parity breakdown per division/team",    icon:"⚖️",type:"CSV",  filename:"grsh-parity-2027.csv"},
                {id:"unpaid",    title:"Unpaid players",    desc:"Outstanding registrations and amounts owed", icon:"💳",type:"CSV",  filename:"grsh-unpaid-2027.csv"},
                {id:"goalies",   title:"Goalie summary",    desc:"Assignments and pool per division",          icon:"🥅",type:"CSV",  filename:"grsh-goalies-2027.csv"},
                {id:"alternates",title:"Alternate pool",    desc:"Subs with availability and eligibility",     icon:"📞",type:"CSV",  filename:"grsh-alternates-2027.csv"},
                {id:"history",   title:"Import history",    desc:"All imported historical player records",     icon:"📂",type:"CSV",  filename:"grsh-history-2027.csv"},
                {id:"handout",   title:"Committee handout", desc:"One-page branded PDF for board meetings",    icon:"📄",type:"PDF",  filename:"grsh-committee-handout-2027.pdf"},
                {id:"audit",     title:"Audit log",         desc:"Full admin action and change history",       icon:"🔍",type:"CSV",  filename:"grsh-audit-2027.csv"},
                {id:"fullpack",  title:"Full data package", desc:"All reports in one ZIP archive",             icon:"📦",type:"ZIP",  filename:"grsh-full-package-2027.zip"},
              ].map(e=>(
                <div key={e.id} style={{background:"#FAFAF8",border:"1px solid #E8E6DF",borderRadius:10,padding:"16px"}}>
                  <div style={{fontSize:22,marginBottom:8}}>{e.icon}</div>
                  <p style={{fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:700,color:"#1a1a2e",margin:"0 0 4px"}}>{e.title}</p>
                  <p style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#888",margin:"0 0 4px",lineHeight:1.5}}>{e.desc}</p>
                  <p style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:"#bbb",margin:"0 0 12px"}}>↳ {e.filename}</p>
                  <button onClick={()=>e.id==="handout"?printHandout():handleExport(e.id,e.filename)} style={{width:"100%",fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,background:exportingId===e.id?"#166534":"#1a1a2e",color:"#D4A017",border:"none",padding:"8px 0",borderRadius:7,cursor:"pointer",transition:"background .3s"}}>
                    {exportingId===e.id?"✓ Downloaded":`↓ Download ${e.type}`}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── REPORT HISTORY ────────────────────────────────────────────────────── */}
      {tab==="history"&&(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:"#fff",border:"1px solid #E8E6DF",borderRadius:12,overflow:"hidden"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",borderBottom:"1px solid #F0EEE8"}}>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,textTransform:"uppercase",letterSpacing:".07em",color:"#555"}}>Report history</span>
              <button onClick={()=>setShowSchedule(true)} style={{fontFamily:"'DM Mono',monospace",fontSize:11,background:"#1a1a2e",color:"#D4A017",border:"none",padding:"6px 14px",borderRadius:8,cursor:"pointer"}}>📅 Schedule reports</button>
            </div>
            {reportHistory.length===0?(
              <div style={{padding:"48px 24px",textAlign:"center"}}>
                <div style={{fontSize:28,marginBottom:8}}>📋</div>
                <p style={{fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,color:"#1a1a2e",margin:"0 0 6px"}}>No report history yet</p>
                <p style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#aaa",margin:0}}>Generated and exported reports will appear here with timestamp, user, and a snapshot of key metrics at the time of export.</p>
              </div>
            ):reportHistory.map(r=>(
              <div key={r.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 18px",borderBottom:"1px solid #F3F2ED"}}>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#555",flex:1}}>{r.name}</span>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa"}}>{r.time} · by {r.user}</span>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa"}}>Reg: {totalReg} · Paid: {Math.round(tPaid/totalReg*100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── FAQ ──────────────────────────────────────────────────────────────── */}
      {tab==="faq"&&(
        <div style={{background:"#fff",border:"1px solid #E8E6DF",borderRadius:12,padding:"24px 28px"}}>
          <FAQPanel/>
        </div>
      )}

      {/* Toast */}
      {toast&&<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:500,background:"#1a1a2e",color:"#D4A017",padding:"10px 22px",borderRadius:99,boxShadow:"0 8px 24px rgba(0,0,0,.2)",zIndex:2000,animation:"slideUp .25s ease",whiteSpace:"nowrap"}}>{toast}</div>}
    </div>
  );
}

const TH={fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:500,color:"#888",textTransform:"uppercase",letterSpacing:".07em",padding:"10px 14px",textAlign:"left",borderBottom:"1px solid #E8E6DF",background:"#FAFAF8",whiteSpace:"nowrap"};
const TD={padding:"11px 14px",verticalAlign:"middle",borderBottom:"1px solid #F3F2ED"};
const fL={fontFamily:"'DM Mono',monospace",fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:".07em",display:"block",marginBottom:5};
const inputS={fontFamily:"'DM Mono',monospace",fontSize:12,width:"100%",background:"#F6F5F0",border:"1px solid #E8E6DF",borderRadius:6,padding:"7px 10px",color:"#333",outline:"none"};
