// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const scenes=require('../services/original-engines/scenes.cjs');
const {probeGame}=require('../services/adapter-probe-core.cjs');

function u32(n){const out=Buffer.alloc(4);out.writeUInt32LE(n);return out;}
function aligned(b){return Buffer.concat([b,Buffer.alloc((4-b.length%4)%4)]);}
function str(s){const b=Buffer.from(s);return Buffer.concat([u32(b.length),aligned(b)]);}
function strings(a){return Buffer.concat([u32(a.length),...a.map(str)]);}

// A little-endian Unity 2017 SerializedFile with consecutive object path IDs.
function asset(type,object,external='globalgamemanagers.assets'){
 const objects=Array.isArray(object)?object:[object];
 const types=[Buffer.from('2017.4.0f1\0'),u32(19),Buffer.from([0]),u32(1),u32(type),Buffer.from([0,255,255]),
  Buffer.alloc(type===114?32:16),u32(objects.length)];
 const table=aligned(Buffer.concat([Buffer.alloc(20),...types]));
 let offset=0;
 const entries=objects.map((b,i)=>{
  const entry=Buffer.alloc(20);entry.writeBigInt64LE(BigInt(i+1));entry.writeUInt32LE(offset,8);
  entry.writeUInt32LE(b.length,12);offset+=b.length;return entry;
 });
 const refs=type===114?Buffer.concat([u32(0),u32(1),Buffer.alloc(21),Buffer.from(external+'\0')]):Buffer.alloc(8);
 const meta=aligned(Buffer.concat([table,...entries,refs])),at=meta.length,full=Buffer.concat([meta,...objects]);
 full.writeUInt32BE(at-20,0);full.writeUInt32BE(full.length,4);full.writeUInt32BE(17,8);full.writeUInt32BE(at,12);
 return full;
}
const sourceScript=(ns='I2.Loc')=>asset(115,Buffer.concat([str('LanguageSource'),Buffer.alloc(20),str('LanguageSource'),str(ns),str('Assembly-CSharp.dll'),Buffer.from([0])]));
function term(key,type,values){
 return Buffer.concat([str(key),u32(type),str(''),strings(values),strings(values.map(()=>'')),
  u32(values.length),aligned(Buffer.alloc(values.length))]);
}
function source(codes,terms){
 const header=Buffer.alloc(28);header.writeInt32LE(1,16);header.writeBigInt64LE(1n,20);
 return Buffer.concat([header,str(''),str(''),str(''),str(''),str(''),Buffer.alloc(8),u32(terms.length),...terms,
  u32(codes.length),...codes.flatMap(code=>[str('Language'),str(code),u32(0)])]);
}
function install(t,raw,script=sourceScript(),external){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'i2-source-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(path.join(dir,'Game.exe'),'MZ');fs.writeFileSync(path.join(dir,'UnityPlayer.dll'),'');
 const d=path.join(dir,'Game_Data');fs.mkdirSync(d);
 fs.writeFileSync(path.join(d,'globalgamemanagers.assets'),script);
 fs.writeFileSync(path.join(d,'resources.assets'),asset(114,raw,external));
 return dir;
}

test('I2 uses locale codes and pairs translations by term, omitting non-text and empty Japanese entries',t=>{
 const codes=['zh-Hant-TW','ja-JP','zh-Hans-CN','en'];
 const terms=Array.from({length:35},(_,i)=>term('chapter/'+i,0,['繁體','今日はいい天気です。'+i,'简体'+i,'Fine.']));
 terms.push(term('untranslated',0,['繁體','','翻译','English']),term('image',3,['图片','画像.png','图片','image']));
 const dir=install(t,source(codes,terms));
 assert.equal(scenes.detect(dir),'unity-assets');
 const rows=scenes.read('unity-assets',dir);
 assert.deepEqual(rows.flatMap(s=>s.lines),terms.slice(0,35).map((_,i)=>'今日はいい天気です。'+i));
 assert.deepEqual(rows.flatMap(s=>s.zh),terms.slice(0,35).map((_,i)=>'简体'+i));
 const result=probeGame({dir,executable:'Game.exe',title:'Demo'});
 assert.equal(result.step,'ok');assert.equal(result.detail,'unity-assets');assert.equal(result.japaneseLines,35);
});
test('I2 validates the source class, term widths, language table and term boundaries',t=>{
 const plain=scenes.ENGINES['unity-assets'].parse(Buffer.from('\u0001I2\n普通の台詞です。'));
 assert.deepEqual(plain.lines,['普通の台詞です。']);
 const valid=source(['ja','zh-TW'],[term('a',0,['日本語。','繁體文字'])]);
 for(const [raw,script,external] of [[valid,sourceScript('Other')],[valid,sourceScript(),'other.assets'],[valid.subarray(0,valid.length-3)],
  [source(['ja'],[term('a',0,['日本語','多出来的一列'])])],[source(['en'],[term('a',0,['English'])])]]){
  assert.equal(scenes.read('unity-assets',install(t,raw,script,external)).some(s=>s.name.startsWith('I2-LanguageSource-')),false);
 }
 const dir=install(t,valid);assert.deepEqual(scenes.read('unity-assets',dir)[0].zh,['繁體文字']);
});

test('an I2 menu coexists with a separate story and cannot supply its missing Japanese',t=>{
 const original=require('../services/original-text.cjs');
 for(const japanese of [true,false]){
  const menu=Array.from({length:35},(_,i)=>term('menu/'+i,0,['設定項目です。'+i,'设置'+i]));
  const dir=install(t,source(['ja','zh'],menu)),folder=path.join(dir,'Game_Data','StreamingAssets');
  fs.mkdirSync(folder);
  const lines=Array.from({length:120},(_,i)=>(japanese?'独立した物語です。':'这是一段独立的中文对白。')+i);
  fs.writeFileSync(path.join(folder,'story.json'),JSON.stringify(lines.map(text=>({Command:'Say',arg1:text}))));
  const rows=scenes.read('unity-assets',dir);
  assert.deepEqual(rows.find(s=>s.name==='story').lines,lines);
  const patched=scenes.ENGINES['unity-assets'].patchLines(rows);
  assert.deepEqual(patched.find(s=>s.name==='story').lines,lines);
  assert.equal(patched.find(s=>s.name.startsWith('I2-')).lines[0],'设置0');
  const state=original.scanRunning(dir,'sample',path.join(dir,'Game.exe'),{noBackup:true});
  assert.equal(state.runtime.lines,155);
  if(japanese)assert.equal(state.status,'native-japanese');
  else assert.ok(!state.original?.index);
 }
});

test('I2 keeps other MonoBehaviours and indexes only supported original text',t=>{
 const table=source(['zh-CN','ja'],[term('story',0,['今天出发。','今日出かけます。']),term('second',0,['明天再见。','また明日。'])]);
 const labels=Array.from({length:100},()=>str('图像资源'));
 const dir=install(t,[table,Buffer.concat([Buffer.alloc(32),...labels,str('別の台詞です。')])]);
 const engine=scenes.ENGINES['unity-assets'],rows=scenes.read(engine.id,dir);
 const mono=rows.find(s=>s.name.endsWith('#mono'));
 assert.equal(mono.lines.length,101);assert.ok(mono.lines.includes('別の台詞です。'));
 const aligned=engine.originalLines(dir);
 assert.equal(aligned.length,103);assert.deepEqual(aligned.filter(Boolean).sort(),['今日出かけます。','また明日。','別の台詞です。'].sort());
 const state=require('../services/original-text.cjs').scanRunning(dir,'sample',path.join(dir,'Game.exe'),{noBackup:true});
 assert.equal(state.status,'ready');assert.equal(state.original.auto,true);
});

test('an I2 object leaves a single sibling line intact and cannot replace an independent Chinese MonoBehaviour story',t=>{
 const menu=source(['ja','zh'],Array.from({length:35},(_,i)=>term('ui/'+i,0,['設定の説明です。'+i,'设置'+i])));
 const one=install(t,[menu,Buffer.concat([Buffer.alloc(32),str('旅はここから始まりますよ。')])]);
 assert.deepEqual(scenes.read('unity-assets',one).find(s=>s.name.endsWith('#mono')).lines,['旅はここから始まりますよ。']);
 const story=Array.from({length:120},(_,i)=>str('这是一段独立的中文对白'+i+(i<14?'。':'')));
 const mixed=install(t,[menu,Buffer.concat([Buffer.alloc(32),...story])]);
 assert.equal(scenes.ENGINES['unity-assets'].originalLines(mixed),null);
 assert.equal(probeGame({dir:mixed,executable:'Game.exe'}).step,'chinese-build');
});

function catArchive(dir,entries,pack='data_01.dat'){
 const folder=path.join(dir,'CatSystem');fs.mkdirSync(folder,{recursive:true});
 const names=Object.keys(entries);
 const buf=require('./helpers/engine-fixtures.cjs').zip(Object.fromEntries(names.map(n=>[n,'fixture'])),{flagged:names.filter(n=>entries[n])});
 fs.writeFileSync(path.join(folder,pack),buf);
}
function monoScript(name,ns){return Buffer.concat([str(name),Buffer.alloc(20),str(name),str(ns),str('Game.dll')]);}
function component(text,id){const h=Buffer.alloc(32);h.writeInt32LE(1,16);h.writeBigInt64LE(BigInt(id),20);return Buffer.concat([h,...text.map(str)]);}

test('protected CatSystem scenes are reported without treating Unity UI or font strings as the original',t=>{
 const scripts=asset(115,[monoScript('Text','UnityEngine.UI'),monoScript('TMP_FontAsset','TMPro'),monoScript('TextMeshProUGUI','TMPro'),monoScript('Text','Game')]);
 const ui=['最初から始めます。','続きから読みます。'];
 const dir=install(t,[component(ui,1),component(ui,2),component(ui,3)],scripts),d=path.join(dir,'Game_Data');
 fs.writeFileSync(path.join(d,'sharedassets1.assets'),asset(49,Buffer.concat([str('LineBreaking Following Characters'),str('〕〉》ぁぃぅぇぉっゃゅょ')])));
 catArchive(dir,{'fes/menu.cstx':true,'voice/a.ogg':true});
 assert.equal(scenes.ENGINES['unity-assets'].unsupported?.(dir)||'','');
 assert.equal(scenes.read('unity-assets',dir).flatMap(s=>s.lines).length,7);
 catArchive(dir,{'scene/first.cstx':true},'data_02.dat');
 const probe=()=>probeGame({dir,executable:'Game.exe'});
 assert.equal(probe().step,'decrypt-failed');
 assert.equal(probe().detail,'unity-assets:CATSYSTEM_CSTX_ENCRYPTED');
 assert.equal(scenes.read('unity-assets',dir).length,0);
 // A different script with the same class name and a reference to a different file both survive.
 fs.writeFileSync(path.join(d,'level0'),asset(114,[component(ui,1),component(['ここが物語の始まりです。'],4)]));
 fs.writeFileSync(path.join(d,'level1'),asset(114,component(['別の台詞です。','また明日。'],1),'other.assets'));
 assert.deepEqual(scenes.read('unity-assets',dir).flatMap(s=>s.lines).sort(),['ここが物語の始まりです。','別の台詞です。','また明日。'].sort());
 assert.equal(probe().step,'ok');
 catArchive(dir,{'scene/a-longer-plaintext-entry.cstx':false},'data_03.dat');
 assert.equal(scenes.ENGINES['unity-assets'].unsupported(dir),'');
 assert.equal(scenes.read('unity-assets',dir).flatMap(s=>s.lines).length,12);
});

test('a protected scene does not promote a lone untyped menu label or require script metadata to recognize line breaking',t=>{
 const dir=install(t,component(['セーブデータ選択'],1),asset(115,monoScript('OptionsPanel','Game')));
 const d=path.join(dir,'Game_Data');
 fs.writeFileSync(path.join(d,'sharedassets1.assets'),asset(49,Buffer.concat([str('LineBreaking Leading Characters'),str('「『【ちいさい')])));
 catArchive(dir,{'scene/story.cstx':true});
 assert.equal(probeGame({dir,executable:'Game.exe'}).step,'decrypt-failed');
 fs.unlinkSync(path.join(d,'globalgamemanagers.assets'));
 assert.equal(probeGame({dir,executable:'Game.exe'}).step,'decrypt-failed');
});

test('a separate I2 source remains readable alongside a protected CatSystem story',t=>{
 const dir=install(t,source(['ja','zh'],[term('line',0,['真夏の物語です。','盛夏的故事。'])]));
 catArchive(dir,{'scene/first.cstx':true});
 const rows=scenes.read('unity-assets',dir);
 assert.deepEqual(rows.flatMap(v=>v.lines),['真夏の物語です。']);
 assert.deepEqual(rows.flatMap(v=>v.zh),['盛夏的故事。']);
});

test('incomplete ZIP directories do not establish that every scene is protected',t=>{
 const dir=install(t,component(['最初から始めます。','続きから読みます。'],1),asset(115,monoScript('Text','UnityEngine.UI')));
 catArchive(dir,{'scene/chapter.cstx':true,'scene/plain.cstx':false});
 const file=path.join(dir,'CatSystem','data_01.dat'),bytes=fs.readFileSync(file),end=bytes.length-22;
 const central=bytes.readUInt32LE(end+16);
 bytes.writeUInt32LE(0,central+46+bytes.readUInt16LE(central+28));
 fs.writeFileSync(file,bytes);
 assert.equal(scenes.ENGINES['unity-assets'].unsupported(dir),'');
 assert.equal(scenes.read('unity-assets',dir).flatMap(s=>s.lines).length,2);
 bytes.writeUInt32LE(16<<20,end+12);fs.writeFileSync(file,bytes);
 assert.equal(scenes.ENGINES['unity-assets'].unsupported(dir),'');
});

test('installing CatSystem scenes invalidates the saved Unity original index',t=>{
 const dir=install(t,component(['最初から始めます。','続きから読みます。'],1),asset(115,monoScript('Text','UnityEngine.UI')));
 const folder=path.join(dir,'Game_Data','StreamingAssets');fs.mkdirSync(folder);
 fs.writeFileSync(path.join(folder,'story.json'),JSON.stringify([{text:'ある日の物語です。'}]));
 const scan=()=>require('../services/original-text.cjs').scanRunning(dir,'sample',path.join(dir,'Game.exe'),{noBackup:true});
 assert.equal(scan().runtime.lines,3);
 catArchive(dir,{'scene/first.cstx':true});
 assert.equal(scan().runtime.lines,1);
});
