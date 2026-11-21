// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
process.env.MEGULIT_RELAY_BASE='https://relay.test';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const S=require('../core/cardinal/score.cjs'),C=require('../core/cardinal/checks.cjs'),D=require('../core/profiles/defaults.cjs');
const Tape=require('../core/cardinal/tape.cjs'),Jobs=require('../services/cardinal.cjs'),Live=require('../services/self-check-live.cjs'),Profiles=require('../core/profiles/index.cjs');
const fixture=require('./fixtures/cardinal/fata-live-visibility-20261121.json'),SHA='b'.repeat(64);
test('real faulty DOM: missing source state or all probe samples never becomes a perfect score',()=>{
 const baseline=S.score(fixture.run,D.cardinal);
 for(const variant of ['empty-source','wrong-source','no-samples']){
  const run=structuredClone(fixture.run);
  if(variant==='no-samples')run.o.samples=[];
  else for(const s of run.o.samples)s.hookSource=variant==='empty-source'?'':'違う台詞';
  const result=S.score(run,D.cardinal);
  assert.equal(result.total,0,variant);assert.equal(result.scores.row,0);
  assert.ok(result.detail.sourceCoverage.expected>0);assert.equal(result.detail.sourceCoverage.observed,0);
  assert.ok(result.total<baseline.total);assert.equal(S.combine([result,result],D.cardinal).total,0);
 }
 for(const line of C.lines(fixture.run)){
  const run=structuredClone(fixture.run);
  for(const s of run.o.samples)if(C.norm(s.hookSource)===C.norm(line.text)){s.hookSource='';s.glyphs=[];}
  assert.ok(S.score(run,D.cardinal).total<=baseline.total,'dropping observed line '+line.line);
 }
});
function setup(share=false){
 const root=fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'cardinal-reliability-'));
 fs.mkdirSync(path.join(root,'data','config'),{recursive:true});fs.writeFileSync(path.join(root,'data','config','library.json'),JSON.stringify({sharedAdaptation:share}));
 Jobs._reset();Tape.clear();let t=Date.now()-60000;
 Tape.record('gwb',{type:'bound',gameProcessId:62,gameStarted:'6'},t);
 for(let i=0;i<12;i++)Tape.record('hb',{type:'hookSource',text:'実記録の台詞'+i},t+=1500);
 const reader={root,gameExe:'C:/Games/test.exe',gal:{state:{},hooks:{trace(){}}}};
 const original=Live.current;Live.current=()=>({reader,key:SHA,from:'',profile:Profiles.profileFor({})});
 return {root,reader,close(){Live.current=original;Jobs._reset();Tape.clear();}};
}
const observed=()=>structuredClone(fixture.run.o);
test('the queue drains a third job scheduled during its second replay, and idle waits for all three',async()=>{
 const h=setup();let releaseA,releaseB,startedB;const waitA=new Promise(r=>releaseA=r),waitB=new Promise(r=>releaseB=r),bStarted=new Promise(r=>startedB=r),calls=[];
 try{
  Jobs.kick(h.reader,'session-end',{replay:async()=>{calls.push('a');await waitA;return observed();}});
  assert.equal(Jobs.kick(h.reader,'session-end',{replay:async()=>{calls.push('b');startedB();await waitB;return observed();}}).state,'queued');
  releaseA();await bStarted;
  assert.equal(Jobs.kick(h.reader,'session-end',{replay:async()=>{calls.push('c');return observed();}}).state,'queued');
  releaseB();await Jobs.idle();assert.deepEqual(calls,['a','b','c']);
 }finally{releaseA();releaseB();h.close();}
});
test('a rejected replay is recorded as a failure and does not strand the next run',async()=>{
 const h=setup();try{
  Jobs.kick(h.reader,'session-end',{replay:async()=>{throw new Error('probe crashed');}});await Jobs.idle();
  assert.match(Jobs.load(h.root,SHA).failed.errors[0],/probe crashed/);
  assert.equal(Jobs.kick(h.reader,'session-end',{replay:async()=>observed()}).state,'started');await Jobs.idle();assert.ok(Jobs.load(h.root,SHA).record);
 }finally{h.close();}
});
test('partial replay errors and missing DOM samples cannot upload a successful record',async()=>{
 const h=setup(true),calls=[];const fetcher=async u=>{calls.push(u);return {ok:true,status:200};};
 try{
  const partial=observed();partial.errors=['probe lost its page'];
  Jobs.kick(h.reader,'session-end',{replay:async()=>partial,fetcher});await Jobs.idle();
  const doc=Jobs.load(h.root,SHA);assert.equal(doc.unreliable,true);assert.equal(doc.sent,false);assert.deepEqual(calls,[]);
  Jobs.kick(h.reader,'session-end',{replay:async()=>({errors:[],samples:[]}),fetcher});await Jobs.idle();
  assert.match(Jobs.load(h.root,SHA).failed.errors[0],/no DOM samples/);assert.deepEqual(calls,[]);
 }finally{h.close();}
});
test('a failed score upload stays unsent with its reason, then calibration retries that same record',async()=>{
 const h=setup(true),feed=require('../services/auto-profile-feed.cjs'),auto=require('../core/auto-profile.cjs');
 try{
  Jobs.kick(h.reader,'session-end',{replay:async()=>observed(),fetcher:async()=>({ok:false,status:503})});await Jobs.idle();
  const before=Jobs.load(h.root,SHA);assert.equal(before.sent,false);assert.deepEqual(before.upload,{state:'failed'});
  const bodies=[];await feed.report(h.root,auto.record({key:SHA,engine:'kirikiri',exe:'x.exe',version:'1.4.23',source:'calibration',result:{mode:'hide',settings:{},score:{cost:0},reason:''}}),{fetcher:async(url,init)=>{if(url.endsWith('/api/cardinal/score'))bodies.push(JSON.parse(init.body));return {ok:true,status:200,clone(){return {json:async()=>({})};}};}});
  for(let i=0;i<50&&!Jobs.load(h.root,SHA).sent;i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(Jobs.load(h.root,SHA).sent,true);assert.deepEqual(Jobs.load(h.root,SHA).upload,{state:'sent'});assert.deepEqual(bodies,[before.record]);
 }finally{h.close();}
});
