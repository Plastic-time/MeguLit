/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
/* Exact-build file audit, separate from the runtime structural matcher
   Matching bytes do not establish the loaded module, language or actual screen */
const fs=require('node:fs');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const signature=require('./siglus-draw.cjs');
const fixtures=require('../../validation/fixtures/engine-sigs/siglus-draw.json');
const MAX_BYTES=64*1024*1024;
function sectionsOf(bytes){
 const range=(offset,length)=>{if(!Number.isSafeInteger(offset)||offset<0||offset+length>bytes.length)throw Error('truncated PE');};
 range(0,64);assert.equal(bytes.toString('ascii',0,2),'MZ','DOS header');
 const pe=bytes.readUInt32LE(60);range(pe,24);
 assert.equal(bytes.toString('ascii',pe,pe+4),'PE\0\0','PE signature');
 assert.equal(bytes.readUInt16LE(pe+4),0x14c,'x86 module required');
 const count=bytes.readUInt16LE(pe+6),optional=bytes.readUInt16LE(pe+20);
 assert.ok(count>0&&count<=96&&optional>=96,'bounded PE headers');range(pe+24,optional+count*40);
 assert.equal(bytes.readUInt16LE(pe+24),0x10b,'PE32 required');
 const sections=[];
 for(let i=0;i<count;i++){
  const at=pe+24+optional+i*40,name=bytes.toString('ascii',at,at+8).replace(/\0.*$/,'');
  const length=bytes.readUInt32LE(at+16),start=bytes.readUInt32LE(at+20);range(start,length);
  const frequencies=new Uint32Array(256);for(const byte of bytes.subarray(start,start+length))frequencies[byte]++;
  let entropy=0;for(const n of frequencies)if(n){const p=n/length;entropy-=p*Math.log2(p);}
  sections.push({name,rva:bytes.readUInt32LE(at+12),bytes:length,executable:!!(bytes.readUInt32LE(at+36)&0x20000000),entropy:+entropy.toFixed(4)});
 }
 return {machine:'x86',entryRva:bytes.readUInt32LE(pe+24+16),sections};
}
function auditBytes(bytes){
 assert.ok(Buffer.isBuffer(bytes)&&bytes.length<=MAX_BYTES,'bounded Buffer required');
 const identity=sectionsOf(bytes),sha256=crypto.createHash('sha256').update(bytes).digest('hex');
 const entry=Object.entries(fixtures.games).find(([,game])=>game.sha256===sha256);
 const code=signature.textOf(bytes),result=signature.find([{va:code.va,code:code.code}]);
 const packingMarkers=identity.sections.filter(s=>/^(?:UPX|\.bind$|\.vmp|\.enigma|\.themida)/i.test(s.name)).map(s=>s.name);
 const pinned=!!entry,signatureMatches=!!result.ok;
 const expectedMatches=pinned&&signatureMatches&&JSON.stringify(signature.describe(result))===JSON.stringify(entry[1].expect);
 return {schema:1,kind:'static-file-audit',bytes:bytes.length,sha256,...identity,fixture:pinned?entry[0]:null,
  packingMarkers,signatureMatches,signature:signature.describe(result),expectedMatches,
  status:pinned&&expectedMatches&&packingMarkers.length===0?'pinned-static-match':'not-qualified',
  limits:['Section markers are packing indicators, not proof that no protector exists','No process or loaded module inspected','No language, roles, hiding, lookup or translation acceptance']};
}
function auditFile(file){const stat=fs.statSync(file);assert.ok(stat.isFile()&&stat.size<=MAX_BYTES,'bounded regular file required');return auditBytes(fs.readFileSync(file));}
module.exports={auditBytes,auditFile,sectionsOf};
if(require.main===module){
 if(process.argv.length<3){process.stderr.write('usage: node siglus-sample-audit.cjs <explicit exe> [...]\n');process.exitCode=2;}
 for(const file of process.argv.slice(2)){
  try{const audit=auditFile(file);process.stdout.write(JSON.stringify({file,...audit})+'\n');if(audit.status!=='pinned-static-match')process.exitCode=1;}
  catch(error){process.stdout.write(JSON.stringify({file,status:'rejected',error:error.message})+'\n');process.exitCode=1;}
 }
}
