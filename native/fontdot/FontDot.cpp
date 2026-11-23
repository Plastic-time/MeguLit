// SPDX-License-Identifier: GPL-3.0-or-later
// MeguLitFontDot32/64.dll: "dot the font at its source" (docs/text-architecture.md). Engines that rasterise their own
// text with FreeType or a similar library (Artemis, Ren'Py, many newer engines) never ask Windows for a glyph, so ① cannot
// put dots there; they do read the font file themselves. This DLL makes every TrueType font such a game loads draw a
// dot per glyph (FontDotPatch.h: same cmap, advances, metrics and sizes, only the outlines become squares at the glyph's
// top-left), so the engine lays out exactly as before and the compositor finds each character's place in the frame.
//   - File reads (ReadFile): a read whose data starts a font (sfnt / ttcf magic) registers that byte range of that file
//     (volume + file id): the DLL reads the whole font once through its own handle, patches the copy, and from then on
//     every read overlapping the range gets the patched bytes. Works for loose font files and for plain archives
//     (Ren'Py .rpa) where the member starts the read.
//   - Fonts already in memory (an engine that decrypts its archive, e.g. Artemis .pfs): a background scan finds sfnt
//     tables in writable memory (head.magicNumber checked) and patches them in place, every 2 s for the first minute,
//     then every 10 s.
// Nothing on disk changes: the file stays as it is, only the bytes handed to the game differ. Load it before the game
// reads its fonts (MeguLitLaunch<bit>.exe starts the game suspended and loads it first; the "MeguLitFontReady-<pid>"
// event tells the launcher the hooks are in). MEGULIT_FONTDOT_OFF=1 in the game's environment: nothing is hooked.
// Reports (best effort) to \\.\pipe\MeguLitFontDot-<pid>: ToMe_FONTDOT ready | patched src=file|mem size= fonts= dotted= cff=
#include <windows.h>
#include <stdio.h>
#include <vector>
#include <string>
#include <mutex>
#include <psapi.h>
#pragma comment(lib, "psapi.lib")
#include "MinHook.h"
#include "FontDotPatch.h"

namespace {
typedef BOOL(WINAPI *ReadFileFn)(HANDLE, LPVOID, DWORD, LPDWORD, LPOVERLAPPED);
ReadFileFn ORead;
// Locks. None is ever held across file or pipe I/O, and the game's ReadFile path never waits for the memory scan:
//   Gate      - the background scan and switch (Originals, MemFonts, Pending); background threads only.
//   ReadLock  - Ranges and Checked, the game's read path (shared for lookups, exclusive for a short append).
//   OrigGate  - fonts found by file reads for the scan (NewOriginals, KnownSigs); taken for a push or a swap.
//   OutLock   - the report queue; a push or a swap. The Writer thread does the pipe I/O.
std::mutex Gate;
SRWLOCK ReadLock = SRWLOCK_INIT; volatile LONG RangeCount;
struct Range { DWORD vol; ULONGLONG id; ULONGLONG at; std::vector<uint8_t> data; };
std::vector<Range> Ranges;
std::vector<std::pair<ULONGLONG, ULONGLONG>> Checked;  // (file key hash, offset) already looked at
std::vector<uintptr_t> MemDone;
volatile LONG Live = 1; // the compositor heartbeat gate (below): dots only while it is open
thread_local bool Inside;
HANDLE Pipe = INVALID_HANDLE_VALUE; // Writer thread only
SRWLOCK OutLock = SRWLOCK_INIT; HANDLE OutWake;

std::vector<std::string> Pending; // reports made while Gate is held, sent after
std::vector<std::string> Backlog; // reports wait here until the listener is up (fonts load before anyone listens)
// Fonts found in memory. An engine may hold several copies of one font (Ren'Py's FreeType stream reads the whole font
// into a new Python bytes object again and again), so the original bytes are kept once per font (Sig: size + a hash of
// the bytes right after the table directory, which the patch never touches), and only the most recent 256 buffers are
// remembered for switching back.
struct Sig { uint32_t size; uint64_t hash; bool operator==(const Sig &o) const { return size == o.size && hash == o.hash; } };
struct FontOriginal { Sig sig; std::vector<uint8_t> bytes; bool reported; };
struct MemFont { uint8_t *at; Sig sig; std::vector<uint8_t> dir; bool dotted; };
std::vector<FontOriginal> Originals; std::vector<MemFont> MemFonts;
std::mutex OrigGate; std::vector<FontOriginal> NewOriginals; std::vector<Sig> KnownSigs; // see the lock note above
Sig SigOf(const uint8_t *p, uint32_t ext) {
 size_t d = 12 + 16 * (size_t)FontDot::U16(p + 4); if (FontDot::U32(p) == FontDot::TAG_TTCF) d = 12 + 4 * (size_t)FontDot::U32(p + 8);
 uint64_t h = 1469598103934665603ull; for (size_t i = d; i < d + 256 && i < ext; i++) { h ^= p[i]; h *= 1099511628211ull; }
 Sig s; s.size = ext; s.hash = h; return s;
}
// Queues a report line (any thread, never blocks on the pipe); "" only wakes the Writer. Lines wait in Backlog until the
// listener is up (fonts load before anyone listens); at most 4000, the oldest dropped first.
void Report(const std::string &line) {
 if (!line.empty()) { AcquireSRWLockExclusive(&OutLock); if (Backlog.size() > 4000) Backlog.erase(Backlog.begin()); Backlog.push_back(line); ReleaseSRWLockExclusive(&OutLock); }
 if (OutWake) SetEvent(OutWake);
}
// The pipe: connects at most every 2 s, writes the queued lines in order; a line that could not be written stays queued.
DWORD WINAPI Writer(void *) {
 char name[64]; sprintf_s(name, "\\\\.\\pipe\\MeguLitFontDot-%lu", GetCurrentProcessId()); DWORD tried = 0; bool first = true;
 for (;;) {
  WaitForSingleObject(OutWake, 2000);
  if (Pipe == INVALID_HANDLE_VALUE) {
   DWORD now = GetTickCount(); if (!first && now - tried < 2000) continue; first = false; tried = now;
   Pipe = CreateFileA(name, GENERIC_WRITE, 0, NULL, OPEN_EXISTING, 0, NULL);
   if (Pipe == INVALID_HANDLE_VALUE) continue;
  }
  std::vector<std::string> batch; AcquireSRWLockExclusive(&OutLock); batch.swap(Backlog); ReleaseSRWLockExclusive(&OutLock);
  size_t i = 0;
  for (; i < batch.size(); i++) { std::string l = batch[i] + "\n"; DWORD w; if (!WriteFile(Pipe, l.data(), (DWORD)l.size(), &w, NULL)) { CloseHandle(Pipe); Pipe = INVALID_HANDLE_VALUE; break; } }
  if (i < batch.size()) { AcquireSRWLockExclusive(&OutLock); Backlog.insert(Backlog.begin(), batch.begin() + i, batch.end()); while (Backlog.size() > 4001) Backlog.erase(Backlog.begin()); ReleaseSRWLockExclusive(&OutLock); }
 }
}
std::string Stat(const char *src, const FontDot::Result &r) {
 char b[200]; sprintf_s(b, "ToMe_FONTDOT patched src=%s size=%u fonts=%d dotted=%d emptied=%d cff=%d strikes=%d", src, r.size, r.fonts, r.dotted, r.emptied, r.cff, r.strikes);
 return b;
}
bool Magic(const uint8_t *p, DWORD n) {
 if (n < 4) return false; uint32_t v = FontDot::U32(p);
 return v == FontDot::SFNT || v == FontDot::TAG_TRUE || v == FontDot::TAG_TTCF || v == FontDot::TAG_OTTO;
}
bool Key(HANDLE h, DWORD *vol, ULONGLONG *id) {
 BY_HANDLE_FILE_INFORMATION fi;
 if (GetFileType(h) != FILE_TYPE_DISK || !GetFileInformationByHandle(h, &fi)) return false;
 *vol = fi.dwVolumeSerialNumber; *id = (ULONGLONG)fi.nFileIndexHigh << 32 | fi.nFileIndexLow; return true;
}
bool ReadAt(HANDLE own, ULONGLONG at, uint8_t *buf, DWORD n) {
 OVERLAPPED o{}; o.Offset = (DWORD)at; o.OffsetHigh = (DWORD)(at >> 32); DWORD got = 0;
 return ORead(own, buf, n, &got, &o) && got == n;
}
// A read that starts a font: read it whole through our own handle, patch the copy, keep it for every later read.
void Register(HANDLE h, DWORD vol, ULONGLONG id, ULONGLONG at) {
 wchar_t path[MAX_PATH * 2]; if (!GetFinalPathNameByHandleW(h, path, MAX_PATH * 2, FILE_NAME_NORMALIZED)) return;
 HANDLE own = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, NULL, OPEN_EXISTING, 0, NULL);
 if (own == INVALID_HANDLE_VALUE) { Report("ToMe_FONTDOT skipped: cannot reopen the file"); return; }
 bool registered = false;
 std::vector<uint8_t> head(65536); LARGE_INTEGER size; GetFileSizeEx(own, &size);
 DWORD hn = (DWORD)min((ULONGLONG)head.size(), (ULONGLONG)size.QuadPart - at);
 if (hn >= 12 && ReadAt(own, at, head.data(), hn)) {
  uint32_t need = FontDot::HeaderBytes(head.data(), hn), ext = need && need <= hn ? FontDot::Extent(head.data(), hn) : 0;
  if (ext >= 1024 && at + ext <= (ULONGLONG)size.QuadPart && ext < (256u << 20)) {
   std::vector<uint8_t> data(ext);
   if (ReadAt(own, at, data.data(), ext)) {
    // the original, so a copy the engine keeps in memory (already dotted by this read) can be switched back later
    // (handed to the scan through NewOriginals: this read never waits for a scan in progress)
    { Sig sg = SigOf(data.data(), ext); bool add = false; { std::lock_guard<std::mutex> g(OrigGate); bool have = false; for (auto &x : KnownSigs) if (x == sg) have = true; if (!have && KnownSigs.size() < 32) { KnownSigs.push_back(sg); add = true; } }
      if (add) { FontOriginal n; n.sig = sg; n.reported = true; if (ext <= (64u << 20)) n.bytes = data; std::lock_guard<std::mutex> g(OrigGate); NewOriginals.push_back(std::move(n)); } }
    FontDot::Result r = FontDot::Patch(data.data(), data.size());
    if (r.ok) { AcquireSRWLockExclusive(&ReadLock); Ranges.push_back(Range{vol, id, at, std::move(data)}); ReleaseSRWLockExclusive(&ReadLock); InterlockedIncrement(&RangeCount); registered = true; Report(Stat("file", r)); }
   }
  }
 }
 CloseHandle(own);
 { char m[700]; char u[520] = ""; WideCharToMultiByte(CP_UTF8, 0, path, -1, u, sizeof u, NULL, NULL);
   sprintf_s(m, "ToMe_FONTDOT %s file offset=%llu header=%lu path=%s", registered ? "registered" : "skipped", at, hn, u); Report(m); }
}
int Traced; bool Trace;
void After(HANDLE h, LPVOID buf, DWORD len, LARGE_INTEGER pos) {
  if (Trace && Traced < 3000) { wchar_t pth[400]; char u[600] = "?"; if (GetFinalPathNameByHandleW(h, pth, 400, 0)) WideCharToMultiByte(CP_UTF8, 0, pth, -1, u, sizeof u, NULL, NULL);
   const uint8_t *q = (const uint8_t *)buf; char m[800]; sprintf_s(m, "ToMe_FONTDOT trace off=%lld len=%lu head=%02x%02x%02x%02x %s", pos.QuadPart, len, q[0], len > 1 ? q[1] : 0, len > 2 ? q[2] : 0, len > 3 ? q[3] : 0, u); if (strstr(u, ".rpa") || strstr(u, ".ttf") || strstr(u, ".otf") || strstr(u, ".pfs")) { Traced++; Report(m); } }
  DWORD vol = 0; ULONGLONG id = 0; bool keyed = false;
  bool any = InterlockedCompareExchange(&RangeCount, 0, 0) != 0;
  if (Magic((const uint8_t *)buf, len)) {
   keyed = Key(h, &vol, &id);
   if (keyed) {
    ULONGLONG k = id ^ ((ULONGLONG)vol << 40); bool seen = false;
    { AcquireSRWLockExclusive(&ReadLock); for (auto &c : Checked) if (c.first == k && c.second == (ULONGLONG)pos.QuadPart) { seen = true; break; } if (!seen) Checked.push_back({k, (ULONGLONG)pos.QuadPart}); ReleaseSRWLockExclusive(&ReadLock); }
    if (!seen) { Register(h, vol, id, (ULONGLONG)pos.QuadPart); any = true; }
   }
  }
  if (any && Live && (keyed || Key(h, &vol, &id))) {
   AcquireSRWLockShared(&ReadLock);
   ULONGLONG a = (ULONGLONG)pos.QuadPart, b = a + len;
   for (auto &r : Ranges) {
    if (r.vol != vol || r.id != id) continue;
    ULONGLONG ra = r.at, rb = r.at + r.data.size(); ULONGLONG s = max(a, ra), e = min(b, rb);
    if (s < e) memcpy((uint8_t *)buf + (s - a), r.data.data() + (s - ra), (size_t)(e - s));
   }
   ReleaseSRWLockShared(&ReadLock);
  }
}
// no C++ objects here, so a fault in the game's buffer or our code never escapes into the game's read
void AfterGuarded(HANDLE h, LPVOID buf, DWORD len, LARGE_INTEGER pos) { __try { After(h, buf, len, pos); } __except (EXCEPTION_EXECUTE_HANDLER) {} }
BOOL WINAPI HRead(HANDLE h, LPVOID buf, DWORD n, LPDWORD got, LPOVERLAPPED ov) {
 if (Inside) return ORead(h, buf, n, got, ov);
 LARGE_INTEGER pos; pos.QuadPart = 0; bool known = false;
 if (ov) { pos.LowPart = ov->Offset; pos.HighPart = (LONG)ov->OffsetHigh; known = true; }
 else { LARGE_INTEGER z; z.QuadPart = 0; known = SetFilePointerEx(h, z, &pos, FILE_CURRENT) != 0; }
 BOOL ok = ORead(h, buf, n, got, ov);
 if (!ok || !known || !buf) return ok;
 DWORD len = got ? *got : 0; if (!len) return ok;
 Inside = true; AfterGuarded(h, buf, len, pos); Inside = false;
 return ok;
}

// ---- compositor heartbeat (docs/text-architecture.md, "Owner rule: the player never sees marks") --------------------
// The same gate as MeguLitFont's glyph dots: Local\MeguLitCompositorBeat-<pid> {magic 'MGCB', version 1, compositorPid,
// presenting, tickMs, frames}. Before any heartbeat: dots for 20 s from load (early injection starts before the
// compositor). After one was seen: dots only while presenting == 1 and the tick is at most 1 s old. When the gate closes
// every font patched in memory gets its original bytes back and file reads are served as they are; when it opens again
// they are patched again. Glyphs the engine already rasterised stay as they were drawn (status needs-relaunch).
#pragma pack(push, 4)
struct Beat { DWORD magic, version, compositorPid, presenting; unsigned long long tickMs, frames; };
#pragma pack(pop)
ULONGLONG LoadedAt; volatile const Beat *BeatView; volatile LONG BeatSeen;
bool DotsLive() {
 if (!BeatView) { wchar_t name[64]; swprintf_s(name, L"Local\\MeguLitCompositorBeat-%lu", GetCurrentProcessId()); HANDLE m = OpenFileMappingW(FILE_MAP_READ, FALSE, name);
  if (m) { void *v = MapViewOfFile(m, FILE_MAP_READ, 0, 0, sizeof(Beat)); if (v && InterlockedCompareExchangePointer((PVOID *)&BeatView, v, NULL) != NULL) UnmapViewOfFile(v); CloseHandle(m); } }
 ULONGLONG now = GetTickCount64(); const volatile Beat *b = BeatView;
 if (b && b->magic == 0x4243474D && b->version == 1) { if (b->tickMs) InterlockedExchange(&BeatSeen, 1); if (BeatSeen) return b->presenting == 1 && b->tickMs && now >= b->tickMs && now - b->tickMs <= 1000; }
 if (BeatSeen) return false;
 return now - LoadedAt <= 20000;
}

// ---- fonts already in memory ----------------------------------------------------------------------------------------
int ScanRegion(uint8_t *base, size_t size);
void MergeOriginalsLocked();
int ScanRegionGuarded(uint8_t *base, size_t size) { __try { return ScanRegion(base, size); } __except (EXCEPTION_EXECUTE_HANDLER) { return 0; } }
int ScanOnce() {
 { std::lock_guard<std::mutex> g(Gate); MergeOriginalsLocked(); }
 int found = 0; SYSTEM_INFO si; GetSystemInfo(&si);
 uint8_t *p = (uint8_t *)si.lpMinimumApplicationAddress, *end = (uint8_t *)si.lpMaximumApplicationAddress;
 HMODULE self = NULL; GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT, (LPCWSTR)&ScanOnce, &self);
 MEMORY_BASIC_INFORMATION m;
 while (p < end && VirtualQuery(p, &m, sizeof m)) {
  uint8_t *base = (uint8_t *)m.BaseAddress; size_t size = m.RegionSize;
  bool rw = m.State == MEM_COMMIT && !(m.Protect & (PAGE_GUARD | PAGE_NOACCESS)) && (m.Protect & (PAGE_READWRITE | PAGE_EXECUTE_READWRITE)) && m.Type == MEM_PRIVATE;
  if (rw && size >= 4096) { std::lock_guard<std::mutex> g(Gate); found += ScanRegionGuarded(base, size); }
  p = base + size;
 }
 return found;
}
int ScanRegion(uint8_t *base, size_t size) {
 int found = 0;
    for (size_t i = 0; i + 64 <= size; i += 16) {
     if (!Magic(base + i, 4)) continue;
     uint32_t ext = FontDot::Extent(base + i, size - i);
     if (ext < 1024 || ext > size - i) continue;
     uint8_t *at = base + i; Sig sig = SigOf(at, ext); bool live = Live != 0;
     MemFont *known = NULL; for (auto &m : MemFonts) if (m.at == at && m.sig == sig) { known = &m; break; }
     if (known && known->dotted == live) { i += ext & ~15u; continue; }    // already as it should be
     FontOriginal *o = NULL; for (auto &x : Originals) if (x.sig == sig) { o = &x; break; }
     if (!o && Originals.size() < 32) { { std::lock_guard<std::mutex> g(OrigGate); bool k = false; for (auto &x : KnownSigs) if (x == sig) k = true; if (!k) KnownSigs.push_back(sig); } FontOriginal n; n.sig = sig; n.reported = false; if (ext <= (64u << 20)) n.bytes.assign(at, at + ext); Originals.push_back(std::move(n)); o = &Originals.back(); }
     if (live) {
      FontDot::Result r = FontDot::Patch(at, size - i);
      if (r.ok && o && !o->reported) { o->reported = true; found++; Pending.push_back(Stat("mem", r)); }
     } else if (known && o && !o->bytes.empty()) memcpy(at, o->bytes.data(), o->bytes.size());
     if (known) known->dotted = live;
     else { MemFont m; m.at = at; m.sig = sig; m.dotted = live; m.dir.assign(at, at + 12 + 16 * (size_t)FontDot::U16(at + 4));
      if (MemFonts.size() >= 256) MemFonts.erase(MemFonts.begin()); MemFonts.push_back(std::move(m)); }
     i += ext & ~15u;
    }
 return found;
}
// trace only: name every mapped view once (is the font archive memory-mapped?)
void TraceMapped() {
 SYSTEM_INFO si; GetSystemInfo(&si); uint8_t *p = (uint8_t *)si.lpMinimumApplicationAddress; MEMORY_BASIC_INFORMATION m;
 while (p < (uint8_t *)si.lpMaximumApplicationAddress && VirtualQuery(p, &m, sizeof m)) {
  if (m.State == MEM_COMMIT && m.Type == MEM_MAPPED && m.BaseAddress == m.AllocationBase) { wchar_t n[400]; char u[600];
   if (GetMappedFileNameW(GetCurrentProcess(), m.BaseAddress, n, 400)) { WideCharToMultiByte(CP_UTF8, 0, n, -1, u, sizeof u, NULL, NULL);
    if (strstr(u, ".rpa") || strstr(u, ".ttf") || strstr(u, ".otf") || strstr(u, ".pfs")) { char r[800]; sprintf_s(r, "ToMe_FONTDOT mapped %p size=%zu protect=%lx %s", m.BaseAddress, m.RegionSize, m.Protect, u); Report(r); } } }
  p = (uint8_t *)m.BaseAddress + m.RegionSize; }
}
// Fonts registered by file reads join Originals here (scan and switch threads, under Gate) before they are needed.
void MergeOriginalsLocked() {
 std::vector<FontOriginal> fresh; { std::lock_guard<std::mutex> g(OrigGate); fresh.swap(NewOriginals); }
 for (auto &n : fresh) { bool have = false; for (auto &x : Originals) if (x.sig == n.sig) have = true; if (!have && Originals.size() < 32) Originals.push_back(std::move(n)); }
}
void FlushPending() { std::vector<std::string> p; { std::lock_guard<std::mutex> g(Gate); p.swap(Pending); } for (auto &l : p) Report(l); }
const FontOriginal *OriginalOf(const MemFont &f) { for (auto &x : Originals) if (x.sig == f.sig && !x.bytes.empty()) return &x; return NULL; }
bool StillOurs(const MemFont &f, size_t size) {
 MEMORY_BASIC_INFORMATION m; if (!VirtualQuery(f.at, &m, sizeof m) || m.State != MEM_COMMIT || !(m.Protect & (PAGE_READWRITE | PAGE_EXECUTE_READWRITE))) return false;
 if ((uint8_t *)m.BaseAddress + m.RegionSize < f.at + size) return false;
 if (FontDot::Extent(f.at, size) != size) return false;                 // freed and reused: not a font of this size any more
 return memcmp(f.at, f.dir.data(), f.dir.size()) == 0 && SigOf(f.at, (uint32_t)size) == f.sig;
}
int Switch(bool dots) {
 int n = 0;
 for (auto &f : MemFonts) {
  const FontOriginal *o = OriginalOf(f); if (f.dotted == dots || !o || !StillOurs(f, o->bytes.size())) continue;
  if (dots) FontDot::Patch(f.at, o->bytes.size()); else memcpy(f.at, o->bytes.data(), o->bytes.size());
  f.dotted = dots; n++;
 }
 return n;
}
int SwitchGuarded(bool dots) { __try { return Switch(dots); } __except (EXCEPTION_EXECUTE_HANDLER) { return -1; } }
DWORD WINAPI BeatWatch(void *) {
 bool served = false;
 for (;;) {
  Sleep(250); bool live = DotsLive();
  if (live == (Live != 0)) continue;
  InterlockedExchange(&Live, live ? 1 : 0);
  int n; { std::lock_guard<std::mutex> g(Gate); MergeOriginalsLocked(); n = SwitchGuarded(live); }
  if (live) Report("ToMe_FONTDOT status live fonts=" + std::to_string(n));
  else { Report(std::string("ToMe_FONTDOT status ") + (served || n > 0 ? "needs-relaunch" : "paused") + " fonts=" + std::to_string(n)); }
  { std::lock_guard<std::mutex> g(Gate); served = served || n > 0 || !Originals.empty(); }
 }
}
DWORD WINAPI Scanner(void *) {
 for (int i = 0; i < 30; i++) { ScanOnce(); FlushPending(); if (Trace && (i % 5) == 4) TraceMapped(); Report(""); Sleep(2000); }
 for (;;) { ScanOnce(); FlushPending(); Report(""); Sleep(10000); }
}

DWORD WINAPI Start(void *) {
 LoadedAt = GetTickCount64();
 OutWake = CreateEventW(NULL, FALSE, FALSE, NULL); CreateThread(NULL, 0, Writer, NULL, 0, NULL);
 MH_Initialize();
 HMODULE kb = GetModuleHandleW(L"kernelbase.dll"); if (!kb) kb = GetModuleHandleW(L"kernel32.dll");
 void *target = kb ? (void *)GetProcAddress(kb, "ReadFile") : NULL;
 bool hooked = target && MH_CreateHook(target, (void *)&HRead, (void **)&ORead) == MH_OK && MH_EnableHook(target) == MH_OK;
 wchar_t ready[64]; swprintf_s(ready, L"MeguLitFontReady-%lu", GetCurrentProcessId());
 HANDLE ev = OpenEventW(EVENT_MODIFY_STATE, FALSE, ready); if (ev) { SetEvent(ev); CloseHandle(ev); }
 Report(std::string("ToMe_FONTDOT ready version=2 readfile=") + (hooked ? "1" : "0"));
 CreateThread(NULL, 0, Scanner, NULL, 0, NULL);
 CreateThread(NULL, 0, BeatWatch, NULL, 0, NULL);
 return 0;
}
}

BOOL WINAPI DllMain(HINSTANCE h, DWORD reason, void *) {
 if (reason == DLL_PROCESS_ATTACH) {
  DisableThreadLibraryCalls(h);
  char off[8]; if (GetEnvironmentVariableA("MEGULIT_FONTDOT_OFF", off, sizeof off) && off[0] == '1') return TRUE;
  { char t[8]; Trace = GetEnvironmentVariableA("MEGULIT_FONTDOT_TRACE", t, sizeof t) && t[0] == '1'; }
  HMODULE pin; GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_PIN, (LPCWSTR)&DllMain, &pin);
  // hooks before the launcher resumes the game: installed on this (loader) thread's helper, waited for by the launcher
  // hooks in before LoadLibrary returns: MeguLitLaunch loads this DLL while the game is still suspended (no wait event)
  Start(NULL);
 }
 return TRUE;
}
extern "C" __declspec(dllexport) const char *MeguLitFontDotVersion() { return "MeguLitFontDot version=2"; }
