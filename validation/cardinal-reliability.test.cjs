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
test('real DOM: wrong Japanese and a two-glyph fragment cannot complete the expected line',()=>{
 const base=C.perLine(fixture.run),baseline=S.score(fixture.run,D.cardinal);
 for(const variant of ['wrong-glyphs','two-glyph-prefix']){
  const run=structuredClone(fixture.run);
  for(const s of run.o.samples){let n=0;if(variant==='wrong-glyphs')for(const g of s.glyphs||[])if(g.kind==='line')g.text='違';
   if(variant==='two-glyph-prefix')s.glyphs=s.glyphs.filter(g=>g.kind!=='line'||n++<2);}
  const result=S.score(run,D.cardinal);assert.equal(result.detail.contentCoverage.complete,0);assert.equal(result.total,0,variant);assert.ok(result.total<=baseline.total);
 }
 const typed=structuredClone(fixture.run);
 for(const line of C.lines(typed)){const last=line.samples.filter(s=>C.norm(C.lineGlyphs(s).map(g=>g.text).join(''))===C.norm(line.text)).at(-1);if(!last)continue;for(const s of line.samples.filter(s=>s.at<last.at)){let n=0;s.glyphs=s.glyphs.filter(g=>g.kind!=='line'||n++<2);}}
 assert.equal(C.perLine(typed).complete.lines,base.complete.lines,'earlier true prefixes may grow into the unchanged final real text');
});
test('a later repeated source with no new DOM cannot reuse the earlier source episode',()=>{
 const run=structuredClone(fixture.run),baseline=S.score(run,D.cardinal),line=C.lines(run)[0],source=run.steps.find(s=>s.line===line.line&&s.hb?.type==='hookSource');
 run.steps.push({...structuredClone(source),line:9999,t:Math.max(...run.steps.map(s=>s.t),...run.o.samples.map(s=>s.at))+3000});
 const result=S.score(run,D.cardinal);assert.equal(result.lines,baseline.lines);assert.ok(result.total<=baseline.total);
 assert.deepEqual(result.detail.timeline,{source:'legacy-source-transitions',reliable:false});
});
test('measured source delivery windows use replay elapsed time rather than input epoch time',()=>{
 const run={steps:[{t:1795253000000,line:1,text:'本文',hb:{type:'hookSource',text:'本文'}},{t:1795253009000,line:2,text:'本文',hb:{type:'hookSource',text:'本文'}}],o:{sourceEpisodes:[{step:0,line:1,text:'本文',at:500},{step:1,line:2,text:'本文',at:2500}],samples:[500,900,1300,1700].map(at=>({at,hookSource:'本文',body:'',glyphs:[{text:'本文',kind:'line',rect:{x:0,y:0,w:20,h:10},pointer:'auto'}],hitRegions:[{x:0,y:0,width:20,height:10}]}))}};
 assert.deepEqual(C.lines(run).map(x=>x.line),[1],'the second identical source has no samples in its own measured window');
 assert.equal(C.perLine(run).complete.lines,1,'a genuinely complete two-character sentence is valid');
});
test('delivery clocks require every source exactly once with its identity, text and monotonic finite time',()=>{
 const run={steps:[{t:100,line:1,text:'本文',hb:{type:'hookSource',text:'本文'}},{t:200,line:2,text:'後文',hb:{type:'hookSource',text:'後文'}}],o:{sourceEpisodes:[{step:0,line:1,text:'本文',at:10},{step:1,line:2,text:'後文',at:20}],samples:[]}};
 assert.equal(C.deliveryClock(run).reliable,true,'controlled transport fixture only, no healthy DOM claim');
 for(const mutate of [r=>r.o.sourceEpisodes=[],r=>r.o.sourceEpisodes.pop(),r=>r.o.sourceEpisodes.push({...r.o.sourceEpisodes[0]}),r=>r.o.sourceEpisodes[1].line=1,r=>r.o.sourceEpisodes[1].step=0,r=>r.o.sourceEpisodes[1].text='違う文',r=>r.o.sourceEpisodes[1].at=NaN,r=>r.o.sourceEpisodes[0].at=-1,r=>r.o.sourceEpisodes.reverse(),r=>r.o.sourceEpisodes[1].at=5]){
  const bad=structuredClone(run);mutate(bad);assert.equal(C.deliveryClock(bad).reliable,false);assert.equal(S.score(bad,D.cardinal).total,0);
 }
});
function setup(share=false){
 const root=fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'cardinal-reliability-'));
 fs.mkdirSync(path.join(root,'data','config'),{recursive:true});fs.writeFileSync(path.join(root,'data','config','library.json'),JSON.stringify({sharedAdaptation:share}));
 Jobs._reset();Tape.clear();let t=Date.now()-60000;
 Tape.record('gwb',{type:'bound',gameProcessId:62,gameStarted:'6'},t);
 for(let i=0;i<12;i++)Tape.record('hb',{type:'hookSource',text:'実記録の台詞'+i},t+=1500);
 const reader={root,gameExe:'C:/Games/test.exe',gal:{state:{},hooks:{trace(){}}}};
 const traces=[];reader.gal.hooks.trace=line=>traces.push(line);
 const original=Live.current;Live.current=()=>({reader,key:reader.cardinalKey||SHA,from:'',profile:Profiles.profileFor({})});
 return {root,reader,traces,close(){Live.current=original;Jobs._reset();Tape.clear();}};
}
// Job-control tests inject a controlled delivery clock; their old real DOM is not a fabricated healthy alignment.
const observed=sc=>{let n=0;return {...structuredClone(fixture.run.o),sourceEpisodes:(sc?.steps||[]).flatMap((st,step)=>st.hb?.type==='hookSource'?[{step,line:st.line,text:st.hb.text,at:n++*1600}]:[])};};
test('the queue drains a third job scheduled during its second replay, and idle waits for all three',async()=>{
 const h=setup();let releaseA,releaseB,startedB;const waitA=new Promise(r=>releaseA=r),waitB=new Promise(r=>releaseB=r),bStarted=new Promise(r=>startedB=r),calls=[];
 try{
  Jobs.kick(h.reader,'session-end',{manual:true,replay:async sc=>{calls.push('a');await waitA;return observed(sc);}});
  assert.equal(Jobs.kick(h.reader,'session-end',{manual:true,replay:async sc=>{calls.push('b');startedB();await waitB;return observed(sc);}}).state,'queued');
  releaseA();await bStarted;
  assert.equal(Jobs.kick(h.reader,'session-end',{manual:true,replay:async sc=>{calls.push('c');return observed(sc);}}).state,'queued');
  releaseB();await Jobs.idle();assert.deepEqual(calls,['a','b','c']);
 }finally{releaseA();releaseB();h.close();}
});
test('different games keep FIFO order, same-game waiting work coalesces, and queue overflow is explicit',async()=>{
 const h=setup(),calls=[];let release;const blocked=new Promise(r=>release=r);
 const key=i=>i.toString(16).padStart(64,'0');
 try{
  Jobs.kick(h.reader,'session-end',{manual:true,replay:async sc=>{calls.push('active');await blocked;return observed(sc);}});
  h.reader.cardinalKey=key(1);assert.equal(Jobs.kick(h.reader,'session-end',{manual:true,replay:async sc=>{calls.push('obsolete');return observed(sc);}}).state,'queued');
  assert.equal(Jobs.kick(h.reader,'session-end',{manual:true,replay:async sc=>{calls.push('latest-1');return observed(sc);}}).replaced,true);
  for(let i=2;i<=8;i++){h.reader.cardinalKey=key(i);assert.equal(Jobs.kick(h.reader,'session-end',{manual:true,replay:async sc=>{calls.push('game-'+i);return observed(sc);}}).state,'queued');}
  h.reader.cardinalKey=key(9);assert.deepEqual(Jobs.kick(h.reader,'session-end',{manual:true,replay:async sc=>{calls.push('overflow');return observed(sc);}}),{state:'deferred',why:'queue full'});
  assert.ok(h.traces.some(s=>/queue full.*deferred/.test(s)));release();await Jobs.idle();
  assert.deepEqual(calls,['active','latest-1',...Array.from({length:7},(_,i)=>'game-'+(i+2))]);
  assert.equal(Jobs.kick(h.reader,'session-end',{manual:true,replay:async sc=>{calls.push('retried-9');return observed(sc);}}).state,'started');await Jobs.idle();assert.equal(calls.at(-1),'retried-9');
 }finally{release();h.close();}
});
test('a rejected replay is recorded as a failure and does not strand the next run',async()=>{
 const h=setup();try{
  Jobs.kick(h.reader,'session-end',{manual:true,replay:async sc=>{throw new Error('probe crashed');}});await Jobs.idle();
  assert.match(Jobs.load(h.root,SHA).failed.errors[0],/probe crashed/);
  assert.equal(Jobs.kick(h.reader,'session-end',{manual:true,replay:async sc=>observed(sc)}).state,'started');await Jobs.idle();assert.ok(Jobs.load(h.root,SHA).record);
 }finally{h.close();}
});
test('partial replay errors and missing DOM samples cannot upload a successful record',async()=>{
 const h=setup(true),calls=[];const fetcher=async u=>{calls.push(u);return {ok:true,status:200};};
 try{
  Jobs.kick(h.reader,'session-end',{manual:true,replay:async sc=>({...observed(sc),errors:['probe lost its page']}),fetcher});await Jobs.idle();
  const doc=Jobs.load(h.root,SHA);assert.equal(doc.unreliable,true);assert.equal(doc.sent,false);assert.deepEqual(calls,[]);
  Jobs.kick(h.reader,'session-end',{manual:true,replay:async sc=>({errors:[],samples:[]}),fetcher});await Jobs.idle();
  assert.match(Jobs.load(h.root,SHA).failed.errors[0],/no DOM samples/);assert.deepEqual(calls,[]);
 }finally{h.close();}
});
test('missing or corrupt delivery clocks never turn old real DOM into a reliable relay vote',async()=>{
 const h=setup(true),calls=[];const fetcher=async u=>{calls.push(u);return {ok:true,status:200};};
 try{
  for(const variant of ['empty','wrong-text','reversed','legacy']){
   Jobs.kick(h.reader,'session-end',{manual:true,replay:async sc=>{const out=observed(sc);if(variant==='empty')out.sourceEpisodes=[];if(variant==='wrong-text')out.sourceEpisodes[0].text='別の本文';if(variant==='reversed')out.sourceEpisodes.reverse();if(variant==='legacy')delete out.sourceEpisodes;return out;},fetcher});await Jobs.idle();
   const doc=Jobs.load(h.root,SHA);assert.equal(doc.unreliable,true,variant);assert.equal(doc.sent,false);assert.equal(doc.detail.timeline.reliable,false);assert.deepEqual(calls,[]);
  }
 }finally{h.close();}
});
test('a failed score upload stays unsent with its reason, then calibration retries that same record',async()=>{
 const h=setup(true),feed=require('../services/auto-profile-feed.cjs'),auto=require('../core/auto-profile.cjs');
 try{
  Jobs.kick(h.reader,'session-end',{manual:true,replay:async sc=>observed(sc),fetcher:async()=>({ok:false,status:503})});await Jobs.idle();
  const before=Jobs.load(h.root,SHA);assert.equal(before.sent,false);assert.deepEqual(before.upload,{state:'failed'});
  const bodies=[];await feed.report(h.root,auto.record({key:SHA,engine:'kirikiri',exe:'x.exe',version:'1.4.23',source:'calibration',result:{mode:'hide',settings:{},score:{cost:0},reason:''}}),{fetcher:async(url,init)=>{if(url.endsWith('/api/cardinal/score'))bodies.push(JSON.parse(init.body));return {ok:true,status:200,clone(){return {json:async()=>({})};}};}});
  for(let i=0;i<50&&!Jobs.load(h.root,SHA).sent;i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(Jobs.load(h.root,SHA).sent,true);assert.deepEqual(Jobs.load(h.root,SHA).upload,{state:'sent'});assert.deepEqual(bodies,[before.record]);
 }finally{h.close();}
});


test('cleanup failure stops the whole queue and survives a scheduler restart',async()=>{
 const h=setup();let release;const wait=new Promise(resolve=>release=resolve);let second=0;
 try{
  Jobs.kick(h.reader,'session-end',{manual:true,replay:async()=>{await wait;return {cleanupFailure:{browserPid:123,profile:'owned-profile',processClosed:false},samples:[]};}});
  Jobs.kick(h.reader,'session-end',{manual:true,replay:async()=>{second++;return {};}});
  release();await Jobs.idle();assert.equal(second,0);assert.ok(h.traces.some(s=>/queue halted/.test(s)));
  assert.equal(Jobs.kick(h.reader,'session-end',{manual:true,replay:async()=>{second++;}}).state,'blocked');
  Jobs._reset();const blocked=Jobs.kick(h.reader,'session-end',{manual:true,replay:async()=>{second++;}});assert.equal(blocked.state,'blocked');assert.equal(blocked.cleanupFailure.browserPid,123);assert.equal(second,0);
 }finally{release();h.close();}
});


test('unknown option translation instrumentation cannot upload a reliable relay vote',async()=>{
 const h=setup(true),calls=[];try{
  Jobs.kick(h.reader,'session-end',{manual:true,replay:async sc=>{const out=observed(sc),sample=out.samples[0];out.choiceOffers=[{at:sample.at,n:1,texts:['扉を開ける']}];sample.choices=[{sourceText:'扉を開ける',shown:true,pointer:'auto',rect:{x:1,y:1,w:20,h:10}}];return out;},fetcher:async u=>{calls.push(u);return {ok:true,status:200};}});await Jobs.idle();
  const doc=Jobs.load(h.root,SHA);assert.equal(doc.unreliable,true);assert.equal(doc.detail.choiceObservation.reliable,false);assert.equal(doc.sent,false);assert.deepEqual(calls,[]);
 }finally{h.close();}
});
