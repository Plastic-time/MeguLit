// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const crypto=require('node:crypto'),{pe}=require('./draw-sites.cjs');
const SHA='9debd9f6aed2339e540aa9526ea3f16f38ad91c19ad9a842a5b0b2fab21303e3',BYTES=3459728;
const SIG=Object.freeze({entry:0x50c00,sourceReturn:0x48d3d,dispatch:0x4e169,table:0x2953a8,state:0x33c6b0,pc:0x2e4678,speaker:0x2fd2ae,scriptOffset:0x38,textArrayOffset:0x40});
const PREFIX=Buffer.from('558bec83ec1c5356576a00ff7508e81d8806008bc8e8e67d0600','hex'),DISPATCH=Buffer.from('8d810090ffff6683f83c77230fb7c08b1485a853690085d2741051ffd283c404','hex');
function inspect(bytes){
 const sha256=crypto.createHash('sha256').update(bytes).digest('hex');if(bytes.length!==BYTES||sha256!==SHA)return {matched:false,sha256,reason:'DR1_EXACT_PC_BUILD'};
 const image=pe(bytes);const offset=rva=>{const section=image.secs.find(s=>rva>=s.rva&&rva<s.rva+s.raw);if(!section)throw Error('DR1_RVA');return section.ptr+rva-section.rva;};
 for(const [rva,needle]of [[SIG.entry,PREFIX],[SIG.dispatch,DISPATCH]]){
  if(!bytes.subarray(offset(rva),offset(rva)+needle.length).equals(needle))throw Error('DR1_SIGNATURE');
  const hits=image.code.reduce((n,c)=>{for(let at=c.bytes.indexOf(needle);at>=0;at=c.bytes.indexOf(needle,at+1))n++;return n;},0);if(hits!==1)throw Error('DR1_NOT_UNIQUE');
 }
 const call=offset(SIG.sourceReturn-5);if(bytes[call]!==0xe8||SIG.sourceReturn+bytes.readInt32LE(call+1)!==SIG.entry)throw Error('DR1_CALL');
 for(const [op,target]of [[2,0x48ca0],[5,0x48dd0],[0x21,0x49d40],[0x2b,0x49e10]])if(bytes.readUInt32LE(offset(SIG.table)+op*4)!==image.base+target)throw Error('DR1_OPCODE_TABLE');
 return {matched:true,sha256,bytes:bytes.length,architecture:'x86',...SIG,source:'LIN-0x02-complete-string',runtimeEvidence:false,capabilities:{source:true,names:false,choices:false,coordinates:false,hide:false,embed:false,ruby:false}};
}
module.exports={SHA,BYTES,SIG,PREFIX,DISPATCH,inspect};
if(require.main===module){const fs=require('node:fs');for(const file of process.argv.slice(2))console.log(JSON.stringify({file,...inspect(fs.readFileSync(file))}));}
