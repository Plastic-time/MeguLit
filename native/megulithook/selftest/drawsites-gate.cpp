/* engine-draw GDI draw sites, the run-time gate (DrawSites.h), driven the way MinHook drives it on a game's call site:
   the API's arguments are pushed, control jumps to the site's stub (push k; jmp Gate), the gate records the call and
   returns into the "original" (here a trampoline that does the real call and comes back). Checks: the API gets exactly the
   game's arguments and the game's registers survive; the run carries the text, the pen and the callers (via=) read
   through EBP; a second character continues the run; another caller starts a new one. 32-bit only. Exit code = failures. */
#include <windows.h>
#include <cstdio>
#include <string>
#include <vector>
static std::vector<std::string> Logged;
namespace Msg { static void Log(const char *f, ...) { char b[1024]; va_list a; va_start(a, f); vsnprintf(b, sizeof b, f, a); va_end(a); Logged.push_back(b); } }
#include "../DrawSites.h"
static int Failures = 0;
static void Check(bool ok, const std::string &what) { printf("%s %s\n", ok ? "PASS" : "FAIL", what.c_str()); if (!ok) Failures++; }
// the "API": records what it got (stdcall, 5 arguments like TextOutA)
static DWORD GotHdc, GotX, GotY, GotLen; static const char *GotStr;
static BOOL WINAPI FakeTextOutA(HDC dc, int x, int y, LPCSTR s, int n) { GotHdc = (DWORD)dc; GotX = x; GotY = y; GotStr = s; GotLen = n; return 77; }
static void *FakeSlot = (void *)&FakeTextOutA;
static void *StubK;
static DWORD AfterEsi, AfterEbx, AfterEax;
// a game function with an EBP frame drawing one character through the site
static __declspec(noinline) void Draw(const char *s, int n, int x, int y) {
  void **orig = DrawSites::DrawSitesOriginal;
  __asm {
    push esi
    push ebx
    mov esi, 0x5151
    mov ebx, 0x7373
    mov edx, orig
    lea eax, tramp
    mov [edx], eax       // the "original": the trampoline below
    lea ecx, back        // where the site's own call comes back (kept in ecx through the gate)
    push n
    push s
    push y
    push x
    push 0x1234          // hdc
    jmp StubK            // MinHook's jump from the call site to the stub
  tramp:
    push ecx             // the trampoline: the original call, then on after the site
    jmp dword ptr [FakeSlot]
  back:
    mov AfterEax, eax
    mov AfterEsi, esi
    mov AfterEbx, ebx
    pop ebx
    pop esi
  }
}
// two text routines of the game, each drawing a string a character at a time (a loop: one call site each)
static volatile int Sink;
static __declspec(noinline) void CallerA(const char *s, int chars, int x, int y) { for (int i = 0; i < chars; i++) Draw(s + i * 2, 2, x + i * 22, y); Sink++; }
static __declspec(noinline) void CallerB(const char *s, int chars, int x, int y) { for (int i = 0; i < chars; i++) Draw(s + i * 2, 2, x + i * 22, y); Sink += 2; }
int main() {
  InitializeCriticalSection(&DrawSites::Lock);
  DrawSites::Sites[0] = { 0, (uintptr_t)GetModuleHandleA(nullptr), 0, DrawSites::A_TextOutA }; DrawSites::NSites = 1;
  StubK = DrawSites::Stub(0);
  Check(StubK != nullptr, "stub");
  const char *ai = "\x82\xa0\x82\xa2"; /* あい */
  CallerA(ai, 2, 100, 40);
  Check(GotHdc == 0x1234 && GotX == 122 && GotY == 40 && GotStr == ai + 2 && GotLen == 2, "the API gets the game's arguments");
  Check(AfterEax == 77 && AfterEsi == 0x5151 && AfterEbx == 0x7373, "the API's result and the game's registers survive");
  CallerB(ai, 1, 300, 200);
  EnterCriticalSection(&DrawSites::Lock); DrawSites::FlushLocked(); LeaveCriticalSection(&DrawSites::Lock);
  for (auto &l : Logged) printf("  log: %s\n", l.c_str());
  Check(Logged.size() == 2, "two runs (two callers)");
  if (Logged.size() == 2) {
    Check(Logged[0].find("engine=avg32 site=0") != std::string::npos && Logged[0].find("n=2 x0=100 y0=40 x1=122 y1=40") != std::string::npos && Logged[0].find("text=\xe3\x81\x82\xe3\x81\x84") != std::string::npos, "run 1: あい at the pen");
    Check(Logged[1].find("n=1 x0=300 y0=200") != std::string::npos && Logged[1].find("text=\xe3\x81\x82") != std::string::npos, "run 2: another caller, a new run");
    auto via = [](const std::string &l) { size_t a = l.find("via=") + 4; return l.substr(a, l.find(' ', a) - a); };
    Check(via(Logged[0]) != via(Logged[1]) && via(Logged[0]).find("0/") != 0, "via= tells the callers apart");
  }
  printf("draw sites gate: %d failure(s)\n", Failures);
  return Failures;
}
