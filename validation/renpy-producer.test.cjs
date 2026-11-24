// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {runRenpySelfTest}=require('./helpers/renpy-selftest.cjs');
test('RenPy producer binds native ruby by glyph identity, preserves codepoint offsets and emits bounded UTF16 wire',()=>{
 const got=runRenpySelfTest('producer.py');
 const expected=[
  ['漢字。',[[0,2,'かんじ']]],['漢字',[[0,1,'かん'],[1,1,'じ']]],['漢字',[[0,2,'かんじ']]],
  ['漢字 漢字',[[3,2,'べつ']]],['😀 漢\x1f漢字',[[3,2,'よみ']]],['漢',[[0,1,'𠮷']]],
  ['漢字',[[0,1,'かん'],[1,1,'じ']]],['本',[]],['漢',[]],['漢字',[[1,1,'じ']]],
  ['漢',[]],['漢',[]],['漢',[]],['漢',[]],['漢'.repeat(81),[]],['漢',[]],['漢',[]],['漢',[]],['漢',[]],['本文',[]],
 ];
 assert.equal(got.cases.length,expected.length);
 for(const [index,item] of got.cases.entries()){
  const match=/ n=(\d+) rects=([^ ]*)(?: emb=([12]))?(?: ruby=([^ ]+))? text=(.*)$/.exec(item.wire);
  assert.ok(match,item.name);const [body,spans]=expected[index];
  assert.equal(match[5],body,item.name);assert.equal(Number(match[1]),[...body.replace(/\x1f/g,'')].length,item.name);
  assert.equal(match[2].split(';').filter(Boolean).length,Number(match[1]),item.name);
  const ruby=match[4]?match[4].split('|').map(token=>{const [start,length,hex]=token.split(':');assert.match(hex,/^(?:[0-9a-f]{4})+$/);const bytes=Buffer.from(hex,'hex');bytes.swap16();return [Number(start),Number(length),bytes.toString('utf16le')];}):[];
  assert.deepEqual(ruby,spans,item.name);
 }
 assert.ok(Object.values(got.limits).every(Boolean),JSON.stringify(got.limits));
 assert.deepEqual(got.embed.native,[[0,2,'かんじ']]);assert.ok(got.embed.text.includes('{rt}べつ{/rt}'));
 assert.match(got.embed.wire,/ emb=1 ruby=0:2:304b30933058 text=漢字$/,'native reading follows emb and precedes text; injected reading stays separate');
 assert.ok(!got.cases.at(-1).wire.includes(' ruby='),'plain records keep their original field grammar');
});
