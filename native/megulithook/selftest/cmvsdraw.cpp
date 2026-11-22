// SPDX-License-Identifier: GPL-3.0-or-later
#include "../CmvsDrawSig.h"
#include "cmvsdraw-snippet.h"
#include <cstdio>
#include <vector>
static int Failures=0,Checks=0;
static void Check(bool ok,const char *why){Checks++;if(!ok){Failures++;printf("FAIL %s\n",why);}}
static std::vector<unsigned char> Bytes(const char *s){std::vector<unsigned char>b;for(size_t i=0;s[i];i+=2){unsigned n;sscanf(s+i,"%2x",&n);b.push_back((unsigned char)n);}return b;}
int main(){const char *inputs[]={CmvsSnippet0,CmvsSnippet1};unsigned rets[]={CmvsRet0,CmvsRet1};size_t at[3];
 for(unsigned e=0;e<2;e++){auto b=Bytes(inputs[e]);Check(CmvsDrawSig::Find(e,b.data(),b.size(),at,3)==1&&at[0]==0,"actual draw entry once");
  for(size_t i=0;i<CmvsDrawSig::Entries[e].size;i++){auto bad=b;bad[i]^=0x5a;Check(CmvsDrawSig::Find(e,bad.data(),bad.size(),at,3)==0,"mutated instruction rejected");}
  for(size_t n=0;n<CmvsDrawSig::Entries[e].size;n++)Check(CmvsDrawSig::Find(e,b.data(),n,at,3)==0,"truncated entry rejected");
  auto twice=b;twice.insert(twice.end(),b.begin(),b.end());Check(CmvsDrawSig::Find(e,twice.data(),twice.size(),at,3)==2,"ambiguous entry remains observable");
  Check(CmvsDrawSig::Find(1-e,b.data(),b.size(),at,3)==0,"entry types remain distinct");Check((rets[e]>>16)==0xc2&&((rets[e]>>8)&255)==8&&(rets[e]&255)==0,"actual original ret consumes two words");
 }
 auto measure=Bytes(CmvsMeasurement);for(unsigned e=0;e<2;e++)Check(CmvsDrawSig::Find(e,measure.data(),measure.size(),at,3)==0,"full-string metrics entry is not a draw entry");
 int count[2]={1,1};uintptr_t rvas[2]={0x64850,0x65720};Check(CmvsDrawSig::ValidPair(count,rvas),"both actual entries required");for(int e=0;e<2;e++){count[e]=0;Check(!CmvsDrawSig::ValidPair(count,rvas),"missing entry rejects entire pair");count[e]=2;Check(!CmvsDrawSig::ValidPair(count,rvas),"duplicate entry rejects entire pair");count[e]=1;rvas[e]++;Check(!CmvsDrawSig::ValidPair(count,rvas),"wrong RVA rejects entire pair");rvas[e]--;}
 printf("CMVS signature: %d checks, %d failures\n",Checks,Failures);return Failures;
}
