// SPDX-License-Identifier: GPL-3.0-or-later
#include "../MajiroDrawSig.h"
#include "majirodraw-snippet.h"
#include <cstdio>
#include <vector>
static int Failures;
static void Check(bool ok,const char *why){printf("%s %s\n",ok?"PASS":"FAIL",why);if(!ok)Failures++;}
int main(){
 std::vector<unsigned char>b;for(size_t i=0;MajiroDrawHex[i];i+=2){unsigned x;sscanf(MajiroDrawHex+i,"%2x",&x);b.push_back((unsigned char)x);}
 MajiroDrawSig::Site out[2];int n=MajiroDrawSig::Find(b.data(),b.size(),out,2);
 Check(n==1&&out[0].offset==0&&out[0].locals==0xa0,"true Himeko complete-string entry");
 for(size_t offset:{10,24,33,48}){auto bad=b;bad[offset]^=4;Check(MajiroDrawSig::Find(bad.data(),bad.size(),out,2)==0,"changed argument/stack/font pattern rejected");}
 auto duplicate=b;duplicate.insert(duplicate.end(),b.begin(),b.end());Check(MajiroDrawSig::Find(duplicate.data(),duplicate.size(),out,2)==2,"ambiguous functions counted, not silently accepted");
 for(size_t n=0;n<0xd0;n++)if(MajiroDrawSig::Find(b.data(),n,out,2)!=0){Check(false,"truncated input rejected");break;}
 printf("Majiro signature: %d failure(s)\n",Failures);return Failures;
}
