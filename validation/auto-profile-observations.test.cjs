// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {SelfCheck}=require('../core/self-check.cjs'),AP=require('../core/auto-profile.cjs');
const lines=()=>Array.from({length:20},(_,i)=>({kind:'line',seq:i+1,chars:12,at:i*100}));
function measured(){const out=lines();for(let i=0;i<5;i++)out.push({kind:'hide',seq:i+1,visible:false,at:i*100},{kind:'box',x:0,y:10,w:100,h:20,cw:800,ch:600,at:i*100},{kind:'drawn',text:'neutral-line-'+i,top:10,clientY:0,glyph:20,at:i*100});out.push({kind:'pair',paired:6,orphan:0,at:600});return out;}
function score(events){const sc=new SelfCheck({thresholds:{window:100000}});for(const e of events)sc.event(e);return sc.score();}
test('source-only and unmeasured reader output cannot authorize a hide calibration',()=>{
 for(const events of [lines(),lines().flatMap((e,i)=>[{kind:'drawn',text:'neutral-'+i,top:NaN,clientY:NaN,glyph:NaN},e])]){
  const s=score(events),r=AP.calibrate(events);assert.equal(s.pass,true,'no measured failure is distinct from adequate coverage');assert.equal(r.mode,'read');assert.equal(r.settings.hide.textEffectsRead,true);
  for(const k of ['hideVisible','positionPx','pairRate']){assert.equal(s.metrics[k],null);for(const c of r.candidates.filter(c=>c.params.hideMethod==='hide')){assert.equal(c.metrics[k],null);assert.equal(c.pass,false);assert.ok(c.missing.includes(k));}}
  assert.match(r.reason,/观测不足/);assert.match(r.reason,/隐藏检测.*位置测量.*配对测量/);
 }
});
test('each missing sensor independently prevents hiding without replacing null with zero',()=>{
 for(const kind of ['hide','box','pair']){const events=measured().filter(e=>e.kind!==kind),r=AP.calibrate(events);assert.equal(r.mode,'read');const metric={hide:'hideVisible',box:'positionPx',pair:'pairRate'}[kind];assert.ok(r.candidates.filter(c=>c.params.hideMethod==='hide').every(c=>c.metrics[metric]===null&&c.missing.includes(metric)));}
});
test('partial observations below the original sample thresholds are insufficient',()=>{
 const events=lines();for(let i=0;i<4;i++){if(i<3)events.push({kind:'hide',seq:i,visible:false});events.push({kind:'box',y:10},{kind:'drawn',text:'partial-'+i,top:10,clientY:0,glyph:20});}events.push({kind:'pair',paired:5,orphan:0});
 const r=AP.calibrate(events);assert.equal(r.mode,'read');assert.match(r.reason,/观测不足/);assert.ok(r.candidates.filter(c=>c.params.hideMethod==='hide').every(c=>c.missing.length===3));
});
test('sufficient measured positive remains hide and keeps original numeric metrics',()=>{
 const r=AP.calibrate(measured());assert.equal(r.mode,'hide');assert.equal(r.reason,'');assert.deepEqual(r.score.metrics,{hideVisible:0,dropRate:0,repeatRate:0,choiceMismatch:0,positionPx:0,pairRate:1});assert.equal(r.settings.calibrate.positionSource,'engine');assert.ok(r.candidates.some(c=>c.pass&&c.params.hideMethod==='hide'&&c.missing.length===0));
});
for(const [kind,change,reason] of [['hide',e=>({...e,visible:true}),'隐藏后'],['drawn',e=>({...e,top:500}),'位置'],['pair',e=>({...e,paired:0,orphan:6}),'配对率低']])test('measured '+kind+' failure still falls back to read',()=>{const r=AP.calibrate(measured().map(e=>e.kind===kind?change(e):e));assert.equal(r.mode,'read');assert.match(r.reason,new RegExp(reason));assert.ok(r.candidates.filter(c=>c.params.hideMethod==='hide').every(c=>!c.pass&&c.over.length>0));});
test('minimum lines and actual drawing are required, while unencountered choices stay optional',()=>{
 const few=measured().filter(e=>e.kind!=='line'||e.seq<8),notDrawn=measured().filter(e=>e.kind!=='drawn');assert.match(AP.calibrate(few).reason,/正文行数/);assert.match(AP.calibrate(notDrawn).reason,/阅读层绘制/);assert.equal(AP.calibrate(measured()).mode,'hide');
});
test('encountered mismatching choices remain subject to the existing threshold',()=>{
 const r=AP.calibrate([...measured(),{kind:'choice',raw:2,shown:0},{kind:'choice',raw:2,shown:0}]);const kernel=r.candidates.filter(c=>c.params.hideMethod==='hide'&&c.params.filters==='kernel');assert.ok(kernel.every(c=>!c.pass&&c.over.includes('choiceMismatch')));
});
