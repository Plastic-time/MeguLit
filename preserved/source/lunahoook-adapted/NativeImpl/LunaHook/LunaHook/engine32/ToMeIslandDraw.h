// SPDX-License-Identifier: GPL-3.0-or-later
// ISLAND diagnostic draw adapter. Never writes script strings or history buffers.
#include <wincrypt.h>
#include <cstring>
#include <intrin.h>
#include "MinHook.h"
#include "embed_util.h"
#include "ToMeTextPos.h"
#include "ToMeIslandFlow.h"
namespace ToMeIslandDraw {
static bool ExactFile(){
 wchar_t file[MAX_PATH]={};if(!GetModuleFileNameW(nullptr,file,MAX_PATH))return false;
 HMODULE adv=LoadLibraryW(L"advapi32.dll");if(!adv)return false;
 auto acquire=reinterpret_cast<decltype(&CryptAcquireContextW)>(GetProcAddress(adv,"CryptAcquireContextW"));auto create=reinterpret_cast<decltype(&CryptCreateHash)>(GetProcAddress(adv,"CryptCreateHash"));auto update=reinterpret_cast<decltype(&CryptHashData)>(GetProcAddress(adv,"CryptHashData"));auto finish=reinterpret_cast<decltype(&CryptGetHashParam)>(GetProcAddress(adv,"CryptGetHashParam"));auto destroy=reinterpret_cast<decltype(&CryptDestroyHash)>(GetProcAddress(adv,"CryptDestroyHash"));auto release=reinterpret_cast<decltype(&CryptReleaseContext)>(GetProcAddress(adv,"CryptReleaseContext"));
 HCRYPTPROV provider=0;HCRYPTHASH hash=0;HANDLE input=INVALID_HANDLE_VALUE;bool ok=acquire&&create&&update&&finish&&destroy&&release;
 if(ok)ok=acquire(&provider,nullptr,nullptr,PROV_RSA_AES,CRYPT_VERIFYCONTEXT)&&create(provider,CALG_SHA_256,0,0,&hash);
 if(ok){input=CreateFileW(file,GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);ok=input!=INVALID_HANDLE_VALUE;}
 BYTE chunk[16384],digest[32];DWORD count=0,size=32;while(ok){if(!ReadFile(input,chunk,sizeof(chunk),&count,nullptr)){ok=false;break;}if(!count)break;ok=update(hash,chunk,count,0)!=FALSE;}
 if(ok)ok=finish(hash,HP_HASHVAL,digest,&size,0)&&size==32;
 static const BYTE expected[32]={0x47,0x4c,0xc1,0x1d,0x87,0x5d,0x7b,0xe9,0xdf,0x95,0x81,0xf3,0xa5,0x5d,0x64,0x69,0x8c,0xcf,0x4e,0x76,0x0c,0x44,0x01,0x3d,0xf4,0x03,0xcc,0xed,0x85,0xe5,0x05,0xf1};
 if(ok)ok=std::memcmp(digest,expected,32)==0;if(input!=INVALID_HANDLE_VALUE)CloseHandle(input);if(hash)destroy(hash);if(provider)release(provider,0);FreeLibrary(adv);return ok;
}
using GlyphFn=int(__thiscall*)(void*,uintptr_t,unsigned,int,int,int,int,void*);
static GlyphFn original=nullptr;static void* blendOriginal=nullptr;static uintptr_t blendDone=0x53e590;
// Per-line draw statistics (ToMe, 2026-11-02): how many glyphs of the previous line were hidden and how many were drawn
// while a sentence was pending, logged when the next line begins; the first few drawn ones are logged with their record.
static volatile LONG LineHidden=0,LineShown=0;
static void LineStats(){Msg::Log("ToMeCS2_LINE_STATS hidden=%ld shown=%ld",InterlockedExchange(&LineHidden,0),InterlockedExchange(&LineShown,0));}
static volatile LONG SkipBlend=0;static volatile DWORD ActiveThread=0,SourcePendingAt=0;static uintptr_t DialogueFonts[64]={};static unsigned FontCount=0;
static __declspec(naked) void BlendGate(){__asm{
 pushfd
 push eax
 mov eax,fs:[24h]
 cmp eax,ActiveThread
 jne forward
 cmp SkipBlend,0
 je forward
 pop eax
 popfd
 jmp dword ptr [blendDone]
 forward:
 pop eax
 popfd
 jmp dword ptr [blendOriginal]
}}
using OutlineFn=int(__thiscall*)(void*,void*,void*,void*);static OutlineFn outlineOriginal=nullptr;
static int __fastcall Outline(void* font,void*,void* a,void* b,void* c){if(SkipBlend&&ActiveThread==GetCurrentThreadId())return 0;return outlineOriginal(font,a,b,c);}
// CS2 ruby markup "[base/reading]" is drawn as the base with furigana: keep only the base, as the glyph records do.
static size_t Ruby(const char* text,size_t i,std::string& out){size_t j=i+1,slash=0;while(text[j]&&j<i+160){unsigned char c=text[j];if(IsDBCSLeadByteEx(932,c)&&text[j+1]){j+=2;continue;}if(c=='/'&&!slash)slash=j;else if(c==']')break;else if(c=='['||c=='\\')return 0;j++;}if(text[j]!=']'||!slash||slash==i+1)return 0;out.append(text+i+1,slash-i-1);return j+1;}
// The game's own readings for ruby words ([base/reading]): ToMe shows these instead of guessing (user, 2026-11-03: a
// guessed reading for the island's name was wrong). Sent after the line inside the same source frame as
// 0x1d base 0x1c reading pairs; ToMe strips them before the text is used anywhere.
static std::string RubyPairs(const char* text){std::string out;for(size_t i=0;text[i]&&i<8000;){unsigned char c=text[i];if(IsDBCSLeadByteEx(932,c)&&text[i+1]){i+=2;continue;}
 if(c=='['){std::string base;size_t next=Ruby(text,i,base);if(next){size_t slash=i+1+base.size();if(next-1>slash+1&&out.size()<2000){out+='\x1d';out+=base;out+='\x1c';out.append(text+slash+1,next-2-slash);}i=next;continue;}}i++;}return out;}
static std::string Clean(const char* text){std::string out;for(size_t i=0;text[i]&&i<8000;){unsigned char c=text[i];if(IsDBCSLeadByteEx(932,c)&&text[i+1]){out+=text[i++];out+=text[i++];continue;}if(c=='['){size_t next=Ruby(text,i,out);if(next){i=next;continue;}}if(c=='\\'&&text[i+1]){char code=text[i+1];i+=2;if(code=='n')out+='\n';else if(code=='p'&&text[i]=='c')i++;else if(code=='@'||code=='p'){}else if(code=='c'||code=='s'||code=='f'||code=='w'){while(isdigit((unsigned char)text[i]))i++;}else{out+='\\';out+=code;}continue;}out+=text[i++];}size_t start=out.find_first_not_of(" \r\n\t"),end=out.find_last_not_of(" \r\n\t");out=start==std::string::npos?std::string():out.substr(start,end-start+1);while(out.size()>=2&&(unsigned char)out[0]==0x81&&(unsigned char)out[1]==0x40)out.erase(0,2);while(out.size()>=2&&(unsigned char)out[out.size()-2]==0x81&&(unsigned char)out.back()==0x40)out.resize(out.size()-2);return out;}

// a4 = glyphRecord + 0x34 (outline pair), NOT a position structure. The record stride is 0x50.
// Its +0x2c/+0x30 values in the old dump actually read the NEXT record's x/y at +0x10/+0x14.
static SRWLOCK SourceLock=SRWLOCK_INIT;
static ToMeIslandFlow::SourceState Source;
static ToMeIslandFlow::PageState Pages;

static __declspec(thread) uintptr_t Owner=0;
static __declspec(thread) bool ComposingDialogue=false;
static __declspec(thread) uintptr_t PreparedOwner=0,PreparedRecord=0;
static __declspec(thread) unsigned PreparedRevision=0,ResolvedGeneration=0;
static __declspec(thread) uintptr_t ResolvedOwner=0;
static __declspec(thread) bool CurrentRunProof=false;
static __declspec(thread) long ComposeX=0,ComposeY=0;
static unsigned SourceToken(const std::string& value){int n=MultiByteToWideChar(932,0,value.data(),(int)value.size(),nullptr,0);std::wstring w(n,L'\0');if(n)MultiByteToWideChar(932,0,value.data(),(int)value.size(),&w[0],n);return ToMeIslandFlow::Token(w);}
static bool Name(const char* raw,const std::string& clean){
 // CatSystem scenario text carries leading space/control codes; unadorned short non-punctuation strings are names.
 // Keep punctuation-only short dialogue and control-prefixed short narration; never discard by length alone.
 if(clean.size()>=16||clean!=raw)return false;
 for(size_t i=0;i<clean.size();i++){unsigned char c=clean[i];if(c=='\\'||c=='\n'||c==' '||c=='?'||c=='!')return false;if(IsDBCSLeadByteEx(932,c)&&i+1<clean.size()){unsigned char d=clean[++i];if(c==0x81&&(d==0x40||d==0x41||d==0x42||d==0x43||d==0x48||d==0x49||d==0x63||d==0x64||(d>=0x75&&d<=0x78)))return false;}}
 return true;
}
static unsigned First(const std::string& text){for(size_t i=0;i<text.size();){unsigned char c=text[i++];unsigned v=c;if(IsDBCSLeadByteEx(932,c)&&i<text.size())v=(c<<8)|(unsigned char)text[i++];if(v!=0x20&&v!=0x8140&&v!=10&&v!=13)return v;}return 0;}
static bool ReadRecord(uintptr_t address,unsigned character,int size,DWORD* v){return address&&ToMeTextPos::ReadDwords((void*)address,v,20)&&(v[1]&0xffff)==(character&0xffff)&&(int)v[7]==size&&size>=6&&size<=160&&(int)v[4]>=-2000&&(int)v[4]<=10000&&(int)v[5]>=-2000&&(int)v[5]<=10000;}
// Previous page lines can be redrawn in the same burst. A leading quote alone does not identify a new sentence:
// compare up to twelve laid-out glyphs before consuming pending text, using guarded record reads only.
static bool MatchesSource(uintptr_t glyph,const std::string& text){
 auto expected=ToMeIslandFlow::Prefix(text);std::vector<unsigned> actual;long base=0;
 // Furigana records (smaller glyphs inside the run) are not sentence text.
 for(unsigned i=0;i<40&&actual.size()<expected.size();i++){DWORD r[8];if(!ToMeTextPos::ReadDwords((void*)(glyph+i*0x50),r,8))return false;unsigned c=r[1]&0xffff;long size=(long)(int)r[7];if(c&&c!=0x20&&c!=0x8140&&c!=10&&c!=13&&c!=0xffff){if(!base)base=size;if(ToMeIslandFlow::RubyGlyph(size,base))continue;actual.push_back(c);}}
 return ToMeIslandFlow::Matches(expected,actual);
}
// Resolve a complete sentence from already laid-out records. Cached/rasterized glyphs may never call Glyph again.
// Limit capture to the matched record range, so a redraw of an earlier paragraph cannot inflate the new sentence.
static uintptr_t RecordStart=0,RecordEnd=0,RecordOwner=0;
static long LayoutX0=0,LayoutY0=0,LayoutX1=0,LayoutY1=0,LayoutSize=0,LayoutCount=0,LayoutOriginX=0,LayoutOriginY=0;
static bool LayoutHidden=false,LayoutPending=false,GlyphRange=false;static long LayoutLastX=0,LayoutLastY=0;
// Where the sentence starts in a composed record run. Centred lines are padded with full-width spaces and ADV boxes
// lay the speaker name out before the quote, while the script string has neither: look a few records ahead.
static uintptr_t Locate(uintptr_t glyph,const std::string& text){unsigned first=First(text);if(!first)return 0;for(unsigned i=0;i<48;i++){DWORD word=0;uintptr_t p=glyph+i*0x50;if(!ToMeTextPos::ReadDwords((void*)(p+4),&word,1))return 0;if((word&0xffff)==first&&MatchesSource(p,text))return p;}return 0;}
// Record +8 is the glyph fill colour (ABGR): ISLAND draws read lines blue and unread lines white.
static long LayoutFirstX=0,LayoutFirstY=0;static DWORD LayoutColor=0;
static bool Capture(uintptr_t first,const std::string& text){
 std::vector<unsigned> expected;for(size_t i=0;i<text.size();){unsigned char c=text[i++];unsigned v=c;if(IsDBCSLeadByteEx(932,c)&&i<text.size())v=(c<<8)|(unsigned char)text[i++];if(v!=0x20&&v!=0x8140&&v!=10&&v!=13)expected.push_back(v);}
 if(expected.empty()||expected.size()>4000)return false;
 long x0=10000,y0=10000,x1=-2000,y1=-2000,size=0,fx=0,fy=0,lx=0,ly=0;DWORD color=0;unsigned n=0;uintptr_t last=0;
 for(unsigned i=0;i<expected.size()*3+16&&n<expected.size();i++){
  DWORD v[20];uintptr_t p=first+i*0x50;if(!ToMeTextPos::ReadDwords((void*)p,v,20))return false;unsigned c=v[1]&0xffff;
  // A wrapped line is split by an all-zero record (char 0, no position).
  if(!c||c==0x20||c==0x8140||c==10||c==13||c==0xffff)continue;
  if(n&&ToMeIslandFlow::RubyGlyph((long)(int)v[7],size))continue; // furigana record inside the run
  if(c!=expected[n]||!ReadRecord(p,c,(int)v[7],v))return false;n++;last=p;
  long x=(int)v[4],y=(int)v[5];if(n==1){fx=x;fy=y;color=v[2];}lx=x;ly=y;x0=(std::min)(x0,x);y0=(std::min)(y0,y);x1=(std::max)(x1,x);y1=(std::max)(y1,y);size=(std::max)(size,(long)(int)v[7]);
 }
 if(n!=expected.size())return false;
 // Furigana of the last word may follow the final glyph: keep it inside the run so it is hidden with the sentence.
 for(unsigned k=1;k<=32;k++){DWORD t[20];uintptr_t p=last+k*0x50;if(!ToMeTextPos::ReadDwords((void*)p,t,20))break;unsigned c=t[1]&0xffff;if(!c||c==0xffff||c==10||c==13)continue;if(!ToMeIslandFlow::RubyGlyph((long)(int)t[7],size))break;last=p;}
 LayoutFirstX=fx;LayoutFirstY=fy;LayoutLastX=lx;LayoutLastY=ly;LayoutColor=color;RecordStart=first;RecordEnd=last+0x50;RecordOwner=Owner;LayoutX0=x0;LayoutY0=y0;LayoutX1=x1;LayoutY1=y1;LayoutSize=size;LayoutCount=n;return true;
}
// The record array can be reallocated while a sentence is still being revealed: its later glyphs then lie outside the
// captured range and their original ink leaks next to ToMe's text. Re-find the whole current sentence around such a glyph.
static uintptr_t Failed[256]={};static unsigned FailedCount=0;
static bool Reanchor(uintptr_t glyph,long ox,long oy){
 // Record x/y are relative to each sentence's own origin, so only the compose origin tells two identical lines apart.
 if(ox!=LayoutOriginX||oy!=LayoutOriginY)return false;
 for(unsigned i=0;i<FailedCount;i++)if(Failed[i]==glyph)return false;
 unsigned first=First(Source.current);uintptr_t start=RecordStart,end=RecordEnd;long x0=LayoutX0,y0=LayoutY0,x1=LayoutX1,y1=LayoutY1,size=LayoutSize,count=LayoutCount;long fx=LayoutFirstX,fy=LayoutFirstY;long lx=LayoutLastX,ly=LayoutLastY;DWORD color=LayoutColor;uintptr_t owner=RecordOwner;
 for(size_t i=0;first&&i<=Source.current.size()*3+16&&i*0x50<=glyph;i++){uintptr_t p=glyph-i*0x50;DWORD c=0;if(!ToMeTextPos::ReadDwords((void*)(p+4),&c,1))break;if((c&0xffff)!=first||!Capture(p,Source.current))continue;
  // A moved copy keeps its laid-out position; another line with the same text (two "¡­¡­¡­¡­¡£") does not.
  if(glyph<RecordEnd&&LayoutFirstX==fx&&LayoutFirstY==fy)return true;RecordStart=start;RecordEnd=end;LayoutX0=x0;LayoutY0=y0;LayoutX1=x1;LayoutY1=y1;LayoutSize=size;LayoutCount=count;LayoutFirstX=fx;LayoutFirstY=fy;LayoutLastX=lx;LayoutLastY=ly;LayoutColor=color;RecordOwner=owner;}
 if(FailedCount<256)Failed[FailedCount++]=glyph;return false;
}
static ToMeIslandFlow::DialogState Dialog;
static volatile DWORD LastShownId=0,LastShownRenderer=0,LastShownAt=0,DirectId=0,DirectRenderer=0;
// Replay accepted sprite state when its first matching sentence adopts it. A previous page's later off event
// must not hide a new ADV/voice window, and a show event before adoption must not be lost.
static void AdoptDialog(uintptr_t owner){
 DWORD id=0,renderer=0;int visible=0;
 if(owner&&ToMeTextPos::ReadDwords((void*)(owner+4),&id,1)&&ToMeTextPos::ReadDwords((void*)(owner+0x68),&renderer,1)&&renderer){
  if(Dialog.Bind(renderer,id,visible))Msg::Log("ToMe_DIALOG engine=cs2 visible=%d",visible);return;
 }
 Dialog.bound=false; // A direct line cannot inherit an unrelated hidden narration window.
 if(LastShownAt&&GetTickCount()-LastShownAt<1500){
  if(DirectId!=LastShownId||DirectRenderer!=LastShownRenderer){DirectId=LastShownId;DirectRenderer=LastShownRenderer;Msg::Log("ToMe_CS2_DIRECT_WINDOW id=%x",(unsigned)DirectId);}
  if(Dialog.Bind(LastShownRenderer,LastShownId,visible))Msg::Log("ToMe_DIALOG engine=cs2 visible=%d",visible);
 }
}
struct RunSnapshot {
 uintptr_t start=RecordStart,end=RecordEnd,owner=RecordOwner;
 long x0=LayoutX0,y0=LayoutY0,x1=LayoutX1,y1=LayoutY1,size=LayoutSize,count=LayoutCount;
 long fx=LayoutFirstX,fy=LayoutFirstY,lx=LayoutLastX,ly=LayoutLastY;DWORD color=LayoutColor;
 void Restore() const {RecordStart=start;RecordEnd=end;RecordOwner=owner;LayoutX0=x0;LayoutY0=y0;LayoutX1=x1;LayoutY1=y1;LayoutSize=size;LayoutCount=count;LayoutFirstX=fx;LayoutFirstY=fy;LayoutLastX=lx;LayoutLastY=ly;LayoutColor=color;}
};
// The current glyph may be halfway through the matched sentence. Do not try to find its first character
// only by scanning forward: that would let a one-character/interior callback steal the rest of this run.
static bool CaptureCandidate(uintptr_t glyph,const std::string& text,uintptr_t& start){
 if(text==Source.current&&Owner==RecordOwner&&RecordStart&&
    (glyph>=RecordStart&&glyph<RecordEnd)){
  start=RecordStart;if(Capture(start,text)){CurrentRunProof=true;return true;}
 }
 start=Locate(glyph,text);if(text==Source.current&&start>glyph)return false;
 if(start&&Capture(start,text))return true;
 // A newly delivered source may arrive after the opening glyph, unlike the already-known current run.
 // Search backwards only for a complete match which actually contains this glyph; preserve state on rejection.
 if(text!=Source.current){RunSnapshot previous;unsigned first=First(text);size_t limit=(std::min)(text.size()*3+16,(size_t)512);
  for(size_t i=1;i<=limit&&i*0x50<=glyph;i++){uintptr_t p=glyph-i*0x50;DWORD c=0;if(!ToMeTextPos::ReadDwords((void*)(p+4),&c,1))break;
   if((c&0xffff)!=first||!MatchesSource(p,text)||!Capture(p,text))continue;
   if(glyph<RecordEnd){start=p;return true;}previous.Restore();}
 }return false;
}
static bool HideRequested(){return check_embed_able(ThreadParam{GetCurrentProcessId(),0x503af0,0,Engine::ScenarioRole});}
static void EmitLayout(long ox,long oy){
 LayoutOriginX=ox;LayoutOriginY=oy;LayoutHidden=HideRequested();
 char colour[24]="";if((LayoutColor>>24)==0xff)sprintf_s(colour," color=%08x",(unsigned)LayoutColor);
 Msg::Log("ToMe_CS2_LAYOUT line=%ld token=%u x0=%ld y0=%ld x1=%ld y1=%ld size=%ld n=%ld hidden=%d%s",ToMeTextPos::Line,ToMeTextPos::Token,LayoutX0+ox,LayoutY0+oy,LayoutX1+ox,LayoutY1+oy,LayoutSize,LayoutCount,LayoutHidden?1:0,colour);
}
using ComposeFn=int(__thiscall*)(void*,void*,void*,int,int);
static ComposeFn composeOriginal=nullptr;
static int __fastcall Compose(void* self,void*,void* glyph,void* entry,int ox,int oy){
 DWORD v[20],world[2];bool readable=ToMeTextPos::ReadDwords(glyph,v,20),origin=Owner&&ToMeTextPos::ReadDwords((void*)(Owner+0x44c),world,2);
 if(origin&&((int)world[0]<-20000||(int)world[0]>20000||(int)world[1]<-20000||(int)world[1]>20000||ox<-20000||ox>20000||oy<-20000||oy>20000))origin=false;
 AcquireSRWLockExclusive(&SourceLock);
 bool fresh=Source.Pending(GetTickCount());uintptr_t start=0;
 bool captured=readable&&origin&&Source.Resolve(GetTickCount(),[&](const std::string& text){return CaptureCandidate((uintptr_t)glyph,text,start);});
 // One line per unmatched sentence revision: which run reached Compose and why it was not taken.
 static unsigned missed=0;if(!captured&&fresh&&readable&&Source.revision!=missed&&Source.revision!=Source.begun){missed=Source.revision;DWORD c[6]={};for(unsigned i=0;i<6;i++)ToMeTextPos::ReadDwords((void*)((uintptr_t)glyph+i*0x50+4),&c[i],1);
  Msg::Log("ToMeCS2_MISS owner=%x origin=%d start=%x want=%x run=%x,%x,%x,%x,%x,%x",(unsigned)Owner,origin?1:0,(unsigned)start,First(Source.pending),c[0]&0xffff,c[1]&0xffff,c[2]&0xffff,c[3]&0xffff,c[4]&0xffff,c[5]&0xffff);}
 if(captured){if(Source.Begin()){PreparedOwner=0;AdoptDialog(Owner);
   ToMeTextPos::Begin(Source.token);bool same=false;FailedCount=0;
   // Page continuity in texture coordinates: record x/y are relative to this sentence's origin, which moves per line.
   long px=(int)world[0]+ox,py=(int)world[1]+oy;Pages.Glyph(ToMeTextPos::Line,LayoutFirstX+px,LayoutFirstY+py,same);bool ignored=false;Pages.Glyph(ToMeTextPos::Line,LayoutLastX+px,LayoutLastY+py,ignored);
   Msg::Log("ToMe_PAGE engine=cs2 line=%ld same=%d token=%u",ToMeTextPos::Line,same?1:0,ToMeTextPos::Token);
   LineStats();Msg::Log("ToMe_CS2_BEGIN line=%ld token=%u",ToMeTextPos::Line,Source.token);
  }SourcePendingAt=0;LayoutPending=true;GlyphRange=false;
 }
 // A directly rasterised (voice) range composed later by a message window: hide it there too and report its real origin.
 bool dialogue=origin&&(Owner==RecordOwner||GlyphRange)&&(uintptr_t)glyph>=RecordStart&&(uintptr_t)glyph<RecordEnd;
 if(!dialogue&&origin&&readable&&RecordOwner&&Owner==RecordOwner&&!Source.current.empty())dialogue=Reanchor((uintptr_t)glyph,(int)world[0]+ox,(int)world[1]+oy);
 if(dialogue){long x=(int)world[0]+ox,y=(int)world[1]+oy;if(LayoutPending||x!=LayoutOriginX||y!=LayoutOriginY||HideRequested()!=LayoutHidden){LayoutPending=false;EmitLayout(x,y);}}
 ReleaseSRWLockExclusive(&SourceLock);
 bool old=ComposingDialogue;long oldX=ComposeX,oldY=ComposeY;ComposingDialogue=dialogue;
 if(dialogue){ComposeX=(int)world[0]+ox;ComposeY=(int)world[1]+oy;}
 int result=composeOriginal(self,glyph,entry,ox,oy);
 ComposingDialogue=old;ComposeX=oldX;ComposeY=oldY;return result;
}
// The normal update (4fc1b0) and immediate redraw (4fcde0) both call 545980. 4fc0a0 only clears/queues
// a surface: it does NOT contain the glyph loop. Owner +44c/+450 are the destination queued by 526100 after the 5452f0 surface getter;
// +2d0/+2d4 are its width/height. Keep these two pairs distinct.
static void BeginDirect(uintptr_t record,uintptr_t start){
 if(!Source.Begin())return;
 ToMeTextPos::Begin(Source.token);FailedCount=0;GlyphRange=true;LayoutPending=true;AdoptDialog(0);
   // Voice lines are padded to the centre with spaces only; an ADV box run carries the speaker name (or nothing) first.
   bool padded=start>record;for(uintptr_t p=record;padded&&p<start;p+=0x50){DWORD c=0;if(!ToMeTextPos::ReadDwords((void*)(p+4),&c,1))padded=false;else{c&=0xffff;if(c&&c!=0x20&&c!=0x8140&&c!=10&&c!=13&&c!=0xffff)padded=false;}}
   // Padding records are not always plain spaces: also treat a first glyph far from the run origin (>=3 em) as centred.
   if(!padded&&LayoutFirstX>=LayoutSize*3&&LayoutFirstY==LayoutY0)padded=true;
   // The game hides the narration window for a voice line (its sprite goes off) and shows one voice line at a time:
   // every directly drawn line starts its own page, so earlier page lines and voice lines are cleared.
   LineStats();Msg::Log("ToMe_PAGE engine=cs2 line=%ld same=0 token=%u",ToMeTextPos::Line,ToMeTextPos::Token);Msg::Log("ToMe_CS2_BEGIN line=%ld token=%u direct=%s first=%ld,%ld",ToMeTextPos::Line,Source.token,padded?"voice":"box",LayoutFirstX,LayoutFirstY);
   // ToMe maps texture slot 0 to screen y+8 and x+63: place the run centred, its top at y 331 of 720. SourcePendingAt
   // stays set: if a message window composes the same sentence later, that capture reports its real position instead.
   // The ADV box text starts at x 297, y 606 of 1280x720 (measured from the game's own screenshot).
   long w=LayoutX1-LayoutX0+LayoutSize;if(padded)EmitLayout(640-w/2-63-LayoutX0,331-8-LayoutY0);else EmitLayout(297-63-LayoutX0,606-8-LayoutY0);
}
static void FinishPrepared(uintptr_t owner){
 AcquireSRWLockExclusive(&SourceLock);
 if(PreparedOwner==owner){uintptr_t record=PreparedRecord,start=0;
  bool captured=Source.Resolve(GetTickCount(),[&](const std::string& text){return CaptureCandidate(record,text,start);});
  PreparedOwner=0;if(captured)BeginDirect(record,start);
 }
 ReleaseSRWLockExclusive(&SourceLock);
}
using PageTickFn=int(__thiscall*)(void*,int,int);static PageTickFn pageTickOriginal=nullptr;
static int __fastcall PageTick(void* self,void*,int a,int b){uintptr_t previous=Owner;Owner=(uintptr_t)self;int result=pageTickOriginal(self,a,b);if(previous!=Owner)FinishPrepared(Owner);Owner=previous;return result;}
// 4fc2c0 (virtual, ret 18h) is a third caller of the 5451e0 text update: centred voice lines on narration pages
// are laid out there, so without it Owner is unset and those sentences are neither positioned nor hidden.
using ShowFn=int(__thiscall*)(void*,int,int,int,int,int,int);static ShowFn showOriginal=nullptr;
static int __fastcall Show(void* self,void*,int a,int b,int c,int d,int e,int f){uintptr_t previous=Owner;Owner=(uintptr_t)self;int result=showOriginal(self,a,b,c,d,e,f);if(previous!=Owner)FinishPrepared(Owner);Owner=previous;return result;}
using RedrawFn=int(__thiscall*)(void*);static RedrawFn redrawOriginal=nullptr;
static int __fastcall Redraw(void* self,void*){uintptr_t previous=Owner;Owner=(uintptr_t)self;int result=redrawOriginal(self);if(previous!=Owner)FinishPrepared(Owner);Owner=previous;return result;}
using VisibilityFn=int(__thiscall*)(void*,unsigned,int);static VisibilityFn visibilityOriginal=nullptr;
// Directly drawn text (ADV box, OP captions) belongs to no watched window. Learn its window as the sprite shown just
// before such a line appears; that sprite going off then reports the dialogue hidden (OP, CG). Every sprite visibility
// change is logged once (ToMe_SPRITE) so a wrong guess can be corrected from the log.
static int __fastcall Visibility(void* renderer,void*,unsigned id,int visible){
 int result=visibilityOriginal(renderer,id,visible);bool emit=false,changed=false;
 if(result&&(visible==0||visible==1)){
  AcquireSRWLockExclusive(&SourceLock);
  int prior=0;changed=!Dialog.Lookup((unsigned)(uintptr_t)renderer,id,prior)||prior!=visible;emit=Dialog.Observe((unsigned)(uintptr_t)renderer,id,visible);
  if(visible){LastShownId=id;LastShownRenderer=(DWORD)(uintptr_t)renderer;LastShownAt=GetTickCount();}
  ReleaseSRWLockExclusive(&SourceLock);
  if(changed)Msg::Log("ToMe_SPRITE id=%x vis=%d r=%x",id,visible,(unsigned)(uintptr_t)renderer);
  if(emit)Msg::Log("ToMe_DIALOG engine=cs2 visible=%d",visible);
 }
 return result;
}
// This fallback never scans arbitrary heap strings or a font cache: only the current, fully laid-out
// record sequence, first quote, accepted recent sprite and the verified game's ADV/voice geometry qualify.
static void RecoverDirect(uintptr_t record,unsigned character,int size){
 if(Owner||ComposingDialogue||(character!=0x8175&&character!=0x8177))return;
 DWORD v[20];if(!ReadRecord(record,character,size,v))return;
 ToMeIslandFlow::QuoteGlyph first={character,(int)v[4],(int)v[5],size};int visible=0;
 bool adv=(LastShownId==0x55||LastShownId==0x56)&&Dialog.Lookup(LastShownRenderer,0x55,visible)&&visible==1;
 if(!ToMeIslandFlow::DirectBand(first,adv,(adv||LastShownId==0xe||LastShownId==0xf)&&LastShownAt&&GetTickCount()-LastShownAt<1500))return;
 auto text=ToMeIslandFlow::QuotedRun([&](unsigned i,ToMeIslandFlow::QuoteGlyph& glyph){DWORD r[20];
  if(!ToMeTextPos::ReadDwords((void*)(record+i*0x50),r,20))return false;
  glyph={r[1]&0xffff,(int)r[4],(int)r[5],(int)r[7]};return true;});
 if(text.empty())return;unsigned id=SourceToken(text);
 if(GlyphRange&&RecordStart==record&&SourceToken(Source.current)==id)return;
 uintptr_t start=0;
 // Prefer the original script's spaces/newlines when it is already available.
 bool captured=Source.Resolve(GetTickCount(),[&](const std::string& candidate){return SourceToken(candidate)==id&&CaptureCandidate(record,candidate,start);});
 if(!captured){Source.Observe(text,id,false,GetTickCount());captured=Source.Resolve(GetTickCount(),[&](const std::string& candidate){return SourceToken(candidate)==id&&CaptureCandidate(record,candidate,start);});}
 if(captured){SourcePendingAt=GetTickCount();BeginDirect(record,start);Msg::Log("ToMeCS2_RECOVER token=%u count=%ld band=%s",id,LayoutCount,first.y==8?"adv":"voice");}
}
static bool MatchGlyph(void* font,unsigned character,int size,int a4){
 AcquireSRWLockExclusive(&SourceLock);
 if((ComposingDialogue||(SourcePendingAt&&GetTickCount()-SourcePendingAt<1500&&First(Source.pending)==character))&&character!=0x20&&character!=0x8140){bool found=false;for(unsigned i=0;i<FontCount;i++)if(DialogueFonts[i]==(uintptr_t)font)found=true;if(!found&&FontCount<64){DialogueFonts[FontCount++]=(uintptr_t)font;Msg::Log("ToMeCS2_DIALOGUE_FONT %x",(unsigned)(uintptr_t)font);}}
 // Centred voice lines on narration pages are rasterised straight from their records, outside every message-window
 // update (no Owner, never composed): match the record behind a4 here. Their screen position is the fixed centre band.
 uintptr_t record=a4?(uintptr_t)a4-0x34:0;bool own=false;if(record)RecoverDirect(record,character,size);
 if(!ComposingDialogue&&a4&&Source.Pending(GetTickCount())&&
    (Source.generation!=ResolvedGeneration||Owner!=ResolvedOwner||!GlyphRange||record<=RecordStart||record>=RecordEnd)){DWORD v[20];uintptr_t start=0;
  CurrentRunProof=false;
  bool captured=ReadRecord(record,character,size,v)&&Source.Resolve(GetTickCount(),[&](const std::string& text){return CaptureCandidate(record,text,start);});
  // Once this generation proved the full run, later interior glyphs reuse that bounded ownership.
  // Unready/failed records are never memoized and may qualify on the next glyph.
  if(captured||CurrentRunProof){ResolvedGeneration=Source.generation;ResolvedOwner=Owner;}
  if(captured){
   if(Owner){
    // Hide a cold glyph before its message window composes it. Page/position events wait for Compose,
    // so an ordinary narration paragraph is not accidentally turned into a standalone centred page.
    GlyphRange=true;LayoutPending=true;
    if(PreparedOwner!=Owner||PreparedRevision!=Source.revision){PreparedOwner=Owner;PreparedRecord=record;PreparedRevision=Source.revision;}
   }else BeginDirect(record,start);
  }}
 if(GlyphRange&&record&&(record<RecordStart||record>=RecordEnd)&&Owner==RecordOwner&&!Source.current.empty())
  Reanchor(record,LayoutOriginX,LayoutOriginY);
 if(GlyphRange&&record>=RecordStart&&record<RecordEnd)own=true;
 ReleaseSRWLockExclusive(&SourceLock);
 return ComposingDialogue||own;
}
static int __fastcall Glyph(void* font,void*,uintptr_t target,unsigned character,int size,int a4,int a5,int a6,void* output){
 auto caller=reinterpret_cast<uintptr_t>(_ReturnAddress());
 struct Seen{uintptr_t caller,font,target;};static Seen seen[96]={};static unsigned n=0;
 bool known=false;for(unsigned i=0;i<n;i++)if(seen[i].caller==caller&&seen[i].font==(uintptr_t)font&&seen[i].target==target)known=true;
 if(!known&&n<96){seen[n++]={caller,(uintptr_t)font,target};Msg::Log("ToMeCS2_GLYPH caller=%x font=%x target=%x char=%x size=%d a=%x,%x,%x out=%x",(unsigned)caller,(unsigned)(uintptr_t)font,(unsigned)target,character,size,a4,a5,a6,(unsigned)(uintptr_t)output);}
 bool dialogue=MatchGlyph(font,character,size,a4);
 // Only matched sentence records are hidden. An unmatched/cached font must never blank unrelated UI or narration.
 LONG oldSkip=SkipBlend;DWORD oldThread=ActiveThread;ActiveThread=GetCurrentThreadId();SkipBlend=dialogue&&HideRequested();
 if(SkipBlend){static LONG draws=0;LONG n=InterlockedIncrement(&draws);if(n<=4||n%100==0)Msg::Log("ToMeCS2_DRAW skip #%ld",n);InterlockedIncrement(&LineHidden);}
 else if(SourcePendingAt&&GetTickCount()-SourcePendingAt<5000&&character!=0x20&&character!=0x8140){LONG k=InterlockedIncrement(&LineShown);if(k<=6)Msg::Log("ToMeCS2_SHOWN char=%x size=%d record=%x owner=%x dialogue=%d hide=%d path=glyph",character,size,(unsigned)a4-0x34,(unsigned)Owner,(int)dialogue,(int)HideRequested());}
 int result=original(font,target,character,size,a4,a5,a6,output);SkipBlend=oldSkip;ActiveThread=oldThread;return result;
}
// 53E610 owns the complete per-glyph operation, including the 53D680 cache-hit path that never calls 53E180.
// ISLAND calls the script text callback twice per line: a lookahead copy two lines early and a display copy that can
// arrive ~10 ms after the line was already drawn. After more than 5 s on the previous line the lookahead has expired,
// so an unquoted ADV line (no quote recovery) was drawn inside the previous line's records: hidden as the old line but
// never begun, and ToMe kept showing the old sentence (log 2026-11-02 16:10:12, user video; Opus 5.5 2026-11-03).
// Match the late copy against the ADV box records at once. If the box no longer holds the current line either, stop
// claiming those records, so a later redraw shows the original rather than nothing.
static void LateSource(const std::string& text){
 if(text.empty()||Owner||ComposingDialogue||RecordOwner||!RecordStart||!GlyphRange)return;
 if(ToMeIslandFlow::GlyphText(text)==ToMeIslandFlow::GlyphText(Source.current))return;
 // The new run may start before the old one (a shorter speaker name): look from 16 records earlier.
 uintptr_t base=RecordStart>16*0x50?RecordStart-16*0x50:RecordStart,start=0;
 bool captured=Source.Resolve(GetTickCount(),[&](const std::string& candidate){return candidate==text&&CaptureCandidate(base,candidate,start);});
 if(captured&&start){BeginDirect(start,start);Msg::Log("ToMeCS2_LATE_SOURCE token=%u count=%ld",Source.token,LayoutCount);return;}
 uintptr_t old=0;if(!Source.current.empty()&&!CaptureCandidate(RecordStart,Source.current,old)){GlyphRange=false;Msg::Log("ToMeCS2_STALE_RANGE token=%u",SourceToken(Source.current));}
}
// Scope suppression to a fully matched record. The cache lookup, allocation, metrics and output rect still execute.
using CachedGlyphFn=int(__thiscall*)(void*,uintptr_t,unsigned,int,int,int,int);
static CachedGlyphFn cachedGlyphOriginal=nullptr;static void* cachedBlendOriginal=nullptr;static uintptr_t cachedBlendDone=0x53d951;
static int __fastcall CachedGlyph(void* font,void*,uintptr_t target,unsigned character,int size,int a4,int a5,int a6){
 bool dialogue=MatchGlyph(font,character,size,a4);
 if(!dialogue&&SourcePendingAt&&GetTickCount()-SourcePendingAt<5000){static LONG misses=0;LONG n=InterlockedIncrement(&misses);if(n<=8||n%500==0)Msg::Log("ToMeCS2_CACHE_UNMATCHED char=%x size=%d record=%x owner=%x",character,size,(unsigned)a4-0x34,(unsigned)Owner);}
 LONG oldSkip=SkipBlend;DWORD oldThread=ActiveThread;
 ActiveThread=GetCurrentThreadId();SkipBlend=dialogue&&HideRequested();
 if(SkipBlend)InterlockedIncrement(&LineHidden);else if(SourcePendingAt&&GetTickCount()-SourcePendingAt<5000&&character!=0x20&&character!=0x8140){LONG k=InterlockedIncrement(&LineShown);if(k<=6)Msg::Log("ToMeCS2_SHOWN char=%x size=%d record=%x owner=%x dialogue=%d hide=%d path=cache",character,size,(unsigned)a4-0x34,(unsigned)Owner,(int)dialogue,(int)HideRequested());}
 int result=cachedGlyphOriginal(font,target,character,size,a4,a5,a6);SkipBlend=oldSkip;ActiveThread=oldThread;return result;
}
static __declspec(naked) void CachedBlendGate(){__asm{
 pushfd
 push eax
 mov eax,fs:[24h]
 cmp eax,ActiveThread
 jne forward
 cmp SkipBlend,0
 je forward
 pop eax
 popfd
 jmp dword ptr [cachedBlendDone]
 forward:
 pop eax
 popfd
 jmp dword ptr [cachedBlendOriginal]
}}
static void InstallCache(){
 if(memcmp((void*)0x53e610,"\x81\xec\x9c\x00\x00\x00",6)||memcmp((void*)0x53e715,"\x81\xc4\x9c\x00\x00\x00\xc2\x18\x00",9)||memcmp((void*)0x53d941,"\x85\xf6\x74\x07\xe8\xd6\x67\xff\xff",9)){
  Msg::Log("ToMeCS2_CACHE unavailable: instruction signature differs");return;}
 void* a=(void*)0x53e610;void* b=(void*)0x53d941;
 if(MH_CreateHook(a,(void*)CachedGlyph,(void**)&cachedGlyphOriginal)!=MH_OK)return;
 if(MH_CreateHook(b,(void*)CachedBlendGate,&cachedBlendOriginal)!=MH_OK){MH_RemoveHook(a);return;}
 if(MH_EnableHook(b)!=MH_OK||MH_EnableHook(a)!=MH_OK){MH_DisableHook(a);MH_DisableHook(b);MH_RemoveHook(a);MH_RemoveHook(b);Msg::Log("ToMeCS2_CACHE unavailable: hook install failed");return;}
 Msg::Log("ToMeCS2_CACHE matched-record scope installed; cached final composite only, metrics and glyph cache preserved");
}
static bool Install(){
 if(reinterpret_cast<uintptr_t>(GetModuleHandleW(nullptr))!=0x400000||!ExactFile())return false;
 if(memcmp((void*)0x53e57c,"\x50\x85\xf6\x74\x07",5)||memcmp((void*)0x503af0,"\xbe\x18\x05\x89\x00",5))return false;
 if(memcmp((void*)0x53d5d0,"\x53\x8b\x5c\x24\x10\x33\xc0",7))return false;
 void* addresses[]={(void*)0x53d5d0,(void*)0x53e57c,(void*)0x53e180,(void*)0x545980,(void*)0x4fc1b0,(void*)0x4fcde0,(void*)0x526160,(void*)0x4fc2c0};
 void* detours[]={(void*)Outline,(void*)BlendGate,(void*)Glyph,(void*)Compose,(void*)PageTick,(void*)Redraw,(void*)Visibility,(void*)Show};
 void** originals[]={(void**)&outlineOriginal,&blendOriginal,(void**)&original,(void**)&composeOriginal,(void**)&pageTickOriginal,(void**)&redrawOriginal,(void**)&visibilityOriginal,(void**)&showOriginal};
 for(unsigned i=0;i<3;i++)if(MH_CreateHook(addresses[i],detours[i],originals[i])!=MH_OK){for(unsigned j=0;j<i;j++)MH_RemoveHook(addresses[j]);return false;}
 for(unsigned i=0;i<3;i++)if(MH_EnableHook(addresses[i])!=MH_OK){for(unsigned j=0;j<3;j++){MH_DisableHook(addresses[j]);MH_RemoveHook(addresses[j]);}return false;}
 bool telemetry=memcmp((void*)0x4fc1b0,"\x56\x57\xff\x74\x24\x10",6)==0&&memcmp((void*)0x545980,"\x81\xec\xa8\x00\x00\x00",6)==0&&memcmp((void*)0x4fcde0,"\x83\xec\x0c\x8d\x04\x24\x56\x8b\xf1",9)==0&&memcmp((void*)0x526160,"\x56\x8b\xf1\x83\x3e\x00",6)==0;
 if(telemetry){for(unsigned i=3;i<7;i++)if(MH_CreateHook(addresses[i],detours[i],originals[i])!=MH_OK){telemetry=false;break;}}
 if(telemetry){for(unsigned i=3;i<7;i++)if(MH_EnableHook(addresses[i])!=MH_OK){telemetry=false;break;}}
 if(!telemetry){for(unsigned i=3;i<7;i++){MH_DisableHook(addresses[i]);MH_RemoveHook(addresses[i]);}Msg::Log("ToMeCS2 position adapter unavailable; unmatched original drawing retained");}
 else{if(!memcmp((void*)0x4fc2c0,"\x83\xec\x34\xa1\x50\x65\x83\x00",8)&&MH_CreateHook(addresses[7],detours[7],originals[7])==MH_OK&&MH_EnableHook(addresses[7])==MH_OK)Msg::Log("ToMeCS2 centred line owner installed");Msg::Log("ToMeCS2 sentence layout adapter installed: full records, origin+44c/+450, matched drawing only");}
 HookParam hp;hp.address=0x503af0;hp.type=USING_STRING|FULL_STRING|NO_CONTEXT|EMBED_ABLE;hp.offset=regoffset(eax);hp.codepage=932;
 hp.text_fun=[](hook_context* c,HookParam*,TextBuffer* b,uintptr_t* split){auto text=(const char*)c->eax;if(!text||!*text||all_ascii(text))return;auto value=Clean(text);if(value.empty())return;if(Name(text,value)){*split=Engine::NameRole;return;}auto spoken=ToMeIslandFlow::Spoken(value);AcquireSRWLockExclusive(&SourceLock);if(Source.Observe(spoken,SourceToken(spoken),false,GetTickCount())){SourcePendingAt=GetTickCount();LateSource(spoken);}ReleaseSRWLockExclusive(&SourceLock);b->from(std::string(1,'\x1e')+value+RubyPairs(text)+std::string(1,'\x1f'));*split=Engine::ScenarioRole;};
 hp.embed_fun=[](hook_context*,TextBuffer,HookParam*){}; // draw control only, original text remains intact
 Msg::Log("ToMeCS2_DRAW draw preservation installed; scripts/history unchanged");if(NewHook(hp,"EmbedToMeCS2_DrawPreserve")){InstallCache();return true;}for(unsigned j=0;j<8;j++){MH_DisableHook(addresses[j]);MH_RemoveHook(addresses[j]);}return false;
}
}
