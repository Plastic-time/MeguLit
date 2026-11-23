'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const O=require('../services/japanese-restore-options.cjs'),S=require('../core/profiles/seed.cjs');
test('restore options use the actual executable hash and built-in version only, including column zero',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-jr-option-'));try{
  const exe=path.join(root,'SiglusEngine_Steam.exe'),data=Buffer.from('known-test-version');fs.writeFileSync(exe,data);fs.mkdirSync(path.join(root,'dat'));fs.writeFileSync(path.join(root,'dat','story.dbs'),'candidate');
  const key=crypto.createHash('sha256').update(data).digest('hex');let column=50,seen;
  t.mock.method(S,'versionOf',hash=>{seen=hash;return hash===key?{settings:{source:{siglusDbsNameColumn:column}}}:null;});
  assert.deepEqual(O.forExecutable(exe),{siglusDbsNameColumn:50});assert.equal(seen,key);
  column=0;assert.deepEqual(O.forExecutable(exe),{siglusDbsNameColumn:0});column='50';assert.deepEqual(O.forExecutable(exe),{});
  fs.writeFileSync(exe,'other build with the same name');assert.deepEqual(O.forExecutable(exe),{});assert.throws(()=>O.forExecutable(path.join(root,'missing.exe')),/JAPANESE_RESTORE_IDENTITY_UNVERIFIED/);
 }finally{t.mock.restoreAll();fs.rmSync(root,{recursive:true,force:true});}
});
test('automatic scan and launch pass the same validated restore capability',t=>{
 const A=require('../core/japanese-auto.cjs'),R=require('../services/japanese-auto-run.cjs'),root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-jr-auto-option-'));try{
  const exe=path.join(root,'renamed.exe');fs.writeFileSync(exe,'exact-build');fs.mkdirSync(path.join(root,'dat'));fs.writeFileSync(path.join(root,'dat','story.dbs'),'candidate');const jobs=[],timers=[];
  t.mock.method(S,'versionOf',()=>({settings:{source:{siglusDbsNameColumn:50}}}));t.mock.method(A,'read',()=>({games:{}}));t.mock.method(A,'run',(...args)=>{jobs.push(args);return {done:false};});t.mock.method(A,'selfCheck',()=>({checked:false}));
  t.mock.method(global,'setTimeout',fn=>{timers.push(fn);return {unref(){}};});
  R.considerLibrary(root,[{id:'option-game',executable:exe}]);assert.equal(jobs.length,0);timers.shift()();assert.deepEqual(jobs[0][3].options,{siglusDbsNameColumn:50});
  R.beforeLaunch(root,'option-game',root,()=>{},{siglusDbsNameColumn:50});assert.deepEqual(jobs[1][3].options,{siglusDbsNameColumn:50});
 }finally{t.mock.restoreAll();fs.rmSync(root,{recursive:true,force:true});}
});
test('non-Siglus directories do not hash executables, while candidate identity failures stop safely',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-jr-option-scope-'));try{
  const exe=path.join(root,'not-present.exe');let calls=0;t.mock.method(S,'versionOf',()=>{calls++;return null;});
  assert.deepEqual(O.forExecutable(exe),{});assert.equal(calls,0);
  fs.mkdirSync(path.join(root,'dat'));fs.writeFileSync(path.join(root,'dat','other.txt'),'unrelated');assert.deepEqual(O.forExecutable(exe),{});assert.equal(calls,0);
  fs.writeFileSync(path.join(root,'dat','story.dbs'),'candidate');assert.throws(()=>O.forExecutable(exe),e=>e.message==='JAPANESE_RESTORE_IDENTITY_UNVERIFIED'&&e.detail.includes('ENOENT'));assert.equal(calls,0);
 }finally{t.mock.restoreAll();fs.rmSync(root,{recursive:true,force:true});}
});
test('self-check, user undo and game-close restores preserve column options',t=>{
 const A=require('../core/japanese-auto.cjs'),root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-jr-option-chain-'));try{
  const options={siglusDbsNameColumn:0},seen=[],restore=(dir,opts)=>seen.push([dir,opts]);
  const reset=launch=>fs.writeFileSync(path.join(root,'japanese-auto.json'),JSON.stringify({games:{g:{state:'auto',mode:'files',launch,dir:root,windowAt:1}}}));
  reset('pending');assert.equal(A.selfCheck(root,'g',root,{restore,options}).reverted,true);
  reset('ok');A.undo(root,'g',root,{restore,options});reset('window');assert.equal(A.gameClosed(root,'g',{restore,options,now:20000}).reverted,true);
  assert.deepEqual(seen,Array.from({length:3},()=>[root,options]));
  reset('pending');assert.throws(()=>A.selfCheck(root,'g',root,{options,restore:()=>{throw Error('JAPANESE_REPAIR_BLOCKED');}}),/JAPANESE_REPAIR_BLOCKED/);
 }finally{t.mock.restoreAll();fs.rmSync(root,{recursive:true,force:true});}
});
