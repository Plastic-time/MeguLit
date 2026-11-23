// SPDX-License-Identifier: GPL-3.0-or-later
/* Compiles the retained stock adapter, with fake Win32 discovery and NewHook
   This does not load game DLLs, install a detour, or verify the host/Reader pipeline */
#include <cstdint>
#include <cstddef>
#include <cstdio>
#include <cstring>
#include <cwchar>
#include <functional>
#include <string>
#include <vector>
#include <utility>
#include "../../../preserved/source/lunahoook-adapted/NativeImpl/LunaHook/include/const.h"

using DWORD=uint32_t;
using ULONG=uint32_t;
using HMODULE=void*;
enum class CHECK_BY { CUSTOM };
class ENGINE {
public:
 CHECK_BY check_by;
 std::function<bool()> check_by_target;
 virtual bool attach_function()=0;
};
struct hook_context {
 uintptr_t eax=0,ebx=0;
 union { uintptr_t stack[8]={};unsigned char base[1]; };
};
#define stackoffset(idx) ((int)offsetof(hook_context,stack[idx])-(int)offsetof(hook_context,base))
struct TextBuffer { std::string bytes;void from(const char* text){bytes=text;} };
struct HookParam {
 uintptr_t address=0;
 int offset=0,type=0,embed_hook_font=0;
 void (*text_fun)(hook_context*,HookParam*,TextBuffer*,uintptr_t*)=nullptr;
};
struct Capture { HookParam hp;std::string name; };
static bool ModuleLoaded=false;
static bool HistoryPresent=false;
static uint8_t HistoryStub[64]={0x8b,0x44,0x24,0x04,0x6a,0x02,0x6a,0,0x6a,0,0x6a,0,0x50,0xe8,0x10,0,0,0};
static unsigned Exports=0,Failures=0,Checks=0;
static std::string FailHook;
static std::vector<Capture> Captured;
static HMODULE GetModuleHandle(const wchar_t* name){return ModuleLoaded&&wcscmp(name,L"resident.dll")==0?(HMODULE)0x10000000:nullptr;}
static void* GetProcAddress(HMODULE module,const char* name){
 if(!module)return nullptr;
 if((Exports&1)&&strcmp(name,"?printSub@RetouchPrintManager@@AAE_NPBDAAVUxPrintData@@K@Z")==0)return (void*)0x1004f850;
 if((Exports&2)&&strcmp(name,"?printSub@RetouchPrintManager@@AAEXPBDKAAH1@Z")==0)return (void*)0x10045770;
 return nullptr;
}
static bool NewHook(HookParam hp,const char* name){Captured.push_back({hp,name});return FailHook!=name;}
namespace Util { static std::pair<uintptr_t,uintptr_t> QueryModuleLimits(HMODULE){return {(uintptr_t)HistoryStub,(uintptr_t)HistoryStub+sizeof HistoryStub};} }
namespace MemDbg { static uintptr_t findBytes(const uint8_t* bytes,size_t size,uintptr_t start,uintptr_t end){return HistoryPresent&&start==(uintptr_t)HistoryStub&&end==start+sizeof HistoryStub&&size<=sizeof HistoryStub&&memcmp(bytes,HistoryStub,size)==0?start:0;} }

/* The implementation stays in its existing licensed location */
#include "../../../preserved/source/lunahoook-adapted/NativeImpl/LunaHook/LunaHook/engine32/Retouch.cpp"

static void Check(bool ok,const char* why){Checks++;if(!ok){Failures++;printf("FAIL %s\n",why);}}
static void Reset(unsigned mask,const char* fail=""){ModuleLoaded=true;HistoryPresent=false;Exports=mask;FailHook=fail;Captured.clear();}
int main(){
 static_assert(sizeof(uintptr_t)==4,"The retained Retouch adapter is x86");
 Reset(3);ModuleLoaded=false;Retouch engine;
 Check(!engine.check_by_target(),"absent resident module does not match");
 ModuleLoaded=true;Check(engine.check_by_target(),"same detector recognizes resident after loading when explicitly checked again");
 Check(engine.attach_function(),"both exact exports supply the ordinary adapter");
 Check(Captured.size()==2,"two stock ordinary NewHook calls, no history signature supplied by this fixture");
 if(Captured.size()!=2)return 1;
 Check(Captured[0].name=="Retouch1"&&Captured[0].hp.address==0x1004f850,"Retouch1 uses the actual sample export RVA");
 Check(Captured[1].name=="Retouch2"&&Captured[1].hp.address==0x10045770,"Retouch2 uses the actual sample export RVA");
 const int expected=USING_STRING|NO_CONTEXT|EMBED_ABLE|EMBED_AFTER_NEW|EMBED_DYNA_SJIS;
 for(const auto& capture:Captured){
  Check(capture.hp.offset==4&&capture.hp.type==expected,"ordinary argument one, ANSI string and original stock flags retained");
  Check(capture.hp.embed_hook_font==F_GetGlyphOutlineA,"stock font integration unchanged");
 }
 Check(Captured[0].hp.text_fun!=nullptr&&Captured[1].hp.text_fun==nullptr,"only the first stock entry has a custom text callback");
 auto hp=Captured[0].hp;
 const char sjis[]={char(0x82),char(0xa0),char(0x82),char(0xa2),0};
 hook_context context;context.stack[1]=(uintptr_t)sjis;
 TextBuffer buffer;uintptr_t split=0;
 for(unsigned n=0;n<10;n++){
  context.eax=1;context.ebx=0;
  hp.text_fun(&context,&hp,&buffer,&split);
  Check(buffer.bytes==std::string(sjis,4)&&split==FIXED_SPLIT_VALUE,"ten synthetic callback inputs retain exact bytes and stock dialogue split");
 }
 context.eax=0;context.ebx=1;hp.text_fun(&context,&hp,&buffer,&split);
 Check(split==FIXED_SPLIT_VALUE*2,"stock name split preserved as an opaque thread key");
 context.eax=1;context.ebx=1;hp.text_fun(&context,&hp,&buffer,&split);
 Check(split==FIXED_SPLIT_VALUE*3,"stock other split preserved as an opaque thread key");
 Check(split>3,"stock split is not a certified Reader role value 1..3");
 for(unsigned mask=0;mask<4;mask++){
  Reset(mask);Retouch variant;Check(variant.check_by_target(),"fixture module detector matches");
  Check(variant.attach_function()==(mask!=0),"either supported export suffices; no exports fails");
  Check(Captured.size()==((mask&1)!=0)+((mask&2)!=0),"only available exports reach ordinary NewHook");
 }
 Reset(3,"Retouch1");Retouch fallback;fallback.check_by_target();
 Check(fallback.attach_function()&&Captured.size()==2,"second ordinary hook still tried after first install refusal");
 Reset(1,"Retouch1");Retouch refused;refused.check_by_target();
 Check(!refused.attach_function(),"a refused only hook cannot report success");
 Reset(3);HistoryPresent=true;Retouch history;history.check_by_target();
 Check(history.attach_function()&&Captured.size()==3,"a matching history path adds a third ordinary stream");
 if(Captured.size()==3){
  Check(Captured[2].name=="RetouchHistory","third stream keeps its stock history name");
  Check(Captured[2].hp.address==(uintptr_t)HistoryStub+34,"history relative call resolves inside the self-owned stand-in");
  Check(Captured[2].hp.offset==4&&Captured[2].hp.text_fun==nullptr,"history is ordinary argument-one capture, without a certified Reader role");
 }
 printf("Retouch stock contract: %u checks, %u failures; fake discovery/NewHook only, no game or MinHook\n",Checks,Failures);
 return Failures?1:0;
}
