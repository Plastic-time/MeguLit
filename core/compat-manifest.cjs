// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-12 what MeguLit placed in a game folder so the game starts without a Windows feature install window (DirectPlay
   DLLs, .NET runtime config), and what it learned at a launch (a feature the game asked Windows for). One file per game
   folder; deleting the listed files undoes everything. */
const fs=require('node:fs'),path=require('node:path');
const NAME='.megulit-compat.json',OLD='.megulit-directplay.json';
function read(dir){
 for(const n of [NAME,OLD]){try{const m=JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'));
  return {files:Array.isArray(m.files)?m.files:[],kinds:m.kinds&&typeof m.kinds==='object'?m.kinds:{},features:Array.isArray(m.features)?m.features:[],configs:m.configs&&typeof m.configs==='object'?m.configs:{}};}catch{}}
 return {files:[],kinds:{},features:[],configs:{}};
}
function write(dir,m){
 try{fs.writeFileSync(path.join(dir,NAME),JSON.stringify({note:'Placed by MeguLit so the game starts without a Windows feature install window or a restart; delete the listed files to undo',...m},null,1));fs.rmSync(path.join(dir,OLD),{force:true});return true;}catch{return false;}
}
function remember(dir,feature){const m=read(dir);if(m.features.includes(feature))return false;m.features.push(feature);return write(dir,m);}
module.exports={read,write,remember,NAME,OLD};
