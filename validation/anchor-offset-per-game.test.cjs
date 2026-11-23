'use strict';
/* 2026-11-19 (user, 素晴らしき日々: 「默认的位置贼偏」, the menu showed 上边距 43): the anchored offset written by 千恋＊万花's field bug
   (anchorDY 43) sat in the global preferences and came along to the next game, whose own profile had none. The offset is a
   per-game position value: the defaults carry 0, so a game without its own offset starts on the game's place. */
const test=require('node:test'),assert=require('node:assert/strict'),os=require('node:os'),fs=require('node:fs'),path=require('node:path');
const gs=require('../core/game-style.js');const {GameStyleSync}=require('../core/game-style-sync.cjs');
const KEY_A='a'.repeat(64),KEY_B='b'.repeat(64);
test('the defaults carry no offset, in both copies',()=>{
 assert.equal(gs.defaults.anchorDX,0);assert.equal(gs.defaults.anchorDY,0);
 assert.match(fs.readFileSync(path.join(__dirname,'..','web','reader','modules','game-style.js'),'utf8'),/anchorDX: 0, anchorDY: 0/);
});
test('a game without its own offset starts at 0 although the global preferences hold one; a game with one keeps it',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-offset-'));const native=path.join(dir,'native');fs.mkdirSync(native);fs.mkdirSync(path.join(dir,'data','config'),{recursive:true});
 const seen=[];const sync=new GameStyleSync({native},m=>{if(m.gameStyleState==='profile')seen.push(m.gameStyleEffectivePrefs);},()=>({on(){},stdin:{write(){}},kill(){}}));
 sync.profiles[KEY_B]={name:'B',savedAt:1,positionSavedAt:1,textSavedAt:1,prefs:{x:20,y:77,anchorDX:2,anchorDY:-1}};
 const global={...gs.defaults,x:19.3,y:79.6,anchorDX:0,anchorDY:43};
 sync.configure(global,{gameProcessId:1,gameStarted:'1',gameStyleKey:KEY_A});assert.equal(seen.at(-1).anchorDY,0,'no profile: back to 0');assert.equal(seen.at(-1).anchorDX,0);
 sync.configure(global,{gameProcessId:2,gameStarted:'2',gameStyleKey:KEY_B});assert.equal(seen.at(-1).anchorDY,-1,'its own offset');assert.equal(seen.at(-1).anchorDX,2);
 fs.rmSync(dir,{recursive:true,force:true});
});
/* 2026-11-19 (user, 素晴らしき日々: 「默认的位置贼偏」): a work with no saved settings starts at the median of the user's saved
   positions (3 or more), else at 20 / 76 / width 60; a work with its own settings is never touched */
test('a new work starts at the median of the saved positions (3+), else 20/76/60; saved works keep theirs',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-newpos-'));const native=path.join(dir,'native');fs.mkdirSync(native);fs.mkdirSync(path.join(dir,'data','config'),{recursive:true});
 const seen=[];const sync=new GameStyleSync({native},m=>{if(m.gameStyleState==='profile')seen.push(m.gameStyleEffectivePrefs);},()=>({on(){},stdin:{write(){}},kill(){}}));
 const keys=['c','d','e'].map(c=>c.repeat(64));let pid=10;const open=key=>{sync.configure(gs.defaults,{gameProcessId:++pid,gameStarted:String(pid),gameStyleKey:key});return seen.at(-1);};
 let p=open(KEY_A);assert.deepEqual([p.x,p.y,p.width],[20,76,60],'fewer than 3 saved: 20/76/60');assert.ok(p.y+p.height<=100);
 sync.profiles[keys[0]]={name:'C',savedAt:1,positionSavedAt:1,prefs:{x:10,y:72,width:80}};
 sync.profiles[keys[1]]={name:'D',savedAt:1,positionSavedAt:1,prefs:{x:18,y:78,width:64}};
p=open('f'.repeat(64));assert.deepEqual([p.x,p.y,p.width],[20,76,60],'two saved: still the fallback');
 sync.profiles[keys[2]]={name:'E',savedAt:1,positionSavedAt:1,prefs:{x:22,y:80,width:58}};
 sync.profiles['9'.repeat(64)]={name:'text only',savedAt:1,textSavedAt:1,prefs:{textColor:'#ffffff'}};
 p=open('a'.repeat(63)+'1');assert.deepEqual([p.x,p.y,p.width],[18,78,64],'median of the three saved positions');
 p=open(keys[0]);assert.deepEqual([p.x,p.y,p.width],[10,72,80],'a saved work keeps its own position');
 p=open('9'.repeat(64));assert.deepEqual([p.x,p.y,p.width],[gs.defaults.x,gs.defaults.y,gs.defaults.width],'a work with saved settings (text only) is unchanged');
 fs.rmSync(dir,{recursive:true,force:true});
});
