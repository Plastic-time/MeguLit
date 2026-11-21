// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const xp3=require('../services/original-engines/xp3.cjs'),cx=require('../services/original-engines/cx-filter.cjs'),scenes=require('../services/original-engines/scenes.cjs'),kit=require('../services/original-engines/kit.cjs');
const {probeGame}=require('../services/adapter-probe-core.cjs'),F=require('./helpers/engine-fixtures.cjs');

const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;};
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const u16=n=>{const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;};
const chunk=(tag,body)=>Buffer.concat([Buffer.from(tag,'latin1'),u64(body.length),body]);

function writeXp3(file,entries,protectedFlag=true){
 const datas=[],index=[];let at=11+8;
 for(const [name,data,hash] of entries){
  const n=Buffer.from(name,'utf16le');
  index.push(chunk('File',Buffer.concat([
   chunk('info',Buffer.concat([u32(protectedFlag?0x80000000:0),u64(data.length),u64(data.length),u16(name.length),n])),
   chunk('segm',Buffer.concat([u32(0),u64(at),u64(data.length),u64(data.length)])),
   chunk('adlr',u32(hash)),
  ])));
  datas.push(data);at+=data.length;
 }
 const idx=Buffer.concat(index);
 fs.writeFileSync(file,Buffer.concat([xp3.MAGIC,u64(at),...datas,Buffer.from([0]),u64(idx.length),idx]));
}
const xorHash=(buf,hash,k)=>{const x=((hash>>>0)^k)&0xff,out=Buffer.from(buf);for(let i=0;i<out.length;i++)out[i]^=x;return out;};

test('hash^k XP3 archives with scripts and media decrypt cleanly',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-hxor-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const k=0x4b;
 const ks1=F.sjis('*s01|テスト\r\n[cm]\r\n「おはようございます」[l][r]\r\n　空が青い。[p]\r\n');
 const ks2=F.sjis('*s02|次\r\n@wait time=100\r\n「こんにちは」[l][r]\r\n　風が吹く。[p]\r\n');
 const png=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.alloc(24,0)]);
 const ogg=Buffer.concat([Buffer.from('OggS','latin1'),Buffer.alloc(28,0)]);
 const jpg=Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10]),Buffer.from('JFIF\0','latin1'),Buffer.alloc(16,0)]);
 writeXp3(path.join(dir,'scenario.xp3'),[['s01.ks',xorHash(ks1,0x598e857b,k),0x598e857b],['s02.ks',xorHash(ks2,0x5f0376c6,k),0x5f0376c6]]);
 writeXp3(path.join(dir,'data.xp3'),[['a.png',xorHash(png,0x352a231b,k),0x352a231b],['b.ogg',xorHash(ogg,0x13b3919b,k),0x13b3919b]]);
 writeXp3(path.join(dir,'img.xp3'),[['c.jpg',xorHash(jpg,0x12345678,k),0x12345678],['d.jpg',xorHash(jpg,0x87654321,k),0x87654321]]);

 assert.ok(cx.forArchive(path.join(dir,'data.xp3')),'media archive filter found');
 assert.ok(cx.forArchive(path.join(dir,'img.xp3')),'jpeg archive filter found');
 assert.ok(cx.forArchive(path.join(dir,'scenario.xp3')),'script-only archive filter found');
 assert.equal(scenes.detect(dir),'kirikiri');
 const read=scenes.read('kirikiri',dir);
 assert.deepEqual(read.map(s=>s.lines),[['「おはようございます」','空が青い。'],['「こんにちは」','風が吹く。']]);
 const p=probeGame({dir,title:'テスト'});
 assert.equal(p.step,'ok');
 assert.equal(p.detected,'kirikiri');
 assert.equal(p.japaneseLines,4);
});

test('unknown random encryption is never mistaken for hash^k',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-hxor-bad-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const rnd=require('node:crypto').randomBytes;
 writeXp3(path.join(dir,'scenario.xp3'),[['s01.ks',rnd(512),0x11223344],['s02.ks',rnd(512),0x55667788]]);
 assert.equal(cx.forArchive(path.join(dir,'scenario.xp3')),null);
 const p=probeGame({dir,title:'不明'});
 assert.equal(p.step,'decrypt-failed');
});

test('plain-flagged or unencrypted XP3 archives return null from forArchive',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-hxor-plain-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const bomKs=Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('*s01\r\n[cm]\r\n「あいうえお」[l][r]\r\n','utf16le')]);
 writeXp3(path.join(dir,'plain-flagged.xp3'),[['a.ks',bomKs,0x11111111],['b.ks',bomKs,0x22222222]]);
 assert.equal(cx.forArchive(path.join(dir,'plain-flagged.xp3')),null);
 const ks=F.sjis('*s01|テスト\r\n[cm]\r\n「あいうえお」[l][r]\r\n');
 const plainIdx=Buffer.concat([chunk('File',Buffer.concat([chunk('info',Buffer.concat([u32(0),u64(ks.length),u64(ks.length),u16(4),Buffer.from('a.ks','utf16le')])),chunk('segm',Buffer.concat([u32(0),u64(19),u64(ks.length),u64(ks.length)])),chunk('adlr',u32(0))]))]);
 fs.writeFileSync(path.join(dir,'unenc.xp3'),Buffer.concat([xp3.MAGIC,u64(19+ks.length),ks,Buffer.from([0]),u64(plainIdx.length),plainIdx]));
 assert.equal(cx.forArchive(path.join(dir,'unenc.xp3')),null);
});

test('codepage keeps Shift-JIS when full-width kana far outnumber half-width middle dots',()=>{
 const sj=Buffer.concat([F.sjis('「それは、'),Buffer.from([0xa5,0xa5,0xa5,0xa5,0xa5,0xa5]),F.sjis('やはり忘れていたということだ。もう一度最初から思い出してみよう。」')]);
 assert.equal(kit.codepage(sj),'shift_jis');
 assert.equal(kit.codepage(F.gbk('这是中文汉化脚本，里面没有日文假名，只有汉字和标点符号。')),'gbk');
});

test('the probe reads plain XP3 scenarios with nonzero Adler-32 low bytes',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-plain-kag-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const intro=F.sjis('*start\r\n[cm]\r\n「朝は涼しいね。」[p]\r\n');
 const route=Buffer.from('*room\r\n「空がきれい。」[p]\r\n');
 // Adler-32 values from zlib over the bytes stored in the archive.
 writeXp3(path.join(dir,'data.xp3'),[
  ['intro.ks',intro,0x1b440f88],['route.ks',route,0x61b81306],
  ['invalid.ks',intro,0x1b450f88],
  ['control.ks',Buffer.from('*label\n[x]\n\x01'+'q'.repeat(37)),0xce9d13c5],
  ['unrelated.ks',Buffer.from('123456789abcdef\n'.repeat(6)),0xbc661969],
  // This legacy UTF-16 script starts with the ASCII bytes "@A" as stored.
  ['legacy.ks',Buffer.from('4041b38fcee3d08ff28f338ffb8fbe40b28fe4bfcfbfe2bfb2bfb5bf','hex'),0xfdbd1297],
 ],false);
 assert.deepEqual(scenes.read('kirikiri',dir).map(s=>[s.name,s.lines]),[
  ['control.ks',[]],['intro.ks',['「朝は涼しいね。」']],['invalid.ks',[]],['legacy.ks',['「山はきれい！」']],['route.ks',['「空がきれい。」']],['unrelated.ks',[]],
 ]);
 const probe=probeGame({dir,title:'テスト'});
 assert.deepEqual([probe.step,probe.lines,probe.japaneseLines],['ok',3,3]);
});

test('the probe reads unflagged XP3 scripts masked with their own Adler-32 low byte',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-adlr-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const intro=F.sjis('*start\r\n[cm]\r\n「おはようございます」[p]\r\n');
 const route=F.sjis('「また会おう。」[p]');
 const zero=F.sjis('*start\r\n[cm]\r\n「今日は晴れです」[p]\r\n;'+'A'.repeat(84));
 const binary=Buffer.from(Array.from({length:128},(_,i)=>i));
 // Python zlib.adler32 over the original CP932 bytes.
 writeXp3(path.join(dir,'data.xp3'),[
  ['intro.ks',xorHash(intro,0x6ba01267,0),0x6ba01267],
  ['route.ks',xorHash(route,0x6df50a3e,0),0x6df50a3e],
  ['zero.ks',zero,0x39792600],
  ['short.ks',F.sjis('「外はいい天気。」[p]'),0x741e0a00],
  // A different one-byte mask hides a UTF-16 BOM. Its checksum covers the stored bytes.
  ['utf16.ks',xorHash(Buffer.from('\ufeff「山はきれい！」[p]','utf16le'),0,0xd4),0xbd951000],
  ['bad.ks',xorHash(intro,0x6ba01267,0),0x6ba11267],
  ['binary.ks',Buffer.concat([Buffer.from([255]),Buffer.alloc(64)]),0x41000100],
  ['header.ks',Buffer.concat([Buffer.from('*'+'A'.repeat(512)+'\r\n'),binary,Buffer.from([254])]),0xc0bba300],
  ['invalid.ks',F.sjis('「外はいい天気。」[p]'),0x741f0a00],
  ['masked.ks',xorHash(binary,0x560b1fc1,0),0x560b1fc1],
  // Both the original and the mask yield the same Adler-32. Keep the existing binary rejection.
  ['collision.ks',Buffer.alloc(512).fill(Buffer.from([0,1,1,0])),0x028f0101],
 ],false);
 assert.deepEqual(scenes.read('kirikiri',dir).map(s=>[s.name,s.lines]),[
  ['bad.ks',[]],['binary.ks',[]],['collision.ks',[]],['header.ks',[]],['intro.ks',['「おはようございます」']],
  ['invalid.ks',[]],['masked.ks',[]],['route.ks',['「また会おう。」']],
  ['short.ks',['「外はいい天気。」']],['utf16.ks',['「山はきれい！」']],['zero.ks',['「今日は晴れです」']],
 ]);
 const p=probeGame({dir,title:'テスト'});
 assert.deepEqual([p.step,p.detected,p.lines,p.japaneseLines],['ok','kirikiri',5,5]);
});
