// Self-test of the page-redraw rule in GlyphQuads.h (CHAOS;CHILD 2026-11-21): a LINE that is the page so far arms the redraw
// window; a new line, the same line, or a shorter text does not.
#include <windows.h>
#include <string>
#include <vector>
#include <map>
#include <set>
#include <unordered_map>
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <functional>
#include "../GlyphQuads.h"
int main() {
  int fail = 0; auto ok = [&](bool c, const char *m) { std::printf("%s %s\n", c ? "PASS" : "FAIL", m); if (!c) fail++; };
  ok(GlyphLearner::PageRedraw(L"M7.8最大震度7。この天災は東京を", L"この天災は東京を"), "page = earlier line + current line ends with the line before: redraw");
  ok(!GlyphLearner::PageRedraw(L"流行を創り出していた", L"この天災は東京を"), "a new line is not a redraw");
  ok(!GlyphLearner::PageRedraw(L"この天災は東京を", L"この天災は東京を"), "the same line again is not a redraw");
  ok(!GlyphLearner::PageRedraw(L"東京を", L"この天災は東京を"), "a shorter text is not a redraw");
  ok(!GlyphLearner::PageRedraw(L"xa", L"a"), "a one-character line never arms it");
  GlyphLearner L; L.learned = true;
  L.Line(L"この天災は東京を", 1000); ok(L.redrawUntil == 0, "first line: no redraw window");
  L.Line(L"M7.8最大震度7。 この天災は東京を", 2000); ok(L.redrawUntil == 2000 + GlyphLearner::RedrawMs, "page redrawn: window armed for RedrawMs");
  L.Line(L"流行を創り出していた", 3000); ok(L.redrawUntil == 0, "next line: window closed");
  /* ruby (STEINS;GATE r25): a half-height glyph right on top of a body glyph of the line is its ruby; elsewhere it is not */
  GlyphLearner R; R.learned = true; R.glyphH = 32; R.lastRects = { GlyphLearner::Rect{ 400, 700, 432, 732 }, GlyphLearner::Rect{ 432, 700, 464, 732 } };
  ok(R.RubySized(16) && !R.RubySized(32) && !R.RubySized(8), "ruby height is about half the body height");
  ok(R.RubyOver(GlyphLearner::Rect{ 405, 680, 421, 696 }), "a small glyph just above a body glyph is its ruby");
  ok(!R.RubyOver(GlyphLearner::Rect{ 600, 680, 616, 696 }), "a small glyph above nothing is not ruby");
  ok(!R.RubyOver(GlyphLearner::Rect{ 405, 600, 421, 616 }), "a small glyph far above the line is not ruby");
  ok(!R.RubyOver(GlyphLearner::Rect{ 405, 740, 421, 756 }), "a small glyph under the line is not ruby");
  return fail ? 1 : 0;
}
