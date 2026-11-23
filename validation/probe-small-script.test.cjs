// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// In-memory neutral data only. No archive files or cleanup are used.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const d=require('../services/desensitize.cjs'),api=require('../services/adapter-sample.cjs');
const MIN=65536,filename=path.resolve(__dirname,'../services/adapter-sample.cjs');
const source=fs.readFileSync(filename,'utf8');
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
function neko(){const show=Buffer.from('5b8365834c83588367955c8ea65d','hex');return Buffer.concat([Buffer.from('NEKOSDK_ADVSCRIPT2'),u32(show.length),show,u32(1),Buffer.from([0]),u32(7),Buffer.from('82b382b582b700','hex')]);}
function entis(){const b=Buffer.alloc(64);b.write('Entis\x1a',0,'latin1');b.write('Cotopha Image file',16);return b;}
function controlled(sampleResult){
 const m=new Module(filename);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));
 m.require=name=>{if(name==='./desensitize.cjs')return {sampleResult,sampleSizes:s=>({packed:s.packed})};if(name.startsWith('node:'))return require(name);throw Error('unexpected dependency');};
 m._compile(source,filename);return m.exports;
}
function fitting(length,packedSizes,{max=length,reason=null}={}){
 const attempts=[],samples=[];
 const stub=controlled((bytes,options)=>{attempts.push({length:bytes.length,max:options.max,compress:options.compress});if(reason)return {sample:null,reason,structure:null};
  const sample={packed:packedSizes[Math.min(samples.length,packedSizes.length-1)]};samples.push(sample);return {sample,reason:null,structure:null};});
 return {result:stub.scriptSampleResult(Buffer.alloc(length),max),attempts,samples};
}

test('positive tiny unrelated inputs are attempted and retain the legacy sample shape',()=>{
 for(const input of [Buffer.from([0]),Buffer.from('neutral\0'),Buffer.alloc(MIN-1)]){
  const out=api.scriptSampleResult(input);assert.ok(out.sample);assert.equal(out.reason,null);assert.equal(out.structure,null);
  assert.deepEqual(out,d.sampleResult(input,{max:input.length,compress:true}));assert.deepEqual(api.scriptSample(input),out.sample);
  const bytes=d.partBytes(out.sample.parts[0]);assert.equal(d.verify(input,bytes).ok,true);assert.equal(d.residualKana(bytes),false);
 }
});
test('a valid 64-byte Entis header now reaches its real structural check',()=>{
 const input=entis(),out=api.scriptSampleResult(input);assert.ok(out.sample);assert.equal(out.reason,null);assert.equal(out.structure,'entis-csx-header');
 assert.deepEqual(d.partBytes(out.sample.parts[0]),input);
});
test('tiny damaged and incomplete recognized scripts retain fixed structural reasons without payload',()=>{
 for(const [input,reason,structure]of [[neko(),'STRUCTURE_CHANGED','nekosdk-advs2'],[Buffer.from('NEKOSDK_ADVSCRIPT2'),'STRUCTURE_UNSUPPORTED','nekosdk-advs2'],[entis().subarray(0,40),'STRUCTURE_UNSUPPORTED','entis-csx-header']]){
  const before=Buffer.from(input),out=api.scriptSampleResult(input);assert.deepEqual(out,{sample:null,reason,structure});assert.equal(api.scriptSample(input),null);assert.deepEqual(input,before);
  assert.equal(JSON.stringify(out).includes('gzip'),false);
 }
});
test('tiny unknown text goes through the same privacy gate without being called structurally checked',()=>{
 const input=Buffer.from('「さしすせそ」'.repeat(5),'utf8'),out=api.scriptSampleResult(input);assert.equal(out.structure,null);
 assert.deepEqual(out,d.sampleResult(input,{max:input.length,compress:true}));
 if(out.sample){const bytes=d.partBytes(out.sample.parts[0]);assert.equal(d.verify(input,bytes).ok,true);assert.equal(d.residualKana(bytes),false);}
});
test('zero length terminates without invoking the sampler or inventing a diagnosis',()=>{
 let calls=0;const stub=controlled(()=>{calls++;throw Error('zero must not be sampled');});
 assert.deepEqual(stub.scriptSampleResult(Buffer.alloc(0)),{sample:null,reason:'VERIFY',structure:null});assert.equal(calls,0);
 assert.deepEqual(api.scriptSampleResult(Buffer.alloc(0)),{sample:null,reason:'VERIFY',structure:null});
});
test('positive subminimum windows get exactly one attempt even when the packed result is too large',()=>{
 for(const length of [1,MIN-1]){
  const over=fitting(length,[api.SAMPLE_PACKED_MAX+1]);assert.deepEqual(over.attempts,[{length,max:length,compress:true}]);assert.equal(over.result.sample,null);assert.equal(over.result.reason,'VERIFY');assert.equal(over.result.structure,null);
  const exact=fitting(length,[api.SAMPLE_PACKED_MAX]);assert.equal(exact.result.sample,exact.samples[0]);assert.equal(exact.attempts.length,1);
 }
});
test('exact and just-above minimum keep their old single-attempt fitting budget',()=>{
 for(const length of [MIN,MIN+1]){
  const over=fitting(length,[api.SAMPLE_PACKED_MAX+1]);assert.deepEqual(over.attempts.map(a=>a.length),[length]);assert.equal(over.result.sample,null);
  const fits=fitting(length,[api.SAMPLE_PACKED_MAX]);assert.equal(fits.result.sample,fits.samples[0]);assert.equal(fits.attempts.length,1);
 }
});
test('larger retry windows remain quartered and stop at the existing minimum',()=>{
 const firstOver=fitting(4*MIN,[api.SAMPLE_PACKED_MAX+1,api.SAMPLE_PACKED_MAX]);assert.deepEqual(firstOver.attempts.map(a=>a.length),[4*MIN,MIN]);assert.equal(firstOver.result.sample,firstOver.samples[1]);
 const allOver=fitting(4*MIN,[api.SAMPLE_PACKED_MAX+1]);assert.deepEqual(allOver.attempts.map(a=>a.length),[4*MIN,MIN]);assert.equal(allOver.result.sample,null);
});
test('the caller window cap and zero cap retain their meaning',()=>{
 const capped=fitting(MIN+1,[1],{max:MIN});assert.deepEqual(capped.attempts,[{length:MIN,max:MIN,compress:true}]);
 const zero=fitting(8,[1],{max:0});assert.deepEqual(zero.attempts,[]);assert.equal(zero.result.sample,null);
});
test('privacy refusal still stops immediately and is not relabeled as structural failure',()=>{
 for(const length of [1,MIN-1,4*MIN]){
  const refused=fitting(length,[],{reason:'VERIFY'});assert.equal(refused.attempts.length,1);assert.deepEqual(refused.result,{sample:null,reason:'VERIFY',structure:null});
 }
});
