// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E297: KiriKiri Z games with Hxv4 archives (cxdec v2, サノバウィッチ). The game's own plug-in reads every scene file
// (native/scncapture), and MeguLit does that once in the background when the library finds such a game (cold run).
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const xp3=require('../services/original-engines/xp3.cjs');
const {buildPsb}=require('./helpers/psb-writer.cjs');
const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;};
const chunk=(tag,body)=>Buffer.concat([Buffer.from(tag,'latin1'),u64(body.length),body]);

// E297 A: Hxv4 archives, read whole by the game's own cxdec plug-in while it runs (native/scncapture).
test('Hxv4 dump: 32-bit only, every engine call guarded, files saved where kirikiri-dump reads them',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','native','scncapture','ScnCapture.cpp'),'utf8');
 const block=src.slice(src.indexOf('E297 whole Hxv4 archives'),src.indexOf('// ---- scenes MeguLit asks for'));
 assert.match(block,/#if defined\(_M_IX86\)/);
 for(const fn of ['CallIndex','CallStream','CallNormalize','CallAppPath','GetCount','GetItem','ReadHead','FindPattern']){
  const at=block.search(new RegExp('[ *]'+fn+'\\('));assert.ok(at>=0,fn+' defined');
  const body=block.slice(block.indexOf('{',at),block.indexOf('{',at)+40);assert.match(body,/^\{\s*__try/,fn+' is guarded');}
 assert.match(block,/hx-%s-%llu\.scn/);
 assert.match(block,/hx-done-/,'runs once per archive');
 assert.match(src,/if \(InterlockedExchange\(&HxWanted, 0\)\) \{ LastAsk = GetTickCount\(\); DumpHx\(\);/,'on the game thread');
});

test('kirikiri-dump reads hx-*.scn files saved by the dump',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hxcap-')),game=fs.mkdtempSync(path.join(os.tmpdir(),'hxgame-'));
 process.env.MEGULIT_SCN_CAPTURE=root;
 try{
  const scenes=require('../services/original-engines/scenes.cjs'),dump=scenes.ENGINES['kirikiri-dump'],dir=dump.captureDir(game);fs.mkdirSync(dir,{recursive:true});
  const row=(ja,zh)=>[null,null,[[null,ja],[null,'Morning.'],[null,zh],[null,zh]]];
  const doc={name:'001_hx.ks',scenes:[{label:'a',texts:[row('「おはよう。」','「早上好。」'),row('「今日も暑いね。」','「今天也很热呢。」'),row('「そうだね。」','「是啊。」'),row('「行こうか。」','「走吧。」')]}]};
  fs.writeFileSync(path.join(dir,'hx-scn.xp3-20481.scn'),buildPsb(doc));
  const list=dump.scenes(game);assert.strictEqual(list.length,1);
  const parsed=dump.parse(list[0].read());assert.strictEqual(parsed.lines[0],'「おはよう。」');assert.strictEqual(parsed.zh[0],'「早上好。」');
 }finally{delete process.env.MEGULIT_SCN_CAPTURE;}
});

// E297 cold run: Hxv4 games found by the library are read once in the background.
function hxXp3(file){const idx=Buffer.concat([chunk('Hxv4',Buffer.alloc(14)),chunk('File',Buffer.alloc(0))]);fs.writeFileSync(file,Buffer.concat([xp3.MAGIC,u64(19),Buffer.from([0]),u64(idx.length),idx]));}
function fakeGame(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hxcold-'));hxXp3(path.join(dir,'scn.xp3'));hxXp3(path.join(dir,'bgimage.xp3'));
 const pe=Buffer.alloc(512);pe.write('MZ',0,'latin1');pe.writeUInt32LE(0x80,0x3c);pe.write('PE\0\0',0x80,'latin1');pe.writeUInt16LE(0x14c,0x84);fs.writeFileSync(path.join(dir,'game.exe'),pe);return dir;}
test('cold run: Hxv4 scene archives are found, media archives are not',()=>{
 const cold=require('../services/kirikiri-cold.cjs'),dir=fakeGame();
 assert.deepStrictEqual(xp3.indexTags(path.join(dir,'scn.xp3')),['Hxv4','File']);
 assert.deepStrictEqual(cold.hxArchives(dir),['scn.xp3']);
 assert.strictEqual(cold.bitness(path.join(dir,'game.exe')),'32');
});
test('cold run: once per game, off when the setting is off, a failure is not retried unless asked',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hxroot-')),cap=fs.mkdtempSync(path.join(os.tmpdir(),'hxcap-'));process.env.MEGULIT_SCN_CAPTURE=cap;
 const native=path.join(__dirname,'..','native'),made=[];for(const f of ['ColdCapture32.exe','MeguLitScn32.dll']){const p=path.join(native,f);if(!fs.existsSync(p)){fs.writeFileSync(p,'x');made.push(p);}}
 try{
  const cold=require('../services/kirikiri-cold.cjs'),scenes=require('../services/original-engines/scenes.cjs'),dir=fakeGame(),game={id:'g1',executable:path.join(dir,'game.exe')};
  assert.strictEqual(cold.consider(root,game,{enabled:false}),false);
  const runs=[];let outcome='timeout';
  cold._setRunner((job,report,done)=>{runs.push({job,report});setImmediate(()=>{if(outcome==='done'){const d=scenes.ENGINES['kirikiri-dump'].captureDir(dir);fs.writeFileSync(path.join(d,'hx-done-scn.xp3.txt'),'done');}done(outcome);});},()=>false);
  const settle=()=>new Promise(r=>{const stop=cold.onDone(()=>{stop();r();});});
  let wait=settle();assert.strictEqual(cold.consider(root,game),true);assert.strictEqual(cold.status(root,game.executable).state,'preparing');await wait;
  assert.strictEqual(runs.length,1);assert.strictEqual(cold.status(root,game.executable).result,'timeout');
  assert.strictEqual(cold.consider(root,game),false,'a failure is not retried by itself');
  outcome='done';wait=settle();assert.strictEqual(cold.consider(root,game,{force:true}),true);await wait;
  assert.strictEqual(cold.status(root,game.executable).state,'ready');assert.ok(cold.prepared(dir));
  assert.strictEqual(cold.consider(root,game,{force:true}),false,'prepared games are not run again');
  assert.strictEqual(runs.length,2);
 }finally{delete process.env.MEGULIT_SCN_CAPTURE;for(const p of made)fs.rmSync(p,{force:true});}
});
test('cold run helper: suspended start, minimised without focus, muted, ended after the report; DLL reports in cold mode',()=>{
 const cs=fs.readFileSync(path.join(__dirname,'..','native','ColdCapture.cs'),'utf8'),cpp=fs.readFileSync(path.join(__dirname,'..','native','scncapture','ScnCapture.cpp'),'utf8');
 assert.match(cs,/CREATE_SUSPENDED\|CREATE_UNICODE_ENVIRONMENT/);assert.match(cs,/SW_SHOWMINNOACTIVE/);assert.match(cs,/SetMute\(true/);assert.match(cs,/TerminateProcess\(pi\.hProcess,0\)/);
 assert.match(cs,/env\["MEGULIT_COLD"\]="1"/);assert.match(cs,/"steam":"exited"/);
 assert.match(cpp,/GetEnvironmentVariableW\(L"MEGULIT_COLD"/);assert.match(cpp,/Report\("done"\)/);assert.match(cpp,/Report\("no-hx"\)/);assert.match(cpp,/Report\("no-exporter"\)/);
 const build=fs.readFileSync(path.join(__dirname,'..','Build.ps1'),'utf8'),rel=fs.readFileSync(path.join(__dirname,'..','Release.ps1'),'utf8');
 assert.match(build,/'ColdCapture32\.exe','\/platform:x86','ColdCapture\.cs'/);assert.match(rel,/'native\/ColdCapture32\.exe','native\/ColdCapture64\.exe'/);
});
test('cold run setting: on by default, explained, wired to the scan and the dialog',()=>{
 const {cleanPreferences}=require('../core/preferences.cjs');assert.strictEqual(cleanPreferences({scriptColdRun:false}).scriptColdRun,false);
 assert.match(fs.readFileSync(path.join(__dirname,'..','services','settings.cjs'),'utf8'),/scriptColdRun:true/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','services','settings-schema.cjs'),'utf8'),/bool\('translation','scriptColdRun','后台准备加密剧本'/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','web','settings-help.js'),'utf8'),/"scriptColdRun":\["/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','services','runtime.cjs'),'utf8'),/cold\.considerLibrary\(this\.root/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8'),/cold\.consider\(root,row,\{enabled:coldOn,force:!!request\.search\}\)/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','web','game-language.js'),'utf8'),/s\?\.cold\?\.state==='preparing'/);
});
