// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-19 user rule + test run (素晴らしき日々, 11:10-11:19Z, 56 lines: 44 with the group's translation, 12 without):
   a line the group / official translation does not cover goes to the local model, then a bound API, then machine translation;
   only when all fail does it say so, and a background retry fills it in on screen and in the dialogue log. Shared layer, per
   line, no engine or game name. Also the two causes found in that run that are not the chain:
   - lines read from the game's LOG screen moved the script position 600 lines back, so the story lines after were "repeated";
   - a merged skip text kept its last line but the script translation had been looked up for the whole merged text. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const chain=require('../services/translation-chain.cjs');
const order=list=>list.map(o=>o.provider);

test('the order: local model (when installed or chosen), bound APIs, then machine translation; only what the user set up',()=>{
 assert.deepEqual(order(chain.candidates({provider:'deepseek',model:'deepseek-flash'},{hasKey:()=>false})),['microsoft','google'],'no key, no local model: machine translation only');
 assert.deepEqual(order(chain.candidates({provider:'deepseek',model:'deepseek-flash'},{hasKey:b=>/deepseek/.test(b),localInstalled:true})),['sakura','deepseek','microsoft','google']);
 assert.deepEqual(order(chain.candidates({provider:'ollama'},{})),['ollama','microsoft','google'],'a chosen local engine first');
 const keyed=order(chain.candidates({provider:'google'},{hasKey:b=>/openai|moonshot/.test(b)}));assert.ok(keyed.indexOf('gpt')>=0&&keyed.indexOf('gpt')<keyed.indexOf('google'),'another bound API comes before machine translation: '+keyed);
 assert.ok(!order(chain.candidates({provider:'deepseek'},{hasKey:()=>false})).includes('sakura'),'no local model is started when none is installed');
});

test('each failure goes on to the next source; all failing throws with the reasons',async()=>{
 const list=chain.candidates({provider:'deepseek',model:'deepseek-flash'},{hasKey:b=>/deepseek/.test(b),localInstalled:true});
 const fail=new Set(),tried=[],attempt=async o=>{tried.push(o.provider);if(fail.has(o.provider))throw Error(o.provider+' down');return o.provider+' 译文';};
 let r=await chain.translate('「う゛ぃじゅある系だ！」',list,attempt);assert.equal(r.source,'local');assert.equal(r.text,'sakura 译文');
 fail.add('sakura');r=await chain.translate('x',list,attempt);assert.equal(r.provider,'deepseek');assert.equal(r.source,'api');
 fail.add('deepseek');r=await chain.translate('x',list,attempt);assert.equal(r.provider,'microsoft');assert.equal(r.source,'mt');
 fail.add('microsoft');fail.add('google');await assert.rejects(chain.translate('x',list,attempt),e=>e.message==='TRANSLATION_UNAVAILABLE'&&e.errors.length===list.length);
 let current=true;tried.length=0;await assert.rejects(chain.translate('x',list,async o=>{tried.push(o.provider);current=false;throw Error('no');},{isCurrent:()=>current}));assert.deepEqual(tried,['sakura'],'a line already gone stops trying (the retry takes over)');
});

test('the background retry fills a line in once a source answers, then forgets it',async()=>{
 const queue=[],timers={set:(f,ms)=>{queue.push({f,ms});return queue.length;},clear(){}};let up=false;const filled=[];
 const R=new chain.Retries(async t=>up?{text:'译:'+t,source:'mt'}:null,(t,r,c)=>filled.push([t,r.text,c.gameId]),{timers});
 R.add('「はぁ……言い直さなくても……分かりますけど……」',{gameId:'g'});R.add('「はぁ……言い直さなくても……分かりますけど……」',{gameId:'g'});assert.equal(R.size,1,'one job per line');
 await queue.shift().f();assert.equal(filled.length,0);assert.equal(queue[0].ms,20000,'5 s, then 20 s');
 up=true;await queue.shift().f();assert.deepEqual(filled,[['「はぁ……言い直さなくても……分かりますけど……」','译:「はぁ……言い直さなくても……分かりますけど……」','g']]);assert.equal(R.size,0);
 const q2=[],R2=new chain.Retries(async()=>null,()=>assert.fail('never'),{delays:[1,1],timers:{set:f=>{q2.push(f);},clear(){}}});R2.add('x');await q2.shift()();await q2.shift()();assert.equal(R2.size,0,'gives up after its last try');
});

test('reader.translate: script translation first, else the chain; a total failure is retried and filled in on screen and in the log',async()=>{
 const {Reader}=require('../services/reader.cjs');const r=Object.create(Reader.prototype),events=[],stats=[];
 const cache=new Map();r.embedCached=(t,v)=>{if(v===undefined)return cache.get(t);cache.set(t,v);return v;};r.displayLanguage=()=>'zh';r.prefs=()=>({provider:'deepseek',model:'deepseek-flash'});r.workPrompt='';r.langOptions=o=>o;r.loadKeys=()=>{};r.latest=0;r.pageScope='';r.gameId='game-1';
 r.stats={translation:(g,t,v)=>stats.push([g,t,v])};r.runtime={emit:(n,e)=>events.push(e),local:()=>({status:()=>({installed:false})}),models:()=>({status:()=>({models:[]})})};
 let script='',mt=null;r.gal={hooks:{scriptTranslation:()=>script}};r.translator=()=>({hasKey:()=>false,translate:async(t,o)=>{if(mt===null)throw Error(o.provider+' down');return mt;}});r.localReady=async()=>{};
 script='「呼……」';assert.equal(await r.translate({id:1,text:'「ふぅ……」'}),'「呼……」','the group translation');
 script='';mt='本作品登场的角色均已年满18岁。';assert.equal(await r.translate({id:2,text:'本作品に登場するキャラクターは全て18歳以上です。'}),mt,'not in the script: machine translation');
 assert.equal(stats.at(-1)[2],mt);
 mt=null;const queue=[];r.retryQueue=new (require('../services/translation-chain.cjs').Retries)((t,c)=>r.chainTranslate(t,c.options),(t,res,c)=>r.fillTranslation(t,res,c),{timers:{set:f=>{queue.push(f);},clear(){}}});
 await assert.rejects(r.translate({id:3,text:'私(あるいはこれを読むあなた)は世界に属さない。'}),/TRANSLATION_UNAVAILABLE/);assert.equal(queue.length,1,'retried in the background');
 mt='我（或者阅读这些的你）不属于世界。';await queue.shift()();
 const fill=events.find(e=>e.method==='deliverBackfill');assert.deepEqual(fill.args.slice(0,2),['私(あるいはこれを読むあなた)は世界に属さない。',mt],'filled in on screen');
 assert.deepEqual(stats.at(-1),['game-1','私(あるいはこれを読むあなた)は世界に属さない。',mt],'and in the dialogue log (as a machine translation)');
 assert.equal(cache.get('私(あるいはこれを読むあなた)は世界に属さない。'),mt);
 assert.match(fs.readFileSync(path.join(__dirname,'../web/reader/modules/inject.js'),'utf8'),/bridge\.deliverBackfill = \(source, text(?:, kind = '')?\) => \{/);
});

test('a LOG line far back does not cost the story lines after it their translation (the scene is twice in the script)',()=>{
 const {Matcher}=require('../services/original-text.cjs');
 const scene=['「な、なにが？」','yuki_001326','由岐','「う゛ぃじゅある系だ！」','zk2006a','ざくろ','「はぁ……言い直さなくても……分かりますけど……」'];
 const ja=['たとえば……。','x1','x2'].concat(Array(700).fill(0).map((_,i)=>'　地の文'+i+'。'),scene,Array(50).fill(0).map((_,i)=>'　後'+i+'。'),scene);
 const zh=ja.map(t=>'译'+t);const m=new Matcher(ja,zh);
 assert.equal(m.match('　地の文699。').status,'exact');assert.equal(m.match(scene[0]).method,'position');
 assert.equal(m.match('たとえば……。').indices[0],0,'a LOG line far back');
 const r=m.match(scene[3]);assert.equal(r.status,'high');assert.equal(r.method,'recent');assert.equal(r.indices[0],706,'the story line after the one read before the LOG');
 assert.equal(m.match(scene[6]).indices[0],709);
});

test('a merged skip text: the line kept is looked up itself',()=>{
 assert.match(fs.readFileSync(path.join(__dirname,'../core/hook-native.cjs'),'utf8'),/text=last;\/\*[^*]*\*\/try\{this\.originalTextFor\(text\);\}catch\{\}\}\}/);
});

test('old single-engine paths are gone: art text, art rows and the line written into the game use the chain; no in-place switch to Microsoft',()=>{
 const reader=fs.readFileSync(path.join(__dirname,'../services/reader.cjs'),'utf8');
 assert.doesNotMatch(reader,/localReady\(options,null,/,'no single-engine translation left');
 assert.doesNotMatch(reader,/Object\.assign\(options,\{provider:'microsoft'\}\)/,'E406 in-place switch deleted');
 assert.equal((reader.match(/this\.chainTranslate\(/g)||[]).length>=5,true,'reader.translate, retries, art text, art rows, embed');
 assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../web/reader/modules/inject.js'),'utf8'),/LOCAL_MODEL_MISSING/,'the unreachable message is deleted');
 assert.match(fs.readFileSync(path.join(__dirname,'../core/hook-native.cjs'),'utf8'),/if\(r&&\(r\.status==='exact'\|\|r\.status==='high'\)\)this\.sourceCache\.set\(key,\{provider,r\}\);/,'only a confident script match is cached');
});
