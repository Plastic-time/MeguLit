// SPDX-License-Identifier: GPL-3.0-or-later
// Where the game draws its dialogue, for ToMe's position tracking. An engine draw hook calls Begin() when a new
// dialogue line is parsed and Glyph() for every dialogue glyph it draws (or skips drawing because ToMe hides it); the
// line's extent is logged as ToMe_TEXTPOS in the engine's own units. ToMe maps those units to the screen with a
// per-game calibration, so no engine resolution or offset is assumed here. Raw() logs a line's first glyphs verbatim
// for working out which values are coordinates.
#pragma once
namespace ToMeTextPos {
static SRWLOCK Lock = SRWLOCK_INIT;
static long Line = 0, Count = 0, X0 = 0, Y0 = 0, X1 = 0, Y1 = 0, Size = 0, RawCount = 0, Sent[5] = {};
static unsigned TextToken(const std::string& text){
 int n=MultiByteToWideChar(932,0,text.data(),(int)text.size(),nullptr,0);std::wstring value(n,L'\0');if(n)MultiByteToWideChar(932,0,text.data(),(int)text.size(),&value[0],n);
 size_t first=value.find_first_not_of(L" \r\n\t\x3000"),last=value.find_last_not_of(L" \r\n\t\x3000");if(first==std::wstring::npos)value.clear();else value=value.substr(first,last-first+1);
 unsigned h=2166136261u;for(wchar_t c:value){h^=(unsigned short)c;h*=16777619u;}return h;
}
static DWORD LastEmit = 0;static unsigned Token=0;
static void Begin(unsigned token=0){Token=token;AcquireSRWLockExclusive(&Lock);Line++;Count=0;RawCount=0;ReleaseSRWLockExclusive(&Lock);}
static void Glyph(const char* engine,long x,long y,long size){
 AcquireSRWLockExclusive(&Lock);
 if(Count==0){X0=X1=x;Y0=Y1=y;Size=size;}else{if(x<X0)X0=x;if(y<Y0)Y0=y;if(x>X1)X1=x;if(y>Y1)Y1=y;if(size>Size)Size=size;}
 // Engines that redraw every frame call this again and again: only a changed extent is sent, at most every 40 ms.
 Count++;DWORD now=GetTickCount();bool changed=Sent[0]!=Line||Sent[1]!=X0||Sent[2]!=Y0||Sent[3]!=X1||Sent[4]!=Y1;bool emit=changed&&(Count==1||Sent[0]!=Line||now-LastEmit>=40);if(emit){LastEmit=now;Sent[0]=Line;Sent[1]=X0;Sent[2]=Y0;Sent[3]=X1;Sent[4]=Y1;}
 long line=Line,x0=X0,y0=Y0,x1=X1,y1=Y1,s=Size,n=Count;ReleaseSRWLockExclusive(&Lock);
 if(emit)Msg::Log("ToMe_TEXTPOS engine=%s line=%ld x0=%ld y0=%ld x1=%ld y1=%ld size=%ld n=%ld token=%u",engine,line,x0,y0,x1,y1,s,n,Token);
}
// Flush the final extent of a short raster burst. A whole line can be drawn inside the 40 ms throttle;
// without this flush only its first character would ever reach calibration.
static void Flush(const char* engine){
 AcquireSRWLockExclusive(&Lock);bool changed=Count>0&&(Sent[0]!=Line||Sent[1]!=X0||Sent[2]!=Y0||Sent[3]!=X1||Sent[4]!=Y1);
 long line=Line,x0=X0,y0=Y0,x1=X1,y1=Y1,s=Size,n=Count;
 if(changed){LastEmit=GetTickCount();Sent[0]=Line;Sent[1]=X0;Sent[2]=Y0;Sent[3]=X1;Sent[4]=Y1;}ReleaseSRWLockExclusive(&Lock);
 if(changed)Msg::Log("ToMe_TEXTPOS engine=%s line=%ld x0=%ld y0=%ld x1=%ld y1=%ld size=%ld n=%ld token=%u",engine,line,x0,y0,x1,y1,s,n,Token);
}
// Raw memory of an engine object, for finding where the engine keeps a line's screen position. Unreadable memory is
// reported as such instead of faulting the game.
static bool ReadDwords(const void* p,DWORD* out,int n){__try{for(int i=0;i<n;i++)out[i]=((const volatile DWORD*)p)[i];return true;}__except(EXCEPTION_EXECUTE_HANDLER){return false;}}
static void Dump(const char* engine,const char* name,uintptr_t p,int n){
 if(n>48)n=48;DWORD v[48];char text[600];int used=_snprintf_s(text,sizeof(text),_TRUNCATE,"ToMe_TEXTPOS_DUMP engine=%s line=%ld %s=%x",engine,Line,name,(unsigned)p);
 if(!p||!ReadDwords((const void*)p,v,n)){Msg::Log("%s unreadable",text);return;}
 for(int i=0;i<n&&used>0&&used<(int)sizeof(text)-12;i++)used+=_snprintf_s(text+used,sizeof(text)-used,_TRUNCATE," %d",(int)v[i]);
 Msg::Log("%s",text);
}
// First two glyphs of a line only, so the log stays small.
static bool WantRaw(){AcquireSRWLockExclusive(&Lock);bool want=RawCount<2;if(want)RawCount++;ReleaseSRWLockExclusive(&Lock);return want;}
}
