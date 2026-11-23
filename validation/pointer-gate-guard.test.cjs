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
 assert.match(s,/var replacement=SetWindowsHookEx\(14,callback,GetModuleHandle\(null\),0\);[\s\S]+?if\(replacement!=IntPtr\.Zero\)\{UnhookWindowsHookEx\(hook\);hook=replacement;\}/);
 assert.match(s,/hookThread!=0&&inputChanged&&Stale\(lastHook,now,now\)/,'idle after a healthy movement does not reinstall the hook');
 assert.match(s,/IntPtr Filter\(int code,IntPtr message,ref Mouse mouse\)\{\r?\n\s*lastHook=GetTickCount\(\);/,'every hook callback counts as alive');
 assert.match(s,/if\(!Stale\(1000,3500,3600\)\|\|Stale\(4000,3500,4100\)\|\|Stale\(1000,1500,2900\)\|\|Stale\(1000,3500,9000\)\)return false;/,'decision covered by the bridge self-test');
});
test('an open or pinned Alt+T menu keeps the pointer gate on (STEINS;GATE 2026-11-21)',()=>{
 const g=fs.readFileSync(path.join(__dirname,'..','native','GalWindowBridge.cs'),'utf8');
 assert.match(g,/internal static bool PointerGateOn\(bool translation,bool menuOpen,bool overlay,bool shown\)\{return translation&&overlay&&shown;\}/);
 assert.match(g,/if\(!PointerGateOn\(TranslationMode,MenuOpen,Overlay!=IntPtr\.Zero,IsShown\)\|\|!GetClientRect\(Overlay,out client\)\)\{/);
 assert.doesNotMatch(g,/if\(!TranslationMode\|\|MenuOpen\|\|Overlay==IntPtr\.Zero\|\|!IsShown/,'the menu no longer switches the gate off');
 assert.match(s,/GalWindowBridge\.PointerGateOn\(true,true,true,true\)/,'covered by the bridge self-test');
});
