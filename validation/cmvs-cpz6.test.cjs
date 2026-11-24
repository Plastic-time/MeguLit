// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* CMVS 3.x CPZ6 (アマツツミ, クロノクロック: cmvs32 3.26): a CPZ6 header with the CPZ6/7 index and entry constants and the
   CPZ5 entry seed subtrahend (cmvs-schemes.json "cpz6"). Synthetic archives written by the fixture encoder, no game text. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const cmvs=require('../services/original-engines/cmvs.cjs'),F={...require('./helpers/engine-fixtures.cjs'),...require('./helpers/engine-fixtures-d.cjs')},scenes=require('../services/original-engines/scenes.cjs');
const JA=['さくら','「おはよう、遅刻するよ」','朝の光が差し込む。'];
const tmp=t=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'cmvs6-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;};

test('CMVS: the cpz6 set carries the cmvs32 3.26 constants and is tried after cpz5',()=>{
 const sc=cmvs.scheme(null,'cpz6');
 assert.equal(sc.factor,0x1A74F195);assert.equal(sc.entrySub,0x5C29E87B);assert.equal(sc.indexSeed,0x2A65CB4F);assert.equal(sc.entryIndexTail,3);assert.equal(sc.entryTail,0xAE);
 assert.deepEqual(cmvs.DEFAULTS.map(s=>s.factor),[0x1A743125,0x1A74F195]);
});

test('CMVS: a 3.x CPZ6 (Chrono md5, cpz6 constants) in data/pack decrypts and reads as text',t=>{
 const game=tmp(t);
 F.writeTree(game,{'cmvs32.exe':'MZ','cmvs.cfg':'','data/pack/script.cpz':F.cpz({'code/sn101.ps3':F.ps2a(JA),'code/sn102.ps3':F.ps2a(['二本目の話。',{push:'bgm01.ogg'}]),'code/start.ps3':F.ps2a([{push:'sn101.ps3'}])},{version:6,variant:'Chrono',set:'cpz6'}),
  'data/pack/se.cpz':F.cpz({'wave/se001.ogg':Buffer.concat([Buffer.from('OggS'),Buffer.alloc(61,7)])},{version:6,variant:'Chrono',set:'cpz6',master:0x0BADF00D})});
 const f=path.join(game,'data/pack/script.cpz'),a=cmvs.open(f);
 assert.equal(a?.variant,'Chrono');assert.equal(a.sc.entrySub,0x5C29E87B);assert.deepEqual(a.entries.map(e=>e.name),['code/sn101.ps3','code/sn102.ps3','code/start.ps3']);
 const se=path.join(game,'data/pack/se.cpz'),o=cmvs.list(se);assert.equal(cmvs.read(se,o[0]).toString('latin1',0,4),'OggS');
 assert.equal(scenes.detect(game),'cmvs');assert.equal(scenes.unsupportedReason(game),null);
 assert.deepEqual(scenes.read('cmvs',game).filter(s=>s.lines.length).map(s=>s.lines),[JA,['二本目の話。']]);
});

test('CMVS: the older GARbro CPZ6 (cpz5 constants) still opens with the cpz5 set',t=>{
 const game=tmp(t);F.writeTree(game,{'script.cpz':F.cpz({'a01.ps3':F.ps2a(JA)},{version:6,variant:'Natsu'})});
 const a=cmvs.open(path.join(game,'script.cpz'));assert.equal(a?.variant,'Natsu');assert.equal(a.sc.factor,0x1A743125);
 assert.deepEqual(cmvs.parse(cmvs.read(path.join(game,'script.cpz'),a.entries[0])).lines,JA);
});

test('CMVS: an adapter pack that sends only md5 variants keeps both default constant sets',t=>{
 const game=tmp(t),f=path.join(game,'script.cpz');F.writeTree(game,{'script.cpz':F.cpz({'a01.ps3':F.ps2a(JA)},{version:6,variant:'Chrono',set:'cpz6'})});
 const md5=require('../services/original-engines/cmvs-schemes.json').md5;
 assert.equal(cmvs.open(f,{md5:{Chrono:md5.Chrono}})?.variant,'Chrono');
});

test('CMVS: a CPZ6 whose master key fits no constant set is still reported as a key problem',t=>{
 const game=tmp(t),c=F.cpz({'a.ps3':F.ps2a(['x'])},{version:6,variant:'Chrono',set:'cpz6'});
 c.writeUInt32LE((c.readUInt32LE(0x30)^0x00010000)>>>0,0x30);
 let sum=0x923A564C;for(let o=0;o<0x3C;o+=4)sum=(sum+c.readUInt32LE(o))>>>0;c.writeUInt32LE(sum,0x3C);
 F.writeTree(game,{'cmvs32.exe':'MZ','script.cpz':c});
 assert.equal(cmvs.list(path.join(game,'script.cpz')),null);assert.equal(scenes.unsupportedReason(game)?.code,'CMVS_CPZ6_KEY');
});

test('CMVS: a damaged text section (no NUL) gives empty pushes, not the rest of the section for each one',()=>{
 const push=at=>{const b=Buffer.alloc(12);Buffer.from([1,2,0x20,1]).copy(b);b.writeUInt32LE(at,4);Buffer.from([0x0F,2,0x30,4]).copy(b,8);return b;};
 const code=Buffer.concat(Array.from({length:200},(_,i)=>push(i*7))),text=Buffer.alloc(0x10000,0x41);
 const d=cmvs.unpackPs2(F.ps2aRaw(code,text)),list=cmvs.pushed(d);
 assert.equal(list.length,200);assert.ok(list.every(s=>s.length===0));
 const ok=Buffer.concat([Buffer.from('abc\0','latin1'),Buffer.alloc(0x3000,0x41)]),one=cmvs.pushed(cmvs.unpackPs2(F.ps2aRaw(push(0),ok)));
 assert.equal(one[0].toString('latin1'),'abc');
});

test('CMVS: RESOURCE keeps path forms as anchors while excluding Japanese dialogue with sentence punctuation or quotes',()=>{
 const long121='あ'.repeat(121)+'.png';
 const ps=F.ps2a([
  {push:'bgm01.ogg'},
  {push:'voice\\n01_001.ogg'},
  {push:'bg\\night_01.pb3'},
  {push:'bg\\Night.png'},
  {push:'script\\next.ps3'},
  '立ち絵\\normal.pb3',
  {push:'se01.ogg,1'},
  {push:'bgm01.ogg 100'},
  'cg/学園・夜.png',
  '立ち絵/主人公（私服）.pb3',
  'bg/テスト～1.bmp',
  {push:'C:\\data\\bgm01.ogg'},
  {push:'a.ogg,b.ogg'},
  {push:'ev01.pb3|ev02.pb3'},
  {push:'  cg/space.png  '},
  long121,
  '「photo.pngを見せて」',
  '音声はse01.oggに入っている。',
  'お姉ちゃんの写真、photo.png',
  'これ見て！写真.png',
  '本当に？bg01.png',
  '……BGMはtrack01.ogg',
  '『bgm01.ogg』',
 ]);
 const r=cmvs.parse(ps);
 assert.deepEqual(r.anchors,[
  'bgm01.ogg',
  'voice\\n01_001.ogg',
  'bg\\night_01.pb3',
  'bg\\Night.png',
  'script\\next.ps3',
  '立ち絵\normal.pb3',
  'se01.ogg,1',
  'bgm01.ogg 100',
  'cg/学園・夜.png',
  '立ち絵/主人公（私服）.pb3',
  'bg/テスト～1.bmp',
  'C:\\data\\bgm01.ogg',
  'a.ogg,b.ogg',
  'ev01.pb3|ev02.pb3',
  '  cg/space.png  ',
  long121,
 ]);
 assert.deepEqual(r.lines,[
  '「photo.pngを見せて」',
  '音声はse01.oggに入っている。',
  'お姉ちゃんの写真、photo.png',
  'これ見て！写真.png',
  '本当に？bg01.png',
  '……BGMはtrack01.ogg',
  '『bgm01.ogg』',
 ]);
});
