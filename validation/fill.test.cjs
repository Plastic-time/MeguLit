// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert');
const fill=require('../services/original-engines/fill.cjs');
test('fill: a release gap takes the filled line, release lines stay, asset names are not text',()=>{
 const table=fill._entries();table[fill.key('テストの行です')]='测试行';
 const s=fill.scene({name:'a',lines:['いち','テストの行です','ギター.tga','まだない'],zh:['一','','','']});
 assert.deepEqual(s.zh,['一','测试行','','']);
 assert.deepEqual(s.zhSource,['release','filled','asset','']);
 delete table[fill.key('テストの行です')];});
test('fill: the shipped table holds only hashes and Chinese',()=>{
 const t=fill._entries();const keys=Object.keys(t);assert.ok(keys.length>=20);
 for(const k of keys){assert.match(k,/^[0-9a-f]{40}$/);assert.ok(/[一-鿿]|^[^ぁ-ゖ]*$/.test(t[k]));}});
test('fill: scenes without a Chinese column are left alone',()=>{
 const s={name:'b',lines:['あ']};assert.equal(fill.scene(s),s);});
