// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <windows.h>
#include <wincrypt.h>
#include <cwchar>
#include "MusicaBasicSig.h"
#pragma comment(lib,"advapi32.lib")

namespace MusicaBasicHook {
static uintptr_t VerifiedBase = 0;
static bool Readable(uintptr_t address,std::size_t bytes);
static bool EnvironmentEquals(const wchar_t *key,const wchar_t *value) {
  wchar_t text[128];DWORD n=GetEnvironmentVariableW(key,text,128);
  return n>0&&n<128&&!std::wcscmp(text,value);
}
static bool PrivateAsked() {
  return EnvironmentEquals(L"MEGULIT_OWNER_TESTS",L"1")
    &&EnvironmentEquals(L"MEGULIT_SIDE_BY_SIDE",L"1")
    &&EnvironmentEquals(L"MEGULIT_MUSICA_BASIC",MusicaBasicSig::ExeShaWide);
}
static bool SameStamp(const BY_HANDLE_FILE_INFORMATION &a,const BY_HANDLE_FILE_INFORMATION &b) {
  return a.dwVolumeSerialNumber==b.dwVolumeSerialNumber&&a.nFileIndexHigh==b.nFileIndexHigh&&a.nFileIndexLow==b.nFileIndexLow
    &&a.nFileSizeHigh==b.nFileSizeHigh&&a.nFileSizeLow==b.nFileSizeLow
    &&a.ftLastWriteTime.dwHighDateTime==b.ftLastWriteTime.dwHighDateTime&&a.ftLastWriteTime.dwLowDateTime==b.ftLastWriteTime.dwLowDateTime;
}
static bool VerifyFile(const wchar_t *file,std::size_t expected,const char *want,wchar_t *finalPath=nullptr) {
  HANDLE h=CreateFileW(file,GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);
  if(h==INVALID_HANDLE_VALUE)return false;
  BY_HANDLE_FILE_INFORMATION before{},after{};HCRYPTPROV provider=0;HCRYPTHASH hash=0;
  bool ok=GetFileInformationByHandle(h,&before)&&before.nFileSizeHigh==0&&before.nFileSizeLow==expected&&!(before.dwFileAttributes&FILE_ATTRIBUTE_DIRECTORY);
  if(ok&&finalPath) { DWORD n=GetFinalPathNameByHandleW(h,finalPath,2048,FILE_NAME_NORMALIZED|VOLUME_NAME_DOS);ok=n>0&&n<2048; }
  if(ok)ok=CryptAcquireContextW(&provider,nullptr,nullptr,PROV_RSA_AES,CRYPT_VERIFYCONTEXT)&&CryptCreateHash(provider,CALG_SHA_256,0,0,&hash);
  unsigned char bytes[16384],digest[32];DWORD got=0,total=0;
  while(ok) { DWORD request=static_cast<DWORD>(expected-total<sizeof bytes?expected-total+1:sizeof bytes);
    if(!ReadFile(h,bytes,request,&got,nullptr)){ok=false;break;}if(!got)break;
    if(got>expected-total){ok=false;break;}total+=got;if(!CryptHashData(hash,bytes,got,0)){ok=false;break;} }
  DWORD n=32;if(ok)ok=total==expected&&GetFileInformationByHandle(h,&after)&&SameStamp(before,after)&&CryptGetHashParam(hash,HP_HASHVAL,digest,&n,0)&&n==32;
  if(ok) { char hex[65];const char digits[]="0123456789abcdef";for(unsigned i=0;i<32;i++){hex[2*i]=digits[digest[i]>>4];hex[2*i+1]=digits[digest[i]&15];}hex[64]=0;ok=!std::strcmp(hex,want); }
  if(hash)CryptDestroyHash(hash);if(provider)CryptReleaseContext(provider,0);CloseHandle(h);return ok;
}
static bool SameCanonicalFile(const wchar_t *file,const wchar_t *actualFinal) {
  if(!file||!file[0]||file[1]!=L':'||(file[2]!=L'\\'&&file[2]!=L'/'))return false;
  HANDLE h=CreateFileW(file,FILE_READ_ATTRIBUTES,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);
  if(h==INVALID_HANDLE_VALUE)return false;
  wchar_t finalPath[2048];DWORD n=GetFinalPathNameByHandleW(h,finalPath,2048,FILE_NAME_NORMALIZED|VOLUME_NAME_DOS);CloseHandle(h);
  return n>0&&n<2048&&!_wcsicmp(finalPath,actualFinal);
}
static bool MemoryPinned(uintptr_t base) {
#ifndef _WIN64
  __try { if(!Readable(base,sizeof(IMAGE_DOS_HEADER)))return false;
    auto p=reinterpret_cast<const unsigned char *>(base);auto dos=reinterpret_cast<const IMAGE_DOS_HEADER *>(p);
    if(dos->e_magic!=IMAGE_DOS_SIGNATURE||dos->e_lfanew<0||dos->e_lfanew>0x1000)return false;
    if(base>UINT32_MAX-MusicaBasicSig::ImageBytes||!Readable(base+dos->e_lfanew,sizeof(IMAGE_NT_HEADERS32))
      ||!Readable(base+MusicaBasicSig::ExecuteRva,(sizeof MusicaBasicSig::ExecuteHex-1)/2)
      ||!Readable(base+MusicaBasicSig::ParseRva,(sizeof MusicaBasicSig::ParseHex-1)/2)
      ||!Readable(base+MusicaBasicSig::ConstructorStoreRva,6)||!Readable(base+MusicaBasicSig::VtableRva,12)
      ||!Readable(base+MusicaBasicSig::CommandRva,9))return false;
    auto pe=reinterpret_cast<const IMAGE_NT_HEADERS32 *>(p+dos->e_lfanew);
    return pe->Signature==IMAGE_NT_SIGNATURE&&pe->FileHeader.Machine==IMAGE_FILE_MACHINE_I386
      &&pe->FileHeader.TimeDateStamp==MusicaBasicSig::Timestamp&&pe->OptionalHeader.Magic==IMAGE_NT_OPTIONAL_HDR32_MAGIC
      &&pe->OptionalHeader.SizeOfImage==MusicaBasicSig::ImageBytes
      &&MusicaBasicSig::MatchesMapped(p,pe->OptionalHeader.SizeOfImage,base);
  } __except(EXCEPTION_EXECUTE_HANDLER) { return false; }
#else
  return false;
#endif
}
static bool VerifyCurrent() {
  VerifiedBase=0;if(!PrivateAsked())return false;
  wchar_t file[2048],expected[2048],finalPath[2048];DWORD n=GetModuleFileNameW(nullptr,file,2048),m=GetEnvironmentVariableW(L"MEGULIT_MUSICA_EXE",expected,2048);
  if(!n||n>=2048||!m||m>=2048)return false;
  if(!VerifyFile(file,MusicaBasicSig::FileBytes,MusicaBasicSig::ExeSha256,finalPath)||!SameCanonicalFile(expected,finalPath))return false;
  wchar_t *slash=std::wcsrchr(file,L'\\');if(!slash)return false;slash[1]=0;
  if(std::wcslen(file)+7>=2048)return false;std::wcscat(file,L"scr.dat");
  if(!VerifyFile(file,MusicaBasicSig::ScriptBytes,MusicaBasicSig::ScriptSha256))return false;
  uintptr_t base=reinterpret_cast<uintptr_t>(GetModuleHandleW(nullptr));if(!MemoryPinned(base))return false;VerifiedBase=base;return true;
}
// The old MSVC string has allocator+0, pointer+4, byte length+8, capacity+0xc
static bool Readable(uintptr_t address,std::size_t bytes) {
  if(!address||!bytes||address>UINTPTR_MAX-bytes)return false;
  uintptr_t end=address+bytes;
  while(address<end) { MEMORY_BASIC_INFORMATION info{};
    if(!VirtualQuery(reinterpret_cast<const void *>(address),&info,sizeof info)||info.State!=MEM_COMMIT
      ||(info.Protect&(PAGE_GUARD|PAGE_NOACCESS)))return false;
    DWORD access=info.Protect&0xff;
    if(access!=PAGE_READONLY&&access!=PAGE_READWRITE&&access!=PAGE_WRITECOPY
      &&access!=PAGE_EXECUTE_READ&&access!=PAGE_EXECUTE_READWRITE&&access!=PAGE_EXECUTE_WRITECOPY)return false;
    uintptr_t start=reinterpret_cast<uintptr_t>(info.BaseAddress);
    if(info.RegionSize>UINTPTR_MAX-start||start+info.RegionSize<=address)return false;
    address=start+info.RegionSize;
  }return true;
}
static unsigned Snapshot(uintptr_t object,uintptr_t base,char *out) {
#ifndef _WIN64
  __try {
    if(!base||!Readable(object,0x44)||*reinterpret_cast<const uintptr_t *>(object)!=base+MusicaBasicSig::VtableRva)return 0;
    auto field=reinterpret_cast<const std::uint32_t *>(object+0x34);
    std::uint32_t pointer=field[1],length=field[2],capacity=field[3];
    if(!pointer||!MusicaBasicSig::StringShape(length,capacity)||!Readable(pointer,length+1))return 0;
    auto text=reinterpret_cast<const char *>(pointer);
    for(unsigned i=0;i<length;i++){if(!text[i])return 0;out[i]=text[i];}if(text[length])return 0;out[length]=0;
    if(*reinterpret_cast<const uintptr_t *>(object)!=base+MusicaBasicSig::VtableRva
      ||field[1]!=pointer||field[2]!=length||field[3]!=capacity||std::memcmp(text,out,length+1))return 0;
    return length;
  } __except(EXCEPTION_EXECUTE_HANDLER) { return 0; }
#else
  return 0;
#endif
}
static void ReadBody(hook_context *context,HookParam *,TextBuffer *buffer,uintptr_t *) {
  buffer->size=0;
#ifndef _WIN64
  if(!PrivateAsked())return;
  char raw[MusicaBasicSig::MaxRawBytes+1],utf8[MusicaBasicSig::MaxWideUnits*3+1];wchar_t wide[MusicaBasicSig::MaxRawBytes+1];
  unsigned n=Snapshot(context->ecx,VerifiedBase,raw);if(!n)return;
  int units=MultiByteToWideChar(932,MB_ERR_INVALID_CHARS,raw,n,wide,MusicaBasicSig::MaxRawBytes);
  if(units<=0||units>MusicaBasicSig::MaxWideUnits)return;
  int bytes=WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,wide,units,utf8,sizeof utf8,nullptr,nullptr);
  if(bytes<=0||bytes>TEXT_BUFFER_SIZE)return;buffer->from(utf8,bytes);
#endif
}
static bool Attach() {
  if(!VerifiedBase||!PrivateAsked()||!MemoryPinned(VerifiedBase))return false;
  HookParam hp;hp.address=VerifiedBase+MusicaBasicSig::ExecuteRva;hp.type=USING_STRING|NO_CONTEXT|CODEC_UTF8;
  hp.text_fun=ReadBody;return NewHook(hp,"MusicaBasic");
}
}
class MusicaBasic : public ENGINE {
public:
  MusicaBasic() { is_engine_certain=false;check_by=CHECK_BY::CUSTOM;check_by_target=[](){return MusicaBasicHook::VerifyCurrent();}; }
  bool attach_function() override { return MusicaBasicHook::Attach(); }
};
