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
static volatile LONG Armed=0,Installed=0,Observing=0,Permission=0,Blocked=0,Run=0;
static __declspec(thread) bool InObserver=false;
static const DWORD ObserverMxcsr=0x1f80;
static const int MaxText=32768,ChunkBytes=128;
struct Snapshot{DWORD height,caller,args[AdvhdDrawSig::StackWords];int bytes;char text[MaxText+1];};
static LONG Ticket(){return InterlockedCompareExchange(&Permission,0,0);}
static bool Allowed(LONG ticket){return (ticket&1)&&Ticket()==ticket;}
static void SetPermission(bool on){for(;;){LONG old=Ticket();if(((old&1)!=0)==on)break;if(InterlockedCompareExchange(&Permission,(LONG)((ULONG)old+1),old)==old)break;}InterlockedExchange(&Observing,(Ticket()&1)!=0);}
static bool Capture(DWORD height,const DWORD *stack,Snapshot *out){
 __try{if(!stack||!out)return false;out->height=height;out->caller=stack[0];for(unsigned i=0;i<AdvhdDrawSig::StackWords;i++)out->args[i]=stack[i+1];
  const char *text=(const char *)out->args[AdvhdDrawSig::TextArg-1];if(!text)return false;
  int n=0;while(n<MaxText&&text[n]){out->text[n]=text[n];n++;}if(n==MaxText&&text[n])return false;out->text[n]=0;out->bytes=n;return true;
 }__except(EXCEPTION_EXECUTE_HANDLER){return false;}
}
static void EmitSnapshot(const Snapshot &s,LONG ticket){
 try{
  if(!Allowed(ticket))return;
  LONG run=InterlockedIncrement(&Run);DWORD via=s.caller>=Image&&s.caller<ImageEnd?s.caller-(DWORD)Image:0;
  Msg::Log("ToMe_ADVHD_INPUT begin run=%lu epoch=%lu via=%lx height=%lu words=11 bytes=%d args=%lx,%lx,%lx,%lx,%lx,%lx,%lx,%lx,%lx,%lx,%lx",(unsigned long)run,(unsigned long)ticket,(unsigned long)via,(unsigned long)s.height,s.bytes,(unsigned long)s.args[0],(unsigned long)s.args[1],(unsigned long)s.args[2],(unsigned long)s.args[3],(unsigned long)s.args[4],(unsigned long)s.args[5],(unsigned long)s.args[6],(unsigned long)s.args[7],(unsigned long)s.args[8],(unsigned long)s.args[9],(unsigned long)s.args[10]);
  for(int offset=0;offset<s.bytes;offset+=ChunkBytes){if(!Allowed(ticket))return;char hex[ChunkBytes*2+1];int n=s.bytes-offset;if(n>ChunkBytes)n=ChunkBytes;const char digits[]="0123456789abcdef";for(int j=0;j<n;j++){unsigned b=(unsigned char)s.text[offset+j];hex[j*2]=digits[b>>4];hex[j*2+1]=digits[b&15];}hex[n*2]=0;
   Msg::Log("ToMe_ADVHD_INPUT data run=%lu epoch=%lu offset=%d hex=%s",(unsigned long)run,(unsigned long)ticket,offset,hex);}
  if(Allowed(ticket))Msg::Log("ToMe_ADVHD_INPUT end run=%lu epoch=%lu bytes=%d",(unsigned long)run,(unsigned long)ticket,s.bytes);
 }catch(...){}
}
static void ObserveSafe(DWORD height,const DWORD *stack,LONG ticket){
 __try{Snapshot s;if(Capture(height,stack,&s)&&Allowed(ticket))EmitSnapshot(s,ticket);}__except(EXCEPTION_EXECUTE_HANDLER){}
}
static void Observe(DWORD height,const DWORD *stack){
 LONG ticket=Ticket();if(!(ticket&1)||InObserver)return;InObserver=true;
 __try{ObserveSafe(height,stack,ticket);}__finally{InObserver=false;}
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
 wchar_t file[32768];DWORD n=GetModuleFileNameW((HMODULE)base,file,32768);if(!n||n>=32768||!VerifyFileBuild(file))return false;
 MEMORY_BASIC_INFORMATION region={};if(!VirtualQuery((void *)base,&region,sizeof region)||region.AllocationBase!=(void *)base||region.Type!=MEM_IMAGE||region.RegionSize<sizeof(IMAGE_NT_HEADERS))return false;
 auto dos=(IMAGE_DOS_HEADER *)base;if(dos->e_magic!=IMAGE_DOS_SIGNATURE||dos->e_lfanew<sizeof(IMAGE_DOS_HEADER)||(size_t)dos->e_lfanew>region.RegionSize-sizeof(IMAGE_NT_HEADERS))return false;
 auto nt=(IMAGE_NT_HEADERS *)(base+dos->e_lfanew);if(nt->Signature!=IMAGE_NT_SIGNATURE||nt->FileHeader.Machine!=IMAGE_FILE_MACHINE_I386||nt->OptionalHeader.Magic!=IMAGE_NT_OPTIONAL_HDR32_MAGIC||nt->FileHeader.SizeOfOptionalHeader<sizeof(IMAGE_OPTIONAL_HEADER32))return false;
 size_t imageBytes=nt->OptionalHeader.SizeOfImage,headers=nt->OptionalHeader.SizeOfHeaders;if(imageBytes<headers||imageBytes>64*1024*1024||headers>region.RegionSize||!nt->FileHeader.NumberOfSections||nt->FileHeader.NumberOfSections>96)return false;
 auto section=IMAGE_FIRST_SECTION(nt);int total=0;uintptr_t found=0;
 size_t offset=(uintptr_t)section-base;if(offset>headers||nt->FileHeader.NumberOfSections>(headers-offset)/sizeof(IMAGE_SECTION_HEADER))return false;
 for(int i=0;i<nt->FileHeader.NumberOfSections;i++,section++){if(section->VirtualAddress>imageBytes||section->Misc.VirtualSize>imageBytes-section->VirtualAddress)return false;if(section->Characteristics&IMAGE_SCN_MEM_EXECUTE){size_t sites[2];int n=AdvhdDrawSig::Find((const unsigned char *)(base+section->VirtualAddress),section->Misc.VirtualSize,sites,2);if(n&&!total)found=base+section->VirtualAddress+sites[0];total+=n;}}
 if(total!=1||found-base!=AdvhdDrawSig::EntryRva)return false;
 Image=base;ImageEnd=base+nt->OptionalHeader.SizeOfImage;DrawAt=found;VersionPinned=true;return true;
}
static bool ConfigAsked(const unsigned char *bytes,size_t size){
 if(!bytes||size<2)return false;size_t p=0;
 if(bytes[0]==0xff&&bytes[1]==0xfe)p=2;else if(bytes[1]!=0)return false;
 std::string line;bool complete=false;
 for(;p+2<=size;p+=2){unsigned c=bytes[p];if(bytes[p+1])return false;
  if(c=='\n'){complete=true;break;}if(c=='\r'){if(p+4>size||bytes[p+2]!='\n'||bytes[p+3])return false;complete=true;break;}
  if(c<0x20||c>0x7e)return false;line+=(char)c;
 }
 if(!complete||line.compare(0,5,"#cfg "))return false;
 int keys=0;bool enabled=false;for(size_t begin=5;begin<line.size();){while(begin<line.size()&&line[begin]==' ')begin++;size_t end=line.find(' ',begin);if(end==std::string::npos)end=line.size();
  std::string token=line.substr(begin,end-begin);if(token.compare(0,11,"advhdInput=")==0){keys++;enabled=token=="advhdInput=1";}else if(token=="advhdInput")return false;begin=end;
 }
 return keys==1&&enabled;
}
static bool DiagnosticAsked(){
 wchar_t tmp[MAX_PATH],file[MAX_PATH+64];DWORD n=GetTempPathW(MAX_PATH,tmp);if(!n||n>=MAX_PATH)return false;swprintf_s(file,L"%sMeguLit\\draw\\%lu.txt",tmp,GetCurrentProcessId());
 HANDLE h=CreateFileW(file,GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,0,nullptr);if(h==INVALID_HANDLE_VALUE)return false;
 unsigned char bytes[1024];DWORD got=0;bool ok=ReadFile(h,bytes,sizeof bytes,&got,nullptr)!=FALSE;CloseHandle(h);return ok&&ConfigAsked(bytes,got);
}
static bool Install(){
 if(Installed)return true;if(Blocked||!VersionPinned||!DrawAt)return false;
 if(MH_CreateHook((void *)DrawAt,(void *)&Gate,&Original)!=MH_OK){InterlockedExchange(&Blocked,1);return false;}
 if(MH_EnableHook((void *)DrawAt)!=MH_OK){SetPermission(false);InterlockedExchange(&Blocked,1);MH_DisableHook((void *)DrawAt);return false;}
 InterlockedExchange(&Installed,1);Msg::Log("ToMe_ADVHD_INPUT on rva=%lx diagnostic=1",(unsigned long)(DrawAt-Image));return true;
}
static void RefreshControlCpp(){try{SetPermission(DiagnosticAsked()&&Install());}catch(...){SetPermission(false);}}
static void RefreshControl(){__try{RefreshControlCpp();}__except(EXCEPTION_EXECUTE_HANDLER){SetPermission(false);}}
static DWORD WINAPI Watch(void *stop){for(;;){RefreshControl();if(stop){if(WaitForSingleObject((HANDLE)stop,2000)==WAIT_OBJECT_0){SetPermission(false);return 0;}}else Sleep(2000);}}
static void Arm(){if(InterlockedExchange(&Armed,1))return;__try{if(!FindInImage((uintptr_t)GetModuleHandleA(nullptr)))return;}__except(EXCEPTION_EXECUTE_HANDLER){return;}HANDLE thread=CreateThread(nullptr,0,Watch,nullptr,0,nullptr);if(thread)CloseHandle(thread);}
}
#else
namespace AdvhdDraw { static void Arm() {} }
#endif
