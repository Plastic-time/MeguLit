/* engine-draw MAGES signature (MagesDrawSig.h) on the decrypted code of the five known Steam builds (STEINS;GATE, STEINS;GATE 0,
   CHAOS;CHILD, 線形拘束のフェノグラム, 比翼恋理のだーりん; selftest/magesdraw-snippets.h, the same bytes as
   validation/fixtures/engine-sigs/mages-draw.json): both drawDialogue functions, drawGlyph, the pages / stride / scale, the
   commit with its layout buffer and both page clears must come out exactly as the JavaScript reference found them; a
   drawDialogue with one glyph call fewer, and a commit without its pageLength++, match nothing. Exit code = failures. */
#include "../MagesDrawSig.h"
#include "magesdraw-snippets.h"
#include <cstdio>
#include <vector>
#include <string>
static int Failures = 0;
static void Check(bool ok, const std::string &what) { printf("%s %s\n", ok ? "PASS" : "FAIL", what.c_str()); if (!ok) Failures++; }
static std::vector<unsigned char> Bytes(const char *hex) {
  std::vector<unsigned char> v; for (size_t i = 0; hex[i] && hex[i + 1]; i += 2) { unsigned b; sscanf(hex + i, "%2x", &b); v.push_back((unsigned char)b); }
  return v;
}
int main() {
  for (const auto &s : MagesSnippets) {
    std::string n = s.name; auto b = Bytes(s.hex);
    auto r = MagesDrawSig::Find(b.data(), b.size());
    Check(r.ok == 1, n + ": everything found");
    Check(r.heads == 2 && (long long)r.dialogue[0] == s.dlg0 && (long long)r.dialogue[1] == s.dlg1, n + ": drawDialogue / drawDialogue2");
    Check(r.drawGlyphRel == s.glyph, n + ": drawGlyph");
    Check(r.pages == s.pages && r.stride == s.stride && r.chars == s.chars && r.scale == s.scale, n + ": pages / stride / chars / scale");
    Check(r.commits == 1 && (long long)r.commit == s.commit && r.count == s.count && r.codes == s.codes && r.info == s.info, n + ": commit and its layout buffer");
    Check(r.clears == 2 && (long long)r.clear[0] == s.clear0 && (long long)r.clear[1] == s.clear1, n + ": both page clears");
    /* one of drawDialogue2's three glyph calls gone (add esp,2Ch -> add esp,28h): one candidate left, nothing found */
    auto c = b; int seen = 0;
    for (size_t i = (size_t)s.dlg1; i + 3 < c.size(); i++) if (c[i] == 0x83 && c[i + 1] == 0xc4 && c[i + 2] == 0x2c) { if (++seen == 2) { c[i + 2] = 0x28; break; } }
    auto rc = MagesDrawSig::Find(c.data(), c.size());
    Check(rc.ok == 0 && rc.heads == 1, n + ": a drawDialogue with two glyph calls is not one");
    /* the commit's pageLength++ (inc dword [r + pages+0xC]) gone: no commit */
    auto d = b; for (size_t i = (size_t)s.commit; i + 6 < d.size() && i < (size_t)s.commit + 0x200; i++) if (d[i] == 0xff && (d[i + 1] & 0xf8) == 0x80 && MagesDrawSig::U32(&d[i + 2]) == s.pages + 0xc) { d[i] = 0x90; d[i + 1] = 0x90; }
    Check(MagesDrawSig::Find(d.data(), d.size()).commits == 0, n + ": no pageLength++, no commit");
  }
  Check(MagesDrawSig::SizeOf(0xea9c) == 2000 && MagesDrawSig::SizeOf(0x3348c) == 7000 && MagesDrawSig::SizeOf(0xea9d) == 0 && MagesDrawSig::SizeOf(0x40) == 0, "page stride -> characters a page");
  printf("mages draw signature: %d failure(s)\n", Failures);
  return Failures;
}
