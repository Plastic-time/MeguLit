// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* The existing game-page torch card. Installed verified profile data is shown before this PC's older upload credit.
   Legacy received credit is display-only; first/off/thanks remain available when no current received profile exists.
   Reads are bounded; a slow relay never blocks the page indefinitely. Actual engine metadata is in original.library. */
const fs=require('node:fs'),path=require('node:path');
const HIDDEN={state:'hidden'};
function engineKnown(engine){try{const P=require('../core/profiles/index.cjs'),id=P.engineId(engine);if(!id)return '';if(P.loadEngine(id))return id;return fs.existsSync(path.join(require('../core/profiles/seed.cjs').SEED_DIR,id))?id:'';}catch{return '';}}
function localSeed(root,row,engine,key){try{const P=require('../core/profiles/index.cjs'),S=require('../core/profiles/seed.cjs');if(S.versionOf(key))return true;
 const p=P.profileFor({engine,exe:row.executable,title:row.title,folder:path.dirname(row.executable),exeSha256:key});return !!p.seedStatus&&p.seedStatus!=='skeleton';}catch{return false;}}
const timeout=(p,ms)=>new Promise(res=>{const t=setTimeout(()=>res(null),ms);Promise.resolve(p).then(v=>{clearTimeout(t);res(v);},()=>{clearTimeout(t);res(null);});});
async function state(db,root,id,{wait=2500,fetcher=globalThis.fetch,hash,torchKeys}={}){
 const row=db.prepare('SELECT id,title,executable,original FROM games WHERE id=? AND removed_at IS NULL').get(String(id));if(!row||!row.executable)return HIDDEN;
 const auto=require('../core/auto-profile.cjs'),feed=require('./auto-profile-feed.cjs');
 const key=(hash?await timeout(hash(row.executable),wait):await timeout(auto.exeKey(root,row.executable),Math.max(wait,3000)))||'';if(!key)return HIDDEN;
 const receiver=require('./torch-receive.cjs'),pending=receiver.status(root,id);
 const receipt=await receiver.installed(root,key,{exe:row.executable,...(torchKeys?{keys:torchKeys}:{})});if(receipt)return {state:'received',key,receipt};
 if(pending?.key===key&&['installing','install-failed'].includes(pending.state))return {...pending,key};
 let storedEngine=row.engine||'';try{storedEngine=JSON.parse(row.original||'{}').library?.engine||storedEngine;}catch{}
 const engine=engineKnown(storedEngine);
 let answer=feed.cached(root,key);
 if(!answer||(!answer.none&&!feed.layer(answer,key,{exe:row.executable}))||Date.now()-(answer.fetchedAt||0)>(answer.none?6*3600000:24*3600000)){
  if(wait>0){const got=await timeout(feed.refresh(root,key,{fetcher,exe:row.executable}),wait);if(got)answer=got;}}
 /* another player's diff reached this PC: who passed it on (the relay's credit of the answer), shown as one line */
 if(answer&&!answer.none&&feed.layer(answer,key,{exe:row.executable})){const credit=feed.cleanCredit(answer.credit);if(credit)return {state:'received',key,credit,receipt:null};}
 if(feed.sent(root,key)){if(wait>0)await timeout(feed.syncCredit(root,key,{fetcher}),wait);return {state:'thanks',key,credit:feed.creditOf(root,key)};}
 if(engine&&localSeed(root,row,engine,key))return HIDDEN;
 if(!answer||!answer.none)return HIDDEN;
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
