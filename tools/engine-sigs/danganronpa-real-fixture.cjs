// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Read-only extraction of one measured LIN and four exact text references, never scans opcode boundaries. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const W=require('../../services/original-engines/spike-wad.cjs')._internal;
const ENTRY='Dr1/data/us/script/e00_001_000.lin',SHA='d1a05e2c35b67d3882ef328f33260f883a5e7c96c53c1dbe3e530526fc52c79e';
function extract(wad,out){
 const e=W.wadList(wad)?.find(e=>e.name===ENTRY);if(!e||e.size!==11916)throw Error('DR1_LIN_ENTRY');const bytes=W.wadRead(wad,e),sha256=crypto.createHash('sha256').update(bytes).digest('hex');if(sha256!==SHA)throw Error('DR1_LIN_SHA');
 const to=bytes.readUInt32LE(8),texts=W.linStrings(bytes),samples=[113,129,197,211].map(offset=>{
  if(bytes[offset]!==0x70||bytes[offset+1]!==2)throw Error('DR1_LIN_TEXT_REFERENCE');const id=bytes.readUInt16BE(offset+2),start=to+bytes.readUInt32LE(to+4+id*4),end=to+bytes.readUInt32LE(to+8+id*4);
  const raw=bytes.toString('utf16le',start,end).replace(/\0[\s\S]*$/,'');return {offset,id,raw,clean:texts[id]};
 });
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'real-script.lin'),bytes);const receipt={entry:ENTRY,bytes:bytes.length,sha256,runtimeEvidence:false,samples};fs.writeFileSync(path.join(out,'real-script-sources.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;
}
module.exports={extract,ENTRY,SHA};
if(require.main===module){const [wad,out]=process.argv.slice(2);if(!wad||!out)throw Error('usage: danganronpa-real-fixture.cjs <Japanese WAD> <private output directory>');console.log(JSON.stringify(extract(wad,out)));}
