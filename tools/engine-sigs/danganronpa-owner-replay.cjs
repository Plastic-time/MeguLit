// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Local proof against root's real opaque owner API. Only the selected private output directory is written. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),Module=require('node:module');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream'),{execFileSync}=require('node:child_process');
const {hookSource,ownerSource}=require('./danganronpa-root-glue.cjs'),D=require('../../core/danganronpa-pc-source.cjs'),P=require('../../core/profiles/index.cjs');
const ROOT=path.resolve(__dirname,'../..');
function compiled(name,source,overrides={},owningFile){const file=path.join(ROOT,'core',name),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));const original=m.require.bind(m),local=Module.createRequire(file),owning=owningFile?Module.createRequire(path.resolve(owningFile)):local;m.require=id=>{if(Object.hasOwn(overrides,id))return overrides[id];try{local.resolve(id);}catch{return owning(id);}return original(id);};m._compile(source,file);return m.exports;}
async function run(ownerFile,hookFile,out){
 out=path.resolve(out);const privateRoot=path.join(out,'owner-replay-root'),config=path.join(privateRoot,'data/config');for(const dir of [config,path.join(privateRoot,'cache'),path.join(privateRoot,'logs')])fs.mkdirSync(dir,{recursive:true});
 const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
 write(path.join(config,'library.json'),{runtimeSampleShare:false,autoProfileShare:false,sharedAdaptation:false});write(path.join(config,'online.json'),{relayUrl:''});
 const exe='E:/Steam/steamapps/common/Danganronpa Trigger Happy Havoc/DR1_us.exe';
 const entry={id:'dr1-pc-jp-source',engine:'spikechunsoft',exe,sha256:'9debd9f6aed2339e540aa9526ea3f16f38ad91c19ad9a842a5b0b2fab21303e3',files:[
  {path:'dr1_data_jp.wad',bytes:1283334650,sha256:'338d0c440b9f576070d4fbd33390c837475a18062ea0ac536684c851126d3b03'},
  {path:'dr1_data_keyboard_jp.wad',bytes:90245979,sha256:'db3d0394e821a885e6a73bc71d156674503b5017e7021286bf071b0cf6942c99'},
  {path:'drlanguage.txt',bytes:8,sha256:'be4ee906d3efecfc34a94a6cd378633a67f7f35d5abbc3f498715ac5dcbee54f'}],draw:{spikechunsoftInput:true},capabilities:['diagnostic-input']};
 write(path.join(config,'owner-tests.json'),{schema:'megulit.owner-tests',version:1,root:privateRoot,entries:[entry]});
 const envNames=['MEGULIT_OWNER_TESTS','MEGULIT_SIDE_BY_SIDE','MEGULIT_RELAY_BASE','MEGULIT_ROOT'],before=Object.fromEntries(envNames.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{MEGULIT_OWNER_TESTS:'1',MEGULIT_SIDE_BY_SIDE:'1',MEGULIT_RELAY_BASE:'off',MEGULIT_ROOT:privateRoot});
 let h,grant,O;
 try{
  const rawOwner=fs.readFileSync(ownerFile,'utf8'),rawHook=fs.readFileSync(hookFile,'utf8');O=compiled('owner-tests.cjs',ownerSource(rawOwner));
  const inspected=await O.inspect(privateRoot,{exe,engine:entry.engine});assert.equal(inspected.status,'ready',JSON.stringify(inspected));grant=inspected.token;assert.ok(grant);assert.equal(Object.getPrototypeOf(grant),null);assert.equal(Object.keys(grant).length,0);
  const birth=execFileSync('powershell.exe',['-NoProfile','-Command',`(Get-Process -Id ${process.pid}).StartTime.ToUniversalTime().Ticks.ToString()`],{encoding:'utf8',windowsHide:true}).trim();assert.match(birth,/^\d{10,20}$/);assert.equal(O.bind(grant,{pid:process.pid,birth}),true);
  const api={...D,receive:(a,b,c)=>D.receive(a,b,c,O),shouldBlock:(a,b,c)=>D.shouldBlock(a,b,c,O)};
  const {HookNative}=compiled('hook-native.cjs',hookSource(rawHook),{'./owner-tests.cjs':O,'./danganronpa-pc-source.cjs':api,'./profiles/index.cjs':P},hookFile);
  const {Reader}=require('../../services/reader.cjs'),{Immersion}=require('../../core/immersion.cjs');const events=[],galMessages=[];
  const runtime={root:privateRoot,folder:config,config:()=>({immersion:false,dialogDetection:'hook'}),services:()=>({gameEvent:async()=>{}}),emit:(type,message)=>events.push({type,message})};
  const reader=new Reader(runtime);reader.pendingLines=[];reader.immersion=new Immersion(()=>{});reader.gal={send:m=>galMessages.push(m)};
  const native=path.join(privateRoot,'native'),hook=path.join(privateRoot,'runtime/hook');fs.mkdirSync(native,{recursive:true});fs.mkdirSync(hook,{recursive:true});fs.writeFileSync(path.join(native,'HookBridge.exe'),'');for(const name of ['LunaHost64.dll','LunaHook32.dll','LunaHook64.dll'])fs.writeFileSync(path.join(hook,name),'');
  const stdout=new PassThrough(),child=Object.assign(new EventEmitter(),{stdout,stdin:{write:()=>true,on(){},end(){}},exitCode:0,kill(){}});
  h=new HookNative({native,hook,logs:path.join(privateRoot,'logs')},m=>reader.event(m),()=>child);clearInterval(h.timer);h.trace=()=>{};
  h.profileInput={exe};h.profile=P.profileFor({engine:entry.engine,exe});h.preferences={hookProfile:'custom'};h.windowState={bound:true,coverEnabled:true};h.target={pid:process.pid,hwnd:'1',name:'DR1_us',started:birth};reader.gal.hooks=h;h.setOwnerTestGrant(grant);
  h.start(h.target);
  const sourceRows=fs.readFileSync(path.join(out,'bridge-messages.jsonl'),'utf8').replace(/^\ufeff/,'').split(/\r?\n/).filter(Boolean).map(s=>JSON.parse(s)).filter(m=>m.type==='hookSource');assert.equal(sourceRows.length,4);
  for(const m of sourceRows)stdout.write(JSON.stringify(m)+'\n');await new Promise(r=>setTimeout(r,100));
  const rendered=events.filter(e=>typeof e.message.hookSource==='string'&&e.message.hookSource).map(e=>e.message),expected=JSON.parse(fs.readFileSync(path.join(out,'real-script-sources.json'),'utf8')).samples.map(s=>s.clean);
  assert.deepEqual(rendered.map(m=>m.hookSource),expected);assert.equal(reader.lastLine,expected.at(-1));assert.equal(reader.immersion.currentText,expected.at(-1));assert.deepEqual(reader.pendingLines.map(l=>l.text),expected);
  const seq=h.state.hookSequence;stdout.write(JSON.stringify({...sourceRows[0],origin:'history'})+'\n');await new Promise(r=>setTimeout(r,20));assert.equal(h.state.hookSequence,seq);
  assert.equal(O.revoke(grant),true);assert.equal(h.state.hookSource,'');const revokedSequence=h.state.hookSequence;assert.equal(revokedSequence,seq+1);stdout.write(JSON.stringify(sourceRows[0])+'\n');h.emitSource('失効後の偽本文です。',D.ORIGIN);await new Promise(r=>setTimeout(r,20));assert.equal(h.state.hookSequence,revokedSequence);
  const receipt={ownerApiSHA256:crypto.createHash('sha256').update(rawOwner).digest('hex'),hookNativeSHA256:crypto.createHash('sha256').update(rawHook).digest('hex'),opaqueGrant:true,exactFilesVerified:entry.files.map(f=>f.path),realLINReferenceCount:4,hookSourceCount:rendered.length,readerLines:rendered,readerServiceReached:true,readerImmersionReached:true,historyRejected:true,withdrawalRejected:true,withdrawalClearsOwnSource:true,missingAuthorityRejected:true,actualGameStarted:false,gameplayAccepted:false,sharedSourceWritten:false};write(path.join(out,'root-owner-replay.json'),receipt);return receipt;
 }finally{if(h)await h.stop();if(grant)O.revoke(grant);for(const k of envNames){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}}
}
module.exports={run};
if(require.main===module){const [owner,hook,out]=process.argv.slice(2);if(!owner||!hook||!out)throw Error('usage: danganronpa-owner-replay.cjs <root owner-tests.cjs> <root hook-native.cjs> <private evidence directory>');run(owner,hook,out).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1;});}
