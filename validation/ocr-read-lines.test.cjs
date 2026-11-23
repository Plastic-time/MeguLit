// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-19 (素晴らしき日々: the opening quotes are pictures, sp0003a… CompressedBG, no stream carries them): what the art scan
   reads becomes a read-only line of the reader (HookNative.ocrLine), in every engine, without 文字图片翻译 (artText).
   The readings in helpers/ocr-read/ are GalWindowBridge --art-scan-image runs on screenshots of the game (client area; the
   pictures stay outside the repository); the scan's own emission (shown after two reads, hidden after two misses, the same
   group re-sent when its reading changes) is played by hand here. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {HookNative}=require('../core/hook-native.cjs');
const read=f=>JSON.parse(fs.readFileSync(path.join(__dirname,'helpers','ocr-read','subahibi-'+f+'.json'),'utf8'));
function rig(){
 let now=1000;const timers=[],events=[],traces=[];
 const h=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},m=>events.push(m),()=>{},()=>now);
 h.trace=s=>traces.push(s);h.send=()=>{};
 const realSet=global.setTimeout,realClear=global.clearTimeout;
 global.setTimeout=(fn,ms)=>{const t={at:now+(ms||0),fn,unref(){}};timers.push(t);return t;};
 global.clearTimeout=t=>{const i=timers.indexOf(t);if(i>=0)timers.splice(i,1);};
 const run=t=>{for(;;){timers.sort((a,b)=>a.at-b.at);const n=timers[0];if(!n||n.at>t)break;timers.shift();now=n.at;try{n.fn();}catch{}}now=Math.max(now,t);};
 let id=1000000;
 /* one reading of the scan: every group of it goes out as artText (visible), with the scan's dialogSeen and others */
 const show=(reading,{ids,at,dialogSeen=false}={})=>{run(at);const out=[];reading.groups.forEach((g,i)=>{const gid=ids?.[i]??++id;out.push(gid);h.ocrLine({type:'artText',source:'ocr',id:gid,text:g.text,visible:true,rows:g.rows,sw:reading.sw,sh:reading.sh,dialogSeen:dialogSeen||reading.dialogSeen,others:reading.others});});return out;};
 const hide=(ids,at)=>{run(at);for(const gid of ids)h.ocrLine({type:'artText',source:'ocr',id:gid,visible:false});};
 const lines=()=>events.filter(e=>typeof e?.hookSource==='string'&&e.hookSource).map(e=>e.hookSource).filter((s,i,a)=>a[i-1]!==s);
 const done=()=>{global.setTimeout=realSet;global.clearTimeout=realClear;};
 return {h,show,hide,run,lines,traces,done,at:()=>now};
}
test('fixtures: the scan reads the quotes and nothing else that looks like a line',()=>{
 assert.equal(read('intro-1').groups[0].text,'私(あるいはこれを読むあなた)は世界に属さない。');
 assert.match(read('intro-3').groups[0].text,/^世界の意義は世界の外になければならない、/);
 assert.ok(read('title').others>=3,'the title screen has its menu rows');
 assert.equal(read('intro-8').groups.length,0,'the Latin attribution is no Japanese group');});
test('素晴らしき日々 opening: each quote once, a fade-out garble never, title, logo and chapter screen nothing',()=>{
 const r=rig();try{
  /* title screen: the logo 「不連続存在」 with START / LOAD / CONFIG / EXIT / copyright under it */
  const title=r.show(read('title'),{at:2000});r.run(5000);r.hide(title,5200);
  /* chapter screen: a 184 px logo guess and a 13 px kanji fragment */
  const ch=r.show(read('chapters'),{at:6000});r.run(9000);r.hide(ch,9200);
  assert.deepEqual(r.lines(),[],'title and chapter screens give no line');
  /* quote 1 (shown after two reads), still there on the next screen shot, then gone */
  const q1=r.show(read('intro-1'),{at:10000});r.show(read('intro-2'),{ids:q1,at:10400});r.hide(q1,13000);
  /* quote 2, then the same group read during its fade-out (the scan re-sends a changed reading under the same id) */
  const q2=r.show(read('intro-3'),{at:14000});r.show(read('intro-4'),{ids:q2,at:14400});r.show(read('intro-5'),{ids:q2,at:14800});
  r.show(read('intro-6'),{ids:q2,at:17000});r.hide(q2,17800);
  /* the attribution screen: no Japanese group */
  r.show(read('intro-8'),{at:18500});
  /* quote 2 again as a new group within a minute (the picture came back): not again */
  const again=r.show(read('intro-3'),{at:21000});r.hide(again,24000);r.run(30000);
  const L=r.lines();
  assert.deepEqual(L,[read('intro-1').groups[0].text,read('intro-3').groups[0].text],JSON.stringify(L)+' '+JSON.stringify(r.traces.filter(t=>t.startsWith('ocr'))));
  assert.ok(r.traces.some(t=>/refused \(a title or menu screen\)/.test(t)),'the title is refused as a menu screen');
  assert.ok(r.traces.some(t=>/refused \((logo or OCR noise|kanji fragment)\)/.test(t)),'the chapter screen logo is refused');
 }finally{r.done();}});
test('dialogue: no OCR line while the dialogue line is on the picture or a hook line is current; settings page nothing',()=>{
 const r=rig();try{
  r.run(1000);r.h.sourcePage({type:'hookSource',text:'「おはよう、由岐」',sourceName:'EmbedBGI',sourceCode:'EXHSXN8:20@3B350:BGI.exe',hookActive:true},'BGI.exe');
  const before=r.lines().length;
  /* a sign in the background read while the line is current (1 s later) */
  const sign=r.show({sw:1280,sh:720,others:0,groups:[{text:'喫茶店ひまわり、本日休業です',rows:[{text:'喫茶店ひまわり、本日休業です',x:100,y:80,w:300,h:24}]}]},{at:2000});r.run(4000);r.hide(sign,4100);
  /* 8 s on the same line: the scan still sees the dialogue line on the picture */
  const sign2=r.show({sw:1280,sh:720,others:0,groups:[{text:'商店街のお知らせが貼ってある',rows:[{text:'商店街のお知らせが貼ってある',x:100,y:80,w:300,h:24}]}]},{at:9000,dialogSeen:true});r.run(11000);r.hide(sign2,11100);
  /* a settings page: its sample sentence among four other groups */
  const page={sw:1280,sh:720,others:1,groups:['テキスト速度','オート速度','音量設定','既読スキップ','これはテキスト表示速度のサンプルです。'].map((t,i)=>({text:t,rows:[{text:t,x:100,y:100+i*60,w:200,h:24}]}))};
  const cfg=r.show(page,{at:20000});r.run(23000);r.hide(cfg,23100);
  assert.equal(r.lines().length,before,JSON.stringify(r.lines())+' '+JSON.stringify(r.traces.filter(t=>t.startsWith('ocr'))));
  assert.ok(r.traces.some(t=>/a hook line is current/.test(t)));assert.ok(r.traces.some(t=>/dialogue line is on the picture/.test(t)));
  assert.ok(r.traces.some(t=>/text groups at once \(menu or settings page\)/.test(t)));
  assert.equal(r.h.dialogueHook,'EmbedBGI','an OCR line never becomes the dialogue stream');
 }finally{r.done();}});
test('a notice screen of three paragraphs is one line, top to bottom (live: three lines in 30 ms, the reader kept the last)',()=>{
 const r=rig();try{
  const rows=(t,y)=>[{text:t,x:100,y,w:600,h:24}];
  const screen={sw:1280,sh:960,others:0,groups:[{text:'本作品はフィクションです。登場する人物名は全て架空のものです。',rows:rows('本作品はフィクションです。登場する人物名は全て架空のものです。',400)},{text:'本作品に登場するキャラクターは全て18歳以上です。',rows:rows('本作品に登場するキャラクターは全て18歳以上です。',300)}]};
  const ids=r.show(screen,{at:2000});r.show(screen,{ids,at:2400});r.run(5000);
  assert.deepEqual(r.lines(),['本作品に登場するキャラクターは全て18歳以上です。'+String.fromCharCode(10)+'本作品はフィクションです。登場する人物名は全て架空のものです。']);
 }finally{r.done();}});
test('ファタモルガーナの館 live: a card read once before it faded is a line; a once read without kana or too short is not; a logo with OCR radicals never; a flow page shows OCR lines as they are',()=>{
 const r=rig();try{
  r.h.flowPage=true;
  const card=(t,id,at,once)=>{r.run(at);r.h.ocrLine({type:'artText',source:'ocr',id,text:t,visible:true,once,rows:[{text:t,x:200,y:300,w:400,h:30}],sw:800,sh:600,dialogSeen:false,others:0});};
  card('館がある',1,1000,false);card('館がある',1,1400,false);r.run(3000);
  card('鬱蒼と茂る闇の森をかき分けると',2,5000,true);r.run(6000);
  card('館',3,8000,true);card('第一章',4,9000,true);card('ノベクタク丿レ',5,10000,false);card('ノベクタク丿レ',5,10400,false);card('Dロ,ロ',6,11000,false);card('Dロ,ロ',6,11400,false);r.run(13000);
  assert.deepEqual(r.lines(),['館がある','鬱蒼と茂る闇の森をかき分けると'],JSON.stringify(r.traces.filter(t=>t.startsWith('ocr')||t.startsWith('flow'))));
  assert.ok(r.traces.some(t=>/refused \(read once, too short or without kana\)/.test(t)));assert.ok(r.traces.some(t=>/refused \(OCR noise\) "ノベクタク丿レ"/.test(t)));assert.ok(r.traces.some(t=>/refused \(OCR noise\) "Dロ,ロ"/.test(t)));
  assert.ok(!r.traces.some(t=>/title card to art/.test(t)),'an OCR line is not sent back to the art path');
 }finally{r.done();}});
test('素晴らしき日々 user build: groups read once on the MeguLit menu do not linger and turn the next quote into a "menu" (19 groups at once)',()=>{
 const r=rig();try{
  /* the Alt+T menu over the game: 24 groups, each read once and gone (once: true, no hide ever follows) */
  r.run(1000);for(let i=0;i<24;i++)r.h.ocrLine({type:'artText',source:'ocr',id:500+i,text:'内嵌替换の項目'+i,visible:true,once:true,rows:[{text:'x',x:10,y:10+i*20,w:100,h:16}],sw:1280,sh:960,dialogSeen:false,others:0});
  r.run(3000);
  /* the quote screens a minute later: one group each, read twice (shown) */
  const q1=r.show(read('intro-1'),{at:60000});r.show(read('intro-2'),{ids:q1,at:60400});r.hide(q1,64000);
  const q2=r.show(read('intro-3'),{at:65000});r.show(read('intro-4'),{ids:q2,at:65400});r.hide(q2,70000);r.run(75000);
  assert.deepEqual(r.lines(),[read('intro-1').groups[0].text,read('intro-3').groups[0].text],JSON.stringify(r.traces.filter(t=>t.startsWith('ocr'))));
  assert.equal(r.h.ocr.shown.size,0,'nothing left behind');
 }finally{r.done();}});
test('wiring: the scan runs without artText (5 s quiet), artText only decides the drawing over the picture; the scan reports dialogSeen and others',()=>{
 const g=fs.readFileSync(path.join(__dirname,'..','core','gal-native.cjs'),'utf8');
 assert.match(g,/if\(message\.type==='artText'\)\{if\(this\.preferences\?\.artText===true&&message\.once!==true\)this\.onEvent\(message\);this\.hooks\.ocrLine\(message\);return;\}/);
 assert.match(g,/const art=this\.preferences\?\.artText===true,read=this\.preferences\?\.ocrReadLines!==false;const s=this\.state\.bound===true&&\(art\|\|read\)\?this\.hooks\.artScanState\(undefined,art\?2000:5000\)/);
 const p=fs.readFileSync(path.join(__dirname,'..','native','PageLocator.cs'),'utf8');
 assert.match(p,/else if \(x\.Seen == 1 && !x\.Foreign\) ScanEmit\(x, w, h, true, true\);/,'a group read once and gone goes out once');
 assert.match(p,/ScanDialogSeen = dialog != null && Find\(rows, dialog\) != null;/);
 assert.match(p,/dialogSeen = ScanDialogSeen, others = ScanOthers, once = once, at =/);
 assert.match(p,/Priority = ThreadPriority\.BelowNormal/,'the scan stays a low-priority thread');
 assert.match(g,/if\(!art\)s\.slow=true;/,'read lines only: the slow rate');assert.match(p,/Thread\.Sleep\(busy \? 400 : ScanSlow \? 1500 : 700\)/);
 assert.match(p,/forced = last != null && !Changed\(last, thumb\) && !pending;\s*if \(forced && !darkRecheck\) continue;/,'OCR only when the picture changed');
 assert.match(p,/bool darkRecheck = Dark\(thumb\) && \(DateTime\.UtcNow - lastOcr\)\.TotalMilliseconds >= \(darkMisses < 3 \? 4000 : 20000\);/,'or, on a dark picture, every 4 s (faint grey text on black), every 20 s after three empty reads');
 assert.match(p,/if \(forced\) darkMisses = groups\.Count \+ foreignGroups\.Count == 0 \? Math\.Min\(darkMisses \+ 1, 3\) : 0;/);assert.match(p,/if \(seen0 != null && Differ\(seen0, thumb\) >= 0\.3\) darkMisses = 0;/,'a fade-in lifts the cap');});
test('the periodic scan never uses PrintWindow; ocrReadLines can be turned off (game-style keeps it, default on)',()=>{
 const p=fs.readFileSync(path.join(__dirname,'..','native','PageLocator.cs'),'utf8'),c=fs.readFileSync(path.join(__dirname,'..','native','GameCapture.cs'),'utf8');
 const run=p.slice(p.indexOf(' void ScanRun()'),p.indexOf(' static List<List<Row>> SplitForeign('));
 assert.ok(run.length>500,'ScanRun found');
 assert.match(run,/GameCapture\.BltOnly\(target, image\)/,'the scan reads with BitBlt only');
 const code=run.replace(/"[^"]*"/g,'""').replace(/\/\*[\s\S]*?\*\//g,'');
 assert.doesNotMatch(code,/GameCapture\.(Into|Picture|Part)\(|PrintWindow/,'no capture that can fall back to PrintWindow');
 const blt=c.slice(c.indexOf(' public static bool BltOnly('),c.indexOf(' public static bool Into(IntPtr hwnd,Bitmap image,uint printFlags,bool screenFallback)'));
 assert.ok(blt.length>100,'BltOnly found');assert.doesNotMatch(blt.replace(/\/\/[^\n]*/g,''),/PrintWindow|ScreenInto/,'BltOnly never prints');
 const gs=require('../core/game-style.js');
 assert.equal(gs.clean({}).ocrReadLines,true,'on by default');assert.equal(gs.clean({ocrReadLines:false}).ocrReadLines,false,'kept when turned off');
 const {GalNative}=require('../core/gal-native.cjs');const sent=[];const g=Object.create(GalNative.prototype);
 g.send=m=>sent.push(m);g.state={bound:true};g.hooks={artScanState:()=>({on:true,dialog:'',speaker:'',band:false})};
 g.preferences=gs.clean({ocrReadLines:false});g.artScan();assert.equal(sent[0].on,false,'turned off: no scan without artText');
});
test('MeguLit menu over a corner of the game: its own windows are painted out before the scan reads (only the quote is read)',()=>{
 const p=fs.readFileSync(path.join(__dirname,'..','native','PageLocator.cs'),'utf8'),o=fs.readFileSync(path.join(__dirname,'..','native','OwnCover.cs'),'utf8'),g=fs.readFileSync(path.join(__dirname,'..','native','GalWindowBridge.cs'),'utf8');
 const run=p.slice(p.indexOf(' void ScanRun()'),p.indexOf(' static List<List<Row>> SplitForeign('));
 assert.ok(run.indexOf('OwnCover.Paint(image, OwnCover.Parts(target, w, h, OwnPids));')>0&&run.indexOf('OwnCover.Paint(')<run.indexOf('thumb = Thumb(image);'),'painted before the picture is compared or read');
 assert.match(g,/PageLocate\.OwnPids=new uint\[\]\{\(uint\)OverlayPid,\(uint\)System\.Diagnostics\.Process\.GetCurrentProcess\(\)\.Id\};/,'MeguLit and the bridge itself');
 assert.match(o,/if \(win == root\) return false;/,'only windows above the game');assert.match(o,/GetWindowRgn\(win, rgn\)/,'the window region: what the reader really paints');
 for(const f of ['native/Build-GalWindowBridge.ps1','native/native-builds.json','tools/build-reader-bridge.ps1'])assert.match(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),/OwnCover\.cs/,f);
 const exe=path.join(__dirname,'..','native','GalWindowBridge.exe');
 if(fs.existsSync(exe)){const out=require('child_process').execFileSync(exe,['--art-scan-mask-test'],{windowsHide:true,encoding:'utf8',timeout:60000});assert.match(out,/PASS art scan mask|SKIP/,out);}
});
