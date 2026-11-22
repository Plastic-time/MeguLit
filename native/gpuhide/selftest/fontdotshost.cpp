// SPDX-License-Identifier: GPL-3.0-or-later
// Self-test for font dots at the source (FontDots.h): fontdotshost.exe <MeguLitGpu dll>
// Writes three files to %TEMP%: a 4-bit grey glyph sheet (16 x 4 cells of 32 x 32, glyphs = filled rectangles) wrapped
// in EENZ, the same sheet as a plain BMP, and a non-sheet picture (noise). With MEGULIT_FONT_DOTS=1 it loads the DLL,
// waits for MeguLitFontReady-<pid>, then reads each file the way engines do (CreateFile, GetFileSize, ReadFile in parts,
// SetFilePointer). Asserted: both sheets come back with every glyph cell replaced by a 3 x 3 dot at the glyph's top-left
// in the brightest colour, the glyph's ink box kept by its other three corners in the faintest grey, nothing else; the picture comes back unchanged; the files on disk unchanged.
#include <windows.h>
#include <vector>
#include <algorithm>
#include <string>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#define FONTDOTS_CORE_ONLY
#include "../FontDots.h"
static int Fails;
static void Check(bool ok, const char *what) { printf("%s %s\n", ok ? "PASS" : "FAIL", what); if (!ok) Fails++; }
static const int W = 512, H = 128, CW = 32, CH = 32;
static std::vector<uint8_t> Bmp(bool sheet) {
 size_t stride = W / 2, off = 14 + 40 + 16 * 4; std::vector<uint8_t> b(off + stride * H, 0);
 b[0] = 'B'; b[1] = 'M'; *(uint32_t *)&b[2] = (uint32_t)b.size(); *(uint32_t *)&b[10] = (uint32_t)off; *(uint32_t *)&b[14] = 40; *(int32_t *)&b[18] = W; *(int32_t *)&b[22] = H; *(uint16_t *)&b[26] = 1; *(uint16_t *)&b[28] = 4; *(uint32_t *)&b[46] = 16;
 for (int i = 0; i < 16; i++) { uint8_t v = (uint8_t)(i * 17); b[54 + i * 4] = v; b[55 + i * 4] = v; b[56 + i * 4] = v; }
 auto set = [&](int x, int y, int v) { uint8_t &c = b[off + (size_t)(H - 1 - y) * stride + x / 2]; c = x & 1 ? (uint8_t)((c & 0xF0) | v) : (uint8_t)((c & 0x0F) | (v << 4)); };
 if (sheet) { for (int cy = 0; cy < H / CH; cy++) for (int cx = 0; cx < W / CW; cx++) { if ((cx + cy) % 7 == 3) continue; /* empty cells (spaces) */ int gx = cx * CW + 4 + cx % 3, gy = cy * CH + 5 + cy % 2; for (int y = gy; y < gy + 20; y++) for (int x = gx; x < gx + 18; x++) set(x, y, (x + y) % 5 ? 15 : 9); } }
 else { unsigned r = 12345; for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) { r = r * 1103515245 + 12345; set(x, y, (r >> 16) & 15); } }
 return b;
}
static std::vector<uint8_t> Eenz(const std::vector<uint8_t> &inner) { std::vector<uint8_t> z; fd::Zlib(inner, z); uint32_t key = 0x1234ABCD; std::vector<uint8_t> out = { 'E', 'E', 'N', 'Z' }; uint32_t stored = key ^ 0xDEADBEEFu; for (int i = 0; i < 4; i++) out.push_back((uint8_t)(stored >> (i * 8))); for (size_t i = 0; i < z.size(); i++) out.push_back(z[i] ^ (uint8_t)(key >> ((i & 3) * 8))); return out; }
static std::wstring Write(const wchar_t *name, const std::vector<uint8_t> &d) { wchar_t t[MAX_PATH]; GetTempPathW(MAX_PATH, t); std::wstring p = std::wstring(t) + name; HANDLE h = CreateFileW(p.c_str(), GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, 0, NULL); DWORD w; WriteFile(h, d.data(), (DWORD)d.size(), &w, NULL); CloseHandle(h); return p; }
// Read as an engine does: size first, header, seek back, then the rest in two parts.
static std::vector<uint8_t> Read(const std::wstring &p) {
 HANDLE h = CreateFileW(p.c_str(), GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL); std::vector<uint8_t> d; if (h == INVALID_HANDLE_VALUE) return d;
 DWORD sz = GetFileSize(h, NULL); d.resize(sz); DWORD got = 0; uint8_t head[8]; ReadFile(h, head, 8, &got, NULL); SetFilePointer(h, 0, NULL, FILE_BEGIN);
 DWORD half = sz / 2, a = 0, b2 = 0; ReadFile(h, d.data(), half, &a, NULL); ReadFile(h, d.data() + half, sz - half, &b2, NULL); if (a + b2 != sz || memcmp(head, d.data(), 8)) d.clear(); CloseHandle(h); return d;
}
static bool Dotted(const std::vector<uint8_t> &bmp, const char *label) {
 fd::Sheet s = {}; std::vector<int> lum; if (!fd::Detect(bmp, s, lum) && !(bmp.size() > 54)) return false;
 size_t stride = W / 2, off = *(const uint32_t *)&bmp[10]; auto px = [&](int x, int y) { uint8_t c = bmp[off + (size_t)(H - 1 - y) * stride + x / 2]; return x & 1 ? c & 15 : c >> 4; };
 int bad = 0, dots = 0;
 for (int cy = 0; cy < H / CH; cy++) for (int cx = 0; cx < W / CW; cx++) { bool empty = (cx + cy) % 7 == 3; int gx = cx * CW + 4 + cx % 3, gy = cy * CH + 5 + cy % 2;
  for (int y = cy * CH; y < cy * CH + CH; y++) for (int x = cx * CW; x < cx * CW + CW; x++) { bool inDot = !empty && x >= gx && x < gx + 3 && y >= gy && y < gy + 3; bool corner = !empty && (x == gx || x == gx + 17) && (y == gy || y == gy + 19) && !inDot; int v = px(x, y); if (inDot ? v != 15 : corner ? v != 1 : v != 0) bad++; }
  if (!empty) dots++; }
 char b[200]; snprintf(b, sizeof b, "%s: every glyph cell is one 3x3 dot at the glyph's top-left, ink box kept by faint corners (%d cells, %d wrong pixels)", label, dots, bad); Check(bad == 0, b); return bad == 0;
}
int wmain(int argc, wchar_t **argv) {
 if (argc < 2) return 2; printf("font dots (%d-bit)\n", (int)sizeof(void *) * 8); fflush(stdout);
 std::vector<uint8_t> sheet = Bmp(true), pic = Bmp(false), eenz = Eenz(sheet);
 std::wstring pe = Write(L"megulit-fontdots-a.bmp", eenz), pb = Write(L"megulit-fontdots-b.bmp", sheet), pp = Write(L"megulit-fontdots-c.bmp", pic);
 SetEnvironmentVariableW(L"MEGULIT_FONT_DOTS", L"1"); wchar_t ev[64]; swprintf_s(ev, L"MeguLitFontReady-%lu", GetCurrentProcessId()); HANDLE ready = CreateEventW(NULL, TRUE, FALSE, ev);
 if (!LoadLibraryW(argv[1])) { printf("FAIL cannot load the DLL\n"); return 1; }
 Check(WaitForSingleObject(ready, 10000) == WAIT_OBJECT_0, "font dots ready before the game would run (MeguLitFontReady event)");
 std::vector<uint8_t> re = Read(pe), rb = Read(pb), rp = Read(pp);
 std::vector<uint8_t> inner; int kind; uint32_t key; Check(fd::Unwrap(re, inner, kind, key) && kind == 2, "EENZ sheet still reads as EENZ (stored zlib, same key)");
 if (!inner.empty()) { Check(inner.size() == sheet.size(), "EENZ sheet: same bitmap size"); Dotted(inner, "EENZ sheet"); }
 Check(rb.size() == sheet.size(), "plain BMP sheet: same size"); if (rb.size() == sheet.size()) Dotted(rb, "plain BMP sheet");
 Check(rp == pic, "a picture that is not a glyph sheet is served unchanged");
 HANDLE h = CreateFileW(pe.c_str(), GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL); LARGE_INTEGER sz = {}; GetFileSizeEx(h, &sz); CloseHandle(h);
 Check(sz.QuadPart == (LONGLONG)re.size(), "GetFileSizeEx reports the served size");
 // the files on disk are untouched (read them through a handle the DLL does not serve: FILE_SHARE_WRITE + write access)
 auto raw = [](const std::wstring &p) { std::vector<uint8_t> d; HANDLE h = CreateFileW(p.c_str(), GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL); if (h == INVALID_HANDLE_VALUE) return d; d.resize(GetFileSize(h, NULL)); DWORD g; ReadFile(h, d.data(), (DWORD)d.size(), &g, NULL); CloseHandle(h); return d; };
 Check(raw(pe) == eenz && raw(pb) == sheet && raw(pp) == pic, "nothing on disk changed");
 DeleteFileW(pe.c_str()); DeleteFileW(pb.c_str()); DeleteFileW(pp.c_str());
 printf(Fails ? "RESULT FAIL %d\n" : "RESULT PASS\n", Fails); fflush(stdout); TerminateProcess(GetCurrentProcess(), Fails ? 1 : 0); return Fails ? 1 : 0;
}
