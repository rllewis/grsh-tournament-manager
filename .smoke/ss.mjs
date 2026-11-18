import { JSDOM } from "jsdom";
import path from "path"; import fs from "fs"; import babel from "@babel/core"; import { createRequire } from "module";
const require = createRequire(import.meta.url); const root = process.cwd();
for (const f of ["pages/ScoreSheets.jsx","lib/importEngine.js","lib/scoreEngine.js"]) {
  fs.mkdirSync(path.dirname(path.join(root,".smoke/out",f)),{recursive:true});
  const r = babel.transformFileSync(path.join(root,"src",f),{presets:[["@babel/preset-env",{targets:{node:"current"},modules:"commonjs"}],["@babel/preset-react",{runtime:"automatic"}]],babelrc:false,configFile:false});
  fs.writeFileSync(path.join(root,".smoke/out",f.replace(/\.jsx$/,".js")),r.code);
}
const dom = new JSDOM("<!doctype html><div id=root></div>",{url:"http://x/wp-admin/admin.php?page=grsh-score-sheets&sheet=pabc1-2",pretendToBeVisual:true});
const g=globalThis; g.window=dom.window; g.document=dom.window.document; Object.defineProperty(g,"navigator",{value:dom.window.navigator,configurable:true});
g.HTMLElement=dom.window.HTMLElement; g.IS_REACT_ACT_ENVIRONMENT=true; g.URL.createObjectURL=()=>"blob:x"; g.URL.revokeObjectURL=()=>{};
dom.window.grshConfig={apiUrl:"/api",nonce:"n"};
dom.window.HTMLFormElement.prototype.submit=function(){ globalThis.__submitted={action:this.getAttribute("action"),target:this.target,f:Object.fromEntries([...this.querySelectorAll("input")].map(i=>[i.name,i.value]))}; };
const T=(o)=>({id:1,name:"Team Ann",division:"gold_open",type:"full_team",players:12,goalies:1,warnings:[],changed:null,last_printed:null,...o});
let ov={season:{id:1,year:2027,exists:true},teams:[T({id:1,name:"Team Ann"}),T({id:2,name:"Team Bo",warnings:[{code:"no_goalie",level:"warn",text:"No goalie on the roster"}]}),T({id:3,name:"Team Cy",warnings:[{code:"no_roster",level:"bad",text:"No players on the roster"}],players:0,goalies:0}),T({id:4,name:"Draft D",type:"draft"})],
 types:[],max_games:60,arenas:["Tahoe Ice"],batches:[{id:"b1",name:"Sat day 1",saved_at:"2027-01-10 10:00:00",options:{font:"large"},matchups:[{home_id:1,away_id:2,date:"2027-01-16",game_time:"19:30",arena:"Tahoe Ice",game_no:"1",type:"REG"},{home_id:1,away_id:99,date:"",game_time:"",arena:"",game_no:"",type:"REG"}]}],
 log:[{id:"pabc1",at:"2027-01-12 09:00:00",by:"Admin",count:2,skipped:0,games:[{home:"Team Ann",away:"Team Bo",home_id:1,away_id:2}],options:{}}],
 schedule:{available:true,events:[{id:7,home_name:"Team Ann",away_name:"Team Bo",home_id:1,away_id:2,date:"2027-02-01",time:"18:00",arena:"Tahoe Ice"},{id:8,home_name:"Nope",away_name:"Team Bo",home_id:0,away_id:2,date:"2027-02-01",time:"20:00",arena:""}]},
 qr_ready:true,print_url:"/wp-admin/admin-post.php",print_nonce:"pn",generated_at:"x"};
let calls=[],posts=[];
g.fetch=async(url,o={})=>{const m=o.method||"GET";calls.push([m,url]);const J=(j,ok=true,s=200)=>({ok,status:s,json:async()=>j});
 if(url.endsWith("/score-sheets/overview"))return J(ov);
 if(url.includes("/score-sheets/record"))return J({success:true,record:{at:"2027-01-12 09:00:00",by:"Admin",count:2,games:[{home:"Team Ann",away:"Team Bo",home_id:1,away_id:2,date:"2027-01-16",game_time:"19:30",arena:"Tahoe Ice",game_no:"7"},{home:"Team Ann",away:"Team Bo",home_id:1,away_id:2,date:"2027-01-17",game_time:"19:30",arena:"X",game_no:"8"}],rosters:{1:{name:"Team Ann",players:[[9,"Ann One","G"],[null,"Ann Two",""]]},2:{name:"Team Bo",players:[[4,"Bo One",""]]}}}});
 if(m==="POST"){const b=JSON.parse(o.body);posts.push([url,b]);
  if(url.endsWith("/preview"))return J({success:true,html:"<html><body>SHEET</body></html>",skipped:[]});
  if(url.endsWith("/batch-save"))return J({success:true,message:"Saved."});
  if(url.endsWith("/batch-delete"))return J({success:true});}
 return J({},false,404)};
const Page=require(path.join(root,".smoke/out/pages/ScoreSheets.js")).default;
const React=(await import(path.join(root,"node_modules/react/index.js"))).default; const {createRoot}=await import(path.join(root,"node_modules/react-dom/client.js")); const {act}=React;
const tick=(n=40)=>new Promise(r=>setTimeout(r,n)); let fails=0; const ok=(c,m)=>{if(!c){fails++;console.log("FAIL",m)}else console.log("ok  ",m)};
const text=()=>document.body.textContent; const btn=(t)=>[...document.querySelectorAll("button")].find(b=>b.textContent.includes(t));
const setVal=(el,v)=>{const proto=el.tagName==="SELECT"?dom.window.HTMLSelectElement.prototype:el.tagName==="TEXTAREA"?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;dom.window.Object.getOwnPropertyDescriptor(proto,"value").set.call(el,v);el.dispatchEvent(new dom.window.Event(el.tagName==="SELECT"?"change":"input",{bubbles:true}));};
const click=async(b)=>{await act(async()=>{b.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true}));await tick();});};
const root_=createRoot(document.getElementById("root"));
await act(async()=>{root_.render(React.createElement(Page));await tick();await tick();await tick();});
ok(!text().includes("NaN")&&!text().includes("undefined"),"no NaN/undefined");
ok(text().includes("Print Score Sheets")&&text().includes("Season 2027"),"hero");
ok(text().includes("Print Record")||text().includes("Print record"),"QR url opens record modal");
ok(text().includes("Game 2: Team Ann vs Team Bo")&&text().includes("Ann One")&&text().includes("(G)"),"record shows game 2 and rosters");
await click(document.querySelector(".gc-x"));
ok(!document.querySelector("[role=dialog]"),"record closes");
ok(btn("Print score sheets")&&btn("Print score sheets").disabled,"print disabled with empty queue");
// one game
const sels=()=>[...document.querySelectorAll("#one-h,#one-a")];
await act(async()=>{setVal(document.getElementById("one-h"),"1");setVal(document.getElementById("one-a"),"2");await tick();});
ok(![...document.getElementById("one-h").options].some(o=>o.textContent.includes("Draft D")),"draft teams hidden by default");
await click(btn("Add to batch"));
ok(document.querySelectorAll(".ss-game").length===1,"game queued");
ok(text().includes("Team Ann vs Team Bo"),"card title");
ok(text().includes("No goalie")||text().includes("goalie"),"roster warning shown on card");
// series
await click([...document.querySelectorAll("[role=tab]")].find(t=>t.textContent==="Time slots"));
await act(async()=>{setVal(document.getElementById("se-c"),"3");setVal(document.getElementById("se-d"),"2027-02-06");setVal(document.getElementById("se-s"),"08:00");setVal(document.getElementById("se-g"),"90");await tick();});
await click(btn("Add 3 games"));
ok(document.querySelectorAll(".ss-game").length===4,"series adds 3");
ok([...document.querySelectorAll("input[type=time]")].some(i=>i.value==="09:30"),"times stepped 90 min");
// paste
await click([...document.querySelectorAll("[role=tab]")].find(t=>t.textContent==="Paste schedule"));
await act(async()=>{setVal(document.getElementById("ss-paste"),"2027-03-01, 7:30 PM, Team Ann, Team Bo, Tahoe Ice, 20\n2027-03-01, 9 PM, Nobody, Team Bo");await tick();});
await click(btn("Check the rows"));
ok(text().includes("1 game read")&&text().includes("line 2"),"paste reports problem row");
await click(btn("Add 1 game"));
ok(document.querySelectorAll(".ss-game").length===5,"parsed game added");
// site schedule
await click([...document.querySelectorAll("[role=tab]")].find(t=>t.textContent==="Site schedule"));
ok([...document.querySelectorAll(".gc-opt input")].filter(i=>i.disabled).length===1,"unmatched event disabled");
await act(async()=>{await click(document.querySelector(".gc-opt input:not(:disabled)"));});
await click(btn("Add 1 selected game"));
ok(document.querySelectorAll(".ss-game").length===6,"site game added");
// move/dup/remove
await click(document.querySelector("[aria-label='Duplicate game 1']"));
ok(document.querySelectorAll(".ss-game").length===7,"dup");
await click(document.querySelector("[aria-label='Remove game 1']"));
ok(document.querySelectorAll(".ss-game").length===6,"remove");
// persistence
ok(JSON.parse(dom.window.localStorage.getItem("grsh_ss_draft_v1")).queue.length===6,"draft persisted");
// preview
await click(document.querySelector(".ss-game .gc-btn.sm:not([aria-label])"));
await act(async()=>{await tick();});
ok(document.querySelector("iframe")&&document.querySelector("iframe").getAttribute("srcdoc").includes("SHEET"),"preview iframe");
ok(document.querySelector("iframe").hasAttribute("sandbox"),"preview sandboxed");
await click(btn("Close"));
// save batch
await click(btn("Save batch"));
await act(async()=>{setVal(document.getElementById("ss-bn"),"My batch");await tick();});
await click(btn("Save")&&[...document.querySelectorAll(".gc-modal button")].find(b=>b.textContent==="Save"));
ok(posts.some(p=>p[0].endsWith("/batch-save")&&p[1].name==="My batch"),"batch saved");
// print with problems -> confirm
await click(btn("Print 6 sheets")||[...document.querySelectorAll("button")].find(b=>/^\s*Print \d+ sheets/.test(b.textContent)));
ok(text().includes("Check before printing"),"confirm modal on problems");
await click(btn("Print anyway"));
ok(globalThis.__submitted&&globalThis.__submitted.target==="_blank"&&globalThis.__submitted.f.action==="grsh_print_score_sheets"&&globalThis.__submitted.f.grsh_print_nonce==="pn","real form posted to new tab");
ok(JSON.parse(globalThis.__submitted.f.matchups).length===6,"payload has all games");
// load batch with dropped
await click([...document.querySelectorAll("[role=tab]")].find(t=>t.textContent.startsWith("Saved batches")));
await click(btn("Load"));
ok(text().includes("replace your"),"asks replace/add when queue not empty");
await click(btn("Replace the list"));
ok(document.querySelectorAll(".ss-game").length===1,"loaded batch (removed team dropped)");
// history
await click([...document.querySelectorAll("[role=tab]")].find(t=>t.textContent.startsWith("Print history")));
ok(text().includes("Team Ann vs Team Bo")&&btn("Print again"),"history rows");
ok(!calls.some(c=>/alert/.test(c[1])),"no alert");
console.log(fails?`\n${fails} FAILED`:"\nall ok"); process.exit(fails?1:0);
