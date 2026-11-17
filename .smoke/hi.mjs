import { JSDOM } from "jsdom";
import path from "path"; import fs from "fs"; import babel from "@babel/core"; import { createRequire } from "module";
const require = createRequire(import.meta.url); const root = process.cwd();
for (const f of ["pages/HistoryImport.jsx","lib/importEngine.js"]) {
  fs.mkdirSync(path.dirname(path.join(root,".smoke/out",f)),{recursive:true});
  const r = babel.transformFileSync(path.join(root,"src",f),{presets:[["@babel/preset-env",{targets:{node:"current"},modules:"commonjs"}],["@babel/preset-react",{runtime:"automatic"}]],babelrc:false,configFile:false});
  fs.writeFileSync(path.join(root,".smoke/out",f.replace(/\.jsx$/,".js")),r.code);
}
const dom = new JSDOM("<!doctype html><div id=root></div>",{url:"http://x/wp-admin/admin.php?page=grsh-tm-history-import",pretendToBeVisual:true});
const g=globalThis; g.window=dom.window; g.document=dom.window.document; Object.defineProperty(g,"navigator",{value:dom.window.navigator,configurable:true});
g.HTMLElement=dom.window.HTMLElement; g.IS_REACT_ACT_ENVIRONMENT=true; g.FormData=dom.window.FormData; g.Blob=dom.window.Blob; g.URL.createObjectURL=()=>"blob:x"; g.URL.revokeObjectURL=()=>{};
dom.window.grshConfig={apiUrl:"/api",nonce:"n"};
let stats={total:12,players:8,seasons:[2025,2024],seasons_count:2,champions:2,sandbagging:1,no_shows:1,coverage:[{season_year:2025,division:"gold_open",n:8},{season_year:2024,division:"gold_open",n:4},{season_year:2025,division:"womens",n:2}],last_import:{id:3,filename:"old.csv",timestamp:"2026-11-10 09:05:00",imported:5,updated:0,undone:false}};
let logs=[{id:3,user:"Admin",filename:"old.csv",mode:"append",imported:5,updated:0,unchanged:0,skipped:1,total:6,errors:["Line 4: bad"],warnings:[],error_count:1,warning_count:0,timestamp:"2026-11-10 09:05:00",undone:false,has_undo_data:true,can_undo:true}];
const dryRes={success:true,dry_run:true,blocked:false,total:3,imported:2,updated:0,unchanged:0,skipped:1,new_players:2,matched_players:0,new_seasons:[2023],tier_warnings:0,no_show_players:0,issues:[{line:4,level:"error",field:"email",message:"Invalid email 'bad'."}],
 rows:[{line:2,name:"Mike Hartley",email:"m@x.com",season_year:"2023",division:"Gold Open",action:"insert",player:"new",note:"",changes:{}},{line:3,name:"Jo Ng",email:"j@x.com",season_year:"2023",division:"womens",action:"insert",player:"new",note:"",changes:{}},{line:4,name:"Bad Row",email:"bad",season_year:"2023",division:"45a",action:"error",player:"",note:"Skipped: this row has a problem.",changes:{}}]};
let calls=[],fd=[];
g.fetch=async(url,o={})=>{const m=o.method||"GET";calls.push([m,url]);const J=(j,ok=true,s=200)=>({ok,status:s,json:async()=>j});
  if(url.includes("/history/stats"))return J(stats);
  if(url.includes("/import-logs?"))return J(logs);
  if(url.includes("/import-logs/3/undo"))return J({success:true,message:"Import #3 undone: 5 added records removed, 0 updated records restored."});
  if(url.endsWith("/history/import")&&m==="POST"){const b=o.body;fd.push(Object.fromEntries([...b.entries()].map(([k,v])=>[k,typeof v==="string"?v:"[file]"])));const dry=b.get("dry_run")==="1";return J(dry?dryRes:{...dryRes,dry_run:false,job_id:9,rows:[],message:"Import complete."});}
  if(url.includes("/history/records")&&m==="GET")return J({records:[{id:1,first_name:"Mike",last_name:"Hartley",email:"m@x.com",season_year:2025,division_played:"gold_open",team_name:"Red",championship_result:"winner",was_captain:true,sandbagging_flag:false,skill_tier_reported:"A2",games_attended:6,games_scheduled:6,no_show_count:0}],total:1,page:1,per_page:25,total_pages:1});
  if(url.includes("/history/records")&&m==="DELETE")return J({success:true,deleted:12});
  return J({},false,404)};
const Page=require(path.join(root,".smoke/out/pages/HistoryImport.js")).default;
const React=(await import(path.join(root,"node_modules/react/index.js"))).default; const {createRoot}=await import(path.join(root,"node_modules/react-dom/client.js")); const {act}=React;
const tick=(n=40)=>new Promise(r=>setTimeout(r,n)); let fails=0; const ok=(c,m)=>{if(!c){fails++;console.log("FAIL",m)}else console.log("ok  ",m)};
const text=()=>document.body.textContent; const btn=(t)=>[...document.querySelectorAll("button")].find(b=>b.textContent.includes(t));
const el=document.getElementById("root");const root_=createRoot(el);
await act(async()=>{root_.render(React.createElement(Page));await tick();await tick();});
ok(!text().includes("NaN")&&!text().includes("undefined"),"no NaN/undefined on first paint");
ok(text().includes("Import History")&&text().includes("Last import: old.csv"),"hero + last import line");
ok(text().includes("Coverage map")&&text().includes("1 gap"),"coverage map with the 2024 Women's gap");
ok(document.querySelectorAll(".gi-stat").length===5,"5 stat cards");
ok(!!document.querySelector("[role=tablist] [role=tab][aria-selected=true]"),"tabs have roles");
// paste -> check
const ta=document.getElementById("gi-paste");
const setVal=(node,v)=>{const proto=node.tagName==="TEXTAREA"?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,"value").set.call(node,v);node.dispatchEvent(new dom.window.Event("input",{bubbles:true}));};
await act(async()=>{setVal(ta,"First Name\tLast Name\tEmail Address\tSeason\tDivision\nMike\tHartley\tm@x.com\t2023\tGold Open\nJo\tNg\tj@x.com\t2023\twomens\nBad\tRow\tbad\t2023\t45a");await tick();});
await act(async()=>{btn("Check pasted rows").click();await tick();await tick(900);});
await act(async()=>{await tick(1200);});
ok(fd.length===1&&fd[0].dry_run==="1"&&fd[0].csv==="[file]","one dry-run request sent with the csv");
ok(text().includes("2 rows ready, 1 need fixing"),"verdict headline");
ok(text().includes("Row by row")&&text().includes("Mike Hartley")&&text().includes("Problem"),"row table shows rows and the problem");
ok(text().includes("All 5 recognised columns matched")&&!text().includes("guesswork"),"headers matched via aliases");
ok(!!btn("Download rows to fix (1)"),"fix-it download offered");
ok(document.querySelectorAll("[role=radio],input[type=radio]").length===2,"mode choice present");
ok(text().includes("Import 2 rows"),"import button says how many");
// switching mode re-checks
await act(async()=>{document.querySelectorAll("input[type=radio]")[1].click();await tick(900);});
ok(fd.length===2&&fd[1].import_mode==="upsert","changing mode re-runs the check");
// import (double click)
fd.length=0;
await act(async()=>{const b=btn("Import 2 rows");b.click();b.click();await tick();await tick();});
ok(fd.filter(x=>x.dry_run==="0").length===1,"double click sends ONE real import");
ok(text().includes("Import complete")&&text().includes("What this changed"),"done card with impact");
ok(text().includes("New season on record: 2023"),"impact names the new season");
// undo modal + escape
await act(async()=>{btn("Undo this import").click();await tick();});
ok(!!document.querySelector("[role=dialog][aria-modal=true]"),"undo opens a dialog");
await act(async()=>{document.dispatchEvent(new dom.window.KeyboardEvent("keydown",{key:"Escape",bubbles:true}));await tick();});
ok(!document.querySelector("[role=dialog]"),"Escape closes it");
// log tab
await act(async()=>{document.getElementById("gi-tab-log").click();await tick();});
ok(text().includes("old.csv")&&text().includes("1 problem")&&!!btn("Undo this import"),"log shows the latest import with undo");
await act(async()=>{btn("Undo this import").click();await tick();});
await act(async()=>{btn("Undo import").click();await tick();await tick();});
ok(calls.some(c=>c[0]==="POST"&&c[1].includes("/import-logs/3/undo")),"undo calls the right route");
// records
await act(async()=>{document.getElementById("gi-tab-records").click();await tick(100);});
await act(async()=>{await tick(1500);});
ok(text().includes("Mike Hartley")&&text().includes("1 record"),"records tab lists rows");
await act(async()=>{btn("Clear all").click();await tick();});
const clr=btn("Clear everything");ok(clr&&clr.disabled,"clear-all disabled until DELETE typed");
await act(async()=>{setVal(document.getElementById("gi-conf"),"DELETE");await tick();});
ok(!btn("Clear everything").disabled,"enabled after typing DELETE");
await act(async()=>{btn("Clear everything").click();await tick();await tick();});
ok(calls.some(c=>c[0]==="DELETE"&&c[1].endsWith("/history/records")),"clear-all calls DELETE");
ok(!text().includes("NaN")&&!text().includes("undefined"),"no NaN/undefined at the end");
console.log(fails?`${fails} FAILED`:"ALL OK");process.exit(fails?1:0);
