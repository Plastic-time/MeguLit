// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Whole-chain reader replay (2026-11-21, owner: 「做到真实 DOM 级别的验收回放」).
   One child process per run (core/layout.cjs reads MEGULIT_ROOT once). What runs is the code the owner's PC runs:
     services/runtime.cjs -> services/reader.cjs -> core/gal-native.cjs -> core/hook-native.cjs (+ overlay placement, engine-draw)
     -> 'reader-event' -> web/reader/index.html with every module of web/reader/module-list.js (headless Edge).
   Faked only at the process / OS edge: the two native bridges (GalWindowBridge, HookBridge: their stdout lines are the log's
   records, their stdin is captured), the program path of the game pid, the translation provider (a fixed Chinese text), the
   tokenizer runtime (absent). Nothing in between is stubbed.
   Usage: node driver.cjs <scenario.json> <out.json>   (env MEGULIT_REPLAY_DATA = a folder like E:\MeguLit-Test-1421\data) */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const REPO=path.join(__dirname,'..','..');
const [scenarioFile,outFile]=process.argv.slice(2);
const scenario=JSON.parse(fs.readFileSync(scenarioFile,'utf8'));
const work=fs.mkdtempSync(path.join(process.env.MEGULIT_REPLAY_WORK||path.join(os.tmpdir(),'megulit-replay'),'run-'));
const root=path.join(work,'root');
/* ---- a MeguLit root with the owner's settings (no secrets, no scripts index) ---- */
function copy(from,to){if(!fs.existsSync(from))return;const st=fs.statSync(from);if(st.isDirectory()){fs.mkdirSync(to,{recursive:true});for(const f of fs.readdirSync(from))copy(path.join(from,f),path.join(to,f));}else{fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);}}
const data=process.env.MEGULIT_REPLAY_DATA||'';
fs.mkdirSync(path.join(root,'data','config'),{recursive:true});
if(data){for(const f of fs.readdirSync(path.join(data,'config')))if(!/secrets|account/.test(f))copy(path.join(data,'config',f),path.join(root,'data','config',f));
 for(const f of ['preferences.json','ui-state.json','megulit.sqlite','window-state.json'])copy(path.join(data,f),path.join(root,'data',f));}
for(const [k,v] of Object.entries(scenario.galPreferences||{})){const f=path.join(root,'data','config','gal-preferences.json');const g=fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):{};g[k]=v;fs.writeFileSync(f,JSON.stringify(g,null,2));}
for(const n of ['GalWindowBridge.exe','HookBridge.exe'])copy(path.join(__dirname,'stub.txt'),path.join(root,'native',n));
for(const n of ['LunaHost64.dll','LunaHook32.dll','LunaHook64.dll'])copy(path.join(__dirname,'stub.txt'),path.join(root,'runtime','hook',n));
fs.mkdirSync(path.join(root,'logs'),{recursive:true});
process.env.MEGULIT_ROOT=root;process.env.MEGULIT_RELAY_BASE='off';process.env.TEMP=process.env.TMP=path.join(work,'tmp');fs.mkdirSync(process.env.TEMP,{recursive:true});
/* ---- OS edge ---- */
const fonts=require(path.join(REPO,'core','game-fonts.cjs'));fonts.exePath=async()=>scenario.game.exe;
const providers=require(path.join(REPO,'core','providers.cjs'));
providers.createTranslationService=()=>({setKey(){},hasKey(){return true;},observeSource(){},clearContext(){},lookup:async()=>null,translate:async text=>(scenario.translations||{})[text]||('中文：'+text)});
function fakeProc(name){const p=new EventEmitter();p.stdout=new PassThrough();p.stdin=new PassThrough();p.exitCode=null;p.pid=90000+Math.floor(Math.random()*999);p.kill=()=>{p.exitCode=0;p.emit('exit',0);};p.sent=[];let buf='';
 p.stdin.on('data',d=>{buf+=String(d);let i;while((i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i);buf=buf.slice(i+1);try{p.sent.push({at:Date.now(),m:JSON.parse(line)});}catch{}}});
 p.line=o=>p.stdout.write(JSON.stringify(o)+'\n');p.name=name;return p;}
const gwb=fakeProc('GalWindowBridge');let hookSpawned=0;
/* HookBridge: a new process per start (core/hook-native.cjs start), the newest one gets the log's lines. Like the real bridge it
   says it is alive every second (hookHeartbeat) and follows core's hide switch: MODEL (labelled) the KiriKiri script reports a
   dialogue line hidden=1 while core has the hide enabled and hidden=0 while it is disabled; scenario.adaptiveHidden=false keeps
   the log's flags as they are */
const hbs=[];let hideOn=false;const hbAll={sent:[]};
function newHook(){const p=fakeProc('HookBridge');p.stdin.on('data',()=>{for(const x of p.sent.splice(0)){hbAll.sent.push(x);if(x.m.type==='enable')hideOn=true;if(x.m.type==='disable')hideOn=false;}});
 p.beat=setInterval(()=>{if(p.exitCode===null)p.line({type:'hookHeartbeat',hookActive:true,processAttached:true,streamSelected:true,receivedText:true,replacementState:'callback-acknowledged'});},1000);p.beat.unref?.();
 p.kill=()=>{clearInterval(p.beat);p.exitCode=0;p.emit('exit',0);};p.stdin.on('finish',()=>{});hbs.push(p);return p;}
const hb={line:o=>{const p=hbs.at(-1);if(!p||p.exitCode!==null)return;if(o.type==='hookChars'&&scenario.adaptiveHidden!==false&&/ hidden=[01] /.test(o.line)&&!/ role=(?!line)/.test(o.line))o={...o,line:o.line.replace(/ hidden=[01] /,' hidden='+(hideOn?1:0)+' ')};p.line(o);},get sent(){return hbAll.sent;}};
const events=[];
const {Runtime}=require(path.join(REPO,'services','runtime.cjs'));
let page=null;const early=[];
const runtime=new Runtime(root,(channel,payload)=>{if(channel!=='reader-event')return;events.push({at:Date.now(),m:payload});if(page)page.evaluate(m=>window.__replayEvent(m),payload).catch(()=>{});else early.push(payload);});
runtime.spawnReaderNative=()=>gwb;
/* the tokenizer runtime is absent here and never installed (no pip / dictionary download from a replay): requests fail like an uninstalled one */
runtime.learning=()=>({installed:()=>false,request:async()=>{throw Error('LEARNING_NOT_INSTALLED');},readings:{resolve:t=>t},adaptResult:r=>r,progress:{stage:'idle'}});
const bridge=require(path.join(REPO,'services','bridge.cjs'));
async function service(request){
 if(request.action==='reader_attach'){const r=await runtime.call(request);const h=runtime.reader?.gal?.hooks;if(h){h.spawn=()=>{hookSpawned++;return newHook();};}return r;}
 try{return await bridge.dispatch(request,runtime);}catch(e){if(/reader_|ui_state|home|preserve_ui/.test(request.action))throw e;return null;}
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const {KrkrModel}=require('./krkr-model.cjs');
(async()=>{
 const {chromium}=require(process.env.MEGULIT_PLAYWRIGHT||'H:/MeguLit-Work/pw/node_modules/playwright-core');
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const out={work,errors:[],console:[],samples:[],marks:[],hookSpawned:0,gwbSent:[],hbSent:[],events:[],control:[],krkr:{clears:0,choice:[],cfg:null}};let krkr=null,lastLine=null;
 try{
  const ctx=await browser.newContext({viewport:scenario.viewport||{width:1920,height:1080},deviceScaleFactor:1});
  await ctx.route('http://tauri.localhost/**',async route=>{const u=new URL(route.request().url());let f=path.join(REPO,'web',decodeURIComponent(u.pathname));if(fs.existsSync(f)&&fs.statSync(f).isFile()){const ext=path.extname(f);await route.fulfill({status:200,body:fs.readFileSync(f),headers:{'content-type':{'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf'}[ext]||'application/octet-stream'}});}else if(path.basename(f)==="local-font.js")await route.fulfill({status:200,body:'/* generated by tools/prepare-reader.cjs: no optional local font */',headers:{'content-type':'text/javascript'}});else await route.fulfill({status:404,body:''});});
  await ctx.route('http://ipc.localhost/**',route=>route.fulfill({status:200,body:'null',headers:{'content-type':'application/json','Tauri-Response':'ok'}}));
  await ctx.route(/^https?:\/\/(?!tauri\.localhost|ipc\.localhost)/,route=>route.abort());
  page=await ctx.newPage();
  page.on('console',m=>{if(['error','warning'].includes(m.type())&&out.console.length<200)out.console.push(m.type()+': '+m.text().slice(0,300));});
  page.on('pageerror',e=>out.errors.push(String(e.stack||e).slice(0,600)));
  page.on('response',r=>{if(r.status()>=400&&out.console.length<200)out.console.push('http '+r.status()+' '+r.url().slice(0,160));});
  await page.exposeFunction('__replayInvoke',async json=>{const {cmd,args}=JSON.parse(json);try{
    if(cmd==='service')return JSON.stringify({ok:await service(args.request)});
    if(cmd==='reader_connect')return JSON.stringify({ok:await service({action:'reader_attach',pid:process.pid,hwnd:'1234'})});
    return JSON.stringify({ok:null});}catch(e){return JSON.stringify({error:String(e&&e.message||e)});}});
  await page.addInitScript(()=>{const cbs=new Map();let n=1;
   const internal={transformCallback(fn){const id=n++;cbs.set(id,fn);return id;},unregisterCallback(id){cbs.delete(id);},runCallback(id,v){cbs.get(id)?.(v);},callbacks:cbs,
    invoke:async(cmd,args={})=>{if(cmd==='plugin:event|listen'){window.__replayHandler=args.handler;return 1;}const r=JSON.parse(await window.__replayInvoke(JSON.stringify({cmd,args})));if(r.error)throw Error(r.error);return r.ok;}};
   Object.defineProperty(window,'__TAURI_INTERNALS__',{value:internal,configurable:true});
   window.__replayEvent=m=>{const id=window.__replayHandler;if(id)cbs.get(id)?.({payload:m});};});
  await page.goto('http://tauri.localhost/reader/index.html');
  try{await page.waitForFunction(()=>window.__TOME_READER_READY__===true,null,{timeout:30000});}catch(e){out.errors.push('not ready: '+await page.evaluate(()=>document.querySelector('#reader-status')?.textContent).catch(()=>'?'));const f=path.join(root,'logs','reader-startup.log');if(fs.existsSync(f))out.errors.push(fs.readFileSync(f,'utf8').slice(-1500));throw e;}
  for(const m of early.splice(0))await page.evaluate(m=>window.__replayEvent(m),m).catch(()=>{});
  await page.addScriptTag({path:path.join(REPO,'web','reader','replay-probe.js')});
  /* ---- the timeline: bridge lines at their log times (gaps over maxGap shortened) ---- */
  const t0=Date.now();out.t0=t0;let clock=0;const maxGap=scenario.maxGap||2500;
  let prevT=null,sampling=!!scenario.sampleEvery;
  /* a sampler beside the timeline: what the page shows every sampleEvery ms (flashes between two marks) */
  const sampler=(async()=>{while(sampling){const s=await page.evaluate(()=>window.__replayProbe()).catch(()=>null);if(s){s.mark='tick';s.watch=true;s.at=Date.now()-t0;s.hitRegions=(gwb.sent.filter(x=>x.m.type==='hitRegions').at(-1)?.m.regions)||[];s.src=s.hookSource;out.samples.push(s);}await sleep(scenario.sampleEvery);}})();
  for(const step of scenario.steps){
   if(step.t!=null){if(prevT!=null){const gap=Math.min(maxGap,Math.max(0,step.t-prevT));clock+=gap;}prevT=step.t;const wait=t0+clock-Date.now();if(wait>0)await sleep(wait);}
   if(step.gwb){if(step.gwb.type==='bound'&&!krkr)try{krkr=new KrkrModel({pid:step.gwb.gameProcessId,tmp:process.env.TEMP});}catch(e){out.krkr.error=String(e.message||e);krkr=false;}
    /* MODEL (labelled): the game clears its message layer at the click ([cm]); the script's own clearSent reports it when the control file says #clearline */
    if(step.gwb.type==='readerInput'&&krkr&&lastLine&&step.pageClear!==false){krkr.tick();const n=krkr.reports.length;krkr.st.clearSent(lastLine);for(const r of krkr.reports.slice(n))hb.line({type:'hookChars',line:r});out.krkr.clears+=krkr.reports.length-n;}
    gwb.line(step.gwb);}
   if(step.hb){hb.line(step.hb);if(step.hb.type==='hookChars'){const m=/ line=(\d+) hidden=\d sw=(\d+) sh=(\d+) .* n=(\d+) /.exec(step.hb.line);if(m&&!/ role=(?!line)/.test(step.hb.line)&&+m[4]>0)lastLine={line:+m[1],sentLine:+m[1],sw:+m[2],sh:+m[3]};}}
   if(step.choicePage&&krkr){krkr.tick();out.krkr.choice.push({mark:step.choicePage,frame:step.frame||'選択肢',ui:krkr.st.uiDraw({parent:{frameGraphic:step.frame||'選択肢',height:400}}),cfg:JSON.parse(JSON.stringify(krkr.st.cfg,(k,v)=>v instanceof RegExp?String(v):v))});}
   if(step.page)await page.evaluate(typeof step.page==="string"?"("+step.page+")()":step.page).catch(e=>out.errors.push('step page: '+e.message));
   if(step.mark){await sleep(step.settle??150);const s=await page.evaluate(()=>window.__replayProbe()).catch(e=>({error:e.message}));s.mark=step.mark;s.at=Date.now()-t0;s.hitRegions=(gwb.sent.filter(x=>x.m.type==='hitRegions').at(-1)?.m.regions)||[];out.samples.push(s);}
   if(step.watch){const until=Date.now()+step.watch;while(Date.now()<until){const s=await page.evaluate(()=>window.__replayProbe()).catch(e=>({error:e.message}));s.mark=step.mark||('watch:'+step.watchName);s.at=Date.now()-t0;s.watch=true;s.hitRegions=(gwb.sent.filter(x=>x.m.type==='hitRegions').at(-1)?.m.regions)||[];out.samples.push(s);await sleep(step.every||80);}}
   if(step.control){const dir=path.join(process.env.TEMP,'MeguLit','draw');await sleep(120);const files=fs.existsSync(dir)?fs.readdirSync(dir):[];out.control.push({mark:step.control,files:files.map(f=>({name:f,text:fs.readFileSync(path.join(dir,f)).slice(2).toString('utf16le')}))});}
  }
  sampling=false;await sampler;
  {const dir=path.join(process.env.TEMP,'MeguLit','draw');const files=fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>/^\d+\.txt$/.test(f)):[];out.control.push({mark:'end',files:files.map(f=>({name:f,text:fs.readFileSync(path.join(dir,f)).slice(2).toString('utf16le')}))});}
  if(krkr){krkr.tick();out.krkr.cfg=JSON.parse(JSON.stringify(krkr.st.cfg,(k,v)=>v instanceof RegExp?String(v):v));out.krkr.ctl=krkr.ctl;}
  out.hookSpawned=hookSpawned;out.gwbSent=gwb.sent.filter(x=>x.m.type!=='hitRegions').slice(-200).map(x=>x.m);out.hbSent=hb.sent.map(x=>({at:x.at-t0,...x.m})).filter(m=>m.type!=='source');
  out.events=events.map(e=>({at:e.at-t0,type:e.m.type,keys:Object.keys(e.m).slice(0,12)})).slice(-400);
  out.hookEvents=[];for(const f of ['hook-events.log.previous','hook-events.log.1','hook-events.log']){const x=path.join(root,'logs',f);if(fs.existsSync(x))out.hookEvents.push(...fs.readFileSync(x,'utf8').split(/\r?\n/).filter(l=>l&&!/Z (chain|translation|choice aux|art text located) /.test(l)));}
  out.readerHost=fs.existsSync(path.join(root,'logs','reader-host.log'))?fs.readFileSync(path.join(root,'logs','reader-host.log'),'utf8').split('\n').filter(l=>!/"hostFrame"/.test(l)).slice(-200):[];
 }catch(e){out.errors.push('driver: '+String(e.stack||e).slice(0,800));}
 finally{
  try{runtime.reader?.gal?.stop?.();}catch{}try{runtime.reader?.stop?.();}catch{}
  await browser.close().catch(()=>{});
  fs.writeFileSync(outFile,JSON.stringify(out,null,1));
  if(!process.env.MEGULIT_REPLAY_KEEP)try{fs.rmSync(work,{recursive:true,force:true});}catch{}
  process.exit(0);
 }
})();
