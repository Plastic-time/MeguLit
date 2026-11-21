// SPDX-License-Identifier: GPL-3.0-or-later
// Under The Moon's single verified build: EAX height + 11 caller-cleaned words; arg 7 is the full input.
#pragma once
#include <cstddef>
#include <cstdint>
#include <cstring>
namespace AdvhdDrawSig {
static const char Sha256[]="688b22b4619338fe6db648183e38582e17063e6706c7c11b132124f039ce1dda";
static const unsigned FileBytes=598016,EntryRva=0xf2a0,StackWords=11,TextArg=7;
static const unsigned char Entry[]={0x81,0xec,0xb8,0,0,0,0x53,0x55,0x8b,0xac,0x24,0xd4,0,0,0,0x56,0x8b,0xb4,0x24,0xdc,0,0,0,0x57,0x8b,0xf8,0x8b,0x84,0x24,0xd8,0,0,0,0x33,0xdb,0x03,0xc7};
inline int Find(const unsigned char *code,size_t size,size_t *out,int max){int hits=0;for(size_t i=0;i+sizeof Entry<=size;i++)if(!std::memcmp(code+i,Entry,sizeof Entry)){if(hits<max)out[hits]=i;hits++;}return hits;}
}
