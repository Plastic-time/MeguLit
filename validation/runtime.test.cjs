// SPDX-License-Identifier: GPL-3.0-or-later
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process'),readline=require('node:readline');
const {openStore}=require('../services/store.cjs');
test('persistent service correlates parallel requests, survives errors, and exits on owner shutdown',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'tome-runtime-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));openStore(root).close();
 const child=spawn(process.execPath,[path.resolve(__dirname,'../services/server.cjs')],{env:{...process.env,TOME_FINAL_ROOT:root},windowsHide:true,stdio:['pipe','pipe','pipe']});t.after(()=>{if(child.exitCode===null)child.kill();});
 const pending=new Map();let id=0;const lines=readline.createInterface({input:child.stdout});lines.on('line',line=>{const message=JSON.parse(line);pending.get(message.id)?.(message);pending.delete(message.id);});
 const request=(action,values={})=>new Promise((resolve,reject)=>{const serial=++id,timer=setTimeout(()=>{pending.delete(serial);reject(Error('service timeout'));},10000);pending.set(serial,result=>{clearTimeout(timer);resolve(result);});child.stdin.write(JSON.stringify({id:serial,request:{action,...values}})+'\n');});
 const replies=await Promise.all([request('settings_get'),request('home'),request('model_status'),request('unknown')]);assert.equal(replies[0].ok,true);assert.equal(replies[1].data.games.length,0);assert.ok(replies[2].data.models.length>0);assert.equal(replies[3].error,'UNKNOWN_ACTION');
 assert.equal((await request('settings_save',{scope:'text',values:{japaneseSize:40}})).ok,true);assert.equal((await request('settings_get')).data.values.text.japaneseSize,40);
 assert.equal((await request('__shutdown')).data.stopped,true);await new Promise(resolve=>child.once('exit',resolve));assert.equal(child.exitCode,0);
});
