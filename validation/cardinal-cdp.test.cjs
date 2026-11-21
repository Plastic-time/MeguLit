// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{EventEmitter}=require('node:events');
const {Conn,launch}=require('../services/cardinal/cdp.cjs');
class Socket extends EventTarget{
 constructor(){super();queueMicrotask(()=>this.dispatchEvent(new Event('open')));}
 send(){}
 close(){this.dispatchEvent(new Event('close'));}
}
test('real Conn removes a command when WebSocket.send throws synchronously',async()=>{
 class Broken extends Socket{send(){throw Error('send failed');}}
 const conn=new Conn('ws://unit',{WebSocketCtor:Broken,connectMs:30,commandMs:30});await conn.ready;
 await assert.rejects(conn.send('Page.enable'),/send failed/);assert.equal(conn.calls.size,0);conn.close();assert.equal(conn.closed,true);
});
test('real Conn bounds a hung command and rejects all pending commands on close',async()=>{
 const conn=new Conn('ws://unit',{WebSocketCtor:Socket,connectMs:30,commandMs:15});await conn.ready;
 await assert.rejects(conn.send('Runtime.evaluate'),/command timeout/);assert.equal(conn.calls.size,0);
 const pending=Promise.allSettled([conn.send('one'),conn.send('two')]);conn.ws.close();const results=await pending;
 assert.ok(results.every(r=>r.status==='rejected'&&/closed/.test(r.reason.message)));assert.equal(conn.calls.size,0);conn.close();
});
test('a connection closing before open and a never-opening connection settle their ready promises',async()=>{
 class EarlyClose extends EventTarget{constructor(){super();queueMicrotask(()=>this.dispatchEvent(new Event('close')));}close(){}}
 class Hung extends EventTarget{close(){}}
 for(const WebSocketCtor of [EarlyClose,Hung]){
  const conn=new Conn('ws://unit',{WebSocketCtor,connectMs:15});await assert.rejects(conn.ready,/closed|connect timeout/);assert.equal(conn.closed,true);
 }
});
function environment(stage,{exitDelay=0,neverExit=false,cleanupFails=false}={}){
 const child=new EventEmitter();child.pid=123456;child.exitCode=null;
 const state={spawned:0,killed:0,removed:[],made:0,sockets:[],closed:false};const profile=path.resolve('virtual-cardinal-profile');
 const terminate=()=>{state.killed++;if(!neverExit)setTimeout(()=>{child.exitCode=0;state.closed=true;child.emit('close',0);},exitDelay);};child.kill=()=>{terminate();return true;};
 class BrowserSocket extends EventTarget{
  constructor(url){super();this.url=url;state.sockets.push(this);queueMicrotask(()=>{if(stage==='connect-fail'&&!url.includes('/browser/'))this.dispatchEvent(new Event('error'));else if(stage!=='connect-hang')this.dispatchEvent(new Event('open'));});}
  send(data){const m=JSON.parse(data);if(stage==='init-hang'&&!this.url.includes('/browser/'))return;
   if(m.method==='Browser.close'){if(stage==='close-hang')return;queueMicrotask(()=>{child.exitCode=0;state.closed=true;child.emit('close',0);});}
   queueMicrotask(()=>this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(stage==='init-reject'&&!this.url.includes('/browser/')?{id:m.id,error:{message:'injected init failure'}}:{id:m.id,result:{}})})));}
  close(){this.dispatchEvent(new Event('close'));}
 }
 const io={WebSocket:BrowserSocket,
  fs:{mkdtempSync(){state.made++;return profile;},readFileSync(){return stage==='start-fail'?'':'1234\n/devtools/browser/one';},rmSync(dir){state.removed.push(dir);assert.equal(path.resolve(dir),profile);if(cleanupFails)throw Error('profile locked');}},
  spawn(_exe,args,options){state.spawned++;assert.ok(args.includes('--headless=new'));assert.equal(options.windowsHide,true);if(stage==='spawn-throw')throw Error('spawn rejected');return child;},
  spawnSync(_cmd,args,options){assert.ok(args.includes(String(child.pid)));assert.equal(options.windowsHide,true);terminate();return {status:0};},
  fetch:async()=>stage==='target-hang'?new Promise(()=>{}):{json:async()=>[{type:'page',webSocketDebuggerUrl:'ws://unit/page/one'}]},
  sleep:()=>new Promise(r=>setTimeout(r,1))};
 return {io,state,options:{executable:'virtual-edge.exe',timeouts:{startup:15,target:15,connect:15,command:15,init:25,close:15,exit:60,cleanupAttempts:2}}};
}
test('every failure after profile creation kills the spawned process and cleans only its owned profile',async()=>{
 for(const stage of ['spawn-throw','start-fail','target-hang','connect-fail','connect-hang','init-reject','init-hang']){
  const env=environment(stage,{exitDelay:5});await assert.rejects(launch(env.options,env.io),/spawn rejected|CARDINAL_BROWSER|connect|init failure|command timeout|INIT_TIMEOUT/);
  assert.equal(env.state.removed.length,1,stage);assert.equal(env.state.made,1);
  if(stage!=='spawn-throw'){assert.equal(env.state.killed,1,stage);assert.equal(env.state.closed,true,stage+' cleanup awaited child close');}
 }
});
test('a caller-owned profile is preserved when page initialization rejects',async()=>{
 const env=environment('init-reject');await assert.rejects(launch({...env.options,userDataDir:'caller-owned-profile'},env.io),/init failure/);
 assert.equal(env.state.killed,1);assert.equal(env.state.made,0);assert.deepEqual(env.state.removed,[]);
});
test('close is idempotent, bounded after a hung Browser.close, and waits for the child close event',async()=>{
 const env=environment('close-hang',{exitDelay:20});const browser=await launch(env.options,env.io);
 await Promise.all([browser.close(),browser.close()]);assert.equal(env.state.killed,1);assert.equal(env.state.closed,true);assert.equal(env.state.removed.length,1);
});
test('an unclosed process or locked owned profile produces an explicit cleanup failure',async()=>{
 const stuck=environment('init-reject',{neverExit:true});await assert.rejects(launch(stuck.options,stuck.io),/init failure; cleanup: CARDINAL_BROWSER_EXIT_TIMEOUT/);assert.equal(stuck.state.killed,1);
 const locked=environment('init-reject',{cleanupFails:true});await assert.rejects(launch(locked.options,locked.io),/init failure; cleanup: CARDINAL_PROFILE_CLEANUP/);assert.equal(locked.state.removed.length,2);
});
