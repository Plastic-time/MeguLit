// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const engine=require('./original-engines/utage-embedded.cjs');
const ADAPTER='utage-embedded',BACKUP='.megulit-japanese',MAX_FILE=128<<20;
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const folder=dir=>path.join(dir,BACKUP),manifestFile=dir=>path.join(folder(dir),'manifest.json');
const key=text=>String(text||'').replace(/[\s　]+/g,'');
function read(file,max=MAX_FILE){if(fs.statSync(file).size>max)throw Error('EMBEDDED_BYTE_BUDGET');return fs.readFileSync(file);}
function atomic(file,bytes){const tmp=file+'.megulit-tmp';try{fs.writeFileSync(tmp,bytes);fs.renameSync(tmp,file);}catch(error){try{fs.rmSync(tmp,{force:true});}catch{}throw error;}}
function manifest(dir){try{const m=JSON.parse(read(manifestFile(dir),1<<20));return m?.adapter===ADAPTER?m:null;}catch{return null;}}
function target(dir,relative){
 if(typeof relative!=='string'||path.isAbsolute(relative))throw Error('EMBEDDED_MANIFEST_PATH');
 const file=path.resolve(dir,relative),prefix=path.resolve(dir)+path.sep;
 if(!file.toLowerCase().startsWith(prefix.toLowerCase()))throw Error('EMBEDDED_MANIFEST_PATH');
 let current=file;while(current.toLowerCase()!==path.resolve(dir).toLowerCase()){if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw Error('EMBEDDED_SYMLINK');current=path.dirname(current);}
 return file;
}
function valid(dir,m){
 try{return snapshotValid(dir,m)&&m.sources.every(s=>sha(read(target(dir,s.file)))===s.sha256)&&sha(read(path.join(folder(dir),'embedded-pairs.json'),16<<20))===m.indexSha256;}catch{return false;}
}
function snapshot(file){const s=fs.statSync(file);return {bytes:s.size,mtimeMs:s.mtimeMs,ctimeMs:s.ctimeMs,ino:s.ino};}
function sameSnapshot(a,b){return a?.bytes===b?.bytes&&a?.mtimeMs===b?.mtimeMs&&a?.ctimeMs===b?.ctimeMs&&a?.ino===b?.ino;}
function dataRoots(dir){return fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isDirectory()&&/_Data$/i.test(e.name)).map(e=>e.name).sort().join('|');}
function watchSnapshot(dir,m){return [dataRoots(dir),...(m.watch?.directories||[]).map(d=>[d.file,snapshot(target(dir,d.file))])];}
function snapshotValid(dir,m){
 try{return m?.phase==='applied'&&m.sources.length<=128&&m.sources.every(source=>sameSnapshot(source.snapshot,snapshot(target(dir,source.file))))&&sameSnapshot(m.indexSnapshot,snapshot(path.join(folder(dir),'embedded-pairs.json')))&&m.watch?.dataRoots===dataRoots(dir)&&m.watch.directories.every(d=>sameSnapshot(d.snapshot,snapshot(target(dir,d.file))));}catch{return false;}
}
function coverage(plan){
 const rows=plan.pairs,byText=new Map();for(const row of rows){const k=key(row.japanese);if(!byText.has(k))byText.set(k,new Set());byText.get(k).add(row.chinese);}
 return {tables:plan.tables,rows:rows.length,japaneseLines:rows.length,kanaLines:rows.filter(r=>/[ぁ-ゖァ-ヺ]/.test(r.japanese)).length,localTranslations:rows.filter(r=>r.chinese).length,missingTranslations:rows.filter(r=>!r.chinese).length,voicedLines:rows.filter(r=>r.voice).length,ambiguousJapaneseKeys:[...byText.values()].filter(values=>values.size>1).length};
}
function summary(plan){const counts=coverage(plan);return {state:'restorable',adapter:ADAPTER,scanToken:plan.token,canRestore:plan.writes.length>0,sources:plan.sources,coverage:counts,warnings:counts.missingTranslations?['MISSING_LOCAL_TRANSLATIONS']:[],readBytes:plan.readBytes};}
function scan(dir,options={}){
 dir=path.resolve(dir);const m=manifest(dir);
 if(m){const ok=valid(dir,m);return {state:ok?'applied':'stale',adapter:ADAPTER,scanToken:m.scanToken,canRestore:false,sources:m.sources.map(s=>({path:target(dir,s.file),bytes:s.bytes,sha256:s.sha256})),coverage:m.coverage,warnings:ok?[]:['SOURCE_CHANGED']};}
 if(fs.existsSync(folder(dir)))return {state:'unsupported',adapter:ADAPTER,canRestore:false,scanToken:'',sources:[],coverage:{tables:0,rows:0,japaneseLines:0,localTranslations:0,missingTranslations:0},warnings:['EMBEDDED_CONFLICT']};
 try{return summary(engine.plan(dir,options));}catch(error){return {state:'unsupported',adapter:ADAPTER,canRestore:false,scanToken:'',sources:[],coverage:{tables:0,rows:0,japaneseLines:0,kanaLines:0,localTranslations:0,missingTranslations:0,voicedLines:0},warnings:[String(error.message||error)]};}
}
function io(){const j=require('../core/japanese-restore.cjs')._internal;return {running:j.gameRunning,atomic:j.writeAtomic};}
function apply(dir,{scanToken,progress=()=>{},_io=io()}={}){
 dir=path.resolve(dir);if(_io.running(dir))throw Error('GAME_RUNNING');
 const prior=manifest(dir);
 if(prior){if(prior.scanToken===scanToken&&valid(dir,prior))return {applied:0,already:true,patch:true,localIndex:true,coverage:prior.coverage};throw Error('EMBEDDED_CONFLICT');}
 if(fs.existsSync(folder(dir)))throw Error('EMBEDDED_CONFLICT');
 const plan=engine.plan(dir,{progress});if(!scanToken||plan.token!==scanToken)throw Error('SCAN_STALE');
 if(!plan.writes.length)throw Error('NOTHING_TO_RESTORE');
 if(_io.running(dir))throw Error('GAME_RUNNING');
 const lock=path.join(dir,'.megulit-embedded-lock');fs.mkdirSync(lock);
 const written=[];let saved=false;
 try{
  fs.mkdirSync(folder(dir));
  const pairs=plan.pairs.map(({id,book,sheet,rowIndex,speaker,voice,japanese,chinese,choice})=>({id:book+':'+id,book,sheet,rowIndex,speaker,voice,japanese,chinese,choice}));
  const ids=new Set(pairs.map(pair=>pair.id));if(ids.size!==pairs.length)throw Error('EMBEDDED_DUPLICATE_ROW_ID');
  const index=Buffer.from(JSON.stringify({schema:1,adapter:ADAPTER,scanToken,pairs}));
  if(index.length>16<<20)throw Error('EMBEDDED_INDEX_BUDGET');
  const files=plan.writes.map((write,i)=>({file:path.relative(dir,write.file),backup:'embedded-'+i+'.bak',originalSha256:write.originalSha256,patchedSha256:write.patchedSha256}));
  const changed=new Map(plan.writes.map(w=>[w.file,w]));
  const sources=plan.sources.map(s=>({file:path.relative(dir,s.path),bytes:changed.get(s.path)?.next.length||s.bytes,sha256:changed.get(s.path)?.patchedSha256||s.sha256}));
  const m={version:1,adapter:ADAPTER,phase:'prepared',at:new Date().toISOString(),scanToken,coverage:coverage(plan),indexSha256:sha(index),sources,files};
  for(let i=0;i<files.length;i++){_io.atomic(path.join(folder(dir),files[i].backup),plan.writes[i].original);if(sha(read(path.join(folder(dir),files[i].backup)))!==files[i].originalSha256)throw Error('EMBEDDED_BACKUP_VERIFY');}
  _io.atomic(path.join(folder(dir),'embedded-pairs.json'),index);
  _io.atomic(manifestFile(dir),Buffer.from(JSON.stringify(m)));saved=true;
  for(const write of plan.writes){
   progress({phase:'writing',file:write.file,cancellable:false});
   if(_io.running(dir))throw Error('GAME_RUNNING');
   if(sha(read(write.file))!==write.originalSha256)throw Error('SCAN_STALE');
   _io.atomic(write.file,write.next);written.push(write);
   if(sha(read(write.file))!==write.patchedSha256)throw Error('EMBEDDED_WRITE_VERIFY');
  }
  for(const source of m.sources){const file=target(dir,source.file),before=snapshot(file);if(sha(read(file))!==source.sha256||!sameSnapshot(before,snapshot(file)))throw Error('SCAN_STALE');source.snapshot=before;}
  m.indexSnapshot=snapshot(path.join(folder(dir),'embedded-pairs.json'));
  m.watch={dataRoots:dataRoots(dir),directories:plan.directories.filter(d=>path.resolve(d)!==dir).map(d=>({file:path.relative(dir,d),snapshot:snapshot(d)}))};
  m.phase='applied';_io.atomic(manifestFile(dir),Buffer.from(JSON.stringify(m)));
  return {applied:plan.writes.length,cells:plan.pairs.length,patch:true,localIndex:true,coverage:m.coverage};
 }catch(error){
  let clean=true;
  for(const write of written.reverse())try{if(sha(read(write.file))!==write.patchedSha256){clean=false;continue;}_io.atomic(write.file,write.original);}catch{clean=false;}
  if(clean)fs.rmSync(folder(dir),{recursive:true,force:true});
  else if(!saved)error.message='EMBEDDED_ROLLBACK_INCOMPLETE';
  if(!clean)error.rollbackIncomplete=true;
  throw error;
 }finally{fs.rmdirSync(lock);}
}
function undo(dir,{_io=io()}={}){
 dir=path.resolve(dir);if(_io.running(dir))throw Error('GAME_RUNNING');const m=manifest(dir);if(!m)throw Error('NOT_APPLIED');
 const lock=path.join(dir,'.megulit-embedded-lock');fs.mkdirSync(lock);const skipped=[];let restored=0;
 try{
  for(const entry of m.files){
   const file=target(dir,entry.file);if(!/^embedded-\d+\.bak$/.test(entry.backup))throw Error('EMBEDDED_MANIFEST_PATH');
   const backup=path.join(folder(dir),entry.backup),original=read(backup);
   if(sha(original)!==entry.originalSha256){skipped.push(entry.file);continue;}
   const current=sha(read(file));if(current===entry.originalSha256){restored++;continue;}
   if(current!==entry.patchedSha256){skipped.push(entry.file);continue;}
   if(_io.running(dir))throw Error('GAME_RUNNING');_io.atomic(file,original);restored++;
  }
  if(!skipped.length)fs.rmSync(folder(dir),{recursive:true,force:true});
  return {restored,skipped};
 }finally{fs.rmdirSync(lock);}
}
function stamp(dir){
 const m=manifest(dir);if(!m)return '';
 try{return sha(Buffer.from(JSON.stringify([m.indexSha256,...m.sources.map(s=>[s.file,snapshot(target(dir,s.file))]),watchSnapshot(dir,m),snapshot(path.join(folder(dir),'embedded-pairs.json')),snapshot(manifestFile(dir))])));}catch{return 'stale';}
}
function provider(dir){
 dir=path.resolve(dir);const m=manifest(dir);if(!m||!snapshotValid(dir,m))return null;
 const bytes=read(path.join(folder(dir),'embedded-pairs.json'),16<<20);if(sha(bytes)!==m.indexSha256)return null;
 const index=JSON.parse(bytes);if(index.schema!==1||index.scanToken!==m.scanToken||!Array.isArray(index.pairs))return null;
 const pairs=index.pairs,byText=new Map();let position=-1;const initial=stamp(dir);
 pairs.forEach((pair,i)=>{const k=key(pair.japanese);if(!byText.has(k))byText.set(k,[]);byText.get(k).push(i);});
 const contextual=candidates=>{
  if(position<0)return undefined;
  if(candidates.includes(position)&&!candidates.includes(position+1)&&!candidates.includes(position-1))return position;
  if(candidates.includes(position+1)&&!candidates.includes(position+2))return position+1;
  return undefined;
 };
 return {kind:'patch',embedded:true,position:()=>position,save:()=>position,load:value=>{position=Number.isSafeInteger(value)?value:-1;},cacheKey(text){
  if(stamp(dir)!==initial)return '';
  const k=key(text),candidates=byText.get(k)||[];if(!candidates.length)return '';
  if(new Set(candidates.map(i=>pairs[i].chinese)).size===1)return m.indexSha256+'|text|'+k;
  const at=contextual(candidates);return at===undefined?'':m.indexSha256+'|row|'+pairs[at].id;
 },resolve(text){
  if(stamp(dir)!==initial)return {status:'none',method:'source-changed'};
  const candidates=byText.get(key(text))||[];if(!candidates.length)return {status:'none',method:'not-found'};
  const translations=new Set(candidates.map(i=>pairs[i].chinese));let at;
  if(translations.size===1)at=candidates.length===1?candidates[0]:contextual(candidates)??candidates[0];
  else at=contextual(candidates);
  if(at===undefined)return {status:'none',method:'ambiguous'};
  const shared=translations.size===1&&candidates.length>1&&contextual(candidates)===undefined;
  if(!shared)position=at;const pair=pairs[at];if(!pair.chinese)return {status:'none',method:'untranslated',indices:[at],rowId:pair.id};
  return {status:'exact',method:shared?'same-text':translations.size===1?'unique':'position',indices:[at],translation:pair.chinese,rowId:pair.id,speaker:pair.speaker,source:'embedded-local'};
 }};
}
module.exports={scan,apply,undo,provider,stamp,manifest,ADAPTER,_internal:{atomic,valid,snapshotValid,target,summary,coverage,key}};
