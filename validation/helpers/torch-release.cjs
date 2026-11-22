// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Neutral crypto/clock fixtures, never evidence of actual Cardinal acceptance.
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),{DatabaseSync}=require('node:sqlite');
const diff=require('../../core/game-diff.cjs'),protocol=require('../../core/torch-release.cjs');
function signer(id){const k=crypto.generateKeyPairSync('ed25519');return {public:{id,alg:'ed25519',publicKey:k.publicKey.export({format:'der',type:'spki'}).toString('base64')},sign(v){return {...v,signature:{alg:'ed25519',keyId:id,value:crypto.sign(null,Buffer.from(diff.canonical(diff.unsigned(v))),k.privateKey).toString('base64')}};}};}
function fixture(){const publisher=signer('publisher'),reviewer=signer('reviewer'),keys={profileKeys:[publisher.public],releaseKeys:[publisher.public],reviewKeys:[reviewer.public]},identity={exe:'a'.repeat(64),script:'b'.repeat(64),scriptFile:'data.xp3',engine:'kirikiri'};
 const profile=(rev=1,id=identity)=>publisher.sign(diff.build({key:id.exe,layer:'version',prints:{exe:id.exe,script:id.script},rev,source:'official',mode:'hide',settings:{},engine:id.engine,issuedAt:'2026-11-21T00:00:00.000Z'}));
 async function review(p,old=null,extra={}){return reviewer.sign({schema:'megulit.torch-review',version:1,candidateHash:await protocol.hash(p),baselineHash:old?old.review.candidateHash:null,identity,cardinalRev:protocol.REV,policy:protocol.POLICY,cohort:'c'.repeat(64),lines:30,reporters:3,mean:.94,floor:.9,coverage:1,reliable:true,liveDisplay:true,domAck:true,eligibility:{pairSource:'live-display',pairReliable:true,leakObserved:true,timelineSource:'measured-delivery',timelineReliable:true,choiceReliable:true,unreliable:false,errors:[]},timing:require('./cardinal-timing.cjs').proof(),torchNo:0,storyRules:null,...extra});}
 async function release(p=profile(),old=null,extra={}){const r=await review(p,old,extra.review||{});return publisher.sign({schema:'megulit.torch-release',version:1,key:r.identity.exe,revision:(old?.revision||0)+1,previous:old?await protocol.hash(old):null,preparedAt:'2026-11-21T01:00:00.000Z',action:'promote',reason:old?'higher-reviewed-score':'initial-reviewed',targetHash:null,profile:p,review:r,...extra.release});}
 return {publisher,reviewer,keys,identity,profile,review,release,env:{PROFILE_PUBLIC_KEYS:JSON.stringify(keys.profileKeys),TORCH_RELEASE_PUBLIC_KEYS:JSON.stringify(keys.releaseKeys),CARDINAL_REVIEW_PUBLIC_KEYS:JSON.stringify(keys.reviewKeys),ADAPTER_ADMIN_TOKEN:'test-admin'}};}
function database(){const raw=new DatabaseSync(':memory:');for(const file of ['0025_torch_credits.sql','0027_torch_releases.sql','0028_seed_admin.sql'])raw.exec(fs.readFileSync(path.join(__dirname,'../../relay/migrations',file),'utf8'));
 const stmt=(sql,args=[])=>({
  bind:(...a)=>stmt(sql,a),
  first:async()=>raw.prepare(sql).get(...args)||null,
  all:async()=>({results:raw.prepare(sql).all(...args)}),
  run:async()=>({meta:{changes:Number(raw.prepare(sql).run(...args).changes)}}),
  _run:()=>({meta:{changes:Number(raw.prepare(sql).run(...args).changes)}})
 });
 return {raw,prepare:sql=>stmt(sql),batch:async statements=>{raw.exec('BEGIN IMMEDIATE');try{const out=statements.map(s=>s._run());raw.exec('COMMIT');return out;}catch(e){raw.exec('ROLLBACK');throw e;}}};}
module.exports={fixture,database,signer};
