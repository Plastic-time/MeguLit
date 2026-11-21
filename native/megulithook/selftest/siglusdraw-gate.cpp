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
#include <stdexcept>
#include "siglusdraw-control-write.h"
static std::vector<std::string> Logs;
static bool ThrowLog=false,FaultLog=false;static void (*LogTap)()=nullptr;static void (*ConversionTap)()=nullptr;
static int WINAPI ObserverWideCharToMultiByte(UINT cp,DWORD flags,LPCWCH text,int length,LPSTR out,int cap,LPCCH def,LPBOOL used){if(ConversionTap){auto tap=ConversionTap;ConversionTap=nullptr;tap();}return ::WideCharToMultiByte(cp,flags,text,length,out,cap,def,used);}
static bool PeerClobber=false,PeerThrow=false,PeerFault=false;
static volatile LONG PeerInjected=0,PeerLogEntries=0;static DWORD PeerBadMxcsr=0x5f80;
static __declspec(align(16)) unsigned char PeerFx[512];
namespace Msg { void Log(const char *f, ...) {
InterlockedIncrement(&PeerLogEntries);
if(PeerClobber){InterlockedIncrement(&PeerInjected);
__asm{pxor xmm0,xmm0}
__asm{pxor xmm7,xmm7}
__asm{fninit}
__asm{ldmxcsr PeerBadMxcsr}
__asm{clc}
__asm{fxsave PeerFx}
if(PeerThrow)throw std::runtime_error("peer FX then C++");
if(PeerFault)RaiseException(EXCEPTION_ACCESS_VIOLATION,0,0,nullptr);
} if(ThrowLog)throw std::runtime_error("fixture logger");if(FaultLog)RaiseException(EXCEPTION_ACCESS_VIOLATION,0,0,nullptr);char b[700]; va_list a; va_start(a, f); vsnprintf(b, sizeof b, f, a); va_end(a); Logs.push_back(b);if(LogTap)LogTap();__asm {pxor xmm0,xmm0}
__asm {pxor xmm7,xmm7}
__asm {fninit}
__asm {stc}
} }
#if !defined(SIGLUS_LEGACY_PERMISSION) && !defined(SIGLUS_PERMISSION_FIXED)
#define SIGLUS_PERMISSION_FIXED
#endif
#ifndef SIGLUS_HEADER
#define SIGLUS_HEADER "../SiglusDraw.h"
#endif
#define WideCharToMultiByte ObserverWideCharToMultiByte
#include SIGLUS_HEADER
#undef WideCharToMultiByte

static int Failures = 0,Checks=0;
static void Check(bool ok, const std::string &what) { Checks++;printf("%s %s\n", ok ? "PASS" : "FAIL", what.c_str()); if (!ok) Failures++; }

static volatile DWORD LastRet, LastAddRet, LastEcx, LastMoji, LastClearEcx, Pushes, Clears, LastFrameEcx, LastFrameArg9, Frames;
static DWORD EntryEax,EntryEcx,EntryEdx,EntryEbx,EntryEbp,EntryEsi,EntryEdi,EntryFlags,EntryEsp;
static DWORD AbiAfterEax,AbiAfterEcx,AbiAfterEdx,AbiAfterEbx,AbiAfterEbp,AbiAfterEsi,AbiAfterEdi,AbiBeforeEsp,AbiAfterEsp;
static DWORD AbiCaller[2]={0,0x12341234},AbiWords[9],AbiCount=0,AbiEcx=0;static void *AbiTarget=nullptr;
static __declspec(align(16)) unsigned char EntryFx[512],AbiSavedFx[512];
static __declspec(align(16)) DWORD Pattern[4]={0xabcdef12,0x12345678,0x11223344,0x55667788},AbiXmm0[4],AbiXmm7[4];
static DWORD Mxcsr=0x3f80,AbiMxcsr;static WORD FpuControl=0x0b7f,AbiFpuControl;static double AbiX87;
static __declspec(naked) void CaptureEntry(){__asm{
 pushfd
 pushad
 mov edx,esp
 mov eax,[edx+28]
 mov EntryEax,eax
 mov eax,[edx+24]
 mov EntryEcx,eax
 mov eax,[edx+20]
 mov EntryEdx,eax
 mov eax,[edx+16]
 mov EntryEbx,eax
 mov eax,[edx+8]
 mov EntryEbp,eax
 mov eax,[edx+4]
 mov EntryEsi,eax
 mov eax,[edx]
 mov EntryEdi,eax
 mov eax,[edx+32]
 mov EntryFlags,eax
 lea eax,[edx+40]
 mov EntryEsp,eax
 fxsave EntryFx
 popad
 popfd
 ret
}}
static __declspec(naked) void AbiInvoke(){__asm{
 push ebp
 push ebx
 push esi
 push edi
 fxsave AbiSavedFx
 mov ecx,AbiCount
 test ecx,ecx
 jz seeded
 lea edx,AbiWords
argloop:
 push dword ptr [edx+ecx*4-4]
 dec ecx
 jnz argloop
seeded:
 mov AbiBeforeEsp,esp
 fninit
 fld1
 fldcw FpuControl
 ldmxcsr Mxcsr
 movdqu xmm0,Pattern
 movdqu xmm7,Pattern
 pushfd
 pop eax
 and eax,0xfffff32a
 or eax,0xc45
 push eax
 popfd
 mov eax,0x24682468
 mov ecx,AbiEcx
 mov edx,0x33334444
 mov ebx,0x55556666
 mov ebp,offset AbiCaller
 mov esi,0x73737373
 mov edi,0x93939393
 call dword ptr [AbiTarget]
 mov AbiAfterEax,eax
 mov AbiAfterEcx,ecx
 mov AbiAfterEdx,edx
 mov AbiAfterEbx,ebx
 mov AbiAfterEbp,ebp
 mov AbiAfterEsi,esi
 mov AbiAfterEdi,edi
 mov AbiAfterEsp,esp
 cld
 movdqu AbiXmm0,xmm0
 movdqu AbiXmm7,xmm7
 stmxcsr AbiMxcsr
 fnstcw AbiFpuControl
 fstp AbiX87
 fxrstor AbiSavedFx
 pop edi
 pop esi
 pop ebx
 pop ebp
 ret
}}
static bool AbiState(DWORD result){return EntryEax==0x24682468&&EntryEcx==AbiEcx&&EntryEdx==0x33334444&&EntryEbx==0x55556666&&EntryEbp==(DWORD)AbiCaller&&EntryEsi==0x73737373&&EntryEdi==0x93939393&&(EntryFlags&0xcd5)==0xc45&&EntryEsp+4==AbiBeforeEsp&&AbiAfterEax==result&&AbiAfterEcx==AbiEcx&&AbiAfterEdx==EntryEdx&&AbiAfterEbx==EntryEbx&&AbiAfterEbp==EntryEbp&&AbiAfterEsi==EntryEsi&&AbiAfterEdi==EntryEdi&&AbiAfterEsp==AbiBeforeEsp+AbiCount*4&&!memcmp(EntryFx+160,Pattern,16)&&!memcmp(EntryFx+272,Pattern,16)&&*(DWORD *)(EntryFx+24)==Mxcsr&&*(WORD *)EntryFx==FpuControl&&!memcmp(AbiXmm0,Pattern,16)&&!memcmp(AbiXmm7,Pattern,16)&&AbiMxcsr==Mxcsr&&AbiFpuControl==FpuControl&&AbiX87==1.0;}
/* (each stub below starts with its own mov eax,N so the linker cannot fold identical ones into one address) */
/* the stand-in std::vector<moji>::push_back(const moji&): records what it was given, ret 4 */
static __declspec(naked) void FakePush() {
  __asm {
    call CaptureEntry
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
    call CaptureEntry
    mov LastClearEcx, ecx
    inc Clears
    nop
    ret
  }
}
/* the stand-in msg::frame(param, 8 more): ret 0x24 like the engine's */
static __declspec(naked) void FakeFrame() {
  __asm {
    call CaptureEntry
    mov LastFrameEcx, ecx
    mov eax, [esp + 36]
    mov LastFrameArg9, eax
    inc Frames
    ret 0x24
  }
}
/* mwnd::frame calling msg::frame(param, 0 x6, x, y) */
static __declspec(naked) void __cdecl FrameCall(void *, void *, long, long) { __asm {
  mov eax, 264
  mov eax, [esp + 16]
  push eax
  mov eax, [esp + 16]
  push eax
  push 0
  push 0
  push 0
  push 0
  push 0
  push 0
  mov eax, [esp + 40]
  push eax
  mov ecx, [esp + 40]
  call FakeFrame
  ret } }
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
static DWORD ColorTable[2] = {0xffffffff, 0xffff6464}; static DWORD *ColorVec[2] = {ColorTable, ColorTable + 2};
static float Param[8];
static void *Vec(unsigned char *msg) { return msg + 0x1ac; }
static FakeMoji *Moji(wchar_t c, int x, int y, int size = 32, int color = -1) { memset(&M, 0, sizeof M); M.code = c; M.x = x; M.y = y; M.size = size; M.color = color; return &M; }
static void Text(void (__cdecl *call)(void *, void *), unsigned char *msg, const wchar_t *s, int x, int y, int size = 32) {
  for (int i = 0; s[i]; i++) call(Vec(msg), Moji(s[i], x + i * size, y, size));
}
static bool Has(const char *needle) { for (auto &l : Logs) if (l.find(needle) != std::string::npos) return true; return false; }
static std::string Find(const char *needle) { for (auto &l : Logs) if (l.find(needle) != std::string::npos) return l; return std::string(); }
static std::string U8(const wchar_t *w) { return SiglusDraw::Utf8(w, (int)wcslen(w)); }

static std::wstring ControlFile(){wchar_t tmp[MAX_PATH],file[MAX_PATH+64];GetTempPathW(MAX_PATH,tmp);std::wstring dir=std::wstring(tmp)+L"MeguLit";CreateDirectoryW(dir.c_str(),nullptr);dir+=L"\\draw";CreateDirectoryW(dir.c_str(),nullptr);swprintf_s(file,L"%s\\%lu.txt",dir.c_str(),GetCurrentProcessId());return file;}
static void Control(const wchar_t *s){WriteControlFixture(ControlFile(),s,(DWORD)(wcslen(s)*2));}
static void Refresh(){
#ifdef SIGLUS_PERMISSION_FIXED
 SiglusDraw::RefreshControl();
#else
 if(SiglusDraw::RolesAsked())SiglusDraw::Install();
#endif
}
static void Permit(){Control(L"\xfeff#cfg roles=1 embed=0 zh=1\r\n");Refresh();}
#ifdef SIGLUS_PERMISSION_FIXED
static bool EmptyState(){EnterCriticalSection(&SiglusDraw::Lock);bool empty=SiglusDraw::RunG.empty()&&SiglusDraw::RunRuby.empty()&&!SiglusDraw::RunVec&&SiglusDraw::RunRole==-1&&SiglusDraw::RunSrc==-1&&!SiglusDraw::InRuby&&!SiglusDraw::LastTick&&!SiglusDraw::NDrawn&&!SiglusDraw::NOrigins;LeaveCriticalSection(&SiglusDraw::Lock);return empty;}
static bool WaitObserving(LONG n){for(int i=0;i<400;i++){EnterCriticalSection(&SiglusDraw::Lock);bool same=SiglusDraw::Observing==n;LeaveCriticalSection(&SiglusDraw::Lock);if(same)return true;Sleep(10);}return false;}
static DWORD WINAPI ReadThread(void *){SiglusDraw::RolesAsked();return 0;}
static bool LockReleased(){HANDLE t=CreateThread(nullptr,0,ReadThread,nullptr,0,nullptr);bool done=t&&WaitForSingleObject(t,1000)==WAIT_OBJECT_0;if(t)CloseHandle(t);return done;}
static void Revoke(){LogTap=nullptr;Control(L"\xfeff#cfg roles=0\r\n");Refresh();}
static void RevokeResume(){Revoke();Permit();}
#endif

int main() {
  setvbuf(stdout,nullptr,_IONBF,0);
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
  S.frame = (std::uint32_t)(uintptr_t)&FakeFrame; S.frameX = 0x14; S.frameY = 0x18; S.frameArgX = 0x24; S.frameArgY = 0x28;
  S.colors = (std::uint32_t)(uintptr_t)ColorVec;
  InitializeCriticalSection(&SiglusDraw::Lock);
  Check(MH_Initialize() == MH_OK, "MinHook");
#ifdef SIGLUS_PERMISSION_FIXED
  Refresh();
  Check(!SiglusDraw::Installed&&!SiglusDraw::Observing&&!SiglusDraw::OrigPush&&!SiglusDraw::OrigClear&&!SiglusDraw::OrigFrame,"missing control cannot install any detour");
  Control(L"\xfeff#cfg roles=0\r\n");Refresh();
  DWORD initialPushes=Pushes;LineCall(Vec(MsgA),Moji(L'x',0,0));
  Check(!SiglusDraw::Installed&&!SiglusDraw::Observing&&Pushes==initialPushes+1&&Logs.empty(),"default off leaves original call intact and emits no observer log");
#endif
  Permit();
  Check(Has("ToMe_DRAWRUN engine=siglus on:") && Find("engine=siglus on:").find(" frame 0 ") == std::string::npos, "hook on, msg::frame too");
  /* the window slides in (two places), then stays: one origin, the settled one = (int)param x + arg 8 */
  Param[5] = 10.75f; Param[6] = 500.5f; FrameCall(MsgA, Param, 0, 0); Param[5] = 40.5f; FrameCall(MsgA, Param, 0, 0);
  for (int i = 0; i < 3; i++) FrameCall(MsgA, Param, 60, 20);
  Check(LastFrameEcx == (DWORD)(uintptr_t)MsgA && LastFrameArg9 == 20 && Frames == 5, "the hooked msg::frame still gets its msg (ecx) and its arguments");
  char org[96]; sprintf_s(org, "ToMe_DRAWRUN engine=siglus origin id=%x ox=100 oy=520", (unsigned)(uintptr_t)Vec(MsgA));
  int origins = 0; for (auto &l : Logs) origins += l.find("engine=siglus origin") != std::string::npos;
  Check(Has(org) && origins == 1, "one origin, after it settled: ox = (int)40.5 + 60, oy = (int)500.5 + 20");
  for (int i = 0; i < 3; i++) FrameCall(MsgA, Param, 60, 20);
  origins = 0; for (auto &l : Logs) origins += l.find("engine=siglus origin") != std::string::npos;
  Check(origins == 1, "the same origin again says nothing");

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
  NamePush(Vec(MsgName), Moji(L'赤', 0, 40, 28, 1)); NamePush(Vec(MsgName), Moji(L'色', 28, 40, 28, 1));
  SiglusDraw::FlushIdle(); Sleep(200); SiglusDraw::FlushIdle();
  std::string l1 = Find((std::string("text=") + U8(L"今日は漢字だ")).c_str());
  Check(!l1.empty(), "line: 今日は漢字だ is one run");
  Check(l1.find("role=line id=print:") != std::string::npos && l1.find(" n=6 x0=8 y0=0 x1=200 y1=32 size=32 color=-1 rgb=ffffff ox=100 oy=520") != std::string::npos, "line: role, id, box, size, colour, RGB through the table, screen origin");
  Check(l1.find(" ruby=3:2:" + U8(L"かんじ") + " ") != std::string::npos, "line: ruby かんじ over characters 3..4 (漢字), reading glyphs not in the text");
  Check(Has((std::string("role=line id=print:") ).c_str()) && Has((std::string("y0=40 x1=104 y1=72 size=32 color=-1 rgb=ffffff ox=100 oy=520 text=") + U8(L"次の行")).c_str()), "line: the next line is its own run");
  Check(Has((std::string("role=name id=name:") ).c_str()) && Has((std::string("size=28 color=-1 rgb=ffffff text=") + U8(L"春原")).c_str()), "name window: role=name");
  std::string nm = Find((std::string("text=") + U8(L"【春原】")).c_str());
  Check(nm.find("role=name id=print:") != std::string::npos, "a name inside the message: role=name");
  Check(Find((std::string("text=") + U8(L"赤色")).c_str()).find(" color=1 rgb=ff6464 text=") != std::string::npos, "colour no. 1 through the table: ff6464, no origin for an area that has none");
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
  // The installed old observer continues collecting after permission is removed.
  Logs.clear();Text(LineCall,MsgA,L"旧",8,0);Control(L"\xfeff#cfg roles=0\r\n");Refresh();
  Check(SiglusDraw::RunG.empty()&&SiglusDraw::RunRuby.empty()&&!SiglusDraw::RunVec&&SiglusDraw::RunRole==-1&&SiglusDraw::NDrawn==0&&SiglusDraw::NOrigins==0,"revocation clears pending text/ruby/role/source/origin/clear dedup");
  DWORD pushesBefore=Pushes,clearsBefore=Clears,framesBefore=Frames;
  Text(LineCall,MsgA,L"拒",8,0);Text(RubyPush,MsgA,L"きょ",8,-16,16);ClearCall(MsgA);for(int i=0;i<3;i++)FrameCall(MsgA,Param,60,20);Sleep(170);SiglusDraw::FlushIdle();
  Check(Logs.empty()&&Pushes==pushesBefore+3&&Clears==clearsBefore+1&&Frames==framesBefore+3,"off Push/Ruby/Clear/Frame/FlushIdle only forward original functions");
  SiglusDraw::Moji direct{0,L'拒',32,0,8,0,-1};SiglusDraw::Handle(P_PRINT,A_LINE,(uintptr_t)Vec(MsgA),direct);
  Check(SiglusDraw::RunG.empty(),"direct Handle entry also rejects observation after permission is revoked");
#ifdef SIGLUS_PERMISSION_FIXED
  Check(EmptyState(),"all revoked paths leave no hidden pending/dedup state");
  Permit();Logs.clear();Text(LineCall,MsgA,L"新",8,0);Sleep(170);SiglusDraw::FlushIdle();Check(Logs.size()==1&&Has(("text="+U8(L"新")).c_str())&&!Has(U8(L"旧").c_str()),"resume publishes only fresh text");
  Logs.clear();for(int i=0;i<3;i++)FrameCall(MsgA,Param,60,20);Check(Logs.size()==1&&Has("engine=siglus origin"),"origin settles again after epoch reset instead of using old told dedup");
  // A failed logger must not strand the lock or swallow any original operation.
  Logs.clear();Text(LineCall,MsgA,L"旧",8,0);ThrowLog=true;pushesBefore=Pushes;Text(NamePush,MsgName,L"新",0,0);ThrowLog=false;
  Check(Pushes==pushesBefore+1&&LockReleased()&&EmptyState(),"Push logger C++ exception clears state, releases lock and forwards original");
  Text(LineCall,MsgA,L"旧",8,0);FaultLog=true;pushesBefore=Pushes;Text(NamePush,MsgName,L"新",0,0);FaultLog=false;
  Check(Pushes==pushesBefore+1&&LockReleased()&&EmptyState(),"Push logger SEH fault also leaves original and lock usable");
  Text(LineCall,MsgA,L"旧",8,0);ThrowLog=true;clearsBefore=Clears;ClearCall(MsgA);ThrowLog=false;
  Check(Clears==clearsBefore+1&&LockReleased()&&EmptyState(),"Clear logger exception cannot skip original clear or strand lock");
  for(int i=0;i<2;i++)FrameCall(MsgA,Param,60,20);ThrowLog=true;framesBefore=Frames;FrameCall(MsgA,Param,60,20);ThrowLog=false;
  Check(Frames==framesBefore+1&&LockReleased()&&EmptyState(),"Frame logger exception cannot skip original frame or strand lock");
  Text(LineCall,MsgA,L"旧",8,0);Sleep(170);ThrowLog=true;SiglusDraw::FlushIdle();ThrowLog=false;
  Check(LockReleased()&&EmptyState(),"idle-flush logger exception releases lock and discards partial state");
  SiglusDraw::OnPush(S.site[0]+5,(const unsigned char *)1,(uintptr_t)Vec(MsgA),(const unsigned char *)1);Check(LockReleased()&&EmptyState(),"bad push snapshot pointer clears state safely");
  SiglusDraw::OnFrame((uintptr_t)MsgA,(const unsigned char *)1);Check(LockReleased()&&EmptyState(),"bad frame pointer clears state safely");
  // Every continuation checks its permission epoch after external conversion/logger calls.
  Logs.clear();Text(LineCall,MsgA,L"旧",8,0);LogTap=&RevokeResume;Text(NamePush,MsgName,L"新",0,0);Check(SiglusDraw::Observing&&EmptyState(),"off-on during Push boundary flush cannot rebuild old/new pending text from the interrupted call");
  Logs.clear();Text(LineCall,MsgA,L"旧",8,0);LogTap=&Revoke;ClearCall(MsgA);Check(!SiglusDraw::Observing&&EmptyState()&&Logs.size()==1&&!Has("engine=siglus clear"),"Clear stops continuation after a flush logger revokes permission");Permit();
  Logs.clear();Text(LineCall,MsgA,L"旧",8,0);Sleep(170);ConversionTap=&RevokeResume;SiglusDraw::FlushIdle();Check(Logs.empty()&&EmptyState(),"off-on during Flush UTF16 conversion discards old snapshot before log");
  Logs.clear();Text(LineCall,MsgA,L"漢字",8,0);*(long *)(MsgA+0x180)=0;*(long *)(MsgA+0xe0)=64;ConversionTap=&RevokeResume;Text(RubyPush,MsgA,L"か",8,-16,16);Check(Logs.empty()&&EmptyState(),"ruby conversion off-on cannot append an old reading into fresh epoch");
  for(int i=0;i<2;i++)FrameCall(MsgA,Param,60,20);LogTap=&RevokeResume;FrameCall(MsgA,Param,60,20);Check(EmptyState(),"origin logger off-on cannot resurrect told/origin state");
  Logs.clear();Text(LineCall,MsgA,L"旧",8,0);AbiTarget=(void *)&FakePush;AbiEcx=(DWORD)Vec(MsgA);AbiWords[0]=(DWORD)Moji(L'新',8,0);AbiCount=1;pushesBefore=Pushes;LONG originalAbiEntries=PeerLogEntries;AbiInvoke();
  Check(PeerLogEntries==originalAbiEntries+1&&PushRole(S,LastRet)==P_OTHER,"peer original fixed-fixture Push ABI actually executes logger through P_OTHER boundary");
  Check(AbiState((DWORD)&M)&&Pushes==pushesBefore+1&&LastMoji==(DWORD)&M&&LastEcx==AbiEcx,"actual Push ret4 gate preserves entry GPR/flags/ESP/XMM/x87, original argument and opaque return");
  Text(LineCall,MsgA,L"旧",8,0);AbiTarget=(void *)&FakeClear;AbiEcx=(DWORD)MsgA;AbiCount=0;clearsBefore=Clears;originalAbiEntries=PeerLogEntries;AbiInvoke();
  Check(PeerLogEntries==originalAbiEntries+2,"peer original fixed-fixture Clear ABI actually executes flush and clear loggers");
  Check(AbiState(0x24682468)&&Clears==clearsBefore+1&&LastClearEcx==AbiEcx,"actual Clear ret0 gate preserves entry GPR/flags/ESP/XMM/x87 and original return");
  for(int i=0;i<2;i++)FrameCall(MsgA,Param,60,20);AbiTarget=(void *)&FakeFrame;AbiEcx=(DWORD)MsgA;memset(AbiWords,0,sizeof AbiWords);AbiWords[0]=(DWORD)Param;AbiWords[7]=60;AbiWords[8]=20;AbiCount=9;framesBefore=Frames;originalAbiEntries=PeerLogEntries;AbiInvoke();
  Check(PeerLogEntries==originalAbiEntries+1,"peer original fixed-fixture Frame ABI actually executes logger");
  Check(AbiState(20)&&Frames==framesBefore+1&&LastFrameArg9==20&&LastFrameEcx==AbiEcx,"actual Frame ret36 gate preserves nine words, GPR/flags/ESP/XMM/x87 and opaque return");
  // Peer: learn the actual AbiInvoke CALL return while keeping production routing intact.
  AbiTarget=(void *)&FakePush;AbiEcx=(DWORD)Vec(MsgA);AbiWords[0]=(DWORD)Moji(L'新',8,0);AbiCount=1;
  LONG injectedBefore=PeerInjected;AbiInvoke();
  Check(PeerInjected==injectedBefore&&PushRole(S,LastRet)==P_OTHER,"peer baseline ABI Push caller is unlearned P_OTHER, not a rejected role");
  site(LastRet,P_PRINT);
  Check(PushRole(S,LastRet)==P_PRINT,"peer ABI Push caller now matches explicitly learned site");
  for(int kind=0;kind<3;kind++){
    Revoke();Permit();Logs.clear();Text(LineCall,MsgBk,L"旧",8,0);
    AbiTarget=(void *)&FakePush;AbiEcx=(DWORD)Vec(MsgA);AbiWords[0]=(DWORD)Moji(L'新',8,0);AbiCount=1;
    injectedBefore=PeerInjected;pushesBefore=Pushes;PeerClobber=true;PeerThrow=kind==1;PeerFault=kind==2;
    AbiInvoke();PeerClobber=PeerThrow=PeerFault=false;
    unsigned char zero[16]={};
    Check(PeerInjected==injectedBefore+1&&!memcmp(PeerFx+160,zero,16)&&!memcmp(PeerFx+272,zero,16)&&*(DWORD *)(PeerFx+24)==PeerBadMxcsr&&*(WORD *)PeerFx==0x37f,
       kind==0?"peer matched Push logger actually clobbers XMM0/7 CW and MXCSR":kind==1?"peer C++ path reaches logger FX clobber before throw":"peer SEH path reaches logger FX clobber before raise");
    Check(AbiState((DWORD)&M)&&Pushes==pushesBefore+1&&LastMoji==(DWORD)&M&&LastEcx==AbiEcx&&LockReleased()&&(kind==0||EmptyState()),
       kind==0?"peer matched Push forwards ABI after executed logger":kind==1?"peer FX then C++ preserves original ABI and releases lock":"peer FX then SEH preserves original ABI and releases lock");
  }
  for(int gate=0;gate<2;gate++)for(int kind=1;kind<3;kind++){
    Revoke();Permit();Logs.clear();
    if(gate==0){Text(LineCall,MsgA,L"旧",8,0);AbiTarget=(void *)&FakeClear;AbiEcx=(DWORD)MsgA;AbiCount=0;}
    else{for(int i=0;i<2;i++)FrameCall(MsgA,Param,60,20);AbiTarget=(void *)&FakeFrame;AbiEcx=(DWORD)MsgA;memset(AbiWords,0,sizeof AbiWords);AbiWords[0]=(DWORD)Param;AbiWords[7]=60;AbiWords[8]=20;AbiCount=9;}
    injectedBefore=PeerInjected;clearsBefore=Clears;framesBefore=Frames;PeerClobber=true;PeerThrow=kind==1;PeerFault=kind==2;
    AbiInvoke();PeerClobber=PeerThrow=PeerFault=false;unsigned char zero[16]={};
    Check(PeerInjected==injectedBefore+1&&!memcmp(PeerFx+160,zero,16)&&!memcmp(PeerFx+272,zero,16)&&*(DWORD *)(PeerFx+24)==PeerBadMxcsr&&*(WORD *)PeerFx==0x37f,
      gate==0?(kind==1?"peer Clear C++ path clobbers FX before throw":"peer Clear SEH path clobbers FX before raise"):(kind==1?"peer Frame C++ path clobbers FX before throw":"peer Frame SEH path clobbers FX before raise"));
    bool forwarded=gate==0?Clears==clearsBefore+1&&LastClearEcx==AbiEcx:Frames==framesBefore+1&&LastFrameEcx==AbiEcx&&LastFrameArg9==20;
    Check(AbiState(gate==0?0x24682468:20)&&forwarded&&LockReleased()&&EmptyState(),
      gate==0?(kind==1?"peer Clear FX then C++ preserves original ABI and releases lock":"peer Clear FX then SEH preserves original ABI and releases lock"):(kind==1?"peer Frame FX then C++ preserves original ABI and releases lock":"peer Frame FX then SEH preserves original ABI and releases lock"));
  }
  // Real background watcher continues permission refresh while preserving 150ms idle flush.
  Logs.clear();HANDLE stop=CreateEventW(nullptr,TRUE,FALSE,nullptr);HANDLE watcher=CreateThread(nullptr,0,SiglusDraw::Watch,stop,0,nullptr);
  Control(L"\xfeff#cfg roles=0\r\n");Check(watcher&&WaitObserving(0)&&EmptyState(),"continuous watcher revokes installed paths");
  Text(LineCall,MsgA,L"拒",8,0);Sleep(170);SiglusDraw::FlushIdle();Check(Logs.empty(),"watcher-revoked glyphs do not leak through idle flush");
  Control(L"\xfeff#cfg roles=1\r\n");Check(WaitObserving(1),"same watcher resumes existing hooks");
  Logs.clear();Text(LineCall,MsgA,L"新",8,0);bool idleLogged=false;for(int i=0;i<100;i++){EnterCriticalSection(&SiglusDraw::Lock);idleLogged=!Logs.empty();LeaveCriticalSection(&SiglusDraw::Lock);if(idleLogged)break;Sleep(10);}Check(idleLogged,"product watcher retains the normal idle-run flush without another glyph");
  HANDLE locked=CreateFileW(ControlFile().c_str(),GENERIC_READ,0,nullptr,OPEN_EXISTING,0,nullptr);Check(locked!=INVALID_HANDLE_VALUE&&WaitObserving(0)&&EmptyState(),"read failure revokes installed observer");if(locked!=INVALID_HANDLE_VALUE)CloseHandle(locked);Check(WaitObserving(1),"watcher recovers after read failure");
  Control(L"\xfeff#cfg roles=10\r\n");Check(WaitObserving(0),"malformed permission revokes installed observer");Control(L"\xfeff#cfg roles=1\r\n");Check(WaitObserving(1),"valid permission resumes after malformed file");
  wchar_t oldTmp[32768]={},missing[32768];DWORD count=GetEnvironmentVariableW(L"TMP",oldTmp,32768);swprintf_s(missing,L"H:\\MeguLit-Work\\tmp\\siglus-gate-missing-%lu\\",GetCurrentProcessId());SetEnvironmentVariableW(L"TMP",missing);Check(WaitObserving(0),"missing control revokes installed observer");SetEnvironmentVariableW(L"TMP",count?oldTmp:nullptr);Check(WaitObserving(1),"watcher recovers after control path returns");
  SetEvent(stop);Check(WaitForSingleObject(watcher,4000)==WAIT_OBJECT_0,"watcher joins before MinHook cleanup");CloseHandle(watcher);CloseHandle(stop);Revoke();
#endif
  Check(MH_DisableHook((void *)(uintptr_t)S.push)==MH_OK&&MH_DisableHook((void *)(uintptr_t)S.clear)==MH_OK&&MH_DisableHook((void *)(uintptr_t)S.frame)==MH_OK,"actual three detours disable cleanly");MH_RemoveHook((void *)(uintptr_t)S.push);MH_RemoveHook((void *)(uintptr_t)S.clear);MH_RemoveHook((void *)(uintptr_t)S.frame);MH_Uninitialize();
  for (auto &l : Logs) printf("  %s\n", l.c_str());
  printf("siglus draw gate: %d checks, %d failure(s)\n",Checks,Failures);
  return Failures;
}
