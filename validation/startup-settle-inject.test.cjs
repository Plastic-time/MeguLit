'use strict';
/* #483: only a generic-hook game in its first seconds waits (graphics module + answering window, at most StartupSettleMs);
   remembered streams, engine addresses, engine files on first play and MeguLit's suspended start keep the early injection */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const cs=fs.readFileSync(path.join(__dirname,'..','native','HookBridge.cs'),'utf8');
test('bridge waits only on the generic-hook path, and logs why',()=>{
 assert.match(cs,/if\(GenericHookStart\(\)\)WaitStartupSettled\(Pid\);\r?\n\s*QuickVanishCheck\(\);Luna_Settings\(180,Codepage,4000,4000,false\);Luna_Start\(|if\(GenericHookStart\(\)\)WaitStartupSettled\(Pid\);\r?\n\s*Luna_Settings\(180,Codepage,4000,4000,false\);Luna_Start\(/);
 assert.match(cs,/const int StartupSettleMs=10000;/);assert.match(cs,/if\(age>=StartupSettleMs\)return;/,'a running game is not delayed');
 assert.match(cs,/static bool GenericHookStart\(\)\{string why=Resume!=null\?"remembered stream"/);
 assert.match(cs,/EngineFileNear\(HookTarget\.ExePath\)/,'first play of a known engine keeps early injection');
 assert.match(cs,/StartedSuspended\(Pid\)\)why="started suspended"/);
 assert.match(cs,/!IsHungAppWindow\(w\)|IsHungAppWindow\(w\)\?"window hung"/);assert.match(cs,/SendMessageTimeoutW\(w,0,IntPtr\.Zero,IntPtr\.Zero,2/);
 assert.match(cs,/still "\+missing\+"; injecting as before/,'the log says what was missing');
 const re=/GraphicsModule\(string name\)\{return System\.Text\.RegularExpressions\.Regex\.IsMatch\(name\?\?"",@"([^"]+)"/.exec(cs);assert.ok(re);const g=new RegExp(re[1],'i');
 for(const n of ['d3d9.dll','D3D11.dll','dxgi.dll','d3d12.dll','opengl32.dll','vulkan-1.dll'])assert.ok(g.test(n),n);
 for(const n of ['d3d9x_43.dll','gdi32.dll','d3d11on12.dll'])assert.ok(!g.test(n),n);
 const ef=/EngineFile=new System\.Text\.RegularExpressions\.Regex\(@"([^"]+)"/.exec(cs);assert.ok(ef);const e=new RegExp(ef[1],'i');
 for(const n of ['data.xp3','Rance6.ain','sysgrp.arc','script.mpk','UnityPlayer.dll','Scene.pck','GameAssembly.dll','config.int'])assert.ok(e.test(n),n);
 for(const n of ['fsn2-win64vc14-release.exe','steam_api64.dll','d3dcompiler_47.dll','data.obb'])assert.ok(!e.test(n),n);
});
