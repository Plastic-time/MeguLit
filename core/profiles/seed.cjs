// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 仓库根目录「The Seed/」是正式产物，随 GitHub main 发布、随安装包内置；以后改游戏只改 seed) the built-in
   game diffs (The Seed/README.md, docs/diff-layers.md "当前权威接口"):
     The Seed/<engine>/<slug>/game.json                  a megulit.game-diff document, layer 'game' (core/game-diff.cjs), key =
                                                         the game identity, prints = pack / script / steam / vndb / title
                                                         (core/game-print.cjs), plus the seed fields status, slug, builds
     The Seed/<engine>/<slug>/versions/<exeSha256>.json  layer 'version', key = the exe's SHA-256, prints = exe / head / pe
   Built-in seeds ship with the code: official, no signature. status says how the client uses a game seed:
     verified / owner-ok   used as the official game layer
     read                  used as the official game layer, in read mode
     skeleton              identity + pinned values only: a low layer (where a repository game file stands), so this PC's
                           calibration goes over it and the self-check gate decides as for any unknown game
   A file that fails check() is left out and listed by errors(); validation/the-seed.test.cjs keeps the folder clean. */
const fs=require('node:fs'),path=require('node:path');
const gameDiff=require('../game-diff.cjs'),gamePrint=require('../game-print.cjs');
const SEED_DIR=path.join(__dirname,'..','..','The Seed');
const SLUG=/^[a-z0-9][a-z0-9-]{1,62}$/,HEX=/^[0-9a-f]{64}$/,ENGINE=/^[a-z0-9]{2,40}$/,STATUS=['verified','owner-ok','read','skeleton'];
const SEED_FIELDS=['status','slug','builds','match','sourceLangs'];
const LANG=/^[a-z]{2,3}(?:-[A-Za-z]{2,8})*$/;
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
/* a path, a drive, a user folder or an e-mail never belongs in a seed */
const PRIVATE=/[A-Za-z]:[\\/]|\\\\|\/(?:home|Users)\/|\\Users\\|@[a-z0-9-]+\.[a-z]{2,}/i;
const strip=d=>{const o={...d};for(const k of SEED_FIELDS)delete o[k];return o;};
/* {ok, errors[]}; where = {engine, slug} from the folder (game.json) or {file} (versions/<sha>.json) */
function check(d,{engine,slug,file}={}){const e=[];const bad=m=>e.push(m);
 if(!plain(d))return {ok:false,errors:['not an object']};
 const isGame=d.layer==='game';
 const v=gameDiff.validate(strip(d));if(!v.ok)bad('game-diff '+v.error+(v.rejected?' '+v.rejected.join(','):''));
 if('signature' in d)bad('a built-in seed is not signed');
 if(!ENGINE.test(String(d.engine||'')))bad('engine');else if(engine&&d.engine!==engine)bad('engine differs from its folder');
 if(isGame){
  if(!STATUS.includes(d.status))bad('status');
  if(!SLUG.test(String(d.slug||'')))bad('slug');else if(slug&&d.slug!==slug)bad('slug differs from its folder');
  if(d.builds!==undefined&&(!Array.isArray(d.builds)||d.builds.length>64||!d.builds.every(b=>HEX.test(b))))bad('builds');
  if(d.mode==='read'!==(d.status==='read'))bad('status read <-> mode read');
  if(d.prints&&['exe','head','pe'].some(k=>k in d.prints))bad('a game seed has no exe prints');
  /* 2026-11-21 (owner: 兼容英文作品 + 多语言译文) the languages the game's own text comes in, BCP 47 ('ja', 'en', 'zh-Hans'); absent = ['ja'] */
  if(d.sourceLangs!==undefined&&(!Array.isArray(d.sourceLangs)||!d.sourceLangs.length||d.sourceLangs.length>8||!d.sourceLangs.every(x=>typeof x==='string'&&LANG.test(x))))bad('sourceLangs');
  /* match: readable names the hashes cannot carry (a renamed Chinese-patch exe, the titles a library may hold) */
  const m=d.match,list=(v,len)=>v===undefined||Array.isArray(v)&&v.length<=20&&v.every(x=>typeof x==='string'&&x&&x.length<=len);
  if(m!==undefined&&(!plain(m)||Object.keys(m).some(k=>!['exe','titles','notTitles'].includes(k))||!list(m.exe,80)||!list(m.titles,120)||!list(m.notTitles,120)||(m.exe||[]).some(x=>/[\/]/.test(x))))bad('match {exe, titles, notTitles}');}
 else{
  if(d.layer!=='version')bad('layer');
  for(const k of SEED_FIELDS)if(k in d)bad(k+' belongs to game.json');
  if(!HEX.test(String(d.key||'')))bad('key');else if(file&&file!==d.key+'.json')bad('file name is not <key>.json');
  if(d.prints&&(d.prints.exe!==undefined&&d.prints.exe!==d.key||['pack','script','steam','vndb','title'].some(k=>k in d.prints)))bad('a version seed has its own exe prints only');
  if(d.exe&&/[\\/]/.test(d.exe))bad('exe is a file name');}
 if(d.prints!==undefined){const p=gamePrint.check(d.prints);if(Object.keys(p).length!==Object.keys(d.prints).length)bad('prints');}
 if(PRIVATE.test(JSON.stringify(d)))bad('a path, user folder or address');
 return {ok:!e.length,errors:e};}

let cache=null;
function load(dir=SEED_DIR){const games=[],versions=new Map(),errors=[];
 const read=f=>{try{return JSON.parse(fs.readFileSync(f,'utf8').replace(/^﻿/,''));}catch(x){errors.push(path.relative(dir,f)+': '+x.message);return null;}};
 let engines=[];try{engines=fs.readdirSync(dir,{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name);}catch{return {games,versions,errors,dir};}
 for(const engine of engines){let slugs=[];try{slugs=fs.readdirSync(path.join(dir,engine),{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name);}catch{}
  for(const slug of slugs){const base=path.join(dir,engine,slug);
   let files=[];try{files=fs.readdirSync(path.join(base,'versions')).filter(f=>f.endsWith('.json'));}catch{}
   for(const f of files){const v=read(path.join(base,'versions',f));if(!v)continue;const r=check(v,{engine,file:f});if(!r.ok){errors.push(engine+'/'+slug+'/versions/'+f+': '+r.errors.join('; '));continue;}versions.set(v.key,{...v,slug});}
   const g=read(path.join(base,'game.json'));if(!g)continue;const r=check(g,{engine,slug});if(!r.ok){errors.push(engine+'/'+slug+'/game.json: '+r.errors.join('; '));continue;}
   /* builds: its own version files and the shared ones it lists; their exe names also name the game (a generic name only weakly) */
   const builds=[...new Set([...(g.builds||[]),...files.map(f=>f.slice(0,-5))])];
   games.push({key:slug,engine:g.engine,seed:true,status:g.status,sourceLangs:g.sourceLangs||['ja'],mode:g.mode,gameId:g.key,prints:g.prints||{},settings:g.settings||{},
    match:{exeSha256:builds,exe:[...new Set([...builds.map(b=>versions.get(b)?.exe).filter(Boolean),...(g.match?.exe||[])])],titles:g.match?.titles||[],notTitles:g.match?.notTitles||[],steamAppId:g.prints?.steam||undefined,prints:g.prints||{}}});}}
 /* a version file filed under one game may serve others (builds): its game is the one that lists it */
 for(const g of games)for(const b of g.match.exeSha256){const v=versions.get(b);if(v&&!v.game)v.game=g.key;}
 return {games,versions,errors,dir};}
function seeds(){return cache||(cache=load());}
function reload(){cache=null;}
module.exports={SEED_DIR,STATUS,check,load,seeds,reload,versionOf:key=>seeds().versions.get(String(key||''))||null};
