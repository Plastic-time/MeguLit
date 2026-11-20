// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const {GameReviews}=require('../services/game-reviews.cjs');

function reviews(t,fetcher){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-review-lookup-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const service=new GameReviews(root,fetcher);
 service.game=id=>({id,titles:['Some Game'],vndb:'',appid:''});
 return service;
}

test('review summary distinguishes a failed search from a completed search with no matches',async t=>{
 const service=reviews(t,async url=>{
  if(url.startsWith('https://api.bgm.tv/'))return Response.json({data:[]});
  return new Response('',{status:503});
 });
 const {platforms}=await service.summary('game');
 assert.deepEqual(platforms.filter(p=>p.error==='REVIEW_NETWORK').map(p=>p.key),['twodfan','egs','vndb','steam']);
 const miss=platforms.find(p=>p.key==='bangumi');
 assert.equal(miss.available,false);
 assert.equal(miss.error,undefined);
});

test('a failed VNDB request does not save a missing Steam match for the next attempt',async t=>{
 let online=false;
 const service=reviews(t,async url=>{
  if(!online)return new Response('',{status:503});
  if(url.endsWith('/vn'))return Response.json({results:[{id:'v1',title:'Some Game'}]});
  assert.ok(url.endsWith('/release'));
  return Response.json({results:[{extlinks:[{url:'https://store.steampowered.com/app/123/'}]}]});
 });
 await assert.rejects(service.page('game','steam'),/REVIEW_HTTP_503/);
 online=true;
 assert.deepEqual(await service.identity(service.game('game'),'steam'),{id:'123'});
});
