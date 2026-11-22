// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {streamDigest}=require('./shared-adaptation.cjs');
const limit=5;
function context(reader) {
 const live=require('./self-check-live.cjs').current(),gal=reader.gal;
 if(!live?.shared?.exact||!['official','shared'].includes(live.from)||live.reader!==reader||!reader.active()||
    live.exe!==reader.gameExe||live.pid!==reader.gamePid||live.birth!==String(reader.gameBirth)||
    !gal.state.bound||Number(gal.state.gameProcessId)!==live.pid||String(gal.state.gameStarted)!==live.birth||
    gal.controller?.styleCalibration||gal.hooks?.calibrating)return null;
 const thread=gal.hooks?.state?.hookThreads?.find(t=>t.selected);
 const parts=/^[a-f0-9]+:([a-f0-9]+):([a-f0-9]+)$/i.exec(thread?.id);
 const stream=streamDigest(parts?{code:thread.code,ctx:parts[1],ctx2:parts[2]}:thread);
 if(!thread?.id||!stream||!live.ver||!live.key)return null;
 return {live,scope:JSON.stringify([live.shared.stamp,thread.id,stream,gal.hooks.serial]),stream,streamId:thread.id};
}
function report(reader,line) {
 reader.logVisibility({type:'layoutDiagnostic',kind:'torchLocalTrial',...line.record,results:{...line.results}});
}
function source(reader,message,descriptor) {
 const ctx=context(reader);
 if(!ctx||!descriptor||!Number.isSafeInteger(message.hookSequence)||!message.hookActive||!message.processAttached||message.hookRecovering||message.recovering||
    ['ocr','history'].includes(message.origin)||['ocr','history'].includes(message.hookSourceOrigin)){invalidate(reader);return;}
 const {live,stream,scope,streamId}=ctx;
 if(live.trialProfile!==reader.gal.profile||live.trialLayer!==live.shared){
  live.trialProfile=reader.gal.profile;live.trialLayer=live.shared;
  const doc=require('./seed-usage.cjs').localDocuments(reader).find(row=>row.slot==='version');
  live.trialSeed=doc?require('node:crypto').createHash('sha256').update(require('../core/game-diff.cjs').canonical(doc.document)).digest('hex'):null;
  live.torchSample=null;
 }
 if(!live.trialSeed)return;
 let sample=live.torchSample;
 if(sample?.scope!==scope)sample=live.torchSample={scope,count:0};
 if(sample.last===descriptor.episode)return;
 sample.last=descriptor.episode;
 sample.line=null;
 if(sample.count>=limit)return;
 const record={seedHash:live.trialSeed,exe:live.key,pid:live.pid,birth:live.birth,reader:live.ver,stream,streamId,revision:live.shared.version?.rev,
  episode:descriptor.episode,textHash:descriptor.sourceKey,sequence:message.hookSequence,
  ...(Number.isSafeInteger(message.hookSourceIndex)&&message.hookSourceIndex>=0?{scene:message.hookSourceIndex}:{}),index:++sample.count};
 sample.line={record,results:{read:'unknown',hide:'unknown',replace:'unknown',pointRead:'unknown'}};
 report(reader,sample.line);
}
function invalidate(reader){
 const live=require('./self-check-live.cjs').current();
 if(live?.reader===reader&&live.torchSample)live.torchSample.line=null;
}
function feedback(reader,message) {
 const ctx=context(reader),sample=ctx?.live.torchSample,line=sample?.line;
 if(!line||ctx.live.trialProfile!==reader.gal.profile||ctx.live.trialLayer!==ctx.live.shared||ctx.scope!==sample.scope){invalidate(reader);return;}
 const results={...line.results};
 if(message.type==='cardinalPair'&&message.episode===line.record.episode&&message.sourceKey===line.record.textHash&&message.observed){
  results.read='passed';
  if(message.paired)results.replace='passed';
  line.displayScope=message.scope;
 }else if(message.type==='lookupViewed'&&line.displayScope&&message.scope===line.displayScope&&message.episode===line.record.episode&&message.sourceKey===line.record.textHash){
  results.pointRead='passed';
 }else if(message.type==='hookCheck'){
  if(message.hookCheckState==='checking')line.checkSequence=reader.gal.controller.seq;
  if(line.checkSequence===undefined||line.checkSequence!==reader.gal.controller.seq)return;
  if(message.hookCheckState==='visible')results.hide='failed';
  if(message.hookCheckState==='verified'&&message.hookVisualVerified===true)results.hide='passed';
 }
 if(Object.keys(results).some(k=>results[k]!==line.results[k])){line.results=results;report(reader,line);}
}
module.exports={source,feedback,invalidate};
