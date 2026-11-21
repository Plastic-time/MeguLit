// SPDX-License-Identifier: GPL-3.0-or-later
// engine-draw, CatSystem2 (docs/engine-draw-native.md, built like YurisDraw.h): every glyph a CatSystem2 text object composes,
// found by structure in any build (CS2DrawSig.h; ISLAND matches one composer of each shape: 0x545aa2 origin, 0x543d06
// direct). At the hook point the record register holds the glyph record (SJIS code, fill colour, x, y, size) and the stack
// the string's origin, so each run of glyphs comes out as one record (MESSAGE_SIZE caps a line at 500 bytes):
//   ToMe_DRAWRUN engine=cs2 run=N shape=origin|direct role=<line|name|choice|button|system> cls=<owner class> owner=<hex>
//                rec=<first record> n=<chars> rb=<furigana glyphs> x0= y0= x1= y1= size= color=rrggbb text=<UTF-8, cut at 120 bytes>
//   ToMe_DRAWRUN engine=cs2 page owner=<hex> cls=<class>      the owner's text was laid out anew from its first record with
//                                                              other text: a new page / the old text cleared (heuristic)
// Coordinates: the string surface's pixels (record x/y + origin; x1/y1 = the last glyph's pen + size), not the screen.
// Role: the text-owning task found on the stack (its `this` is saved by the update functions under it: ISLAND
// kcTaskStringPlaneNv 0x4fc2c0 -> 0x545700 pushes edi, kcTaskStringPlane2 0x4fb470 -> 0x544220 pushes edi), by its MSVC
// RTTI class or a base class of it, so no addresses per build:
//   kcTaskStringPlane / 2 / Nv -> line; one short row (<=12 chars, no sentence punctuation) of another string plane than the
//   last line's -> name (a guess: names may share the line's plane in some builds); kcFEScriptObjButton / kcTaskButton ->
//   choice when >= 6 chars, else button (a guess); kcFEScriptObj(Nv/Log)String / StrTable, kcTaskMesList -> system
//   (MesList / LogString: id log). No class found -> system, cls=?.
// Furigana: glyphs under 70% of the run's largest size are counted in rb=, not put in text or the box (the game's ruby
// readings come with the script text: ToMeIslandDraw RubyPairs / LunaHook EmbedCS2).
// Opt-in: nothing is hooked until MeguLit's control file %TEMP%\MeguLit\draw\<pid>.txt says roles=1 (draw.roles of this
// game's diff); a watcher thread checks it every 2 s. The game's own code runs unchanged in every case (read only).
#pragma once
#include <windows.h>
#include <cstdio>
#include <cstring>
#include <string>
#include "MinHook.h"
#include "CS2DrawSig.h"
namespace CS2Draw {
static void *Original[2] = {};
static uintptr_t HookAt[2] = {};
static CS2DrawSig::Hit Sig[2] = {};
static volatile LONG Armed = 0, Installed = 0;
static SRWLOCK Lock = SRWLOCK_INIT;

// ---- owner classes (RTTI) ----
enum Role { RLine, RName, RChoice, RButton, RSystem };
static const char *RoleName[] = {"line", "name", "choice", "button", "system"};
struct Known { const char *cls; int kind; };   // kind: 0 string plane, 1 button, 2 system, 3 log
static const Known Classes[] = {
  {"kcTaskStringPlane", 0}, {"kcTaskStringPlane2", 0}, {"kcTaskStringPlaneNv", 0},
  {"kcFEScriptObjButton", 1}, {"kcTaskButton", 1},
  {"kcFEScriptObjString", 2}, {"kcFEScriptObjNvString", 2}, {"kcFEScriptObjStrTable", 2},
  {"kcFEScriptObjLogString", 3}, {"kcTaskMesList", 3}};
struct Vt { uintptr_t vtable; int kind; const char *cls; };
static Vt Vts[96]; static int VtCount = 0;
static uintptr_t ImgLo = 0, ImgHi = 0;
static bool InImage(uintptr_t p, size_t n) { return p >= ImgLo && p + n <= ImgHi && p + n > p; }
static const char *TypeName(uintptr_t td) { return InImage(td + 8, 8) ? (const char *)(td + 8) : nullptr; }
// the first listed class among a type descriptor's name (".?AV<name>@@")
static int KnownIndex(const char *n) {
  if (!n || strncmp(n, ".?AV", 4)) return -1;
  for (int i = 0; i < (int)(sizeof(Classes) / sizeof(*Classes)); i++) { size_t k = strlen(Classes[i].cls); if (!strncmp(n + 4, Classes[i].cls, k) && !strcmp(n + 4 + k, "@@")) return i; }
  return -1;
}
// a complete object locator (32-bit: signature 0, offset, cdOffset, type descriptor, class hierarchy) whose class or a base
// class is listed: the listed class nearest the most derived one
static int LocatorClass(uintptr_t col) {
  if (!InImage(col, 20)) return -1; const DWORD *c = (const DWORD *)col;
  if (c[0] != 0 || c[1] != 0 || !InImage(c[3], 16)) return -1;
  int direct = KnownIndex(TypeName(c[3])); if (direct >= 0) return direct;
  if (!InImage(c[4], 16)) return -1; const DWORD *h = (const DWORD *)(uintptr_t)c[4];
  DWORD bases = h[2]; if (bases > 64 || !InImage(h[3], bases * 4)) return -1;
  const DWORD *arr = (const DWORD *)(uintptr_t)h[3];
  for (DWORD i = 1; i < bases; i++) { if (!InImage(arr[i], 4)) return -1; int k = KnownIndex(TypeName(*(const DWORD *)(uintptr_t)arr[i])); if (k >= 0) return k; }
  return -1;
}
// every vtable of a listed class (or a subclass): a pointer to such a locator in a data section is vtable[-1]
static void FindVtables(uintptr_t base) {
  auto dos = (IMAGE_DOS_HEADER *)base; auto nt = (IMAGE_NT_HEADERS *)(base + dos->e_lfanew);
  ImgLo = base; ImgHi = base + nt->OptionalHeader.SizeOfImage;
  auto sec = IMAGE_FIRST_SECTION(nt);
  for (int s = 0; s < nt->FileHeader.NumberOfSections; s++, sec++) {
    if ((sec->Characteristics & IMAGE_SCN_MEM_EXECUTE) || !(sec->Characteristics & IMAGE_SCN_MEM_READ)) continue;
    const DWORD *p = (const DWORD *)(base + sec->VirtualAddress); size_t n = sec->Misc.VirtualSize / 4;
    for (size_t i = 0; i + 1 < n && VtCount < 96; i++) {
      DWORD v = p[i]; if (!InImage(v, 20) || (v & 3)) continue;
      int k = LocatorClass(v); if (k < 0) continue;
      uintptr_t vt = (uintptr_t)&p[i + 1]; bool dup = false; for (int j = 0; j < VtCount; j++) if (Vts[j].vtable == vt) dup = true;
      if (!dup) Vts[VtCount++] = {vt, Classes[k].kind, Classes[k].cls};
    }
  }
}
// a heap object's vtable, 0 when the stack slot is not a readable object pointer
static uintptr_t VtableAt(const unsigned char *slot, uintptr_t &object) {
  __try {
    uintptr_t p = *(const uintptr_t *)slot; object = p;
    if (p < 0x10000 || (p & 3)) return 0; // heap or static task objects alike
    uintptr_t vt = *(const uintptr_t *)p; return InImage(vt, 4) ? vt : 0;
  } __except (EXCEPTION_EXECUTE_HANDLER) { return 0; }
}
// the innermost listed object on the stack above the hook point
static const Vt *OwnerOf(const unsigned char *callerEsp, uintptr_t &owner) {
  owner = 0; if (!VtCount) return nullptr;
  for (int k = 0; k < 0x1000; k += 4) {
    uintptr_t p = 0, vt = VtableAt(callerEsp + k, p); if (!vt) continue;
    for (int j = 0; j < VtCount; j++) if (Vts[j].vtable == vt) { owner = p; return &Vts[j]; }
  }
  return nullptr;
}

// ---- runs ----
static std::string Utf8(const std::string &sjis) {
  int n = MultiByteToWideChar(932, 0, sjis.data(), (int)sjis.size(), nullptr, 0); if (n <= 0) return std::string();
  std::wstring w(n, L'\0'); MultiByteToWideChar(932, 0, sjis.data(), (int)sjis.size(), &w[0], n);
  int m = WideCharToMultiByte(CP_UTF8, 0, w.data(), n, nullptr, 0, nullptr, nullptr); std::string r(m, '\0');
  WideCharToMultiByte(CP_UTF8, 0, w.data(), n, &r[0], m, nullptr, nullptr); return r;
}
struct RunState {
  int shape = -1; long ox = 0, oy = 0; uintptr_t first = 0, last = 0, owner = 0; const Vt *cls = nullptr;
  long x0 = 0, y0 = 0, x1 = 0, y1 = 0, size = 0; int chars = 0, ruby = 0; DWORD colour = 0; bool punct = false; std::string text;
};
static RunState Cur; static unsigned Run = 0;
static uintptr_t LineOwner = 0;
struct Page { uintptr_t owner, first; unsigned hash; };
static Page Pages[16] = {}; static unsigned PageNext = 0;
static unsigned Recent[64] = {}; static unsigned RecentNext = 0;
static unsigned Hash(const std::string &s, unsigned seed) { unsigned h = 2166136261u ^ seed; for (unsigned char c : s) h = (h ^ c) * 16777619u; return h; }
static bool SentencePunct(unsigned c) { return c == 0x8141 || c == 0x8142 || c == 0x8148 || c == 0x8149 || c == 0x8163 || (c >= 0x8175 && c <= 0x8178); }
static void Flush() {
  RunState &r = Cur; if (!r.chars) { r = RunState(); return; }
  unsigned h = Hash(r.text, 0);
  // page: this owner laid its text out anew from (or before) the record its page started at, and the text differs
  if (r.owner) {
    Page *pg = nullptr; for (auto &p : Pages) if (p.owner == r.owner) pg = &p;
    if (!pg) { pg = &Pages[PageNext++ % 16]; pg->owner = r.owner; pg->first = r.first; pg->hash = h; }
    else if (r.first <= pg->first && h != pg->hash) { pg->first = r.first; pg->hash = h; Msg::Log("ToMe_DRAWRUN engine=cs2 page owner=%x cls=%s", (unsigned)r.owner, r.cls ? r.cls->cls : "?"); }
    else if (r.first == pg->first) pg->hash = h;
  }
  int role = RSystem;
  if (r.cls) switch (r.cls->kind) {
    case 0: {
      bool line = r.punct || r.chars > 12 || r.y1 - r.y0 > r.size;
      if (line) { role = RLine; LineOwner = r.owner; } else role = LineOwner && r.owner != LineOwner ? RName : RLine;
      break; }
    case 1: role = r.chars >= 6 ? RChoice : RButton; break;
    default: role = RSystem; break;
  }
  // the same run drawn again (a redraw of the page) is logged once
  unsigned key = Hash(r.text, (unsigned)r.owner ^ (unsigned)r.first ^ (unsigned)(r.x0 * 131 + r.y0)), seen = 0;
  for (unsigned k : Recent) if (k == key) seen = 1;
  if (!seen) {
    Recent[RecentNext++ % 64] = key; Run++;
    std::string t = Utf8(r.text);
    if (t.size() > 120) { size_t cut = 120; while (cut > 0 && ((unsigned char)t[cut] & 0xc0) == 0x80) cut--; t.resize(cut); }
    for (char &c : t) if (c == '\r' || c == '\n') c = ' ';
    Msg::Log("ToMe_DRAWRUN engine=cs2 run=%u shape=%s role=%s cls=%s owner=%x rec=%x n=%d rb=%d x0=%ld y0=%ld x1=%ld y1=%ld size=%ld color=%06x text=%s",
             Run, r.shape ? "direct" : "origin", RoleName[role], r.cls ? r.cls->cls : "?", (unsigned)r.owner, (unsigned)r.first, r.chars, r.ruby,
             r.x0, r.y0, r.x1, r.y1, r.size, (unsigned)(r.colour & 0xffffff), t.c_str());
  }
  r = RunState();
}
// one glyph as the hook point sees it (plain reads, no C++ objects: __try)
struct Glyph { uintptr_t rec; unsigned c; long size, ox, oy, x, y; DWORD colour; };
static bool ReadGlyph(int shape, const DWORD *frame, Glyph &g) {
  const CS2DrawSig::Hit &s = Sig[shape]; const unsigned char *esp = (const unsigned char *)frame + 36;
  __try {
    g.rec = frame[7 - s.rec]; // pushad: edi esi ebp esp ebx edx ecx eax
    g.c = *(const WORD *)(g.rec + s.chr); g.size = *(const long *)(g.rec + s.size);
    g.ox = s.ox >= 0 ? *(const long *)(esp + s.ox) : 0; g.oy = s.ox >= 0 ? *(const long *)(esp + s.ox + 4) : 0;
    g.x = *(const long *)(g.rec + s.x) + g.ox; g.y = *(const long *)(g.rec + s.y) + g.oy;
    g.colour = 0; if (s.colour >= 0) { const unsigned char *k = (const unsigned char *)(g.rec + s.colour); g.colour = (DWORD)k[0] << 16 | (DWORD)k[1] << 8 | k[2]; }
    return true;
  } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
static void __stdcall OnGlyph(int shape, const DWORD *frame) {
  Glyph g; if (!ReadGlyph(shape, frame, g)) return;
  AcquireSRWLockExclusive(&Lock);
  RunState &r = Cur;
  bool same = r.chars && r.shape == shape && r.ox == g.ox && r.oy == g.oy && g.rec > r.last && g.rec - r.last <= 0x400;
  if (!same) {
    Flush(); r.shape = shape; r.ox = g.ox; r.oy = g.oy; r.first = g.rec; r.cls = OwnerOf((const unsigned char *)frame + 36, r.owner);
    r.x0 = r.x1 = g.x; r.y0 = r.y1 = g.y; r.colour = g.colour;
  }
  r.last = g.rec;
  if (g.size > 0 && g.size < 400 && g.c && g.c != 0xffff) {
    if (r.size && g.size * 10 < r.size * 7) r.ruby++;
    else {
      if (g.size > r.size) r.size = g.size;
      if (g.x < r.x0) r.x0 = g.x; if (g.y < r.y0) r.y0 = g.y; if (g.x + g.size > r.x1) r.x1 = g.x + g.size; if (g.y + g.size > r.y1) r.y1 = g.y + g.size;
      if (g.c > 0xff) { r.text += (char)(g.c >> 8); r.text += (char)(g.c & 0xff); } else r.text += (char)g.c;
      if (SentencePunct(g.c)) r.punct = true;
      r.chars++;
    }
  }
  if (r.text.size() > 2000) Flush();
  ReleaseSRWLockExclusive(&Lock);
}
static __declspec(naked) void GateOrigin() {
  __asm {
    pushfd
    pushad
    push esp                      // the pushad frame
    push 0                        // shape origin
    call OnGlyph                  // __stdcall: pops both
    popad
    popfd
    jmp dword ptr [Original]
  }
}
static __declspec(naked) void GateDirect() {
  __asm {
    pushfd
    pushad
    push esp
    push 1                        // shape direct
    call OnGlyph
    popad
    popfd
    jmp dword ptr [Original + 4]
  }
}
// the module's executable sections: exactly one origin composer (message windows) and at most one direct one
static bool FindInImage(uintptr_t base) {
  auto dos = (IMAGE_DOS_HEADER *)base; auto nt = (IMAGE_NT_HEADERS *)(base + dos->e_lfanew); auto sec = IMAGE_FIRST_SECTION(nt);
  int count[2] = {};
  for (int i = 0; i < nt->FileHeader.NumberOfSections; i++, sec++) {
    if (!(sec->Characteristics & IMAGE_SCN_MEM_EXECUTE) || sec->Misc.VirtualSize < 64) continue;
    CS2DrawSig::Hit h[4]; int n = CS2DrawSig::Find((const unsigned char *)(base + sec->VirtualAddress), sec->Misc.VirtualSize - 48, h, 4);
    for (int k = 0; k < n && k < 4; k++) { int sh = h[k].shape; if (!count[sh]) { Sig[sh] = h[k]; HookAt[sh] = base + sec->VirtualAddress + h[k].hook; } count[sh]++; }
    if (n > 4) count[0] += 2; // too many to tell
  }
  if (count[0] != 1 || count[1] > 1) { Msg::Log("ToMe_DRAWRUN engine=cs2 off: %d origin / %d direct composers (want 1 / at most 1)", count[0], count[1]); return false; }
  if (!count[1]) HookAt[1] = 0;
  return true;
}
static void Install() {
  if (InterlockedExchange(&Installed, 1)) return;
  void *gates[2] = {(void *)GateOrigin, (void *)GateDirect};
  for (int sh = 0; sh < 2; sh++) {
    if (!HookAt[sh]) continue;
    if (MH_CreateHook((void *)HookAt[sh], gates[sh], &Original[sh]) != MH_OK || MH_EnableHook((void *)HookAt[sh]) != MH_OK) {
      Msg::Log("ToMe_DRAWRUN engine=cs2 off: hook failed at %p", (void *)HookAt[sh]);
      for (int k = 0; k <= sh; k++) if (HookAt[k]) { MH_DisableHook((void *)HookAt[k]); MH_RemoveHook((void *)HookAt[k]); }
      return;
    }
    const auto &s = Sig[sh];
    Msg::Log("ToMe_DRAWRUN engine=cs2 on: %s %p rec=%d char=+%x size=+%x x=+%x y=+%x colour=+%x origin=[esp+%x] classes=%d",
             sh ? "direct" : "origin", (void *)HookAt[sh], s.rec, s.chr, s.size, s.x, s.y, s.colour, s.ox, VtCount);
  }
}
static bool RolesAsked() {
  wchar_t tmp[MAX_PATH]; DWORD n = GetTempPathW(MAX_PATH, tmp); if (!n || n >= MAX_PATH) return false;
  wchar_t path[MAX_PATH + 64]; swprintf_s(path, L"%sMeguLit\\draw\\%lu.txt", tmp, GetCurrentProcessId());
  HANDLE h = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr, OPEN_EXISTING, 0, nullptr);
  if (h == INVALID_HANDLE_VALUE) return false;
  char buf[256] = {}; DWORD got = 0; ReadFile(h, buf, sizeof(buf) - 2, &got, nullptr); CloseHandle(h);
  // UTF-8 or UTF-16LE: "#cfg roles=1" (zero bytes skipped)
  static const char want[] = "roles=1"; size_t k = 0;
  for (DWORD i = 0; i < got; i++) { if (!buf[i]) continue; k = buf[i] == want[k] ? k + 1 : (buf[i] == want[0] ? 1 : 0); if (!want[k]) return true; }
  return false;
}
static DWORD WINAPI Watch(void *) { for (int i = 0; i < 1800 && !Installed; i++) { if (RolesAsked()) Install(); Sleep(2000); } return 0; }
// called from CatSystem::attach_function and ToMeIslandDraw::Install; never fails the engine
static void Arm(uintptr_t imageBase) {
  if (InterlockedExchange(&Armed, 1)) return;
  __try { if (!FindInImage(imageBase)) return; FindVtables(imageBase); } __except (EXCEPTION_EXECUTE_HANDLER) { return; }
  HANDLE t = CreateThread(nullptr, 0, Watch, nullptr, 0, nullptr); if (t) CloseHandle(t);
}
}
