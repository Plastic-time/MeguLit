// SPDX-License-Identifier: GPL-3.0-or-later
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startEdge}=require('./library-views-perf.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));
const source=name=>fs.readFileSync(path.join(__dirname,'../web',name),'utf8');
const moduleURL=js=>'data:text/javascript;base64,'+Buffer.from(js).toString('base64');

test('late statistics requests leave the selected period, panels and loading state intact',{skip:!hasEdge},async t=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-statistics-period-'));
 let browser;
 t.after(async()=>{try{await browser?.stop();}finally{await fs.promises.rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:150});}});
 browser=await startEdge(profile);
 const view=source('statistics-view.js').replace('./statistics-i18n.js',moduleURL(source('statistics-i18n.js')));
 const module=moduleURL(source('statistics-grimoire.js').replace('./statistics-view.js',moduleURL(view)));
 const result=await browser.evaluate(`(async()=>{
  const {mountStatistics}=await import('${module}');
  const root=document.body,requests=[],tick=()=>new Promise(r=>setTimeout(r,0));
  const api=(_,period)=>new Promise((resolve,reject)=>requests.push({
   done:()=>resolve({period,buckets:[{day:period.date}],totals:{},games:[],hours:[],weekdays:[],topLookups:[]}),reject
  }));
  await mountStatistics(root,{api,env:{locale:'en',esc:String},selection:{range:'month',date:'2026-11-05'}});
  const next=()=>root.querySelector('[data-shift="1"]').click(),keys=root.querySelector('[data-p="keys"]');
  next();requests[1].done();await tick();
  requests[0].done();await tick();
  const label=root.querySelector('[data-label]').textContent;
  next();next();requests[2].reject(Error('old request'));await tick();
  const loading=keys.classList.contains('stg-loading'),staleError=keys.textContent.includes('old request');
  requests[3].done();await tick();
  next();next();requests[5].done();await tick();
  const current=keys.innerHTML;
  requests[4].reject(Error('late failure'));await tick();
  const kept=keys.innerHTML===current;
  next();requests[6].reject(Error('current failure'));await tick();
  return {label,loading,staleError,kept,currentError:keys.textContent.includes('current failure'),finished:!keys.classList.contains('stg-loading')};
 })()`);
 assert.deepEqual(result,{label:'December 2026',loading:true,staleError:false,kept:true,currentError:true,finished:true});
});
