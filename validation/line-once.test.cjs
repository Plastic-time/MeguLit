// SPDX-License-Identifier: GPL-3.0-or-later
// 2026-11-19 (user: 「所有游戏都禁止复读」). Replay of 千恋＊万花 CHAPTER 1-1 (KiriKiri Z + TextRender, live 08:29): the stream frame
// for 【将臣】「志那都荘まで行って欲しいんですけど」 held the sentence six times, ruby base and reading form alternating
// (志那都荘 ×2, しなつ荘 ×2, 志那都荘 ×2; 228 chars, DoubleLine halved it to 114), and the reader drew all six over the button bar.
// Stage notes of the script (■自動車（車内／走行）) came through the same stream.
'use strict';
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const L=require('../core/line-once.js');
const {HookNative}=require('../core/hook-native.cjs');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const X='「志那都荘まで行って欲しいんですけど」',Y='「しなつ荘まで行って欲しいんですけど」';
const SIX=X+X+Y+Y+X+X;

test('core and reader share one line-once module, loaded before hook-reader',()=>{
 assert.equal(read('core/line-once.js'),read('web/reader/modules/line-once.js'));
 const list=JSON.parse(read('web/reader/modules.json'));assert.ok(list.indexOf('line-once')>=0&&list.indexOf('line-once')<list.indexOf('hook-reader'));
 assert.match(read('web/reader/module-list.js'),/"line-once","hook-reader"/);
});

test('ruby base and reading forms are one sentence; the base text wins and the reading becomes ruby',()=>{
 assert.ok(L.variant(X,Y));assert.ok(!L.variant(X,'「あー……すみません。アタシはここいらに詳しくないんですよ」'));
 for(const frame of [SIX,SIX+SIX,X+Y,Y+X,SIX+'「しな',X+X]){const r=L.collapse(frame);assert.equal(r.text,X,frame);}
 assert.deepEqual(L.collapse(SIX).ruby,[['志那都','しなつ']]);
 assert.equal(L.collapse(Y+Y).text,Y,'a reading-only repeat keeps its own form');
 /* live 2026-11-19 line 14: a whole copy and a copy cut after its …… */
 const Q='「（サービスの悪い運転手だ……）」';assert.equal(L.collapse(Q+'「（サービスの悪い運転手だ……').text,Q);
 assert.equal(L.collapse('「待って……」「待って……」「待って……').text,'「待って……」');
});

test('real text is kept: different sentences, short exact repeats, page text with a new line',()=>{
 for(const t of [X,'「うん」「うん」','まだ大雑把な目的地しか伝えていなかったのを思い出した。'+X,'そして――殺人――――。','「ドキドキ」「ドキドキする」'])assert.equal(L.collapse(t).text,t,t);
 assert.equal(L.collapse('雨が降った。傘を差した。雨が降った。傘を差した。').text,'雨が降った。傘を差した。','a whole run drawn again');
});

test('script stage notes are not dialogue',()=>{
 assert.equal(L.stripStageNotes('■自動車（車内／走行）'),'');
 assert.equal(L.stripStageNotes('■自動車（車内／走行）■自動車（車内／走'),'');
 assert.equal(L.stripStageNotes('車／ドア開ける（車内）■自動車（車内／減速）無視して、そのまま外に出た。'),'無視して、そのまま外に出た。');
 assert.equal(L.stripStageNotes('■自動車（車内／走行）'+X),X);
 assert.equal(L.stripStageNotes('「………」「……」■自動車'),'「………」「……」');
 for(const t of [X,'（ここはどこだ？）','普通の文。（笑）'])assert.equal(L.stripStageNotes(t),t);
});

function hookFixture(t){
 let now=1e6;const shown=[];
 const hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-line-once-log'},m=>{if(typeof m?.hookSource==='string')shown.push(m.hookSource);},()=>{},()=>now);
 hook.trace=()=>{};hook.send=()=>{};hook.artLocate=()=>{};hook.process={stdin:{write(){},end(){}},kill(){}};t.after(()=>hook.stop());
 return {shown,hook,line(text,ms=1500){hook.source({text,sourceName:'KiriKiriZ',sourceCode:'HW-8*14:-8*0@F4600:SenrenBanka.exe',origin:'live'},'');now+=ms;}};
}

test('hook source: the six-copy frame is shown once, with the reading as ruby',t=>{
 const f=hookFixture(t);
 f.line('まだ大雑把な目的地しか伝えていなかったのを思い出した。');
 f.line(SIX+SIX);
 assert.equal(f.shown.at(-1),X);assert.equal(f.shown.filter(s=>s.includes('志那都荘')||s.includes('しなつ荘')).length,1);
 assert.deepEqual(f.hook.sourceRuby.get(X)?.find(p=>p[0]==='志那都'),['志那都','しなつ']);
});

test('hook source: base and reading form redrawn as separate frames are one line',t=>{
 const f=hookFixture(t);
 f.line('まだ大雑把な目的地しか伝えていなかったのを思い出した。');
 for(const s of [X,X,Y,Y,X,X])f.line(s);
 assert.equal(f.shown.filter(s=>s.includes('志那都荘')||s.includes('しなつ荘')).length,1,JSON.stringify(f.shown));
 f.line('「あー……すみません。アタシはここいらに詳しくないんですよ」');assert.equal(f.shown.at(-1),'「あー……すみません。アタシはここいらに詳しくないんですよ」');
});

test('hook source: stage notes never reach the reader',t=>{
 const f=hookFixture(t);
 f.line('■自動車（車内／走行）■自動車（車内／走');
 assert.equal(f.shown.length,0,JSON.stringify(f.shown));
 f.line('車／ドア開ける（車内）■自動車（車内／減速）無視して、そのまま外に出た。');
 assert.equal(f.shown.at(-1),'無視して、そのまま外に出た。');
});

test('reader: a sentence already on the page is never appended again, a frame repeating it shows it once',()=>{
 const b={galStatus(){}};const window={__tomoyoChinese:b};
 const document={documentElement:{},head:{append(){}},body:{classList:{toggle(){}}},querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>({}),addEventListener(){}};
 const ctx={window,document,MutationObserver:class{observe(){}},Date,setTimeout,clearTimeout};vm.createContext(ctx);
 for(const f of ['line-once','island-source','hook-reader'])vm.runInContext(read('web/reader/modules/'+f+'.js'),ctx);
 let seq=0;const say=(text,same=true)=>{if(seq)b.hookPage({same});b.galStatus({hookActive:true,hookSource:text,hookSequence:++seq});};
 say(SIX);assert.equal(b.hookReaderStatus().chars,X.length);
 say(Y);assert.deepEqual([...b.hookPageLines()],[],'the reading form of the line on screen is not a new page line');
 const Z='「ですからね……奥まで行くのは勘弁してください」';
 say(Z);assert.deepEqual([...b.hookPageLines()],[Y]);
 say(X);assert.deepEqual([...b.hookPageLines()],[Z],'the line again: kept once (the current one), never above itself');
 say(Z);assert.deepEqual([...b.hookPageLines()],[X]);
});
