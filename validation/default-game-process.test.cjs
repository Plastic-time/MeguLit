'use strict';
/* 2026-11-19 (user: 做成通用修复): the built-in defaults named the process 'BGI' (a leftover from the first test game). A game
   without a window title got the style profile name "BGI", and a saved bind with no process of its own looked for BGI.exe.
   The default is empty; the process is only ever the one actually bound. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const gs=require('../core/game-style.js');const {GameStyleSync}=require('../core/game-style-sync.cjs');
test('no engine or game name in the defaults (core and reader copies)',()=>{
 assert.equal(gs.defaults.gameProcess,'');assert.equal(gs.clean({}).gameProcess??'','');
 assert.match(fs.readFileSync(path.join(__dirname,'..','web','reader','modules','game-style.js'),'utf8'),/gameProcess: '', x:/);
});
test('a game without a title is not named after a default process',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-defproc-'));const native=path.join(dir,'native');fs.mkdirSync(native);fs.mkdirSync(path.join(dir,'data','config'),{recursive:true});
 const sync=new GameStyleSync({native},()=>{},()=>({on(){},stdin:{write(){}},kill(){}}));
 sync.configure(gs.defaults,{gameProcessId:1,gameStarted:'1',gameStyleKey:'c'.repeat(64)});assert.equal(sync.gameName,'');
 sync.configure(gs.defaults,{gameProcessId:2,gameStarted:'2',gameStyleKey:'d'.repeat(64),processName:'SiglusEngine'});assert.equal(sync.gameName,'SiglusEngine','the process actually bound');
 fs.rmSync(dir,{recursive:true,force:true});
});
