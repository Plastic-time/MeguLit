const test=require('node:test'),assert=require('node:assert/strict');
const {waitForVisibleGame}=require('../services/game-readiness.cjs');
test('a startup splash that disappears is not reported as a ready game',async()=>{let i=0;await assert.rejects(waitForVisibleGame(async()=>++i<3?[{pid:1,visible:true}]:[],{attempts:8,sleep:async()=>{}}),/GAME_PROCESS_EXITED/);});
test('window readiness requires consecutive visible samples from the same process',async()=>{const samples=[[{pid:1,visible:true}],[{pid:2,visible:true}],[{pid:2,visible:false}],...[1,2,3,4].map(()=>[{pid:3,visible:true}])];let i=0;assert.deepEqual(await waitForVisibleGame(async()=>samples[i++],{sleep:async()=>{}}),{pid:3});assert.equal(i,7);});
test('a running process without a window leaves the home available',async()=>{await assert.rejects(waitForVisibleGame(async()=>[{pid:1,visible:false}],{attempts:2,sleep:async()=>{}}),/GAME_WINDOW_NOT_READY/);});
test('Josou locale fallback needs two successful empty queries begun after helper exit',async()=>{
 let ended=null,queries=0;
 const opts={helper:true,checkHelperHandoff:true,exit:()=>ended,attempts:6,sleep:async()=>{}};
 await assert.rejects(waitForVisibleGame(async()=>{
  queries++;
  if(queries===1)ended={code:0}; // The first snapshot was taken while the helper was running.
  if(queries===3)throw Error('PROCESS_QUERY_FAILED');
  return [];
 },opts),{message:'GAME_PROCESS_EXITED',detail:'HELPER_FINISHED_WITHOUT_GAME'});
 assert.equal(queries,5);
});
test('a hidden or late Josou game and an ordinary launcher never trigger the missing-child retry',async()=>{
 const opts={helper:true,checkHelperHandoff:true,exit:()=>({code:0}),attempts:4,stableSamples:2,sleep:async()=>{}};
 const samples=[[],[{pid:10,visible:false}],[{pid:10,visible:true}],[{pid:10,visible:true}]];
 assert.deepEqual(await waitForVisibleGame(async()=>samples.shift(),opts),{pid:10});
 await assert.rejects(waitForVisibleGame(async()=>[{pid:10,visible:false}],opts),/GAME_WINDOW_NOT_READY/);
 await assert.rejects(waitForVisibleGame(async()=>[],{...opts,checkHelperHandoff:false}),/GAME_WINDOW_NOT_READY/);
 await assert.rejects(waitForVisibleGame(async()=>[],{...opts,exit:()=>null}),/GAME_WINDOW_NOT_READY/);
 await assert.rejects(waitForVisibleGame(async()=>[],{...opts,exit:()=>({code:1})}),/LE_HELPER_FAILED/);
});
test('a Josou child sampled before exiting without a window also gets the confirmed handoff failure',async()=>{
 const opts={helper:true,checkHelperHandoff:true,exit:()=>({code:0}),attempts:4,sleep:async()=>{}};
 const samples=[[],[{pid:10,visible:false}],[],[]];
 await assert.rejects(waitForVisibleGame(async()=>samples.shift(),opts),{detail:'HELPER_FINISHED_WITHOUT_GAME'});
 assert.equal(samples.length,0);
 const splash=[[{pid:10,visible:true}],[]];
 await assert.rejects(waitForVisibleGame(async()=>splash.shift(),opts),e=>e.message==='GAME_PROCESS_EXITED'&&!e.detail);
});
test('v1.1.0: failed process queries do not fail a launch',async()=>{
 const opts={attempts:5,interval:1,sleep:async()=>{}};let n=0;
 /* a few failures, then the window shows */
 assert.deepEqual(await waitForVisibleGame(async()=>{if(n++<2)throw Error('PROCESS_QUERY_FAILED');return [{pid:7,visible:true}];},{...opts,stableSamples:2}),{pid:7});
 /* never answered: launched but unverified */
 assert.deepEqual(await waitForVisibleGame(async()=>{throw Error('PROCESS_QUERY_FAILED');},opts),{pid:null,unverified:true});
});
test('a clean direct exit waits for confirmed absence before retrying the launch',async()=>{
 const clean={code:0,signal:null};
 const options={exit:()=>clean,stableSamples:2,sleep:async()=>{}};
 const samples=[[],[{pid:42,visible:true}],[{pid:42,visible:true}]];
 assert.deepEqual(await waitForVisibleGame(async()=>samples.shift(),options),{pid:42});
 let count=0,ended=null;
 await assert.rejects(waitForVisibleGame(async()=>{
  count++;
  if(count===1)ended=clean;
  if(count===3)throw Error('temporary query failure');
  return [];
 },{...options,exit:()=>ended}),e=>e.message==='GAME_PROCESS_EXITED'&&Number.isFinite(e.absenceStartedAt));
 assert.equal(count,5);
 count=0;
 await assert.rejects(waitForVisibleGame(async()=>{count++;return [];},{...options,exit:()=>({code:1})}),/GAME_PROCESS_EXITED/);
 assert.equal(count,1);
});
