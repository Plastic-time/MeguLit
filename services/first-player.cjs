// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 详情页「首位玩家」提示框) the card on the game page that tells the first player of an exe the engine layer already
   reads, but nobody has calibrated yet, to play a few minutes so the auto calibration (core/auto-profile.cjs) runs and its result is
   shared (services/auto-profile-feed.cjs report). It shows only when all three hold:
     - the relay has no diff for this exe (its answer is "none": data/The Seed/<sha>.json, asked in the background),
     - the built-in The Seed holds no diff for the game or the exe,
     - the engine is recognised (a known engine id with an engine layer or a The Seed/<engine>/ folder).
   state(db,root,id,{wait}) -> {state:'hidden'|'first'|'off'|'thanks'} (+key). first: ready to play; off: sharing is switched off;
   thanks: this PC's calibration has been uploaded. Never blocks: a cached answer is used, a fresh ask gets `wait` ms, a timeout hides. */
const fs=require('node:fs'),path=require('node:path');
const HIDDEN={state:'hidden'};
function engineKnown(engine){try{const P=require('../core/profiles/index.cjs'),id=P.engineId(engine);if(!id)return '';if(P.loadEngine(id))return id;return fs.existsSync(path.join(require('../core/profiles/seed.cjs').SEED_DIR,id))?id:'';}catch{return '';}}
function localSeed(root,row,engine,key){try{const P=require('../core/profiles/index.cjs'),S=require('../core/profiles/seed.cjs');if(S.versionOf(key))return true;
 const p=P.profileFor({engine,exe:row.executable,title:row.title,folder:path.dirname(row.executable),exeSha256:key});return !!p.seedStatus&&p.seedStatus!=='skeleton';}catch{return false;}}
const timeout=(p,ms)=>new Promise(res=>{const t=setTimeout(()=>res(null),ms);Promise.resolve(p).then(v=>{clearTimeout(t);res(v);},()=>{clearTimeout(t);res(null);});});
async function state(db,root,id,{wait=2500,fetcher=globalThis.fetch,hash}={}){
 const row=db.prepare('SELECT id,title,executable,engine FROM games WHERE id=? AND removed_at IS NULL').get(String(id));if(!row||!row.executable)return HIDDEN;
 const auto=require('../core/auto-profile.cjs'),feed=require('./auto-profile-feed.cjs');
 const key=(hash?await timeout(hash(row.executable),wait):await timeout(auto.exeKey(root,row.executable),Math.max(wait,3000)))||'';if(!key)return HIDDEN;
 if(feed.sent(root,key)){if(wait>0)await timeout(feed.syncCredit(root,key,{fetcher}),wait);return {state:'thanks',key,credit:feed.creditOf(root,key)};}
 const engine=engineKnown(row.engine);
 if(engine&&localSeed(root,row,engine,key))return HIDDEN;
 let answer=feed.cached(root,key);
 if(!answer||(!answer.none&&!feed.layer(answer,key))||Date.now()-(answer.fetchedAt||0)>(answer.none?6*3600000:24*3600000)){
  if(wait>0){const got=await timeout(feed.refresh(root,key,{fetcher}),wait);if(got)answer=got;}}
 if(!answer)return HIDDEN;
 /* another player's diff reached this PC: who passed it on (the relay's credit of the answer), shown as one line */
 if(!answer.none){if(!feed.layer(answer,key))return HIDDEN;const credit=feed.cleanCredit(answer.credit);return credit?{state:'received',key,credit}:HIDDEN;}
 if(!engine)return HIDDEN;
 return {state:feed.sharing(root)?'first':'off',key};}
/* the card's credit box: name = the text typed, null = anonymous / withdraw. -> {state:'saved'|'local'|'failed', credit} */
async function setCredit(db,root,id,name,{fetcher=globalThis.fetch,hash}={}){
 const row=db.prepare('SELECT executable FROM games WHERE id=? AND removed_at IS NULL').get(String(id));if(!row||!row.executable)return {state:'failed',credit:null};
 const feed=require('./auto-profile-feed.cjs'),key=(hash?await hash(row.executable):await require('../core/auto-profile.cjs').exeKey(root,row.executable))||'';
 return feed.setCredit(root,key,name,{fetcher});}
/* the switch on the card: 共享适配 and the calibration upload (library.json sharedAdaptation + autoProfileShare) */
function enableSharing(root){const f=path.join(root,'data','config','library.json');let lib={};try{lib=JSON.parse(fs.readFileSync(f,'utf8'))||{};}catch{}
 fs.mkdirSync(path.dirname(f),{recursive:true});const tmp=f+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify({...lib,sharedAdaptation:true,autoProfileShare:true},null,2));fs.renameSync(tmp,f);return require('./auto-profile-feed.cjs').sharing(root);}
module.exports={state,setCredit,enableSharing,engineKnown};
