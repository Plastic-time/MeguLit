// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* engine-draw static signature test, CatSystem2 (docs/engine-draw-native.md, same template as YU-RIS).
   1. the reference matcher (tools/engine-sigs/cs2-draw.cjs) on the fixture snippets: one hit each with the record offsets
      and stack slots the C++ matcher must also find (native/megulithook/selftest/cs2draw.cpp runs the same bytes);
   2. near misses match nothing: another record register in the y half, a branch into the hooked bytes, no glyph call;
   3. on the owner's exes when they are on this PC (read only): ISLAND.exe (and its Chinese patch exe, same code) has exactly
      one composer of each shape, at the fixture's places, plus one text anchor and one raster anchor.
      MEGULIT_CS2_EXES=<exe>;<exe>... adds other CatSystem2 builds: each must have exactly one origin composer (the
      message windows) and at most one direct one, else the runtime hook stays off for it (it is the same rule). */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const C=require('../tools/engine-sigs/cs2-draw.cjs');
const fx=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','engine-sigs','cs2-draw.json'),'utf8'));
const ISLAND=['E:/GAL/ISLAND/ISLAND/ISLAND.exe','E:/GAL/ISLAND/ISLAND/ISLAND_CHS.exe'];

test('fixture snippets: one composer each, record offsets, stack slots',()=>{
 assert.deepEqual(Object.keys(fx.snippets).sort(),['island-direct','island-origin']);
 for(const [name,s] of Object.entries(fx.snippets)){
  const va=parseInt(s.va,16),hits=C.find(Buffer.from(s.hex,'hex'),va);
  assert.equal(hits.length,1,name);const h=hits[0],e=s.expect;
  assert.deepEqual([h.hook-va,h.shape,h.rec,h.x,h.y,h.char,h.size,h.colour,h.bx,h.ox],[e.hookOffset,e.shape,e.rec,e.x,e.y,e.char,e.size,e.colour,e.bx,e.ox],name);
 }
 /* the record layout the exact ISLAND adapter (ToMeIslandDraw.h) reads: char +4, fill +8, x +0x10, y +0x14, size +0x1c */
 const o=fx.snippets['island-origin'].expect;assert.deepEqual([o.char,o.colour,o.x,o.y,o.size],[4,8,0x10,0x14,0x1c]);
});

test('near misses never match',()=>{
 for(const [name,s] of Object.entries(fx.snippets)){
  const b=Buffer.from(s.hex,'hex'),va=parseInt(s.va,16),at=s.expect.hookOffset,y=s.expect.shape==='origin'?at+18:at+11;
  const c=Buffer.from(b);c[y+1]^=0x01;assert.equal(C.find(c,va).length,0,name+': y read through another register');
  const d=Buffer.from(b);d[at-0x20]=0xeb;d[at-0x1f]=0x20-2+3;assert.equal(C.find(d,va).length,0,name+': a jump into the hooked bytes');
  const e=Buffer.from(b);for(let i=0;i<at;i++)if(e[i]===0xff&&e[i+2]===0x04&&(e[i+1]&0xf8)===0x50)e[i]=0x90;assert.equal(C.find(e,va).length,0,name+': no glyph call');
 }
});

for(const exe of ISLAND){
 test('owner\'s exe '+path.basename(exe)+': one composer of each shape, one text and one raster anchor',{skip:!fs.existsSync(exe)&&'not on this PC'},()=>{
  const buf=fs.readFileSync(exe),t=C.textOf(buf),hits=C.find(t.code,t.va),a=C.anchors(t.code,t.va),f=fx.exes.island;
  assert.deepEqual(hits.map(h=>'0x'+h.hook.toString(16)),f.hooks);
  assert.deepEqual(hits.map(h=>h.shape),['direct','origin']);
  assert.deepEqual([a.text.map(v=>'0x'+v.toString(16)),a.raster.map(v=>'0x'+v.toString(16))],[f.text,f.raster]);
  /* the owner classes the runtime maps to roles are in this build */
  const cls=C.classes(buf);for(const k of ['kcTaskStringPlane','kcTaskStringPlane2','kcTaskStringPlaneNv','kcFEScriptObjButton','kcFEScriptObjString','kcTaskMesList'])assert.ok(cls.includes(k),k);
  if(path.basename(exe)==='ISLAND.exe')assert.equal(crypto.createHash('sha256').update(buf).digest('hex'),f.sha256);
 });
}

for(const exe of (process.env.MEGULIT_CS2_EXES||'').split(';').filter(Boolean)){
 test('other CatSystem2 build '+exe,()=>{
  const t=C.textOf(fs.readFileSync(exe)),hits=C.find(t.code,t.va);
  assert.equal(hits.filter(h=>h.shape==='origin').length,1,'origin composers');assert.ok(hits.filter(h=>h.shape==='direct').length<=1,'direct composers');
 });
}
