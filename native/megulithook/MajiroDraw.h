// SPDX-License-Identifier: GPL-3.0-or-later
// Observe old Majiro's complete-string draw before its glyph cache. Canvas coordinates only;
// screen origin, dialogue/name/choice/ruby roles and paint interpretation still need live evidence.
// Nothing is installed until this process's draw control file explicitly requests roles=1.
#pragma once
#ifndef _WIN64
#include <windows.h>
#include <intrin.h>
#include <cstdio>
#include <string>
#include "MinHook.h"
#include "MajiroDrawSig.h"
namespace MajiroDraw {
using DrawFn=int(__cdecl *)(void *,void *,const char *,void *,int);
static DrawFn Original=nullptr;
static uintptr_t Image=0,ImageEnd=0,DrawAt=0;
static volatile LONG Armed=0,Installed=0,Run=0;
struct Snapshot { long x,y,size;unsigned paint;char text[4096];int bytes; };
static bool Capture(void *font,const char *text,Snapshot *s){
 __try{
  if(!font||!text)return false;
  auto f=(const unsigned char *)font;s->x=*(const long *)(f+0x48);s->y=*(const long *)(f+0x4c);s->size=*(const long *)(f+0x28);s->paint=*(const unsigned *)(f+0x38);
  if(s->size<1||s->size>1024)return false;
  int n=0;while(n<4095&&text[n]){s->text[n]=text[n];n++;}if(!n||n==4095)return false;
  s->text[n]=0;s->bytes=n;return true;
 }__except(EXCEPTION_EXECUTE_HANDLER){return false;}
}
static std::string Utf8(const char *text,int bytes){
 int n=MultiByteToWideChar(932,0,text,bytes,nullptr,0);if(n<=0)return {};
 std::wstring w(n,L'\0');MultiByteToWideChar(932,0,text,bytes,&w[0],n);
 int m=WideCharToMultiByte(CP_UTF8,0,w.data(),n,nullptr,0,nullptr,nullptr);std::string s(m,'\0');
 if(m)WideCharToMultiByte(CP_UTF8,0,w.data(),n,&s[0],m,nullptr,nullptr);return s;
}
static int __cdecl Gate(void *font,void *destination,const char *text,void *output,int flags){
 Snapshot s{};bool captured=Capture(font,text,&s);uintptr_t caller=(uintptr_t)_ReturnAddress();
 int width=Original(font,destination,text,output,flags);
 if(captured){try{
  std::string u=Utf8(s.text,s.bytes);int chars=0;for(unsigned char c:u)if((c&0xc0)!=0x80)chars++;
  if(u.size()>240){size_t cut=240;while(cut&&((unsigned char)u[cut]&0xc0)==0x80)cut--;u.resize(cut);}
  for(char &c:u)if(c=='\r'||c=='\n')c=' ';
  uintptr_t via=caller>=Image&&caller<ImageEnd?caller-Image:0;
  Msg::Log("ToMe_DRAWRUN engine=majiro run=%lu n=%d x0=%ld y0=%ld width=%d size=%ld paint=%08x via=%lx text=%s",(unsigned long)InterlockedIncrement(&Run),chars,s.x,s.y,width,s.size,s.paint,(unsigned long)via,u.c_str());
 }catch(...){/* Observation must never prevent the game from receiving its own draw result. */}}
 return width;
}
static bool FindInImage(uintptr_t base){
 auto nt=(IMAGE_NT_HEADERS *)(base+((IMAGE_DOS_HEADER *)base)->e_lfanew);auto sec=IMAGE_FIRST_SECTION(nt);int total=0;uintptr_t found=0;
 for(int i=0;i<nt->FileHeader.NumberOfSections;i++,sec++)if(sec->Characteristics&IMAGE_SCN_MEM_EXECUTE){
  MajiroDrawSig::Site sites[2];int n=MajiroDrawSig::Find((const unsigned char *)(base+sec->VirtualAddress),sec->Misc.VirtualSize,sites,2);
  if(n&&!total)found=base+sec->VirtualAddress+sites[0].offset;total+=n;
 }
 if(total!=1)return false;Image=base;ImageEnd=base+nt->OptionalHeader.SizeOfImage;DrawAt=found;return true;
}
static bool RolesAsked(){
 wchar_t tmp[MAX_PATH],file[MAX_PATH+64];DWORD n=GetTempPathW(MAX_PATH,tmp);if(!n||n>=MAX_PATH)return false;
 swprintf_s(file,L"%sMeguLit\\draw\\%lu.txt",tmp,GetCurrentProcessId());HANDLE h=CreateFileW(file,GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,0,nullptr);if(h==INVALID_HANDLE_VALUE)return false;
 char bytes[512]={};DWORD got=0;ReadFile(h,bytes,sizeof bytes-1,&got,nullptr);CloseHandle(h);std::string ascii;for(DWORD i=0;i<got;i++)if(bytes[i])ascii+=bytes[i];
 size_t p=ascii.find("#cfg ");if(p==std::string::npos)return false;size_t end=ascii.find_first_of("\r\n",p);std::string cfg=ascii.substr(p,end==std::string::npos?end:end-p);
 p=cfg.find("roles=1");return p!=std::string::npos&&(p==0||cfg[p-1]==' ')&&(p+7==cfg.size()||cfg[p+7]==' ');
}
static bool Install(){
 if(Installed)return true;
 if(MH_CreateHook((void *)DrawAt,(void *)&Gate,(void **)&Original)!=MH_OK)return false;
 if(MH_EnableHook((void *)DrawAt)!=MH_OK){MH_RemoveHook((void *)DrawAt);Original=nullptr;return false;}
 InterlockedExchange(&Installed,1);Msg::Log("ToMe_DRAWRUN engine=majiro on: complete string draw rva=%lx",(unsigned long)(DrawAt-Image));return true;
}
static DWORD WINAPI Watch(void *){for(int i=0;i<1800;i++){if(RolesAsked()){Install();if(Installed)break;}Sleep(2000);}return 0;}
static void Arm(){
 if(InterlockedExchange(&Armed,1))return;
 __try{if(!FindInImage((uintptr_t)GetModuleHandleA(nullptr)))return;}__except(EXCEPTION_EXECUTE_HANDLER){return;}
 HANDLE thread=CreateThread(nullptr,0,Watch,nullptr,0,nullptr);if(thread)CloseHandle(thread);
}
}
#else
namespace MajiroDraw { static void Arm() {} }
#endif
