/* SPDX-License-Identifier: GPL-3.0-or-later */
#pragma once
#include <windows.h>
#include <cstdio>
#include <string>
/* Match KrkrTransport: write a complete sibling file and replace, so the watcher
   can retain its read handle without conflicting with a share-zero writer */
static void WriteControlFixture(const std::wstring &file,const void *bytes,DWORD size){
 const std::wstring pending=file+L".fixture-pending";
 HANDLE h=CreateFileW(pending.c_str(),GENERIC_WRITE,0,nullptr,CREATE_ALWAYS,0,nullptr);
 if(h==INVALID_HANDLE_VALUE){printf("FAIL control fixture open: %lu\n",GetLastError());ExitProcess(77);}
 DWORD written=0;BOOL ok=WriteFile(h,bytes,size,&written,nullptr);DWORD error=GetLastError();
 if(ok&&written==size){ok=FlushFileBuffers(h);error=GetLastError();}CloseHandle(h);
 if(!ok||written!=size){printf("FAIL control fixture write: %lu %lu/%lu\n",error,written,size);ExitProcess(77);}
 if(!MoveFileExW(pending.c_str(),file.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH)){
  printf("FAIL control fixture replace: %lu\n",GetLastError());ExitProcess(77);
 }
}
