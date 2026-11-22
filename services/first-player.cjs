// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* The existing game-page torch card. Installed verified profile data is shown before this PC's older upload credit.
   Legacy received credit is display-only; first/off/thanks remain available when no current received profile exists.
   Reads are bounded; a slow relay never blocks the page indefinitely. Actual engine metadata is in original.library. */
const fs=require('node:fs'),path=require('node:path');
const HIDDEN={state:'hidden'};
const MISSING_TTL=6*3600000;
function engineKnown(engine){try{const P=require('../core/profiles/index.cjs'),id=P.engineId(engine);if(!id)return '';if(P.loadEngine(id))return id;return fs.existsSync(path.join(require('../core/profiles/seed.cjs').SEED_DIR,id))?id:'';}catch{return '';}}
function hasGameSeed(row,engine,key){try{const p=require('../core/profiles/index.cjs').profileFor({engine,exe:row.executable,title:row.title,folder:path.dirname(row.executable),exeSha256:key});return !!p.seedStatus&&p.seedStatus!=='skeleton';}catch{return false;}}
const timeout=(p,ms)=>new Promise(res=>{const t=setTimeout(()=>res(null),ms);Promise.resolve(p).then(v=>{clearTimeout(t);res(v);},()=>{clearTimeout(t);res(null);});});
async function state(db,root,id,{wait=2500,fetcher=globalThis.fetch,hash,torchKeys}={}){
 const row=db.prepare('SELECT id,title,executable,original FROM games WHERE id=? AND removed_at IS NULL').get(String(id));if(!row||!row.executable)return HIDDEN;
 const auto=require('../core/auto-profile.cjs'),feed=require('./auto-profile-feed.cjs');
 const key=(hash?await timeout(hash(row.executable),wait):await timeout(auto.exeKey(root,row.executable),Math.max(wait,3000)))||'';if(!key)return HIDDEN;
 const seed=require('../core/profiles/seed.cjs').versionOf(key);
 const presentation=require('./presentation.cjs').forGame(root,key,row.executable,id);
 const local=seed?{key,bundled:{source:seed.source,revision:seed.rev}}:{key};if(presentation)local.presentation=presentation;
 const live=require('./self-check-live.cjs').current();
 if(live?.reader.root===root&&live.exe===row.executable&&live.key===key&&live.reader.gal?.profile?.exeSha256===key)local.application=live.reader.gal.profile.application;
 const inactiveCard=local.application?.layers.length?{...local,state:'applied'}:HIDDEN;
 const receiver=require('./torch-receive.cjs');
 const receipt=await receiver.installed(root,key,{exe:row.executable,...(torchKeys?{keys:torchKeys}:{})});
 if(receipt)return {...local,state:'received',receipt};
 const pending=receiver.status(root,id);
 if(pending?.key===key&&['installing','install-failed'].includes(pending.state))return {...local,...pending};
 const isolated=require('../core/owner-tests.cjs').privateMode(root);
 const answer=feed.cached(root,key),layer=feed.layer(answer,key,{exe:row.executable});
 if(answer?.torchQuarantined)return {...local,state:'install-failed',code:'TORCH_REVOKED'};
 if(!isolated){
  const credit=layer&&feed.cleanCredit(answer.credit);
  if(credit)return {...local,state:'received',credit,receipt:null};
  if(feed.sent(root,key)){if(wait>0)await timeout(feed.syncCredit(root,key,{fetcher}),wait);const ordinary=await feed.ordinaryState(root,key,fetcher);return {...local,state:'thanks',credit:feed.creditOf(root,key),...(ordinary?{ordinary}:{})};}
 }
 if(isolated&&feed.calibrationSharing(root)&&feed.sent(root,key)){
  const ordinary=await feed.ordinaryState(root,key,fetcher);
  return {...local,state:'thanks',isolated:true,...(ordinary?{ordinary}:{})};
 }
 const age=Date.now()-pending?.checkedAt;
 // A confirmed miss can outlive a subsequent publication.
 const missing=pending?.key===key&&pending.code==='TORCH_NOT_PUBLISHED'&&age>=0&&age<MISSING_TTL&&!layer;
 if(!missing)return seed?{...local,state:'bundled'}:inactiveCard;
 let storedEngine=row.engine||'';try{storedEngine=JSON.parse(row.original||'{}').library?.engine||storedEngine;}catch{}
 const engine=engineKnown(seed?.engine||storedEngine);
 if(!engine)return seed||isolated?{...local,state:'not-published'}:inactiveCard;
 if(isolated||seed){
  return {...local,state:'not-published',eligible:true,submission:isolated?(feed.calibrationSharing(root)?'isolated-sharing':'isolated'):'bundled'};
 }
 if(hasGameSeed(row,engine,key))return inactiveCard;
 return {...local,state:feed.sharing(root)?'first':'off',eligible:true};}
/* the card's credit box: name = the text typed, null = anonymous / withdraw. -> {state:'saved'|'local'|'failed', credit} */
async function setCredit(db,root,id,name,{fetcher=globalThis.fetch,hash}={}){
 const row=db.prepare('SELECT executable FROM games WHERE id=? AND removed_at IS NULL').get(String(id));if(!row||!row.executable)return {state:'failed',credit:null};
 const feed=require('./auto-profile-feed.cjs'),key=(hash?await hash(row.executable):await require('../core/auto-profile.cjs').exeKey(root,row.executable))||'';
 return feed.setCredit(root,key,name,{fetcher});}
/* the switch on the card: 共享适配 and the calibration upload (library.json sharedAdaptation + autoProfileShare) */
function enableSharing(root){if(require('../core/owner-tests.cjs').privateMode(root))return false;const f=path.join(root,'data','config','library.json');let lib={};try{lib=JSON.parse(fs.readFileSync(f,'utf8'))||{};}catch{}
 fs.mkdirSync(path.dirname(f),{recursive:true});const tmp=f+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify({...lib,sharedAdaptation:true,autoProfileShare:true},null,2));fs.renameSync(tmp,f);return require('./auto-profile-feed.cjs').sharing(root);}
module.exports={state,setCredit,enableSharing,engineKnown};
