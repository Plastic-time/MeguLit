// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Seed=require('../core/profiles/seed.cjs'),Diff=require('../core/game-diff.cjs');
function fixture(run){const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-seed-layout-'));try{return run(root);}finally{fs.rmSync(root,{recursive:true,force:true});}}
function game(root,engine,slug){const dir=path.join(root,engine,slug);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'game.json'),JSON.stringify({...Diff.build({key:'ab'.repeat(32),layer:'game',source:'official',mode:'hide',engine,settings:{}}),status:'skeleton',slug,builds:[]}));}
test('publication history is never read as an engine or a source of profile settings',()=>fixture(root=>{
 game(root,'kirikiri','some-game');
 const history=path.join(root,'history','v1','cd'.repeat(32));fs.mkdirSync(history,{recursive:true});fs.writeFileSync(path.join(history,'current.json'),'not a game profile');
 const loaded=Seed.load(root);assert.deepEqual(loaded.errors,[]);assert.deepEqual(loaded.games.map(g=>[g.engine,g.key]),[['kirikiri','some-game']]);assert.equal(loaded.versions.size,0);
}));
test('only the exact history namespace is reserved; similarly named engine folders still load',()=>fixture(root=>{
 game(root,'historyx','other-game');game(root,'kirikiri','some-game');
 const loaded=Seed.load(root);assert.deepEqual(loaded.errors,[]);assert.deepEqual(loaded.games.map(g=>g.engine).sort(),['historyx','kirikiri']);
}));
test('ordinary malformed engine game data is still reported beside a history directory',()=>fixture(root=>{
 fs.mkdirSync(path.join(root,'history','v1'),{recursive:true});const bad=path.join(root,'kirikiri','bad-game');fs.mkdirSync(bad,{recursive:true});fs.writeFileSync(path.join(bad,'game.json'),'{}');
 const loaded=Seed.load(root);assert.equal(loaded.games.length,0);assert.ok(loaded.errors.some(e=>e.startsWith('kirikiri/bad-game/game.json:')));assert.ok(loaded.errors.every(e=>!e.startsWith('history')));
}));
