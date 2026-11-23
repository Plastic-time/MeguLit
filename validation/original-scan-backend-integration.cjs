// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Actual dialog → persistent dispatch → real worker, using only an owned synthetic game/store
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const target=path.resolve(process.env.ORIGINAL_SCAN_TARGET||path.join(__dirname,'..'));
const out=path.resolve(process.env.ORIGINAL_SCAN_ARTIFACTS||path.join(os.tmpdir(),'original-scan-backend-integration'));
const {chromium}=require(process.env.ORIGINAL_SCAN_PLAYWRIGHT||'H:/MeguLit-Work/pw/node_modules/playwright-core');
fs.mkdirSync(out,{recursive:true});
const owned=fs.mkdtempSync(path.join(out,'fixture-'));
process.env.MEGULIT_ROOT=owned;process.env.MEGULIT_NO_PREWARM='1';
const initialSourceHashes=sourceHashes();
const {dispatch}=require(path.join(target,'services/bridge.cjs'));
const store=require(path.join(target,'services/store.cjs'));
const jobs=require(path.join(target,'services/embedded-japanese-jobs.cjs'));
const embedded=require(path.join(target,'services/embedded-japanese.cjs'));
const original=require(path.join(target,'services/original-text.cjs'));
const {install}=require(path.join(target,'validation/helpers/utage-embedded-fixture.cjs'));
const web=path.join(target,'web'),app=fs.readFileSync(path.join(web,'app.js'),'utf8');
function slice(a,b){const start=app.indexOf(a),end=app.indexOf(b,start);assert.ok(start>=0&&end>start,a);return app.slice(start,end);}
const restore=slice('function japaneseRestore(only){','\nfunction modal(html)');
const modal=slice('function modal(html){','\nfunction gameDetail(');
const auto=slice('const jpAutoWords=','\n/* one notice per automatic switch');
assert.match(app,/onJapaneseRestore:only=>japaneseRestore\(only\)/);
assert.match(app,/b\.dataset\.tool==='0'\?japaneseRestore\(\)/);
const links=[...fs.readFileSync(path.join(web,'index.html'),'utf8').matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map(m=>m[0]).join('\n');
const games=[],fixtures=new Map(),calls=[],workerReceipts=[],checks=[],screenshots=[],errors=[],fileProofs=[];
function snapshot(dir){const files={};function walk(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const f=path.join(folder,entry.name);if(entry.isDirectory())walk(f);else if(entry.isFile())files[path.relative(dir,f).split(path.sep).join('/')]=sha(fs.readFileSync(f));else throw Error('FIXTURE_SPECIAL_FILE');}}walk(dir);return files;}
function check(value,label){assert.ok(value,label);checks.push(label);}
for(const id of ['detail','tools','cancel']){
 const fixture=install(path.join(owned,'games',id));fixtures.set(id,fixture);
 games.push({id,title:'Synthetic '+id+' game — never executed',executable:fixture.exe});
 const db=store.openStore(owned);try{db.prepare('INSERT INTO games(id,title,executable,original) VALUES(?,?,?,?)').run(id,games.at(-1).title,fixture.exe,JSON.stringify({library:{contentLanguage:'zh'}}));}finally{db.close();}
}
const before=Object.fromEntries([...fixtures].map(([id,f])=>[id,snapshot(f.dir)]));
const allowed=new Set(['jp_restore_list','jp_restore_detect','jp_restore_scan','jp_restore_scan_status','jp_restore_scan_cancel','jp_restore_apply','jp_restore_undo','jp_auto_status']);
const harness=`import {mountOriginalScan} from '/original-scan.js';
let locale='zh',model={games:${JSON.stringify(games)}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const errorMessage=e=>e?.message||String(e),toast=s=>window.notices.push(String(s)),jpSourceNote=()=>'',discImagePaths=()=>[],installDisc=async()=>{},cover=()=>'',invoke=async()=>{throw Error('FIXTURE_NATIVE_INVOKE_FORBIDDEN');};
const lsWords={zh:{open:'打开Steam',done:()=>'',eng:{}},en:{open:'Open Steam',done:()=>'',eng:{}},ja:{open:'Steamを開く',done:()=>'',eng:{}}},lsEng=()=>'',lsVal=()=>'';
window.notices=[];window.calls=[];
async function api(action,p={}){window.calls.push([action,p]);const response=await fetch('/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...p})});const r=await response.json();if(!r.ok)throw Error(r.error);return r.data;}
${restore}\n${modal}\n${auto}
window.openFixture=(id,single)=>japaneseRestore(single?model.games.find(g=>g.id===id):undefined);window.ready=true;`;
let browser,context,server,deadline,failed=false;
const runtime={reader:{refreshTextSource(){}}};
async function api(request){
 assert.ok(request&&typeof request==='object'&&!Array.isArray(request),'object request');
 if(request.action==='home')return {games}; // Display refresh only, explicitly fixture-owned
 assert.ok(allowed.has(request.action),'API_WHITELIST_'+request.action);
 if(request.action!=='jp_restore_list')assert.ok(fixtures.has(String(request.id)),'FIXTURE_ID_REQUIRED');
 calls.push({action:request.action,id:request.id,requestId:request.requestId,jobId:request.jobId});
 const result=await dispatch(request,runtime);
 if(result?.jobId){const job=jobs._internal.jobs.get(result.jobId);workerReceipts.push({action:request.action,id:request.id,jobId:result.jobId,state:result.state,operation:result.operation,pid:job?.child?.pid||null,childClosed:job?.child===null,result:result.result?{...result.result,sources:undefined}:undefined});}
 return result;
}
async function serve(req,res){
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/api'){
  if(req.method!=='POST'){res.statusCode=405;return res.end();}
  try{let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>16384)throw Error('FIXTURE_REQUEST_BUDGET');}const data=await api(JSON.parse(body));res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,data}));}
  catch(error){errors.push({kind:'api',message:error.message});res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:false,error:error.message}));}return;
 }
 if(req.method!=='GET'){res.statusCode=405;return res.end();}
 if(url.pathname==='/'){res.setHeader('content-type','text/html');return res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">'+links+'</head><body><p>Controlled UI + actual backend / synthetic game files only</p><div id="app"></div><script type="module" src="/harness.js"></script></body></html>');}
 if(url.pathname==='/harness.js'){res.setHeader('content-type','text/javascript');return res.end(harness);}
 const file=path.resolve(web,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(web+path.sep)||!['.js','.css','.svg','.woff','.woff2','.png'].includes(path.extname(file))){res.statusCode=403;return res.end();}
 try{const bytes=fs.readFileSync(file);res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(bytes);}catch{res.statusCode=404;res.end();}
}
function sourceHashes(){return Object.fromEntries(['web/app.js','web/original-scan.js','services/bridge.cjs','services/embedded-japanese.cjs','services/embedded-japanese-jobs.cjs','services/embedded-japanese-worker.cjs','services/original-engines/utage-embedded.cjs'].map(f=>[f,sha(fs.readFileSync(path.join(target,f)))]));}
async function run(){
 server=http.createServer((req,res)=>void serve(req,res).catch(e=>{errors.push({kind:'http',message:e.message});res.destroy();}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:'msedge',headless:true,timeout:15000});
 context=await browser.newContext({viewport:{width:1280,height:900}});const page=await context.newPage();page.setDefaultTimeout(15000);
 page.on('pageerror',e=>errors.push({kind:'page',message:e.message}));
 await page.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
 for(const [id,single] of [['detail',true],['tools',false]]){
  await page.goto(origin);await page.waitForFunction(()=>window.ready);await page.evaluate(([id,single])=>window.openFixture(id,single),[id,single]);
  if(!single)await page.locator('[data-id="tools"]').click();
  await page.locator('[data-os-scan]').click();await page.waitForSelector('[data-phase=preview]');
  const scan=[...jobs._internal.jobs.values()].filter(j=>j.id===id&&j.operation==='scan').at(-1);
  check(scan?.state==='done'&&scan.child===null,id+': real scan worker closed before preview');
  check(scan.result.coverage.japaneseLines===36&&scan.result.coverage.localTranslations===35&&scan.result.coverage.missingTranslations===1,id+': actual worker coverage 36/35/1');
  const counts=await page.locator('[data-os-counts]').innerText();check(counts.includes('36')&&counts.includes('35')&&counts.includes('1'),id+': actual coverage rendered');
  assert.deepEqual(snapshot(fixtures.get(id).dir),before[id]);checks.push(id+': scan leaves every original file hash unchanged');
  const preview=path.join(out,id+'-preview.png');await page.screenshot({path:preview});screenshots.push(preview);
  await page.locator('[data-os-restore]').click();await page.waitForSelector('[data-phase=confirm]');
  check(!calls.some(c=>c.action==='jp_restore_apply'&&c.id===id),id+': separate confirmation before any apply dispatch');
  assert.deepEqual(snapshot(fixtures.get(id).dir),before[id]);checks.push(id+': confirmation screen still has no file changes');
  await page.locator('[data-os-confirm]').click();await page.waitForSelector('[data-phase=applied]',{timeout:60000});
  const apply=[...jobs._internal.jobs.values()].filter(j=>j.id===id&&j.operation==='restore').at(-1);
  check(apply?.state==='done'&&apply.child===null&&apply.result.applied===2,id+': actual restore worker finished two files');
  const appliedFiles=snapshot(fixtures.get(id).dir);
  check(appliedFiles['Game_Data/sharedassets0.assets']!==before[id]['Game_Data/sharedassets0.assets'],id+': restored asset bytes really changed');
  const provider=original.provider(owned,fixtures.get(id).exe);
  check(provider.resolve('これから最初の旅に出ます。').translation==='从这里出发踏上旅程。',id+': actual provider resolves fixture local translation');
  const shot=path.join(out,id+'-applied.png');await page.screenshot({path:shot});screenshots.push(shot);
  await page.locator('[data-jr-undo]').waitFor({state:'visible'});await page.locator('[data-jr-undo]').click();
  await page.waitForFunction(()=>window.calls.some(c=>c[0]==='jp_restore_undo'));
  await page.waitForFunction(()=>!document.querySelector('[data-phase=applying]')&&!document.querySelector('[data-jr-folder-scan]')?.inert,{},{timeout:60000});
  const undo=[...jobs._internal.jobs.values()].filter(j=>j.id===id&&j.operation==='undo').at(-1);
  check(undo?.state==='done'&&undo.child===null&&undo.result.restored===2,id+': actual undo worker completed and closed');
  const after=snapshot(fixtures.get(id).dir);assert.deepEqual(after,before[id],id+': complete original file set and SHA256');
  fileProofs.push({id,before:before[id],applied:appliedFiles,undo:after});
  check(embedded.manifest(fixtures.get(id).dir)===null,id+': no active restoration manifest after undo');
  checks.push(id+': every original file SHA256 restored exactly');
  await page.locator('[data-jr-close]').click();await page.waitForSelector('dialog',{state:'detached'});
 }
 // Trigger close in the same browser task as scan; the real cancel command must await its own worker close
 await page.goto(origin);await page.waitForFunction(()=>window.ready);await page.evaluate(()=>window.openFixture('cancel',true));await page.locator('[data-os-scan]').waitFor();
 await page.evaluate(()=>{document.querySelector('[data-os-scan]').click();document.querySelector('[data-jr-close]').click();});
 await page.waitForSelector('dialog',{state:'detached'});
 const cancel=[...jobs._internal.jobs.values()].filter(j=>j.id==='cancel'&&j.operation==='scan').at(-1);
 check(calls.some(c=>c.id==='cancel'&&c.action==='jp_restore_scan_cancel'),'close sends actual cancel dispatch');
 check(cancel?.state==='cancelled'&&cancel.child===null,'close waits for real cancelled worker close');
 assert.deepEqual(snapshot(fixtures.get('cancel').dir),before.cancel);checks.push('cancel preserves every fixture game file hash');
 check([...jobs._internal.jobs.values()].every(j=>j.child===null&&!['running','queued','cancelling'].includes(j.state)),'all owned workers terminal with no retained child');
 assert.deepEqual(sourceHashes(),initialSourceHashes);checks.push('target source hashes unchanged throughout the run');
 check(errors.length===0,'no page or API errors');
}
const started=Date.now();
function killOwnedJob(job){const child=job.child;if(child&&child.exitCode===null&&child.signalCode===null)child.kill();}
deadline=setTimeout(()=>{failed=true;errors.push({kind:'deadline',message:'INTEGRATION_DEADLINE'});for(const job of jobs._internal.jobs.values())killOwnedJob(job);void browser?.close();},180000);
function bounded(promise,ms,code){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(code)),ms);})]).finally(()=>clearTimeout(timer));}
run().catch(error=>{failed=true;errors.push({kind:'assertion',message:error.stack});process.exitCode=1;}).finally(async()=>{
 clearTimeout(deadline);
 for(const job of jobs._internal.jobs.values())if(['queued','running','cancelling'].includes(job.state)){
  try{await bounded(job.operation==='scan'?jobs.cancel(job.id,{jobId:job.jobId}):job.closed,60000,'FIXTURE_WORKER_CLEANUP_DEADLINE');}
  catch(error){failed=true;errors.push({kind:'worker-cleanup',message:error.message});killOwnedJob(job);try{await bounded(job.closed,5000,'FIXTURE_CHILD_EXIT_UNCONFIRMED');}catch(e){errors.push({kind:'worker-close',message:e.message});}}
 }
 if(context)await context.close().catch(e=>{failed=true;errors.push({kind:'context-close',message:e.message});});
 if(browser)await browser.close().catch(e=>{failed=true;errors.push({kind:'browser-close',message:e.message});});
 if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
 let head='unknown';try{head=execFileSync('git',['-C',target,'rev-parse','HEAD'],{encoding:'utf8',windowsHide:true,timeout:3000}).trim();}catch{}
 const finalJobs=[...jobs._internal.jobs.values()].map(j=>({id:j.id,operation:j.operation,state:j.state,error:j.error||null,childClosed:j.child===null,result:j.result?{applied:j.result.applied,restored:j.result.restored,localIndex:j.result.localIndex,patch:j.result.patch}:null}));
 const report={passed:!failed,checks,errors,screenshots,calls,workerReceipts,finalJobs,fileProofs,target,head,owned,initialSourceHashes,sourceHashes:sourceHashes(),elapsedMs:Date.now()-started,
 scope:'Actual app dialog functions/module/CSS via whitelisted HTTP to persistent production bridge.dispatch, real worker, synthetic SQLite and game bytes. home display is fixture-only. Fake Game.exe never launched; no real game, COM or native input acceptance',
 reuse:{existing:'validation/original-scan-dialog-integration.cjs and helpers/utage-embedded-fixture.cjs',library:'Existing Playwright Core, Apache-2.0; no new dependency',docs:['https://playwright.dev/docs/api/class-browser','https://playwright.dev/docs/api/class-apirequestcontext']}};
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:checks.length,errors,result:path.join(out,'result.json')}));if(failed)process.exitCode=1;
});
