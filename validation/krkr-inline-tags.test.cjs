'use strict';
/* 9-nine Episode 4 (live test 2026-11-13): 351 script lines carry KiriKiri inline commands (%p-1;%fＭＳ ゴシック;――%p;%fuser;,
   %D$vl1;) the game never shows; the captured line must still match its script line and take the release's own Chinese. */
const test=require('node:test'),assert=require('node:assert/strict');
const {Matcher}=require('../services/original-text.cjs');
test('captured lines match script lines that hold KiriKiri inline commands',()=>{
 const rt=['「カケルの世界の眼が不完全なせいでしょうね……。」','「さっき%p-1;%fＭＳ ゴシック;――%p;%fuser;あなたにとってはさっきじゃないかも\n　しれないけれど」','「消して……%D$vl1;ぇっ、でも」'];
 const og=['「大概是因為阿翔的世界之眼不完整吧……。」','「剛才%p-1;%fＭＳ ゴシック;──%p;%fuser;對你來說可能」','「消掉……%D$vl1;咦，可是」'];
 const m=new Matcher(rt,og);
 const a=m.match('「さっき――あなたにとってはさっきじゃないかも\nしれないけれど」');
 assert.equal(a.status,'exact');assert.deepEqual(a.indices,[1]);assert.equal(a.japanese,'「剛才──對你來說可能」');
 const b=m.match('「消して……ぇっ、でも」');assert.deepEqual(b.indices,[2]);assert.equal(b.japanese,'「消掉……咦，可是」');
 assert.equal(m.match('「50%の確率」').status,'none','a plain percent sign is text, not a command');
});
