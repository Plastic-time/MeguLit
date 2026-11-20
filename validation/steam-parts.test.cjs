// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (群友: BALDR SKY Steam 版扫不出/打不开) a Steam install holding one work in parts: launcher/root program plus a
   program of the same name in part folders. Scan (core/library.cjs steamParts, logs/library-scan.log), manual add of a part,
   and the launch helpers (core/steam-owned.cjs installRoot/partOf/installPrograms). Generic; the BALDR SKY names live in
   core/profiles/games/baldr-sky.cjs (validation/fixtures/games/baldr-sky). */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Library}=require('../core/library.cjs'),owned=require('../core/steam-owned.cjs');
const {build,pe}=require('./fixtures/games/baldr-sky/steam-tree.cjs');

function library(t,tree){
 t.after(()=>fs.rmSync(tree.root,{recursive:true,force:true}));
 const config=path.join(tree.root,'data','config');fs.mkdirSync(config,{recursive:true});
 fs.writeFileSync(path.join(config,'library.json'),JSON.stringify({steamPath:tree.steam,games:[],setupDone:true,scanVersion:5}));
 t.mock.method(globalThis,'fetch',async url=>String(url).endsWith('/kana/release')?Response.json({results:[{vns:[{id:'v1306',title:'BALDR SKY'}]}]}):Response.json({results:[]}));
 owned._internal.cache.clear();
 return new Library({root:tree.root,config});
}

test('a Steam install with the same program in a part folder is one game with both parts',async t=>{
 const tree=build(),lib=library(t,tree);
 const [game]=await lib.scan();
 assert.equal(game.appid,'741140');assert.equal(game.exe,tree.exe);assert.equal(game.engine,'NeXAS');
 assert.deepEqual(game.variants.map(v=>[v.label,v.exe]),[['Dive2',tree.exe],['Dive1',tree.dive1]]);
 const log=fs.readFileSync(path.join(tree.root,'logs','library-scan.log'),'utf8').trim().split('\n').map(l=>JSON.parse(l));
 assert.equal(log.at(-1).result,'added');assert.equal(log.at(-1).appid,'741140');assert.equal(log.at(-1).parts,2);
 /* an incremental rescan keeps the parts */
 const [again]=await lib.scan(()=>{},{incremental:true});assert.equal(again.variants.length,2);
});

test('a part picked by hand belongs to the install root game',t=>{
 const tree=build(),lib=library(t,tree);
 const game=lib.manualAdd({exe:tree.dive1,title:'Baldr Sky'});
 assert.equal(game.dir,tree.dir);assert.equal(game.exe,tree.dive1);assert.equal(game.engine,'NeXAS');assert.equal(game.variants.length,2);
});

test('other Steam layouts get no parts: a different program in a subfolder, a program not in the root',t=>{
 const tree=build();t.after(()=>fs.rmSync(tree.root,{recursive:true,force:true}));
 const lib=require('../core/library.cjs');
 fs.renameSync(tree.dive1,path.join(tree.dir,'Dive1','Tool.exe'));
 assert.deepEqual(lib.steamParts(tree.dir,tree.exe,'x'),[]);
 fs.writeFileSync(path.join(tree.dir,'Dive1','BaldrSky.exe'),pe(1000));/* too small to be a program */
 assert.deepEqual(lib.steamParts(tree.dir,tree.exe,'x'),[]);
 assert.deepEqual(lib.steamParts(tree.dir,path.join(tree.dir,'Dive1','Tool.exe'),'x'),[]);
});

test('launch helpers: install root, part, every program a Steam start may end in',t=>{
 const tree=build();t.after(()=>fs.rmSync(tree.root,{recursive:true,force:true}));owned._internal.cache.clear();
 assert.equal(owned.installRoot(tree.dive1),tree.dir);assert.equal(owned.installRoot(tree.exe),tree.dir);
 assert.equal(owned.installRoot(path.join(tree.root,'elsewhere','Game.exe')),'');
 assert.equal(owned.partOf(tree.exe),null,'the root program is Steam\'s own start');
 assert.deepEqual(owned.partOf(tree.dive1),{root:tree.dir,main:tree.exe,folder:'Dive1'});
 const fromPart=owned.installPrograms(tree.dive1).map(f=>path.relative(tree.dir,f));
 assert.deepEqual(fromPart,['BaldrSky.exe'],'the root program; not the tool, not the redistributable, not itself');
 const fromRoot=owned.installPrograms(tree.exe).map(f=>path.relative(tree.dir,f));
 assert.deepEqual(fromRoot,[path.join('Dive1','BaldrSky.exe')]);
 assert.equal(owned.steamOf(tree.dive1).appid,'741140');
});
