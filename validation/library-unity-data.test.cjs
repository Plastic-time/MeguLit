'use strict';
// A folder named like a Unity data folder ("SomeGame_Data", the folder a game was unpacked into) made its parent
// look like a Unity game. When that parent was a library folder, folderGames returned it as a single game and skipped
// every game inside it.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {folderGames,engineOf,findGame}=require('../core/library.cjs');

function library(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-library-'));
 const put=(file,bytes=1)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),Buffer.alloc(bytes));};
 put('SomeGame_Data/SomeGame_Data/SomeGame.exe',200000);put('SomeGame_Data/SomeGame_Data/UnityPlayer.dll');put('SomeGame_Data/SomeGame_Data/SomeGame_Data/globalgamemanagers');
 put('KiriKiri Game/data.xp3');put('KiriKiri Game/game.exe');
 put('BGI Game/BGI.exe');put('BGI Game/sysgrp.arc');
 put('Old Unity Game/Old Unity Game.exe');put('Old Unity Game/Old Unity Game_Data/globalgamemanagers');
 return root;
}

test('a folder named like a Unity data folder does not turn the library folder into one game',()=>{
 const root=library();
 try{
  assert.equal(engineOf(root),null);
  assert.deepEqual(folderGames(root).map(g=>path.basename(g.root)).sort(),['BGI Game','KiriKiri Game','Old Unity Game','SomeGame_Data']);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('the game inside such a folder is found',()=>{
 const root=library();
 try{
  const game=findGame(path.join(root,'SomeGame_Data'));
  assert.equal(game?.engine?.name,'Unity');
  assert.equal(game?.exe,path.join(root,'SomeGame_Data','SomeGame_Data','SomeGame.exe'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('a Unity game without UnityPlayer.dll is still recognised',()=>{
 const root=library();
 try{assert.equal(engineOf(path.join(root,'Old Unity Game'))?.name,'Unity');}finally{fs.rmSync(root,{recursive:true,force:true});}
});
