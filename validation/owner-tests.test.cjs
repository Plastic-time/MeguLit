// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const O=require('../core/owner-tests.cjs'),P=require('../core/profiles/index.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function fixture(t,engine='rpgmaker'){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-owner-tests-')),root=path.join(dir,'isolated'),game=path.join(dir,'game');
 for(const p of ['data/config','cache','logs'])fs.mkdirSync(path.join(root,p),{recursive:true});fs.mkdirSync(game);
 const exe=path.join(game,'Game.exe'),resource=path.join(game,'data.dat');fs.writeFileSync(exe,'neutral engine executable');fs.writeFileSync(resource,'neutral exact script');
 const entry={id:'fixture',engine,exe,sha256:sha(fs.readFileSync(exe)),files:[{path:'data.dat',bytes:fs.statSync(resource).size,sha256:sha(fs.readFileSync(resource))}],draw:{roles:true,embed:true},capabilities:['roles','embed']};
 const manifest={schema:'megulit.owner-tests',version:1,root,entries:[entry]},mf=path.join(root,'data/config/owner-tests.json');
 const write=()=>fs.writeFileSync(mf,JSON.stringify(manifest));write();fs.writeFileSync(path.join(root,'data/config/library.json'),JSON.stringify({runtimeSampleShare:false,autoProfileShare:false,sharedAdaptation:false}));fs.writeFileSync(path.join(root,'data/config/online.json'),'{"relayUrl":""}');
 const saved={};for(const [k,v]of Object.entries({MEGULIT_ROOT:root,MEGULIT_SIDE_BY_SIDE:'1',MEGULIT_OWNER_TESTS:'1',MEGULIT_RELAY_BASE:'off'})){saved[k]=process.env[k];process.env[k]=v;}
 t.after(()=>{O.revokeFor(root);for(const [k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}assert.ok(path.basename(dir).startsWith('megulit-owner-tests-'));fs.rmSync(dir,{recursive:true,force:true});});
 return {dir,root,game,exe,resource,entry,manifest,mf,write,options:{exe,engine},ctx:{exe,engine,capability:'roles'}};
}
test('zero default and opaque tokens; process identity required before profile activation',async t=>{
 const f=fixture(t),p=P.profileFor({exe:f.exe,engine:'rpgmaker'});assert.equal(p.draw.roles,false);assert.equal(p.draw.kemcoSprites,false);
 delete process.env.MEGULIT_OWNER_TESTS;assert.equal(await O.resolve(f.root,f.options),null);process.env.MEGULIT_OWNER_TESTS='1';
 const token=await O.resolve(f.root,f.options);assert.ok(token);assert.equal(O.describe(token).active,false);assert.equal(O.apply(p,token,f.options).draw.roles,false);
 if(process.platform==='win32')assert.equal(O.allowed(token,{...f.ctx,exe:f.exe.toUpperCase()}),true,'Windows canonical identity is case insensitive');
 assert.equal(O.allowed({...token},f.ctx),false);assert.equal(O.allowed(token,{...f.ctx,capability:'arbitrary'}),false);assert.equal(O.bind(token,{pid:41,birth:''}),false);
 assert.equal(O.bind(token,{pid:41,birth:'1234'}),true);assert.equal(O.bind(token,{pid:41,birth:'1234'}),true);assert.equal(O.describe(token).active,true);
 const a=O.apply(p,token,f.options);assert.equal(a.draw.roles,true);assert.match(a.layers,/\+owner-test$/);assert.doesNotMatch(a.layers,/official|seed/);assert.equal(p.draw.roles,false);
 const again=O.apply(a,token,f.options);assert.equal(again.layers,a.layers);assert.equal(O.apply(again,null,f.options).draw.roles,false);assert.equal(O.apply(again,null,f.options).draw.kemcoSprites,false);
 assert.equal(O.matches(token,{pid:42,birth:'1234'}),false);assert.equal(O.allowed(token,f.ctx),false);
});
test('same exe in another directory or different script cannot use this grant',async t=>{
 const f=fixture(t),other=path.join(f.dir,'other');fs.mkdirSync(other);const b=path.join(other,'Game.exe');fs.copyFileSync(f.exe,b);fs.writeFileSync(path.join(other,'data.dat'),'different script');
 const token=await O.resolve(f.root,f.options);O.bind(token,{pid:42,birth:'2'});assert.equal(O.allowed(token,{...f.ctx,exe:b}),false);assert.equal(await O.resolve(f.root,{...f.options,exe:b}),null);
 assert.equal(O.apply(P.profileFor({exe:b,engine:'rpgmaker'}),token,{...f.options,exe:b}).draw.roles,false);
 fs.writeFileSync(f.resource,'changed exact script');assert.equal(O.allowed(token,f.ctx),false);assert.equal(await O.resolve(f.root,f.options),null);
});
test('same-size and restored-mtime replacement invalidates inode/ctime identity',async t=>{
 const f=fixture(t),token=await O.resolve(f.root,f.options),st=fs.statSync(f.resource);const next=path.join(f.game,'next.dat');fs.copyFileSync(f.resource,next);fs.utimesSync(next,st.atime,st.mtime);fs.renameSync(next,f.resource);
 assert.equal(fs.statSync(f.resource).size,st.size);assert.equal(O.allowed(token,f.ctx),false);assert.equal(O.lookup(f.root,f.exe,'rpgmaker'),null);
});
test('all privacy gates are strict and configuration edits revoke held tokens',async t=>{
 const f=fixture(t);for(const k of ['MEGULIT_ROOT','MEGULIT_SIDE_BY_SIDE','MEGULIT_OWNER_TESTS','MEGULIT_RELAY_BASE']){const old=process.env[k];process.env[k]='wrong';assert.equal(await O.resolve(f.root,f.options),null,k);process.env[k]=old;}
 for(const field of ['runtimeSampleShare','autoProfileShare','sharedAdaptation']){const file=path.join(f.root,'data/config/library.json'),safe={runtimeSampleShare:false,autoProfileShare:false,sharedAdaptation:false};fs.writeFileSync(file,JSON.stringify({...safe,[field]:0}));assert.equal(await O.resolve(f.root,f.options),null,field);fs.writeFileSync(file,JSON.stringify(safe));}
 const token=await O.resolve(f.root,f.options);fs.writeFileSync(path.join(f.root,'data/config/online.json'),'{"relayUrl":"https://example.invalid"}');assert.equal(O.allowed(token,f.ctx),false);
 fs.writeFileSync(path.join(f.root,'data/config/online.json'),'{"relayUrl":""}');fs.writeFileSync(path.join(f.root,'data/config/secrets.dpapi'),'neutral fake secret');assert.equal((await O.inspect(f.root,f.options)).reason,'CREDENTIALS');
});
test('manifest root, booleans, capabilities, engine settings and bounded schema reject',async t=>{
 const f=fixture(t),original=JSON.stringify(f.manifest);const changes=[m=>m.root=f.game,m=>m.entries[0].draw.roles=1,m=>m.entries[0].capabilities.push('unknown'),m=>m.entries[0].capabilities.push('roles'),m=>m.entries[0].draw.advhdInput=true,m=>m.entries[0].capabilities.push('lua-input'),m=>m.entries[0].files[0].path='../data.dat',m=>m.entries[0].files[0].bytes=O.LIMITS.fileBytes+1,m=>m.entries.push(m.entries[0]),m=>m.entries[0].extra='not allowed'];
 for(const mutate of changes){Object.assign(f.manifest,JSON.parse(original));mutate(f.manifest);f.write();assert.equal(await O.resolve(f.root,f.options),null);}
 fs.writeFileSync(f.mf,' '.repeat(O.LIMITS.manifest+1));assert.equal((await O.inspect(f.root,f.options)).reason,'CONFIG_SIZE');
});
test('manifest replacement revokes and stop invalidates in-flight resolve generation',async t=>{
 const f=fixture(t),token=await O.resolve(f.root,f.options);let called=0;O.onRevoke(token,()=>called++);f.write();assert.equal(O.allowed(token,f.ctx),false);assert.equal(called,1);O.revoke(token);assert.equal(called,1);
 const open=fs.promises.open;let release,entered;const started=new Promise(r=>entered=r),wait=new Promise(r=>release=r);fs.promises.open=async(...args)=>{entered();await wait;return open(...args);};
 try{const pending=O.resolve(f.root,f.options);await started;O.revokeFor(f.root,f.exe);release();assert.equal(await pending,null);}finally{fs.promises.open=open;release?.();}
});
test('newer resolve wins and cancellation cannot publish a late token',async t=>{
 const f=fixture(t),open=fs.promises.open;let release,entered,first=true;const started=new Promise(r=>entered=r),wait=new Promise(r=>release=r);fs.promises.open=async(...args)=>{if(first){first=false;entered();await wait;}return open(...args);};
 try{const older=O.resolve(f.root,f.options);await started;const newer=await O.resolve(f.root,f.options);assert.ok(newer);release();assert.equal(await older,null);assert.equal(O.allowed(newer,f.ctx),true);}finally{fs.promises.open=open;release?.();}
 O.revokeFor(f.root);const c=new AbortController();c.abort();assert.equal((await O.inspect(f.root,{...f.options,signal:c.signal})).reason,'CANCELLED');
});
test('stepdown, live gate and canary keep the final authority',async t=>{
 const f=fixture(t),token=await O.resolve(f.root,f.options);O.bind(token,{pid:4,birth:'birth'});const p=P.profileFor(f.options),a=O.apply(p,token,f.options);assert.equal(a.draw.roles,true);
 const down=P.apply(p,{draw:{roles:false}},'stepdown');assert.equal(O.apply(down,token,f.options).draw.roles,false);
 const autoDir=path.join(f.root,'data/config/auto-profiles');fs.mkdirSync(autoDir);fs.writeFileSync(path.join(autoDir,f.entry.sha256+'.json'),'{"source":"gate"}');assert.equal(O.allowed(token,f.ctx),false);assert.equal(O.apply(a,token,f.options).draw.roles,false);
 fs.unlinkSync(path.join(autoDir,f.entry.sha256+'.json'));const c=new(require('../core/text-paths.cjs').Canary)(f.root,f.exe);c.write({off:{web:{reason:'neutral fixture'}}});assert.equal(O.allowed(token,f.ctx),false);assert.equal(O.apply(a,token,f.options).draw.roles,false);
});
test('owned shadow alias requires exact root, engine, SHA, resource identity and current session',async t=>{
 const f=fixture(t,'unity'),token=await O.resolve(f.root,f.options),shadow=path.join(f.root,'data/unity-shadow/owned');fs.mkdirSync(shadow,{recursive:true});const alias=path.join(shadow,'Game.exe');fs.copyFileSync(f.exe,alias);
 const unrelated=path.join(f.dir,'Game.exe');fs.copyFileSync(f.exe,unrelated);assert.equal(await O.registerLaunch(token,{exe:unrelated,engine:'unity'}),false);assert.equal(await O.registerLaunch(token,{exe:alias,engine:'artemis'}),false);
 fs.writeFileSync(alias,'wrong');assert.equal(await O.registerLaunch(token,{exe:alias,engine:'unity'}),false);fs.copyFileSync(f.exe,alias);assert.equal(await O.registerLaunch(token,{exe:alias,engine:'unity'}),true);
 assert.equal(O.lookup(f.root,alias,'unity'),token);assert.equal(await O.resolve(f.root,{exe:alias,engine:'unity'}),token);assert.equal(O.identity(token,alias),f.exe);O.bind(token,{pid:18,birth:'19'});
 assert.equal(O.apply(P.profileFor({engine:'unity',exe:alias}),token,{engine:'unity',exe:alias}).draw.roles,true);assert.equal(O.matches(token,{pid:18,birth:'20'}),false);assert.equal(O.lookup(f.root,alias,'unity'),null);
});
test('Artemis lua-input is explicit; local opaque token never follows an external profile',async t=>{
 const f=fixture(t,'artemis');f.entry.capabilities=['lua-input'];f.entry.draw={};f.write();const token=await O.resolve(f.root,f.options);assert.equal(O.allowed(token,{...f.ctx,capability:'lua-input'}),true);assert.equal(O.allowed(token,f.ctx),false);
 const fake=P.profileFor({...f.options,official:{ownerTestGrant:token,draw:{roles:true}}});assert.equal(fake.draw.roles,false);assert.equal(O.apply(fake,{...token},f.options).draw.roles,false);
});
test('actual HookNative profile/control path applies owner-test and removes it on revoke',async t=>{
 const f=fixture(t),token=await O.resolve(f.root,f.options),{HookNative}=require('../core/hook-native.cjs'),configs=[];
 const hook=Object.assign(Object.create(HookNative.prototype),{profile:P.profileFor(f.options),profileInput:f.options,target:{pid:91,started:'92'},state:{},textPath:{drawConfig:c=>configs.push(c),hide:()=>{}},emit:()=>{},trace:()=>{},ensureEngineDraw(){return this.engineDraw={setProfile:()=>{},stop:()=>{}};}});
 hook.setOwnerTestGrant(token);hook.setProfile(P.profileFor(f.options),f.options);assert.equal(hook.profile.draw.roles,true);assert.equal(configs.at(-1).roles,true);assert.equal(hook.profile.layers.split('+').filter(x=>x==='owner-test').length,1);
 O.revoke(token);assert.equal(hook.ownerTestGrant,null);assert.equal(hook.profile.draw.roles,false);assert.equal(configs.at(-1).roles,false);
});
test('private test mode blocks all existing sharing and relay routes even after preference mistakes',async t=>{
 const f=fixture(t);fs.writeFileSync(path.join(f.root,'data/config/library.json'),'{"runtimeSampleShare":true,"autoProfileShare":true,"sharedAdaptation":true}');fs.writeFileSync(path.join(f.root,'data/config/online.json'),'{"relayUrl":"https://example.invalid"}');
 assert.equal(require('../services/runtime-sample.cjs').enabled(f.root),false);assert.equal(require('../services/auto-profile-feed.cjs').sharing(f.root),false);assert.equal(require('../services/shared-adaptation.cjs').enabled(f.root),false);
 assert.deepEqual(require('../services/relay-config.cjs').endpoints(f.root,'/api/diagnostics'),[]);assert.equal(require('../services/relay-config.cjs').relayBase(undefined),'');
 let fetches=0;const fetcher=async()=>{fetches++;throw Error('must not call');};assert.equal((await require('../services/auto-profile-feed.cjs').report(f.root,{key:f.entry.sha256},{fetcher})).state,'skipped');const sync=require('../services/shared-adaptation-sync.cjs');assert.equal((await sync.push([{}],{root:f.root,enabled:true,endpoint:'https://example.invalid',fetch:fetcher})).state,'disabled');assert.equal((await sync.pull([f.entry.sha256],{root:f.root,enabled:true,endpoint:'https://example.invalid',fetch:fetcher})).state,'disabled');assert.equal(fetches,0);
 assert.equal(O.privateMode(path.join(f.dir,'different-root')),false);delete process.env.MEGULIT_OWNER_TESTS;assert.equal(O.privateMode(f.root),false);assert.equal(require('../services/runtime-sample.cjs').enabled(f.root),true);assert.equal(require('../services/relay-config.cjs').relayBase(f.root),'https://example.invalid');
});
test('reparse sources, root state folders and linked databases fail closed',async t=>{
 const f=fixture(t),external=path.join(f.dir,'external');fs.mkdirSync(external);fs.writeFileSync(path.join(external,'data.dat'),'neutral exact script');
 const moved=path.join(f.root,'old-cache');fs.renameSync(path.join(f.root,'cache'),moved);fs.symlinkSync(moved,path.join(f.root,'cache'),'junction');assert.equal((await O.inspect(f.root,f.options)).reason,'REPARSE');fs.unlinkSync(path.join(f.root,'cache'));fs.renameSync(moved,path.join(f.root,'cache'));
 const dbSource=path.join(external,'outside.sqlite');fs.writeFileSync(dbSource,'neutral database marker');const db=path.join(f.root,'data/megulit.sqlite');fs.linkSync(dbSource,db);assert.equal((await O.inspect(f.root,f.options)).reason,'STATE_LINK');fs.unlinkSync(db);
 const data=path.join(f.game,'resource-dir');fs.symlinkSync(external,data,'junction');f.entry.files[0].path='resource-dir/data.dat';f.write();assert.equal((await O.inspect(f.root,f.options)).reason,'REPARSE');
});
test('accessor contexts do not execute; raw JSON manifest cannot confer token authority',async t=>{
 const f=fixture(t),token=await O.resolve(f.root,f.options);let calls=0;const ctx={...f.ctx};Object.defineProperty(ctx,'exe',{enumerable:true,get(){calls++;return f.exe;}});assert.equal(O.allowed(token,ctx),false);assert.equal(calls,0);assert.equal(O.allowed(JSON.parse(JSON.stringify(f.entry)),f.ctx),false);
});
test('actual Reader profile entry asynchronously reuses prepared grant and stale reader bind cannot activate it',async t=>{
 const f=fixture(t),token=await O.resolve(f.root,f.options),{HookNative}=require('../core/hook-native.cjs'),{Reader}=require('../services/reader.cjs'),live=require('../services/self-check-live.cjs');
 const oldStart=live.start;live.start=()=>null;t.after(()=>{live.start=oldStart;});
 const hook=Object.assign(Object.create(HookNative.prototype),{profile:P.profileFor(f.options),profileInput:f.options,target:{pid:21,started:'22'},state:{},emit:()=>{},trace:()=>{},ensureEngineDraw(){return this.engineDraw={setProfile:()=>{},stop:()=>{}};}});
 const fake={root:f.root,gamePid:21,gameExe:f.exe,gal:{state:{gameStarted:'22'},hooks:hook,setGameProfile:(p,input)=>hook.setProfile(p,input)}};
 Reader.prototype.applyGameProfile.call(fake,f.exe,{original:JSON.stringify({library:{engine:'rpgmaker'}})});
 for(let i=0;i<30&&!hook.ownerTestGrant;i++)await new Promise(r=>setTimeout(r,5));assert.equal(hook.ownerTestGrant,token);assert.equal(hook.profile.draw.roles,true);assert.equal(O.describe(token).phase,'bound');
 O.revoke(token);const next=await O.resolve(f.root,f.options);Reader.prototype.applyGameProfile.call(fake,f.exe,{original:JSON.stringify({library:{engine:'rpgmaker'}})});fake.gamePid=23;await new Promise(r=>setTimeout(r,20));assert.equal(O.allowed(next,f.ctx),false);assert.equal(hook.profile.draw.roles,false);
});
test('private feedback catalog separates expected pins, prepared permission and bound permission',async t=>{
 const f=fixture(t);let row=O.status(f.root).entries[0];assert.equal(row.checkReason,'NOT_PREPARED');assert.equal(row.active,false);assert.equal(row.exeSHA256,f.entry.sha256);assert.deepEqual(row.files,f.entry.files);
 const token=await O.resolve(f.root,f.options);row=O.status(f.root).entries[0];assert.equal(row.phase,'prepared');assert.equal(row.checkReason,'AWAITING_PROCESS');assert.equal(row.active,false);assert.equal('token'in row,false);
 O.bind(token,{pid:121,birth:'122'});row=O.status(f.root).entries[0];assert.equal(row.phase,'bound');assert.equal(row.active,true);O.revoke(token);assert.equal(O.status(f.root).entries[0].active,false);
 delete process.env.MEGULIT_OWNER_TESTS;assert.deepEqual(O.status(f.root),{enabled:false,reason:'NOT_PRIVATE',entries:[]});
});
test('normal test launcher forwards only isolated MeguLit settings and clears inherited injection or credentials',async t=>{
 const f=fixture(t),L=require('../tools/owner-tests-launch.cjs'),env=L.environment(f.root,{PATH:'neutral',OPENAI_API_KEY:'never forward',HF_TOKEN:'never forward',NODE_OPTIONS:'--require unwanted',TOME_FINAL_ROOT:'elsewhere',MEGULIT_CARDINAL_REPLAY:'1',MEGULIT_FONTDOT_FORCE:'1',WEBVIEW2_USER_DATA_FOLDER:'elsewhere',DOORSTOP_INVOKE_DLL_PATH:'elsewhere'});
 assert.equal(env.PATH,'neutral');for(const k of ['OPENAI_API_KEY','HF_TOKEN','NODE_OPTIONS','TOME_FINAL_ROOT','MEGULIT_CARDINAL_REPLAY','MEGULIT_FONTDOT_FORCE','WEBVIEW2_USER_DATA_FOLDER','DOORSTOP_INVOKE_DLL_PATH'])assert.equal(env[k],undefined,k);assert.equal(env.MEGULIT_ROOT,f.root);assert.equal(env.MEGULIT_OWNER_TESTS,'1');assert.equal(env.TEMP,path.join(f.root,'cache','owner-temp'));
 fs.writeFileSync(path.join(f.root,'MeguLit.exe'),'neutral app, not executed');let call;const {EventEmitter}=require('node:events');const result=await L.launch(f.root,{spawnProcess:(file,args,options)=>{call={file,args,options};const child=new EventEmitter();child.pid=987;child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;}});
 assert.equal(result.started,true);assert.equal(call.file,path.join(f.root,'MeguLit.exe'));assert.deepEqual(call.args,[]);assert.equal(call.options.env.MEGULIT_RELAY_BASE,'off');assert.equal(call.options.env.TMP,call.options.env.TEMP);assert.equal(call.options.cwd,f.root);
 delete process.env.MEGULIT_OWNER_TESTS;let starts=0;await assert.rejects(L.launch(f.root,{spawnProcess:()=>starts++}),/OWNER_TEST_NOT_PREPARED/);assert.equal(starts,0);
});
