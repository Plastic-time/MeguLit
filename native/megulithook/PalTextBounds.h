// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <cstddef>
#include <cstring>
#include <cstdint>

namespace PalTextBounds {
static const size_t MaxBytes=32768;
struct Slice {size_t prefix,body,suffix,total;};

inline bool Split(const char *text,size_t size,Slice *out) {
 if(!text||!out||!size||size>MaxBytes)return false;
 size_t prefix=0,end=size;
 if(size>=2&&text[0]=='<'&&text[1]=='c') {
  const char *close=(const char *)std::memchr(text+2,'>',size-2);
  if(close)prefix=(size_t)(close-text)+1;
 }
 if(size-prefix>=4&&!std::memcmp(text+size-4,"</c>",4))end-=4;
 if(end<=prefix)return false;
 *out={prefix,end-prefix,size-end,size};
 return true;
}

/* The destination capacity is the original NUL-terminated span, never an assumed engine allocation size */
inline bool Replace(char *text,size_t capacity,const Slice &slice,const char *replacement,size_t bytes) {
 if(!text||!replacement||!capacity||capacity>MaxBytes+1||slice.total!=capacity-1||
    slice.prefix>slice.total||slice.body>slice.total-slice.prefix||
    slice.suffix!=slice.total-slice.prefix-slice.body||bytes>slice.body||
    std::memchr(replacement,0,bytes))return false;
 const uintptr_t dst=(uintptr_t)text,src=(uintptr_t)replacement;
 if(bytes&&((src>=dst&&src-dst<capacity)||(dst>=src&&dst-src<bytes)))return false;
 Slice current;
 if(text[slice.total]!=0||!Split(text,slice.total,&current)||
    current.prefix!=slice.prefix||current.body!=slice.body||current.suffix!=slice.suffix)return false;
 /* Copy the suffix first because a shorter result shifts it into the former body */
 std::memmove(text+slice.prefix+bytes,text+slice.prefix+slice.body,slice.suffix);
 std::memcpy(text+slice.prefix,replacement,bytes);
 text[slice.prefix+bytes+slice.suffix]=0;
 return true;
}

struct Snapshot {const char *source;size_t size;Slice slice;bool valid;char bytes[MaxBytes+1];};
/* The caller isolates invalid game memory with SEH; no unbounded length scan or retained game pointer read follows */
inline bool Capture(const char *text,Snapshot *out) {
 if(!out)return false;
 out->valid=false;
 if(!text)return false;
 for(size_t n=0;n<=MaxBytes;++n) {
  char c=text[n];out->bytes[n]=c;
  if(!c) {
   if(!Split(out->bytes,n,&out->slice))return false;
   out->source=text;out->size=n;out->valid=true;return true;
  }
 }
 return false;
}

inline bool Apply(Snapshot *snapshot,char *text,const char *replacement,size_t bytes) {
 if(!snapshot||!snapshot->valid)return false;
 snapshot->valid=false;
 if(!text||snapshot->size>MaxBytes||text!=snapshot->source||std::memcmp(text,snapshot->bytes,snapshot->size+1))return false;
 return Replace(text,snapshot->size+1,snapshot->slice,replacement,bytes);
}
}
