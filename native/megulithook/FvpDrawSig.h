// SPDX-License-Identifier: GPL-3.0-or-later
// Raw byte append, ECX this + one callee-cleaned word. Builds are independent exact pins.
#pragma once
#include <cstddef>
#include <cstdint>
#include <cstring>
namespace FvpDrawSig {
struct Build{const char *sha256;unsigned fileBytes,rva;};
static const Build Builds[]={
 {"1d0f37a6f22dc77780621982f5466d4e9e9d19e1b901f0ea4f8422b2e6a75b83",719360,0x31bb0},
 {"adb556478ad608a3a0321f7d3b6e7e3c8394c648ca4758fea80e2ac0c683a492",817664,0x33610}
};
static const unsigned char Entry[]={0x83,0xec,0x0c,0x55,0x56,0x57,0x8b,0xf9,0x8d,0x44,0x24,0x0c,0x8d,0xb7,0x74,0x05,0x00,0x00,0x50,0x8b,0xce,0x89,0x7c,0x24,0x18,0xc7,0x44,0x24,0x10,0x01,0x00,0x00,0x00};
inline int Find(const unsigned char *code,size_t bytes,size_t *out,int max){int n=0;for(size_t i=0;i+sizeof Entry<=bytes;i++)if(!std::memcmp(code+i,Entry,sizeof Entry)){if(n<max)out[n]=i;n++;}return n;}
inline bool ValidSite(int build,int count,uintptr_t rva){return build>=0&&build<2&&count==1&&rva==Builds[build].rva;}
}
