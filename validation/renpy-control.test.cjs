// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
test('actual RenPy script controls, restoration, widget identity and preinjection menu alias',()=>{
 const parent=path.resolve(process.env.MEGULIT_TEST_TMP||os.tmpdir());
 const dir=fs.mkdtempSync(path.join(parent,'megulit-renpy-control-'));
 try{
  const r=spawnSync('python',['-I',path.join(__dirname,'../native/renpytext/selftest/control.py'),path.join(__dirname,'../native/MeguLitRenpy.py'),path.join(dir,'ctl.txt')],{encoding:'utf8',windowsHide:true,timeout:5000,maxBuffer:128*1024});
  assert.equal(r.status,0,r.stderr+'\n'+r.stdout);
  const got=JSON.parse(r.stdout);assert.equal(got.checks,24);assert.ok(got.results.every(x=>x.pass));
 }finally{if(path.dirname(dir)!==parent)throw new Error('test directory escaped');fs.rmSync(dir,{recursive:true,force:true});}
});
