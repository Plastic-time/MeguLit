// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E700 FPD containers ("FPD\0", the fz engine of Fate/stay night REMASTERED: obb/pack*.bin, obb/patch*.bin; #396).
   Layout, read off the game's own reader (no title constants here):
     header 0x38 bytes: "FPD\0", u32 BE version, u64 BE count, u64 BE index end (file offset), zeros
     index (0x38 .. index end) XOR key[i & 0xffff], i counted from 0:
       count × 32 bytes, u64 BE each: name offset, data offset (from index end), stored size, unpacked size (0 = stored)
       then the names: version >= 2 a zlib stream of NUL-terminated UTF-8 paths, else the paths as they are
     an entry: stored bytes XOR key[j & 0xffff], j counted from the entry's own start; inflated when unpacked size > 0
   The 64 KB key is built by the program at start-up: a static table in .data, and for block i (0..4095, 16 bytes each)
   XOR MD5(key string ‖ BE32(crc)), crc = CRC-32 of BE32(i) continued from a constant state. Everything is taken from the
   program: the table by the builder's 16 "xor byte [base+idx+table+k], r8" stores, the crc state from its two xor
   immediates, the key string from the "lea rcx,[string]" before a call to it. A SteamStub 3.1 (x64) .text is decrypted
   first (its AES key sits in the stub header). The result is checked against the archive (the first entry starts at
   name 0 / data 0), and a program whose builder is found but whose key string is not gets every short string tried. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');

const MAGIC='FPD\0',HEADER=0x38,KEY_SIZE=0x10000;

/* ---- files ---------------------------------------------------------------------------------------------------- */
function readAt(file,pos,n){const fd=fs.openSync(file,'r');try{const b=Buffer.alloc(n);const got=fs.readSync(fd,b,0,n,pos);return got<n?b.subarray(0,got):b;}finally{fs.closeSync(fd);}}
function isFpd(file){try{return readAt(file,0,4).toString('latin1')===MAGIC;}catch{return false;}}
/* FPD archives in the folder and its direct sub folders (obb/), patch* after the rest so a patch entry wins */
function archives(dir){const out=[];const look=(d,depth)=>{let names=[];try{names=fs.readdirSync(d,{withFileTypes:true});}catch{return;}
  for(const e of names){const p=path.join(d,e.name);if(e.isDirectory()){if(depth<1)look(p,depth+1);}else if(e.isFile()&&/\.bin$/i.test(e.name)&&isFpd(p))out.push(p);}};
 look(dir,0);const rank=f=>/^patch/i.test(path.basename(f))?1:0;return out.sort((a,b)=>rank(a)-rank(b)||a.localeCompare(b));}
function programs(dir){let names=[];try{names=fs.readdirSync(dir);}catch{return [];}
 return names.filter(n=>/\.exe$/i.test(n)&&!/^(unins|setup|install|crash|vc_?redist|dxsetup)/i.test(n)).map(n=>path.join(dir,n)).filter(f=>{try{return fs.statSync(f).isFile();}catch{return false;}})
  .sort((a,b)=>fs.statSync(b).size-fs.statSync(a).size);}

/* ---- PE image ------------------------------------------------------------------------------------------------- */
function peImage(buf){
 if(buf.length<0x40||buf.toString('latin1',0,2)!=='MZ')return null;const pe=buf.readUInt32LE(0x3c);if(pe+24>buf.length||buf.toString('latin1',pe,pe+4)!=='PE\0\0')return null;
 const n=buf.readUInt16LE(pe+6),opt=buf.readUInt16LE(pe+20),o=pe+24,magic=buf.readUInt16LE(o),x64=magic===0x20b;
 const entry=buf.readUInt32LE(o+16),imageBase=x64?Number(buf.readBigUInt64LE(o+24)):buf.readUInt32LE(o+28),dirs=o+(x64?112:96);
 const dir=k=>({rva:buf.readUInt32LE(dirs+k*8),size:buf.readUInt32LE(dirs+k*8+4)});
 const sections=[];for(let i=0,s=o+opt;i<n;i++,s+=40){const vsize=buf.readUInt32LE(s+8),va=buf.readUInt32LE(s+12),rawSize=buf.readUInt32LE(s+16),raw=buf.readUInt32LE(s+20);
  sections.push({name:buf.toString('latin1',s,s+8).replace(/\0.*$/,''),va,vsize,raw,rawSize,data:buf.subarray(raw,Math.min(buf.length,raw+rawSize))});}
 const img={x64,entry,imageBase,sections,exception:dir(3),
  section:rva=>sections.find(s=>rva>=s.va&&rva<s.va+Math.max(s.vsize,s.rawSize)),
  read(rva,len){const s=img.section(rva);if(!s)return Buffer.alloc(0);const at=rva-s.va;return s.data.subarray(at,Math.min(s.data.length,at+len));},
  code:()=>sections.find(s=>s.va<=entry&&entry<s.va+s.vsize&&!/bind/i.test(s.name))||sections.find(s=>/^\.text$/i.test(s.name))||sections[0]};
 return img;}

/* SteamStub 3.1 (x64): the stub header sits 0xF0 bytes before the entry point in .bind, XOR-chained by its first dword;
   the code section is AES-256-CBC with the header's key, the IV itself ECB-encrypted, 16 stolen bytes in front.
   (Steamless documents the same layout.) The image is changed in memory only. */
function unstub(img){
 const bind=img.section(img.entry);if(!bind||!/bind/i.test(bind.name))return false;const at=img.entry-bind.va-0xf0;if(at<0||at+0xf0>bind.data.length)return false;
 const h=Buffer.from(bind.data.subarray(at,at+0xf0));let key=h.readUInt32LE(0);for(let i=4;i<0xf0;i+=4){const v=h.readUInt32LE(i);h.writeUInt32LE((v^key)>>>0,i);key=v;}
 if(h.readUInt32LE(4)!==0xc0dec0df)return false;if(h.readUInt32LE(60)&4)return false;/* NoEncryption */
 const codeVa=Number(h.readBigUInt64LE(72)),code=img.sections.find(s=>s.va===codeVa);if(!code)return false;
 const aesKey=h.subarray(88,120),ivEnc=h.subarray(120,136),stolen=h.subarray(136,152);
 try{const e=crypto.createDecipheriv('aes-256-ecb',aesKey,null);e.setAutoPadding(false);const iv=Buffer.concat([e.update(ivEnc),e.final()]);
  const body=Buffer.concat([stolen,code.data]),usable=body.length-body.length%16;const d=crypto.createDecipheriv('aes-256-cbc',aesKey,iv);d.setAutoPadding(false);
  code.data=Buffer.concat([d.update(body.subarray(0,usable)),d.final()]);img.unstubbed=true;return true;}catch{return false;}}

/* ---- the key builder ------------------------------------------------------------------------------------------ */
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function blockCrc(state,i){let s=state>>>0;for(const b of [i>>>24,(i>>>16)&255,(i>>>8)&255,i&255])s=(CRC[(s^b)&255]^(s>>>8))>>>0;return (~s)>>>0;}
function be32(v){return Buffer.from([v>>>24,(v>>>16)&255,(v>>>8)&255,v&255]);}
/* the 16 bytes block i adds to the static table */
function blockMask(keyString,state,i){return crypto.createHash('md5').update(keyString).update(be32(blockCrc(state,i))).digest();}
function buildKey(table,keyString,state){const out=Buffer.from(table.subarray(0,KEY_SIZE));const k=Buffer.from(keyString,'latin1');
 for(let i=0;i<KEY_SIZE/16;i++){const m=blockMask(k,state,i);for(let j=0;j<16;j++)out[i*16+j]^=m[j];}return out;}

/* 16 consecutive "xor byte ptr [b+i+disp32], r8" (30 /r, mod 10, SIB) whose disp32 run d, d+1, .. d+15: d is the table */
function findBuilder(code){
 const at=[];for(let i=0;i+7<=code.data.length;i++)if(code.data[i]===0x30&&(code.data[i+1]&0xc7)===0x84)at.push(i);
 for(let k=0;k<at.length;k++){const d=code.data.readUInt32LE(at[k]+3);let n=1,last=at[k];
  for(let m=k+1;m<at.length&&at[m]-last<=24&&n<16;m++)if(code.data.readUInt32LE(at[m]+3)===d+n){n++;last=at[m];}
  if(n===16)return {table:d,store:code.va+at[k]};}
 return null;}
/* the function holding rva, by .pdata; else the last int3/ret padding before it */
function functionStart(img,rva){const ex=img.exception;if(ex.rva&&ex.size){const p=img.read(ex.rva,ex.size);for(let o=0;o+12<=p.length;o+=12){const a=p.readUInt32LE(o),e=p.readUInt32LE(o+4);if(a<=rva&&rva<e)return a;}}
 const c=img.code();let i=rva-c.va;while(i>1&&!(c.data[i-1]===0xcc&&c.data[i-2]===0xcc))i--;return c.va+i;}
/* crc state candidates: "xor r64,imm32" with only the top byte set (the state's low byte, against BE32(i)'s first byte) and
   "xor r32,imm32" below 2^24 (the state's upper 24 bits) */
function findState(img,from,to){const c=img.code(),b=c.data,lo=[],hi=[];
 for(let i=from-c.va;i<to-c.va&&i+6<=b.length;i++){
  let imm=null,wide=false,j=i;if(b[j]===0x48||b[j]===0x49){wide=true;j++;}else if(b[j]===0x41||b[j]===0x40)j++;
  if(b[j]===0x35&&wide)imm=b.readUInt32LE(j+1);else if(b[j]===0x81&&(b[j+1]&0xf8)===0xf0)imm=b.readUInt32LE(j+2);else continue;
  if(wide&&imm&&!(imm&0xffffff))lo.push(imm>>>24);else if(!wide&&imm&&imm<0x1000000)hi.push(imm);}
 const out=[];for(const h of hi)for(const l of lo)out.push(((h<<8)|l)>>>0);return [...new Set(out)];}
function cString(img,rva,max=128){const b=img.read(rva,max);const z=b.indexOf(0);const s=b.subarray(0,z<0?b.length:z);return s.length&&s.every(x=>x>=0x20&&x<0x7f)?s.toString('latin1'):null;}
/* "lea rcx,[rip+string]" shortly before each "call builder" */
function keyStrings(img,start){const c=img.code(),b=c.data,out=[];
 for(let i=0;i+5<=b.length;i++){if(b[i]!==0xe8)continue;if(c.va+i+5+b.readInt32LE(i+1)!==start)continue;
  for(let k=i-7;k>=Math.max(0,i-24);k--)if(b[k]===0x48&&b[k+1]===0x8d&&b[k+2]===0x0d){const s=cString(img,c.va+k+7+b.readInt32LE(k+3));if(s)out.push(s);break;}}
 return [...new Set(out)];}
/* every printable NUL-terminated string 6..64 bytes long in the data sections */
function allStrings(img){const out=new Set();for(const s of img.sections){if(s===img.code()||/bind|reloc|rsrc|pdata/i.test(s.name))continue;const d=s.data;let st=-1;
  for(let i=0;i<d.length;i++){const x=d[i];if(x>=0x20&&x<0x7f){if(st<0)st=i;}else{if(x===0&&st>=0&&i-st>=6&&i-st<=64)out.add(d.toString('latin1',st,i));st=-1;}}}return [...out];}

/* the plain first 16 index bytes are zero (entry 0: name 0, data 0), so the key's first 16 bytes are the ciphertext's */
function expectedHead(archive){try{const b=readAt(archive,HEADER,16);return b.length===16?b:null;}catch{return null;}}

const KEYS=new Map();
/* → {key (64 KB Buffer), keyString, state, table (rva), program} or null */
function deriveKey(program,archive){
 let st;try{st=fs.statSync(program);}catch{return null;}const stamp=program+'|'+st.size+'|'+st.mtimeMs+'|'+(archive||'');if(KEYS.has(stamp))return KEYS.get(stamp);
 let found=null;try{found=deriveFrom(fs.readFileSync(program),archive);}catch{found=null;}if(found)found.program=program;KEYS.set(stamp,found);return found;}
function deriveFrom(buf,archive){
 const img=peImage(buf);if(!img)return null;unstub(img);const b=findBuilder(img.code());if(!b)return null;
 const table=img.read(b.table,KEY_SIZE);if(table.length<KEY_SIZE)return null;
 const start=functionStart(img,b.store),states=findState(img,start,b.store);if(!states.length)return null;
 const want=archive?expectedHead(archive):null;
 const fits=(k,state)=>{if(!want)return true;const m=blockMask(Buffer.from(k,'latin1'),state,0);for(let j=0;j<16;j++)if((table[j]^m[j])!==want[j])return false;return true;};
 const named=keyStrings(img,start);let keyString=null,state=null;
 for(const s of states){keyString=named.find(k=>fits(k,s))||null;if(keyString!==null){state=s;break;}}
 if(keyString===null&&want){const all=allStrings(img);for(const s of states){keyString=all.find(k=>fits(k,s))||null;if(keyString!==null){state=s;break;}}}
 if(keyString===null)return null;
 return {key:buildKey(table,keyString,state),keyString,state,table:b.table,unstubbed:!!img.unstubbed};}

/* ---- the archive ---------------------------------------------------------------------------------------------- */
function xorKey(buf,key,from=0){for(let i=0;i<buf.length;i++)buf[i]^=key[(from+i)&0xffff];return buf;}
function header(file){const h=readAt(file,0,HEADER);if(h.length<HEADER||h.toString('latin1',0,4)!==MAGIC)return null;
 return {version:h.readUInt32BE(4),count:Number(h.readBigUInt64BE(8)),indexEnd:Number(h.readBigUInt64BE(16))};}
/* → {version,count,indexEnd,entries:[{name,offset,stored,size}]} (offset absolute) or null */
function list(file,key){const h=header(file);if(!h||!key)return null;const size=fs.statSync(file).size;
 if(h.indexEnd<HEADER+h.count*32||h.indexEnd>size||h.count>1e6)return null;
 const idx=xorKey(readAt(file,HEADER,h.indexEnd-HEADER),key,0);if(idx.length<h.count*32)return null;
 let names=idx.subarray(h.count*32);if(h.version>=2){try{names=zlib.inflateSync(names);}catch{return null;}}
 const entries=[];for(let i=0;i<h.count;i++){const o=i*32,no=Number(idx.readBigUInt64BE(o)),off=Number(idx.readBigUInt64BE(o+8)),stored=Number(idx.readBigUInt64BE(o+16)),unpacked=Number(idx.readBigUInt64BE(o+24));
  if(no>=names.length)return null;const z=names.indexOf(0,no);const name=names.toString('utf8',no,z<0?names.length:z);
  const offset=h.indexEnd+off;if(offset+stored>size)return null;entries.push({name,offset,stored,size:unpacked||stored,packed:unpacked>0});}
 return {...h,entries};}
function read(file,entry,key){const raw=xorKey(readAt(file,entry.offset,entry.stored),key,0);return entry.packed?zlib.inflateSync(raw):raw;}

/* ---- a game folder -------------------------------------------------------------------------------------------- */
/* → {key, archives:[{file, entries}], files: Map(name → {file, entry})} with patch archives overriding, or null */
function open(dir){const packs=archives(dir);if(!packs.length)return null;let k=null;
 for(const p of programs(dir)){k=deriveKey(p,packs[0]);if(k)break;}if(!k)return null;
 const files=new Map(),opened=[];for(const f of packs){const l=list(f,k.key);if(!l)continue;opened.push({file:f,entries:l.entries});for(const e of l.entries)files.set(e.name,{file:f,entry:e});}
 return {key:k,archives:opened,files};}

module.exports={MAGIC,HEADER,KEY_SIZE,isFpd,archives,programs,peImage,unstub,findBuilder,functionStart,findState,keyStrings,blockCrc,blockMask,buildKey,deriveKey,deriveFrom,header,list,read,open,xorKey};
