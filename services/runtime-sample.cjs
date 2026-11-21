// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 探针补「做差分用的运行时样本」) what the maintainer needs besides scripts and exe to make an official game diff:
   the first lines of a run as the engine reported them (positions, name box, choices, effect frames, drops) and a few clean
   pictures of the game window. Collected by the live self-check (services/self-check-live.cjs) during its first window, kept in
   data/runtime-samples/<exe key>/ (sample.json + shot-1..3.jpg), and packed into the next probe (probe-full.cjs items kind
   'runtime' and 'shot'). Format: docs/auto-profile.md.
   Privacy: only the game's own window is captured (GalNative.sceneShot: the game's client area, MeguLit's layers and the desktop
   are not in it), at most 3 pictures, each at most 600 KB.
   2026-11-21 screenshot policy (owner, docs/diff-layers.md 当前权威接口): every score is made on this PC; the pictures are kept in a
   local temp folder for that (os.tmpdir()/megulit-runtime-shots/<exe key>/) and leave the PC only when the first window did not
   pass or passed at the edge (shotPolicy): then 2-3 of them, scaled to a 960 px long edge under 150 KB (GalWindowBridge clientShot), go into the sample; a passing window uploads
   scores, prints and the diff only, no picture; with runtimeSampleShare off no sample is made at all; the text is the game's own; logs are scrubbed (services/diagnostics.cjs
   scrub: user name, profile paths, e-mails). The player's switch: library.json runtimeSampleShare, on unless turned off (=== false;
   owner 2026-11-21: 「这两个可以都开了 我已经和他们说了 全答应了」).
   Also kept: the first window's own log lines (runtime/hook-events.log, runtime/reader-host.log), the input of
   core/self-check.cjs and core/auto-profile.cjs, so the offline diff maker scores exactly what ran here. */
const fs=require('node:fs'),path=require('node:path');
const auto=require('../core/auto-profile.cjs');
const MAX_LINES=40,MAX_EVENTS=400,MAX_LOG=800,SHOTS_AT=[3,10,18],SHOT_MAX=600*1024,BUNDLE_MAX=3*1024*1024;
const zlib=require('node:zlib'),crypto=require('node:crypto'),os=require('node:os');
const UPLOAD_SHOT_MAX=150*1024,FULL_MAX=8*1024*1024;
const localShots=key=>path.join(os.tmpdir(),'megulit-runtime-shots',key);
/* the window's verdict decides whether pictures go along: 'over' (a threshold failed), 'edge' (passed, but a rate within a quarter
   of its threshold, or pairing within 0.05 above its floor), 'pass' (no picture) or 'none' (no verdict: no picture) */
function shotPolicy(verdict){if(!verdict||typeof verdict!=='object')return 'none';if(verdict.pass!==true)return 'over';const m=verdict.metrics||{},t=verdict.thresholds||{};
 for(const k of ['hideVisible','dropRate','repeatRate','positionPx'])if(Number.isFinite(m[k])&&Number.isFinite(t[k])&&t[k]>0&&m[k]>=0.75*t[k])return 'edge';
 if(Number.isFinite(m.pairRate)&&Number.isFinite(t.pairRate)&&m.pairRate<t.pairRate+0.05)return 'edge';return 'pass';}
function readLib(root){try{return JSON.parse(fs.readFileSync(path.join(root,'data','config','library.json'),'utf8'))||{};}catch{return {};}}
/* the player's switch (on by default, off when set to false) */
const enabled=root=>!require('../core/owner-tests.cjs').privateMode(root)&&readLib(root).runtimeSampleShare!==false;
function setEnabled(root,on){const f=path.join(root,'data','config','library.json');fs.mkdirSync(path.dirname(f),{recursive:true});const tmp=f+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify({...readLib(root),runtimeSampleShare:on===true},null,2));fs.renameSync(tmp,f);return enabled(root);}
const dirFor=(root,executable)=>{const key=auto.exeKeySync(root,executable);return key?path.join(root,'data','runtime-samples',key):'';};
const keyDir=(root,key)=>path.join(root,'data','runtime-samples',key);

class RuntimeSample{
 constructor({exe='',engine='',app=''}={}){this.sample={schema:'megulit.runtime-sample',version:1,exe:path.win32.basename(String(exe||'')).toLowerCase(),engine:String(engine||''),app:String(app||''),createdAt:new Date().toISOString(),
  client:null,lines:[],boxes:[],choices:[],aux:[],drops:[],redrawn:[],hide:[]};this.shots=[];this.small=[];this.events=0;this.lineCount=0;this.done=false;this.logs={hook:[],reader:[]};}
 /* the raw log lines of the window (hook-events.log message, reader-host.log entry) */
 rawTrace(message){if(!this.done&&this.logs.hook.length<MAX_LOG)this.logs.hook.push(new Date().toISOString()+' '+String(message).slice(0,600));}
 rawReader(entry){if(!this.done&&this.logs.reader.length<MAX_LOG)try{this.logs.reader.push(JSON.stringify(entry).slice(0,1200));}catch{}}
 /* one normalized self-check event (core/self-check.cjs parseTrace/parseReader) and the speaker the hook shows right now */
 event(e,speaker=''){if(this.done||++this.events>MAX_EVENTS)return null;const s=this.sample,at=Number.isFinite(e.at)?e.at:Date.now();
  switch(e.kind){
   case 'line':if(s.lines.length<MAX_LINES){s.lines.push({at,seq:e.seq,chars:e.chars,name:String(speaker||'').slice(0,24)});this.lineCount++;}return SHOTS_AT.includes(this.lineCount)?'shot':null;
   case 'box':if(s.boxes.length<MAX_LINES){s.boxes.push({at,line:e.line,x:e.x,y:e.y,w:e.w,h:e.h});s.client=[e.cw,e.ch];}break;
   case 'choice':s.choices.push({at,raw:e.raw,shown:e.shown});break;
   case 'aux':if(s.aux.length<MAX_LINES)s.aux.push({at,texts:e.texts.map(t=>String(t).slice(0,80)).slice(0,6)});break;
   case 'drop':s.drops.push({at,chars:e.chars});break;
   case 'redrawn':s.redrawn.push({at,chars:e.chars});break;
   case 'hide':s.hide.push({at,seq:e.seq,visible:e.visible});break;}
  return null;}
 /* full: the picture at the game's own size (stays on this PC); small: the copy scaled to a 960 px long edge under 150 KB that may
    be uploaded (GalWindowBridge clientShot); without small, a full picture under UPLOAD_SHOT_MAX is its own small copy */
 shot(jpegBase64,smallBase64){if(this.shots.length>=SHOTS_AT.length||typeof jpegBase64!=='string')return false;const jpg=b=>b.length>=100&&b[0]===0xff&&b[1]===0xd8;
  const b=Buffer.from(jpegBase64,'base64');if(!jpg(b)||b.length>FULL_MAX)return false;let small=null;if(typeof smallBase64==='string'){const x=Buffer.from(smallBase64,'base64');if(jpg(x)&&x.length<=UPLOAD_SHOT_MAX)small=x;}
  else if(b.length<=UPLOAD_SHOT_MAX)small=b;this.shots.push(b);this.small.push(small);return true;}
 /* written once, after the first window; an older sample of the same exe is replaced */
 save(root,key,prints=null,verdict=null){if(this.done||!key)return '';this.done=true;if(prints)this.sample.prints=require('../core/game-print.cjs').check(prints);const d=keyDir(root,key);try{fs.rmSync(d,{recursive:true,force:true});fs.mkdirSync(d,{recursive:true});
  /* every picture stays on this PC (scoring); only an 'over' or 'edge' window attaches 2-3 small ones to the sample */
  const local=localShots(key);try{fs.rmSync(local,{recursive:true,force:true});fs.mkdirSync(local,{recursive:true});this.shots.forEach((b,i)=>fs.writeFileSync(path.join(local,'shot-'+(i+1)+'.jpg'),b));}catch{}
  const why=shotPolicy(verdict),attach=why==='over'||why==='edge'?this.small.filter(Boolean).slice(0,3):[];
  fs.writeFileSync(path.join(d,'sample.json'),JSON.stringify({...this.sample,key,shots:attach.length,shotsTaken:this.shots.length,shotPolicy:why},null,1));attach.forEach((b,i)=>fs.writeFileSync(path.join(d,'shot-'+(i+1)+'.jpg'),b));
  let scrub=t=>t;try{const dg=require('./diagnostics.cjs');if(dg.scrub)scrub=t=>dg.scrub(t);}catch{}
  const NL=String.fromCharCode(10);fs.writeFileSync(path.join(d,'hook-events.log'),scrub(this.logs.hook.join(NL)+NL));fs.writeFileSync(path.join(d,'reader-host.log'),scrub(this.logs.reader.join(NL)+NL));
  /* 2026-11-21 (diff-maker: engine-draw ToMe_CHARS records) the engine-draw log lines of this window too */
  const draw=engineDraw(root,this.sample.createdAt,new Date().toISOString());if(draw)fs.writeFileSync(path.join(d,'engine-draw.log'),scrub(draw));}catch{return '';}return d;}
}
/* the lines of logs/engine-draw.log (each "ISO time + raw ToMe_CHARS record", feat/engine-draw) between from-5 s and to; at most
   ENGINE_DRAW_MAX bytes, read from the end of the log only */
const ENGINE_DRAW_MAX=1536*1024,ENGINE_DRAW_READ=8*1024*1024;
function engineDraw(root,from,to){const f=path.join(root,'logs','engine-draw.log');let text='';try{const st=fs.statSync(f),start=Math.max(0,st.size-ENGINE_DRAW_READ),fd=fs.openSync(f,'r');try{const b=Buffer.alloc(st.size-start);fs.readSync(fd,b,0,b.length,start);text=b.toString('utf8');}finally{fs.closeSync(fd);}}catch{return '';}
 const lo=new Date(Date.parse(from)-5000).toISOString(),hi=String(to||'9');const out=[];let bytes=0;
 for(const line of text.split(/\r?\n/)){const at=line.slice(0,24);if(!/^\d{4}-\d\d-\d\dT/.test(at)||at<lo||at>hi)continue;bytes+=Buffer.byteLength(line)+1;if(bytes>ENGINE_DRAW_MAX)break;out.push(line);}
 return out.length?out.join(String.fromCharCode(10))+String.fromCharCode(10):'';}
/* the files a probe packs: [{kind,name,data}] */
function files(dir){if(!dir)return [];const out=[];try{for(const f of fs.readdirSync(dir).sort()){const p=path.join(dir,f);if(f==='sample.json'||f==='hook-events.log'||f==='reader-host.log'||f==='engine-draw.log')out.push({kind:'runtime',name:f,data:fs.readFileSync(p)});else if(/^shot-\d\.jpg$/.test(f))out.push({kind:'shot',name:f,data:fs.readFileSync(p)});}}catch{}return out;}
/* a runtime-only bundle (an exe whose scripts and exe the relay already has): {schema,key,files:[{name,kind,sha256,data base64}]},
   gzip; null when there is nothing or it is too big */
function bundle(dir,key){const list=files(dir);if(!list.length)return null;const doc={schema:'megulit.runtime-bundle',version:1,key,createdAt:new Date().toISOString(),files:list.map(f=>({name:f.name,kind:f.kind,sha256:crypto.createHash('sha256').update(f.data).digest('hex'),data:f.data.toString('base64')}))};
 const z=zlib.gzipSync(Buffer.from(JSON.stringify(doc)),{level:9});return z.length<=BUNDLE_MAX?{data:z,sha256:crypto.createHash('sha256').update(z).digest('hex'),bytes:z.length}:null;}
/* what changes when the sample changes (the probe remembers it to send a new one only) */
function stamp(dir){try{return crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,'sample.json'))).digest('hex');}catch{return '';}}
module.exports={shotPolicy,localShots,RuntimeSample,dirFor,keyDir,files,bundle,stamp,enabled,setEnabled,engineDraw,SHOTS_AT,BUNDLE_MAX};
