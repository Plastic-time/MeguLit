// SPDX-License-Identifier: GPL-3.0-or-later
// engine-draw signature, CatSystem2 (docs/engine-draw-native.md): the per-glyph composer's `mov eax,[rec+X]` where a glyph
// record's x (record x + glyph bearing [+ origin]) is worked out, with the record field offsets read off the code around it.
// Pure byte matching, no Windows calls, so the self-test (selftest/cs2draw.cpp) runs it on snippets of the known build.
// tools/engine-sigs/cs2-draw.cjs is the same matcher in JavaScript (the static signature test runs it on the owner's exes);
// both must agree.
//   origin: mov eax,[rec+X]; add eax,[esp+bx]; add eax,[esp+ox]; mov [esp+..],eax; mov eax,[rec+X+4]; add ...[esp+bx+4]; add ...[esp+ox+4]
//   direct: mov eax,[rec+X]; add eax,[esp+bx]; mov [esp+..],eax; mov eax,[rec+X+4]; add eax,[esp+bx+4]; mov [esp+..],eax
//   and before it (0x100): push [rec+S]; movzx eax,word [rec+C]; push eax; ... call [reg+4]   (the font's glyph method)
#pragma once
#include <cstdint>
#include <cstddef>
namespace CS2DrawSig {
enum Shape { Origin = 0, Direct = 1 };
struct Hit { size_t hook; int shape, rec, x, y, chr, size, colour, bx, ox; };

inline std::int32_t I32(const unsigned char *b) { return (std::int32_t)((std::uint32_t)b[0] | (std::uint32_t)b[1] << 8 | (std::uint32_t)b[2] << 16 | (std::uint32_t)b[3] << 24); }
// mod 01, reg eax, rm = record register (not esp): 0x40..0x47 without 0x44
inline bool RecModrm(unsigned char m) { return m >= 0x40 && m <= 0x47 && m != 0x44; }
// push [rec+S]; movzx eax,word [rec+C]; push eax; then call [reg+4] within 12 bytes; returns its offset or -1
inline long GlyphCall(const unsigned char *b, size_t at, int r, int &size, int &chr) {
  for (long i = (long)at - 6; i >= 0 && i >= (long)at - 0x100; i--) {
    if (b[i] != 0xff || b[i + 1] != (0x70 | r) || b[i + 3] != 0x0f || b[i + 4] != 0xb7 || b[i + 5] != (0x40 | r) || b[i + 7] != 0x50) continue;
    for (long j = i + 8; j < i + 20 && (size_t)(j + 2) < at; j++)
      if (b[j] == 0xff && (b[j + 1] & 0xf8) == 0x50 && (b[j + 1] & 7) != 4 && b[j + 2] == 0x04) { size = b[i + 2]; chr = b[i + 6]; return i; }
  }
  return -1;
}
// the fill colour: three movzx byte [rec+K+2], [rec+K+1], [rec+K], each within 8 bytes of the last; the first triple in the
// 0x80 bytes before the glyph call
inline int Colour(const unsigned char *b, long from, int r) {
  auto m = [&](long k) { return b[k] == 0x0f && b[k + 1] == 0xb6 && (b[k + 2] & 0xc7) == (0x40 | r); };
  auto next = [&](long k, int want) { for (long j = k + 4; j <= k + 12; j++) if (m(j) && b[j + 3] == want) return j; return -1L; };
  for (long i = from > 0x80 ? from - 0x80 : 0; i < from; i++) {
    if (!m(i)) continue; int k = (int)b[i + 3] - 2; if (k < 0) continue;
    long j = next(i, k + 1); if (j < 0) continue; if (next(j, k) >= 0) return k;
  }
  return -1;
}
// a branch (rel8 / rel32 shapes, byte scan 0x800 around) landing inside the 7 bytes the hook replaces: never hook there
inline bool LandsInside(const unsigned char *b, size_t n, size_t at) {
  size_t from = at > 0x800 ? at - 0x800 : 0, to = at + 0x800 < n - 6 ? at + 0x800 : n - 6;
  for (size_t i = from; i < to; i++) {
    long long t; unsigned char c = b[i];
    if (c == 0xeb || (c >= 0x70 && c <= 0x7f)) t = (long long)i + 2 + (signed char)b[i + 1];
    else if (c == 0xe9) t = (long long)i + 5 + I32(b + i + 1);
    else if (c == 0x0f && b[i + 1] >= 0x80 && b[i + 1] <= 0x8f) t = (long long)i + 6 + I32(b + i + 2);
    else continue;
    if (t > (long long)at && t < (long long)at + 7 && !(i >= at && i < at + 7)) return true;
  }
  return false;
}
// all hits in b[0..n) (n counts only bytes that may be read; the matcher reads up to 40 bytes past a position),
// ordered by position; returns their count, the first `cap` in out
inline int Find(const unsigned char *b, size_t n, Hit *out, int cap) {
  int count = 0;
  for (size_t i = 0; i + 40 < n; i++) {
    if (b[i] != 0x8b || !RecModrm(b[i + 1]) || b[i + 3] != 0x03 || b[i + 4] != 0x44 || b[i + 5] != 0x24) continue;
    int r = b[i + 1] & 7, x = b[i + 2], bx = b[i + 6], shape, ox = -1; size_t k;
    if (b[i + 7] == 0x03 && b[i + 8] == 0x84 && b[i + 9] == 0x24 && b[i + 14] == 0x89 && b[i + 15] == 0x44 && b[i + 16] == 0x24) {
      shape = Origin; ox = I32(b + i + 10); k = i + 18;
      if (b[k] != 0x8b || b[k + 1] != b[i + 1] || b[k + 2] != x + 4 || b[k + 3] != 0x03 || b[k + 4] != 0x44 || b[k + 5] != 0x24 || b[k + 6] != bx + 4) continue;
      if (b[k + 7] != 0x03 || b[k + 8] != 0x84 || b[k + 9] != 0x24 || I32(b + k + 10) != ox + 4) continue;
    } else if (b[i + 7] == 0x89 && b[i + 8] == 0x44 && b[i + 9] == 0x24) {
      shape = Direct; k = i + 11;
      if (b[k] != 0x8b || b[k + 1] != b[i + 1] || b[k + 2] != x + 4 || b[k + 3] != 0x03 || b[k + 4] != 0x44 || b[k + 5] != 0x24 || b[k + 6] != bx + 4) continue;
      if (b[k + 7] != 0x89 || b[k + 8] != 0x44 || b[k + 9] != 0x24) continue;
    } else continue;
    int size = 0, chr = 0; long g = GlyphCall(b, i, r, size, chr);
    if (g < 0 || LandsInside(b, n, i)) continue;
    if (count < cap) { Hit h; h.hook = i; h.shape = shape; h.rec = r; h.x = x; h.y = x + 4; h.chr = chr; h.size = size; h.colour = Colour(b, g, r); h.bx = bx; h.ox = ox; out[count] = h; }
    count++;
  }
  return count;
}
}
