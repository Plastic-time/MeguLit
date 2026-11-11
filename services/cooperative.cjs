// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E459 (user, v1.4.3: 单词 / 句子 / 读过的词 / 学习统计 hung on 「…」): the service answers every page from one Node
   thread, so a long synchronous loop (the grammar report scanned ~20 000 lines for 8 s) held every other request until
   the page gave up. Long loops call `await breathe()`; it lets other requests run whenever the loop has held the thread
   for more than `ms` milliseconds. */
const pause=()=>new Promise(resolve=>setImmediate(resolve));
function breather(ms=12){let since=Date.now();return async()=>{if(Date.now()-since>=ms){await pause();since=Date.now();}};}
module.exports={breather,pause};
