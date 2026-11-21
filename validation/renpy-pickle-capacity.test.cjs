// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {decode,LIMITS}=require('../services/original-engines/renpy-pickle-bounded.cjs');
function flatList(length){
 const chunks=[Buffer.from([0x80,2,0x5d])];
 for(let remaining=length;remaining>0;remaining-=1000){
  chunks.push(Buffer.from([0x28]),Buffer.alloc(Math.min(1000,remaining),0x4e),Buffer.from([0x65]));
 }
 chunks.push(Buffer.from([0x2e]));return Buffer.concat(chunks);
}
const rejects=(input,code,options)=>assert.throws(()=>decode(input,options),error=>error.code==='RENPY_PICKLE_'+code&&Number.isSafeInteger(error.offset));
test('finite node capacity accepts a graph above the former ceiling with other budgets unchanged',()=>{
 assert.deepEqual(LIMITS,{inputBytes:4<<20,operations:200000,stack:10000,memo:50000,nodes:150000,edges:200000,stringBytes:4<<20,itemBytes:1<<20});
 const input=flatList(120000),result=decode(input);
 assert.equal(result.value.items.length,120000);assert.ok(result.value.items.every(value=>value===null));
 assert.deepEqual(result.counts,{operations:120242,nodes:120121,edges:120000,stringBytes:0});
 assert.equal(result.bytesRead,input.length);
 rejects(input,'BUDGET_NODES',{limits:{nodes:100000}});
});
test('the new node ceiling is inclusive and still cannot be raised by callers',()=>{
 const exact=decode(flatList(149849));
 assert.equal(exact.counts.nodes,150000);assert.equal(exact.value.items.length,149849);
 assert.ok(exact.counts.operations<200000);assert.ok(exact.counts.edges<200000);
 rejects(flatList(149850),'BUDGET_NODES');
 rejects(flatList(1),'LIMITS',{limits:{nodes:150001}});
 rejects(flatList(1),'BUDGET_NODES',{limits:{nodes:2}});
});
