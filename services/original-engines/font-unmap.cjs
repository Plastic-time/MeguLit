// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Many Chinese "ports" keep the Japanese engine's code page: each Chinese character is stored as some other character
// and a bundled font (a copy of SimHei and the like) draws the Chinese glyph at that code point. The real character is
// found by matching the bundled glyph's outline bytes against the same font installed with Windows.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function tables(buf,at){const n=buf.readUInt16BE(at+4),out={};for(let i=0;i<n;i++){const r=at+12+i*16;out[buf.toString('latin1',r,r+4)]={offset:buf.readUInt32BE(r+8),length:buf.readUInt32BE(r+12)};}return out;}
function faces(buf){
 if(buf.length<12)return [];
 if(buf.toString('latin1',0,4)==='ttcf'){const n=buf.readUInt32BE(8),list=[];for(let i=0;i<n&&i<64;i++)list.push(buf.readUInt32BE(12+i*4));return list;}
 return [0];
}
function cmap(buf,t){
 const base=t.offset,n=buf.readUInt16BE(base+2);let f4=-1,f12=-1;
 for(let i=0;i<n;i++){const r=base+4+i*8,pid=buf.readUInt16BE(r),eid=buf.readUInt16BE(r+2),off=base+buf.readUInt32BE(r+4),fmt=buf.readUInt16BE(off);
  if(pid===3&&eid===10&&fmt===12)f12=off;else if(pid===3&&eid===1&&fmt===4)f4=off;else if(pid===0&&fmt===12&&f12<0)f12=off;else if(pid===0&&fmt===4&&f4<0)f4=off;}
 const map=new Map();
 if(f12>=0){const groups=buf.readUInt32BE(f12+12);for(let i=0;i<groups;i++){const g=f12+16+i*12,start=buf.readUInt32BE(g),end=buf.readUInt32BE(g+4),gid=buf.readUInt32BE(g+8);for(let c=start;c<=end&&c-start<0x10000;c++)map.set(c,gid+c-start);}return map;}
 if(f4<0)return map;
 const seg=buf.readUInt16BE(f4+6)/2,ends=f4+14,starts=ends+seg*2+2,deltas=starts+seg*2,ranges=deltas+seg*2;
 for(let s=0;s<seg;s++){const end=buf.readUInt16BE(ends+s*2),start=buf.readUInt16BE(starts+s*2),delta=buf.readInt16BE(deltas+s*2),ro=buf.readUInt16BE(ranges+s*2);
  for(let c=start;c<=end&&c!==0xffff;c++){let gid;if(!ro)gid=(c+delta)&0xffff;else{const at=ranges+s*2+ro+(c-start)*2;if(at+2>buf.length)continue;gid=buf.readUInt16BE(at);if(gid)gid=(gid+delta)&0xffff;}if(gid)map.set(c,gid);}}
 return map;
}
/* E329 (女装山脈 1.1 patch: its SimHei 1.01 copy has other hinting than Windows' SimHei, so only 30% of the glyph bytes
   matched): a simple glyph is hashed by its outline alone (contour ends, on-curve flags, absolute points), without the
   hinting instructions. Composite glyphs (and anything that does not parse) keep the hash of their bytes. */
function outlineKey(g){
 const nc=g.readInt16BE(0);if(nc<=0)return null;let p=10;const ends=[];for(let i=0;i<nc;i++){ends.push(g.readUInt16BE(p));p+=2;}
 p+=2+g.readUInt16BE(p);const n=ends[nc-1]+1,flags=[];
 while(flags.length<n){const f=g[p++];flags.push(f);if(f&8){let r=g[p++];while(r--&&flags.length<n)flags.push(f);}}
 const axis=(short,same)=>{const out=[];let v=0;for(const f of flags){if(f&short){const d=g[p++];v+=f&same?d:-d;}else if(!(f&same)){v+=g.readInt16BE(p);p+=2;}out.push(v);}return out;};
 const xs=axis(2,16),ys=axis(4,32);if(p>g.length)return null;
 return ends.join(',')+'|'+flags.map(f=>f&1).join('')+'|'+xs.join(',')+'|'+ys.join(',');
}
function glyphHash(g){let key=null;try{key=outlineKey(g);}catch{}return crypto.createHash('md5').update(key===null?g:'o'+key).digest('hex');}
// code point -> glyph outline hash, for one font face (TrueType outlines only).
function glyphHashes(buf,at){
 const t=tables(buf,at);if(!t.cmap||!t.glyf||!t.loca||!t.head||!t.maxp)return null;
 const long=buf.readInt16BE(t.head.offset+50)===1,count=buf.readUInt16BE(t.maxp.offset+4);
 const loca=i=>long?buf.readUInt32BE(t.loca.offset+i*4):buf.readUInt16BE(t.loca.offset+i*2)*2;
 const out=new Map();
 for(const [code,gid] of cmap(buf,t.cmap)){if(gid>=count)continue;const a=loca(gid),b=loca(gid+1);if(b<=a)continue;
  out.set(code,glyphHash(buf.subarray(t.glyf.offset+a,t.glyf.offset+b)));}
 return out;
}
const CJK=c=>c>=0x3000&&c<=0x30ff||c>=0x3400&&c<=0x9fff||c>=0xf900&&c<=0xfaff||c>=0xff00&&c<=0xffef;
const SYSTEM=['simhei.ttf','simsun.ttc','msyh.ttc','simkai.ttf','simfang.ttf','msyhbd.ttc','msjh.ttc','mingliu.ttc','kaiu.ttf','Deng.ttf'];
const systemCache=new Map();
function systemReverse(name){
 if(systemCache.has(name))return systemCache.get(name);
 const file=path.join(process.env.WINDIR||'C:\\Windows','Fonts',name);let rev=null;
 try{const buf=fs.readFileSync(file);rev=new Map();for(const at of faces(buf)){const h=glyphHashes(buf,at);if(!h)continue;for(const [code,hash] of [...h].sort((x,y)=>x[0]-y[0]))if(!rev.has(hash)||!CJK(rev.get(hash))&&CJK(code))rev.set(hash,code);}}catch{rev=null;}
 systemCache.set(name,rev);return rev;
}
// Font buffers bundled with a patch -> Map(stored char -> real char), or null when the fonts are not remapped.
// anyCode: every code point of the patch font counts, not only CJK ones (E329: the rioLoader font puts its glyphs at
// scattered code points, U+286C for 。).
function unmapping(fontBuffers,{systemFonts=SYSTEM,anyCode=false}={}){
 const glyphs=new Map();
 for(const buf of fontBuffers){try{for(const at of faces(buf)){const h=glyphHashes(buf,at);if(h)for(const [c,v] of h)if((anyCode||CJK(c))&&!glyphs.has(c))glyphs.set(c,v);}}catch{}}
 if(glyphs.size<200)return null;
 const map=new Map();let best=null,bestHits=0;
 for(const name of systemFonts){const rev=systemReverse(name);if(!rev)continue;let hits=0;for(const v of glyphs.values())if(rev.has(v))hits++;if(hits>bestHits){best=rev;bestHits=hits;}if(hits>=glyphs.size*.9)break;}
 if(!best||bestHits<glyphs.size*.5)return null;
 for(const [c,v] of glyphs){const real=best.get(v);if(real!==undefined&&real!==c)map.set(String.fromCodePoint(c),String.fromCodePoint(real));}
 return map.size>=200?map:null;
}
const apply=(map,text)=>map?Array.from(String(text),ch=>map.get(ch)??ch).join(''):text;
module.exports={unmapping,apply,glyphHashes,faces};
