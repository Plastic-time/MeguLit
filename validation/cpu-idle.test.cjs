const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
function events(extra={}){const target=new EventTarget();return Object.assign(target,extra);}
test('visible focused UI keeps breathing; blur and hide cancel frames, focus resumes in the next frame',async()=>{
 const {createUiGate,createUiFrames}=await import('../web/idle-gate.js');let focused=true,serial=0,painted=0;
 const doc=events({hidden:false,hasFocus:()=>focused,documentElement:{dataset:{}}}),win=events();
 const gate=createUiGate({document:doc,window:win}),native=new Map();
 const frames=createUiFrames(gate,{request:fn=>{native.set(++serial,fn);return serial;},cancel:id=>native.delete(id)});
 const paint=()=>{painted++;frames.request(paint);};frames.request(paint);
 for(let i=0;i<3;i++){const batch=[...native];native.clear();for(const [,fn] of batch)fn(i*16);}
 assert.equal(painted,3);assert.equal(gate.state,'active');assert.equal(native.size,1);
 focused=false;win.dispatchEvent(new Event('blur'));assert.equal(native.size,0);assert.equal(gate.state,'idle');assert.equal(painted,3);
 doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));focused=true;win.dispatchEvent(new Event('focus'));assert.equal(native.size,0);
 doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(native.size,1);const batch=[...native.values()];native.clear();batch[0](100000);assert.equal(painted,4);
 frames.stop();gate.stop();assert.equal(native.size,0);
});
test('reader intervals allocate no native timers until bound and are cancelled on close, including newly registered jobs',()=>{
 const context={window:{},setInterval,clearInterval};vm.runInNewContext(fs.readFileSync(path.join(root,'web/reader/activity.js'),'utf8'),context);
 const native=new Map();let serial=0,calls=0;const timers=context.window.__megulitCreateReaderIntervals({set:(fn,ms)=>{native.set(++serial,{fn,ms});return serial;},clear:id=>native.delete(id)});
 const id=timers.set(()=>calls++,100);assert.equal(native.size,0);timers.setBound(true);assert.equal(native.size,1);[...native.values()][0].fn();assert.equal(calls,1);
 timers.setBound(false);assert.equal(native.size,0);const next=timers.set(()=>{},120);assert.equal(native.size,0);timers.clear(id);timers.setBound(true);assert.equal(native.size,1);timers.clear(next);assert.equal(native.size,0);
 const bootstrap=fs.readFileSync(path.join(root,'web/reader/bootstrap.js'),'utf8');assert.match(bootstrap,/message\.bound==='boolean'.*setBound\(message\.bound\)/);assert.match(bootstrap,/message\.type==='gameClosed'.*setBound\(false\)/);
});
test('automatic maintenance defers while busy and runs once when idle; stopping cancels the retry',async()=>{
 const {schedule}=require('../services/background-budget.cjs');let idle=false,calls=0,id=0;const queue=new Map();
 const job=schedule('root',()=>{calls++;},{allowed:async()=>idle,later:(fn,ms)=>{queue.set(++id,{fn,ms});return id;},cancel:key=>queue.delete(key),delay:45,retry:60});
 const first=queue.get(1);queue.delete(1);await first.fn();assert.equal(calls,0);assert.equal(queue.get(2).ms,60);
 idle=true;const next=queue.get(2);queue.delete(2);await next.fn();assert.equal(calls,1);assert.equal(queue.size,0);job.stop();
 const stop=schedule('root',()=>calls++,{allowed:async()=>false,later:(fn,ms)=>{queue.set(++id,{fn,ms});return id;},cancel:key=>queue.delete(key)});stop.stop();assert.equal(queue.size,0);
});
test('shared background permission requires actual input idle, AC, low CPU and no foreground game',async()=>{
 const games=require('../services/background-games.cjs');let playing=false;games.configure(()=>playing);const reading=async()=>({idleMs:300001,ac:true,cpu:.05,fullscreen:false});
 assert.equal(await games.idle('root',{reading}),true);playing=true;assert.equal(await games.idle('root',{reading}),false);playing=false;
 for(const patch of [{idleMs:299999},{ac:false},{cpu:.2},{cpu:NaN},{fullscreen:true}])assert.equal(await games.idle('root',{reading:async()=>({...await reading(),...patch})}),false);
});
test('native bridge lowers only unbound polling and the perf probe has no idle frame loop',()=>{
 const native=fs.readFileSync(path.join(root,'native/GalWindowBridge.cs'),'utf8');assert.match(native,/Thread\.Sleep\(Dragging\?8:Target==IntPtr\.Zero\?250:16\)/);
 const probe=fs.readFileSync(path.join(root,'web/reader/perf-probe.js'),'utf8');assert.match(probe,/if\(typing\)raf=requestAnimationFrame\(frame\)/);assert.match(probe,/cancelAnimationFrame\(raf\)/);
});
