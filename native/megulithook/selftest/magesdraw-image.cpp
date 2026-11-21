// SPDX-License-Identifier: GPL-3.0-or-later
// Read decrypted code bytes from stdin and print the production matcher's result; no game code is executed
#include "../MagesDrawSig.h"
#include <cstdio>
#include <vector>
#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif
int main() {
#ifdef _WIN32
  if (_setmode(_fileno(stdin), _O_BINARY) == -1) return 2;
#endif
  std::vector<unsigned char> bytes;
  unsigned char chunk[16384];
  for (;;) {
    const size_t count = fread(chunk, 1, sizeof chunk, stdin);
    if (bytes.size() + count > 32 * 1024 * 1024) return 2;
    bytes.insert(bytes.end(), chunk, chunk + count);
    if (count != sizeof chunk) { if (ferror(stdin)) return 2; break; }
  }
  if (bytes.size() < 0x100) return 2;
  const auto r = MagesDrawSig::Find(bytes.data(), bytes.size());
  std::uint32_t width = 0;
  const int backbuffers = MagesDrawSig::FindBackbuffer(bytes.data(), bytes.size(), width);
  printf("{\"ok\":%d,\"heads\":%d,\"dialogue\":[%llu,%llu],\"drawGlyph\":%lld,"
         "\"pages\":%u,\"stride\":%u,\"chars\":%d,\"scale\":%u,\"commits\":%d,"
         "\"commit\":%llu,\"count\":%u,\"codes\":%u,\"info\":%u,\"clear\":[",
         r.ok, r.heads, (unsigned long long)r.dialogue[0], (unsigned long long)r.dialogue[1],
         (long long)r.drawGlyphRel, r.pages, r.stride, r.chars, r.scale, r.commits,
         (unsigned long long)r.commit, r.count, r.codes, r.info);
  for (int k = 0; k < r.clears && k < 4; k++) printf("%s%llu", k ? "," : "", (unsigned long long)r.clear[k]);
  printf("],\"backbuffers\":%d,\"backbufferWidth\":%u}\n", backbuffers, width);
  return r.ok ? 0 : 1;
}
