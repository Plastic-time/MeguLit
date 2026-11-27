// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
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

static std::vector<Quad> TracedRow(unsigned count, float left, float top, float height, float v, unsigned glyph) {
 auto row = Row(count, left, top, height, v);
 for (Quad &q : row) q.glyph = glyph++;
 return row;
}

template <class Learner> static void KeepSharedAtlasNameplate(Learner &g) {
 std::vector<std::string> placements;
 const auto emit = g.emit;
 g.emit = [&](const std::string &r) {
  if (emit) emit(r);
  if (r.rfind("ToMe_CHARS ", 0) == 0) placements.push_back(r);
 };
 auto draw = [&](const std::vector<Quad> &quads, unsigned now) {
  return g.Draw((void *)1, 1024, 2048, nullptr, 1280, 720, 1280, 720, quads, now);
 };
 const auto body = TracedRow(5, 400, 400, 24, 0.1f, 1);
 // The plate shares both the atlas and the row cluster, with its centres just above the learned band.
 const auto name = TracedRow(5, 400, 355, 24, 0.2f, 6);
 const std::vector<int> hiddenBody{0, 1, 2, 3, 4};
 const char *bodyRects =
  " n=5 rects=400,400,24,24;428,400,24,24;456,400,24,24;484,400,24,24;512,400,24,24 text=";
 g.Line(L"ABCDE", 10000);
 assert(draw(body, 10001).empty());
 g.Frame(10002, 1280, 720);
 assert(placements.size() == 1 && placements.back().find(" line=1 hidden=0 ") != std::string::npos);
 assert(placements.back().find(bodyRects) != std::string::npos);

 assert(draw(body, 10017) == hiddenBody);
 assert(draw(name, 10017).empty());
 g.Frame(10018, 1280, 720);
 assert(placements.size() == 2 && placements.back().find(" line=1 hidden=1 ") != std::string::npos);
 assert(placements.back().find(bodyRects) != std::string::npos);

 assert(draw(name, 10035).empty());
 g.Frame(10036, 1280, 720);
 assert(placements.size() == 2 && g.area.y0 == 376 && g.area.y1 == 472);
 assert(draw(body, 10053) == hiddenBody);
 assert(draw(name, 10053).empty());
 g.emit = emit;
 puts("PASS Siglus shared-atlas nameplate");
}

template <class Learner> static void KeepSeparateAtlasNameplate(Learner &g, bool separateTarget) {
 std::vector<std::string> placements;
 const auto emit = g.emit;
 g.emit = [&](const std::string &r) {
  if (emit) emit(r);
  if (r.rfind("ToMe_CHARS ", 0) == 0) placements.push_back(r);
 };
 void *dialogueTarget = (void *)10, *nameTarget = separateTarget ? (void *)20 : dialogueTarget;
 void *dialogueAtlas = (void *)1, *nameAtlas = (void *)2, *iconAtlas = (void *)3;
 const std::vector<Quad> composite{{0, 0, 1280, 720, 0, 0, 1, 1, 0}};
 g.Composite(dialogueTarget, composite);
 if (separateTarget) g.Composite(nameTarget, composite); // The foreign target also has valid screen coordinates.
 auto draw = [&](void *rt, void *atlas, const std::vector<Quad> &quads, unsigned now) {
  return g.Draw(atlas, 1024, 2048, rt, 640, 360, 1280, 720, quads, now);
 };
 const auto first = TracedRow(5, 100, 250, 24, 0.1f, 1);
 const auto next = TracedRow(5, 100, 250, 24, 0.2f, 6);
 const auto name = TracedRow(5, 100, 175, separateTarget ? 24.0f : 20.0f, 0.3f, 11);
 const std::vector<int> hiddenBody{0, 1, 2, 3, 4};
 if (!separateTarget) {
  draw(nameTarget, nameAtlas, name, 6500);
  g.Frame(6501, 1280, 720);
 }

 g.Line(L"ABCDE", 10000);
 assert(draw(dialogueTarget, dialogueAtlas, first, 10001).empty());
 g.Frame(10002, 1280, 720);
 assert(draw(dialogueTarget, dialogueAtlas, first, 10017) == hiddenBody);
 g.Frame(10018, 1280, 720);
 assert(placements.size() == 2 && placements.back().find(" line=1 hidden=1 ") != std::string::npos);
 const auto originalBand = g.area;

 g.Line(L"FGHIJ", 15000);
 assert(draw(nameTarget, nameAtlas, name, 15001).empty());
 // The cached plate and its icon are six quads when the target's atlas pages are counted together.
 if (!separateTarget) assert(draw(nameTarget, iconAtlas, Row(1, 240, 175, 20, 0.4f), 15001).empty());
 g.Frame(15002, 1280, 720);
 assert(draw(nameTarget, nameAtlas, name, 15017).empty());
 assert(placements.size() == 2 && g.areaRt == dialogueTarget);
 assert(g.area.x0 == originalBand.x0 && g.area.x1 == originalBand.x1);
 assert(g.area.y0 == originalBand.y0 && g.area.y1 == originalBand.y1);

 assert(draw(dialogueTarget, dialogueAtlas, next, 15017) == hiddenBody);
 g.Frame(15018, 1280, 720);
 assert(placements.size() == 3 && placements.back().find(" line=2 hidden=1 ") != std::string::npos);
 const char *bodyRects =
  " n=5 rects=200,500,48,48;256,500,48,48;312,500,48,48;368,500,48,48;424,500,48,48 text=";
 assert(placements.back().find(bodyRects) != std::string::npos);
 assert(draw(nameTarget, nameAtlas, name, 15035).empty());
 g.emit = emit;
 puts(separateTarget ? "PASS CatSystem2 nameplate on a separate target" : "PASS AdvHD cached nameplate");
}
