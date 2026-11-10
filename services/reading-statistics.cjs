// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const READ_RATE=12;
const {openStore,readJSON}=require('./store.cjs'),path=require('node:path');
class ReadingStatistics{
 constructor(root,now=Date.now){this.root=root;this.now=now;this.session=null;this.last=null;this.translations=new Map();}
 translation(gameId,text,value,source='machine'){if(!gameId||typeof value!=='string'||!value.trim())return;const clean=String(text||'').replace(/\s+/g,''),key=gameId+':'+clean;/* a human translation (group patch / official Chinese) is never replaced by a machine one */if(source==='machine'&&['group','official'].includes(this.translations.get(key)?.source))return;this.translations.set(key,{value,source});if(this.translations.size>200)this.translations.delete(this.translations.keys().next().value);const db=openStore(this.root);try{const rows=db.prepare('SELECT id,text,original FROM reading_events WHERE game_id=? ORDER BY id DESC LIMIT 100').all(gameId);for(const row of rows)if(row.text.replace(/\s+/g,'')===clean){let original={};try{original=JSON.parse(row.original||'{}');}catch{}if(source==='machine'&&['group','official'].includes(original.translationSource))continue;db.prepare('UPDATE reading_events SET original=? WHERE id=?').run(JSON.stringify({...original,translation:value,translationSource:source}),row.id);}}finally{db.close();}}
 line({gameId,text,sequence,active,recovering,origin}){
  if(!gameId||active===false||recovering||origin==='history'||typeof text!=='string'||!/[぀-ヿ㐀-鿿]/.test(text)||!Number.isSafeInteger(sequence))return false;
  if(readJSON(path.join(this.root,'data','config','native-preferences.json')).history_enabled===false)return false;
  const key=gameId+':'+sequence;if(key===this.last)return false;this.last=key;
  const ms=this.now(),at=Math.floor(ms/1000),clean=text.replace(/\s+/g,'');let s=this.session;
  if(s&&(s.gameId!==gameId||at-s.lastAt>900||at<s.lastAt))s=this.session=null;
  if(s?.recent.includes(clean))return false;const db=openStore(this.root);db.exec('BEGIN IMMEDIATE');
  try{this.credit(db,ms);if(!db.prepare('SELECT 1 FROM games WHERE id=?').get(gameId)){db.exec('ROLLBACK');return false;}
   if(s&&!db.prepare('SELECT 1 FROM reading_sessions WHERE id=? AND game_id=?').get(s.id,gameId))s=null;
   if(!s){const row=db.prepare('INSERT INTO reading_sessions(game_id,started_at,ended_at,active_seconds,characters,sentences) VALUES(?,?,?,0,0,1)').run(gameId,at,at);s={id:Number(row.lastInsertRowid),gameId,lastAt:at,recent:[]};}
   else db.prepare('UPDATE reading_sessions SET ended_at=?,active_seconds=active_seconds+?,sentences=sentences+1 WHERE id=?').run(at,Math.min(180,at-s.lastAt),s.id);
   db.prepare('INSERT INTO reading_events(session_id,game_id,text,read_at,original) VALUES(?,?,?,?,?)').run(s.id,gameId,text.slice(0,4000),at,JSON.stringify((t=>t?{translation:t.value,translationSource:t.source}:{translation:''})(this.translations.get(gameId+':'+clean))));db.exec('COMMIT');s.lastAt=at;this.pending={sessionId:s.id,chars:[...clean].length,shownAt:ms};s.recent.push(clean);s.recent=s.recent.slice(-40);this.session=s;return true;
  }catch(error){db.exec('ROLLBACK');throw error;}finally{db.close();}
 }
 /* A line's characters are credited when the next line replaces it, capped by how long it was on screen
    (READ_RATE chars/s), so skipped or click-through lines no longer count as read (issue #79). */
 credit(db,ms){const p=this.pending;this.pending=null;if(!p)return;const credited=Math.min(p.chars,Math.floor(Math.max(0,ms-p.shownAt)/1000*READ_RATE));if(credited>0)db.prepare('UPDATE reading_sessions SET characters=characters+? WHERE id=?').run(credited,p.sessionId);}
 flush(){if(!this.pending)return;const db=openStore(this.root);try{this.credit(db,this.now());}finally{db.close();}}
 reset(){try{this.flush();}catch{}this.session=null;this.last=null;}
}
module.exports={ReadingStatistics};
