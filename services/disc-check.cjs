// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E299 (user, 2026-11-10: 魔法使いの夜 would not start, also when double-clicked): boxed KiriKiri releases can ship a
// protection plug-in (plugin/*.tpm) that checks for the original DVD in a drive and for the installer's registry entry.
// A copied folder then quits on start. When a launch fails, MeguLit says that instead of a generic early exit.
const fs=require('node:fs'),path=require('node:path');
const MARKS=['GetDriveTypeA','in disc','no disc'];
function discProtected(dir){
 let files=[];try{files=fs.readdirSync(path.join(dir,'plugin')).filter(f=>/\.tpm$/i.test(f));}catch{return false;}
 for(const f of files){
  let data;try{const file=path.join(dir,'plugin',f);if(fs.statSync(file).size>8<<20)continue;data=fs.readFileSync(file);}catch{continue;}
  if(MARKS.every(m=>data.includes(m,0,'latin1')))return true;
 }
 return false;
}
module.exports={discProtected};
