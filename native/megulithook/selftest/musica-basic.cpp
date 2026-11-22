// SPDX-License-Identifier: GPL-3.0-or-later
// Controlled API doubles exercise the production reader, not Luna patching or a game
#include <windows.h>
#include <functional>
#include <string>
#include <vector>
#include <thread>
#include <cstdio>
#include <cstdlib>
struct hook_context { uintptr_t ecx=0; };
struct HookParam;
enum { USING_STRING=1,NO_CONTEXT=2,CODEC_UTF8=4,TEXT_BUFFER_SIZE=4096 };
struct TextBuffer { unsigned char data[TEXT_BUFFER_SIZE];size_t size=0;void from(const char *p,size_t n){size=n;memcpy(data,p,n);} };
struct HookParam { uintptr_t address=0;unsigned type=0;void (*text_fun)(hook_context *,HookParam *,TextBuffer *,uintptr_t *)=nullptr; };
struct ENGINE { enum class CHECK_BY { CUSTOM };bool is_engine_certain;CHECK_BY check_by;std::function<bool()> check_by_target;virtual bool attach_function()=0; };
static HookParam captured;static unsigned installs=0;static bool installResult=true;
static bool NewHook(HookParam p,const char *name){if(strcmp(name,"MusicaBasic"))abort();captured=p;installs++;return installResult;}
#include "../MusicaBasic.h"
static unsigned checks=0;
static void Check(bool ok){checks++;if(!ok){printf("FAIL %u\n",checks);exit(1);}}
static void Hex(unsigned char *p,const char *s){while(*s){char b[3]={s[0],s[1],0};*p++=(unsigned char)strtoul(b,nullptr,16);s+=2;}}
static void Put(unsigned char *p,size_t at,uint32_t v){memcpy(p+at,&v,4);}
static void Ask(bool on){SetEnvironmentVariableW(L"MEGULIT_OWNER_TESTS",on?L"1":nullptr);SetEnvironmentVariableW(L"MEGULIT_SIDE_BY_SIDE",on?L"1":nullptr);SetEnvironmentVariableW(L"MEGULIT_MUSICA_BASIC",on?MusicaBasicSig::ExeShaWide:nullptr);}
int main(){
  using namespace MusicaBasicHook;using namespace MusicaBasicSig;
  Ask(false);Check(!PrivateAsked());Check(!VerifyCurrent());Check(!Attach());Check(installs==0);
  Ask(true);Check(PrivateAsked());SetEnvironmentVariableW(L"MEGULIT_OWNER_TESTS",L"true");Check(!PrivateAsked());Ask(true);
  SetEnvironmentVariableW(L"MEGULIT_SIDE_BY_SIDE",L"0");Check(!PrivateAsked());Ask(true);
  SetEnvironmentVariableW(L"MEGULIT_MUSICA_BASIC",L"1");Check(!PrivateAsked());Ask(true);
  // This console is not the pinned game and must never pass complete authorization
  Check(!VerifyCurrent());Check(!Attach());Check(installs==0);
  wchar_t own[100];swprintf_s(own,L"musica-owned-hash-%lu.bin",GetCurrentProcessId());
  HANDLE file=CreateFileW(own,GENERIC_WRITE,0,nullptr,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,nullptr);Check(file!=INVALID_HANDLE_VALUE);DWORD wrote=0;Check(WriteFile(file,"abc",3,&wrote,nullptr)&&wrote==3);CloseHandle(file);
  wchar_t finalPath[2048];const char *abc="ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
  Check(VerifyFile(own,3,abc,finalPath));Check(!VerifyFile(own,4,abc));Check(!VerifyFile(own,3,ExeSha256));
  wchar_t absolute[2048];Check(GetFullPathNameW(own,2048,absolute,nullptr)>0);Check(SameCanonicalFile(absolute,finalPath));Check(!SameCanonicalFile(own,finalPath));Check(!SameCanonicalFile(L"C:\\missing-musica-private-file",finalPath));
  auto mapped=(unsigned char *)VirtualAlloc(nullptr,ImageBytes,MEM_COMMIT|MEM_RESERVE,PAGE_READWRITE);Check(mapped!=nullptr);
  uintptr_t base=(uintptr_t)mapped;auto dos=(IMAGE_DOS_HEADER *)mapped;dos->e_magic=IMAGE_DOS_SIGNATURE;dos->e_lfanew=0x80;
  auto pe=(IMAGE_NT_HEADERS32 *)(mapped+0x80);pe->Signature=IMAGE_NT_SIGNATURE;pe->FileHeader.Machine=IMAGE_FILE_MACHINE_I386;pe->FileHeader.TimeDateStamp=1255905404;pe->OptionalHeader.Magic=IMAGE_NT_OPTIONAL_HDR32_MAGIC;pe->OptionalHeader.SizeOfImage=1150976;
  Hex(mapped+0x6749b,"558bec51568bf18b461cff76208b88d8110000e80b4cfeff8845fc8d4634ff75fc8b4e1c508d4624508d464450ff7620e87655fbffb0015ec9c3");
  Hex(mapped+0x67423,"568b742408578bf98b4e0485c974648b46082bc1c1f80483f80475576a0051e89348fbff598947208b4604596aff83c0206a00508d4f24e8c8b1f9ff8b46046aff83c0306a00508d4f34e8b5b1f9ff8b460485c0741d8b76082bf0c1fe0483fe0176106aff83c0106a00508d4f44e891b1f9ff5f5ec20400");
  mapped[0x67396]=0xc7;mapped[0x67397]=6;Put(mapped,0x67398,(uint32_t)base+0xa22d0);Put(mapped,0xa22d4,(uint32_t)base+0x67423);Put(mapped,0xa22d8,(uint32_t)base+0x6749b);memcpy(mapped+0xb3038,".message",9);
  Check(MemoryPinned(base));Check(!MatchesMapped(mapped,ImageBytes-1,base));Check(!MatchesMapped(mapped,ImageBytes,UINT32_MAX-100));
  for(unsigned at:{0u,0x67000u}){DWORD oldProtect=0;Check(VirtualProtect(mapped+at,4096,PAGE_READWRITE|PAGE_GUARD,&oldProtect)!=0);Check(!MemoryPinned(base));MEMORY_BASIC_INFORMATION info{};VirtualQuery(mapped+at,&info,sizeof info);Check((info.Protect&PAGE_GUARD)!=0);VirtualProtect(mapped+at,4096,oldProtect,&oldProtect);}
  for(unsigned i=0;i<58;i++){mapped[ExecuteRva+i]^=1;Check(!MemoryPinned(base));mapped[ExecuteRva+i]^=1;}
  for(unsigned i=0;i<120;i++){mapped[ParseRva+i]^=1;Check(!MemoryPinned(base));mapped[ParseRva+i]^=1;}
  for(unsigned at:{0x67396u,0x67398u,0xa22d4u,0xa22d8u,0xb3038u}){mapped[at]^=1;Check(!MemoryPinned(base));mapped[at]^=1;}
  pe->FileHeader.Machine=IMAGE_FILE_MACHINE_AMD64;Check(!MemoryPinned(base));pe->FileHeader.Machine=IMAGE_FILE_MACHINE_I386;
  VerifiedBase=base;Check(Attach());Check(installs==1);Check(captured.address==base+0x6749b);Check(captured.type==(USING_STRING|NO_CONTEXT|CODEC_UTF8));Check(captured.text_fun==ReadBody);
  installResult=false;Check(!Attach());installResult=true;
  uint32_t object[0x54/4]{};object[0]=(uint32_t)base+0xa22d0;
  char raw[]={char(0x95),char(0x5c),char(0x82),char(0xa0),0}; // CP932: 表あ, including a trail backslash
  auto field=object+0x34/4;field[1]=(uint32_t)raw;field[2]=4;field[3]=4;
  object[0x24/4+1]=1;object[0x44/4+1]=1; // name and voice must not be dereferenced
  hook_context ctx;ctx.ecx=(uintptr_t)object;TextBuffer b;
  ReadBody(&ctx,nullptr,&b,nullptr);Check(std::string((char *)b.data,b.size)=="\xe8\xa1\xa8\xe3\x81\x82");
  Ask(false);ReadBody(&ctx,nullptr,&b,nullptr);Check(b.size==0);Ask(true);
  for(unsigned value:{0u,8001u,UINT32_MAX}){field[2]=value;b.size=99;ReadBody(&ctx,nullptr,&b,nullptr);Check(b.size==0);}field[2]=4;
  for(unsigned value:{3u,16u*1024*1024+1}){field[3]=value;ReadBody(&ctx,nullptr,&b,nullptr);Check(b.size==0);}field[3]=4;
  raw[4]='x';ReadBody(&ctx,nullptr,&b,nullptr);Check(b.size==0);raw[4]=0;
  raw[1]=0;ReadBody(&ctx,nullptr,&b,nullptr);Check(b.size==0);raw[1]=char(0x5c);
  raw[0]=char(0x81);raw[1]=char(0x30);ReadBody(&ctx,nullptr,&b,nullptr);Check(b.size==0);raw[0]=char(0x95);raw[1]=char(0x5c);
  field[1]=1;ReadBody(&ctx,nullptr,&b,nullptr);Check(b.size==0);field[1]=(uint32_t)raw;
  object[0]++;ReadBody(&ctx,nullptr,&b,nullptr);Check(b.size==0);object[0]--;
  ctx.ecx=UINT32_MAX-10;ReadBody(&ctx,nullptr,&b,nullptr);Check(b.size==0);ctx.ecx=(uintptr_t)object;
  auto page=(char *)VirtualAlloc(nullptr,4096,MEM_COMMIT|MEM_RESERVE,PAGE_READWRITE);Check(page!=nullptr);DWORD old=0;
  memcpy(page,raw,5);VirtualProtect(page,4096,PAGE_READWRITE|PAGE_GUARD,&old);field[1]=(uint32_t)page;
  ReadBody(&ctx,nullptr,&b,nullptr);Check(b.size==0);MEMORY_BASIC_INFORMATION mbi{};VirtualQuery(page,&mbi,sizeof mbi);Check((mbi.Protect&PAGE_GUARD)!=0);VirtualProtect(page,4096,PAGE_READWRITE,&old);
  field[1]=(uint32_t)(page+4094);field[2]=4;ReadBody(&ctx,nullptr,&b,nullptr);Check(b.size==0);
  std::string large(8000,'a');field[1]=(uint32_t)large.c_str();field[2]=8000;field[3]=8000;ReadBody(&ctx,nullptr,&b,nullptr);Check(b.size==0); // wide-unit bound, no clipping
  large.assign(4000,'a');field[1]=(uint32_t)large.c_str();field[2]=4000;field[3]=4000;ReadBody(&ctx,nullptr,&b,nullptr);Check(b.size==4000);
  field[1]=(uint32_t)raw;field[2]=4;field[3]=4;
  unsigned concurrent[2]{};std::thread a([&](){for(int i=0;i<100;i++){TextBuffer local;ReadBody(&ctx,nullptr,&local,nullptr);if(local.size==6)concurrent[0]++;}}),c([&](){for(int i=0;i<100;i++){TextBuffer local;ReadBody(&ctx,nullptr,&local,nullptr);if(local.size==6)concurrent[1]++;}});a.join();c.join();Check(concurrent[0]==100&&concurrent[1]==100);
  Ask(false);Check(!Attach());Check(!VerifyCurrent());VirtualFree(page,0,MEM_RELEASE);VirtualFree(mapped,0,MEM_RELEASE);
  printf("PASS %u; production reader + controlled NewHook API; game/patch/Reader not executed\n",checks);return 0;
}
