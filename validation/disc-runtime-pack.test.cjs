'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {RuntimePacks,packSources}=require('../core/runtime-packs.cjs');
const {registeredFolders,findClient}=require('../core/disc-tools.cjs');
const repo=path.join(__dirname,'..'),m=JSON.parse(fs.readFileSync(path.join(repo,'setup/runtime.json'),'utf8')),p=m.packs['disc-mount'];
test('disc support downloads only the pinned original Sysprogs installer in all regions',()=>{
 const official='https://github.com/sysprogs/WinCDEmu/releases/download/v4.1/WinCDEmu-4.1.exe';
 assert.equal(p.onDemand,true);assert.equal(p.dest,'runtime/wincdemu');
 assert.deepEqual(p.files,['WinCDEmu-4.1.exe']);assert.match(p.license,/LGPL-3.0/);
 assert.equal(p.size,1576544);assert.equal(p.sha256,'C47763631D20120057766F2F71F781BF958E22712DA4AC933B21DB0D615DC93C');
 for(const china of [false,true])assert.deepEqual(packSources('disc-mount',p,{china,mirrors:m.mirrors}),[official]);
 assert.ok(packSources('base',m.packs.base,{china:false,mirrors:m.mirrors}).some(u=>u.includes('/files/runtime-v1.0.0/')));
});
test('full excludes disc support and old markers cannot substitute for the pinned installer',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-disc-pack-'));
 try{
  fs.mkdirSync(path.join(root,'setup'));fs.writeFileSync(path.join(root,'setup/runtime.json'),JSON.stringify({packs:{base:{},'disc-mount':p}}));
  const store=new RuntimePacks(root);store.install=async()=>{};store.download([]);await store.running;assert.equal(store.jobs['disc-mount'],undefined);
  const dest=path.join(root,p.dest);fs.mkdirSync(dest,{recursive:true});fs.writeFileSync(path.join(dest,'pack.json'),'{"contract":1}');
  fs.writeFileSync(path.join(dest,'batchmnt.exe'),'old marker');
  assert.equal(store.installed('disc-mount'),false);
  fs.writeFileSync(path.join(dest,p.files[0]),Buffer.alloc(p.size));assert.equal(store.installed('disc-mount'),false);
  store.download(['disc-mount']);await store.running;assert.ok(store.jobs['disc-mount']);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('locates custom WinCDEmu installs without executing registry commands or unverified utilities',()=>{
 assert.deepEqual(registeredFolders('    UninstallString    REG_SZ    "D:\\My Tools\\WinCDEmu\\uninstall64.exe" /remove\r\n    InstallLocation    REG_SZ    D:\\My Tools\\WinCDEmu'),['D:\\My Tools\\WinCDEmu','D:\\My Tools\\WinCDEmu']);
 assert.deepEqual(registeredFolders('    InstallLocation    REG_SZ    \\\\example\\share\n    UninstallString    REG_SZ    powershell.exe -Command Write-Host'),[]);
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-disc-client-'));
 try{fs.writeFileSync(path.join(folder,'batchmnt64.exe'),Buffer.alloc(130048));assert.equal(findClient([folder]),'');}
 finally{fs.rmSync(folder,{recursive:true,force:true});}
});
