'use strict';

const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),test=require('node:test');
const kit=require('../services/original-engines/kit.cjs');
const registry=require('../services/original-engines/registry.cjs');
const {probeGame}=require('../services/adapter-probe-core.cjs');
const original=require('../services/original-text.cjs');
const fixtures=require('./helpers/engine-fixtures.cjs');
const nexas=require('./helpers/engine-fixtures-g2.cjs');
const tmr=require('./helpers/engine-fixtures-e.cjs');

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
  'TEXT','/*','TEXT','コメントのままです。','*/',
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
 assert.equal(probeGame({dir}).detected,'sia');
 const state=original.scanRunning(root,'1',executable);
 assert.equal(state.status,'native-japanese');
 assert.deepEqual(JSON.parse(fs.readFileSync(state.runtime.index,'utf8')).lines,[
  '【案内人】\n「ここから始めましょう。」','今日は晴れています。','また明日。','もう一度読みます。',
 ]);
});

test('a PAC beside an unrelated or truncated executable does not claim the SIA reader',t=>{
 const {dir,data,executable,exe}=setup(t);
 assert.notEqual(registry.engineOf(dir)?.name,'SIA-Soft');
 fs.writeFileSync(path.join(data,'start.pac'),kit.encodeSjis('TEXT\r\n今日は晴れています。\r\n'));
 const noMz=Buffer.from(exe);noMz.write('NO');
 const noBrand=Buffer.from(exe);noBrand.write('Different',0x58d20);
 const shortKey=Buffer.from(exe);shortKey[0x59011]=0;
 for(const invalid of [noMz,noBrand,shortKey,exe.subarray(0,exe.length-1)]){
  fs.writeFileSync(executable,invalid);
  assert.notEqual(registry.engineOf(dir)?.name,'SIA-Soft');
  assert.notEqual(probeGame({dir,executable}).detected,'sia');
 }
});

for(const count of [65,129])test('SIA reads dialogue in scene '+count+' at both entries',t=>{
 const {root,dir,data,executable}=setup(t),line='「最後の台詞です。」';
 for(let i=1;i<count;i++)fs.writeFileSync(path.join(data,String(i).padStart(3,'0')+'.pac'),'GOTO\r\n#END');
 fs.writeFileSync(path.join(data,String(count).padStart(3,'0')+'.pac'),kit.encodeSjis('TEXT\r\n'+line+'\r\n'));
 const result=probeGame({dir,executable});
 assert.equal(result.detected,'sia');
 assert.equal(result.japaneseLines,1);
 const state=original.scanRunning(root,'1',executable);
 assert.equal(state.status,'native-japanese');
 assert.deepEqual(JSON.parse(fs.readFileSync(state.runtime.index,'utf8')).lines,[line]);
});

const originalLine='「こちらの原文です。」';
const softpal=fixtures.softpalPair([{kind:'say',text:originalLine}]);
for(const [name,engine,filename,payload] of [
 ['SoftPal','softpal','data.pac',fixtures.softpalPac({'SCRIPT.SRC':softpal.src,'TEXT.DAT':softpal.text})],
 ['NeXAS','nexas','script.pac',nexas.nexasPac({'scene.bin':nexas.nexasBin(['',originalLine])})],
 ['Tmr-Hiro ADV','tmrhiro','srp.pac',tmr.tmrPac({'scene':tmr.srp([tmr.HEADER,tmr.tmrMsg(originalLine)])})],
])test('SIA PAC files leave the existing '+name+' reader selected',t=>{
 const {root,dir,data,executable}=setup(t);
 const other=path.join(dir,'Game.exe');
 fs.writeFileSync(other,'MZ');
 fs.writeFileSync(path.join(dir,filename),payload);
 fs.writeFileSync(path.join(data,'start.pac'),kit.encodeSjis('TEXT\r\n別の台詞です。\r\n'.repeat(5)));
 assert.equal(registry.engineOf(dir)?.name,name);
 assert.equal(probeGame({dir,executable}).detected,engine);
 assert.equal(original.scanRunning(root,'1',other).runtime?.engine,engine);
 const state=original.scanRunning(root,'1',executable);
 assert.equal(state.runtime?.engine,engine);
 assert.ok(original.provider(root,executable,{id:'1'}));
 assert.deepEqual(JSON.parse(fs.readFileSync(state.runtime.index,'utf8')).lines,[originalLine]);
});

for(const [name,files] of [
 ['loose SoftPal scripts',{'SCRIPT.SRC':softpal.src,'TEXT.DAT':softpal.text}],
 ['publisher-named SoftPal PAC',{'named-by-publisher.pac':fixtures.softpalPac({'SCRIPT.SRC':softpal.src,'TEXT.DAT':softpal.text})}],
])test('selecting Game.exe reads '+name+' alongside SIA PAC files',t=>{
 const {root,dir,data,executable:siaExecutable}=setup(t),executable=path.join(dir,'Game.exe');
 fs.writeFileSync(executable,'MZ');
 for(const [file,payload] of Object.entries(files))fs.writeFileSync(path.join(dir,file),payload);
 fs.writeFileSync(path.join(data,'dialogue.pac'),kit.encodeSjis('TEXT\r\n別の台詞です。\r\n'.repeat(5)));
 // This installation can only find SoftPal through the fallback scan.
 assert.deepEqual(registry.readersFor(dir),['sia']);
 const stages=[];
 const result=probeGame({dir,executable},{progress:stage=>stages.push(stage)});
 assert.equal(result.detected,'softpal');
 assert.ok(!result.engines.some(engine=>engine.id==='sia'));
 assert.ok(stages.every(stage=>!stage.routed.includes('sia')&&stage.stage!=='engine:sia'));
 const state=original.scanRunning(root,'1',executable);
 assert.equal(state.runtime?.engine,'softpal');
 assert.deepEqual(JSON.parse(fs.readFileSync(state.runtime.index,'utf8')).lines,[originalLine]);
 const db=gameDb(t,siaExecutable);
 assert.equal(original.status(root,db,'1').runtime?.engine,'sia');
 assert.equal(original.scriptPairs(root,siaExecutable).ja[0],'別の台詞です。');
});

function gameDb(t,executable){
 const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(':memory:');
 t.after(()=>db.close());
 db.exec('CREATE TABLE games (id TEXT,title TEXT,executable TEXT,removed_at TEXT)');
 db.prepare('INSERT INTO games (id,title,executable) VALUES (?,?,?)').run('1','SIA fixture',executable);
 return db;
}

test('a newly recognized SoftPal install invalidates the previously saved SIA index',t=>{
 const {root,dir,data,executable}=setup(t),db=gameDb(t,executable);
 fs.writeFileSync(path.join(data,'dialogue.pac'),kit.encodeSjis('TEXT\r\n別の台詞です。\r\n'));
 fs.writeFileSync(path.join(dir,'SCRIPT.SRC'),softpal.src);
 fs.writeFileSync(path.join(dir,'TEXT.DAT'),softpal.text);
 assert.equal(original.status(root,db,'1').runtime?.engine,'sia');
 fs.writeFileSync(path.join(dir,'PAL.dll'),'MZ');
 assert.equal(original.status(root,db,'1').runtime?.engine,'softpal');
 assert.deepEqual(original.scriptPairs(root,executable).ja,[originalLine]);
});

test('selecting a different program suppresses SIA routing even with an old index and probe result',async t=>{
 const {root,dir,data,exe,executable}=setup(t);
 const other=path.join(dir,'1055.com');
 fs.writeFileSync(other,exe);
 const mtime=new Date('2020-01-01T00:00:00Z');
 for(const file of [executable,other])fs.utimesSync(file,mtime,mtime);
 fs.writeFileSync(path.join(data,'dialogue.pac'),kit.encodeSjis('TEXT\r\n今日は晴れています。\r\n'));
 const db=gameDb(t,executable);
 const probe=require('../services/adapter-probe.cjs');
 const {setTimeout:delay}=require('node:timers/promises');
 const runProbe=async()=>{
  probe.start(root,db);
  const deadline=Date.now()+10000;
  while(probe.status(root).state==='running'&&Date.now()<deadline)await delay(10);
  assert.equal(probe.status(root).state,'done');
  return probe.results(root)['1'];
 };
 t.after(()=>probe.cancel(root));
 assert.equal((await runProbe()).detected,'sia');
 assert.equal(original.status(root,db,'1').runtime?.engine,'sia');
 assert.ok(original.provider(root,executable,{id:'1'}));
 assert.match(original.contributionScript(root,executable,'1'),/^[a-f0-9]{64}$/);
 db.prepare('UPDATE games SET executable=? WHERE id=?').run(other,'1');
 assert.equal(original.provider(root,other,{id:'1'}),null);
 assert.match(original.providerKey(root,other,'1'),/^none\|/);
 assert.equal(original.contributionScript(root,other,'1'),'');
 assert.equal(original.scriptPairs(root,other),null);
 assert.notEqual((await runProbe()).detected,'sia');
 const state=original.status(root,db,'1');
 assert.equal(state.runtime,null);
 assert.equal(state.engine,'');
});

test('a SIA translation PAC is refused through the normal patch entries',async t=>{
 const {root,data,executable}=setup(t);
 fs.writeFileSync(path.join(data,'start.pac'),kit.encodeSjis('TEXT\r\n今日は晴れています。\r\n'));
 const patch=path.join(root,'patch');fs.mkdirSync(patch);
 const source=path.join(patch,'start.pac');fs.writeFileSync(source,'TEXT\r\nTranslation.\r\n');
 const db=gameDb(t,executable);
 assert.throws(()=>original.importPatch(root,db,'1',patch),{message:'PATCH_SCRIPT_NOT_FOUND'});
 await assert.rejects(original.importPatchSource(root,db,'1',source),{message:'PATCH_SCRIPT_NOT_FOUND'});
});
