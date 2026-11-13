// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const kit=require('./kit.cjs');/* E577 shared engine kit */
/* Nitro+ NPK2 archives (みにくいモジカの子 and other Mware games). Layout and keys as in GARbro (MIT, morkt/GARbro
   ArcFormats/NitroPlus/ArcNPK.cs and its GameData/Formats.dat): "NPK2", version, IV (16) at 8, count at 0x18, index size at
   0x1C, AES-256-CBC index from 0x20. Entry: flag byte, u16 name length, UTF-8 name, unpacked size, 32-byte hash, segment
   count, segments of (u64 offset, aligned size, size, unpacked size). Each segment is AES-256-CBC with the archive IV;
   a segment whose size is below its unpacked size is raw deflate. */
const fs=require('node:fs'),crypto=require('node:crypto'),zlib=require('node:zlib'),path=require('node:path');
// Game title -> key, from GARbro's Formats.dat (Npk2Scheme.KnownKeys); exe names that identify each title.
const KEYS={
 'Minikui Mojika no Ko':{exe:['mojika.exe'],key:'aa4560f783f78a90205dc14e5409670409bc004639175ad9c0b3d297da2f3868'},
 'Sonicomi':{exe:['sonicomi.exe'],key:'65abb4a8cde0c810bb4a26723754c3a7e43de9ea7f5bb843501d05abcf08d9c1'},
 'Tokyo Necro':{exe:[],key:'962c5f3a789c8437b71212a115d6ca9f9ae3fd210ff6af70a8a8f8bbfe5e8af5'},
};
function decrypt(key,iv,data){const d=crypto.createDecipheriv('aes-256-cbc',key,iv);d.setAutoPadding(false);return Buffer.concat([d.update(data),d.final()]);}
const head=file=>kit.head(file,0x20);
// The key that turns the first index block into a plausible entry (flag, short name length, printable name).
function findKey(file){const h=head(file);if(h.toString('latin1',0,4)!=='NPK2')return null;const fd=fs.openSync(file,'r');let blk;try{blk=Buffer.alloc(32);fs.readSync(fd,blk,0,32,0x20);}finally{fs.closeSync(fd);}
 for(const [title,v] of Object.entries(KEYS)){const key=Buffer.from(v.key,'hex'),p=decrypt(key,h.subarray(8,24),blk),n=p.readUInt16LE(1);
  if(p[0]<=1&&n>0&&n<=0x104&&/^[\x20-\x7e]{4}/.test(p.toString('latin1',3,7)))return {title,key};}
 return null;}
function list(file,key){const h=head(file),iv=h.subarray(8,24),count=h.readUInt32LE(0x18),size=h.readUInt32LE(0x1c);
 if(!key){const k=findKey(file);if(!k)return null;key=k.key;}
 const fd=fs.openSync(file,'r');let enc;try{enc=Buffer.alloc(size);fs.readSync(fd,enc,0,size,0x20);}finally{fs.closeSync(fd);}
 const idx=decrypt(key,iv,enc),out=[];let p=0;
 for(let i=0;i<count;i++){p++;const n=idx.readUInt16LE(p);p+=2;const name=idx.toString('utf8',p,p+n);p+=n;const unpacked=idx.readUInt32LE(p);p+=4+32;const segs=idx.readInt32LE(p);p+=4;const s=[];
  for(let j=0;j<segs;j++){s.push({offset:Number(idx.readBigInt64LE(p)),aligned:idx.readUInt32LE(p+8),size:idx.readUInt32LE(p+12),unpacked:idx.readUInt32LE(p+16)});p+=20;}
  out.push({name,unpacked,read:()=>read(file,key,iv,s)});}
 return out;}
function read(file,key,iv,segs){const fd=fs.openSync(file,'r');try{return Buffer.concat(segs.map(s=>{const b=Buffer.alloc(s.aligned);fs.readSync(fd,b,0,s.aligned,s.offset);const plain=decrypt(key,iv,b).subarray(0,s.size);return s.size<s.unpacked?zlib.inflateRawSync(plain):plain;}));}finally{fs.closeSync(fd);}}
/* Scenes: media/script/nut/*.nut in script.npk, compiled Squirrel ("SCRP" ... "RIQS"). String literals are
   0x08000010, length, UTF-8. Message text starts with CRLF; a spoken line is "//【名前】" CRLF "<voice ...>" CRLF 「…」.
   #{・・・}text# marks emphasis dots over text. */
function strings(d){const out=[];for(let i=0;i+8<d.length;i++){if(d.readUInt32LE(i)===0x08000010){const len=d.readUInt32LE(i+4);if(len>0&&len<8000&&i+8+len<=d.length){out.push(d.toString('utf8',i+8,i+8+len));i+=7+len;}}}return out;}
function clean(s){return s.replace(/^\s*\/\/【[^】]*】[^\r\n]*/,'').replace(/<[^>]*>/g,'').replace(/#\{[^}]*\}([^#]*)#/g,'$1').replace(/[\r\n\t]+/g,'').trim();}
// E450 the <voice src='voice/a00/2000010c16'> of a spoken line goes with its text.
function parse(d){const lines=[],voices=[];for(const s of strings(d)){if(!s.startsWith('\r\n')&&!s.startsWith('//【'))continue;const name=(s.match(/^\s*\/\/【([^】]*)】/)||[])[1];const t=clean(s);if(!t||!/[ぁ-ゖァ-ヺ一-龯]/.test(t))continue;if(name){lines.push(name);voices.push(null);}lines.push(t);const vs=/<voice\b[^>]*\bsrc=['"]([^'"]+)['"]/.exec(s);voices.push(vs?require('./voice-ref.cjs').clean(vs[1]):null);}const v=require('./voice-ref.cjs').keep(voices);return v?{lines,anchors:[],voices:v}:{lines,anchors:[]};}
// E450 the voice clips of an NPK2 archive (voice.npk), for game-voice.cjs.
function audio(file){try{if(!findKey(file))return null;return (list(file)||[]).filter(e=>/[.](?:ogg|wav|opus)$/i.test(e.name));}catch{return null;}}
function scriptNpk(dir){for(const sub of ['.','..']){const f=path.join(dir,sub,'script.npk');try{if(fs.statSync(f).isFile()&&findKey(f))return f;}catch{}}return null;}
const engine={
 id:'nitro-npk',hint:'script.npk',
 scenes(dir){const f=scriptNpk(dir);if(!f)return [];return (list(f)||[]).filter(e=>/^media\/script\/nut\/[^/]+\.nut$/i.test(e.name)).map(e=>({name:path.basename(e.name),read:e.read}));},
 archives:()=>[],
 sources:dir=>{const f=scriptNpk(dir);return f?[f]:[];},
 parse,test:n=>/\.nut$/i.test(n),
 _internal:{strings,clean},
};
module.exports={KEYS,findKey,list,engine,audio};
