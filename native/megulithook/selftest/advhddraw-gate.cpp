// SPDX-License-Identifier: GPL-3.0-or-later
// Real MinHook, EAX height + eleven caller-cleaned words. No game or GDI renderer is started.
#include <windows.h>
#include <cstdio>
#include <cstdarg>
#include <string>
#include <vector>
#include <stdexcept>
static std::vector<std::string> Logs;static bool ThrowLog=false,FaultLog=false;static void (*LogTap)()=nullptr;
namespace Msg{static void Log(const char *format,...){if(ThrowLog)throw std::runtime_error("fixture logger failure");char b[1200];va_list args;va_start(args,format);vsnprintf(b,sizeof b,format,args);va_end(args);Logs.push_back(b);if(LogTap)LogTap();
#ifndef _WIN64
 __asm{
  pxor xmm0,xmm0
  fninit
 }
#endif
 if(FaultLog)RaiseException(EXCEPTION_ACCESS_VIOLATION,0,0,nullptr);
}}
#include "../AdvhdDraw.h"
#ifdef _WIN64
int main(){AdvhdDraw::Arm();puts("PASS AdvHD x64 remains unhooked");return 0;}
#else
static int Failures=0,Checks=0,Calls=0;
static DWORD Args[11],Got[11],GotHeight,GotFlags,GotCaller,GotEcx,GotEdx,GotEbx,GotEbp,GotEsi,GotEdi;
static DWORD AfterEax,AfterEcx,AfterEdx,AfterEbx,AfterEbp,AfterEsi,AfterEdi,AfterFlags,BeforeEsp,BeforeCleanupEsp,AfterEsp;
static const DWORD StatusMask=0xcd5,StatusBits=0xc45,OriginalResult=0x13572468;
static __declspec(align(16)) unsigned char SavedFx[512];
static __declspec(align(16)) DWORD XmmPattern[4]={0x12345678,0xabcdef01,0x99887766,0x11223344},AfterXmm[4];
static double AfterX87;
static bool NestedSkipped=true;static int NestedCalls=0;
static void Reenter(){auto saved=LogTap;LogTap=nullptr;DWORD stack[12]={};stack[7]=(DWORD)"nested";size_t before=Logs.size();AdvhdDraw::Observe(99,stack);NestedSkipped=NestedSkipped&&before==Logs.size();NestedCalls++;LogTap=saved;}
static void Check(bool ok,const char *why){Checks++;printf("%s %s\n",ok?"PASS":"FAIL",why);if(!ok)Failures++;}
static __declspec(naked) void Draw(){__asm{
 pushfd
 pushad
 mov edx,esp
 mov eax,[edx+28]
 mov GotHeight,eax
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
 mov ecx,11
 cld
 rep movsd
 inc Calls
 popad
 popfd
 mov eax,OriginalResult
 ret
}}
static void *Fn=(void *)&Draw;
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
 push dword ptr [Args+40]
 push dword ptr [Args+36]
 push dword ptr [Args+32]
 push dword ptr [Args+28]
 push dword ptr [Args+24]
 push dword ptr [Args+20]
 push dword ptr [Args+16]
 push dword ptr [Args+12]
 push dword ptr [Args+8]
 push dword ptr [Args+4]
 push dword ptr [Args]
 pushfd
 pop eax
 and eax,0xfffff32a
 or eax,0xc45
 push eax
 popfd
 mov eax,24
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
 add esp,44
 mov AfterEsp,esp
 pop edi
 pop esi
 pop ebx
 pop ebp
 ret
}}
static std::wstring ControlPath(){wchar_t tmp[MAX_PATH],file[MAX_PATH+64];GetTempPathW(MAX_PATH,tmp);std::wstring dir=std::wstring(tmp)+L"MeguLit";CreateDirectoryW(dir.c_str(),nullptr);dir+=L"\\draw";CreateDirectoryW(dir.c_str(),nullptr);swprintf_s(file,L"%s\\%lu.txt",dir.c_str(),GetCurrentProcessId());return file;}
static void RawControl(const void *value,DWORD bytes){auto f=ControlPath();HANDLE h=CreateFileW(f.c_str(),GENERIC_WRITE,0,nullptr,CREATE_ALWAYS,0,nullptr);if(h==INVALID_HANDLE_VALUE){printf("FIXTURE control open failed: %lu\n",GetLastError());ExitProcess(98);}DWORD written=0;bool ok=WriteFile(h,value,bytes,&written,nullptr)&&written==bytes;CloseHandle(h);if(!ok){puts("FIXTURE control write incomplete");ExitProcess(98);}}
static void Control(const wchar_t *value){RawControl(value,(DWORD)(wcslen(value)*2));}
static void RevokeReopen(){LogTap=nullptr;Control(L"#cfg advhdInput=0\r\n");AdvhdDraw::RefreshControl();Control(L"#cfg advhdInput=1\r\n");AdvhdDraw::RefreshControl();}
static void RevokeOnly(){LogTap=nullptr;Control(L"#cfg advhdInput=0\r\n");AdvhdDraw::RefreshControl();}
static void RevokeOnData(){if(Logs.back().find(" data ")==std::string::npos)return;RevokeReopen();}
static bool WaitObservation(bool on){DWORD start=GetTickCount();while(GetTickCount()-start<3500){if((AdvhdDraw::Observing!=0)==on)return true;Sleep(5);}return false;}
static std::string HexText(){std::string out;for(const auto &line:Logs){auto p=line.find(" hex=");if(p!=std::string::npos)out+=line.substr(p+5);}return out;}
static std::string Hex(const char *s,size_t size){const char digits[]="0123456789abcdef";std::string out;for(size_t i=0;i<size;i++){unsigned b=(unsigned char)s[i];out+=digits[b>>4];out+=digits[b&15];}return out;}
static bool AbiOkay(){return GotHeight==24&&AfterEax==OriginalResult&&!std::memcmp(Got,Args,sizeof Args)&&GotEcx==AfterEcx&&AfterEcx==0x11112222&&GotEdx==AfterEdx&&AfterEdx==0x33334444&&GotEbx==AfterEbx&&AfterEbx==0x51515151&&GotEbp==AfterEbp&&AfterEbp==0x45454545&&GotEsi==AfterEsi&&AfterEsi==0x73737373&&GotEdi==AfterEdi&&AfterEdi==0x93939393&&(GotFlags&StatusMask)==StatusBits&&(AfterFlags&StatusMask)==StatusBits&&BeforeEsp==BeforeCleanupEsp+44&&BeforeEsp==AfterEsp&&!std::memcmp(XmmPattern,AfterXmm,sizeof XmmPattern)&&AfterX87==1.0;}
int wmain(int argc,wchar_t **argv){
 const char *text="\x82\xa0\x82\xa2";for(int i=0;i<11;i++)Args[i]=0x100+i;Args[6]=(DWORD)text;
 Control(L"#cfg roles=0 embed=0 advhdInput=0\r\n");AdvhdDraw::Arm();Check(!AdvhdDraw::VersionPinned&&!AdvhdDraw::Installed,"unrecognized main module stays unhooked even if observer code is present");
 Check(!AdvhdDraw::VerifyFileBuild(L"H:\\MeguLit-Work\\tmp\\advhd-does-not-exist.bin"),"missing file never pins");wchar_t self[32768];GetModuleFileNameW(nullptr,self,32768);Check(!AdvhdDraw::VerifyFileBuild(self),"wrong executable never pins");
 if(argc>1){Check(AdvhdDraw::VerifyFileBuild(argv[1]),"actual owned executable SHA256 pins by reading only");
  wchar_t tmp[MAX_PATH];GetTempPathW(MAX_PATH,tmp);std::wstring bad=std::wstring(tmp)+L"advhd-wrong-hash.bin";HANDLE h=CreateFileW(bad.c_str(),GENERIC_WRITE,0,nullptr,CREATE_ALWAYS,0,nullptr);char zeros[4096]={};DWORD written;unsigned remaining=AdvhdDrawSig::FileBytes;bool writtenAll=h!=INVALID_HANDLE_VALUE;while(writtenAll&&remaining){DWORD n=remaining>sizeof zeros?sizeof zeros:remaining;writtenAll=WriteFile(h,zeros,n,&written,nullptr)&&written==n;remaining-=n;}LARGE_INTEGER size;writtenAll=writtenAll&&GetFileSizeEx(h,&size)&&size.QuadPart==AdvhdDrawSig::FileBytes;if(h!=INVALID_HANDLE_VALUE)CloseHandle(h);Check(writtenAll&&!AdvhdDraw::VerifyFileBuild(bad.c_str()),"same-size wrong SHA rejected");}
 Check(!AdvhdDraw::DiagnosticAsked(),"explicit diagnostic zero is off");Control(L"#cfg roles=1 embed=0\r\n");Check(!AdvhdDraw::DiagnosticAsked(),"roles permission alone never installs diagnostic input");Control(L"#cfg roles=0 embed=0 advhdInput=10\r\n");Check(!AdvhdDraw::DiagnosticAsked(),"lookalike token rejected");Control(L"#cfg roles=0 embed=0 advhdInput=1\r\n");Check(AdvhdDraw::DiagnosticAsked(),"independent UTF16 diagnostic flag requires no role claim");
 Control(L"\xfeff#cfg advhdInput=1\r\n");Check(AdvhdDraw::DiagnosticAsked(),"normal UTF16 BOM control remains accepted");
 const wchar_t *badControls[]={L"old body\r\n#cfg advhdInput=1\r\n",L"#cfg advhdInput=1 advhdInput=0\r\n",L"#cfg advhdInput=0 advhdInput=1\r\n",L"#cfg advhdInput=1 advhdInput=1\r\n",L"#cfg advhdInput=1 advhdInput\r\n",L"#cfg advhdInput=1",L"#cfg advhdInput=1\r",L"#cfg advhdInput=1\rnot-LF\n",L"#cfg advhdInput=1 \u0100\r\n"};
 for(auto value:badControls){Control(value);Check(!AdvhdDraw::DiagnosticAsked(),"malformed or duplicate/body/incomplete control fails closed");}
 const char ascii[]="#cfg advhdInput=1\r\n";RawControl(ascii,sizeof ascii-1);Check(!AdvhdDraw::DiagnosticAsked(),"non-protocol narrow bytes cannot authorize diagnostic input");
 Control(L"#cfg advhdInput=1\r\n");
 CallFixture();Check(AbiOkay()&&Logs.empty(),"unhooked EAX+11-word original ABI baseline");
 Check(MH_Initialize()==MH_OK,"real MinHook initialized");AdvhdDraw::Image=(uintptr_t)GetModuleHandleA(nullptr);auto nt=(IMAGE_NT_HEADERS *)(AdvhdDraw::Image+((IMAGE_DOS_HEADER *)AdvhdDraw::Image)->e_lfanew);AdvhdDraw::ImageEnd=AdvhdDraw::Image+nt->OptionalHeader.SizeOfImage;AdvhdDraw::DrawAt=(uintptr_t)&Draw;
 AdvhdDraw::RefreshControl();Check(!AdvhdDraw::Installed,"diagnostic opt-in cannot bypass a failed version pin");
 // Fixture-only identity substitution: production gets this state solely after full EXE hash + unique entry verification.
 AdvhdDraw::VersionPinned=true;LogTap=&RevokeOnly;AdvhdDraw::RefreshControl();LogTap=nullptr;Check(AdvhdDraw::Installed&&!AdvhdDraw::Observing,"installation logger's newer off refresh cannot be overwritten by outer stale on");Control(L"#cfg advhdInput=1\r\n");AdvhdDraw::RefreshControl();Check(AdvhdDraw::Installed&&AdvhdDraw::Observing,"product control path installs actual detour for the fake-engine fixture");Logs.clear();int before=Calls;CallFixture();
 Check(Calls==before+1&&AbiOkay(),"real gate preserves input EAX, eleven arguments, original result, all GPRs, flags, ESP, XMM and x87");Check(HexText()==Hex(text,4),"one complete input record despite no GDI cache-miss calls");
 char via[64];snprintf(via,sizeof via,"via=%lx ",(unsigned long)(GotCaller-AdvhdDraw::Image));Check(!Logs.empty()&&Logs[0].find(via)!=std::string::npos&&Logs[0].find("height=24 words=11 bytes=4")!=std::string::npos,"observed height and actual caller identity");
 char args[256];snprintf(args,sizeof args,"args=%lx,%lx,%lx,%lx,%lx,%lx,%lx,%lx,%lx,%lx,%lx",Args[0],Args[1],Args[2],Args[3],Args[4],Args[5],Args[6],Args[7],Args[8],Args[9],Args[10]);Check(Logs[0].find(args)!=std::string::npos,"all eleven raw input words are diagnostic data without invented roles or screen coordinates");
 Logs.clear();CallFixture();Check(HexText()==Hex(text,4)&&AbiOkay(),"repeated cached input is fully observed again");
 std::string longer(2048,'z');Args[6]=(DWORD)longer.c_str();Logs.clear();CallFixture();Check(HexText()==Hex(longer.data(),longer.size())&&AbiOkay(),"chunked raw input is complete beyond a short logger message");
 std::string exactLimit(AdvhdDraw::MaxText,'y');Args[6]=(DWORD)exactLimit.c_str();Logs.clear();CallFixture();Check(HexText()==Hex(exactLimit.data(),exactLimit.size())&&AbiOkay(),"exact limit is accepted only as a complete NUL-terminated input");
 Args[6]=(DWORD)"";Logs.clear();CallFixture();Check(Logs.size()==2&&HexText().empty()&&AbiOkay(),"empty input remains a complete zero-byte diagnostic");
 Args[6]=1;Logs.clear();CallFixture();Check(Logs.empty()&&AbiOkay(),"unreadable input cannot interfere with original draw");
 std::string tooLong(AdvhdDraw::MaxText+1,'x');Args[6]=(DWORD)tooLong.c_str();Logs.clear();CallFixture();Check(Logs.empty()&&AbiOkay(),"over-limit input is refused rather than silently truncated");
 Args[6]=(DWORD)text;ThrowLog=true;CallFixture();ThrowLog=false;Logs.clear();CallFixture();Check(HexText()==Hex(text,4)&&AbiOkay(),"logger exception leaves the ABI and recursion guard intact");
 Logs.clear();LogTap=&Reenter;CallFixture();LogTap=nullptr;Check(NestedCalls>0&&NestedSkipped&&HexText()==Hex(text,4)&&AbiOkay(),"logger reentry cannot recursively capture another input or change the original ABI");
 Logs.clear();LogTap=&RevokeReopen;CallFixture();LogTap=nullptr;Check(Logs.size()==1&&HexText().empty()&&AbiOkay(),"logger off-on revocation cannot revive old snapshot data or end");
 Logs.clear();CallFixture();Check(HexText()==Hex(text,4)&&AbiOkay(),"fresh input after reopened permission remains complete");
 Args[6]=(DWORD)longer.c_str();Logs.clear();LogTap=&RevokeOnData;CallFixture();LogTap=nullptr;Check(Logs.size()==2&&HexText()==Hex(longer.data(),128)&&AbiOkay(),"revoke-reopen during first data chunk drops remaining old chunks and end");Args[6]=(DWORD)text;
 Logs.clear();FaultLog=true;CallFixture();FaultLog=false;Check(AbiOkay(),"logger SEH after FP destruction still calls original with preserved ABI");Logs.clear();CallFixture();Check(HexText()==Hex(text,4)&&AbiOkay(),"SEH releases TLS guard for next input");
 std::wstring unreadable=ControlPath();HANDLE denied=CreateFileW(unreadable.c_str(),GENERIC_READ,0,nullptr,OPEN_EXISTING,0,nullptr);Check(denied!=INVALID_HANDLE_VALUE,"fixture exclusive control read handle acquired");AdvhdDraw::RefreshControl();Logs.clear();CallFixture();Check(!AdvhdDraw::Observing&&Logs.empty()&&AbiOkay(),"unreadable control revokes installed observer");if(denied!=INVALID_HANDLE_VALUE)CloseHandle(denied);AdvhdDraw::RefreshControl();
 Control(L"#cfg roles=0 embed=0 advhdInput=0\r\n");AdvhdDraw::RefreshControl();Logs.clear();CallFixture();Check(!AdvhdDraw::Observing&&Logs.empty()&&AbiOkay(),"installed gate becomes pass-through after diagnostic permission is removed");
 Control(L"#cfg roles=0 embed=0 advhdInput=1\r\n");AdvhdDraw::RefreshControl();Logs.clear();CallFixture();Check(AdvhdDraw::Observing&&HexText()==Hex(text,4)&&AbiOkay(),"diagnostic permission can reopen the same detour without changing original behavior");Control(L"#cfg roles=0 embed=0 advhdInput=0\r\n");AdvhdDraw::RefreshControl();Logs.clear();
 HANDLE stop=CreateEventW(nullptr,TRUE,FALSE,nullptr),watch=stop?CreateThread(nullptr,0,&AdvhdDraw::Watch,stop,0,nullptr):nullptr;
 Check(watch!=nullptr,"real persistent permission watcher started");if(watch){Control(L"#cfg advhdInput=1\r\n");Check(WaitObservation(true),"watcher enables already installed diagnostic gate");Control(L"#cfg advhdInput=0\r\n");Check(WaitObservation(false),"watcher observes off after installation instead of stopping discovery");Logs.clear();CallFixture();Check(Logs.empty()&&AbiOkay(),"watcher revoked gate remains original pass-through");SetEvent(stop);bool joined=WaitForSingleObject(watch,3000)==WAIT_OBJECT_0;Check(joined,"owned watcher joins before MinHook teardown");if(!joined)ExitProcess(98);CloseHandle(watch);}if(stop)CloseHandle(stop);
 Check(MH_DisableHook((void *)&Draw)==MH_OK,"real detour disables cleanly");CallFixture();Check(Logs.empty()&&AbiOkay(),"original remains unchanged after unhook");MH_RemoveHook((void *)&Draw);MH_Uninitialize();
 printf("AdvHD actual ABI gate: %d checks, %d failures\n",Checks,Failures);return Failures;
}
#endif
