// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const sourceFile=path.join(__dirname,'../core/cold-test/saves.cjs');
let Saves=require(sourceFile);
if(process.env.MEGULIT_COLD_BASELINE){const m=new Module(sourceFile,module);m.filename=sourceFile;m.paths=Module._nodeModulePaths(path.dirname(sourceFile));m._compile(require('node:child_process').execFileSync('git',['show',process.env.MEGULIT_COLD_BASELINE+':core/cold-test/saves.cjs'],{cwd:path.join(__dirname,'..'),encoding:'utf8'}),sourceFile);Saves=m.exports;}
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cold-save-')),save=path.join(dir,'game','savedata'),root=path.join(dir,'app');fs.mkdirSync(save,{recursive:true});fs.writeFileSync(path.join(save,'save.dat'),'original');
 const snap=Saves.snapshot(root,{places:[{path:save,kind:'game',exists:true}]},{id:'guard'});assert.equal(snap.ok,true);fs.writeFileSync(path.join(save,'save.dat'),'latest write');fs.writeFileSync(path.join(save,'new.dat'),'keep this too');
 return {dir,root,save,journal:snap.journal,file:path.join(Saves.snapDir(root),'guard','journal.json'),cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};}

test('unconfirmed cleanup preserves save contents, original journal and backup, including a half snapshot',()=>{
 for(const state of ['starting','active','alive-unconfirmed','closed-unconfirmed',null])for(const journalState of ['failed','ready','writing']){
  const f=fixture();try{f.journal.state=journalState;f.journal.coldCleanup=state===null?null:{state,helperPid:42};fs.writeFileSync(f.file,JSON.stringify(f.journal,null,1));const before=fs.readFileSync(f.file),objectBefore=JSON.stringify(f.journal);
   const out=Saves.restore(f.root,f.journal,{override:true});assert.deepEqual(out,{ok:false,errors:['COLD_CLEANUP_UNCONFIRMED']},String(state)+'/'+journalState);
   assert.equal(fs.readFileSync(path.join(f.save,'save.dat'),'utf8'),'latest write');assert.equal(fs.readFileSync(path.join(f.save,'new.dat'),'utf8'),'keep this too');assert.deepEqual(fs.readFileSync(f.file),before);assert.equal(JSON.stringify(f.journal),objectBefore);assert.equal(fs.readFileSync(path.join(path.dirname(f.file),'place-0','save.dat'),'utf8'),'original');
  }finally{f.cleanup();}
 }
});

test('confirmed cleanup restores a failed snapshot and removes only its completed backup',()=>{
 const f=fixture();try{f.journal.state='failed';f.journal.coldCleanup={state:'confirmed'};fs.writeFileSync(f.file,JSON.stringify(f.journal));assert.deepEqual(Saves.restore(f.root,f.journal),{ok:true,errors:[]});assert.equal(fs.readFileSync(path.join(f.save,'save.dat'),'utf8'),'original');assert.equal(fs.existsSync(path.join(f.save,'new.dat')),false);assert.equal(fs.existsSync(f.file),false);}finally{f.cleanup();}
});

test('legacy snapshots without a cleanup field retain their restore behavior',()=>{
 const f=fixture();try{assert.equal(Object.hasOwn(f.journal,'coldCleanup'),false);assert.equal(Saves.restore(f.root,f.journal).ok,true);assert.equal(fs.readFileSync(path.join(f.save,'save.dat'),'utf8'),'original');assert.equal(fs.existsSync(f.file),false);}finally{f.cleanup();}
});
