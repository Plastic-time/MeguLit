// SPDX-License-Identifier: GPL-3.0-or-later
// engine-draw, BGI / Ethornell (docs/engine-draw-native.md, after the YU-RIS template YurisDraw.h). BGI lays every text out
// at once into a chain of glyph nodes (canvas x / y at node+0x10 / +0x14), draws the chain into the text sprite's bitmap and
// frees it; the known build routes its text sprites through this layout. BgiDrawSig.h recognizes the validated shape:
//   the link site    the call right after the layout stored the node's x / y (the node is in a register, the glyph's
//                    character code and the previous node in the layout's stack, the text colour in its argument [ebp+c])
//   the chain free   the small function that walks node+0x44 and frees the nodes (called once the text is drawn)
// authorized observations produce diagnostic rows (one record per y), and an end record when the temporary chain is freed:
//   ToMe_DRAWRUN engine=bgi run=N row=K n=<chars> x0= y0= x1= y1= size=<advance> color=aarrggbb via=<rva>,<rva>,<rva> [role=R] text=<UTF-8>
//   ToMe_DRAWRUN engine=bgi end run=N rows=K
// x0 / y0 = the first glyph's origin, x1 = the last glyph's origin; size is the maximum observed positive horizontal advance,
// not measured glyph bounds. These are text-sprite canvas pixels; screen origins have not been validated. via = the return
// addresses of the layout and its two callers (image-relative): the native caller chain that laid the
// text out. BGI has no window object at this level (its system scripts make message, name and choice sprites through the
// same calls), so the role is data: this game's diff maps via prefixes to roles (draw.viaRoles -> "#role <via>=<role>" lines
// in the control file); a row whose via no line maps has no role field.
// Opt-in: nothing is hooked until MeguLit's control file %TEMP%\MeguLit\draw\<pid>.txt says roles=1 (draw.roles of this game's
// diff); a watcher thread checks it every 2 s. Both hooks always continue into the game's own code.
// This observer does not emit ToMe_CHARS, hide text or acknowledge translation. Chain end is not sprite destruction/clear.
#pragma once
#include <windows.h>
#include <cstdio>
#include <cstring>
#include <cwchar>
#include <string>
#include "MinHook.h"
#include "BgiDrawSig.h"
namespace BgiDraw {
static void *LinkOriginal = nullptr, *FreeOriginal = nullptr;
static uintptr_t Image = 0, ImageEnd = 0, LinkAt = 0, FreeAt = 0;
static BgiDrawSig::Link Site{};
static volatile LONG Armed = 0, Installed = 0, Observing = 0;
static bool Permitted = false;
static LONG Epoch = 0;
static CRITICAL_SECTION Lock;
// role map from the control file: "#role 3d40d,31e44=name" (via prefix, hex RVAs) -> role
struct RoleMap { char via[64]; char role[12]; };
static RoleMap Roles[16]; static int RoleCount = 0;
// the current text (one layout) and row
static uintptr_t Frame = 0; static unsigned Run = 0; static int Rows = 0; static bool Open = false;
static long RowY = 0, X0 = 0, X1 = 0, Size = 0; static int RowChars = 0; static unsigned Color = 0; static std::string RowText; static char Via[64] = "";

static void ResetPending(){Frame=0;Rows=0;Open=false;RowY=X0=X1=Size=0;RowChars=0;Color=0;RowText.clear();Via[0]=0;}
static void RevokeLocked(){Epoch++;InterlockedExchange(&Observing,0);Permitted=false;ResetPending();RoleCount=0;std::memset(Roles,0,sizeof Roles);}
static std::string Utf8(const std::string &sjis) {
  int n = MultiByteToWideChar(932, 0, sjis.data(), (int)sjis.size(), nullptr, 0); if (n <= 0) return std::string();
  std::wstring w(n, L'\0'); MultiByteToWideChar(932, 0, sjis.data(), (int)sjis.size(), &w[0], n);
  int m = WideCharToMultiByte(CP_UTF8, 0, w.data(), n, nullptr, 0, nullptr, nullptr); std::string r(m, '\0');
  WideCharToMultiByte(CP_UTF8, 0, w.data(), n, &r[0], m, nullptr, nullptr); return r;
}
static const char *RoleOf(const char *via) {
  for (int i = 0; i < RoleCount; i++) { size_t k = strlen(Roles[i].via); if (k && !strncmp(via, Roles[i].via, k) && (via[k] == 0 || via[k] == ',')) return Roles[i].role; }
  return nullptr;
}
static void FlushRow() {
  if (!Observing) { ResetPending(); return; }
  if (!RowChars) return;
  LONG epoch=Epoch;
  std::string t = Utf8(RowText);
  if (t.size() > 120) { size_t cut = 120; while (cut > 0 && ((unsigned char)t[cut] & 0xc0) == 0x80) cut--; t.resize(cut); }
  for (char &c : t) if (c == '\r' || c == '\n') c = ' ';
  const char *role = RoleOf(Via);
  Msg::Log("ToMe_DRAWRUN engine=bgi run=%u row=%d n=%d x0=%ld y0=%ld x1=%ld y1=%ld size=%ld color=%08x via=%s%s%s text=%s", Run, Rows, RowChars, X0, RowY, X1, RowY, Size, Color, Via, role ? " role=" : "", role ? role : "", t.c_str());
  if(epoch!=Epoch||!Observing)return;
  Rows++; RowChars = 0; RowText.clear();
}
static void EndRun() {
  LONG epoch=Epoch;FlushRow();if(epoch!=Epoch)return;
  if (Observing && Open) Msg::Log("ToMe_DRAWRUN engine=bgi end run=%u rows=%d", Run, Rows);
  if(epoch!=Epoch)return;
  Open = false; Rows = 0;
}
static uintptr_t Rva(uintptr_t a) { return a >= Image && a < ImageEnd ? a - Image : 0; }
static void CallChain(uintptr_t ebp, char *out, size_t cap) {
  uintptr_t r[3] = {}; uintptr_t f = ebp;
  __try { for (int i = 0; i < 3 && f; i++) { r[i] = Rva(((uintptr_t *)f)[1]); uintptr_t next = ((uintptr_t *)f)[0]; if (next <= f) break; f = next; } } __except (EXCEPTION_EXECUTE_HANDLER) {}
  _snprintf_s(out, cap, _TRUNCATE, "%x,%x,%x", (unsigned)r[0], (unsigned)r[1], (unsigned)r[2]);
}
// regs = the pushad block (edi, esi, ebp, esp, ebx, edx, ecx, eax), esp = the layout's ESP at the call
static void OnLinkUnsafe(const DWORD *regs, const unsigned char *esp) {
    LONG epoch=Epoch;
    uintptr_t node = regs[7 - Site.node], ebp = regs[2];
    long x = *(const long *)(node + 0x10), y = *(const long *)(node + 0x14);
    unsigned code = *(const unsigned *)(esp + Site.ch);
    uintptr_t prev = *(const uintptr_t *)(esp + Site.prev);
    // the first glyph of a text links after the chain head, which lives in the caller's stack frame (0x48 bytes on the stack,
    // not a heap node); later glyphs link after a heap node (a glyph, or a mark node the layout inserts between glyphs)
    bool head = prev >= (uintptr_t)esp && prev < (uintptr_t)esp + 0x10000;
    if (!Open || head || ebp != Frame) {
      EndRun();if(!Observing||epoch!=Epoch)return;Run++; Open = true; Frame = ebp; Color = *(const unsigned *)(ebp + Site.color) | 0xff000000u;
      CallChain(ebp, Via, sizeof(Via));
    }
    if (RowChars && y != RowY){FlushRow();if(!Observing||epoch!=Epoch)return;}
    if (!RowChars) { RowY = y; X0 = X1 = x; Size = 0; }
    else { if (x > X1 && x - X1 < 400 && x - X1 > Size) Size = x - X1; if (x > X1) X1 = x; if (x < X0) X0 = x; }
    unsigned char b[2]; int k = BgiDrawSig::CharBytes(code & 0xffff, b);
    RowText.append((const char *)b, k); RowChars++;
    if (RowText.size() > 2000) FlushRow();
}
static void OnLinkSafe(const DWORD *regs,const unsigned char *esp){__try{OnLinkUnsafe(regs,esp);}__except(EXCEPTION_EXECUTE_HANDLER){ResetPending();}}
static void __cdecl OnLink(const DWORD *regs,const unsigned char *esp){
 EnterCriticalSection(&Lock);try{if(Observing)OnLinkSafe(regs,esp);}catch(...){ResetPending();}LeaveCriticalSection(&Lock);
}
static const DWORD ObserverMxcsr=0x1f80;
static __declspec(naked) void LinkGate() {
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
  push ebx
  call OnLink
  add esp,8
  fxrstor [esp]
  mov esp,ebx
  popad
  popfd
  jmp dword ptr [LinkOriginal]
 }
}
typedef void(__cdecl *FreeFn)(void *);
static void EndSafe(){__try{if(Observing)EndRun();else ResetPending();}__except(EXCEPTION_EXECUTE_HANDLER){ResetPending();}}
static void __cdecl FreeHook(void *head) {
 EnterCriticalSection(&Lock);try{EndSafe();}catch(...){ResetPending();}LeaveCriticalSection(&Lock);
 ((FreeFn)FreeOriginal)(head);
}
static bool FindInImage(uintptr_t base) {
  auto dos = (IMAGE_DOS_HEADER *)base; auto nt = (IMAGE_NT_HEADERS *)(base + dos->e_lfanew); auto sec = IMAGE_FIRST_SECTION(nt);
  Image = base; ImageEnd = base + nt->OptionalHeader.SizeOfImage;
  int links = 0, frees = 0; BgiDrawSig::Link link{}; size_t freeAt = 0;
  for (int i = 0; i < nt->FileHeader.NumberOfSections; i++, sec++) {
    if (!(sec->Characteristics & IMAGE_SCN_MEM_EXECUTE)) continue;
    const unsigned char *p = (const unsigned char *)(base + sec->VirtualAddress); size_t n = sec->Misc.VirtualSize > 64 ? sec->Misc.VirtualSize - 64 : 0;
    BgiDrawSig::Link l[2]; int c = BgiDrawSig::FindLinks(p, n, l, 2);
    if (c >= 1 && !links) { link = l[0]; link.call += base + sec->VirtualAddress; }
    links += c;
    size_t f[2]; int d = BgiDrawSig::FindFrees(p, n, f, 2);
    if (d >= 1 && !frees) freeAt = f[0] + base + sec->VirtualAddress;
    frees += d;
  }
  if (links != 1) { Msg::Log("ToMe_DRAWRUN engine=bgi off: %d glyph link matches (want 1)", links); return false; }
  Site = link; LinkAt = link.call; FreeAt = frees == 1 ? freeAt : 0;
  return true;
}
static bool Install() {
  if (Installed) return true;
  if (MH_CreateHook((void *)LinkAt, (void *)LinkGate, &LinkOriginal) != MH_OK || MH_EnableHook((void *)LinkAt) != MH_OK) { Msg::Log("ToMe_DRAWRUN engine=bgi off: hook failed at %p", (void *)LinkAt); return false; }
  // without the free hook a text ends when the next one starts (one text late); the record says so
  bool freeOk = FreeAt && MH_CreateHook((void *)FreeAt, (void *)FreeHook, &FreeOriginal) == MH_OK && MH_EnableHook((void *)FreeAt) == MH_OK;
  InterlockedExchange(&Installed,1);
  Msg::Log("ToMe_DRAWRUN engine=bgi on: link %p node=%d ch=[esp+%x] prev=[esp+%x] color=[ebp+%x] free=%p%s", (void *)LinkAt, Site.node, Site.ch, Site.prev, Site.color, freeOk ? (void *)FreeAt : nullptr, freeOk ? "" : " (no end records)");
  return true;
}
// Only the complete first UTF-16LE cfg line can authorize; role metadata has the JS viaRoles grammar.
static bool ReadLine(const unsigned char *raw,size_t bytes,size_t &at,std::string &line,bool &ascii){
 line.clear();ascii=true;
 for(;at+2<=bytes;at+=2){unsigned c=raw[at],high=raw[at+1];
  if(!high&&c=='\n'){at+=2;return true;}
  if(!high&&c=='\r'){if(at+4>bytes||raw[at+2]!='\n'||raw[at+3])return false;at+=4;return true;}
  if(high||c<0x20||c>0x7e)ascii=false;else line+=(char)c;
 }
 return false;
}
static bool CfgRoles(const std::string &line){
 if(line.compare(0,5,"#cfg "))return false;int keys=0;bool on=false;
 for(size_t begin=5;begin<line.size();){while(begin<line.size()&&line[begin]==' ')begin++;size_t end=line.find(' ',begin);if(end==std::string::npos)end=line.size();std::string token=line.substr(begin,end-begin);
  if(!token.compare(0,6,"roles=")){keys++;on=token=="roles=1";}else if(token=="roles")return false;begin=end;
 }
 return keys==1&&on;
}
static bool ValidRole(const std::string &via,const std::string &role){
 bool known=role=="line"||role=="name"||role=="choice"||role=="button"||role=="menu"||role=="system";if(!known||via.empty()||via.size()>=sizeof Roles[0].via)return false;
 int words=0;for(size_t begin=0;begin<via.size();){size_t end=via.find(',',begin);if(end==std::string::npos)end=via.size();if(end==begin||end-begin>8||++words>6)return false;for(size_t i=begin;i<end;i++)if(!((via[i]>='0'&&via[i]<='9')||(via[i]>='a'&&via[i]<='f')))return false;if(end==via.size())return true;begin=end+1;if(begin==via.size())return false;}return false;
}
static bool ParseControl(const unsigned char *raw,size_t bytes,RoleMap *maps,int &count){
 count=0;if(bytes<2)return false;size_t at=0;if(raw[0]==0xff&&raw[1]==0xfe)at=2;else if(raw[1])return false;
 std::string line;bool ascii;if(!ReadLine(raw,bytes,at,line,ascii)||!ascii||!CfgRoles(line))return false;
 while(ReadLine(raw,bytes,at,line,ascii)){
  if(!ascii)break;
  if(!line.compare(0,6,"#role ")){size_t eq=line.find('=',6);if(eq==std::string::npos)continue;std::string via=line.substr(6,eq-6),role=line.substr(eq+1);if(count<16&&ValidRole(via,role)){strcpy_s(maps[count].via,via.c_str());strcpy_s(maps[count].role,role.c_str());count++;}}
  else if(line!="#clearline"&&line.compare(0,7,"#table ")&&line.compare(0,13,"#choiceframe "))break;
 }
 return true;
}
static bool LoadControl(RoleMap *maps,int &count){
 wchar_t tmp[MAX_PATH];DWORD n=GetTempPathW(MAX_PATH,tmp);if(!n||n>=MAX_PATH)return false;wchar_t path[MAX_PATH+64];swprintf_s(path,L"%sMeguLit\\draw\\%lu.txt",tmp,GetCurrentProcessId());
 HANDLE h=CreateFileW(path,GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,0,nullptr);if(h==INVALID_HANDLE_VALUE)return false;
 unsigned char raw[16384];DWORD got=0;bool ok=ReadFile(h,raw,sizeof raw,&got,nullptr)!=FALSE;CloseHandle(h);return ok&&ParseControl(raw,got,maps,count);
}
static bool ReadControl(){
 RoleMap maps[16]={};int count=0;bool allowed=LoadControl(maps,count);
 EnterCriticalSection(&Lock);
 if(!allowed)RevokeLocked();
 else{if(!Permitted||RoleCount!=count||std::memcmp(Roles,maps,sizeof Roles)){Epoch++;ResetPending();}std::memcpy(Roles,maps,sizeof Roles);RoleCount=count;Permitted=true;}
 LeaveCriticalSection(&Lock);return allowed;
}
static void RefreshControl(){
 if(ReadControl()&&Install()){EnterCriticalSection(&Lock);if(Permitted)InterlockedExchange(&Observing,1);LeaveCriticalSection(&Lock);}
}
static DWORD WINAPI Watch(void *stop){for(;;){RefreshControl();if(stop){if(WaitForSingleObject((HANDLE)stop,2000)==WAIT_OBJECT_0)return 0;}else Sleep(2000);}}
// called from BGI::attach_function; never fails the engine
static void Arm(uintptr_t imageBase) {
  if (InterlockedExchange(&Armed, 1)) return;
  InitializeCriticalSection(&Lock);
  __try { if (!FindInImage(imageBase)) return; } __except (EXCEPTION_EXECUTE_HANDLER) { return; }
  HANDLE t = CreateThread(nullptr, 0, Watch, nullptr, 0, nullptr); if (t) CloseHandle(t);
}
}
