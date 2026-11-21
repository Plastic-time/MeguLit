/* engine-draw MAGES runtime (MagesDraw.h) on a stand-in engine: real MinHook detours on functions shaped like the engine's
   (commit(page, a2, flag) copying a layout into dialogue pages, clear(page), drawDialogue(font, page, opacity), drawGlyph
   with 11 cdecl arguments called from a menu and from inside drawDialogue). Checks the whole chain the game runs: the
   gates keep every return value and the caller's stack, the commit's post call reads what the commit added, the name markers
   come through, a sentence committed in two pieces stays one page unit (CHAOS;CHILD), a clear is reported once, choices
   carry their numbers, drawDialogue's own glyphs are not reported as UI, a menu's unchanged run is logged once.
   With a path argument the log lines are written there (validation/fixtures/engine-sigs/mages-draw-log.txt is that output,
   the node side's test reads it). Exit code = failures. */
#include <windows.h>
#include <cstdarg>
#include <cstdio>
#include <string>
#include <vector>
static std::vector<std::string> Lines;
namespace Msg { inline void Log(const char *f, ...) { char b[1024]; va_list a; va_start(a, f); vsnprintf(b, sizeof b, f, a); va_end(a); if (strlen(b) > 500) printf("LONG %zu %s\n", strlen(b), b); Lines.push_back(b); } }
#include "../MagesDraw.h"
static int Failures = 0;
static void Check(bool ok, const std::string &what) { printf("%s %s\n", ok ? "PASS" : "FAIL", what.c_str()); if (!ok) Failures++; }
static bool Has(const std::string &s) { for (auto &l : Lines) if (l.find(s) != std::string::npos) return true; return false; }
static int CountOf(const std::string &s) { int n = 0; for (auto &l : Lines) if (l.find(s) != std::string::npos) n++; return n; }

// ---- the stand-in engine (same page layout as the real one: S characters a page, stride 0x3C + 30*S) ----
static const int S = 2000; static const std::uint32_t STRIDE = 0x3c + 30 * S;
static std::vector<std::uint8_t> PageMem(STRIDE * 10 + 64);
static struct { int count; std::uint16_t codes[1024]; } Layout;
static struct { std::uint32_t w, h, x, y; } LayoutInfo[1024];
static float ScaleValue = 1.5f;
static std::uint16_t BackbufferSize[4] = {1920, 0, 1200, 0}; /* u16 width, u16 at +4 height: a 16:10 back buffer */
static std::uint8_t *Pg(int p) { return PageMem.data() + (size_t)p * STRIDE; }
#pragma optimize("", off)
extern "C" __declspec(noinline) int __cdecl FakeCommit(int page, int unused, int flag) {
  std::uint8_t *pg = Pg(page); int &len = *(int *)(pg + 0xc); std::uint8_t *a = pg + 0x3c;
  for (int i = 0; i < Layout.count; i++) {
    std::uint16_t c = Layout.codes[i]; if (c & 0x8000) continue; if (!LayoutInfo[i].w) continue;
    int k = len++;
    ((int *)(a + 4 * S))[k] = 0xffffff - i; a[12 * S + k] = (std::uint8_t)(c % 64); a[13 * S + k] = (std::uint8_t)(c / 64);
    ((std::int16_t *)(a + 16 * S))[k] = (std::int16_t)LayoutInfo[i].x; ((std::int16_t *)(a + 18 * S))[k] = (std::int16_t)LayoutInfo[i].y;
    ((std::int16_t *)(a + 20 * S))[k] = (std::int16_t)LayoutInfo[i].w; ((std::int16_t *)(a + 22 * S))[k] = (std::int16_t)LayoutInfo[i].h;
    a[24 * S + k] = (std::uint8_t)flag;
  }
  return len + unused * 1000;
}
extern "C" __declspec(noinline) int __cdecl FakeClear(int page) { std::uint8_t *pg = Pg(page); memset(pg + 0x3c + 12 * S, 0, S); *(int *)(pg + 0xc) = 0; return 77 + page; }
extern "C" __declspec(noinline) int __cdecl FakeGlyph(int tex, float sx, float sy, float sw, float sh, float x0, float y0, float x1, float y1, int color, unsigned op) { return tex + (int)x0 + (int)op; }
extern "C" __declspec(noinline) void __cdecl FakeDialogue(int font, int page, unsigned opacity) { for (int i = 0; i < 3; i++) FakeGlyph(0x4e, 33.f * i, 0, 30, 30, 100.f + 30 * i, 800, 130.f + 30 * i, 830, 0xffffff, opacity); }
extern "C" __declspec(noinline) void __cdecl FakeDialogue2(int font, int page, unsigned opacity) { FakeDialogue(font, page, opacity); }
extern "C" __declspec(noinline) int __cdecl FakeMenu(int shift) { int r = 0; for (int i = 0; i < 4; i++) r += FakeGlyph(0x51, 33.f * (i + shift), 64, 30, 30, 500.f + 30 * i, 200, 530.f + 30 * i, 230, 0x80ff80, 255); return r; }
extern "C" __declspec(noinline) int __cdecl FakeMenu2() { return FakeGlyph(0x51, 0, 0, 30, 30, 10, 10, 40, 40, 0xffffff, 255); }
#pragma optimize("", on)
static void SetLayout(std::initializer_list<int> codes) {
  int i = 0; for (int c : codes) { Layout.codes[i] = (std::uint16_t)(c < 0 ? 0x1de : c); LayoutInfo[i] = {c < 0 ? 0u : 20u, 30u, (std::uint32_t)(80 + 20 * i), 600u}; i++; }
  Layout.count = i;
}
int main(int argc, char **argv) {
  using namespace MagesDraw;
  if (MH_Initialize() != MH_OK) { printf("FAIL MinHook\n"); return 1; }
  Base = (uintptr_t)GetModuleHandleW(nullptr); Pages = (uintptr_t)PageMem.data(); Stride = STRIDE; Chars = S;
  Count = (uintptr_t)&Layout.count; Codes = (uintptr_t)Layout.codes; Info = (uintptr_t)LayoutInfo; ScaleAt = (uintptr_t)&ScaleValue; Backbuffer = (uintptr_t)BackbufferSize;
  Commit = (uintptr_t)FakeCommit; Clear[0] = (uintptr_t)FakeClear; Clears = 1; Dlg[0] = (uintptr_t)FakeDialogue; Dlg[1] = (uintptr_t)FakeDialogue2; Glyph = (uintptr_t)FakeGlyph;
  { uintptr_t fns[] = {(uintptr_t)FakeCommit, (uintptr_t)FakeClear, (uintptr_t)FakeGlyph, (uintptr_t)FakeDialogue, (uintptr_t)FakeDialogue2, (uintptr_t)FakeMenu, (uintptr_t)FakeMenu2, (uintptr_t)main};
    for (int i = 0; i < 2; i++) { DlgEnd[i] = Dlg[i] + 0x1000; for (uintptr_t f : fns) if (f > Dlg[i] && f < DlgEnd[i]) DlgEnd[i] = f; } } /* the next function: the real end comes from the signature */
  Install();
  Check(Has("ToMe_DRAWRUN engine=mages on: "), "installed: the on line");
  // a name + the first piece of a sentence (one glyph the layout gave no width: not in the page)
  SetLayout({0x8001, 0x3b0, 0x3b1, 0x8002, 0x254, 0xf4, -1, 0xe5});
  int r = FakeCommit(0, 0, 0);
  Check(r == 5, "commit returns the engine's value through both gates (" + std::to_string(r) + ")");
  Check(Has("ev=add page=0 seq=1 role=line from=0 n=5 scale=1.5 codes=800103b003b18002025400f400e5"), "add: markers and glyph codes in order, the widthless glyph left out");
  Check(Has("ToMe_DRAWBOX engine=mages page=0 seq=1 at=0 rects=150,900,30,45;180,900,30,45;"), "boxes in game canvas pixels (x1.5)");
  // the rest of the sentence, a second commit into the same page (SC3 wait inside the line): same unit
  SetLayout({0x24e, 0x24e, 0xc5});
  r = FakeCommit(0, 2, 0);
  Check(r == 2008, "second commit: return value kept (" + std::to_string(r) + ")");
  Check(Has("ev=add page=0 seq=1 role=line from=5 n=3"), "second piece: same page unit (seq 1), appended at 5");
  // first frame of the page; drawDialogue's own glyphs are not UI
  FakeDialogue(0, 0, 255); FakeDialogue(0, 0, 255); FakeDialogue2(1, 0, 255);
  Check(CountOf("ev=show page=0 seq=1") == 1, "show once per page unit");
  Check(Has("ev=view bb=1920,1200 client="), "view: the back buffer size the scene is drawn into (no window here: client 0,0)");
  Check(CountOf("ev=view") == 1, "view only when it changes");
  // the page is cleared and the next sentence starts
  r = FakeClear(0);
  Check(r == 77, "clear returns the engine's value");
  Check(CountOf("ev=clear page=0 seq=1") == 1, "clear reported once with the unit it ends");
  SetLayout({0x214, 0x21a, 0x21d});
  FakeCommit(0, 0, 0);
  Check(Has("ev=add page=0 seq=2 role=line from=0 n=3"), "next sentence: next unit");
  // Sel: two choices committed into page 7 with their numbers
  SetLayout({0x205, 0x1de}); FakeCommit(7, 8, 0);
  SetLayout({0x1de, 0x1e0}); FakeCommit(7, 8, 1);
  Check(Has("ev=add page=7 seq=1 role=choice from=0 n=2") && Has("ev=add page=7 seq=1 role=choice from=2 n=2"), "Sel page: role choice");
  Check(Has("page=7 seq=1 at=2 rects=") && Has("flag=1,1"), "choice numbers from the page's flag bytes");
  // a menu: one line for an unchanged run, another when it changes; none for drawDialogue
  FakeMenu(0); FakeMenu2(); FakeMenu(0); FakeMenu2(); FakeMenu(1); FakeMenu2(); FakeDialogue(0, 0, 9);
  Check(CountOf("ev=glyph site=") == 3, "menu runs: one line per change (" + std::to_string(CountOf("ev=glyph site=")) + ")");
  Check(Has("n=4 box=500,200,120,30 size=30 color=80ff80"), "menu run box, size, colour");
  for (auto &l : Lines) if (l.find("ev=glyph") != std::string::npos && l.find("box=100,800") != std::string::npos) Check(false, "drawDialogue glyph reported as UI");
  bool longLine = false; for (auto &l : Lines) if (l.size() > 500) longLine = true;
  Check(!longLine, "every line fits MESSAGE_SIZE (500)");
  if (argc > 1) { FILE *f = fopen(argv[1], "wb"); if (f) { for (auto &l : Lines) fprintf(f, "%s\n", l.c_str()); fclose(f); } }
  printf("mages draw runtime: %d failure(s)\n", Failures);
  return Failures;
}
