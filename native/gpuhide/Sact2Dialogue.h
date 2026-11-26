// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <cstddef>

namespace Sact2 {

struct Glyph { int x, y; unsigned code; };

// The live message sprite has a separate name row and up to three body rows.
// The backlog uses its own full-screen sprite, even when it contains this text.
constexpr size_t MaxGlyphs = 128;
inline size_t DrawCount(bool hide, int x, int y, const Glyph *glyphs, size_t count) {
 if (!hide || x != 3 || y != 355 || count < 4 || count > MaxGlyphs) return count;
 if (glyphs[0].x != 54 || glyphs[0].y != 6 || glyphs[0].code != 0x7981) return count; // 【 in CP932
 size_t body = 1;
 while (body < count && glyphs[body].y == 6 && glyphs[body].x == 54 + 20 * (int)body) ++body;
 if (body < 3 || body == count || glyphs[body - 1].code != 0x7a81) return count; // 】
 const auto &first = glyphs[body];
 if (first.x != 54 || first.y != 36 || (first.code != 0x7581 && first.code != 0x7781)) return count; // 「 or 『
 for (size_t i = body; i < count; ++i) {
  const auto &g = glyphs[i];
  if ((g.y != 36 && g.y != 62 && g.y != 88) || g.x < 54 || g.x >= 588) return count;
  if (i > body && (g.y < glyphs[i - 1].y || (g.y == glyphs[i - 1].y && g.x <= glyphs[i - 1].x))) return count;
 }
 return body;
}

}
