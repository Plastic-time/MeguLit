// SPDX-License-Identifier: GPL-3.0-or-later
// E320 WITCH ON THE HOLY NIGHT (Steam, WoH.exe, LunaHook TYPEMOON ENHQ-4C@130160): user report 2026-11-10.
// Hiding stopped the game ("Micro Thread ... [0x80000012]") after a skip burst, every ruby line (<rふ>触</r>) kept its
// original, overlay lines were placed twice (the reader's flow page and the OCR page locator), the title-screen help
// was read as dialogue, and one line came in twice. Synthetic events and source checks; the C# rules run in
// HookBridge --self-test (Build-HookBridge.ps1).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {HookNative}=require('../core/hook-native.cjs');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
function fixture(t){t.mock.timers.enable({apis:['setTimeout']});let now=100000;const events=[],located=[];
 const hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},m=>events.push(m),()=>{},()=>now);hook.trace=()=>{};t.after(()=>hook.stop());
 hook.flowPage=true;hook.locate=text=>located.push(text);
 return {hook,events,located,line(text){hook.source({text,sourceName:'typemoon',origin:'live'},'');},tick(ms){now+=ms;t.mock.timers.tick(ms);},
  sources:()=>events.filter(m=>typeof m.hookSource==='string'&&m.hookSource).map(m=>[m.hookSource,m.hookSourceEngine])};}

test('WoH lines are placed only by the reader\'s flow page: no OCR page lookups, OCR page reports ignored',t=>{
 const f=fixture(t);
 f.line('　山中の冬は寒すぎて、朝はいつも辛かった。');f.tick(500);
 f.hook.pageLine({type:'hookEngineLine',engine:'ocr',phase:'begin',line:1,same:false,nvl:true,x0:100,y0:-40,x1:900,y1:-40,size:30,sw:1280,sh:720,count:0,text:''});
 f.hook.pageLine({type:'hookEngineLine',engine:'ocr',phase:'end',line:1,same:false,nvl:true,x0:100,y0:-40,x1:900,y1:-40,size:30,sw:1280,sh:720,count:20,text:'山中の冬は寒すぎて、朝はいつも辛かった。'});
 f.line('　お父さんは自動車で駅まで送ってくれるけれど、');f.tick(500);
 assert.deepEqual(f.located,[],'no OCR lookups');
 assert.equal(f.events.filter(m=>m.type==='hookPage'||m.type==='hookTextPos').length,0,'no OCR page or position');
 assert.deepEqual(f.sources().map(s=>s[1]),['nvl','nvl'],'each line once, as a flow line');
});

test('WoH title-screen help text is not read as a story line',t=>{
 const f=fixture(t);
 f.line("Change text display speed.Change auto-scroll speed.Change window opacity.Don't show text outline.");f.tick(500);
 f.line('　彼女の家は山の中腹にあった。');f.tick(500);
 assert.deepEqual(f.sources(),[['　彼女の家は山の中腹にあった。','nvl']]);
});

test('a WoH line delivered twice in one piece is read once',t=>{
 const f=fixture(t);
 f.line('　山中の冬は寒すぎて、朝はいつも辛かった。　山中の冬は寒すぎて、朝はいつも辛かった。');f.tick(500);
 assert.deepEqual(f.sources(),[['　山中の冬は寒すぎて、朝はいつも辛かった。','nvl']]);
 assert.equal(HookNative.undouble('「はい」「はい」'),'「はい」「はい」','short repeats are real dialogue');
 assert.equal(HookNative.undouble('ふつうの文です。ちがう文です。'),'ふつうの文です。ちがう文です。');
});

test('other games keep OCR page lookups and English text',t=>{
 const f=fixture(t);f.hook.flowPage=false;
 f.line('Good evening, everyone.');f.tick(500);
 assert.deepEqual(f.located,['Good evening, everyone.']);
 assert.deepEqual(f.sources(),[['Good evening, everyone.','']]);
});

test('hiding rules: HuneX ruby lines are blanked with their tags, skip bursts go back unchanged, old unsafe marks expire',()=>{
 const policy=read('native/EmbedTextPolicy.cs'),bridge=read('native/HookBridge.cs');
 assert.match(policy,/public const int Version = 2;/);
 assert.match(policy,/if \(Ruby\.IsMatch\(value\)\) return HideRuby\(value\);\r?\n\s+if \(Resource\.IsMatch\(value\) \|\| Container\(value\)\) return "";/,'ruby is handled before the path check that "</r>" tripped');
 assert.match(policy,/Hide\("　彼女がはじめて命に<rふ>触<\/r>れた、<rしず>厳<\/r>かな朝の出来事だ。"\) == "　+<r　>　<\/r>　+<r　　>　<\/r>　+"/,'self-test covers a two-ruby line');
 assert.match(bridge,/burst&&candidate\.name=="typemoon"&&replacement\.Length>0\)\{replacement="";/);
 assert.match(bridge,/text!=LastEmbedText/,'a redraw of the same line is still hidden');
 assert.match(bridge,/\{"policy",EmbedTextPolicy\.Version\}/);
 assert.match(bridge,/Convert\.ToInt32\(p\)>=EmbedTextPolicy\.Version/);
});

test("E323: the wait marker moving up the page is the game's page turn; moving down is the next line",t=>{
 const f=fixture(t);const pages=()=>f.events.filter(m=>m.type==='hookPage').map(m=>[m.engine,m.same,m.line]);
 const marker=(y,active=true)=>f.hook.markerTarget({active,x:900,y,width:24,height:24,clientWidth:1378,clientHeight:775});
 marker(300);marker(360);marker(420);assert.deepEqual(pages(),[],'down the page: same page');
 marker(425);assert.deepEqual(pages(),[],'a wobble smaller than the marker is not a turn');
 marker(180);assert.deepEqual(pages(),[['nvl',false,1]],'up by rows: new page');
 marker(240);marker(170);assert.deepEqual(pages(),[['nvl',false,1],['nvl',false,2]]);
 f.hook.flowPage=false;marker(500);marker(100);assert.equal(pages().length,2,'other games: no flow page turns');
 const {Page}=require('../web/reader/modules/island-page.js');const model=new Page();
 model.flow('古いページの文。',1);model.records[0].at=Date.now()-5000;model.flow('新しいページの一文目。',2);
 assert.equal(model.clearFlow(),true);assert.deepEqual(model.records.map(r=>r.source),['新しいページの一文目。']);
 model.records[0].at=Date.now()-5000;model.clearFlow();assert.deepEqual(model.records,[],'a turn with no fresh line clears everything');
});

test("E323 wiring: per-sentence indent, marker on the current line, box probes off on a flow page",()=>{
 const gal=read('web/reader/modules/gal.js'),wait=read('web/reader/modules/wait-marker.js'),imm=read('core/immersion.cjs'),view=read('web/reader/modules/island-page.js');
 assert.match(gal,/for\(const sentence of document\.querySelectorAll\('\.sentence-text'\)\)\{\r?\n\s+let leading=!sentence\.closest\('\.tome-island-flow'\);/);
 assert.match(wait,/\.tome-island-pair\.tome-island-current/);
 assert.match(imm,/source\(text,engine\)\{this\.flow=engine==='nvl';/);assert.match(imm,/scene\(visible,why='scene'\)\{[^}]*\|\|this\.flow\)return;/);assert.match(imm,/autoBox\(visible\)\{[^}]*\|\|this\.flow\)return;/);
 assert.match(view,/\.tome-island-flow \.sentence-text\[data-megulit-native-breaks\]\{white-space:pre-wrap!important/,"a paragraph with the game's own breaks still wraps at the box width");
 assert.doesNotMatch(view,/--tomoyo-gal-gap'\)\)\|\|8/,'the slider gap is not added between lines');
});
