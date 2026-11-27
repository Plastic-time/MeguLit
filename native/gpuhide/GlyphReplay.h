// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include "GlyphQuads.h"
#include <iomanip>
#include <limits>
#include <locale>
#include <ostream>

namespace GpuReplay {

constexpr unsigned MaxEvents = 16384;
constexpr unsigned MaxQuads = 65536;
constexpr unsigned MaxLine = 4096;
constexpr unsigned MaxLineUnits = 65536;
constexpr unsigned MaxFileBytes = 16 * 1024 * 1024;
constexpr unsigned MaxDimension = 65535;
constexpr wchar_t FirstToken = 0xe000, LastToken = 0xf8ff;

inline bool TextToken(unsigned c) {
 return c == ' ' || c == '\n' || c == '\r' || c == 0x1f || c == 0x3010 || c == 0x3011 ||
  (c >= FirstToken && c <= LastToken);
}

struct Call {
 char op;
 unsigned tick = 0;
 void *tex = nullptr, *rt = nullptr;
 unsigned tw = 0, th = 0, rw = 0, rh = 0, bw = 0, bh = 0;
 bool flag = false; // render-target texture (D), read-only (M), or saved blank quads (P)
 float height = 0;  // preset only
 std::wstring text;
 std::vector<Quad> quads;
};

inline bool Coordinate(float value, float limit) { return std::isfinite(value) && std::fabs(value) <= limit; }
inline bool ReplayQuad(const Quad &q) {
 return Coordinate(q.x0, 1000000) && Coordinate(q.y0, 1000000) &&
  Coordinate(q.x1, 1000000) && Coordinate(q.y1, 1000000) &&
  Coordinate(q.u0, 16384) && Coordinate(q.v0, 16384) &&
  Coordinate(q.u1, 16384) && Coordinate(q.v1, 16384);
}

class Tape {
 size_t totalQuads = 0, totalText = 0;
 std::map<wchar_t, wchar_t> tokens;
 bool Room() const { return calls.size() < MaxEvents; }
 bool Geometry(Call &c, const std::vector<Quad> &quads) {
  if (!Room() || quads.size() > MaxQuads - totalQuads ||
      !std::all_of(quads.begin(), quads.end(), ReplayQuad)) return false;
  c.quads = quads;
  calls.push_back(std::move(c));
  totalQuads += quads.size();
  return true;
 }
 bool Add(Call &&c) {
  if (!Room()) return false;
  calls.push_back(std::move(c));
  return true;
 }

public:
 std::vector<Call> calls;

 bool Line(const std::wstring &raw, unsigned tick) {
  if (!Room() || raw.size() > MaxLine || raw.size() > MaxLineUnits - totalText) return false;
  Call c{'L'};
  c.tick = tick;
  c.text.reserve(raw.size());
  for (wchar_t ch : raw) {
   if (ch == L'\n' || ch == L'\r' || ch == 0x1f || ch == 0x3010 || ch == 0x3011) c.text += ch;
   else if (Blank(ch)) c.text += L' ';
   else {
    auto token = tokens.find(ch);
    if (token == tokens.end()) {
     if (tokens.size() > LastToken - FirstToken) return false;
     const auto next = static_cast<wchar_t>(FirstToken + tokens.size());
     token = tokens.emplace(ch, next).first;
    }
    c.text += token->second;
   }
  }
  calls.push_back(std::move(c));
  totalText += raw.size();
  return true;
 }
 bool Draw(void *tex, unsigned tw, unsigned th, void *rt, unsigned rw, unsigned rh, unsigned bw, unsigned bh,
           bool renderTexture, const std::vector<Quad> &quads, unsigned tick) {
  if ((std::max)({tw, th, rw, rh, bw, bh}) > MaxDimension) return false;
  Call c{'D'};
  c.tex = tex; c.rt = rt; c.tw = tw; c.th = th; c.rw = rw; c.rh = rh; c.bw = bw; c.bh = bh;
  c.tick = tick; c.flag = renderTexture;
  return Geometry(c, quads);
 }
 bool Composite(void *tex, const std::vector<Quad> &quads) {
  Call c{'C'};
  c.tex = tex;
  return Geometry(c, quads);
 }
 bool Frame(unsigned tick, unsigned w, unsigned h) {
  if (w > MaxDimension || h > MaxDimension) return false;
  Call c{'F'};
  c.tick = tick; c.bw = w; c.bh = h;
  return Add(std::move(c));
 }
 bool Preset(float height, unsigned w, unsigned h, bool blanks) {
  if (!Coordinate(height, 1000000) || w > MaxDimension || h > MaxDimension) return false;
  Call c{'P'};
  c.height = height; c.bw = w; c.bh = h; c.flag = blanks;
  return Add(std::move(c));
 }
 bool Mode(bool readOnly) {
  Call c{'M'};
  c.flag = readOnly;
  return Add(std::move(c));
 }
 bool Off() { return Add(Call{'O'}); }
};

inline bool WriteTape(std::ostream &out, const Tape &tape, bool limited = false) {
 // Native pointer values and GroupKey stay in memory. Only their ranks go to disk.
 // Preserve both sort orders: the learner takes the first match in its group and per-target maps.
 std::map<void *, unsigned> ids{{nullptr, 0}};
 std::map<long long, unsigned> groups;
 for (const Call &c : tape.calls) {
  if (c.op == 'D' || c.op == 'C') ids.emplace(c.tex, 0);
  if (c.op == 'D') {
   ids.emplace(c.rt, 0);
   groups.emplace(GlyphLearner::GroupKey(c.rt, c.tex), 0);
  }
 }
 unsigned rank = 0;
 for (auto &key : ids) if (key.first) key.second = ++rank;
 rank = 0;
 for (auto &key : groups) key.second = ++rank;
 out.imbue(std::locale::classic());
 out << std::setprecision(std::numeric_limits<float>::max_digits10) << "MEGULIT_GPU_REPLAY 1\n";
 for (const Call &c : tape.calls) {
  out << c.op;
  switch (c.op) {
  case 'L':
   out << ' ' << c.tick << ' ' << c.text.size();
   for (wchar_t ch : c.text) out << ' ' << static_cast<unsigned>(ch);
   break;
  case 'D':
   out << ' ' << c.tick << ' ' << ids.at(c.tex) << ' ' << ids.at(c.rt) << ' '
       << groups.at(GlyphLearner::GroupKey(c.rt, c.tex)) << ' '
       << c.tw << ' ' << c.th << ' ' << c.rw << ' ' << c.rh << ' '
       << c.bw << ' ' << c.bh << ' ' << c.flag;
   break;
  case 'C': out << ' ' << ids.at(c.tex); break;
  case 'F': out << ' ' << c.tick << ' ' << c.bw << ' ' << c.bh; break;
  case 'P': out << ' ' << c.height << ' ' << c.bw << ' ' << c.bh << ' ' << c.flag; break;
  case 'M': out << ' ' << c.flag; break;
  }
  if (c.op == 'D' || c.op == 'C') {
   out << ' ' << c.quads.size();
   for (const auto &q : c.quads)
    out << ' ' << q.x0 << ' ' << q.y0 << ' ' << q.x1 << ' ' << q.y1
        << ' ' << q.u0 << ' ' << q.v0 << ' ' << q.u1 << ' ' << q.v1 << ' ' << q.glyph;
  }
  out << '\n';
 }
 return !!(out << "END " << (limited ? "prefix" : "complete") << '\n');
}

} // namespace GpuReplay
