'use strict';
/* 2026-11-19 (perf/minhook-freeze; user complaint: the game stalls once MeguLit hooks it). MinHook froze the game's threads
   for every MH_EnableHook / MH_DisableHook and found them with a snapshot of every thread on the system (90-110 ms each on
   the development PC; MeguLitFont's 11 GDI hooks alone took over a second on the game's thread). One patched copy now
   serves every injected DLL; installs that come in batches are queued and switched on with one freeze. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ROOT=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(ROOT,f),'utf8').replace(/\r\n/g,'\n');
const hookC=read('native/shared/minhook/src/hook.c');
test('one MinHook copy, patched to walk only this process\'s threads (the snapshot is the fallback)',()=>{
 for(const old of ['native/scncapture/minhook','native/runtimedump/minhook'])assert.ok(!fs.existsSync(path.join(ROOT,old)),old+' is gone');
 const enumerate=hookC.slice(hookC.indexOf('static BOOL EnumerateThreads(PFROZEN_THREADS pThreads)\n')>=0?hookC.indexOf('static BOOL EnumerateThreads(PFROZEN_THREADS pThreads)\n'):hookC.indexOf('static BOOL EnumerateThreads(PFROZEN_THREADS pThreads)'));
 assert.match(hookC,/MeguLit local patch/);assert.match(hookC,/"NtGetNextThread"/);
 assert.match(enumerate,/int own = EnumerateOwnThreads\(pThreads\);\s*if \(own >= 0\)\s*return own == 1;\s*return EnumerateThreadsSnapshot\(pThreads\);/);
 assert.match(read('THIRD-PARTY.md'),/native\/shared\/minhook\/[\s\S]*Local patch \(MeguLit, 2026-11-19/);
 for(const f of ['native/fontdot/build.cmd','native/fontprobe/build.cmd','native/gpuhide/build.cmd','native/borderless/build.cmd','native/scncapture/build.cmd','native/runtimedump/build.cmd'])assert.match(read(f),/\.\.\\shared\\minhook\\src\\hook\.c/,f);
 for(const f of ['native/megulithook/build-x86.cmd','native/megulithook/build-x64.cmd'])assert.match(read(f),/FETCHCONTENT_SOURCE_DIR_MINHOOK="%~dp0\.\.\\shared\\minhook"/,f);
 assert.ok(fs.existsSync(path.join(ROOT,'native/shared/minhook/CMakeLists.txt')),'the LunaHook build takes the same copy');
});
test('batches are queued and switched on with one freeze',()=>{
 const probe=read('native/fontprobe/FontProbe.cpp'),gpu=read('native/gpuhide/GpuHide.cpp');
 assert.doesNotMatch(probe,/MH_EnableHook\(/);assert.match(probe,/MH_QueueEnableHook\(fn\)/);assert.match(probe,/if \(!Apply\(\)\) n = 0;\n Send\("ToMe_FONT status gdi hooks "/);
 for(const f of ['native/gpuhide/GpuHide.cpp','native/gpuhide/GpuHide11.h','native/gpuhide/GpuHideGL.h','native/gpuhide/FontDots.h'])assert.doesNotMatch(read(f).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g,''),/MH_EnableHook\(/,f);
 assert.match(gpu,/static bool Apply\(\) \{ return MH_ApplyQueued\(\) == MH_OK; \}/);assert.match(gpu,/if \(!Apply\(\)\) HookCount = 0;\n return devices;/);
});
test('hook search frees its hooks only through the shared quiet check',()=>{
 const f=read('native/megulithook/hookfinder.cc'),end=f.slice(f.indexOf('MH_QueueDisableHook((void *)addr);'));
 assert.doesNotMatch(end.slice(0,end.indexOf('VirtualFree')).replace(/\/\*[\s\S]*?\*\//g,''),/Sleep\(1000\)/);
 assert.ok(end.indexOf('MeguLitUnhook::WaitQuiet(')<end.indexOf('MH_RemoveHook('),'quiet check before the free');
 assert.match(end,/memory is kept, not freed/);
 for(const b of ['native/megulithook/build-x86.cmd','native/megulithook/build-x64.cmd'])assert.match(read(b),/veh_hook\.cpp hookfinder\.cc[ )]/);
});
test('the shared native self-test runs 100 rounds unless MEGULIT_SELFTEST_FULL=1, and guards the freeze time',()=>{
 const s=read('native/shared/selftest/unhook-stress.cpp');assert.match(s,/MEGULIT_SELFTEST_FULL[^\n]*\? 1000 : 100;/);
 assert.match(read('native/shared/selftest/run.cmd'),/bench%%B\.exe" \|\| exit \/b 1/);
 assert.match(read('native/shared/selftest/minhook-bench.cpp'),/if \(queuedFreeze > 30\)/);
});
