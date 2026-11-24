// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {runRenpySelfTest}=require('./helpers/renpy-selftest.cjs');
test('actual RenPy script controls, restoration, widget identity and preinjection menu alias',()=>{
 const parent=path.resolve(process.env.MEGULIT_TEST_TMP||os.tmpdir());
 const dir=fs.mkdtempSync(path.join(parent,'megulit-renpy-control-'));
 try{
  const got=runRenpySelfTest('control.py',[path.join(dir,'ctl.txt')],128*1024);
  assert.equal(got.checks,24);assert.ok(got.results.every(x=>x.pass));
 }finally{if(path.dirname(dir)!==parent)throw new Error('test directory escaped');fs.rmSync(dir,{recursive:true,force:true});}
});
