// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 仓库根目录「The Seed/」是正式产物，随 GitHub main 发布、随安装包内置) the built-in game diffs.
   The Seed/<engine>/<gameId>/game.json                 game layer: every version of the game
   The Seed/<engine>/<gameId>/versions/<exeSha256>.json  version layer: one exe
   Pure data, no code (The Seed/README.md has the format). Built-in seeds ship with the code, so they are official without a
   signature; in the layer order they take the place of the downloaded official diff of the same layer, and a downloaded one
   with a higher rev replaces them (core/profiles/index.cjs profileFor). A file that fails check() is left out (and listed by
   errors(); validation/the-seed.test.cjs keeps the folder clean). */
const fs=require('node:fs'),path=require('node:path');
const {clean,split}=require('./domains.cjs');
const gamePrint=require('../game-print.cjs');
const SEED_DIR=path.join(__dirname,'..','..','The Seed');
const ID=/^[a-z0-9][a-z0-9-]{1,62}$/,HEX=/^[0-9a-f]{64}$/,ENGINE=/^[a-z0-9]{2,40}$/;
const GAME_FIELDS=new Set(['schema','version','layer','id','engine','title','prints','match','rev','mode','settings','note']);
const VERSION_FIELDS=new Set(['schema','version','layer','key','prints','exe','rev','mode','settings','note']);
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
const strList=(v,max,len)=>v===undefined||Array.isArray(v)&&v.length<=max&&v.every(x=>typeof x==='string'&&x.length>0&&x.length<=len);
/* a path, a drive, a user folder or an e-mail never belongs in a seed */
const PRIVATE=/[A-Za-z]:[\\/]|\\\\|\/(?:home|Users)\/|\\Users\\|@[a-z0-9-]+\.[a-z]{2,}/i;
/* {ok, errors[]} for one seed document; where = {engine, id} from its folder, file = its name */
function check(d,{engine,id,file}={}){const e=[];const bad=m=>e.push(m);
 if(!plain(d))return {ok:false,errors:['not an object']};
 if(d.schema!=='megulit.seed'||d.version!==1)bad('schema');
 if(!['game','version'].includes(d.layer))bad('layer');
 const fields=d.layer==='version'?VERSION_FIELDS:GAME_FIELDS;for(const k of Object.keys(d))if(!fields.has(k))bad('unknown field '+k);
 if(!Number.isInteger(d.rev)||d.rev<1)bad('rev');
 if(d.mode!==undefined&&!['hide','read'].includes(d.mode))bad('mode');
 const c=clean(d.settings||{});if(!plain(d.settings))bad('settings');else if(c.rejected.length)bad('settings: '+c.rejected.join(','));
 if(d.mode==='read'&&d.settings?.hide?.textEffectsRead!==true)bad('read mode without hide.textEffectsRead');
 if(d.prints!==undefined){const p=gamePrint.check(d.prints);if(!plain(d.prints)||Object.keys(p).length!==Object.keys(d.prints).length)bad('prints');}
 if(d.note!==undefined&&(typeof d.note!=='string'||d.note.length>400))bad('note');
 if(d.layer==='game'){
  if(!ID.test(String(d.id||'')))bad('id');if(id&&d.id!==id)bad('id differs from its folder');
  if(!ENGINE.test(String(d.engine||'')))bad('engine');if(engine&&d.engine!==engine)bad('engine differs from its folder');
  if(!plain(d.title)||typeof d.title.ja!=='string'||!d.title.ja||d.title.ja.length>120||d.title.zh!==undefined&&(typeof d.title.zh!=='string'||d.title.zh.length>120))bad('title {ja, zh}');
  if(Object.keys(split(d.settings||{}).version).length)bad('a game seed holds game keys only');
  if(d.prints&&['exe','head','pe'].some(k=>k in d.prints))bad('a game seed has no exe prints');
  const m=d.match;if(m!==undefined&&(!plain(m)||Object.keys(m).some(k=>!['exe','titles','notTitles'].includes(k))||!strList(m.exe,20,80)||!strList(m.titles,20,120)||!strList(m.notTitles,20,120)))bad('match {exe, titles, notTitles}');}
 if(d.layer==='version'){
  if(!HEX.test(String(d.key||'')))bad('key');if(file&&file!==d.key+'.json')bad('file name is not <key>.json');
  if(d.prints&&(d.prints.exe!==undefined&&d.prints.exe!==d.key||['pack','script','steam','vndb','title'].some(k=>k in d.prints)))bad('a version seed has its own exe prints only');
  if(d.exe!==undefined&&(typeof d.exe!=='string'||d.exe.length>80||/[\\/]/.test(d.exe)))bad('exe');}
 if(PRIVATE.test(JSON.stringify(d)))bad('a path, user folder or address');
 return {ok:!e.length,errors:e};}

let cache=null;
function load(dir=SEED_DIR){const games=[],versions=new Map(),errors=[];
 const read=f=>{try{return JSON.parse(fs.readFileSync(f,'utf8').replace(/^﻿/,''));}catch(x){errors.push(path.relative(dir,f)+': '+x.message);return null;}};
 let engines=[];try{engines=fs.readdirSync(dir,{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name);}catch{return {games,versions,errors,dir};}
 for(const engine of engines){let ids=[];try{ids=fs.readdirSync(path.join(dir,engine),{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name);}catch{}
  for(const id of ids){const base=path.join(dir,engine,id);const g=read(path.join(base,'game.json'));if(!g)continue;const r=check(g,{engine,id});if(!r.ok){errors.push(engine+'/'+id+'/game.json: '+r.errors.join('; '));continue;}
   const vs=[];let files=[];try{files=fs.readdirSync(path.join(base,'versions')).filter(f=>f.endsWith('.json'));}catch{}
   for(const f of files){const v=read(path.join(base,'versions',f));if(!v)continue;const rv=check(v,{file:f});if(!rv.ok){errors.push(engine+'/'+id+'/versions/'+f+': '+rv.errors.join('; '));continue;}vs.push(v);versions.set(v.key,{...v,game:id});}
   games.push({key:id,engine:g.engine,title:g.title.ja,titleZh:g.title.zh||'',seed:true,rev:g.rev,mode:g.mode,prints:g.prints||{},settings:g.settings||{},
    match:{exe:g.match?.exe||[],titles:[g.title.ja,...(g.title.zh?[g.title.zh]:[]),...(g.match?.titles||[])],notTitles:g.match?.notTitles||[],steamAppId:g.prints?.steam||undefined,exeSha256:vs.map(v=>v.key),prints:g.prints||{}}});}}
 return {games,versions,errors,dir};}
function seeds(){return cache||(cache=load());}
function reload(){cache=null;}
module.exports={SEED_DIR,check,load,seeds,reload,versionOf:key=>seeds().versions.get(String(key||''))||null};
