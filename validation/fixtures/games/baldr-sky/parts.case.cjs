// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* BALDR SKY Steam (群友 2026-11-21: 扫不出/打不开): the scan lists the root program with both parts named Dive2/Dive1 by this
   game's diff; Dive1 picked by hand is the same game; a Dive1 start runs from the install root (steam_api + shared .pac). */
const fs=require('node:fs'),path=require('node:path');
module.exports=async({assert,root})=>{
 const tree=require('./steam-tree.cjs').build();
 try{
  const lib=require(path.join(root,'core','library.cjs')),owned=require(path.join(root,'core','steam-owned.cjs'));
  owned._internal.cache.clear();
  const parts=lib.steamParts(tree.dir,tree.exe,'Baldr Sky');
  assert.deepEqual(parts.map(p=>[p.label,p.part,path.relative(tree.dir,p.exe)]),[['Dive2','.','BaldrSky.exe'],['Dive1','Dive1',path.join('Dive1','BaldrSky.exe')]]);
  assert.equal(lib.findGame(tree.dir).exe,tree.exe,'the root program is the one Steam starts');
  const part=owned.partOf(tree.dive1);assert.equal(part.root,tree.dir);assert.equal(part.folder,'Dive1');
  const steamDirect=require(path.join(root,'core','text-paths-launch.cjs')).steamDirect({exe:tree.dive1,appid:'741140',base:part.root,shadowRoot:path.join(tree.root,'shadow')});
  assert.ok(steamDirect,'shadow start of the part');
  assert.equal(path.relative(steamDirect.cwd,steamDirect.exe),path.join('Dive1','BaldrSky.exe'));
  assert.equal(fs.readFileSync(path.join(steamDirect.cwd,'steam_appid.txt'),'utf8'),'741140');
  assert.ok(fs.existsSync(path.join(steamDirect.cwd,'steam_api.dll')),'steam_api.dll is in the start folder');
  assert.ok(fs.existsSync(path.join(steamDirect.cwd,'Script.pac')),'the shared archives are in the start folder');
  assert.ok(fs.existsSync(steamDirect.exe));
 }finally{
  /* the shadow holds junctions: unlink them before removing the tree */
  const sh=path.join(tree.root,'shadow');try{for(const k of fs.readdirSync(sh))for(const n of fs.readdirSync(path.join(sh,k))){const p=path.join(sh,k,n);if(fs.lstatSync(p).isSymbolicLink())fs.rmdirSync(p);}}catch{}
  fs.rmSync(tree.root,{recursive:true,force:true});
 }
};
