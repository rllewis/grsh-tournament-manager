import { JSDOM } from "jsdom";
import path from "path"; import fs from "fs"; import babel from "@babel/core"; import { createRequire } from "module";
const require = createRequire(import.meta.url); const root = process.cwd();
for (const f of ["pages/Rosters.jsx","lib/rosterEngine.js","lib/playerScoring.js"]) {
  fs.mkdirSync(path.dirname(path.join(root,".smoke/out",f)),{recursive:true});
  const r = babel.transformFileSync(path.join(root,"src",f),{presets:[["@babel/preset-env",{targets:{node:"current"},modules:"commonjs"}],["@babel/preset-react",{runtime:"automatic"}]],babelrc:false,configFile:false});
  fs.writeFileSync(path.join(root,".smoke/out",f.replace(/\.jsx$/,".js")),r.code);
}
const dom = new JSDOM("<!doctype html><div id=root></div>",{url:"http://x/wp-admin/admin.php?page=grsh-tm-rosters&division=gold_open",pretendToBeVisual:true});
const g=globalThis; g.window=dom.window; g.document=dom.window.document; Object.defineProperty(g,"navigator",{value:dom.window.navigator,configurable:true});
g.HTMLElement=dom.window.HTMLElement; g.IS_REACT_ACT_ENVIRONMENT=true;
dom.window.grshConfig={apiUrl:"/api",nonce:"n"};

const P=(id,pos,tier,extra={})=>({id,first_name:"P"+id,last_name:"L"+id,position:pos,is_goalie:pos==="goaltender",skill_tier_reported:tier,skill_tier_assigned:null,years_experience:5,payment_status:"unpaid",sandbagging_flag:0,returning_seasons:[],age:50,...extra});
let state={teams:[],pool:[P(1,"defenseman","B2"),P(2,"winger","R2")],plans:[],stage:"draft",changes:0,pins:[],locks:[]};
const payload=()=>({season_id:1,divisions:[{key:"gold_open",label:"Gold Open",assigned:0,total:2,pct:0},{key:"45a",label:"45A",assigned:0,total:0,pct:0}],division:"gold_open",division_label:"Gold Open",
  config:{min_roster:8,max_roster:12,goalie_min:1,goalie_max:2,planned_teams:4},max_player_score:32,parity:{rebalance_low:60,review_low:65,review_high:80,rebalance_high:85},draft_status:"idle",
  teams:state.teams,pool:state.pool,pins:state.pins,locks:state.locks,plans:state.plans,stage:state.stage,changes_since_publish:state.changes,
  gate:state.teams.length<2?[{key:"teams",level:"fail",text:state.teams.length===0?"No teams yet — add teams for this division.":"Only one team — a division needs at least two."}]:[{key:"teams",level:"ok",text:state.teams.length+" teams"},{key:"goalies",level:"fail",text:"Needs a goalie: Team A"},{key:"locked",level:"fail",text:"Lock every team before publishing"}],
  review:{active:false,url:"",approvals:{},comments:[]},published:{at:null,url:"",result:null}});
const posts=[], calls=[];
g.fetch=async(url,o={})=>{const m=o.method||"GET"; calls.push([m,url]); const J=(j,ok=true,s=200)=>({ok,status:s,json:async()=>j});
  if(m==="POST"&&url.endsWith("/rosters/teams")){const b=JSON.parse(o.body);posts.push([url,b]);state.teams=[...state.teams,{id:100+state.teams.length,name:b.name,colour:"#666666",locked:false,draft_order:null,captain_player_id:null,players:[]}];return J(payload());}
  if(m==="POST"&&url.endsWith("/rosters/plans")){const b=JSON.parse(o.body);posts.push([url,b]);state.plans=[{id:"abc123abc123",name:"Plan one",created_at:"2027-01-01 10:00:00",by:"A",count:1,assign:{1:100}}];return J(payload());}
  if(m==="POST"&&url.endsWith("/rosters/locks")){const b=JSON.parse(o.body);posts.push([url,b]);state.locks=b.locks;return J(payload());}
  if(m==="POST"&&url.endsWith("/rosters/moves")){const b=JSON.parse(o.body);posts.push([url,b]);return J(payload());}
  if(url.includes("/rosters/publish-preview"))return J({dry_run:true,will_send:2,will_skip:1,recipients:[{name:"Ann L",team:"Team A",to:"a***@x.test"}],skipped:[{name:"Bo L",team:"Team A",reason:"no valid email address"}],blocked_by:[],sample_subject:"Gold Rush Gold Open: you're on Team A",sample_body:"Rosters are set."});
  if(url.includes("/rosters/activity"))return J({items:[{id:1,at:"2027-01-01 10:00:00",by:"Admin",action:"roster_moves",title:"Players moved",notes:"P1 → Team A",moved:1}],published_at:null,changes_since_publish:0});
  if(url.includes("/rosters?")||url.endsWith("/rosters"))return J(payload());
  return J({error:"nope"},false,404)};
const Page=require(path.join(root,".smoke/out/pages/Rosters.js")).default;
const React=(await import(path.join(root,"node_modules/react/index.js"))).default; const {createRoot}=await import(path.join(root,"node_modules/react-dom/client.js")); const {act}=React;
const tick=(n=40)=>new Promise(r=>setTimeout(r,n)); let fails=0; const ok=(c,m)=>{if(!c){fails++;console.log("FAIL",m)}else console.log("ok  ",m)};
const text=()=>document.body.textContent; const btn=(t)=>[...document.querySelectorAll("button")].find(b=>b.textContent.includes(t));
const el=document.getElementById("root"); const root_=createRoot(el);
await act(async()=>{root_.render(React.createElement(Page));await tick();await tick();});
// tabs
ok(text().includes("0 of 2 placed")&&!text().includes("0/2"),"tab says '0 of 2 placed'");
ok(text().includes("no players")&&!text().includes("0/0"),"empty division tab says 'no players', not 0%");
// dead controls
const ab=btn("Auto-balance"), fs_=btn("Find swaps"), un=btn("Undo");
ok(ab.disabled&&ab.title==="Add a team first.","Auto-balance disabled with a reason");
ok(fs_.disabled&&fs_.title==="Needs at least two teams.","Find swaps disabled with a reason");
ok(un.disabled&&un.title==="Nothing to undo yet.","Undo disabled with a reason");
ok(document.querySelector("style").textContent.includes("button:disabled{opacity"),"disabled buttons are styled as disabled");
// blockers named with a fix
ok(text().includes("1 thing to fix before you can publish")&&text().includes("No teams yet"),"blocker is named");
ok(!!btn("Add teams")||!!btn("Create"),"blocker has a fix button");
// empty state and create planned
ok(text().includes("No teams in Gold Open yet")&&text().includes("Settings plans 4 teams"),"empty state explains and offers the planned count");
await act(async()=>{btn("Create 4 teams").click();await tick(80);await tick(80);});
const made=posts.filter(p=>p[0].endsWith("/rosters/teams")).map(p=>p[1].name);
ok(JSON.stringify(made)===JSON.stringify(["Team A","Team B","Team C","Team D"]),"4 planned teams created with sequential names");
ok(text().includes("Team D"),"teams appear");
// position chips + key
ok(document.querySelectorAll("[aria-label='Players by position']").length===4,"position chips on every team");
ok(text().includes("G 0/1"),"missing goalie shown as G 0/1");
await act(async()=>{btn("Key").click();await tick();});
ok(text().includes("Payment not marked paid")&&text().includes("Team captain"),"legend explains dot, chips and flags");
// blockers with fixes now
ok(text().includes("Needs a goalie")&&!!btn("Fill goalies")&&!!btn("Lock all teams"),"blockers now have specific fix buttons");
// publish preview
await act(async()=>{btn("Published").click();await tick();});
await act(async()=>{btn("Preview emails").click();await tick();await tick();});
ok(text().includes("2 would be emailed")&&text().includes("1 skipped")&&text().includes("no valid email address"),"publish preview lists who is emailed and who is skipped");
ok(calls.some(c=>c[1].includes("publish-preview"))&&!posts.some(p=>p[0].includes("/publish")),"preview is a read, nothing published");
await act(async()=>{document.dispatchEvent(new dom.window.KeyboardEvent("keydown",{key:"Escape",bubbles:true}));window.dispatchEvent(new dom.window.KeyboardEvent("keydown",{key:"Escape"}));await tick();});
// activity
await act(async()=>{btn("Activity").click();await tick();await tick();});
ok(text().includes("Players moved")&&text().includes("P1 → Team A"),"activity feed lists changes");
await act(async()=>{window.dispatchEvent(new dom.window.KeyboardEvent("keydown",{key:"Escape"}));await tick();});
// plans compare
await act(async()=>{btn("Plans").click();await tick();});
await act(async()=>{const inp=document.querySelector("input[placeholder^='e.g.']");const set=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value").set;set.call(inp,"Plan one");inp.dispatchEvent(new dom.window.Event("input",{bubbles:true}));await tick();});
await act(async()=>{btn("Save current").click();await tick();await tick();});
await act(async()=>{btn("Compare").click();await tick();});
ok(text().includes("compared with")&&text().includes("would move")&&text().includes("P1 L1"),"plan compare lists the players who would move");
// ── player locks and the rules summary ──
await act(async()=>{root_.unmount();});
state={teams:[{id:10,name:"Team A",colour:"#111",locked:false,draft_order:null,captain_player_id:1,players:[P(1,"center","A1"),P(2,"winger","B2"),P(3,"goaltender","C1")]},
 {id:11,name:"Team B",colour:"#222",locked:false,draft_order:null,captain_player_id:null,players:[P(4,"defenseman","B2"),P(5,"winger","C2")]}],pool:[],plans:[],stage:"draft",changes:0,pins:[{a:2,b:4,type:"together"},{a:1,b:3,type:"apart"}],locks:[]};
document.body.innerHTML="<div id=root></div>"; const root2=createRoot(document.getElementById("root"));
await act(async()=>{root2.render(React.createElement(Page));await tick();await tick();});
ok(btn("Rules & locks")&&btn("Rules & locks").textContent.includes("2 broken"),"button shows 2 broken rules");
await act(async()=>{[...document.querySelectorAll("div")].find(d=>d.textContent==="P2 L2"||(d.children.length>3&&d.textContent.includes("P2 L2")&&d.getAttribute("draggable")==="true")).click();await tick();});
const cb=document.querySelector("input[type=checkbox]"); ok(!!cb&&text().includes("Lock to Team A"),"player card offers a lock checkbox");
await act(async()=>{cb.click();await tick();await tick();});
ok(posts.some(p=>p[0].endsWith("/rosters/locks")&&JSON.stringify(p[1].locks)==="[2]"),"locking posts the player id");
ok(document.body.textContent.includes("🔒"),"locked player shows a lock on the row");
const row=[...document.querySelectorAll("[draggable]")].find(d=>d.textContent.includes("P2 L2")); ok(row&&row.getAttribute("draggable")==="false","locked player cannot be dragged");
// manual move from card is blocked with a reason
const sel=[...document.querySelectorAll("select")].find(x=>[...x.options].some(o=>o.textContent.includes("Unassigned (pool)")));
const nPosts=posts.filter(p=>p[0].endsWith("/rosters/moves")).length;
await act(async()=>{const set=Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,"value").set;set.call(sel,"11");sel.dispatchEvent(new dom.window.Event("change",{bubbles:true}));await tick();});
ok(posts.filter(p=>p[0].endsWith("/rosters/moves")).length===nPosts&&text().includes("Locked to Team A"),"moving a locked player by hand is blocked with a reason");
await act(async()=>{window.dispatchEvent(new dom.window.KeyboardEvent("keydown",{key:"Escape"}));[...document.querySelectorAll("button")].find(b=>b.getAttribute("aria-label")==="Close player card")?.click();await tick();});
await act(async()=>{btn("Rules & locks").click();await tick();});
ok(text().includes("Locked to team")&&text().includes("Captain")&&text().includes("✗ broken"),"summary lists lock, captain and broken rule");
ok(text().includes("P2 L2")&&text().includes("P4 L4"),"summary names both people in a rule");
await act(async()=>{btn("Broken").click();await tick();});
ok((text().match(/✗ broken/g)||[]).length===4,"Broken filter lists all four sides of two broken rules");
await act(async()=>{btn("🔒 Locked").click();await tick();});
ok((text().match(/✗ broken/g)||[]).length===1,"Locked filter shows only the locked player's one rule");
await act(async()=>{btn("Unlock").click();await tick();await tick();});
ok(posts.some(p=>p[0].endsWith("/rosters/locks")&&JSON.stringify(p[1].locks)==="[]"),"unlocking from the summary posts an empty list");
console.log(fails?`\n${fails} FAILED`:"\nall smoke checks OK"); process.exit(fails?1:0);
