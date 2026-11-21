// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* engine-draw static test, Unity IL2CPP (docs/engine-draw-native.md; YU-RIS / MAGES are the template).
   1. the rules: tools/engine-sigs/il2cpp-text.cjs RULES are exactly native/megulithook/Il2cppDrawRoles.h's patterns, same order;
   2. the fixture (Il2CppDumper output of the owner's two IL2CPP galgames): the rule methods give the recorded ranges, and the
      frame cases give the recorded role and site (selftest/il2cppdraw.cpp checks the same data in C++);
   3. the owner's GameAssembly.dll when it is here (SHA-256): x64, every il2cpp API the runtime resolves is exported, every
      rule method start and every text setter is a function start in the unwind table (.pdata), the metadata version;
   4. the runtime's own log (selftest/il2cppgate.cpp: a fake il2cpp API over real functions, the real x64 unwind) parses. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const T=require('../tools/engine-sigs/il2cpp-text.cjs');
const fx=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','engine-sigs','il2cpp-text.json'),'utf8'));
const STEAM='E:/Steam/steamapps/common/';

test('the JavaScript rules are the native rules, in the same order',()=>{
 const h=fs.readFileSync(path.join(__dirname,'..','native','megulithook','Il2cppDrawRoles.h'),'utf8');
 const native=[...h.matchAll(/\{R"\((.*?)\)", "(\w+)"\}/g)].map(m=>[m[1],m[2]]);
 assert.deepEqual(native,T.RULES.map(([re,role])=>[re.source,role]));
});

test('fixture: the rule methods give the recorded ranges; the frame cases give the recorded roles',()=>{
 assert.deepEqual(Object.keys(fx.games),['mahou-shoujo-no-majo-saiban','haisha-fengyun']);
 for(const [name,g] of Object.entries(fx.games)){
  const hex=v=>parseInt(v,16);
  const methods=[...g.ranges.flatMap(r=>[{start:hex(r.from),name:r.name},{start:hex(r.to),name:'(next)'}]),{start:hex(g.decoy.start),name:g.decoy.name}];
  const rs=T.ranges(methods);
  assert.deepEqual(rs.map(r=>['0x'+r.from.toString(16),'0x'+r.to.toString(16),r.role]),g.ranges.map(r=>[r.from,r.to,r.role]),name);
  for(const c of g.cases){const v=T.classify(rs,c.frames.map(hex));assert.deepEqual([v.role,'0x'+v.site.toString(16)],[c.role,c.site],name+' '+c.frames.join(','));}
  for(const role of ['line','name','choice'])assert.ok(g.ranges.some(r=>r.role===role),name+': a '+role+' method');
 }
 assert.equal(fx.games['mahou-shoujo-no-majo-saiban'].framework,'Naninovel');assert.equal(fx.games['haisha-fengyun'].framework,'Fungus');
});

/* .pdata: the x64 unwind table (RUNTIME_FUNCTION {begin, end, unwind}) */
function pdataBegins(buf){
 const pe=buf.readUInt32LE(0x3c),dd=pe+24+112+3*8,rva=buf.readUInt32LE(dd),size=buf.readUInt32LE(dd+4),n=buf.readUInt16LE(pe+6),opt=buf.readUInt16LE(pe+20),sec=pe+24+opt;
 let off=-1;for(let i=0;i<n;i++){const o=sec+i*40,va=buf.readUInt32LE(o+12),sz=Math.max(buf.readUInt32LE(o+8),buf.readUInt32LE(o+16));if(rva>=va&&rva<va+sz)off=buf.readUInt32LE(o+20)+rva-va;}
 const s=new Set();for(let i=0;i+12<=size;i+=12)s.add(buf.readUInt32LE(off+i));return s;
}
for(const [name,g] of Object.entries(fx.games)){
 const dll=STEAM+g.gameAssembly.file,here=fs.existsSync(dll);
 test('owner\'s GameAssembly.dll '+name+': x64, the il2cpp API, rule methods and setters are function starts',{skip:!here&&'not on this PC'},()=>{
  const buf=fs.readFileSync(dll);if(crypto.createHash('sha256').update(buf).digest('hex')!==g.gameAssembly.sha256)return;
  assert.equal(T.machineOf(buf),0x8664);
  const ex=new Set(T.exportsOf(buf));assert.deepEqual(T.API.filter(a=>!ex.has(a)),[],'every API the runtime resolves');
  const begins=pdataBegins(buf);
  /* a leaf that only tail-jumps (RevealableText.set_Text: jmp rax) has no unwind entry and never is a caller frame: it must still
     start right after int3 padding */
  const byteAt=rva=>{const pe=buf.readUInt32LE(0x3c),n=buf.readUInt16LE(pe+6),sec=pe+24+buf.readUInt16LE(pe+20);for(let i=0;i<n;i++){const o=sec+i*40,va=buf.readUInt32LE(o+12),sz=buf.readUInt32LE(o+16);if(rva>=va&&rva<va+sz)return buf[buf.readUInt32LE(o+20)+rva-va];}return -1;};
  for(const r of g.ranges){const at=parseInt(r.from,16);assert.ok(begins.has(at)||byteAt(at-1)===0xcc,name+' '+r.name+' starts a function');}
  for(const s of g.setters)assert.ok(begins.has(parseInt(s.rva,16)),name+' '+s.name+' starts a function');
  const meta=fs.readFileSync(STEAM+g.metadata.file);assert.equal(meta.readUInt32LE(0),0xfab11baf,'global-metadata magic');assert.equal(meta.readUInt32LE(4),g.metadata.version);
 });
}

test('the runtime\'s log (fake il2cpp API, real unwind): roles, objects, clears',()=>{
 const lines=fs.readFileSync(path.join(__dirname,'fixtures','engine-sigs','il2cpp-draw-log.txt'),'utf8').split(/\r?\n/).filter(Boolean);
 const recs=lines.map(T.parseRun);assert.ok(recs.every(Boolean));
 assert.deepEqual(recs.map(r=>[r.kind,r.role||'',r.text||'']),[['on','',''],['text','line','私の名は'],['text','name','岡部'],['text','system','はい'],['clear','line','']]);
 assert.equal(recs[1].obj,recs[4].obj,'the clear names the object it empties');
 assert.equal(T.parseRun('ToMe_DRAWRUN engine=mages ev=clear page=0 seq=1'),null);
});
