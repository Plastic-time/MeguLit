'use strict';
/* 2026-11-19 (user, 素晴らしき日々 a new work, 「新作品自动校准」 on, yet no position came): the automatic calibration began on the
   first line; that line had already been replaced, so it waited for the next original line. Its 12 s ran from the begin, the user
   advanced 19 s later and one miss gave up for the whole launch. Now the wait for the next line is not counted, a miss tries
   again on the next line, and after 3 misses in a row it stops with a status in the menu. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {HookControl}=require('../core/hook-control.cjs');
function rig(t,{measures,placed=true}){
 t.mock.timers.enable({apis:['setTimeout','Date'],now:1e9});
 const states=[],events=[];
 const h={state:{bound:true,coverEnabled:true,gameProcessId:7,gameStarted:'1795075300000'},preferences:{hookProfile:'embed',hookHide:true,autoGameStyle:true,hookFast:true},
  hooks:{preflight:true,enabled:true,remembered:null,state:{hookThreads:[]},configure(){},trace(){}},
  styleSync:{latest:null,waitNext:false,source:'',status(s){states.push(s);},request(){},begin(){},cancel(){},publish(){return measures(h);}},send(){},save(p){h.preferences=p;},notify(){},onEvent(m){events.push(m);},placement:{current:placed?{text:'x'}:null}};
 const c=new HookControl(h);c.plan='embed';c.running=true;
 return {h,c,states,events,reveal:()=>events.filter(e=>'gameStyleReveal' in e).map(e=>e.gameStyleReveal),wait:ms=>{for(;ms>0;ms-=500)t.mock.timers.tick(Math.min(500,ms));},advance:text=>{h.styleSync.waitNext=false;c.source(text);}};
}
test('the first line was replaced; the user advances 19 s later: the calibration still measures the next line',t=>{
 const {h,c,states,wait,advance}=rig(t,{measures:h=>!h.styleSync.waitNext});
 c.source('「金曜日の昼」');assert.equal(c.styleCalibration,true,'began on the first line');assert.equal(h.styleSync.waitNext,true,'waits for the next original line');
 wait(19000);assert.equal(c.styleCalibration,true,'the wait for the next line is not counted');assert.ok(!states.includes('retrying'));
 advance('世界の意義は世界の外になければならない。');wait(11000);assert.equal(c.styleCalibration,true,'12 s from the line, not yet');
 wait(1500);assert.ok(!states.includes('autoGaveUp')&&!states.includes('retrying'),JSON.stringify(states));assert.notEqual(c.styleGiveUp,'7|1795075300000');
});
test('a miss tries again on a line at least 30 s later; 3 misses stop with a status',t=>{
 const {c,states,wait,advance}=rig(t,{measures:()=>false});
 c.source('一行目');
 for(let miss=1;miss<=3;miss++){assert.equal(c.styleCalibration,true,'calibrating, try '+miss);advance('次の行'+miss);wait(13500);assert.equal(c.styleCalibration,false);
  if(miss<3){assert.ok(!states.includes('autoGaveUp'));advance('すぐ次の行'+miss);assert.equal(c.styleCalibration,false,'not on the very next line: the original does not show every line or two');
   wait(30000);advance('さらに次の行'+miss);}}
 assert.equal(states.at(-1),'autoGaveUp','says so in the menu');
 advance('まだ続く行');assert.equal(c.styleCalibration,false,'no fourth try this launch');
});
test('the menu says 自动校准未完成 and marks it as an error',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'..','web','reader','modules','game-style-sync-ui.js'),'utf8');
 assert.match(ui,/autoGaveUp:'自动校准未完成，可手动校准或直接调整'/);assert.match(ui,/'retrying','autoGaveUp'\]\.includes\(last\.gameStyleState\)/);
});
test('a game laid out in the reader box (no engine places) is tried once, then keeps the default box with a status',t=>{
 const {c,states,wait,advance}=rig(t,{measures:()=>false,placed:false});
 c.source('一行目');advance('次の行');wait(13500);assert.equal(c.styleCalibration,false);assert.equal(states.at(-1),'autoGaveUp');
 wait(60000);advance('もっと後の行');assert.equal(c.styleCalibration,false,'never again this launch');
});
test('the reader steps aside only while the game draws the calibration line in the original, and comes back after',t=>{
 const {c,reveal,wait,advance}=rig(t,{measures:h=>!h.styleSync.waitNext});
 c.source('「金曜日の昼」');assert.deepEqual(reveal(),[],'waiting for the next line: the reader stays');
 wait(5000);assert.deepEqual(reveal(),[]);
 advance('世界の意義は世界の外になければならない。');assert.deepEqual(reveal(),[true],'the original is drawn: no second text over it');
 wait(13500);assert.deepEqual(reveal(),[true],'still measuring');c.finishStyleSync(true);assert.deepEqual(reveal(),[true,false],'back once the calibration ends');
});
test('a calibration cancelled while it only waited never hid the reader',t=>{
 const m=rig(t,{measures:()=>false});m.c.source('一行目');m.c.finishStyleSync(false,true);assert.deepEqual(m.reveal(),[]);
});
test('the reader page hides its own text while the original is shown',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'..','web','reader','modules','game-style-sync-ui.js'),'utf8');
 assert.match(ui,/classList\.toggle\('megulit-original-shown',m\.gameStyleReveal\)/);assert.match(ui,/body\.megulit-original-shown \.sentence-window/);
});
