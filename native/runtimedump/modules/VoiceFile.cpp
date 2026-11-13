// SPDX-License-Identifier: GPL-3.0-or-later
// Voice files read by the game, a module of MeguLitDump32/64.dll (modules/modules.h; the audio-API side is modules/Voice.cpp).
// Most engines keep their voices as Ogg/Opus/WAV/... inside an archive, encrypted or not; to play a line's voice the game
// reads it (ReadFile) and, if encrypted, decrypts it in place. A read buffer that is, or within 3 s becomes, a voice file by
// its magic (Ogg Vorbis/Opus, WAV, AT9, BGI bw, CRI HCA incl. masked header, CRI ADX, FSB5, ID3 MP3; table after GARbro and
// vgmstream, facts only) is saved as that file, original quality: <out>\voice\fNNNNN.<fmt>, one line in
// <out>\voice\events.jsonl with the time it was read (same format as Voice.cpp's clips, api "file").
// Hooks: kernel32 CreateFileW/A and ReadFile (the kernel32 entry points, so the dump's kernelbase hooks stay untouched).
// Cold tool, no switch: a fault inside a hook switches only this module's hooks off for the run (voice\disabled.txt).
// Not covered: a voice decrypted into a fresh buffer, and a file read in chunks (only the first chunk carries the magic);
// the audio-API side records those as PCM.
#include <windows.h>
#include <stdio.h>
#include <string>
#include <vector>
#include <map>
#include "../minhook/include/MinHook.h"

namespace voicefile {
wchar_t Dir[1024], OutDir[1024];
CRITICAL_SECTION Gate;
DWORD Tls = TLS_OUT_OF_INDEXES;
volatile LONG On, Seq, Faults;
volatile LONGLONG Spent, Budget;
const DWORD IdleMs = 1200, MaxClipMs = 90000, MinClipBytes = 2048;

// Marks this thread as inside a hook, so the harvest's own calls are never watched (no destructor: __try needs none).
// All three keep the game's last error: TlsGetValue clears it, and engines read it right after the call we wrap.
ULONGLONG Enter() { DWORD e = GetLastError(); bool was = TlsGetValue(Tls) != NULL; TlsSetValue(Tls, (void *)1); SetLastError(e); return ((ULONGLONG)was << 32) | e; }
void Leave(ULONGLONG w) { if (!(w >> 32)) TlsSetValue(Tls, NULL); SetLastError((DWORD)w); }
bool Busy() { DWORD e = GetLastError(); bool r = Tls == TLS_OUT_OF_INDEXES || TlsGetValue(Tls) != NULL; SetLastError(e); return r; }
bool Live() { return On && !Busy(); }

ULONGLONG NowMs() { FILETIME f; GetSystemTimeAsFileTime(&f); ULARGE_INTEGER u; u.LowPart = f.dwLowDateTime; u.HighPart = f.dwHighDateTime; return u.QuadPart / 10000 - 11644473600000ULL; }
std::string Utf8(const wchar_t *s, int n = -1) {
 int m = WideCharToMultiByte(CP_UTF8, 0, s, n, NULL, 0, NULL, NULL); if (m <= 0) return "";
 std::string r(m, '\0'); WideCharToMultiByte(CP_UTF8, 0, s, n, &r[0], m, NULL, NULL); if (n < 0) r.resize(m - 1); return r;
}
std::string Json(const std::string &s) {
 std::string r = "\"";
 for (unsigned char c : s) { if (c == '"' || c == '\\') { r += '\\'; r += (char)c; } else if (c < 0x20) { char b[8]; sprintf_s(b, "\\u%04x", c); r += b; } else r += (char)c; }
 return r + "\"";
}
void Append(const wchar_t *file, const std::string &line) {
 std::wstring p = std::wstring(Dir) + file;
 HANDLE h = CreateFileW(p.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_ALWAYS, 0, NULL);
 if (h == INVALID_HANDLE_VALUE) return;
 DWORD w; WriteFile(h, line.data(), (DWORD)line.size(), &w, NULL); CloseHandle(h);
}
bool Put(const std::wstring &name, const void *a, DWORD an, const void *b, DWORD bn) {
 std::wstring p = std::wstring(Dir) + name, tmp = p + L".tmp";
 HANDLE h = CreateFileW(tmp.c_str(), GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, 0, NULL);
 if (h == INVALID_HANDLE_VALUE) return false;
 DWORD w1 = 0, w2 = 0; BOOL ok = WriteFile(h, a, an, &w1, NULL) && (!bn || WriteFile(h, b, bn, &w2, NULL));
 CloseHandle(h);
 if (!ok || !MoveFileExW(tmp.c_str(), p.c_str(), MOVEFILE_REPLACE_EXISTING)) { DeleteFileW(tmp.c_str()); return false; }
 return true;
}
void *Hooked[48]; volatile LONG HookedN;
bool Hk(void *t, void *d, void **o) {
 if (!t || MH_CreateHook(t, d, o) != MH_OK) return false;
 if (MH_EnableHook(t) != MH_OK) { MH_RemoveHook(t); return false; }
 LONG i = InterlockedIncrement(&HookedN) - 1; if (i < 48) Hooked[i] = t;
 return true;
}
// A fault inside a hook: this module stops for the run (its own hooks only; the dump keeps going) and leaves a note.
void Fault(const char *where) {
 if (InterlockedExchange(&On, 0) == 0) return;
 InterlockedIncrement(&Faults);
 char line[160]; sprintf_s(line, "fault in %s at %llu\r\n", where, NowMs());
 Append(L"disabled.txt", line);
 for (LONG i = 0; i < HookedN && i < 48; i++) MH_DisableHook(Hooked[i]);
}
// Copies game memory without ever faulting in the game: every page must be committed, readable and not a guard page,
// and the copy goes through ReadProcessMemory (a buffer freed meanwhile fails the call instead of raising).
bool Readable(const void *p, DWORD n) {
 const char *a = (const char *)p, *end = a + n;
 while (a < end) {
  MEMORY_BASIC_INFORMATION m; if (!VirtualQuery(a, &m, sizeof m) || m.State != MEM_COMMIT) return false;
  if (m.Protect & (PAGE_GUARD | PAGE_NOACCESS) || !(m.Protect & (PAGE_READONLY | PAGE_READWRITE | PAGE_WRITECOPY | PAGE_EXECUTE_READ | PAGE_EXECUTE_READWRITE | PAGE_EXECUTE_WRITECOPY))) return false;
  a = (const char *)m.BaseAddress + m.RegionSize;
 }
 return true;
}
bool Copy(std::vector<unsigned char> &to, const void *p, DWORD n) {
 if (!p || !n) return false;
 DWORD e = GetLastError();
 size_t at = to.size(); SIZE_T got = 0;
 bool ok = Readable(p, n);
 if (ok) { to.resize(at + n); ok = ReadProcessMemory(GetCurrentProcess(), p, &to[at], n, &got) && got == n; if (!ok) to.resize(at); }
 SetLastError(e);
 return ok;
}

typedef ULONG(NTAPI *Crc32Fn)(ULONG, const void *, ULONG);
Crc32Fn Crc32;
std::wstring LastName; ULONGLONG LastNameAt;
// ---- file reads --------------------------------------------------------------------------------------------------------
// Voice file magic (table: GARbro's format library, MIT, and vgmstream; facts, no code copied). "" = not a voice file.
bool At(const unsigned char *p, DWORD n, DWORD at, const char *s, DWORD k) { return n >= at + k && memcmp(p + at, s, k) == 0; }
const char *Sniff(const unsigned char *p, DWORD n) {
 if (n < 16) return "";
 if (At(p, n, 0, "OggS", 4) && p[4] == 0) return At(p, n, 0x1C, "OpusHead", 8) ? "opus" : "ogg";
 if (At(p, n, 0, "RIFF", 4) && At(p, n, 8, "WAVE", 4)) {
  if (n >= 0x3C && p[0x14] == 0xFE && p[0x15] == 0xFF && At(p, n, 0x2C, "\xD2\x42\xE1\x47\xBA\x36\x8D\x4D\x88\xFC\x61\x65\x4F\x8C\x83\x6C", 16)) return "at9";
  return "wav";
 }
 if (At(p, n, 4, "bw  ", 4)) return "bw";                       // BGI voice: header, then Ogg
 if (At(p, n, 0, "HCA\0", 4) || (p[0] == 0xC8 && p[1] == 0xC3 && p[2] == 0xC1 && p[3] == 0x80)) return "hca";
 if (p[0] == 0x80 && p[1] == 0x00) { DWORD o = (p[2] << 8) | p[3]; if (o >= 2 && o < n && At(p, n, o - 2, "(c)CRI", 6)) return "adx"; }
 if (At(p, n, 0, "FSB5", 4)) return "fsb5";
 if (At(p, n, 0, "ID3", 3) && p[3] <= 4) return "mp3";
 return "";
}
// File names: handle -> name for files opened for reading (outside Windows), and the last audio-looking name opened.
typedef HANDLE(WINAPI *CFWFn)(LPCWSTR, DWORD, DWORD, LPSECURITY_ATTRIBUTES, DWORD, DWORD, HANDLE);
typedef HANDLE(WINAPI *CFAFn)(LPCSTR, DWORD, DWORD, LPSECURITY_ATTRIBUTES, DWORD, DWORD, HANDLE);
typedef BOOL(WINAPI *ReadFn)(HANDLE, LPVOID, DWORD, LPDWORD, LPOVERLAPPED);
CFWFn OCFW; CFAFn OCFA; ReadFn ORead;
std::map<HANDLE, std::wstring> Names;
bool Audioish(const wchar_t *p) {
 const wchar_t *dot = wcsrchr(p, L'.'); if (!dot) return false;
 static const wchar_t *ext[] = { L".ogg", L".opus", L".wav", L".flac", L".mp3", L".m4a", L".at9", L".hca", L".adx", L".vag", L".wma", L".aac" };
 for (auto e : ext) if (!_wcsicmp(dot, e)) return true;
 return false;
}
void Opened(HANDLE h, const wchar_t *p) {
 if (!p || h == INVALID_HANDLE_VALUE || !h) return;
 wchar_t win[MAX_PATH]; UINT w = GetWindowsDirectoryW(win, MAX_PATH); if (w && !_wcsnicmp(p, win, w)) return;
 if (wcsstr(p, L"\\runtime-dump\\") || (OutDir[0] && !_wcsnicmp(p, OutDir, wcslen(OutDir)))) return; // never our own output
 EnterCriticalSection(&Gate);
 if (Names.size() > 4096) Names.clear();
 Names[h] = p;
 if (Audioish(p)) { LastName = p; LastNameAt = NowMs(); }
 LeaveCriticalSection(&Gate);
}
HANDLE WINAPI HCFW(LPCWSTR n, DWORD a, DWORD s, LPSECURITY_ATTRIBUTES sa, DWORD c, DWORD f, HANDLE t) {
 HANDLE h = OCFW(n, a, s, sa, c, f, t);
 if (Live() && n && !(a & GENERIC_WRITE)) { DWORD e = GetLastError(); ULONGLONG was = Enter(); __try { Opened(h, n); } __except (EXCEPTION_EXECUTE_HANDLER) { Fault("CreateFileW"); } Leave(was); SetLastError(e); }
 return h;
}
HANDLE WINAPI HCFA(LPCSTR n, DWORD a, DWORD s, LPSECURITY_ATTRIBUTES sa, DWORD c, DWORD f, HANDLE t) {
 HANDLE h = OCFA(n, a, s, sa, c, f, t);
 if (Live() && n && !(a & GENERIC_WRITE)) { DWORD e = GetLastError(); ULONGLONG was = Enter(); __try { wchar_t w[1024]; if (MultiByteToWideChar(CP_ACP, 0, n, -1, w, 1024)) Opened(h, w); } __except (EXCEPTION_EXECUTE_HANDLER) { Fault("CreateFileA"); } Leave(was); SetLastError(e); }
 return h;
}
// A read buffer watched for a few seconds: it may be decrypted in place into a voice file.
struct Read { const unsigned char *p; DWORD n; ULONG head; DWORD born; ULONGLONG at; ULONGLONG offset; std::wstring source; };
std::vector<Read> Reads;
const DWORD MaxVoiceFile = 8u << 20, ReadWatchMs = 3000;
std::map<ULONG, std::string> FileSaved;
// Saves a voice file seen in memory (under no lock; copies first).
void Keep(const unsigned char *p, DWORD n, const char *fmt, ULONGLONG at, ULONGLONG offset, const std::wstring &source, const char *how) {
 std::vector<unsigned char> data; if (!Copy(data, p, n)) return;
 ULONG crc = Crc32 ? Crc32(0, data.data(), n) : n;
 std::string file;
 EnterCriticalSection(&Gate); auto f = FileSaved.find(crc); if (f != FileSaved.end()) file = f->second; LeaveCriticalSection(&Gate);
 if (file.empty()) {
  if (Spent + (LONGLONG)n > Budget) return;
  LONG seq = InterlockedIncrement(&Seq);
  char name[64]; wchar_t wname[64]; sprintf_s(name, "f%05ld.%s", seq, fmt); swprintf_s(wname, L"f%05ld.%hs", seq, fmt);
  if (!Put(wname, data.data(), n, NULL, 0)) return;
  file = name; Spent += n;
  EnterCriticalSection(&Gate); if (FileSaved.size() > 100000) FileSaved.clear(); FileSaved[crc] = file; LeaveCriticalSection(&Gate);
 }
 std::string src = Utf8(source.c_str());
 if (src.size() > 300) src = src.substr(src.size() - 300);
 // Same line format as the audio clips of modules/Voice.cpp (api "file", raw: the original file, not PCM), plus fmt/how/offset.
 char line[1400];
 sprintf_s(line, "{\"file\":%s,\"api\":\"file\",\"obj\":\"\",\"start\":%llu,\"ms\":0,\"rate\":0,\"ch\":0,\"bits\":0,\"bytes\":%lu,\"crc\":\"%08lx\",\"stopped\":false,\"raw\":true,\"name\":%s,\"fmt\":\"%s\",\"how\":\"%s\",\"offset\":%llu}\n",
  Json(file).c_str(), at, n, crc, Json(src).c_str(), fmt, how, offset);
 Append(L"events.jsonl", line);
}
ULONG Head(const unsigned char *p, DWORD n) { ULONG h = 0; DWORD k = n < 64 ? n : 64; for (DWORD i = 0; i < k; i++) h = h * 31 + p[i]; return h; }
void ReadDone(HANDLE file, const unsigned char *p, DWORD n) {
 if (n < MinClipBytes || n > MaxVoiceFile) return;
 std::wstring source; EnterCriticalSection(&Gate); auto it = Names.find(file); if (it != Names.end()) source = it->second; LeaveCriticalSection(&Gate);
 if (source.empty()) return; // pipes, consoles, files opened before the DLL arrived
 LARGE_INTEGER zero, pos; zero.QuadPart = 0; pos.QuadPart = 0; SetFilePointerEx(file, zero, &pos, FILE_CURRENT);
 ULONGLONG offset = (ULONGLONG)pos.QuadPart - n, at = NowMs();
 const char *fmt = Sniff(p, n);
 if (*fmt) { Keep(p, n, fmt, at, offset, source, "plain"); return; }
 // Not (yet) a voice file: watched in case the game decrypts it in place.
 EnterCriticalSection(&Gate);
 if (Reads.size() < 64) Reads.push_back(Read{ p, n, Head(p, n), GetTickCount(), at, offset, source });
 LeaveCriticalSection(&Gate);
}
BOOL WINAPI HRead(HANDLE h, LPVOID buf, DWORD want, LPDWORD got, LPOVERLAPPED ov) {
 BOOL ok = ORead(h, buf, want, got, ov);
 if (ok && !ov && got && *got && Live()) { DWORD e = GetLastError(); ULONGLONG was = Enter(); __try { ReadDone(h, (const unsigned char *)buf, *got); } __except (EXCEPTION_EXECUTE_HANDLER) { Fault("ReadFile"); } Leave(was); SetLastError(e); }
 return ok;
}
// Each tick: a watched read whose first bytes changed into a voice file's magic is saved; older than 3 s, dropped.
void FileTick() {
 std::vector<Read> now; EnterCriticalSection(&Gate); now.swap(Reads); LeaveCriticalSection(&Gate);
 std::vector<Read> keep;
 DWORD tick = GetTickCount();
 for (auto &r : now) {
  std::vector<unsigned char> head; if (!Copy(head, r.p, r.n < 64 ? r.n : 64)) continue; // freed: gone
  if (Head(head.data(), (DWORD)head.size()) != r.head) {
   // Changed: decrypted in place (or the buffer was reused). Check the whole start only once it holds a voice magic.
   std::vector<unsigned char> first; if (!Copy(first, r.p, r.n < 0x40 ? r.n : 0x40)) continue;
   const char *fmt = Sniff(first.data(), (DWORD)first.size());
   if (*fmt) Keep(r.p, r.n, fmt, r.at, r.offset, r.source, "inplace");
   continue;
  }
  if (tick - r.born < ReadWatchMs) keep.push_back(r);
 }
 EnterCriticalSection(&Gate); for (auto &r : keep) if (Reads.size() < 64) Reads.push_back(r); LeaveCriticalSection(&Gate);
}

bool HookExport(const wchar_t *mod, const char *name, void *detour, void **orig) {
 HMODULE m = GetModuleHandleW(mod); void *fn = m ? (void *)GetProcAddress(m, name) : NULL;
 return fn && Hk(fn, detour, orig);
}
void Log(const char *s) { char line[256]; sprintf_s(line, "%llu %s\r\n", NowMs(), s); Append(L"voice.log", line); }

void SafeTick() { __try { FileTick(); } __except (EXCEPTION_EXECUTE_HANDLER) { Fault("file tick"); } }
DWORD Ticks; bool HaveFile;
void Look() {
 if (HaveFile) return;
 HaveFile = HookExport(L"kernel32.dll", "CreateFileW", (void *)HCFW, (void **)&OCFW);
 HookExport(L"kernel32.dll", "CreateFileA", (void *)HCFA, (void **)&OCFA);
 HaveFile = HookExport(L"kernel32.dll", "ReadFile", (void *)HRead, (void **)&ORead) && HaveFile;
 Log(HaveFile ? "file reads hooked" : "file reads not hooked");
}
} // namespace voicefile

// The audio file name the game opened last and when (modules/Voice.cpp names its clips with it).
bool VoiceFileLastName(std::wstring &name, ULONGLONG &at) {
 using namespace voicefile;
 if (!On) return false;
 EnterCriticalSection(&Gate); name = LastName; at = LastNameAt; LeaveCriticalSection(&Gate);
 return !name.empty();
}
void VoiceFileStart(const wchar_t *out) {
 using namespace voicefile;
 { wchar_t f[1100]; swprintf_s(f, L"%svoice\\disabled.txt", out);
   HANDLE h = CreateFileW(f, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_EXISTING, 0, NULL);
   if (h != INVALID_HANDLE_VALUE) { char b[4096]; DWORD n = 0; ReadFile(h, b, sizeof b, &n, NULL); CloseHandle(h); int lines = 0; for (DWORD i = 0; i < n; i++) if (b[i] == '\n') lines++; if (lines >= 3) return; } }
 swprintf_s(OutDir, L"%s", out);
 swprintf_s(Dir, L"%svoice\\", out); CreateDirectoryW(out, NULL); CreateDirectoryW(Dir, NULL);
 Budget = 1536ll << 20;
 WIN32_FIND_DATAW f; HANDLE h = FindFirstFileW((std::wstring(Dir) + L"f*").c_str(), &f);
 LONG top = 0;
 if (h != INVALID_HANDLE_VALUE) { do { Spent += f.nFileSizeLow; LONG k = _wtoi(f.cFileName + 1); if (k > top) top = k; } while (FindNextFileW(h, &f)); FindClose(h); }
 Seq = top;
 InitializeCriticalSection(&Gate);
 Tls = TlsAlloc();
 Crc32 = (Crc32Fn)GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "RtlComputeCrc32");
 MH_STATUS s = MH_Initialize();
 if (s != MH_OK && s != MH_ERROR_ALREADY_INITIALIZED) return;
 On = 1;
 TlsSetValue(Tls, (void *)1);
 Look();
}
void VoiceFileTick() {
 using namespace voicefile;
 if (!On) return;
 TlsSetValue(Tls, (void *)1);
 if (++Ticks % 16 == 0 && Ticks < 1000) Look();
 SafeTick();
}
