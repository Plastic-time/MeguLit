// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 每部游戏按 exe 文件哈希区分版本，有自己的差分，离线做好后热更新下发) official per-game diffs handed out by the relay.
   A game version is its program's SHA-256 (exeHash, cached per path and invalidated by size + mtime). The official diff of that
   version lives in data/profiles/remote/<exeSha256>.json:
     {"schema":"megulit.profile","format":1,"exeSha256":"<64 hex>","version":<int>=1>,"gameKey":"senren-banka"?,"engine":"kirikiri"?,
      "settings":{<kernel keys only, core/profiles/schema.cjs>},"createdAt":"<ISO>"?,"note":"..."?,
      "signature":{"alg":"ed25519","keyId":"k1","value":"<base64>"}}
   signed like an adapter pack (services/adapter-packs.cjs: Ed25519 over the canonical JSON without "signature", public keys in
   services/adapter-pack-keys.json). check() admits a document only when the schema, the exe hash, every settings key and the
   signature are right; anything else is rejected whole, with the reason. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {validate}=require('./schema.cjs');
const SCHEMA='megulit.profile',FORMAT=1,HEX64=/^[0-9a-f]{64}$/,KEY=/^[a-z0-9][a-z0-9-]{1,62}$/,MAX_BYTES=64*1024;
const TOP=new Set(['schema','format','exeSha256','version','gameKey','engine','settings','createdAt','note','signature']);
const packs=()=>require('../../services/adapter-packs.cjs');
const dir=root=>path.join(root,'data','profiles','remote');
const cacheFile=root=>path.join(root,'cache','exe-sha256.json');

/* ---- exe hash ---------------------------------------------------------------------------------------------------- */
const memo=new Map();
function readCache(root){try{const v=JSON.parse(fs.readFileSync(cacheFile(root),'utf8'));return v&&typeof v==='object'?v:{};}catch{return {};}}
function writeCache(root,c){try{const keys=Object.keys(c);if(keys.length>400)for(const k of keys.slice(0,keys.length-400))delete c[k];fs.mkdirSync(path.dirname(cacheFile(root)),{recursive:true});const tmp=cacheFile(root)+'.tmp';fs.writeFileSync(tmp,JSON.stringify(c));fs.renameSync(tmp,cacheFile(root));}catch{}}
/* SHA-256 of the program file (lower-case hex), from the cache while its size and mtime are unchanged; '' when unreadable */
async function exeHash(file,root){const key=String(file||'').toLowerCase();if(!key)return '';let st;try{st=await fs.promises.stat(file);}catch{return '';}if(!st.isFile())return '';
 const stamp=st.size+':'+Math.round(st.mtimeMs);const m=memo.get(key);if(m&&m.stamp===stamp)return m.hash;
 const cache=root?readCache(root):{};if(cache[key]?.stamp===stamp&&HEX64.test(cache[key].hash)){memo.set(key,cache[key]);return cache[key].hash;}
 const hash=await new Promise(resolve=>{const h=crypto.createHash('sha256'),s=fs.createReadStream(file,{highWaterMark:1<<20});s.on('data',d=>h.update(d));s.on('error',()=>resolve(''));s.on('end',()=>resolve(h.digest('hex')));});
 if(!hash)return '';const v={stamp,hash};memo.set(key,v);if(root){const c=readCache(root);c[key]=v;writeCache(root,c);}return hash;}

/* ---- documents --------------------------------------------------------------------------------------------------- */
function check(doc,exeSha256,keys){const bad=reason=>({ok:false,reason});
 if(!doc||typeof doc!=='object'||Array.isArray(doc))return bad('not an object');
 for(const k of Object.keys(doc))if(!TOP.has(k))return bad('unknown field '+k);
 if(doc.schema!==SCHEMA||doc.format!==FORMAT)return bad('schema');
 if(!HEX64.test(String(doc.exeSha256||'')))return bad('exeSha256');if(exeSha256&&doc.exeSha256!==exeSha256)return bad('exeSha256 is another program');
 if(!Number.isInteger(doc.version)||doc.version<1)return bad('version');
 if(doc.gameKey!==undefined&&(!KEY.test(String(doc.gameKey))||String(doc.gameKey).startsWith('auto-')))return bad('gameKey');
 if(doc.engine!==undefined&&!/^[a-z0-9]{2,40}$/.test(String(doc.engine)))return bad('engine');
 const v=validate(doc.settings);if(!v.ok)return bad('settings '+v.errors.slice(0,3).join('; '));
 let P;try{P=packs();}catch(e){return bad('verifier unavailable');}
 if(Buffer.byteLength(P.canonical(doc))>MAX_BYTES)return bad('too large');
 const sig=P.verifySignature(doc,keys||P.keys());if(!sig.ok)return bad('signature '+sig.error);
 return {ok:true,doc,keyId:sig.keyId};}
/* the stored official diff of this program, checked again on every load (a file changed on disk is not trusted) */
function load(root,exeSha256,keys){if(!root||!HEX64.test(String(exeSha256||'')))return {ok:false,reason:'no exe hash'};let doc;
 try{doc=JSON.parse(fs.readFileSync(path.join(dir(root),exeSha256+'.json'),'utf8'));}catch(e){return {ok:false,reason:e.code==='ENOENT'?'none':'unreadable'};}
 return check(doc,exeSha256,keys);}
/* store a checked document when it is newer than the one on disk; {stored:true|false, reason} */
function store(root,doc,keys){const r=check(doc,doc?.exeSha256,keys);if(!r.ok)return {stored:false,reason:r.reason};const old=load(root,doc.exeSha256,keys);
 if(old.ok&&old.doc.version>=doc.version)return {stored:false,reason:'not newer (have '+old.doc.version+')'};
 const file=path.join(dir(root),doc.exeSha256+'.json');fs.mkdirSync(dir(root),{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(doc,null,1));fs.renameSync(tmp,file);return {stored:true,version:doc.version};}
/* maintainer side (tools / tests): sign with a private key in the adapter-pack format */
function sign(doc,privateKey,keyId){return packs().sign(doc,privateKey,keyId);}
module.exports={SCHEMA,FORMAT,exeHash,check,load,store,sign,dir};
