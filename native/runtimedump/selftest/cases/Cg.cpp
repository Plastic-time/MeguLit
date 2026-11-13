// Case Cg (modules/Cg.cpp, runtime CG unlock): the stand-in game keeps CGs in its encrypted pack, decrypts them in
// memory the ways real engines do and draws some in its own window (placed off screen, never activated). Only CGs that
// were drawn may be recorded.
//   A  PNG in the pack, decrypted in place, shown with a text box over the bottom          -> recorded
//   B  PNG in the pack, decrypted in place and into a fresh buffer, never shown (preloaded)  -> never recorded
//   C  loose JPEG read as is, shown later (the game's CG gallery)                          -> recorded
//   D  PNG in the pack, a flat black fade frame shown                                       -> never recorded
//   E  small sprite PNG shown                                                               -> never recorded (not CG-sized)
#include "../fakegame.h"
#include <wincodec.h>
#pragma comment(lib, "windowscodecs.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "gdi32.lib")
#pragma comment(lib, "user32.lib")
namespace {
IWICImagingFactory *Wic;
const int W = 800, H = 600;
std::vector<unsigned char> Shown; int ShownW, ShownH; HWND Win;

typedef unsigned (*Pattern)(int x, int y);
unsigned PA(int x, int y) { return ((y / 40) & 1) ? 0xFFE04080 : 0xFF2040A0; }
unsigned PB(int x, int y) { return (((x + y) / 50) & 1) ? 0xFF10F010 : 0xFF600000; }
unsigned PC(int x, int y) { int dx = x - W / 2, dy = y - H / 3; return dx * dx + dy * dy < 150 * 150 ? 0xFFF0F040 : (x < W / 2 ? 0xFF303030 : 0xFFA0A0F0); }
unsigned PD(int, int) { return 0xFF000000; }
unsigned PE(int x, int y) { return ((x / 10 + y / 10) & 1) ? 0xFFFFFFFF : 0xFF000000; }

std::string Encode(Pattern f, int w, int h, const GUID &fmt) {
 std::vector<unsigned> px((size_t)w * h); for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) px[(size_t)y * w + x] = f(x, y);
 IStream *ms = NULL; CreateStreamOnHGlobal(NULL, TRUE, &ms);
 IWICBitmapEncoder *enc = NULL; IWICBitmapFrameEncode *fr = NULL;
 Wic->CreateEncoder(fmt, NULL, &enc); enc->Initialize(ms, WICBitmapEncoderNoCache); enc->CreateNewFrame(&fr, NULL); fr->Initialize(NULL);
 fr->SetSize(w, h); WICPixelFormatGUID pf = GUID_WICPixelFormat32bppBGRA; fr->SetPixelFormat(&pf);
 if (pf != GUID_WICPixelFormat32bppBGRA) { // JPEG wants 24bpp
  std::vector<unsigned char> rgb((size_t)w * h * 3); for (size_t i = 0; i < px.size(); i++) { rgb[i * 3] = px[i] & 0xFF; rgb[i * 3 + 1] = (px[i] >> 8) & 0xFF; rgb[i * 3 + 2] = (px[i] >> 16) & 0xFF; }
  fr->WritePixels(h, w * 3, (UINT)rgb.size(), rgb.data());
 } else fr->WritePixels(h, w * 4, (UINT)(px.size() * 4), (BYTE *)px.data());
 fr->Commit(); enc->Commit();
 HGLOBAL g; GetHGlobalFromStream(ms, &g); STATSTG st; ms->Stat(&st, STATFLAG_NONAME);
 std::string r((const char *)GlobalLock(g), (size_t)st.cbSize.QuadPart); GlobalUnlock(g);
 fr->Release(); enc->Release(); ms->Release();
 return r;
}
void Pump(DWORD ms) { DWORD end = GetTickCount() + ms; MSG m; while ((LONG)(GetTickCount() - end) < 0) { while (PeekMessageW(&m, NULL, 0, 0, PM_REMOVE)) { TranslateMessage(&m); DispatchMessageW(&m); } Sleep(10); } }
// Decodes a file image and draws it scaled to the window, with a dark text box over the bottom quarter.
void Show(const char *data, size_t n) {
 IWICStream *st; IWICBitmapDecoder *dec; IWICBitmapFrameDecode *fr; IWICFormatConverter *cv;
 Wic->CreateStream(&st); st->InitializeFromMemory((BYTE *)data, (DWORD)n); Wic->CreateDecoderFromStream(st, NULL, WICDecodeMetadataCacheOnDemand, &dec);
 dec->GetFrame(0, &fr); Wic->CreateFormatConverter(&cv); cv->Initialize(fr, GUID_WICPixelFormat32bppBGRA, WICBitmapDitherTypeNone, NULL, 0, WICBitmapPaletteTypeCustom);
 UINT w, h; cv->GetSize(&w, &h); Shown.resize((size_t)w * h * 4); cv->CopyPixels(NULL, w * 4, (UINT)Shown.size(), Shown.data()); ShownW = w; ShownH = h;
 cv->Release(); fr->Release(); dec->Release(); st->Release();
 InvalidateRect(Win, NULL, FALSE); Pump(2500);
}
void Paint(HDC dc) {
 RECT r; GetClientRect(Win, &r);
 if (!Shown.empty()) {
  BITMAPINFO bi = {}; bi.bmiHeader.biSize = sizeof bi.bmiHeader; bi.bmiHeader.biWidth = ShownW; bi.bmiHeader.biHeight = -ShownH; bi.bmiHeader.biPlanes = 1; bi.bmiHeader.biBitCount = 32;
  if (ShownW < r.right) { HBRUSH g = CreateSolidBrush(RGB(128, 128, 128)); FillRect(dc, &r, g); DeleteObject(g);
   StretchDIBits(dc, 0, 0, ShownW, ShownH, 0, 0, ShownW, ShownH, Shown.data(), &bi, DIB_RGB_COLORS, SRCCOPY); }
  else StretchDIBits(dc, 0, 0, r.right, r.bottom, 0, 0, ShownW, ShownH, Shown.data(), &bi, DIB_RGB_COLORS, SRCCOPY);
 }
 RECT box = { 20, r.bottom * 3 / 4, r.right - 20, r.bottom - 10 }; HBRUSH b = CreateSolidBrush(RGB(10, 10, 30)); FillRect(dc, &box, b); DeleteObject(b);
}
LRESULT CALLBACK Proc(HWND h, UINT m, WPARAM w, LPARAM l) {
 if (m == WM_PAINT) { PAINTSTRUCT ps; HDC dc = BeginPaint(h, &ps); Paint(dc); EndPaint(h, &ps); return 0; }
 if (m == WM_PRINTCLIENT) { Paint((HDC)w); return 0; }
 if (m == WM_ERASEBKGND) return 1;
 return DefWindowProcW(h, m, w, l);
}
std::string ReadFileAll(const std::string &p) { HANDLE h = CreateFileA(p.c_str(), GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL); if (h == INVALID_HANDLE_VALUE) return ""; DWORD n = GetFileSize(h, NULL), g = 0; std::string r(n, '\0'); ReadFile(h, &r[0], n, &g, NULL); CloseHandle(h); return r; }
bool Recorded(const std::string &cgDir, const std::string &want) {
 WIN32_FIND_DATAA f; HANDLE h = FindFirstFileA((cgDir + "*").c_str(), &f); if (h == INVALID_HANDLE_VALUE) return false; bool found = false;
 do { if (!(f.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) && ReadFileAll(cgDir + f.cFileName) == want) found = true; } while (!found && FindNextFileA(h, &f));
 FindClose(h); return found;
}

}

int CaseCg(FakeGame &g) {
 CoInitializeEx(NULL, COINIT_APARTMENTTHREADED); CoCreateInstance(CLSID_WICImagingFactory, NULL, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&Wic));
 if (!Wic) { printf("FAIL cg: no WIC\n"); return 1; }
 WNDCLASSW wc = {}; wc.lpfnWndProc = Proc; wc.hInstance = GetModuleHandleW(NULL); wc.lpszClassName = L"MeguLitCgCase"; RegisterClassW(&wc);
 RECT r = { 0, 0, W, H }; AdjustWindowRectEx(&r, WS_POPUP, FALSE, WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE);
 Win = CreateWindowExW(WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE, wc.lpszClassName, L"cg case", WS_POPUP, -32000, -32000, r.right - r.left, r.bottom - r.top, NULL, NULL, wc.hInstance, NULL);
 ShowWindow(Win, SW_SHOWNOACTIVATE);
 std::string a = Encode(PA, W, H, GUID_ContainerFormatPng), b = Encode(PB, W, H, GUID_ContainerFormatPng), c = Encode(PC, W, H, GUID_ContainerFormatJpeg),
  d = Encode(PD, W, H, GUID_ContainerFormatPng), e = Encode(PE, 200, 200, GUID_ContainerFormatPng);
 Pack p; p.Write("cg.fpk", { { "ev/a.png", a }, { "ev/b.png", b }, { "ev/d.png", d }, { "fg/e.png", e } });
 Put("gallery_c.jpg", c);
 DWORD n = 0;
 char *pb = p.ReadFresh("ev/b.png", &n); g.Hold(pb); char *pb2 = p.ReadInPlace("ev/b.png", &n); g.Hold(pb2); // preloaded
 Pump(400); char *pa = p.ReadInPlace("ev/a.png", &n); g.Hold(pa); Pump(400); Show(pa, n);
 char *pd = p.ReadInPlace("ev/d.png", &n); g.Hold(pd); Pump(400); Show(pd, n);
 char *pe = p.ReadInPlace("fg/e.png", &n); g.Hold(pe); Pump(400); Show(pe, n);
 DWORD cn = 0; char *pc = ReadAll("gallery_c.jpg", &cn); g.Hold(pc); Show(pc, cn);
 Pump(800);
 std::string cgDir = g.dir + "cg\\", index = ReadFileAll(g.dir + "cg.jsonl"), log = ReadFileAll(g.dir + "cg.log");
 int lines = 0, cands = 0; for (char ch : index) if (ch == '\n') lines++;
 for (size_t i = 0; (i = log.find("candidate", i)) != std::string::npos; i++) cands++;
 int fail = 0;
 if (cands < 4) { printf("FAIL cg: %d candidates, want at least A B C D (heap reuse may add copies)\n%s", cands, log.c_str()); fail++; }
 if (!Recorded(cgDir, a)) { printf("FAIL cg: A (shown, decrypted in place) not recorded\n"); fail++; }
 if (!Recorded(cgDir, c)) { printf("FAIL cg: C (shown in gallery) not recorded\n"); fail++; }
 if (Recorded(cgDir, b)) { printf("FAIL cg: B (never shown) recorded: spoiler\n"); fail++; }
 if (Recorded(cgDir, d)) { printf("FAIL cg: D (flat fade) recorded\n"); fail++; }
 if (Recorded(cgDir, e)) { printf("FAIL cg: E (sprite) recorded\n"); fail++; }
 if (lines != 2) { printf("FAIL cg: cg.jsonl has %d lines, want 2\n%s", lines, index.c_str()); fail++; }
 printf("cg: %d recorded, %d failures\n", lines, fail);
 DestroyWindow(Win);
 return fail;
}
