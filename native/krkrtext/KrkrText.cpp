// SPDX-License-Identifier: GPL-3.0-or-later
// MeguLitKrkr32.dll (E300, user 2026-11-10: on KiriKiri full-screen pages such as ライムライト・レモネードジャム every
// paragraph should be read where the game drew it, as on ISLAND). LunaHook gives only strings; this DLL asks the engine
// itself. It takes the KiriKiri function exporter (exported by the program, or found in the plug-ins' data), and on
// the game's own thread evaluates script.inc through Scripts.eval inside the engine's try block. That script wraps the
// KAG message layers and reports each sentence's position (see script.inc) to a native TJS function defined here,
// which queues the line for a writer thread. The writer sends the lines to HookBridge over the pipe
// \\.\pipe\MeguLitKrkr-<pid>; with no reader the lines are dropped. Every step is guarded: if anything is missing the
// game runs untouched. KiriKiri SDK: native\krkrtext\sdk (tp_stub, W.Dee and contributors, GPL dual license).
#include <windows.h>
#include <objidl.h>
#include <tlhelp32.h>
#include <string>
#include <deque>
#include <map>
#include <set>
#include <vector>
#include <algorithm>
#include "sdk/tp_stub.h"

namespace {
HMODULE Self;
CRITICAL_SECTION Gate;
HANDLE Wake;
std::deque<std::string> Out;
std::string Status;              // last install result, sent again after every (re)connection
volatile LONG Connected;
DWORD GameThread;
HWND GameWindow;
HHOOK MessageHook;
UINT TickMessage;
iTJSDispatch2 *ReportFn;
bool Installed;                  // __megulitKrkrState exists: later ticks only refresh
DWORD LastTick;

std::string Utf8(const wchar_t *s) {
 int n = WideCharToMultiByte(CP_UTF8, 0, s, -1, NULL, 0, NULL, NULL);
 if (n <= 1) return std::string();
 std::string r(n - 1, '\0');
 WideCharToMultiByte(CP_UTF8, 0, s, -1, &r[0], n, NULL, NULL);
 return r;
}
void Push(const std::string &line) {
 if (!Connected) return;
 EnterCriticalSection(&Gate);
 if (Out.size() >= 512) Out.pop_front();
 Out.push_back(line);
 LeaveCriticalSection(&Gate);
 SetEvent(Wake);
}
void SetStatus(const std::string &value) {
 EnterCriticalSection(&Gate); bool changed = value != Status; Status = value; LeaveCriticalSection(&Gate);
 if (changed) Push("ToMe_KRKR status " + value);
}

// The TJS function the script reports through: one string argument, one protocol line.
class ReportFunction : public tTJSDispatch {
public:
 tjs_error TJS_INTF_METHOD FuncCall(tjs_uint32 flag, const tjs_char *membername, tjs_uint32 *hint, tTJSVariant *result,
  tjs_int numparams, tTJSVariant **param, iTJSDispatch2 *objthis) {
  if (membername) return TJS_E_MEMBERNOTFOUND;
  if (result) result->Clear();
  if (numparams >= 1 && param[0]->Type() == tvtString) {
   ttstr value(*param[0]);
   const tjs_char *text = value.c_str();
   if (text && wcsncmp(text, L"ToMe_KRKR ", 10) == 0 && wcslen(text) < 8192) {
    std::string line = Utf8(text);
    for (char &c : line) if (c == '\n') c = '\x1f'; else if (c == '\r') c = ' '; // one protocol line; HookBridge restores the breaks
    Push(line);
   }
  }
  return TJS_S_OK;
 }
};

// ---- the exporter ---------------------------------------------------------------------------------------------------
bool Executable(uintptr_t p) {
 MEMORY_BASIC_INFORMATION m;
 return p && VirtualQuery((void *)p, &m, sizeof m) && m.State == MEM_COMMIT &&
  (m.Protect & (PAGE_EXECUTE | PAGE_EXECUTE_READ | PAGE_EXECUTE_READWRITE | PAGE_EXECUTE_WRITECOPY)) && !(m.Protect & PAGE_GUARD);
}
bool ReadPtr(const void *at, uintptr_t *v) { __try { *v = *(const uintptr_t *)at; return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; } }
#ifdef _M_IX86
// Calls exporter->QueryFunctionsByNarrowString and measures who cleaned the stack: 16 bytes left for the caller is
// the cdecl interface this DLL is built for (TJS2 2.4.14 and later, every KiriKiri Z); 0 is an old stdcall engine.
__declspec(naked) unsigned __cdecl QueryMeasured(void *fn, void *self, const char **names, void **out, unsigned count, unsigned *ok) {
 __asm {
  push ebp
  mov ebp, esp
  push ebx
  push esi
  mov ebx, esp
  push dword ptr [ebp + 24]
  push dword ptr [ebp + 20]
  push dword ptr [ebp + 16]
  push dword ptr [ebp + 12]
  call dword ptr [ebp + 8]
  movzx eax, al
  mov esi, dword ptr [ebp + 28]
  mov dword ptr [esi], eax
  mov eax, ebx
  sub eax, esp
  mov esp, ebx
  pop esi
  pop ebx
  pop ebp
  ret
 }
}
#endif
// 1: answers the name with a code pointer through a cdecl interface; 0: no; -1: answers, but stdcall (unsupported).
int Probe(void *exporter, const char *name) {
 __try {
  uintptr_t vt, method;
  if (!ReadPtr(exporter, &vt) || !ReadPtr((void *)(vt + sizeof(void *)), &method) || !Executable(method)) return 0;
  const char *names[1] = {name};
  void *fn = NULL;
#ifdef _M_IX86
  unsigned ok = 0, left = QueryMeasured((void *)method, exporter, names, &fn, 1, &ok);
  if (!ok || !Executable((uintptr_t)fn)) return 0;
  return left == 16 ? 1 : left == 0 ? -1 : 0;
#else
  typedef bool(__cdecl * QueryFn)(void *, const char **, void **, unsigned);
  return ((QueryFn)method)(exporter, names, &fn, 1) && Executable((uintptr_t)fn) ? 1 : 0;
#endif
 } __except (EXCEPTION_EXECUTE_HANDLER) { return 0; }
}
const char *const Needed[] = {
 "iTJSDispatch2 * ::TVPGetScriptDispatch()",
 "void ::TVPDoTryBlock(tTVPTryBlockFunction,tTVPCatchBlockFunction,tTVPFinallyBlockFunction,void *)",
 "tTJSVariantString * ::TJSAllocVariantString(const tjs_char *)",
 "void tTJSVariantString::Release()",
 // Every SDK function this DLL reaches (listed by selftest\host.cpp with MEGULIT_TRACE=1): checked before anything runs
 // in the game, so an engine without one is left alone instead of failing inside a call.
 "tTJSVariant::tTJSVariant()",
 "tTJSVariant::tTJSVariant(iTJSDispatch2 *,iTJSDispatch2 *)",
 "tTJSVariant::tTJSVariant(const tjs_char *)",
 "tTJSVariant::~ tTJSVariant()",
 "void tTJSVariant::Clear()",
 "tTJSVariantType tTJSVariant::Type()",
 "tTJSVariantType tTJSVariant::Type() const",
 "iTJSDispatch2 * tTJSVariant::AsObjectNoAddRef() const",
 "tTJSString::tTJSString(const tTJSVariant &)",
 "const tjs_char * tTJSString::c_str() const",
 "tTJSString::~ tTJSString()",
};
// Values in a module's writable data that point at an object whose first field is a table of code pointers.
int ScanModule(HMODULE m, uintptr_t *out, int cap) {
 int n = 0;
 __try {
  auto dos = (IMAGE_DOS_HEADER *)m; auto nt = (IMAGE_NT_HEADERS *)((char *)m + dos->e_lfanew);
  auto sec = IMAGE_FIRST_SECTION(nt);
  for (int i = 0; i < nt->FileHeader.NumberOfSections; i++, sec++) {
   if (!(sec->Characteristics & IMAGE_SCN_MEM_WRITE) || (sec->Characteristics & IMAGE_SCN_MEM_EXECUTE)) continue;
   uintptr_t *p = (uintptr_t *)((char *)m + sec->VirtualAddress), *end = p + sec->Misc.VirtualSize / sizeof(uintptr_t);
   for (; p < end && n < cap; p++) {
    uintptr_t v = *p, vt, f0, f1;
    if (v < 0x10000) continue;
    bool dup = false; for (int k = 0; k < n && !dup; k++) dup = out[k] == v;
    if (dup) continue;
    if (!ReadPtr((void *)v, &vt) || !ReadPtr((void *)vt, &f0) || !ReadPtr((void *)(vt + sizeof(void *)), &f1)) continue;
    if (Executable(vt) || !Executable(f0) || !Executable(f1)) continue;
    out[n++] = v;
   }
  }
 } __except (EXCEPTION_EXECUTE_HANDLER) {}
 return n;
}
void *CallGuarded(void *(__stdcall *get)()) { __try { return get(); } __except (EXCEPTION_EXECUTE_HANDLER) { return NULL; } }
// The program's own TVPGetFunctionExporter export, else the value most plug-ins keep (the way MeguLitScn finds it).
void *FindExporter(std::string &why) {
 typedef void *(__stdcall * GetFn)();
 GetFn get = (GetFn)GetProcAddress(GetModuleHandleW(NULL), "TVPGetFunctionExporter");
 std::vector<void *> candidates;
 if (get) { void *e = CallGuarded(get); if (e) candidates.push_back(e); }
 if (candidates.empty()) {
  HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, GetCurrentProcessId());
  if (snap != INVALID_HANDLE_VALUE) {
   std::map<uintptr_t, int> votes; int plugins = 0;
   MODULEENTRY32W me; me.dwSize = sizeof me;
   HMODULE main = GetModuleHandleW(NULL);
   static uintptr_t found[4096];
   for (BOOL ok = Module32FirstW(snap, &me); ok; ok = Module32NextW(snap, &me)) {
    if (me.hModule == main || me.hModule == Self || !GetProcAddress(me.hModule, "V2Link")) continue;
    plugins++;
    int n = ScanModule(me.hModule, found, 4096);
    std::set<uintptr_t> seen(found, found + n);
    for (auto v : seen) votes[v]++;
   }
   CloseHandle(snap);
   std::vector<std::pair<int, uintptr_t>> ranked;
   for (auto &kv : votes) if (kv.second >= 2 && kv.second * 2 >= plugins) ranked.push_back({kv.second, kv.first});
   std::sort(ranked.rbegin(), ranked.rend());
   for (size_t i = 0; i < ranked.size() && i < 4; i++) candidates.push_back((void *)ranked[i].second);
  }
 }
 for (void *e : candidates) {
  bool all = true;
  for (const char *name : Needed) {
   int r = Probe(e, name);
   if (r < 0) { why = "stdcall engine interface (KiriKiri 2 before 2.25) is not supported"; return NULL; }
   if (r == 0) { all = false; break; }
  }
  if (all) return e;
 }
 why = get ? "the exporter lacks a needed function" : "no KiriKiri function exporter";
 return NULL;
}

// ---- running the script on the game thread ----------------------------------------------------------------------------
const wchar_t *Script =
#include "script.inc"
;
struct EvalCall { const wchar_t *source; std::wstring *result; std::wstring *error; };
void TJS_USERENTRY EvalTry(void *data) {
 EvalCall *c = (EvalCall *)data;
 iTJSDispatch2 *global = TVPGetScriptDispatch();
 if (!global) { *c->error = L"no global"; return; }
 if (ReportFn) {
  tTJSVariant fn(ReportFn, ReportFn);
  global->PropSet(TJS_MEMBERENSURE, L"__megulitKrkrReport", NULL, &fn, global);
 }
 tTJSVariant scripts;
 if (TJS_FAILED(global->PropGet(0, L"Scripts", NULL, &scripts, global)) || scripts.Type() != tvtObject) { global->Release(); *c->error = L"no Scripts"; return; }
 iTJSDispatch2 *s = scripts.AsObjectNoAddRef();
 tTJSVariant source(c->source), result, *args[1] = {&source};
 tjs_error e = s->FuncCall(0, L"eval", NULL, &result, 1, args, s);
 global->Release();
 if (TJS_FAILED(e)) { *c->error = L"eval failed"; return; }
 if (result.Type() == tvtString) *c->result = ttstr(result).c_str();
 else *c->result = L"(not a string)";
}
bool TJS_USERENTRY EvalCatch(void *data, const tTVPExceptionDesc &desc) {
 EvalCall *c = (EvalCall *)data;
 *c->error = L"exception " + std::wstring(desc.message.c_str());
 return false; // handled: never rethrown through the engine
}
void Tick() {
 std::wstring result, error;
 EvalCall call{Installed ? L"(global.__megulitKrkrState!==void)?global.__megulitKrkrState.refresh():'lost'" : Script, &result, &error};
 TVPDoTryBlock(EvalTry, EvalCatch, NULL, &call);
 std::string status = Utf8((error.empty() ? result : error).c_str());
 if (error.empty() && result.compare(0, 3, L"ok ") == 0) Installed = true;
 if (result == L"lost") Installed = false;
 SetStatus(status);
}
bool TickSafe() { __try { Tick(); return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; } }
void TickGuarded() { if (!TickSafe()) { TickMessage = 0; SetStatus("crashed; stopped"); } }
LRESULT CALLBACK OnMessage(int code, WPARAM w, LPARAM l) {
 MSG *m = (MSG *)l;
 if (code >= 0 && w == PM_REMOVE && TickMessage && m->message == TickMessage) { m->message = WM_NULL; TickGuarded(); }
 return CallNextHookEx(MessageHook, code, w, l);
}
BOOL CALLBACK OwnWindow(HWND h, LPARAM out) {
 DWORD pid = 0, tid = GetWindowThreadProcessId(h, &pid);
 RECT r;
 if (pid == GetCurrentProcessId() && IsWindowVisible(h) && GetWindowRect(h, &r) && r.right - r.left >= 320 && r.bottom - r.top >= 200) {
  ((HWND *)out)[0] = h; return FALSE;
 }
 return TRUE;
}

// ---- the pipe to HookBridge -------------------------------------------------------------------------------------------
DWORD WINAPI Writer(void *) {
 wchar_t name[64]; swprintf_s(name, L"\\\\.\\pipe\\MeguLitKrkr-%lu", GetCurrentProcessId());
 HANDLE pipe = INVALID_HANDLE_VALUE;
 for (;;) {
  WaitForSingleObject(Wake, 1000);
  if (pipe == INVALID_HANDLE_VALUE) {
   pipe = CreateFileW(name, GENERIC_WRITE, 0, NULL, OPEN_EXISTING, 0, NULL);
   if (pipe == INVALID_HANDLE_VALUE) continue;
   EnterCriticalSection(&Gate); Out.clear(); if (!Status.empty()) Out.push_back("ToMe_KRKR status " + Status); LeaveCriticalSection(&Gate);
   InterlockedExchange(&Connected, 1);
  }
  std::deque<std::string> batch;
  EnterCriticalSection(&Gate); batch.swap(Out); LeaveCriticalSection(&Gate);
  for (auto &line : batch) {
   std::string data = line + "\n";
   DWORD done = 0;
   if (!WriteFile(pipe, data.data(), (DWORD)data.size(), &done, NULL) || done != data.size()) {
    CloseHandle(pipe); pipe = INVALID_HANDLE_VALUE; InterlockedExchange(&Connected, 0); break;
   }
  }
 }
}

DWORD WINAPI Run(void *) {
 HANDLE writer = CreateThread(NULL, 0, Writer, NULL, 0, NULL);
 if (writer) CloseHandle(writer);
 std::string why;
 void *exporter = NULL;
 for (int tries = 0; tries < 30 && !exporter; tries++) {
  exporter = FindExporter(why);
  if (!exporter && why.find("stdcall") != std::string::npos) break;
  if (!exporter) Sleep(2000);
 }
 if (!exporter) { SetStatus("off: " + why); return 0; }
 if (!TVPInitImportStub((iTVPFunctionExporter *)exporter)) { SetStatus("off: stub"); return 0; }
 ReportFn = new ReportFunction();
 TickMessage = RegisterWindowMessageW(L"MeguLitKrkrTick-v1");
 for (;;) {
  Sleep(Installed ? 3000 : 1000);
  if (!TickMessage) return 0;
  HWND window[1] = {NULL};
  EnumWindows(OwnWindow, (LPARAM)window);
  if (!window[0]) continue;
  DWORD tid = GetWindowThreadProcessId(window[0], NULL);
  if (tid != GameThread || !MessageHook) {
   if (MessageHook) UnhookWindowsHookEx(MessageHook);
   MessageHook = SetWindowsHookExW(WH_GETMESSAGE, OnMessage, NULL, tid);
   GameThread = tid; GameWindow = window[0];
   if (!MessageHook) { SetStatus("off: no message hook"); continue; }
  }
  PostMessageW(window[0], TickMessage, 0, 0);
 }
}
} // namespace

BOOL WINAPI DllMain(HINSTANCE h, DWORD reason, void *) {
 if (reason == DLL_PROCESS_ATTACH) {
  Self = h; DisableThreadLibraryCalls(h);
  InitializeCriticalSection(&Gate);
  Wake = CreateEventW(NULL, FALSE, FALSE, NULL);
  // Pinned: the wrappers in the game's scripts call into this module until the game exits.
  HMODULE pin; GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_PIN, (LPCWSTR)&DllMain, &pin);
  HANDLE t = CreateThread(NULL, 0, Run, NULL, 0, NULL);
  if (t) CloseHandle(t);
 }
 return TRUE;
}
