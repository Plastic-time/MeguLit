// SPDX-License-Identifier: GPL-3.0-or-later
// engine-draw, SiglusEngine (docs/engine-draw-native.md; template: YurisDraw.h). Every glyph any text area of the engine
// lays out goes through one std::vector<moji>::push_back, found by structure in any build (SiglusDrawSig.h; CLANNAD
// 1.1.134.0 and Summer Pockets 1.1.137.0 both match). At that push the moji on the caller's stack holds the character,
// its x / y in the text area, its size and colour number; the return address tells which layout pushed it, and for the
// message layout add_msg's own return address ([ebp+4]) tells which VM command called it:
//   print   mwnd.print -> role=line        namemsg  a name inside the message -> role=name     backlog  msgbk -> role=system
//   name    mwnd.namae (name window) -> role=name     msgsel  mwnd.sel / selmsg item -> role=choice
//   selbtn  global.selbtn item -> role=choice          ruby    mwnd.ruby: the reading glyphs above a base, folded into
//                                                       the base run as ruby=<start>:<len>:<reading> (the reading
//                                                       is the msg's own ruby string, the base is the run's glyphs
//                                                       between the ruby start and the pen)
// One record a run (the glyphs of one text area on one line), MESSAGE_SIZE caps a line at 500 bytes:
//   ToMe_DRAWRUN engine=siglus run=N role=R id=<layout>:<text area> n= x0= y0= x1= y1= size= color= [ruby=s:l:よみ|...] text=
// x0 y0 = the top left of the first glyph cell, x1 y1 = the bottom right of the last (x + size, y + size), in the text
// area's own pixels: where each text area sits on screen is learned per game (version diff) from these runs and the
// glyph / GPU positions, as for YU-RIS. color = the engine's colour number (-1 = the window's default), not RGB. A text
// area cleared for a new page (msg::clear):
//   ToMe_DRAWRUN engine=siglus clear id=<text area>
// Where a text area sits on the game's screen (msg::frame, when the build has it; Gameexe #SCREEN_SIZE pixels, guessed
// from the engine using the same sum for its mouse hit rects): once it has held for 3 frames and changed,
//   ToMe_DRAWRUN engine=siglus origin id=<text area> ox= oy=
// and every later run of that area carries ox= oy= too (screen x = x0 + ox). rgb= is the colour number through the
// engine's own colour table (#COLOR_TABLE, 0xFFRRGGBB entries), when the build has the lookup.
// Opt-in: nothing is hooked until MeguLit's control file %TEMP%\MeguLit\draw\<pid>.txt says roles=1 (draw.roles of this
// game's diff in The Seed); a watcher thread checks it every 2 s. The hooks call the game's own functions in every case
// and only read the engine's memory (inside __try).
#pragma once
#include <windows.h>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
#include "MinHook.h"
#include "SiglusDrawSig.h"
namespace SiglusDraw {
static void *OrigPush = nullptr, *OrigClear = nullptr, *OrigFrame = nullptr;
static SiglusDrawSig::Result Sig;
static volatile LONG Armed = 0, Installed = 0, Observing = 0;
static bool Permitted=false,Blocked=false;
static LONG Epoch=0;
static CRITICAL_SECTION Lock;
// moji layout (both builds): +0 type (0 = character), +4 code, +8 size, +0xc colour no., +0x18 x, +0x1c y
struct Moji { int type, code, size, color, x, y; long rgb; };
struct Glyph { long x, y, size; wchar_t c; };
enum { R_LINE, R_NAME, R_CHOICE, R_SYSTEM };
static const char *const RoleName[] = {"line", "name", "choice", "system"};
// the current run (under Lock)
static uintptr_t RunVec = 0; static int RunRole = -1, RunSrc = -1, RunColor = 0; static long RunRgb = -1; static unsigned Run = 0, RunNo = 0;
static std::vector<Glyph> RunG; static std::string RunRuby; static DWORD LastTick = 0;
// the ruby being laid out: the glyphs of one ruby call come one after another
static bool InRuby = false;
// text areas that drew since their last clear (a clear of any other is not news)
static uintptr_t Drawn[32]; static int NDrawn = 0;
// screen origin per text area (keyed by its glyph vector, like the run ids)
struct Origin { uintptr_t vec; long ox, oy, cx, cy; int same; bool known, told; };
static Origin Origins[32]; static int NOrigins = 0;
static void ResetPending(){
 RunVec=0;RunRole=RunSrc=-1;RunColor=0;RunRgb=-1;RunNo=0;
 RunG.clear();RunRuby.clear();LastTick=0;InRuby=false;
 NDrawn=NOrigins=0;memset(Drawn,0,sizeof Drawn);memset(Origins,0,sizeof Origins);
}
static void RevokeLocked(){Epoch++;Permitted=false;InterlockedExchange(&Observing,0);ResetPending();}
static Origin *OriginOf(uintptr_t vec, bool make) {
  for (int i = 0; i < NOrigins; i++) if (Origins[i].vec == vec) return &Origins[i];
  if (!make) return nullptr;
  if (NOrigins == 32) { memmove(Origins, Origins + 1, sizeof(Origins) - sizeof(Origins[0])); NOrigins--; }
  Origin *o = &Origins[NOrigins++]; memset(o, 0, sizeof *o); o->vec = vec; return o;
}

static std::string Utf8(const wchar_t *w, int n) {
  if (n <= 0) return std::string();
  int m = WideCharToMultiByte(CP_UTF8, 0, w, n, nullptr, 0, nullptr, nullptr); std::string r(m, '\0');
  WideCharToMultiByte(CP_UTF8, 0, w, n, &r[0], m, nullptr, nullptr); return r;
}
static void Clean(std::string &t, size_t cap) {
  if (t.size() > cap) { size_t cut = cap; while (cut > 0 && ((unsigned char)t[cut] & 0xc0) == 0x80) cut--; t.resize(cut); }
  for (char &c : t) if (c == '\r' || c == '\n' || c == '\t') c = ' ';
}
static void Flush() {
  if(!Observing){ResetPending();return;}
  if(RunG.empty())return;
  LONG epoch=Epoch;int role=RunRole,src=RunSrc,color=RunColor;uintptr_t vec=RunVec;unsigned number=RunNo;size_t count=RunG.size();
  if(role<0||role>R_SYSTEM||src<0||src>=SiglusDrawSig::P_COUNT){ResetPending();return;}
  long x0=RunG[0].x,y0=RunG[0].y,x1=x0,y1=y0,size=0;std::wstring w;
  for(auto &g:RunG){
    if(g.x<x0)x0=g.x;if(g.y<y0)y0=g.y;
    if(g.x+g.size>x1)x1=g.x+g.size;if(g.y+g.size>y1)y1=g.y+g.size;
    if(g.size>size)size=g.size;w.push_back(g.c);
  }
  std::string ruby=RunRuby;Clean(ruby,90);
  char extra[64]="";Origin *o=OriginOf(vec,false);
  if(RunRgb>=0)sprintf_s(extra," rgb=%06lx",RunRgb&0xffffff);
  if(o&&o->known){size_t n=strlen(extra);sprintf_s(extra+n,sizeof extra-n," ox=%ld oy=%ld",o->ox,o->oy);}
  std::string t=Utf8(w.data(),(int)w.size());Clean(t,120);
  if(!Observing||epoch!=Epoch)return;
  Msg::Log("ToMe_DRAWRUN engine=siglus run=%u role=%s id=%s:%x n=%d x0=%ld y0=%ld x1=%ld y1=%ld size=%ld color=%d%s%s%s text=%s",
           number,RoleName[role],SiglusDrawSig::PushName[src],(unsigned)vec,(int)count,
           x0,y0,x1,y1,size,color,extra,ruby.empty()?"":" ruby=",ruby.c_str(),t.c_str());
  if(!Observing||epoch!=Epoch)return;
  RunG.clear();RunRuby.clear();
}
static void MarkDrawn(uintptr_t msg) {
  for (int i = 0; i < NDrawn; i++) if (Drawn[i] == msg) return;
  if (NDrawn < 32) Drawn[NDrawn++] = msg; else { memmove(Drawn, Drawn + 1, sizeof(Drawn) - sizeof(Drawn[0])); Drawn[31] = msg; }
}
// a ruby: the reading and the base's start, read from the msg the ruby glyphs go into (copied inside __try)
struct RubyInfo { bool ok; long startX, startY, penX, penAdd; wchar_t text[64]; int n; };
static RubyInfo ReadRuby(uintptr_t msg) {
  RubyInfo r{}; __try {
    const unsigned char *m = (const unsigned char *)msg;
    r.startX = *(const long *)(m + Sig.rubyX); r.startY = *(const long *)(m + Sig.rubyY);
    r.penX = *(const long *)(m + Sig.penX); r.penAdd = *(const long *)(m + Sig.penAdd);
    // MSVC std::wstring: 16 bytes (inline buffer or pointer), size, capacity
    const unsigned char *s = m + Sig.rubyStr; size_t size = *(const size_t *)(s + 16), cap = *(const size_t *)(s + 20);
    const wchar_t *p = cap >= 8 ? *(const wchar_t *const *)s : (const wchar_t *)s;
    r.n = (int)(size < 63 ? size : 63); for (int i = 0; i < r.n; i++) r.text[i] = p[i];
    r.ok = r.n > 0;
  } __except (EXCEPTION_EXECUTE_HANDLER) { r.ok = false; }
  return r;
}
static void OnRubyStart(uintptr_t vec) {
  if(!Observing||vec!=RunVec||RunG.empty())return;
  LONG epoch=Epoch;RubyInfo r=ReadRuby(vec-(uintptr_t)Sig.vec);if(!r.ok)return;
  long y=RunG.back().y;int start=-1,len=0;
  for(int i=0;i<(int)RunG.size();i++){
    long px=RunG[i].x-r.penAdd;
    if(RunG[i].y==y&&px>=r.startX&&px<r.penX){if(start<0)start=i;len=i-start+1;}
  }
  if(start<0)return;
  char head[32];sprintf_s(head,"%d:%d:",start,len);
  std::string reading=Utf8(r.text,r.n);for(char &c:reading)if(c=='|'||c==' ')c='_';
  if(!Observing||epoch!=Epoch)return;
  if(!RunRuby.empty())RunRuby+='|';RunRuby+=head;RunRuby+=reading;
}
static void HandleUnsafe(int src, int addSrc, uintptr_t vec, const Moji &m) {
  if(!Observing||src<0||src>=SiglusDrawSig::P_COUNT)return;
  LONG epoch=Epoch;
  LastTick = GetTickCount();
  if (src == SiglusDrawSig::P_RUBY) { if (!InRuby) { InRuby = true; OnRubyStart(vec); } return; }
  InRuby = false;
  int role = R_LINE;
  if (src == SiglusDrawSig::P_PRINT) role = addSrc == SiglusDrawSig::A_NAMEMSG ? R_NAME : addSrc == SiglusDrawSig::A_BACKLOG ? R_SYSTEM : R_LINE;
  else if (src == SiglusDrawSig::P_NAME) role = R_NAME;
  else if (src == SiglusDrawSig::P_MSGSEL || src == SiglusDrawSig::P_SELBTN) role = R_CHOICE;
  else role = R_SYSTEM;
  bool same = !RunG.empty() && vec == RunVec && role == RunRole && src == RunSrc && m.y == RunG.back().y && m.x >= RunG.back().x;
  if (!same) { Flush();if(!Observing||epoch!=Epoch)return;RunNo = ++Run; RunVec = vec; RunRole = role; RunSrc = src; RunColor = m.color; RunRgb = m.rgb; }
  Glyph g; g.x = m.x; g.y = m.y; g.size = m.size; g.c = m.type == 0 ? (wchar_t)m.code : (wchar_t)0xfffc; RunG.push_back(g);
  if (src == SiglusDrawSig::P_PRINT || src == SiglusDrawSig::P_NAME) MarkDrawn(vec - (uintptr_t)Sig.vec);
  if (RunG.size() > 400) Flush();
}
static void OnPushUnsafe(DWORD ret, const unsigned char *moji, uintptr_t vec, const unsigned char *callerEbp) {
  Moji m{}; int src, addSrc = -1;
  __try {
    src = SiglusDrawSig::PushRole(Sig, ret);
    if (src == SiglusDrawSig::P_PRINT) addSrc = SiglusDrawSig::AddRole(Sig, *(const DWORD *)(callerEbp + 4));
    m.type = *(const int *)moji; m.code = *(const int *)(moji + 4) & 0xffff; m.size = *(const int *)(moji + 8);
    m.color = *(const int *)(moji + 0xc); m.x = *(const int *)(moji + 0x18); m.y = *(const int *)(moji + 0x1c);
    m.rgb = -1;
    if (Sig.colors) { // the engine's lookup: table[clamp(no, 0, n - 1)]
      const DWORD *b = *(const DWORD *const *)(uintptr_t)Sig.colors, *e = *(const DWORD *const *)((uintptr_t)Sig.colors + 4);
      long n = (long)(e - b);
      if (b && n > 0) { long i = m.color < 0 ? 0 : m.color > n - 1 ? n - 1 : m.color; m.rgb = (long)(b[i] & 0xffffff); }
    }
  } __except (EXCEPTION_EXECUTE_HANDLER) { ResetPending();return; }
  HandleUnsafe(src, addSrc, vec, m);
}
static void OnClearUnsafe(uintptr_t msg) {
  LONG epoch=Epoch;bool news=false;
  for(int i=0;i<NDrawn;i++)if(Drawn[i]==msg){news=true;Drawn[i]=Drawn[--NDrawn];break;}
  if(news){
    if(RunVec-(uintptr_t)Sig.vec==msg){Flush();if(!Observing||epoch!=Epoch)return;}
    InRuby=false;Msg::Log("ToMe_DRAWRUN engine=siglus clear id=%x",(unsigned)(msg+(uintptr_t)Sig.vec));
  }
}
// at msg::frame: ecx = the msg, the arguments on the caller's stack (entry esp + ebp displacement - 4)
static void OnFrameUnsafe(uintptr_t msg, const unsigned char *esp) {
  LONG epoch=Epoch;long ox, oy;
  __try {
    const unsigned char *param = *(const unsigned char *const *)(esp + 4);
    ox = (long)*(const float *)(param + Sig.frameX) + *(const long *)(esp + Sig.frameArgX - 4);
    oy = (long)*(const float *)(param + Sig.frameY) + *(const long *)(esp + Sig.frameArgY - 4);
  } __except (EXCEPTION_EXECUTE_HANDLER) { ResetPending();return; }
  uintptr_t vec = msg + (uintptr_t)Sig.vec;
  if(!Observing||epoch!=Epoch)return;
  Origin *o = OriginOf(vec, true);
  if (ox == o->cx && oy == o->cy) o->same++; else { o->cx = ox; o->cy = oy; o->same = 1; }
  // settled (3 frames) and new: a window opening slides, its last place is the one that counts
  if (o->same == 3 && (!o->told || o->ox != ox || o->oy != oy)) {
    o->ox = ox; o->oy = oy; o->known = true; o->told = true;
    Msg::Log("ToMe_DRAWRUN engine=siglus origin id=%x ox=%ld oy=%ld", (unsigned)vec, ox, oy);
  }
}
static int ObservationException(DWORD code){return code==0xe06d7363?EXCEPTION_CONTINUE_SEARCH:EXCEPTION_EXECUTE_HANDLER;}
static void PushSafe(DWORD ret,const unsigned char *moji,uintptr_t vec,const unsigned char *ebp){__try{OnPushUnsafe(ret,moji,vec,ebp);}__except(ObservationException(GetExceptionCode())){ResetPending();}}
static void ClearSafe(uintptr_t msg){__try{OnClearUnsafe(msg);}__except(ObservationException(GetExceptionCode())){ResetPending();}}
static void FrameSafe(uintptr_t msg,const unsigned char *esp){__try{OnFrameUnsafe(msg,esp);}__except(ObservationException(GetExceptionCode())){ResetPending();}}
static void __cdecl OnPush(DWORD ret,const unsigned char *moji,uintptr_t vec,const unsigned char *ebp){
 EnterCriticalSection(&Lock);try{if(Observing)PushSafe(ret,moji,vec,ebp);}catch(...){ResetPending();}LeaveCriticalSection(&Lock);
}
static void __cdecl OnClear(uintptr_t msg){
 EnterCriticalSection(&Lock);try{if(Observing)ClearSafe(msg);}catch(...){ResetPending();}LeaveCriticalSection(&Lock);
}
static void __cdecl OnFrame(uintptr_t msg,const unsigned char *esp){
 EnterCriticalSection(&Lock);try{if(Observing)FrameSafe(msg,esp);}catch(...){ResetPending();}LeaveCriticalSection(&Lock);
}
static void Handle(int src,int add,uintptr_t vec,const Moji &m){
 EnterCriticalSection(&Lock);try{if(Observing)HandleUnsafe(src,add,vec,m);}catch(...){ResetPending();}LeaveCriticalSection(&Lock);
}
static const DWORD ObserverMxcsr=0x1f80;
static __declspec(naked) void FrameGate() {
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
    lea eax,[ebx+36]
    push eax
    push dword ptr [ebx+24]
    call OnFrame
    add esp,8
    fxrstor [esp]
    mov esp,ebx
    popad
    popfd
    jmp dword ptr [OrigFrame]
  }
}
static __declspec(naked) void PushGate() {
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
    push dword ptr [ebx+8]
    push dword ptr [ebx+24]
    push dword ptr [ebx+40]
    push dword ptr [ebx+36]
    call OnPush
    add esp,16
    fxrstor [esp]
    mov esp,ebx
    popad
    popfd
    jmp dword ptr [OrigPush]
  }
}
static __declspec(naked) void ClearGate() {
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
    push dword ptr [ebx+24]
    call OnClear
    add esp,4
    fxrstor [esp]
    mov esp,ebx
    popad
    popfd
    jmp dword ptr [OrigClear]
  }
}
// the module's executable sections
static bool FindInImage(uintptr_t base) {
  auto dos = (IMAGE_DOS_HEADER *)base; auto nt = (IMAGE_NT_HEADERS *)(base + dos->e_lfanew); auto sec = IMAGE_FIRST_SECTION(nt);
  SiglusDrawSig::Seg segs[8]; int ns = 0;
  for (int i = 0; i < nt->FileHeader.NumberOfSections && ns < 8; i++, sec++) {
    if (!(sec->Characteristics & IMAGE_SCN_MEM_EXECUTE)) continue;
    segs[ns].va = (std::uint32_t)(base + sec->VirtualAddress); segs[ns].b = (const unsigned char *)(base + sec->VirtualAddress); segs[ns].n = sec->Misc.VirtualSize; ns++;
  }
  Sig = SiglusDrawSig::Find(segs, ns);
  if (!Sig.ok) { Msg::Log("ToMe_DRAWRUN engine=siglus off: %s", Sig.why); return false; }
  return true;
}
// a run nobody continued for 150 ms is complete (Siglus lays out a whole print at once)
static void IdleSafe(){__try{if(!RunG.empty()&&GetTickCount()-LastTick>150)Flush();}__except(ObservationException(GetExceptionCode())){ResetPending();}}
static void FlushIdle(){EnterCriticalSection(&Lock);try{if(Observing)IdleSafe();}catch(...){ResetPending();}LeaveCriticalSection(&Lock);}
static bool Install() {
  if(Installed)return true;if(Blocked)return false;
  if(MH_CreateHook((void *)(uintptr_t)Sig.push,(void *)PushGate,&OrigPush)!=MH_OK||
     MH_CreateHook((void *)(uintptr_t)Sig.clear,(void *)ClearGate,&OrigClear)!=MH_OK||
     MH_EnableHook((void *)(uintptr_t)Sig.push)!=MH_OK||MH_EnableHook((void *)(uintptr_t)Sig.clear)!=MH_OK){
    // Any enabled gate remains pass-through; keep its trampoline and block uncertain retries.
    Blocked=true;Msg::Log("ToMe_DRAWRUN engine=siglus off: hook failed at push %x clear %x",Sig.push,Sig.clear);return false;
  }
  bool frame=Sig.frame&&MH_CreateHook((void *)(uintptr_t)Sig.frame,(void *)FrameGate,&OrigFrame)==MH_OK&&MH_EnableHook((void *)(uintptr_t)Sig.frame)==MH_OK;
  InterlockedExchange(&Installed,1);
  Msg::Log("ToMe_DRAWRUN engine=siglus on: push %x add_msg %x clear %x frame %x colors %x vec=%x sites=%d adds=%d",Sig.push,Sig.addMsg,Sig.clear,frame?Sig.frame:0,Sig.colors,Sig.vec,Sig.nSites,Sig.nAdds);
  return true;
}
static bool RolesFromControl(const unsigned char *bytes,size_t length){
 char line[256];size_t used=0,pos=0;bool wide=false,complete=false;
 if(length>=2&&bytes[0]==0xff&&bytes[1]==0xfe){wide=true;pos=2;}
 else if(length>=2&&bytes[0]=='#'&&!bytes[1])wide=true;
 else if(length>=3&&bytes[0]==0xef&&bytes[1]==0xbb&&bytes[2]==0xbf)pos=3;
 while(pos<length&&used<sizeof(line)-1){
  if(wide&&(pos+1>=length||bytes[pos+1]))return false;
  unsigned char c=bytes[pos];pos+=wide?2:1;
  if(c=='\r'){
   if(pos>=length||bytes[pos]!='\n'||(wide&&(pos+1>=length||bytes[pos+1])))return false;
   complete=true;break;
  }
  if(c=='\n'){complete=true;break;}
  if(c!='\t'&&(c<32||c>126))return false;
  line[used++]=(char)c;
 }
 if(!complete||used<5||std::memcmp(line,"#cfg",4)||(line[4]!=' '&&line[4]!='\t'))return false;
 bool found=false,enabled=false;
 for(size_t i=4;i<used;){
  while(i<used&&(line[i]==' '||line[i]=='\t'))i++;
  size_t start=i;while(i<used&&line[i]!=' '&&line[i]!='\t')i++;
  size_t size=i-start;
  if(size==5&&!std::memcmp(line+start,"roles",5))return false;
  if(size>=6&&!std::memcmp(line+start,"roles=",6)){
   if(found)return false;found=true;enabled=size==7&&line[start+6]=='1';
  }
 }
 return found&&enabled;
}
static bool LoadControl(){
 wchar_t tmp[MAX_PATH],file[MAX_PATH+64];DWORD n=GetTempPathW(MAX_PATH,tmp);if(!n||n>=MAX_PATH)return false;
 swprintf_s(file,L"%sMeguLit\\draw\\%lu.txt",tmp,GetCurrentProcessId());HANDLE h=CreateFileW(file,GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,0,nullptr);if(h==INVALID_HANDLE_VALUE)return false;
 unsigned char bytes[512];DWORD got=0;BOOL ok=ReadFile(h,bytes,sizeof bytes,&got,nullptr);CloseHandle(h);
 return ok&&RolesFromControl(bytes,got);
}
static bool RolesAsked(){
 EnterCriticalSection(&Lock);bool allowed=false;
 try{allowed=LoadControl();if(!allowed)RevokeLocked();else{if(!Permitted){Epoch++;ResetPending();}Permitted=true;}}catch(...){RevokeLocked();}
 LeaveCriticalSection(&Lock);return allowed;
}
static void RefreshControl(){
 try{if(RolesAsked()&&Install()){EnterCriticalSection(&Lock);if(Permitted)InterlockedExchange(&Observing,1);LeaveCriticalSection(&Lock);}}
 catch(...){EnterCriticalSection(&Lock);RevokeLocked();LeaveCriticalSection(&Lock);}
}
static DWORD WINAPI Watch(void *stop){
 DWORD last=GetTickCount()-2000;
 for(;;){
  DWORD now=GetTickCount();if(now-last>=2000){RefreshControl();last=now;}
  if(Observing)FlushIdle();
  DWORD delay=Observing?50:2000;if(stop){if(WaitForSingleObject((HANDLE)stop,delay)==WAIT_OBJECT_0)return 0;}else Sleep(delay);
 }
}
// called from Siglus::attach_function; never fails the engine
static void Arm(uintptr_t imageBase) {
  if (InterlockedExchange(&Armed, 1)) return;
  __try { if (!FindInImage(imageBase)) return; } __except (EXCEPTION_EXECUTE_HANDLER) { return; }
  InitializeCriticalSection(&Lock);
  HANDLE t = CreateThread(nullptr, 0, Watch, nullptr, 0, nullptr); if (t) CloseHandle(t);
}
}
