// SPDX-License-Identifier: GPL-3.0-or-later
// engine-draw, MAGES. (docs/engine-draw-native.md; YU-RIS is the template): read what MAGES draws from the engine's own
// dialogue pages instead of from the screen. Every MAGES build seen so far (STEINS;GATE, STEINS;GATE 0, CHAOS;CHILD,
// 線形拘束のフェノグラム, 比翼恋理のだーりん) keeps each text window's characters in a static array of pages (layout in
// MagesDrawSig.h / tools/engine-sigs/mages-draw.cjs) and fills a page only through one function, the commit, which copies
// the laid-out SC3 string (u16 codes; 0x8000|c is an SC3 control kept as a marker: 0x8001 name start, 0x8002 name end)
// into the page. So at the commit we have, from the engine itself:
//   - every character's glyph code (row*64+col = the SC3 character code, decoded with the game's charset by the kernel),
//     its box (charDisplayX/Y, glyphDisplayWidth/Height, times the engine's own scale: game canvas pixels, 1920x1080 for
//     the Steam builds), its colour,
//   - which characters are the speaker's name (between the markers) and which page it is: the SC3 Mes instruction commits
//     into the thread's window page (role line), Sel into page 7 (role choice; the page's per-character flag = the choice
//     number) and SysSel into page 5 + window (role choice, system selections). Verified statically in all five exes
//     (Sel / SysSel / Mes are opcodes 01 12 / 01 14 / 01 0C, Committee of Zero's impacto opcode tables).
// The two page clears (memset of the page's arrays, pageLength = 0) are a clear event; drawDialogue being called for a page
// is its first frame on screen. One page = one unit until it is cleared: a sentence the game commits in several pieces
// (SC3 waits / PrintInParallel; CHAOS;CHILD) is one line with a growing text, never two lines.
// Records (hook-diagnostics.log, MESSAGE_SIZE caps a line at 500 bytes, so long pages continue in more lines):
//   ToMe_DRAWRUN engine=mages on: <rvas> | off: <why>
//   ToMe_DRAWRUN engine=mages ev=add page=P seq=S role=line|choice|system from=F n=N scale=1.5 codes=hhhh..   (markers too; 80 a line)
//   ToMe_DRAWRUN engine=mages ev=more page=P seq=S codes=hhhh..
//   ToMe_DRAWBOX engine=mages page=P seq=S at=I rects=x,y,w,h;.. color=rrggbb,.. flag=f,..  (12 characters a line, in order)
//   ToMe_DRAWRUN engine=mages ev=clear page=P seq=S         ToMe_DRAWRUN engine=mages ev=show page=P seq=S opacity=O
//   ToMe_DRAWRUN engine=mages ev=view bb=W,H client=W,H     (the back buffer the 16:9 scene is drawn into, width-fit and
//     centred vertically, and the client area Present stretches it over: the kernel places the 1920x1080 canvas from these)
//   ToMe_DRAWRUN engine=mages ev=glyph site=<rva> n=N box=x,y,w,h size=H color=rrggbb   (any other text the engine draws:
//     menus, backlog, phone; one line when a caller's run changes; role from the version layer's site table)
// The kernel side (tools/engine-sigs/mages-draw.cjs parse + PageTracker) decodes the codes and assembles the pages.
// Opt-in: nothing is hooked until MeguLit's control file %TEMP%\MeguLit\draw\<pid>.txt says roles=1 (draw.roles of this
// game's diff); when the version layer has this exe's address table (draw.engineTable, a "#table mages ..." line) it must
// agree with the signature or nothing is hooked. Every hook calls the game's own function and changes nothing it sees.
#pragma once
#ifdef _WIN64
// This dialogue-page implementation covers the five x86 fixtures only; MAGES64 draw signatures are not implemented
#include <cstdint>
namespace MagesDraw { inline void Arm(uintptr_t) {} }
#else
#include <windows.h>
#include <cstdio>
#include <cstring>
#include <string>
#include "MinHook.h"
#include "MagesDrawSig.h"
#pragma comment(lib, "user32.lib") // the game window's client size (ev=view)
namespace MagesDraw {
static const int MaxPages = 10, SelPage = 7, SysSelPage = 5;
static uintptr_t Base = 0, Dlg[2] = {0, 0}, DlgEnd[2] = {0, 0}, Glyph = 0, Commit = 0, Clear[4] = {0, 0, 0, 0}; static int Clears = 0;
static uintptr_t Pages = 0, Count = 0, Codes = 0, Info = 0, ScaleAt = 0; static std::uint32_t Stride = 0; static int Chars = 0;
static void *CommitOrig = nullptr, *ClearOrig[4] = {}, *DlgOrig[2] = {}, *GlyphOrig = nullptr;
static volatile LONG Armed = 0, Installed = 0, Blocked = 0, Permission = 0;
static CRITICAL_SECTION Lock;
// Separate from observation epochs: even an off-to-off control request supersedes an older refresh.
static unsigned __int64 RefreshRequest=0;
static __declspec(thread) bool InObserver=false;
static LONG Ticket(){return InterlockedCompareExchange(&Permission,0,0);}
static bool Allowed(LONG ticket){return (ticket&1)&&Ticket()==ticket;}
static void ResetPending();
static unsigned Seq[MaxPages] = {}; static bool Shown[MaxPages] = {};
static uintptr_t Backbuffer = 0; // u16 width, u16 at +4 height (0 = not found: the kernel takes the client size)
static HWND GameWindow = nullptr; static int ViewSent[4] = {-1, -1, -1, -1};
static BOOL CALLBACK FindWindowOfProcess(HWND h, LPARAM out) {
  DWORD pid = 0; GetWindowThreadProcessId(h, &pid); RECT r;
  if (pid == GetCurrentProcessId() && IsWindowVisible(h) && !GetWindow(h, GW_OWNER) && GetClientRect(h, &r) && r.right > 200 && r.bottom > 150) { *(HWND *)out = h; return FALSE; }
  return TRUE;
}
// where the canvas ends up: the back buffer size (the game's) and the client size it is stretched over; a line when either changes
static void View(LONG ticket) {
  int bw = 0, bh = 0, cw = 0, ch = 0;
  __try { if (Backbuffer) { bw = *(const std::uint16_t *)Backbuffer; bh = *(const std::uint16_t *)(Backbuffer + 4); } } __except (EXCEPTION_EXECUTE_HANDLER) { bw = bh = 0; }
  if (!GameWindow || !IsWindow(GameWindow)) { GameWindow = nullptr; EnumWindows(FindWindowOfProcess, (LPARAM)&GameWindow); }
  RECT r; if (GameWindow && GetClientRect(GameWindow, &r)) { cw = r.right - r.left; ch = r.bottom - r.top; }
  if (bw == ViewSent[0] && bh == ViewSent[1] && cw == ViewSent[2] && ch == ViewSent[3]) return;
  ViewSent[0] = bw; ViewSent[1] = bh; ViewSent[2] = cw; ViewSent[3] = ch;
  if(!Allowed(ticket))return;
  Msg::Log("ToMe_DRAWRUN engine=mages ev=view bb=%d,%d client=%d,%d", bw, bh, cw, ch);
}
static float Scale() { float s = 1.0f; __try { s = *(const float *)ScaleAt; } __except (EXCEPTION_EXECUTE_HANDLER) {} return s > 0.1f && s < 8.0f ? s : 1.0f; }
static std::uint8_t *PageAt(int p) { return (std::uint8_t *)(Pages + (uintptr_t)p * Stride); }
static int PageLength(int p) { int n = *(const int *)(PageAt(p) + 0xc); return n >= 0 && n <= Chars ? n : -1; }

// ---- the commit: snapshot the layout before, read the new characters after ----
// Every patched return owns one TLS slot and its own after-thunk. Revocation never erases these.
struct ReturnFrame{
 bool used;int kind;uintptr_t realReturn;LONG ticket;
 int page,from,n;std::uint16_t codes[1024];bool skip[1024];int before[MaxPages];
};
static __declspec(thread) ReturnFrame Returns[8]={};
static uintptr_t ReturnGate(int slot);
static bool CaptureEnter(ReturnFrame &f,const std::uint32_t *esp){
 if(f.kind==1){
  int page=(int)esp[1];if(page<0||page>=MaxPages)return false;
  int n=*(const int *)Count;if(n<=0||n>1024)return false;int from=PageLength(page);if(from<0)return false;
  f.page=page;f.from=from;f.n=n;
  for(int i=0;i<n;i++){f.codes[i]=*(const std::uint16_t *)(Codes+2*i);f.skip[i]=*(const std::uint32_t *)(Info+16*i)==0;}
 }else{for(int p=0;p<MaxPages;p++){f.before[p]=PageLength(p);if(f.before[p]<0)return false;}}
 return true;
}
static const char *RoleOf(int page) { return page == SelPage || (page >= SysSelPage && page < SelPage) ? "choice" : page < SysSelPage ? "line" : "system"; }
// what one commit added, copied out of the game's memory first (no C++ objects next to __try), formatted after
static struct Added { int page, from, to, nCodes; float scale; std::uint16_t codes[1024]; int rect[2000][4]; unsigned color[2000]; std::uint8_t flag[2000]; } Add;
static bool ReadAdded(int page,const ReturnFrame &frame) {
  __try {
    int to = PageLength(page); if (to < frame.from) return false;
    if (to - frame.from > 2000) to = frame.from + 2000;
    float s = Scale(); const std::uint8_t *pg = PageAt(page) + 0x3c; int S = Chars, at = frame.from, n = 0;
    for (int i = 0; i < frame.n && n < 1024; i++) {
      std::uint16_t c = frame.codes[i];
      if (!(c & 0x8000)) { if (frame.skip[i]) continue; if (at >= to) break; c = (std::uint16_t)(pg[13 * S + at] * 64 + pg[12 * S + at]); at++; }
      Add.codes[n++] = c;
    }
    const std::int16_t *x = (const std::int16_t *)(pg + 16 * S), *y = (const std::int16_t *)(pg + 18 * S), *w = (const std::int16_t *)(pg + 20 * S), *h = (const std::int16_t *)(pg + 22 * S);
    for (int k = frame.from; k < to; k++) { int j = k - frame.from; Add.rect[j][0] = (int)(x[k] * s); Add.rect[j][1] = (int)(y[k] * s); Add.rect[j][2] = (int)(w[k] * s); Add.rect[j][3] = (int)(h[k] * s);
      Add.color[j] = ((const std::uint32_t *)(pg + 4 * S))[k] & 0xffffff; Add.flag[j] = pg[24 * S + k]; }
    Add.page = page; Add.from = frame.from; Add.to = to; Add.nCodes = n; Add.scale = s; return true;
  } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
static void OnCommitLeave(const ReturnFrame &frame) {
  LONG ticket=frame.ticket;int page=frame.page;if(!Allowed(ticket)||page<0||!ReadAdded(page,frame))return;
  if (Add.from == 0) { Seq[page]++; Shown[page] = false; }
  // codes: the layout's markers and the page's glyph codes in order, 80 a line (MESSAGE_SIZE 500)
  for (int i = 0, line = 0; i < Add.nCodes || (i == 0 && line == 0); line++) {
    if(!Allowed(ticket))return;
    std::string codes; for (int k = 0; k < 80 && i < Add.nCodes; k++, i++) { char h[8]; snprintf(h, sizeof h, "%04x", Add.codes[i]); codes += h; }
    if (!line) Msg::Log("ToMe_DRAWRUN engine=mages ev=add page=%d seq=%u role=%s from=%d n=%d scale=%.3g codes=%s", page, Seq[page], RoleOf(page), Add.from, Add.to - Add.from, Add.scale, codes.c_str());
    else Msg::Log("ToMe_DRAWRUN engine=mages ev=more page=%d seq=%u codes=%s", page, Seq[page], codes.c_str());
    if(!Allowed(ticket))return;
    if (!Add.nCodes) break;
  }
  // boxes (game canvas pixels), colours, the page's flag byte (choice number on choice pages), 12 characters a line
  for (int i = Add.from; i < Add.to; i += 12) {
    if(!Allowed(ticket))return;
    std::string r, col, flag; int end = i + 12 < Add.to ? i + 12 : Add.to;
    for (int k = i; k < end; k++) { int j = k - Add.from; char t[64];
      snprintf(t, sizeof t, "%s%d,%d,%d,%d", k > i ? ";" : "", Add.rect[j][0], Add.rect[j][1], Add.rect[j][2], Add.rect[j][3]); r += t;
      snprintf(t, sizeof t, "%s%06x", k > i ? "," : "", Add.color[j]); col += t;
      snprintf(t, sizeof t, "%s%u", k > i ? "," : "", (unsigned)Add.flag[j]); flag += t; }
    Msg::Log("ToMe_DRAWBOX engine=mages page=%d seq=%u at=%d rects=%s color=%s flag=%s", page, Seq[page], i, r.c_str(), col.c_str(), flag.c_str());
    if(!Allowed(ticket))return;
  }
}
// ---- clears: page lengths before / after ----
static void OnClearLeave(const ReturnFrame &frame){
 for(int p=0;p<MaxPages;p++){
  if(!Allowed(frame.ticket))return;
  if(frame.before[p]>0&&PageLength(p)==0){
   Shown[p]=false;Msg::Log("ToMe_DRAWRUN engine=mages ev=clear page=%d seq=%u",p,Seq[p]);
   if(!Allowed(frame.ticket))return;
  }
 }
}
// ---- drawDialogue(font, page, opacity): the page's first frame on screen ----
static unsigned DialogueCalls=0;
static void OnDialogueUnsafe(const std::uint32_t *esp,LONG ticket){
 if(++DialogueCalls%120==1){View(ticket);if(!Allowed(ticket))return;}
 int page=(int)esp[2];if(page<0||page>=MaxPages||Shown[page]||PageLength(page)<=0)return;
 Shown[page]=true;View(ticket);if(!Allowed(ticket))return;
 Msg::Log("ToMe_DRAWRUN engine=mages ev=show page=%d seq=%u opacity=%u",page,Seq[page],esp[3]);
}
// ---- drawGlyph(tex, sx, sy, sw, sh, x0, y0, x1, y1, color, opacity) from anything but drawDialogue ----
static uintptr_t RunSite = 0; static int RunN = 0; static float RX0, RY0, RX1, RY1, RH; static unsigned RColor, RHash; static unsigned LastHash[64]; static uintptr_t LastSite[64];
static void ResetPending(){
 memset(Shown,0,sizeof Shown);memset(&Add,0,sizeof Add);DialogueCalls=0;
 RunSite=0;RunN=0;RX0=RY0=RX1=RY1=RH=0;RColor=RHash=0;
 memset(LastHash,0,sizeof LastHash);memset(LastSite,0,sizeof LastSite);
 GameWindow=nullptr;for(int i=0;i<4;i++)ViewSent[i]=-1;
}
static void SetPermissionLocked(bool on){
 LONG old=Ticket();if(((old&1)!=0)==on)return;
 InterlockedExchange(&Permission,(LONG)((ULONG)old+1));ResetPending();
 // Keep sequence identities monotonic; an off/on must not join a host's old cached page.
 if(!on)for(int p=0;p<MaxPages;p++)Seq[p]++;
}
static void SetPermission(bool on){EnterCriticalSection(&Lock);SetPermissionLocked(on);LeaveCriticalSection(&Lock);}
static void FlushRunUnsafe(LONG ticket){
 if(!Allowed(ticket)||!RunN)return;int slot=-1;
 for(int i=0;i<64;i++)if(LastSite[i]==RunSite||!LastSite[i]){slot=i;break;}
 if(slot>=0&&!(LastSite[slot]==RunSite&&LastHash[slot]==RHash)){
  LastSite[slot]=RunSite;LastHash[slot]=RHash;
  Msg::Log("ToMe_DRAWRUN engine=mages ev=glyph site=%x n=%d box=%d,%d,%d,%d size=%d color=%06x",(unsigned)(RunSite-Base),RunN,(int)RX0,(int)RY0,(int)(RX1-RX0),(int)(RY1-RY0),(int)RH,RColor&0xffffff);
  if(!Allowed(ticket))return;
 }
 RunN=0;
}
static bool InDialogue(uintptr_t ret){for(int i=0;i<2;i++)if(ret>Dlg[i]&&ret<DlgEnd[i])return true;return false;}
static void OnGlyphUnsafe(const std::uint32_t *esp,LONG ticket){
 uintptr_t ret=esp[0];if(InDialogue(ret))return;
 const float *f=(const float *)(esp+2);float x0=f[4],y0=f[5],x1=f[6],y1=f[7];
 if(ret!=RunSite||(RunN&&(y0>RY1+4*RH||x0<RX0-4*RH))){
  FlushRunUnsafe(ticket);if(!Allowed(ticket))return;RunSite=ret;RHash=2166136261u;
 }
 if(!RunN){RX0=x0;RY0=y0;RX1=x1;RY1=y1;RH=y1-y0;RColor=esp[10];}
 if(x0<RX0)RX0=x0;if(y0<RY0)RY0=y0;if(x1>RX1)RX1=x1;if(y1>RY1)RY1=y1;
 unsigned v[3]={esp[2],esp[3],(unsigned)(int)x0};for(unsigned q:v)RHash=(RHash^q)*16777619u;
 RunN++;
}
static int ObservationException(DWORD code){return code==0xe06d7363?EXCEPTION_CONTINUE_SEARCH:EXCEPTION_EXECUTE_HANDLER;}
static void PreSafe(int kind,const std::uint32_t *esp,LONG ticket){
 __try{if(kind==1)OnDialogueUnsafe(esp,ticket);else if(kind==2)OnGlyphUnsafe(esp,ticket);else FlushRunUnsafe(ticket);}
 __except(ObservationException(GetExceptionCode())){ResetPending();}
}
static void PreLocked(int kind,const std::uint32_t *esp,LONG ticket){
 EnterCriticalSection(&Lock);try{if(Allowed(ticket))PreSafe(kind,esp,ticket);}catch(...){ResetPending();}LeaveCriticalSection(&Lock);
}
static void ObservePre(int kind,const std::uint32_t *esp){
 LONG ticket=Ticket();if(!(ticket&1)||InObserver)return;InObserver=true;
 __try{PreLocked(kind,esp,ticket);}__finally{InObserver=false;}
}
static void __cdecl OnDialogue(const std::uint32_t *esp){ObservePre(1,esp);}
static void __cdecl OnGlyph(const std::uint32_t *esp){ObservePre(2,esp);}
static void FlushRun(){ObservePre(3,nullptr);}
// ---- call/return gates: never hold Lock across the original, never pop another frame's return ----
static bool PrepareSafe(ReturnFrame &f,std::uint32_t *esp,int slot){
 __try{
  if(!CaptureEnter(f,esp)||!Allowed(f.ticket))return false;
  f.realReturn=esp[0];esp[0]=(std::uint32_t)ReturnGate(slot);return true;
 }__except(ObservationException(GetExceptionCode())){return false;}
}
static void EnterLocked(std::uint32_t *esp,int slot){
 ReturnFrame &f=Returns[slot];EnterCriticalSection(&Lock);bool prepared=false;
 try{if(Allowed(f.ticket))prepared=PrepareSafe(f,esp,slot);}catch(...){ResetPending();}
 if(!prepared)memset(&f,0,sizeof f);LeaveCriticalSection(&Lock);
}
static void __cdecl EnterReturn(std::uint32_t *esp,int kind){
 LONG ticket=Ticket();if(!(ticket&1)||InObserver)return;
 int slot=0;while(slot<8&&Returns[slot].used)slot++;if(slot==8)return;
 ReturnFrame &f=Returns[slot];f.used=true;f.kind=kind;f.ticket=ticket;InObserver=true;
 __try{EnterLocked(esp,slot);}__finally{InObserver=false;}
}
static void PostSafe(const ReturnFrame &f){
 __try{if(f.kind==1)OnCommitLeave(f);else OnClearLeave(f);}
 __except(ObservationException(GetExceptionCode())){ResetPending();}
}
static void PostLocked(const ReturnFrame &f){
 EnterCriticalSection(&Lock);try{if(Allowed(f.ticket))PostSafe(f);}catch(...){ResetPending();}LeaveCriticalSection(&Lock);
}
static uintptr_t __cdecl AfterReturn(int slot){
 ReturnFrame &f=Returns[slot];uintptr_t ret=f.realReturn;
 // An original exception may bypass this thunk. Its slot is intentionally never guessed free.
 if(!f.used)return ret;InObserver=true;
 __try{PostLocked(f);}__finally{InObserver=false;memset(&f,0,sizeof f);}
 return ret;
}
static const DWORD ObserverMxcsr=0x1f80;
#define MAGESDRAW_AFTER(i) static __declspec(naked) void After##i(){ \
 __asm push eax __asm pushfd __asm pushad __asm mov ebx,esp \
 __asm sub esp,527 __asm and esp,0xfffffff0 __asm fxsave [esp] \
 __asm fninit __asm ldmxcsr ObserverMxcsr __asm cld \
 __asm push i __asm call AfterReturn __asm add esp,4 __asm mov [ebx+36],eax \
 __asm fxrstor [esp] __asm mov esp,ebx __asm popad __asm popfd __asm ret }
MAGESDRAW_AFTER(0) MAGESDRAW_AFTER(1) MAGESDRAW_AFTER(2) MAGESDRAW_AFTER(3)
MAGESDRAW_AFTER(4) MAGESDRAW_AFTER(5) MAGESDRAW_AFTER(6) MAGESDRAW_AFTER(7)
static void *ReturnGates[8]={(void *)After0,(void *)After1,(void *)After2,(void *)After3,(void *)After4,(void *)After5,(void *)After6,(void *)After7};
static uintptr_t ReturnGate(int slot){return (uintptr_t)ReturnGates[slot];}
#define MAGESDRAW_ENTER_GATE(name,kind,orig) static __declspec(naked) void name(){ \
 __asm pushfd __asm pushad __asm mov ebx,esp \
 __asm sub esp,527 __asm and esp,0xfffffff0 __asm fxsave [esp] \
 __asm fninit __asm ldmxcsr ObserverMxcsr __asm cld \
 __asm push kind __asm lea eax,[ebx+36] __asm push eax __asm call EnterReturn __asm add esp,8 \
 __asm fxrstor [esp] __asm mov esp,ebx __asm popad __asm popfd __asm jmp dword ptr [orig] }
MAGESDRAW_ENTER_GATE(CommitGate,1,CommitOrig)
MAGESDRAW_ENTER_GATE(ClearGate0,2,ClearOrig)
MAGESDRAW_ENTER_GATE(ClearGate1,2,ClearOrig+4)
MAGESDRAW_ENTER_GATE(ClearGate2,2,ClearOrig+8)
MAGESDRAW_ENTER_GATE(ClearGate3,2,ClearOrig+12)
static void *ClearGates[4]={(void *)ClearGate0,(void *)ClearGate1,(void *)ClearGate2,(void *)ClearGate3};
#define MAGESDRAW_PRE_GATE(name,fn,orig) static __declspec(naked) void name(){ \
 __asm pushfd __asm pushad __asm mov ebx,esp \
 __asm sub esp,527 __asm and esp,0xfffffff0 __asm fxsave [esp] \
 __asm fninit __asm ldmxcsr ObserverMxcsr __asm cld \
 __asm lea eax,[ebx+36] __asm push eax __asm call fn __asm add esp,4 \
 __asm fxrstor [esp] __asm mov esp,ebx __asm popad __asm popfd __asm jmp dword ptr [orig] }
MAGESDRAW_PRE_GATE(DlgGate0,OnDialogue,DlgOrig)
MAGESDRAW_PRE_GATE(DlgGate1,OnDialogue,DlgOrig+4)
MAGESDRAW_PRE_GATE(GlyphGate,OnGlyph,GlyphOrig)

// ---- finding: the signature, checked against the version layer's table when there is one ----
struct Table { bool has = false; uintptr_t dlg[2] = {}, glyph = 0, commit = 0, clear[4] = {}, pages = 0; int clears = 0; std::uint32_t stride = 0; };
// Decode only complete control metadata. Later translation/body rows cannot supply cfg or address pins.
static bool ControlLine(const unsigned char *raw,size_t bytes,size_t &at,bool wide,std::string &line,bool &ascii){
 line.clear();ascii=true;
 while(at<bytes){
  if(wide&&at+1>=bytes)return false;
  unsigned c=raw[at],high=wide?raw[at+1]:0;at+=wide?2:1;
  if(!high&&c=='\n')return true;
  if(!high&&c=='\r'){if(at>=bytes||raw[at]!='\n'||(wide&&(at+1>=bytes||raw[at+1])))return false;at+=wide?2:1;return true;}
  if(high||(c!='\t'&&(c<0x20||c>0x7e)))ascii=false;line+=(char)c;
 }
 return false;
}
static bool CfgRoles(const std::string &line,bool &roles){
 if(line.size()<5||line.compare(0,4,"#cfg")||(line[4]!=' '&&line[4]!='\t'))return false;
 int keys=0;bool on=false;
 for(size_t a=4;a<line.size();){
  while(a<line.size()&&(line[a]==' '||line[a]=='\t'))a++;size_t end=line.find_first_of(" \t",a);if(end==std::string::npos)end=line.size();std::string token=line.substr(a,end-a);
  if(!token.compare(0,6,"roles=")){keys++;if(token!="roles=1"&&token!="roles=0")return false;on=token=="roles=1";}else if(token=="roles")return false;a=end;
 }
 roles=keys==1&&on;return keys==1;
}
static bool AddressList(const std::string &text,uintptr_t *out,int cap,int &count){
 count=0;for(size_t begin=0;begin<text.size();){
  if(count>=cap)return false;size_t end=text.find(',',begin);if(end==std::string::npos)end=text.size();size_t at=begin;
  if(end-at>=2&&text[at]=='0'&&(text[at+1]=='x'||text[at+1]=='X'))at+=2;if(at==end||end-at>8)return false;
  std::uint32_t value=0;for(;at<end;at++){unsigned c=(unsigned char)text[at];int digit=c>='0'&&c<='9'?c-'0':c>='a'&&c<='f'?c-'a'+10:c>='A'&&c<='F'?c-'A'+10:-1;if(digit<0)return false;value=(value<<4)|(unsigned)digit;}out[count++]=value;
  if(end==text.size())return true;begin=end+1;if(begin==text.size())return false;
 }return false;
}
static bool AddressTable(const std::string &line,Table &t){
 if(line.compare(0,13,"#table mages "))return false;unsigned seen=0;Table parsed;parsed.has=true;
 for(size_t a=13;a<line.size();){
  while(a<line.size()&&(line[a]==' '||line[a]=='\t'))a++;size_t end=line.find_first_of(" \t",a);if(end==std::string::npos)end=line.size();std::string token=line.substr(a,end-a);a=end;if(token.empty())continue;
  size_t eq=token.find('=');if(eq==std::string::npos)return false;std::string key=token.substr(0,eq),value=token.substr(eq+1);unsigned bit=0;uintptr_t values[4]={};int count=0,cap=1;
  if(key=="drawDialogue"){bit=1;cap=2;}else if(key=="drawGlyph")bit=2;else if(key=="commit")bit=4;else if(key=="clear"){bit=8;cap=4;}else if(key=="pages")bit=16;else if(key=="stride")bit=32;
  // Fields not consumed by the old native matcher (chars, scale, menuText, etc.) remain version-layer data.
  if(!bit)continue;if(seen&bit)return false;seen|=bit;if(!AddressList(value,values,cap,count)||(bit==1&&count!=2))return false;
  if(bit==1){parsed.dlg[0]=values[0];parsed.dlg[1]=values[1];}else if(bit==2)parsed.glyph=values[0];else if(bit==4)parsed.commit=values[0];else if(bit==8){parsed.clears=count;for(int k=0;k<count;k++)parsed.clear[k]=values[k];}else if(bit==16)parsed.pages=values[0];else parsed.stride=(std::uint32_t)values[0];
 }
 if(seen!=63)return false;t=parsed;return true;
}
static bool ParseControl(const unsigned char *raw,size_t bytes,bool &roles,Table &t){
 roles=false;t=Table{};if(bytes<2)return false;size_t at=0;bool wide=false;
 if(raw[0]==0xff&&raw[1]==0xfe){wide=true;at=2;}else if(raw[0]=='#'&&!raw[1])wide=true;else if(bytes>=3&&raw[0]==0xef&&raw[1]==0xbb&&raw[2]==0xbf)at=3;
 std::string line;bool ascii;if(!ControlLine(raw,bytes,at,wide,line,ascii)||!ascii||!CfgRoles(line,roles))return false;
 while(at<bytes){
  bool complete=ControlLine(raw,bytes,at,wide,line,ascii);
  if(!ascii){if(!line.compare(0,6,"#table")){roles=false;t=Table{};return false;}break;}
  if(!line.compare(0,12,"#table mages")){if(!complete||t.has||!AddressTable(line,t)){roles=false;t=Table{};return false;}}
  else if(!complete)break;
  else if(line=="#clearline"||!line.compare(0,6,"#role ")||!line.compare(0,13,"#choiceframe ")||!line.compare(0,7,"#table "))continue;
  else break;
 }
 return true;
}
static bool ReadControl(bool &roles,Table &t){
 roles=false;t=Table{};wchar_t tmp[MAX_PATH];DWORD n=GetTempPathW(MAX_PATH,tmp);if(!n||n>=MAX_PATH)return false;
 wchar_t path[MAX_PATH+64];swprintf_s(path,L"%sMeguLit\\draw\\%lu.txt",tmp,GetCurrentProcessId());
 HANDLE h=CreateFileW(path,GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,0,nullptr);if(h==INVALID_HANDLE_VALUE)return false;
 unsigned char raw[16384];DWORD got=0;bool ok=ReadFile(h,raw,sizeof raw,&got,nullptr)!=FALSE;CloseHandle(h);if(!ok)return false;
 try{return ParseControl(raw,got,roles,t);}catch(...){roles=false;t=Table{};return false;}
}
static bool FindInImage(const Table &t) {
  auto dos = (IMAGE_DOS_HEADER *)Base; auto nt = (IMAGE_NT_HEADERS *)(Base + dos->e_lfanew); auto sec = IMAGE_FIRST_SECTION(nt);
  for (int i = 0; i < nt->FileHeader.NumberOfSections; i++, sec++) {
    if (!(sec->Characteristics & IMAGE_SCN_MEM_EXECUTE)) continue;
    const unsigned char *code = (const unsigned char *)(Base + sec->VirtualAddress); size_t n = sec->Misc.VirtualSize;
    MagesDrawSig::Result r = MagesDrawSig::Find(code, n);
    if (!r.ok) { if (r.heads) Msg::Log("ToMe_DRAWRUN engine=mages off: signature heads=%d commits=%d clears=%d", r.heads, r.commits, r.clears); continue; }
    uintptr_t at = Base + sec->VirtualAddress;
    Dlg[0] = at + r.dialogue[0]; Dlg[1] = at + r.dialogue[1]; DlgEnd[0] = at + r.dialogueEnd[0]; DlgEnd[1] = at + r.dialogueEnd[1]; Glyph = (uintptr_t)((std::int64_t)at + r.drawGlyphRel); Commit = at + r.commit;
    Clears = r.clears < 4 ? r.clears : 4; for (int k = 0; k < Clears; k++) Clear[k] = at + r.clear[k];
    Pages = r.pages; Stride = r.stride; Chars = r.chars; Count = r.count; Codes = r.codes; Info = r.info; ScaleAt = r.scale;
    { std::uint32_t w = 0; if (MagesDrawSig::FindBackbuffer(code, n, w) == 1) Backbuffer = w; else Msg::Log("ToMe_DRAWRUN engine=mages note: no back buffer size (the client size is used)"); }
    if (t.has) { // the version layer's RVAs must be what the signature found
      bool same = t.dlg[0] == Dlg[0] - Base && t.dlg[1] == Dlg[1] - Base && t.glyph == Glyph - Base && t.commit == Commit - Base && t.stride == Stride && t.pages == Pages - Base;
      if (!same) { Msg::Log("ToMe_DRAWRUN engine=mages off: the version table disagrees with the signature (dlg %x/%x glyph %x commit %x)", (unsigned)(Dlg[0] - Base), (unsigned)(Dlg[1] - Base), (unsigned)(Glyph - Base), (unsigned)(Commit - Base)); return false; }
    }
    return true;
  }
  Msg::Log("ToMe_DRAWRUN engine=mages off: no dialogue pages found"); return false;
}
static uintptr_t Hooked[8];static int NHooked=0;
static bool Hook(uintptr_t at,void *gate,void **orig){
 if(MH_CreateHook((void *)at,gate,orig)!=MH_OK)return false;
 // Retain all trampolines if enable/patch state is uncertain. Permission is still off.
 if(MH_EnableHook((void *)at)!=MH_OK)return false;
 Hooked[NHooked++]=at;return true;
}
static bool Install(){
 if(Installed)return true;if(Blocked)return false;
 bool ok=Hook(Commit,(void *)CommitGate,&CommitOrig);
 for(int k=0;ok&&k<Clears;k++)ok=Hook(Clear[k],ClearGates[k],&ClearOrig[k]);
 ok=ok&&Hook(Dlg[0],(void *)DlgGate0,&DlgOrig[0])&&Hook(Dlg[1],(void *)DlgGate1,&DlgOrig[1])&&Hook(Glyph,(void *)GlyphGate,&GlyphOrig);
 if(!ok){InterlockedExchange(&Blocked,1);Msg::Log("ToMe_DRAWRUN engine=mages off: hook failed");return false;}
 InterlockedExchange(&Installed,1);
 Msg::Log("ToMe_DRAWRUN engine=mages on: drawDialogue=%x,%x drawGlyph=%x commit=%x clear=%x,%x pages=%x stride=%x chars=%d scale=%.3g",(unsigned)(Dlg[0]-Base),(unsigned)(Dlg[1]-Base),(unsigned)(Glyph-Base),(unsigned)(Commit-Base),Clears>0?(unsigned)(Clear[0]-Base):0,Clears>1?(unsigned)(Clear[1]-Base):0,(unsigned)(Pages-Base),Stride,Chars,Scale());return true;
}
static bool TableAgrees(const Table &t){
 return !t.has||(t.dlg[0]==Dlg[0]-Base&&t.dlg[1]==Dlg[1]-Base&&t.glyph==Glyph-Base&&t.commit==Commit-Base&&t.stride==Stride&&t.pages==Pages-Base);
}
static void RefreshSafe(unsigned __int64 request){
 bool roles=false;Table t;
 if(ReadControl(roles,t)&&roles){
  if(!Installed&&!Blocked){
   bool found=FindInImage(t);if(request!=RefreshRequest)return;
   if(!found){SetPermissionLocked(false);return;}
  }
  if(request!=RefreshRequest)return;
  if(TableAgrees(t)&&roles&&Install()){if(request==RefreshRequest)SetPermissionLocked(true);return;}
 }
 if(request==RefreshRequest)SetPermissionLocked(false);
}
static void RefreshSeh(unsigned __int64 request){
 __try{RefreshSafe(request);}__except(ObservationException(GetExceptionCode())){if(request==RefreshRequest)SetPermissionLocked(false);}
}
static void RefreshLocked(unsigned __int64 request){
 try{RefreshSeh(request);}catch(...){if(request==RefreshRequest)SetPermissionLocked(false);}
}
static void RefreshControl(){
 EnterCriticalSection(&Lock);
 __try{RefreshLocked(++RefreshRequest);}__finally{LeaveCriticalSection(&Lock);}
}
static DWORD WINAPI Watch(void *stop){
 for(;;){RefreshControl();if(stop){if(WaitForSingleObject((HANDLE)stop,2000)==WAIT_OBJECT_0)return 0;}else Sleep(2000);}
}
// called from the MAGES engines' attach (the STEINS;GATE adapter and upstream MAGES); never fails the engine. One per
// process even though two translation units carry this header: the first Arm takes a named per-process mutex.
static void Arm(uintptr_t imageBase) {
  if (InterlockedExchange(&Armed, 1)) return;
  wchar_t name[64]; swprintf_s(name, L"Local\\MeguLitMagesDraw-%lu", GetCurrentProcessId());
  HANDLE m = CreateMutexW(nullptr, TRUE, name); if (!m || GetLastError() == ERROR_ALREADY_EXISTS) return;
  InitializeCriticalSection(&Lock);
  Base = imageBase;
  HANDLE t = CreateThread(nullptr, 0, Watch, nullptr, 0, nullptr); if (t) CloseHandle(t);
}
}
#endif
