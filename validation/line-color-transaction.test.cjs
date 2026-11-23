// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {HookNative}=require('../core/hook-native.cjs');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');

function fixture(t,prefs={}){
 t.mock.timers.enable({apis:['setTimeout']});
 const classes=new Set(),vars=new Map(),preferences={textColor:'#ffffff',readTextColor:'#ffff00',autoGameStyle:true,...prefs};
 const document={documentElement:{style:{setProperty:(k,v)=>vars.set(k,v),removeProperty:k=>vars.delete(k)}},head:{append(){}},
  body:{classList:{toggle(c,on){on?classes.add(c):classes.delete(c);},contains:c=>classes.has(c)}},
  querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>({}),addEventListener(){}};
 const b={galStatus(){},galPreferences:()=>preferences,galLayoutInfo:()=>({clientWidth:1280,clientHeight:720}),previewGalPosition(){}};
 const window={__tomoyoChinese:b,devicePixelRatio:1,__tomoyoTranslateRequest(){}};
 const ctx={window,document,MutationObserver:class{observe(){}},getComputedStyle:()=>({getPropertyValue:()=>'',fontSize:'28px'}),Date,setTimeout,clearTimeout};
 vm.createContext(ctx);
 vm.runInContext(read('web/reader/modules/game-style.js'),ctx);window.TomoyoGameStyle=ctx.TomoyoGameStyle;
 for(const f of ['island-source','hook-reader','text-position'])vm.runInContext(read('web/reader/modules/'+f+'.js'),ctx);
 let now=100000;const events=[];
 const route=m=>{events.push(m);if(m.type==='hookTextPos')b.textPosition(m);else b.galStatus(m);};
 const hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-color-fixture-log'},route,()=>{},()=>now);
 hook.trace=()=>{};hook.send=()=>{};t.after(()=>hook.stop());
 const box={nvl:false,same:false,x0:120,y0:540,x1:1000,y1:540,size:28,sw:1280,sh:720,count:0};
 return {b,hook,window,preferences,events,classes,
  source(text){now+=1000;hook.source({text,sourceName:'KiriKiriZ',origin:'live'},'');},
  draw(line,color,phase='begin',engine='krkr',text=''){hook.pageLine({type:'hookEngineLine',engine,line,phase,...box,...(color?{color}:{}),text});},
  status:m=>b.galStatus(m),color:()=>vars.get('--tomoyo-gal-line-color'),
  tick(ms){now+=ms;t.mock.timers.tick(ms);}};
}

test('real hook source / draw route changes read yellow to unread white within one second',t=>{
 const f=fixture(t);
 f.status({hookSourceRead:true});f.source('既に読んだ日本語の台詞です。');f.draw(1,'#ffff00');f.draw(1,'#ffff00','end');
 assert.equal(f.color(),'#ffff00');
 f.source('まだ読んでいない日本語の台詞です。');
 assert.equal(f.classes.has('tome-line-color'),false,'new source releases the previous draw before a fresh sample arrives');
 f.draw(2,'#ffffff');
 assert.equal(f.color(),'#ffffff','current engine white wins even when equal to the base colour');
 assert.equal(f.classes.has('tome-line-read'),true,'a stale read marker cannot override the fresh draw');
 assert.ok(f.events.some(m=>m.hookSource==='まだ読んでいない日本語の台詞です。'));
 f.status({hookSourceRead:false});assert.equal(f.color(),'#ffffff');
});

test('begin-before-source and source-before-begin both pair their own colour',t=>{
 const f=fixture(t);
 f.draw(1,'#ffff00');f.source('描画の後から届いた既読の文章です。');assert.equal(f.color(),undefined,'an early begin alone does not identify its source');
 f.draw(1,'#ffff00','end','krkr','描画の後から届いた既読の文章です。');assert.equal(f.color(),'#ffff00');
 f.source('描画より先に届いた未読の文章です。');f.draw(2,'#eeeeee');assert.equal(f.color(),'#eeeeee');
 f.draw(2,'#ffffff','end');assert.equal(f.color(),'#ffffff','final glyph sample refines this sentence');
 f.draw(2,undefined,'end');assert.equal(f.color(),'#ffffff','an absent end sample retains evidence from the same draw');
 f.draw(3,'#aabbcc');f.draw(3,'#abcdef','end','krkr','始めも終わりも先に届いた文章です。');f.source('始めも終わりも先に届いた文章です。');assert.equal(f.color(),'#abcdef');
});

test('late previous end, layout refresh and late previous begin cannot recolour the next sentence',t=>{
 const f=fixture(t);
 f.source('初めに表示された既読の文章です。');f.draw(1,'#ffff00');
 f.source('次に表示された未読の文章です。');assert.equal(f.color(),undefined);
 f.draw(1,'#ffff00','end');f.window.__tomeTextPosition.refresh();assert.equal(f.color(),undefined);
 f.draw(2,'#ffffff');assert.equal(f.color(),'#ffffff');
 f.draw(1,'#ffff00','end');f.draw(1,'#ffff00');f.window.__tomeTextPosition.refresh();assert.equal(f.color(),'#ffffff');
});

test('a sentence without a valid sample never borrows the previous sentence colour',t=>{
 const f=fixture(t,{readTextColor:''});
 f.source('色が指定されている文章です。');f.draw(1,'#ffff00');
 f.source('色が指定されていない文章です。');f.draw(2);assert.equal(f.color(),undefined);
 f.draw(2,'invalid','end');assert.equal(f.color(),undefined);
 f.window.__tomeTextPosition.refresh();assert.equal(f.color(),undefined);
 f.tick(61000);f.status({hookCheckState:'checking'});assert.equal(f.color(),undefined);
});

test('draw colours remain per sentence across many engines and repeated read/unread transitions',t=>{
 const f=fixture(t);
 for(let i=1;i<=40;i++){
  const color=i%2?'#ffff00':'#ffffff',engine=i<=20?'krkr':'renpy';
  f.source('次の日本語の文章を表示します'+i+'。');f.draw(i,color,'begin',engine);f.draw(i,color,'end',engine);
  assert.equal(f.color(),color);f.window.__tomeTextPosition.refresh();assert.equal(f.color(),color);
 }
});

test('session reset discards colour transactions and accepts restarted draw IDs',t=>{
 const f=fixture(t);
 f.source('再起動より前に描いた文章です。');f.draw(50,'#ffff00');
 f.status({type:'gameClosed'});assert.equal(f.color(),undefined);
 f.draw(1,'#ffffff');f.source('再起動した後に描いた文章です。');f.draw(1,'#ffffff','end','krkr','再起動した後に描いた文章です。');assert.equal(f.color(),'#ffffff');
 f.status({hookSource:null});assert.equal(f.color(),undefined,'clearing the source also clears colour ownership');
});

test('a confirmed end can colour the current sentence when attach missed its begin',t=>{
 const f=fixture(t),text='途中から接続しても今の文章を確かめます。';
 f.source(text);f.draw(9,'#ffffff','end','krkr',text);assert.equal(f.color(),'#ffffff');
 assert.equal(f.events.find(m=>m.type==='hookTextPos').sourceToken,require('../core/island-source.js').token(text));
 f.draw(8,'#ffff00','end','krkr','前に表示していた文章です。');assert.equal(f.color(),'#ffffff');
 f.draw(10,'#aabbcc','end','krkr','原文より先に終わりが届いた文章です。');assert.equal(f.color(),'#ffffff');
 f.source('原文より先に終わりが届いた文章です。');assert.equal(f.color(),'#aabbcc');
});

test('duplicate source and extra flush draws cannot leave a previous sentence pending for the next',t=>{
 const f=fixture(t),a='繰り返して描かれた既読の文章です。',b='次に進んでまだ描かれていない文章です。';
 f.source(a);f.draw(1,'#ffff00');f.draw(1,'#ffff00','end','krkr',a);
 f.draw(2,'#ffff00');f.draw(2,'#ffff00','end','krkr',a);
 f.source(a);f.source(b);assert.equal(f.color(),undefined,'old confirmed text cannot pair with a different source');
 f.draw(3,'#ffffff');assert.equal(f.color(),'#ffffff');
});

test('an unidentified early draw never lends its colour to the next source',t=>{
 const f=fixture(t);
 f.source('既読の日本語の文章です。');f.draw(1,'#ffff00');
 f.draw(2,'#ffff00');f.draw(2,'#ffff00','end');
 f.source('未読の日本語の文章です。');assert.equal(f.color(),undefined);
});

test('a repeated sentence with a new source sequence needs new draw evidence even when its token is identical',t=>{
 const f=fixture(t),text='同じ文章でも別の表示なら新しい色を確かめます。';
 f.status({hookSource:text,hookSequence:1});f.draw(1,'#ffff00');f.draw(1,'#ffff00','end','krkr',text);assert.equal(f.color(),'#ffff00');
 f.status({hookSource:text,hookSequence:2});assert.equal(f.color(),undefined);
 f.draw(2,'#ffffff');assert.equal(f.color(),'#ffffff');
});

test('draw identity uses source markup, speaker and original-language normalization',t=>{
 const f=fixture(t),japanese='「まだ読んでいない日本語の文章です。」';
 f.source('【時雨】'+japanese);
 f.draw(1,'#ffffff','end','krkr','%p-1;%fMS ゴシック;【時雨】'+japanese);assert.equal(f.color(),'#ffffff');
 f.source('翻訳された文章の日本語です。');
 f.hook.originalText={kind:'original',resolve:raw=>raw==='这是一句中文。'?{status:'exact',japanese:'翻訳された文章の日本語です。',alreadyJapanese:false}:{status:'none'}};
 f.draw(2,'#aabbcc','end','krkr','这是一句中文。');assert.equal(f.color(),'#aabbcc');
});

test('core and web automatic palettes prefer current draws over learned read tints and gradients',()=>{
 const ctx={window:{}};vm.createContext(ctx);vm.runInContext(read('web/reader/modules/game-style.js'),ctx);
 for(const g of [require('../core/game-style.js'),ctx.TomoyoGameStyle||ctx.window.TomoyoGameStyle]){
  const p={textColor:'#ffffff',readTextColor:'#ffff00',readTextGradient:true,textGradient:true,textGradientTop:'#ffff00',textGradientBottom:'#aaaa00',autoGameStyle:true};
  assert.equal(g.lineColor(p,'文章です。','#ffffff'),'#ffffff');
  assert.equal(g.paintFor(p,true,'#ffffff').color,'#ffffff');
  assert.equal(g.paintFor(p,true,'#ffffff').gradient,'none');
  assert.equal(g.lineColor({...p,autoGameStyle:false},'文章です。','#ffffff'),'');
  assert.equal(g.paintFor({...p,autoGameStyle:false},true,'#ffffff').color,'#ffff00');
 }
});

test('same text shown again as a new sequence rejects the previous sequence late end',t=>{
 const f=fixture(t),A='同じ文章がもう一度表示されました。';
 f.status({hookSourceRead:true});f.source(A);f.draw(1,'#ffff00');f.draw(1,'#ffff00','end','krkr',A);assert.equal(f.color(),'#ffff00');
 f.source(A);f.b.lineColorFor(A,987654);assert.equal(f.color(),undefined,'new sequence of identical text clears the colour');
 f.draw(1,'#ffff00','end','krkr',A);assert.equal(f.color(),undefined,'late end of the retired draw cannot repaint');
 f.draw(2,'#ffffff');f.draw(2,'#ffffff','end','krkr',A);assert.equal(f.color(),'#ffffff','the new draw still paints its own colour');
});
