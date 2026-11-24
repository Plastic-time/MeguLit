'use strict';
/* E573 the shared engine kit: every piece the readers and the adapter-pack runtime now take from one place */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const kit=require('../services/original-engines/kit.cjs'),F=require('./helpers/engine-fixtures.cjs');
const tmp=t=>{const r=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'e573-'));t.after(()=>fs.rmSync(r,{recursive:true,force:true}));return r;};

test('codepage: Shift-JIS originals, GBK patches (half-width katakana counts against Shift-JIS)',()=>{
 assert.equal(kit.codepage(F.sjis('「おはよう」と言った。')),'shift_jis');
 assert.equal(kit.codepage(F.gbk('去学园')),'gbk');assert.equal(kit.codepage(F.gbk('“走吧”，她说。')),'gbk');
 assert.equal(kit.decoder([F.gbk('风吹过。')]).decode(F.gbk('风吹过。')),'风吹过。');
});
test('lzss: the common variant and its options (fill, start, msb flags, 0 = literal, length bits)',()=>{
 assert.equal(kit.lzss(Buffer.from([0x07,0x61,0x62,0x63,0xee,0xf0]),6).toString('latin1'),'abcabc');
 /* window filled with 0xFF: a reference into the untouched window gives 0xFF */
 assert.deepEqual([...kit.lzss(Buffer.from([0x00,0x00,0x00]),3,{fill:0xff})],[0xff,0xff,0xff]);
 /* MSB-first flags, 0 = literal, start 0 */
 assert.equal(kit.lzss(Buffer.from([0x1f,0x61,0x62,0x63,0x00,0x00]),6,{msb:true,zeroLiteral:true,start:0}).toString('latin1'),'abcabc');
 /* unknown output size: bounded by the input, never a 64 MB allocation */
 assert.ok(kit.lzss(Buffer.from([0xff,1,2,3,4,5,6,7,8])).length===8);
});
test('xor / xorDword / rol: byte keys, growing dword keys',()=>{
 assert.deepEqual([...kit.xor(Buffer.from([1,2,3]),[0xff,0x0f])],[0xfe,0x0d,0xfc]);
 const plain=Buffer.alloc(16);for(let i=0;i<4;i++)plain.writeUInt32LE(i*0x11111111,i*4);
 const enc=Buffer.alloc(16);let x=0xdeadbeef;for(let i=0;i<4;i++){enc.writeUInt32LE((plain.readUInt32LE(i*4)^x)>>>0,i*4);x=(x+7)>>>0;}
 assert.deepEqual(kit.xorDword(enc,0xdeadbeef,7),plain);assert.equal(kit.rol(0x81,1),0x03);assert.equal(kit.ror(0x03,1),0x81);
});
test('table: fixed names, length-prefixed names with a cipher, sizes from the next offset, magic and bounds',t=>{
 const d=tmp(t);
 /* "PAC "-style: count at 8, entries at 16, {char name[8], u32 size, u32 offset} */
 const h=Buffer.alloc(16+16*2);h.write('PACK','latin1');h.writeUInt32LE(2,8);['a.txt','b.txt'].forEach((n,i)=>{h.write(n,16+i*16,'latin1');h.writeUInt32LE(3,16+i*16+8);h.writeUInt32LE(48+i*3,16+i*16+12);});
 fs.writeFileSync(path.join(d,'fixed'),Buffer.concat([h,Buffer.from('abcdef')]));
 const l=kit.table(path.join(d,'fixed'),{magic:'PACK',count:{at:8,type:'u32le'},entries:16,fields:[{name:'name',type:'cstr',size:8},{name:'size',type:'u32le'},{name:'offset',type:'u32le'}]});
 assert.deepEqual(l.map(e=>[e.name,kit.entryRead(path.join(d,'fixed'),e).toString()]),[['a.txt','abc'],['b.txt','def']]);
 /* length-prefixed, names NOT-ciphered, size from the next entry */
 const names=['x','yy'].map(n=>Buffer.from([...Buffer.from(n)].map(c=>~c&255)));const idx=[];let off=8+names.reduce((a,b)=>a+5+b.length,0);
 for(const nb of names){const e=Buffer.alloc(4);e.writeUInt32LE(off,0);idx.push(e,Buffer.from([nb.length]),nb);off+=2;}
 const head=Buffer.alloc(8);head.write('ARCX','latin1');head.writeUInt32LE(2,4);fs.writeFileSync(path.join(d,'pstr'),Buffer.concat([head,...idx,Buffer.from('1122')]));
 const l2=kit.table(path.join(d,'pstr'),{magic:'ARCX',count:{at:4,type:'u32le'},entries:8,fields:[{name:'offset',type:'u32le'},{name:'name',type:'pstr8'}],nameCipher:'not',sizeFrom:'next'});
 assert.deepEqual(l2.map(e=>[e.name,e.size]),[['x',2],['yy',2]]);
 assert.equal(kit.table(path.join(d,'fixed'),{magic:'NOPE',count:{at:8,type:'u32le'},entries:16,fields:[]}),null);
});
test('text models: string table, pointer table, opcode walk, line grammar, generic scan',()=>{
 const strs=Buffer.concat([F.sjis('一行目'),Buffer.from([0]),F.sjis('二行目'),Buffer.from([0])]),offs=Buffer.alloc(8);offs.writeInt32LE(0,0);offs.writeInt32LE(7,4);
 const b=Buffer.concat([offs,strs]);assert.deepEqual(kit.stringTable(b,{offsetsAt:0,count:2,base:8}).map(x=>new TextDecoder('shift_jis').decode(x)),['一行目','二行目']);
 const code=Buffer.concat([Buffer.from([0x01,0x00,0x05,0x00,0x00,0x00]),Buffer.from([0x02,0x00]),F.sjis('台詞'),Buffer.from([0,0x03,0x00])]);
 const got=[];kit.opcodeWalk(code,op=>({1:'i',2:'z',3:[]})[op],(op,s)=>{if(s.length)got.push([op,new TextDecoder('shift_jis').decode(s[0])]);});assert.deepEqual(got,[[2,'台詞']]);
 const g=kit.lineGrammar('*label\n;comment\n#あかね\nおはよう[r]\n[iscript]\nx=1\n[endscript]\n',{name:/^#(.*)$/});assert.deepEqual(g.lines,['あかね','おはよう']);
 assert.deepEqual(kit.decodeRuns(Buffer.concat([Buffer.from('cmd\0'),F.sjis('「こんにちは」と言った。')])),['「こんにちは」と言った。']);
});

test('E575 shared pieces: MSVC rand, key streams, nibble swap, record streams, CMVS-style LZSS, GBK generic scan',()=>{
 const r=kit.msvcRand(1);assert.deepEqual([r(),r(),r()],[41,18467,6334]);/* the MSVC CRT sequence for srand(1) */
 assert.deepEqual([...kit.xorStream(Buffer.from([1,2,3,4]),()=>0xff,{start:1,stride:2})],[1,0xfd,3,0xfb]);
 assert.deepEqual([...kit.nibbleSwap(Buffer.from([0x12,0xab]))],[0x21,0xba]);
 const recs=kit.records(Buffer.from([2,0,0x61,0x62,1,0,0x63,0]),0,(b,p)=>{const n=b.readUInt16LE(p);return n?{text:b.toString('latin1',p+2,p+2+n),next:p+2+n}:null;});
 assert.deepEqual(recs.map(x=>x.text),['ab','c']);
 /* CMVS PS2A LZSS: 2 KB window from 0x7DF, offset lo | (hi & 0xE0) << 3, length (hi & 0x1F) + 2 */
 assert.equal(kit.lzss(Buffer.from([0x07,0x61,0x62,0x63,0xdf,0xe1]),6,{window:0x800,start:0x7df,lenBits:5,minMatch:2}).toString('latin1'),'abcabc');
 assert.ok(kit.decodeRuns(Buffer.concat([Buffer.from('cmd\0'),F.gbk('那封信寄到的时候，是一个晴朗的午后。')])).includes('那封信寄到的时候，是一个晴朗的午后。'));
});

/* E630 game-maker pieces: PE overlay, windowed signature scan, string-pool lines, generic text runs */
test('kit: peOverlay, scan, poolLines, textRuns (E630)',t=>{const F3=require('./helpers/engine-fixtures-f3.cjs'),kit2=require('../services/original-engines/kit.cjs');
 const d=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'e630k-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 const exe=path.join(d,'a.exe');fs.writeFileSync(exe,F3.pe(Buffer.from('xxDPMXyyDPMX')));assert.deepEqual(kit2.peOverlay(exe),{at:0x400,size:12});
 const plain=path.join(d,'b.exe');fs.writeFileSync(plain,F3.pe());assert.equal(kit2.peOverlay(plain),null);fs.writeFileSync(path.join(d,'c.bin'),'MZ');assert.equal(kit2.peOverlay(path.join(d,'c.bin')),null);
 assert.deepEqual(kit2.scan(exe,'DPMX'),[0x402,0x408]);assert.deepEqual(kit2.scan(exe,'DPMX',{from:0x403}),[0x408]);assert.deepEqual(kit2.scan(exe,'DPMX',{window:5}),[0x402,0x408]);
 assert.deepEqual(kit2.poolLines(['obj_player','  「やあ」\r\n元気？ ','bad\u0001x','中文',' ','あ�']),['「やあ」\n元気？','中文']);
 assert.deepEqual(kit2.textRuns('\0abc「こんにちは」def\0静かだ。\0漢字'),['「こんにちは」','静かだ。']);assert.deepEqual(kit2.textRuns('xx你好世界\0yy谢谢'),['你好世界','谢谢']);
});
test('names: one shared Shift-JIS decoder, fixed-width archive names cut at NUL (E605)',()=>{
 const b=Buffer.concat([Buffer.from([0x82,0xa0,0x82,0xa2]),Buffer.from('.txt\0junk','latin1'),Buffer.from('ab','latin1')]);
 assert.equal(kit.cname(b,0,13),'あい.txt');assert.equal(kit.cname(b,13),'ab');assert.equal(kit.cname(Buffer.from('noz','latin1')),'noz');
 assert.equal(kit.SJIS.decode(Buffer.from([0x82,0xa0])),'あ');});
test('kit malformed guard #43: krkrScrambled requires a complete 5-byte FE FE <mode> FF FE header',()=>{
 for(const b of [Buffer.from([0xfe,0xfe,0]),Buffer.from([0xfe,0xfe,1,0xff]),Buffer.from([0xfe,0xfe,0,0,0])]){
  assert.equal(kit.krkrScrambled(b),null);
  assert.equal(typeof kit.decodeText(b),'string');
 }
 const u16=Buffer.from('あ','utf16le');const m1=Buffer.alloc(2);const c=u16.readUInt16LE(0);m1.writeUInt16LE(((c&0xaaaa)>>1)|((c&0x5555)<<1),0);
 assert.equal(kit.decodeText(Buffer.concat([Buffer.from([0xfe,0xfe,1,0xff,0xfe]),m1])),'あ');
});
test('kit malformed guard #35: table() rejects negative offsets, truncated fields and incomplete counts',t=>{
 const d=tmp(t);
 const neg=Buffer.alloc(16+16+8);neg.write('PACK',0,'latin1');neg.writeUInt32LE(1,8);neg.write('a.txt',16,'latin1');neg.writeUInt32LE(8,24);neg.writeInt32LE(-4,28);
 const negFile=path.join(d,'neg.pak');fs.writeFileSync(negFile,neg);
 assert.equal(kit.table(negFile,{magic:'PACK',count:{at:8,type:'u32le'},entries:16,fields:[{name:'name',type:'cstr',size:8},{name:'size',type:'u32le'},{name:'offset',type:'i32le'}]}),null);
 const truncPstr=Buffer.concat([Buffer.from('ARCX','latin1'),Buffer.from([2,0,0,0]),Buffer.from([20,0,0,0,4]),Buffer.from('ab')]);
 const truncPstrFile=path.join(d,'trunc-pstr.pak');fs.writeFileSync(truncPstrFile,truncPstr);
 assert.equal(kit.table(truncPstrFile,{magic:'ARCX',count:{at:4,type:'u32le'},entries:8,fields:[{name:'offset',type:'u32le'},{name:'name',type:'pstr8'}],sizeFrom:'next'}),null);
 const shortCnt=Buffer.alloc(16+16);shortCnt.write('PACK',0,'latin1');shortCnt.writeUInt32LE(3,8);shortCnt.write('a.txt',16,'latin1');shortCnt.writeUInt32LE(0,24);shortCnt.writeUInt32LE(32,28);
 const shortCntFile=path.join(d,'short-cnt.pak');fs.writeFileSync(shortCntFile,shortCnt);
 assert.equal(kit.table(shortCntFile,{magic:'PACK',count:{at:8,type:'u32le'},entries:16,fields:[{name:'name',type:'cstr',size:8},{name:'size',type:'u32le'},{name:'offset',type:'u32le'}]}),null);
});
test('kit malformed guard #42: asarList() handles malformed JSON roots, null child nodes and deep nesting',t=>{
 const d=tmp(t);
 const mkAsar=(json,payload=Buffer.alloc(16))=>{const jb=Buffer.from(json,'utf8'),pad=(4-(jb.length%4))%4,pLen=4+4+jb.length+pad;
  const h=Buffer.alloc(16+jb.length+pad);h.writeUInt32LE(4,0);h.writeUInt32LE(pLen+4,4);h.writeUInt32LE(pLen,8);h.writeUInt32LE(jb.length,12);jb.copy(h,16);return Buffer.concat([h,payload]);};
 for(const bad of ['null','123','{"files":123}']){const f=path.join(d,'bad-'+bad.length+'.asar');fs.writeFileSync(f,mkAsar(bad));assert.equal(kit.asarList(f),null);}
 const mixed=path.join(d,'mixed.asar');fs.writeFileSync(mixed,mkAsar('{"files":{"bad":null,"good.ks":{"offset":"0","size":5}}}',Buffer.from('hello')));
 assert.deepEqual(kit.asarList(mixed).map(e=>[e.name,e.size]),[['good.ks',5]]);
 let deep='{"files":{"leaf.ks":{"offset":"0","size":1}}}';for(let i=0;i<120;i++)deep='{"files":{"d":'+deep+'}}';
 const deepFile=path.join(d,'deep.asar');fs.writeFileSync(deepFile,mkAsar(deep));assert.ok(Array.isArray(kit.asarList(deepFile)));
});
test('kit malformed guard #40: zipRead() rejects encrypted, truncated and size-mismatched entries while reading valid ones',t=>{
 const zlib=require('node:zlib'),d=tmp(t);
 const mkZip=(name,rawBuf,{method=0,flags=0,badRaw=null,truncate=0}={})=>{
  const nb=Buffer.from(name,'utf8'),compBuf=method===8?zlib.deflateRawSync(rawBuf):rawBuf;
  const lh=Buffer.alloc(30+nb.length);lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(flags,6);lh.writeUInt16LE(method,8);
  lh.writeUInt32LE(compBuf.length,18);lh.writeUInt32LE(badRaw??rawBuf.length,22);lh.writeUInt16LE(nb.length,26);nb.copy(lh,30);
  const cd=Buffer.alloc(46+nb.length);cd.writeUInt32LE(0x02014b50,0);cd.writeUInt16LE(flags,8);cd.writeUInt16LE(method,10);
  cd.writeUInt32LE(compBuf.length,20);cd.writeUInt32LE(badRaw??rawBuf.length,24);cd.writeUInt16LE(nb.length,28);cd.writeUInt32LE(0,42);nb.copy(cd,46);
  const payload=truncate?compBuf.subarray(0,compBuf.length-truncate):compBuf;
  const cdOff=lh.length+payload.length;
  const eocd=Buffer.alloc(22);eocd.writeUInt32LE(0x06054b50,0);eocd.writeUInt16LE(1,8);eocd.writeUInt16LE(1,10);eocd.writeUInt32LE(cd.length,12);eocd.writeUInt32LE(cdOff,16);
  return Buffer.concat([lh,payload,cd,eocd]);};
 const zOk0=path.join(d,'ok0.zip'),zOk8=path.join(d,'ok8.zip');
 fs.writeFileSync(zOk0,mkZip('a.txt',Buffer.from('hello world'),{method:0}));
 fs.writeFileSync(zOk8,mkZip('a.txt',Buffer.from('hello world'),{method:8}));
 assert.equal(kit.zipRead(zOk0,kit.zipList(zOk0)[0]).toString(),'hello world');
 assert.equal(kit.zipRead(zOk8,kit.zipList(zOk8)[0]).toString(),'hello world');
 const zEnc=path.join(d,'enc.zip');fs.writeFileSync(zEnc,mkZip('a.txt',Buffer.from('secret'),{method:0,flags:1}));
 assert.throws(()=>kit.zipRead(zEnc,kit.zipList(zEnc)[0]),/ZIP_ENCRYPTED/);
 const zTrunc=path.join(d,'trunc.zip');fs.writeFileSync(zTrunc,mkZip('a.txt',Buffer.from('hello world'),{method:0}).subarray(0,38));
 assert.throws(()=>kit.zipRead(zTrunc,{name:'a.txt',method:0,comp:11,raw:11,local:0,encrypted:false}),/ZIP_TRUNCATED/);
 const zSz0=path.join(d,'sz0.zip'),zSz8=path.join(d,'sz8.zip');
 fs.writeFileSync(zSz0,mkZip('a.txt',Buffer.from('hello world'),{method:0,badRaw:99}));
 fs.writeFileSync(zSz8,mkZip('a.txt',Buffer.from('hello world'),{method:8,badRaw:99}));
 assert.throws(()=>kit.zipRead(zSz0,kit.zipList(zSz0)[0]),/ZIP_SIZE/);
 assert.throws(()=>kit.zipRead(zSz8,kit.zipList(zSz8)[0]),/ZIP_SIZE/);
});
