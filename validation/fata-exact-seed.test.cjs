// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

process.env.MEGULIT_RELAY_BASE='off';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Profiles=require('../core/profiles/index.cjs');
const Seed=require('../core/profiles/seed.cjs');
const auto=require('../core/auto-profile.cjs');
const live=require('../services/self-check-live.cjs');
const draw=require('../core/engine-draw.cjs');
const {GalNative}=require('../core/gal-native.cjs');
const {reasonText}=require('../core/self-check.cjs');

const key='17b5941ae0fe1e46894c34e7f1c5bae9a2ef7cdc85fb490c52e305e2c84bde42';
const input={exe:'D:/Games/Fata/fata_jp.exe',engine:'kirikiri',title:'ファタモルガーナの館'};
const senren='fd37d708774f8f45fa32375ec067f58c04038e17fc1c4e5180e9eed9092434d3';

// Minimal on-disk record from the 03:14:44 owner-test window that reappeared at 06:00:28.
function recordedGate(){
 const gate={window:3,over:['hideVisible','choiceMismatch','pairRate'],
  metrics:{hideVisible:0.667,dropRate:0,repeatRate:0,choiceMismatch:7,positionPx:null,pairRate:0.3}};
 return {schema:1,key,engine:'krkr',exe:'fata_jp.exe',version:'1.4.22',at:'2026-11-22T03:14:44.141Z',
  source:'gate',mode:'read',reason:reasonText(gate.over),settings:{calibrate:{hideMethod:'read'},hide:{textEffectsRead:true}},
  score:{metrics:gate.metrics,over:gate.over,lines:20},candidates:[],gate,previous:null};
}

function rig(t,hookHide=true){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-fata-exact-'));
 t.after(()=>{
  live.stop();
  fs.rmSync(root,{recursive:true,force:true});
 });
 auto.store(root,key,recordedGate());
 const notes=[],logs=[];
 const gal=Object.create(GalNative.prototype);
 Object.assign(gal,{preferences:{hookAutoStart:true,hookHide,hookProfile:hookHide?'embed':'read'},
  notify:m=>notes.push(m),hooks:{trace(){},setProfile(){}}});
 function start(target=input,hash=key){
  const session=live.start({root,gal,logVisibility:m=>logs.push(m)},target.exe,Profiles.profileFor(target),target,{key:hash,skipFeed:true});
  gal.setGameProfile(Profiles.profileFor(live.inputOf(session)),target);
  return session;
 }
 return {start,root,gal,notes,logs};
}

test('bundled KAG choice reporting requires the exact executable and leaves dialogue embed off',()=>{
 const exact=Profiles.profileFor({...input,exeSha256:key});
 const sameName=Profiles.profileFor({...input,exeSha256:'a'.repeat(64)});
 const otherGame=Profiles.profileFor({exe:'D:/Games/SenrenBanka.exe',engine:'kirikiri',exeSha256:senren});
 assert.equal(exact.layers,'core+engine+seed-game+seed');
 assert.equal(draw.settings(exact).roles,true);
 assert.match(draw.krkrControlText(draw.settings(exact),new Map()),/^#cfg roles=1 embed=0 zh=1\r\n#clearline\r\n#choiceframe \^選択肢\$\r\n$/);
 assert.equal(sameName.layers,'core+engine+seed-game');
 assert.equal(draw.settings(sameName).roles,false);
 assert.equal(draw.settings(otherGame).roles,false);
 assert.deepEqual(draw.settings(otherGame).choiceFrames,[]);
});

test('the recorded owner-test trip is skipped only with the repaired bundled draw settings',t=>{
 const r=rig(t),gate=auto.load(r.root,key),session=r.start({exe:'D:/Games/renamed.exe',engine:'krkr'});
 assert.equal(session.from,'seed');
 assert.equal(r.gal.profile.layers,'core+engine+seed-game+seed');
 assert.equal(r.gal.profile.draw.roles,true);
 assert.equal(r.gal.readHint,undefined);
 assert.ok(r.logs.some(m=>m.what==='gateSuperseded'&&m.previousAt===gate.at));
 assert.deepEqual(auto.load(r.root,key),gate,'keep the original gate for the separately authorized owner-test path');

 const version=Seed.seeds().versions.get(key);
 Seed.seeds().versions.set(key,{...version,rev:99,settings:{draw:{embed:false,embedTranslation:true}}});
 try{
  assert.equal(live.choose(session).from,'local-gate','a higher rev with the old content is insufficient');
  assert.deepEqual(live.inputOf(session).stepDown,gate.settings);
 }finally{Seed.seeds().versions.set(key,version);}

 session.shared={source:'official',mode:'hide',version:{source:'official',rev:99,settings:{draw:{roles:true,embed:false}}}};
 assert.equal(live.choose(session).from,'local-gate','a different official version still gets the local gate');
 assert.deepEqual(live.inputOf(session).stepDown,gate.settings);
});

test('real dropped-line replay issues a fresh gate, which persists across exact Seed binds',t=>{
 const r=rig(t);
 assert.equal(r.start().from,'seed');
 const tape=fs.readFileSync(path.join(__dirname,'helpers','selfcheck-replay','incr9-hook-events.log'),'utf8');
 for(const line of tape.split('\n'))if(line>='2026-11-20T22:51:03'&&line<'2026-11-20T22:53:42')live.feedTrace(line);
 const fresh=auto.load(r.root,key);
 assert.equal(fresh.source,'gate');
 assert.ok(fresh.gate.over.includes('dropRate'));
 assert.equal(r.gal.profile.layers,'core+engine+seed-game+seed+stepdown');
 assert.ok(r.gal.readHint);
 assert.equal(r.gal.preferences.hookHide,true,'existing gate issues the hint and preserves the user preference');
 assert.equal(r.start().from,'local-gate');
 assert.deepEqual(auto.load(r.root,key),fresh);
});

test('manual read stays selected and a different KiriKiri EXE keeps its own gate',t=>{
 const r=rig(t,false);
 assert.equal(r.start().from,'seed');
 assert.equal(r.gal.preferences.hookHide,false);
 assert.equal(r.gal.preferences.hookProfile,'read');

 const other={exe:'D:/Games/SenrenBanka.exe',engine:'kirikiri'};
 auto.store(r.root,senren,{...recordedGate(),key:senren,exe:'senrenbanka.exe'});
 assert.equal(r.start(other,senren).from,'local-gate');
 assert.equal(r.gal.profile.layers,'core+engine+seed-game+seed+stepdown');
 assert.equal(r.gal.profile.draw.roles,false);
});
