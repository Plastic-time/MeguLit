// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {archives}=require('./original-engines/krkr-lang.cjs');

// These small launchers start the shared executable with a literal language argument.
function launchPlan(launcher){
 if(!launcher||!/^fata_(?:jp|ja|zh|cn|chs|cht|tw|en|ru)\.exe$/i.test(path.basename(launcher)))return null;
 const dir=path.dirname(launcher),executable=path.join(dir,'fata.exe');
 try{
  const stat=fs.statSync(launcher);
  if(!stat.isFile()||stat.size>1024*1024||!fs.statSync(executable).isFile()||
     !fs.statSync(path.join(dir,'data.xp3')).isFile()||!archives(dir))return null;
  const binary=fs.readFileSync(launcher);
  if(binary.toString('ascii',0,2)!=='MZ')return null;
  const args=new Set();
  for(const encoding of ['latin1','utf16le']){
   if(!binary.includes(Buffer.from('fata.exe\0',encoding)))continue;
   for(const hit of binary.toString(encoding).matchAll(/(-language=(?:jp|ja|zh|cn|chs|cht|tw|en|ru))\0/gi))args.add(hit[1].toLowerCase());
  }
  // KiriKiri 2's DirectInput wheel can advance the game while the overlay consumes Windows mouse input.
  return args.size===1?{executable,args:[...args,'-wheel=message']}:null;
 }catch{return null;}
}

module.exports={launchPlan};
