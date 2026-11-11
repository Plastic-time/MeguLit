// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E416 (player diagnostics #91 and #95, 穢翼のユースティア on 1.3.9; user 2026-11-11: fix it for every engine, not per game).
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const {ChoiceCapture}=require('../core/choice-capture.cjs');
test('choices: a bracketed name and a fragment of the current line are not choices',()=>{
 const c=new ChoiceCapture(),d='「こいつです、間違いありません」';
 assert.deepEqual(c.add('【オズ】',d),[]);assert.deepEqual(c.add('「こ、」',d),[]);assert.equal(c.options(),null);});
test('choices: names the hook reported, earlier dialogue lines and prefixes of the line are not choices, in any engine',()=>{
 let t=0;const c=new ChoiceCapture(()=>t);c.noteDialogue('そうか、それで','カイム');t=5;c.noteDialogue('次の台詞だ');
 assert.deepEqual(c.add('カイム\nそうか、それで\n次の','次の台詞だ'),[]);});
test('choices: candidates that arrive while the line is still typing are not a choice screen',()=>{
 let t=0;const c=new ChoiceCapture(()=>t);c.noteDialogue('あ');t=10;c.add('いろは\nにほへ','あ');t=20;c.noteDialogue('あいう');assert.equal(c.options(),null);});
test('choices: real choices still count, also when their characters occur in the line',()=>{
 const c=new ChoiceCapture();assert.deepEqual(c.add('はい\nいいえ','そういえば、いいえ、はい'),['はい','いいえ']);assert.deepEqual(c.options(),['はい','いいえ']);});
test('every dialogue line reaches the choice detector from the shared hook layer',()=>{
 assert.match(read('core/hook-native.cjs'),/\.noteDialogue\(text,speaker\);/);});
test('alignment: indent and hanging bracket are measured per line, not once for the page',()=>{
 const g=read('web/reader/modules/gal.js');
 assert.match(g,/for\(const sentence of document\.querySelectorAll\('\.sentence-text'\)\)\{\s*const japanese=\[\.\.\.sentence\.querySelectorAll\('\.char-token'\)\]/);
 assert.match(g,/sentence\.style\.setProperty\('--tomoyo-jp-indent',indent\)/);assert.match(g,/sentence\.style\.setProperty\('--megulit-jp-hang',hang\)/);});
test('blur: every MeguLit translation layer, revealed by pointer position (overlays let clicks through)',()=>{
 const g=read('web/reader/modules/gal.js');
 assert.match(g,/const T=\['\.tomoyo-cn-output','\.megulit-choice-cn'\]/);assert.match(g,/\{filter:blur\(7px\)!important/);
 assert.match(g,/document\.addEventListener\('mousemove',e=>\{if\(!document\.documentElement\.classList\.contains\('megulit-translation-blur'\)\)return;/);});
test('colour sampling reads the game window before the screen (no MeguLit overlay in the sample)',()=>{
 assert.match(read('native/GameStyleProbe.cs'),/if\(!GameCapture\.Into\(target,full,3,false\)&&!\(Convert\.ToString\(d\.ContainsKey\("captureMode"\)/);});
