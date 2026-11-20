// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 传火不能只靠 exe 哈希) the fingerprints the relay can find a game's diff by, most exact first
   (docs/diff-layers.md "认游戏"):
     exe     the exe's full SHA-256 (core/auto-profile.cjs exeKey, cached by path + size + mtime)
     bin     the probe's exe hash: size + first MiB + last MiB (services/probe-identity.cjs exeHash; a patch in the middle of the
             exe keeps it), and the PE time stamp of the exe (pe, 8 hex)
     game    files: SHA-256 of the sorted names and sizes of the game's archives (data.xp3, Scene.pck, *.arc ...), the same archive
             set the probe identity uses; steam: the Steam app id; vndb: the library's VNDB id; title: SHA-256 of the folded title
     engine  the engine id
   Only hashes and public ids leave the PC: no path, no user name. query(id) is the query string of GET /api/game-profile/<exe>. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const ARCHIVE=/\.(xp3|pck|arc|ypf|int|dat|pac|cpk|npa|npk|pfs|ykc|xfl|gpk|mpk|rpa|fpk|afs|bin|ini|ks|scn)$/i;
const SKIP=/^(?:unins|setup|config|readme|license|steam_api|d3dx|msvc|vcruntime)/i;
/* the PE header's TimeDateStamp (8 hex), '' when the file is no PE */
function peStamp(file){let fd;try{fd=fs.openSync(file,'r');const dos=Buffer.alloc(64);if(fs.readSync(fd,dos,0,64,0)<64||dos.readUInt16LE(0)!==0x5a4d)return '';const at=dos.readUInt32LE(60);if(at<64||at>1<<20)return '';
 const pe=Buffer.alloc(12);if(fs.readSync(fd,pe,0,12,at)<12||pe.readUInt32LE(0)!==0x4550)return '';return pe.readUInt32LE(8).toString(16).padStart(8,'0');}catch{return '';}finally{if(fd!==undefined)try{fs.closeSync(fd);}catch{}}}
/* the archive set of the game folder (top level and one folder down), names lower-case with their sizes */
function filesPrint(folder){if(!folder)return '';const rows=[];const look=(dir,rel,depth)=>{let names=[];try{names=fs.readdirSync(dir,{withFileTypes:true});}catch{return;}
  for(const d of names){const r=rel?rel+'/'+d.name:d.name;if(d.isDirectory()){if(depth<1&&!/^(save|savedata|log|logs|cache|screenshots?)$/i.test(d.name))look(path.join(dir,d.name),r,depth+1);continue;}
   if(!ARCHIVE.test(d.name)||SKIP.test(d.name))continue;let size=0;try{size=fs.statSync(path.join(dir,d.name)).size;}catch{}if(size<64*1024)continue;rows.push(r.toLowerCase()+':'+size);}};
 look(folder,'',0);if(rows.length<1)return '';rows.sort();return sha('megulit.files/1|'+rows.join('\n')).slice(0,32);}
const fold=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s　・*＊\-_:：!！?？~〜「」『』【】()（）\[\]'"`.,、。]/g,'');
/* all fingerprints of a running game; exe is passed in when already known (the self-check session has it) */
async function identityOf({root,exe,folder,title='',steamAppId='',vndb='',engine='',exeSha256=''}={}){
 const id={exe:/^[0-9a-f]{64}$/.test(exeSha256)?exeSha256:'',bin:'',pe:'',files:'',steam:'',vndb:'',title:'',engine:''};
 if(!id.exe&&exe&&root)try{id.exe=await require('../auto-profile.cjs').exeKey(root,exe);}catch{}
 if(exe){try{id.bin=require('../../services/probe-identity.cjs').exeHash(exe)||'';}catch{}id.pe=peStamp(exe);}
 id.files=filesPrint(folder||(exe?path.dirname(exe):''));
 if(/^\d{1,10}$/.test(String(steamAppId||'')))id.steam=String(steamAppId);
 if(/^v[1-9]\d{0,7}$/.test(String(vndb||'')))id.vndb=String(vndb);
 const t=fold(title);if(t.length>=2)id.title=sha('megulit.title/1|'+t).slice(0,32);
 const e=require('./index.cjs').engineId(engine);if(e)id.engine=e;
 return id;}
/* the query string for the relay (exe goes in the path) */
function query(id){const q=new URLSearchParams();for(const k of ['bin','pe','files','steam','vndb','title','engine'])if(id&&id[k])q.set(k,String(id[k]));const s=q.toString();return s?'?'+s:'';}
module.exports={identityOf,query,peStamp,filesPrint};
