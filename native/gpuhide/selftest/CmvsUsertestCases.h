// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include "ReplayCases.h"
#include <initializer_list>

namespace CmvsUsertest {

static std::vector<Quad> Cells(int x, int y, unsigned count, unsigned traced, unsigned glyphBase, unsigned columns = 23) {
 std::vector<Quad> cells;
 for (unsigned i = 0; i < count; ++i) {
  const float left = x + 28.f * (i % columns), top = y + 42.f * (i / columns);
  const float u = ((i + 1) % 14) * 72.f / 1024, v = ((i + 1) / 14) * 72.f / 2048;
  cells.push_back({left, top, left + 32, top + 32, u, v, u + 32.f / 1024, v + 32.f / 2048, 0});
  if (i < traced) cells.back().glyph = glyphBase + i + 1;
 }
 return cells;
}

static std::wstring Text(unsigned seq, size_t slots, std::initializer_list<size_t> blanks = {}) {
 std::wstring text;
 for (size_t i = 0; i < slots; ++i) text += static_cast<wchar_t>(0xe000 + (seq - 1) * 64 + i);
 for (size_t i : blanks) text[i] = L' ';
 return text;
}

static Quad Box(int x, int y, int w, int h, int u, int v, unsigned tw, unsigned th) {
 return {float(x), float(y), float(x + w), float(y + h), float(u) / tw, float(v) / th,
         float(u + w) / tw, float(v + h) / th, 0};
}

static std::vector<Quad> Tiles(int x, int y) {
 return {Box(x, y, 40, 70, 0, 0, 1280, 720), Box(x, y + 70, 28, 28, 0, 70, 1280, 720)};
}

static std::vector<Quad> Reveal(const std::vector<Quad> &body, size_t count) {
 const auto &first = body.front();
 std::vector<Quad> draw{Box(int(first.x0) - 26, int(first.y0) - 40, 4, 4, 0, 0, 1024, 2048)};
 draw.insert(draw.end(), body.begin(), body.begin() + count);
 return draw;
}

static void Paint(ReplayFixture &g, unsigned tick, const std::vector<Quad> &cells,
                  const std::vector<Quad> &tiles = {}) {
 if (!tiles.empty()) g.Draw((void *)2, 1280, 720, nullptr, 1280, 720, 1280, 720, tiles, tick);
 if (!cells.empty()) g.Draw((void *)1, 1024, 2048, nullptr, 1280, 720, 1280, 720, cells, tick);
 g.Frame(tick + 1, 1280, 720);
}

static void Warm(ReplayFixture &g, const std::vector<Quad> &body, bool spacer = true) {
 g.BodyRecheck(true);
 g.Line(Text(1, body.size()), 10000);
 const auto draw = spacer ? Reveal(body, body.size()) : body;
 Paint(g, 10001, draw);
 Paint(g, 10018, draw);
}

static std::string Placement(unsigned seq, bool hidden, const std::vector<Quad> &body,
                             std::initializer_list<size_t> blanks = {}) {
 std::string result = "ToMe_CHARS engine=gpu line=" + std::to_string(seq) + (hidden ? " hidden=1" : " hidden=0");
 result += " sw=1280 sh=720 vx=0 vy=0 vw=1280 vh=720 n=" + std::to_string(body.size() - blanks.size()) + " rects=";
 bool first = true;
 for (size_t i = 0; i < body.size(); ++i) {
  if (std::find(blanks.begin(), blanks.end(), i) != blanks.end()) continue;
  const auto &q = body[i];
  char box[64];
  std::snprintf(box, sizeof box, "%s%.0f,%.0f,%.0f,%.0f", first ? "" : ";", q.x0, q.y0, q.x1 - q.x0, q.y1 - q.y0);
  result += box;
  first = false;
 }
 return result;
}

static void CheckPlacements(const ReplayFixture &g, std::initializer_list<std::string> expected) {
 std::vector<std::string> actual;
 std::istringstream out(g.output.rows.str());
 for (std::string message; std::getline(out, message);) {
  if (message.rfind("ToMe_CHARS ", 0) == 0) actual.push_back(message.substr(0, message.find(" text=")));
 }
 const auto difference = std::mismatch(actual.begin(), actual.end(), expected.begin(), expected.end());
 if (difference.first == actual.end() && difference.second == expected.end()) return;
 throw std::runtime_error("CMVS placement stream differs at report " + std::to_string(difference.first - actual.begin() + 1) +
                          ": expected " + std::to_string(expected.size()) + " reports, received " + std::to_string(actual.size()));
}

// Geometry and draw order from the first incorrect corner report, followed by the completed row.
static void Corner(ReplayFixture &g) {
 const auto old = Cells(344, 334, 20, 20, 0);
 const auto next = Cells(414, 334, 15, 15, 20);
 const auto tiles = Tiles(388, 294);
 Warm(g, old);
 g.Line(Text(2, 15), 15000);
 Paint(g, 15001, Reveal(next, 13), tiles);
 Paint(g, 15018, Reveal(next, 15), tiles);
 Paint(g, 15035, Reveal(next, 15), tiles);
 CheckPlacements(g, {Placement(1, false, old), Placement(1, true, old), Placement(2, true, next)});
}

// The new prefix, three cells from the previous draw, and part of the box total 23 positions.
static void Mixed(ReplayFixture &g) {
 const auto old = Cells(470, 656, 11, 11, 0);
 const auto next = Cells(302, 656, 23, 7, 20);
 auto tiles = Tiles(276, 616);
 for (int x = 304; x <= 444; x += 28) {
  tiles.push_back(Box(x, 616, 28, 28, 28, 0, 1280, 720));
  tiles.push_back(Box(x - 2, 644, 32, 44, 28, 28, 1280, 720));
  tiles.push_back(Box(x, 686, 28, 28, 28, 72, 1280, 720));
 }
 Warm(g, old);
 g.Line(Text(2, 23), 15000);
 Paint(g, 15000, {});
 Paint(g, 15001, {});
 auto prefix = Reveal(next, 6);
 prefix.insert(prefix.end(), old.begin(), old.begin() + 3);
 Paint(g, 15002, prefix, tiles);
 Paint(g, 15018, Reveal(next, 23), tiles);
 Paint(g, 15035, Reveal(next, 23), tiles);
 CheckPlacements(g, {Placement(1, false, old), Placement(1, true, old), Placement(2, true, next)});
}

// The two dialogue bands are learned before the sample. The two-line bubble has three drawn blanks;
// the next bubble has 32 body cells and a spacer, and its successor reuses the same positions and UVs.
static void TwoRows(ReplayFixture &g) {
 const auto warm = Cells(456, 306, 18, 18, 0, 2);
 const auto upper = Cells(316, 306, 39, 12, 20);
 const auto lower = Cells(316, 614, 32, 6, 60);
 const auto shorter = Cells(316, 614, 26, 6, 100);
 Warm(g, warm, false);
 g.Line(Text(2, 39, {14, 18, 32}), 15000);
 Paint(g, 15001, Reveal(upper, 38));
 Paint(g, 15018, Reveal(upper, 39));
 Paint(g, 15035, Reveal(upper, 39));
 Paint(g, 17000, Reveal(lower, 5));
 g.Line(Text(3, 32), 17100);
 Paint(g, 17101, Reveal(lower, 24));
 Paint(g, 17118, Reveal(lower, 32));
 Paint(g, 17135, Reveal(lower, 32));
 g.Line(Text(4, 26), 19100);
 // A clipped redraw of the old line has the new length and the right grid, but no new cells.
 Paint(g, 19101, Reveal(lower, 26));
 // Six cells have changed, but the old draw still extends beyond the new line.
 auto oldTail = lower;
 std::copy_n(shorter.begin(), 6, oldTail.begin());
 Paint(g, 19118, Reveal(oldTail, 32));
 Paint(g, 19135, Reveal(shorter, 25));
 CheckPlacements(g, {Placement(1, false, warm), Placement(1, true, warm), Placement(2, true, upper, {14, 18, 32}),
                     Placement(3, true, lower)});
 Paint(g, 19152, Reveal(shorter, 26));
 Paint(g, 19169, Reveal(shorter, 26));
 CheckPlacements(g, {Placement(1, false, warm), Placement(1, true, warm), Placement(2, true, upper, {14, 18, 32}),
                     Placement(3, true, lower), Placement(4, true, shorter)});
}

static const FixtureCase Cases[] = {
 {L"aoitori-cmvs-user-corner", Corner},
 {L"aoitori-cmvs-user-mixed", Mixed},
 {L"aoitori-cmvs-user-two-rows", TwoRows},
};

} // namespace CmvsUsertest
