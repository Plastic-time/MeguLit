// SPDX-License-Identifier: GPL-3.0-or-later
// TEST2: suppress dialogue raster compositing after glyph metrics are calculated
// Never overwrite script strings or glyph cache; exact executable only
#include <wincrypt.h>
#include <cstring>
#include "MinHook.h"
#include "embed_util.h"
#include "ToMeTextPos.h"
#include "EuphoriaDrawFlow.h"
namespace EuphoriaHD474Draw {
static bool ExactFile() {
  wchar_t file[MAX_PATH] = {};
  if (!GetModuleFileNameW(nullptr, file, MAX_PATH)) return false;
  HMODULE adv = LoadLibraryW(L"advapi32.dll");
  if (!adv) return false;
  auto acquire = reinterpret_cast<decltype(&CryptAcquireContextW)>(GetProcAddress(adv,"CryptAcquireContextW"));
  auto create = reinterpret_cast<decltype(&CryptCreateHash)>(GetProcAddress(adv,"CryptCreateHash"));
  auto update = reinterpret_cast<decltype(&CryptHashData)>(GetProcAddress(adv,"CryptHashData"));
  auto finish = reinterpret_cast<decltype(&CryptGetHashParam)>(GetProcAddress(adv,"CryptGetHashParam"));
  auto destroy = reinterpret_cast<decltype(&CryptDestroyHash)>(GetProcAddress(adv,"CryptDestroyHash"));
  auto release = reinterpret_cast<decltype(&CryptReleaseContext)>(GetProcAddress(adv,"CryptReleaseContext"));
  HCRYPTPROV provider = 0; HCRYPTHASH hash = 0; HANDLE input = INVALID_HANDLE_VALUE;
  bool ok = acquire && create && update && finish && destroy && release;
  if(ok) ok = acquire(&provider,nullptr,nullptr,PROV_RSA_AES,CRYPT_VERIFYCONTEXT) && create(provider,CALG_SHA_256,0,0,&hash);
  if(ok) { input=CreateFileW(file,GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);ok=input!=INVALID_HANDLE_VALUE; }
  BYTE chunk[16384], digest[32]; DWORD count=0,size=sizeof(digest);
  while(ok) { if(!ReadFile(input,chunk,sizeof(chunk),&count,nullptr)){ok=false;break;}if(!count)break;ok=update(hash,chunk,count,0)!=FALSE; }
  if(ok)ok=finish(hash,HP_HASHVAL,digest,&size,0)&&size==32;
  static const BYTE expected[32]={0xe7,0x7a,0x11,0x48,0x6b,0x6d,0x94,0xa4,0x2f,0x9d,0x7d,0x39,0xfd,0x76,0x8b,0x4e,0x76,0x3f,0x16,0x3b,0x97,0x7d,0x3e,0xae,0xd9,0x4c,0xf9,0xe1,0x32,0x17,0xf9,0x95};
  if(ok)ok=std::memcmp(digest,expected,32)==0;
  if(input!=INVALID_HANDLE_VALUE)CloseHandle(input);
  if(hash)destroy(hash);if(provider)release(provider,0);FreeLibrary(adv);
  return ok;
}


// Source parsing arms only the following dialogue raster burst, never a later history redraw.
static volatile DWORD SourceAt=0,SourceThread=0;static volatile LONG SourceRevision=0;static volatile LONG SourcePending=0;static unsigned DialogueWidth=0,DialogueHeight=0;
static void ObserveSource(const std::string& text){static unsigned previous=0;static DWORD begunAt=0;SourceThread=GetCurrentThreadId();SourceAt=GetTickCount();InterlockedIncrement(&SourceRevision);SourcePending=1;unsigned token=ToMeTextPos::TextToken(text);if(token!=previous||SourceAt-begunAt>=650){previous=token;begunAt=SourceAt;ToMeTextPos::Begin(token);}}
// Exact 4283DF..4284AC loop: ESP is constant while 428473 calls the per-glyph renderer.
// The renderer saves 0x54 bytes including its return address, so its frame + 0x58 is loop ESP.
static thread_local EuphoriaDrawFlow::RasterScope DialogueScope;
static void* loopBeginOriginal=nullptr;static void* loopEndOriginal=nullptr;
static void __cdecl BeginLoop(const unsigned* frame){
 const char* text=reinterpret_cast<const char*>(frame[0x44/4]);
 const size_t bytes=text?strnlen(text,8001):0;
 DialogueScope.Begin(reinterpret_cast<uintptr_t>(frame),reinterpret_cast<uintptr_t>(text),bytes,
  (unsigned)SourceRevision,SourceAt,SourceThread,GetTickCount(),GetCurrentThreadId());
}
static void __cdecl EndLoop(const unsigned* frame){DialogueScope.End(reinterpret_cast<uintptr_t>(frame));}
static __declspec(naked) void LoopBeginGate(){__asm{
 pushfd
 pushad
 lea eax,[esp+36]
 push eax
 call BeginLoop
 add esp,4
 popad
 popfd
 jmp dword ptr [loopBeginOriginal]
}}
static __declspec(naked) void LoopEndGate(){__asm{
 pushfd
 pushad
 lea eax,[esp+36]
 push eax
 call EndLoop
 add esp,4
 popad
 popfd
 jmp dword ptr [loopEndOriginal]
}}
static void* original=nullptr;
static uintptr_t done=0x405b7e;
static bool __cdecl ShouldHide(uintptr_t caller,uintptr_t glyph,uintptr_t color,const unsigned* frame){
 if(caller!=0x428478 && glyph!=0x660c20)return false;
 if(caller!=0x428478&&caller!=0x404a18&&caller!=0x404afe&&caller!=0x4053e0&&caller!=0x40550e&&caller!=0x4055cd)return false;
 DWORD elapsed=GetTickCount()-SourceAt;
 const bool owned=caller==0x428478&&DialogueScope.Owns(reinterpret_cast<uintptr_t>(frame)+0x58,glyph,(unsigned)SourceRevision,GetCurrentThreadId());
 if(!EuphoriaDrawFlow::SourceWindow(SourceAt,SourceThread,GetTickCount(),GetCurrentThreadId(),owned)){
  static LONG late=0;if(SourceAt&&GetCurrentThreadId()==SourceThread){LONG n=InterlockedIncrement(&late);if(n<=8||n%500==0)Msg::Log("Euphoria474_DRAW retain reason=source-expired elapsed=%lu caller=%x w=%u h=%u",elapsed,(unsigned)caller,frame[0x6c/4],frame[0x70/4]);}return false;}
 if(elapsed>250&&owned){static LONG extended=0;LONG n=InterlockedIncrement(&extended);if(n<=8||n%500==0)Msg::Log("Euphoria474_DRAW scoped-continuation elapsed=%lu caller=%x",elapsed,(unsigned)caller);}
 if(InterlockedExchange(&SourcePending,0)){DialogueWidth=frame[0x6c/4];DialogueHeight=frame[0x70/4];}
 bool sameSize=(frame[0x6c/4]==DialogueWidth&&frame[0x70/4]==DialogueHeight)||(frame[0x6c/4]==DialogueHeight&&frame[0x70/4]==DialogueWidth);
 if(!sameSize){
  // The primary dialogue loop passes a pointer to each SJIS character in EAX/EBX, not a bitmap identity.
  // Its source pointer advances per glyph; permit mixed sizes in that already-qualified loop as well.
  if((caller!=0x428478&&glyph!=0x660c20)||frame[0x6c/4]<6||frame[0x6c/4]>160||frame[0x70/4]<6||frame[0x70/4]>160)return false;
  static LONG mixed=0;LONG n=InterlockedIncrement(&mixed);if(n<=8||n%100==0)Msg::Log("Euphoria474_DRAW mixed-size #%ld caller=%x first=%ux%u current=%ux%u",n,(unsigned)caller,DialogueWidth,DialogueHeight,frame[0x6c/4],frame[0x70/4]);
 }
 // Static path: 405b47/405b52 copy frame +80/+84 into the blitter's x/y arguments. 407cc3..407cf9
 // clips x+glyph width and y+glyph height against the destination bitmap. The old 0x74-byte RAW stopped BEFORE
 // these coordinates. The exact 405604 function consumes arguments through +8c, so these fields exist on every path.
 long x=(int)frame[0x80/4],y=(int)frame[0x84/4],w=(int)frame[0x6c/4],h=(int)frame[0x70/4];
 if(x>=-2000&&x<=10000&&y>=-2000&&y<=10000&&w>=6&&w<=160&&h>=6&&h<=160){ToMeTextPos::Glyph("yuris474_canvas_v1",x,y,(w>h?w:h));ToMeTextPos::Flush("yuris474_canvas_v1");}
 if(ToMeTextPos::WantRaw())Msg::Log("ToMe_TEXTPOS_RAW engine=yuris x=%ld y=%ld w=%ld h=%ld caller=%x",x,y,w,h,(unsigned)caller);
 if(!check_embed_able(ThreadParam{GetCurrentProcessId(),0x41e3a4,0,0}))return false;
 static LONG count=0;auto n=InterlockedIncrement(&count);
 if(n<=4||n%100==0)Msg::Log("Euphoria474_DRAW skip #%ld caller=%x",n,(unsigned)caller);
 return true;
}
static __declspec(naked) void Gate(){
 __asm {
 pushfd
 pushad
 lea eax,[esp+36]
 push eax
 push esi
 push ebx
 push dword ptr [eax+54h]
 call ShouldHide
 add esp,16
 // x86 bool is returned in AL; upper EAX bits are unspecified on false.
 test al,al
 jz keepdraw
 popad
 popfd
 jmp dword ptr [done]
 keepdraw:
 popad
 popfd
 jmp dword ptr [original]
 }
}
static bool Install(uintptr_t address){
 if(address!=0x41e3a4||reinterpret_cast<uintptr_t>(GetModuleHandleW(nullptr))!=0x400000||!ExactFile())return false;
 if(memcmp((void*)0x405641,"\x0f\xbe\x44\x24\x78\x83\xf8\x01\x0f\x84\x3b\x05",12))return false;
if(memcmp((void*)0x405b7e,"\x8b\x44\x24\x40\x83\xc4\x44\x5b\x5d\x5e\x5f\xc3",12))return false;
if(memcmp((void*)0x405604,"\x57\x56\x55\x53\x83\xec\x44\x8b\xf1\x8b\xea\x8b",12))return false;
 // Do not broaden to another build or install only one end of the ownership scope.
 if(memcmp((void*)0x4283df,"\x33\xed\x89\x5c\x24\x38\x8b\x7c\x24\x44",10)||
    memcmp((void*)0x428473,"\xe8\x8c\xd1\xfd\xff\x01\x44\x24\x3c",9)||
    memcmp((void*)0x4284a8,"\x8b\x5c\x24\x38\x0f\xb6\x05\x5e\x2a\x66\x00",11))return false;
 void* addresses[]={(void*)0x4283df,(void*)0x4284ac,(void*)0x405641};
 void* detours[]={(void*)LoopBeginGate,(void*)LoopEndGate,(void*)Gate};
 void** originals[]={&loopBeginOriginal,&loopEndOriginal,&original};
 for(unsigned i=0;i<3;i++)if(MH_CreateHook(addresses[i],detours[i],originals[i])!=MH_OK){for(unsigned j=0;j<i;j++)MH_RemoveHook(addresses[j]);return false;}
 for(unsigned i=0;i<3;i++)if(MH_EnableHook(addresses[i])!=MH_OK){for(unsigned j=0;j<3;j++){MH_DisableHook(addresses[j]);MH_RemoveHook(addresses[j]);}return false;}
 Msg::Log("Euphoria474_DRAW installed; scripts and glyph metrics preserved; synchronous raster scope");return true;
}
static void Embed(hook_context*,TextBuffer,HookParam*){} // Host switch only; no string mutation
}
