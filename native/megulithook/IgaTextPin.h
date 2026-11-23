// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <windows.h>
#include <wincrypt.h>
#include <cstring>
#pragma comment(lib,"advapi32.lib")
namespace IgaTextPin {
struct Pin {const wchar_t *path;DWORD bytes;const char *sha256;};
static const Pin Pins[]={
 {L"",231936,"6fca9f7106f5fd57ac1471f403c72ca14d6de74150a5f310f5138e932f6f501a"},
 {L"plugin\\Script.dll",502784,"89ea50edd61314a06a2d0b8ffb1f66c8a3e2fe058ae10c4301bc11cde536a5d3"},
 {L"plugin\\Himorogi.dll",644608,"39b67c8a642ae929f03ed336fd41f64d1adada3c2c63b4c2c492bc08a96f6201"},
 {L"plugin\\D3D9Font.dll",77824,"c9dc803a39a44a430b97132d883b275822118f9d817da58fc53587052da45961"},
 {L"plugin\\D3D9Layer.dll",590336,"f54d2410b4cab0e06086b0793f09510f2d5c8037f983bdbea58b04ebd61bc226"},
 {L"plugin\\Sound.dll",303104,"18cca04f44c5b9cfc33c0b98008ab3f399c028ed484f4f5cfa7cdb73290236c5"},
 {L"plugin\\Movie.dll",146432,"7544511ba508661abf7c72d8e6bbbee889f8b5f0cbedcf9abc0fcfece7223134"},
 {L"script.iga",3655256,"04f28cc77cab51e754537167e8491fc16021eb89ff85677dbd2d28cc81fd5b92"},
 {L"system.iga",84524642,"3f77725d58279b6bbd68e0b65e7be1b9b7fd18c70a9b76fd57785858b4ab86dc"}
};
static bool Verify(const wchar_t *path,const Pin &pin){
 HANDLE file=CreateFileW(path,GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_FLAG_SEQUENTIAL_SCAN,nullptr);
 if(file==INVALID_HANDLE_VALUE)return false;
 LARGE_INTEGER size;HCRYPTPROV provider=0;HCRYPTHASH hash=0;
 bool ok=GetFileSizeEx(file,&size)&&size.QuadPart==pin.bytes;
 if(ok)ok=CryptAcquireContextW(&provider,nullptr,nullptr,PROV_RSA_AES,CRYPT_VERIFYCONTEXT)&&CryptCreateHash(provider,CALG_SHA_256,0,0,&hash);
 unsigned char bytes[65536],digest[32];DWORD got=0,total=0;
 while(ok){if(!ReadFile(file,bytes,sizeof bytes,&got,nullptr)){ok=false;break;}if(!got)break;
  if(got>pin.bytes-total){ok=false;break;}total+=got;ok=CryptHashData(hash,bytes,got,0)!=FALSE;}
 DWORD length=sizeof digest;
 if(ok)ok=total==pin.bytes&&CryptGetHashParam(hash,HP_HASHVAL,digest,&length,0)&&length==32;
 if(ok){const char hex[]="0123456789abcdef";char text[65];for(unsigned i=0;i<32;i++){text[2*i]=hex[digest[i]>>4];text[2*i+1]=hex[digest[i]&15];}text[64]=0;ok=std::strcmp(text,pin.sha256)==0;}
 if(hash)CryptDestroyHash(hash);if(provider)CryptReleaseContext(provider,0);CloseHandle(file);return ok;
}
}
