'use strict';
// Character names (user, 2026-11-23: 「猜不准就去联网查，直到你保证他准确」). SudachiDict reads an unknown name kanji by kanji
// (Cafe Stella: 昂晴 のぼるはれ, 明月 あかつき, 希 まれ); VNDB lists 高嶺 昂晴 as Takamine Kousei. The VNDB rows below are
// copied from api.vndb.org/kana/character for v26414 and v751 on 2026-11-23.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {romajiKana,characterNames,nameTokens,gameNames,vndbTitle}=require('../core/name-reading.cjs');
const {LocalLearning}=require('../core/learning-native.cjs');

const tok=(surface,reading,grammar,start,end)=>({surface,reading,grammar:grammar.split(','),pos:grammar.split(',')[0],base_form:surface,start,end,pitch:[1]});
const NOUN='名詞,普通名詞,一般',PREFIX='接頭辞,*,*',PARTICLE='助詞,格助詞,*';
const KANJI={月:['げつ','がつ','つき'],津:['しん','つ'],覆面:['ふくめん']};
const lookup=s=>KANJI[s]||[];
const STELLA=[{id:'c85052',name:'Akizuki Kanna',original:'明月 栞那'},{id:'c85054',name:'Sumizome Nozomi',original:'墨染 希'},
 {id:'c85057',name:'Takamine Kousei',original:'高嶺 昂晴'},{id:'c85058',name:'Mikado',original:'ミカド'}];

test('VNDB romaji reads as kana, and a name that does not parse is left out',()=>{
 for(const [latin,reading] of [['Kousei','こうせい'],['Tennouji','てんのうじ'],['Kotarou','こたろう'],["Shin'ya",'しんや'],['Hiuchidani','ひうちだに'],
  ['Matcha','まっちゃ'],['Kappa','かっぱ'],['Shimbashi','しんばし'],['Ōtori','おうとり'],['Sakuya','さくや']])assert.equal(romajiKana(latin),reading,latin);
 assert.equal(romajiKana('Xavier'),'');assert.equal(romajiKana('Kou-kun'),'');
});

test('each name part and the whole name get the VNDB reading, spelled with づ where the last kanji is つ',()=>{
 const names=new Map(characterNames([...STELLA,{name:'Nakatsu Shizuru',original:'中津 静流'},{name:'Fukumen',original:'覆面選手'},
  {name:'Kanbe Kotori',original:'神戸 小鳥'},{name:'Koube',original:'神戸'},{name:'One Two',original:'一'}],lookup));
 assert.equal(names.get('明月'),'あきづき');assert.equal(names.get('明月栞那'),'あきづきかんな');
 assert.equal(names.get('昂晴'),'こうせい');assert.equal(names.get('高嶺昂晴'),'たかみねこうせい');assert.equal(names.get('希'),'のぞみ');
 assert.equal(names.get('中津静流'),'なかつしずる','津 reads つ, but it is not the kanji before ず');
 assert.equal(names.has('覆面選手'),false,'a title that reads only its first word');
 assert.equal(names.has('神戸'),false,'two characters read the same spelling differently');assert.equal(names.get('小鳥'),'ことり');
 assert.equal(names.has('ミカド'),false);assert.equal(names.has('一'),false,'parts that do not match the romaji');
});

test('tokens that spell a name read as the name, one-kanji names only where they are not part of a word',()=>{
 const names=new Map([['昂晴','こうせい'],['希','のぞみ'],['新','あらた'],['篝','かがり'],['鳳','おおとり']]);
 const read=tokens=>nameTokens(tokens,names).map(t=>[t.surface,t.reading,t.readingSource||'']);
 const cut=nameTokens([tok('昂','ノボル',NOUN,0,1),tok('晴','ハレ',NOUN,1,2),tok('君','クン','接尾辞,名詞的,一般',2,3)],names);
 assert.deepEqual(cut.map(t=>[t.surface,t.reading,t.start,t.end]),[['昂晴','こうせい',0,2],['君','クン',2,3]]);
 assert.equal(cut[0].readingSource,'name');assert.deepEqual(cut[0].pitch,[]);assert.equal(cut[0].subtokens.length,2);
 assert.deepEqual(read([tok('希','マレ','形状詞,一般,*',0,1),tok('に','ニ',PARTICLE,1,2),tok('起こさ','オコサ','動詞,一般,*',2,5)])[0],['希','のぞみ','name'],'希に起こされ is Nozomi');
 assert.deepEqual(read([tok('希','キ',PREFIX,0,1),tok('本人','ホンニン',NOUN,1,3)])[0],['希','のぞみ','name'],'希本人');
 assert.deepEqual(read([tok('鳳','オオトリ','名詞,固有名詞,一般',0,1),tok('家','ケ','接尾辞,名詞的,一般',1,2)])[0],['鳳','おおとり','name'],'鳳家');
 assert.deepEqual(read([tok('篝','カガリ',NOUN,0,1),tok('シナリオ','シナリオ',NOUN,1,5)])[0],['篝','かがり','name'],'篝シナリオ');
 assert.deepEqual(read([tok('…','…','補助記号,句点,*',0,1),tok('','','補助記号,句点,*',1,1),tok('新','シン',PREFIX,1,2),tok('技','ワザ',NOUN,2,3)]).slice(1),[['','',''],['新','シン',''],['技','ワザ','']],'新技, after the empty marks of …');
 assert.deepEqual(read([tok('新','シン',PREFIX,0,1),tok('スキル','スキル',NOUN,1,4)])[0],['新','シン',''],'新スキル');
 assert.deepEqual(read([tok('希望','キボウ',NOUN,0,2)])[0],['希望','キボウ',''],'a name inside a word');
 assert.deepEqual(read([tok('…','…','補助記号,句点,*',0,1),tok('','','補助記号,句点,*',1,1),tok('希','マレ','形状詞,一般,*',1,2),tok('、','、','補助記号,読点,*',2,3)]),
  [['…','…',''],['','',''],['希','のぞみ','name'],['、','、','']],'the empty marks stay where they are');
});

test('the names are fetched once a week from VNDB, page by page, and the cache answers when VNDB is unreachable',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-names-'));test.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
 const sent=[];const fetcher=async(url,options)=>{const body=JSON.parse(options.body);sent.push({url,body});
  return {ok:true,json:async()=>body.page===1?{results:STELLA.slice(0,2),more:true}:{results:STELLA.slice(2),more:false}};};
 const names=await gameNames('v26414',{folder,fetcher,lookup,now:1000});
 assert.equal(names.get('明月'),'あきづき');assert.equal(names.get('昂晴'),'こうせい');
 assert.deepEqual(sent.map(s=>[s.url,s.body.page,JSON.stringify(s.body.filters)]),[['https://api.vndb.org/kana/character',1,'["vn","=",["id","=","v26414"]]'],['https://api.vndb.org/kana/character',2,'["vn","=",["id","=","v26414"]]']]);
 const offline=async()=>{throw Error('offline');};
 assert.equal((await gameNames('26414',{folder,fetcher,lookup,now:1000+3600e3})).get('昂晴'),'こうせい');assert.equal(sent.length,2,'within a week VNDB is not asked again');
 assert.equal((await gameNames('v26414',{folder,fetcher:offline,lookup,now:1000+30*86400e3})).get('昂晴'),'こうせい','a stale cache still answers offline');
 assert.equal((await gameNames('',{folder,fetcher})).size,0);assert.equal(sent.length,2);
});

function stubbed(lines){
 const L=new LocalLearning(path.join(os.tmpdir(),'megulit-names-learning'));L.ready=async()=>{};
 L.worker={stdin:{write(line){const {id,text}=JSON.parse(line);const p=L.pending.get(id);clearTimeout(p.timer);L.pending.delete(id);p.resolve(JSON.parse(JSON.stringify(lines[text])));}}};
 L.load=function(){if(this.index)return;this.index=new Map();this.byId=new Map();this.english=new Map();};
 L.request=async()=>({entries:[],morphology:{}});
 return L;
}

test('the reader’s furigana, lookup and speech button read the bound game’s names, other pages do not, and a new game drops them',async()=>{
 const L=stubbed({'昂晴君':[tok('昂','ノボル',NOUN,0,1),tok('晴','ハレ',NOUN,1,2),tok('君','クン','接尾辞,名詞的,一般',2,3)]});
 assert.equal((await L.tokenize('昂晴君'))[0].reading,'ノボル');
 L.useNames(new Map([['昂晴','こうせい']]));
 const N={names:true};
 assert.deepEqual((await L.tokenize('昂晴君',N)).map(t=>[t.surface,t.reading]),[['昂晴','こうせい'],['君','クン']],'the furigana cached before is dropped');
 assert.equal((await L.tokenize('昂晴君'))[0].reading,'ノボル','daily news, examples and grammar counts read the text without the game’s names');
 // The dictionary entry found for the selection is another word; the speech button still says the name.
 L.request=async()=>({surface:'昂晴',entries:[{id:9,spellings:['昂晴'],readings:['のぼりはれ']}],morphology:{base:'昂晴'}});
 const name=await L.word({text:'昂晴君',start:0,end:2},undefined,N);assert.equal(name.reading,'こうせい');assert.equal(name.ambiguous,false);
 assert.deepEqual((await L.word({text:'昂晴君',start:1,end:2},undefined,N)).spoken,{surface:'昂晴',reading:'こうせい',pitch:[],ambiguous:false},'a click on 晴 says the whole name');
 L.useNames(null);assert.equal((await L.tokenize('昂晴君',N))[0].reading,'ノボル');
 const reader=fs.readFileSync(path.join(__dirname,'..','services','reader.cjs'),'utf8');
 assert.match(reader,/this\.gameId=game\?\.id\|\|null;this\.bindNames\(game\);/);
 assert.match(reader,/gameNames\(vndbId,\{titles,folder:path\.join\(this\.root,'cache','vndb-names'\)/);
 assert.match(reader,/titles=\[game\?\.title,\.\.\.\(Array\.isArray\(lib\.names\)\?lib\.names:\[\]\)\]/,'a game without a VNDB id is looked up by its titles');
 assert.match(reader,/if\(!vndbId&&!titles\.some\(Boolean\)\)return;/,'and is not skipped for having no id');
 assert.equal(reader.match(/this\.gameId=null;this\.runtime\.localLearning\?\.useNames\(null\);/g)?.length,2,'game change and game exit');
 assert.match(reader,/readings\.resolve\(this\.runtime\.learning\(\)\.withNames\(r\.result\)\)/,'the UniDic engine path too');
 assert.match(reader,/learning\(\)\.request\(r\.command,r\.args,r\.language\|\|this\.prefs\(\)\.learnerLanguage\|\|'zh',\{names:true\}\)/,'the reader page furigana');
 assert.match(reader,/learning\(\)\.request\(command,args,this\.prefs\(\)\.learnerLanguage\|\|'zh',\{names:true\}\)/,'the reader page invoke path');
});

test('the reader card reads game names, the dictionary page’s Anki button does not',async()=>{
 const {Reader}=require('../services/reader.cjs');const asked=[];
 const model={word:async(args,id,options)=>{asked.push(options);return {surface:'希',reading:options?.names?'のぞみ':'まれ',pitch:[],ambiguous:false};}};
 const reader=Object.assign(Object.create(Reader.prototype),{active:()=>true,runtime:{config:()=>({}),learning:()=>model}});
 await reader.message({type:'v4',action:'word',args:{text:'希',start:0,end:1},id:1});
 await reader.message({type:'v4',action:'word',args:{text:'希',start:0,end:1,dictionary:true},id:2});
 assert.deepEqual(asked,[{names:true},{names:false}]);
});

test('the speech button says a full name as its family and given name',async()=>{
 const {Speech}=require('../core/speech.cjs');
 const READ={高嶺昂晴:['タカネ','ノボルハレ'],高嶺:['タカネ'],昂晴:['ノボルハレ']};
 const phrase=t=>({moras:[...t].map(text=>({text})),accent:1,pause_mora:null});
 let synthesized=null;
 const engine=async(url,options)=>{const u=new URL(url),text=u.searchParams.get('text')||'';
  const json=v=>({ok:true,json:async()=>v,arrayBuffer:async()=>{const b=Buffer.alloc(44);b.write('RIFF',0,'ascii');b.write('WAVE',8,'ascii');return b;}});
  if(u.pathname==='/speakers')return json([{styles:[{id:0}]}]);
  if(u.pathname==='/audio_query')return json({accent_phrases:(READ[text]||[text]).map(phrase)});
  if(u.pathname==='/accent_phrases')return json((READ[text]||[text.replace(/'/g,'')]).map(phrase));
  if(u.pathname==='/synthesis'){synthesized=JSON.parse(options.body);return json(null);}
  throw Error('unexpected '+url);};
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-name-speech-'));test.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
 const word={surface:'高嶺昂晴',reading:'たかみねこうせい',pitch:[],ambiguous:false,parts:[{surface:'高嶺',reading:'たかみね'},{surface:'昂晴',reading:'こうせい'}]};
 await new Speech(folder,engine).synthesize(word,{aivisUrl:'http://127.0.0.1:10101',aivisSpeaker:0});
 assert.deepEqual(synthesized.accent_phrases.map(p=>p.moras.map(m=>m.text).join('')),['タカミネ','コウセイ']);
});

test('VNDB romaji without long vowels keeps the tokenizer’s long vowel, and nothing wider',()=>{
 // 戸崎 瑛三 is Tosaki Eizo on VNDB and thumb_eizo.jpg on the official site; 高畠 青海 is おうみ (VNDB and Wikipedia).
 const names=new Map([['瑛三','えいぞ'],['青海','おうみ'],['祐磨','ゆうま']]);
 const read=t=>nameTokens([t],names)[0].reading;
 assert.equal(read(tok('瑛三','エイゾウ',NOUN,0,2)),'えいぞう');
 assert.equal(read(tok('青海','アオウミ',NOUN,0,2)),'おうみ');
 assert.equal(read(tok('祐磨','ユマ',NOUN,0,2)),'ゆうま','a shorter tokenizer reading never wins');
});

test('a game without a VNDB id is found by a title that matches a VNDB title or one part of it',async()=>{
 const results=[{id:'v97',title:'Saya no Uta',alttitle:'沙耶の唄',titles:[{title:'Saya no Uta ~ The Song of Saya'}],aliases:["Saya's Song"]},
  {id:'v751',title:'Rewrite',alttitle:null,titles:[{title:'Rewrite'}],aliases:[]}];
 const asked=[];const fetcher=async(url,o)=>{asked.push(JSON.parse(o.body).filters[2]);return {ok:true,json:async()=>({results})};};
 assert.deepEqual(await vndbTitle('The Song of Saya',fetcher),{id:'v97'});
 assert.deepEqual(await vndbTitle('沙耶の唄',fetcher),{id:'v97'});
 assert.equal(await vndbTitle('Rewrite+',fetcher),null,'a near title is not the game');
 assert.equal(await vndbTitle('Saya',fetcher),null);
 assert.equal(await vndbTitle('x',async()=>{throw Error('offline');}),undefined);

 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-titles-'));test.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
 const searched=[];let answer={'去人たち':{id:'v19216'},'Unknown':null};
 const find=async t=>{searched.push(t);return answer[t];};
 const characters=async()=>({ok:true,json:async()=>({results:[{name:'Tosaki Kana',original:'戸崎 鹿南'}],more:false})});
 assert.equal((await gameNames('',{titles:['去人たち'],folder,find,fetcher:characters,now:1000})).get('鹿南'),'かな');
 assert.equal((await gameNames('',{titles:['Unknown'],folder,find,fetcher:characters,now:1000})).size,0);
 answer={};// VNDB unreachable now: the found id is kept a week, "not on VNDB" a day
 await gameNames('',{titles:['去人たち','Unknown'],folder,find,fetcher:characters,now:1000+3600e3});
 assert.deepEqual(searched,['去人たち','Unknown']);
 answer={'Unknown':undefined};await gameNames('',{titles:['Unknown'],folder,find,fetcher:characters,now:1000+2*86400e3});
 await gameNames('',{titles:['Unknown'],folder,find,fetcher:characters,now:1000+2*86400e3});
 assert.deepEqual(searched,['去人たち','Unknown','Unknown','Unknown'],'an unreachable VNDB is asked again next time');
});

test('a damaged or future-dated name cache is replaced, not trusted',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-names-bad-'));test.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
 const characters=async()=>({ok:true,json:async()=>({results:[{name:'Tosaki Kana',original:'戸崎 鹿南'}],more:false})});
 fs.writeFileSync(path.join(folder,'titles.json'),'"x"');
 assert.equal((await gameNames('',{titles:['去人たち'],folder,find:async()=>({id:'v19216'}),fetcher:characters,now:1000})).get('鹿南'),'かな');
 assert.equal(JSON.parse(fs.readFileSync(path.join(folder,'titles.json'),'utf8'))['去人たち'].id,'v19216');
 fs.writeFileSync(path.join(folder,'v19216.json'),JSON.stringify({at:1e20,characters:[{name:'Old',original:'古'}]}));
 let asked=0;const fetcher=async(...a)=>{asked++;return characters(...a);};
 assert.equal((await gameNames('v19216',{folder,fetcher,now:2000})).get('鹿南'),'かな','a cache written in the future (a clock set back) is fetched again');
 assert.equal(asked,1);
 // Offline weeks later: the title's old id still finds the cached characters.
 const offline=async()=>{throw Error('offline');};
 assert.equal((await gameNames('',{titles:['去人たち'],folder,find:async()=>undefined,fetcher:offline,now:2000+30*86400e3})).get('鹿南'),'かな');
 fs.writeFileSync(path.join(folder,'v19216.json'),JSON.stringify({at:1,characters:'x'}));
 assert.equal((await gameNames('v19216',{folder,fetcher:offline,now:3000})).size,0,'a damaged cache and no VNDB give no names, not an error');
});

test('the reader page’s copy of the 私 reading drops the わたくし accent like the core one',()=>{
 for(const file of ['core/furigana.js','web/reader/modules/furigana.js'])
  assert.match(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),/reading: 'わたし' \+ reading\.slice\(4\), pitch: \[\], lexeme: null/,file);
});
