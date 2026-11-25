'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const wait=async(m,phase)=>{for(let i=0;i<100;i++){if(m.status().phase===phase)return;await new Promise(r=>setTimeout(r,20));}};
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'anki-inst-'));
 const appdata=process.env.APPDATA;process.env.APPDATA=root;
 t.after(()=>{if(appdata===undefined)delete process.env.APPDATA;else process.env.APPDATA=appdata;fs.rmSync(root,{recursive:true,force:true});});
 fs.mkdirSync(path.join(root,'logs'));
 fs.mkdirSync(path.join(root,'Anki2','addons21','2055492159'),{recursive:true});
 delete require.cache[require.resolve('../core/anki-installer.cjs')];
 return {root,m:require('../core/anki-installer.cjs')};
}
test('one-click Anki: an existing Anki skips the download; a download that fails the checksum is never installed',async t=>{
 const {root,m}=fixture(t);
 assert.equal(m.PACKAGE.size,201621504);assert.match(m.SOURCES[0],/^https:\/\/dl\.megulit\.com\/files\/anki\//);assert.match(m.SOURCES[1],/^https:\/\/cn-dl\.megulit\.com\/files\/anki\//);assert.match(m.SOURCES[2],/^https:\/\/github\.com\/ankitects\/anki\/releases\/download\//);
 let fetched=0;m.start(root,{find:()=>'C:\Anki\anki.exe',fetcher:async()=>{fetched++;throw Error('no');}});await wait(m,'done');
 assert.equal(m.status().phase,'done');assert.equal(fetched,0,'installed already: nothing downloaded');
 const bad=()=>new Response(new Uint8Array(1024));m.start(root,{find:()=>'',fetcher:async()=>bad()});await wait(m,'error');
 assert.equal(m.status().phase,'error');assert.match(m.status().error,/ANKI_DOWNLOAD_FAILED/);
 assert.equal(fs.existsSync(path.join(root,'data','cache','anki-installer',m.PACKAGE.name)),false,'a wrong file is never kept');
});
test('one-click Anki reports a connection failure and lets the installed app connect on retry',async t=>{
 const {root,m}=fixture(t);
 const {Anki}=require('../core/anki.cjs');
 const actions=[];
 let ready=false,downloads=0;
 const anki=new Anki(async(_url,{body})=>{
  actions.push(JSON.parse(body).action);
  return ready?Response.json({result:6,error:null}):new Response(null,{status:503});
 });
 const runtime={ankiProcess:()=>({start:async()=>{
  await anki.call({},'version').catch(()=>{throw Error('ANKI_OFFLINE');});
 }})};
 const options={runtime,find:()=>'anki.exe',fetcher:async()=>{downloads++;throw Error('unexpected download');}};
 m.start(root,options);
 await wait(m,'error');
 assert.equal(m.status().phase,'error');
 assert.equal(m.status().error,'ANKI_OFFLINE');
 ready=true;
 m.start(root,options);
 await wait(m,'done');
 assert.equal(m.status().phase,'done');
 assert.equal(m.status().error,'');
 assert.deepEqual(actions,['version','version']);
 assert.equal(downloads,0);
});

for(const scenario of [
 {name:'picks the MeguLit drive off the system drive',sameDrive:false,code:0},
 {name:'keeps the MSI default on the system drive',sameDrive:true,code:0},
 {name:'reports an MSI failure without falling back to the system drive',sameDrive:false,code:1603},
]){
 test('one-click Anki '+scenario.name,{skip:process.platform!=='win32'},async t=>{
  const {EventEmitter}=require('node:events'),calls=[];
  let installed=false;
  t.mock.method(require('node:child_process'),'spawn',(exe,args)=>{
   calls.push({exe,args});
   const child=new EventEmitter();
   queueMicrotask(()=>{installed=scenario.code===0;child.emit('exit',scenario.code);});
   return child;
  });
  t.mock.method(require('../core/fast-download.cjs'),'download',async()=>{});
  const {root,m}=fixture(t),drive=path.parse(root).root.slice(0,2);
  const systemDrive=process.env.SystemDrive;
  t.after(()=>{if(systemDrive===undefined)delete process.env.SystemDrive;else process.env.SystemDrive=systemDrive;});
  process.env.SystemDrive=scenario.sameDrive?drive.toLowerCase():(drive.toUpperCase()==='C:'?'D:':'C:');
  m.start(root,{find:()=>installed?path.join(drive+'\\','Anki','anki.exe'):'',china:false});
  await wait(m,scenario.code?'error':'done');
  const expected=['/i',path.join(root,'data','cache','anki-installer',m.PACKAGE.name),'/passive','/norestart'];
  if(!scenario.sameDrive)expected.push('INSTALLFOLDER='+path.win32.join(drive+'\\','Anki'));
  assert.equal(m.status().phase,scenario.code?'error':'done');
  assert.equal(m.status().error,scenario.code?'ANKI_INSTALL_FAILED 1603':'');
  assert.equal(calls.length,1);
  assert.equal(path.basename(calls[0].exe),'msiexec.exe');
  assert.deepEqual(calls[0].args,expected);
 });
}
