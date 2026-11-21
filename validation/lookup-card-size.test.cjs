'use strict';
/* 2026-11-15 (user: 优化点读卡尺寸啊 然后把滚动条隐藏了 这字尼玛太大了): the lookup card had a 40 px headword, a 520 px width
   and a visible scrollbar. Now: headword 24 px, body type one step down, width scaled with the screen (360-440 px), height at
   most half the game window, no scrollbar but a bottom fade while more is below, and placed above or below the whole
   sentence, never over it. The real reader page runs in headless Edge with a stub Tauri transport. Skipped without Edge. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {startEdge}=require('./library-views-perf.cjs');
const ROOT=path.join(__dirname,'..'),WEB=path.join(ROOT,'web'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hasEdge=[process.env.MEGULIT_EDGE,'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].some(p=>p&&fs.existsSync(p));
const STUB=`<script>window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(cmd,args)=>{const r=args&&args.request||{};
 if(cmd==='service'){if(r.action==='home')return {preferences:{language:'zh',themeMode:'dark'},games:[]};if(r.action==='ui_state')return {};
  if(r.action==='reader_bootstrap')return {engines:[],native:{}};if(r.action==='reader_message')return {replies:[]};return {};}return null;}};</script>`;
const TYPES={'.js':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json'};
function serve(){const server=http.createServer((req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://x').pathname),file=path.join(WEB,rel);
 if(!file.startsWith(WEB)||!fs.existsSync(file)||!fs.statSync(file).isFile()){if(/^\/reader\/modules\/[a-z0-9-]+\.js$/.test(rel)){res.writeHead(200,{'content-type':'text/javascript'});return res.end('');}res.writeHead(404);return res.end();}
 let data=fs.readFileSync(file);if(rel==='/reader/index.html')data=Buffer.from(String(data).replace('<head>','<head>'+STUB));
 res.writeHead(200,{'content-type':TYPES[path.extname(file)]||'application/octet-stream'});res.end(data);});
 return new Promise(r=>server.listen(0,'127.0.0.1',()=>r(server)));}
const WORDS={
 short:{entries:[{spellings:['猫'],readings:['ねこ'],pos:['名詞'],definitions:['猫；猫科动物']}]},
 long:{entries:[{spellings:['かける'],readings:['かける'],pos:['動詞'],definitions:['挂；悬挂','花费；耗费','打（电话）','坐；坐下','浇；泼','盖上；蒙上','乘；相乘','上锁','开动（机器）','施加（压力）','提交（会议）','担心；挂念','欺骗','设置；架设']}]}};
const OPEN=data=>`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));const b=window.__tomoyoChinese;b.closeLocalSelection?.();await w(300);
 b.localLookup=async()=>(${JSON.stringify(data)});b.openLocalSelection({text:'x',start:0,end:1,selection:'x'},document.getElementById('w'));await w(900);
 const c=document.querySelector('.tomoyo-selection-card');for(const d of c.querySelectorAll('details'))d.open=true;await w(400);
 const r=c.getBoundingClientRect(),line=document.getElementById('line').getBoundingClientRect(),f=s=>parseFloat(getComputedStyle(c.querySelector(s)).fontSize);
 return {top:r.top,bottom:r.bottom,width:r.width,height:r.height,lineTop:line.top,lineBottom:line.bottom,head:f('.tomoyo-word-heading strong'),sense:f('.tomoyo-sense'),
  bar:c.offsetWidth-c.clientWidth-parseFloat(getComputedStyle(c).borderLeftWidth)-parseFloat(getComputedStyle(c).borderRightWidth),more:c.hasAttribute('data-more'),scrolls:c.scrollHeight>c.clientHeight};})()`;

test('lookup card: smaller type, width 360-440, at most half the game window, no scrollbar, never over the sentence',{skip:!hasEdge&&'Edge not installed',timeout:120000},async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-lookup-card-'));let server,cdp;
 try{server=await serve();cdp=await startEdge(path.join(temp,'edge'));
  await cdp.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/reader/index.html`});
  let ready=false;for(let i=0;i<120&&!ready;i++){await sleep(250);ready=await cdp.evaluate('!!window.__TOME_READER_READY__').catch(()=>false);}
  assert.ok(ready,'reader page loaded');
  await cdp.evaluate(`(()=>{window.__tomoyoMode.set('translation');document.body.classList.add('tomoyo-gal-bound');
   const s=document.createElement('div');s.id='line';s.className='sentence-text';s.innerHTML='「そんなこと、<span id=w>注意すれば</span>わかるはずでしょ？<br>だから言ったのに」';
   s.style.cssText='position:fixed;left:360px;top:640px;width:900px;font:36px/1.5 Meiryo;color:#fff';document.body.append(s);
   window.__tomoyoChinese.gameArea=()=>({left:200,top:100,width:1280,height:720});return 1})()`);
  for(const [name,data] of Object.entries(WORDS)){
   const c=await cdp.evaluate(OPEN(data));
   assert.equal(c.head,24,name+': headword 24 px');assert.ok(c.sense<=13,name+': sense text '+c.sense+' px');
   assert.ok(c.width>=360&&c.width<=440,name+': width '+c.width);assert.ok(c.height<=360+1,name+': at most half the 720 px game window, got '+c.height);
   assert.ok(c.bottom<=c.lineTop||c.top>=c.lineBottom,name+': the card does not cover the sentence');
   assert.equal(c.bar,0,name+': no scrollbar');
   if(name==='long'){assert.ok(c.scrolls,'long entry scrolls inside the card');assert.ok(c.more,'bottom fade while more is below');}
   else assert.equal(c.more,false,'no fade on a card that fits');
  }
 }finally{await cdp?.stop();server?.close();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});

/* 2026-11-16 (user: 我点读窗口呢？, The Song of Saya ver1.00S): in overlay placement the sentence block was a full-window box
   (0,0,1920,1079, reader-pointer.log) with the glyphs placed at the top. The card took the block as "the sentence", fitted neither
   above nor below and was put above the window's top edge. Also: a reader window larger than the monitor's work area keeps the card
   on the work area. */
const PLACE=`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));const b=window.__tomoyoChinese;b.closeLocalSelection?.();await w(300);
 b.localLookup=async()=>(${JSON.stringify(WORDS.long)});const t=document.getElementById('t');b.openLocalSelection({text:'x',start:0,end:1,selection:'x'},t);await w(900);
 const c=document.querySelector('.tomoyo-selection-card'),r=c.getBoundingClientRect(),g=t.getBoundingClientRect();
 return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,gTop:g.top,gBottom:g.bottom,w:innerWidth,h:innerHeight};})()`;
test('lookup card: a page-sized sentence block (overlay placement) and a window bigger than the work area keep the card on screen',{skip:!hasEdge&&'Edge not installed',timeout:120000},async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-lookup-place-'));let server,cdp;
 try{server=await serve();cdp=await startEdge(path.join(temp,'edge'));
  await cdp.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/reader/index.html`});
  let ready=false;for(let i=0;i<120&&!ready;i++){await sleep(250);ready=await cdp.evaluate('!!window.__TOME_READER_READY__').catch(()=>false);}
  assert.ok(ready,'reader page loaded');
  await cdp.evaluate(`(()=>{window.__tomoyoMode.set('translation');document.body.classList.add('tomoyo-gal-bound');
   const s=document.createElement('div');s.className='sentence-text';s.style.cssText='position:fixed;inset:0;font:28px/1.4 Meiryo;color:#fff';
   const line=document.createElement('div');line.style.cssText='position:absolute;left:40px;top:60px';
   line.innerHTML='『<span class=char-token>耕</span><span class=char-token>司</span><span class=char-token>ニ</span>ソウ』<br><span class=char-token id=t>楽</span>シクッテ';
   s.append(line);document.body.append(s);window.__tomoyoChinese.gameArea=()=>({left:0,top:0,width:innerWidth,height:innerHeight});return 1})()`);
  let c=await cdp.evaluate(PLACE);
  assert.ok(c.top>=0&&c.bottom<=c.h&&c.left>=0&&c.right<=c.w,'card inside the window: '+JSON.stringify(c));
  assert.ok(c.top>=c.gBottom,'card below the line that sits at the top: '+JSON.stringify(c));
  /* the monitor's work area is the window's left/top 600x420 part (the rest hangs off screen) */
  await cdp.evaluate(`(()=>{for(const [k,v] of Object.entries({availLeft:0,availTop:0,availWidth:600,availHeight:420}))Object.defineProperty(screen,k,{get:()=>v,configurable:true});return 1})()`);
  c=await cdp.evaluate(PLACE);
  assert.ok(c.top>=0&&c.bottom<=420&&c.left>=0&&c.right<=600,'card inside the work area: '+JSON.stringify(c));
 }finally{await cdp?.stop();server?.close();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});
