'use strict';
/* P0 2026-11-21: an installed pack whose pack.json contract is below what the manifest entry asks for is not installed, so the
   fixed runtime-dump pack replaces the 2026-11-13 one once it is published; without a contract in the manifest nothing changes */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),os=require('os'),path=require('path');
const {RuntimePacks,packContract}=require('../core/runtime-packs.cjs');
function root(contractInManifest,installedContract){
 const r=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-pack-contract-'));const dest=path.join(r,'runtime','runtime-dump');fs.mkdirSync(dest,{recursive:true});fs.mkdirSync(path.join(r,'setup'));
 const entry={size:1,unpacked:1,sha256:'00',onDemand:true,hidden:true,dest:'runtime/runtime-dump',files:['MeguLitDump32.dll','MeguLitDump64.dll','pack.json'],urls:['x']};if(contractInManifest)entry.contract=contractInManifest;
 fs.writeFileSync(path.join(r,'setup','runtime.json'),JSON.stringify({packs:{'runtime-dump':entry}}));
 for(const f of ['MeguLitDump32.dll','MeguLitDump64.dll'])fs.writeFileSync(path.join(dest,f),'x');
 fs.writeFileSync(path.join(dest,'pack.json'),JSON.stringify({pack:'runtime-dump',contract:installedContract}));return r;}
test('pack contract decides installed',()=>{
 const cases=[[3,2,false],[3,3,true],[0,2,true],[3,4,true]];
 for(const [want,have,ok] of cases){const r=root(want,have);try{assert.strictEqual(packContract(path.join(r,'runtime','runtime-dump')),have);assert.strictEqual(new RuntimePacks(r).installed('runtime-dump'),ok,want+'/'+have);}finally{fs.rmSync(r,{recursive:true,force:true});}}
 assert.match(fs.readFileSync(path.join(__dirname,'..','native','runtimedump','pack-manifest.cjs'),'utf8'),/const entry=\{size:\+size,contract:3,/);
});
