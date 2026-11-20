'use strict';
/* #483: a game in its first seconds is injected only after it loaded a graphics module and its window answers (at most
   StartupSettleMs); a game already running is injected at once */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const cs=fs.readFileSync(path.join(__dirname,'..','native','HookBridge.cs'),'utf8');
test('bridge waits for the game start to settle before LunaHook goes in',()=>{
 assert.ok(cs.includes('if(GenericHookStart())WaitStartupSettled(Pid);else Diagnostic(\"startup settle not needed'),'wait gated');assert.match(cs,/startup settle not needed[^\n]*\n\s*Luna_Settings\(180,Codepage,4000,4000,false\);Luna_Start\(/);
 assert.match(cs,/const int StartupSettleMs=10000;/);
 assert.match(cs,/if\(age>=StartupSettleMs\)return;/,'a running game is not delayed');
 const re=/GraphicsModule\(string name\)\{return System\.Text\.RegularExpressions\.Regex\.IsMatch\(name\?\?"",@"([^"]+)"/.exec(cs);
 assert.ok(re);const g=new RegExp(re[1],'i');
 for(const n of ['d3d9.dll','D3D11.dll','dxgi.dll','d3d12.dll','opengl32.dll','vulkan-1.dll'])assert.ok(g.test(n),n);
 for(const n of ['d3d9x_43.dll','gdi32.dll','d3d11on12.dll'])assert.ok(!g.test(n),n);
assert.match(cs,/static bool GenericHookStart\(\)\{return UnknownEngine\(Resume!=null,KnownIsland,MagesAddress,UnityFontDir,RememberedCode,HookTarget\.ExePath\)&&!StartedSuspended\(Pid\);\}/,'only the generic-hook path waits');assert.match(cs,/!IsHungAppWindow\(w\)&&SendMessageTimeoutW\(w,0,IntPtr\.Zero,IntPtr\.Zero,2/);
});
