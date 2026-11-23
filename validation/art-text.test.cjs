// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-12 art text: a Japanese line outside the text window is located on the picture; MeguLit lays an invisible,
   readable copy and the translation over it while the game keeps drawing it. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const {HookNative}=require('../core/hook-native.cjs');
test('a Japanese line from another stream is located once; the current dialogue, labels with paths and markup are not',()=>{
 const asked=[];let now=1000;const h=Object.create(HookNative.prototype);h.now=()=>now;h.trace=()=>{};h.artLocate=t=>asked.push(t);h.lastSource='「そうか」と彼は言った。';
 h.artCandidate('館がある');h.artCandidate('館がある');h.artCandidate('「そうか」と彼は言った。');h.artCandidate('E:\GAL\a.pak');h.artCandidate('<size=12>メニュー');h.artCandidate('A');
 assert.deepEqual(asked,['館がある']);
 now+=21000;h.artCandidate('館がある');assert.deepEqual(asked,['館がある','館がある'],'again after 20 s');
});
test('the page draws art text as invisible, readable characters plus the translation',()=>{
 const src=read('web/reader/modules/art-text.js');
 assert.match(src,/className='sentence-text megulit-art-row'/);assert.match(src,/className='char-token'/);
 assert.match(src,/color:transparent!important/);assert.match(src,/megulit-art-cn/);
 assert.match(read('web/reader/bootstrap.js'),/artText:'artText'/);
 assert.ok(JSON.parse(read('web/reader/modules.json')).includes('art-text'));assert.match(read('web/reader/module-list.js'),/"art-text"/);
});
test('the art request reaches PageLocator and its answer the page, with a translation',()=>{
 assert.match(read('core/gal-native.cjs'),/this\.hooks\.artLocate=text=>\{[^}]*type:'pageLocate',text,art:true/);
 /* 2026-11-19 drawn over the picture only with artText on; read lines go to the reader either way (ocr-read-lines.test.cjs) */assert.match(read('core/gal-native.cjs'),/message\.type==='artText'\)\{if\(this\.preferences\?\.artText===true&&message\.once!==true\)this\.onEvent\(message\);this\.hooks\.ocrLine\(message\)/);
 assert.match(read('native/GalWindowBridge.cs'),/PageLocate\.Request\(Target,Str\(d,"text"\),Bool\(d,"art"\)\)/);
 assert.match(read('native/PageLocator.cs'),/void LocateArt\(/);
 assert.match(read('services/reader.cjs'),/message\.type==='artText'\)\{this\.artText\(message\)/);
});
/* 2026-11-12 OCR read path: art text no hook stream carries (ファタモルガーナの館's opening pictures) is read from the picture */
test('the art scan is wanted while no hook line is current and skips the current dialogue',()=>{
 let now=10000;const h=Object.create(HookNative.prototype);h.now=()=>now;h.state={hookSpeaker:'メル'};
 assert.deepEqual(h.artScanState(),{on:true,dialog:'',speaker:'',band:false,foreign:false},'no line yet (an opening): the whole picture');
 h.lastSource='「おはよう」と彼女は言った。';h.lastSourceAt=now;
 assert.equal(h.artScanState().on,false,'a line just arrived');
 now+=2500;assert.deepEqual(h.artScanState(),{on:true,dialog:'「おはよう」と彼女は言った。',speaker:'メル',band:true,foreign:false},'after 2 s: on, the dialogue and its box band skipped');
 h.engineDialog=false;now=h.lastSourceAt+100;assert.deepEqual(h.artScanState(),{on:true,dialog:'',speaker:'',band:false,foreign:false},'text window hidden: on at once, whole picture');
});
test('GalNative sends the art scan state to the bridge only when it changes, off when not bound',()=>{
 const {GalNative}=require('../core/gal-native.cjs');const sent=[];const g=Object.create(GalNative.prototype);
 g.send=m=>sent.push(m);g.preferences={artText:true};g.state={bound:true};let st={on:true,dialog:'',speaker:'',band:false},quiet=[];g.hooks={artScanState:(now,q)=>{quiet.push(q);return st;}};
 g.artScan();g.artScan();assert.equal(sent.length,1);assert.equal(sent[0].type,'artScan');assert.equal(sent[0].on,true);
 g.state.bound=false;g.artScan();assert.equal(sent.length,2);assert.equal(sent[1].on,false);
 /* 2026-11-19 OCR read lines: without artText the scan still runs, after 5 s without a hook line; ocrReadLines:false turns it off */g.preferences={artText:false};g.state.bound=true;g.artScan();assert.equal(sent.length,3);assert.equal(sent[2].on,true);assert.equal(quiet[quiet.length-1],5000);assert.equal(quiet[0],2000);
 g.preferences={artText:false,ocrReadLines:false};g.artScan();assert.equal(sent.length,4,'both off: off');assert.equal(sent[3].on,false);
 assert.match(read('native/GalWindowBridge.cs'),/type=="artScan"\)\{if\(PageLocate!=null\)PageLocate\.Scan\(Target,/);
 assert.match(read('native/PageLocator.cs'),/public void Scan\(IntPtr target, bool on, string dialog, string speaker, bool band\)/);
});
test('the OCR read path reads only, diffs the frame first and never writes to the game',()=>{
 const src=read('native/PageLocator.cs'),scan=src.slice(src.indexOf('// ---- art scan'),src.indexOf(' void Report(Found f,'));
 assert.match(scan,/!Changed\(last, thumb\)/);assert.match(scan,/Thread\.Sleep\(busy \? 400 : ScanSlow \? 1500 : 700\)/);assert.match(scan,/source = "ocr"/);
 assert.doesNotMatch(scan,/WriteProcessMemory|SendMessage|PostMessage|SetWindowPos|FillRect/);
});
test('a stale art show waiting for its translation is dropped once the line was hidden (E540: the line itself went out at once)',async()=>{
 const R=require('../services/reader.cjs').Reader;
 const r=Object.create(R.prototype);const out=[];let release;r.runtime={emit:(_,m)=>out.push(m)};r.embedCached=()=>'';r.displayLanguage=()=>'en';r.prefs=()=>({});r.workPrompt='';r.loadKeys=()=>{};r.localReady=async()=>{};
 r.translator=()=>({translate:()=>new Promise(res=>{release=res;})});
 const shown=r.artText({type:'artText',id:7,text:'館がある',visible:true,rows:[]});await new Promise(res=>setImmediate(res));
 await r.artText({type:'artText',id:7,text:'館がある',visible:false});release('There is a mansion');await shown;
 assert.deepEqual(out.map(m=>m.visible),[true,false]);assert.equal(out[0].translation,'');
});
test('the bridge self-test of the art scan passes (when GalWindowBridge.exe is built)',{skip:!fs.existsSync(path.join(__dirname,'..','native','GalWindowBridge.exe'))},()=>{
 const r=require('node:child_process').spawnSync(path.join(__dirname,'..','native','GalWindowBridge.exe'),['--art-scan-self-test'],{windowsHide:true,encoding:'utf8',timeout:20000});
 assert.equal(r.status,0,r.stdout+r.stderr);
});
test('real Japanese OCR reads a drawn fata-like opening and leaves the text box out (when GalWindowBridge.exe is built)',{skip:!fs.existsSync(path.join(__dirname,'..','native','GalWindowBridge.exe'))},()=>{
 const r=require('node:child_process').spawnSync(path.join(__dirname,'..','native','GalWindowBridge.exe'),['--art-scan-ocr-test'],{windowsHide:true,encoding:'utf8',timeout:30000});
 assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/^(PASS|SKIP)/);
});
