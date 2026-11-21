// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* The owner's logs -> a replay timeline (tools/reader-replay/driver.cjs steps).
   Facts taken from the logs as they are:
     engine-draw.log   every ToMe_CHARS record (KiriKiri script.inc) at its time -> HookBridge {type:'hookChars',line}
     reader-host.log   pointer downs on the game (the owner's clicks)            -> marks right before each click
     hook-events.log   'source chars=N' times                                     -> the hookSource times
   Reconstructed (labelled, checked): the hookSource TEXT of a dialogue line is the text of its first ToMe_CHARS record (the
   log keeps only its length); extract() returns the logged lengths so a fixture asserts they match. */
const fs=require('node:fs'),path=require('node:path');
const T=s=>Date.parse(s);
function readLines(file){return fs.existsSync(file)?fs.readFileSync(file,'utf8').split(/\r?\n/):[];}
function extract(logs,fromIso,toIso){
 const a=T(fromIso),z=T(toIso),inside=t=>t>=a&&t<=z;
 const chars=[];for(const l of readLines(path.join(logs,'engine-draw.log'))){const m=/^(\S+Z) (ToMe_CHARS .*)$/.exec(l);if(m&&inside(T(m[1])))chars.push({t:T(m[1]),raw:m[2]});}
 const sources=[],placed=[],other=[];for(const l of readLines(path.join(logs,'hook-events.log'))){const m=/^(\S+Z) (.*)$/.exec(l);if(!m||!inside(T(m[1])))continue;const t=T(m[1]),s=m[2];let x;
  if((x=/^source chars=(\d+) sequence=(\d+)/.exec(s)))sources.push({t,chars:+x[1],seq:+x[2]});else if(/^placement /.test(s))placed.push({t,s});else other.push({t,s});}
 const clicks=[],host=[];for(const l of readLines(path.join(logs,'reader-host.log'))){if(!l.startsWith('{'))continue;let o;try{o=JSON.parse(l);}catch{continue;}const t=T(o.at);if(!inside(t))continue;if(o.type==='hostFrame'&&o.pointer==='down')clicks.push({t,gameX:o.gameX,gameY:o.gameY,ctrl:o.ctrl});else if(o.type!=='hostFrame')host.push({t,o});}
 return {chars,sources,placed,other,clicks,host};
}
const fieldOf=(raw,k)=>{const m=new RegExp('(?:^| )'+k+'=(\\S*)').exec(raw);return m?m[1]:null;};
const textOf=raw=>{const i=raw.indexOf(' text=');return i<0?'':raw.slice(i+6);};
/* the bridge's attach of the owner's run (GalWindowBridge 'bound' / 'layout', HookBridge stream list) */
function attachSteps(game,t){return [
 {t,gwb:{type:'ready',hotkey:true,coverHotkey:true,modeHotkey:true,coverEnabled:true}},
 {t:t+50,gwb:{type:'bound',activateGame:false,coverEnabled:true,bound:true,gameProcessId:game.pid,gameStarted:game.started,gameHwnd:game.hwnd,gameStyleKey:game.sha,gameTitle:game.title,hookExact474:false,interfaceMode:'translation',processName:game.process,gameExecutable:game.exe,message:''}},
 {t:t+100,gwb:{type:'layout',...game.layout}},
 {t:t+150,hb:{type:'hookProcess',path:game.exe}},
 {t:t+200,hb:{type:'hookThreads',hookThreads:[{id:game.stream.id,name:game.stream.name,code:game.stream.code,selected:true,embed:true,sample:''}]}}
];}
/* timeline: every ToMe_CHARS record; a hookSource (text of the record) before the first record of each dialogue line number;
   a mark before each click; clicks themselves go to the hook as advance (readerInput complete) like the bridge reports them */
/* OCR art scan readings (GalWindowBridge artText, source ocr) and aux streams (HookBridge hookAuxText) as the log names them */
function sideEvents(ex,game){const out=[];let shown=false,id=0;
 for(const o of ex.other){let x;
  if((x=/^ocr page art scan (\d+)\/\d+ ?(.*)$/.exec(o.s))){const n=+x[1],text=x[2];if(n>0&&text){
   /* MODEL (labelled): the log keeps the scan's text with its rows joined; a text that is one phrase k times (the opening's litany,
      three rows faded in one by one: core/ocr-vote.cjs) is given back as k rows; any other text as one row */
   let rows=[text];for(let k=2;k<=6;k++){const L=[...text].length;if(L%k)continue;const part=[...text].slice(0,L/k).join('');if(part.repeat(k)===text){rows=Array(k).fill(part);break;}}
   if(!shown)id++;shown=true;out.push({t:o.t,gwb:{type:'artText',source:'ocr',id:'art'+id,visible:true,text,rows:rows.map((t,i)=>({text:t,x:300,y:200+i*40,w:200,h:30})),sw:game.layout.clientWidth,sh:game.layout.clientHeight,dialogSeen:false,others:0}});}
   else if(shown){shown=false;out.push({t:o.t,gwb:{type:'artText',source:'ocr',id:'art'+id,visible:false}});}}
  else if((x=/^choice aux (.+?) role=(\d+) added=\[.*?\] text="(.*)"?$/.exec(o.s))){const text=x[3].replace(/"$/,'');if(text&&text.length<=400)out.push({t:o.t,hb:{type:'hookAuxText',text,sourceName:x[1],role:+x[2]}});}
 }return out;}
function timeline(ex,game,{markEvery=true,side=true,actions=[]}={}){
 const steps=[],seen=new Set();
 const ev=[];for(const c of ex.chars)ev.push({t:c.t,k:'c',c});for(const k of ex.clicks)ev.push({t:k.t,k:'k',k});if(side)for(const s of sideEvents(ex,game))ev.push({t:s.t,k:'s',s});for(const a of actions)ev.push({t:a.t,k:'a',a});ev.sort((x,y)=>x.t-y.t);
 for(const e of ev){if(e.k==='s'){steps.push(e.s);continue;}if(e.k==='a'){steps.push(e.a);continue;}
  if(e.k==='c'){const raw=e.c.raw,line=fieldOf(raw,'line'),role=fieldOf(raw,'role')||'line',text=textOf(raw);
   if(role==='line'&&text&&!seen.has(line)&&+line<100000){seen.add(line);steps.push({t:e.t-25,hb:{type:'hookSource',text,sourceName:game.stream.name,sourceCode:game.stream.code,hookActive:true},line:+line,text});}
   steps.push({t:e.t,hb:{type:'hookChars',line:raw}});}
  else{if(markEvery)steps.push({t:e.t-1,mark:'click@'+new Date(e.t).toISOString().slice(11,23),settle:0});
   /* MODEL (labelled): did the game clear its page at this click? yes when the next dialogue line starts on a row at or above the
      row of the line before it (a new page), no when it goes on below it (the same page, KAG [l]) */
   const y=c=>{const m=/ rects=\d+,(\d+),/.exec(c.raw);return m?+m[1]:null;},line=c=>!/ role=(?!line)/.test(c.raw)&&/ n=[1-9]/.test(c.raw);
   const prev=[...ex.chars].reverse().find(c=>c.t<=e.t&&line(c)),next=ex.chars.find(c=>c.t>e.t&&line(c));
   const pageClear=!(prev&&next&&y(prev)!=null&&y(next)!=null&&y(next)>y(prev)+4);
   steps.push({t:e.t,gwb:{type:'readerInput',complete:true},pageClear});}
 }
 return steps;
}
module.exports={extract,timeline,attachSteps,sideEvents,fieldOf,textOf};
