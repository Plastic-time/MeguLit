// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Old Majiro's complete string draw, before the glyph-cache branch. The font holds the pen;
   its callers advance font+0x48 by the returned width. No TextOutA cache-miss site is used. */
const fs=require('node:fs'),{pe}=require('./draw-sites.cjs');
function find(code){const hits=[];
 for(let i=0;i+0xd0<=code.length;i++){
  if(code[i]!==0x81||code[i+1]!==0xec)continue;
  const locals=code.readUInt32LE(i+2);if(locals<0x40||locals>0x1000||locals%4)continue;
  const at=(off,hex)=>code.subarray(i+off,i+off+hex.length/2).equals(Buffer.from(hex,'hex'));
  if(!at(6,'568bb424')||code.readUInt32LE(i+10)!==locals+16||!at(14,'803e00750a33c05e81c4')||code.readUInt32LE(i+24)!==locals||!at(28,'c3538b9c24')||code.readUInt32LE(i+33)!==locals+12||!at(37,'85db5557'))continue;
  if(!at(48,'8b7b28'))continue;
  let pen=false;for(let j=0x50;j<0xbf;j++)if(at(j,'8b53488b8424')&&code.readUInt32LE(i+j+6)===locals+0x30&&at(j+10,'89108b4b4c894804')){pen=true;break;}
  if(pen)hits.push({offset:i,locals,textArg:3,fontArg:1,outArg:4,x:0x48,y:0x4c,size:0x28,paint:0x38});
 }return hits;}
function scanFile(file){const bytes=fs.readFileSync(file),image=pe(bytes);return {base:image.base,sites:image.code.flatMap(c=>find(c.bytes).map(h=>({...h,va:c.va+h.offset})))};}
module.exports={find,scanFile};
if(require.main===module)for(const f of process.argv.slice(2))console.log(JSON.stringify({file:f,...scanFile(f)}));
