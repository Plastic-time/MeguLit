// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Neutral synthetic formats only; no received game/probe bytes.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const d=require('../services/desensitize.cjs'),guard=require('../services/probe-structure.cjs');
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const NEKO=Buffer.from('NEKOSDK_ADVSCRIPT2'),SHOW=Buffer.from('5b8365834c83588367955c8ea65d','hex');
function neko(){return Buffer.concat([NEKO,u32(SHOW.length),SHOW,u32(1),Buffer.from([0]),u32(7),Buffer.from('82a982ab82ad00','hex')]);}
function entis(wide=true){const h=Buffer.alloc(64);h.write('Entis\x1a',0,'latin1');h.write('Cotopha Image file',16,'ascii');return wide?Buffer.concat([h,Buffer.from('あいうえおかきくけこ'.repeat(20),'utf16le')]):h;}
function adapter(files={}){
 const filename=path.resolve(__dirname,'../services/adapter-sample.cjs'),source=fs.readFileSync(filename,'utf8'),stored=new Map(),reads={whole:0,range:0};
 const fakeFs={statSync:p=>({size:files[p]?.length||0,isFile:()=>!!files[p]}),readFileSync:p=>{reads.whole++;if(!files[p])throw Error('not in virtual fixture');return files[p];},readdirSync:()=>[],mkdirSync:()=>{},writeFileSync:(p,b)=>stored.set(p,Buffer.from(b))};
 const kit={readAt:(p,at,n)=>{reads.range++;if(!files[p])throw Error('not in virtual fixture');return files[p].subarray(at,at+n);}};
 const m=new Module(filename);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));
 m.require=name=>{
  if(name==='node:fs')return fakeFs;if(name==='./original-engines/kit.cjs')return kit;if(name==='./desensitize.cjs')return d;
  if(name==='./adapter-probe.cjs')return {results:()=>({one:{step:'parse-failed',detail:'neutral',engines:[],inventory:{}}}),libraryGames:()=>[{id:'one',title:'neutral',executable:'synthetic.exe'}]};
  if(name==='./shared-adaptation.cjs')return {fingerprint:()=>({key:'a'.repeat(64)}),appVersion:()=> 'test'};
  if(name==='./probe-identity.cjs')return {identity:()=>({id:'b'.repeat(64)}),vndbOf:()=>''};
  if(name==='./runtime-harvest.cjs')return {gate:()=>null,load:()=>null};
  return require(name);
 };
 m._compile(source,filename);return {api:m.exports,stored,reads};
}

test('52B Neko and 464B Entis old false-valid witnesses now drop without retaining technical Japanese',()=>{
 const n=require('../services/original-engines/nekosdk.cjs'),e=require('../services/original-engines/entis.cjs');
 for(const input of [neko(),entis()]){
  // Privacy alone formerly accepted these changed technical bytes.
  const masked=d.desensitize(input);assert.equal(d.verify(input,masked.bytes).ok,true);
  assert.equal(d.residualKana(masked.bytes),false);
  if(input.length===52){assert.equal(n.shown(input).length,1);assert.equal(n.parse(input).lines.length,1);assert.equal(n.shown(masked.bytes).length,0);}
  else{assert.equal(input.length,464);assert.equal(e.isCsx(input),true);assert.equal(e.isCsx(masked.bytes),false);}
  const result=d.sampleResult(input,{max:input.length,compress:true});
  assert.equal(result.sample,null);assert.equal(result.reason,'STRUCTURE_CHANGED');assert.ok(result.structure);
  assert.equal(d.sample(input,{max:input.length}),null);
  assert.equal(JSON.stringify(result).includes('gzip'),false);assert.equal(JSON.stringify(result).includes('テキスト'),false);
 }
});
test('unchanged known header and unrelated formats preserve privacy-valid sampling',()=>{
 const clean=entis(false),r=d.sampleResult(clean,{max:clean.length,compress:true});assert.equal(r.reason,null);assert.deepEqual(d.partBytes(r.sample.parts[0]),clean);
 for(const input of [Buffer.from('ARCX\0neutral\0'),Buffer.from('\ufeff「かきく」[p]','utf8'),Buffer.alloc(512,0)]){
  const result=d.sampleResult(input,{max:input.length});assert.ok(result.sample);assert.equal(result.structure,null);assert.equal(result.reason,null);
  assert.equal(d.verify(input,d.partBytes(result.sample.parts[0])).ok,true);assert.equal(d.textRuns(d.partBytes(result.sample.parts[0])).length,0);
 }
});
test('known format with unproved/truncated command structure is unsupported, never clean or corrupt',()=>{
 for(const input of [NEKO,entis(false).subarray(0,34),Buffer.concat([NEKO,u32(14),SHOW,u32(1000),Buffer.from([0])]),Buffer.concat([NEKO,u32(15),SHOW,Buffer.from([1])])]){
  const result=d.sampleResult(input,{max:input.length});assert.equal(result.sample,null);assert.equal(result.reason,'STRUCTURE_UNSUPPORTED');
 }
 const input=neko(),plan=guard.inspect(input);assert.equal(guard.compare(plan,input,[{at:0,bytes:input.subarray(0,30)}]),'STRUCTURE_UNSUPPORTED');
});
test('guard budgets are finite and default sampler cannot silently skip the unchecked suffix',()=>{
 const large=Buffer.alloc(guard.LIMITS.nekoBytes+1);NEKO.copy(large);assert.equal(d.sampleResult(large).reason,'STRUCTURE_BUDGET');
 const record=neko().subarray(NEKO.length),many=Buffer.concat([NEKO,...Array(guard.LIMITS.nekoRecords+1).fill(record)]);
 assert.equal(guard.inspect(many).reason,'STRUCTURE_BUDGET');
 const exact=Buffer.concat([NEKO,...Array(guard.LIMITS.nekoRecords).fill(record)]);assert.equal(guard.inspect(exact).reason,undefined);
});
test('actual archive adapter cannot fall back to chunks after a recognized structure rejection',()=>{
 for(const input of [neko(),entis()]){
  const {api,reads}=adapter({'fixture.arc':input}),entry=api.archiveSample('fixture.arc','.',{raw:0});
  assert.equal(entry.dropped,'STRUCTURE_CHANGED');assert.equal(entry.sample,undefined);assert.equal(entry.raw,undefined);assert.equal(entry.packed,undefined);
  assert.equal(reads.whole,1);assert.equal(reads.range,0,'no fallback, pointer read, hash read or extra read after drop');
 }
 const b=Buffer.alloc(guard.LIMITS.nekoBytes+1);NEKO.copy(b);const {api,reads}=adapter({'large.arc':b});
 assert.equal(api.archiveSample('large.arc','.',{raw:0}).dropped,'STRUCTURE_BUDGET');assert.equal(reads.whole,1);assert.equal(reads.range,0);
});
test('unrelated S5 archive fallback still keeps good blocks when privacy rejects another block',()=>{
 const data=Buffer.alloc(2*65536);data.write('ARCX');data.write('POISON',65536);const {api}=adapter({'other.arc':data}),real=d.sampleResult;
 d.sampleResult=(buf,o)=>Buffer.from(buf).includes('POISON')?{sample:null,reason:'VERIFY',structure:null}:real(buf,o);
 try{const entry=api.archiveSample('other.arc','.',{raw:0});assert.ok(entry.sample);assert.equal(entry.dropped,undefined);assert.equal(entry.droppedBlocks,1);assert.deepEqual(entry.sample.parts.map(x=>x.at),[0]);}
 finally{d.sampleResult=real;}
});
test('script result carries fixed reason without changing the legacy sample-or-null contract',()=>{
 const input=Buffer.concat([neko(),Buffer.alloc(65536)]),{api}=adapter();
 const result=api.scriptSampleResult(input);assert.equal(result.reason,'STRUCTURE_CHANGED');assert.equal(result.sample,null);assert.equal(api.scriptSample(input),null);
});
test('actual prepare, stored bundle, manifest and completeness all exclude damaged sample payload',async()=>{
 const {api,stored}=adapter({'fixture.arc':entis()}),entry=api.archiveSample('fixture.arc','.',{raw:0});
 const prepared=await api.prepare('virtual-root',{}, {sampler:async()=>({samples:[entry],keys:[]})});assert.ok(prepared.hash);
 const body=JSON.parse([...stored.values()][0]),sample=body.games[0].samples[0];
 assert.equal(sample.dropped,'STRUCTURE_CHANGED');assert.equal(sample.sample,undefined);assert.equal(JSON.stringify(body).includes('Cotopha'),false);
 const manifest=prepared.manifest[0],drop=manifest.items.find(x=>x.kind==='dropped');assert.equal(drop.reason,'STRUCTURE_CHANGED');assert.equal(drop.bytes,0);assert.equal(drop.raw,0);assert.equal(drop.packed,0);
 assert.equal(manifest.probeItems,1);assert.equal(manifest.probeState,'failed');assert.equal(api.clean(body),true);
});
test('runtime publicize excludes both damaged script and dump and records exact fixed reasons',()=>{
 const runtime=require('../services/runtime-harvest.cjs');
 const result=runtime.publicize({scripts:[{window:neko()}]},{dumps:[{bytes:entis(),source:'synthetic',how:'test'}]});
 assert.deepEqual(result.scripts,[]);assert.equal(result.dropped.STRUCTURE_CHANGED,2);assert.equal(result.dropped.verify,0);assert.equal(JSON.stringify(result).includes('gzip'),false);
});
