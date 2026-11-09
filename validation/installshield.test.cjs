'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const is=require('../core/installshield.cjs');
// E348: InstallShield 6 cabinets (the 2003 沙耶の唄 disc) are unpacked without running the setup; setup engine files are skipped.
test('InstallShield 6: game files are unpacked from the cabinets, setup files are left out',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'is-')),cd=0x200,base=cd+0x100,hdr=Buffer.alloc(base+0x400);
 hdr.writeUInt32LE(0x28635349,0);hdr.writeUInt32LE(0x0100600c,4);hdr.writeUInt32LE(cd,0x0c);
 hdr.writeUInt32LE(0x100,cd+0x0c);hdr.writeUInt32LE(1,cd+0x1c);hdr.writeUInt32LE(3,cd+0x28);hdr.writeUInt32LE(8,cd+0x2c);
 hdr.writeUInt32LE(0x300,base);/* directory 0 name: empty string at base+0x300 */
 const payload=Buffer.from('MZ'+'x'.repeat(70000)),chunks=[];for(let i=0;i<payload.length;i+=0x8000){const c=zlib.deflateRawSync(payload.subarray(i,i+0x8000)),n=Buffer.alloc(2);n.writeUInt16LE(c.length);chunks.push(n,c);}
 const packed=Buffer.concat(chunks),cab2=Buffer.concat([Buffer.alloc(512),packed]);
 const files=[['corecomp.ini',4,10,10,512,1],['saya.exe',4,payload.length,packed.length,512,2],['layout.bin',0,0,0,0,1]];
 files.forEach(([name,flags,size,pk,off,vol],i)=>{const p=base+8+i*0x57,no=0x320+i*0x20;hdr.writeUInt16LE(flags,p);hdr.writeBigUInt64LE(BigInt(size),p+2);hdr.writeBigUInt64LE(BigInt(pk),p+0x0a);hdr.writeBigUInt64LE(BigInt(off),p+0x12);hdr.writeUInt32LE(no,p+0x3a);hdr.writeUInt16LE(0,p+0x3e);hdr.writeUInt16LE(vol,p+0x55);hdr.write(name,base+no,'latin1');});
 fs.writeFileSync(path.join(dir,'data1.hdr'),hdr);fs.writeFileSync(path.join(dir,'data1.cab'),Buffer.alloc(600));fs.writeFileSync(path.join(dir,'data2.cab'),cab2);
 assert.equal(is.findHeader(dir),path.join(dir,'data1.hdr'));
 assert.deepEqual(is.gameFiles(path.join(dir,'data1.hdr')).map(f=>f.name),['saya.exe']);
 assert.deepEqual(await is.extract(path.join(dir,'data1.hdr'),path.join(dir,'out')),['saya.exe']);
 assert.ok(fs.readFileSync(path.join(dir,'out','saya.exe')).equals(payload));
 fs.rmSync(dir,{recursive:true,force:true});
});
