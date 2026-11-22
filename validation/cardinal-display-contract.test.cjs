// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{DisplayPairs}=require('../core/cardinal/display-pairs.cjs');
const policy=(pairs,{enabled=true,visible=true,target='zh',revision=1}={})=>pairs.setPolicy({schema:1,client:'unit-client',revision,enabled,visible,target},target);
const ack=(descriptor,{paired=true,observed=true,enabled=true,visible=true,translation='这是正文'}={})=>({...descriptor,type:'cardinalPair',paired,observed,enabled,visible,translation});
test('cache availability never counts as per-occurrence display; repeated source needs a new acknowledgement',()=>{
 const p=new DisplayPairs();policy(p);const first=p.source('これは本文です',{sequence:1});p.availability('これは本文です','这是正文');assert.equal(p.snapshot(60).paired,0);assert.equal(p.snapshot(60).unobserved,1);
 assert.equal(p.observe(ack(first),'zh'),true);const fixed=p.snapshot(60);assert.equal(fixed.paired,1);assert.equal(p.observe(ack(first),'zh'),true);assert.equal(p.snapshot(60).paired,1,'duplicate paint acknowledgement is idempotent');
 const second=p.source('これは本文です',{sequence:2});assert.notEqual(first.episode,second.episode);assert.equal(p.snapshot(1).paired,0);assert.equal(p.observe(ack(first),'zh'),true);assert.equal(p.snapshot(1).paired,0,'old reply cannot pair the new occurrence');assert.equal(p.observe(ack(second),'zh'),true);assert.equal(p.snapshot(60).paired,2);assert.equal(fixed.paired,1,'the earlier snapshot is immutable');
 assert.equal(p.source('これは本文です',{sequence:2}).episode,second.episode,'same-sequence redraw keeps its occurrence');
});
test('disabled translation is excluded and old-scope acknowledgements are refused',()=>{
 const p=new DisplayPairs();policy(p);const first=p.source('これは本文です',{sequence:1});p.availability(first.body,'这是正文');policy(p,{enabled:false,revision:2});assert.equal(p.observe(ack(first),'zh'),false);const off=p.descriptor(p.current);assert.equal(p.observe(ack(off,{enabled:false,paired:false}),'zh'),true);
 const result=p.snapshot(60);assert.equal(result.shown,0);assert.equal(result.paired,0);assert.equal(result.excluded,1);assert.equal(result.reliable,true);
 policy(p,{revision:3});assert.equal(p.observe(ack(off,{enabled:false,paired:false}),'zh'),false);assert.equal(p.snapshot(60).unobserved,1);
});
test('changing target refuses the previous language and keeps observed missing separate from unknown',()=>{
 const p=new DisplayPairs();policy(p);const old=p.source('これは本文です',{sequence:1});p.availability(old.body,'这是正文');const next=policy(p,{target:'en',revision:2}).descriptor;assert.equal(p.observe(ack(old),'en'),false);assert.equal(p.observe(ack(next),'en'),false,'a Chinese cache is not English display evidence');assert.equal(p.snapshot(60).unobserved,1);
 assert.equal(p.observe(ack(next,{paired:false,translation:''}),'en'),true);assert.equal(p.snapshot(60).unpaired,1);assert.equal(p.snapshot(60).reliable,true);p.availability(next.body,'This is text',{target:'en'});assert.equal(p.observe(ack(next,{translation:'This is text'}),'en'),true);assert.equal(p.snapshot(60).paired,1);
});
test('unknown episodes, wrong source, partial or wrong translations and stale policy cannot pair',()=>{
 const p=new DisplayPairs();policy(p);const d=p.source('これは本文です',{sequence:1});p.availability(d.body,'这是正文');
 for(const change of [{episode:'unknown'},{sourceKey:'bad'},{target:'en'},{translation:'这'},{translation:'错文'},{paired:true,observed:false},{paired:true,enabled:false}])assert.equal(p.observe({...ack(d),...change},'zh'),false);
 assert.equal(policy(p,{revision:2}).revision,2);assert.equal(policy(p,{revision:1}),null);assert.equal(p.snapshot(60).paired,0);
});
test('actual Reader transport supplies episode identity and only display messages change pairing',async()=>{
 const {Reader}=require('../services/reader.cjs'),Tape=require('../core/cardinal/tape.cjs');Tape.clear();const r=Object.create(Reader.prototype),emitted=[],logs=[];
 Object.assign(r,{root:'Z:/unit-no-store',runtime:{config:()=>({}),services:()=>({gameEvent:async()=>{}}),emit:(event,message)=>emitted.push({event,message})},gal:{preferences:{display:'bilingual'},send(){},hooks:{trace(){}}},immersion:{currentText:'',source(){}},stats:{line(){}},prefs:()=>({provider:'google',learnerLanguage:'zh'}),logVisibility:value=>logs.push(value)});
 r.event({hookSource:'これは本文です',hookSequence:1});const initial=emitted.at(-1).message.cardinalPair;assert.ok(initial.episode);const response=await r.message({type:'cardinalPairPolicy',schema:1,client:'actual-reader-unit',revision:1,enabled:true,visible:true,target:'zh'});const d=response.replies[0].args[0].descriptor;r.embedCached(d.body,'这是正文',{language:''});assert.equal(Tape.pairing(60).paired,0);
 await r.message(ack(d));assert.equal(Tape.pairing(60).paired,1);assert.equal(logs.at(-1).accepted,true);r.event({hookSource:d.body,hookSequence:2});assert.equal(Tape.pairing(1).paired,0);assert.equal(Tape.pairing(1).unobserved,1);Tape.clear();
});


test('all explicitly excluded occurrences make pair inapplicable rather than a perfect score',()=>{
 const p=new DisplayPairs();policy(p,{enabled:false});const d=p.source('これは本文です',{sequence:1});p.observe(ack(d,{enabled:false,paired:false,translation:''}),'zh');const result=require('../core/cardinal/score.cjs').score({steps:[],o:{samples:[],sourceEpisodes:[]},livePairing:p.snapshot(60)},require('../core/profiles/defaults.cjs').cardinal);assert.equal(result.applies.pair,false);assert.equal(result.scores.pair,0);assert.equal(result.detail.pairObservation.reliable,true);
});
