'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {check} = require('../tools/cardinal-live-acceptance.cjs');
const report = {challenge:'current', process:{pid:42,birth:'1234'},readerTargetId:'reader-A',domAcks:[{sourceKey:'one',translation:'二'}]};
const sample = {target:'reader-A',pid:'42',birth:'1234',source:'one',translation:'二'};
test('synthetic acceptance witness rejects empty, stale and wrong-page evidence',()=>{
  assert.throws(()=>check(null,'current',[]),/challenge/);
  assert.throws(()=>check({...report,domAcks:[]},'current',[sample]),/empty/);
  assert.throws(()=>check(report,'previous',[sample]),/challenge/);
  assert.throws(()=>check(report,'current',[{...sample,target:'reader-B'}]),/Reader/);
  assert.throws(()=>check(report,'current',[{...sample,translation:'三'}]),/Reader/);
  assert.throws(()=>check(report,'current',[{...sample,birth:'555'}]),/Reader/);
  check(report,'current',[sample]);
});

const {exercise} = require('../tools/cardinal-scheduler-acceptance.cjs');
test('disposable scheduler driver exercises lease and scan failures using a synthetic clock',async()=>{
  let time=1000000, end=0, generation=0;
  const expired={field:'error',value:'LEASE_LOST',status:409};
  const virus={field:'error',value:'TORCH_MALWARE_INFECTED',status:422};
  const config={jobId:'j',expired,unready:virus,unpublished:virus,release:{x:1,signature:{}}};
  const deny=e=>({ok:false,status:e.status,body:{error:e.value}});
  async function post(action,data) {
    let body;
    if(action==='claim') {
      if(time>=end) {end=time+300000;generation++;body={job:{id:'j',lease:String(generation),expires:end/1000}};}
      else body={job:null};
    } else if(time>=end || data.lease!==String(generation)) return deny(expired);
    else if(action==='renew'){end=time+300000;body={ok:true};}
    else if(action==='receipt') body={proposal:{x:1}};
    else return deny(virus);
    return {ok:true,status:200,body};
  }
  await exercise(config,post,()=>time,async ms=>{time+=ms;});
  assert.equal(generation,2);
});
