// SPDX-License-Identifier: GPL-3.0-or-later
// Legacy SQL is translated here so original Anki integration modules remain unchanged.
'use strict';
const {openStore}=require('./store.cjs');
function request(root,command,args={}){
 if(command==='plugin:sql|load')return 'sqlite:immersion.db';
 if(args.db!=='sqlite:immersion.db'||typeof args.query!=='string')throw Error('INVALID_LEGACY_DATABASE');
 const q=args.query.replace(/\s+/g,' ').trim(),v=Array.isArray(args.values)?args.values:[],db=openStore(root);
 const execute=(query,values=[])=>{const r=db.prepare(query).run(...values);return {rowsAffected:Number(r.changes),lastInsertId:Number(r.lastInsertRowid)};};
 try{
  require('./anki-sync.cjs').schema(db);
  if(command==='plugin:sql|select'){
   if(/^SELECT id FROM words WHERE id = \$1$/i.test(q))return db.prepare('SELECT id FROM vocabulary WHERE id=?').all(Number(v[0]));
   if(/^SELECT id FROM word_sentences WHERE word_id = \$1 AND sentence_text = \$2$/i.test(q))return db.prepare('SELECT id FROM examples WHERE word_id=? AND text=?').all(Number(v[0]),String(v[1]));
   if(/^SELECT word_id, note_id FROM tome_anki_links$/i.test(q))return db.prepare('SELECT word_id,note_id FROM anki_links').all();
   throw Error('LEGACY_SQL_NOT_SUPPORTED');
  }
  if(command!=='plugin:sql|execute')throw Error('LEGACY_SQL_NOT_SUPPORTED');
  if(/^CREATE TABLE IF NOT EXISTS tome_anki_(links|reviews) /i.test(q))return {rowsAffected:0,lastInsertId:0};
  if(/^INSERT INTO words \(/i.test(q)){
   if(db.prepare('SELECT 1 FROM word_trash WHERE word_id=?').get(Number(v[0])))return {rowsAffected:0,lastInsertId:0};
   return execute('INSERT OR IGNORE INTO vocabulary(id,spelling,reading,definitions,status,created_at,original) VALUES(?,?,?,?,0,?,?)',[Number(v[0]),String(v[1]),String(v[2]),String(v[3]),Number(v[5])||Math.floor(Date.now()/1000),JSON.stringify({origin:'original-overlay',pos:String(v[4]||'')})]);
  }
  if(/^INSERT OR IGNORE INTO word_tags /i.test(q)){
   const game=db.prepare('SELECT id FROM games WHERE legacy_id=? AND removed_at IS NULL').get(Number(v[1]));
   db.exec('CREATE TABLE IF NOT EXISTS overlay_word_tags(word_id INTEGER NOT NULL,game_id TEXT NOT NULL,PRIMARY KEY(word_id,game_id))');
   return game?execute('INSERT OR IGNORE INTO overlay_word_tags VALUES(?,?)',[Number(v[0]),game.id]):{rowsAffected:0,lastInsertId:0};
  }
  if(/^INSERT INTO word_sentences /i.test(q)){
   const game=v[4]==null?null:db.prepare('SELECT id FROM games WHERE legacy_id=? AND removed_at IS NULL').get(Number(v[4]));
   if(db.prepare('SELECT 1 FROM examples WHERE word_id=? AND text=?').get(Number(v[0]),String(v[1])))return {rowsAffected:0,lastInsertId:0};
   return execute('INSERT INTO examples(word_id,text,highlight_start,highlight_end,game_id,created_at,original) VALUES(?,?,?,?,?,?,?)',[Number(v[0]),String(v[1]),Number(v[2]),Number(v[3]),game?.id||null,Number(v[5])||Math.floor(Date.now()/1000),'{}']);
  }
  if(/^INSERT OR REPLACE INTO tome_anki_links /i.test(q))return execute('INSERT OR REPLACE INTO anki_links(word_id,note_id) VALUES(?,?)',[Number(v[0]),Number(v[1])]);
  if(/^UPDATE words SET status = \$1, status_updated_at = unixepoch\(\) WHERE id = \$2 AND status != \$1$/i.test(q))return execute('UPDATE vocabulary SET status=? WHERE id=? AND status!=?',[Number(v[0]),Number(v[1]),Number(v[0])]);
  if(/^INSERT OR IGNORE INTO tome_anki_reviews /i.test(q))return execute('INSERT OR IGNORE INTO anki_synced_reviews(review_id,word_id) VALUES(?,?)',[Number(v[0]),Number(v[1])]);
  if(/^INSERT INTO review_log /i.test(q))return execute('INSERT INTO review_events(word_id,reviewed_at) VALUES(?,?)',[Number(v[0]),Number(v[1])]);
  throw Error('LEGACY_SQL_NOT_SUPPORTED');
 }finally{db.close();}
}
module.exports={request};
