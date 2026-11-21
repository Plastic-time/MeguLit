// SPDX-License-Identifier: GPL-3.0-or-later
// engine-draw signature, MAGES. (docs/engine-draw-native.md): the dialogue pages, the two drawDialogue functions, drawGlyph,
// the layout-to-page commit and the page clears of any build seen so far (STEINS;GATE, STEINS;GATE 0, CHAOS;CHILD,
// STEINS;GATE 線形拘束のフェノグラム, STEINS;GATE 比翼恋理のだーりん; Steam). Pure byte matching, no Windows calls, so the
// self-test (selftest/magesdraw.cpp) runs it on the fixture bytes. tools/engine-sigs/mages-draw.cjs is the same matcher in
// JavaScript (its header has the layout); both must agree. Every result is an offset into the scanned bytes (calls, code)
// or a value read from the code (absolute addresses as the loader relocated them, the page stride).
#pragma once
#include <cstdint>
#include <cstddef>
#include <cstring>
namespace MagesDrawSig {
inline std::uint32_t U32(const unsigned char *b) { return (std::uint32_t)b[0] | (std::uint32_t)b[1] << 8 | (std::uint32_t)b[2] << 16 | (std::uint32_t)b[3] << 24; }
inline bool Prologue(const unsigned char *b, size_t i) { return b[i] == 0x55 && b[i + 1] == 0x8b && b[i + 2] == 0xec; }
// imul r32, r/m32, imm32 (register or [ebp+d8]); returns the instruction length, 0 if not that
inline int Imul(const unsigned char *b, size_t i, std::uint32_t &imm) {
  if (b[i] != 0x69) return 0; unsigned m = b[i + 1], mod = m >> 6, rm = m & 7;
  if (mod == 3) { imm = U32(b + i + 2); return 6; }
  if (mod == 1 && rm != 4) { imm = U32(b + i + 3); return 7; }
  return 0;
}
inline int SizeOf(std::uint32_t stride) { if (stride < 0x3c || (stride - 0x3c) % 30) return 0; std::uint32_t s = (stride - 0x3c) / 30; return s >= 500 && s <= 8000 ? (int)s : 0; }
inline size_t BodyEnd(const unsigned char *b, size_t n, size_t at, size_t cap = 0x600) {
  size_t lim = at + cap < n - 3 ? at + cap : n - 3;
  for (size_t i = at + 3; i < lim; i++) if (b[i - 1] == 0xcc && Prologue(b, i)) return i;
  return at + cap < n ? at + cap : n;
}
struct Result {
  int ok = 0;                       // 1 when every part was found exactly as expected
  size_t dialogue[2] = {0, 0};      // drawDialogue, drawDialogue2 (offsets)
  size_t dialogueEnd[2] = {0, 0};   // where their bodies end (the next int3 + prologue)
  size_t drawGlyph = 0;             // offset (may lie outside a snippet: computed from the calls)
  std::int64_t drawGlyphRel = 0;    // drawGlyph as an offset that may be negative / beyond n (snippets)
  std::uint32_t pages = 0, stride = 0, scale = 0; int chars = 0;
  size_t commit = 0; std::uint32_t count = 0, codes = 0, info = 0; int commits = 0;
  size_t clear[4] = {0, 0, 0, 0}; int clears = 0;
  int heads = 0;                    // drawDialogue candidates with three glyph calls
};
// the one call target reached three times, each call followed by add esp,2Ch within 0x30 bytes; returns 1 and its offset
inline int GlyphTarget(const unsigned char *b, size_t at, size_t end, std::int64_t &target) {
  std::int64_t t[16]; int c[16]; int k = 0;
  for (size_t i = at; i + 5 < end; i++) {
    if (b[i] != 0xe8) continue;
    std::int64_t to = (std::int64_t)i + 5 + (std::int32_t)U32(b + i + 1);
    for (size_t j = i + 5; j < end && j < i + 0x30; j++) if (b[j] == 0x83 && b[j + 1] == 0xc4 && b[j + 2] == 0x2c) {
      int f = -1; for (int q = 0; q < k; q++) if (t[q] == to) f = q;
      if (f < 0 && k < 16) { t[k] = to; c[k] = 0; f = k++; }
      if (f >= 0) c[f]++;
      break;
    }
  }
  int found = 0; for (int q = 0; q < k; q++) if (c[q] == 3) { found++; target = t[q]; }
  return found;
}
inline Result Find(const unsigned char *b, size_t n) {
  Result r; struct Head { size_t at, end; std::uint32_t stride, pages; int S; std::int64_t glyph; std::uint32_t scale; } h[8]; int nh = 0;
  for (size_t i = 0; i + 48 < n; i++) {
    if (!Prologue(b, i) || b[i + 3] != 0x83 || b[i + 4] != 0xec || (b[i + 5] != 0x0c && b[i + 5] != 0x10) || b[i + 6] != 0x53) continue;
    bool done = false;
    for (size_t j = i + 7; j < i + 24 && !done; j++) {
      std::uint32_t imm; int len = Imul(b, j, imm); if (!len) continue; int S = SizeOf(imm); if (!S) continue;
      for (size_t k = j + len; k < j + len + 8; k++) {
        if (b[k] == 0x83 && (b[k + 1] & 0xf8) == 0xb8 && b[k + 6] == 0 && b[k + 7] == 0x0f && b[k + 8] == 0x84) {
          size_t end = BodyEnd(b, n, i); std::int64_t g;
          if (GlyphTarget(b, i, end, g) == 1 && nh < 8) {
            std::uint32_t sc = 0; for (size_t q = i; q + 8 < end; q++) if (b[q] == 0xf3 && b[q + 1] == 0x0f && b[q + 2] == 0x10 && b[q + 3] == 0x0d) { sc = U32(b + q + 4); break; }
            h[nh++] = {i, end, imm, U32(b + k + 2) - 0xc, S, g, sc};
          }
          done = true; break;
        }
      }
    }
  }
  r.heads = nh;
  if (nh != 2 || h[0].stride != h[1].stride || h[0].pages != h[1].pages || h[0].glyph != h[1].glyph) return r;
  r.dialogue[0] = h[0].at; r.dialogue[1] = h[1].at; r.dialogueEnd[0] = h[0].end; r.dialogueEnd[1] = h[1].end; r.drawGlyphRel = h[0].glyph; r.drawGlyph = (size_t)h[0].glyph;
  r.pages = h[0].pages; r.stride = h[0].stride; r.chars = h[0].S; r.scale = h[0].scale;
  unsigned char lenAt[4], col[4], strideB[4], SB[4];
  auto put = [](unsigned char *o, std::uint32_t v) { o[0] = (unsigned char)v; o[1] = (unsigned char)(v >> 8); o[2] = (unsigned char)(v >> 16); o[3] = (unsigned char)(v >> 24); };
  put(lenAt, r.pages + 0xc); put(col, r.pages + 0x3c + 12 * (std::uint32_t)r.chars); put(strideB, r.stride); put(SB, (std::uint32_t)r.chars);
  // commit
  for (size_t i = 0; i + 0x60 < n; i++) {
    if (!Prologue(b, i)) continue; size_t c = 0; bool hasC = false;
    for (size_t k = i + 3; k < i + 0x10; k++) if (b[k] == 0x39 && b[k + 1] == 0x05 && b[k + 6] == 0x0f && b[k + 7] == 0x86) { c = k; hasC = true; break; }
    if (!hasC) continue; std::uint32_t codes = 0, info = 0;
    for (size_t k = c; k < i + 0x60; k++) {
      if (!codes && b[k] == 0x0f && b[k + 1] == 0xb7 && b[k + 2] == 0x14 && b[k + 3] == 0x45) codes = U32(b + k + 4);
      if (!info && b[k] == 0xb9) info = U32(b + k + 1);
    }
    if (!codes || !info) continue;
    size_t end = BodyEnd(b, n, i, 0x200); bool inc = false, hasStride = false;
    for (size_t k = i; k + 6 <= end; k++) {
      if (b[k] == 0xff && (b[k + 1] & 0xf8) == 0x80 && !std::memcmp(b + k + 2, lenAt, 4)) inc = true;
      if (k + 4 <= end && !std::memcmp(b + k, strideB, 4)) hasStride = true;
    }
    if (inc && hasStride) { if (!r.commits) { r.commit = i; r.count = U32(b + c + 2); r.codes = codes; r.info = info; } r.commits++; }
  }
  // clears
  for (size_t i = 0; i + 24 < n; i++) {
    std::uint32_t imm; int len = Imul(b, i, imm); if (!len || imm != r.stride || b[i + len] != 0x68 || std::memcmp(b + i + len + 1, SB, 4)) continue;
    size_t k = i + len + 5; if (b[k] == 0x6a && b[k + 1] == 0) k += 2; else if (b[k] >= 0x50 && b[k] <= 0x57) k += 1;
    if (b[k] != 0x8d || (b[k + 1] & 0xc0) != 0x80 || std::memcmp(b + k + 2, col, 4)) continue;
    size_t f = i; while (f > 0 && !(b[f - 1] == 0xcc && Prologue(b, f)) && i - f < 0x80) f--;
    if (f > 0 && b[f - 1] == 0xcc && Prologue(b, f)) {
      bool dup = false; for (int q = 0; q < r.clears && q < 4; q++) if (r.clear[q] == f) dup = true;
      if (!dup) { if (r.clears < 4) r.clear[r.clears] = f; r.clears++; }
    }
  }
  r.ok = r.commits == 1 && r.clears >= 1 && r.clears <= 4 && r.scale;
  return r;
}
}
