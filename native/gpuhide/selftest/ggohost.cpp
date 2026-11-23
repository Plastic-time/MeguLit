// SPDX-License-Identifier: GPL-3.0-or-later
// Self-test of the glyph trace in MeguLitGpu32/64.dll (GlyphTrace.h). Usage: ggohost.exe <dll> <mode>
// The host plays an engine that rasterises each character with GetGlyphOutlineW (GGO_GRAY8) and copies the bitmap into
// its own Direct3D 9 texture with its own code, then draws one quad per character (plus a shadow copy 2 px off, drawn
// first) from that texture, and HookBridge (both pipes). Modes:
//   upload  each glyph into a 32x32 slot of a managed A8R8G8B8 atlas (LockRect with the slot's rect)
//   whole   all glyphs of the line written in one LockRect of the whole A8 atlas (content search)
//   sysmem  per-glyph LockRect of a system-memory texture, then UpdateTexture to the default-pool texture that is drawn
//   surface per-glyph LockRect of the atlas's level-0 surface (GetSurfaceLevel)
//   blank   MeguLitFont blank mode simulated (the host's own GetGlyphOutlineW hook zeroes the bitmap before the DLL sees
//           it), per-glyph upload: the slot rect is the cell
//   marker  blank with the mark pixel (coverage 1 of 64 at the box's top-left), one whole-atlas lock (mark search)
// Checks: after LINE 1 the DLL reports ToMe_GLYPHPOS line=1 with the 8 characters in order at their drawn places (±3 px);
// LINE 2 is drawn from the same cells without any GetGlyphOutline call (an engine's glyph cache) and is reported too.
#include <windows.h>
#include <d3d9.h>
#include <stdio.h>
#include <string>
#include <vector>
#include <mutex>
#include <thread>
#include <atomic>
#include <cmath>
#include "../../shared/minhook/include/MinHook.h"

static std::mutex Mu; static std::vector<std::string> Reports; static HANDLE Ctl = INVALID_HANDLE_VALUE; static int Fails;
static void Check(bool ok, const char *what) { printf("%s %s\n", ok ? "PASS" : "FAIL", what); if (!ok) Fails++; }
static bool Has(const char *needle, std::string *out = nullptr) { std::lock_guard<std::mutex> g(Mu); for (auto it = Reports.rbegin(); it != Reports.rend(); ++it) if (it->find(needle) != std::string::npos) { if (out) *out = *it; return true; } return false; }
static void SendCtl(const std::string &s) { std::string l = s + "\n"; DWORD d; WriteFile(Ctl, l.data(), (DWORD)l.size(), &d, NULL); }
static const int W = 640, H = 480, GX = 60, GY = 400, GA = 26;
static std::string Mode; static HWND Win; static IDirect3DDevice9 *Dev; static IDirect3DTexture9 *Atlas, *Sys, *Def;
struct V { float x, y, z, w, u, v; };
struct G { wchar_t ch; int slot, bw, bh, ox, oy; std::vector<BYTE> bits; };
static std::vector<G> Cells; // glyphs the "engine" has in its atlas
struct Place { wchar_t ch; float x, y, w, h; };
static std::vector<Place> Shown; // what the current frame draws (expected report)

// MeguLitFont blank mode stand-in: installed before the DLL loads, so the DLL's own hook sees the blanked result
typedef DWORD(WINAPI *GgoF)(HDC, UINT, UINT, LPGLYPHMETRICS, DWORD, LPVOID, const MAT2 *); static GgoF RealGgo;
static DWORD WINAPI BlankGgo(HDC dc, UINT c, UINT f, LPGLYPHMETRICS gm, DWORD cb, LPVOID buf, const MAT2 *m) {
 DWORD r = RealGgo(dc, c, f, gm, cb, buf, m); if (r != GDI_ERROR && cb && buf) { memset(buf, 0, cb); if (Mode == "marker") ((BYTE *)buf)[0] = 1; } return r; }

static IDirect3DTexture9 *DrawTex() { return Mode == "sysmem" ? Def : Atlas; }
static D3DFORMAT AtlasFmt() { return Mode == "whole" || Mode == "marker" ? D3DFMT_A8 : D3DFMT_A8R8G8B8; }
static void PutTexel(BYTE *row, int x, int a) { if (AtlasFmt() == D3DFMT_A8) row[x] = (BYTE)a; else ((DWORD *)row)[x] = ((DWORD)a << 24) | 0xFFFFFF; }
static void Blit(BYTE *base, int pitch, int ox, int oy, const G &g) { // the engine's own copy: gray 0..64 -> 0..255
 int gp = (g.bw + 3) & ~3; for (int y = 0; y < g.bh; y++) for (int x = 0; x < g.bw; x++) { int v = g.bits.empty() ? 0 : g.bits[y * gp + x]; PutTexel(base + (size_t)(oy + y) * pitch, ox + x, (std::min)(255, v * 255 / 64)); } }
static void SlotXY(int slot, int &x, int &y) { x = (slot % 8) * 32; y = (slot / 8) * 32; }
// rasterise the line and upload it the way the mode's engine does
static void Rasterise(const std::wstring &text) {
 HDC dc = CreateCompatibleDC(NULL); HFONT f = CreateFontW(-24, 0, 0, 0, FW_NORMAL, 0, 0, 0, SHIFTJIS_CHARSET, 0, 0, ANTIALIASED_QUALITY, 0, L"MS Gothic"); SelectObject(dc, f);
 MAT2 m = { { 0, 1 }, { 0, 0 }, { 0, 0 }, { 0, 1 } }; std::vector<G> now;
 for (wchar_t c : text) { G g; g.ch = c; g.slot = (int)Cells.size() + (int)now.size(); GLYPHMETRICS gm; DWORD n = GetGlyphOutlineW(dc, c, GGO_GRAY8_BITMAP, &gm, 0, NULL, &m); if (n == GDI_ERROR) continue;
  g.bits.assign(n ? n : 1, 0); GetGlyphOutlineW(dc, c, GGO_GRAY8_BITMAP, &gm, n, n ? g.bits.data() : NULL, &m); g.bw = gm.gmBlackBoxX; g.bh = gm.gmBlackBoxY; g.ox = gm.gmptGlyphOrigin.x; TEXTMETRICW tm; GetTextMetricsW(dc, &tm); g.oy = tm.tmAscent - gm.gmptGlyphOrigin.y;
  if (Mode == "blank" || Mode == "marker") { std::fill(g.bits.begin(), g.bits.end(), 0); if (Mode == "marker") g.bits[0] = 1; }
  if (Mode == "upload" || Mode == "blank" || Mode == "sysmem" || Mode == "surface") { // one lock per glyph, the slot's rect
   int sx, sy; SlotXY(g.slot, sx, sy); RECT r = { sx, sy, sx + 32, sy + 32 }; D3DLOCKED_RECT lr;
   if (Mode == "surface") { IDirect3DSurface9 *s; Atlas->GetSurfaceLevel(0, &s); s->LockRect(&lr, &r, 0); for (int y = 0; y < 32; y++) memset((BYTE *)lr.pBits + y * lr.Pitch, 0, 32 * 4); Blit((BYTE *)lr.pBits, lr.Pitch, 2, 2, g); s->UnlockRect(); s->Release(); }
   else { IDirect3DTexture9 *t = Mode == "sysmem" ? Sys : Atlas; t->LockRect(0, &lr, &r, 0); for (int y = 0; y < 32; y++) memset((BYTE *)lr.pBits + y * lr.Pitch, 0, 32 * 4); Blit((BYTE *)lr.pBits, lr.Pitch, 2, 2, g); t->UnlockRect(0); }
  }
  now.push_back(g); }
 if (Mode == "whole" || Mode == "marker") { D3DLOCKED_RECT lr; Atlas->LockRect(0, &lr, NULL, 0); for (auto &g : now) { int sx, sy; SlotXY(g.slot, sx, sy); Blit((BYTE *)lr.pBits, lr.Pitch, sx + 2, sy + 2, g); } Atlas->UnlockRect(0); }
 if (Mode == "sysmem") Dev->UpdateTexture(Sys, Def);
 for (auto &g : now) Cells.push_back(g); DeleteDC(dc); DeleteObject(f);
}
static const G *CellOf(wchar_t c) { for (auto &g : Cells) if (g.ch == c) return &g; return nullptr; }
static void Frame(const std::wstring &text) {
 Dev->Clear(0, NULL, D3DCLEAR_TARGET, 0x203040, 1, 0); Dev->BeginScene();
 Dev->SetRenderState(D3DRS_ALPHABLENDENABLE, TRUE); Dev->SetRenderState(D3DRS_SRCBLEND, D3DBLEND_SRCALPHA); Dev->SetRenderState(D3DRS_DESTBLEND, D3DBLEND_INVSRCALPHA); Dev->SetRenderState(D3DRS_LIGHTING, FALSE);
 Dev->SetFVF(D3DFVF_XYZRHW | D3DFVF_TEX1); Dev->SetTexture(0, DrawTex()); Shown.clear();
 for (int pass = 0; pass < 2; pass++) { std::vector<V> q; int i = 0;
  for (wchar_t c : text) { const G *g = CellOf(c); if (!g) { i++; continue; } int sx, sy; SlotXY(g->slot, sx, sy); float bw = (float)(std::max)(g->bw, 1), bh = (float)(std::max)(g->bh, 1);
   float x = (float)(GX + i * GA + g->ox) + (pass ? 0 : 2), y = (float)(GY + g->oy) + (pass ? 0 : 2), u0 = (sx + 2) / 256.f, v0 = (sy + 2) / 256.f, u1 = (sx + 2 + bw) / 256.f, v1 = (sy + 2 + bh) / 256.f;
   V a = { x, y, 0, 1, u0, v0 }, b = { x + bw, y, 0, 1, u1, v0 }, cc = { x, y + bh, 0, 1, u0, v1 }, d = { x + bw, y + bh, 0, 1, u1, v1 }; q.push_back(a); q.push_back(b); q.push_back(cc); q.push_back(b); q.push_back(d); q.push_back(cc);
   if (pass) Shown.push_back(Place{ c, x, y, bw, bh }); i++; }
  if (!q.empty()) Dev->DrawPrimitiveUP(D3DPT_TRIANGLELIST, (UINT)q.size() / 3, q.data(), sizeof(V)); }
 Dev->EndScene(); Dev->Present(NULL, NULL, NULL, NULL); Sleep(16);
}
static bool WaitFor(const char *needle, const std::wstring &text, int frames, std::string *out = nullptr) { for (int i = 0; i < frames; i++) { if (Has(needle, out)) return true; Frame(text); } return Has(needle, out); }
// the report lists the line's characters in order at the places drawn (shadow first: within 3 px)
static bool PosOk(const std::string &r, const std::wstring &text) {
 size_t a = r.find("list="); if (a == std::string::npos) return false; a += 5; int ok = 0, i = 0;
 for (wchar_t c : text) { unsigned u; float x, y, w, h; if (sscanf_s(r.c_str() + a, "%X,%f,%f,%f,%f", &u, &x, &y, &w, &h) != 5) break; const Place *p = nullptr; for (auto &s : Shown) if (s.ch == c) { p = &s; break; }
  if (p && u == (unsigned)c && fabsf(x - p->x) <= 3 && fabsf(y - p->y) <= 3) ok++; else printf("  char %d: U+%04X at %.0f,%.0f (want U+%04X at %.0f,%.0f)\n", i, u, x, y, (unsigned)c, p ? p->x : -1, p ? p->y : -1);
  i++; a = r.find(';', a); if (a == std::string::npos) break; a++; }
 return ok == (int)text.size();
}
int wmain(int argc, wchar_t **argv) {
 if (argc < 3) { printf("usage: ggohost <dll> <upload|whole|sysmem|surface|blank|marker>\n"); return 2; }
 char mm[32]; WideCharToMultiByte(CP_UTF8, 0, argv[2], -1, mm, sizeof mm, NULL, NULL); Mode = mm; printf("glyph trace mode %s (%d-bit)\n", mm, (int)sizeof(void *) * 8);
 WNDCLASSW wc = {}; wc.lpfnWndProc = DefWindowProcW; wc.hInstance = GetModuleHandleW(NULL); wc.lpszClassName = L"GlyphTraceTest"; RegisterClassW(&wc);
 Win = CreateWindowExW(WS_EX_TOOLWINDOW, wc.lpszClassName, L"glyph trace test", WS_POPUP, -32000, -32000, W, H, NULL, NULL, wc.hInstance, NULL); // never shown
 IDirect3D9 *d = Direct3DCreate9(D3D_SDK_VERSION); D3DPRESENT_PARAMETERS pp = {}; pp.Windowed = TRUE; pp.SwapEffect = D3DSWAPEFFECT_DISCARD; pp.hDeviceWindow = Win; pp.BackBufferWidth = W; pp.BackBufferHeight = H; pp.BackBufferFormat = D3DFMT_X8R8G8B8;
 if (!d || FAILED(d->CreateDevice(D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, Win, D3DCREATE_SOFTWARE_VERTEXPROCESSING, &pp, &Dev))) { printf("SKIP no Direct3D9 device on this machine\n"); return 0; }
 if (FAILED(Dev->CreateTexture(256, 256, 1, 0, AtlasFmt(), D3DPOOL_MANAGED, &Atlas, NULL))) { printf("SKIP atlas format not supported\n"); return 0; }
 { D3DLOCKED_RECT lr; Atlas->LockRect(0, &lr, NULL, D3DLOCK_DISCARD & 0); for (int y = 0; y < 256; y++) memset((BYTE *)lr.pBits + y * lr.Pitch, 0, AtlasFmt() == D3DFMT_A8 ? 256 : 1024); Atlas->UnlockRect(0); }
 if (Mode == "sysmem") { Dev->CreateTexture(256, 256, 1, 0, D3DFMT_A8R8G8B8, D3DPOOL_SYSTEMMEM, &Sys, NULL); Dev->CreateTexture(256, 256, 1, 0, D3DFMT_A8R8G8B8, D3DPOOL_DEFAULT, &Def, NULL); }
 Dev->SetSamplerState(0, D3DSAMP_MINFILTER, D3DTEXF_POINT); Dev->SetSamplerState(0, D3DSAMP_MAGFILTER, D3DTEXF_POINT);
 if (Mode == "blank" || Mode == "marker") { MH_Initialize(); void *t = GetProcAddress(GetModuleHandleW(L"gdi32.dll"), "GetGlyphOutlineW"); MH_CreateHook(t, (void *)BlankGgo, (void **)&RealGgo); MH_EnableHook(t); }
 std::wstring line1 = L"吾輩は猫である。", line2 = L"猫は吾輩である。";
 Frame(L"");
 wchar_t name[64]; swprintf_s(name, L"\\\\.\\pipe\\MeguLitGpu-%lu", GetCurrentProcessId()); HANDLE rep = CreateNamedPipeW(name, PIPE_ACCESS_INBOUND, PIPE_TYPE_BYTE | PIPE_WAIT, 1, 0, 65536, 0, NULL);
 swprintf_s(name, L"\\\\.\\pipe\\MeguLitGpuCtl-%lu", GetCurrentProcessId()); Ctl = CreateNamedPipeW(name, PIPE_ACCESS_OUTBOUND, PIPE_TYPE_BYTE | PIPE_WAIT, 1, 65536, 0, 0, NULL);
 std::thread([rep] { ConnectNamedPipe(rep, NULL); std::string buf; char b[4096]; DWORD got; while (ReadFile(rep, b, sizeof b, &got, NULL) && got) { buf.append(b, got); size_t at; while ((at = buf.find('\n')) != std::string::npos) { std::string l = buf.substr(0, at); buf.erase(0, at + 1); printf("  < %s\n", l.c_str()); std::lock_guard<std::mutex> g(Mu); Reports.push_back(l); } } }).detach();
 std::atomic<bool> ctlUp(false); std::thread([&] { ConnectNamedPipe(Ctl, NULL); ctlUp = true; }).detach();
 if (!LoadLibraryW(argv[1])) { printf("FAIL cannot load %ls (%lu)\n", argv[1], GetLastError()); return 1; }
 Check(WaitFor("status d3d9 hooked", L"", 400), "DLL hooked Direct3D 9 after the device existed");
 for (int i = 0; i < 200 && !ctlUp; i++) Frame(L""); Check(ctlUp, "control pipe connected");
 SendCtl(u8"LINE 吾輩は猫である。"); for (int i = 0; i < 3; i++) Frame(L"");
 Rasterise(line1); std::string r;
 Check(WaitFor("ToMe_GLYPHPOS line=1 sw=640 sh=480 n=8 ", line1, 60, &r) && PosOk(r, line1), "line 1: 8 traced characters in order at their drawn places");
 SendCtl(u8"LINE 猫は吾輩である。"); for (int i = 0; i < 3; i++) Frame(L"");
 Check(WaitFor("ToMe_GLYPHPOS line=2 sw=640 sh=480 n=8 ", line2, 60, &r) && PosOk(r, line2), "line 2 from cached cells (no GetGlyphOutline): 8 characters in order");
 SendCtl("QUIT"); printf(Fails ? "RESULT FAIL %d\n" : "RESULT PASS\n", Fails); fflush(stdout); TerminateProcess(GetCurrentProcess(), Fails ? 1 : 0); return Fails ? 1 : 0;
}
