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
function read(folder){let saved={};try{saved=JSON.parse(fs.readFileSync(path.join(folder,FILE),'utf8'))||{};}catch{}return {...BUILTIN,...profileTools.pick(saved,'text')};}
function write(folder,values){const next={...read(folder),...profileTools.pick(values,'text')},file=path.join(folder,FILE),tmp=file+'.'+process.pid+'.tmp';
 fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(tmp,JSON.stringify(next,null,2));fs.renameSync(tmp,file);return next;}
// Text keys of a value object (the rest of the text settings group stays with the session preferences).
function isTextKey(key){return profileTools.textKeys.includes(key);}
module.exports={BUILTIN,FILE,read,write,isTextKey};
