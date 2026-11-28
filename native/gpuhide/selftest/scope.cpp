// SPDX-License-Identifier: GPL-3.0-or-later
#include "NameplateCases.h"
#include "../LittlecheeseRows.h"
#include "../Sact2Dialogue.h"
#include <assert.h>

static void MovingBox() {
 GlyphLearner g;
 std::vector<std::string> reports;
 g.emit = [&](const std::string &r) { reports.push_back(r); };
 void *settings = (void *)1, *dialogue = (void *)2;
 auto draw = [&](void *tex, const std::vector<Quad> &q, unsigned now) {
  return g.Draw(tex, 1024, 2048, nullptr, 1280, 720, 1280, 720, q, now);
 };
 const auto preview = Row(6, 30, 88, 22, 0.0f);
 g.Line(L"文字表示設定", 10000);
 assert(draw(settings, preview, 10001).empty());
 g.Frame(10002, 1280, 720);
 assert(g.area.y0 == 66 && g.area.y1 == 154);

 g.Line(L"お話しする時間ですよ。", 11000);
 const auto bottom = Row(11, 470, 656, 32, 0.1f);
 assert(draw(dialogue, bottom, 11001).empty());
 g.Frame(11002, 1280, 720);
 assert(g.area.y0 == 624 && g.glyphH == 32);
 assert(reports.back().find("line=2 hidden=0") != std::string::npos);
 assert(reports.back().find("rects=470,656,32,32") != std::string::npos);
 assert(draw(dialogue, bottom, 11003).size() == bottom.size());
 assert(draw(settings, preview, 11003).empty());
 g.Frame(11004, 1280, 720);
 assert(reports.back().find("line=2 hidden=1") != std::string::npos);

 g.Line(L"水を持って行きますね。", 12000);
 const auto next = Row(11, 470, 656, 32, 0.2f);
 assert(draw(settings, Row(11, 50, 90, 22, 0.3f), 12001).empty());
 assert(draw(dialogue, next, 12001).size() == next.size());
 g.Frame(12002, 1280, 720);
 assert(g.learnedSeq == 2); // The next line in a fixed box keeps the existing band.
}

static void RecoverStaleToolbar() {
 for (bool reusedCells : { false, true }) {
  GlyphLearner g;
  std::vector<std::string> reports;
  g.emit = [&](const std::string &r) { reports.push_back(r); };
  void *toolbar = (void *)1, *dialogue = (void *)2;
  auto draw = [&](void *tex, const std::vector<Quad> &q, unsigned now) {
   return g.Draw(tex, tex == toolbar ? 1536 : 1024, tex == toolbar ? 1024 : 2048,
    nullptr, 1280, 720, 1280, 720, q, now).size();
  };
  std::vector<Quad> buttons;
  for (unsigned i = 0; i < 12; i++) {
   float x = 4.f + i * 96, v = i * 0.06f;
   buttons.push_back({ x, 0, x + 94, 52, 0, v, 94.f / 1536, v + 52.f / 1024, 0 });
  }
  g.Line(L"ABCD", 10000);
  assert(draw(toolbar, {buttons.begin(), buttons.begin() + 4}, 10001) == 0);
  g.Frame(10002, 1280, 720);
  assert(g.area.y0 == -52 && g.area.y1 == 156);
  g.Off();

  const Quad spacer{ 360, 616, 364, 620, 0, 0, 4.f / 1024, 4.f / 2048, 0 };
  auto body = Row(17, 386, 656, 32, 0.2f);
  for (unsigned i = 0; i < body.size(); i++) body[i].glyph = i + 1;
  assert(draw(toolbar, buttons, 10400) == 0);
  if (reusedCells) assert(draw(dialogue, body, 10400) == 0);
  g.Frame(10401, 1280, 720);
  for (Quad &q : body) q.glyph += 100; // New glyph uploads reuse the same positions and UVs.
  body.push_back(spacer);

  g.Line(L"ABCDEFGHIJKLMNOPQ", 15000);
  assert(draw(toolbar, buttons, 15001) == buttons.size());
  assert(draw(dialogue, body, 15001) == 0);
  g.Frame(15002, 1280, 720);
  assert(g.learnedSeq == 2 && g.area.y0 == 624);
  assert(reports.back().find("line=2 hidden=0") != std::string::npos);
  assert(reports.back().find("rects=386,656,32,32") != std::string::npos);
  assert(draw(toolbar, buttons, 15017) == 0);
  assert(draw(dialogue, body, 15017) == body.size() - 1); // Only the untraced 4x4 spacer remains.
  g.Frame(15018, 1280, 720);
  assert(reports.back().find("line=2 hidden=1") != std::string::npos);
 }
}

static void ConfirmBodyBeforeMenu() {
 for (bool readOnly : { false, true }) {
  GlyphLearner g;
  std::vector<std::string> reports;
  g.emit = [&](const std::string &r) { reports.push_back(r); };
  auto draw = [&](const std::vector<Quad> &q, unsigned now) {
   return g.Draw((void *)1, 1024, 2048, nullptr, 1280, 720, 1280, 720, q, now).size();
  };
  auto body = Row(5, 400, 550, 32, 0.1f);
  auto menu = Row(5, 100, 130, 32, 0.2f);
  for (unsigned i = 0; i < 5; i++) { body[i].glyph = i + 1; menu[i].glyph = i + 6; }
  g.Line(L"ABCDE", 10000);
  draw(body, 10001);
  g.Frame(10002, 1280, 720);
  if (readOnly) {
   draw(body, 10010);
   g.Frame(10011, 1280, 720);
   g.readOnly = true;
  }

  body.push_back({ 392, 558, 396, 562, 0, 0, 4.f / 1024, 4.f / 2048, 0 });
  assert(draw(body, 10017) == (readOnly ? 0 : 5));
  assert(draw(menu, 10017) == 0);
  g.Frame(10018, 1280, 720);
  assert(reports.back().find("rects=400,550,32,32") != std::string::npos);
  assert(g.area.y0 == 518);
  g.readOnly = false;
  assert(draw(body, 10035) == 5 && draw(menu, 10035) == 0);
 }
}

static void KeepCachedBand() {
 for (unsigned count : { 5u, 8u }) {
  GlyphLearner g;
  void *dialogue = (void *)1, *label = (void *)2;
  auto draw = [&](void *tex, const std::vector<Quad> &q, unsigned now) {
   return g.Draw(tex, 1024, 2048, nullptr, 1280, 720, 1280, 720, q, now).size();
  };
  const auto body = Row(count, 400, 550, 32, 0.1f);
  auto menu = Row(5, 100, 130, 32, 0.2f);
  for (unsigned i = 0; i < menu.size(); i++) menu[i].glyph = i + 1;
  menu.push_back({ 92, 138, 96, 142, 0, 0, 4.f / 1024, 4.f / 2048, 0 });

  g.Line(count == 5 ? L"ABCDE" : L"ABCDEFGH", 10000);
  draw(dialogue, body, 10001);
  g.Frame(10002, 1280, 720);
  assert(draw(dialogue, body, 10010) == count);
  g.Frame(10011, 1280, 720);
  g.Line(L"VWXYZ", 15000);
  assert(draw(dialogue, body, 15001) == count);
  assert(draw(label, menu, 15001) == 0);
  g.Frame(15002, 1280, 720);
  assert(g.learnedSeq == 1 && g.area.y0 == 518);
  assert(draw(dialogue, body, 15017) == count);
  assert(draw(label, menu, 15017) == 0);
 }
}

static void KeepOccupiedBand() {
 void *dialogue = (void *)1, *label = (void *)2, *icon = (void *)3;
 for (bool read : { false, true }) {
  GlyphLearner g;
  auto draw = [&](void *tex, const std::vector<Quad> &q, unsigned now) {
   return g.Draw(tex, 1024, 2048, nullptr, 1280, 720, 1280, 720, q, now).size();
  };
  g.Line(L"ABCDEFGH", 10000);
  draw(dialogue, Row(8, 400, 550, 24, 0.1f), 10001);
  g.Frame(10002, 1280, 720);

  g.Line(L"IJKLMNOP", 11000);
  auto menu = Row(8, 100, 130, 24, 0.2f);
  for (unsigned i = 0; i < menu.size(); i++) menu[i].glyph = i + 1;
  g.readOnly = read;
  assert(draw(dialogue, Row(3, 400, 550, 24, 0.3f), 11001) == (read ? 0 : 3));
  assert(draw(label, menu, 11001) == 0);
  draw(icon, Row(1, 335, 130, 24, 0.4f), 11001);
  g.Frame(11002, 1280, 720);
  g.readOnly = false;
  assert(draw(dialogue, Row(8, 400, 550, 24, 0.3f), 11003) == 8);
  assert(draw(label, menu, 11003) == 0);
 }
 {
  GlyphLearner g;
  auto draw = [&](const std::vector<Quad> &q, unsigned now) {
   return g.Draw(dialogue, 1024, 2048, nullptr, 1280, 720, 1280, 720, q, now).size();
  };
  const auto first = Row(8, 400, 120, 24, 0.1f), second = Row(8, 400, 340, 24, 0.3f);
  g.Line(L"ABCDEFGH", 10000);
  draw(first, 10001);
  g.Frame(10002, 1280, 720);
  draw(first, 10003);
  g.Frame(10004, 1280, 720);
  g.Line(L"IJKLMNOP", 11000);
  assert(draw(first, 11001) == 8);
  draw(second, 11001);
  g.Frame(11002, 1280, 720);
  assert(draw(first, 11003) == 8 && draw(second, 11003) == 8);
 }
}

static void IgnoreOldAtlasFrame() {
 GlyphLearner g;
 void *dialogue = (void *)1, *label = (void *)2;
 auto draw = [&](void *tex, const std::vector<Quad> &q, unsigned now) {
  return g.Draw(tex, 1024, 2048, nullptr, 1280, 720, 1280, 720, q, now).size();
 };
 g.Line(L"ABCDEFGH", 10000);
 draw(dialogue, Row(8, 400, 550, 24, 0.1f), 10001);
 g.Frame(10002, 1280, 720);
 const auto menu = Row(8, 100, 130, 24, 0.2f);
 draw(label, menu, 10401);
 g.Frame(10402, 1280, 720);
 draw(label, menu, 10403);
 g.Frame(10404, 1280, 720);
 g.Frame(10420, 1280, 720);

 g.Line(L"IJKLMNOP", 11000);
 g.Frame(11001, 1280, 720);
 assert(draw(dialogue, Row(8, 400, 550, 24, 0.3f), 11002) == 8);
}

static void KeepBandOnItsTarget() {
 GlyphLearner g;
 void *game = (void *)10, *offscreen = (void *)20, *dialogue = (void *)1, *label = (void *)2;
 auto draw = [&](void *rt, void *tex, const std::vector<Quad> &q, unsigned now) {
  return g.Draw(tex, 1024, 2048, rt, 640, 360, 1280, 720, q, now).size();
 };
 g.Composite(game, {{0, 0, 1280, 720, 0, 0, 1, 1, 0}});
 g.Line(L"ABCDEFGH", 10000);
 draw(game, dialogue, Row(8, 100, 80, 24, 0.1f), 10001);
 g.Frame(10002, 1280, 720);
 g.Line(L"IJKLMNOP", 11000);
 assert(draw(offscreen, label, Row(8, 100, 260, 24, 0.2f), 11001) == 0);
 g.Frame(11002, 1280, 720);
 assert(draw(game, dialogue, Row(8, 100, 80, 24, 0.3f), 11003) == 8);
}

static void IgnoreTraceFromOldFrame() {
 GlyphLearner g;
 void *toolbar = (void *)1, *label = (void *)2;
 auto draw = [&](void *tex, const std::vector<Quad> &q, unsigned now) {
  return g.Draw(tex, 1024, 2048, nullptr, 1280, 720, 1280, 720, q, now).size();
 };
 const auto buttons = Row(12, 4, 0, 32, 0.0f);
 auto menu = Row(7, 400, 220, 32, 0.1f);
 auto prior = Row(7, 400, 220, 32, 0.2f);
 for (unsigned i = 0; i < menu.size(); i++) { menu[i].glyph = i + 1; prior[i].glyph = i + 8; }

 g.Line(L"ABCD", 10000);
 draw(toolbar, {buttons.begin(), buttons.begin() + 4}, 10001);
 g.Frame(10002, 1280, 720);
 draw(label, menu, 10400);
 draw(toolbar, buttons, 10400);
 g.Frame(10401, 1280, 720);
 draw(label, prior, 13000); // A different label uses the same positions and different texture cells.
 g.Frame(13001, 1280, 720);

 g.Line(L"ABCDEFG", 15000);
 menu.push_back({ 392, 228, 396, 232, 0, 0, 4.f / 1024, 4.f / 2048, 0 });
 assert(draw(toolbar, buttons, 15001) == buttons.size());
 assert(draw(label, menu, 15001) == 0);
 g.Frame(15002, 1280, 720);
 assert(draw(label, menu, 15017) == 0);
}

static void ReportNewLineWithLateScaledCopy() {
 GlyphLearner g;
 std::vector<std::string> reports;
 g.emit = [&](const std::string &r) { reports.push_back(r); };
 auto draw = [&](const std::vector<Quad> &q, unsigned now) {
  return g.Draw((void *)1, 1024, 2048, nullptr, 1280, 720, 1280, 720, q, now).size();
 };
 const auto previous = Row(6, 400, 550, 32, 0.0f), next = Row(3, 400, 590, 32, 0.1f);
 g.Line(L"ABCDEF", 10000);
 draw(previous, 10001);
 g.Frame(10002, 1280, 720);
 draw(previous, 10010);
 g.Frame(10011, 1280, 720);

 g.Line(L"GHI", 15000);
 draw(previous, 15001);
 draw(Row(1, 400, 562, 28, 0.2f), 15001);
 assert(draw(next, 15001) == 3);
 g.Frame(15002, 1280, 720);
 assert(reports.back().find("line=2 hidden=1") != std::string::npos);
 assert(reports.back().find(" n=3 rects=400,590,32,32;428,590,32,32;456,590,32,32 text=GHI") != std::string::npos);
}

static void KeepCenteredBandWhileTyping() {
 GlyphLearner g;
 void *dialogue = (void *)1, *label = (void *)2;
 auto draw = [&](void *tex, const std::vector<Quad> &q, unsigned now) {
  return g.Draw(tex, 1024, 2048, nullptr, 1280, 720, 1280, 720, q, now).size();
 };
 const auto prefix = Row(3, 356, 550, 32, 0.1f), next = Row(5, 356, 550, 32, 0.1f);
 const auto previous = Row(5, 412, 550, 32, 0.0f);
 auto menu = Row(5, 100, 130, 32, 0.2f);
 for (unsigned i = 0; i < menu.size(); i++) menu[i].glyph = i + 1;
 menu.push_back({ 92, 138, 96, 142, 0, 0, 4.f / 1024, 4.f / 2048, 0 });
 draw(dialogue, prefix, 6500); // Cache the first cells before either line starts.
 g.Frame(6501, 1280, 720);

 g.Line(L"ABCDE", 10000);
 draw(dialogue, previous, 10001);
 g.Frame(10002, 1280, 720);
 draw(dialogue, previous, 10010);
 g.Frame(10011, 1280, 720);

 g.Line(L"VWXYZ", 15000);
 assert(draw(dialogue, prefix, 15001) == 3);
 assert(draw(label, menu, 15001) == 0);
 g.Frame(15002, 1280, 720);
 assert(draw(dialogue, next, 15017) == 5);
 assert(draw(label, menu, 15017) == 0);
}

enum class BodyRecheckCase { Centered, Moved, Partial, Disabled, ReadOnly };

static void CenteredDialogueWithSpacer(GlyphLearner &g, BodyRecheckCase test) {
 const int top = test == BodyRecheckCase::Moved ? 656 : 334;
 const bool partial = test == BodyRecheckCase::Partial || test == BodyRecheckCase::Disabled || test == BodyRecheckCase::ReadOnly;
 const bool readOnly = test == BodyRecheckCase::ReadOnly;
 std::vector<std::string> reports;
 g.emit = [&](const std::string &r) { reports.push_back(r); };
 const auto tilesAtOldPlaces = Row(4, 568, 334, 4, 0.6f);
 auto draw = [&](const std::vector<Quad> &q, unsigned now) {
  // These untraced tiles outlive the previous line and keep its rectangle records around.
  if (test == BodyRecheckCase::Centered)
   assert(g.Draw((void *)3, 1024, 2048, nullptr, 1280, 720, 1280, 720, tilesAtOldPlaces, now).empty());
  return g.Draw((void *)1, 1024, 2048, nullptr, 1280, 720, 1280, 720, q, now);
 };
 auto prior = Row(4, partial ? 900 : 568, 334, 32, 0.1f);
 for (unsigned i = 0; i < prior.size(); i++) prior[i].glyph = i + 1;
 g.Line(L"ABCD", 10000);
 draw(prior, 10001);
 g.Frame(10002, 1280, 720);
 assert(draw(prior, 10003).size() == prior.size());
 g.Frame(10004, 1280, 720);
 g.readOnly = readOnly;

 auto next = Row(14, 428, (float)top, 32, 0.2f);
 for (unsigned i = 0; i < next.size(); i++) next[i].glyph = i + 5;
 const float spacerTop = (float)top - (partial ? 40 : 20);
 next.push_back({ 402, spacerTop, 406, spacerTop + 4, 0, 0, 4.f / 1024, 4.f / 2048, 0 });
 auto nameplate = Row(4, 84, 160, 32, 0.4f);
 for (unsigned i = 0; i < nameplate.size(); i++) nameplate[i].glyph = i + 20;
 next.insert(next.end(), nameplate.begin(), nameplate.end());
 g.Line(L"EFGHIJKLMNOPQR", 15000);
 if (partial) {
  // A partial row plus three bubble tiles can reach the expected count.
  const std::vector<Quad> tiles{
   { 402, 294, 430, 322, 0, 0, 28.f / 1280, 28.f / 720, 0 },
   { 402, 322, 430, 364, 0, 0, 28.f / 1280, 42.f / 720, 0 },
   { 402, 364, 430, 392, 0, 0, 28.f / 1280, 28.f / 720, 0 },
  };
  std::vector<Quad> prefix(next.begin(), next.begin() + 11);
  prefix.push_back(next[14]);
  assert(g.Draw((void *)2, 1280, 720, nullptr, 1280, 720, 1280, 720, tiles, 15001).empty());
  draw(prefix, 15001);
  g.Frame(15002, 1280, 720);
 }
 draw(next, 15005);
 g.Frame(15006, 1280, 720);
 draw(next, 15017);
 g.Frame(15018, 1280, 720);
 const auto hidden = draw(next, 15034);
 g.Frame(15035, 1280, 720);
 if (test == BodyRecheckCase::Centered) assert(g.earlierRects.size() == prior.size());
 if (readOnly) assert(hidden.empty());
 else assert(hidden.size() == 14 && hidden.back() == 13); // The spacer and nameplate stay in the game.

 std::vector<std::string> line;
 for (const auto &r : reports) if (r.find("ToMe_CHARS engine=gpu line=2 ") == 0) line.push_back(r);
 const std::string mixed = "n=14 rects=402,294,28,28;402,322,28,42;";
 if (test == BodyRecheckCase::Disabled || readOnly) {
  assert(line.size() == 1);
  assert(line[0].find(readOnly ? " line=2 hidden=0 " : " line=2 hidden=1 ") != std::string::npos);
  assert(line[0].find(mixed) != std::string::npos);
  return;
 }
 assert(line.size() == (test == BodyRecheckCase::Moved ? 2 : 1));
 const auto complete = [&](const std::string &r, const char *state) {
  assert(r.find(state) != std::string::npos);
  assert(r.find("n=14 rects=428," + std::to_string(top) + ",32,32") != std::string::npos);
  assert(r.find(";792," + std::to_string(top) + ",32,32 text=") != std::string::npos);
 };
 if (test == BodyRecheckCase::Moved) complete(line.front(), " line=2 hidden=0 ");
 complete(line.back(), " line=2 hidden=1 ");

 if (test == BodyRecheckCase::Centered) {
  const auto before = reports.size();
  g.Line(L"STUVWXYZABCDEF", 20000);
  draw(next, 20001);
  auto redraw = next; // The previous row is also redrawn from different cells before the new row arrives.
  for (auto &q : redraw) { q.v0 += 0.1f; q.v1 += 0.1f; }
  draw(redraw, 20001);
  g.Frame(20002, 1280, 720);
  assert(std::none_of(reports.begin() + before, reports.end(), [](const std::string &r) {
   return r.find("ToMe_CHARS engine=gpu line=3 ") == 0;
  }));
 }
}

enum class TailGeometry { OnPitch, OffPitch, InteriorGap };

static void BottomDialogueWithUntracedTail(GlyphLearner &g, TailGeometry geometry, bool recheck, bool boxTiles = false) {
 const std::string prefix = "ToMe_CHARS engine=gpu line=2 ";
 std::vector<std::string> reports;
 g.emit = [&](const std::string &r) { if (r.find(prefix) == 0) reports.push_back(r); };
 auto draw = [&](const std::vector<Quad> &q, unsigned now) {
  return g.Draw((void *)1, 1024, 2048, nullptr, 1280, 720, 1280, 720, q, now);
 };

 auto prior = Row(4, 960, 656, 32, 0.1f);
 for (unsigned i = 0; i < prior.size(); i++) prior[i].glyph = i + 1;
 g.Line(L"ABCD", 10000);
 draw(prior, 10001);
 g.Frame(10002, 1280, 720);

 // A spacer or three tiles can bring a partial row up to the expected count.
 auto row = Row(21, 330, 656, 32, 0.2f);
 for (unsigned i = 0; i < 19; i++) row[i].glyph = i + 5;
 if (geometry == TailGeometry::OffPitch) { row.back().x0 += 8; row.back().x1 += 8; }
 if (geometry == TailGeometry::InteriorGap) std::swap(row[11].glyph, row[19].glyph);
 const Quad spacer{ 304, 616, 308, 620, 0, 0, 4.f / 1024, 4.f / 2048, 0 };
 g.Line(L"ABCDEFGHIJKLMNOPQRSTU", 15000);
 std::vector<Quad> partial(row.begin(), row.begin() + (boxTiles ? 18 : 20));
 if (boxTiles) {
  const std::vector<Quad> tiles{
   { 304, 616, 332, 644, 0, 0, 28.f / 1280, 28.f / 720, 0 },
   { 304, 644, 332, 686, 0, 0, 28.f / 1280, 42.f / 720, 0 },
   { 304, 686, 332, 714, 0, 0, 28.f / 1280, 28.f / 720, 0 },
  };
  assert(g.Draw((void *)2, 1280, 720, nullptr, 1280, 720, 1280, 720, tiles, 15001).empty());
 } else {
  partial.push_back(spacer);
  row.push_back(spacer);
 }
 draw(partial, 15001);
 g.Frame(15002, 1280, 720);
 const bool legacy = !recheck || geometry == TailGeometry::InteriorGap;
 assert(reports.size() == (legacy ? 1 : 0));
 if (legacy) {
  assert(reports.front().find(prefix + "hidden=1 ") == 0);
  assert(reports.front().find(boxTiles ? "n=21 rects=304,616,28,28;304,644,28,42;330,656,32,32;" :
                                       "n=21 rects=304,616,4,4;330,656,32,32;") != std::string::npos);
 }

 const auto hidden = draw(row, 15017);
 g.Frame(15018, 1280, 720);
 draw(row, 15034);
 g.Frame(15035, 1280, 720);
 assert(hidden.size() == 21 && hidden.back() == 20);
 assert(reports.size() == (legacy || geometry == TailGeometry::OnPitch ? 1 : 0));
 if (recheck && geometry == TailGeometry::OnPitch) {
  assert(reports.back().find(prefix + "hidden=1 ") == 0);
  std::string rects = "n=21 rects=";
  for (int x = 330; x <= 890; x += 28) {
   if (x != 330) rects += ';';
   rects += std::to_string(x) + ",656,32,32";
  }
  assert(reports.back().find(rects + " text=") != std::string::npos);
 }
}

static void VisibleThenHiddenDialogue(GlyphLearner &g, bool expectClean) {
 std::vector<std::string> offsets;
 g.emit = [&](const std::string &r) { if (r.find("ToMe_CHARS engine=gpu line=2 ") == 0) offsets.push_back(r); };
 auto draw = [&](const std::vector<Quad> &q, unsigned now) {
  return g.Draw((void *)1, 1024, 2048, nullptr, 1280, 720, 1280, 720, q, now);
 };
 auto prior = Row(4, 940, 334, 32, 0.1f);
 for (unsigned i = 0; i < prior.size(); i++) prior[i].glyph = i + 1;
 g.Line(L"ABCD", 10000);
 draw(prior, 10001);
 g.Frame(10002, 1280, 720);

 auto row = Row(15, 414, 334, 32, 0.2f);
 for (unsigned i = 0; i < row.size(); i++) row[i].glyph = i + 5;
 const Quad spacer{ 388, 294, 392, 298, 0, 0, 4.f / 1024, 4.f / 2048, 0 };
 auto partial = row;
 partial.back() = spacer;
 row.push_back(spacer);

 g.readOnly = true;
 g.Line(L"EFGHIJKLMNOPQRS", 15000);
 assert(draw(partial, 15001).empty());
 g.Frame(15002, 1280, 720);
 assert(offsets.size() == 1 && offsets.front().find("hidden=0 ") != std::string::npos);
 g.readOnly = false;
 assert(draw(partial, 15017).size() == 14);
 g.Frame(15018, 1280, 720);
 assert(offsets.size() == (expectClean ? 1 : 2));

 assert(draw(row, 15034).size() == 15);
 g.Frame(15035, 1280, 720);
 assert(offsets.size() == 2 && offsets.back().find("hidden=1 ") != std::string::npos);
 const char *start = expectClean ? "rects=414,334,32,32;" : "rects=388,294,4,4;";
 assert(offsets.back().find(start) != std::string::npos);
 if (expectClean) assert(offsets.back().find(";806,334,32,32 text=") != std::string::npos);
}

enum class RewriteTiming { AfterLine, BeforeLine, Stale };

static void RewrittenBodyAtlas(GlyphLearner &g, RewriteTiming timing, bool expectPosition) {
 std::vector<std::string> offsets;
 g.emit = [&](const std::string &r) { if (r.find("ToMe_CHARS engine=gpu line=2 ") == 0) offsets.push_back(r); };
 auto draw = [&](const std::vector<Quad> &q, unsigned now) {
  return g.Draw((void *)1, 1024, 2048, nullptr, 1280, 720, 1280, 720, q, now);
 };
 auto row = Row(17, 386, 656, 32, 0.2f);
 for (unsigned i = 0; i < row.size(); i++) row[i].glyph = i + 1;
 g.Line(L"ABCDEFGHIJKLMNOPQ", 10000);
 draw(row, 10001);
 g.Frame(10002, 1280, 720);
 if (timing == RewriteTiming::Stale) {
  // These writes already belonged to the previous hidden report.
  row[0].glyph = 19;
  row[1].glyph = 18;
 }
 draw(row, 10017);
 g.Frame(10018, 1280, 720);

 if (timing == RewriteTiming::BeforeLine) {
  // CMVS has drawn the first new cells before the hook delivers the line.
  row[0].glyph = 19;
  row[1].glyph = 18;
  draw(std::vector<Quad>(row.begin(), row.begin() + 2), 10340);
  g.Frame(10341, 1280, 720);
 }
 const unsigned lineAt = timing == RewriteTiming::Stale ? 10130 : 10500;
 g.Line(L"QRSTUVWXYZABCDEFG", lineAt);
 if (timing == RewriteTiming::AfterLine) {
  assert(draw(row, lineAt + 1).size() == row.size()); // The old drawing can outlive LINE.
  g.Frame(lineAt + 2, 1280, 720);
  assert(offsets.empty());
  row[1].glyph = 18;
  draw(row, lineAt + 18);
  g.Frame(lineAt + 19, 1280, 720);
  assert(offsets.empty()); // A single change is not enough to claim the whole row.
  row[0].glyph = 19;
 }
 const std::vector<Quad> partial(row.begin(), row.end() - 1);
 draw(partial, lineAt + 35);
 g.Frame(lineAt + 36, 1280, 720);
 assert(offsets.empty());

 assert(draw(row, lineAt + 52).size() == row.size());
 g.Frame(lineAt + 53, 1280, 720);
 draw(row, lineAt + 69);
 g.Frame(lineAt + 70, 1280, 720);
 assert(offsets.size() == (expectPosition ? 1 : 0));
 if (expectPosition) {
  assert(offsets.front().find("hidden=1 ") != std::string::npos);
  assert(offsets.front().find("n=17 rects=386,656,32,32;") != std::string::npos);
  assert(offsets.front().find(";834,656,32,32 text=") != std::string::npos);
 }
}

enum class BodyStart { Learned, Initial, BoxTiles };

static void BodyWithUntracedCells(GlyphLearner &g, bool atlasRun, bool expectClean, BodyStart start = BodyStart::Learned) {
 const bool initial = start == BodyStart::Initial;
 const std::string prefix = initial ? "ToMe_CHARS engine=gpu line=1 " : "ToMe_CHARS engine=gpu line=2 ";
 std::vector<std::string> offsets;
 g.emit = [&](const std::string &r) { if (r.find(prefix) == 0) offsets.push_back(r); };
 auto draw = [&](const std::vector<Quad> &q, unsigned now) {
  return g.Draw((void *)1, 1024, 2048, nullptr, 1280, 720, 1280, 720, q, now);
 };
 if (!initial) {
  auto prior = Row(11, 470, 656, 32, 0.15f);
  for (unsigned i = 0; i < prior.size(); i++) prior[i].glyph = i + 1;
  g.Line(L"ABCDEFGHIJK", 10000);
  draw(prior, 10001);
  g.Frame(10002, 1280, 720);
 }

 auto row = Row(23, 302, 656, 32, 0);
 for (unsigned i = 0; i < row.size(); i++) {
  auto &q = row[i];
  q.u0 = ((i + 1) % 14) * 72.f / 1024;
  q.v0 = ((i + 1) / 14) * 72.f / 2048;
  q.u1 = q.u0 + 32.f / 1024;
  q.v1 = q.v0 + 32.f / 2048;
  q.glyph = i == 1 || i == 8 || i >= 19 ? 0 : i + 12;
 }
 if (!atlasRun) {
  row[8].u0 += 4.f / 1024;
  row[8].u1 += 4.f / 1024;
 }
 const Quad spacer{ 276, 616, 280, 620, 0, 0, 4.f / 1024, 4.f / 2048, 0 };
 g.Line(L"ABCDEFGHIJKLMNOPQRSTUVW", 15000);
 if (initial) {
  // The very first complete frame has all the body glyphs and the same-atlas spacer.
  row.push_back(spacer);
  assert(draw(row, 15001).empty());
  g.Frame(15002, 1280, 720);
  assert(offsets.size() == (expectClean ? 1 : 0));
  const auto dropped = draw(row, 15017);
  g.Frame(15018, 1280, 720);
  assert(dropped.size() == (expectClean ? 23 : 0));
  assert(offsets.size() == (expectClean ? 2 : 0));
  if (expectClean) {
   assert(offsets.back().find(prefix + "hidden=1 ") == 0);
   assert(offsets.back().find("n=23 rects=302,656,32,32;") != std::string::npos);
   assert(offsets.back().find(";918,656,32,32 text=") != std::string::npos);
  }
  return;
 }
 if (start == BodyStart::BoxTiles) {
  g.Frame(15000, 1280, 720);
  g.Frame(15001, 1280, 720);
  std::vector<Quad> tiles;
  for (int i = 0; i < 7; i++) {
   const float x = 276.f + 28 * i, u = i / 32.f;
   tiles.push_back({ x, 616, x + 28, 644, u, 0, u + 28.f / 1280, 28.f / 720, 0 });
   const float mid = i ? x - 2 : x;
   tiles.push_back({ mid, 644, mid + 32, 688, u, 0.1f, u + 32.f / 1280, 0.1f + 44.f / 720, 0 });
   tiles.push_back({ x, 686, x + 28, 714, u, 0.2f, u + 28.f / 1280, 0.2f + 28.f / 720, 0 });
  }
  assert(g.Draw((void *)2, 1280, 720, nullptr, 1280, 720, 1280, 720, tiles, 15002).empty());
  draw({ row[6], row[7] }, 15002);
 } else {
  std::vector<Quad> partial(row.begin(), row.end() - 1);
  partial.push_back(spacer);
  draw(partial, 15002);
 }
 g.Frame(15003, 1280, 720);
 assert(offsets.size() == (expectClean ? 0 : 1));

 row.push_back(spacer);
 draw(row, 15017);
 g.Frame(15018, 1280, 720);
 assert(offsets.size() == 1);
 assert(offsets.front().find(prefix + "hidden=1 ") == 0);
 const char *legacyStart = start == BodyStart::BoxTiles ? "n=23 rects=276,616,28,28;" : "n=23 rects=276,616,4,4;";
 assert(offsets.front().find(expectClean ? "n=23 rects=302,656,32,32;" : legacyStart) != std::string::npos);
 if (expectClean) assert(offsets.front().find(";918,656,32,32 text=") != std::string::npos);
}

static void RetainedDialogueRows() {
 Littlecheese::Rows rows;
 unsigned now = 1000;
 auto draw = [&](const std::wstring &text, int y, int x, bool hide) {
  for (wchar_t ch : text) {
   assert(rows.Draw(1, ch, x, y, 20, 20, now, hide) == hide);
   x += 20; now += 94;
  }
 };
 draw(L"社会からの脱落。", 468, 266, true);
 draw(L"それを", 494, 266, true);
 assert(rows.Claim(L"違う文章", now).cells.empty());
 auto first = rows.Claim(L"社会からの脱落。", now);
 assert(first.hidden && first.cells.size() == 8);
 for (const auto &c : first.cells) assert(c.y == 468);
 draw(L"皮肉っぽく嘲笑うみたいな言葉。", 494, 326, true);
 auto second = rows.Claim(L"それを皮肉っぽく嘲笑うみたいな言葉。", now);
 assert(second.hidden && second.cells.size() == 18 && second.page == first.page);
 for (const auto &c : second.cells) assert(c.y == 494);
 assert(rows.Claim(L"社会からの脱落。", now).cells.empty());
 draw(L"はい。", 468, 266, true);
 draw(L"はい。", 494, 266, true);
 assert(rows.Claim(L"はい。", now).cells.front().y == 468);
 assert(rows.Claim(L"はい。", now).cells.front().y == 494);

 // A mid-row enable cannot turn a partially visible row into a hidden one.
 draw(L"新", 468, 266, false);
 assert(!rows.Draw(1, L'文', 286, 468, 20, 20, ++now, true));
 assert(!rows.Claim(L"新文", now).hidden);
 draw(L"次", 494, 266, true);
 assert(!rows.Draw(1, L'へ', 286, 494, 20, 20, ++now, false));
 auto mixed = rows.Claim(L"次へ", now);
 assert(!mixed.hidden && mixed.cells[0].hidden && !mixed.cells[1].hidden);
 assert(mixed.page > first.page);
 draw(L"旧", 468, 266, true);
 draw(L"新", 468, 266, true);
 assert(rows.Claim(L"旧", now + 12001).cells.empty());
 assert(rows.Claim(L"新", now + 12001).cells.empty());
 draw(L"別", 468, 266, true);
 auto prior = rows.Claim(L"別", now);
 assert(rows.Draw(2, L'新', 286, 494, 20, 20, ++now, true));
 assert(rows.Claim(L"新", now).page > prior.page);
}

static void Sact2DialogueScope() {
 Sact2::Glyph line[] = {
  {54,6,0x7981},{74,6,0x6c97},{94,6,0x7a81},
  {54,36,0x7581},{78,36,0x718d},{54,62,0x9c82},{54,88,0x7681}
 };
 const size_t count = sizeof line / sizeof line[0];
 assert(Sact2::DrawCount(true, 3, 355, line, count) == 3);
 assert(Sact2::DrawCount(false, 3, 355, line, count) == count);
 assert(Sact2::DrawCount(true, 0, 0, line, count) == count); // backlog reuses the words
 assert(Sact2::DrawCount(true, 30, 4, line, count) == count); // map label
 line[0] = {62,58,0x4081};
 assert(Sact2::DrawCount(true, 3, 355, line, count) == count); // reward uses the same draw origin
 line[0] = {54,6,0x7981};
 line[3].code = 0x4081;
 assert(Sact2::DrawCount(true, 3, 355, line, count) == count);
 line[3].code = 0x7781;
 assert(Sact2::DrawCount(true, 3, 355, line, count) == 3);
 line[3].code = 0x6981; // （
 assert(Sact2::DrawCount(true, 3, 355, line, count) == 3);
 assert(Sact2::DrawCount(true, 3, 355, line + 4, count - 4) == count - 4);
 line[3].code = 0x738a;
 assert(Sact2::DrawCount(true, 3, 355, line + 3, count - 3) == 0); // nameless message
 line[6].y = 112;
 assert(Sact2::DrawCount(true, 3, 355, line, count) == count);

 Sact2::Glyph bubble[] = {
  {36,14,0x4383},{50,14,0x4a83},{64,14,0x5b81},{78,14,0x5b81},{92,14,0x5b81},{106,14,0x5b81},
  {36,30,0x4383},{50,30,0x4a83},{64,30,0x4a83},{78,30,0x4a83},{92,30,0x5b81},{106,30,0x5b81}
 };
 assert(Sact2::DrawCount(true, 240, 2, bubble, 12) == 0);
 assert(Sact2::DrawCount(true, 240, 143, bubble, 12) == 0);
 assert(Sact2::DrawCount(false, 240, 143, bubble, 12) == 12);
 assert(Sact2::DrawCount(true, 89, 462, bubble, 12) == 12); // action ticker
 assert(Sact2::DrawCount(true, 380, 147, bubble, 12) == 12); // attack menu
 bubble[1].x++;
 assert(Sact2::DrawCount(true, 240, 143, bubble, 12) == 12);
}

int main() {
 GlyphLearner g;
 g.Line(L"これは会話です。", 100);
 g.Preset(24, 640, 480);
 GlyphLearner::PPos p{ {60,400,84,424},100,0,0,-1,true };
 assert(!g.PageHidden(p)); // a newly drawn menu glyph is not dialogue evidence
 p.line=-2; assert(!g.PageHidden(p));
 p.line=1; assert(g.PageHidden(p)); // confirmed dialogue still hides
 g.readOnly=true; assert(!g.PageHidden(p));g.readOnly=false;
 g.texRt=true;g.pageRtW=640;g.pageRtH=480;
 g.plines.back().claimed=8;
 Quad q{60,400,84,424,0,0,.1f,.1f,0};bool leave=true;
 assert(!g.PageQuad(q,(void*)1,128,128,nullptr,800,600,110,&leave)&&!leave);
 // A sheet may also draw an unrelated menu/ruby size: no nearby claimed character, no hiding.
 g.sheetNow.insert((void*)1);q.y0=20;q.y1=32;
 assert(g.PageQuad(q,(void*)1,128,128,nullptr,640,480,110,&leave)&&!leave);
 g.Off(); assert(!g.PageHidden(p));
 // Ordinary matched atlas dialogue is still hidden, while a button outside its box is kept.
 g.Line(L"これは会話です。",200);g.texRt=false;g.learned=true;g.areaW=640;g.areaH=480;
 g.area={40,380,400,450};g.glyphH=24;g.atlases.insert(g.GroupKey(nullptr,(void*)1));
 q={60,400,84,424,0,0,.1f,.1f,0};Quad button=q;button.y0=20;button.y1=44;
 auto drop=g.Draw((void*)1,128,128,nullptr,640,480,640,480,{q,button},210);
 assert(drop.size()==1&&drop[0]==0);
 g.readOnly=true;assert(g.Draw((void*)1,128,128,nullptr,640,480,640,480,{q},211).empty());
 { GlyphLearner learner; KeepSharedAtlasNameplate(learner); }
 for (bool separateTarget : {true, false}) {
  GlyphLearner learner;
  KeepSeparateAtlasNameplate(learner, separateTarget);
 }
 MovingBox();
 RecoverStaleToolbar();
 ConfirmBodyBeforeMenu();
 KeepCachedBand();
 KeepOccupiedBand();
 IgnoreOldAtlasFrame();
 KeepBandOnItsTarget();
 IgnoreTraceFromOldFrame();
 ReportNewLineWithLateScaledCopy();
 KeepCenteredBandWhileTyping();
 for (auto test : { BodyRecheckCase::Centered, BodyRecheckCase::Moved, BodyRecheckCase::Partial,
                     BodyRecheckCase::Disabled, BodyRecheckCase::ReadOnly }) {
  GlyphLearner learner;
  if (test != BodyRecheckCase::Disabled) learner.bodyRecheck = true;
  CenteredDialogueWithSpacer(learner, test);
 }
 for (auto geometry : { TailGeometry::OnPitch, TailGeometry::OffPitch, TailGeometry::InteriorGap }) {
  GlyphLearner learner;
  learner.bodyRecheck = true;
  BottomDialogueWithUntracedTail(learner, geometry, true);
 }
 GlyphLearner disabled;
 BottomDialogueWithUntracedTail(disabled, TailGeometry::OnPitch, false);
 GlyphLearner combinedAtlas;
 combinedAtlas.bodyRecheck = true;
 BottomDialogueWithUntracedTail(combinedAtlas, TailGeometry::OnPitch, true, true);
 GlyphLearner combinedAtlasDisabled;
 BottomDialogueWithUntracedTail(combinedAtlasDisabled, TailGeometry::OnPitch, false, true);
 for (bool enabled : {false, true}) {
  GlyphLearner visible;
  visible.bodyRecheck = enabled;
  VisibleThenHiddenDialogue(visible, enabled);
  for (auto timing : { RewriteTiming::AfterLine, RewriteTiming::BeforeLine, RewriteTiming::Stale }) {
   GlyphLearner rewritten;
   rewritten.bodyRecheck = enabled;
   RewrittenBodyAtlas(rewritten, timing, enabled && timing != RewriteTiming::Stale);
  }
  for (bool atlasRun : {false, true}) {
   GlyphLearner untraced;
   untraced.bodyRecheck = enabled;
   BodyWithUntracedCells(untraced, atlasRun, enabled && atlasRun);
   GlyphLearner initial;
   initial.bodyRecheck = enabled;
   BodyWithUntracedCells(initial, atlasRun, enabled && atlasRun, BodyStart::Initial);
  }
  GlyphLearner tiled;
  tiled.bodyRecheck = enabled;
  BodyWithUntracedCells(tiled, true, enabled, BodyStart::BoxTiles);
 }
 RetainedDialogueRows();
 Sact2DialogueScope();
 puts("PASS dialogue scope: unclaimed title/menu, foreign target, unmatched ruby kept; confirmed dialogue hides; read/OFF restore");
}
