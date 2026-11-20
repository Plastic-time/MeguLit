// SPDX-License-Identifier: GPL-3.0-or-later
// 2026-11-21 layered game profile wiring: hook-native gets the profile (trace + hook state gameProfile for the reader),
// a profile key changes kernel behaviour for that game only (choice.filters), the reader keeps a frozen copy.
'use strict';
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const Profiles=require('../core/profiles/index.cjs');
const {HookNative}=require('../core/hook-native.cjs');
const root=path.join(__dirname,'..');
function hook(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-profile-'));const events=[];const h=new HookNative({native:dir,hook:dir,logs:dir},m=>events.push(m));const traced=[];h.trace=m=>traced.push(m);return {h,events,log:()=>traced.join(' | ')};}

test('hook-native starts on the kernel layer and takes the game profile',()=>{
 const {h,events,log}=hook();assert.equal(h.profile.layers,'core');
 const p=Profiles.profileFor({exe:'D:/g/SenrenBanka.exe'});h.setProfile(p);
 assert.equal(h.profile,p);assert.match(log(),/profile senren-banka engine=kirikiri layers=core\+engine\+game/);
 assert.ok(events.some(e=>e.type==='hook'&&e.gameProfile?.gameKey==='senren-banka'));
});

test('choice.filters of one game drop its candidates; other games keep them',()=>{
 const {h}=hook();const opts=['左の道へ進む','右の道へ進む','セーブ'];
 assert.deepEqual(h.choiceFilter(opts),opts);
 const base=Profiles.profileFor({});h.profile=Object.freeze({...base,choice:Object.freeze({filters:Object.freeze(['^セーブ$'])})});
 assert.deepEqual(h.choiceFilter(opts),['左の道へ進む','右の道へ進む']);
});

test('reader bootstrap keeps a frozen window.MeguLitProfile with get()',()=>{
 const s=fs.readFileSync(path.join(root,'web/reader/bootstrap.js'),'utf8');
 assert.match(s,/message\.gameProfile/);assert.match(s,/window\.MeguLitProfile=Object\.freeze/);assert.match(s,/megulit-profile/);
 const g=fs.readFileSync(path.join(root,'core/gal-native.cjs'),'utf8');assert.match(g,/setGameProfile\(profile\)/);
 const r=fs.readFileSync(path.join(root,'services/reader.cjs'),'utf8');assert.match(r,/this\.applyGameProfile\(exe,game\)/);
});
