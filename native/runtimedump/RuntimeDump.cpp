// SPDX-License-Identifier: GPL-3.0-or-later
// MeguLitDump32/64.dll: engine-independent capture of decrypted game data (scripts, translation packs). Some games ship
// their scenario or Chinese patch under a custom cipher no static key table opens (女王蜂の王房's menou.chs, サノバウィッチ's
// packs). Whatever the cipher, the game must turn the bytes into plain text in its own memory before it can show a line;
// this DLL watches for that moment and saves the plain buffer. It never decrypts anything itself.
//
// Where plain text shows up, and how each is watched (all hooks with MinHook; every memory access is guarded):
//  1. In place: the game ReadFile()s (or maps) an encrypted file into a buffer and decrypts it right there. The buffer
//     is remembered with the CRC of what was read; a watcher thread looks again over the next seconds and saves it once it
//     has changed, stopped changing, and reads as text.
//  2. Into a fresh buffer: right after such a read the game allocates the output buffer (about the input's size). For a
//     short time after a read, heap allocations of a matching size are watched the same way.
//  3. Decompression: ntdll RtlDecompressBuffer(Ex) and any loaded module's exported zlib inflate/uncompress; their output
//     is checked as soon as the call returns.
// "Reads as text": Shift-JIS, GBK, UTF-8 or UTF-16LE CJK characters make up enough of the buffer (plain scripts, and
// compiled scripts that embed their strings). Media, fonts and executables are never looked at.
//
// Off by default: it acts only when <MeguLit>\cache\runtime-dump\<key>\on exists (key: FNV-1a of the lower-case game
// folder, as MeguLitScn uses) or MEGULIT_RUNTIME_DUMP_ON=1; MEGULIT_RUNTIME_DUMP=<folder> moves the output root (tests,
// H:\MeguLit-Work\runtime-dump). Output: <root>\<key>\ game.txt, ready.txt, dump.log, index.jsonl (one JSON line per saved
// buffer) and the buffers as NNNNN_<source>_<how>.bin. services/runtime-dump.cjs reads it.
#include <windows.h>
#include <tlhelp32.h>
#include <stdio.h>
#include <string>
#include <vector>
#include <map>
#include <set>
#include "minhook/include/MinHook.h"

namespace {
HMODULE Self;
wchar_t Out[1024];
CRITICAL_SECTION Gate;
DWORD Tls = TLS_OUT_OF_INDEXES;
volatile LONG Ready, Seq;
volatile DWORD ArmedUntil;          // tick until which heap allocations are watched (fast path check, no lock)
volatile LONG ArmMin, ArmMax;       // size window for allocations after the last tracked read
std::string LastSource;             // source name for the armed window

const DWORD MaxRegion = 48u << 20, MinRegion = 96;
const DWORD WatchMs = 8000;

typedef ULONG(NTAPI *Crc32Fn)(ULONG, const void *, ULONG);
Crc32Fn Crc32;

struct Guard { bool was; Guard() { was = TlsGetValue(Tls) != NULL; TlsSetValue(Tls, (void *)1); } ~Guard() { if (!was) TlsSetValue(Tls, NULL); } };
bool Inside() { return Tls == TLS_OUT_OF_INDEXES || TlsGetValue(Tls) != NULL; }

std::string Utf8(const std::wstring &s) {
 int n = WideCharToMultiByte(CP_UTF8, 0, s.c_str(), (int)s.size(), NULL, 0, NULL, NULL);
 std::string r(n, '\0');
 if (n) WideCharToMultiByte(CP_UTF8, 0, s.c_str(), (int)s.size(), &r[0], n, NULL, NULL);
 return r;
}
std::wstring Lower(std::wstring s) { for (auto &c : s) if (c >= L'A' && c <= L'Z') c = (wchar_t)(c + 32); return s; }
void Append(const wchar_t *file, const std::string &line, DWORD cap) {
 std::wstring path = std::wstring(Out) + file;
 HANDLE h = CreateFileW(path.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_ALWAYS, 0, NULL);
 if (h == INVALID_HANDLE_VALUE) return;
 if (GetFileSize(h, NULL) < cap) { DWORD w; WriteFile(h, line.data(), (DWORD)line.size(), &w, NULL); }
 CloseHandle(h);
}
void Log(const std::string &line) {
 SYSTEMTIME t; GetLocalTime(&t);
 char stamp[32]; sprintf_s(stamp, "%02d:%02d:%02d.%03d ", t.wHour, t.wMinute, t.wSecond, t.wMilliseconds);
 Append(L"dump.log", stamp + line + "\r\n", 1 << 20);
}
bool WriteWhole(const std::wstring &path, const void *data, DWORD size) {
 std::wstring tmp = path + L".tmp";
 HANDLE h = CreateFileW(tmp.c_str(), GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, 0, NULL);
 if (h == INVALID_HANDLE_VALUE) return false;
 DWORD w = 0; BOOL ok = WriteFile(h, data, size, &w, NULL) && w == size;
 CloseHandle(h);
 if (!ok || !MoveFileExW(tmp.c_str(), path.c_str(), MOVEFILE_REPLACE_EXISTING)) { DeleteFileW(tmp.c_str()); return false; }
 return true;
}
std::string Json(const std::string &s) {
 std::string r = "\"";
 for (unsigned char c : s) {
  if (c == '"' || c == '\\') { r += '\\'; r += (char)c; }
  else if (c < 0x20) { char b[8]; sprintf_s(b, "\\u%04x", c); r += b; }
  else r += (char)c;
 }
 return r + "\"";
}

// ---- text detection ---------------------------------------------------------------------------------------------
// Counts CJK characters per encoding; the best one wins. Kana (or, for GBK, common characters) are counted apart.
struct Score { const char *enc; DWORD cjk, kana; double ratio; };
// Only runs of consecutive CJK characters count (4+, or 6+ for UTF-16): random or cipher bytes form valid double-byte
// pairs often, but almost never long unbroken runs of them.
// The most frequent GB2312 code points of Chinese prose (punctuation and 的一是不了人我在有他这你们来说个上着也就到): real text
// is full of them, high-byte noise that happens to land in the GB2312 rows is not.
bool Common(unsigned c) {
 static const unsigned list[] = { 0xA1A3, 0xA3AC, 0xA1A2, 0xA1B8, 0xA1B9, 0xA1AD, 0xA3A1, 0xA3BF, 0xA1B0, 0xA1B1, 0xB5C4, 0xD2BB, 0xCAC7, 0xB2BB, 0xC1CB, 0xC8CB,
  0xCED2, 0xD4DA, 0xD3D0, 0xCBFB, 0xD5E2, 0xC4E3, 0xC3C7, 0xC0B4, 0xCBB5, 0xB8F6, 0xC9CF, 0xD7C5, 0xD2B2, 0xBECD, 0xB5BD, 0xC4C7, 0xC4FA, 0xCBFD, 0xBAC3, 0xC3B4, 0xC3BB, 0xC1CB, 0xD6AE, 0xD2AA };
 for (unsigned x : list) if (x == c) return true;
 return false;
}
struct Run { DWORD total, kana, run, runKana, need; void Hit(bool k) { run++; if (k) runKana++; } void Break() { if (run >= need) { total += run; kana += runKana; } run = runKana = 0; } };
Score Classify(const unsigned char *p, DWORD n) {
 Score best = { "", 0, 0, 0 };
 Run sj = { 0, 0, 0, 0, 4 }, gb = { 0, 0, 0, 0, 4 }, u8 = { 0, 0, 0, 0, 4 }, u16 = { 0, 0, 0, 0, 6 };
 for (DWORD i = 0; i + 1 < n; ) { // Shift-JIS: punctuation, kana, kanji
  unsigned char a = p[i], b = p[i + 1];
  bool lead = (a >= 0x81 && a <= 0x9F) || (a >= 0xE0 && a <= 0xEA);
  if (lead && ((b >= 0x40 && b <= 0x7E) || (b >= 0x80 && b <= 0xFC))) {
   sj.Hit((a == 0x82 && b >= 0x9F && b <= 0xF1) || (a == 0x83 && b >= 0x40 && b <= 0x96));
   i += 2;
  } else { sj.Break(); i++; }
 }
 sj.Break();
 for (DWORD i = 0; i + 1 < n; ) { // GBK (GB2312 rows: punctuation, kana, hanzi)
  unsigned char a = p[i], b = p[i + 1];
  if (a >= 0xA1 && a <= 0xF7 && b >= 0xA1 && b <= 0xFE) { gb.Hit(Common((a << 8) | b)); i += 2; }
  else { gb.Break(); i++; }
 }
 gb.Break();
 for (DWORD i = 0; i + 2 < n; ) { // UTF-8 three-byte CJK (U+3000..U+9FFF, U+FF00..U+FFEF)
  unsigned char a = p[i];
  if (((a >= 0xE3 && a <= 0xE9) || a == 0xEF) && (p[i + 1] & 0xC0) == 0x80 && (p[i + 2] & 0xC0) == 0x80) {
   unsigned cp = ((a & 0x0F) << 12) | ((p[i + 1] & 0x3F) << 6) | (p[i + 2] & 0x3F);
   if ((cp >= 0x3000 && cp <= 0x9FFF) || (cp >= 0xFF00 && cp <= 0xFFEF)) { u8.Hit(cp >= 0x3040 && cp <= 0x30FF); i += 3; continue; }
  }
  u8.Break(); i++;
 }
 u8.Break();
 for (DWORD i = 0; i + 1 < n; i += 2) { // UTF-16LE
  unsigned cp = p[i] | (p[i + 1] << 8);
  if ((cp >= 0x3000 && cp <= 0x9FFF) || (cp >= 0xFF00 && cp <= 0xFFEF)) u16.Hit(cp >= 0x3040 && cp <= 0x30FF); else u16.Break();
 }
 u16.Break();
 struct { const char *e; DWORD c, k, width; } all[] = { { "utf-16le", u16.total, u16.kana, 2 }, { "utf-8", u8.total, u8.kana, 3 }, { "shift_jis", sj.total, sj.kana, 2 }, { "gbk", gb.total, gb.kana, 2 } };
 for (auto &a : all) {
  double r = n ? (double)a.c * a.width / n : 0;
  // GBK reads almost any Shift-JIS kanji text too; a Shift-JIS buffer with kana is Japanese.
  if (!strcmp(a.e, "gbk") && (sj.kana * 8 > sj.total || a.k * 20 < a.c)) continue;
  if (!strcmp(a.e, "shift_jis") && a.k * 10 < a.c) continue; // Japanese prose is never kana-free
  if (r > best.ratio) { best.enc = a.e; best.cjk = a.c; best.kana = a.k; best.ratio = r; }
 }
 return best;
}
bool Texty(const Score &s) { return s.cjk >= 24 && s.ratio >= 0.08; }

// ---- saving -------------------------------------------------------------------------------------------------------
std::set<ULONG> Saved; // CRC of every saved buffer
std::string Safe(const std::string &name) {
 std::string base = name;
 size_t s = base.find_last_of("\\/"); if (s != std::string::npos) base = base.substr(s + 1);
 std::string r;
 for (char c : base) r += (c == ':' || c == '*' || c == '?' || c == '"' || c == '<' || c == '>' || c == '|') ? '_' : c;
 if (r.size() > 60) r = r.substr(0, 60);
 return r.empty() ? "mem" : r;
}
// Copies [p, p+n) under a guard; NULL if any page is gone.
unsigned char *Copy(const void *p, DWORD n) {
 unsigned char *buf = (unsigned char *)malloc(n);
 if (!buf) return NULL;
 __try { memcpy(buf, p, n); } __except (EXCEPTION_EXECUTE_HANDLER) { free(buf); return NULL; }
 return buf;
}
void Save(const std::string &source, const char *how, const unsigned char *data, DWORD n, ULONGLONG offset) {
 Score s = Classify(data, n);
 if (!Texty(s)) return;
 ULONG crc = Crc32 ? Crc32(0, data, n) : n;
 EnterCriticalSection(&Gate);
 bool fresh = Saved.insert(crc).second;
 LeaveCriticalSection(&Gate);
 if (!fresh) return;
 LONG seq = InterlockedIncrement(&Seq);
 char name[160]; sprintf_s(name, "%05ld_%s_%s.bin", seq, Safe(source).c_str(), how);
 std::wstring wname; { int m = MultiByteToWideChar(CP_UTF8, 0, name, -1, NULL, 0); wname.resize(m); MultiByteToWideChar(CP_UTF8, 0, name, -1, &wname[0], m); wname.resize(m - 1); }
 if (!WriteWhole(std::wstring(Out) + wname, data, n)) return;
 char line[1024];
 sprintf_s(line, "{\"seq\":%ld,\"file\":%s,\"source\":%s,\"how\":\"%s\",\"offset\":%llu,\"size\":%lu,\"enc\":\"%s\",\"cjk\":%lu,\"kana\":%lu,\"ratio\":%.3f,\"crc\":\"%08lx\",\"tick\":%lu}\n",
  seq, Json(name).c_str(), Json(source).c_str(), how, offset, n, s.enc, s.cjk, s.kana, s.ratio, crc, GetTickCount());
 Append(L"index.jsonl", line, 64u << 20);
}

// ---- watched regions -----------------------------------------------------------------------------------------------
struct Region { const void *p; DWORD n; ULONG raw, last; DWORD born, seen; std::string source; ULONGLONG offset; const char *how; int stable; };
std::vector<Region> Regions;
void Watch(const void *p, DWORD n, ULONG raw, const std::string &source, ULONGLONG offset, const char *how) {
 if (n < MinRegion || n > MaxRegion) return;
 EnterCriticalSection(&Gate);
 for (auto &r : Regions) if (r.p == p) { r = Region{ p, n, raw, raw, GetTickCount(), 0, source, offset, how, 0 }; LeaveCriticalSection(&Gate); return; }
 if (Regions.size() < 512) Regions.push_back(Region{ p, n, raw, raw, GetTickCount(), 0, source, offset, how, 0 });
 LeaveCriticalSection(&Gate);
}
// One pass: each region that changed since it was read and then held still for a poll is checked as text.
void Poll() {
 std::vector<Region> now;
 EnterCriticalSection(&Gate); now = Regions; LeaveCriticalSection(&Gate);
 DWORD tick = GetTickCount();
 std::vector<const void *> drop;
 for (auto &r : now) {
  unsigned char *buf = Copy(r.p, r.n);
  if (!buf) { drop.push_back(r.p); continue; }
  ULONG crc = Crc32 ? Crc32(0, buf, r.n) : 0;
  bool changed = crc != r.raw, still = crc == r.last;
  if (changed && still) { Save(r.source, r.how, buf, r.n, r.offset); drop.push_back(r.p); }
  free(buf);
  EnterCriticalSection(&Gate);
  for (auto &q : Regions) if (q.p == r.p) q.last = crc;
  LeaveCriticalSection(&Gate);
  if (tick - r.born > WatchMs) drop.push_back(r.p);
 }
 if (drop.empty()) return;
 EnterCriticalSection(&Gate);
 for (size_t i = 0; i < Regions.size(); ) {
  bool d = false; for (auto p : drop) if (Regions[i].p == p) d = true;
  if (d) { Regions[i] = Regions.back(); Regions.pop_back(); } else i++;
 }
 LeaveCriticalSection(&Gate);
}

// ---- file names -------------------------------------------------------------------------------------------------------
std::map<HANDLE, std::string> Files;   // tracked file handles
std::map<HANDLE, std::string> Sections; // file-mapping handles of tracked files
bool Skipped(const std::wstring &path) {
 std::wstring l = Lower(path);
 if (l.size() < 3 || l.compare(0, 4, L"\\\\.\\") == 0) return true;
 static wchar_t win[MAX_PATH]; static int winLen = -1;
 if (winLen < 0) { winLen = (int)GetWindowsDirectoryW(win, MAX_PATH); for (int i = 0; i < winLen; i++) if (win[i] >= L'A' && win[i] <= L'Z') win[i] = (wchar_t)(win[i] + 32); }
 if (winLen > 0 && l.compare(0, winLen, win) == 0) return true;
 if (l.find(L"\\cache\\runtime-dump\\") != std::wstring::npos) return true;
 size_t dot = l.find_last_of(L'.'), slash = l.find_last_of(L"\\/");
 if (dot == std::wstring::npos || (slash != std::wstring::npos && dot < slash)) return false;
 std::wstring ext = l.substr(dot + 1);
 static const wchar_t *media[] = { L"png", L"jpg", L"jpeg", L"bmp", L"gif", L"webp", L"tlg", L"ogg", L"wav", L"mp3", L"opus", L"m4a", L"flac", L"wma",
  L"mp4", L"wmv", L"avi", L"mpg", L"webm", L"mkv", L"ttf", L"otf", L"ttc", L"fon", L"dll", L"exe", L"sys", L"ico", L"cur", L"ani", L"log", L"mui", L"nls", L"manifest" };
 for (auto m : media) if (ext == m) return true;
 return false;
}

typedef HANDLE(WINAPI *CreateFileWFn)(LPCWSTR, DWORD, DWORD, LPSECURITY_ATTRIBUTES, DWORD, DWORD, HANDLE);
typedef HANDLE(WINAPI *CreateFileAFn)(LPCSTR, DWORD, DWORD, LPSECURITY_ATTRIBUTES, DWORD, DWORD, HANDLE);
typedef BOOL(WINAPI *ReadFileFn)(HANDLE, LPVOID, DWORD, LPDWORD, LPOVERLAPPED);
typedef BOOL(WINAPI *CloseHandleFn)(HANDLE);
typedef HANDLE(WINAPI *CreateMappingWFn)(HANDLE, LPSECURITY_ATTRIBUTES, DWORD, DWORD, DWORD, LPCWSTR);
typedef LPVOID(WINAPI *MapViewFn)(HANDLE, DWORD, DWORD, DWORD, SIZE_T);
typedef PVOID(NTAPI *AllocFn)(PVOID, ULONG, SIZE_T);
typedef LONG(NTAPI *DecompressFn)(USHORT, PUCHAR, ULONG, PUCHAR, ULONG, PULONG);
typedef LONG(NTAPI *DecompressExFn)(USHORT, PUCHAR, ULONG, PUCHAR, ULONG, PULONG, PVOID);
typedef int(__cdecl *InflateFn)(void *, int);
typedef int(__cdecl *UncompressFn)(unsigned char *, unsigned long *, const unsigned char *, unsigned long);
CreateFileWFn OCreateFileW; CreateFileAFn OCreateFileA; ReadFileFn OReadFile; CloseHandleFn OCloseHandle;
CreateMappingWFn OCreateMappingW; MapViewFn OMapView; AllocFn OAlloc; DecompressFn ODecompress; DecompressExFn ODecompressEx;

void Track(HANDLE h, const std::wstring &path) {
 if (h == INVALID_HANDLE_VALUE || !h || Skipped(path)) return;
 std::string name = Utf8(path);
 EnterCriticalSection(&Gate); Files[h] = name; LeaveCriticalSection(&Gate);
}
HANDLE WINAPI HCreateFileW(LPCWSTR n, DWORD a, DWORD s, LPSECURITY_ATTRIBUTES sa, DWORD c, DWORD f, HANDLE t) {
 HANDLE h = OCreateFileW(n, a, s, sa, c, f, t);
 if (Ready && !Inside() && n && (a & GENERIC_READ) && !(a & GENERIC_WRITE)) { Guard g; DWORD e = GetLastError(); Track(h, n); SetLastError(e); }
 return h;
}
HANDLE WINAPI HCreateFileA(LPCSTR n, DWORD a, DWORD s, LPSECURITY_ATTRIBUTES sa, DWORD c, DWORD f, HANDLE t) {
 HANDLE h = OCreateFileA(n, a, s, sa, c, f, t);
 if (Ready && !Inside() && n && (a & GENERIC_READ) && !(a & GENERIC_WRITE)) {
  Guard g; DWORD e = GetLastError();
  int m = MultiByteToWideChar(CP_ACP, 0, n, -1, NULL, 0);
  if (m > 0) { std::wstring w(m, L'\0'); MultiByteToWideChar(CP_ACP, 0, n, -1, &w[0], m); w.resize(m - 1); Track(h, w); }
  SetLastError(e);
 }
 return h;
}
void Arm(DWORD n, const std::string &source) {
 EnterCriticalSection(&Gate); LastSource = source; LeaveCriticalSection(&Gate);
 ArmMin = (LONG)(n - n / 8); ArmMax = (LONG)((n > MaxRegion / 4 ? MaxRegion : n * 4) + 64);
 ArmedUntil = GetTickCount() + 1500;
}
BOOL WINAPI HReadFile(HANDLE h, LPVOID buf, DWORD want, LPDWORD got, LPOVERLAPPED ov) {
 BOOL ok = OReadFile(h, buf, want, got, ov);
 if (!ok || !Ready || Inside() || ov || !got || *got < MinRegion) return ok;
 Guard g; DWORD e = GetLastError();
 std::string name; bool tracked = false;
 EnterCriticalSection(&Gate); auto it = Files.find(h); if (it != Files.end()) { name = it->second; tracked = true; } LeaveCriticalSection(&Gate);
 if (tracked) {
  DWORD n = *got;
  LARGE_INTEGER zero, pos; zero.QuadPart = 0; pos.QuadPart = 0;
  SetFilePointerEx(h, zero, &pos, FILE_CURRENT);
  ULONGLONG offset = (ULONGLONG)pos.QuadPart - n;
  ULONG raw = Crc32 ? Crc32(0, buf, n) : 0;
  Save(name, "plain", (const unsigned char *)buf, n, offset); // loose text files that were never encrypted
  Watch(buf, n, raw, name, offset, "inplace");
  Arm(n, name);
 }
 SetLastError(e);
 return ok;
}
BOOL WINAPI HCloseHandle(HANDLE h) {
 if (Ready && !Inside()) { Guard g; EnterCriticalSection(&Gate); Files.erase(h); Sections.erase(h); LeaveCriticalSection(&Gate); }
 return OCloseHandle(h);
}
HANDLE WINAPI HCreateMappingW(HANDLE f, LPSECURITY_ATTRIBUTES sa, DWORD prot, DWORD hi, DWORD lo, LPCWSTR n) {
 HANDLE h = OCreateMappingW(f, sa, prot, hi, lo, n);
 if (h && Ready && !Inside()) {
  Guard g; DWORD e = GetLastError();
  EnterCriticalSection(&Gate); auto it = Files.find(f); if (it != Files.end()) Sections[h] = it->second; LeaveCriticalSection(&Gate);
  SetLastError(e);
 }
 return h;
}
LPVOID WINAPI HMapView(HANDLE s, DWORD a, DWORD hi, DWORD lo, SIZE_T n) {
 LPVOID p = OMapView(s, a, hi, lo, n);
 if (p && Ready && !Inside()) {
  Guard g; DWORD e = GetLastError();
  std::string name; bool tracked = false;
  EnterCriticalSection(&Gate); auto it = Sections.find(s); if (it != Sections.end()) { name = it->second; tracked = true; } LeaveCriticalSection(&Gate);
  if (tracked) {
   MEMORY_BASIC_INFORMATION mi; SIZE_T size = n;
   if (!size && VirtualQuery(p, &mi, sizeof mi)) size = mi.RegionSize;
   DWORD m = (DWORD)(size > MaxRegion ? MaxRegion : size);
   unsigned char *copy = Copy(p, m);
   if (copy) {
    ULONGLONG offset = ((ULONGLONG)hi << 32) | lo;
    Save(name, "plain", copy, m, offset);
    // A mapped view the game can write to (copy-on-write or read-write) may be decrypted in place.
    if (a & (FILE_MAP_WRITE | FILE_MAP_COPY)) Watch(p, m, Crc32 ? Crc32(0, copy, m) : 0, name, offset, "inplace");
    Arm(m, name);
    free(copy);
   }
  }
  SetLastError(e);
 }
 return p;
}
PVOID NTAPI HAlloc(PVOID heap, ULONG flags, SIZE_T n) {
 PVOID p = OAlloc(heap, flags, n);
 if (p && ArmedUntil && (LONG)n >= ArmMin && (LONG)n <= ArmMax && Ready && !Inside() && (LONG)(GetTickCount() - ArmedUntil) < 0) {
  Guard g;
  std::string source; EnterCriticalSection(&Gate); source = LastSource; LeaveCriticalSection(&Gate);
  // The new buffer still holds whatever the heap left there; it is saved once it has changed and settled.
  Watch(p, (DWORD)n, Crc32 ? Crc32(0, p, (ULONG)n) : 0, source, 0, "alloc");
 }
 return p;
}
void Output(const char *how, const unsigned char *p, DWORD n) {
 if (!p || n < MinRegion) return;
 std::string source; EnterCriticalSection(&Gate); source = LastSource; LeaveCriticalSection(&Gate);
 unsigned char *copy = Copy(p, n > MaxRegion ? MaxRegion : n);
 if (copy) { Save(source.empty() ? "memory" : source, how, copy, n > MaxRegion ? MaxRegion : n, 0); free(copy); }
}
LONG NTAPI HDecompress(USHORT f, PUCHAR out, ULONG outSize, PUCHAR in, ULONG inSize, PULONG done) {
 LONG r = ODecompress(f, out, outSize, in, inSize, done);
 if (r >= 0 && done && Ready && !Inside()) { Guard g; Output("rtl", out, *done); }
 return r;
}
LONG NTAPI HDecompressEx(USHORT f, PUCHAR out, ULONG outSize, PUCHAR in, ULONG inSize, PULONG done, PVOID ws) {
 LONG r = ODecompressEx(f, out, outSize, in, inSize, done, ws);
 if (r >= 0 && done && Ready && !Inside()) { Guard g; Output("rtl", out, *done); }
 return r;
}

// zlib: the z_stream starts next_in, avail_in, total_in, next_out, avail_out (pointer-sized fields in between).
struct ZHead { unsigned char *next_in; unsigned avail_in; unsigned long total_in; unsigned char *next_out; unsigned avail_out; };
std::map<void *, std::vector<unsigned char>> Streams;
const int ZSlots = 8;
InflateFn ZInflate[ZSlots]; UncompressFn ZUncompress[ZSlots];
bool ZPeek(void *strm, unsigned char **out, unsigned *room) {
 __try { ZHead *z = (ZHead *)strm; *out = z->next_out; *room = z->avail_out; return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
template <int K> int __cdecl HInflate(void *strm, int flush) {
 unsigned char *before = NULL, *after = NULL; unsigned room = 0;
 ZPeek(strm, &before, &room);
 int r = ZInflate[K](strm, flush);
 if (Ready && !Inside() && before && (r == 0 || r == 1)) {
  Guard g;
  unsigned left = room;
  ZPeek(strm, &after, &left);
  DWORD n = room >= left ? room - left : 0;
  unsigned char *part = n ? Copy(before, n) : NULL;
  std::vector<unsigned char> whole;
  EnterCriticalSection(&Gate);
  auto &acc = Streams[strm];
  if (part && acc.size() + n <= MaxRegion) acc.insert(acc.end(), part, part + n);
  if (r == 1) { whole.swap(acc); Streams.erase(strm); }
  LeaveCriticalSection(&Gate);
  if (part) free(part);
  if (!whole.empty()) Output("inflate", whole.data(), (DWORD)whole.size());
 }
 return r;
}
template <int K> int __cdecl HUncompress(unsigned char *d, unsigned long *dl, const unsigned char *s, unsigned long sl) {
 int r = ZUncompress[K](d, dl, s, sl);
 if (r == 0 && Ready && !Inside() && dl) { Guard g; Output("inflate", d, (DWORD)*dl); }
 return r;
}
typedef int(__cdecl *InflateHook)(void *, int);
typedef int(__cdecl *UncompressHook)(unsigned char *, unsigned long *, const unsigned char *, unsigned long);
InflateHook InflateHooks[ZSlots] = { HInflate<0>, HInflate<1>, HInflate<2>, HInflate<3>, HInflate<4>, HInflate<5>, HInflate<6>, HInflate<7> };
UncompressHook UncompressHooks[ZSlots] = { HUncompress<0>, HUncompress<1>, HUncompress<2>, HUncompress<3>, HUncompress<4>, HUncompress<5>, HUncompress<6>, HUncompress<7> };
std::set<HMODULE> ZSeen; int ZUsed;
// Modules that export zlib (zlib1.dll, a game's own DLL, ...). Checked again as the game loads more modules.
void HookZlib() {
 HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, GetCurrentProcessId());
 if (snap == INVALID_HANDLE_VALUE) return;
 MODULEENTRY32W m; m.dwSize = sizeof m;
 for (BOOL more = Module32FirstW(snap, &m); more && ZUsed < ZSlots; more = Module32NextW(snap, &m)) {
  if (m.hModule == Self || !ZSeen.insert(m.hModule).second) continue;
  void *inf = (void *)GetProcAddress(m.hModule, "inflate"), *unc = (void *)GetProcAddress(m.hModule, "uncompress");
  if (!inf && !unc) continue;
  int k = ZUsed++;
  bool any = false;
  if (inf && MH_CreateHook(inf, (void *)InflateHooks[k], (void **)&ZInflate[k]) == MH_OK && MH_EnableHook(inf) == MH_OK) any = true;
  if (unc && MH_CreateHook(unc, (void *)UncompressHooks[k], (void **)&ZUncompress[k]) == MH_OK && MH_EnableHook(unc) == MH_OK) any = true;
  Log(std::string("zlib exports in ") + Utf8(m.szModule) + (any ? " hooked" : " not hooked"));
 }
 CloseHandle(snap);
}

bool Hook(const wchar_t *module, const char *name, void *detour, void **original) {
 HMODULE m = GetModuleHandleW(module);
 void *fn = m ? (void *)GetProcAddress(m, name) : NULL;
 if (!fn) return false;
 bool ok = MH_CreateHook(fn, detour, original) == MH_OK && MH_EnableHook(fn) == MH_OK;
 Log(std::string(ok ? "hooked " : "could not hook ") + name);
 return ok;
}

DWORD WINAPI Run(void *) {
 TlsSetValue(Tls, (void *)1); // this thread's own file and heap use is never watched
 wchar_t self[1024], game[1024], root[1024];
 if (!GetModuleFileNameW(Self, self, 1024) || !GetModuleFileNameW(NULL, game, 1024)) return 0;
 for (int k = 0; k < 2; k++) { wchar_t *s = wcsrchr(self, L'\\'); if (!s) return 0; *s = 0; }
 wchar_t *g = wcsrchr(game, L'\\'); if (!g) return 0; *g = 0;
 unsigned hash = 2166136261u;
 for (wchar_t *p = game; *p; p++) { wchar_t c = *p; if (c >= L'A' && c <= L'Z') c = (wchar_t)(c + 32); hash = (hash ^ (unsigned)c) * 16777619u; }
 if (!GetEnvironmentVariableW(L"MEGULIT_RUNTIME_DUMP", root, 1024)) {
  swprintf_s(root, L"%s\\cache", self); CreateDirectoryW(root, NULL);
  swprintf_s(root, L"%s\\cache\\runtime-dump", self);
 }
 CreateDirectoryW(root, NULL);
 swprintf_s(Out, L"%s\\%08x\\", root, hash);
 wchar_t v[8]; bool forced = GetEnvironmentVariableW(L"MEGULIT_RUNTIME_DUMP_ON", v, 8) > 0 && v[0] == L'1';
 if (!forced && GetFileAttributesW((std::wstring(Out) + L"on").c_str()) == INVALID_FILE_ATTRIBUTES) return 0;
 CreateDirectoryW(Out, NULL);
 std::string gameName = Utf8(game);
 WriteWhole(std::wstring(Out) + L"game.txt", gameName.data(), (DWORD)gameName.size());
 Crc32 = (Crc32Fn)GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "RtlComputeCrc32");
 if (MH_Initialize() != MH_OK) { Log("MinHook did not start"); return 0; }
 bool any = false;
 const wchar_t *k32 = GetModuleHandleW(L"kernelbase.dll") ? L"kernelbase.dll" : L"kernel32.dll";
 any |= Hook(k32, "CreateFileW", (void *)HCreateFileW, (void **)&OCreateFileW);
 any |= Hook(k32, "CreateFileA", (void *)HCreateFileA, (void **)&OCreateFileA);
 any |= Hook(k32, "ReadFile", (void *)HReadFile, (void **)&OReadFile);
 any |= Hook(k32, "CloseHandle", (void *)HCloseHandle, (void **)&OCloseHandle);
 any |= Hook(k32, "CreateFileMappingW", (void *)HCreateMappingW, (void **)&OCreateMappingW);
 any |= Hook(k32, "MapViewOfFile", (void *)HMapView, (void **)&OMapView);
 Hook(L"ntdll.dll", "RtlAllocateHeap", (void *)HAlloc, (void **)&OAlloc);
 Hook(L"ntdll.dll", "RtlDecompressBuffer", (void *)HDecompress, (void **)&ODecompress);
 Hook(L"ntdll.dll", "RtlDecompressBufferEx", (void *)HDecompressEx, (void **)&ODecompressEx);
 HookZlib();
 if (!any) { Log("no file hooks; nothing to watch"); return 0; }
 InterlockedExchange(&Ready, 1);
 WriteWhole(std::wstring(Out) + L"ready.txt", "1", 1);
 Log("watching " + gameName);
 for (DWORD n = 0;; n++) {
  Sleep(120);
  Poll();
  if (n % 20 == 0 && ZUsed < ZSlots) HookZlib();
 }
}
}

BOOL WINAPI DllMain(HINSTANCE h, DWORD reason, void *) {
 if (reason == DLL_PROCESS_ATTACH) {
  Self = h; DisableThreadLibraryCalls(h);
  InitializeCriticalSection(&Gate);
  Tls = TlsAlloc();
  HMODULE pin; GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_PIN, (LPCWSTR)&DllMain, &pin);
  HANDLE t = CreateThread(NULL, 0, Run, NULL, 0, NULL);
  if (t) CloseHandle(t);
 }
 return TRUE;
}
