'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const nani=require('../services/original-engines/naninovel.cjs');
// E355: a Naninovel localization document gives the Japanese source and the release's own translation per line.
test('Naninovel localization document',()=>{
 const doc="; 日本語 <ja> to 简体中文 <zh-Hans> localization document for 'A/B' Naninovel scenario script\n\n# B_Ema001\n; > Ema: |#B_Ema001|\n; （このあたりを歩くの苦手なんだよな）\n（我还是有点害怕在这附近走动）\n\n# B_Narrative001\n; 見張りのためか、<br>いつのっそりと。\n看守经常会来。<br>\n它什么时候。\n";
 const r=nani.parse(Buffer.from(doc));
 assert.deepEqual(r.lines,['（このあたりを歩くの苦手なんだよな）','見張りのためか、\nいつのっそりと。']);
 assert.deepEqual(r.zh,['（我还是有点害怕在这附近走动）','看守经常会来。\n它什么时候。']);
 assert.deepEqual(r.anchors,['B_Ema001','B_Narrative001']);
});
const game='e:/steam/steamapps/common/manosaba_game';
test('魔法少女ノ魔女裁判 (Steam): localization bundles are read',{skip:!fs.existsSync(game)&&'no local copy'},()=>{
 const sc=nani.scenes(game);assert.ok(sc.length>100);const r=nani.parse(sc.find(s=>/Adv29/.test(s.name)).read());
 assert.equal(r.lines[0],'（このあたりを歩くの苦手なんだよな）');assert.equal(r.zh[0],'（我还是有点害怕在这附近走动）');
});
