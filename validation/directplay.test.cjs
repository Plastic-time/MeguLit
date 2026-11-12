// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-12 沙耶の唄 (2003) loaded dpnhpast.dll, Windows' DirectPlay stub opened its install window and wanted a restart.
   prepare() must place the real staged DLL, or the decline DLL for a name-only load, and report an imported one as missing. */
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dp=require('../core/directplay.cjs'),ROOT=path.join(__dirname,'..');
function pe32({imports=[],strings=[],clr=''}={}){
 /* a minimal 32-bit PE: one section holding an import directory and the strings */
 const b=Buffer.alloc(0x800);b.write('MZ',0,'latin1');b.writeUInt32LE(0x80,0x3c);b.write('PE\0\0',0x80,'latin1');
 b.writeUInt16LE(0x14c,0x84);b.writeUInt16LE(1,0x86);b.writeUInt16LE(224,0x94);const opt=0x98;b.writeUInt16LE(0x10b,opt);
 const sec=opt+224;b.write('.rdata',sec,'latin1');b.writeUInt32LE(0x600,sec+8);b.writeUInt32LE(0x1000,sec+12);b.writeUInt32LE(0x600,sec+16);b.writeUInt32LE(0x200,sec+20);
 const dirAt=0x200,namesAt=0x400;let name=namesAt;imports.forEach((n,i)=>{b.write(n+'\0',name,'latin1');b.writeUInt32LE(0x1000+(name-0x200),dirAt+i*20+12);name+=n.length+1;});
 if(imports.length){b.writeUInt32LE(0x1000,opt+96+8);b.writeUInt32LE((imports.length+1)*20,opt+96+12);}
 if(clr){/* a .NET header at file 0x5c0 pointing at metadata at 0x5e0 (the section maps file 0x200 to RVA 0x1000) */
  b.writeUInt32LE(0x1000+0x3c0,opt+96+14*8);b.writeUInt32LE(72,opt+96+14*8+4);b.writeUInt32LE(0x1000+0x3e0,0x5c0+8);
  b.writeUInt32LE(0x424a5342,0x5e0);b.writeUInt32LE(12,0x5e0+12);b.write(clr,0x5e0+16,'latin1');}
 let s=0x700;for(const t of strings){b.write(t+'\0',s,'latin1');s+=t.length+1;}return b;
}
function setup({payload=false}={}){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-dp-')),game=path.join(base,'game'),win=path.join(base,'Windows');
 fs.mkdirSync(game);fs.mkdirSync(path.join(win,'SysWOW64'),{recursive:true});fs.mkdirSync(path.join(win,'WinSxS'),{recursive:true});
 const stub=Buffer.concat([Buffer.alloc(64),Buffer.from('DirectPlay Stub','utf16le'),Buffer.from('wcodstub.dll','latin1')]);
 for(const n of ['dplayx','dpnhpast'])fs.writeFileSync(path.join(win,'SysWOW64',n+'.dll'),stub);
 if(payload){for(const [d,n] of [['x86_microsoft-windows-d..directplay4-payload_31bf_10.0.1_none_a','dplayx'],['x86_microsoft-windows-d..directplay8-payload_31bf_10.0.1_none_b','dpnhpast']]){fs.mkdirSync(path.join(win,'WinSxS',d));fs.writeFileSync(path.join(win,'WinSxS',d,n+'.dll'),'REAL '+n);}}
 return {base,game,win};
}
test('a name-only DirectPlay load gets the decline DLL, so Windows opens no install window',()=>{
 const {game,win}=setup();fs.writeFileSync(path.join(game,'system.dll'),pe32({imports:['KERNEL32.dll'],strings:["Couldn't LoadLibrary dpnhpast.dll",'dpnhpast.dll']}));
 const r=dp.prepare(game,{root:ROOT,windows:win});
 assert.deepStrictEqual(r,{copied:[],declined:['dpnhpast.dll'],missing:[]});
 assert.ok(fs.readFileSync(path.join(game,'dpnhpast.dll')).equals(fs.readFileSync(path.join(ROOT,'native','MeguLitDpDecline32.dll'))));
 assert.deepStrictEqual(dp.prepare(game,{root:ROOT,windows:win}),{copied:[],declined:[],missing:[]},'nothing is placed twice');
});
test('a staged real DLL (installed, PC not restarted) is copied next to the game and replaces a decline DLL',()=>{
 const {game,win}=setup();fs.writeFileSync(path.join(game,'system.dll'),pe32({strings:['dpnhpast.dll']}));
 dp.prepare(game,{root:ROOT,windows:win});
 const d='x86_microsoft-windows-d..directplay8-payload_31bf_10.0.1_none_b';fs.mkdirSync(path.join(win,'WinSxS',d));fs.writeFileSync(path.join(win,'WinSxS',d,'dpnhpast.dll'),'REAL dpnhpast');
 assert.deepStrictEqual(dp.prepare(game,{root:ROOT,windows:win}).copied,['dpnhpast.dll']);
 assert.strictEqual(fs.readFileSync(path.join(game,'dpnhpast.dll'),'latin1'),'REAL dpnhpast');
});
test('an imported DirectPlay DLL with nothing staged is reported, never declined (the game could not start)',()=>{
 const {game,win}=setup();fs.writeFileSync(path.join(game,'game.exe'),pe32({imports:['DPLAYX.dll','KERNEL32.dll']}));
 assert.deepStrictEqual(dp.prepare(game,{root:ROOT,windows:win}),{copied:[],declined:[],missing:['dplayx.dll']});
 assert.ok(!fs.existsSync(path.join(game,'dplayx.dll')));
 const staged=setup({payload:true});fs.writeFileSync(path.join(staged.game,'game.exe'),pe32({imports:['DPLAYX.dll']}));
 assert.deepStrictEqual(dp.prepare(staged.game,{root:ROOT,windows:staged.win}).copied,['dplayx.dll']);
});
test('nothing happens when Windows has the real DLLs, or a file of that name is already in the game folder',()=>{
 const {game,win}=setup();fs.writeFileSync(path.join(win,'SysWOW64','dpnhpast.dll'),'REAL');fs.writeFileSync(path.join(game,'a.dll'),pe32({strings:['dpnhpast.dll','dplayx.dll']}));
 fs.writeFileSync(path.join(game,'dplayx.dll'),'the game ships its own');
 assert.deepStrictEqual(dp.prepare(game,{root:ROOT,windows:win}),{copied:[],declined:[],missing:[]});
 assert.strictEqual(fs.readFileSync(path.join(game,'dplayx.dll'),'latin1'),'the game ships its own');
});
test('a program in a subfolder gets the DLL in its own folder, where Windows looks first',()=>{
 const {game,win}=setup();fs.mkdirSync(path.join(game,'bin'));fs.writeFileSync(path.join(game,'bin','game.exe'),pe32({strings:['dpnhpast.dll']}));
 const r=dp.prepare(game,{root:ROOT,windows:win});
 assert.deepStrictEqual(r.declined.sort(),['bin/dpnhpast.dll','dpnhpast.dll']);
 assert.ok(fs.existsSync(path.join(game,'bin','dpnhpast.dll')));
});
test('after a launch made Windows ask for DirectPlay (a packed program), every DirectPlay DLL is placed',()=>{
 const {game,win}=setup();fs.writeFileSync(path.join(game,'packed.exe'),pe32());
 assert.deepStrictEqual(dp.prepare(game,{root:ROOT,windows:win}).declined,[]);
 require('../core/compat-manifest.cjs').remember(game,'DirectPlay');
 assert.deepStrictEqual(dp.prepare(game,{root:ROOT,windows:win,exe:path.join(game,'packed.exe')}).declined.sort(),['dplayx.dll','dpnhpast.dll'],'the names whose system copy is a stub');
});
const wf=require('../core/windows-features.cjs');
test('a .NET 2.0 program on a PC without .NET 3.5 runs on .NET 4 instead of asking Windows for 3.5',()=>{
 const {game,win}=setup();fs.writeFileSync(path.join(game,'net2.exe'),pe32({imports:['mscoree.dll'],clr:'v2.0.50727'}));fs.writeFileSync(path.join(game,'net4.exe'),pe32({clr:'v4.0.30319'}));fs.writeFileSync(path.join(game,'native.exe'),pe32());
 assert.strictEqual(dp.pe(fs.readFileSync(path.join(game,'net2.exe'))).clr,'v2.0.50727');
 assert.deepStrictEqual(wf.prepareDotnet(game,{windows:win}),['net2.exe.config']);
 assert.match(fs.readFileSync(path.join(game,'net2.exe.config'),'utf8'),/useLegacyV2RuntimeActivationPolicy="true">\s*<supportedRuntime version="v4.0"\/>/);
 assert.deepStrictEqual(wf.prepareDotnet(game,{windows:win}),[],'once');
 const has=setup();for(const f of ['Framework','Framework64']){fs.mkdirSync(path.join(has.win,'Microsoft.NET',f,'v2.0.50727'),{recursive:true});fs.writeFileSync(path.join(has.win,'Microsoft.NET',f,'v2.0.50727','mscorwks.dll'),'x');}
 fs.writeFileSync(path.join(has.game,'net2.exe'),pe32({clr:'v2.0.50727'}));assert.deepStrictEqual(wf.prepareDotnet(has.game,{windows:has.win}),[],'.NET 3.5 installed: nothing to do');
});
test("a game's own .config keeps its settings and gains .NET 4; the original is kept for undo",()=>{
 assert.strictEqual(wf.runtimeConfig('<configuration><appSettings/></configuration>'),'<configuration><startup useLegacyV2RuntimeActivationPolicy="true"><supportedRuntime version="v4.0"/></startup><appSettings/></configuration>');
 assert.strictEqual(wf.runtimeConfig('<configuration><startup><supportedRuntime version="v2.0.50727"/></startup></configuration>'),'<configuration><startup useLegacyV2RuntimeActivationPolicy="true"><supportedRuntime version="v4.0"/><supportedRuntime version="v2.0.50727"/></startup></configuration>');
 assert.strictEqual(wf.runtimeConfig('<configuration><startup><supportedRuntime version="v4.0"/></startup></configuration>'),null);
 const {game,win}=setup();fs.writeFileSync(path.join(game,'g.exe'),pe32({clr:'v2.0.50727'}));fs.writeFileSync(path.join(game,'g.exe.config'),'<configuration><appSettings/></configuration>');
 wf.prepareDotnet(game,{windows:win});
 assert.strictEqual(require('../core/compat-manifest.cjs').read(game).configs['g.exe.config'],'<configuration><appSettings/></configuration>');
});
test('a Windows feature window the game opens is closed and remembered; one from elsewhere is left alone',async()=>{
 const {game}=setup(),killed=[],asked=[];fs.mkdirSync(path.join(game,'sys'));fs.writeFileSync(path.join(game,'sys','saya.exe'),pe32());
 /* as seen live: Fondue is started by svchost (PcaSvc) and names the program that asked */
 const svc='C:\\Windows\\system32\\svchost.exe';
 const list=async()=>[{pid:11,cmd:'Fondue.exe /enable-feature:DirectPlay /show-caller /top-most /caller-name:"saya.exe"',parentPath:svc},
  {pid:12,cmd:'Fondue.exe /enable-feature:DirectPlay /show-caller /top-most /caller-name:"otherapp.exe"',parentPath:svc},
  {pid:13,cmd:'Fondue.exe /enable-feature:NetFx3 /caller-name:mscoreei.dll',parentPath:svc}];
 const w=wf.watch(game,{list,kill:async pid=>killed.push(pid),interval:5,onFeature:f=>asked.push(f)});
 await new Promise(r=>setTimeout(r,60));w.stop();
 assert.deepStrictEqual(killed,[11,13]);assert.deepStrictEqual(w.found,['DirectPlay','NetFx3']);assert.deepStrictEqual(asked,['DirectPlay','NetFx3']);
 assert.deepStrictEqual(require('../core/compat-manifest.cjs').read(game).features,['DirectPlay','NetFx3']);
 assert.strictEqual(wf.callerOf('Fondue.exe /enable-feature:DirectPlay /caller-name:"saya.exe"'),'saya.exe');
 assert.strictEqual(wf.featureOf('fondue.exe /enable-feature:DirectPlay /caller-name:x'),'DirectPlay');
});
test('the feature install refuses a malformed name and passes /NoRestart',async()=>{
 await assert.rejects(wf.install('a b; rm'),/WINDOWS_FEATURE_UNKNOWN/);
 let command='';await wf.install('NetFx3',{run:async c=>{command=c;return 3010;}});
 assert.match(command,/\/FeatureName:NetFx3'/);assert.match(command,/\/NoRestart/);
});
test('launch prepares Windows features before the process check, watches the launch and offers the install',()=>{
 const bridge=fs.readFileSync(path.join(ROOT,'services','bridge.cjs'),'utf8');
 assert.ok(bridge.indexOf("stage='windows-features'")<bridge.indexOf("stage='process-check'"));
 assert.ok(bridge.indexOf("windows-features.cjs').watch(")>bridge.indexOf("stage='process-check'"));
 assert.match(bridge,/case 'windows_feature_install'/);
 assert.match(fs.readFileSync(path.join(ROOT,'web','launch-feedback.js'),'utf8'),/WINDOWS_FEATURE_REQUIRED:/);
 assert.match(fs.readFileSync(path.join(ROOT,'web','launch-feedback.js'),'utf8'),/DIRECTPLAY_REQUIRED:/);
 assert.match(fs.readFileSync(path.join(ROOT,'Release.ps1'),'utf8'),/MeguLitDpDecline32\.dll','native\/MeguLitDpDecline64\.dll/);
});
