// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Runtime CG unlock: the reading side of module Cg (native/runtimedump/modules/Cg.cpp in MeguLitDump32/64.dll). The DLL
// writes a CG only after the game's own window showed it (signature match on two polls; preloaded, gallery-table and
// never-shown pictures stay in memory and are dropped), so everything listed here is a picture the player saw, in play
// or in the game's CG gallery. TLG is the exception the DLL cannot decode: it is confirmed here (settle below).
// Layout: <runtime-dump dir for the game>/cg.jsonl (one line per CG: file, source, how, crc, w, h, fmt, size, at) and
// cg/<crc>_<w>x<h>.<ext>. card-wall.cjs offers these as kind 'cg', source 'memory', id 'mem:<crc>'.
const fs=require('node:fs'),path=require('node:path');
const rd=()=>require('./runtime-dump.cjs');
/* formats the card picture step can open */
const OPEN=new Set(['png','jpg','bmp','webp']);

/* ---- TLG: confirmed here, not in the DLL ----
   cg-wait/<crc>_<w>x<h>_<unix time>.tlg are TLG file images the game decrypted; cg-screens.bin holds the steady window
   signatures the DLL logged while they waited (u32 unix time, u32 0, 32x18 grey bytes). A TLG whose signature matches
   a screen logged after it was read becomes cg/<crc>_<w>x<h>.png; one that never matched is deleted after WAIT_MS.
   The signature math is Cg.cpp's (Grid/Flat/Same), so both sides agree. Decoder: cg-decoders.cjs tlg(). */
const SW=32,SH=18,TOP=12,WAIT_MS=30*60*1000;
function grid(rgba,w,h){const sig=new Int32Array(SW*SH);
 for(let gy=0;gy<SH;gy++)for(let gx=0;gx<SW;gx++){const x0=Math.floor(gx*w/SW),x1=Math.floor((gx+1)*w/SW),y0=Math.floor(gy*h/SH),y1=Math.floor((gy+1)*h/SH);
  const sx=Math.floor((x1-x0)/8)+1,sy=Math.floor((y1-y0)/8)+1;let sum=0,c=0;
  for(let y=y0;y<y1;y+=sy)for(let x=x0;x<x1;x+=sx){const q=(y*w+x)*4;sum+=(rgba[q]*77+rgba[q+1]*150+rgba[q+2]*29)>>8;c++;}
  sig[gy*SW+gx]=c?Math.floor(sum/c):0;}
 return sig;}
const flat=sig=>{let lo=255,hi=0;for(let i=0;i<SW*TOP;i++){if(sig[i]<lo)lo=sig[i];if(sig[i]>hi)hi=sig[i];}return hi-lo<40;};
const same=(a,b)=>{let d=0;for(let i=0;i<SW*TOP;i++)d+=Math.abs(a[i]-b[i]);return d<14*SW*TOP;};
function screens(dir){let b;try{b=fs.readFileSync(path.join(dir,'cg-screens.bin'));}catch{return [];}const n=8+SW*SH,out=[];
 for(let o=0;o+n<=b.length;o+=n)out.push({at:b.readUInt32LE(o),sig:b.subarray(o+8,o+n)});return out;}
function decodeTlg(file){const dec=require('./cg-decoders.cjs'),buf=Buffer.from(fs.readFileSync(file));
 for(const o of [0,15])if(buf[o]===0xab&&buf[o+1]===0x4c)buf[o]=0x54;/* AB-LG variant: same header after the first byte */
 return dec.tlg(buf);}
function settle(dir,now=Date.now()){
 const wait=path.join(dir,'cg-wait');let names=[];try{names=fs.readdirSync(wait);}catch{return;}
 const shots=screens(dir);
 for(const n of names){const m=/^([0-9a-f]{8})_\d{1,5}x\d{1,5}_(\d{1,12})\.tlg$/.exec(n),f=path.join(wait,n);if(!m)continue;
  const at=+m[2];let img=null;try{img=decodeTlg(f);}catch{}
  let shown=false;
  if(img&&img.width*img.height>0){const sig=grid(img.rgba,img.width,img.height);if(!flat(sig))shown=shots.some(s=>s.at+5>=at&&same(sig,s.sig));}
  if(shown){const rel='cg/'+m[1]+'_'+img.width+'x'+img.height+'.png';fs.mkdirSync(path.join(dir,'cg'),{recursive:true});
   fs.writeFileSync(path.join(dir,rel),require('./cg-decoders.cjs').png(img));
   fs.appendFileSync(path.join(dir,'cg.jsonl'),JSON.stringify({file:rel,source:'',how:'tlg',crc:m[1],w:img.width,h:img.height,fmt:'png',at:Math.floor(now/1000)})+'\n');
   try{fs.unlinkSync(f);}catch{}}
  else if(!img||now-at*1000>WAIT_MS){try{fs.unlinkSync(f);}catch{}}}}

/* every recorded CG of a game, oldest first, one per CRC: [{crc,file,source,how,w,h,fmt,at}] */
function list(exe){
 if(!exe)return [];const dir=rd().dirFor(path.dirname(String(exe)));try{settle(dir);}catch{}let raw='';
 try{raw=fs.readFileSync(path.join(dir,'cg.jsonl'),'utf8');}catch{return [];}
 const seen=new Set(),out=[];
 for(const line of raw.split('\n')){if(!line.trim())continue;let e;try{e=JSON.parse(line);}catch{continue;}
  const crc=String(e.crc||'').toLowerCase();if(!/^[0-9a-f]{8}$/.test(crc)||seen.has(crc))continue;
  /* the file must sit inside the game's cg folder (no paths out of it) */
  const rel=String(e.file||'');if(!/^cg\/[0-9a-f]{8}_\d{1,5}x\d{1,5}\.(?:png|jpg|bmp|webp|tlg)$/i.test(rel))continue;
  const file=path.join(dir,...rel.split('/'));if(!fs.existsSync(file))continue;
  seen.add(crc);out.push({crc,file,source:String(e.source||''),how:String(e.how||''),w:+e.w||0,h:+e.h||0,fmt:String(e.fmt||'').toLowerCase(),at:+e.at||0});}
 return out;}

/* card wall sources (card-wall.cjs sources()): pictures the page can show */
function sources(exe){return list(exe).filter(c=>OPEN.has(c.fmt)).map(c=>({id:'mem:'+c.crc,kind:'cg',source:'memory',file:c.file}));}

module.exports={list,sources,settle,_internal:{grid,flat,same}};
