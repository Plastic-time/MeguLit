const test=require('node:test'),assert=require('node:assert/strict');
const {waitForVisibleGame}=require('../services/game-readiness.cjs');
test('a startup splash that disappears is not reported as a ready game',async()=>{let i=0;await assert.rejects(waitForVisibleGame(async()=>++i<3?[{pid:1,visible:true}]:[],{attempts:8,sleep:async()=>{}}),/GAME_PROCESS_EXITED/);});
test('window readiness requires consecutive visible samples from the same process',async()=>{const samples=[[{pid:1,visible:true}],[{pid:2,visible:true}],[{pid:2,visible:false}],...[1,2,3,4].map(()=>[{pid:3,visible:true}])];let i=0;assert.deepEqual(await waitForVisibleGame(async()=>samples[i++],{sleep:async()=>{}}),{pid:3});assert.equal(i,7);});
test('a running process without a window leaves the home available',async()=>{await assert.rejects(waitForVisibleGame(async()=>[{pid:1,visible:false}],{attempts:2,sleep:async()=>{}}),/GAME_WINDOW_NOT_READY/);});
test('v1.1.0: failed process queries do not fail a launch',async()=>{
 const opts={attempts:5,interval:1,sleep:async()=>{}};let n=0;
 /* a few failures, then the window shows */
 assert.deepEqual(await waitForVisibleGame(async()=>{if(n++<2)throw Error('PROCESS_QUERY_FAILED');return [{pid:7,visible:true}];},{...opts,stableSamples:2}),{pid:7});
 /* never answered: launched but unverified */
 assert.deepEqual(await waitForVisibleGame(async()=>{throw Error('PROCESS_QUERY_FAILED');},opts),{pid:null,unverified:true});
});
