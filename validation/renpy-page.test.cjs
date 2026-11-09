// SPDX-License-Identifier: GPL-3.0-or-later
// E301: Ren'Py NVL pages. MeguLitRenpy32/64.dll runs native/MeguLitRenpy.py in the game's own Python; the script reports
// each sentence with the box Ren'Py laid it out in and the rows it drew, over the same ToMe_<ENGINE> protocol as
// KiriKiri (E300). These tests run the script against the stand-in Ren'Py (native/renpytext/selftest/host.py --sink),
// parse its lines the way HookBridge does, and feed them through hook-native and the reader's page model.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {HookNative,PAGE_ENGINES}=require('../core/hook-native.cjs');
const IslandSource=require('../core/island-source.js');
const {Page}=require('../web/reader/modules/island-page.js');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');

// HookBridge.PageInfo, line for line.
function pageInfo(s){const m=/^ToMe_(KRKR|RENPY) (begin|end) line=(\d+) same=([01]) nvl=([01]) x0=(-?\d+) y0=(-?\d+) x1=(-?\d+) y1=(-?\d+) size=(\d+) sw=(\d+) sh=(\d+) n=(\d+)(?: text=(.*))?$/.exec(s);if(!m)return null;const n=i=>Number(m[i]);
 return {type:'hookEngineLine',engine:m[1].toLowerCase(),phase:m[2],line:n(3),same:m[4]==='1',nvl:m[5]==='1',x0:n(6),y0:n(7),x1:n(8),y1:n(9),size:n(10),sw:n(11),sh:n(12),count:n(13),text:(m[14]??'').replace(/\u001f/g,'\n')};}

function python(){for(const [cmd,args] of [['python',['-I']],['py',['-3','-I']]]){const r=spawnSync(cmd,[...args,'-c','import sys;print(sys.version_info[0])'],{encoding:'utf8'});if(r.status===0&&r.stdout.trim()==='3')return [cmd,args];}return null;}
const py=python();
function scriptLines(){const r=spawnSync(py[0],[...py[1],path.join(root,'native/renpytext/selftest/host.py'),'--sink',path.join(root,'native/MeguLitRenpy.py')],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);}

function fixture(t){t.mock.timers.enable({apis:['setTimeout']});let now=100000;const events=[];
 const hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},m=>events.push(m),()=>{},()=>now);hook.trace=()=>{};t.after(()=>hook.stop());
 return {hook,events,tick(ms){now+=ms;t.mock.timers.tick(ms);},
  feed(lines){for(const l of lines){const m=pageInfo(l);if(m)hook.pageLine(m);}},
  hookLine(text){hook.source({text,sourceName:'RenPy',origin:'live'},'');},
  sources:()=>events.filter(m=>typeof m.hookSource==='string'&&m.hookSource),
  of:type=>events.filter(m=>m.type===type)};}

test('the script reports each NVL sentence with its screen box, its rows, ruby left out, and ADV lines as nvl=0',{skip:!py&&'no CPython 3 on PATH'},()=>{
 const lines=scriptLines();
 assert.equal(lines[0],'ToMe_RENPY status ok');
 const info=lines.map(pageInfo).filter(Boolean);
 assert.deepEqual(info.map(m=>[m.engine,m.phase,m.line,m.same,m.nvl]),[['renpy','begin',1,false,true],['renpy','end',1,false,true],['renpy','begin',2,true,true],['renpy','end',2,true,true],['renpy','begin',3,false,false],['renpy','begin',4,false,true],['renpy','end',4,false,true]]);
 const end=info.filter(m=>m.phase==='end');
 assert.deepEqual(end.map(m=>[m.x0,m.y0,m.x1,m.y1,m.size,m.sw,m.sh,m.count]),[[120,80,316,118,28,1280,720,14],[220,250,290,250,14,1280,720,6],[120,80,232,80,28,1280,720,5]],'virtual pixels: 2x drawable layout unscaled, window offsets added, the zoomed branch scaled');
 assert.deepEqual(end.map(m=>m.text),['春の風が吹いた。\n二行目です。','漢字を読む。','新しい頁。'],'rows as Ren\'Py broke them; ruby and the click mark are not text');
});

test('hook-native turns the reports into page lines, positions and sources; ADV clears page mode',{skip:!py&&'no CPython 3 on PATH'},t=>{
 const f=fixture(t),lines=scriptLines();
 f.feed(lines.slice(0,6));
 assert.deepEqual(f.sources().map(m=>[m.hookSource,m.hookSourceEngine,m.hookSourceLine]),[['春の風が吹いた。\n二行目です。','renpy',2],['漢字を読む。','renpy',4]]);
 assert.deepEqual(f.of('hookPage').map(p=>[p.engine,p.line,p.same]),[['renpy',1,false],['renpy',2,false],['renpy',4,true]]);
 assert.deepEqual(f.of('hookTextPos').map(p=>[p.engine,p.line,p.x0,p.y0,p.size,p.token]),[['renpy_screen_v1',2,120,80,28,IslandSource.token('春の風が吹いた。\n二行目です。')],['renpy_screen_v1',4,220,250,14,IslandSource.token('漢字を読む。')]]);
 f.tick(2000);f.hookLine('普通の台詞。');f.tick(100);
 assert.equal(f.sources().at(-1).hookSource,'普通の台詞。','after nvl=0 the ADV hook line goes straight through');
 f.feed(lines.slice(6));
 assert.deepEqual(f.of('hookPage').slice(-2).map(p=>[p.line,p.same]),[[7,false],[8,false]],'the new NVL page clears the old one');
});

test('a hook line for the sentence (LunaHook\'s Python hook) is preferred and re-broken at Ren\'Py\'s rows',t=>{
 const f=fixture(t);
 f.feed(['ToMe_RENPY begin line=1 same=0 nvl=1 x0=120 y0=80 x1=316 y1=118 size=28 sw=1280 sh=720 n=14']);
 f.hookLine('春の風が吹いた。二行目です。');
 f.feed(['ToMe_RENPY end line=1 same=0 nvl=1 x0=120 y0=80 x1=316 y1=118 size=28 sw=1280 sh=720 n=14 text=春の風が吹いた。\u001f二行目です。']);
 assert.deepEqual(f.sources().map(m=>m.hookSource),['春の風が吹いた。\n二行目です。']);
});

test('switching engines resets the page state; unknown engines are not page engines',t=>{
 const f=fixture(t);
 assert.deepEqual([...PAGE_ENGINES].sort(),['krkr','ocr','renpy']);
 f.hook.pageLine({type:'hookEngineLine',engine:'krkr',phase:'begin',line:1,same:false,nvl:true,x0:0,y0:0,x1:0,y1:0,size:20,sw:1280,sh:720,count:0,text:''});
 f.feed(['ToMe_RENPY begin line=1 same=0 nvl=1 x0=10 y0=10 x1=10 y1=10 size=20 sw=1280 sh=720 n=0','ToMe_RENPY end line=1 same=0 nvl=1 x0=10 y0=10 x1=10 y1=10 size=20 sw=1280 sh=720 n=2 text=新頁']);
 assert.deepEqual(f.of('hookPage').map(p=>[p.engine,p.line]),[['krkr',1],['renpy',1],['renpy',2]],'line 1 of the new engine is not mistaken for the old engine\'s line 1');
 assert.equal(pageInfo('ToMe_OTHER begin line=1 same=0 nvl=1 x0=0 y0=0 x1=0 y1=0 size=9 sw=1 sh=1 n=0'),null);
});

test('the reader lays out renpy pages like ISLAND and KiriKiri ones',t=>{
 const f=fixture(t),model=new Page();let seq=0;
 f.feed(['ToMe_RENPY begin line=1 same=0 nvl=1 x0=120 y0=80 x1=316 y1=118 size=28 sw=1920 sh=1080 n=14','ToMe_RENPY end line=1 same=0 nvl=1 x0=120 y0=80 x1=316 y1=118 size=28 sw=1920 sh=1080 n=14 text=一行目\u001f二行目',
  'ToMe_RENPY begin line=2 same=1 nvl=1 x0=120 y0=200 x1=316 y1=200 size=28 sw=1920 sh=1080 n=3','ToMe_RENPY end line=2 same=1 nvl=1 x0=120 y0=200 x1=316 y1=200 size=28 sw=1920 sh=1080 n=3 text=三つ目']);
 for(const m of f.events.splice(0)){if(m.type==='hookPage')model.page(m);else if(m.type==='hookTextPos')model.position(m);else if(typeof m.hookSource==='string'&&m.hookSource)model.source(IslandSource.spoken(m.hookSource),++seq,m.hookSourceLine);}
 assert.deepEqual(model.records.map(r=>[r.source,r.line,r.position?.engine,r.position?.y0,r.position?.sw]),[['一行目\n二行目',2,'renpy_screen_v1',80,1920],['三つ目',4,'renpy_screen_v1',200,1920]]);
 for(const f2 of ['web/reader/modules/island-page.js','core/island-page.js']){const s=read(f2);assert.match(s,/new Set\(\['cs2','krkr','renpy','ocr'\]\)/,f2);assert.match(s,/\(\?:krkr\|renpy\|ocr\)_screen_v1/,f2);}
 for(const f2 of ['web/reader/modules/hook-reader.js','core/hook-reader.js'])assert.equal((read(f2).match(/\^\(\?:cs2\|krkr\|renpy\|ocr\)\$/g)||[]).length,4,f2);
});

test('the native pieces stay wired: DLL, script, HookBridge protocol, injection allow-list and release list',()=>{
 const cpp=read('native/renpytext/RenpyText.cpp'),script=read('native/MeguLitRenpy.py'),bridge=read('native/HookBridge.cs');
 for(const api of ['Py_IsInitialized','PyGILState_Ensure','PyGILState_Release','PyRun_SimpleStringFlags','MeguLitRenpy.py'])assert.ok(cpp.includes(api),api);
 for(const name of ['display_say','render_screen','render_of','children','get_layout','unscale_pair','nvl_list','screen_width','MeguLitRenpy-'])assert.ok(script.includes(name),name);
 assert.match(bridge,/\^ToMe_\(KRKR\|RENPY\) \(begin\|end\)/);
 assert.match(bridge,/PageDll\(dll,"MeguLitRenpy-","RENPY",loader,args\)/);assert.match(bridge,/RenpyText\(bit,loader,args\);/);assert.match(bridge,/PageSelfTest\(\)/);
 const inj=read('native/HookInjector.cs');assert.match(inj,/"MeguLitRenpy64\.dll"/);assert.match(inj,/"MeguLitRenpy32\.dll"/);
 const rel=read('Release.ps1');for(const f of ['MeguLitRenpy32.dll','MeguLitRenpy64.dll','MeguLitRenpy.py'])assert.ok(rel.includes('native/'+f),f);
});
