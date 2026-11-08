'use strict';
// A folder game is named the way its folder is. VNDB often keeps that name only as an alias (千恋万花 for
// 千恋＊万花, 拔作岛 for 抜きゲーみたいな島に…). The search finds the work, but the match ignored aliases, so the game got
// no VNDB entry and no cover.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const store=require('../services/store.cjs'),{GameEnrichment,pickVn}=require('../services/game-enrichment.cjs');

const SENREN={id:'v19073',title:'Senren * Banka',alttitle:'千恋＊万花',titles:[{title:'Senren * Banka'},{title:'千恋＊万花'},{title:'千戀＊萬花'}],aliases:['Senren * Banka: A Thousand Colors of Love','千変万化','千恋万花'],image:{url:'https://t.vndb.org/cv/00/1.jpg'}};
const JPEG=Buffer.from([0xff,0xd8,0xff,0xe0,0x56,0x4e,0x44,0x42]);

test('a VNDB alias that equals the folder name is a match',()=>{
 assert.equal(pickVn([SENREN],'千恋万花')?.id,'v19073');
});

test('a folder game named by a VNDB alias gets its VNDB entry and cover',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-alias-')),exe=path.join(root,'千恋万花','SenrenBanka.exe');
 fs.mkdirSync(path.dirname(exe),{recursive:true});fs.writeFileSync(exe,'MZ');
 const db=store.openStore(root);
 try{db.prepare('INSERT INTO games(id,title,executable,cover,source,original) VALUES(?,?,?,?,?,?)').run('game-1','千恋万花',exe,'','folder',JSON.stringify({library:{names:['千恋万花']}}));}finally{db.close();}
 // Like VNDB, answer only the fields that were asked for.
 const network=async(url,options={})=>{
  url=String(url);const body=options.body?JSON.parse(options.body):{};
  if(url==='https://api.vndb.org/kana/vn'&&body.filters?.[0]==='search'){const {aliases,...rest}=SENREN;return Response.json({results:[String(body.fields).split(',').includes('aliases')?SENREN:rest]});}
  if(url==='https://api.vndb.org/kana/vn')return Response.json({results:[{description:'A test.',alttitle:SENREN.alttitle}]});
  if(url==='https://api.vndb.org/kana/release')return Response.json({results:[]});
  if(url===SENREN.image.url)return new Response(JPEG);
  return new Response('',{status:404});
 };
 const realFetch=globalThis.fetch;globalThis.fetch=network;
 try{await new GameEnrichment(root,()=>{},network,async()=>'').run('game-1','zh',false);}finally{globalThis.fetch=realFetch;}
 const check=store.openStore(root);
 try{
  const row=check.prepare('SELECT cover,original FROM games WHERE id=?').get('game-1');
  assert.equal(JSON.parse(row.original).library.vndbId,'v19073');
  assert.deepEqual(fs.readFileSync(path.join(root,'data','assets','covers',row.cover)),JPEG);
 }finally{check.close();fs.rmSync(root,{recursive:true,force:true});}
});
