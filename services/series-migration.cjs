'use strict';
const fs=require('node:fs'),path=require('node:path');
function migrateSeries(db,root){
 if(db.prepare("SELECT value FROM meta WHERE key='series-schema-v1'").get())return;
 // Only additive tables. Preserve a consistent SQLite checkpoint before touching a populated library.
 if(db.prepare('SELECT COUNT(*) n FROM games').get().n){const folder=path.join(root,'migration','checkpoints');fs.mkdirSync(folder,{recursive:true});const file=path.join(folder,'before-series-'+Date.now()+'.sqlite');db.exec("VACUUM INTO '"+file.replace(/'/g,"''")+"'");}
 try{db.exec(`BEGIN IMMEDIATE;
 CREATE TABLE IF NOT EXISTS series(id TEXT PRIMARY KEY,name TEXT NOT NULL,original_name TEXT NOT NULL DEFAULT '',aliases TEXT NOT NULL DEFAULT '[]',developer TEXT NOT NULL DEFAULT '',cover TEXT NOT NULL DEFAULT '',recognition_key TEXT UNIQUE,sort_mode TEXT NOT NULL DEFAULT 'custom',source TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS series_memberships(game_id TEXT PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,story_order REAL,release_order REAL,released_on TEXT NOT NULL DEFAULT '',edition TEXT NOT NULL DEFAULT '',custom_order REAL NOT NULL,source TEXT NOT NULL,evidence TEXT NOT NULL DEFAULT '');
 CREATE INDEX IF NOT EXISTS series_members ON series_memberships(series_id,custom_order);
 CREATE TABLE IF NOT EXISTS series_overrides(game_id TEXT PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,blocked INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS series_suggestions(game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,series_key TEXT NOT NULL,evidence TEXT NOT NULL,confidence REAL NOT NULL,PRIMARY KEY(game_id,series_key));
 CREATE TABLE IF NOT EXISTS series_ignored(game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,series_key TEXT NOT NULL,PRIMARY KEY(game_id,series_key));
 INSERT OR REPLACE INTO meta VALUES('series-schema-v1','1');COMMIT;`);}catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
}
module.exports={migrateSeries};
