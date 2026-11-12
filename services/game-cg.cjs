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

/* ---- Siglus (CLANNAD, Summer Pockets): dat/mode.cgm ("CGTABLE2") is the gallery: after a 0x20 head, bytes XORed
   with a 256-byte table the engine keeps (the same in every Siglus exe seen), then Siglus LZSS; 0x3C-byte records of
   a 32-byte g00 name and the record's flag number. savedata_*global.sav (u32 version, u32, u32 size, then the same
   XOR + LZSS) holds the global tables as {u32 next offset, u32 count, count u32 values}; the CG table is the one
   long enough for every flag number whose set entries are all gallery flags. Images: g00/<name>.g00. */
const SIGLUS_KEY=Buffer.from('8be55dc3a1e030440085c074095f5e33c05b8be55dc38b450c85c075148b55ec83c220526a00e8f528010083c40889450c8b45e46a006a005053ff1534b143008b451085c074058b4dec89088a45f084c07578a1e03044008b7de88b750c85c075448b1dd0b0430085ff763781ff000004006a0076438b45f88d55fc5268000004005650ff152cb143006a05ffd3a1e030440081ef0000040081c60000040085c074c58b5df853e8f4fbffff8b450c83c4045f5e5b8be55dc38b55f88d4dfc51575652ff152cb14300ebd88b45e883c020506a00e8472801008b7de88945f48bf0a1e030440083c40885c075568b1dd0b0430085ff764981ff000004006a0076','hex');
const unxor=(b,from)=>{const o=Buffer.from(b.subarray(from));for(let i=0;i<o.length;i++)o[i]^=SIGLUS_KEY[i&255];return o;};
function siglusTable(buf){
 if(buf.length<0x28||!/^CGTABLE/.test(buf.toString('latin1',0,8)))return null;const {siglusLz}=require('./cg-decoders.cjs');
 let raw;try{raw=siglusLz(unxor(buf,0x20));}catch{try{raw=siglusLz(buf,0x20);}catch{return null;}}
 const out=new Map();for(let i=0;i+0x3c<=raw.length;i+=0x3c){const name=raw.toString('latin1',i,i+32).replace(/\0[\s\S]*$/,'').trim();if(name)out.set(name.toLowerCase(),raw.readInt32LE(i+32));}
 return out;}
function siglusGlobalTables(buf){
 if(buf.length<20)return [];let raw;try{raw=require('./cg-decoders.cjs').siglusLz(unxor(buf,12));}catch{return [];}
 const out=[];let p=8;
 while(p+8<=raw.length){const next=raw.readUInt32LE(p),n=raw.readUInt32LE(p+4);
  if(next<=p||next>raw.length){p+=4;continue;}
  if(next-p-8===n*4){const set=[];for(let i=0;i<n;i++)if(raw.readInt32LE(p+8+i*4))set.push(i);out.push({count:n,set});}
  p=next;}
 return out;}
function siglusSaves(dir){const out=[];let l=[];try{l=fs.readdirSync(dir,{withFileTypes:true});}catch{return out;}
 for(const e of l)if(e.isDirectory()&&/^savedata/i.test(e.name)){const f=path.join(dir,e.name,'global.sav');if(fs.existsSync(f))out.push(f);}return out;}
function siglus(dir){
 const cgm=path.join(dir,'dat','mode.cgm');if(!fs.existsSync(cgm))return null;const table=siglusTable(fs.readFileSync(cgm));if(!table||!table.size)return null;
 const flags=new Set(table.values()),top=Math.max(...flags),on=new Set();
 for(const f of siglusSaves(dir)){let tabs;try{tabs=siglusGlobalTables(fs.readFileSync(f));}catch{continue;}
  const fit=tabs.filter(t=>t.count>top&&t.set.every(i=>flags.has(i))).sort((a,b)=>b.set.length-a.set.length)[0];if(fit)for(const i of fit.set)on.add(i);}
 const g00=path.join(dir,'g00'),files=new Map();try{for(const f of fs.readdirSync(g00))if(/\.g00$/i.test(f))files.set(base(f),path.join(g00,f));}catch{}
 const items=new Map();for(const [name,flag] of table){if(!on.has(flag))continue;const file=files.get(name);if(file&&!items.has(name))items.set(name,{name,file,decode:'g00'});}
 return {engine:'Siglus',supported:true,items,total:table.size};
}

const READERS=[{read:kirikiri,saves:kirikiriSaves},{read:hunex,saves:hunexSaves},{read:siglus,saves:siglusSaves}];
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
module.exports={list,image,scan,ksdText,tokens,sdcUnpack,mzpNameSets,siglusTable,siglusGlobalTables,SIGLUS_KEY};
