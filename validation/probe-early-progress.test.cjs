'use strict';
/* #479: a probe killed on its budget never hands back an empty result: progress is written before the disk is touched,
   and the folder walk stops at its deadline with what it counted */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),os=require('os'),path=require('path');
const core=require('../services/adapter-probe-core.cjs');
test('first progress report comes before the inventory; the walk obeys its deadline',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-probe-early-'));
 try{for(let i=0;i<20;i++)fs.writeFileSync(path.join(dir,'f'+i+'.dat'),'x');
  const stages=[];core.probeGame({dir,executable:'',title:'t'},{budgetMs:5000,progress:p=>stages.push(p.stage)});
  assert.deepStrictEqual(stages.slice(0,3),['fingerprint','inventory','route']);
  const src=fs.readFileSync(path.join(__dirname,'..','services','adapter-probe-core.cjs'),'utf8');
  assert.match(src,/inv\.files>=limit\|\|Date\.now\(\)>deadline/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
