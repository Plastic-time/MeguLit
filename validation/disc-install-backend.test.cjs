// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DiscInstall,selectImage,discoverInstallers,rootsOf,snapshot,argv,discText}=require('../core/disc-install.cjs');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-disc-unit-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const write=(name,data='fixture')=>{const p=path.join(root,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,data);return p;};
 return {root,write};
}
test('select one descriptor when users choose both files',t=>{
 const f=fixture(t);
 for(const [data,descriptor]of [['mdf','mds'],['bin','cue'],['img','ccd']]){
  const image=f.write('disc.'+data),meta=f.write('disc.'+descriptor,descriptor==='cue'?'FILE "disc.bin" BINARY\r\n TRACK 01 MODE1/2352':'metadata');
  assert.equal(selectImage([image,meta]).image,meta);
 }
});
test('standalone image formats and missing companion checks',t=>{
 const f=fixture(t);for(const ext of ['iso','nrg']){const p=f.write('game.'+ext);assert.equal(selectImage([p]).image,p);}
 for(const ext of ['mdf','mds','ccd','bin'])assert.throws(()=>selectImage([f.write('missing_'+ext+'.'+ext)]),{code:'DISC_PAIR_MISSING'});
 assert.throws(()=>selectImage([f.write('one.iso'),f.write('two.iso')]),{code:'DISC_MULTIPLE_IMAGES'});
});
test('cue Japanese filenames support UTF8, CP932 and UTF16 without guessing a different file',t=>{
 const f=fixture(t),target=f.write('テスト.bin');
 const utf8=f.write('a.cue','FILE "テスト.bin" BINARY\n');assert.equal(selectImage([utf8]).image,utf8);
 const cp932=Buffer.concat([Buffer.from('FILE "'),Buffer.from([0x83,0x65,0x83,0x58,0x83,0x67]),Buffer.from('.bin" BINARY\n')]);
 const cue=f.write('b.cue',cp932);assert.equal(selectImage([cue]).image,cue);assert.ok(fs.existsSync(target));
 const u16=f.write('c.cue',Buffer.concat([Buffer.from([255,254]),Buffer.from('FILE "テスト.bin" BINARY\n','utf16le')]));assert.equal(selectImage([u16]).image,u16);
 assert.equal(discText(Buffer.from([254,255,0,65])),'A');
});
test('cue rejects traversal, absolute paths and unbounded metadata',t=>{
 const f=fixture(t);for(const text of ['FILE "../outside.bin" BINARY','FILE "C:\\outside.bin" BINARY','FILE "absent.bin" BINARY','TRACK 01 AUDIO']){
  const p=f.write('bad.cue',text);assert.throws(()=>selectImage([p]));
 }
 assert.throws(()=>selectImage([f.write('huge.cue',Buffer.alloc(65537))]),{code:'DISC_PAIR_MISSING'});
});
test('autorun discovers an executable but disc-supplied silent arguments are discarded',t=>{
 const f=fixture(t),setup=f.write('setup/setup.exe');f.write('autorun.inf','[autorun]\nopen="setup/setup.exe" /silent /S\n');
 assert.deepEqual(discoverInstallers(f.root),[{path:setup,name:path.join('setup','setup.exe'),args:[],source:'autorun'}]);
 assert.equal(argv('"setup.exe" /quiet')[0],'setup.exe');assert.equal(argv('setup.exe & calc.exe'),null);
});
test('autorun shell or traversal is ignored and fallback ignores redists',t=>{
 const f=fixture(t),setup=f.write('install.exe');f.write('cmd.exe');f.write('redist/setup.exe');f.write('autorun.inf','[autorun]\nopen=cmd.exe /c anything\n');
 assert.deepEqual(discoverInstallers(f.root).map(x=>x.path),[setup]);
 f.write('autorun.inf','[autorun]\nopen=../outside.exe\n');assert.deepEqual(discoverInstallers(f.root).map(x=>x.path),[setup]);
});
test('snapshot sees only executable changes and root selection collapses nested directories',t=>{
 const f=fixture(t),exe=f.write('game/run.exe');f.write('save/ignored.exe');f.write('data.bin');
 assert.deepEqual(rootsOf([f.root,path.dirname(exe)]),[f.root]);assert.deepEqual([...snapshot([f.root]).keys()],[exe]);
 assert.throws(()=>rootsOf([path.parse(f.root).root]),{code:'DISC_UNSAFE_PATH'});
});
async function workflow(t,overrides={}){
 const f=fixture(t),image=f.write('game.iso'),mount=path.join(f.root,'mounted');fs.mkdirSync(mount);const installer=f.write('mounted/setup.exe');
 const events=[],deps={status:async()=>({protocolReady:true,driverReady:true}),ensureTools:async()=>{},mount:async()=>({owned:true,deviceId:'fixture-guid',mountRoot:mount}),verifyMount:async()=>true,launch:async i=>{events.push(['launch',i]);return {pid:123};},games:async files=>files.map(executable=>({executable,title:'fixture'})),importGame:async g=>{events.push(['import',g]);return {id:'fixture-game'};},unmount:async()=>events.push(['unmount']),installerRunning:async()=>false,...overrides};
 const flow=new DiscInstall(deps),s=flow.prepare({paths:[image],installRoots:[f.root]});
 const run=async(action,args={})=>{const value=await flow.call({action,id:s.id,...args});await flow.get(s.id).pending;return flow.view(flow.get(s.id));};
 return {...f,image,mount,installer,events,deps,flow,id:s.id,run};
}
test('mount needs consent, launches only returned installer, discovers new game and can unmount',async t=>{
 const w=await workflow(t);
 await assert.rejects(w.run('disc_mount'),{code:'DISC_CONSENT_REQUIRED'});
 assert.equal((await w.run('disc_mount',{consent:true})).state,'ready_to_install');
 await assert.rejects(w.run('disc_install',{installer:w.write('other.exe')}),{code:'DISC_INSTALLER_UNSAFE'});
 assert.equal((await w.run('disc_install',{installer:w.installer})).state,'installing');
 w.write('installed/game.exe');const s=await w.run('disc_scan',{installed:true});assert.equal(s.state,'awaiting_unmount');assert.equal(s.imported.length,1);
 assert.equal((await w.run('disc_finish',{keepMounted:false})).state,'done');assert.equal(w.events.filter(e=>e[0]==='unmount').length,1);
});
test('no changed executables means no automatic library import',async t=>{
 const w=await workflow(t);w.write('old-game.exe');await w.run('disc_mount',{consent:true});await w.run('disc_install',{installer:w.installer});
 const s=await w.run('disc_scan',{installed:true});assert.equal(s.state,'choose_game');assert.equal(s.imported.length,0);assert.ok(s.warnings.includes('DISC_NO_NEW_GAME'));
});
test('unknown or changed mounts are never detached',async t=>{
 const w=await workflow(t,{mount:async()=>({owned:false,deviceId:'unknown',mountRoot:''}),verifyMount:async()=>false});
 const s=await w.run('disc_mount',{consent:true});assert.equal(s.error,'DISC_MOUNT_UNCONFIRMED');assert.equal(s.mountUnconfirmed,true);
 assert.equal((await w.run('disc_finish',{keepMounted:false})).error,'DISC_MOUNT_CHANGED');assert.equal(w.events.length,0);
});
test('running installer prevents unmount, keeping the mounted disc is explicit',async t=>{
 const w=await workflow(t,{installerRunning:async()=>true});await w.run('disc_mount',{consent:true});
 assert.equal((await w.run('disc_finish',{keepMounted:false})).error,'DISC_INSTALLER_RUNNING');assert.equal(w.events.length,0);
 const done=await w.run('disc_finish',{keepMounted:true});assert.equal(done.state,'done');assert.equal(done.keepMounted,true);assert.equal(done.mounted,true);
});
test('first-time driver installation requires separate explicit confirmation',async t=>{
 let installed=false,calls=0;const w=await workflow(t,{status:async()=>({protocolReady:true,driverReady:installed}),installDriver:async()=>{calls++;installed=true;}});
 assert.equal((await w.run('disc_mount',{consent:true})).state,'awaiting_driver');
 await assert.rejects(w.run('disc_driver',{mode:'standard'}),{code:'DISC_CONSENT_REQUIRED'});assert.equal(calls,0);
 assert.equal((await w.run('disc_driver',{confirmed:true,mode:'standard'})).state,'ready_to_mount');assert.equal(calls,1);
 assert.equal((await w.run('disc_mount',{consent:true})).state,'ready_to_install');
});
test('incomplete snapshots cannot silently import a subset',async t=>{
 const w=await workflow(t,{snapshot:()=>{const e=Error('DISC_SCAN_INCOMPLETE');e.code=e.message;throw e;}});
 await w.run('disc_mount',{consent:true});const s=await w.run('disc_install',{installer:w.installer});assert.equal(s.error,'DISC_SCAN_INCOMPLETE');assert.equal(w.events.length,0);
});
