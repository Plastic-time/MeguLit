'use strict';
// The official Anki MSI leaves InstallLocation and DisplayIcon empty, so an Anki installed outside the default folders
// is only on record in the Start menu shortcut. Without Anki at all, the AnkiConnect button asked to "start Anki once".
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const anki=require('../core/anki-process.cjs');

// A real shortcut, written by Windows itself.
function shortcut(link,target){
 fs.mkdirSync(path.dirname(link),{recursive:true});
 execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:MEGULIT_LNK);$s.TargetPath=$env:MEGULIT_TARGET;$s.Save()'],{windowsHide:true,env:{...process.env,MEGULIT_LNK:link,MEGULIT_TARGET:target}});
}
function setup(folder){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-anki-')),exe=path.join(root,folder,'Anki','Anki.exe');
 fs.mkdirSync(path.dirname(exe),{recursive:true});fs.writeFileSync(exe,'MZ');
 const env={APPDATA:path.join(root,'Roaming'),LOCALAPPDATA:path.join(root,'Local'),ProgramFiles:path.join(root,'PF'),ProgramData:path.join(root,'ProgramData'),USERPROFILE:root,WINDIR:process.env.WINDIR};
 shortcut(path.join(env.APPDATA,'Microsoft','Windows','Start Menu','Programs','Anki','Anki.lnk'),exe);
 return {root,exe,env};
}

for(const folder of ['Programs',path.join('ゲーム','学习')]){
 test(`an Anki in ${folder} is found through its Start menu shortcut`,()=>{
  const {root,exe,env}=setup(folder);
  try{
   assert.equal(anki.shortcutTarget(path.join(env.APPDATA,'Microsoft','Windows','Start Menu','Programs','Anki','Anki.lnk')),exe);
   assert.ok(anki.coldCandidates(env).includes(exe));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 });
}

test('a missing or broken shortcut gives no target',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-anki-'));
 try{
  assert.equal(anki.shortcutTarget(path.join(root,'none.lnk')),'');
  fs.writeFileSync(path.join(root,'bad.lnk'),'not a shortcut');assert.equal(anki.shortcutTarget(path.join(root,'bad.lnk')),'');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('without Anki the AnkiConnect install says to install Anki, not to start it',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-anki-')),env={APPDATA:path.join(root,'Roaming')};
 try{
  await assert.rejects(anki.installAnkiConnect(env,{locate:()=>''}),/ANKI_NOT_INSTALLED/);
  await assert.rejects(anki.installAnkiConnect(env,{locate:()=>path.join(root,'Anki','anki.exe')}),/ANKI_NEVER_STARTED/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
