// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Global text style for works without saved settings (E215, user 2026-11-06). The home settings page edits this preset;
// a work's own saved Alt+T settings always win, and saving one work never changes it. Merge order when a game binds:
// built-in defaults → this preset (text keys only) → the work's saved settings. Kept apart from gal-preferences.json,
// which holds the live session and used to leak one work's Alt+T values into the next.
const fs=require('node:fs'),path=require('node:path');
const profileTools=require('./game-profile.js');
// White text with a black outline by default; furigana follows the text colour.
const BUILTIN={textColor:'#ffffff',japaneseOutline:true,japaneseOutlineColor:'#000000',chineseOutline:true,chineseOutlineColor:'#000000',
 rubyOutline:true,rubyOutlineColor:'#000000',englishOutline:true,englishOutlineColor:'#000000'};
const FILE='text-defaults.json';
/* 2026-11-20 (user: 假名注音默认往下调一点、译文和日文间距默认也小点): a preset saved before moves once, ruby 3 px lower and the
   gap 8 px smaller (as core/game-style.js does with the session settings); the file keeps the mark (spacingDefaults) */
function read(folder){let saved={};const file=path.join(folder,FILE);try{saved=JSON.parse(fs.readFileSync(file,'utf8'))||{};}catch{}
 if(saved&&typeof saved==='object'&&saved.spacingDefaults!==1&&('gap' in saved||'rubyOffsetY' in saved)){const n=v=>Number.isFinite(Number(v))&&v!==''&&v!==null?Number(v):null;
  if('gap' in saved)saved.gap=Math.max(-28,Math.min(40,(n(saved.gap)??6)-8));if('rubyOffsetY' in saved)saved.rubyOffsetY=Math.max(-100,Math.min(100,Math.round(((n(saved.rubyOffsetY)??0)+3)*10)/10));saved.spacingDefaults=1;
  try{const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(saved,null,2));fs.renameSync(tmp,file);}catch{}}
 return {...BUILTIN,...profileTools.pick(saved,'text')};}
/* What a work without saved settings starts from (core/game-style-sync.cjs base()), and what a work's own size is told apart from
   (issue 800). The session file is not part of it. */
function workBase(folder){return {...profileTools.pick(require('./game-style.js').defaults,'base'),...read(folder)};}
function write(folder,values){const next={...read(folder),...profileTools.pick(values,'text'),spacingDefaults:1},file=path.join(folder,FILE),tmp=file+'.'+process.pid+'.tmp';
 fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(tmp,JSON.stringify(next,null,2));fs.renameSync(tmp,file);return next;}
// Text keys of a value object (the rest of the text settings group stays with the session preferences).
function isTextKey(key){return profileTools.textKeys.includes(key);}
module.exports={BUILTIN,FILE,read,workBase,write,isTextKey};
