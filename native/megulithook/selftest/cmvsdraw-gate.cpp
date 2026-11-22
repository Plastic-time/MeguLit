// SPDX-License-Identifier: GPL-3.0-or-later
// Real MinHook, ECX this + two callee-cleaned words. No game or GDI renderer is started.
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
static int CreateCalls=0,EnableCalls=0,FailEnableAt=0,FailCreateAt=0;
static MH_STATUS TestCreateHook(LPVOID target,LPVOID detour,LPVOID *original){CreateCalls++;return FailCreateAt&&CreateCalls==FailCreateAt?MH_ERROR_MEMORY_ALLOC:MH_CreateHook(target,detour,original);}
static MH_STATUS TestEnableHook(LPVOID target){EnableCalls++;MH_STATUS result=MH_EnableHook(target);return FailEnableAt&&EnableCalls==FailEnableAt&&result==MH_OK?MH_ERROR_MEMORY_PROTECT:result;}
#define MH_CreateHook TestCreateHook
#define MH_EnableHook TestEnableHook
#endif
#ifndef CMVS_HEADER
#define CMVS_HEADER "../CmvsDraw.h"
#endif
#if !defined(CMVS_LEGACY_PERMISSION) && !defined(CMVS_PERMISSION_FIXED)
#define CMVS_PERMISSION_FIXED
#endif
#include CMVS_HEADER
#ifndef _WIN64
#undef MH_CreateHook
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
static __declspec(align(16)) DWORD XmmPattern[4]={0x12345678,0xabcdef01,0x99887766,0x11223344},AfterXmm[4],AfterXmm7[4];
static const WORD FixtureCw=0x0b7f;static WORD AfterCw;static const DWORD FixtureMxcsr=0x3f80;static DWORD AfterMxcsr;
static double AfterX87;static DWORD GotEntry=0;
static bool NestedSkipped=true,RevokedInFlight=false;static int NestedCalls=0;
static void InvokeNested();
static void Reenter(){auto saved=LogTap;LogTap=nullptr;size_t before=Logs.size();InvokeNested();NestedSkipped=NestedSkipped&&before==Logs.size();NestedCalls++;LogTap=saved;}
static void Check(bool ok,const char *why){Checks++;printf("%s %s\n",ok?"PASS":"FAIL",why);if(!ok)Failures++;}
static bool IsObserving(){
#ifdef CMVS_PERMISSION_FIXED
 return (CmvsDraw::Ticket()&1)!=0;
#else
 return CmvsDraw::Observing!=0;
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
static void InvokeNested(){using F=DWORD(__thiscall *)(void *,const char *,DWORD);int before=Calls;DWORD result=((F)Fn)((void *)0x11112222,"nested",0xabcdef11);NestedSkipped=NestedSkipped&&Calls==before+1&&result==OriginalResult;}
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

static void Revoke(){LogTap=nullptr;Control(L"#cfg roles=0 embed=0 cmvsInput=0\r\n");CmvsDraw::RefreshControl();RevokedInFlight=!IsObserving();}
static void RevokeResume(){Revoke();Control(L"#cfg roles=0 embed=0 cmvsInput=1\r\n");CmvsDraw::RefreshControl();}
static bool WaitPermission(bool on){DWORD begin=GetTickCount();do{if(IsObserving()==on)return true;Sleep(10);}while(GetTickCount()-begin<3500);return false;}
static DWORD WINAPI HeldCall(void *){CallFixture();return 0;}
static DWORD WINAPI RefreshThread(void *){CmvsDraw::RefreshControl();return 0;}
static void RefreshFaultCpp(){try{CmvsDraw::RefreshControl();}catch(...){}}
static void RefreshFaultSafe(){__try{RefreshFaultCpp();}__except(EXCEPTION_EXECUTE_HANDLER){}}
static void ControlChecks(){
 const wchar_t *bad[]={L"prefix #cfg cmvsInput=1\r\n",L"#cfg cmvsInput=0\r\nbody #cfg cmvsInput=1\r\n",L"body\r\n#cfg cmvsInput=1\r\n",L"#cfg cmvsInput=1",L"#cfg cmvsInput=1\r",L"#cfg cmvsInput=10\r\n",L"#cfg cmvsInput=1 cmvsInput=0\r\n",L"#cfg cmvsInput=1 cmvsInput=1\r\n",L"#cfg cmvsInput=10 cmvsInput=1\r\n",L"#cfg xcmvsInput=1\r\n",L"#cfg cmvsInput=1x\r\n",L"#cfg cmvsInput=1\t\r\n",L"\x6323\x6766\x6320\x766d\x4973\x706e\x7475\x313d\x000a"};
 for(auto value:bad){Control(value);Check(!CmvsDraw::DiagnosticAsked(),"real UTF16 file rejects non-first/incomplete/duplicate/lookalike/non-ASCII authorization");}
 Control(L"\xfeff#cfg roles=0 embed=0 cmvsInput=1\r\n");Check(CmvsDraw::DiagnosticAsked(),"valid UTF16LE BOM first line grants diagnostic");
 const char ascii[]="#cfg roles=0 cmvsInput=1\nbody cmvsInput=0\n";ControlRaw(ascii,sizeof ascii-1);Check(!CmvsDraw::DiagnosticAsked(),"raw ASCII cannot impersonate UTF16LE authorization");
 const char forged[]="#cfg cmvsInput=0\n#cfg cmvsInput=1\n";ControlRaw(forged,sizeof forged-1);Check(!CmvsDraw::DiagnosticAsked(),"later ASCII body cannot grant permission");
 const unsigned char bigEndian[]={0xfe,0xff,0,'#',0,'c',0,'f',0,'g',0,' ',0,'c',0,'m',0,'v',0,'s',0,'I',0,'n',0,'p',0,'u',0,'t',0,'=',0,'1',0,10};ControlRaw((const char *)bigEndian,sizeof bigEndian);Check(!CmvsDraw::DiagnosticAsked(),"UTF16BE is never reinterpreted as ASCII authorization");
 std::wstring longLine=L"#cfg cmvsInput=1 "+std::wstring(1024,L' ')+L"\r\n";Control(longLine.c_str());Check(!CmvsDraw::DiagnosticAsked(),"bounded read cannot accept a truncated first line");
 Control(L"#cfg cmvsInput=1\r\n");auto path=ControlPath();HANDLE locked=CreateFileW(path.c_str(),GENERIC_READ,0,nullptr,OPEN_EXISTING,0,nullptr);Check(locked!=INVALID_HANDLE_VALUE&&!CmvsDraw::DiagnosticAsked(),"control file read failure revokes permission");if(locked!=INVALID_HANDLE_VALUE)CloseHandle(locked);
 wchar_t oldTmp[32768]={},missing[32768];DWORD n=GetEnvironmentVariableW(L"TMP",oldTmp,32768);swprintf_s(missing,L"H:\\MeguLit-Work\\tmp\\cmvs-missing-%lu\\",GetCurrentProcessId());SetEnvironmentVariableW(L"TMP",missing);Check(!CmvsDraw::DiagnosticAsked(),"missing control path is false");SetEnvironmentVariableW(L"TMP",n?oldTmp:nullptr);
 Control(L"#cfg roles=0 embed=0 cmvsInput=1\r\n");
}
static std::string HexText(){std::string out;for(const auto &line:Logs){auto p=line.find(" hex=");if(p!=std::string::npos)out+=line.substr(p+5);}return out;}
static std::string Hex(const char *s,size_t size){const char digits[]="0123456789abcdef";std::string out;for(size_t i=0;i<size;i++){unsigned b=(unsigned char)s[i];out+=digits[b>>4];out+=digits[b&15];}return out;}
static bool AbiOkay(){return GotEax==0x24682468&&AfterEax==OriginalResult&&!std::memcmp(Got,Args,sizeof Args)&&GotEcx==AfterEcx&&AfterEcx==0x11112222&&GotEdx==AfterEdx&&AfterEdx==0x33334444&&GotEbx==AfterEbx&&AfterEbx==0x51515151&&GotEbp==AfterEbp&&AfterEbp==0x45454545&&GotEsi==AfterEsi&&AfterEsi==0x73737373&&GotEdi==AfterEdi&&AfterEdi==0x93939393&&(GotFlags&StatusMask)==StatusBits&&(AfterFlags&StatusMask)==StatusBits&&BeforeEsp==BeforeCleanupEsp&&BeforeEsp==AfterEsp&&!std::memcmp(XmmPattern,AfterXmm,sizeof XmmPattern)&&!std::memcmp(XmmPattern,AfterXmm7,sizeof XmmPattern)&&AfterX87==1.0&&AfterCw==FixtureCw&&AfterMxcsr==FixtureMxcsr;}
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
 Logs.clear();RevokedInFlight=false;LogTap=&Revoke;CallFixture();LogTap=nullptr;Check(RevokedInFlight&&!IsObserving()&&Logs.size()==1&&HexText().empty()&&AbiOkay(),"off in begin stops old data/end continuation; entered logger is not a close acknowledgement");
 Logs.clear();CallFixture();Check(Logs.empty()&&AbiOkay(),"next call after off is pass-through only");
 for(const char *phase:{" begin "," data "}){
  RevokeResume();std::string chunked(512,'q');Args[0]=(DWORD)chunked.c_str();Logs.clear();TapContains=phase;LogTap=&RevokeResume;CallFixture();LogTap=nullptr;TapContains=nullptr;
  bool atBegin=std::strcmp(phase," begin ")==0;
  Check(IsObserving()&&AbiOkay()&&Logs.size()==(atBegin?1:2)&&HexText().size()==(atBegin?0:CmvsDraw::ChunkBytes*2)&&Logs.back().find(" end ")==std::string::npos,"off-on during begin/data invalidates old snapshot before remaining data/end");
  Logs.clear();CallFixture();Check(AbiOkay()&&HexText()==Hex(chunked.data(),chunked.size())&&Logs.back().find(" end ")!=std::string::npos,"fresh complete append after off-on uses new permission generation");
 }
 Args[0]=(DWORD)text;
 for(int fault:{1,2}){Logs.clear();LONG injected=FxInjected;FxFault=fault;CallFixture();FxFault=0;unsigned char zero[16]={};
  Check(FxInjected==injected+1&&!std::memcmp(FaultFx+160,zero,16)&&!std::memcmp(FaultFx+272,zero,16)&&*(DWORD *)(FaultFx+24)==LoggerMxcsr&&*(WORD *)FaultFx==0x37f&&AbiOkay()&&!CmvsDraw::InObserver,"logger FX clobber before actual C++/SEH fault restores ABI and recursion guard");
  Logs.clear();CallFixture();Check(AbiOkay()&&HexText()==Hex(text,4),"fresh call remains observable after combined FX and exception");
 }


 Control(L"#cfg roles=0 embed=0 cmvsInput=0\r\n");CmvsDraw::RefreshControl();Logs.clear();CallFixture();Check(!IsObserving()&&Logs.empty()&&AbiOkay(),"removing diagnostic permission leaves original pass-through");
 Control(L"#cfg roles=0 embed=0 cmvsInput=1\r\n");CmvsDraw::RefreshControl();Logs.clear();CallFixture();Check(IsObserving()&&HexText()==Hex(text,4)&&AbiOkay(),"same paired detours resume diagnostics after permission returns");
}
static void ResetPair(){Control(L"#cfg cmvsInput=0\r\n");CmvsDraw::RefreshControl();for(int i=0;i<2;i++){MH_DisableHook((void *)CmvsDraw::DrawAt[i]);MH_RemoveHook((void *)CmvsDraw::DrawAt[i]);}CmvsDraw::Original0=CmvsDraw::Original1=nullptr;CmvsDraw::Installed=0;CmvsDraw::Blocked=0;CreateCalls=EnableCalls=0;Control(L"#cfg cmvsInput=1\r\n");}
int wmain(int argc,wchar_t **argv){
 Args[0]=(DWORD)"baseline";Args[1]=0xabcdef11;Control(L"#cfg roles=0 embed=0 cmvsInput=0\r\n");CmvsDraw::Arm();Check(!CmvsDraw::VersionPinned&&!CmvsDraw::Installed,"unrecognized host remains unhooked");
 Check(!CmvsDraw::VerifyFileBuild(L"H:\\MeguLit-Work\\tmp\\cmvs-not-present.bin"),"missing file never pins");wchar_t self[32768];GetModuleFileNameW(nullptr,self,32768);Check(!CmvsDraw::VerifyFileBuild(self),"wrong executable never pins");
 if(argc>1){Check(CmvsDraw::VerifyFileBuild(argv[1]),"actual owned CMVS executable is SHA verified read-only");wchar_t tmp[MAX_PATH];GetTempPathW(MAX_PATH,tmp);std::wstring bad=std::wstring(tmp)+L"cmvs-wrong-hash.bin";HANDLE h=CreateFileW(bad.c_str(),GENERIC_WRITE,0,nullptr,CREATE_ALWAYS,0,nullptr);char zeros[4096]={};DWORD written;unsigned left=CmvsDrawSig::FileBytes;bool all=h!=INVALID_HANDLE_VALUE;while(all&&left){DWORD n=left>sizeof zeros?sizeof zeros:left;all=WriteFile(h,zeros,n,&written,nullptr)&&written==n;left-=n;}LARGE_INTEGER size;all=all&&GetFileSizeEx(h,&size)&&size.QuadPart==CmvsDrawSig::FileBytes;if(h!=INVALID_HANDLE_VALUE)CloseHandle(h);Check(all&&!CmvsDraw::VerifyFileBuild(bad.c_str()),"same-size wrong SHA is rejected");}
 Check(!CmvsDraw::DiagnosticAsked(),"explicit diagnostic zero stays off");Control(L"#cfg roles=1 embed=1 advhdInput=1\r\n");Check(!CmvsDraw::DiagnosticAsked(),"other role/embed/diagnostic flags cannot enable CMVS");Control(L"#cfg roles=0 embed=0 cmvsInput=10\r\n");Check(!CmvsDraw::DiagnosticAsked(),"lookalike control value stays off");Control(L"#cfg roles=0 embed=0 cmvsInput=1\r\n");Check(CmvsDraw::DiagnosticAsked(),"CMVS diagnostics require no invented role permission");
 for(int i=0;i<2;i++){Fn=i?(void *)&Draw1:(void *)&Draw0;CallFixture();Check(GotEntry==i&&AbiOkay()&&Logs.empty(),"unhooked baseline really consumes two words with ret8");}
 ControlChecks();
 Check(MH_Initialize()==MH_OK,"real MinHook initialized");CmvsDraw::Image=(uintptr_t)GetModuleHandleA(nullptr);auto nt=(IMAGE_NT_HEADERS *)(CmvsDraw::Image+((IMAGE_DOS_HEADER *)CmvsDraw::Image)->e_lfanew);CmvsDraw::ImageEnd=CmvsDraw::Image+nt->OptionalHeader.SizeOfImage;CmvsDraw::DrawAt[0]=(uintptr_t)&Draw0;CmvsDraw::DrawAt[1]=(uintptr_t)&Draw1;
 CmvsDraw::RefreshControl();Check(!CmvsDraw::Installed&&!IsObserving(),"two addresses alone cannot bypass the file pin");
 // Fixture-only identity substitution; production sets this solely after exact SHA and BOTH unique expected RVAs.
 CmvsDraw::VersionPinned=true;
 for(int i=0;i<2;i++){auto saved=CmvsDraw::DrawAt[i];CmvsDraw::DrawAt[i]=0;CmvsDraw::RefreshControl();Check(!CmvsDraw::Installed&&!IsObserving()&&!CmvsDraw::Original0&&!CmvsDraw::Original1,"one missing entry never installs or partially observes the other");CmvsDraw::DrawAt[i]=saved;}
 auto saved=CmvsDraw::DrawAt[1];CmvsDraw::DrawAt[1]=CmvsDraw::DrawAt[0];CmvsDraw::RefreshControl();Check(!CmvsDraw::Installed&&!CmvsDraw::Original0,"one address cannot impersonate both entries");CmvsDraw::DrawAt[1]=saved;
 for(int fail=1;fail<=2;fail++){
  CreateCalls=0;FailCreateAt=fail;CmvsDraw::RefreshControl();FailCreateAt=0;
  Check(CmvsDraw::Blocked&&!CmvsDraw::Installed&&!IsObserving()&&(fail==1?!CmvsDraw::Original0:CmvsDraw::Original0!=nullptr)&&!CmvsDraw::Original1,"first/second create failure blocks retries and retains only existing safe originals");
  if(fail==2){if(CmvsDraw::Original0){Fn=(void *)&CmvsDraw::Gate0;Logs.clear();CallFixture();Check(Logs.empty()&&AbiOkay(),"partial create failure retains callable first original behind real Gate0");Fn=(void *)&Draw0;}else Check(false,"partial create failure retains callable first original behind real Gate0");}
  int creates=CreateCalls;CmvsDraw::RefreshControl();Check(CreateCalls==creates&&!CmvsDraw::Installed&&!IsObserving(),"polling cannot retry either failed create position");
  ResetPair();
 }
 for(int fail=1;fail<=2;fail++){
  EnableCalls=0;FailEnableAt=fail;CmvsDraw::RefreshControl();FailEnableAt=0;
  Check(CmvsDraw::Blocked&&!CmvsDraw::Installed&&!IsObserving()&&CmvsDraw::Original0&&CmvsDraw::Original1,"first/second real-enable then reported error retains both trampolines and blocks observation");
  for(int i=0;i<2;i++){Fn=i?(void *)&CmvsDraw::Gate1:(void *)&CmvsDraw::Gate0;Logs.clear();CallFixture();Check(Logs.empty()&&GotEntry==i&&AbiOkay(),"partial enable rollback keeps both real gates pass-through with ret8 ABI");}
  int creates=CreateCalls;CmvsDraw::RefreshControl();Check(CreateCalls==creates&&!IsObserving()&&!CmvsDraw::Installed,"failed enable cannot retry partial pair on later polling");ResetPair();
 }
 Logs.clear();LogTap=&Revoke;CmvsDraw::RefreshControl();LogTap=nullptr;Check(CmvsDraw::Installed&&!IsObserving(),"install status logger off request cannot be overwritten by outer stale grant");
 Control(L"#cfg cmvsInput=1\r\n");CmvsDraw::RefreshControl();Check(CmvsDraw::Installed&&IsObserving()&&CmvsDraw::Original0&&CmvsDraw::Original1,"both real detours activate as one diagnostic capability");
 Exercise(0);Exercise(1);
 std::string heldText(512,'h');Args[0]=(DWORD)heldText.c_str();for(int entry=0;entry<2;entry++){
 Fn=entry?(void *)&Draw1:(void *)&Draw0;Logs.clear();Entered=CreateEventW(nullptr,TRUE,FALSE,nullptr);Release=CreateEventW(nullptr,TRUE,FALSE,nullptr);HANDLE call=CreateThread(nullptr,0,HeldCall,nullptr,0,nullptr);
 bool entered=WaitForSingleObject(Entered,3000)==WAIT_OBJECT_0;RevokeResume();SetEvent(Release);bool joined=call&&WaitForSingleObject(call,3000)==WAIT_OBJECT_0;Check(entered&&joined&&Logs.size()==1&&HexText().empty()&&AbiOkay(),"cross-thread off-on stops old snapshot after already-entered begin logger");if(!joined)return Failures;CloseHandle(call);CloseHandle(Entered);CloseHandle(Release);Entered=Release=nullptr;
 Logs.clear();CallFixture();Check(AbiOkay()&&HexText()==Hex(heldText.data(),heldText.size()),"fresh call after held logger uses current epoch");
 }
 HANDLE stop=CreateEventW(nullptr,TRUE,FALSE,nullptr),watcher=CreateThread(nullptr,0,CmvsDraw::Watch,stop,0,nullptr);Control(L"#cfg cmvsInput=0\r\n");Check(watcher&&WaitPermission(false),"continuous real watcher revokes installed diagnostic");Logs.clear();CallFixture();Check(Logs.empty()&&AbiOkay(),"watcher-revoked call only forwards original");Control(L"#cfg cmvsInput=1\r\n");Check(WaitPermission(true),"same watcher resumes existing detour");Logs.clear();CallFixture();Check(AbiOkay()&&HexText()==Hex(heldText.data(),heldText.size()),"watcher accepts new-generation input");
 SetEvent(stop);bool stopped=watcher&&WaitForSingleObject(watcher,3500)==WAIT_OBJECT_0;Check(stopped&&!IsObserving(),"owned watcher stop revokes observation before joining");if(!stopped)return Failures;CloseHandle(watcher);CloseHandle(stop);


 Control(L"#cfg roles=0 embed=0 cmvsInput=0\r\n");CmvsDraw::RefreshControl();Logs.clear();for(int i=0;i<2;i++){Fn=i?(void *)&Draw1:(void *)&Draw0;CallFixture();Check(Logs.empty()&&AbiOkay(),"both entries pass through after diagnostic permission closes");}
 Check(MH_DisableHook((void *)&Draw0)==MH_OK&&MH_DisableHook((void *)&Draw1)==MH_OK,"both real detours disable cleanly");MH_RemoveHook((void *)&Draw0);MH_RemoveHook((void *)&Draw1);CmvsDraw::Installed=0;CmvsDraw::Original0=CmvsDraw::Original1=nullptr;
 for(int fault:{1,2}){
  Control(L"#cfg cmvsInput=1\r\n");ThrowLog=fault==1;FaultLog=fault==2;RefreshFaultSafe();ThrowLog=FaultLog=false;
  Check(CmvsDraw::Installed&&!IsObserving()&&CmvsDraw::Original0&&CmvsDraw::Original1,"install logger C++/SEH failure leaves observation closed with both originals retained");
  Control(L"#cfg cmvsInput=0\r\n");HANDLE thread=CreateThread(nullptr,0,RefreshThread,nullptr,0,nullptr);bool joined=thread&&WaitForSingleObject(thread,3000)==WAIT_OBJECT_0;Check(joined&&!IsObserving(),"install logger fault releases control lock for another real thread");if(!joined)return Failures;CloseHandle(thread);
  for(int i=0;i<2;i++){Fn=i?(void *)&CmvsDraw::Gate1:(void *)&CmvsDraw::Gate0;Logs.clear();CallFixture();Check(Logs.empty()&&GotEntry==i&&AbiOkay(),"install logger fault leaves both original ret8 gates callable without observation");}
  MH_DisableHook((void *)&Draw0);MH_DisableHook((void *)&Draw1);MH_RemoveHook((void *)&Draw0);MH_RemoveHook((void *)&Draw1);CmvsDraw::Installed=0;CmvsDraw::Original0=CmvsDraw::Original1=nullptr;
 }
 MH_Uninitialize();
 printf("CMVS actual ABI paired gate: %d checks, %d failures\n",Checks,Failures);return Failures;
}
#endif
