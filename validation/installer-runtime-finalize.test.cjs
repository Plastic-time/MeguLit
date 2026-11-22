'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
test('private installer finalizer verifies overlay, backs up, rejects links and retains failed transactions',{timeout:30000},()=>{
 const repo=path.resolve(__dirname,'..'),base=process.env.MEGULIT_FINALIZE_TEST_TEMP||os.tmpdir();fs.mkdirSync(base,{recursive:true});const work=fs.mkdtempSync(path.join(base,'installer-finalize-'));
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'helpers/installer-runtime-finalize/driver.ps1'),'-Repo',repo,'-Work',work],{encoding:'utf8',windowsHide:true,timeout:25000,maxBuffer:1024*1024});
 assert.equal(result.status,0,result.stderr+result.stdout);const data=JSON.parse(result.stdout.trim());assert.equal(data.checks,25);assert.equal(data.proofs.length,25);assert.equal(data.realPayloadTouched,false);assert.equal(data.appStarted,false);console.log(JSON.stringify({work,checks:data.checks,scope:'neutral file fixtures, production helper functions'}));
});
