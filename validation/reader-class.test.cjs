// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-12 转职: eight elements, the level holds at Lv.20 until one is chosen and the waiting experience is paid back
   at once; the interface (web/reader-class.js) and the service (services/reader-class.cjs) count the same; the relay
   accepts the element and level with a submission. */
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-reader-class-'));process.env.MEGULIT_ROOT=root;
const {dispatch}=require('../services/bridge.cjs');
const rc=require('../services/reader-class.cjs');
test.after(()=>{try{fs.rmSync(root,{recursive:true,force:true});}catch{}});

test('the element starts empty, takes one of the eight, can change, and refuses anything else (including none)',async()=>{
 assert.equal((await dispatch({action:'reader_class_get'})).element,'');
 assert.equal((await dispatch({action:'reader_class_set',element:'fire'})).element,'fire');
 assert.equal((await dispatch({action:'reader_class_get'})).element,'fire');
 await dispatch({action:'reader_class_set',element:'dark'});
 assert.equal((await dispatch({action:'reader_class_get'})).element,'dark');
 for(const bad of ['','necromancy','explosion'])await assert.rejects(dispatch({action:'reader_class_set',element:bad}),/READER_CLASS_INVALID/);
 assert.equal(rc.ELEMENTS.length,8);
});
test('an older school file still reads (explosion → fire, frost → ice)',()=>{
 const r=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-rc-old-'));fs.mkdirSync(path.join(r,'data','config'),{recursive:true});
 fs.writeFileSync(path.join(r,'data','config','reader-class.json'),JSON.stringify({school:'explosion',at:1}));assert.equal(rc.read(r).element,'fire');
 fs.writeFileSync(path.join(r,'data','config','reader-class.json'),JSON.stringify({school:'healing',at:1}));assert.equal(rc.read(r).element,'');
 fs.rmSync(r,{recursive:true,force:true});
});
test('without an element the level holds at 20 and the rest waits; choosing one pays it all back',()=>{
 const cap=rc.xpToReach(20);assert.equal(cap,9400);
 const stats={characters:(cap+1500)*50};
 const held=rc.readerLevel(stats,'');assert.deepEqual([held.level,held.locked,held.pending,held.into],[20,true,1500,0]);
 const freed=rc.readerLevel(stats,'ice');assert.deepEqual([freed.level,freed.locked,freed.pending,freed.xp],[22,false,0,cap+1500]);
 const young=rc.readerLevel({characters:5000},'');assert.equal(young.locked,false);assert.equal(young.level,2);
});
test('the interface counts the same levels and gives fire 爆裂魔法学徒 at Lv.80, with no 魔导士 / 红魔族 / 练习生',async()=>{
 const ui=await import('../web/reader-class.js');
 for(const stats of [{},{characters:4999},{characters:470000,seconds:3600,words:12},{characters:9e6}])for(const e of ['','fire','light']){
  const a=rc.readerLevel(stats,e),b=ui.readerLevel(stats,e);assert.deepEqual([b.level,b.into,b.need,b.pending,b.locked],[a.level,a.into,a.need,a.pending,a.locked]);}
 assert.equal(ui.rankTitle(80,'zh','fire'),'爆裂魔法学徒');assert.equal(ui.rankTitle(200,'zh','fire'),'爆裂魔法学徒');
 assert.deepEqual(Object.keys(ui.SCHOOLS).sort(),[...rc.ELEMENTS].sort());
 const all=JSON.stringify(Object.values(ui.SCHOOLS).map(s=>s.ranks))+[1,5,10,15,20].map(l=>['zh','ja','en'].map(x=>ui.rankTitle(l,x,'')).join()).join();
 for(const banned of ['魔导士','红魔族','練習生','练习生'])assert.equal(all.includes(banned),false,banned);
});
test('the level endpoint reports the hold and the waiting experience',async()=>{
 await dispatch({action:'reader_class_set',element:'water'});
 const r=await dispatch({action:'reader_level'});assert.equal(r.element,'water');assert.equal(typeof r.level,'number');assert.equal(r.locked,false);
});
test('the relay accepts an element and a level with a submission and refuses unknown ones',async()=>{
 const {validateLeaderboard}=await import('../relay/src/validate.js');
 const now=new Date('2026-11-12T12:00:00Z'),z={characters:0,seconds:0,words:0,streak:0};
 const lb=require('../services/leaderboard.cjs'),keys=lb.periodKeys(now);
 const body={version:1,id:'01234567-89ab-4cde-8f01-23456789abcd',name:'Kazuma',keys:{week:keys.week,month:keys.month},stats:{week:z,month:z,all:z}};
 const plain=validateLeaderboard(body,now);assert.equal(plain.ok,true,plain.error);assert.equal(plain.value.element,'');assert.equal(plain.value.level,0);
 const ok=validateLeaderboard({...body,element:'thunder',level:42},now);assert.equal(ok.ok,true);assert.equal(ok.value.element,'thunder');assert.equal(ok.value.level,42);
 assert.equal(validateLeaderboard({...body,element:'necromancy'},now).error,'INVALID_ELEMENT');
 assert.equal(validateLeaderboard({...body,level:-1},now).error,'INVALID_LEVEL');
});
