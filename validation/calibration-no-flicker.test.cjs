// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-19 (user, live 千恋＊万花: "点校准之后 alt+t 闪闪闪的"). Calibration samples read the screen, so each one hid the
   subtitle and the Alt+T menu (gameStylePreview → body.tome-style-probing). The game draws Japanese, but its line was still
   hidden while calibrating (recording 14:55: during a capture the box held only MeguLit's translation line, no game text),
   so no sample ever matched, every new line reset the per-line attempts, and the menu the
   player had just used blinked two or three times per line until the 90 s deadline.
   Now a sample captures the game window alone (captureMode "window"): nothing of MeguLit is hidden. Only when that
   window cannot be captured does one screen read per calibration hide the subtitle (never the menu). A calibration
   ends as unmatched after four misses in all. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{PassThrough}=require('node:stream');
const {GameStyleSync}=require('../core/game-style-sync.cjs');

function rig(t,{windowCaptures=true}={}){
 const native=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-calib-flicker-'));fs.writeFileSync(path.join(native,'GameStyleProbe.exe'),'');t.after(()=>fs.rmSync(native,{recursive:true,force:true}));
 const requests=[],events=[],stdout=new PassThrough();const child={stdin:{write:l=>requests.push(JSON.parse(l)),on(){},end(){}},stdout,on(){},kill(){}};
 /* like gal-native: unmatched / measured / timeout end the calibration (hook-control finishStyleSync) */
 const sync=new GameStyleSync({native,config:null},m=>{events.push(m);if(['unmatched','measured','timeout','unavailable'].includes(m.gameStyleState))sync.calibrating=false;},()=>child);sync.retryGapMs=0;sync.retryDelayMs=0;sync.lineDelay=60000;
 sync.configure({autoGameStyle:true},{bound:true,gameHwnd:'100',gameProcessId:7,gameStarted:1});t.after(()=>sync.stop());
 const wait=(ms=15)=>new Promise(r=>setTimeout(r,ms));
 /* the probe as it answers when the source line is not on screen; a window it cannot capture answers with its error */
 let answered=0;const miss=async()=>{for(const q of requests.slice(answered)){answered++;if(!q.captureMode)continue;
  if(q.captureMode==='window'&&!windowCaptures)stdout.write(JSON.stringify({id:q.id,error:'capture deferred'})+'\n');
  else stdout.write(JSON.stringify({id:q.id,result:{valid:false,reason:'original-not-visible-or-unmatched'}})+'\n');}await wait();};
 const hides=()=>events.filter(m=>m.gameStylePreview===true).length;
 return {sync,requests,events,wait,miss,hides,captures:mode=>requests.filter(q=>q.captureMode===mode).length};}

const LINES=Array.from({length:20},(_,i)=>'将臣はそう言って、窓の外の景色を眺めた。その'+i+'番目の台詞。');
async function calibrate(r,lines){r.sync.observe(LINES[0],false);r.sync.begin('all');r.sync.request(true);
 for(let i=1;i<=lines;i++){for(let k=0;k<4;k++){await r.wait();await r.miss();}r.sync.observe(LINES[i],false);}
 for(let k=0;k<4;k++){await r.wait();await r.miss();}}

test('an original that never shows: calibrating over ten lines hides nothing and ends with a clear unmatched',async t=>{const r=rig(t);
 await calibrate(r,10);
 assert.ok(r.captures('window')>=1,'the game window is captured');assert.equal(r.captures('visible-client'),0,'never the screen');
 assert.equal(r.hides(),0,'the subtitle and the Alt+T menu are never hidden');
 const end=r.events.filter(m=>m.gameStyleState==='unmatched');assert.equal(end.length,1,'it ends once, as unmatched');
 assert.ok(r.captures('window')<=4,'four misses in all, not per line: '+r.captures('window'));
});

test('a window that cannot be captured gets one screen read for the whole calibration',async t=>{const r=rig(t,{windowCaptures:false});
 await calibrate(r,10);
 assert.equal(r.captures('visible-client'),1,'one screen read');assert.ok(r.hides()<=1,'hidden at most once: '+r.hides());
 assert.equal(r.events.filter(m=>typeof m.gameStylePreview==='boolean').at(-1).gameStylePreview,false,'and shown again');
});

test('after the calibration gave up, reading on and toggling Alt+T ten times hides nothing',async t=>{const r=rig(t);
 await calibrate(r,4);assert.ok(r.events.some(m=>m.gameStyleState==='unmatched'));
 const hidden=r.hides(),sent=r.requests.length;
 for(let i=5;i<15;i++){r.sync.observe(LINES[i],false);await r.wait(30);await r.miss();}
 assert.equal(r.hides(),hidden);assert.equal(r.requests.length,sent,'no calibration capture at all');
});

test('a calibration whose original does show still measures it on a later line',async t=>{const r=rig(t);
 r.sync.observe(LINES[0],false);r.sync.begin('all');r.sync.request(true);
 await r.wait();await r.miss();r.sync.observe(LINES[1],false);r.events.length=0;
 for(let k=0;k<4&&!r.events.some(m=>m.gameStyleState==='sampling'||m.gameStyleState==='measured');k++){await r.wait(30);
  const q=r.sync.pending;if(q)r.sync.child.stdout.write(JSON.stringify({id:q.id,result:{valid:true,style:{textColor:'#FFFFFF',fontSize:28,box:{left:10,top:70,width:80,height:20}}}})+'\n');await r.wait();}
 assert.ok(r.events.some(m=>m.gameStyleState==='sampling'||m.gameStyleState==='measured'),r.events.map(m=>m.gameStyleState).join(','));
 assert.ok(!r.events.some(m=>m.gameStyleState==='unmatched'));assert.equal(r.hides(),0);
});

test('the Alt+T menu is not among what a screen read hides; the probe can capture the game window alone',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'..','web','reader','modules','game-style-sync-ui.js'),'utf8');
 const rule=ui.split('\n').find(l=>l.includes('tome-style-probing .sentence-window'));assert.ok(rule);assert.ok(!rule.includes('tomoyo-cn-dialog'),'the menu stays');
 const probe=fs.readFileSync(path.join(__dirname,'..','native','GameStyleProbe.cs'),'utf8');
 assert.ok(probe.includes('if(captureMode=="window"){if(!GameCapture.Into(target,full,3,false))throw new Exception("capture deferred");}'),'window mode never falls back to the screen');
 assert.ok(probe.includes('Console.WriteLine(Json.Serialize(new{id=d["id"],error=e.Message}))'),'an error answers its request');
});
