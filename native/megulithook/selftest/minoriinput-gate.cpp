// SPDX-License-Identifier: GPL-3.0-or-later
// Real MinHook on an owned x86 stand-in; never loads or calls the game executable.
#include <windows.h>
#include <cstdio>
#include <cstdarg>
#include <cstring>
#include <string>
#include <vector>
#include <stdexcept>
#include "../../shared/minhook/include/MinHook.h"
static std::vector<std::string> Logs;
static int LogFault=0;static void (*LogTap)()=nullptr;static HANDLE Entered=nullptr,Release=nullptr;
static bool CreateFail=false,EnableFail=false;
static const DWORD LoggerMxcsr=0x5f80;
#ifndef _WIN64
static MH_STATUS WINAPI Create(LPVOID t,LPVOID d,LPVOID *o){return CreateFail?MH_ERROR_MEMORY_ALLOC:MH_CreateHook(t,d,o);}
static MH_STATUS WINAPI Enable(LPVOID t){MH_STATUS s=MH_EnableHook(t);return EnableFail&&s==MH_OK?MH_ERROR_MEMORY_PROTECT:s;}
#endif
namespace Msg {static void Log(const char *format,...){
 if(LogFault==1)throw std::runtime_error("fixture C++ logger fault");if(LogFault==2)RaiseException(0xe1234567,0,0,nullptr);
 char text[1200];va_list a;va_start(a,format);vsnprintf(text,sizeof text,format,a);va_end(a);
 if(Entered){SetEvent(Entered);WaitForSingleObject(Release,3000);}Logs.push_back(text);if(LogTap)LogTap();
#ifndef _WIN64
 __asm{
  pxor xmm0,xmm0
  pxor xmm7,xmm7
  fninit
  ldmxcsr LoggerMxcsr
 }
#endif
}}
#define MH_CreateHook Create
#define MH_EnableHook Enable
#include "../MinoriInput.h"
#undef MH_CreateHook
#undef MH_EnableHook
#ifdef _WIN64
int main(){MinoriInput::Arm();puts("PASS Minori x64 no-op");return 0;}
#else
static int Checks=0,Failures=0,Calls=0;
struct ByteString{union{char inlineBytes[16];const char *heap;};DWORD length,capacity;};
struct NodeData{DWORD vt;char pad[8];ByteString text;DWORD other,cursor;};
static_assert(offsetof(NodeData,cursor)==0x28,"real node cursor layout");
static NodeData Node={};static DWORD FakeVtable[32]={};static ByteString Input={};static ByteString *Arg=&Input;
static DWORD Self=(DWORD)&Node;
static bool OriginalAccess=true,MutateAlias=false;static char OriginalText[32769];
static DWORD GotThis,GotArg,GotEax,GotEcx,GotEdx,GotEbx,GotEbp,GotEsi,GotEdi,GotFlags;
static DWORD AfterEax,AfterEcx,AfterEdx,AfterEbx,AfterEbp,AfterEsi,AfterEdi,AfterFlags,BeforeEsp,AfterEsp,AfterMxcsr;
static const DWORD OriginalResult=0x13572468,StatusMask=0xcd5,StatusBits=0xc45,TestMxcsr=0x3f80;
static __declspec(align(16)) unsigned char SavedFx[512];
static __declspec(align(16)) unsigned char OriginalFx[512];
static __declspec(align(16)) DWORD Pattern[4]={0x12345678,0xabcdef01,0x99887766,0x11223344},AfterXmm0[4],AfterXmm7[4];
static double AfterX87;
static void DoOriginal(NodeData *n,ByteString *s){if(!OriginalAccess)return;const char *p=s->capacity<16?s->inlineBytes:s->heap;memcpy(OriginalText,p,s->length);OriginalText[s->length]=0;n->cursor=(DWORD)OriginalText;if(MutateAlias&&s==&n->text){s->inlineBytes[0]='X';s->length=1;s->inlineBytes[1]=0;}}
static __declspec(naked) void InputMethod(){__asm{
 pushfd
 pushad
 mov edx,esp
 mov eax,[edx+28]
 mov GotEax,eax
 mov eax,[edx+24]
 mov GotThis,eax
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
 mov eax,[edx+32]
 mov GotFlags,eax
 mov eax,[edx+40]
 mov GotArg,eax
 push eax
 push dword ptr [edx+24]
 cld
 fxsave OriginalFx
 call DoOriginal
 fxrstor OriginalFx
 add esp,8
 inc Calls
 popad
 popfd
 mov eax,OriginalResult
 ret 4
}}
static void *Fn=(void *)&InputMethod;
static __declspec(naked) void CallFixture(){__asm{
 push ebp
 push ebx
 push esi
 push edi
 mov BeforeEsp,esp
 fxsave SavedFx
 fninit
 fld1
 ldmxcsr TestMxcsr
 movdqu xmm0,Pattern
 movdqu xmm7,Pattern
 push Arg
 pushfd
 pop eax
 and eax,0xfffff32a
 or eax,0xc45
 push eax
 popfd
 mov eax,0x10101010
 mov ecx,Self
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
 mov AfterEsp,esp
 cld
 movdqu AfterXmm0,xmm0
 movdqu AfterXmm7,xmm7
 stmxcsr AfterMxcsr
 fstp AfterX87
 fxrstor SavedFx
 pop edi
 pop esi
 pop ebx
 pop ebp
 ret
}}
static void Check(bool okay,const char *why){Checks++;printf("%s %s\n",okay?"PASS":"FAIL",why);if(!okay)Failures++;}
static bool Abi(){return GotThis==Self&&GotArg==(DWORD)Arg&&GotEax==0x10101010&&AfterEax==OriginalResult&&GotEcx==AfterEcx&&AfterEcx==Self&&GotEdx==AfterEdx&&AfterEdx==0x33334444&&GotEbx==AfterEbx&&AfterEbx==0x51515151&&GotEbp==AfterEbp&&AfterEbp==0x45454545&&GotEsi==AfterEsi&&AfterEsi==0x73737373&&GotEdi==AfterEdi&&AfterEdi==0x93939393&&(GotFlags&StatusMask)==StatusBits&&(AfterFlags&StatusMask)==StatusBits&&BeforeEsp==AfterEsp&&AfterMxcsr==TestMxcsr&&!memcmp(Pattern,AfterXmm0,sizeof Pattern)&&!memcmp(Pattern,AfterXmm7,sizeof Pattern)&&AfterX87==1.0;}
static void Set(const std::string &s){memset(&Input,0,sizeof Input);Input.length=(DWORD)s.size();if(s.size()<16){memcpy(Input.inlineBytes,s.data(),s.size());Input.capacity=15;}else{Input.heap=s.c_str();Input.capacity=(DWORD)s.size();}Arg=&Input;OriginalAccess=true;}
static std::string Hex(const char *p,size_t n){const char d[]="0123456789abcdef";std::string out;for(size_t i=0;i<n;i++){unsigned b=(unsigned char)p[i];out+=d[b>>4];out+=d[b&15];}return out;}
static std::string Raw(){std::string out;for(const auto &l:Logs){auto at=l.find(" hex=");if(at!=std::string::npos)out+=l.substr(at+5);}return out;}
static std::wstring ControlPath(){wchar_t tmp[MAX_PATH],file[MAX_PATH+64];GetTempPathW(MAX_PATH,tmp);std::wstring dir=std::wstring(tmp)+L"MeguLit";CreateDirectoryW(dir.c_str(),nullptr);dir+=L"\\draw";CreateDirectoryW(dir.c_str(),nullptr);swprintf_s(file,L"%s\\%lu.txt",dir.c_str(),GetCurrentProcessId());return file;}
static void Control(bool on,bool refresh=true){auto file=ControlPath();HANDLE h=CreateFileW(file.c_str(),GENERIC_WRITE,0,nullptr,CREATE_ALWAYS,0,nullptr);const wchar_t *s=on?L"\xfeff#cfg roles=0 embed=0 minoriInput=1\r\n":L"\xfeff#cfg roles=0 embed=0 minoriInput=0\r\n";DWORD n;WriteFile(h,s,(DWORD)wcslen(s)*2,&n,nullptr);CloseHandle(h);if(refresh)MinoriInput::RefreshControl();}
static bool WaitPermission(bool on){DWORD start=GetTickCount();do{if(((MinoriInput::Ticket()&1)!=0)==on)return true;Sleep(10);}while(GetTickCount()-start<3000);return false;}
static void Reenter(){auto tap=LogTap;LogTap=nullptr;ByteString nested={};strcpy_s(nested.inlineBytes,"nested");nested.length=6;nested.capacity=15;((void(__thiscall *)(void *,ByteString *))Fn)(&Node,&nested);LogTap=tap;}
static DWORD WINAPI HeldCall(void *){CallFixture();return 0;}
int wmain(int argc,wchar_t **argv){
 Node.vt=(DWORD)FakeVtable;Node.cursor=0x98765432;const std::string normal="raw input";Set(normal);Control(false);MinoriInput::Arm();
 Check(!MinoriInput::VersionPinned&&!MinoriInput::Installed,"unknown process stays unhooked with diagnostic code present");
 Check(!MinoriInput::VerifyFileBuild(L"minori-no-such-file.invalid"),"missing executable rejects identity");wchar_t self[MAX_PATH];GetModuleFileNameW(nullptr,self,MAX_PATH);Check(!MinoriInput::VerifyFileBuild(self),"wrong owned executable rejects identity");if(argc>1)Check(MinoriInput::VerifyFileBuild(argv[1]),"actual English executable SHA verified without execution");
 CallFixture();Check(Abi()&&Logs.empty(),"unhooked thiscall/object-pointer/ret4 ABI baseline");Check(!memcmp(OriginalText,normal.data(),normal.size()),"stand-in original copies real SSO layout");
 Check(MH_Initialize()==MH_OK,"actual MinHook initialization");MinoriInput::Image=(uintptr_t)GetModuleHandleW(nullptr);MinoriInput::ImageEnd=MinoriInput::Image+0x1000000;MinoriInput::InputAt=(uintptr_t)&InputMethod;MinoriInput::NodeVtable=(uintptr_t)FakeVtable;
 Control(true);Check(!MinoriInput::Installed,"diagnostic permission cannot bypass full version pin");
 // Fixture-only pin substitution; production only sets this after full file, entry and layout verification.
 MinoriInput::VersionPinned=true;Control(false);Check(!MinoriInput::Installed,"pinned build does not hook while permission is off");Control(true);Check(MinoriInput::Installed&&(MinoriInput::Ticket()&1),"normal product install path creates real detour");
 Logs.clear();Node.cursor=0x98765432;int before=Calls;CallFixture();Check(Calls==before+1&&Abi(),"real gate preserves GPR/flags/ESP/result/XMM0/XMM7/x87/MXCSR");Check(Raw()==Hex(normal.data(),normal.size()),"full SSO object bytes recorded");Check(Logs.front().find("cursorBefore=98765432")!=std::string::npos&&Logs.front().find("phase=pre build=en")!=std::string::npos,"cursor is explicitly pre-copy English-build diagnostic");
 for(std::string s:{std::string(),std::string(15,'s'),std::string(16,'h'),std::string(2048,'q'),std::string(MinoriInput::MaxText,'m'),std::string("a\0b",3)}){Set(s);Logs.clear();CallFixture();Check(Abi()&&Raw()==Hex(s.data(),s.size())&&Logs.size()>=2&&Logs.front().find(" begin ")!=std::string::npos&&Logs.back().find(" end ")!=std::string::npos,"SSO/heap/boundary/empty/embedded-NUL exact bytes");}
 Set(std::string("a"));Logs.clear();CallFixture();Check(Logs.front().find("fnv64=af63dc4c8601ec8c")!=std::string::npos,"known FNV-1a byte checksum vector");
 Set(normal);Node.text=Input;Arg=&Node.text;MutateAlias=true;Logs.clear();CallFixture();MutateAlias=false;Check(Abi()&&Raw()==Hex(normal.data(),normal.size())&&Node.text.inlineBytes[0]=='X',"aliased source snapshot precedes original mutation");
 std::string large(MinoriInput::MaxText+1,'x');Set(large);OriginalAccess=false;Logs.clear();CallFixture();Check(Logs.empty()&&Abi(),"oversized object is rejected without original argument changes");
 Set(normal);Input.length=16;Input.capacity=15;OriginalAccess=false;Logs.clear();CallFixture();Check(Logs.empty()&&Abi(),"impossible SSO length is refused");Set(normal);Input.inlineBytes[Input.length]='x';OriginalAccess=false;Logs.clear();CallFixture();Check(Logs.empty()&&Abi(),"missing length-end NUL refuses capture");
 Arg=(ByteString *)1;OriginalAccess=false;Logs.clear();CallFixture();Check(Logs.empty()&&Abi(),"bad object pointer passes unchanged to original");Set(std::string(16,'h'));Input.heap=(char *)1;OriginalAccess=false;Logs.clear();CallFixture();Check(Logs.empty()&&Abi(),"bad heap pointer passes unchanged to original");Set(normal);Node.vt=1;Logs.clear();CallFixture();Check(Logs.empty()&&Abi(),"wrong node layout refuses capture");Node.vt=(DWORD)FakeVtable;
 Self=1;OriginalAccess=false;Logs.clear();CallFixture();Check(Logs.empty()&&Abi(),"bad this pointer is never substituted or dereferenced outside the capture guard");Self=(DWORD)&Node;
 for(int fault:{1,2}){Set(normal);Logs.clear();LogFault=fault;CallFixture();LogFault=0;Logs.clear();CallFixture();Check(Abi()&&Raw()==Hex(normal.data(),normal.size())&&!MinoriInput::InObserver,"C++ and SEH logger faults restore gate state and recursion guard");}
 Set(normal);Logs.clear();LogTap=Reenter;CallFixture();LogTap=nullptr;Check(Abi()&&Raw()==Hex(normal.data(),normal.size()),"actual detour reentry is not recursively observed");
 Control(false);Arg=(ByteString *)1;OriginalAccess=false;Logs.clear();CallFixture();Check(Abi()&&Logs.empty(),"installed gate is pass-through after polled revocation");Control(true);Set(normal);Logs.clear();CallFixture();Check(Abi()&&Raw()==Hex(normal.data(),normal.size()),"permission can reopen without resurrecting a saved input");
 Entered=CreateEventW(nullptr,TRUE,FALSE,nullptr);Release=CreateEventW(nullptr,TRUE,FALSE,nullptr);Set(normal);Logs.clear();HANDLE thread=CreateThread(nullptr,0,HeldCall,nullptr,0,nullptr);bool held=WaitForSingleObject(Entered,3000)==WAIT_OBJECT_0;LONG oldTicket=MinoriInput::Ticket();Control(false);Control(true);SetEvent(Release);bool closed=WaitForSingleObject(thread,3000)==WAIT_OBJECT_0;if(!closed){Check(false,"owned call thread must close before physical hook or event cleanup");return Failures;}CloseHandle(thread);CloseHandle(Entered);CloseHandle(Release);Entered=Release=nullptr;
 Check(held&&closed&&MinoriInput::Ticket()!=oldTicket&&Raw().empty()&&Logs.size()==1&&Logs.front().find(" begin ")!=std::string::npos,"off-on invalidates an in-flight old snapshot; entered logger is not a revocation ACK");Logs.clear();CallFixture();Check(Abi()&&Raw()==Hex(normal.data(),normal.size()),"fresh input after off-on records normally");
 HANDLE stop=CreateEventW(nullptr,TRUE,FALSE,nullptr),watch=CreateThread(nullptr,0,MinoriInput::Watch,stop,0,nullptr);Control(false,false);Check(WaitPermission(false),"actual watcher polls revocation from the real control file");Arg=(ByteString *)1;OriginalAccess=false;Logs.clear();CallFixture();Check(Abi()&&Logs.empty(),"actual polled off state leaves original call untouched");Control(true,false);Check(WaitPermission(true),"actual watcher polls reopening");Set(normal);Logs.clear();CallFixture();Check(Abi()&&Raw()==Hex(normal.data(),normal.size()),"actual polled on state accepts a fresh input");SetEvent(stop);bool watchClosed=WaitForSingleObject(watch,3000)==WAIT_OBJECT_0;Check(watchClosed&&!(MinoriInput::Ticket()&1),"owned watcher stop closes observation and is joined before fixture cleanup");if(!watchClosed)return Failures;CloseHandle(watch);CloseHandle(stop);
 Control(false);Check(MH_DisableHook((void *)&InputMethod)==MH_OK&&MH_RemoveHook((void *)&InputMethod)==MH_OK,"fixture-only physical cleanup occurs after owned call thread joined");MinoriInput::Installed=0;MinoriInput::Original=nullptr;CreateFail=true;Control(true);CreateFail=false;Check(MinoriInput::Blocked&&!(MinoriInput::Ticket()&1)&&!MinoriInput::Original,"create failure leaves no callable observer or dangling original");
 MinoriInput::Blocked=0;EnableFail=true;Control(true);EnableFail=false;Check(MinoriInput::Blocked&&!(MinoriInput::Ticket()&1)&&MinoriInput::Original,"partial enable failure retains its trampoline and closes observation");Fn=(void *)&MinoriInput::Gate;Logs.clear();CallFixture();Check(Abi()&&Logs.empty(),"retained pass-through trampoline remains callable after enable failure");Fn=(void *)&InputMethod;
 MH_DisableHook((void *)&InputMethod);MH_RemoveHook((void *)&InputMethod);MH_Uninitialize();DeleteFileW(ControlPath().c_str());printf("Minori actual gate: %d checks, %d failures\n",Checks,Failures);return Failures;
}
#endif
