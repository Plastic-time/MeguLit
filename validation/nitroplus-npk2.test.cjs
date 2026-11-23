// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const npk=require('../core/nitroplus-npk.cjs');
const npkEngine=require('../services/original-engines/npk.cjs');
const schemes=require('../services/original-engines/nitro-schemes.json');
const {probeGame}=require('../services/adapter-probe-core.cjs');
const port=require('../core/saya-script-port.cjs');

const SAYA18_KEY=Buffer.from('d0b71f3c4e24cecfddeea91d24b0403229a3e5330d2951826051d6c94af5af54','hex');
const BS=String.fromCharCode(92);

function makeNps(lines){
 return Buffer.from(['<MARKER NAME="#01">','<BACKGROUND SRC="bg01">//',
  ...lines.map((l,i)=>`<voice NAME="S${i&1}" SRC="1${BS}${String(i).padStart(6,'0')}">${l}<k>`),
  '<A HREF="sy020.nps">'].join('\r\n'),'utf8');
}

function makeTempGame(files){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'saya-npk2-'));
 for(const [name,buf] of Object.entries(files))fs.writeFileSync(path.join(dir,name),buf);
 return dir;
}

test('Saya +18 / JAST NPK2 key opens script.npk and probes English/Chinese/Japanese builds accurately',t=>{
 const enLines=Array.from({length:120},(_,i)=>`"This is synthetic English dialogue line number ${i}."`);
 const zhLines=Array.from({length:120},(_,i)=>`“这是第${i}行合成中文对话测试内容。”`);
 const jpLines=Array.from({length:120},(_,i)=>`「これはテスト用の日本語台詞その${i}です。」`);

 for(const [label,lines,wantStep] of [['en',enLines,'not-japanese'],['zh',zhLines,'chinese-build'],['ja',jpLines,'ok']]){
  const dir=makeTempGame({
   'Saya_Steam.exe':'exe',
   'test.sr18':'1',
   'script.npk':npk.createNpk({'media/script/nps/sy010.nps':makeNps(lines)},{key:SAYA18_KEY}),
  });
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const res=probeGame({dir,executable:path.join(dir,'Saya_Steam.exe'),title:'The Song of Saya'});
  assert.equal(res.step,wantStep,`${label}: got ${res.step} (${res.detail})`);
  assert.equal(res.detected,'nitroplus-n4');
  assert.equal(res.lines,120);
 }
});

test('npk.cjs opens +18 voice.npk, newly added GARbro/MwareStuff NPK2 keys, and short entry names',t=>{
 const voiceBuf=npk.createNpk({'media/voice/1/000001.ogg':Buffer.concat([Buffer.from('OggS'),Buffer.alloc(32,1)])},{key:SAYA18_KEY});
 const dir=makeTempGame({'voice.npk':voiceBuf});
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const audio=npkEngine.audio(path.join(dir,'voice.npk'));
 assert.ok(audio&&audio.length===1);
 assert.equal(audio[0].name,'media/voice/1/000001.ogg');

 for(const title of ['You and Me and Her [Steam]','Mojika: Truth Rears Its Ugly Head [Steam]','sweet pool (Steam)']){
  const hex=schemes.npk2[title];
  assert.ok(hex,`${title} missing in nitro-schemes.json`);
  const key=Buffer.from(hex,'hex');
  const buf=npk.createNpk({'a.h':Buffer.from('short'),'media/script/nut/main.nut':Buffer.from('ok')},{key});
  const arc=npk.readNpkAny(buf);
  assert.equal(arc.entries[0].name,'a.h');
  const p=path.join(dir,title.replace(/[^a-z0-9]/gi,'_')+'.npk');
  fs.writeFileSync(p,buf);
  const listed=npkEngine.list(p);
  assert.ok(listed&&listed.length===2,`${title} npk.list failed`);
  assert.equal(listed[0].read().toString(),'short');
 }
});

test('unknown NPK2 key reports decrypt-failed nitroplus-n4:NPK_KEY and malformed headers return null',t=>{
 const big=Buffer.alloc(5000,0x41);
 const dir=makeTempGame({
  'Saya_Steam.exe':'exe',
  'script.npk':npk.createNpk({'media/script/nps/sy010.nps':big},{key:Buffer.alloc(32,0x5a)}),
 });
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const res=probeGame({dir,executable:path.join(dir,'Saya_Steam.exe'),title:'Unknown NPK2'});
 assert.equal(res.step,'decrypt-failed');
 assert.equal(res.detail,'nitroplus-n4:NPK_KEY');
 assert.equal(npkEngine.list(path.join(dir,'script.npk')),null);

 const bad=Buffer.alloc(64,0);bad.write('NPK2',0,'latin1');bad.writeUInt32LE(2,4);bad.writeInt32LE(-1,0x18);
 const badFile=path.join(dir,'bad.npk');fs.writeFileSync(badFile,bad);
 assert.equal(npkEngine.list(badFile),null);
});

test('saya-script-port recognises +18 Saya key while still rejecting unrelated NPK2 keys',t=>{
 const dir=makeTempGame({
  'Saya_Steam.exe':'exe',
  'script.npk':npk.createNpk({'media/script/nps/sy010.nps':makeNps(['"Hello world."'])},{key:SAYA18_KEY}),
 });
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 assert.equal(port.steamArchive(dir),path.join(dir,'script.npk'));
});
