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
 const g=fs.readFileSync(path.join(root,'core/gal-native.cjs'),'utf8');assert.match(g,/setGameProfile\(profile,input\)/);
 const r=fs.readFileSync(path.join(root,'services/reader.cjs'),'utf8');assert.match(r,/this\.applyGameProfile\(exe,game\)/);assert.match(r,/let profile=P\.profileFor\(input\);/);/* 2026-11-21 this PC's auto layer (services/self-check-live.cjs) goes on top before the profile is handed over */assert.match(r,/profile=P\.profileFor\(\{\.\.\.input,auto:s\.stored\.settings\}\)/);assert.match(r,/setGameProfile\?\.\(profile,input\)/);
});

test('a game without a library engine takes the engine diff from its first engine page record',()=>{
 const {h,log}=hook();const input={exe:'D:/g/Unknown.exe',title:'x'};h.setProfile(Profiles.profileFor(input),input);assert.equal(h.profile.layers,'core');
 h.learnEngine('krkr');assert.equal(h.profile.engine,'kirikiri');assert.equal(h.profile.layers,'core+engine');assert.match(log(),/engine=kirikiri layers=core\+engine/);
 h.learnEngine('cs2');assert.equal(h.profile.engine,'kirikiri','a known engine is never replaced');
});

test('page/hide knobs: null keeps the kernel rule, a diff value wins for that game only',()=>{
 const {h}=hook();const base=Profiles.profileFor({});const withP=(k,v)=>Object.freeze({...base,[k]:Object.freeze({...base[k],...v})});
 h.enabled=true;h.pageMode={mode:'adv',engine:'krkr'};assert.equal(h.drawsHidden,true);
 h.profile=withP('hide',{drawsHidden:false});assert.equal(h.drawsHidden,false);
 h.profile=base;assert.equal(h.holdFor('ocr'),5000);assert.equal(h.holdFor('krkr'),1500);
 h.profile=withP('page',{holdMs:3000});assert.equal(h.holdFor('krkr'),3000);
 h.profile=withP('page',{flowPage:true});assert.equal(h.flowPage,true);
 h.profile=withP('page',{flowPage:false});h.flowPage=true;assert.equal(h.flowPage,false);
});

test('auto layer (this PC measured) goes last, known keys only; apply() adds one layer',()=>{
 const p=Profiles.profileFor({exe:'D:/g/SenrenBanka.exe',auto:{calibrate:{hideMethod:'glyph',textBox:{x:1,y:2,w:3,h:4}},selfCheck:{window:30},bogus:{x:1}}});
 assert.equal(p.layers,'core+engine+game+auto');assert.equal(p.calibrate.hideMethod,'glyph');assert.deepEqual({...p.calibrate.textBox},{x:1,y:2,w:3,h:4});assert.equal(p.selfCheck.window,30);assert.equal(p.selfCheck.minLines,8);assert.ok(!('bogus' in p));
 const q=Profiles.apply(Profiles.profileFor({exe:'D:/g/SenrenBanka.exe'}),{page:{holdMs:900},nope:1},'auto');
 assert.equal(q.layers,'core+engine+game+auto');assert.equal(q.page.holdMs,900);assert.equal(q.gameKey,'senren-banka');assert.ok(Object.isFrozen(q.page));
});
