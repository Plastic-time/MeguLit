// SPDX-License-Identifier: GPL-3.0-or-later
// MeguLitScn32/64.dll (E293, user 2026-11-10: zero-latency bilingual for KiriKiri Z games with strong archive
// encryption, first サノバウィッチ). Instead of breaking each game's cipher, the scene files are taken after the engine
// itself has decrypted them: KiriKiri Z hands every plug-in a function exporter, and the PSB plug-in (psbfile.dll)
// opens .scn scene files through the exporter's TVPCreateIStream. This DLL finds the exporter (the pointer every
// plug-in keeps), hooks that one function, and when a .scn is opened for reading copies the stream's bytes to
// <MeguLit>\cache\kirikiri-scn\<game key>\ (never into the game folder). services/original-engines/scenes.cjs
// (kirikiri-dump) reads that folder. Scenes the game has not opened yet are asked for once, one at a time on the game's
// own thread, from the names MeguLit writes to want.txt. Every step is guarded: on any failure the game runs untouched.
// E296 (魔法使いの夜, a packed Chinese build): names in want.txt that are not .scn (scenario .ks) are read as text through
// the exporter's TVPCreateTextStreamForRead, which resolves them the way the running game does (its Chinese patch first)
// and decrypts and decodes them; each is saved as UTF-16 to run-<program>\ in the same folder.
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
typedef void *(__stdcall *TextStreamFn)(const void *name, const void *mode);
typedef unsigned(__cdecl *TextReadFn)(void *self, void *target, unsigned size);
typedef void(__cdecl *TextDestructFn)(void *self);

HMODULE Self;
wchar_t Out[1024];
CRITICAL_SECTION Gate;
HANDLE Wake;
DWORD Tls = TLS_OUT_OF_INDEXES;
CreateIStreamFn Original, Target;
ExistsFn Exists;
TextStreamFn TextStream;
wchar_t RunDir[1024];             // run-<program>\ for scripts read as text
volatile LONG LayoutOk, MainThread;
std::set<std::wstring> Done;     // lower-case file names already in the folder
std::set<std::wstring> Asked;    // names from want.txt already tried
std::deque<std::wstring> Wanted; // names still to open on the game thread
struct Pending { std::wstring name, full; char *data; DWORD size; bool asked; };
std::vector<Pending> Queue;
HHOOK MessageHook;
DWORD LastAsk;
// E297 cold run (native/ColdCapture.cs): MEGULIT_COLD=1 in the game's environment. The archives are read at once and the
// outcome goes to cold-done.txt, which ColdCapture waits for before it ends the game.
bool Cold;

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
bool WriteWhole(const std::wstring &path, const void *data, DWORD size);
void Report(const char *word) { if (Cold) WriteWhole(std::wstring(Out) + L"cold-done.txt", word, (DWORD)strlen(word)); }
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
// The whole script as the engine decodes it (iTJSTextReadStream: Read(target, 0) reads everything, Destruct frees it).
bool ReadTextGuarded(const void *ref, wchar_t **out, int *length) {
 void *stream = NULL;
 *out = NULL; *length = 0;
 __try {
  if (!Exists(ref)) return false;
  VariantString *mode = NULL, *target = NULL;
  stream = TextStream(ref, &mode);
  if (!stream) return false;
  void **vt = *(void ***)stream;
  ((TextReadFn)vt[0])(stream, &target, 0);
  if (target) {
   const wchar_t *t = target->LongString ? target->LongString : target->ShortString;
   int n = target->Length;
   if (n > 0 && n < (64 << 20)) { *out = (wchar_t *)malloc(((size_t)n + 1) * sizeof(wchar_t)); if (*out) { memcpy(*out, t, (size_t)n * sizeof(wchar_t)); (*out)[n] = 0; *length = n; } }
  }
  ((TextDestructFn)vt[1])(stream);
  return *out != NULL;
 } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
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

// ---- E297 whole Hxv4 archives (cxdec v2: PackinOne and the like), once per game ---------------------------------------
// The scenes a game has not opened cannot be asked for by name in Hxv4 archives (their names are hashes). The cxdec
// plug-in itself has a function that reads an archive's index (hash, key, ordinal for every file) and one that opens a
// file from its key; both are found in the plug-in's code by their byte patterns (the ones the open-source Hxv4
// extractors match) and called on the game thread. Every PSB / mdf file of the non-media archives is saved as
// hx-<archive>-<ordinal>.scn next to the scenes captured above; kirikiri-dump reads them all the same.
#if defined(_M_IX86)
#pragma pack(push, 4)
struct TjsVariant { union { struct { void *Object, *ObjThis; } o; long long Integer; double Real; VariantString *String; void *Octet; }; int vt; };
#pragma pack(pop)
struct TjsOctet { unsigned Length; int RefCount; unsigned char *Data; };
typedef int(__cdecl *CxIndexFn)(TjsVariant *ret, const TjsVariant *name);
typedef IStream *(__cdecl *CxStreamFn)(const void *name, long long key, unsigned mode);
typedef void **(__stdcall *AppPathFn)(void **ret);
typedef void **(__stdcall *NormalizeFn)(void **ret, const void *name);
typedef int(__cdecl *PropGetFn)(void *self, unsigned flag, const wchar_t *member, unsigned *hint, TjsVariant *result, void *objthis);
typedef int(__cdecl *PropGetNumFn)(void *self, unsigned flag, int num, TjsVariant *result, void *objthis);
CxIndexFn CxIndex; CxStreamFn CxStream; AppPathFn AppPath; NormalizeFn Normalize;
volatile LONG HxWanted;
const char HxStreamPattern[] = "\x55\x8B\xEC\x6A\xFF\x68\x2A\x2A\x2A\x2A\x64\xA1\x00\x00\x00\x00\x50\x51\xA1\x2A\x2A\x2A\x2A\x33\xC5\x50\x8D\x45\xF4\x64\xA3\x00\x00\x00\x00\xA1\x2A\x2A\x2A\x2A\x85\xC0\x75\x32\x68\xB0\x30\x00\x00";
const char HxIndexPattern[] = "\x55\x8B\xEC\x6A\xFF\x68\x2A\x2A\x2A\x2A\x64\xA1\x00\x00\x00\x00\x50\x83\xEC\x14\x57\xA1\x2A\x2A\x2A\x2A\x33\xC5\x50\x8D\x45\xF4\x64\xA3\x00\x00\x00\x00\x83\x7D\x08\x00\x0F\x84\x2A\x2A\x00\x00\xA1\x2A\x2A\x2A\x2A\x85\xC0\x75\x12\x68\x2A\x2A\x2A\x2A\xE8\x2A\x2A\x2A\x2A\x83\xC4\x04\xA3\x2A\x2A\x2A\x2A\xFF\x75\x0C\x8D\x4D\xF0\x51\xFF\xD0\xA1\x2A\x2A\x2A\x2A\xC7\x45\xFC\x00\x00\x00\x00\x85\xC0";
// 0x2A is a wildcard byte, as in the published patterns.
const unsigned char *FindPattern(const unsigned char *at, size_t size, const char *pattern, size_t length) {
 __try {
  for (size_t i = 0; i + length <= size; i++) {
   size_t k = 0;
   while (k < length && (pattern[k] == '\x2A' || at[i + k] == (unsigned char)pattern[k])) k++;
   if (k == length) return at + i;
  }
 } __except (EXCEPTION_EXECUTE_HANDLER) {}
 return NULL;
}
bool FindCxFunctions() {
 HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, GetCurrentProcessId());
 if (snap == INVALID_HANDLE_VALUE) return false;
 MODULEENTRY32W me; me.dwSize = sizeof me;
 for (BOOL ok = Module32FirstW(snap, &me); ok && !(CxIndex && CxStream); ok = Module32NextW(snap, &me)) {
  HMODULE m = me.hModule;
  if (m == Self || !GetProcAddress(m, "V2Link")) continue;
  __try {
   auto dos = (IMAGE_DOS_HEADER *)m; auto nt = (IMAGE_NT_HEADERS *)((char *)m + dos->e_lfanew);
   auto sec = IMAGE_FIRST_SECTION(nt);
   for (int i = 0; i < nt->FileHeader.NumberOfSections; i++, sec++) {
    if (!(sec->Characteristics & IMAGE_SCN_MEM_EXECUTE)) continue;
    const unsigned char *code = (const unsigned char *)m + sec->VirtualAddress;
    const unsigned char *s = FindPattern(code, sec->Misc.VirtualSize, HxStreamPattern, sizeof HxStreamPattern - 1);
    const unsigned char *x = FindPattern(code, sec->Misc.VirtualSize, HxIndexPattern, sizeof HxIndexPattern - 1);
    if (s && x) { CxStream = (CxStreamFn)s; CxIndex = (CxIndexFn)x; break; }
   }
  } __except (EXCEPTION_EXECUTE_HANDLER) {}
 }
 CloseHandle(snap);
 return CxIndex && CxStream;
}
VariantString *MakeString(const wchar_t *text) { // kept for good, like the names asked for above
 VariantString *v = (VariantString *)calloc(1, sizeof(VariantString));
 if (!v || !(v->LongString = _wcsdup(text))) return NULL;
 v->RefCount = 0x3fffffff; v->Length = (int)wcslen(text);
 return v;
}
const wchar_t *TextOf(VariantString *v) { return !v ? NULL : v->LongString ? v->LongString : v->ShortString; }
bool GetCount(void *obj, long long *count) {
 __try {
  TjsVariant r; ZeroMemory(&r, sizeof r);
  if (((PropGetFn)(*(void ***)obj)[4])(obj, 0, L"count", NULL, &r, obj) < 0 || r.vt != 4) return false;
  *count = r.Integer; return true;
 } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
bool GetItem(void *obj, int i, TjsVariant *r) {
 __try { ZeroMemory(r, sizeof *r); return ((PropGetNumFn)(*(void ***)obj)[5])(obj, 0, i, r, obj) >= 0; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
bool CallIndex(VariantString *arc, TjsVariant *out) {
 __try { TjsVariant name; ZeroMemory(&name, sizeof name); name.vt = 2; name.String = arc; ZeroMemory(out, sizeof *out); CxIndex(out, &name); return out->vt == 1 && out->o.Object; }
 __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
IStream *CallStream(VariantString **path, long long key, unsigned mode) {
 __try { return CxStream(path, key, mode); } __except (EXCEPTION_EXECUTE_HANDLER) { return NULL; }
}
VariantString *CallNormalize(VariantString *name) {
 __try { void *out = NULL; VariantString *in = name; Normalize(&out, &in); return (VariantString *)out; } __except (EXCEPTION_EXECUTE_HANDLER) { return NULL; }
}
VariantString *CallAppPath() {
 __try { void *out = NULL; AppPath(&out); return (VariantString *)out; } __except (EXCEPTION_EXECUTE_HANDLER) { return NULL; }
}
bool ReadHead(IStream *s, unsigned char *head) {
 __try { ULONG got = 0; LARGE_INTEGER zero; zero.QuadPart = 0; if (FAILED(s->Read(head, 4, &got)) || got != 4) return false; s->Seek(zero, STREAM_SEEK_SET, NULL); return true; }
 __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
bool MediaArchive(const std::wstring &n) {
 static const wchar_t *media[] = {L"bgimage", L"fgimage", L"evimage", L"image", L"bgm", L"voice", L"sound", L"se.", L"movie", L"video", L"thum", L"emote", L"font", L"sysse"};
 std::wstring l = Lower(n);
 for (auto m : media) if (l.find(m) != std::wstring::npos) return true;
 return false;
}
// The fake name the index uses for a file: its ordinal in 14-bit steps from U+5000 (as the Hxv4 archives name them).
std::wstring FakeName(unsigned ordinal) { std::wstring r; do { r += (wchar_t)((ordinal & 0x3fff) + 0x5000); ordinal >>= 14; } while (ordinal); return r; }
void DumpArchive(const std::wstring &dir, const std::wstring &app, const std::wstring &file) {
 std::wstring marker = std::wstring(Out) + L"hx-done-" + Lower(file) + L".txt";
 if (GetFileAttributesW(marker.c_str()) != INVALID_FILE_ATTRIBUTES) return;
 VariantString *arc = CallNormalize(MakeString((app + file).c_str()));
 if (!arc) { Log("hx: name not normalized " + Utf8(file)); return; }
 TjsVariant index;
 TlsSetValue(Tls, (void *)1);
 bool ok = CallIndex(arc, &index);
 TlsSetValue(Tls, NULL);
 if (!ok) { Log("hx: no index for " + Utf8(file)); return; }
 long long dirs = 0, saved = 0, files = 0;
 if (!GetCount(index.o.Object, &dirs)) { Log("hx: index without count " + Utf8(file)); return; }
 std::wstring arcName = TextOf(arc) ? TextOf(arc) : L"";
 for (int d = 1; d < dirs; d += 2) {
  TjsVariant entries; long long n = 0;
  if (!GetItem(index.o.Object, d, &entries) || entries.vt != 1 || !GetCount(entries.o.Object, &n)) continue;
  for (int e = 1; e < n; e += 2) {
   TjsVariant info, ord, key; long long parts = 0;
   if (!GetItem(entries.o.Object, e, &info) || info.vt != 1 || !GetCount(info.o.Object, &parts) || parts < 2) continue;
   if (!GetItem(info.o.Object, 0, &ord) || !GetItem(info.o.Object, 1, &key) || ord.vt != 4 || key.vt != 4 || ord.Integer < 0) continue;
   files++;
   std::wstring path = arcName + L">" + FakeName((unsigned)(ord.Integer & 0xffffffff));
   VariantString *name = MakeString(path.c_str());
   VariantString **ref = (VariantString **)malloc(sizeof(void *));
   if (!name || !ref) continue;
   *ref = name;
   TlsSetValue(Tls, (void *)1);
   IStream *s = CallStream(ref, key.Integer, (unsigned)((ord.Integer >> 32) & 0xffff));
   TlsSetValue(Tls, NULL);
   if (!s) continue;
   unsigned char head[4];
   if (ReadHead(s, head) && (!memcmp(head, "PSB\0", 4) || !memcmp(head, "mdf\0", 4))) {
    DWORD size = 0; char *data = ReadAll(s, &size);
    if (data && size <= (16u << 20)) {
     wchar_t out[96]; swprintf_s(out, L"hx-%s-%llu.scn", Lower(file).c_str(), (unsigned long long)(ord.Integer & 0xffffffff));
     if (WriteWhole(std::wstring(Out) + out, data, size)) saved++;
    }
    free(data);
   }
   ReleaseGuarded(s);
  }
 }
 Log("hx: " + Utf8(file) + " " + std::to_string(files) + " files, " + std::to_string(saved) + " PSB saved");
 WriteWhole(marker, "done", 4);
}
void DumpHx() {
 if (!CxIndex || !CxStream || !AppPath || !Normalize) return;
 VariantString *appv = CallAppPath();
 const wchar_t *app = TextOf(appv);
 if (!app) { Log("hx: no app path"); return; }
 wchar_t game[1024]; if (!GetModuleFileNameW(NULL, game, 1024)) return;
 wchar_t *g = wcsrchr(game, L'\\'); if (!g) return; g[1] = 0;
 WIN32_FIND_DATAW f;
 HANDLE h = FindFirstFileW((std::wstring(game) + L"*.xp3").c_str(), &f);
 if (h == INVALID_HANDLE_VALUE) return;
 std::vector<std::wstring> names;
 do if (!MediaArchive(f.cFileName)) names.push_back(f.cFileName); while (FindNextFileW(h, &f));
 FindClose(h);
 // The scene files live in scn*.xp3 when there are such archives: read only those (fast enough for the cold run).
 std::vector<std::wstring> scn;
 for (auto &n : names) if (!_wcsnicmp(n.c_str(), L"scn", 3)) scn.push_back(n);
 if (!scn.empty()) names.swap(scn);
 std::wstring appPath(app);
 for (auto &n : names) DumpArchive(game, appPath, n);
}
#endif

// ---- scenes MeguLit asks for (want.txt), opened on the game's own thread between its messages ----------------------
bool HaveText(const std::wstring &name) { return GetFileAttributesW((std::wstring(RunDir) + BaseOf(name.c_str())).c_str()) != INVALID_FILE_ATTRIBUTES; }
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
void AskText(const std::wstring &name) {
 if (!TextStream || HaveText(name)) return;
 VariantString *v = (VariantString *)calloc(1, sizeof(VariantString)); // kept for good: the engine may hold on to it
 VariantString **ref = (VariantString **)malloc(sizeof(void *));
 if (!v || !ref || !(v->LongString = _wcsdup(name.c_str()))) return;
 v->RefCount = 0x3fffffff; v->Length = (int)name.size(); *ref = v;
 wchar_t *text; int n;
 TlsSetValue(Tls, (void *)1);
 bool ok = ReadTextGuarded(ref, &text, &n);
 TlsSetValue(Tls, NULL);
 if (!ok) { Log("not read " + Utf8(name)); return; }
 std::wstring body(L"\xFEFF"); body.append(text, n); free(text);
 bool saved = WriteWhole(std::wstring(RunDir) + BaseOf(name.c_str()), body.data(), (DWORD)(body.size() * sizeof(wchar_t)));
 Log(std::string(saved ? "read " : "save failed ") + Utf8(name) + " " + std::to_string(n) + " chars");
}
// E450 voices (user: example sentences must play the game's own voice): names in want.txt ending in an audio extension
// are opened through the game's storage (its own archives and decryption, hashed names included) and the bytes saved as
// they are to voice\ in the same folder. Many per message: a game has thousands of voice files.
bool IsAudio(const wchar_t *name) { size_t n = wcslen(name); const wchar_t *e = n > 4 ? name + n - 4 : L""; return !_wcsicmp(e, L".ogg") || !_wcsicmp(e, L".wav") || !_wcsicmp(e, L".m4a") || (n > 5 && !_wcsicmp(name + n - 5, L".opus")); }
std::wstring VoiceDir() { return std::wstring(Out) + L"voice\\"; }
bool HaveAudio(const std::wstring &name) { return GetFileAttributesW((VoiceDir() + BaseOf(name.c_str())).c_str()) != INVALID_FILE_ATTRIBUTES; }
volatile LONG AudioAsked, AudioSaved;
void AskAudio(const std::wstring &name) {
 if (HaveAudio(name)) return;
 VariantString *v = (VariantString *)calloc(1, sizeof(VariantString)); // kept for good: the engine may hold on to it
 VariantString **ref = (VariantString **)malloc(sizeof(void *));
 if (!v || !ref || !(v->LongString = _wcsdup(name.c_str()))) return;
 v->RefCount = 0x3fffffff; v->Length = (int)name.size(); *ref = v;
 TlsSetValue(Tls, (void *)1);
 IStream *s = OpenGuarded(ref);
 TlsSetValue(Tls, NULL);
 if (!s) return;
 DWORD size = 0; char *data = ReadAll(s, &size);
 if (data && size > 12 && size <= (32u << 20)) { CreateDirectoryW(VoiceDir().c_str(), NULL); if (WriteWhole(VoiceDir() + BaseOf(name.c_str()), data, size)) InterlockedIncrement(&AudioSaved); }
 free(data);
 ReleaseGuarded(s);
}
LRESULT CALLBACK OnMessage(int code, WPARAM wp, LPARAM lp) {
 if (code >= 0 && wp == PM_REMOVE && GetTickCount() - LastAsk >= 120) {
#if defined(_M_IX86)
  if (InterlockedExchange(&HxWanted, 0)) { LastAsk = GetTickCount(); DumpHx(); if (!AudioAsked) Report("done"); return CallNextHookEx(NULL, code, wp, lp); }
#endif
  std::vector<std::wstring> voices;
  EnterCriticalSection(&Gate);
  while (!Wanted.empty() && voices.size() < 48 && IsAudio(Wanted.front().c_str())) { voices.push_back(Wanted.front()); Wanted.pop_front(); }
  LeaveCriticalSection(&Gate);
  if (!voices.empty()) { for (auto &v : voices) AskAudio(v); LastAsk = GetTickCount(); return CallNextHookEx(NULL, code, wp, lp); }
  std::wstring next;
  EnterCriticalSection(&Gate);
  while (!Wanted.empty() && next.empty()) { next = Wanted.front(); Wanted.pop_front(); if (IsAudio(next.c_str())) { Wanted.push_front(next); next.clear(); break; } if (IsScene(next.c_str()) ? Done.count(Lower(BaseOf(next.c_str()))) > 0 : HaveText(next)) next.clear(); }
  LeaveCriticalSection(&Gate);
  if (!next.empty()) { LastAsk = GetTickCount(); if (IsScene(next.c_str())) AskOne(next); else AskText(next); }
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
 bool deferred = false;
 EnterCriticalSection(&Gate);
 while (at < text.size()) {
  size_t e = text.find('\n', at); if (e == std::string::npos) e = text.size();
  std::string line = text.substr(at, e - at); at = e + 1;
  while (!line.empty() && (line.back() == '\r' || line.back() == ' ')) line.pop_back();
  if (line.empty() || line.size() > 400) continue;
  std::wstring w = Wide(line);
  bool scene = IsScene(w.c_str());
  // Scene files wait until a game-opened scene has confirmed the string layout; the list is read again then.
  if (scene && !LayoutOk) { deferred = true; continue; }
  bool audio = IsAudio(w.c_str());
  if (audio ? HaveAudio(w) : scene ? Done.count(Lower(BaseOf(w.c_str()))) > 0 : (!TextStream || HaveText(w))) continue;
  if (!Asked.insert(Lower(w)).second) continue;
  if (audio) InterlockedIncrement(&AudioAsked);
  Wanted.push_back(w); added++;
 }
 LeaveCriticalSection(&Gate);
 if (deferred) ZeroMemory(&WantSeen, sizeof WantSeen);
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

// The thread that owns the game's visible top-level window (KiriKiri runs its scripts there).
BOOL CALLBACK OwnWindow(HWND h, LPARAM out) {
 DWORD pid = 0, tid = GetWindowThreadProcessId(h, &pid);
 if (pid == GetCurrentProcessId() && IsWindowVisible(h)) { *(DWORD *)out = tid; return FALSE; }
 return TRUE;
}
DWORD GameThread() { DWORD tid = 0; EnumWindows(OwnWindow, (LPARAM)&tid); return tid; }
DWORD Started;
DWORD WINAPI Run(void *) {
 Started = GetTickCount();
 { wchar_t v[8]; Cold = GetEnvironmentVariableW(L"MEGULIT_COLD", v, 8) > 0 && v[0] == L'1'; }
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
 {
  wchar_t program[1024]; GetModuleFileNameW(NULL, program, 1024);
  std::wstring run = L"run-" + Lower(BaseOf(wcsrchr(program, L'\\') ? wcsrchr(program, L'\\') + 1 : program));
  swprintf_s(RunDir, L"%s%s\\", Out, run.c_str()); CreateDirectoryW(RunDir, NULL);
 }
 WriteWhole(std::wstring(Out) + L"game.txt", Utf8(game).data(), (DWORD)Utf8(game).size());
 if (GetFileAttributesW((std::wstring(Out) + L"off").c_str()) != INVALID_FILE_ATTRIBUTES) { Log("disabled by the off file"); return 0; }
 LoadDone();
 void *exporter = NULL;
 for (int tries = 0; tries < 30 && !exporter; tries++) { exporter = FindExporter(); if (!exporter) Sleep(2000); }
 if (!exporter) { Log("no KiriKiri function exporter; nothing hooked"); Report("no-exporter"); return 0; }
 void *fn = NULL, *exists = NULL, *text = NULL;
 QueryGuarded(exporter, "IStream * ::TVPCreateIStream(const ttstr &,tjs_uint32)", &fn);
 if (QueryGuarded(exporter, "bool ::TVPIsExistentStorage(const ttstr &)", &exists)) Exists = (ExistsFn)exists;
 if (QueryGuarded(exporter, "iTJSTextReadStream * ::TVPCreateTextStreamForRead(const ttstr &,const ttstr &)", &text)) TextStream = (TextStreamFn)text;
 if (MH_Initialize() != MH_OK || MH_CreateHook(fn, (void *)&HookCreateIStream, (void **)&Original) != MH_OK || MH_EnableHook(fn) != MH_OK) { Log("hook failed"); Report("failed"); return 0; }
 Target = (CreateIStreamFn)fn;
 Log("hooked TVPCreateIStream; " + std::to_string(Done.size()) + " scenes already saved");
#if defined(_M_IX86)
 {
  void *app = NULL, *norm = NULL;
  if (QueryGuarded(exporter, "ttstr ::TVPGetAppPath()", &app)) AppPath = (AppPathFn)app;
  if (QueryGuarded(exporter, "ttstr ::TVPNormalizeStorageName(const ttstr &)", &norm)) Normalize = (NormalizeFn)norm;
  if (AppPath && Normalize && FindCxFunctions()) { InterlockedExchange(&HxWanted, 1); Log("hx: cxdec index and stream functions found"); }
  else { Log("hx: no cxdec v2 plug-in functions"); Report("no-hx"); }
 }
#else
 Report("no-hx");
#endif
 for (;;) {
  WaitForSingleObject(Wake, 1000);
  Flush();
  if (!Exists) continue;
  if (!MainThread && GetTickCount() - Started > (Cold ? 1500u : 8000u)) { DWORD t = GameThread(); if (t) { InterlockedExchange(&MainThread, (LONG)t); Log("game thread from its window"); } }
  if (!MainThread) continue;
  ReadWants();
  EnterCriticalSection(&Gate); bool more = !Wanted.empty(); LeaveCriticalSection(&Gate);
#if defined(_M_IX86)
  if (HxWanted) more = true;
#endif
  if (more && !MessageHook) { MessageHook = SetWindowsHookExW(WH_GETMESSAGE, OnMessage, NULL, (DWORD)MainThread); if (MessageHook) Log("asking on the game thread"); }
  if (more && MessageHook) PostThreadMessageW((DWORD)MainThread, WM_NULL, 0, 0);
  if (!more && MessageHook) { UnhookWindowsHookEx(MessageHook); MessageHook = NULL; Log("asked scenes done");
   // E450 a cold run for voices ends when every asked voice was tried
   if (AudioAsked) { Log("voices " + std::to_string(AudioSaved) + " of " + std::to_string(AudioAsked)); Report("done"); } }
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
