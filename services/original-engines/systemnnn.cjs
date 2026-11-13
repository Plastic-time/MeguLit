// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E570 System-NNN (Tinyan's engine: CYCLET, metalogiq, Black Cyc, Mio — 浅き夢見し, 魔法少女消耗戦線, 鏖殺ノ乙女 …).
   Format references (read, not copied): the engine source tinyan/SystemNNN (nnnLib/execscript.cpp LoadScript /
   GetMessagePtr / GetStringPtr) and devseed's GalgameReverse project/systemnnn/src/systemnnn_spt.py (command layout).
     spt/*.spt  loose story scripts. Every dword is XOR'd with 0xFFFFFFFF (the engine's m_xorCode; m_addXorCode and
                m_addIncCode are 0 in the released engine, a title can change them: the key is then recovered from the
                header command, whose id and code are known)
     header     dword 4 message count, 5 message table, 6 string count, 7 string table (dword indices); a message is the
                cp932 C string at byte 4 × table[index]
     commands   from dword 0: {op_params (length in dwords), op_id 0x6666000x, op_code, args...}. PRINT / LPRINT / APPEND
                (0x22220001-3) show message args[0]; SELECT (0x22220006) shows strings args[1..sel+mes], sel = args[0],
                mes = the command's last dword.
   Lines are the shown messages and choices in command order, so a patch that appends its own text section and repoints
   the tables (how translation tools rebuild an spt) still pairs line by line. */
const fs=require('node:fs'),path=require('node:path');
const {decoder}=require('./codepage.cjs');
const ID_DATA=0x66660001,CODE_HEADER=0x55550001,PRINT=new Set([0x22220001,0x22220002,0x22220003]),SELECT=0x22220006;

function decode(buf,key=0xffffffff,addXor=0,addInc=0){const n=buf.length>>>2,out=Buffer.alloc(n*4);let x=key>>>0,inc=0;
 for(let i=0;i<n;i++){out.writeUInt32LE(((buf.readUInt32LE(i*4)^x)+inc)>>>0,i*4);x=(x+addXor)>>>0;inc=(inc+addInc)>>>0;}return out;}
/* the plain dwords, or null when this is not a System-NNN script */
function plain(buf){if(!buf||buf.length<40)return null;
 let d=decode(buf);if(d.readUInt32LE(4)===ID_DATA&&d.readUInt32LE(8)===CODE_HEADER)return d;
 /* another fixed key: id XOR 0x66660001 gives it, the code confirms it */
 const key=(buf.readUInt32LE(4)^ID_DATA)>>>0;d=decode(buf,key);if(d.readUInt32LE(8)===CODE_HEADER)return d;
 /* an unencrypted (already decoded) script */
 if(buf.readUInt32LE(4)===ID_DATA&&buf.readUInt32LE(8)===CODE_HEADER)return Buffer.from(buf.subarray(0,buf.length&~3));
 return null;}
function cstr(d,byteAt){if(byteAt<0||byteAt>=d.length)return null;const e=d.indexOf(0,byteAt);return d.subarray(byteAt,e<0?d.length:e);}
/* the strings a script shows, in order: {kind:'message'|'choice', bytes} */
function shown(d){const n=d.length>>>2,w=i=>i<n?d.readUInt32LE(i*4):0,out=[];
 const msgTable=w(5),strTable=w(7),msgCount=w(4),strCount=w(6);
 const message=k=>k<msgCount&&msgTable+k<n?cstr(d,w(msgTable+k)*4):null,string=k=>k<strCount&&strTable+k<n?cstr(d,w(strTable+k)*4):null;
 for(let i=0,guard=0;i+2<n&&guard<1e6;guard++){const len=w(i),id=w(i+1),code=w(i+2);if(len<3||(id>>>4)!==0x6666000)break;
  if(PRINT.has(code)){const b=message(w(i+3));if(b)out.push({kind:'message',bytes:b});}
  else if(code===SELECT){const sel=w(i+3),mes=w(i+len-1),total=sel+mes;if(total<64)for(let k=0;k<total;k++){const b=string(w(i+4+k));if(b)out.push({kind:'choice',bytes:b});}}
  i+=len;}
 return out;}
/* #［...］ notes and #X colour / glyph codes (#心 #赤 …) are display codes; \r\n is a line break */
const clean=t=>t.replace(/#［[^］]*］/g,'').replace(/#[名心桃足猫黄赤青緑白黒]/g,'').replace(/\r\n|\r/g,'\n').replace(/^[\s　]+|[\s　]+$/g,'');
function parse(buf){const d=plain(Buffer.isBuffer(buf)?buf:Buffer.from(buf));if(!d)return {lines:[],anchors:[]};
 const list=shown(d),dec=decoder(list.map(x=>x.bytes)),lines=[],anchors=[];
 for(const x of list){const t=clean(dec.decode(x.bytes));if(!t)continue;if(/^[\x20-\x7e]+$/.test(t))anchors.push(t);else lines.push(t);}
 return {lines,anchors};}

const SPT=n=>/\.spt$/i.test(n);
function files(dir){const out=new Map();for(const d of [dir,path.join(dir,'spt'),path.join(dir,'override','spt')]){let names;try{names=fs.readdirSync(d);}catch{continue;}
 for(const n of names)if(SPT(n))out.set(n.toLowerCase(),path.join(d,n));}return out;}
function scenes(dir){return [...files(dir)].sort((a,b)=>a[0].localeCompare(b[0])).map(([,f])=>({name:path.basename(f),read:()=>fs.readFileSync(f)}));}
const engine={
 id:'systemnnn',hint:'spt\\*.spt',
 scenes,archives:scenes,sources:dir=>[...files(dir).values()],
 parse,test:SPT,
};
module.exports={engine,parse,decode,plain,shown,clean};
