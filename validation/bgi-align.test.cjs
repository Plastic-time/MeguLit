// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// 穢翼のユースティア: the Chinese build differs from the Japanese backup by a few lines in some scenes.
const test=require('node:test'),assert=require('node:assert'),bgi=require('../services/original-engines/bgi.cjs');
test('scenes with the same count map 1:1, others line up on shared operands',()=>{
 const run=[{name:'a',lines:['v01','你好','v02','再见']},{name:'b',lines:['v10','一','新增','v11','二']}];
 const jp=[{name:'A',lines:['v01','こんにちは','v02','さよなら']},{name:'b',lines:['v10','いち','v11','に']}];
 assert.deepEqual(bgi.alignLines(run,jp),['v01','こんにちは','v02','さよなら','v10','','','v11','に']);
});
