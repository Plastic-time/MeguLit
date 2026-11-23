// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const ROOT=require('node:path').resolve(__dirname,'..');
const {HookNative}=require(ROOT+'/core/hook-native.cjs'),{UnityTextPath}=require(ROOT+'/core/text-paths-unity.cjs'),{attach}=require(ROOT+'/core/text-paths-launch.cjs'),{PREFIX,SHA}=require(ROOT+'/core/unity-kemco-source.cjs');
const owner={pid:42,started:'638000000000000000'};
test('private observer source cannot enter an unowned OCR held queue or publish after explicit off',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let clock=1000;const out=[];
 const h=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},m=>out.push(m),()=>{},()=>clock);h.trace=()=>{};h.target={...owner};
 const p=new UnityTextPath();p.kemco.now=()=>clock;attach({path:'unity',session:p},h);p.drawConfig({kemcoSprites:true});
 try{
  const m={engine:'ocr',line:1,phase:'begin',same:false,nvl:true,x0:0,y0:0,x1:100,y1:30,size:20,sw:100,sh:100,count:0,text:''};h.pageLine(m);h.pageLine({...m,phase:'end'});
  const full='保留された観測本文です。';p.line(PREFIX+[p.kemco.scope,1,1,'full',SHA,owner.pid,owner.started,Buffer.from(full).toString('base64')].join('\t'));
  assert.equal(p.kemco.current,null,'source not ACKed synchronously');assert.equal(h.pageState.held.length,0);assert.equal(h.state.hookSource,undefined);
  p.drawConfig({kemcoSprites:false});clock+=5001;t.mock.timers.tick(5001);
  const evidence={source:h.state.hookSource,origin:h.state.hookSourceOrigin,permission:p.kemco.enabled,lease:p.kemco.current};assert.equal(evidence.source,undefined);assert.equal(evidence.permission,false);
 }finally{await p.stop();await h.stop();}
});
