// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Merge library rows that the scanner keyed to the same install folder (library.key + dir).
// Default is a dry run. With --apply it first copies data/megulit.sqlite to data/backups/, then moves
// per-game records to the kept row and soft-hides the duplicate (removed_at + mergedInto); nothing is deleted.
// Usage: runtime\node.exe tools\merge-duplicate-games.cjs [rootDir] [--apply]   (close MeguLit first)
const fs=require('node:fs'),path=require('node:path'),{DatabaseSync}=require('node:sqlite');
const args=process.argv.slice(2),apply=args.includes('--apply'),root=path.resolve(args.find(a=>!a.startsWith('--'))||path.join(__dirname,'..'));
const file=path.join(root,'data','megulit.sqlite');
const canonical=p=>String(p||'').replace(/\//g,'\\').replace(/\\+$/,'').toLowerCase();
function plan(db){
 const groups=new Map();
 for(const row of db.prepare('SELECT * FROM games WHERE removed_at IS NULL').all()){const lib=JSON.parse(row.original||'{}').library||{};if(!lib.key||!lib.dir)continue;const id=lib.key+'|'+canonical(lib.dir);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(row);}
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t=>t.name).filter(t=>t!=='games'&&db.prepare(`PRAGMA table_info("${t}")`).all().some(c=>c.name==='game_id'));
 const usage=id=>tables.reduce((n,t)=>n+db.prepare(`SELECT count(*) n FROM "${t}" WHERE game_id=?`).get(id).n,0);
 const out=[];
 for(const all of groups.values()){
  // Never merge rows that carry different VNDB ids or Steam app ids (different works sharing a folder).
  const ids=f=>new Set(all.map(r=>(JSON.parse(r.original||'{}').library||{})[f]).filter(Boolean).map(String));
  if(ids('vndbId').size>1||ids('appid').size>1)continue;const rows=all;if(rows.length<2)continue;
  const scored=rows.map(row=>({row,used:usage(row.id),played:row.last_launched_at||0,exists:fs.existsSync(row.executable)}));
  scored.sort((a,b)=>b.used-a.used||b.played-a.played||Number(b.exists)-Number(a.exists)||(a.row.legacy_id==null)-(b.row.legacy_id==null));
  out.push({keep:scored[0],drop:scored.slice(1)});}
 return {tables,groups:out};
}
const db=new DatabaseSync(file,apply?{}:{readOnly:true});
const {tables,groups}=plan(db);
if(!groups.length){console.log('No duplicate games found');process.exit(0);}
for(const g of groups){console.log(`KEEP ${g.keep.row.id} ${g.keep.row.title} | ${g.keep.row.executable} (records ${g.keep.used})`);for(const d of g.drop)console.log(`  MERGE ${d.row.id} | ${d.row.executable} (records ${d.used})`);}
if(!apply){console.log('Dry run only; rerun with --apply after closing MeguLit');process.exit(0);}
const backups=path.join(root,'data','backups');fs.mkdirSync(backups,{recursive:true});
const copy=path.join(backups,`megulit-before-merge-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
db.exec(`VACUUM INTO '${copy.replace(/'/g,"''")}'`);console.log('Backup '+copy);
db.exec('BEGIN IMMEDIATE');
try{
 const now=Date.now();
 for(const g of groups){const keep=g.keep.row,orig=JSON.parse(keep.original||'{}'),lib=orig.library||(orig.library={});
  const variants=[...(lib.variants||[])];
  for(const d of g.drop){const row=d.row,dorig=JSON.parse(row.original||'{}'),dlib=dorig.library||{};
   for(const v of [{label:path.basename(row.executable),dir:dlib.dir,exe:row.executable},...(dlib.variants||[])])if(v.exe&&!variants.some(x=>canonical(x.exe)===canonical(v.exe))&&canonical(v.exe)!==canonical(keep.executable))variants.push(v);
   for(const t of tables){db.prepare(`UPDATE OR IGNORE "${t}" SET game_id=? WHERE game_id=?`).run(keep.id,row.id);}
   if(keep.legacy_id==null&&row.legacy_id!=null){const legacy=row.legacy_id;db.prepare('UPDATE games SET legacy_id=NULL WHERE id=?').run(row.id);db.prepare('UPDATE games SET legacy_id=? WHERE id=?').run(legacy,keep.id);keep.legacy_id=legacy;}
   if(!keep.last_launched_at||row.last_launched_at>keep.last_launched_at){db.prepare('UPDATE games SET last_launched_at=? WHERE id=?').run(row.last_launched_at,keep.id);keep.last_launched_at=row.last_launched_at;}
   dorig.mergedInto=keep.id;db.prepare('UPDATE games SET removed_at=?,original=? WHERE id=?').run(now,JSON.stringify(dorig),row.id);}
  lib.variants=variants;db.prepare('UPDATE games SET original=? WHERE id=?').run(JSON.stringify(orig),keep.id);}
 db.exec('COMMIT');console.log(`Merged ${groups.reduce((n,g)=>n+g.drop.length,0)} duplicate row(s)`);
}catch(error){db.exec('ROLLBACK');throw error;}finally{db.close();}
