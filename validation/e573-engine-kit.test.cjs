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
