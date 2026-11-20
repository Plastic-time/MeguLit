// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* diff-maker: runtime samples -> one replay sequence.
     events  what core/self-check.cjs scores (the same parsers the live gate uses, so a replay is what ran on the player's PC)
     draws   every text draw with the engine's own identity of it ({hook, cls, call, layer}, core/draw-role.cjs) and its text;
             src:'kernel' marks a line MeguLit found itself (OCR, the choice capture), which has no engine identity and no role
   Hook engines (KiriKiri ...): runtime/hook-events.log + runtime/reader-host.log, cut to manifest.runtime {from,to} when given.
   RPG Maker MV/MZ: runtime/draws.jsonl from the in-game plugin, one JSON per line:
     {"t":"draw","at":ms,"cls":["Window_ChoiceList","Window_Command",...],"method":"drawText","text":"...","rect":[x,y,w,h],"scene":"Scene_Map"}
     {"t":"page","at":ms,"cls":[...]}        a message window starts a new page (its per-character draws before it are one line)
     {"t":"shown","at":ms,"cls":[...],"text":"..."}   MeguLit drew this text (embedded or annotated)
     {"t":"choice","at":ms,"cls":[...],"items":["..."],"shown":n}   a choice / command list opened, n items got MeguLit text
   Times in a replay are ms from the first event (only differences matter). */
const {parseTrace,parseReader}=require('../../core/self-check.cjs');
const TS=/^(\d{4}-\d\d-\d\dT[\d:.]+Z)\s+(.*)$/;
const inWindow=(iso,w)=>(!w.from||iso>=w.from)&&(!w.to||iso<w.to);

/* hook-events.log + reader-host.log -> {events, draws, kept} (kept: the raw lines the maker read, for a trimmed sample probe) */
function fromHookLogs(hookEvents,readerHost,win={}){const events=[],draws=[],kept={hook:[],reader:[]};let stream='',ocrAt=-1e15,ocrText='';
 for(const raw of String(hookEvents||'').split(/\r?\n/)){const m=TS.exec(raw);if(!m||!inWindow(m[1],win))continue;const at=Date.parse(m[1]),s=m[2];let keep=false,x;
  const e=parseTrace(raw);if(e){events.push(e);keep=true;}
  if((x=/^stream memory (\S+)/.exec(s))){stream=x[1];keep=true;}
  else if((x=/^ocr line "(.*)"$/.exec(s))){ocrAt=at;ocrText=x[1];keep=true;}
  else if((x=/^source chars=(\d+) sequence=(\d+)/.exec(s))){const ocr=at-ocrAt<=200;draws.push({at,kind:'line',id:ocr?{hook:'ocr',src:'kernel'}:{hook:stream||'unknown'},chars:+x[1],text:ocr?ocrText:''});}
  else if((x=/^choice aux (.*?) role=\S* added=(\[.*?\]) text=(".*")$/.exec(s))){let added=[],text='';try{added=JSON.parse(x[2]);}catch{}try{text=JSON.parse(x[3]);}catch{}draws.push({at,kind:'aux',id:{hook:x[1]},text,added:added.length});keep=true;}
  else if((x=/^choice locate round=\d+ options=(\[.*?\])/.exec(s))){let o=[];try{o=JSON.parse(x[1]);}catch{}draws.push({at,kind:'choice',id:{hook:'choice-capture',src:'kernel'},items:o.map(String)});keep=true;}
  if(keep)kept.hook.push(raw);}
 for(const raw of String(readerHost||'').split(/\r?\n/)){if(!raw.startsWith('{'))continue;let v;try{v=JSON.parse(raw);}catch{continue;}const iso=String(v.at||'');if(!inWindow(iso,win))continue;
  const e=parseReader(v);if(e){events.push(e);kept.reader.push(raw);}}
 return {events,draws,kept};}

/* RPG Maker draws.jsonl -> {events, draws}. The message window draws one character per call: the characters up to the next page
   (or a pause over PAGE_GAP) are one line. A line counts as dropped when MeguLit showed nothing for it within SHOWN_MS. */
const PAGE_GAP=1500,SHOWN_MS=3000;
const fold=s=>String(s||'').normalize('NFKC').replace(/[\s　]/g,'');
/* roleOf(identity): the engine diff's role (core/draw-role.cjs), so a plugin's Window_Message subclass folds like the base */
function fromDraws(text,{roleOf=()=>null}={}){const isDialogue=id=>roleOf(id)==='dialogue';const rows=[];
 for(const l of String(text||'').split(/\r?\n/)){if(!l.trim())continue;try{rows.push(JSON.parse(l));}catch{}}
 rows.sort((a,b)=>(a.at||0)-(b.at||0));
 const events=[],draws=[],lines=[];let cur=null,seq=0;
 const flush=()=>{if(cur&&fold(cur.text)){lines.push(cur);draws.push({at:cur.at,kind:'line',id:cur.id,text:cur.text,chars:[...fold(cur.text)].length});}cur=null;};
 for(const r of rows){const id={cls:Array.isArray(r.cls)?r.cls.map(String):r.cls?[String(r.cls)]:[]};if(r.hook)id.hook=String(r.hook);if(r.call)id.call=String(r.call);
  if(r.t==='page'){if(isDialogue(id))flush();continue;}
  if(r.t==='draw'){if(isDialogue(id)){if(cur&&r.at-cur.last>PAGE_GAP)flush();if(!cur)cur={at:r.at,last:r.at,id,text:''};cur.text+=String(r.text||'');cur.last=r.at;}
   else draws.push({at:r.at,kind:'draw',id,text:String(r.text||''),rect:r.rect||null,scene:r.scene||''});continue;}
  if(r.t==='shown'){if(isDialogue(id))events.push({kind:'drawn',at:r.at,text:String(r.text||''),top:-1,clientY:-1,glyph:-1});else draws.push({at:r.at,kind:'shown',id,text:String(r.text||'')});continue;}
  if(r.t==='choice'){const items=(r.items||[]).map(String);draws.push({at:r.at,kind:'choice',id,items});events.push({kind:'choice',at:r.at,raw:items.length,shown:Math.max(0,+r.shown||0)});continue;}}
 flush();
 const shown=events.filter(e=>e.kind==='drawn');
 for(const ln of lines){seq++;events.push({kind:'line',at:ln.at,chars:[...fold(ln.text)].length,seq});
  const ok=shown.some(s=>s.at>=ln.at&&s.at-ln.at<=SHOWN_MS&&fold(s.text)===fold(ln.text));if(!ok)events.push({kind:'drop',at:ln.at+1,chars:[...fold(ln.text)].length});}
 return {events,draws,kept:null};}

/* both kinds, sorted, times relative to the first event */
function replay(probe,profile=null){const roleOf=id=>profile?require('../../core/draw-role.cjs').classify(profile,id).role:null;
 const r=probe.engine==='rpgmaker'||(!probe.runtime.hookEvents&&probe.runtime.draws)?fromDraws(probe.runtime.draws,{roleOf}):fromHookLogs(probe.runtime.hookEvents,probe.runtime.readerHost,probe.window);
 const all=[...r.events,...r.draws].filter(e=>Number.isFinite(e.at));const t0=all.length?Math.min(...all.map(e=>e.at)):0;
 const rel=e=>({...e,at:e.at-t0});const byAt=(a,b)=>a.at-b.at;
 return {t0,events:r.events.filter(e=>Number.isFinite(e.at)).map(rel).sort(byAt),draws:r.draws.map(rel).sort(byAt),kept:r.kept};}
module.exports={fromHookLogs,fromDraws,replay,fold};
