// SPDX-License-Identifier: GPL-3.0-or-later
// engine-draw, MAGES. (docs/engine-draw-native.md; YU-RIS is the template): read what MAGES draws from the engine's own
// dialogue pages instead of from the screen. Every MAGES build seen so far (STEINS;GATE, STEINS;GATE 0, CHAOS;CHILD,
// 線形拘束のフェノグラム, 比翼恋理のだーりん) keeps each text window's characters in a static array of pages (layout in
// MagesDrawSig.h / tools/engine-sigs/mages-draw.cjs) and fills a page only through one function, the commit, which copies
// the laid-out SC3 string (u16 codes; 0x8000|c is an SC3 control kept as a marker: 0x8001 name start, 0x8002 name end)
// into the page. So at the commit we have, from the engine itself:
//   - every character's glyph code (row*64+col = the SC3 character code, decoded with the game's charset by the kernel),
//     its box (charDisplayX/Y, glyphDisplayWidth/Height, times the engine's own scale: game canvas pixels, 1920x1080 for
//     the Steam builds), its colour,
//   - which characters are the speaker's name (between the markers) and which page it is: the SC3 Mes instruction commits
//     into the thread's window page (role line), Sel into page 7 (role choice; the page's per-character flag = the choice
//     number) and SysSel into page 5 + window (role choice, system selections). Verified statically in all five exes
//     (Sel / SysSel / Mes are opcodes 01 12 / 01 14 / 01 0C, Committee of Zero's impacto opcode tables).
// The two page clears (memset of the page's arrays, pageLength = 0) are a clear event; drawDialogue being called for a page
// is its first frame on screen. One page = one unit until it is cleared: a sentence the game commits in several pieces
// (SC3 waits / PrintInParallel; CHAOS;CHILD) is one line with a growing text, never two lines.
// Records (hook-diagnostics.log, MESSAGE_SIZE caps a line at 500 bytes, so long pages continue in more lines):
//   ToMe_DRAWRUN engine=mages on: <rvas> | off: <why>
//   ToMe_DRAWRUN engine=mages ev=add page=P seq=S role=line|choice|system from=F n=N scale=1.5 codes=hhhh..   (markers too; 80 a line)
//   ToMe_DRAWRUN engine=mages ev=more page=P seq=S codes=hhhh..
//   ToMe_DRAWBOX engine=mages page=P seq=S at=I rects=x,y,w,h;.. color=rrggbb,.. flag=f,..  (12 characters a line, in order)
//   ToMe_DRAWRUN engine=mages ev=clear page=P seq=S         ToMe_DRAWRUN engine=mages ev=show page=P seq=S opacity=O
//   ToMe_DRAWRUN engine=mages ev=view bb=W,H client=W,H     (the back buffer the 16:9 scene is drawn into, width-fit and
//     centred vertically, and the client area Present stretches it over: the kernel places the 1920x1080 canvas from these)
//   ToMe_DRAWRUN engine=mages ev=glyph site=<rva> n=N box=x,y,w,h size=H color=rrggbb   (any other text the engine draws:
//     menus, backlog, phone; one line when a caller's run changes; role from the version layer's site table)
// The kernel side (tools/engine-sigs/mages-draw.cjs parse + PageTracker) decodes the codes and assembles the pages.
// Opt-in: nothing is hooked until MeguLit's control file %TEMP%\MeguLit\draw\<pid>.txt says roles=1 (draw.roles of this
// game's diff); when the version layer has this exe's address table (draw.engineTable, a "#table mages ..." line) it must
// agree with the signature or nothing is hooked. Every hook calls the game's own function and changes nothing it sees.
#pragma once
#ifdef _WIN64
// MAGES ships 32-bit only; a 64-bit build that includes this header gets a no-op
#include <cstdint>
namespace MagesDraw { inline void Arm(uintptr_t) {} }
#else
#include <windows.h>
#include <cstdio>
#include <cstring>
#include <string>
#include "MinHook.h"
#include "MagesDrawSig.h"
#pragma comment(lib, "user32.lib") // the game window's client size (ev=view)
namespace MagesDraw {
static const int MaxPages = 10, SelPage = 7, SysSelPage = 5;
static uintptr_t Base = 0, Dlg[2] = {0, 0}, DlgEnd[2] = {0, 0}, Glyph = 0, Commit = 0, Clear[4] = {0, 0, 0, 0}; static int Clears = 0;
static uintptr_t Pages = 0, Count = 0, Codes = 0, Info = 0, ScaleAt = 0; static std::uint32_t Stride = 0; static int Chars = 0;
static void *CommitOrig = nullptr, *ClearOrig[4] = {}, *DlgOrig[2] = {}, *GlyphOrig = nullptr;
static volatile LONG Armed = 0, Installed = 0;
static unsigned Seq[MaxPages] = {}; static bool Shown[MaxPages] = {};
static uintptr_t Backbuffer = 0; // u16 width, u16 at +4 height (0 = not found: the kernel takes the client size)
static HWND GameWindow = nullptr; static int ViewSent[4] = {-1, -1, -1, -1};
static BOOL CALLBACK FindWindowOfProcess(HWND h, LPARAM out) {
  DWORD pid = 0; GetWindowThreadProcessId(h, &pid); RECT r;
  if (pid == GetCurrentProcessId() && IsWindowVisible(h) && !GetWindow(h, GW_OWNER) && GetClientRect(h, &r) && r.right > 200 && r.bottom > 150) { *(HWND *)out = h; return FALSE; }
  return TRUE;
}
// where the canvas ends up: the back buffer size (the game's) and the client size it is stretched over; a line when either changes
static void View() {
  int bw = 0, bh = 0, cw = 0, ch = 0;
  __try { if (Backbuffer) { bw = *(const std::uint16_t *)Backbuffer; bh = *(const std::uint16_t *)(Backbuffer + 4); } } __except (EXCEPTION_EXECUTE_HANDLER) { bw = bh = 0; }
  if (!GameWindow || !IsWindow(GameWindow)) { GameWindow = nullptr; EnumWindows(FindWindowOfProcess, (LPARAM)&GameWindow); }
  RECT r; if (GameWindow && GetClientRect(GameWindow, &r)) { cw = r.right - r.left; ch = r.bottom - r.top; }
  if (bw == ViewSent[0] && bh == ViewSent[1] && cw == ViewSent[2] && ch == ViewSent[3]) return;
  ViewSent[0] = bw; ViewSent[1] = bh; ViewSent[2] = cw; ViewSent[3] = ch;
  Msg::Log("ToMe_DRAWRUN engine=mages ev=view bb=%d,%d client=%d,%d", bw, bh, cw, ch);
}
static float Scale() { float s = 1.0f; __try { s = *(const float *)ScaleAt; } __except (EXCEPTION_EXECUTE_HANDLER) {} return s > 0.1f && s < 8.0f ? s : 1.0f; }
static std::uint8_t *PageAt(int p) { return (std::uint8_t *)(Pages + (uintptr_t)p * Stride); }
static int PageLength(int p) { int n = *(const int *)(PageAt(p) + 0xc); return n >= 0 && n <= Chars ? n : -1; }

// ---- the commit: snapshot the layout before, read the new characters after ----
static int CommitPage = -1, CommitFrom = 0, LayoutN = 0; static std::uint16_t LayoutCodes[1024]; static bool LayoutSkip[1024];
static void __cdecl OnCommitEnter(const std::uint32_t *callerEsp) {
  CommitPage = -1;
  __try {
    int page = (int)callerEsp[1]; if (page < 0 || page >= MaxPages) return;
    int n = *(const int *)Count; if (n <= 0 || n > 1024) return;
    for (int i = 0; i < n; i++) { LayoutCodes[i] = *(const std::uint16_t *)(Codes + 2 * i); LayoutSkip[i] = *(const std::uint32_t *)(Info + 16 * i) == 0; }
    int from = PageLength(page); if (from < 0) return;
    LayoutN = n; CommitFrom = from; CommitPage = page;
  } __except (EXCEPTION_EXECUTE_HANDLER) { CommitPage = -1; }
}
static const char *RoleOf(int page) { return page == SelPage || (page >= SysSelPage && page < SelPage) ? "choice" : page < SysSelPage ? "line" : "system"; }
// what one commit added, copied out of the game's memory first (no C++ objects next to __try), formatted after
static struct Added { int page, from, to, nCodes; float scale; std::uint16_t codes[1024]; int rect[2000][4]; unsigned color[2000]; std::uint8_t flag[2000]; } Add;
static bool ReadAdded(int page) {
  __try {
    int to = PageLength(page); if (to < CommitFrom) return false;
    if (to - CommitFrom > 2000) to = CommitFrom + 2000;
    float s = Scale(); const std::uint8_t *pg = PageAt(page) + 0x3c; int S = Chars, at = CommitFrom, n = 0;
    for (int i = 0; i < LayoutN && n < 1024; i++) {
      std::uint16_t c = LayoutCodes[i];
      if (!(c & 0x8000)) { if (LayoutSkip[i]) continue; if (at >= to) break; c = (std::uint16_t)(pg[13 * S + at] * 64 + pg[12 * S + at]); at++; }
      Add.codes[n++] = c;
    }
    const std::int16_t *x = (const std::int16_t *)(pg + 16 * S), *y = (const std::int16_t *)(pg + 18 * S), *w = (const std::int16_t *)(pg + 20 * S), *h = (const std::int16_t *)(pg + 22 * S);
    for (int k = CommitFrom; k < to; k++) { int j = k - CommitFrom; Add.rect[j][0] = (int)(x[k] * s); Add.rect[j][1] = (int)(y[k] * s); Add.rect[j][2] = (int)(w[k] * s); Add.rect[j][3] = (int)(h[k] * s);
      Add.color[j] = ((const std::uint32_t *)(pg + 4 * S))[k] & 0xffffff; Add.flag[j] = pg[24 * S + k]; }
    Add.page = page; Add.from = CommitFrom; Add.to = to; Add.nCodes = n; Add.scale = s; return true;
  } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
static void OnCommitLeave() {
  int page = CommitPage; CommitPage = -1; if (page < 0 || !ReadAdded(page)) return;
  if (Add.from == 0) { Seq[page]++; Shown[page] = false; }
  // codes: the layout's markers and the page's glyph codes in order, 80 a line (MESSAGE_SIZE 500)
  for (int i = 0, line = 0; i < Add.nCodes || (i == 0 && line == 0); line++) {
    std::string codes; for (int k = 0; k < 80 && i < Add.nCodes; k++, i++) { char h[8]; snprintf(h, sizeof h, "%04x", Add.codes[i]); codes += h; }
    if (!line) Msg::Log("ToMe_DRAWRUN engine=mages ev=add page=%d seq=%u role=%s from=%d n=%d scale=%.3g codes=%s", page, Seq[page], RoleOf(page), Add.from, Add.to - Add.from, Add.scale, codes.c_str());
    else Msg::Log("ToMe_DRAWRUN engine=mages ev=more page=%d seq=%u codes=%s", page, Seq[page], codes.c_str());
    if (!Add.nCodes) break;
  }
  // boxes (game canvas pixels), colours, the page's flag byte (choice number on choice pages), 12 characters a line
  for (int i = Add.from; i < Add.to; i += 12) {
    std::string r, col, flag; int end = i + 12 < Add.to ? i + 12 : Add.to;
    for (int k = i; k < end; k++) { int j = k - Add.from; char t[64];
      snprintf(t, sizeof t, "%s%d,%d,%d,%d", k > i ? ";" : "", Add.rect[j][0], Add.rect[j][1], Add.rect[j][2], Add.rect[j][3]); r += t;
      snprintf(t, sizeof t, "%s%06x", k > i ? "," : "", Add.color[j]); col += t;
      snprintf(t, sizeof t, "%s%u", k > i ? "," : "", (unsigned)Add.flag[j]); flag += t; }
    Msg::Log("ToMe_DRAWBOX engine=mages page=%d seq=%u at=%d rects=%s color=%s flag=%s", page, Seq[page], i, r.c_str(), col.c_str(), flag.c_str());
  }
}
// ---- clears: page lengths before / after ----
static int Before[MaxPages];
static void __cdecl OnClearEnter(const std::uint32_t *) { __try { for (int p = 0; p < MaxPages; p++) Before[p] = PageLength(p); } __except (EXCEPTION_EXECUTE_HANDLER) {} }
static void OnClearLeave() {
  __try { for (int p = 0; p < MaxPages; p++) if (Before[p] > 0 && PageLength(p) == 0) { Msg::Log("ToMe_DRAWRUN engine=mages ev=clear page=%d seq=%u", p, Seq[p]); Shown[p] = false; } } __except (EXCEPTION_EXECUTE_HANDLER) {}
}
// ---- drawDialogue(font, page, opacity): the page's first frame on screen ----
static unsigned DialogueCalls = 0;
static void __cdecl OnDialogue(const std::uint32_t *callerEsp) {
  if (++DialogueCalls % 120 == 1) View();
  __try { int page = (int)callerEsp[2]; if (page < 0 || page >= MaxPages || Shown[page] || PageLength(page) <= 0) return; Shown[page] = true; View();
    Msg::Log("ToMe_DRAWRUN engine=mages ev=show page=%d seq=%u opacity=%u", page, Seq[page], callerEsp[3]); } __except (EXCEPTION_EXECUTE_HANDLER) {}
}
// ---- drawGlyph(tex, sx, sy, sw, sh, x0, y0, x1, y1, color, opacity) from anything but drawDialogue ----
static uintptr_t RunSite = 0; static int RunN = 0; static float RX0, RY0, RX1, RY1, RH; static unsigned RColor, RHash; static unsigned LastHash[64]; static uintptr_t LastSite[64];
static void FlushRun() {
  if (!RunN) return; int slot = -1;
  for (int i = 0; i < 64; i++) if (LastSite[i] == RunSite || !LastSite[i]) { slot = i; break; }
  if (slot >= 0 && !(LastSite[slot] == RunSite && LastHash[slot] == RHash)) {
    LastSite[slot] = RunSite; LastHash[slot] = RHash;
    Msg::Log("ToMe_DRAWRUN engine=mages ev=glyph site=%x n=%d box=%d,%d,%d,%d size=%d color=%06x", (unsigned)(RunSite - Base), RunN, (int)RX0, (int)RY0, (int)(RX1 - RX0), (int)(RY1 - RY0), (int)RH, RColor & 0xffffff);
  }
  RunN = 0;
}
static bool InDialogue(uintptr_t ret) { for (int i = 0; i < 2; i++) if (ret > Dlg[i] && ret < DlgEnd[i]) return true; return false; }
static void __cdecl OnGlyph(const std::uint32_t *callerEsp) {
  __try {
    uintptr_t ret = callerEsp[0]; if (InDialogue(ret)) return;
    const float *f = (const float *)(callerEsp + 2); float x0 = f[4], y0 = f[5], x1 = f[6], y1 = f[7];
    if (ret != RunSite || (RunN && (y0 > RY1 + 4 * RH || x0 < RX0 - 4 * RH))) { FlushRun(); RunSite = ret; RHash = 2166136261u; }
    if (!RunN) { RX0 = x0; RY0 = y0; RX1 = x1; RY1 = y1; RH = y1 - y0; RColor = callerEsp[10]; }
    if (x0 < RX0) RX0 = x0; if (y0 < RY0) RY0 = y0; if (x1 > RX1) RX1 = x1; if (y1 > RY1) RY1 = y1;
    unsigned v[3] = {callerEsp[2], callerEsp[3], (unsigned)(int)x0}; for (unsigned q : v) RHash = (RHash ^ q) * 16777619u;
    RunN++;
  } __except (EXCEPTION_EXECUTE_HANDLER) { RunN = 0; }
}
// ---- gates: a pre call on the caller's stack; for commit / clear also a post call through a return trampoline ----
static uintptr_t RetStack[8]; static int RetDepth = 0;
static void __cdecl PushRet(std::uint32_t *callerEsp, uintptr_t after) { if (RetDepth < 8) { RetStack[RetDepth++] = callerEsp[0]; callerEsp[0] = (std::uint32_t)after; } }
static uintptr_t __cdecl PopRet() { return RetDepth > 0 ? RetStack[--RetDepth] : 0; }
static void __cdecl CommitAfterC() { OnCommitLeave(); }
static void __cdecl ClearAfterC() { OnClearLeave(); }
static void __cdecl CommitEnterC(std::uint32_t *esp, uintptr_t after) { OnCommitEnter(esp); PushRet(esp, after); }
static void __cdecl ClearEnterC(std::uint32_t *esp, uintptr_t after) { OnClearEnter(esp); PushRet(esp, after); }
// the return trampolines: the hooked function returned here (its fake return address); run the post call, then return
// to where the game called it from (PopRet), with every register and the flags as the function left them
static __declspec(naked) void CommitAfter() {
  __asm { push eax
          pushad
          pushfd
          call CommitAfterC
          call PopRet
          mov [esp + 36], eax
          popfd
          popad
          ret }
}
static __declspec(naked) void ClearAfter() {
  __asm { push eax
          pushad
          pushfd
          call ClearAfterC
          call PopRet
          mov [esp + 36], eax
          popfd
          popad
          ret }
}
static __declspec(naked) void CommitGate() {
  __asm { pushad
          pushfd
          push offset CommitAfter
          lea eax, [esp + 40]
          push eax
          call CommitEnterC
          add esp, 8
          popfd
          popad
          jmp dword ptr [CommitOrig] }
}
#define MAGESDRAW_CLEAR_GATE(i)                                                                                        \
  static __declspec(naked) void ClearGate##i() {                                                                        \
    __asm pushad __asm pushfd __asm push offset ClearAfter __asm lea eax, [esp + 40] __asm push eax __asm call ClearEnterC \
    __asm add esp, 8 __asm popfd __asm popad __asm jmp dword ptr [ClearOrig + 4 * i]                                   \
  }
MAGESDRAW_CLEAR_GATE(0) MAGESDRAW_CLEAR_GATE(1) MAGESDRAW_CLEAR_GATE(2) MAGESDRAW_CLEAR_GATE(3)
static void *ClearGates[4] = {(void *)ClearGate0, (void *)ClearGate1, (void *)ClearGate2, (void *)ClearGate3};
#define MAGESDRAW_PRE_GATE(name, fn, orig)                                                                             \
  static __declspec(naked) void name() {                                                                                \
    __asm pushad __asm pushfd __asm lea eax, [esp + 36] __asm push eax __asm call fn __asm add esp, 4 __asm popfd __asm popad \
    __asm jmp dword ptr [orig]                                                                                          \
  }
MAGESDRAW_PRE_GATE(DlgGate0, OnDialogue, DlgOrig)
MAGESDRAW_PRE_GATE(DlgGate1, OnDialogue, DlgOrig + 4)
MAGESDRAW_PRE_GATE(GlyphGate, OnGlyph, GlyphOrig)

// ---- finding: the signature, checked against the version layer's table when there is one ----
struct Table { bool has = false; uintptr_t dlg[2] = {}, glyph = 0, commit = 0, clear[4] = {}, pages = 0; int clears = 0; std::uint32_t stride = 0; };
static bool ReadControl(bool &roles, Table &t) {
  wchar_t tmp[MAX_PATH]; DWORD n = GetTempPathW(MAX_PATH, tmp); if (!n || n >= MAX_PATH) return false;
  wchar_t path[MAX_PATH + 64]; swprintf_s(path, L"%sMeguLit\\draw\\%lu.txt", tmp, GetCurrentProcessId());
  HANDLE h = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr, OPEN_EXISTING, 0, nullptr);
  if (h == INVALID_HANDLE_VALUE) return false;
  static char raw[16384]; DWORD got = 0; ReadFile(h, raw, sizeof(raw) - 2, &got, nullptr); CloseHandle(h);
  std::string a; for (DWORD i = 0; i < got; i++) if (raw[i] && (unsigned char)raw[i] < 0x80) a += raw[i]; // UTF-16LE ASCII part
  roles = a.find("roles=1") != std::string::npos;
  size_t at = a.find("#table mages "); if (at == std::string::npos) return true;
  std::string line = a.substr(at, a.find('\n', at) - at); t.has = true;
  auto list = [&](const char *key, uintptr_t *out, int cap) { int k = 0; size_t p = line.find(std::string(" ") + key + "="); if (p == std::string::npos) return 0; p += strlen(key) + 2;
    while (k < cap) { char *e; unsigned long v = strtoul(line.c_str() + p, &e, 16); if (e == line.c_str() + p) break; out[k++] = v; p = e - line.c_str(); if (line[p] != ',') break; p++; } return k; };
  list("drawDialogue", t.dlg, 2); list("drawGlyph", &t.glyph, 1); list("commit", &t.commit, 1); t.clears = list("clear", t.clear, 4); list("pages", &t.pages, 1);
  uintptr_t st = 0; list("stride", &st, 1); t.stride = (std::uint32_t)st;
  return true;
}
static bool FindInImage(const Table &t) {
  auto dos = (IMAGE_DOS_HEADER *)Base; auto nt = (IMAGE_NT_HEADERS *)(Base + dos->e_lfanew); auto sec = IMAGE_FIRST_SECTION(nt);
  for (int i = 0; i < nt->FileHeader.NumberOfSections; i++, sec++) {
    if (!(sec->Characteristics & IMAGE_SCN_MEM_EXECUTE)) continue;
    const unsigned char *code = (const unsigned char *)(Base + sec->VirtualAddress); size_t n = sec->Misc.VirtualSize;
    MagesDrawSig::Result r = MagesDrawSig::Find(code, n);
    if (!r.ok) { if (r.heads) Msg::Log("ToMe_DRAWRUN engine=mages off: signature heads=%d commits=%d clears=%d", r.heads, r.commits, r.clears); continue; }
    uintptr_t at = Base + sec->VirtualAddress;
    Dlg[0] = at + r.dialogue[0]; Dlg[1] = at + r.dialogue[1]; DlgEnd[0] = at + r.dialogueEnd[0]; DlgEnd[1] = at + r.dialogueEnd[1]; Glyph = (uintptr_t)((std::int64_t)at + r.drawGlyphRel); Commit = at + r.commit;
    Clears = r.clears < 4 ? r.clears : 4; for (int k = 0; k < Clears; k++) Clear[k] = at + r.clear[k];
    Pages = r.pages; Stride = r.stride; Chars = r.chars; Count = r.count; Codes = r.codes; Info = r.info; ScaleAt = r.scale;
    { std::uint32_t w = 0; if (MagesDrawSig::FindBackbuffer(code, n, w) == 1) Backbuffer = w; else Msg::Log("ToMe_DRAWRUN engine=mages note: no back buffer size (the client size is used)"); }
    if (t.has) { // the version layer's RVAs must be what the signature found
      bool same = t.dlg[0] == Dlg[0] - Base && t.dlg[1] == Dlg[1] - Base && t.glyph == Glyph - Base && t.commit == Commit - Base && t.stride == Stride && t.pages == Pages - Base;
      if (!same) { Msg::Log("ToMe_DRAWRUN engine=mages off: the version table disagrees with the signature (dlg %x/%x glyph %x commit %x)", (unsigned)(Dlg[0] - Base), (unsigned)(Dlg[1] - Base), (unsigned)(Glyph - Base), (unsigned)(Commit - Base)); return false; }
    }
    return true;
  }
  Msg::Log("ToMe_DRAWRUN engine=mages off: no dialogue pages found"); return false;
}
static uintptr_t Hooked[8]; static int NHooked = 0;
static bool Hook(uintptr_t at, void *gate, void **orig) {
  if (MH_CreateHook((void *)at, gate, orig) != MH_OK) return false;
  if (MH_EnableHook((void *)at) != MH_OK) { MH_RemoveHook((void *)at); return false; }
  Hooked[NHooked++] = at; return true;
}
static void Install() {
  if (InterlockedExchange(&Installed, 1)) return;
  bool ok = Hook(Commit, (void *)CommitGate, &CommitOrig);
  for (int k = 0; ok && k < Clears; k++) ok = Hook(Clear[k], ClearGates[k], &ClearOrig[k]);
  ok = ok && Hook(Dlg[0], (void *)DlgGate0, &DlgOrig[0]) && Hook(Dlg[1], (void *)DlgGate1, &DlgOrig[1]) && Hook(Glyph, (void *)GlyphGate, &GlyphOrig);
  if (!ok) { for (int k = 0; k < NHooked; k++) { MH_DisableHook((void *)Hooked[k]); MH_RemoveHook((void *)Hooked[k]); } NHooked = 0; Msg::Log("ToMe_DRAWRUN engine=mages off: hook failed"); return; }
  Msg::Log("ToMe_DRAWRUN engine=mages on: drawDialogue=%x,%x drawGlyph=%x commit=%x clear=%x,%x pages=%x stride=%x chars=%d scale=%.3g", (unsigned)(Dlg[0] - Base), (unsigned)(Dlg[1] - Base), (unsigned)(Glyph - Base), (unsigned)(Commit - Base),
           Clears > 0 ? (unsigned)(Clear[0] - Base) : 0, Clears > 1 ? (unsigned)(Clear[1] - Base) : 0, (unsigned)(Pages - Base), Stride, Chars, Scale());
}
static DWORD WINAPI Watch(void *) {
  for (int i = 0; i < 1800 && !Installed; i++) {
    bool roles = false; Table t;
    if (ReadControl(roles, t) && roles) { __try { if (FindInImage(t)) Install(); else return 0; } __except (EXCEPTION_EXECUTE_HANDLER) { return 0; } }
    Sleep(2000);
  }
  return 0;
}
// called from the MAGES engines' attach (the STEINS;GATE adapter and upstream MAGES); never fails the engine. One per
// process even though two translation units carry this header: the first Arm takes a named per-process mutex.
static void Arm(uintptr_t imageBase) {
  if (InterlockedExchange(&Armed, 1)) return;
  wchar_t name[64]; swprintf_s(name, L"Local\\MeguLitMagesDraw-%lu", GetCurrentProcessId());
  HANDLE m = CreateMutexW(nullptr, TRUE, name); if (!m || GetLastError() == ERROR_ALREADY_EXISTS) return;
  Base = imageBase;
  HANDLE t = CreateThread(nullptr, 0, Watch, nullptr, 0, nullptr); if (t) CloseHandle(t);
}
}
#endif
