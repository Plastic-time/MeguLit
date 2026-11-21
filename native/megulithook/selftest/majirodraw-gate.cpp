// SPDX-License-Identifier: GPL-3.0-or-later
/* Real MinHook on a cdecl stand-in: cache-hit calls do not make GDI calls either. */
#include <windows.h>
#include <cstdio>
#include <cstdarg>
#include <string>
#include <vector>
static std::vector<std::string> Logs;
namespace Msg { static void Log(const char *f,...){char b[1200];va_list a;va_start(a,f);vsnprintf(b,sizeof b,f,a);va_end(a);Logs.push_back(b);} }
#include "../MajiroDraw.h"
#ifdef _WIN64
int main(){MajiroDraw::Arm();puts("PASS Majiro x64 remains unhooked");return 0;}
#else
static DWORD AfterEbx,AfterEsi,AfterEdi,AfterEax;static int Failures,Calls;static void *GotFont,*GotDst,*GotOutput;static const char *GotText;static int GotFlags;
static void (*DuringOriginal)()=nullptr;
static void Check(bool ok,const char *why){printf("%s %s\n",ok?"PASS":"FAIL",why);if(!ok)Failures++;}
static __declspec(noinline) int __cdecl Draw(void *font,void *destination,const char *text,void *output,int flags){
 GotFont=font;GotDst=destination;GotText=text;GotOutput=output;GotFlags=flags;Calls++;*(int *)output=0x12345678;if(DuringOriginal)DuringOriginal();return 44;
}
static volatile MajiroDraw::DrawFn Fn=&Draw;
static __declspec(noinline) int CallA(void *font,void *dst,const char *text,void *out){return Fn(font,dst,text,out,17);}
static __declspec(noinline) int CallB(void *font,void *dst,const char *text,void *out){int r=Fn(font,dst,text,out,18);return r;}
static std::wstring ControlFile(){wchar_t tmp[MAX_PATH],file[MAX_PATH+64];GetTempPathW(MAX_PATH,tmp);std::wstring dir=std::wstring(tmp)+L"MeguLit";CreateDirectoryW(dir.c_str(),nullptr);dir+=L"\\draw";CreateDirectoryW(dir.c_str(),nullptr);swprintf_s(file,L"%s\\%lu.txt",dir.c_str(),GetCurrentProcessId());return file;}
static void RawControl(const void *text,DWORD size){auto file=ControlFile();HANDLE h=CreateFileW(file.c_str(),GENERIC_WRITE,0,nullptr,CREATE_ALWAYS,0,nullptr);DWORD written;WriteFile(h,text,size,&written,nullptr);CloseHandle(h);}
static void Control(const wchar_t *text){RawControl(text,(DWORD)(wcslen(text)*2));}
static void OffOnDuringOriginal(){DuringOriginal=nullptr;Control(L"#cfg roles=0\r\n");MajiroDraw::RefreshControl();Control(L"#cfg roles=1\r\n");MajiroDraw::RefreshControl();}
static bool WaitObserving(LONG wanted){for(int i=0;i<400;i++){if(InterlockedCompareExchange(&MajiroDraw::Observing,0,0)==wanted)return true;Sleep(10);}return false;}
int wmain(int argc,wchar_t **argv){
 DeleteFileW(ControlFile().c_str());
 Check(!MajiroDraw::RolesAsked(),"absent control is off");Control(L"#cfg roles=0\r\n");Check(!MajiroDraw::RolesAsked(),"roles=0 is off");Control(L"#cfg roles=10\r\n");Check(!MajiroDraw::RolesAsked(),"roles=10 is not opt-in");Control(L"#cfg roles=1\r\n");Check(MajiroDraw::RolesAsked(),"exact UTF16 roles=1 opt-in");
 if(argc>1){unsigned char bytes[512];DWORD got=0;HANDLE h=CreateFileW(argv[1],GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,0,nullptr);bool read=h!=INVALID_HANDLE_VALUE&&ReadFile(h,bytes,sizeof bytes,&got,nullptr);if(h!=INVALID_HANDLE_VALUE)CloseHandle(h);RawControl(bytes,got);Check(read&&MajiroDraw::RolesAsked(),"real JS transport UTF16 BOM first line authorizes");}
 const wchar_t *bad[]={L"body #cfg roles=1\r\n",L"\n#cfg roles=1\r\n",L"#cfg roles=1",L"#cfg roles=1\r",L"#cfg roles=1 roles=0\r\n",L"#cfg roles=1 roles=1\r\n",L"#cfg roles=1 roles\r\n",L"#cfgjunk roles=1\r\n",L"#cfg roles=0\r\n#cfg roles=1\r\n",L"#\x0163" L"fg roles=1\r\n"};
 for(auto text:bad){Control(text);Check(!MajiroDraw::RolesAsked(),"wrong first line, duplicate, truncated or malformed permission is rejected");}
 Control(L"\xfeff#cfg\troles=1\tembed=0\r\n本文 #cfg roles=0\r\n");Check(MajiroDraw::RolesAsked(),"BOM, tab separators and later game text retain trusted first-line permission");
 const char ascii[]="#cfg roles=1\nbody";RawControl(ascii,sizeof ascii-1);Check(MajiroDraw::RolesAsked(),"legacy ASCII first-line control remains supported");
 const char utf8[]="\xef\xbb\xbf#cfg roles=1\n";RawControl(utf8,sizeof utf8-1);Check(MajiroDraw::RolesAsked(),"UTF8 BOM ASCII cfg remains supported");
 const unsigned char malformed[]={'#',0,'c',1,'f',0,'g',0,' ',0,'r',0,'o',0,'l',0,'e',0,'s',0,'=',0,'1',0,'\n',0};RawControl(malformed,sizeof malformed);Check(!MajiroDraw::RolesAsked(),"nonzero UTF16 high byte cannot disappear from permission");
 std::wstring large=L"\xfeff#cfg roles=1 "+std::wstring(300,L' ')+L"\r\n";Control(large.c_str());Check(!MajiroDraw::RolesAsked(),"bounded read cannot authorize a truncated first line");
 Control(L"#cfg roles=1\r\n");HANDLE locked=CreateFileW(ControlFile().c_str(),GENERIC_READ,0,nullptr,OPEN_EXISTING,0,nullptr);Check(locked!=INVALID_HANDLE_VALUE&&!MajiroDraw::RolesAsked(),"unreadable control is off");if(locked!=INVALID_HANDLE_VALUE)CloseHandle(locked);
 int font[32]={};font[0x28/4]=24;font[0x38/4]=0x123456;font[0x48/4]=100;font[0x4c/4]=200;int destination=5,output=0;const char *text="\x82\xa0\x82\xa2";
 Check(CallA(font,&destination,text,&output)==44&&Logs.empty(),"unhooked original draw runs without telemetry");
 Check(MH_Initialize()==MH_OK,"real MinHook initialized");MajiroDraw::Image=(uintptr_t)GetModuleHandleA(nullptr);auto nt=(IMAGE_NT_HEADERS *)(MajiroDraw::Image+((IMAGE_DOS_HEADER *)MajiroDraw::Image)->e_lfanew);MajiroDraw::ImageEnd=MajiroDraw::Image+nt->OptionalHeader.SizeOfImage;MajiroDraw::DrawAt=(uintptr_t)&Draw;
 HANDLE stop=CreateEventW(nullptr,TRUE,FALSE,nullptr);HANDLE watcher=CreateThread(nullptr,0,MajiroDraw::Watch,stop,0,nullptr);
 Check(watcher&&WaitObserving(1)&&MajiroDraw::Installed,"product watcher installs the actual detour after roles=1");Logs.clear();int before=Calls;
 Check(CallA(font,&destination,text,&output)==44,"original width is returned");Check(Calls==before+1&&GotFont==font&&GotDst==&destination&&GotText==text&&GotOutput==&output&&GotFlags==17&&output==0x12345678,"all five arguments and output are unchanged");
 Check(Logs.size()==1&&Logs[0].find("n=2 x0=100 y0=200 width=44 size=24 paint=00123456")!=std::string::npos&&Logs[0].find("text=\xe3\x81\x82\xe3\x81\x84")!=std::string::npos,"one full Japanese run including a cache-hit draw with no GDI call");
 font[0x48/4]+=44;font[0x4c/4]+=30;CallB(font,&destination,text,&output);Check(Logs.size()==2&&Logs[1].find("x0=144 y0=230")!=std::string::npos,"pen changes follow the engine font record");
 if(Logs.size()==2){auto via=[](const std::string&s){auto p=s.find("via=");return s.substr(p,s.find(' ',p)-p);};Check(via(Logs[0])!=via(Logs[1]),"different actual callers retain different image-relative return addresses");}
 __asm {
  push ebx
  push esi
  push edi
  mov ebx,0x5151
  mov esi,0x7373
  mov edi,0x9393
  push 17
  lea eax,output
  push eax
  push text
  lea eax,destination
  push eax
  lea eax,font
  push eax
  call dword ptr [Fn]
  add esp,20
  mov AfterEax,eax
  mov AfterEbx,ebx
  mov AfterEsi,esi
  mov AfterEdi,edi
  pop edi
  pop esi
  pop ebx
 }
 Check(AfterEax==44&&AfterEbx==0x5151&&AfterEsi==0x7373&&AfterEdi==0x9393,"actual detour preserves cdecl nonvolatile registers and result");
 Logs.clear();CallA(nullptr,&destination,text,&output);Check(Logs.empty()&&GotFont==nullptr,"unreadable observation gives the original its arguments");
 Control(L"#cfg roles=0\r\n");Check(WaitObserving(0),"product watcher notices roles=0 after installation");Logs.clear();before=Calls;
 Check(CallA(font,&destination,text,&output)==44&&Calls==before+1&&output==0x12345678&&Logs.empty(),"roles=0 forwards original parameters/output/result without telemetry");
 Control(L"#cfg roles=1\r\n");Check(WaitObserving(1),"same product watcher resumes after roles=1");Logs.clear();CallA(font,&destination,text,&output);Check(Logs.size()==1,"re-enabled observer records again without rebuilding a detour");
 Logs.clear();DuringOriginal=&OffOnDuringOriginal;before=Calls;Check(CallA(font,&destination,text,&output)==44&&Calls==before+1&&Logs.empty(),"off-on inside the original cannot publish the previous permission epoch snapshot");Logs.clear();CallA(font,&destination,text,&output);Check(Logs.size()==1,"the next draw uses the new permission epoch normally");
 DeleteFileW(ControlFile().c_str());Check(WaitObserving(0),"removing control stops product observation");Logs.clear();Check(CallA(font,&destination,text,&output)==44&&Logs.empty(),"removed control leaves only the original draw");
 SetEvent(stop);Check(WaitForSingleObject(watcher,4000)==WAIT_OBJECT_0,"test watcher exits before MinHook cleanup");CloseHandle(watcher);CloseHandle(stop);
 Check(MH_DisableHook((void *)&Draw)==MH_OK,"detour disables cleanly");Check(CallA(font,&destination,text,&output)==44&&Logs.empty(),"disabled observer leaves original draw untouched");MH_RemoveHook((void *)&Draw);MH_Uninitialize();DeleteFileW(ControlFile().c_str());printf("Majiro real gate: %d failure(s)\n",Failures);return Failures;
}
#endif
