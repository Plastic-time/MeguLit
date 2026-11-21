// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const {HookNative}=require('../core/hook-native.cjs'),{UnityTextPath}=require('../core/text-paths-unity.cjs');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'source-stop-joint-')),s=new UnityTextPath({sourceOnly:true}),sock=Object.assign(new EventEmitter(),{destroyed:false,closed:false,setEncoding(){},setNoDelay(){},write(){return true;},end(){},destroy(){this.destroyed=true;}});
 s.accept(sock);const h=new HookNative({native:root,hook:root,logs:root},()=>{},()=>{throw Error('NO_NATIVE_SPAWN');});h.trace=()=>{};h.textPath=s;
 t.after(async()=>{sock.closed=true;sock.emit('close');await h.stop();fs.rmSync(root,{recursive:true,force:true});});return {s,sock,h};
}
test('shared HookNative stop joins the actual IL2CPP session socket close with no stored hook grant',async t=>{
 const {s,sock,h}=fixture(t);assert.equal(h.ownerTestGrant,undefined);let done=false;const result=h.stop(false).then(()=>done=true);assert.equal(s.stopped,true);assert.equal(s.il2cpp.stopped,true);await new Promise(r=>setImmediate(r));assert.equal(done,false);sock.closed=true;sock.emit('close');await result;assert.equal(done,true);
});
test('an IL2CPP close timeout keeps the resource and can retry after its actual close event',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {s,sock,h}=fixture(t);const failed=assert.rejects(h.stop(false),{code:'READER_STOP_INCOMPLETE'});t.mock.timers.tick(2000);await failed;assert.equal(h.textPath,s);assert.equal(s.stopped,true);sock.closed=true;sock.emit('close');await h.stop(false);assert.equal(h.stopError,null);assert.equal(s.stopped,true);
});
