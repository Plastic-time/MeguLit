// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <cstddef>
#include <cstdint>
#include <cstring>
/* Facts measured from the owner's exact DR1 PC executable, not an emulator hook. */
namespace DanganronpaPcSig {
constexpr char ExeSha[]="9debd9f6aed2339e540aa9526ea3f16f38ad91c19ad9a842a5b0b2fab21303e3";
constexpr unsigned ExeBytes=3459728,Entry=0x50c00,Return=0x48d3d,Dispatch=0x4e169,Table=0x2953a8;
constexpr unsigned State=0x33c6b0,Pc=0x2e4678,Speaker=0x2fd2ae,ScriptOffset=0x38,TextArrayOffset=0x40;
constexpr unsigned char Prefix[]={0x55,0x8b,0xec,0x83,0xec,0x1c,0x53,0x56,0x57,0x6a,0x00,0xff,0x75,0x08,0xe8,0x1d,0x88,0x06,0x00,0x8b,0xc8,0xe8,0xe6,0x7d,0x06,0x00};
constexpr unsigned char Dispatcher[]={0x8d,0x81,0x00,0x90,0xff,0xff,0x66,0x83,0xf8,0x3c,0x77,0x23,0x0f,0xb7,0xc0,0x8b,0x14,0x85,0xa8,0x53,0x69,0x00,0x85,0xd2,0x74,0x10,0x51,0xff,0xd2,0x83,0xc4,0x04};
inline bool Range(std::size_t size,unsigned at,std::size_t n){return at<=size&&n<=size-at;}
inline bool VerifyImage(const unsigned char *image,std::size_t size,std::uintptr_t base){
 if(!image||!Range(size,Entry,sizeof Prefix)||!Range(size,Dispatch,sizeof Dispatcher)||!Range(size,Table,0x2c*4)||!Range(size,Return-5,5)||!Range(size,State,4)||!Range(size,Pc,4)||!Range(size,Speaker,1))return false;
 if(std::memcmp(image+Entry,Prefix,sizeof Prefix)||std::memcmp(image+Dispatch,Dispatcher,18)||std::memcmp(image+Dispatch+22,Dispatcher+22,sizeof Dispatcher-22)||image[Return-5]!=0xe8)return false;
 std::uint32_t operand=0;std::memcpy(&operand,image+Dispatch+18,4);if(operand!=base+Table)return false;
 std::int32_t relative=0;std::memcpy(&relative,image+Return-4,4);if(std::uint32_t(Return+relative)!=Entry)return false;
 const unsigned op[]={2,5,0x21,0x2b},target[]={0x48ca0,0x48dd0,0x49d40,0x49e10};
 for(unsigned i=0;i<4;i++){std::uint32_t actual=0;std::memcpy(&actual,image+Table+op[i]*4,4);if(actual!=base+target[i])return false;}
 return true;
}
}
