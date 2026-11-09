'use strict';
// User report (2026-11-09): the Sudachi worker died on start and every lookup said "reinstall in settings" without
// saying where. A worker that fails to start is repaired once automatically; if it still fails, the message names
// the exact place (Alt+T → 设置 → 词典 → 修复 / 重新下载) and carries the worker's own error line.
const test=require('node:test'),assert=require('node:assert/strict');
const {LocalLearning}=require('../core/learning-native.cjs');

function rig(starts){
 const l=Object.create(LocalLearning.prototype);
 Object.assign(l,{pending:new Map(),cache:new Map(),onStatus:()=>{},closed:false,installing:null});
 const log={installs:[],spawns:0};
 l.installed=()=>true;l.install=async(retry,force)=>{log.installs.push([retry,force]);};
 l.spawnWorker=async function(){const ok=starts[log.spawns++];this.worker=ok?{}:null;if(!ok)throw Error('ModuleNotFoundError: No module named sudachipy');};
 return {l,log};
}

test('a worker that fails to start is repaired once and started again',async()=>{
 const {l,log}=rig([false,true]);
 await l.ready();
 assert.deepEqual(log.installs,[[true,true]]);assert.equal(log.spawns,2);
});

test('when repair does not help, the error says exactly where to repair and why',async()=>{
 const {l,log}=rig([false,false]);
 await assert.rejects(l.ready(),e=>/Alt\+T → 设置 → 词典 → 「修复 \/ 重新下载」/.test(e.message)&&/sudachipy/.test(e.message));
 assert.equal(log.installs.length,1);
 /* no endless repair loop on the next lookup */
 await assert.rejects(l.ready(),/Alt\+T/);assert.equal(log.installs.length,1);
});
