// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-19 (runtime-harvest live stand-in, once in many runs under load: 「ぴやがご」 read back out of a desensitized
   sample, although the kana sweep covers every encoding and offset in isolation). Fifty heap-like buffers: binary,
   high-entropy blocks, ASCII, and kana runs in UTF-16LE (both parities), UTF-8, Shift-JIS and EUC-JP/GBK, some across a
   4 KB block edge or next to an opaque block. Every sample either reads clean the way the privacy test reads it, or is
   not shared at all; and samples are still shared (the guard does not simply drop everything). */
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const d=require('../services/desensitize.cjs');
const PLACE=new Set([...'あア亜Ａ０□가ｱĀ啊']);
function readOut(buf){const out=[];for(const b of [buf,buf.subarray(1)])for(const e of ['shift_jis','utf-8','utf-16le','gbk','euc-jp']){
 const t=new TextDecoder(e).decode(b);for(const r of t.match(/[ぁ-ゖァ-ヺ]{3,}/g)||[])if([...r].some(c=>!PLACE.has(c)))out.push(e+':'+r);}return out;}
const WORDS=['ぴやがご','ブビビ','なまなま','かきくけこ','セカイ','あいうえお','ヲンヴ'];
const sjisMap=new Map();for(let lead of [0x82,0x83])for(let tr=0x40;tr<=0xfc;tr++){const s=new TextDecoder('shift_jis').decode(Buffer.from([lead,tr]));if(s.length===1)sjisMap.set(s,[lead,tr]);}
const eucMap=new Map();for(let lead of [0xa4,0xa5])for(let tr=0xa1;tr<=0xfe;tr++){const s=new TextDecoder('euc-jp').decode(Buffer.from([lead,tr]));if(s.length===1)eucMap.set(s,[lead,tr]);}
const enc={
 u16:w=>Buffer.from(w,'utf16le'),u8:w=>Buffer.from(w,'utf8'),
 sjis:w=>Buffer.from([...w].flatMap(c=>sjisMap.get(c)||[0x81,0x40])),euc:w=>Buffer.from([...w].flatMap(c=>eucMap.get(c)||[0xa1,0xa1]))};
let seed=7;const rnd=n=>{seed=(Math.imul(seed,1103515245)+12345)>>>0;return (seed>>>8)%n;};
function heap(round){const parts=[];let size=0;const push=b=>{parts.push(b);size+=b.length;};
 while(size<48*1024){const k=rnd(6);
  if(k===0)push(crypto.createHash('sha512').update(round+':'+size).digest());           /* key-like bytes */
  else if(k===1)push(crypto.randomBytes(4096+rnd(512)));                                 /* an opaque block */
  else if(k===2)push(Buffer.from('script_'+rnd(1000)+'.ks\0 [r]\n@cmd val='+rnd(99)+'\n','latin1'));
  else{const w=WORDS[rnd(WORDS.length)],e=Object.values(enc)[rnd(4)];if(rnd(3)===0){const pad=4096-(size%4096)-1;if(pad>0&&pad<64)push(Buffer.alloc(pad,0x20));}push(Buffer.alloc(rnd(3),0));push(e(w));}}
 return Buffer.concat(parts);}

test('fifty heap-like buffers: every shared sample reads clean in every decoding, and samples are still shared',()=>{
 let shared=0,dropped=0;const bad=[];
 for(let r=0;r<50;r++){const buf=heap(r);assert.ok(readOut(buf).length>0,'the fixture holds kana runs');
  const s=d.sample(buf,{max:buf.length,compress:true});if(!s){dropped++;continue;}shared++;
  for(const p of s.parts){const found=readOut(d.partBytes(p));if(found.length)bad.push(r+': '+found.slice(0,3).join(' '));}}
 assert.deepEqual(bad,[],'kana runs left in a shared sample');
 assert.ok(shared>=40,'samples are still shared: '+shared+' of 50 ('+dropped+' dropped)');
});

test('the last check catches a run the sweep did not take, and leaves placeholders and pairs alone',()=>{
 assert.equal(d.residualKana(Buffer.concat([Buffer.alloc(9,1),Buffer.from([0xa4,0xd4,0xa4,0xe4,0xa4,0xac,0xa4,0xb4]),Buffer.alloc(9,1)])),true,'EUC 4 kana');
 assert.equal(d.residualKana(Buffer.concat([Buffer.alloc(9,1),Buffer.from('ぴやが','utf16le')])),true,'UTF-16 at an odd offset');
 assert.equal(d.residualKana(Buffer.from('アアアあああ','utf16le')),false,'placeholders');
 assert.equal(d.residualKana(Buffer.concat([Buffer.alloc(9,1),Buffer.from('ぴや','utf16le'),Buffer.alloc(9,1)])),false,'a pair');
});
