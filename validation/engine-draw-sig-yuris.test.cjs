// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* engine-draw static signature test, YU-RIS (template for every native engine; docs/engine-draw-native.md).
   1. the reference matcher (tools/engine-sigs/yuris-draw.cjs) on the fixture snippets: one hit each, the x / y slots and the
      blitter the C++ matcher must also find (native/megulithook/selftest/yurisdraw.cpp runs the same bytes);
   2. on the owner's exes when they are on this PC (matched by SHA-256, read only): exactly one dialogue loop in the whole
      code section, at the place the fixture says. Skipped per exe when it is not here. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Y=require('../tools/engine-sigs/yuris-draw.cjs');
const fx=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','engine-sigs','yuris-draw.json'),'utf8'));
const EXES={'euphoria-hd-1.474':'E:/GAL/euphoria/euphoriaHD/euphoriaHD.exe','euphoria':'E:/GAL/euphoria/euphoria/euphoria.exe','josou-sanmyaku':'E:/GAL/女装山脉/女装山脈.exe','psychologic-love-comedy':'E:/GAL/[150828][initial] サイコロジック・ラブコメディ/サイコロジック ラブコメディ/saikoro.exe'};

test('fixture snippets: one dialogue loop call each, x / y slots, blitter',()=>{
 assert.equal(Object.keys(fx.snippets).length,4);
 for(const [name,s] of Object.entries(fx.snippets)){
  const va=parseInt(s.va,16),hits=Y.find(Buffer.from(s.hex,'hex'),va);
  assert.equal(hits.length,1,name);
  assert.deepEqual([hits[0].call-va,hits[0].x,hits[0].y,'0x'+hits[0].blitter.toString(16),hits[0].acc],[s.expect.callOffset,s.expect.x,s.expect.y,s.expect.blitter,s.expect.acc],name);
 }
 const hd=fx.snippets['euphoria-hd-1.474'];assert.equal(hd.expect.blitter,'0x405604','the blitter the exact euphoria HD adapter (EuphoriaHD474Draw.h) hooks');
});

test('near misses never match: no accumulator store, the SJIS step changed, another call shape',()=>{
 const s=fx.snippets['euphoria'],b=Buffer.from(s.hex,'hex'),va=parseInt(s.va,16);
 const c=Buffer.from(b);for(let i=0;i+4<=0xa0;i++)if(c[i]===0x89&&(c[i+1]&0xc7)===0x44&&c[i+2]===0x24&&c[i+3]===s.expect.x)c[i]=0x90;
 assert.equal(Y.find(c,va).length,0,'x never stored');
 const d=Buffer.from(b);d[0xa0+5]=0x2b;assert.equal(Y.find(d,va).length,0,'sub instead of add after the call');
});

for(const [name,exe] of Object.entries(EXES)){
 const here=fs.existsSync(exe);
 test('owner\'s exe '+name+': exactly one dialogue loop in the code section',{skip:!here&&'not on this PC'},()=>{
  const buf=fs.readFileSync(exe),sha=crypto.createHash('sha256').update(buf).digest('hex');
  if(sha!==fx.snippets[name].sha256)return; /* another build of the same game: the snippet does not apply, the count still must */
  const t=Y.textOf(buf),hits=Y.find(t.code,t.va);
  assert.equal(hits.length,1);assert.equal(hits[0].call,parseInt(fx.snippets[name].va,16)+0xa0);
 });
}
