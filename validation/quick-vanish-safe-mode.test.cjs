'use strict';
/* #483 fallback: two quick silent vanishes in a row put the game in the safe mode (read only, no GPU layer, said in the UI) */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const cs=fs.readFileSync(path.join(__dirname,'..','native','HookBridge.cs'),'utf8'),gl=fs.readFileSync(path.join(__dirname,'..','native','GpuHideLayer.cs'),'utf8');
test('quick vanish count, safe mode and the layer gate',()=>{
 assert.match(cs,/const int QuickVanishMs=60000,QuickVanishLimit=2;/);
 assert.match(cs,/QuickVanishNext\(int count,double ranMs,bool exited,bool readText\)\{if\(!exited\)return count;return ranMs<QuickVanishMs&&!readText\?count\+1:0;\}/,'a run that lasts or reads clears the count; a still-running game does not count');
 assert.match(cs,/try\{QuickVanishNote\(\);\}catch\{\}try\{Deactivate\("bridge-shutdown"\);/);
 assert.match(cs,/QuickVanishCheck\(\);Started=true;SessionStart=DateTime\.UtcNow;/);
 assert.match(cs,/ReplacementEnabled=!SafeMode&&d\.ContainsKey\("replace"\)/);assert.match(cs,/type=="enable"\)\{ReplacementEnabled=!SafeMode;/);
 assert.match(cs,/Status\("这部游戏前两次刚启动就退出了/);
 assert.match(gl,/if\(pid>4&&d\.TryGetValue\("vanish",out v\)&&Convert\.ToInt32\(v\)>=QuickVanishLimit\)\{[^}]*return false;\}/,'safe mode keeps layer 4 out; self-test pids untouched');
});
