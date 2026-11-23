// SPDX-License-Identifier: GPL-3.0-or-later
// MeguLitBorderless32/64.dll — forced borderless fullscreen (docs/text-architecture.md, ② capture compositor).
// Loaded into the game before it creates its renderer (MeguLitBorderlessLaunch32/64.exe starts the game suspended and loads it).
// When the game asks for exclusive fullscreen it stays windowed, and its window becomes borderless:
//   - Direct3D 9: IDirect3D9::CreateDevice / IDirect3D9Ex::CreateDeviceEx / IDirect3DDevice9::Reset / ResetEx with
//     Windowed = FALSE → TRUE (refresh rate 0, presentation interval limited to the windowed ones, no fullscreen mode);
//   - DXGI: IDXGIFactory::CreateSwapChain / IDXGIFactory2::CreateSwapChainForHwnd / D3D11CreateDeviceAndSwapChain with
//     Windowed = FALSE → TRUE, IDXGISwapChain::SetFullscreenState(TRUE) → FALSE;
//   - DirectDraw: IDirectDraw*::SetCooperativeLevel(DDSCL_EXCLUSIVE | DDSCL_FULLSCREEN) → DDSCL_NORMAL, SetDisplayMode
//     answered DD_OK without changing the mode (games that then build a flipping primary chain need DxWnd-style
//     surface emulation, not done here);
//   - ChangeDisplaySettings(Ex)A/W resolution changes: answered DISP_CHANGE_SUCCESSFUL, the desktop keeps its mode.
// The window: caption and frame removed, WS_POPUP. MEGULIT_BORDERLESS = "fill" (default): monitor-sized, the game's
// own Present stretches its back buffer; "native": back-buffer-sized and centred, for MeguLitCompositor --scale to
// scale it up with Magpie's Lanczos (sharper, and the glyph dots stay 3 px); "keep": styles only (self-test).
// References: DxWnd (GPL), Borderless Gaming (GPL) — same idea, independent code. Every hook is guarded: on any failure
// the original call goes through unchanged. MEGULIT_BORDERLESS_LOG = file to append one line per intercepted request.
#include <windows.h>
#include <d3d9.h>
#include <dxgi1_2.h>
#include <d3d11.h>
#include <ddraw.h>
#include <cstdio>
#include <cwchar>
#include "../shared/minhook/include/MinHook.h"

namespace {
enum class Mode { Fill, Native, Keep };
Mode How = Mode::Fill;
wchar_t LogPath[MAX_PATH];
CRITICAL_SECTION Gate;
volatile LONG Counts[8]; // d3d9, d3d9-reset, dxgi-create, dxgi-fullscreen, ddraw-coop, ddraw-mode, display-settings, borderless

void Log(const char *fmt, ...) {
  if (!LogPath[0]) return;
  char line[512]; va_list a; va_start(a, fmt); vsnprintf(line, sizeof line, fmt, a); va_end(a);
  HANDLE f = CreateFileW(LogPath, FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_ALWAYS, 0, nullptr);
  if (f == INVALID_HANDLE_VALUE) return;
  DWORD n; WriteFile(f, line, DWORD(strlen(line)), &n, nullptr); WriteFile(f, "\r\n", 2, &n, nullptr); CloseHandle(f);
}

// Borderless: no caption/frame, monitor-sized (fill) or back-buffer-sized and centred (native).
void MakeBorderless(HWND h, int w, int ht) {
  if (!h || !IsWindow(h)) return;
  h = GetAncestor(h, GA_ROOT);
  LONG_PTR st = GetWindowLongPtrW(h, GWL_STYLE), ex = GetWindowLongPtrW(h, GWL_EXSTYLE);
  st &= ~LONG_PTR(WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_BORDER | WS_DLGFRAME);
  st |= WS_POPUP;
  ex &= ~LONG_PTR(WS_EX_DLGMODALFRAME | WS_EX_CLIENTEDGE | WS_EX_STATICEDGE | WS_EX_WINDOWEDGE);
  SetWindowLongPtrW(h, GWL_STYLE, st); SetWindowLongPtrW(h, GWL_EXSTYLE, ex);
  MONITORINFO mi{ sizeof mi }; GetMonitorInfoW(MonitorFromWindow(h, MONITOR_DEFAULTTONEAREST), &mi);
  const RECT m = mi.rcMonitor; RECT r = m;
  if (How == Mode::Native && w > 0 && ht > 0) { const int x = m.left + (m.right - m.left - w) / 2, y = m.top + (m.bottom - m.top - ht) / 2; r = { x, y, x + w, y + ht }; }
  UINT f = SWP_FRAMECHANGED | SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOOWNERZORDER;
  if (How == Mode::Keep) { RECT c; GetWindowRect(h, &c); r.left = c.left; r.top = c.top; if (w > 0 && ht > 0) { r.right = r.left + w; r.bottom = r.top + ht; } else { r.right = c.right; r.bottom = c.bottom; } }
  SetWindowPos(h, nullptr, r.left, r.top, r.right - r.left, r.bottom - r.top, f);
  InterlockedIncrement(&Counts[7]);
  Log("borderless hwnd=%p %dx%d at %d,%d", (void *)h, int(r.right - r.left), int(r.bottom - r.top), int(r.left), int(r.top));
}

template <class T> bool Hook(void *target, void *detour, T **original) {
  if (!target) return false;
  MH_STATUS s = MH_CreateHook(target, detour, reinterpret_cast<void **>(original));
  if (s == MH_ERROR_ALREADY_CREATED) return true;
  return s == MH_OK && MH_EnableHook(target) == MH_OK;
}
void **Vt(void *obj) { return *reinterpret_cast<void ***>(obj); }

// ---------------------------------------------------------------- Direct3D 9
void FixPP(D3DPRESENT_PARAMETERS *pp, HWND focus, const char *what) {
  if (!pp || pp->Windowed) return;
  const UINT w = pp->BackBufferWidth, h = pp->BackBufferHeight;
  pp->Windowed = TRUE; pp->FullScreen_RefreshRateInHz = 0;
  if (pp->PresentationInterval != D3DPRESENT_INTERVAL_IMMEDIATE && pp->PresentationInterval != D3DPRESENT_INTERVAL_DEFAULT) pp->PresentationInterval = D3DPRESENT_INTERVAL_ONE;
  HWND wnd = pp->hDeviceWindow ? pp->hDeviceWindow : focus;
  Log("d3d9 %s: fullscreen %ux%u -> windowed", what, w, h);
  MakeBorderless(wnd, int(w), int(h));
}
typedef HRESULT(STDMETHODCALLTYPE *ResetFn)(IDirect3DDevice9 *, D3DPRESENT_PARAMETERS *);
typedef HRESULT(STDMETHODCALLTYPE *ResetExFn)(IDirect3DDevice9Ex *, D3DPRESENT_PARAMETERS *, D3DDISPLAYMODEEX *);
ResetFn RealReset; ResetExFn RealResetEx;
HRESULT STDMETHODCALLTYPE MyReset(IDirect3DDevice9 *d, D3DPRESENT_PARAMETERS *pp) {
  if (pp && !pp->Windowed) { InterlockedIncrement(&Counts[1]); D3DDEVICE_CREATION_PARAMETERS cp{}; d->GetCreationParameters(&cp); FixPP(pp, cp.hFocusWindow, "Reset"); }
  return RealReset(d, pp);
}
HRESULT STDMETHODCALLTYPE MyResetEx(IDirect3DDevice9Ex *d, D3DPRESENT_PARAMETERS *pp, D3DDISPLAYMODEEX *mode) {
  if (pp && !pp->Windowed) { InterlockedIncrement(&Counts[1]); D3DDEVICE_CREATION_PARAMETERS cp{}; d->GetCreationParameters(&cp); FixPP(pp, cp.hFocusWindow, "ResetEx"); mode = nullptr; }
  return RealResetEx(d, pp, mode);
}
void HookDevice(void *dev, bool ex) {
  if (!dev) return;
  Hook(Vt(dev)[16], reinterpret_cast<void *>(&MyReset), &RealReset);
  if (ex) Hook(Vt(dev)[132], reinterpret_cast<void *>(&MyResetEx), &RealResetEx);
}
typedef HRESULT(STDMETHODCALLTYPE *CreateDeviceFn)(IDirect3D9 *, UINT, D3DDEVTYPE, HWND, DWORD, D3DPRESENT_PARAMETERS *, IDirect3DDevice9 **);
typedef HRESULT(STDMETHODCALLTYPE *CreateDeviceExFn)(IDirect3D9Ex *, UINT, D3DDEVTYPE, HWND, DWORD, D3DPRESENT_PARAMETERS *, D3DDISPLAYMODEEX *, IDirect3DDevice9Ex **);
CreateDeviceFn RealCreateDevice; CreateDeviceExFn RealCreateDeviceEx;
HRESULT STDMETHODCALLTYPE MyCreateDevice(IDirect3D9 *d3d, UINT a, D3DDEVTYPE t, HWND focus, DWORD fl, D3DPRESENT_PARAMETERS *pp, IDirect3DDevice9 **out) {
  if (pp && !pp->Windowed) { InterlockedIncrement(&Counts[0]); FixPP(pp, focus, "CreateDevice"); }
  const HRESULT hr = RealCreateDevice(d3d, a, t, focus, fl, pp, out);
  if (SUCCEEDED(hr) && out && *out) HookDevice(*out, false);
  return hr;
}
HRESULT STDMETHODCALLTYPE MyCreateDeviceEx(IDirect3D9Ex *d3d, UINT a, D3DDEVTYPE t, HWND focus, DWORD fl, D3DPRESENT_PARAMETERS *pp, D3DDISPLAYMODEEX *mode, IDirect3DDevice9Ex **out) {
  if (pp && !pp->Windowed) { InterlockedIncrement(&Counts[0]); FixPP(pp, focus, "CreateDeviceEx"); mode = nullptr; }
  const HRESULT hr = RealCreateDeviceEx(d3d, a, t, focus, fl, pp, mode, out);
  if (SUCCEEDED(hr) && out && *out) HookDevice(*out, true);
  return hr;
}
void HookD3D9Object(void *d3d, bool ex) {
  if (!d3d) return;
  Hook(Vt(d3d)[16], reinterpret_cast<void *>(&MyCreateDevice), &RealCreateDevice);
  if (ex) Hook(Vt(d3d)[20], reinterpret_cast<void *>(&MyCreateDeviceEx), &RealCreateDeviceEx);
}
typedef IDirect3D9 *(WINAPI *Create9Fn)(UINT);
typedef HRESULT(WINAPI *Create9ExFn)(UINT, IDirect3D9Ex **);
Create9Fn RealCreate9; Create9ExFn RealCreate9Ex;
IDirect3D9 *WINAPI MyCreate9(UINT v) { IDirect3D9 *d = RealCreate9(v); HookD3D9Object(d, false); return d; }
HRESULT WINAPI MyCreate9Ex(UINT v, IDirect3D9Ex **out) { const HRESULT hr = RealCreate9Ex(v, out); if (SUCCEEDED(hr) && out) HookD3D9Object(*out, true); return hr; }

// ---------------------------------------------------------------- DXGI
typedef HRESULT(STDMETHODCALLTYPE *SetFullscreenFn)(IDXGISwapChain *, BOOL, IDXGIOutput *);
SetFullscreenFn RealSetFullscreen;
HRESULT STDMETHODCALLTYPE MySetFullscreen(IDXGISwapChain *sc, BOOL full, IDXGIOutput *out) {
  if (!full) return RealSetFullscreen(sc, full, out);
  InterlockedIncrement(&Counts[3]);
  DXGI_SWAP_CHAIN_DESC d{}; sc->GetDesc(&d);
  Log("dxgi SetFullscreenState(TRUE) -> windowed %ux%u", d.BufferDesc.Width, d.BufferDesc.Height);
  MakeBorderless(d.OutputWindow, int(d.BufferDesc.Width), int(d.BufferDesc.Height));
  return RealSetFullscreen(sc, FALSE, nullptr);
}
void HookSwapChain(void *sc) { if (sc) Hook(Vt(sc)[10], reinterpret_cast<void *>(&MySetFullscreen), &RealSetFullscreen); }
typedef HRESULT(STDMETHODCALLTYPE *CreateSwapChainFn)(IDXGIFactory *, IUnknown *, DXGI_SWAP_CHAIN_DESC *, IDXGISwapChain **);
typedef HRESULT(STDMETHODCALLTYPE *CreateSwapChainHwndFn)(IDXGIFactory2 *, IUnknown *, HWND, const DXGI_SWAP_CHAIN_DESC1 *, const DXGI_SWAP_CHAIN_FULLSCREEN_DESC *, IDXGIOutput *, IDXGISwapChain1 **);
CreateSwapChainFn RealCreateSwapChain; CreateSwapChainHwndFn RealCreateSwapChainHwnd;
HRESULT STDMETHODCALLTYPE MyCreateSwapChain(IDXGIFactory *f, IUnknown *dev, DXGI_SWAP_CHAIN_DESC *d, IDXGISwapChain **out) {
  if (d && !d->Windowed) { InterlockedIncrement(&Counts[2]); d->Windowed = TRUE; Log("dxgi CreateSwapChain: fullscreen -> windowed"); MakeBorderless(d->OutputWindow, int(d->BufferDesc.Width), int(d->BufferDesc.Height)); }
  const HRESULT hr = RealCreateSwapChain(f, dev, d, out);
  if (SUCCEEDED(hr) && out && *out) HookSwapChain(*out);
  return hr;
}
HRESULT STDMETHODCALLTYPE MyCreateSwapChainHwnd(IDXGIFactory2 *f, IUnknown *dev, HWND h, const DXGI_SWAP_CHAIN_DESC1 *d, const DXGI_SWAP_CHAIN_FULLSCREEN_DESC *fs, IDXGIOutput *o, IDXGISwapChain1 **out) {
  DXGI_SWAP_CHAIN_FULLSCREEN_DESC win{};
  if (fs && !fs->Windowed) { InterlockedIncrement(&Counts[2]); win = *fs; win.Windowed = TRUE; fs = &win; o = nullptr; Log("dxgi CreateSwapChainForHwnd: fullscreen -> windowed"); MakeBorderless(h, d ? int(d->Width) : 0, d ? int(d->Height) : 0); }
  const HRESULT hr = RealCreateSwapChainHwnd(f, dev, h, d, fs, o, out);
  if (SUCCEEDED(hr) && out && *out) HookSwapChain(*out);
  return hr;
}
void HookFactory(void *f) {
  if (!f) return;
  Hook(Vt(f)[10], reinterpret_cast<void *>(&MyCreateSwapChain), &RealCreateSwapChain);
  IDXGIFactory2 *f2 = nullptr;
  if (SUCCEEDED(static_cast<IUnknown *>(f)->QueryInterface(__uuidof(IDXGIFactory2), reinterpret_cast<void **>(&f2))) && f2) { Hook(Vt(f2)[15], reinterpret_cast<void *>(&MyCreateSwapChainHwnd), &RealCreateSwapChainHwnd); f2->Release(); }
}
typedef HRESULT(WINAPI *CreateFactoryFn)(REFIID, void **);
typedef HRESULT(WINAPI *CreateFactory2Fn)(UINT, REFIID, void **);
CreateFactoryFn RealCreateFactory, RealCreateFactory1; CreateFactory2Fn RealCreateFactory2;
HRESULT WINAPI MyCreateFactory(REFIID r, void **o) { const HRESULT hr = RealCreateFactory(r, o); if (SUCCEEDED(hr) && o) HookFactory(*o); return hr; }
HRESULT WINAPI MyCreateFactory1(REFIID r, void **o) { const HRESULT hr = RealCreateFactory1(r, o); if (SUCCEEDED(hr) && o) HookFactory(*o); return hr; }
HRESULT WINAPI MyCreateFactory2(UINT fl, REFIID r, void **o) { const HRESULT hr = RealCreateFactory2(fl, r, o); if (SUCCEEDED(hr) && o) HookFactory(*o); return hr; }
typedef HRESULT(WINAPI *D3D11CreateWithSwapFn)(IDXGIAdapter *, D3D_DRIVER_TYPE, HMODULE, UINT, const D3D_FEATURE_LEVEL *, UINT, UINT, const DXGI_SWAP_CHAIN_DESC *, IDXGISwapChain **, ID3D11Device **, D3D_FEATURE_LEVEL *, ID3D11DeviceContext **);
D3D11CreateWithSwapFn RealD3D11CreateWithSwap;
HRESULT WINAPI MyD3D11CreateWithSwap(IDXGIAdapter *a, D3D_DRIVER_TYPE t, HMODULE s, UINT fl, const D3D_FEATURE_LEVEL *lv, UINT n, UINT sdk, const DXGI_SWAP_CHAIN_DESC *d, IDXGISwapChain **sc, ID3D11Device **dev, D3D_FEATURE_LEVEL *got, ID3D11DeviceContext **ctx) {
  DXGI_SWAP_CHAIN_DESC w{};
  if (d && !d->Windowed) { InterlockedIncrement(&Counts[2]); w = *d; w.Windowed = TRUE; d = &w; Log("d3d11 CreateDeviceAndSwapChain: fullscreen -> windowed"); MakeBorderless(w.OutputWindow, int(w.BufferDesc.Width), int(w.BufferDesc.Height)); }
  const HRESULT hr = RealD3D11CreateWithSwap(a, t, s, fl, lv, n, sdk, d, sc, dev, got, ctx);
  if (SUCCEEDED(hr) && sc && *sc) HookSwapChain(*sc);
  return hr;
}

// ---------------------------------------------------------------- DirectDraw
typedef HRESULT(STDMETHODCALLTYPE *CoopFn)(void *, HWND, DWORD);
typedef HRESULT(STDMETHODCALLTYPE *ModeFn)(void *, DWORD, DWORD, DWORD); // IDirectDraw::SetDisplayMode (3 args)
typedef HRESULT(STDMETHODCALLTYPE *Mode2Fn)(void *, DWORD, DWORD, DWORD, DWORD, DWORD); // IDirectDraw2/4/7 (5 args)
CoopFn RealCoop[4]; ModeFn RealMode1; Mode2Fn RealMode[3];
DWORD Fix(void *, HWND h, DWORD fl) {
  if (!(fl & (DDSCL_EXCLUSIVE | DDSCL_FULLSCREEN))) return fl;
  InterlockedIncrement(&Counts[4]); Log("ddraw SetCooperativeLevel exclusive -> normal");
  MakeBorderless(h, 0, 0);
  return (fl & ~DWORD(DDSCL_EXCLUSIVE | DDSCL_FULLSCREEN | DDSCL_ALLOWMODEX | DDSCL_ALLOWREBOOT)) | DDSCL_NORMAL;
}
HRESULT STDMETHODCALLTYPE MyCoop0(void *s, HWND h, DWORD f) { return RealCoop[0](s, h, Fix(s, h, f)); }
HRESULT STDMETHODCALLTYPE MyCoop1(void *s, HWND h, DWORD f) { return RealCoop[1](s, h, Fix(s, h, f)); }
HRESULT STDMETHODCALLTYPE MyCoop2(void *s, HWND h, DWORD f) { return RealCoop[2](s, h, Fix(s, h, f)); }
HRESULT STDMETHODCALLTYPE MyCoop3(void *s, HWND h, DWORD f) { return RealCoop[3](s, h, Fix(s, h, f)); }
HRESULT STDMETHODCALLTYPE MyMode1(void *, DWORD w, DWORD h, DWORD) { InterlockedIncrement(&Counts[5]); Log("ddraw SetDisplayMode %ux%u ignored", w, h); return DD_OK; }
HRESULT STDMETHODCALLTYPE MyModeN(void *, DWORD w, DWORD h, DWORD, DWORD, DWORD) { InterlockedIncrement(&Counts[5]); Log("ddraw SetDisplayMode %ux%u ignored", w, h); return DD_OK; }
void HookDDraw(void *dd) {
  if (!dd) return;
  static void *coops[4] = { reinterpret_cast<void *>(&MyCoop0), reinterpret_cast<void *>(&MyCoop1), reinterpret_cast<void *>(&MyCoop2), reinterpret_cast<void *>(&MyCoop3) };
  const IID *ids[4] = { &IID_IDirectDraw, &IID_IDirectDraw2, &IID_IDirectDraw4, &IID_IDirectDraw7 };
  for (int k = 0; k < 4; ++k) {
    void *itf = nullptr;
    if (FAILED(static_cast<IUnknown *>(dd)->QueryInterface(*ids[k], &itf)) || !itf) continue;
    Hook(Vt(itf)[20], coops[k], &RealCoop[k]);
    if (k == 0) Hook(Vt(itf)[21], reinterpret_cast<void *>(&MyMode1), &RealMode1);
    else Hook(Vt(itf)[21], reinterpret_cast<void *>(&MyModeN), &RealMode[k - 1]);
    static_cast<IUnknown *>(itf)->Release();
  }
}
typedef HRESULT(WINAPI *DDCreateFn)(GUID *, LPDIRECTDRAW *, IUnknown *);
typedef HRESULT(WINAPI *DDCreateExFn)(GUID *, void **, REFIID, IUnknown *);
DDCreateFn RealDDCreate; DDCreateExFn RealDDCreateEx;
HRESULT WINAPI MyDDCreate(GUID *g, LPDIRECTDRAW *o, IUnknown *u) { const HRESULT hr = RealDDCreate(g, o, u); if (SUCCEEDED(hr) && o) HookDDraw(*o); return hr; }
HRESULT WINAPI MyDDCreateEx(GUID *g, void **o, REFIID r, IUnknown *u) { const HRESULT hr = RealDDCreateEx(g, o, r, u); if (SUCCEEDED(hr) && o) HookDDraw(*o); return hr; }

// ---------------------------------------------------------------- ChangeDisplaySettings
bool ModeChange(const void *dm, DWORD fl) { return dm && !(fl & CDS_TEST); }
typedef LONG(WINAPI *CdsAFn)(DEVMODEA *, DWORD); typedef LONG(WINAPI *CdsWFn)(DEVMODEW *, DWORD);
typedef LONG(WINAPI *CdsExAFn)(LPCSTR, DEVMODEA *, HWND, DWORD, LPVOID); typedef LONG(WINAPI *CdsExWFn)(LPCWSTR, DEVMODEW *, HWND, DWORD, LPVOID);
CdsAFn RealCdsA; CdsWFn RealCdsW; CdsExAFn RealCdsExA; CdsExWFn RealCdsExW;
LONG Pretend(DWORD w, DWORD h) { InterlockedIncrement(&Counts[6]); Log("ChangeDisplaySettings %ux%u ignored", w, h); return DISP_CHANGE_SUCCESSFUL; }
LONG WINAPI MyCdsA(DEVMODEA *d, DWORD f) { if (!d && !(f & CDS_TEST)) return DISP_CHANGE_SUCCESSFUL; return ModeChange(d, f) ? Pretend(d->dmPelsWidth, d->dmPelsHeight) : RealCdsA(d, f); }
LONG WINAPI MyCdsW(DEVMODEW *d, DWORD f) { if (!d && !(f & CDS_TEST)) return DISP_CHANGE_SUCCESSFUL; return ModeChange(d, f) ? Pretend(d->dmPelsWidth, d->dmPelsHeight) : RealCdsW(d, f); }
LONG WINAPI MyCdsExA(LPCSTR n, DEVMODEA *d, HWND h, DWORD f, LPVOID p) { if (!d && !(f & CDS_TEST)) return DISP_CHANGE_SUCCESSFUL; return ModeChange(d, f) ? Pretend(d->dmPelsWidth, d->dmPelsHeight) : RealCdsExA(n, d, h, f, p); }
LONG WINAPI MyCdsExW(LPCWSTR n, DEVMODEW *d, HWND h, DWORD f, LPVOID p) { if (!d && !(f & CDS_TEST)) return DISP_CHANGE_SUCCESSFUL; return ModeChange(d, f) ? Pretend(d->dmPelsWidth, d->dmPelsHeight) : RealCdsExW(n, d, h, f, p); }

// ---------------------------------------------------------------- module watching
void HookModules() {
  EnterCriticalSection(&Gate);
  if (HMODULE m = GetModuleHandleW(L"d3d9.dll")) { Hook(GetProcAddress(m, "Direct3DCreate9"), reinterpret_cast<void *>(&MyCreate9), &RealCreate9); Hook(GetProcAddress(m, "Direct3DCreate9Ex"), reinterpret_cast<void *>(&MyCreate9Ex), &RealCreate9Ex); }
  if (HMODULE m = GetModuleHandleW(L"dxgi.dll")) { Hook(GetProcAddress(m, "CreateDXGIFactory"), reinterpret_cast<void *>(&MyCreateFactory), &RealCreateFactory); Hook(GetProcAddress(m, "CreateDXGIFactory1"), reinterpret_cast<void *>(&MyCreateFactory1), &RealCreateFactory1); Hook(GetProcAddress(m, "CreateDXGIFactory2"), reinterpret_cast<void *>(&MyCreateFactory2), &RealCreateFactory2); }
  if (HMODULE m = GetModuleHandleW(L"d3d11.dll")) Hook(GetProcAddress(m, "D3D11CreateDeviceAndSwapChain"), reinterpret_cast<void *>(&MyD3D11CreateWithSwap), &RealD3D11CreateWithSwap);
  if (HMODULE m = GetModuleHandleW(L"ddraw.dll")) { Hook(GetProcAddress(m, "DirectDrawCreate"), reinterpret_cast<void *>(&MyDDCreate), &RealDDCreate); Hook(GetProcAddress(m, "DirectDrawCreateEx"), reinterpret_cast<void *>(&MyDDCreateEx), &RealDDCreateEx); }
  LeaveCriticalSection(&Gate);
}
typedef HMODULE(WINAPI *LoadExWFn)(LPCWSTR, HANDLE, DWORD);
LoadExWFn RealLoadExW;
HMODULE WINAPI MyLoadExW(LPCWSTR n, HANDLE f, DWORD fl) {
  const HMODULE m = RealLoadExW(n, f, fl);
  if (m && n && !(fl & (LOAD_LIBRARY_AS_DATAFILE | LOAD_LIBRARY_AS_IMAGE_RESOURCE | LOAD_LIBRARY_AS_DATAFILE_EXCLUSIVE))) {
    const wchar_t *base = wcsrchr(n, L'\\'); base = base ? base + 1 : n;
    if (!_wcsnicmp(base, L"d3d9", 4) || !_wcsnicmp(base, L"dxgi", 4) || !_wcsnicmp(base, L"d3d11", 5) || !_wcsnicmp(base, L"ddraw", 5)) HookModules();
  }
  return m;
}

DWORD WINAPI Start(void *) {
  wchar_t v[32] = {};
  if (GetEnvironmentVariableW(L"MEGULIT_BORDERLESS", v, 32)) { if (!_wcsicmp(v, L"native")) How = Mode::Native; else if (!_wcsicmp(v, L"keep")) How = Mode::Keep; }
  GetEnvironmentVariableW(L"MEGULIT_BORDERLESS_LOG", LogPath, MAX_PATH);
  if (MH_Initialize() != MH_OK) return 0;
  if (HMODULE u = GetModuleHandleW(L"user32.dll")) {
    Hook(GetProcAddress(u, "ChangeDisplaySettingsA"), reinterpret_cast<void *>(&MyCdsA), &RealCdsA);
    Hook(GetProcAddress(u, "ChangeDisplaySettingsW"), reinterpret_cast<void *>(&MyCdsW), &RealCdsW);
    Hook(GetProcAddress(u, "ChangeDisplaySettingsExA"), reinterpret_cast<void *>(&MyCdsExA), &RealCdsExA);
    Hook(GetProcAddress(u, "ChangeDisplaySettingsExW"), reinterpret_cast<void *>(&MyCdsExW), &RealCdsExW);
  }
  HMODULE kb = GetModuleHandleW(L"kernelbase.dll"); if (!kb) kb = GetModuleHandleW(L"kernel32.dll");
  if (kb) Hook(GetProcAddress(kb, "LoadLibraryExW"), reinterpret_cast<void *>(&MyLoadExW), &RealLoadExW);
  HookModules();
  Log("MeguLitBorderless ready mode=%s", How == Mode::Fill ? "fill" : How == Mode::Native ? "native" : "keep");
  return 0;
}
} // namespace

// Self-test entry points: install the same vtable hooks on caller-supplied objects, read the counters.
extern "C" __declspec(dllexport) void MeguLitBorderlessHook(int kind, void *obj) {
  switch (kind) { case 0: HookD3D9Object(obj, true); break; case 1: HookDevice(obj, true); break; case 2: HookSwapChain(obj); break; case 3: HookDDraw(obj); break; case 4: HookFactory(obj); break; }
}
extern "C" __declspec(dllexport) LONG MeguLitBorderlessCount(int k) { return k >= 0 && k < 8 ? Counts[k] : -1; }

BOOL WINAPI DllMain(HINSTANCE self, DWORD reason, LPVOID) {
  if (reason == DLL_PROCESS_ATTACH) {
    DisableThreadLibraryCalls(self); InitializeCriticalSection(&Gate);
    // Hooks go in right here (not on a thread): the game's main thread may be about to create its device.
    Start(nullptr);
  }
  return TRUE;
}
