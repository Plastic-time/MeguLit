// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* v1.4.1 (user): 「将原等待符移到 MeguLit 句末」and「隐藏点击等待图标」now default off. Turn both off once for every
   user, in the global settings and in every work's saved Alt+T settings (and its history), on all engines. The meta
   flag keeps it to a single run, so a user who turns them back on afterwards keeps that choice. */
const fs=require('node:fs'),path=require('node:path');
const FLAG='wait-marker-off-v1',KEYS=['hideWaitMarker','relocateWaitMarker'];
function off(prefs){if(!prefs||typeof prefs!=='object')return false;let changed=false;for(const key of KEYS)if(prefs[key]!==false){prefs[key]=false;changed=true;}return changed;}
function rewrite(file,edit){let doc;try{doc=JSON.parse(fs.readFileSync(file,'utf8'));}catch{return false;}if(!doc||typeof doc!=='object'||Array.isArray(doc)||!edit(doc))return false;const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(doc,null,2));fs.renameSync(tmp,file);return true;}
function migrateFiles(folder){
 const result={global:false,profiles:0};
 result.global=rewrite(path.join(folder,'gal-preferences.json'),off);
 rewrite(path.join(folder,'game-style-profiles.json'),doc=>{let changed=false;for(const entry of Object.values(doc.entries||{})){if(!entry||typeof entry!=='object')continue;let hit=false;if(entry.prefs&&typeof entry.prefs==='object')hit=off(entry.prefs)||hit;else{entry.prefs={hideWaitMarker:false,relocateWaitMarker:false};hit=true;}for(const old of Array.isArray(entry.history)?entry.history:[])if(old?.prefs)hit=off(old.prefs)||hit;if(hit){changed=true;result.profiles++;}}return changed;});
 return result;
}
function migrateWaitMarker(db,root){
 if(db.prepare('SELECT value FROM meta WHERE key=?').get(FLAG))return null;
 const result=migrateFiles(path.join(root,'data','config'));
 db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(FLAG,JSON.stringify({at:new Date().toISOString(),...result}));
 return result;
}
module.exports={FLAG,migrateWaitMarker,migrateFiles};
