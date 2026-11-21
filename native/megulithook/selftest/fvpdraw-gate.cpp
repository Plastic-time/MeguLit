// SPDX-License-Identifier: GPL-3.0-or-later
// Real MinHook, ECX this + one callee-cleaned word. No game or GDI renderer is started.
#include <windows.h>
#include <cstdio>
#include <cstdarg>
#include <string>
#include <vector>
#include <stdexcept>
static std::vector<std::string> Logs;static bool ThrowLog=false,FaultLog=false;static void (*LogTap)()=nullptr;
namespace Msg{static void Log(const char *format,...){if(FaultLog)RaiseException(EXCEPTION_ACCESS_VIOLATION,0,0,nullptr);if(ThrowLog)throw std::runtime_error("fixture logger failure");char b[1200];va_list args;va_start(args,format);vsnprintf(b,sizeof b,format,args);va_end(args);Logs.push_back(b);if(LogTap)LogTap();
#ifndef _WIN64
 __asm{
  push eax
  mov eax,0xdeadbeef
  mov ecx,0xfedcba98
  mov edx,0x87654321
  pxor xmm0,xmm0
  pxor xmm7,xmm7
  fninit
  stc
  pop eax
 }
#endif
}}
#ifndef _WIN64
#include "MinHook.h"
static int EnableCalls=0,FailEnableAt=0;
static MH_STATUS TestEnableHook(LPVOID target){EnableCalls++;return FailEnableAt&&EnableCalls==FailEnableAt?MH_ERROR_MEMORY_PROTECT:MH_EnableHook(target);}
#define MH_EnableHook TestEnableHook
#endif
#include "../FvpDraw.h"
#ifndef _WIN64
#undef MH_EnableHook
#endif
#ifdef _WIN64
int main(){FvpDraw::Arm();puts("PASS FVP x64 remains unhooked");return 0;}
#else
static int Failures=0,Checks=0,Calls=0;
static DWORD Args[1],Got[1],GotEax,GotFlags,GotCaller,GotEcx,GotEdx,GotEbx,GotEbp,GotEsi,GotEdi;
static DWORD AfterEax,AfterEcx,AfterEdx,AfterEbx,AfterEbp,AfterEsi,AfterEdi,AfterFlags,BeforeEsp,BeforeCleanupEsp,AfterEsp;
static const DWORD StatusMask=0xcd5,StatusBits=0xc45,OriginalResult=0x13572468;
static __declspec(align(16)) unsigned char SavedFx[512];
static __declspec(align(16)) DWORD XmmPattern[4]={0x12345678,0xabcdef01,0x99887766,0x11223344},AfterXmm[4],AfterXmm7[4];
static const WORD FixtureCw=0x0b7f;static WORD AfterCw;static const DWORD FixtureMxcsr=0x3f80;static DWORD AfterMxcsr;
static double AfterX87;static DWORD GotEntry=0;
static bool RevokedInFlight=false;
static bool NestedSkipped=true;static int NestedCalls=0;
static void InvokeNested();
static void Reenter(){auto saved=LogTap;LogTap=nullptr;size_t before=Logs.size();InvokeNested();NestedSkipped=NestedSkipped&&before==Logs.size();NestedCalls++;LogTap=saved;}
static void Check(bool ok,const char *why){Checks++;printf("%s %s\n",ok?"PASS":"FAIL",why);if(!ok)Failures++;}
static __declspec(naked) void Draw0(){__asm{
 pushfd
 pushad
 mov GotEntry,0
 mov edx,esp
 mov eax,[edx+28]
 mov GotEax,eax
 mov eax,[edx+32]
 mov GotFlags,eax
 mov eax,[edx+36]
 mov GotCaller,eax
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
 lea esi,[edx+40]
 mov edi,offset Got
 mov ecx,1
 cld
 rep movsd
 mov dword ptr [edx+40],0x7e
 inc Calls
 popad
 popfd
 mov eax,OriginalResult
 ret 4
}}
static void *Fn=(void *)&Draw0;
static void InvokeNested(){using F=DWORD(__thiscall *)(void *,const char *);int before=Calls;DWORD result=((F)Fn)((void *)0x11112222,"nested");NestedSkipped=NestedSkipped&&Calls==before+1&&result==OriginalResult;}
static __declspec(naked) void CallFixture(){__asm{
 push ebp
 push ebx
 push esi
 push edi
 mov BeforeEsp,esp
 fxsave SavedFx
 fninit
 fldcw FixtureCw
 ldmxcsr FixtureMxcsr
 fld1
 movdqu xmm0,XmmPattern
 movdqu xmm7,XmmPattern
 push dword ptr [Args]
 pushfd
 pop eax
 and eax,0xfffff32a
 or eax,0xc45
 push eax
 popfd
 mov eax,0x24682468
 mov ecx,0x11112222
 mov edx,0x33334444
 mov ebx,0x51515151
 mov ebp,0x45454545
 mov esi,0x73737373
 mov edi,0x93939393
 call dword ptr [Fn]
 pushfd
 pop AfterFlags
 mov AfterEax,eax
 mov AfterEcx,ecx
 mov AfterEdx,edx
 mov AfterEbx,ebx
 mov AfterEbp,ebp
 mov AfterEsi,esi
 mov AfterEdi,edi
 mov BeforeCleanupEsp,esp
 cld
 movdqu AfterXmm,xmm0
 movdqu AfterXmm7,xmm7
 fnstcw AfterCw
 stmxcsr AfterMxcsr
 fstp AfterX87
 fxrstor SavedFx
 mov AfterEsp,esp
 pop edi
 pop esi
 pop ebx
 pop ebp
 ret
}}
static std::wstring ControlPath(){wchar_t tmp[MAX_PATH],file[MAX_PATH+64];GetTempPathW(MAX_PATH,tmp);std::wstring dir=std::wstring(tmp)+L"MeguLit";CreateDirectoryW(dir.c_str(),nullptr);dir+=L"\\draw";CreateDirectoryW(dir.c_str(),nullptr);swprintf_s(file,L"%s\\%lu.txt",dir.c_str(),GetCurrentProcessId());return file;}
static void Control(const wchar_t *value){auto f=ControlPath();HANDLE h=CreateFileW(f.c_str(),GENERIC_WRITE,0,nullptr,CREATE_ALWAYS,0,nullptr);DWORD written;WriteFile(h,value,(DWORD)(wcslen(value)*2),&written,nullptr);CloseHandle(h);}
static void ControlRaw(const char *value,DWORD bytes){auto f=ControlPath();HANDLE h=CreateFileW(f.c_str(),GENERIC_WRITE,0,nullptr,CREATE_ALWAYS,0,nullptr);DWORD written;WriteFile(h,value,bytes,&written,nullptr);CloseHandle(h);}
static void Revoke(){LogTap=nullptr;Control(L"#cfg roles=0 embed=0 fvpInput=0\r\n");FvpDraw::RefreshControl();RevokedInFlight=FvpDraw::Observing==0;}
static void ControlChecks(){
 const wchar_t *bad[]={L"prefix #cfg fvpInput=1\r\n",L"#cfg fvpInput=0\r\nbody #cfg fvpInput=1\r\n",L"body\r\n#cfg fvpInput=1\r\n",L"#cfg fvpInput=1",L"#cfg fvpInput=1\r",L"#cfg fvpInput=10\r\n",L"#cfg fvpInput=1 fvpInput=0\r\n",L"#cfg fvpInput=1 fvpInput=1\r\n",L"#cfg fvpInput=10 fvpInput=1\r\n",L"#cfg xfvpInput=1\r\n",L"#cfg fvpInput=1x\r\n",L"#cfg fvpInput=1\t\r\n",L"\x6323\x6766\x6620\x7076\x6e49\x7570\x3d74\x0a31"};
 for(auto value:bad){Control(value);Check(!FvpDraw::DiagnosticAsked(),"real UTF16 file rejects non-first/incomplete/duplicate/lookalike/non-ASCII authorization");}
 Control(L"\xfeff#cfg roles=0 embed=0 fvpInput=1\r\n");Check(FvpDraw::DiagnosticAsked(),"valid UTF16LE BOM first line grants diagnostic");
 const char ascii[]="#cfg roles=0 fvpInput=1\nbody fvpInput=0\n";ControlRaw(ascii,sizeof ascii-1);Check(!FvpDraw::DiagnosticAsked(),"raw ASCII cannot impersonate UTF16LE authorization");
 const char forged[]="#cfg fvpInput=0\n#cfg fvpInput=1\n";ControlRaw(forged,sizeof forged-1);Check(!FvpDraw::DiagnosticAsked(),"later ASCII body cannot grant permission");
 const unsigned char bigEndian[]={0xfe,0xff,0,'#',0,'c',0,'f',0,'g',0,' ',0,'f',0,'v',0,'p',0,'I',0,'n',0,'p',0,'u',0,'t',0,'=',0,'1',0,10};ControlRaw((const char *)bigEndian,sizeof bigEndian);Check(!FvpDraw::DiagnosticAsked(),"UTF16BE is never reinterpreted as ASCII authorization");
 std::wstring longLine=L"#cfg fvpInput=1 "+std::wstring(1024,L' ')+L"\r\n";Control(longLine.c_str());Check(!FvpDraw::DiagnosticAsked(),"bounded read cannot accept a truncated first line");
 Control(L"#cfg fvpInput=1\r\n");auto path=ControlPath();HANDLE locked=CreateFileW(path.c_str(),GENERIC_READ,0,nullptr,OPEN_EXISTING,0,nullptr);Check(locked!=INVALID_HANDLE_VALUE&&!FvpDraw::DiagnosticAsked(),"control file read failure revokes permission");if(locked!=INVALID_HANDLE_VALUE)CloseHandle(locked);
 wchar_t oldTmp[32768]={},missing[32768];DWORD n=GetEnvironmentVariableW(L"TMP",oldTmp,32768);swprintf_s(missing,L"H:\\MeguLit-Work\\tmp\\fvp-missing-%lu\\",GetCurrentProcessId());SetEnvironmentVariableW(L"TMP",missing);Check(!FvpDraw::DiagnosticAsked(),"missing control path is false");SetEnvironmentVariableW(L"TMP",n?oldTmp:nullptr);
 Control(L"#cfg roles=0 embed=0 fvpInput=1\r\n");
}
static std::string HexText(){std::string out;for(const auto &line:Logs){auto p=line.find(" hex=");if(p!=std::string::npos)out+=line.substr(p+5);}return out;}
static std::string Hex(const char *s,size_t size){const char digits[]="0123456789abcdef";std::string out;for(size_t i=0;i<size;i++){unsigned b=(unsigned char)s[i];out+=digits[b>>4];out+=digits[b&15];}return out;}
static bool AbiOkay(){return GotEax==0x24682468&&AfterEax==OriginalResult&&!std::memcmp(Got,Args,sizeof Args)&&GotEcx==AfterEcx&&AfterEcx==0x11112222&&GotEdx==AfterEdx&&AfterEdx==0x33334444&&GotEbx==AfterEbx&&AfterEbx==0x51515151&&GotEbp==AfterEbp&&AfterEbp==0x45454545&&GotEsi==AfterEsi&&AfterEsi==0x73737373&&GotEdi==AfterEdi&&AfterEdi==0x93939393&&(GotFlags&StatusMask)==StatusBits&&(AfterFlags&StatusMask)==StatusBits&&BeforeEsp==BeforeCleanupEsp&&BeforeEsp==AfterEsp&&!std::memcmp(XmmPattern,AfterXmm,sizeof XmmPattern)&&!std::memcmp(XmmPattern,AfterXmm7,sizeof XmmPattern)&&AfterX87==1.0&&AfterCw==FixtureCw&&AfterMxcsr==FixtureMxcsr;}
static void Exercise(unsigned entry){
 Fn=(void *)&Draw0;FvpDraw::BuildIndex=entry;const char *text="\x82\xa0\x82\xa2";Args[0]=(DWORD)text;Logs.clear();int before=Calls;CallFixture();
 Check(Calls==before+1&&GotEntry==0&&AbiOkay(),"actual ECX/one-word ret4 ABI preserves original return, GPRs, flags, ESP, XMM and x87");
 Check(HexText()==Hex(text,4),"entry byte snapshot survives original arg-slot overwrite");
 char meta[160];snprintf(meta,sizeof meta,"event=append build=%u entry=%lx via=%lx this=11112222 words=1 bytes=4 arg=%lx",entry,(unsigned long)FvpDrawSig::Builds[entry].rva,(unsigned long)(GotCaller-FvpDraw::Image),Args[0]);Check(!Logs.empty()&&Logs[0].find(meta)!=std::string::npos,"build, actual caller, ECX and original arg are append diagnostics");
 Logs.clear();CallFixture();Check(HexText()==Hex(text,4)&&AbiOkay(),"repeated append is observed, without claiming a cache repaint event");
 std::string longer(2048,'z');Args[0]=(DWORD)longer.c_str();Logs.clear();CallFixture();Check(HexText()==Hex(longer.data(),longer.size())&&AbiOkay(),"long input is complete across logger chunks");
 std::string exact(FvpDraw::MaxText,'y');Args[0]=(DWORD)exact.c_str();Logs.clear();CallFixture();Check(HexText()==Hex(exact.data(),exact.size())&&AbiOkay(),"exact byte limit requires a complete NUL terminator");
 Args[0]=(DWORD)"";Logs.clear();CallFixture();Check(Logs.size()==2&&HexText().empty()&&AbiOkay(),"empty input is complete without inventing text");
 Args[0]=0;Logs.clear();CallFixture();Check(Logs.empty()&&AbiOkay(),"null text never changes the original ABI");
 Args[0]=1;Logs.clear();CallFixture();Check(Logs.empty()&&AbiOkay(),"unreadable text never changes the original ABI");
 char *guard=(char *)VirtualAlloc(nullptr,8192,MEM_RESERVE|MEM_COMMIT,PAGE_READWRITE);DWORD oldProtect=0;bool protectedPage=guard&&VirtualProtect(guard+4096,4096,PAGE_NOACCESS,&oldProtect);if(protectedPage){guard[4094]='a';guard[4095]='b';Args[0]=(DWORD)(guard+4094);Logs.clear();CallFixture();}Check(protectedPage&&Logs.empty()&&AbiOkay(),"partly readable unterminated input emits no partial bytes and preserves ABI");if(guard)VirtualFree(guard,0,MEM_RELEASE);

 std::string tooLong(FvpDraw::MaxText+1,'x');Args[0]=(DWORD)tooLong.c_str();Logs.clear();CallFixture();Check(Logs.empty()&&AbiOkay(),"over-limit input is refused instead of truncated");
 Args[0]=(DWORD)text;ThrowLog=true;CallFixture();ThrowLog=false;Logs.clear();CallFixture();Check(HexText()==Hex(text,4)&&AbiOkay(),"logger exception clears recursion guard and preserves ABI");
 FaultLog=true;CallFixture();FaultLog=false;Logs.clear();CallFixture();Check(HexText()==Hex(text,4)&&AbiOkay(),"logger SEH fault clears recursion guard and preserves ABI");

 NestedSkipped=true;NestedCalls=0;Logs.clear();LogTap=&Reenter;CallFixture();LogTap=nullptr;Check(NestedCalls>0&&NestedSkipped&&HexText()==Hex(text,4)&&AbiOkay(),"recursive real detour suppresses diagnostics but executes its original");
 Logs.clear();RevokedInFlight=false;LogTap=&Revoke;CallFixture();LogTap=nullptr;Check(RevokedInFlight&&!FvpDraw::Observing&&HexText()==Hex(text,4)&&AbiOkay(),"off stops new observers but an already-entered snapshot may finish; not a close acknowledgement");
 Logs.clear();CallFixture();Check(Logs.empty()&&AbiOkay(),"next call after off is pass-through only");
 Control(L"#cfg roles=0 embed=0 fvpInput=0\r\n");FvpDraw::RefreshControl();Logs.clear();CallFixture();Check(!FvpDraw::Observing&&Logs.empty()&&AbiOkay(),"removing diagnostic permission leaves original pass-through");
 Control(L"#cfg roles=0 embed=0 fvpInput=1\r\n");FvpDraw::RefreshControl();Logs.clear();CallFixture();Check(FvpDraw::Observing&&HexText()==Hex(text,4)&&AbiOkay(),"same detour resume diagnostics after permission returns");
}
int wmain(int argc,wchar_t **argv){
 Args[0]=(DWORD)"baseline";Control(L"#cfg roles=0 embed=0 fvpInput=0\r\n");FvpDraw::Arm();Check(!FvpDraw::VersionPinned&&!FvpDraw::Installed,"unrecognized host remains unhooked");
 Check(FvpDraw::PinFileBuild(L"H:\\MeguLit-Work\tmp\\fvp-not-present.bin")==-1,"missing file never pins");wchar_t self[32768];GetModuleFileNameW(nullptr,self,32768);Check(FvpDraw::PinFileBuild(self)==-1,"wrong executable never pins");
 for(int i=0;i<2;i++)if(argc>i+1)Check(FvpDraw::PinFileBuild(argv[i+1])==i,"actual owned FVP build is SHA verified read-only");
 wchar_t tmp[MAX_PATH];GetTempPathW(MAX_PATH,tmp);std::wstring bad=std::wstring(tmp)+L"fvp-wrong-hash.bin";
 for(int i=0;i<2;i++){HANDLE h=CreateFileW(bad.c_str(),GENERIC_WRITE,0,nullptr,CREATE_ALWAYS,0,nullptr);char zeros[4096]={};DWORD written;unsigned left=FvpDrawSig::Builds[i].fileBytes;bool all=h!=INVALID_HANDLE_VALUE;while(all&&left){DWORD n=left>sizeof zeros?sizeof zeros:left;all=WriteFile(h,zeros,n,&written,nullptr)&&written==n;left-=n;}LARGE_INTEGER size;all=all&&GetFileSizeEx(h,&size)&&size.QuadPart==FvpDrawSig::Builds[i].fileBytes;if(h!=INVALID_HANDLE_VALUE)CloseHandle(h);Check(all&&FvpDraw::PinFileBuild(bad.c_str())==-1,"same-size wrong SHA is rejected");}
 Check(!FvpDraw::DiagnosticAsked(),"explicit diagnostic zero stays off");Control(L"#cfg roles=1 embed=1 advhdInput=1 cmvsInput=1\r\n");Check(!FvpDraw::DiagnosticAsked(),"other permissions cannot enable FVP");Control(L"#cfg roles=0 embed=0 fvpInput=10\r\n");Check(!FvpDraw::DiagnosticAsked(),"lookalike control value stays off");Control(L"#cfg roles=0 embed=0 fvpInput=1\r\n");Check(FvpDraw::DiagnosticAsked(),"FVP requires no invented role permission");
 CallFixture();Check(AbiOkay()&&Logs.empty(),"unhooked baseline consumes one word with ret4 and returns opaque EAX");
 ControlChecks();
 Check(MH_Initialize()==MH_OK,"real MinHook initialized");FvpDraw::Image=(uintptr_t)GetModuleHandleA(nullptr);auto nt=(IMAGE_NT_HEADERS *)(FvpDraw::Image+((IMAGE_DOS_HEADER *)FvpDraw::Image)->e_lfanew);FvpDraw::ImageEnd=FvpDraw::Image+nt->OptionalHeader.SizeOfImage;FvpDraw::DrawAt=(uintptr_t)&Draw0;
 FvpDraw::RefreshControl();Check(!FvpDraw::Installed&&!FvpDraw::Observing,"address cannot bypass identity pin");
 // Fixture-only substitution: runtime sets these only after exact file pin and one unique expected RVA.
 FvpDraw::VersionPinned=true;FvpDraw::RefreshControl();Check(!FvpDraw::Installed,"missing selected build fails closed");FvpDraw::BuildIndex=0;
 auto saved=FvpDraw::DrawAt;FvpDraw::DrawAt=1;FvpDraw::RefreshControl();Check(!FvpDraw::Installed&&!FvpDraw::Observing&&!FvpDraw::Original,"hook creation error remains pass-through");FvpDraw::DrawAt=saved;
 FailEnableAt=1;FvpDraw::RefreshControl();Check(FvpDraw::Blocked&&!FvpDraw::Installed&&!FvpDraw::Observing&&FvpDraw::Original,"enable error retains safe trampoline and blocks retry");
 Logs.clear();CallFixture();Check(Logs.empty()&&AbiOkay(),"enable failure never observes or damages original");FailEnableAt=0;FvpDraw::RefreshControl();Check(!FvpDraw::Observing&&!FvpDraw::Installed,"polling cannot retry an uncertain enable");
 // Explicit single-thread test teardown; production retains the trampoline until process exit.
 Check(MH_RemoveHook((void *)&Draw0)==MH_OK,"fixture removes disabled hook");FvpDraw::Original=nullptr;FvpDraw::Blocked=0;
 FvpDraw::RefreshControl();Check(FvpDraw::Installed&&FvpDraw::Observing&&FvpDraw::Original,"real detour activates diagnostic only");
 Exercise(0);Exercise(1);
 Control(L"#cfg roles=0 embed=0 fvpInput=0\r\n");FvpDraw::RefreshControl();Logs.clear();CallFixture();Check(Logs.empty()&&AbiOkay(),"closed permission remains pass-through");
 Check(MH_DisableHook((void *)&Draw0)==MH_OK,"real detour disables cleanly");MH_RemoveHook((void *)&Draw0);MH_Uninitialize();
 printf("FVP actual ABI append gate: %d checks, %d failures\n",Checks,Failures);return Failures;
}
#endif
