'use strict';
/* SPDX-License-Identifier: GPL-3.0-or-later
   Silent hot updates (user 2026-11-15: 自动静默，要用户点的只包含热更新无法的内容): a small package that fits is applied
   with no card, the full package still asks, a failed small package is put back and offered as the full one next time,
   and nothing is applied while the user is busy or a game is attached. Node modules only, MeguLit.exe is never started. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process');
const u=require('../services/update.cjs'),hot=require('../services/hot-update.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const D='ab12cd34ef56'+'0'.repeat(52);
const url=n=>'https://github.com/ilynthn/MeguLit/releases/download/v1.5.2/'+n;
const notice=()=>import('../web/update-notice.js');

function release({hotDigest='2'.repeat(64),hotSize=40000}={}){
 const hotName='MeguLit-v1.5.2-hot-from-v1.5.1-ab12cd34ef56.zip';
 return {tag_name:'v1.5.2',body:'- 修复A\n---\n- Fixed A',assets:[{name:'MeguLit-v1.5.2-win-x64.zip',size:30000000,digest:'sha256:'+'1'.repeat(64),browser_download_url:url('MeguLit-v1.5.2-win-x64.zip')},{name:hotName,size:hotSize,digest:'sha256:'+hotDigest,browser_download_url:url(hotName)}]};
}
function installRoot(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'silent-hot-'));fs.mkdirSync(path.join(root,'data'));
 fs.writeFileSync(path.join(root,'data','update-installed.json'),JSON.stringify({version:'1.5.1',digest:D}));
 fs.writeFileSync(path.join(root,'data','icon-refresh.json'),JSON.stringify({version:'1.5.1'}));
 fs.writeFileSync(path.join(root,'MeguLit.exe'),'exe');fs.mkdirSync(path.join(root,'web'));fs.writeFileSync(path.join(root,'web','app.js'),'old');
 return root;
}
function makeZip(dir,files,manifest){
 const src=path.join(dir,'zsrc','MeguLit');
 for(const [p,body] of Object.entries(files)){const to=path.join(src,...p.split('/'));fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,body);}
 fs.writeFileSync(path.join(src,'hot.json'),JSON.stringify(manifest));
 const zip=path.join(dir,'hot-src.zip');
 /* 2026-11-19 (Signed build of v1.4.17 on the runner: HOT_MANIFEST_MISSING) .NET ZipFile with the MeguLit folder as base, not the Compress-Archive cmdlet, whose module comes from whatever PSModulePath the parent shell left */
 const env={...process.env,S:src,Z:zip};delete env.PSModulePath;
 const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','Add-Type -AssemblyName System.IO.Compression.FileSystem; if(Test-Path -LiteralPath $env:Z){Remove-Item -LiteralPath $env:Z -Force}; [IO.Compression.ZipFile]::CreateFromDirectory($env:S,$env:Z,[IO.Compression.CompressionLevel]::Optimal,$true)'],{windowsHide:true,env});
 assert.equal(r.status,0,String(r.stderr));return zip;
}
/* a fake service: the bridge actions the page calls, with the update phases it goes through */
function fakeService({phases=['downloading','ready'],install=async()=>({phase:'installed',hot:true}),readerGame=()=>false}={}){
 const calls=[];let i=0;
 const api=async(action,args)=>{calls.push(action);
  if(action==='update_start')return {phase:phases[i++]||'ready',hot:true};
  if(action==='update_status')return {phase:phases[i++]||'ready',hot:true,error:phases[i-1]==='error'?'HTTP_500':undefined};
  if(action==='update_install')return install();
  if(action==='update_hot_failed')return {recorded:true,reason:args?.reason};
  if(action==='reader_status')return {ready:true,game:readerGame()};
  throw Error('unexpected '+action);};
 const invokes=[];const invoke=async(cmd,args)=>{invokes.push(cmd+(args?.dryRun?':dry':''));return true;};
 return {api,invoke,calls,invokes};
}
const memory=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};};

test('silent: the service marks a fitting small package as silent, a full package is not',async()=>{
 const root=installRoot(),rel=release();
 const fetcher=async x=>x.endsWith('/latest')?{ok:true,json:async()=>rel}:{ok:false,status:404};
 u.reset();let info=await u.check('1.5.1',fetcher,root);
 assert.equal(info.silent,true);assert.equal(info.hot,true);
 u.reset();info=await u.check('1.5.0',fetcher,root);
 assert.equal(info.newer,true);assert.equal(info.silent,false,'an install the small package does not fit takes the card');
 u.reset();
});

test('silent: a hot update is applied without rendering the card, the done note is kept for after the reload',async()=>{
 const {checkForUpdates}=await notice();
 const svc=fakeService(),keep=memory();let rendered=0,job;
 const info=await checkForUpdates({api:async(a,b)=>a==='update_check'?{newer:true,silent:true,hot:true,current:'1.5.1',latest:'1.5.2',notes:'- 修复A'}:svc.api(a,b),invoke:svc.invoke,version:'1.5.1',
  show:()=>{rendered++;},silent:(i,deps)=>{job=import('../web/update-notice.js').then(m=>m.silentHotUpdate(i,{...deps,sleep:async()=>{},busy:()=>'',keep:()=>keep}));}});
 assert.equal(info.silent,true);const r=await job;
 assert.equal(rendered,0,'no card');assert.deepEqual(r,{done:true});
 assert.deepEqual(svc.calls.filter(c=>c.startsWith('update_')),['update_start','update_status','update_install']);
 assert.deepEqual(svc.invokes,['hot_reload:dry','hot_reload'],'asks first, then restarts the service and reloads');
 assert.equal(JSON.parse(keep.getItem('megulit.hotUpdateDone')).version,'1.5.2');
});

test('silent: an update that needs the full package shows the card',async()=>{
 const {checkForUpdates}=await notice();let rendered=0,silent=0;
 await checkForUpdates({api:async()=>({newer:true,silent:false,hot:false,current:'1.5.1',latest:'1.5.2',notes:''}),invoke:async()=>{},version:'1.5.1',show:()=>{rendered++;},silent:()=>{silent++;}});
 assert.equal(rendered,1);assert.equal(silent,0);
});

test('silent: nothing is applied while the user is busy, it waits until idle',async()=>{
 const {silentHotUpdate}=await notice();
 const svc=fakeService(),order=[];let busyFor=3;
 const r=await silentHotUpdate({current:'1.5.1',latest:'1.5.2'},{api:async(a,b)=>{order.push(a);return svc.api(a,b);},invoke:svc.invoke,keep:()=>memory(),
  busy:()=>{if(busyFor>0){busyFor--;order.push('busy');return 'typing';}return '';},sleep:async()=>{}});
 assert.equal(r.done,true);
 assert.ok(order.lastIndexOf('busy')<order.indexOf('update_install'),'install only after the busy checks cleared');
});

test('silent: a running game holds the update until it closes',async()=>{
 const {silentHotUpdate}=await notice();
 let game=2,waits=0;const svc=fakeService({readerGame:()=>game-->0});
 const r=await silentHotUpdate({current:'1.5.1',latest:'1.5.2'},{api:svc.api,invoke:svc.invoke,keep:()=>memory(),busy:()=>'',sleep:async ms=>{if(ms===30000)waits++;}});
 assert.equal(r.done,true);assert.equal(waits,2,'waited twice for the game');
 assert.equal(svc.calls.filter(c=>c==='update_install').length,1);
});

test('silent: busy reasons cover activity, typing, dialogs, unsaved settings and holds',async()=>{
 const {busyReason}=await notice();
 const doc=(el=null,dialog=false)=>({activeElement:el,querySelector:()=>dialog?{}:null});
 const quiet={now:100000,last:0,unsaved:()=>false,holds:null};
 assert.equal(busyReason({...quiet,doc:doc()}),'');
 assert.equal(busyReason({...quiet,doc:doc(),last:95000}),'active');
 assert.equal(busyReason({...quiet,doc:doc({tagName:'INPUT',type:'text'})}),'typing');
 assert.equal(busyReason({...quiet,doc:doc({tagName:'INPUT',type:'checkbox'})}),'');
 assert.equal(busyReason({...quiet,doc:doc({tagName:'DIV',isContentEditable:true})}),'typing');
 assert.equal(busyReason({...quiet,doc:doc(null,true)}),'dialog');
 assert.equal(busyReason({...quiet,doc:doc(),unsaved:()=>true}),'unsaved');
 assert.equal(busyReason({...quiet,doc:doc(),holds:new Set([true])}),'held');
 const {createAutosave,hasUnsavedSettings}=await import('../web/settings-autosave.js');
 const a=createAutosave({save:async()=>{},delay:60000});a.update({x:1});assert.equal(hasUnsavedSettings(),true);await a.flush();assert.equal(hasUnsavedSettings(),false);a.stop();
});

test('silent: a failed apply puts the old files back and the next check offers the full package',{skip:process.platform!=='win32'},async()=>{
 const root=installRoot(),body={'web/app.js':'new app','web/brand-new.js':'x','services/z.cjs':'z'};
 const zip=makeZip(root,body,{version:'1.5.2',from:'1.5.1',files:Object.entries(body).map(([p,b])=>({path:p,sha256:sha(Buffer.from(b))}))});
 /* the third file fails to land: the first two are restored / removed */
 assert.throws(()=>hot.apply(root,zip,{beforeRename:p=>{if(p==='services/z.cjs')throw Error('EBUSY');}}),/HOT_WRITE_FAILED/);
 assert.equal(fs.readFileSync(path.join(root,'web','app.js'),'utf8'),'old');
 assert.equal(fs.existsSync(path.join(root,'web','brand-new.js')),false);
 assert.equal(fs.existsSync(path.join(root,'services','z.cjs')),false);
 assert.equal(fs.existsSync(path.join(root,'services','z.cjs.hot-new')),false);
 assert.equal(fs.existsSync(path.join(root,'data','hot-update.json')),false);

 /* through the updater: the package downloads and verifies, the apply fails, the reason is logged and remembered */
 const bytes=fs.readFileSync(zip),rel=release({hotDigest:sha(bytes),hotSize:bytes.length});
 const fetcher=async x=>x.endsWith('/latest')?{ok:true,json:async()=>rel}:x.includes('-hot-from-')?{ok:true,status:200,url:x,arrayBuffer:async()=>bytes}:{ok:false,status:404};
 u.reset();let info=await u.check('1.5.1',fetcher,root);assert.equal(info.silent,true);
 await u.start(root,'1.5.1',fetcher);assert.equal(u.status().phase,'ready');assert.equal(u.status().hot,true);
 await assert.rejects(u.install(root,{beforeRename:p=>{if(p==='services/z.cjs')throw Error('EBUSY');}}),/HOT_WRITE_FAILED/);
 assert.equal(fs.readFileSync(path.join(root,'web','app.js'),'utf8'),'old','rolled back');
 assert.match(fs.readFileSync(path.join(root,'logs','update.log'),'utf8'),/hot update failed 1\.5\.2 apply HOT_WRITE_FAILED/);
 assert.equal(u.hotFailed(root,'1.5.2'),'apply HOT_WRITE_FAILED');
 u.reset();info=await u.check('1.5.1',fetcher,root);
 assert.equal(info.newer,true);assert.equal(info.silent,false,'the card with the full package this time');assert.equal(info.hot,false);assert.equal(info.hotFailed,'apply HOT_WRITE_FAILED');
 u.reset();
});

test('silent: a hot apply that fails in the page records the failure and shows nothing',async()=>{
 const {silentHotUpdate}=await notice();
 const svc=fakeService({install:async()=>{throw Error('HOT_WRITE_FAILED');}}),keep=memory();
 const r=await silentHotUpdate({current:'1.5.1',latest:'1.5.2'},{api:svc.api,invoke:svc.invoke,keep:()=>keep,busy:()=>'',sleep:async()=>{}});
 assert.deepEqual(r,{done:false,reason:'HOT_WRITE_FAILED'});
 assert.equal(keep.getItem('megulit.hotUpdateDone'),null,'no "updated" note');
 assert.deepEqual(svc.invokes,['hot_reload:dry'],'never reloads');
});

test('silent: a successful hot apply clears an older failure record',{skip:process.platform!=='win32'},async()=>{
 const root=installRoot(),body={'web/app.js':'new app'};
 const zip=makeZip(root,body,{version:'1.5.2',from:'1.5.1',files:[{path:'web/app.js',sha256:sha(Buffer.from('new app'))}]});
 const bytes=fs.readFileSync(zip),rel=release({hotDigest:sha(bytes),hotSize:bytes.length});
 const fetcher=async x=>x.endsWith('/latest')?{ok:true,json:async()=>rel}:x.includes('-hot-from-')?{ok:true,status:200,url:x,arrayBuffer:async()=>bytes}:{ok:false,status:404};
 fs.writeFileSync(path.join(root,'data','update-hot-failed.json'),JSON.stringify({version:'1.5.1',reason:'old'}));
 u.reset();await u.check('1.5.1',fetcher,root);await u.start(root,'1.5.1',fetcher);const r=await u.install(root);
 assert.equal(r.phase,'installed');assert.equal(fs.readFileSync(path.join(root,'web','app.js'),'utf8'),'new app');
 assert.equal(fs.existsSync(path.join(root,'data','update-hot-failed.json')),false);
 u.reset();
});

test('silent: hot-done note strings exist in zh, ja and en',()=>{
 const s=fs.readFileSync(path.join(__dirname,'..','web','update-notice.js'),'utf8');
 for(const key of ['hotDone:','hotDoneMore:','hotDoneClose:','hotDoneNone:'])assert.equal(s.split(key).length-1,3,key);
});

test('consent: undecided → card at every start (no update, offline too); agreed or declined → no card',async()=>{
 const {checkForUpdates}=await notice();
 const run=async(consent,check)=>{let shown=0;await checkForUpdates({api:async a=>a==='contrib_consent'?consent:check(),invoke:async()=>{},version:'1.5.1',show:()=>{shown++;},silent:()=>{}});return shown;};
 const none=()=>({newer:false}),off=()=>{throw new Error('offline');};
 for(let i=0;i<3;i++)assert.equal(await run({ask:true,decided:false},none),1,'undecided: every start shows the card');
 assert.equal(await run({ask:true,decided:false},off),1,'undecided: shown offline too');
 assert.equal(await run({ask:false,decided:true,enabled:true},none),0,'agreed: no card');
 assert.equal(await run({ask:false,decided:true,enabled:false},none),0,'declined: no card');
});

test('a hot package the page refused is not handed out again: the next start downloads the full package',async t=>{
 const root=installRoot();t.after(()=>{u.reset();fs.rmSync(root,{recursive:true,force:true});});
 const hotBytes=Buffer.from('PK small package'),fullBytes=Buffer.from('PK full package'),hotName='MeguLit-v1.5.2-hot-from-v1.5.1-ab12cd34ef56.zip';
 const rel={tag_name:'v1.5.2',body:'- 修复A\n---\n- Fixed A',assets:[{name:'MeguLit-v1.5.2-win-x64.zip',size:fullBytes.length,digest:'sha256:'+sha(fullBytes),browser_download_url:url('MeguLit-v1.5.2-win-x64.zip')},{name:hotName,size:hotBytes.length,digest:'sha256:'+sha(hotBytes),browser_download_url:url(hotName)}]};
 const fetcher=async x=>x.endsWith('/latest')?{ok:true,json:async()=>rel}:x.includes('-hot-from-')?{ok:true,status:200,url:x,arrayBuffer:async()=>hotBytes}:x.endsWith('-win-x64.zip')?{ok:true,status:200,url:x,arrayBuffer:async()=>fullBytes}:{ok:false,status:404};
 u.reset();assert.equal((await u.check('1.5.1',fetcher,root)).silent,true);
 await u.start(root,'1.5.1',fetcher);assert.equal(u.status().hot,true);
 u.hotFail(root,'hot_reload refused: READER_BUSY');/* silentHotUpdate after a refused dry run */
 const info=await u.check('1.5.1',fetcher,root);assert.equal(info.hot,false);/* the manual check in the same session */
 await u.start(root,'1.5.1',fetcher);
 assert.equal(u.status().phase,'ready');assert.equal(u.status().hot,undefined);assert.match(u.status().zip,/-win-x64\.zip$/);
});