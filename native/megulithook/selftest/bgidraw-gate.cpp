// SPDX-License-Identifier: GPL-3.0-or-later
// Real MinHook on an actual call instruction, plus the production cdecl chain-free detour.
#include <windows.h>
#include <cstdio>
#include <cstdarg>
#include <string>
#include <vector>
#include <stdexcept>
static std::vector<std::string> Logs;static bool ThrowLog=false,FaultLog=false;static void (*LogTap)()=nullptr;
namespace Msg{static void Log(const char *f,...){if(ThrowLog)throw std::runtime_error("fixture logger");if(FaultLog)RaiseException(EXCEPTION_ACCESS_VIOLATION,0,0,nullptr);char b[1200];va_list a;va_start(a,f);vsnprintf(b,sizeof b,f,a);va_end(a);Logs.push_back(b);if(LogTap)LogTap();__asm{
 pxor xmm0,xmm0
 fninit
 stc
}}}
#include "../BgiDraw.h"
static int Failures=0,Checks=0,AdvanceCalls=0,FreeCalls=0;
static DWORD FrameData[32]={},Node[24]={},GlyphCode=0x82a0,Head=1,AdvanceArg=0xabcdef11,GotArg,GotEax,GotFlags,GotEcx,GotEdx,GotEbx,GotEbp,GotEsi,GotEdi;
static DWORD AfterEax,AfterFlags,AfterEcx,AfterEdx,AfterEbx,AfterEbp,AfterEsi,AfterEdi,BeforeEsp,AfterEsp;static void *GotHead;
static __declspec(align(16)) unsigned char SavedFx[512];static __declspec(align(16)) DWORD XmmPattern[4]={0x12345678,0xabcdef01,0x99887766,0x11223344},AfterXmm[4];static double AfterX87;
static const DWORD StatusMask=0xcd5,StatusBits=0xc45,Result=0x13572468;
static void Check(bool ok,const char *s){Checks++;printf("%s %s\n",ok?"PASS":"FAIL",s);if(!ok)Failures++;}
static __declspec(naked) void Advance(){__asm{
 pushfd
 pushad
 mov edx,esp
 mov eax,[edx+28]
 mov GotEax,eax
 mov eax,[edx+32]
 mov GotFlags,eax
 mov eax,[edx+40]
 mov GotArg,eax
 mov eax,[edx+24]
 mov GotEcx,eax
 mov eax,[edx+20]
 mov GotEdx,eax
 mov eax,[edx+16]
 mov GotEbx,eax
 mov eax,[edx+8]
 mov GotEbp,eax
 mov eax,[edx+4]
 mov GotEsi,eax
 mov eax,[edx]
 mov GotEdi,eax
 inc AdvanceCalls
 popad
 popfd
 mov eax,Result
 ret
}}
static __declspec(naked) void Layout(){__asm{
 push ebp
 push ebx
 push esi
 push edi
 fxsave SavedFx
 sub esp,0xc0
 mov eax,GlyphCode
 mov [esp+0x2c],eax
 mov eax,offset Node
 cmp Head,0
 je nohead
 lea eax,[esp+0x44]
nohead:
 mov [esp+0x9c],eax
 push AdvanceArg
 mov BeforeEsp,esp
 fninit
 fld1
 movdqu xmm0,XmmPattern
 pushfd
 pop eax
 and eax,0xfffff32a
 or eax,0xc45
 push eax
 popfd
 mov eax,0x24682468
 mov ecx,0x11112222
 mov edx,0x33334444
 mov ebx,offset Node
 mov ebp,offset FrameData
 mov esi,0x73737373
 mov edi,0x93939393
 call Advance
 pushfd
 pop AfterFlags
 mov AfterEax,eax
 mov AfterEcx,ecx
 mov AfterEdx,edx
 mov AfterEbx,ebx
 mov AfterEbp,ebp
 mov AfterEsi,esi
 mov AfterEdi,edi
 mov AfterEsp,esp
 cld
 movdqu AfterXmm,xmm0
 fstp AfterX87
 fxrstor SavedFx
 add esp,0xc4
 pop edi
 pop esi
 pop ebx
 pop ebp
 ret
}}
static __declspec(noinline) void __cdecl Free(void *head){GotHead=head;FreeCalls++;}
static volatile BgiDraw::FreeFn FreeCall=&Free;
static bool Abi(){return GotArg==AdvanceArg&&GotEax==0x24682468&&AfterEax==Result&&GotEcx==0x11112222&&AfterEcx==GotEcx&&GotEdx==0x33334444&&AfterEdx==GotEdx&&GotEbx==(DWORD)Node&&AfterEbx==GotEbx&&GotEbp==(DWORD)FrameData&&AfterEbp==GotEbp&&GotEsi==0x73737373&&AfterEsi==GotEsi&&GotEdi==0x93939393&&AfterEdi==GotEdi&&(GotFlags&StatusMask)==StatusBits&&(AfterFlags&StatusMask)==StatusBits&&BeforeEsp==AfterEsp&&!memcmp(XmmPattern,AfterXmm,sizeof XmmPattern)&&AfterX87==1.0;}
static std::wstring ControlFile(){wchar_t tmp[MAX_PATH],file[MAX_PATH+64];GetTempPathW(MAX_PATH,tmp);std::wstring dir=std::wstring(tmp)+L"MeguLit";CreateDirectoryW(dir.c_str(),nullptr);dir+=L"\\draw";CreateDirectoryW(dir.c_str(),nullptr);swprintf_s(file,L"%s\\%lu.txt",dir.c_str(),GetCurrentProcessId());return file;}
static void Control(const wchar_t *s){HANDLE h=CreateFileW(ControlFile().c_str(),GENERIC_WRITE,0,nullptr,CREATE_ALWAYS,0,nullptr);DWORD written;WriteFile(h,s,(DWORD)(wcslen(s)*2),&written,nullptr);CloseHandle(h);}
static bool WaitObserving(LONG n){for(int i=0;i<400;i++){EnterCriticalSection(&BgiDraw::Lock);bool same=BgiDraw::Observing==n;LeaveCriticalSection(&BgiDraw::Lock);if(same)return true;Sleep(10);}return false;}
static void Permit(){Control(L"\xfeff#cfg roles=1 embed=0 zh=1\r\n#role 1234=name\r\n");BgiDraw::RefreshControl();}
static void RevokeInLog(){LogTap=nullptr;Control(L"\xfeff#cfg roles=0\r\n");BgiDraw::RefreshControl();}
static void RevokeAndResumeInLog(){LogTap=nullptr;RevokeInLog();Control(L"\xfeff#cfg roles=1\r\n");BgiDraw::RefreshControl();}
static DWORD WINAPI ReadOnThread(void *){BgiDraw::ReadControl();return 0;}
static bool LockReleased(){HANDLE t=CreateThread(nullptr,0,ReadOnThread,nullptr,0,nullptr);bool done=t&&WaitForSingleObject(t,1000)==WAIT_OBJECT_0;if(t)CloseHandle(t);return done;}
int main(){
 InitializeCriticalSection(&BgiDraw::Lock);BgiDraw::Image=(uintptr_t)GetModuleHandleA(nullptr);auto nt=(IMAGE_NT_HEADERS *)(BgiDraw::Image+((IMAGE_DOS_HEADER *)BgiDraw::Image)->e_lfanew);BgiDraw::ImageEnd=BgiDraw::Image+nt->OptionalHeader.SizeOfImage;FrameData[1]=(DWORD)BgiDraw::Image+0x1234;FrameData[11]=0x112233;Node[4]=100;Node[5]=200;
 BgiDraw::Site.node=3;BgiDraw::Site.ch=0x30;BgiDraw::Site.prev=0xa0;BgiDraw::Site.color=0x2c;
 const unsigned char *code=(const unsigned char *)&Layout;int sites=0;for(int i=0;i<400;i++)if(code[i]==0xe8&&(uintptr_t)(code+i+5+*(const int *)(code+i+1))==(uintptr_t)&Advance){BgiDraw::LinkAt=(uintptr_t)(code+i);sites++;}BgiDraw::FreeAt=(uintptr_t)&Free;
 Check(sites==1,"fixture locates actual unique call instruction, not a function-entry ABI");Layout();Check(Abi()&&AdvanceCalls==1&&Logs.empty(),"unhooked call preserves the actual one-word caller-cleaned contract");Check(MH_Initialize()==MH_OK,"real MinHook initialized");
 Control(L"\xfeff#cfg roles=0\r\n");BgiDraw::RefreshControl();Check(!BgiDraw::Installed&&!BgiDraw::Observing,"roles0 installs no hook");
 Permit();Check(BgiDraw::Installed&&BgiDraw::Observing&&BgiDraw::LinkOriginal&&BgiDraw::FreeOriginal,"real link/free detours install after trusted BOM permission");Logs.clear();int before=AdvanceCalls;Layout();Check(Abi()&&AdvanceCalls==before+1&&BgiDraw::RowChars==1,"installed actual call-site gate preserves arguments, GPR/flags/ESP/XMM/x87 and original return");FreeCall(Node);Check(FreeCalls==1&&GotHead==Node,"original free receives its exact head pointer once");Check(Logs.size()==2&&Logs[0].find("role=name")!=std::string::npos&&Logs[0].find("text=\xe3\x81\x82")!=std::string::npos,"authorized row and end preserve via-role contract");
 Logs.clear();Head=1;Layout();Check(BgiDraw::RowChars==1,"row waits pending until its normal boundary");Control(L"\xfeff#cfg roles=0\r\n");BgiDraw::RefreshControl();Check(!BgiDraw::Observing&&!BgiDraw::RowChars&&!BgiDraw::Open&&!BgiDraw::RoleCount,"roles0 atomically discards pending row and role map");before=AdvanceCalls;Layout();int freeBefore=FreeCalls;FreeCall(Node);Check(Logs.empty()&&Abi()&&AdvanceCalls==before+1&&FreeCalls==freeBefore+1,"revoked link/free calls remain original pass-through");
 Permit();Logs.clear();Head=0;GlyphCode=0x82a2;Layout();FreeCall(Node);Check(Logs.size()==2&&Logs[0].find("text=\xe3\x81\x84")!=std::string::npos&&Logs[0].find("text=\xe3\x81\x82")==std::string::npos,"resume starts a fresh row with no pre-revocation text");
 Logs.clear();Head=1;Layout();ThrowLog=true;before=AdvanceCalls;Layout();ThrowLog=false;Check(AdvanceCalls==before+1&&Abi()&&LockReleased(),"C++ logger exception releases lock and still executes the original link");Logs.clear();Layout();ThrowLog=true;freeBefore=FreeCalls;FreeCall(Node);ThrowLog=false;Check(FreeCalls==freeBefore+1&&GotHead==Node&&LockReleased(),"C++ logger exception cannot suppress original free");
 Layout();FaultLog=true;before=AdvanceCalls;Layout();FaultLog=false;Check(AdvanceCalls==before+1&&Abi()&&LockReleased(),"logger SEH fault leaves link pass-through and lock recoverable");
 Logs.clear();Layout();LogTap=&RevokeInLog;before=AdvanceCalls;Layout();LogTap=nullptr;Check(!BgiDraw::Observing&&!BgiDraw::Open&&!BgiDraw::RowChars&&!BgiDraw::RoleCount&&AdvanceCalls==before+1&&Abi(),"reentrant revoke during a flush cannot recreate pending text after off");Permit();Logs.clear();GlyphCode=0x82a4;Layout();FreeCall(Node);Check(Logs.size()==2&&Logs[0].find("text=\xe3\x81\x86")!=std::string::npos,"resume after in-flight revoke has only new text");
 Logs.clear();Layout();LogTap=&RevokeAndResumeInLog;Layout();LogTap=nullptr;Check(BgiDraw::Observing&&!BgiDraw::Open&&!BgiDraw::RowChars&&!BgiDraw::RoleCount&&Abi(),"off-on within one logger call invalidates the old permission epoch");Permit();
 DWORD regs[8]={};regs[4]=1;regs[2]=(DWORD)FrameData;BgiDraw::OnLink(regs,(const unsigned char *)1);Check(LockReleased()&&!BgiDraw::RowChars,"bad game observation clears partial state and releases lock");
 Logs.clear();Layout();HANDLE stop=CreateEventW(nullptr,TRUE,FALSE,nullptr);HANDLE watcher=CreateThread(nullptr,0,BgiDraw::Watch,stop,0,nullptr);Control(L"\xfeff#cfg roles=0\r\n");Check(watcher&&WaitObserving(0)&&!BgiDraw::RoleCount&&!BgiDraw::RowChars,"continuous product watcher notices off after installation");Layout();FreeCall(Node);Check(Logs.empty(),"watcher-revoked callbacks emit no later records");Control(L"\xfeff#cfg roles=1\r\n#role 1234=name\r\n");Check(WaitObserving(1),"same watcher resumes without rebuilding hooks");
 HANDLE locked=CreateFileW(ControlFile().c_str(),GENERIC_READ,0,nullptr,OPEN_EXISTING,0,nullptr);Check(locked!=INVALID_HANDLE_VALUE&&WaitObserving(0)&&!BgiDraw::RoleCount,"read failure revokes through real watcher");if(locked!=INVALID_HANDLE_VALUE)CloseHandle(locked);Check(WaitObserving(1),"watcher recovers after readable permission returns");
 SetEvent(stop);Check(WaitForSingleObject(watcher,4000)==WAIT_OBJECT_0,"test watcher stops before detour cleanup");CloseHandle(watcher);CloseHandle(stop);Control(L"\xfeff#cfg roles=0\r\n");BgiDraw::RefreshControl();MH_DisableHook((void *)BgiDraw::LinkAt);MH_DisableHook((void *)BgiDraw::FreeAt);MH_RemoveHook((void *)BgiDraw::LinkAt);MH_RemoveHook((void *)BgiDraw::FreeAt);MH_Uninitialize();
 printf("BGI actual call/free gate: %d checks, %d failures\n",Checks,Failures);return Failures;
}
