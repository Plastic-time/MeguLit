// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// A small PSB writer (FreeMote layout) for tests.
function arr(values){const max=Math.max(0,...values);const w=max<256?1:max<65536?2:4;const cn=values.length<256?1:2;const b=Buffer.alloc(2+cn+values.length*w);b[0]=0x0c+cn;b.writeUIntLE(values.length,1,cn);b[1+cn]=0x0c+w;values.forEach((v,i)=>b.writeUIntLE(v,2+cn+i*w,w));return b;}
function buildPsb(root){
 const names=[...new Set(collectKeys(root))].sort(),strings=[];
 // Name trie: every node gets its own block of 256 children; a terminator node points back at each name's last node.
 const nd=[0],cs=[0];let next=256;const child=new Map();
 const terminators=names.map(name=>{let node=0;for(const ch of Buffer.from(name,'latin1')){const key=node+':'+ch;if(!child.has(key)){if(cs[node]===undefined||cs[node]===0&&node!==0||node===0&&!child.size){}if(!cs[node]){cs[node]=next;next+=256;}const x=cs[node]+ch;nd[x]=node;child.set(key,x);}node=child.get(key);}
  const t=next++;nd[t]=node;return t;});
 for(let i=0;i<next;i++){if(nd[i]===undefined)nd[i]=0;if(cs[i]===undefined)cs[i]=0;}
 const idx=s=>{let i=strings.indexOf(s);if(i<0){strings.push(s);i=strings.length-1;}return i;};
 const parts=[];
 function enc(v){
  if(v===null)return Buffer.from([0x01]);
  if(typeof v==='string')return Buffer.from([0x15,idx(v)]);
  if(typeof v==='number')return Buffer.from([0x05,v&255]);
  if(Array.isArray(v)){const items=v.map(enc),offs=[];let o=0;for(const it of items){offs.push(o);o+=it.length;}return Buffer.concat([Buffer.from([0x20]),arr(offs),...items]);}
  const keys=Object.keys(v).sort(),items=keys.map(k=>enc(v[k])),offs=[];let o=0;for(const it of items){offs.push(o);o+=it.length;}
  return Buffer.concat([Buffer.from([0x21]),arr(keys.map(k=>names.indexOf(k))),arr(offs),...items]);
 }
 const body=enc(root);
 const nameBlock=Buffer.concat([arr(cs),arr(nd),arr(terminators)]);
 const sdata=[],soffs=[];let so=0;for(const s of strings){const b=Buffer.from(s+'\0','utf8');soffs.push(so);so+=b.length;sdata.push(b);}
 const header=Buffer.alloc(0x2c),offNames=0x2c,offEntries=offNames+nameBlock.length,offStrings=offEntries+body.length;
 const strArr=arr(soffs),offData=offStrings+strArr.length,data=Buffer.concat(sdata),chunkAt=offData+data.length;
 header.write('PSB\0',0,'latin1');header.writeUInt16LE(3,4);header.writeUInt32LE(0x2c,8);header.writeUInt32LE(offNames,12);header.writeUInt32LE(offStrings,16);header.writeUInt32LE(offData,20);
 header.writeUInt32LE(chunkAt,24);header.writeUInt32LE(chunkAt+3,28);header.writeUInt32LE(chunkAt+6,32);header.writeUInt32LE(offEntries,36);
 return Buffer.concat([header,nameBlock,body,strArr,data,Buffer.from([0x0d,0,0x0d,0x0d,0,0x0d])]);
}
function collectKeys(v){if(Array.isArray(v))return v.flatMap(collectKeys);if(v&&typeof v==='object')return [...Object.keys(v),...Object.values(v).flatMap(collectKeys)];return [];}
module.exports={buildPsb,arr};
