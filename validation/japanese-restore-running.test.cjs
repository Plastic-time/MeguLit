'use strict';
// apply() and restore() must refuse while the game runs. The running check read process paths from PowerShell as
// UTF-8, but PowerShell printed them in the console code page, so a game under a Japanese or Chinese folder never
// matched and the game files could be rewritten while it ran.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const jr=require('../core/japanese-restore.cjs');

for(const folder of [path.join('ゲーム','素晴らしき日々'),path.join('游戏','千恋万花'),path.join('games','plain')]){
 test(`a game running from ${folder} is seen as running`,async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-running-')),dir=path.join(root,folder);
  fs.mkdirSync(dir,{recursive:true});
  const exe=path.join(dir,'game.exe');fs.copyFileSync(path.join(process.env.SystemRoot,'System32','PING.EXE'),exe);
  const game=spawn(exe,['-n','60','127.0.0.1'],{windowsHide:true,stdio:'ignore'});
  try{
   await new Promise((resolve,reject)=>{game.once('spawn',resolve);game.once('error',reject);});
   assert.throws(()=>jr.apply(dir),/GAME_RUNNING/);
   assert.throws(()=>jr.restore(dir),/GAME_RUNNING/);
  }finally{
   game.kill();await new Promise(resolve=>game.once('exit',resolve));
   fs.rmSync(root,{recursive:true,force:true});
  }
 });
}

test('a folder with nothing running is not reported as running',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-running-')),dir=path.join(root,'ゲーム','素晴らしき日々');
 fs.mkdirSync(dir,{recursive:true});
 try{
  assert.throws(()=>jr.apply(dir),/NOTHING_TO_RESTORE/);
  assert.throws(()=>jr.restore(dir),/NOT_APPLIED/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

// Tables written before 1.2.2 shared strings between equal cells and crashed Siglus games (CLANNAD, Summer Pockets,
// 0xC0000005). Launch rewrites such tables; folders MeguLit never wrote are left alone.
test('the pre-launch repair leaves folders without a MeguLit restore untouched and is wired into launch',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-repair-'));
 try{assert.deepEqual(jr.repairShared(root),{repaired:false});}finally{fs.rmSync(root,{recursive:true,force:true});}
 assert.match(fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8'),/japanese-restore\.cjs'\)\.repairShared\(path\.dirname\(game\.executable\)\)/);
});
test('a Steam launch accepts a game process from another program in the install folder',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8');
 assert.match(src,/const anyProcess=async\(\)=>\{const own=await gameProcesses\(root,game\.executable\)/);
 assert.match(src,/waitForVisibleGame\(anyProcess,\{helper:steam/);
});
