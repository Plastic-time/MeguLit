// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {exportBackup,previewBackup}=require('../services/backup.cjs');

test('failed exports preserve the previous backup and remove their partial output',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-export-error-')),out=path.join(root,'out');
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(out);const destination=path.join(out,'copy.megulitbak'),other=destination+'.other.tmp';
 fs.writeFileSync(destination,'previous');fs.writeFileSync(other,'unrelated');
 for(const stage of ['writeFileSync','renameSync']){
  const original=fs[stage],mock=t.mock.method(fs,stage,(file,...args)=>{
   if(typeof file==='string'&&file.startsWith(destination+'.')){
    if(stage==='writeFileSync')original(file,'partial');
    throw Error('export blocked');
   }
   return original(file,...args);
  });
  try{await assert.rejects(exportBackup(root,destination),/export blocked/);}finally{mock.mock.restore();}
  assert.equal(fs.readFileSync(destination,'utf8'),'previous');
  assert.deepEqual(fs.readdirSync(out).sort(),[path.basename(destination),path.basename(other)].sort());
 }
});

test('the export result follows the saved backup even when staging cleanup fails',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-export-cleanup-')),destination=path.join(root,'copy.megulitbak');
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const remove=fs.rmSync,mock=t.mock.method(fs,'rmSync',(file,options)=>{
  if(path.basename(file).startsWith('backup-export-'))throw Object.assign(Error('locked staging'),{code:'EBUSY'});
  return remove(file,options);
 });
 try{const result=await exportBackup(root,destination);assert.equal(result.bytes,fs.statSync(destination).size);}
 finally{mock.mock.restore();}
 assert.equal(previewBackup(root,destination).counts.words,0);
});
