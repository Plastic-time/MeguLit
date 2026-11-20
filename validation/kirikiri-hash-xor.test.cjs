// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const xp3=require('../services/original-engines/xp3.cjs'),cx=require('../services/original-engines/cx-filter.cjs'),scenes=require('../services/original-engines/scenes.cjs'),kit=require('../services/original-engines/kit.cjs');
const {probeGame}=require('../services/adapter-probe-core.cjs'),F=require('./helpers/engine-fixtures.cjs');

const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;};
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const u16=n=>{const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;};
const chunk=(tag,body)=>Buffer.concat([Buffer.from(tag,'latin1'),u64(body.length),body]);

function writeEncryptedXp3(file,entries){
 const datas=[],index=[];let at=11+8;
 for(const [name,data,hash] of entries){
  const n=Buffer.from(name,'utf16le');
  index.push(chunk('File',Buffer.concat([
   chunk('info',Buffer.concat([u32(0x80000000),u64(data.length),u64(data.length),u16(name.length),n])),
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
 writeEncryptedXp3(path.join(dir,'scenario.xp3'),[['s01.ks',xorHash(ks1,0x598e857b,k),0x598e857b],['s02.ks',xorHash(ks2,0x5f0376c6,k),0x5f0376c6]]);
 writeEncryptedXp3(path.join(dir,'data.xp3'),[['a.png',xorHash(png,0x352a231b,k),0x352a231b],['b.ogg',xorHash(ogg,0x13b3919b,k),0x13b3919b]]);
 writeEncryptedXp3(path.join(dir,'img.xp3'),[['c.jpg',xorHash(jpg,0x12345678,k),0x12345678],['d.jpg',xorHash(jpg,0x87654321,k),0x87654321]]);

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
 writeEncryptedXp3(path.join(dir,'scenario.xp3'),[['s01.ks',rnd(512),0x11223344],['s02.ks',rnd(512),0x55667788]]);
 assert.equal(cx.forArchive(path.join(dir,'scenario.xp3')),null);
 const p=probeGame({dir,title:'不明'});
 assert.equal(p.step,'decrypt-failed');
});

test('plain-flagged or unencrypted XP3 archives return null from forArchive',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-hxor-plain-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const bomKs=Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('*s01\r\n[cm]\r\n「あいうえお」[l][r]\r\n','utf16le')]);
 writeEncryptedXp3(path.join(dir,'plain-flagged.xp3'),[['a.ks',bomKs,0x11111111],['b.ks',bomKs,0x22222222]]);
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

/* 2026-11-20 #472 #417 #415 #404 #411: 45 KiB plug-in (kinglove / hutamata / koirowa / koikari.tpm), key = adlr hash as a
   31-bit ring, byte at offset o XOR key[o % 31]. The adlr hash is the Adler-32 of the plain file. */
const adler=b=>{let a=1,c=0;for(const x of b){a=(a+x)%65521;c=(c+a)%65521;}return ((c<<16)|a)>>>0;};
test('rot31 hash-keyed XP3 archives are found by content and decrypt to scenes',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-rot31-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const ks1=F.sjis('; ==============================\r\n*s01|テスト\r\n[cm]\r\n「おはようございます、ご主人様」[l][r]\r\n　空が青い。[p]\r\n');
 const ks2=F.sjis('; ==============================\r\n*s02|次\r\n@wait time=100\r\n「こんにちは」[l][r]\r\n　風が吹く。[p]\r\n');
 const tjs=Buffer.from('// k2compat\r\nclass A { function f() { return 1; } }\r\n','latin1');
 const enc=b=>{const h=adler(b);return [cx.rot31(h,0,Buffer.from(b)),h];};
 const key=cx.rot31Key(0x2a97766c);assert.equal(key.length,31);assert.equal(key.subarray(0,3).toString('hex'),'6c7697');
 writeEncryptedXp3(path.join(dir,'data.xp3'),[['scenario/s01.ks',...enc(ks1)],['scenario/s02.ks',...enc(ks2)],['k2compat/a.tjs',...enc(tjs)]]);
 const f=cx.forArchive(path.join(dir,'data.xp3'));
 assert.ok(f,'filter found');assert.deepEqual(f.titles,['rot31']);
 /* offset-aware: decrypting a tail slice matches the whole-file result */
 const [c1,h1]=enc(ks1),tail=Buffer.from(c1.subarray(40));f(h1,40,tail);assert.deepEqual(tail,ks1.subarray(40));
 const read=scenes.read('kirikiri',dir);
 assert.deepEqual(read.map(s=>s.lines),[['「おはようございます、ご主人様」','空が青い。'],['「こんにちは」','風が吹く。']]);
 assert.equal(probeGame({dir,title:'テスト'}).step,'ok');
});
