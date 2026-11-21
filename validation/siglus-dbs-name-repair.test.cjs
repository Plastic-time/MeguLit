'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const I=require('../core/japanese-restore.cjs')._internal,R=require('../core/siglus-dbs-name-repair.cjs'),table=require('./helpers/siglus-dbs-table.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const write=(f,b)=>{fs.writeFileSync(f+'.unit-tmp',b);fs.renameSync(f+'.unit-tmp',f);};
const codec={...I,gameRunning:()=>false,writeAtomic:write};
function fixture(run,{column=50}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-siglus-name-repair-')),backup=path.join(root,'.megulit-japanese'),dat=path.join(root,'dat');fs.mkdirSync(path.join(backup,'dat'),{recursive:true});fs.mkdirSync(dat);
 const rows=Array.from({length:12},(_,i)=>[i%4===0?'':i===5?'【＄名前＿人】':'【人物'+i%6+'】','「おはようございます」'+i,'中文台词'+i,i*10]);
 const files=[];for(const file of ['a.dbs','b.dbs']){const original=table(rows,[column,7,8,500]),patched=table(rows.map(r=>[r[1],r[1],r[1],r[3]]),[column,7,8,500]);fs.writeFileSync(path.join(backup,'dat',file),original);fs.writeFileSync(path.join(dat,file),patched);files.push({file,originalSha256:hash(original),patchedSha256:hash(patched),kind:'column',changed:24});}
 const manifest={version:1,adapter:'siglus-dbs',files};fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify(manifest));
 const C={root,backup,dat,rows,manifest,manifestPath:path.join(backup,'manifest.json'),journal:path.join(backup,'name-column-transaction.json'),read:file=>fs.readFileSync(path.join(dat,file))};
 try{return run(C);}finally{fs.rmSync(root,{recursive:true,force:true});}
}
const cells=b=>{const d=I.decrypt(b);return I.parse(d.raw,d.marker).cells;};
function assertFixed(C){for(const e of C.manifest.files){const after=C.read(e.file),m=JSON.parse(fs.readFileSync(C.manifestPath));assert.equal(m.files.find(f=>f.file===e.file).patchedSha256,hash(after));assert.equal(m.files.find(f=>f.file===e.file).originalSha256,e.originalSha256);assert.equal(hash(fs.readFileSync(path.join(C.backup,'dat',e.file))),e.originalSha256);assert.deepEqual(cells(after),C.rows.map(r=>[r[0],r[1],r[1],r[3]]));}}
test('owned migration repairs only the explicit call column and commits new hashes, preserving original backups',()=>fixture(C=>{
 const done=R.repair(C.root,50,codec);assert.equal(done.applied,2);assert.equal(done.cells,24);assertFixed(C);assert(!fs.existsSync(C.journal));assert.deepEqual(R.repair(C.root,50,codec),{repaired:false});
}));
test('null and unknown capabilities do not write, while call zero works',()=>{
 fixture(C=>{const before=C.read('a.dbs');assert.deepEqual(R.repair(C.root,null,codec),{repaired:false});assert.deepEqual(R.repair(C.root,51,codec),{repaired:false});assert(C.read('a.dbs').equals(before));});
 fixture(C=>{assert.equal(R.repair(C.root,0,codec).applied,2);assertFixed(C);},{column:0});
});
test('a user-modified table is preserved and never adopted into new ownership',()=>fixture(C=>{
 fs.writeFileSync(path.join(C.dat,'a.dbs'),'user changed this table');const user=C.read('a.dbs');const done=R.repair(C.root,50,codec);assert.deepEqual(done.skipped,['a.dbs']);assert(C.read('a.dbs').equals(user));assert.equal(JSON.parse(fs.readFileSync(C.manifestPath)).files[0].patchedSha256,C.manifest.files[0].patchedSha256);
}));
test('wrong backup SHA blocks all writes and retains the backup',()=>fixture(C=>{
 const before=C.read('a.dbs');fs.writeFileSync(path.join(C.backup,'dat','b.dbs'),'changed backup');assert.throws(()=>R.repair(C.root,50,codec),/JAPANESE_REPAIR_BLOCKED/);assert(C.read('a.dbs').equals(before));assert.equal(fs.readFileSync(path.join(C.backup,'dat','b.dbs'),'utf8'),'changed backup');
}));
test('a running game blocks repair before staging or mutation',()=>fixture(C=>{
 const before=C.read('a.dbs');assert.throws(()=>R.repair(C.root,50,{...codec,gameRunning:()=>true}),/JAPANESE_REPAIR_BLOCKED/);assert(C.read('a.dbs').equals(before));assert(!fs.existsSync(C.journal));
}));
for(const fail of ['second-table','manifest'])test('IO failure at '+fail+' rolls back before images and keeps original manifest',()=>fixture(C=>{
 const before=C.read('a.dbs'),mb=fs.readFileSync(C.manifestPath);let failed=false;
 assert.throws(()=>R.repair(C.root,50,{...codec,writeAtomic:(f,b)=>{if(!failed&&(fail==='second-table'?f===path.join(C.dat,'b.dbs'):f===C.manifestPath)){failed=true;throw Error('injected IO');}write(f,b);}}),/JAPANESE_REPAIR_BLOCKED/);
 assert(C.read('a.dbs').equals(before));assert(C.read('b.dbs').equals(before));assert(fs.readFileSync(C.manifestPath).equals(mb));assert(!fs.existsSync(C.journal));
}));
function interrupted(C,point){
 const mod=path.join(__dirname,'..','core','siglus-dbs-name-repair.cjs'),jr=path.join(__dirname,'..','core','japanese-restore.cjs');
 const script=`const fs=require('fs'),path=require('path'),I=require(${JSON.stringify(jr)})._internal,R=require(${JSON.stringify(mod)}),root=process.argv[1];R.repair(root,50,{...I,gameRunning:()=>false,writeAtomic(f,b){fs.writeFileSync(f+'.child-tmp',b);fs.renameSync(f+'.child-tmp',f);if(${JSON.stringify(point)}==='table'?f===path.join(root,'dat','a.dbs'):f===path.join(root,'.megulit-japanese','manifest.json'))process.exit(77);}});`;
 const r=spawnSync(process.execPath,['-e',script,C.root],{windowsHide:true,encoding:'utf8',timeout:10000});assert.equal(r.status,77,r.stdout+r.stderr);assert(fs.existsSync(C.journal));
}
test('hard stop after the first table recovers a mixed before/after transaction and retries safely',()=>fixture(C=>{
 interrupted(C,'table');assert.equal(hash(fs.readFileSync(C.manifestPath)),JSON.parse(fs.readFileSync(C.journal)).manifestBefore);const done=R.repair(C.root,50,codec);assert.equal(done.recovered,'rolled-back');assertFixed(C);assert(!fs.existsSync(C.journal));
}));
test('hard stop after committed manifest finishes cleanup without changing data again',()=>fixture(C=>{
 interrupted(C,'manifest');const before=C.read('a.dbs');const done=R.repair(C.root,50,codec);assert.equal(done.recovered,'committed');assert(C.read('a.dbs').equals(before));assertFixed(C);assert(!fs.existsSync(C.journal));
}));
test('cleanup can resume after a stop while deleting committed before images',()=>fixture(C=>{
 interrupted(C,'manifest');const j=JSON.parse(fs.readFileSync(C.journal)),stage=path.join(C.backup,j.stage);fs.unlinkSync(path.join(stage,'manifest.before'));fs.unlinkSync(path.join(stage,j.files[0].image));
 assert.equal(R.repair(C.root,50,codec).recovered,'committed');assertFixed(C);assert(!fs.existsSync(C.journal));
}));
test('cleanup can resume after rollback has restored every target and manifest',()=>fixture(C=>{
 interrupted(C,'table');const j=JSON.parse(fs.readFileSync(C.journal)),stage=path.join(C.backup,j.stage);
 for(const e of j.files)fs.copyFileSync(path.join(stage,e.image),path.join(C.dat,e.file));fs.copyFileSync(path.join(stage,'manifest.before'),C.manifestPath);fs.unlinkSync(path.join(stage,'manifest.before'));fs.unlinkSync(path.join(stage,j.files[0].image));
 assert.equal(R.repair(C.root,50,codec).recovered,'rolled-back');assertFixed(C);
}));
test('unknown user change after interruption blocks recovery without touching any table',()=>fixture(C=>{
 interrupted(C,'table');fs.writeFileSync(path.join(C.dat,'a.dbs'),'user edit after interruption');const a=C.read('a.dbs'),b=C.read('b.dbs');assert.throws(()=>R.repair(C.root,50,codec),/JAPANESE_REPAIR_BLOCKED/);assert(C.read('a.dbs').equals(a));assert(C.read('b.dbs').equals(b));assert(fs.existsSync(C.journal));
}));
test('a pending journal cannot be recovered under a different or missing version capability',()=>fixture(C=>{
 interrupted(C,'table');const a=C.read('a.dbs');for(const col of [null,0,51])assert.throws(()=>R.repair(C.root,col,codec),/JAPANESE_REPAIR_BLOCKED/);assert(C.read('a.dbs').equals(a));
}));
test('unsafe journal paths and unfinished staging are blocked',()=>{
 fixture(C=>{interrupted(C,'table');const j=JSON.parse(fs.readFileSync(C.journal));j.files[0].file='../foreign.dbs';fs.writeFileSync(C.journal,JSON.stringify(j));assert.throws(()=>R.repair(C.root,50,codec),/JAPANESE_REPAIR_BLOCKED/);});
 fixture(C=>{fs.mkdirSync(path.join(C.backup,'name-column-abcdef'));const a=C.read('a.dbs');assert.throws(()=>R.repair(C.root,50,codec),/JAPANESE_REPAIR_BLOCKED/);assert(C.read('a.dbs').equals(a));});
});
test('a changed numeric field or unproven prior copy is never repaired',()=>fixture(C=>{
 const original=fs.readFileSync(path.join(C.backup,'dat','a.dbs')),bad=table(C.rows.map(r=>[r[1],r[1],r[1],r[3]+1]),[50,7,8,500]);assert.throws(()=>R.repairCells(bad,original,50,codec),/JAPANESE_REPAIR_BLOCKED/);
 const wrong=table(C.rows.map(r=>['wrong name',r[1],r[1],r[3]]),[50,7,8,500]);assert.throws(()=>R.repairCells(wrong,original,50,codec),/JAPANESE_REPAIR_BLOCKED/);
}));
