// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* engine-draw signature, CatSystem2 (docs/engine-draw-native.md). The reference for the native matcher in
   native/megulithook/CS2DrawSig.h: both must find the same place and the same offsets in the same bytes
   (validation/engine-draw-sig-cs2.test.cjs runs this one on the owner's exes and on the fixture snippets).

   CatSystem2 lays every string out into glyph records first (one record per character: SJIS code, colour, x, y, size,
   ...), then a per-glyph composer puts one record onto the string's surface at an origin (ox, oy). ISLAND: 0x545980,
   called from the string update loop of every text task (kcTaskStringPlane*, kcFEScriptObj*String ...). Its shape:
     movzx r,byte [rec+K+2] / push / movzx r,byte [rec+K+1] / push / movzx r,byte [rec+K] / push    colour (R,G,B bytes)
     ...
     push dword [rec+S]                    glyph size
     movzx eax, word [rec+C]               the character (SJIS code)
     push eax / lea eax,[esp+d] / push eax
     call [reg+4]                          the font's glyph method (kcFontImage_Win / _FT vtable slot 1)
     ...
     mov eax,[rec+X] / add eax,[esp+bx] / add eax,[esp+ox] / mov [esp+..],eax     x = record x + glyph bearing + origin
     mov eax,[rec+X+4] / add eax,[esp+bx+4] / add eax,[esp+ox+4]                    y, the same
   The hook point is that `mov eax,[rec+X]` (7+ bytes without relative operands): there the record register and every
   stack slot hold their final values, so no stack depth has to be worked out. Register-agnostic: any record register,
   any displacements. Everything is in the string surface's pixels, not the screen.

   Two more anchors, only counted (they show the build is a CatSystem2 one; LunaHook's CatSystem engine hooks them):
     text:   call <get>; mov esi, <buffer>; mov ecx, eax; sub esi, eax     the scenario text copy (EmbedCS2; ISLAND 0x503af0,
             Grisaia 1/3, 果つることなき未来ヨリ in LunaHook's notes)
     raster: cmp r16,0x20; je; mov r32,0x8140; cmp r16,r16                 the font's rasteriser skipping spaces (ISLAND 0x53e1fc) */

/* shape "origin" (message windows, 0x545aa2): x = rec.x + bearing + ox.  shape "direct" (kcTaskStringPlane2's boxes,
   0x543d06): x = rec.x + bearing, no origin argument (origin 0) */
const MOV_X=/\x8b([\x40-\x43\x45-\x47])([\s\S])\x03\x44\x24([\s\S])\x03\x84\x24([\s\S]{4})\x89\x44\x24[\s\S]\x8b([\x40-\x43\x45-\x47])([\s\S])\x03\x44\x24([\s\S])\x03\x84\x24([\s\S]{4})/g;
const MOV_XD=/\x8b([\x40-\x43\x45-\x47])([\s\S])\x03\x44\x24([\s\S])\x89\x44\x24[\s\S]\x8b([\x40-\x43\x45-\x47])([\s\S])\x03\x44\x24([\s\S])\x89\x44\x24/g;
const REG=['eax','ecx','edx','ebx','esp','ebp','esi','edi'];

/* the glyph call before the hook point: push [rec+S]; movzx eax,word [rec+C]; push eax; ... call [reg+4] */
function glyphCall(code,at,r){
 for(let i=at-6;i>=Math.max(0,at-0x100);i--){
  if(code[i]!==0xff||code[i+1]!==(0x70|r)||code[i+3]!==0x0f||code[i+4]!==0xb7||code[i+5]!==(0x40|r)||code[i+7]!==0x50)continue;
  for(let j=i+8;j<i+20&&j+2<at;j++)if(code[j]===0xff&&(code[j+1]&0xf8)===0x50&&(code[j+1]&7)!==4&&code[j+2]===0x04)return {at:i,size:code[i+2],char:code[i+6]};
 }
 return null;
}
/* the colour bytes: movzx <any>, byte [rec+K+2] ... movzx byte [rec+K+1] ... movzx byte [rec+K], each the next within
   8 bytes (a push and maybe one short mov between them), the first such triple within 0x80 before the glyph call (fill; the outline triple at K+4 follows it) */
function colour(code,from,r){
 const m=(b)=>code[b]===0x0f&&code[b+1]===0xb6&&(code[b+2]&0xc7)===(0x40|r);
 const next=(b,want)=>{for(let k=b+4;k<=b+12;k++)if(m(k)&&code[k+3]===want)return k;return -1;};
 for(let i=Math.max(0,from-0x80);i<from;i++){
  if(!m(i))continue;const k=code[i+3]-2;if(k<0)continue;
  const j=next(i,k+1);if(j<0)continue;if(next(j,k)>=0)return k;
 }
 return -1;
}
/* no branch lands inside the 7 bytes the hook replaces (byte scan of every rel8 / rel32 jump shape 0x800 around it;
   conservative: a stray byte pair can only reject, never accept) */
function landsInside(code,at){
 for(let i=Math.max(0,at-0x800);i<Math.min(code.length-6,at+0x800);i++){
  let t=null;const b=code[i];
  if(b===0xeb||(b>=0x70&&b<=0x7f))t=i+2+code.readInt8(i+1);
  else if(b===0xe9)t=i+5+code.readInt32LE(i+1);
  else if(b===0x0f&&code[i+1]>=0x80&&code[i+1]<=0x8f)t=i+6+code.readInt32LE(i+2);
  if(t!==null&&t>at&&t<at+7&&!(i>=at&&i<at+7))return true;
 }
 return false;
}
/* code: Buffer of the code section, va: its virtual address. Returns [{hook, shape, rec, x, y, char, size, colour, bx, ox}]
   (ox = -1: the direct shape, origin 0) */
function find(code,va){
 const s=code.toString('latin1'),out=[];
 for(const [re,shape] of [[MOV_X,'origin'],[MOV_XD,'direct']]){
  re.lastIndex=0;let m;
  while((m=re.exec(s))){
   const at=m.index,r=m[1].charCodeAt(0)&7;re.lastIndex=at+1;
   const o=shape==='origin',reg2=o?m[5]:m[4];if(reg2!==m[1])continue;
   const x=m[2].charCodeAt(0),y=(o?m[6]:m[5]).charCodeAt(0),bx=m[3].charCodeAt(0),by=(o?m[7]:m[6]).charCodeAt(0);
   const ox=o?Buffer.from(m[4],'latin1').readInt32LE(0):-1,oy=o?Buffer.from(m[8],'latin1').readInt32LE(0):-1;
   if(y!==x+4||by!==bx+4||(o&&oy!==ox+4))continue;
   const g=glyphCall(code,at,r);if(!g||landsInside(code,at))continue;
   out.push({hook:va+at,shape,rec:REG[r],x,y,char:g.char,size:g.size,colour:colour(code,g.at,r),bx,ox});
  }
 }
 return out.sort((a,b)=>a.hook-b.hook);
}
const TEXT=/\xe8[\s\S]{4}\xbe[\s\S]{4}\x8b\xc8\x2b\xf0/g;
const RASTER=/\x66\x83[\xf8-\xff]\x20\x0f\x84[\s\S]{4}[\xb8-\xbf]\x40\x81\x00\x00\x66\x3b/g;
function anchors(code,va){
 const s=code.toString('latin1'),all=(re)=>{re.lastIndex=0;const o=[];let m;while((m=re.exec(s)))o.push(va+m.index);return o;};
 return {text:all(TEXT),raster:all(RASTER)};
}
/* the .text section of a PE file (x86 only) */
function textOf(buf){
 const pe=buf.readUInt32LE(0x3c);if(buf.toString('latin1',pe,pe+4)!=='PE\0\0')throw Error('not a PE file');
 if(buf.readUInt16LE(pe+4)!==0x14c)throw Error('not x86');
 const n=buf.readUInt16LE(pe+6),opt=buf.readUInt16LE(pe+20),base=buf.readUInt32LE(pe+24+28),sec=pe+24+opt;
 for(let i=0;i<n;i++){const o=sec+i*40,ch=buf.readUInt32LE(o+36);if(!(ch&0x20000000))continue;
  const vsize=buf.readUInt32LE(o+8),rva=buf.readUInt32LE(o+12),raw=buf.readUInt32LE(o+16),rawPtr=buf.readUInt32LE(o+20);
  return {code:buf.subarray(rawPtr,rawPtr+Math.min(raw,vsize||raw)),va:base+rva,base};}
 throw Error('no code section');
}
/* RTTI class names (MSVC ".?AV<name>@@") present in the file: the runtime maps text-owning objects to roles by them */
function classes(buf){const s=buf.toString('latin1'),o=new Set(),re=/\.\?AV([A-Za-z0-9_]{3,60})@@\0/g;let m;while((m=re.exec(s)))o.add(m[1]);return [...o].sort();}
function scanFile(file){const buf=require('node:fs').readFileSync(file),t=textOf(buf);return {base:t.base,hits:find(t.code,t.va),anchors:anchors(t.code,t.va),classes:classes(buf)};}

module.exports={find,anchors,textOf,classes,scanFile,landsInside};
if(require.main===module)for(const f of process.argv.slice(2)){try{const r=scanFile(f),h=(v)=>'0x'+v.toString(16);console.log(JSON.stringify({file:f,base:h(r.base),hits:r.hits.map(x=>({...x,hook:h(x.hook),x:h(x.x),y:h(x.y),char:h(x.char),size:h(x.size),colour:x.colour<0?-1:h(x.colour),bx:h(x.bx),ox:x.ox<0?-1:h(x.ox)})),text:r.anchors.text.map(h),raster:r.anchors.raster.map(h),textClasses:r.classes.filter(c=>/String|MesList|Button|Font/.test(c))}));}catch(e){console.log(JSON.stringify({file:f,error:e.message}));}}
