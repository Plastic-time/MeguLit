// SPDX-License-Identifier: GPL-3.0-or-later
// Exact English-build input diagnostics only. No text replacement, role or reader-source output.
#pragma once
#ifndef _WIN64
#include <windows.h>
#include <wincrypt.h>
#include <cstdio>
#include <cstring>
#include "MinHook.h"
#include "MinoriInputSig.h"
#pragma comment(lib,"advapi32.lib")
namespace MinoriInput {
static void *Original=nullptr;
static uintptr_t Image=0,ImageEnd=0,InputAt=0,NodeVtable=0;
static bool VersionPinned=false;
static volatile LONG Armed=0,Installed=0,Blocked=0,Permission=0,Run=0;
static __declspec(thread) bool InObserver=false;
static const DWORD ObserverMxcsr=0x1f80;
static const int MaxText=32768,ChunkBytes=128;
struct Snapshot{DWORD node,caller,arg,cursorBefore,capacity;int bytes;unsigned long long hash;char text[MaxText+1];};
static LONG Ticket(){return InterlockedCompareExchange(&Permission,0,0);}
static bool Allowed(LONG t){return (t&1)&&Ticket()==t;}
static void SetPermission(bool on){for(;;){LONG old=Ticket();if(((old&1)!=0)==on)return;if(InterlockedCompareExchange(&Permission,(LONG)((ULONG)old+1),old)==old)return;}}
static bool Capture(DWORD node,const DWORD *stack,Snapshot *out){
 __try{if(!node||!stack||!out||!NodeVtable||*(uintptr_t *)node!=NodeVtable)return false;
  out->node=node;out->caller=stack[0];out->arg=stack[1];out->cursorBefore=*(DWORD *)(node+MinoriInputSig::CursorOffset);
  const unsigned char *arg=(const unsigned char *)out->arg;if(!arg)return false;
  DWORD length=*(const DWORD *)(arg+MinoriInputSig::LengthOffset),capacity=*(const DWORD *)(arg+MinoriInputSig::CapacityOffset);
  if(length>MaxText||length>capacity||(capacity<16&&capacity!=15))return false;
  const char *text=capacity<16?(const char *)arg:*(const char *const *)arg;if(!text||text[length])return false;
  unsigned long long h=14695981039346656037ull;for(DWORD n=0;n<length;n++){unsigned char c=(unsigned char)text[n];out->text[n]=(char)c;h=(h^c)*1099511628211ull;}
  if(*(const DWORD *)(arg+16)!=length||*(const DWORD *)(arg+20)!=capacity||(capacity>=16&&*(const char *const *)arg!=text)||text[length])return false;
  out->text[length]=0;out->bytes=(int)length;out->capacity=capacity;out->hash=h;return true;
 }__except(EXCEPTION_EXECUTE_HANDLER){return false;}
}
static void EmitSnapshot(const Snapshot &s,LONG ticket){
 try{if(!Allowed(ticket))return;LONG run=InterlockedIncrement(&Run);DWORD via=s.caller>=Image&&s.caller<ImageEnd?s.caller-(DWORD)Image:0;
  Msg::Log("ToMe_MINORI_INPUT begin run=%lu epoch=%lu phase=pre build=en entry=10d4b0 via=%lx node=%lx cursorBefore=%lx arg=%lx capacity=%lu bytes=%d fnv64=%016llx",(unsigned long)run,(unsigned long)ticket,(unsigned long)via,(unsigned long)s.node,(unsigned long)s.cursorBefore,(unsigned long)s.arg,(unsigned long)s.capacity,s.bytes,s.hash);
  for(int offset=0;offset<s.bytes;offset+=ChunkBytes){if(!Allowed(ticket))return;char hex[ChunkBytes*2+1];int n=s.bytes-offset;if(n>ChunkBytes)n=ChunkBytes;const char digits[]="0123456789abcdef";
   for(int j=0;j<n;j++){unsigned b=(unsigned char)s.text[offset+j];hex[j*2]=digits[b>>4];hex[j*2+1]=digits[b&15];}hex[n*2]=0;
   Msg::Log("ToMe_MINORI_INPUT data run=%lu epoch=%lu offset=%d hex=%s",(unsigned long)run,(unsigned long)ticket,offset,hex);}
  if(Allowed(ticket))Msg::Log("ToMe_MINORI_INPUT end run=%lu epoch=%lu bytes=%d",(unsigned long)run,(unsigned long)ticket,s.bytes);
 }catch(...){}
}
static void ObserveSafe(DWORD node,const DWORD *stack,LONG ticket){
 __try{Snapshot s;if(Capture(node,stack,&s)&&Allowed(ticket))EmitSnapshot(s,ticket);}__except(EXCEPTION_EXECUTE_HANDLER){}
}
static void Observe(DWORD node,const DWORD *stack){
 LONG ticket=Ticket();if(!(ticket&1)||InObserver)return;InObserver=true;
 __try{ObserveSafe(node,stack,ticket);}__finally{InObserver=false;}
}
// ECX=this, one string-object pointer, original ret 4. Snapshot before the original can reuse/free an alias.
static __declspec(naked) void Gate(){__asm{
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
 call Observe
 add esp,8
 fxrstor [esp]
 mov esp,ebx
 popad
 popfd
 jmp dword ptr [Original]
}}
static bool VerifyFileBuild(const wchar_t *file){
 HANDLE h=CreateFileW(file,GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,0,nullptr);if(h==INVALID_HANDLE_VALUE)return false;
 LARGE_INTEGER size;bool ok=GetFileSizeEx(h,&size)&&size.QuadPart==MinoriInputSig::FileBytes;HCRYPTPROV provider=0;HCRYPTHASH hash=0;
 if(ok)ok=CryptAcquireContextW(&provider,nullptr,nullptr,PROV_RSA_AES,CRYPT_VERIFYCONTEXT)&&CryptCreateHash(provider,CALG_SHA_256,0,0,&hash);
 unsigned char buffer[16384],digest[32];DWORD got=0,total=0;
 while(ok){if(!ReadFile(h,buffer,sizeof buffer,&got,nullptr)){ok=false;break;}if(!got)break;total+=got;if(total>MinoriInputSig::FileBytes||!CryptHashData(hash,buffer,got,0)){ok=false;break;}}
 DWORD bytes=sizeof digest;if(ok)ok=total==MinoriInputSig::FileBytes&&CryptGetHashParam(hash,HP_HASHVAL,digest,&bytes,0)&&bytes==sizeof digest;
 if(ok){char hex[65];const char digits[]="0123456789abcdef";for(int i=0;i<32;i++){hex[2*i]=digits[digest[i]>>4];hex[2*i+1]=digits[digest[i]&15];}hex[64]=0;ok=!std::strcmp(hex,MinoriInputSig::Sha256);}
 if(hash)CryptDestroyHash(hash);if(provider)CryptReleaseContext(provider,0);CloseHandle(h);return ok;
}
static bool FindInImage(uintptr_t base){
 VersionPinned=false;InputAt=0;NodeVtable=0;
 wchar_t file[32768];DWORD n=GetModuleFileNameW((HMODULE)base,file,32768);if(!n||n>=32768||!VerifyFileBuild(file))return false;
 MEMORY_BASIC_INFORMATION region={};if(!VirtualQuery((void *)base,&region,sizeof region)||region.AllocationBase!=(void *)base||region.Type!=MEM_IMAGE||region.RegionSize<sizeof(IMAGE_NT_HEADERS))return false;
 auto dos=(IMAGE_DOS_HEADER *)base;if(dos->e_magic!=IMAGE_DOS_SIGNATURE||dos->e_lfanew<sizeof(IMAGE_DOS_HEADER)||(size_t)dos->e_lfanew>region.RegionSize-sizeof(IMAGE_NT_HEADERS))return false;
 auto nt=(IMAGE_NT_HEADERS *)(base+dos->e_lfanew);if(nt->Signature!=IMAGE_NT_SIGNATURE||nt->FileHeader.Machine!=IMAGE_FILE_MACHINE_I386||nt->OptionalHeader.Magic!=IMAGE_NT_OPTIONAL_HDR32_MAGIC||nt->FileHeader.SizeOfOptionalHeader<sizeof(IMAGE_OPTIONAL_HEADER32))return false;
 size_t imageBytes=nt->OptionalHeader.SizeOfImage,headers=nt->OptionalHeader.SizeOfHeaders;if(imageBytes<headers||imageBytes>64*1024*1024||headers>region.RegionSize||!nt->FileHeader.NumberOfSections||nt->FileHeader.NumberOfSections>96)return false;
 auto sections=IMAGE_FIRST_SECTION(nt);size_t off=(uintptr_t)sections-base;if(off>headers||nt->FileHeader.NumberOfSections>(headers-off)/sizeof(IMAGE_SECTION_HEADER))return false;
 uintptr_t found=0;int total=0;
 for(int j=0;j<nt->FileHeader.NumberOfSections;j++){auto s=sections+j;if(s->VirtualAddress>imageBytes||s->Misc.VirtualSize>imageBytes-s->VirtualAddress)return false;if(!(s->Characteristics&IMAGE_SCN_MEM_EXECUTE))continue;
  size_t at[2];int hits=MinoriInputSig::Find((const unsigned char *)(base+s->VirtualAddress),s->Misc.VirtualSize,at,2);if(hits&&!total)found=base+s->VirtualAddress+at[0];total+=hits;}
 if(total!=1||found-base!=MinoriInputSig::EntryRva||MinoriInputSig::VtableRva+0x54>imageBytes||!MinoriInputSig::Layout((const unsigned char *)base,imageBytes))return false;
 uintptr_t vt=base+MinoriInputSig::VtableRva;if(*(uintptr_t *)(vt+0x3c)!=found||*(uintptr_t *)(vt+8)!=base+0x10d0d0||*(uintptr_t *)(vt+0x50)!=base+0x10e0d0)return false;
 Image=base;ImageEnd=base+imageBytes;InputAt=found;NodeVtable=vt;VersionPinned=true;return true;
}
static bool DiagnosticAsked(){
 wchar_t tmp[MAX_PATH],file[MAX_PATH+64];DWORD n=GetTempPathW(MAX_PATH,tmp);if(!n||n>=MAX_PATH)return false;swprintf_s(file,L"%sMeguLit\\draw\\%lu.txt",tmp,GetCurrentProcessId());
 HANDLE h=CreateFileW(file,GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,0,nullptr);if(h==INVALID_HANDLE_VALUE)return false;
 unsigned char b[1024];DWORD got=0;bool ok=ReadFile(h,b,sizeof b,&got,nullptr)!=FALSE;CloseHandle(h);return ok&&MinoriInputSig::ConfigAsked(b,got);
}
static bool Install(){
 if(Installed)return true;if(Blocked||!VersionPinned||!InputAt)return false;
 if(MH_CreateHook((void *)InputAt,(void *)&Gate,&Original)!=MH_OK){InterlockedExchange(&Blocked,1);return false;}
 if(MH_EnableHook((void *)InputAt)!=MH_OK){SetPermission(false);InterlockedExchange(&Blocked,1);MH_DisableHook((void *)InputAt);return false;}
 InterlockedExchange(&Installed,1);return true;
}
static void RefreshControl(){__try{SetPermission(DiagnosticAsked()&&Install());}__except(EXCEPTION_EXECUTE_HANDLER){SetPermission(false);}}
static DWORD WINAPI Watch(void *stop){for(;;){RefreshControl();if(stop){if(WaitForSingleObject((HANDLE)stop,2000)==WAIT_OBJECT_0){SetPermission(false);return 0;}}else Sleep(2000);}}
static void Arm(){if(InterlockedExchange(&Armed,1))return;__try{if(!FindInImage((uintptr_t)GetModuleHandleA(nullptr)))return;}__except(EXCEPTION_EXECUTE_HANDLER){return;}HANDLE thread=CreateThread(nullptr,0,Watch,nullptr,0,nullptr);if(thread)CloseHandle(thread);}
}
#else
namespace MinoriInput {static void Arm(){}}
#endif
