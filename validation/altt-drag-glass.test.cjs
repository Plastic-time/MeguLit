'use strict';
/* 2026-11-15 (user: alt+t现在调整位置和尺寸非常卡): dragging the Alt+T panel by its header sends no glass message per frame (each one
   went through Tauri to the bridge and moved its magnifier read) and does not re-place the picture, which rides along
   with the panel's transform; release sends one update. The real reader page runs in headless Edge with a stub Tauri
   transport and a stand-in for the bridge's glass pictures. Skipped without Edge. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {startEdge}=require('./library-views-perf.cjs');
const ROOT=path.join(__dirname,'..'),WEB=path.join(ROOT,'web'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hasEdge=[process.env.MEGULIT_EDGE,'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].some(p=>p&&fs.existsSync(p));
const STUB=`<script>window.__sent=[];window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(cmd,args)=>{const r=args&&args.request||{};
 if(cmd==='service'){if(r.action==='home')return {preferences:{language:'zh',themeMode:'dark'},games:[]};if(r.action==='ui_state')return {};
  if(r.action==='reader_bootstrap')return {engines:[],native:{}};if(r.action==='reader_message'){window.__sent.push(r.message);return {replies:[]};}return {};}return null;}};</script>`;
const TYPES={'.js':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json'};
function serve(){const server=http.createServer((req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://x').pathname),file=path.join(WEB,rel);
 if(!file.startsWith(WEB)||!fs.existsSync(file)||!fs.statSync(file).isFile()){if(/^\/reader\/modules\/[a-z0-9-]+\.js$/.test(rel)){res.writeHead(200,{'content-type':'text/javascript'});return res.end('');}res.writeHead(404);return res.end();}
 let data=fs.readFileSync(file);if(rel==='/reader/index.html')data=Buffer.from(String(data).replace('<head>','<head>'+STUB));
 res.writeHead(200,{'content-type':TYPES[path.extname(file)]||'application/octet-stream'});res.end(data);});
 return new Promise(r=>server.listen(0,'127.0.0.1',()=>r(server)));}
test('Alt+T header drag: no glass message or picture re-placement per frame, one update on release',{skip:!hasEdge&&'Edge not installed',timeout:120000},async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-altt-drag-'));let server,cdp;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 try{server=await serve();cdp=await startEdge(path.join(temp,'edge'));
  await cdp.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/reader/index.html`});
  let ready=false;for(let i=0;i<120&&!ready;i++){await sleep(250);ready=await cdp.evaluate('!!window.__TOME_READER_READY__').catch(()=>false);}
  assert.ok(ready,'reader page loaded');
  await cdp.evaluate(`(()=>{window.__tomoyoMode.set('translation');document.body.classList.add('tomoyo-gal-bound');document.documentElement.dataset.tomeMenuSurface='glass';
   setInterval(()=>dispatchEvent(new CustomEvent('tome-region-applied',{detail:{surfaceWidth:innerWidth,surfaceHeight:innerHeight}})),100);window.__tomoyoChinese.toggleGalMenu();
   const c=document.createElement('canvas');c.width=40;c.height=30;c.getContext('2d').fillRect(0,0,40,30);const image=c.toDataURL('image/jpeg').split(',')[1];
   setInterval(()=>{const g=window.__sent.filter(m=>m.type==='galGlass'&&m.rects.length).at(-1);if(g){const r=g.rects[0];window.__tomoyoChinese.glassFrame({type:'glassFrame',x:r.fx,y:r.fy,w:r.fw,h:r.fh,image});}},33);return 1})()`);
  await sleep(2500);
  const STATE=`(()=>{const d=document.querySelector('.tomoyo-cn-dialog[open]'),b=d.querySelector(':scope>.tome-menu-bg>b');return {glass:window.__sent.filter(m=>m.type==='galGlass').length,pos:b.style.backgroundPosition,img:!!b.style.backgroundImage,dragging:d.classList.contains('tome-menu-dragging'),fx:window.__sent.filter(m=>m.type==='galGlass'&&m.rects.length).at(-1)?.rects[0].fx/devicePixelRatio,box:(r=>[r.left,r.top].map(Math.round))(d.getBoundingClientRect())};})()`;
  const [x,y]=await cdp.evaluate(`(()=>{const r=document.querySelector('.tomoyo-cn-dialog[open] .tomoyo-menu-header').getBoundingClientRect();return [Math.round(r.left+r.width/2),Math.round(r.top+r.height/2)]})()`);
  const mouse=(type,a,b)=>cdp.send('Input.dispatchMouseEvent',{type,x:a,y:b,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1,pointerType:'mouse'});
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await mouse('mousePressed',x,y);
  for(let i=1;i<=5;i++){await mouse('mouseMoved',x-i*4,y+i*2);await sleep(30);}await sleep(400);
  const first=await cdp.evaluate(STATE);assert.ok(first.dragging&&first.img,'dragging with a glass picture: '+JSON.stringify(first));
  for(let i=1;i<=60;i++){await mouse('mouseMoved',x-20-i*8,y+10+i*3);await sleep(16);}
  const mid=await cdp.evaluate(STATE);
  assert.ok(mid.box[0]<first.box[0]-300,'the panel moved: '+JSON.stringify([first.box,mid.box]));
  assert.equal(mid.glass,first.glass,'no glass message while dragging');assert.equal(mid.pos,first.pos,'picture not re-placed while dragging (it moves with the panel)');
  await mouse('mouseReleased',x-500,y+190);await sleep(500);
  const after=await cdp.evaluate(STATE);assert.equal(after.dragging,false);assert.ok(after.glass>mid.glass,'release sends the new glass read');assert.ok(after.fx<first.fx-300,'the read moved with the panel: '+JSON.stringify([first.fx,after.fx]));
 }finally{await cdp?.stop();server?.close();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});
