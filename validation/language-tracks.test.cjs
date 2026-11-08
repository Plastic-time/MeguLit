'use strict';
/* SPDX-License-Identifier: GPL-3.0-or-later
   E243 multilingual containers: only the Japanese track reaches the reader. */
const test=require('node:test'),assert=require('node:assert/strict');
const {japaneseTrack}=require('../core/language-tracks.cjs');
const {RepeatNormalizer}=require('../core/repeat-normalizer.cjs');
const JP='「ついてないわね。こうも見事に直撃されるなんて」',SC='「真够不走运的。竟然赶得这么分毫不差」',TC='「真夠不走運的。竟然趕得這麼分毫不差」';
test('maitetsu: ？ separated tracks keep one Japanese copy',()=>{
 assert.equal(japaneseTrack(JP+JP+'？？？？？？'+JP+JP+'？？？？？？？'+SC+SC+'？？？？？？？'+TC+TC),JP);
 assert.equal(japaneseTrack(JP+'���'+SC),JP);
 assert.equal(japaneseTrack('「確認します」「確認します」'),'「確認します」');
});
test('maitetsu: %l inline alternatives keep the Japanese one',()=>{
 assert.equal(japaneseTrack('「確認開始%l砂撒き;放沙;放沙%l;。……」'),'「確認開始砂撒き。……」');
 assert.equal(japaneseTrack('「粘着力が低下しています」;「粘合力明显下降」;「粘合力明顯下降」'),'「粘着力が低下しています」');
});
test('ordinary lines are untouched',()=>{
 for(const s of ['「えっ？？？」','「？？？」','？？？「誰だ」','そうか;うん','「50%lightだね」',JP+JP,'「そうだ」「そうだ」'])assert.equal(japaneseTrack(s),s);
});
test('container then repeat normalizer gives one line from the first block',()=>{
 const r=new RepeatNormalizer();assert.equal(r.normalize('k',japaneseTrack(JP+JP+'？？？？？？'+JP+JP+'？？？？？？'+SC+SC)),JP);
});
test('v1.1.5: a whole Chinese line is another language track; Japanese kanji-only lines are not',()=>{
 const {foreignLine}=require('../core/language-tracks.cjs');
 assert.equal(foreignLine('「您好，這裡是Soleil。需要訂購什麼嗎？」'),true);assert.equal(foreignLine('「您好，这里是Soleil。请问需要订购什么呢？」'),true);
 for(const s of ['「はい、ソレイユです。」','「一期一会」','「本日開店、大盛況」','具体的な話'])assert.equal(foreignLine(s),false);
});
