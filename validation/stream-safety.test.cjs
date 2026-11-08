// SPDX-License-Identifier: GPL-3.0-or-later
// E215 generic stream safety: repeated-output streams are learned and undone per stream (サノバウィッチ EmbedKrkrZ:
// Japanese ×4 plus Chinese ×2 + traditional ×2 in one block), deliberate repeats stay, and script VM markers are cut
// without eating ordinary text such as "50％OFF".
const test=require('node:test'),assert=require('node:assert/strict');
const {RepeatNormalizer,runs}=require('../core/repeat-normalizer.cjs'),{scriptSource}=require('../core/hook-native.cjs');
const block=(jp,cn,tw)=>jp.replace('、','、\n')+jp.replace('、','、\n')+jp+jp+(cn?cn+cn+tw+tw:'');
test('a multilingual repeating stream gives the Japanese line once, keeping the game line break, from the first line',()=>{
 const r=new RepeatNormalizer();
 assert.equal(r.normalize('krkr',block('「あの……保科君、ちょっといいかな？」','「那个……保科，可以跟你说点事吗？」','「那個……保科，可以跟你講點事情嗎？」')),'「あの……保科君、\nちょっといいかな？」');
 assert.equal(r.normalize('krkr',block('それは昼休み、トイレから教室に戻る途中だった。','现在是午休时间。','現在是午休時間。')),'それは昼休み、\nトイレから教室に戻る途中だった。');
});
test('in a learned ×4 stream a line the script itself repeats keeps both copies',()=>{
 const r=new RepeatNormalizer();for(const s of ['「うん？　どうかした？」','秋の訪れを告げる冷えた風に乗って。','「あの……保科君、ちょっといいかな？」'])r.normalize('k',s+s+s+s);
 const twice='「そうだ」「そうだ」';assert.equal(r.normalize('k',twice+twice+twice+twice),twice);
});
test('streams that do not repeat consistently pass through unchanged',()=>{
 const r=new RepeatNormalizer();for(const s of ['「そうだ」「そうだ」','「待って待って待って」','ははははは！','普通の文。'])assert.equal(r.normalize('x',s),s);
});
test('per-character doubling is undone once learned or when a whole long line is doubled',()=>{
 const r=new RepeatNormalizer();assert.equal(r.normalize('d','ここれれははテテスストトのの文文章章でですす'),'これはテストの文章です');
 assert.equal(new RepeatNormalizer().normalize('e','ああ、そう'),'ああ、そう');
});
test('runs keep the copy with the game line breaks',()=>{
 assert.deepEqual(runs('ab、\ncdab、\ncdab、cd').map(r=>[r.raw,r.count]),[['ab、\ncd',3]]);
});
test('script VM markers are cut, ordinary percent text is kept',()=>{
 assert.equal(scriptSource('そう、雪だ。♪【＄名前＿渚】【＄名前＿渚】％Ａ【】'),'そう、雪だ。♪');
 assert.equal(scriptSource('％Ａ《渚の名前》プロローグ'),'');assert.equal(scriptSource('全品50％OFFだって！'),'全品50％OFFだって！');
});
