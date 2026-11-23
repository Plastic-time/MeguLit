#pragma once
// MeguLit 2026-11-20 (P0, 千恋＊万花 1.4.20: the game ended with 0xC00000FD about 10 s in; crash witness: first-chance
// 0xC0000005 at MeguLitScn32 ReadPtr). Reading an arbitrary value as a pointer under __try is not harmless: when the value
// points into another thread's stack guard page, the read raises STATUS_GUARD_PAGE_VIOLATION, the handler swallows it, the
// guard page is gone, and that thread dies with a stack overflow the next time its stack grows. A probed read first asks
// VirtualQuery: only committed, readable pages without PAGE_GUARD / PAGE_NOACCESS are read; __try stays for the races.
#include <windows.h>
#include <stdint.h>

namespace MeguLitSafe
{
  inline bool Readable(const void *at, size_t n)
  {
    uintptr_t p = (uintptr_t)at, end = p + n;
    if (p < 0x10000 || end < p)
      return false;
    while (p < end)
    {
      MEMORY_BASIC_INFORMATION mbi;
      if (!VirtualQuery((const void *)p, &mbi, sizeof mbi) || mbi.State != MEM_COMMIT)
        return false;
      DWORD pr = mbi.Protect;
      if (pr & (PAGE_GUARD | PAGE_NOACCESS))
        return false;
      if (!(pr & (PAGE_READONLY | PAGE_READWRITE | PAGE_WRITECOPY | PAGE_EXECUTE_READ | PAGE_EXECUTE_READWRITE | PAGE_EXECUTE_WRITECOPY)))
        return false;
      uintptr_t next = (uintptr_t)mbi.BaseAddress + mbi.RegionSize;
      if (next <= p)
        return false;
      p = next;
    }
    return true;
  }
  inline bool ReadPtr(const void *at, uintptr_t *v)
  {
    if (!Readable(at, sizeof(uintptr_t)))
      return false;
    __try
    {
      *v = *(const uintptr_t *)at;
      return true;
    }
    __except (EXCEPTION_EXECUTE_HANDLER)
    {
      return false;
    }
  }
}
