// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E600: language judgement of a probe. Numbers are the real probe counts of issues #242 #253 #249 #257 #266 #237 (Japanese
   originals the old 30% rule killed), the Chinese builds #282 #279 #269, and decode failures. */
const test=require('node:test'),assert=require('node:assert/strict');
const {judgeLanguage,classify,countLines}=require('../services/adapter-probe-core.cjs');
const J=(lines,japaneseLines,extra={})=>judgeLanguage({lines,japaneseLines,...extra});

test('Japanese originals with a low kana ratio stay Japanese',()=>{
 assert.equal(J(191244,52173),'japanese');assert.equal(J(294201,69481),'japanese');assert.equal(J(154613,25165),'japanese');
 assert.equal(J(139369,21522),'japanese');assert.equal(J(139399,41376),'japanese');assert.equal(J(162374,2620),'japanese');
});
test('Chinese builds are chinese-build, by Chinese-line majority or (old probes) by title',()=>{
 assert.equal(J(55199,166,{title:'[ALICESOFT] 兰斯01 -寻找小光- 重置汉化硬盘版'}),'chinese-build');
 assert.equal(J(14579,20,{title:'美少女万华镜1-被诅咒之传说少女 和谐版'}),'chinese-build');
 assert.equal(J(32522,0,{title:'[ゆずソフト] ライムライト・レモネードジャム AI翻译'.replace('ゆずソフト','yuzu').replace('ライムライト・レモネードジャム','Limelight')}),'chinese-build');
 assert.equal(J(50000,100,{chineseLines:30000,dialogueLines:40000,title:'x'}),'chinese-build');
});
test('almost no Japanese in a big script is decode-suspect, not not-japanese',()=>{
 assert.equal(J(64455,29,{title:'Tsukihime v1.6'}),'decode-suspect');assert.equal(J(8966,0),'decode-suspect');assert.equal(J(3520,0),'decode-suspect');
});
test('dialogue denominator drops command, file and path lines',()=>{
 assert.equal(J(100000,2000,{dialogueLines:6000}),'japanese');assert.equal(J(100000,400,{dialogueLines:1000,chineseLines:0}),'japanese');
 assert.equal(J(10000,200,{dialogueLines:9000,chineseLines:0,title:'x'}),'not-japanese');
 const c=countLines(['@bg bg01.png','data/scene/a01.ks','set_flag(1)','こんにちは','你好世界','hello there friend','','ENDMARK']);
 assert.deepEqual(c,{dialogue:3,japanese:1,chinese:1}.dialogue===3?c:null);assert.equal(c.dialogue,3);assert.equal(c.japanese,1);assert.equal(c.chinese,1);
});
test('classify routes the new steps and leaves ok alone',()=>{
 const inv={archives:[],scripts:0},e=(o)=>({id:'bgi',scenes:1,...o});
 assert.equal(classify({engines:[e({lines:162374,japaneseLines:2620})],inventory:inv}).step,'ok');
 assert.equal(classify({engines:[e({lines:30000,japaneseLines:3})],inventory:inv}).step,'decode-suspect');
 assert.equal(classify({engines:[e({lines:30000,japaneseLines:3})],inventory:inv,title:'某游戏 汉化版'}).step,'chinese-build');
 assert.equal(classify({engines:[e({lines:30,japaneseLines:0})],inventory:inv}).step,'ok');
});
test('E610 integrate: Chinese majority needs twice the Japanese; big script with a few dialogue lines is decode-suspect',()=>{
 assert.equal(judgeLanguage({lines:11838,japaneseLines:5630,dialogueLines:11414,chineseLines:5781}),'japanese');
 assert.equal(judgeLanguage({lines:180,japaneseLines:1,dialogueLines:3,chineseLines:0}),'decode-suspect');
 const inv={archives:[],scripts:0},e=(id,o)=>({id,scenes:1,...o});
 assert.equal(classify({engines:[e('garbro',{lines:500000,japaneseLines:90000,dialogueLines:90000,chineseLines:0}),e('fvp',{lines:40000,japaneseLines:5000,dialogueLines:40000,chineseLines:0})],inventory:inv}).detected,'fvp');
 assert.equal(classify({engines:[e('garbro',{lines:5000,japaneseLines:4000,dialogueLines:5000,chineseLines:0}),e('kirikiri',{lines:100,japaneseLines:3,dialogueLines:100,chineseLines:0})],inventory:inv}).detected,'garbro');
});
test('Cyrillic and Hangul multi-word dialogue lines count as dialogue and classify as not-japanese',()=>{
 const ru=Array.from({length:120},(_,i)=>`Помоги мне купить молоко номер ${i}`);
 const c=countLines(ru);
 assert.equal(c.dialogue,120);assert.equal(c.japanese,0);assert.equal(c.chinese,0);
 assert.equal(judgeLanguage({lines:120,japaneseLines:0,dialogueLines:c.dialogue,chineseLines:0,title:'Milk'}),'not-japanese');
 const ko=countLines(['우유를 사러 가자.','오늘은 날씨가 좋다.','단어']);
 assert.equal(ko.dialogue,2);assert.equal(ko.japanese,0);
});
