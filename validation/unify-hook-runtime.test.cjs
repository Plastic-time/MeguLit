// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-19 one hook runtime: ISLAND, STEINS;GATE and Siglus had runtimes of their own (runtime/hook-island,
   hook-mages[-e201], hook-siglus) built from an older LunaHook, so they missed every fix of MeguLitHook (embed wait,
   safe unhook, crash witness). Their adapters are now engines of MeguLitHook32 (native/megulithook/MeguLitEngines.h),
   each matching only the program it always matched; HookBridge uses the old folders only for an older MeguLitHook. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('the adapters are engines of MeguLitHook32, listed first, each for its exact program only',()=>{
 const c=read('native/megulithook/enginecollection32.cpp');
 assert.match(c,/#include "MeguLitEngines\.h"/);
 assert.match(c,/return \{\r?\n\s*new ToMeIsland,\r?\n\s*new ToMeSteinsGate,\r?\n\s*new LovaGame,/,'first, then upstream as it was');
 const e=read('native/megulithook/MeguLitEngines.h');
 assert.match(e,/MeguLitMatch::Island\(processName, !_wcsicmp\(processName, L"ISLAND\.exe"\) && ToMeIslandDraw::ExactFile\(\)\)/,'ISLAND: name first, then the whole file hash');
 assert.match(e,/MeguLitMatch::SteinsGate\(processName, pe->FileHeader\.TimeDateStamp\)/,'STEINS;GATE: name and PE time stamp');
 const m=read('native/megulithook/MeguLitMatch.h');
 assert.match(m,/!_wcsicmp\(name, L"Game\.exe"\) && timeDateStamp == 0x5ddf7af0/,'the stamp the dedicated runtime matched');assert.match(m,/!_wcsicmp\(name, L"ISLAND\.exe"\) && exactFile/);
 const y=read('native/megulithook/Yuris.cpp');
 assert.ok(y.indexOf('if (EuphoriaHD474Draw::Install(addr))')>0&&y.indexOf('if (EuphoriaHD474Draw::Install(addr))')<y.indexOf('Yuris6Embed::capacity = Yuris6Embed::ProbeCapacity(addr);'),'euphoria HD before E345, E345 for every other YU-RIS6 game');
 assert.match(read('native/megulithook/EuphoriaHD474Draw.h'),/if\(address!=0x41e3a4\|\|reinterpret_cast<uintptr_t>\(GetModuleHandleW\(nullptr\)\)!=0x400000\|\|!ExactFile\(\)\)return false;/,'exact executable only');
 assert.match(e,/return megulit_sg_hookmages::MAGES\(\);/,'its own MAGES, not upstream hookmages');
 const sg=read('native/megulithook/MeguLitSg.cpp');
 assert.match(sg,/#include "mages\/mages\.h"\r?\n#define mages megulit_sg_mages\r?\n#define hookmages megulit_sg_hookmages/,'upstream header first, then the renamed adapter');
 assert.match(sg,/#include "MeguLitSg_readString\.inc"\r?\n#include "MeguLitSg_mages\.inc"/);
 const island=read('native/megulithook/ToMeIslandDraw.h');assert.match(island,/474CC11D|0x47, ?0x4c|ExactFile/i);
 for(const f of ['build-x86.cmd','build-x64.cmd']){const b=read('native/megulithook/'+f);
  assert.match(b,/ToMeIslandDraw\.h ToMeIslandFlow\.h ToMeTextPos\.h MeguLitSg\.cpp EuphoriaHD474Draw\.h EuphoriaDrawFlow\.h/,f);assert.match(b,/\(enginecollection32\.cpp MeguLitEngines\.h MeguLitMatch\.h\)/,f);
  assert.match(b,/mages\\readString\.cpp" "%MEGULIT_HOOK_TREE%[^"]*MeguLitSg_readString\.inc"/,f);assert.match(b,/mages\\mages\.cpp" "%MEGULIT_HOOK_TREE%[^"]*MeguLitSg_mages\.inc"/,f);
  assert.match(b,/if "%MEGULIT_HOOK_TREE%"=="" set "MEGULIT_HOOK_TREE=E:\\Apps\\work\\megulithook"/,f+': private tree optional, shared tree by default');}
 const run=read('native/megulithook/selftest/run.cmd');assert.match(run,/ToMeCS2_DRAW ToMeSG_EMBED EmbedEuphoria474_DrawHide_TEST2/);assert.match(run,/match\.cpp/);
 const mt=read('native/megulithook/selftest/match.cpp');assert.match(mt,/!MeguLitMatch::SteinsGate\(L"Game\.exe", 0x5a1b2c3d\)/,'other MAGES games proven out');
});
test('HookBridge: MeguLitHook for every game; the old folders only for an older build or without one',()=>{
 const b=read('native/HookBridge.cs');
 assert.match(b,/string root=ChooseRuntime\(Path\.GetFullPath\(Path\.Combine\(AppDomain\.CurrentDomain\.BaseDirectory,"\.\.","runtime"\)\),/);
 assert.match(b,/if\(island&&Directory\.Exists\(at\("hook-island"\)\)&&\(!unified\|\|!MainRuntimeHas\(root,"ToMeCS2_DRAW"\)\)\)root=at\("hook-island"\);/,'ISLAND keeps its folder unless unified');
 assert.match(b,/if\(steinsGate&&Directory\.Exists\(at\("hook-mages"\)\)&&\(!unified\|\|!MainRuntimeHas\(root,"ToMeSG_EMBED"\)\)\)root=/,'STEINS;GATE keeps its folder unless unified');
 assert.match(b,/Environment\.GetEnvironmentVariable\("MEGULIT_UNIFIED_ADAPTERS"\)=="1"/,'unified only on request (never verified on a real game)');
 assert.match(b,/if\(siglus&&Path\.GetFileName\(root\)=="hook-readonly"&&/,'Siglus already on MeguLitHook; its folder only without MeguLitHook');
 assert.match(b,/if\(euphoria&&Directory\.Exists\(at\("hook"\)\)&&\(!unified\|\|!MainRuntimeHas\(root,"EmbedEuphoria474_DrawHide_TEST2"\)\)\)root=at\("hook"\);/,'euphoria HD keeps its folder unless unified');
 const exe=path.join(__dirname,'..','native','HookBridge.exe');
 if(fs.existsSync(exe)&&/RuntimeChoiceSelfTest/.test(b)){const out=execFileSync(exe,['--runtime-choice-self-test'],{windowsHide:true,encoding:'utf8',timeout:30000});assert.match(out,/PASS runtime choice/,out);}
});
test('the shipped MeguLitHook32.dll carries both adapters (after build.cmd)',{skip:!fs.existsSync(path.join(__dirname,'..','native','megulithook','MeguLitHook32.dll'))},()=>{
 const dll=fs.readFileSync(path.join(__dirname,'..','native','megulithook','MeguLitHook32.dll'));
 for(const m of ['ToMeCS2_DRAW','ToMeSG_EMBED','EmbedEuphoria474_DrawHide_TEST2','MeguLit_GDIHIDE armed version=2'])assert.ok(dll.includes(Buffer.from(m,'ascii')),m);
});
