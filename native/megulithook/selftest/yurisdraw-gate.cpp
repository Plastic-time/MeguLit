// SPDX-License-Identifier: GPL-3.0-or-later
// Real MinHook at a CALL instruction: EAX text, live caller stack x/y, opaque blitter return.
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
#ifndef YURIS_HEADER
#define YURIS_HEADER "../YurisDraw.h"
#endif
#include YURIS_HEADER
#include "yurisdraw-snippets.h"
static int Failures=0,Checks=0,Calls=0;
static unsigned char Text[]={0x82,0xa0,0x82,0xa2,0},Other[]={0x82,0xa4,0};
static const unsigned char *Input=Text;
static DWORD CoordX=100,CoordY=200,GotX,GotY,GotEax,GotFlags,GotEcx,GotEdx,GotEbx,GotEbp,GotEsi,GotEdi;
static DWORD AfterEax,AfterFlags,AfterEcx,AfterEdx,AfterEbx,AfterEbp,AfterEsi,AfterEdi,BeforeEsp,AfterEsp;
static __declspec(align(16)) unsigned char SavedFx[512];
static __declspec(align(16)) DWORD XmmPattern[4]={0x12345678,0xabcdef01,0x99887766,0x11223344},AfterXmm[4],AfterXmm7[4];static double AfterX87;
static DWORD Mxcsr=0x3f80,AfterMxcsr;static WORD ControlWord=0x0b7f,AfterControlWord;
static const DWORD StatusMask=0xcd5,StatusBits=0xc45,Result=0x13572468;
static void Check(bool ok,const char *s){Checks++;printf("%s %s\n",ok?"PASS":"FAIL",s);if(!ok)Failures++;}
static __declspec(naked) void Blitter(){__asm{
 pushfd
 pushad
 mov edx,esp
 mov eax,[edx+28]
 mov GotEax,eax
 mov eax,[edx+32]
 mov GotFlags,eax
 mov eax,[edx+80]
 mov GotX,eax
 mov eax,[edx+84]
 mov GotY,eax
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
 inc Calls
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
 sub esp,0x80
 mov eax,CoordX
 mov [esp+0x28],eax
 mov eax,CoordY
 mov [esp+0x2c],eax
 mov BeforeEsp,esp
 fninit
 fld1
 fldcw ControlWord
 ldmxcsr Mxcsr
 movdqu xmm0,XmmPattern
 movdqu xmm7,XmmPattern
 pushfd
 pop eax
 and eax,0xfffff32a
 or eax,0xc45
 push eax
 popfd
 mov eax,Input
 mov ecx,0x11112222
 mov edx,0x33334444
 mov ebx,0x55556666
 mov ebp,0x77778888
 mov esi,0x73737373
 mov edi,0x93939393
 call Blitter
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
 movdqu AfterXmm7,xmm7
 stmxcsr AfterMxcsr
 fnstcw AfterControlWord
 fstp AfterX87
 fxrstor SavedFx
 add esp,0x80
 pop edi
 pop esi
 pop ebx
 pop ebp
 ret
}}
static bool Abi(){return GotEax==(DWORD)Input&&GotX==CoordX&&GotY==CoordY&&AfterEax==Result&&GotEcx==0x11112222&&AfterEcx==GotEcx&&GotEdx==0x33334444&&AfterEdx==GotEdx&&GotEbx==0x55556666&&AfterEbx==GotEbx&&GotEbp==0x77778888&&AfterEbp==GotEbp&&GotEsi==0x73737373&&AfterEsi==GotEsi&&GotEdi==0x93939393&&AfterEdi==GotEdi&&(GotFlags&StatusMask)==StatusBits&&(AfterFlags&StatusMask)==StatusBits&&BeforeEsp==AfterEsp&&!memcmp(XmmPattern,AfterXmm,sizeof XmmPattern)&&!memcmp(XmmPattern,AfterXmm7,sizeof XmmPattern)&&AfterX87==1.0&&AfterMxcsr==Mxcsr&&AfterControlWord==ControlWord;}
static std::wstring ControlFile(){wchar_t tmp[MAX_PATH],file[MAX_PATH+64];GetTempPathW(MAX_PATH,tmp);std::wstring dir=std::wstring(tmp)+L"MeguLit";CreateDirectoryW(dir.c_str(),nullptr);dir+=L"\\draw";CreateDirectoryW(dir.c_str(),nullptr);swprintf_s(file,L"%s\\%lu.txt",dir.c_str(),GetCurrentProcessId());return file;}
static void Control(const wchar_t *s){HANDLE h=CreateFileW(ControlFile().c_str(),GENERIC_WRITE,0,nullptr,CREATE_ALWAYS,0,nullptr);DWORD written;WriteFile(h,s,(DWORD)(wcslen(s)*2),&written,nullptr);CloseHandle(h);}
static void Refresh(){
#ifdef YURIS_PERMISSION_FIXED
 YurisDraw::RefreshControl();
#else
 if(YurisDraw::RolesAsked())YurisDraw::Install();
#endif
}
static void Permit(){Control(L"\xfeff#cfg roles=1 embed=0 zh=1\r\n");Refresh();}
#ifdef YURIS_PERMISSION_FIXED
static bool WaitObserving(LONG n){for(int i=0;i<400;i++){EnterCriticalSection(&YurisDraw::Lock);bool same=YurisDraw::Observing==n;LeaveCriticalSection(&YurisDraw::Lock);if(same)return true;Sleep(10);}return false;}
static void RevokeInLog(){LogTap=nullptr;Control(L"\xfeff#cfg roles=0\r\n");Refresh();}
static void RevokeAndResumeInLog(){RevokeInLog();Permit();}
static DWORD WINAPI ReadOnThread(void *){YurisDraw::RolesAsked();return 0;}
static bool LockReleased(){HANDLE t=CreateThread(nullptr,0,ReadOnThread,nullptr,0,nullptr);bool done=t&&WaitForSingleObject(t,1000)==WAIT_OBJECT_0;if(t)CloseHandle(t);return done;}
#endif
int main(){
 setvbuf(stdout,nullptr,_IONBF,0);
#ifdef YURIS_PERMISSION_FIXED
 InitializeCriticalSection(&YurisDraw::Lock);
#endif
 // Recover slots from the real euphoria HD byte fixture independently of the fake caller.
 std::vector<unsigned char> bytes;const char *hex=YurisSnippets[0].hex;for(size_t i=0;hex[i]&&hex[i+1];i+=2){unsigned b;sscanf(hex+i,"%2x",&b);bytes.push_back((unsigned char)b);}bytes.resize(bytes.size()+32,0xcc);YurisDrawSig::Hit hit[2]={};int matches=YurisDrawSig::Find(bytes.data(),bytes.size(),hit,2);
 Check(matches==1&&hit[0].call==0xa0&&hit[0].x==0x28&&hit[0].y==0x2c,"real euphoria HD bytes independently recover CALL-site live x/y slots");
 YurisDraw::XSlot=hit[0].x;YurisDraw::YSlot=hit[0].y;
 const unsigned char *code=(const unsigned char *)&Layout;int sites=0;for(int i=0;i<400;i++)if(code[i]==0xe8&&(uintptr_t)(code+i+5+*(const int *)(code+i+1))==(uintptr_t)&Blitter){YurisDraw::CallAt=(uintptr_t)(code+i);sites++;}
 Check(sites==1,"fixture locates actual unique E8 call, not the blitter entry");Layout();Check(Abi()&&Calls==1&&Logs.empty(),"unhooked EAX/live-stack blitter call preserves its opaque return");Check(MH_Initialize()==MH_OK,"real MinHook initialized");
 Control(L"\xfeff#cfg roles=0\r\n");Refresh();Check(!YurisDraw::Installed,"roles0 installs no hook");Permit();Check(YurisDraw::Installed&&YurisDraw::Original,"trusted permission installs real call-site detour");Logs.clear();int before=Calls;Layout();Input=Text+2;CoordX=118;Layout();Input=Other;CoordX=100;Layout();Check(Abi()&&Calls==before+3,"observing actual call gate preserves EAX, live stack, GPR/flags/ESP/XMM/x87 and return under destructive logger");Check(Logs.size()==1&&Logs[0].find("n=2")!=std::string::npos&&Logs[0].find("size=18")!=std::string::npos&&Logs[0].find("text=\xe3\x81\x82\xe3\x81\x84")!=std::string::npos,"contiguous CP932 characters retain existing run/advance output");
 Logs.clear();Control(L"\xfeff#cfg roles=0\r\n");Refresh();Check(!YurisDraw::RunChars&&YurisDraw::RunText.empty()&&!YurisDraw::RunNext,"revocation discards pending run and pointer continuity");before=Calls;Input=Text;Layout();Input=Other;Layout();Check(Logs.empty()&&Abi()&&Calls==before+2,"installed revoked gate only passes through the original blitter");
#ifdef YURIS_PERMISSION_FIXED
 Permit();Logs.clear();Input=Text+2;Layout();Input=Other;Layout();Check(Logs.size()==1&&Logs[0].find("text=\xe3\x81\x84")!=std::string::npos&&Logs[0].find("\xe3\x81\x82")==std::string::npos,"resume starts fresh without pre-revocation characters");
 ThrowLog=true;before=Calls;Input=Text;Layout();ThrowLog=false;Check(Calls==before+1&&Abi()&&LockReleased()&&!YurisDraw::RunChars,"C++ logger exception clears partial run and releases lock without suppressing original");
 Input=Text;Layout();FaultLog=true;before=Calls;Input=Other;Layout();FaultLog=false;Check(Calls==before+1&&Abi()&&LockReleased()&&!YurisDraw::RunChars,"logger SEH fault releases lock and leaves original ABI intact");
 Input=(const unsigned char *)1;before=Calls;Layout();Check(Calls==before+1&&Abi()&&LockReleased()&&!YurisDraw::RunChars,"bad text pointer cannot suppress or corrupt the original blitter");Input=Text;YurisDraw::OnGlyph(Input,(const unsigned char *)1);Check(LockReleased()&&!YurisDraw::RunChars,"bad caller stack clears pending state and releases lock");
 Logs.clear();Input=Text;Layout();LogTap=&RevokeInLog;Input=Other;Layout();Check(!YurisDraw::Observing&&!YurisDraw::RunChars&&!YurisDraw::RunNext&&Abi(),"reentrant revoke during logged record cannot resurrect old pending input");Permit();Logs.clear();Input=Text;Layout();LogTap=&RevokeAndResumeInLog;Input=Other;Layout();Check(YurisDraw::Observing&&!YurisDraw::RunChars&&!YurisDraw::RunNext&&Abi(),"reentrant off-on invalidates the old observation epoch");
 Logs.clear();Input=Text+2;Layout();Input=Other;Layout();Check(Logs.size()==1&&Logs[0].find("text=\xe3\x81\x84")!=std::string::npos,"fresh callback after off-on carries only new text");
 Logs.clear();HANDLE stop=CreateEventW(nullptr,TRUE,FALSE,nullptr);HANDLE watcher=CreateThread(nullptr,0,YurisDraw::Watch,stop,0,nullptr);Control(L"\xfeff#cfg roles=0\r\n");Check(watcher&&WaitObserving(0)&&!YurisDraw::RunChars&&!YurisDraw::RunNext,"continuous production watcher revokes after hooks are installed");Input=Text;Layout();Input=Other;Layout();Check(Logs.empty()&&Abi(),"watcher-revoked callbacks produce no later records");Control(L"\xfeff#cfg roles=1\r\n");Check(WaitObserving(1),"same watcher resumes existing hooks");
 HANDLE locked=CreateFileW(ControlFile().c_str(),GENERIC_READ,0,nullptr,OPEN_EXISTING,0,nullptr);Check(locked!=INVALID_HANDLE_VALUE&&WaitObserving(0)&&!YurisDraw::RunChars,"real file read failure revokes installed observer");if(locked!=INVALID_HANDLE_VALUE)CloseHandle(locked);Check(WaitObserving(1),"watcher recovers when control becomes readable");
 Control(L"\xfeff#cfg roles=10\r\n");Check(WaitObserving(0),"malformed permission revokes already installed observer");Control(L"\xfeff#cfg roles=1\r\n");Check(WaitObserving(1),"valid permission returns after malformed control");
 wchar_t oldTmp[32768]={},missing[32768];DWORD n=GetEnvironmentVariableW(L"TMP",oldTmp,32768);swprintf_s(missing,L"H:\\MeguLit-Work\\tmp\\yuris-gate-missing-%lu\\",GetCurrentProcessId());SetEnvironmentVariableW(L"TMP",missing);Check(WaitObserving(0),"missing file revokes through continuous watcher");SetEnvironmentVariableW(L"TMP",n?oldTmp:nullptr);Check(WaitObserving(1),"watcher recovers after control path returns");
 SetEvent(stop);Check(WaitForSingleObject(watcher,4000)==WAIT_OBJECT_0,"test watcher joins before detour cleanup");CloseHandle(watcher);CloseHandle(stop);Control(L"\xfeff#cfg roles=0\r\n");Refresh();
#endif
 MH_DisableHook((void *)YurisDraw::CallAt);MH_RemoveHook((void *)YurisDraw::CallAt);MH_Uninitialize();
 printf("YU-RIS actual call gate: %d checks, %d failures\n",Checks,Failures);return Failures;
}
