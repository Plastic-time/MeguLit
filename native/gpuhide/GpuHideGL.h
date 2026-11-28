// SPDX-License-Identifier: GPL-3.0-or-later
// OpenGL side of hide layer 4 (included by GpuHide.cpp; same learner, same rules).
// opengl32.dll's glDrawArrays / glDrawElements and gdi32's SwapBuffers are hooked in place. Buffer functions come from the
// driver (wglGetProcAddress), so they are resolved and hooked inside the game's render thread on its first draw:
// glBufferData / glBufferSubData / glMapBuffer(Range) / glUnmapBuffer feed read-only shadows of vertex and index buffers.
// The state of each draw is read with GL's own getters: the current program's attributes (position: the attribute whose
// name contains "pos", texture coordinate: "tex" / "uv" / "coord"), or the fixed-function vertex / texture-coordinate
// arrays; the bound 2D texture of unit 0 and its size; the bound framebuffer; the viewport. Positions that all lie in
// [-1, 1] are normalised device coordinates (y up, through the viewport), others pixels; the fixed-function path goes
// through the projection x modelview matrices. A left-out glyph is the same draw re-issued for the other quads.
#include <gl/GL.h>
#ifndef GL_ARRAY_BUFFER
#define GL_ARRAY_BUFFER 0x8892
#define GL_ELEMENT_ARRAY_BUFFER 0x8893
#define GL_ARRAY_BUFFER_BINDING 0x8894
#define GL_ELEMENT_ARRAY_BUFFER_BINDING 0x8895
#define GL_BUFFER_SIZE 0x8764
#define GL_CURRENT_PROGRAM 0x8B8D
#define GL_ACTIVE_ATTRIBUTES 0x8B89
#define GL_VERTEX_ATTRIB_ARRAY_ENABLED 0x8622
#define GL_VERTEX_ATTRIB_ARRAY_SIZE 0x8623
#define GL_VERTEX_ATTRIB_ARRAY_STRIDE 0x8624
#define GL_VERTEX_ATTRIB_ARRAY_TYPE 0x8625
#define GL_VERTEX_ATTRIB_ARRAY_BUFFER_BINDING 0x889F
#define GL_VERTEX_ATTRIB_ARRAY_POINTER 0x8645
#define GL_FRAMEBUFFER_BINDING 0x8CA6
#define GL_ACTIVE_TEXTURE 0x84E0
#define GL_TEXTURE0 0x84C0
#define GL_VERTEX_ARRAY_BUFFER_BINDING 0x8896
#define GL_TEXTURE_COORD_ARRAY_BUFFER_BINDING 0x889A
#define GL_CLIENT_ACTIVE_TEXTURE 0x84E1
#endif
// GL 1.1 entry points from the game's own opengl32.dll (never imported: a Direct3D game must not load OpenGL).
static void(WINAPI *pglGetIntegerv)(GLenum, GLint *); static GLboolean(WINAPI *pglIsEnabled)(GLenum); static void(WINAPI *pglGetPointerv)(GLenum, void **);
static void(WINAPI *pglGetFloatv)(GLenum, GLfloat *); static void(WINAPI *pglGetTexLevelParameteriv)(GLenum, GLint, GLenum, GLint *);
#define glGetIntegerv pglGetIntegerv
#define glIsEnabled pglIsEnabled
#define glGetPointerv pglGetPointerv
#define glGetFloatv pglGetFloatv
#define glGetTexLevelParameteriv pglGetTexLevelParameteriv
typedef ptrdiff_t GLsizeiptrX; typedef ptrdiff_t GLintptrX; typedef char GLcharX;
typedef void(WINAPI *PFBufferData)(GLenum, GLsizeiptrX, const void *, GLenum);
typedef void(WINAPI *PFBufferSubData)(GLenum, GLintptrX, GLsizeiptrX, const void *);
typedef void *(WINAPI *PFMapBuffer)(GLenum, GLenum);
typedef void *(WINAPI *PFMapBufferRange)(GLenum, GLintptrX, GLsizeiptrX, GLuint);
typedef GLboolean(WINAPI *PFUnmapBuffer)(GLenum);
typedef void(WINAPI *PFGetActiveAttrib)(GLuint, GLuint, GLsizei, GLsizei *, GLint *, GLenum *, GLcharX *);
typedef GLint(WINAPI *PFGetAttribLocation)(GLuint, const GLcharX *);
typedef void(WINAPI *PFGetProgramiv)(GLuint, GLenum, GLint *);
typedef void(WINAPI *PFGetVertexAttribiv)(GLuint, GLenum, GLint *);
typedef void(WINAPI *PFGetVertexAttribPointerv)(GLuint, GLenum, void **);
typedef void(WINAPI *PFGetBufferParameteriv)(GLenum, GLenum, GLint *);
static PFGetActiveAttrib GlGetActiveAttrib; static PFGetAttribLocation GlGetAttribLocation; static PFGetProgramiv GlGetProgramiv;
static PFGetVertexAttribiv GlGetVertexAttribiv; static PFGetVertexAttribPointerv GlGetVertexAttribPointerv; static PFGetBufferParameteriv GlGetBufferParameteriv;
static volatile LONG GlResolved; static unsigned GlBackW, GlBackH;
struct GlProg { int pos = -1, uv = -1; };
static std::map<GLuint, GlProg> GlProgs;
struct GlMap { GLuint buf; void *ptr; size_t off, len; };
static std::vector<GlMap> GlMaps;
static void *GlKey(GLuint b) { return (void *)(size_t)(0x47000000u | b); } // buffer id -> shadow key (never collides with D3D pointers in practice)

static GLuint GlBound(GLenum target) { GLint b = 0; glGetIntegerv(target == GL_ELEMENT_ARRAY_BUFFER ? GL_ELEMENT_ARRAY_BUFFER_BINDING : GL_ARRAY_BUFFER_BINDING, &b); return (GLuint)b; }
static void GlShadow(GLuint buf, size_t off, const void *src, size_t len, size_t total) {
 if (!buf || !src || total > (8u << 20) || off + len > total) return; Guard g; Shadow &s = Buffers[GlKey(buf)]; if (s.data.size() != total) s.data.assign(total, 0); if (!SafeCopy(&s.data[off], src, len)) Buffers.erase(GlKey(buf)); if (Buffers.size() > 4096) Buffers.clear();
}
static void WINAPI HBufferData(GLenum t, GLsizeiptrX n, const void *d, GLenum u) { auto o = (PFBufferData)CurOrig; o(t, n, d, u); if (t == GL_ARRAY_BUFFER || t == GL_ELEMENT_ARRAY_BUFFER) { GLuint b = GlBound(t); if (d) GlShadow(b, 0, d, (size_t)n, (size_t)n); else { Guard g; Buffers[GlKey(b)].data.assign((size_t)n <= (8u << 20) ? (size_t)n : 0, 0); } } }
static void WINAPI HBufferSubData(GLenum t, GLintptrX off, GLsizeiptrX n, const void *d) { auto o = (PFBufferSubData)CurOrig; o(t, off, n, d); if (t == GL_ARRAY_BUFFER || t == GL_ELEMENT_ARRAY_BUFFER) { GLuint b = GlBound(t); size_t total = 0; { Guard g; auto it = Buffers.find(GlKey(b)); if (it != Buffers.end()) total = it->second.data.size(); } if (total) GlShadow(b, (size_t)off, d, (size_t)n, total); } }
static void *WINAPI HMapBuffer(GLenum t, GLenum a) { auto o = (PFMapBuffer)CurOrig; void *p = o(t, a); if (p && (t == GL_ARRAY_BUFFER || t == GL_ELEMENT_ARRAY_BUFFER) && GlGetBufferParameteriv) { GLint sz = 0; GlGetBufferParameteriv(t, GL_BUFFER_SIZE, &sz); Guard g; if (GlMaps.size() < 64) GlMaps.push_back(GlMap{ GlBound(t), p, 0, (size_t)sz }); } return p; }
static void *WINAPI HMapBufferRange(GLenum t, GLintptrX off, GLsizeiptrX n, GLuint a) { auto o = (PFMapBufferRange)CurOrig; void *p = o(t, off, n, a); if (p && (t == GL_ARRAY_BUFFER || t == GL_ELEMENT_ARRAY_BUFFER) && (a & 0x0002 /* WRITE */)) { Guard g; if (GlMaps.size() < 64) GlMaps.push_back(GlMap{ GlBound(t), p, (size_t)off, (size_t)n }); } return p; }
static GLboolean WINAPI HUnmapBuffer(GLenum t) {
 auto o = (PFUnmapBuffer)CurOrig; GLuint b = GlBound(t); GlMap m = {}; bool have = false; size_t total = 0;
 { Guard g; for (size_t i = 0; i < GlMaps.size(); i++) if (GlMaps[i].buf == b) { m = GlMaps[i]; GlMaps.erase(GlMaps.begin() + i); have = true; break; } }
 if (have && GlGetBufferParameteriv) { GLint sz = 0; GlGetBufferParameteriv(t, GL_BUFFER_SIZE, &sz); total = (size_t)sz; GlShadow(b, m.off, m.ptr, m.len, total); }
 return o(t);
}
// Resolved in the render thread (a context is current): the driver functions the game uses.
static void GlResolve() {
 if (InterlockedExchange(&GlResolved, 1)) return;
 HMODULE gl = GetModuleHandleW(L"opengl32.dll"); typedef PROC(WINAPI *WGP)(LPCSTR); WGP wgp = gl ? (WGP)GetProcAddress(gl, "wglGetProcAddress") : NULL; if (!wgp) return;
 auto get = [&](const char *a, const char *b) -> void * { void *p = (void *)wgp(a); if (!p && b) p = (void *)wgp(b); return (size_t)p > 3 && (intptr_t)p != -1 ? p : NULL; };
 GlGetActiveAttrib = (PFGetActiveAttrib)get("glGetActiveAttrib", "glGetActiveAttribARB"); GlGetAttribLocation = (PFGetAttribLocation)get("glGetAttribLocation", "glGetAttribLocationARB");
 GlGetProgramiv = (PFGetProgramiv)get("glGetProgramiv", NULL); GlGetVertexAttribiv = (PFGetVertexAttribiv)get("glGetVertexAttribiv", "glGetVertexAttribivARB");
 GlGetVertexAttribPointerv = (PFGetVertexAttribPointerv)get("glGetVertexAttribPointerv", "glGetVertexAttribPointervARB"); GlGetBufferParameteriv = (PFGetBufferParameteriv)get("glGetBufferParameteriv", "glGetBufferParameterivARB");
 Hook<801>(get("glBufferData", NULL), HBufferData); Hook<801>(get("glBufferDataARB", NULL), HBufferData);
 Hook<802>(get("glBufferSubData", NULL), HBufferSubData); Hook<802>(get("glBufferSubDataARB", NULL), HBufferSubData);
 Hook<803>(get("glMapBuffer", NULL), HMapBuffer); Hook<803>(get("glMapBufferARB", NULL), HMapBuffer); Hook<804>(get("glMapBufferRange", NULL), HMapBufferRange);
 Hook<805>(get("glUnmapBuffer", NULL), HUnmapBuffer); Hook<805>(get("glUnmapBufferARB", NULL), HUnmapBuffer);
 Apply();
 Log("gl resolved: program api=%d buffers hooked=%d", GlGetActiveAttrib != NULL, (int)Hooked[801].size() + (int)Hooked[802].size() + (int)Hooked[805].size());
}
static GlProg ProgOf(GLuint p) {
 { Guard g; auto it = GlProgs.find(p); if (it != GlProgs.end()) return it->second; }
 GlProg r; if (!GlGetActiveAttrib || !GlGetProgramiv || !GlGetAttribLocation) return r; GLint n = 0; GlGetProgramiv(p, GL_ACTIVE_ATTRIBUTES, &n);
 for (GLint i = 0; i < n && i < 32; i++) { char name[128] = {}; GLsizei len = 0; GLint size = 0; GLenum type = 0; GlGetActiveAttrib(p, (GLuint)i, sizeof name - 1, &len, &size, &type, name); std::string s(name); for (auto &c : s) c = (char)tolower((unsigned char)c);
  GLint loc = GlGetAttribLocation(p, name); if (loc < 0) continue; bool f2 = type == 0x8B50 /* VEC2 */ || type == 0x8B51 || type == 0x8B52;
  if (r.pos < 0 && f2 && s.find("pos") != std::string::npos) r.pos = loc; else if (r.uv < 0 && type == 0x8B50 && (s.find("tex") != std::string::npos || s.find("uv") != std::string::npos || s.find("coord") != std::string::npos)) r.uv = loc; }
 Guard g; GlProgs[p] = r; return r;
}
struct GlAttr { const unsigned char *base; size_t avail; unsigned stride, size; };
static bool GlAttrib(GLuint idx, GlAttr &a) {
 GLint en = 0, sz = 0, ty = 0, st = 0, buf = 0; void *ptr = NULL; GlGetVertexAttribiv(idx, GL_VERTEX_ATTRIB_ARRAY_ENABLED, &en); if (!en) return false;
 GlGetVertexAttribiv(idx, GL_VERTEX_ATTRIB_ARRAY_SIZE, &sz); GlGetVertexAttribiv(idx, GL_VERTEX_ATTRIB_ARRAY_TYPE, &ty); GlGetVertexAttribiv(idx, GL_VERTEX_ATTRIB_ARRAY_STRIDE, &st); GlGetVertexAttribiv(idx, GL_VERTEX_ATTRIB_ARRAY_BUFFER_BINDING, &buf); GlGetVertexAttribPointerv(idx, GL_VERTEX_ATTRIB_ARRAY_POINTER, &ptr);
 if (ty != GL_FLOAT || sz < 2) return false; a.size = (unsigned)sz; a.stride = st ? (unsigned)st : (unsigned)sz * 4;
 if (buf) { auto it = Buffers.find(GlKey((GLuint)buf)); if (it == Buffers.end()) return false; size_t off = (size_t)ptr; if (off >= it->second.data.size()) return false; a.base = &it->second.data[off]; a.avail = it->second.data.size() - off; }
 else { if (!ptr) return false; a.base = (const unsigned char *)ptr; a.avail = (size_t)-1; }
 return true;
}
static bool GlFixed(GLenum arr, GLenum sizeQ, GLenum typeQ, GLenum strideQ, GLenum ptrQ, GLenum bufQ, GlAttr &a) {
 if (!glIsEnabled(arr)) return false; GLint sz = 0, ty = 0, st = 0, buf = 0; void *ptr = NULL; glGetIntegerv(sizeQ, &sz); glGetIntegerv(typeQ, &ty); glGetIntegerv(strideQ, &st); glGetIntegerv(bufQ, &buf); glGetPointerv(ptrQ, &ptr);
 if (ty != GL_FLOAT || sz < 2) return false; a.size = (unsigned)sz; a.stride = st ? (unsigned)st : (unsigned)sz * 4;
 if (buf) { auto it = Buffers.find(GlKey((GLuint)buf)); if (it == Buffers.end()) return false; size_t off = (size_t)ptr; if (off >= it->second.data.size()) return false; a.base = &it->second.data[off]; a.avail = it->second.data.size() - off; }
 else { if (!ptr) return false; a.base = (const unsigned char *)ptr; a.avail = (size_t)-1; }
 return true;
}
// Quads of one draw (vertex i through idx(i)); out-of-range or unknown layout = not decoded.
template <class F> static bool QuadsGL(GLenum mode, GLsizei count, F idx, std::vector<Quad> &out, void *&tex, unsigned &tw, unsigned &th, void *&rt, unsigned &rw, unsigned &rh) {
 unsigned per = mode == GL_TRIANGLES ? 6 : mode == GL_QUADS ? 4 : (mode == GL_TRIANGLE_STRIP || mode == GL_TRIANGLE_FAN) && count == 4 ? 4 : 0; if (!per || count <= 0 || count % per) return false;
 GLint prog = 0; glGetIntegerv(GL_CURRENT_PROGRAM, &prog); GlAttr P = {}, U = {}; bool fixed = prog == 0;
 { Guard g;
  if (!fixed) { if (!GlGetVertexAttribiv || !GlGetVertexAttribPointerv) return false; GlProg pr = ProgOf((GLuint)prog); if (pr.pos < 0 || pr.uv < 0 || !GlAttrib((GLuint)pr.pos, P) || !GlAttrib((GLuint)pr.uv, U)) return false; }
  else { if (!GlFixed(GL_VERTEX_ARRAY, GL_VERTEX_ARRAY_SIZE, GL_VERTEX_ARRAY_TYPE, GL_VERTEX_ARRAY_STRIDE, GL_VERTEX_ARRAY_POINTER, GL_VERTEX_ARRAY_BUFFER_BINDING, P) || !GlFixed(GL_TEXTURE_COORD_ARRAY, GL_TEXTURE_COORD_ARRAY_SIZE, GL_TEXTURE_COORD_ARRAY_TYPE, GL_TEXTURE_COORD_ARRAY_STRIDE, GL_TEXTURE_COORD_ARRAY_POINTER, GL_TEXTURE_COORD_ARRAY_BUFFER_BINDING, U)) return false; }
 }
 GLint vp[4] = {}; glGetIntegerv(GL_VIEWPORT, vp); GLint fbo = 0; glGetIntegerv(GL_FRAMEBUFFER_BINDING, &fbo);
 GLint t = 0; glGetIntegerv(GL_TEXTURE_BINDING_2D, &t); GLint w = 0, h = 0; if (t) { glGetTexLevelParameteriv(GL_TEXTURE_2D, 0, GL_TEXTURE_WIDTH, &w); glGetTexLevelParameteriv(GL_TEXTURE_2D, 0, GL_TEXTURE_HEIGHT, &h); }
 tex = t ? (void *)(size_t)(0x54000000u | (GLuint)t) : NULL; tw = (unsigned)w; th = (unsigned)h; rt = fbo ? (void *)(size_t)(0x46000000u | (GLuint)fbo) : NULL; rw = fbo ? (unsigned)vp[2] : GlBackW; rh = fbo ? (unsigned)vp[3] : GlBackH;
 float mvp[16]; bool haveM = false; if (fixed) { float pm[16], mv[16]; glGetFloatv(GL_PROJECTION_MATRIX, pm); glGetFloatv(GL_MODELVIEW_MATRIX, mv); for (int c = 0; c < 4; c++) for (int r = 0; r < 4; r++) { float s = 0; for (int k = 0; k < 4; k++) s += pm[k * 4 + r] * mv[c * 4 + k]; mvp[c * 4 + r] = s; } haveM = true; }
 std::vector<float> c(count * 4); bool ndc = true; Guard g;
 for (GLsizei i = 0; i < count; i++) { size_t v = idx(i); if (v == (size_t)-1) return false;
  size_t po = v * P.stride, uo = v * U.stride; if (P.avail != (size_t)-1 && po + P.size * 4 > P.avail) return false; if (U.avail != (size_t)-1 && uo + 8 > U.avail) return false;
  const float *p = (const float *)(P.base + po), *u = (const float *)(U.base + uo); float x = p[0], y = p[1];
  if (haveM) { float z = P.size > 2 ? p[2] : 0, ww = P.size > 3 ? p[3] : 1; float cx = mvp[0] * x + mvp[4] * y + mvp[8] * z + mvp[12] * ww, cy = mvp[1] * x + mvp[5] * y + mvp[9] * z + mvp[13] * ww, cw = mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15] * ww; if (cw == 0) cw = 1; x = cx / cw; y = cy / cw; }
  if (!std::isfinite(x) || !std::isfinite(y) || !std::isfinite(u[0]) || !std::isfinite(u[1])) return false; if (std::fabs(x) > 1.01f || std::fabs(y) > 1.01f) ndc = false;
  c[i * 4] = x; c[i * 4 + 1] = y; c[i * 4 + 2] = u[0]; c[i * 4 + 3] = u[1]; }
 if (haveM || ndc) { float fh = fbo ? (float)vp[3] + vp[1] : (float)GlBackH; for (GLsizei i = 0; i < count; i++) { float sx = vp[0] + (c[i * 4] + 1) * 0.5f * vp[2], sy = vp[1] + (c[i * 4 + 1] + 1) * 0.5f * vp[3]; c[i * 4] = sx; c[i * 4 + 1] = fh - sy; } }
 for (GLsizei q = 0; q < count; q += per) { Quad x; x.x0 = x.y0 = x.u0 = x.v0 = 1e30f; x.x1 = x.y1 = x.u1 = x.v1 = -1e30f; x.first = (unsigned)(q / per);
  for (GLsizei i = q; i < q + (GLsizei)per; i++) { x.x0 = (std::min)(x.x0, c[i * 4]); x.y0 = (std::min)(x.y0, c[i * 4 + 1]); x.x1 = (std::max)(x.x1, c[i * 4]); x.y1 = (std::max)(x.y1, c[i * 4 + 1]); x.u0 = (std::min)(x.u0, c[i * 4 + 2]); x.v0 = (std::min)(x.v0, c[i * 4 + 3]); x.u1 = (std::max)(x.u1, c[i * 4 + 2]); x.v1 = (std::max)(x.v1, c[i * 4 + 3]); }
  out.push_back(x); }
 return true;
}
static std::vector<int> DecideGL(std::vector<Quad> &q, void *tex, unsigned tw, unsigned th, void *rt, unsigned rw, unsigned rh, const char *kind, GLsizei count) {
 std::vector<int> drop; Guard g;
 if (Diag) { int gl = 0; for (auto &x : q) if (GlyphLike(x, tw, th)) gl++; if (Frame % 300 == 0 || (gl && Frame % 10 == 0)) Log("F%u %s rt=%p(%ux%u) tex=%p(%ux%u) n=%d q=%u g=%d [%.0f,%.0f %.0fx%.0f uv %.3f,%.3f %.3fx%.3f]", Frame, kind, rt, rw, rh, tex, tw, th, (int)count, (unsigned)q.size(), gl, q.empty() ? 0 : q[0].x0, q.empty() ? 0 : q[0].y0, q.empty() ? 0 : q[0].x1 - q[0].x0, q.empty() ? 0 : q[0].y1 - q[0].y0, q.empty() ? 0 : q[0].u0, q.empty() ? 0 : q[0].v0, q.empty() ? 0 : q[0].u1 - q[0].u0, q.empty() ? 0 : q[0].v1 - q[0].v0); }
 if (!tex || !tw) return drop;
 if (!rt) { auto it = Textures.find(tex); if (it != Textures.end() && it->second.rt) { LearnComposite(tex, q); return drop; } }
 if (rt) { TexInfo ti = { rw, rh, D3DFMT_UNKNOWN, true }; Textures[rt] = ti; }
 return LearnDraw(tex, tw, th, rt, rw, rh, GlBackW, GlBackH, q, GetTickCount());
}
typedef void(WINAPI *DrawArraysF)(GLenum, GLint, GLsizei);
typedef void(WINAPI *DrawElementsF)(GLenum, GLsizei, GLenum, const void *);
static DrawArraysF OglDrawArrays; static DrawElementsF OglDrawElements;
static void WINAPI HglDrawArrays(GLenum mode, GLint first, GLsizei count) {
 GlResolve(); std::vector<Quad> q; void *tex, *rt; unsigned tw = 0, th = 0, rw = 0, rh = 0; std::vector<int> drop;
 if (QuadsGL(mode, count, [&](GLsizei i) -> size_t { return (size_t)(first + i); }, q, tex, tw, th, rt, rw, rh)) drop = DecideGL(q, tex, tw, th, rt, rw, rh, "GLA", count);
 if (drop.empty()) { OglDrawArrays(mode, first, count); return; }
 if (count == 4 && mode != GL_QUADS) return; GLsizei per = mode == GL_QUADS ? 4 : 6; size_t k = 0; GLsizei qn = (GLsizei)q.size(), i = 0;
 while (i < qn) { if (k < drop.size() && drop[k] == i) { k++; i++; continue; } GLsizei j = i; while (j < qn && !(k < drop.size() && drop[k] == j)) j++; OglDrawArrays(mode, first + i * per, (j - i) * per); i = j; }
}
static void WINAPI HglDrawElements(GLenum mode, GLsizei count, GLenum type, const void *ind) {
 GlResolve(); std::vector<Quad> q; void *tex, *rt; unsigned tw = 0, th = 0, rw = 0, rh = 0; std::vector<int> drop; unsigned isz = type == GL_UNSIGNED_INT ? 4 : type == GL_UNSIGNED_SHORT ? 2 : type == GL_UNSIGNED_BYTE ? 1 : 0;
 if (isz) { GLint eb = 0; glGetIntegerv(GL_ELEMENT_ARRAY_BUFFER_BINDING, &eb); std::vector<unsigned char> ib;
  { Guard g; if (eb) { auto it = Buffers.find(GlKey((GLuint)eb)); size_t off = (size_t)ind; if (it != Buffers.end() && off + (size_t)count * isz <= it->second.data.size()) ib.assign(it->second.data.begin() + off, it->second.data.begin() + off + (size_t)count * isz); } }
  if (!eb && ind) { ib.resize((size_t)count * isz); if (!SafeCopy(ib.data(), ind, ib.size())) ib.clear(); }
  if (!ib.empty()) { auto at = [&](GLsizei i) -> size_t { const unsigned char *p = &ib[(size_t)i * isz]; return isz == 4 ? *(const unsigned *)p : isz == 2 ? *(const unsigned short *)p : *p; };
   if (QuadsGL(mode, count, at, q, tex, tw, th, rt, rw, rh)) drop = DecideGL(q, tex, tw, th, rt, rw, rh, "GLE", count); } }
 if (drop.empty()) { OglDrawElements(mode, count, type, ind); return; }
 if (count == 4 && mode != GL_QUADS) return; GLsizei per = mode == GL_QUADS ? 4 : 6; size_t k = 0; GLsizei qn = (GLsizei)q.size(), i = 0;
 while (i < qn) { if (k < drop.size() && drop[k] == i) { k++; i++; continue; } GLsizei j = i; while (j < qn && !(k < drop.size() && drop[k] == j)) j++; OglDrawElements(mode, (j - i) * per, type, (const unsigned char *)ind + (size_t)i * per * isz); i = j; }
}
typedef BOOL(WINAPI *SwapBuffersF)(HDC);
static SwapBuffersF OSwapBuffers;
static BOOL WINAPI HSwapBuffers(HDC dc) {
 FpsCap();
 HWND w = WindowFromDC(dc); RECT r = {}; if (w) GetClientRect(w, &r);
 { Guard g; GlBackW = r.right; GlBackH = r.bottom; Frame++; LastPresent = GetTickCount(); FramesTick(LastPresent, GlBackW, GlBackH); }
 return OSwapBuffers(dc);
}
static int InstallGL(HMODULE gl) {
 *(FARPROC *)&pglGetIntegerv = GetProcAddress(gl, "glGetIntegerv"); *(FARPROC *)&pglIsEnabled = GetProcAddress(gl, "glIsEnabled"); *(FARPROC *)&pglGetPointerv = GetProcAddress(gl, "glGetPointerv");
 *(FARPROC *)&pglGetFloatv = GetProcAddress(gl, "glGetFloatv"); *(FARPROC *)&pglGetTexLevelParameteriv = GetProcAddress(gl, "glGetTexLevelParameteriv");
 if (!pglGetIntegerv || !pglIsEnabled || !pglGetPointerv || !pglGetFloatv || !pglGetTexLevelParameteriv) return 0;
 int n = 0; auto h = [&](HMODULE m, const char *name, void *hook, void **orig) { void *t = m ? (void *)GetProcAddress(m, name) : NULL; if (t && MH_CreateHook(t, hook, orig) == MH_OK && MH_QueueEnableHook(t) == MH_OK) n++; };
 h(gl, "glDrawArrays", (void *)HglDrawArrays, (void **)&OglDrawArrays); h(gl, "glDrawElements", (void *)HglDrawElements, (void **)&OglDrawElements);
 h(GetModuleHandleW(L"gdi32.dll"), "SwapBuffers", (void *)HSwapBuffers, (void **)&OSwapBuffers);
 return Apply() ? n : 0;
}
