// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Reader}=require('../services/reader.cjs');
const {HookNative}=require('../core/hook-native.cjs');
const sentence='この町は好きですか。',chinese='你喜欢这个小镇吗？';
function fixture(t,{enabled=true,target='zh',installed=true}={}){
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'reader-priority-'));
 t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
 fs.writeFileSync(path.join(folder,'preferences.json'),JSON.stringify({provider:'google',learnerLanguage:target,scriptTranslation:enabled}));
 const events=[],calls=[],state={hit:{status:'none'},fail:new Set()};
 const reader=new Reader({root:folder,folder,libraryOnly:()=>false,emit:(_,e)=>events.push(e),
  local:()=>({status:()=>({installed})}),models:()=>({status:()=>({models:[{installed}]})})});
 const hooks=Object.create(HookNative.prototype);
 hooks.originalText={kind:'patch',resolve:()=>state.hit,resolveChoice:()=>state.hit};
 hooks.scriptAllowed=()=>enabled;
 hooks.embedReply=(_,text)=>events.push({embed:text});
 hooks.drawEmbedReply=(_,value)=>events.push(value);
 reader.gal={hooks};
 reader.localReady=async()=>{};
 reader.translator=()=>({hasKey:base=>base.includes('deepseek'),async translate(text,options){
  calls.push(options.provider);
  if(state.fail.has(options.provider))throw Error('offline');
  if(state.delay)await state.delay();
  return '引擎译文';
 }});
 return {reader,hooks,state,events,calls};
}
test('reader entries return verified script without invoking any translator',async t=>{
 const {reader:r,state,events,calls}=fixture(t);
 state.hit={status:'exact',indices:[2],translation:chinese};
 r.embedCached(sentence,'旧机翻',{source:'machine'});
 const body=await r.message({id:1,text:sentence});
 assert.equal(body.replies[0].args[1],chinese);
 r.pageScope='page';
 assert.equal((await r.message({id:2,pageKey:'page',text:sentence})).replies[0].args[1],chinese);
 const choice=await r.message({type:'choiceTranslations',request:3,items:[sentence]});
 assert.deepEqual(choice.replies[0].args[1].rows,[{text:chinese,source:'patch'}]);
 assert.deepEqual(await r.artRows([sentence]),[chinese]);
 await r.artText({id:4,text:sentence,visible:true,source:'engine'});
 assert.equal(events.at(-1).translation,chinese);
 await r.embedTranslate(5,sentence);assert.equal(events.at(-1).embed,chinese);
 await r.drawEmbed({key:'draw',text:sentence});assert.equal(events.at(-1).zh,chinese);
 await r.message({type:'translateGuard',text:sentence});assert.equal(events.at(-1).args[1],chinese);
 const job=r.translationRetries(),timers=[];
 job.timers={set:f=>{timers.push(f);},clear(){}};
 job.add(sentence,{gameId:r.gameId,options:r.requestOptions()});
 await timers.shift()();assert.equal(events.at(-1).args[2],'patch');
 assert.deepEqual(calls,[]);
});
test('a synthetic index slot or cache never satisfies strict requests, and stages stop on first success',async t=>{
 const {reader:r,hooks,state,calls}=fixture(t);
 r.embedCached(sentence,'旧机翻',{source:'mt',provider:'google'});
 state.hit={status:'exact',indices:[0],translation:'预填',filled:true};
 assert.equal((await r.message({id:1,text:sentence})).replies[0].args[4].source,'api');
 assert.deepEqual(calls.splice(0),['deepseek']);
 state.fail.add('deepseek');state.hit={...state.hit,machine:true};
 const choice=await r.message({type:'choiceTranslations',request:2,items:[sentence]});
 assert.equal(choice.replies[0].args[1].rows[0].source,'local');
 assert.deepEqual(calls.splice(0),['deepseek','sakura']);
 hooks.originalText=null;state.fail.add('sakura');
 assert.deepEqual(await r.artRows([sentence]),['引擎译文']);
 assert.deepEqual(calls.splice(0),['deepseek','sakura','google']);
 state.fail.clear();
 const recovered=await r.message({id:3,text:sentence});
 assert.equal(recovered.replies[0].args[4].source,'api');
 assert.deepEqual(calls,['deepseek']);
});
test('a pending API outlasts the legacy MT timer without another request',async t=>{
 const {reader:r,state,calls}=fixture(t);
 let finish;
 state.delay=()=>new Promise(resolve=>{finish=resolve;});
 const pending=r.message({id:1,text:sentence});
 await new Promise(resolve=>setTimeout(resolve,2600));
 assert.deepEqual(calls,['deepseek']);finish();
 assert.equal((await pending).replies[0].args[4].source,'api');
 assert.deepEqual(calls,['deepseek']);
});
test('disabled mode retains local-first routing and an uninstalled managed model is skipped',async t=>{
 const old=fixture(t,{enabled:false});
 await old.reader.message({id:1,text:sentence});assert.deepEqual(old.calls,['sakura']);
 const zero=fixture(t,{installed:false});zero.state.fail.add('deepseek');
 await zero.reader.message({id:1,text:sentence});assert.deepEqual(zero.calls,['deepseek','google']);
});
test('a configured custom API is tried even when the global selection is machine translation',async t=>{
 const {reader:r,calls}=fixture(t);
 fs.writeFileSync(path.join(r.folder,'translation-profiles.json'),JSON.stringify({gpt:{baseUrl:'https://example.test/v1',model:'custom'}}));
 r.translator=()=>({hasKey:base=>base==='https://example.test/v1',translate:async(text,o)=>{calls.push([o.provider,o.baseUrl,o.model]);return chinese;}});
 await r.message({id:1,text:sentence});
 assert.deepEqual(calls,[['gpt','https://example.test/v1','custom']]);
 assert.equal(r.prefs().provider,'google');
});
test('strict lookup ignores unlabelled, fuzzy and stale-index entries',async t=>{
 const {reader:r,hooks,calls}=fixture(t);
 r.embedCached(sentence,'来源未知');
 await r.message({id:1,text:sentence});
 r.embedCached('「'+sentence+'」と彼が聞いた。',chinese,{source:'patch'});
 await r.message({id:2,text:sentence});
 r.embedCached(sentence,chinese,{source:'patch'});
 hooks.originalText={kind:'patch',resolve:()=>({status:'none'})};
 await r.message({id:3,text:sentence});
 assert.deepEqual(calls,['deepseek','deepseek','deepseek']);
});
