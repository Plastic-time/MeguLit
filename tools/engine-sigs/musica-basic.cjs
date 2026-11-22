// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const crypto=require('node:crypto');
const PIN=Object.freeze({fileBytes:1126400,scriptBytes:6134556,imageBytes:1150976,timestamp:1255905404,
 exeSha256:'05f51cfe00436c91c6a0102fb79d8e9d751b6ec88795b164b4640d953842f050',
 scriptSha256:'638c5c40d0856105f21a8ac50cca3b6159e831a2361699db108eacfe28f8ee78',
 executeRva:0x6749b,parseRva:0x67423,vtableRva:0xa22d0,constructorStoreRva:0x67396,commandRva:0xb3038,
 executeHex:'558bec51568bf18b461cff76208b88d8110000e80b4cfeff8845fc8d4634ff75fc8b4e1c508d4624508d464450ff7620e87655fbffb0015ec9c3',
 parseHex:'568b742408578bf98b4e0485c974648b46082bc1c1f80483f80475576a0051e89348fbff598947208b4604596aff83c0206a00508d4f24e8c8b1f9ff8b46046aff83c0306a00508d4f34e8b5b1f9ff8b460485c0741d8b76082bf0c1fe0483fe0176106aff83c0106a00508d4f44e891b1f9ff5f5ec20400'});
function mappedMatches(bytes,base){
 if(!Buffer.isBuffer(bytes)||bytes.length<PIN.imageBytes||!Number.isSafeInteger(base)||base<0||base>0xffffffff-PIN.imageBytes)return false;
 const at=(rva,hex)=>bytes.subarray(rva,rva+hex.length/2).equals(Buffer.from(hex,'hex'));
 return at(PIN.executeRva,PIN.executeHex)&&at(PIN.parseRva,PIN.parseHex)
  &&at(PIN.constructorStoreRva,'c706')&&bytes.readUInt32LE(PIN.constructorStoreRva+2)===base+PIN.vtableRva
  &&bytes.readUInt32LE(PIN.vtableRva+4)===base+PIN.parseRva&&bytes.readUInt32LE(PIN.vtableRva+8)===base+PIN.executeRva
  &&bytes.subarray(PIN.commandRva,PIN.commandRva+9).equals(Buffer.from('.message\0'));
}
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function inspect(exe,script){
 const no=reason=>({matched:false,reason});
 if(!Buffer.isBuffer(exe)||!Buffer.isBuffer(script))return no('MUSICA_INPUT');
 if(exe.length!==PIN.fileBytes||script.length!==PIN.scriptBytes)return no('MUSICA_SIZE');
 if(hash(exe)!==PIN.exeSha256)return no('MUSICA_EXE_HASH');
 if(hash(script)!==PIN.scriptSha256)return no('MUSICA_SCRIPT_HASH');
 if(exe.readUInt16LE(0)!==0x5a4d)return no('MUSICA_PE');
 const pe=exe.readUInt32LE(0x3c);
 if(pe>0x1000||pe+24+224>exe.length||exe.readUInt32LE(pe)!==0x4550||exe.readUInt16LE(pe+4)!==0x14c
  ||exe.readUInt32LE(pe+8)!==PIN.timestamp||exe.readUInt16LE(pe+24)!==0x10b||exe.readUInt32LE(pe+24+56)!==PIN.imageBytes)return no('MUSICA_PE');
 const base=exe.readUInt32LE(pe+24+28),count=exe.readUInt16LE(pe+6),opt=exe.readUInt16LE(pe+20),sections=pe+24+opt;
 if(count>96||sections+count*40>exe.length)return no('MUSICA_PE');
 const image=Buffer.alloc(PIN.imageBytes);
 for(let i=0;i<count;i++){
  const at=sections+i*40,rva=exe.readUInt32LE(at+12),size=exe.readUInt32LE(at+16),raw=exe.readUInt32LE(at+20);
  if(rva+size>image.length||raw+size>exe.length)return no('MUSICA_PE_RANGE');
  exe.copy(image,rva,raw,raw+size);
 }
 return mappedMatches(image,base)?{matched:true,reason:'MUSICA_EXACT_PAIR',bodyRva:PIN.executeRva,bodyEncoding:'CP932',speakerVerified:false,liveVerified:false}:no('MUSICA_BYTES');
}
module.exports={PIN,mappedMatches,inspect};
if(require.main===module){
 const fs=require('node:fs');
 try{const [exe,script]=process.argv.slice(2);if(!exe||!script)throw Error();
  if(fs.statSync(exe).size!==PIN.fileBytes||fs.statSync(script).size!==PIN.scriptBytes)console.log(JSON.stringify({matched:false,reason:'MUSICA_SIZE'}));
  else console.log(JSON.stringify(inspect(fs.readFileSync(exe),fs.readFileSync(script))));
 }catch{console.log(JSON.stringify({matched:false,reason:'MUSICA_READ'}));process.exitCode=1;}
}
