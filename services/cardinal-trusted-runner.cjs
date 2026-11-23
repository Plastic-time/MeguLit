// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const D=require('../core/game-diff.cjs'),P=require('../core/torch-release.cjs'),Profiles=require('../core/profiles/index.cjs'),Identity=require('./cardinal/identity.cjs'),Score=require('../core/cardinal/score.cjs'),Timing=require('../core/cardinal/timing.cjs'),Upload=require('../core/cardinal/upload.cjs'),Pairs=require('../core/cardinal/display-pairs.cjs'),{stopOwned}=require('../core/owned-exit.cjs');
const REPO=path.resolve(__dirname,'..'),MAX_CAPTURE=16*1024*1024,MAX_REQUEST=P.MAX_BYTES*2+4096;
const CAPABILITIES=['native-live','dom-ack','monotonic-timeline','owned-job','audio-restore','save-isolation','network-isolation','parent-watchdog'];
const fail=code=>{throw Object.assign(Error(code),{code});};
const hash=v=>crypto.createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:D.canonical(v)).digest('hex');
const inside=(base,file)=>{const r=path.relative(base,file);return !!r&&r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r);};
function noLinks(file){let p=path.resolve(file);for(;;){if(fs.lstatSync(p).isSymbolicLink())fail('TRUSTED_PATH_LINK');const parent=path.dirname(p);if(parent===p)return;p=parent;}}
function readJSON(file,max=P.MAX_BYTES){noLinks(file);const s=fs.statSync(file);if(!s.isFile()||s.size>max)fail('TRUSTED_FILE_LIMIT');return JSON.parse(fs.readFileSync(file,'utf8'));}
function atomic(file,value){const temp=file+'.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(temp,D.canonical(value),{flag:'wx'});fs.renameSync(temp,file);}finally{try{fs.unlinkSync(temp);}catch{}}}
function resources(policy,{platform=process.platform,freemem=os.freemem,statfs=fs.statfsSync}={}){
 if(platform!=='win32')return false;
 try{
  const ram=freemem();
  if(!Number.isFinite(ram)||ram<4*1024**3)return false;
  // The collector inherits TEMP, TMP, and cwd from stateRoot. The reader writes under appRoot.
  const destinations=[policy.stateRoot,policy.appRoot];
  // The isolated-game collector creates its disposable sibling tree on the pinned game's volume.
  const args=policy.collector?.args;
  if(args?.[0]==='--isolated-game'){
   if(!path.isAbsolute(args[1]))return false;
   destinations.push(path.parse(args[1]).root);
  }
  return [...new Set(destinations)].every(dir=>{
   if(typeof dir!=='string'||!path.isAbsolute(dir))return false;
   const stat=statfs(dir),bytes=stat.bavail*stat.bsize;
   return Number.isFinite(bytes)&&bytes>=10*1024**3;
  });
 }catch{return false;}
}
function publicKeys(keys){return Array.isArray(keys)&&keys.length>0&&keys.length<=32&&keys.every(k=>k&&k.alg==='ed25519'&&!k.revoked&&typeof k.id==='string'&&/^[a-z0-9_-]{1,80}$/i.test(k.id)&&typeof k.publicKey==='string')&&new Set(keys.map(k=>k.id)).size===keys.length&&new Set(keys.map(k=>k.publicKey)).size===keys.length;}
function policyShape(policy){
 if(policy?.schema!=='megulit.cardinal-trusted-host'||policy.version!==1)fail('TRUSTED_HOST_POLICY');
 if(!publicKeys(policy.profileKeys)||!publicKeys(policy.reviewKeys)||!publicKeys(policy.reporters)||policy.reporters.length<3)fail('TRUSTED_KEYS_UNCONFIGURED');
 if(policy.reviewKeys.some(k=>policy.profileKeys.some(p=>p.publicKey===k.publicKey))||policy.reporters.some(k=>[...policy.reviewKeys,...policy.profileKeys].some(p=>p.publicKey===k.publicKey)))fail('TRUSTED_KEY_ROLE_COLLISION');
 if(!Number.isInteger(policy.slots)||policy.slots<1||policy.slots>4||!Number.isInteger(policy.budgetMs)||policy.budgetMs<1000||policy.budgetMs>360000)fail('TRUSTED_HOST_LIMIT');
 if(!policy.cohort||Object.keys(policy.cohort).sort().join(',')!=='environment,suite,version'||Object.values(policy.cohort).some(x=>typeof x!=='string'||!/^[a-z0-9_.-]{1,80}$/i.test(x)))fail('TRUSTED_COHORT');
 for(const k of ['appRoot','sampleRoot','stateRoot']){if(typeof policy[k]!=='string'||!path.isAbsolute(policy[k]))fail('TRUSTED_HOST_PATH');noLinks(policy[k]);if(!fs.statSync(policy[k]).isDirectory())fail('TRUSTED_HOST_PATH');}
 const roots=['appRoot','sampleRoot','stateRoot'].map(k=>fs.realpathSync(policy[k]));if(roots.some((r,i)=>roots.some((other,j)=>i!==j&&(r===other||inside(r,other)))))fail('TRUSTED_ROOT_OVERLAP');
 const c=policy.collector;if(!c||!Array.isArray(c.capabilities)||CAPABILITIES.some(k=>!c.capabilities.includes(k)))fail('TRUSTED_LIVE_COLLECTOR_UNAVAILABLE');
 if(!path.isAbsolute(c.file||'')||!D.KEY.test(c.sha256)||!Array.isArray(c.args)||c.args.length>16||c.args.some(x=>typeof x!=='string'||x.length>1024)||path.extname(c.file).toLowerCase()!=='.exe')fail('TRUSTED_COLLECTOR_POLICY');
 if(!fs.existsSync(c.file))fail('TRUSTED_LIVE_COLLECTOR_UNAVAILABLE');noLinks(c.file);const collector=fs.realpathSync(c.file);if(inside(REPO,collector)||roots.some(r=>inside(r,collector)))fail('TRUSTED_REPLAY_COLLECTOR_REFUSED');
 return policy;
}
async function prepare(request,policy,{signal,resourceCheck=()=>resources(policy)}={}){
 policyShape(policy);if(fs.existsSync(path.join(policy.stateRoot,'blocked.json')))fail('TRUSTED_CLEANUP_BARRIER');if(process.env.MEGULIT_CARDINAL_REPLAY==='1')fail('TRUSTED_REPLAY_REFUSED');if(!resourceCheck())fail('TRUSTED_RESOURCE_GATE');
 if(request?.schema!=='megulit.cardinal-trusted-request'||request.version!==1||!P.identity(request.identity)||!IdentitySafeRelative(request.exe)||!Number.isSafeInteger(request.torchNo)||request.torchNo<0)fail('TRUSTED_REQUEST');
 P.profileShape(request.candidate,request.identity);if(!await P.verify(request.candidate,policy.profileKeys))fail('TRUSTED_PROFILE_SIGNATURE');if(request.torchNo===0&&request.candidate.source!=='official')fail('TRUSTED_CREDIT_BINDING');
 if(request.baseline!==null){await P.checked(request.baseline,policy);if(!P.same(request.identity,request.baseline.review.identity)||request.baseline.review.cohort!==hash(policy.cohort))fail('TRUSTED_BASELINE_INCOMPARABLE');if(request.candidate.rev<=request.baseline.profile.rev)fail('TRUSTED_PROFILE_REVISION');}
 const base=fs.realpathSync(policy.sampleRoot),exe=path.resolve(base,...request.exe.split('/'));noLinks(exe);if(!inside(base,fs.realpathSync(exe)))fail('TRUSTED_SAMPLE_PATH');
 const input={exe,engine:request.identity.engine,exeSha256:request.identity.exe,official:request.candidate.settings,officialRev:request.candidate.rev,match:'exe',prints:request.candidate.prints};
 const profile=Profiles.profileFor(input);if(!profile.layers.split('+').includes('official')||String(profile.cardinal.rev)!==P.REV)fail('TRUSTED_PROFILE_NOT_APPLIED');if(!P.same(profile.cardinal,Profiles.DEFAULTS.cardinal))fail('TRUSTED_QUALITY_RULES_CHANGED');
 const game={exe,sha:request.identity.exe,engine:profile.engine},data=path.join(policy.appRoot,'data');
 const proof=await Identity.prepare(Identity.capture({root:policy.appRoot,game,profile,source:'official',seedRev:'v'+request.candidate.rev,context:input}),{data,game,signal});
 const script=proof.scripts.find(s=>s.path===request.identity.scriptFile);if(!script||script.sha256!==request.identity.script)fail('TRUSTED_SCRIPT_IDENTITY');
 if(!resourceCheck())fail('TRUSTED_RESOURCE_GATE');
 return {request,policy,exe,game,data,profile,proof,candidateHash:await P.hash(request.candidate),cohort:hash(policy.cohort)};
}
function IdentitySafeRelative(s){return typeof s==='string'&&s.length<=200&&!/[\\:\x00-\x1f]/.test(s)&&s.split('/').every(x=>x&&x!=='.'&&x!=='..'&&!/[. ]$/.test(x));}
function collectorHash(policy){const file=policy.collector.file;noLinks(file);const s=fs.statSync(file);if(!s.isFile()||s.size>64*1024**2||hash(fs.readFileSync(file))!==policy.collector.sha256)fail('TRUSTED_COLLECTOR_CHANGED');}
function verifyCapture(report,reporter){try{const signature=report?.signature;if(signature?.alg!=='ed25519'||signature.keyId!==reporter.id||!/^[A-Za-z0-9+/]{86}==$/.test(signature.value))return false;const text=D.canonical(D.unsigned(report));if(Buffer.byteLength(text)>MAX_CAPTURE)return false;return crypto.verify(null,Buffer.from(text),crypto.createPublicKey({key:Buffer.from(reporter.publicKey,'base64'),format:'der',type:'spki'}),Buffer.from(signature.value,'base64'));}catch{return false;}}
function lease(policy){const barrier=path.join(policy.stateRoot,'blocked.json');if(fs.existsSync(barrier))fail('TRUSTED_CLEANUP_BARRIER');for(let n=0;n<policy.slots;n++){const file=path.join(policy.stateRoot,'slot-'+n+'.json');try{fs.writeFileSync(file,D.canonical({schema:1,owner:process.pid,at:new Date().toISOString()}),{flag:'wx'});return {file,release(){fs.unlinkSync(file);},block(reason){atomic(barrier,{schema:1,state:'blocked',reason,at:new Date().toISOString()});}};}catch(e){if(e.code!=='EEXIST')throw e;}}fail('TRUSTED_SLOTS_BUSY');}
function capture(context,reporter,challenge,{signal,spawnChild=spawn,resourceCheck=()=>resources(context.policy)}={}){
 if(signal?.aborted)return Promise.reject(Object.assign(Error('TRUSTED_CANCELLED'),{code:'TRUSTED_CANCELLED'}));
 return new Promise((resolve,reject)=>{
  let child,timer,watch,done=false,stopping=false,bytes=0,output=[];const cleanupFailure=()=>Object.assign(Error('TRUSTED_CAPTURE_CLEANUP_UNCONFIRMED'),{code:'TRUSTED_CAPTURE_CLEANUP_UNCONFIRMED'});
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);clearInterval(watch);signal?.removeEventListener('abort',cancel);error?reject(error):resolve(value);};
  const cancel=()=>{if(stopping||done)return;stopping=true;void stopOwned(child,()=>child.stdin.write(JSON.stringify({type:'stop'})+'\n'),{graceMs:5000,killMs:2000}).then(()=>finish(cleanupFailure()),()=>finish(cleanupFailure()));};
  const env={SystemRoot:process.env.SystemRoot||'',WINDIR:process.env.WINDIR||'',PATH:process.env.PATH||'',TEMP:context.policy.stateRoot,TMP:context.policy.stateRoot,MEGULIT_RELAY_BASE:'off'};
  try{child=spawnChild(context.policy.collector.file,context.policy.collector.args,{cwd:context.policy.stateRoot,windowsHide:true,shell:false,env,stdio:['pipe','pipe','ignore']});}catch{return finish(cleanupFailure());}
  child.stdin.on('error',cancel);child.stdout.on('error',cancel);
  child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>MAX_CAPTURE)return cancel();output.push(Buffer.from(chunk));});
  child.on('error',()=>{if(!child.pid)finish(Object.assign(Error('TRUSTED_COLLECTOR_SPAWN'),{code:'TRUSTED_COLLECTOR_SPAWN'}));else cancel();});
  child.on('close',(code,why)=>{if(done||stopping)return;if(code!==0||why)return finish(cleanupFailure());try{const value=JSON.parse(Buffer.concat(output).toString('utf8'));finish(null,value);}catch{finish(cleanupFailure());}});
  timer=setTimeout(cancel,context.policy.budgetMs+10000);watch=setInterval(()=>{try{if(!resourceCheck())cancel();}catch{cancel();}},2000);watch.unref?.();signal?.addEventListener('abort',cancel,{once:true});
  try{child.stdin.write(D.canonical({schema:'megulit.trusted-capture-request',version:1,challenge,reporter:reporter.id,identity:context.request.identity,candidateHash:context.candidateHash,appliedProfileHash:context.proof.candidate.profileHash,configHash:context.proof.config.digest,identityDigest:context.proof.digest,exe:context.exe,appRoot:context.policy.appRoot,sampleRoot:context.policy.sampleRoot,profile:context.profile,budgetMs:context.policy.budgetMs})+'\n');}catch{cancel();}
  if(signal?.aborted)cancel();
 });
}
async function evaluate(report,context,reporter,challenge){
 if(!verifyCapture(report,reporter))fail('TRUSTED_CAPTURE_ATTESTATION');
 return evaluateEvidence(report,context,reporter,challenge);
}
function evaluateEvidence(report,context,reporter,challenge){
 if(!report||report.schema!=='megulit.trusted-capture'||report.version!==1||report.challenge!==challenge||report.reporter!==reporter.id||report.source!=='native-live-dom')fail('TRUSTED_CAPTURE_ATTESTATION');
 if(!P.same(report.identity,context.request.identity)||report.candidateHash!==context.candidateHash||report.appliedProfileHash!==context.proof.candidate.profileHash||report.configHash!==context.proof.config.digest||report.identityDigest!==context.proof.digest)fail('TRUSTED_CAPTURE_BINDING');
 const p=report.process,c=report.cleanup;if(!p||!Number.isSafeInteger(p.pid)||p.pid<1||!/^[1-9]\d{0,29}$/.test(p.birth)||['owned','jobAssigned','hiddenDesktop','privateCopy','savesIsolated','networkBlocked','parentWatchdog'].some(k=>p[k]!==true))fail('TRUSTED_PROCESS_ISOLATION');
 if(!c||['treeExited','audioRestored','ownershipReleased'].some(k=>c[k]!==true))fail('TRUSTED_CAPTURE_CLEANUP_UNCONFIRMED');
 if(typeof report.readerTargetId!=='string'||!/^[a-f0-9]{32}$/i.test(report.readerTargetId))fail('TRUSTED_READER_TARGET');
 if(typeof report.runId!=='string'||!/^[0-9a-f-]{36}$/.test(report.runId))fail('TRUSTED_RUN_ID');
 const run=report.run;if(!run||!Array.isArray(run.steps)||run.steps.length>10000||!run.o||run.o.models!==false||!Array.isArray(run.o.samples)||run.o.samples.length>12000||!Array.isArray(run.o.sourceEpisodes)||run.o.sourceEpisodes.length>400||(run.o.errors||[]).length)fail('TRUSTED_CAPTURE_OBSERVATIONS');
 const bound=run.steps.filter(x=>x.gwb?.type==='bound');if(bound.length!==1||bound[0].gwb.gameProcessId!==p.pid||String(bound[0].gwb.gameStarted)!==p.birth)fail('TRUSTED_PROCESS_BINDING');
 const sources=run.steps.filter(x=>x.hb?.type==='hookSource');if(sources.length<30||sources.some(x=>['history','ocr','replay','fixture'].includes(x.hb.origin)||x.hb.recovering||x.hb.hookRecovering)||run.o.sourceEpisodes.some(x=>x.pid!==p.pid||x.birth!==p.birth))fail('TRUSTED_SOURCE_BINDING');
 const acks=report.domAcks;if(!Array.isArray(acks)||acks.length!==sources.length)fail('TRUSTED_DOM_ACK');const episodes=new Set();
 for(let i=0;i<sources.length;i++){const st=sources[i],e=run.o.sourceEpisodes[i],a=acks[i];if(!e||!a||a.line!==st.line||typeof a.episode!=='string'||!a.episode||episodes.has(a.episode)||a.sourceKey!==Pairs.key(st.hb.text)||a.observed!==true||a.paired!==true||a.enabled!==true||a.visible!==true||!Number.isFinite(a.at)||a.at<e.at||a.at>=(run.o.sourceEpisodes[i+1]?.at??Infinity)||a.at>run.o.timing?.durationMs||!run.o.timing?.wallChecks?.some(c=>Math.abs(c.at-a.at)<.01)||typeof a.translation!=='string'||!Pairs.normalize(a.translation))fail('TRUSTED_DOM_ACK');episodes.add(a.episode);
  const nextAt=run.o.sourceEpisodes[i+1]?.at??Infinity;
  const hasVisibleTranslation=run.o.samples.some(sample=>{
   if(!Number.isFinite(sample.at)||sample.at<e.at||sample.at>=nextAt||Math.abs(sample.at-a.at)>context.profile.cardinal.sampleMs+context.profile.cardinal.maxLagMs)return false;
   if(Pairs.key(sample.hookSource)!==a.sourceKey)return false;
   return (sample.cn||[]).some(cn=>Pairs.normalize(cn.text)===Pairs.normalize(a.translation)&&Number.isFinite(cn.rect?.w)&&cn.rect.w>0&&Number.isFinite(cn.rect?.h)&&cn.rect.h>0);
  });
  if(!hasVisibleTranslation)fail('TRUSTED_DOM_TRANSLATION');
 }
 const livePairing={source:'live-display',schema:1,shown:sources.length,paired:acks.length,unpaired:0,excluded:0,unobserved:0,reliable:true},result=Score.score({...run,livePairing},context.profile.cardinal),timing=Timing.check({steps:run.steps,o:run.o,rules:context.profile.cardinal});result.detail.timing=timing;
 const doc={record:Score.record({key:context.request.identity.exe,result,cardinalRev:P.REV}),detail:result.detail,unreliable:false,errors:[]};
 if(!Upload.eligible(doc)||result.lines<30||result.detail.sourceCoverage.rate!==1||result.detail.contentCoverage.rate!==1||result.detail.visibility.rate!==1||result.lines!==sources.length)fail('TRUSTED_CARDINAL_INELIGIBLE');
 return {reporter:reporter.id,runId:report.runId,total:result.total,lines:result.lines,timing,eligibility:{pairSource:'live-display',pairReliable:true,leakObserved:true,timelineSource:'measured-delivery',timelineReliable:true,choiceReliable:true,unreliable:false,errors:[]}};
}
async function storeMeasuredCapture(body,context,reporter,challenge,dir,loadKey){
 evaluateEvidence(body,context,reporter,challenge);
 const payload=Buffer.from(D.canonical(body));
 if(payload.length+512>MAX_CAPTURE)fail('LIVE_CAPTURE_LIMIT');
 const key=loadKey();
 if(key.asymmetricKeyType!=='ed25519'||crypto.createPublicKey(key).export({type:'spki',format:'der'}).toString('base64')!==reporter.publicKey)fail('LIVE_REPORTER_KEY');
 const signature={alg:'ed25519',keyId:reporter.id,value:crypto.sign(null,payload,key).toString('base64')};
 const pending=path.join(dir,'capture.pending'),final=path.join(dir,'capture.json');
 fs.writeFileSync(pending,JSON.stringify({...body,signature}),{flag:'wx'});
 try{
  const stored=readJSON(pending,MAX_CAPTURE);
  await evaluate(stored,context,reporter,challenge);
  fs.linkSync(pending,final);
  return stored;
 }finally{fs.unlinkSync(pending);}
}
async function externalSign(body,policy){
 const file=process.env.MEGULIT_CARDINAL_REVIEW_KEY,id=process.env.MEGULIT_CARDINAL_REVIEW_KEY_ID;if(!file||!id||!path.isAbsolute(file)||inside(REPO,path.resolve(file)))fail('TRUSTED_REVIEW_KEY_UNAVAILABLE');
 noLinks(file);if(['appRoot','sampleRoot','stateRoot'].some(k=>inside(policy[k],fs.realpathSync(file)))||fs.statSync(file).size>16384)fail('TRUSTED_REVIEW_KEY_UNAVAILABLE');const key=crypto.createPrivateKey(fs.readFileSync(file));if(key.asymmetricKeyType!=='ed25519')fail('TRUSTED_REVIEW_KEY_UNAVAILABLE');
 const pub=crypto.createPublicKey(key).export({format:'der',type:'spki'}).toString('base64');if(!policy.reviewKeys.some(k=>k.id===id&&k.publicKey===pub))fail('TRUSTED_REVIEW_KEY_UNREGISTERED');
 return {...body,signature:{alg:'ed25519',keyId:id,value:crypto.sign(null,Buffer.from(D.canonical(body)),key).toString('base64')}};
}
function reviewerSigner(config,load=()=>require('./maintainer-signing.cjs')){
 if(config===undefined)return externalSign;
 if(!config||Object.getPrototypeOf(config)!==Object.prototype||Object.keys(config).sort().join(',')!=='id,store,vault'||typeof config.store!=='string'||!path.isAbsolute(config.store)||typeof config.vault!=='string'||!path.isAbsolute(config.vault)||typeof config.id!=='string'||!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(config.id))fail('TRUSTED_REVIEW_SIGNING_CONFIG');
 const {store,id,vault}=config;
 return async(body,policy)=>{
  if(!policy.reviewKeys.some(k=>k.id===id&&!k.revoked))fail('TRUSTED_REVIEW_KEY_UNREGISTERED');
  const location=path.resolve(store);if([REPO,policy.appRoot,policy.sampleRoot,policy.stateRoot].some(root=>path.resolve(root)===location||inside(path.resolve(root),location)))fail('TRUSTED_REVIEW_KEY_UNAVAILABLE');
  const S=load(),sign=S.createSigner({store,id,role:'reviewer',scope:'review',vault:S.createVault(vault),trust:policy});
  return sign(body);
 };
}
async function runHost(request,policy,dependencies={}){
 const injected=['resourceCheck','collect','sign'].some(k=>Object.hasOwn(dependencies,k));if(injected&&!['resourceCheck','collect','sign'].every(k=>typeof dependencies[k]==='function'))return {state:'awaiting-trusted-run',reason:'TRUSTED_TEST_BOUNDARY',signed:false};
 const resourceCheck=dependencies.resourceCheck||(()=>resources(policy)),collect=dependencies.collect||capture;let sign,slot=null,context=null,unsafe=false;
 try{
  sign=dependencies.sign||reviewerSigner(dependencies.signing);
  context=await prepare(request,policy,{signal:dependencies.signal,resourceCheck});collectorHash(policy);slot=lease(policy);const results=[];
  for(const reporter of policy.reporters.slice(0,3)){
   if(dependencies.signal?.aborted)fail('TRUSTED_CANCELLED');if(!resourceCheck())fail('TRUSTED_RESOURCE_GATE');collectorHash(policy);await Identity.verify(context.proof,{data:context.data,game:context.game,signal:dependencies.signal});
   const challenge=crypto.randomBytes(32).toString('hex');await dependencies.observer?.start(challenge);unsafe=true;const report=await collect(context,reporter,challenge,{signal:dependencies.signal,resourceCheck});
   if(!report||report.challenge!==challenge||report.reporter!==reporter.id||!verifyCapture(report,reporter)||report.cleanup?.treeExited!==true||report.cleanup?.audioRestored!==true||report.cleanup?.ownershipReleased!==true)fail('TRUSTED_CAPTURE_CLEANUP_UNCONFIRMED');await dependencies.observer?.exited(structuredClone(report.process));unsafe=false;
   const result=await evaluate(report,context,reporter,challenge);await dependencies.observer?.check(structuredClone(report),challenge);if(results.some(r=>r.runId===result.runId))fail('TRUSTED_DUPLICATE_RUN');results.push(result);
   collectorHash(policy);await Identity.verify(context.proof,{data:context.data,game:context.game,signal:dependencies.signal});
  }
  const lines=results.reduce((n,r)=>n+r.lines,0),mean=results.reduce((n,r)=>n+r.total*r.lines,0)/lines,floor=Math.min(...results.map(r=>r.total));
  const body={schema:'megulit.torch-review',version:1,candidateHash:context.candidateHash,baselineHash:request.baseline?.review.candidateHash||null,identity:request.identity,cardinalRev:P.REV,policy:P.POLICY,cohort:context.cohort,lines,reporters:results.length,mean,floor,coverage:1,reliable:true,liveDisplay:true,domAck:true,eligibility:results[0].eligibility,timing:results[0].timing,torchNo:request.torchNo,storyRules:null};
  const shape={...body,signature:{alg:'ed25519',keyId:'shape-validation-only',value:'A'.repeat(86)+'=='}};P.reviewShape(shape);P.promotion(shape,request.baseline);
  if(!resourceCheck())fail('TRUSTED_RESOURCE_GATE');await Identity.verify(context.proof,{data:context.data,game:context.game,signal:dependencies.signal});
  const approved=D.canonical(body),review=await sign(JSON.parse(approved),policy);if(D.canonical(D.unsigned(review))!==approved||!await P.verify(review,policy.reviewKeys))fail('TRUSTED_REVIEW_SIGNATURE');P.reviewShape(review);
  return {state:'reviewed',review,summary:{sessions:results.length,lines,mean,floor}};
 }catch(error){const reason=/^(TRUSTED_|CARDINAL_IDENTITY_|TORCH_)[A-Z_]+$/.test(error?.code||'')?error.code:'TRUSTED_RUN_UNAVAILABLE';if(unsafe||reason==='TRUSTED_CLEANUP_BARRIER'){try{slot?.block(reason);}catch{}return {state:'blocked',reason,signed:false};}return {state:'awaiting-trusted-run',reason,signed:false};
 }finally{if(slot&&!unsafe)try{slot.release();}catch{}}
}
function status(){return {state:'awaiting-trusted-run',reason:'TRUSTED_LIVE_COLLECTOR_UNAVAILABLE',signed:false,availableSources:{coldCapture:'scene-export-only',coldTest:'native-only-no-reader',cardinalDriver:'offline-replay'},requiredCapabilities:CAPABILITIES};}
module.exports={runHost,prepare,evaluate,storeMeasuredCapture,capture,resources,status,readJSON,atomic,reviewerSigner,MAX_CAPTURE,MAX_REQUEST,CAPABILITIES};
