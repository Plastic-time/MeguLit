// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const {buildPsb}=require('./helpers/psb-writer.cjs');
const xp3=require('../services/original-engines/xp3.cjs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;};
const chunk=(tag,body)=>Buffer.concat([Buffer.from(tag,'latin1'),u64(body.length),body]);
const lines=['「今日も暑いね。」','「そうだね。」','「行こうか。」'];
function archive(file){
 const data=buildPsb({name:'001.ks',scenes:[{label:'a',texts:lines.map(ja=>[null,null,[[null,ja]]])}]}),name='001.ks.scn';
 const info=Buffer.concat([Buffer.alloc(4),u64(data.length),u64(data.length),Buffer.from([name.length,0]),Buffer.from(name,'utf16le')]);
 const segm=Buffer.concat([Buffer.alloc(4),u64(19),u64(data.length),u64(data.length)]);
 const index=chunk('File',Buffer.concat([chunk('info',info),chunk('segm',segm),chunk('adlr',Buffer.alloc(4))]));
 fs.writeFileSync(file,Buffer.concat([xp3.MAGIC,u64(19+data.length),data,Buffer.from([0]),u64(index.length),index]));
}
async function until(read,label,ms=8000){
 const end=Date.now()+ms;
 do{const value=read();if(value)return value;await pause(20);}while(Date.now()<end);
 throw Error('CX_PROCESS_TEST_TIMEOUT: '+label);
}
function json(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}}
function launch(root,probe){
 const source=`const scenes=require(process.env.MEGULIT_CX_SCENES);
 const keeper=setTimeout(()=>{process.exitCode=2;},18000);
 const built=scenes.withCxProbe(()=>scenes.cxPrepareSync(process.env.MEGULIT_CX_GAME,{deadline:Date.now()+15000}));
 process.stdout.write(JSON.stringify({built})+'\\n');
 Promise.all([...scenes.cxBuilds.values()].map(w=>new Promise(resolve=>w.once('exit',resolve))))
 .then(()=>{process.stdout.write(JSON.stringify({tracked:scenes.cxBuilds.size})+'\\n');clearTimeout(keeper);});`;
 const entry=probe?[path.resolve(__dirname,'../services/adapter-probe-worker.cjs')]:['-e',source];
 const child=spawn(process.execPath,['--require',path.join(__dirname,'helpers','cx-prepare-hold.cjs'),...entry],{
  windowsHide:true,stdio:probe?['pipe','pipe','pipe','ipc']:['pipe','pipe','pipe'],env:{...process.env,TMPDIR:root,TMP:root,TEMP:root,
   MEGULIT_PROBE_WORKER:'1',MEGULIT_NO_PREWARM:'1',
   MEGULIT_CX_PROCESS_TEST:root,MEGULIT_CX_GAME:path.join(root,'game'),MEGULIT_CX_SCENES:path.resolve(__dirname,'../services/original-engines/scenes.cjs')}
 });
 let stdout='',stderr='';child.stdout.on('data',b=>{stdout+=b;});child.stderr.on('data',b=>{stderr+=b;});
 const messages=[];
 if(probe)child.on('message',m=>{
  messages.push(m);
  if(m?.type==='ready')child.send({type:'probe',id:'owned-cx-process-test',dir:path.join(root,'game'),executable:'',title:'synthetic CX process fixture',budgetMs:30000,progressFile:path.join(root,'progress.json')},()=>{});
 });
 let closed=false;const close=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>{closed=true;resolve({code,signal});});});
 return {child,close,messages,get closed(){return closed;},get stdout(){return stdout;},get stderr(){return stderr;}};
}
async function closeWithin(run){
 let timer;try{return await Promise.race([run.close,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('CX_CHILD_CLOSE_TIMEOUT')),5000);})]);}finally{clearTimeout(timer);}
}
function canonicalOf(ready,root){
 assert.ok(ready.threadId>0,'the real default Worker reached prepare');
 assert.match(ready.stack,/cx-worker\.cjs:\d+:\d+/,'pause was called by the production prepare entry');
 const canonical=ready.attempt.replace(/\.\d+\.[a-f0-9-]+\.tmp$/,'');
 assert.notEqual(canonical,ready.attempt);assert.equal(path.dirname(canonical),path.join(root,'megulit-cx'));
 assert.match(ready.attempt,new RegExp('\\.'+ready.pid+'\\.[a-f0-9-]+\\.tmp$'),'attempt is owned by this process generation');
 const docs=json(ready.attempt)?.docs;
 assert.equal(docs?.length,1,'actual XP3/PSB preparation completed before the pause');
 assert.deepEqual(docs[0].scenes[0].rows.map(row=>row[0]),lines);
 return canonical;
}
for(const stop of [false,true])test(stop?'stopping the owned probe process stops its default CX Worker before canonical publication':'the same default CX Worker publishes parsed text when allowed to finish',{timeout:20000},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-cx-process-'));fs.mkdirSync(path.join(root,'game'));archive(path.join(root,'game','scn.xp3'));
 const run=launch(root,stop);let ready,canonical;
 try{
  ready=await until(()=>json(path.join(root,'worker-ready.json')),'default worker preparation');
  assert.equal(ready.pid,run.child.pid);canonical=canonicalOf(ready,root);
  assert.equal(fs.existsSync(canonical),false,'only the unique attempt exists before worker completion');
  await until(()=>{try{return Number(fs.readFileSync(path.join(root,'heartbeat'),'utf8'))>=3;}catch{return false;}},'worker is still active');
  assert.equal(run.closed,false);
  if(stop){
   assert.ok(run.messages.some(m=>m.type==='ready'&&m.pid===run.child.pid),'the actual adapter-probe-worker owns the job');
   assert.equal(json(path.join(root,'progress.json'))?.stage,'cx-prepare','actual probe core is blocked in bounded CX preparation');
   assert.equal(run.child.kill(),true,'terminate only this test-owned Node process');
   const ended=await closeWithin(run);assert.equal(run.closed,true,'await stdio/child close, not merely a kill request');
   assert.ok(ended.code!==0||ended.signal,'the held preparation did not exit normally');
   const heartbeat=fs.readFileSync(path.join(root,'heartbeat'),'utf8');
   fs.writeFileSync(path.join(root,'release'),'released after child close');await pause(250);
   assert.equal(fs.readFileSync(path.join(root,'heartbeat'),'utf8'),heartbeat,'no continuing Worker activity after close');
   assert.equal(fs.existsSync(path.join(root,'after-release')),false,'a detached writer cannot resume after owner close');
   assert.equal(fs.existsSync(canonical),false,'no late canonical cache publication');
   const attemptsAtClose=fs.readdirSync(path.dirname(canonical)).filter(name=>name.startsWith(path.basename(canonical)+'.')&&name.endsWith('.tmp'));
   t.diagnostic(JSON.stringify({ownerPid:ready.pid,threadId:ready.threadId,unpublishedAttemptAtClose:fs.existsSync(ready.attempt)?ready.attempt:null,leftoverAttemptCount:attemptsAtClose.length,canonicalPublished:false,testFinallyRemovesOwnedDirectory:true}));
   assert.equal(run.stdout,'','the synchronous prepare never returned success');
   assert.equal(run.messages.some(m=>m.type==='result'),false,'the stopped production probe did not report success');
  }else{
   fs.writeFileSync(path.join(root,'release'),'finish');const ended=await closeWithin(run);
   assert.equal(ended.code,0,run.stderr);assert.equal(run.stderr,'');
   assert.deepEqual(run.stdout.trim().split(/\r?\n/).map(s=>JSON.parse(s)),[{built:1},{tracked:0}]);
   assert.equal(fs.existsSync(path.join(root,'after-release')),true);assert.equal(fs.existsSync(ready.attempt),false);
   assert.deepEqual(json(canonical).docs[0].scenes[0].rows.map(row=>row[0]),lines,'the control publishes the actual parsed result');
  }
 }finally{
  if(!run.closed&&run.child.exitCode===null&&run.child.signalCode===null)run.child.kill();
  await closeWithin(run);
  // All files below this freshly created directory belong to this test; close precedes removal.
  fs.rmSync(root,{recursive:true,force:true});
 }
});
