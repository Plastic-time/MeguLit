// SPDX-License-Identifier: GPL-3.0-or-later
// E306: engines without their own page DLL (BGI, Siglus, Artemis, ...) get sentence positions from the picture.
// GalWindowBridge's PageLocator reads the game client, runs the system's Japanese OCR, aligns the hook line to the OCR
// rows and reports hookEngineLine engine=ocr (after the hook line, unlike krkr/renpy which report before). These tests
// drive hook-native with synthetic OCR reports and check the request path in gal-native; the alignment itself is C#
// (PageLocator.SelfTest / OcrSelfTest, run by --page-locator-self-test and --page-locator-ocr-test).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {HookNative}=require('../core/hook-native.cjs');
const IslandSource=require('../core/island-source.js');
const {Page}=require('../web/reader/modules/island-page.js');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');

function fixture(t){t.mock.timers.enable({apis:['setTimeout']});let now=100000;const events=[],located=[];
 const hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},m=>events.push(m),()=>{},()=>now);hook.trace=()=>{};hook.locate=text=>located.push(text);t.after(()=>hook.stop());
 const box={x0:120,y0:96,x1:1040,y1:96,size:30,sw:1280,sh:720};
 return {hook,events,located,
  hookLine(text){hook.source({text,sourceName:'BGI',origin:'live'},'');},
  ocr(line,same,nvl,text,extra={}){const rows=text.split('\n');const m={type:'hookEngineLine',engine:'ocr',line,same,nvl,...box,y1:box.y0+40*(rows.length-1),...extra};hook.pageLine({...m,phase:'begin',count:0,text:''});hook.pageLine({...m,phase:'end',count:[...text.replace(/\n/g,'')].length,text});},
  tick(ms){now+=ms;t.mock.timers.tick(ms);},
  sources:()=>events.filter(m=>typeof m.hookSource==='string'&&m.hookSource),
  of:type=>events.filter(m=>m.type===type)};}

test('every live hook line is sent to the locator; history and page-engine games are not',t=>{
 const f=fixture(t);
 f.hookLine('最初の台詞。');f.hook.source({text:'履歴の文。',sourceName:'BGI',origin:'history'},'');
 assert.deepEqual(f.located,['最初の台詞。']);
 f.hook.pageLine({type:'hookEngineLine',engine:'krkr',phase:'begin',line:1,same:false,nvl:false,x0:0,y0:0,x1:0,y1:0,size:20,sw:1280,sh:720,count:0,text:''});
 f.tick(100);f.hookLine('KiriKiri の台詞。');
 assert.deepEqual(f.located,['最初の台詞。'],'a game with its own page DLL is never read by OCR');
});

test('an ADV game reads exactly as before: lines go straight through, OCR says nvl=0, nothing is held',t=>{
 const f=fixture(t);
 f.hookLine('アドベンチャーの台詞です。');assert.deepEqual(f.sources().map(m=>m.hookSource),['アドベンチャーの台詞です。']);
 f.tick(900);f.ocr(1,false,false,'アドベンチャーの台詞です。');
 f.tick(3000);f.hookLine('次の台詞です。');
 assert.deepEqual(f.sources().map(m=>m.hookSource),['アドベンチャーの台詞です。','次の台詞です。']);
 assert.equal(f.of('hookPage').length,0);assert.equal(f.of('hookTextPos').length,0);
});

test('a full-screen page: the first sentence is re-read as the page\'s with the game\'s rows, later ones wait for OCR',t=>{
 const f=fixture(t);
 f.hookLine('春の風が吹いていた。窓の外では桜が散り始めている。');
 assert.equal(f.sources().length,1,'delivered at once: OCR has not spoken yet');
 f.tick(1200);f.ocr(1,false,true,'春の風が吹いていた。窓の外では\n桜が散り始めている。');
 let s=f.sources();assert.deepEqual(s.map(m=>[m.hookSource,m.hookSourceEngine,m.hookSourceLine]),[['春の風が吹いていた。窓の外では桜が散り始めている。','',0],['春の風が吹いていた。窓の外では\n桜が散り始めている。','ocr',2]]);
 f.tick(2000);f.hookLine('「おはよう」と彼女は言った。');
 assert.equal(f.sources().length,2,'on a page the hook line waits for its box');
 f.tick(1500);f.ocr(2,true,true,'「おはよう」と彼女は言った。',{y0:176,y1:176});
 s=f.sources();assert.deepEqual(s.at(-1).hookSource,'「おはよう」と彼女は言った。');
 assert.deepEqual(f.of('hookPage').map(p=>[p.engine,p.line,p.same]),[['ocr',1,false],['ocr',2,false],['ocr',4,true]]);
 assert.deepEqual(f.of('hookTextPos').map(p=>[p.engine,p.line,p.y0,p.sw,p.sh,p.token]),[['ocr_screen_v1',2,96,1280,720,IslandSource.token('春の風が吹いていた。窓の外では\n桜が散り始めている。')],['ocr_screen_v1',4,176,1280,720,IslandSource.token('「おはよう」と彼女は言った。')]]);
});

test('a line OCR never finds on the page is still read, as an ordinary line, after 5 s',t=>{
 const f=fixture(t);
 f.hookLine('ページの文。');f.tick(800);f.ocr(1,false,true,'ページの文。');
 f.tick(3000);f.hookLine('画面に出ない文字列');
 f.tick(4900);assert.equal(f.sources().length,2);
 f.tick(200);assert.equal(f.sources().at(-1).hookSource,'画面に出ない文字列');
});

test('leaving the page (OCR nvl=0) releases a held line at once and turns page mode off',t=>{
 const f=fixture(t);
 f.hookLine('ページの文。');f.tick(800);f.ocr(1,false,true,'ページの文。');
 f.tick(3000);f.hookLine('ウィンドウに戻った台詞。');assert.equal(f.sources().length,2);
 f.tick(600);f.ocr(2,false,false,'ウィンドウに戻った台詞。',{y0:600,y1:600});
 assert.equal(f.sources().at(-1).hookSource,'ウィンドウに戻った台詞。');assert.equal(f.sources().at(-1).hookSourceEngine,'');
});

test('the reader lays out ocr pages like the native page engines',t=>{
 const f=fixture(t),model=new Page();let seq=0;
 f.hookLine('一行目二行目');f.tick(800);f.ocr(1,false,true,'一行目\n二行目');
 f.tick(2000);f.hookLine('三つ目');f.tick(800);f.ocr(2,true,true,'三つ目',{y0:200,y1:200});
 for(const m of f.events.splice(0)){if(m.type==='hookPage')model.page(m);else if(m.type==='hookTextPos')model.position(m);else if(typeof m.hookSource==='string'&&m.hookSource&&m.hookSourceEngine==='ocr')model.source(IslandSource.spoken(m.hookSource),++seq,m.hookSourceLine);}
 assert.deepEqual(model.records.map(r=>[r.source,r.line,r.position?.engine,r.position?.y0]),[['一行目\n二行目',2,'ocr_screen_v1',96],['三つ目',4,'ocr_screen_v1',200]]);
});

test('gal-native forwards OCR reports to hook-native and sends pageLocate for each live line',()=>{
 const {GalNative}=require('../core/gal-native.cjs');
 const src=read('core/gal-native.cjs');
 assert.match(src,/this\.hooks\.locate=text=>\{if\(this\.state\.bound&&this\.preferences\?\.pageLocate!==false\)this\.send\(\{type:'pageLocate',text\}\);\}/);
 assert.match(src,/if\(message\.type==='hookEngineLine'\)\{this\.hooks\.pageLine\?\.\(message\);return;\}/);
 assert.match(src,/message\.type==='pageLocateStatus'/);
 assert.ok(GalNative);
});

test('the native pieces stay wired: PageLocator in GalWindowBridge, its self-tests in the build, the reader sets',()=>{
 const bridge=read('native/GalWindowBridge.cs'),locator=read('native/PageLocator.cs'),build=read('native/Build-GalWindowBridge.ps1');
 assert.match(bridge,/type=="pageLocate"/);assert.match(bridge,/PageLocate=new PageLocator\(Emit\)/);assert.match(bridge,/--page-locator-self-test/);assert.match(bridge,/--page-locator-ocr-test/);
 for(const name of ['OcrEngine.TryCreateFromLanguage(new Language("ja"))','GameCapture.Into','engine = "ocr"','public static Found Find','public static bool SelfTest','public static string OcrSelfTest'])assert.ok(locator.includes(name),name);
 assert.match(build,/'PageLocator\.cs'/);assert.match(build,/--page-locator-self-test/);
 for(const f of ['web/reader/modules/island-page.js','core/island-page.js'])assert.match(read(f),/\(\?:krkr\|renpy\|ocr\)_screen_v1/,f);
});
