// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* #303 AQUAPLUS "Filename" PCK (WHITE ALBUM -綴られる冬の想い出- PC). Every number is big-endian (the PS3 release's
   engine). Format read from the game's own files:
     "Filename" u32 end of the name block, then u32 name offsets (from byte 12; the first one also gives the count),
                then the NUL-terminated names;
     "Pack    " (4-aligned after the names) u32 size, u32 count, then {u32 offset, u32 size} per entry in name order,
                offsets from the start of the file.
   Data/Game/Script.sdat holds one <scene>.MES.BIN per scene (Script_c.sdat is the Chinese patch's copy, drawn with its
   own font atlas over Shift-JIS codes, so it is not read here). A message is
     0F <u32 id> <u16 speaker> <u8 flag> <Shift-JIS text> 00     (a choice: speaker FFFF, flag FF)
   and the ids go up across the whole script; dialogue, narration and choices share them, so a scene's ids can skip.
   In the text \n is a line break, \k and \m wait for a key, <R漢字|よみ> is ruby and <c4名前> colours a name. */
const fs=require('node:fs'),path=require('node:path'),kit=require('./kit.cjs');
const SCRIPTS=['Data/Game/Script.sdat','Data/Script.sdat','Script.sdat'];
const MES=/\.MES\.BIN$/i;
const memo=new Map();
function list(file){let key;try{key=file+'|'+kit.size(file)+'|'+(fs.statSync(file).mtimeMs|0);}catch{return null;}if(memo.has(key))return memo.get(key);let out=null;
 try{const fsz=kit.size(file),h=kit.readAt(file,0,16);
  if(fsz>=32&&h.toString('latin1',0,8)==='Filename'){const end=h.readUInt32BE(8),first=h.readUInt32BE(12),count=first/4;
   if(end>16&&end<=Math.min(fsz,16<<20)&&Number.isInteger(count)&&count>0&&count<=200000&&12+first<=end){
    const head=kit.readAt(file,0,Math.min(fsz,((end+3)&~3)+16+count*8)),pk=(end+3)&~3;
    if(head.toString('latin1',pk,pk+8)==='Pack    '&&head.readUInt32BE(pk+12)===count&&head.length>=pk+16+count*8){out=[];
     for(let i=0;i<count;i++){const at=12+head.readUInt32BE(12+i*4),z=head.indexOf(0,at);if(at>=end||z<0||z>end){out=null;break;}
      const offset=head.readUInt32BE(pk+16+i*8),size=head.readUInt32BE(pk+20+i*8);if(offset+size>fsz){out=null;break;}
      out.push({name:head.toString('latin1',at,z),offset,size});}}}}}catch{out=null;}
 memo.set(key,out);if(memo.size>16)memo.delete(memo.keys().next().value);return out;}
const read=(file,e)=>kit.readAt(file,e.offset,e.size);
/* the messages of one scene, in order: a record whose id does not go up (or jumps far) is a 0F byte inside something else */
function messages(d){const out=[];let prev=-1;
 for(let p=0;p+9<d.length;p++){if(d[p]!==0x0f)continue;const id=d.readUInt32BE(p+1),speaker=d.readUInt16BE(p+5),flag=d[p+7];
  const choice=speaker===0xffff&&flag===0xff;if(!choice&&(flag>1||speaker>0xfff)||prev>=0&&(id<=prev||id>prev+256))continue;
  const z=d.indexOf(0,p+8);if(z<0)break;const t=d.subarray(p+8,z);if(t.length<2||!t.some(c=>c>=0x80))continue;
  const s=kit.SJIS.decode(t);if(s.includes('�'))continue;
  out.push({id,speaker,text:s});prev=id;p=z;}
 return out;}
const RUBY=/<R([^|>]*)\|([^>]*)>/g;
const clean=s=>s.replace(RUBY,'$1').replace(/<c\d*([^>]*)>/g,'$1').replace(/<[^>]*>/g,'').replace(/\\n/g,'\n').replace(/\\[a-z]/gi,'').trim();
function parse(buf){const lines=[],ruby=[];
 for(const m of messages(Buffer.isBuffer(buf)?buf:Buffer.from(buf))){const t=clean(m.text);if(!t)continue;
  const pairs=[];for(const r of m.text.matchAll(RUBY))if(r[1]&&r[2])pairs.push([r[1],r[2]]);lines.push(t);ruby.push(pairs.length?pairs:null);}
 return {lines,anchors:[],...(ruby.some(Boolean)?{ruby}:{})};}
function scriptFile(dir){for(const rel of SCRIPTS){const f=path.join(dir,rel);if(kit.isFile(f)&&list(f)?.some(e=>MES.test(e.name)))return f;}return null;}
const engine={
 id:'aquaplus-pck',hint:'Data/Game/Script.sdat',
 scenes(dir){const f=scriptFile(dir);if(!f)return [];return list(f).filter(e=>MES.test(e.name)).map(e=>({name:e.name,read:()=>read(f,e)}));},
 archives:()=>[],
 sources:dir=>{const f=scriptFile(dir);return f?[f]:[];},
 parse,test:()=>false,
};
module.exports={engine,list,read,messages,parse,clean};
