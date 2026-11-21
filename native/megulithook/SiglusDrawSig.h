// SPDX-License-Identifier: GPL-3.0-or-later
// engine-draw signature, SiglusEngine (docs/engine-draw-native.md): the glyph push of every text area (message, ruby, name
// window, choice items), the calls into the message layout, msg::clear, and the msg fields the ruby needs. Pure byte
// matching, no Windows calls, so the self-test (selftest/siglusdraw.cpp) runs it on the fixture windows of CLANNAD and
// Summer Pockets. tools/engine-sigs/siglus-draw.cjs is the same matcher in JavaScript (its header explains every pattern);
// both must agree. Nothing is an absolute address: another build with the same code shape matches, any other matches
// nothing and the hook stays off.
#pragma once
#include <cstdint>
#include <cstddef>
#include <cstring>
namespace SiglusDrawSig {
struct Seg { std::uint32_t va; const unsigned char *b; size_t n; };
enum Push { P_PRINT, P_RUBY, P_NAME, P_MSGSEL, P_SELBTN, P_OTHER, P_COUNT };
enum Add { A_LINE, A_NAMEMSG, A_BACKLOG, A_OTHER, A_COUNT };
static const char *const PushName[P_COUNT] = {"print", "ruby", "name", "msgsel", "selbtn", "other"};
static const char *const AddName[A_COUNT] = {"line", "namemsg", "backlog", "other"};
enum { MaxSites = 16 };
struct Result {
  bool ok = false; const char *why = "";
  std::uint32_t addMsg = 0, push = 0, clear = 0; int vec = -1;
  int penAdd = -1, penX = -1, rubyStr = -1, rubyX = -1, rubyY = -1;
  // optional: msg::frame (screen origin = (int)param->X + arg at [ebp+frameArgX], same for y) and the colour table
  std::uint32_t frame = 0, colorFn = 0, colors = 0; int frameX = -1, frameY = -1, frameArgX = -1, frameArgY = -1;
  int nSites = 0; std::uint32_t site[MaxSites] = {}; int siteRole[MaxSites] = {};
  int nAdds = 0; std::uint32_t add[MaxSites] = {}; int addRole[MaxSites] = {};
  int count(int role) const { int n = 0; for (int i = 0; i < nSites; i++) n += siteRole[i] == role; return n; }
};

// pattern text: "81 f8-ff 0c ?? ..." (hex byte, lo-hi range, ?? any); returns its length in bytes
inline size_t PatLen(const char *p) { size_t n = 0; while (*p) { while (*p == ' ') p++; if (!*p) break; n++; while (*p && *p != ' ') p++; } return n; }
inline int Hex(char c) { return c >= '0' && c <= '9' ? c - '0' : c >= 'a' && c <= 'f' ? c - 'a' + 10 : c >= 'A' && c <= 'F' ? c - 'A' + 10 : -1; }
inline bool Match(const unsigned char *b, size_t avail, const char *p) {
  size_t i = 0;
  while (*p) {
    while (*p == ' ') p++; if (!*p) break;
    if (i >= avail) return false;
    if (p[0] == '?') { p += 2; i++; continue; }
    int lo = Hex(p[0]) * 16 + Hex(p[1]), hi = lo; p += 2;
    if (*p == '-') { hi = Hex(p[1]) * 16 + Hex(p[2]); p += 3; }
    if (b[i] < lo || b[i] > hi) return false;
    i++;
  }
  return true;
}
inline int U16(const unsigned char *b) { return b[0] | b[1] << 8; }
inline std::int32_t I32(const unsigned char *b) { return (std::int32_t)((std::uint32_t)b[0] | (std::uint32_t)b[1] << 8 | (std::uint32_t)b[2] << 16 | (std::uint32_t)b[3] << 24); }
// first match of p in b[from, to) (match start), -1 if none
inline long FindIn(const unsigned char *b, size_t n, size_t from, size_t to, const char *p) {
  size_t len = PatLen(p); if (to > n) to = n;
  for (size_t i = from; i < to; i++) if (Match(b + i, n - i, p)) return (long)i;
  (void)len; return -1;
}

static const char TRIPLE[] = "81 f8-ff 0c 30 00 00 74 ?? 81 f8-ff 0e 30 00 00 74 ?? 81 f8-ff 08 ff 00 00";
static const char PROLOGUE[] = "cc 55 8b ec 6a ff 68 ?? ?? ?? ?? 64 a1 00 00 00 00";
static const char COUNT[] = "8b 8b ?? ?? 00 00 b8 ?? ?? ?? ?? 2b 8b ?? ?? 00 00";
static const char PENADD[] = "8b 8b ?? ?? 00 00 03 8b ?? ?? 00 00";
static const char PRINT[] = "8d 85 ?? ?? ff ff 50 8d 8b ?? ?? 00 00 e8 ?? ?? ?? ??";
static const char CLEAR[] = "55 8b ec 83 ec 08 33 c0 56 57 8b f9 66 89 87 ?? ?? 00 00 89 87 ?? ?? 00 00 89 87 ?? ?? 00 00 89 87";
static const char RUBYSTR[] = "83 bf ?? ?? 00 00 08 8d 87 ?? ?? 00 00";
static const char RUBYPOS[] = "8b b7 ?? ?? 00 00 8b 9f ?? ?? 00 00 8b 8f ?? ?? 00 00";
static const char FRAME[] = "f3 0f 2c 7e ?? 03 93 ?? ?? 00 00 f3 0f 2c 76 ?? 8b 4a 1c 03 7a 18 03 7d ?? 89 4d ?? 8b 4a ?? 89 4d ?? 89 7d ?? 03 72 1c 8b 52 ?? 03 75 ??";
static const char FRAMEPRO[] = "cc 55 8b ec 83 ec";
static const char COLORS[] = "55 8b ec 51 a1 ?? ?? ?? ?? 8b 4d 0c 8b 10 8b 40 04 2b c2 c1 f8 02 48 85 c9 79";
// the bytes right before a call, in this order (the first that fits wins)
static const char *const PushTail[] = {
  "c6 85 ?? ?? ff ff 01",                                         // ruby
  "8d 8f ?? ?? 00 00 8d 85 ?? ?? ff ff 50",                       // name
  "50 8d 89 ?? ?? 00 00 c7 85 ?? ?? ff ff 00 00 00 00",           // msgsel
  "50 89 bd ?? ?? ff ff 89 9d ?? ?? ff ff 89 95 ?? ?? ff ff"};    // selbtn
static const int PushTailRole[] = {P_RUBY, P_NAME, P_MSGSEL, P_SELBTN};
static const char *const AddTail[] = {
  "ff 75 0c ff 75 08",                // line
  "6a 00 ff 75 08 89 86 ?? ?? 00 00",  // namemsg
  "6a 00 51 8d 4e ??"};               // backlog
static const int AddTailRole[] = {A_LINE, A_NAMEMSG, A_BACKLOG};
static const int Want[P_COUNT] = {1, 2, 1, 1, 1, 0};

inline const Seg *At(const Seg *s, int ns, std::uint32_t va) { for (int i = 0; i < ns; i++) if (va >= s[i].va && va < s[i].va + s[i].n) return &s[i]; return nullptr; }
inline bool Tail(const Seg &s, size_t off, const char *p) { size_t len = PatLen(p); return off >= len && Match(s.b + off - len, len, p); }
template <class F> inline void CallsTo(const Seg *s, int ns, std::uint32_t target, F f) {
  for (int k = 0; k < ns; k++) for (size_t i = 0; i + 5 <= s[k].n; i++)
    if (s[k].b[i] == 0xe8 && s[k].va + i + 5 + (std::uint32_t)I32(s[k].b + i + 1) == target) f(s[k], i);
}

inline Result Find(const Seg *s, int ns) {
  Result r;
  // the bracket check: only add_msg has it
  int nt = 0; const Seg *ts = nullptr; size_t ti = 0;
  for (int k = 0; k < ns; k++) for (size_t i = 0; i < s[k].n; i++) if (s[k].b[i] == 0x81 && Match(s[k].b + i, s[k].n - i, TRIPLE)) { if (!nt) { ts = &s[k]; ti = i; } nt++; }
  if (nt != 1) { r.why = nt ? "several bracket checks" : "no bracket check"; return r; }
  const unsigned char *b = ts->b; size_t n = ts->n;
  long start = -1;
  for (size_t i = ti > 0x800 ? ti - 0x800 : 0; i < ti; i++) if (b[i] == 0xcc && Match(b + i, n - i, PROLOGUE)) start = (long)i + 1;
  if (start < 0) { r.why = "no add_msg prologue"; return r; }
  r.addMsg = ts->va + (std::uint32_t)start;
  long c = FindIn(b, n, (size_t)start, ti, COUNT);
  if (c < 0 || U16(b + c + 2) != U16(b + c + 13) + 4) { r.why = "no glyph count in add_msg"; return r; }
  int vec = U16(b + c + 13), np = 0;
  size_t plen = PatLen(PRINT);
  for (size_t i = ti; i < ti + 0x400 && i < n; i++) {
    if (!Match(b + i, n - i, PRINT)) continue;
    if (U16(b + i + 9) == vec) { size_t off = i + 13; r.push = ts->va + (std::uint32_t)off + 5 + (std::uint32_t)I32(b + off + 1); np++; }
    i += plen - 1;
  }
  if (np != 1) { r.why = np ? "several print pushes" : "no print push"; return r; }
  r.vec = vec;
  long pa = FindIn(b, n, (size_t)start, ti, PENADD);
  if (pa >= 0) { r.penAdd = U16(b + pa + 2); r.penX = U16(b + pa + 8); }
  // every call of push, by role
  bool full = false;
  CallsTo(s, ns, r.push, [&](const Seg &g, size_t off) {
    int role = P_OTHER;
    if (&g == ts && off > ti && off < ti + 0x400) role = P_PRINT;
    else for (int t = 0; t < 4; t++) if (Tail(g, off, PushTail[t])) { role = PushTailRole[t]; break; }
    if (r.nSites < MaxSites) { r.site[r.nSites] = g.va + (std::uint32_t)off; r.siteRole[r.nSites++] = role; } else full = true;
  });
  if (full) { r.why = "too many pushes"; return r; }
  for (int k = 0; k < P_COUNT; k++) if (r.count(k) != Want[k]) { r.why = k == P_OTHER ? "unknown pushes" : "push count differs"; return r; }
  // the ruby layout's fields, from the code before its first push
  std::uint32_t ruby = 0; for (int i = 0; i < r.nSites; i++) if (r.siteRole[i] == P_RUBY) { ruby = r.site[i]; break; }
  const Seg *rs = At(s, ns, ruby); size_t ro = ruby - rs->va, from = ro > 0x300 ? ro - 0x300 : 0;
  long st = FindIn(rs->b, ro, from, ro, RUBYSTR), ps = FindIn(rs->b, ro, from, ro, RUBYPOS);
  if (st < 0 || ps < 0) { r.why = "ruby fields not found"; return r; }
  r.rubyStr = U16(rs->b + st + 9); r.rubyX = U16(rs->b + ps + 2); r.rubyY = U16(rs->b + ps + 8);
  if (r.penX >= 0 && U16(rs->b + ps + 14) != r.penX) { r.why = "ruby pen x differs from add_msg"; return r; }
  r.penX = U16(rs->b + ps + 14);
  if (r.penAdd < 0) { r.why = "pen offset not found"; return r; }
  // who calls add_msg
  CallsTo(s, ns, r.addMsg, [&](const Seg &g, size_t off) {
    int role = A_OTHER; for (int t = 0; t < 3; t++) if (Tail(g, off, AddTail[t])) { role = AddTailRole[t]; break; }
    if (r.nAdds < MaxSites) { r.add[r.nAdds] = g.va + (std::uint32_t)off; r.addRole[r.nAdds++] = role; }
  });
  bool line = false; for (int i = 0; i < r.nAdds; i++) line |= r.addRole[i] == A_LINE;
  if (!line) { r.why = "no mwnd.print call of add_msg"; return r; }
  // msg::clear
  int nc = 0;
  for (int k = 0; k < ns; k++) for (size_t i = 0; i < s[k].n; i++) if (s[k].b[i] == 0x55 && Match(s[k].b + i, s[k].n - i, CLEAR)) { if (!nc) r.clear = s[k].va + (std::uint32_t)i; nc++; }
  if (nc != 1) { r.why = nc ? "several clear functions" : "no clear function"; return r; }
  // optional: msg::frame and the colour lookup (each must be unique, else left out)
  int nf = 0; const Seg *fs = nullptr; size_t fi = 0;
  for (int k = 0; k < ns; k++) for (size_t i = 0; i < s[k].n; i++) if (s[k].b[i] == 0xf3 && Match(s[k].b + i, s[k].n - i, FRAME) && U16(s[k].b + i + 7) == r.vec) { if (!nf) { fs = &s[k]; fi = i; } nf++; }
  if (nf == 1) {
    long st = -1; for (size_t i = fi > 0x500 ? fi - 0x500 : 0; i < fi; i++) if (fs->b[i] == 0xcc && Match(fs->b + i, fs->n - i, FRAMEPRO)) st = (long)i + 1;
    if (st >= 0) { r.frame = fs->va + (std::uint32_t)st; r.frameX = fs->b[fi + 4]; r.frameY = fs->b[fi + 15]; r.frameArgX = fs->b[fi + 24]; r.frameArgY = fs->b[fi + 45]; }
  }
  int nl = 0;
  for (int k = 0; k < ns; k++) for (size_t i = 0; i < s[k].n; i++) if (s[k].b[i] == 0x55 && Match(s[k].b + i, s[k].n - i, COLORS)) { if (!nl) { r.colorFn = s[k].va + (std::uint32_t)i; r.colors = (std::uint32_t)I32(s[k].b + i + 5); } nl++; }
  if (nl != 1) { r.colorFn = 0; r.colors = 0; }
  r.ok = true; r.why = "";
  return r;
}
// the role of a push from its return address (the call site + 5), and of add_msg from its own return address
inline int PushRole(const Result &r, std::uint32_t ret) { for (int i = 0; i < r.nSites; i++) if (r.site[i] + 5 == ret) return r.siteRole[i]; return P_OTHER; }
inline int AddRole(const Result &r, std::uint32_t ret) { for (int i = 0; i < r.nAdds; i++) if (r.add[i] + 5 == ret) return r.addRole[i]; return A_OTHER; }
}
