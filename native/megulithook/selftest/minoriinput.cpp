// SPDX-License-Identifier: GPL-3.0-or-later
#include "../MinoriInputSig.h"
#include "minoriinput-snippet.h"
#include <cstdio>
#include <vector>
static int Checks=0,Failures=0;
static void Check(bool okay,const char *why){Checks++;if(!okay){Failures++;printf("FAIL %s\n",why);}}
static std::vector<unsigned char> Config(const char *s){std::vector<unsigned char>b={255,254};for(;*s;s++){b.push_back(*s);b.push_back(0);}return b;}
static std::vector<unsigned char> Unhex(const char *s){std::vector<unsigned char>b;for(size_t i=0;s[i];i+=2){unsigned n;sscanf(s+i,"%2x",&n);b.push_back((unsigned char)n);}return b;}
int main(){size_t at[2];auto b=Unhex(MinoriEntrySnippet);
 Check(MinoriInputSig::Find(b.data(),b.size(),at,2)==1&&at[0]==0,"complete real entry");
 for(size_t i=0;i<b.size();i++){auto changed=b;changed[i]^=0x5a;Check(MinoriInputSig::Find(changed.data(),changed.size(),at,2)==0,"mutated entry");Check(MinoriInputSig::Find(b.data(),i,at,2)==0,"truncated entry");}
 auto twice=b;twice.insert(twice.end(),b.begin(),b.end());Check(MinoriInputSig::Find(twice.data(),twice.size(),at,2)==2,"ambiguity remains visible");
 std::vector<unsigned char>image(0x4000);auto copy=Unhex(MinoriCopyEntrySnippet),layout=Unhex(MinoriCopyLayoutSnippet);memcpy(image.data()+MinoriInputSig::CopyRva,copy.data(),copy.size());memcpy(image.data()+MinoriInputSig::CopyLayoutRva,layout.data(),layout.size());
 Check(MinoriInputSig::Layout(image.data(),image.size()),"actual copy helper length and SSO layout");image[MinoriInputSig::CopyRva+16]^=1;Check(!MinoriInputSig::Layout(image.data(),image.size()),"wrong object length field rejected");image[MinoriInputSig::CopyRva+16]^=1;image[MinoriInputSig::CopyLayoutRva+7]^=1;Check(!MinoriInputSig::Layout(image.data(),image.size()),"wrong capacity field rejected");Check(!MinoriInputSig::Layout(image.data(),MinoriInputSig::CopyRva),"bounded image layout");
 auto yes=Config("#cfg roles=0 embed=0 minoriInput=1\r\n");Check(MinoriInputSig::ConfigAsked(yes.data(),yes.size()),"independent permission");
 for(const char *s:{"#cfg roles=1 embed=1\r\n","x\r\n#cfg minoriInput=1\r\n","#cfg minoriInput=10\r\n","#cfg minoriInput=1 minoriInput=0\r\n","#cfg minoriInput=1 minoriInput=1\r\n","#cfg minoriInput=1","#cfg minoriInput=1\r","#cfg minoriInput\r\n","#cfg minoriInput=0\r\nminoriInput=1\r\n"}){auto c=Config(s);Check(!MinoriInputSig::ConfigAsked(c.data(),c.size()),"malformed/missing/duplicate/late permission rejected");}
 Check(!MinoriInputSig::ConfigAsked(yes.data()+2,yes.size()-2),"BOM is required by the actual control protocol");yes[3]=1;Check(!MinoriInputSig::ConfigAsked(yes.data(),yes.size()),"non ASCII UTF16 first line rejected");
 printf("Minori signature/control: %d checks, %d failures\n",Checks,Failures);return Failures;
}
