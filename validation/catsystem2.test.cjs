'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const cs2=require('../services/original-engines/catsystem2.cjs');
// E356: CatSystem2 text cleanup and the CatSystem2 Mersenne Twister seeding (old sgenrand, 69069).
test('CatSystem2 text codes and ruby',()=>{
 assert.equal(cs2._internal.clean(String.raw`[冷凍睡眠装置/コールドスリープ]に入る\n[た/・]だの\@`),'冷凍睡眠装置に入る\nただの');
 const r=cs2.parse(Buffer.from(JSON.stringify({ja:['[凛音/リンネ]が来た'],zh:['凛音来了']})));
 assert.deepEqual(r.lines,['凛音が来た']);assert.deepEqual(r.zh,['凛音来了']);assert.deepEqual(r.ruby,[[['凛音','リンネ']]]);
 const t=cs2._internal.twister(1);assert.equal(typeof t(),'number');
});
const island='E:/GAL/ISLAND/ISLAND';
test('ISLAND: encrypted scene.int and the Chinese cnscene.int pair line by line',{skip:!fs.existsSync(island+'/cnscene.int')&&'no local copy'},()=>{
 const sc=cs2.scenes(island);assert.equal(sc.length,499);
 const r=cs2.parse(sc[2].read());const k=r.lines.indexOf('胸元を見下ろす。');assert.ok(k>=0);assert.equal(r.zh[k],'低头，向胸口看去。');
});
