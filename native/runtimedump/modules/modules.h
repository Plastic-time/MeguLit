// Feature modules of MeguLitDump32/64.dll (contract: docs/runtime-dump-pack.md). Each module is one .cpp in this folder
// (build.cmd compiles modules\*.cpp) and one MODULE(Name) line below; it defines
//   void Name##Start(const wchar_t *out)  once, after the file hooks are in, with the game's dump folder (ends in '\');
//   void Name##Tick()                     about every 120 ms on the DLL's own watcher thread (keep it cheap).
// Both run under SEH in RuntimeDump.cpp: a module that faults is switched off for the session, the others keep going.
// A module that wants plain buffers (decrypted/decompressed/loose file images) calls DumpSink(fn) in its Start; fn runs
// on the game's threads under SEH with (source file, how, bytes, size) and must copy what it keeps and return fast.
// What the core offers a module (saving, logging, hooks, re-entry guard): modules/dump_api.h.
// Add your line in a commit of its own so parallel branches merge cleanly.
#include <windows.h>
typedef void (*DumpSinkFn)(const char *source, const char *how, const unsigned char *p, DWORD n);
void DumpSink(DumpSinkFn fn);
#define MEGULIT_DUMP_MODULES \
 MODULE(Cg) \
 MODULE(AudioMore) \
 MODULE(Voice) \
 MODULE(Krkr) \
 MODULE(VoiceFile)
