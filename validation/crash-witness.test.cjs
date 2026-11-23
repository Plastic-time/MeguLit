'use strict';
/* 2026-11-19 (千恋＊万花 exited with 0xC000041D while the user tested; no Application Error event, no WER report or dump,
   and KiriKiri's own MiniDumpWriteDump never ran, so nothing said where it failed). 0xC000041D = an exception left a
   user-mode callback (a window or hook procedure the kernel called). The hook DLL now arms a crash witness in every
   game (native/shared/MeguLitCrashWitness.h) and HookBridge files its report; hook procedures in the injected DLLs run
   their work guarded. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const body=(src,name)=>{const at=src.indexOf(name);assert.ok(at>=0,name);const open=src.indexOf('{',at);let depth=0;for(let i=open;i<src.length;i++){if(src[i]==='{')depth++;else if(src[i]==='}'&&--depth===0)return src.slice(open,i+1);}return '';};
const witness=read('native/shared/MeguLitCrashWitness.h'),mainSrc=read('native/megulithook/main.cc');
test('the witness only looks: both handlers pass every exception on, without heap use',()=>{
 const vectored=body(witness,'inline LONG CALLBACK Vectored('),unhandled=body(witness,'inline LONG WINAPI Unhandled(');
 assert.doesNotMatch(vectored,/EXCEPTION_CONTINUE_EXECUTION|EXCEPTION_EXECUTE_HANDLER/);
 assert.match(unhandled,/return s\.previous \? s\.previous\(e\) : EXCEPTION_CONTINUE_SEARCH;/,'the game\'s own filter still runs');
 for(const b of [vectored,unhandled,body(witness,'inline void WriteBlock('),body(witness,'inline void Describe(')])
  assert.doesNotMatch(b,/std::|new |malloc|HeapAlloc|GetModuleFileName|LoadLibrary/,'no heap and no loader lock while an exception is handled');
 assert.match(body(witness,'inline void Describe('),/K32GetMappedFileNameW/);
 assert.match(vectored,/MaxSeen/,'a game that probes with exceptions costs one block per address, then nothing');
});
test('the hook DLL arms the witness on its pipe thread, never in DllMain, and unloads only after releasing it',()=>{
 assert.match(body(mainSrc,'DWORD WINAPI Pipe(LPVOID)'),/^\{\s*MeguLitCrash::Arm\(\);/);
 const dllmain=body(mainSrc,'BOOL WINAPI DllMain(');
 const note=/if \(lpReserved\)[^\n]*\n\s*MeguLitCrash::NoteExit\(\);/;
 assert.match(dllmain,note,'at process exit DllMain notes the exit');
 assert.doesNotMatch(dllmain.replace(note,''),/MeguLitCrash/,'DllMain only notes the exit (no arming, no waiting under the loader lock)');
 assert.doesNotMatch(body(witness,'inline void NoteExit('),/Sleep|Wait|Suspend|LoadLibrary/);
 const pipe=body(mainSrc,'DWORD WINAPI Pipe(LPVOID)');
 const release=pipe.indexOf('MeguLitCrash::Release()'),safe=pipe.indexOf('SafeToUnload()'),unload=pipe.indexOf('FreeLibraryAndExitThread');
 assert.ok(release>=0&&safe>release&&unload>safe,'release the witness, then check no thread is in the DLL, then unload');
 assert.match(pipe,/witnessOff && SafeToUnload\(\)/,'a filter set after ours keeps the DLL loaded');
 for(const f of ['build-x86.cmd','build-x64.cmd'])assert.match(read('native/megulithook/'+f),/MeguLitCrashWitness\.h/);
 const entry=JSON.parse(read('native/native-builds.json')).find(e=>e.name==='megulithook');
 assert.ok(entry.sources.includes('native/shared/MeguLitCrashWitness.h')&&entry.selftests.includes('native/shared/selftest/witness.cmd'));
});
test('HookBridge files the report after a crash exit and names the fault; a clean exit deletes it',()=>{
 const gpu=read('native/GpuHideLayer.cs'),bridge=read('native/HookBridge.cs');
 const collect=body(gpu,'static CrashWitnessInfo CrashWitnessFile(');
 assert.match(collect,/MeguLit-crash/);assert.match(collect,/Under\("logs","crash"\)/);assert.match(collect,/File\.Delete\(t\)/);
 assert.match(gpu,/GpuCanaryExitFile\(f,code,CrashWitnessCollect\(Pid,code\)\)/,'the canary reason carries the fault');
 assert.match(body(bridge,'static void OnDisconnect('),/CrashWitnessCollect\(Pid,/);
});
test('hook procedures in the injected DLLs run their work guarded: nothing may leave a callback the kernel made',()=>{
 /* krkrtext and scncapture hook the game thread's message queue (WH_GETMESSAGE); an exception out of such a procedure
    is 0xC000041D and the engine never sees it */
 const scn=read('native/scncapture/ScnCapture.cpp'),krkr=read('native/krkrtext/KrkrText.cpp');
 const scnProc=body(scn,'LRESULT CALLBACK OnMessage(');
 assert.match(scnProc,/AskStepGuarded\(\)/);assert.doesNotMatch(scnProc,/AskAudio|AskOne|AskText|DumpHx|std::/);
 assert.match(body(scn,'bool AskStepGuarded('),/__try \{ AskStep\(\); return true; \} __except/);
 assert.match(body(krkr,'LRESULT CALLBACK OnMessage('),/TickGuarded\(\)/);
 assert.match(body(krkr,'bool TickSafe('),/__try \{ Tick\(\);/);
});
test('the canary counts only a crash in play, and an off record of another build is tried once more',()=>{
 /* 2026-11-19: the user closed 千恋＊万花, the close ended in 0xC000041D and layer 4 was off for that game for good */
 const gpu=read('native/GpuHideLayer.cs');
 assert.equal((gpu.match(/const bool GpuCanaryRetryOtherBuild=/g)||[]).length,1,'one switch');
 const reason=body(gpu,'static string GpuCanaryOffReason(');
 assert.match(reason,/GpuCanaryCrash\(/);assert.match(reason,/GpuCanaryRetryOtherBuild&&!LearnedHere\(d,build\)/);
 assert.match(body(gpu,'static bool GpuCanaryArmFile('),/GpuCanaryOffReason\(d,BridgeBuild\(\)\)!=""/,'arming and the off answer use the same rule (an ignored #338 record kept the layer off)');
 const exit=body(gpu,'static void GpuCanaryExitFile(');
 assert.ok(exit.indexOf('w.Closing')>=0&&exit.indexOf('w.Closing')<exit.indexOf('e["off"]=true'),'the close flow is decided before anything turns off');
 assert.match(exit,/e\["bridge"\]=BridgeBuild\(\)/);
 const read_=body(gpu,'static CrashWitnessInfo CrashWitnessRead(');
 assert.match(read_,/visible windows=0/);assert.match(read_,/exit: /);
 assert.match(witness,/state: visible windows=%d%s/);
 const self=body(gpu,'public static bool GpuCanarySelfTest(');
 assert.match(self,/visible windows=0/);assert.match(self,/0123456789abcdef0123456789abcdef/);assert.match(self,/retried/);
});
