// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E416 (player diagnostics #91 and #95, 穢翼のユースティア on 1.3.9). User 2026-11-11: fix for every engine, but never change
// a path that already works: fallbacks only where the hook cannot write back, and regression cases for adapted engines.
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const {ChoiceCapture}=require('../core/choice-capture.cjs');
test('choices: a bracketed name and a quoted fragment of the current line are not choices',()=>{
 const c=new ChoiceCapture(),d='「こいつです、間違いありません」';
 assert.deepEqual(c.add('【オズ】',d),[]);assert.deepEqual(c.add('「こ、」',d),[]);assert.equal(c.options(),null);});
test('choices: quoted echoes of earlier lines and quoted prefixes of the line are not choices',()=>{
 let t=0;const c=new ChoiceCapture(()=>t);c.noteDialogue('「そうか、それで」');t=5;c.noteDialogue('「次の台詞だ」');
 assert.deepEqual(c.add('「そうか、それで」\n「次の」','「次の台詞だ」'),[]);});
test('choices: short pieces that arrive while the line is still typing are not a choice screen',()=>{
 let t=0;const c=new ChoiceCapture(()=>t);c.noteDialogue('あ');t=10;c.add('いろ\nにほ','あ');t=20;c.noteDialogue('あいう');assert.equal(c.options(),null);});
test('every dialogue line reaches the choice detector from the shared hook layer',()=>{
 assert.match(read('core/hook-native.cjs'),/\.noteDialogue\(text,speaker\);/);});
// Regression: choice input as the adapted engines deliver it keeps working.
test('regression: engine choice screens still become choices',()=>{
 const cases=[
  ['KiriKiri','そっちへ行く\nここに残る','「どうしよう」',''],
  ['Siglus','渚を追いかける\n家に帰る','どうする？','朋也'],
  ['YU-RIS','1. 付き合う\n2. 断る','……',''],
  ['Artemis','右の道\n左の道','分かれ道だ',''],
  ['new BGI (EmbedBGI)','はい\nいいえ','はい、そうです',''],
  ['choice words inside the line','はい\nいいえ','そういえば、いいえ、はい',''],
  ['route names','めのう\n輝夜','どちらを選ぶ？','めのう'],
 ];
 for(const [engine,text,dialogue,speaker] of cases){let t=0;const c=new ChoiceCapture(()=>t);c.noteDialogue(dialogue,speaker);t=100;c.add(text,dialogue);assert.ok(c.options()&&c.options().length>=2,engine+' lost its choices: '+JSON.stringify(c.options()));}
});
test('regression: a line typed out while real choices are listed keeps them (only 3-character pieces are dropped)',()=>{
 let t=0;const c=new ChoiceCapture(()=>t);c.noteDialogue('どちらに');t=10;c.add('東の森へ向かう\n西の街へ戻る','どちらに');t=20;c.noteDialogue('どちらにする？');
 assert.deepEqual(c.options(),['東の森へ向かう','西の街へ戻る']);});
test('alignment: per-line measure only where the hook cannot hide the game text; every other game keeps the page-wide measure',()=>{
 const g=read('web/reader/modules/gal.js'),panel=read('web/reader/modules/hook-panel.js');
 assert.match(panel,/document\.body\.classList\.toggle\('megulit-readonly-hook',state\.hookEmbedUnsupported===true&&state\.hookProfile!=='off'\)/);
 assert.match(g,/const perLine=document\.body\.classList\.contains\('megulit-readonly-hook'\)/);
 assert.match(g,/if\(!perLine\)\{sentence\.style\.removeProperty\('--tomoyo-jp-indent'\);sentence\.style\.removeProperty\('--megulit-jp-hang'\);\}/);
 assert.match(g,/if\(perLine\)sentence\.style\.setProperty\('--tomoyo-jp-indent',indent\)/);
 assert.match(g,/if\(perLine\)sentence\.style\.setProperty\('--megulit-jp-hang',hang\)/);
 assert.ok(g.includes("(perLine?/^[「『（“‘〈《【〔［(]$/:/^[「『（“‘〈《【(]$/)"),'the default path keeps the original bracket set');});
test('blur: only with the opt-in setting; every MeguLit translation layer, revealed by pointer position',()=>{
 const g=read('web/reader/modules/gal.js');
 assert.match(g,/const T=\['\.tomoyo-cn-output','\.megulit-choice-cn'\]/);assert.match(g,/\{filter:blur\(7px\)!important/);
 assert.match(g,/document\.addEventListener\('mousemove',e=>\{if\(!document\.documentElement\.classList\.contains\('megulit-translation-blur'\)\)return;/);
 assert.ok(g.includes(",on=T.map(t=>'html.megulit-translation-blur body "),'every rule is scoped to the blur class');});
test('colour sampling is unchanged (window/screen order as before E416)',()=>{
 assert.doesNotMatch(read('native/GameStyleProbe.cs'),/E416/);});
