// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner, Fata 02:45Z, hook-events.log): "chain deepseek 3683 ms failed API 账户余额不足" on 50 lines before microsoft
   answered, the reader two or three lines behind. A provider failing on its account (balance, quota, key) is left out for
   PAUSE_MS; a plain failure (timeout, superseded) is not; when every provider is paused they are all tried again. */
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../services/translation-chain.cjs');
test('account error: the provider is skipped for the next lines, others answer at once',async()=>{
 C.paused.clear();const tried=[],traces=[];
 const attempt=async o=>{tried.push(o.provider);if(o.provider==='deepseek')throw Error('API 账户余额不足，请检查所选服务的账户余额');return 'ok '+o.provider;};
 const list=[{provider:'deepseek'},{provider:'microsoft'}];
 assert.equal((await C.translate('一',list,attempt)).provider,'microsoft');
 assert.equal((await C.translate('二',list,attempt,{trace:t=>traces.push(t)})).provider,'microsoft');
 assert.deepEqual(tried,['deepseek','microsoft','microsoft'],'deepseek not asked again');assert.ok(traces.some(t=>/skipped deepseek/.test(t)));
 C.paused.set('deepseek',Date.now()-1);tried.length=0;await C.translate('三',list,attempt);assert.deepEqual(tried,['deepseek','microsoft'],'tried again after the pause');
});
test('a plain failure does not pause; all paused means all tried',async()=>{
 C.paused.clear();const tried=[];const list=[{provider:'deepseek'},{provider:'microsoft'}];
 const attempt=async o=>{tried.push(o.provider);if(o.provider==='deepseek')throw Error('Superseded sentence');return 'x';};
 await C.translate('一',list,attempt);await C.translate('二',list,attempt);assert.deepEqual(tried,['deepseek','microsoft','deepseek','microsoft']);
 C.paused.set('deepseek',Date.now()+1e6);C.paused.set('microsoft',Date.now()+1e6);tried.length=0;await C.translate('三',list,attempt);assert.deepEqual(tried,['deepseek','microsoft']);C.paused.clear();
});
