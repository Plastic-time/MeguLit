'use strict';
/* #483: a game whose exit the bridge never sees (started through Steam, picked up by its window) still teaches the GPU
   canary: the previous run's crash witness report with an unhandled exception in play turns layer 4 off */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const cs=fs.readFileSync(path.join(__dirname,'..','native','GpuHideLayer.cs'),'utf8');
test('unseen exit consults the crash witness of the previous pid',()=>{
 assert.match(cs,/string why=GpuCanaryUnseenCrash\(d\);if\(why!=""\)\{d\["armed"\]=false;d\["off"\]=true;d\["bridge"\]=BridgeBuild\(\);/);
 assert.match(cs,/static string GpuCanaryUnseenCrash\([^)]*\)\{try\{object pv;if\(!d\.TryGetValue\("pid",out pv\)\)return "";long pid=Convert\.ToInt64\(pv\);if\(pid<=4\)return "";/,'self-test pids 1-4 never read a report');
 assert.match(cs,/if\(w\.Closing\|\|w\.At\.IndexOf\("UNHANDLED",StringComparison\.Ordinal\)<0\)return "";/,'close-flow or first-chance only keeps the layer on');
});
