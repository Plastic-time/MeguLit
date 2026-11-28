// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once

#include "ReplayCases.h"

// Synthetic: old text stays on the page while a new row arrives. Only small
// glyphs above either row are ruby; the distant same-size glyph is UI.
static void MagesRetainedRows(ReplayFixture &g) {
 const auto old = TracedRow(4, 60, 376, 24, 0.125f, 1);
 const auto next = TracedRow(4, 60, 408, 24, 0.25f, 5);
 auto draw = [&](const std::vector<Quad> &quads, unsigned tick) {
  g.Draw((void *)1, 1024, 2048, nullptr, 640, 480, 640, 480, quads, tick);
 };
 g.Line(L"ABCD", 10000);
 draw(old, 10210);
 g.Frame(10211, 640, 480);
 draw(old, 10226);
 g.Frame(10227, 640, 480);

 g.Line(L"EFGH", 11000);
 // The old row is still in the freshness window and has the new row's length.
 draw(old, 11001);
 g.Frame(11002, 640, 480);
 auto page = old;
 page.insert(page.end(), next.begin(), next.end());
 draw(page, 11017);
 g.Frame(11018, 640, 480);

 auto ruby = Row(1, 64, 355, 12, 0.375f);
 ruby.push_back(Row(1, 92, 387, 12, 0.5f).front());
 ruby.push_back(Row(1, 440, 355, 12, 0.625f).front());
 draw(ruby, 11033);
 g.Frame(11034, 640, 480);
}

// Synthetic: same-size fill and shadow targets have separate atlases. A
// concatenated page redraw arrives twice in one source event and uses a new atlas.
static void NitroTargetsAndRedraw(ReplayFixture &g) {
 void *fill = (void *)10, *shadow = (void *)20;
 const std::vector<Quad> surface{{0, 0, 640, 480, 0, 0, 1, 1, 0}};
 g.Composite(fill, surface);
 g.Composite(shadow, surface);
 const auto line = TracedRow(4, 100, 400, 24, 0.125f, 1);
 auto effect = line;
 for (auto &q : effect) { q.x0 += 2; q.x1 += 2; q.y0 += 2; q.y1 += 2; }
 auto draw = [&](void *atlas, void *target, const std::vector<Quad> &q, unsigned tick) {
  g.Draw(atlas, 1024, 1024, target, 640, 480, 640, 480, q, tick);
 };

 g.Line(L"ABCD", 10000);
 draw((void *)1, fill, line, 10001);
 draw((void *)2, shadow, effect, 10001);
 g.Frame(10002, 640, 480);
 draw((void *)1, fill, line, 10017);
 draw((void *)2, shadow, effect, 10017);
 draw((void *)3, shadow, effect, 10017); // aligned but unlearned atlas
 g.Frame(10018, 640, 480);

 g.Line(L"EFGHABCD    EFGHABCD", 12000);
 auto page = TracedRow(4, 100, 372, 24, 0.25f, 5);
 page.insert(page.end(), line.begin(), line.end());
 draw((void *)4, fill, page, 12001);
 g.Frame(12002, 640, 480);
 draw((void *)4, fill, page, 15001); // beyond the redraw window
 g.Frame(15002, 640, 480);
}

// Synthetic: a whole retained page is drawn again from a fresh glyph sheet.
// Both lines keep their places and the unclaimed same-size menu glyph is visible.
static void NitroRetainedPage(ReplayFixture &g) {
 g.Preset(24, 640, 480, false);
 g.texRt = true;
 auto draw = [&](void *atlas, const std::vector<Quad> &quads, unsigned tick) {
  g.Draw(atlas, 256, 256, nullptr, 640, 480, 640, 480, quads, tick);
 };
 auto page = TracedRow(4, 100, 360, 24, 0.125f, 1);
 g.Line(L"ABCD", 10000);
 draw((void *)1, page, 10001);
 g.Frame(10002, 640, 480);

 const auto second = TracedRow(4, 100, 400, 24, 0.25f, 5);
 page.insert(page.end(), second.begin(), second.end());
 page.push_back(Row(1, 440, 430, 24, 0.375f).front());
 g.Line(L"EFGH", 11000);
 draw((void *)1, page, 11001);
 g.Frame(11002, 640, 480);
 draw((void *)2, page, 11017);
 g.Frame(11018, 640, 480);
}

// Synthetic: the GPU sees a visible text window without receiving a LINE.
// The placement replay consumes this real ToMe_PAGE with both write-back states.
static void SoftPalUnarmedPage(ReplayFixture &g) {
 g.Preset(24, 1280, 720, false);
 g.texRt = true;
 g.Draw((void *)1, 256, 256, nullptr, 1280, 720, 1280, 720, Row(4, 120, 400, 24, 0.125f), 10000);
 g.Frame(10001, 1280, 720);
}

static const FixtureCase EngineGpuFixtures[] = {
 {L"mages", MagesRetainedRows},
 {L"nitro-targets", NitroTargetsAndRedraw},
 {L"nitro-page", NitroRetainedPage},
 {L"softpal", SoftPalUnarmedPage},
};
