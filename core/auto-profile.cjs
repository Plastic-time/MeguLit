// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 游戏差分全自动生成) the local half of the automatic game diff: first-play calibration and the stored result.
   A game without a stored diff plays its first self-check window (core/self-check.cjs, 20 hook lines) as usual; that window's
   events are the recording. calibrate() enumerates the few tunable keys of a game diff, predicts the six self-check metrics of
   every combination from the recording, and keeps the best one that passes every threshold; when none passes the game plays in
   read mode. Nothing is shown and nothing is re-run on screen: the prediction works on the recording only.

   Tunable keys (the same paths as core/profiles/defaults.cjs, so the stored settings are a game diff layer as is):
     calibrate.positionSource  'engine' | 'glyph' | 'ocr'   where the Japanese line is anchored (only sources the recording measured)
     calibrate.textBox         {x,y,w,h} game client px     the union of the engine's first boxes (derived, not enumerated)
     page.effectFrames         null | true                   repaints of one line are one line (fade / whisper effects)
     choice.filters            kernel | []                   kernel filters vs none
     calibrate.hideMethod      'hide' | 'read'               hide + redraw, or read mode (the fallback)
   Prediction rules (each one is what the kernel does with that key):
     - effectFrames=true: a dropped line that comes with the game's effect frames is kept as one line, but the game paints those
       frames itself, so the line counts as visible original instead (text effects cannot be hidden line by line, 2026-11-21).
     - choice.filters=[]: a filtered choice event is shown in full; when its raw options were effect frames the reader now shows
       garbage options, which counts as a mismatch too.
     - a position source the recording has no sample of is unmeasured and cannot be chosen.
   The stored file (data/config/auto-profiles/<key>.json, schema in docs/auto-profile.md) is newest-wins: a new calibration or a
   gate trip replaces it; 重新校准 deletes it. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {SelfCheck,DEFAULTS,reasonText,effectFrame}=require('./self-check.cjs');
const SCHEMA=1;
/* only keys and values core/profiles/domains.cjs allows: a stored or uploaded diff is data the kernel already understands */
const cleanSettings=s=>require('./profiles/domains.cjs').clean(s).value;

function dir(root){return path.join(root,'data','config','auto-profiles');}
/* 2026-11-21 (owner: 「key 用 exe 文件哈希（同名不同版本各自一份）」) the key of a game diff is the SHA-256 of the game's program file:
   'x-' + its first 40 hex digits. Two versions of one game (a patch, a Steam update, a Chinese exe) are two diffs; a renamed copy
   of the same file is the same one. Never a path or a title, so it can be uploaded. */
const KEY=/^x-[0-9a-f]{40}$/;
const keyFor=({hash}={})=>/^[0-9a-f]{64}$/.test(String(hash||''))?'x-'+hash.slice(0,40):'';
/* the hash of a program file, remembered by path + size + mtime (data/config/exe-hashes.json), so a game start needs no read */
const hashFile=root=>path.join(root,'data','config','exe-hashes.json');
function statKey(executable){try{const s=fs.statSync(executable);return s.isFile()?path.resolve(executable).toLowerCase()+'|'+s.size+'|'+Math.floor(s.mtimeMs):'';}catch{return '';}}
function readHashes(root){try{const v=JSON.parse(fs.readFileSync(hashFile(root),'utf8'));return v&&typeof v==='object'?v:{};}catch{return {};}}
function exeKeySync(root,executable){const k=statKey(executable);const h=k&&readHashes(root)[k];return h?keyFor({hash:h}):'';}
async function exeKey(root,executable){const known=exeKeySync(root,executable);if(known)return known;const k=statKey(executable);if(!k)return '';
 const hash=await new Promise((resolve)=>{const h=crypto.createHash('sha256');fs.createReadStream(executable).on('data',d=>h.update(d)).on('error',()=>resolve('')).on('end',()=>resolve(h.digest('hex')));});if(!hash)return '';
 try{const all=readHashes(root);all[k]=hash;const keys=Object.keys(all);for(const old of keys.slice(0,Math.max(0,keys.length-500)))delete all[old];fs.mkdirSync(path.dirname(hashFile(root)),{recursive:true});const tmp=hashFile(root)+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(all));fs.renameSync(tmp,hashFile(root));}catch{}
 return keyFor({hash});}
function load(root,key){if(!key)return null;try{const v=JSON.parse(fs.readFileSync(path.join(dir(root),key+'.json'),'utf8').replace(/^﻿/,''));return v&&v.schema===SCHEMA?v:null;}catch{return null;}}
function store(root,key,value){if(!key)return;const d=dir(root);fs.mkdirSync(d,{recursive:true});const f=path.join(d,key+'.json');fs.writeFileSync(f+'.tmp',JSON.stringify(value,null,2));fs.renameSync(f+'.tmp',f);}
function clear(root,key){if(!key)return false;try{fs.unlinkSync(path.join(dir(root),key+'.json'));return true;}catch{return false;}}

/* candidates: every combination of the enumerated keys */
function candidates(measuredSources){const out=[];const sources=measuredSources.length?measuredSources:[null];
 for(const positionSource of sources)for(const effectFrames of [null,true])for(const filters of ['kernel','none'])out.push({hideMethod:'hide',positionSource,effectFrames,filters});
 out.push({hideMethod:'read',positionSource:null,effectFrames:null,filters:'kernel'});return out;}

/* predicted window of one candidate: a SelfCheck fed the recording, with the candidate's rules applied to the events */
function predict(recording,cand,thresholds){const sc=new SelfCheck({thresholds,record:false});sc.t.window=1e9;
 if(cand.hideMethod==='read'){/* the original stays and the reader shows only the translation: nothing to hide, drop, place or pick */
  for(const e of recording)if(e.kind==='line')sc.event(e);const r=sc.score();for(const k of Object.keys(r.metrics))r.metrics[k]=k==='choiceMismatch'?0:null;r.over=[];r.pass=true;return r;}
 let lastEffect=-Infinity,lastAux=[];const effectWindow=2500;
 for(const e of recording){
  if(e.kind==='aux'){if(e.texts.some(effectFrame))lastEffect=e.at;lastAux=e;sc.event(e);continue;}
  if(e.kind==='drop'&&cand.effectFrames===true&&Number.isFinite(e.at)&&e.at-lastEffect<=effectWindow){/* kept as one line, painted by the game */sc.event({kind:'line',at:e.at,chars:e.chars,seq:-1});sc.event({kind:'hide',at:e.at,seq:-1e6-sc.w.lines,visible:true});continue;}
  if(e.kind==='choice'&&cand.filters==='none'){const garbage=lastAux&&Number.isFinite(e.at)&&e.at-lastAux.at<=1500&&lastAux.texts?.some(effectFrame);sc.event({...e,shown:garbage?0:e.raw});continue;}
  if(e.kind==='box'&&cand.positionSource&&cand.positionSource!=='engine')continue;
  sc.event(e);}
 return sc.score();}
/* lower is better: each metric as a share of its limit, summed; read mode is always last among passing ones */
function cost(r,t){const m=r.metrics;let c=0;
 if(m.hideVisible!=null)c+=m.hideVisible/t.hideVisible;if(m.dropRate!=null)c+=m.dropRate/t.dropRate;if(m.repeatRate!=null)c+=m.repeatRate/t.repeatRate;
 c+=m.choiceMismatch/Math.max(1,t.choiceMismatch);if(m.positionPx!=null)c+=m.positionPx/(r.positionLimit||t.positionPx);if(m.pairRate!=null)c+=(1-m.pairRate)/(1-t.pairRate);return Math.round(c*1000)/1000;}
function textBox(recording){const b=recording.filter(e=>e.kind==='box');if(b.length<3)return null;const x=Math.min(...b.map(e=>e.x)),y=Math.min(...b.map(e=>e.y)),r=Math.max(...b.map(e=>e.x+e.w)),bt=Math.max(...b.map(e=>e.y+e.h));return {x,y,w:r-x,h:bt-y,client:[b[0].cw,b[0].ch]};}

/* the calibration: returns {mode,settings,score,candidates,reason} */
function calibrate(recording,{thresholds={}}={}){const t={...DEFAULTS};for(const [k,v] of Object.entries(thresholds||{}))if(k in DEFAULTS&&Number.isFinite(+v))t[k]=+v;
 const sources=recording.some(e=>e.kind==='box')?['engine']:[];
 const all=candidates(sources).map(c=>{const r=predict(recording,c,t);return {params:c,metrics:r.metrics,over:r.over,pass:r.pass,lines:r.lines,cost:cost(r,t)};});
 const hide=all.filter(c=>c.params.hideMethod==='hide'),passing=hide.filter(c=>c.pass).sort((a,b)=>a.cost-b.cost||changes(a.params)-changes(b.params));
 const best=passing[0]||null,read=all.find(c=>c.params.hideMethod==='read');
 const pick=best||read;const p=pick.params;
 const settings={calibrate:{positionSource:p.positionSource,textBox:textBox(recording),hideMethod:p.hideMethod},page:{effectFrames:p.effectFrames},hide:{textEffectsRead:p.hideMethod==='read'}};
 if(p.filters==='none')settings.choice={filters:[]};/* the kernel reads the anchor from placement.firstLineAnchor; 'engine' is the kernel's own first choice (krkr-state 2026-11-21) */if(p.positionSource==='glyph')settings.placement={firstLineAnchor:'glyph'};else if(p.positionSource==='ocr')settings.placement={firstLineAnchor:'box'};
 const worst=hide.slice().sort((a,b)=>a.cost-b.cost)[0];
 return {mode:p.hideMethod,settings,score:{metrics:pick.metrics,cost:pick.cost,lines:pick.lines},reason:best?'':reasonText(worst?.over||[]),
  candidates:all.sort((a,b)=>a.cost-b.cost).slice(0,8).map(c=>({params:c.params,pass:c.pass,cost:c.cost,over:c.over,metrics:c.metrics}))};}
const changes=p=>(p.effectFrames!==null)+(p.filters!=='kernel');

/* the stored record (also the upload payload, see docs/auto-profile.md) */
function record({key,engine='',exe='',version='',source='calibration',result,gate=null}){return {schema:SCHEMA,key,engine:String(engine||''),exe:path.win32.basename(String(exe||'')).toLowerCase(),
 version:String(version||''),at:new Date().toISOString(),source,mode:result.mode,reason:result.reason||'',settings:cleanSettings(result.settings),score:result.score,candidates:result.candidates||[],gate};}
/* a gate trip on a stored hide profile: the same record, stepped down to read mode, with the window that tripped */
function stepDown(prev,{key,engine,exe,version,trip,window}){const base=prev||{settings:{}};return {schema:SCHEMA,key,engine:String(engine||base.engine||''),exe:path.win32.basename(String(exe||base.exe||'')).toLowerCase(),version:String(version||''),
 at:new Date().toISOString(),source:'gate',mode:'read',reason:trip.reason,settings:cleanSettings({...base.settings,calibrate:{...(base.settings?.calibrate||{}),hideMethod:'read'},hide:{...(base.settings?.hide||{}),textEffectsRead:true}}),
 score:{metrics:window?.metrics||trip.metrics,over:trip.over,lines:window?.lines||0},candidates:base.candidates||[],gate:{window:trip.window,over:trip.over,metrics:trip.metrics},previous:prev?{mode:prev.mode,source:prev.source,at:prev.at}:null};}
/* the block the one-click diagnostic adds (info.json autoProfile): only what the server aggregates, no paths */
function diagnostic(rec,windows=[]){if(!rec&&!windows.length)return null;return {schema:SCHEMA,profile:rec?{key:rec.key,engine:rec.engine,exe:rec.exe,version:rec.version,at:rec.at,source:rec.source,mode:rec.mode,reason:rec.reason,settings:rec.settings,score:rec.score,gate:rec.gate||null,candidates:(rec.candidates||[]).slice(0,4)}:null,
 windows:windows.slice(-10).map(w=>({window:w.window,lines:w.lines,metrics:w.metrics,over:w.over,pass:w.pass}))};}
function list(root){try{return fs.readdirSync(dir(root)).filter(f=>f.endsWith('.json')).map(f=>load(root,f.slice(0,-5))).filter(Boolean);}catch{return [];}}
module.exports={SCHEMA,KEY,dir,keyFor,exeKey,exeKeySync,load,store,clear,list,candidates,predict,calibrate,record,stepDown,diagnostic};
