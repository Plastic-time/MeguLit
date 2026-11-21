// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {UnityTextPath}=require('../core/text-paths-unity.cjs'),{HookNative}=require('../core/hook-native.cjs');
const {attach}=require('../core/text-paths-launch.cjs'),{PREFIX,SHA}=require('../core/unity-kemco-source.cjs');
const owner={pid:42,started:'638000000000000000'},text='実際の本文を受け取ります。';
const packet=(p,n=1)=>PREFIX+[p.kemco.scope,n,1,'full',SHA,owner.pid,owner.started,Buffer.from(text).toString('base64')].join('\t');
function rig(source){const p=new UnityTextPath(),hook={target:{...owner},state:{hookSequence:0},attachTextPath(s){this.textPath=s;},source(m){if(source)return source.call(this,m);Object.assign(this.state,{hookSequence:this.state.hookSequence+1,hookSource:m.text,hookSourceOrigin:m.origin});}};attach({path:'unity',session:p},hook);p.drawConfig({kemcoSprites:true});return {p,hook};}
test('production attach acknowledges only a new accepted source on the currently bound Unity session',()=>{
 const {p,hook}=rig();p.line(packet(p));assert.equal(hook.state.hookSource,text);assert.equal(p.blockSource({},owner),true);
 hook.textPath={};p.line(packet(p,2).replace('\t1\tfull','\t2\tfull'));assert.equal(p.blockSource({},owner),false);
});
test('old target, reused PID, stopped hooks and non-Unity paths cannot acquire source authority',()=>{
 for(const change of [h=>h.target={pid:41,started:owner.started},h=>h.target={...owner,started:'638000000000000001'},h=>h.disposed=true,h=>h.stopPending=Promise.resolve(),h=>h.stopError=Error('STOP')]){const {p,hook}=rig();change(hook);p.line(packet(p));assert.equal(p.kemco.current,null);assert.equal(hook.state.hookSequence,0);}
 const {p,hook}=rig();attach({path:'web',session:p},hook);p.line(packet(p));assert.equal(p.kemco.current,null);
});
test('duplicate prior receipts, origin mismatches, transformed text and reentrant rebinding do not grant a lease',()=>{
 const sources=[function(){},function(m){Object.assign(this.state,{hookSequence:1,hookSource:m.text,hookSourceOrigin:'live'});},function(m){Object.assign(this.state,{hookSequence:1,hookSource:m.text+'別',hookSourceOrigin:m.origin});},function(m){Object.assign(this.state,{hookSequence:1,hookSource:m.text,hookSourceOrigin:m.origin});this.target={pid:43,started:owner.started};}];
 for(const source of sources){const {p,hook}=rig(source);Object.assign(hook.state,{hookSource:text,hookSourceOrigin:'unity-kemco'});p.line(packet(p));assert.equal(p.kemco.current,null);}
});
test('actual HookNative source gate rejects late private copies and preserves ordinary fallback after a binding change',()=>{
 const {p}=rig();p.line(packet(p));const message={text,sourceName:'textrender'};
 const h=Object.assign(Object.create(HookNative.prototype),{target:{...owner},textPath:p,gamePid(){throw Error('NORMAL_FALLBACK');}});
 assert.doesNotThrow(()=>h.source(message));
 const old=p.kemco.current.token;let tagged;const capture=new UnityTextPath({onSource:m=>{tagged=m;return true;}});capture.drawConfig({kemcoSprites:true});capture.line(packet(capture));
 assert.ok(old);h.textPath=null;assert.doesNotThrow(()=>h.source({...tagged,sourceName:'textrender'}));
 assert.throws(()=>h.source(message),/NORMAL_FALLBACK/);h.textPath=p;h.target={pid:43,started:owner.started};assert.throws(()=>h.source(message),/NORMAL_FALLBACK/);
});
test('merged Unity stop revokes source authority and still waits for its socket to close',async()=>{
 const {EventEmitter}=require('node:events'),{p}=rig();p.line(packet(p));const sock=new EventEmitter();let ended='';sock.end=s=>{ended=s;queueMicrotask(()=>sock.emit('close'));};sock.destroy=()=>{};p.sock=sock;
 const stopped=p.stop();assert.equal(p.kemco.enabled,false);assert.match(ended,/HIDE 0/);await stopped;assert.equal(p.stopped,true);assert.equal(p.blockSource({},owner),false);p.line(packet(p,2));assert.equal(p.kemco.current,null);
});
