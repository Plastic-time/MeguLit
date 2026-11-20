'use strict';
/* P0 2026-11-20 (千恋＊万花 1.4.20 ended with 0xC00000FD ~10 s in; witness: first-chance 0xC0000005 at MeguLitScn32 ReadPtr):
   a guessed pointer read under __try ate another thread's stack guard page. Every injected DLL that reads guessed pointers
   asks VirtualQuery first (shared/MeguLitSafeRead.h): committed, readable, no PAGE_GUARD / PAGE_NOACCESS. */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const N=p=>fs.readFileSync(path.join(__dirname,'..','native',p),'utf8');
test('guessed-pointer reads go through MeguLitSafe::ReadPtr',()=>{
 const h=N('shared/MeguLitSafeRead.h');
 assert.match(h,/VirtualQuery\(/);assert.match(h,/mbi\.State != MEM_COMMIT/);assert.match(h,/PAGE_GUARD \| PAGE_NOACCESS/);
 for(const f of ['scncapture/ScnCapture.cpp','krkrtext/KrkrText.cpp']){const s=N(f);
  assert.match(s,/#include "\.\.\/shared\/MeguLitSafeRead\.h"/,f);
  assert.match(s,/bool ReadPtr\(const void \*at, uintptr_t \*v\) \{ return MeguLitSafe::ReadPtr\(at, v\); \}/,f);
  assert.doesNotMatch(s,/bool ReadPtr\(const void \*at, uintptr_t \*v\) \{ __try/,f+': no blind __try read');}
});
