// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E355 UnityFS asset bundles (Unity 2019+ / 6000, used by Naninovel games such as 魔法少女ノ魔女裁判): header, block and
// directory info, then LZ4 / LZ4HC blocks (uncompressed and LZMA-less only). Returns the files inside (serialized assets).
const fs=require('node:fs');

function lz4(src,size){const out=Buffer.alloc(size);let s=0,d=0;
 const length=n=>{if(n!==15)return n;let b;do{if(s>=src.length)throw Error('LZ4_TRUNCATED');b=src[s++];n+=b;}while(b===255);return n;};
 while(s<src.length){const token=src[s++],lit=length(token>>4);
  if(s+lit>src.length||d+lit>size)throw Error('LZ4_LITERAL_SIZE');
  src.copy(out,d,s,s+lit);s+=lit;d+=lit;if(s>=src.length)break;
  if(s+2>src.length)throw Error('LZ4_TRUNCATED');
  const off=src[s]|src[s+1]<<8;s+=2;const len=length(token&15)+4;
  let from=d-off;if(!off||from<0)throw Error('LZ4_BAD_OFFSET');if(d+len>size)throw Error('LZ4_MATCH_SIZE');
  for(let k=0;k<len;k++)out[d++]=out[from++];}
 return d===size?out:out.subarray(0,d);}
/* E700 type 1 = LZMA (lzma.cjs): Unity's default for BuildAssetBundle without ChunkBasedCompression */
function inflate(buf,size,type){if(type===0)return buf;if(type===2||type===3)return lz4(buf,size);if(type===1)return require('./lzma.cjs').decode(buf,size);throw Error('UNITYFS_COMPRESSION_'+type);}
/* E700 where the bundle starts: 0, or the offset of "UnityFS\0" when a game pads its bundles with a prefix of its own
   (a common light protection); -1 when there is none in the first 64 KB */
const SIG=Buffer.from('UnityFS\0','latin1');
function start(head){if(head.length>=8&&head.subarray(0,8).equals(SIG))return 0;const i=head.indexOf(SIG);return i;}
function cstr(buf,p){const e=buf.indexOf(0,p);return [buf.toString('utf8',p,e),e+1];}

function openInfo(fd){
 const full=fs.fstatSync(fd).size;
 const h16=Buffer.alloc(Math.min(full,16));fs.readSync(fd,h16,0,h16.length,0);
 let at=h16.length>=8&&h16.subarray(0,8).equals(SIG)?0:-1;
 if(at<0){const h64=Buffer.alloc(Math.min(full,65536));fs.readSync(fd,h64,0,h64.length,0);at=start(h64);}
 if(at<0)return null;
 const size=full-at,rd=(o,n)=>{const b=Buffer.alloc(n);fs.readSync(fd,b,0,n,o+at);return b;};
 const head=rd(0,Math.min(size,512));
 let p=8;const version=head.readUInt32BE(p);p+=4;let s;[s,p]=cstr(head,p);[s,p]=cstr(head,p);p+=8;
 const cInfo=head.readUInt32BE(p),uInfo=head.readUInt32BE(p+4),flags=head.readUInt32BE(p+8);p+=12;
 if(version>=7)p=(p+15)&~15;
 const info=inflate(rd(flags&0x80?size-cInfo:p,cInfo),uInfo,flags&0x3f);
 let data=flags&0x80?p:p+cInfo;if(flags&0x200)data=(data+15)&~15;
 let q=16;const blocks=[],n=info.readInt32BE(q);q+=4;
 let cOff=data,uOff=0;
 for(let i=0;i<n;i++){const u=info.readUInt32BE(q),c=info.readUInt32BE(q+4),f=info.readUInt16BE(q+8);q+=10;blocks.push({u,c,f,cOff,uOff});cOff+=c;uOff+=u;}
 const nodes=[],m=info.readInt32BE(q);q+=4;
 for(let i=0;i<m;i++){const off=Number(info.readBigInt64BE(q)),sz=Number(info.readBigInt64BE(q+8));q+=20;let name;[name,q]=cstr(info,q);nodes.push({name,off,sz,index:i});}
 return {rd,blocks,nodes};
}

function readSpan(meta,cache,off,len){
 const out=Buffer.alloc(len),end=off+len;
 for(let i=0;i<meta.blocks.length;i++){
  const k=meta.blocks[i];if(k.uOff>=end)break;
  const kEnd=k.uOff+k.u;if(kEnd<=off)continue;
  let d=cache.get(i);
  if(!d){d=inflate(meta.rd(k.cOff,k.c),k.u,k.f&0x3f);cache.set(i,d);}
  const from=Math.max(0,off-k.uOff),to=Math.min(k.u,end-k.uOff);
  d.copy(out,k.uOff+from-off,from,to);
 }
 return out;
}

function serializedHeaderEnd(head,sz){
 if(head.length<48)return 0;
 const ver=head.readUInt32BE(8);
 if(ver<9||ver>40)return 0;
 const dataOffset=ver>=22?Number(head.readBigUInt64BE(32)):head.readUInt32BE(12);
 return dataOffset>0&&dataOffset<=sz?dataOffset:0;
}

function read(file,{maxUnpacked,check=()=>{},consume=()=>{}}={}){
 const bounded=maxUnpacked!==undefined;
 let b=Buffer.isBuffer(file)?file:fs.readFileSync(file);const at=start(b.subarray(0,65536));if(at<0)throw Error('NOT_UNITYFS');if(at)b=b.subarray(at);
 let p=8;const version=b.readUInt32BE(p);p+=4;
 for(let i=0;i<2;i++){
  const end=b.indexOf(0,p);
  if(bounded&&(end<0||end-p>128))throw Error('UNITYFS_HEADER');
  p=end+1;
 }
 if(bounded&&(version<6||version>8||b.readBigUInt64BE(p)!==BigInt(b.length)))throw Error('UNITYFS_HEADER');
 p+=8;/* total size */const cInfo=b.readUInt32BE(p),uInfo=b.readUInt32BE(p+4),flags=b.readUInt32BE(p+8);p+=12;
 if(version>=7)p=(p+15)&~15;
 const infoAt=flags&0x80?b.length-cInfo:p;
 if(bounded&&(cInfo>1<<20||uInfo>1<<20))throw Error('EMBEDDED_BUNDLE_BUDGET');
 if(bounded&&(infoAt<p||infoAt+cInfo>b.length||uInfo<24))throw Error('UNITYFS_HEADER');
 const info=inflate(b.subarray(infoAt,infoAt+cInfo),uInfo,flags&0x3f);
 let data=flags&0x80?p:p+cInfo;if(flags&0x200)data=(data+15)&~15;
 let q=16;const blocks=[],n=info.readInt32BE(q);q+=4;
 if(bounded&&(n<1||n>1024||n*10+q+4>info.length||info.length!==uInfo))throw Error('UNITYFS_BLOCK_TABLE');
 let unpacked=0,packed=0;
 for(let i=0;i<n;i++){
  const u=info.readUInt32BE(q),c=info.readUInt32BE(q+4),f=info.readUInt16BE(q+8);q+=10;
  blocks.push({u,c,f});unpacked+=u;packed+=c;
 }
 if(bounded&&unpacked>maxUnpacked)throw Error('EMBEDDED_BUNDLE_BUDGET');
 if(bounded&&data+packed>(flags&0x80?infoAt:b.length))throw Error('UNITYFS_BLOCK_TABLE');
 const nodes=[],m=info.readInt32BE(q);q+=4;
 if(bounded&&(m<1||m>256||m*21+q>info.length))throw Error('UNITYFS_NODE_TABLE');
 for(let i=0;i<m;i++){
  const off=Number(info.readBigInt64BE(q)),size=Number(info.readBigInt64BE(q+8));q+=20;
  const end=info.indexOf(0,q);
  if(bounded&&(end<0||off<0||size<0||off+size>unpacked))throw Error('UNITYFS_NODE_TABLE');
  nodes.push({name:info.toString('utf8',q,end),off,size});q=end+1;
 }
 consume(unpacked);
 const parts=[];
 for(const k of blocks){
  check();
  const part=inflate(b.subarray(data,data+k.c),k.u,k.f&0x3f);data+=k.c;
  if(bounded&&part.length!==k.u)throw Error('UNITYFS_BLOCK_SIZE');
  parts.push(part);
 }
 const all=Buffer.concat(parts);
 return nodes.map(({name,off,size})=>({name,data:all.subarray(off,off+size)}));
}
/* E450 One node of a bundle read from the file block by block, for bundles too large to load (夏色四叶草 keeps its
   source scripts in a 3 GB bundle whose serialized file is 333 MB, beside gigabytes of .resS). index: the node to read
   (default the first, the serialized assets); null when the bundle is not UnityFS or the node is over max bytes. */
/* E452 range {off, len}: that part of the node only (one AudioClip of a voice bundle's .resource) */
function readNode(file,index=0,max=1<<30,range=null){const fd=fs.openSync(file,'r');
 try{const meta=openInfo(fd);if(!meta)return null;
  let want=meta.nodes[index];if(want&&range){if(range.off<0||range.off+range.len>want.sz)return null;want={name:want.name,off:want.off+range.off,sz:range.len};}
  if(!want||want.sz>max)return null;
  return {name:want.name,data:readSpan(meta,new Map(),want.off,want.sz)};
 }finally{fs.closeSync(fd);}}
/* E700 the node table of a bundle (name, size), without inflating any data block */
function list(file){const fd=fs.openSync(file,'r');
 try{const meta=openInfo(fd);return meta?meta.nodes.map(n=>({name:n.name,size:n.sz,index:n.index})):null;}catch{return null;}finally{fs.closeSync(fd);}}
/* Single-open bundle inspection: inflates only the front bytes needed for SerializedFile object table, and reads full/prefix node bytes only when wantFn(head, node) returns truthy (true = full node, number = needed byte prefix). */
function readMatchingNodes(file,wantFn,maxNode=96*1024*1024){const fd=fs.openSync(file,'r');
 try{const meta=openInfo(fd);if(!meta)return [];
  const cache=new Map(),out=[];
  for(const n of meta.nodes){
   if(/\.(resS|resource|ress)$/i.test(n.name)||n.sz>maxNode||n.sz<64)continue;
   let head=readSpan(meta,cache,n.off,Math.min(n.sz,64));
   const need=serializedHeaderEnd(head,n.sz);
   if(need>head.length)head=readSpan(meta,cache,n.off,need);
   else if(!need&&n.sz>head.length)head=readSpan(meta,cache,n.off,Math.min(n.sz,65536));
   const decision=wantFn(head,n);
   if(!decision)continue;
   const wantLen=typeof decision==='number'&&decision>0?Math.min(n.sz,decision):n.sz;
   const data=wantLen<=head.length?head.subarray(0,wantLen):readSpan(meta,cache,n.off,wantLen);
   out.push({name:n.name,data});
  }
  return out;
 }catch{return [];}finally{fs.closeSync(fd);}}
// Length-prefixed UTF-8 strings (Unity serialization, 4-byte aligned) holding Japanese or Chinese, in file order.
function strings(buf,min=1){const out=[];for(let i=0;i+4<buf.length;i+=4){const n=buf.readUInt32LE(i);if(n<min||n>4000||i+4+n>buf.length)continue;
  const s=buf.toString('utf8',i+4,i+4+n);if(s.includes('\ufffd')||!/[぀-ヿ㐀-鿿]/.test(s)||/[\x00-\x08]/.test(s))continue;out.push({at:i,text:s});i=((i+4+n+3)&~3)-4;}
 return out;}
module.exports={read,readNode,readMatchingNodes,strings,lz4,start,list};
