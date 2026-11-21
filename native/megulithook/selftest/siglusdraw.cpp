/* engine-draw SiglusEngine signature (SiglusDrawSig.h) on the fixture windows of CLANNAD (1.1.134.0) and Summer Pockets
   (1.1.137.0) (selftest/siglusdraw-snippets.h, taken from the owner's exes): add_msg, the glyph push, msg::clear, every
   push call site with its role (print / ruby x2 / name / msgsel / selbtn), every add_msg call site (line / namemsg /
   backlog x2) and the msg field offsets must be what tools/engine-sigs/siglus-draw.cjs found on the whole file. Near
   misses (the bracket check broken, a ruby call site changed, clear's head changed) match nothing. Exit code = failures. */
#include "../SiglusDrawSig.h"
#include "siglusdraw-snippets.h"
#include <cstdio>
#include <vector>
#include <string>
static int Failures = 0;
static void Check(bool ok, const std::string &what) { printf("%s %s\n", ok ? "PASS" : "FAIL", what.c_str()); if (!ok) Failures++; }
static std::vector<unsigned char> Bytes(const char *hex) {
  std::vector<unsigned char> v; for (size_t i = 0; hex[i] && hex[i + 1]; i += 2) { unsigned b; sscanf(hex + i, "%2x", &b); v.push_back((unsigned char)b); }
  return v;
}
using SiglusDrawSig::Seg;
static SiglusDrawSig::Result Run(std::vector<std::vector<unsigned char>> &w, const SiglusGame &g) {
  std::vector<Seg> s; for (int i = 0; i < g.n; i++) s.push_back(Seg{g.w[i].va, w[i].data(), w[i].size()});
  return SiglusDrawSig::Find(s.data(), (int)s.size());
}
// the window holding va, and va's offset in it
static unsigned char *Byte(std::vector<std::vector<unsigned char>> &w, const SiglusGame &g, unsigned va) {
  for (int i = 0; i < g.n; i++) if (va >= g.w[i].va && va < g.w[i].va + w[i].size()) return &w[i][va - g.w[i].va];
  return nullptr;
}
int main() {
  for (const auto &g : SiglusGames) {
    std::string n = g.name;
    std::vector<std::vector<unsigned char>> w; for (int i = 0; i < g.n; i++) w.push_back(Bytes(g.w[i].hex));
    auto r = Run(w, g);
    Check(r.ok, n + ": matched" + (r.ok ? std::string() : std::string(" (") + r.why + ")"));
    if (!r.ok) continue;
    Check(r.addMsg == g.addMsg && r.push == g.pushFn && r.clear == g.clear, n + ": add_msg / push / clear");
    Check(r.vec == g.vec && r.penAdd == g.penAdd && r.penX == g.penX && r.rubyStr == g.rubyStr && r.rubyX == g.rubyX && r.rubyY == g.rubyY, n + ": msg field offsets");
    bool sites = r.nSites == g.np; for (int i = 0; i < g.np; i++) sites &= SiglusDrawSig::PushRole(r, g.push[i].va + 5) == g.push[i].role;
    Check(sites, n + ": every push call site and its role");
    bool adds = r.nAdds == g.na; for (int i = 0; i < g.na; i++) adds &= SiglusDrawSig::AddRole(r, g.add[i].va + 5) == g.add[i].role;
    Check(adds, n + ": every add_msg call site and its role");
    Check(SiglusDrawSig::PushRole(r, g.pushFn) == SiglusDrawSig::P_OTHER, n + ": an unknown return address is other");
    /* near misses */
    { auto c = w; long i = -1; for (int k = 0; k < g.n && i < 0; k++) for (size_t j = 0; j + 6 < c[k].size(); j++) if (c[k][j] == 0x81 && c[k][j + 2] == 0x0c && c[k][j + 3] == 0x30) { c[k][j + 2] = 0x0d; i = (long)j; break; }
      Check(i >= 0 && !Run(c, g).ok, n + ": bracket check broken, no match"); }
    { auto c = w; unsigned site = 0; for (int i = 0; i < g.np; i++) if (g.push[i].role == SiglusDrawSig::P_RUBY) { site = g.push[i].va; break; }
      unsigned char *b = Byte(c, g, site); if (b) b[-1] = 0x02; auto x = Run(c, g);
      Check(b && !x.ok, n + ": a ruby call site changed, no match"); }
    { auto c = w; unsigned char *b = Byte(c, g, g.clear); if (b) b[5] = 0x0c;
      Check(b && !Run(c, g).ok, n + ": clear's head changed, no match"); }
  }
  Check(SiglusDrawSig::PatLen(SiglusDrawSig::TRIPLE) == 22 && SiglusDrawSig::PatLen(SiglusDrawSig::PRINT) == 18, "pattern lengths");
  printf("siglus draw signature: %d failure(s)\n", Failures);
  return Failures;
}
