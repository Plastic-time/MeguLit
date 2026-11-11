'use strict';
// Issues 120/121: Pal (Steam LeyLine.exe) gives no engine coordinates; the OCR page fallback missed every line because
// MeguLit had already replaced the original. The fallback now reads the screen only while the original is drawn.
const test=require('node:test'),assert=require('node:assert/strict');
const {HookNative}=require('../core/hook-native.cjs');
function fixture(t){const located=[],traces=[];
 const hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},()=>{},()=>{},()=>100000);hook.trace=m=>traces.push(m);hook.locate=text=>located.push(text);t.after(()=>hook.stop());
 return {hook,located,traces,line(text){hook.source({text,sourceName:'Pal',origin:'live'},'');}};}

test('a replaced original is not looked for on screen, and the reason is logged once',t=>{
 const f=fixture(t);f.hook.enabled=true;f.hook.preferences={hookHide:true};f.hook.state={...f.hook.state,replacementState:'clear-requested'};
 f.line('とはいえ、それが俺にとって都合が良かった。');f.line('（受験も面接も何もなしって、怪しすぎるだろ……）');
 assert.deepEqual(f.located,[]);
 assert.equal(f.traces.filter(m=>/^ocr page skipped/.test(m)).length,1);
});

test('the original on screen is still located: read-only, unhidden, baseline or no replacement',t=>{
 for(const setup of [h=>{h.enabled=false;},h=>{h.enabled=true;h.preferences={hookHide:false};h.state={...h.state,replacementState:'clear-requested'};},h=>{h.enabled=true;h.preferences={};h.state={...h.state,replacementState:'disabled'};}]){
  const f=fixture(t);setup(f.hook);f.line('生徒手帳もその返信に入っていたものだ。');
  assert.deepEqual(f.located,['生徒手帳もその返信に入っていたものだ。']);
 }
});

test('locating resumes once the original shows again',t=>{
 const f=fixture(t);f.hook.enabled=true;f.hook.preferences={};f.hook.state={...f.hook.state,replacementState:'callback-acknowledged'};
 f.line('一行目の台詞です。');f.hook.enabled=false;f.line('二行目の台詞です。');
 assert.deepEqual(f.located,['二行目の台詞です。']);
});

test('issue 121: the old follow-the-original switch is gone everywhere and nothing turns following off',()=>{
 const fs=require('node:fs'),path=require('node:path'),read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
 const {fields}=require('../services/settings-schema.cjs');
 assert.equal((fields||[]).some(f=>f.key==='livePosition'),false,'no settings page toggle');
 assert.doesNotMatch(read('web/settings-help.js'),/livePosition/);
 assert.doesNotMatch(read('web/reader/modules/gal.js'),/galLivePosition|additional\.livePosition/);
 assert.doesNotMatch(read('web/reader/modules/game-style-sync-ui.js'),/livePosition:false/);
 assert.doesNotMatch(read('web/reader/modules/text-position.js'),/livePosition/,'following depends only on engine coordinates and a calibration map');
});
