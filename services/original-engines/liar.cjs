// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E571 codeX RScript — Liar-soft's engine (also raiL-soft, Studio Ubai, SUKARADOG …: 腐り姫, 赫炎のインガノック,
   誰ソ彼のシェイプシフター, 蛟の巫女). VNDB tags ~211 company releases, 91 since 2016.
   Format references (read, not copied): GARbro ArcFormats/Liar/ArcXFL.cs (morkt, MIT) for the archive and
   TesterTesterov/gscScriptCompAndDecompiler (GPL-3.0) for the script.
     *.xfl   "LB\x01\0", u32 index size, u32 count, count × {char name[32] cp932, u32 offset (from 12 + index size),
             u32 size}; an entry that is itself an .xfl with the signature is a folder
     *.gsc   i32 file size, i32 header size, i32 command section size, i32 string-offset section size, i32 string
             section size, … then the header's other fields; commands; i32 offsets (relative to the string section);
             the NUL-terminated cp932 strings. "^n" is a line break, other ^x codes are display codes.
   The compiler stores strings in the order the script uses them (MESSAGE's speaker and text, choices, labels), so the
   string table in order is the script's text in order, and the reader does not depend on the per-title command set
   (the decompiler's command table differs between titles). ASCII strings (file and directory names) are anchors. */
const fs=require('node:fs'),path=require('node:path');
const {decoder}=require('./codepage.cjs');
const SIG=0x0001424c;
function xflList(file){let fd;try{fd=fs.openSync(file,'r');}catch{return null;}
 try{const size=fs.fstatSync(fd).size,out=[];
  const dir=(base,max,prefix,depth)=>{const h=Buffer.alloc(12);if(fs.readSync(fd,h,0,12,base)<12||h.readUInt32LE(0)!==SIG)return false;
   const idx=h.readUInt32LE(4),count=h.readInt32LE(8),data=base+12+idx;if(count<=0||count>200000||data>max||count*40>idx)return false;
   const t=Buffer.alloc(count*40);fs.readSync(fd,t,0,t.length,base+12);
   for(let i=0;i<count;i++){const p=i*40,raw=t.subarray(p,p+32),z=raw.indexOf(0),name=new TextDecoder('shift_jis').decode(raw.subarray(0,z<0?32:z)),offset=data+t.readUInt32LE(p+32),len=t.readUInt32LE(p+36);
    if(offset+len>max)return false;const full=prefix?prefix+'/'+name:name;
    if(/\.xfl$/i.test(name)&&depth<4){const s=Buffer.alloc(4);fs.readSync(fd,s,0,4,offset);if(s.readUInt32LE(0)===SIG&&dir(offset,offset+len,full,depth+1))continue;}
    out.push({name:full,offset,size:len});}
   return true;};
  return dir(0,size,'',0)?out:null;}finally{fs.closeSync(fd);}}
function xflRead(file,e){const fd=fs.openSync(file,'r');try{const b=Buffer.alloc(e.size);fs.readSync(fd,b,0,e.size,e.offset);return b;}finally{fs.closeSync(fd);}}

/* the string table of a .gsc, in order, or null */
function gscStrings(buf){const b=Buffer.isBuffer(buf)?buf:Buffer.from(buf);if(b.length<20)return null;
 const head=b.readInt32LE(4),cmd=b.readInt32LE(8),decl=b.readInt32LE(12),def=b.readInt32LE(16);
 if(head<20||head>256||cmd<0||decl<0||def<0||decl%4||head+cmd+decl+def>b.length)return null;
 /* the file size field is the whole file (some files carry trailing zeros, never less) */
 if(b.readInt32LE(0)>b.length||b.readInt32LE(0)<head+cmd+decl+def)return null;
 const at=head+cmd,base=at+decl,out=[];
 for(let i=0;i<decl/4;i++){const o=b.readInt32LE(at+i*4);if(o<0||o>=def)return null;const e=b.indexOf(0,base+o);out.push(b.subarray(base+o,e<0||e>base+def?base+def:e));}
 return out;}
const clean=t=>t.replace(/\^n/g,'\n').replace(/\^[a-zA-Z]/g,'').replace(/^[\s　]+|[\s　]+$/g,'');
function parse(buf){const list=gscStrings(buf);if(!list)return {lines:[],anchors:[]};const dec=decoder(list),lines=[],anchors=[];
 for(const s of list){if(!s.length)continue;if(!s.some(c=>c>=0x80)){anchors.push(s.toString('latin1'));continue;}const t=clean(dec.decode(s));if(t)lines.push(t);}
 return {lines,anchors};}

const GSC=n=>/\.gsc$/i.test(n);
function archives(dir){let names;try{names=fs.readdirSync(dir);}catch{return [];}
 return names.filter(n=>/\.xfl$/i.test(n)).map(n=>path.join(dir,n)).filter(f=>{const l=xflList(f);return l&&l.some(e=>GSC(e.name));});}
function scenes(dir){const out=new Map();
 for(const a of archives(dir)){for(const e of xflList(a))if(GSC(e.name))out.set(path.posix.basename(e.name).toLowerCase(),{name:path.posix.basename(e.name),read:()=>xflRead(a,e)});}
 for(const d of [dir,path.join(dir,'scr')]){let names;try{names=fs.readdirSync(d);}catch{continue;}for(const n of names)if(GSC(n))out.set(n.toLowerCase(),{name:n,read:()=>fs.readFileSync(path.join(d,n))});}
 return [...out.values()].sort((a,b)=>a.name.localeCompare(b.name));}
const engine={
 id:'liar',hint:'scr.xfl（*.gsc）',
 scenes,archives:scenes,
 sources:dir=>{const out=archives(dir);for(const d of [dir,path.join(dir,'scr')]){try{for(const n of fs.readdirSync(d))if(GSC(n))out.push(path.join(d,n));}catch{}}return out;},
 parse,test:GSC,
};
module.exports={engine,parse,xflList,xflRead,gscStrings,SIG};
