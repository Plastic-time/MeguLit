// Stand-in KiriKiri Z host for MeguLitScn*.dll: an exporter object in the exe, two plug-ins holding it, scene files
// served from memory through TVPCreateIStream, and a message loop. Exit code 0 when the game-opened scene and the scene
// asked for through want.txt are both saved byte for byte, the read position is untouched and nothing else is saved.
#include <windows.h>
#include <shlwapi.h>
#include <stdio.h>
#include <string.h>
#include <string>
struct VariantString { int RefCount; wchar_t *LongString; wchar_t ShortString[22]; int Length; unsigned HeapFlag; unsigned Hint; };
static const char A[] = "mdf\0scene-a-bytes", B[] = "PSB\0scene-b-bytes-longer";
static int Opens;
static const wchar_t *Str(const void *ref) { const VariantString *p = *(VariantString *const *)ref; return p->LongString ? p->LongString : p->ShortString; }
static bool Find(const wchar_t *n, const char **data, unsigned *size) {
 const wchar_t *b = wcsrchr(n, L'>'); b = b ? b + 1 : n;
 if (!_wcsicmp(b, L"a.ks.scn")) { *data = A; *size = sizeof A - 1; return true; }
 if (!_wcsicmp(b, L"b.ks.scn")) { *data = B; *size = sizeof B - 1; return true; }
 if (!_wcsicmp(b, L"image.png")) { *data = A; *size = 4; return true; }
 return false;
}
static IStream *__stdcall CreateIStream(const void *name, unsigned flags) {
 const char *d; unsigned n; Opens++;
 if (!Find(Str(name), &d, &n)) throw 1; // the engine throws for a missing storage
 return SHCreateMemStream((const BYTE *)d, n);
}
static bool __stdcall Exists(const void *name) { const char *d; unsigned n; return Find(Str(name), &d, &n); }
struct Exporter {
 virtual bool __cdecl QueryFunctions(const wchar_t **, void **, unsigned) { return false; }
 virtual bool __cdecl QueryFunctionsByNarrowString(const char **names, void **fn, unsigned count) {
  for (unsigned i = 0; i < count; i++) {
   if (!strcmp(names[i], "IStream * ::TVPCreateIStream(const ttstr &,tjs_uint32)")) fn[i] = (void *)&CreateIStream;
   else if (!strcmp(names[i], "bool ::TVPIsExistentStorage(const ttstr &)")) fn[i] = (void *)&Exists;
   else return false;
  }
  return true;
 }
};
static Exporter TheExporter;
static VariantString *Make(const wchar_t *s) { auto v = new VariantString(); v->RefCount = 1; v->LongString = _wcsdup(s); v->Length = (int)wcslen(s); return v; }
static bool Same(const std::wstring &file, const char *data, unsigned size) {
 HANDLE h = CreateFileW(file.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, NULL, OPEN_EXISTING, 0, NULL);
 if (h == INVALID_HANDLE_VALUE) return false;
 char buf[256]; DWORD got = 0; ReadFile(h, buf, sizeof buf, &got, NULL); CloseHandle(h);
 return got == size && !memcmp(buf, data, size);
}
static void Pump(int ms) { DWORD until = GetTickCount() + ms; MSG m; while ((int)(until - GetTickCount()) > 0) { while (PeekMessageW(&m, NULL, 0, 0, PM_REMOVE)) DispatchMessageW(&m); Sleep(10); } }
static bool WaitFile(const std::wstring &f, int ms) { for (int i = 0; i < ms / 50; i++) { if (GetFileAttributesW(f.c_str()) != INVALID_FILE_ATTRIBUTES) return true; Pump(50); } return false; }
int wmain(int argc, wchar_t **argv) {
 if (argc != 3) { fwprintf(stderr, L"host <capture dll> <expected output folder>\n"); return 2; }
 typedef HRESULT(__stdcall * Link)(void *);
 for (const wchar_t *p : {L"plugin1.dll", L"plugin2.dll"}) { HMODULE m = LoadLibraryW(p); if (!m) return 3; ((Link)GetProcAddress(m, "V2Link"))(&TheExporter); }
 // How a plug-in calls it: through the pointer the exporter hands out (the hook patches that function).
 const char *names[1] = {"IStream * ::TVPCreateIStream(const ttstr &,tjs_uint32)"}; void *fn[1];
 TheExporter.QueryFunctionsByNarrowString(names, fn, 1);
 typedef IStream *(__stdcall * Open)(const void *, unsigned);
 Open open = (Open)fn[0];
 std::wstring out = argv[2];
 fwprintf(stderr, L"step plugins ok\n");
 if (!LoadLibraryW(argv[1])) return 4;
 fwprintf(stderr, L"step capture dll loaded\n");
 Pump(1500); // the capture thread finds the exporter and hooks
 VariantString *img = Make(L"image.png"), *a = Make(L"archive://./scn.xp3>a.ks.scn");
 IStream *s = open(&img, 0); s->Release();
 fwprintf(stderr, L"step image opened\n");
 s = open(&a, 0);
 char head[4]; ULONG got = 0; s->Read(head, 4, &got); // the game reads from the start, as if nothing else had
 s->Release();
 if (got != 4 || memcmp(head, "mdf", 4)) { fwprintf(stderr, L"read position moved\n"); return 5; }
 try { VariantString *missing = Make(L"none.scn"); open(&missing, 0); } catch (int) {} // engine exceptions pass through
 if (!WaitFile(out + L"a.ks.scn", 5000) || !Same(out + L"a.ks.scn", A, sizeof A - 1)) { fwprintf(stderr, L"a.ks.scn not saved\n"); return 6; }
 HANDLE w = CreateFileW((out + L"want.txt").c_str(), GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, 0, NULL);
 const char want[] = "a.ks.scn\r\nmissing.ks.scn\r\nb.ks.scn\r\n"; DWORD wr; WriteFile(w, want, sizeof want - 1, &wr, NULL); CloseHandle(w);
 if (!WaitFile(out + L"b.ks.scn", 8000) || !Same(out + L"b.ks.scn", B, sizeof B - 1)) { fwprintf(stderr, L"b.ks.scn not asked for\n"); return 7; }
 if (GetFileAttributesW((out + L"image.png").c_str()) != INVALID_FILE_ATTRIBUTES) return 8;
 Pump(1500);
 wprintf(L"PASS scene capture: exporter found, a.ks.scn saved on open, b.ks.scn asked for, read position kept (%d opens)\n", Opens);
 return 0;
}
