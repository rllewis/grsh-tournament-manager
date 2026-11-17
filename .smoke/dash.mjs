import { JSDOM } from "jsdom";
import path from "path"; import fs from "fs"; import babel from "@babel/core"; import { createRequire } from "module";
const require = createRequire(import.meta.url); const root = process.cwd();
for (const f of ["pages/Dashboard.jsx","lib/dashboardEngine.js"]) {
  fs.mkdirSync(path.dirname(path.join(root,".smoke/out",f)),{recursive:true});
  const r = babel.transformFileSync(path.join(root,"src",f),{presets:[["@babel/preset-env",{targets:{node:"current"},modules:"commonjs"}],["@babel/preset-react",{runtime:"automatic"}]],babelrc:false,configFile:false});
  fs.writeFileSync(path.join(root,".smoke/out",f.replace(/\.jsx$/,".js")),r.code);
}
const dom = new JSDOM("<!doctype html><div id=root></div>",{url:"http://x/wp-admin/admin.php?page=grsh-tm-dashboard",pretendToBeVisual:true});
const g=globalThis; g.window=dom.window; g.document=dom.window.document; Object.defineProperty(g,"navigator",{value:dom.window.navigator,configurable:true});
g.HTMLElement=dom.window.HTMLElement; g.IS_REACT_ACT_ENVIRONMENT=true; g.localStorage=dom.window.localStorage;
dom.window.grshConfig={apiUrl:"/api",nonce:"n"};
const div=(k,o={})=>({key:k,label:k.replace(/_/g," "),color:"#D4A017",configured:true,registered:7,paid:7,unpaid:0,approved:0,subs:1,goalies:1,tiers:{A:1,B:3,C:2,R:1,"?":0},planned_teams:1,min_needed:35,capacity:60,teams:0,rostered:0,teams_ready:0,locked:0,draft_status:"none",stage:"draft",published_at:null,...o});
let D={season:{id:1,year:2027,label:"2027",status:"open"},server_now:"2026-11-17 12:00:00",tournament_date:"2027-02-05",milestones:[{key:"registration_closes",label:"Registration closes",date:"2027-01-10"}],
 totals:{registered:7,alternates:1,goalies:1,unpaid:0,sandbagging_flags:0},
 metrics:{registration:{have:7,of:35,room:53,capacity:60},payments:{have:7,of:7},approvals:null,rosters:null},
 divisions:[div("gold_open")],flags:[],last_sync:{at:"2026-11-17 11:00:00",ok:true,by:"admin"},sync_failures_7d:0,activity:[{id:1,action:"sync_completed",by:"admin",notes:"",at:"2026-11-17 11:00:00"}]};
let S={total_entries:7,total_imported:7,unsynced:0,recent_imports:[{id:1,name:"Pat Lee",type:"player",division:"gold_open",position:"center",status:"paid",time:"today"}]};
let mode="ok",calls=[];
g.fetch=async(url,o={})=>{calls.push([o.method||"GET",url]);
  if(mode==="fail"&&url.includes("/dashboard"))return{ok:false,status:500,json:async()=>({error:"boom"})};
  if(url.includes("/dashboard/tournament-date")){D={...D,tournament_date:JSON.parse(o.body).date};return{ok:true,status:200,json:async()=>D}}
  if(url.includes("/dashboard"))return{ok:true,status:200,json:async()=>D};
  if(url.includes("/sync/status"))return{ok:true,status:200,json:async()=>S};
  if(url.endsWith("/sync")){await new Promise(r=>setTimeout(r,60));return{ok:true,status:200,json:async()=>({imported:2,skipped:0,errors:[]})}}
  return{ok:false,status:404,json:async()=>({})}};
const Dash=require(path.join(root,".smoke/out/pages/Dashboard.js")).default;
const React=(await import(path.join(root,"node_modules/react/index.js"))).default; const {createRoot}=await import(path.join(root,"node_modules/react-dom/client.js")); const {act}=React;
const tick=()=>new Promise(r=>setTimeout(r,30)); let fails=0; const ok=(c,m)=>{if(!c){fails++;console.log("FAIL",m)}else console.log("ok  ",m)};
const text=()=>document.body.textContent;
const mount=async()=>{const el=document.getElementById("root");const r=createRoot(el);await act(async()=>{r.render(React.createElement(Dash));await tick();await tick();});return r};
let r=await mount();
ok(!text().includes("NaN"),"no NaN anywhere (screenshot case: approvals/rosters unmeasurable)");
ok(!text().includes("undefined"),"no 'undefined' in page");
ok(text().includes("Based on 2 of 4 measures"),"readiness says it used 2 of 4 measures");
ok(text().includes("7 of 7 paid"),"payments shown as counts");
ok(text().includes("Season 2027 Overview"),"title from server season");
ok(/\d+\s*days? (to|since) the tournament/.test(text()),"countdown shown from stored date");
ok(text().includes("Last import succeeded"),"last sync line");
ok(text().includes("Pat Lee"),"recent registrations from /sync/status");
ok(!!document.querySelector("a[href*='grsh-tm-rosters'][href*='division=gold_open']"),"division links to Rosters with ?division=");
ok(text().includes("Nothing is saved")===false,"sanity");
// double-click guard
const sb=document.getElementById("sync-btn"); calls.length=0;
await act(async()=>{sb.click();sb.click();await tick();await tick();await tick();await tick();});
ok(calls.filter(c=>c[0]==="POST"&&c[1].endsWith("/sync")).length===1,"double click sends ONE sync request");
ok(text().includes("Import complete — 2 new registrations"),"sync result announced");
ok(!!document.querySelector("[role=status]"),"aria-live region present");
// set date
const setBtn=[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Change tournament date"));
await act(async()=>{setBtn.click();await tick();});
ok(!!document.querySelector("input[type=date]"),"date editor opens");
r.unmount();
// failure of /dashboard
mode="fail"; document.body.innerHTML="<div id=root></div>"; r=await mount();
ok(text().includes("could not load")||text().includes("The dashboard could not load"),"dashboard failure shows an error, not a crash");
ok([...document.querySelectorAll("button")].some(b=>b.textContent==="Retry"),"retry button present");
ok(!text().includes("NaN"),"no NaN in error state");
// empty season
mode="ok"; D={...D,metrics:{registration:null,payments:null,approvals:null,rosters:null},totals:{registered:0,alternates:0,goalies:0,unpaid:0,sandbagging_flags:0},divisions:[],tournament_date:"",milestones:[],last_sync:null,activity:[]}; S={total_entries:0,total_imported:0,unsynced:0,recent_imports:[]};
r.unmount(); document.body.innerHTML="<div id=root></div>"; r=await mount();
ok(!text().includes("NaN"),"empty season: no NaN");
ok(text().includes("Nothing to measure yet"),"empty season: readiness says nothing to measure");
ok(text().includes("No import has run yet"),"empty season: no-import message");
console.log(fails?`${fails} FAILED`:"ALL PASSED"); process.exit(fails?1:0);
