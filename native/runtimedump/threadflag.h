// SPDX-License-Identifier: GPL-3.0-or-later
// Per-thread "inside a hook" flag that never allocates (2026-11-20 crash fix).
// TlsGetValue/TlsSetValue were used before. Past index 63 the first TlsSetValue on a thread allocates that thread's TLS
// expansion slots with RtlAllocateHeap, which the probe hooks: HAlloc -> Guard -> TlsSetValue -> RtlAllocateHeap ->
// HAlloc -> Inside() still false -> Guard -> ... until the game thread's stack ran out (0xC00000FD in CHAOS;CHILD,
// whose process had used up the 64 inline TLS slots). This table keys on the thread id, only does interlocked writes to
// a static array and calls GetCurrentThreadId (a TEB read), so nothing in it can re-enter a hooked API.
// A full probe window (more busy threads than the table holds near one hash) reads as "inside": the hook then skips its
// work instead of risking recursion.
#pragma once
#include <windows.h>

struct ThreadFlags {
 enum { N = 1024, Probe = 64 };
 volatile LONG slot[N];
 static unsigned Hash(DWORD t) { return (t >> 2) * 2654435761u; }
 // Is the flag up on this thread (or is there no room to tell)?
 bool On() const {
  DWORD t = GetCurrentThreadId(); unsigned h = Hash(t); bool room = false;
  for (unsigned i = 0; i < Probe; i++) { LONG v = slot[(h + i) % N]; if (v == (LONG)t) return true; if (!v) room = true; }
  return !room;
 }
 // Raises the flag; returns true when it was already up (or could not be raised), so the matching Lower is skipped.
 bool Raise() {
  DWORD t = GetCurrentThreadId(); unsigned h = Hash(t);
  for (unsigned i = 0; i < Probe; i++) if (slot[(h + i) % N] == (LONG)t) return true;
  for (unsigned i = 0; i < Probe; i++) if (InterlockedCompareExchange(&slot[(h + i) % N], (LONG)t, 0) == 0) return false;
  return true;
 }
 void Lower(bool was) {
  if (was) return;
  DWORD t = GetCurrentThreadId(); unsigned h = Hash(t);
  for (unsigned i = 0; i < Probe; i++) if (slot[(h + i) % N] == (LONG)t) { InterlockedExchange(&slot[(h + i) % N], 0); return; }
 }
};
