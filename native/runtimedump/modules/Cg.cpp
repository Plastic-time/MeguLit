// SPDX-License-Identifier: GPL-3.0-or-later
// Runtime CG unlock, module Cg of MeguLitDump32/64.dll (modules.h: CgStart/CgTick; plain buffers arrive via DumpSink). Engine-independent: whatever the
// archive cipher, the game must hold a plain PNG/JPEG/BMP/WebP/TLG file image in its own memory before it can decode a
// CG. RuntimeDump already watches every buffer a tracked file read turns into (in place, fresh buffer, decompressor
// output); each one that starts with an image magic and is at least CG-sized becomes a candidate, kept in memory only.
//
// NO SPOILERS: loading is not seeing (games preload the next CG, galleries load tables). A candidate is recorded only when
// the game's own window shows it: every poll a 32x18 grey signature of the window (PrintWindow, so the window may be
// covered or off screen) is compared with each candidate's signature (decoded with WIC); the upper two thirds must match
// (the text box covers the bottom) on two polls in a row, and flat pictures (black/white fades) never count. A CG shown
// in the game's gallery/recollection mode matches the same way. Only then is the plain file image written:
//   <dump>\cg\<crc>_<w>x<h>.<ext> and one JSON line in <dump>\cg.jsonl (services/runtime-cg.cjs reads it). cg.log lists
// candidates (CRC, size, how, source; no pixels) and which were shown, for diagnosis.
// Limits: TLG (KiriKiri) and other formats WIC cannot decode are never confirmed; a CG drawn scaled, scrolled or under
// heavy effects may not match; images read in pieces (header first, body later) are not seen as one file image.
#include <windows.h>
#include <wincodec.h>
#include <stdio.h>
#include <string>
#include <vector>
#include <set>
#include <time.h>
#include "modules.h"

namespace cg {
const int SW = 32, SH = 18, TOP = 12;          // signature grid; rows [0, TOP) are compared
const DWORD MaxBytes = 40u << 20, Keep = 48, LifeMs = 10 * 60 * 1000;
struct Cand { std::vector<unsigned char> data; std::string source, how, ext; ULONG crc; DWORD w, h, tick; int sig[SW * SH]; bool sigOk, sigTried; int hits; };
CRITICAL_SECTION Lock; bool Inited; std::wstring Dir; std::vector<Cand *> Cands; std::set<ULONG> Done;
typedef ULONG(NTAPI *Crc32Fn)(ULONG, const void *, ULONG); Crc32Fn Crc;
IWICImagingFactory *Wic;

std::string J(const std::string &s) { std::string r = "\""; for (unsigned char c : s) { if (c == '"' || c == '\\') { r += '\\'; r += (char)c; } else if (c < 0x20) { char b[8]; sprintf_s(b, "\\u%04x", c); r += b; } else r += (char)c; } return r + "\""; }
DWORD Be32(const unsigned char *p) { return (p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]; }
// Format and size from the header; false for anything that is not an image file image.
bool Probe(const unsigned char *p, DWORD n, std::string &ext, DWORD &w, DWORD &h) {
 if (n < 32) return false;
 if (!memcmp(p, "\x89PNG\r\n\x1a\n", 8) && !memcmp(p + 12, "IHDR", 4)) { ext = "png"; w = Be32(p + 16); h = Be32(p + 20); return true; }
 if (p[0] == 'B' && p[1] == 'M' && *(DWORD *)(p + 2) <= n + 16 && *(DWORD *)(p + 2) >= 54) { ext = "bmp"; w = *(DWORD *)(p + 18); LONG hh = *(LONG *)(p + 22); h = hh < 0 ? -hh : hh; return true; }
 if (!memcmp(p, "RIFF", 4) && !memcmp(p + 8, "WEBP", 4)) {
  ext = "webp";
  if (!memcmp(p + 12, "VP8X", 4)) { w = 1 + (p[24] | (p[25] << 8) | (p[26] << 16)); h = 1 + (p[27] | (p[28] << 8) | (p[29] << 16)); return true; }
  if (!memcmp(p + 12, "VP8 ", 4)) { w = (p[26] | (p[27] << 8)) & 0x3fff; h = (p[28] | (p[29] << 8)) & 0x3fff; return true; }
  if (!memcmp(p + 12, "VP8L", 4)) { DWORD b = p[21] | (p[22] << 8) | (p[23] << 16) | (p[24] << 24); w = (b & 0x3fff) + 1; h = ((b >> 14) & 0x3fff) + 1; return true; }
  return false;
 }
 if (!memcmp(p, "TLG", 3) && (!memcmp(p + 3, "5.0", 3) || !memcmp(p + 3, "6.0", 3) || !memcmp(p + 3, "0.0", 3))) {
  DWORD o = !memcmp(p + 3, "0.0", 3) ? 15 : 0; // TLG0.0 sds wraps a TLG5/6 header
  if (o + 19 > n || memcmp(p + o, "TLG", 3)) return false;
  ext = "tlg"; w = *(DWORD *)(p + o + 12); h = *(DWORD *)(p + o + 16); return true;
 }
 if (p[0] == 0xFF && p[1] == 0xD8 && p[2] == 0xFF) { // JPEG: walk segments to the first SOFn
  for (DWORD i = 2; i + 9 < n && i < (1u << 20); ) {
   if (p[i] != 0xFF) return false;
   BYTE m = p[i + 1];
   if (m >= 0xC0 && m <= 0xCF && m != 0xC4 && m != 0xC8 && m != 0xCC) { ext = "jpg"; h = (p[i + 5] << 8) | p[i + 6]; w = (p[i + 7] << 8) | p[i + 8]; return true; }
   i += 2 + ((p[i + 2] << 8) | p[i + 3]);
  }
 }
 return false;
}
// Sprites, icons and UI parts are small; event CGs and backgrounds fill the screen.
bool CgSized(DWORD w, DWORD h) { return w >= 640 && h >= 360 && w <= 16384 && h <= 16384 && w * 10 >= h * 9 && w <= h * 4; }

// Mean grey over cell blocks of a top-down BGRA picture.
void Grid(const unsigned char *px, int w, int h, int stride, int *sig) {
 for (int gy = 0; gy < SH; gy++) for (int gx = 0; gx < SW; gx++) {
  int x0 = gx * w / SW, x1 = (gx + 1) * w / SW, y0 = gy * h / SH, y1 = (gy + 1) * h / SH; long long s = 0; int c = 0;
  int stepX = (x1 - x0) / 8 + 1, stepY = (y1 - y0) / 8 + 1;
  for (int y = y0; y < y1; y += stepY) for (int x = x0; x < x1; x += stepX) { const unsigned char *q = px + (size_t)y * stride + x * 4; s += (q[2] * 77 + q[1] * 150 + q[0] * 29) >> 8; c++; }
  sig[gy * SW + gx] = c ? (int)(s / c) : 0;
 }
}
bool Flat(const int *sig) { int lo = 255, hi = 0; for (int i = 0; i < SW * TOP; i++) { if (sig[i] < lo) lo = sig[i]; if (sig[i] > hi) hi = sig[i]; } return hi - lo < 40; }
bool Decode(Cand *c) {
 c->sigTried = true;
 if (!Wic || c->ext == "tlg") return false;
 IWICStream *st = NULL; IWICBitmapDecoder *dec = NULL; IWICBitmapFrameDecode *fr = NULL; IWICFormatConverter *cv = NULL; bool ok = false;
 if (SUCCEEDED(Wic->CreateStream(&st)) && SUCCEEDED(st->InitializeFromMemory(c->data.data(), (DWORD)c->data.size())) &&
     SUCCEEDED(Wic->CreateDecoderFromStream(st, NULL, WICDecodeMetadataCacheOnDemand, &dec)) && SUCCEEDED(dec->GetFrame(0, &fr)) &&
     SUCCEEDED(Wic->CreateFormatConverter(&cv)) && SUCCEEDED(cv->Initialize(fr, GUID_WICPixelFormat32bppBGRA, WICBitmapDitherTypeNone, NULL, 0, WICBitmapPaletteTypeCustom))) {
  UINT w = 0, h = 0; cv->GetSize(&w, &h);
  if (w && h && (UINT64)w * h <= (64u << 20)) {
   std::vector<unsigned char> px((size_t)w * h * 4);
   if (SUCCEEDED(cv->CopyPixels(NULL, w * 4, (UINT)px.size(), px.data()))) { Grid(px.data(), w, h, w * 4, c->sig); ok = !Flat(c->sig); }
  }
 }
 if (cv) cv->Release(); if (fr) fr->Release(); if (dec) dec->Release(); if (st) st->Release();
 return c->sigOk = ok;
}

// The game's main window: the largest visible top-level window of this process.
struct Find { DWORD pid; HWND best; LONG area; };
BOOL CALLBACK Each(HWND w, LPARAM l) {
 Find *f = (Find *)l; DWORD pid = 0; GetWindowThreadProcessId(w, &pid);
 if (pid != f->pid || !IsWindowVisible(w) || GetWindow(w, GW_OWNER)) return TRUE;
 RECT r; if (!GetClientRect(w, &r)) return TRUE;
 LONG a = (r.right - r.left) * (r.bottom - r.top); if (a > f->area) { f->area = a; f->best = w; }
 return TRUE;
}
bool Screen(int *sig) {
 Find f = { GetCurrentProcessId(), NULL, 0 }; EnumWindows(Each, (LPARAM)&f);
 if (!f.best || f.area < 320 * 240 || IsIconic(f.best)) return false;
 RECT r; GetClientRect(f.best, &r); int w = r.right, h = r.bottom;
 HDC wdc = GetDC(f.best); if (!wdc) return false;
 HDC mdc = CreateCompatibleDC(wdc);
 BITMAPINFO bi = {}; bi.bmiHeader.biSize = sizeof bi.bmiHeader; bi.bmiHeader.biWidth = w; bi.bmiHeader.biHeight = -h; bi.bmiHeader.biPlanes = 1; bi.bmiHeader.biBitCount = 32;
 void *bits = NULL; HBITMAP bmp = CreateDIBSection(wdc, &bi, DIB_RGB_COLORS, &bits, NULL, 0); bool ok = false;
 if (bmp && bits) {
  HGDIOBJ old = SelectObject(mdc, bmp);
  ok = PrintWindow(f.best, mdc, PW_CLIENTONLY | 2 /* PW_RENDERFULLCONTENT */) != 0;
  GdiFlush(); SelectObject(mdc, old);
  if (ok) { Grid((const unsigned char *)bits, w, h, w * 4, sig); ok = !Flat(sig); }
 }
 if (bmp) DeleteObject(bmp); DeleteDC(mdc); ReleaseDC(f.best, wdc);
 return ok;
}
bool Same(const int *a, const int *b) { long d = 0; for (int i = 0; i < SW * TOP; i++) d += abs(a[i] - b[i]); return d < 14L * SW * TOP; }

void Append(const std::wstring &file, const std::string &line) {
 HANDLE h = CreateFileW(file.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_ALWAYS, 0, NULL);
 if (h == INVALID_HANDLE_VALUE) return; DWORD wr; WriteFile(h, line.data(), (DWORD)line.size(), &wr, NULL); CloseHandle(h);
}
void Record(Cand *c) {
 wchar_t name[96]; swprintf_s(name, L"%08lx_%lux%lu.%S", c->crc, c->w, c->h, c->ext.c_str());
 std::wstring folder = Dir + L"cg\\"; CreateDirectoryW(folder.c_str(), NULL);
 std::wstring tmp = folder + name + L".tmp";
 HANDLE h = CreateFileW(tmp.c_str(), GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, 0, NULL); if (h == INVALID_HANDLE_VALUE) return;
 DWORD wr = 0; BOOL ok = WriteFile(h, c->data.data(), (DWORD)c->data.size(), &wr, NULL); CloseHandle(h);
 if (!ok || !MoveFileExW(tmp.c_str(), (folder + name).c_str(), MOVEFILE_REPLACE_EXISTING)) { DeleteFileW(tmp.c_str()); return; }
 char file[96]; sprintf_s(file, "%08lx_%lux%lu.%s", c->crc, c->w, c->h, c->ext.c_str());
 char line[1024]; sprintf_s(line, "{\"file\":\"cg/%s\",\"source\":%s,\"how\":\"%s\",\"crc\":\"%08lx\",\"w\":%lu,\"h\":%lu,\"fmt\":\"%s\",\"size\":%lu,\"at\":%llu}\n",
  file, J(c->source).c_str(), c->how.c_str(), c->crc, c->w, c->h, c->ext.c_str(), (DWORD)c->data.size(), (unsigned long long)time(NULL));
 Append(Dir + L"cg.jsonl", line);
}
}

// Called by RuntimeDump with a plain buffer (a copy or the game's own memory, under its guard).
namespace cg {
bool RawCopy(void *dst, const void *src, DWORD n) { __try { memcpy(dst, src, n); return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; } }
}
static void CgSee(const char *source, const char *how, const unsigned char *p, DWORD n) {
 using namespace cg;
 if (!Inited || n > MaxBytes || n < 32) return;
 DWORD hn = n < 65536 ? n : 65536; std::vector<unsigned char> head(hn);
 if (!RawCopy(head.data(), p, hn)) return;
 std::string ext; DWORD w = 0, h = 0;
 if (!Probe(head.data(), hn, ext, w, h) || !CgSized(w, h)) return;
 std::vector<unsigned char> data(n);
 if (!RawCopy(data.data(), p, n)) return;
 ULONG crc = Crc ? Crc(0, data.data(), n) : n;
 EnterCriticalSection(&Lock);
 bool known = Done.count(crc) > 0; for (auto c : Cands) if (c->crc == crc) { c->tick = GetTickCount(); known = true; }
 if (!known) {
  Cand *c = new Cand(); c->data.swap(data); c->source = source; c->how = how; c->ext = ext; c->crc = crc; c->w = w; c->h = h; c->tick = GetTickCount(); c->sigOk = c->sigTried = false; c->hits = 0;
  Cands.push_back(c);
  char line[512]; sprintf_s(line, "candidate %08lx %lux%lu %s %s %s\r\n", crc, w, h, ext.c_str(), how, source);
  Append(Dir + L"cg.log", line);
  while (Cands.size() > Keep) { delete Cands.front(); Cands.erase(Cands.begin()); }
 }
 LeaveCriticalSection(&Lock);
}
void CgStart(const wchar_t *out) {
 using namespace cg;
 InitializeCriticalSection(&Lock); Dir = out;
 Crc = (Crc32Fn)GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "RtlComputeCrc32");
 Inited = true;
 DumpSink(CgSee);
}
// Watcher thread, every poll: decode new candidates, compare with the window, record what the player saw.
void CgTick() {
 using namespace cg;
 static unsigned n; if (!Inited || n++ % 3) return; // about every 360 ms
 static bool com; if (!com) { com = true; CoInitializeEx(NULL, COINIT_MULTITHREADED); CoCreateInstance(CLSID_WICImagingFactory, NULL, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&Wic)); }
 std::vector<Cand *> now; EnterCriticalSection(&Lock);
 DWORD t = GetTickCount();
 for (size_t i = 0; i < Cands.size(); ) { if (t - Cands[i]->tick > LifeMs) { delete Cands[i]; Cands.erase(Cands.begin() + i); } else now.push_back(Cands[i++]); }
 LeaveCriticalSection(&Lock);
 if (now.empty()) return;
 for (auto c : now) if (!c->sigTried) Decode(c); // only this thread touches signatures
 int screen[SW * SH]; bool shown = Screen(screen);
 std::vector<Cand *> seen;
 for (auto c : now) {
  if (!c->sigOk) continue;
  if (shown && Same(c->sig, screen)) { if (++c->hits >= 2) seen.push_back(c); } else c->hits = 0;
 }
 if (seen.empty()) return;
 EnterCriticalSection(&Lock);
 for (auto c : seen) { Done.insert(c->crc); for (size_t i = 0; i < Cands.size(); i++) if (Cands[i] == c) { Cands.erase(Cands.begin() + i); break; } }
 LeaveCriticalSection(&Lock);
 for (auto c : seen) { char line[96]; sprintf_s(line, "shown %08lx\r\n", c->crc); Append(Dir + L"cg.log", line); Record(c); delete c; }
}
