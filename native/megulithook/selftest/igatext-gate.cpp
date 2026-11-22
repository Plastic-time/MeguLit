// SPDX-License-Identifier: GPL-3.0-or-later
#include <windows.h>
#include <string>
#include <functional>
#include <cstdio>
enum class CHECK_BY {CUSTOM};
class ENGINE {public:bool is_engine_certain=true;CHECK_BY check_by;std::function<bool()>check_by_target;virtual bool attach_function(){return false;}};
struct HookParam {uintptr_t address=0;int offset=0,type=0,codepage=0;};
enum {USING_STRING=1};
#define regoffset(reg) (-16)
static int inserts=0;
static bool NewHook(HookParam &,const char *){inserts++;return true;}
#include "../IgaText.h"
int main(){int failures=0,checks=0;auto check=[&](bool ok,const char *why){checks++;if(!ok){failures++;printf("FAIL %s\n",why);}};
 const wchar_t *values[]={nullptr,L"",L"0",L"true",L"11",L" 1",L"1 ",L"1"};
 for(const auto value:values){SetEnvironmentVariableW(L"MEGULIT_IGA_TEXT",value);check(IgaText::Asked()==(value&&std::wstring(value)==L"1"),"exact private opt-in only");}
 SetEnvironmentVariableW(L"MEGULIT_IGA_TEXT",nullptr);MeguLitIgaText off;check(!off.check_by_target()&&!off.attach_function()&&!inserts,"default off never inserts");
 SetEnvironmentVariableW(L"MEGULIT_IGA_TEXT",L"1");MeguLitIgaText wrong;check(!wrong.check_by_target()&&!wrong.attach_function()&&!inserts,"opt-in wrong EXE never inserts");
 printf("IGA private gate: %d checks, %d failures\n",checks,failures);return failures?1:0;
}
