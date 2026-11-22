// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {WebTextPath}=require('../core/text-paths-web.cjs');
const {BOOTSTRAP}=require('../core/cdp-report.cjs');
function socketFixture(t,{legacy=false,denied=false,rejected=false}={}){
 const sockets=[],calls=[],old=global.WebSocket;
 class Socket{
  constructor(){sockets.push(this);this.resetDocument();queueMicrotask(()=>this.onopen());}
  resetDocument(){this.ctx={document:{documentElement:null,addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];}},setInterval(){return 1;},clearInterval(){},setTimeout(){return 1;},clearTimeout(){}};this.ctx.window=this.ctx;vm.createContext(this.ctx);}
  send(raw){const m=JSON.parse(raw);calls.push(m);let result={},error;
   if(m.method==='Runtime.addBinding'){
    if(denied)error={code:-32000,message:'Access denied'};
    else if(legacy)error={code:-32601,message:"'Runtime.addBinding' wasn't found"};
    else this.ctx.__megulitReport=payload=>this.onmessage({data:JSON.stringify({method:'Runtime.bindingCalled',params:{name:'__megulitReport',payload}})});
   }else if(m.method==='Page.addScriptToEvaluateOnNewDocument'){
    if(legacy)error={code:-32601,message:"'Page.addScriptToEvaluateOnNewDocument' wasn't found"};
    else result={identifier:'script-'+m.id};
   }else if(m.method==='Runtime.evaluate'){
    try{result=rejected?{wasThrown:true,result:{description:'legacy script failed'}}:{result:{value:vm.runInContext(m.params.expression,this.ctx)}};}
    catch(e){result={wasThrown:true,result:{description:e.message}};}
   }
   queueMicrotask(()=>this.onmessage({data:JSON.stringify({id:m.id,result,error})}));
  }
  close(){queueMicrotask(()=>this.onclose());}
 }
 global.WebSocket=Socket;t.after(()=>{global.WebSocket=old;});return {sockets,calls};
}
test('Chrome 41 missing methods use bounded reporting and install acknowledgement, then stop restores',async t=>{
 const f=socketFixture(t,{legacy:true}),status=[],p=new WebTextPath({port:1,onStatus:s=>status.push(s)});t.after(()=>p.stop());
 await p.attachPage({id:'page',webSocketDebuggerUrl:'ws://fixture'});
 assert.equal(p.pages.size,1);assert.ok(status.includes('ok'));assert.equal(f.sockets[0].ctx.__megulitRpgm.state().patched,false);
 assert.equal(vm.runInContext('typeof Array.from',f.sockets[0].ctx),'function','host fallback does not replace page built-ins');
 await p.stop();assert.equal(p.pages.size,0);assert.equal(f.calls.filter(m=>m.method==='Page.removeScriptToEvaluateOnNewDocument').length,0);
});
test('modern CDP retains bindings and removes each registered preload only after restoration',async t=>{
 const f=socketFixture(t),status=[],p=new WebTextPath({port:1,onStatus:s=>status.push(s)});t.after(()=>p.stop());
 await p.attachPage({id:'page',webSocketDebuggerUrl:'ws://fixture'});assert.ok(status.includes('ok'));assert.equal(p.pages.size,1);
 await p.stop();const removes=f.calls.filter(m=>m.method==='Page.removeScriptToEvaluateOnNewDocument');assert.equal(removes.length,2);
 assert.ok(f.calls.findIndex(m=>m.method==='Runtime.evaluate'&&m.params.expression.includes('__megulitText.stop'))<f.calls.indexOf(removes[0]));
});
test('binding access denial never selects legacy fallback or marks a page ready',async t=>{
 const f=socketFixture(t,{denied:true}),p=new WebTextPath({port:1});t.after(()=>p.stop());
 await assert.rejects(p.attachPage({id:'p',webSocketDebuggerUrl:'ws://fixture'}),/Access denied/);assert.equal(p.pages.size,0);assert.equal(f.calls.some(m=>m.method==='Runtime.evaluate'),false);
});
test('legacy wasThrown refuses readiness and closes the failed connection',async t=>{
 const f=socketFixture(t,{legacy:true,rejected:true}),p=new WebTextPath({port:1});t.after(()=>p.stop());
 await assert.rejects(p.attachPage({id:'p',webSocketDebuggerUrl:'ws://fixture'}),/CDP_SCRIPT_REJECTED/);await new Promise(r=>setImmediate(r));assert.equal(p.pages.size,0);assert.equal(p.connections.size,0);assert.ok(f.calls.some(m=>m.method==='Runtime.evaluate'));
});
test('legacy restoration wasThrown propagates incomplete stop instead of claiming acknowledgement',async()=>{
 const p=new WebTextPath({port:1});let closed=false;p.pages.set('p',{send:async()=>({wasThrown:true}),close(){closed=true;}});
 await assert.rejects(p.stop(),/READER_STOP_INCOMPLETE/);assert.equal(closed,true);assert.equal(p.pages.size,0);
});
test('legacy reload reinstalls its missing document hooks while roles and embedding stay off',async t=>{
 const f=socketFixture(t,{legacy:true}),status=[],p=new WebTextPath({port:1,onStatus:s=>status.push(s)});t.after(()=>p.stop());
 await p.attachPage({id:'p',webSocketDebuggerUrl:'ws://fixture'});const socket=f.sockets[0];
 socket.resetDocument();
 socket.onmessage({data:JSON.stringify({method:'Runtime.executionContextCreated',params:{context:{id:2}}})});
 await new Promise(r=>setTimeout(r,400));assert.equal(status.filter(s=>s==='ok').length,2,JSON.stringify(status));assert.equal(socket.ctx.__megulitRpgm.state().patched,false);assert.equal(p.pages.size,1);
});
test('legacy report overflow clears its bounded queue and restores rendering',()=>{
 const restored=[],ctx={__megulitText:{hide:on=>restored.push(['hide',on])},__megulitRpgm:{config:cfg=>restored.push(['config',cfg])}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(BOOTSTRAP,ctx);
 for(let i=0;i<257;i++)ctx.__megulitReport(JSON.stringify({text:'line '+i}));
 const batch=JSON.parse(ctx.__megulitCdpTake());assert.equal(batch.length,1);assert.match(JSON.parse(batch[0]).status,/queue exceeded/);assert.equal(restored[0][1],false);assert.equal(restored[1][1].roles,false);assert.equal(restored[1][1].embed,false);assert.equal(ctx.__megulitCdpTake(),'[]');
 ctx.__megulitReport('x'.repeat(262145));assert.equal(JSON.parse(ctx.__megulitCdpTake()).length,1);
});
