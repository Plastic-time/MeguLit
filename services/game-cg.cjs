// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-12 (user: the detail card flips; its back shows a random CG this computer has already unlocked). The unlock
   state comes only from the game's own saves (user's choice), never from guessing: an engine reader finds the CGs the
   save records and reads those images from the game's own files. Engines without a reader yet return supported:false
   and the card shows its plain back.
   KiriKiri: the system save (savedata/datasu.ksd) keeps every image the game has shown, as "cg_<FILE>" => 1 (KAG and
   Yuzusoft) or as the bare name. Saved as UTF-16 text, its simple bit-swap obfuscation (mode 1) or zlib (mode 2). The
   images are loose files or entries of plain (or cx-filtered) .xp3 archives; only browser-readable formats are used. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const IMG=/\.(?:png|jpe?g|webp|bmp)$/i;
const CGISH=/(?:^|[\\/_])(?:ev|cg|event|evcg|ecg)[\w-]*|^e\d/i;

function ksdText(buf){
 if(!buf||buf.length<4)return '';
 if(buf[0]===0xfe&&buf[1]===0xfe){const mode=buf[2];
  if(mode===2){const at=buf.indexOf(Buffer.from([0x78]),5);for(let i=at;i>=0&&i<Math.min(buf.length,64);i=buf.indexOf(Buffer.from([0x78]),i+1)){try{return zlib.inflateSync(buf.subarray(i)).toString('utf16le');}catch{}}return '';}
  if(mode===1){const body=buf.subarray(5),out=Buffer.alloc(body.length&~1);for(let i=0;i+1<body.length;i+=2){const c=body.readUInt16LE(i);out.writeUInt16LE(((c&0xaaaa)>>1)|((c&0x5555)<<1),i);}return out.toString('utf16le');}
  return '';}
 if(buf[0]===0xff&&buf[1]===0xfe)return buf.subarray(2).toString('utf16le');
 return buf.toString('utf16le');
}
const base=name=>path.basename(String(name).replace(/\\/g,'/')).replace(/\.[^.]+$/,'').toLowerCase();

function kirikiriSaves(dir){
 const out=[];let list=[];try{list=fs.readdirSync(dir,{withFileTypes:true});}catch{return out;}
 for(const e of list)if(e.isDirectory()&&/^save/i.test(e.name)){const f=path.join(dir,e.name,'datasu.ksd');if(fs.existsSync(f))out.push(f);}
 return out;
}
function tokens(text){const set=new Set();
 for(const m of text.matchAll(/"cg_([^"]+?)"\s*=>/g))set.add(base(m[1]));
 for(const m of text.matchAll(/"([A-Za-z0-9_\-]{3,64})(?:\.(?:png|jpe?g|tlg|bmp|webp))?"/gi))set.add(m[1].toLowerCase());
 return set;}
function looseImages(dir,depth=3,out=[]){let list;try{list=fs.readdirSync(dir,{withFileTypes:true});}catch{return out;}
 for(const e of list){const p=path.join(dir,e.name);if(e.isDirectory()){if(depth>0&&!/^(?:save|savedata|movie|bgm|voice|sound|se)$/i.test(e.name)&&!/全cg/i.test(e.name))looseImages(p,depth-1,out);}else if(IMG.test(e.name))out.push(p);}return out;}

function kirikiri(dir){
 const saves=kirikiriSaves(dir);if(!saves.length)return null;
 const seen=new Set();for(const f of saves){try{for(const t of tokens(ksdText(fs.readFileSync(f))))seen.add(t);}catch{}}
 const items=new Map();
 for(const p of looseImages(dir)){const rel=path.relative(dir,p);if(!CGISH.test(rel))continue;const b=base(p);if(seen.has(b)&&!items.has(b))items.set(b,{name:b,file:p});}
 const xp3=require('./original-engines/xp3.cjs');let archives=[];try{archives=fs.readdirSync(dir).filter(f=>/\.xp3$/i.test(f));}catch{}
 for(const a of archives){const file=path.join(dir,a);let list;try{list=xp3.list(file)?.files||[];}catch{continue;}
  let cx;const flagged=list.some(e=>e.encrypted);if(flagged){try{cx=require('./original-engines/cx-filter.cjs').forArchive(file);}catch{}if(!cx)continue;}
  for(const e of list){if(!IMG.test(e.name))continue;const b=base(e.name);if(!seen.has(b)||items.has(b))continue;if(!CGISH.test(a+'/'+e.name))continue;items.set(b,{name:b,archive:file,entry:e,cx});}}
 return {engine:'KiriKiri',supported:true,items};
}

/* ---- HuneX (魔法使いの夜 Steam): the global save <Title>.gdb is "SDC FORMAT 1.00": u32 seed, u32 packed size, u32 size,
   u16 byte sum and u16 byte xor of the packed bytes, then from 0x20 the packed bytes, each minus the high byte of the
   next Borland LCG state (s = s*0x15A4E35+1); unpacked with a small LZ (byte < 0x80: that many+1 literals; else length
   ((b>>3)&15)+2, distance ((b&7)<<8 | next)+2). Inside: a 0x80-byte header and blocks, one of them the set of every
   image the game has shown ("img0408.mzp"...): u32 count, then NUL-terminated names. The exe keeps the gallery's
   image list in .rdata ("IMG0408.MZP" in 16-byte slots); a seen image counts as a CG only if the gallery lists it.
   Images are MZP ("mrgd00") entries of the game's .hfa archives, decoded to PNG (services/cg-decoders). */
function sdcUnpack(b){
 if(b.length<32||b.toString('latin1',0,15)!=='SDC FORMAT 1.00')return null;
 let s=b.readUInt32LE(16)>>>0;const n=b.readUInt32LE(20),size=b.readUInt32LE(24);if(32+n>b.length||size>64<<20)return null;
 const e=Buffer.alloc(n);let sum=0,xor=0;for(let i=0;i<n;i++){const c=b[32+i];sum=(sum+c)&0xffff;xor^=c;s=(Math.imul(s,0x15a4e35)+1)>>>0;e[i]=(c-((s>>>16)&0xff))&0xff;}
 if(sum!==b.readUInt16LE(28)||xor!==b.readUInt16LE(30))return null;
 const o=Buffer.alloc(size);let p=0,q=0;
 while(p<n&&q<size){const c=e[p];if(c&0x80){const len=((c>>3)&15)+2,dist=((c&7)<<8)+e[p+1]+2;if(dist>q)return null;for(let k=0;k<len&&q<size;k++,q++)o[q]=o[q-dist];p+=2;}else{p++;for(let k=0;k<=c&&q<size;k++)o[q++]=e[p++];}}
 return o;}
/* every run of "<name>.mzp\0" strings that a u32 count of exactly that many introduces */
function mzpNameSets(buf){const out=new Set(),t=buf.toString('latin1');const re=/(?:[\w-]{1,60}\.mzp\0)+/gi;let m;
 while((m=re.exec(t))){const at=m.index;if(at<4)continue;const names=m[0].split('\0').filter(Boolean);if(buf.readUInt32LE(at-4)!==names.length)continue;for(const n of names)out.add(base(n));}
 return out;}
function hunexGallery(exe){let d;try{d=fs.readFileSync(exe);}catch{return null;}const t=d.toString('latin1'),out=new Set();
 for(const m of t.matchAll(/(?:[A-Z0-9_]{1,15}\.MZP\0+){20,}/g))for(const n of m[0].split(/\0+/))if(n)out.add(base(n));
 return out.size?out:null;}
function hunexSaves(dir){let l=[];try{l=fs.readdirSync(dir).filter(f=>/\.gdb$/i.test(f));}catch{}return l.map(f=>path.join(dir,f));}
function hunex(dir,exe){
 const saves=hunexSaves(dir);if(!saves.length)return null;let hfa=[];try{hfa=fs.readdirSync(dir).filter(f=>/\.hfa$/i.test(f)).sort();}catch{}if(!hfa.length)return null;
 const seen=new Set();let ok=false;for(const f of saves){try{const raw=sdcUnpack(fs.readFileSync(f));if(raw){ok=true;for(const n of mzpNameSets(raw))seen.add(n);}}catch{}}
 if(!ok)return null;
 const gallery=hunexGallery(exe),{hfaList}=require('./original-engines/hunex.cjs'),items=new Map();
 for(const a of hfa){const file=path.join(dir,a);let list;try{list=hfaList(file)||[];}catch{continue;}
  for(const e of list){if(!/\.mzp$/i.test(e.name))continue;const b=base(e.name);if(!seen.has(b)||items.has(b)||(gallery&&!gallery.has(b)))continue;items.set(b,{name:b,archive:file,entry:e,decode:'mzp'});}}
 return {engine:'HuneX',supported:true,items,total:gallery?gallery.size:0};
}

const READERS=[{read:kirikiri,saves:kirikiriSaves},{read:hunex,saves:hunexSaves}];
const cache=new Map();
function stamp(dir){let s='';for(const r of READERS)for(const f of r.saves(dir)){try{s+=f+fs.statSync(f).mtimeMs;}catch{}}return s;}
function scan(executable){
 const dir=path.dirname(String(executable||''));if(!dir||!fs.existsSync(dir))return {supported:false,items:new Map()};
 const key=dir.toLowerCase(),st=stamp(dir),hit=cache.get(key);if(hit&&hit.stamp===st)return hit.result;
 let result={supported:false,items:new Map()};for(const r of READERS){try{const got=r.read(dir,String(executable));if(got){result=got;break;}}catch{}}
 cache.set(key,{stamp:st,result});return result;
}
function list(executable){const r=scan(executable);return {supported:!!r.supported,engine:r.engine||'',total:r.total||0,items:[...r.items.keys()]};}
function mimeOf(b){if(b.length<12)return null;if(b[0]===0x89&&b.toString('latin1',1,4)==='PNG')return 'image/png';if(b[0]===0xff&&b[1]===0xd8)return 'image/jpeg';
 if(b.toString('latin1',0,4)==='RIFF'&&b.toString('latin1',8,12)==='WEBP')return 'image/webp';if(b[0]===0x42&&b[1]===0x4d)return 'image/bmp';return null;}
/* the raw bytes of an item, engine formats decoded to PNG */
function bytesOf(it){
 const dec=require('./cg-decoders.cjs');
 let buf;if(it.file)buf=fs.readFileSync(it.file);
 else if(/\.hfa$/i.test(it.archive))buf=require('./original-engines/hunex.cjs').hfaRead(it.archive,it.entry);
 else buf=require('./original-engines/xp3.cjs').read(it.archive,it.entry,it.cx||null);
 if(it.decode&&dec[it.decode])return dec.png(dec.fit(dec[it.decode](buf)));
 return buf;}
function image(root,executable,name){
 const r=scan(executable),it=r.items.get(String(name||'').toLowerCase());if(!it)throw Error('CG_NOT_FOUND');
 const dir=path.join(root,'data','cg-cache',crypto.createHash('sha1').update(path.dirname(executable).toLowerCase()).digest('hex').slice(0,16));
 for(const ext of ['.png','.jpg','.webp','.bmp']){const f=path.join(dir,it.name+ext);if(fs.existsSync(f)){const b=fs.readFileSync(f);return {mime:mimeOf(b),data:b.toString('base64')};}}
 const buf=bytesOf(it);
 const mime=mimeOf(buf);if(!mime||buf.length>24<<20)throw Error('CG_UNREADABLE');
 try{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,it.name+{'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','image/bmp':'.bmp'}[mime]),buf);}catch{}
 return {mime,data:buf.toString('base64')};
}
module.exports={list,image,scan,ksdText,tokens,sdcUnpack,mzpNameSets};
