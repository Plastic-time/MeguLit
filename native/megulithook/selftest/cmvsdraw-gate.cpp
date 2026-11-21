// SPDX-License-Identifier: GPL-3.0-or-later
// Real MinHook, ECX this + two callee-cleaned words. No game or GDI renderer is started.
#include <windows.h>
#include <cstdio>
#include <cstdarg>
#include <string>
#include <vector>
#include <stdexcept>
static std::vector<std::string> Logs;static bool ThrowLog=false;static void (*LogTap)()=nullptr;
namespace Msg{static void Log(const char *format,...){if(ThrowLog)throw std::runtime_error("fixture logger failure");char b[1200];va_list args;va_start(args,format);vsnprintf(b,sizeof b,format,args);va_end(args);Logs.push_back(b);if(LogTap)LogTap();
#ifndef _WIN64
 __asm{
  pxor xmm0,xmm0
  fninit
 }
#endif
}}
#ifndef _WIN64
#include "MinHook.h"
static int EnableCalls=0,FailEnableAt=0;
static MH_STATUS TestEnableHook(LPVOID target){EnableCalls++;return FailEnableAt&&EnableCalls==FailEnableAt?MH_ERROR_MEMORY_PROTECT:MH_EnableHook(target);}
#define MH_EnableHook TestEnableHook
#endif
#include "../CmvsDraw.h"
#ifndef _WIN64
#undef MH_EnableHook
#endif
#ifdef _WIN64
int main(){CmvsDraw::Arm();puts("PASS CMVS x64 remains unhooked");return 0;}
#else
static int Failures=0,Checks=0,Calls=0;
static DWORD Args[2],Got[2],GotEax,GotFlags,GotCaller,GotEcx,GotEdx,GotEbx,GotEbp,GotEsi,GotEdi;
static DWORD AfterEax,AfterEcx,AfterEdx,AfterEbx,AfterEbp,AfterEsi,AfterEdi,AfterFlags,BeforeEsp,BeforeCleanupEsp,AfterEsp;
static const DWORD StatusMask=0xcd5,StatusBits=0xc45,OriginalResult=0x13572468;
static __declspec(align(16)) unsigned char SavedFx[512];
static __declspec(align(16)) DWORD XmmPattern[4]={0x12345678,0xabcdef01,0x99887766,0x11223344},AfterXmm[4];
static double AfterX87;static DWORD GotEntry=0;
static bool NestedSkipped=true;static int NestedCalls=0;
static void Reenter(){auto saved=LogTap;LogTap=nullptr;DWORD stack[3]={};stack[1]=(DWORD)"nested";size_t before=Logs.size();CmvsDraw::Observe(0,0x11112222,stack);NestedSkipped=NestedSkipped&&before==Logs.size();NestedCalls++;LogTap=saved;}
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
 mov ecx,2
 cld
 rep movsd
 inc Calls
 popad
 popfd
 mov eax,OriginalResult
 ret 8
}}
static __declspec(naked) void Draw1(){__asm{
 pushfd
 pushad
 mov GotEntry,1
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
 mov ecx,2
 cld
 rep movsd
 inc Calls
 popad
 popfd
 mov eax,OriginalResult
 ret 8
}}
static void *Fn=(void *)&Draw0;
static __declspec(naked) void CallFixture(){__asm{
 push ebp
 push ebx
 push esi
 push edi
 mov BeforeEsp,esp
 fxsave SavedFx
 fninit
 fld1
 movdqu xmm0,XmmPattern
 push dword ptr [Args+4]
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
static std::string HexText(){std::string out;for(const auto &line:Logs){auto p=line.find(" hex=");if(p!=std::string::npos)out+=line.substr(p+5);}return out;}
static std::string Hex(const char *s,size_t size){const char digits[]="0123456789abcdef";std::string out;for(size_t i=0;i<size;i++){unsigned b=(unsigned char)s[i];out+=digits[b>>4];out+=digits[b&15];}return out;}
static bool AbiOkay(){return GotEax==0x24682468&&AfterEax==OriginalResult&&!std::memcmp(Got,Args,sizeof Args)&&GotEcx==AfterEcx&&AfterEcx==0x11112222&&GotEdx==AfterEdx&&AfterEdx==0x33334444&&GotEbx==AfterEbx&&AfterEbx==0x51515151&&GotEbp==AfterEbp&&AfterEbp==0x45454545&&GotEsi==AfterEsi&&AfterEsi==0x73737373&&GotEdi==AfterEdi&&AfterEdi==0x93939393&&(GotFlags&StatusMask)==StatusBits&&(AfterFlags&StatusMask)==StatusBits&&BeforeEsp==BeforeCleanupEsp&&BeforeEsp==AfterEsp&&!std::memcmp(XmmPattern,AfterXmm,sizeof XmmPattern)&&AfterX87==1.0;}
static void Exercise(unsigned entry){
 Fn=entry?(void *)&Draw1:(void *)&Draw0;const char *text="\x82\xa0\x82\xa2";Args[0]=(DWORD)text;Args[1]=0xabcdef11;Logs.clear();int before=Calls;CallFixture();
 Check(Calls==before+1&&GotEntry==entry&&AbiOkay(),"actual ECX/two-word ret8 ABI preserves original return, GPRs, flags, ESP, XMM and x87");
 Check(HexText()==Hex(text,4),"complete input is observed even without any GDI cache miss");
 char meta[160];snprintf(meta,sizeof meta,"entry=%lx via=%lx this=11112222 words=2 bytes=4 args=%lx,%lx",(unsigned long)CmvsDrawSig::Entries[entry].rva,(unsigned long)(GotCaller-CmvsDraw::Image),Args[0],Args[1]);Check(!Logs.empty()&&Logs[0].find(meta)!=std::string::npos,"entry, actual caller, ECX and both original arguments are diagnostic metadata");
 Logs.clear();CallFixture();Check(HexText()==Hex(text,4)&&AbiOkay(),"cached repeated text is fully observed again at this input entry");
 std::string longer(2048,'z');Args[0]=(DWORD)longer.c_str();Logs.clear();CallFixture();Check(HexText()==Hex(longer.data(),longer.size())&&AbiOkay(),"long input is complete across logger chunks");
 std::string exact(CmvsDraw::MaxText,'y');Args[0]=(DWORD)exact.c_str();Logs.clear();CallFixture();Check(HexText()==Hex(exact.data(),exact.size())&&AbiOkay(),"exact byte limit requires a complete NUL terminator");
 Args[0]=(DWORD)"";Logs.clear();CallFixture();Check(Logs.size()==2&&HexText().empty()&&AbiOkay(),"empty input is complete without inventing text");
 Args[0]=0;Logs.clear();CallFixture();Check(Logs.empty()&&AbiOkay(),"null text never changes the original ABI");
 Args[0]=1;Logs.clear();CallFixture();Check(Logs.empty()&&AbiOkay(),"unreadable text never changes the original ABI");
 std::string tooLong(CmvsDraw::MaxText+1,'x');Args[0]=(DWORD)tooLong.c_str();Logs.clear();CallFixture();Check(Logs.empty()&&AbiOkay(),"over-limit input is refused instead of truncated");
 Args[0]=(DWORD)text;ThrowLog=true;CallFixture();ThrowLog=false;Logs.clear();CallFixture();Check(HexText()==Hex(text,4)&&AbiOkay(),"logger exception clears recursion guard and preserves ABI");
 NestedSkipped=true;NestedCalls=0;Logs.clear();LogTap=&Reenter;CallFixture();LogTap=nullptr;Check(NestedCalls>0&&NestedSkipped&&HexText()==Hex(text,4)&&AbiOkay(),"nested logger observation is suppressed without changing the original");
 Control(L"#cfg roles=0 embed=0 cmvsInput=0\r\n");CmvsDraw::RefreshControl();Logs.clear();CallFixture();Check(!CmvsDraw::Observing&&Logs.empty()&&AbiOkay(),"removing diagnostic permission leaves original pass-through");
 Control(L"#cfg roles=0 embed=0 cmvsInput=1\r\n");CmvsDraw::RefreshControl();Logs.clear();CallFixture();Check(CmvsDraw::Observing&&HexText()==Hex(text,4)&&AbiOkay(),"same paired detours resume diagnostics after permission returns");
}
int wmain(int argc,wchar_t **argv){
 Args[0]=(DWORD)"baseline";Args[1]=0xabcdef11;Control(L"#cfg roles=0 embed=0 cmvsInput=0\r\n");CmvsDraw::Arm();Check(!CmvsDraw::VersionPinned&&!CmvsDraw::Installed,"unrecognized host remains unhooked");
 Check(!CmvsDraw::VerifyFileBuild(L"H:\\MeguLit-Work\\tmp\\cmvs-not-present.bin"),"missing file never pins");wchar_t self[32768];GetModuleFileNameW(nullptr,self,32768);Check(!CmvsDraw::VerifyFileBuild(self),"wrong executable never pins");
 if(argc>1){Check(CmvsDraw::VerifyFileBuild(argv[1]),"actual owned CMVS executable is SHA verified read-only");wchar_t tmp[MAX_PATH];GetTempPathW(MAX_PATH,tmp);std::wstring bad=std::wstring(tmp)+L"cmvs-wrong-hash.bin";HANDLE h=CreateFileW(bad.c_str(),GENERIC_WRITE,0,nullptr,CREATE_ALWAYS,0,nullptr);char zeros[4096]={};DWORD written;unsigned left=CmvsDrawSig::FileBytes;bool all=h!=INVALID_HANDLE_VALUE;while(all&&left){DWORD n=left>sizeof zeros?sizeof zeros:left;all=WriteFile(h,zeros,n,&written,nullptr)&&written==n;left-=n;}LARGE_INTEGER size;all=all&&GetFileSizeEx(h,&size)&&size.QuadPart==CmvsDrawSig::FileBytes;if(h!=INVALID_HANDLE_VALUE)CloseHandle(h);Check(all&&!CmvsDraw::VerifyFileBuild(bad.c_str()),"same-size wrong SHA is rejected");}
 Check(!CmvsDraw::DiagnosticAsked(),"explicit diagnostic zero stays off");Control(L"#cfg roles=1 embed=1 advhdInput=1\r\n");Check(!CmvsDraw::DiagnosticAsked(),"other role/embed/diagnostic flags cannot enable CMVS");Control(L"#cfg roles=0 embed=0 cmvsInput=10\r\n");Check(!CmvsDraw::DiagnosticAsked(),"lookalike control value stays off");Control(L"#cfg roles=0 embed=0 cmvsInput=1\r\n");Check(CmvsDraw::DiagnosticAsked(),"CMVS diagnostics require no invented role permission");
 for(int i=0;i<2;i++){Fn=i?(void *)&Draw1:(void *)&Draw0;CallFixture();Check(GotEntry==i&&AbiOkay()&&Logs.empty(),"unhooked baseline really consumes two words with ret8");}
 Check(MH_Initialize()==MH_OK,"real MinHook initialized");CmvsDraw::Image=(uintptr_t)GetModuleHandleA(nullptr);auto nt=(IMAGE_NT_HEADERS *)(CmvsDraw::Image+((IMAGE_DOS_HEADER *)CmvsDraw::Image)->e_lfanew);CmvsDraw::ImageEnd=CmvsDraw::Image+nt->OptionalHeader.SizeOfImage;CmvsDraw::DrawAt[0]=(uintptr_t)&Draw0;CmvsDraw::DrawAt[1]=(uintptr_t)&Draw1;
 CmvsDraw::RefreshControl();Check(!CmvsDraw::Installed&&!CmvsDraw::Observing,"two addresses alone cannot bypass the file pin");
 // Fixture-only identity substitution; production sets this solely after exact SHA and BOTH unique expected RVAs.
 CmvsDraw::VersionPinned=true;
 for(int i=0;i<2;i++){auto saved=CmvsDraw::DrawAt[i];CmvsDraw::DrawAt[i]=0;CmvsDraw::RefreshControl();Check(!CmvsDraw::Installed&&!CmvsDraw::Observing&&!CmvsDraw::Original0&&!CmvsDraw::Original1,"one missing entry never installs or partially observes the other");CmvsDraw::DrawAt[i]=saved;}
 auto saved=CmvsDraw::DrawAt[1];CmvsDraw::DrawAt[1]=CmvsDraw::DrawAt[0];CmvsDraw::RefreshControl();Check(!CmvsDraw::Installed&&!CmvsDraw::Original0,"one address cannot impersonate both entries");
 CmvsDraw::DrawAt[1]=1;CmvsDraw::RefreshControl();Fn=(void *)&Draw0;Logs.clear();CallFixture();Check(!CmvsDraw::Installed&&!CmvsDraw::Observing&&!CmvsDraw::Original0&&!CmvsDraw::Original1&&AbiOkay()&&Logs.empty(),"second hook creation failure removes the never-enabled first hook");
 CmvsDraw::DrawAt[1]=saved;EnableCalls=0;FailEnableAt=2;CmvsDraw::RefreshControl();Check(CmvsDraw::Blocked&&!CmvsDraw::Installed&&!CmvsDraw::Observing&&CmvsDraw::Original0&&CmvsDraw::Original1,"second enable failure disables diagnostics and retains safe pass-through trampolines");
 for(int i=0;i<2;i++){Fn=i?(void *)&Draw1:(void *)&Draw0;Logs.clear();CallFixture();Check(Logs.empty()&&AbiOkay(),"enable rollback never partly observes or damages either original");}
 FailEnableAt=0;CmvsDraw::RefreshControl();Check(!CmvsDraw::Observing&&!CmvsDraw::Installed,"failed enable blocks later control polling from retrying a partial pair");
 // Single-thread fixture teardown is explicit; production retains these safe trampolines until process exit.
 Check(MH_RemoveHook((void *)&Draw0)==MH_OK&&MH_RemoveHook((void *)&Draw1)==MH_OK,"fixture removes the disabled pair after failed enable");CmvsDraw::Original0=CmvsDraw::Original1=nullptr;CmvsDraw::Blocked=0;
 CmvsDraw::RefreshControl();Check(CmvsDraw::Installed&&CmvsDraw::Observing&&CmvsDraw::Original0&&CmvsDraw::Original1,"both real detours activate as one diagnostic capability");
 Exercise(0);Exercise(1);
 Control(L"#cfg roles=0 embed=0 cmvsInput=0\r\n");CmvsDraw::RefreshControl();Logs.clear();for(int i=0;i<2;i++){Fn=i?(void *)&Draw1:(void *)&Draw0;CallFixture();Check(Logs.empty()&&AbiOkay(),"both entries pass through after diagnostic permission closes");}
 Check(MH_DisableHook((void *)&Draw0)==MH_OK&&MH_DisableHook((void *)&Draw1)==MH_OK,"both real detours disable cleanly");MH_RemoveHook((void *)&Draw0);MH_RemoveHook((void *)&Draw1);MH_Uninitialize();
 printf("CMVS actual ABI paired gate: %d checks, %d failures\n",Checks,Failures);return Failures;
}
#endif
