// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Settings → 重置所有设置. Puts global settings and every work's Alt+T settings back to the built-in defaults
   (core/game-style.js, native-defaults, v4/preferences cleaners). Library, history, words, sentences, account,
   API keys and translation endpoints are separate files and are never touched. Every touched file is copied to
   data/config/settings-reset-backups/<id>/ first so undo restores the exact bytes. */
const fs=require('node:fs'),path=require('node:path');
const CONFIG_FILES=['gal-preferences.json','text-defaults.json','v4-preferences.json','native-preferences.json','preferences.json','game-style-profiles.json'];
const UI_KEYS=['tome-background','tome-menu-background'];
const KEEP_BACKUPS=5;
function atomic(file,text){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,text);fs.renameSync(tmp,file);}
function readText(file){try{return fs.readFileSync(file,'utf8');}catch{return null;}}
function parse(text){try{const v=JSON.parse(text);return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return {};}}
function paths(root){const config=path.join(root,'data','config');return {config,ui:path.join(root,'data','ui-state.json'),backups:path.join(config,'settings-reset-backups')};}
function reset(root,now=Date.now()){
 const p=paths(root),id=String(now),dir=path.join(p.backups,id),files={};
 for(const name of CONFIG_FILES)files[name]=readText(path.join(p.config,name));
 files['ui-state.json']=readText(p.ui);
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({id,createdAt:new Date(now).toISOString(),files:Object.fromEntries(Object.entries(files).map(([k,v])=>[k,v!==null]))},null,2));
 for(const[name,text]of Object.entries(files))if(text!==null)fs.writeFileSync(path.join(dir,name),text);
 for(const name of CONFIG_FILES){
  const file=path.join(p.config,name);if(files[name]===null)continue;
  if(name==='game-style-profiles.json'){
   /* keep each work's entry (name, window position map, history) so the library still knows it; only its saved style goes */
   const doc=parse(files[name]),entries=doc.entries&&typeof doc.entries==='object'?doc.entries:{};
   for(const key of Object.keys(entries))if(entries[key]&&typeof entries[key]==='object')entries[key]={...entries[key],prefs:{},savedAt:now};
   atomic(file,JSON.stringify({...doc,entries},null,2));
  }else if(name==='preferences.json'){
   /* lookup API profiles (addresses and models) are user data, not style: keep them */
   const old=parse(files[name]),keep={};for(const key of ['lookupProfiles'])if(Object.hasOwn(old,key))keep[key]=old[key];
   atomic(file,JSON.stringify(keep,null,2));
  }else if(name==='gal-preferences.json'){
   /* the bound game and its process are session state, not a preference */
   const old=parse(files[name]),keep={};for(const key of ['gameProcess','bindEnabled'])if(Object.hasOwn(old,key))keep[key]=old[key];
   atomic(file,JSON.stringify(keep,null,2));
  }else fs.rmSync(file,{force:true});
 }
 if(files['ui-state.json']!==null){const ui=parse(files['ui-state.json']);for(const key of UI_KEYS)delete ui[key];atomic(p.ui,JSON.stringify(ui,null,2));}
 prune(p.backups);
 return {id,backup:dir};
}
function undo(root,id){
 if(!/^\d{10,16}$/.test(String(id||'')))throw Error('SETTINGS_RESET_UNDO_INVALID');
 const p=paths(root),dir=path.join(p.backups,String(id)),manifest=parse(readText(path.join(dir,'manifest.json')));
 if(!manifest.files)throw Error('SETTINGS_RESET_UNDO_INVALID');
 for(const[name,existed]of Object.entries(manifest.files)){
  if(name!=='ui-state.json'&&!CONFIG_FILES.includes(name))continue;
  const target=name==='ui-state.json'?p.ui:path.join(p.config,name);
  if(existed){const text=readText(path.join(dir,name));if(text===null)throw Error('SETTINGS_RESET_UNDO_INVALID');atomic(target,text);}
  else fs.rmSync(target,{force:true});
 }
 return {restored:true,id:String(id)};
}
function prune(dir){let names=[];try{names=fs.readdirSync(dir).filter(n=>/^\d+$/.test(n)).sort((a,b)=>Number(b)-Number(a));}catch{return;}for(const name of names.slice(KEEP_BACKUPS))fs.rmSync(path.join(dir,name),{recursive:true,force:true});}
module.exports={reset,undo,CONFIG_FILES,UI_KEYS};
