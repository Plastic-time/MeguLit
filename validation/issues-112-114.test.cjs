'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Immersion}=require('../core/immersion.cjs'),{withDeadline,speakWithin}=require('../core/speech-deadline.cjs');
const root=path.join(__dirname,'..');
test('#112: a speech request that never answers fails with a clear message instead of waiting forever',async()=>{
 await assert.rejects(withDeadline(new Promise(()=>{}),30,'语音合成超时'),/语音合成超时/);
 assert.equal(await withDeadline(Promise.resolve(7),1000,'x'),7);
 await assert.rejects(speakWithin(()=>new Promise(()=>{}),()=>1,{startMs:20,synthMs:20}),/语音引擎启动超时/);
 await assert.rejects(speakWithin(()=>{},()=>new Promise(()=>{}),{startMs:20,synthMs:20}),/语音合成超时/);
 const runtime=fs.readFileSync(path.join(root,'services/runtime.cjs'),'utf8');
 assert.match(runtime,/case 'kana_speak'[\s\S]*?SPEECH_SYNTH_MS/);assert.match(runtime,/case 'speech_preview'[^\n]*speakWithin/);
 assert.match(fs.readFileSync(path.join(root,'web/kana/kana.js'),'utf8'),/toast\('AI 发音不可用：'/);
});
test('#113: the bound game window is brought back on bind, unbind and exit',()=>{
 const cs=fs.readFileSync(path.join(root,'native/GalWindowBridge.cs'),'utf8');
 assert.match(cs,/static void RevealGame\(IntPtr target\)/);
 assert.match(cs,/if\(activate\)\{CoverEnabled=true;RevealGame\(Target\);/);
 assert.match(cs,/type=="unbind"\)\{[^\n]*RevealGame\(Target\)/);
 assert.match(cs,/finally\{RevealGame\(Target\);/);
 assert.match(cs,/IsIconic\(root\)\)ShowWindow\(root,9\)/);
});
test('#114: a wait marker lost while the pointer only hovers a game button does not hide the layer at once',()=>{
 let now=0;const events=[];const im=new Immersion(e=>events.push(e.dialogVisible),()=>now);
 im.configure({immersion:true,dialogDetection:'marker'});im.bind('g');im.source('「テスト」','krkr');
 now=500;im.marker(true);im.tick();now=2000;im.marker(false);now=3000;im.tick();assert.notEqual(events.at(-1),false,'hover: still shown after 1 s');
 now=2000+8000;im.tick();assert.equal(events.at(-1),false,'a marker gone for 8 s still hides (CG in auto mode)');
 now=20000;im.source('「次」','krkr');now=20500;im.marker(true);im.tick();now=21000;im.tick();
 now=22000;im.input();im.marker(false);now=22700;im.tick();assert.equal(events.at(-1),false,'after a click it hides in 0.6 s');
});
test('#114: the Alt+T guide tells how to favourite a sentence',()=>{
 assert.match(fs.readFileSync(path.join(root,'web/reader/modules/polish.js'),'utf8'),/拖选文字：查词、加 Anki 或收藏句子/);
});
