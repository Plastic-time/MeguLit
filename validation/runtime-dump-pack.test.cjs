// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {RuntimePacks}=require('../core/runtime-packs.cjs'),dp=require('../services/runtime-dump-pack.cjs');
const mk=pack=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-dump-pack-'));fs.mkdirSync(path.join(root,'setup'));fs.mkdirSync(path.join(root,'native'));
 fs.writeFileSync(path.join(root,'setup','runtime.json'),JSON.stringify({packs:{base:{size:1,urls:['x'],sha256:'a'},...(pack?{dump:pack}:{})}}));return root;};
const P={size:1,silent:true,onDemand:true,dest:'runtime/runtimedump',files:['MeguLitDump32.dll','MeguLitDump64.dll'],sha256:'ab',urls:['https://example.invalid/d.zip']};

test('silent dump pack is hidden from status and not in "download full"',()=>{const root=mk(P),s=new RuntimePacks(root).status();assert.deepEqual(s.packs.map(p=>p.id),['base']);fs.rmSync(root,{recursive:true,force:true});});
test('not published (no sha256) or not in manifest: skipped, nothing thrown',()=>{
 for(const pack of [null,{...P,sha256:''}]){const root=mk(pack);assert.equal(dp.prepare(root),'skipped');fs.rmSync(root,{recursive:true,force:true});}});
test('missing pack starts one silent download; failure is remembered and not retried at once',async()=>{
 const root=mk(P),packs=new RuntimePacks(root);let tries=0;packs.install=async()=>{tries++;throw Error('offline');};dp._failed.clear();
 assert.equal(dp.prepare(root,{packs}),'downloading');await new Promise(r=>setTimeout(r,900));assert.equal(tries,1);
 assert.equal(dp.prepare(root,{packs}),'skipped');assert.equal(tries,1);fs.rmSync(root,{recursive:true,force:true});});
test('installed pack: DLLs are copied next to HookBridge',()=>{
 const root=mk(P),d=path.join(root,'runtime','runtimedump');fs.mkdirSync(d,{recursive:true});fs.mkdirSync(path.join(root,'runtime'),{recursive:true});
 fs.mkdirSync(path.join(root,'runtime'),{recursive:true});fs.writeFileSync(path.join(root,'runtime','node.exe'),'');
 for(const f of dp.DLLS)fs.writeFileSync(path.join(d,f),'dll');
 assert.equal(dp.prepare(root,{packs:new RuntimePacks(root)}),'ready');for(const f of dp.DLLS)assert.ok(fs.existsSync(path.join(root,'native',f)));
 fs.rmSync(root,{recursive:true,force:true});});
