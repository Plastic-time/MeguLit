// Feature modules of MeguLitDump32/64.dll (contract: docs/runtime-dump-pack.md). Each module is one .cpp in this folder
// (build.cmd compiles modules\*.cpp) and one MODULE(Name) line below; it defines
//   void Name##Start(const wchar_t *out)  once, after the file hooks are in, with the game's dump folder (ends in '\');
//   void Name##Tick()                     about every 120 ms on the DLL's own watcher thread (keep it cheap).
// Both run under SEH in RuntimeDump.cpp: a module that faults is switched off for the session, the others keep going.
// Add your line in a commit of its own so parallel branches merge cleanly.
#define MEGULIT_DUMP_MODULES \
 MODULE(Voice) \
 /* MODULE(Cg) */
