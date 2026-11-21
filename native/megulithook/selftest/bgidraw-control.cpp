// SPDX-License-Identifier: GPL-3.0-or-later
// Reads actual control files through production BgiDraw::ReadControl, without starting a game.
#include <windows.h>
#include <cstdio>
#include <cstdarg>
#include <string>
#include <vector>
namespace Msg{static void Log(const char *,...) {}}
#include "../BgiDraw.h"
static int Failures=0,Checks=0;
static void Check(bool ok,const char *s){Checks++;printf("%s %s\n",ok?"PASS":"FAIL",s);if(!ok)Failures++;}
static std::wstring ControlFile(){wchar_t tmp[MAX_PATH],file[MAX_PATH+64];GetTempPathW(MAX_PATH,tmp);std::wstring dir=std::wstring(tmp)+L"MeguLit";CreateDirectoryW(dir.c_str(),nullptr);dir+=L"\\draw";CreateDirectoryW(dir.c_str(),nullptr);swprintf_s(file,L"%s\\%lu.txt",dir.c_str(),GetCurrentProcessId());return file;}
static void Raw(const void *text,DWORD bytes){HANDLE h=CreateFileW(ControlFile().c_str(),GENERIC_WRITE,0,nullptr,CREATE_ALWAYS,0,nullptr);DWORD written;WriteFile(h,text,bytes,&written,nullptr);CloseHandle(h);}
static void Control(const wchar_t *s){Raw(s,(DWORD)(wcslen(s)*2));}
int wmain(int argc,wchar_t **argv){InitializeCriticalSection(&BgiDraw::Lock);
 if(argc>1){HANDLE h=CreateFileW(argv[1],GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,0,nullptr);unsigned char b[16384];DWORD got=0;bool ok=h!=INVALID_HANDLE_VALUE&&ReadFile(h,b,sizeof b,&got,nullptr);if(h!=INVALID_HANDLE_VALUE)CloseHandle(h);Raw(b,got);Check(ok&&BgiDraw::ReadControl(),"real JS KrkrTransport UTF16LE BOM first line authorizes production reader");Check(BgiDraw::RoleCount==1&&BgiDraw::RoleOf("1234,5678,9abc")&&!strcmp(BgiDraw::RoleOf("1234,5678,9abc"),"name"),"real serialized role prefix maps a matching actual via chain");}
 const wchar_t *bad[]={L"#cfg roles=10\r\n",L"#cfg roles=0\r\n#cfg roles=1\r\n",L"body #cfg roles=1\r\n",L"#cfg roles=1",L"#cfg roles=1 roles=0\r\n",L"#cfg roles=1 roles=1\r\n",L"#cfgjunk roles=1\r\n",L"\x6323\x6766\x7220\x6c6f\x7365\x313d\x000a"};
 for(auto s:bad){Control(s);Check(!BgiDraw::ReadControl(),"production reader rejects wrong/duplicate/body/truncated/malformed authorization");Check(BgiDraw::RoleCount==0,"invalid authorization clears old role mappings");}
 Control(L"\xfeff#cfg roles=1 embed=0 zh=1\r\n#role 1234,5678=name\r\n#role 12345=line\r\n");Check(BgiDraw::ReadControl()&&BgiDraw::RoleCount==2,"BOM and multiple valid role prefixes retain the original contract");Check(!BgiDraw::RoleOf("1234a,5678")&&!BgiDraw::RoleOf("1234,56780"),"role prefix requires an RVA-component boundary");
 Control(L"\xfeff#cfg roles=1\r\n#role 1234=evil\r\n#role zz=name\r\n#role 1234=name\r\n本文\t译文\r\n#role 9999=line\r\n");Check(BgiDraw::ReadControl()&&BgiDraw::RoleCount==1&&BgiDraw::RoleOf("1234"),"only valid metadata role lines are accepted before data rows");
 Control(L"\xfeff#cfg roles=0\r\n#role 1234=name\r\n");Check(!BgiDraw::ReadControl()&&BgiDraw::RoleCount==0,"roles0 clears every role map");
 Control(L"\xfeff#cfg roles=1\r\n#role 1234=name\r\n");Check(BgiDraw::ReadControl(),"reader recovers after authorization returns");HANDLE locked=CreateFileW(ControlFile().c_str(),GENERIC_READ,0,nullptr,OPEN_EXISTING,0,nullptr);Check(locked!=INVALID_HANDLE_VALUE&&!BgiDraw::ReadControl()&&BgiDraw::RoleCount==0,"unreadable control revokes and clears old mappings");if(locked!=INVALID_HANDLE_VALUE)CloseHandle(locked);
 Control(L"\xfeff#cfg roles=1\r\n#role 1234=name\r\n");Check(BgiDraw::ReadControl(),"valid control recovers after read failure");
 std::wstring big=L"\xfeff#cfg roles=1 "+std::wstring(9000,L' ')+L"\r\n";Control(big.c_str());Check(!BgiDraw::ReadControl()&&BgiDraw::RoleCount==0,"truncated bounded read never accepts an incomplete first line");
 const char *roles[]={"line","name","choice","button","menu","system"};for(auto r:roles)Check(BgiDraw::ValidRole("1,12345678,a,b,c,d",r),"all existing role names and maximum component count remain valid");
 const char *invalid[]={"",",1","1,","1,,2","123456789","1,2,3,4,5,6,7","zz","ABCD"};for(auto v:invalid)Check(!BgiDraw::ValidRole(v,"line"),"malformed or over-limit via prefixes are rejected");
 const char rawAscii[]="#cfg roles=1\n";Raw(rawAscii,sizeof rawAscii-1);Check(!BgiDraw::ReadControl()&&!BgiDraw::RoleCount,"raw ASCII cannot impersonate UTF16LE cfg");
 wchar_t oldTmp[32768]={},missing[32768];DWORD n=GetEnvironmentVariableW(L"TMP",oldTmp,32768);swprintf_s(missing,L"H:\\MeguLit-Work\\tmp\\bgi-missing-%lu\\",GetCurrentProcessId());SetEnvironmentVariableW(L"TMP",missing);Check(!BgiDraw::ReadControl()&&!BgiDraw::RoleCount,"missing control path revokes maps");SetEnvironmentVariableW(L"TMP",n?oldTmp:nullptr);
 printf("BGI production control: %d checks, %d failures\n",Checks,Failures);return Failures;
}
