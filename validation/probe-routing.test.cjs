// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const core=require('../services/adapter-probe-core.cjs'),probe=require('../services/adapter-probe.cjs');
const u32=v=>{const b=Buffer.alloc(4);b.writeUInt32LE(v);return b;};
function pf6(names){const ents=names.map(n=>{const b=Buffer.from(n);return Buffer.concat([u32(b.length),b,u32(0),u32(0),u32(0)]);});const index=Buffer.concat([u32(names.length),...ents]);const h=Buffer.alloc(7);h.write('pf6');h.writeUInt32LE(index.length,3);return Buffer.concat([h,index,Buffer.alloc(8192)]);}
test('a fingerprinted engine whose reader finds nothing is listed as tried, step stays unsupported-engine',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'route-'));fs.writeFileSync(path.join(dir,'root.pfs'),pf6(['image\a.png','sound\b.ogg']));fs.writeFileSync(path.join(dir,'Game.exe'),'MZ');
 const r=core.probeGame({dir,executable:path.join(dir,'Game.exe'),title:'x'});
 assert.strictEqual(r.step,'unsupported-engine');assert.strictEqual(r.detail,'artemis');
 const a=r.engines.find(e=>e.id==='artemis');assert.ok(a,'artemis listed');assert.strictEqual(a.error,'NO_SCENES');assert.ok(r.tried.includes('artemis'));
 fs.rmSync(dir,{recursive:true,force:true});});
test('routedReaders maps fingerprint engines onto reader ids',()=>{
 const inv=a=>({archives:a.map(([name,magic])=>({name,magic})),markers:[]});
 assert.deepStrictEqual(core.routedReaders('',inv([['root.pfs','706636']])).readers.includes('artemis'),true);
 const sig=core.routedReaders('',inv([['Scene.pck','']])),k=core.routedReaders('',inv([['data.xp3','5850330d0a200a1a']]));
 assert.ok(k.readers.includes('kirikiri')&&k.readers.includes('kirikiri-cx'),JSON.stringify(k));
 if(sig.engine==='siglus')assert.ok(sig.readers.includes('siglus-pck'));});
test('budget grows with the game, capped at 4x',()=>{
 assert.strictEqual(core.scaledBudget(60000,{bytes:0,archives:[]}),60000);
 assert.ok(core.scaledBudget(60000,{bytes:8*2**30,archives:new Array(8)})>120000);
 assert.strictEqual(core.scaledBudget(60000,{bytes:999*2**30,archives:[]}),240000);});
test('a timed-out worker reports the stage it was in and what it read',()=>{
 const t=probe.partialResult({stage:'engine:kirikiri-cx',budgetMs:90000,inventory:{files:3,bytes:9,ext:{},archives:[{name:'data.xp3',magic:'5850330d0a200a1a',format:'xp3'}]},engines:[{id:'kirikiri',scenes:0,lines:0,error:'NO_SCENES'}]});
 assert.strictEqual(t.step,'timeout');assert.strictEqual(t.detail,'PER_GAME_BUDGET:engine:kirikiri-cx');assert.strictEqual(t.inventory.files,3);assert.deepStrictEqual(t.tried,['kirikiri']);
 const ok=probe.partialResult({stage:'engine:garbro',engines:[{id:'kirikiri-cx',scenes:40,lines:5000,japaneseLines:4800,dialogueLines:4900,chineseLines:0}],inventory:{files:1,bytes:1,ext:{},archives:[]}});
 assert.strictEqual(ok.step,'ok');assert.strictEqual(ok.detected,'kirikiri-cx');assert.strictEqual(ok.timedOut,'engine:garbro');
 assert.strictEqual(probe.partialResult(null).step,'timeout');});
test('a reader with lines but no dialogue at all has read no text (otomeki #324: encrypted xp3, dump of 254 command lines)',()=>{
 const inv={files:9,bytes:9,ext:{},archives:[{name:'data.xp3',magic:'5850330d0a200a1a',format:'xp3'}],markers:[]};
 const c=core.classify({engines:[{id:'kirikiri-dump',scenes:1,parsed:1,lines:254,japaneseLines:0,dialogueLines:0,chineseLines:0,error:''}],inventory:inv,unsupported:null,preparing:'capture',title:'otomeki'});
 assert.deepStrictEqual(c,{step:'decrypt-failed',detail:'encrypted-archive',detected:null});
 const old=core.classify({engines:[{id:'kirikiri',scenes:3,lines:300,japaneseLines:280}],inventory:inv,unsupported:null,preparing:null,title:'x'});assert.strictEqual(old.step,'ok');});
test('a script archive that starts with zeros is reported as an incomplete file',()=>{
 const c=core.classify({engines:[{id:'siglus',scenes:-1,lines:0,error:'NO_SCENES'}],inventory:{files:2,bytes:9,ext:{},markers:['siglus'],archives:[{name:'Scene.pck',size:9<<20,magic:'0000000000000000',format:''}]},unsupported:null,preparing:null,title:'x'});
 assert.deepStrictEqual(c,{step:'parse-failed',detail:'incomplete-file:Scene.pck',detected:null});});
