// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-16 probes #214 (Narcissu: 0.utf), #255 (Umineko: ONS2 *.file), #173/#174/#197 (月姬 Chinese builds read as
   "not Japanese"). ONS2 = onscripter-ru release script: 16-byte header + zlib, two table-substitution passes. */
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const ns=require('../services/original-engines/nscripter.cjs');
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'nsu-'));
const JA='*define\ngame\n*start\n　医者は僕に聞こえないように、声をひそめて看護婦に話している。\\n「シエル先生の授業」？@\n*s1\n　外はいい天気で、涼しい風が夏の終わりを告げていた。\\n';
/* inverse of the engine's two passes, built from the table the engine uses (T is a permutation) */
function ons2Encode(text){const T=ns._internal.ons2.T,inv=new Uint8Array(256);for(let i=0;i<256;i++)inv[T[i]]=i;
 const d=Buffer.from(text,'utf8');for(let i=0;i<d.length;i++)d[i]=inv[d[i]^0x71]^0x45;
 const z=zlib.deflateSync(d);for(let i=0;i<z.length;i++)z[i]=inv[z[i]^0x23]^0x86;
 const h=Buffer.alloc(16);h.writeUInt32LE(0x32534E4F,0);h.writeUInt32LE(z.length,4);h.writeUInt32LE(d.length,8);h.writeUInt32LE(110,12);return Buffer.concat([h,z]);}
const kana=lines=>lines.filter(l=>/[ぁ-ゖァ-ヺ]/.test(l)).length;
function read(dir){const text=ns._internal.scriptText(dir);return ns.parse(Buffer.from(text));}
test('0.utf (ponscripter / Narcissu) is read as UTF-8 Japanese',()=>{const d=tmp();fs.writeFileSync(path.join(d,'0.utf'),Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(JA.repeat(3))]));
 assert.ok(kana(read(d).lines)>=4);assert.strictEqual(ns.codepage(d),'utf-8');});
test('pscript.dat is UTF-8 under XOR 0x84',()=>{const d=tmp();const b=Buffer.from(JA);for(let i=0;i<b.length;i++)b[i]^=0x84;fs.writeFileSync(path.join(d,'pscript.dat'),b);assert.ok(kana(read(d).lines)>=2);});
test('ONS2 *.file (onscripter-ru) is decoded; default.file wins over ru.file',()=>{const d=tmp();
 fs.writeFileSync(path.join(d,'ru.file'),ons2Encode(JA.replace(/医者は/g,'врач ').replace(/[ぁ-ゖァ-ヺ]/g,'')));fs.writeFileSync(path.join(d,'default.file'),ons2Encode(JA));
 assert.ok(path.basename(ns.sources(d)[0])==='default.file');assert.ok(kana(read(d).lines)>=2);});
test('a Chinese NScripter build is reported chinese-build, not not-japanese',()=>{const {classify}=require('../services/adapter-probe-core.cjs');
 const r=classify({engines:[{id:'nscripter',lines:1000,japaneseLines:29,chineseLines:900}],inventory:{archives:[]}});assert.strictEqual(r.step,'chinese-build');
 assert.strictEqual(classify({engines:[{id:'x',lines:1000,japaneseLines:29,chineseLines:0}],inventory:{archives:[]}}).step,'not-japanese');});

test('ONScripter backtick-prefixed text lines and case-insensitive/indented *define/*start labels are read',t=>{
 const scenes=require('../services/original-engines/scenes.cjs');
 const dir=tmp();
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const script=[
  '  *DEFINE',
  '  game',
  '\t*START',
  '*s1',
  'bg black,1',
  '; ; comment',
  '!w500',
  '#ffffffbg black,1',
  '``',
  '`@',
  '`/',
  '`2000年10月4日。@',
  '`Hello world!@',
  '`2000`年`10`月`4`日。@',
  '!w500`待って！`@',
  '#ffffff`Color text`\\',
  '`Part 1`@`Part 2`\\',
  '`No newline`/',
  'おはよう。@`Hello!`\\',
  '「`」だよ。@',
  '普通の台詞。\\',
 ].join('\r\n');
 fs.writeFileSync(path.join(dir,'0.utf'),Buffer.from(script,'utf8'));
 const list=scenes.read('nscripter',dir);
 const s1=list.find(s=>s.name==='*s1');
 assert.ok(s1,'*s1 block should be read despite uppercase/indented *DEFINE/*START');
 assert.deepStrictEqual(s1.lines,[
  '2000年10月4日。',
  'Hello world!',
  '2000年10月4日。',
  '待って！',
  'Color text',
  'Part 1',
  'Part 2',
  'No newline',
  'おはよう。',
  'Hello!',
  '「`」だよ。',
  '普通の台詞。',
 ]);
 assert.deepStrictEqual(s1.anchors,['*s1']);

 // Commented or prefix-only *defined/*started must still be rejected
 for(const bad of ['; *define\n; *start\n普通の台詞。\\\n','*defined\n*start\n普通の台詞。\\\n','*define\n*started\n普通の台詞。\\\n']){
  const d2=tmp();t.after(()=>fs.rmSync(d2,{recursive:true,force:true}));
  fs.writeFileSync(path.join(d2,'0.txt'),Buffer.from(bad,'utf8'));
  assert.deepStrictEqual(scenes.read('nscripter',d2),[]);
 }
});
