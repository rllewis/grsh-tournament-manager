import { JSDOM } from "jsdom";
import { build } from "esbuild";
import path from "path";
const root = process.cwd();
import babel from "@babel/core"; import fs from "fs"; import { createRequire } from "module";
const require = createRequire(import.meta.url);
fs.mkdirSync(path.join(root,".smoke/out/pages"),{recursive:true}); fs.mkdirSync(path.join(root,".smoke/out/lib"),{recursive:true});
for (const f of ["pages/Rosters.jsx","lib/rosterEngine.js","lib/playerScoring.js"]) {
  const r = babel.transformFileSync(path.join(root,"src",f),{presets:[["@babel/preset-env",{targets:{node:"current"},modules:"commonjs"}],["@babel/preset-react",{runtime:"automatic"}]],babelrc:false,configFile:false});
  fs.writeFileSync(path.join(root,".smoke/out",f.replace(/\.jsx$/,".js")),r.code);
}
const dom = new JSDOM("<!doctype html><div id=root></div>", { url:"http://x/wp-admin/admin.php?page=grsh-tm-rosters", pretendToBeVisual:true });
const g = globalThis; g.window=dom.window; g.document=dom.window.document; Object.defineProperty(g,"navigator",{value:dom.window.navigator,configurable:true});
g.HTMLElement=dom.window.HTMLElement; g.IS_REACT_ACT_ENVIRONMENT=true; g.localStorage=dom.window.localStorage;
dom.window.grshConfig={apiUrl:"/api",nonce:"n"};
const tiers=["A2","B1","B2","B3","C1","C2","R1","R2","R3","B2","C1","R1","R2","B3"];const pos=["goaltender","defenseman","defenseman","center","winger","winger","center","defenseman","winger","goaltender","defenseman","center","winger","defenseman"];
const P=tiers.map((t,i)=>({id:i+1,first_name:"P"+i,last_name:"L"+i,position:pos[i],is_goalie:pos[i]==="goaltender",skill_tier_reported:t,skill_tier_assigned:null,years_experience:5+i,sandbagging_flag:false,age:45+i,payment_status:i%4?"paid":"pending",registration_id:i,returning_seasons:i%3?[]:["2024"]}));
let state={teams:[{id:10,name:"Gold",colour:"#D4A017",locked:false,draft_order:1,captain_player_id:null,players:P.slice(0,4)},{id:11,name:"Blue",colour:"#1A3F8F",locked:false,draft_order:2,captain_player_id:null,players:P.slice(4,7)}],pool:P.slice(7)};
const payload=()=>({season_id:1,divisions:[{key:"gold_open",label:"Gold Open",teams:2,assigned:7,total:14,pct:50}],division:"gold_open",division_label:"Gold Open",config:{min_roster:7,max_roster:12,goalie_min:1,goalie_max:2,planned_teams:2},max_player_score:32,parity:{rebalance_low:60,review_low:65,review_high:80,rebalance_high:85},draft_status:"ready",teams:state.teams,pool:state.pool,pins:[],plans:[],stage:"draft",gate:[{key:"locked",level:"fail",text:"Lock every team"}],review:{active:false,url:"",approvals:{},comments:[]},published:{at:null,url:"",result:null}});
const calls=[];
g.fetch=async(url,o={})=>{calls.push([o.method||"GET",url,o.body]);if(url.includes("/rosters/moves")){const b=JSON.parse(o.body);b.moves.forEach(m=>{let pl;state.pool=state.pool.filter(p=>p.id===m.player_id?(pl=p,false):true);state.teams.forEach(t=>t.players=t.players.filter(p=>p.id===m.player_id?(pl=p,false):true));if(m.team_id==null)state.pool.push(pl);else state.teams.find(t=>t.id===m.team_id).players.push(pl)});}return {ok:true,status:200,json:async()=>payload()};};

const mod={default:require(path.join(root,".smoke/out/pages/Rosters.js")).default};
const React=(await import(path.join(root,"node_modules/react/index.js"))).default; const {createRoot}=await import(path.join(root,"node_modules/react-dom/client.js"));
const {act}=React;
const rootEl=createRoot(document.getElementById("root"));
const tick=()=>new Promise(r=>setTimeout(r,30));
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log("FAIL",m)}else console.log("ok  ",m)};
await act(async()=>{rootEl.render(React.createElement(mod.default));await tick();});
await act(async()=>{await tick();});
const text=()=>document.body.textContent;
ok(text().includes("Gold Open")&&text().includes("Unassigned"),"renders board");
ok(text().includes("Defense needed")||text().includes("Center needed")||text().includes("Wing needed")||text().includes("Goalie needed"),"ghost slots shown");
ok(text().includes("7 players"),"pool count");
ok(calls[0][1].includes("/rosters"),"GET /rosters called");
// click a pool player, open peek, move via select
const rows=[...document.querySelectorAll("div")].filter(d=>d.textContent.startsWith("D")&&d.textContent.includes("P7")&&d.children.length>=4);
const row=[...document.querySelectorAll("[draggable=true]")].find(d=>d.textContent.includes("P7 L7"));
ok(!!row,"pool player row draggable");
await act(async()=>{row.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true}));await tick();});
ok(!!document.querySelector("[aria-label='Close player card']"),"peek card opens");
const sel=[...document.querySelectorAll("select")].find(s=>[...s.options].some(o=>o.text.startsWith("Unassigned")));
await act(async()=>{const set=Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,"value").set;set.call(sel,"11");sel.dispatchEvent(new dom.window.Event("change",{bubbles:true}));await tick();await tick();});
const mv=calls.find(c=>c[1].includes("/rosters/moves"));
ok(!!mv&&JSON.parse(mv[2]).moves[0].player_id===8&&JSON.parse(mv[2]).moves[0].team_id===11,"move POSTed with player 8 → team 11");
ok(state.teams[1].players.some(p=>p.id===8),"server state updated");
// undo
const undoBtn=[...document.querySelectorAll("button")].find(b=>b.textContent.startsWith("Undo"));
ok(undoBtn&&!undoBtn.disabled,"undo enabled");
await act(async()=>{undoBtn.click();await tick();await tick();});
ok(state.pool.some(p=>p.id===8),"undo moved player back to pool");
// auto-balance modal
const ab=[...document.querySelectorAll("button")].find(b=>b.textContent.startsWith("Auto-balance"));
await act(async()=>{ab.click();await tick();});
ok(text().includes("Nothing is saved until you press Apply"),"balance modal shows");
const before=calls.length;
const apply=[...document.querySelectorAll("button")].find(b=>b.textContent.startsWith("Apply "));
ok(!!apply,"apply button");
await act(async()=>{apply.click();await tick();await tick();});
const am=calls.slice(before).find(c=>c[1].includes("/rosters/moves"));
ok(!!am&&JSON.parse(am[2]).type==="auto","auto-balance POSTs type auto");
ok(state.pool.length===0,"pool emptied by fill");
// publish modal blocker
const st=[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Committee review"));
await act(async()=>{st.click();await tick();});
ok(text().includes("Lock every team")&&[...document.querySelectorAll("button")].find(b=>b.textContent.startsWith("Publish & email")).disabled,"publish disabled while gate fails");
console.log(fails?`${fails} FAILED`:"ALL PASSED");process.exit(fails?1:0);
