// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const cp=require('node:child_process'),{once}=require('node:events');

test('a broken service pipe releases pending callers and stop still ends its child',async t=>{
 const spawn=cp.spawn;let child;
 t.mock.method(cp,'spawn',(file,_args,options)=>{
  assert.equal(options.windowsHide,true);
  child=spawn(file,['-e','process.stdin.resume();setInterval(()=>{},1000)'],{...options,windowsHide:true});
  return child;
 });
 const service=require('./library-views-perf.cjs').startService(__dirname);
 const exited=once(child,'exit');
 t.after(async()=>{child.kill();await exited;});
 const pending=service.call({action:'settings_get'});
 child.stdin.destroy(Error('test pipe closed'));
 await assert.rejects(pending,/test pipe closed/);
 await assert.rejects(service.call({action:'settings_get'}),/test pipe closed/);
 await service.stop();assert.ok(child.killed);
});
