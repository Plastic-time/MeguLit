// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),C=require('../core/cardinal/checks.cjs'),S=require('../core/cardinal/score.cjs'),D=require('../core/profiles/defaults.cjs');
// Controlled synthetic UI/transport fixture only; this is not a healthy live-game baseline.
function synthetic(){const texts=['扉を開ける','庭へ戻る','その場で待つ'];const choices=texts.map((sourceText,i)=>({sourceText,shown:true,rect:{x:100,y:100+i*80,w:300,h:50},pointer:'auto',translationRequired:true,translationShown:true,translation:['打开门','返回庭院','原地等待'][i]}));
 const steps=['これは最初の本文です','これは次の本文です'].map((text,i)=>({line:i+1,text,t:1795253000000+i*2000,hb:{type:'hookSource',text}}));
 const samples=[];for(const [i,st]of steps.entries())for(let at=i*2000;at<=i*2000+1000;at+=100)samples.push({at,hookSource:st.text,body:'',glyphs:[{text:st.text,kind:'line',pointer:'auto',rect:{x:100,y:500,w:350,h:30}}],cn:[{text:'正文译文',rect:{x:100,y:550,w:350,h:30}}],choices:[],hitRegions:[{x:0,y:0,width:1000,height:1000}]});
 for(const at of [1300,1500,1700])samples.push({...structuredClone(samples[0]),at,choices:structuredClone(choices)});samples.sort((a,b)=>a.at-b.at);
 return {name:'synthetic-choice-transport',steps,o:{samples,sourceEpisodes:steps.map((st,step)=>({step,line:st.line,text:st.text,at:step*2000})),choiceOffers:[{at:1200,n:3,texts,until:1900}],hookEvents:[],hbSent:[],hidden:{source:'native-dialogue',modeled:false,lines:2,visible:0}}};}
const altered=mutate=>{const run=synthetic();for(const sample of run.o.samples.filter(s=>s.choices.length))mutate(sample.choices,sample);return run;};
test('all offered options must be present, source-matched, clickable and translated when enabled',()=>{
 const baseline=S.score(synthetic(),D.cardinal);assert.equal(baseline.scores.choice,1);
 for(const mutate of [c=>c.splice(1,1),c=>c.push({...c[0]}),c=>c[1].pointer='none',c=>c[1].rect.x=2000,c=>c[1].rect.h=0,c=>c[1].sourceText='違う選択肢',c=>c[1].translation='',c=>c[1].translationShown=false]){
  const run=altered(mutate),result=S.score(run,D.cardinal);assert.equal(result.scores.choice,0);assert.ok(result.total<baseline.total);assert.equal(C.choices(run).reliable,true,'observed bad UI remains a measured failure');
 }
});
test('a missing translation observation is unobserved rather than proof of successful translation',()=>{
 const run=altered(c=>delete c[1].translationRequired);const result=C.choices(run);assert.equal(result.ok,0);assert.equal(result.unobserved,1);assert.equal(result.reliable,false);
 const hidden=altered(c=>{c[1].translationRequired=false;c[1].translation='';c[1].translationShown=false;});assert.equal(C.choices(hidden).ok,1,'an explicit user translation-off state is respected');
});
test('invalid option counts or mismatched source metadata fail closed',()=>{
 for(const n of [0,-1,1.5,'3',NaN,Infinity,undefined]){const run=synthetic();run.o.choiceOffers[0].n=n;assert.equal(C.choices(run).ok,0);assert.equal(C.choices(run).reliable,false);}
 for(const texts of [['扉を開ける'],['扉を開ける','','その場で待つ']]){const run=synthetic();run.o.choiceOffers[0].texts=texts;assert.equal(C.choices(run).ok,0);assert.equal(C.choices(run).reliable,false);}
});
test('a later choice page cannot satisfy a withdrawn offer',()=>{
 const run=synthetic();run.o.choiceOffers[0].until=1250;assert.equal(C.choices(run).ok,0);
});
test('the existing real faulty session has no choice evidence and keeps a conservative score without legacy cache display proof',()=>{
 const fixture=require('./fixtures/cardinal/fata-live-visibility-20261121.json');const result=S.score(fixture.run,D.cardinal);assert.equal(result.total,0.257);assert.equal(result.applies.choice,false);assert.equal(result.detail.choiceObservation.reliable,true);assert.deepEqual(fixture.run.o.choiceOffers,[]);
});
