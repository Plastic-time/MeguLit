// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {openStore,readJSON}=require('./store.cjs'),path=require('node:path');
class ReadingStatistics{
 constructor(root,now=Date.now){this.root=root;this.now=now;this.session=null;this.last=null;this.translations=new Map();}
 translation(gameId,text,value){if(!gameId||typeof value!=='string'||!value.trim())return;const clean=String(text||'').replace(/\s+/g,''),key=gameId+':'+clean;this.translations.set(key,value);if(this.translations.size>200)this.translations.delete(this.translations.keys().next().value);const db=openStore(this.root);try{const rows=db.prepare('SELECT id,text,original FROM reading_events WHERE game_id=? ORDER BY id DESC LIMIT 100').all(gameId);for(const row of rows)if(row.text.replace(/\s+/g,'')===clean){let original={};try{original=JSON.parse(row.original||'{}');}catch{}db.prepare('UPDATE reading_events SET original=? WHERE id=?').run(JSON.stringify({...original,translation:value}),row.id);}}finally{db.close();}}
 line({gameId,text,sequence,active,recovering,origin}){
  if(!gameId||active===false||recovering||origin==='history'||typeof text!=='string'||!/[぀-ヿ㐀-鿿]/.test(text)||!Number.isSafeInteger(sequence))return false;
  if(readJSON(path.join(this.root,'data','config','native-preferences.json')).history_enabled===false)return false;
  const key=gameId+':'+sequence;if(key===this.last)return false;this.last=key;
  const at=Math.floor(this.now()/1000),clean=text.replace(/\s+/g,'');let s=this.session;
  if(s&&(s.gameId!==gameId||at-s.lastAt>900||at<s.lastAt))s=this.session=null;
  if(s?.recent.includes(clean))return false;const db=openStore(this.root);db.exec('BEGIN IMMEDIATE');
  try{if(!db.prepare('SELECT 1 FROM games WHERE id=?').get(gameId)){db.exec('ROLLBACK');return false;}
   if(s&&!db.prepare('SELECT 1 FROM reading_sessions WHERE id=? AND game_id=?').get(s.id,gameId))s=null;
   if(!s){const row=db.prepare('INSERT INTO reading_sessions(game_id,started_at,ended_at,active_seconds,characters,sentences) VALUES(?,?,?,0,?,1)').run(gameId,at,at,[...clean].length);s={id:Number(row.lastInsertRowid),gameId,lastAt:at,recent:[]};}
   else db.prepare('UPDATE reading_sessions SET ended_at=?,active_seconds=active_seconds+?,characters=characters+?,sentences=sentences+1 WHERE id=?').run(at,Math.min(180,at-s.lastAt),[...clean].length,s.id);
   db.prepare('INSERT INTO reading_events(session_id,game_id,text,read_at,original) VALUES(?,?,?,?,?)').run(s.id,gameId,text.slice(0,4000),at,JSON.stringify({translation:this.translations.get(gameId+':'+clean)||''}));db.exec('COMMIT');s.lastAt=at;s.recent.push(clean);s.recent=s.recent.slice(-40);this.session=s;return true;
  }catch(error){db.exec('ROLLBACK');throw error;}finally{db.close();}
 }
 reset(){this.session=null;this.last=null;}
}
module.exports={ReadingStatistics};
