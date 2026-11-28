// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include "../GlyphReplay.h"
#include "NameplateCases.h"
#include <sstream>
#include <stdexcept>

struct ReplayOutput {
 std::ostringstream rows;
 unsigned frame = 0, batch = 0;

 void Message(const std::string &message) { rows << message << '\n'; }
 void Mask(const std::vector<int> &drop) {
  rows << "MASK " << frame << '.' << batch++;
  for (int index : drop) rows << ' ' << index;
  rows << '\n';
 }
 void EndFrame() {
  ++frame;
  batch = 0;
 }
};

// This path calls the native learner directly, with the same sanitized characters as the tape.
struct ReplayFixture : GlyphLearner {
 GpuReplay::Tape tape;
 ReplayOutput output;

 ReplayFixture() { emit = [&](const std::string &r) { output.Message(r); }; }
 static void Recorded(bool ok) { if (!ok) throw std::runtime_error("synthetic event could not be recorded"); }
 void Line(const std::wstring &text, unsigned tick) {
  Recorded(tape.Line(text, tick));
  GlyphLearner::Line(tape.calls.back().text, tick);
 }
 std::vector<int> Draw(void *tex, unsigned tw, unsigned th, void *rt, unsigned rw, unsigned rh,
                       unsigned bw, unsigned bh, const std::vector<Quad> &q, unsigned tick) {
  Recorded(tape.Draw(tex, tw, th, rt, rw, rh, bw, bh, texRt, q, tick));
  auto mask = GlyphLearner::Draw(tex, tw, th, rt, rw, rh, bw, bh, q, tick);
  output.Mask(mask);
  return mask;
 }
 void Composite(void *texture, const std::vector<Quad> &q) {
  Recorded(tape.Composite(texture, q));
  GlyphLearner::Composite(texture, q);
 }
 void Frame(unsigned tick, unsigned w, unsigned h) {
  Recorded(tape.Frame(tick, w, h));
  GlyphLearner::Frame(tick, w, h);
  output.EndFrame();
 }
 void Mode(bool read) {
  Recorded(tape.Mode(read));
  readOnly = read;
 }
 void Preset(float gh, unsigned w, unsigned h, bool blanks) {
  Recorded(tape.Preset(gh, w, h, blanks));
  GlyphLearner::Preset(gh, w, h);
  if (blanks) pageBlankQuads = true;
 }
 void Off() {
  Recorded(tape.Off());
  GlyphLearner::Off();
 }
};

enum class AoitoriLayout { Centered, Moved, Partial };

// Synthetic bubble draws from the Aoitori scope tests. The shared learner's current
// outputs are captured here, including an early placement that the CMVS patch corrects.
static void AoitoriCase(ReplayFixture &g, AoitoriLayout layout) {
 const bool partial = layout == AoitoriLayout::Partial;
 const bool centered = layout == AoitoriLayout::Centered;
 const float top = layout == AoitoriLayout::Moved ? 656.0f : 334.0f;
 const auto retained = Row(4, 568, 334, 4, 0.6f);
 auto draw = [&](const std::vector<Quad> &q, unsigned now) {
  if (centered) g.Draw((void *)3, 1024, 2048, nullptr, 1280, 720, 1280, 720, retained, now);
  return g.Draw((void *)1, 1024, 2048, nullptr, 1280, 720, 1280, 720, q, now);
 };
 const auto old = TracedRow(4, partial ? 900.0f : 568.0f, 334, 32, 0.1f, 1);
 g.Line(L"ABCD", 10000);
 draw(old, 10001);
 g.Frame(10002, 1280, 720);
 draw(old, 10003);
 g.Frame(10004, 1280, 720);

 auto next = TracedRow(14, 428, top, 32, 0.2f, 5);
 const float spacerTop = top - (partial ? 40.0f : 20.0f);
 next.push_back({402, spacerTop, 406, spacerTop + 4, 0, 0, 4.f / 1024, 4.f / 2048, 0});
 const auto name = TracedRow(4, 84, 160, 32, 0.4f, 20);
 next.insert(next.end(), name.begin(), name.end());
 g.Line(L"EFGHIJKLMNOPQR", 15000);
 if (partial) {
  const std::vector<Quad> tiles{
   {402, 294, 430, 322, 0, 0, 28.f / 1280, 28.f / 720, 0},
   {402, 322, 430, 364, 0, 0, 28.f / 1280, 42.f / 720, 0},
   {402, 364, 430, 392, 0, 0, 28.f / 1280, 28.f / 720, 0},
  };
  std::vector<Quad> prefix(next.begin(), next.begin() + 11);
  prefix.push_back(next[14]);
  g.Draw((void *)2, 1280, 720, nullptr, 1280, 720, 1280, 720, tiles, 15001);
  draw(prefix, 15001);
  g.Frame(15002, 1280, 720);
 }
 draw(next, 15005);
 g.Frame(15006, 1280, 720);
 draw(next, 15017);
 g.Frame(15018, 1280, 720);
 draw(next, 15034);
 g.Frame(15035, 1280, 720);

 if (centered) {
  g.Line(L"STUVWXYZABCDEF", 20000);
  draw(next, 20001);
  for (Quad &q : next) { q.v0 += 0.1f; q.v1 += 0.1f; }
  draw(next, 20001);
  g.Frame(20002, 1280, 720);
 }
}

struct FixtureCase {
 const wchar_t *name;
 void (*run)(ReplayFixture &);
};
static const std::string FirstNameplateLine = GlyphLearner::Utf8(L"\ue000\ue001\ue002\ue003\ue004");
static const std::string SecondNameplateLine = GlyphLearner::Utf8(L"\ue005\ue006\ue007\ue008\ue009");
static const FixtureCase ReplayFixtures[] = {
 {L"siglus", [](ReplayFixture &g) { KeepSharedAtlasNameplate(g, FirstNameplateLine); }},
 {L"catsystem2", [](ReplayFixture &g) { KeepSeparateAtlasNameplate(g, true, SecondNameplateLine); }},
 {L"advhd", [](ReplayFixture &g) { KeepSeparateAtlasNameplate(g, false, SecondNameplateLine); }},
 {L"aoitori-centered", [](ReplayFixture &g) { AoitoriCase(g, AoitoriLayout::Centered); }},
 {L"aoitori-moved", [](ReplayFixture &g) { AoitoriCase(g, AoitoriLayout::Moved); }},
 {L"aoitori-partial", [](ReplayFixture &g) { AoitoriCase(g, AoitoriLayout::Partial); }},
};
