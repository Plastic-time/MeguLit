// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* engine-draw static signature test, GDI draw sites of the native engines (native/megulithook/DrawSitesSig.h; the reference
   tools/engine-sigs/draw-sites.cjs reads that very table). Template: engine-draw-sig-yuris.test.cjs.
   1. fixture snippets (validation/fixtures/engine-sigs/draw-sites.json, from the owner's exes): each signature matches once at
      the call; another IAT slot or a changed pattern byte matches nothing (selftest/drawsites.cpp runs the same bytes in C++);
   2. the owner's files when they are on this PC (same SHA-256, read only): each signature matches exactly `count` times in
      its own module, at the snippet's call; skipped per file when it is not here;
   3. no signature matches in any other engine's file of the survey (docs/engine-draw-matrix.md, re-misc). */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const S=require('../tools/engine-sigs/draw-sites.cjs');
const dir=path.join(__dirname,'fixtures','engine-sigs'),fx=JSON.parse(fs.readFileSync(path.join(dir,'draw-sites.json'),'utf8'));
const files=JSON.parse(fs.readFileSync(path.join(dir,'draw-sites-files.json'),'utf8'));
/* the other native engines' files of the survey: no signature may match in them */
const OTHERS=['E:/GAL/月姬 v1.4/Tsukihime.exe','E:/Steam/steamapps/common/Aoi Tori/cmvs32.exe','E:/Steam/steamapps/common/eden/eden_en.exe',
 'E:/GAL/[120831][FAVORITE] いろとりどりのヒカリ/五彩斑斓的曙光/Hikari.exe','E:/GAL/[091030][ぱれっと] ましろ色シンフォニー -Love is pure white-/纯白交响曲/mashiroiro.exe',
 'E:/GAL/[061215][シュガービーンズ] Under The Moon～ (iso)/[NoDVD & Windows7起動 Patch] Under The Moon/utmoon.exe','E:/GAL/[130208][Innocent Grey] 虚ノ少女/虚之少女/Innocentsetup.exe',
 'E:/GAL/[971128][ZERO] 涙 ～流星のザドル～ (SD ccd)/AVG3216D.EXE','E:/GAL/[031226][Nitro+] 沙耶の唄/system.dll','E:/GAL/WHITE ALBUM2/WA2.exe',
 'E:/GAL/[120727][ユニゾンシフト：ブロッサム] 時計仕掛けのレイライン -黄昏時の境界線-/dll/PAL.dll','E:/GAL/[090522][Belisama] ダストマニア・グロテスク～解体挿入新書～/解体插入新书/libscr.dll'];

test('the table parses: ids unique, APIs known, patterns valid',()=>{
 const sigs=S.sigs();assert.ok(sigs.length>=1);assert.equal(new Set(sigs.map(g=>g.id+'|'+g.module+'|'+g.api+'|'+g.pre)).size,sigs.length);
 for(const g of sigs){assert.ok(['TextOutA','TextOutW','ExtTextOutA','ExtTextOutW','DrawTextA','DrawTextW','GetGlyphOutlineA','GetGlyphOutlineW'].includes(g.api),g.id);
  assert.ok(S.pattern(g.pre).length>=6,g.id+': at least 6 bytes before the call');assert.ok(S.pattern(g.pre).every(b=>b===null||b==='S'||(b>=0&&b<=255)),g.id);assert.ok(g.count>=1);}
});

test('fixture snippets: one site each, at the call; another slot or a changed byte: none',()=>{
 assert.ok(Object.keys(fx.snippets).length>=1);
 for(const [name,s] of Object.entries(fx.snippets)){
  const g=S.sigs().find(x=>x.id===s.id),b=Buffer.from(s.hex,'hex'),slot=parseInt(s.slot,16);
  assert.ok(g,name);assert.deepEqual(S.find(b,[slot],g.pre),[s.callOffset],name);
  assert.equal(parseInt(s.va,16)+s.callOffset,parseInt(s.call,16),name);
  assert.deepEqual(S.find(b,[slot+4],g.pre),[],name+': another slot');
  const p=S.pattern(g.pre),i=p.findIndex(x=>typeof x==='number'),c=Buffer.from(b);c[s.callOffset-p.length+i]^=0x5a;assert.deepEqual(S.find(c,[slot],g.pre),[],name+': changed byte');
 }
});

for(const f of files){
 const here=fs.existsSync(f.path);
 test('owner\'s file '+f.name+' ('+f.id+'): the signature matches exactly its count, at the fixture\'s call',{skip:!here&&'not on this PC'},()=>{
  const buf=fs.readFileSync(f.path),sha=crypto.createHash('sha256').update(buf).digest('hex'),g=S.sigs().find(x=>x.id===f.id);
  const r=S.scanFile(f.path,g.module),h=r.hits.find(x=>x.id===f.id);
  assert.ok(h,'no site found');assert.equal(h.sites.length,g.count);
  const snaps=Object.values(fx.snippets).filter(s=>s.id===f.id&&s.sha256===sha);
  if(snaps.length)assert.deepEqual(h.sites.map(v=>'0x'+v.toString(16)).sort(),[...new Set(snaps.map(s=>s.call))].sort()); /* one build may be in several folders (月姬 v1.4 / v1.6) */
 });
}

test('no signature matches in another engine\'s file of the survey',()=>{
 let seen=0;
 for(const file of OTHERS){if(!fs.existsSync(file))continue;seen++;
  const own=files.filter(f=>f.path===file).map(f=>f.id);
  for(const mod of ['',path.basename(file)]){const r=S.scanFile(file,mod);for(const h of r.hits)assert.ok(own.includes(h.id),h.id+' matched in '+file);}}
 if(!seen)console.log('# none of the survey files is on this PC');
});
