// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{UnityKemcoSource,PREFIX,SHA}=require('../core/unity-kemco-source.cjs');
const OWNER={pid:42,started:'638000000000000000'};
const packet=(s,seq,page=1,kind='full',text='試験の本文です。',sha=SHA,owner=OWNER)=>PREFIX+[s,seq,page,kind,sha,owner.pid,owner.started,Buffer.from(text).toString('base64')].join('\t');
const blocked=(h,m,owner=OWNER)=>h.block(m,owner);
function rig(ack=()=>true){let clock=10,nonce=0;const out=[];const h=new UnityKemcoSource({now:()=>clock,scope:()=>String(++nonce).padStart(32,'0'),onSource:m=>{out.push(m);return ack(m,h);}});return {h,out,time:n=>clock=n};}
test('default off, full source, metadata-only roles and bounded ownership lifetime remain distinct',()=>{
 const {h,out,time}=rig();assert.equal(h.command(),'');assert.equal(h.accept(packet('0'.repeat(32),1)),true);assert.equal(out.length,0);assert.equal(blocked(h,{}),false);
 h.configure(true);const scope=h.scope;assert.match(h.command(),/^KEMCO [a-f0-9]{32}\n$/);
 assert.equal(h.accept('ToMe_CHARS engine=unity'),false);h.accept(packet(scope,1));assert.equal(out.length,1);
 assert.equal(blocked(h,out[0]),false);assert.equal(blocked(h,{...out[0],text:'試験の本文です。'}),false,'internal spread preserves private authority');
 assert.equal(blocked(h,{text:'日',sourceCode:'TextMesh:JIT:UNITY',unityBoxed:true}),true,'previously queued native callback cannot replace the full body');
 assert.equal(blocked(h,{...JSON.parse(JSON.stringify(out[0]))}),true,'serialized origin label is not authority');
 time(400);h.accept(packet(scope,2));assert.equal(out.length,1,'same page full heartbeat only refreshes lease');time(899);assert.equal(blocked(h,{}),true);time(900);assert.equal(blocked(h,{}),false,'500ms exact boundary releases original route');assert.equal(blocked(h,out[0]),true,'expired owned callbacks never become ordinary sources');
});
test('pending/gone/new page/reordered delivery/off-on/reconnect cannot reuse an old source occurrence',()=>{
 const {h,out}=rig();h.configure(true);const first=h.scope;h.accept(packet(first,1));const old=out[0];
 h.accept(packet(first,2,2,'pending',''));assert.equal(blocked(h,{}),false);assert.equal(blocked(h,old),true);
 h.accept(packet(first,3,2));assert.equal(out.length,2);h.accept(packet(first,2,1));assert.equal(out.length,2,'old sequence ignored');assert.equal(h.current.page,2);
 h.accept(packet(first,4,0,'gone',''));assert.equal(blocked(h,{}),false);
 h.accept(packet(first,5,3));h.configure(false);assert.equal(blocked(h,{}),false);h.configure(true);assert.notEqual(h.scope,first);h.accept(packet(first,6,4));assert.equal(h.current,null);
 h.accept(packet(h.scope,1,4));const beforeReconnect=h.scope;h.reconnect();assert.notEqual(h.scope,beforeReconnect);assert.equal(blocked(h,{}),false);h.accept(packet(beforeReconnect,2,4));assert.equal(h.current,null);
 h.configure('true');assert.equal(h.enabled,false);assert.equal(blocked(h,out.at(-1)),true);
});
test('source handler must confirm actual source acceptance; permission changes during callback win',()=>{
 for(const ack of [()=>false,()=>undefined,()=>{throw Error('SOURCE_REJECTED');}]){const {h,out}=rig(ack);h.configure(true);h.accept(packet(h.scope,1));assert.equal(out.length,1);assert.equal(h.current,null);assert.equal(blocked(h,{}),false);assert.equal(blocked(h,out[0]),true);}
 const {h}=rig((_m,owner)=>{owner.configure(false);return true;});h.configure(true);h.accept(packet(h.scope,1));assert.equal(h.enabled,false);assert.equal(h.current,null);
});
test('corrupt same-scope provenance, invalid UTF-8, scalar/count limits and metadata claims fail closed',()=>{
 const mutations=[
  s=>packet(s,2,1,'full','本文です。','0'.repeat(64)),s=>packet(s,2,0),s=>packet(s,2,2147483648),s=>packet(s,2,1,'maybe'),s=>packet(s,2,1,'pending','not empty'),s=>packet(s,2,1,'gone',''),
  s=>packet(s,2,1,'full','日'.repeat(2049)),s=>packet(s,2,1,'full','\n'.repeat(32)+'日'),s=>packet(s,2,1,'full','本\u0085文'),s=>packet(s,2,1,'full',''),
  s=>PREFIX+[s,2,1,'full',SHA,42,OWNER.started,'/w=='].join('\t'),s=>PREFIX+[s,2,1,'full',SHA,42,OWNER.started,'YQ='].join('\t'),s=>PREFIX+[s,2,'01','full',SHA,42,OWNER.started,'YQ=='].join('\t'),s=>packet(s,2)+'\tjunk',s=>PREFIX+s+'\t'+'x'.repeat(12001),
 ];
 for(const mutate of mutations){const {h}=rig();h.configure(true);h.accept(packet(h.scope,1));assert.equal(blocked(h,{}),true);h.accept(mutate(h.scope));assert.equal(blocked(h,{}),false);}
 const {h,out,time}=rig();h.configure(true);h.accept(packet(h.scope,1,1,'full','\ufeff本文です。'));assert.equal(out[0].text[0],'\ufeff','UTF-8 BOM scalar preserved, not silently stripped');time(9);assert.equal(blocked(h,{}),false,'backwards clock cannot retain authority');
});
test('real Unity transport rotates source scope and stops it without changing default-off control bytes',async()=>{
 const {UnityTextPath}=require('../core/text-paths-unity.cjs'),writes=[],out=[];const p=new UnityTextPath({onSource:m=>{out.push(m);return true;}});const sock=new(require('node:events').EventEmitter)();sock.write=s=>writes.push(s);sock.end=s=>{writes.push(s);queueMicrotask(()=>sock.emit('close'));};sock.destroy=()=>{};p.sock=sock;
 p.drawConfig({});assert.deepEqual(writes,['DRAW roles=0 embed=0 zh=1\n']);p.drawConfig({kemcoSprites:true});const scope=p.kemco.scope;p.line(packet(scope,1));assert.equal(out.length,1);assert.equal(p.blockSource({},OWNER),true);
 const prior=writes.length;p.want('試験の本文です。');assert.equal(writes.length,prior+1);assert.doesNotMatch(writes.at(-1),/DRAW|KEMCO/,'a source WANT does not revoke its own permission epoch');
 p.drawConfig({kemcoSprites:false});assert.equal(p.blockSource({},OWNER),false);p.line(packet(scope,2));assert.equal(out.length,1);await p.stop();
});
test('scope generation failure revokes before failure and cannot restore old authority',()=>{
 let count=0;const h=new UnityKemcoSource({scope:()=>{if(++count>1)throw Error('CONTROLLED_RANDOM_FAILURE');return 'a'.repeat(32);},onSource:()=>true});h.configure(true);const old=h.scope;h.accept(packet(old,1));assert.equal(blocked(h,{}),true);
 assert.throws(()=>h.reconnect(),/CONTROLLED_RANDOM_FAILURE/);assert.equal(h.enabled,false);assert.equal(h.scope,'');h.accept(packet(old,2));assert.equal(blocked(h,{}),false);
 const {UnityTextPath}=require('../core/text-paths-unity.cjs'),writes=[],statuses=[],p=new UnityTextPath({onStatus:s=>statuses.push(s)});p.sock={write:s=>writes.push(s)};p.kemco.newScope=()=>{throw Error('CONTROLLED_RANDOM_FAILURE');};assert.doesNotThrow(()=>p.drawConfig({kemcoSprites:true}));assert.equal(p.kemco.enabled,false);assert.equal(p.blockSource({},OWNER),false);assert.equal(writes.length,1);assert.match(statuses[0],/negotiation unavailable/);
});
test('actual packet process identity gates only its current bound game and cannot latch an older target',()=>{
 const {sameOwner}=require('../core/unity-kemco-source.cjs'),oldTarget={pid:41,started:OWNER.started};let target=oldTarget;
 const {h,out}=rig(m=>sameOwner(target,m.unityOwner));h.configure(true);h.accept(packet(h.scope,1));assert.equal(h.current,null,'attach before configure does not accept an unrelated previous game');
 target={...OWNER};h.accept(packet(h.scope,2));assert.equal(out.length,2);assert.equal(blocked(h,{}),true);assert.equal(h.block({}),false,'no current owner argument means no native suppression');assert.equal(h.block(out[1]),true,'no binding cannot pass a tagged source');
 assert.equal(h.block({},oldTarget),false);assert.equal(h.block(out[1],oldTarget),true);const reused={pid:42,started:'638000000000000001'};assert.equal(h.block({},reused),false);assert.equal(h.block(out[1],reused),true);
 h.accept(packet(h.scope,3,1,'full','試験の本文です。',SHA,reused));assert.equal(h.current,null,'a peer cannot change process identity within its scope');
 for(const bad of [{pid:0,started:OWNER.started},{pid:42,started:'0'+OWNER.started},{pid:42,started:'9999999999999999999'}]){h.reconnect();h.accept(packet(h.scope,1,1,'full','試験の本文です。',SHA,bad));assert.equal(h.current,null);}
});
test('late private sources stay rejected after moving to a different engine or removing the text path',()=>{
 const {shouldBlock,isTaggedSource}=require('../core/unity-kemco-source.cjs'),{h,out}=rig();h.configure(true);h.accept(packet(h.scope,1));const owned=out[0],path={blockSource:(m,owner)=>h.block(m,owner)};
 assert.equal(isTaggedSource(owned),true);assert.equal(isTaggedSource(JSON.parse(JSON.stringify(owned))),false);assert.equal(shouldBlock(path,owned,OWNER),false);assert.equal(shouldBlock(path,{text:'日'},OWNER),true);
 assert.equal(shouldBlock(null,{text:'日'},OWNER),false);assert.equal(shouldBlock({},owned,OWNER),true);assert.equal(shouldBlock(null,{...owned,boxBlinkTimedOut:true},OWNER),true);
 const broken={blockSource(){throw Error('CONTROLLED_GATE_FAILURE');}};assert.equal(shouldBlock(broken,owned,OWNER),true);assert.equal(shouldBlock(broken,{text:'日'},OWNER),false,'failed instrumentation does not block the ordinary fallback');
});
