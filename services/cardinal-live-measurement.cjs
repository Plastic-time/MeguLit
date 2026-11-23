// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const Timing=require('../core/cardinal/timing.cjs');
const NativeHide=require('../core/cardinal/native-hide.cjs');
const Pairs=require('../core/cardinal/display-pairs.cjs');
const Identity=require('./cardinal/identity.cjs');
const path=require('node:path');

class LiveMeasurement {
 constructor(game,profile) {
  this.game=game; this.profile=profile; this.counts={native:0,bound:0,sources:0,episodes:0,acceptedAcks:0,domSamples:0,visibleTranslations:0,pairs:0};
  this.nativeCounts={}; this.steps=[]; this.samples=[]; this.episodes=[]; this.acks=[]; this.seen=new Set();
  this.hide=NativeHide.collector(); this.choices=[]; this.regions=[];
 }
 frame(f){
  const c=this.counts;
  const status=f.kind==='native'?f.m:f.kind==='retiredBridgeStatus'?f.status:null;
  if(status?.type==='hookError' && !this.bridgeDiagnostic)this.bridgeDiagnostic=String(status.hookMessage).slice(0,256);
  if(f.kind==='windowList'){this.targetPresent=f.targetPresent;return;}
  if(f.kind==='page'){if(this.pageId && this.pageId!==f.pageId)throw Error('LIVE_PAGE_CHANGED');this.pageId=f.pageId;return;}
  if(f.kind==='profile'){
   if(path.resolve(f.exe).toLowerCase()===this.game.exe.toLowerCase()) {
    const hash=Identity.hashObject(f.profile);
    if(this.appliedHash && hash!==this.appliedHash && c.sources)throw Error('LIVE_PROFILE_CHANGED');
    this.appliedHash=hash;
   }
   return;
  }
  if(f.kind==='regions'){if(!Array.isArray(f.regions))throw Error('LIVE_REGION_SHAPE');this.regions=f.regions;return;}
  if(f.kind==='gameDialogue' && (!this.game.pluginHash || f.sequence!==c.sources+1 || f.m?.type!=='hookSource'))
   throw Error('LIVE_DIALOGUE_SESSION');
  if(this.game.pluginHash && f.kind==='native' && f.m?.type==='hookSource')throw Error('LIVE_DIALOGUE_MIXED_SOURCE');
  if(f.kind==='native'||f.kind==='gameDialogue'){
   c.native++;
   const m=f.m;
   this.nativeCounts[m.type]=(this.nativeCounts[m.type]||0)+1;
   if(m.type==='bound'){
    if(!c.bound && m.bound===false && !m.gameProcessId && m.gameAttached===false)return;
    if(m.bound!==true || m.gameProcessId!==this.game.pid || String(m.gameStarted)!==this.game.birth || m.gameHwnd!==this.game.hwnd)throw Error('LIVE_BOUND_IDENTITY');
    if(c.bound++)return;
    this.clock=Timing.recorder({sampleMs:this.profile.cardinal.sampleMs});
    this.clock.elapsed();
    this.steps.push({gwb:m});
   }
   if(m.type==='hookSource'){
    c.sources++;
    if(!this.clock || !this.pageId)throw Error('LIVE_SOURCE_BEFORE_BIND');
    if(!m.text || !(m.origin==='live'||(m.origin===undefined && m.hookActive===true && Number.isSafeInteger(m.streamProbe)))||m.recovering||m.hookRecovering)throw Error('LIVE_SOURCE_ORIGIN');
    if(this.current && !this.current.ack)throw Error('LIVE_SOURCE_WITHOUT_DOM_ACK');
    if(c.sources>400)throw Error('LIVE_SOURCE_LIMIT');
    const at=this.clock.elapsed(),step=this.steps.length,line=c.sources;
    if(typeof f.wireNs!=='string'||!/^\d{1,20}$/.test(f.wireNs))throw Error('LIVE_SOURCE_CLOCK');
    const deliveryMs=Number(process.hrtime.bigint()-BigInt(f.wireNs))/1e6;
    const due=at-deliveryMs;
    if(due<0 || deliveryMs<0)throw Error('LIVE_SOURCE_CLOCK');
    this.clock.step(step,due);
    this.steps.push({t:at,line,text:m.text,hb:m});
    this.episodes.push({at,step,line,text:m.text,pid:this.game.pid,birth:this.game.birth});
    this.current={line,key:Pairs.key(m.text)};
   } else if(m.type==='hookChars')this.hide.report(m.line,this.lastDom?.hookHide===true);
   else if(m.type==='choiceLocate' || m.type==='hookChoices')this.choiceNative=true;
   return;
  }
  if(f.kind==='choices' && this.clock){
   const items=Array.isArray(f.choices)?f.choices:f.choices?.items||[];
   const texts=items.map(x=>String(x?.text??x));
   if(JSON.stringify(texts)!==this.choiceKey){
    const at=this.clock.elapsed();
    if(this.choices.length && this.choices.at(-1).until==null)this.choices.at(-1).until=at;
    if(texts.length)this.choices.push({at,n:texts.length,texts,until:null});
    this.choiceKey=JSON.stringify(texts);
   }
  }
  if(f.kind==='episode'){
   c.episodes++;
   if(this.current && this.current.key===f.descriptor?.sourceKey){
    if(this.current.id && this.current.id!==f.descriptor.episode)throw Error('LIVE_EPISODE_CHANGED');
    Object.assign(this.current,{id:f.descriptor.episode,scope:f.descriptor.scope,sequence:f.sequence});
   }
  }
  if(f.kind==='pairPolicy'){
   const x=this.current,d=f.descriptor;
   if(x?.id && d?.episode===x.id && d.sourceKey===x.key && f.sequence===x.sequence && d.scope!==x.scope){
    x.scope=d.scope;
    delete x.accepted;
   }
   return;
  }
  if(f.kind==='ack'){
   c.acceptedAcks++;
   const a=f.message,x=this.current;
   if(x && x.id===a.episode && x.scope===a.scope && Number.isSafeInteger(x.sequence) && x.sequence===f.sequence && x.key===a.sourceKey &&
      a.observed===true && a.paired===true && a.enabled===true && a.visible===true && Pairs.normalize(a.translation))
    x.accepted={...a};
  }
  if(f.kind==='dom'){
   c.domSamples++;
   const {sample,pid,birth,translation}=f.dom;
   if(translation)c.visibleTranslations++;
   if(!this.clock)return;
   if(!sample || f.pageId!==this.pageId || this.samples.length>=12000)throw Error('LIVE_DOM_SAMPLE');
   const at=this.clock.sample(true);
   this.samples.push({...sample,at,mark:'tick',watch:true,hitRegions:this.regions});
   this.lastDom=sample;
   if(!translation)return;
   const x=this.current;
   if(!x || !x.accepted || x.ack || pid!==String(this.game.pid) || birth!==this.game.birth ||
      Pairs.key(sample.hookSource)!==x.key || Pairs.normalize(translation)!==Pairs.normalize(x.accepted.translation) ||
      !sample.cn?.some(row=>row.rect?.w>0 && row.rect?.h>0 && Pairs.normalize(row.text)===Pairs.normalize(translation)))return;
   if(this.seen.has(x.id))throw Error('LIVE_EPISODE_REUSED');
   this.seen.add(x.id);x.ack={...x.accepted,line:x.line,at,translation};this.acks.push(x.ack);c.pairs++;
  }
 }
 finish(){
  if(!this.clock || !this.counts.bound)throw Error('LIVE_BOUND_MISSING');
  if(this.steps.length<31)throw Error('LIVE_SOURCE_COUNT');
  if(this.appliedHash!==Identity.hashObject(this.profile))throw Error('LIVE_EFFECTIVE_PROFILE');
  if(this.acks.length!==this.episodes.length)throw Error('LIVE_DOM_ACK_COUNT');
  if(this.choiceNative && !this.choices.length)throw Error('LIVE_CHOICE_UNOBSERVED');
  const timing=this.clock.finish();
  const o={models:false,errors:[],t0:timing.wallOrigin,timing,
   lag:Timing.statistics(timing.steps,timing.probes,timing.sampleMs).lag,
   sourceEpisodes:this.episodes,samples:this.samples,hidden:this.hide.snapshot(),choiceOffers:this.choices};
  return {readerTargetId:this.pageId,appliedProfileHash:this.appliedHash,domAcks:this.acks,run:{name:'native-live',steps:this.steps,o}};
 }
}
module.exports={LiveMeasurement};
