// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startEdge}=require('./library-views-perf.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(file=>file&&fs.existsSync(file));

test('late translations and failures leave the selected review language intact',{skip:!hasEdge},async t=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-review-language-'));
 let browser;t.after(async()=>{
  await browser?.send('Browser.close').catch(()=>{});browser?.stop();
  await fs.promises.rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:150});
 });
 browser=await startEdge(profile);
 const source=fs.readFileSync(path.join(__dirname,'../web/game-reception.js'),'base64');
 const result=await browser.evaluate(`(async()=>{
  const {bindReception,receptionHTML}=await import('data:text/javascript;base64,${source}');
  const id='game',value={steam:{percent:90,total:1}},requests=[];let items=[{id:'a',text:'Original'}];
  const api=async(action,request)=>{
   if(action==='game_reviews_summary')return {platforms:[{key:'steam',name:'Steam',available:true}]};
   if(action==='game_reviews')return {available:true,items,page:1,pages:1,total:items.length};
   if(action==='reviews_translate')return new Promise((resolve,reject)=>requests.push({target:request.target,resolve,reject}));
   return {};
  };
  document.body.innerHTML=receptionHTML(value,'en',String,id);
  bindReception(document.body,{api,id,locale:'en',esc:String,value});
  const q=sel=>document.querySelector(sel),tick=()=>new Promise(r=>setTimeout(r,0)),button=()=>q('[data-review-translate]');
  function select(lang){const select=q('[data-review-target]');select.value=lang;select.dispatchEvent(new Event('change'));}
  q('[data-review-platform="steam"]').click();await tick();button().click();
  select('ja');requests[1].resolve({texts:['Japanese']});await tick();
  requests[0].resolve({texts:['English']});await tick();
  const japanese=q('.review-list p').textContent;
  select('ko');select('zh-TW');requests[2].reject(Error('old failure'));await tick();
  const busy=button().disabled,error=q('.review-translate-error')?.textContent||'';
  select('ja');const cached={text:q('.review-list p').textContent,busy:button().disabled};
  requests[3].resolve({texts:['Chinese']});await tick();
  const final=q('.review-list p').textContent;
  select('en');const englishRetry=requests.at(-1).target==='en';
  requests.at(-1).resolve({error:'REVIEW_HTTP_429',texts:[]});await tick();
  const currentError=q('.review-translate-error')?.textContent.includes('rate limited')||false;
  q('[data-review-platform="steam"]').click();items=[];
  q('[data-review-platform="steam"]').click();await tick();
  const target=q('[data-review-target]');target.focus();select('ko');
  return {japanese,busy,error,cached,final,englishRetry,currentError,focus:document.activeElement===target,requests:requests.map(x=>x.target)};
 })()`);
 assert.deepEqual(result,{japanese:'Japanese',busy:true,error:'',cached:{text:'Japanese',busy:false},
  final:'Japanese',englishRetry:true,currentError:true,focus:true,requests:['en','ja','ko','zh-TW','en']});
});
