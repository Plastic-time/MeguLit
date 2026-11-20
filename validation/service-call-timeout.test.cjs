// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startService}=require('./library-views-perf.cjs');

test('the validation service releases deadlines for both successful and rejected replies',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-service-timers-')),service=startService(root);
 const deadlines=new Set(),set=globalThis.setTimeout,clear=globalThis.clearTimeout;
 let expire;
 t.mock.method(globalThis,'setTimeout',(fn,ms,...args)=>{
  const timer=set(fn,ms,...args);if(ms===31001)deadlines.add(timer);
  if(ms===31002)expire=()=>{clear(timer);fn();};return timer;
 });
 t.mock.method(globalThis,'clearTimeout',timer=>{deadlines.delete(timer);clear(timer);});
 try{
  const [success,failure]=await Promise.allSettled([service.call({action:'settings_get'},31001),service.call({action:'unknown_test_request'},31001)]);
  assert.equal(success.status,'fulfilled');assert.equal(failure.status,'rejected');
  assert.equal(deadlines.size,0);
  await assert.rejects(service.call({action:'settings_get',value:1n},31001),TypeError);
  assert.equal(deadlines.size,0);
  const slow=service.call({action:'settings_get'},31002);expire();
  await assert.rejects(slow,/SERVICE_TIMEOUT/);
  await service.call({action:'settings_get'},31001);assert.equal(deadlines.size,0);
 }finally{
  for(const timer of deadlines)clear(timer);
  await service.stop();fs.rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});
 }
});
