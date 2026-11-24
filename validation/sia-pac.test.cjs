'use strict';

const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),test=require('node:test');
const kit=require('../services/original-engines/kit.cjs');
const registry=require('../services/original-engines/registry.cjs');
const {probeGame}=require('../services/adapter-probe-core.cjs');
const original=require('../services/original-text.cjs');

function setup(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sia-pac-')),dir=path.join(root,'game');
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const data=path.join(dir,'data');
 fs.mkdirSync(data,{recursive:true});
 const key=Buffer.from(Array.from({length:400},(_,i)=>1+i%251));
 const executable=path.join(dir,'1055.exe'),exe=Buffer.alloc(0x59010+401);
 exe.write('MZ');exe.write('SIA-Soft\0',0x58d20);key.copy(exe,0x59010);
 fs.writeFileSync(executable,exe);
 return {root,dir,data,key,executable,exe};
}

test('SIA retail layout supplies the probe and Original Text entry',t=>{
 const {root,dir,data,key,executable}=setup(t);
 const script=kit.encodeSjis([
  '/*','TEXT','表示されないコメントです。','*/',
  '#BEGIN','CASE','1','選択肢です。','start.pac*BEGIN',
  'TEXT','【案内人】\\n「ここから始めましょう。」@voice01.wav',
  'TEXT_NO_INP','今日は晴れています。',
  'ADD_TEXT','また明日。',
  'TEXT',
 ].join('\r\n'));
 const packed=Buffer.alloc(script.length+1);
 for(let i=0;i<script.length;i++)packed[i+1]=script[i]^((~key[i%key.length])&255);
 fs.writeFileSync(path.join(data,'start.pac'),packed);
 fs.writeFileSync(path.join(data,'title.pac'),kit.encodeSjis('TEXT\r\nもう一度読みます。\r\n'));
 fs.writeFileSync(path.join(dir,'outside.pac'),kit.encodeSjis('TEXT\r\n対象外です。\r\n'));
 assert.equal(registry.engineOf(dir)?.name,'SIA-Soft');
 assert.deepEqual(registry.readersFor(dir),['sia']);
 const result=probeGame({dir,executable});
 assert.equal(result.step,'ok');
 assert.equal(result.detected,'sia');
 assert.equal(result.engines.find(e=>e.id==='sia').scenes,2);
 assert.equal(result.japaneseLines,4);
 const state=original.scanRunning(root,'1',executable);
 assert.equal(state.status,'native-japanese');
 assert.deepEqual(JSON.parse(fs.readFileSync(state.runtime.index,'utf8')).lines,[
  '【案内人】\n「ここから始めましょう。」','今日は晴れています。','また明日。','もう一度読みます。',
 ]);
});

test('a PAC beside an unrelated or truncated executable does not claim the SIA reader',t=>{
 const {dir,data,executable,exe}=setup(t);
 fs.writeFileSync(path.join(data,'start.pac'),kit.encodeSjis('TEXT\r\n今日は晴れています。\r\n'));
 exe.write('Different',0x58d20);
 fs.writeFileSync(executable,exe);
 assert.notEqual(registry.engineOf(dir)?.name,'SIA-Soft');
 assert.notEqual(probeGame({dir,executable}).detected,'sia');
 exe.write('SIA-Soft\0',0x58d20);
 fs.writeFileSync(executable,exe.subarray(0,exe.length-1));
 assert.notEqual(registry.engineOf(dir)?.name,'SIA-Soft');
 assert.notEqual(probeGame({dir,executable}).detected,'sia');
});
