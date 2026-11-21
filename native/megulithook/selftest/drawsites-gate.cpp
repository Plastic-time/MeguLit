/* engine-draw GDI draw sites, the run-time gate (DrawSites.h), driven the way MinHook drives it on a game's call site:
   the API's arguments are pushed, control jumps to the site's stub (push k; jmp Gate), the gate records the call and
   returns into the "original" (here a trampoline that does the real call and comes back). Checks: the API gets exactly the
   game's arguments and the game's registers survive; the run carries the text, the pen and the callers (via=) read
   through EBP; a second character continues the run; another caller starts a new one. 32-bit only. Exit code = failures. */
#include <windows.h>
#include <cstdio>
#include <string>
#include <vector>
#include <cstring>
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
// NScripter's actual stack shape: three SEH words, 0xfc4 locals, four saved registers, then five API arguments.
// The four sentinel routine arguments exercise fargs; their fake API x/y are not claimed to be page coordinates.
static volatile int Sink;
static void *StubN; static DWORD NoFrameRet; static void **DrawSitesOriginal_1 = &DrawSites::DrawSitesOriginal[1];
static __declspec(naked) void NoFrame(const char *, int, int, int) {
  __asm {
    mov eax, [esp]
    mov NoFrameRet, eax
    push -1
    push 0x45067d
    push eax                     // SEH-sized word only; this fake does not install an exception handler
    sub esp, 0xfc4
    push ebx
    push ebp
    push esi
    push edi
    push 2                       // TextOutA(hdc, x, y, s, 2)
    push dword ptr [esp + 0xfe0 + 4 + 4]       // s (arg 1, after one API push)
    push dword ptr [esp + 0xfe0 + 12 + 8]      // sentinel arg 3, after two pushes
    push dword ptr [esp + 0xfe0 + 8 + 12]      // sentinel arg 2, after three pushes
    push 0x1234
    lea ecx, back2
    mov edx, DrawSitesOriginal_1
    lea eax, tramp2
    mov [edx], eax
    jmp StubN
  tramp2:
    push ecx
    jmp dword ptr [FakeSlot]
  back2:
    pop edi
    pop esi
    pop ebp
    pop ebx
    add esp, 0xfc4
    add esp, 12
    ret
  }
}
static __declspec(noinline) void NoFrameCaller(const char *s, int x, int y) { NoFrame(s, x, y, 0x333); Sink++; }
// two text routines of the game, each drawing a string a character at a time (a loop: one call site each)
static __declspec(noinline) void CallerA(const char *s, int chars, int x, int y) { for (int i = 0; i < chars; i++) Draw(s + i * 2, 2, x + i * 22, y); Sink++; }
static __declspec(noinline) void CallerB(const char *s, int chars, int x, int y) { for (int i = 0; i < chars; i++) Draw(s + i * 2, 2, x + i * 22, y); Sink += 2; }
static bool Asked(const std::string &text) { return DrawSites::RolesFromControl((const unsigned char *)text.data(), text.size()); }
static DWORD WINAPI Revoke(void *) { DrawSites::SetObserving(false); return 0; }
static void ControlTests() {
  Check(Asked("#cfg roles=1 embed=0 zh=0\r\n"), "exact first-line opt-in");
  Check(Asked("#cfg\troles=1\tembed=0\n"), "tab separated config");
  Check(!Asked("#cfg roles=10\n") && !Asked("#cfg roles=01\n") && !Asked("#cfg roles=1x\n"), "roles values require exact 1");
  Check(!Asked("#cfg roles=0\ntranslated roles=1\n") && !Asked("roles=1\n#cfg roles=1\n"), "body and non-config cannot opt in");
  Check(!Asked("#cfg roles=1 roles=0\n") && !Asked("#cfg roles=1 roles=1\n"), "duplicate permission rejected");
  Check(!Asked("#cfg otherroles=1\n") && !Asked("#cfg roles=1") && !Asked("#cfg roles=1" + std::string(260, ' ') + "\n"), "wrong key and truncated header rejected");
  const std::wstring wide = L"#cfg roles=1 embed=0\r\n";
  std::string utf16("\xff\xfe", 2); utf16.append((const char *)wide.data(), wide.size() * 2);
  Check(Asked(utf16) && Asked(utf16.substr(2)), "UTF16LE writer header with and without BOM");
  Check(!Asked(utf16.substr(0, utf16.size() - 4)) && !Asked(std::string("#cfg roles=1\0\n", 14)), "incomplete UTF16 and embedded NUL rejected");
  Check(Asked(std::string("\xef\xbb\xbf") + "#cfg roles=1\n"), "UTF8 BOM header");
}
int main() {
  InitializeCriticalSection(&DrawSites::Lock);
  ControlTests();
  DrawSites::Sites[0] = { 0, (uintptr_t)GetModuleHandleA(nullptr), 0, DrawSites::A_TextOutA }; DrawSites::NSites = 1;
  StubK = DrawSites::Stub(0);
  Check(StubK != nullptr, "stub");
  const char *ai = "\x82\xa0\x82\xa2"; /* あい */
  DrawSites::DrawSitesOnCall(0, (const DWORD *)1, 1);
  CallerA(ai, 1, 10, 20);
  Check(Logged.empty() && !DrawSites::RunChars && GotStr == ai && AfterEax == 77, "default off neither observes bad pointers nor alters original API");
  DrawSites::SetObserving(true);
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
  Logged.clear(); CallerA(ai, 1, 10, 20);
  Check(DrawSites::RunChars == 1, "enabled run is pending");
  DrawSites::SetObserving(false);
  DrawSites::FlushLocked(); CallerA(ai + 2, 1, 11, 21);
  Check(Logged.empty() && !DrawSites::RunChars && DrawSites::RunText.empty(), "revocation discards pending text and blocks future calls and flush");
  Check(GotStr == ai + 2 && AfterEax == 77 && AfterEsi == 0x5151 && AfterEbx == 0x7373, "disabled detour preserves original call and registers");
  DrawSites::SetObserving(true);
  DrawSites::DrawSitesOnCall(0, (const DWORD *)1, 1);
  HANDLE revoked = CreateThread(nullptr, 0, Revoke, nullptr, 0, nullptr);
  Check(revoked && WaitForSingleObject(revoked, 2000) == WAIT_OBJECT_0, "SEH releases observation lock for another thread");
  if (revoked) CloseHandle(revoked);
  DrawSites::SetObserving(true); CallerB(ai + 2, 1, 50, 60); DrawSites::FlushLocked();
  Check(Logged.size() == 1 && Logged[0].find("text=\xe3\x81\x84") != std::string::npos && Logged[0].find("text=\xe3\x81\x82") == std::string::npos, "re-enable starts a fresh run without revoked text");
  /* a routine without an EBP frame, with NScripter's captured stack shape: its
     return address and its own arguments are read at the fixed distance above the API's arguments */
  int ns = -1; for (int i = 0; i < DrawSitesSig::SigCount; i++) if (!strcmp(DrawSitesSig::Sigs[i].id, "nscripter")) ns = i;
  Check(ns >= 0, "nscripter signature exists");
  if (ns >= 0) {
    DrawSites::Sites[1] = { 0, (uintptr_t)GetModuleHandleA(nullptr), ns, DrawSites::A_TextOutA }; DrawSites::NSites = 2;
    StubN = DrawSites::Stub(1); Logged.clear();
    NoFrameCaller(ai, 0x111, 0x222);
    EnterCriticalSection(&DrawSites::Lock); DrawSites::FlushLocked(); LeaveCriticalSection(&DrawSites::Lock);
    for (auto &l : Logged) printf("  log: %s\n", l.c_str());
    char want[64]; snprintf(want, sizeof want, "via=%lx/0", (unsigned long)(NoFrameRet - (DWORD)(uintptr_t)GetModuleHandleA(nullptr)));
    Check(Logged.size() == 1 && Logged[0].find(want) != std::string::npos, std::string("no frame: via = the routine's return address (") + want + ")");
    char args[64]; snprintf(args, sizeof args, "fargs=%lx,111,222,333", (unsigned long)(DWORD)(uintptr_t)ai);
    Check(Logged.size() == 1 && Logged[0].find(args) != std::string::npos, std::string("no frame: fargs = the routine's arguments (") + args + ")");
    Check(GotX == 0x111 && GotY == 0x222 && GotStr == ai, "no frame: the API gets the game's arguments");
  }
  /* slots by value (a packed module, its header lists only the packer's imports): this program calls GetTextMetricsW through
     its import table (DrawSites' FontHeight); the slots found by value are the ones the header names */
  {
    uintptr_t base = (uintptr_t)GetModuleHandleA(nullptr); std::uint32_t byName[8], byValue[8];
    int a = DrawSites::Slots(base, "GetTextMetricsW", byName, 8), b = DrawSites::SlotsByValue(base, "GetTextMetricsW", byValue, 8);
    bool same = a >= 1 && b >= 1; for (int i = 0; i < b && same; i++) { bool in = false; for (int j = 0; j < a; j++) if (byValue[i] == byName[j]) in = true; same = in; }
    Check(same, "slots by value = the import table's slots (" + std::to_string(a) + " by name, " + std::to_string(b) + " by value)");
    Check(DrawSites::SlotsByValue(base, "TextOutW", byValue, 8) == 0, "slots by value: an API never called through the import table has none");
  }
  printf("draw sites gate: %d failure(s)\n", Failures);
  return Failures;
}
