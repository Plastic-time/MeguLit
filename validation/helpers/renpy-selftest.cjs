// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');

const native=path.join(__dirname,'../../native');

function runRenpySelfTest(script,args=[],maxBuffer=256*1024){
 const r=spawnSync('python',['-I',path.join(native,'renpytext/selftest',script),path.join(native,'MeguLitRenpy.py'),...args],
  {encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer});
 assert.ifError(r.error);
 assert.equal(r.status,0,[r.stderr,r.stdout].filter(Boolean).join('\n'));
 return JSON.parse(r.stdout);
}

module.exports={runRenpySelfTest};
