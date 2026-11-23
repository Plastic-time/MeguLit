// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E-SteamOwned (user 2026-11-20, a Steam-bought game "启动失败" with the DRM message): whether a program belongs to a game Steam
   installed, read from the files only (any engine, any title). Steam's own install record is the evidence:
   <library>/steamapps/appmanifest_<appid>.acf whose installdir is the folder under steamapps/common. A game added by hand
   (source 'manual') or found by a folder scan is still Steam's then, and is started through Steam; its SteamStub (.bind)
   is Steam's own licence wrapper, never a reason to look for a crack launcher. steam_appid.txt alone is not evidence of an
   install (copies and emulators carry it too), it only names the app. */
const fs=require('node:fs'),path=require('node:path');
const cache=new Map();
function manifests(steamapps){
 const key=steamapps.toLowerCase();let map=cache.get(key);if(map)return map;map=new Map();
 try{for(const f of fs.readdirSync(steamapps))if(/^appmanifest_\d+\.acf$/i.test(f)){try{const t=fs.readFileSync(path.join(steamapps,f),'utf8'),id=/"appid"\s+"(\d+)"/i.exec(t)?.[1],inst=/"installdir"\s+"([^"]+)"/i.exec(t)?.[1];if(id&&inst)map.set(inst.toLowerCase(),id);}catch{}}}catch{}
 cache.set(key,map);return map;
}
/* {appid, installed, steamapps} or null. installed: Steam's manifest lists the folder (start through Steam). */
function steamOf(exe){
 const file=path.resolve(String(exe||''));const m=/^(.*[\\/]steamapps)[\\/]common[\\/]([^\\/]+)[\\/]/i.exec(file);
 if(m){let map=manifests(m[1]);const inst=m[2].toLowerCase();if(!map.has(inst)){cache.delete(m[1].toLowerCase());map=manifests(m[1]);}
  const appid=map.get(inst);if(appid)return {appid,installed:true,steamapps:m[1]};}
 let dir=path.dirname(file);for(let i=0;i<3;i++){try{const id=fs.readFileSync(path.join(dir,'steam_appid.txt'),'utf8').trim();if(/^\d+$/.test(id))return {appid:id,installed:false,steamapps:''};}catch{}const up=path.dirname(dir);if(up===dir)break;dir=up;}
 return null;
}
/* The app id a launch should go through Steam with: the record's own (source steam) or Steam's install manifest. */
function launchAppid(exe,profile={}){
 if(profile.source==='steam'&&/^\d+$/.test(String(profile.appid||'')))return String(profile.appid);
 const s=steamOf(exe);return s?.installed?s.appid:'';
}
/* A Steam game's own start window (launcher / config tool beside the program on record) that Steam may run first. */
function launcherExes(exe){const dir=path.dirname(path.resolve(String(exe||'')));let names=[];try{names=fs.readdirSync(dir);}catch{}
 return names.filter(n=>/\.exe$/i.test(n)&&/^(launcher|config|setting|startup|start)/i.test(n)&&n.toLowerCase()!==path.basename(String(exe)).toLowerCase()).map(n=>path.join(dir,n));}
async function launchersRunning(exe,list){const out=[];for(const f of launcherExes(exe)){try{if((await list(f)).length)out.push(f);}catch{}}return out;}
/* 2026-11-21 (BALDR SKY Steam: Dive1\BaldrSky.exe beside the root BaldrSky.exe) the install root of a Steam game:
   <library>\steamapps\common\<installdir>, or '' when the program is not under one. */
function installRoot(exe){const m=/^(.*[\\/]steamapps[\\/]common[\\/][^\\/]+)[\\/]/i.exec(path.resolve(String(exe||'')));return m?m[1]:'';}
/* The program is a part of the work in a subfolder (same file name as the install root's program): Steam's launch option starts
   the root one, so a part is started directly, from the install root (its folder has neither steam_api nor the archives). */
function partOf(exe){const root=installRoot(exe);if(!root)return null;const file=path.resolve(String(exe)),dir=path.dirname(file);if(dir.toLowerCase()===root.toLowerCase())return null;
 const main=path.join(root,path.basename(file));try{if(!fs.statSync(main).isFile())return null;}catch{return null;}return {root,main,folder:path.relative(root,dir)};}
/* Every program a Steam start of this game may end in: the install root's and its subfolders' (one level) game programs.
   Steam starts its own launch option, which can be another program or folder than the record (Summer Pockets, BALDR SKY
   Dive1), and steam_api's restart (exit 53) starts that one too. */
const NOT_GAME=/^(unins|setup|install|config|crash|unitycrash|vc_?redist|dxsetup|launcher|startuptool|steamerrorreporter|dotnet|redist)/i;
const NOT_DIR=/^(_commonredist|redist|directx|dotnet|vcredist|save|savedata|manual|movie|ost|soundtrack)$/i;
function installPrograms(exe,{limit=12}={}){const root=installRoot(exe)||path.dirname(path.resolve(String(exe||'')));const out=[],own=path.resolve(String(exe||'')).toLowerCase();
 const add=dir=>{let names=[];try{names=fs.readdirSync(dir);}catch{return;}for(const f of names){if(out.length>=limit)return;const file=path.join(dir,f);if(!/\.exe$/i.test(f)||NOT_GAME.test(f)||file.toLowerCase()===own)continue;try{if(fs.statSync(file).size>200000)out.push(file);}catch{}}};
 add(root);let subs=[];try{subs=fs.readdirSync(root,{withFileTypes:true}).filter(d=>d.isDirectory()&&!NOT_DIR.test(d.name)).map(d=>path.join(root,d.name));}catch{}for(const d of subs)add(d);
 return out;}
module.exports={steamOf,launchAppid,launcherExes,launchersRunning,installRoot,partOf,installPrograms,_internal:{cache}};
