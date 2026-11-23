'use strict';
/* 2026-11-19 integration live runs (logs were overwritten by a restart; the frames below are the shapes the report recorded):
   - 千恋＊万花, back from the system settings "文本" page: the settings page's preview text went into the reader, the choice
     capture took the stage note 「■自動車（車内／走行）」 apart into the "options" 「自動車（車内」「走行）」, and the selection
     followed KiriKiriZ's per-character context (「「「「「「「「……「…)
   - ISLAND (CatSystem2): the Text page's typewriter preview 「テキスト表示サンプル」 was shown out of order as a line
   - 死に逝く君、館に芽吹く憎悪, Ctrl skip: the reader line was 「謎の男謎の男謎の男謎の男美亜美亜」 (names glued while skipping) */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const LineOnce=require('../core/line-once.js');
const {HookNative}=require('../core/hook-native.cjs');
const {ChoiceCapture}=require('../core/choice-capture.cjs');

function hookFixture(t){
 let now=1e6;const shown=[];
 const hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-settings-noise-log'},m=>{if(typeof m?.hookSource==='string')shown.push(m.hookSource);},()=>{},()=>now);
 hook.trace=()=>{};hook.send=()=>{};hook.artLocate=()=>{};hook.process={stdin:{write(){},end(){}},kill(){}};t.after(()=>hook.stop());
 return {shown,hook,line(text,ms=1500){hook.source({text,sourceName:'KiriKiriZ',sourceCode:'HW-8*14:-8*0@F4600:SenrenBanka.exe',origin:'live'},'');now+=ms;}};
}

/* the preview text is judged by state (the game's dialogue box hidden on a settings page), never by its words: the very same
   text arriving in the dialogue state is a line like any other */
function readerFixture(){let now=1e6;const b={galStatus(){}};const window={__tomoyoChinese:b};
 const document={documentElement:{},head:{append(){}},body:{classList:{toggle(){}}},querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>({}),addEventListener(){}};
 const ctx={window,document,MutationObserver:class{observe(){}},Date:{now:()=>now},setTimeout,clearTimeout};vm.createContext(ctx);
 for(const f of ['line-once','island-source','hook-reader'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..','web','reader','modules',f+'.js'),'utf8'),ctx);
 let seq=0;return {b,wait(ms){now+=ms;},say(text){if(seq)b.hookPage({same:false});b.galStatus({hookActive:true,hookSource:text,hookSequence:++seq});},chars:()=>b.hookReaderStatus().chars};}
const PREVIEW='テキスト速度のサンプルと、オート速度のサンプルです。';
test('reader: preview text typed out while the dialogue box is gone (settings page) is not taken, the same text in dialogue is',()=>{
 const f=readerFixture();
 f.say('まだ大雑把な目的地しか伝えていなかったのを思い出した。');const before=f.chars();
 f.b.galStatus({dialogVisible:false,reason:'scene'});f.wait(1500);
 for(const t of ['テキスト速度のサンプルと、','テキスト速度のサンプルと、オート速度の',PREVIEW,'サンテキスプト表ル示サンテプルキテキススト表ト示サン表プル示']){f.say(t);f.wait(60);}
 assert.equal(f.chars(),before,'the settings page text is not shown');assert.deepEqual([...f.b.hookPageLines()],[]);
 f.wait(500);f.b.galStatus({dialogVisible:true});assert.equal(f.chars(),before,'nor drawn when the box comes back');
 f.say('「あっ、はい。なんですか」');assert.equal(f.chars(),'「あっ、はい。なんですか」'.length);
 const g=readerFixture();g.say(PREVIEW);assert.equal(g.chars(),PREVIEW.length,'in the dialogue state the same text is a line');
});
test('reader: auto mode, a line left 8 s and hidden by a lost wait marker: the next line from the dialogue stream is shown',()=>{
 const f=readerFixture();f.say('まだ大雑把な目的地しか伝えていなかったのを思い出した。');f.wait(8200);
 f.b.galStatus({dialogVisible:false,reason:'marker'});f.wait(2000);
 const next='「あー……すみません。アタシはここいらに詳しくないんですよ」';f.say(next);assert.equal(f.chars(),next.length);
 const g=readerFixture();g.say('前の行です。');g.b.galStatus({dialogVisible:false,reason:'skip'});g.wait(2000);g.say('「え？　あ、そうでしたね」');assert.equal(g.chars(),'「え？　あ、そうでしたね」'.length);
});
test('reader: a CG scene hides the box; its next line arrives just before the box returns and is shown (#114)',()=>{
 const f=readerFixture();f.say('前の行です。');f.b.galStatus({dialogVisible:false,reason:'scene'});f.wait(4000);
 const next='「ですからね……奥まで行くのは勘弁してください」';f.say(next);assert.notEqual(f.chars(),next.length,'held while the box is still away');
 f.wait(400);f.b.galStatus({dialogVisible:true});assert.equal(f.chars(),next.length,'shown as the box returns');
});
test('reader: a line arriving just as the box hides is still the line',()=>{
 const f=readerFixture();f.b.galStatus({dialogVisible:false,reason:'scene'});f.wait(100);
 f.say('「え？　あ、そうでしたね」');assert.equal(f.chars(),'「え？　あ、そうでしたね」'.length);
});

test('names glued while skipping stand for the last name; real lines are kept',()=>{
 assert.equal(LineOnce.nameStack('謎の男謎の男謎の男謎の男美亜美亜'),'美亜');
 assert.equal(LineOnce.nameStack('ムラサメムラサメ芳乃芳乃'),'芳乃');
 for(const t of ['時雨','美亜美亜','うんうん','そうそうだね','はいはいうんうん','ははは','将臣将臣ムラサメ','「あっ、はい」'])assert.equal(LineOnce.nameStack(t),'',t);
});

test('hook source: glued names never reach the reader; the next line does',t=>{
 const f=hookFixture(t);
 f.line('謎の男謎の男謎の男謎の男美亜美亜');
 assert.equal(f.shown.length,0,JSON.stringify(f.shown));
 assert.equal(f.hook.speaker?.text,'美亜');
 f.line('「あっ、はい。なんですか」');
 assert.equal(f.shown.at(-1),'「あっ、はい。なんですか」');
});

test('choice capture: a stage note cut at ■ and ／ gives no options; real options still do',()=>{
 const C=new ChoiceCapture(()=>1000);
 assert.deepEqual(C.add('■自動車（車内／走行）'),[]);
 assert.deepEqual(C.add('自動車（車内'),[]);assert.deepEqual(C.add('走行）'),[]);
 assert.deepEqual(C.add('はい／いいえ'),['はい','いいえ']);
 assert.deepEqual(new ChoiceCapture(()=>1000).add('上書きで何か吹き込む／（何もしない）'),['上書きで何か吹き込む','（何もしない）']);
});

test('HookBridge follows a new context of the selected hook only on a line that is not still being typed',()=>{
 const cs=fs.readFileSync(path.join(__dirname,'..','native','HookBridge.cs'),'utf8');
 assert.match(cs,/DialogueLike\(text\)&&!Typing\(sib\.prevSample,text\)/);
 assert.match(cs,/c\.prevSample=c\.sample;c\.sample=sample;/);
 const body=cs.slice(cs.indexOf('static bool Typing('),cs.indexOf('static bool DialogueLike('));
 const Typing=new Function('before','now',"if(!before||!now)return false;const a=before.replace(/…+$/,''),b=now.replace(/…+$/,'');return a.length>0&&b.length>0&&a!==b&&(b.startsWith(a)||a.startsWith(b));");
 assert.match(body,/b\.StartsWith\(a\)\|\|a\.StartsWith\(b\)/);
 assert.equal(Typing('「あっ、はい。なん','「あっ、はい。なんですか'),true);
 assert.equal(Typing('「あっ、はい。なんですか」','まだ大雑把な目的地しか伝えていなかった'),false);
 assert.equal(Typing('','「あっ、はい。なんですか」'),false);
});

test('choice capture: pieces of a line being typed (one capture, within 1.5 s) are fragments; a word arriving on its own is an option',()=>{
 let t=1000;const C=new ChoiceCapture(()=>t);
 for(const f of ['オ','オオ','オオー','オオーー','オオーートト']){C.add(f);t+=60;}
 assert.deepEqual(C.items.map(x=>x.key),['オオーートト'],'only the longest form of the typed line is left');
 for(const f of ['テ','テキ','テキス']){C.add(f);t+=60;}assert.ok(!C.items.some(x=>x.key==='テキ'));
 const n=()=>new ChoiceCapture(()=>1);
 assert.deepEqual(n().add('ママ'),['ママ']);assert.deepEqual(n().add('パパ／ココ'),['パパ','ココ']);assert.deepEqual(n().add('トト'),['トト']);
 assert.deepEqual(n().add('ねねさん／ここ'),['ねねさん','ここ']);assert.deepEqual(n().add('…………／ああ、行こう'),['…………','ああ、行こう']);
});

test('hook source: no choice candidates (and no OCR locate) while the dialogue box is gone for a known reason',t=>{
 const f=hookFixture(t);const traces=[];f.hook.trace=s=>traces.push(String(s));let located=0;f.hook.locateChoices=()=>{located++;};
 f.line('まだ大雑把な目的地しか伝えていなかったのを思い出した。');
 f.hook.dialogGoneAt=Date.now()-2000;
 f.hook.auxText({text:'前往文本选项卡',sourceName:'TextRender',role:0});f.hook.auxText({text:'返回标题界面。',sourceName:'TextRender',role:0});
 assert.ok(traces.some(s=>s.includes('choice aux skipped: dialogue box gone')));assert.equal(f.hook.choice?.items?.length||0,0);
 f.hook.dialogGoneAt=0;f.hook.auxText({text:'はい／いいえ',sourceName:'TextRender',role:3});
 assert.deepEqual(f.hook.choice.items.map(x=>x.text),['はい','いいえ']);assert.equal(located,0,'OCR is asked only after the burst settles');
});
const SERVICE=fs.readFileSync(path.join(__dirname,'..','services','reader.cjs'),'utf8');
test('reader service hands the dialogue box state (known reasons only) to the hook source',()=>{
 assert.match(SERVICE,/this\.gal\.hooks\.dialogGoneAt=message\.dialogVisible\?0:\/\^\(\?:window\|scene\|engine\)\$\//);
});

test('choice capture: names glued while skipping (死に逝く君 Ctrl skip, live) are no options',()=>{
 const C=new ChoiceCapture(()=>1000);
 assert.deepEqual(C.add('美亜美亜美亜美亜血塗れの男血塗れの男血塗れの男血塗れの男'),[]);assert.deepEqual(C.add('美亜美亜血塗れの男血塗れの男'),[]);
 assert.ok(C.names.has('血塗れの男'));assert.deepEqual(C.add('逃げる／戦う'),['逃げる','戦う']);
});
