// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* engine-draw static signature test, SiglusEngine (docs/engine-draw-native.md, template: engine-draw-sig-yuris.test.cjs).
   1. the reference matcher (tools/engine-sigs/siglus-draw.cjs) on the fixture windows of CLANNAD and Summer Pockets: the
      same functions, call sites, roles and msg field offsets the C++ matcher must also find (selftest/siglusdraw.cpp
      runs the same bytes);
   2. near misses match nothing;
   3. on the owner's exes when they are on this PC (matched by SHA-256, read only): the whole code section gives the
      fixture's answer. Skipped per exe when it is not here. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const S=require('../tools/engine-sigs/siglus-draw.cjs');
const fx=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','engine-sigs','siglus-draw.json'),'utf8'));
const EXES={'clannad':'E:/GAL/CLANNAD/SiglusEngine_Steam.exe','summer-pockets':'E:/Steam/steamapps/common/Summer Pockets/SiglusEngine_Steam.exe'};
const segsOf=g=>g.segments.map(s=>({va:parseInt(s.va,16),code:Buffer.from(s.hex,'hex')}));
const byteAt=(segs,va)=>{for(const s of segs)if(va>=s.va&&va<s.va+s.code.length)return {s,o:va-s.va};return null;};

test('fixture windows: every function, call site and offset of both builds',()=>{
 assert.deepEqual(Object.keys(fx.games).sort(),['clannad','summer-pockets']);
 for(const [name,g] of Object.entries(fx.games)){
  const r=S.find(segsOf(g));
  assert.equal(r.ok,true,name+': '+r.why);
  assert.deepEqual(S.describe(r),g.expect,name);
  assert.deepEqual(Object.fromEntries(Object.entries(r.sites).map(([k,v])=>[k,v.length])),{selbtn:1,print:1,ruby:2,name:1,msgsel:1},name+': push roles');
  assert.deepEqual(Object.fromEntries(Object.entries(r.adds).map(([k,v])=>[k,v.length])),{backlog:2,line:1,namemsg:1},name+': add_msg callers');
 }
});

test('both builds: same moji layout and msg fields, only the addresses move',()=>{
 const a=fx.games.clannad.expect,b=fx.games['summer-pockets'].expect;
 assert.equal(a.vec,'0x1ac');assert.deepEqual(a.off,b.off);assert.equal(a.vec,b.vec);
 assert.notEqual(a.push,b.push,'different builds, different addresses: nothing may be hard-coded');
 /* what the manual reverse engineering found in CLANNAD (msg::add_msg 0x5ddaa0, vector<moji>::push_back 0x5b4a00,
    msg::clear 0x5dbf60, ruby layout pushes at 0x5deaba / 0x5ded7a) */
 assert.deepEqual([a.addMsg,a.push,a.clear,a.sites.ruby],['0x5ddaa0','0x5b4a00','0x5dbf60',['0x5deaba','0x5ded7a']]);
});

test('near misses never match: bracket check, a ruby call site, clear, an extra unknown push',()=>{
 for(const [name,g] of Object.entries(fx.games)){
  const fresh=()=>segsOf(g).map(s=>({va:s.va,code:Buffer.from(s.code)}));
  let segs=fresh();for(const s of segs){const i=s.code.indexOf(Buffer.from([0x0c,0x30,0x00,0x00,0x74]));if(i>0){s.code[i]=0x0d;break;}}
  assert.equal(S.find(segs).ok,false,name+': bracket check broken');
  segs=fresh();let p=byteAt(segs,parseInt(g.expect.sites.ruby[0],16));p.s.code[p.o-1]=0x02;
  assert.equal(S.find(segs).ok,false,name+': ruby call site changed');
  segs=fresh();p=byteAt(segs,parseInt(g.expect.clear,16));p.s.code[p.o+5]=0x0c;
  assert.equal(S.find(segs).ok,false,name+': clear head changed');
  /* a seventh call of push the matcher cannot place: refuse rather than guess its role */
  segs=fresh();const push=parseInt(g.expect.push,16),extra=Buffer.alloc(16,0x90),va=0x10000000;
  extra[8]=0xe8;extra.writeInt32LE(push-(va+8+5),9);segs.push({va,code:extra});
  const r=S.find(segs);assert.equal(r.ok,false,name+': unknown push');assert.match(r.why,/unknown pushes/);
 }
});

for(const [name,exe] of Object.entries(EXES)){
 const here=fs.existsSync(exe);
 test('owner\'s exe '+name+': the whole code section gives the fixture\'s answer',{skip:!here&&'not on this PC'},()=>{
  const buf=fs.readFileSync(exe),sha=crypto.createHash('sha256').update(buf).digest('hex');
  const r=S.scanFile(exe);assert.equal(r.ok,true,r.why);
  if(sha!==fx.games[name].sha256)return; /* another build of the same game: it must still match, the addresses may differ */
  assert.deepEqual(S.describe(r),fx.games[name].expect);
 });
}
