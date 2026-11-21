'use strict';
/* 2026-11-19 (死に逝く君、館に芽吹く憎悪 exited with 0xC000041D at one fixed non-module address when Alt+M bound the game
   about 9 s after start): removing a text hook freed MinHook's trampoline while the game thread was still in the hook
   stub (useCount only covers the body of Send). Every removal in the hook DLL now goes through the shared flow in
   native/shared/MeguLitSafeUnhook.h: disable, wait for the counters, check with every other thread suspended at once,
   free only then, otherwise keep the memory. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const texthook=read('native/megulithook/texthook.cc'),shared=read('native/shared/MeguLitSafeUnhook.h');
const mainSrc=read('native/megulithook/main.cc'),embed=read('native/megulithook/embed_util.cc'),veh=read('native/megulithook/veh_hook.cpp');
const body=(src,name)=>{const at=src.indexOf(name);assert.ok(at>=0,name);const open=src.indexOf('{',at);let depth=0;for(let i=open;i<src.length;i++){if(src[i]==='{')depth++;else if(src[i]==='}'&&--depth===0)return src.slice(open,i+1);}return '';};
test('a text hook is removed through the shared flow: disable, wait for useCount, then the quiet check frees or keeps it',()=>{
 const remove=body(texthook,'void TextHook::RemoveHookCode()');
 const disable=remove.indexOf('MH_DisableHook'),wait=remove.indexOf('useCount != 0'),safe=remove.indexOf('MeguLitUnhook::RemoveMinHook(');
 assert.ok(disable>=0&&wait>disable&&safe>wait,'disable, wait for useCount, then the shared removal');
 assert.doesNotMatch(remove,/MH_RemoveHook\(/,'never frees the trampoline directly');
 assert.match(remove,/trampoline \+ original_offset/);assert.match(remove,/sizeof\(common_hook\)/);assert.match(remove,/&useCount/);
});
test('hooking an address again first frees a kept hook there and cannot loop forever',()=>{
 const insert=body(texthook,'bool TextHook::InsertHookCode()');
 assert.ok(insert.indexOf('RetryKept(location)')>=0&&insert.indexOf('RetryKept(location)')<insert.indexOf('MH_CreateHook'));
 assert.match(insert,/tries\+\+ < \d/);
});
test('the quiet check suspends every other thread at once, without heap use, and looks at ip, stack and counters',()=>{
 const quiet=body(shared,'inline bool Quiet('),inside=body(shared,'inline bool ThreadInside(');
 assert.ok(quiet.indexOf('OpenOtherThreads(')<quiet.indexOf('SuspendThread'),'threads are opened before any is suspended');
 assert.match(quiet,/ResumeThread/);assert.match(quiet,/ThreadInside\(held\[i\]/);assert.match(quiet,/CountsZero\(counts/);
 assert.match(inside,/InSpans\(ip,/);assert.match(inside,/InSpans\(v,/);
 for(const b of [quiet,inside])assert.doesNotMatch(b,/std::vector|new |malloc|HeapAlloc|printf/,'no heap use while threads are suspended');
 assert.match(quiet,/if \(allAtOnce\)/,'one thread at a time unless a consistent picture is needed');
 /* #468 / P0 (寒蝉 dump 2026-11-20): suspending every thread at once for the unload check could freeze the game for good; after its host goes the DLL stays loaded with its hooks off (next host: MeguLitRehijack) and never suspends threads on that path */
 { const unload=body(mainSrc,'static bool SafeToUnload('); assert.match(unload,/^\s*\{[^]*?return false;\s*\}?\s*$/,'the DLL does not unload after its host goes'); assert.doesNotMatch(unload,/WaitQuiet|SuspendThread/,'no thread is suspended on the unload path'); }
 assert.match(body(shared,'inline bool OpenOtherThreads('),/NtGetNextThread/,'only this process\'s threads are walked');
});
test('the shared removal frees only after a quiet check and keeps the memory otherwise',()=>{
 const remove=body(shared,'inline bool RemoveMinHook(');
 const wait=remove.indexOf('WaitQuiet('),free=remove.indexOf('MH_RemoveHook(');
 assert.ok(remove.indexOf('MH_DisableHook')<wait&&wait<free,'disable, quiet check, free');
 assert.match(remove,/KeptTable\(\)/,'not quiet: kept for RetryKept');
});
test('detaching never frees hooks before the safe flow, and DllMain does no hook work under the loader lock',()=>{
 const pipe=body(mainSrc,'DWORD WINAPI Pipe(LPVOID)');
 const clear=pipe.indexOf('hook.Clear()'),safe=pipe.indexOf('SafeToUnload()'),uninit=pipe.indexOf('MH_Uninitialize()'),unload=pipe.indexOf('FreeLibraryAndExitThread');
 assert.ok(clear>=0&&safe>clear&&uninit>safe&&unload>uninit,'clear hooks safely, check, then uninitialize and unload');
 assert.match(pipe,/return Pipe\(0\);\s*}\s*}\s*$/,'not safe to unload: stay loaded and wait for the next host');
 const dllmain=body(mainSrc,'BOOL WINAPI DllMain(');const detach=dllmain.slice(dllmain.indexOf('DLL_PROCESS_DETACH'));
 assert.doesNotMatch(detach,/detachall|MH_Uninitialize|MH_DisableHook|WaitQuiet|SuspendThread/);
 assert.match(detach,/lpReserved \|\| !SafelyDetached/);
});
test('replaced functions are removed through the shared flow too',()=>{
 assert.match(body(embed,'static bool RemoveReplaced('),/MeguLitUnhook::RemoveMinHook\(target, original, &body/);
 const detach=body(embed,'bool detachall()');assert.doesNotMatch(detach,/MH_RemoveHook|MH_DisableHook/);assert.match(detach,/RemoveReplaced\(/);
 const replace=body(embed,'bool ReplaceFunction(');assert.ok(replace.indexOf('RetryKept(oldf)')<replace.indexOf('MH_CreateHook'));
});
test('a breakpoint hit just before its hook was removed runs the restored instruction instead of crashing',()=>{
 assert.match(body(veh,'static void RemoveNode('),/RememberRemoved\(node->origFunc\)/);
 assert.match(veh,/return WasRemovedHere\(Addr\) \? EXCEPTION_CONTINUE_EXECUTION : EXCEPTION_CONTINUE_SEARCH;/);
 assert.match(body(mainSrc,'DWORD WINAPI Pipe(LPVOID)'),/veh_release_late\(\);\s*FreeLibraryAndExitThread/);
});
test('the other injected DLLs never free hook memory and stay loaded; new unhook code there must use the shared flow',()=>{
 /* fontdot, gpuhide, krkrtext and MeguLitFont install their hooks once and pin themselves (GET_MODULE_HANDLE_EX_FLAG_PIN):
    nothing is ever freed under a thread. A removal added later has to go through native/shared/MeguLitSafeUnhook.h. */
 const dirs={fontdot:['FontDot.cpp'],gpuhide:fs.readdirSync(path.join(__dirname,'..','native','gpuhide')).filter(f=>/\.(cpp|h)$/.test(f)),krkrtext:['KrkrText.cpp'],fontprobe:['FontProbe.cpp','GlyphMatch.h']};
 for(const [dir,files] of Object.entries(dirs)){
  const src=files.map(f=>read(`native/${dir}/${f}`)).join('\n');
  assert.match(src,/GET_MODULE_HANDLE_EX_FLAG_PIN/,`${dir} pins itself`);
  if(!/MeguLitSafeUnhook\.h/.test(src))assert.doesNotMatch(src,/MH_RemoveHook|MH_DisableHook|MH_Uninitialize|VirtualFree\(|FreeLibrary/,`${dir}: unhook code without the shared flow`);
 }
});
