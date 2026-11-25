// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <stdint.h>
#include <deque>
#include <string>
#include <vector>

namespace Littlecheese {
struct Cell {
 wchar_t ch;
 int x, y, w, h;
 unsigned at;
 bool hidden;
};
struct Line {
 std::vector<Cell> cells;
 unsigned page = 0;
 bool hidden = false;
};

// The renderer draws new characters into a retained bitmap. A confirmed source
// line consumes only its own characters, even if the next row has started.
class Rows {
 std::deque<Cell> pending;
 uintptr_t layout = 0;
 unsigned page = 0;
 int lastX = -1, lastY = -1;
 bool rowHide = false;
public:
 void Clear() { pending.clear(); layout = 0; lastX = lastY = -1; rowHide = false; }
 bool Draw(uintptr_t layer, wchar_t ch, int x, int y, int w, int h, unsigned now, bool hide) {
  if (layer != layout || y < lastY || (y == lastY && x <= lastX)) {
   Clear();
   ++page;
  }
  if (y != lastY) rowHide = hide;
  if (!hide) rowHide = false;
  layout = layer; lastX = x; lastY = y;
  if (pending.size() == 512) pending.pop_front();
  pending.push_back({ch, x, y, w, h, now, rowHide});
  return rowHide;
 }
 Line Claim(const std::wstring &text, unsigned now) {
  while (!pending.empty() && now - pending.front().at > 12000) pending.pop_front();
  if (text.empty() || text.size() > pending.size()) return {};
  // The bridge flushes in draw order. Repeated text may be on two rows.
  for (size_t first = 0; first + text.size() <= pending.size(); ++first) {
   size_t i = 0;
   while (i < text.size() && pending[first + i].ch == text[i]) ++i;
   if (i != text.size()) continue;
   auto from = pending.begin() + first, to = from + i;
   Line line;
   line.page = page;
   line.hidden = true;
   for (auto it = from; it != to; ++it) {
    line.cells.push_back(*it);
    line.hidden = line.hidden && it->hidden;
   }
   pending.erase(pending.begin(), to);
   return line;
  }
  return {};
 }
};
}
