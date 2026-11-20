'use strict';
/* 2026-11-15 (user: 把之前的窗口绑定功能放到校准这边): the 校准 page has 「绑定游戏窗口」 after 拖动文本框 and its hint, before the
   imports: a pick button, the reconnect hint, which window is bound, and the window list. The old 「窗口绑定（高级）」 fold
   is gone. The real reader page runs in headless Edge. Skipped without Edge. */
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
const PROBE=`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));const d=document.querySelector('.tomoyo-cn-dialog[open]');d.querySelector('[data-menu-key=calibrate]').click();await w(300);
 const p=d.querySelector('[data-menu-category=calibrate]'),all=[...p.querySelectorAll('*')],at=n=>all.indexOf(n),q=s=>p.querySelector(s);
 const block=q('[data-calibration-window-bind]'),pick=q('[data-gal-pick]'),bound=q('[data-gal-bound-window]'),bar=q('.tome-ac-bindbar'),tabs=q('.mg-subtabs');
 const out={summaries:[...p.querySelectorAll('summary')].map(s=>s.textContent.trim()),drag:at(q('[data-gal-drag]')),sync:at(q('.tome-position-sync')),block:at(block),imports:at(q('.tome-calibration-imports')),
  barOk:!!bar&&bar.contains(bound)&&at(bar)<at(block)&&at(block)<at(tabs)&&at(tabs)<at(q('[data-gal-drag]'))&&at(q('[data-gal-drag]'))<at(q('.tome-calibration-imports')),manualOpen:!block.classList.contains('tome-ac-off')&&!!block.getClientRects().length,tabLabels:[...p.querySelectorAll('.mg-subtabs>button')].map(b=>b.textContent),impInTab:!!q('.tome-calibration-imports')&&!q('.tome-calibration-imports').classList.contains('tome-ac-off')?'visible':'hidden',
  inBlock:['[data-gal-pick]','[data-gal-bind-hint]','select[name=galGame]','[data-gal-refresh]','[data-gal-bind]','[data-gal-unbind]','.tomoyo-gal-state'].map(s=>!!block?.querySelector(s)),
  presetVisible:!!q('[name=galPreset]')?.getClientRects().length&&!q('[name=galPreset]').closest('details'),gridVisible:!!q('[name=galX]')?.getClientRects().length&&!q('[name=galX]').closest('details'),
  hint:q('[data-gal-bind-hint]')?.textContent.trim(),bound:bound?.textContent,pick:pick?.textContent,pickBox:(()=>{const s=getComputedStyle(pick),o=getComputedStyle(q('[data-gal-drag]'));return [s.borderRadius===o.borderRadius,s.fontSize===o.fontSize,s.height===o.height];})(),
  blockBg:getComputedStyle(block).backgroundColor+'|'+getComputedStyle(block).backgroundImage,footer:d.querySelector('.tomoyo-menu-header small')?.textContent||''};
 window.__tomoyoChinese.galStatus({type:'bound',bound:true,gameHwnd:'42',gameTitle:'さくらの詩'});out.boundAfter=bound.textContent;
 window.__tomoyoChinese.galStatus({type:'pickWindow',active:true});out.picking=[pick.textContent,pick.classList.contains('tome-picking')];
 window.__tomoyoChinese.bindHotkeyResult({type:'bindHotkeyResult',ok:true,message:'已绑定：さくらの詩'});out.pickAfter=pick.classList.contains('tome-picking');out.tip=document.querySelector('.megulit-bind-hint')?.textContent;
 window.__tomoyoChinese.galStatus({type:'bound',bound:false,message:'已解除窗口绑定'});out.unbound=bound.textContent;
 return out;})()`;
test('校准: 绑定游戏窗口 sits after 拖动文本框 and its hint, before the imports, with pick, hint, bound window and the list',{skip:!hasEdge&&'Edge not installed',timeout:120000},async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-calibrate-bind-'));let server,cdp;
 try{server=await serve();cdp=await startEdge(path.join(temp,'edge'));
  await cdp.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/reader/index.html`});
  let ready=false;for(let i=0;i<120&&!ready;i++){await sleep(250);ready=await cdp.evaluate('!!window.__TOME_READER_READY__').catch(()=>false);}
  assert.ok(ready,'reader page loaded');
  await cdp.evaluate(`(()=>{window.__tomoyoMode.set('translation');document.body.classList.add('tomoyo-gal-bound');setTimeout(()=>dispatchEvent(new CustomEvent('tome-region-applied',{detail:{surfaceWidth:innerWidth*devicePixelRatio,surfaceHeight:innerHeight*devicePixelRatio}})),0);window.__tomoyoChinese.toggleGalMenu();return 1})()`);
  await sleep(1500);const s=await cdp.evaluate(PROBE);
  if(process.env.MEGULIT_SHOT){const r=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(process.env.MEGULIT_SHOT,Buffer.from(r.data,'base64'));}
  assert.ok(!s.summaries.some(t=>/窗口绑定/.test(t)),'old fold gone: '+s.summaries);
  assert.ok(s.barOk,'binding status bar sits above the sub-tabs; manual block between bar and tabs; 拖动文本框 and imports below the tabs: '+JSON.stringify(s));
  assert.ok(s.drag>=0&&s.sync>s.drag&&s.imports>s.sync,'order 拖动文本框 → hint → imports: '+JSON.stringify(s));
  assert.ok(!s.manualOpen,'manual bind controls start collapsed, bound or not');
  assert.deepEqual(s.tabLabels,['校准','沿用设置'],'calibration sub-tabs (short names, full name in the tooltip)');
  assert.deepEqual(s.inBlock,[true,true,true,true,true,true,true],'manual binding controls (pick, hint, list, refresh, bind, unbind, state) live in the block');
  assert.ok(s.presetVisible&&s.gridVisible,'preset and margins stay on the page, not folded');
  assert.equal(s.hint,'先开游戏后开 MeguLit，或 MeguLit 重开后，用这里或 Alt+M 重新连接');assert.equal(s.bound,'未绑定');assert.equal(s.pick,'绑定游戏窗口');
  assert.deepEqual(s.pickBox,[true,true,true],'the pick button looks like 拖动文本框');assert.match(s.blockBg,/rgba\(0, 0, 0, 0\)\|none/,'no glass box');
  assert.match(s.footer,/Alt\+M ?绑定窗口/);
  assert.equal(s.boundAfter,'当前：さくらの詩');assert.deepEqual(s.picking,['请点一下游戏窗口…（再点这里取消）',true]);assert.equal(s.pickAfter,false);assert.equal(s.tip,'已绑定：さくらの詩');assert.equal(s.unbound,'未绑定');
 }finally{cdp?.stop();server?.close();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});
