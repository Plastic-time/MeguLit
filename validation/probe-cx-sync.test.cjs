// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// 2026-11-16 (#184 #194 #275 #276 #291): a first probe of a cx KiriKiri game read 0 lines and reported "decrypt-failed
// encrypted-archive" because the background cx build was still running when the probe worker returned. The probe now
// builds the cx caches itself before reading.
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const xp3=require('../services/original-engines/xp3.cjs');
const {buildPsb}=require('./helpers/psb-writer.cjs');
const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;};
const chunk=(tag,body)=>Buffer.concat([Buffer.from(tag,'latin1'),u64(body.length),body]);
function writeXp3(file,name,data){
 const at=19,nm=Buffer.from(name,'utf16le'),info=Buffer.concat([Buffer.alloc(4),u64(data.length),u64(data.length),Buffer.from([name.length,0]),nm]);
 const segm=Buffer.concat([Buffer.alloc(4),u64(at),u64(data.length),u64(data.length)]),adlr=Buffer.alloc(4);
 const idx=chunk('File',Buffer.concat([chunk('info',info),chunk('segm',segm),chunk('adlr',adlr)]));
 fs.writeFileSync(file,Buffer.concat([xp3.MAGIC,u64(at+data.length),data,Buffer.from([0]),u64(idx.length),idx]));}
test('probe builds the cx cache itself instead of reporting a running background build as decrypt-failed',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'probecx-')),game=path.join(tmp,'game'),old=process.env.MEGULIT_GARBRO_ROOT;fs.mkdirSync(game);
 const row=ja=>[null,null,[[null,ja]]];
 const doc={name:'001.ks',scenes:[{label:'a',texts:[[null,null,[[null,'「[きょ]今[う]日も暑いね。」'],[null,'It is hot today.'],[null,'今天也很热呢。']],[{voice:'v001'}]],row('「今日も暑いね。」'),row('「そうだね。」'),row('「行こうか。」')]}]};
 writeXp3(path.join(game,'scn.xp3'),'001.ks.scn',buildPsb(doc));
 process.env.MEGULIT_GARBRO_ROOT=path.join(tmp,'nogarbro');
 try{const scenes=require('../services/original-engines/scenes.cjs');
  assert.strictEqual(scenes.cxPrepareSync(game),1);assert.strictEqual(scenes.cxPrepareSync(game),0,'cached once');
  writeXp3(path.join(game,'scn2.xp3'),'002.ks.scn',buildPsb({...doc,name:'002.ks'}));
  assert.strictEqual(scenes.cxPrepareSync(game,{deadline:Date.now()+10000}),1,'finite preparation publishes a complete worker result');
  const [infinite,finite]=scenes.read('kirikiri-cx',game);assert.strictEqual(infinite.zh[0],'今天也很热呢。');assert.deepStrictEqual(infinite.ruby[0],[['今日','きょう']]);assert.strictEqual(infinite.voices[0],'v001');assert.deepStrictEqual(finite.lines,infinite.lines);assert.deepStrictEqual(finite.ruby,infinite.ruby);assert.deepStrictEqual(finite.voices,infinite.voices);assert.deepStrictEqual(finite.zh,infinite.zh);
  const r=require('../services/adapter-probe-core.cjs').probeGame({dir:game,executable:''});
  assert.strictEqual(r.detected,'kirikiri-cx');assert.strictEqual(r.step,'ok');assert.ok(r.lines>=4);
 }finally{if(old===undefined)delete process.env.MEGULIT_GARBRO_ROOT;else process.env.MEGULIT_GARBRO_ROOT=old;}
});
