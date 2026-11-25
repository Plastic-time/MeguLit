// SPDX-License-Identifier: GPL-3.0-or-later
#include "../GlyphQuads.h"
#include <assert.h>

static std::vector<Quad> Row(unsigned count, float left, float top, float height, float v) {
 std::vector<Quad> row;
 for (unsigned i = 0; i < count; i++) {
  float x = left + 28 * i, u = i / 32.0f;
  row.push_back({ x, top, x + height, top + height, u, v, u + height / 1024, v + height / 2048, i * 4 });
 }
 return row;
}

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
 g.area={40,380,400,450};g.glyphH=24;g.atlases.insert(GlyphLearner::AtlasKey(nullptr,(void*)1));
 q={60,400,84,424,0,0,.1f,.1f,0};Quad button=q;button.y0=20;button.y1=44;
 auto drop=g.Draw((void*)1,128,128,nullptr,640,480,640,480,{q,button},210);
 assert(drop.size()==1&&drop[0]==0);
 g.readOnly=true;assert(g.Draw((void*)1,128,128,nullptr,640,480,640,480,{q},211).empty());
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
 puts("PASS dialogue scope: unclaimed title/menu, foreign target, unmatched ruby kept; confirmed dialogue hides; read/OFF restore");
}
