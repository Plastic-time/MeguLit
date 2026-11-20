// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Library}=require('../core/library.cjs');
const {reconcile}=require('../services/library.cjs');
const {GameEnrichment}=require('../services/game-enrichment.cjs');
const store=require('../services/store.cjs');

test('a folder game keeps its enriched identity through startup and manual rescans',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-folder-rescan-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const config=path.join(root,'data','config'),games=path.join(root,'Games'),dir=path.join(games,'Some Game');
 fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'game.exe'),Buffer.alloc(220000));
 fs.writeFileSync(path.join(dir,'data.xp3'),'fixture');
 const library=new Library({root,config});
 library.settings({folders:games});
 let online=false,work='v1';
 const fetcher=t.mock.method(globalThis,'fetch',async url=>{
  if(!online)throw Error('offline');
  if(String(url).endsWith('/kana/vn'))return Response.json({results:[{id:work,title:'Some Game',titles:[]}]});
  if(String(url).endsWith('/kana/release'))return Response.json({results:[{extlinks:[{url:'https://store.steampowered.com/app/123/'}]}]});
  return Response.json({results:[]});
 });
 const scan=async incremental=>{
  library.state=library.read();
  await library.scan(()=>{},{incremental});
  reconcile(root,library.load().games,{restoreRemoved:!incremental});
 };
 const info=()=>{const db=store.openStore(root);try{
  const [game]=store.games(db,root),{info}=require('../services/game-detail.cjs').detail(db,root,game.id,'en');return {id:game.id,vndbId:game.vndbId,detailVndbId:info.vndbId,appid:info.appid};
 }finally{db.close();}};
 await scan(false);
 const game=info();assert.equal(game.vndbId,'');
 online=true;
 const enrichment=new GameEnrichment(root,()=>{},fetcher);
 await enrichment.run(game.id,'en',true);
 const matched={id:game.id,vndbId:'v1',detailVndbId:'v1',appid:'123'};
 assert.deepEqual(info(),matched);
 online=false;
 for(const incremental of [true,false]){
  await scan(incremental);
  assert.deepEqual(info(),matched);
 }
 fs.appendFileSync(path.join(dir,'game.exe'),'replacement');
 await scan(true);
 assert.deepEqual(info(),{id:game.id,vndbId:'',detailVndbId:'',appid:''});
 online=true;
 await enrichment.run(game.id,'en',true);
 assert.deepEqual(info(),matched);
 work='v2';await scan(false);
 assert.deepEqual(info(),{id:game.id,vndbId:'v2',detailVndbId:'v2',appid:''});
});
