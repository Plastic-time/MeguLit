// SPDX-License-Identifier: GPL-3.0-or-later
#include "../AdvhdDrawSig.h"
#include "advhddraw-snippet.h"
#include <cstdio>
#include <vector>
static int Failures=0,Checks=0;
static void Check(bool ok,const char *why){Checks++;if(!ok){Failures++;printf("FAIL %s\n",why);}}
int main(){std::vector<unsigned char>b;for(size_t i=0;AdvhdEntrySnippet[i];i+=2){unsigned n;sscanf(AdvhdEntrySnippet+i,"%2x",&n);b.push_back((unsigned char)n);}size_t at[3];
 Check(AdvhdDrawSig::Find(b.data(),b.size(),at,3)==1&&at[0]==0,"real input entry once");
 for(size_t i=0;i<sizeof AdvhdDrawSig::Entry;i++){auto bad=b;bad[i]^=0x5a;Check(AdvhdDrawSig::Find(bad.data(),bad.size(),at,3)==0,"changed instruction rejected");}
 for(size_t n=0;n<sizeof AdvhdDrawSig::Entry;n++)Check(AdvhdDrawSig::Find(b.data(),n,at,3)==0,"truncated prefix rejected");
 auto twice=b;twice.insert(twice.end(),b.begin(),b.end());Check(AdvhdDrawSig::Find(twice.data(),twice.size(),at,3)==2,"ambiguous entries visible");
 Check(AdvhdDrawSig::TextArg==7&&AdvhdDrawSig::StackWords==11,"ABI metadata");
 printf("AdvHD signature: %d checks, %d failures\n",Checks,Failures);return Failures;}
