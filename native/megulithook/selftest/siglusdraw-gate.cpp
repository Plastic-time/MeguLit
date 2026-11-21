/* engine-draw SiglusEngine runtime replay (SiglusDraw.h), 32-bit: the real gates and MinHook on a stand-in push_back and
   msg::clear, called the way the engine calls them (push from add_msg with add_msg's frame in ebp, from the ruby layout,
   the name window and a choice item; add_msg called by mwnd.print, by the name-in-message path and by the backlog).
   One page: 今日は + 漢字 with the ruby かんじ + だ, a second line, the name 春原 (name window), 【春原】 inside the message,
   the choice はい, msg::clear, a backlog line. Checks the records the hook writes, that the hooked functions still get
   their own arguments and registers, and that a clear of a text area that never drew says nothing. Exit code = failures. */
#include <windows.h>
#include <cstdio>
#include <cstdarg>
#include <string>
#include <vector>
static std::vector<std::string> Logs;
namespace Msg { void Log(const char *f, ...) { char b[700]; va_list a; va_start(a, f); vsnprintf(b, sizeof b, f, a); va_end(a); Logs.push_back(b); } }
#include "../SiglusDraw.h"

static int Failures = 0;
static void Check(bool ok, const std::string &what) { printf("%s %s\n", ok ? "PASS" : "FAIL", what.c_str()); if (!ok) Failures++; }

static volatile DWORD LastRet, LastAddRet, LastEcx, LastMoji, LastClearEcx, Pushes, Clears;
/* (each stub below starts with its own mov eax,N so the linker cannot fold identical ones into one address) */
/* the stand-in std::vector<moji>::push_back(const moji&): records what it was given, ret 4 */
static __declspec(naked) void FakePush() {
  __asm {
    mov eax, [esp]
    mov LastRet, eax
    mov eax, [ebp + 4]
    mov LastAddRet, eax
    mov LastEcx, ecx
    mov eax, [esp + 4]
    mov LastMoji, eax
    inc Pushes
    ret 4
  }
}
static __declspec(naked) void FakeClear() {
  __asm {
    mov LastClearEcx, ecx
    inc Clears
    nop
    ret
  }
}
/* add_msg: a frame, then the push (the hook reads [ebp+4] = who called add_msg) */
static __declspec(naked) void AddMsg() { __asm { push ebp
  mov ebp, esp
  push dword ptr [ebp + 8]
  call FakePush
  pop ebp
  ret 4 } }
/* three callers of add_msg (mwnd.print, the name inside the message, the backlog), each its own return address */
static __declspec(naked) void __cdecl LineCall(void *, void *) { __asm {
  mov eax, 257
  mov ecx, [esp + 4]
  push dword ptr [esp + 8]
  call AddMsg
  ret } }
static __declspec(naked) void __cdecl NameMsgCall(void *, void *) { __asm {
  mov eax, 258
  mov ecx, [esp + 4]
  push dword ptr [esp + 8]
  call AddMsg
  ret } }
static __declspec(naked) void __cdecl BacklogCall(void *, void *) { __asm {
  mov eax, 259
  mov ecx, [esp + 4]
  push dword ptr [esp + 8]
  call AddMsg
  ret } }
/* the layouts that push directly */
static __declspec(naked) void __cdecl RubyPush(void *, void *) { __asm {
  mov eax, 260
  push ebp
  mov ebp, esp
  mov ecx, [ebp + 8]
  push dword ptr [ebp + 12]
  call FakePush
  pop ebp
  ret } }
static __declspec(naked) void __cdecl NamePush(void *, void *) { __asm {
  mov eax, 261
  push ebp
  mov ebp, esp
  mov ecx, [ebp + 8]
  push dword ptr [ebp + 12]
  call FakePush
  pop ebp
  ret } }
static __declspec(naked) void __cdecl SelPush(void *, void *) { __asm {
  mov eax, 262
  push ebp
  mov ebp, esp
  mov ecx, [ebp + 8]
  push dword ptr [ebp + 12]
  call FakePush
  pop ebp
  ret } }
static __declspec(naked) void __cdecl ClearCall(void *) { __asm {
  mov eax, 263
  mov ecx, [esp + 4]
  call FakeClear
  ret } }

struct FakeMoji { int type, code, size, color, shadow, fuchi, x, y; unsigned char rest[0x3b4 - 32]; };
alignas(16) static unsigned char MsgA[0x400], MsgName[0x400], MsgBk[0x400], Item[0x400];
static FakeMoji M;
static void *Vec(unsigned char *msg) { return msg + 0x1ac; }
static FakeMoji *Moji(wchar_t c, int x, int y, int size = 32, int color = -1) { memset(&M, 0, sizeof M); M.code = c; M.x = x; M.y = y; M.size = size; M.color = color; return &M; }
static void Text(void (__cdecl *call)(void *, void *), unsigned char *msg, const wchar_t *s, int x, int y, int size = 32) {
  for (int i = 0; s[i]; i++) call(Vec(msg), Moji(s[i], x + i * size, y, size));
}
static bool Has(const char *needle) { for (auto &l : Logs) if (l.find(needle) != std::string::npos) return true; return false; }
static std::string Find(const char *needle) { for (auto &l : Logs) if (l.find(needle) != std::string::npos) return l; return std::string(); }
static std::string U8(const wchar_t *w) { return SiglusDraw::Utf8(w, (int)wcslen(w)); }

int main() {
  SetConsoleOutputCP(CP_UTF8);
  /* learn each call site's return address with the push not hooked yet */
  using namespace SiglusDrawSig;
  auto &S = SiglusDraw::Sig;
  auto site = [&](DWORD ret, int role) { S.site[S.nSites] = ret - 5; S.siteRole[S.nSites++] = role; };
  auto add = [&](DWORD ret, int role) { S.add[S.nAdds] = ret - 5; S.addRole[S.nAdds++] = role; };
  LineCall(Vec(MsgA), Moji(L'x', 0, 0)); site(LastRet, P_PRINT); add(LastAddRet, A_LINE);
  NameMsgCall(Vec(MsgA), Moji(L'x', 0, 0)); add(LastAddRet, A_NAMEMSG);
  BacklogCall(Vec(MsgA), Moji(L'x', 0, 0)); add(LastAddRet, A_BACKLOG);
  RubyPush(Vec(MsgA), Moji(L'x', 0, 0)); site(LastRet, P_RUBY);
  NamePush(Vec(MsgA), Moji(L'x', 0, 0)); site(LastRet, P_NAME);
  SelPush(Vec(MsgA), Moji(L'x', 0, 0)); site(LastRet, P_MSGSEL);
  S.ok = true; S.vec = 0x1ac; S.penAdd = 0xe8; S.penX = 0xe0; S.rubyStr = 0x14c; S.rubyX = 0x180; S.rubyY = 0x184;
  S.push = (std::uint32_t)(uintptr_t)&FakePush; S.clear = (std::uint32_t)(uintptr_t)&FakeClear;
  InitializeCriticalSection(&SiglusDraw::Lock);
  Check(MH_Initialize() == MH_OK, "MinHook");
  SiglusDraw::Install();
  Check(Has("ToMe_DRAWRUN engine=siglus on:"), "hook on");

  /* a page: 今日は漢字だ, the ruby かんじ over 漢字 (pen offset 8: glyph x = pen x + 8) */
  *(long *)(MsgA + 0xe8) = 8;
  Pushes = 0;
  Text(LineCall, MsgA, L"今日は漢字", 8, 0);
  Check(LastEcx == (DWORD)(uintptr_t)Vec(MsgA) && LastMoji == (DWORD)(uintptr_t)&M && Pushes == 5, "the hooked push still gets its vector (ecx) and its moji");
  *(long *)(MsgA + 0x180) = 96; *(long *)(MsgA + 0x184) = 0; *(long *)(MsgA + 0xe0) = 160;
  wcscpy_s((wchar_t *)(MsgA + 0x14c), 8, L"かんじ"); *(size_t *)(MsgA + 0x14c + 16) = 3; *(size_t *)(MsgA + 0x14c + 20) = 7;
  Text(RubyPush, MsgA, L"かんじ", 100, -16, 16);
  Text(LineCall, MsgA, L"だ", 168, 0);
  Text(LineCall, MsgA, L"次の行", 8, 40);
  /* the name window, a name inside the message, a choice item */
  Text(NamePush, MsgName, L"春原", 0, 0, 28);
  Text(NameMsgCall, MsgA, L"【春原】", 8, 80);
  Text(SelPush, Item, L"はい", 0, 0);
  SiglusDraw::FlushIdle(); Sleep(200); SiglusDraw::FlushIdle();
  std::string l1 = Find((std::string("text=") + U8(L"今日は漢字だ")).c_str());
  Check(!l1.empty(), "line: 今日は漢字だ is one run");
  Check(l1.find("role=line id=print:") != std::string::npos && l1.find(" n=6 x0=8 y0=0 x1=200 y1=32 size=32 color=-1") != std::string::npos, "line: role, id, box, size, colour");
  Check(l1.find(" ruby=3:2:" + U8(L"かんじ") + " ") != std::string::npos, "line: ruby かんじ over characters 3..4 (漢字), reading glyphs not in the text");
  Check(Has((std::string("role=line id=print:") ).c_str()) && Has((std::string("y0=40 x1=104 y1=72 size=32 color=-1 text=") + U8(L"次の行")).c_str()), "line: the next line is its own run");
  Check(Has((std::string("role=name id=name:") ).c_str()) && Has((std::string("size=28 color=-1 text=") + U8(L"春原")).c_str()), "name window: role=name");
  std::string nm = Find((std::string("text=") + U8(L"【春原】")).c_str());
  Check(nm.find("role=name id=print:") != std::string::npos, "a name inside the message: role=name");
  std::string ch = Find((std::string("text=") + U8(L"はい")).c_str());
  Check(ch.find("role=choice id=msgsel:") != std::string::npos, "choice item: role=choice");
  /* clear: the page's text area says so once, one that never drew says nothing */
  size_t before = Logs.size();
  ClearCall(MsgA);
  Check(LastClearEcx == (DWORD)(uintptr_t)MsgA && Clears == 1, "the hooked clear still gets its msg (ecx)");
  char want[64]; sprintf_s(want, "ToMe_DRAWRUN engine=siglus clear id=%x", (unsigned)(uintptr_t)Vec(MsgA));
  Check(Has(want), "clear of the page's text area");
  ClearCall(MsgA); ClearCall(MsgBk);
  Check(Logs.size() == before + 1, "a second clear, and a clear of a text area that never drew, say nothing");
  /* the backlog */
  Text(BacklogCall, MsgBk, L"前の台詞", 0, 0);
  Sleep(200); SiglusDraw::FlushIdle();
  std::string bk = Find((std::string("text=") + U8(L"前の台詞")).c_str());
  Check(bk.find("role=system id=print:") != std::string::npos, "backlog: role=system");
  /* the ruby of a base that was already reported is dropped, not attached to the wrong run */
  Text(LineCall, MsgA, L"再", 8, 0); Sleep(200); SiglusDraw::FlushIdle();
  size_t n = Logs.size(); Text(RubyPush, MsgA, L"さい", 8, -16, 16); Sleep(200); SiglusDraw::FlushIdle();
  Check(Logs.size() == n, "a late ruby writes nothing");
  for (auto &l : Logs) printf("  %s\n", l.c_str());
  printf("siglus draw gate: %d failure(s)\n", Failures);
  return Failures;
}
