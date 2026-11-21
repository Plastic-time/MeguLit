/* engine-draw BGI signature (BgiDrawSig.h) on bytes of the known builds (selftest/bgidraw-snippets.h, taken from the owner's
   exes; tools/engine-sigs/bgi-draw.cjs must find the same): one glyph link site with the right node register, character /
   previous-node slots, colour argument and advance call; one glyph chain release at the snippet's start; the same bytes with
   the x store gone, a second push, or no 0x8140 compare match nothing. Exit code = failures. */
#include "../BgiDrawSig.h"
#include "bgidraw-snippets.h"
#include <cstdio>
#include <cstring>
#include <vector>
#include <string>
static int Failures = 0;
static void Check(bool ok, const std::string &what) { printf("%s %s\n", ok ? "PASS" : "FAIL", what.c_str()); if (!ok) Failures++; }
static std::vector<unsigned char> Bytes(const char *hex) {
  std::vector<unsigned char> v; for (size_t i = 0; hex[i] && hex[i + 1]; i += 2) { unsigned b; sscanf(hex + i, "%2x", &b); v.push_back((unsigned char)b); }
  v.resize(v.size() + 64, 0xcc); // the matcher looks ahead
  return v;
}
int main() {
  for (const auto &s : BgiSnippets) {
    auto b = Bytes(s.hex); BgiDrawSig::Link l[4];
    int n = BgiDrawSig::FindLinks(b.data(), b.size(), l, 4);
    Check(n == 1, std::string(s.name) + ": one glyph link site");
    if (n == 1) {
      Check(l[0].call == 0x900, std::string(s.name) + ": at the call");
      Check(l[0].node == s.node && l[0].ch == s.ch && l[0].prev == s.prev && l[0].color == s.color, std::string(s.name) + ": node / character / previous node / colour");
      Check((long long)l[0].call + 5 + l[0].rel == s.advanceFromStart, std::string(s.name) + ": the advance call");
    }
    auto f = Bytes(s.freeHex); size_t at[4];
    Check(BgiDrawSig::FindFrees(f.data(), f.size(), at, 4) == 1 && at[0] == 0, std::string(s.name) + ": the glyph chain release");
    /* the x store gone */
    auto c = b; for (size_t i = 0x900 - 0x30; i < 0x900; i++) if (c[i] == 0x89 && c[i + 2] == 0x10 && (c[i + 1] & 7) == s.node) c[i + 2] = 0x11;
    Check(BgiDrawSig::FindLinks(c.data(), c.size(), l, 4) == 0, std::string(s.name) + ": no x store, no match");
    /* a second push before the call (mov ecx,[esp+1c] -> push ebx; nop x3) */
    auto d = b; bool put = false; for (size_t i = 0x900 - 0x10; i < 0x900 && !put; i++) if (d[i] == 0x8b && d[i + 1] == 0x4c && d[i + 2] == 0x24 && d[i + 3] == 0x1c) { d[i] = 0x53; d[i + 1] = d[i + 2] = d[i + 3] = 0x90; put = true; }
    Check(put && BgiDrawSig::FindLinks(d.data(), d.size(), l, 4) == 0, std::string(s.name) + ": two pushes, no match");
    /* no full-width space compare in reach */
    auto e = b; for (size_t i = 0; i + 8 < 0x900; i++) if (e[i] == 0x81 && e[i + 1] == 0x7c && e[i + 4] == 0x40 && e[i + 5] == 0x81) e[i + 5] = 0x82;
    Check(BgiDrawSig::FindLinks(e.data(), e.size(), l, 4) == 0, std::string(s.name) + ": no 0x8140 compare, no match");
  }
  unsigned char o[2];
  Check(BgiDrawSig::CharBytes(0x41, o) == 1 && o[0] == 0x41 && BgiDrawSig::CharBytes(0x82a0, o) == 2 && o[0] == 0x82 && o[1] == 0xa0, "character codes");
  printf("bgi draw signature: %d failure(s)\n", Failures);
  return Failures;
}
