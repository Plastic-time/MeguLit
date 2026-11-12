// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-12 (user: the Japanese script of the 2003 沙耶の唄 was ported into the Steam The Song of Saya, then the library also
   showed the 2003 folder as its own 沙耶の唄; that card started the old 800x600 program without the translation, "这个一定要做
   成通用修复"). A folder the user gave as the Japanese original of another library game is that game's source, not a game to
   play: it is hidden from the library (the user can show it again under hidden games) and starting it starts the game it
   was imported into. Imports made before this was recorded are found by the same work (VNDB id) next to a game that has a
   Japanese import applied; that check runs once per imported game, so a card the user shows again stays shown. */
const fs=require('node:fs'),path=require('node:path');
const IMPORT_DIR='.megulit-japanese-import';
const parse=row=>{try{return JSON.parse(row.original||'{}');}catch{return {};}};
const norm=p=>path.resolve(String(p||'')).toLowerCase().replace(/[\\/]+$/,'');
const inside=(child,parent)=>{const c=norm(child),p=norm(parent);return c===p||c.startsWith(p+path.sep);};
function mark(db,row,targetId,now){
 const original=parse(row);original.library={...(original.library||{}),originalFor:targetId};
 db.prepare('UPDATE games SET hidden_at=COALESCE(hidden_at,?),original=? WHERE id=?').run(now,JSON.stringify(original),row.id);
}
/* link(db,targetId,source): the library games inside the Japanese original's folder become sources of targetId */
function link(db,targetId,source,{now=Math.floor(Date.now()/1000)}={}){
 let dir='';try{const s=fs.statSync(String(source||''));dir=s.isDirectory()?String(source):/\.exe$/i.test(String(source))?path.dirname(String(source)):'';}catch{}
 if(!dir)return [];
 const target=db.prepare('SELECT executable FROM games WHERE id=?').get(targetId);if(!target?.executable||inside(path.dirname(target.executable),dir))return [];
 const linked=[];
 for(const row of db.prepare('SELECT id,executable,original FROM games WHERE removed_at IS NULL AND id<>?').all(targetId))
  if(row.executable&&inside(path.dirname(row.executable),dir)){mark(db,row,targetId,now);linked.push(row.id);}
 return linked;
}
const vndb=o=>String(o?.library?.vndbId||o?.vndbId||'').toLowerCase();
/* backfill(db): imports made before link() existed */
function backfill(db,{now=Math.floor(Date.now()/1000)}={}){
 const rows=db.prepare('SELECT id,executable,original,hidden_at FROM games WHERE removed_at IS NULL').all(),linked=[];
 for(const target of rows){
  const o=parse(target);if(o.library?.sourcesLinked||!target.executable||!vndb(o))continue;
  if(!fs.existsSync(path.join(path.dirname(target.executable),IMPORT_DIR,'manifest.json'))&&!fs.existsSync(path.join(path.dirname(target.executable),IMPORT_DIR)))continue;
  for(const row of rows){if(row===target||row.hidden_at||!row.executable)continue;const r=parse(row);
   if(r.library?.source!=='folder'||r.library?.originalFor||vndb(r)!==vndb(o)||inside(path.dirname(row.executable),path.dirname(target.executable)))continue;
   mark(db,row,target.id,now);row.hidden_at=now;linked.push(row.id);}
  o.library={...(o.library||{}),sourcesLinked:true};db.prepare('UPDATE games SET original=? WHERE id=?').run(JSON.stringify(o),target.id);
 }
 return linked;
}
/* the game a source card stands for, when it is still in the library */
function targetOf(db,row){const id=parse(row).library?.originalFor;if(!id)return '';const t=db.prepare('SELECT id FROM games WHERE id=? AND removed_at IS NULL').get(id);return t?.id||'';}
module.exports={link,backfill,targetOf};
