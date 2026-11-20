// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* diff-maker: read one probe folder (layout in tools/diff-maker/README.md) and tell which game, which exe and which engine it is.
   Nothing here runs or opens the game: the exe hash comes from the manifest (or from bin/<exe> when the probe carries it). */
const fs=require('node:fs'),path=require('node:path');
const Profiles=require('../../core/profiles/index.cjs');
const {exeHash}=require('../../services/probe-identity.cjs');

const readJson=f=>{try{return JSON.parse(fs.readFileSync(f,'utf8').replace(/^﻿/,''));}catch{return null;}};
const readText=f=>{try{return fs.readFileSync(f,'utf8');}catch{return '';}};
const HEX64=/^[0-9a-f]{64}$/;

/* engine from what the probe saw, strongest first: the manifest's detected engine, the runtime samples, the file list */
function detectEngine(manifest,runtime,files){const why=[];
 const det=Profiles.engineId(manifest.engine||manifest.detected||'');if(det){why.push('manifest '+(manifest.engine||manifest.detected));return {engine:det,why};}
 if(runtime.draws&&/"t"\s*:\s*"draw"/.test(runtime.draws)&&/Window_/.test(runtime.draws)){why.push('runtime draws name Window_* classes');return {engine:'rpgmaker',why};}
 if(/\bkrkr page\b|choice aux (?:KiriKiri|TextRender|Krkr2wcs|tTVPNativeBaseBitmap)/.test(runtime.hookEvents)){why.push('runtime hooks are KiriKiri hooks');return {engine:'kirikiri',why};}
 const names=files.map(f=>String(f.path||f).toLowerCase().replace(/\\/g,'/'));
 if(names.some(n=>/(^|\/)(js\/rmmz_core\.js|www\/js\/rpg_core\.js|js\/rpg_core\.js)$/.test(n))){why.push('rpg_core.js / rmmz_core.js');return {engine:'rpgmaker',why};}
 if(names.some(n=>/\.xp3$/.test(n))){why.push('.xp3 archives');return {engine:'kirikiri',why};}
 return {engine:'',why:['no engine sign']};}

function listFiles(dir,base=dir,out=[]){let ents=[];try{ents=fs.readdirSync(dir,{withFileTypes:true});}catch{return out;}
 for(const e of ents){const f=path.join(dir,e.name);if(e.isDirectory())listFiles(f,base,out);else out.push(path.relative(base,f).replace(/\\/g,'/'));}return out;}

/* -> {dir, manifest, title, exe:{name,hash,sha256}, engine, engineWhy, runtime:{hookEvents,readerHost,draws,info}, scriptFiles, input} */
function load(dir){if(!fs.existsSync(dir))throw new Error('probe folder not found: '+dir);
 const manifest=readJson(path.join(dir,'manifest.json'))||{};
 const rt=path.join(dir,'runtime');
 const runtime={hookEvents:readText(path.join(rt,'hook-events.log')),readerHost:readText(path.join(rt,'reader-host.log')),draws:readText(path.join(rt,'draws.jsonl')),info:readJson(path.join(rt,'info.json'))};
 const exeName=path.win32.basename(String(manifest.exe?.name||manifest.exe||'')).trim();
 let hash=String(manifest.exe?.hash||manifest.exeHash||'').toLowerCase();
 if(!HEX64.test(hash)&&exeName){const bin=path.join(dir,'bin',exeName);if(fs.existsSync(bin))hash=exeHash(bin);}
 if(!HEX64.test(hash))throw new Error('probe has no exe hash (manifest.exe.hash, or bin/<exe>)');
 const files=Array.isArray(manifest.files)?manifest.files:[];
 const det=detectEngine(manifest,runtime,files);
 const title=String(manifest.title||'');
 const input={exe:exeName,title,engine:det.engine,steamAppId:manifest.steamAppId||'',files:files.map(f=>f.path||f)};
 return {dir,manifest,title,exe:{name:exeName,hash,sha256:String(manifest.exe?.sha256||'')},engine:det.engine,engineWhy:det.why,runtime,
  scriptFiles:listFiles(path.join(dir,'scripts')),window:manifest.runtime||{},input};}
module.exports={load,detectEngine,readJson,readText};
