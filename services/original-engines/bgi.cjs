// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// BGI / Ethornell: "BURIKO ARC20" archives whose scenario entries are "DSC FORMAT 1.00" compressed
// (keyed Huffman + LZ) "BurikoCompiledScriptVer1.00" bytecode. Text is Shift-JIS, NUL terminated.
const fs=require('node:fs'),path=require('node:path');
function readArc(file){
 const b=fs.readFileSync(file);if(b.subarray(0,12).toString('latin1')!=='BURIKO ARC20')return null;
 const n=b.readUInt32LE(12),base=16+n*128,entries=[];
 for(let i=0;i<n;i++){const e=16+i*128,name=b.subarray(e,e+96).toString('latin1').replace(/\0[\s\S]*$/,''),offset=b.readUInt32LE(e+96),size=b.readUInt32LE(e+100);if(base+offset+size>b.length)throw Error('BGI_ARC_TRUNCATED');entries.push({name,data:b.subarray(base+offset,base+offset+size)});}
 return entries;
}
function dsc(input){
 if(input.subarray(0,15).toString('latin1')!=='DSC FORMAT 1.00')return input;
 const magic=(input.readUInt16LE(0)<<16)>>>0;let key=input.readUInt32LE(0x10)>>>0;const size=input.readUInt32LE(0x14),count=input.readUInt32LE(0x18);
 const nextKey=()=>{const v0=Math.imul(20021,key&0xffff)>>>0;let v1=(magic|(key>>>16))>>>0;v1=(Math.imul(v1,20021)+Math.imul(key,346))>>>0;v1=(v1+(v0>>>16))&0xffff;key=(((v1<<16)>>>0)+(v0&0xffff)+1)>>>0;return v1&0xff;};
 const codes=[];for(let i=0;i<512;i++){const depth=(input[0x20+i]-nextKey())&0xff;if(depth)codes.push({depth,code:i});}
 codes.sort((a,b)=>a.depth-b.depth||a.code-b.code);
 const parent=new Uint8Array(1024),left=new Uint16Array(1024),right=new Uint16Array(1024),value=new Uint16Array(1024);
 let level=[0],next=1,depth=0,n=0,width=1;
 while(n<codes.length){const children=[];let used=0;while(n<codes.length&&codes[n].depth===depth){const index=level[used++];parent[index]=0;value[index]=codes[n++].code;}width-=used;for(let i=0;i<width;i++){const index=level[used+i];parent[index]=1;left[index]=next;children.push(next++);right[index]=next;children.push(next++);}level=children;depth++;width*=2;}
 const out=Buffer.alloc(size);let pos=0x220,bit=0,cur=0,dst=0;const getBit=()=>{if(!bit){cur=input[pos++];bit=8;}bit--;return (cur>>bit)&1;};
 for(let k=0;k<count&&dst<size;k++){let node=0;do{node=getBit()?right[node]:left[node];}while(parent[node]);const code=value[node];
  if(code>=256){let offset=0;for(let i=0;i<12;i++)offset=(offset<<1)|getBit();offset+=2;let run=(code&0xff)+2;const from=dst-offset;for(let i=0;i<run&&dst<size;i++)out[dst++]=out[from+i];}else out[dst++]=code;}
 return out;
}
const KANA=/[ぁ-ゖァ-ヺ]/g;
function codepage(buffers){const score=enc=>{const dec=new TextDecoder(enc);let bad=0,kana=0;for(const b of buffers){const t=dec.decode(b);bad+=(t.match(/�/g)||[]).length;kana+=(t.match(KANA)||[]).length;}return {bad,kana};};const sj=score('shift_jis'),gbk=score('gbk');return sj.bad<gbk.bad||sj.bad===gbk.bad&&sj.kana>=gbk.kana?'shift_jis':'gbk';}
// Strings live after the bytecode; every text/name operand ("push string", 0x03, offset relative to the code start)
// points into that area. Lines are listed in the order the code uses them, so a patch that reorders or resizes the
// string area still lines up with the original operand for operand.
function scriptLines(data){
 if(!data.subarray(0,28).toString('latin1').startsWith('BurikoCompiledScriptVer1.00'))return null;
 const header=28+data.readUInt32LE(28),refs=[];let stringsAt=data.length;
 for(let p=header;p+8<=data.length;p+=4){if(data.readUInt32LE(p)===3){const off=data.readUInt32LE(p+4);if(off>0&&header+off<data.length&&header+off>p){stringsAt=Math.min(stringsAt,header+off);refs.push(off);}}}
 const raw=[];for(const off of refs){const at=header+off;if(at<stringsAt)continue;let end=data.indexOf(0,at);if(end<0)end=data.length;raw.push(data.subarray(at,end));}
 // Chinese patches store their text as GBK; pick the code page that decodes cleanly.
 const dec=new TextDecoder(codepage(raw));return raw.map(b=>dec.decode(b));
}
const isScript=data=>data.subarray(0,15).toString('latin1').startsWith('DSC FORMAT 1.00')||data.subarray(0,27).toString('latin1').startsWith('BurikoCompiled');
// overlay: scene name (lower case) -> replacement entry data, for patches that ship loose scene files.
function scan(dir,overlay){
 const scenes=[];for(const name of fs.readdirSync(dir).filter(f=>/^data0\d{4}\.arc$/i.test(f)).sort()){let entries;try{entries=readArc(path.join(dir,name));}catch{continue;}if(!entries)continue;
  for(const entry of entries){if(!isScript(entry.data))continue;const replaced=overlay?.get(entry.name.toLowerCase());let data;try{data=dsc(replaced||entry.data);}catch{continue;}const lines=scriptLines(data);if(lines)scenes.push({archive:name,name:entry.name,lines,patched:!!replaced});}}
 return scenes;
}
module.exports={readArc,dsc,scriptLines,scan,codepage,isScript};
