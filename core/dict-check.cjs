// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Integrity check for the two local dictionary databases (SudachiDict Full, UniDic).
// pip records a SHA-256 for every installed file in <pkg>.dist-info/RECORD; re-hash and compare.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const DATABASES=[
 {id:'sudachi',pkg:'sudachidict_full',name:'SudachiDict Full',role:{zh:'分词与词典（查词、点读）',en:'Tokenizer dictionary (lookups, tap-to-read)',ja:'形態素解析辞書（辞書引き・タップ読み）'}},
 {id:'unidic',pkg:'unidic_lite',name:'UniDic',role:{zh:'注音与音调（假名、朗读）',en:'Readings & pitch (furigana, speech)',ja:'読みとアクセント（ふりがな・読み上げ）'}},
];
function distInfo(root,pkg){try{return fs.readdirSync(root).find(n=>n.toLowerCase().startsWith(pkg.toLowerCase()+'-')&&n.endsWith('.dist-info'))||'';}catch{return '';}}
function record(root,pkg){
 const dir=distInfo(root,pkg);if(!dir)return null;const version=dir.slice(pkg.length+1,-'.dist-info'.length);
 let text='';try{text=fs.readFileSync(path.join(root,dir,'RECORD'),'utf8');}catch{return {version,files:[]};}
 const files=[];for(const line of text.split(/\r?\n/)){if(!line.trim())continue;const parts=line.split(',');const size=Number(parts.pop()),hash=parts.pop(),file=parts.join(',');
  if(!hash||!hash.startsWith('sha256=')||!file.startsWith(pkg+'/'))continue;files.push({file,hash:hash.slice(7),size:Number.isFinite(size)?size:0});}
 return {version,files};
}
// Licence / readme files are not needed for the dictionaries to work; a missing one is not damage.
const optional=f=>/\.(md|txt|pdf)$/i.test(f)||/\/(AUTHORS|BSD|COPYING|ChangeLog|GPL|LGPL|INSTALL|LICENSE[^/]*|README[^/]*)$/i.test(f);
function hashFile(file,onBytes){return new Promise((resolve,reject)=>{const h=crypto.createHash('sha256'),s=fs.createReadStream(file,{highWaterMark:4*1024*1024});s.on('data',d=>{h.update(d);onBytes(d.length);});s.on('error',reject);s.on('end',()=>resolve(h.digest('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')));});}
// Quick status: installed? version, size on disk. No hashing.
function quickStatus(root){return DATABASES.map(db=>{const r=record(root,db.pkg);let size=0,missing=0;for(const f of r?.files||[]){try{size+=fs.statSync(path.join(root,f.file)).size;}catch{if(!optional(f.file))missing++;}}return {id:db.id,name:db.name,role:db.role,installed:!!r&&r.files.length>0&&missing===0,version:r?.version||'',files:r?.files.length||0,size,missing};});}
// Full check with progress (0-100) across both databases.
async function fullCheck(root,onProgress=()=>{}){
 const plans=DATABASES.map(db=>({db,r:record(root,db.pkg)}));const total=plans.reduce((n,p)=>n+(p.r?.files||[]).reduce((m,f)=>m+f.size,0),0)||1;let done=0,last=0;
 const results=[];
 for(const {db,r} of plans){
  const res={id:db.id,name:db.name,role:db.role,version:r?.version||'',files:r?.files.length||0,size:0,missing:[],bad:[],installed:!!r};
  if(!r){res.ok=false;results.push(res);continue;}
  for(const f of r.files){const full=path.join(root,f.file);onProgress({percent:done/total*100,file:db.name+' · '+path.basename(f.file)});
   if(!fs.existsSync(full)){if(!optional(f.file))res.missing.push(f.file);done+=f.size;continue;}
   try{const got=await hashFile(full,n=>{done+=n;const now=Date.now();if(now-last>150){last=now;onProgress({percent:Math.min(99.9,done/total*100),file:db.name+' · '+path.basename(f.file)});}});res.size+=f.size;if(got!==f.hash)res.bad.push(f.file);}catch{res.bad.push(f.file);}}
  res.ok=res.missing.length===0&&res.bad.length===0&&res.files>0;results.push(res);
 }
 onProgress({percent:100,file:''});return results;
}
module.exports={DATABASES,quickStatus,fullCheck};
