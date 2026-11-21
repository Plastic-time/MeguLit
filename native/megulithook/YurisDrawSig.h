// SPDX-License-Identifier: GPL-3.0-or-later
// engine-draw signature, YU-RIS (docs/engine-draw-native.md): the dialogue glyph loop's call into the glyph blitter, and
// the caller's stack slots that hold the glyph's canvas x / y. Pure byte matching, no Windows calls, so the self-test
// (selftest/yurisdraw.cpp) runs it on snippets of the four known builds. tools/engine-sigs/yuris-draw.cjs is the same
// matcher in JavaScript (the static signature test runs it on the owner's exes); both must agree.
//   call <blitter>; add <acc>, eax; movzx r, byte [..]; movzx eax, byte [r + table]; inc eax; movsx edx, al; add ...
#pragma once
#include <cstdint>
#include <cstddef>
namespace YurisDrawSig {
struct Hit { size_t call; std::int32_t rel; int x, y; int accReg, accSlot; std::uint32_t table; };

// the last `mov [esp+d8], reg` before the call whose reg holds the accumulator (or was loaded from its slot)
inline int XSlot(const unsigned char *b, size_t at, int accReg, int accSlot) {
  size_t from = at > 0x90 ? at - 0x90 : 0; int x = -1, loaded = -1;
  for (size_t i = from; i + 4 <= at; i++) {
    unsigned op = b[i], modrm = b[i + 1], d8 = b[i + 3], reg = (modrm >> 3) & 7;
    bool espD8 = b[i + 2] == 0x24 && (modrm & 0xc7) == 0x44;
    if (op == 0x8b && (int)reg == loaded && !(espD8 && (int)d8 == accSlot)) { loaded = -1; continue; }
    if (!espD8) continue;
    if (op == 0x8b && accSlot >= 0 && (int)d8 == accSlot) loaded = (int)reg;
    if (op == 0x89 && ((int)reg == accReg || (int)reg == loaded) && (int)d8 != accSlot) x = (int)d8;
  }
  return x;
}
inline bool Stored(const unsigned char *b, size_t at, int slot) {
  size_t from = at > 0x90 ? at - 0x90 : 0;
  for (size_t i = from; i + 4 <= at; i++) if (b[i] == 0x89 && (b[i + 1] & 0xc7) == 0x44 && b[i + 2] == 0x24 && (int)b[i + 3] == slot) return true;
  return false;
}
// all hits in b[0..n); returns their count, the first `cap` in out
inline int Find(const unsigned char *b, size_t n, Hit *out, int cap) {
  int count = 0;
  for (size_t i = 0; i + 32 < n; i++) {
    if (b[i] != 0xe8) continue;
    size_t j = i + 5, k; int accReg = -1, accSlot = -1;
    if (b[j] == 0x03 && b[j + 1] >= 0xc0) { accReg = (b[j + 1] >> 3) & 7; k = j + 2; }
    else if (b[j] == 0x01 && b[j + 1] == 0x44 && b[j + 2] == 0x24) { accSlot = b[j + 3]; k = j + 4; }
    else continue;
    if (b[k] != 0x0f || b[k + 1] != 0xb6) continue;
    size_t m = 0; bool ok = false;
    for (size_t skip = 2; skip <= 3 && !ok; skip++) {
      m = k + 2 + skip;
      ok = b[m] == 0x0f && b[m + 1] == 0xb6 && (b[m + 2] & 0xc0) == 0x80 && b[m + 7] == 0x40 && b[m + 8] == 0x0f && b[m + 9] == 0xbe && b[m + 10] == 0xd0 && b[m + 11] == 0x03;
    }
    if (!ok) continue;
    int x = XSlot(b, i, accReg, accSlot);
    if (x < 0 || !Stored(b, i, x + 4)) continue;
    if (count < cap) {
      Hit h; h.call = i; h.rel = (std::int32_t)((std::uint32_t)b[i + 1] | (std::uint32_t)b[i + 2] << 8 | (std::uint32_t)b[i + 3] << 16 | (std::uint32_t)b[i + 4] << 24);
      h.x = x; h.y = x + 4; h.accReg = accReg; h.accSlot = accSlot;
      h.table = (std::uint32_t)b[m + 3] | (std::uint32_t)b[m + 4] << 8 | (std::uint32_t)b[m + 5] << 16 | (std::uint32_t)b[m + 6] << 24;
      out[count] = h;
    }
    count++;
  }
  return count;
}
// SJIS: a lead byte takes the next byte with it
inline int CharBytes(unsigned char c) { return (c >= 0x81 && c <= 0x9f) || (c >= 0xe0 && c <= 0xfc) ? 2 : 1; }
}
