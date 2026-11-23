// SPDX-License-Identifier: GPL-3.0-or-later
// Self-test for glyph dots (MODE dot) in MeguLitFont<bit>.dll, without a game and without a window: plays HookBridge
// (serves both pipes, sends MODE dot + FONT + one LINE per case), draws that line through one API per case into an
// off-screen DIB, saves the DIB as PNG and checks it: exactly one dot per non-blank character of the line, each a solid
// square of at most DotSide x DotSide pixels at the expected position (the character's black box top-left for GDI, its
// layout box top-left for GDI+ and Direct2D, +-1 px), and no other ink. Then checks the ToMe_GLYPHDOT report of every
// case (index, character, kind) and that menu text and metrics stay untouched.
// Placement (MODE blank, MODE blank-blind; "place" is an alias): the same lines leave no ink at all (blank glyphs, metrics kept) and every
// character is still reported once, with its cell top-left in the right space: a memory DIB (m<W>x<H>), a hidden
// window's client area mapped to its top-level window (c), a Direct2D DC target (t<W>x<H>); GetGlyphOutline has none (-).
// Usage: dothost.exe <MeguLitFont dll> [folder for the PNGs]   (spec: docs/text-architecture.md)
#include <windows.h>
#include <gdiplus.h>
#include <d2d1.h>
#include <dwrite.h>
#include <stdio.h>
#include <string>
#include <vector>
#include <map>
#include <algorithm>
static std::string Got; static SRWLOCK GotLock = SRWLOCK_INIT;
static bool Has(const char *t) { AcquireSRWLockShared(&GotLock); bool r = Got.find(t) != std::string::npos; ReleaseSRWLockShared(&GotLock); return r; }
static HANDLE Ctl = INVALID_HANDLE_VALUE;
static int Failed = 0;
static void Check(bool ok, const std::string &what) { printf("%s %s\n", ok ? "ok  " : "FAIL", what.c_str()); if (!ok) Failed++; }
DWORD WINAPI Listen(void *) {
 wchar_t name[64]; swprintf_s(name, L"\\\\.\\pipe\\MeguLitFont-%lu", GetCurrentProcessId());
 HANDLE p = CreateNamedPipeW(name, PIPE_ACCESS_INBOUND, PIPE_TYPE_BYTE, 1, 0, 65536, 0, NULL);
 if (p == INVALID_HANDLE_VALUE || !ConnectNamedPipe(p, NULL) && GetLastError() != ERROR_PIPE_CONNECTED) return 1;
 char buf[4096]; DWORD n; while (ReadFile(p, buf, sizeof buf, &n, NULL) && n) { AcquireSRWLockExclusive(&GotLock); Got.append(buf, n); ReleaseSRWLockExclusive(&GotLock); }
 return 0;
}
static std::string Utf8(const std::wstring &w) { int n = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), NULL, 0, NULL, NULL); std::string s(n, 0); WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), &s[0], n, NULL, NULL); return s; }
static void Push(const std::string &l) { std::string d = l + "\n"; DWORD done = 0; WriteFile(Ctl, d.data(), (DWORD)d.size(), &done, NULL); Sleep(120); }
static const int W = 1000, H = 90, Side = 3, X0 = 20, Y0 = 20;
static HDC Dc; static DWORD *Bits; static HBITMAP Bmp; static const wchar_t *Face = L"MS Gothic";
static void Clear() { GdiFlush(); for (int i = 0; i < W * H; i++) Bits[i] = 0xffffffff; }
static bool InkAt(int x, int y) { return (Bits[y * W + x] & 0xff) < 128; }
static int Ink() { GdiFlush(); int n = 0; for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) n += InkAt(x, y); return n; }
struct Blob { int x0, y0, x1, y1, n; };
static std::vector<Blob> Blobs() {
 GdiFlush(); std::vector<char> seen(W * H); std::vector<Blob> out;
 for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) if (InkAt(x, y) && !seen[y * W + x]) {
  Blob b{x, y, x, y, 0}; std::vector<int> st{y * W + x}; seen[y * W + x] = 1;
  while (!st.empty()) { int p = st.back(); st.pop_back(); int px = p % W, py = p / W; b.n++; b.x0 = (std::min)(b.x0, px); b.x1 = (std::max)(b.x1, px); b.y0 = (std::min)(b.y0, py); b.y1 = (std::max)(b.y1, py);
   for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) { int qx = px + dx, qy = py + dy; if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue; int q = qy * W + qx; if (!seen[q] && InkAt(qx, qy)) { seen[q] = 1; st.push_back(q); } } }
  out.push_back(b); }
 return out;
}
static CLSID PngClsid() { CLSID c; CLSIDFromString(L"{557CF406-1A04-11D3-9A73-0000F81EF32E}", &c); return c; }
static std::wstring Shots;
static void Save(const char *name) {
 if (Shots.empty()) return; GdiFlush(); Gdiplus::GpBitmap *bmp = NULL; Gdiplus::DllExports::GdipCreateBitmapFromHBITMAP(Bmp, NULL, &bmp); if (!bmp) return;
 std::wstring path = Shots + L"\\dots-" + std::wstring(name, name + strlen(name)) + (sizeof(void *) == 8 ? L"-x64.png" : L"-x86.png"); CLSID png = PngClsid();
 Gdiplus::DllExports::GdipSaveImageToFile(bmp, path.c_str(), &png, NULL); Gdiplus::DllExports::GdipDisposeImage(bmp);
}
// The image holds exactly expected.size() solid dots of at most Side x Side, each within 1 px of its expected top-left.
static void Dots(const char *name, const std::vector<POINT> &expected) {
 Save(name); auto blobs = Blobs(); bool shape = true, place = true; std::vector<bool> used(blobs.size());
 for (auto &b : blobs) { int w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1; if (w > Side || h > Side || b.n != w * h) shape = false; }
 for (auto &e : expected) { bool hit = false; for (size_t i = 0; i < blobs.size(); i++) if (!used[i] && abs(blobs[i].x0 - e.x) <= 1 && abs(blobs[i].y0 - e.y) <= 1) { used[i] = hit = true; break; } if (!hit) { place = false; printf("     missing dot at %ld,%ld\n", e.x, e.y); } }
 if (!place || blobs.size() != expected.size()) for (auto &b : blobs) printf("     blob %d,%d %dx%d n=%d\n", b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1, b.n);
 Check(blobs.size() == expected.size() && shape && place, std::string(name) + ": exactly " + std::to_string(expected.size()) + " solid dots (<= 3x3) at the expected positions, nothing else (" + std::to_string(blobs.size()) + " found)");
}
static const MAT2 Id = {{0, 1}, {0, 0}, {0, 0}, {0, 1}};
static TEXTMETRICW Tm;
struct Metric { GLYPHMETRICS gm; int adv; };
static std::map<wchar_t, Metric> Metrics; // measured before any line is pushed (the hooked calls then never touch a line)
struct Plain { GLYPHMETRICS gm; DWORD size; };
static std::map<std::pair<wchar_t, UINT>, Plain> Plains; // per character and GGO format, before any line: what the dot glyph must keep
static void Measure(const std::wstring &s) { for (wchar_t c : s) if (!Metrics.count(c)) { Metric m{}; GetGlyphOutlineW(Dc, c, GGO_METRICS, &m.gm, 0, NULL, &Id); SIZE z{}; GetTextExtentPoint32W(Dc, &c, 1, &z); m.adv = z.cx; Metrics[c] = m; } }
// GDI expectation: black box top-left of each character drawn from (x, top) at its advance.
static std::vector<POINT> GdiExpected(const std::wstring &s, int x, int top, const std::vector<int> *dx = NULL) {
 std::vector<POINT> out; int pen = x; for (size_t i = 0; i < s.size(); i++) { auto &m = Metrics[s[i]]; out.push_back({pen + m.gm.gmptGlyphOrigin.x, top + Tm.tmAscent - m.gm.gmptGlyphOrigin.y}); pen += dx ? (*dx)[i] : m.adv; } return out;
}
// The host as an engine: GetGlyphOutline per character (size query, then the buffer), blitted at pen + origin.
static void DrawGgo(const std::wstring &s, UINT format, int x, int base, std::vector<POINT> &expect, bool &metricsSame) {
 int pen = x;
 for (wchar_t c : s) {
  GLYPHMETRICS gm{}; DWORD n = GetGlyphOutlineW(Dc, c, format, &gm, 0, NULL, &Id); std::vector<BYTE> b(n ? n : 1); DWORD r = n ? GetGlyphOutlineW(Dc, c, format, &gm, n, b.data(), &Id) : 0;
  auto &m = Plains[{c, format}]; if (memcmp(&gm, &m.gm, sizeof gm) || n != m.size || r != n) metricsSame = false;
  int left = pen + gm.gmptGlyphOrigin.x, top = base - gm.gmptGlyphOrigin.y; UINT kind = format & 0x0f; expect.push_back({left, top});
  if (kind == GGO_NATIVE || kind == GGO_BEZIER) {
   const BYTE *p = b.data(), *end = p + (r == GDI_ERROR ? 0 : r); std::vector<POINT> pts; std::vector<INT> counts;
   auto fx = [](FIXED f) { return f.value + f.fract / 65536.0; };
   while (p + sizeof(TTPOLYGONHEADER) <= end) { auto *h = (const TTPOLYGONHEADER *)p; if (h->cb < sizeof(TTPOLYGONHEADER) || p + h->cb > end) break; size_t first = pts.size(); pts.push_back({(LONG)(pen + fx(h->pfxStart.x)), (LONG)(base - fx(h->pfxStart.y))});
    const BYTE *q = p + sizeof(TTPOLYGONHEADER), *e = p + h->cb; while (q + 4 <= e) { auto *cv = (const TTPOLYCURVE *)q; for (WORD i = 0; i < cv->cpfx; i++) pts.push_back({(LONG)(pen + fx(cv->apfx[i].x)), (LONG)(base - fx(cv->apfx[i].y))}); q += 4 + sizeof(POINTFX) * cv->cpfx; }
    counts.push_back((INT)(pts.size() - first)); p += h->cb; }
   if (!counts.empty()) { SelectObject(Dc, GetStockObject(BLACK_BRUSH)); SelectObject(Dc, GetStockObject(NULL_PEN)); SetPolyFillMode(Dc, WINDING); PolyPolygon(Dc, pts.data(), counts.data(), (int)counts.size()); }
  } else {
   int bx = gm.gmBlackBoxX, by = gm.gmBlackBoxY; int pitch = kind == GGO_BITMAP ? ((bx + 31) / 32) * 4 : (bx + 3) & ~3; int full = kind == GGO_GRAY2_BITMAP ? 4 : kind == GGO_GRAY4_BITMAP ? 16 : 64;
   for (int yy = 0; yy < by; yy++) for (int xx = 0; xx < bx; xx++) { int v = kind == GGO_BITMAP ? ((b[yy * pitch + xx / 8] >> (7 - xx % 8)) & 1) * full : b[yy * pitch + xx]; int px = left + xx, py = top + yy;
    if (v && px >= 0 && py >= 0 && px < W && py < H) { BYTE g = (BYTE)(255 - 255 * v / full); Bits[py * W + px] = 0xff000000 | (g << 16) | (g << 8) | g; } }
  }
  pen += gm.gmCellIncX;
 }
}
static std::wstring A = L"吾輩は猫である。名前はまだ無い。", B = L"どこで生れたかとんと見当がつかぬ。";
static int Seq = 0; static std::map<int, std::wstring> SeqText; static std::map<int, std::string> SeqPath;
struct Place { std::vector<POINT> at; std::string sp; }; static std::map<int, Place> Placed; // seq -> expected cell origins (MODE blank)
// A live compositor heartbeat for the whole run (the DLL's 20 s no-heartbeat grace must not decide the dot cases on a
// slow machine); the heartbeat case pauses the ticker and drives the beat by hand.
struct Beat { DWORD magic, version, pid, presenting; unsigned long long tick, frames; }; static Beat *Bt; static volatile LONG Ticking = 1;
DWORD WINAPI Ticker(void *) { for (;;) { if (Ticking && Bt) { Bt->presenting = 1; Bt->tick = GetTickCount64(); Bt->frames++; } Sleep(100); } }
static const std::wstring &Next(const char *path) { const std::wstring &l = (++Seq % 2) ? A : B; SeqText[Seq] = l; SeqPath[Seq] = path; Push("LINE " + Utf8(l)); return l; }
int wmain(int argc, wchar_t **argv) {
 if (argc < 2) return 2;
 if (argc > 2) { Shots = argv[2]; CreateDirectoryW(Shots.c_str(), NULL); }
 ULONG_PTR token; Gdiplus::GdiplusStartupInput in; Gdiplus::GdiplusStartup(&token, &in, NULL);
 ID2D1Factory *d2 = NULL; D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED, &d2); IDWriteFactory *dw = NULL; DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED, __uuidof(IDWriteFactory), (IUnknown **)&dw);
 CreateThread(NULL, 0, Listen, NULL, 0, NULL);
 { wchar_t bn[64]; swprintf_s(bn, L"Local\\MeguLitCompositorBeat-%lu", GetCurrentProcessId()); HANDLE bm = CreateFileMappingW(INVALID_HANDLE_VALUE, NULL, PAGE_READWRITE, 0, sizeof(Beat), bn);
  Bt = bm ? (Beat *)MapViewOfFile(bm, FILE_MAP_WRITE, 0, 0, sizeof(Beat)) : NULL; if (Bt) { *Bt = {0x4243474D, 1, GetCurrentProcessId(), 1, GetTickCount64(), 1}; { HANDLE tk = CreateThread(NULL, 0, Ticker, NULL, 0, NULL); if (tk) SetThreadPriority(tk, THREAD_PRIORITY_TIME_CRITICAL); } } }
 wchar_t name[64]; swprintf_s(name, L"\\\\.\\pipe\\MeguLitFontCtl-%lu", GetCurrentProcessId());
 Ctl = CreateNamedPipeW(name, PIPE_ACCESS_OUTBOUND, PIPE_TYPE_BYTE, 1, 65536, 0, 0, NULL);
 Sleep(100);
 HMODULE dll = LoadLibraryW(argv[1]); if (!dll) { printf("load failed\n"); return 3; }
 typedef DWORD(__cdecl * VER)(); VER ver = (VER)GetProcAddress(dll, "MeguLitFontVersion"); DWORD version = ver ? ver() : 0;
 Check(version >= 3, "exports MeguLitFontVersion >= 3 (glyph dots)"); printf("version %lu\n", version);
 if (version < 3) { printf("FAIL old DLL\n"); return 5; }
 if (!ConnectNamedPipe(Ctl, NULL) && GetLastError() != ERROR_PIPE_CONNECTED) { printf("control pipe not connected\n"); return 4; }
 // Late hooks (GDI+, DirectWrite, Direct2D) are set up by the DLL once a second: wait until all three say so (a loaded
 // machine can take many seconds), otherwise the GDI+/Direct2D cases would be drawn before their hooks exist.
 for (int i = 0; i < 600 && !(Has("status gdiplus hooked") && Has("status dwrite hooked") && Has("status d2d1 hooked")); i++) Sleep(100);
 Check(Has("status d2d1 hooked text run") && Has("status gdiplus hooked"), "late hooks in place (GDI+, Direct2D text and glyph runs)");
 BITMAPINFO bi{}; bi.bmiHeader = {sizeof(BITMAPINFOHEADER), W, -H, 1, 32, BI_RGB};
 Dc = CreateCompatibleDC(NULL); Bmp = CreateDIBSection(Dc, &bi, DIB_RGB_COLORS, (void **)&Bits, NULL, 0); SelectObject(Dc, Bmp);
 bool japanese = false;
 for (const wchar_t *f : {L"MS Gothic", L"Yu Gothic", L"Meiryo", L"MS Mincho"}) {
  HFONT probe = CreateFontW(-28, 0, 0, 0, 400, 0, 0, 0, DEFAULT_CHARSET, 0, 0, ANTIALIASED_QUALITY, 0, f); HGDIOBJ old = SelectObject(Dc, probe); wchar_t got[64] = {}; GetTextFaceW(Dc, 64, got); WORD gi = 0xffff; GetGlyphIndicesW(Dc, L"猫", 1, &gi, GGI_MARK_NONEXISTING_GLYPHS); SelectObject(Dc, old); DeleteObject(probe);
  if (!_wcsicmp(got, f) && gi != 0xffff) { Face = f; japanese = true; break; } }
 if (!japanese) { printf("SKIP drawing checks: no Japanese font on this machine\n"); printf(Failed ? "FAIL %d\n" : "PASS\n", Failed); return Failed ? 1 : 0; }
 printf("font %ls\n", Face);
 HFONT dialogue = CreateFontW(-28, 0, 0, 0, 400, 0, 0, 0, SHIFTJIS_CHARSET, 0, 0, ANTIALIASED_QUALITY, 0, Face);
 SetBkMode(Dc, TRANSPARENT); SetTextColor(Dc, 0); SelectObject(Dc, dialogue); GetTextMetricsW(Dc, &Tm);
 Measure(A); Measure(B); Measure(L"セーブロード");
 for (UINT f : {GGO_GRAY8_BITMAP, GGO_GRAY4_BITMAP, GGO_GRAY2_BITMAP, GGO_BITMAP, GGO_NATIVE, GGO_BEZIER}) for (const std::wstring *l : {&A, &B}) for (wchar_t c : *l) { Plain p{}; p.size = GetGlyphOutlineW(Dc, c, f, &p.gm, 0, NULL, &Id); Plains[{c, f}] = p; }
 Push("MODE dot"); { char seed[96]; sprintf_s(seed, "FONT 28 %ls", Face); Push(seed); }
 const int base = Y0 + Tm.tmAscent;

 struct { UINT format; const char *name; } ggo[] = {{GGO_GRAY8_BITMAP, "ggo-gray8"}, {GGO_GRAY4_BITMAP, "ggo-gray4"}, {GGO_GRAY2_BITMAP, "ggo-gray2"}, {GGO_BITMAP, "ggo-mono"}, {GGO_NATIVE, "ggo-native"}, {GGO_BEZIER, "ggo-bezier"}};
 for (auto &g : ggo) { const std::wstring &l = Next("ggo"); Clear(); std::vector<POINT> e; bool same = true; DrawGgo(l, g.format, X0, base, e, same); Dots(g.name, e); Check(same, std::string(g.name) + ": dot glyph keeps the original metrics and buffer size"); }

 { const std::wstring &l = Next("text"); Clear(); TextOutW(Dc, X0, Y0, l.c_str(), (int)l.size()); Dots("textoutw", GdiExpected(l, X0, Y0)); }
 { const std::wstring &l = Next("text"); Clear(); std::vector<int> dx(l.size(), 31); ExtTextOutW(Dc, X0, Y0, 0, NULL, l.c_str(), (UINT)l.size(), dx.data()); Dots("exttextoutw-dx", GdiExpected(l, X0, Y0, &dx)); }
 { const std::wstring &l = Next("text"); Clear(); std::vector<WORD> gi(l.size()); GetGlyphIndicesW(Dc, l.c_str(), (int)l.size(), gi.data(), 0); ExtTextOutW(Dc, X0, Y0, ETO_GLYPH_INDEX, NULL, (LPCWSTR)gi.data(), (UINT)gi.size(), NULL); Dots("exttextoutw-glyphindex", GdiExpected(l, X0, Y0)); }
 { const std::wstring &l = Next("text"); Clear(); SetTextAlign(Dc, TA_BASELINE); TextOutW(Dc, X0, base, l.c_str(), (int)l.size()); SetTextAlign(Dc, TA_TOP); Dots("textoutw-baseline", GdiExpected(l, X0, Y0)); }
 { const std::wstring &l = Next("text"); Clear(); int n = WideCharToMultiByte(932, 0, l.c_str(), (int)l.size(), NULL, 0, NULL, NULL); std::string sj(n, 0); WideCharToMultiByte(932, 0, l.c_str(), (int)l.size(), &sj[0], n, NULL, NULL); TextOutA(Dc, X0, Y0, sj.c_str(), n); Dots("textouta-sjis", GdiExpected(l, X0, Y0)); }
 { const std::wstring &l = Next("text"); Clear(); RECT r = {X0, Y0, W, H}; DrawTextW(Dc, l.c_str(), (int)l.size(), &r, DT_LEFT | DT_TOP | DT_SINGLELINE | DT_NOPREFIX); Dots("drawtextw", GdiExpected(l, X0, Y0)); }
 { const std::wstring &l = Next("text"); Clear(); int pen = X0; std::vector<POINT> e; for (wchar_t c : l) { TextOutW(Dc, pen, Y0, &c, 1); auto &m = Metrics[c]; e.push_back({pen + m.gm.gmptGlyphOrigin.x, Y0 + Tm.tmAscent - m.gm.gmptGlyphOrigin.y}); pen += m.adv; } Dots("textoutw-per-char", e); }
 { Clear(); TextOutW(Dc, X0, Y0, L"セーブ　ロード", 7); Save("menu-untouched"); Check(Ink() > 200, "menu string in the dialogue font while a line is pushed: drawn normally (no dots)"); }

 { using namespace Gdiplus; GpGraphics *g = NULL; DllExports::GdipCreateFromHDC(Dc, &g); GpFontFamily *fam = NULL; DllExports::GdipCreateFontFamilyFromName(Face, NULL, &fam); GpFont *font = NULL; DllExports::GdipCreateFont(fam, 28, FontStyleRegular, UnitPixel, &font); GpSolidFill *brush = NULL; DllExports::GdipCreateSolidFill(0xff000000, &brush); RectF rc((REAL)X0, (REAL)Y0, (REAL)(W - X0), (REAL)(H - Y0));
  auto boxes = [&](const std::wstring &l) { std::vector<POINT> e; GpStringFormat *f = NULL; GpStringFormat *gen = NULL; DllExports::GdipStringFormatGetGenericDefault(&gen); DllExports::GdipCloneStringFormat(gen, &f);
   for (size_t at = 0; at < l.size(); at += 32) { int k = (int)(std::min<size_t>)(32, l.size() - at); std::vector<CharacterRange> cr(k); std::vector<GpRegion *> rg(k); for (int j = 0; j < k; j++) { cr[j] = CharacterRange((INT)(at + j), 1); DllExports::GdipCreateRegion(&rg[j]); }
    DllExports::GdipSetStringFormatMeasurableCharacterRanges(f, k, cr.data()); DllExports::GdipMeasureCharacterRanges(g, l.c_str(), (INT)l.size(), font, rc, f, k, rg.data());
    for (int j = 0; j < k; j++) { RectF b; DllExports::GdipGetRegionBounds(rg[j], g, &b); e.push_back({(LONG)(b.X + .5f), (LONG)(b.Y + .5f)}); DllExports::GdipDeleteRegion(rg[j]); } }
   DllExports::GdipDeleteStringFormat(f); return e; };
  { const std::wstring &l = Next("gdip"); std::vector<POINT> e = boxes(l); Clear(); DllExports::GdipDrawString(g, l.c_str(), -1, font, &rc, NULL, brush); DllExports::GdipFlush(g, FlushIntentionSync); Dots("gdip-drawstring", e); }
  { const std::wstring &l = Next("gdip"); std::vector<PointF> pos; std::vector<POINT> e; REAL x = (REAL)X0; for (wchar_t c : l) { pos.push_back(PointF(x, (REAL)base)); e.push_back({(LONG)(x + .5f), Y0}); x += (REAL)Metrics[c].adv; }
   Clear(); DllExports::GdipDrawDriverString(g, (const UINT16 *)l.c_str(), (INT)l.size(), font, brush, pos.data(), DriverStringOptionsCmapLookup, NULL); DllExports::GdipFlush(g, FlushIntentionSync);
   // the dot top is the baseline minus the cell ascent of the family (its own rounding): compare against the drawn row
   auto blobs = Blobs(); if (!blobs.empty()) for (auto &p : e) p.y = blobs[0].y0; Dots("gdip-drawdriverstring", e); }
  DllExports::GdipDeleteBrush(brush); DllExports::GdipDeleteFont(font); DllExports::GdipDeleteFontFamily(fam); DllExports::GdipDeleteGraphics(g); }

 { D2D1_RENDER_TARGET_PROPERTIES props = D2D1::RenderTargetProperties(D2D1_RENDER_TARGET_TYPE_DEFAULT, D2D1::PixelFormat(DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_IGNORE), 96, 96);
  ID2D1DCRenderTarget *rt = NULL; d2->CreateDCRenderTarget(&props, &rt); RECT r = {0, 0, W, H}; IDWriteTextFormat *format = NULL; dw->CreateTextFormat(Face, NULL, DWRITE_FONT_WEIGHT_NORMAL, DWRITE_FONT_STYLE_NORMAL, DWRITE_FONT_STRETCH_NORMAL, 28, L"ja-jp", &format);
  ID2D1SolidColorBrush *brush = NULL; D2D1_RECT_F box = D2D1::RectF((FLOAT)X0, (FLOAT)Y0, (FLOAT)W, (FLOAT)H);
  auto hits = [&](const std::wstring &l) { std::vector<POINT> e; IDWriteTextLayout *t = NULL; dw->CreateTextLayout(l.c_str(), (UINT32)l.size(), format, (FLOAT)(W - X0), (FLOAT)(H - Y0), &t);
   for (UINT32 i = 0; i < l.size(); i++) { FLOAT px, py; DWRITE_HIT_TEST_METRICS m; t->HitTestTextPosition(i, FALSE, &px, &py, &m); e.push_back({(LONG)(X0 + m.left + .5f), (LONG)(Y0 + m.top + .5f)}); } t->Release(); return e; };
  auto begin = [&]() { Clear(); rt->BindDC(Dc, &r); rt->BeginDraw(); rt->Clear(D2D1::ColorF(1, 1, 1)); if (!brush) rt->CreateSolidColorBrush(D2D1::ColorF(0, 0, 0), &brush); };
  { const std::wstring &l = Next("d2d"); std::vector<POINT> e = hits(l); begin(); rt->DrawText(l.c_str(), (UINT32)l.size(), format, box, brush); rt->EndDraw(); Dots("d2d-drawtext", e); }
  { const std::wstring &l = Next("d2d"); std::vector<POINT> e = hits(l); IDWriteTextLayout *t = NULL; dw->CreateTextLayout(l.c_str(), (UINT32)l.size(), format, (FLOAT)(W - X0), (FLOAT)(H - Y0), &t); begin(); rt->DrawTextLayout(D2D1::Point2F((FLOAT)X0, (FLOAT)Y0), t, brush); rt->EndDraw(); t->Release(); Dots("d2d-drawtextlayout", e); }
  { IDWriteFontCollection *sys = NULL; dw->GetSystemFontCollection(&sys); UINT32 at = 0; BOOL exists = FALSE; sys->FindFamilyName(Face, &at, &exists); IDWriteFontFamily *fam = NULL; sys->GetFontFamily(at, &fam); IDWriteFont *f = NULL; fam->GetFirstMatchingFont(DWRITE_FONT_WEIGHT_NORMAL, DWRITE_FONT_STRETCH_NORMAL, DWRITE_FONT_STYLE_NORMAL, &f); IDWriteFontFace *ff = NULL; f->CreateFontFace(&ff);
   const std::wstring &l = Next("run"); std::vector<UINT32> cps(l.begin(), l.end()); std::vector<UINT16> gi(l.size()); ff->GetGlyphIndices(cps.data(), (UINT32)cps.size(), gi.data()); std::vector<DWRITE_GLYPH_METRICS> gm(l.size()); ff->GetDesignGlyphMetrics(gi.data(), (UINT32)gi.size(), gm.data(), FALSE); DWRITE_FONT_METRICS fm; ff->GetMetrics(&fm);
   float em = 28.f / fm.designUnitsPerEm, asc = fm.ascent * em; std::vector<FLOAT> adv(l.size()); std::vector<POINT> e; float pen = (FLOAT)X0; for (size_t i = 0; i < l.size(); i++) { adv[i] = gm[i].advanceWidth * em; e.push_back({(LONG)(pen + .5f), (LONG)(base - asc + .5f)}); pen += adv[i]; }
   DWRITE_GLYPH_RUN run{ff, 28.f, (UINT32)gi.size(), gi.data(), adv.data(), NULL, FALSE, 0}; begin(); rt->DrawGlyphRun(D2D1::Point2F((FLOAT)X0, (FLOAT)base), &run, brush); rt->EndDraw(); Dots("d2d-drawglyphrun", e);
   ff->Release(); f->Release(); fam->Release(); sys->Release(); }
  if (brush) brush->Release(); format->Release(); rt->Release(); }

 // A blind mode request cannot identify unpushed title/menu text from a shared dialogue font.
 { Push("MODE dot-blind"); const std::wstring blind = L"見知らぬ天井だった"; Measure(blind); Clear(); std::vector<POINT> e; bool same = true; DrawGgo(blind, GGO_GRAY8_BITMAP, X0, base, e, same); (void)same; Check(Ink() > 100, "unmatched glyphs under the dialogue font stay real in blind mode");
  HFONT tiny = CreateFontW(-16, 0, 0, 0, 400, 0, 0, 0, SHIFTJIS_CHARSET, 0, 0, ANTIALIASED_QUALITY, 0, Face); SelectObject(Dc, tiny); Clear(); TextOutW(Dc, X0, Y0, blind.c_str(), (int)blind.size()); Check(Ink() > 100, "blind: the same text in another size is drawn normally"); SelectObject(Dc, dialogue); DeleteObject(tiny);
  Push("MODE dot"); Sleep(200); Check(Got.find(":b:") == std::string::npos, "unmatched title/menu glyphs never reported as blind dots"); }
 // Compositor heartbeat (owner rule: the player never sees marks): dots only while the beat says presenting and fresh.
 { InterlockedExchange(&Ticking, 0); Sleep(150); Beat *bt = Bt;
  auto inked = [&](wchar_t c) { MAT2 m = {{0, 1}, {0, 0}, {0, 0}, {0, 1}}; GLYPHMETRICS gm{}; DWORD n = GetGlyphOutlineW(Dc, c, GGO_GRAY8_BITMAP, &gm, 0, NULL, &m); if (n == GDI_ERROR || !n) return -1; std::vector<BYTE> b(n); GetGlyphOutlineW(Dc, c, GGO_GRAY8_BITMAP, &gm, n, b.data(), &m); int k = 0; for (BYTE x : b) k += x != 0; return k; };
  if (bt) {
   *bt = {0x4243474D, 1, GetCurrentProcessId(), 1, GetTickCount64(), 1};
   ++Seq; Push("LINE 鳥魚馬羊"); Push("MODE dot-blind"); Check(inked(L'鳥') > 0 && inked(L'鳥') <= 16, "heartbeat presenting and fresh: dot");
   bt->presenting = 0; Check(inked(L'魚') > 30, "heartbeat presenting=0: real glyph at once");
   Sleep(500); Check(Got.find("ToMe_GLYPHDOT status needs-relaunch") != std::string::npos, "lapse after served dots: needs-relaunch reported");
   bt->presenting = 1; bt->tick = GetTickCount64(); Check(inked(L'馬') > 0 && inked(L'馬') <= 16, "heartbeat back: new glyphs are dots again");
   bt->tick = GetTickCount64() - 5000; Check(inked(L'羊') > 30, "stale heartbeat (5 s): real glyph");
   bt->tick = GetTickCount64(); InterlockedExchange(&Ticking, 1); Sleep(150);
   Push("MODE dot"); }
  else Check(false, "heartbeat mapping created"); }

 // Placement (MODE blank): blank glyphs + per-character records with the cell origin (docs/text-architecture.md).
 { Push("MODE blank");
  auto cells = [&](const std::wstring &l, int x, int y, const std::vector<int> *dx) { std::vector<POINT> e; int pen = x; for (size_t i = 0; i < l.size(); i++) { e.push_back({pen, y}); pen += dx ? (*dx)[i] : Metrics[l[i]].adv; } return e; };
  char mem[32]; sprintf_s(mem, "m%dx%d", W, H);
  { const std::wstring &l = Next("text"); Clear(); TextOutW(Dc, X0, Y0, l.c_str(), (int)l.size()); Save("place-textoutw"); Check(Ink() == 0, "place textoutw: no ink (blank glyphs)"); Placed[Seq] = {cells(l, X0, Y0, NULL), mem}; }
  { const std::wstring &l = Next("text"); Clear(); std::vector<int> dx(l.size(), 31); ExtTextOutW(Dc, X0, Y0, 0, NULL, l.c_str(), (UINT)l.size(), dx.data()); Check(Ink() == 0, "place exttextoutw lpDx: no ink"); Placed[Seq] = {cells(l, X0, Y0, &dx), mem}; }
  { const std::wstring &l = Next("text"); Clear(); SetTextAlign(Dc, TA_BASELINE); TextOutW(Dc, X0, base, l.c_str(), (int)l.size()); SetTextAlign(Dc, TA_TOP); Check(Ink() == 0, "place textoutw baseline: no ink"); Placed[Seq] = {cells(l, X0, Y0, NULL), mem}; }
  { const std::wstring &l = Next("ggo"); Clear(); std::vector<POINT> e; bool same = true; DrawGgo(l, GGO_GRAY8_BITMAP, X0, base, e, same); Save("place-ggo"); Check(Ink() == 0 && same, "place ggo: no ink, metrics and buffer size kept"); Placed[Seq] = {{}, "-"}; }
  // A hidden window (never shown) with a child at (50,30): the child's DC origin maps to the top-level client area.
  { WNDCLASSW wc{}; wc.lpfnWndProc = DefWindowProcW; wc.hInstance = GetModuleHandleW(NULL); wc.lpszClassName = L"MeguLitDotHost"; RegisterClassW(&wc);
   HWND top = CreateWindowExW(WS_EX_TOOLWINDOW, wc.lpszClassName, L"", WS_POPUP, -32000, -32000, 900, 200, NULL, NULL, wc.hInstance, NULL);
   HWND child = top ? CreateWindowExW(0, wc.lpszClassName, L"", WS_CHILD | WS_VISIBLE, 50, 30, 800, 120, top, NULL, wc.hInstance, NULL) : NULL;
   if (child) { HDC wdc = GetDC(child); SelectObject(wdc, dialogue); SetBkMode(wdc, TRANSPARENT); const std::wstring &l = Next("text"); TextOutW(wdc, X0, Y0, l.c_str(), (int)l.size()); ReleaseDC(child, wdc); Placed[Seq] = {cells(l, 50 + X0, 30 + Y0, NULL), "c"}; }
   else Check(false, "place: hidden window created");
   if (top) DestroyWindow(top); }
  { D2D1_RENDER_TARGET_PROPERTIES props = D2D1::RenderTargetProperties(D2D1_RENDER_TARGET_TYPE_DEFAULT, D2D1::PixelFormat(DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_IGNORE), 96, 96);
   ID2D1DCRenderTarget *rt = NULL; d2->CreateDCRenderTarget(&props, &rt); RECT r = {0, 0, W, H}; ID2D1SolidColorBrush *brush = NULL;
   IDWriteFontCollection *sys = NULL; dw->GetSystemFontCollection(&sys); UINT32 at = 0; BOOL exists = FALSE; sys->FindFamilyName(Face, &at, &exists); IDWriteFontFamily *fam = NULL; sys->GetFontFamily(at, &fam); IDWriteFont *f = NULL; fam->GetFirstMatchingFont(DWRITE_FONT_WEIGHT_NORMAL, DWRITE_FONT_STRETCH_NORMAL, DWRITE_FONT_STYLE_NORMAL, &f); IDWriteFontFace *ff = NULL; f->CreateFontFace(&ff);
   const std::wstring &l = Next("run"); std::vector<UINT32> cps(l.begin(), l.end()); std::vector<UINT16> gi(l.size()); ff->GetGlyphIndices(cps.data(), (UINT32)cps.size(), gi.data()); std::vector<DWRITE_GLYPH_METRICS> gm(l.size()); ff->GetDesignGlyphMetrics(gi.data(), (UINT32)gi.size(), gm.data(), FALSE); DWRITE_FONT_METRICS fm; ff->GetMetrics(&fm);
   float em = 28.f / fm.designUnitsPerEm, asc = fm.ascent * em; std::vector<FLOAT> adv(l.size()); std::vector<POINT> e; float pen = (FLOAT)X0; for (size_t i = 0; i < l.size(); i++) { adv[i] = gm[i].advanceWidth * em; e.push_back({(LONG)(pen + .5f), (LONG)(base - asc + .5f)}); pen += adv[i]; }
   DWRITE_GLYPH_RUN run{ff, 28.f, (UINT32)gi.size(), gi.data(), adv.data(), NULL, FALSE, 0}; Clear(); rt->BindDC(Dc, &r); rt->BeginDraw(); rt->Clear(D2D1::ColorF(1, 1, 1)); rt->CreateSolidColorBrush(D2D1::ColorF(0, 0, 0), &brush); rt->DrawGlyphRun(D2D1::Point2F((FLOAT)X0, (FLOAT)base), &run, brush); rt->EndDraw();
   Check(Ink() == 0, "place d2d drawglyphrun: no ink"); char t[32]; sprintf_s(t, "t%dx%d", W, H); Placed[Seq] = {e, t};
   brush->Release(); ff->Release(); f->Release(); fam->Release(); sys->Release(); rt->Release(); }
  // Locating marks (MARK on): GRAY8 glyphs of the first, second and last character keep one pixel of coverage 1/64 at
  // their black box top-left (white background, black text: 255 - 255/64 = 252), nothing else; GRAY4 gets none.
  { Push("MARK on");
   const std::wstring &l = Next("ggo"); Clear(); std::vector<POINT> e; bool same = true; DrawGgo(l, GGO_GRAY8_BITMAP, X0, base, e, same); GdiFlush();
   std::vector<POINT> got; int faintest = 255, darkest = 255; for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) { int v = Bits[y * W + x] & 0xff; if (v < 255) { got.push_back({x, y}); faintest = (std::min)(faintest, 255 - v); darkest = (std::min)(darkest, v); } }
   size_t n = l.size(); bool at = got.size() == 3; for (size_t k : {(size_t)0, (size_t)1, n - 1}) { bool hit = false; for (auto &g : got) hit = hit || (g.x == e[k].x && g.y == e[k].y); at = at && hit; }
   Save("mark-ggo"); Check(at && darkest >= 251 && same, "marks: exactly 3 pixels (first, second, last character) at their black box top-left, at most 4 levels from the background (" + std::to_string(got.size()) + " found, darkest " + std::to_string(darkest) + ")");
   const std::wstring &l4 = Next("ggo"); Clear(); e.clear(); DrawGgo(l4, GGO_GRAY4_BITMAP, X0, base, e, same); GdiFlush(); int any = 0; for (int i = 0; i < W * H; i++) any += (Bits[i] & 0xff) < 255;
   Check(any == 0, "marks: none in GRAY4 (1/16 would be visible)");
   Sleep(200); AcquireSRWLockShared(&GotLock); std::string g = Got; ReleaseSRWLockShared(&GotLock);
   std::string tag = "ToMe_GLYPHDOT dots seq=" + std::to_string(Seq - 1) + " "; size_t p0 = g.find(tag); int ones = 0; while (p0 != std::string::npos) { size_t eol = g.find('\n', p0); std::string m = g.substr(p0, eol - p0); for (size_t q = 0; (q = m.find(":1:d:", q)) != std::string::npos; q++) ones++; p0 = g.find(tag, eol); }
   Check(ones == 3, "marks: the three marked characters are reported with s = 1 (" + std::to_string(ones) + ")");
   // MARK on covers two lines only: the third line after it gets no mark although MARK off was never sent
   const std::wstring &l3 = Next("ggo"); Clear(); e.clear(); DrawGgo(l3, GGO_GRAY8_BITMAP, X0, base, e, same); GdiFlush(); int third = 0; for (int i = 0; i < W * H; i++) third += (Bits[i] & 0xff) < 255;
   Check(third == 0, "marks: stop by themselves after two lines (third line: " + std::to_string(third) + " pixels)");
   Placed.erase(Seq - 2); Placed[Seq - 1] = {{}, "-"}; Placed[Seq] = {{}, "-"}; SeqPath.erase(Seq - 2); SeqText.erase(Seq - 2); Push("MARK off"); }
  // Extra lines (names, choices): whole-string draws of a pushed name / choice are blank and reported with their
  // origin (kind n / o, index into the extra), in any font size; other strings stay drawn.
  { HFONT plate = CreateFontW(-20, 0, 0, 0, 400, 0, 0, 0, SHIFTJIS_CHARSET, 0, 0, ANTIALIASED_QUALITY, 0, Face); SelectObject(Dc, plate);
   Push("EXTRA n 古河 渚"); Push("EXTRA o 上書きで何か吹き込む"); Push("EXTRA o やめておく");
   Clear(); TextOutW(Dc, 300, 40, L"古河渚", 3); Check(Ink() == 0, "extra name: no ink");
   Clear(); TextOutW(Dc, 100, 10, L"やめておく", 5); Check(Ink() == 0, "extra choice: no ink");
   Clear(); TextOutW(Dc, 100, 10, L"セーブ", 3); Check(Ink() > 30, "extra: an unrelated string is drawn normally");
   std::vector<int> nameAdv; for (wchar_t c : std::wstring(L"古河渚")) { SIZE z{}; GetTextExtentPoint32W(Dc, &c, 1, &z); nameAdv.push_back(z.cx); }
   Sleep(300); size_t at = 0; int named = 0, chosen = 0; bool where = true;
   AcquireSRWLockShared(&GotLock); std::string got = Got; ReleaseSRWLockShared(&GotLock);
   while ((at = got.find("ToMe_GLYPHDOT xdots ", at)) != std::string::npos) { size_t eol = got.find('\n', at); std::string msg = got.substr(at, eol - at); at = eol; std::string list = msg.substr(msg.find("list=") + 5); size_t a = 0;
    while (a < list.size()) { size_t b = list.find(';', a); if (b == std::string::npos) b = list.size(); int i, h, bl, ad, x, y, sd, px, py; unsigned ch; char k; char sp[24] = {};
     if (sscanf_s(list.substr(a, b - a).c_str(), "%d:%x:%d:%d:%d:%d:%d:%d:%c:%d:%d:%23[^;]", &i, &ch, &h, &bl, &ad, &x, &y, &sd, &k, 1, &px, &py, sp, (unsigned)sizeof sp) == 12) {
      if (k == 'n') { named++; int ex = 300; for (int j = 0; j < i && j < 3; j++) ex += nameAdv[j]; if (i < 0 || i > 2 || abs(px - ex) > 1 || abs(py - 40) > 1 || strcmp(sp, mem)) { where = false; printf("     name index %d at %d,%d %s, expected %d,40 %s\n", i, px, py, sp, ex, mem); } }
      if (k == 'o') chosen++; }
     a = b + 1; } }
   Check(got.find("ToMe_GLYPHDOT extra id=1 kind=n text=古河渚") != std::string::npos && got.find("kind=o text=やめておく") != std::string::npos, "extra lines announced (blanks stripped)");
   Check(named == 3 && chosen == 5 && where, "extra records: 3 name characters at their cell origins, 5 choice characters (" + std::to_string(named) + "/" + std::to_string(chosen) + ")");
   Push("EXTRA-CLEAR o"); Clear(); TextOutW(Dc, 100, 10, L"やめておく", 5); Check(Ink() > 100, "choices cleared: drawn normally again");
   SelectObject(Dc, dialogue); DeleteObject(plate); }
  // Placement also needs a matching line, even with a blind-mode request.
  { Push("MODE blank-blind"); const std::wstring blind = L"見知らぬ天井だった"; Measure(blind); Clear(); std::vector<POINT> e; bool same = true; DrawGgo(blind, GGO_GRAY8_BITMAP, X0, base, e, same); Check(Ink() > 100, "place-blind: unmatched title/menu text keeps its ink"); }
  Push("MODE dot"); }
 Push("OFF"); Sleep(400);
 { Clear(); TextOutW(Dc, X0, Y0, A.c_str(), (int)A.size()); Save("after-off"); Check(Ink() > 500, "after OFF: the line is drawn in full again"); }
 printf("%s", Got.c_str());
 Check(Got.find("ToMe_GLYPHHIDE ready version=3 modes=blank,dot,place records=4") != std::string::npos, "control connection answered with version 3 and the modes");
 // Every case: one ToMe_GLYPHDOT line + its dots, each index of the line exactly once, the right character, kind d.
 for (auto &kv : SeqText) {
  int seq = kv.first; const std::wstring &l = kv.second; std::string tag = "seq=" + std::to_string(seq) + " ";
  bool line = Got.find("ToMe_GLYPHDOT line " + tag + "text=" + Utf8(l)) != std::string::npos; std::map<int, int> count; bool chars = true, path = true; size_t pos = 0;
  while ((pos = Got.find("ToMe_GLYPHDOT dots " + tag, pos)) != std::string::npos) {
   size_t eol = Got.find('\n', pos); std::string msg = Got.substr(pos, eol - pos); pos = eol;
   bool onlyBlind = msg.find(":d") == std::string::npos && msg.find(":c") == std::string::npos && msg.find(":p") == std::string::npos && msg.find(":r") == std::string::npos;
   if (!onlyBlind && msg.find("path=" + SeqPath[seq] + " ") == std::string::npos) path = false;
   std::string list = msg.substr(msg.find("list=") + 5); size_t a = 0;
   while (a < list.size()) { size_t b = list.find(';', a); if (b == std::string::npos) b = list.size(); int i, h, bl, ad, x, y, s, px, py; unsigned ch; char k; char sp[24] = {};
    if (sscanf_s(list.substr(a, b - a).c_str(), "%d:%x:%d:%d:%d:%d:%d:%d:%c:%d:%d:%23[^;]", &i, &ch, &h, &bl, &ad, &x, &y, &s, &k, 1, &px, &py, sp, (unsigned)sizeof sp) == 12) {
     if (k != 'd') { a = b + 1; continue; } /* c, p: redraws and the previous line; b: blind */ count[i]++; bool place = Placed.count(seq) != 0;
     if (i < 0 || i >= (int)l.size() || l[i] != (wchar_t)ch || k != 'd' || s != (place ? 0 : Side) || h <= 0) chars = false;
     if (place && i >= 0 && i < (int)l.size()) { const Place &e = Placed[seq]; if (e.sp != sp) { chars = false; printf("     seq %d index %d space %s, expected %s\n", seq, i, sp, e.sp.c_str()); }
      else if (!e.at.empty() && (abs(e.at[i].x - px) > 1 || abs(e.at[i].y - py) > 1)) { chars = false; printf("     seq %d index %d at %d,%d, expected %ld,%ld\n", seq, i, px, py, e.at[i].x, e.at[i].y); } } }
    else chars = false; a = b + 1; } }
  bool all = count.size() == l.size(); for (auto &c : count) all = all && c.second == 1;
  Check(line && all && chars && path, "report " + tag + "(" + SeqPath[seq] + (Placed.count(seq) ? ", place " + Placed[seq].sp : "") + "): line text, every index once, character and kind d, " + (Placed.count(seq) ? "no dot, cell origin in the right space" : "dot side 3"));
  // the colour of the draw itself, for the reader to paint the hidden line with (read / unread colours): the host draws black, opaque
  { const std::string &pth = SeqPath[seq]; bool want = pth == "text" || pth == "gdip" || pth == "d2d" || pth == "run"; bool any = Got.find("ToMe_GLYPHDOT color " + tag) != std::string::npos;
   Check(want ? Got.find("ToMe_GLYPHDOT color " + tag + "rgb=000000 a=ff src=" + pth) != std::string::npos : !any, "colour " + tag + "(" + pth + "): " + (want ? "the draw's colour reported (black, opaque)" : "none from GetGlyphOutline, the engine tints the bitmap itself")); }
 }
 printf(Failed ? "FAIL %d\n" : "PASS\n", Failed); return Failed ? 1 : 0;
}
