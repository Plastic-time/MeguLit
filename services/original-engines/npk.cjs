// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const kit=require('./kit.cjs');/* E577 shared engine kit */
/* Nitro+ NPK2 archives (みにくいモジカの子 and other Mware games). Layout and keys as in GARbro (MIT, morkt/GARbro
   ArcFormats/NitroPlus/ArcNPK.cs and its GameData/Formats.dat): "NPK2", version, IV (16) at 8, count at 0x18, index size at
   0x1C, AES-256-CBC index from 0x20. Entry: flag byte, u16 name length, UTF-8 name, unpacked size, 32-byte hash, segment
   count, segments of (u64 offset, aligned size, size, unpacked size). Each segment is AES-256-CBC with the archive IV;
   a segment whose size is below its unpacked size is raw deflate. */
const fs=require('node:fs'),crypto=require('node:crypto'),zlib=require('node:zlib'),path=require('node:path');
const {isUtf8}=require('node:buffer');
const npk2=require('../../core/nitroplus-npk.cjs'),SCHEMES=require('./nitro-schemes.json').npk2||{};
// Game title -> key, from nitro-schemes.json (crskycode/GARbro Formats.dat, MIT & marcussacana/MwareStuff NPK3Tool, Unlicense).
const EXES={'Minikui Mojika no Ko':['mojika.exe'],'Sonicomi':['sonicomi.exe'],'The Song of Saya':['saya_steam.exe'],'The Song of Saya (Steam) [+18]':['saya_steam.exe']};
const KEYS=Object.fromEntries(Object.entries(SCHEMES).map(([title,key])=>[title,{exe:EXES[title]||[],key}]));
function decrypt(key,iv,data,padding=false){const d=crypto.createDecipheriv('aes-256-cbc',key,iv);d.setAutoPadding(padding);return Buffer.concat([d.update(data),d.final()]);}
const head=file=>kit.head(file,0x20);
function plausibleEntry(p){const n=p.readUInt16LE(1);if(p[0]>1||!n||n>0x104)return false;for(let i=0;i<Math.min(n,16);i++){const b=p[3+i];if(b<0x20||b===0x7f)return false;}return true;}
// The key that decrypts the archive index into valid entries (flag, name length, PKCS7 padding, segment bounds).
/* NPK3 (You and Me and Her, DRAMAtical Murder / Muramasa Jast and later Steam ports) is NPK2's layout with zstd instead of
   raw deflate for packed segments (MwareStuff NPK3Tool, Unlicense): the magic says which */
const major=h=>{const m=h.toString('latin1',0,4);return m==='NPK2'?2:m==='NPK3'?3:0;};
function unpack(v,plain,unpacked){if(v!==3)return zlib.inflateRawSync(plain);if(typeof zlib.zstdDecompressSync!=='function')throw Error('NPK3_ZSTD');return zlib.zstdDecompressSync(plain,{maxOutputLength:Math.max(unpacked,1)});}
function findKey(file){const h=head(file);if(!major(h))return null;
 const iv=h.subarray(8,24),count=h.readInt32LE(0x18),size=h.readUInt32LE(0x1c),fsz=kit.size(file);
 if(count<0||count>100000||0x20+size>fsz)return null;
 const blk=kit.readAt(file,0x20,32);let encIdx=null;
 for(const [title,v] of Object.entries(KEYS)){const key=Buffer.from(v.key,'hex'),p=decrypt(key,iv,blk);
  if(!plausibleEntry(p))continue;
  try{encIdx=encIdx||kit.readAt(file,0x20,size);const entries=npk2.npkIndex(decrypt(key,iv,encIdx,true),count,fsz);return {title,key,entries};}catch{}}
 return null;}
function list(file,key){const h=head(file),v=major(h);if(!v)return null;
 const iv=h.subarray(8,24),count=h.readInt32LE(0x18),size=h.readUInt32LE(0x1c),fsz=kit.size(file);
 let entries;
 if(!key){const k=findKey(file);if(!k)return null;key=k.key;entries=k.entries;}
 else{try{entries=npk2.npkIndex(decrypt(key,iv,kit.readAt(file,0x20,size),true),count,fsz);}catch{return null;}}
 return entries.map(e=>{const s=e.segments.map(x=>({offset:x.offset,aligned:x.stored,size:x.size,unpacked:x.unpacked}));return {name:e.name,unpacked:e.length,read:()=>read(file,key,iv,s,v)};});}
function read(file,key,iv,segs,v=2){const fd=fs.openSync(file,'r');try{return Buffer.concat(segs.map(s=>{const b=Buffer.alloc(s.aligned);fs.readSync(fd,b,0,s.aligned,s.offset);const plain=decrypt(key,iv,b).subarray(0,s.size);return s.size<s.unpacked?unpack(v,plain,s.unpacked):plain;}));}finally{fs.closeSync(fd);}}
/* Scenes: media/script/nut/*.nut in script.npk, compiled Squirrel ("SCRP" ... "RIQS"). String literals are
   0x08000010, length, encoded text. Message text starts with CRLF; a spoken line is "//【名前】" CRLF "<voice ...>" CRLF 「…」.
   #{・・・}text# marks emphasis dots over text. */
function strings(d){
 const out=[],legacy=[];
 for(let i=0;i+8<d.length;i++){
  if(d.readUInt32LE(i)!==0x08000010)continue;
  const len=d.readUInt32LE(i+4);
  if(!len||len>=8000||i+8+len>d.length)continue;
  const b=d.subarray(i+8,i+8+len);
  const utf8=b.toString('utf8');
  // Local damage can still be valid GBK or Shift-JIS. Keep the CJK text UTF-8 already recovered.
  if(isUtf8(b)||(utf8.match(/[ぁ-ゖァ-ヺ一-龯]/g)||[]).length>(utf8.match(/\ufffd/g)||[]).length)out.push(utf8);
  else{legacy.push(b);out.push(b);}
  i+=7+len;
 }
 if(!legacy.length)return out;
 const decoder=new TextDecoder(kit.codepageOf(legacy),{fatal:true});
 return out.map(s=>{
  if(typeof s==='string')return s;
  try{return decoder.decode(s);}catch{return s.toString('utf8');}
 });
}
function clean(s){return s.replace(/^\s*\/\/【[^】]*】[^\r\n]*/,'').replace(/<[^>]*>/g,'').replace(/#\{[^}]*\}([^#]*)#/g,'$1').replace(/[\r\n\t]+/g,'').trim();}
// E450 the <voice src='voice/a00/2000010c16'> of a spoken line goes with its text.
function parse(d){const lines=[],voices=[];for(const s of strings(d)){if(!s.startsWith('\r\n')&&!s.startsWith('//【'))continue;const name=(s.match(/^\s*\/\/【([^】]*)】/)||[])[1];const t=clean(s);if(!t||!/[ぁ-ゖァ-ヺ一-龯]/.test(t)&&!/^[「『（][^」』）]*[」』）]$/.test(t))continue; /* E594 a quoted line without kana or kanji (「……！」 in a translation) still counts, so both sides keep the same lines */if(name){lines.push(name);voices.push(null);}lines.push(t);const vs=/<voice\b[^>]*\bsrc=['"]([^'"]+)['"]/.exec(s);voices.push(vs?require('./voice-ref.cjs').clean(vs[1]):null);}const v=require('./voice-ref.cjs').keep(voices);return v?{lines,anchors:[],voices:v}:{lines,anchors:[]};}
// E450 the voice clips of an NPK2 / NPK3 archive (voice.npk), for game-voice.cjs.
function audio(file){try{if(!findKey(file))return null;return (list(file)||[]).filter(e=>/[.](?:ogg|wav|opus)$/i.test(e.name));}catch{return null;}}
function scriptNpk(dir){for(const sub of ['.','..']){const f=path.join(dir,sub,'script.npk');try{if(fs.statSync(f).isFile()&&findKey(f))return f;}catch{}}return null;}
/* E577 kit.engine: one script archive, base names, archive order */
const engine=kit.engine({id:'nitro-npk',hint:'script.npk',overlay:false,
 archives:{find:dir=>scriptNpk(dir),list,entry:/^media\/script\/nut\/[^/]+\.nut$/i,sort:false},parse,test:n=>/\.nut$/i.test(n),extra:{_internal:{strings,clean}}});
module.exports={KEYS,findKey,list,engine,audio};
