// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-19 user test (素晴らしき日々, BGI, group patch): 「やっぱり……いい女には、」「たばこと」「屋上と」「……そしてヒラヒラ服だわね……」」
   come one after another on one page. The first three each took their patch line (#13711 果然……好女人要有的是，, #13714 烟、,
   #13717 楼顶); the last one had none (「翻译暂不可用」 with no machine translation). The bridge hands 「……そして」 and its \x05
   continuation 「ヒラヒラ服だわね……」」 over as one line (fix/bgi-hide e0a3a89f, so 「……そして」 is no longer lost), but in the script
   they are two messages with the resource line ev0001_l between them, and Matcher.cover() wanted the lines to follow each
   other. A resource-name line is now stepped over inside a cover. Script below: the real lines #13700-#13725 of the game's
   Japanese script and of the patch. */
const test=require('node:test'),assert=require('node:assert/strict');
const {Matcher}=require('../services/original-text.cjs');
const JA=["打","か","変","　街の喧噪の中に立っている時とは打って変わって、ここはとても静かだ……。","　こんな時間にこんな場所で過ごしている人間がいたとしたら……、","　それは間違いなく、サボりか、ニートか……、私だ。","yuki_000001","由岐","「ふぅ……」","yuki_000002_a","由岐","「やっぱり……いい女には、","ev0001_l","yuki_000002_b","たばこと","ev0001_l","yuki_000002_c","屋上と","yuki_000002_d","……そして\n","ev0001_l","ヒラヒラ服だわね……」","ev0001_l","　たばこの銘柄はマイナーなもの……誰も吸ってない様なものが好ましい。","bgm017","ev0001"];
const ZH=["打","  ","变","  跟站在街上的喧嚣中时截然不同，这里非常安静……。","  如果说有什么人会在这种时间在这种地方闲晃的话……","  那肯定要么是逃课的，要么是NEET……要不然，就是我。 ","yuki_000001","由岐","「呼……」","yuki_000002_a","由岐","「果然……好女人要有的是， ","ev0001_l","yuki_000002_b","烟、 ","ev0001_l","yuki_000002_c","楼顶 ","yuki_000002_d","……还有\n ","ev0001_l","轻飘飘的衣服呀……」","ev0001_l","  烟的品牌是小众向的……但我很喜爱这种不会有人抽的烟。 ","bgm017","ev0001"];
const flat=s=>String(s||'').replace(/\s+/g,'');

test('every stage of the segmented line has its patch translation, the last one too (live order, one matcher)',()=>{
 const m=new Matcher(JA,ZH),got=[];
 for(const line of ['「ふぅ……」','「やっぱり……いい女には、','たばこと','屋上と','……そして\nヒラヒラ服だわね……」','　たばこの銘柄はマイナーなもの……誰も吸ってない様なものが好ましい。']){
  const r=m.match(line);assert.ok(r.status==='exact'||r.status==='high',line+' -> '+JSON.stringify(r));got.push([r.indices,flat(r.japanese)]);}
 assert.deepEqual(got,[[[8],'「呼……」'],[[11],'「果然……好女人要有的是，'],[[14],'烟、'],[[17],'楼顶'],[[19,21],'……还有轻飘飘的衣服呀……」'],[[23],'烟的品牌是小众向的……但我很喜爱这种不会有人抽的烟。']]);
});

test('the joined capture also resolves without its line break (as the reader shows it) and alone (after a restart)',()=>{
 for(const line of ['……そしてヒラヒラ服だわね……」','……そして\nヒラヒラ服だわね……」']){const r=new Matcher(JA,ZH).match(line);assert.deepEqual(r.indices,[19,21],line);assert.equal(flat(r.japanese),'……还有轻飘飘的衣服呀……」');}
});

test('a resource line is only stepped over inside a cover: never more than 3 in a row, never a text line',()=>{
 const many=['「あ、','a1','b2','c3','d4','いや」'],z=['「啊，','a1','b2','c3','d4','不」'];
 assert.equal(new Matcher(many,z).match('「あ、いや」').status,'none','four resource lines in a row end the cover');
 const three=['「あ、','a1','b2','c3','いや」'],z3=['「啊，','a1','b2','c3','不」'];
 assert.deepEqual(new Matcher(three,z3).match('「あ、いや」').indices,[0,4]);
 const text=['「あ、','次の行は別の台詞。','いや」'],zt=['「啊，','下一行是别的台词。','不」'];
 assert.equal(new Matcher(text,zt).match('「あ、いや」').status,'none','a Japanese line in between is not stepped over');
});

test('ordinary one-message lines resolve as before',()=>{
 const m=new Matcher(JA,ZH);
 assert.deepEqual(m.match('　街の喧噪の中に立っている時とは打って変わって、ここはとても静かだ……。').indices,[3]);
 assert.deepEqual(m.match('　こんな時間にこんな場所で過ごしている人間がいたとしたら……、').indices,[4]);
});
