'use strict';
// Regression tests for the 2026-11-08 support fixes: AnkiConnect detection, Anki cold-path candidates, and the
// reader status naming missing native components.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const anki=require('../core/anki-process.cjs');

test('AnkiConnect is detected by its AnkiWeb code folder',()=>{
 const app=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-anki-'));
 try{
  const env={APPDATA:app};
  assert.equal(anki.ankiConnectInstalled(env),null,'no Anki profile yet');
  fs.mkdirSync(path.join(app,'Anki2','addons21','123'),{recursive:true});
  assert.equal(anki.ankiConnectInstalled(env),false);
  fs.mkdirSync(path.join(app,'Anki2','addons21','2055492159'));
  assert.equal(anki.ankiConnectInstalled(env),true);
 }finally{fs.rmSync(app,{recursive:true,force:true});}
});

test('cold Anki candidates cover other drives and stay absolute paths',()=>{
 const list=anki.coldCandidates({WINDIR:process.env.WINDIR,USERPROFILE:'C:\\Users\\x'});
 assert.ok(list.includes('D:\\Anki\\anki.exe'));
 assert.ok(list.every(p=>path.isAbsolute(p)&&/anki(w)?\.exe$/i.test(p)));
});

test('a reader that never started names quarantined native files',()=>{
 const {Runtime}=require('../services/runtime.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-rt-'));
 try{
  fs.mkdirSync(path.join(root,'native'));fs.writeFileSync(path.join(root,'native','GalWindowBridge.exe'),'');
  const status=Runtime.prototype.readerStatus.call({root,reader:null,readerReady:false,readerError:'',readerPhase:'',readerMissing:Runtime.prototype.readerMissing,readerStatusRaw:Runtime.prototype.readerStatusRaw});
  assert.equal(status.ready,false);
  assert.match(status.error,/^READER_NATIVE_MISSING: HookBridge\.exe, HookInjector32\.exe, HookInjector64\.exe$/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
