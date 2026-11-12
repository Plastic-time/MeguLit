'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../services/grammar.cjs');
/* tokens as SudachiDict Full gives them (MeguLit's reading worker) */
const tk=list=>{let at=0;return list.map(([surface,...grammar])=>{const t={surface,pos:grammar[0],grammar,start:at,end:at+[...surface].length};at=t.end;return t;});};
const point=async id=>{const m=await G.levels();for(const l of m.LEVEL_LIST){const p=m.levelPoints(l).find(x=>x.id===id);if(p)return {p,m};}throw Error(id);};
const conf=async(id,text,tokens)=>{const {p,m}=await point(id),h=m.findHit(p,text);return h?G.confirmHit(p,text,h,tokens):0;};
const MOAN='由良「やんっ……！行人のオチ●ポ優しくてぇ……」';
const MOAN_T=tk([['由良','名詞','固有名詞'],['「','補助記号','括弧開'],['や','感動詞','一般'],['んっ','感動詞','一般'],['…','補助記号','一般'],['…','補助記号','一般'],['！','補助記号','句点'],['行人','名詞','普通名詞'],['の','助詞','格助詞'],['オチ','名詞','普通名詞'],['●','補助記号','一般'],['ポ','名詞','普通名詞'],['優しく','形容詞','一般'],['てぇ','助詞','接続助詞'],['…','補助記号','一般'],['…','補助記号','一般'],['」','補助記号','括弧閉']]);
test('a moan やんっ is not じゃん／やん, with or without the tokenizer',async()=>{
  assert.equal(await conf('n0-jan',MOAN,MOAN_T),0);
  assert.equal(await conf('n0-jan',MOAN,null),0);
});
test('じゃんけん is a word, not じゃん',async()=>{
  assert.equal(await conf('n0-jan','じゃんけんしよう',tk([['じゃんけん','名詞','普通名詞'],['しよう','動詞','非自立可能']])),0);
  assert.equal(await conf('n0-jan','じゃんけんしよう',null),0);
});
test('real じゃん after a plain form at the end of the clause passes',async()=>{
  const c=await conf('n0-jan','だから言ったじゃん！',tk([['だ','助動詞'],['から','助詞','接続助詞'],['言っ','動詞','一般'],['た','助動詞'],['じゃん','助詞','終助詞'],['！','補助記号','句点']]));
  assert.ok(c>=G.MIN_CONF,String(c));
  assert.ok(await conf('n0-jan','だから言ったじゃん！',null)>=G.MIN_CONF);
});
test('やん from やる (救ってやんねー) is not じゃん',async()=>{
  assert.equal(await conf('n0-jan','救ってやんねーよ！',tk([['救っ','動詞','一般'],['て','助詞','接続助詞'],['やん','動詞','非自立可能'],['ねー','助動詞'],['よ','助詞','終助詞'],['！','補助記号','句点']])),0);
});
test('general rules: no span inside a noun, no adverb mistaken for grammar, no te-form for ので',async()=>{
  assert.equal(await conf('n4-teoku','『朋也くん』とくん付けで',tk([['『','補助記号'],['朋也','名詞','固有名詞'],['くん','接尾辞','名詞的'],['』','補助記号'],['と','助詞','格助詞'],['くん','接尾辞','名詞的'],['付け','名詞','普通名詞'],['で','助詞','格助詞']])),0);
  assert.equal(await conf('n4-sou','そりゃそうだ。',tk([['そりゃ','接続詞'],['そう','副詞'],['だ','助動詞'],['。','補助記号','句点']])),0);
  assert.equal(await conf('n4-node','痛んでいた右足',tk([['痛ん','動詞','一般'],['で','助詞','接続助詞'],['い','動詞','非自立可能'],['た','助動詞'],['右足','名詞','普通名詞']])),0);
  assert.ok(await conf('n4-node','説明がしたいので、',tk([['説明','名詞','普通名詞'],['が','助詞','格助詞'],['し','動詞','非自立可能'],['たい','助動詞'],['の','助詞','準体助詞'],['で','助動詞'],['、','補助記号','読点']]))>=G.MIN_CONF);
  assert.equal(await conf('n4-tame','ため息をつく',tk([['ため息','名詞','普通名詞'],['を','助詞','格助詞'],['つく','動詞','一般']])),0);
  assert.ok(await conf('n0-zo','こら、うるさいぞ！',tk([['こら','感動詞'],['、','補助記号','読点'],['うるさい','形容詞','一般'],['ぞ','助詞','終助詞'],['！','補助記号','句点']]))>=G.MIN_CONF,'ぞ after an adjective');
  assert.ok(await conf('n3-passive','虫を詰められた。',tk([['虫','名詞','普通名詞'],['を','助詞','格助詞'],['詰め','動詞','一般'],['られ','助動詞'],['た','助動詞'],['。','補助記号','句点']]))>=G.MIN_CONF);
});
test('low confidence lines never become examples; explicit lines never open the lesson',async()=>{
  const {m}=await point('n0-jan');
  const base={gameId:'g',origin:'history',title:'T'};
  const ex=G.levelExamples([{...base,text:MOAN},{...base,text:'じゃんけんしよう'}],m);assert.deepEqual(ex['n0-jan'],[]);
  const two=G.levelExamples([{...base,text:'オチ●ポ大きいじゃん！',translation:'x',translationSource:'group'},{...base,gameId:'h',text:'なんだ、できるじゃん。'}],m)['n0-jan'];
  assert.equal(two.length,2);assert.equal(two[0].text,'なんだ、できるじゃん。');assert.ok(G.isExplicit(two[1].text));
});
test('the same line with and without its speaker counts once',async()=>{
  const {m}=await point('n4-tara');const base={gameId:'g',origin:'history',title:'T'};
  const ex=G.levelExamples([{...base,text:'武也「雨が止んだら行こう」'},{...base,gameId:'h',text:'「雨が止んだら行こう」'}],m)['n4-tara'];
  assert.equal(ex.length,1);
});
test('the report confirms with the tokenizer and caches each verdict per line',async()=>{
  const {m}=await point('n0-jan');const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(':memory:');let calls=0;
  const tokenize=async t=>{calls++;return t===MOAN?MOAN_T:tk([['なん','代名詞'],['だ','助動詞'],['、','補助記号','読点'],['できる','動詞','一般'],['じゃん','助詞','終助詞'],['。','補助記号','句点']]);};
  const list=[{gameId:'g',origin:'history',title:'T',text:MOAN},{gameId:'g',origin:'history',title:'T',text:'なんだ、できるじゃん。'}];
  const a=await G.levelExamplesAsync(list,m,{tokenize,db});assert.deepEqual(a['n0-jan'].map(e=>e.text),['なんだ、できるじゃん。']);
  const n=calls;await G.levelExamplesAsync(list,m,{tokenize,db});assert.equal(calls,n,'cached');
});
