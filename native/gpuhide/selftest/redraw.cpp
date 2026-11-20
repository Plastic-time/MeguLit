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
  return fail ? 1 : 0;
}
