// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const usage=require('../services/seed-usage.cjs'),feed=require('../services/auto-profile-feed.cjs'),live=require('../services/self-check-live.cjs'),Profiles=require('../core/profiles/index.cjs'),diff=require('../core/game-diff.cjs'),R=require('../services/torch-receive.cjs'),P=require('../core/torch-release.cjs'),{fixture}=require('./helpers/torch-release.cjs');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const ack=event=>Response.json({ok:true,accepted:true,eventId:event.eventId,duplicate:false});
function setup(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgl-seed-usage-')),f=fixture(),oldEnv={...process.env},oldCurrent=live.current;
 process.env.MEGULIT_RELAY_BASE='https://usage.test';delete process.env.MEGULIT_CARDINAL_REPLAY;delete process.env.MEGULIT_OWNER_TESTS;delete process.env.MEGULIT_SIDE_BY_SIDE;
 feed._trust(f.keys.profileKeys);const exe=path.join(root,'neutral-game.exe');fs.writeFileSync(exe,'MZ inert fixture');
 const document=f.publisher.sign({...f.profile(),settings:{placement:{lineOffsetY:77}}});
 const s={root,exe,pid:321,birth:'123456789',key:f.identity.exe,input:{exe,engine:'kirikiri'},profile:{seedStatus:'skeleton'},stored:null,prints:{exe:f.identity.exe,script:f.identity.script},from:'official'};
 const reader={root,gameExe:exe,gamePid:321,gameBirth:'123456789',active:()=>true,gal:{state:{bound:true,gameProcessId:321,gameStarted:'123456789'}}};s.reader=reader;live.current=()=>s;
 const adopt=(doc=document,answer={schema:'megulit.game-diff-feed',version:1,key:s.key,diff:doc})=>{s.shared=feed.layer(answer,s.key);reader.gal.profile=Profiles.profileFor(live.inputOf(s));return s.shared;};adopt();
 t.after(()=>{live.current=oldCurrent;feed._trust(null);for(const k of Object.keys(process.env))if(!(k in oldEnv))delete process.env[k];Object.assign(process.env,oldEnv);fs.rmSync(root,{recursive:true,force:true});});
 const sent=[],fetcher=async(url,options)=>{assert.equal(url,'https://usage.test/api/seed/usage');const event=JSON.parse(options.body);sent.push(event);return ack(event);};
 return {...f,root,exe,document,s,reader,adopt,sent,fetcher};
}
test('verified signed exact profile creates one minimal adoption event, not a download receipt',async t=>{
 const f=setup(t);assert.equal(fs.existsSync(usage.fileOf(f.root)),false);assert.deepEqual(f.sent,[]);
 assert.equal((await usage.observe(f.reader,undefined,{fetcher:f.fetcher,now:100000})).state,'recorded');
 assert.equal(f.sent.length,1);const e=f.sent[0];assert.equal(usage.validEvent(e),true);assert.equal(e.seedHash,sha(diff.canonical(f.document)));assert.equal(e.exeSha256,f.identity.exe);assert.equal(e.seedKey,f.document.key);assert.equal(e.layer,'version');assert.equal(e.revision,1);
 assert.deepEqual(Object.keys(e).sort(),['schema','version','eventId','exeSha256','seedHash','layer','seedKey','revision','engine','at'].sort());assert.equal(JSON.stringify(e).includes(f.exe),false);assert.equal(usage.read(f.root).entries[0].stage,'sent');
 await usage.observe(f.reader,undefined,{fetcher:f.fetcher,now:150000});assert.equal(f.sent.length,1);
 f.s.birth=f.reader.gameBirth=f.reader.gal.state.gameStarted='123456790';await usage.observe(f.reader,undefined,{fetcher:f.fetcher,now:200000});assert.equal(f.sent.length,2);assert.notEqual(f.sent[0].eventId,f.sent[1].eventId);
});
test('unsigned, clone, tampered layer, weak candidate, gate, builtin replacement and mismatched profile cannot count',async t=>{
 const f=setup(t),attempt=async()=>{await usage.observe(f.reader,undefined,{fetcher:f.fetcher,now:100000});assert.equal(f.sent.length,0);assert.equal(fs.existsSync(usage.fileOf(f.root)),false);};
 f.adopt(diff.unsigned(f.document));await attempt();
 f.adopt();f.s.shared=structuredClone(f.s.shared);f.reader.gal.profile=Profiles.profileFor(live.inputOf(f.s));await attempt();
 f.adopt();f.s.shared.settings.placement.lineOffsetY=88;f.reader.gal.profile=Profiles.profileFor(live.inputOf(f.s));await attempt();
 f.adopt(f.document,{schema:'megulit.game-diff-feed',version:2,key:f.s.key,versionLayer:{match:'head',diff:f.document}});await attempt();
 f.adopt();f.s.stored={source:'gate',settings:{hide:{textEffectsRead:true}}};f.reader.gal.profile=Profiles.profileFor(live.inputOf(f.s));await attempt();f.s.stored=null;
 f.adopt();f.reader.gal.profile={...f.reader.gal.profile,layers:'core+engine+seed'};await attempt();
 f.adopt();f.reader.gal.profile={...f.reader.gal.profile,placement:{...f.reader.gal.profile.placement,lineOffsetY:99}};await attempt();
 f.adopt();f.s.from='seed';await attempt();
});
test('signature trust must still be valid at adoption',async t=>{const f=setup(t);feed._trust([]);await usage.observe(f.reader,undefined,{fetcher:f.fetcher,now:100000});assert.equal(f.sent.length,0);});
test('new process binding cannot reuse the old live session while executable resolution is pending',async t=>{const f=setup(t);f.reader.gamePid=f.reader.gal.state.gameProcessId=654;f.reader.gameBirth=f.reader.gal.state.gameStarted='999';await usage.observe(f.reader,undefined,{fetcher:f.fetcher,now:100000});assert.equal(f.sent.length,0);assert.equal(fs.existsSync(usage.fileOf(f.root)),false);});
test('zero process birth is unknown and cannot count',async t=>{const f=setup(t);f.s.birth=f.reader.gameBirth=f.reader.gal.state.gameStarted='0';await usage.observe(f.reader,undefined,{fetcher:f.fetcher,now:100000});assert.equal(f.sent.length,0);});
test('concurrent triggers serialize one durable event and one POST',async t=>{const f=setup(t);await Promise.all(Array.from({length:6},()=>usage.observe(f.reader,undefined,{fetcher:f.fetcher,now:100000})));assert.equal(f.sent.length,1);assert.equal(usage.read(f.root).entries.length,1);});
test('note schedules no synchronous IO and rejects a profile changed before its deferred callback',async t=>{const f=setup(t),originalFetch=globalThis.fetch;globalThis.fetch=f.fetcher;t.after(()=>{globalThis.fetch=originalFetch;});usage.note(f.reader);assert.equal(fs.existsSync(usage.fileOf(f.root)),false);assert.equal(f.sent.length,0);f.reader.gal.profile={...f.reader.gal.profile};await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));assert.equal(f.sent.length,0);assert.equal(fs.existsSync(usage.fileOf(f.root)),false);});
test('attempt marker persistence failure stops before POST even after the event has been queued',async t=>{const f=setup(t);let calls=0;const save=(root,state)=>{if(++calls===2)throw Error('atomic rename');fs.mkdirSync(path.dirname(usage.fileOf(root)),{recursive:true});fs.writeFileSync(usage.fileOf(root),JSON.stringify(state));};assert.equal((await usage.observe(f.reader,undefined,{fetcher:f.fetcher,now:100000,save})).state,'failed');assert.equal(f.sent.length,0);assert.equal(usage.read(f.root).entries[0].stage,'pending');});
test('game layer uses a signed strong print along with exact executable layer',async t=>{
 const f=setup(t),game=f.publisher.sign(diff.build({key:'d'.repeat(64),layer:'game',prints:{script:f.identity.script},rev:3,source:'official',mode:'hide',settings:{},engine:'kirikiri'}));
 const answer=match=>({schema:'megulit.game-diff-feed',version:2,key:f.s.key,versionLayer:{match:'exe',diff:f.document},gameLayer:{match,diff:game}});
 f.adopt(game,answer('script'));await usage.observe(f.reader,undefined,{fetcher:f.fetcher,now:100000});assert.equal(f.sent.length,2);assert.deepEqual(f.sent.map(e=>e.layer),['version','game']);assert.equal(f.sent[1].seedHash,sha(diff.canonical(game)));
 f.s.birth=f.reader.gameBirth=f.reader.gal.state.gameStarted='223456789';f.adopt(game,answer('title'));await usage.observe(f.reader,undefined,{fetcher:f.fetcher,now:200000});assert.equal(f.sent.length,3);assert.equal(f.sent[2].layer,'version');
});
test('transport failure retries the durable original eventId only after a later adoption trigger',async t=>{
 const f=setup(t),ids=[],fetcher=async(_url,o)=>{ids.push(JSON.parse(o.body).eventId);return new Response('',{status:503});};
 await usage.observe(f.reader,undefined,{fetcher,now:100000});await usage.observe(f.reader,undefined,{fetcher,now:110000});assert.equal(ids.length,1);assert.equal(usage.read(f.root).entries[0].stage,'pending');
 await usage.observe(f.reader,undefined,{fetcher:f.fetcher,now:140000});assert.equal(f.sent[0].eventId,ids[0]);assert.equal(usage.read(f.root).entries[0].stage,'sent');
});
for(const variant of ['missing-ok','false-ok','missing-accepted','wrong-event','non-json'])test('2xx '+variant+' remains pending',async t=>{
 const f=setup(t);await usage.observe(f.reader,undefined,{now:100000,fetcher:async(_u,o)=>{const e=JSON.parse(o.body);return variant==='non-json'?new Response('bad'):Response.json({...(variant==='missing-ok'?{}:{ok:variant!=='false-ok'}),...(variant==='missing-accepted'?{}:{accepted:true}),eventId:variant==='wrong-event'?crypto.randomUUID():e.eventId});}});assert.equal(usage.read(f.root).entries[0].stage,'pending');
});
for(const status of [400,401,403,404,409,410,422])test('HTTP '+status+' stops that event without deleting the signed profile',async t=>{
 const f=setup(t);let calls=0;await usage.observe(f.reader,undefined,{now:100000,fetcher:async()=>{calls++;return new Response('',{status});}});assert.equal(usage.read(f.root).entries[0].stage,'stopped');await usage.observe(f.reader,undefined,{fetcher:f.fetcher,now:200000});assert.equal(calls,1);assert.equal(f.sent.length,0);assert.ok(f.s.shared);assert.equal(f.reader.gal.profile.placement.lineOffsetY,77);
});
for(const status of [408,425,429,500,503])test('HTTP '+status+' keeps same event pending',async t=>{const f=setup(t);await usage.observe(f.reader,undefined,{now:100000,fetcher:async()=>new Response('',{status})});assert.equal(usage.read(f.root).entries[0].stage,'pending');});
test('atomic persistence failure prevents sending',async t=>{const f=setup(t);const result=await usage.observe(f.reader,undefined,{fetcher:f.fetcher,now:100000,save:()=>{throw Error('disk');}});assert.equal(result.state,'failed');assert.equal(f.sent.length,0);assert.equal(fs.existsSync(usage.fileOf(f.root)),false);});
for(const gate of ['sharing','adaptation','private','replay','off','closed','unbound','wrong-pid','wrong-birth','no-birth'])test(gate+' disables adoption without a local record or POST',async t=>{
 const f=setup(t);if(gate==='sharing')feed.setSharing(f.root,false);if(gate==='adaptation'){fs.mkdirSync(path.join(f.root,'data/config'),{recursive:true});fs.writeFileSync(path.join(f.root,'data/config/library.json'),JSON.stringify({sharedAdaptation:false}));}
 if(gate==='private')Object.assign(process.env,{MEGULIT_OWNER_TESTS:'1',MEGULIT_SIDE_BY_SIDE:'1',MEGULIT_ROOT:f.root});if(gate==='replay')process.env.MEGULIT_CARDINAL_REPLAY='1';if(gate==='off'){process.env.MEGULIT_RELAY_BASE=' off ';fs.mkdirSync(path.join(f.root,'data/config'),{recursive:true});fs.writeFileSync(path.join(f.root,'data/config/online.json'),JSON.stringify({relayUrl:'https://usage.test'}));}
 if(gate==='closed')f.reader.active=()=>false;if(gate==='unbound')f.reader.gal.state.bound=false;if(gate==='wrong-pid')f.reader.gal.state.gameProcessId++;if(gate==='wrong-birth')f.reader.gal.state.gameStarted='9';if(gate==='no-birth')f.reader.gameBirth='';
 await usage.observe(f.reader,undefined,{fetcher:f.fetcher,now:100000});assert.equal(f.sent.length,0);assert.equal(fs.existsSync(usage.fileOf(f.root)),false);
});
test('corrupt or oversized bounded store fails closed',async t=>{const f=setup(t);fs.mkdirSync(path.dirname(usage.fileOf(f.root)),{recursive:true});for(const value of ['{','x'.repeat(usage.MAX_BYTES+1),JSON.stringify({version:1,entries:Array(usage.MAX_RECORDS+1).fill({})})]){fs.writeFileSync(usage.fileOf(f.root),value);assert.equal((await usage.observe(f.reader,undefined,{fetcher:f.fetcher,now:100000})).state,'failed');assert.equal(f.sent.length,0);}});
test('all-pending queue caps at 128 and still drains up to eight durable events',async t=>{const f=setup(t);await usage.observe(f.reader,undefined,{now:100000,fetcher:async()=>new Response('',{status:503})});const state=usage.read(f.root),entry=state.entries[0];state.entries=Array.from({length:usage.MAX_RECORDS},(_,i)=>({...entry,key:sha(String(i)),event:{...entry.event,eventId:crypto.randomUUID()}}));fs.writeFileSync(usage.fileOf(f.root),JSON.stringify(state));f.s.birth=f.reader.gameBirth=f.reader.gal.state.gameStarted='888';assert.equal((await usage.observe(f.reader,undefined,{fetcher:f.fetcher,now:200000})).state,'full');assert.equal(usage.read(f.root).entries.length,usage.MAX_RECORDS);assert.equal(f.sent.length,8);assert.equal(usage.read(f.root).entries.filter(e=>e.stage==='pending').length,120);});
test('Reader wiring only schedules actual native non-history non-recovering sources and stays synchronous',t=>{
 const {Reader}=require('../services/reader.cjs'),old=usage.note,seen=[];usage.note=r=>seen.push(r);t.after(()=>{usage.note=old;});
 const r=Object.create(Reader.prototype);Object.assign(r,{root:'Z:/unit-no-store',runtime:{config:()=>({}),services:()=>({gameEvent:async()=>{}}),emit(){}},gal:{preferences:{display:'bilingual'},send(){},hooks:{trace(){}}},immersion:{currentText:'',source(){}},stats:{line(){}},prefs:()=>({provider:'google',learnerLanguage:'zh'}),logVisibility(){}});
 const valid={hookSource:'neutral fixture source',hookActive:true,processAttached:true,hookSourceOrigin:'live'};
 for(const change of [{hookSource:''},{hookActive:false},{processAttached:false},{hookRecovering:true},{recovering:true},{hookSourceOrigin:'history'},{hookSourceOrigin:'ocr'},{origin:'history'}])r.event({...valid,...change});assert.equal(seen.length,0);assert.equal(r.event(valid),undefined);assert.deepEqual(seen,[r]);
});
test('signed Torch usage rechecks the installed directory, scripts and live profile',async t=>{
 const f=setup(t),folder=path.join(f.root,'torch');fs.mkdirSync(folder);const exe=path.join(folder,'game.exe');fs.writeFileSync(exe,'MZ inert torch fixture');fs.writeFileSync(path.join(folder,'data.xp3'),'inert script A');f.identity.exe=await R.fileHash(exe);f.identity.script=await R.fileHash(path.join(folder,'data.xp3'));
 const profile=f.publisher.sign({...f.profile(),settings:{placement:{lineOffsetY:77}}}),release=await f.release(profile),publication={hash:await P.hash(release),at:'2026-11-21T02:00:00.000Z'};
 t.after(()=>R.stop(f.root));assert.equal((await R.receive(f.root,'A',{getGame:()=>({id:'A',title:'Neutral fixture',executable:exe,original:'{}'}),resources:()=>true,keys:f.keys,urls:['https://usage.test/fixture'],fetcher:async()=>Response.json({release,publication})})).state,'received');
 f.s.exe=f.s.input.exe=f.reader.gameExe=exe;f.s.key=f.identity.exe;f.s.prints={exe:f.identity.exe,script:f.identity.script};f.s.shared=feed.layer(feed.cached(f.root,f.s.key),f.s.key,{exe,torchTrust:f.keys});f.reader.gal.profile=Profiles.profileFor(live.inputOf(f.s));await usage.observe(f.reader,undefined,{fetcher:f.fetcher,now:100000});assert.equal(f.sent.length,1);assert.equal(f.sent[0].seedHash,sha(diff.canonical(profile)));
 fs.writeFileSync(path.join(folder,'data.xp3'),'changed script B');f.s.birth=f.reader.gameBirth=f.reader.gal.state.gameStarted='998877';await usage.observe(f.reader,undefined,{fetcher:f.fetcher,now:200000});assert.equal(f.sent.length,1);
});
test('local first-dialogue trials use Reader events and authenticated DOM pairs, independent of sharing',async t=>{
 const {Reader}=require('../services/reader.cjs'),tape=require('../core/cardinal/tape.cjs');
 const f=setup(t),r=Object.assign(Object.create(Reader.prototype),f.reader),events=[],records=[];
 f.s.reader=r;f.s.ver='1.4.22';process.env.MEGULIT_RELAY_BASE='off';
 Object.assign(r,{runtime:{config:()=>({}),services:()=>({gameEvent:async()=>{}}),emit(){}},
  emit:(name,msg)=>events.push(msg),prefs:()=>({learnerLanguage:'zh'}),cardinalTarget:()=>'zh',embedCached:()=>null,
  immersion:{source(){}},stats:{line(){}},logVisibility:m=>{if(m.kind==='torchLocalTrial')records.push(m);}});
 const thread={id:'1',code:'HA',selected:true};Object.assign(r.gal,{preferences:{},hooks:{serial:1,state:{hookThreads:[thread]}},send(){},controller:{seq:10}});
 const next=n=>{r.event({hookSource:'fixture line '+n,hookSequence:n,hookActive:true,processAttached:true});return events.at(-1).cardinalPair;};
 assert.equal(records.length,0);const first=next(1);assert.equal(records.length,1);
 assert.deepEqual(records[0].results,{read:'unknown',hide:'unknown',replace:'unknown',pointRead:'unknown'});
 const policy=await r.message({type:'cardinalPairPolicy',schema:1,client:'dom-fixture',revision:1,target:'zh',enabled:true,visible:true});
 const descriptor=policy.replies[0].args[0].descriptor;tape.liveTranslation(first.body,'fixture translation',{target:'zh'});
 const feedback={...descriptor,type:'cardinalPair',enabled:true,visible:true,observed:true,paired:true,translation:'fixture translation'};
 await r.message(feedback);await r.message(feedback);assert.equal(records.length,2);assert.equal(records.at(-1).results.replace,'passed');
 r.event({type:'hookCheck',hookCheckState:'checking'});r.event({type:'hookCheck',hookCheckState:'visible'});
 assert.equal(records.at(-1).results.hide,'failed');
 await r.message({...descriptor,type:'lookupViewed',surface:'fixture',operationId:'fixture-view-1'});
 assert.equal(records.at(-1).results.pointRead,'passed');
 thread.id='2';await r.message(feedback);assert.equal(records.length,4);
 const second=next(2);assert.equal(records.at(-1).index,1);assert.notEqual(first.episode,second.episode);
 await r.message(feedback);assert.equal(records.at(-1).results.read,'unknown');
 r.gal.controller.styleCalibration=true;r.event({gameStyleReveal:true});next(3);assert.equal(records.length,5);
 r.gal.controller.styleCalibration=false;
 for(let n=4;n<12;n++)next(n);assert.equal(records.at(-1).index,5);
 const before=records.length;r.gameBirth='999';next(13);assert.equal(records.length,before);
});
