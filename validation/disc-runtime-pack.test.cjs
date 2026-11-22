'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {RuntimePacks,packSources}=require('../core/runtime-packs.cjs');
const repo=path.join(__dirname,'..'),m=JSON.parse(fs.readFileSync(path.join(repo,'setup/runtime.json'),'utf8')),p=m.packs['disc-mount'];
test('disc pack is optional, versioned and contains both upstream driver entry points plus sources',()=>{
 assert.equal(p.onDemand,true);assert.equal(p.contract,1);assert.equal(p.dest,'runtime/wincdemu');
 for(const name of ['PortableWinCDEmu-4.0.exe','WinCDEmu-4.1.exe','batchmnt.exe','batchmnt64.exe','sources/WinCDEmu-v4.1.zip','sources/cdrtools-3.01a25.tar.bz2'])assert.ok(p.files.includes(name),name);
 assert.match(p.license,/LGPL-3.0/);assert.match(p.sha256,/^[A-F0-9]{64}$/);
 assert.equal(p.urls.length,3);for(const u of p.urls.slice(0,2))assert.ok(u.includes('/files/'+p.sha256.toLowerCase()+'/'));
 const r=new RuntimePacks(repo);r.install=async()=>{};r.download(['disc-mount']);assert.equal(r.jobs['disc-mount'].state,'queued');
});
test('disc sources preserve exact content hash and mirror-first order through fast-download ordering',()=>{
 const fast=require('../core/fast-download.cjs');
 for(const china of [false,true]){
  const urls=packSources('disc-mount',p,{china,mirrors:m.mirrors});
  assert.deepEqual(urls.map(u=>new URL(u).hostname),china?['cn-dl.megulit.com','dl.megulit.com','github.com']:['dl.megulit.com','cn-dl.megulit.com','github.com']);
  assert.deepEqual(fast.orderSources(urls,china),urls);
  assert.equal(urls.length,3);assert.ok(!urls.some(u=>u.includes('/files/runtime-disc-mount-v1.0.0/')));
 }
 assert.ok(packSources('base',m.packs.base,{china:false,mirrors:m.mirrors}).some(u=>u.includes('/files/runtime-v1.0.0/')),'other packs retain existing expansion');
});
test('default/full excludes disc pack; missing installer or source invalidates installed status',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-disc-pack-'));
 try{
  fs.mkdirSync(path.join(root,'setup'));fs.writeFileSync(path.join(root,'setup/runtime.json'),JSON.stringify({packs:{base:{},'disc-mount':p}}));
  const store=new RuntimePacks(root);store.install=async()=>{};store.download([]);await store.running;assert.equal(store.jobs['disc-mount'],undefined);
  const dest=path.join(root,p.dest);for(const f of p.files){const t=path.join(dest,f);fs.mkdirSync(path.dirname(t),{recursive:true});fs.writeFileSync(t,f==='pack.json'?JSON.stringify({contract:1}):'fixture');}
  assert.equal(store.installed('disc-mount'),true);
  for(const f of ['WinCDEmu-4.1.exe','sources/WinCDEmu-v4.1.zip']){fs.unlinkSync(path.join(dest,f));assert.equal(store.installed('disc-mount'),false);fs.writeFileSync(path.join(dest,f),'fixture');}
  fs.writeFileSync(path.join(dest,'pack.json'),JSON.stringify({contract:0}));assert.equal(store.installed('disc-mount'),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
