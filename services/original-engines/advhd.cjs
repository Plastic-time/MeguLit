// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E449 Will / AdvHD "Rio" scripts (Sugar Beans Under the Moon, いじわる My Master and other Will-family titles).
   Rio.arc is a Will ARC: u32 count of extension records {char[4] ext, u32 files, u32 directory offset}, then per file a
   NUL-padded name (9 bytes, or 13 in later archives), u32 size, u32 offset (layout as in GARbro ArcWILL.cs, MIT).
   .wsc scripts are stored with every byte rotated left by 2. In a script, after a NUL:
     0x41 <3 bytes> text\0              narration
     0x42 <4 bytes> name\0 text\0       a spoken line and its speaker
   Text is Shift-JIS. Other commands (voice and image names, jumps) are ASCII and dropped. */
const fs=require('node:fs'),path=require('node:path'),kit=require('./kit.cjs');/* E605 */
const sj=kit.SJIS;
const PROSE=/[ぁ-ゖァ-ヺ一-龯]/;
function list(b,fileSize=b.length){if(b.length<16)return null;const n=b.readInt32LE(0);if(n<=0||n>0xff||4+n*12>b.length)return null;const exts=[];
 for(let i=0;i<n;i++){const p=4+i*12,ext=b.toString('latin1',p,p+4).replace(/\0.*$/s,'');if(!/^[A-Za-z0-9]{1,4}$/.test(ext))return null;exts.push({ext,count:b.readUInt32LE(p+4),dir:b.readUInt32LE(p+8)});}
 const read=(size,strict)=>{const rec=size+8,out=[];let dirEnd=0,minOff=Infinity,maxEnd=0,bytes=0;
  if(strict)for(const e of exts)if(e.count>0)dirEnd=Math.max(dirEnd,e.dir+e.count*rec);
  for(const e of exts){let d=e.dir;for(let i=0;i<e.count;i++){if(d+rec>b.length)return null;const name=b.toString('latin1',d,d+size).replace(/\0.*$/s,'');
   const s=b.readUInt32LE(d+size),o=b.readUInt32LE(d+size+4);if(!name||o+s>fileSize||strict&&o<dirEnd)return null;
   if(o<minOff)minOff=o;if(o+s>maxEnd)maxEnd=o+s;bytes+=s;out.push({name:name+'.'+e.ext.toLowerCase(),size:s,offset:o});d+=rec;}}
  return {out,score:(minOff===dirEnd?4:0)+(maxEnd===fileSize?2:0)+(bytes>0?1:0)};};
 const a=read(9,true),c=read(13,true);
 if(a||c)return a&&c?(c.score>a.score?c.out:a.out):(a||c).out;
 return read(9,false)?.out||read(13,false)?.out||null;}
function decode(raw){const d=Buffer.from(raw);for(let i=0;i<d.length;i++)d[i]=((d[i]>>>2)|(d[i]<<6))&255;return d;}
function cstr(d,p){const e=d.indexOf(0,p);return e<0?null:{s:d.subarray(p,e),next:e+1};}
// Inline codes (%K wait for a click, %P new page, %N new line ...) are dropped.
const text=b=>sj.decode(b).replace(/\\n|%n/gi,'\n').replace(/%[A-Za-z]+/g,'').replace(/^[\s　]+|[\s　]+$/g,'');
// Lines of one decoded script: a speaker name line before each spoken line, as other readers do.
/* E450 a voice name (Ash_1093) is an ASCII string between the previous line and a spoken one; the line takes the last. */
const VOICE=/\0([A-Za-z]{1,6}_?\d{3,6}[A-Za-z]?)\0/g;
function parse(buf){const d=Buffer.isBuffer(buf)?buf:Buffer.from(buf),lines=[],anchors=[],voices=[];
 const marks=[...d.toString('latin1').matchAll(VOICE)].map(m=>({at:m.index,name:m[1]}));let mi=0,last=0;
 const voiceBefore=i=>{let v=null;while(mi<marks.length&&marks[mi].at<i){if(marks[mi].at>=last&&!/^(?:EV|BG|ST|CG|SE|BGM|TEF|FG|SD)/i.test(marks[mi].name))v=marks[mi].name;mi++;}last=i;return v;};
 // The id after the opcode is 3 (narration) / 4 (spoken) bytes in early scripts and one byte longer in later ones: the
 // text starts after the id's last (zero) byte, on a Shift-JIS lead byte.
 const at=(i,a)=>{for(const k of [a,a+1])if(d[i+k]>=0x81&&d[i+k-1]===0)return i+k;return -1;};
 for(let i=1;i<d.length-6;i++){if(d[i-1]!==0||(d[i]!==0x41&&d[i]!==0x42))continue;
  if(d[i]===0x41){const p=at(i,4);if(p<0)continue;const t=cstr(d,p);if(!t||t.s.length<2)continue;const s=text(t.s);if(!s||!PROSE.test(s)||s.includes('�'))continue;lines.push(s);voices.push(voiceBefore(i));i=t.next-1;continue;}
  const p=at(i,5);if(p<0)continue;const name=cstr(d,p);if(!name||name.s.length<2)continue;const t=cstr(d,name.next);if(!t||t.s.length<2||t.s[0]<0x80)continue;
  const who=text(name.s),s=text(t.s);if(!s||!PROSE.test(s)||s.includes('�')||who.length>24)continue;lines.push(who);voices.push(null);lines.push(s);voices.push(voiceBefore(i));i=t.next-1;}
 const v=require('./voice-ref.cjs').keep(voices);return v?{lines,anchors,voices:v}:{lines,anchors};}
/* E654 Willadv (Will's engine before AdvHD) keeps scripts beside images in one ARC, so WSC need not be the first extension */
function oldHasScripts(file){const h=kit.head(file,4+0xff*12);if(h.length<16)return false;const n=h.readInt32LE(0);
 if(n<=0||n>0xff||4+n*12>h.length)return false;let found=false;
 for(let i=0;i<n;i++){const p=4+i*12,ext=h.toString('latin1',p,p+4).replace(/\0.*$/s,'');if(!/^[A-Za-z0-9]{1,4}$/.test(ext))return false;if(/^(WSC|SCR)$/i.test(ext))found=true;}
 return found;}
function archives(dir){let names;try{names=fs.readdirSync(dir);}catch{return [];}
 return names.filter(f=>/\.arc$/i.test(f)).map(f=>path.join(dir,f)).filter(f=>oldHasScripts(f)||!!v2Index(f)?.some(e=>WS2.test(e.name)));}
/* S5 AdvHD's later ARC (リビドー・アバンちゅ～る Rio.arc / Chip*.arc; GARbro ArcPulltop.cs "ARC/WillV2", MIT): u32 count, u32 index size,
   then per file u32 size, u32 offset (from the end of the index), UTF-16LE name + NUL; the index ends exactly at its size.
   .ws2 entries are rotated like .wsc. Read from the head only (Chip6.arc is 1 GB). → [{name,size,offset}] | null */
const WS2=/\.ws2$/i,V2_NAME=/^[\x20-\x7e　-鿿＀-￯]{1,120}$/;
function listV2(head,fileSize){if(head.length<8)return null;const n=head.readInt32LE(0),isz=head.readUInt32LE(4),base=8+isz;if(n<=0||n>100000||isz<10*n||base>fileSize||base>head.length)return null;
 const out=[];let p=8;for(let i=0;i<n;i++){if(p+10>base)return null;const size=head.readUInt32LE(p),off=base+head.readUInt32LE(p+4);p+=8;let e=p;while(e+1<base&&(head[e]|head[e+1]))e+=2;if(e+1>=base||e===p)return null;
  const name=head.toString('utf16le',p,e);p=e+2;if(!V2_NAME.test(name)||off+size>fileSize)return null;out.push({name,size,offset:off});}
 return p===base?out:null;}
function v2Index(file){try{const h=kit.readAt(file,0,8);if(h.length<8)return null;const isz=h.readUInt32LE(4);if(isz>64<<20)return null;return listV2(kit.readAt(file,0,8+isz),kit.size(file));}catch{return null;}}
/* the text of a decoded .ws2: 0x14 message (u32 id, voice string, text) and 0x15 speaker name, layout as in VNTranslationTools
   AdvHdDisassemblerV2 (MIT, arcusmaximus). Strings are Shift-JIS; %LC / %LF / %LR in front of a name are dropped. */
function parseWs2(d){const lines=[],anchors=[];
 for(let i=0;i<d.length-6;i++){
  if(d[i]===0x15){const t=cstr(d,i+1);if(!t||t.s.length<2)continue;const s=text(t.s).replace(/^%L[CFR]/,'');if(s&&s.length<=24&&PROSE.test(s)&&!s.includes('�')){lines.push(s);i=t.next-1;}continue;}
  if(d[i]!==0x14)continue;const v=cstr(d,i+5);if(!v||v.s.length>64||v.s.some(b=>b>=0x80))continue;const t=cstr(d,v.next);if(!t||t.s.length<2||t.s[0]<0x80&&t.s[0]!==0x25)continue;
  const s=text(t.s);if(!s||!PROSE.test(s)||s.includes('�'))continue;lines.push(s);i=t.next-1;}
 return {lines,anchors};}
function scenesIn(file){const v2=v2Index(file);if(v2)return v2.filter(e=>WS2.test(e.name)).map(e=>({name:e.name,read:()=>decode(kit.readAt(file,e.offset,e.size))}));
 let b;try{b=fs.readFileSync(file);}catch{return [];}const es=list(b);if(!es)return [];
 return es.filter(e=>/\.(wsc|scr)$/i.test(e.name)).map(e=>({name:e.name,read:()=>decode(b.subarray(e.offset,e.offset+e.size))}));}
const engine={
 id:'advhd',hint:'Rio.arc（.wsc）',
 scenes:dir=>archives(dir).flatMap(scenesIn).sort((a,b)=>a.name.localeCompare(b.name)),
 archives:dir=>archives(dir).flatMap(scenesIn),
 sources:archives,
 /* the .wsc grammar first, the .ws2 one when it finds nothing */
 parse:buf=>{const r=parse(buf);if(r.lines.length)return r;return parseWs2(Buffer.isBuffer(buf)?buf:Buffer.from(buf));},test:n=>/\.ws[c2]$/i.test(n),
 _internal:{list,decode,listV2,parseWs2},
};
/* E580 an archive's index without reading the whole file (the voice catalogue: voice archives are large) */
const listFile=file=>{return list(kit.head(file,8<<20),kit.size(file));};
module.exports={parse,decode,list,listFile,engine};
