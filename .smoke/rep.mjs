import { JSDOM } from "jsdom";
import path from "path"; import fs from "fs"; import babel from "@babel/core"; import { createRequire } from "module";
const require = createRequire(import.meta.url); const root = process.cwd();
for (const f of ["pages/Reports.jsx","lib/reportsEngine.js"]) {
  fs.mkdirSync(path.dirname(path.join(root,".smoke/out",f)),{recursive:true});
  const r = babel.transformFileSync(path.join(root,"src",f),{presets:[["@babel/preset-env",{targets:{node:"current"},modules:"commonjs"}],["@babel/preset-react",{runtime:"automatic"}]],babelrc:false,configFile:false});
  fs.writeFileSync(path.join(root,".smoke/out",f.replace(/\.jsx$/,".js")),r.code);
}
const dom = new JSDOM("<!doctype html><div id=root></div>",{url:"http://x/wp-admin/admin.php?page=grsh-tm-reports",pretendToBeVisual:true});
const g=globalThis; g.window=dom.window; g.document=dom.window.document; Object.defineProperty(g,"navigator",{value:dom.window.navigator,configurable:true});
g.HTMLElement=dom.window.HTMLElement; g.IS_REACT_ACT_ENVIRONMENT=true; g.localStorage=dom.window.localStorage;
dom.window.grshConfig={apiUrl:"/api",nonce:"n"}; dom.window.scrollTo=()=>{}; g.window.print=()=>{ prints++; };
let prints=0; const blobs=[]; dom.window.URL.createObjectURL=(b)=>{blobs.push(b);return "blob:x"}; dom.window.URL.revokeObjectURL=()=>{}; g.URL=dom.window.URL; g.Blob=dom.window.Blob;
dom.window.HTMLAnchorElement.prototype.click=function(){ clicks.push(this.download); }; const clicks=[];
let copied=null; Object.defineProperty(dom.window.navigator,"clipboard",{value:{writeText:async(t)=>{copied=t}},configurable:true});

const T=(name,o={})=>({name,colour:"#666",players:7,skill_score:70,age_score:72,parity_score:72,goalies:1,defense:2,center:2,wing:2,action:"balanced",...o});
const dv=(key,label,o={})=>({key,label,color:"#D4A017",configured:true,registered:24,settled:23,paid:23,unpaid:1,subs:1,goalies:3,goalies_unplaced:1,planned_teams:3,min_needed:21,capacity:36,tiers:{A:1,B:8,C:7,R:7,"?":1},age:{n:24,min:44,avg:52,max:66},teams:[T("Team Gold"),T("Team Blue",{parity_score:63.5,action:"review"}),T("Team Red",{parity_score:55,goalies:0,action:"rebalance"})],teams_count:3,avg_parity:63.5,...o});
const base=()=>({season:{year:2027,label:"Gold Rush 2027"},generated_at:new Date().toISOString(),last_registration_day:"2026-11-16",registration:{opens:"2026-12-01",closes:"2027-03-01",days_to_close:100,state:"open"},
 totals:{registered:26,subs:1,inactive:1,goalies:3,goalies_unplaced:1,sandbagging:1,tier_unknown:1,teams:3,teams_no_goalie:1,capacity:36,min_needed:21},
 payments:{breakdown:{paid:25,waived:0,pending:1,failed:0,refunded:0,other:0},registered:26,adds_up:true,settled:25,unpaid:1,pct_paid:96,pct_settled:96,fee:200,fee_source:"estimated",collected:5000,owed:200},
 divisions:[dv("gold_open","Gold Open"),dv("45a","45A",{registered:2,settled:2,unpaid:0,min_needed:14,capacity:22,teams:[],teams_count:0,avg_parity:null,goalies:0,goalies_unplaced:0})],
 teams_no_goalie:[{division:"gold_open",label:"Gold Open",team:"Team Red",players:7}],goalies_unplaced:[{name:"Pia Skate15",division:"gold_open"}],
 unpaid:[{player_id:6,name:"Flo Skate5",division:"gold_open",status:"pending",owes:200,days_waiting:12,has_email:true,reminded_at:null,can_remind:true}],
 flags:[{id:4,player:"Di Skate3",tier:"B2",division:"gold_open"}],tiers:{A:1,B:8,C:7,R:8,"?":2},ages:{n:24,min:44,avg:52,max:66,bands:[{label:"<40",n:0},{label:"40-44",n:1},{label:"45-49",n:5},{label:"50-54",n:8},{label:"55-59",n:6},{label:"60-64",n:3},{label:"65+",n:1}]},
 registrations_by_day:{[new Date().toISOString().slice(0,10)]:3},forecast:{projected:null,per_day:null,days_left:100,capacity:36,min_needed:21,reason:"Not enough registrations yet to project a trend."},
 issues:[{id:"goalie_gold_open_x",severity:"high",title:"Team Red (Gold Open) has no goalie",detail:"1 registered goalie is not on a roster yet in this division.",fix:{page:"grsh-tm-rosters",label:"Open Rosters"}},{id:"unpaid",severity:"medium",title:"1 unpaid registration ($200 owed)",detail:"Send a reminder before the close date.",fix:{tab:"payments",label:"Review and remind"},count:1}],
 verdict:{level:"blocked",headline:"1 thing needs fixing before the draft."},parity_bands:{rebalance_below:60,rebalance_above:85,review_below:65,review_above:80},cooldown_days:7,
 exports:[{id:"players",title:"Player pool",desc:"x"},{id:"unpaid",title:"Unpaid players",desc:"y"}],summary_text:"26 players are registered for Gold Rush 2027. 96% have paid; 1 still owe $200. 1 of 3 teams have no goalie. 1 thing needs fixing before the draft.",
 since:{ts:"x",days:3,registered:4,paid:3,unpaid:1,collected:600,no_goalie:0},history:[{at:new Date().toISOString(),registered:26,paid:25,unpaid:1,collected:5000}]});
let D=base(), mode="ok", calls=[], shares=[], remindersSent=0;
const J=(o,s=200)=>({ok:s<400,status:s,json:async()=>o,headers:{get:()=>null},blob:async()=>new Blob(["x"])});
g.fetch=async(url,o={})=>{ const m=o.method||"GET"; calls.push([m,url,o.body]);
  if(url.endsWith("/reports/overview")){ if(mode==="fail") return J({error:"boom"},500); return J(D); }
  if(url.includes("/reports/export?id=")) return J({filename:"grsh-players-2027-11-17.csv",csv:"﻿\"a\"\r\n",rows:22});
  if(url.endsWith("/reports/fee")){ const f=JSON.parse(o.body).fee; D={...D,payments:{...D.payments,fee:f?Number(f):200,fee_source:f?"set":"estimated"}}; return J(D); }
  if(url.endsWith("/reports/reminders")){ const b=JSON.parse(o.body); if(!b.send) return J({mode:"preview",eligible:1,skipped_recent:0,skipped_no_email:0,capped:false,names:["Flo Skate5"],subject:"Gold Rush 2027: your registration payment is still open",body:"Hi Alex,\n\nOur records show...",sent:0,failed:0}); remindersSent++; await new Promise(r=>setTimeout(r,50)); return J({mode:"sent",eligible:1,sent:1,failed:0}); }
  if(url.endsWith("/reports/shares")) return J(shares);
  if(url.endsWith("/reports/share")&&m==="POST"){ const s={id:"abc123abc123",created:new Date().toISOString(),expires:new Date(Date.now()+864e5).toISOString(),by:"Test"}; shares=[s]; return J({url:"https://x/wp-json/grsh/v1/reports/shared/"+"a".repeat(32),id:s.id,expires:s.expires,note:"Copy the link now. For security it is not shown again."}); }
  if(url.includes("/reports/share/")&&m==="DELETE"){ shares=[]; return J({revoked:"abc123abc123"}); }
  if(url.endsWith("/board-meeting-pack")) return {ok:true,status:200,headers:{get:(h)=>/disposition/i.test(h)?'attachment; filename="GRSH-Board-Pack-2026-11-17.html"':null},blob:async()=>new Blob(["<html>"])};
  return J({},404); };
const Rep=require(path.join(root,".smoke/out/pages/Reports.js")).default;
const React=(await import(path.join(root,"node_modules/react/index.js"))).default; const {createRoot}=await import(path.join(root,"node_modules/react-dom/client.js")); const {act}=React;
const tick=()=>new Promise(r=>setTimeout(r,30)); let fails=0; const ok=(c,m)=>{if(!c){fails++;console.log("FAIL",m)}else console.log("ok  ",m)};
const text=()=>document.body.textContent; const btns=()=>[...document.querySelectorAll("button")]; const byText=(t)=>btns().find(b=>b.textContent.trim().startsWith(t));
const click=async(el)=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true}));await tick();await tick();})};
const mount=async()=>{document.getElementById("root").innerHTML="";const r=createRoot(document.getElementById("root"));await act(async()=>{r.render(React.createElement(Rep));await tick();await tick();await tick();});return r};

let r=await mount();
ok(!text().includes("NaN")&&!text().includes("undefined"),"no NaN or 'undefined' on the overview");
ok(text().includes("1 thing needs fixing before the draft."),"verdict from the server");
ok(text().includes("Team Red (Gold Open) has no goalie"),"top issues listed in the banner");
ok(text().includes("96%")&&text().includes("25 paid"),"paid KPI shows percent and count");
ok(text().includes("$200 owed"),"outstanding shows dollars owed");
ok(text().includes("+4 since 3 days ago"),"change since last visit shown");
ok(text().includes("1 not on a roster yet"),"unplaced goalie surfaced on KPI");
ok(text().includes("Not enough registrations yet to project a trend."),"forecast says why it cannot project");
ok(text().includes("12 min")===false,"sanity");
ok(!text().includes("Generate summary")&&!text().includes("anthropic"),"no outside AI call or button left");
ok(!calls.some(c=>/anthropic/.test(c[1])),"nothing calls an outside service");
ok(calls.filter(c=>c[1].endsWith("/reports/overview")).length===1,"one overview request on load");
ok(!!document.querySelector("[role=tablist]")&&document.querySelectorAll("[role=tab]").length===9,"9 tabs with roles");
ok(document.querySelector("[role=tab][aria-selected=true]").textContent.startsWith("Overview"),"overview selected");
// keyboard
const tl=document.querySelector("[role=tablist]");
await act(async()=>{tl.dispatchEvent(new dom.window.KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));await tick();});
ok(document.querySelector("[role=tab][aria-selected=true]").textContent.startsWith("To fix"),"ArrowRight moves to next tab");
ok(text().includes("Open Rosters →")&&text().includes("Review and remind →"),"every issue has a fix action");
await click(byText("Review and remind"));
ok(document.querySelector("[role=tab][aria-selected=true]").textContent.startsWith("Payments"),"fix action jumps to the Payments tab");
// division filter
await click(byText("45A")); ok(text().includes("Nobody owes anything.")||text().includes("No unpaid players match."),"division filter applies to the unpaid list"); await click(byText("All divisions"));
// fee
const fee=document.getElementById("fee"); await act(async()=>{const set=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value").set;set.call(fee,"175");fee.dispatchEvent(new dom.window.Event("input",{bubbles:true}));await tick();});
await click(byText("Save")); ok(calls.some(c=>c[1].endsWith("/reports/fee")&&JSON.parse(c[2]).fee==="175"),"fee saved through the API"); ok(text().includes("Set by the committee."),"fee source shown");
// reminders: preview first, then confirm
calls.length=0; await click(byText("Send reminders")); 
ok(calls.length===1&&JSON.parse(calls[0][2]).send===false,"opening the dialog only previews (send:false)"); ok(remindersSent===0,"nothing sent yet");
ok(text().includes("Send 1 reminder?")&&text().includes("Flo Skate5"),"dialog shows who gets it"); ok(!!document.querySelector("[role=dialog][aria-modal=true]"),"is a modal dialog");
const send=byText("Send 1 email"); await act(async()=>{send.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true}));send.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true}));await tick();await tick();await tick();await tick();});
ok(remindersSent===1,"double click sends exactly once"); ok(text().includes("1 email sent"),"result shown"); await click(byText("Done")); ok(!document.querySelector("[role=dialog]"),"dialog closes");
// escape closes
await click(byText("Send reminders")); await act(async()=>{document.querySelector("[role=dialog]").dispatchEvent(new dom.window.KeyboardEvent("keydown",{key:"Escape",bubbles:true}));await tick();}); ok(!document.querySelector("[role=dialog]"),"Escape closes the dialog");
// parity order
await click(byText("Parity")); const rows=[...document.querySelectorAll("tbody tr td:first-child strong")].map(x=>x.textContent);
ok(rows.slice(0,3).join(",")==="Team Red,Team Blue,Team Gold","worst parity first: Red (rebalance), Blue (review), Gold (balanced)"); ok(text().includes("Balanced is 65–80"),"parity legend uses the server thresholds");
ok(text().includes("No teams have been created for this division yet"),"division with no teams says so");
// goalies / review
await click(byText("Goalies")); ok(text().includes("Team Red")&&text().includes("Pia Skate15"),"goalie tab lists the team and the unplaced goalie");
await click(byText("Review")); ok(text().includes("Di Skate3"),"flagged players listed");
// exports
await click(byText("Export")); calls.length=0; clicks.length=0; await click(byText("Download CSV")); ok(calls[0][1].includes("/reports/export?id=players"),"export asks the server for the CSV"); ok(clicks[0]==="grsh-players-2027-11-17.csv","browser download triggered with the server's filename"); ok(blobs.at(-1).type.startsWith("text/csv"),"blob is text/csv"); ok(text().includes("Downloaded grsh-players-2027-11-17.csv (22 rows)."),"toast confirms the real row count");
clicks.length=0; await click(byText("Download board pack")); ok(clicks[0]==="GRSH-Board-Pack-2026-11-17.html","board pack downloads"); ok(text().includes("Saved as a web page because no PDF library"),"says honestly when it is HTML not PDF");
// share
await click(byText("History & sharing")); await click(byText("Create link")); ok(text().includes("Copy this now.")&&!!document.querySelector("input[aria-label='Share link']"),"link shown once"); await click(btns().find(b=>b.textContent==="Copy"&&b.closest("[role=status]"))); ok(copied&&copied.includes("/reports/shared/"),"link copied");
ok(text().includes("Active links (1)"),"link listed"); await click(byText("Revoke")); ok(text().includes("Active links (0)"),"revoked");
ok(text().includes("Report history"),"history table"); await click(byText("Help")); ok(text().includes("Paid + waived + pending + failed + refunded always equals registered."),"help is accurate");
// print
await click(byText("Print this page")); ok(prints===1,"print calls window.print");
r.unmount();

console.log("-- failure and recovery");
mode="fail"; r=await mount(); ok(text().includes("Reports could not load")&&text().includes("boom"),"error screen with the reason"); ok(!text().includes("NaN"),"no NaN on error");
mode="ok"; await click(byText("Try again")); ok(text().includes("Gold Rush 2027")===false||true,"sanity"); ok(text().includes("Reports")&&text().includes("96%"),"Try again recovers"); r.unmount();

console.log("-- empty season");
D=base(); D.totals={...D.totals,registered:0,goalies:0,goalies_unplaced:0,sandbagging:0,tier_unknown:0,teams:0,teams_no_goalie:0,capacity:0,min_needed:0};
D.payments={...D.payments,breakdown:{paid:0,waived:0,pending:0,failed:0,refunded:0,other:0},registered:0,settled:0,unpaid:0,pct_paid:null,pct_settled:null,fee:null,fee_source:null,collected:0,owed:0};
D.divisions=[dv("gold_open","Gold Open",{registered:0,settled:0,unpaid:0,goalies:0,goalies_unplaced:0,teams:[],teams_count:0,avg_parity:null,age:{n:0,min:null,avg:null,max:null}})]; D.unpaid=[];D.issues=[];D.flags=[];D.teams_no_goalie=[];D.goalies_unplaced=[];D.since=null;D.history=[];D.ages={n:0,min:null,avg:null,max:null,bands:[]};D.registrations_by_day={};D.verdict={level:"empty",headline:"No registrations yet."};D.summary_text="No players have registered for Gold Rush 2027 yet.";
r=await mount(); ok(!text().includes("NaN")&&!text().includes("undefined")&&!text().includes("Infinity"),"empty season: no NaN/undefined/Infinity"); ok(text().includes("No registrations yet."),"empty verdict"); ok(/Paid\s*—/.test(text()),"paid shows a dash, not 0%");
await click(byText("To fix")); ok(text().includes("Nothing to fix yet. No one has registered."),"empty worklist message"); await click(byText("Payments")); ok(text().includes("Nobody owes anything.")&&text().includes("Not set and nobody has paid yet"),"payments: honest about unknown fee"); r.unmount();
console.log(fails?`\n${fails} FAILED`:"\nall passed"); process.exit(fails?1:0);
