// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),entry=JSON.parse(fs.readFileSync(path.join(root,'native/native-builds.json'),'utf8')).find(e=>e.name==='megulithook');
const relative=file=>path.relative(root,file).split(path.sep).join('/');
function inputs(){const files=new Set();
 for(const name of ['build-x86.cmd','build-x64.cmd']){
  const script=fs.readFileSync(path.join(root,'native/megulithook',name),'utf8');
  for(const line of script.split(/\r?\n/)){
   const loop=/^for %%F in \(([^)]+)\) do copy \/y "(%~dp0[^"]+)"/i.exec(line);
   const direct=/^copy \/y "(%~dp0[^"]+)"/i.exec(line);
   for(const source of loop?loop[1].split(/\s+/).map(file=>loop[2].replace('%%F',file)):direct?[direct[1]]:[]){
    files.add(relative(path.resolve(root,'native/megulithook',source.slice(5).replace(/\\/g,'/'))));
   }
  }
 }
 return [...files];
}
function covered(file,sources){return sources.some(source=>file===source||fs.statSync(path.join(root,source)).isDirectory()&&file.startsWith(source+'/'));}
test('hook freshness covers every source actually copied by both architecture builds',()=>{
 const files=inputs();assert.ok(files.length>=40,'both build scripts must yield their real source inputs');
 for(const file of files){assert.ok(!file.startsWith('../')&&fs.existsSync(path.join(root,file)),file+' exists inside the repository');assert.ok(covered(file,entry.sources),file+' must invalidate a shipped hook DLL');}
 for(const file of ['native/megulithook/DrawSitesSig.h','native/megulithook/MajiroDraw.h','native/mages/mages.cpp','native/shared/minhook/src/hde/hde32.h'])assert.ok(files.includes(file),file+' extracted from the actual build');
});
test('directory tracking includes a signature-only commit in the source freshness time',()=>{
 const {sourceTime}=require('../tools/native-stale.cjs');
 const signature=sourceTime(['native/megulithook/DrawSitesSig.h']);assert.ok(signature>0);
 assert.ok(sourceTime(entry.sources)>=signature,'signature changes cannot leave hook freshness behind');
});
test('freshness includes unstaged edits and individual files inside new directories',t=>{
 const {sourceTime}=require('../tools/native-stale.cjs'),{execFileSync}=require('node:child_process');
 const dir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'native-freshness-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('git',args,{cwd:dir,windowsHide:true,stdio:'pipe'});
 git('init','-q');fs.mkdirSync(path.join(dir,'inputs'));
 const file=path.join(dir,'inputs','first file.h');
 fs.writeFileSync(file,'first');git('add','.');git('-c','user.name=Fixture','-c','user.email=test@example.invalid','commit','-qm','fixture');
 fs.appendFileSync(file,' edited');const later=new Date(Date.now()+60000);fs.utimesSync(file,later,later);
 assert.equal(sourceTime(['inputs'],dir),fs.statSync(file).mtimeMs);
 const sub=path.join(dir,'inputs','new');fs.mkdirSync(sub);const added=path.join(sub,'second file.h');fs.writeFileSync(added,'second');
 const last=new Date(later.getTime()+60000);fs.utimesSync(added,last,last);
 assert.equal(sourceTime(['inputs'],dir),fs.statSync(added).mtimeMs);
});
