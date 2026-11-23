// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {HookNative}=require('../core/hook-native.cjs'),Profiles=require('../core/profiles/index.cjs');

function bridge(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nexas-normal-')),events=[],child=new EventEmitter();
 for(const name of ['HookBridge.exe','LunaHost64.dll','LunaHook32.dll','LunaHook64.dll'])fs.writeFileSync(path.join(root,name),'synthetic component, never executed');
 child.stdout=new PassThrough();child.stdin=new PassThrough();child.pid=undefined;
 const h=new HookNative({native:root,hook:root,logs:root},m=>events.push(m),()=>child,()=>100000);
 h.trace=()=>{};h.drawSync=()=>{};
 t.mock.method(HookNative,'syncShippedHook',()=>{});t.mock.method(HookNative,'fetchRuntimeDump',()=>{});
 h.profile=Profiles.profileFor({engine:'nexas'});h.preferences={hookProfile:'read'};h.wanted=true;
 h.start({pid:123,hwnd:'123',name:'BaldrForce.exe',started:'1795280000000'});
 t.after(async()=>{child.stdout.end();h.process=null;await h.stop();fs.rmSync(root,{recursive:true,force:true});});
 return {h,events,send:async m=>{child.stdout.write(JSON.stringify(m)+'\n');await new Promise(r=>setImmediate(r));}};
}

test('ordinary NeXAS bridge JSON reaches the actual HookNative source consumer without an advanced grant',async t=>{
 const {h,events,send}=bridge(t),text='「これは合成した台詞の確認です」';
 await send({type:'hookSource',sourceName:'NeXAS',sourceCode:'HB0@1234',text,hookActive:true});
 assert.equal(h.state.hookSource,text);assert.equal(h.state.hookSequence,1);assert.equal(h.state.hookSourceOrigin,'live');
 assert.equal(h.ownerTestGrant,undefined);assert.equal(h.state.replacementState,'unverified');
 assert.ok(events.some(m=>m.receivedText===true&&m.hookSource===text));
 assert.ok(events.every(m=>!m.hidden&&m.type!=='hookChars'),'source receipt is not a drawing or hiding acknowledgement');
});

test('ordinary name and dialogue messages retain the generic speaker contract',async t=>{
 const {h,send}=bridge(t);await send({type:'hookName',text:'【試験者】'});
 await send({type:'hookSource',sourceName:'NeXAS_1',sourceCode:'HS0@1234',text:'「名前と台詞を別に確認しています」',hookActive:true});
 assert.equal(h.state.hookSpeaker,'試験者');assert.equal(h.state.hookSource,'「名前と台詞を別に確認しています」');
});

test('the normal bridge input limit still rejects oversized NeXAS records',async t=>{
 const {h,send}=bridge(t);await send({type:'hookSource',sourceName:'NeXAS',text:'あ'.repeat(4001)});
 assert.equal(h.state.receivedText,false);assert.equal(h.state.hookSource,null);assert.equal(h.state.hookSequence,undefined);
});

test('a library engine name does not enable an advanced draw path or require a special launch session',async()=>{
 const p=Profiles.profileFor({engine:'NeXAS'});assert.equal(p.engine,'nexas');
 assert.deepEqual(p.draw,Profiles.profileFor({engine:'unknown'}).draw,'engine metadata must not change the kernel draw defaults');
 for(const key of ['roles','majiroInput','advhdInput','minoriInput','kemcoSprites','spikechunsoftInput'])assert.notEqual(p.draw?.[key],true,key+' must not be inferred from the engine name');
 assert.equal(await require('../core/text-paths-launch.cjs').prepare({root:os.tmpdir(),exe:path.join(os.tmpdir(),'BaldrForce.exe'),profile:p,enabled:false}),null);
});
