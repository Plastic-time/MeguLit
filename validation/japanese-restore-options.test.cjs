'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const O=require('../services/japanese-restore-options.cjs'),S=require('../core/profiles/seed.cjs');
test('restore options use the actual executable hash and built-in version only, including column zero',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-jr-option-'));try{
  const exe=path.join(root,'SiglusEngine_Steam.exe'),data=Buffer.from('known-test-version');fs.writeFileSync(exe,data);
  const key=crypto.createHash('sha256').update(data).digest('hex');let column=50,seen;
  t.mock.method(S,'versionOf',hash=>{seen=hash;return hash===key?{settings:{source:{siglusDbsNameColumn:column}}}:null;});
  assert.deepEqual(O.forExecutable(exe),{siglusDbsNameColumn:50});assert.equal(seen,key);
  column=0;assert.deepEqual(O.forExecutable(exe),{siglusDbsNameColumn:0});column='50';assert.deepEqual(O.forExecutable(exe),{});
  fs.writeFileSync(exe,'other build with the same name');assert.deepEqual(O.forExecutable(exe),{});assert.deepEqual(O.forExecutable(path.join(root,'missing.exe')),{});
 }finally{t.mock.restoreAll();fs.rmSync(root,{recursive:true,force:true});}
});
test('automatic scan and launch pass the same validated restore capability',t=>{
 const A=require('../core/japanese-auto.cjs'),R=require('../services/japanese-auto-run.cjs'),root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-jr-auto-option-'));try{
  const exe=path.join(root,'renamed.exe');fs.writeFileSync(exe,'exact-build');const jobs=[],timers=[];
  t.mock.method(S,'versionOf',()=>({settings:{source:{siglusDbsNameColumn:50}}}));t.mock.method(A,'read',()=>({games:{}}));t.mock.method(A,'run',(...args)=>{jobs.push(args);return {done:false};});t.mock.method(A,'selfCheck',()=>({checked:false}));
  t.mock.method(global,'setTimeout',fn=>{timers.push(fn);return {unref(){}};});
  R.considerLibrary(root,[{id:'option-game',executable:exe}]);assert.equal(jobs.length,0);timers.shift()();assert.deepEqual(jobs[0][3].options,{siglusDbsNameColumn:50});
  R.beforeLaunch(root,'option-game',root,()=>{},{siglusDbsNameColumn:50});assert.deepEqual(jobs[1][3].options,{siglusDbsNameColumn:50});
 }finally{t.mock.restoreAll();fs.rmSync(root,{recursive:true,force:true});}
});
