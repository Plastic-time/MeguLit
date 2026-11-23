// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-19 (runtime-harvest live stand-in, one full run in many: 「ブビビ」 read back out of a desensitized 1 MB
   sample). The privacy check decodes every sample as Shift-JIS, UTF-8, UTF-16LE, GBK and EUC-JP and flags three kana
   in a row; desensitize replaced only runs of four or more outside the primary encoding and paired double-byte text
   from offset 0 only. Every encoding and both byte parities are covered now. */
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const d=require('../services/desensitize.cjs');
const PLACE=new Set([...'あア亜Ａ０□가ｱĀ啊']);
/* the independent reader of the privacy tests, at both byte parities */
function kanaRuns(buf){const found=[];for(const b of [buf,buf.subarray(1)])for(const enc of ['shift_jis','utf-8','utf-16le','gbk','euc-jp']){
 const s=new TextDecoder(enc).decode(b);for(const r of s.match(/[ぁ-ゖァ-ヺ]{3,}/g)||[])if([...r].some(ch=>!PLACE.has(ch)))found.push(enc+':'+r);}return found;}
const sjis=s=>Buffer.from([...s].flatMap(ch=>({ブ:[0x83,0x75],ビ:[0x83,0x72],な:[0x82,0xc8],ま:[0x82,0xdc]})[ch]));
const euc=s=>Buffer.from([...s].flatMap(ch=>({ブ:[0xa5,0xd6],ビ:[0xa5,0xd3],な:[0xa4,0xca],ま:[0xa4,0xde]})[ch]));
const forms={'utf-16le':s=>Buffer.from(s,'utf16le'),'utf-8':s=>Buffer.from(s,'utf8'),sjis,euc};
/* binary noise that itself decodes to no kana run */
function noise(n,seed){const b=Buffer.alloc(n);let x=seed;for(let i=0;i<n;i++){x=(x*1103515245+12345)>>>0;b[i]=(x>>>16)&0x3f;}return b;}

test('three kana in a row in any encoding, at either byte parity, never survive desensitizing',()=>{
 for(const [name,enc] of Object.entries(forms))for(const word of ['ブビビ','なまなま'])for(const pad of [0,1,2,3]){
  const buf=Buffer.concat([noise(64+pad,7),enc(word),noise(64,9)]);assert.ok(kanaRuns(buf).length>0,'the fixture is readable: '+name+' '+word);
  const out=d.desensitize(buf).bytes;assert.equal(out.length,buf.length,'same length');
  assert.deepEqual(kanaRuns(out),[],name+' '+word+' at offset '+(64+pad));}
});

test('in a megabyte of mixed bytes nothing reads as three kana afterwards',()=>{
 const parts=[];for(let i=0;i<64;i++){parts.push(crypto.createHash('sha256').update(String(i)).digest());const f=Object.values(forms)[i%4];parts.push(f(i%2?'ブビビ':'なまなま'));}
 const big=Buffer.concat([...parts,crypto.randomBytes(1<<20)]);
 assert.deepEqual(kanaRuns(d.desensitize(big).bytes),[]);
});

test('two kana and structures stay as they are; text of the primary encoding is replaced as before',()=>{
 const two=Buffer.concat([noise(32,3),Buffer.from('ブビ','utf16le'),noise(32,5)]);
 const swept=Buffer.from(two);assert.equal(d.kanaSweep(swept),0);assert.ok(swept.equals(two),'the sweep leaves a pair of kana between binary bytes alone (far more often a number)');
 const line=Buffer.from('「今日はいい天気ですね」と彼女は言った。\n','utf16le');const out=d.desensitize(line).bytes;
 assert.ok(!out.equals(line));assert.deepEqual(kanaRuns(out),[]);assert.equal(d.verify(line,out).ok,true);
});
