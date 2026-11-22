// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
// A private, read-only stream for the pinned native Himorogi build, before the glyph cache
#ifndef _WIN64
#include "IgaTextSig.h"
#include "IgaTextPin.h"
namespace IgaText {
static bool Flag(const wchar_t *name){wchar_t value[2]={};return GetEnvironmentVariableW(name,value,2)==1&&value[0]==L'1';}
static bool Asked(){return Flag(L"MEGULIT_IGA_TEXT")&&Flag(L"MEGULIT_OWNER_TESTS")&&Flag(L"MEGULIT_SIDE_BY_SIDE");}
static uintptr_t Entry(){
 if(!Asked())return 0;
 wchar_t exe[32768];DWORD n=GetModuleFileNameW(nullptr,exe,32768);if(!n||n>=32768)return 0;
 std::wstring root(exe);auto cut=root.find_last_of(L"\\/");if(cut==std::wstring::npos)return 0;root.resize(cut);
 if(!IgaTextPin::Verify(exe,IgaTextPin::Pins[0]))return 0;
 for(size_t i=1;i<sizeof IgaTextPin::Pins/sizeof IgaTextPin::Pins[0];i++){
  auto path=root+L"\\"+IgaTextPin::Pins[i].path;if(!IgaTextPin::Verify(path.c_str(),IgaTextPin::Pins[i]))return 0;
 }
 HMODULE module=GetModuleHandleW(L"Script.dll");if(!module)return 0;
 wchar_t loaded[32768];n=GetModuleFileNameW(module,loaded,32768);
 auto expected=root+L"\\plugin\\Script.dll";if(!n||n>=32768||_wcsicmp(loaded,expected.c_str()))return 0;
 const wchar_t *modules[]={L"Himorogi.dll",L"D3D9Font.dll",L"D3D9Layer.dll",L"Sound.dll",L"Movie.dll"};
 for(const auto name:modules){auto mod=GetModuleHandleW(name);if(!mod)return 0;n=GetModuleFileNameW(mod,loaded,32768);
  expected=root+L"\\plugin\\"+name;if(!n||n>=32768||_wcsicmp(loaded,expected.c_str()))return 0;}
 auto base=(uintptr_t)module;auto dos=(IMAGE_DOS_HEADER *)base;
 if(dos->e_magic!=IMAGE_DOS_SIGNATURE||dos->e_lfanew<0x40||dos->e_lfanew>0x1000)return 0;
 auto nt=(IMAGE_NT_HEADERS *)(base+dos->e_lfanew);
 if(nt->Signature!=IMAGE_NT_SIGNATURE||nt->FileHeader.Machine!=IMAGE_FILE_MACHINE_I386||nt->OptionalHeader.SizeOfImage>64*1024*1024)return 0;
 auto sections=IMAGE_FIRST_SECTION(nt);uintptr_t found=0;size_t count=0;
 for(unsigned i=0;i<nt->FileHeader.NumberOfSections;i++){
  const auto &s=sections[i];if(!(s.Characteristics&IMAGE_SCN_MEM_EXECUTE))continue;
  if(s.VirtualAddress>nt->OptionalHeader.SizeOfImage||s.Misc.VirtualSize>nt->OptionalHeader.SizeOfImage-s.VirtualAddress)return 0;
  size_t at=0;size_t hits=IgaTextSig::Find((const unsigned char *)(base+s.VirtualAddress),s.Misc.VirtualSize,&at);
  if(hits)found=base+s.VirtualAddress+at;count+=hits;
 }
 return count==1&&found-base==IgaTextSig::EntryRva?found:0;
}
}
class MeguLitIgaText:public ENGINE {
 uintptr_t entry=0;
public:
 MeguLitIgaText(){is_engine_certain=false;check_by=CHECK_BY::CUSTOM;check_by_target=[this](){entry=IgaText::Entry();return entry!=0;};}
 bool attach_function() override {
  if(!entry||!IgaText::Asked())return false;
  HookParam hp;hp.address=entry;hp.offset=regoffset(ecx);hp.type=USING_STRING;hp.codepage=932;
  // Keep Luna's caller context: UI, name and body callers must not be merged
  return NewHook(hp,"IGA_Text");
 }
};
#endif
