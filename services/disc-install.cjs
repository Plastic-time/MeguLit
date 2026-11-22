// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {DiscInstall,local,inside}=require('../core/disc-install.cjs');
const sessions=new WeakMap();
function error(code){return Object.assign(Error('DISC_'+code),{code:'DISC_'+code});}
function manager(root,runtime,save){
 if(sessions.has(runtime))return sessions.get(runtime);const tools=require('../core/disc-runtime.cjs').create(root);
 const locale=new(require('../core/locale-emulator.cjs').LocaleEmulator)(root);
 const m=new DiscInstall({...tools,
  changed:s=>runtime.emit?.('disc-install',s),
  async launch(installer){
   local(installer.path);if(!require('../core/locale-emulator.cjs').x86(installer.path))throw error('INSTALLER_ARCH');
   let status=await locale.status();if(!status.installed)status=await locale.ensure();if(!status.installed||!status.path||!status.profile)throw error('LOCALE_REQUIRED');
   const child=await new Promise((resolve,reject)=>{const c=spawn(status.path,['-runas',status.profile,installer.path],{cwd:path.dirname(installer.path),windowsHide:true,shell:false,stdio:'ignore'});c.once('error',()=>reject(error('INSTALL_FAILED')));c.once('spawn',()=>resolve(c));});
   child.on('error',()=>{});return {child,path:installer.path};
  },
  async installerRunning(owned){if(!owned)return false;if(owned.child?.exitCode===null)return true;return (await locale.processes(owned.path)).length>0;},
  async games(files,roots){
   const lib=require('../core/library.cjs'),launcher=require('../core/launcher-language.cjs'),found=[];
   for(const file of files){if(!/\.exe$/i.test(file)||!launcher.isLauncher(file)||!roots.some(root=>inside(root,file)))continue;
    try{local(file);const game=lib.findGame(path.dirname(file),0);if(!game?.exe||path.resolve(game.exe).toLowerCase()!==path.resolve(file).toLowerCase())continue;
     if(!found.some(g=>g.executable.toLowerCase()===file.toLowerCase()))found.push({executable:file,title:path.basename(game.dir),dir:game.dir,engine:game.engine?.name||''});
    }catch(e){if(e?.code==='DISC_UNSAFE_PATH')throw e;}
   }
   return found;
  },
  async importGame(game){
   local(game.executable);if(!require('../core/launcher-language.cjs').isLauncher(game.executable))throw error('GAME_INVALID');
   try{return await save({title:game.title,executable:game.executable});}catch{throw error('IMPORT_FAILED');}
  }
 });sessions.set(runtime,m);return m;
}
async function handle(root,request,runtime,save){if(!runtime||typeof save!=='function')throw error('PERSISTENT_RUNTIME_REQUIRED');return manager(root,runtime,save).call(request);}
module.exports={handle,manager};
