'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
/* Release.ps1 builds the package from the previous zip; files deleted from the repository must not be carried over,
   while files git never tracked (prebuilt native helpers) still are. */
test('release package drops files deleted from the repository',{skip:process.platform!=='win32'},()=>{
 const rel=fs.readFileSync(path.join(__dirname,'..','Release.ps1'),'utf8');
 const fn=rel.split(/\r?\n/).find(l=>l.startsWith('function Get-DroppedPaths'));
 assert.ok(fn,'Get-DroppedPaths is defined on one line');
 assert.match(rel,/\$dropped=Get-DroppedPaths \$prevNames/);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-carry-'));
 const git=(...a)=>cp.execFileSync('git',a,{cwd:dir,stdio:'pipe'});
 try{
  git('init','-q');git('config','user.email','t@t');git('config','user.name','t');
  fs.mkdirSync(path.join(dir,'web'));fs.mkdirSync(path.join(dir,'native'));
  fs.writeFileSync(path.join(dir,'web','old.js'),'1');fs.writeFileSync(path.join(dir,'web','keep.js'),'1');
  git('add','.');git('commit','-qm','a');git('rm','-q','web/old.js');git('commit','-qm','b');
  fs.writeFileSync(path.join(dir,'script.ps1'),'$Root=$PWD.Path\n'+fn+'\n(Get-DroppedPaths @(\'web/old.js\',\'web/keep.js\',\'native/Helper64.dll\')) -join \',\'\n');
  const out=cp.execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','script.ps1'],{cwd:dir,encoding:'utf8'}).trim();
  assert.strictEqual(out,'web/old.js');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
