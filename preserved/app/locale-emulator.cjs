// SPDX-License-Identifier: GPL-3.0-or-later
// Portable Locale Emulator integration, using the upstream non-admin Japanese profile
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFile,spawn}=require('node:child_process');
const RELEASE='2.5.0.1',URL='https://github.com/xupefei/Locale-Emulator/releases/download/v2.5.0.1/Locale.Emulator.2.5.0.1.zip';
const REQUIRED=['LEProc.exe','LECommonLibrary.dll','LoaderDll.dll','LocaleEmulator.dll'];
const GUID='b56f4ea1-f9ac-418a-add7-653dc2302e91';
const XML=`<?xml version="1.0" encoding="utf-8"?><LEConfig><Profiles><Profile Name="Run in Japanese" Guid="${GUID}" MainMenu="false"><Parameter></Parameter><Location>ja-JP</Location><Timezone>Tokyo Standard Time</Timezone><RunAsAdmin>false</RunAsAdmin><RedirectRegistry>true</RedirectRegistry><IsAdvancedRedirection>false</IsAdvancedRedirection><RunWithSuspend>false</RunWithSuspend></Profile></Profiles></LEConfig>`;
const run=(file,args)=>new Promise((resolve,reject)=>execFile(file,args,{windowsHide:true,timeout:30000,encoding:'utf8'},(e,out)=>e?reject(e):resolve(out)));
function profile(dir){try{const xml=fs.readFileSync(path.join(dir,'LEConfig.xml'),'utf8');
 for(const m of xml.matchAll(/<Profile\b([^>]*)>([\s\S]*?)<\/Profile>/g)){const a=m[1],body=m[2],guid=/\bGuid="([0-9a-f-]{36})"/i.exec(a)?.[1];
  if(guid&&/<Location>\s*ja-JP\s*<\/Location>/i.test(body)&&!/<RunAsAdmin>\s*true\s*</i.test(body)&&!/<RunWithSuspend>\s*true\s*</i.test(body)&&!/<Parameter>\s*[^<\s]/i.test(body))return guid;}
 }catch{}return '';}
function complete(dir){return REQUIRED.every(n=>{try{return fs.statSync(path.join(dir,n)).isFile();}catch{return false;}});}
function x86(exe){try{const fd=fs.openSync(exe,'r');try{const head=Buffer.alloc(64);fs.readSync(fd,head,0,64,0);if(head.readUInt16LE(0)!==0x5a4d)return false;const pe=Buffer.alloc(6);fs.readSync(fd,pe,0,6,head.readUInt32LE(60));return pe.readUInt32LE(0)===0x4550&&pe.readUInt16LE(4)===0x14c;}finally{fs.closeSync(fd);}}catch{return false;}}
function recommended(game,exe){return game.source!=='steam'&&/YU-RIS|BGI|KiriKiri|Siglus|RealLive|CatSystem|AdvHD|WillPlus|Majiro|QLIE|SoftPal|NeXAS|System4|ShiinaRio|Entis|Cotopha|NScripter|LiveMaker/i.test(game.engine||'')&&x86(exe);}
class LocaleEmulator{
 constructor(root){this.root=root;this.dir=path.join(root,'runtime','locale-emulator');this.job=null;this.cached=null;}
 async status(refresh=false){
  if(!refresh&&this.cached&&Date.now()-this.cached.at<15000)return {...this.cached.value,job:this.job};
  const dirs=[this.dir];
  try{const output=await run('reg.exe',['query','HKCR\\CLSID\\{C52B9871-E5E9-41FD-B84D-C5ACADBEC7AE}\\InprocServer32','/v','CodeBase']);const uri=/CodeBase\s+REG_SZ\s+(file:\/\/\/[^\r\n]+)/i.exec(output)?.[1];if(uri)dirs.push(path.dirname(require('node:url').fileURLToPath(uri.trim())));}catch{}
  const home=process.env.USERPROFILE||'';
  for(const base of [path.join(home,'Downloads'),path.join(home,'Desktop'),path.dirname(this.root),process.env.ProgramFiles,process.env['ProgramFiles(x86)']].filter(Boolean)){
   try{for(const e of fs.readdirSync(base,{withFileTypes:true}))if(e.isDirectory()&&/locale[ ._-]*emulator/i.test(e.name))dirs.push(path.join(base,e.name));}catch{}
  }
  let incomplete='';for(const dir of new Set(dirs)){if(complete(dir)&&profile(dir)){const value={installed:true,path:path.join(dir,'LEProc.exe'),profile:profile(dir),dir,installDir:this.dir};this.cached={at:Date.now(),value};return {...value,job:this.job};}if(fs.existsSync(dir)&&!incomplete)incomplete=dir;}
  const value={installed:false,path:'',dir:'',installDir:this.dir,incompletePath:incomplete};this.cached={at:Date.now(),value};return {...value,job:this.job};
 }
 async install(){
  if(this.job&&['downloading','extracting'].includes(this.job.state))return this.status();
  this.job={state:'downloading',received:0,total:154135,error:''};
  this.installing=this.prepare().then(()=>{this.job.state='done';this.cached=null;}).catch(e=>{this.job.state='error';fs.appendFileSync(path.join(this.root,'logs','locale-emulator.log'),new Date().toISOString()+' '+String(e.message||e)+'\n');this.job.error=/^LE_[A-Z_]+$/.test(e.message)?e.message:'LE_INSTALL_FAILED';});
  return this.status();
 }
 async prepare(){
  const cache=path.join(this.root,'cache');fs.mkdirSync(cache,{recursive:true});
  const zip=path.join(cache,'Locale.Emulator.'+RELEASE+'.zip'),part=zip+'.part';
  const stage=this.dir+'.stage-'+crypto.randomUUID();
  try{
   const response=await fetch(URL,{signal:AbortSignal.timeout(120000)});if(!response.ok||!response.body)throw Error('HTTP '+response.status);
   const chunks=[];for await(const chunk of response.body){this.job.received+=chunk.length;if(this.job.received>5000000)throw Error('LE_PACKAGE_INVALID');chunks.push(chunk);}
   const bytes=Buffer.concat(chunks);if(bytes.length!==154135||bytes.readUInt32LE(0)!==0x04034b50)throw Error('LE_PACKAGE_INVALID');fs.writeFileSync(part,bytes);fs.renameSync(part,zip);
   this.job.state='extracting';
   const script=`import sys,zipfile,pathlib\nz=zipfile.ZipFile(sys.argv[1]); root=pathlib.Path(sys.argv[2]).resolve(); root.mkdir(parents=True)\nfor e in z.infolist():\n p=(root/e.filename).resolve()\n if not p.is_relative_to(root) or e.file_size>20000000 or (e.external_attr>>16)&0o170000==0o120000: raise ValueError('Unsafe archive entry')\nz.extractall(root)\n`;
   await run(path.join(this.root,'runtime','python','python.exe'),['-c',script,zip,stage]);
   await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(this.root,'app','extract-locale.ps1'),'-Installer',path.join(stage,'LEInstaller.exe'),'-OutputDirectory',stage]);
   if(!complete(stage))throw Error('LE_COMPONENTS_MISSING');
   // A private portable configuration prevents an application profile or global admin profile taking priority
   fs.writeFileSync(path.join(stage,'LEConfig.xml'),XML,'utf8');
   fs.writeFileSync(path.join(stage,'TOME-INSTALL.json'),JSON.stringify({version:RELEASE,publisher:'xupefei / Locale-Emulator',initialized:true,initialization:'official installer embedded resources',url:URL,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),installedAt:new Date().toISOString()},null,2));
   fs.mkdirSync(path.dirname(this.dir),{recursive:true});if(fs.existsSync(this.dir))fs.renameSync(this.dir,this.dir+'.backup-'+Date.now());fs.renameSync(stage,this.dir);
  }finally{try{fs.rmSync(part,{force:true});}catch{}if(path.dirname(stage)===path.dirname(this.dir)&&stage.startsWith(this.dir+'.stage-'))try{fs.rmSync(stage,{recursive:true,force:true});}catch{}}
 }
 async processes(exe){const output=await run(path.join(this.root,'native','GalWindowBridge.exe'),['--process-status',exe]);const result=JSON.parse(output.trim());if(result.type!=='gameProcesses'||!Array.isArray(result.processes))throw Error('LE_PROCESS_CHECK_FAILED');return result.processes;}
 async launch(exe){if(!x86(exe))throw Error('LE_X86_ONLY');const s=await this.status(true);if(!s.installed)return {needLocaleEmulator:true,...s};
  await new Promise((resolve,reject)=>{const child=spawn(s.path,['-runas',s.profile,exe],{cwd:path.dirname(exe),detached:true,stdio:'ignore',windowsHide:true});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});});for(let i=0;i<60;i++){const processes=await this.processes(exe);const game=processes.find(p=>p.visible);if(game)return {localeJapanese:true,localePath:s.path,gamePid:game.pid};await new Promise(r=>setTimeout(r,250));}throw Error('LE_GAME_NOT_STARTED');
 }
}
module.exports={LocaleEmulator,profile,complete,x86,recommended,RELEASE,URL};
