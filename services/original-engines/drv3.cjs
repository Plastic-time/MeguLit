// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E700 Danganronpa V3 (Spike Chunsoft, Steam): scripts live in CPK partitions (cri-cpk.cjs) as SPC containers
   (wrd_script/<chapter>/<name>.SPC), each holding .wrd bytecode and the .stx text tables. SPC layout (DRV3 file format
   notes of BlackDragonHunt's Danganronpa-Tools / DRV3-Sharp): "CPS." + 0x24 unknown bytes, u32 file count at 0x28,
   0x40 "Root" entry; each entry u16 flag (1 plain, 2 compressed), u16 unknown, u32 compressed size, u32 size, u32 name
   length, 0x10 padding, name (+NUL, padded to 16), data (padded to 16). Compression is an LZ with 1024 byte window:
   flag byte (MSB first, 1 = literal), literal byte or u16 {count-2:6 | offset:10}, read from out[len-1024+offset]. */
function spcLz(src,size){const out=Buffer.alloc(size);let p=0,o=0;let flag=0,left=0;
 while(p<src.length&&o<size){if(!left){flag=src[p++];left=8;}const lit=flag&0x80;flag=(flag<<1)&0xff;left--;
  if(lit){out[o++]=src[p++];}
  else{const x=src[p]|src[p+1]<<8;p+=2;const n=(x>>10)+2,off=x&0x3ff;for(let i=0;i<n&&o<size;i++){const q=o-1024+off;out[o]=q>=0?out[q]:0;o++;}}}
 return out;}
function spcList(buf){if(buf.length<0x2c||buf.toString('latin1',0,4)!=='CPS.')return null;const n=buf.readUInt32LE(0x28);let p=0x50;const out=[];
 for(let i=0;i<n&&p+0x20<=buf.length;i++){const flag=buf.readUInt16LE(p),cs=buf.readUInt32LE(p+4),ds=buf.readUInt32LE(p+8),nl=buf.readUInt32LE(p+12);p+=0x20;
  if(nl>buf.length-p)break;
  const name=buf.toString('utf8',p,p+nl);p+=Math.ceil((nl+1)/16)*16;
  // The available bytes of a truncated payload may still contain readable STX text.
  const raw=buf.subarray(p,p+cs);p+=Math.ceil(cs/16)*16;
  out.push({name,read:()=>flag===2?spcLz(raw,ds):raw,size:ds});}
 return out.length||n===0?out:null;}
/* STX text table: "STXT" + language tag, u32 1, u32 table offset (0x0c), u32 table type 8, u32 string count (0x14); (id, offset) pairs;
   UTF-16LE strings, NUL terminated. <CLT=..> / <CLT> colour tags and other <TAG> markup are dropped. */
function stxStrings(b){if(b.length<0x20||b.toString('latin1',0,4)!=='STXT')return [];const tab=b.readUInt32LE(0x0c),n=b.readUInt32LE(0x14);if(n>200000||tab+n*8>b.length)return [];
 const out=[];for(let i=0;i<n;i++){const id=b.readUInt32LE(tab+i*8),off=b.readUInt32LE(tab+i*8+4);let e=off;while(e+1<b.length&&(b[e]||b[e+1]))e+=2;out.push({id,text:b.toString('utf16le',off,e)});}
 out.sort((a,c)=>a.id-c.id);return out;}
const TAG=/<\/?[A-Za-z]+(?:=[^>]*)?>/g;
function parse(buf){const lines=[];for(const s of stxStrings(buf)){const t=s.text.replace(TAG,'').replace(/\r/g,'').trim();if(t)lines.push(t);}return {lines,anchors:[]};}
/* ---- the CPK side: every SPC in a partition whose name says text, and the .stx inside ---- */
const fs=require('node:fs'),path=require('node:path');
const cpk=require('./cri-cpk.cjs');
const {stat}=require('./file-key.cjs');
function cpkFiles(dir){const out=[];const walk=(d,depth)=>{let es;try{es=fs.readdirSync(d,{withFileTypes:true});}catch{return;}
 for(const e of es){const f=path.join(d,e.name);if(e.isDirectory()){if(depth>0&&!/^(save|savedata)/i.test(e.name))walk(f,depth-1);}else if(/\.cpk$/i.test(e.name)&&/partition|data/i.test(e.name))out.push(f);}};walk(dir,3);return out.sort();}
const memo=new Map();
function index(dir){const files=cpkFiles(dir),sig=files.map(f=>f+'|'+stat(f)).join('\n'),hit=memo.get(dir);if(hit&&hit.sig===sig)return hit.list;
 const scenes=[];
 for(const f of files){let l;try{l=cpk.list(f);}catch{l=null;}if(!l)continue;
  for(const e of l){if(!/\.spc$/i.test(e.name)||!/(^|\/)(wrd_script|wrd_data|minigame)\//i.test(e.name)||!/text/i.test(path.basename(e.name))||e.size>64<<20)continue;
   let spc;try{spc=spcList(cpk.read(f,e));}catch{continue;}if(!spc)continue;
   for(const x of spc)if(/\.stx$/i.test(x.name))scenes.push({name:path.basename(e.name).replace(/\.spc$/i,'')+'/'+x.name.replace(/\.stx$/i,''),read:()=>x.read()});}}
 scenes.sort((a,b)=>a.name.localeCompare(b.name,'en',{numeric:true}));{const seen=new Map();for(const sc of scenes){const n=(seen.get(sc.name)||0)+1;seen.set(sc.name,n);if(n>1)sc.name+='~'+n;}}memo.set(dir,{sig,list:scenes});if(memo.size>4)memo.delete(memo.keys().next().value);return scenes;}
const engine={id:'drv3',hint:'data\win\partition_data_win*.cpk（Danganronpa V3 SPC / STX）',
 scenes:dir=>index(dir),archives:()=>[],sources:dir=>cpkFiles(dir).filter(f=>{try{return cpk.list(f)?.some(e=>/wrd_script\//i.test(e.name));}catch{return false;}}),
 parse,test:()=>false};
module.exports={spcLz,spcList,stxStrings,parse,engine};
