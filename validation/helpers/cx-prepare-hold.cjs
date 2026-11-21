// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {isMainThread,workerData,threadId}=require('node:worker_threads');

// Keep the production Worker entry and parser; pause only after prepare wrote its own result.
if(!isMainThread&&workerData?.prepare&&process.env.MEGULIT_CX_PROCESS_TEST){
 const fs=require('node:fs'),path=require('node:path'),{performance}=require('node:perf_hooks');
 const write=fs.writeFileSync,root=process.env.MEGULIT_CX_PROCESS_TEST;
 fs.writeFileSync=function(file,...args){
  const result=write.call(this,file,...args);
  if(file!==workerData.attempt)return result;
  const report={pid:process.pid,threadId,attempt:file,stack:new Error().stack};
  write(path.join(root,'worker-ready.json'),JSON.stringify(report));
  const started=performance.now(),wait=new Int32Array(new SharedArrayBuffer(4));let ticks=0;
  while(!fs.existsSync(path.join(root,'release'))){
   write(path.join(root,'heartbeat'),String(++ticks));
   if(performance.now()-started>10000)throw Error('CX_TEST_RELEASE_TIMEOUT');
   Atomics.wait(wait,0,0,20);
  }
  write(path.join(root,'after-release'),String(threadId));
  return result;
 };
}
