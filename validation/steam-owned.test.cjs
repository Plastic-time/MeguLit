// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E-SteamOwned: a game Steam installed is started through Steam whatever its library source; its SteamStub is no crack case. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const owned=require('../core/steam-owned.cjs'),drm=require('../core/drm-wrap.cjs');
function pe(size,section='.text'){const b=Buffer.alloc(size);b.write('MZ',0,'latin1');b.writeUInt32LE(0x40,0x3c);b.write('PE\0\0',0x40,'latin1');b.writeUInt16LE(0x14c,0x44);b.writeUInt16LE(1,0x46);b.writeUInt16LE(0,0x54);b.write(section,0x40+24,'latin1');return b;}
function steamLibrary({manifest=true,appidTxt=false}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-steam-')),apps=path.join(root,'steamapps'),dir=path.join(apps,'common','Some VN');
 fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'game.exe'),pe(300000,'.bind'));fs.writeFileSync(path.join(dir,'tool.exe'),pe(60000));
 if(manifest)fs.writeFileSync(path.join(apps,'appmanifest_123450.acf'),'"AppState"\n{\n\t"appid"\t\t"123450"\n\t"name"\t\t"Some VN"\n\t"installdir"\t\t"Some VN"\n}\n');
 if(appidTxt)fs.writeFileSync(path.join(dir,'steam_appid.txt'),'123450\n');
 return path.join(dir,'game.exe');
}
test('Steam install manifest makes a hand-added game a Steam launch',()=>{
 const exe=steamLibrary();owned._internal.cache.clear();
 assert.deepEqual({...owned.steamOf(exe),steamapps:''},{appid:'123450',installed:true,steamapps:''});
 assert.equal(owned.launchAppid(exe,{source:'manual'}),'123450');
 assert.equal(owned.launchAppid(exe,{source:'steam',appid:'999'}),'999');
});
test('a copied folder with only steam_appid.txt is named but not a Steam install',()=>{
 const exe=steamLibrary({manifest:false,appidTxt:true});owned._internal.cache.clear();
 assert.equal(owned.steamOf(exe).installed,false);assert.equal(owned.launchAppid(exe,{source:'manual'}),'');
});
test('a manifest written after the first look is still found',()=>{
 const exe=steamLibrary({manifest:false});owned._internal.cache.clear();assert.equal(owned.launchAppid(exe,{}),'');
 const apps=path.resolve(exe,'..','..','..');fs.writeFileSync(path.join(apps,'appmanifest_7.acf'),'"appid" "7"\n"installdir" "Some VN"\n');
 assert.equal(owned.launchAppid(exe,{}),'7');
});
test('SteamStub (.bind): no crack advice, Steam words instead',()=>{
 const exe=steamLibrary({manifest:false});
 const p=drm.plan(exe,{source:'manual'});assert.equal(p.kind,'steam');
 assert.equal(drm.plan(exe,{source:'steam'}),null);
 const zh=drm.hint(p,'zh');assert.match(zh,/Steam 版/);assert.match(zh,/Alt\+M/);assert.doesNotMatch(zh,/破解或汉化启动器/);
});
test('bridge: Steam-owned launches go through Steam, failures say GAME_STEAM_REQUIRED',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8');
 assert.match(src,/steam-owned\.cjs'\)\.launchAppid\(game\.executable,profile\)/);
 assert.match(src,/const steamApp=!!steamAppid;/);
 assert.match(src,/drmPlan\.kind==='steam'\?'GAME_STEAM_REQUIRED'/);
 assert.doesNotMatch(src,/profile\.source!=='steam'&&require\('\.\.\/core\/locale-emulator/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','web','launch-feedback.js'),'utf8'),/GAME_STEAM_REQUIRED:\[/);
});
test('Steam start window beside the game is found; a running launcher keeps the launch waiting',async()=>{
 const exe=steamLibrary();const dir=path.dirname(exe);fs.writeFileSync(path.join(dir,'launcher.exe'),pe(60000));
 const names=owned.launcherExes(exe).map(f=>path.basename(f));assert.deepEqual(names,['launcher.exe']);
 assert.deepEqual((await owned.launchersRunning(exe,async f=>/launcher/i.test(f)?[{pid:1}]:[])).map(f=>path.basename(f)),['launcher.exe']);
 assert.deepEqual(await owned.launchersRunning(exe,async()=>[]),[]);
 const src=fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8');
 assert.match(src,/steam&&error\.message==='GAME_WINDOW_NOT_READY'&&\(await require\('\.\.\/core\/steam-owned\.cjs'\)\.launchersRunning/);
 assert.match(src,/Error\('STEAM_LAUNCHER_START'\)/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','web','launch-feedback.js'),'utf8'),/STEAM_LAUNCHER_START:\[/);
});
