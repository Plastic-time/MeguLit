// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E450 The game's own voice for a line: voice references in scripts, the catalog of a game folder, scan, runtime clips.
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const ref=require('../services/original-engines/voice-ref.cjs'),scenes=require('../services/original-engines/scenes.cjs'),paz=require('../services/original-engines/paz.cjs');
const gv=require('../services/game-voice.cjs');
const OGG=Buffer.concat([Buffer.from('OggS','latin1'),Buffer.alloc(40,1)]);
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'megulit-voice-'));
test('voice-ref: KAG voice tags and name macros give the voice name',()=>{
 assert.equal(ref.fromTag('@voice storage=a001'),'a001');assert.equal(ref.fromTag('[vo s="voice/b02.ogg"]'),'b02');
 assert.equal(ref.fromTag('[playvoice file=MENO_00001.ogg]'),'MENO_00001');assert.equal(ref.fromTag('[nm t="名" s=c03]'),'c03');
 assert.equal(ref.fromTag('[bg storage=room]'),null);assert.equal(ref.fromTag('@playse storage=door'),null);});
test('KAG: the voice goes to the speech after it, through a speaker label line',()=>{
 const p=scenes.parseKs(Buffer.from('@voice storage=a001\n【ティアナ】\n「あい」\nおか\n[vo s=b02]「うえ」[p]\n'));
 assert.deepEqual(p.lines,['【ティアナ】','「あい」','おか','「うえ」']);assert.deepEqual(p.voices,[null,'a001',null,'b02']);
 assert.equal(scenes.parseKs(Buffer.from('あいう\n')).voices,undefined);});
test('paz: the voice column goes with its text',()=>{
 const p=paz.parse(Buffer.from('.message\t40\tsk\\sk1042.ogg\tA\tabc\n.message\t50\t\t\tdef','latin1'));
 assert.deepEqual(p.lines,['A','abc','def']);assert.deepEqual(p.voices,[null,'sk1042',null]);});
test('norm: speaker names, quotes, spaces and end marks do not change the key',()=>{
 assert.equal(gv.keyOf('桜乃「兄さんと過ごす時間」'),gv.keyOf('「兄さんと 過ごす時間。」'));assert.equal(gv.keyOf('あ'),null);});
test('scan and find: a voice in a folder is copied out once, a runtime clip never replaces it',()=>{
 const root=tmp(),dir=tmp();gv._reset();fs.mkdirSync(path.join(dir,'voice'));fs.writeFileSync(path.join(dir,'voice','A001.ogg'),OGG);
 const list=[{name:'s.ks',lines:['「こんにちは、','元気？」','ひとり言'],voices:['a001',null,'zz9']}];
 const r=gv.scan(root,dir,{engine:'kirikiri',scenes:list});assert.deepEqual([r.lines,r.voiced,r.found],[3,2,1]);
 const hit=gv.find(root,'「こんにちは、元気？」');assert.ok(hit);assert.equal(hit.source,'scan');assert.equal(hit.mime,'audio/ogg');
 assert.ok(gv.find(root,'こんにちは、'));fs.rmSync(path.join(dir,'voice'),{recursive:true});gv._reset();
 assert.equal(gv.find(root,'こんにちは、').source,'scan');
 assert.equal(gv.remember(root,'こんにちは、',OGG),false);
 const wav=Buffer.concat([Buffer.from('RIFF\0\0\0\0WAVE','latin1'),Buffer.alloc(32)]);assert.equal(gv.remember(root,'ひとり言です',wav.toString('base64')),true);
 const rt=gv.find(root,'ひとり言です');assert.equal(rt.source,'runtime');assert.equal(rt.mime,'audio/wav');assert.equal(gv.find(root,'知らない台詞'),null);});
test('catalog: RealLive/Siglus .ovk clips are numbered file*100000+id',()=>{
 const dir=tmp();const h=Buffer.alloc(4+16);h.writeUInt32LE(1,0);h.writeUInt32LE(OGG.length,4);h.writeUInt32LE(20,8);h.writeUInt32LE(7,12);
 fs.writeFileSync(path.join(dir,'z0414.ovk'),Buffer.concat([h,OGG]));const c=gv.catalog(dir);assert.deepEqual(c.get('koe:41400007')(),OGG);assert.equal(c.get('koe:1'),null);});
test('kind: only clips a browser plays',()=>{assert.equal(gv.kind(OGG).ext,'.ogg');assert.equal(gv.kind(Buffer.alloc(20)),null);});
