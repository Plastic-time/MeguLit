// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Static evidence admission for the x86 dialogue-page matcher, not game/engine detection or runtime permission */
const fs=require('node:fs'),crypto=require('node:crypto');

function inspect(buf,expectedSha256){
 if(!Buffer.isBuffer(buf))throw new TypeError('MAGES sample must be a Buffer');
 if(!/^[0-9a-f]{64}$/.test(expectedSha256))throw new TypeError('expected SHA-256 is required');
 const sha256=crypto.createHash('sha256').update(buf).digest('hex');
 const out={bytes:buf.length,sha256,expectedSha256,status:'invalid-pe',architecture:'unknown'};
 if(buf.length<64||buf.toString('latin1',0,2)!=='MZ')return out;
 const pe=buf.readUInt32LE(0x3c);
 if(pe<64||pe>buf.length-26||buf.toString('latin1',pe,pe+4)!=='PE\0\0')return out;
 const optionalBytes=buf.readUInt16LE(pe+20);
 if(optionalBytes<2||optionalBytes>buf.length-pe-24)return out;
 out.machine=buf.readUInt16LE(pe+4);out.optionalMagic=buf.readUInt16LE(pe+24);
 if(out.machine===0x14c&&out.optionalMagic===0x10b)out.architecture='x86';
 else if(out.machine===0x8664&&out.optionalMagic===0x20b)out.architecture='x64';
 if(out.architecture!=='x86')out.status='unsupported-architecture';
 else out.status=sha256===expectedSha256?'matched':'different-build';
 return out;
}

function read(file,expectedSha256){
 let bytes;
 try{bytes=fs.readFileSync(file);}catch(error){if(error.code==='ENOENT')return {file,status:'missing'};throw error;}
 return {file,...inspect(bytes,expectedSha256)};
}

module.exports={inspect,read};
if(require.main===module){
 const [file,expected]=process.argv.slice(2);
 try{const result=read(file,expected);console.log(JSON.stringify(result));process.exitCode=result.status==='matched'?0:1;}
 catch(error){console.error(error.message);process.exitCode=1;}
}
