'use strict';
/* Saved sentences ("收藏这一句"): the one write path into saved_sentences, shared by the app bridge and the reader.
   One row per game + original text; saving again only refreshes an empty translation. Account sync picks rows up by
   diffing the table (services/account.cjs), so no extra bookkeeping is needed here. */
const clean=v=>String(v??'').replace(/\r\n?/g,'\n').trim();
function find(db,gameId,text){
 text=clean(text);if(!text)return null;
 return db.prepare('SELECT id,game_id,text,translation,created_at FROM saved_sentences WHERE text=? AND game_id IS ? ORDER BY id LIMIT 1').get(text,gameId||null)||null;
}
function save(db,{gameId,text,translation}={},now=Date.now()){
 text=clean(text);translation=clean(translation);
 if(!text||text.length>3000||translation.length>3000)throw Error('INVALID_SENTENCE');
 gameId=gameId?String(gameId):null;
 const found=find(db,gameId,text);
 if(found){if(translation&&!found.translation){db.prepare('UPDATE saved_sentences SET translation=? WHERE id=?').run(translation,found.id);found.translation=translation;}return {...found,saved:true,created:false};}
 const created_at=Math.floor(now/1000);
 const id=Number(db.prepare('INSERT INTO saved_sentences(game_id,text,translation,created_at,original) VALUES(?,?,?,?,?)').run(gameId,text,translation,created_at,'{"source":"reader"}').lastInsertRowid);
 return {id,game_id:gameId,text,translation,created_at,saved:true,created:true};
}
function remove(db,{id,gameId,text}={}){
 if(id!==undefined&&id!==null&&id!==''){const n=Number(id);if(!Number.isSafeInteger(n))throw Error('INVALID_SENTENCE');return {deleted:db.prepare('DELETE FROM saved_sentences WHERE id=?').run(n).changes>0,saved:false};}
 const found=find(db,gameId?String(gameId):null,text);if(!found)return {deleted:false,saved:false};
 db.prepare('DELETE FROM saved_sentences WHERE id=?').run(found.id);return {deleted:true,saved:false,id:found.id};
}
function state(db,{gameId,text}={}){const found=find(db,gameId?String(gameId):null,text);return {saved:!!found,id:found?.id??null};}
module.exports={save,remove,state,find};
