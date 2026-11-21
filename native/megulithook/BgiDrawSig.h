// SPDX-License-Identifier: GPL-3.0-or-later
// engine-draw signature, BGI / Ethornell (docs/engine-draw-native.md): the place where the text layout links one glyph node
// (canvas x at +0x10, y at +0x14) into the glyph chain, the layout's stack slots of the character code / previous node and
// its colour argument, and the function that frees the chain after it was drawn into the sprite. Pure byte matching, no
// Windows calls, so the self-test (selftest/bgidraw.cpp) runs it on snippets of the known builds.
// tools/engine-sigs/bgi-draw.cjs is the same matcher in JavaScript (the static signature test runs it on the owner's exes);
// both must agree.
#pragma once
#include <cstdint>
#include <cstddef>
namespace BgiDrawSig {
struct Link { size_t call; std::int32_t rel; int node, ch, prev, color; };
static const size_t LayoutScan = 0x1400;

inline bool MovStore(const unsigned char *b, size_t i, int base, int disp) {
  return b[i] == 0x89 && (b[i + 1] >> 6) == 1 && (b[i + 1] & 7) == base && b[i + 2] == disp;
}
// one glyph link site ending at the call at `at` (b[at] == 0xe8); n = bytes available
inline bool LinkSite(const unsigned char *b, size_t n, size_t at, Link &out) {
  if (at < 8 || at + 5 + 0x30 > n || b[at] != 0xe8) return false;
  if (!(b[at - 3] == 0x89 && (b[at - 2] >> 6) == 1 && b[at - 1] == 0x1c)) return false;
  int node = b[at - 2] & 7; if (node == 4 || node == 5) return false;
  if (!MovStore(b, at - 6, node, 0x18)) return false;
  size_t from = at > 0x30 ? at - 0x30 : 0; long x = -1, y = -1;
  for (size_t i = from; i < at - 6; i++) {
    if (MovStore(b, i, node, 0x10) && x < 0) x = (long)i;
    if (MovStore(b, i, node, 0x14) && x >= 0 && (long)i > x) y = (long)i;
  }
  if (x < 0 || y < 0) return false;
  int pushes = 0;
  for (size_t i = (size_t)y + 3; i < at - 6; i++) if (b[i] >= 0x50 && b[i] <= 0x57 && b[i - 1] != 0x0f) pushes++;
  if (pushes != 1) return false;
  int prev = -1;
  for (size_t i = at + 5; i < at + 5 + 0x30; i++) {
    if (b[i] == 0x89 && ((b[i + 1] >> 3) & 7) == node && (b[i + 1] >> 6) == 1 && b[i + 2] == 0x44) {
      int r = b[i + 1] & 7;
      for (size_t j = at + 5; j < i; j++) {
        if (b[j] == 0x8b && ((b[j + 1] >> 3) & 7) == r && (b[j + 1] & 0xc7) == 0x84 && b[j + 2] == 0x24)
          prev = (int)((std::uint32_t)b[j + 3] | (std::uint32_t)b[j + 4] << 8 | (std::uint32_t)b[j + 5] << 16 | (std::uint32_t)b[j + 6] << 24);
        else if (b[j] == 0x8b && ((b[j + 1] >> 3) & 7) == r && (b[j + 1] & 0xc7) == 0x44 && b[j + 2] == 0x24) prev = b[j + 3];
      }
      break;
    }
  }
  if (prev < 0) return false;
  int ch = -1, color = -1;
  size_t low = at > LayoutScan ? at - LayoutScan : 0;
  for (size_t i = at - 8; i + 1 > low && i != (size_t)-1; i--) {
    if (ch < 0 && b[i] == 0x81 && b[i + 1] == 0x7c && b[i + 2] == 0x24 && b[i + 4] == 0x40 && b[i + 5] == 0x81 && b[i + 6] == 0 && b[i + 7] == 0) ch = b[i + 3];
    if (color < 0 && b[i] == 0x81 && (b[i + 1] & 0xf8) == 0xc8 && b[i + 2] == 0 && b[i + 3] == 0 && b[i + 4] == 0 && b[i + 5] == 0xff) {
      int r = b[i + 1] & 7;
      for (size_t j = i - 3; j + 8 >= i && j < i; j--) if (b[j] == 0x8b && b[j + 1] == (0x45 | r << 3)) { color = b[j + 2]; break; }
    }
    if (ch >= 0 && color >= 0) break;
    if (i == low) break;
  }
  if (ch < 0 || color < 0) return false;
  out.call = at; out.rel = (std::int32_t)((std::uint32_t)b[at + 1] | (std::uint32_t)b[at + 2] << 8 | (std::uint32_t)b[at + 3] << 16 | (std::uint32_t)b[at + 4] << 24);
  out.node = node; out.ch = ch + 4 * pushes; out.prev = prev; out.color = color;
  return true;
}
// all link sites in b[0..n); returns their count, the first `cap` in out
inline int FindLinks(const unsigned char *b, size_t n, Link *out, int cap) {
  int count = 0; Link l{};
  for (size_t at = 8; at + 5 + 0x30 < n; at++) {
    if (b[at] != 0xe8 || !LinkSite(b, n, at, l)) continue;
    if (count < cap) out[count] = l;
    count++;
  }
  return count;
}
// the glyph chain release: function starts (push ebp; mov ebp, esp up to 8 bytes before the walk)
inline int FindFrees(const unsigned char *b, size_t n, size_t *out, int cap) {
  int count = 0;
  for (size_t i = 8; i + 16 < n; i++) {
    if (b[i] != 0x8b || (b[i + 1] >> 6) != 1 || b[i + 2] != 0x44) continue;
    int r1 = (b[i + 1] >> 3) & 7;
    if (b[i + 3] != 0x85 || b[i + 4] != (0xc0 | r1 << 3 | r1) || b[i + 5] != 0x74) continue;
    size_t k = i + 7; if (b[k] == 0x57) k++;
    if (b[k] != 0x8b || (b[k + 1] >> 6) != 3 || (b[k + 1] & 7) != r1) continue;
    int r2 = (b[k + 1] >> 3) & 7; k += 2;
    if (b[k] != 0x8b || (b[k + 1] >> 6) != 1 || (b[k + 1] & 7) != r2 || b[k + 2] != 0x38) continue; k += 3;
    if (b[k] != 0x8b || b[k + 1] != (0x40 | r1 << 3 | r1) || b[k + 2] != 0x44) continue;
    long start = -1; for (size_t j = i - 1; j >= i - 8; j--) if (b[j] == 0x55 && b[j + 1] == 0x8b && b[j + 2] == 0xec) { start = (long)j; break; }
    if (start < 0) continue;
    if (count < cap) out[count] = (size_t)start;
    count++;
  }
  return count;
}
// BGI's character code: < 0x100 one byte, else the SJIS pair hi << 8 | lo; returns the byte count written to out[2]
inline int CharBytes(unsigned code, unsigned char *out) {
  if (code < 0x100) { out[0] = (unsigned char)code; return 1; }
  out[0] = (unsigned char)(code >> 8); out[1] = (unsigned char)code; return 2;
}
}
