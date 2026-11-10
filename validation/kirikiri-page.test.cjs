// SPDX-License-Identifier: GPL-3.0-or-later
// E300: KiriKiri full-screen pages (ライムライト・レモネードジャム). MeguLitKrkr32.dll reports each sentence of a KAG message
// layer (begin at its first character, end at its click wait, with its box and the text it drew); HookBridge turns each
// report into hookEngineLine. These synthetic draw events check the pairing with the hook's text, the game's own line
// breaks, page clears, the page model the reader lays out, and that ADV KiriKiri games read exactly as before.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {HookNative}=require('../core/hook-native.cjs');
const IslandSource=require('../core/island-source.js');
const {Page}=require('../web/reader/modules/island-page.js');
function fixture(t){t.mock.timers.enable({apis:['setTimeout']});let now=100000;const events=[];
 const hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},m=>events.push(m),()=>{},()=>now);hook.trace=()=>{};t.after(()=>hook.stop());
 const box={x0:120,y0:96,x1:1040,y1:96,size:30,sw:1280,sh:720,count:0};
 return {hook,events,
  hookLine(text){hook.source({text,sourceName:'KiriKiriZ',origin:'live'},'');},
  begin(line,same,nvl=true){hook.pageLine({type:'hookEngineLine',engine:'krkr',phase:'begin',line,same,nvl,...box,x1:1130,text:''});},
  end(line,same,text,nvl=true,extra={}){hook.pageLine({type:'hookEngineLine',engine:'krkr',phase:'end',line,same,nvl,...box,y1:96+40*(text.split('\n').length-1),count:[...text].length,text,...extra});},
  tick(ms){now+=ms;t.mock.timers.tick(ms);},
  sources:()=>events.filter(m=>typeof m.hookSource==='string'&&m.hookSource).map(m=>m.hookSource),
  of:type=>events.filter(m=>m.type===type)};}

test('a full-screen page delivers each sentence with the game\'s own line breaks, its box and its page',t=>{
 const f=fixture(t);
 f.begin(1,false);f.hookLine('春の風が吹いていた。窓の外では桜が散り始めている。');f.tick(1200);
 f.end(1,false,'春の風が吹いていた。窓の外では\n桜が散り始めている。');
 f.begin(2,true);f.hookLine('「おはよう」と彼女は言った。');f.tick(600);
 f.end(2,true,'「おはよう」と彼女は言った。');
 assert.deepEqual(f.sources(),['春の風が吹いていた。窓の外では\n桜が散り始めている。','「おはよう」と彼女は言った。']);
 const pages=f.of('hookPage');
 assert.deepEqual(pages.map(p=>[p.engine,p.line,p.same]),[['krkr',1,false],['krkr',2,false],['krkr',4,true]]);
 assert.equal(pages[0].token,0);
 assert.equal(pages[1].token,IslandSource.token('春の風が吹いていた。窓の外では\n桜が散り始めている。'));
 const pos=f.of('hookTextPos');
 assert.deepEqual(pos.map(p=>[p.engine,p.line,p.x0,p.y0,p.y1,p.sw,p.sh]),[['krkr_screen_v1',2,120,96,136,1280,720],['krkr_screen_v1',4,120,96,96,1280,720]]);
 const sourceEvents=f.events.filter(m=>typeof m.hookSource==='string'&&m.hookSource);
 assert.deepEqual(sourceEvents.map(m=>[m.hookSourceEngine,m.hookSourceLine]),[['krkr',2],['krkr',4]]);
});

test('hook text that arrives before the first character is paired with that sentence',t=>{
 const f=fixture(t);
 f.begin(1,false);f.tick(400);f.end(1,false,'ページの最初の文。');
 f.hookLine('先に届いた原文の一文。');f.tick(80);f.begin(2,true);f.tick(900);f.end(2,true,'先に届いた原文の一文。');
 assert.deepEqual(f.sources(),['ページの最初の文。','先に届いた原文の一文。']);
});

test('a blanked original (hide mode) takes the hook text, re-broken at the rows the game drew',t=>{
 const f=fixture(t);
 f.begin(1,false);f.hookLine('あいうえおかきくけこさしす');f.tick(700);
 f.end(1,false,'　　　　　\n　　　　　\n　　　');
 assert.deepEqual(f.sources(),['あいうえお\nかきくけこ\nさしす']);
 assert.equal(HookNative.pageText('　　\n　　','あいうえお'),'あいうえお','row lengths that do not add up keep the hook text whole');
 assert.equal(HookNative.pageText('翻訳文\n二行目です','元の日本語の文です'),'元の日本語の文です','text written back by the embed is never shown as the original');
 assert.equal(HookNative.pageText('自分で描いた文','')==='自分で描いた文',true);
 assert.equal(HookNative.pageText('　　　',''),'');
});

test('without a selected hook stream the engine\'s drawn text is the source',t=>{
 const f=fixture(t);
 f.begin(1,false);f.tick(500);f.end(1,false,'フックが無くても\n読める文。');
 f.begin(2,true);f.tick(500);f.end(2,true,'二つ目。');
 assert.deepEqual(f.sources(),['フックが無くても\n読める文。','二つ目。']);
});

test('ADV KiriKiri games read exactly as before: hook lines go straight through, no page reports',t=>{
 const f=fixture(t);
 f.begin(1,false,false);f.hookLine('アドベンチャーの台詞です。');
 assert.deepEqual(f.sources(),['アドベンチャーの台詞です。']);
 f.end(1,false,'アドベンチャーの台詞です。',false);f.tick(2000);
 f.hookLine('次の台詞です。');f.begin(2,false,false);f.tick(2000);f.end(2,false,'次の台詞です。',false);
 assert.deepEqual(f.sources(),['アドベンチャーの台詞です。','次の台詞です。']);
 assert.equal(f.of('hookPage').length,0);assert.equal(f.of('hookTextPos').length,0);
});

test('leaving the full-screen page releases a held hook line to the ADV box at once',t=>{
 const f=fixture(t);
 f.begin(1,false);f.hookLine('ページの文。');f.tick(500);f.end(1,false,'ページの文。');f.tick(3000);
 f.hookLine('ウィンドウに戻った台詞。');assert.deepEqual(f.sources(),['ページの文。']);
 f.tick(100);f.begin(2,false,false);
 assert.deepEqual(f.sources(),['ページの文。','ウィンドウに戻った台詞。']);
});

test('a hook line no page sentence takes is dropped while the page is up',t=>{
 const f=fixture(t);
 f.begin(1,false);f.hookLine('ページの文。');f.tick(500);f.end(1,false,'ページの文。');
 f.tick(5000);f.hookLine('どこにも描かれない文字列');f.tick(1600);
 assert.deepEqual(f.sources(),['ページの文。']);
});

test('the reader\'s page model keeps a page\'s sentences at their own places and clears them at the next page',t=>{
 const f=fixture(t),model=new Page();let seq=0;
 const feed=()=>{for(const m of f.events.splice(0)){if(m.type==='hookPage')model.page(m);else if(m.type==='hookTextPos')model.position(m);else if(typeof m.hookSource==='string'&&m.hookSource)model.source(IslandSource.spoken(m.hookSource),++seq,m.hookSourceLine);}};
 f.begin(1,false);f.tick(400);f.end(1,false,'一段落目の一行目、\n一段落目の二行目。');feed();
 f.begin(2,true);f.tick(400);f.end(2,true,'二段落目。',true,{y0:200,y1:200});feed();
 assert.deepEqual(model.records.map(r=>[r.source,r.line,r.settled,r.position?.y0]),[['一段落目の一行目、\n一段落目の二行目。',2,true,96],['二段落目。',4,true,200]]);
 assert.equal(model.records[1].position.engine,'krkr_screen_v1');
 f.begin(3,false);feed();
 assert.equal(model.records.length,0,'the new page clears the old one at its first character');
 f.tick(400);f.end(3,false,'次のページ。');feed();
 assert.deepEqual(model.records.map(r=>[r.source,r.line]),[['次のページ。',6]]);
});

test('the native pieces stay wired: DLL source, HookBridge protocol and injection allow-list',()=>{
 const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
 const script=read('native/krkrtext/script.inc'),bridge=read('native/HookBridge.cs');
 for(const name of ['processCh','showLineBreak','showPageBreak','lineLayerPos','lineLayerOriginY','fontSize','marginR'])assert.ok(script.includes(name),name);
 assert.match(script,/ToMe_KRKR '\+kind\+' line=/);
 assert.match(read('native/krkrtext/KrkrText.cpp'),/MeguLitKrkr-%lu/);
 assert.match(bridge,/PageDll\(dll,"MeguLitKrkr-","KRKR",loader,args\)/);assert.match(bridge,/KrkrText\(bit,loader,args\);/);
 assert.match(read('native/HookInjector.cs'),/"MeguLitKrkr32\.dll"/);
 assert.match(read('Release.ps1'),/MeguLitKrkr32\.dll/);
 // E321 (ライムライト on a friend's PC: no page layout at all): 64-bit KiriKiri Z gets its own build of the same DLL.
 assert.match(read('native/HookInjector.cs'),/"MeguLitKrkr64\.dll"/);assert.match(read('Release.ps1'),/MeguLitKrkr64\.dll/);
 assert.match(read('native/krkrtext/build.cmd'),/MeguLitKrkr64\.dll/);assert.doesNotMatch(bridge,/page DLL is 32-bit only/);
 assert.match(script,/chColor/);assert.match(bridge,/color=\(\[0-9a-f\]\{6\}\)/);
});

test('E321: the colour the game drew a page sentence in reaches its position (read / unread colours)',t=>{
 const f=fixture(t);
 f.begin(1,false);f.tick(400);f.end(1,false,'既に読んだ文。',true,{color:'#a0b0ff'});
 f.begin(2,true);f.tick(400);f.end(2,true,'まだ読んでいない文。',true,{color:'not-a-colour'});
 const pos=f.of('hookTextPos');assert.equal(pos[0].color,'#a0b0ff');assert.equal('color' in pos[1],false);
});

// 魔法使いの夜 (Steam): on a full-screen page the game greys the sentences already read and keeps the newest one white.
// The embed follows: when the next sentence appears the previous one dims (CSS transition), a page turn clears them all.
test('full-screen embed: a new sentence dims the earlier ones, a page turn clears the page',t=>{
 const f=fixture(t),model=new Page();let seq=0;
 const feed=()=>{for(const m of f.events.splice(0)){if(m.type==='hookPage')model.page(m);else if(m.type==='hookTextPos')model.position(m);else if(typeof m.hookSource==='string'&&m.hookSource)model.source(IslandSource.spoken(m.hookSource),++seq,m.hookSourceLine);}};
 const look=()=>model.records.map(r=>[r.source,model.past(r)?'dim':'bright']);
 f.begin(1,false);f.tick(400);f.end(1,false,'ただし、残りの一割は真実だ。');feed();
 assert.deepEqual(look(),[['ただし、残りの一割は真実だ。','bright']],'a lone sentence is the current one');
 f.begin(2,true);f.tick(400);f.end(2,true,'今日はその一割の話。',true,{y0:200,y1:200});feed();
 assert.deepEqual(look(),[['ただし、残りの一割は真実だ。','dim'],['今日はその一割の話。','bright']]);
 // The next sentence's text can arrive before its place: the one on screen stays bright until the new one is shown.
 model.source('まだ描かれていない文。',++seq,0);
 assert.equal(model.current().source,'今日はその一割の話。');
 model.records.pop();
 f.begin(3,true);f.tick(400);f.end(3,true,'そういう時にかぎって彼女の怒りは純真な、',true,{y0:300,y1:300});feed();
 assert.deepEqual(look().map(x=>x[1]),['dim','dim','bright']);
 assert.deepEqual(model.records.map(r=>r.position.y0),[96,200,300],'every sentence keeps its own place');
 f.begin(4,false);feed();
 assert.equal(model.records.length,0,'the page turn clears the page');
 f.tick(400);f.end(4,false,'次のページ。');feed();
 assert.deepEqual(look(),[['次のページ。','bright']]);
 const view=fs.readFileSync(path.join(__dirname,'..','web/reader/modules/island-page.js'),'utf8');
 assert.match(view,/classList\.toggle\('tome-island-past',dim&&model\.past\(r\)\)/);
 assert.match(view,/\.tome-island-pair\{[^}]*transition:opacity/);
 assert.match(view,/\.tome-island-pair\.tome-island-past\{opacity:var\(--tome-island-past-opacity,\.3\)\}/,'E349: earlier lines are 30 % opaque, not darkened');assert.doesNotMatch(view,/tome-island-past\{filter/);
 assert.match(view,/dim=engine!=='cs2'/,'ISLAND (cs2) pages keep their look');
});

// ---- E305 FLOW pages (魔法使いの夜 Steam: no line positions, no page turns from the engine) ----
// A minimal DOM, enough for the reader's page view: class selectors, styles, and a height per line (40 px for the
// Japanese, 30 more once its translation is in).
function fakeWindow(layout){
 class ClassList{constructor(e){this.e=e;}get set(){return new Set(this.e.className.split(/\s+/).filter(Boolean));}contains(c){return this.set.has(c);}add(...c){const s=this.set;for(const x of c)s.add(x);this.e.className=[...s].join(' ');}remove(...c){const s=this.set;for(const x of c)s.delete(x);this.e.className=[...s].join(' ');}toggle(c,on){if(on===undefined)on=!this.contains(c);on?this.add(c):this.remove(c);return on;}}
 class Style{constructor(){this.props={};}set cssText(v){this.props={};for(const part of v.split(';')){const i=part.indexOf(':');if(i>0)this.props[part.slice(0,i).trim()]=part.slice(i+1).trim();}}setProperty(k,v){this.props[k]=v;}getPropertyValue(k){return this.props[k]||'';}get top(){return this.props.top;}}
 class El{constructor(tag){this.tag=tag;this.className='';this.children=[];this.parent=null;this.dataset={};this.style=new Style();this.classList=new ClassList(this);this.hidden=false;this._text='';}
  get isConnected(){let e=this;while(e.parent)e=e.parent;return e===doc.documentElement;}
  set textContent(v){this.children=[];this._text=String(v);}get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
  append(...c){for(const x of c){x.remove();x.parent=this;this.children.push(x);}}prepend(...c){for(const x of c.reverse()){x.remove();x.parent=this;this.children.unshift(x);}}
  remove(){if(this.parent){this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=null;}}
  get firstChild(){return this.children[0]||null;}
  matches(sel){return sel.split(',').some(s=>{const m=/^\.([^\[]+)(?:\[data-index="(\d+)"\])?$/.exec(s.trim());return !!m&&this.classList.contains(m[1])&&(m[2]===undefined||this.dataset.index===m[2]);});}
  before(x){x.remove();const p=this.parent;x.parent=p;p.children.splice(p.children.indexOf(this),0,x);}
  querySelectorAll(sel){const out=[];const walk=e=>{for(const c of e.children){if(c.matches(sel))out.push(c);walk(c);}};walk(this);return out;}
  querySelector(sel){return this.querySelectorAll(sel)[0]||null;}
  getBoundingClientRect(){if(!this.classList.contains('tome-island-pair'))return {height:0,top:0,bottom:0};const cn=this.querySelector('.tomoyo-cn-output'),h=40+(cn&&!cn.hidden&&cn.textContent?30:0),top=parseFloat(this.style.props.top)||0;return {height:h,top,bottom:top+h};}}
 const doc={createElement:t=>new El(t),addEventListener(){},querySelectorAll:sel=>doc.documentElement.querySelectorAll(sel)};
 doc.documentElement=new El('html');doc.head=new El('head');doc.body=new El('body');doc.documentElement.append(doc.head,doc.body);
 doc.body.classList.add('tomoyo-ui-translation','tomoyo-gal-bound');const native=new El('div');native.className='sentence-window';doc.body.append(native);
 const sent=[];
 const b={serial:0,isEnabled:()=>true,isTranslationVisible:()=>true,isGalBound:()=>true,galLayoutInfo:()=>layout,galPreferences:()=>({}),options:()=>({})};
 const w={document:doc,__tomoyoChinese:b,devicePixelRatio:1,requestAnimationFrame:f=>f(),addEventListener(){},__tomoyoTranslateRequest:m=>sent.push(JSON.parse(m)),
  getComputedStyle:()=>({getPropertyValue:()=>'10'}),TomoyoGameStyle:{paintFor:()=>({color:'#fff',gradient:'none',fill:'currentColor'}),paintVariables:()=>({})}};
 return {w,b,doc,sent};}

test('NVL without engine positions (魔法使いの夜): lines go down the page one by one, earlier ones dim, a full page turns',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const saved=global.MutationObserver;global.MutationObserver=class{observe(){}};t.after(()=>{global.MutationObserver=saved;});
 // Fresh module instance: install() binds to the window it is given.
 const file=require.resolve('../web/reader/modules/island-page.js');delete require.cache[file];const IslandPage=require(file);
 const {w,b,doc,sent}=fakeWindow({clientX:0,clientY:0,clientWidth:1280,clientHeight:720,readerX:100,readerY:60,readerWidth:1080,readerHeight:120});
 IslandPage.install(w);
 let seq=0;const say=text=>b.islandPage.accept({hookSource:text,hookSourceEngine:'nvl',hookSequence:++seq,hookSourceLine:0});
 const pairs=()=>doc.querySelectorAll('.tome-island-pair').filter(n=>!n.hidden).map(n=>[n.querySelector('.sentence-text').textContent,parseFloat(n.style.props.top),n.classList.contains('tome-island-past')?'dim':'bright']).sort((x,y)=>x[1]-y[1]);
 say('ただし、残りの一割は真実だ。');
 assert.deepEqual(pairs(),[['ただし、残りの一割は真実だ。',60,'bright']],'the first line starts at the top of the text box');
 assert.equal(sent.filter(m=>m.text).length,1,'a FLOW line is translated at once (no page report will come)');
 say('今日はその一割の話。');
 assert.deepEqual(pairs(),[['ただし、残りの一割は真実だ。',60,'dim'],['今日はその一割の話。',100,'bright']],'the next line sits right under the last (no extra gap: the slider gap lives inside each pair), the last one dims');
 const first=sent.find(m=>m.text==='ただし、残りの一割は真実だ。');b.deliverPageTranslation(first.id,'不过，剩下的一成是真的。');
 assert.deepEqual(pairs().map(p=>p[1]),[60,130],'a translation that comes in pushes the lines below it down');
 // E323: the game turned the page (wait marker moved up): the line that just arrived is the new page's first line, the rest go.
 say('新しいページの一文目。');assert.equal(pairs().length,3);
 b.islandPage.page({engine:'nvl',line:1,same:false,token:0});
 assert.deepEqual(pairs(),[['新しいページの一文目。',60,'bright']],'the new page keeps only its first line, back at the top of the box');
 // Translation display off: the translation row takes no room, lines sit one Japanese row apart.
 b.isTranslationVisible=()=>false;say('訳文なしの二文目。');
 assert.deepEqual(pairs().map(p=>p[1]),[60,100]);b.isTranslationVisible=()=>true;
 b.islandPage.page({engine:'nvl',line:2,same:false,token:0});
 for(let i=0;i<14;i++)say('次の文その'+i+'。');
 const shown=pairs();
 assert.ok(shown.at(-1)[1]+40<=720,'the newest line stays inside the game');
 assert.ok(shown.length<16,'the full page turned: earlier lines are gone');
 assert.equal(shown.at(-1)[2],'bright');assert.ok(shown.slice(0,-1).every(p=>p[2]==='dim'));
 assert.equal(shown[0][1],60,'the new page starts at the top again');
});

test('hook-native marks lines of WITCH ON THE HOLY NIGHT (WoH.exe) as an NVL flow page; other games unchanged',t=>{
 const {FLOW_PAGE_EXES}=require('../core/hook-native.cjs');
 assert.ok(FLOW_PAGE_EXES.test('WoH.exe'));assert.ok(FLOW_PAGE_EXES.test('WoH'),'GalWindowBridge reports Process.ProcessName without .exe');assert.ok(!FLOW_PAGE_EXES.test('WoHelper'));assert.ok(!FLOW_PAGE_EXES.test('魔法使之夜.exe'));
 const f=fixture(t);f.hookLine('普通の台詞。');f.tick(100);
 f.hook.flowPage=true;f.hookLine('今日はその一割の話。');f.tick(400);
 assert.deepEqual(f.events.filter(m=>m.hookSource).map(m=>[m.hookSource,m.hookSourceEngine]),[['普通の台詞。',''],['今日はその一割の話。','nvl']]);
});

test('E351 WoH page grid: lines sit on the game\'s rows and columns, wrap where the game wraps, and ignore the calibrated box',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const saved=global.MutationObserver;global.MutationObserver=class{observe(){}};t.after(()=>{global.MutationObserver=saved;});
 const file=require.resolve('../web/reader/modules/island-page.js');delete require.cache[file];const IslandPage=require(file);
 // A 1546x870 client at (58,85), like the user's screenshot; the (wrong) auto-calibrated box is ignored.
 const {w,b,doc}=fakeWindow({clientX:58,clientY:85,clientWidth:1546,clientHeight:870,readerX:900,readerY:500,readerWidth:600,readerHeight:100});
 IslandPage.install(w);let seq=0;const say=text=>b.islandPage.accept({hookSource:text,hookSourceEngine:'nvl',hookFlowGrid:'woh',hookSequence:++seq,hookSourceLine:0});
 const view=()=>doc.querySelectorAll('.tome-island-pair').filter(n=>!n.hidden).map(n=>({text:n.querySelector('.sentence-text').textContent,left:Math.round(parseFloat(n.style.props.left)),top:Math.round(parseFloat(n.style.props.top)),indent:Math.round(parseFloat(n.style.props['--tome-flow-indent'])),brs:n.querySelectorAll('.tome-flow-br').length,past:n.classList.contains('tome-island-past')})).sort((a,c)=>a.top-c.top||a.indent-c.indent);
 say('　数分後。');say('お父さんが車のボンネットを開けると、そこにはひとつの命があった。');
 const pitch=.0257*1546,row=.074*870,left=Math.round(58+.1445*1546),top0=Math.round(85+.174*870-row/2);
 assert.deepEqual(view().map(v=>[v.left,v.top,v.indent,v.brs,v.past]),[[left,top0,0,0,true],[left,top0,Math.round(5*pitch),1,false]],'the second sentence continues the first row after 「数分後。」 and breaks once, before 「ひ」');
 const br=doc.querySelectorAll('.tome-flow-br')[0];assert.equal(br.parent.children[br.parent.children.indexOf(br)+1].textContent,'ひ');
 say('　ただし、残りの一割は真実だ。');
 assert.equal(view().at(-1).top,Math.round(top0+2*row),'an indented sentence starts the row after the last one ended');
 const {gridLayout}=IslandPage;
 assert.deepEqual(gridLayout(['　青子自身、自分が慢性的な頭痛持ちなんじゃないかと疑うほど、無害なものに反感を覚える事があったりする。'],27)[0].breaks,[27],'27 cells: 「…疑う」|「ほど、…」 as the game wraps');
 assert.deepEqual(gridLayout(['　あいうえおかきくけこさしすせそたちつてとなにぬねのは。'],27)[0].breaks,[],'a stop may hang in a 28th cell');
 assert.match(fs.readFileSync(path.join(__dirname,'..','core/hook-control.cjs'),'utf8'),/!this\.styleCalibration&&!h\.hooks\?\.flowPage&&/,'no automatic box calibration on a flow page');
});
