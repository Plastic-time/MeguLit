// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const pins={
 installer:[1576544,'c47763631d20120057766f2f71f781bf958e22712da4ac933b21db0d615dc93c'],
 'batchmnt.exe':[105984,'c694d42d19daa784687b9146d19b7797b937e151a8aa7155904f54a1a6fd7a84'],
 'batchmnt64.exe':[130048,'4a363e27b849a994250e6f2e4c9b4dd56f70f7cf9ff78375b3ee23244f1f9b6e']
};
function matches(file,kind){
 const [size,hash]=pins[kind];
 try{
  const stat=fs.statSync(file);
  return stat.isFile()&&stat.size===size&&crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')===hash;
 }catch{return false;}
}
function programFolders(env=process.env){
 return [env['ProgramFiles(x86)'],env.ProgramFiles,env.ProgramW6432].filter(Boolean).map(p=>path.join(p,'WinCDEmu'));
}
function registeredFolders(output){
 const folders=[];
 for(const line of output.split(/\r?\n/)){
  const location=/^\s*InstallLocation\s+REG_SZ\s+(.+?)\s*$/i.exec(line);
  const uninstall=/^\s*UninstallString\s+REG_SZ\s+"?(.+?\\uninstall(?:64)?\.exe)"?(?:\s|$)/i.exec(line);
  const dir=location?location[1].replace(/^"|"$/g,''):uninstall&&path.win32.dirname(uninstall[1]);
  if(dir&&/^[a-z]:\\/i.test(dir))folders.push(dir);
 }
 return folders;
}
function findClient(folders,arch=process.arch){
 const names=arch==='ia32'?['batchmnt.exe']:['batchmnt64.exe','batchmnt.exe'];
 for(const folder of new Set(folders)){
  for(const name of names){
   const file=path.join(folder,name);
   if(matches(file,name))return file;
  }
 }
 return '';
}
module.exports={matches,programFolders,registeredFolders,findClient};
