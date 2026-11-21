// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
test('a cold shutdown failure has an actionable localized launch reason and cannot suggest a Japanese restore',async()=>{
 const {launchReason,launchShort,launchRestorable}=await import(pathToFileURL(path.join(__dirname,'../web/launch-feedback.js')).href);
 for(const code of ['COLD_STOP_TIMEOUT','COLD_CLEANUP_UNCONFIRMED']){
  const error=Error(code);assert.equal(launchRestorable(error),false);
  for(const locale of ['zh','en','ja']){const full=launchReason(error,locale);assert.ok(full.length>20);assert.ok(!full.includes(code));assert.equal(launchReason(code,locale),full);assert.ok(launchShort(error,locale).length>0);}
 }
 assert.match(launchReason('COLD_STOP_TIMEOUT','zh'),/尚未启动.*稍后重试/);
 assert.match(launchReason('COLD_CLEANUP_UNCONFIRMED','zh'),/无法确认.*保留存档备份.*上传问题反馈/);
});
