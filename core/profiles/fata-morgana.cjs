// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const Profiles=require('./index.cjs');
const {canonical}=require('../game-diff.cjs');
const FATA_EXE='17b5941ae0fe1e46894c34e7f1c5bae9a2ef7cdc85fb490c52e305e2c84bde42';
const legacyResult=canonical({
 settings:{calibrate:{hideMethod:'read'},hide:{textEffectsRead:true}},
 gate:{window:3,over:['hideVisible','choiceMismatch','pairRate'],
  metrics:{hideVisible:0.667,dropRate:0,repeatRate:0,choiceMismatch:7,positionPx:null,pairRate:0.3}},
});

function supersedesGate(input,record){
 // The 03:14 trip was measured with owner-test enabling native embed on this EXE.
 // Keep that receipt on disk for owner-test. The repaired bundled Seed uses a different draw path.
 if(input.exeSha256!==FATA_EXE||record.key!==FATA_EXE||record.source!=='gate'||record.engine!=='krkr'||record.version!=='1.4.22'||
    record.at!=='2026-11-22T03:14:44.141Z'||record.mode!=='read'||record.previous!==null||
    canonical({settings:record.settings,gate:record.gate})!==legacyResult)return false;

 const draw=require('./seed.cjs').versionOf(FATA_EXE)?.settings.draw;
 if(draw?.roles!==true||draw.embed!==false)return false;
 const profile=Profiles.profileFor(input);
 return profile.gameKey==='fata-morgana'&&profile.engine==='kirikiri'&&profile.seedStatus==='owner-ok'&&
  profile.layers.endsWith('+seed-game+seed')&&profile.hide.textEffectsRead===false&&
  profile.page.engineRows===true&&profile.page.reportClear===true&&
  profile.choice.pageFrames.length===1&&profile.choice.pageFrames[0]==='^選択肢$';
}

module.exports={supersedesGate};
