// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const {Reader}=require('../services/reader.cjs'),{Runtime}=require('../services/runtime.cjs'),{GalNative}=require('../core/gal-native.cjs');
const {trackStop}=require('../core/owned-exit.cjs');
const {HookNative}=require('../core/hook-native.cjs'),{EngineDraw,KrkrTransport}=require('../core/engine-draw.cjs'),Profiles=require('../core/profiles/index.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function runtime(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'reader-stop-retry-'));fs.mkdirSync(path.join(root,'logs'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return new Runtime(root);}
async function child(t,delay=30){const p=spawn(process.execPath,['-e',`process.stdin.resume();process.stdin.on('end',()=>setTimeout(()=>process.exit(0),${delay}));console.log('ready');`],{windowsHide:true,stdio:['pipe','pipe','ignore']});t.after(()=>{if(p.exitCode===null&&p.signalCode===null)p.kill();});await once(p.stdout,'data');return p;}
function gal({process,hooks,compositor,locateHost}={}){return Object.assign(Object.create(GalNative.prototype),{process,hooks:hooks||{stop(){}},compositor,locateHost,controller:{},styleSync:{stop(){}},send(){}});}

test('Gal stop waits for every branch and actual child exit after a synchronous cleanup failure',async t=>{
 const p=await child(t),first=Error('compositor stop failed');let release,hookStarted=false,done=false;
 const g=gal({process:p,compositor:{stop(){throw first;}},hooks:{stop(){hookStarted=true;return new Promise(resolve=>{release=resolve;});}}});
 const a=g.stop(),b=g.stop();assert.equal(a,b);const finished=a.then(()=>{done=true;},error=>{done=true;return error;});
 await tick();const before={hookStarted,done};release?.();
 const error=await finished;
 assert.deepEqual(before,{hookStarted:true,done:false});assert.equal(error,first);assert.equal(p.exitCode,0);assert.equal(g.stopping,null);assert.equal(g.stopError,first);
});

test('a rejected Gal stop retries retained hooks while concurrent requests remain deduplicated',async()=>{
 const first=Error('READER_STOP_INCOMPLETE');let attempts=0,release;
 const g=gal({hooks:{stop(){if(++attempts===1)return Promise.reject(first);return new Promise(resolve=>{release=resolve;});}}});
 await assert.rejects(g.stop(),error=>error===first);assert.equal(g.stopping,null);assert.equal(g.stopped,true);
 const a=g.stop(),b=g.stop();assert.equal(a,b);assert.equal(attempts,2);release();await a;assert.equal(g.stopError,null);
});

test('Runtime retries the same failed Reader and Gal resources without reopening live messages',async t=>{
 const r=runtime(t),reader=new Reader(r),p=await child(t);let attempts=0;const first=Error('READER_STOP_INCOMPLETE');
 const g=gal({process:p,hooks:{stop(){return ++attempts===1?Promise.reject(first):Promise.resolve();}}});reader.gal=g;r.reader=reader;
 await assert.rejects(r.stopReading(),error=>error===first);
 assert.equal(p.exitCode,0);assert.equal(r.reader,reader);assert.equal(reader.gal,null);assert.equal(reader.stoppingGal,g);assert.equal(reader.active(),false);assert.equal(reader.stopping,null);assert.equal(r.readerError,'READER_STOP_INCOMPLETE');
 await r.stopReading();assert.equal(attempts,2);assert.equal(r.reader,null);assert.equal(reader.stoppingGal,null);assert.equal(reader.stopError,null);assert.equal(r.readerError,'');
});

test('Reader unbind failure cannot skip stopping its owned helper',async t=>{
 const r=runtime(t),reader=new Reader(r),p=await child(t),first=Error('unbind write failed');let stops=0;
 reader.gal={process:p,send(){throw first;},stop(){stops++;p.stdin.end();}};
 await assert.rejects(reader.stop(),error=>error===first);assert.equal(stops,1);assert.equal(p.exitCode,0);assert.equal(reader.stopping,null);assert(reader.stoppingGal);
});

test('a new attach cannot discard resources whose cleanup still fails',async t=>{
 const r=runtime(t),reader=new Reader(r),first=Error('READER_STOP_INCOMPLETE');let attempts=0,attached=0;
 t.mock.method(Reader.prototype,'attach',()=>{attached++;return {attached:true};});
 reader.gal={send(){},stop(){attempts++;return Promise.reject(first);}};r.reader=reader;
 await assert.rejects(r.stopReading(),error=>error===first);
 await assert.rejects(r.call({action:'reader_attach'}),error=>error===first);assert.equal(attempts,2);assert.equal(attached,0);assert.equal(r.reader,reader);
});

test('falsy rejection reasons still block replacing the failed teardown owner',async t=>{
 let attached=0;t.mock.method(Reader.prototype,'attach',()=>{attached++;return {attached:true};});
 for(const reason of [undefined,null,false,0,'']){
  const r=runtime(t),reader=new Reader(r);let attempts=0;
  reader.gal={send(){},stop(){attempts++;return Promise.reject(reason);}};r.reader=reader;
  for(const run of [()=>r.stopReading(),()=>r.call({action:'reader_attach'})]){
   const result=await Promise.allSettled([run()]);assert.equal(result[0].status,'rejected');assert.equal(result[0].reason,reason);
  }
  assert.equal(reader.stopFailed,true);assert.equal(attempts,2);assert.equal(attached,0);assert.equal(r.reader,reader);assert(reader.stoppingGal);
 }
});

test('a failed text path must finish a successful retry before a new reader can attach',async t=>{
 let attached=0;t.mock.method(Reader.prototype,'attach',()=>{attached++;return {attached:true};});
 for(const reason of [Error('READER_STOP_INCOMPLETE'),undefined]){
  const r=runtime(t),reader=new Reader(r);r.reader=reader;let attempts=0,fail=true;
  const session={stop(){attempts++;return fail?Promise.reject(reason):Promise.resolve();}};r.textPaths=new Set([session]);
  const first=await Promise.allSettled([r.stopReading()]);assert.equal(first[0].status,'rejected');assert.equal(reader.stopError,null);assert.equal(reader.stopFailed,false);
  // Frontend health updates do not erase the independent resource-cleanup failure state.
  r.readerError='';const before=attached,second=await Promise.allSettled([r.call({action:'reader_attach'})]);
  assert.equal(second[0].status,'rejected');assert.equal(attempts,2);assert.equal(attached,before);assert.equal(r.reader,reader);assert(r.textPaths.has(session));
  fail=false;assert.deepEqual(await r.call({action:'reader_attach'}),{attached:true});assert.equal(attempts,3);assert.equal(attached,before+1);assert.equal(r.textPaths.size,0);assert.equal(r.readingStopFailed,false);await r.stopReading();
 }
});

test('attachment waits for pending text-path cleanup even after Reader.stop has finished',async t=>{
 const r=runtime(t),reader=new Reader(r);r.reader=reader;let release,attached=0,attempts=0;
 t.mock.method(Reader.prototype,'attach',()=>{attached++;return {attached:true};});
 r.textPaths=new Set([{stop(){attempts++;return new Promise(resolve=>{release=resolve;});}}]);
 const stop=r.stopReading();assert.equal(stop,r.stopReading());await tick();assert.equal(reader.stopping,null);assert.equal(reader.closed,true);
 const attach=r.call({action:'reader_attach'});await tick();assert.equal(attached,0);assert.equal(attempts,1);assert.equal(r.reader,reader);
 release();await stop;assert.deepEqual(await attach,{attached:true});assert.equal(attached,1);assert.equal(r.textPaths.size,0);await r.stopReading();
});

test('a new attach can resume only after retrying the old failed cleanup successfully',async t=>{
 const r=runtime(t),reader=new Reader(r),first=Error('READER_STOP_INCOMPLETE');let attempts=0,attached=0;
 t.mock.method(Reader.prototype,'attach',()=>{attached++;return {attached:true};});
 reader.gal={send(){},stop(){return ++attempts===1?Promise.reject(first):Promise.resolve();}};r.reader=reader;
 await assert.rejects(r.stopReading(),error=>error===first);
 assert.deepEqual(await r.call({action:'reader_attach'}),{attached:true});assert.equal(attempts,2);assert.equal(attached,1);assert.notEqual(r.reader,reader);assert.equal(reader.stoppingGal,null);await r.stopReading();
});

test('owned aggregate waits for a second real child after another child already failed',async t=>{
 const slow=await child(t,70),owner={};
 const failed=spawn(process.execPath,['-e','process.exit(7)'],{windowsHide:true,stdio:'ignore'});await once(failed,'exit');
 const old=trackStop(owner,failed);await assert.rejects(old,/READER_STOP_INCOMPLETE/);let done=false;
 const result=trackStop(owner,slow,()=>slow.stdin.end()).then(()=>{done=true;},error=>{done=true;return error;});
 await tick();assert.equal(done,false);assert.equal(slow.exitCode,null);assert.match((await result).message,/READER_STOP_INCOMPLETE/);assert.equal(slow.exitCode,0);
});

test('full native reader stop retains a failed control revocation and retries after both owned helpers exit',async t=>{
 const r=runtime(t),reader=new Reader(r),hookChild=await child(t,80),galChild=await child(t,20),profile=structuredClone(Profiles.profileFor({}));profile.draw.advhdInput=true;
 const transport=new KrkrTransport(hookChild.pid,{tmp:r.root}),draw=new EngineDraw({profile,transport});transport.flush(draw.cfg,draw.entries);
 const h=Object.assign(Object.create(HookNative.prototype),{profile,process:hookChild,engineDraw:draw,state:{},serial:0,islandSources:new Map(),pageReset(){},notify(){},send(m){hookChild.stdin.write(JSON.stringify(m)+'\n');}});
 const g=gal({process:galChild,hooks:h});reader.gal=g;r.reader=reader;
 const unlink=fs.unlinkSync,write=fs.writeFileSync,denied=()=>Object.assign(Error('owned test control locked'),{code:'EACCES'});
 try{
  fs.unlinkSync=function(file,...args){if(file===transport.file)throw denied();return unlink(file,...args);};
  fs.writeFileSync=function(file,...args){if(file===transport.file)throw denied();return write(file,...args);};
  const stopped=r.stopReading();await assert.rejects(stopped,/READER_STOP_INCOMPLETE/);
  assert.equal(hookChild.exitCode,0);assert.equal(galChild.exitCode,0);assert.equal(r.reader,reader);assert.equal(reader.stoppingGal,g);assert.equal(h.engineDraw,draw);assert.equal(draw.closed,true);assert.equal(transport.closed,true);
  assert.match(fs.readFileSync(transport.file).subarray(2).toString('utf16le'),/advhdInput=1/);
 }finally{fs.unlinkSync=unlink;fs.writeFileSync=write;}
 await r.stopReading();assert.equal(r.reader,null);assert.equal(reader.stoppingGal,null);assert.equal(h.engineDraw,null);assert.equal(fs.existsSync(transport.file),false);
});
