// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <cstddef>
#include <cstdint>
#include <cstring>

// Exact message-command execute method, not the GetGlyphOutline cache helper
namespace MusicaBasicSig {
static const std::size_t FileBytes = 1126400, ScriptBytes = 6134556, ImageBytes = 1150976;
static const std::uint32_t Timestamp = 1255905404;
static const std::uint32_t ExecuteRva = 0x6749b, ConstructorStoreRva = 0x67396;
static const std::uint32_t ParseRva = 0x67423, VtableRva = 0xa22d0, CommandRva = 0xb3038;
static const char ExeSha256[] = "05f51cfe00436c91c6a0102fb79d8e9d751b6ec88795b164b4640d953842f050";
static const char ScriptSha256[] = "638c5c40d0856105f21a8ac50cca3b6159e831a2361699db108eacfe28f8ee78";
static const wchar_t ExeShaWide[] = L"05f51cfe00436c91c6a0102fb79d8e9d751b6ec88795b164b4640d953842f050";
static const char ExecuteHex[] = "558bec51568bf18b461cff76208b88d8110000e80b4cfeff8845fc8d4634ff75fc8b4e1c508d4624508d464450ff7620e87655fbffb0015ec9c3";
static const char ParseHex[] = "568b742408578bf98b4e0485c974648b46082bc1c1f80483f80475576a0051e89348fbff598947208b4604596aff83c0206a00508d4f24e8c8b1f9ff8b46046aff83c0306a00508d4f34e8b5b1f9ff8b460485c0741d8b76082bf0c1fe0483fe0176106aff83c0106a00508d4f44e891b1f9ff5f5ec20400";
static const std::size_t MaxRawBytes = 8000, MaxWideUnits = 4000;
inline std::uint32_t U32(const unsigned char *p) { std::uint32_t n; std::memcpy(&n,p,4); return n; }
inline int Digit(char c) { return c>='0'&&c<='9'?c-'0':c>='a'&&c<='f'?c-'a'+10:-1; }
inline bool HexAt(const unsigned char *p,const char *hex) {
  for(std::size_t i=0;hex[i];i+=2) { int a=Digit(hex[i]),b=Digit(hex[i+1]);if(a<0||b<0||p[i/2]!=(a*16+b))return false; }
  return true;
}
inline bool MatchesMapped(const unsigned char *p,std::size_t size,std::uintptr_t base) {
  if(!p||size<ImageBytes||base>UINT32_MAX-ImageBytes)return false;
  return HexAt(p+ExecuteRva,ExecuteHex)&&HexAt(p+ParseRva,ParseHex)
    &&p[ConstructorStoreRva]==0xc7&&p[ConstructorStoreRva+1]==0x06
    &&U32(p+ConstructorStoreRva+2)==base+VtableRva
    &&U32(p+VtableRva+4)==base+ParseRva&&U32(p+VtableRva+8)==base+ExecuteRva
    &&!std::memcmp(p+CommandRva,".message",9);
}
inline bool StringShape(std::uint32_t length,std::uint32_t capacity) {
  return length>0&&length<=MaxRawBytes&&capacity>=length&&capacity<=16*1024*1024;
}
}
