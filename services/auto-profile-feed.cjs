// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 每部游戏按 exe 哈希一份差分；官方差分优先，自动校准兜底；签名下发，客户端验签) game diffs from the relay
   (relay/src/auto-profile.js, docs/auto-profile.md). Hot update: nothing is rebuilt or reinstalled, a fetched diff is a profile
   layer the next time (or the moment) the game starts.
   - report(root, record): after a calibration or a gate step-down this PC's result goes to /api/game-profile/report (the
     共享适配 switch, shared-adaptation.cjs). A step-down also puts the exe in the maintainer's repair queue.
   - cached(root, key) / refresh(root, key): the relay's answer per exe key, kept in data/config/auto-profiles-feed/<key>.json
     (a day; a "none" answer 6 hours).
   - layer(answer, key): the answer as a layer, or null. Checked here, whatever the relay said: the document shape and every
     value (core/game-diff.cjs, core/profiles/domains.cjs), and its Ed25519 signature by one of our profile keys
     (services/profile-keys.json; we sign offline, tools/sign-profile.cjs, the relay holds no key). Anything else is ignored, so a
     broken or poisoned relay can at worst hand out nothing. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const auto=require('../core/auto-profile.cjs'),gameDiff=require('../core/game-diff.cjs');
const TIMEOUT=15000,FRESH_MS=24*3600000,NONE_MS=6*3600000;
/* 2026-11-21 (owner: 存放下发差分的文件夹叫「The Seed」) the relay's answers for this PC's exes: data/The Seed/<exe SHA-256>.json */
const dir=root=>path.join(root,'data','The Seed');
/* 2026-11-21 (owner: 「这两个可以都开了 我已经和他们说了 全答应了」) uploading calibrations has its own switch, library.json
   autoProfileShare, on unless the player turns it off (=== false), on top of 共享适配 (sharedAdaptation, used by other features, untouched).
   Fetching diffs is not an upload and is always on. */
function sharing(root){let lib={};try{lib=JSON.parse(fs.readFileSync(path.join(root,'data','config','library.json'),'utf8'))||{};}catch{}if(lib.autoProfileShare===false)return false;try{return require('./shared-adaptation.cjs').enabled(root);}catch{return false;}}
function setSharing(root,on){const f=path.join(root,'data','config','library.json');let lib={};try{lib=JSON.parse(fs.readFileSync(f,'utf8'))||{};}catch{}fs.mkdirSync(path.dirname(f),{recursive:true});const tmp=f+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify({...lib,autoProfileShare:on===true},null,2));fs.renameSync(tmp,f);return sharing(root);}
function endpoints(root,route){try{return require('./relay-config.cjs').endpoints(root,route);}catch{return [];}}
function keyList(file){try{const raw=JSON.parse(fs.readFileSync(path.join(__dirname,file),'utf8'));return (Array.isArray(raw.keys)?raw.keys:[]).filter(k=>k&&k.alg==='ed25519'&&typeof k.id==='string'&&typeof k.publicKey==='string'&&!k.revoked);}catch{return [];}}
let trusted=null;
/* {official:[maintainer keys], auto:[relay keys + maintainer keys]} */
function keys(){return trusted||keyList('profile-keys.json');}
/* tests trust their own keys */
function _trust(v){trusted=v||null;}
function verify(doc,list){const s=doc?.signature;if(!s||s.alg!=='ed25519'||typeof s.keyId!=='string'||typeof s.value!=='string')return false;const k=list.find(x=>x.id===s.keyId);if(!k)return false;
 try{return crypto.verify(null,Buffer.from(gameDiff.canonical(gameDiff.unsigned(doc))),crypto.createPublicKey({key:Buffer.from(k.publicKey,'base64'),format:'der',type:'spki'}),Buffer.from(s.value,'base64'));}catch{return false;}}
/* the relay's answer as layers, or null (docs/diff-layers.md). Version 2 (multi-level match, core/game-print.cjs):
     {versionLayer:{match:'exe'|'head'|'pe',key,diff}|null, gameLayer:{match:'pack'|'script'|'steam'|'vndb'|'title',key,diff}|null}
   (relay/src/auto-profile.js; 'version' is the feed's own format number)
   version 1: {diff} for this exe. Each document is checked (shape, values, layer, signature); a bad one is left out.
   A version document counts only on an exe-level match (exe / head / pe) and, matched by exe, only for this exe; a game document
   on any match. -> {source, mode, match, exact, settings, version:{source,mode,settings,rev}|null, game:{...}|null, stamp}
   exact: this exe's own hash matched the version layer; anything else is a candidate the self-check gate has to accept first. */
const VERSION_MATCH=['exe','head','pe'],GAME_MATCH=['exe','head','pe','pack','script','steam','vndb','title'];
const docOk=d=>gameDiff.validate(d).ok&&verify(d,keys());
const part=d=>({source:d.source,mode:d.mode||'hide',settings:d.settings||{},rev:d.rev|0,issuedAt:d.issuedAt||'',agree:d.agree|0,reporters:d.reporters|0});
function layer(answer,key,{torchTrust}={}){if(!answer||answer.schema!=='megulit.game-diff-feed'||answer.key!==key)return null;
 if(answer.torchRelease&&!require('./torch-receive.cjs').compatibleCached(answer,key,torchTrust))return null;
 let v=null,g=null,vm='',gm='';
 if(answer.version===2){const V=answer.versionLayer,G=answer.gameLayer;
  if(V&&V.diff&&VERSION_MATCH.includes(V.match)&&V.diff.layer!=='game'&&(V.match!=='exe'||V.diff.key===key)&&docOk(V.diff)){v=V.diff;vm=V.match;}
  if(G&&G.diff&&GAME_MATCH.includes(G.match)&&G.diff.layer==='game'&&docOk(G.diff)){const {split}=require('../core/profiles/domains.cjs');if(!Object.keys(split(G.diff.settings).version).length){g=G.diff;gm=G.match;}}}
 if(!v&&!g&&answer.diff){const d=answer.diff;if(d.layer==='game'){if(docOk(d)){g=d;gm='title';}}else if(d.key===key&&docOk(d)){v=d;vm='exe';}}
 if(!v&&!g)return null;
 const P={version:v?{...part(v),...(answer.torchRelease?{source:'official'}:{})}:null,game:g?part(g):null};const lead=P.version||P.game;
 const merged=JSON.parse(JSON.stringify(P.game?.settings||{}));const deep=(a,b)=>{for(const [k,x] of Object.entries(b||{}))a[k]=x&&typeof x==='object'&&!Array.isArray(x)&&a[k]&&typeof a[k]==='object'?deep(a[k],x):x;return a;};deep(merged,P.version?.settings);
 const mode=(P.version&&P.version.mode==='read')||(P.game&&P.game.mode==='read')?'read':'hide';
 return {source:lead.source,mode,match:v?vm:VERSION_MATCH.includes(gm)?gm:'game:'+gm,exact:vm==='exe'||!v&&gm==='exe',settings:merged,version:P.version,game:P.game,agree:lead.agree,reporters:lead.reporters,issuedAt:lead.issuedAt,
  stamp:(v?v.key+'@'+(v.rev|0)+'@'+(v.issuedAt||''):'-')+'|'+(g?g.key+'@'+(g.rev|0)+'@'+(g.issuedAt||''):'-')};}
/* a candidate (not this exe's own hash) the self-check gate refused on this PC: not applied again until the relay hands out another */
const rejectFile=(root,key)=>path.join(dir(root),key+'.rejected.json');
function rejected(root,key,l){if(!l||l.exact)return false;try{return JSON.parse(fs.readFileSync(rejectFile(root,key),'utf8')).stamp===l.stamp;}catch{return false;}}
function reject(root,key,l,why=''){if(!l||l.exact)return;try{fs.mkdirSync(dir(root),{recursive:true});fs.writeFileSync(rejectFile(root,key),JSON.stringify({stamp:l.stamp,match:l.match,why:String(why).slice(0,200),at:new Date().toISOString()}));}catch{}}
/* the query of GET /api/game-profile: every print (core/game-print.cjs check) + the revisions this PC has */
function query(key,prints,old){const p={...require('../core/game-print.cjs').check(prints||{}),exe:key};const q=new URLSearchParams();for(const k of ['exe','head','pe','pack','script','steam','vndb','title','engine'])if(p[k])q.set(k,p[k]);
 const l=old&&!old.none?layer(old,key):null;if(l?.version)q.set('have',String(l.version.rev));if(l?.game)q.set('haveGame',String(l.game.rev));return '?'+q.toString();}
function cached(root,key){if(!gameDiff.KEY.test(String(key||'')))return null;try{const v=JSON.parse(fs.readFileSync(path.join(dir(root),key+'.json'),'utf8'));return v&&typeof v==='object'?v:null;}catch{return null;}}
function keep(root,key,v){const old=cached(root,key),protectedRelease=old?.torchRelease||old?.torchQuarantined?.release;if(protectedRelease&&docOk(protectedRelease.profile)&&verify(protectedRelease,keys())&&!v.torchRelease)return old;
 const exact=a=>a?.version===2&&a.versionLayer?.match==='exe'&&a.versionLayer.diff?.key===key?a.versionLayer.diff:a?.diff?.key===key?a.diff:null,prev=exact(old),next=exact(v);
 if(prev&&next&&docOk(prev)&&docOk(next)&&(next.rev<prev.rev||next.rev===prev.rev&&gameDiff.canonical(next)!==gameDiff.canonical(prev)))return old;
 fs.mkdirSync(dir(root),{recursive:true});const f=path.join(dir(root),key+'.json'),tmp=f+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(v));fs.renameSync(tmp,f);return v;}
async function refresh(root,key,{fetcher=globalThis.fetch,now=Date.now(),force=false,prints=null}={}){if(!gameDiff.KEY.test(String(key||''))||!fetcher)return null;
 const old=cached(root,key);if(!force&&old&&now-(old.fetchedAt||0)<(old.none?NONE_MS:FRESH_MS))return old;
 for(const url of endpoints(root,'/api/game-profile'+query(key,prints,old))){try{const r=await fetcher(url,{headers:{'user-agent':'MeguLit',accept:'application/json'},signal:AbortSignal.timeout(TIMEOUT)});
   if(r.status===304&&old&&!old.none){const v={...old,fetchedAt:now};return keep(root,key,v);}
   if(r.status===404){const v={none:true,key,fetchedAt:now};return keep(root,key,v);}
   if(!r.ok)continue;const text=await r.text();if(text.length>64*1024)continue;const v=JSON.parse(text);if(Object.keys(v).some(k=>k.startsWith('torch'))||!layer(v,key))continue;v.fetchedAt=now;return keep(root,key,v);}catch{}}
 return old;}
/* 2026-11-21 this PC's calibration of the exe reached the relay: data/The Seed/<key>.sent.json (the game page's first-player card turns into its thank-you) */
const sentFile=(root,key)=>path.join(dir(root),key+'.sent.json');
/* the marker keeps this PC's credit for the diff: {torchNo, name|null, at} as the relay answered, plus localName/synced when a name could not reach the
   relay yet (an older relay without the credit routes): the card shows it and the next ask retries */
function readSent(root,key){if(!gameDiff.KEY.test(String(key||'')))return null;try{const v=JSON.parse(fs.readFileSync(sentFile(root,key),'utf8'));return v&&typeof v==='object'?v:null;}catch{return null;}}
function writeSent(root,key,v){try{fs.mkdirSync(dir(root),{recursive:true});const f=sentFile(root,key),tmp=f+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(v));fs.renameSync(tmp,f);}catch{}}
function markSent(root,key,credit=null){const old=readSent(root,key)||{};writeSent(root,key,{...old,key,at:old.at||new Date().toISOString(),...(credit?{credit}:{})});}
function sent(root,key){return gameDiff.KEY.test(String(key||''))&&fs.existsSync(sentFile(root,key));}
/* a credit name: plain text, at most 20 characters, no control characters; empty = none (anonymous) */
const CREDIT_MAX=30;
const BAD_CP=c=>c<32||c===127||c===0x2028||c===0x2029||(c>=0x202a&&c<=0x202e)||(c>=0x2066&&c<=0x2069);
function cleanName(v){if(typeof v!=='string')return null;const t=[...v].map(ch=>BAD_CP(ch.codePointAt(0))?' ':ch).join('').replace(/\s+/g,' ').trim();const c=[...t].slice(0,CREDIT_MAX).join('').trim();return c||null;}
/* what the relay says about a credit: {torchNo, name|null, at} or null */
function cleanCredit(c){if(!c||typeof c!=='object')return null;const n=Number(c.torchNo);if(!Number.isInteger(n)||n<1)return null;const at=typeof c.at==='string'||Number.isFinite(c.at)?c.at:'';return {torchNo:n,name:cleanName(c.name),at};}
/* this PC's credit of the diff it sent: the relay's last answer, or the local one still waiting for the relay */
function creditOf(root,key){const m=readSent(root,key);if(!m)return null;const c=cleanCredit(m.credit)||(m.torchNo?cleanCredit(m):null);
 if(m.localName!==undefined)return {torchNo:c?.torchNo||0,name:cleanName(m.localName),at:c?.at||m.at||'',synced:false};return c?{...c,synced:true}:{torchNo:0,name:null,at:m.at||'',synced:true};}
/* PUT /api/game-profile/credit {key, name|null}: change or withdraw the credit. -> {state:'saved'|'local'|'failed', credit}.
   An old relay (no such route: 404 / 405) or no network keeps the name here (state 'local') and tries again at the next ask. */
async function setCredit(root,key,name,{fetcher=globalThis.fetch}={}){if(!gameDiff.KEY.test(String(key||''))||!sent(root,key))return {state:'failed',credit:null};const want=cleanName(name);
 if(!fetcher)return keepLocal(root,key,want);let refused=false;
 for(const url of endpoints(root,'/api/game-profile/credit')){try{const r=await fetcher(url,{method:'PUT',headers:{'content-type':'application/json','user-agent':'MeguLit'},body:JSON.stringify({key,name:want}),signal:AbortSignal.timeout(TIMEOUT)});
   if(r.ok){let j=null;try{j=await r.json();}catch{}const c=cleanCredit(j&&(j.credit||j))||cleanCredit({...(readSent(root,key)?.credit||{}),name:want,torchNo:Number(readSent(root,key)?.credit?.torchNo)||0});
    const old=readSent(root,key)||{};delete old.localName;writeSent(root,key,{...old,key,credit:c||{...(old.credit||{}),name:want}});return {state:'saved',credit:creditOf(root,key)};}
   if(r.status>=400&&r.status<500&&r.status!==404&&r.status!==405&&r.status!==429)refused=true;}catch{}}
 return refused?{state:'failed',credit:creditOf(root,key)}:keepLocal(root,key,want);}
function keepLocal(root,key,want){const old=readSent(root,key)||{};writeSent(root,key,{...old,key,localName:want});return {state:'local',credit:creditOf(root,key)};}
/* send a name that was kept here (the relay had no credit route then) */
async function syncCredit(root,key,opts){const m=readSent(root,key);if(!m||m.localName===undefined)return null;return setCredit(root,key,m.localName,opts);}
async function report(root,record,{fetcher=globalThis.fetch,prints=null,credit:creditName=null}={}){const credit=cleanName(creditName);if(!record||!sharing(root))return {state:'skipped'};const block=auto.diagnostic(record)?.profile;if(!block||!gameDiff.KEY.test(String(block.key||'')))return {state:'skipped'};
 /* Cardinal's score of this exe goes with the calibration when it has not reached the relay yet */
 pendingScore(root,block.key,fetcher);
 const pr=prints?require('../core/game-print.cjs').check(prints):null;const body=JSON.stringify({version:1,profile:block,...(credit?{credit:{name:credit}}:{}),...(pr&&Object.keys(pr).length?{prints:pr}:{})});
 for(const url of endpoints(root,'/api/game-profile/report')){try{const r=await fetcher(url,{method:'POST',headers:{'content-type':'application/json','user-agent':'MeguLit'},body,signal:AbortSignal.timeout(TIMEOUT)});if(r.ok){let j=null;try{j=await r.clone().json();}catch{}const c=cleanCredit(j&&(j.credit||j));markSent(root,block.key,c);return {state:'sent',...(c?{credit:c}:{})};}if(r.status>=400&&r.status<500&&r.status!==429)return {state:'refused',status:r.status};}catch{}}
 return {state:'failed'};}
/* 2026-11-21 Cardinal (services/cardinal.cjs): POST /api/cardinal/score, the body is the record as core/cardinal/score.cjs record made it
   (schema megulit.cardinal-score, relay/src/cardinal.js checks every field): the exe hash, the seed revision, the app version and
   the scores, no identity. The same switch as the calibration (共享适配 + autoProfileShare) */
const SCORE_FIELDS=['schema','version','key','seedRev','source','app','lines','scores','total','cardinalRev','at'];
async function reportScore(root,record,{fetcher=globalThis.fetch}={}){if(!record||record.schema!=='megulit.cardinal-score'||!gameDiff.KEY.test(String(record.key||''))||!sharing(root)||!fetcher)return {state:'skipped'};
 const body=JSON.stringify(Object.fromEntries(SCORE_FIELDS.map(k=>[k,record[k]])));
 for(const url of endpoints(root,'/api/cardinal/score')){try{const r=await fetcher(url,{method:'POST',headers:{'content-type':'application/json','user-agent':'MeguLit'},body,signal:AbortSignal.timeout(TIMEOUT)});if(r.ok)return {state:'sent'};if(r.status>=400&&r.status<500&&r.status!==429)return {state:'refused',status:r.status};}catch{}}
 return {state:'failed'};}
function pendingScore(root,key,fetcher){let doc=null;try{doc=require('./cardinal.cjs').load(root,key);}catch{}if(doc?.sent||!require('../core/cardinal/upload.cjs').eligible(doc))return;
 reportScore(root,doc.record,{fetcher}).then(r=>{if(r.state!=='sent')return;try{const cur=require('./cardinal.cjs').load(root,key);if(cur?.record?.at===doc.record.at){const f=require('./cardinal.cjs').fileOf(root,key);fs.writeFileSync(f,JSON.stringify({...cur,sent:true,upload:{state:'sent'}},null,1));}}catch{}}).catch(()=>{});}
module.exports={reportScore,sent,markSent,creditOf,setCredit,syncCredit,cleanName,cleanCredit,CREDIT_MAX,cached,refresh,report,layer,verify,keys,_trust,dir,sharing,setSharing,rejected,reject,query};
