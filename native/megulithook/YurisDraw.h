// SPDX-License-Identifier: GPL-3.0-or-later
// engine-draw, YU-RIS (docs/engine-draw-native.md; template for the other native engines): the dialogue glyph loop's call
// into the glyph blitter, found by structure in any build (YurisDrawSig.h; euphoria, euphoria HD, 女装山脈, サイコロジック all
// match exactly once). At that call EAX points at the character in the string being drawn and the caller's stack holds the
// glyph's x / y on the window's text canvas, so every run of text a YU-RIS window draws comes out with its characters and
// their canvas boxes, one record a run (MESSAGE_SIZE caps a line at 500 bytes):
//   ToMe_DRAWRUN engine=yuris run=N canvas=<blitter arg> n=<chars> x0= y0= x1= y1= size=<advance> text=<UTF-8, cut at 120 bytes>
// Canvas pixels, not the screen: where each window's canvas sits is learned per game (version diff) from these runs and
// the glyph / GPU positions, and the runs' texts against the hook streams' roles (scenario / name / other).
// Opt-in: nothing is hooked until MeguLit's control file %TEMP%\MeguLit\draw\<pid>.txt says roles=1 (draw.roles of this
// game's diff); a watcher thread checks it every 2 s. The hook calls the game's own blitter in every case.
#pragma once
#include <windows.h>
#include <cstdio>
#include <cstring>
#include <string>
#include "MinHook.h"
#include "YurisDrawSig.h"
namespace YurisDraw {
static void *Original = nullptr;
static uintptr_t CallAt = 0;
static int XSlot = 0, YSlot = 0;
static volatile LONG Armed = 0, Installed = 0, Observing = 0;
static bool Permitted = false, Blocked = false;
static LONG Epoch = 0;
static CRITICAL_SECTION Lock;
// Pending runs and permission epochs share the lock; watcher revocation discards them.
static const unsigned char *RunNext = nullptr; static long RunY = 0, X0 = 0, Y0 = 0, X1 = 0, Y1 = 0, Size = 0, LastX = 0;
static int RunChars = 0; static unsigned Run = 0; static std::string RunText;

static std::string Utf8(const std::string &sjis) {
  int n = MultiByteToWideChar(932, 0, sjis.data(), (int)sjis.size(), nullptr, 0); if (n <= 0) return std::string();
  std::wstring w(n, L'\0'); MultiByteToWideChar(932, 0, sjis.data(), (int)sjis.size(), &w[0], n);
  int m = WideCharToMultiByte(CP_UTF8, 0, w.data(), n, nullptr, 0, nullptr, nullptr); std::string r(m, '\0');
  WideCharToMultiByte(CP_UTF8, 0, w.data(), n, &r[0], m, nullptr, nullptr); return r;
}
static void ResetPending(){RunNext=nullptr;RunY=X0=Y0=X1=Y1=Size=LastX=0;RunChars=0;RunText.clear();}
static void RevokeLocked(){Epoch++;Permitted=false;InterlockedExchange(&Observing,0);ResetPending();}
static void Flush() {
  if(!Observing){ResetPending();return;}
  if (!RunChars) return;
  LONG epoch=Epoch;
  std::string t = Utf8(RunText);
  if (t.size() > 120) { size_t cut = 120; while (cut > 0 && ((unsigned char)t[cut] & 0xc0) == 0x80) cut--; t.resize(cut); }
  for (char &c : t) if (c == '\r' || c == '\n') c = ' ';
  Msg::Log("ToMe_DRAWRUN engine=yuris run=%u n=%d x0=%ld y0=%ld x1=%ld y1=%ld size=%ld text=%s", Run, RunChars, X0, Y0, X1, Y1, Size, t.c_str());
  if(epoch!=Epoch||!Observing)return;
  RunChars = 0; RunText.clear();
}
static void OnGlyphUnsafe(const unsigned char *ch,const unsigned char *callerEsp){
    LONG epoch=Epoch;
    long x = *(const long *)(callerEsp + XSlot), y = *(const long *)(callerEsp + YSlot);
    int bytes = YurisDrawSig::CharBytes(ch[0]);
    bool same = RunChars && ch == RunNext;
    if (!same) { Flush();if(!Observing||epoch!=Epoch)return;Run++; X0 = X1 = x; Y0 = Y1 = y; Size = 0; }
    else if (y == RunY && x > LastX && x - LastX < 400 && x - LastX > Size) Size = x - LastX;
    if (x < X0) X0 = x; if (y < Y0) Y0 = y; if (x > X1) X1 = x; if (y > Y1) Y1 = y;
    RunText.append((const char *)ch, bytes); RunChars++; RunNext = ch + bytes; RunY = y; LastX = x;
    if (RunText.size() > 2000) Flush();
}
static void OnGlyphSafe(const unsigned char *ch,const unsigned char *callerEsp){
 __try{OnGlyphUnsafe(ch,callerEsp);}__except(GetExceptionCode()==0xe06d7363?EXCEPTION_CONTINUE_SEARCH:EXCEPTION_EXECUTE_HANDLER){ResetPending();}
}
static void __cdecl OnGlyph(const unsigned char *ch,const unsigned char *callerEsp){
 EnterCriticalSection(&Lock);try{if(Observing)OnGlyphSafe(ch,callerEsp);}catch(...){ResetPending();}LeaveCriticalSection(&Lock);
}
static const DWORD ObserverMxcsr=0x1f80;
static __declspec(naked) void Gate() {
  __asm {
    pushfd
    pushad
    mov ebx,esp
    sub esp,527
    and esp,0xfffffff0
    fxsave [esp]
    fninit
    ldmxcsr ObserverMxcsr
    cld
    lea eax,[ebx+36]             // original ESP at the CALL instruction, no pushed return address
    push eax
    push dword ptr [ebx+28]     // original EAX is the current character pointer
    call OnGlyph
    add esp,8
    fxrstor [esp]
    mov esp,ebx
    popad
    popfd
    jmp dword ptr [Original]
  }
}
// the module's executable sections
static bool FindInImage(uintptr_t base) {
  auto dos = (IMAGE_DOS_HEADER *)base; auto nt = (IMAGE_NT_HEADERS *)(base + dos->e_lfanew); auto sec = IMAGE_FIRST_SECTION(nt);
  int total = 0; YurisDrawSig::Hit hit{};
  for (int i = 0; i < nt->FileHeader.NumberOfSections; i++, sec++) {
    if (!(sec->Characteristics & IMAGE_SCN_MEM_EXECUTE)) continue;
    YurisDrawSig::Hit h[2]; int n = YurisDrawSig::Find((const unsigned char *)(base + sec->VirtualAddress), sec->Misc.VirtualSize > 64 ? sec->Misc.VirtualSize - 64 : 0, h, 2);
    if (n >= 1 && !total) { hit = h[0]; hit.call += base + sec->VirtualAddress; }
    total += n;
  }
  if (total != 1) { Msg::Log("ToMe_DRAWRUN engine=yuris off: %d dialogue loop matches (want 1)", total); return false; }
  CallAt = hit.call; XSlot = hit.x; YSlot = hit.y; return true;
}
static bool Install() {
  if(Installed)return true;
  if(Blocked)return false;
  if(MH_CreateHook((void *)CallAt,(void *)Gate,&Original)!=MH_OK||MH_EnableHook((void *)CallAt)!=MH_OK){
    // An uncertain MinHook failure must retain any trampoline and cannot be retried blindly.
    Blocked=true;Msg::Log("ToMe_DRAWRUN engine=yuris off: hook failed at %p",(void *)CallAt);return false;
  }
  InterlockedExchange(&Installed,1);
  Msg::Log("ToMe_DRAWRUN engine=yuris on: call %p x=[esp+%x] y=[esp+%x]",(void *)CallAt,XSlot,YSlot);
  return true;
}
// The real transport is UTF-16LE. Only its complete first ASCII cfg line can grant roles.
static bool ParseControl(const unsigned char *raw,size_t bytes){
 if(bytes<2)return false;size_t at=0;if(raw[0]==0xff&&raw[1]==0xfe)at=2;else if(raw[1])return false;
 std::string line;bool complete=false;
 for(;at+2<=bytes;at+=2){
  unsigned c=raw[at],high=raw[at+1];if(high)return false;
  if(c=='\n'){complete=true;break;}
  if(c=='\r'){complete=at+4<=bytes&&raw[at+2]=='\n'&&!raw[at+3];break;}
  if(c<0x20||c>0x7e)return false;line+=(char)c;
 }
 if(!complete||line.compare(0,5,"#cfg "))return false;int keys=0;bool on=false;
 for(size_t begin=5;begin<line.size();){
  while(begin<line.size()&&line[begin]==' ')begin++;
  size_t end=line.find(' ',begin);if(end==std::string::npos)end=line.size();
  std::string token=line.substr(begin,end-begin);
  if(!token.compare(0,6,"roles=")){keys++;on=token=="roles=1";}else if(token=="roles")return false;
  begin=end;
 }
 return keys==1&&on;
}
static bool LoadControl(){
 wchar_t tmp[MAX_PATH];DWORD n=GetTempPathW(MAX_PATH,tmp);if(!n||n>=MAX_PATH)return false;
 wchar_t path[MAX_PATH+64];swprintf_s(path,L"%sMeguLit\\draw\\%lu.txt",tmp,GetCurrentProcessId());
 HANDLE h=CreateFileW(path,GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,0,nullptr);
 if(h==INVALID_HANDLE_VALUE)return false;
 unsigned char raw[1024];DWORD got=0;bool ok=ReadFile(h,raw,sizeof raw,&got,nullptr)!=FALSE;CloseHandle(h);
 return ok&&ParseControl(raw,got);
}
static bool RolesAsked(){
 // Serialize reads with revocation, so a delayed old read cannot re-grant a newer denied epoch.
 EnterCriticalSection(&Lock);bool allowed=false;
 try{allowed=LoadControl();if(!allowed)RevokeLocked();else{if(!Permitted){Epoch++;ResetPending();}Permitted=true;}}
 catch(...){RevokeLocked();}
 LeaveCriticalSection(&Lock);return allowed;
}
static void RefreshControl(){
 if(RolesAsked()&&Install()){EnterCriticalSection(&Lock);if(Permitted)InterlockedExchange(&Observing,1);LeaveCriticalSection(&Lock);}
}
static DWORD WINAPI Watch(void *stop){
 for(;;){RefreshControl();if(stop){if(WaitForSingleObject((HANDLE)stop,2000)==WAIT_OBJECT_0)return 0;}else Sleep(2000);}
}
// called from Yuris::attach_function; never fails the engine
static void Arm(uintptr_t imageBase) {
  if (InterlockedExchange(&Armed, 1)) return;
  InitializeCriticalSection(&Lock);
  __try { if (!FindInImage(imageBase)) return; } __except (EXCEPTION_EXECUTE_HANDLER) { return; }
  HANDLE t = CreateThread(nullptr, 0, Watch, nullptr, 0, nullptr); if (t) CloseHandle(t);
}
}
