// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* engine-draw static signature test, MAGES. (docs/engine-draw-native.md; YU-RIS is the template).
   1. the reference matcher (tools/engine-sigs/mages-draw.cjs) on the fixture snippets (decrypted code of the five Steam
      builds): drawDialogue x2, drawGlyph, pages / stride / chars / scale, the commit and its layout buffer, both page clears;
      the C++ matcher (native/megulithook/selftest/magesdraw.cpp) checks the same bytes;
   2. near misses never match;
   3. on the owner's exes when they are on this PC (SHA-256, read only; SteamStub decrypted in memory): everything found once,
      the same module offsets as the version layer's table (The Seed/mages/<game>/versions/<sha>.json draw.engineTable), and
      the SC3 Sel / SysSel calls commit into page 7 / page window+5 (the pages the hook gives role choice);
   4. the runtime's own log (validation/fixtures/engine-sigs/mages-draw-log.txt, written by selftest/magesgate.cpp through real
      MinHook detours) read back by core/mages-draw.cjs: a sentence committed in two pieces is one page unit (CHAOS;CHILD), the
      name comes from the engine's markers, choices keep their numbers, the records are valid ToMe_CHARS. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const M=require('../tools/engine-sigs/mages-draw.cjs'),SS=require('../tools/engine-sigs/steamstub.cjs');
const Sample=require('../tools/engine-sigs/mages-sample.cjs');
const D=require('../core/mages-draw.cjs'),T=require('../core/text-paths.cjs'),ED=require('../core/engine-draw.cjs');
const fx=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','engine-sigs','mages-draw.json'),'utf8'));
const STEAM='E:/Steam/steamapps/common/';
const hex=v=>'0x'+v.toString(16);

test('incomplete commit operands and presentation tails never read outside the supplied bytes',()=>{
 const tails=require('./helpers/mages-truncated-code.cjs');
 const s=fx.snippets['chaos-child'],b=Buffer.from(s.hex,'hex'),va=parseInt(s.va,16);
 const r=M.find(Buffer.concat([b,tails.commitTail()]),va);
 assert.deepEqual(r.problems,[],'unrelated incomplete trailing candidate does not erase the complete signature');
 assert.equal(r.commit.at-va,s.expect.commit);
 assert.equal(M.backbuffer(tails.presentTail()),null,'truncated absolute address is not a presentation');
});

test('fixture snippets: every part found once, at the expected offsets',()=>{
 assert.equal(Object.keys(fx.snippets).length,5);
 for(const [name,s] of Object.entries(fx.snippets)){
  const va=parseInt(s.va,16),r=M.find(Buffer.from(s.hex,'hex'),va),e=s.expect;
  assert.deepEqual(r.problems,[],name);
  assert.deepEqual(r.dialogue.map(v=>v-va),e.dialogue,name+' drawDialogue');
  assert.equal(r.drawGlyph-va,e.drawGlyph,name+' drawGlyph');
  assert.deepEqual([hex(r.pages),hex(r.stride),r.S,hex(r.scale)],[e.pages,e.stride,e.chars,e.scale],name+' pages');
  assert.deepEqual([r.commit.at-va,hex(r.commit.count),hex(r.commit.codes),hex(r.commit.info)],[e.commit,e.count,e.codes,e.info],name+' commit');
  assert.deepEqual(r.clear.map(v=>v-va),e.clear,name+' clears');
 }
 assert.equal(fx.snippets['steins-gate'].table.drawGlyph,'0x2f950','STEINS;GATE drawGlyph = LanguageBarrier\'s 0x42F950');
 assert.equal(fx.snippets['steins-gate-my-darlings-embrace'].expect.chars,7000,'MDE pages hold 7000 characters (LanguageBarrier SGMDEDialoguePage_t)');
});

test('near misses never match: a glyph call fewer, no pageLength++, another stride',()=>{
 const s=fx.snippets['chaos-child'],b=Buffer.from(s.hex,'hex'),va=parseInt(s.va,16);
 const c=Buffer.from(b);let seen=0;for(let i=s.expect.dialogue[1];i+3<c.length;i++)if(c[i]===0x83&&c[i+1]===0xc4&&c[i+2]===0x2c&&++seen===2){c[i+2]=0x28;break;}
 assert.ok(M.find(c,va).problems.some(p=>/drawDialogue/.test(p)),'two glyph calls');
 const d=Buffer.from(b),len=parseInt(s.expect.pages,16)+0xc;for(let i=s.expect.commit;i<s.expect.commit+0x200;i++)if(d[i]===0xff&&(d[i+1]&0xf8)===0x80&&d.readUInt32LE(i+2)===len){d[i]=0x90;d[i+1]=0x90;}
 assert.ok(M.find(d,va).problems.some(p=>/commit/.test(p)),'no pageLength++');
 const e=Buffer.from(b);for(let i=0;i+6<e.length;i++)if(e[i]===0x69&&e.readUInt32LE(i+(((e[i+1]>>6)===3)?2:3))===0xea9c)e.writeUInt32LE(0xea9d,i+(((e[i+1]>>6)===3)?2:3));
 assert.ok(M.find(e,va).problems.length>0,'a stride that is no page');
 assert.equal(M.sizeOf(0xea9c),2000);assert.equal(M.sizeOf(0x3348c),7000);assert.equal(M.sizeOf(0xea9d),0);
});

for(const [name,s] of Object.entries(fx.snippets)){
 const exe=STEAM+s.exe,here=fs.existsSync(exe);
 test('owner\'s exe '+name+': found once, = the version table, Sel / SysSel pages',{skip:!here&&'not on this PC'},ctx=>{
  const buf=fs.readFileSync(exe),identity=Sample.inspect(buf,s.sha256),sha=identity.sha256;
  if(identity.status!=='matched'){ctx.skip(identity.status+': '+sha);return;}
  const t=SS.plainText(buf);assert.ok(t.steamstub,'SteamStub decrypted');
  const r=M.find(t.code,t.va);assert.deepEqual(r.problems,[]);
  const table=M.table({...r,base:t.base});assert.deepEqual(table,s.table);
  const seed=JSON.parse(fs.readFileSync(path.join(__dirname,'..','The Seed','mages',name,'versions',sha+'.json'),'utf8')).settings.draw.engineTable;
  for(const k of Object.keys(table))assert.deepEqual(seed[k],table[k],'version layer '+k);
  assert.equal(seed.charset,s.charset);assert.deepEqual([seed.selPage,seed.sysSelPage],[7,5]);
  /* every call of the commit: Mes (page = the thread's window), Sel (push 8; push 7), SysSel (lea r,[window+5] ... push r) */
  const c=t.code,commit=r.commit.at-t.va;let sel=0,sys=0,all=0;
  for(let i=0;i+5<c.length;i++){if(c[i]!==0xe8||i+5+c.readInt32LE(i+1)!==commit)continue;all++;
   if(c[i-2]===0x6a&&c[i-1]===0x07&&c[i-4]===0x6a&&c[i-3]===0x08)sel++;
   for(let k=i-16;k<i;k++)if(c[k]===0x8d&&(c[k+1]&0xc0)===0x40&&c[k+2]===0x05){sys++;break;}}
  assert.deepEqual([all,sel,sys],[3,1,1],'three commits: Mes, Sel -> page 7, SysSel -> page window+5');
 });
}

test('the runtime\'s log (real detours on a stand-in engine) read back: pages, names, one unit per page, choices',()=>{
 const lines=fs.readFileSync(path.join(__dirname,'fixtures','engine-sigs','mages-draw-log.txt'),'utf8').split(/\r?\n/).filter(Boolean);
 assert.ok(lines.every(l=>D.parse(l)),'every line parses');
 assert.equal(D.parse(lines[0]).kind,'on');
 const cs=require('../services/original-engines/mages.cjs')._internal.charset('sghd');
 const tr=new D.PageTracker({charset:cs});const seen=[];
 for(const l of lines){tr.feed(l);const v=tr.view(0);if(v&&v.seq===1&&!seen.length&&v.text)seen.push(v.text);}
 /* page 0, unit 1: the name from the 0x8001 / 0x8002 markers, the sentence from two commits */
 const ev=tr.events.filter(e=>e.key==='0:1');
 assert.deepEqual(ev.map(e=>e.type),['start','grow','grow','clear'],'one start for two commits, then the clear');
 const v0=tr.view(0);assert.equal(v0.seq,2);assert.equal(v0.text,'まゆり');
 /* replay up to the clear to see unit 1 whole */
 const t1=new D.PageTracker({charset:cs});for(const l of lines){if(/ev=clear page=0 seq=1/.test(l))break;t1.feed(l);}
 const u1=t1.view(0);
 assert.equal(u1.name,'岡部');assert.equal(u1.text,'フゥーハハ！');
 assert.deepEqual(u1.glyphs.map(g=>g.rect),[[240,900,30,45],[270,900,30,45],[330,900,30,45],[120,900,30,45],[150,900,30,45],[180,900,30,45]]);
 assert.deepEqual(u1.nameGlyphs.map(g=>g.rect),[[150,900,30,45],[180,900,30,45]]);
 /* the kernel's records: line + name, both valid ToMe_CHARS */
 const recs=D.toChars(t1,0,{line:3}).map(T.parseChars);
 assert.ok(recs.every(Boolean),'valid ToMe_CHARS');
 assert.deepEqual(recs.map(r=>[r.role||'line',r.text,r.rects.length]),[['name','岡部',2],['line','フゥーハハ！',6]]);
 assert.equal(recs[0].id,'N:0');
 /* Sel page 7: two choices with their numbers */
 assert.deepEqual(tr.choices(7).map(c=>[c.id,c.text]),[['C:0','はい'],['C:1','いえ']]);
 const ch=D.toChars(tr,7).map(T.parseChars);assert.deepEqual(ch.map(r=>[r.role,r.id,r.text]),[['choice','C:0','はい'],['choice','C:1','いえ']]);
 /* a menu run the engine drew elsewhere */
 const g=lines.map(D.parse).filter(r=>r.kind==='glyph');assert.equal(g.length,3);assert.deepEqual(g[0].box,[500,200,120,30]);
});

test('ruby markers (inferred from SC3, not yet seen in a log) become ruby on the text',()=>{
 const cs=[...'あいう漢字よみ'].join('');const tr=new D.PageTracker({charset:cs});
 const codes=[0x0000,0x8009,0x0003,0x0004,0x800a,0x0005,0x0006,0x800b,0x0001].map(c=>c.toString(16).padStart(4,'0')).join('');
 tr.feed('ToMe_DRAWRUN engine=mages ev=add page=0 seq=1 role=line from=0 n=6 scale=1.5 codes='+codes);
 const v=tr.view(0);assert.equal(v.text,'あ漢字い');assert.deepEqual(v.ruby,[[1,3,'よみ']]);
});

test('the version table reaches the DLL as one control-file line; no table, no line',()=>{
 const t=JSON.parse(fs.readFileSync(path.join(__dirname,'..','The Seed','mages','steins-gate','versions',fx.snippets['steins-gate'].sha256+'.json'),'utf8')).settings.draw.engineTable;
 const line=ED.tableLine(t);
 assert.match(line,/^#table mages drawDialogue=0x4b420,0x4b850 drawGlyph=0x2f950 commit=0x4ab20 clear=0x4adc0,0x4b0f0 pages=0x1261840 stride=0xea9c chars=2000 /);
 const text=ED.krkrControlText({...ED.settings({draw:{roles:true,engineTable:t}})},[]);
 assert.match(text,/^#cfg roles=1 embed=0 zh=1\r\n#table mages /);
 assert.equal(ED.settings({draw:{roles:true}}).table,undefined);assert.doesNotMatch(ED.krkrControlText(ED.settings({draw:{roles:true}}),[]),/#table/);
 /* off by default: the seeds keep draw.roles false, so no control file asks the DLL to hook */
 for(const slug of Object.keys(fx.snippets)){const g=JSON.parse(fs.readFileSync(path.join(__dirname,'..','The Seed','mages',slug,'game.json'),'utf8'));assert.equal(g.settings.draw.roles,false,slug);}
});

test('presentation: the back buffer size globals in each build (fixture snippet before Present)',()=>{
 for(const [name,s] of Object.entries(fx.snippets)){
  const b=Buffer.from(s.present.hex,'hex'),r=M.backbuffer(b);
  assert.ok(r,name);assert.equal('0x'+r.w.toString(16),s.present.w,name);assert.equal(r.h,r.w+4,name);
  assert.equal(s.table.backbuffer[0],'0x'+(r.w-parseInt(s.base,16)).toString(16),name+' version table');
  const c=Buffer.from(b);for(let i=0;i+3<c.length;i++)if(c[i]===0xff&&c[i+1]===0x51&&c[i+2]===0x44)c[i+2]=0x48;
  assert.equal(M.backbuffer(c),null,name+': no Present after it, not the presentation');
 }
});

/* Ruby markers, static evidence (owner 2026-11-21: verify 0x8009-0x800B or keep calling it a guess). In every build the SC3 text
   parser (the function that fills the layout buffer) writes 0x8000 + b for EVERY control byte b < 0x20 into the layout codes
   before dispatching on b through a 32-entry jump table; the cases for 0x0A and 0x0B both advance the layout index (the marker
   stays) and set / clear the same local flag, which the glyph path tests to leave those glyphs out of the line's character count.
   So 0x8009 / 0x800A / 0x800B reach the commit as markers and the glyphs between 0x800A and 0x800B are laid-out ruby glyphs.
   Still inferred: that 0x09 starts the ruby base (SC3 / impacto's STT_RubyBaseStart; the 0x09 case only keeps its marker). */
for(const [name,s] of Object.entries(fx.snippets)){
 const exe=STEAM+s.exe,here=fs.existsSync(exe);
 test('owner\'s exe '+name+': SC3 controls 0x01 / 0x0A / 0x0B stay in the layout as markers; 0x0A / 0x0B switch one ruby flag',{skip:!here&&'not on this PC'},ctx=>{
  const buf=fs.readFileSync(exe),identity=Sample.inspect(buf,s.sha256);
  if(identity.status!=='matched'){ctx.skip(identity.status+': '+identity.sha256);return;}
  const t=SS.plainText(buf),c=t.code,codes=parseInt(s.table.layoutCodes,16)+t.base;const cb=Buffer.alloc(4);cb.writeUInt32LE(codes);
  let found=0;
  for(let i=0;i+40<c.length;i++){
   if(c[i]!==0x66||c[i+1]!==0x89||c[i+3]!==0x7d||!c.subarray(i+4,i+8).equals(cb))continue;
   let j=-1;for(let k=i+8;k<i+24;k++)if(c[k]===0x83&&c[k+1]===0xf8&&c[k+2]===0x1f&&c[k+3]===0x0f&&c[k+4]===0x87&&c[k+9]===0xff&&c[k+10]===0x24&&c[k+11]===0x85){j=k;break;}
   if(j<0)continue;found++;
   /* the value written is 0x8000-based: add ax, word [ebp-X] right before, X loaded with 0x8000 at the function's start */
   assert.equal(c[i-7],0x66);assert.equal(c[i-6],0x03);
   /* the jump table sits in the code section right after the parser */
   const tbl=c.readUInt32LE(j+12)-t.va,entry=k=>c.readUInt32LE(tbl+4*k)-t.va;
   const head=k=>c.subarray(entry(k),entry(k)+24);
   const flag=h=>{for(let q=0;q+10<=h.length;q++)if(h[q]===0xc7&&h[q+1]===0x85)return [h.readInt32LE(q+2),h.readUInt32LE(q+6)];return null;};
   for(const k of [1,10,11]){const h=head(k);assert.equal(h[0],0x46,name+' case '+k+': inc esi');assert.ok(h.subarray(0,16).includes(0x47),name+' case '+k+': inc edi (the marker stays)');}
   const fa=flag(head(10)),fb=flag(head(11));
   assert.ok(fa&&fb,name+': 0x0A / 0x0B set a local');assert.equal(fa[0],fb[0],name+': the same local');assert.deepEqual([fa[1],fb[1]],[1,0],name+': 0x0A sets it, 0x0B clears it');
  }
  assert.equal(found,1,'one SC3 text parser');
 });
}
