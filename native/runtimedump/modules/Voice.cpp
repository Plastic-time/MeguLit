// SPDX-License-Identifier: GPL-3.0-or-later
// Voice harvest inside MeguLitDump32/64.dll: records the game's own voice clips as the game plays them, so MeguLit can
// replay a line's original CV later (backlog, Anki card audio, replay) whatever archive format or cipher the voice pack
// uses. The game must hand plain PCM to an audio API before anything is heard; each sound the game submits is saved as one
// WAV clip with the wall-clock time it started. Which clip belongs to which line is decided afterwards in node
// (services/voice-harvest.cjs), from these start times and the times hooked lines were shown.
//
// Watched (MinHook, every access guarded):
//  - DirectSound: IDirectSoundBuffer Unlock/Play/Stop (static buffers filled before Play, and streaming ring buffers);
//  - XAudio2 2.8/2.9: IXAudio2::CreateSourceVoice (format) and IXAudio2SourceVoice SubmitSourceBuffer/Start/Stop;
//  - waveOut: waveOutOpen (format), waveOutWrite, waveOutReset/Close (a device opened before the DLL arrived has no
//    known format and is skipped until the game opens it again);
//  - FMOD (C and C++ API exports): sounds created from memory (FMOD_OPENMEMORY) are saved as the decrypted file itself,
//    and playSound marks when one starts;
//  - CreateFile of audio-looking names (kernel32 thunk): the file name opened just before a clip starts is kept with it,
//    so voice commands in a script ("mgm0001") can name the clip.
// A clip ("stream") is what one buffer/voice/device receives from Play/Start (or its first write) until it stops, or
// until nothing more arrives for a while. Loops over 90 s (music) are dropped while they record.
//
// A cold tool with no switch or setting: always on wherever the DLL is loaded (the runtime pack that carries the DLL
// decides that). Light: copies only what the game writes, one writer thread, a 1.5 GB disk budget per game. Any fault
// inside a hook silently switches the whole harvest off for this run and adds a line to <out>\voice\disabled.txt; after
// three of them it no longer starts for that game.
// Output: <out>\voice\ events.jsonl (one JSON line per clip) and NNNNN.wav / NNNNN.<ext>.
#include <windows.h>
#include <mmsystem.h>
#include <stdio.h>
#include <string>
#include <vector>
#include <map>
#include "minhook/include/MinHook.h"

namespace voice {
wchar_t Dir[1024];
CRITICAL_SECTION Gate;
DWORD Tls = TLS_OUT_OF_INDEXES;
volatile LONG On, Seq, Faults;
volatile LONGLONG Spent, Budget;
const DWORD IdleMs = 1200, MaxClipMs = 90000, MinClipBytes = 2048;

// Marks this thread as inside a hook, so the harvest's own calls are never watched (no destructor: __try needs none).
bool Enter() { bool was = TlsGetValue(Tls) != NULL; TlsSetValue(Tls, (void *)1); return was; }
void Leave(bool was) { if (!was) TlsSetValue(Tls, NULL); }
bool Busy() { return Tls == TLS_OUT_OF_INDEXES || TlsGetValue(Tls) != NULL; }
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
// A fault inside a hook: stop everything for this run and leave a note MeguLit counts.
void Fault(const char *where) {
 if (InterlockedExchange(&On, 0) == 0) return;
 InterlockedIncrement(&Faults);
 char line[160]; sprintf_s(line, "fault in %s at %llu\r\n", where, NowMs());
 Append(L"disabled.txt", line);
 MH_DisableHook(MH_ALL_HOOKS); // also disables the dump hooks; one bad run is better than a crashed game
}
bool Copy(std::vector<unsigned char> &to, const void *p, DWORD n) {
 size_t at = to.size();
 __try { to.resize(at + n); memcpy(&to[at], p, n); return true; } __except (EXCEPTION_EXECUTE_HANDLER) { to.resize(at); return false; }
}

// ---- streams -----------------------------------------------------------------------------------------------------
struct Fmt { WORD tag, ch, bits; DWORD rate; };
struct Stream {
 const char *api; Fmt fmt; std::vector<unsigned char> pcm; ULONGLONG start; DWORD last, first, playTick, quietBytes, writesAfterPlay; bool playing, looping, stopped, dropped;
};
std::map<const void *, Stream> Streams;
std::map<const void *, Fmt> Formats;
std::wstring LastName; ULONGLONG LastNameAt;

struct Done { std::string api, name; Fmt fmt; std::vector<unsigned char> data; ULONGLONG start; DWORD ms; bool stopped, raw; std::string ext; const void *obj; };
std::vector<Done> Queue;

DWORD BytesPerSec(const Fmt &f) { DWORD b = f.rate * f.ch * (f.bits / 8); return b ? b : 1; }
bool Pcm(const Fmt &f) { return (f.tag == WAVE_FORMAT_PCM || f.tag == 3 || f.tag == 0xFFFE) && f.ch && f.ch <= 8 && f.rate >= 4000 && f.rate <= 192000 && (f.bits == 8 || f.bits == 16 || f.bits == 24 || f.bits == 32); }

// Ends the stream for obj (under Gate): moves its PCM to the writer queue when it is clip-sized.
// Static buffers (filled once, played again later without a new fill: a click, a voice replayed from the backlog) keep
// their last sound here, so the next Play still has something to record.
std::map<const void *, std::vector<unsigned char>> Kept;
void Close(const void *obj, bool stopped) {
 auto it = Streams.find(obj); if (it == Streams.end()) return;
 Stream &s = it->second;
 if (s.playing && !s.writesAfterPlay && !s.dropped && s.pcm.size() <= (4u << 20)) { if (Kept.size() >= 64) Kept.clear(); Kept[obj] = s.pcm; }
 if (!s.dropped && s.pcm.size() >= MinClipBytes && Pcm(s.fmt)) {
  Done d; d.api = s.api; d.fmt = s.fmt; d.data.swap(s.pcm); d.start = s.start; d.stopped = stopped; d.raw = false; d.obj = obj;
  d.ms = (DWORD)(d.data.size() * 1000ull / BytesPerSec(s.fmt));
  // "stopped" means cut off (the user clicked on). A streamed sound (written in pieces while it plays) was cut when it
  // stopped with no silence at its tail; a sound written whole, when it stopped before it could have played out.
  d.stopped = stopped && (s.writesAfterPlay >= 2 ? s.quietBytes == 0 : s.playTick && GetTickCount() - s.playTick + 150 < d.ms);
  if (s.start - LastNameAt < 1500 || LastNameAt - s.start < 300) d.name = Utf8(LastName.c_str());
  if (Queue.size() < 256) Queue.push_back(std::move(d));
 }
 Streams.erase(it);
}
// Silent PCM (zero samples, or 0x80 for 8-bit): streaming players keep writing it after a sound ends.
bool Quiet(const Fmt &f, const void *p, DWORD n) {
 __try {
  if (f.bits == 16) { const short *w = (const short *)p; for (DWORD i = 0; i < n / 2; i += 3) if (w[i] > 64 || w[i] < -64) return false; return true; }
  if (f.bits == 8) { const unsigned char *b = (const unsigned char *)p; for (DWORD i = 0; i < n; i += 3) if (b[i] > 0x82 || b[i] < 0x7E) return false; return true; }
  if (f.bits == 32 && f.tag == 3) { const float *x = (const float *)p; for (DWORD i = 0; i < n / 4; i += 3) if (x[i] > 0.002f || x[i] < -0.002f) return false; return true; }
 } __except (EXCEPTION_EXECUTE_HANDLER) {}
 return false;
}
Stream Fresh(const char *api, const void *obj) {
 Stream s; s.api = api; s.fmt = Formats.count(obj) ? Formats[obj] : Fmt{ 0, 0, 0, 0 }; s.start = NowMs(); s.first = GetTickCount();
 s.last = s.first; s.playTick = 0; s.quietBytes = 0; s.writesAfterPlay = 0; s.playing = false; s.looping = false; s.stopped = false; s.dropped = false; return s;
}
// New data for obj. Starts a stream when there is none (a static buffer filled before Play starts it at Play instead).
void Feed(const char *api, const void *obj, const void *p, DWORD n, bool startNow) {
 if (!p || !n) return;
 EnterCriticalSection(&Gate);
 auto it = Streams.find(obj);
 // A buffer that was filled once, played, and is now filled again without a write in between holds the next sound.
 if (it != Streams.end() && it->second.playing && !it->second.writesAfterPlay && GetTickCount() - it->second.last > 300) { Close(obj, false); it = Streams.end(); }
 Fmt known = Formats.count(obj) ? Formats[obj] : Fmt{ 0, 0, 0, 0 };
 bool quiet = known.rate && Quiet(known, p, n);
 if (it == Streams.end()) {
  if (quiet) { LeaveCriticalSection(&Gate); return; } // nothing to hear yet
  Kept.erase(obj);
  it = Streams.emplace(obj, Fresh(api, obj)).first; it->second.playing = startNow; if (startNow) it->second.playTick = GetTickCount();
 }
 Stream &s = it->second;
 if (s.playing) s.writesAfterPlay++;
 if (!s.dropped) {
  if (quiet) s.quietBytes += n; else s.quietBytes = 0;
  if (!Copy(s.pcm, p, n)) s.dropped = true;
  if (s.fmt.rate && s.pcm.size() * 1000ull / BytesPerSec(s.fmt) > MaxClipMs) { s.dropped = true; std::vector<unsigned char>().swap(s.pcm); }
 }
 s.last = GetTickCount();
 // 0.8 s of silence after sound: the clip has ended even if the player keeps streaming.
 if (!s.dropped && s.fmt.rate && s.quietBytes * 1000ull / BytesPerSec(s.fmt) > 800) {
  size_t keep = s.pcm.size() - s.quietBytes; DWORD align = s.fmt.ch * (s.fmt.bits / 8); if (align) keep -= keep % align; s.pcm.resize(keep);
  Close(obj, false);
 }
 LeaveCriticalSection(&Gate);
}
void Start(const char *api, const void *obj, bool looping) {
 EnterCriticalSection(&Gate);
 auto it = Streams.find(obj);
 if (it != Streams.end() && it->second.playing) { Close(obj, true); it = Streams.end(); } // restarted: the previous sound ends here
 if (it == Streams.end()) {
  it = Streams.emplace(obj, Fresh(api, obj)).first;
  auto k = Kept.find(obj); if (k != Kept.end()) it->second.pcm = k->second;
 }
 it->second.writesAfterPlay = 0; it->second.playing = true; it->second.playTick = GetTickCount(); it->second.looping = looping; it->second.start = NowMs(); it->second.last = GetTickCount();
 LeaveCriticalSection(&Gate);
}
void Stop(const void *obj) { EnterCriticalSection(&Gate); auto it = Streams.find(obj); if (it != Streams.end() && it->second.playing) Close(obj, true); LeaveCriticalSection(&Gate); }
void SetFormat(const void *obj, const WAVEFORMATEX *w) {
 if (!w) return;
 Fmt f;
 __try { f.tag = w->wFormatTag; f.ch = w->nChannels; f.rate = w->nSamplesPerSec; f.bits = w->wBitsPerSample; } __except (EXCEPTION_EXECUTE_HANDLER) { return; }
 EnterCriticalSection(&Gate); Formats[obj] = f; auto it = Streams.find(obj); if (it != Streams.end()) it->second.fmt = f; LeaveCriticalSection(&Gate);
}

// ---- writer --------------------------------------------------------------------------------------------------------
typedef ULONG(NTAPI *Crc32Fn)(ULONG, const void *, ULONG);
Crc32Fn Crc32;
std::map<ULONG, std::string> Written; // crc -> file, so a clip heard again (backlog replay) points at the same file
void Write(Done &d) {
 if (d.data.empty()) return;
 ULONG crc = Crc32 ? Crc32(0, d.data.data(), (ULONG)d.data.size()) : (ULONG)d.data.size();
 std::string file;
 auto w = Written.find(crc);
 if (w != Written.end()) file = w->second;
 else {
  if (Spent + (LONGLONG)d.data.size() > Budget) return;
  LONG seq = InterlockedIncrement(&Seq);
  char name[64]; wchar_t wname[64];
  if (d.raw) { sprintf_s(name, "%05ld.%s", seq, d.ext.c_str()); swprintf_s(wname, L"%05ld.%hs", seq, d.ext.c_str());
   if (!Put(wname, d.data.data(), (DWORD)d.data.size(), NULL, 0)) return; }
  else {
   sprintf_s(name, "%05ld.wav", seq); swprintf_s(wname, L"%05ld.wav", seq);
   struct { char riff[4]; DWORD size; char wave[4], fmt[4]; DWORD fsize; WORD tag, ch; DWORD rate, bps; WORD align, bits; char data[4]; DWORD dsize; } h;
   memcpy(h.riff, "RIFF", 4); memcpy(h.wave, "WAVE", 4); memcpy(h.fmt, "fmt ", 4); memcpy(h.data, "data", 4);
   h.fsize = 16; h.tag = d.fmt.tag == 0xFFFE ? (d.fmt.bits == 32 ? 3 : 1) : d.fmt.tag; h.ch = d.fmt.ch; h.rate = d.fmt.rate; h.bits = d.fmt.bits;
   h.align = (WORD)(d.fmt.ch * d.fmt.bits / 8); h.bps = h.rate * h.align; h.dsize = (DWORD)d.data.size(); h.size = 36 + h.dsize;
   if (!Put(wname, &h, sizeof h, d.data.data(), (DWORD)d.data.size())) return;
  }
  file = name; Written[crc] = file; Spent += (LONGLONG)d.data.size();
 }
 char obj[32]; sprintf_s(obj, "%p", d.obj);
 char line[1400];
 sprintf_s(line, "{\"file\":%s,\"api\":\"%s\",\"obj\":\"%s\",\"start\":%llu,\"ms\":%lu,\"rate\":%lu,\"ch\":%u,\"bits\":%u,\"bytes\":%u,\"crc\":\"%08lx\",\"stopped\":%s,\"raw\":%s,\"name\":%s}\n",
  Json(file).c_str(), d.api.c_str(), obj, d.start, d.ms, d.fmt.rate, d.fmt.ch, d.fmt.bits, (unsigned)d.data.size(), crc, d.stopped ? "true" : "false",
  d.raw ? "true" : "false", Json(d.name.size() > 300 ? d.name.substr(d.name.size() - 300) : d.name).c_str());
 Append(L"events.jsonl", line);
}
// Every 150 ms: streams that went quiet end (static buffers end once their sound has had time to play out).
void Tick() {
 std::vector<Done> out;
 EnterCriticalSection(&Gate);
 DWORD now = GetTickCount();
 std::vector<const void *> idle;
 for (auto &kv : Streams) {
  Stream &s = kv.second;
  DWORD since = now - s.last;
  if (s.playing && since > IdleMs) idle.push_back(kv.first);
  else if (!s.playing && since > 20000) idle.push_back(kv.first); // filled but never played
 }
 for (auto o : idle) { auto it = Streams.find(o); if (it == Streams.end()) continue; if (it->second.playing) Close(o, false); else Streams.erase(it); }
 out.swap(Queue);
 LeaveCriticalSection(&Gate);
 for (auto &d : out) Write(d);
}

// ---- DirectSound ---------------------------------------------------------------------------------------------------
typedef HRESULT(WINAPI *DsCreateFn)(LPCGUID, void **, void *);
typedef HRESULT(STDMETHODCALLTYPE *UnlockFn)(void *, void *, DWORD, void *, DWORD);
typedef HRESULT(STDMETHODCALLTYPE *PlayFn)(void *, DWORD, DWORD, DWORD);
typedef HRESULT(STDMETHODCALLTYPE *StopFn)(void *);
typedef HRESULT(STDMETHODCALLTYPE *GetFormatFn)(void *, WAVEFORMATEX *, DWORD, DWORD *);
UnlockFn OUnlock; PlayFn OPlay; StopFn OStop; GetFormatFn GetFmt;
void DsFormat(void *b) {
 EnterCriticalSection(&Gate); bool known = Formats.count(b) > 0; LeaveCriticalSection(&Gate);
 if (known || !GetFmt) return;
 WAVEFORMATEX w[4] = {}; DWORD got = 0;
 if (SUCCEEDED(GetFmt(b, w, sizeof w, &got))) SetFormat(b, w);
}
HRESULT STDMETHODCALLTYPE HUnlock(void *b, void *p1, DWORD n1, void *p2, DWORD n2) {
 if (Live()) { bool was = Enter(); __try { DsFormat(b); Feed("dsound", b, p1, n1, false); Feed("dsound", b, p2, n2, false); } __except (EXCEPTION_EXECUTE_HANDLER) { Fault("dsound unlock"); } Leave(was); }
 return OUnlock(b, p1, n1, p2, n2);
}
HRESULT STDMETHODCALLTYPE HPlay(void *b, DWORD r, DWORD prio, DWORD flags) {
 if (Live()) { bool was = Enter(); __try { DsFormat(b); Start("dsound", b, (flags & 1) != 0); } __except (EXCEPTION_EXECUTE_HANDLER) { Fault("dsound play"); } Leave(was); }
 return OPlay(b, r, prio, flags);
}
HRESULT STDMETHODCALLTYPE HStop(void *b) {
 if (Live()) { bool was = Enter(); __try { Stop(b); } __except (EXCEPTION_EXECUTE_HANDLER) { Fault("dsound stop"); } Leave(was); }
 return OStop(b);
}
// The buffer methods live in dsound.dll and are shared by every secondary buffer: a throwaway buffer shows where.
bool HookDsound() {
 HMODULE m = GetModuleHandleW(L"dsound.dll"); if (!m) return false;
 DsCreateFn create = (DsCreateFn)GetProcAddress(m, "DirectSoundCreate8"); if (!create) create = (DsCreateFn)GetProcAddress(m, "DirectSoundCreate");
 if (!create) return false;
 void *ds = NULL; if (FAILED(create(NULL, &ds, NULL)) || !ds) return false;
 void **dv = *(void ***)ds;
 typedef HRESULT(STDMETHODCALLTYPE *CoopFn)(void *, HWND, DWORD);
 typedef HRESULT(STDMETHODCALLTYPE *CreateBufFn)(void *, const void *, void **, void *);
 typedef ULONG(STDMETHODCALLTYPE *ReleaseFn)(void *);
 ((CoopFn)dv[6])(ds, GetDesktopWindow(), 2);
 WAVEFORMATEX w = { WAVE_FORMAT_PCM, 1, 22050, 44100, 2, 16, 0 };
 struct { DWORD size, flags, bytes, reserved; WAVEFORMATEX *fmt; GUID algo; } desc = { sizeof desc, 0, 4410, 0, &w, {} };
 void *buf = NULL; bool ok = false;
 if (SUCCEEDED(((CreateBufFn)dv[3])(ds, &desc, &buf, NULL)) && buf) {
  void **bv = *(void ***)buf;
  GetFmt = (GetFormatFn)bv[5];
  ok = MH_CreateHook(bv[19], (void *)HUnlock, (void **)&OUnlock) == MH_OK && MH_EnableHook(bv[19]) == MH_OK;
  ok = ok && MH_CreateHook(bv[12], (void *)HPlay, (void **)&OPlay) == MH_OK && MH_EnableHook(bv[12]) == MH_OK;
  ok = ok && MH_CreateHook(bv[18], (void *)HStop, (void **)&OStop) == MH_OK && MH_EnableHook(bv[18]) == MH_OK;
  ((ReleaseFn)bv[2])(buf);
 }
 ((ReleaseFn)dv[2])(ds);
 return ok;
}

// ---- XAudio2 2.8 / 2.9 -----------------------------------------------------------------------------------------------
typedef HRESULT(WINAPI *XCreateFn)(void **, UINT32, UINT32);
typedef HRESULT(STDMETHODCALLTYPE *CreateSourceFn)(void *, void **, const WAVEFORMATEX *, UINT32, float, void *, const void *, const void *);
typedef HRESULT(STDMETHODCALLTYPE *SubmitFn)(void *, const void *, const void *);
typedef HRESULT(STDMETHODCALLTYPE *XStartFn)(void *, UINT32, UINT32);
typedef HRESULT(STDMETHODCALLTYPE *XStopFn)(void *, UINT32, UINT32);
typedef void(STDMETHODCALLTYPE *DestroyFn)(void *);
CreateSourceFn OCreateSource; SubmitFn OSubmit; XStartFn OXStart; XStopFn OXStop; DestroyFn ODestroy;
struct XBuffer { UINT32 flags, bytes; const BYTE *data; UINT32 playBegin, playLength, loopBegin, loopLength, loopCount; void *context; };
HRESULT STDMETHODCALLTYPE HCreateSource(void *x, void **v, const WAVEFORMATEX *w, UINT32 f, float r, void *cb, const void *s, const void *e) {
 HRESULT hr = OCreateSource(x, v, w, f, r, cb, s, e);
 if (SUCCEEDED(hr) && Live()) { bool was = Enter(); __try { if (v && *v) SetFormat(*v, w); } __except (EXCEPTION_EXECUTE_HANDLER) { Fault("xaudio2 create"); } Leave(was); }
 return hr;
}
HRESULT STDMETHODCALLTYPE HSubmit(void *v, const void *b, const void *wma) {
 if (Live() && b && !wma) { bool was = Enter(); __try { const XBuffer *x = (const XBuffer *)b; if (x->loopCount == 255) Stop(v); else Feed("xaudio2", v, x->data, x->bytes, false); } __except (EXCEPTION_EXECUTE_HANDLER) { Fault("xaudio2 submit"); } Leave(was); }
 return OSubmit(v, b, wma);
}
void XGone(void *v) { EnterCriticalSection(&Gate); auto it = Streams.find(v); if (it != Streams.end() && it->second.playing) Close(v, false); else if (it != Streams.end()) Streams.erase(it); Formats.erase(v); Kept.erase(v); LeaveCriticalSection(&Gate); }
void STDMETHODCALLTYPE HDestroy(void *v) {
 if (Live()) { bool was = Enter(); __try { XGone(v); } __except (EXCEPTION_EXECUTE_HANDLER) { Fault("xaudio2 destroy"); } Leave(was); }
 ODestroy(v);
}
void XStarted(void *v) { EnterCriticalSection(&Gate); auto it = Streams.find(v); bool fresh = it == Streams.end() || !it->second.playing; LeaveCriticalSection(&Gate); if (fresh) Start("xaudio2", v, false); }
HRESULT STDMETHODCALLTYPE HXStart(void *v, UINT32 f, UINT32 o) {
 if (Live()) { bool was = Enter(); __try { XStarted(v); } __except (EXCEPTION_EXECUTE_HANDLER) { Fault("xaudio2 start"); } Leave(was); }
 return OXStart(v, f, o);
}
HRESULT STDMETHODCALLTYPE HXStop(void *v, UINT32 f, UINT32 o) {
 if (Live()) { bool was = Enter(); __try { Stop(v); } __except (EXCEPTION_EXECUTE_HANDLER) { Fault("xaudio2 stop"); } Leave(was); }
 return OXStop(v, f, o);
}
bool HookXAudio2() {
 HMODULE m = GetModuleHandleW(L"xaudio2_9.dll"); if (!m) m = GetModuleHandleW(L"xaudio2_9redist.dll"); if (!m) m = GetModuleHandleW(L"xaudio2_8.dll");
 if (!m) return false;
 XCreateFn create = (XCreateFn)GetProcAddress(m, "XAudio2Create"); if (!create) return false;
 void *x = NULL; if (FAILED(create(&x, 0, 1)) || !x) return false;
 void **xv = *(void ***)x;
 bool ok = MH_CreateHook(xv[5], (void *)HCreateSource, (void **)&OCreateSource) == MH_OK && MH_EnableHook(xv[5]) == MH_OK;
 // A source voice needs no device as long as it is never started; CreateMasteringVoice (index 7) may still fail
 // without one, so the source voice is made against a mastering voice only when that works.
 typedef HRESULT(STDMETHODCALLTYPE *MasterFn)(void *, void **, UINT32, UINT32, UINT32, LPCWSTR, const void *, int);
 void *master = NULL;
 if (SUCCEEDED(((MasterFn)xv[7])(x, &master, 0, 0, 0, NULL, NULL, 6)) && master) {
  WAVEFORMATEX w = { WAVE_FORMAT_PCM, 1, 22050, 44100, 2, 16, 0 };
  void *src = NULL;
  if (SUCCEEDED(OCreateSource ? OCreateSource(x, &src, &w, 0, 2.0f, NULL, NULL, NULL) : E_FAIL) && src) {
   void **sv = *(void ***)src;
   ok = ok && MH_CreateHook(sv[21], (void *)HSubmit, (void **)&OSubmit) == MH_OK && MH_EnableHook(sv[21]) == MH_OK;
   ok = ok && MH_CreateHook(sv[19], (void *)HXStart, (void **)&OXStart) == MH_OK && MH_EnableHook(sv[19]) == MH_OK;
   ok = ok && MH_CreateHook(sv[20], (void *)HXStop, (void **)&OXStop) == MH_OK && MH_EnableHook(sv[20]) == MH_OK;
   void *destroy = sv[18]; // the throwaway voice goes before the hook, so it never reaches the stream table
   ((DestroyFn)destroy)(src);
   ok = ok && MH_CreateHook(destroy, (void *)HDestroy, (void **)&ODestroy) == MH_OK && MH_EnableHook(destroy) == MH_OK;
  } else ok = false;
  ((DestroyFn)(*(void ***)master)[18])(master);
 } else ok = false;
 typedef ULONG(STDMETHODCALLTYPE *ReleaseFn)(void *);
 ((ReleaseFn)xv[2])(x);
 return ok;
}

// ---- waveOut ----------------------------------------------------------------------------------------------------------
typedef MMRESULT(WINAPI *WOpenFn)(LPHWAVEOUT, UINT_PTR, LPCWAVEFORMATEX, DWORD_PTR, DWORD_PTR, DWORD);
typedef MMRESULT(WINAPI *WWriteFn)(HWAVEOUT, LPWAVEHDR, UINT);
typedef MMRESULT(WINAPI *WResetFn)(HWAVEOUT);
WOpenFn OWOpen; WWriteFn OWWrite; WResetFn OWReset, OWClose;
MMRESULT WINAPI HWOpen(LPHWAVEOUT h, UINT_PTR d, LPCWAVEFORMATEX w, DWORD_PTR cb, DWORD_PTR inst, DWORD f) {
 MMRESULT r = OWOpen(h, d, w, cb, inst, f);
 if (r == MMSYSERR_NOERROR && h && Live() && !(f & WAVE_FORMAT_QUERY)) { bool was = Enter(); __try { SetFormat(*h, w); } __except (EXCEPTION_EXECUTE_HANDLER) { Fault("waveOutOpen"); } Leave(was); }
 return r;
}
MMRESULT WINAPI HWWrite(HWAVEOUT h, LPWAVEHDR hdr, UINT n) {
 if (Live() && hdr) { bool was = Enter(); __try { Feed("waveout", h, hdr->lpData, hdr->dwBufferLength, true); } __except (EXCEPTION_EXECUTE_HANDLER) { Fault("waveOutWrite"); } Leave(was); }
 return OWWrite(h, hdr, n);
}
void WGone(HWAVEOUT h) { Stop(h); EnterCriticalSection(&Gate); Formats.erase(h); LeaveCriticalSection(&Gate); }
MMRESULT WINAPI HWClose(HWAVEOUT h) {
 if (Live()) { bool was = Enter(); __try { WGone(h); } __except (EXCEPTION_EXECUTE_HANDLER) { Fault("waveOutClose"); } Leave(was); }
 return OWClose(h);
}
MMRESULT WINAPI HWReset(HWAVEOUT h) {
 if (Live()) { bool was = Enter(); __try { Stop(h); } __except (EXCEPTION_EXECUTE_HANDLER) { Fault("waveOutReset"); } Leave(was); }
 return OWReset(h);
}

// ---- FMOD -------------------------------------------------------------------------------------------------------------
// C API and C++ member exports share one shape (system/this first; stdcall on x86).
typedef int(__stdcall *FCreateFn)(void *, const char *, unsigned, void *, void **);
typedef int(__stdcall *FPlayFn)(void *, void *, void *, void *, void *);
const int FSlots = 6;
FCreateFn FCreate[FSlots]; FPlayFn FPlay[FSlots];
std::map<void *, Done> FSounds; // sound -> its decrypted file, until played
const char *Magic(const unsigned char *p, DWORD n) {
 if (n < 12) return NULL;
 if (!memcmp(p, "OggS", 4)) return "ogg"; if (!memcmp(p, "RIFF", 4) && !memcmp(p + 8, "WAVE", 4)) return "wav"; if (!memcmp(p, "fLaC", 4)) return "flac";
 if (!memcmp(p, "FSB5", 4)) return "fsb"; if (!memcmp(p, "ID3", 3) || (p[0] == 0xFF && (p[1] & 0xE0) == 0xE0)) return "mp3"; return NULL;
}
void FCreated(const char *data, unsigned mode, void *ex, void **sound) {
 unsigned len = ((unsigned *)ex)[1];
 if (len < MinClipBytes || len >= (64u << 20)) return;
 const char *kind = Magic((const unsigned char *)data, len);
 if (!kind) return;
 Done d; d.api = "fmod"; d.raw = true; d.ext = kind; d.fmt = Fmt{ 0, 0, 0, 0 }; d.ms = 0; d.stopped = false; d.obj = *sound; d.start = 0;
 if (!Copy(d.data, data, len)) return;
 EnterCriticalSection(&Gate); if (FSounds.size() > 512) FSounds.clear(); FSounds[*sound] = std::move(d); LeaveCriticalSection(&Gate);
}
void FPlayed(void *a, void *b) {
 EnterCriticalSection(&Gate);
 void *args[2] = { a, b }; // Studio low level: (sound, group, ...); FMOD Ex: (channelindex, sound, ...)
 for (void *s : args) { auto it = FSounds.find(s); if (it == FSounds.end()) continue;
  Done copy = it->second; copy.start = NowMs(); if (LastNameAt + 1500 > copy.start) copy.name = Utf8(LastName.c_str());
  if (Queue.size() < 256) Queue.push_back(std::move(copy)); break; }
 LeaveCriticalSection(&Gate);
}
template <int K> int __stdcall HFCreate(void *sys, const char *data, unsigned mode, void *ex, void **sound) {
 int r = FCreate[K](sys, data, mode, ex, sound);
 if (r == 0 && Live() && (mode & 0x800) && ex && sound) { // FMOD_OPENMEMORY: data is the (decrypted) file
  bool was = Enter(); __try { FCreated(data, mode, ex, sound); } __except (EXCEPTION_EXECUTE_HANDLER) { Fault("fmod create"); } Leave(was);
 }
 return r;
}
template <int K> int __stdcall HFPlay(void *sys, void *a, void *b, void *c, void *d) {
 if (Live()) { bool was = Enter(); __try { FPlayed(a, b); } __except (EXCEPTION_EXECUTE_HANDLER) { Fault("fmod play"); } Leave(was); }
 return FPlay[K](sys, a, b, c, d);
}
FCreateFn FCreateHooks[FSlots] = { HFCreate<0>, HFCreate<1>, HFCreate<2>, HFCreate<3>, HFCreate<4>, HFCreate<5> };
FPlayFn FPlayHooks[FSlots] = { HFPlay<0>, HFPlay<1>, HFPlay<2>, HFPlay<3>, HFPlay<4>, HFPlay<5> };
int FUsedCreate, FUsedPlay;
std::map<void *, int> FDone;
void HookFmodModule(HMODULE m) {
 // Export names: FMOD_System_CreateSound / CreateStream / PlaySound, or mangled ?createSound@System@FMOD@@..., ?playSound@...
 BYTE *base = (BYTE *)m;
 __try {
  IMAGE_DOS_HEADER *dos = (IMAGE_DOS_HEADER *)base; IMAGE_NT_HEADERS *nt = (IMAGE_NT_HEADERS *)(base + dos->e_lfanew);
  DWORD rva = nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_EXPORT].VirtualAddress; if (!rva) return;
  IMAGE_EXPORT_DIRECTORY *ed = (IMAGE_EXPORT_DIRECTORY *)(base + rva);
  DWORD *names = (DWORD *)(base + ed->AddressOfNames); WORD *ords = (WORD *)(base + ed->AddressOfNameOrdinals); DWORD *funcs = (DWORD *)(base + ed->AddressOfFunctions);
  for (DWORD i = 0; i < ed->NumberOfNames; i++) {
   const char *n = (const char *)(base + names[i]);
   bool create = !strcmp(n, "FMOD_System_CreateSound") || !strcmp(n, "FMOD_System_CreateStream") || !strncmp(n, "?createSound@System@FMOD@@", 26) || !strncmp(n, "?createStream@System@FMOD@@", 27);
   bool play = !strcmp(n, "FMOD_System_PlaySound") || !strncmp(n, "?playSound@System@FMOD@@", 24);
   if (!create && !play) continue;
   void *fn = base + funcs[ords[i]];
   if (FDone.count(fn)) continue; FDone[fn] = 1;
   if (create && FUsedCreate < FSlots) { int k = FUsedCreate++; if (MH_CreateHook(fn, (void *)FCreateHooks[k], (void **)&FCreate[k]) == MH_OK) MH_EnableHook(fn); }
   if (play && FUsedPlay < FSlots) { int k = FUsedPlay++; if (MH_CreateHook(fn, (void *)FPlayHooks[k], (void **)&FPlay[k]) == MH_OK) MH_EnableHook(fn); }
  }
 } __except (EXCEPTION_EXECUTE_HANDLER) {}
}

// ---- file names --------------------------------------------------------------------------------------------------------
typedef HANDLE(WINAPI *CFWFn)(LPCWSTR, DWORD, DWORD, LPSECURITY_ATTRIBUTES, DWORD, DWORD, HANDLE);
typedef HANDLE(WINAPI *CFAFn)(LPCSTR, DWORD, DWORD, LPSECURITY_ATTRIBUTES, DWORD, DWORD, HANDLE);
CFWFn OCFW; CFAFn OCFA;
bool Audioish(const wchar_t *p) {
 const wchar_t *dot = wcsrchr(p, L'.'); if (!dot) return false;
 static const wchar_t *ext[] = { L".ogg", L".opus", L".wav", L".flac", L".mp3", L".m4a", L".at9", L".hca", L".adx", L".vag", L".wma", L".aac" };
 for (auto e : ext) if (!_wcsicmp(dot, e)) return true;
 return false;
}
void Name(const wchar_t *p) { if (!p || !Audioish(p)) return; EnterCriticalSection(&Gate); LastName = p; LastNameAt = NowMs(); LeaveCriticalSection(&Gate); }
HANDLE WINAPI HCFW(LPCWSTR n, DWORD a, DWORD s, LPSECURITY_ATTRIBUTES sa, DWORD c, DWORD f, HANDLE t) {
 if (Live() && n) { bool was = Enter(); __try { Name(n); } __except (EXCEPTION_EXECUTE_HANDLER) { Fault("CreateFileW"); } Leave(was); }
 return OCFW(n, a, s, sa, c, f, t);
}
HANDLE WINAPI HCFA(LPCSTR n, DWORD a, DWORD s, LPSECURITY_ATTRIBUTES sa, DWORD c, DWORD f, HANDLE t) {
 if (Live() && n) { bool was = Enter(); __try { wchar_t w[1024]; if (MultiByteToWideChar(CP_ACP, 0, n, -1, w, 1024)) Name(w); } __except (EXCEPTION_EXECUTE_HANDLER) { Fault("CreateFileA"); } Leave(was); }
 return OCFA(n, a, s, sa, c, f, t);
}

bool HookExport(const wchar_t *mod, const char *name, void *detour, void **orig) {
 HMODULE m = GetModuleHandleW(mod); void *fn = m ? (void *)GetProcAddress(m, name) : NULL;
 return fn && MH_CreateHook(fn, detour, orig) == MH_OK && MH_EnableHook(fn) == MH_OK;
}
void Log(const char *s) { char line[256]; sprintf_s(line, "%llu %s\r\n", NowMs(), s); Append(L"voice.log", line); }

void SafeTick() { __try { Tick(); } __except (EXCEPTION_EXECUTE_HANDLER) { Fault("writer"); } }
DWORD WINAPI Run(void *) {
 TlsSetValue(Tls, (void *)1);
 Crc32 = (Crc32Fn)GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "RtlComputeCrc32");
 bool ds = false, xa = false, wo = false, cf = false;
 std::map<HMODULE, int> fmodSeen;
 for (DWORD n = 0; On; n++) {
  // Audio libraries are often loaded late (first sound, or after the title screen): look again for a minute.
  if (n % 20 == 0 && n < 400) {
   if (!cf) { cf = HookExport(L"kernel32.dll", "CreateFileW", (void *)HCFW, (void **)&OCFW); HookExport(L"kernel32.dll", "CreateFileA", (void *)HCFA, (void **)&OCFA); }
   if (!ds && GetModuleHandleW(L"dsound.dll")) { ds = HookDsound(); Log(ds ? "dsound hooked" : "dsound not hooked"); }
   if (!xa && (GetModuleHandleW(L"xaudio2_9.dll") || GetModuleHandleW(L"xaudio2_8.dll") || GetModuleHandleW(L"xaudio2_9redist.dll"))) { xa = HookXAudio2(); Log(xa ? "xaudio2 hooked" : "xaudio2 not hooked"); }
   if (!wo && GetModuleHandleW(L"winmm.dll")) {
    wo = HookExport(L"winmm.dll", "waveOutOpen", (void *)HWOpen, (void **)&OWOpen);
    wo = HookExport(L"winmm.dll", "waveOutWrite", (void *)HWWrite, (void **)&OWWrite) && wo;
    HookExport(L"winmm.dll", "waveOutReset", (void *)HWReset, (void **)&OWReset);
    HookExport(L"winmm.dll", "waveOutClose", (void *)HWClose, (void **)&OWClose);
    Log(wo ? "waveout hooked" : "waveout not hooked");
   }
   const wchar_t *fm[] = { L"fmod.dll", L"fmod64.dll", L"fmodex.dll", L"fmodex64.dll", L"fmodL.dll", L"fmodstudio.dll" };
   for (auto f : fm) { HMODULE h = GetModuleHandleW(f); if (h && !fmodSeen.count(h)) { fmodSeen[h] = 1; HookFmodModule(h); Log("fmod hooked"); } }
  }
  Sleep(150);
  SafeTick();
 }
 return 0;
}
} // namespace voice

// Called from RuntimeDump.cpp Run() with the per-game output folder (ending in '\'), before its own on/off check.
void VoiceStart(const wchar_t *out) {
 using namespace voice;
 // A cold tool: no switch. It stays off only for a game where it has faulted three times (voice\disabled.txt).
 { wchar_t f[1100]; swprintf_s(f, L"%svoice\\disabled.txt", out);
   HANDLE h = CreateFileW(f, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_EXISTING, 0, NULL);
   if (h != INVALID_HANDLE_VALUE) { char b[4096]; DWORD n = 0; ReadFile(h, b, sizeof b, &n, NULL); CloseHandle(h); int lines = 0; for (DWORD i = 0; i < n; i++) if (b[i] == '\n') lines++; if (lines >= 3) return; } }
 CreateDirectoryW(out, NULL);
 { // game.txt names the game folder (services/runtime-dump.cjs finds the folder by it)
  wchar_t game[1024]; DWORD n = GetModuleFileNameW(NULL, game, 1024); wchar_t *g = n ? wcsrchr(game, L'\\') : NULL;
  std::wstring txt = std::wstring(out) + L"game.txt";
  if (g && GetFileAttributesW(txt.c_str()) == INVALID_FILE_ATTRIBUTES) { *g = 0; std::string u = Utf8(game); swprintf_s(Dir, L"%s", out); Put(L"game.txt", u.data(), (DWORD)u.size(), NULL, 0); }
 }
 swprintf_s(Dir, L"%svoice\\", out); CreateDirectoryW(Dir, NULL);
 Budget = 1536ll << 20;
 // Disk already used by earlier runs counts against the budget.
 WIN32_FIND_DATAW f; HANDLE h = FindFirstFileW((std::wstring(Dir) + L"*").c_str(), &f);
 LONG top = 0;
 if (h != INVALID_HANDLE_VALUE) { do { Spent += f.nFileSizeLow; LONG k = _wtoi(f.cFileName); if (k > top) top = k; } while (FindNextFileW(h, &f)); FindClose(h); }
 Seq = top;
 InitializeCriticalSection(&Gate);
 Tls = TlsAlloc();
 MH_STATUS s = MH_Initialize();
 if (s != MH_OK && s != MH_ERROR_ALREADY_INITIALIZED) return;
 On = 1;
 HANDLE t = CreateThread(NULL, 0, Run, NULL, 0, NULL);
 if (t) CloseHandle(t);
}
