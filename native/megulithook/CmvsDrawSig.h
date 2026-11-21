// SPDX-License-Identifier: GPL-3.0-or-later
// One Aoi Tori build: ECX this + two callee-cleaned words; both draw entries are required.
#pragma once
#include <cstddef>
#include <cstdint>
#include <cstring>
namespace CmvsDrawSig {
static const char Sha256[]="3a2ec3af6a16a4f36d72faf9e7cb14e2bcc883fbf22fb31da5d69434cc53727e";
static const unsigned FileBytes=1061728,MainRva=0x64850,AlternateRva=0x65720;
static const unsigned char MainEntry[]={0x55,0x8b,0xec,0x81,0xec,0x88,0x2,0x0,0x0,0xa1,0x44,0xad,0x4e,0x0,0x33,0xc5,0x89,0x45,0xfc,0x8b,0x45,0xc,0x53,0x56,0x8b,0xf1,0x89,0x85,0xc8,0xfd,0xff,0xff};
static const unsigned char AlternateEntry[]={0x55,0x8b,0xec,0x83,0xec,0x48,0xa1,0x44,0xad,0x4e,0x0,0x33,0xc5,0x89,0x45,0xfc,0x8b,0x45,0xc,0x53,0x56,0x8b,0xf1,0x89,0x45,0xe8,0x57,0x8b,0x7d,0x8,0x33,0xdb};
struct Entry{unsigned rva;const unsigned char *bytes;size_t size;};
static const Entry Entries[]={{MainRva,MainEntry,sizeof MainEntry},{AlternateRva,AlternateEntry,sizeof AlternateEntry}};
inline int Find(unsigned entry,const unsigned char *code,size_t bytes,size_t *out,int max){if(entry>=2)return 0;const auto &e=Entries[entry];int n=0;for(size_t i=0;i+e.size<=bytes;i++)if(!std::memcmp(code+i,e.bytes,e.size)){if(n<max)out[n]=i;n++;}return n;}
inline bool ValidPair(const int *count,const uintptr_t *rvas){return count[0]==1&&count[1]==1&&rvas[0]==MainRva&&rvas[1]==AlternateRva;}
}
