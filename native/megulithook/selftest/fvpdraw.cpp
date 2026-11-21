// SPDX-License-Identifier: GPL-3.0-or-later
#include "../FvpDrawSig.h"
#include "fvpdraw-snippet.h"
#include <cstdio>
#include <vector>
static int Failures=0,Checks=0;
static void Check(bool ok,const char *why){Checks++;if(!ok){Failures++;printf("FAIL %s\n",why);}}
static std::vector<unsigned char> Bytes(const char *s){std::vector<unsigned char>b;for(size_t i=0;s[i];i+=2){unsigned n;sscanf(s+i,"%2x",&n);b.push_back((unsigned char)n);}return b;}
int main(){const char *inputs[]={FvpSnippet0,FvpSnippet1};size_t at[3];
 for(int build=0;build<2;build++){auto b=Bytes(inputs[build]);Check(FvpDrawSig::Find(b.data(),b.size(),at,3)==1&&at[0]==0,"actual append entry once");
  for(size_t i=0;i<sizeof FvpDrawSig::Entry;i++){auto bad=b;bad[i]^=0x5a;Check(FvpDrawSig::Find(bad.data(),bad.size(),at,3)==0,"mutated instruction rejected");}
  for(size_t n=0;n<sizeof FvpDrawSig::Entry;n++)Check(FvpDrawSig::Find(b.data(),n,at,3)==0,"truncated entry rejected");
  auto twice=b;twice.insert(twice.end(),b.begin(),b.end());Check(FvpDrawSig::Find(twice.data(),twice.size(),at,3)==2,"duplicate entry remains ambiguous");
  Check(b[b.size()-3]==0xc2&&b[b.size()-2]==4&&b.back()==0,"actual callee returns with ret4");
  Check(FvpDrawSig::ValidSite(build,1,FvpDrawSig::Builds[build].rva),"unique expected RVA for this build");
  Check(!FvpDrawSig::ValidSite(build,0,FvpDrawSig::Builds[build].rva)&&!FvpDrawSig::ValidSite(build,2,FvpDrawSig::Builds[build].rva),"missing or duplicate refuses activation");
  Check(!FvpDrawSig::ValidSite(build,1,FvpDrawSig::Builds[1-build].rva),"other version RVA grants no activation");
 }
 auto glyph=Bytes(FvpGlyph);Check(FvpDrawSig::Find(glyph.data(),glyph.size(),at,3)==0,"glyph/cache path is not raw append");Check(!FvpDrawSig::ValidSite(-1,1,0x31bb0)&&!FvpDrawSig::ValidSite(2,1,0x33610),"unknown version fails closed");
 printf("FVP signature: %d checks, %d failures\n",Checks,Failures);return Failures;
}
