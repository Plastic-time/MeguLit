// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E700 FPD containers (Fate/stay night REMASTERED obb/*.bin, #396). Synthetic only: a small x64 PE that carries a key
// builder shaped like the game's (static table in .data, 16 byte-xor stores, crc state immediates, the key string
// passed by "lea rcx"), optionally behind a SteamStub 3.1 header, and FPD archives written by the format's rules.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const fpd=require('../services/original-engines/fpd.cjs');

const KEY_STRING='0123456789abcdef0123456789abcdef',STATE=0x1234a5c3;
function prng(seed){let s=seed>>>0;return ()=>{s=(s*1103515245+12345)>>>0;return s>>>24;};}
function staticTable(){const r=prng(7),b=Buffer.alloc(0x10000);for(let i=0;i<b.length;i++)b[i]=r();return b;}

/* PE layout: .text @0x1000 (raw 0x400), .rdata @0x3000, .data @0x4000 (64 KB table at +0x100), optional .bind */
const TEXT_VA=0x1000,RDATA_VA=0x3000,DATA_VA=0x4000,TABLE_RVA=DATA_VA+0x100,STR_RVA=RDATA_VA+0x40,BIND_VA=0x15000;
function textSection(){const c=[];const at=()=>c.length,va=()=>TEXT_VA+c.length;
 const caller=at();c.push(0x48,0x8d,0x0d,0,0,0,0);const leaEnd=va();c.push(0xe8,0,0,0,0);const callEnd=va();c.push(0xc3,0xcc,0xcc,0xcc);
 const builder=va();
 c.push(0x48,0x35,0,0,0,STATE&0xff);/* xor rax, low<<24 */
 c.push(0x81,0xf2,(STATE>>>8)&0xff,(STATE>>>16)&0xff,STATE>>>24,0);/* xor edx, state>>8 */
 for(let k=0;k<16;k++){c.push(0x0f,0xb6,0x45,0x17+k);c.push(0x42,0x30,0x84,0x2b);const d=TABLE_RVA+k;c.push(d&0xff,(d>>>8)&0xff,(d>>>16)&0xff,d>>>24);}
 c.push(0x41,0x81,0xfc,0,0x10,0,0,0xc3);
 const b=Buffer.from(c);b.writeInt32LE(STR_RVA-leaEnd,caller+3);b.writeInt32LE(builder-callEnd,caller+8);
 const out=Buffer.alloc(0x200);b.copy(out);return out;}
function pe({stub=false}={}){
 const text=textSection(),rdata=Buffer.alloc(0x200),data=Buffer.alloc(0x10200);Buffer.from(KEY_STRING+'\0').copy(rdata,STR_RVA-RDATA_VA);staticTable().copy(data,TABLE_RVA-DATA_VA);
 const secs=[{name:'.text',va:TEXT_VA,data:text},{name:'.rdata',va:RDATA_VA,data:rdata},{name:'.data',va:DATA_VA,data:data}];
 let entry=TEXT_VA;
 if(stub){const key=crypto.randomBytes(32),ivPlain=crypto.randomBytes(16),plain=Buffer.concat([text,Buffer.alloc(16)]);
  const enc=crypto.createCipheriv('aes-256-cbc',key,ivPlain);enc.setAutoPadding(false);const ct=Buffer.concat([enc.update(plain),enc.final()]);
  const e2=crypto.createCipheriv('aes-256-ecb',key,null);e2.setAutoPadding(false);const ivEnc=Buffer.concat([e2.update(ivPlain),e2.final()]);
  secs[0].data=ct.subarray(16,16+text.length);/* the first 16 cipher bytes are the stub's "stolen" bytes */
  const h=Buffer.alloc(0xf0);h.writeUInt32LE(0xc0dec0df,4);h.writeBigUInt64LE(BigInt(TEXT_VA),72);h.writeBigUInt64LE(BigInt(text.length),80);key.copy(h,88);ivEnc.copy(h,120);ct.copy(h,136,0,16);
  h.writeUInt32LE(0x5a5a1234,0);for(let i=4;i<0xf0;i+=4){const prev=h.readUInt32LE(i-4);h.writeUInt32LE((h.readUInt32LE(i)^prev)>>>0,i);}/* XOR chain, as the stub stores it */
  const bind=Buffer.alloc(0x200);h.copy(bind,0x10);secs.push({name:'.bind',va:BIND_VA,data:bind});entry=BIND_VA+0x100;}
 const hdr=Buffer.alloc(0x400);hdr.write('MZ',0,'latin1');hdr.writeUInt32LE(0x80,0x3c);const p=0x80;hdr.write('PE\0\0',p,'latin1');hdr.writeUInt16LE(0x8664,p+4);hdr.writeUInt16LE(secs.length,p+6);hdr.writeUInt16LE(240,p+20);
 const o=p+24;hdr.writeUInt16LE(0x20b,o);hdr.writeUInt32LE(entry,o+16);hdr.writeBigUInt64LE(0x140000000n,o+24);
 let raw=0x400;const bodies=[];for(let i=0;i<secs.length;i++){const s=secs[i],at=o+240+i*40;hdr.write(s.name,at,'latin1');hdr.writeUInt32LE(s.data.length,at+8);hdr.writeUInt32LE(s.va,at+12);hdr.writeUInt32LE(s.data.length,at+16);hdr.writeUInt32LE(raw,at+20);bodies.push(s.data);raw+=s.data.length;}
 return Buffer.concat([hdr,...bodies]);}

/* the encoder, by the format's rules (fpd.cjs header comment) */
function archive(files,key,{version=2}={}){
 let names=Buffer.alloc(0);const nameOff=[],datas=[];let data=Buffer.alloc(0);
 for(const f of files){nameOff.push(names.length);names=Buffer.concat([names,Buffer.from(f.name+'\0','utf8')]);
  const raw=Buffer.from(f.body),stored=f.pack?zlib.deflateSync(raw):Buffer.from(raw);fpd.xorKey(stored,key,0);datas.push({off:data.length,stored:stored.length,unpacked:f.pack?raw.length:0});data=Buffer.concat([data,stored]);}
 const nameBlock=version>=2?zlib.deflateSync(names):names,idx=Buffer.alloc(files.length*32);
 datas.forEach((d,i)=>{idx.writeBigUInt64BE(BigInt(nameOff[i]),i*32);idx.writeBigUInt64BE(BigInt(d.off),i*32+8);idx.writeBigUInt64BE(BigInt(d.stored),i*32+16);idx.writeBigUInt64BE(BigInt(d.unpacked),i*32+24);});
 const index=fpd.xorKey(Buffer.concat([idx,nameBlock]),key,0),h=Buffer.alloc(fpd.HEADER);h.write('FPD\0',0,'latin1');h.writeUInt32BE(version,4);h.writeBigUInt64BE(BigInt(files.length),8);h.writeBigUInt64BE(BigInt(fpd.HEADER+index.length),16);
 return Buffer.concat([h,index,data]);}

const KEY=fpd.buildKey(staticTable(),KEY_STRING,STATE);
const KS='*start\r\n【士郎】\r\n「これはテスト用の台詞です」[p]\r\nふと、空を見上げた。[p]\r\n';
function game({stub=false,patch=true}={}){const d=fs.mkdtempSync(path.join(os.tmpdir(),'fpd-'));fs.mkdirSync(path.join(d,'obb'));
 fs.writeFileSync(path.join(d,'game-release.exe'),pe({stub}));
 fs.writeFileSync(path.join(d,'obb','pack00m.bin'),archive([{name:'root/data/kag/a-00.ks',body:KS,pack:true},{name:'root/data/kag/b-01.ks',body:'*x\r\n「古い行です」[p]\r\n',pack:false},{name:'root/data/se/a.ogg',body:Buffer.alloc(64,1)}],KEY));
 if(patch)fs.writeFileSync(path.join(d,'obb','patch00m.bin'),archive([{name:'root/data/kag/b-01.ks',body:'*x\r\n「新しい行です」[p]\r\n',pack:true}],KEY));
 return d;}

test('the crc continues from the builder state, block by block',()=>{
 /* from the standard initial state it is plain CRC-32 of BE32(i) (0x2144df1c = CRC-32 of four zero bytes) */
 assert.equal(fpd.blockCrc(0xffffffff,0),0x2144df1c);
 assert.notDeepEqual(fpd.blockMask(Buffer.from(KEY_STRING),STATE,0),fpd.blockMask(Buffer.from(KEY_STRING),STATE,1));});

test('the key is derived from the program: table, crc state and key string',()=>{
 const d=game(),k=fpd.deriveFrom(fs.readFileSync(path.join(d,'game-release.exe')),path.join(d,'obb','pack00m.bin'));
 assert.ok(k);assert.equal(k.keyString,KEY_STRING);assert.equal(k.state,STATE);assert.equal(k.table,TABLE_RVA);assert.ok(k.key.equals(KEY));assert.equal(k.unstubbed,false);});

test('a SteamStub 3.1 code section is decrypted before the builder is searched',()=>{
 const d=game({stub:true}),k=fpd.deriveFrom(fs.readFileSync(path.join(d,'game-release.exe')),path.join(d,'obb','pack00m.bin'));
 assert.ok(k);assert.equal(k.unstubbed,true);assert.ok(k.key.equals(KEY));});

test('a wrong archive rejects the key (first entry must decode to name 0 / data 0)',()=>{
 const d=game(),other=path.join(d,'obb','other.bin');fs.writeFileSync(other,archive([{name:'x.ks',body:'a'}],fpd.buildKey(staticTable(),'another-key-string',STATE)));
 assert.equal(fpd.deriveFrom(fs.readFileSync(path.join(d,'game-release.exe')),other),null);});

test('index and entries: zlib names (v2), packed and stored entries, the patch archive wins',()=>{
 const d=game(),g=fpd.open(d);assert.ok(g);assert.equal(g.archives.length,2);assert.match(g.archives[1].file,/patch00m\.bin$/);
 const a=g.files.get('root/data/kag/a-00.ks');assert.equal(fpd.read(a.file,a.entry,g.key.key).toString('utf8'),KS);
 const b=g.files.get('root/data/kag/b-01.ks');assert.match(fpd.read(b.file,b.entry,g.key.key).toString('utf8'),/新しい行/);
 const s=g.files.get('root/data/se/a.ogg');assert.equal(s.entry.packed,false);assert.ok(fpd.read(s.file,s.entry,g.key.key).equals(Buffer.alloc(64,1)));});

test('version 1 keeps the names uncompressed',()=>{
 const f=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'fpd1-')),'pack.bin');fs.writeFileSync(f,archive([{name:'n/one.tl',body:'あ'}],KEY,{version:1}));
 const l=fpd.list(f,KEY);assert.equal(l.version,1);assert.deepEqual(l.entries.map(e=>e.name),['n/one.tl']);});

test('a truncated or foreign file is not listed',()=>{
 const d=game(),f=path.join(d,'obb','pack00m.bin'),b=fs.readFileSync(f);fs.writeFileSync(f,b.subarray(0,b.length-10));assert.equal(fpd.list(f,KEY),null);
 const n=path.join(d,'obb','x.bin');fs.writeFileSync(n,Buffer.from('PK\x03\x04 not fpd'));assert.equal(fpd.isFpd(n),false);});

test('the scene reader reads the KAG scenario out of the archives, speaker lines included',()=>{
 const scenes=require('../services/original-engines/scenes.cjs'),e=scenes.ENGINES.fpd,d=game({stub:true});
 const list=e.scenes(d);assert.deepEqual(list.map(s=>s.name),['root/data/kag/a-00.ks','root/data/kag/b-01.ks']);
 const lines=list.flatMap(s=>e.parse(s.read()).lines);assert.ok(lines.includes('「これはテスト用の台詞です」'));assert.ok(lines.includes('【士郎】'));assert.ok(lines.includes('「新しい行です」'));assert.ok(!lines.some(l=>/古い行/.test(l)));});

test('the registry recognises the folder and names the fpd reader',()=>{
 const registry=require('../services/original-engines/registry.cjs'),d=game({patch:false});
 const e=registry.engineOf(d);assert.equal(e?.name,'FPD (fz engine)');assert.deepEqual(registry.readersFor(d),['fpd']);});

test('the adapter probe reads a synthetic FPD game through to step ok',()=>{
 const core=require('../services/adapter-probe-core.cjs'),d=game({stub:true});
 const r=core.probeGame({dir:d,executable:path.join(d,'game-release.exe'),title:'synthetic'},{budgetMs:30000});
 assert.equal(r.step,'ok');assert.equal(r.detail,'fpd');});
