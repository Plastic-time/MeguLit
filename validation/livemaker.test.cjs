// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),zlib=require('node:zlib');
const L=require('../services/original-engines/livemaker.cjs'),dir=path.join(__dirname,'fixtures/livemaker'),fixture=n=>fs.readFileSync(path.join(dir,n));
const throws=(fn,code)=>assert.throws(fn,e=>e.code===`LIVEMAKER_${code}`);
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;},str=s=>{const b=Buffer.from(s);return Buffer.concat([u32(b.length),b]);};
function crc(b){let c=0xffffffff;for(const x of b){c^=x;for(let i=0;i<8;i++)c=c&1?(c>>>1)^0xedb88320:c>>>1;}return (c^0xffffffff)>>>0;}
// Controlled archives are synthetic format units. Real upstream bytes above remain the independent positive oracle.
function makeArchive({names=['a.lsb'],data=Buffer.from('payload'),packedData,mode=1,encrypt=0,version=102,split=false,extra=Buffer.alloc(0)}={}){
 const packed=packedData??(mode===0?zlib.deflateSync(data):data),all=names.map(()=>packed),count=names.length,seed=()=>{let k=0;return ()=>k=(Math.imul(k,5)+0x75d6ee39)>>>0;},nk=seed(),lk=seed(),hk=seed();
 const encoded=names.map(n=>{const b=Buffer.from(n);return Buffer.concat([u32(b.length),Buffer.from(b.map(x=>x^(nk()&255)))]);});
 const size=10+encoded.reduce((n,b)=>n+b.length,0)+8*(count+1)+10*count,offsets=[];let at=size;
 for(let i=0;i<=count;i++){offsets.push(u32(at^lk()),u32(version>=101?((split?0x80000000:0)^hk()):0));if(i<count)at+=packed.length;}
 return Buffer.concat([Buffer.from('vf'),u32(version),u32(count),...encoded,...offsets,Buffer.alloc(count,mode),...names.map(()=>u32(0)),...all.map(b=>u32(crc(b))),Buffer.alloc(count,encrypt),...all,extra]);
}
test('official GPL fixtures are byte-identical and tiny MZ fixture is read, never executed',()=>{
 const m=JSON.parse(fixture('manifest.json'));assert.equal(m.commit,'ceeb12911c571fe6da77107bb0eaf7eb29594612');
 for(const f of m.files){const b=fixture(f.name);assert.equal(b.length,f.bytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),f.sha256);}
 for(const n of ['test.dat','test.exe']){const a=L.archive(fixture(n));try{assert.equal(a.version,102);assert.equal(a.embedded,n.endsWith('.exe'));assert.equal(a.offset,n.endsWith('.exe')?2:0);assert.equal(a.entries.length,1);assert.equal(a.entries[0].name,'hello.txt');assert.equal(a.entries[0].read().toString(),'Hello world!\n');}finally{a.close();}}
 assert.equal(L.checksum(Buffer.from('123456789')),0xcbf43926);
});
test('archive rejects truncated prefixes, foreign ZIP/PE, unknown versions and malformed index',()=>{
 const b=fixture('test.dat');for(let i=0;i<b.length;i++){if(i===62){const a=L.archive(b.subarray(0,i));try{assert.equal(a.entries[0].read().toString(),'Hello world!\n');}finally{a.close();}}else assert.throws(()=>L.archive(b.subarray(0,i)));}
 throws(()=>L.archive(Buffer.from('PK\x03\x04'+''.padEnd(40,'x'))),'MAGIC');throws(()=>L.archive(Buffer.from('MZ'+''.padEnd(40,'x'))),'EXE_FOOTER');
 const bad=Buffer.from(fixture('test.exe'));bad.writeUInt32LE(0xffffffff,bad.length-6);throws(()=>L.archive(bad),'EXE_OFFSET');
 throws(()=>L.archive(makeArchive({version:103})),'UNSUPPORTED_ARCHIVE_VERSION');throws(()=>L.archive(makeArchive({split:true})),'UNSUPPORTED_SPLIT_ARCHIVE');
 const count=Buffer.from(b);count.writeUInt32LE(0xffffffff,6);throws(()=>L.archive(count),'COUNT');throws(()=>L.archive(b,{index:10}),'TRUNCATED');
 for(const last of [48,0xffffffff]){const off=Buffer.from(b);off.writeUInt32LE((off.readUInt32LE(31)^62^last)>>>0,31);throws(()=>L.archive(off),'ENTRY_OFFSET');}
 const overlap=Buffer.from(b);overlap.writeUInt32LE((overlap.readUInt32LE(23)^49)>>>0,23);throws(()=>L.archive(overlap),'ENTRY_OFFSET');
 throws(()=>L.archive(Buffer.concat([b,Buffer.from('extra')])),'TRAILING_ARCHIVE_BYTES');throws(()=>L.archive(b,{noSuch:1}),'BAD_LIMIT');
 throws(()=>L.archive(b,{constructor:1}),'BAD_LIMIT');throws(()=>L.archive(b,JSON.parse('{"__proto__":1}')),'BAD_LIMIT');
});
test('archive names, paths and case aliases fail closed without extraction',()=>{
 for(const name of ['../aa.txt','/aa.txt','C:/a.txt','a//b.txt','a/./b.txt','a/../b.txt','NUL.txt','a.','a ','a\0b'])throws(()=>L.archive(makeArchive({names:[name]})),'ENTRY_PATH');
 throws(()=>L.archive(makeArchive({names:['a.lsb','A.LSB']})),'DUPLICATE_PATH');throws(()=>L.archive(makeArchive({names:['a/b.lsb','a\\b.lsb']})),'DUPLICATE_PATH');
 const original=fixture('test.dat'),bad=Buffer.from(original),old=Buffer.from('hello.txt'),name=Buffer.from('../aa.txt');for(let i=0;i<old.length;i++)bad[14+i]^=old[i]^name[i];throws(()=>L.archive(bad),'ENTRY_PATH');
 const invalid=Buffer.from(original);invalid[22]^=0x74^0x81;throws(()=>L.archive(invalid),'INVALID_CP932');
});
test('only explicit supported compression, checksum and aggregate budgets can return bytes',()=>{
 for(const version of [100,101,102])for(const mode of [0,1]){const a=L.archive(makeArchive({version,mode}));try{assert.equal(a.entries[0].read().toString(),'payload');}finally{a.close();}}
 for(const mode of [2,3]){const a=L.archive(makeArchive({mode}));try{throws(()=>a.entries[0].read(),'UNSUPPORTED_ENCRYPTION');}finally{a.close();}}
 const enc=L.archive(makeArchive({encrypt:1}));try{throws(()=>enc.entries[0].read(),'UNSUPPORTED_ENCRYPTION');}finally{enc.close();}
 throws(()=>L.archive(makeArchive({mode:9})),'UNSUPPORTED_COMPRESSION');
 const b=makeArchive(),a=L.archive(b);b[b.length-1]^=1;try{throws(()=>a.entries[0].read(),'CHECKSUM');}finally{a.close();}
 const packed=L.archive(makeArchive(),{packed:3});try{throws(()=>packed.entries[0].read(),'PACKED_BUDGET');}finally{packed.close();}
 const bomb=L.archive(makeArchive({mode:0,data:Buffer.alloc(1<<20,65)}),{expanded:32,totalExpanded:32});try{throws(()=>bomb.entries[0].read(),'DECOMPRESSION');throws(()=>bomb.entries[0].read(),'EXPANDED_BUDGET');}finally{bomb.close();}
 const trailing=L.archive(makeArchive({mode:0,packedData:Buffer.concat([zlib.deflateSync(Buffer.from('payload')),Buffer.from('junk')])}));try{throws(()=>trailing.entries[0].read(),'DECOMPRESSION');}finally{trailing.close();}
 const agg=L.archive(makeArchive(),{totalExpanded:10});try{assert.equal(agg.entries[0].read().length,7);throws(()=>agg.entries[0].read(),'EXPANDED_BUDGET');}finally{agg.close();}
 throws(()=>L.archive(fixture('test.dat'),{totalRead:32}),'READ_BUDGET');
});
test('explicit file API closes owned handles and rejects changed files, without directory discovery',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-live-vf-')),file=path.join(tmp,'fixture.dat');
 try{fs.writeFileSync(file,fixture('test.dat'));let a=L.archive(file);try{assert.equal(a.entries[0].read().toString(),'Hello world!\n');}finally{a.close();}throws(()=>a.entries[0].read(),'CLOSED');
  a=L.archive(file);try{fs.appendFileSync(file,'x');throws(()=>a.entries[0].read(),'SOURCE_CHANGED');}finally{a.close();}
  const stat=fs.fstatSync,close=fs.closeSync;let closed=0;try{fs.fstatSync=()=>{throw Error('owned fstat injection');};fs.closeSync=fd=>{closed++;return close(fd);};assert.throws(()=>L.archive(file),/owned fstat injection/);}finally{fs.fstatSync=stat;fs.closeSync=close;}assert.equal(closed,1,'opened handle closes even if first fstat fails');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('real complete LSB117 commands yield the exact independent upstream TpWord105 CSV oracle',()=>{
 const p=L.parse(fixture('00000001.lsb'));assert.deepEqual(p.commands.map(x=>x.type),[4,3,6,3,4,7,3,14,20,5,7]);assert.equal(p.scenarios.length,1);assert.equal(p.scenarios[0].line,8);assert.equal(p.commands[8].at,1755);
 assert.deepEqual(p.lines,['Hello world!\nPage break','Wait for click','After wait','Text speed fast','Text speed slow','Text speed normal']);assert.equal(p.scenarios[0].scenario.glyphs.length,105);
 const main=L.parse(fixture('gamemain.lsb'));assert.equal(main.commands.length,20);assert.deepEqual(main.lines,[]);
 const muted=fixture('00000001.lsb');muted[1760]=1;assert.deepEqual(L.parse(muted).lines,[],'muted TextIns does not contribute static text');
});
test('unknown/truncated LSB commands and glyphs reject the entire script, never preserve early text',()=>{
 const b=fixture('00000001.lsb');for(let i=0;i<b.length;i++)assert.throws(()=>L.parse(b.subarray(0,i)));
 const version=Buffer.from(b);version.writeUInt32LE(116);throws(()=>L.parse(version),'UNSUPPORTED_LSB_VERSION');
 const command=Buffer.from(b);command[4058]=0xfe;throws(()=>L.parse(command),'UNSUPPORTED_COMMAND');
 const table=Buffer.from(b);table.writeUInt32LE(0xffffffff,5);throws(()=>L.parse(table),'COUNT');
 const size=Buffer.from(b);size.writeUInt32LE(0xffffffff,1766);throws(()=>L.parse(size),'COUNT');
 const tp=Buffer.from(b);tp[1776]=0x39;throws(()=>L.parse(tp),'UNSUPPORTED_TPWORD');
 throws(()=>L.parse(Buffer.concat([b,Buffer.from([0])])),'TRAILING_BYTES');throws(()=>L.parse(b,{script:32}),'SCRIPT_BUDGET');
});
function word(chars,{tail=true,name=false,unknown=false}={}){
 const body=[];if(name)body.push(Buffer.concat([Buffer.from([6]),u32(0xffffffff),str('NAMELABEL\r\nAlice')]));
 for(const x of Buffer.from(chars))body.push(Buffer.concat([Buffer.from([1]),u32(0xffffffff),u32(0xffffffff),u32(0),Buffer.from([x,0]),u32(0xffffffff)]));
 if(unknown)body.push(Buffer.from([0x77,255,255,255,255]));if(tail)body.push(Buffer.from([3,255,255,255,255,1]));
 return Buffer.concat([Buffer.from('TpWord105'),u32(0),u32(0),u32(0),u32(body.length),...body]);
}
test('controlled glyph units preserve tail text and names while refusing unknown glyphs',()=>{
 assert.equal(L.tpword(word('abc',{tail:false})).blocks[0].text,'abc');assert.equal(L.tpword(word('abc',{name:true})).blocks[0].nameLabel,'Alice');
 throws(()=>L.tpword(word('abc',{unknown:true})),'UNSUPPORTED_GLYPH');const version=word('abc');version[8]=0x34;throws(()=>L.tpword(version),'UNSUPPORTED_TPWORD');
 const condition=word('a');condition.writeInt32LE(0,26);throws(()=>L.tpword(condition),'CONDITION_INDEX');
 const decorator=word('a');decorator.writeInt32LE(0,40);throws(()=>L.tpword(decorator),'GLYPH_INDEX');
 const link=word('a');link.writeInt32LE(0,30);throws(()=>L.tpword(link),'GLYPH_INDEX');
});
test('candidate remains unregistered and cannot activate a hook, download, generic scan or seed',()=>{
 const registry=require('../services/original-engines/registry.cjs');assert.equal(registry.READERS.LiveMaker,undefined);assert.equal(registry.ENGINES.find(x=>x.name==='LiveMaker').readers.length,0);
 const source=fs.readFileSync(path.join(__dirname,'../services/original-engines/livemaker.cjs'),'utf8'),scenes=fs.readFileSync(path.join(__dirname,'../services/original-engines/scenes.cjs'),'utf8');
 assert.doesNotMatch(scenes,/require\(['"]\.\/livemaker\.cjs/);assert.doesNotMatch(source,/decodeRuns|child_process|fetch\(|https?:\/\/|readdir|writeFile|mkdir|unlink|SetMute|\.exe['"]\]/);assert.equal(L.engine,undefined);
});
