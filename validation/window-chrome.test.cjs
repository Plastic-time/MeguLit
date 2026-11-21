'use strict';
/* 2026-11-19 (user: "这蓝框咋又跑出来了 能不能根治一下 也是搞了三十多次的问题了"). The blue strip on top of the Alt+T menu was the
   classic caption Windows painted into the reader window: tao keeps WS_CAPTION on "undecorated" windows and hands
   WM_NCACTIVATE to DefWindowProc; the bridge removed the bits afterwards from another process and tao wrote them back.
   The rule now sits in the owning process (desktop/src/window_chrome.rs): WM_STYLECHANGING filters every style write, no
   non-client area is ever calculated or painted. Its own test drives hidden windows through random sequences of style
   rewrites, activation, z-order, size, DPI, region and title changes; the same sequences without the guard leave a frame.
   Here: the wiring, the self-test (built with rustc when the toolchain is there), and the menu's focus ring. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),{spawnSync}=require('node:child_process');
const ROOT=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(ROOT,f),'utf8'),sleep=ms=>new Promise(r=>setTimeout(r,ms));

test('the reader window gets the chrome guard as soon as it is built, on the thread that owns it',()=>{
 const main=read('desktop/src/main.rs'),policy=read('desktop/src/window_policy.rs');
 assert.match(main,/mod window_chrome;/);
 const built=main.slice(main.indexOf('tauri::WebviewWindowBuilder::new(&app,"reader"'));
 assert.match(built.slice(0,1400),/\.map\(\|w\|\{window_policy::no_accent_border\(&w\);window_policy::chromeless\(&w\);\}\)/,'installed where the reader window is created, before it is ever shown');
 assert.match(policy,/pub fn chromeless\(window:&tauri::WebviewWindow\)\{[\s\S]{0,260}run_on_main_thread\(move\|\|unsafe\{crate::window_chrome::install\(/);
});

test('the guard sits at every place a frame can come back through',()=>{
 const s=read('desktop/src/window_chrome.rs');
 assert.match(s,/WM_STYLECHANGING if lparam != 0 =>/,'style writes from any process are filtered');
 assert.match(s,/change\.new = chromeless_style\(change\.new\)/);assert.match(s,/change\.new = chromeless_ex_style\(change\.new\)/);
 assert.match(s,/WM_NCCALCSIZE if wparam != 0 => 0,/,'no non-client area');
 assert.match(s,/WM_NCPAINT \| WM_NCUAHDRAWCAPTION \| WM_NCUAHDRAWFRAME => 0,/,'nothing painted into one');
 assert.match(s,/WM_NCACTIVATE => \{ CallWindowProcW\(previous, hwnd, message, wparam, -1\); 1 \}/,'activation reaches tao, DefWindowProc does not repaint');
 assert.match(s,/\(34u32, 0xffff_fffeu32\), \(33, 1\), \(38, 1\)/,'accent border off, corners not rounded, no backdrop');
 assert.doesNotMatch(s,/\buse (tauri|tao|windows)\b/,'stands alone: rustc --test builds it without the app');
});

test('the bridge checks from outside with the same style values and logs a frame with its size',()=>{
 const s=read('native/GalWindowBridge.cs');
 assert.match(s,/public static int HostedStyle\(int style\)\{return \(style&~0x00c40000\)\|unchecked\(\(int\)0x80000000\);\}/);
 assert.match(s,/public static int HostedExStyle\(int ex\)\{return \(ex&~\(0x00000001\|0x00000100\|0x00000200\|0x00020000\|0x00040000\)\)\|0x00000080;\}/);
 assert.match(s,/bool framed=ncLeft!=0\|\|ncTop!=0\|\|ncRight!=0\|\|ncBottom!=0;/);
 assert.match(s,/type="hostFrame",update=HostedFrameUpdates,[^;]*nonClient=/);
 const rust=read('desktop/src/window_chrome.rs');
 /* WS_CAPTION | WS_THICKFRAME = 0x00C40000; the five extended bits are the ones the bridge clears */
 assert.match(rust,/\(style & !\(WS_CAPTION \| WS_THICKFRAME\)\) \| WS_POPUP/);
 assert.match(rust,/\(ex & !\(WS_EX_DLGMODALFRAME \| WS_EX_WINDOWEDGE \| WS_EX_CLIENTEDGE \| WS_EX_STATICEDGE \| WS_EX_APPWINDOW\)\) \| WS_EX_TOOLWINDOW/);
});

const tools=process.env.MEGULIT_BUILD_TOOLS||path.join(ROOT,'..','build-tools');
const rustc=[process.env.MEGULIT_RUSTC,path.join(tools,'cargo','bin','rustc.exe'),path.join(os.homedir(),'.cargo','bin','rustc.exe')].find(p=>p&&fs.existsSync(p));
test('invariant self-test: hidden windows through random style / activation / z-order / size / DPI / region sequences never get a frame; without the guard they do',{skip:process.platform!=='win32'?'Windows only':!rustc?'rustc not found (MEGULIT_BUILD_TOOLS)':false,timeout:300000},()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-chrome-'));
 try{
  const exe=path.join(temp,'window-chrome-test.exe'),env={...process.env,PATH:path.dirname(rustc)+path.delimiter+process.env.PATH};
  if(fs.existsSync(path.join(tools,'rustup')))env.RUSTUP_HOME=env.RUSTUP_HOME||path.join(tools,'rustup');
  if(fs.existsSync(path.join(tools,'cargo')))env.CARGO_HOME=env.CARGO_HOME||path.join(tools,'cargo');
  const build=spawnSync(rustc,['--edition','2021','--test',path.join(ROOT,'desktop','src','window_chrome.rs'),'-o',exe],{encoding:'utf8',windowsHide:true,timeout:240000,env,cwd:temp});
  assert.equal(build.status,0,build.stderr);assert.doesNotMatch(build.stderr,/^warning/m,build.stderr);
  const run=spawnSync(exe,[],{encoding:'utf8',windowsHide:true,timeout:120000});
  assert.equal(run.status,0,run.stdout+run.stderr);
  assert.match(run.stdout,/guarded_window_never_has_a_frame_and_never_paints_one \.\.\. ok/);
  assert.match(run.stdout,/without_the_guard_the_same_sequences_leave_a_frame \.\.\. ok/);
  assert.match(run.stdout,/test result: ok\. 3 passed/);
 }finally{try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});

/* ---- focus ring: the real reader page in headless Edge ---- */
const {startEdge}=require('./library-views-perf.cjs');
const WEB=path.join(ROOT,'web');
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
const RINGS="(()=>{const d=document.querySelector('.tomoyo-cn-dialog[open]');const ringed=[...d.querySelectorAll('*'),d].filter(e=>{const s=getComputedStyle(e);return e.matches(':focus')&&s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>0;}).map(e=>e.tagName+'.'+String(e.className).slice(0,40));const a=document.activeElement;const s=a?getComputedStyle(a):null;return JSON.stringify({active:a?a.tagName+'.'+String(a.className).slice(0,40):'',inDialog:!!a&&d.contains(a),isDialog:a===d,visible:!!a&&a.matches(':focus-visible'),outline:s?s.outlineStyle+' '+s.outlineWidth+' '+s.outlineColor:'',ringed,page:[document.documentElement,document.body].map(e=>getComputedStyle(e).outlineStyle)});})()";
test('opening the menu puts no focus ring anywhere; Tab shows MeguLit\'s own ring on a control; a mouse click shows none',{skip:!hasEdge&&'Edge not installed',timeout:120000},async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-chrome-focus-'));let server,cdp;
 try{server=await serve();cdp=await startEdge(path.join(temp,'edge'));
  await cdp.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/reader/index.html`});
  let ready=false;for(let i=0;i<120&&!ready;i++){await sleep(250);ready=await cdp.evaluate('!!window.__TOME_READER_READY__').catch(()=>false);}
  assert.ok(ready,'reader page loaded');
  /* opened by the hotkey: the last input was the keyboard */
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Alt',code:'AltLeft',windowsVirtualKeyCode:18});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Alt',code:'AltLeft',windowsVirtualKeyCode:18});
  await cdp.evaluate(`(()=>{window.__tomoyoMode.set('translation');document.body.classList.add('tomoyo-gal-bound');setTimeout(()=>dispatchEvent(new CustomEvent('tome-region-applied',{detail:{surfaceWidth:innerWidth*devicePixelRatio,surfaceHeight:innerHeight*devicePixelRatio}})),0);window.__tomoyoChinese.toggleGalMenu();return 1})()`);
  await sleep(1500);
  const opened=JSON.parse(await cdp.evaluate(RINGS));
  assert.deepEqual(opened.ringed,[],'no ring after opening: '+JSON.stringify(opened));
  assert.equal(opened.isDialog,true,'the first focus is the panel itself: '+JSON.stringify(opened));
  assert.deepEqual(opened.page,['none','none']);
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await sleep(200);
  const tabbed=JSON.parse(await cdp.evaluate(RINGS));
  assert.equal(tabbed.inDialog&&!tabbed.isDialog,true,'Tab moved into the controls: '+JSON.stringify(tabbed));
  assert.equal(tabbed.visible,true);assert.equal(tabbed.ringed.length,1,'one ring, on the focused control: '+JSON.stringify(tabbed));
  assert.doesNotMatch(tabbed.outline,/auto|rgb\(153, 200, 255\)|rgb\(16, 16, 16\)/,'not the browser\'s default ring: '+tabbed.outline);
  /* a mouse click on a button: focused, no ring */
  const at=JSON.parse(await cdp.evaluate(`(()=>{const b=[...document.querySelectorAll('.tomoyo-cn-dialog[open] .tomoyo-menu-tabs button')][1];const r=b.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});})()`));
  for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,x:at.x,y:at.y,button:'left',clickCount:1});await sleep(250);
  const clicked=JSON.parse(await cdp.evaluate(RINGS));
  assert.deepEqual(clicked.ringed,[],'no ring after a mouse click: '+JSON.stringify(clicked));
 }finally{await cdp?.stop();server?.close();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});
