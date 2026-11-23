// SPDX-License-Identifier: GPL-3.0-or-later
#include "../IgaTextSig.h"
#include "../IgaTextPin.h"
#include "igatext-snippet.h"
#include <vector>
#include <cstdio>
#include <string>
static int failures=0,checks=0;
static void Check(bool ok,const char *why){checks++;if(!ok){failures++;printf("FAIL %s\n",why);}}
int wmain(int argc,wchar_t **argv){
 std::vector<unsigned char> bytes(IgaTextSnippet,IgaTextSnippet+sizeof IgaTextSnippet);size_t at=99;
 Check(IgaTextSig::Find(bytes.data(),bytes.size(),&at)==1&&at==0,"actual module entry");
 for(size_t i=0;i<bytes.size();i++){Check(!IgaTextSig::Find(bytes.data(),i,&at),"truncated entry");if(IgaTextSig::Fixed[i]){auto bad=bytes;bad[i]^=0x5a;Check(!IgaTextSig::Find(bad.data(),bad.size(),&at),"changed instruction");}}
 auto twice=bytes;twice.insert(twice.end(),bytes.begin(),bytes.end());Check(IgaTextSig::Find(twice.data(),twice.size(),&at)==2,"ambiguous entry");
 for(size_t i=0;i<bytes.size();i++)if(!IgaTextSig::Fixed[i])bytes[i]^=0x24;
 Check(IgaTextSig::Find(bytes.data(),bytes.size(),&at)==1,"PE relocation");
 Check(!IgaTextPin::Verify(L"H:\\MeguLit-Work\\iga-nonexistent",IgaTextPin::Pins[0]),"missing file denied");
 wchar_t self[32768];GetModuleFileNameW(nullptr,self,32768);std::wstring bad(self);bad.resize(bad.find_last_of(L"\\/"));bad+=L"\\igatext-invalid.bin";
 HANDLE file=CreateFileW(bad.c_str(),GENERIC_WRITE,0,nullptr,CREATE_ALWAYS,0,nullptr);std::vector<unsigned char> wrong(IgaTextPin::Pins[0].bytes,0);DWORD written=0;
 Check(file!=INVALID_HANDLE_VALUE&&WriteFile(file,wrong.data(),(DWORD)wrong.size(),&written,nullptr)&&written==wrong.size(),"same-size negative fixture created");if(file!=INVALID_HANDLE_VALUE)CloseHandle(file);
 Check(!IgaTextPin::Verify(bad.c_str(),IgaTextPin::Pins[0]),"same-size wrong SHA rejected");
 if(argc==2){std::wstring root(argv[1]);auto exe=root+L"\\虚ノ少女.exe";Check(IgaTextPin::Verify(exe.c_str(),IgaTextPin::Pins[0]),"actual executable pin");
  for(size_t i=1;i<sizeof IgaTextPin::Pins/sizeof IgaTextPin::Pins[0];i++){auto file=root+L"\\"+IgaTextPin::Pins[i].path;Check(IgaTextPin::Verify(file.c_str(),IgaTextPin::Pins[i]),"actual plugin/resource pin");}
  Check(!IgaTextPin::Verify(exe.c_str(),IgaTextPin::Pins[1]),"wrong file rejected");
 }
 printf("IGA signature/pins: %d checks, %d failures\n",checks,failures);return failures?1:0;
}
