// SPDX-License-Identifier: GPL-3.0-or-later
// MeguLitScn32/64.dll (E293, user 2026-11-10: zero-latency bilingual for KiriKiri Z games with strong archive
// encryption, first サノバウィッチ). Instead of breaking each game's cipher, the scene files are taken after the engine
// itself has decrypted them: KiriKiri Z hands every plug-in a function exporter, and the PSB plug-in (psbfile.dll)
// opens .scn scene files through the exporter's TVPCreateIStream. This DLL finds the exporter (the pointer every
// plug-in keeps), hooks that one function, and when a .scn is opened for reading copies the stream's bytes to
// <MeguLit>\cache\kirikiri-scn\<game key>\ (never into the game folder). services/original-engines/scenes.cjs
// (kirikiri-dump) reads that folder. Scenes the game has not opened yet are asked for once, one at a time on the game's
// own thread, from the names MeguLit writes to want.txt. Every step is guarded: on any failure the game runs untouched.
#include <windows.h>
#include <objidl.h>
#include <tlhelp32.h>
#include <stdio.h>
#include <stdlib.h>
#include <string>
#include <vector>
#include <set>
#include <map>
#include <deque>
#include <algorithm>
#include "minhook/include/MinHook.h"

namespace {
// TJS string (tTJSVariantString): a ttstr is one pointer to this.
struct VariantString { int RefCount; wchar_t *LongString; wchar_t ShortString[22]; int Length; unsigned HeapFlag; unsigned Hint; };
typedef IStream *(__stdcall *CreateIStreamFn)(const void *name, unsigned flags);
typedef bool(__stdcall *ExistsFn)(const void *name);
typedef bool(__cdecl *QueryNarrowFn)(void *self, const char **names, void **functions, unsigned count);

HMODULE Self;
wchar_t Out[1024];
CRITICAL_SECTION Gate;
HANDLE Wake;
DWORD Tls = TLS_OUT_OF_INDEXES;
CreateIStreamFn Original, Target;
ExistsFn Exists;
volatile LONG LayoutOk, MainThread;
std::set<std::wstring> Done;     // lower-case file names already in the folder
std::set<std::wstring> Asked;    // names from want.txt already tried
std::deque<std::wstring> Wanted; // names still to open on the game thread
struct Pending { std::wstring name, full; char *data; DWORD size; bool asked; };
std::vector<Pending> Queue;
HHOOK MessageHook;
DWORD LastAsk;

std::string Utf8(const std::wstring &s) {
 int n = WideCharToMultiByte(CP_UTF8, 0, s.c_str(), (int)s.size(), NULL, 0, NULL, NULL);
 std::string r(n, '\0');
 if (n) WideCharToMultiByte(CP_UTF8, 0, s.c_str(), (int)s.size(), &r[0], n, NULL, NULL);
 return r;
}
std::wstring Wide(const std::string &s) {
 int n = MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), NULL, 0);
 std::wstring r(n, L'\0');
 if (n) MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), &r[0], n);
 return r;
}
std::wstring Lower(std::wstring s) { for (auto &c : s) if (c >= L'A' && c <= L'Z') c = (wchar_t)(c + 32); return s; }
void Append(const wchar_t *file, const std::string &line, DWORD cap) {
 std::wstring path = std::wstring(Out) + file;
 HANDLE h = CreateFileW(path.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_ALWAYS, 0, NULL);
 if (h == INVALID_HANDLE_VALUE) return;
 if (GetFileSize(h, NULL) < cap) { DWORD w; WriteFile(h, line.data(), (DWORD)line.size(), &w, NULL); }
 CloseHandle(h);
}
void Log(const std::string &line) {
 SYSTEMTIME t; GetLocalTime(&t);
 char stamp[32]; sprintf_s(stamp, "%02d:%02d:%02d.%03d ", t.wHour, t.wMinute, t.wSecond, t.wMilliseconds);
 Append(L"capture.log", stamp + line + "\r\n", 1 << 20);
}
bool WriteWhole(const std::wstring &path, const void *data, DWORD size) {
 std::wstring tmp = path + L".tmp";
 HANDLE h = CreateFileW(tmp.c_str(), GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, 0, NULL);
 if (h == INVALID_HANDLE_VALUE) return false;
 DWORD w = 0; BOOL ok = WriteFile(h, data, size, &w, NULL) && w == size;
 CloseHandle(h);
 if (!ok || !MoveFileExW(tmp.c_str(), path.c_str(), MOVEFILE_REPLACE_EXISTING)) { DeleteFileW(tmp.c_str()); return false; }
 return true;
}

// ---- reading engine data, every access guarded ----------------------------------------------------------------
bool NameOf(const void *ref, wchar_t *out, int cap, bool *layout) {
 __try {
  const VariantString *p = *(VariantString *const *)ref;
  if (!p) return false;
  const wchar_t *s = p->LongString ? p->LongString : p->ShortString;
  int n = 0;
  while (n < cap - 1 && s[n]) { out[n] = s[n]; n++; }
  if (n >= cap - 1) return false;
  out[n] = 0;
  *layout = p->Length == n;
  return n > 0;
 } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
// The whole stream from its start; the read position is put back so the game reads it as if untouched.
char *ReadAll(IStream *s, DWORD *size) {
 char *buf = NULL;
 ULARGE_INTEGER cur; cur.QuadPart = 0;
 bool moved = false;
 __try {
  LARGE_INTEGER zero; zero.QuadPart = 0;
  ULARGE_INTEGER end;
  if (FAILED(s->Seek(zero, STREAM_SEEK_CUR, &cur)) || FAILED(s->Seek(zero, STREAM_SEEK_END, &end))) return NULL;
  moved = true;
  ULONGLONG n = end.QuadPart;
  if (n && n <= (64u << 20) && SUCCEEDED(s->Seek(zero, STREAM_SEEK_SET, NULL))) {
   buf = (char *)malloc((size_t)n);
   ULONG total = 0;
   while (buf && total < n) { ULONG got = 0; if (FAILED(s->Read(buf + total, (ULONG)(n - total), &got)) || !got) break; total += got; }
   if (buf && total == n) *size = total; else { free(buf); buf = NULL; }
  }
  LARGE_INTEGER back; back.QuadPart = (LONGLONG)cur.QuadPart;
  s->Seek(back, STREAM_SEEK_SET, NULL);
  return buf;
 } __except (EXCEPTION_EXECUTE_HANDLER) {
  if (moved) { __try { LARGE_INTEGER back; back.QuadPart = (LONGLONG)cur.QuadPart; s->Seek(back, STREAM_SEEK_SET, NULL); } __except (EXCEPTION_EXECUTE_HANDLER) {} }
  return NULL;
 }
}
IStream *OpenGuarded(const void *ref) {
 __try { return Exists(ref) ? Original(ref, 0) : NULL; } __except (EXCEPTION_EXECUTE_HANDLER) { return NULL; }
}
void ReleaseGuarded(IStream *s) { __try { s->Release(); } __except (EXCEPTION_EXECUTE_HANDLER) {} }
bool QueryGuarded(void *exporter, const char *name, void **fn) {
 __try {
  void **vt = *(void ***)exporter;
  const char *names[1] = {name};
  *fn = NULL;
  return ((QueryNarrowFn)vt[1])(exporter, names, fn, 1) && *fn;
 } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
bool ReadPtr(const void *at, uintptr_t *v) { __try { *v = *(const uintptr_t *)at; return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; } }

// ---- the hook ---------------------------------------------------------------------------------------------------
bool IsScene(const wchar_t *name) { size_t n = wcslen(name); return n > 4 && !_wcsicmp(name + n - 4, L".scn"); }
std::wstring BaseOf(const wchar_t *full) {
 const wchar_t *b = full;
 for (const wchar_t *p = full; *p; p++) if (*p == L'/' || *p == L'\\' || *p == L'>' || *p == L':') b = p + 1;
 std::wstring r(b);
 for (auto &c : r) if (c < 32 || wcschr(L"<>:\"/\\|?*", c)) c = L'_';
 return r;
}
void OnOpen(const void *ref, IStream *s, bool asked) {
 wchar_t name[1024]; bool layout = false;
 if (!NameOf(ref, name, 1024, &layout) || !IsScene(name)) return;
 if (!asked) { InterlockedCompareExchange(&MainThread, (LONG)GetCurrentThreadId(), 0); if (layout) InterlockedExchange(&LayoutOk, 1); }
 std::wstring base = BaseOf(name), key = Lower(base);
 EnterCriticalSection(&Gate); bool have = Done.count(key) > 0; LeaveCriticalSection(&Gate);
 if (have) return;
 DWORD size = 0; char *data = ReadAll(s, &size);
 if (!data) { Log("read failed " + Utf8(name)); return; }
 EnterCriticalSection(&Gate);
 if (Done.insert(key).second) { Pending p; p.name = base; p.full = name; p.data = data; p.size = size; p.asked = asked; Queue.push_back(p); data = NULL; }
 LeaveCriticalSection(&Gate);
 free(data);
 SetEvent(Wake);
}
IStream *__stdcall HookCreateIStream(const void *name, unsigned flags) {
 IStream *s = Original(name, flags);
 if (s && (flags & 0x0f) == 0 && !TlsGetValue(Tls)) OnOpen(name, s, false);
 return s;
}

// ---- scenes MeguLit asks for (want.txt), opened on the game's own thread between its messages ----------------------
void AskOne(const std::wstring &name) {
 VariantString *v = (VariantString *)calloc(1, sizeof(VariantString)); // kept for good: the engine may hold on to it
 if (!v) return;
 v->RefCount = 0x3fffffff; v->LongString = _wcsdup(name.c_str()); v->Length = (int)name.size();
 VariantString **ref = (VariantString **)malloc(sizeof(void *));
 if (!v->LongString || !ref) return;
 *ref = v;
 TlsSetValue(Tls, (void *)1);
 IStream *s = OpenGuarded(ref);
 TlsSetValue(Tls, NULL);
 if (s) { OnOpen(ref, s, true); ReleaseGuarded(s); }
}
LRESULT CALLBACK OnMessage(int code, WPARAM wp, LPARAM lp) {
 if (code >= 0 && wp == PM_REMOVE && GetTickCount() - LastAsk >= 250) {
  std::wstring next;
  EnterCriticalSection(&Gate);
  while (!Wanted.empty() && next.empty()) { next = Wanted.front(); Wanted.pop_front(); if (Done.count(Lower(BaseOf(next.c_str()))) ) next.clear(); }
  LeaveCriticalSection(&Gate);
  if (!next.empty()) { LastAsk = GetTickCount(); AskOne(next); }
 }
 return CallNextHookEx(NULL, code, wp, lp);
}
FILETIME WantSeen;
void ReadWants() {
 std::wstring path = std::wstring(Out) + L"want.txt";
 WIN32_FILE_ATTRIBUTE_DATA a;
 if (!GetFileAttributesExW(path.c_str(), GetFileExInfoStandard, &a) || !CompareFileTime(&a.ftLastWriteTime, &WantSeen)) return;
 WantSeen = a.ftLastWriteTime;
 HANDLE h = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, NULL, OPEN_EXISTING, 0, NULL);
 if (h == INVALID_HANDLE_VALUE) return;
 std::string text; char buf[65536]; DWORD n;
 while (ReadFile(h, buf, sizeof buf, &n, NULL) && n && text.size() < (8u << 20)) text.append(buf, n);
 CloseHandle(h);
 size_t added = 0, at = 0;
 EnterCriticalSection(&Gate);
 while (at < text.size()) {
  size_t e = text.find('\n', at); if (e == std::string::npos) e = text.size();
  std::string line = text.substr(at, e - at); at = e + 1;
  while (!line.empty() && (line.back() == '\r' || line.back() == ' ')) line.pop_back();
  if (line.empty() || line.size() > 400) continue;
  std::wstring w = Wide(line);
  if (!IsScene(w.c_str()) || Done.count(Lower(BaseOf(w.c_str()))) || !Asked.insert(Lower(w)).second) continue;
  Wanted.push_back(w); added++;
 }
 LeaveCriticalSection(&Gate);
 if (added) Log("asked for " + std::to_string(added) + " scenes");
}

// ---- finding the exporter -------------------------------------------------------------------------------------------
bool Executable(uintptr_t p) {
 MEMORY_BASIC_INFORMATION m;
 return p && VirtualQuery((void *)p, &m, sizeof m) && m.State == MEM_COMMIT && (m.Protect & (PAGE_EXECUTE | PAGE_EXECUTE_READ | PAGE_EXECUTE_READWRITE | PAGE_EXECUTE_WRITECOPY));
}
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
// Every plug-in keeps the exporter it was linked with in its own data; the value most plug-ins share, whose object
// starts with a table of code pointers, is it. It is accepted only when it answers the TVPCreateIStream query.
void *FindExporter() {
 HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, GetCurrentProcessId());
 if (snap == INVALID_HANDLE_VALUE) return NULL;
 std::map<uintptr_t, int> votes; int plugins = 0;
 MODULEENTRY32W me; me.dwSize = sizeof me;
 HMODULE main = GetModuleHandleW(NULL);
 for (BOOL ok = Module32FirstW(snap, &me); ok; ok = Module32NextW(snap, &me)) {
  HMODULE m = me.hModule;
  if (m == main || m == Self || !GetProcAddress(m, "V2Link")) continue;
  plugins++;
  static uintptr_t found[4096];
  int n = ScanModule(m, found, 4096);
  std::set<uintptr_t> seen(found, found + n);
  for (auto v : seen) votes[v]++;
 }
 CloseHandle(snap);
 std::vector<std::pair<int, uintptr_t>> ranked;
 for (auto &kv : votes) if (kv.second >= 2 && kv.second * 2 >= plugins) ranked.push_back({kv.second, kv.first});
 std::sort(ranked.rbegin(), ranked.rend());
 Log("plug-ins " + std::to_string(plugins) + ", exporter candidates " + std::to_string(ranked.size()));
 for (size_t i = 0; i < ranked.size() && i < 4; i++) {
  void *fn;
  if (QueryGuarded((void *)ranked[i].second, "IStream * ::TVPCreateIStream(const ttstr &,tjs_uint32)", &fn) && Executable((uintptr_t)fn)) return (void *)ranked[i].second;
 }
 return NULL;
}

void LoadDone() {
 WIN32_FIND_DATAW f;
 HANDLE h = FindFirstFileW((std::wstring(Out) + L"*.scn").c_str(), &f);
 if (h == INVALID_HANDLE_VALUE) return;
 do Done.insert(Lower(f.cFileName)); while (FindNextFileW(h, &f));
 FindClose(h);
}
void Flush() {
 std::vector<Pending> batch;
 EnterCriticalSection(&Gate); batch.swap(Queue); LeaveCriticalSection(&Gate);
 for (auto &p : batch) {
  bool ok = WriteWhole(std::wstring(Out) + p.name, p.data, p.size);
  char head[16]; sprintf_s(head, "%02x%02x%02x%02x", p.size > 0 ? (BYTE)p.data[0] : 0, p.size > 1 ? (BYTE)p.data[1] : 0, p.size > 2 ? (BYTE)p.data[2] : 0, p.size > 3 ? (BYTE)p.data[3] : 0);
  Log(std::string(ok ? "saved " : "save failed ") + (p.asked ? "(asked) " : "") + Utf8(p.full) + " " + std::to_string(p.size) + " " + head);
  if (ok) Append(L"opened.txt", Utf8(p.full) + "\t" + Utf8(p.name) + "\r\n", 4 << 20);
  free(p.data);
 }
}

DWORD WINAPI Run(void *) {
 // Output folder: <MeguLit>\cache\kirikiri-scn\<FNV-1a of the lower-case game folder>\ (this DLL is <MeguLit>\native\).
 wchar_t self[1024], game[1024];
 if (!GetModuleFileNameW(Self, self, 1024) || !GetModuleFileNameW(NULL, game, 1024)) return 0;
 for (int k = 0; k < 2; k++) { wchar_t *s = wcsrchr(self, L'\\'); if (!s) return 0; *s = 0; }
 wchar_t *g = wcsrchr(game, L'\\'); if (!g) return 0; *g = 0;
 unsigned hash = 2166136261u;
 for (wchar_t *p = game; *p; p++) { wchar_t c = *p; if (c >= L'A' && c <= L'Z') c = (wchar_t)(c + 32); hash = (hash ^ (unsigned)c) * 16777619u; }
 swprintf_s(Out, L"%s\\cache", self); CreateDirectoryW(Out, NULL);
 swprintf_s(Out, L"%s\\cache\\kirikiri-scn", self); CreateDirectoryW(Out, NULL);
 swprintf_s(Out, L"%s\\cache\\kirikiri-scn\\%08x\\", self, hash); CreateDirectoryW(Out, NULL);
 WriteWhole(std::wstring(Out) + L"game.txt", Utf8(game).data(), (DWORD)Utf8(game).size());
 if (GetFileAttributesW((std::wstring(Out) + L"off").c_str()) != INVALID_FILE_ATTRIBUTES) { Log("disabled by the off file"); return 0; }
 LoadDone();
 void *exporter = NULL;
 for (int tries = 0; tries < 30 && !exporter; tries++) { exporter = FindExporter(); if (!exporter) Sleep(2000); }
 if (!exporter) { Log("no KiriKiri function exporter; nothing hooked"); return 0; }
 void *fn = NULL, *exists = NULL;
 QueryGuarded(exporter, "IStream * ::TVPCreateIStream(const ttstr &,tjs_uint32)", &fn);
 if (QueryGuarded(exporter, "bool ::TVPIsExistentStorage(const ttstr &)", &exists)) Exists = (ExistsFn)exists;
 if (MH_Initialize() != MH_OK || MH_CreateHook(fn, (void *)&HookCreateIStream, (void **)&Original) != MH_OK || MH_EnableHook(fn) != MH_OK) { Log("hook failed"); return 0; }
 Target = (CreateIStreamFn)fn;
 Log("hooked TVPCreateIStream; " + std::to_string(Done.size()) + " scenes already saved");
 for (;;) {
  WaitForSingleObject(Wake, 1000);
  Flush();
  if (!Exists || !MainThread || !LayoutOk) continue;
  ReadWants();
  EnterCriticalSection(&Gate); bool more = !Wanted.empty(); LeaveCriticalSection(&Gate);
  if (more && !MessageHook) { MessageHook = SetWindowsHookExW(WH_GETMESSAGE, OnMessage, NULL, (DWORD)MainThread); if (MessageHook) Log("asking on the game thread"); }
  if (more && MessageHook) PostThreadMessageW((DWORD)MainThread, WM_NULL, 0, 0);
  if (!more && MessageHook) { UnhookWindowsHookEx(MessageHook); MessageHook = NULL; Log("asked scenes done"); }
 }
}
} // namespace

BOOL WINAPI DllMain(HINSTANCE h, DWORD reason, void *) {
 if (reason == DLL_PROCESS_ATTACH) {
  Self = h; DisableThreadLibraryCalls(h);
  InitializeCriticalSection(&Gate);
  Wake = CreateEventW(NULL, FALSE, FALSE, NULL);
  Tls = TlsAlloc();
  // Pin: the hook stays in the game until it exits.
  HMODULE pin; GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_PIN, (LPCWSTR)&DllMain, &pin);
  HANDLE t = CreateThread(NULL, 0, Run, NULL, 0, NULL);
  if (t) CloseHandle(t);
 }
 return TRUE;
}
