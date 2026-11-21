// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const ED=require('../core/engine-draw.cjs'),{HookNative}=require('../core/hook-native.cjs'),Profiles=require('../core/profiles/index.cjs');
const on={...Profiles.profileFor({}),draw:{roles:true,embed:true,advhdInput:true,cmvsInput:true,fvpInput:true,minoriInput:true}};
const off=Profiles.profileFor({});
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(){
 const dir=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'megulit-revoke-'));
 const tr=new ED.KrkrTransport(987,{tmp:dir,delay:1});tr.flush(ED.settings(on),new Map([['本文',{zh:'译文'}]]));
 return {dir,tr,clean(){clearTimeout(tr.timer);fs.rmSync(dir,{recursive:true,force:true});}};
}
function injected(file,methods,body){
 const originals={};for(const [key,fn] of Object.entries(methods)){originals[key]=fs[key];fs[key]=function(target,...args){return target===file?fn(originals[key],target,...args):originals[key](target,...args);};}
 let result;try{result=body();}catch(error){for(const k in originals)fs[k]=originals[k];throw error;}
 if(result?.then)return result.finally(()=>{for(const k in originals)fs[k]=originals[k];});
 for(const k in originals)fs[k]=originals[k];return result;
}
function denied(){return Object.assign(Error('test-owned control permission denied'),{code:'EACCES'});}
function hook(draw){const h=Object.create(HookNative.prototype);Object.assign(h,{engineDraw:draw,state:{},serial:0,profile:on,islandSources:new Map(),pageReset(){},notify(){},trace(){},capGiveWay(){},now:()=>1});return h;}
function stopped(error){return error.code==='READER_STOP_INCOMPLETE'&&error.message==='READER_STOP_INCOMPLETE';}

test('locked control falls back to exact all-off bytes without stale table or entries',()=>{
 const f=fixture();try{
  injected(f.tr.file,{unlinkSync(){throw denied();}},()=>f.tr.stop());
  const b=fs.readFileSync(f.tr.file);assert.deepEqual([...b.subarray(0,2)],[255,254]);
  assert.equal(b.subarray(2).toString('utf16le'),'#cfg roles=0 embed=0 zh=0 advhdInput=0 cmvsInput=0 fvpInput=0 minoriInput=0\r\n');
  assert.equal(f.tr.last,'');
 }finally{f.clean();}
});
for(const failure of ['write','read','mismatch'])test('control '+failure+' failure rejects with retry evidence',()=>{
 const f=fixture();try{
  const methods={unlinkSync(){throw denied();}};
  if(failure==='write')methods.writeFileSync=()=>{throw denied();};
  if(failure==='read')methods.readFileSync=()=>{throw denied();};
  if(failure==='mismatch')methods.readFileSync=()=>Buffer.from('stale');
  injected(f.tr.file,methods,()=>assert.throws(()=>f.tr.stop(),e=>stopped(e)&&e.controlFile===f.tr.file&&!!e.cause&&e.unlinkError.code==='EACCES'));
 }finally{f.clean();}
});
test('already absent control succeeds without a fallback write',()=>{
 const f=fixture();try{fs.unlinkSync(f.tr.file);injected(f.tr.file,{writeFileSync(){throw Error('must not write');}},()=>f.tr.stop());}finally{f.clean();}
});
test('inactive sync is reversible, while terminal stop blocks late profile, reply and scheduled writes',async()=>{
 const f=fixture();try{
  const d=new ED.EngineDraw({profile:on,transport:f.tr});clearTimeout(f.tr.timer);f.tr.flush(d.cfg,d.entries);
  d.setProfile(off);assert.equal(fs.existsSync(f.tr.file),false);assert.equal(d.closed,undefined);
  d.setProfile(on);f.tr.flush(d.cfg,d.entries);assert.match(fs.readFileSync(f.tr.file).toString('utf16le'),/roles=1/);
  injected(f.tr.file,{unlinkSync(){throw denied();},writeFileSync(){throw denied();}},()=>assert.throws(()=>d.stop(),stopped));
  const before=fs.readFileSync(f.tr.file);const h=hook(d);h.drawEmbedReply('迟到',{zh:'late'});
  d.setProfile(on);d.put('迟到',{zh:'late'});assert.equal(d.line({text:'迟到'}),false);d.sync();
  f.tr.write(ED.settings(on),new Map());f.tr.flush(ED.settings(on),new Map());await tick();
  assert.deepEqual(fs.readFileSync(f.tr.file),before);assert.equal(d.entries.size,0);assert.equal(d.active,false);
  d.stop();assert.equal(fs.existsSync(f.tr.file),false);
 }finally{f.clean();}
});
test('failed control stop awaits the actual owned Node helper, shares pending work and then permits retry',async()=>{
 const f=fixture();let child;
 try{
  const d=new ED.EngineDraw({profile:on,transport:f.tr});clearTimeout(f.tr.timer);
  child=spawn(process.execPath,['-e',"process.stdin.resume();process.stdout.write('ready\\n');process.stdin.on('end',()=>setTimeout(()=>process.exit(0),100));"],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('helper ready timeout')),2000);child.stdout.once('data',()=>{clearTimeout(t);resolve();});child.once('error',e=>{clearTimeout(t);reject(e);});});
  const h=hook(d);h.process=child;const messages=[];h.send=m=>{messages.push(m);child.stdin.write(JSON.stringify(m)+'\n');};
  await injected(f.tr.file,{unlinkSync(){throw denied();},writeFileSync(){throw denied();}},async()=>{
   let settled=false;const p=h.stop(false);assert.equal(p,h.stop(true));p.finally(()=>{settled=true;}).catch(()=>{});
   await tick();assert.equal(settled,false);assert.equal(h.disposed,true);assert.equal(child.exitCode,null);
   assert.doesNotThrow(()=>h.start({pid:1,hwnd:'1',name:'a',started:'1234567890'}));
   await assert.rejects(p,e=>stopped(e)&&stopped(e.cause));
  });
  assert.equal(child.exitCode,0);assert.equal(messages[0].type,'quit');assert.equal(h.engineDraw,d);assert.ok(h.stopError);assert.equal(h.stopPending,null);
  await h.stop();assert.equal(h.engineDraw,null);assert.equal(h.stopError,null);assert.equal(fs.existsSync(f.tr.file),false);
 }finally{if(child&&child.exitCode==null&&child.signalCode==null){child.kill();await new Promise(r=>{const t=setTimeout(r,2000);child.once('close',()=>{clearTimeout(t);r();});});}f.clean();}
});
test('configure fire-and-forget stop observes rejection and preserves reversible identity',async()=>{
 const f=fixture();const unhandled=[];const watch=e=>unhandled.push(e);process.on('unhandledRejection',watch);
 try{
  const d=new ED.EngineDraw({profile:on,transport:f.tr});clearTimeout(f.tr.timer);const h=hook(d);
  await injected(f.tr.file,{unlinkSync(){throw denied();},writeFileSync(){throw denied();}},async()=>{
   h.configure({bindEnabled:false},{gameProcessId:0});await tick();await tick();assert.ok(h.stopError);assert.equal(h.disposed,undefined);
   h.start({pid:1,hwnd:'1',name:'a',started:'1234567890'});assert.equal(h.process,null);
  });
  assert.deepEqual(unhandled,[]);await h.stop(false);assert.equal(h.disposed,undefined);assert.equal(h.stopError,null);
  const sentinel=Error('refresh reached before any helper lookup');let refreshed=0;h.drawSync=()=>{refreshed++;throw sentinel;};
  assert.throws(()=>h.start({pid:1,hwnd:'1',name:'a',started:'1234567890'}),e=>e===sentinel);assert.equal(refreshed,1);
 }finally{process.removeListener('unhandledRejection',watch);f.clean();}
});
