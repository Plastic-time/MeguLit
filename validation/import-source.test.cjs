// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-12 (user: the 2003 沙耶の唄 folder used as the Japanese original of Steam The Song of Saya also showed as its own
   game and started the old program): a Japanese original's folder is hidden and starts the game it was imported into. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite'),src=require('../services/import-source.cjs');
function setup(){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-src-')),steam=path.join(base,'steam','Saya'),old=path.join(base,'GAL','saya2003'),other=path.join(base,'GAL','other');
 for(const d of [steam,old,other])fs.mkdirSync(d,{recursive:true});
 const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE games(id TEXT PRIMARY KEY,title TEXT,executable TEXT,original TEXT NOT NULL DEFAULT '{}',removed_at INTEGER,hidden_at INTEGER)");
 const add=(id,dir,exe,lib)=>{fs.writeFileSync(path.join(dir,exe),'');db.prepare('INSERT INTO games(id,title,executable,original) VALUES(?,?,?,?)').run(id,id,path.join(dir,exe),JSON.stringify({library:lib}));};
 add('steam',steam,'Saya_Steam.exe',{source:'steam',vndbId:'v97'});add('old',old,'saya.exe',{source:'folder',vndbId:'v97'});add('other',other,'game.exe',{source:'folder',vndbId:'v1'});
 return {db,steam,old,other};
}
const row=(db,id)=>db.prepare('SELECT * FROM games WHERE id=?').get(id);
test('importing from a folder hides the library game in it and points it at the imported game',()=>{
 const {db,old}=setup();
 assert.deepEqual(src.link(db,'steam',path.join(old,'saya.exe'),{now:5}),['old']);
 assert.equal(row(db,'old').hidden_at,5);assert.equal(src.targetOf(db,row(db,'old')),'steam');
 assert.equal(row(db,'other').hidden_at,null);assert.equal(src.targetOf(db,row(db,'steam')),'');
 assert.deepEqual(src.link(db,'steam',path.join(old,'x.zip')),[],'an archive is not a library folder');
});
test('an import made before links were recorded: the same work next to a game with a Japanese import, once',()=>{
 const {db,steam}=setup();
 assert.deepEqual(src.backfill(db,{now:7}),[],'no import applied yet');
 fs.mkdirSync(path.join(steam,'.megulit-japanese-import'));fs.writeFileSync(path.join(steam,'.megulit-japanese-import','manifest.json'),'{}');
 assert.deepEqual(src.backfill(db,{now:7}),['old']);assert.equal(row(db,'other').hidden_at,null);
 db.prepare('UPDATE games SET hidden_at=NULL WHERE id=?').run('old');
 assert.deepEqual(src.backfill(db,{now:9}),[],'a card the user shows again stays shown');
});
test('launch and home use the link; both imports record it',()=>{
 const bridge=fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8');
 assert.match(bridge,/sources\.targetOf\(db,[\s\S]{0,140}return launch\(db,target,runtime,windowsLaunch,\{redirected:true\}\)/);
 assert.match(bridge,/case 'home': try\{require\('\.\/import-source\.cjs'\)\.backfill\(db\);\}catch\{\}/);
 assert.equal((bridge.match(/import-source\.cjs'\)\.link\(db,id,/g)||[]).length,2);
});
