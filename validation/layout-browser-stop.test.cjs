'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');

async function layoutBrowser(t,{refuseClose=false}={}){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-cdp-stop-'));
 t.after(()=>fs.rmSync(profile,{recursive:true,force:true}));
 fs.writeFileSync(path.join(profile,'DevToolsActivePort'),'12345\n');
 const original=process.env.MEGULIT_EDGE;process.env.MEGULIT_EDGE=process.execPath;
 t.after(()=>{if(original==null)delete process.env.MEGULIT_EDGE;else process.env.MEGULIT_EDGE=original;});
 const child={killed:false,kill(){this.killed=true;return true;}};
 t.mock.method(cp,'spawn',()=>child);
 t.mock.method(globalThis,'fetch',async()=>({json:async()=>[{type:'page',webSocketDebuggerUrl:'ws://127.0.0.1:12345/page'}]}));
 let socket;const methods=[];
 class Socket extends EventTarget{
  constructor(){super();socket=this;this.readyState=1;queueMicrotask(()=>this.onopen());}
  send(raw){
   const {id,method}=JSON.parse(raw);methods.push(method);
   if(method==='Browser.close'){if(refuseClose)throw Error('socket lost');return;}
   queueMicrotask(()=>this.onmessage({data:JSON.stringify({id,result:{}})}));
  }
  close(){this.readyState=3;this.onclose?.();this.dispatchEvent(new Event('close'));}
 }
 const prior=globalThis.WebSocket;globalThis.WebSocket=Socket;t.after(()=>{globalThis.WebSocket=prior;});
 const file=require.resolve('./library-views-perf.cjs');delete require.cache[file];
 const browser=await require(file).startEdge(profile);
 return {browser,child,methods,socket};
}

test('stopping a layout test closes its browser even if the launcher has exited',async t=>{
 const {browser,child,methods,socket}=await layoutBrowser(t);
 const done=browser.stop(),again=browser.stop();
 assert.equal(methods.filter(m=>m==='Browser.close').length,1);
 assert.equal(done,again);
 let stopped=false;done.then(()=>{stopped=true;});await Promise.resolve();assert.equal(stopped,false);
 socket.close();await done;assert.equal(stopped,true);assert.equal(child.killed,false);
});

test('stopping still releases the launcher if the browser channel cannot send',async t=>{
 const {browser,methods,child}=await layoutBrowser(t,{refuseClose:true});
 await browser.stop();assert.ok(methods.includes('Browser.close'));assert.equal(child.killed,true);
});

test('an unresponsive browser cannot hold teardown open',async t=>{
 const {browser,child}=await layoutBrowser(t);
 t.mock.timers.enable({apis:['setTimeout']});
 const done=browser.stop();assert.equal(child.killed,false);
 t.mock.timers.tick(3000);await done;assert.equal(child.killed,true);
});
