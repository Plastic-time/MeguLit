'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {RuntimePacks}=require('../core/runtime-packs.cjs');
test('ensure() gives up after its own download fails instead of restarting it every 300 ms',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-ensure-'));fs.mkdirSync(path.join(root,'setup'));
 fs.writeFileSync(path.join(root,'setup','runtime.json'),JSON.stringify({packs:{archives:{size:1,onDemand:true,dest:'runtime/garbro'}}}));
 const packs=new RuntimePacks(root);let tries=0;packs.install=async()=>{tries++;throw Error('offline');};
 await assert.rejects(packs.ensure('archives',{timeout:5000}),/offline/);assert.equal(tries,1);
 fs.rmSync(root,{recursive:true,force:true});
});
