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
 assert.equal(service.readSources().game.bangumi.id,null);
 assert.equal(service.readSources().game.steam,undefined);
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

const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));
test('a failed summary leaves an open review page readable and closable',{skip:!hasEdge},async t=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-review-summary-'));
 let browser;
 t.after(async()=>{
  await browser?.stop();
  await fs.promises.rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:150});
 });
 browser=await require('./library-views-perf.cjs').startEdge(profile);
 const source=fs.readFileSync(path.join(__dirname,'../web/game-reception.js'),'base64');
 const result=await browser.evaluate(`(async()=>{
  const {bindReception,receptionHTML}=await import('data:text/javascript;base64,${source}');
  const id='game',value={};
  let finishSummary;
  const api=async action=>{
   if(action==='game_reviews_summary')return new Promise(resolve=>{finishSummary=resolve;});
   if(action==='game_reviews')return {available:true,items:[{id:'review',text:'Readable review'}],page:1,pages:1,total:1};
   return {};
  };
  document.body.innerHTML=receptionHTML(value,'en',String,id);
  bindReception(document.body,{api,id,locale:'en',esc:String,value});
  document.querySelector('[data-review-platform="bangumi"]').click();
  finishSummary({platforms:[{key:'bangumi',name:'Bangumi',region:'zh',available:false,error:'REVIEW_NETWORK'}]});
  await new Promise(resolve=>setTimeout(resolve,0));
  const visible=document.querySelector('.review-list')?.textContent.includes('Readable review')||false;
  const tab=document.querySelector('[data-review-platform="bangumi"]');
  const enabled=tab?.getAttribute('aria-disabled')!=='true';
  tab?.click();
  return {visible,enabled,closed:!!document.querySelector('[data-state="error"]')};
 })()`);
 assert.deepEqual(result,{visible:true,enabled:true,closed:true});
});
