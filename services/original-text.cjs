// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Japanese original text for translated (Chinese-patched) games, without touching game files.
// Supported now: AliceSoft System4 AIN v4+ in the uncompressed "AI2" zlib container (verified on
// Rance01 光をもとめて, AIN v6). Each line of the message table (MSG0) has a stable index that the
// script code refers to, so a patched build that keeps the table layout maps line i to original line i.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const SCHEMA=1,KANA=/[ぁ-ゖァ-ヺ]/g,HAN=/[一-鿿]/g;
const sha256=file=>{const hash=crypto.createHash('sha256'),fd=fs.openSync(file,'r'),buf=Buffer.alloc(1<<20);try{let n;while((n=fs.readSync(fd,buf,0,buf.length,null))>0)hash.update(buf.subarray(0,n));}finally{fs.closeSync(fd);}return hash.digest('hex');};
const norm=s=>String(s||'').replace(/[\s　]+/g,'');
const japaneseLine=t=>{const k=(t.match(KANA)||[]).length,h=(t.match(HAN)||[]).length;return k>=2&&k>=h*.2;};

// ---- System4 AIN -----------------------------------------------------------------------------
function inflateAin(file){const b=fs.readFileSync(file);if(b.subarray(0,4).toString('latin1')!=='AI2\0')throw Error('UNSUPPORTED_AIN_CONTAINER');const size=b.readUInt32LE(8),packed=b.readUInt32LE(12),d=zlib.inflateSync(b.subarray(16,16+packed));if(d.length!==size)throw Error('AIN_SIZE_MISMATCH');return d;}
function strings(d,tag){const at=d.indexOf(tag);if(at<0)return null;let p=at+4;const n=d.readUInt32LE(p);p+=4;const out=[];for(let i=0;i<n;i++){const e=d.indexOf(0,p);if(e<0)throw Error('AIN_TRUNCATED_'+tag);out.push(d.subarray(p,e));p=e+1;}return out;}
// One code page per file: a Chinese patch stores everything (its leftover Japanese too) as GBK, an original as Shift-JIS.
function codepage(buffers){const sample=buffers.filter(b=>b.length>3).slice(0,4000),score=enc=>{const dec=new TextDecoder(enc);let bad=0,kana=0;for(const b of sample){const t=dec.decode(b);bad+=(t.match(/�/g)||[]).length;kana+=(t.match(KANA)||[]).length;}return {enc,bad,kana};};const [sj,gbk]=[score('shift_jis'),score('gbk')];return sj.bad<gbk.bad||sj.bad===gbk.bad&&sj.kana>=gbk.kana?'shift_jis':'gbk';}
function msg1(d){const at=d.indexOf('MSG1');if(at<0)return null;let p=at+4;const n=d.readUInt32LE(p);p+=8;const out=[];for(let i=0;i<n;i++){const len=d.readUInt32LE(p);p+=4;if(p+len>d.length)throw Error('AIN_TRUNCATED_MSG1');const b=Buffer.from(d.subarray(p,p+len));for(let k=0;k<len;k++)b[k]=(b[k]-k-0x60)&255;out.push(b);p+=len;}return out;}
function readAin(file){
 const d=inflateAin(file),version=d.subarray(0,4).toString('latin1')==='VERS'?d.readUInt32LE(4):0,raw=strings(d,'MSG0')||msg1(d);if(!raw)throw Error('AIN_MESSAGES_MISSING');
 const enc=codepage(raw),dec=new TextDecoder(enc),lines=raw.map(b=>dec.decode(b)),names=(strings(d,'FNAM')||[]).map(b=>b.toString('latin1'));
 return {engine:'system4',version,codepage:enc,lines,structure:{messages:lines.length,functions:names.length,functionHash:crypto.createHash('sha256').update(names.join('\0')).digest('hex').slice(0,16)}};
}
// ---- Paths and state --------------------------------------------------------------------------
const stateFile=root=>path.join(root,'data/config/original-text.json');
const indexDir=(root,id)=>path.join(root,'data/original-text',crypto.createHash('sha256').update(String(id)).digest('hex').slice(0,16));
function readState(root){try{return JSON.parse(fs.readFileSync(stateFile(root),'utf8'))||{};}catch{return {};}}
function writeState(root,id,patch){const all=readState(root);all[id]={...all[id],...patch,updatedAt:Date.now()};fs.mkdirSync(path.dirname(stateFile(root)),{recursive:true});fs.writeFileSync(stateFile(root)+'.tmp',JSON.stringify(all,null,1));fs.renameSync(stateFile(root)+'.tmp',stateFile(root));return all[id];}
function writeIndex(root,id,name,value){const dir=indexDir(root,id);fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,name);fs.writeFileSync(file+'.tmp',JSON.stringify(value));fs.renameSync(file+'.tmp',file);return file;}
function readIndex(file){const value=JSON.parse(fs.readFileSync(file,'utf8'));if(value.schema!==SCHEMA)throw Error('ORIGINAL_INDEX_SCHEMA');return value;}
function ainOf(dir,base){const files=fs.readdirSync(dir).filter(f=>/\.ain$/i.test(f)&&!/beifen|backup|\.bak/i.test(f));const preferred=files.find(f=>path.parse(f).name.toLowerCase()===String(base||'').toLowerCase());return preferred?path.join(dir,preferred):files.length===1?path.join(dir,files[0]):'';}
const bgi=require('./original-engines/bgi.cjs');
const ADAPTERS={
 system4:{marker:base=>base+'.ain',locate:(dir,base)=>{const file=ainOf(dir,base);return file?{engine:'system4',target:file}:null;},read:target=>readAin(target),fingerprint:target=>sha256(target)},
 bgi:{marker:()=>'sysprg.arc',locate:dir=>{try{const arcs=fs.readdirSync(dir).filter(f=>/^data0\d{4}\.arc$/i.test(f));if(!arcs.length)return null;const head=Buffer.alloc(12),fd=fs.openSync(path.join(dir,arcs[0]),'r');try{fs.readSync(fd,head,0,12,0);}finally{fs.closeSync(fd);}return head.toString('latin1')==='BURIKO ARC20'?{engine:'bgi',target:dir}:null;}catch{return null;}},
  read:dir=>{const scenes=bgi.scan(dir),lines=scenes.flatMap(x=>x.lines);return {engine:'bgi',version:0,codepage:'shift_jis',lines,structure:{messages:lines.length,functions:scenes.length,functionHash:crypto.createHash('sha256').update(scenes.map(x=>x.name+':'+x.lines.length).join('\n')).digest('hex').slice(0,16)}};},
  fingerprint:dir=>crypto.createHash('sha256').update(fs.readdirSync(dir).filter(f=>/^data0\d{4}\.arc$/i.test(f)).sort().map(f=>{const st=fs.statSync(path.join(dir,f));return f+'|'+st.size+'|'+st.mtimeMs;}).join('\n')).digest('hex')}};
function locate(dir,base){for(const adapter of Object.values(ADAPTERS)){const found=adapter.locate(dir,base);if(found)return found;}return null;}
const readScript=loc=>ADAPTERS[loc.engine].read(loc.target),fingerprint=loc=>ADAPTERS[loc.engine].fingerprint(loc.target);
function gameRow(db,id){const row=db.prepare('SELECT * FROM games WHERE id=? AND removed_at IS NULL').get(String(id));if(!row)throw Error('GAME_NOT_FOUND');return row;}

// ---- Running build: what the installed (patched) game still contains ---------------------------
function scanRunning(root,id,executable){
 const dir=path.dirname(executable),loc=locate(dir,path.parse(executable).name);if(!loc)return writeState(root,id,{status:'unsupported',error:'NO_SUPPORTED_SCRIPT',runtime:null});const file=loc.target;
 const hash=fingerprint(loc),current=readState(root)[id];if(current?.runtime?.sha256===hash&&current.runtime.index&&fs.existsSync(current.runtime.index))return current;
 const ain=readScript(loc),japanese=ain.lines.filter(t=>t.trim()&&japaneseLine(t)).length,nonEmpty=ain.lines.filter(t=>t.trim()).length;
 const index=writeIndex(root,id,'runtime-'+hash.slice(0,16)+'.json',{schema:SCHEMA,role:'runtime',engine:ain.engine,version:ain.version,codepage:ain.codepage,source:{file,sha256:hash},structure:ain.structure,lines:ain.lines});
 const original=current?.original;const runtime={file,engine:loc.engine,sha256:hash,index,codepage:ain.codepage,version:ain.version,structure:ain.structure,lines:nonEmpty,japaneseLines:japanese};
 // A changed game build invalidates the earlier alignment; the original index itself stays.
 return writeState(root,id,{engine:loc.engine,runtime,status:japanese>=nonEmpty*.5?'native-japanese':original?.index&&current?.runtime?.sha256===hash?current.status:original?.index?'needs-recheck':'awaiting-original'});
}
// ---- Original import and alignment -------------------------------------------------------------
function align(runtime,original){
 const sameStructure=runtime.structure.messages===original.structure.messages&&runtime.structure.functionHash===original.structure.functionHash;
 let kept=0,equal=0;const n=Math.min(runtime.lines.length,original.lines.length);
 // Lines the patch left in Japanese must equal the original at the same index; this measures the layout empirically.
 for(let i=0;i<n;i++){const t=runtime.lines[i];if(!t.trim()||!japaneseLine(t))continue;kept++;if(norm(t)===norm(original.lines[i]))equal++;}
 const rate=kept?equal/kept:null,reliable=sameStructure&&(rate===null||rate>=.98);
 return {sameStructure,keptJapanese:kept,keptEqual:equal,keptRate:rate,reliable};
}
function importOriginal(root,db,id,dir){
 const row=gameRow(db,id);if(typeof dir!=='string'||!path.isAbsolute(dir)||!fs.statSync(dir,{throwIfNoEntry:false})?.isDirectory())throw Error('INVALID_ORIGINAL_DIRECTORY');
 if(path.resolve(dir).toLowerCase()===path.dirname(row.executable).toLowerCase())throw Error('ORIGINAL_IS_RUNNING_COPY');
 writeState(root,id,{status:'scanning',error:''});
 try{
  const state=scanRunning(root,id,row.executable);if(!state.runtime)throw Error(state.error||'NO_SUPPORTED_SCRIPT');
  const loc=locate(dir,path.parse(state.runtime.file).name);if(!loc||loc.engine!==(state.runtime.engine||'system4'))throw Error('ORIGINAL_SCRIPT_NOT_FOUND');const file=loc.target;
  const hash=fingerprint(loc);if(hash===state.runtime.sha256)throw Error('ORIGINAL_SAME_AS_RUNNING');
  const ain=readScript(loc),runtime=readIndex(state.runtime.index),japanese=ain.lines.filter(t=>t.trim()&&japaneseLine(t)).length;
  // Never accept a translated file as the original: most of its lines must be Japanese.
  if(japanese<ain.lines.filter(t=>t.trim()).length*.5)throw Error('ORIGINAL_NOT_JAPANESE');
  const alignment=align(runtime,{...ain,structure:ain.structure});
  const index=writeIndex(root,id,'original-'+hash.slice(0,16)+'.json',{schema:SCHEMA,role:'original',engine:ain.engine,version:ain.version,codepage:ain.codepage,source:{file,sha256:hash,dir},structure:ain.structure,lines:ain.lines});
  const exe=fs.readdirSync(dir).find(f=>/\.exe$/i.test(f)&&path.parse(f).name.toLowerCase()===path.parse(row.executable).name.toLowerCase());
  return writeState(root,id,{original:{dir,file,sha256:hash,index,codepage:ain.codepage,lines:ain.lines.length,executable:exe?path.join(dir,exe):''},alignment,status:alignment.reliable?'ready':'unreliable',mode:readState(root)[id]?.mode||(alignment.reliable?'original':'off'),error:''});
 }catch(error){writeState(root,id,{status:'failed',error:String(error.message||error)});throw error;}
}
function status(root,db,id){
 const row=gameRow(db,id),saved=readState(root)[id];let state=saved;
 try{if(!saved?.runtime||!fs.existsSync(saved.runtime.file)||saved.runtime.sha256!==fingerprint({engine:saved.runtime.engine||'system4',target:saved.runtime.file}))state=scanRunning(root,id,row.executable);}catch(error){state={...saved,status:'failed',error:String(error.message||error)};}
 const {index:_a,...runtime}=state?.runtime||{},{index:_b,...original}=state?.original||{};
 return {engine:state?.engine||'',status:state?.status||'unsupported',mode:state?.mode||'off',error:state?.error||'',lastSearch:state?.lastSearch?{at:state.lastSearch.at,found:state.lastSearch.found,searched:state.lastSearch.searched,complete:state.lastSearch.complete}:null,runtime:state?.runtime?runtime:null,original:state?.original?original:null,alignment:state?.alignment||null};
}
function setMode(root,id,mode){if(!['off','original'].includes(mode))throw Error('INVALID_TEXT_MODE');const s=readState(root)[id];if(mode==='original'&&s?.status!=='ready')throw Error('ORIGINAL_NOT_READY');return writeState(root,id,{mode});}

// ---- Matching captured text to original lines --------------------------------------------------
// Captured text is one or more consecutive message lines. Exact cover of the text by consecutive runtime lines is
// required; repeated lines ("はい", "……") are resolved by the reading position, never by content alone.
class Matcher{
 constructor(runtimeLines,originalLines){this.rt=runtimeLines;this.og=originalLines;this.normalized=runtimeLines.map(norm);this.heads=new Map();this.normalized.forEach((t,i)=>{if(!t)return;const k=t.slice(0,4);if(!this.heads.has(k))this.heads.set(k,[]);this.heads.get(k).push(i);});this.last=-1;}
 cover(start,s){let at=0,i=start;const used=[];while(at<s.length&&i<this.normalized.length){const t=this.normalized[i];if(!t){i++;continue;}if(!s.startsWith(t,at))return null;used.push(i);at+=t.length;i++;}return at===s.length?used:null;}
 match(text){
  const s=norm(text);if(!s)return {status:'none',method:'empty'};const starts=new Set();for(let k=Math.min(4,s.length);k>=1;k--)for(const i of this.heads.get(s.slice(0,k))||[])if(s.startsWith(this.normalized[i]))starts.add(i);
  const found=[...starts].map(i=>this.cover(i,s)).filter(Boolean);if(!found.length)return {status:'none',method:'no-cover'};
  let pick,method,status;
  if(found.length===1){pick=found[0];method='unique';status='exact';}
  else{const ahead=found.filter(c=>c[0]>this.last&&c[0]-this.last<=400).sort((a,b)=>a[0]-b[0]);if(this.last>=0&&ahead.length){pick=ahead[0];method='position';status='high';}else return {status:'uncertain',method:'repeated',candidates:found.length};}
  this.last=pick.at(-1);const original=pick.map(i=>this.og[i]??''),already=pick.every(i=>japaneseLine(this.rt[i]));
  if(original.some(t=>!t.trim()))return {status:'uncertain',method:'empty-original',indices:pick};
  return {status,method,indices:pick,japanese:original.join('\n'),captured:text,alreadyJapanese:already};
 }
}
// The provider the hook pipeline consults for one running executable, or null when nothing reliable is set up.
function provider(root,executable){
 const state=Object.values(readState(root)).find(s=>s?.runtime?.file&&path.dirname(s.runtime.file).toLowerCase()===path.dirname(String(executable)).toLowerCase());
 if(!state||state.mode!=='original'||state.status!=='ready'||!state.original?.index)return null;
 try{if(fingerprint({engine:state.runtime.engine||'system4',target:state.runtime.file})!==state.runtime.sha256)return null;const m=new Matcher(readIndex(state.runtime.index).lines,readIndex(state.original.index).lines);return {resolve:text=>m.match(text)};}catch{return null;}
}
// ---- Automatic search for the user's own Japanese copy ------------------------------------------
// Looks on local drives for a script with the same name as the running one (another install, a store library,
// a backup disk), then accepts it only if it is Japanese and lines up with the running build. Nothing is downloaded.
const SKIP=/^(windows|\$recycle\.bin|system volume information|programdata|appdata|node_modules|\.git|msocache|recovery|perflogs|winsxs|drivers?store)$/i;
async function findCandidates(base,exclude,{ext='.ain',roots,deadline,maxDirs=250000}){
 const want=(base+ext).toLowerCase(),found=[];let seen=0;const queue=roots.map(dir=>({dir,depth:0}));
 while(queue.length&&Date.now()<deadline&&seen<maxDirs){const {dir,depth}=queue.shift();seen++;let handle;try{handle=await fs.promises.opendir(dir);}catch{continue;}
  try{for await(const entry of handle){const full=path.join(dir,entry.name);if(entry.isDirectory()){if(depth<6&&!SKIP.test(entry.name)&&!entry.name.startsWith('.'))queue.push({dir:full,depth:depth+1});}else if(entry.isFile()&&entry.name.toLowerCase()===want&&path.resolve(dir).toLowerCase()!==exclude)found.push(full);}}catch{}}
 return {found,complete:!queue.length,searched:seen};
}
function localRoots(){const roots=[];for(const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ'){const root=letter+':\\';try{if(fs.statSync(root).isDirectory())roots.push(root);}catch{}}return roots;}
async function discover(root,db,id,options={}){
 const row=gameRow(db,id),state=scanRunning(root,id,row.executable);if(!state.runtime)throw Error(state.error||'NO_SUPPORTED_SCRIPT');
 const engine=state.runtime.engine||'system4',runningDir=engine==='bgi'?state.runtime.file:path.dirname(state.runtime.file),base=ADAPTERS[engine].marker(path.parse(state.runtime.file).name).replace(/\.[^.]+$/,''),exclude=runningDir.toLowerCase(),runtime=readIndex(state.runtime.index);
 writeState(root,id,{status:'scanning',error:''});
 const search=await findCandidates(base,exclude,{ext:path.extname(ADAPTERS[engine].marker(path.parse(state.runtime.file).name)),roots:options.roots||localRoots(),deadline:Date.now()+(options.timeout||30000)}),checked=[];
 for(const file of search.found){try{const loc=locate(path.dirname(file),path.parse(state.runtime.file).name);if(!loc||loc.engine!==engine){checked.push({file,result:'other-engine'});continue;}const ain=readScript(loc),japanese=ain.lines.filter(t=>t.trim()&&japaneseLine(t)).length;if(japanese<ain.lines.filter(t=>t.trim()).length*.5){checked.push({file,result:'not-japanese'});continue;}const a=align(runtime,ain);checked.push({file,result:a.reliable?'match':'different-version'});if(a.reliable)return {...importOriginal(root,db,id,path.dirname(file)),search:{...search,found:search.found.length,checked}};}catch(error){checked.push({file,result:String(error.message||error)});}}
 const status=state.original?.index?(readState(root)[id]?.status==='scanning'?'ready':readState(root)[id].status):'awaiting-original';
 writeState(root,id,{status:state.original?.index?(state.alignment?.reliable?'ready':'unreliable'):status,lastSearch:{at:Date.now(),found:search.found.length,complete:search.complete,searched:search.searched,checked}});
 return {notFound:true,search:{found:search.found.length,complete:search.complete,searched:search.searched,checked}};
}
module.exports={locate,readScript,ADAPTERS,readAin,align,Matcher,importOriginal,status,setMode,provider,scanRunning,japaneseLine,norm,discover,findCandidates};
