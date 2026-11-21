// SPDX-License-Identifier: GPL-3.0-or-later
// Diagnostic input only: no role, screen box, hide, embed or reader-source delivery.
// This one build has a nonstandard EAX input and caller-cleaned stack; the gate tail-jumps to the original.
#pragma once
#ifndef _WIN64
#include <windows.h>
#include <wincrypt.h>
#include <cstdio>
#include <cstring>
#include <string>
#include "MinHook.h"
#include "AdvhdDrawSig.h"
#pragma comment(lib,"advapi32.lib")
namespace AdvhdDraw {
static void *Original=nullptr;
static uintptr_t Image=0,ImageEnd=0,DrawAt=0;
static bool VersionPinned=false;
static volatile LONG Armed=0,Installed=0,Observing=0,Run=0;
static __declspec(thread) bool InObserver=false;
static const DWORD ObserverMxcsr=0x1f80;
static const int MaxText=32768,ChunkBytes=128;
struct Snapshot{DWORD height,caller,args[AdvhdDrawSig::StackWords];int bytes;char text[MaxText+1];};
static bool Capture(DWORD height,const DWORD *stack,Snapshot *out){
 __try{if(!stack||!out)return false;out->height=height;out->caller=stack[0];for(unsigned i=0;i<AdvhdDrawSig::StackWords;i++)out->args[i]=stack[i+1];
  const char *text=(const char *)out->args[AdvhdDrawSig::TextArg-1];if(!text)return false;
  int n=0;while(n<MaxText&&text[n]){out->text[n]=text[n];n++;}if(n==MaxText&&text[n])return false;out->text[n]=0;out->bytes=n;return true;
 }__except(EXCEPTION_EXECUTE_HANDLER){return false;}
}
static void EmitSnapshot(const Snapshot &s){
 try{
  LONG run=InterlockedIncrement(&Run);DWORD via=s.caller>=Image&&s.caller<ImageEnd?s.caller-(DWORD)Image:0;
  Msg::Log("ToMe_ADVHD_INPUT begin run=%lu via=%lx height=%lu words=11 bytes=%d args=%lx,%lx,%lx,%lx,%lx,%lx,%lx,%lx,%lx,%lx,%lx",(unsigned long)run,(unsigned long)via,(unsigned long)s.height,s.bytes,(unsigned long)s.args[0],(unsigned long)s.args[1],(unsigned long)s.args[2],(unsigned long)s.args[3],(unsigned long)s.args[4],(unsigned long)s.args[5],(unsigned long)s.args[6],(unsigned long)s.args[7],(unsigned long)s.args[8],(unsigned long)s.args[9],(unsigned long)s.args[10]);
  for(int offset=0;offset<s.bytes;offset+=ChunkBytes){char hex[ChunkBytes*2+1];int n=s.bytes-offset;if(n>ChunkBytes)n=ChunkBytes;const char digits[]="0123456789abcdef";for(int j=0;j<n;j++){unsigned b=(unsigned char)s.text[offset+j];hex[j*2]=digits[b>>4];hex[j*2+1]=digits[b&15];}hex[n*2]=0;
   Msg::Log("ToMe_ADVHD_INPUT data run=%lu offset=%d hex=%s",(unsigned long)run,offset,hex);}
  Msg::Log("ToMe_ADVHD_INPUT end run=%lu bytes=%d",(unsigned long)run,s.bytes);
 }catch(...){}
}
static void Observe(DWORD height,const DWORD *stack){
 if(!InterlockedCompareExchange(&Observing,0,0)||InObserver)return;InObserver=true;
 __try{Snapshot s;if(Capture(height,stack,&s))EmitSnapshot(s);}__except(EXCEPTION_EXECUTE_HANDLER){}InObserver=false;
}
static __declspec(naked) void Gate(){
 __asm{
  pushfd
  pushad
  mov ebx,esp
  sub esp,527
  and esp,0xfffffff0
  fxsave [esp]
  fninit
  ldmxcsr ObserverMxcsr
  cld
  lea ecx,[ebx+36]
  push ecx
  push dword ptr [ebx+28]
  call Observe
  add esp,8
  fxrstor [esp]
  mov esp,ebx
  popad
  popfd
  jmp dword ptr [Original]
 }
}
static bool VerifyFileBuild(const wchar_t *file){
 HANDLE h=CreateFileW(file,GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,0,nullptr);if(h==INVALID_HANDLE_VALUE)return false;
 LARGE_INTEGER size;bool ok=GetFileSizeEx(h,&size)&&size.QuadPart==AdvhdDrawSig::FileBytes;HCRYPTPROV provider=0;HCRYPTHASH hash=0;
 if(ok)ok=CryptAcquireContextW(&provider,nullptr,nullptr,PROV_RSA_AES,CRYPT_VERIFYCONTEXT)&&CryptCreateHash(provider,CALG_SHA_256,0,0,&hash);
 unsigned char buffer[16384],digest[32];DWORD got=0,total=0;
 while(ok){if(!ReadFile(h,buffer,sizeof buffer,&got,nullptr)){ok=false;break;}if(!got)break;total+=got;if(total>AdvhdDrawSig::FileBytes||!CryptHashData(hash,buffer,got,0)){ok=false;break;}}
 DWORD bytes=sizeof digest;if(ok)ok=total==AdvhdDrawSig::FileBytes&&CryptGetHashParam(hash,HP_HASHVAL,digest,&bytes,0)&&bytes==sizeof digest;
 if(ok){char hex[65];const char digits[]="0123456789abcdef";for(int i=0;i<32;i++){hex[2*i]=digits[digest[i]>>4];hex[2*i+1]=digits[digest[i]&15];}hex[64]=0;ok=!std::strcmp(hex,AdvhdDrawSig::Sha256);}
 if(hash)CryptDestroyHash(hash);if(provider)CryptReleaseContext(provider,0);CloseHandle(h);return ok;
}
static bool FindInImage(uintptr_t base){
 VersionPinned=false;DrawAt=0;
 auto dos=(IMAGE_DOS_HEADER *)base;if(dos->e_magic!=IMAGE_DOS_SIGNATURE)return false;auto nt=(IMAGE_NT_HEADERS *)(base+dos->e_lfanew);if(nt->Signature!=IMAGE_NT_SIGNATURE||nt->FileHeader.Machine!=IMAGE_FILE_MACHINE_I386)return false;
 auto section=IMAGE_FIRST_SECTION(nt);int total=0;uintptr_t found=0;
 for(int i=0;i<nt->FileHeader.NumberOfSections;i++,section++)if(section->Characteristics&IMAGE_SCN_MEM_EXECUTE){size_t sites[2];int n=AdvhdDrawSig::Find((const unsigned char *)(base+section->VirtualAddress),section->Misc.VirtualSize,sites,2);if(n&&!total)found=base+section->VirtualAddress+sites[0];total+=n;}
 if(total!=1||found-base!=AdvhdDrawSig::EntryRva)return false;wchar_t file[32768];DWORD n=GetModuleFileNameW((HMODULE)base,file,32768);if(!n||n>=32768||!VerifyFileBuild(file))return false;
 Image=base;ImageEnd=base+nt->OptionalHeader.SizeOfImage;DrawAt=found;VersionPinned=true;return true;
}
static bool Token(const std::string &cfg,const char *word){size_t p=cfg.find(word),n=std::strlen(word);return p!=std::string::npos&&(p==0||cfg[p-1]==' ')&&(p+n==cfg.size()||cfg[p+n]==' ');}
static bool DiagnosticAsked(){
 wchar_t tmp[MAX_PATH],file[MAX_PATH+64];DWORD n=GetTempPathW(MAX_PATH,tmp);if(!n||n>=MAX_PATH)return false;swprintf_s(file,L"%sMeguLit\\draw\\%lu.txt",tmp,GetCurrentProcessId());
 HANDLE h=CreateFileW(file,GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,0,nullptr);if(h==INVALID_HANDLE_VALUE)return false;
 char bytes[1024]={};DWORD got=0;bool ok=ReadFile(h,bytes,sizeof bytes-1,&got,nullptr)!=FALSE;CloseHandle(h);if(!ok)return false;std::string ascii;for(DWORD i=0;i<got;i++)if(bytes[i])ascii+=bytes[i];
 size_t p=ascii.find("#cfg ");if(p==std::string::npos)return false;size_t end=ascii.find_first_of("\r\n",p);return Token(ascii.substr(p,end==std::string::npos?end:end-p),"advhdInput=1");
}
static bool Install(){
 if(Installed)return true;if(!VersionPinned||!DrawAt)return false;
 if(MH_CreateHook((void *)DrawAt,(void *)&Gate,&Original)!=MH_OK)return false;
 if(MH_EnableHook((void *)DrawAt)!=MH_OK){MH_RemoveHook((void *)DrawAt);Original=nullptr;return false;}
 InterlockedExchange(&Installed,1);Msg::Log("ToMe_ADVHD_INPUT on rva=%lx diagnostic=1",(unsigned long)(DrawAt-Image));return true;
}
static void RefreshControl(){if(DiagnosticAsked()){if(Install())InterlockedExchange(&Observing,1);}else InterlockedExchange(&Observing,0);}
static DWORD WINAPI Watch(void *stop){for(;;){RefreshControl();if(stop){if(WaitForSingleObject((HANDLE)stop,2000)==WAIT_OBJECT_0)return 0;}else Sleep(2000);}}
static void Arm(){if(InterlockedExchange(&Armed,1))return;__try{if(!FindInImage((uintptr_t)GetModuleHandleA(nullptr)))return;}__except(EXCEPTION_EXECUTE_HANDLER){return;}HANDLE thread=CreateThread(nullptr,0,Watch,nullptr,0,nullptr);if(thread)CloseHandle(thread);}
}
#else
namespace AdvhdDraw { static void Arm() {} }
#endif
