// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {pathToFileURL}=require('node:url'),{randomUUID}=require('node:crypto');

test('locale status locates registered directories from literal and escaped file URIs',{skip:process.platform!=='win32'},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-locale-path-')),key='HKCU\\Software\\MeguLitPathTest-'+randomUUID();
 const realExec=cp.execFile,options={windowsHide:true,stdio:'ignore'};let reads=0;
 // Redirect only the installer lookup to a private test value. Never change the real registration.
 t.mock.method(cp,'execFile',(file,args,config,reply)=>{
  if(file==='reg.exe'&&args[0]==='query'&&args[1].endsWith('\\InprocServer32')){reads++;args=['query',key,...args.slice(2)];}
  if(config.env?.MEGULIT_REG_KEY?.endsWith('\\InprocServer32')){reads++;config={...config,env:{...config.env,MEGULIT_REG_KEY:key}};}
  return realExec(file,args,config,reply);
 });
 const {LocaleEmulator}=require('../core/locale-emulator.cjs');
 t.after(()=>{
  cp.spawnSync('reg.exe',['delete',key,'/f'],options);
  fs.rmSync(root,{recursive:true,force:true});
 });
 const install=dir=>{
  fs.mkdirSync(dir,{recursive:true});
  for(const file of ['LEProc.exe','LECommonLibrary.dll','LoaderDll.dll','LocaleEmulator.dll'])fs.writeFileSync(path.join(dir,file),'fixture');
  fs.writeFileSync(path.join(dir,'LEConfig.xml'),'<Profile Guid="b56f4ea1-f9ac-418a-add7-653dc2302e91"><Location>ja-JP</Location></Profile>');
 };
 install(path.join(root,'Copy%20A'));
 for(const [name,escaped] of [['Plain folder',false],['游戏 日本語',false],['工具 #100%',false],['旧版 日本語',true],['Copy A',true]])await t.test(name,async()=>{
  const dir=path.join(root,name);install(dir);
  const handler=path.join(dir,'LEContextMenuHandler.dll'),uri=escaped?pathToFileURL(handler).href:'file:///'+handler.replaceAll('\\','/');
  cp.execFileSync('reg.exe',['add',key,'/v','CodeBase','/t','REG_SZ','/d',uri,'/f'],options);
  const status=await new LocaleEmulator(path.join(root,'app')).status();
  assert.equal(status.path,path.join(dir,'LEProc.exe'));
 });
 const app=path.join(root,'app'),bundled=path.join(app,'runtime','locale-emulator');install(bundled);
 reads=0;
 assert.equal((await new LocaleEmulator(app).status()).dir,bundled);
 assert.equal(reads,0);
});
