// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{UnityKemcoSource,PREFIX,SHA}=require('../core/unity-kemco-source.cjs');
const packet=(s,seq,page=1,kind='full',text='試験の本文です。',sha=SHA)=>PREFIX+[s,seq,page,kind,sha,Buffer.from(text).toString('base64')].join('\t');
function rig(ack=()=>true){let clock=10,nonce=0;const out=[];const h=new UnityKemcoSource({now:()=>clock,scope:()=>String(++nonce).padStart(32,'0'),onSource:m=>{out.push(m);return ack(m,h);}});return {h,out,time:n=>clock=n};}
test('default off, full source, metadata-only roles and bounded ownership lifetime remain distinct',()=>{
 const {h,out,time}=rig();assert.equal(h.command(),'');assert.equal(h.accept(packet('0'.repeat(32),1)),true);assert.equal(out.length,0);assert.equal(h.block({}),false);
 h.configure(true);const scope=h.scope;assert.match(h.command(),/^KEMCO [a-f0-9]{32}\n$/);
 assert.equal(h.accept('ToMe_CHARS engine=unity'),false);h.accept(packet(scope,1));assert.equal(out.length,1);
 assert.equal(h.block(out[0]),false);assert.equal(h.block({...out[0],text:'試験の本文です。'}),false,'internal spread preserves private authority');
 assert.equal(h.block({text:'日',sourceCode:'TextMesh:JIT:UNITY',unityBoxed:true}),true,'previously queued native callback cannot replace the full body');
 assert.equal(h.block({...JSON.parse(JSON.stringify(out[0]))}),true,'serialized origin label is not authority');
 time(400);h.accept(packet(scope,2));assert.equal(out.length,1,'same page full heartbeat only refreshes lease');time(899);assert.equal(h.block({}),true);time(900);assert.equal(h.block({}),false,'500ms exact boundary releases original route');assert.equal(h.block(out[0]),true,'expired owned callbacks never become ordinary sources');
});
test('pending/gone/new page/reordered delivery/off-on/reconnect cannot reuse an old source occurrence',()=>{
 const {h,out}=rig();h.configure(true);const first=h.scope;h.accept(packet(first,1));const old=out[0];
 h.accept(packet(first,2,2,'pending',''));assert.equal(h.block({}),false);assert.equal(h.block(old),true);
 h.accept(packet(first,3,2));assert.equal(out.length,2);h.accept(packet(first,2,1));assert.equal(out.length,2,'old sequence ignored');assert.equal(h.current.page,2);
 h.accept(packet(first,4,0,'gone',''));assert.equal(h.block({}),false);
 h.accept(packet(first,5,3));h.configure(false);assert.equal(h.block({}),false);h.configure(true);assert.notEqual(h.scope,first);h.accept(packet(first,6,4));assert.equal(h.current,null);
 h.accept(packet(h.scope,1,4));const beforeReconnect=h.scope;h.reconnect();assert.notEqual(h.scope,beforeReconnect);assert.equal(h.block({}),false);h.accept(packet(beforeReconnect,2,4));assert.equal(h.current,null);
 h.configure('true');assert.equal(h.enabled,false);assert.equal(h.block(out.at(-1)),true);
});
test('source handler must confirm actual source acceptance; permission changes during callback win',()=>{
 for(const ack of [()=>false,()=>undefined,()=>{throw Error('SOURCE_REJECTED');}]){const {h,out}=rig(ack);h.configure(true);h.accept(packet(h.scope,1));assert.equal(out.length,1);assert.equal(h.current,null);assert.equal(h.block({}),false);assert.equal(h.block(out[0]),true);}
 const {h}=rig((_m,owner)=>{owner.configure(false);return true;});h.configure(true);h.accept(packet(h.scope,1));assert.equal(h.enabled,false);assert.equal(h.current,null);
});
test('corrupt same-scope provenance, invalid UTF-8, scalar/count limits and metadata claims fail closed',()=>{
 const mutations=[
  s=>packet(s,2,1,'full','本文です。','0'.repeat(64)),s=>packet(s,2,0),s=>packet(s,2,2147483648),s=>packet(s,2,1,'maybe'),s=>packet(s,2,1,'pending','not empty'),s=>packet(s,2,1,'gone',''),
  s=>packet(s,2,1,'full','日'.repeat(2049)),s=>packet(s,2,1,'full','\n'.repeat(32)+'日'),s=>packet(s,2,1,'full','本\u0085文'),s=>packet(s,2,1,'full',''),
  s=>PREFIX+[s,2,1,'full',SHA,'/w=='].join('\t'),s=>PREFIX+[s,2,1,'full',SHA,'YQ='].join('\t'),s=>PREFIX+[s,2,'01','full',SHA,'YQ=='].join('\t'),s=>packet(s,2)+'\tjunk',s=>PREFIX+s+'\t'+'x'.repeat(12001),
 ];
 for(const mutate of mutations){const {h}=rig();h.configure(true);h.accept(packet(h.scope,1));assert.equal(h.block({}),true);h.accept(mutate(h.scope));assert.equal(h.block({}),false);}
 const {h,out,time}=rig();h.configure(true);h.accept(packet(h.scope,1,1,'full','\ufeff本文です。'));assert.equal(out[0].text[0],'\ufeff','UTF-8 BOM scalar preserved, not silently stripped');time(9);assert.equal(h.block({}),false,'backwards clock cannot retain authority');
});
test('real Unity transport rotates source scope and stops it without changing default-off control bytes',()=>{
 const {UnityTextPath}=require('../core/text-paths-unity.cjs'),writes=[],out=[];const p=new UnityTextPath({onSource:m=>{out.push(m);return true;}});p.sock={write:s=>writes.push(s),end:s=>writes.push(s)};
 p.drawConfig({});assert.deepEqual(writes,['DRAW roles=0 embed=0 zh=1\n']);p.drawConfig({kemcoSprites:true});const scope=p.kemco.scope;p.line(packet(scope,1));assert.equal(out.length,1);assert.equal(p.blockSource({}),true);
 const prior=writes.length;p.want('試験の本文です。');assert.equal(writes.length,prior+1);assert.doesNotMatch(writes.at(-1),/DRAW|KEMCO/,'a source WANT does not revoke its own permission epoch');
 p.drawConfig({kemcoSprites:false});assert.equal(p.blockSource({}),false);p.line(packet(scope,2));assert.equal(out.length,1);p.stop();
});
