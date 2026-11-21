// SPDX-License-Identifier: GPL-3.0-or-later
// engine-draw, BGI / Ethornell (docs/engine-draw-native.md, after the YU-RIS template YurisDraw.h). BGI lays every text out
// at once into a chain of glyph nodes (canvas x / y at node+0x10 / +0x14), draws the chain into the text sprite's bitmap and
// frees it; message window, speaker name, choices and menus all go through that one layout. BgiDrawSig.h finds, in any build:
//   the link site    the call right after the layout stored the node's x / y (the node is in a register, the glyph's
//                    character code and the previous node in the layout's stack, the text colour in its argument [ebp+c])
//   the chain free   the small function that walks node+0x44 and frees the nodes (called once the text is drawn)
// so every text BGI lays out comes out row by row (one record a row: same y), and an end record when its chain is freed:
//   ToMe_DRAWRUN engine=bgi run=N row=K n=<chars> x0= y0= x1= y1= size=<advance> color=aarrggbb via=<rva>,<rva>,<rva> [role=R] text=<UTF-8>
//   ToMe_DRAWRUN engine=bgi end run=N rows=K
// x0 / y0 = the first glyph's origin, x1 = the last glyph's origin (+ size is the row's right edge). Canvas pixels of that text
// sprite, not the screen: where each sprite sits on screen is learned per game (version diff) from these rows and the glyph /
// GPU positions. via = the return addresses of the layout and its two callers (image-relative): which script call laid the
// text out. BGI has no window object at this level (its system scripts make message, name and choice sprites through the
// same calls), so the role is data: this game's diff maps via prefixes to roles (draw.viaRoles -> "#role <via>=<role>" lines
// in the control file); a row whose via no line maps has no role field.
// Opt-in: nothing is hooked until MeguLit's control file %TEMP%\MeguLit\draw\<pid>.txt says roles=1 (draw.roles of this game's
// diff); a watcher thread checks it every 2 s. Both hooks always continue into the game's own code.
#pragma once
#include <windows.h>
#include <cstdio>
#include <cstring>
#include <cwchar>
#include <string>
#include "MinHook.h"
#include "BgiDrawSig.h"
namespace BgiDraw {
static void *LinkOriginal = nullptr, *FreeOriginal = nullptr;
static uintptr_t Image = 0, ImageEnd = 0, LinkAt = 0, FreeAt = 0;
static BgiDrawSig::Link Site{};
static volatile LONG Armed = 0, Installed = 0;
static CRITICAL_SECTION Lock;
// role map from the control file: "#role 3d40d,31e44=name" (via prefix, hex RVAs) -> role
struct RoleMap { char via[64]; char role[12]; };
static RoleMap Roles[16]; static int RoleCount = 0;
// the current text (one layout) and row
static uintptr_t Frame = 0; static unsigned Run = 0; static int Rows = 0; static bool Open = false;
static long RowY = 0, X0 = 0, X1 = 0, Size = 0; static int RowChars = 0; static unsigned Color = 0; static std::string RowText; static char Via[64] = "";

static std::string Utf8(const std::string &sjis) {
  int n = MultiByteToWideChar(932, 0, sjis.data(), (int)sjis.size(), nullptr, 0); if (n <= 0) return std::string();
  std::wstring w(n, L'\0'); MultiByteToWideChar(932, 0, sjis.data(), (int)sjis.size(), &w[0], n);
  int m = WideCharToMultiByte(CP_UTF8, 0, w.data(), n, nullptr, 0, nullptr, nullptr); std::string r(m, '\0');
  WideCharToMultiByte(CP_UTF8, 0, w.data(), n, &r[0], m, nullptr, nullptr); return r;
}
static const char *RoleOf(const char *via) {
  for (int i = 0; i < RoleCount; i++) { size_t k = strlen(Roles[i].via); if (k && !strncmp(via, Roles[i].via, k) && (via[k] == 0 || via[k] == ',')) return Roles[i].role; }
  return nullptr;
}
static void FlushRow() {
  if (!RowChars) return;
  std::string t = Utf8(RowText);
  if (t.size() > 120) { size_t cut = 120; while (cut > 0 && ((unsigned char)t[cut] & 0xc0) == 0x80) cut--; t.resize(cut); }
  for (char &c : t) if (c == '\r' || c == '\n') c = ' ';
  const char *role = RoleOf(Via);
  Msg::Log("ToMe_DRAWRUN engine=bgi run=%u row=%d n=%d x0=%ld y0=%ld x1=%ld y1=%ld size=%ld color=%08x via=%s%s%s text=%s", Run, Rows, RowChars, X0, RowY, X1, RowY, Size, Color, Via, role ? " role=" : "", role ? role : "", t.c_str());
  Rows++; RowChars = 0; RowText.clear();
}
static void EndRun() {
  FlushRow();
  if (Open) Msg::Log("ToMe_DRAWRUN engine=bgi end run=%u rows=%d", Run, Rows);
  Open = false; Rows = 0;
}
static uintptr_t Rva(uintptr_t a) { return a >= Image && a < ImageEnd ? a - Image : 0; }
static void CallChain(uintptr_t ebp, char *out, size_t cap) {
  uintptr_t r[3] = {}; uintptr_t f = ebp;
  __try { for (int i = 0; i < 3 && f; i++) { r[i] = Rva(((uintptr_t *)f)[1]); uintptr_t next = ((uintptr_t *)f)[0]; if (next <= f) break; f = next; } } __except (EXCEPTION_EXECUTE_HANDLER) {}
  _snprintf_s(out, cap, _TRUNCATE, "%x,%x,%x", (unsigned)r[0], (unsigned)r[1], (unsigned)r[2]);
}
// regs = the pushad block (edi, esi, ebp, esp, ebx, edx, ecx, eax), esp = the layout's ESP at the call
static void __cdecl OnLink(const DWORD *regs, const unsigned char *esp) {
  EnterCriticalSection(&Lock);
  __try {
    uintptr_t node = regs[7 - Site.node], ebp = regs[2];
    long x = *(const long *)(node + 0x10), y = *(const long *)(node + 0x14);
    unsigned code = *(const unsigned *)(esp + Site.ch);
    uintptr_t prev = *(const uintptr_t *)(esp + Site.prev);
    // the first glyph of a text links after the chain head, which lives in the caller's stack frame (0x48 bytes on the stack,
    // not a heap node); later glyphs link after a heap node (a glyph, or a mark node the layout inserts between glyphs)
    bool head = prev >= (uintptr_t)esp && prev < (uintptr_t)esp + 0x10000;
    if (!Open || head || ebp != Frame) {
      EndRun(); Run++; Open = true; Frame = ebp; Color = *(const unsigned *)(ebp + Site.color) | 0xff000000u;
      CallChain(ebp, Via, sizeof(Via));
    }
    if (RowChars && y != RowY) FlushRow();
    if (!RowChars) { RowY = y; X0 = X1 = x; Size = 0; }
    else { if (x > X1 && x - X1 < 400 && x - X1 > Size) Size = x - X1; if (x > X1) X1 = x; if (x < X0) X0 = x; }
    unsigned char b[2]; int k = BgiDrawSig::CharBytes(code & 0xffff, b);
    RowText.append((const char *)b, k); RowChars++;
    if (RowText.size() > 2000) FlushRow();
  } __except (EXCEPTION_EXECUTE_HANDLER) { RowChars = 0; RowText.clear(); Open = false; }
  LeaveCriticalSection(&Lock);
}
static __declspec(naked) void LinkGate() {
  __asm {
    pushfd
    pushad
    lea ecx, [esp + 36]          // the layout's ESP at the call
    push ecx
    lea ecx, [esp + 4]           // the pushad block
    push ecx
    call OnLink
    add esp, 8
    popad
    popfd
    jmp dword ptr [LinkOriginal]
  }
}
typedef void(__cdecl *FreeFn)(void *);
static void __cdecl FreeHook(void *head) {
  EnterCriticalSection(&Lock); __try { EndRun(); } __except (EXCEPTION_EXECUTE_HANDLER) {} LeaveCriticalSection(&Lock);
  ((FreeFn)FreeOriginal)(head);
}
static bool FindInImage(uintptr_t base) {
  auto dos = (IMAGE_DOS_HEADER *)base; auto nt = (IMAGE_NT_HEADERS *)(base + dos->e_lfanew); auto sec = IMAGE_FIRST_SECTION(nt);
  Image = base; ImageEnd = base + nt->OptionalHeader.SizeOfImage;
  int links = 0, frees = 0; BgiDrawSig::Link link{}; size_t freeAt = 0;
  for (int i = 0; i < nt->FileHeader.NumberOfSections; i++, sec++) {
    if (!(sec->Characteristics & IMAGE_SCN_MEM_EXECUTE)) continue;
    const unsigned char *p = (const unsigned char *)(base + sec->VirtualAddress); size_t n = sec->Misc.VirtualSize > 64 ? sec->Misc.VirtualSize - 64 : 0;
    BgiDrawSig::Link l[2]; int c = BgiDrawSig::FindLinks(p, n, l, 2);
    if (c >= 1 && !links) { link = l[0]; link.call += base + sec->VirtualAddress; }
    links += c;
    size_t f[2]; int d = BgiDrawSig::FindFrees(p, n, f, 2);
    if (d >= 1 && !frees) freeAt = f[0] + base + sec->VirtualAddress;
    frees += d;
  }
  if (links != 1) { Msg::Log("ToMe_DRAWRUN engine=bgi off: %d glyph link matches (want 1)", links); return false; }
  Site = link; LinkAt = link.call; FreeAt = frees == 1 ? freeAt : 0;
  return true;
}
static void Install() {
  if (InterlockedExchange(&Installed, 1)) return;
  if (MH_CreateHook((void *)LinkAt, (void *)LinkGate, &LinkOriginal) != MH_OK || MH_EnableHook((void *)LinkAt) != MH_OK) { Msg::Log("ToMe_DRAWRUN engine=bgi off: hook failed at %p", (void *)LinkAt); return; }
  // without the free hook a text ends when the next one starts (one text late); the record says so
  bool freeOk = FreeAt && MH_CreateHook((void *)FreeAt, (void *)FreeHook, &FreeOriginal) == MH_OK && MH_EnableHook((void *)FreeAt) == MH_OK;
  Msg::Log("ToMe_DRAWRUN engine=bgi on: link %p node=%d ch=[esp+%x] prev=[esp+%x] color=[ebp+%x] free=%p%s", (void *)LinkAt, Site.node, Site.ch, Site.prev, Site.color, freeOk ? (void *)FreeAt : nullptr, freeOk ? "" : " (no end records)");
}
// the control file (UTF-16LE): "#cfg roles=1 ..." and "#role <via>=<role>" lines; returns whether roles=1
static bool ReadControl() {
  wchar_t tmp[MAX_PATH]; DWORD n = GetTempPathW(MAX_PATH, tmp); if (!n || n >= MAX_PATH) return false;
  wchar_t path[MAX_PATH + 64]; swprintf_s(path, L"%sMeguLit\\draw\\%lu.txt", tmp, GetCurrentProcessId());
  HANDLE h = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr, OPEN_EXISTING, 0, nullptr);
  if (h == INVALID_HANDLE_VALUE) return false;
  static char buf[16384]; DWORD got = 0; ReadFile(h, buf, sizeof(buf) - 2, &got, nullptr); CloseHandle(h);
  // the role lines and the cfg line are ASCII: keep every non-zero byte of the UTF-16LE text
  std::string s; s.reserve(got / 2);
  for (DWORD i = 0; i < got; i++) if (buf[i] && (unsigned char)buf[i] < 0x80) s += buf[i]; else if (buf[i]) s += '?';
  bool roles = false; int count = 0; RoleMap maps[16];
  size_t at = 0;
  while (at < s.size()) {
    size_t e = s.find_first_of("\r\n", at); if (e == std::string::npos) e = s.size();
    std::string ln = s.substr(at, e - at); at = e + 1;
    if (!ln.compare(0, 4, "#cfg")) roles = ln.find("roles=1") != std::string::npos;
    else if (!ln.compare(0, 6, "#role ") && count < 16) {
      size_t eq = ln.find('='); if (eq == std::string::npos || eq <= 6) continue;
      std::string v = ln.substr(6, eq - 6), r = ln.substr(eq + 1);
      if (v.size() >= sizeof(maps[0].via) || r.empty() || r.size() >= sizeof(maps[0].role)) continue;
      strcpy_s(maps[count].via, v.c_str()); strcpy_s(maps[count].role, r.c_str()); count++;
    }
  }
  EnterCriticalSection(&Lock); memcpy(Roles, maps, sizeof(maps)); RoleCount = count; LeaveCriticalSection(&Lock);
  return roles;
}
static DWORD WINAPI Watch(void *) { for (int i = 0; i < 1800; i++) { if (ReadControl() && !Installed) Install(); Sleep(2000); } return 0; }
// called from BGI::attach_function; never fails the engine
static void Arm(uintptr_t imageBase) {
  if (InterlockedExchange(&Armed, 1)) return;
  InitializeCriticalSection(&Lock);
  __try { if (!FindInImage(imageBase)) return; } __except (EXCEPTION_EXECUTE_HANDLER) { return; }
  HANDLE t = CreateThread(nullptr, 0, Watch, nullptr, 0, nullptr); if (t) CloseHandle(t);
}
}
