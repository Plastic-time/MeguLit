// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 1.4.22 test (owner): ファタモルガーナの館 showed only the Chinese, its Japanese gone from the dialogue box
   (「私のすべては、消滅した。」). The owner's run E:\MeguLit-Test-1421\logs 02:14-02:27Z: the profile was
   `layers=core+engine+auto+seed-game+seed` with the seed's status `read` (seed-all's verdict from an incr9 sample, older than the
   Fata fixes) and this PC's stored calibration `mode=read` (first window pair=0.05: the opening effects), so the game ran in read
   mode (MeguLit shows the translation only, the game's text should stay) while the KiriKiri page DLL kept hiding the lines
   (krkr draws=401 hidden=321): nobody drew the Japanese. In incr12 (no seed) the hide mode with the reader drawing the Japanese
   worked. Replayed here: the seed (owner-ok, hide) and this PC's stored read calibration from that log. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
module.exports=async({assert,root})=>{
 const Profiles=require(path.join(root,'core/profiles/index.cjs')),live=require(path.join(root,'services/self-check-live.cjs')),auto=require(path.join(root,'core/auto-profile.cjs'));
 const KEY='17b5941ae0fe1e46894c34e7f1c5bae9a2ef7cdc85fb490c52e305e2c84bde42',input={exe:'D:/Games/Fata/fata_jp.exe',engine:'KiriKiri',title:'ファタモルガーナの館'};
 const base=Profiles.profileFor(input);assert.equal(base.gameKey,'fata-morgana');assert.equal(base.seedStatus,'owner-ok');assert.equal(base.hide.textEffectsRead,false,'the seed is hide mode');
 for(const k of [['page','pairByDrawn'],['page','keepHeld'],['choice','contentInterleave'],['choice','dropEffectFrames'],['safeMode','effectJudge']])assert.equal(base[k[0]][k[1]],true,k.join('.'));
 /* this PC's calibration as the owner's log stored it */
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-fata-seed-'));
 auto.store(dir,KEY,{schema:auto.SCHEMA,key:KEY,engine:'kirikiri',exe:'fata_jp.exe',version:'1.4.22',at:new Date().toISOString(),source:'calibration',mode:'read',reason:'游戏原文和阅读层的句子对不上（配对率低）',
  settings:{calibrate:{positionSource:null,textBox:{x:220,y:488,w:130,h:22,client:[804,604]},hideMethod:'read'},page:{effectFrames:null},hide:{textEffectsRead:true}},score:{cost:1},candidates:[]});
 const calls=[],profiles=[];const reader={root:dir,logVisibility(){},gal:{textEffects:(on,why)=>calls.push([on,why]),setGameProfile:p=>profiles.push(p),hooks:{trace(){}}}};
 const s=live.start(reader,input.exe,base,{...input},{skipFeed:true,key:KEY});
 try{
  assert.equal(s.from,'seed','the owner-ok seed is official: this PC\'s read calibration does not take over');
  assert.deepEqual(calls,[],'no read mode');
  const p=Profiles.profileFor(live.inputOf(s));assert.equal(p.hide.textEffectsRead,false);assert.ok(!/\+auto/.test(p.layers),'the stored calibration is not layered under the seed: '+p.layers);
  assert.equal(s.check.recording,null,'nothing to calibrate under an official seed');
 }finally{live.stop();}
 /* the owner's first window of that run (02:14:27-02:15:18Z, pair=0.05 over=pairRate, drop=0: every line was drawn): under the
    owner-ok seed the gate keeps the hide mode, nothing is calibrated into read */
 {const fresh=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-fata-gate-'));const c2=[];const r2={root:fresh,logVisibility(){},gal:{textEffects:(on)=>c2.push(on),setGameProfile(){},hooks:{pageMode:{engine:'krkr'},trace(){}}}};
  live.start(r2,input.exe,base,{...input},{skipFeed:true,key:KEY});
  try{for(const l of fs.readFileSync(path.join(__dirname,'owner-20261121T0214.hook-events.txt'),'utf8').split(String.fromCharCode(10)))if(l.trim())live.feedTrace(l);
   assert.deepEqual(c2,[],'no read mode');assert.equal(auto.load(fresh,KEY),null,'no read calibration or step-down stored');assert.equal(live.current().from,'seed');}finally{live.stop();}}
 /* a gate step-down of this PC still wins over the seed (it can always fall back) */
 auto.store(dir,KEY,{...auto.load(dir,KEY),source:'gate'});const g=live.start(reader,input.exe,base,{...input},{skipFeed:true,key:KEY});
 try{assert.equal(g.from,'local-gate');assert.ok(calls.some(c=>c[0]===true));}finally{live.stop();}
};
