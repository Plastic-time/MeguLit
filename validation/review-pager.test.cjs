// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const {startEdge}=require('./library-views-perf.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));

test('the review page number and both arrows load their displayed page',{skip:!hasEdge},async t=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-review-pager-'));
 let browser;
 t.after(async()=>{
  await browser?.stop();
  await fs.promises.rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:150});
 });
 browser=await startEdge(profile);
 const source=fs.readFileSync(path.join(__dirname,'../web/game-reception.js'),'base64');
 const result=await browser.evaluate(`(async()=>{
  const {bindReception,receptionHTML}=await import('data:text/javascript;base64,${source}');
  const loaded=[],id='game',value={steam:{percent:90,total:30}};
  let failPage=false;
  const api=async(action,request)=>{
   if(action==='game_reviews_summary')return {platforms:[{key:'steam',name:'Steam',available:true}]};
   if(action==='game_reviews'){
    const page=Number(request.page)||1;
    loaded.push(page);
    if(failPage){failPage=false;throw Error('REVIEW_NETWORK');}
    return {available:true,items:[{id:'r'+page,text:'Review '+page}],page,pages:3,total:30};
   }
   return {};
  };
  document.body.innerHTML=receptionHTML(value,'en',String,id);
  bindReception(document.body,{api,id,locale:'en',esc:String,value});
  async function click(selector){
   document.querySelector(selector).click();
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  await click('[data-review-platform="steam"]');
  await click('[data-rv-page][aria-label]:not(:disabled)');
  await click('.review-pager button:not([aria-label])[data-rv-page="3"]');
  await click('.review-pager button[aria-label]:first-child');
  const pages=loaded.splice(0);
  failPage=true;
  document.querySelector('[data-review-jump]').value=3;
  await click('[data-review-go]');
  await click('[data-review-retry]');
  return {pages,retried:loaded};
 })()`);
 assert.deepEqual(result.pages,[1,2,3,2]);
 assert.deepEqual(result.retried,[3,3]);
});
