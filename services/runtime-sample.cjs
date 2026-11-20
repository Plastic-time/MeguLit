// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 探针补「做差分用的运行时样本」) what the maintainer needs besides scripts and exe to make an official game diff:
   the first lines of a run as the engine reported them (positions, name box, choices, effect frames, drops) and a few clean
   pictures of the game window. Collected by the live self-check (services/self-check-live.cjs) during its first window, kept in
   data/runtime-samples/<exe key>/ (sample.json + shot-1..3.jpg), and packed into the next probe (probe-full.cjs items kind
   'runtime' and 'shot'). Format: docs/auto-profile.md.
   Privacy: only the game's own window is captured (GalNative.sceneShot: the game's client area, MeguLit's layers and the desktop
   are not in it), at most 3 pictures, each at most 600 KB; the text is the game's own; no paths, no user names. */
const fs=require('node:fs'),path=require('node:path');
const auto=require('../core/auto-profile.cjs');
const MAX_LINES=40,MAX_EVENTS=400,SHOTS_AT=[3,10,18],SHOT_MAX=600*1024;
const dirFor=(root,executable)=>{const key=auto.exeKeySync(root,executable);return key?path.join(root,'data','runtime-samples',key):'';};
const keyDir=(root,key)=>path.join(root,'data','runtime-samples',key);

class RuntimeSample{
 constructor({exe='',engine='',app=''}={}){this.sample={schema:'megulit.runtime-sample',version:1,exe:path.win32.basename(String(exe||'')).toLowerCase(),engine:String(engine||''),app:String(app||''),createdAt:new Date().toISOString(),
  client:null,lines:[],boxes:[],choices:[],aux:[],drops:[],hide:[]};this.shots=[];this.events=0;this.lineCount=0;this.done=false;}
 /* one normalized self-check event (core/self-check.cjs parseTrace/parseReader) and the speaker the hook shows right now */
 event(e,speaker=''){if(this.done||++this.events>MAX_EVENTS)return null;const s=this.sample,at=Number.isFinite(e.at)?e.at:Date.now();
  switch(e.kind){
   case 'line':if(s.lines.length<MAX_LINES){s.lines.push({at,seq:e.seq,chars:e.chars,name:String(speaker||'').slice(0,24)});this.lineCount++;}return SHOTS_AT.includes(this.lineCount)?'shot':null;
   case 'box':if(s.boxes.length<MAX_LINES){s.boxes.push({at,line:e.line,x:e.x,y:e.y,w:e.w,h:e.h});s.client=[e.cw,e.ch];}break;
   case 'choice':s.choices.push({at,raw:e.raw,shown:e.shown});break;
   case 'aux':if(s.aux.length<MAX_LINES)s.aux.push({at,texts:e.texts.map(t=>String(t).slice(0,80)).slice(0,6)});break;
   case 'drop':s.drops.push({at,chars:e.chars});break;
   case 'hide':s.hide.push({at,seq:e.seq,visible:e.visible});break;}
  return null;}
 shot(jpegBase64){if(this.shots.length>=SHOTS_AT.length||typeof jpegBase64!=='string')return false;const b=Buffer.from(jpegBase64,'base64');if(b.length<100||b.length>SHOT_MAX||b[0]!==0xff||b[1]!==0xd8)return false;this.shots.push(b);return true;}
 /* written once, after the first window; an older sample of the same exe is replaced */
 save(root,key){if(this.done||!key)return '';this.done=true;const d=keyDir(root,key);try{fs.rmSync(d,{recursive:true,force:true});fs.mkdirSync(d,{recursive:true});
  fs.writeFileSync(path.join(d,'sample.json'),JSON.stringify({...this.sample,key,shots:this.shots.length},null,1));this.shots.forEach((b,i)=>fs.writeFileSync(path.join(d,'shot-'+(i+1)+'.jpg'),b));}catch{return '';}return d;}
}
/* the files a probe packs: [{kind,name,data}] */
function files(dir){if(!dir)return [];const out=[];try{for(const f of fs.readdirSync(dir).sort()){const p=path.join(dir,f);if(f==='sample.json')out.push({kind:'runtime',name:f,data:fs.readFileSync(p)});else if(/^shot-\d\.jpg$/.test(f))out.push({kind:'shot',name:f,data:fs.readFileSync(p)});}}catch{}return out;}
module.exports={RuntimeSample,dirFor,keyDir,files,SHOTS_AT};
