'use strict';
// Numbers with counters (user, 2026-11-23: 10分 was annotated 10ふん). SudachiDict reads each token on its own: 分 is
// always フン and digits are read one by one (10 イチレイ). The tokens below are SudachiDict Full 20261015 output.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createReadingResolver,settled}=require('../core/reading.cjs');
const {counterReading,readNumber,parseNumber}=require('../core/counter-reading.cjs');
const {annotations}=require('../core/furigana.js');
const {exampleSpans}=require('../core/example-ruby.cjs');

const tok=(surface,reading,grammar,start,end)=>({surface,reading,grammar:grammar.split(','),pos:grammar.split(',')[0],base_form:surface,start,end,pitch:[1]});
const NUM='名詞,数詞,*',COUNT='名詞,普通名詞,助数詞可能';
function resolver(entries=[]){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-counter-'));const file=path.join(dir,'jmdict.json');
 fs.writeFileSync(file,JSON.stringify(entries));test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 return createReadingResolver(file);
}

test('a number and its counter are read as one word with the sound change',()=>{
 const r=resolver();
 const line='あと10分だけ';
 const out=r.resolve([tok('あと','アト','名詞,普通名詞,副詞可能',0,2),tok('10','イチレイ',NUM,2,4),tok('分','フン',COUNT,4,5),tok('だけ','ダケ','助詞,副助詞,*',5,7)]);
 const word=out.find(t=>t.surface==='10分');
 assert.equal(word.reading,'じゅっぷん');assert.equal(word.start,2);assert.equal(word.end,5);assert.ok(settled(word));
 assert.deepEqual(word.pitch,[],'the merged word has no UniDic accent of its own, so speech estimates it');
 assert.deepEqual(annotations(line,out).filter(a=>a.start===2),[{start:2,end:5,reading:'じゅっぷん'}]);
});

test('the counter takes the sound change of the number’s last part',()=>{
 const cases={'1分':'いっぷん','3分':'さんぷん','4分':'よんぷん','6分':'ろっぷん','8分':'はっぷん','20分':'にじゅっぷん','100分':'ひゃっぷん',
  '１０分':'じゅっぷん','三百本':'さんびゃっぽん','六百本':'ろっぴゃっぽん','4本':'よんほん','1000本':'せんぼん','三匹':'さんびき','1杯':'いっぱい',
  '3階':'さんがい','6個':'ろっこ','8歳':'はっさい','6歳':'ろくさい','20歳':'はたち','100点':'ひゃくてん','3ヶ月':'さんかげつ','6か月':'ろっかげつ',
  '4人':'よにん','1人':'ひとり','14人':'じゅうよにん','7時':'しちじ','9時':'くじ','4月':'しがつ','4円':'よえん','34日':'さんじゅうよっか','20日':'はつか',
  '1,000円':'せんえん','2万5千円':'にまんごせんえん','一万円':'いちまんえん','10秒':'じゅうびょう'};
 for(const [text,reading] of Object.entries(cases)){
  const counter=['ヶ月','か月'].find(c=>text.endsWith(c))||text.slice(-1);
  assert.equal(counterReading(text.slice(0,-counter.length),counter),reading,text);
 }
});

test('meaning-dependent or unknown combinations are left alone',()=>{
 assert.equal(counterReading('十','分'),'','十分 is usually じゅうぶん (enough)');
 assert.equal(counterReading('13','月'),'');
 assert.equal(counterReading('3','匹目'),'');
 assert.equal(parseNumber('3.5'),null);
 assert.equal(parseNumber('012'),null);
 const r=resolver([{spellings:['十分'],readings:['じゅうぶん','じっぷん']}]);
 const out=r.resolve([tok('十','ジュウ',NUM,0,1),tok('分','フン',COUNT,1,2),tok('待っ','マッ','動詞,一般,*',2,4)]);
 assert.equal(out[0].surface,'十分');assert.equal(out[0].reading,'じゅうぶん');assert.equal(out[0].readingSource,'dictionary');
});

test('a longer dictionary word that starts with the number wins',()=>{
 const r=resolver([{spellings:['一日中'],readings:['いちにちじゅう']}]);
 // 中 as ジュウ: the dictionary merge compares the tokenizer's reading, so this case needs it to match.
 const out=r.resolve([tok('一','イチ',NUM,0,1),tok('日','ニチ',COUNT,1,2),tok('中','ジュウ','接尾辞,名詞的,副詞可能',2,3)]);
 assert.equal(out[0].surface,'一日中');assert.equal(out[0].reading,'いちにちじゅう');
});

test('a number on its own is read by value, not digit by digit',()=>{
 const out=resolver().resolve([tok('34','サンヨン',NUM,0,2)]);
 assert.equal(out[0].reading,'さんじゅうよん');assert.ok(settled(out[0]));
 assert.equal(readNumber(2026),'にせんにじゅうろく');assert.equal(readNumber(10000),'いちまん');
});

test('example sentences and the daily page show the number reading',()=>{
 const r=resolver();const text='あと3本だけ';
 const out=r.resolve([tok('あと','アト','名詞,普通名詞,副詞可能',0,2),tok('3','サン',NUM,2,3),tok('本','ポン','接尾辞,名詞的,助数詞',3,4),tok('だけ','ダケ','助詞,副助詞,*',4,6)]);
 assert.deepEqual(exampleSpans(text,out,[]).map(s=>[s.start,s.end,s.reading]),[[2,4,'さんぼん']]);
 assert.match(fs.readFileSync(path.join(__dirname,'..','services','daily.cjs'),'utf8'),/settled\(t\)\?String\(t\.reading/);
});
