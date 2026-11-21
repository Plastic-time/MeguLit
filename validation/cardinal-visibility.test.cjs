// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../core/cardinal/score.cjs'),D=require('../core/profiles/defaults.cjs');
const fixture=require('./fixtures/cardinal/fata-live-visibility-20261121.json');

test('real faulty DOM: blanking all Japanese cannot remove the penalty and raise its score',()=>{
 const observed=S.score(fixture.run,D.cardinal);
 assert.equal(observed.lines,3);
 assert.ok(observed.scores.row<1,'the actual baseline still fails rows after episode isolation');
 assert.equal(observed.scores.leak,0,'the actual baseline already entered read mode');
 assert.ok(fixture.beforeFix.blank.total>fixture.beforeFix.baseline.total,'recorded pre-fix regression');
 for(const clearCn of [false,true])for(const clearHits of [false,true]){
  const bad=structuredClone(fixture.run);
  for(const s of bad.o.samples){s.glyphs=[];if(clearCn)s.cn=[];if(clearHits)s.hitRegions=[];}
  const score=S.score(bad,D.cardinal);
  assert.equal(score.detail.visibility.shown,0);
  assert.ok(score.detail.visibility.expected>0);
  assert.equal(score.scores.clean,0);
  assert.equal(score.total,0,'no visible Japanese is no successful text output');
  assert.ok(score.total<observed.total);
 }
});

test('missing actual translation evidence still lowers the real observed score',()=>{
 const observed=S.score(fixture.run,D.cardinal),bad=structuredClone(fixture.run);
 bad.livePairing.paired=0;
 for(const s of bad.o.samples)s.cn=[];
 const result=S.score(bad,D.cardinal);
 assert.equal(result.scores.pair,0);
 assert.ok(result.total<observed.total);
});

test('combining empty-output runs cannot restore a passing total from unobserved metrics',()=>{
 const empty=structuredClone(fixture.run);
 for(const s of empty.o.samples)s.glyphs=[];
 const result=S.score(empty,D.cardinal);
 assert.equal(S.combine([result,result],D.cardinal).total,0);
 const observed=S.score(fixture.run,D.cardinal),combined=S.combine([observed,result],D.cardinal);
 assert.ok(combined.total<=observed.total);
});
