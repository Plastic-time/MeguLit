'use strict';
// A VNDB entry set by the user in the edit dialog (save_game vndb) is kept apart from automatic matching: library scans
// rewrite original.library, and refresh, title search and the Steam appid lookup must not replace it.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-vndb-'));process.env.MEGULIT_ROOT=root;
const store=require('../services/store.cjs'),{dispatch}=require('../services/bridge.cjs'),{GameEnrichment,vndbIdFrom}=require('../services/game-enrichment.cjs');
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));

const exe=path.join(root,'game','game.exe');fs.mkdirSync(path.dirname(exe),{recursive:true});fs.writeFileSync(exe,'MZ');
const JPEG=Buffer.from([0xff,0xd8,0xff,0xe0,0x76,0x32]);
function reset(library){const db=store.openStore(root);try{db.prepare('DELETE FROM games').run();db.prepare('INSERT INTO games(id,title,executable,cover,source,original) VALUES(?,?,?,?,?,?)').run('game-1','月影的幻影',exe,'','folder',JSON.stringify({library}));}finally{db.close();}}
const original=()=>{const db=store.openStore(root);try{return JSON.parse(db.prepare('SELECT original FROM games WHERE id=?').get('game-1').original);}finally{db.close();}};
const save=vndb=>dispatch({action:'save_game',id:'game-1',title:'月影的幻影',executable:exe,vndb});

test('VNDB IDs and links are read; other text is refused',()=>{
 for(const value of ['v19964','19964',' V19964 ','https://vndb.org/v19964','https://vndb.org/v19964/chars#main'])assert.equal(vndbIdFrom(value),'v19964');
 assert.equal(vndbIdFrom(''),'');
 for(const value of ['abc','v0','https://example.com/v19964','r12345'])assert.throws(()=>vndbIdFrom(value),/INVALID_VNDB_ID/);
});

test('save_game stores, keeps and clears the entry',async()=>{
 reset({names:['月影的幻影']});
 assert.equal((await save('https://vndb.org/v19964')).vndbChanged,true);assert.equal(original().vndbManual,'v19964');
 assert.equal((await save(undefined)).vndbChanged,false);assert.equal(original().vndbManual,'v19964');
 await assert.rejects(save('not an id'),/INVALID_VNDB_ID/);assert.equal(original().vndbManual,'v19964');
 assert.equal((await save('')).vndbChanged,true);assert.equal(original().vndbManual,undefined);
});

test('the reviews panel uses the entry instead of a remembered VNDB miss',async()=>{
 reset({names:['月影的幻影']});await save('v19964');
 const {GameReviews}=require('../services/game-reviews.cjs');
 fs.mkdirSync(path.join(root,'data','config'),{recursive:true});
 fs.writeFileSync(path.join(root,'data','config','review-sources.json'),JSON.stringify({'game-1':{vndb:{id:null,at:Date.now()}}}));
 const reviews=new GameReviews(root,async()=>{throw Error('no network in this test');});
 assert.equal((await reviews.identity(reviews.game('game-1'),'vndb'))?.id,'v19964');
});

test('metadata follows the entry, even after a scan rewrote library and on refresh',async()=>{
 // An earlier wrong match (v1) on a Steam appid that VNDB links to v1 as well.
 reset({names:['月影的幻影'],vndbId:'v1',appid:'100'});
 await save('v2');
 const db=store.openStore(root);try{const o=original();o.library.vndbId=null;db.prepare('UPDATE games SET original=? WHERE id=?').run(JSON.stringify(o),'game-1');}finally{db.close();}
 const asked=[];
 const network=async(url,options={})=>{
  url=String(url);const body=options.body?JSON.parse(options.body):{};asked.push(url+' '+JSON.stringify(body.filters||''));
  if(url==='https://api.vndb.org/kana/release')return Response.json({results:body.filters?.[0]==='extlink'?[{vns:[{id:'v1'}]}]:[]});
  if(url==='https://api.vndb.org/kana/vn'){const id=body.filters?.[0]==='id'?body.filters[2]:'v1';return Response.json({results:[{id,title:'Tsukikage no Simulacre',alttitle:'月影のシミュラクル',titles:[],image:{url:'https://t.vndb.org/cv/00/'+id+'.jpg'},description:'A test.',developers:[]}]});}
  if(url.startsWith('https://t.vndb.org/'))return new Response(JPEG);
  return new Response('',{status:404});
 };
 const realFetch=globalThis.fetch;globalThis.fetch=network;
 try{await new GameEnrichment(root,()=>{},network,async()=>'').run('game-1','en',true);}finally{globalThis.fetch=realFetch;}
 assert.equal(original().library.vndbId,'v2');
 assert.ok(asked.some(line=>line.includes('"id","=","v2"')));
 assert.ok(!asked.some(line=>line.includes('extlink')),'the Steam appid must not replace the chosen entry');
 assert.ok(asked.some(line=>line.includes('/cv/00/v2.jpg')),'the cover comes from the chosen entry');
});
