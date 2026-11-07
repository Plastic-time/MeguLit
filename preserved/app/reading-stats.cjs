'use strict';
// Reading statistics for the home-page cards (last played, reading time, characters read). The upstream reader only
// counts while its own media page has a session started with the play button and receives text from the clipboard or
// a websocket; ToMe reads games through the hook overlay and never does that, so from 2026-10-26 nothing was recorded.
// This writes the same sessions / sentence_read_events rows from the hook lines, attributed to the library work whose
// executable is the bound game process. ended_at is always started_at + active seconds, so a crash keeps what was read.
const fs=require('node:fs'),path=require('node:path');
const IDLE_CAP=180,SESSION_GAP=900,RECENT=40,MAX_TEXT=2000;
const exeName=p=>path.win32.basename(String(p||'')).replace(/\.exe$/i,'').toLowerCase();
const japanese=/[぀-ヿ㐀-鿿ｦ-ﾟ]/;

class ReadingStats{
 constructor({file,games,now=Date.now,log=()=>{},open}){this.file=file;this.games=games;this.now=now;this.log=log;this.open=open||(f=>{const {DatabaseSync}=require('node:sqlite');return new DatabaseSync(f);});this.db=null;this.session=null;this.lastSequence=null;this.failed='';}
 mediaFor(processName){const name=exeName(processName);if(!name)return null;let games=[];try{games=this.games()||[];}catch{}
  for(const g of games){if(!Number.isSafeInteger(g?.mediaId)||g.missing)continue;if([g.exe,...(g.variants||[]).map(v=>v?.exe)].some(e=>e&&exeName(e)===name))return g.mediaId;}
  return null;}
 connect(){if(this.db)return this.db;if(!this.file||!fs.existsSync(this.file))return null;const db=this.open(this.file);db.exec('PRAGMA busy_timeout=3000');this.db=db;return db;}
 // One hook line. Only a new hook sequence counts (state merges repeat the last line), never backlog replays.
 line({text,origin,sequence,active,recovering,process}){
  if(typeof text!=='string'||active===false||recovering===true||origin==='history')return false;
  if(!Number.isSafeInteger(sequence)||sequence===this.lastSequence)return false;this.lastSequence=sequence;
  const clean=text.replace(/\s+/g,'');if(!clean||!japanese.test(clean))return false;
  const mediaId=this.mediaFor(process);if(mediaId==null)return false;
  const at=Math.floor(this.now()/1000);let s=this.session;
  if(s&&(s.mediaId!==mediaId||at-s.lastAt>SESSION_GAP||at<s.lastAt))s=this.session=null;
  if(s&&s.recent.includes(clean))return false;
  try{const db=this.connect();if(!db)return false;
   if(!s){const r=db.prepare('INSERT INTO sessions (media_id, started_at, ended_at, moji_read, sentences_read, last_updated_at) VALUES (?, ?, ?, ?, 1, ?)').run(mediaId,at,at,clean.length,at);
    s=this.session={id:Number(r.lastInsertRowid),mediaId,startedAt:at,lastAt:at,active:0,recent:[]};}
   else{s.active+=Math.min(at-s.lastAt,IDLE_CAP);s.lastAt=at;
    db.prepare('UPDATE sessions SET moji_read = moji_read + ?, sentences_read = sentences_read + 1, ended_at = started_at + ?, last_updated_at = ? WHERE id = ?').run(clean.length,s.active,at,s.id);}
   s.recent.push(clean);if(s.recent.length>RECENT)s.recent.shift();
   db.prepare('INSERT INTO sentence_read_events (session_id, media_id, sentence_text, read_at) VALUES (?, ?, ?, ?)').run(s.id,mediaId,text.slice(0,MAX_TEXT),at);
   this.failed='';return true;
  }catch(e){if(this.failed!==e.message){this.failed=e.message;this.log('Reading stats: '+e.message);}try{this.db?.close();}catch{}this.db=null;this.session=null;return false;}}
 close(){this.session=null;try{this.db?.close();}catch{}this.db=null;}
}
module.exports={ReadingStats,IDLE_CAP,SESSION_GAP};
