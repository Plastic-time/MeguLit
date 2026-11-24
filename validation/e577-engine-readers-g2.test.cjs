'use strict';
/* E577–E579 NeXAS, Malie, ShiinaRio: readers built from public specs, tested on synthetic game folders
   (validation/helpers/engine-fixtures-g2.cjs). Each builds a Japanese game and a Chinese patch and checks 1:1 pairing.
   The Malie ciphers are also checked against vectors produced by GARbro's own ArcFormats.dll (1.5.44). */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const F={...require('./helpers/engine-fixtures.cjs'),...require('./helpers/engine-fixtures-g2.cjs')};
const scenes=require('../services/original-engines/scenes.cjs'),library=require('../core/library.cjs'),kit=require('../services/original-engines/kit.cjs');
const nexas=require('../services/original-engines/nexas.cjs'),malie=require('../services/original-engines/malie.cjs'),shiina=require('../services/original-engines/shiinario.cjs');
const tmp=t=>{const r=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'e577-'));t.after(()=>fs.rmSync(r,{recursive:true,force:true}));return r;};

test('kit: static Huffman in both bit orders, zstd / zlib by header, a PE resource',()=>{
 const data=Buffer.from('ababcabcdabcde'.repeat(20)+'あ','utf8');
 assert.deepEqual(kit.huffman(F.huffman(data),data.length),data);
 assert.deepEqual(kit.huffman(F.huffman(data,{order:'dword-msb'}),data.length,{order:'dword-msb'}),data);
 assert.deepEqual(kit.unpackAny(require('node:zlib').deflateSync(data)),data);
 if(typeof require('node:zlib').zstdCompressSync==='function')assert.deepEqual(kit.unpackAny(require('node:zlib').zstdCompressSync(data)),data);
 assert.equal(kit.unpackAny(Buffer.from('plain text')),null);
 assert.ok(kit.peResource(process.execPath,16)?.length>0,'node.exe has a version resource');assert.equal(kit.peResource(process.execPath,'EXEC'),null);
});

/* ---- NeXAS ------------------------------------------------------------------------------------------------------ */
const NJA=['','bg01','九条','@vkir0001「おはよう、@r兄@にい@さん」@k','朝の光が差し込む。@n静かな朝だ。','@hKujo_0100105@t0100行こう','教室へ行く','se_door'];
const NZH=['','bg01','九条','@vkir0001“早上好，@r哥@にい@哥”@k','晨光照了进来。@n安静的早晨。','@hKujo_0100105@t0100走吧','去教室','se_door'];
test('NeXAS: .bin string table in the three layouts, @ codes, speakers',()=>{
 const want=['九条','「おはよう、兄さん」','朝の光が差し込む。\n静かな朝だ。','行こう','教室へ行く'];
 for(const layout of ['v1','v2']){const r=nexas.parse(F.nexasBin(NJA,{layout,names:[2]}));assert.deepEqual(r.lines,want,layout);assert.deepEqual(r.anchors,['bg01','se_door']);assert.deepEqual(r.speakers,['九条']);}
 assert.deepEqual(nexas.parse(F.nexasBin(NJA,{layout:'ver',names:[2]})).lines,want);
 assert.deepEqual(nexas.parse(Buffer.from('not a script at all, just some bytes')).lines,[]);
});
test('NeXAS: script.pac (Huffman index, zlib / zstd / plain entries; old index) is recognised, update.pac overrides, a GBK patch pairs',t=>{
 const game=tmp(t),patch=tmp(t);
 F.writeTree(game,{'script.pac':F.nexasPac({'a01.bin':F.nexasBin(NJA,{names:[2]}),'a02.bin':F.nexasBin(['','二本目のテキストです。'])},{type:4}),
  'update.pac':F.nexasPac({'a02.bin':F.nexasBin(['','更新された二本目です。'])},{type:7,index:'old'}),'thumbnail.pac':F.nexasPac({'t.png':Buffer.from('PNG')},{type:0}),'game.exe':'MZ'});
 F.writeTree(patch,{'script.pac':F.nexasPac({'a01.bin':F.nexasBin(NZH,{names:[2],enc:F.gbk}),'a02.bin':F.nexasBin(['','更新的第二本。'],{enc:F.gbk})},{type:4})});
 assert.equal(library.engineOf(game)?.name,'NeXAS');assert.equal(scenes.detect(game),'nexas');
 const own=scenes.read('nexas',game);assert.deepEqual(own.map(s=>s.name),['a01.bin','a02.bin']);assert.deepEqual(own[1].lines,['更新された二本目です。']);
 const zh=scenes.ENGINES.nexas.archives(patch).map(s=>nexas.parse(s.read()));
 assert.deepEqual(own.map(s=>s.lines.length),zh.map(s=>s.lines.length));assert.equal(zh[0].lines[1],'“早上好，哥哥”');
 /* Softpal's "PAC " archives are not NeXAS */
 const sp=path.join(game,'data.pac');fs.writeFileSync(sp,Buffer.concat([Buffer.from('PAC '),Buffer.alloc(64)]));assert.equal(nexas.list(sp),null);
});
test('NeXAS: equal packed and unpacked length skips decompression for pack types 4 and 7, not type 3 (zlib) or type 6 (zstd)',t=>{
 const zlib=require('node:zlib');
 const base=F.nexasBin(['朝の光が差し込む。'],{layout:'v1'});
 let s=1;const noise=Buffer.alloc(600);for(let i=0;i<noise.length;i++){s=(Math.imul(s,1664525)+1013904223)>>>0;noise[i]=s>>>24;}
 const eqOf=compress=>{for(let p=0;p<30;p++){const head=Buffer.concat([base.subarray(0,base.length-8),Buffer.alloc(p,0x41)]);
  for(let k=0;k<noise.length;k++){const raw=Buffer.concat([head,noise.subarray(0,k)]);if(compress(raw).length===raw.length)return raw;}}
  throw Error('no equal-length sample');};
 const rawPac=(dir,type,payload,unpacked=payload.length)=>{const pac=path.join(dir,'script.pac');
  const nm=Buffer.alloc(0x40);nm.write('s01.bin','latin1');
  const hdr=Buffer.alloc(12);hdr.write('PAC\x32','latin1');hdr.writeUInt32LE(1,4);hdr.writeUInt32LE(type,8);
  const idx=Buffer.alloc(0x4c);nm.copy(idx,0);idx.writeUInt32LE(12+0x4c,0x40);idx.writeUInt32LE(unpacked,0x44);idx.writeUInt32LE(payload.length,0x48);
  fs.writeFileSync(pac,Buffer.concat([hdr,idx,payload]));return pac;};
 /* type 3 (zlib): packed size === unpacked size is still a zlib stream and must be inflated */
 const raw3=eqOf(b=>zlib.deflateSync(b));
 assert.equal(zlib.deflateSync(raw3).length,raw3.length);
 const g3=tmp(t);F.writeTree(g3,{'script.pac':F.nexasPac({'s01.bin':raw3},{type:3,index:'old'})});
 assert.deepEqual(scenes.read('nexas',g3)[0].lines,['朝の光が差し込む。']);
 /* type 6 (always zstd): packed size === unpacked size is still a zstd frame and must be decompressed */
 if(typeof zlib.zstdCompressSync==='function'){
  const raw6=eqOf(b=>zlib.zstdCompressSync(b)),packed6=zlib.zstdCompressSync(raw6);
  assert.equal(packed6.length,raw6.length);
  const g6=tmp(t);rawPac(g6,6,packed6,raw6.length);
  assert.deepEqual(scenes.read('nexas',g6)[0].lines,['朝の光が差し込む。']);
 }
 /* type 4 (DeflateOrNone) and type 7 (ZstdOrNone): equal size returns raw bytes without decompressing */
 for(const type of [4,7]){const g=tmp(t);rawPac(g,type,base);assert.deepEqual(scenes.read('nexas',g)[0].lines,['朝の光が差し込む。']);}
 /* default branch: a corrupt zstd-magic payload falls back to raw bytes instead of throwing */
 const gBad=tmp(t),badZstd=Buffer.from([0x28,0xb5,0x2f,0xfd,0xff,0xff,0xff,0xff]),pacBad=rawPac(gBad,7,badZstd,badZstd.length+10);
 assert.deepEqual(nexas.read(pacBad,nexas.list(pacBad)[0]),badZstd);
});
test('NeXAS: codes() counts the 4-byte length prefix so boundary scripts fall back to v1 and short buffers return empty',t=>{
 const u32=v=>{const b=Buffer.alloc(4);b.writeUInt32LE(v>>>0);return b;};
 /* valid v1 bare-codes script (36 bytes): codeCount=2 (<0x100) and op0=4 (>2), so table() probes at=4 first;
    4 + 4*8 === 36 would pass the old (len - at) / 8 check and throw instead of falling back to at=0 */
 const v1=Buffer.concat([u32(2),u32(4),u32(0),u32(0),u32(1),u32(2),Buffer.from([0]),F.sjis('朝の光だ。'),Buffer.from([0])]);
 assert.equal(v1.length,36);
 assert.deepEqual(nexas.parse(v1).lines,['朝の光だ。']);
 const g=tmp(t);F.writeTree(g,{'script.pac':F.nexasPac({'s01.bin':v1},{type:0,index:'old'})});
 assert.deepEqual(scenes.read('nexas',g)[0].lines,['朝の光だ。']);
 /* malformed boundary buffers across at=0, at=4, and VER layouts must return null / empty without throwing */
 const bad0=Buffer.alloc(16);bad0.writeUInt32LE(2,0);
 const bad4=Buffer.alloc(28);bad4.writeUInt32LE(1,0);bad4.writeUInt32LE(3,4);
 const badVer=Buffer.concat([Buffer.from('VER\0\0\0\0\0\0','latin1'),u32(0),u32(1),u32(0)]);
 for(const buf of [bad0,bad4,badVer]){assert.equal(nexas.table(buf),null);assert.deepEqual(nexas.parse(buf).lines,[]);}
});

/* ---- Malie ------------------------------------------------------------------------------------------------------ */
test('Malie: Camellia and CFI blocks match GARbro ArcFormats.dll; every exported scheme loads',()=>{
 const mk=()=>{const b=Buffer.alloc(64);for(let i=0;i<64;i++)b[i]=(i*37+11)&255;return b;};
 /* GARbro 1.5.44: new Camellia(key bytes).DecryptBlock(0x1230 + i, buf, i) and new CfiDecryptor(key, rot).DecryptBlock(...) */
 let b=mk();malie.camellia('7675682836697734683241407a412d35')(b,0x1230);
 assert.equal(b.toString('hex'),'c197eb4b0e9da34d5b2b0d0c603bd55e728afc5302455e1cf46c96bba8c3a3fde9fbb4aca3fff81fded7e777d58f0955f4436ff2311e99db5c0c367840f90bfd');
 const k=Buffer.alloc(32);for(let i=0;i<32;i++)k[i]=(0xa0+i*3)&255;b=mk();malie.cfi(k.toString('hex'),[1011250797,943941430,1114191147,1126839654])(b,0x1230);
 assert.equal(b.toString('hex'),'ff8d176cf7f73c7168e5a1346917a0d13b05c3077f472576ad60c9616474b5aca8d8a845465584e52ac0905d3dcb3248aa6330405aca2ce611456e4af47cff10');
 const raw=require('../services/original-engines/malie-schemes.json').schemes;assert.ok(Object.keys(raw).length>=40);assert.equal(malie.schemes().length,Object.keys(raw).length);
});
const MJA=['\x07\x08v_rin0001\0「行こう、\x07\x01兄\nにい\0さん」\x07\x04','朝の光が差し込む。\n静かな朝だ。','\x07\x0c1\0、目を覚ませ。','　'];
const MZH=['\x07\x08v_rin0001\0“走吧，\x07\x01哥\nにい\0哥”\x07\x04','晨光照了进来。\n安静的早晨。','\x07\x0c1\0，醒醒。','　'];
test('Malie: EXEC message table in order, voice / ruby / name codes; header walk and tail search',()=>{
 const want=['「行こう、兄さん」','朝の光が差し込む。\n静かな朝だ。','、目を覚ませ。'];
 assert.deepEqual(malie.parse(F.malieExec(MJA)).lines,want);
 /* header walk must skip both data and code section lengths when trailing padding (< 16 bytes) prevents the EOF tail search */
 assert.deepEqual(malie.parse(Buffer.concat([F.malieExec(MJA),Buffer.alloc(8)])).lines,want);
 assert.deepEqual(malie.parse(Buffer.concat([F.malieExec(MJA),Buffer.alloc(15)])).lines,want);
 /* an empty table (n=0) at the header-walk landing point must fall through to the EOF tail search */
 const base=F.malieExec(MJA),emptyPrefix=F.malieExec([]),hdr=emptyPrefix.subarray(0,emptyPrefix.length-8),realTable=base.subarray(hdr.length);
 const fakeHead=Buffer.alloc(8);fakeHead.writeUInt32LE(realTable.length,4);
 assert.deepEqual(malie.parse(Buffer.concat([hdr,fakeHead,realTable])).lines,want);
 /* a build whose header this reader does not know: the table that ends the file is found anyway */
 assert.deepEqual(malie.parse(Buffer.concat([Buffer.from([9,9,9,9,0,0,0,0x80]),F.malieExec(MJA).subarray(4)])).lines,want);
 assert.deepEqual(malie.parse(Buffer.alloc(100,1)).lines,[]);
});
test('Malie: an encrypted data.dat (LIBP, a known title key) is recognised and read; a plain LIB patch pairs',t=>{
 const schemes=require('../services/original-engines/malie-schemes.json').schemes,[title,s]=Object.entries(schemes).find(([,v])=>v.cipher==='camellia');
 const game=tmp(t),patch=tmp(t);
 F.writeTree(game,{'data/data.dat':F.malieLibp({'system/exec.dat':F.malieExec(MJA),'system/config.txt':Buffer.from('x'),'bg/bg01.mgf':Buffer.alloc(3000,7)},{key:s.key,align:s.align}),'game.exe':'MZ'});
 F.writeTree(patch,{'data/patch.lib':F.malieLib({'exec.dat':F.malieExec(MZH)})});
 assert.equal(malie.index(path.join(game,'data','data.dat')).scheme,title);
 assert.equal(library.engineOf(game)?.name,'Malie');assert.equal(scenes.detect(game),'malie');
 const own=scenes.read('malie',game);assert.equal(own.length,1);assert.equal(own[0].lines[1],'朝の光が差し込む。\n静かな朝だ。');
 const zh=scenes.ENGINES.malie.archives(patch).map(x=>malie.parse(x.read()));assert.equal(zh[0].lines.length,own[0].lines.length);assert.equal(zh[0].lines[0],'“走吧，哥哥”');
 /* a key no scheme knows: the archive is not opened */
 const other=path.join(game,'data','data2.dat');fs.writeFileSync(other,F.malieLibp({'exec.dat':F.malieExec(MJA)},{key:'00112233445566778899aabbccddeeff'}));assert.equal(malie.index(other),null);
});
test('Malie: an adapter pack carries a new title key (params malie-scheme)',t=>{
 const packs=require('../services/adapter-packs.cjs'),key='00112233445566778899aabbccddeeff',orig=packs.params;
 t.after(()=>{packs.params=orig;});const value={title:'New Title',cipher:'camellia',key,align:1024};const list=[{value,pack:'t'}];packs.params=target=>target==='malie-scheme'?list:[];
 const game=tmp(t);F.writeTree(game,{'data.dat':F.malieLibp({'exec.dat':F.malieExec(MJA)},{key,align:1024})});
 assert.equal(malie.index(path.join(game,'data.dat')).scheme,'New Title');assert.equal(scenes.read('malie',game)[0].lines.length,3);
 assert.ok(packs.CAPABILITIES.includes('params:malie-scheme'));
});
test('Malie: list() cache invalidates when malie-scheme adapter packs or file mtime change in the same process',t=>{
 const packs=require('../services/adapter-packs.cjs'),kit=require('../services/original-engines/kit.cjs'),orig=packs.params;
 t.after(()=>{packs.params=orig;});
 const keyA='00112233445566778899aabbccddeeff',keyB='ffeeddccbbaa99887766554433221100';
 const game=tmp(t),arc=path.join(game,'data.dat'),tSec=1700000000000;
 const blobA=F.malieLibp({'exec.dat':F.malieExec(MJA)},{key:keyA,align:1024});
 const blobB=F.malieLibp({'exec.dat':F.malieExec(MJA)},{key:keyB,align:1024});
 assert.equal(blobA.length,blobB.length);
 F.writeTree(game,{'data.dat':blobA,'game.exe':'MZ'});
 fs.utimesSync(arc,new Date(tSec+100),new Date(tSec+100));
 /* 1. No pack: list() caches null */
 packs.params=()=>[];
 assert.equal(malie.list(arc),null);
 assert.equal(scenes.read('malie',game).length,0);
 /* 2. Wrong pack (count 1) still returns null */
 const wrong=[{value:{title:'Wrong',cipher:'camellia',key:keyB,align:1024},pack:'m@1'}];
 packs.params=target=>target==='malie-scheme'?wrong:[];
 assert.equal(malie.list(arc),null);
 /* 3. Replacing with right pack (same count 1, archive untouched) immediately opens */
 const right=[{value:{title:'Right',cipher:'camellia',key:keyA,align:1024},pack:'m@2'}];
 packs.params=target=>target==='malie-scheme'?right:[];
 assert.equal(malie.list(arc)?.scheme,'Right');
 assert.equal(scenes.read('malie',game)[0].lines.length,3);
 /* 4. Repeated list() with unchanged pack & file reuses cache without re-reading the archive */
 const origRead=kit.readAt;let reads=0;kit.readAt=(...a)=>{reads++;return origRead(...a);};
 try{assert.equal(malie.list(arc)?.scheme,'Right');assert.equal(reads,0);}finally{kit.readAt=origRead;}
 /* 5. Same-size overwrite within the same second (different ms) invalidates list() */
 fs.writeFileSync(arc,blobB);
 fs.utimesSync(arc,new Date(tSec+600),new Date(tSec+600));
 assert.equal(malie.list(arc),null);
 fs.writeFileSync(arc,blobA);
 fs.utimesSync(arc,new Date(tSec+900),new Date(tSec+900));
 assert.equal(malie.list(arc)?.scheme,'Right');
 /* 6. Removing pack invalidates cached list */
 packs.params=()=>[];
 assert.equal(malie.list(arc),null);
});
test('Malie: readDec, LIBU and LIBP decrypt entries across 2 GiB and past 4 GiB without 32-bit offset truncation',t=>{
 const crypto=require('node:crypto'),kit=require('../services/original-engines/kit.cjs');
 const schemes=require('../services/original-engines/malie-schemes.json').schemes;
 const [,camScheme]=Object.entries(schemes).find(([,v])=>v.cipher==='camellia');
 const [,cfiScheme]=Object.entries(schemes).find(([,v])=>v.cipher==='cfi');
 const rotl=(x,n)=>{n&=31;return n?((x<<n)|(x>>>(32-n)))>>>0:x>>>0;},rotr=(x,n)=>{n&=31;return n?((x>>>n)|(x<<(32-n)))>>>0:x>>>0;};
 const encCamAt=(buf,key,at)=>{
  const pad=Math.ceil(buf.length/16)*16,plain=Buffer.alloc(pad);buf.copy(plain);
  const c=crypto.createCipheriv('camellia-128-ecb',Buffer.from(key,'hex'),null);c.setAutoPadding(false);
  const e=Buffer.concat([c.update(plain),c.final()]);
  for(let i=0;i<e.length;i+=16){const r=(((at+i)>>>4)&15)+16;
   e.writeUInt32LE(rotr(e.readUInt32LE(i),r),i);e.writeUInt32LE(rotl(e.readUInt32LE(i+4),r),i+4);
   e.writeUInt32LE(rotr(e.readUInt32LE(i+8),r),i+8);e.writeUInt32LE(rotl(e.readUInt32LE(i+12),r),i+12);}
  return e;};
 const encCfiAt=(buf,key,rot,at)=>{
  const pad=Math.ceil(buf.length/16)*16,e=Buffer.alloc(pad);buf.copy(e);
  const k=Buffer.from(key,'hex'),K=i=>k[i&31]^0xa5,R=rot.map(x=>x>>>0);
  for(let i=0;i<e.length;i+=16){const off=at+i,b=off>>>4;
   e.writeUInt32LE((rotl(e.readUInt32LE(i),K(b+12))^rotr(R[0],K(b)))>>>0,i);
   e.writeUInt32LE((rotr(e.readUInt32LE(i+4),K(b+15))^rotl(R[1],K(b+3)))>>>0,i+4);
   e.writeUInt32LE((rotl(e.readUInt32LE(i+8),K(b-14))^rotr(R[2],K(b+6)))>>>0,i+8);
   e.writeUInt32LE((rotr(e.readUInt32LE(i+12),K(b-11))^rotl(R[3],K(b+9)))>>>0,i+12);
   const o=off&15,first=e[i+o];for(let j=0;j<16;j++)if(j!==o)e[i+j]^=first;}
  return e;};
 const exec=F.malieExec(MJA),want=['「行こう、兄さん」','朝の光が差し込む。\n静かな朝だ。','、目を覚ませ。'];
 const origReadAt=kit.readAt,origSize=kit.size;
 const virtuals=new Map();
 t.after(()=>{kit.readAt=origReadAt;kit.size=origSize;});
 kit.size=f=>virtuals.has(f)?virtuals.get(f).size:origSize(f);
 kit.readAt=(f,off,len)=>{
  if(!virtuals.has(f))return origReadAt(f,off,len);
  const v=virtuals.get(f);
  v.reads.push({off,len});
  if(off<0||len<=0)throw new RangeError('bad virtual read: '+off+'/'+len);
  const out=Buffer.alloc(len);
  for(const seg of v.segs){
   const s=Math.max(off,seg.at),e=Math.min(off+len,seg.at+seg.data.length);
   if(e>s)seg.data.copy(out,s-off,s-seg.at,e-seg.at);}
  return out;};
 // 1. Encrypted LIBU with entries crossing 2 GiB, past 2 GiB, and past 4 GiB (all unaligned mod 16)
 const libuOffsets=[0x7ffffff5,0x80001015,0x100002025];
 const libuPlainHead=Buffer.alloc(16+libuOffsets.length*0x50);
 libuPlainHead.write('LIBU',0,'latin1');libuPlainHead.writeInt32LE(libuOffsets.length,8);
 const libuSegs=[];
 libuOffsets.forEach((off,idx)=>{
  const p=16+idx*0x50;Buffer.from(`e${idx}.bin`,'utf16le').copy(libuPlainHead,p,0,0x44);
  libuPlainHead.writeUInt32LE(exec.length,p+0x44);libuPlainHead.writeBigInt64LE(BigInt(off),p+0x48);
  const aligned=Math.floor(off/16)*16,lead=off-aligned;
  const padded=Buffer.concat([Buffer.alloc(lead,0xaa),exec]);
  libuSegs.push({at:aligned,data:encCamAt(padded,camScheme.key,aligned)});
 });
 libuSegs.unshift({at:0,data:encCamAt(libuPlainHead,camScheme.key,0)});
 const vLibu='virtual:malie-large.libu';
 virtuals.set(vLibu,{size:0x100010000,segs:libuSegs,reads:[]});
 const libuEntries=malie.index(vLibu);
 assert.ok(libuEntries&&libuEntries.length===3);
 for(const e of libuEntries)assert.deepEqual(malie.parse(malie.read(vLibu,e)).lines,want,e.name);
 // 2. Encrypted LIBP with an entry placed past 4 GiB (offset table entry = 0x400000 -> +4 GiB)
 const align=camScheme.align||0x1000;
 const libpIdx=Buffer.concat([
  Buffer.concat([Buffer.alloc(0x14),Buffer.from([0,0,0,0]),Buffer.from([1,0,0,0]),Buffer.from([1,0,0,0])]),
  (()=>{const b=Buffer.alloc(0x20);b.write('exec.dat',0,'latin1');b.writeInt32LE(0x10000,0x14);b.writeInt32LE(0,0x18);b.writeUInt32LE(exec.length,0x1c);return b;})()
 ]);
 const libpHead=Buffer.alloc(16);libpHead.write('LIBP',0,'latin1');libpHead.writeInt32LE(2,4);libpHead.writeInt32LE(1,8);
 const offTab=Buffer.alloc(4);offTab.writeUInt32LE(0x400000,0);
 const libpBase=Math.ceil((16+libpIdx.length+4)/align)*align;
 const libpEntryAt=libpBase+0x400000*1024;
 const vLibp='virtual:malie-large.libp';
 virtuals.set(vLibp,{size:libpEntryAt+exec.length+64,reads:[],segs:[
  {at:0,data:encCamAt(Buffer.concat([libpHead,libpIdx,offTab]),camScheme.key,0)},
  {at:libpEntryAt,data:encCamAt(exec,camScheme.key,libpEntryAt)},
 ]});
 const libpEntries=malie.index(vLibp);
 assert.ok(libpEntries&&libpEntries.length===1);
 assert.equal(libpEntries[0].offset,libpEntryAt);
 assert.deepEqual(malie.parse(malie.read(vLibp,libpEntries[0])).lines,want);
 // 3. CFI cipher at >2 GiB and >4 GiB + invalid/empty readDec bounds
 const cfiDec=malie.cfi(cfiScheme.key,cfiScheme.rotate);
 const vCfi='virtual:malie-large.cfi';
 const cfiSegs=[0x80000013,0x100000037].map(off=>{
  const aligned=Math.floor(off/16)*16,lead=off-aligned;
  return {off,at:aligned,data:encCfiAt(Buffer.concat([Buffer.alloc(lead,0x55),exec]),cfiScheme.key,cfiScheme.rotate,aligned)};
 });
 virtuals.set(vCfi,{size:0x100010000,reads:[],segs:cfiSegs});
 for(const s of cfiSegs)assert.deepEqual(malie.parse(malie.readDec(vCfi,cfiDec,s.off,exec.length)).lines,want);
 const before=virtuals.get(vCfi).reads.length;
 assert.equal(malie.readDec(vCfi,cfiDec,-16,16).length,0);
 assert.equal(malie.readDec(vCfi,cfiDec,0,0).length,0);
 assert.equal(malie.readDec(vCfi,cfiDec,0,-4).length,0);
 assert.equal(malie.readDec(vCfi,cfiDec,Number.MAX_SAFE_INTEGER,16).length,0);
 assert.equal(malie.readDec(vCfi,cfiDec,Number.MAX_SAFE_INTEGER-8,8).length,0);
 assert.equal(virtuals.get(vCfi).reads.length,before);
});
test('Malie: truncated LIB / LIBU / LIBP headers and indexes return null instead of throwing and do not abort discovery',t=>{
 const schemes=require('../services/original-engines/malie-schemes.json').schemes,[,cam]=Object.entries(schemes).find(([,v])=>v.cipher==='camellia');
 const d=tmp(t);
 /* truncated LIB\0 (48 bytes with count=1): 0x30*1 <= 48 passed the old check, leaving idx 16 bytes short */
 const badLib=Buffer.alloc(48);badLib.write('LIB\0',0,'latin1');badLib.writeInt16LE(1,8);
 const badLibFile=path.join(d,'bad.lib');fs.writeFileSync(badLibFile,badLib);
 assert.equal(malie.index(badLibFile),null);
 /* truncated LIBU (48 bytes with count=2): idx needs 16 + 2*0x50 = 176 bytes */
 const badLibu=Buffer.alloc(48);badLibu.write('LIBU',0,'latin1');badLibu.writeInt32LE(2,8);
 const badLibuFile=path.join(d,'badu.lib');fs.writeFileSync(badLibuFile,badLibu);
 assert.equal(malie.index(badLibuFile),null);
 /* truncated encrypted LIBP (32 bytes, header declares count=4, noff=2) */
 const fullLibp=F.malieLibp({'system/exec.dat':F.malieExec(MJA)},{key:cam.key,align:cam.align});
 const badLibpFile=path.join(d,'badp.dat');fs.writeFileSync(badLibpFile,fullLibp.subarray(0,32));
 assert.equal(malie.index(badLibpFile),null);
 /* end-to-end: a truncated archive sorting before a valid archive must not abort probe() or scenes.read('malie') */
 const game=tmp(t);
 F.writeTree(game,{'data/data0.lib':badLibu,'data/data1.lib':F.malieLib({'exec.dat':F.malieExec(MJA)}),'game.exe':'MZ'});
 assert.equal(malie.probe(game),true);
 assert.equal(library.engineOf(game)?.name,'Malie');
 assert.deepEqual(scenes.read('malie',game)[0].lines,['「行こう、兄さん」','朝の光が差し込む。\n静かな朝だ。','、目を覚ませ。']);
});

/* ---- ShiinaRio -------------------------------------------------------------------------------------------------- */
const SJA=';【第一話】\r\n$L_BG,b\\bg01,0\r\n$VOICE,v\\kir0001,0,0,0\r\n【霧子】\r\n「おはよう」\r\n朝の光が差し込む。\r\n\r\n①ありがとう①\r\n';
const SZH=';【第一話】\r\n$L_BG,b\\bg01,0\r\n$VOICE,v\\kir0001,0,0,0\r\n【雾子】\r\n“早上好”\r\n晨光照了进来。\r\n\r\n①谢谢①\r\n';
test('ShiinaRio: YH1 / YPK / YLZ entries (with and without the KM XOR), scenario TXT grammar',()=>{
 const text=F.sjis(SJA);
 for(const tag of ['YPK','YLZ','YH1'])for(const km of [false,true])assert.deepEqual(shiina.unpackEntry(F.warcEntry(text,tag,{km})),text,tag+(km?' km':''));
 const r=shiina.parse(text);assert.deepEqual(r.lines,['霧子','「おはよう」','朝の光が差し込む。','①ありがとう①']);assert.deepEqual(r.anchors,['$L_BG,b\\bg01,0','$VOICE,v\\kir0001,0,0,0']);
 assert.deepEqual(shiina.parse(Buffer.from([0,1,2,3,4,5,6,7,8,9,1,2,3,4,5,6,7,8])).lines,[]);
});
test('ShiinaRio: WARC 1.1 read here; a keyed WARC goes through the GARbro cache; a GBK patch pairs',t=>{
 const game=tmp(t),patch=tmp(t),cache=tmp(t);const prev=process.env.MEGULIT_GARBRO_CACHE;process.env.MEGULIT_GARBRO_CACHE=cache;t.after(()=>{if(prev===undefined)delete process.env.MEGULIT_GARBRO_CACHE;else process.env.MEGULIT_GARBRO_CACHE=prev;});
 F.writeTree(game,{'GAME_T.WAR':F.warc11({'S001.TXT':F.warcEntry(F.sjis(SJA),'YLZ',{km:true}),'S002.TXT':F.warcEntry(F.sjis('二話目の始まり。\r\n'),'YH1')}),'GAME_S.WAR':F.warc11({'START.SCN':F.warcEntry(Buffer.from([1,0,0x10,0x41,0]),'YPK')}),'GAME.EXE':'MZ'});
 F.writeTree(patch,{'GAME_T.WAR':F.warc11({'S001.TXT':F.warcEntry(F.gbk(SZH),'YPK'),'S002.TXT':F.warcEntry(F.gbk('第二话的开始。\r\n'),'YPK')})});
 assert.equal(library.engineOf(game)?.name,'ShiinaRio');assert.equal(scenes.detect(game),'shiinario');
 const own=scenes.read('shiinario',game);assert.deepEqual(own.map(s=>s.name),['GAME_T.WAR/S001.TXT','GAME_T.WAR/S002.TXT']);
 const zh=scenes.ENGINES.shiinario.archives(patch).map(s=>shiina.parse(s.read()));assert.deepEqual(own.map(s=>s.lines.length),zh.map(s=>s.lines.length));assert.equal(zh[0].lines[1],'“早上好”');
 /* WARC 1.7: GARbro's scheme database opened it before (its done.json in the cache): the TXT it wrote is parsed here */
 const keyed=tmp(t),war=path.join(keyed,'SAGA_T.WAR');fs.writeFileSync(war,F.warcKeyed(7));fs.writeFileSync(path.join(keyed,'SAGA.EXE'),'MZ');
 const garbro=require('../services/original-engines/garbro.cjs'),dir=garbro.cacheDir(war);fs.mkdirSync(path.join(dir,'scn'),{recursive:true});fs.writeFileSync(path.join(dir,'scn','S001.TXT'),F.sjis(SJA));
 fs.writeFileSync(path.join(dir,'done.json'),JSON.stringify({archive:war,files:['scn\\S001.TXT'],version:garbro.version()}));
 assert.equal(shiina.list(war),null);assert.equal(shiina.header(war).version,170);
 const viaGarbro=scenes.read('shiinario',keyed);assert.equal(viaGarbro.length,1);assert.deepEqual(viaGarbro[0].lines,['霧子','「おはよう」','朝の光が差し込む。','①ありがとう①']);
});
test('ShiinaRio: same-named TXT scripts across multiple WARC archives (direct and GARbro cache) do not overwrite each other',t=>{
 const game=tmp(t),cache=tmp(t),prev=process.env.MEGULIT_GARBRO_CACHE;process.env.MEGULIT_GARBRO_CACHE=cache;t.after(()=>{if(prev===undefined)delete process.env.MEGULIT_GARBRO_CACHE;else process.env.MEGULIT_GARBRO_CACHE=prev;});
 F.writeTree(game,{
  'CH1_T.WAR':F.warc11({'S001.TXT':F.warcEntry(F.sjis('第一章の始まり。\r\n'),'YPK'),'DATA.BIN':F.warcEntry(Buffer.from('bin'),'YPK')}),
  'CH2_T.WAR':F.warc11({'S001.TXT':F.warcEntry(F.sjis('第二章の始まり。\r\n'),'YPK')}),
  'GAME.EXE':'MZ',
 });
 const own=scenes.read('shiinario',game);
 assert.deepEqual(own.map(s=>s.name),['CH1_T.WAR/S001.TXT','CH2_T.WAR/S001.TXT']);
 assert.deepEqual(own.map(s=>s.lines),[['第一章の始まり。'],['第二章の始まり。']]);

 const keyed=tmp(t),w1=path.join(keyed,'P1_T.WAR'),w2=path.join(keyed,'P2_T.WAR');
 fs.writeFileSync(w1,F.warcKeyed(7));fs.writeFileSync(w2,F.warcKeyed(7));fs.writeFileSync(path.join(keyed,'GAME.EXE'),'MZ');
 const garbro=require('../services/original-engines/garbro.cjs');
 for(const [war,line] of [[w1,'補完一話目。\r\n'],[w2,'補完二話目。\r\n']]){
  const d=garbro.cacheDir(war);fs.mkdirSync(path.join(d,'scn'),{recursive:true});fs.writeFileSync(path.join(d,'scn','S001.TXT'),F.sjis(line));
  fs.writeFileSync(path.join(d,'done.json'),JSON.stringify({archive:war,files:['scn\\S001.TXT','scn\\NOTE.BIN'],version:garbro.version()}));
 }
 const cached=scenes.read('shiinario',keyed);
 assert.deepEqual(cached.map(s=>s.name),['P1_T.WAR/scn/S001.TXT','P2_T.WAR/scn/S001.TXT']);
 assert.deepEqual(cached.map(s=>s.lines),[['補完一話目。'],['補完二話目。']]);
});
test('ShiinaRio: base and update WARC 1.1 archives keep both copies of same-named S001.TXT under their archive names',t=>{
 const game=tmp(t);
 F.writeTree(game,{
  'GAME_T.WAR':F.warc11({'S001.TXT':F.warcEntry(F.sjis('旧い台詞。\r\n'),'YPK'),'S002.TXT':F.warcEntry(F.sjis('二話目の台詞。\r\n'),'YPK')}),
  'GAME_U1.WAR':F.warc11({'S001.TXT':F.warcEntry(F.sjis('新しい台詞。\r\n'),'YPK')}),
  'GAME.EXE':'MZ',
 });
 const own=scenes.read('shiinario',game);
 assert.deepEqual(own.map(s=>s.name),['GAME_T.WAR/S001.TXT','GAME_T.WAR/S002.TXT','GAME_U1.WAR/S001.TXT']);
 assert.deepEqual(own.map(s=>s.lines),[['旧い台詞。'],['二話目の台詞。'],['新しい台詞。']]);
});
test('ShiinaRio: identical S001.TXT across two WARC 1.1 archives are both kept under distinct archive-qualified names',t=>{
 const game=tmp(t),same=F.sjis('同じ内容の台詞。\r\n');
 F.writeTree(game,{
  'CHIP_T.WAR':F.warc11({'S001.TXT':F.warcEntry(same,'YPK')}),
  'CHIP_E3.WAR':F.warc11({'S001.TXT':F.warcEntry(same,'YPK')}),
  'GAME.EXE':'MZ',
 });
 const own=scenes.read('shiinario',game);
 assert.deepEqual(own.map(s=>s.name),['CHIP_E3.WAR/S001.TXT','CHIP_T.WAR/S001.TXT']);
 assert.deepEqual(own.map(s=>s.lines),[['同じ内容の台詞。'],['同じ内容の台詞。']]);
});
