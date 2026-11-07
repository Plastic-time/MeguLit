// SPDX-License-Identifier: GPL-3.0-or-later
const path=require('node:path'),{openStore,readJSON}=require('./store.cjs'),nativeDefaults=require('./native-defaults.cjs');
const preferences=root=>({...nativeDefaults,...readJSON(path.join(root,'data/config/native-preferences.json'))});
function recordLookup(root,{surface,gameId=null,operationId}){if(!surface||surface.length>100)return;const prefs=preferences(root),db=openStore(root);try{db.prepare('INSERT OR IGNORE INTO lookup_events(game_id,surface,occurred_at,operation_id,original) VALUES(?,?,?,?,?)').run(gameId,surface,Math.floor(Date.now()/1000),operationId,JSON.stringify({trackUnknown:prefs.track_unknown_words!==false}));}finally{db.close();}}
function unknownWords(root){const prefs=preferences(root);if(prefs.track_unknown_words===false)return[];const db=openStore(root);try{return db.prepare(`
 WITH lookups AS(SELECT surface,COUNT(*) lookups,MAX(occurred_at) lastLookup FROM lookup_events WHERE COALESCE(json_extract(original,'$.trackUnknown'),1)=1 GROUP BY surface),
 words AS(SELECT spelling,MAX(status) status FROM vocabulary GROUP BY spelling)
 SELECT l.surface,l.lookups,l.lastLookup,w.status FROM lookups l LEFT JOIN words w ON w.spelling=l.surface
 WHERE l.lookups>=? AND (w.status IS NULL OR w.status<3) AND (?=1 OR w.status IN(1,2))
 AND NOT EXISTS(SELECT 1 FROM word_trash t WHERE json_extract(t.snapshot,'$.word.spelling')=l.surface)
 ORDER BY l.lookups DESC,l.lastLookup DESC LIMIT ?`).all(Math.max(1,Math.min(100,Number(prefs.unknown_words_min_lookups)||1)),prefs.treat_new_as_unknown!==false?1:0,Math.max(1,Math.min(100,Number(prefs.unknown_words_count)||10)));}finally{db.close();}}
module.exports={recordLookup,unknownWords};
