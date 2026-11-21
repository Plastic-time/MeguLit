// SPDX-License-Identifier: GPL-3.0-or-later
// Static byte reads end exactly at a non-readable page; no hooks or game code
#ifndef MAGES_SIG_HEADER
#define MAGES_SIG_HEADER "../MagesDrawSig.h"
#endif
#include MAGES_SIG_HEADER
#include "magesdraw-snippets.h"
#include <windows.h>
#include <cstdio>
#include <vector>
static int failures = 0;
static bool FindSafe(const unsigned char *b, size_t n, MagesDrawSig::Result *out) {
  __try { *out = MagesDrawSig::Find(b, n); return true; }
  __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
static bool PresentSafe(const unsigned char *b, size_t n) {
  __try { std::uint32_t w = 0; return MagesDrawSig::FindBackbuffer(b, n, w) == 0; }
  __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
static bool GlyphSafe(const unsigned char *b, size_t n) {
  __try { std::int64_t target = 0; return MagesDrawSig::GlyphTarget(b, 0, n, target) == 0; }
  __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
static void Check(bool ok, const char *name) { printf("%s %s\n", ok ? "PASS" : "FAIL", name); if (!ok) failures++; }
int main() {
  SYSTEM_INFO si{}; GetSystemInfo(&si);
  const size_t readable = si.dwPageSize * 4;
  auto memory = (unsigned char *)VirtualAlloc(nullptr, readable + si.dwPageSize, MEM_RESERVE | MEM_COMMIT, PAGE_READWRITE);
  if (!memory) return 2;
  DWORD old = 0;
  if (!VirtualProtect(memory + readable, si.dwPageSize, PAGE_NOACCESS, &old)) { VirtualFree(memory, 0, MEM_RELEASE); return 2; }
  std::vector<unsigned char> bytes;
  const auto &snippet = MagesSnippets[0];
  for (size_t i = 0; snippet.hex[i] && snippet.hex[i + 1]; i += 2) { unsigned v; sscanf(snippet.hex + i, "%2x", &v); bytes.push_back((unsigned char)v); }
  const size_t end = bytes.size(); bytes.resize(end + 0x61, 0x90);
  const unsigned char head[] = {0x55,0x8b,0xec,0x39,0x05,0,0,0,0,0x0f,0x86};
  const unsigned char operand[] = {0x0f,0xb7,0x14,0x45};
  memcpy(bytes.data() + end, head, sizeof head); memcpy(bytes.data() + end + 0x5d, operand, sizeof operand);
  if (bytes.size() > readable) { VirtualFree(memory, 0, MEM_RELEASE); return 2; }
  auto at = memory + readable - bytes.size(); memcpy(at, bytes.data(), bytes.size());
  MagesDrawSig::Result result;
  Check(FindSafe(at, bytes.size(), &result) && result.ok && result.commit == (size_t)snippet.commit,
        "truncated commit address preserves the complete earlier signature without an invalid read");
  unsigned char present[0x91]; memset(present,0x90,sizeof present);
  const unsigned char width[] = {0x0f,0xb7,0x05,0,0x10,0,0}, shr[] = {0xc1,0xe8,4}, lea[] = {0x8d,4,0xc0}, height[] = {0x0f,0xb7,0x05};
  memcpy(present,width,sizeof width);memcpy(present+0x3d,shr,sizeof shr);memcpy(present+0x6b,lea,sizeof lea);memcpy(present+0x8e,height,sizeof height);
  at=memory+readable-sizeof present;memcpy(at,present,sizeof present);
  Check(PresentSafe(at,sizeof present),"truncated height address ends at the non-readable page");
  const unsigned char glyph[] = {0xe8,0,0,0,0,0x83,0xc4};
  at=memory+readable-sizeof glyph;memcpy(at,glyph,sizeof glyph);
  Check(GlyphSafe(at,sizeof glyph),"incomplete stack cleanup ends at the non-readable page");
  VirtualFree(memory,0,MEM_RELEASE);
  return failures;
}
