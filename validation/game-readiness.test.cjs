const test=require('node:test'),assert=require('node:assert/strict');
const {waitForVisibleGame}=require('../services/game-readiness.cjs');
test('a startup splash that disappears is not reported as a ready game',async()=>{let i=0;await assert.rejects(waitForVisibleGame(async()=>++i<3?[{pid:1,visible:true}]:[],{attempts:8,sleep:async()=>{}}),/GAME_PROCESS_EXITED/);});
test('window readiness requires consecutive visible samples from the same process',async()=>{const samples=[[{pid:1,visible:true}],[{pid:2,visible:true}],[{pid:2,visible:false}],...[1,2,3,4].map(()=>[{pid:3,visible:true}])];let i=0;assert.deepEqual(await waitForVisibleGame(async()=>samples[i++],{sleep:async()=>{}}),{pid:3});assert.equal(i,7);});
test('a running process without a window leaves the home available',async()=>{await assert.rejects(waitForVisibleGame(async()=>[{pid:1,visible:false}],{attempts:2,sleep:async()=>{}}),/GAME_WINDOW_NOT_READY/);});
test('a clean startup handoff gets a short wait for the replacement game window',async t=>{
 t.mock.timers.enable({apis:['Date']});
 const exit=()=>({code:0,signal:null}),trace=[],samples=[[],[],[{pid:42,visible:true}],[{pid:42,visible:true}]];
 const sleep=async ms=>t.mock.timers.tick(ms);
 const state=await waitForVisibleGame(async()=>samples.shift(),{exit,stableSamples:2,trace:stage=>trace.push(stage),sleep});
 assert.deepEqual(state,{pid:42});
 assert.deepEqual(trace,['game-process-exited','game-process-seen']);
 assert.equal(samples.length,0);
});
test('a clean exit without a replacement still fails promptly, and crashes still fail immediately',async t=>{
 t.mock.timers.enable({apis:['Date']});
 let waits=0;
 const sleep=async ms=>{waits++;t.mock.timers.tick(ms);};
 const exitedAt=Date.now();
 await assert.rejects(waitForVisibleGame(async()=>[],{exit:()=>({code:0,signal:null}),sleep}),{message:'GAME_PROCESS_EXITED',exitedAt});
 assert.equal(waits,4);
 for(const exit of [()=>({code:1,signal:null}),()=>({code:0,signal:'SIGTERM'}),()=>({code:null,signal:null})]){
  await assert.rejects(waitForVisibleGame(async()=>[],{exit,sleep}),/GAME_PROCESS_EXITED/);
  assert.equal(waits,4);
 }
});
test('a replacement that disappears before showing a window has no clean launcher exit time',async t=>{
 t.mock.timers.enable({apis:['Date']});
 for(const prefix of [[],[[]]]){
  const samples=[...prefix,[{pid:42,visible:false}],[]];
  await assert.rejects(waitForVisibleGame(async()=>samples.shift(),{exit:()=>({code:0,signal:null}),sleep:async ms=>t.mock.timers.tick(ms)}),
   error=>error.message==='GAME_PROCESS_EXITED'&&error.exitedAt===undefined);
  assert.equal(samples.length,0);
 }
});
test('v1.1.0: failed process queries do not fail a launch',async()=>{
 const opts={attempts:5,interval:1,sleep:async()=>{}};let n=0;
 /* a few failures, then the window shows */
 assert.deepEqual(await waitForVisibleGame(async()=>{if(n++<2)throw Error('PROCESS_QUERY_FAILED');return [{pid:7,visible:true}];},{...opts,stableSamples:2}),{pid:7});
 /* never answered: launched but unverified */
 assert.deepEqual(await waitForVisibleGame(async()=>{throw Error('PROCESS_QUERY_FAILED');},opts),{pid:null,unverified:true});
});
