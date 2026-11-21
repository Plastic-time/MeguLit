// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFile}=require('node:child_process');
function fail(code,mount){const e=Error('DISC_'+code);e.code=e.message;if(mount)e.mount=mount;throw e;}
function execute(file,args,{timeout=20000}={}){
 return new Promise((resolve,reject)=>execFile(file,args,{windowsHide:true,shell:false,timeout,maxBuffer:128*1024},(error,stdout,stderr)=>{
  if(error&&(!Number.isInteger(error.code)||error.killed))return reject(Object.assign(Error('DISC_TOOL_FAILED'),{code:'DISC_TOOL_FAILED'}));
  resolve({code:error?error.code:0,stdout,stderr});
 }));
}
function volumes(text){
 const result=new Map();let id='';for(const line of String(text).split(/\r?\n/)){const guid=/^\s*(\\\\\?\\Volume\{[0-9a-f-]{36}\}\\)\s*$/i.exec(line);if(guid){id=guid[1].toLowerCase();continue;}const drive=/^\s*([a-z]:\\)\s*$/i.exec(line);if(drive&&id){if(result.has(drive[1].toUpperCase()))fail('MOUNT_UNCONFIRMED');result.set(drive[1].toUpperCase(),id);}}
 return result;
}
class BatchMountProvider{
 constructor({batchmnt,execute:run=execute,volumeTable,protocolReady=false,driverReady=async()=>false}){this.batchmnt=batchmnt;this.run=run;this.protocolReady=protocolReady;this.driverReady=driverReady;this.volumeTable=volumeTable||(async()=>{const r=await this.run(path.join(process.env.SystemRoot||'C:\\Windows','System32','mountvol.exe'),[]);if(r.code!==0)fail('MOUNT_UNCONFIRMED');return volumes(r.stdout);});}
 async ready(){if(!this.protocolReady)fail('TOOL_PROTOCOL_UNCONFIRMED');if(!await this.driverReady())fail('DRIVER_REQUIRED');}
 async check(image){const r=await this.run(this.batchmnt,['/check',image]);if(r.code>=65&&r.code<=90)return String.fromCharCode(r.code)+':\\';if(r.code===0)return '';fail('MOUNT_UNCONFIRMED');}
 async mount(image){
  await this.ready();const before=await this.volumeTable();if(await this.check(image))fail('ALREADY_MOUNTED');
  const uncertain={image,mountRoot:'',deviceId:'',owned:false};let r;try{r=await this.run(this.batchmnt,[image,'/wait:10000']);}catch{fail('MOUNT_UNCONFIRMED',uncertain);}
  if(r.code!==0)fail('MOUNT_FAILED',uncertain);
  try{const mountRoot=await this.check(image),after=await this.volumeTable(),deviceId=after.get(mountRoot);
   if(!mountRoot||!deviceId||before.has(mountRoot)||[...before.values()].includes(deviceId))fail('MOUNT_UNCONFIRMED');
   return {image,mountRoot,deviceId,owned:true};
  }catch{fail('MOUNT_UNCONFIRMED',uncertain);}
 }
 async verifyMount(mount){await this.ready();if(!mount?.owned||!mount.deviceId||!mount.mountRoot)return false;return await this.check(mount.image)===mount.mountRoot&&(await this.volumeTable()).get(mount.mountRoot)===mount.deviceId;}
 async unmount(mount){
  if(!await this.verifyMount(mount))fail('MOUNT_CHANGED');const r=await this.run(this.batchmnt,['/unmount',mount.image]);if(r.code!==0)fail('UNMOUNT_FAILED');
  // /check=0 is ambiguous in upstream; independently require disappearance of the exact owned volume.
  if(await this.check(mount.image)||[...(await this.volumeTable()).values()].includes(mount.deviceId))fail('UNMOUNT_FAILED');
 }
}
function create(root){
 const folder=path.join(root,'runtime','wincdemu'),batchmnt=path.join(folder,process.arch==='x64'?'batchmnt64.exe':'batchmnt.exe'),installer=path.join(folder,'WinCDEmu-4.1.exe');
 const packs=require('./runtime-packs.cjs').RuntimePacks.shared(root),system=path.join(process.env.SystemRoot||'C:\\Windows','System32');
 async function standardDriver(){const r=await execute(path.join(system,'sc.exe'),['query','BazisVirtualCDBus']);return r.code===0&&/:\s*4\s+RUNNING\b/i.test(r.stdout);}
 // The portable-only early-return path is not a working standalone-driver fallback.
 const provider=new BatchMountProvider({batchmnt,protocolReady:true,driverReady:async()=>packs.installed('disc-mount')&&fs.existsSync(batchmnt)&&await standardDriver()});
 return {
  async status(){const installed=packs.installed('disc-mount'),running=await standardDriver();return {installed,batchmntPresent:fs.existsSync(batchmnt),protocolReady:!!packs.manifest().packs?.['disc-mount'],driverReady:installed&&fs.existsSync(batchmnt)&&running,standardServiceRunning:running,driverChoice:'standard',reason:running?'':'DISC_STANDARD_DRIVER_REQUIRED',liveVerified:false};},
  async ensureTools(){return packs.ensure('disc-mount');},
  async installDriver(){
   if(!packs.installed('disc-mount')||!fs.existsSync(installer))fail('DRIVER_INSTALLER_MISSING');
   // Explicitly chosen interactive standard installer, normal Windows UAC; no silent switches or policy bypass.
   const script="$p=Start-Process -FilePath $env:MEGULIT_DISC_DRIVER_EXE -Verb RunAs -PassThru -Wait;exit $p.ExitCode";
   const r=await new Promise((resolve,reject)=>execFile(path.join(system,'WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',script],{windowsHide:true,shell:false,env:{...process.env,MEGULIT_DISC_DRIVER_EXE:installer},timeout:30*60000,maxBuffer:128*1024},(e,stdout,stderr)=>e?reject(Object.assign(Error('DISC_DRIVER_INSTALL_FAILED'),{code:'DISC_DRIVER_INSTALL_FAILED'})):resolve({stdout,stderr})));
   return r;
  },
  mount:image=>provider.mount(image),verifyMount:mount=>provider.verifyMount(mount),unmount:mount=>provider.unmount(mount)
 };
}
module.exports={BatchMountProvider,volumes,execute,create};
