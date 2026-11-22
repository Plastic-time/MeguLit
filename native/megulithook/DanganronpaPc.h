// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#ifndef _WIN64
#include <windows.h>
#include <wincrypt.h>
#include <cstdio>
#include <string>
#include "DanganronpaPcSig.h"
#pragma comment(lib,"advapi32.lib")
namespace DanganronpaPc {
constexpr int MaxUnits=4000;
static std::uintptr_t Base=0;
struct Snapshot {unsigned pc,textId;unsigned char speaker;int units;wchar_t text[MaxUnits+1];};
inline bool EnabledLine(const std::string &line){
 if(line.rfind("#cfg ",0)!=0)return false;bool yes=false;std::size_t pos=5;
 while(pos<line.size()){std::size_t end=line.find(' ',pos);if(end==std::string::npos)end=line.size();const auto token=line.substr(pos,end-pos);
  if(token.rfind("spikechunsoftInput=",0)==0){if(token!="spikechunsoftInput=1"||yes)return false;yes=true;}pos=end+1;}
 return yes;
}
inline bool Asked(){
 wchar_t tmp[MAX_PATH],file[MAX_PATH+64];const DWORD n=GetTempPathW(MAX_PATH,tmp);if(!n||n>=MAX_PATH)return false;
 swprintf_s(file,L"%sMeguLit\\draw\\%lu.txt",tmp,GetCurrentProcessId());
 HANDLE h=CreateFileW(file,GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,0,nullptr);if(h==INVALID_HANDLE_VALUE)return false;
 unsigned char bytes[2048];DWORD got=0;const bool ok=ReadFile(h,bytes,sizeof bytes,&got,nullptr)!=FALSE;CloseHandle(h);if(!ok||got<2||bytes[0]!=0xff||bytes[1]!=0xfe||(got&1))return false;
 std::string first;bool ended=false;for(DWORD i=2;i<got;i+=2){if(bytes[i+1])return false;const unsigned c=bytes[i];if(c=='\r'||c=='\n'){ended=true;break;}if(c<32||c>126)return false;first+=(char)c;}
 return ended&&EnabledLine(first);
}
inline bool HashFile(const wchar_t *file,unsigned long long expected,const char *sha){
 HANDLE h=CreateFileW(file,GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,0,nullptr);if(h==INVALID_HANDLE_VALUE)return false;
 LARGE_INTEGER size;bool ok=GetFileSizeEx(h,&size)&&size.QuadPart==expected;HCRYPTPROV provider=0;HCRYPTHASH hash=0;
 if(ok)ok=CryptAcquireContextW(&provider,nullptr,nullptr,PROV_RSA_AES,CRYPT_VERIFYCONTEXT)&&CryptCreateHash(provider,CALG_SHA_256,0,0,&hash);
 unsigned char buffer[65536],digest[32];DWORD got=0;unsigned long long total=0;
 while(ok){if(!ReadFile(h,buffer,sizeof buffer,&got,nullptr)){ok=false;break;}if(!got)break;total+=got;if(total>expected||!CryptHashData(hash,buffer,got,0)){ok=false;break;}}
 DWORD count=sizeof digest;if(ok)ok=total==expected&&CryptGetHashParam(hash,HP_HASHVAL,digest,&count,0)&&count==sizeof digest;
 if(ok){char hex[65];constexpr char digits[]="0123456789abcdef";for(int i=0;i<32;i++){hex[i*2]=digits[digest[i]>>4];hex[i*2+1]=digits[digest[i]&15];}hex[64]=0;ok=std::strcmp(hex,sha)==0;}
 if(hash)CryptDestroyHash(hash);if(provider)CryptReleaseContext(provider,0);CloseHandle(h);return ok;
}
inline bool ExactFiles(){
 wchar_t file[32768];const DWORD n=GetModuleFileNameW(nullptr,file,32768);if(!n||n>=32768)return false;
 wchar_t *slash=wcsrchr(file,L'\\');if(!slash||_wcsicmp(slash+1,L"DR1_us.exe"))return false;
 if(!HashFile(file,DanganronpaPcSig::ExeBytes,DanganronpaPcSig::ExeSha))return false;slash[1]=0;const std::wstring dir=file;
 return HashFile((dir+L"dr1_data_jp.wad").c_str(),1283334650ULL,"338d0c440b9f576070d4fbd33390c837475a18062ea0ac536684c851126d3b03")
  &&HashFile((dir+L"dr1_data_keyboard_jp.wad").c_str(),90245979ULL,"db3d0394e821a885e6a73bc71d156674503b5017e7021286bf071b0cf6942c99")
  &&HashFile((dir+L"drlanguage.txt").c_str(),8,"be4ee906d3efecfc34a94a6cd378633a67f7f35d5abbc3f498715ac5dcbee54f");
}
inline bool ImageMatches(std::uintptr_t image){
 __try{const auto dos=(IMAGE_DOS_HEADER *)image;if(dos->e_magic!=IMAGE_DOS_SIGNATURE||dos->e_lfanew<64||dos->e_lfanew>4096)return false;
  const auto nt=(IMAGE_NT_HEADERS *)(image+dos->e_lfanew);if(nt->Signature!=IMAGE_NT_SIGNATURE||nt->FileHeader.Machine!=IMAGE_FILE_MACHINE_I386||nt->OptionalHeader.Magic!=IMAGE_NT_OPTIONAL_HDR32_MAGIC||nt->OptionalHeader.SizeOfImage>64*1024*1024)return false;
  return DanganronpaPcSig::VerifyImage((const unsigned char *)image,nt->OptionalHeader.SizeOfImage,image);
 }__except(EXCEPTION_EXECUTE_HANDLER){return false;}
}
inline bool Capture(const std::uintptr_t *stack,Snapshot *out){
 __try{using namespace DanganronpaPcSig;if(!Base||!stack||!out||stack[0]!=Base+Return)return false;
  const auto state=*(const unsigned char **)(Base+State);const unsigned pc=*(const unsigned *)(Base+Pc);if(!state||pc<4||pc>8*1024*1024)return false;
  const auto script=*(const unsigned char **)(state+ScriptOffset);if(!script||script[pc-4]!=0x70||script[pc-3]!=2)return false;
  const unsigned id=script[pc-2]*256+script[pc-1];if(*(const std::uintptr_t *)(state+TextArrayOffset+id*4)!=stack[1])return false;
  const wchar_t *source=(const wchar_t *)stack[1];if(!source)return false;int count=0;while(count<MaxUnits&&source[count]){out->text[count]=source[count];count++;}
  if(count==MaxUnits&&source[count])return false;out->text[count]=0;out->units=count;out->pc=pc;out->textId=id;out->speaker=*(const unsigned char *)(Base+Speaker);return true;
 }__except(EXCEPTION_EXECUTE_HANDLER){return false;}
}
inline bool Clean(const Snapshot &raw,std::wstring &out){
 out.clear();for(int i=0;i<raw.units;i++){const wchar_t c=raw.text[i];if(i==0&&c==0xfeff)continue;
  if(c==L'<'&&i+4<raw.units&&raw.text[i+1]==L'C'&&raw.text[i+2]==L'L'&&raw.text[i+3]==L'T'){
   int end=i+4;if(raw.text[end]==L' '){end++;const int start=end;while(end<raw.units&&raw.text[end]>=L'0'&&raw.text[end]<=L'9'&&end-start<3)end++;if(end==start)return false;}
   if(end>=raw.units||raw.text[end]!=L'>')return false;i=end;continue;}
  if(c==L'\r'){if(i+1<raw.units&&raw.text[i+1]==L'\n')i++;out+=L'\n';continue;}
  if(c<32&&c!=L'\n'||c==127||c>=0xdc00&&c<=0xdfff)return false;
  if(c>=0xd800&&c<=0xdbff){if(i+1>=raw.units||raw.text[i+1]<0xdc00||raw.text[i+1]>0xdfff)return false;out+=c;out+=raw.text[++i];continue;}out+=c;
 }return !out.empty();
}
inline void Text(hook_context *context,HookParam *,TextBuffer *buffer,std::uintptr_t *){
 if(!buffer)return;buffer->clear();if(!Asked()||!context)return;Snapshot raw={};if(!Capture(context->stack,&raw))return;std::wstring text;if(!Clean(raw,text)||!Asked())return;buffer->from(text);
}
inline bool Match(){if(!Asked()||!ExactFiles())return false;const auto image=(std::uintptr_t)GetModuleHandleW(nullptr);if(!ImageMatches(image)||!Asked())return false;Base=image;return true;}
inline bool Install(){if(!Base||!Asked()||!ImageMatches(Base))return false;HookParam hp;hp.address=Base+DanganronpaPcSig::Entry;hp.type=USING_STRING|CODEC_UTF16|NO_CONTEXT|FULL_STRING;hp.text_fun=Text;return NewHook(hp,"DanganronpaPcText");}
}
#endif
