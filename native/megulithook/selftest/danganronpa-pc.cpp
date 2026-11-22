// SPDX-License-Identifier: GPL-3.0-or-later
/* Uses LunaHook's actual context, HookParam and TextBuffer types; never executes game code. */
#include "pch.h"
#include <fstream>
static HookParam Registered;
static unsigned Installs=0;
static std::string RegisteredName;
static bool NewHook(HookParam hp,const char *name){Registered=hp;RegisteredName=name;Installs++;return true;}
#include "../DanganronpaPc.h"
static int Failures=0;
static void Check(bool ok,const char *name){fprintf(stderr,"%s %s\n",ok?"PASS":"FAIL",name);if(!ok)Failures++;}
static std::wstring ControlPath(){wchar_t tmp[MAX_PATH],file[MAX_PATH+64];GetTempPathW(MAX_PATH,tmp);swprintf_s(file,L"%sMeguLit\\draw\\%lu.txt",tmp,GetCurrentProcessId());return file;}
static void Control(const wchar_t *first){const auto file=ControlPath();std::filesystem::create_directories(std::filesystem::path(file).parent_path());std::ofstream f(file,std::ios::binary);wchar_t bom=0xfeff;f.write((char *)&bom,2);f.write((char *)first,wcslen(first)*2);}
static unsigned char *MapFile(const wchar_t *file){
 std::ifstream f(file,std::ios::binary);std::vector<unsigned char> bytes((std::istreambuf_iterator<char>(f)),{});if(bytes.size()!=DanganronpaPcSig::ExeBytes)return nullptr;
 auto dos=(IMAGE_DOS_HEADER *)bytes.data();auto nt=(IMAGE_NT_HEADERS *)(bytes.data()+dos->e_lfanew);auto memory=(unsigned char *)VirtualAlloc(nullptr,nt->OptionalHeader.SizeOfImage,MEM_COMMIT|MEM_RESERVE,PAGE_READWRITE);if(!memory)return nullptr;
 memcpy(memory,bytes.data(),nt->OptionalHeader.SizeOfHeaders);auto section=IMAGE_FIRST_SECTION(nt);
 for(unsigned i=0;i<nt->FileHeader.NumberOfSections;i++)memcpy(memory+section[i].VirtualAddress,bytes.data()+section[i].PointerToRawData,section[i].SizeOfRawData);
 const auto reloc=nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_BASERELOC];const DWORD delta=(DWORD)(std::uintptr_t)memory-nt->OptionalHeader.ImageBase;
 for(unsigned at=reloc.VirtualAddress;at<reloc.VirtualAddress+reloc.Size;){auto block=(IMAGE_BASE_RELOCATION *)(memory+at);if(block->SizeOfBlock<8)break;auto fix=(WORD *)(block+1);
  for(unsigned i=0;i<(block->SizeOfBlock-8)/2;i++)if(fix[i]>>12==IMAGE_REL_BASED_HIGHLOW)*(DWORD *)(memory+block->VirtualAddress+(fix[i]&0xfff))+=delta;at+=block->SizeOfBlock;}
 return memory;
}
static void Emit(const TextBuffer &b){printf("SOURCE ");constexpr char digits[]="0123456789abcdef";for(unsigned i=0;i<b.size;i++)printf("%c%c",digits[b.data[i]>>4],digits[b.data[i]&15]);printf("\n");}
int wmain(int argc,wchar_t **argv){
 using namespace DanganronpaPc;using namespace DanganronpaPcSig;
 if(argc<2||argc>3){fprintf(stderr,"usage: danganronpa-pc.exe <exact owner DR1_us.exe> [exact extracted LIN]\n");return 2;}
 Check(!Asked()&&!Match()&&Installs==0,"default off installs no hook");
 Check(EnabledLine("#cfg roles=0 spikechunsoftInput=1 embed=0"),"exact opt-in token");
 for(const char *v:{"#cfg roles=1","#cfg spikechunsoftInput=10","#cfg spikechunsoftInput=0 spikechunsoftInput=1","#cfg spikechunsoftInput=1 spikechunsoftInput=1","junk #cfg spikechunsoftInput=1"})Check(!EnabledLine(v),"near/conflicting token rejected");
 Check(HashFile(argv[1],ExeBytes,ExeSha),"actual installed executable SHA");Check(!HashFile(argv[1],ExeBytes-1,ExeSha),"wrong file size rejected");
 auto image=MapFile(argv[1]);if(!image)return 2;Base=(std::uintptr_t)image;Check(ImageMatches(Base),"actual mapped executable including ASLR relocation");
 image[Entry]^=1;Check(!ImageMatches(Base),"modified helper rejected");image[Entry]^=1;
 image[Dispatch+18]^=1;Check(!ImageMatches(Base),"modified dispatch table operand rejected");image[Dispatch+18]^=1;
 Control(L"#cfg roles=0 embed=0 spikechunsoftInput=1\r\n");Check(Asked()&&Install()&&Installs==1,"standard hook registered only after opt-in");
 Check(RegisteredName=="DanganronpaPcText"&&Registered.address==Base+Entry&&(Registered.type&CODEC_UTF16)&&(Registered.type&FULL_STRING)&&(Registered.type&NO_CONTEXT)&&!(Registered.type&EMBED_ABLE),"actual HookParam is complete UTF16 read-only");
 unsigned char state[256]={},script[64]={};const unsigned pc=12,id=2;script[pc-4]=0x70;script[pc-3]=2;script[pc-2]=0;script[pc-1]=id;
 *(std::uintptr_t *)(image+State)=(std::uintptr_t)state;*(std::uintptr_t *)(state+ScriptOffset)=(std::uintptr_t)script;*(unsigned *)(image+Pc)=pc;image[Speaker]=7;
 struct ContextStorage {hook_context context;std::uintptr_t rest[8];} storage={};auto &context=storage.context;context.stack[0]=Base+Return;
 BYTE out[TEXT_BUFFER_SIZE]={};TextBuffer b={out,0};std::uintptr_t split=0;
 auto Feed=[&](const std::wstring &text){context.stack[1]=(std::uintptr_t)text.c_str();*(std::uintptr_t *)(state+TextArrayOffset+id*4)=context.stack[1];b.clear();Registered.text_fun(&context,&Registered,&b,&split);};
 const std::wstring text=L"\ufeff<CLT 4>希望ヶ峰学園…\r\n<CLT>日本語の本文です。";Feed(text);Check(b.strW()==L"希望ヶ峰学園…\n日本語の本文です。","complete source cleans only verified CLT/BOM/newlines");
 Check(context.stack[0]==Base+Return&&*(unsigned *)(image+Pc)==pc&&image[Speaker]==7,"game state and call arguments unchanged");
 Feed(L"同じ本文を読みます。");Check(b.size>0,"first identical source");Feed(L"同じ本文を読みます。");Check(b.size>0,"intentional repeat is left to the standard reader pipeline");
 context.stack[0]++;Feed(text);Check(!b.size,"foreign caller rejected");context.stack[0]--;
 context.stack[0]++;b.from(std::wstring(L"stale previous source"));Registered.text_fun(&context,&Registered,&b,&split);Check(!b.size,"bad capture empties a prefilled reused TextBuffer");context.stack[0]--;
 script[pc-3]=5;Feed(text);Check(!b.size,"movie opcode rejected");script[pc-3]=2;
 context.stack[1]=(std::uintptr_t)text.c_str();*(std::uintptr_t *)(state+TextArrayOffset+id*4)=0;b.clear();Registered.text_fun(&context,&Registered,&b,&split);Check(!b.size,"different indexed source pointer rejected");
 *(unsigned *)(image+Pc)=0;Feed(text);Check(!b.size,"invalid script PC rejected");*(unsigned *)(image+Pc)=pc;
 Feed(std::wstring(MaxUnits+1,L'あ'));Check(!b.size,"overlong source dropped whole");Feed(std::wstring(1,0xd800));Check(!b.size,"invalid UTF16 rejected");Feed(L"<CLT bad>本文");Check(!b.size,"unknown CLT grammar rejected");
 Control(L"#cfg roles=1 spikechunsoftInput=0\r\n");Feed(text);Check(!b.size,"withdrawal blocks a callback before reading source");
 b.from(std::wstring(L"stale previous source"));Registered.text_fun(&context,&Registered,&b,&split);Check(!b.size,"withdrawal empties a prefilled reused TextBuffer");
 DeleteFileW(ControlPath().c_str());Feed(text);Check(!b.size,"missing control blocks callbacks");
 *(std::uintptr_t *)(image+State)=1;Snapshot bad={};Check(!Capture(context.stack,&bad),"unreadable state fails closed");
 if(argc==3){
  Check(HashFile(argv[2],11916,"d1a05e2c35b67d3882ef328f33260f883a5e7c96c53c1dbe3e530526fc52c79e"),"actual extracted Japanese LIN identity");
  std::ifstream f(argv[2],std::ios::binary);std::vector<unsigned char> lin((std::istreambuf_iterator<char>(f)),{});
  if(lin.size()!=11916)return 2;const unsigned to=*(unsigned *)&lin[8];
  Control(L"#cfg roles=0 embed=0 spikechunsoftInput=1\r\n");*(std::uintptr_t *)(image+State)=(std::uintptr_t)state;*(std::uintptr_t *)(state+ScriptOffset)=(std::uintptr_t)lin.data();
  for(unsigned offset:{113,129,197,211}){const unsigned textId=lin[offset+2]*256+lin[offset+3];const auto source=(std::uintptr_t)(lin.data()+to+*(unsigned *)&lin[to+4+textId*4]);
   *(unsigned *)(image+Pc)=offset+4;*(std::uintptr_t *)(state+TextArrayOffset+textId*4)=source;context.stack[1]=source;b.clear();Registered.text_fun(&context,&Registered,&b,&split);
   Check(b.size>0,"actual LIN opcode/source pointer emits standard text");Emit(b);
  }DeleteFileW(ControlPath().c_str());
 }
 VirtualFree(image,0,MEM_RELEASE);fprintf(stderr,"Danganronpa PC callback: %d failure(s)\n",Failures);return Failures?1:0;
}
