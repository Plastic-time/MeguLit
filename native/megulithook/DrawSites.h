// SPDX-License-Identifier: GPL-3.0-or-later
// engine-draw, GDI draw sites at run time (docs/engine-draw-native.md "其余原生引擎"; signatures in DrawSitesSig.h).
// After engine detection (enginecontrol.cpp checkengine) every signature is looked up in its module: the module's import
// table gives the API's IAT slot, the code is scanned for `call dword ptr [slot]` with the signature's bytes before it, and
// a signature that matches exactly `count` times is kept. Nothing is hooked until MeguLit's control file
// %TEMP%\MeguLit\draw\<pid>.txt says roles=1 (draw.roles of the game's diff); a watcher thread checks it every 2 s.
// Then each kept site gets a MinHook detour on its call instruction: the detour reads the API's arguments from the stack
// (they are already pushed), records the character(s) and the pen, and continues into the game's own call unchanged.
// One record a run of text drawn from one site and one caller:
//   ToMe_DRAWRUN engine=<id> site=<k> via=<rva>/<rva> run=N n=<chars> x0= y0= x1= y1= size=<font height> fargs=<4 hex> text=<UTF-8, cut at 120 bytes>
// x / y are the pen on the engine's text canvas (DC coordinates, not the screen); GetGlyphOutline sites have no pen (-1).
// via = the return addresses (module RVAs) of the function holding the site and of its caller (EBP frame: frame=1), or of the
// function alone (no frame: frame = the bytes from the API's first argument up to that function's return address); fargs = that
// function's first four arguments when the run starts (a glyph routine is often given the pen). The callers tell dialogue, name
// and choice routines apart (learned per game from the runs' texts and the hook streams).
// x86 only (naked gate); a 64-bit build compiles it out.
#pragma once
#ifndef _WIN64
#include <windows.h>
#include <cstdio>
#include <cstring>
#include <string>
#include "MinHook.h"
#include "DrawSitesSig.h"
namespace DrawSites {
enum Api { A_TextOutA, A_TextOutW, A_ExtTextOutA, A_ExtTextOutW, A_DrawTextA, A_DrawTextW, A_GGOA, A_GGOW, A_None };
static Api ApiOf(const char *n) {
  static const char *names[] = { "TextOutA", "TextOutW", "ExtTextOutA", "ExtTextOutW", "DrawTextA", "DrawTextW", "GetGlyphOutlineA", "GetGlyphOutlineW" };
  for (int i = 0; i < 8; i++) if (!strcmp(n, names[i])) return (Api)i;
  return A_None;
}
struct Live { uintptr_t at, base; int sig; Api api; bool on; };
static const int MaxSites = 16;
static Live Sites[MaxSites]; static int NSites = 0;
extern "C" void *DrawSitesOriginal[MaxSites] = {};
static volatile LONG Armed = 0, Installed = 0;
static bool Looked[64]; // a signature whose module was there and was scanned (found or not)
static CRITICAL_SECTION Lock;
// the current run
static int RunSite = -1; static DWORD RunVia1 = 0, RunVia2 = 0, RunTick = 0; static long X0, Y0, X1, Y1, LastX, LastY, Size;
static int RunChars = 0; static unsigned Run = 0; static std::string RunText;
// the enclosing function's first four arguments at the latest call, and at the run's first character (the pen is often one of them)
static DWORD FArgs[4], RunArgs[4];

static std::string Utf8W(const wchar_t *w, int n) {
  if (n <= 0) return std::string();
  int m = WideCharToMultiByte(CP_UTF8, 0, w, n, nullptr, 0, nullptr, nullptr); if (m <= 0) return std::string();
  std::string r(m, '\0'); WideCharToMultiByte(CP_UTF8, 0, w, n, &r[0], m, nullptr, nullptr); return r;
}
static std::string Utf8A(const char *s, int n) {
  if (n <= 0) return std::string();
  int k = MultiByteToWideChar(932, 0, s, n, nullptr, 0); if (k <= 0) return std::string();
  std::wstring w(k, L'\0'); MultiByteToWideChar(932, 0, s, n, &w[0], k); return Utf8W(w.data(), k);
}
static void FlushLocked() {
  if (!RunChars) return;
  std::string t = RunText;
  if (t.size() > 120) { size_t cut = 120; while (cut > 0 && ((unsigned char)t[cut] & 0xc0) == 0x80) cut--; t.resize(cut); }
  for (char &c : t) if (c == '\r' || c == '\n') c = ' ';
  const Live &s = Sites[RunSite];
  Msg::Log("ToMe_DRAWRUN engine=%s site=%d via=%lx/%lx run=%u n=%d x0=%ld y0=%ld x1=%ld y1=%ld size=%ld fargs=%lx,%lx,%lx,%lx text=%s", DrawSitesSig::Sigs[s.sig].id, RunSite,
           RunVia1 ? (unsigned long)(RunVia1 - s.base) : 0ul, RunVia2 ? (unsigned long)(RunVia2 - s.base) : 0ul, Run, RunChars, X0, Y0, X1, Y1, Size,
           (unsigned long)RunArgs[0], (unsigned long)RunArgs[1], (unsigned long)RunArgs[2], (unsigned long)RunArgs[3], t.c_str());
  RunChars = 0; RunText.clear();
}
static void Add(int k, DWORD via1, DWORD via2, long x, long y, long size, const std::string &text, int chars) {
  if (text.empty()) return;
  EnterCriticalSection(&Lock);
  DWORD now = GetTickCount();
  bool same = RunChars && k == RunSite && via1 == RunVia1 && now - RunTick < 1000 &&
              (x < 0 ? LastX < 0 : (y == LastY && x >= LastX && x - LastX <= (Size > 0 ? Size : 32) * 4));
  if (!same) { FlushLocked(); Run++; RunSite = k; RunVia1 = via1; RunVia2 = via2; X0 = X1 = x; Y0 = Y1 = y; Size = size; memcpy(RunArgs, FArgs, sizeof RunArgs); }
  if (x < X0) X0 = x; if (y < Y0) Y0 = y; if (x > X1) X1 = x; if (y > Y1) Y1 = y; if (size > Size) Size = size;
  RunText += text; RunChars += chars; LastX = x; LastY = y; RunTick = now;
  if (RunText.size() > 2000) FlushLocked();
  LeaveCriticalSection(&Lock);
}
// a stack word, 0 when it cannot be read (a caller without a frame pointer leaves anything in EBP)
static DWORD Peek(DWORD p) { __try { return p ? *(const DWORD *)p : 0; } __except (EXCEPTION_EXECUTE_HANDLER) { return 0; } }
static long FontHeight(HDC dc) { TEXTMETRICW tm; return dc && GetTextMetricsW(dc, &tm) ? tm.tmHeight : 0; }
static int CountChars(const std::string &u) { int n = 0; for (unsigned char c : u) if ((c & 0xc0) != 0x80) n++; return n; }
// the detour body: k = site, a = the API's arguments on the game's stack, ebp = the game's EBP at the call
static void OnCall(int k, const DWORD *a, DWORD ebp) {
  {
    if (k < 0 || k >= NSites) return;
    const Live &s = Sites[k]; DWORD via1 = 0, via2 = 0;
    int fr = DrawSitesSig::Sigs[s.sig].frame; DWORD ret = 0;
    if (fr == 1 && ebp) { ret = ebp + 4; DWORD up = Peek(ebp); if (up > ebp && up - ebp < 0x10000) via2 = Peek(up + 4); /* the caller may keep no frame: its EBP is then anything */ }
    else if (fr >= 8) ret = (DWORD)a + (DWORD)fr; /* no frame: the return address sits a fixed distance above the API's arguments */
    if (ret) { via1 = Peek(ret); for (int i = 0; i < 4; i++) FArgs[i] = Peek(ret + 4 + 4 * i); } else for (int i = 0; i < 4; i++) FArgs[i] = 0;
    HDC dc = (HDC)a[0]; long x = -1, y = -1; std::string t;
    switch (s.api) {
    case A_TextOutA: x = (long)a[1]; y = (long)a[2]; t = Utf8A((const char *)a[3], (int)a[4]); break;
    case A_TextOutW: x = (long)a[1]; y = (long)a[2]; t = Utf8W((const wchar_t *)a[3], (int)a[4]); break;
    case A_ExtTextOutA: if (a[3] & ETO_GLYPH_INDEX) return; x = (long)a[1]; y = (long)a[2]; t = Utf8A((const char *)a[5], (int)a[6]); break;
    case A_ExtTextOutW: if (a[3] & ETO_GLYPH_INDEX) return; x = (long)a[1]; y = (long)a[2]; t = Utf8W((const wchar_t *)a[5], (int)a[6]); break;
    case A_DrawTextA: { const RECT *r = (const RECT *)a[3]; int n = (int)a[2]; const char *p = (const char *)a[1]; if (n < 0) n = (int)strlen(p); if (r) { x = r->left; y = r->top; } t = Utf8A(p, n); break; }
    case A_DrawTextW: { const RECT *r = (const RECT *)a[3]; int n = (int)a[2]; const wchar_t *p = (const wchar_t *)a[1]; if (n < 0) n = (int)wcslen(p); if (r) { x = r->left; y = r->top; } t = Utf8W(p, n); break; }
    case A_GGOA: { /* every call of the signed site counts, a size query too (Softpal's one site is one: cb 0) */ UINT c = a[1]; char b[2]; int n = 0; if (c > 0xff) { b[0] = (char)(c >> 8); b[1] = (char)c; n = 2; } else { b[0] = (char)c; n = 1; } t = Utf8A(b, n); break; }
    case A_GGOW: { wchar_t w = (wchar_t)a[1]; t = Utf8W(&w, 1); break; }
    default: return;
    }
    Add(k, via1, via2, x, y, FontHeight(dc), t, CountChars(t));
  }
}
// a bad pointer from the game (or a run this cannot read) never reaches the game: the call goes on as if nothing happened
extern "C" void __cdecl DrawSitesOnCall(int k, const DWORD *a, DWORD ebp) { __try { OnCall(k, a, ebp); } __except (EXCEPTION_EXECUTE_HANDLER) {} }
// common gate, reached from a per-site stub `push k; jmp Gate` placed by MinHook on the call instruction: the API's
// arguments are on the stack, nothing of the call has run yet
static __declspec(naked) void Gate() {
  __asm {
    pushfd
    pushad
    mov eax, esp
    push dword ptr [eax + 8]     // EBP saved by pushad
    lea ecx, [eax + 40]          // the API's arguments (past the 32 bytes of pushad, flags, k)
    push ecx
    push dword ptr [eax + 36]    // k
    call DrawSitesOnCall
    add esp, 12
    popad
    popfd
    xchg eax, [esp]              // eax = k, the slot keeps the game's eax
    mov eax, DrawSitesOriginal[eax * 4]
    xchg eax, [esp]              // eax back, the slot = where the site's own call continues
    ret
  }
}
static void *Stub(int k) {
  unsigned char *p = (unsigned char *)VirtualAlloc(nullptr, 16, MEM_COMMIT | MEM_RESERVE, PAGE_EXECUTE_READWRITE); if (!p) return nullptr;
  p[0] = 0x68; memcpy(p + 1, &k, 4); p[5] = 0xe9; LONG rel = (LONG)((uintptr_t)&Gate - ((uintptr_t)p + 10)); memcpy(p + 6, &rel, 4);
  FlushInstructionCache(GetCurrentProcess(), p, 16); return p;
}
// the module's IAT slots of `api` (gdi32 / user32 imports by name)
static int Slots(uintptr_t base, const char *api, std::uint32_t *out, int max) {
  auto dos = (IMAGE_DOS_HEADER *)base; auto nt = (IMAGE_NT_HEADERS *)(base + dos->e_lfanew);
  auto &dir = nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_IMPORT]; if (!dir.VirtualAddress) return 0;
  int n = 0;
  for (auto d = (IMAGE_IMPORT_DESCRIPTOR *)(base + dir.VirtualAddress); d->Name && n < max; d++) {
    DWORD names = d->OriginalFirstThunk ? d->OriginalFirstThunk : d->FirstThunk;
    auto th = (IMAGE_THUNK_DATA32 *)(base + names);
    for (int i = 0; th[i].u1.AddressOfData && n < max; i++) {
      if (th[i].u1.Ordinal & IMAGE_ORDINAL_FLAG32) continue;
      auto ibn = (IMAGE_IMPORT_BY_NAME *)(base + th[i].u1.AddressOfData);
      if (!strcmp((const char *)ibn->Name, api)) out[n++] = (std::uint32_t)(base + d->FirstThunk + i * 4);
    }
  }
  return n;
}
// a packed module (UPX: Air, AVG32 in avg32_cn) describes only the packer's own imports in its header; the real import table is
// rebuilt in memory at the same place. Its slots are found by value: every call dword ptr [X] (FF 15) with X inside the module
// whose dword is the API's address
static int SlotsByValue(uintptr_t base, const char *api, std::uint32_t *out, int max) {
  FARPROC f = nullptr; const char *dlls[] = { "gdi32.dll", "user32.dll" };
  for (const char *d : dlls) { HMODULE h = GetModuleHandleA(d); if (h && (f = GetProcAddress(h, api))) break; }
  if (!f) return 0;
  auto nt = (IMAGE_NT_HEADERS *)(base + ((IMAGE_DOS_HEADER *)base)->e_lfanew); uintptr_t end = base + nt->OptionalHeader.SizeOfImage;
  auto sec = IMAGE_FIRST_SECTION(nt); int n = 0;
  for (int i = 0; i < nt->FileHeader.NumberOfSections; i++, sec++) {
    if (!(sec->Characteristics & IMAGE_SCN_MEM_EXECUTE)) continue;
    const unsigned char *c = (const unsigned char *)(base + sec->VirtualAddress); size_t size = sec->Misc.VirtualSize;
    for (size_t k = 0; k + 6 <= size; k++) {
      if (c[k] != 0xff || c[k + 1] != 0x15) continue;
      std::uint32_t x; memcpy(&x, c + k + 2, 4); if (x < base || x + 4 > end) continue;
      if (Peek(x) != (DWORD)(uintptr_t)f) continue;
      bool seen = false; for (int j = 0; j < n; j++) if (out[j] == x) seen = true;
      if (!seen && n < max) out[n++] = x;
    }
  }
  return n;
}
static void Look(int sig) {
  const auto &g = DrawSitesSig::Sigs[sig];
  if (sig >= 64 || Looked[sig]) return;
  HMODULE m = g.module[0] ? GetModuleHandleA(g.module) : GetModuleHandleA(nullptr); if (!m) return; /* not loaded yet: looked for again */
  Looked[sig] = true;
  uintptr_t base = (uintptr_t)m; std::uint32_t slots[8]; int ns = Slots(base, g.api, slots, 8); Api api = ApiOf(g.api);
  if (!ns) ns = SlotsByValue(base, g.api, slots, 8); /* a packed module: its header lists the packer's imports only */
  if (!ns || api == A_None) return;
  auto nt = (IMAGE_NT_HEADERS *)(base + ((IMAGE_DOS_HEADER *)base)->e_lfanew); auto sec = IMAGE_FIRST_SECTION(nt);
  size_t at[MaxSites]; uintptr_t found[MaxSites]; int total = 0;
  for (int i = 0; i < nt->FileHeader.NumberOfSections; i++, sec++) {
    if (!(sec->Characteristics & IMAGE_SCN_MEM_EXECUTE)) continue;
    int n = DrawSitesSig::Find((const unsigned char *)(base + sec->VirtualAddress), sec->Misc.VirtualSize, slots, ns, g.pre, at, MaxSites);
    for (int j = 0; j < n && j < MaxSites && total + j < MaxSites; j++) found[total + j] = base + sec->VirtualAddress + at[j];
    total += n;
  }
  if (total != g.count) { if (total) Msg::Log("ToMe_DRAWRUN engine=%s off: %d sites match (want %d)", g.id, total, g.count); return; }
  for (int j = 0; j < total && NSites < MaxSites; j++) Sites[NSites++] = { found[j], base, sig, api, false };
  Msg::Log("ToMe_DRAWRUN engine=%s found: %d site(s) of %s", g.id, total, g.api);
}
// every found site not hooked yet (sites of a DLL loaded later come after the first ones)
static void Install() {
  InterlockedExchange(&Installed, 1);
  for (int k = 0; k < NSites; k++) {
    if (Sites[k].on) continue; Sites[k].on = true;
    void *stub = Stub(k);
    if (!stub || MH_CreateHook((void *)Sites[k].at, stub, &DrawSitesOriginal[k]) != MH_OK || MH_EnableHook((void *)Sites[k].at) != MH_OK) {
      Msg::Log("ToMe_DRAWRUN engine=%s off: hook failed at %p", DrawSitesSig::Sigs[Sites[k].sig].id, (void *)Sites[k].at); continue; }
    Msg::Log("ToMe_DRAWRUN engine=%s on: site %d call %p (rva %lx)", DrawSitesSig::Sigs[Sites[k].sig].id, k, (void *)Sites[k].at, (unsigned long)(Sites[k].at - Sites[k].base));
  }
}
static bool Pending() { for (int i = 0; i < DrawSitesSig::SigCount && i < 64; i++) if (!Looked[i]) return true; return false; }
static void LookAll() { __try { for (int i = 0; i < DrawSitesSig::SigCount; i++) Look(i); } __except (EXCEPTION_EXECUTE_HANDLER) {} }
static bool RolesAsked() {
  wchar_t tmp[MAX_PATH]; DWORD n = GetTempPathW(MAX_PATH, tmp); if (!n || n >= MAX_PATH) return false;
  wchar_t path[MAX_PATH + 64]; swprintf_s(path, L"%sMeguLit\\draw\\%lu.txt", tmp, GetCurrentProcessId());
  HANDLE h = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr, OPEN_EXISTING, 0, nullptr);
  if (h == INVALID_HANDLE_VALUE) return false;
  char buf[256] = {}; DWORD got = 0; ReadFile(h, buf, sizeof(buf) - 2, &got, nullptr); CloseHandle(h);
  static const char want[] = "roles=1"; size_t k = 0; // UTF-16LE: every other byte 0
  for (DWORD i = 0; i < got; i++) { if (!buf[i]) continue; k = buf[i] == want[k] ? k + 1 : (buf[i] == want[0] ? 1 : 0); if (!want[k]) return true; }
  return false;
}
static DWORD WINAPI Watch(void *) {
  // for an hour: the control file decides, and a signature whose DLL is not loaded yet is looked for again
  for (int i = 0; i < 1800; i++) {
    if (Pending()) LookAll();
    if (NSites && RolesAsked()) Install();
    if (Installed && !Pending()) break;
    Sleep(2000);
  }
  // the last run of a line is written when nothing more comes for a while
  for (;;) { Sleep(300); EnterCriticalSection(&Lock); if (RunChars && GetTickCount() - RunTick > 250) FlushLocked(); LeaveCriticalSection(&Lock); }
}
// called once from checkengine (enginecontrol.cpp) whatever engine matched; never fails the engine
static void Arm() {
  if (InterlockedExchange(&Armed, 1)) return;
  InitializeCriticalSection(&Lock);
  LookAll();
  if (!NSites && !Pending()) return; /* nothing of this game, nothing to wait for */
  HANDLE t = CreateThread(nullptr, 0, Watch, nullptr, 0, nullptr); if (t) CloseHandle(t);
}
}
#else
namespace DrawSites { static void Arm() {} }
#endif
