// SPDX-License-Identifier: GPL-3.0-or-later
// Font dots at the source (owner 2026-11-14: dot the bitmap font where the engine loads it; same cells, same layout).
// For engines that keep their font as prebuilt glyph sheets and composite them on the CPU (BRUNS: font\ff_*.bmp inside
// EENC / EENZ containers), no draw call ever carries one glyph. With MEGULIT_FONT_DOTS=1 in the game's environment (set
// by the launcher that injects this DLL before the game runs), every file the game opens for reading is checked once:
// when it is (after the container this engine family uses, if any) a palette or grey bitmap laid out as a regular grid
// of glyph cells, the game is served a copy in which every non-empty cell keeps its size but its coverage is a solid
// square dot at the top-left of the glyph's ink (side 3 px for a 32 px cell, scaled with the cell; 2 px at least), in the
// sheet's brightest colour, per docs/text-architecture.md. Nothing on disk changes: the copy lives in memory and is
// served through the game's own file handle (ReadFile / SetFilePointer(Ex) / GetFileSize(Ex) on that handle).
// Menus and names drawn from the same sheets become dots too (intended: the capture compositor draws all text).
#include <stdint.h>

// ---- inflate (RFC 1951), compact ----------------------------------------------------------------------------------------
namespace fd {
struct Bits { const uint8_t *p; size_t n, i; uint32_t b; int c; bool err;
 int bit() { if (!c) { if (i >= n) { err = true; return 0; } b = p[i++]; c = 8; } int v = b & 1; b >>= 1; c--; return v; }
 uint32_t get(int k) { uint32_t v = 0; for (int j = 0; j < k; j++) v |= (uint32_t)bit() << j; return v; } };
struct Huff { uint16_t count[16], sym[320]; };
static void Build(Huff &h, const uint8_t *len, int n) { uint16_t offs[16]; memset(h.count, 0, sizeof h.count); for (int i = 0; i < n; i++) h.count[len[i]]++; h.count[0] = 0; offs[1] = 0; for (int i = 1; i < 15; i++) offs[i + 1] = offs[i] + h.count[i]; for (int i = 0; i < n; i++) if (len[i]) h.sym[offs[len[i]]++] = (uint16_t)i; }
static int Decode(Bits &s, const Huff &h) { int code = 0, first = 0, index = 0; for (int l = 1; l < 16; l++) { code |= s.bit(); int c = h.count[l]; if (code - c < first) return h.sym[index + (code - first)]; index += c; first += c; first <<= 1; code <<= 1; if (s.err) return -1; } return -1; }
static bool Inflate(const uint8_t *src, size_t n, std::vector<uint8_t> &out) {
 static const uint16_t lb[29] = { 3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258 }; static const uint8_t le[29] = { 0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0 };
 static const uint16_t db[30] = { 1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577 }; static const uint8_t de[30] = { 0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13 };
 Bits s = { src, n, 0, 0, 0, false }; int last;
 do { last = s.bit(); int type = (int)s.get(2); if (s.err) return false;
  if (type == 0) { s.c = 0; if (s.i + 4 > n) return false; uint16_t len = (uint16_t)(src[s.i] | src[s.i + 1] << 8); s.i += 4; if (s.i + len > n) return false; out.insert(out.end(), src + s.i, src + s.i + len); s.i += len; continue; }
  Huff L, D; uint8_t lens[320];
  if (type == 1) { int i = 0; for (; i < 144; i++) lens[i] = 8; for (; i < 256; i++) lens[i] = 9; for (; i < 280; i++) lens[i] = 7; for (; i < 288; i++) lens[i] = 8; Build(L, lens, 288); for (i = 0; i < 30; i++) lens[i] = 5; Build(D, lens, 30); }
  else if (type == 2) { int hl = (int)s.get(5) + 257, hd = (int)s.get(5) + 1, hc = (int)s.get(4) + 4; static const uint8_t ord[19] = { 16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15 }; uint8_t cl[19] = {}; for (int i = 0; i < hc; i++) cl[ord[i]] = (uint8_t)s.get(3); Huff C; Build(C, cl, 19);
   int i = 0; while (i < hl + hd) { int sym = Decode(s, C); if (sym < 0) return false; if (sym < 16) lens[i++] = (uint8_t)sym; else { int rep, val = 0; if (sym == 16) { if (!i) return false; val = lens[i - 1]; rep = 3 + (int)s.get(2); } else if (sym == 17) rep = 3 + (int)s.get(3); else rep = 11 + (int)s.get(7); if (i + rep > hl + hd) return false; while (rep--) lens[i++] = (uint8_t)val; } }
   Build(L, lens, hl); Build(D, lens + hl, hd); }
  else return false;
  for (;;) { int sym = Decode(s, L); if (sym < 0) return false; if (sym < 256) out.push_back((uint8_t)sym); else if (sym == 256) break; else { sym -= 257; if (sym >= 29) return false; size_t len = lb[sym] + s.get(le[sym]); int ds = Decode(s, D); if (ds < 0 || ds >= 30) return false; size_t dist = db[ds] + s.get(de[ds]); if (dist > out.size()) return false; size_t from = out.size() - dist; for (size_t k = 0; k < len; k++) out.push_back(out[from + k]); } if (s.err) return false; }
 } while (!last);
 return !s.err;
}
static bool Unzlib(const uint8_t *p, size_t n, std::vector<uint8_t> &out) { if (n < 6 || (p[0] & 15) != 8 || ((p[0] << 8) | p[1]) % 31) return false; return Inflate(p + 2, n - 6, out); }
// zlib stream with stored blocks: any inflater reads it, and the content is exactly ours.
static void Zlib(const std::vector<uint8_t> &d, std::vector<uint8_t> &out) {
 out.clear(); out.push_back(0x78); out.push_back(0x01); size_t i = 0;
 do { size_t k = (std::min)((size_t)65535, d.size() - i); bool last = i + k == d.size(); out.push_back(last ? 1 : 0); out.push_back((uint8_t)k); out.push_back((uint8_t)(k >> 8)); out.push_back((uint8_t)~k); out.push_back((uint8_t)(~k >> 8)); out.insert(out.end(), d.begin() + i, d.begin() + i + k); i += k; } while (i < d.size());
 uint32_t a = 1, b = 0; for (uint8_t c : d) { a = (a + c) % 65521; b = (b + a) % 65521; } uint32_t ad = b << 16 | a; out.push_back((uint8_t)(ad >> 24)); out.push_back((uint8_t)(ad >> 16)); out.push_back((uint8_t)(ad >> 8)); out.push_back((uint8_t)ad);
}

// ---- containers ------------------------------------------------------------------------------------------------------
// EENC / EENZ (BRUNS family): key = u32 at 4 ^ 0xDEADBEEF, bytes from 8 XOR-ed with the key's bytes in turn, zlib for EENZ.
static bool Unwrap(const std::vector<uint8_t> &f, std::vector<uint8_t> &inner, int &kind, uint32_t &key) {
 kind = 0; if (f.size() >= 2 && f[0] == 'B' && f[1] == 'M') { inner = f; return true; }
 if (f.size() < 12 || f[0] != 'E' || f[1] != 'E' || f[2] != 'N' || (f[3] != 'C' && f[3] != 'Z')) return false;
 key = (uint32_t)(f[4] | f[5] << 8 | f[6] << 16 | (uint32_t)f[7] << 24) ^ 0xDEADBEEFu; std::vector<uint8_t> d(f.begin() + 8, f.end()); for (size_t i = 0; i < d.size(); i++) d[i] ^= (uint8_t)(key >> ((i & 3) * 8));
 if (f[3] == 'C') { inner.swap(d); kind = 1; return true; } inner.clear(); kind = 2; return Unzlib(d.data(), d.size(), inner);
}
static void Wrap(const std::vector<uint8_t> &orig, const std::vector<uint8_t> &inner, int kind, uint32_t key, std::vector<uint8_t> &out) {
 if (kind == 0) { out = inner; return; }
 std::vector<uint8_t> d; if (kind == 2) Zlib(inner, d); else d = inner; for (size_t i = 0; i < d.size(); i++) d[i] ^= (uint8_t)(key >> ((i & 3) * 8));
 out.assign(orig.begin(), orig.begin() + 8); out.insert(out.end(), d.begin(), d.end());
}

// ---- glyph sheet ------------------------------------------------------------------------------------------------------
struct Sheet { int w, h, bpp; bool bottomUp; size_t off, stride; int cw, ch, glyphs, dot; };
static int Px(const std::vector<uint8_t> &b, const Sheet &s, int x, int y) { size_t row = s.off + (size_t)(s.bottomUp ? s.h - 1 - y : y) * s.stride; if (s.bpp == 8) return b[row + x]; uint8_t v = b[row + x / 2]; return x & 1 ? v & 15 : v >> 4; }
static void SetPx(std::vector<uint8_t> &b, const Sheet &s, int x, int y, int v) { size_t row = s.off + (size_t)(s.bottomUp ? s.h - 1 - y : y) * s.stride; if (s.bpp == 8) { b[row + x] = (uint8_t)v; return; } uint8_t &c = b[row + x / 2]; c = x & 1 ? (uint8_t)((c & 0xF0) | (v & 15)) : (uint8_t)((c & 0x0F) | (v << 4)); }
// A palette bitmap of grey levels laid out as a grid of glyph cells: the cell boundaries carry (almost) no ink.
static bool Detect(const std::vector<uint8_t> &b, Sheet &s, std::vector<int> &lum) {
 if (b.size() < 54 || b[0] != 'B' || b[1] != 'M') return false; uint32_t hs = *(const uint32_t *)&b[14]; if (hs < 40) return false;
 int w = *(const int32_t *)&b[18], h = *(const int32_t *)&b[22]; int bpp = *(const uint16_t *)&b[28]; uint32_t comp = *(const uint32_t *)&b[30], used = *(const uint32_t *)&b[46];
 if (comp != 0 || (bpp != 4 && bpp != 8) || w < 64 || w > 8192 || h == 0) return false; s.bottomUp = h > 0; s.h = h < 0 ? -h : h; s.w = w; s.bpp = bpp; s.off = *(const uint32_t *)&b[10]; s.stride = ((size_t)w * bpp + 31) / 32 * 4;
 if (s.off + s.stride * s.h > b.size()) return false; int colors = used ? (int)used : 1 << bpp; size_t pal = 14 + hs; if (pal + (size_t)colors * 4 > b.size() || colors > 256) return false;
 lum.assign(256, 0); for (int i = 0; i < colors; i++) { int bl = b[pal + i * 4], g = b[pal + i * 4 + 1], r = b[pal + i * 4 + 2]; if (std::abs(r - g) > 8 || std::abs(g - bl) > 8) return false; lum[i] = (r + g + bl) / 3; } // grey levels only
 // ink per column and per row
 std::vector<int> col(s.w, 0), row(s.h, 0); long long ink = 0; for (int y = 0; y < s.h; y++) for (int x = 0; x < s.w; x++) if (lum[Px(b, s, x, y)] > 40) { col[x]++; row[y]++; ink++; }
 if (ink == 0 || ink > (long long)s.w * s.h / 2) return false; // glyphs are mostly background
 double best = 1e9; int bcw = 0, bch = 0;
 for (int cols : { 8, 16, 32, 64 }) { if (s.w % cols) continue; int cw = s.w / cols; if (cw < 8 || cw > 128) continue;
  for (int ch : { cw, cw * 2, cw / 2 }) { if (ch < 8 || s.h % ch || s.h / ch < 2) continue;
   double cb = 0, rb = 0; for (int x = 0; x < s.w; x += cw) cb += col[x] + col[x + cw - 1]; for (int y = 0; y < s.h; y += ch) rb += row[y] + row[y + ch - 1];
   double cm = (double)ink / s.w * 2 * (s.w / cw), rm = (double)ink / s.h * 2 * (s.h / ch); double score = (std::max)(cb / (cm + 1), rb / (rm + 1));
   // the finest grid whose boundaries stay (almost) empty: a coarser grid is a subset of its boundaries and scores as low
   if (score <= 0.2 && (!bcw || cw * ch < bcw * bch)) { best = score; bcw = cw; bch = ch; } } }
 if (!bcw || best > 0.2) return false; s.cw = bcw; s.ch = bch; s.dot = (std::max)(2, (s.ch * 3 + 16) / 32); return true;
}
static int DotSheet(std::vector<uint8_t> &b, Sheet &s, const std::vector<int> &lum) {
 int top = 0; for (int i = 1; i < 256; i++) if (lum[i] > lum[top]) top = i; int bg = 0; for (int i = 1; i < 256; i++) if (lum[i] < lum[bg]) bg = i;
 int faint = -1; for (int i = 0; i < 256; i++) if (lum[i] > lum[bg] && (faint < 0 || lum[i] < lum[faint])) faint = i; // the faintest non-background level
 int glyphs = 0;
 for (int cy = 0; cy + s.ch <= s.h; cy += s.ch) for (int cx = 0; cx + s.cw <= s.w; cx += s.cw) {
  int x0 = 1 << 30, y0 = 1 << 30, ex0 = 1 << 30, ey0 = 1 << 30, ex1 = -1, ey1 = -1; bool any = false; for (int pass = 0; pass < 2 && !any; pass++) { int thr = pass ? 40 : 128; for (int y = cy; y < cy + s.ch; y++) for (int x = cx; x < cx + s.cw; x++) if (lum[Px(b, s, x, y)] > thr) { any = true; x0 = (std::min)(x0, x); y0 = (std::min)(y0, y); } }
  for (int y = cy; y < cy + s.ch; y++) for (int x = cx; x < cx + s.cw; x++) if (lum[Px(b, s, x, y)] > 0) { ex0 = (std::min)(ex0, x); ey0 = (std::min)(ey0, y); ex1 = (std::max)(ex1, x); ey1 = (std::max)(ey1, y); }
  if (!any) continue; glyphs++;
  for (int y = cy; y < cy + s.ch; y++) for (int x = cx; x < cx + s.cw; x++) SetPx(b, s, x, y, bg);
  for (int y = y0; y < (std::min)(y0 + s.dot, cy + s.ch); y++) for (int x = x0; x < (std::min)(x0 + s.dot, cx + s.cw); x++) SetPx(b, s, x, y, top);
  // keep the glyph's ink box for engines that measure their glyphs from the sheet (BRUNS refuses a font whose glyphs
  // shrink to a dot): its four corners get the faintest grey, the dot stays the only visible mark
  if (faint >= 0 && ex1 >= 0) for (int k = 0; k < 4; k++) { int x = k & 1 ? ex1 : ex0, y = k & 2 ? ey1 : ey0; if (lum[Px(b, s, x, y)] == lum[bg]) SetPx(b, s, x, y, faint); }
 }
 s.glyphs = glyphs; return glyphs;
}
// The whole pipeline for one file's bytes: true when a dotted copy was made.
static bool Transform(const std::vector<uint8_t> &file, std::vector<uint8_t> &out, Sheet &s) {
 std::vector<uint8_t> inner; int kind; uint32_t key = 0; if (!Unwrap(file, inner, kind, key)) return false;
 std::vector<int> lum; if (!Detect(inner, s, lum)) return false; if (DotSheet(inner, s, lum) < 16) return false;
 Wrap(file, inner, kind, key, out); return true;
}
} // namespace fd

#ifndef FONTDOTS_CORE_ONLY
// ---- serving the copy through the game's own handle --------------------------------------------------------------------
struct VFile { std::shared_ptr<std::vector<uint8_t>> data; uint64_t pos; };
// VFiles, VCache and VNo have their own lock: the game's file reads (often an audio or loader thread) never wait for the
// draw hooks, which hold Lock while they decode and decide a draw.
static SRWLOCK VLock = SRWLOCK_INIT; struct VGuard { VGuard() { AcquireSRWLockExclusive(&VLock); } ~VGuard() { ReleaseSRWLockExclusive(&VLock); } };
static std::map<HANDLE, VFile> VFiles; static std::map<std::wstring, std::shared_ptr<std::vector<uint8_t>>> VCache; static std::set<std::wstring> VNo;
static bool FontDotsOn;
typedef HANDLE(WINAPI *CreateFileWF)(LPCWSTR, DWORD, DWORD, LPSECURITY_ATTRIBUTES, DWORD, DWORD, HANDLE);
typedef HANDLE(WINAPI *CreateFileAF)(LPCSTR, DWORD, DWORD, LPSECURITY_ATTRIBUTES, DWORD, DWORD, HANDLE);
typedef BOOL(WINAPI *ReadFileF)(HANDLE, LPVOID, DWORD, LPDWORD, LPOVERLAPPED);
typedef DWORD(WINAPI *SetFilePointerF)(HANDLE, LONG, PLONG, DWORD);
typedef BOOL(WINAPI *SetFilePointerExF)(HANDLE, LARGE_INTEGER, PLARGE_INTEGER, DWORD);
typedef DWORD(WINAPI *GetFileSizeF)(HANDLE, LPDWORD);
typedef BOOL(WINAPI *GetFileSizeExF)(HANDLE, PLARGE_INTEGER);
typedef BOOL(WINAPI *CloseHandleF)(HANDLE);
static CreateFileWF OCreateFileW; static CreateFileAF OCreateFileA; static ReadFileF OReadFile; static SetFilePointerF OSetFilePointer; static SetFilePointerExF OSetFilePointerEx; static GetFileSizeF OGetFileSize; static GetFileSizeExF OGetFileSizeEx; static CloseHandleF OCloseHandle;
// Reads the file through our own handle (the trampoline, so no recursion), once per path.
static std::shared_ptr<std::vector<uint8_t>> DottedCopy(const std::wstring &path) {
 std::wstring key = path; for (auto &c : key) c = towlower(c);
 { VGuard g; auto it = VCache.find(key); if (it != VCache.end()) return it->second; if (VNo.count(key)) return nullptr; }
 std::shared_ptr<std::vector<uint8_t>> res;
 HANDLE h = OCreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_EXISTING, 0, NULL);
 if (h != INVALID_HANDLE_VALUE) { LARGE_INTEGER sz = {}; if (OGetFileSizeEx(h, &sz) && sz.QuadPart >= 16 && sz.QuadPart <= (48ll << 20)) { uint8_t head[4]; DWORD got = 0; if (OReadFile(h, head, 4, &got, NULL) && got == 4 && ((head[0] == 'B' && head[1] == 'M') || (head[0] == 'E' && head[1] == 'E' && head[2] == 'N'))) {
   std::vector<uint8_t> f((size_t)sz.QuadPart); memcpy(f.data(), head, 4); DWORD rest = 0; if (OReadFile(h, f.data() + 4, (DWORD)f.size() - 4, &rest, NULL) && rest == f.size() - 4) { auto out = std::make_shared<std::vector<uint8_t>>(); fd::Sheet s = {}; if (fd::Transform(f, *out, s)) { wchar_t idn[4] = {}; GetEnvironmentVariableW(L"MEGULIT_FONT_DOTS_PROBE", idn, 4); if (idn[0] == L'1') *out = f; else if (idn[0] == L'2') { std::vector<uint8_t> in2; int kd; uint32_t ky; if (fd::Unwrap(f, in2, kd, ky)) fd::Wrap(f, in2, kd, ky, *out); } /* diagnostics: serve the original bytes through the same path */ res = out; char b[600]; std::string p8 = Utf8(path); snprintf(b, sizeof b, "ToMe_FONTDOTS sheet cells=%dx%d grid=%dx%d glyphs=%d dot=%d path=%s", s.cw, s.ch, s.w / s.cw, s.h / s.ch, s.glyphs, s.dot, p8.c_str()); Send(b); } } } }
  OCloseHandle(h); }
 VGuard g; if (res) VCache[key] = res; else { VNo.insert(key); if (VNo.size() > 20000) VNo.clear(); } return res;
}
static HANDLE Track(HANDLE h, const std::wstring &path, DWORD access, DWORD disp) {
 if (h == INVALID_HANDLE_VALUE || !FontDotsOn || (access & (GENERIC_WRITE | FILE_WRITE_DATA | FILE_APPEND_DATA)) || disp != OPEN_EXISTING) return h;
 auto d = DottedCopy(path); if (d) { VGuard g; VFiles[h] = VFile{ d, 0 }; } if (Diag) Log("open %s %S", d ? "DOTS" : "file", path.c_str()); return h;
}
static HANDLE WINAPI HCreateFileW(LPCWSTR n, DWORD a, DWORD sh, LPSECURITY_ATTRIBUTES sa, DWORD disp, DWORD fl, HANDLE t) { HANDLE h = OCreateFileW(n, a, sh, sa, disp, fl, t); return n ? Track(h, n, a, disp) : h; }
static HANDLE WINAPI HCreateFileA(LPCSTR n, DWORD a, DWORD sh, LPSECURITY_ATTRIBUTES sa, DWORD disp, DWORD fl, HANDLE t) {
 HANDLE h = OCreateFileA(n, a, sh, sa, disp, fl, t); if (!n || h == INVALID_HANDLE_VALUE || !FontDotsOn) return h;
 int k = MultiByteToWideChar(CP_ACP, 0, n, -1, NULL, 0); std::wstring w(k > 0 ? k - 1 : 0, 0); if (k > 1) MultiByteToWideChar(CP_ACP, 0, n, -1, &w[0], k); return Track(h, w, a, disp);
}
static BOOL WINAPI HReadFile(HANDLE h, LPVOID buf, DWORD n, LPDWORD read, LPOVERLAPPED ov) {
 { VGuard g; auto it = VFiles.find(h); if (it != VFiles.end() && !ov) { VFile &v = it->second; size_t sz = v.data->size(); DWORD k = v.pos >= sz ? 0 : (DWORD)(std::min)((uint64_t)n, sz - v.pos); if (k) memcpy(buf, v.data->data() + v.pos, k); v.pos += k; if (read) *read = k; return TRUE; } }
 return OReadFile(h, buf, n, read, ov);
}
static DWORD WINAPI HSetFilePointer(HANDLE h, LONG lo, PLONG hi, DWORD how) {
 { VGuard g; auto it = VFiles.find(h); if (it != VFiles.end()) { VFile &v = it->second; int64_t d = hi ? ((int64_t)*hi << 32) | (uint32_t)lo : lo; int64_t base = how == FILE_BEGIN ? 0 : how == FILE_CURRENT ? (int64_t)v.pos : (int64_t)v.data->size(); int64_t p = base + d; if (p < 0) { SetLastError(ERROR_NEGATIVE_SEEK); return INVALID_SET_FILE_POINTER; } v.pos = (uint64_t)p; if (hi) *hi = (LONG)(p >> 32); return (DWORD)p; } }
 return OSetFilePointer(h, lo, hi, how);
}
static BOOL WINAPI HSetFilePointerEx(HANDLE h, LARGE_INTEGER d, PLARGE_INTEGER np, DWORD how) {
 { VGuard g; auto it = VFiles.find(h); if (it != VFiles.end()) { VFile &v = it->second; int64_t base = how == FILE_BEGIN ? 0 : how == FILE_CURRENT ? (int64_t)v.pos : (int64_t)v.data->size(); int64_t p = base + d.QuadPart; if (p < 0) { SetLastError(ERROR_NEGATIVE_SEEK); return FALSE; } v.pos = (uint64_t)p; if (np) np->QuadPart = p; return TRUE; } }
 return OSetFilePointerEx(h, d, np, how);
}
static DWORD WINAPI HGetFileSize(HANDLE h, LPDWORD hi) { { VGuard g; auto it = VFiles.find(h); if (it != VFiles.end()) { uint64_t sz = it->second.data->size(); if (hi) *hi = (DWORD)(sz >> 32); return (DWORD)sz; } } return OGetFileSize(h, hi); }
static BOOL WINAPI HGetFileSizeEx(HANDLE h, PLARGE_INTEGER s) { { VGuard g; auto it = VFiles.find(h); if (it != VFiles.end()) { s->QuadPart = (LONGLONG)it->second.data->size(); return TRUE; } } return OGetFileSizeEx(h, s); }
static BOOL WINAPI HCloseHandle(HANDLE h) { { VGuard g; VFiles.erase(h); } return OCloseHandle(h); }
// Diagnostics only: which strings the engine still sends through GDI (an engine may mix sheet fonts and system fonts).
typedef BOOL(WINAPI *TextOutWF)(HDC, int, int, LPCWSTR, int); static TextOutWF OTextOutW; static volatile LONG TextOutCalls;
static BOOL WINAPI HTextOutW(HDC dc, int x, int y, LPCWSTR s, int n) { LONG k = InterlockedIncrement(&TextOutCalls); if (Diag && k < 40 && s && n > 0) Log("TextOutW %d,%d %.*S", x, y, (std::min)(n, 40), s); return OTextOutW(dc, x, y, s, n); }
static int InstallFontDots() {
 int n = 0; HMODULE k = GetModuleHandleW(L"kernel32.dll"); auto hk = [&](const char *name, void *hook, void **orig) { void *t = (void *)GetProcAddress(k, name); if (t && MH_CreateHook(t, hook, orig) == MH_OK && MH_QueueEnableHook(t) == MH_OK) n++; };
 hk("CreateFileW", (void *)HCreateFileW, (void **)&OCreateFileW); hk("CreateFileA", (void *)HCreateFileA, (void **)&OCreateFileA); hk("ReadFile", (void *)HReadFile, (void **)&OReadFile);
 hk("SetFilePointer", (void *)HSetFilePointer, (void **)&OSetFilePointer); hk("SetFilePointerEx", (void *)HSetFilePointerEx, (void **)&OSetFilePointerEx); hk("GetFileSize", (void *)HGetFileSize, (void **)&OGetFileSize);
 hk("GetFileSizeEx", (void *)HGetFileSizeEx, (void **)&OGetFileSizeEx); hk("CloseHandle", (void *)HCloseHandle, (void **)&OCloseHandle);
 if (Diag) { void *t = (void *)GetProcAddress(GetModuleHandleW(L"gdi32.dll"), "TextOutW"); if (t && MH_CreateHook(t, (void *)HTextOutW, (void **)&OTextOutW) == MH_OK) MH_QueueEnableHook(t); }
 return Apply() ? n : 0;
}
#endif
