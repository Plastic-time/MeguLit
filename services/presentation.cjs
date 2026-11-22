// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const auto=require('../core/auto-profile.cjs');
const modes=['adv','nvl','mixed'];
const file=(root,key)=>path.join(root,'data','config','confirmed-layouts',key+'.json');
function read(root,key){
 if(!/^[a-f0-9]{64}$/.test(key))return null;
 try{const mode=JSON.parse(fs.readFileSync(file(root,key),'utf8'));return modes.includes(mode)?mode:null;}catch{return null;}
}
async function confirm(db,root,{id,key,mode}){
 if(!modes.includes(mode)||!key)throw Error('INVALID_LAYOUT');
 const row=db.prepare('SELECT executable FROM games WHERE id=? AND removed_at IS NULL').get(id);
 if(!row||await auto.exeKey(root,row.executable)!==key)throw Error('VERSION_CHANGED');
 const target=file(root,key),tmp=target+'.'+crypto.randomUUID()+'.tmp';
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(tmp,JSON.stringify(mode));fs.renameSync(tmp,target);
 const sessions=require('./self-check-live.cjs'),live=sessions.current();
 sessions.setPresentation(root,key,mode);
 const record=auto.load(root,key);
 if(record){
  const feed=require('./auto-profile-feed.cjs');
  if(feed.sharing(root)){
   const prints=(live?.key===key&&live.prints)||require('../core/game-print.cjs').prints(row.executable,{exe:key,engine:record.engine});
   await feed.report(root,record,{prints});
  }
 }
 return {mode};
}
function known(root,key,row,lib,vnid){
 const profile=require('../core/profiles/index.cjs').profileFor({exe:row.executable,title:row.title,engine:lib.engine,vndb:vnid,exeSha256:key});
 if(profile.page.presentation||typeof profile.page.flowPage==='boolean')return true;
 if(!key)return false;
 const feed=require('./auto-profile-feed.cjs'),layer=feed.layer(feed.cached(root,key),key,{exe:row.executable});
 if(layer?.torchBound&&layer.exact&&(layer.version?.settings.page?.presentation||typeof layer.version?.settings.page?.flowPage==='boolean'))return true;
 return !!read(root,key)||!!(vnid&&lib.presentation?.vnid===vnid&&lib.presentation.key===key&&modes.includes(lib.presentation.mode));
}
module.exports={read,confirm,known};
