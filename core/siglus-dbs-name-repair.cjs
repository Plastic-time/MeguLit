'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const safeName=n=>typeof n==='string'&&/^[^\\/:]+\.dbs$/i.test(n);
const blocked=why=>Object.assign(Error('JAPANESE_REPAIR_BLOCKED'),{detail:String(why).slice(0,240)});
function durableWrite(I,file,bytes){I.writeAtomic(file,bytes);const fd=fs.openSync(file,'r+');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function plainDirectory(dir){if(fs.lstatSync(dir).isSymbolicLink())throw blocked('repair directory is a link');}
function repairCells(current,original,column,I){
 const a=I.decrypt(current),b=I.decrypt(original),now=I.parse(a.raw,a.marker),old=I.parse(b.raw,b.marker);
 if(a.marker!==b.marker||now.rows!==old.rows||now.cols!==old.cols||now.columns.some((c,i)=>c.id!==old.columns[i].id||c.type!==old.columns[i].type))throw blocked('table schema changed');
 const ids=old.columns.map((c,i)=>c.id===column&&c.type===0x53?i:-1).filter(i=>i>=0);
 if(!ids.length)return null;if(ids.length!==1)throw blocked('ambiguous name column');
 const col=ids[0],jp=I.languageColumns(old).filter(c=>c.filled).sort((a,b)=>b.kana-a.kana)[0];
 if(!jp||jp.kana<.3||jp.index===col)throw blocked('original Japanese column unproven');
 const cells=now.cells.map(row=>row.slice());let count=0;
 for(let r=0;r<old.rows;r++){
  for(let c=0;c<old.cols;c++)if(old.columns[c].type!==0x53&&old.cells[r][c]!==now.cells[r][c])throw blocked('numeric field changed');
  if(now.cells[r][col]===old.cells[r][col])continue;
  const expected=old.cells[r][jp.index]?I.shownJapanese(old.cells[r][jp.index],old.cells[r][col]):old.cells[r][col];
  if(now.cells[r][col]!==expected)throw blocked('name field was not the prior Japanese copy');
  cells[r][col]=old.cells[r][col];count++;
 }
 if(!count)return null;
 const raw=I.rebuild(a.raw,a.marker,now,cells),encoded=I.encrypt(a.marker,raw),round=I.decrypt(encoded),check=I.parse(round.raw,round.marker);
 if(round.marker!==a.marker||!round.raw.equals(raw)||JSON.stringify(check.cells)!==JSON.stringify(cells))throw blocked('name repair roundtrip failed');
 const changed=cells.reduce((n,row,r)=>n+row.filter((v,c)=>v!==old.cells[r][c]).length,0);
 return {encoded,count,changed};
}
function context(gameDir){const backup=path.join(gameDir,'.megulit-japanese');return {backup,dat:path.join(gameDir,'dat'),manifest:path.join(backup,'manifest.json'),journal:path.join(backup,'name-column-transaction.json')};}
function loadJournal(C){
 const bytes=fs.readFileSync(C.journal),j=JSON.parse(bytes);
 if(j.version!==1||!/^name-column-[A-Za-z0-9]{6}$/.test(j.stage)||!Number.isSafeInteger(j.column)||j.column<0||j.column>0x7fffffff||!Array.isArray(j.files)||!j.files.length)throw blocked('invalid repair journal');
 const keys=new Set(),images=new Set();for(const e of j.files){if(!safeName(e.file)||keys.has(e.file.toLowerCase())||images.has(e.image)||!/^\d+\.before$/.test(e.image)||!/^[0-9a-f]{64}$/.test(e.before)||!/^[0-9a-f]{64}$/.test(e.after))throw blocked('invalid repair entry');keys.add(e.file.toLowerCase());images.add(e.image);}
 if(!/^[0-9a-f]{64}$/.test(j.manifestBefore)||!/^[0-9a-f]{64}$/.test(j.manifestAfter))throw blocked('invalid manifest identity');
 const stage=path.join(C.backup,j.stage);plainDirectory(C.backup);plainDirectory(C.dat);plainDirectory(stage);return {j,hash:sha(bytes),stage};
}
function cleanup(C,T){
 for(const e of T.j.files){const f=path.join(T.stage,e.image);if(fs.existsSync(f)){if(sha(fs.readFileSync(f))!==e.before)throw blocked('before image changed');fs.unlinkSync(f);}}
 const m=path.join(T.stage,'manifest.before');if(fs.existsSync(m)){if(sha(fs.readFileSync(m))!==T.j.manifestBefore)throw blocked('manifest before image changed');fs.unlinkSync(m);}
 if(sha(fs.readFileSync(C.journal))!==T.hash)throw blocked('repair journal changed');
 fs.unlinkSync(C.journal);try{fs.rmdirSync(T.stage);}catch{} // Preserve any unrelated file placed in the staging folder.
}
function recover(C,column,I){
 if(!fs.existsSync(C.journal))return null;
 const T=loadJournal(C);if(column!==T.j.column)throw blocked('version capability does not match pending repair');
 if(I.gameRunning(path.dirname(C.dat)))throw blocked('game running during repair');
 const mh=sha(fs.readFileSync(C.manifest));if(mh!==T.j.manifestBefore&&mh!==T.j.manifestAfter)throw blocked('manifest changed outside repair');
 const states=T.j.files.map(e=>{const target=path.join(C.dat,e.file),actual=sha(fs.readFileSync(target));if(actual!==e.before&&actual!==e.after)throw blocked('game table changed outside repair');return {e,target,actual};});
 if(mh===T.j.manifestAfter&&states.every(s=>s.actual===s.e.after)){cleanup(C,T);return 'committed';}
 if(mh===T.j.manifestBefore&&states.every(s=>s.actual===s.e.before)){cleanup(C,T);return 'rolled-back';}
 const beforeManifest=fs.readFileSync(path.join(T.stage,'manifest.before'));if(sha(beforeManifest)!==T.j.manifestBefore)throw blocked('manifest recovery image missing or changed');
 const pending=states.filter(s=>s.actual!==s.e.before).map(s=>{const before=fs.readFileSync(path.join(T.stage,s.e.image));if(sha(before)!==s.e.before)throw blocked('table recovery image missing or changed');return {...s,before};});
 for(const s of pending){if(I.gameRunning(path.dirname(C.dat)))throw blocked('game started during recovery');if(sha(fs.readFileSync(s.target))!==s.e.after)throw blocked('table changed during recovery');durableWrite(I,s.target,s.before);}
 if(I.gameRunning(path.dirname(C.dat)))throw blocked('game started during recovery');if(sha(fs.readFileSync(C.manifest))!==mh)throw blocked('manifest changed during recovery');durableWrite(I,C.manifest,beforeManifest);
 cleanup(C,T);return 'rolled-back';
}
function repair(gameDir,column,I){
 const C=context(gameDir);let recovered;
 try{
  if(column!==null&&(!Number.isSafeInteger(column)||column<0||column>0x7fffffff))throw blocked('invalid version column capability');
  recovered=recover(C,column,I);if(recovered==='committed')return {repaired:true,recovered,applied:0};
  if(column===null)return {repaired:false};
  const manifestBytes=fs.readFileSync(C.manifest),manifest=JSON.parse(manifestBytes);
  if(manifest.adapter!=='siglus-dbs'||!Array.isArray(manifest.files))return {repaired:false};
  plainDirectory(C.backup);plainDirectory(C.dat);plainDirectory(path.join(C.backup,'dat'));
  if(manifest.nameColumnRepaired===column)return {repaired:false,...(recovered?{recovered}:{})};
  if(fs.readdirSync(C.backup,{withFileTypes:true}).some(e=>e.isDirectory()&&/^name-column-[A-Za-z0-9]{6}$/.test(e.name)))throw blocked('unfinished repair staging without journal');
  const built=[],skipped=[],names=new Set();
  for(const e of manifest.files){
   if(!safeName(e.file)||names.has(e.file.toLowerCase()))throw blocked('unsafe or repeated manifest file');names.add(e.file.toLowerCase());
   const target=path.join(C.dat,e.file);let before;try{before=fs.readFileSync(target);}catch{skipped.push(e.file);continue;}
   if(sha(before)!==e.patchedSha256){skipped.push(e.file);continue;}
   const d=I.decrypt(before),t=I.parse(d.raw,d.marker);if(!t.columns.some(c=>c.id===column&&c.type===0x53))continue;
   const original=fs.readFileSync(path.join(C.backup,'dat',e.file));if(sha(original)!==e.originalSha256)throw blocked('original backup identity mismatch');
   const p=repairCells(before,original,column,I);if(p)built.push({file:e.file,target,before,beforeHash:sha(before),after:p.encoded,afterHash:sha(p.encoded),originalHash:e.originalSha256,count:p.count,changed:p.changed});
  }
  if(!built.length)return {repaired:false,...(skipped.length?{skipped}:{}),...(recovered?{recovered}:{})};
  if(I.gameRunning(gameDir))throw blocked('game running during repair');
  const next={...manifest,nameColumnRepaired:column,files:manifest.files.map(e=>{const b=built.find(b=>b.file===e.file);return b?{...e,patchedSha256:b.afterHash,changed:b.changed}:e;})};
  const nextBytes=Buffer.from(JSON.stringify(next,null,1)),stage=fs.mkdtempSync(path.join(C.backup,'name-column-'));
  durableWrite(I,path.join(stage,'manifest.before'),manifestBytes);
  const files=built.map((b,i)=>{const image=i+'.before';durableWrite(I,path.join(stage,image),b.before);return {file:b.file,image,before:b.beforeHash,after:b.afterHash};});
  const journal={version:1,column,stage:path.basename(stage),manifestBefore:sha(manifestBytes),manifestAfter:sha(nextBytes),files};
  durableWrite(I,C.journal,Buffer.from(JSON.stringify(journal,null,1)));
  try{
   for(const b of built){
    if(I.gameRunning(gameDir))throw blocked('game started during repair');
    if(sha(fs.readFileSync(b.target))!==b.beforeHash||sha(fs.readFileSync(path.join(C.backup,'dat',b.file)))!==b.originalHash)throw blocked('game table or backup changed during repair');
    durableWrite(I,b.target,b.after);
   }
   if(sha(fs.readFileSync(C.manifest))!==sha(manifestBytes))throw blocked('manifest changed during repair');
   if(I.gameRunning(gameDir))throw blocked('game started before repair commit');durableWrite(I,C.manifest,nextBytes);cleanup(C,loadJournal(C));
  }catch(error){try{recover(C,column,I);}catch{}throw blocked(error.detail||error.message);}
  return {repaired:true,applied:built.length,cells:built.reduce((n,b)=>n+b.count,0),...(skipped.length?{skipped}:{}),...(recovered?{recovered}:{})};
 }catch(error){if(error.code==='ENOENT'&&!fs.existsSync(C.journal)&&!fs.existsSync(C.manifest))return {repaired:false};if(error.message==='JAPANESE_REPAIR_BLOCKED')throw error;throw blocked(error.message);}
}
module.exports={repair,repairCells,_internal:{context,loadJournal,recover}};
