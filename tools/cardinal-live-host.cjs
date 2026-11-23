// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {StringDecoder}=require('node:string_decoder');
const lib=path.join(__dirname,'lib');
const Runner=require(path.join(lib,'services/cardinal-trusted-runner.cjs'));
const Identity=require(path.join(lib,'services/cardinal/identity.cjs'));
const {LiveMeasurement}=require(path.join(lib,'services/cardinal-live-measurement.cjs'));
const D=require(path.join(lib,'core/game-diff.cjs'));
const Profiles=require(path.join(lib,'core/profiles/index.cjs'));
const executable=path.join(__dirname,'CardinalCollector.exe');
const fail=code=>{throw Error(code);};
const same=(a,b)=>D.canonical(a)===D.canonical(b);
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function lines(input,limit,onLine,onError){
 const decoder=new StringDecoder('utf8');let rest='';
 input.on('data',chunk=>{try{
  rest+=decoder.write(chunk);
  for(;;){const end=rest.indexOf('\n');if(end<0)break;
   if(end>limit)fail('LIVE_FRAME_LIMIT');
   const line=rest.slice(0,end).trimEnd();rest=rest.slice(end+1);if(line)onLine(line);
  }
  if(rest.length>limit)fail('LIVE_FRAME_LIMIT');
 }catch(e){onError(e);}});
 input.on('end',()=>{if(rest.trim()||decoder.end())onError(Error('LIVE_TRUNCATED_FRAME'));});
}
function plain(file){
 for(let p=path.resolve(file);;p=path.dirname(p)){
  if(fs.lstatSync(p).isSymbolicLink())fail('LIVE_PATH_LINK');
  if(p===path.dirname(p))return;
 }
}
function worker(args,req,log,onEvent,onError){
 const child=spawn(executable,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
 let stopped=false,closed=false;
 const exit=new Promise(resolve=>{child.once('error',e=>{onError(e);resolve(-1);});
  child.once('close',code=>{closed=true;resolve(code);if(!stopped)onError(Error('LIVE_WORKER_EXIT_'+code));});});
 child.stdin.on('error',e=>{if(!stopped)onError(e);});
 let bytes=0;const fd=fs.openSync(log,'wx');
 child.stderr.on('data',b=>{if(bytes<2*1024*1024)fs.writeSync(fd,b);bytes+=b.length;});
 child.once('close',()=>fs.closeSync(fd));
 lines(child.stdout,300000,line=>{
  const frame=JSON.parse(line);
  if(frame.challenge!==req.challenge)fail('LIVE_CHALLENGE_CHANGED');
  if(!frame.value)fail(frame.reason||'LIVE_WORKER_FRAME');
  onEvent(frame.value);
 },onError);
 child.stdin.write(JSON.stringify(req)+'\n');
 return {input(command){if(!closed&&!stopped)child.stdin.write(command+'\n');},async stop(){
  stopped=true;if(!closed)child.stdin.end('{"type":"stop"}\n');
  const timer=setTimeout(()=>{if(!closed)child.kill();},8000);
  try{if(await exit!==0)fail('LIVE_WORKER_CLEANUP');}finally{clearTimeout(timer);}
 }};
}
function copyApp(source,target){
 plain(source);
 for(const name of ['MeguLit.exe','WebView2Loader.dll','core','services','native','runtime','web','The Seed']){
  const src=path.join(source,name);if(!fs.existsSync(src))continue;
  fs.cpSync(src,path.join(target,name),{recursive:true,errorOnExist:true,force:false,
   filter:file=>{if(fs.lstatSync(file).isSymbolicLink())fail('LIVE_APP_LINK');return true;}});
 }
}
function control(step){
 if(!Number.isSafeInteger(step.at)||step.at<0)fail('LIVE_INPUT_TIME');
 if(Number.isInteger(step.key)&&step.key>=1&&step.key<=255)return 'key '+step.key;
 if([step.x,step.y].every(x=>Number.isInteger(x)&&x>=0&&x<=16384))return 'click '+step.x+' '+step.y;
 fail('LIVE_INPUT');
}
function firstMissing(game,measurement){
 if(!game)return 'LIVE_GAME_WINDOW_MISSING';
 if(!measurement?.pageId)return 'LIVE_READER_PAGE_MISSING';
 if(!measurement.targetPresent)return 'LIVE_NATIVE_GAME_WINDOW_MISSING';
 if(!measurement.counts.bound)return 'LIVE_BOUND_MISSING';
 if(!measurement.counts.sources)return 'LIVE_SOURCE_MISSING';
 if(measurement.counts.pairs<measurement.counts.sources)return 'LIVE_DOM_ACK_MISSING';
 if(measurement.counts.sources<30)return 'LIVE_SOURCE_COUNT';
 return 'LIVE_SETTLING_INCOMPLETE';
}
async function main(req,cfg,port,cancel){
 const diagnostic=cfg.diagnosticOnly===true;
 if(!/^[a-f0-9]{64}$/.test(req.challenge)||!/^[a-z0-9_-]{1,80}$/i.test(req.reporter)||
    req.version!==1||req.schema!=='megulit.trusted-capture-request'||!(port>=1&&port<=65535))fail('LIVE_REQUEST');
 let ctx,reporter;
 if(!diagnostic){
  const policy=Runner.readJSON(cfg.policyFile),request=Runner.readJSON(cfg.requestFile);
  ctx=await Runner.prepare(request,policy);
  if(path.resolve(policy.collector.file).toLowerCase()!==executable.toLowerCase()||digest(executable)!==policy.collector.sha256)fail('LIVE_COLLECTOR_PIN');
  reporter=policy.reporters.find(k=>k.id===req.reporter);
  if(!reporter || !same(request.identity,req.identity)||req.candidateHash!==ctx.candidateHash||
     req.identityDigest!==ctx.proof.digest||req.configHash!==ctx.proof.config.digest||
     req.appliedProfileHash!==ctx.proof.candidate.profileHash||!same(req.profile,ctx.profile)||
     req.exe!==ctx.exe||req.appRoot!==policy.appRoot||req.sampleRoot!==policy.sampleRoot||req.budgetMs!==policy.budgetMs)fail('LIVE_REQUEST_BINDING');
 }
 const source=diagnostic?cfg.sample:ctx.exe,app=diagnostic?cfg.app:ctx.policy.appRoot;
 if(path.resolve(req.exe).toLowerCase()!==path.resolve(source).toLowerCase() || digest(source)!==req.identity.exe)fail('LIVE_SAMPLE_PIN');
 const budget=diagnostic?cfg.budgetMs:ctx.policy.budgetMs;
 if(!Number.isInteger(budget)||budget<1000||budget>360000)fail('LIVE_BUDGET');
 const profile=ctx?.profile||Profiles.profileFor({exe:source,engine:cfg.engine});
 const eventsDir=fs.mkdtempSync(path.join(cfg.evidenceRoot,'live-'));
 const readerRoot=path.join(eventsDir,'app');fs.mkdirSync(readerRoot);
 const timers=[];let err=null,game,cleanup,measurement,gameWorker,readerWorker,ended=false;
 const stop=e=>{if(!err)err=e;};
 const until=Date.now()+budget;
 const check=()=>{if(err)throw err;if(cancel.aborted)fail('LIVE_CANCELLED');if(Date.now()>until)fail('LIVE_BUDGET');};
 const wait=async pred=>{while(!pred()){check();await new Promise(r=>setTimeout(r,25));}check();};
 const summary={challenge:req.challenge,reporter:req.reporter,diagnostic,eventsDir,appRoot:app,identity:req.identity,candidateHash:req.candidateHash};
 try{
  copyApp(app,readerRoot);
  if(ctx)await Identity.copyData(ctx.proof,{data:ctx.data,destination:path.join(readerRoot,'data'),game:ctx.game});
  const args=['--game-worker','--isolated-game',source,req.identity.exe,cfg.controlIPv4];
  if(cfg.saveDir)args.push('--save-dir',cfg.saveDir);
  if(cfg.saveTemplate)args.push('--save-template',cfg.saveTemplate.name,cfg.saveTemplate.sha256);
  gameWorker=worker(args,{...req,budgetMs:budget,readerRoot},path.join(eventsDir,'game.log'),f=>{
   if(f.type==='game'&&!game)game=f;
   else if(f.type==='cleanup'&&!cleanup)cleanup=f;
   else fail('LIVE_GAME_FRAME');
  },stop);
  await wait(()=>game);
  summary.game={pid:game.pid,birth:game.birth,hwnd:game.hwnd,exe:game.exe};
  if(digest(game.exe)!==req.identity.exe)fail('LIVE_GAME_COPY_IDENTITY');
  if(ctx)for(const script of ctx.proof.scripts){
   const f=path.join(path.dirname(game.exe),script.path);plain(f);
   const hash=crypto.createHash('sha256');for await(const b of fs.createReadStream(f))hash.update(b);
   if(hash.digest('hex')!==script.sha256)fail('LIVE_GAME_COPY_SCRIPT');
  }
  const store=require(path.join(lib,'services/store.cjs')).openStore(readerRoot);
  try{store.prepare('INSERT INTO games(id,title,executable) VALUES(?,?,?)').run('cardinal-'+crypto.randomUUID(),path.basename(source,'.exe'),game.exe);}finally{store.close();}
  measurement=new LiveMeasurement(game,profile);
  const journal=fs.openSync(path.join(eventsDir,'events.jsonl'),'wx');
  let used=0;
  try{
   readerWorker=worker(['--live-reader',readerRoot,'--cdp-port',String(port)],{...game,challenge:req.challenge,seconds:Math.ceil(budget/1000)},path.join(eventsDir,'reader.log'),f=>{
    if(ended||err)return;
    const line=JSON.stringify({at:performance.now(),frame:f})+'\n';used+=Buffer.byteLength(line);
    if(used>64*1024**2)fail('LIVE_EVIDENCE_LIMIT');fs.writeSync(journal,line);
    measurement.frame(f);
   },stop);
   if(!Array.isArray(cfg.inputs)||cfg.inputs.length>1000)fail('LIVE_INPUT_PLAN');
   for(const step of cfg.inputs){const command=control(step);timers.push(setTimeout(()=>{if(!ended&&!err)gameWorker.input(command);},step.at));}
   await wait(()=>measurement.counts.pairs>=30 && measurement.counts.pairs===measurement.counts.sources &&
    measurement.samples.at(-1)?.at-measurement.acks.at(-1)?.at>=Math.max(1000,profile.cardinal.thresholds?.lineMs||0));
  } finally {ended=true;fs.closeSync(journal);}
  const evidence=measurement.finish();
  if(diagnostic)fail('LIVE_DIAGNOSTIC_UNSIGNED');
  await readerWorker.stop();readerWorker=null;
  await gameWorker.stop();gameWorker=null;
  if(err)throw err;
  if(!cleanup||!cleanup.treeExited||!cleanup.ownershipReleased||!cleanup.audioRestored)fail('LIVE_CLEANUP');
  await Identity.verify(ctx.proof,{data:ctx.data,game:ctx.game});
  const {pid,birth,owned,jobAssigned,hiddenDesktop,privateCopy,savesIsolated,networkBlocked,parentWatchdog}=game;
  const body={schema:'megulit.trusted-capture',version:1,source:'native-live-dom',challenge:req.challenge,reporter:req.reporter,
   runId:crypto.randomUUID(),identity:ctx.request.identity,candidateHash:ctx.candidateHash,configHash:ctx.proof.config.digest,
   identityDigest:ctx.proof.digest,process:{pid,birth,owned,jobAssigned,hiddenDesktop,privateCopy,savesIsolated,networkBlocked,parentWatchdog},
   cleanup:{treeExited:cleanup.treeExited,audioRestored:cleanup.audioRestored,ownershipReleased:cleanup.ownershipReleased},...evidence};
  if(cancel.aborted)fail('LIVE_CANCELLED');
  const stored=await Runner.storeMeasuredCapture(body,ctx,reporter,req.challenge,eventsDir,()=> {
   const file=path.join(__dirname,'reporter-keys',reporter.id+'.pem');plain(file);
   if(fs.statSync(file).size>16384)fail('LIVE_REPORTER_KEY');
   return crypto.createPrivateKey(fs.readFileSync(file));
  });
  summary.verified=true;return stored;
 }catch(e){stop(e);throw e;}
 finally{
  ended=true;timers.forEach(clearTimeout);
  const cleanupErrors=[];
  for(const w of [readerWorker,gameWorker])if(w)try{await w.stop();}catch(e){cleanupErrors.push(e.message);}
  Object.assign(summary,{counts:measurement?.counts||{},nativeCounts:measurement?.nativeCounts||{},firstFailure:err?.message==='LIVE_BUDGET'?firstMissing(game,measurement):err?.message||null,bridgeDiagnostic:measurement?.bridgeDiagnostic||null,appliedProfileHash:measurement?.appliedHash||null,expectedProfileHash:req.appliedProfileHash||null,stopReason:err?.message||null,cleanup:cleanup||null,cleanupErrors});
  fs.writeFileSync(path.join(eventsDir,'status.json'),JSON.stringify(summary,null,2),{flag:'wx'});
  if(err?.message==='LIVE_BUDGET')fail(summary.firstFailure);
  if(cleanupErrors.length&&!err)fail('LIVE_WORKER_CLEANUP');
 }
}
const abort=new AbortController();let started=false,finished=false;
const parent=process.ppid;
const watch=setInterval(()=>{try{process.kill(parent,0);}catch{abort.abort();}},500);
lines(process.stdin,270000,async line=>{
 if(started){abort.abort();return;}
 started=true;let req;
 try{
  req=JSON.parse(line);const cfg=Runner.readJSON(path.join(__dirname,'cardinal-live-host.json'));
  const result=await main(req,cfg,Number(process.argv[2]),abort.signal);process.stdout.write(JSON.stringify(result)+'\n');
 }catch(e){process.exitCode=2;process.stdout.write(JSON.stringify({schema:'megulit.capture-failure',challenge:req?.challenge,reporter:req?.reporter,reason:String(e.message).slice(0,240),signed:false})+'\n');}
 finally{finished=true;clearInterval(watch);process.stdin.destroy();}
},()=>abort.abort());
process.stdin.on('end',()=>{if(!finished)abort.abort();if(!started){clearInterval(watch);process.exitCode=2;}});
