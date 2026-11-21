// SPDX-License-Identifier: GPL-3.0-or-later
// engine-draw, Unity IL2CPP runtime (docs/engine-draw-native.md). LunaHook's Unity engine already hooks the text setters by
// name (TMP_Text / TextMeshPro set_text, TextMeshProUGUI.SetText, UI.Text set_text) and reads the string from inside the
// engine; UnityEngine.cpp (MeguLit's copy of engines/unity/unity.cpp) hands every such call to Observe as well. This adds what
// the stream cannot say: the ROLE (who set the text: the first caller frame in a framework method of Il2cppDrawRoles.h), the
// component (its object address: one id per text object) and the clear (an empty string).
//   ToMe_DRAWRUN engine=unity on: methods=N ranges=M      | off: <why>
//   ToMe_DRAWRUN engine=unity ev=text role=line|name|choice|system kind=tmp|ugui obj=<hex> site=<rva> n=<chars> text=<UTF-8>
//   ToMe_DRAWRUN engine=unity ev=clear role=.. kind=.. obj=<hex>
// Opt-in: nothing is enumerated or logged until MeguLit's control file %TEMP%\MeguLit\draw\<pid>.txt says roles=1 (draw.roles of
// this game's diff). Then a watcher thread attaches to the IL2CPP domain once, lists every method pointer of every class (the
// il2cpp API, so no addresses per version) and keeps the rule ranges. Frames come from the x64 unwind data of the module
// (RtlVirtualUnwind from the setter's entry); 32-bit builds use the return address alone. Never changes what the game sees.
#pragma once
#include <windows.h>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
#include "Il2cppDrawRoles.h"
namespace Il2cppDraw {
// the il2cpp API, by GetProcAddress in the game; the self-test hands in its own
struct Api {
  void *(*domain_get)();
  void *(*thread_attach)(void *);
  void **(*domain_get_assemblies)(void *, size_t *);
  void *(*assembly_get_image)(void *);
  size_t (*image_get_class_count)(void *);
  void *(*image_get_class)(void *, size_t);
  void *(*class_get_methods)(void *, void **);
  const char *(*class_get_name)(void *);
  const char *(*class_get_namespace)(void *);
  void *(*class_get_declaring_type)(void *);
  const char *(*method_get_name)(void *);
};
static Api A{};
static uintptr_t ModLo = 0, ModHi = 0;
static volatile LONG Armed = 0, Ready = 0;
static std::vector<Il2cppDrawRoles::Range> *Table = nullptr;
template <class F> static bool Get(HMODULE m, const char *name, F &f) { f = (F)GetProcAddress(m, name); return f != nullptr; }
static bool Resolve(HMODULE m) {
  return Get(m, "il2cpp_domain_get", A.domain_get) && Get(m, "il2cpp_thread_attach", A.thread_attach) && Get(m, "il2cpp_domain_get_assemblies", A.domain_get_assemblies) &&
         Get(m, "il2cpp_assembly_get_image", A.assembly_get_image) && Get(m, "il2cpp_image_get_class_count", A.image_get_class_count) && Get(m, "il2cpp_image_get_class", A.image_get_class) &&
         Get(m, "il2cpp_class_get_methods", A.class_get_methods) && Get(m, "il2cpp_class_get_name", A.class_get_name) && Get(m, "il2cpp_class_get_namespace", A.class_get_namespace) &&
         Get(m, "il2cpp_class_get_declaring_type", A.class_get_declaring_type) && Get(m, "il2cpp_method_get_name", A.method_get_name);
}
// "Namespace.Outer.Inner" as Il2CppDumper writes it (the namespace belongs to the outermost type)
static std::string FullName(void *k) {
  std::string name = A.class_get_name(k) ? A.class_get_name(k) : "";
  void *outer = k;
  for (int depth = 0; depth < 8; depth++) { void *d = A.class_get_declaring_type(outer); if (!d) break; outer = d; name = std::string(A.class_get_name(d) ? A.class_get_name(d) : "") + "." + name; }
  const char *ns = A.class_get_namespace(outer);
  return ns && *ns ? std::string(ns) + "." + name : name;
}
// every method of the image list -> rule ranges (module offsets); MethodInfo's first field is the method pointer in every version
static int Build() {
  void *domain = A.domain_get(); if (!domain) return -1;
  A.thread_attach(domain);
  size_t n = 0; void **assemblies = A.domain_get_assemblies(domain, &n);
  std::vector<Il2cppDrawRoles::Method> methods; methods.reserve(200000);
  for (size_t a = 0; a < n; a++) {
    void *image = A.assembly_get_image(assemblies[a]); if (!image) continue;
    size_t classes = A.image_get_class_count(image);
    for (size_t c = 0; c < classes; c++) {
      void *k = A.image_get_class(image, c); if (!k) continue;
      std::string full; void *iter = nullptr; void *m;
      while ((m = A.class_get_methods(k, &iter)) != nullptr) {
        uintptr_t p = *(const uintptr_t *)m; if (p < ModLo || p >= ModHi) continue;
        if (full.empty()) full = FullName(k);
        const char *mn = A.method_get_name(m);
        methods.push_back({(std::uint64_t)(p - ModLo), full + "$$" + (mn ? mn : "")});
      }
    }
  }
  auto *t = new std::vector<Il2cppDrawRoles::Range>(Il2cppDrawRoles::Ranges(methods));
  Table = t; InterlockedExchange(&Ready, 1);
  Msg::Log("ToMe_DRAWRUN engine=unity on: methods=%u ranges=%u", (unsigned)methods.size(), (unsigned)t->size());
  return (int)t->size();
}
// the caller frames of a setter (module offsets), from its entry: return address and the stack slot it sits in
struct Regs { std::uint64_t rbx, rbp, rsi, rdi, r12, r13, r14, r15; };
static int Frames(uintptr_t ret, uintptr_t retSlot, const Regs &r, std::uint64_t *out, int cap) {
  int n = 0;
  __try {
#ifdef _WIN64
    CONTEXT ctx{}; ctx.ContextFlags = CONTEXT_FULL; ctx.Rip = ret; ctx.Rsp = retSlot + 8;
    ctx.Rbx = r.rbx; ctx.Rbp = r.rbp; ctx.Rsi = r.rsi; ctx.Rdi = r.rdi; ctx.R12 = r.r12; ctx.R13 = r.r13; ctx.R14 = r.r14; ctx.R15 = r.r15;
    for (int i = 0; i < 16 && n < cap && ctx.Rip; i++) {
      if (ctx.Rip >= ModLo && ctx.Rip < ModHi) out[n++] = ctx.Rip - ModLo;
      DWORD64 image = 0; PRUNTIME_FUNCTION fe = RtlLookupFunctionEntry(ctx.Rip, &image, nullptr);
      if (!fe) { ctx.Rip = *(const DWORD64 *)ctx.Rsp; ctx.Rsp += 8; continue; } // a leaf: the return address is on top
      void *handler = nullptr; DWORD64 frame = 0;
      RtlVirtualUnwind(UNW_FLAG_NHANDLER, image, ctx.Rip, fe, &ctx, &handler, &frame, nullptr);
    }
#else
    (void)retSlot; (void)r; if (ret >= ModLo && ret < ModHi && cap > 0) out[n++] = ret - ModLo;
#endif
  } __except (EXCEPTION_EXECUTE_HANDLER) {}
  return n;
}
static bool ReadString(const void *s, std::wstring &out, int &len) {
  len = 0; if (!s) return true;
  __try { len = *(const int *)((const char *)s + 2 * sizeof(void *)); if (len < 0 || len > 100000) return false; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
  out.assign((const wchar_t *)((const char *)s + 2 * sizeof(void *) + 4), (size_t)(len < 200 ? len : 200)); return true;
}
static std::string Utf8(const std::wstring &w) {
  int m = WideCharToMultiByte(CP_UTF8, 0, w.data(), (int)w.size(), nullptr, 0, nullptr, nullptr); std::string r(m, '\0');
  WideCharToMultiByte(CP_UTF8, 0, w.data(), (int)w.size(), &r[0], m, nullptr, nullptr);
  if (r.size() > 240) { size_t cut = 240; while (cut > 0 && ((unsigned char)r[cut] & 0xc0) == 0x80) cut--; r.resize(cut); }
  for (char &c : r) if (c == '\r' || c == '\n' || c == '\t') c = ' ';
  return r;
}
static const void *LastObj = nullptr; static std::wstring LastText;
// one setter call: this = the text component, s = the C# string (Il2CppString: two pointers, int length, UTF-16)
static void Observe(uintptr_t ret, uintptr_t retSlot, const Regs &r, const void *self, const void *s, const char *kind) {
  if (!Ready || !Table) return;
  std::uint64_t frames[12]; int n = Frames(ret, retSlot, r, frames, 12);
  Il2cppDrawRoles::Verdict v = Il2cppDrawRoles::Classify(*Table, frames, n);
  std::wstring w; int len = 0; if (!ReadString(s, w, len)) return;
  if (self == LastObj && w == LastText) return;
  LastObj = self; LastText = w;
  if (!len) { Msg::Log("ToMe_DRAWRUN engine=unity ev=clear role=%s kind=%s obj=%p", v.role, kind, self); return; }
  Msg::Log("ToMe_DRAWRUN engine=unity ev=text role=%s kind=%s obj=%p site=%llx n=%d text=%s", v.role, kind, self, (unsigned long long)v.site, len, Utf8(w).c_str());
}
static bool RolesAsked() {
  wchar_t tmp[MAX_PATH]; DWORD n = GetTempPathW(MAX_PATH, tmp); if (!n || n >= MAX_PATH) return false;
  wchar_t path[MAX_PATH + 64]; swprintf_s(path, L"%sMeguLit\\draw\\%lu.txt", tmp, GetCurrentProcessId());
  HANDLE h = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr, OPEN_EXISTING, 0, nullptr);
  if (h == INVALID_HANDLE_VALUE) return false;
  char buf[256] = {}; DWORD got = 0; ReadFile(h, buf, sizeof(buf) - 2, &got, nullptr); CloseHandle(h);
  static const char want[] = "roles=1"; size_t k = 0;
  for (DWORD i = 0; i < got; i++) { if (!buf[i]) continue; k = buf[i] == want[k] ? k + 1 : (buf[i] == want[0] ? 1 : 0); if (!want[k]) return true; }
  return false;
}
static int SafeBuild() { __try { return Build(); } __except (EXCEPTION_EXECUTE_HANDLER) { return -2; } }
static DWORD WINAPI Watch(void *) {
  for (int i = 0; i < 1800; i++) {
    if (RolesAsked()) { int r = SafeBuild(); if (r < 0) Msg::Log("ToMe_DRAWRUN engine=unity off: method list failed (%d)", r); return 0; }
    Sleep(2000);
  }
  return 0;
}
// called from UnityEngine.cpp when the IL2CPP runtime (GameAssembly.dll) is there; never fails the engine
static void Arm(HMODULE gameAssembly) {
  if (InterlockedExchange(&Armed, 1)) return;
  auto info = (IMAGE_NT_HEADERS *)((char *)gameAssembly + ((IMAGE_DOS_HEADER *)gameAssembly)->e_lfanew);
  ModLo = (uintptr_t)gameAssembly; ModHi = ModLo + info->OptionalHeader.SizeOfImage;
  if (!Resolve(gameAssembly)) { Msg::Log("ToMe_DRAWRUN engine=unity off: il2cpp API incomplete"); return; }
  HANDLE t = CreateThread(nullptr, 0, Watch, nullptr, 0, nullptr); if (t) CloseHandle(t);
}
}
