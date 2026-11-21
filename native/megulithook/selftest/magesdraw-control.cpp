// SPDX-License-Identifier: GPL-3.0-or-later
// Actual serialized transport files, read by the production reader without a game.
#include <windows.h>
#include <cstdio>
#include <string>
namespace Msg{static void Log(const char *,...) {}}
#ifndef MAGES_HEADER
#define MAGES_HEADER "../MagesDraw.h"
#endif
#include MAGES_HEADER
static int Failures=0,Checks=0;
static bool Allowed(){bool roles=false;MagesDraw::Table table;return MagesDraw::ReadControl(roles,table)&&roles;}
static void Check(bool ok,const char *s){Checks++;printf("%s %s\n",ok?"PASS":"FAIL",s);if(!ok)Failures++;}
static std::wstring ControlFile(){wchar_t tmp[MAX_PATH],file[MAX_PATH+64];GetTempPathW(MAX_PATH,tmp);std::wstring dir=std::wstring(tmp)+L"MeguLit";CreateDirectoryW(dir.c_str(),nullptr);dir+=L"\\draw";CreateDirectoryW(dir.c_str(),nullptr);swprintf_s(file,L"%s\\%lu.txt",dir.c_str(),GetCurrentProcessId());return file;}
static void Raw(const void *text,DWORD bytes){HANDLE h=CreateFileW(ControlFile().c_str(),GENERIC_WRITE,0,nullptr,CREATE_ALWAYS,0,nullptr);DWORD written;WriteFile(h,text,bytes,&written,nullptr);CloseHandle(h);}
static void Control(const wchar_t *s){Raw(s,(DWORD)(wcslen(s)*2));}
int wmain(int argc,wchar_t **argv){
#ifdef MAGES_PERMISSION_FIXED
 InitializeCriticalSection(&MagesDraw::Lock);
#endif
 if(argc>1){HANDLE h=CreateFileW(argv[1],GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,0,nullptr);unsigned char b[16384];DWORD got=0;bool ok=h!=INVALID_HANDLE_VALUE&&ReadFile(h,b,sizeof b,&got,nullptr);if(h!=INVALID_HANDLE_VALUE)CloseHandle(h);Raw(b,got);Check(ok&&Allowed(),"real JS KrkrTransport UTF16LE BOM authorizes production reader");}
 const wchar_t *bad[]={L"#cfg roles=10\r\n",L"#cfg roles=0\r\n#cfg roles=1\r\n",L"body #cfg roles=1\r\n",L"#cfg roles=1",L"#cfg roles=1 roles=0\r\n",L"#cfg roles=1 roles=1\r\n",L"#cfgjunk roles=1\r\n",L"\xfeff\x6323\x6766\x7220\x6c6f\x7365\x313d\x000a",L"#cfg roles=\r\n",L"#cfg xroles=1\r\n",L"#cfg roles roles=1\r\n",L"#cfg roles=1\troles=0\r\n",L"#cfg roles=1\r",L"\xfeff#cfg roles=1\x010a"};
 for(auto s:bad){Control(s);Check(!Allowed(),"production reader rejects wrong/duplicate/body/truncated/malformed authorization");}
 Control(L"\xfeff#cfg roles=1\r\n#table mages drawDialogue=0x10,0x20 drawGlyph=0x30 commit=0x40 clear=0x50,0x60 pages=0x70 stride=0xea9c chars=2000\r\n");bool roles=false;MagesDraw::Table table;Check(MagesDraw::ReadControl(roles,table)&&roles&&table.has&&table.dlg[0]==0x10&&table.dlg[1]==0x20&&table.clears==2&&table.clear[1]==0x60&&table.stride==0xea9c,"complete address metadata preserves existing table fields");
 Control(L"\xfeff#cfg roles=1\r\nbody\ttranslation\r\n#table mages drawDialogue=0x10,0x20 drawGlyph=0x30 commit=0x40 clear=0x50 pages=0x70 stride=0xea9c\r\n");roles=false;table=MagesDraw::Table{};Check(MagesDraw::ReadControl(roles,table)&&roles&&!table.has,"body fake table cannot become metadata");
 Control(L"\xfeff#cfg roles=1\r\n#table mages drawDialogue=0x10,0x20 drawGlyph=0x30 commit=0x40 clear=0x50 pages=0x70 stride=0xea9c");Check(!Allowed(),"truncated table cannot silently remove version constraints");
 Control(L"\xfeff#cfg roles=1\r\n#table mages drawDialogue=0x10,0x20 drawGlyph=0x30 commit=0x40 commit=0x41 clear=0x50 pages=0x70 stride=0xea9c\r\n");Check(!Allowed(),"duplicate address key cannot choose an ambiguous pin");
 const char utf8[]="\xef\xbb\xbf#cfg\troles=1\tembed=0\r\n";Raw(utf8,sizeof utf8-1);Check(Allowed(),"legacy UTF8 BOM and tab tokens remain supported");
 Control(L"\xfeff#cfg roles=1 embed=0 zh=1\r\n本文\t译文\r\n");Check(Allowed(),"BOM first line permits non-ASCII body data");
 Control(L"#cfg roles=1 embed=0\n");Check(Allowed(),"BOM-less UTF16LE with complete LF line remains supported");
 std::wstring big=L"\xfeff#cfg roles=1 "+std::wstring(9000,L' ')+L"\r\n";Control(big.c_str());Check(!Allowed(),"bounded read cannot authorize an incomplete first line");
 const char rawAscii[]="#cfg roles=1\n";Raw(rawAscii,sizeof rawAscii-1);Check(Allowed(),"legacy ASCII complete first cfg line remains supported");
 const unsigned char odd[]={0xff,0xfe,'#',0,'c',0,'f',0,'g',0,' ',0,'r',0,'o',0,'l',0,'e',0,'s',0,'=',0,'1',0,'\n'};Raw(odd,sizeof odd);Check(!Allowed(),"odd-byte incomplete UTF16 newline cannot authorize");
 Control(L"\xfeff#cfg roles=1\r\n");Check(Allowed(),"reader recovers after malformed input");HANDLE locked=CreateFileW(ControlFile().c_str(),GENERIC_READ,0,nullptr,OPEN_EXISTING,0,nullptr);Check(locked!=INVALID_HANDLE_VALUE&&!Allowed(),"unreadable control rejects prior permission");if(locked!=INVALID_HANDLE_VALUE)CloseHandle(locked);
 Check(Allowed(),"reader recovers when file becomes readable");
 wchar_t oldTmp[32768]={},missing[32768];DWORD n=GetEnvironmentVariableW(L"TMP",oldTmp,32768);swprintf_s(missing,L"H:\\MeguLit-Work\\tmp\\mages-missing-%lu\\",GetCurrentProcessId());SetEnvironmentVariableW(L"TMP",missing);Check(!Allowed(),"missing control path rejects prior permission");SetEnvironmentVariableW(L"TMP",n?oldTmp:nullptr);
 printf("MAGES production control: %d checks, %d failures\n",Checks,Failures);return Failures;
}
