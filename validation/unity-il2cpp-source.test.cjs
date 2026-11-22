// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto');
const I=require('../core/unity-il2cpp-source.cjs'),U=require('../core/text-paths-unity.cjs'),L=require('../core/text-paths-launch.cjs'),O=require('../core/owner-tests.cjs');
const OWNER={pid:process.pid,started:'638000000000000000'},SCOPE='a'.repeat(32);
const packet=(scope,seq,text='',kind='full',owner=OWNER,stream='abc')=>I.PREFIX+[scope,seq,owner.pid,owner.started,kind==='hello'?'0':stream,kind,Buffer.from(text).toString('base64')].join('\t');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
test('private setter messages need hello, exact scope and real bound owner; replay and serialized authority fail closed',()=>{
 let permitted=false;const out=[],s=new I.UnityIl2CppSource({scope:SCOPE,canUse:()=>permitted,onSource:m=>out.push(m)});
 s.accept(packet(SCOPE,1,'本文です。'));assert.equal(out.length,0);
 s.accept(packet(SCOPE,1,'','hello'));assert.equal(s.enabled,false);permitted=true;s.refresh();
 s.accept(packet('b'.repeat(32),2,'本文です。'));s.accept(packet(SCOPE,2,'本文です。','full',{...OWNER,started:'638000000000000001'}));assert.equal(out.length,0);
 s.accept(packet(SCOPE,2,'本文です。'));assert.equal(out.length,1);s.accept(packet(SCOPE,2,'別の本文です。'));assert.equal(out.length,1);
 assert.equal(s.block(out[0],OWNER),false);assert.equal(I.shouldBlock({blockIl2CppSource:(m,o)=>s.block(m,o)},JSON.parse(JSON.stringify(out[0])),OWNER),true);
 permitted=false;assert.equal(s.block(out[0],OWNER),true);s.refresh();assert.equal(s.streams.size,0);s.stop();
});
test('clear cancels unfinished typewriter and new identical text becomes a new occurrence; stop kills queued callbacks',async()=>{
 const out=[],clears=[],s=new I.UnityIl2CppSource({scope:SCOPE,canUse:()=>true,onSource:m=>out.push(m),onClear:m=>clears.push(m),holdMs:40,quickHoldMs:20});
 s.accept(packet(SCOPE,1,'','hello'));s.accept(packet(SCOPE,2,'あ'));s.accept(packet(SCOPE,3,'あい'));s.accept(packet(SCOPE,4,'','clear'));await pause(60);assert.equal(out.length,0);
 s.accept(packet(SCOPE,5,'本文です。'));const prior=out[0];s.accept(packet(SCOPE,6,'','clear'));s.accept(packet(SCOPE,7,'本文です。'));assert.equal(out.length,2);assert.equal(s.block(prior,OWNER),true);
 s.accept(packet(SCOPE,8,'まだ途中'));s.stop();await pause(60);assert.equal(out.length,2);assert.ok(clears.length>=3);
});
test('bounded strict UTF-8 framing refuses malformed payloads without polluting the next source',()=>{
 const out=[],s=new I.UnityIl2CppSource({scope:SCOPE,canUse:()=>true,onSource:m=>out.push(m)});s.accept(packet(SCOPE,1,'','hello'));
 for(const p of [packet(SCOPE,2,'日'.repeat(4001)),packet(SCOPE,2,'本文\u0001です。'),packet(SCOPE,2,'本文です。')+'\textra',packet(SCOPE,2,'').replace(/\t$/,'\t/w=='),packet(SCOPE,2,'not empty','clear')])s.accept(p);
 assert.equal(out.length,0);s.accept(packet(SCOPE,2,'日本語😀です。'));assert.equal(out[0].text,'日本語😀です。');s.stop();
});
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'il2cpp-private-')),root=path.join(dir,'root'),game=path.join(dir,'game');
 for(const p of ['data/config','cache','logs','runtime/unity-text'])fs.mkdirSync(path.join(root,p),{recursive:true});fs.mkdirSync(path.join(game,'Game_Data'),{recursive:true});
 const exe=path.join(game,'Game.exe'),pe=Buffer.alloc(512);pe.write('MZ');pe.writeUInt32LE(0x80,0x3c);pe.write('PE\0\0',0x80);pe.writeUInt16LE(0x8664,0x84);fs.writeFileSync(exe,pe);fs.writeFileSync(path.join(game,'GameAssembly.dll'),'neutral assembly fingerprint');fs.writeFileSync(path.join(game,'Game_Data','story.dat'),'neutral identifying script');
 const pack=path.join(root,'runtime/unity-text');for(const f of ['MeguLitUnityText.dll','MeguLitUnityText.IL2CPP.dll','il2cpp-x64/winhttp.dll','il2cpp-x64/doorstop_config.ini','il2cpp-x64/BepInEx/core/official-fixture-marker','il2cpp-x64/dotnet/official-fixture-marker']){fs.mkdirSync(path.dirname(path.join(pack,f)),{recursive:true});fs.writeFileSync(path.join(pack,f),'neutral fixture only, never loaded');}
 fs.writeFileSync(path.join(root,'data/config/library.json'),JSON.stringify({runtimeSampleShare:false,autoProfileShare:false,sharedAdaptation:false}));fs.writeFileSync(path.join(root,'data/config/online.json'),'{"relayUrl":""}');
 const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
 const entry={id:'neutral-il2cpp',engine:'unity',exe,sha256:sha(exe),files:[{path:'Game_Data/story.dat',bytes:29,sha256:sha(path.join(game,'Game_Data/story.dat'))}],draw:{},capabilities:['diagnostic-input']};entry.files[0].bytes=fs.statSync(path.join(game,entry.files[0].path)).size;
 fs.writeFileSync(path.join(root,'data/config/owner-tests.json'),JSON.stringify({schema:'megulit.owner-tests',version:1,root,entries:[entry]}));
 const before={...process.env};Object.assign(process.env,{MEGULIT_ROOT:root,MEGULIT_OWNER_TESTS:'1',MEGULIT_SIDE_BY_SIDE:'1',MEGULIT_RELAY_BASE:'off'});
 t.after(()=>{O.revokeFor(root);for(const k of Object.keys(process.env))if(!(k in before))delete process.env[k];Object.assign(process.env,before);const sh=path.join(root,'data/unity-shadow');if(fs.existsSync(sh))for(const d of fs.readdirSync(sh))for(const n of fs.readdirSync(path.join(sh,d))){const p=path.join(sh,d,n);if(fs.lstatSync(p).isSymbolicLink())fs.rmdirSync(p);}fs.rmSync(dir,{recursive:true,force:true});});
 return {root,game,exe,entry,options:{exe,engine:'unity'}};
}
test('actual prepare and opaque grant stay valid across independent shadow copy; normal first-launch files need no interop hunting',async t=>{
 const f=fixture(t);assert.equal(await L.prepare({root:f.root,exe:f.exe,enabled:true}),null);
 const token=await O.resolve(f.root,f.options);assert.ok(token);const before=fs.statSync(f.exe,{bigint:true});
 const p=await L.prepare({root:f.root,exe:f.exe,ownerTestGrant:token,enabled:false});assert.ok(p);t.after(()=>p.session.stop());assert.equal(p.kind,'il2cpp');
 assert.equal(fs.statSync(f.exe,{bigint:true}).ctimeNs,before.ctimeNs);assert.equal(fs.statSync(p.exe).nlink,1);assert.equal(O.allowed(token,{exe:p.exe,engine:'unity',capability:'diagnostic-input'}),true);
 assert.equal(fs.readFileSync(path.join(p.cwd,'BepInEx/plugins/MeguLit/MeguLitUnityText.auth'),'utf8'),p.session.il2cpp.scope);assert.equal(fs.existsSync(path.join(p.cwd,'BepInEx/interop')),false);
 assert.equal(p.observeProcess({...OWNER,started:OWNER.started}),true);assert.equal(O.matches(token,{pid:OWNER.pid,birth:OWNER.started}),true);assert.equal(O.describe(token).active,true);
 assert.equal(p.session.armed,true);
 assert.equal(fs.existsSync(path.join(f.game,'BepInEx')),false);
 const other=path.join(path.dirname(f.game),'other-game');fs.cpSync(f.game,other,{recursive:true});const second=U.makeShadow({exe:path.join(other,'Game.exe'),shadowRoot:path.join(f.root,'data/unity-shadow'),pack:path.join(f.root,'runtime/unity-text'),port:4321,sourceScope:'f'.repeat(32)});assert.notEqual(second.shadow,p.cwd,'common same-size EXE from another installation needs its own Data junction');
});
test('fragmented socket to real HookNative to Reader, clear, translation/lookup requests, and revoke keep normal semantics',async t=>{
 const f=fixture(t),token=await O.resolve(f.root,f.options),p=await L.prepare({root:f.root,exe:f.exe,ownerTestGrant:token});t.after(()=>p.session.stop());p.observeProcess(OWNER);
 const events=[],{Reader}=require('../services/reader.cjs'),reader=new Reader({root:f.root,folder:path.join(f.root,'data/config'),config:()=>({}),emit:(type,m)=>events.push({type,m}),learning:()=>({request:async(cmd,args)=>({cmd,text:args.text}),readings:{resolve:x=>x}})});
 reader.runtime.services=()=>({gameEvent:async()=>{}});reader.immersion={source:()=>{},currentText:''};reader.gal={send:()=>{}};reader.translation={translate:async text=>text+' translated fixture'};
 const {HookNative}=require('../core/hook-native.cjs'),hook=new HookNative({native:f.root,logs:path.join(f.root,'logs')},m=>reader.event(m),()=>{},Date.now);clearInterval(hook.timer);t.after(()=>hook.stop());hook.trace=()=>{};hook.target={...OWNER};hook.wanted=true;hook.profileInput=f.options;hook.profile=require('../core/profiles/index.cjs').profileFor(f.options);hook.setOwnerTestGrant(token);L.attach(p,hook);
 assert.equal(p.session.canSource(OWNER),true,JSON.stringify(O.describe(token)));
 const sock=net.connect(p.session.server.address().port,'127.0.0.1');t.after(()=>sock.destroy());let controls='';sock.setEncoding('utf8');sock.on('data',d=>controls+=d);await new Promise(r=>sock.once('connect',r));
 sock.setNoDelay(true);sock.write(packet(p.session.il2cpp.scope,1,'','hello')+'\n');for(let n=0;n<50&&!/SOURCE [a-f0-9]{32} 1/.test(controls);n++)await pause(10);assert.match(controls,/SOURCE [a-f0-9]{32} 1/);assert.doesNotMatch(controls,/HIDE|DRAW|WANT/);
 const raw=Buffer.from(packet(p.session.il2cpp.scope,2,'これは試験の本文です。')+'\n');for(let n=0;n<raw.length;n+=3)sock.write(raw.subarray(n,n+3));await pause(60);
 const shown=events.filter(e=>e.type==='reader-event'&&e.m.hookSourceOrigin==='unity-il2cpp');assert.equal(shown.length,1);assert.equal(shown[0].m.hookSource,'これは試験の本文です。');
 assert.equal((await reader.message({id:1,text:shown[0].m.hookSource})).replies[0].args[1],'これは試験の本文です。 translated fixture');
 assert.equal((await reader.message({type:'learningRequest',id:2,command:'lookup_exact',args:{text:'試験',start:0,end:2}})).replies[0].args[1].text,'試験');
 sock.write(packet(p.session.il2cpp.scope,3,'','clear')+'\n');await pause(40);assert.equal(hook.state.hookSource,'');assert.equal(hook.state.hookSourceOrigin,'leave');
 sock.write(packet(p.session.il2cpp.scope,4,'これは試験の本文です。')+'\n');await pause(40);assert.equal(hook.state.hookSourceOrigin,'unity-il2cpp');
 const owned=hook.il2cppShown.authority;O.revoke(token);await pause(40);assert.equal(hook.state.hookSource,'');hook.source(owned,owned.sourceName);hook.emitSource(owned.text,'unity-il2cpp','',0,owned);assert.equal(hook.state.hookSource,'');
});
test('Reader async grant gap and wanted=false cannot authorize a prepared session; unrelated native source survives clear',async t=>{
 const f=fixture(t),token=await O.resolve(f.root,f.options),p=await L.prepare({root:f.root,exe:f.exe,ownerTestGrant:token});t.after(()=>p.session.stop());p.observeProcess(OWNER);
 const {HookNative}=require('../core/hook-native.cjs'),hook=new HookNative({native:f.root,logs:path.join(f.root,'logs')},()=>{},()=>{});clearInterval(hook.timer);t.after(()=>hook.stop());Object.assign(hook,{target:{...OWNER},wanted:true,profileInput:f.options,trace:()=>{}});L.attach(p,hook);
 const s=p.session.il2cpp;s.accept(packet(s.scope,1,'','hello'));s.accept(packet(s.scope,2,'まだ許可がありません。'));assert.notEqual(hook.state.hookSourceOrigin,'unity-il2cpp');
 hook.setOwnerTestGrant(token);s.refresh();s.accept(packet(s.scope,3,'許可された本文です。'));assert.equal(hook.state.hookSourceOrigin,'unity-il2cpp');
 hook.wanted=false;s.refresh();assert.equal(hook.state.hookSource,'');s.accept(packet(s.scope,4,'停止中の本文です。'));assert.equal(hook.state.hookSource,'');
 hook.wanted=true;s.refresh();s.accept(packet(s.scope,5,'次の本文です。'));assert.equal(hook.state.hookSourceOrigin,'unity-il2cpp');
 hook.notify({hookSource:'通常のネイティブ本文です。',hookSourceOrigin:'live',hookSequence:hook.state.hookSequence+1});s.accept(packet(s.scope,6,'','clear'));assert.equal(hook.state.hookSource,'通常のネイティブ本文です。');
 s.accept(packet(s.scope,7,'途中の文字'));hook.stop(false);await pause(380);assert.equal(p.session.stopped,true);assert.equal(O.allowed(token,{exe:p.exe,engine:'unity',capability:'diagnostic-input'}),false);assert.notEqual(hook.state.hookSource,'途中の文字');
});
test('stop(false) retires prepared grant and queued source even before HookNative receives that grant',async t=>{
 const f=fixture(t),token=await O.resolve(f.root,f.options),p=await L.prepare({root:f.root,exe:f.exe,ownerTestGrant:token});p.observeProcess(OWNER);
 const {HookNative}=require('../core/hook-native.cjs'),hook=new HookNative({native:f.root,logs:path.join(f.root,'logs')},()=>{},()=>{});clearInterval(hook.timer);t.after(()=>hook.stop());Object.assign(hook,{target:{...OWNER},wanted:true,profileInput:f.options,trace:()=>{}});L.attach(p,hook);
 assert.equal(hook.ownerTestGrant,undefined);hook.stop(false);await p.session.stop();assert.equal(p.session.il2cpp.stopped,true);assert.equal(O.allowed(token,{exe:p.exe,engine:'unity',capability:'diagnostic-input'}),false);
 hook.wanted=true;hook.setOwnerTestGrant(token);p.session.il2cpp.accept(packet(p.session.il2cpp.scope,1,'','hello'));p.session.il2cpp.accept(packet(p.session.il2cpp.scope,2,'迟到的文本です。'));assert.notEqual(hook.state.hookSource,'迟到的文本です。');
});
