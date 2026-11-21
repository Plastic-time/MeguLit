// SPDX-License-Identifier: GPL-3.0-or-later
// Single-build raw input diagnostics; both verified entries are required, with no role or render output.
#pragma once
#ifndef _WIN64
#include <windows.h>
#include <wincrypt.h>
#include <cstdio>
#include <cstring>
#include <string>
#include "MinHook.h"
#include "CmvsDrawSig.h"
#pragma comment(lib,"advapi32.lib")
namespace CmvsDraw {
static void *Original0=nullptr,*Original1=nullptr;
static uintptr_t Image=0,ImageEnd=0,DrawAt[2]={};
static bool VersionPinned=false;
static volatile LONG Armed=0,Installed=0,Observing=0,Blocked=0,Run=0;
static __declspec(thread) bool InObserver=false;
static const DWORD ObserverMxcsr=0x1f80;
static const int MaxText=32768,ChunkBytes=128;
struct Snapshot{DWORD entry,self,caller,args[2];int bytes;char text[MaxText+1];};
static bool Capture(DWORD entry,DWORD self,const DWORD *stack,Snapshot *out){
 __try{if(entry>=2||!stack||!out)return false;out->entry=entry;out->self=self;out->caller=stack[0];out->args[0]=stack[1];out->args[1]=stack[2];
  const char *text=(const char *)out->args[0];if(!text)return false;
  int n=0;while(n<MaxText&&text[n]){out->text[n]=text[n];n++;}if(n==MaxText&&text[n])return false;out->text[n]=0;out->bytes=n;return true;
 }__except(EXCEPTION_EXECUTE_HANDLER){return false;}
}
static void EmitSnapshot(const Snapshot &s){
 try{LONG run=InterlockedIncrement(&Run);DWORD via=s.caller>=Image&&s.caller<ImageEnd?s.caller-(DWORD)Image:0;
  Msg::Log("ToMe_CMVS_INPUT begin run=%lu entry=%lx via=%lx this=%lx words=2 bytes=%d args=%lx,%lx",(unsigned long)run,(unsigned long)CmvsDrawSig::Entries[s.entry].rva,(unsigned long)via,(unsigned long)s.self,s.bytes,(unsigned long)s.args[0],(unsigned long)s.args[1]);
  for(int offset=0;offset<s.bytes;offset+=ChunkBytes){char hex[ChunkBytes*2+1];int n=s.bytes-offset;if(n>ChunkBytes)n=ChunkBytes;const char digits[]="0123456789abcdef";for(int j=0;j<n;j++){unsigned b=(unsigned char)s.text[offset+j];hex[j*2]=digits[b>>4];hex[j*2+1]=digits[b&15];}hex[n*2]=0;
   Msg::Log("ToMe_CMVS_INPUT data run=%lu offset=%d hex=%s",(unsigned long)run,offset,hex);}
  Msg::Log("ToMe_CMVS_INPUT end run=%lu bytes=%d",(unsigned long)run,s.bytes);
 }catch(...){}
}
static void Observe(DWORD entry,DWORD self,const DWORD *stack){
 if(!InterlockedCompareExchange(&Observing,0,0)||InObserver)return;InObserver=true;
 __try{Snapshot s;if(Capture(entry,self,stack,&s))EmitSnapshot(s);}__except(EXCEPTION_EXECUTE_HANDLER){}InObserver=false;
}
// ECX is the this input; the originals consume two stack words with ret 8 and own their EAX returns.
static __declspec(naked) void Gate0(){__asm{
 pushfd
 pushad
 mov ebx,esp
 sub esp,527
 and esp,0xfffffff0
 fxsave [esp]
 fninit
 ldmxcsr ObserverMxcsr
 cld
 lea eax,[ebx+36]
 push eax
 push dword ptr [ebx+24]
 push 0
 call Observe
 add esp,12
 fxrstor [esp]
 mov esp,ebx
 popad
 popfd
 jmp dword ptr [Original0]
}}
static __declspec(naked) void Gate1(){__asm{
 pushfd
 pushad
 mov ebx,esp
 sub esp,527
 and esp,0xfffffff0
 fxsave [esp]
 fninit
 ldmxcsr ObserverMxcsr
 cld
 lea eax,[ebx+36]
 push eax
 push dword ptr [ebx+24]
 push 1
 call Observe
 add esp,12
 fxrstor [esp]
 mov esp,ebx
 popad
 popfd
 jmp dword ptr [Original1]
}}
static bool VerifyFileBuild(const wchar_t *file){
 HANDLE h=CreateFileW(file,GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,0,nullptr);if(h==INVALID_HANDLE_VALUE)return false;
 LARGE_INTEGER size;bool ok=GetFileSizeEx(h,&size)&&size.QuadPart==CmvsDrawSig::FileBytes;HCRYPTPROV provider=0;HCRYPTHASH hash=0;
 if(ok)ok=CryptAcquireContextW(&provider,nullptr,nullptr,PROV_RSA_AES,CRYPT_VERIFYCONTEXT)&&CryptCreateHash(provider,CALG_SHA_256,0,0,&hash);
 unsigned char buffer[16384],digest[32];DWORD got=0,total=0;
 while(ok){if(!ReadFile(h,buffer,sizeof buffer,&got,nullptr)){ok=false;break;}if(!got)break;total+=got;if(total>CmvsDrawSig::FileBytes||!CryptHashData(hash,buffer,got,0)){ok=false;break;}}
 DWORD bytes=sizeof digest;if(ok)ok=total==CmvsDrawSig::FileBytes&&CryptGetHashParam(hash,HP_HASHVAL,digest,&bytes,0)&&bytes==sizeof digest;
 if(ok){char hex[65];const char digits[]="0123456789abcdef";for(int i=0;i<32;i++){hex[2*i]=digits[digest[i]>>4];hex[2*i+1]=digits[digest[i]&15];}hex[64]=0;ok=!std::strcmp(hex,CmvsDrawSig::Sha256);}
 if(hash)CryptDestroyHash(hash);if(provider)CryptReleaseContext(provider,0);CloseHandle(h);return ok;
}
static bool FindInImage(uintptr_t base){
 VersionPinned=false;DrawAt[0]=DrawAt[1]=0;
 wchar_t file[32768];DWORD n=GetModuleFileNameW((HMODULE)base,file,32768);if(!n||n>=32768||!VerifyFileBuild(file))return false;
 MEMORY_BASIC_INFORMATION region={};if(!VirtualQuery((void *)base,&region,sizeof region)||region.AllocationBase!=(void *)base||region.Type!=MEM_IMAGE||region.RegionSize<sizeof(IMAGE_NT_HEADERS))return false;
 auto dos=(IMAGE_DOS_HEADER *)base;if(dos->e_magic!=IMAGE_DOS_SIGNATURE||dos->e_lfanew<sizeof(IMAGE_DOS_HEADER)||(size_t)dos->e_lfanew>region.RegionSize-sizeof(IMAGE_NT_HEADERS))return false;
 auto nt=(IMAGE_NT_HEADERS *)(base+dos->e_lfanew);if(nt->Signature!=IMAGE_NT_SIGNATURE||nt->FileHeader.Machine!=IMAGE_FILE_MACHINE_I386||nt->OptionalHeader.Magic!=IMAGE_NT_OPTIONAL_HDR32_MAGIC||nt->FileHeader.SizeOfOptionalHeader<sizeof(IMAGE_OPTIONAL_HEADER32))return false;
 size_t imageBytes=nt->OptionalHeader.SizeOfImage,headers=nt->OptionalHeader.SizeOfHeaders;if(imageBytes<headers||imageBytes>64*1024*1024||headers>region.RegionSize||!nt->FileHeader.NumberOfSections||nt->FileHeader.NumberOfSections>96)return false;
 auto sections=IMAGE_FIRST_SECTION(nt);size_t offset=(uintptr_t)sections-base;if(offset>headers||nt->FileHeader.NumberOfSections>(headers-offset)/sizeof(IMAGE_SECTION_HEADER))return false;
 uintptr_t found[2]={};int total[2]={};
 for(int j=0;j<nt->FileHeader.NumberOfSections;j++){auto s=sections+j;if(s->VirtualAddress>imageBytes||s->Misc.VirtualSize>imageBytes-s->VirtualAddress)return false;if(!(s->Characteristics&IMAGE_SCN_MEM_EXECUTE))continue;
  for(int i=0;i<2;i++){size_t at[2];int hits=CmvsDrawSig::Find(i,(const unsigned char *)(base+s->VirtualAddress),s->Misc.VirtualSize,at,2);if(hits&&!total[i])found[i]=base+s->VirtualAddress+at[0];total[i]+=hits;}}
 uintptr_t rvas[2]={found[0]-base,found[1]-base};if(!CmvsDrawSig::ValidPair(total,rvas))return false;
 Image=base;ImageEnd=base+imageBytes;DrawAt[0]=found[0];DrawAt[1]=found[1];VersionPinned=true;return true;
}
static bool Token(const std::string &cfg,const char *word){size_t p=cfg.find(word),n=std::strlen(word);return p!=std::string::npos&&(p==0||cfg[p-1]==' ')&&(p+n==cfg.size()||cfg[p+n]==' ');}
static bool DiagnosticAsked(){
 wchar_t tmp[MAX_PATH],file[MAX_PATH+64];DWORD n=GetTempPathW(MAX_PATH,tmp);if(!n||n>=MAX_PATH)return false;swprintf_s(file,L"%sMeguLit\\draw\\%lu.txt",tmp,GetCurrentProcessId());
 HANDLE h=CreateFileW(file,GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,0,nullptr);if(h==INVALID_HANDLE_VALUE)return false;
 char bytes[1024]={};DWORD got=0;bool ok=ReadFile(h,bytes,sizeof bytes-1,&got,nullptr)!=FALSE;CloseHandle(h);if(!ok)return false;std::string ascii;for(DWORD i=0;i<got;i++)if(bytes[i])ascii+=bytes[i];
 size_t p=ascii.find("#cfg ");if(p==std::string::npos)return false;size_t end=ascii.find_first_of("\r\n",p);return Token(ascii.substr(p,end==std::string::npos?end:end-p),"cmvsInput=1");
}
static bool Install(){
 if(Installed)return true;if(Blocked||!VersionPinned||!DrawAt[0]||!DrawAt[1]||DrawAt[0]==DrawAt[1])return false;
 void *detours[2]={(void *)&Gate0,(void *)&Gate1};void **originals[2]={&Original0,&Original1};int created=0;bool enableAttempted=false;
 for(int i=0;i<2;i++){if(MH_CreateHook((void *)DrawAt[i],detours[i],originals[i])!=MH_OK)goto failed;created++;}
 for(int i=0;i<2;i++){enableAttempted=true;if(MH_EnableHook((void *)DrawAt[i])!=MH_OK)goto failed;}
 InterlockedExchange(&Installed,1);Msg::Log("ToMe_CMVS_INPUT on entries=2 diagnostic=1");return true;
failed:
 InterlockedExchange(&Observing,0);
 // An enable error may leave an in-flight pass-through gate. Retain its trampoline and forbid retry.
 if(enableAttempted){InterlockedExchange(&Blocked,1);for(int i=0;i<created;i++)MH_DisableHook((void *)DrawAt[i]);return false;}
 for(int i=0;i<created;i++)if(MH_RemoveHook((void *)DrawAt[i])!=MH_OK){InterlockedExchange(&Blocked,1);return false;}
 Original0=Original1=nullptr;return false;
}
static void RefreshControl(){if(DiagnosticAsked()){if(Install())InterlockedExchange(&Observing,1);}else InterlockedExchange(&Observing,0);}
static DWORD WINAPI Watch(void *stop){for(;;){RefreshControl();if(stop){if(WaitForSingleObject((HANDLE)stop,2000)==WAIT_OBJECT_0)return 0;}else Sleep(2000);}}
static void Arm(){if(InterlockedExchange(&Armed,1))return;__try{if(!FindInImage((uintptr_t)GetModuleHandleA(nullptr)))return;}__except(EXCEPTION_EXECUTE_HANDLER){return;}HANDLE thread=CreateThread(nullptr,0,Watch,nullptr,0,nullptr);if(thread)CloseHandle(thread);}
}
#else
namespace CmvsDraw { static void Arm() {} }
#endif
