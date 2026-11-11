// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E450 The game's own voice for a line (user: example sentences from a voiced game played an AI voice).
   Two sources, both kept on this computer under data/voice-cache (never in the repository):
   - scan: the engine readers give each line the voice its script plays (scene.voices, voice-ref.cjs); the voice is
     found in the game's folder or archives (loose files, .xp3, AdvHD .arc, RealLive/Siglus .ovk) and copied out the
     first time it is asked for;
   - runtime: while the game runs, the clip recorded for a shown line (gal-native gameMedia) is kept for that line.
   A line is found by its text alone, so the learning page, saved sentences, grammar examples and Anki cards all
   reach it without knowing which game it came from. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const PROVIDERS=['./original-engines/npk.cjs','./original-engines/catsystem2.cjs','./original-engines/yuris.cjs'];
const AUDIO=/\.(?:ogg|opus|wav|mp3|m4a)$/i;
const sha1=s=>crypto.createHash('sha1').update(s).digest('hex');
// The text key: NFKC, no spaces or markup, no speaker name before a quote, no outer quote marks.
function norm(text){let t=String(text||'').replace(/<[^>]*>/g,'').normalize('NFKC').replace(/[\s　]+/g,'');
 const q=/^[^「『（(]{1,16}?[「『（(](.+)[」』）)]$/.exec(t);if(q)t=q[1];else{const w=/^[「『（(](.+)[」』）)]$/.exec(t);if(w)t=w[1];}
 t=t.replace(/^[^「『（(]{1,16}?[「『](?!.*[」』])/,'').replace(/^[「『（(]/,'').replace(/[」』）)]$/,'');
 return t.replace(/[。、！？!?…‥・〜～ー―─\-♪☆★]+$/,'');}
const keyOf=text=>{const n=norm(text);return n.length>=2?sha1(n):null;};
const cacheDir=root=>path.join(root,'data','voice-cache');
function readJSON(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
function writeJSON(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(value));fs.renameSync(file+'.tmp',file);}
const gameKey=dir=>sha1(path.resolve(String(dir)).toLowerCase()).slice(0,16);
// The content type of a clip from its first bytes; null when a browser could not play it.
function kind(b){if(!b||b.length<12)return null;const h=b.toString('latin1',0,4);
 if(h==='OggS')return {ext:'.ogg',mime:'audio/ogg'};if(h==='RIFF'&&b.toString('latin1',8,12)==='WAVE')return {ext:'.wav',mime:'audio/wav'};
 if(h.startsWith('ID3')||(b[0]===0xff&&(b[1]&0xe0)===0xe0))return {ext:'.mp3',mime:'audio/mpeg'};if(b.toString('latin1',4,8)==='ftyp')return {ext:'.m4a',mime:'audio/mp4'};return null;}

/* ---- where a voice name is stored in a game folder ---- */
function walk(dir,depth=4,out=[]){let list;try{list=fs.readdirSync(dir,{withFileTypes:true});}catch{return out;}
 for(const e of list){const p=path.join(dir,e.name);if(e.isDirectory()){if(depth>0&&!/^(?:\.git|node_modules|savedata|save)$/i.test(e.name))walk(p,depth-1,out);}else out.push(p);}return out;}
const base=name=>path.basename(String(name).replace(/\\/g,'/')).replace(/\.[^.]+$/,'').toLowerCase();
// AdvHD .arc: extension table, then 9- or 13-byte names with size and offset (offsets count from the end of the index).
function arcList(file){let fd;try{fd=fs.openSync(file,'r');const size=fs.fstatSync(fd).size,head=Buffer.alloc(Math.min(size,8<<20));fs.readSync(fd,head,0,head.length,0);
 const n=head.readInt32LE(0);if(n<=0||n>0xff)return null;const exts=[];for(let i=0;i<n;i++){const p=4+i*12;const ext=head.toString('latin1',p,p+4).replace(/\0.*$/s,'');if(!/^[A-Za-z0-9]{1,4}$/.test(ext))return null;exts.push({ext,count:head.readUInt32LE(p+4),dir:head.readUInt32LE(p+8)});}
 const tryWidth=w=>{const out=[];for(const e of exts){let d=e.dir;for(let i=0;i<e.count;i++){if(d+w+8>head.length)return null;const name=head.toString('latin1',d,d+w).replace(/\0.*$/s,''),s=head.readUInt32LE(d+w),o=head.readUInt32LE(d+w+4);if(!name||o+s>size)return null;out.push({name:name+'.'+e.ext.toLowerCase(),size:s,offset:o});d+=w+8;}}return out;};
 return tryWidth(9)||tryWidth(13);}catch{return null;}finally{if(fd!==undefined)try{fs.closeSync(fd);}catch{}}}
// RealLive / Siglus .ovk: count, then {size, offset, id, samples} per clip; every clip is an Ogg stream.
function ovkList(file){let fd;try{fd=fs.openSync(file,'r');const size=fs.fstatSync(fd).size,h=Buffer.alloc(4);fs.readSync(fd,h,0,4,0);const n=h.readUInt32LE(0);if(!n||n>100000||4+n*16>size)return null;
 const t=Buffer.alloc(n*16);fs.readSync(fd,t,0,t.length,4);const out=[];for(let i=0;i<n;i++){const s=t.readUInt32LE(i*16),o=t.readUInt32LE(i*16+4),id=t.readUInt32LE(i*16+8);if(o+s>size)return null;out.push({id,size:s,offset:o});}return out;}catch{return null;}finally{if(fd!==undefined)try{fs.closeSync(fd);}catch{}}}
function slice(file,offset,size){const fd=fs.openSync(file,'r');try{const b=Buffer.alloc(size);fs.readSync(fd,b,0,size,offset);return b;}finally{fs.closeSync(fd);}}
// Every voice clip a folder holds: name (no extension, lower case) -> a reader. Archives are listed once.
function catalog(dir){const map=new Map(),koe=new Map(),add=(name,read)=>{const k=base(name);if(k&&!map.has(k))map.set(k,read);};
 const xp3=require('./original-engines/xp3.cjs');
 for(const file of walk(dir)){const low=file.toLowerCase();
  if(AUDIO.test(low)){add(file,()=>fs.readFileSync(file));continue;}
  if(low.endsWith('.xp3')){let t;try{t=xp3.list(file);}catch{}if(!t)continue;const audio=t.files.filter(e=>AUDIO.test(e.name));if(!audio.length)continue;
   /* an entry flagged protected can still be stored plain (女王蜂の王房, 赤ずきん): read one and look */
   const flagged=audio.find(e=>e.encrypted);let open=false;if(flagged){try{open=!!kind(xp3.read(file,flagged));}catch{}}
   let cx=null;if(flagged&&!open){try{cx=require('./original-engines/cx-filter.cjs').forArchive(file);}catch{}}
   for(const e of audio)if(!e.encrypted||open||cx)add(e.name,()=>xp3.read(file,e,open?null:cx));continue;}
  if(low.endsWith('.arc')){const l=arcList(file);if(l)for(const e of l)if(AUDIO.test(e.name))add(e.name,()=>slice(file,e.offset,e.size));continue;}
  /* archives an engine reader knows: each lists its clips as {name, read} */
  if(/[.](?:npk|ypf|int|bin|pak|dat|pck)$/.test(low)){let l=null;for(const m of PROVIDERS){try{l=require(m).audio?.(file);}catch{}if(l&&l.length)break;}if(l)for(const e of l)add(e.name,e.read);continue;}
  if(low.endsWith('.ovk')){const m=/(\d+)\.ovk$/.exec(low),l=ovkList(file);if(m&&l)for(const e of l){const id=Number(m[1])*100000+e.id;koe.set(id,()=>slice(file,e.offset,e.size));}continue;}}
 return {map,koe,get(ref){if(/^koe:\d+$/.test(ref))return koe.get(Number(ref.slice(4)))||null;return map.get(String(ref).toLowerCase())||null;}};}

/* ---- the line index ---- */
const catalogs=new Map();
function catalogFor(dir){const k=gameKey(dir);let c=catalogs.get(k);if(!c){c=catalog(dir);catalogs.set(k,c);if(catalogs.size>4)catalogs.delete(catalogs.keys().next().value);}return c;}
function linesFile(root){return path.join(cacheDir(root),'lines.json');}
let memo=null;
function lines(root){if(!memo||memo.root!==root)memo={root,data:readJSON(linesFile(root),{schema:1,games:{},lines:{}})};return memo.data;}
function save(root){writeJSON(linesFile(root),lines(root));}
// Scan one game: every line whose script names a voice that the folder really holds. Returns counts per engine.
function scan(root,dir,{engine,scenes}={}){const sc=require('./original-engines/scenes.cjs');
 const id=engine||sc.detect(dir);if(!id)return {engine:null,lines:0,voiced:0,found:0};
 const list=scenes||sc.read(id,dir),cat=catalogFor(dir),g=gameKey(dir),data=lines(root);let total=0,voiced=0,found=0;
 for(const s of list){const v=s.voices||[];for(let i=0;i<(s.lines||[]).length;i++){total++;if(!v[i])continue;voiced++;if(!cat.get(v[i]))continue;const k=keyOf(s.lines[i]);if(!k)continue;found++;if(!data.lines[k])data.lines[k]=[g,v[i]];
  /* a speech spread over several script lines (an open 「 closed later) is shown as one: key the whole of it too */
  let whole=s.lines[i];for(let j=i+1;j<s.lines.length&&j<i+8&&!v[j]&&/^[「『]/.test(whole)&&!/[」』]$/.test(whole);j++)whole+=s.lines[j];if(whole!==s.lines[i]){const kw=keyOf(whole);if(kw&&!data.lines[kw])data.lines[kw]=[g,v[i]];}}}
 data.games[g]={dir:path.resolve(dir),engine:id,scanned:Date.now(),lines:total,voiced,found};save(root);return {engine:id,lines:total,voiced,found};}
// A game folder as the player picks it: the game may sit one or two folders down (an unpacked release).
function gameDir(dir,depth=2){const sc=require('./original-engines/scenes.cjs');let id=null;try{id=sc.detect(dir);}catch{}if(id)return {dir,engine:id};if(depth<=0)return null;
 let list=[];try{list=fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isDirectory()&&!/^(?:savedata|save|\.megulit)/i.test(e.name));}catch{}
 for(const e of list){const hit=gameDir(path.join(dir,e.name),depth-1);if(hit)return hit;}return null;}
// Keep a clip recorded while the game ran for this line (runtime source). Never replaces a scanned voice.
function remember(root,text,audio,{game='runtime'}={}){if(typeof audio==='string')audio=Buffer.from(audio,'base64');const k=keyOf(text),t=kind(audio);if(!k||!t)return false;const data=lines(root);if(data.lines[k]&&data.lines[k][1]!=='runtime')return false;
 const file=path.join(cacheDir(root),'runtime',k+t.ext);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,audio);data.lines[k]=[game,'runtime',t.ext];save(root);return true;}
// The voice for a line: {data, mime, source:'scan'|'runtime'} or null. A scanned clip is copied to the cache the first time.
function find(root,text){const k=keyOf(text);if(!k)return null;const hit=lines(root).lines[k];if(!hit)return null;const [g,ref,ext]=hit;
 if(ref==='runtime'){try{const data=fs.readFileSync(path.join(cacheDir(root),'runtime',k+(ext||'.wav')));const t=kind(data);return t?{data,mime:t.mime,source:'runtime'}:null;}catch{return null;}}
 const dir=path.join(cacheDir(root),g);for(const e of ['.ogg','.wav','.mp3','.m4a']){try{const data=fs.readFileSync(path.join(dir,sha1(ref)+e));return {data,mime:kind(data).mime,source:'scan'};}catch{}}
 const game=lines(root).games[g];if(!game)return null;let data;try{data=catalogFor(game.dir).get(ref)?.();}catch{}const t=kind(data);if(!t)return null;
 try{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,sha1(ref)+t.ext),data);}catch{}return {data,mime:t.mime,source:'scan'};}
// Scan a game when it starts (its folder from the executable), once a week at most, off the start-up path.
const running=new Set();
function scanLater(root,executable,delay=8000){if(!executable)return;const start=path.dirname(String(executable)),k=gameKey(start);if(running.has(k))return;const seen=Object.values(lines(root).games).find(g=>g.from===k);if(seen&&Date.now()-seen.scanned<7*864e5)return;running.add(k);
 const t=setTimeout(()=>{try{const g=gameDir(start,1);if(g){scan(root,g.dir,{engine:g.engine});const e=lines(root).games[gameKey(g.dir)];if(e){e.from=k;save(root);}}}catch{}finally{running.delete(k);}},delay);t.unref?.();}
const has=(root,text)=>{const k=keyOf(text);return !!(k&&lines(root).lines[k]);};
module.exports={scanLater,norm,keyOf,kind,catalog,arcList,ovkList,scan,gameDir,remember,find,has,gameKey,_reset(){memo=null;catalogs.clear();}};
