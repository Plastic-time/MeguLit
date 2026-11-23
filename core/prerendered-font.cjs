// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-19 (user: MeguLit's Japanese should look like the game's own text; 千恋＊万花 draws its dialogue with
   "スキップ", a face shipped only as KiriKiri pre-rendered glyph files, data.xp3 font/font1_<size>.tft). A pre-rendered
   font is a bitmap per character, so the reader cannot draw with it. Its glyphs are the sample for recognising the face
   among real fonts (core/mages-font.cjs matcher, services/font-match.ps1: installed families and the game's own outline
   fonts): the closest real font is used, never a traced copy of the bitmaps (user: 别描边).
   KiriKiri pre-rendered font (krkr2/krkrz PrerenderedFont): "TVP pre-rendered font\x1a", u8 version (0 raw, 1 run-length:
   a byte >= 0x41 repeats the last value (byte - 0x40) times), u8 character size (2 = UTF-16), u32 count, u32 offset of
   the code table (u16 each, ascending), u32 offset of the items: {u32 bitmap offset, u16 width, u16 height, i16 origin x,
   i16 origin y (top of the bitmap above the baseline), i16 inc x, i16 inc y, i16 inc, u16 reserved}; grey levels 0..64. */
const MAGIC='TVP pre-rendered font\x1a';

function isPrerendered(b){return Buffer.isBuffer(b)&&b.length>36&&b.toString('latin1',0,22)===MAGIC&&b[23]===2;}
function parse(b){
 if(!isPrerendered(b))return null;const version=b[22],count=b.readUInt32LE(24),codes=b.readUInt32LE(28),items=b.readUInt32LE(32);
 if(version>1||count<1||count>65535||codes+count*2>b.length||items+count*20>b.length)return null;
 const glyphs=[];
 for(let i=0;i<count;i++){const it=items+i*20,code=b.readUInt16LE(codes+i*2),offset=b.readUInt32LE(it),w=b.readUInt16LE(it+4),h=b.readUInt16LE(it+6);
  const g={code,w,h,ox:b.readInt16LE(it+8),oy:b.readInt16LE(it+10),inc:b.readInt16LE(it+12)||b.readInt16LE(it+16),offset};
  if(w*h>0&&w<=512&&h<=512&&offset<b.length)g.bitmap=()=>bitmap(b,version,offset,w*h);glyphs.push(g);}
 return {version,glyphs};
}
function bitmap(b,version,at,n){const out=new Uint8Array(n);
 if(version===0){for(let i=0;i<n&&at+i<b.length;i++)out[i]=b[at+i];return out;}
 let p=at,d=0,last=0;while(d<n&&p<b.length){const v=b[p++];if(v>=0x41){let c=v-0x40;while(c--&&d<n)out[d++]=last;}else out[d++]=last=v;}return out;}
/* one glyph cropped to its ink box and scaled to size x size, ink 0..255 (as core/mages-font.cjs normCell and
   services/font-match.ps1 Norm do for the candidates) */
function norm(g,size=32){const v=g.bitmap(),w=g.w,h=g.h,ink=i=>Math.min(255,Math.round(v[i]*255/64));let x0=1e9,y0=1e9,x1=-1,y1=-1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(ink(y*w+x)>100){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
 if(x1<0)return null;const cw=x1-x0+1,ch=y1-y0+1,o=Buffer.alloc(size*size),at=(a,b)=>ink(Math.min(y1,Math.max(y0,b))*w+Math.min(x1,Math.max(x0,a)));
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const sx=x0+(x+0.5)*cw/size-0.5,sy=y0+(y+0.5)*ch/size-0.5,ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
  o[y*size+x]=Math.round(at(ix,iy)*(1-fx)*(1-fy)+at(ix+1,iy)*fx*(1-fy)+at(ix,iy+1)*(1-fx)*fy+at(ix+1,iy+1)*fx*fy);}
 return o;}
/* The match sample: about count kana and kanji spread over the file, {chars, glyphs (base64), cell}; null below 20. */
function sample(buffer,{count=80,size=32}={}){const f=parse(buffer);if(!f)return null;
 const want=f.glyphs.filter(g=>g.bitmap&&/[ぁ-ゖァ-ヺ一-龯]/.test(String.fromCharCode(g.code)));const step=Math.max(1,Math.floor(want.length/count)),chars=[],glyphs=[];
 for(let k=0;k<want.length&&chars.length<count;k+=step){const n=norm(want[k],size);if(!n)continue;chars.push(String.fromCharCode(want[k].code));glyphs.push(n.toString('base64'));}
 if(chars.length<20)return null;
 const counts=new Map();for(const g of f.glyphs)if(g.code>=0x3000&&g.inc>0)counts.set(g.inc,(counts.get(g.inc)||0)+1);
 return {chars:chars.join(''),glyphs,cell:[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]||0,total:f.glyphs.length};}
module.exports={isPrerendered,parse,sample,norm,MAGIC};
