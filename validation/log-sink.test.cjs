// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const sink=require('../core/log-sink.cjs');
function fakeIo(){const io={files:{},fail:false,hang:false,calls:0,pending:[],
 appendFile(f,t,cb){io.calls++;if(io.hang){io.pending.push(()=>{io.files[f]=(io.files[f]||'')+t;cb(null);});return;}
  setImmediate(()=>{if(io.fail){const e=new Error('ENOSPC: no space left on device');e.code='ENOSPC';return cb(e);}io.files[f]=(io.files[f]||'')+t;cb(null);});},
 stat(f,cb){setImmediate(()=>io.files[f]!==undefined?cb(null,{size:io.files[f].length}):cb(new Error('ENOENT')));},
 rename(a,b,cb){io.files[b]=io.files[a];delete io.files[a];setImmediate(()=>cb(null));}};return io;}
const tick=()=>new Promise(r=>setTimeout(r,20));
const until=async(f,ms=5000)=>{const t=Date.now();while(!f()&&Date.now()-t<ms)await tick();};
test('a full drive drops lines, counts them and says so once writing works again',async()=>{
 sink._reset();const io=fakeIo();io.fail=true;
 for(let i=0;i<5;i++)sink.append('L',`line ${i}\n`,{},io);
 await until(()=>sink.pending('L').dropped===5);
 assert.equal(io.files.L,undefined);assert.equal(sink.pending('L').dropped,5);
 io.fail=false;sink.append('L','after\n',{},io);await until(()=>/after\n$/.test(io.files.L||''));
 assert.match(io.files.L,/^\S+ log: dropped 5 lines \(log drive not writable\)\nafter\n$/);
 assert.equal(sink.pending('L').dropped,0);
});
test('a write that never returns (stuck drive) never blocks the caller; the backlog is capped and counted',async()=>{
 sink._reset();const io=fakeIo();io.hang=true;
 const t=Date.now();for(let i=0;i<sink.MAX_QUEUED+300;i++)sink.append('H',`x${i}\n`,{},io);
 assert.ok(Date.now()-t<500,'append waited');
 assert.equal(io.calls,1,'one write in flight at a time');
 const p=sink.pending('H');assert.equal(p.queued,sink.MAX_QUEUED);assert.equal(p.dropped,299);
 io.pending.shift()();await tick();await tick();io.pending.shift()();await tick();
 assert.match(io.files.H,/log: dropped 299 lines/);
});
test('lines keep their order and the file rotates past its size',async()=>{
 sink._reset();const io=fakeIo();io.files.R='y'.repeat(50);
 for(let i=0;i<4;i++)sink.append('R',`r${i}\n`,{rotate:40},io);await tick();await tick();await tick();
 assert.equal(io.files['R.previous'],'y'.repeat(50));assert.equal(io.files.R,'r0\nr1\nr2\nr3\n');
});
