// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <cstdint>
#include <cstddef>

namespace EuphoriaDrawFlow {
inline bool SourceWindow(std::uint32_t sourceAt, std::uint32_t sourceThread,
                         std::uint32_t now, std::uint32_t currentThread, bool owned) {
  return sourceAt && sourceThread == currentThread &&
         (std::uint32_t(now - sourceAt) <= 250 || owned);
}
// Only an already-qualified synchronous dialogue loop may outlive the source window.
// A later LOG/menu redraw must qualify again, even if it reuses the same text buffer.
struct RasterScope {
  std::uintptr_t frame = 0, first = 0, end = 0;
  std::uint32_t revision = 0, thread = 0;
  bool Begin(std::uintptr_t stack, std::uintptr_t text, std::size_t bytes,
             std::uint32_t sourceRevision, std::uint32_t sourceAt,
             std::uint32_t sourceThread, std::uint32_t now, std::uint32_t currentThread) {
    frame = first = end = 0;
    if (!stack || !text || !bytes || bytes > 8000 ||
        !SourceWindow(sourceAt, sourceThread, now, currentThread, false) ||
        text + bytes < text) return false;
    frame = stack; first = text; end = text + bytes;
    revision = sourceRevision; thread = currentThread;
    return true;
  }
  bool Owns(std::uintptr_t stack, std::uintptr_t glyph, std::uint32_t sourceRevision,
            std::uint32_t currentThread) const {
    return frame && stack == frame && glyph >= first && glyph < end &&
           revision == sourceRevision && thread == currentThread;
  }
  void End(std::uintptr_t stack) { if (stack == frame) frame = first = end = 0; }
};
}
