// SPDX-License-Identifier: GPL-3.0-or-later
// Actual serialized transport files, read by the production reader without a game.
#include <windows.h>
#include <cstdio>
#include <string>
namespace Msg{static void Log(const char *,...) {}}
#ifndef SIGLUS_HEADER
#define SIGLUS_HEADER "../SiglusDraw.h"
#endif
#include SIGLUS_HEADER
static int Failures=0,Checks=0;
static void Check(bool ok,const char *s){Checks++;printf("%s %s\n",ok?"PASS":"FAIL",s);if(!ok)Failures++;}
static std::wstring ControlFile(){wchar_t tmp[MAX_PATH],file[MAX_PATH+64];GetTempPathW(MAX_PATH,tmp);std::wstring dir=std::wstring(tmp)+L"MeguLit";CreateDirectoryW(dir.c_str(),nullptr);dir+=L"\\draw";CreateDirectoryW(dir.c_str(),nullptr);swprintf_s(file,L"%s\\%lu.txt",dir.c_str(),GetCurrentProcessId());return file;}
static void Raw(const void *text,DWORD bytes){HANDLE h=CreateFileW(ControlFile().c_str(),GENERIC_WRITE,0,nullptr,CREATE_ALWAYS,0,nullptr);DWORD written;WriteFile(h,text,bytes,&written,nullptr);CloseHandle(h);}
static void Control(const wchar_t *s){Raw(s,(DWORD)(wcslen(s)*2));}
int wmain(int argc,wchar_t **argv){
#ifdef SIGLUS_PERMISSION_FIXED
 InitializeCriticalSection(&SiglusDraw::Lock);
#endif
 if(argc>1){HANDLE h=CreateFileW(argv[1],GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,0,nullptr);unsigned char b[16384];DWORD got=0;bool ok=h!=INVALID_HANDLE_VALUE&&ReadFile(h,b,sizeof b,&got,nullptr);if(h!=INVALID_HANDLE_VALUE)CloseHandle(h);Raw(b,got);Check(ok&&SiglusDraw::RolesAsked(),"real JS KrkrTransport UTF16LE BOM authorizes production reader");}
 const wchar_t *bad[]={L"#cfg roles=10\r\n",L"#cfg roles=0\r\n#cfg roles=1\r\n",L"body #cfg roles=1\r\n",L"#cfg roles=1",L"#cfg roles=1 roles=0\r\n",L"#cfg roles=1 roles=1\r\n",L"#cfgjunk roles=1\r\n",L"\xfeff\x6323\x6766\x7220\x6c6f\x7365\x313d\x000a",L"#cfg roles=\r\n",L"#cfg xroles=1\r\n",L"#cfg roles roles=1\r\n",L"#cfg roles=1\troles=0\r\n",L"#cfg roles=1\r",L"\xfeff#cfg roles=1\x010a"};
 for(auto s:bad){Control(s);Check(!SiglusDraw::RolesAsked(),"production reader rejects wrong/duplicate/body/truncated/malformed authorization");}
 const char utf8[]="\xef\xbb\xbf#cfg\troles=1\tembed=0\r\n";Raw(utf8,sizeof utf8-1);Check(SiglusDraw::RolesAsked(),"legacy UTF8 BOM and tab tokens remain supported");
 Control(L"\xfeff#cfg roles=1 embed=0 zh=1\r\n本文\t译文\r\n");Check(SiglusDraw::RolesAsked(),"BOM first line permits non-ASCII body data");
 Control(L"#cfg roles=1 embed=0\n");Check(SiglusDraw::RolesAsked(),"BOM-less UTF16LE with complete LF line remains supported");
 std::wstring big=L"\xfeff#cfg roles=1 "+std::wstring(9000,L' ')+L"\r\n";Control(big.c_str());Check(!SiglusDraw::RolesAsked(),"bounded read cannot authorize an incomplete first line");
 const char rawAscii[]="#cfg roles=1\n";Raw(rawAscii,sizeof rawAscii-1);Check(SiglusDraw::RolesAsked(),"legacy ASCII complete first cfg line remains supported");
 const unsigned char odd[]={0xff,0xfe,'#',0,'c',0,'f',0,'g',0,' ',0,'r',0,'o',0,'l',0,'e',0,'s',0,'=',0,'1',0,'\n'};Raw(odd,sizeof odd);Check(!SiglusDraw::RolesAsked(),"odd-byte incomplete UTF16 newline cannot authorize");
 Control(L"\xfeff#cfg roles=1\r\n");Check(SiglusDraw::RolesAsked(),"reader recovers after malformed input");HANDLE locked=CreateFileW(ControlFile().c_str(),GENERIC_READ,0,nullptr,OPEN_EXISTING,0,nullptr);Check(locked!=INVALID_HANDLE_VALUE&&!SiglusDraw::RolesAsked(),"unreadable control rejects prior permission");if(locked!=INVALID_HANDLE_VALUE)CloseHandle(locked);
 Check(SiglusDraw::RolesAsked(),"reader recovers when file becomes readable");
 wchar_t oldTmp[32768]={},missing[32768];DWORD n=GetEnvironmentVariableW(L"TMP",oldTmp,32768);swprintf_s(missing,L"H:\\MeguLit-Work\\tmp\\siglus-missing-%lu\\",GetCurrentProcessId());SetEnvironmentVariableW(L"TMP",missing);Check(!SiglusDraw::RolesAsked(),"missing control path rejects prior permission");SetEnvironmentVariableW(L"TMP",n?oldTmp:nullptr);
 printf("Siglus production control: %d checks, %d failures\n",Checks,Failures);return Failures;
}
