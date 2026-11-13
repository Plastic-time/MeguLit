// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-13 adaptation overview: the zero-latency column and the patch state behind it.
   - brief() tells a Chinese script that failed pairing and one the user removed from plain machine translation
   - the running-script index carries a reader stamp, so a reader fix reads the script again (Fata Morgana kept a stale index)
   - a script the user picked is never overwritten or cleared by the drive search
   - the overview UI gives every state its own tone (no all-green column) and has a real close button */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const ot=require('../services/original-text.cjs');
const src=fs.readFileSync(path.join(__dirname,'../services/original-text.cjs'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'../web/adaptation-overview.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../web/diagnostics.css'),'utf8');
function root(state){const r=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'ov-'));fs.mkdirSync(path.join(r,'data/config'),{recursive:true});fs.writeFileSync(path.join(r,'data/config/original-text.json'),JSON.stringify(state));return r;}

test('brief separates ready, failed, removed and machine',()=>{
 const r=root({a:{status:'native-japanese',patchStatus:'ready',patch:{}},b:{status:'native-japanese',patchStatus:'unreliable',patch:{auto:false}},c:{status:'native-japanese',patchStatus:'none',patch:null,patchSearch:{declined:true}},d:{status:'native-japanese',patchStatus:'none'},e:{status:'chinese-only'}});
 assert.equal(ot.brief(r,'a'),'patch');assert.equal(ot.brief(r,'b'),'patch-unreliable');assert.equal(ot.brief(r,'c'),'patch-removed');
 assert.equal(ot.brief(r,'d'),'machine');assert.equal(ot.brief(r,'e'),'needs-japanese');assert.equal(ot.brief(r,'zz'),'unknown');
});
test('running-script index is keyed by the reader code too',()=>{
 assert.match(src,/const READER=/);
 assert.match(src,/current\.runtime\.reader\|\|''\)===READER/);
 assert.match(src,/reader:READER,index/);
 assert.match(src,/state\.patchSearch\.reader\|\|''\)===\(state\.runtime\.reader/,'a search cached for an older reader runs again');
});
test('a user-picked patch is kept by autoPatch and restored after a failed search',()=>{
 assert.match(src,/state\.patch&&!state\.patch\.auto&&!options\.force\)return \{manual:true\}/);
 assert.match(src,/\(stale\|\|state\.patchStatus==='ready'\)&&state\.patch\.auto\)/);
 assert.match(src,/patch:before\.patch\|\|null/);
});
test('overview tones are distinct per meaning',()=>{
 const tone=Function('return '+ui.match(/const tone=(\{[^;]+\});/)[1])();
 assert.equal(tone.patch,'ok');assert.equal(tone.machine,'part');assert.equal(tone['patch-unreliable'],'bad');assert.equal(tone['patch-removed'],'part');
 assert.equal(tone.supported,'part');assert.equal(tone.verified,'ok');
 for(const t of ['ok','part','wait','bad'])assert.match(css,new RegExp(`adapt-pill\\[data-tone=${t}\\]`));
 for(const k of ['patch-unreliable','patch-removed'])assert.equal((ui.match(new RegExp(`\\['${k}'\\]:`,'g'))||[]).length,3,'zh/ja/en labels for '+k);
});
test('overview has a header close button and one scroll area with a sticky head',()=>{
 assert.match(ui,/class="adapt-close" data-close/);assert.doesNotMatch(ui,/dialog-actions/);
 assert.match(ui,/<div class="adapt-scroll"><div class="adapt-head"/);
 assert.match(css,/\.adapt-head\{position:sticky/);
});
