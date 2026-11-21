import { JSDOM } from "jsdom";
import path from "path"; import fs from "fs"; import babel from "@babel/core"; import { createRequire } from "module";
const require = createRequire(import.meta.url); const root = process.cwd();
for (const f of ["pages/CaptainSync.jsx","lib/importEngine.js","lib/captainEngine.js"]) {
  fs.mkdirSync(path.dirname(path.join(root,".smoke/out",f)),{recursive:true});
  const r = babel.transformFileSync(path.join(root,"src",f),{presets:[["@babel/preset-env",{targets:{node:"current"},modules:"commonjs"}],["@babel/preset-react",{runtime:"automatic"}]],babelrc:false,configFile:false});
  fs.writeFileSync(path.join(root,".smoke/out",f.replace(/\.jsx$/,".js")),r.code);
}
const dom = new JSDOM("<!doctype html><div id=root></div>",{url:"http://x/wp-admin/admin.php?page=grsh-captain-sync",pretendToBeVisual:true});
const g=globalThis; g.window=dom.window; g.document=dom.window.document; Object.defineProperty(g,"navigator",{value:dom.window.navigator,configurable:true});
g.HTMLElement=dom.window.HTMLElement; g.IS_REACT_ACT_ENVIRONMENT=true; g.FormData=dom.window.FormData; g.Blob=dom.window.Blob; g.URL.createObjectURL=()=>"blob:x"; g.URL.revokeObjectURL=()=>{};
dom.window.grshConfig={apiUrl:"/api",nonce:"n"};

const W=(tier,total)=>({fee_tier:tier,fee_total:total,deposit_amount:500,balance_due:total-500,payment_status:"deposit_paid",deposit_paid_at:"x"});
const T=(o)=>({division:"gold_open",division_ok:true,division_label:"Gold Open",captain:null,account:"none",roster_size:0,min_players:11,payment_status:"unpaid",deposit_paid_at:null,fee_tier:null,fee_total:null,balance_due:null,stage:"invited",age_days:9,created_at:"2027-01-01 09:00:00",last_nudged_at:null,looks_test:false,test_flags:[],delete:{allowed:false,reasons:["it has 12 players on the roster"]},...o});
let ov={season:{id:1,year:2027,exists:true},health:[{key:"season",ok:true,text:"Season 2027 found"},{key:"forms",ok:true,text:"Team form #5181 live"},{key:"x",ok:false,text:"Mail not configured"}],forms:{live:{id:5181},test:{id:5178}},tcc:{form_id:2273,exists:true,entries:3,synced:false,note:""},
 funnel:{},cooldown_days:3,
 money:{collected:500,outstanding:1250,paying:1,waiting:3,fee_now:2000,tier_now:"late",early:1750,late:2000,deposit:500,potential_now:6000,potential_late:6000,saves_per_team:250,cutoff:"2027-01-31",days_left:0,balance_due_date:"2027-03-01"},
 balance:{rows:[{key:"gold_open",label:"Gold Open",expected:4,actual:3,delta:-1},{key:"womens",label:"Women's",expected:2,actual:0,delta:-2}],other:1},
 teams:[
  T({id:1,name:"Team Ann",captain:{player_id:1,name:"Ann Cap",email:"ann@x.test"},account:"active",roster_size:12,stage:"roster"}),
  T({id:2,name:"Team Di",division:"",division_ok:false,captain:{player_id:2,name:"Di Cap",email:"di@x.test"}}),
  T({id:3,name:"Test Dummy",looks_test:true,test_flags:["test_name"],delete:{allowed:true,reasons:[]}}),
  T({id:4,name:"Orphan FC",delete:{allowed:true,reasons:[]}})],
 entries:[{entry_id:11,form:"live",date:"2027-01-05 10:00:00",user_id:5,team_id:1,team:"Team Ann",captain:"Ann Cap",state:"needs_recording",would:W("early",1750),date_used:"2027-01-05 10:00:00"},
  {entry_id:12,form:"live",date:"2027-02-05 10:00:00",user_id:6,team_id:null,team:"Team Flo",captain:"Flo Cap",state:"needs_recording",would:W("late",2000),date_used:"2027-02-05 10:00:00"},
  {entry_id:13,form:"test",date:"2027-01-05 10:00:00",user_id:7,team_id:null,team:"",captain:"",state:"test",would:null}],
 issues:[{key:"team_division",level:"bad",title:"Team Di has no valid division",detail:"x",team_id:2,fix:{type:"division",team_id:2}},{key:"needs_recording",level:"bad",title:"Deposit not recorded for Team Ann",detail:"y",team_id:1,entry_id:11,fix:{type:"record",entry_id:11}},{key:"team_captain",level:"warn",title:"Orphan FC has no captain",detail:"z",team_id:4,fix:{type:"captain",team_id:4}}],
 pending:2,history:[{id:7,action:"captain_sync_deposit",team_id:1,at:"2027-01-06 08:00:00",by:"Admin",notes:"Recorded deposit",undone:false,can_undo:true},{id:8,action:"captain_sync_team_deleted",team_id:99,at:"2027-01-06 09:00:00",by:"Admin",notes:"Deleted Old Test",undone:false,can_undo:false,can_restore:true}],
 divisions:[{key:"gold_open",label:"Gold Open",active:true},{key:"womens",label:"Women's",active:true}],min_players:11,can_write:true,generated_at:"2027-01-06 08:00:00"};
let calls=[],posts=[];
g.fetch=async(url,o={})=>{const m=o.method||"GET";calls.push([m,url]);const J=(j,ok=true,s=200)=>({ok,status:s,json:async()=>j});
  if(url.endsWith("/captain-sync/overview"))return J(ov);
  if(url.includes("/captain-sync/team-detail"))return J({success:true,timeline:[],players:["A Roster"],ledger:[{label:"Deposit",amount:500,date:"2027-01-02 09:00:00",state:"paid"}],impact:{}});
  if(url.includes("/captain-sync/players"))return J({players:[{id:42,name:"Pat Player",email:"pat@x.test",account:"active"}]});
  if(m==="POST"){const b=JSON.parse(o.body);posts.push([url,b]);
    if(url.endsWith("/record")){ov={...ov,entries:ov.entries.map(e=>b.entry_ids.includes(e.entry_id)?{...e,state:"recorded"}:e),pending:0};return J({success:true,recorded:b.entry_ids.length,results:b.entry_ids.map(id=>({entry_id:id,status:"recorded",team:"T",message:"Recorded."}))});}
    if(url.endsWith("/undo"))return J({success:true,message:"Undone."});
    if(url.endsWith("/remove-team"))return b.dry_run?J({success:true,dry_run:true,impact:{allowed:true,needs_ack:true,removes:["the team record","2 roster rows (the players themselves are kept)"],keeps:["player records"],blocked:[]}}):J({success:true,message:"Removed."});
    if(url.endsWith("/note"))return J({success:true,message:"Note saved."});
    if(url.endsWith("/team-division"))return J({success:true,message:"Division saved."});
    if(url.endsWith("/team-captain"))return J({success:true,message:"Captain set."});
    if(url.endsWith("/restore-team"))return J({success:true,message:"Restored."});
    if(url.endsWith("/nudge"))return b.dry_run?J({success:true,dry_run:true,sent:0,results:b.team_ids.map(id=>({team_id:id,name:"Team "+id,to:"ann@x.test",status:"ready",subject:"Subj",body:"Body text"}))}):J({success:true,dry_run:false,sent:b.team_ids.length,results:[]});
    if(url.endsWith("/delete-teams")){ov={...ov,teams:ov.teams.filter(t=>!b.team_ids.includes(t.id))};return J({success:true,deleted:b.team_ids.length,message:"Deleted "+b.team_ids.length+" teams.",results:b.team_ids.map(id=>({team_id:id,status:"deleted",name:"T"+id,message:"Deleted."}))});}}
  return J({},false,404)};
const Page=require(path.join(root,".smoke/out/pages/CaptainSync.js")).default;
const React=(await import(path.join(root,"node_modules/react/index.js"))).default; const {createRoot}=await import(path.join(root,"node_modules/react-dom/client.js")); const {act}=React;
const tick=(n=40)=>new Promise(r=>setTimeout(r,n)); let fails=0; const ok=(c,m)=>{if(!c){fails++;console.log("FAIL",m)}else console.log("ok  ",m)};
const text=()=>document.body.textContent; const btn=(t)=>[...document.querySelectorAll("button")].find(b=>b.textContent.includes(t));
const setVal=(el,v)=>{const proto=el.tagName==="SELECT"?dom.window.HTMLSelectElement.prototype:el.tagName==="TEXTAREA"?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;dom.window.Object.getOwnPropertyDescriptor(proto,"value").set.call(el,v);el.dispatchEvent(new dom.window.Event(el.tagName==="SELECT"?"change":"input",{bubbles:true}));};
const el=document.getElementById("root");const root_=createRoot(el);
await act(async()=>{root_.render(React.createElement(Page));await tick();await tick();});
ok(!text().includes("NaN")&&!text().includes("undefined"),"no NaN/undefined on first paint");
ok(text().includes("Captain Sync")&&text().includes("Season 2027"),"hero");
ok(text().includes("2 deposits never reached their teams"),"headline names pending deposits");
ok(document.querySelectorAll(".gc-fun-step").length===5,"5 funnel steps");
ok(document.querySelectorAll("[role=tab]").length===5,"5 tabs");
ok(text().includes("Do this next")&&document.querySelectorAll(".gc-act").length>=2,"next-best-action card");
ok(text().includes("Mail not configured")&&text().includes("2 setup checks passed"),"failed check shown, passes collapsed");
ok(text().includes("Division balance")&&text().includes("Women's")&&text().includes("Money")&&text().includes("$1,250.00"),"money and balance");
ok(text().includes("status: unpaid")&&text().includes("early")&&text().includes("late"),"deposit preview both tiers");
ok(document.querySelectorAll("tbody input[type=checkbox]").length===2,"only unrecorded entries selectable");
ok(btn("Record selected").disabled,"record disabled until selected");
await act(async()=>{btn("Select all 2").click();await tick();});
await act(async()=>{btn("Record 2 selected").click();await tick();});
ok(!!document.querySelector("[role=dialog]")&&text().includes("Record 2 deposits?"),"record confirm dialog");
await act(async()=>{document.dispatchEvent(new dom.window.KeyboardEvent("keydown",{key:"Escape",bubbles:true}));await tick();});
ok(!document.querySelector("[role=dialog]")&&posts.length===0,"Escape closes, no write before confirm");
await act(async()=>{btn("Record 2 selected").click();await tick();});
await act(async()=>{const b=btn("Record now");b.click();b.click();await tick();await tick();});
await act(async()=>{await tick(400);});
ok(posts.filter(p=>p[0].endsWith("/record")).length===1,"double click sends ONE record request");
ok(posts[0][1].confirm===true&&posts[0][1].send_email===false,"record payload safe defaults");
// teams tab
await act(async()=>{btn("Teams").click();await tick();});
ok(document.querySelectorAll(".gc-team").length===4,"4 team cards, no table");
ok(!document.querySelector(".gc-panel-teams table")&&!document.querySelector("#gc-panel-teams table"),"teams view has no wide table");
ok(text().includes("Test data?")&&text().includes("No captain"),"test badge and no-captain action");
ok(text().includes("9 days stuck"),"stuck badge");
// filter no captain
const nc=[...document.querySelectorAll("label.gc-check")].find(l=>l.textContent.includes("No captain")).querySelector("input");
await act(async()=>{nc.click();await tick();});
ok(document.querySelectorAll(".gc-team").length===2,"no-captain filter");
await act(async()=>{nc.click();await tick();});
// assign captain
await act(async()=>{btn("Add").click();await tick();});
ok(text().includes("Add a captain to"),"assign dialog opens");
const pq=document.getElementById("gc-pq");
await act(async()=>{setVal(pq,"pa");await tick(400);});
ok(text().includes("Pat Player"),"player search results");
const radio=document.querySelector("input[name=gc-pp]");
await act(async()=>{radio.click();await tick();});
await act(async()=>{btn("Make captain").click();await tick();await tick();});
ok(posts.some(p=>p[0].endsWith("/team-captain")&&p[1].player_id===42),"assign captain posted");
// drawer
await act(async()=>{document.querySelector(".gc-team-name").click();await tick();});
ok(!!document.querySelector(".gc-modal.drawer")&&document.querySelectorAll(".gc-tl li").length===5,"team drawer with 5-step timeline");
ok(text().includes("Money for this team")&&text().includes("A Roster"),"drawer loads ledger and roster");
await act(async()=>{setVal(document.getElementById("gc-note"),"Phoned");await tick();});
await act(async()=>{btn("Save note").click();await tick();await tick();});
ok(posts.some(p=>p[0].endsWith("/note")&&p[1].note==="Phoned"),"note saved");
const tname=document.querySelector(".gc-modal.drawer h2").textContent;
await act(async()=>{btn("Remove team").click();await tick();await tick();});
ok(posts.some(p=>p[0].endsWith("/remove-team")&&p[1].dry_run===true)&&text().includes("This will keep"),"remove shows impact first");
const rmBtn=()=>[...document.querySelectorAll("[role=dialog] button.danger")].find(b=>b.textContent.includes("Remove team"));
ok(rmBtn().disabled,"remove locked until reason, box and name");
await act(async()=>{setVal(document.getElementById("gc-rm-why"),"Disbanded");setVal(document.getElementById("gc-rm-name"),tname);document.querySelector("[role=dialog] input[type=checkbox]").click();await tick();});
ok(!rmBtn().disabled,"remove unlocked once all three are given");
ok(!posts.some(p=>p[0].endsWith("/remove-team")&&!p[1].dry_run),"nothing removed before the click");
await act(async()=>{rmBtn().click();await tick();await tick();});
ok(posts.some(p=>p[0].endsWith("/remove-team")&&p[1].confirm_name===tname&&p[1].acknowledge===true&&p[1].reason==="Disbanded"),"remove posted with name, reason and acknowledgement");
// nudge
await act(async()=>{btn("Remind captains").click();await tick();await tick();});
ok(text().includes("will get a short reminder")&&posts.some(p=>p[0].endsWith("/nudge")&&p[1].dry_run===true),"nudge dry-run preview first");
ok(!posts.some(p=>p[0].endsWith("/nudge")&&p[1].confirm),"nothing sent before confirm");
await act(async()=>{[...document.querySelectorAll("[role=dialog] button")].find(b=>b.textContent.includes("Send")).click();await tick();await tick();});
ok(posts.some(p=>p[0].endsWith("/nudge")&&p[1].confirm===true),"nudge send after confirm");
// clean-up
await act(async()=>{btn("Clean-up").click();await tick();});
ok(text().includes("Looks like test data")&&text().includes("Test Dummy")&&text().includes("Orphan FC"),"clean-up groups");
ok(text().includes("2 teams kept because of real data"),"protected group");
ok(!document.querySelector(".gc-sticky"),"delete bar hidden with nothing selected");
await act(async()=>{btn("Select all 1").click();await tick();});
await act(async()=>{btn("Delete 1 team permanently").click();await tick();});
ok(text().includes("Type DELETE to confirm"),"typed confirmation dialog");
const delBtn=()=>[...document.querySelectorAll("[role=dialog] button.danger")].find(b=>b.textContent.includes("Delete"));
ok(delBtn().disabled,"delete gated until typed");
await act(async()=>{setVal(document.getElementById("gc-del"),"delete");await tick();});
ok(!delBtn().disabled,"typed word unlocks (case-insensitive)");
ok(!posts.some(p=>p[0].endsWith("/delete-teams")),"no delete before confirm");
await act(async()=>{delBtn().click();await tick();await tick();});
ok(posts.filter(p=>p[0].endsWith("/delete-teams")).length===1&&posts.find(p=>p[0].endsWith("/delete-teams"))[1].confirm==="DELETE","delete posted once with word");
ok(text().includes("Deleted 1 team"),"delete result");
// problems
await act(async()=>{btn("Problems").click();await tick();});
ok(text().includes("Team Di has no valid division")&&text().includes("Add a captain"),"problems incl. captain fix");
const sel=document.querySelector("select.gc-select");
await act(async()=>{setVal(sel,"womens");await tick();});
ok(document.querySelector("select.gc-select")===sel&&document.activeElement!==null,"DivFix select not remounted on change");
await act(async()=>{[...document.querySelectorAll("button")].find(b=>b.textContent==="Save").click();await tick();await tick();});
ok(posts.some(p=>p[0].endsWith("/team-division")&&p[1].team_id===2&&p[1].division==="womens"),"division fix posted");
// history
await act(async()=>{btn("History").click();await tick();});
ok(text().includes("Restore team"),"restore button for deleted team");
await act(async()=>{btn("Restore team").click();await tick();});
await act(async()=>{[...document.querySelectorAll("[role=dialog] button")].find(b=>b.textContent==="Restore").click();await tick();await tick();});
ok(posts.some(p=>p[0].endsWith("/restore-team")&&p[1].audit_id===8),"restore posted");
await act(async()=>{btn("Undo").click();await tick();});
await act(async()=>{[...document.querySelectorAll("[role=dialog] button")].find(b=>b.textContent==="Undo").click();await tick();await tick();});
ok(posts.some(p=>p[0].endsWith("/undo")&&p[1].audit_id===7),"undo posted");
await act(async()=>{btn("Teams").click();await tick();});
ok(!text().includes("Tahoe Champions Cup"),"no TCC note on the page");
ok(!text().includes("NaN")&&!text().includes("undefined"),"no NaN/undefined at end");
console.log(fails?`\n${fails} FAILED`:"\nall smoke checks OK"); process.exit(fails?1:0);
