// SPDX-License-Identifier: GPL-3.0-or-later
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startEdge}=require('./library-views-perf.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));
test('switching back to translation retries an incomplete article without reopening it',{skip:!hasEdge},async t=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-daily-reader-'));
 let browser;t.after(async()=>{try{await browser?.stop();}finally{await fs.promises.rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:150});}});
 browser=await startEdge(profile);
 const source=fs.readFileSync(path.join(__dirname,'../web/daily-view.js'),'base64');
 const result=await browser.evaluate(`(async()=>{
  const {openReader}=await import('data:text/javascript;base64,${source}'),notices=[];
  let calls=0,loaded;
  const api=async cmd=>{
   if(cmd==='daily_article')return new Promise(resolve=>{loaded=resolve;});
   if(cmd==='daily_translate')return ++calls===1?{texts:['','Second'],error:'TRANSLATION_HTTP_429'}:{texts:['First','Second']};
  };
  const {close}=openReader({title:'Fixture',link:'https://example.org/news'},{api,locale:'en',esc:String,toast:t=>notices.push(t)});
  const mode=m=>document.querySelector('[data-rd-mode="'+m+'"]').click();
  const wait=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}throw Error('reader state timed out');};
  mode('tr');
  loaded({state:'ok',via:'direct',paragraphs:[{text:'一。'},{text:'二。'}]});
  await wait(()=>notices.length);
  await wait(()=>!document.querySelector('.rd-text').classList.contains('rd-swap'));
  const initialCalls=calls;
  mode('ja');await wait(()=>document.querySelector('.rd-text').dataset.mode==='ja');
  mode('tr');await wait(()=>document.querySelector('.rd-tr')?.textContent==='First');
  const lines=[...document.querySelectorAll('.rd-tr')].map(p=>p.textContent);
  close();return {lines,calls,initialCalls,notices:notices.length};
 })()`);
 assert.deepEqual(result,{lines:['First','Second'],calls:2,initialCalls:1,notices:1});
});
