// SPDX-License-Identifier: GPL-3.0-or-later
// engine-draw, YU-RIS (docs/engine-draw-native.md; template for the other native engines): the dialogue glyph loop's call
// into the glyph blitter, found by structure in any build (YurisDrawSig.h; euphoria, euphoria HD, 女装山脈, サイコロジック all
// match exactly once). At that call EAX points at the character in the string being drawn and the caller's stack holds the
// glyph's x / y on the window's text canvas, so every run of text a YU-RIS window draws comes out with its characters and
// their canvas boxes, one record a run (MESSAGE_SIZE caps a line at 500 bytes):
//   ToMe_DRAWRUN engine=yuris run=N canvas=<blitter arg> n=<chars> x0= y0= x1= y1= size=<advance> text=<UTF-8, cut at 120 bytes>
// Canvas pixels, not the screen: where each window's canvas sits is learned per game (version diff) from these runs and
// the glyph / GPU positions, and the runs' texts against the hook streams' roles (scenario / name / other).
// Opt-in: nothing is hooked until MeguLit's control file %TEMP%\MeguLit\draw\<pid>.txt says roles=1 (draw.roles of this
// game's diff); a watcher thread checks it every 2 s. The hook calls the game's own blitter in every case.
#pragma once
#include <windows.h>
#include <cstdio>
#include <cstring>
#include <string>
#include "MinHook.h"
#include "YurisDrawSig.h"
namespace YurisDraw {
static void *Original = nullptr;
static uintptr_t CallAt = 0;
static int XSlot = 0, YSlot = 0;
static volatile LONG Armed = 0, Installed = 0;
// the current run (game thread only: the blitter is called from the game's draw loop)
static const unsigned char *RunNext = nullptr; static long RunY = 0, X0 = 0, Y0 = 0, X1 = 0, Y1 = 0, Size = 0, LastX = 0;
static int RunChars = 0; static unsigned Run = 0; static std::string RunText;

static std::string Utf8(const std::string &sjis) {
  int n = MultiByteToWideChar(932, 0, sjis.data(), (int)sjis.size(), nullptr, 0); if (n <= 0) return std::string();
  std::wstring w(n, L'\0'); MultiByteToWideChar(932, 0, sjis.data(), (int)sjis.size(), &w[0], n);
  int m = WideCharToMultiByte(CP_UTF8, 0, w.data(), n, nullptr, 0, nullptr, nullptr); std::string r(m, '\0');
  WideCharToMultiByte(CP_UTF8, 0, w.data(), n, &r[0], m, nullptr, nullptr); return r;
}
static void Flush() {
  if (!RunChars) return;
  std::string t = Utf8(RunText);
  if (t.size() > 120) { size_t cut = 120; while (cut > 0 && ((unsigned char)t[cut] & 0xc0) == 0x80) cut--; t.resize(cut); }
  for (char &c : t) if (c == '\r' || c == '\n') c = ' ';
  Msg::Log("ToMe_DRAWRUN engine=yuris run=%u n=%d x0=%ld y0=%ld x1=%ld y1=%ld size=%ld text=%s", Run, RunChars, X0, Y0, X1, Y1, Size, t.c_str());
  RunChars = 0; RunText.clear();
}
static void __cdecl OnGlyph(const unsigned char *ch, const unsigned char *callerEsp) {
  __try {
    long x = *(const long *)(callerEsp + XSlot), y = *(const long *)(callerEsp + YSlot);
    int bytes = YurisDrawSig::CharBytes(ch[0]);
    bool same = RunChars && ch == RunNext;
    if (!same) { Flush(); Run++; X0 = X1 = x; Y0 = Y1 = y; Size = 0; }
    else if (y == RunY && x > LastX && x - LastX < 400 && x - LastX > Size) Size = x - LastX; // the advance of the previous glyph
    if (x < X0) X0 = x; if (y < Y0) Y0 = y; if (x > X1) X1 = x; if (y > Y1) Y1 = y;
    RunText.append((const char *)ch, bytes); RunChars++; RunNext = ch + bytes; RunY = y; LastX = x;
    if (RunText.size() > 2000) Flush();
  } __except (EXCEPTION_EXECUTE_HANDLER) { RunChars = 0; RunText.clear(); }
}
static __declspec(naked) void Gate() {
  __asm {
    pushfd
    pushad
    lea ecx, [esp + 36]          // the caller's ESP at the call
    push ecx
    push dword ptr [esp + 32]    // saved EAX (moved by the push): the character pointer
    call OnGlyph
    add esp, 8
    popad
    popfd
    jmp dword ptr [Original]
  }
}
// the module's executable sections
static bool FindInImage(uintptr_t base) {
  auto dos = (IMAGE_DOS_HEADER *)base; auto nt = (IMAGE_NT_HEADERS *)(base + dos->e_lfanew); auto sec = IMAGE_FIRST_SECTION(nt);
  int total = 0; YurisDrawSig::Hit hit{};
  for (int i = 0; i < nt->FileHeader.NumberOfSections; i++, sec++) {
    if (!(sec->Characteristics & IMAGE_SCN_MEM_EXECUTE)) continue;
    YurisDrawSig::Hit h[2]; int n = YurisDrawSig::Find((const unsigned char *)(base + sec->VirtualAddress), sec->Misc.VirtualSize > 64 ? sec->Misc.VirtualSize - 64 : 0, h, 2);
    if (n >= 1 && !total) { hit = h[0]; hit.call += base + sec->VirtualAddress; }
    total += n;
  }
  if (total != 1) { Msg::Log("ToMe_DRAWRUN engine=yuris off: %d dialogue loop matches (want 1)", total); return false; }
  CallAt = hit.call; XSlot = hit.x; YSlot = hit.y; return true;
}
static void Install() {
  if (InterlockedExchange(&Installed, 1)) return;
  if (MH_CreateHook((void *)CallAt, (void *)Gate, &Original) != MH_OK || MH_EnableHook((void *)CallAt) != MH_OK) { Msg::Log("ToMe_DRAWRUN engine=yuris off: hook failed at %p", (void *)CallAt); return; }
  Msg::Log("ToMe_DRAWRUN engine=yuris on: call %p x=[esp+%x] y=[esp+%x]", (void *)CallAt, XSlot, YSlot);
}
static bool RolesAsked() {
  wchar_t tmp[MAX_PATH]; DWORD n = GetTempPathW(MAX_PATH, tmp); if (!n || n >= MAX_PATH) return false;
  wchar_t path[MAX_PATH + 64]; swprintf_s(path, L"%sMeguLit\\draw\\%lu.txt", tmp, GetCurrentProcessId());
  HANDLE h = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr, OPEN_EXISTING, 0, nullptr);
  if (h == INVALID_HANDLE_VALUE) return false;
  char buf[256] = {}; DWORD got = 0; ReadFile(h, buf, sizeof(buf) - 2, &got, nullptr); CloseHandle(h);
  // UTF-16LE: "#cfg roles=1" with every other byte 0
  static const char want[] = "roles=1"; size_t k = 0;
  for (DWORD i = 0; i < got; i++) { if (!buf[i]) continue; k = buf[i] == want[k] ? k + 1 : (buf[i] == want[0] ? 1 : 0); if (!want[k]) return true; }
  return false;
}
static DWORD WINAPI Watch(void *) { for (int i = 0; i < 1800 && !Installed; i++) { if (RolesAsked()) Install(); Sleep(2000); } return 0; }
// called from Yuris::attach_function; never fails the engine
static void Arm(uintptr_t imageBase) {
  if (InterlockedExchange(&Armed, 1)) return;
  __try { if (!FindInImage(imageBase)) return; } __except (EXCEPTION_EXECUTE_HANDLER) { return; }
  HANDLE t = CreateThread(nullptr, 0, Watch, nullptr, 0, nullptr); if (t) CloseHandle(t);
}
}
