// SPDX-License-Identifier: GPL-3.0-or-later
// Early-injection self-test: started through MeguLitLaunch<bit>.exe with MEGULIT_GLYPH_MODE=dot-blind and
// MEGULIT_GLYPH_FONT="28 <face>". Its very first act is to rasterise a glyph in the dialogue font, as an engine filling
// its glyph cache at start-up would; that glyph must retain its pixels without any confirmed dialogue line, while the same
// glyph in another size stays real. Writes PASS or FAIL <n> to <result file>. Usage: earlyhost.exe <face> <result file>
#include <windows.h>
#include <stdio.h>
#include <vector>
static int Coverage(HDC dc, wchar_t c, int &blackX, int &blackY) {
 MAT2 m = {{0, 1}, {0, 0}, {0, 0}, {0, 1}}; GLYPHMETRICS gm{}; DWORD n = GetGlyphOutlineW(dc, c, GGO_GRAY8_BITMAP, &gm, 0, NULL, &m);
 if (n == GDI_ERROR || !n) return -1; std::vector<BYTE> b(n); GetGlyphOutlineW(dc, c, GGO_GRAY8_BITMAP, &gm, n, b.data(), &m);
 blackX = gm.gmBlackBoxX; blackY = gm.gmBlackBoxY; int k = 0; for (BYTE x : b) if (x) k++; return k;
}
int wmain(int argc, wchar_t **argv) {
 const wchar_t *face = argc > 1 ? argv[1] : L"MS Gothic";
 HDC dc = CreateCompatibleDC(NULL);
 HFONT dialogue = CreateFontW(-28, 0, 0, 0, 400, 0, 0, 0, SHIFTJIS_CHARSET, 0, 0, ANTIALIASED_QUALITY, 0, face);
 HFONT menu = CreateFontW(-16, 0, 0, 0, 400, 0, 0, 0, SHIFTJIS_CHARSET, 0, 0, ANTIALIASED_QUALITY, 0, face);
 SelectObject(dc, dialogue); int bx = 0, by = 0, first = Coverage(dc, L'見', bx, by);
 SelectObject(dc, menu); int mx = 0, my = 0, other = Coverage(dc, L'見', mx, my);
 bool loaded = GetModuleHandleW(sizeof(void *) == 8 ? L"MeguLitFont64.dll" : L"MeguLitFont32.dll") != NULL;
 int failed = 0;
 printf("%s DLL loaded before the main thread ran\n", loaded ? "ok  " : "FAIL"); failed += !loaded;
 bool dot = first > 20 && bx > 9; printf("%s first glyph without a dialogue line stays real (%d px inked of a %dx%d box)\n", dot ? "ok  " : "FAIL", first, bx, by); failed += !dot;
 bool real = other > 20; printf("%s same glyph in another size stays real (%d px)\n", real ? "ok  " : "FAIL", other); failed += !real;
 if (argc > 2) { FILE *f = NULL; if (!_wfopen_s(&f, argv[2], L"w") && f) { fprintf(f, failed ? "FAIL %d\n" : "PASS\n", failed); fclose(f); } }
 return failed;
}
