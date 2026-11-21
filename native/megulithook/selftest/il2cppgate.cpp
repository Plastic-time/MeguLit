/* engine-draw Unity IL2CPP runtime (Il2cppDraw.h) on a stand-in: a fake il2cpp API lists "methods" whose pointers are real
   functions of this program (Fungus.Writer$$Write, Fungus.SayDialog$$SetCharacterName, a TextAdapter in between, menus), the
   text setter is called through them, and Observe must walk the real x64 unwind data from the setter's entry to the first rule
   frame: Write -> adapter -> setter = line (the adapter in between is skipped), SetCharacterName -> setter = name, a direct call
   = system; the same text on the same object is logged once, an empty string is a clear. With a path argument the log is
   written there. Exit code = failures. (x64: the unwind walk; the 32-bit build checks the return-address-only path.) */
#include <windows.h>
#include <intrin.h>
#include <cstdarg>
#include <cstdio>
#include <string>
#include <vector>
static std::vector<std::string> Lines;
namespace Msg { inline void Log(const char *f, ...) { char b[1024]; va_list a; va_start(a, f); vsnprintf(b, sizeof b, f, a); va_end(a); Lines.push_back(b); } }
#include "../Il2cppDraw.h"
static int Failures = 0;
static void Check(bool ok, const std::string &what) { printf("%s %s\n", ok ? "PASS" : "FAIL", what.c_str()); if (!ok) Failures++; }
static int CountOf(const std::string &s) { int n = 0; for (auto &l : Lines) if (l.find(s) != std::string::npos) n++; return n; }

// a C# string as IL2CPP lays it out: klass, monitor, int length, UTF-16
struct FakeString { void *klass, *monitor; int length; wchar_t chars[64]; };
static FakeString Str(const wchar_t *t) { FakeString s{}; s.length = (int)wcslen(t); wcscpy_s(s.chars, t); return s; }
static int Component = 0, Other = 0;
#pragma optimize("", off)
extern "C" __declspec(noinline) void __cdecl Setter(const void *self, const FakeString *s) {
  CONTEXT c{}; RtlCaptureContext(&c);
#ifdef _WIN64
  Il2cppDraw::Regs r{c.Rbx, c.Rbp, c.Rsi, c.Rdi, c.R12, c.R13, c.R14, c.R15};
#else
  Il2cppDraw::Regs r{};
#endif
  Il2cppDraw::Observe((uintptr_t)_ReturnAddress(), (uintptr_t)_AddressOfReturnAddress(), r, self, s, "tmp");
}
extern "C" __declspec(noinline) void __cdecl Adapter(const void *self, const FakeString *s) { Setter(self, s); volatile int k = 0; (void)k; }
extern "C" __declspec(noinline) void __cdecl Write(const FakeString *s) { Adapter(&Component, s); volatile int k = 1; (void)k; }
extern "C" __declspec(noinline) void __cdecl SetCharacterName(const FakeString *s) { Setter(&Other, s); volatile int k = 2; (void)k; }
extern "C" __declspec(noinline) void __cdecl Menu(const FakeString *s) { Setter(&Other, s); volatile int k = 3; (void)k; }
#pragma optimize("", on)
// the fake il2cpp API: one assembly, one image, four classes
struct FakeMethod { void *pointer; const char *name; };
struct FakeClass { const char *ns, *name; FakeClass *outer; std::vector<FakeMethod> methods; };
static std::vector<FakeClass> Classes;
static int Domain;
static void *DomainGet() { return &Domain; }
static void *ThreadAttach(void *) { return nullptr; }
static void *Assembly = &Domain; static void **GetAssemblies(void *, size_t *n) { *n = 1; return &Assembly; }
static void *GetImage(void *) { return &Domain; }
static size_t ClassCount(void *) { return Classes.size(); }
static void *GetClass(void *, size_t i) { return &Classes[i]; }
static void *GetMethods(void *k, void **iter) { auto c = (FakeClass *)k; size_t i = (size_t)*iter; if (i >= c->methods.size()) return nullptr; *iter = (void *)(i + 1); return &c->methods[i]; }
static const char *ClassName(void *k) { return ((FakeClass *)k)->name; }
static const char *ClassNs(void *k) { return ((FakeClass *)k)->outer ? "" : ((FakeClass *)k)->ns; }
static void *Declaring(void *k) { return ((FakeClass *)k)->outer; }
static const char *MethodName(void *m) { return ((FakeMethod *)m)->name; }
int main(int argc, char **argv) {
  using namespace Il2cppDraw;
  HMODULE self = GetModuleHandleW(nullptr); auto nt = (IMAGE_NT_HEADERS *)((char *)self + ((IMAGE_DOS_HEADER *)self)->e_lfanew);
  ModLo = (uintptr_t)self; ModHi = ModLo + nt->OptionalHeader.SizeOfImage;
  A = {DomainGet, ThreadAttach, GetAssemblies, GetImage, ClassCount, GetClass, GetMethods, ClassName, ClassNs, Declaring, MethodName};
  Classes.reserve(8);
  Classes.push_back({"Fungus", "Writer", nullptr, {{(void *)Write, "Write"}}});
  Classes.push_back({"Fungus", "SayDialog", nullptr, {{(void *)SetCharacterName, "SetCharacterName"}}});
  Classes.push_back({"Fungus", "TextAdapter", nullptr, {{(void *)Adapter, "set_Text"}}});
  Classes.push_back({"Game", "Menu", nullptr, {{(void *)Menu, "Show"}, {(void *)Setter, "set_text"}, {(void *)main, "Main"}}});
  Classes.push_back({"", "<Write>d__81", &Classes[0], {}});
  int ranges = Build();
  Check(ranges == 2 && CountOf("ToMe_DRAWRUN engine=unity on: methods=6 ranges=2") == 1, "method list through the il2cpp API: 6 methods, 2 rule ranges (Write, SetCharacterName)");
  Check(FullName(&Classes[4]) == "Fungus.Writer.<Write>d__81", "nested type names as Il2CppDumper writes them");
  FakeString a = Str(L"私の名は"), n = Str(L"岡部"), m = Str(L"はい"), e = Str(L"");
  Write(&a); Write(&a); SetCharacterName(&n); Menu(&m); Write(&e);
#ifdef _WIN64
  Check(CountOf("ev=text role=line kind=tmp") == 1, "Write -> adapter -> setter: line (the adapter frame is not a rule, the walk goes on)");
  Check(CountOf("ev=text role=name kind=tmp") == 1, "SetCharacterName -> setter: name");
#endif
  Check(CountOf("ev=text role=system kind=tmp") >= 1, "a menu: system");
  Check(CountOf("text=\xe7\xa7\x81\xe3\x81\xae\xe5\x90\x8d\xe3\x81\xaf") == 1, "the same text on the same object once (UTF-8)");
  Check(CountOf("ev=clear") == 1, "an empty string is a clear");
  for (auto &l : Lines) printf("  %s\n", l.c_str());
  if (argc > 1) { FILE *f = fopen(argv[1], "wb"); if (f) { for (auto &l : Lines) fprintf(f, "%s\n", l.c_str()); fclose(f); } }
  printf("il2cpp draw runtime: %d failure(s)\n", Failures);
  return Failures;
}
