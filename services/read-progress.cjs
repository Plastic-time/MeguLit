// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// How much of a work has really been read: the script's text lines against the lines already read.
// total: text lines of the running script, from the index services/original-text.cjs keeps, or read once with its
//   adapters and cached by the script's fingerprint (data/config/read-progress/), so it is not recounted until the game
//   files change.
// read: a reader of the game's own read flags when one exists for the engine (SAVE_READERS); otherwise the lines this
//   game has shown in MeguLit (data/config/game-read-lines.json, kept by core/game-style-sync.cjs per executable hash),
//   counted as the script lines whose text is among them. Nothing found means null, never an estimate.
// Game saves checked so far (2026-11-11): BGI BGI.gdb is "SDC FORMAT 1.00" (DSC key stream, then "BURIKO GDB 3.00"
// with an LZ variant not yet identified) and Siglus savedata*/read.sav is encrypted; neither is read yet.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ot=require('./original-text.cjs');
const SCHEMA=1;
const prose=t=>/[^\x00-\x7f]/.test(t)&&!!String(t).trim();
const fnv=s=>{let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return h>>>0;}; // same as core/game-style-sync.cjs readLine
const lineHash=t=>fnv(String(t).replace(/\s+/g,''));
const cacheDir=root=>path.join(root,'data/config/read-progress');
const cacheFile=(root,id)=>path.join(cacheDir(root),crypto.createHash('sha256').update(String(id)).digest('hex').slice(0,16)+'.json');
const sha256File=file=>{const hash=crypto.createHash('sha256'),fd=fs.openSync(file,'r'),buf=Buffer.alloc(1<<20);try{let n;while((n=fs.readSync(fd,buf,0,buf.length,null))>0)hash.update(buf.subarray(0,n));}finally{fs.closeSync(fd);}return hash.digest('hex');};
const SAVE_READERS={}; // engine -> (gameDir, hashes) => {read, total?} | null

function packHashes(list){const a=new Uint32Array(list);return Buffer.from(a.buffer).toString('base64');}
function unpackHashes(s){const b=Buffer.from(String(s||''),'base64');return Array.from(new Uint32Array(b.buffer,b.byteOffset,b.length>>2));}
function readJson(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}}
function writeJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(value));fs.renameSync(file+'.tmp',file);}

// The script's text lines as hashes, with the engine and the fingerprint they were counted for.
function script(root,id,executable,{state}={}){
 const s=state===undefined?readJson(path.join(root,'data/config/original-text.json'))?.[id]:state,rt=s?.runtime;
 const cached=readJson(cacheFile(root,id));
 if(rt?.index&&rt.sha256&&fs.existsSync(rt.index)){
  if(cached?.schema===SCHEMA&&cached.fingerprint===rt.sha256)return cached;
  try{const idx=JSON.parse(fs.readFileSync(rt.index,'utf8'));if(Array.isArray(idx.lines))return save(root,id,{engine:rt.engine||idx.engine||'system4',fingerprint:rt.sha256,lines:idx.lines});}catch{}
 }
 if(!executable)return null;
 const dir=path.dirname(executable),loc=ot.locate(dir,path.parse(executable).name);if(!loc)return null;
 let fp;try{fp=ot.ADAPTERS[loc.engine].fingerprint(loc.target);}catch{return null;}
 if(cached?.schema===SCHEMA&&cached.fingerprint===fp)return cached;
 let lines;try{lines=ot.readScript(loc).lines;}catch{return null;}
 return save(root,id,{engine:loc.engine,fingerprint:fp,lines});
}
function save(root,id,{engine,fingerprint,lines}){
 const hashes=lines.filter(prose).map(lineHash),value={schema:SCHEMA,engine,fingerprint,total:hashes.length,hashes:packHashes(hashes),at:Date.now()};
 try{writeJson(cacheFile(root,id),value);}catch{}return value;
}

function seenSet(root,executable){
 if(!executable||!fs.existsSync(executable))return null;
 const all=readJson(path.join(root,'data/config/game-read-lines.json'))?.entries;if(!all)return null;
 let key;try{key=sha256File(executable);}catch{return null;}
 const list=all[key];return Array.isArray(list)&&list.length?new Set(list):null;
}

function progress(root,db,id){
 id=String(id);const row=db.prepare('SELECT id,executable FROM games WHERE id=? AND removed_at IS NULL').get(id);if(!row)throw Error('GAME_NOT_FOUND');
 const sc=script(root,id,row.executable),total=sc?.total||null;
 let read=null,source=null;
 const reader=sc&&SAVE_READERS[sc.engine];
 if(reader){try{const r=reader(path.dirname(row.executable),unpackHashes(sc.hashes));if(r&&Number.isFinite(r.read)){read=r.read;source='save';}}catch{}}
 if(read===null&&total){const seen=seenSet(root,row.executable);if(seen){read=0;for(const h of unpackHashes(sc.hashes))if(seen.has(h))read++;source='megulit-seen';}}
 return {id,engine:sc?.engine||null,total,read,ratio:total&&read!==null?Math.min(1,read/total):null,source};
}

module.exports={progress,script,lineHash,SAVE_READERS,_internal:{packHashes,unpackHashes,cacheFile}};
