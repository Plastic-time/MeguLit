// SPDX-License-Identifier: GPL-3.0-or-later
// Old Majiro complete-string draw: cdecl(font, destination, CP932 text, output box, flags).
// The prologue's stack offsets must agree, and the output box takes the font's pen at +48/+4c.
// Pure matcher, mirrored by tools/engine-sigs/majiro-draw.cjs. No fixed image address.
#pragma once
#include <cstddef>
#include <cstdint>
#include <cstring>
namespace MajiroDrawSig {
struct Site { size_t offset; std::uint32_t locals; };
inline std::uint32_t Word(const unsigned char *p){std::uint32_t v;std::memcpy(&v,p,4);return v;}
inline bool At(const unsigned char *p,const unsigned char *want,size_t n){return std::memcmp(p,want,n)==0;}
inline int Find(const unsigned char *code,size_t size,Site *out,int max){
 const unsigned char a[]={0x56,0x8b,0xb4,0x24},b[]={0x80,0x3e,0,0x75,0x0a,0x33,0xc0,0x5e,0x81,0xc4},c[]={0xc3,0x53,0x8b,0x9c,0x24},d[]={0x85,0xdb,0x55,0x57},h[]={0x8b,0x7b,0x28},p[]={0x8b,0x53,0x48,0x8b,0x84,0x24},q[]={0x89,0x10,0x8b,0x4b,0x4c,0x89,0x48,0x04};
 int hits=0;for(size_t i=0;i+0xd0<=size;i++){
  if(code[i]!=0x81||code[i+1]!=0xec)continue;std::uint32_t locals=Word(code+i+2);
  if(locals<0x40||locals>0x1000||locals%4||!At(code+i+6,a,sizeof a)||Word(code+i+10)!=locals+16||!At(code+i+14,b,sizeof b)||Word(code+i+24)!=locals||!At(code+i+28,c,sizeof c)||Word(code+i+33)!=locals+12||!At(code+i+37,d,sizeof d)||!At(code+i+48,h,sizeof h))continue;
  bool pen=false;for(size_t j=0x50;j<0xbf;j++)if(At(code+i+j,p,sizeof p)&&Word(code+i+j+6)==locals+0x30&&At(code+i+j+10,q,sizeof q)){pen=true;break;}
  if(pen){if(hits<max)out[hits]={i,locals};hits++;}
 }return hits;
}
}
