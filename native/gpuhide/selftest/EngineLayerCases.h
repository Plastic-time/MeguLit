// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once

#include "ReplayCases.h"
#include "../LittlecheeseRows.h"
#include "../Sact2Dialogue.h"
#include "../../fontprobe/GlyphMatch.h"

// The built-in synthetic cases use v1 draw batches for measured glyph cells.
// Glyph is a synthetic character token (or a SACT2 layout code), not texture data.
static std::vector<Quad> GlyphCells(const std::wstring &text, float left, float top, float height) {
 auto cells = Row((unsigned)text.size(), left, top, height, 0);
 for (size_t i = 0; i < cells.size(); ++i) cells[i].glyph = text[i];
 return cells;
}

static void RecordCells(GpuReplay::Tape &tape, const std::vector<Quad> &cells, unsigned tick) {
 ReplayFixture::Recorded(tape.Draw((void *)1, 32, 32, nullptr, 800, 600, 800, 600, false, cells, tick));
}

// Synthetic: replacement is armed before the first source callback. A second
// retained row already has pixels when the first row is claimed.
static void CaptureLittlecheese(GpuReplay::Tape &tape) {
 ReplayFixture::Recorded(tape.Mode(false));
 // The first source line allocates these same three tokens in order.
 RecordCells(tape, GlyphCells(L"\ue000\ue001\ue002", 100, 400, 24), 10000);
 RecordCells(tape, GlyphCells(L"\ue000\ue001\ue002", 100, 430, 24), 10010);
 ReplayFixture::Recorded(tape.Line(L"ABC", 10020));
 ReplayFixture::Recorded(tape.Line(L"ABC", 10030));
 ReplayFixture::Recorded(tape.Mode(true));
 RecordCells(tape, GlyphCells(L"\ue000\ue001\ue002", 100, 460, 24), 10040);
 ReplayFixture::Recorded(tape.Line(L"ABC", 10050));
}

static std::string PlayLittlecheese(const std::vector<GpuReplay::Call> &calls) {
 Littlecheese::Rows rows;
 ReplayOutput out;
 bool hide = false;
 for (const auto &call : calls) {
  switch (call.op) {
  case 'M': hide = !call.flag; break;
  case 'D': {
   std::vector<int> drop;
   for (size_t i = 0; i < call.quads.size(); ++i) {
    const auto &q = call.quads[i];
    if (rows.Draw(reinterpret_cast<uintptr_t>(call.tex), (wchar_t)q.glyph, (int)q.x0, (int)q.y0,
                  (int)(q.x1 - q.x0), (int)(q.y1 - q.y0), call.tick, hide))
     drop.push_back((int)i);
   }
   out.Mask(drop);
   break;
  }
  case 'L': {
   const auto line = rows.Claim(call.text, call.tick);
   std::string result = "CLAIM page=" + std::to_string(line.page) + " hidden=" + (line.hidden ? "1" : "0");
   for (const auto &cell : line.cells)
    result += " " + std::to_string(cell.x) + "," + std::to_string(cell.y) + "," + std::to_string(cell.w) + "," + std::to_string(cell.h);
   out.Message(result);
   break;
  }
  }
 }
 return out.rows.str();
}

// Synthetic: feed the resolved draw permission and sprite origin separately.
// The disabled draw is a manually selected non-dialogue stream. The story draw
// uses the selected dialogue stream; the battle phase uses the automatic stream.
static void CaptureSact2(GpuReplay::Tape &tape) {
 const std::vector<Quad> story = [] {
  std::vector<Quad> q;
  const Sact2::Glyph glyphs[] = {{54, 6, 0x7981}, {74, 6, 'A'}, {94, 6, 0x7a81},
                                {54, 36, 0x7581}, {74, 36, 'B'}, {54, 62, 'C'}};
  for (const auto &g : glyphs)
   q.push_back({(float)g.x, (float)g.y, (float)g.x + 20, (float)g.y + 20, 0, 0, 0, 0, 0, 0, false, g.code});
  return q;
 }();
 auto bubble = GlyphCells(L"ABCDEF", 36, 14, 14);
 auto lower = GlyphCells(L"FEDCBA", 36, 30, 14);
 for (size_t i = 0; i < bubble.size(); ++i) {
  bubble[i].x0 = lower[i].x0 = 36 + 14.0f * i;
  bubble[i].x1 = lower[i].x1 = bubble[i].x0 + 14;
 }
 bubble.insert(bubble.end(), lower.begin(), lower.end());
 auto draw = [&](float x, float y, const std::vector<Quad> &quads, unsigned tick) {
  ReplayFixture::Recorded(tape.Composite((void *)1, {{x, y, x + 1, y + 1, 0, 0, 1, 1, 0}}));
  RecordCells(tape, quads, tick);
 };

 ReplayFixture::Recorded(tape.Mode(true));
 draw(3, 355, story, 10000);
 ReplayFixture::Recorded(tape.Mode(false));
 draw(3, 355, story, 10010);
 draw(0, 0, story, 10020); // backlog
 ReplayFixture::Recorded(tape.Mode(true));
 draw(240, 143, bubble, 10030);
 ReplayFixture::Recorded(tape.Mode(false));
 draw(240, 143, bubble, 10040);
 draw(380, 147, bubble, 10050); // attack menu
 bubble[1].x0 += 1;
 draw(240, 143, bubble, 10060); // wrong grid at a valid anchor
}

static std::string PlaySact2(const std::vector<GpuReplay::Call> &calls) {
 ReplayOutput out;
 bool hide = false;
 int x = 0, y = 0;
 for (const auto &call : calls) {
  if (call.op == 'M') hide = !call.flag;
  if (call.op == 'C') {
   x = (int)call.quads.at(0).x0;
   y = (int)call.quads.at(0).y0;
  }
  if (call.op != 'D') continue;
  std::vector<Sact2::Glyph> glyphs;
  for (const auto &q : call.quads) glyphs.push_back({(int)q.x0, (int)q.y0, q.glyph});
  const size_t keep = Sact2::DrawCount(hide, x, y, glyphs.data(), glyphs.size());
  std::vector<int> drop;
  for (size_t i = keep; i < glyphs.size(); ++i) drop.push_back((int)i);
  out.Mask(drop);
 }
 return out.rows.str();
}

// Synthetic: completed dialogue, two options in the same font, then a redraw.
// The first reused glyph in the option burst is still blanked on current main.
static void CaptureNexas(GpuReplay::Tape &tape) {
 ReplayFixture::Recorded(tape.Line(L"ABCDEFGH", 10000));
 const auto line = tape.calls.back().text;
 RecordCells(tape, GlyphCells(line, 100, 400, 30), 10100);
 RecordCells(tape, GlyphCells({line[5], line[2], line[4], line[3]}, 100, 400, 30), 12000);
 RecordCells(tape, GlyphCells({line[1], line[6], line[5], line[2]}, 100, 440, 30), 12000);
 ReplayFixture::Recorded(tape.Frame(12400, 800, 600));
 RecordCells(tape, GlyphCells(line, 100, 400, 30), 13000);
}

static std::string PlayNexas(const std::vector<GpuReplay::Call> &calls) {
 ReplayOutput out;
 GlyphHide::Matcher match;
 const GlyphHide::Key font{L"Synthetic", 30};
 match.Seed(font);
 match.AfterLineNew = true;
 match.Report = [&](const std::string &message) { out.Message(message); };
 for (const auto &call : calls) {
  switch (call.op) {
  case 'L': match.SetLine(call.text, call.tick); break;
  case 'F': match.Tick(call.tick); out.EndFrame(); break;
  case 'D': {
   std::vector<int> drop;
   for (size_t i = 0; i < call.quads.size(); ++i)
    if (match.Glyph((wchar_t)call.quads[i].glyph, font, call.tick, true, "ggo"))
     drop.push_back((int)i);
   out.Mask(drop);
   break;
  }
  }
 }
 return out.rows.str();
}

struct LayerFixture {
 const wchar_t *name;
 void (*record)(GpuReplay::Tape &);
 std::string (*replay)(const std::vector<GpuReplay::Call> &);
};
static const LayerFixture EngineLayerFixtures[] = {
 {L"littlecheese", CaptureLittlecheese, PlayLittlecheese},
 {L"sact2", CaptureSact2, PlaySact2},
 {L"nexas", CaptureNexas, PlayNexas},
};
