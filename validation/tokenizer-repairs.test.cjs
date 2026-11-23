'use strict';
// SudachiDict misreadings repaired in LocalLearning.tokenize (user, 2026-11-23: そのうち上の二人 was annotated じょう). The
// worker is stubbed with SudachiDict Full 20261015 output for each line and for each kanji on its own. Every rule was
// checked against 20k real game lines; the counter-examples here are lines where a wider rule went wrong.
const test=require('node:test'),assert=require('node:assert/strict'),os=require('node:os'),path=require('node:path');
const {LocalLearning}=require('../core/learning-native.cjs');

const SUDACHI={
 'そのうち上の二人':[['その','ソノ','連体詞,*,*,*,*,*'],['うち','ウチ','名詞,普通名詞,副詞可能,*,*,*'],['上','ジョウ','接尾辞,名詞的,副詞可能,*,*,*'],['の','ノ','助詞,格助詞,*,*,*,*'],['二人','フタリ','名詞,普通名詞,副詞可能,*,*,*']],
 '理論上の':[['理論','リロン','名詞,普通名詞,一般,*,*,*'],['上','ジョウ','接尾辞,名詞的,副詞可能,*,*,*'],['の','ノ','助詞,格助詞,*,*,*,*']],
 'ちゃん的には':[['ちゃん','チャン','接尾辞,名詞的,一般,*,*,*'],['的','テキ','接尾辞,形状詞的,*,*,*,*'],['に','ニ','助動詞,*,*,*,助動詞-ダ,連用形-ニ','だ'],['は','ハ','助詞,係助詞,*,*,*,*']],
 'さわり方を':[['さわり','サワリ','動詞,一般,*,*,五段-ラ行,連用形-一般','さわる'],['方','カタ','接尾辞,名詞的,一般,*,*,*'],['を','ヲ','助詞,格助詞,*,*,*,*']],
 'さん達の':[['さん','サン','接尾辞,名詞的,一般,*,*,*'],['達','タチ','接尾辞,名詞的,一般,*,*,*'],['の','ノ','助詞,格助詞,*,*,*,*']],
 '上の二人と':[['上','ジョウ','接尾辞,名詞的,副詞可能,*,*,*'],['の','ノ','助詞,格助詞,*,*,*,*'],['二人','フタリ','名詞,普通名詞,副詞可能,*,*,*'],['と','ト','助詞,格助詞,*,*,*,*']],
 'うち上藤':[['うち','ウチ','名詞,普通名詞,副詞可能,*,*,*'],['上','ジョウ','接尾辞,名詞的,副詞可能,*,*,*'],['藤','フジ','名詞,普通名詞,一般,*,*,*']],
 '汚っ':[['汚','オ','接頭辞,*,*,*,*,*'],['っ','ッ','記号,一般,*,*,*,*']],
 '小さき':[['小','サ','接頭辞,*,*,*,*,*'],['さき','サキ','名詞,普通名詞,副詞可能,*,*,*']],
 '０対２':[['０','レイ','名詞,数詞,*,*,*,*','0'],['対','ツイ','名詞,普通名詞,助数詞可能,*,*,*'],['２','ニ','名詞,数詞,*,*,*,*','2']],
 '二対の':[['二','ニ','名詞,数詞,*,*,*,*'],['対','タイ','名詞,普通名詞,一般,*,*,*'],['の','ノ','助詞,格助詞,*,*,*,*']],
 '対２':[['対','ツイ','名詞,普通名詞,助数詞可能,*,*,*'],['２','ニ','名詞,数詞,*,*,*,*','2']],
 '性に合わない':[['性','セイ','名詞,普通名詞,一般,*,*,*'],['に','ニ','助詞,格助詞,*,*,*,*'],['合わ','アワ','動詞,非自立可能,*,*,五段-ワア行,未然形-一般','合う'],['ない','ナイ','助動詞,*,*,*,助動詞-ナイ,終止形-一般']],
 '見に来た':[['見','ミ','動詞,非自立可能,*,*,上一段-マ行,連用形-一般','見る'],['に','ニ','助詞,格助詞,*,*,*,*'],['来','キ','動詞,非自立可能,*,*,カ行変格,連用形-一般','来る'],['た','タ','助動詞,*,*,*,助動詞-タ,終止形-一般']],
 '気もなかった':[['気','キ','名詞,普通名詞,一般,*,*,*'],['も','モ','助詞,係助詞,*,*,*,*'],['なかっ','ナカッ','形容詞,非自立可能,*,*,形容詞,連用形-促音便','ない'],['た','タ','助動詞,*,*,*,助動詞-タ,終止形-一般']],
 '上':[['上','ウエ','名詞,普通名詞,副詞可能,*,*,*']],
 '方':[['方','ホウ','名詞,普通名詞,一般,*,*,*']],
 '的':[['的','マト','名詞,普通名詞,一般,*,*,*']],
 '小':[['小','ショウ','名詞,普通名詞,一般,*,*,*']],
 '汚':[['汚','キタナ','形容詞,一般,*,*,形容詞,語幹-一般','汚い']],
 '達':[['達','トオル','名詞,固有名詞,人名,名,*,*']],
};
function tokens(text){let at=0;return (SUDACHI[text]||[]).map(([surface,reading,pos,base=surface])=>{const grammar=pos.split(','),t={surface,reading,grammar,pos:grammar[0],base_form:base,normalized:base,start:at,end:at+surface.length,pitch:[]};at=t.end;return t;});}
const ENTRIES=[{id:1,spellings:['性に合う'],readings:['しょうにあう']},{id:2,spellings:['見に来る'],readings:['みにくる']},{id:3,spellings:['気もない'],readings:['けもない']}];
function stubbed(){
 const L=new LocalLearning(path.join(os.tmpdir(),'megulit-tokenizer-repairs'));L.ready=async()=>{};L.asked=[];
 L.worker={stdin:{write(line){const {id,text}=JSON.parse(line);L.asked.push(text);const p=L.pending.get(id);clearTimeout(p.timer);L.pending.delete(id);p.resolve(tokens(text));}}};
 L.load=function(){if(this.index)return;this.index=new Map();this.byId=new Map();this.english=new Map();for(const e of ENTRIES){this.byId.set(e.id,e);for(const k of [...e.spellings,...e.readings]){const ids=this.index.get(k)||[];ids.push(e.id);this.index.set(k,ids);}}};
 return L;
}
const read=async(L,text,surface)=>{const t=(await L.tokenize(text)).find(x=>x.surface===surface);return t&&t.reading;};

test('a suffix or prefix with no word to attach to takes the reading of the kanji on its own',async()=>{
 const L=stubbed();
 assert.equal(await read(L,'そのうち上の二人','上'),'ウエ');
 assert.equal(await read(L,'上の二人と','上'),'ウエ');   // the line edge is no word either
 assert.equal(await read(L,'汚っ','汚'),'キタナ');
 assert.equal((await L.tokenize('汚っ'))[0].base_form,'汚い');
 L.cache.clear();await L.tokenize('そのうち上の二人');
 assert.equal(L.asked.filter(t=>t==='上').length,1);     // the lone reading is asked once
});

test('suffixes that attach to kana words keep their reading',async()=>{
 const L=stubbed();
 assert.equal(await read(L,'理論上の','上'),'ジョウ');    // a word before it
 assert.equal(await read(L,'うち上藤','上'),'ジョウ');    // a kanji word after it: part of a name or compound
 assert.equal(await read(L,'ちゃん的には','的'),'テキ');  // 形状詞的: ちゃん的には, ありす風
 assert.equal(await read(L,'さわり方を','方'),'カタ');    // after a 連用形 it is the way of doing
 assert.equal(await read(L,'さん達の','達'),'タチ');      // alone 達 is the given name トオル
 assert.equal(await read(L,'小さき','小'),'サ');          // a prefix before more kana is a split word
});

test('対 between two numbers is a score or a match-up',async()=>{
 const L=stubbed();
 assert.equal(await read(L,'０対２','対'),'たい');
 assert.equal(await read(L,'対２','対'),'ツイ');
 assert.equal(await read(L,'二対の','対'),'タイ');   // a pair counter (につい) is not a score; left as SudachiDict reads it
});

test('an idiom ending in an inflected verb is found under its dictionary form',async()=>{
 const L=stubbed();
 const [word]=await L.tokenize('性に合わない');
 assert.deepEqual([word.surface,word.reading,word.base_form],['性に合わ','しょうにあわ','性に合う']);
 assert.equal((await L.tokenize('見に来た')).map(t=>t.reading).join(''),'ミニキタ');       // 来る changes its stem reading
 assert.equal((await L.tokenize('気もなかった')).map(t=>t.reading).join(''),'キモナカッタ'); // no kanji stem in なかっ
});
