'use strict';
// "译文行用游戏自己画" (user, 2026-11-09): with the per-work switch on, the hook bridge holds a
// dialogue line, MeguLit translates it and the translation is written back so the game draws Chinese in its own box.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {HookNative}=require('../core/hook-native.cjs');

function hook(){const events=[],sent=[];const h=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},m=>events.push(m),()=>{},()=>0);h.trace=()=>{};h.send=m=>sent.push(m);return {h,events,sent};}

test('the switch is a per-work preference that defaults to off',()=>{
 for(const file of ['../core/game-style.js','../web/reader/modules/game-style.js']){const s=require(file);assert.equal(s.clean({}).embedTranslation,false);assert.equal(s.clean({embedTranslation:true}).embedTranslation,true);}
 for(const file of ['../core/game-profile.js','../web/reader/modules/game-profile.js'])assert.ok(require(file).embedKeys.includes('embedTranslation'));
});

test('the bridge is told to translate only while replacement is active and the switch is on',()=>{
 const {h,sent}=hook();h.process={};h.enabled=true;h.preferences={embedTranslation:true};
 h.syncEmbedMode();h.syncEmbedMode();
 assert.deepEqual(sent,[{type:'embedMode',mode:'translate'}],'sent once');
 h.enabled=false;h.syncEmbedMode();assert.deepEqual(sent.at(-1),{type:'embedMode',mode:'hide'});
 h.process=null;h.syncEmbedMode();assert.equal(h.embedModeSent,undefined,'a new bridge process gets the mode again');
});

test('a request reaches the reader, the reply goes back, and only a real translation hides MeguLit\'s own line',()=>{
 const {h,events,sent}=hook();h.process={};h.enabled=true;h.preferences={embedTranslation:true};h.syncEmbedMode();
 h.embedReply(7,'');assert.deepEqual(sent.at(-1),{type:'embedReply',id:7,trans:''});
 assert.ok(!events.some(e=>e.embedTranslating===true),'a timeout/empty answer does not hide the line');
 h.embedReply(8,'你好');assert.deepEqual(sent.at(-1),{type:'embedReply',id:8,trans:'你好'});
 assert.ok(events.some(e=>e.embedTranslating===true));
});

test('the reader translates a held line once and shares it with the page',async()=>{
 const {Reader}=require('../services/reader.cjs'),r=Object.create(Reader.prototype),replies=[];let calls=0;
 Object.assign(r,{root:'Z:/no-root',workPrompt:'',prefs:()=>({provider:'google'}),loadKeys(){},localReady:async()=>{},translator:()=>({translate:async t=>{calls++;return '译:'+t;}}),gal:{hooks:{embedReply:(id,t)=>replies.push([id,t])}}});
 await r.embedTranslate(1,'「おはよう」');await r.embedTranslate(2,'「おはよう」');
 assert.equal(calls,1,'second time from the cache');assert.deepEqual(replies.map(x=>x[0]),[1,2]);assert.ok(replies.every(x=>x[1].includes('おはよう')));
 Object.assign(r,{translator:()=>({translate:async()=>{throw Error('offline');}})});await r.embedTranslate(3,'別の行');
 assert.deepEqual(replies.at(-1),[3,''],'a failure answers empty so the game shows the original');
 const src=fs.readFileSync(path.join(__dirname,'..','services','reader.cjs'),'utf8');
 assert.match(src,/if\(message\.type==='hookEmbedRequest'\)\{this\.embedTranslate\(message\.id,message\.text\);return;\}/);
 assert.match(src,/this\.gal\?\.hooks\?\.embedReply\(id,hide\?'':trans,/);
 assert.match(src,/\{const cached=this\.embedCached\(text\);if\(cached\)return cached;\}/);
});

test('the native bridge holds the line, answers with the translation, and lets the original through on timeout',()=>{
 const cs=fs.readFileSync(path.join(__dirname,'..','native','HookBridge.cs'),'utf8');
 assert.match(cs,/Emit\(new\{type="embedRequest",id=id,text=text\}\)/);
 assert.match(cs,/new Timer\(_=>FinishEmbed\(id,null\),null,3700,Timeout\.Infinite\)/);
 assert.match(cs,/type=="embedReply"/);assert.match(cs,/TranslateMode\?4000u:1000u/);
});

// Chinese-patched game read in Japanese (original-text import): the patch's own line becomes the translation, ready
// before the page asks, with no translation service call (zero-latency bilingual from an existing 汉化).
test('a matched patch line is cached as the translation of its Japanese original',async()=>{
 const {h,events}=hook();h.originalText={resolve:()=>({status:'exact',method:'unique',indices:[3],japanese:'おはよう、春希',captured:'早上好，春希',alreadyJapanese:false})};
 assert.equal(h.originalTextFor('早上好，春希'),'おはよう、春希');
 assert.deepEqual(events.find(e=>e.type==='hookPatchTranslation'),{type:'hookPatchTranslation',japanese:'おはよう、春希',chinese:'早上好，春希'});
 const {Reader}=require('../services/reader.cjs'),r=Object.create(Reader.prototype);let calls=0;
 Object.assign(r,{root:'Z:/no-root',runtime:{},translator:()=>({translate:async()=>{calls++;return 'x';}})});
 r.embedCached('おはよう、春希','早上好，春希');
 assert.equal(r.embedCached('おはよう、 春希'),'早上好，春希','whitespace does not matter');assert.equal(calls,0);
});
