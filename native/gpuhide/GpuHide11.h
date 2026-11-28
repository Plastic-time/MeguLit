// SPDX-License-Identifier: GPL-3.0-or-later
// Direct3D 11 side of hide layer 4 (included by GpuHide.cpp after the D3D9 part; same learner, same rules).
// The functions behind ID3D11Device / ID3D11DeviceContext / IDXGISwapChain are found through a throwaway device and
// swap chain created inside the game's own d3d11.dll and hooked in place. Vertex positions and texture coordinates
// come from the input layout (CreateInputLayout: POSITION / SV_Position and TEXCOORD0 of input slot 0; a layout made
// before the DLL arrived is guessed: position float2 at 0, texture coordinate float2 in the last 8 bytes) and from
// read-only shadows of vertex / index buffers (Map + Unmap, UpdateSubresource). Shaders decide the real transform, so
// the pipeline state is read with the context's own getters at each draw. A position is read as normalised device coordinates when every corner of the draw lies within [-1, 1] (mapped
// through the viewport), else as pixels. A left-out glyph is the same draw re-issued for the other quads.
#include <d3d11.h>
#include <dxgi.h>

struct Layout11 { int pos = -1, uv = -1; DXGI_FORMAT posFmt = DXGI_FORMAT_UNKNOWN, uvFmt = DXGI_FORMAT_UNKNOWN; };
static std::map<void *, Layout11> Layouts11;      // input layout -> where position and uv are
struct Ctx11 { void *layout; void *vb; UINT vbStride, vbOff; void *ib; DXGI_FORMAT ibFmt; UINT ibOff; D3D11_PRIMITIVE_TOPOLOGY topo; void *tex0; void *rt; D3D11_VIEWPORT vp; };
static Ctx11 Ctx; // state of the draw being decided (filled under Lock by Snapshot)
static std::map<void *, void *> SrvRes;           // shader-resource view -> its resource (cache)
struct MapRec { void *res; void *ptr; UINT size; };
static std::vector<MapRec> Maps11;
static unsigned BackW11, BackH11; static void *BackRes11;

static bool Float2(const unsigned char *p, DXGI_FORMAT f, float &x, float &y) {
 switch (f) { case DXGI_FORMAT_R32G32_FLOAT: case DXGI_FORMAT_R32G32B32_FLOAT: case DXGI_FORMAT_R32G32B32A32_FLOAT: x = ((const float *)p)[0]; y = ((const float *)p)[1]; return std::isfinite(x) && std::isfinite(y); default: return false; }
}
static TexInfo Tex11(void *res) {
 /* asked every time, never cached by pointer: a game that makes a new glyph sheet per sentence gets the freed texture's
    address again, and the old size / render-target flag made the page's glyphs come and go (2026-11-15) */
 TexInfo i = { 0, 0, D3DFMT_UNKNOWN, false }; if (!res) return i;
 ID3D11Resource *r = (ID3D11Resource *)res; D3D11_RESOURCE_DIMENSION dim; r->GetType(&dim);
 if (dim == D3D11_RESOURCE_DIMENSION_TEXTURE2D) { D3D11_TEXTURE2D_DESC d; ((ID3D11Texture2D *)r)->GetDesc(&d); i.w = d.Width; i.h = d.Height; i.rt = (d.BindFlags & D3D11_BIND_RENDER_TARGET) && (d.BindFlags & D3D11_BIND_SHADER_RESOURCE); }
 return i;
}
// Quads of one draw; vtx(i) = pointer to vertex i (already through the index buffer).
template <class F> static bool Quads11(UINT count, F vtx, std::vector<Quad> &out) {
 bool strip = Ctx.topo == D3D11_PRIMITIVE_TOPOLOGY_TRIANGLESTRIP && count == 4; // one quad drawn as a strip
 if (!strip && (Ctx.topo != D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST || count % 6 || !count)) return false;
 Layout11 L; auto lt = Layouts11.find(Ctx.layout);
 if (lt != Layouts11.end()) L = lt->second; else if (Ctx.vbStride >= 16) { L.pos = 0; L.posFmt = DXGI_FORMAT_R32G32_FLOAT; L.uv = (int)Ctx.vbStride - 8; L.uvFmt = DXGI_FORMAT_R32G32_FLOAT; }
 if (L.pos < 0 || L.uv < 0) return false; std::vector<float> c(count * 4); bool ndc = true;
 for (UINT i = 0; i < count; i++) { const unsigned char *p = vtx(i); if (!p) return false; if (!Float2(p + L.pos, L.posFmt, c[i * 4], c[i * 4 + 1]) || !Float2(p + L.uv, L.uvFmt, c[i * 4 + 2], c[i * 4 + 3])) return false; if (std::fabs(c[i * 4]) > 1.01f || std::fabs(c[i * 4 + 1]) > 1.01f) ndc = false; }
 for (UINT q = 0; q < count; q += strip ? 4 : 6) {
  Quad x; x.x0 = x.y0 = x.u0 = x.v0 = 1e30f; x.x1 = x.y1 = x.u1 = x.v1 = -1e30f; x.first = strip ? 0 : q / 6;
 for (UINT i = q; i < q + (strip ? 4 : 6); i++) { float px = c[i * 4], py = c[i * 4 + 1]; if (ndc) { px = Ctx.vp.TopLeftX + (px + 1) * 0.5f * Ctx.vp.Width; py = Ctx.vp.TopLeftY + (1 - py) * 0.5f * Ctx.vp.Height; }
   x.x0 = (std::min)(x.x0, px); x.y0 = (std::min)(x.y0, py); x.x1 = (std::max)(x.x1, px); x.y1 = (std::max)(x.y1, py); x.u0 = (std::min)(x.u0, c[i * 4 + 2]); x.v0 = (std::min)(x.v0, c[i * 4 + 3]); x.u1 = (std::max)(x.u1, c[i * 4 + 2]); x.v1 = (std::max)(x.v1, c[i * 4 + 3]); }
  out.push_back(x); }
 return true;
}
static std::vector<int> Decide11(std::vector<Quad> &q, const char *kind, UINT count) {
 TexInfo ti = Tex11(Ctx.tex0); TexInfo rt = Tex11(Ctx.rt); bool back = Ctx.rt == BackRes11 || !rt.rt;
 if (Diag) { int g = 0; for (auto &x : q) if (GlyphLike(x, ti.w, ti.h)) g++; if (Frame % 300 == 0 || (g && Frame % 10 == 0)) { char b[900]; int n = _snprintf_s(b, sizeof b, _TRUNCATE, "F%u %s rt=%p(%ux%u%s) tex=%p(%ux%u%s) n=%u q=%u g=%d", Frame, kind, Ctx.rt, rt.w, rt.h, back ? " back" : "", Ctx.tex0, ti.w, ti.h, ti.rt ? " rt" : "", count, (unsigned)q.size(), g); for (size_t i = 0; i < q.size() && i < 6 && n < 700; i++) n += _snprintf_s(b + n, sizeof b - n, _TRUNCATE, " [%.0f,%.0f %.0fx%.0f uv %.3f,%.3f %.3fx%.3f]", q[i].x0, q[i].y0, q[i].x1 - q[i].x0, q[i].y1 - q[i].y0, q[i].u0, q[i].v0, q[i].u1 - q[i].u0, q[i].v1 - q[i].v0); Log("%s", b); } }
 std::vector<int> drop; if (!Ctx.tex0 || !ti.w) return drop;
 if (back && ti.rt) { LearnComposite(Ctx.tex0, q); return drop; }
 if (!back && Ctx.rt) Textures[Ctx.rt] = rt;
 TraceDraw(Ctx.tex0, ti.w, ti.h, back ? NULL : Ctx.rt, rt.w, rt.h, q);
 Learner.texRt = ti.rt;
 return LearnDraw(Ctx.tex0, ti.w, ti.h, back ? NULL : Ctx.rt, rt.w, rt.h, BackW11, BackH11, q, GetTickCount());
}

// The pipeline state of a draw, through the context's own getters (works for state set before the DLL arrived).
static void Snapshot(ID3D11DeviceContext *c) {
 Ctx11 x = {}; ID3D11InputLayout *l = NULL; c->IAGetInputLayout(&l); if (l) { x.layout = l; l->Release(); }
 ID3D11Buffer *vb = NULL; c->IAGetVertexBuffers(0, 1, &vb, &x.vbStride, &x.vbOff); if (vb) { x.vb = vb; vb->Release(); }
 ID3D11Buffer *ib = NULL; c->IAGetIndexBuffer(&ib, &x.ibFmt, &x.ibOff); if (ib) { x.ib = ib; ib->Release(); }
 c->IAGetPrimitiveTopology(&x.topo);
 ID3D11ShaderResourceView *srv = NULL; c->PSGetShaderResources(0, 1, &srv);
 if (srv) { void *res = NULL; ID3D11Resource *r = NULL; srv->GetResource(&r); /* never cached by view pointer: freed views' addresses are reused */ if (r) { res = r; TexInfo ti = Tex11(r); r->Release(); Guard g; Textures[res] = ti; if (Textures.size() > 8192) Textures.clear(); } x.tex0 = res; srv->Release(); }
 ID3D11RenderTargetView *rtv = NULL; c->OMGetRenderTargets(1, &rtv, NULL); if (rtv) { ID3D11Resource *r = NULL; rtv->GetResource(&r); if (r) { x.rt = r; TexInfo ti = Tex11(r); r->Release(); Guard g; Textures[x.rt] = ti; } rtv->Release(); }
 UINT n = 1; c->RSGetViewports(&n, &x.vp); if (!n) { x.vp.Width = (float)BackW11; x.vp.Height = (float)BackH11; }
 Guard g; Ctx = x;
}
typedef void(STDMETHODCALLTYPE *Draw11F)(ID3D11DeviceContext *, UINT, UINT);
typedef void(STDMETHODCALLTYPE *DrawIdx11F)(ID3D11DeviceContext *, UINT, UINT, INT);
static void STDMETHODCALLTYPE HDraw11(ID3D11DeviceContext *c, UINT count, UINT start) {
 Draw11F o = (Draw11F)CurOrig; std::vector<int> drop; std::vector<Quad> q;
 Snapshot(c); { Guard g; auto vb = Buffers.find(Ctx.vb); bool ok = false;
  if (vb != Buffers.end() && Ctx.vbStride) { const Shadow &s = vb->second; ok = Quads11(count, [&](UINT i) -> const unsigned char * { size_t at = Ctx.vbOff + (size_t)(start + i) * Ctx.vbStride; return at + Ctx.vbStride <= s.data.size() ? &s.data[at] : NULL; }, q); }
  if (ok) drop = Decide11(q, "D11", count); else if (Diag && Frame % 300 == 0) Log("F%u D11 undecoded n=%u layout=%p%s topo=%d vb=%p stride=%u shadow=%d", Frame, count, Ctx.layout, Layouts11.count(Ctx.layout) ? "" : "(guess)", (int)Ctx.topo, Ctx.vb, Ctx.vbStride, (int)Buffers.count(Ctx.vb)); }
 if (drop.empty()) { o(c, count, start); return; }
 if (count == 4) return; // the strip's only quad is the dropped one
 size_t k = 0; UINT qn = (UINT)q.size(), i = 0;
 while (i < qn) { if (k < drop.size() && (UINT)drop[k] == i) { k++; i++; continue; } UINT j = i; while (j < qn && !(k < drop.size() && (UINT)drop[k] == j)) j++; o(c, (j - i) * 6, start + i * 6); i = j; }
}
static void STDMETHODCALLTYPE HDrawIndexed11(ID3D11DeviceContext *c, UINT count, UINT startIdx, INT base) {
 DrawIdx11F o = (DrawIdx11F)CurOrig; std::vector<int> drop; std::vector<Quad> q;
 Snapshot(c); { Guard g; auto vb = Buffers.find(Ctx.vb), ib = Buffers.find(Ctx.ib); bool ok = false;
  if (vb != Buffers.end() && ib != Buffers.end() && Ctx.vbStride) { const Shadow &s = vb->second, &x = ib->second; bool i32 = Ctx.ibFmt == DXGI_FORMAT_R32_UINT; unsigned isz = i32 ? 4 : 2;
   ok = Quads11(count, [&](UINT i) -> const unsigned char * { size_t ia = Ctx.ibOff + (size_t)(startIdx + i) * isz; if (ia + isz > x.data.size()) return NULL; UINT idx = i32 ? *(const UINT *)&x.data[ia] : *(const USHORT *)&x.data[ia]; size_t at = Ctx.vbOff + ((size_t)base + idx) * Ctx.vbStride; return at + Ctx.vbStride <= s.data.size() ? &s.data[at] : NULL; }, q); }
  if (ok) drop = Decide11(q, "DI11", count); else if (Diag && Frame % 300 == 0) Log("F%u DI11 undecoded n=%u layout=%p topo=%d", Frame, count, Ctx.layout, (int)Ctx.topo); }
 if (drop.empty()) { o(c, count, startIdx, base); return; }
 if (count == 4) return;
 size_t k = 0; UINT qn = (UINT)q.size(), i = 0;
 while (i < qn) { if (k < drop.size() && (UINT)drop[k] == i) { k++; i++; continue; } UINT j = i; while (j < qn && !(k < drop.size() && (UINT)drop[k] == j)) j++; o(c, (j - i) * 6, startIdx + i * 6, base); i = j; }
}
static HRESULT STDMETHODCALLTYPE HMap11(ID3D11DeviceContext *c, ID3D11Resource *r, UINT sub, D3D11_MAP t, UINT f, D3D11_MAPPED_SUBRESOURCE *m) {
 auto o = (HRESULT(STDMETHODCALLTYPE *)(ID3D11DeviceContext *, ID3D11Resource *, UINT, D3D11_MAP, UINT, D3D11_MAPPED_SUBRESOURCE *))CurOrig; HRESULT hr = o(c, r, sub, t, f, m);
 if (SUCCEEDED(hr) && m && m->pData && r && t != D3D11_MAP_READ) { D3D11_RESOURCE_DIMENSION dim; r->GetType(&dim); if (dim == D3D11_RESOURCE_DIMENSION_BUFFER) { D3D11_BUFFER_DESC d; ((ID3D11Buffer *)r)->GetDesc(&d); if ((d.BindFlags & (D3D11_BIND_VERTEX_BUFFER | D3D11_BIND_INDEX_BUFFER)) && d.ByteWidth <= 8u << 20) { Guard g; for (auto &x : Maps11) if (x.res == r) { x = MapRec{ r, m->pData, d.ByteWidth }; return hr; } if (Maps11.size() < 64) Maps11.push_back(MapRec{ r, m->pData, d.ByteWidth }); } } }
 return hr;
}
static void STDMETHODCALLTYPE HUnmap11(ID3D11DeviceContext *c, ID3D11Resource *r, UINT sub) {
 auto o = (void(STDMETHODCALLTYPE *)(ID3D11DeviceContext *, ID3D11Resource *, UINT))CurOrig;
 { Guard g; for (size_t i = 0; i < Maps11.size(); i++) if (Maps11[i].res == r) { MapRec m = Maps11[i]; Maps11.erase(Maps11.begin() + i); Shadow &s = Buffers[r]; if (s.data.size() != m.size) s.data.assign(m.size, 0); if (!SafeCopy(s.data.data(), m.ptr, m.size)) Buffers.erase(r); if (Buffers.size() > 4096) Buffers.clear(); break; } }
 o(c, r, sub);
}
static void STDMETHODCALLTYPE HUpdateSub11(ID3D11DeviceContext *c, ID3D11Resource *r, UINT sub, const D3D11_BOX *box, const void *src, UINT rp, UINT dp) {
 auto o = (void(STDMETHODCALLTYPE *)(ID3D11DeviceContext *, ID3D11Resource *, UINT, const D3D11_BOX *, const void *, UINT, UINT))CurOrig; o(c, r, sub, box, src, rp, dp);
 if (!r || !src) return; D3D11_RESOURCE_DIMENSION dim; r->GetType(&dim);
 if (dim == D3D11_RESOURCE_DIMENSION_TEXTURE2D && sub == 0) { bool wait; { Guard g; wait = Trace.Waiting(); } if (!wait) return; D3D11_TEXTURE2D_DESC td; ((ID3D11Texture2D *)r)->GetDesc(&td);
  int fmt = td.Format == DXGI_FORMAT_R8G8B8A8_UNORM || td.Format == DXGI_FORMAT_B8G8R8A8_UNORM ? 21 : td.Format == DXGI_FORMAT_B8G8R8X8_UNORM ? 22 : td.Format == DXGI_FORMAT_A8_UNORM || td.Format == DXGI_FORMAT_R8_UNORM ? 28 : -1; if (fmt < 0) return;
  int x = box ? (int)box->left : 0, y = box ? (int)box->top : 0, w = box ? (int)(box->right - box->left) : (int)td.Width, h = box ? (int)(box->bottom - box->top) : (int)td.Height; if (w <= 0 || h <= 0) return;
  auto read = [&](int tx, int ty) -> int { int lx = tx - x, ly = ty - y; if (lx < 0 || ly < 0 || lx >= w || ly >= h) return -1; return GtTexel((const unsigned char *)src + (size_t)ly * rp, lx, fmt); };
  Guard g; Trace.Write(r, x, y, w, h, !box, read, GetTickCount()); return; }
 if (dim != D3D11_RESOURCE_DIMENSION_BUFFER) return; D3D11_BUFFER_DESC d; ((ID3D11Buffer *)r)->GetDesc(&d);
 if (!(d.BindFlags & (D3D11_BIND_VERTEX_BUFFER | D3D11_BIND_INDEX_BUFFER)) || d.ByteWidth > 8u << 20) return; UINT a = box ? box->left : 0, e = box ? box->right : d.ByteWidth; if (e > d.ByteWidth || a >= e) return;
 Guard g; Shadow &s = Buffers[r]; if (s.data.size() != d.ByteWidth) s.data.assign(d.ByteWidth, 0); if (!SafeCopy(&s.data[a], src, e - a)) Buffers.erase(r);
}
static void STDMETHODCALLTYPE HCopyRegion11(ID3D11DeviceContext *c, ID3D11Resource *dst, UINT ds, UINT dx, UINT dy, UINT dz, ID3D11Resource *src, UINT ss, const D3D11_BOX *box) {
 auto o = (void(STDMETHODCALLTYPE *)(ID3D11DeviceContext *, ID3D11Resource *, UINT, UINT, UINT, UINT, ID3D11Resource *, UINT, const D3D11_BOX *))CurOrig; o(c, dst, ds, dx, dy, dz, src, ss, box);
 if (!dst || !src || ds || ss) return; Guard g; if (!Trace.Known(src)) return; Trace.Copy(src, dst, box ? (int)box->left : 0, box ? (int)box->top : 0, box ? (int)(box->right - box->left) : 1 << 15, box ? (int)(box->bottom - box->top) : 1 << 15, (int)dx, (int)dy);
}
static HRESULT STDMETHODCALLTYPE HCreateInputLayout(ID3D11Device *dev, const D3D11_INPUT_ELEMENT_DESC *e, UINT n, const void *bc, SIZE_T len, ID3D11InputLayout **out) {
 auto o = (HRESULT(STDMETHODCALLTYPE *)(ID3D11Device *, const D3D11_INPUT_ELEMENT_DESC *, UINT, const void *, SIZE_T, ID3D11InputLayout **))CurOrig; HRESULT hr = o(dev, e, n, bc, len, out);
 if (SUCCEEDED(hr) && out && *out && e) { Layout11 L; UINT at = 0;
  for (UINT i = 0; i < n; i++) { UINT off = e[i].AlignedByteOffset == D3D11_APPEND_ALIGNED_ELEMENT ? at : e[i].AlignedByteOffset; UINT sz = e[i].Format == DXGI_FORMAT_R32G32_FLOAT ? 8 : e[i].Format == DXGI_FORMAT_R32G32B32_FLOAT ? 12 : e[i].Format == DXGI_FORMAT_R32G32B32A32_FLOAT ? 16 : 4; if (e[i].InputSlot == 0) at = off + sz; if (e[i].InputSlot != 0) continue;
   if ((!_stricmp(e[i].SemanticName, "POSITION") || !_stricmp(e[i].SemanticName, "SV_Position")) && e[i].SemanticIndex == 0) { L.pos = (int)off; L.posFmt = e[i].Format; }
   if (!_stricmp(e[i].SemanticName, "TEXCOORD") && e[i].SemanticIndex == 0) { L.uv = (int)off; L.uvFmt = e[i].Format; } }
  Guard g; Layouts11[*out] = L; }
 return hr;
}
static HRESULT STDMETHODCALLTYPE HPresent11(IDXGISwapChain *sc, UINT sync, UINT flags) {
 auto o = (HRESULT(STDMETHODCALLTYPE *)(IDXGISwapChain *, UINT, UINT))CurOrig;
 FpsCap();
 DXGI_SWAP_CHAIN_DESC d; if (SUCCEEDED(sc->GetDesc(&d))) { ID3D11Texture2D *bb = NULL; void *res = NULL; if (SUCCEEDED(sc->GetBuffer(0, __uuidof(ID3D11Texture2D), (void **)&bb)) && bb) { res = bb; bb->Release(); }
  Guard g; BackW11 = d.BufferDesc.Width; BackH11 = d.BufferDesc.Height; BackRes11 = res; Frame++; LastPresent = GetTickCount(); FramesTick(LastPresent, BackW11, BackH11); }
 return o(sc, sync, flags);
}
static int Install11(HMODULE d3d11) {
 typedef HRESULT(WINAPI *CreateF)(IDXGIAdapter *, D3D_DRIVER_TYPE, HMODULE, UINT, const D3D_FEATURE_LEVEL *, UINT, UINT, const DXGI_SWAP_CHAIN_DESC *, IDXGISwapChain **, ID3D11Device **, D3D_FEATURE_LEVEL *, ID3D11DeviceContext **);
 CreateF create = (CreateF)GetProcAddress(d3d11, "D3D11CreateDeviceAndSwapChain"); if (!create) return 0;
 WNDCLASSW wc = {}; wc.lpfnWndProc = DummyProc; wc.hInstance = GetModuleHandleW(NULL); wc.lpszClassName = L"MeguLitGpuDummy11"; RegisterClassW(&wc);
 HWND w = CreateWindowExW(WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE, wc.lpszClassName, L"", WS_POPUP, -32000, -32000, 8, 8, NULL, NULL, wc.hInstance, NULL); if (!w) return 0;
 DXGI_SWAP_CHAIN_DESC sd = {}; sd.BufferCount = 1; sd.BufferDesc.Width = 8; sd.BufferDesc.Height = 8; sd.BufferDesc.Format = DXGI_FORMAT_R8G8B8A8_UNORM; sd.BufferUsage = DXGI_USAGE_RENDER_TARGET_OUTPUT; sd.OutputWindow = w; sd.SampleDesc.Count = 1; sd.Windowed = TRUE; sd.SwapEffect = DXGI_SWAP_EFFECT_DISCARD;
 int made = 0;
 for (D3D_DRIVER_TYPE dt : { D3D_DRIVER_TYPE_HARDWARE, D3D_DRIVER_TYPE_WARP }) {
  IDXGISwapChain *sc = NULL; ID3D11Device *dev = NULL; ID3D11DeviceContext *ctx = NULL;
  if (FAILED(create(NULL, dt, NULL, 0, NULL, 0, D3D11_SDK_VERSION, &sd, &sc, &dev, NULL, &ctx)) || !sc || !dev || !ctx) continue;
  made++; void **cv = *(void ***)ctx, **dv = *(void ***)dev, **sv = *(void ***)sc;
  Hook<412>(cv[12], HDrawIndexed11); Hook<413>(cv[13], HDraw11); Hook<414>(cv[14], HMap11); Hook<415>(cv[15], HUnmap11); Hook<448>(cv[48], HUpdateSub11); Hook<446>(cv[46], HCopyRegion11); Hook<511>(dv[11], HCreateInputLayout); Hook<608>(sv[8], HPresent11);
  ctx->Release(); dev->Release(); sc->Release();
 }
 DestroyWindow(w); UnregisterClassW(wc.lpszClassName, wc.hInstance); return Apply() ? made : 0;
}
