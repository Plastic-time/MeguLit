// SPDX-License-Identifier: GPL-3.0-or-later
// E215.2: the game's own LOG replays earlier lines in a burst. MeguLit stops reading them and hides its text until the
// burst ends or a new line arrives; one repeated line on its own is still read.
const test=require('node:test'),assert=require('node:assert/strict');const {HookNative}=require('../core/hook-native.cjs');
function fixture(t){t.mock.timers.enable({apis:['setTimeout']});let now=1000;const events=[];
 const hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},m=>events.push(m),()=>{},()=>now);hook.trace=()=>{};t.after(()=>hook.stop());
 return {hook,events,line(text){hook.source({text,sourceName:'EmbedTest',origin:'live'},'');},tick(ms){now+=ms;t.mock.timers.tick(ms);},
  read:()=>events.filter(m=>typeof m.hookSource==='string'&&m.hookSource).map(m=>m.hookSource),log:()=>events.filter(m=>typeof m.hookNativeLog==='boolean').map(m=>m.hookNativeLog)};}
test('a burst of earlier lines is the native LOG: not read, reader hidden, back on the next new line',t=>{
 const f=fixture(t);for(const s of ['一行目のせりふ。','二行目のせりふ。','三行目のせりふ。']){f.line(s);f.tick(2000);}
 f.line('一行目のせりふ。');f.tick(200);f.line('二行目のせりふ。');f.tick(200);f.line('三行目のせりふ。');
 assert.deepEqual(f.read(),['一行目のせりふ。','二行目のせりふ。','三行目のせりふ。']);assert.deepEqual(f.log(),[true]);
 f.tick(300);f.line('新しいせりふ。');assert.deepEqual(f.log(),[true,false]);assert.equal(f.read().at(-1),'新しいせりふ。');
});
test('the LOG state ends by itself 1.5 s after the last replay',t=>{
 const f=fixture(t);for(const s of ['あいうえおかき。','さしすせそたち。']){f.line(s);f.tick(2000);}
 f.line('あいうえおかき。');f.tick(100);f.line('さしすせそたち。');assert.deepEqual(f.log(),[true]);f.tick(1600);assert.deepEqual(f.log(),[true,false]);
});
test('one earlier line repeated by the script is read normally',t=>{
 const f=fixture(t);for(const s of ['「待って」','そして彼は走り出した。']){f.line(s);f.tick(2000);}
 f.line('「待って」');f.tick(500);assert.deepEqual(f.log(),[]);assert.equal(f.read().at(-1),'「待って」');
});
