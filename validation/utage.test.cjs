// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const scenes=require('../services/original-engines/scenes.cjs');
const {probeGame}=require('../services/adapter-probe-core.cjs');

const align=b=>Buffer.concat([b,Buffer.alloc((4-b.length%4)%4)]);
const u32=v=>{const b=Buffer.alloc(4);b.writeUInt32LE(v>>>0);return b;};
const i32=v=>{const b=Buffer.alloc(4);b.writeInt32LE(v|0);return b;};
const str=s=>{const b=Buffer.from(String(s),'utf8');return Buffer.concat([u32(b.length),align(b)]);};

function gridBytes(sheetName,rows,tailInts=5){
 const parts=[i32(rows.length)];
 rows.forEach((cells,idx)=>{
  parts.push(i32(idx),i32(cells.length));
  for(const c of cells)parts.push(str(c));
  parts.push(i32(0),i32(0));
 });
 parts.push(str(sheetName));
 for(let k=0;k<tailInts;k++)parts.push(i32(k===0?1:0));
 return Buffer.concat(parts);
}

function monoBook(name,sheets){
 const hdr=Buffer.concat([Buffer.alloc(12),i32(1),i32(1),Buffer.alloc(8),str(name),i32(0),i32(sheets.length)]);
 return Buffer.concat([hdr,...sheets.map(([n,rows])=>gridBytes(n,rows,5))]);
}

function monoChapter(name,grids){
 const hdr=Buffer.concat([Buffer.alloc(12),i32(1),i32(1),Buffer.alloc(8),str(name),i32(0),i32(1),Buffer.alloc(12),i32(grids.length)]);
 return Buffer.concat([hdr,...grids.map(([n,rows])=>gridBytes(n,rows,3))]);
}

// Uncompressed format-22 SerializedFile holding MonoBehaviours (classId 114).
function serializedFile(monos){
 const ver=Buffer.from('2022.3.17f1\0','latin1');
 const meta=[ver,u32(19),Buffer.from([0]),u32(1),i32(114),Buffer.from([0]),Buffer.from([0xff,0xff]),Buffer.alloc(32),u32(monos.length)];
 let len=48+meta.reduce((s,b)=>s+b.length,0);const entries=[];let dataAt=0;
 monos.forEach((m,i)=>{
  const pad=Buffer.alloc((4-len%4)%4);len+=pad.length;
  const e=Buffer.alloc(24);e.writeBigInt64LE(BigInt(i+1),0);e.writeBigUInt64LE(BigInt(dataAt),8);e.writeUInt32LE(m.length,16);e.writeInt32LE(0,20);
  entries.push(pad,e);len+=24;dataAt+=m.length;
 });
 const dataOffset=(len+15)&~15,head=Buffer.alloc(48);
 head.writeUInt32BE(22,8);head[16]=0;head.writeUInt32BE(len-48,20);
 head.writeBigUInt64BE(BigInt(dataOffset+dataAt),24);head.writeBigUInt64BE(BigInt(dataOffset),32);
 return Buffer.concat([head,...meta,...entries,Buffer.alloc(dataOffset-len),...monos]);
}

function put(dir,files){
 for(const [rel,data] of Object.entries(files)){
  const f=path.join(dir,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,data);
 }
}
const tmp=p=>fs.mkdtempSync(path.join(os.tmpdir(),p));

test('Utage AdvImportScenarioBook: reads Japanese lines, Chinese translation, ruby and localized speakers; probes as ok',()=>{
 const dir=tmp('utage-');
 const rows=[
  ['','Command','Arg1','WaitType','Text','SC','English','Japanese'],
  ['','','','','k1','这是一个关于[故事]的序幕。','This is a prologue.','これはとある物語の序章である。'],
  ['','','阿明','','k2','[早上好，今天天气真好！]','[Good morning, nice weather!]','「おはよう、<ruby=きょう>今日</ruby>はいい天気だね！」'],
  ['','','阿明少年','','k3','[确实如此，一起去<ruby=>散步</ruby>吧！]','[Indeed, let us walk!]','「まったくだ、<ruby=いっしょ>一緒</ruby>に歩こう！」'],
  ['','Se','Wind','','k4','<i>微风拂过面颊。</i>','A breeze blew.','そよ風が頬を撫でた。'],
  ['','Selection','*go','','k5','前往集市','Go to market','市場へ行く'],
 ];
 for(let i=0;i<30;i++)rows.push(['','','','','f'+i,'第'+i+'句补充测试对白。','Extra dialogue line '+i+'.','テスト用の台詞その'+i+'です。']);
 const book=monoBook('Demo.book',[
  ['Assets/Demo/Demo.xlsx:Thread',[['','Command','Arg1','Text'],['','Tween','BG','']]],
  ['Assets/Demo/Demo.xlsx:Ch01',rows],
 ]);
 const chapter=monoChapter('Boot.chapter',[
  ['Assets/Demo/Demo.xlsx:Character',[['','CharacterName','NameText'],['','阿明','阿明'],['','阿明少年','阿明']]],
  ['Assets/Demo/Demo.xlsx:Localize',[['Key','SC','English','Japanese'],['阿明','阿明','Ming','明くん']]],
 ]);
 put(dir,{
  'Demo.exe':'MZ',
  'UnityPlayer.dll':'x',
  'Demo_Data/sharedassets0.assets':serializedFile([book,chapter]),
 });

 assert.equal(scenes.detect(dir),'utage');
 const list=scenes.read('utage',dir);
 assert.deepEqual(list.map(s=>s.name),['Ch01']);
 assert.deepEqual(list[0].lines.slice(0,5),[
  'これはとある物語の序章である。',
  '「おはよう、今日はいい天気だね！」',
  '「まったくだ、一緒に歩こう！」',
  'そよ風が頬を撫でた。',
  '市場へ行く',
 ]);
 assert.deepEqual(list[0].zh.slice(0,5),[
  '这是一个关于[故事]的序幕。',
  '[早上好，今天天气真好！]',
  '[确实如此，一起去散步吧！]',
  '微风拂过面颊。',
  '前往集市',
 ]);
 assert.deepEqual(list[0].ruby.slice(0,5),[
  null,
  [['今日','きょう']],
  [['一緒','いっしょ']],
  null,
  null,
 ]);
 assert.deepEqual(list[0].speakers.slice(0,5),['','明くん','明くん','','']);

 const patched=scenes.ENGINES.utage.patchLines(list,{dirs:[dir]});
 assert.equal(patched[0].patched,true);
 assert.equal(patched[0].lines[1],'[早上好，今天天气真好！]');

 const f=scenes.ENGINES.utage.foreign(dir);
 assert.equal(f.get('thisisaprologue'),'これはとある物語の序章である。');
 assert.equal(f.get('前往集市'),'市場へ行く');

 const probe=probeGame({dir,executable:'Demo.exe',title:'Demo'});
 assert.equal(probe.step,'ok');
 assert.equal(probe.detail,'utage');
 assert.equal(probe.lines,35);
 assert.equal(probe.japaneseLines,35);

 fs.rmSync(dir,{recursive:true,force:true});
});

test('Utage AdvImportScenarioBook: Chinese-only book classifies as chinese-build rather than ok',()=>{
 const dir=tmp('utage-zh-');
 const rows=[['','Command','Arg1','Text','SC']];
 for(let i=0;i<60;i++)rows.push(['','','','k'+i,'第'+i+'段中文剧情对话内容，这里没有任何日文假名。']);
 const book=monoBook('ZhOnly.book',[['Assets/ZhOnly/ZhOnly.xlsx:Ch01',rows]]);
 put(dir,{'ZhOnly.exe':'MZ','UnityPlayer.dll':'x','ZhOnly_Data/resources.assets':serializedFile([book])});

 assert.equal(scenes.detect(dir),'utage');
 const probe=probeGame({dir,executable:'ZhOnly.exe',title:'ZhOnly'});
 assert.equal(probe.step,'chinese-build');
 assert.equal(probe.detail,'utage');
 assert.equal(probe.lines,60);
 assert.equal(probe.japaneseLines,0);

 fs.rmSync(dir,{recursive:true,force:true});
});

function scenarioBundle(mono){
 const data=serializedFile([mono]),block=Buffer.alloc(10),entry=Buffer.alloc(20);
 block.writeUInt32BE(data.length,0);block.writeUInt32BE(data.length,4);
 entry.writeBigUInt64BE(BigInt(data.length),8);
 const be=n=>u32(n).swap32();
 const info=Buffer.concat([Buffer.alloc(16),be(1),block,be(1),entry,Buffer.from('CAB-story\0')]);
 const head=Buffer.concat([Buffer.from('UnityFS\0'),be(6),Buffer.from('5.x.x\0'),Buffer.from('2020.3.7f1\0'),Buffer.alloc(20)]);
 head.writeBigUInt64BE(BigInt(head.length+info.length+data.length),head.length-20);
 head.writeUInt32BE(info.length,head.length-12);head.writeUInt32BE(info.length,head.length-8);
 return Buffer.concat([head,info,data]);
}

const scenarioRows=()=>[
 ['Command','Arg1','Text','Chinese','Voice'],
 ['','語り手','今から旅に出ます。','旧的译文','voice_001.ogg'],
 ['Jump','*next','// 飛び先の注記','',''],
 ['Selection','*next','一緒に行く','一起去',''],
];

test('Utage scenario patch replaces renamed compiled books after every source row matches, without duplicates',t=>{
 const dir=tmp('utage-patch-');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const rows=scenarioRows(),patch=scenarioRows();patch[1][3]='我们现在出发。';
 put(dir,{
  'Game.exe':'MZ','UnityPlayer.dll':'x',
  'Game_Data/sharedassets0.assets':serializedFile([monoBook('old.book',[['Assets/old.xlsx:Start',rows]])]),
  'Game_Data/StreamingAssets/story/Windows-patch/story.scenarios.asset':scenarioBundle(monoBook('new.book',[['Assets/new.xlsx:Start',patch]])),
 });
 const engine=scenes.ENGINES.utage,list=scenes.read('utage',dir);
 assert.equal(scenes.detect(dir),'utage');
 assert.deepEqual(list.map(s=>s.name),['Start']);
 assert.deepEqual(list[0].lines,['今から旅に出ます。','一緒に行く']);
 assert.deepEqual(list[0].zh,['我们现在出发。','一起去']);
 assert.equal(engine.foreign(dir).get('我们现在出发'),'今から旅に出ます。');
 assert.equal(engine.foreign(dir).has('旧的译文'),false);
 assert.equal(engine.sources(dir).length,2);
 const patchLines=engine.patchLines(list);
 assert.deepEqual(patchLines[0].lines,['我们现在出发。','一起去']);
});

test('Utage patch overlay rejects changed source, speaker, command, headers and ambiguous patch books',()=>{
 const {selectBooks}=scenes.ENGINES.utage._internal;
 const base={name:'base.book',source:'Game_Data/sharedassets0.assets',sheets:[{name:'base.xlsx:Start',rows:scenarioRows()}]};
 const makePatch=()=>({name:'patch.book',source:'Game_Data/StreamingAssets/story/Windows-patch/story.scenarios.asset',sheets:[{name:'patch.xlsx:Start',rows:scenarioRows()}]});
 const edits=[p=>p.sheets[0].rows[1][2]='別の台詞です。',p=>p.sheets[0].rows[1][1]='別の人物',
  p=>p.sheets[0].rows[1][0]='Jump',p=>p.sheets[0].rows[1][4]='other.ogg',
  p=>p.sheets[0].rows[0][3]='English',p=>p.sheets[0].rows.pop()];
 for(const edit of edits){const patch=makePatch();edit(patch);assert.deepEqual(selectBooks([base,patch]),[base]);}
 const first=makePatch(),second=makePatch();second.source=second.source.replace('story.scenarios','other.scenarios');
 assert.deepEqual(selectBooks([base,first,second]),[base]);
 assert.deepEqual(selectBooks([first]),[first]);
});

test('Utage keeps untranslated slots empty after tag removal instead of pairing the next row',t=>{
 const dir=tmp('utage-empty-');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const rows=scenarioRows();rows.splice(2,0,['','','ぎゅっ。','<dash=2>','']);
 put(dir,{'Game_Data/resources.assets':serializedFile([monoBook('story.book',[['story.xlsx:Start',rows]])])});
 const list=scenes.read('utage',dir);
 assert.deepEqual(list[0].lines,['今から旅に出ます。','ぎゅっ。','一緒に行く']);
 assert.deepEqual(list[0].zh,['旧的译文','','一起去']);
 assert.deepEqual(list[0].zhSource,['release','','release']);
});
