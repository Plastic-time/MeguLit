// SPDX-License-Identifier: GPL-3.0-or-later
// Real MinHook patches this executable's own FF15 fake-API callsite; no game or injection.
// Build x86 against native/shared/minhook/include and its buffer/hook/trampoline/hde32 C sources.
// Tests permission, SEH and selected ABI state on a fake API; not live engine acceptance.
#include <windows.h>
#include <cstdio>
#include <cstdarg>
#include <string>
#include <vector>
static std::vector<std::string> Logs;
static volatile LONG ThrowLogger=0, ApiCalls=0, PauseLogger=0, Faults=0, ClobberLogger=0, Clobbered=0;
static const DWORD ClobberMxcsr=0x1f80;
static void ClobberFx(){__asm{pxor xmm0,xmm0
 pxor xmm7,xmm7
 fninit
 ldmxcsr ClobberMxcsr
 }InterlockedIncrement(&Clobbered);}
static HANDLE LogEntered,LogRelease,RevokeEntered;
static LONG CALLBACK ObserveFault(EXCEPTION_POINTERS *p){if(p->ExceptionRecord->ExceptionCode==EXCEPTION_ACCESS_VIOLATION)InterlockedIncrement(&Faults);return EXCEPTION_CONTINUE_SEARCH;}
namespace Msg { static void Log(const char *fmt,...){if(InterlockedExchange(&PauseLogger,0)){SetEvent(LogEntered);if(WaitForSingleObject(LogRelease,2000)!=WAIT_OBJECT_0)RaiseException(0xe0421002,0,0,nullptr);}if(InterlockedExchange(&ThrowLogger,0)){if(InterlockedExchange(&ClobberLogger,0))ClobberFx();RaiseException(0xe0421001,0,0,nullptr);} char b[1024];va_list a;va_start(a,fmt);vsnprintf(b,sizeof b,fmt,a);va_end(a);Logs.emplace_back(b);if(InterlockedExchange(&ClobberLogger,0))ClobberFx();} }
#include "../DrawSites.h"
static int Failed=0, Passed=0;
static void Check(bool ok,const char *name){printf("%s %s\n",ok?"PASS":"FAIL",name);if(ok)Passed++;else Failed++;}
static DWORD GotHdc,GotX,GotY,GotN,GotFlags,GotEax,GotEcx,GotEdx,GotEbx,GotEsi,GotEdi;
static const char *GotText;
static DWORD BeforeEsp,AfterEsp,AfterEax;
static void *Site;
static LONG FpMode=0;
static __declspec(align(16)) unsigned char SavedFx[512];
static __declspec(align(16)) DWORD XmmPattern[4]={0x12345678,0xabcdef01,0x99887766,0x11223344},GotXmm0[4],GotXmm7[4];
static const WORD GameCw=0x0b7f;static const DWORD GameMxcsr=0x3f80;
static WORD GotCw;static DWORD GotMxcsr;static double GotX87;
static __declspec(naked) BOOL WINAPI FakeApi(HDC,int,int,LPCSTR,int){__asm {
 pushfd
 pop GotFlags
 cmp FpMode,0
 je noFx
 movdqu GotXmm0,xmm0
 movdqu GotXmm7,xmm7
 fnstcw GotCw
 stmxcsr GotMxcsr
 fst qword ptr GotX87
 noFx:
 cld
 mov GotEax,eax
 mov GotEcx,ecx
 mov GotEdx,edx
 mov GotEbx,ebx
 mov GotEsi,esi
 mov GotEdi,edi
 mov eax,[esp+4]
 mov GotHdc,eax
 mov eax,[esp+8]
 mov GotX,eax
 mov eax,[esp+12]
 mov GotY,eax
 mov eax,[esp+16]
 mov GotText,eax
 mov eax,[esp+20]
 mov GotN,eax
 inc ApiCalls
 mov eax,77
 ret 20
} }
static void Draw(const char*,int,int,int);
static __declspec(naked) void InvokeFx(const char*){__asm{
 push ebp
 push ebx
 push esi
 push edi
 mov eax,[esp+20]
 fxsave SavedFx
 fninit
 fldcw GameCw
 ldmxcsr GameMxcsr
 fld1
 movdqu xmm0,XmmPattern
 movdqu xmm7,XmmPattern
 push 20
 push 0
 push 2
 push eax
 stc
 std
 call Draw
 add esp,16
 cld
 fxrstor SavedFx
 pop edi
 pop esi
 pop ebx
 pop ebp
 ret
}}
static void CheckFx(const char *text,const char *label){FpMode=1;InvokeFx(text);FpMode=0;
 Check(!memcmp(GotXmm0,XmmPattern,sizeof XmmPattern)&&!memcmp(GotXmm7,XmmPattern,sizeof XmmPattern)&&GotCw==GameCw&&GotMxcsr==GameMxcsr&&GotX87==1.0&&(GotFlags&0x401)==0x401,label);
}
static void *Slot=(void*)&FakeApi;
static __declspec(naked) void Draw(const char*,int,int,int){__asm {
 push ebp
 mov ebp,esp
 push ebx
 push esi
 push edi
 lea eax,gdiSite
 mov Site,eax
 mov ebx,0x11112222
 mov esi,0x33334444
 mov edi,0x55556666
 push [ebp+12]
 push [ebp+8]
 push [ebp+20]
 push [ebp+16]
 push 0
 mov BeforeEsp,esp
 mov eax,0x12345678
 mov ecx,0x23456789
 mov edx,0x3456789a
 stc
 gdiSite:
 call dword ptr [Slot]
 mov AfterEsp,esp
 mov AfterEax,eax
 pop edi
 pop esi
 pop ebx
 mov esp,ebp
 pop ebp
 ret
} }
static void CheckPass(const char *text,int x,int y,const char *name){LONG before=ApiCalls;Draw(text,2,x,y);Check(ApiCalls==before+1&&GotHdc==0&&GotX==(DWORD)x&&GotY==(DWORD)y&&GotText==text&&GotN==2&&AfterEax==77&&AfterEsp==BeforeEsp+20,name);Check(GotEax==0x12345678&&GotEcx==0x23456789&&GotEdx==0x3456789a&&GotEbx==0x11112222&&GotEsi==0x33334444&&GotEdi==0x55556666&&(GotFlags&1),"GPR/CF at actual API survive real MinHook/gate/trampoline");}
static DWORD WINAPI Revoke(void*){if(RevokeEntered)SetEvent(RevokeEntered);DrawSites::SetObserving(false);return 0;}
static DWORD WINAPI InFlight(void*){Draw("\x82\xa0",2,0,20);return 0;}
static bool OtherThreadRevoke(){HANDLE h=CreateThread(nullptr,0,Revoke,nullptr,0,nullptr);if(!h)return false;DWORD result=WaitForSingleObject(h,1500);CloseHandle(h);if(result!=WAIT_OBJECT_0){printf("FAIL lock remained held, terminating bounded fixture\n");fflush(stdout);ExitProcess(3);}return true;}
int main(){
 void *veh=AddVectoredExceptionHandler(1,ObserveFault);
 InitializeCriticalSection(&DrawSites::Lock);
 DrawSites::Sites[0]={0,(uintptr_t)GetModuleHandleW(nullptr),0,DrawSites::A_TextOutA,false};DrawSites::NSites=1;
 const char *ai="\x82\xa0";
 Draw(ai,2,10,20);Check(Site&&*(unsigned short*)Site==0x15ff,"actual fixture instruction is call [slot]");
 Check(MH_Initialize()==MH_OK,"real MH_Initialize");
 void *stub=DrawSites::Stub(0);Check(stub!=nullptr,"real gate stub allocated");
 Check(MH_CreateHook(Site,stub,&DrawSites::DrawSitesOriginal[0])==MH_OK&&DrawSites::DrawSitesOriginal[0],"real MH_CreateHook creates relocated trampoline");
 Check(MH_EnableHook(Site)==MH_OK,"real MH_EnableHook patches the live fixture callsite");
 Check(*(unsigned char*)Site==0xe9,"actual callsite bytes changed to MinHook JMP");
 DrawSites::SetObserving(false);Logs.clear();CheckPass(ai,100,40,"roles0 original API arguments/result/stack pass");Check(DrawSites::RunChars==0&&Logs.empty(),"roles0 produces no pending/logged observation");
 CheckPass((const char*)1,0,0,"roles0 bad text pointer passes unchanged to non-reading API");Check(Logs.empty()&&DrawSites::RunChars==0,"roles0 bad pointer not observed");
 DrawSites::SetObserving(true);CheckPass(ai,100,40,"roles1 original API still passes");Check(DrawSites::RunChars==1,"roles1 starts real-gate observation");
 DrawSites::SetObserving(false);Check(DrawSites::RunChars==0&&DrawSites::RunText.empty(),"revocation discards pending authorized run");
 DrawSites::RunTick=GetTickCount()-500;DrawSites::FlushIdle();Check(Logs.empty(),"idle flush cannot publish revoked run");
 CheckPass((const char*)1,10,10,"revoked gate bad pointer still original API pass");
 DrawSites::SetObserving(true);CheckPass(ai,30,20,"roles1 reenabled via same installed MinHook");DrawSites::RunTick=GetTickCount()-500;DrawSites::FlushIdle();Check(Logs.size()==1&&Logs[0].find("text=\xe3\x81\x82")!=std::string::npos,"re-enable publishes only new run");
 // Bad observed input is handled by production SEH and never leaves the lock held
 CheckPass((const char*)1,50,20,"enabled invalid game text preserves original API call");Check(OtherThreadRevoke(),"other thread revokes after invalid text conversion");
 DrawSites::SetObserving(true);LONG faultsBefore=Faults;DrawSites::DrawSitesOnCall(0,(const DWORD*)1,0);Check(Faults>faultsBefore,"direct helper bad argument array actually raises AV");Check(OtherThreadRevoke(),"single outer lock released after confirmed helper AV");
 // Force FlushLocked's logger to raise inside AddLocked, through the actual patched callsite
 DrawSites::SetObserving(true);CheckPass(ai,100,20,"prepare run for in-call logger fault");InterlockedExchange(&ThrowLogger,1);CheckPass(ai,0,20,"logger SEH inside actual gate preserves original call");Check(ThrowLogger==0,"logger fault was actually injected in AddLocked/FlushLocked");Check(OtherThreadRevoke(),"other thread revokes after logger SEH without recursive lock leak");
 DrawSites::SetObserving(true);CheckPass(ai,100,20,"prepare run for idle logger fault");DrawSites::RunTick=GetTickCount()-500;InterlockedExchange(&ThrowLogger,1);DrawSites::FlushIdle();Check(ThrowLogger==0,"idle logger fault was actually injected");Check(OtherThreadRevoke(),"other thread revokes after idle logger SEH");
 // A real patched draw waits inside its logger while revocation queues behind the one outer lock
 DrawSites::SetObserving(true);Draw(ai,2,100,20);
 LogEntered=CreateEventW(nullptr,TRUE,FALSE,nullptr);LogRelease=CreateEventW(nullptr,TRUE,FALSE,nullptr);RevokeEntered=CreateEventW(nullptr,TRUE,FALSE,nullptr);
 InterlockedExchange(&PauseLogger,1);HANDLE drawThread=CreateThread(nullptr,0,InFlight,nullptr,0,nullptr);
 Check(WaitForSingleObject(LogEntered,1500)==WAIT_OBJECT_0,"actual patched in-flight draw reached paused logger");
 HANDLE revokeThread=CreateThread(nullptr,0,Revoke,nullptr,0,nullptr);Check(WaitForSingleObject(RevokeEntered,1500)==WAIT_OBJECT_0,"concurrent revocation entered");
 Check(WaitForSingleObject(revokeThread,50)==WAIT_TIMEOUT,"revocation waits for the in-flight read lock");
 SetEvent(LogRelease);bool drawDone=WaitForSingleObject(drawThread,1500)==WAIT_OBJECT_0;bool revokeDone=WaitForSingleObject(revokeThread,1500)==WAIT_OBJECT_0;
 Check(drawDone&&revokeDone,"in-flight draw and revocation both finish after release");if(!drawDone||!revokeDone)ExitProcess(4);
 size_t afterRevoke=Logs.size();DrawSites::RunTick=GetTickCount()-500;DrawSites::FlushIdle();Check(!DrawSites::Observing&&DrawSites::RunChars==0&&Logs.size()==afterRevoke,"after revocation returns no pending run is later published");
 CloseHandle(drawThread);CloseHandle(revokeThread);CloseHandle(LogEntered);CloseHandle(LogRelease);CloseHandle(RevokeEntered);RevokeEntered=nullptr;
 RemoveVectoredExceptionHandler(veh);
 DrawSites::SetObserving(false);CheckFx(ai,"disabled real gate preserves XMM0/XMM7/x87/CW/MXCSR and incoming DF/CF");
 DrawSites::SetObserving(true);Draw(ai,2,100,20);LONG clobbers=Clobbered;InterlockedExchange(&ClobberLogger,1);
 CheckFx("\x82\xa2","enabled real gate restores FP/SIMD/DF after observer clobbers");
 Check(Clobbered==clobbers+1,"observer actually changed XMM/x87/MXCSR before original API");
 Draw(ai,2,100,20);clobbers=Clobbered;InterlockedExchange(&ClobberLogger,1);InterlockedExchange(&ThrowLogger,1);
 CheckFx("\x82\xa2","enabled real gate restores FP/SIMD/DF after clobber then logger SEH");
 Check(Clobbered==clobbers+1&&!ThrowLogger&&!ClobberLogger,"combined FP clobber and logger exception actually occurred");
 Check(OtherThreadRevoke(),"combined FP/SEH observer releases lock for another thread");
 DrawSites::SetObserving(false);
 Check(MH_DisableHook(Site)==MH_OK,"disable own fixture hook");Check(MH_RemoveHook(Site)==MH_OK,"remove own fixture hook");Check(MH_Uninitialize()==MH_OK,"uninitialize own fixture MinHook");
 printf("draw-permission real-MinHook: %d PASS %d FAIL\n",Passed,Failed);return Failed?1:0;
}
