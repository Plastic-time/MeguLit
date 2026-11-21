// SPDX-License-Identifier: GPL-3.0-or-later
// engine-draw, SiglusEngine (docs/engine-draw-native.md; template: YurisDraw.h). Every glyph any text area of the engine
// lays out goes through one std::vector<moji>::push_back, found by structure in any build (SiglusDrawSig.h; CLANNAD
// 1.1.134.0 and Summer Pockets 1.1.137.0 both match). At that push the moji on the caller's stack holds the character,
// its x / y in the text area, its size and colour number; the return address tells which layout pushed it, and for the
// message layout add_msg's own return address ([ebp+4]) tells which VM command called it:
//   print   mwnd.print -> role=line        namemsg  a name inside the message -> role=name     backlog  msgbk -> role=system
//   name    mwnd.namae (name window) -> role=name     msgsel  mwnd.sel / selmsg item -> role=choice
//   selbtn  global.selbtn item -> role=choice          ruby    mwnd.ruby: the reading glyphs above a base, folded into
//                                                       the base run as ruby=<start>:<len>:<reading> (the reading
//                                                       is the msg's own ruby string, the base is the run's glyphs
//                                                       between the ruby start and the pen)
// One record a run (the glyphs of one text area on one line), MESSAGE_SIZE caps a line at 500 bytes:
//   ToMe_DRAWRUN engine=siglus run=N role=R id=<layout>:<text area> n= x0= y0= x1= y1= size= color= [ruby=s:l:よみ|...] text=
// x0 y0 = the top left of the first glyph cell, x1 y1 = the bottom right of the last (x + size, y + size), in the text
// area's own pixels: where each text area sits on screen is learned per game (version diff) from these runs and the
// glyph / GPU positions, as for YU-RIS. color = the engine's colour number (-1 = the window's default), not RGB. A text
// area cleared for a new page (msg::clear):
//   ToMe_DRAWRUN engine=siglus clear id=<text area>
// Opt-in: nothing is hooked until MeguLit's control file %TEMP%\MeguLit\draw\<pid>.txt says roles=1 (draw.roles of this
// game's diff in The Seed); a watcher thread checks it every 2 s. The hooks call the game's own functions in every case
// and only read the engine's memory (inside __try).
#pragma once
#include <windows.h>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
#include "MinHook.h"
#include "SiglusDrawSig.h"
namespace SiglusDraw {
static void *OrigPush = nullptr, *OrigClear = nullptr;
static SiglusDrawSig::Result Sig;
static volatile LONG Armed = 0, Installed = 0;
static CRITICAL_SECTION Lock;
// moji layout (both builds): +0 type (0 = character), +4 code, +8 size, +0xc colour no., +0x18 x, +0x1c y
struct Moji { int type, code, size, color, x, y; };
struct Glyph { long x, y, size; wchar_t c; };
enum { R_LINE, R_NAME, R_CHOICE, R_SYSTEM };
static const char *const RoleName[] = {"line", "name", "choice", "system"};
// the current run (under Lock)
static uintptr_t RunVec = 0; static int RunRole = -1, RunSrc = -1, RunColor = 0; static unsigned Run = 0, RunNo = 0;
static std::vector<Glyph> RunG; static std::string RunRuby; static DWORD LastTick = 0;
// the ruby being laid out: the glyphs of one ruby call come one after another
static bool InRuby = false;
// text areas that drew since their last clear (a clear of any other is not news)
static uintptr_t Drawn[32]; static int NDrawn = 0;

static std::string Utf8(const wchar_t *w, int n) {
  if (n <= 0) return std::string();
  int m = WideCharToMultiByte(CP_UTF8, 0, w, n, nullptr, 0, nullptr, nullptr); std::string r(m, '\0');
  WideCharToMultiByte(CP_UTF8, 0, w, n, &r[0], m, nullptr, nullptr); return r;
}
static void Clean(std::string &t, size_t cap) {
  if (t.size() > cap) { size_t cut = cap; while (cut > 0 && ((unsigned char)t[cut] & 0xc0) == 0x80) cut--; t.resize(cut); }
  for (char &c : t) if (c == '\r' || c == '\n' || c == '\t') c = ' ';
}
static void Flush() {
  if (RunG.empty()) return;
  long x0 = RunG[0].x, y0 = RunG[0].y, x1 = x0, y1 = y0, size = 0; std::wstring w;
  for (auto &g : RunG) {
    if (g.x < x0) x0 = g.x; if (g.y < y0) y0 = g.y;
    if (g.x + g.size > x1) x1 = g.x + g.size; if (g.y + g.size > y1) y1 = g.y + g.size;
    if (g.size > size) size = g.size; w.push_back(g.c);
  }
  std::string t = Utf8(w.data(), (int)w.size()); Clean(t, 120);
  std::string ruby = RunRuby; Clean(ruby, 90);
  Msg::Log("ToMe_DRAWRUN engine=siglus run=%u role=%s id=%s:%x n=%d x0=%ld y0=%ld x1=%ld y1=%ld size=%ld color=%d%s%s text=%s",
           RunNo, RoleName[RunRole], SiglusDrawSig::PushName[RunSrc == -2 ? SiglusDrawSig::P_PRINT : RunSrc], (unsigned)RunVec, (int)RunG.size(),
           x0, y0, x1, y1, size, RunColor, ruby.empty() ? "" : " ruby=", ruby.c_str(), t.c_str());
  RunG.clear(); RunRuby.clear();
}
static void MarkDrawn(uintptr_t msg) {
  for (int i = 0; i < NDrawn; i++) if (Drawn[i] == msg) return;
  if (NDrawn < 32) Drawn[NDrawn++] = msg; else { memmove(Drawn, Drawn + 1, sizeof(Drawn) - sizeof(Drawn[0])); Drawn[31] = msg; }
}
// a ruby: the reading and the base's start, read from the msg the ruby glyphs go into (copied inside __try)
struct RubyInfo { bool ok; long startX, startY, penX, penAdd; wchar_t text[64]; int n; };
static RubyInfo ReadRuby(uintptr_t msg) {
  RubyInfo r{}; __try {
    const unsigned char *m = (const unsigned char *)msg;
    r.startX = *(const long *)(m + Sig.rubyX); r.startY = *(const long *)(m + Sig.rubyY);
    r.penX = *(const long *)(m + Sig.penX); r.penAdd = *(const long *)(m + Sig.penAdd);
    // MSVC std::wstring: 16 bytes (inline buffer or pointer), size, capacity
    const unsigned char *s = m + Sig.rubyStr; size_t size = *(const size_t *)(s + 16), cap = *(const size_t *)(s + 20);
    const wchar_t *p = cap >= 8 ? *(const wchar_t *const *)s : (const wchar_t *)s;
    r.n = (int)(size < 63 ? size : 63); for (int i = 0; i < r.n; i++) r.text[i] = p[i];
    r.ok = r.n > 0;
  } __except (EXCEPTION_EXECUTE_HANDLER) { r.ok = false; }
  return r;
}
static void OnRubyStart(uintptr_t vec) {
  if (vec != RunVec || RunG.empty()) return; // the base run was already reported: no ruby for it
  RubyInfo r = ReadRuby(vec - (uintptr_t)Sig.vec); if (!r.ok) return;
  long y = RunG.back().y; int start = -1, len = 0;
  for (int i = 0; i < (int)RunG.size(); i++) {
    long px = RunG[i].x - r.penAdd;
    if (RunG[i].y == y && px >= r.startX && px < r.penX) { if (start < 0) start = i; len = i - start + 1; }
  }
  if (start < 0) return;
  char head[32]; sprintf_s(head, "%d:%d:", start, len);
  if (!RunRuby.empty()) RunRuby += '|';
  RunRuby += head; std::string t = Utf8(r.text, r.n); for (char &c : t) if (c == '|' || c == ' ') c = '_'; RunRuby += t;
}
static void Handle(int src, int addSrc, uintptr_t vec, const Moji &m) {
  EnterCriticalSection(&Lock);
  LastTick = GetTickCount();
  if (src == SiglusDrawSig::P_RUBY) { if (!InRuby) { InRuby = true; OnRubyStart(vec); } LeaveCriticalSection(&Lock); return; }
  InRuby = false;
  int role = R_LINE;
  if (src == SiglusDrawSig::P_PRINT) role = addSrc == SiglusDrawSig::A_NAMEMSG ? R_NAME : addSrc == SiglusDrawSig::A_BACKLOG ? R_SYSTEM : R_LINE;
  else if (src == SiglusDrawSig::P_NAME) role = R_NAME;
  else if (src == SiglusDrawSig::P_MSGSEL || src == SiglusDrawSig::P_SELBTN) role = R_CHOICE;
  else role = R_SYSTEM;
  bool same = !RunG.empty() && vec == RunVec && role == RunRole && src == RunSrc && m.y == RunG.back().y && m.x >= RunG.back().x;
  if (!same) { Flush(); RunNo = ++Run; RunVec = vec; RunRole = role; RunSrc = src; RunColor = m.color; }
  Glyph g; g.x = m.x; g.y = m.y; g.size = m.size; g.c = m.type == 0 ? (wchar_t)m.code : (wchar_t)0xfffc; RunG.push_back(g);
  if (src == SiglusDrawSig::P_PRINT || src == SiglusDrawSig::P_NAME) MarkDrawn(vec - (uintptr_t)Sig.vec);
  if (RunG.size() > 400) Flush();
  LeaveCriticalSection(&Lock);
}
static void __cdecl OnPush(DWORD ret, const unsigned char *moji, uintptr_t vec, const unsigned char *callerEbp) {
  Moji m{}; int src, addSrc = -1;
  __try {
    src = SiglusDrawSig::PushRole(Sig, ret);
    if (src == SiglusDrawSig::P_PRINT) addSrc = SiglusDrawSig::AddRole(Sig, *(const DWORD *)(callerEbp + 4));
    m.type = *(const int *)moji; m.code = *(const int *)(moji + 4) & 0xffff; m.size = *(const int *)(moji + 8);
    m.color = *(const int *)(moji + 0xc); m.x = *(const int *)(moji + 0x18); m.y = *(const int *)(moji + 0x1c);
  } __except (EXCEPTION_EXECUTE_HANDLER) { return; }
  Handle(src, addSrc, vec, m);
}
static void __cdecl OnClear(uintptr_t msg) {
  EnterCriticalSection(&Lock);
  bool news = false;
  for (int i = 0; i < NDrawn; i++) if (Drawn[i] == msg) { news = true; Drawn[i] = Drawn[--NDrawn]; break; }
  if (news) { if (RunVec - (uintptr_t)Sig.vec == msg) Flush(); InRuby = false; Msg::Log("ToMe_DRAWRUN engine=siglus clear id=%x", (unsigned)(msg + (uintptr_t)Sig.vec)); }
  LeaveCriticalSection(&Lock);
}
// at the push: [esp] = return address, [esp+4] = the moji, ecx = the vector, ebp = the caller's frame
static __declspec(naked) void PushGate() {
  __asm {
    pushfd
    pushad
    push dword ptr [esp + 8]     // saved EBP: the caller's frame
    push dword ptr [esp + 28]    // saved ECX (+24, moved by one push): the vector
    push dword ptr [esp + 48]    // the moji argument (+40, moved by two pushes)
    push dword ptr [esp + 48]    // the return address (+36, moved by three pushes)
    call OnPush
    add esp, 16
    popad
    popfd
    jmp dword ptr [OrigPush]
  }
}
// at msg::clear: ecx = the msg
static __declspec(naked) void ClearGate() {
  __asm {
    pushfd
    pushad
    push dword ptr [esp + 24]    // saved ECX
    call OnClear
    add esp, 4
    popad
    popfd
    jmp dword ptr [OrigClear]
  }
}
// the module's executable sections
static bool FindInImage(uintptr_t base) {
  auto dos = (IMAGE_DOS_HEADER *)base; auto nt = (IMAGE_NT_HEADERS *)(base + dos->e_lfanew); auto sec = IMAGE_FIRST_SECTION(nt);
  SiglusDrawSig::Seg segs[8]; int ns = 0;
  for (int i = 0; i < nt->FileHeader.NumberOfSections && ns < 8; i++, sec++) {
    if (!(sec->Characteristics & IMAGE_SCN_MEM_EXECUTE)) continue;
    segs[ns].va = (std::uint32_t)(base + sec->VirtualAddress); segs[ns].b = (const unsigned char *)(base + sec->VirtualAddress); segs[ns].n = sec->Misc.VirtualSize; ns++;
  }
  Sig = SiglusDrawSig::Find(segs, ns);
  if (!Sig.ok) { Msg::Log("ToMe_DRAWRUN engine=siglus off: %s", Sig.why); return false; }
  return true;
}
// a run nobody continued for 150 ms is complete (Siglus lays out a whole print at once)
static void FlushIdle() { EnterCriticalSection(&Lock); if (!RunG.empty() && GetTickCount() - LastTick > 150) Flush(); LeaveCriticalSection(&Lock); }
static void Install() {
  if (InterlockedExchange(&Installed, 1)) return;
  if (MH_CreateHook((void *)(uintptr_t)Sig.push, (void *)PushGate, &OrigPush) != MH_OK || MH_CreateHook((void *)(uintptr_t)Sig.clear, (void *)ClearGate, &OrigClear) != MH_OK ||
      MH_EnableHook((void *)(uintptr_t)Sig.push) != MH_OK || MH_EnableHook((void *)(uintptr_t)Sig.clear) != MH_OK) {
    Msg::Log("ToMe_DRAWRUN engine=siglus off: hook failed at push %x clear %x", Sig.push, Sig.clear); return;
  }
  Msg::Log("ToMe_DRAWRUN engine=siglus on: push %x add_msg %x clear %x vec=%x sites=%d adds=%d", Sig.push, Sig.addMsg, Sig.clear, Sig.vec, Sig.nSites, Sig.nAdds);
}
static bool RolesAsked() {
  wchar_t tmp[MAX_PATH]; DWORD n = GetTempPathW(MAX_PATH, tmp); if (!n || n >= MAX_PATH) return false;
  wchar_t path[MAX_PATH + 64]; swprintf_s(path, L"%sMeguLit\\draw\\%lu.txt", tmp, GetCurrentProcessId());
  HANDLE h = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr, OPEN_EXISTING, 0, nullptr);
  if (h == INVALID_HANDLE_VALUE) return false;
  char buf[256] = {}; DWORD got = 0; ReadFile(h, buf, sizeof(buf) - 2, &got, nullptr); CloseHandle(h);
  // UTF-16LE or UTF-8: "#cfg roles=1" (zero bytes skipped)
  static const char want[] = "roles=1"; size_t k = 0;
  for (DWORD i = 0; i < got; i++) { if (!buf[i]) continue; k = buf[i] == want[k] ? k + 1 : (buf[i] == want[0] ? 1 : 0); if (!want[k]) return true; }
  return false;
}
static DWORD WINAPI Watch(void *) {
  for (int i = 0; i < 1800 && !Installed; i++) { if (RolesAsked()) Install(); if (!Installed) Sleep(2000); }
  while (Installed) { Sleep(50); FlushIdle(); }
  return 0;
}
// called from Siglus::attach_function; never fails the engine
static void Arm(uintptr_t imageBase) {
  if (InterlockedExchange(&Armed, 1)) return;
  __try { if (!FindInImage(imageBase)) return; } __except (EXCEPTION_EXECUTE_HANDLER) { return; }
  InitializeCriticalSection(&Lock);
  HANDLE t = CreateThread(nullptr, 0, Watch, nullptr, 0, nullptr); if (t) CloseHandle(t);
}
}
