// SPDX-License-Identifier: GPL-3.0-or-later
#include "../PalTextBounds.h"
#include <windows.h>
#include <atomic>
#include <cstdio>
#include <string>
#include <thread>
#include <vector>

static int checks=0,failed=0;
static void Check(bool ok,const char *name) {++checks;if(!ok){++failed;std::printf("FAIL %s\n",name);}}
static bool Replace(char *p,const std::string &value) {
 PalTextBounds::Snapshot snapshot;
 return PalTextBounds::Capture(p,&snapshot)&&PalTextBounds::Apply(&snapshot,p,value.data(),value.size());
}
/* This is the old four-byte suffix test, preserved solely as a guard-page negative control */
static bool OldSuffixFault(const char *p) {
 __try {volatile const char *text=p;int length=1;
  volatile bool suffix=text[length-1]=='>'&&text[length-2]=='c'&&text[length-3]=='/'&&text[length-4]=='<';
  (void)suffix;return false;
 }__except(EXCEPTION_EXECUTE_HANDLER){return GetExceptionCode()==EXCEPTION_ACCESS_VIOLATION;}
}
int main() {
 PalTextBounds::Slice s;
 Check(!PalTextBounds::Split(nullptr,1,&s),"null source");
 Check(!PalTextBounds::Split("",0,&s),"empty source");
 Check(PalTextBounds::Split(">",1,&s)&&s.prefix==0&&s.body==1&&s.suffix==0,"one byte suffix candidate");
 Check(PalTextBounds::Split("<c",2,&s)&&s.body==2,"incomplete prefix retained");
 Check(!PalTextBounds::Split("<c></c>",7,&s),"empty wrapped body");
 Check(PalTextBounds::Split("<c x>abc</c>",12,&s)&&s.prefix==5&&s.body==3&&s.suffix==4,"bounded prefix suffix");
 char shortText[64];std::memset(shortText,0x5a,sizeof shortText);std::memcpy(shortText,"abc",4);
 Check(Replace(shortText,"XY")&&!std::strcmp(shortText,"XY")&&shortText[4]==0x5a,"shorter retains span canary");
 char wrapped[64];std::memset(wrapped,0x5a,sizeof wrapped);std::memcpy(wrapped,"<c x>abc</c>",13);
 Check(Replace(wrapped,"Q")&&!std::strcmp(wrapped,"<c x>Q</c>")&&wrapped[13]==0x5a,"wrapper suffix moved inside span");
 char exact[]="<c>abc</c>";
 Check(Replace(exact,"XYZ")&&!std::strcmp(exact,"<c>XYZ</c>"),"equal replacement size");
 char grow[64];std::memset(grow,0x5a,sizeof grow);std::memcpy(grow,"abc",4);
 char saved[64];std::memcpy(saved,grow,sizeof grow);
 Check(!Replace(grow,"123456789")&&!std::memcmp(grow,saved,sizeof grow),"growth rejects without any mutation");
 Check(!Replace(grow,std::string("a\0b",3))&&!std::memcmp(grow,saved,sizeof grow),"embedded NUL rejects unchanged");
 Check(Replace(grow,"")&&grow[0]==0&&grow[4]==0x5a,"empty replacement is bounded blank");
 char stale[]="<c>abc</c>";PalTextBounds::Split(stale,std::strlen(stale),&s);stale[1]='x';
 char staleSaved[sizeof stale];std::memcpy(staleSaved,stale,sizeof stale);
 Check(!PalTextBounds::Replace(stale,sizeof stale,s,"Q",1)&&!std::memcmp(stale,staleSaved,sizeof stale),"stale shape rejects unchanged");
 char alias[]="abcdef";PalTextBounds::Split(alias,6,&s);
 Check(!PalTextBounds::Replace(alias,sizeof alias,s,alias+1,2)&&!std::strcmp(alias,"abcdef"),"overlapping replacement rejected");
 Check(!PalTextBounds::Replace(alias,3,s,"x",1),"capacity mismatch rejected");
 std::string maximum(PalTextBounds::MaxBytes,'x');
 Check(PalTextBounds::Split(maximum.data(),maximum.size(),&s)&&s.body==maximum.size(),"maximum accepted");
 maximum+='x';Check(!PalTextBounds::Split(maximum.data(),maximum.size(),&s),"over maximum rejected");
 char changed[]="abcdef";PalTextBounds::Snapshot snapshot;
 PalTextBounds::Capture(changed,&snapshot);changed[0]='X';
 Check(!PalTextBounds::Apply(&snapshot,changed,"a",1)&&!std::strcmp(changed,"Xbcdef"),"changed source rejects stale answer");
 PalTextBounds::Capture(changed,&snapshot);char other[]="Xbcdef";
 Check(!PalTextBounds::Apply(&snapshot,other,"a",1)&&!std::strcmp(other,"Xbcdef"),"equal bytes different pointer rejected");
 PalTextBounds::Capture(changed,&snapshot);
 bool first=PalTextBounds::Apply(&snapshot,changed,"abc",3),second=PalTextBounds::Apply(&snapshot,changed,"def",3);
 Check(first&&!second&&!std::strcmp(changed,"abc"),"snapshot consumed once");
 Check(!PalTextBounds::Capture(nullptr,&snapshot)&&!snapshot.valid,"failed capture clears authorization");
 std::string unterminated(PalTextBounds::MaxBytes+1,'x');
 Check(!PalTextBounds::Capture(unterminated.data(),&snapshot)&&!snapshot.valid,"overlimit capture clears authorization");
 SYSTEM_INFO info;GetSystemInfo(&info);size_t page=info.dwPageSize;
 char *pages=(char *)VirtualAlloc(nullptr,page*2,MEM_RESERVE|MEM_COMMIT,PAGE_READWRITE);
 if(pages){DWORD previous=0;VirtualProtect(pages,page,PAGE_NOACCESS,&previous);char *one=pages+page;one[0]='>';one[1]=0;
  Check(OldSuffixFault(one),"old suffix read faults before source");
  Check(PalTextBounds::Split(one,1,&s)&&s.body==1,"new suffix never reads before source");
  VirtualFree(pages,0,MEM_RELEASE);
 }else Check(false,"guard allocation");
 /* Two paused callbacks interleave before either replaces: only local spans may determine the target */
 char a[]="<c>AAAA</c>",b[]="<c>BBBB</c>";PalTextBounds::Slice sa,sb;
 PalTextBounds::Split(a,std::strlen(a),&sa);PalTextBounds::Split(b,std::strlen(b),&sb);
 bool okA=PalTextBounds::Replace(a,sizeof a,sa,"aa",2),okB=PalTextBounds::Replace(b,sizeof b,sb,"bb",2);
 Check(okA&&okB&&!std::strcmp(a,"<c>aa</c>")&&!std::strcmp(b,"<c>bb</c>"),"interleaved callbacks do not share target");
 std::atomic<unsigned> errors(0);std::vector<std::thread> threads;
 for(int t=0;t<8;++t)threads.emplace_back([&] {for(int i=0;i<2000;++i){char p[]="<c x>ABCDEF</c>";if(!Replace(p,"abc")||std::strcmp(p,"<c x>abc</c>"))++errors;}});
 for(auto &thread:threads)thread.join();
 Check(errors.load()==0,"16000 parallel replacements remain independent");
 /* Old strcpy writes past the known original NUL span, while staying within this owned canary allocation */
 char old[32];std::memset(old,0x5a,sizeof old);std::memcpy(old,"abc",4);
#pragma warning(push)
#pragma warning(disable:4996)
 std::strcpy(old,"123456789");
#pragma warning(pop)
 Check(old[4]!=0x5a,"old strcpy changes span canary");
 std::printf("checks=%d pass=%d fail=%d\n",checks,checks-failed,failed);
 return failed?1:0;
}
