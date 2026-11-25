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
  const status=new Runtime(root).readerStatus();
  assert.equal(status.ready,false);
  assert.match(status.error,/^READER_NATIVE_MISSING: HookBridge\.exe, HookInjector32\.exe, HookInjector64\.exe$/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('a pre-existing Windows installation wins over an unrecorded file on the MeguLit drive',t=>{
 const env={SystemDrive:'C:'},root='R:\\Apps\\MeguLit';
 const known='Q:\\Installed Anki\\anki.exe',other='R:\\Anki\\anki.exe';
 const queries=t.mock.method(require('node:child_process'),'execFileSync',(_exe,args)=>
  args[1].includes('App Paths')?'    (Default)    REG_SZ    '+known:'');
 assert.equal(anki.find('',env,file=>file===known||file===other,root),known);
 assert.ok(queries.mock.callCount()>0);
});

test('cold detection finds only the executable recorded after an MSI install',t=>{
 const env={SystemDrive:'C:'},root='R:\\Apps\\MeguLit';
 const folder='R:\\Anki',exe=path.join(folder,'anki.exe'),record=path.join(root,'data','cache','anki-installer','installed-file.json');
 const exists=file=>file===exe;
 t.mock.method(require('node:child_process'),'execFileSync',()=>'');
 const read=fs.readFileSync,lstat=fs.lstatSync,write=fs.writeFileSync;
 let saved='',info={isFile:()=>true,dev:1,ino:20,size:0,mtimeMs:10};
 t.mock.method(fs,'readFileSync',(file,...args)=>file===record?saved:read(file,...args));
 t.mock.method(fs,'writeFileSync',(file,data,...args)=>{if(file===record)saved=data;else write(file,data,...args);});
 t.mock.method(fs,'lstatSync',(file,...args)=>file===exe?info:lstat(file,...args));
 assert.equal(anki.find('',env,exists,root),'','an unrelated placeholder is ignored');
 anki.rememberInstall(root,folder);
 assert.equal(saved,'','an empty executable is never recorded');
 info={...info,size:4096};
 anki.rememberInstall(root,folder);
 assert.equal(anki.find('',env,exists,root),exe,'recorded install survives a cold lookup without its shortcut');
 const configured='U:\\Custom\\anki.exe';
 assert.equal(anki.find(configured,env,file=>file===configured||file===exe,root),configured);
 info={...info,ino:21};
 assert.equal(anki.find('',env,exists,root),'','a stale record does not bless a replacement');
});

test('Anki only derives a target from an absolute drive-letter path',()=>{
 const env={SystemDrive:'C:'};
 for(const root of ['','R:relative',String.raw`\\server\share\MeguLit`,String.raw`\\?\UNC\server\share\MeguLit`,'/opt/MeguLit']){
  assert.equal(anki.driveInstallFolder(root,env),'');
 }
 assert.equal(anki.driveInstallFolder('r:/MeguLit',env),String.raw`r:\Anki`);
 assert.equal(anki.driveInstallFolder(String.raw`\\?\R:\MeguLit`,env),String.raw`R:\Anki`);
 assert.equal(anki.driveInstallFolder(String.raw`C:\MeguLit`,{}),'');
});
