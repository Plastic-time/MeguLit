// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{Reader}=require('../services/reader.cjs');
function reader(){const r=Object.create(Reader.prototype),events=[];Object.assign(r,{root:'Z:/unit-no-store',gal:{preferences:{display:'bilingual'},hooks:{trace(){}}},prefs:()=>({provider:'google',learnerLanguage:'zh'}),loadKeys(){},runtime:{emit:(event,message)=>events.push({event,message})}});return {r,events};}
test('Chinese and English replies retain their request-start cache partitions in either completion order',async()=>{
 for(const first of ['bilingual','english'])for(const reverse of [false,true]){
  const {r}=reader(),pending=[];r.gal.preferences.display=first;r.chainTranslate=(text,options)=>new Promise(resolve=>pending.push({text,language:options.learnerLanguage,resolve}));
  const text='これは同じ本文です',old=r.translate({id:1,text});r.gal.preferences.display=first==='english'?'bilingual':'english';const current=r.translate({id:2,text});assert.equal(pending.length,2);
  const answer=job=>job.resolve({text:job.language==='en'?'English answer':'中文回答',source:'mt'});
  answer(pending[reverse?1:0]);await Promise.resolve();answer(pending[reverse?0:1]);await Promise.all([old,current]);
  assert.equal(r.embedCache.get(Reader.normKey(text)),'中文回答');assert.equal(r.embedCache.get('en|'+Reader.normKey(text)),'English answer');assert.equal(r.embedCached(text),r.displayLanguage()==='en'?'English answer':'中文回答');
 }
});
test('a late old-language reply does not create a hit or near hit for the new language',async()=>{
 const {r}=reader();let finish;r.chainTranslate=()=>new Promise(resolve=>finish=resolve);const pending=r.translate({id:1,text:'これは長い本文です'});r.gal.preferences.display='english';r.latest=2;finish({text:'中文回答',source:'mt'});await pending;
 assert.equal(r.embedCached('これは長い本文です'),undefined);assert.equal(r.embedCached('長い本文です'),undefined);r.gal.preferences.display='bilingual';assert.equal(r.embedCached('これは長い本文です'),'中文回答');assert.equal(r.embedCached('長い本文です'),'中文回答');
});
test('actual fallback attempts keep the request target when display changes between providers',async()=>{
 for(const initial of ['zh','en']){
  const {r}=reader(),languages=[];let first;r.gal.preferences.display=initial==='en'?'english':'bilingual';r.translator=()=>({hasKey:()=>false,translate:async(text,options)=>{languages.push(options.learnerLanguage);if(languages.length===1)return await new Promise(resolve=>first=resolve);return initial==='en'?'English fallback':'中文后备';}});
  const run=r.chainTranslate('同じ本文',{provider:'google',learnerLanguage:initial});await Promise.resolve();r.gal.preferences.display=initial==='en'?'bilingual':'english';first('');const result=await run;
  assert.equal(result.text,initial==='en'?'English fallback':'中文后备');assert.ok(languages.length>=2);assert.ok(languages.every(language=>language===initial));
 }
});
test('background retry results write their original target even after a display switch',()=>{
 const {r}=reader();r.gal.preferences.display='bilingual';r.fillTranslation('本文',{text:'English retry',source:'mt'},{options:{learnerLanguage:'en'}});assert.equal(r.embedCached('本文'),undefined);r.gal.preferences.display='english';assert.equal(r.embedCached('本文'),'English retry');
});
