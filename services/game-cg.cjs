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

const READERS=[kirikiri];
const cache=new Map();
function stamp(dir){let s='';for(const f of kirikiriSaves(dir)){try{s+=f+fs.statSync(f).mtimeMs;}catch{}}return s;}
function scan(executable){
 const dir=path.dirname(String(executable||''));if(!dir||!fs.existsSync(dir))return {supported:false,items:new Map()};
 const key=dir.toLowerCase(),st=stamp(dir),hit=cache.get(key);if(hit&&hit.stamp===st)return hit.result;
 let result={supported:false,items:new Map()};for(const read of READERS){try{const r=read(dir);if(r){result=r;break;}}catch{}}
 cache.set(key,{stamp:st,result});return result;
}
function list(executable){const r=scan(executable);return {supported:!!r.supported,engine:r.engine||'',items:[...r.items.keys()]};}
function mimeOf(b){if(b.length<12)return null;if(b[0]===0x89&&b.toString('latin1',1,4)==='PNG')return 'image/png';if(b[0]===0xff&&b[1]===0xd8)return 'image/jpeg';
 if(b.toString('latin1',0,4)==='RIFF'&&b.toString('latin1',8,12)==='WEBP')return 'image/webp';if(b[0]===0x42&&b[1]===0x4d)return 'image/bmp';return null;}
function image(root,executable,name){
 const r=scan(executable),it=r.items.get(String(name||'').toLowerCase());if(!it)throw Error('CG_NOT_FOUND');
 const dir=path.join(root,'data','cg-cache',crypto.createHash('sha1').update(path.dirname(executable).toLowerCase()).digest('hex').slice(0,16));
 for(const ext of ['.png','.jpg','.webp','.bmp']){const f=path.join(dir,it.name+ext);if(fs.existsSync(f)){const b=fs.readFileSync(f);return {mime:mimeOf(b),data:b.toString('base64')};}}
 const buf=it.file?fs.readFileSync(it.file):require('./original-engines/xp3.cjs').read(it.archive,it.entry,it.cx||null);
 const mime=mimeOf(buf);if(!mime||buf.length>24<<20)throw Error('CG_UNREADABLE');
 try{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,it.name+{'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','image/bmp':'.bmp'}[mime]),buf);}catch{}
 return {mime,data:buf.toString('base64')};
}
module.exports={list,image,ksdText,tokens};
