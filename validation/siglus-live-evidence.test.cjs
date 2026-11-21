/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {inspect}=require('../tools/engine-sigs/siglus-live-evidence.cjs');
const template=require('./fixtures/siglus-live-evidence.template.json');
/* Neutral data for the inventory checker; these are never game evidence */
const bytes=Buffer.from('synthetic inventory integrity test'),digest=crypto.createHash('sha256').update(bytes).digest('hex');
function filled(){
 const m=structuredClone(template);m.captureKind='real-game';m.build={commit:'a'.repeat(40),hook32Sha256:'b'.repeat(64),meguLitSha256:'c'.repeat(64)};m.slot={number:2,allocatedByRoot:true};
 m.artifacts.test={path:'synthetic.txt',sha256:digest};
 for(const key of Object.keys(m.roles))m.roles[key]='test';for(const key of Object.keys(m.checks))m.checks[key]='test';
 m.lines=Array.from({length:10},(_,i)=>({japanese:'テスト台詞'+i,sourceId:'source'+i,hidden:'test',dom:'test',lookup:'test',translationAck:'test',advanced:'test'}));return m;
}
test('pending shipped template cannot claim live acceptance',()=>{
 const result=inspect(template);assert.equal(result.readyForHumanReview,false);assert.equal(result.liveAccepted,false);
 assert.ok(result.missing.some(s=>s.includes('root-allocated')));assert.ok(result.missing.some(s=>s.includes('10 unique')));
});
test('complete synthetic inventory only validates checker structure, never live acceptance',()=>{
 const result=inspect(filled(),()=>bytes);assert.equal(result.readyForHumanReview,true);assert.equal(result.liveAccepted,false);
});
test('replay/static provenance and unpinned executables cannot qualify',()=>{
 for(const kind of ['replay','static-file-audit','pending']){const m=filled();m.captureKind=kind;assert.equal(inspect(m,()=>bytes).readyForHumanReview,false);}
 const m=filled();m.exeSha256='d'.repeat(64);assert.equal(inspect(m,()=>bytes).readyForHumanReview,false);
 const inherited=filled();inherited.game='__proto__';delete inherited.exeSha256;assert.equal(inspect(inherited,()=>bytes).readyForHumanReview,false);
});
test('duplicate/short/non-Japanese runs cannot satisfy ten-line requirement',()=>{
 for(const change of [m=>m.lines.pop(),m=>m.lines[9].japanese=m.lines[0].japanese,m=>m.lines[9].japanese='translated English']){
  const m=filled();change(m);assert.equal(inspect(m,()=>bytes).readyForHumanReview,false);
 }
});
test('missing lookup, render ACK, choice, cleanup or actual artifact fails inventory',()=>{
 for(const change of [m=>m.lines[3].translationAck=null,m=>m.lines[2].lookup=null,m=>m.roles.choice=null,m=>m.checks.processClosed=null,m=>m.artifacts.test.sha256='f'.repeat(64)]){
  const m=filled();change(m);assert.equal(inspect(m,()=>bytes).readyForHumanReview,false);
 }
 assert.equal(inspect(filled(),()=>{throw Error('missing file');}).readyForHumanReview,false);
});
