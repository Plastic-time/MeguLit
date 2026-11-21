// SPDX-License-Identifier: GPL-3.0-or-later
// Real MinHook, ECX this + one callee-cleaned word. No game or GDI renderer is started.
#include <windows.h>
#include <cstdio>
#include <cstdarg>
#include <string>
#include <vector>
#include <stdexcept>
static std::vector<std::string> Logs;static bool ThrowLog=false,FaultLog=false;static void (*LogTap)()=nullptr;static const char *TapContains=nullptr;
static HANDLE Entered=nullptr,Release=nullptr;static int FxFault=0;static volatile LONG FxInjected=0;static const DWORD LoggerMxcsr=0x5f80;
#ifndef _WIN64
static __declspec(align(16)) unsigned char FaultFx[512];
#endif
namespace Msg{static void Log(const char *format,...){
#ifndef _WIN64
 if(FxFault){InterlockedIncrement(&FxInjected);__asm{pxor xmm0,xmm0}__asm{pxor xmm7,xmm7}__asm{fninit}__asm{ldmxcsr LoggerMxcsr}__asm{fxsave FaultFx}
  if(FxFault==1)throw std::runtime_error("FX then C++ fault");RaiseException(EXCEPTION_ACCESS_VIOLATION,0,0,nullptr);}
#endif
 if(FaultLog)RaiseException(EXCEPTION_ACCESS_VIOLATION,0,0,nullptr);if(ThrowLog)throw std::runtime_error("fixture logger failure");char b[1200];va_list args;va_start(args,format);vsnprintf(b,sizeof b,format,args);va_end(args);
 if(Entered){SetEvent(Entered);if(WaitForSingleObject(Release,3000)!=WAIT_OBJECT_0)throw std::runtime_error("held logger timeout");}Logs.push_back(b);if(LogTap&&(!TapContains||std::strstr(b,TapContains)))LogTap();
#ifndef _WIN64
 __asm{
  push eax
  mov eax,0xdeadbeef
  mov ecx,0xfedcba98
  mov edx,0x87654321
  pxor xmm0,xmm0
  pxor xmm7,xmm7
  fninit
  ldmxcsr LoggerMxcsr
  stc
  pop eax
 }
#endif
}}
#ifndef _WIN64
#include "MinHook.h"
static int CreateCalls=0,EnableCalls=0,FailEnableAt=0;
static MH_STATUS TestCreateHook(LPVOID target,LPVOID detour,LPVOID *original){CreateCalls++;return MH_CreateHook(target,detour,original);}
static MH_STATUS TestEnableHook(LPVOID target){EnableCalls++;MH_STATUS result=MH_EnableHook(target);return FailEnableAt&&EnableCalls==FailEnableAt&&result==MH_OK?MH_ERROR_MEMORY_PROTECT:result;}
#define MH_CreateHook TestCreateHook
#define MH_EnableHook TestEnableHook
#endif
#ifndef FVP_HEADER
#define FVP_HEADER "../FvpDraw.h"
#endif
#if !defined(FVP_LEGACY_PERMISSION) && !defined(FVP_PERMISSION_FIXED)
#define FVP_PERMISSION_FIXED
#endif
#include FVP_HEADER
#ifndef _WIN64
#undef MH_CreateHook
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
static bool IsObserving(){
#ifdef FVP_PERMISSION_FIXED
 return (FvpDraw::Ticket()&1)!=0;
#else
 return FvpDraw::Observing!=0;
#endif
}
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
static void ControlRaw(const char *value,DWORD bytes){auto f=ControlPath();HANDLE h=INVALID_HANDLE_VALUE;DWORD error=0;for(int i=0;i<100;i++){h=CreateFileW(f.c_str(),GENERIC_WRITE,0,nullptr,CREATE_ALWAYS,0,nullptr);if(h!=INVALID_HANDLE_VALUE)break;error=GetLastError();if(error!=ERROR_SHARING_VIOLATION)break;Sleep(1);}DWORD written=0;BOOL ok=h!=INVALID_HANDLE_VALUE&&WriteFile(h,value,bytes,&written,nullptr);if(h!=INVALID_HANDLE_VALUE)CloseHandle(h);if(!ok||written!=bytes){printf("fixture control write failed error=%lu bytes=%lu/%lu\n",error,written,bytes);exit(90);}}
static void Control(const wchar_t *value){ControlRaw((const char *)value,(DWORD)(wcslen(value)*2));}

static void Revoke(){LogTap=nullptr;Control(L"#cfg roles=0 embed=0 fvpInput=0\r\n");FvpDraw::RefreshControl();RevokedInFlight=!IsObserving();}
static void RevokeResume(){Revoke();Control(L"#cfg roles=0 embed=0 fvpInput=1\r\n");FvpDraw::RefreshControl();}
static bool WaitPermission(bool on){DWORD begin=GetTickCount();do{if(IsObserving()==on)return true;Sleep(10);}while(GetTickCount()-begin<3500);return false;}
static DWORD WINAPI HeldCall(void *){CallFixture();return 0;}
static DWORD WINAPI RefreshThread(void *){FvpDraw::RefreshControl();return 0;}
static void RefreshFaultCpp(){try{FvpDraw::RefreshControl();}catch(...){}}
static void RefreshFaultSafe(){__try{RefreshFaultCpp();}__except(EXCEPTION_EXECUTE_HANDLER){}}
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
 Logs.clear();RevokedInFlight=false;LogTap=&Revoke;CallFixture();LogTap=nullptr;Check(RevokedInFlight&&!IsObserving()&&Logs.size()==1&&HexText().empty()&&AbiOkay(),"off in begin stops old data/end continuation; entered logger is not a close acknowledgement");
 Logs.clear();CallFixture();Check(Logs.empty()&&AbiOkay(),"next call after off is pass-through only");
 for(const char *phase:{" begin "," data "}){
  RevokeResume();std::string chunked(512,'q');Args[0]=(DWORD)chunked.c_str();Logs.clear();TapContains=phase;LogTap=&RevokeResume;CallFixture();LogTap=nullptr;TapContains=nullptr;
  bool atBegin=std::strcmp(phase," begin ")==0;
  Check(IsObserving()&&AbiOkay()&&Logs.size()==(atBegin?1:2)&&HexText().size()==(atBegin?0:FvpDraw::ChunkBytes*2)&&Logs.back().find(" end ")==std::string::npos,"off-on during begin/data invalidates old snapshot before remaining data/end");
  Logs.clear();CallFixture();Check(AbiOkay()&&HexText()==Hex(chunked.data(),chunked.size())&&Logs.back().find(" end ")!=std::string::npos,"fresh complete append after off-on uses new permission generation");
 }
 Args[0]=(DWORD)text;
 for(int fault:{1,2}){Logs.clear();LONG injected=FxInjected;FxFault=fault;CallFixture();FxFault=0;unsigned char zero[16]={};
  Check(FxInjected==injected+1&&!std::memcmp(FaultFx+160,zero,16)&&!std::memcmp(FaultFx+272,zero,16)&&*(DWORD *)(FaultFx+24)==LoggerMxcsr&&*(WORD *)FaultFx==0x37f&&AbiOkay()&&!FvpDraw::InObserver,"logger FX clobber before actual C++/SEH fault restores ABI and recursion guard");
  Logs.clear();CallFixture();Check(AbiOkay()&&HexText()==Hex(text,4),"fresh call remains observable after combined FX and exception");
 }

 Control(L"#cfg roles=0 embed=0 fvpInput=0\r\n");FvpDraw::RefreshControl();Logs.clear();CallFixture();Check(!IsObserving()&&Logs.empty()&&AbiOkay(),"removing diagnostic permission leaves original pass-through");
 Control(L"#cfg roles=0 embed=0 fvpInput=1\r\n");FvpDraw::RefreshControl();Logs.clear();CallFixture();Check(IsObserving()&&HexText()==Hex(text,4)&&AbiOkay(),"same detour resume diagnostics after permission returns");
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
 FvpDraw::RefreshControl();Check(!FvpDraw::Installed&&!IsObserving(),"address cannot bypass identity pin");
 // Fixture-only substitution: runtime sets these only after exact file pin and one unique expected RVA.
 FvpDraw::VersionPinned=true;FvpDraw::RefreshControl();Check(!FvpDraw::Installed,"missing selected build fails closed");FvpDraw::BuildIndex=0;
 auto saved=FvpDraw::DrawAt;FvpDraw::DrawAt=1;FvpDraw::RefreshControl();Check(!FvpDraw::Installed&&!IsObserving()&&!FvpDraw::Original,"hook creation error remains pass-through");FvpDraw::DrawAt=saved;
 Check(FvpDraw::Blocked,"hook creation error blocks uncertain retry");int creates=CreateCalls;FvpDraw::RefreshControl();Check(CreateCalls==creates&&!FvpDraw::Installed&&!IsObserving(),"polling does not retry after create failure even with a restored address");
 // Explicit fixture reset only; production keeps failed installation blocked until process exit.
 if(FvpDraw::Original){MH_DisableHook((void *)&Draw0);MH_RemoveHook((void *)&Draw0);FvpDraw::Original=nullptr;FvpDraw::Installed=0;}FvpDraw::Blocked=0;EnableCalls=0;

 FailEnableAt=1;FvpDraw::RefreshControl();Check(FvpDraw::Blocked&&!FvpDraw::Installed&&!IsObserving()&&FvpDraw::Original,"enable error retains safe trampoline and blocks retry");
 Fn=(void *)&FvpDraw::Gate;Logs.clear();CallFixture();Check(Logs.empty()&&AbiOkay(),"partly enabled failure retains a callable original trampoline behind the real gate");Fn=(void *)&Draw0;
 Logs.clear();CallFixture();Check(Logs.empty()&&AbiOkay(),"enable failure never observes or damages original");FailEnableAt=0;FvpDraw::RefreshControl();Check(!IsObserving()&&!FvpDraw::Installed,"polling cannot retry an uncertain enable");
 // Explicit single-thread test teardown; production retains the trampoline until process exit.
 Check(MH_RemoveHook((void *)&Draw0)==MH_OK,"fixture removes disabled hook");FvpDraw::Original=nullptr;FvpDraw::Blocked=0;
 Logs.clear();LogTap=&Revoke;FvpDraw::RefreshControl();LogTap=nullptr;Check(FvpDraw::Installed&&!IsObserving(),"install status logger revocation cannot be overwritten by an outer stale grant");
 Control(L"#cfg fvpInput=1\r\n");FvpDraw::RefreshControl();Check(FvpDraw::Installed&&IsObserving()&&FvpDraw::Original,"real detour activates diagnostic only");
 Exercise(0);Exercise(1);
 std::string heldText(512,'h');Args[0]=(DWORD)heldText.c_str();Logs.clear();Entered=CreateEventW(nullptr,TRUE,FALSE,nullptr);Release=CreateEventW(nullptr,TRUE,FALSE,nullptr);HANDLE call=CreateThread(nullptr,0,HeldCall,nullptr,0,nullptr);
 bool entered=WaitForSingleObject(Entered,3000)==WAIT_OBJECT_0;RevokeResume();SetEvent(Release);bool joined=call&&WaitForSingleObject(call,3000)==WAIT_OBJECT_0;Check(entered&&joined&&Logs.size()==1&&HexText().empty()&&AbiOkay(),"cross-thread off-on stops old snapshot after already-entered begin logger");if(!joined)return Failures;CloseHandle(call);CloseHandle(Entered);CloseHandle(Release);Entered=Release=nullptr;
 Logs.clear();CallFixture();Check(AbiOkay()&&HexText()==Hex(heldText.data(),heldText.size()),"fresh call after held logger uses current epoch");
 HANDLE stop=CreateEventW(nullptr,TRUE,FALSE,nullptr),watcher=CreateThread(nullptr,0,FvpDraw::Watch,stop,0,nullptr);Control(L"#cfg fvpInput=0\r\n");Check(watcher&&WaitPermission(false),"continuous real watcher revokes installed diagnostic");Logs.clear();CallFixture();Check(Logs.empty()&&AbiOkay(),"watcher-revoked call only forwards original");Control(L"#cfg fvpInput=1\r\n");Check(WaitPermission(true),"same watcher resumes existing detour");Logs.clear();CallFixture();Check(AbiOkay()&&HexText()==Hex(heldText.data(),heldText.size()),"watcher accepts new-generation input");
 SetEvent(stop);bool stopped=watcher&&WaitForSingleObject(watcher,3500)==WAIT_OBJECT_0;Check(stopped&&!IsObserving(),"owned watcher stop revokes observation before joining");if(!stopped)return Failures;CloseHandle(watcher);CloseHandle(stop);

 Control(L"#cfg roles=0 embed=0 fvpInput=0\r\n");FvpDraw::RefreshControl();Logs.clear();CallFixture();Check(Logs.empty()&&AbiOkay(),"closed permission remains pass-through");
 Check(MH_DisableHook((void *)&Draw0)==MH_OK,"real detour disables cleanly");MH_RemoveHook((void *)&Draw0);FvpDraw::Installed=0;FvpDraw::Original=nullptr;
 for(int fault:{1,2}){
  Control(L"#cfg fvpInput=1\r\n");ThrowLog=fault==1;FaultLog=fault==2;RefreshFaultSafe();ThrowLog=FaultLog=false;
  Check(FvpDraw::Installed&&!IsObserving()&&FvpDraw::Original,"install logger C++/SEH failure leaves observation closed with original retained");
  Control(L"#cfg fvpInput=0\r\n");HANDLE thread=CreateThread(nullptr,0,RefreshThread,nullptr,0,nullptr);bool joined=thread&&WaitForSingleObject(thread,3000)==WAIT_OBJECT_0;Check(joined&&!IsObserving(),"install logger fault releases control lock for another real thread");if(!joined)return Failures;CloseHandle(thread);
  Fn=(void *)&FvpDraw::Gate;Logs.clear();CallFixture();Check(Logs.empty()&&AbiOkay(),"install logger fault leaves original ret4 gate callable without observation");Fn=(void *)&Draw0;
  MH_DisableHook((void *)&Draw0);MH_RemoveHook((void *)&Draw0);FvpDraw::Installed=0;FvpDraw::Original=nullptr;
 }
 MH_Uninitialize();
 printf("FVP actual ABI append gate: %d checks, %d failures\n",Checks,Failures);return Failures;
}
#endif
