// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Leaf PAK of WHITE ALBUM (PC, 1998; GARbro calls it PAK/P8). Format read from the game's own files:
     u32 count, then per entry 28 bytes: name[16] (NUL-padded), u32 stored size, u32 packed (1/0), u32 offset.
   A packed entry is u32 stored size, u32 unpacked size, then LZSS: one flag byte per 8 items, low bit first, 1 = a literal
   byte; 0 = a little-endian u16 w: copy (w & 15) + 3 bytes from ring position w >> 4. The ring is 2048 bytes, starts at 0
   and is zero-filled (positions above 2047 wrap). A length field of 15 is followed by one more byte: length 18 + that byte.
   Every packed file of the game unpacks to exactly its stated size with its input used up exactly.
   WAMES.PAK holds the scenario as n2mesNNN.mes: u32 count, u32 offsets (from the end of that table), NUL-terminated
   strings. A string is a run of commands (#bgx 2004 06, #pcm 047 …) and messages "#name[speaker id]text ko"; inside a
   message k waits for a click, kr starts a new line, %N0000 is the player's name, and a command can sit in the text.
   The Chinese build (中日双语版) adds CNMES.PAK: the same files, strings and messages in GBK, not packed, and its exe reads
   that one. So the running script is CNMES.PAK when it is there, and WAMES.PAK is its original, message by message. */
const fs=require('node:fs'),path=require('node:path'),kit=require('./kit.cjs');
const RING=2048;
function unpack(raw){if(raw.length<8)return Buffer.alloc(0);const full=raw.readUInt32LE(4),src=raw.subarray(8),win=Buffer.alloc(RING),out=Buffer.alloc(full);let r=0,i=0,o=0;
 while(i<src.length&&o<full){const flags=src[i++];
  for(let bit=0;bit<8&&i<src.length&&o<full;bit++){
   if(flags&(1<<bit)){const c=src[i++];out[o++]=c;win[r]=c;r=(r+1)&(RING-1);continue;}
   if(i+1>=src.length)break;const w=src[i]|(src[i+1]<<8);i+=2;let l=(w&15)+3;if((w&15)===15)l=18+(src[i++]||0);
   /* a copy that runs into the ring positions it is writing reads them as they were before it, once the ring has gone
      round (「モタモタし」 came out as 「モタモタΨ」 byte by byte); on the first round it reads what it just wrote
      (「ぷるるるる」 would end in a NUL) */
   const p=w>>4,dist=(r-p)&(RING-1),old=Buffer.alloc(l);for(let k=0;k<l;k++)old[k]=win[(p+k)&(RING-1)];
   for(let k=0;k<l&&o<full;k++){const c=dist&&k>=dist&&o>=RING?old[k]:win[(p+k)&(RING-1)];out[o++]=c;win[r]=c;r=(r+1)&(RING-1);}}}
 return o===full?out:out.subarray(0,o);}
const memo=new Map();
function list(file){let key;try{const st=fs.statSync(file);key=file+'|'+st.size+'|'+(st.mtimeMs|0);}catch{return null;}if(memo.has(key))return memo.get(key);let out=null;
 try{const size=kit.size(file),n=kit.readAt(file,0,4).readUInt32LE(0);
  if(n>0&&n<=4096&&4+n*28<=size){const t=kit.readAt(file,4,n*28);out=[];
   for(let k=0;k<n;k++){const at=k*28,z=t.indexOf(0,at),name=t.toString('latin1',at,z<0||z>at+16?at+16:z),stored=t.readUInt32LE(at+16),packed=t.readUInt32LE(at+20),offset=t.readUInt32LE(at+24);
    /* an empty slot (n2mes007.mes …) is size 0 at offset 0 */
    if(!/^[\x21-\x7e]+\.[A-Za-z0-9]{1,4}$/.test(name)||packed>1||stored&&offset<4+n*28||offset+stored>size){out=null;break;}out.push({name,stored,packed:packed===1,offset});}}}catch{out=null;}
 memo.set(key,out);if(memo.size>16)memo.delete(memo.keys().next().value);return out;}
const read=(file,e)=>{const raw=kit.readAt(file,e.offset,e.stored);return e.packed?unpack(raw):raw;};
function strings(buf){if(buf.length<4)return [];const n=buf.readUInt32LE(0),base=4+n*4;if(!n||n>100000||base>buf.length)return [];const out=[];
 for(let k=0;k<n;k++){const s=base+buf.readUInt32LE(4+k*4);if(s>buf.length)return [];const e=buf.indexOf(0,s);out.push(buf.subarray(s,e<0?buf.length:e));}return out;}
const clean=t=>t.replace(/#[A-Za-z_]+[0-9 ]*/g,'').replace(/%N\d{4}/g,'').replace(/kr/g,'\n').replace(/k/g,'').replace(/\n{2,}/g,'\n').trim();
/* per string, per message: the text of each "#name … ko" ('' when it holds nothing to read) */
/* Shift-JIS when its hiragana (82 9F–82 F1) are a good share of the double-byte text, else GBK: the generic guess took
   some Japanese files for GBK */
function codepage(raw){let kana=0,dbl=0;for(const b of raw)for(let i=0;i+1<b.length;i++)if(b[i]>=0x81){dbl++;if(b[i]===0x82&&b[i+1]>=0x9f&&b[i+1]<=0xf1)kana++;i++;}
 return dbl&&kana>=dbl*.15?'shift_jis':'gbk';}
function units(buf){const raw=strings(buf);if(!raw.length)return [];const dec=new TextDecoder(codepage(raw));
 return raw.map(b=>[...dec.decode(b).matchAll(/#name ?\d*(.*?)ko/g)].map(m=>clean(m[1])));}
function parse(buf){const lines=[];for(const s of units(Buffer.isBuffer(buf)?buf:Buffer.from(buf)))for(const t of s)if(t)lines.push(t);return {lines,anchors:[]};}
function pakFile(dir,name){try{const f=fs.readdirSync(dir).find(n=>n.toLowerCase()===name);return f&&list(path.join(dir,f))?.length?path.join(dir,f):null;}catch{return null;}}
const running=dir=>pakFile(dir,'cnmes.pak')||pakFile(dir,'wames.pak');
const MES=/\.mes$/i;
const engine={
 id:'leaf-pak',hint:'WAMES.PAK',
 scenes(dir){const f=running(dir);if(!f)return [];return list(f).filter(e=>MES.test(e.name)&&e.stored>=8).map(e=>({name:e.name,read:()=>read(f,e)}));},
 archives:()=>[],
 sources:dir=>{const f=running(dir);return f?[f]:[];},
 parse,test:()=>false,
 /* the Chinese build's original: WAMES.PAK message by message; '' where a string's message counts differ */
 originalLines(dir){const run=running(dir),ja=pakFile(dir,'wames.pak');if(!run||!ja||run===ja)return null;const own=new Map(list(ja).map(e=>[e.name.toLowerCase(),e]));
  return engine.scenes(dir).flatMap(s=>{let rs=[],js=null;try{rs=units(s.read());}catch{}const e=own.get(s.name.toLowerCase());try{js=e&&units(read(ja,e));}catch{}
   return rs.flatMap((msgs,k)=>{const o=js?.[k];return msgs.flatMap((t,i)=>t?[o&&o.length===msgs.length?o[i]:'']:[]);});});},
};
module.exports={engine,list,read,unpack,strings,units,parse,clean};
