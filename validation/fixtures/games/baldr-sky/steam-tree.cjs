// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* The BALDR SKY Steam install (app 741140, installdir "Baldr Sky") as files, from the GOG manifest of the same Sekai Project
   build (gogdb 4ef57bc9a1365570fd500b99ff05a431) and SteamDB's config (one launch option: BaldrSky.exe). Sizes are scaled
   down; programs are 32-bit PE headers. Returns {root,steam,apps,dir,exe,dive1}. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
function pe(size){const b=Buffer.alloc(size);b.write('MZ');b.writeUInt32LE(0x80,0x3c);b.write('PE\0\0',0x80,'latin1');b.writeUInt16LE(0x14c,0x84);return b;}
function build(base=os.tmpdir()){
 const root=fs.mkdtempSync(path.join(base,'megulit-baldr-'));
 const steam=path.join(root,'Steam'),apps=path.join(steam,'steamapps'),dir=path.join(apps,'common','Baldr Sky');
 for(const d of ['Dive1','Movie','_CommonRedist'])fs.mkdirSync(path.join(dir,d),{recursive:true});
 fs.writeFileSync(path.join(dir,'BaldrSky.exe'),pe(370000));
 fs.writeFileSync(path.join(dir,'StartUpTool.exe'),pe(261000));
 fs.writeFileSync(path.join(dir,'steam_api.dll'),pe(25900));
 fs.writeFileSync(path.join(dir,'BaldrUtil.dll'),pe(5000));
 fs.writeFileSync(path.join(dir,'BaldrSkyCustom.dat'),'');
 for(const n of ['Bgm','Bmp','Config','Dat','Face','Script','Se','Stand','System','Thumbnail','Update','Update2','Visual','Voice'])fs.writeFileSync(path.join(dir,n+'.pac'),Buffer.from('PAC\x04'));
 fs.writeFileSync(path.join(dir,'Dive1','BaldrSky.exe'),pe(360000));
 for(const n of ['Visual','Voice'])fs.writeFileSync(path.join(dir,'Dive1',n+'.pac'),Buffer.from('PAC\x04'));
 fs.writeFileSync(path.join(dir,'Movie','Opening.mpg'),'');
 fs.writeFileSync(path.join(dir,'_CommonRedist','vcredist_x86.exe'),pe(300000));
 fs.writeFileSync(path.join(apps,'appmanifest_741140.acf'),'"AppState"\n{\n\t"appid"\t\t"741140"\n\t"name"\t\t"Baldr Sky"\n\t"installdir"\t\t"Baldr Sky"\n\t"UserConfig"\n\t{\n\t\t"language"\t\t"schinese"\n\t}\n}\n');
 return {root,steam,apps,dir,exe:path.join(dir,'BaldrSky.exe'),dive1:path.join(dir,'Dive1','BaldrSky.exe')};
}
module.exports={build,pe};
