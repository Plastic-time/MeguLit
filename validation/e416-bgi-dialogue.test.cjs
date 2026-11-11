// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E416 (player diagnostics #91, 穢翼のユースティア on 1.3.9): spoken lines were overlapped by a choice overlay built from the
// name stream and a typewriter fragment.
const test=require('node:test'),assert=require('node:assert');
const {ChoiceCapture}=require('../core/choice-capture.cjs');
test('a 【name】 and a fragment of the current line are not choices',()=>{
 const c=new ChoiceCapture(),d='「こいつです、間違いありません」';
 assert.deepEqual(c.add('【オズ】',d),[]);assert.deepEqual(c.add('「こ、」',d),[]);assert.equal(c.options(),null);});
test('real choices still count, also when their characters occur in the line',()=>{
 const c=new ChoiceCapture();assert.deepEqual(c.add('はい\nいいえ','そういえば、いいえ、はい'),['はい','いいえ']);assert.deepEqual(c.options(),['はい','いいえ']);});
test('blur rule is !important and more specific than the outline filter on body.tomoyo-gal-bound',()=>{
 const g=require('node:fs').readFileSync(require('node:path').join(__dirname,'../web/reader/modules/gal.js'),'utf8');
 assert.match(g,/html\.megulit-translation-blur body\.tomoyo-gal-bound \.tomoyo-cn-output\{filter:blur\(7px\)!important/);
 assert.match(g,/html\.megulit-translation-blur body\.tomoyo-gal-bound \.tomoyo-cn-output:hover\{filter:var\(--tomoyo-gal-cn-filter,none\)!important\}/);});
