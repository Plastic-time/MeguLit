/* engine-draw YU-RIS signature (YurisDrawSig.h) on bytes of the four known builds (euphoria HD 1.474, euphoria, 女装山脈,
   サイコロジック・ラブコメディ; selftest/yurisdraw-snippets.h, taken from the owner's exes): one hit at the call, the right x / y
   slot, the right blitter; a loop whose accumulator store is missing, and the same bytes with the SJIS step broken, match
   nothing. Exit code = failures. */
#include "../YurisDrawSig.h"
#include "yurisdraw-snippets.h"
#include <cstdio>
#include <vector>
#include <string>
static int Failures = 0;
static void Check(bool ok, const std::string &what) { printf("%s %s\n", ok ? "PASS" : "FAIL", what.c_str()); if (!ok) Failures++; }
static std::vector<unsigned char> Bytes(const char *hex) {
  std::vector<unsigned char> v; for (size_t i = 0; hex[i] && hex[i + 1]; i += 2) { unsigned b; sscanf(hex + i, "%2x", &b); v.push_back((unsigned char)b); }
  v.resize(v.size() + 32, 0xcc); // the matcher looks up to 32 bytes ahead
  return v;
}
int main() {
  for (const auto &s : YurisSnippets) {
    auto b = Bytes(s.hex); YurisDrawSig::Hit h[4];
    int n = YurisDrawSig::Find(b.data(), b.size(), h, 4);
    Check(n == 1, std::string(s.name) + ": one dialogue loop call");
    if (n != 1) continue;
    Check(h[0].call == 0xa0, std::string(s.name) + ": at the call");
    Check(h[0].x == s.x && h[0].y == s.x + 4, std::string(s.name) + ": x / y slots");
    Check((long long)h[0].call + 5 + h[0].rel == s.blitterFromStart, std::string(s.name) + ": the glyph blitter");
    /* no store of the accumulator into the blitter's arguments: not this loop */
    auto c = b; for (size_t i = 0; i + 4 <= 0xa0; i++) if (c[i] == 0x89 && (c[i + 1] & 0xc7) == 0x44 && c[i + 2] == 0x24 && c[i + 3] == (unsigned char)s.x) c[i] = 0x90;
    Check(YurisDrawSig::Find(c.data(), c.size(), h, 4) == 0, std::string(s.name) + ": no x store, no match");
    auto d = b; d[0xa0 + 5 + (b[0xa0 + 5] == 0x03 ? 2 : 4) + 4 + (b[0xa0 + 5] == 0x03 ? 0 : 1) + 7] ^= 0xff;
    Check(YurisDrawSig::Find(d.data(), d.size(), h, 4) == 0, std::string(s.name) + ": SJIS step broken, no match");
  }
  Check(YurisDrawSig::CharBytes(0x82) == 2 && YurisDrawSig::CharBytes(0xe0) == 2 && YurisDrawSig::CharBytes('a') == 1 && YurisDrawSig::CharBytes(0xa0) == 1, "SJIS lead bytes");
  printf("yuris draw signature: %d failure(s)\n", Failures);
  return Failures;
}
