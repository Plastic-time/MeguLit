'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const probe=require('../services/adapter-probe.cjs'),core=require('../services/adapter-probe-core.cjs'),sample=require('../services/adapter-sample.cjs');

function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-os-folder-')),system=path.join(root,'OS');
 const old=process.env.SystemRoot;process.env.SystemRoot=system;
 t.after(()=>{if(old===undefined)delete process.env.SystemRoot;else process.env.SystemRoot=old;fs.rmSync(root,{recursive:true,force:true});});
 fs.mkdirSync(system);fs.writeFileSync(path.join(system,'shell.exe'),'fixture');
 fs.mkdirSync(path.join(system,'AppPatch'));fs.writeFileSync(path.join(system,'AppPatch','sysmain.sdb'),'fixture');
 return {root,system};
}

test('a saved probe job skips the Windows folder before fingerprinting or scanning it',t=>{
 const {system}=fixture(t),seen=[];
 const result=core.probeGame({dir:system,executable:path.join(system,'shell.exe')},{progress:step=>seen.push(step)});
 assert.equal(result.step,'no-script');assert.equal(result.detail,'WINDOWS_DIRECTORY');
 assert.equal(result.inventory.files,0);assert.deepEqual(result.inventory.archives,[]);
 assert.equal(result.fingerprint,null);assert.deepEqual(seen,[]);
 assert.equal(core.probeGame({dir:path.toNamespacedPath(system)}).detail,'WINDOWS_DIRECTORY');
});

test('selection and sample preparation ignore a Windows entry with an older failed probe',async t=>{
 const {root,system}=fixture(t);
 const games=[system,path.join(root,'Games','OS'),path.join(root,'OS Games'),path.join(system,'Games','Classic')].map((dir,i)=>({id:String(i),title:'Test',executable:path.join(dir,'shell.exe')}));
 const db={prepare:()=>({all:()=>games})};
 assert.deepEqual(probe.libraryGames(db).map(g=>g.id),['1','2','3']);
 const state=probe.fileOf(root);fs.mkdirSync(path.dirname(state),{recursive:true});
 fs.writeFileSync(state,JSON.stringify({results:{0:{step:'parse-failed',engines:[]}}}));
 let calls=0;
 assert.deepEqual(await sample.prepare(root,db,{ids:['0'],sampler:()=>{calls++;}}),{empty:true});
 assert.equal(calls,0);
 const onlySystem={prepare:()=>({all:()=>games.slice(0,1)})};
 const status=probe.start(root,onlySystem,{force:true});
 assert.equal(status.total,0);assert.deepEqual(probe.problems(root),[]);
});
