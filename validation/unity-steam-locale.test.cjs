// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const LE=require('../core/locale-emulator.cjs');
function pe(machine,dll=false){const b=Buffer.alloc(256);b.write('MZ');b.writeUInt32LE(128,60);b.write('PE\0\0',128,'binary');b.writeUInt16LE(machine,132);b.writeUInt16LE(dll?0x2000:0,150);return b;}
function game(t,machine=0x14c){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'unity-steam-locale-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const exe=path.join(dir,'星空列车与白的旅行.exe'),data=path.join(dir,'星空列车与白的旅行_Data');fs.writeFileSync(exe,pe(machine));fs.mkdirSync(data);fs.writeFileSync(path.join(data,'globalgamemanagers'),'fixture');return {dir,exe,data};}
function plugin(data,machine=0x14c,body=pe(machine,true)){const dir=path.join(data,'Plugins',machine===0x14c?'x86':'x86_64');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,machine===0x14c?'steam_api.dll':'steam_api64.dll');fs.writeFileSync(file,body);return file;}
test('Unity Steam plugins in the matching player data folder retain the existing no-locale-helper rule',t=>{
 for(const machine of [0x14c,0x8664]){const g=game(t,machine);plugin(g.data,machine);assert.equal(LE.x86(g.exe),machine===0x14c);assert.equal(LE.steamApi(g.exe),true);assert.equal(LE.recommended({engine:'BGI'},g.exe),false);}
});
test('unrelated folders, absent Unity data, empty files, executables and mismatched plugin architecture do not disable legacy locale support',t=>{
 const g=game(t);assert.equal(LE.steamApi(g.exe),false);assert.equal(LE.recommended({engine:'BGI'},g.exe),true);
 plugin(path.join(g.dir,'Other_Data'));assert.equal(LE.steamApi(g.exe),false);
 const file=plugin(g.data,0x14c,Buffer.alloc(0));assert.equal(LE.steamApi(g.exe),false);
 fs.writeFileSync(file,pe(0x8664,true));assert.equal(LE.steamApi(g.exe),false);
 fs.writeFileSync(file,pe(0x14c,false));assert.equal(LE.steamApi(g.exe),false);
 fs.writeFileSync(file,pe(0x14c,true));assert.equal(LE.steamApi(g.exe),true);
 fs.unlinkSync(path.join(g.data,'globalgamemanagers'));assert.equal(LE.steamApi(g.exe),false);
 fs.writeFileSync(path.join(g.data,'globalgamemanagers'),'fixture');fs.writeFileSync(g.exe,'not a player');assert.equal(LE.steamApi(g.exe),false);
});
