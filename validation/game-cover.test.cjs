'use strict';
// A cover picked for one game (game_cover) is stored with the game and survives metadata refresh.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const store=require('../services/store.cjs'),{setCover}=require('../services/game-cover.cjs'),{GameEnrichment}=require('../services/game-enrichment.cjs');

const PNG=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.from('custom cover')]);
const GIF=Buffer.from('GIF89a custom cover');
const VNDB_JPEG=Buffer.from([0xff,0xd8,0xff,0xe0,0x56,0x4e,0x44,0x42]);

function setup(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-cover-')),exe=path.join(root,'game','game.exe');
 fs.mkdirSync(path.dirname(exe),{recursive:true});fs.writeFileSync(exe,'MZ');
 fs.writeFileSync(path.join(root,'picked.png'),PNG);fs.writeFileSync(path.join(root,'picked.gif'),GIF);
 const db=store.openStore(root);
 try{db.prepare('INSERT INTO games(id,title,executable,cover,source,original) VALUES(?,?,?,?,?,?)').run('game-1','Test VN',exe,'','folder',JSON.stringify({library:{names:['Test VN'],vndbId:'v1',appid:'100'}}));}finally{db.close();}
 return root;
}
const coverFile=root=>{const db=store.openStore(root);try{return db.prepare('SELECT cover FROM games WHERE id=?').get('game-1').cover;}finally{db.close();}};

test('a picked cover is stored and shown for the game',()=>{
 const root=setup();
 try{
  const db=store.openStore(root);let result;try{result=setCover(db,root,'game-1',path.join(root,'picked.png'));}finally{db.close();}
  assert.match(result.cover,/^data:image\/png;base64,/);
  assert.deepEqual(fs.readFileSync(path.join(root,'data','assets','covers',coverFile(root))),PNG);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('an unsupported image or an unknown game is refused',()=>{
 const root=setup();
 try{
  const db=store.openStore(root);
  try{
   assert.throws(()=>setCover(db,root,'game-1',path.join(root,'picked.gif')),/INVALID_IMAGE/);
   assert.throws(()=>setCover(db,root,'game-2',path.join(root,'picked.png')),/GAME_NOT_FOUND/);
  }finally{db.close();}
  assert.equal(coverFile(root),'');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('metadata refresh keeps a picked cover even when it corrects the match',async()=>{
 const root=setup();
 try{
  const db=store.openStore(root);try{setCover(db,root,'game-1',path.join(root,'picked.png'));}finally{db.close();}
  const picked=coverFile(root);
  // The Steam appid now points at another VNDB entry (v2), which used to replace the cover.
  const network=async(url,options={})=>{
   url=String(url);const body=options.body?JSON.parse(options.body):{};
   if(url==='https://api.vndb.org/kana/release')return Response.json({results:body.filters?.[0]==='extlink'?[{vns:[{id:'v2'}]}]:[]});
   if(url==='https://api.vndb.org/kana/vn')return Response.json({results:[{id:'v2',title:'Test VN',alttitle:'テスト',titles:[],image:{url:'https://t.vndb.org/cv/00/2.jpg'},description:'A test.',developers:[]}]});
   if(url.startsWith('https://t.vndb.org/'))return new Response(VNDB_JPEG);
   return new Response('',{status:404});
  };
  const realFetch=globalThis.fetch;globalThis.fetch=network;
  try{await new GameEnrichment(root,()=>{},network,async()=>'').run('game-1','en',true);}finally{globalThis.fetch=realFetch;}
  assert.equal(coverFile(root),picked);
  assert.deepEqual(fs.readFileSync(path.join(root,'data','assets','covers',picked)),PNG);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
