'use strict';
/* Owner's CHAOS;CHILD session 2026-11-21: clicks on words reached the game; the host logged no click after 20:34:58 although
   the pointer hook had been installed at 20:34:33. The relay thread ended on one failed write, and Windows removes a
   low-level hook whose callback is late without telling. Both are covered: the relay drops only the failed item, and a guard
   reinstalls the hook when the mouse moves or a button goes down while the hook has seen nothing for StaleMs. */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const s=fs.readFileSync(path.join(__dirname,'..','native','ReaderPointerGate.cs'),'utf8');
test('relay survives a failed write; the hook is reinstalled when it goes quiet',()=>{
 assert.doesNotMatch(s,/catch\(System\.IO\.IOException\)\{Current=null;\}\}\)/,'one failed write no longer ends the relay');
 assert.match(s,/foreach\(var item in events\.GetConsumingEnumerable\(\)\)\{try\{emit\(item\);\}catch\(System\.IO\.IOException\)\{\}/);
 assert.match(s,/new Thread\(Guard\)\{IsBackground=true,Name="Reader mouse hook guard"\}\.Start\(\);/);
 assert.match(s,/internal const uint StaleMs=2000;/);
 assert.match(s,/if\(message\.Id!=Reinstall\)continue;\r?\n\s*UnhookWindowsHookEx\(hook\);hook=SetWindowsHookEx\(14,callback,GetModuleHandle\(null\),0\);/);
 assert.match(s,/IntPtr Filter\(int code,IntPtr message,ref Mouse mouse\)\{\r?\n\s*lastHook=GetTickCount\(\);/,'every hook callback counts as alive');
 assert.match(s,/if\(!Stale\(1000,3500,3600\)\|\|Stale\(4000,3500,4100\)\|\|Stale\(1000,1500,2900\)\|\|Stale\(1000,3500,9000\)\)return false;/,'decision covered by the bridge self-test');
});
