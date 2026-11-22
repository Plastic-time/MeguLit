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

test('legacy calibration-hide admission uses existing metric evidence and preserves other sources',()=>{
 const valid={source:'calibration',mode:'hide',score:{lines:20,metrics:{hideVisible:0,positionPx:0,pairRate:1,repeatRate:0}}};
 assert.equal(AP.calibrationAdmission(valid).eligible,true,'no new fields or sample counts required');
 for(const field of ['hideVisible','positionPx','pairRate','repeatRate']){const r=JSON.parse(JSON.stringify(valid));r.score.metrics[field]=null;assert.equal(AP.calibrationAdmission(r).eligible,false);}
 for(const lines of [0,7,null,'20'])assert.equal(AP.calibrationAdmission({...valid,score:{...valid.score,lines}}).eligible,false);
 assert.equal(AP.calibrationAdmission(valid,{thresholds:{minLines:21}}).eligible,false);
 for(const [source,mode] of [['manual','hide'],['gate','hide'],['calibration','read'],['cold','hide']])assert.equal(AP.calibrationAdmission({source,mode}).eligible,true);
});

test('actual local load/choose/inputOf/profileFor ignore unmeasured hide without modifying the file',()=>{
 const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module'),P=require('../core/profiles/index.cjs');
 const root=fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||require('node:os').tmpdir(),'observation-admission-')),key='a'.repeat(64),exe=path.join(root,'neutral.exe');
 const full=require.resolve('../services/self-check-live.cjs'),m=new Module(full,module);m.filename=full;m.paths=Module._nodeModulePaths(path.dirname(full));const real=m.require.bind(m),logs=[];
 const overrides={'./auto-profile-feed.cjs':{forExe:()=>null,cached:()=>null,layer:()=>null,rejected:()=>false},'./runtime-sample.cjs':{enabled:()=>false,RuntimeSample:class{}},'./hook-verdict.cjs':{appVersion:()=> 'neutral'}};m.require=id=>Object.hasOwn(overrides,id)?overrides[id]:real(id);m._compile(fs.readFileSync(full,'utf8'),full);const live=m.exports;
 const reader={root,gal:{hooks:{trace:t=>logs.push(t)},textEffects:()=>null},logVisibility:()=>null},input={exe,engine:'unknown'},profile={engine:'unknown',seedStatus:'skeleton',selfCheck:{}};
 const valid={schema:1,key,source:'calibration',mode:'hide',settings:{calibrate:{hideMethod:'hide'},hide:{textEffectsRead:false}},score:{lines:20,metrics:{hideVisible:0,positionPx:0,pairRate:1,repeatRate:0}}};
 const digest=()=>crypto.createHash('sha256').update(fs.readFileSync(path.join(AP.dir(root),key+'.json'))).digest('hex');
 try{
  for(const patch of [{metrics:{}},{metrics:{...valid.score.metrics,positionPx:null}},{metrics:{...valid.score.metrics,repeatRate:null}},{lines:7}]){
   const raw={...valid,score:{...valid.score,...patch}};AP.store(root,key,raw);const before=digest(),s=live.start(reader,exe,profile,input,{key,skipFeed:true});
   assert.equal(s.stored,null);assert.equal(s.calibrated,false);assert.ok(s.check.recording);assert.ok(s.calibrationPending.length);assert.equal(live.choose(s),null);assert.equal(live.inputOf(s).auto,undefined);assert.equal(P.profileFor(live.inputOf(s)).calibrate.hideMethod,null);
   const injected={...s,stored:raw};assert.equal(live.choose(injected),null);assert.equal(live.inputOf(injected).auto,undefined);
   assert.equal(live.choose({...injected,profile:{...profile,seedStatus:'verified'}}).from,'seed');
   live.stop();assert.equal(digest(),before,'admission and stop do not write/delete the old file');
  }
  assert.ok(logs.some(x=>x.includes('calibration pending')&&x.includes('positionPx')));
  AP.store(root,key,valid);let s=live.start(reader,exe,profile,input,{key,skipFeed:true});assert.equal(live.choose(s).mode,'hide');assert.equal(P.profileFor(live.inputOf(s)).calibrate.hideMethod,'hide');live.stop();
  for(const [source,mode] of [['manual','hide'],['gate','read'],['calibration','read']]){AP.store(root,key,{...valid,source,mode,score:{},settings:{calibrate:{hideMethod:mode},hide:{textEffectsRead:mode==='read'}}});s=live.start(reader,exe,profile,input,{key,skipFeed:true});assert.equal(live.choose(s).mode,mode);assert.equal(live.choose(s).from,source==='gate'?'local-gate':'local');assert.equal(P.profileFor(live.inputOf(s)).calibrate.hideMethod,mode);live.stop();}
 }finally{live.stop();fs.rmSync(root,{recursive:true,force:true});}
});
