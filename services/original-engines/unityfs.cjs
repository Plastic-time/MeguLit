// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E355 UnityFS asset bundles (Unity 2019+ / 6000, used by Naninovel games such as 魔法少女ノ魔女裁判): header, block and
// directory info, then LZ4 / LZ4HC blocks (uncompressed and LZMA-less only). Returns the files inside (serialized assets).
const fs=require('node:fs');

function lz4(src,size){const out=Buffer.alloc(size);let s=0,d=0;
 while(s<src.length){const token=src[s++];let lit=token>>4;if(lit===15){let b;do{b=src[s++];lit+=b;}while(b===255);}
  src.copy(out,d,s,s+lit);s+=lit;d+=lit;if(s>=src.length)break;
  const off=src[s]|src[s+1]<<8;s+=2;let len=token&15;if(len===15){let b;do{b=src[s++];len+=b;}while(b===255);}len+=4;
  let from=d-off;if(from<0)throw Error('LZ4_BAD_OFFSET');for(let k=0;k<len;k++)out[d++]=out[from++];}
 return d===size?out:out.subarray(0,d);}
function inflate(buf,size,type){if(type===0)return buf;if(type===2||type===3)return lz4(buf,size);throw Error('UNITYFS_COMPRESSION_'+type);}
function cstr(buf,p){const e=buf.indexOf(0,p);return [buf.toString('utf8',p,e),e+1];}

function read(file){
 const b=Buffer.isBuffer(file)?file:fs.readFileSync(file);if(b.toString('latin1',0,7)!=='UnityFS')throw Error('NOT_UNITYFS');
 let p=8;const version=b.readUInt32BE(p);p+=4;let s;[s,p]=cstr(b,p);[s,p]=cstr(b,p);
 p+=8;/* total size */const cInfo=b.readUInt32BE(p),uInfo=b.readUInt32BE(p+4),flags=b.readUInt32BE(p+8);p+=12;
 if(version>=7)p=(p+15)&~15;
 let infoAt=flags&0x80?b.length-cInfo:p;const info=inflate(b.subarray(infoAt,infoAt+cInfo),uInfo,flags&0x3f);
 let data=flags&0x80?p:p+cInfo;if(flags&0x200)data=(data+15)&~15;
 let q=16;const blocks=[],n=info.readInt32BE(q);q+=4;for(let i=0;i<n;i++){blocks.push({u:info.readUInt32BE(q),c:info.readUInt32BE(q+4),f:info.readUInt16BE(q+8)});q+=10;}
 const parts=[];for(const k of blocks){parts.push(inflate(b.subarray(data,data+k.c),k.u,k.f&0x3f));data+=k.c;}
 const all=Buffer.concat(parts),nodes=[],m=info.readInt32BE(q);q+=4;
 for(let i=0;i<m;i++){const off=Number(info.readBigInt64BE(q)),size=Number(info.readBigInt64BE(q+8));q+=20;let name;[name,q]=cstr(info,q);nodes.push({name,data:all.subarray(off,off+size)});}
 return nodes;}
/* E450 One node of a bundle read from the file block by block, for bundles too large to load (夏色四叶草 keeps its
   source scripts in a 3 GB bundle whose serialized file is 333 MB, beside gigabytes of .resS). index: the node to read
   (default the first, the serialized assets); null when the bundle is not UnityFS or the node is over max bytes. */
function readNode(file,index=0,max=1<<30){const fd=fs.openSync(file,'r');
 try{const size=fs.fstatSync(fd).size,rd=(o,n)=>{const b=Buffer.alloc(n);fs.readSync(fd,b,0,n,o);return b;};const head=rd(0,Math.min(size,512));if(head.toString('latin1',0,7)!=='UnityFS')return null;
  let p=8;const version=head.readUInt32BE(p);p+=4;let s;[s,p]=cstr(head,p);[s,p]=cstr(head,p);p+=8;const cInfo=head.readUInt32BE(p),uInfo=head.readUInt32BE(p+4),flags=head.readUInt32BE(p+8);p+=12;if(version>=7)p=(p+15)&~15;
  const info=inflate(rd(flags&0x80?size-cInfo:p,cInfo),uInfo,flags&0x3f);let data=flags&0x80?p:p+cInfo;if(flags&0x200)data=(data+15)&~15;
  let q=16;const blocks=[],n=info.readInt32BE(q);q+=4;for(let i=0;i<n;i++){blocks.push({u:info.readUInt32BE(q),c:info.readUInt32BE(q+4),f:info.readUInt16BE(q+8)});q+=10;}
  const nodes=[],m=info.readInt32BE(q);q+=4;for(let i=0;i<m;i++){const off=Number(info.readBigInt64BE(q)),sz=Number(info.readBigInt64BE(q+8));q+=20;let name;[name,q]=cstr(info,q);nodes.push({name,off,sz});}
  const want=nodes[index];if(!want||want.sz>max)return null;const out=Buffer.alloc(want.sz);let u=0;
  for(const k of blocks){if(u>=want.off+want.sz)break;const end=u+k.u;if(end>want.off){const d=inflate(rd(data,k.c),k.u,k.f&0x3f);const from=Math.max(0,want.off-u),to=Math.min(k.u,want.off+want.sz-u);d.copy(out,u+from-want.off,from,to);}data+=k.c;u=end;}
  return {name:want.name,data:out};}finally{fs.closeSync(fd);}}
// Length-prefixed UTF-8 strings (Unity serialization, 4-byte aligned) holding Japanese or Chinese, in file order.
function strings(buf,min=1){const out=[];for(let i=0;i+4<buf.length;i+=4){const n=buf.readUInt32LE(i);if(n<min||n>4000||i+4+n>buf.length)continue;
  const s=buf.toString('utf8',i+4,i+4+n);if(s.includes('�')||!/[぀-ヿ㐀-鿿]/.test(s)||/[\x00-\x08]/.test(s))continue;out.push({at:i,text:s});i=((i+4+n+3)&~3)-4;}
 return out;}
module.exports={read,readNode,strings,lz4};
