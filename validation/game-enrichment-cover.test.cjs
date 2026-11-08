'use strict';
// The Steam library capsule is fetched from its un-hashed path. Newer Steam apps keep it under a hashed folder, so
// that path answers 404. The VNDB cover must still be used then.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const store=require('../services/store.cjs'),{GameEnrichment}=require('../services/game-enrichment.cjs');

const STEAM_JPEG=Buffer.from([0xff,0xd8,0xff,0xe0,0x53,0x54,0x45,0x41,0x4d]);
const VNDB_JPEG=Buffer.from([0xff,0xd8,0xff,0xe0,0x56,0x4e,0x44,0x42]);
const VNDB_COVER='https://t.vndb.org/cv/00/1.jpg';
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});

function fakeNetwork(steamCoverStatus){
 return async url=>{
  url=String(url);
  if(url==='https://api.vndb.org/kana/release')return json({results:[{vns:[{id:'v1'}]}]});
  if(url==='https://api.vndb.org/kana/vn')return json({results:[{id:'v1',title:'Test VN',alttitle:'テスト',titles:[],image:{url:VNDB_COVER},description:'A test.',developers:[]}]});
  if(url.startsWith('https://store.steampowered.com/appreviews/'))return json({success:1,reviews:[],query_summary:{total_reviews:10,total_positive:9}});
  if(url.includes('/store_item_assets/steam/apps/'))return steamCoverStatus===200?new Response(STEAM_JPEG):new Response('',{status:steamCoverStatus});
  if(url===VNDB_COVER)return new Response(VNDB_JPEG);
  return new Response('',{status:404});
 };
}

async function enrich(steamCoverStatus){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-cover-')),exe=path.join(root,'game','game.exe');
 fs.mkdirSync(path.dirname(exe),{recursive:true});fs.writeFileSync(exe,'MZ');
 const db=store.openStore(root);
 try{db.prepare('INSERT INTO games(id,title,executable,cover,source,original) VALUES(?,?,?,?,?,?)').run('game-1','Test VN',exe,'','steam',JSON.stringify({library:{names:['Test VN'],appid:'3655150'}}));}finally{db.close();}
 const network=fakeNetwork(steamCoverStatus),realFetch=globalThis.fetch;
 // Synopses read VNDB through the global fetch; keep the test offline.
 globalThis.fetch=network;
 try{await new GameEnrichment(root,()=>{},network,async()=>'').run('game-1','en',false);}finally{globalThis.fetch=realFetch;}
 const check=store.openStore(root);
 try{const cover=check.prepare('SELECT cover FROM games WHERE id=?').get('game-1').cover;return {root,cover,bytes:cover?fs.readFileSync(path.join(root,'data','assets','covers',cover)):null};}finally{check.close();}
}

test('a Steam cover that answers 404 falls back to the VNDB cover',async()=>{
 const result=await enrich(404);
 try{assert.notEqual(result.cover,'');assert.deepEqual(result.bytes,VNDB_JPEG);}finally{fs.rmSync(result.root,{recursive:true,force:true});}
});

test('a Steam cover that loads is still preferred',async()=>{
 const result=await enrich(200);
 try{assert.deepEqual(result.bytes,STEAM_JPEG);}finally{fs.rmSync(result.root,{recursive:true,force:true});}
});
