// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 Cardinal (core/cardinal/, services/cardinal.cjs, services/cardinal/, docs/cardinal.md): the scores are pure and come from
   the profile's cardinal.* rules (domains registered, no user preference), the tape keeps the session's bridge records, the record the
   relay takes has exactly its fields and no identity, uploading follows the sharing switches, and a run in the background writes
   data/The Seed/cardinal/<sha>.json without touching the live reader or any mode. No browser, no network: the replay is injected
   here; the whole chain into the hidden reader runs in validation/fixtures/games/fata-morgana/acceptance.case.cjs. */
/* never the real relay from a test, whatever a test forgets */
process.env.MEGULIT_RELAY_BASE='https://relay.test';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const C=require('../core/cardinal/checks.cjs'),S=require('../core/cardinal/score.cjs'),Tape=require('../core/cardinal/tape.cjs'),L=require('../core/cardinal/timeline.cjs');
const D=require('../core/profiles/defaults.cjs'),domains=require('../core/profiles/domains.cjs'),Profiles=require('../core/profiles/index.cjs');
const tmp=()=>fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'cardinal-'));
const SHA='a'.repeat(64);
/* Explicit synthetic hide evidence is unit input, never a healthy live baseline. A synthetic run: lines of text shown from `at` for `ms`, glyphs at y, Chinese under them, all inside one hit region */
function run({lines=[],extra=[],hbSent=[],hookEvents=[],offers=[],choicesShown=true,hidden,sourceSteps=null}={}){const steps=[],samples=[];let t=1000;
 lines.forEach((l,i)=>{steps.push({t,hb:{type:'hookSource',text:l.text},line:i+1,text:l.text});t+=2000;});
 lines.forEach((l,i)=>{for(let at=l.at;at<l.at+(l.ms||1500);at+=90){const y=typeof l.y==='function'?l.y(at-l.at):(l.y??700);
  const glyphs=(l.hide&&at-l.at>=300?[]:[{text:l.text,kind:'line',rect:{x:100,y,w:300,h:30},color:[255,255,255],pointer:'auto'}]);
  for(const e of extra)if(e.at>=at&&e.at<at+90)glyphs.push({text:e.text,kind:e.kind||'extra',rect:{x:100,y:e.y??600,w:100,h:30},color:[200,200,200],pointer:'none'});
  for(const o of l.also||[])glyphs.push({text:o.text,kind:'line',rect:{x:100,y:o.y,w:300,h:30},color:[255,255,255],pointer:'auto'});
  const s={at,mark:'tick',watch:true,body:'',hookSource:l.text,glyphs,cn:l.noCn?[]:[{text:'中文',rect:{x:100,y:y+40,w:300,h:30}}],choices:[],hitRegions:[{x:0,y:0,width:1920,height:1080}]};
  for(const o of offers)if(choicesShown&&at>=o.at&&at<o.at+3000)s.choices.push(...Array.from({length:o.n},(_,i)=>({sourceText:o.texts?.[i]||'選択'+i,text:'選択'+i,translation:'译文'+i,translationShown:true,translationRequired:true,pointer:'auto',shown:true,rect:{x:500,y:300+i*50,w:200,h:40}})));samples.push(s);}});
 const sourceEpisodes=[];for(const [step,st] of (sourceSteps||steps).entries())if(st.hb?.type==='hookSource')sourceEpisodes.push({step,line:st.line,text:st.hb.text,at:lines[sourceEpisodes.length].at});
 return {name:'r',steps,o:{t0:0,samples,sourceEpisodes,hbSent,hookEvents,choiceOffers:offers,hidden:{source:'native-dialogue',modeled:false,...(hidden||{lines:3,visible:0})},krkr:{choice:[]}}};}
const clean3=()=>[{text:'あいうえお',at:0},{text:'かきくけこ',at:2000},{text:'さしすせそ',at:4000}];

test('a clean session scores 1 on every score that applies; nothing to look at leaves the total',()=>{
 const r=S.score(run({lines:clean3()}),D.cardinal);
 assert.equal(r.lines,3);assert.deepEqual(r.scores,{row:1,stable:1,clean:1,clear:1,choice:1,pair:1,leak:1});assert.equal(r.total,1);
 assert.equal(r.applies.choice,false,'no options offered: choice leaves the total');
 for(const v of Object.values(r.scores))assert.ok(v>=0&&v<=1);
});

test('each score sees its own fault',()=>{
 /* 1 row: a line that disappears */
 {const ls=clean3();ls[1].hide=true;const r=S.score(run({lines:ls}),D.cardinal);assert.ok(r.scores.row<1&&r.scores.row>0.6,'row '+r.scores.row);assert.equal(r.scores.stable,1);}
 /* 2 stable: the row moves when the translation comes */
 {const ls=clean3();ls[0].y=ms=>ms<600?700:680;const r=S.score(run({lines:ls}),D.cardinal);assert.ok(r.scores.stable<1,'stable '+r.scores.stable);assert.equal(r.scores.row,1);}
 /* 3 clean: the fallback layer draws an unclickable line */
 {const r=S.score(run({lines:clean3(),extra:[{text:'あいう',at:500}]}),D.cardinal);assert.ok(r.scores.clean<1,'clean '+r.scores.clean);}
 /* 3 clean: the same line drawn twice (禁止复读) */
 {const ls=clean3();ls[1].also=[{text:'かきくけこ',y:660}];const r=S.score(run({lines:ls}),D.cardinal);assert.ok(r.scores.clean<1,'clean '+r.scores.clean);assert.match(r.detail.dup[0],/drawn twice/);}
 /* 4 clear: the line before stays on the row of the line now shown */
 {const ls=clean3();ls[1].also=[{text:'あいうえお',y:700}];const r=S.score(run({lines:ls}),D.cardinal);assert.ok(r.scores.clear<1,'clear '+r.scores.clear);}
 /* 5 choice: options offered, none visible */
 {const r=S.score(run({lines:clean3(),offers:[{at:2500,n:2}],choicesShown:false}),D.cardinal);assert.equal(r.scores.choice,0);assert.equal(r.applies.choice,true);
  const ok=S.score(run({lines:clean3(),offers:[{at:2500,n:2}]}),D.cardinal);assert.equal(ok.scores.choice,1);}
 /* 6 pair: no Chinese row */
 {const ls=clean3();ls[2].noCn=true;const r=S.score(run({lines:ls}),D.cardinal);assert.ok(Math.abs(r.scores.pair-2/3)<0.01,'pair '+r.scores.pair);}
 /* 7 leak: the hide is disabled during the second line, and back on before the third */
 {const r=S.score(run({lines:clean3(),hbSent:[{at:2100,type:'disable'},{at:3500,type:'enable'}]}),D.cardinal);assert.ok(Math.abs(r.scores.leak-2/3)<0.01,'leak '+r.scores.leak);}
 /* 7 leak: the kernel's preflight (check baseline, back on within preflightMs) is not a leak; a longer one is */
 {const iso=ms=>new Date(ms).toISOString();const ev=[iso(2100)+' check baseline x'];
  assert.equal(S.score(run({lines:clean3(),hookEvents:ev,hbSent:[{at:2100,type:'disable'},{at:2500,type:'enable'}]}),D.cardinal).scores.leak,1);
  assert.ok(S.score(run({lines:clean3(),hookEvents:ev,hbSent:[{at:2100,type:'disable'},{at:3900,type:'enable'}]}),D.cardinal).scores.leak<1);}
 /* 7 leak: switched to read mode and never back */
 {const iso=ms=>new Date(ms).toISOString();const r=S.score(run({lines:clean3(),hookEvents:[iso(1500)+' render mode switched in place custom -> read']}),D.cardinal);assert.ok(r.scores.leak<0.5,'leak '+r.scores.leak);}
 /* 7 leak: dialogue records drawn visible while the hide was on */
 {const r=S.score(run({lines:clean3(),hidden:{lines:4,visible:1}}),D.cardinal);assert.equal(r.scores.leak,0.75);}
});

test('weights and thresholds come from the rules (a profile layer can retune them)',()=>{
 const ls=clean3();ls[2].noCn=true;const base=S.score(run({lines:ls}),D.cardinal);
 const onlyPair=S.score(run({lines:ls}),{...D.cardinal,weights:{row:0,stable:0,clean:0,clear:0,choice:0,pair:1,leak:0}});
 assert.ok(onlyPair.total<base.total);assert.equal(onlyPair.total,onlyPair.scores.pair);
 const moved=clean3();moved[0].y=ms=>ms<600?700:697;
 assert.ok(S.score(run({lines:moved}),D.cardinal).scores.stable<1);
 assert.equal(S.score(run({lines:moved}),{...D.cardinal,thresholds:{...D.cardinal.thresholds,stablePx:4}}).scores.stable,1);
 /* the checks' own defaults are the profile defaults */
 assert.deepEqual({...C.T0},{...D.cardinal.thresholds});
});

test('cardinal.* is a registered profile domain: numbers only, no user preference, out-of-range values refused',()=>{
 const miss=domains.leaves({cardinal:D.cardinal}).filter(k=>!domains.DOMAINS[k]);assert.deepEqual(miss,[]);
 assert.deepEqual(domains.clean({cardinal:D.cardinal}).rejected,[]);
 assert.deepEqual(domains.clean({cardinal:{weights:{row:1e6}}}).rejected,['cardinal.weights.row']);
 assert.deepEqual(domains.clean({cardinal:{fontFamily:'x',color:'#fff'}}).rejected.sort(),['cardinal.color','cardinal.fontFamily']);
 for(const k of Object.keys(domains.DOMAINS).filter(k=>k.startsWith('cardinal.')))assert.ok(!/font|colou?r|size|position|style|opacity/i.test(k),k);
 /* a signed game layer retunes a game's rules */
 const p=Profiles.apply(Profiles.profileFor({}),{cardinal:{weights:{pair:5},lines:80}},'official');assert.equal(p.cardinal.weights.pair,5);assert.equal(p.cardinal.weights.row,3);assert.equal(p.cardinal.lines,80);
});

test('the record has exactly the relay fields, units in 0..1, no identity',()=>{
 const r=S.score(run({lines:clean3()}),D.cardinal);
 const rec=S.record({key:SHA,seedRev:'v1.g6',source:'official',app:'1.4.23',result:r,cardinalRev:1,at:new Date('2026-11-21T05:00:00Z')});
 assert.deepEqual(Object.keys(rec),['schema','version','key','seedRev','source','app','lines','scores','total','cardinalRev','at']);
 assert.deepEqual(Object.keys(rec.scores),['row','stable','clean','clear','choice','pair','leak']);
 assert.equal(rec.schema,'megulit.cardinal-score');assert.equal(rec.version,1);assert.equal(rec.cardinalRev,'1');assert.equal(rec.at,'2026-11-21T05:00:00.000Z');
 assert.equal(S.record({key:SHA,result:r,app:'1.4.23'}).seedRev,null);assert.equal(S.record({key:SHA,result:r,app:'1.4.23',source:'weird'}).source,'none');
 assert.ok(!/user|name|path|folder|machine|device|steam|token|font|colou?r/i.test(JSON.stringify(Object.keys(rec))));
});

test('the tape keeps the bridges\' records of the last lines with the attach records before them',()=>{
 Tape.clear();Tape.keep(10);let t=1000;
 Tape.record('gwb',{type:'ready'},t++);Tape.record('gwb',{type:'bound',gameProcessId:7,gameStarted:'1'},t++);Tape.record('gwb',{type:'layout',clientWidth:800},t++);
 Tape.record('hb',{type:'hookProcess',path:'x.exe'},t++);Tape.record('hb',{type:'hookThreads',hookThreads:[]},t++);
 for(let i=0;i<50;i++){Tape.record('hb',{type:'hookSource',text:'行'+i},t+=1000);Tape.record('hb',{type:'hookHeartbeat'},t+1);Tape.record('gwb',{type:'hostFrame'},t+2);Tape.record('gwb',{type:'readerInput',complete:true},t+500);}
 Tape.record('gwb',{type:'clientShot',jpeg:'x'.repeat(10)},t+600);Tape.record('hb',{type:'hookSource',text:'x'.repeat(70000)},t+700);
 const st=Tape.stats();assert.ok(st.lines<=30,'trimmed to keep + margin: '+st.lines);
 const snap=Tape.snapshot(10);assert.equal(snap.lines,10);
 const types=snap.rows.map(r=>(r.gwb||r.hb).type);assert.deepEqual(types.slice(0,5),['ready','bound','layout','hookProcess','hookThreads'],'attach first');
 assert.ok(!types.includes('hookHeartbeat')&&!types.includes('hostFrame')&&!types.includes('clientShot'));
 assert.equal(snap.rows.filter(r=>r.hb?.type==='hookSource').at(-1).hb.text,'行49');
 for(let i=1;i<snap.rows.length;i++)assert.ok(snap.rows[i].t>=snap.rows[i-1].t,'in time order');
 /* the steps: every hookSource a line, no second attach */
 const steps=L.fromTape(snap.rows,{});assert.equal(steps.filter(s=>s.line).length,10);assert.equal(steps.filter(s=>s.gwb?.type==='bound').length,1);
 /* a new game process starts a new tape */
 Tape.record('gwb',{type:'bound',gameProcessId:8,gameStarted:'2'},t+9000);assert.equal(Tape.stats().lines,0);Tape.clear();
});

test('an older HookBridge recording ({t,m}) gets an attach and its reader input goes to the window bridge',()=>{
 const steps=L.fromTape([{t:5,m:{type:'hookSource',text:'あ'}},{t:9,m:{type:'readerInput',complete:true}}],{title:'X'});
 assert.equal(steps[0].gwb.type,'ready');assert.ok(steps.some(s=>s.gwb?.type==='bound'&&s.gwb.gameTitle==='X'));
 assert.equal(steps.find(s=>s.hb?.type==='hookSource').line,1);assert.equal(steps.at(-1).gwb.type,'readerInput');
});

test('scores reach the relay only with sharing on, as the bare record',async()=>{
 const root=tmp();const feed=require('../services/auto-profile-feed.cjs');const lib=path.join(root,'data','config','library.json');fs.mkdirSync(path.dirname(lib),{recursive:true});
 const rec=S.record({key:SHA,result:S.score(run({lines:clean3()}),D.cardinal),app:'1.4.23',cardinalRev:1});const calls=[];const fetcher=async(url,init)=>{calls.push({url,init});return {ok:true,status:200};};
 const prev=process.env.MEGULIT_RELAY_BASE;process.env.MEGULIT_RELAY_BASE='https://relay.test';
 try{
  fs.writeFileSync(lib,JSON.stringify({sharedAdaptation:false}));assert.equal((await feed.reportScore(root,rec,{fetcher})).state,'skipped');
  fs.writeFileSync(lib,JSON.stringify({sharedAdaptation:true,autoProfileShare:false}));assert.equal((await feed.reportScore(root,rec,{fetcher})).state,'skipped');assert.equal(calls.length,0);
  fs.writeFileSync(lib,JSON.stringify({}));assert.equal((await feed.reportScore(root,rec,{fetcher})).state,'sent');
  assert.equal(calls[0].url,'https://relay.test/api/cardinal/score');assert.equal(calls[0].init.method,'POST');assert.deepEqual(JSON.parse(calls[0].init.body),rec);
  assert.ok(!/cookie|authorization/i.test(JSON.stringify(calls[0].init.headers)));
  /* Explicit synthetic transport evidence: a compatible unsent score retries with calibration, not a live acceptance fixture. */
  const C2=require('../services/cardinal.cjs');fs.mkdirSync(C2.dir(root),{recursive:true});fs.writeFileSync(C2.fileOf(root,SHA),JSON.stringify({record:{...rec,cardinalRev:String(D.cardinal.rev)},sent:false,unreliable:false,errors:[],detail:{pairObservation:{source:'live-display',reliable:true},leakObservation:{observed:true},timeline:{source:'measured-delivery',reliable:true},choiceObservation:{reliable:true},timing:require('./helpers/cardinal-timing.cjs').proof()}}));
  calls.length=0;const ap=require('../core/auto-profile.cjs');
  await feed.report(root,ap.record({key:SHA,engine:'kirikiri',exe:'x.exe',version:'1.4.23',source:'calibration',result:{mode:'hide',settings:{},score:{cost:0},reason:''}}),{fetcher});
  for(let i=0;i<20&&!calls.some(c=>/cardinal/.test(c.url));i++)await new Promise(r=>setTimeout(r,10));
  assert.ok(calls.some(c=>/\/api\/cardinal\/score$/.test(c.url)),'score sent with the report: '+calls.map(c=>c.url).join(','));
 }finally{if(prev===undefined)delete process.env.MEGULIT_RELAY_BASE;else process.env.MEGULIT_RELAY_BASE=prev;}
});

test('a background run writes data/The Seed/cardinal/<sha>.json and never touches the live reader or a mode',async()=>{
 const root=tmp();fs.mkdirSync(path.join(root,'data','config'),{recursive:true});fs.writeFileSync(path.join(root,'data','config','library.json'),JSON.stringify({sharedAdaptation:false}));const net=[];const fetcher=async u=>{net.push(u);return {ok:true,status:200};};const C2=require('../services/cardinal.cjs');C2._reset();Tape.clear();Tape.keep(60);let t=Date.now()-60000;
 Tape.record('gwb',{type:'bound',gameProcessId:11,gameStarted:'3'},t);for(let i=0;i<12;i++){Tape.record('hb',{type:'hookSource',text:'台詞'+i},t+=1500);require('./helpers/cardinal-display.cjs').display(Tape,'台詞'+i,'受控transport译文'+i,{sequence:i+1});}
 const touched=[];const gal=new Proxy({state:{gameProcessId:11},hooks:{trace:l=>touched.push('trace:'+l.split(' ')[1])}},{get(o,k){if(k in o)return o[k];return (...a)=>{touched.push(String(k));};}});
 const reader={root,gameExe:'C:/Games/x.exe',gal};
 let scenario=null;const replay=async sc=>{scenario=sc;const lines=sc.steps.filter(s=>s.line);return require('./helpers/cardinal-timing.cjs').instrument(sc.steps,run({sourceSteps:sc.steps,lines:lines.map((s,i)=>({text:s.text,at:i*1600}))}).o);};
 const prev=process.env.MEGULIT_CARDINAL_REPLAY;process.env.MEGULIT_CARDINAL_REPLAY='1';assert.equal(C2.kick(reader,'session-end',{manual:true,replay}).why,'inside a replay');if(prev===undefined)delete process.env.MEGULIT_CARDINAL_REPLAY;
 /* no exe key here: tell it through a stand-in self-check session */
 const live=require('../services/self-check-live.cjs');const orig=live.current;live.current=()=>({reader,key:SHA,from:'',profile:Profiles.profileFor({})});
 try{assert.equal(C2.kick(reader,'session-end',{manual:true,replay,fetcher}).state,'started');await C2.idle();}finally{live.current=orig;}
 assert.deepEqual(net,[],'sharing off: nothing leaves the PC');
 assert.equal(scenario.models,false,'a tape carries what the game did: no models');assert.equal(scenario.attachSettleMs,2000);assert.equal(scenario.maxGap,D.cardinal.maxGapMs);
 const doc=C2.load(root,SHA);assert.ok(doc&&doc.record,'written');assert.equal(doc.record.key,SHA);assert.equal(doc.record.lines,12);assert.equal(doc.record.source,'none');assert.equal(doc.record.total,1);
 assert.deepEqual(touched.filter(k=>!k.startsWith('trace:')),[],'nothing but the trace was called on the live reader');
 /* a calibration right after a run waits for cardinal.minIntervalMin; a session's end does not */
 live.current=()=>({reader,key:SHA,from:'',profile:Profiles.profileFor({})});try{assert.equal(C2.kick(reader,'calibrated',{manual:true,replay,fetcher}).why,'ran lately');}finally{live.current=orig;}
 Tape.clear();C2._reset();
});

test('a replay the PC could not keep up with is kept on this PC and never uploaded',async()=>{
 const root=tmp();fs.mkdirSync(path.join(root,'data','config'),{recursive:true});fs.writeFileSync(path.join(root,'data','config','library.json'),'{}');
 const C2=require('../services/cardinal.cjs');C2._reset();Tape.clear();Tape.keep(60);let t=Date.now()-60000;
 Tape.record('gwb',{type:'bound',gameProcessId:12,gameStarted:'4'},t);for(let i=0;i<12;i++){Tape.record('hb',{type:'hookSource',text:'台詞'+i},t+=1500);require('./helpers/cardinal-display.cjs').display(Tape,'台詞'+i,'受控transport译文'+i,{sequence:i+1});}
 const reader={root,gameExe:'C:/Games/x.exe',gal:{state:{},hooks:{trace(){}}}};const live=require('../services/self-check-live.cjs'),orig=live.current;live.current=()=>({reader,key:SHA,from:'',profile:Profiles.profileFor({})});
 const net=[];const fetcher=async u=>{net.push(u);return {ok:true,status:200};};const prev=process.env.MEGULIT_RELAY_BASE;process.env.MEGULIT_RELAY_BASE='https://relay.test';
 const replay=lag=>async sc=>{const o=require('./helpers/cardinal-timing.cjs').instrument(sc.steps,run({sourceSteps:sc.steps,lines:sc.steps.filter(s=>s.line).map((s,i)=>({text:s.text,at:i*1600}))}).o);for(const step of o.timing.steps)step.at=step.due+lag;o.lag=require('../core/cardinal/timing.cjs').statistics(o.timing.steps,o.timing.probes,90).lag;return o;};
 try{C2.kick(reader,'session-end',{manual:true,replay:replay(400),fetcher});await C2.idle();const doc=C2.load(root,SHA);assert.equal(doc.unreliable,true);assert.equal(doc.sent,false);assert.deepEqual(net,[]);
  C2._reset();C2.kick(reader,'session-end',{manual:true,replay:replay(10),fetcher});await C2.idle();assert.equal(C2.load(root,SHA).unreliable,false);assert.deepEqual(net,['https://relay.test/api/cardinal/score']);}
 finally{live.current=orig;if(prev===undefined)delete process.env.MEGULIT_RELAY_BASE;else process.env.MEGULIT_RELAY_BASE=prev;Tape.clear();C2._reset();}
});

test('the seed the session ran with names the source and revision',()=>{
 const C2=require('../services/cardinal.cjs');
 assert.deepEqual(C2.sourceOf({from:'official',shared:{version:{rev:3},game:{rev:6}}}),{source:'official',seedRev:'v3.g6'});
 assert.deepEqual(C2.sourceOf({from:'shared',shared:{game:{rev:2}}}),{source:'auto',seedRev:'g2'});
 assert.deepEqual(C2.sourceOf({from:'local'}),{source:'auto',seedRev:null});
 assert.deepEqual(C2.sourceOf({from:''},{layers:'core'}),{source:'none',seedRev:null});
 const fata=Profiles.profileFor({exeSha256:'17b5941ae0fe1e46894c34e7f1c5bae9a2ef7cdc85fb490c52e305e2c84bde42',exe:'fata_jp.exe',title:'ファタモルガーナの館'});
 const s=C2.sourceOf({from:'seed',key:fata.exeSha256,profile:fata});assert.equal(s.source,'official');assert.match(s.seedRev,/^v\d+\.g\d+$/);
});
test('session pairing needs explicit display observations, never cache availability or replay placeholders',()=>{
 Tape.clear();Tape.pairPolicy({schema:1,client:'explicit-pair-unit',revision:1,enabled:true,visible:true,target:'zh'},'zh');
 const ds=['あいうえお','かきくけこ','さしすせそ'].map((text,i)=>Tape.liveSource(text,{sequence:i+1}));
 Tape.liveTranslation('あいうえお','受控译文');assert.equal(Tape.pairing(60).paired,0);
 const observe=(i,translation)=>Tape.pairObserved({...ds[i],observed:true,paired:!!translation,enabled:true,visible:true,translation},'zh');observe(0,'受控译文');
 const run1=run({lines:clean3()});run1.livePairing=Tape.pairing(60);const result=S.score(run1,D.cardinal);assert.equal(result.scores.pair,.333);assert.equal(result.detail.pair.source,'live-display');assert.equal(result.detail.pair.shown,3);assert.equal(result.detail.pairObservation.reliable,false);
 const missing=structuredClone(run1);missing.livePairing={...run1.livePairing,paired:0,unpaired:3,unobserved:0,reliable:true};const lower=S.score(missing,D.cardinal);assert.equal(lower.scores.pair,0);assert.ok(lower.total<result.total,'explicit synthetic display-ack loss lowers the score');
 Tape.liveTranslation('かきくけこ','迟到译文');assert.equal(Tape.pairing(60).paired,1);observe(1,'迟到译文');observe(2,'');assert.equal(Tape.pairing(60).paired,2);
 process.env.MEGULIT_CARDINAL_REPLAY='1';try{Tape.liveTranslation('さしすせそ','回放假译文');Tape.liveSource('回放假日文');}finally{delete process.env.MEGULIT_CARDINAL_REPLAY;}
 assert.equal(Tape.pairing(60).paired,2);assert.equal(Tape.pairing(60).reliable,true);Tape.clear();assert.equal(Tape.pairing(60).shown,0);assert.equal(Tape.pairing(60).reliable,false);
});
