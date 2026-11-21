// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Cardinal's hidden reader host (2026-11-21): a headless Microsoft Edge (Chromium, the engine of the app's WebView2) driven over the
   DevTools protocol with Node's own WebSocket, so the replay runs on a player's PC without Playwright or any download. No window is
   ever shown (--headless), it inherits the replay process's lowered priority, its profile is a temporary folder removed afterwards,
   and close() ends the whole process tree. Only what services/cardinal/driver.cjs needs: request routing (Fetch), a binding the
   page calls (Runtime.addBinding), init scripts, evaluate, console / page errors. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn,spawnSync}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
/* Edge first (every Windows 10/11 has it), then Chrome; MEGULIT_CARDINAL_BROWSER overrides */
function findBrowser(env=process.env){const list=[env.MEGULIT_CARDINAL_BROWSER];
 for(const base of [env['ProgramFiles(x86)'],env.ProgramFiles,env.LOCALAPPDATA].filter(Boolean)){list.push(path.join(base,'Microsoft','Edge','Application','msedge.exe'));list.push(path.join(base,'Google','Chrome','Application','chrome.exe'));}
 return list.find(f=>f&&fs.existsSync(f))||'';}
class Conn{
 constructor(url){this.ws=new WebSocket(url);this.id=0;this.calls=new Map();this.handlers=new Map();this.closed=false;
  this.ready=new Promise((res,rej)=>{this.ws.addEventListener('open',()=>res(),{once:true});this.ws.addEventListener('error',e=>rej(Error('cdp connect failed')),{once:true});});
  this.ws.addEventListener('message',ev=>{let m;try{m=JSON.parse(String(ev.data));}catch{return;}
   if(m.id&&this.calls.has(m.id)){const c=this.calls.get(m.id);this.calls.delete(m.id);m.error?c.rej(Error(m.error.message||'cdp error')):c.res(m.result||{});return;}
   for(const fn of this.handlers.get(m.method)||[])try{fn(m.params||{});}catch{}});
  this.ws.addEventListener('close',()=>{this.closed=true;for(const c of this.calls.values())c.rej(Error('cdp closed'));this.calls.clear();});}
 send(method,params={}){if(this.closed)return Promise.reject(Error('cdp closed'));const id=++this.id;return new Promise((res,rej)=>{this.calls.set(id,{res,rej});this.ws.send(JSON.stringify({id,method,params}));});}
 on(method,fn){if(!this.handlers.has(method))this.handlers.set(method,[]);this.handlers.get(method).push(fn);}
 close(){try{this.ws.close();}catch{}}
}
class Page{
 constructor(conn){this.c=conn;this.bindings=new Map();this.listeners={console:[],pageerror:[],response:[]};this.router=null;this.loaded=null;
  conn.on('Fetch.requestPaused',p=>this.paused(p));
  conn.on('Runtime.bindingCalled',p=>this.binding(p));
  conn.on('Runtime.consoleAPICalled',p=>{const text=(p.args||[]).map(a=>a.value!==undefined?String(a.value):a.description||'').join(' ');for(const fn of this.listeners.console)fn({type:()=>p.type==='warning'?'warning':p.type,text:()=>text});});
  conn.on('Runtime.exceptionThrown',p=>{const d=p.exceptionDetails||{};const e=Error(d.exception?.description||d.text||'page error');for(const fn of this.listeners.pageerror)fn(e);});
  conn.on('Page.loadEventFired',()=>{const l=this.loaded;this.loaded=null;l?.();});}
 on(kind,fn){(this.listeners[kind]||(this.listeners[kind]=[])).push(fn);}
 async init(viewport){await this.c.send('Page.enable');await this.c.send('Runtime.enable');await this.c.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  await this.c.send('Emulation.setDeviceMetricsOverride',{width:viewport.width,height:viewport.height,deviceScaleFactor:1,mobile:false});
  await this.addInitScript(()=>{window.__cdpCalls=new Map();window.__cdpSeq=0;window.__cdpDone=(id,ok,v)=>{const c=window.__cdpCalls.get(id);if(!c)return;window.__cdpCalls.delete(id);ok?c.res(v):c.rej(Error(v));};});}
 /* handler(url, request) -> {status, body, headers} | 'abort' | null (continue) */
 route(handler){this.router=handler;}
 async paused(p){const u=p.request?.url||'';let r=null;try{r=this.router?await this.router(u,p.request):null;}catch{r={status:500,body:''};}
  try{if(r==='abort'){await this.c.send('Fetch.failRequest',{requestId:p.requestId,errorReason:'Aborted'});return;}
   if(r){const body=Buffer.isBuffer(r.body)?r.body:Buffer.from(String(r.body??''));const headers=Object.entries(r.headers||{}).map(([name,value])=>({name,value:String(value)}));
    for(const fn of this.listeners.response)fn({status:()=>r.status||200,url:()=>u});
    await this.c.send('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:r.status||200,responseHeaders:headers,body:body.toString('base64')});return;}
   await this.c.send('Fetch.continueRequest',{requestId:p.requestId});}catch{}}
 async exposeFunction(name,fn){const b='__cdpBinding_'+name;this.bindings.set(b,fn);await this.c.send('Runtime.addBinding',{name:b});
  await this.addInitScript('window['+JSON.stringify(name)+']=(...args)=>new Promise((res,rej)=>{const id=++window.__cdpSeq;window.__cdpCalls.set(id,{res,rej});window['+JSON.stringify(b)+'](JSON.stringify({id,args}));});');}
 async binding(p){const fn=this.bindings.get(p.name);if(!fn)return;let call;try{call=JSON.parse(p.payload);}catch{return;}let ok=true,v;try{v=await fn(...call.args);}catch(e){ok=false;v=String(e&&e.message||e);}
  try{await this.c.send('Runtime.evaluate',{expression:'window.__cdpDone('+call.id+','+ok+','+JSON.stringify(v===undefined?null:v)+')',contextId:p.executionContextId});}catch{}}
 addInitScript(fnOrSource){const source=typeof fnOrSource==='function'?'('+fnOrSource+')();':String(fnOrSource);return this.c.send('Page.addScriptToEvaluateOnNewDocument',{source});}
 async goto(url,timeout=30000){const done=new Promise(res=>{this.loaded=res;});await this.c.send('Page.navigate',{url});await Promise.race([done,sleep(timeout)]);}
 /* fn: a function (called with arg) or an expression string */
 async evaluate(fn,arg){const expression=typeof fn==='function'?'('+fn+')('+(arg===undefined?'':JSON.stringify(arg))+')':String(fn);
  const r=await this.c.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text||'evaluate failed');return r.result?.value;}
 async waitForFunction(fn,arg,{timeout=30000}={}){const until=Date.now()+timeout;for(;;){try{if(await this.evaluate(fn,arg))return true;}catch{}if(Date.now()>until)throw Error('waitForFunction timeout');await sleep(100);}}
 addScriptTag({path:file}){return this.evaluate(fs.readFileSync(file,'utf8')+'\n;true');}
}
/* -> {page, close()} */
async function launch({executable=findBrowser(),viewport={width:1920,height:1080},userDataDir}={}){if(!executable)throw Error('CARDINAL_NO_BROWSER');
 const dir=userDataDir||fs.mkdtempSync(path.join(os.tmpdir(),'megulit-cardinal-edge-'));
 const args=['--headless=new','--remote-debugging-port=0','--user-data-dir='+dir,'--no-first-run','--no-default-browser-check','--disable-extensions','--disable-gpu','--mute-audio','--disable-sync','--disable-background-networking','--disable-component-update','--disable-default-apps','--disable-features=Translate,msEdgeSidebarV2,msImplicitSignin,EdgeCollections','--hide-scrollbars','--window-size='+viewport.width+','+viewport.height,'about:blank'];
 const child=spawn(executable,args,{stdio:'ignore',windowsHide:true});child.on('error',()=>{});
 let closed=false;const kill=()=>{if(child.exitCode===null&&child.pid)try{if(process.platform==='win32')spawnSync('taskkill',['/T','/F','/PID',String(child.pid)],{windowsHide:true,stdio:'ignore'});else child.kill('SIGKILL');}catch{}};
 const cleanup=async()=>{for(let i=0;i<20;i++){try{fs.rmSync(dir,{recursive:true,force:true});return;}catch{await sleep(250);}}};
 let port=0,browserPath='';const until=Date.now()+30000;
 while(Date.now()<until){try{const [p,b]=fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split(/\r?\n/);if(+p){port=+p;browserPath=b;break;}}catch{}if(child.exitCode!==null)break;await sleep(100);}
 if(!port){kill();await cleanup();throw Error('CARDINAL_BROWSER_START');}
 let target=null;for(let i=0;i<50&&!target;i++){try{const list=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();target=list.find(t=>t.type==='page');}catch{}if(!target)await sleep(100);}
 if(!target){kill();await cleanup();throw Error('CARDINAL_BROWSER_TARGET');}
 const conn=new Conn(target.webSocketDebuggerUrl);await conn.ready;const page=new Page(conn);await page.init(viewport);
 return {page,pid:child.pid,async close(){if(closed)return;closed=true;conn.close();
  try{const bc=new Conn('ws://127.0.0.1:'+port+browserPath);await Promise.race([bc.ready,sleep(2000)]);await Promise.race([bc.send('Browser.close'),sleep(2000)]).catch(()=>{});bc.close();}catch{}
  const end=Date.now()+5000;while(child.exitCode===null&&Date.now()<end)await sleep(100);kill();await cleanup();}};}
module.exports={launch,findBrowser};
