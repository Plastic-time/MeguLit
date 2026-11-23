'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
test('unverified identity and interrupted repair have localized launch errors without retrying restore',async()=>{
 const F=await import(pathToFileURL(path.join(__dirname,'../web/launch-feedback.js')).href);
 for(const code of ['JAPANESE_REPAIR_BLOCKED','JAPANESE_RESTORE_IDENTITY_UNVERIFIED']){
  const error=Object.assign(Error(code),{detail:'PRIVATE_LOCAL_PATH'});assert.equal(F.launchRestorable(error),false);
  for(const lang of ['zh','ja','en']){const message=F.launchReason(error,lang);assert(message.length>20);assert(!message.includes(code));assert(!message.includes(error.detail));}
 }
 assert.match(F.launchReason('JAPANESE_REPAIR_BLOCKED','zh'),/暂停启动.*保留备份/);
 assert.match(F.launchReason('JAPANESE_RESTORE_IDENTITY_UNVERIFIED','zh'),/停止修改.*可读取/);
});
