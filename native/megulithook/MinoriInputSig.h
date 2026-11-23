// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <cstddef>
#include <cstdint>
#include <cstring>
namespace MinoriInputSig {
static const char Sha256[]="7b0f4be87c1296e62b7425d2ee3470e337e51921c4e28adba67d4a3cfed50fc3";
static const unsigned FileBytes=2267992,EntryRva=0x10d4b0,VtableRva=0x1664c4,CursorOffset=0x28,StackWords=1;
static const unsigned CopyRva=0x2ff0,CopyLayoutRva=0x305f,LengthOffset=0x10,CapacityOffset=0x14,InlineThreshold=16;
static const unsigned char Entry[]={0x55,0x8b,0xec,0x8b,0x45,0x08,0x56,0x57,0x8b,0xf1,0x6a,0x00,0x8d,0x7e,0x0c,0x50,0x83,0xc8,0xff,0x8b,0xcf,0xe8,0x26,0x5b,0xef,0xff,0x83,0x7f,0x14,0x10,0x72,0x02,0x8b,0x3f,0x89,0x7e,0x28,0x5f,0xc6,0x46,0x08,0x00,0x5e,0x5d,0xc2,0x04,0x00};
inline int Find(const unsigned char *code,size_t size,size_t *out,int max){int hits=0;for(size_t i=0;i+sizeof Entry<=size;i++)if(!std::memcmp(code+i,Entry,sizeof Entry)){if(hits<max)out[hits]=i;hits++;}return hits;}
static const unsigned char CopyEntry[]={0x55,0x8b,0xec,0x53,0x8b,0x5d,0x0c,0x56,0x8b,0xf1,0x8b,0x4d,0x08,0x57,0x8b,0x79,0x10,0x3b,0xfb,0x73,0x0a};
static const unsigned char CopyLayout[]={0xb8,0x10,0x00,0x00,0x00,0x39,0x41,0x14,0x72,0x02,0x8b,0x09,0x39,0x46,0x14,0x72,0x2a,0x8b,0x06,0xeb,0x28};
inline bool Layout(const unsigned char *image,size_t size){return image&&CopyRva<=size&&sizeof CopyEntry<=size-CopyRva&&CopyLayoutRva<=size&&sizeof CopyLayout<=size-CopyLayoutRva&&!std::memcmp(image+CopyRva,CopyEntry,sizeof CopyEntry)&&!std::memcmp(image+CopyLayoutRva,CopyLayout,sizeof CopyLayout);}
inline bool ConfigAsked(const unsigned char *b,size_t size){
 if(!b||size<4||b[0]!=0xff||b[1]!=0xfe)return false;
 char line[512];size_t n=0,p=2;bool complete=false;
 for(;p+1<size;p+=2){unsigned c=b[p];if(b[p+1])return false;
  if(c=='\r'){if(p+3>=size||b[p+2]!='\n'||b[p+3])return false;complete=true;break;}
  if(c=='\n'){complete=true;break;}
  if(c<0x20||c>0x7e||n>=sizeof line-1)return false;line[n++]=(char)c;
 }
 if(!complete||n<5||std::memcmp(line,"#cfg ",5))return false;
 int keys=0;bool enabled=false;
 for(size_t a=5;a<n;){while(a<n&&line[a]==' ')a++;size_t e=a;while(e<n&&line[e]!=' ')e++;
  const size_t k=12;if(e-a>=k&&!std::memcmp(line+a,"minoriInput=",k)){keys++;enabled=e-a==13&&line[a+12]=='1';}
  else if(e-a==11&&!std::memcmp(line+a,"minoriInput",11))return false;
  a=e;
 }
 return keys==1&&enabled;
}
}
