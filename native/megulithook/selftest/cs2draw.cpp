/* engine-draw CatSystem2 signature (CS2DrawSig.h) on bytes of the known build (ISLAND; selftest/cs2draw-snippets.h, taken
   from the owner's exe): one hit at the hook point with the record offsets and stack slots tools/engine-sigs/cs2-draw.cjs
   finds on the same bytes; the y half through another register, a jump into the hooked bytes and a missing glyph call
   match nothing. Exit code = failures. */
#include "../CS2DrawSig.h"
#include "cs2draw-snippets.h"
#include <cstdio>
#include <vector>
#include <string>
static int Failures = 0;
static void Check(bool ok, const std::string &what) { printf("%s %s\n", ok ? "PASS" : "FAIL", what.c_str()); if (!ok) Failures++; }
static std::vector<unsigned char> Bytes(const char *hex) {
  std::vector<unsigned char> v; for (size_t i = 0; hex[i] && hex[i + 1]; i += 2) { unsigned b; sscanf(hex + i, "%2x", &b); v.push_back((unsigned char)b); }
  return v;
}
static int Run(const std::vector<unsigned char> &b, CS2DrawSig::Hit *h) {
  std::vector<unsigned char> p(b); p.resize(p.size() + 48, 0xcc); // the matcher reads up to 40 bytes past a position
  return CS2DrawSig::Find(p.data(), b.size() + 40, h, 4);
}
int main() {
  for (const auto &s : CS2Snippets) {
    auto b = Bytes(s.hex); CS2DrawSig::Hit h[4]; std::string n(s.name);
    int count = Run(b, h);
    Check(count == 1, n + ": one composer");
    if (count != 1) continue;
    Check(h[0].hook == 0x100 && h[0].shape == s.shape, n + ": at the hook point, shape");
    Check(h[0].rec == s.rec && h[0].x == s.x && h[0].y == s.x + 4 && h[0].chr == s.chr && h[0].size == s.size && h[0].colour == s.colour, n + ": record offsets");
    Check(h[0].bx == s.bx && h[0].ox == s.ox, n + ": stack slots");
    size_t y = s.shape == 0 ? 0x100 + 18 : 0x100 + 11;
    auto c = b; c[y + 1] ^= 1; Check(Run(c, h) == 0, n + ": y through another register, no match");
    auto d = b; d[0x100 - 0x20] = 0xeb; d[0x100 - 0x1f] = 0x21; Check(Run(d, h) == 0, n + ": a jump into the hooked bytes, no match");
    auto e = b; for (size_t i = 0; i < 0x100; i++) if (e[i] == 0xff && e[i + 2] == 0x04 && (e[i + 1] & 0xf8) == 0x50) e[i] = 0x90;
    Check(Run(e, h) == 0, n + ": no glyph call, no match");
  }
  printf("cs2 draw signature: %d failure(s)\n", Failures);
  return Failures;
}
