// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E297: KiriKiri cx filter offline. The key program VM (ported from GARbro), the control block search in a plug-in, and
// the solver that recovers a game's orders and boundary rule from files with known first bytes; then a whole archive
// encrypted with an unknown scheme is read back without being told the scheme.
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const vm=require('../services/original-engines/cx-vm.cjs'),worker=require('../services/original-engines/cx-worker.cjs'),xp3=require('../services/original-engines/xp3.cjs');
const {buildPsb}=require('./helpers/psb-writer.cjs');

function rng(seed){let s=seed>>>0;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s;};}
function randomScheme(seed){const r=rng(seed),perm=n=>{const a=[...Array(n).keys()];for(let i=n-1;i>0;i--){const j=r()%(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
 return {prolog:perm(3),odd:perm(6),even:perm(8),mask:0x3ff,offset:0x9b,controlBlock:new Uint32Array(0x400).map(()=>r()),r};}

test('VM: the filter is its own inverse and splits at (hash & mask) + offset',()=>{
 const s=randomScheme(7),cx=new vm.Cx(s),plain=Buffer.from('PSB\0'.repeat(400),'latin1'),hash=0x25c3eac3;
 const enc=cx.decrypt(hash,0,Buffer.from(plain));assert.notDeepStrictEqual(enc,plain);
 assert.deepStrictEqual(cx.decrypt(hash,0,Buffer.from(enc)),plain);
 assert.strictEqual(cx.boundary(hash),(hash&0x3ff)+0x9b);
 // Decrypting in two pieces gives the same bytes as in one.
 const a=cx.decrypt(hash,0,Buffer.from(enc)),b=Buffer.from(enc);cx.decrypt(hash,0,b,0,500);cx.decrypt(hash,500,b,500,b.length-500);assert.deepStrictEqual(a,b);
});

test('control block: found dword-aligned after its signature, stored inverted',()=>{
 const raw=Buffer.alloc(0x1000);for(let i=0;i<0x400;i++)raw.writeUInt32LE((i*2654435761)>>>0,i*4);vm.SIGNATURE.copy(raw,0);
 const expected=new Uint32Array(0x400).map((_,i)=>(~raw.readUInt32LE(i*4))>>>0);
 assert.deepStrictEqual(vm.findControlBlock(Buffer.concat([Buffer.alloc(0x124),raw,Buffer.alloc(16)])),expected);
 // Not on a dword boundary, or cut short: not a control block.
 assert.strictEqual(vm.findControlBlock(Buffer.concat([Buffer.alloc(0x123),raw])),null);
 assert.strictEqual(vm.findControlBlock(Buffer.concat([Buffer.alloc(0x124),raw.subarray(0,0x200)])),null);
});

test('solver: orders and boundary rule recovered from first bytes alone',{timeout:600000},()=>{
 const s=randomScheme(12345),cx=new vm.Cx(s),r=rng(99);
 const samples=[...Array(300)].map(()=>{const h=r();const [a]=cx.xcode(h),[b]=cx.xcode(((h>>>16)^h)>>>0);return {hash:h,k1:(a&0xff)||1,k2:(b&0xff)||1,split:cx.boundary(h)};});
 const got=vm.solve(s.controlBlock,samples);assert.ok(got,'solved');
 assert.strictEqual(got.mask,0x3ff);assert.strictEqual(got.offset,0x9b);
 const c2=new vm.Cx(got);for(let i=0;i<200;i++){const h=r(),x=Buffer.alloc(0x600,0x41),y=Buffer.alloc(0x600,0x41);cx.decrypt(h,0,x);c2.decrypt(h,0,y);assert.deepStrictEqual(y,x);}
});

// An XP3 whose entries carry the cx flag and an adlr hash.
const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;},u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;},u16=n=>{const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;};
const chunk=(tag,body)=>Buffer.concat([Buffer.from(tag,'latin1'),u64(body.length),body]);
function writeXp3(file,entries){const datas=[],index=[];let at=11+8;
 for(const {name,data,hash} of entries){const n=Buffer.from(name,'utf16le');
  index.push(chunk('File',Buffer.concat([chunk('info',Buffer.concat([u32(0x80000000),u64(data.length),u64(data.length),u16(name.length),n])),chunk('segm',Buffer.concat([u32(0),u64(at),u64(data.length),u64(data.length)])),chunk('adlr',u32(hash))])));
  datas.push(data);at+=data.length;}
 const idx=Buffer.concat(index);fs.writeFileSync(file,Buffer.concat([xp3.MAGIC,u64(at),...datas,Buffer.from([0]),u64(idx.length),idx]));}

test('whole archive: plug-in control block + unknown orders → scene text read back',{timeout:900000},()=>{
 const s=randomScheme(4242),cx=new vm.Cx(s),r=rng(7),dir=fs.mkdtempSync(path.join(os.tmpdir(),'cxvm-'));
 // The plug-in: some code, then the control block behind its signature.
 const raw=Buffer.alloc(0x1000);for(let i=0;i<0x400;i++)raw.writeUInt32LE((~s.controlBlock[i])>>>0,i*4);vm.SIGNATURE.copy(raw,0);
 const block=vm.findControlBlock(raw);fs.mkdirSync(path.join(dir,'plugin'));fs.writeFileSync(path.join(dir,'plugin','cxdec.tpm'),Buffer.concat([Buffer.alloc(0x400,0x90),raw]));
 const truth=new vm.Cx({...s,controlBlock:block}),entries=[];
 for(let i=0;i<70;i++){const hash=r(),doc={name:`scene${i}.ks`,scenes:[{label:'start',texts:[[null,null,[[null,`「今日は${i}番目の朝だ。」`],[null,`Morning ${i}.`],[null,`「今天是第${i}个早上。」`],[null,'']]],[null,null,[[null,'あ'.repeat(400+i)],[null,''],[null,''],[null,'']]]]}]};
  const plain=buildPsb(doc);entries.push({name:'e'+i,hash,data:truth.decrypt(hash,0,Buffer.from(plain))});}
 // Images too: only their magic is known.
 for(let i=0;i<60;i++){const hash=r(),png=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.alloc(900,i)]);entries.push({name:'img'+i,hash,data:truth.decrypt(hash,0,Buffer.from(png))});}
 const file=path.join(dir,'scn.xp3');writeXp3(file,entries);
 const result=worker.build(file);
 assert.strictEqual(result.docs.length,70);
 const texts=result.docs.flatMap(d=>d.scenes.flatMap(sc=>sc.rows.map(row=>row[0]+'|'+row[2]))).sort();
 assert.ok(texts.includes('「今日は5番目の朝だ。」|「今天是第5个早上。」'));
});

// E297 A: Hxv4 archives, read whole by the game's own cxdec plug-in while it runs (native/scncapture).
test('Hxv4 dump: 32-bit only, every engine call guarded, files saved where kirikiri-dump reads them',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','native','scncapture','ScnCapture.cpp'),'utf8');
 const block=src.slice(src.indexOf('E297 whole Hxv4 archives'),src.indexOf('// ---- scenes MeguLit asks for'));
 assert.match(block,/#if defined\(_M_IX86\)/);
 for(const fn of ['CallIndex','CallStream','CallNormalize','CallAppPath','GetCount','GetItem','ReadHead','FindPattern']){
  const at=block.search(new RegExp('[ *]'+fn+'\\('));assert.ok(at>=0,fn+' defined');
  const body=block.slice(block.indexOf('{',at),block.indexOf('{',at)+40);assert.match(body,/^\{\s*__try/,fn+' is guarded');}
 assert.match(block,/hx-%s-%llu\.scn/);
 assert.match(block,/hx-done-/,'runs once per archive');
 assert.match(src,/if \(InterlockedExchange\(&HxWanted, 0\)\) \{ LastAsk = GetTickCount\(\); DumpHx\(\);/,'on the game thread');
});

test('kirikiri-dump reads hx-*.scn files saved by the dump',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hxcap-')),game=fs.mkdtempSync(path.join(os.tmpdir(),'hxgame-'));
 process.env.MEGULIT_SCN_CAPTURE=root;
 try{
  const scenes=require('../services/original-engines/scenes.cjs'),dump=scenes.ENGINES['kirikiri-dump'],dir=dump.captureDir(game);fs.mkdirSync(dir,{recursive:true});
  const row=(ja,zh)=>[null,null,[[null,ja],[null,'Morning.'],[null,zh],[null,zh]]];
  const doc={name:'001_hx.ks',scenes:[{label:'a',texts:[row('「おはよう。」','「早上好。」'),row('「今日も暑いね。」','「今天也很热呢。」'),row('「そうだね。」','「是啊。」'),row('「行こうか。」','「走吧。」')]}]};
  fs.writeFileSync(path.join(dir,'hx-scn.xp3-20481.scn'),buildPsb(doc));
  const list=dump.scenes(game);assert.strictEqual(list.length,1);
  const parsed=dump.parse(list[0].read());assert.strictEqual(parsed.lines[0],'「おはよう。」');assert.strictEqual(parsed.zh[0],'「早上好。」');
 }finally{delete process.env.MEGULIT_SCN_CAPTURE;}
});
