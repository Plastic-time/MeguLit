// SPDX-License-Identifier: GPL-3.0-or-later
// AudioMore module of MeguLitDump32/64.dll (modules.h): the audio paths the Voice harvest (Voice.cpp: DirectSound,
// XAudio2 2.8/2.9, waveOut, FMOD) does not cover. It writes the same <out>\voice\events.jsonl lines, so
// services/voice-harvest.cjs reads both without knowing which module saw a sound. It never plays, mixes or changes audio:
// every detour copies what it needs and calls the original.
//
//  - XAudio2 2.0-2.7 (DirectX SDK, COM): CoCreateInstance of any class whose object lives in xaudio2_N.dll /
//    xaudiod2_N.dll (N <= 7). IXAudio2::CreateSourceVoice is slot 8 there; the source voice's Start/Stop/Submit are
//    19/20/21 for 2.4-2.7 and 17/18/19 for 2.0-2.3. PCM is saved like Voice.cpp does (api "xaudio2_<N>").
//  - OpenAL (OpenAL32.dll, soft_oal.dll, wrap_oal.dll): alBufferData keeps each buffer's PCM; alSourcei(AL_BUFFER) +
//    alSourcePlay(v) is one clip, alSourceQueueBuffers streams into the source's clip until alSourceStop or silence.
//  - CRI ADX2/Atom in Unity (cri_ware_unity.dll exports): no PCM (CRI mixes in its own output), but which cue starts:
//    criAtomExAcb_LoadAcbFile names the ACB, criAtomExPlayer_SetCueName/Id/Index, SetFile and SetWaveId pick the sound,
//    criAtomExPlayer_Start is the start. Event name "<acb>|<cue>"; the cue can be cut from the ACB/AWB later (vgmstream).
//  - Wwise in Unity (AkSoundEngine.dll / AkUnitySoundEngine.dll, SWIG exports containing "PostEvent"): the event name
//    (or 32-bit id) posted, x64 only (x86 SWIG exports are stdcall with per-overload argument sizes).
// Lines (one per clip or cue), same fields as Voice.cpp:
//   {"file" (relative to voice\, "" for cue-only events),"api","obj","start" (unix ms),"ms","rate","ch","bits","bytes",
//    "crc","stopped","raw":false,"name"}
// Clips are written by the dump thread (AudioMoreTick) as voice\NNNNN_<api>.wav; one crc is written once.
#include <windows.h>
#include <mmsystem.h>
#include <mmreg.h>
#include <stdio.h>
#include <string>
#include <vector>
#include <map>
#include "../minhook/include/MinHook.h"

void AudioMoreStart(const wchar_t *out);
void AudioMoreTick();

namespace audiomore {
const DWORD IdleMs = 1200, MaxClip = 32u << 20, MinBytes = 512, KeepMax = 256u << 20;
const LONGLONG Budget = 1024ll << 20;
std::wstring Dir; // <out>\voice\ (trailing backslash)
CRITICAL_SECTION Lock, HookLock;
volatile LONG Started, Seq;
LONGLONG Spent;

// Every helper a detour calls keeps the thread's last-error value, so the game sees the original API's error.
struct KeepError { DWORD e; KeepError() : e(GetLastError()) {} ~KeepError() { SetLastError(e); } };
struct Held { CRITICAL_SECTION *c; Held(CRITICAL_SECTION *x) : c(x) { EnterCriticalSection(c); } ~Held() { LeaveCriticalSection(c); } };
ULONGLONG UnixMs() { FILETIME f; GetSystemTimeAsFileTime(&f); return ((((ULONGLONG)f.dwHighDateTime) << 32 | f.dwLowDateTime) - 116444736000000000ull) / 10000; }
bool SafeCopy(void *dst, const void *src, size_t n) { __try { memcpy(dst, src, n); return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; } }
std::string Json(const std::string &s) {
 std::string r = "\"";
 for (unsigned char c : s) { if (c == '"' || c == '\\') { r += '\\'; r += (char)c; } else if (c < 0x20) { char b[8]; sprintf_s(b, "\\u%04x", c); r += b; } else r += (char)c; }
 return r + "\"";
}
// A C string the game passed, read safely; empty if unreadable.
std::string CStr(const char *p, size_t max = 512) {
 std::string r; char c;
 for (size_t i = 0; p && i < max && SafeCopy(&c, p + i, 1) && c; i++) r += c;
 return r;
}

struct Fmt { unsigned tag = 0, ch = 0, rate = 0, bits = 0; };
Fmt FromWave(const WAVEFORMATEX *w) {
 Fmt f; WAVEFORMATEX h;
 if (w && SafeCopy(&h, w, sizeof h)) { f.tag = h.wFormatTag; f.ch = h.nChannels; f.rate = h.nSamplesPerSec; f.bits = h.wBitsPerSample; }
 return f;
}
// One clip per audio object. Kind keeps OpenAL ids apart from COM pointers.
typedef std::pair<int, ULONG_PTR> Key;
enum { KVoice = 1, KAlSource = 2 };
struct Clip { std::string api; Fmt fmt; std::vector<unsigned char> data; ULONGLONG start = 0; DWORD last = 0; bool playing = false, done = false, stopped = false; ULONG_PTR obj = 0; };
std::map<Key, Clip> Clips;
struct Ready { std::string api, name; Fmt fmt; std::vector<unsigned char> data; ULONGLONG start; bool stopped; ULONG_PTR obj; };
std::vector<Ready> Queue;
std::vector<std::string> Notes;

void Note(const std::string &s) {
 KeepError keep;
 SYSTEMTIME t; GetLocalTime(&t);
 char stamp[40]; sprintf_s(stamp, "%02d:%02d:%02d.%03d audiomore: ", t.wHour, t.wMinute, t.wSecond, t.wMilliseconds);
 Held h(&Lock); Notes.push_back(stamp + s + "\r\n");
}
// Caller holds Lock.
void Close(Clip &c) {
 if (c.data.size() >= MinBytes) Queue.push_back({c.api, "", c.fmt, std::move(c.data), c.start, c.stopped, c.obj});
 c.data.clear(); c.playing = c.done = c.stopped = false; c.start = 0;
}
void Open(Key k, const char *api, Fmt f) {
 KeepError keep; Held h(&Lock);
 Clip &c = Clips[k];
 if (!c.data.empty()) Close(c);
 c = Clip(); c.api = api; c.fmt = f; c.obj = k.second;
}
void Feed(Key k, const char *api, const void *p, size_t n, Fmt *f = NULL) {
 if (!p || !n) return;
 KeepError keep; Held h(&Lock);
 Clip &c = Clips[k];
 if (c.api.empty()) { c.api = api; c.obj = k.second; }
 if (f) c.fmt = *f;
 if (c.data.size() + n > MaxClip) Close(c);
 size_t at = c.data.size(); c.data.resize(at + n);
 if (!SafeCopy(&c.data[at], p, n)) c.data.resize(at);
 c.last = GetTickCount();
}
void Start(Key k) {
 KeepError keep; Held h(&Lock);
 Clip &c = Clips[k];
 if (!c.start) c.start = UnixMs();
 c.playing = true; c.last = GetTickCount();
}
void Stop(Key k, bool stopped) {
 KeepError keep; Held h(&Lock);
 auto it = Clips.find(k);
 if (it != Clips.end()) { it->second.done = true; it->second.stopped = stopped; }
}
// A cue-only event (CRI, Wwise): no PCM, just what started and when.
void Cue(const char *api, const void *obj, const std::string &name) {
 KeepError keep; Held h(&Lock);
 Queue.push_back({api, name, Fmt(), {}, UnixMs(), false, (ULONG_PTR)obj});
}

// ---- COM method hooks: one detour per method, any number of implementations (target code addresses) -------------------
struct Slot { void *target, *tramp; };
Slot Slots[128]; volatile LONG Used;
void *Original(void *obj, int index) {
 void *t = (*(void ***)obj)[index];
 for (LONG i = 0; i < Used; i++) if (Slots[i].target == t) return Slots[i].tramp;
 return t; // not hooked: calling it directly is safe
}
void HookMethod(void *obj, int index, void *detour) {
 if (!obj) return;
 KeepError keep;
 void *t = NULL, **vt = NULL;
 if (!SafeCopy(&vt, obj, sizeof vt) || !vt || !SafeCopy(&t, vt + index, sizeof t) || !t) return;
 Held h(&HookLock);
 for (LONG i = 0; i < Used; i++) if (Slots[i].target == t) return;
 void *tramp = NULL;
 if (Used < 128 && MH_CreateHook(t, detour, &tramp) == MH_OK) {
  Slots[Used].target = t; Slots[Used].tramp = tramp;
  MemoryBarrier(); InterlockedIncrement(&Used);
  bool on = MH_EnableHook(t) == MH_OK;
  char line[96]; sprintf_s(line, "%s method %d at %p", on ? "hooked" : "could not enable", index, t); Note(line);
 }
}
#define CALL(obj, index, type) ((type)Original(obj, index))

// ---- XAudio2 2.0-2.7 ----------------------------------------------------------------------------------------------------
// The XAudio2 version whose DLL holds this object's code: 0-7, or -1 for anything else.
int XVersion(void *obj) {
 KeepError keep;
 void **vt = NULL; void *fn = NULL;
 if (!obj || !SafeCopy(&vt, obj, sizeof vt) || !vt || !SafeCopy(&fn, vt, sizeof fn)) return -1;
 HMODULE m = NULL;
 if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT, (LPCWSTR)fn, &m)) return -1;
 wchar_t path[MAX_PATH]; if (!GetModuleFileNameW(m, path, MAX_PATH)) return -1;
 const wchar_t *base = wcsrchr(path, L'\\'); base = base ? base + 1 : path;
 wchar_t low[64] = {0}; for (int i = 0; i < 63 && base[i]; i++) low[i] = (wchar_t)towlower(base[i]);
 int n = -1;
 if (swscanf_s(low, L"xaudio2_%d.dll", &n) != 1 && swscanf_s(low, L"xaudiod2_%d.dll", &n) != 1) return -1;
 return n >= 0 && n <= 7 ? n : -1;
}
struct XBuffer { UINT32 Flags, AudioBytes; const BYTE *pAudioData; UINT32 PlayBegin, PlayLength, LoopBegin, LoopLength, LoopCount; void *pContext; };
typedef HRESULT(WINAPI *XCreateVoiceFn)(void *, void **, const WAVEFORMATEX *, UINT32, float, void *, const void *, const void *);
typedef HRESULT(WINAPI *XSubmitFn)(void *, const XBuffer *, const void *);
typedef HRESULT(WINAPI *XStartFn)(void *, UINT32, UINT32);
const int XCreateVoice = 8;
const UINT32 XEndOfStream = 0x40;
const char *XApi[8] = {"xaudio2_0", "xaudio2_1", "xaudio2_2", "xaudio2_3", "xaudio2_4", "xaudio2_5", "xaudio2_6", "xaudio2_7"};
std::map<void *, int> VoiceVersion; // under Lock

int VersionOf(void *v) { Held h(&Lock); auto it = VoiceVersion.find(v); return it == VoiceVersion.end() ? 7 : it->second; }
void Submitted(void *v, const XBuffer *b) {
 UINT32 flags = 0, n = 0; const BYTE *p = NULL; XBuffer copy;
 if (b && SafeCopy(&copy, b, sizeof copy)) { flags = copy.Flags; p = copy.pAudioData; n = copy.AudioBytes; }
 Feed(Key(KVoice, (ULONG_PTR)v), XApi[VersionOf(v)], p, n);
 if (flags & XEndOfStream) Stop(Key(KVoice, (ULONG_PTR)v), false);
}
// 2.4-2.7: Start 19, Stop 20, Submit 21. 2.0-2.3: Start 17, Stop 18, Submit 19.
template <int StartAt> HRESULT WINAPI HXStart(void *v, UINT32 f, UINT32 s) { Start(Key(KVoice, (ULONG_PTR)v)); return CALL(v, StartAt, XStartFn)(v, f, s); }
template <int StopAt> HRESULT WINAPI HXStop(void *v, UINT32 f, UINT32 s) { HRESULT hr = CALL(v, StopAt, XStartFn)(v, f, s); Stop(Key(KVoice, (ULONG_PTR)v), true); return hr; }
template <int SubmitAt> HRESULT WINAPI HXSubmit(void *v, const XBuffer *b, const void *wma) { Submitted(v, b); return CALL(v, SubmitAt, XSubmitFn)(v, b, wma); }
HRESULT WINAPI HXCreateVoice(void *x, void **out, const WAVEFORMATEX *f, UINT32 fl, float r, void *cb, const void *s, const void *e) {
 HRESULT hr = CALL(x, XCreateVoice, XCreateVoiceFn)(x, out, f, fl, r, cb, s, e);
 void *v = NULL;
 if (SUCCEEDED(hr) && out && SafeCopy(&v, out, sizeof v) && v) {
  KeepError keep;
  int n = XVersion(x); if (n < 0) n = 7;
  { Held h(&Lock); VoiceVersion[v] = n; }
  Open(Key(KVoice, (ULONG_PTR)v), XApi[n], FromWave(f));
  if (n >= 4) { HookMethod(v, 19, (void *)HXStart<19>); HookMethod(v, 20, (void *)HXStop<20>); HookMethod(v, 21, (void *)HXSubmit<21>); }
  else { HookMethod(v, 17, (void *)HXStart<17>); HookMethod(v, 18, (void *)HXStop<18>); HookMethod(v, 19, (void *)HXSubmit<19>); }
 }
 return hr;
}
typedef HRESULT(WINAPI *CoCreateFn)(REFCLSID, void *, DWORD, REFIID, void **);
CoCreateFn OCoCreate;
HRESULT WINAPI HCoCreate(REFCLSID c, void *outer, DWORD ctx, REFIID iid, void **out) {
 HRESULT hr = OCoCreate(c, outer, ctx, iid, out);
 void *obj = NULL;
 if (SUCCEEDED(hr) && out && SafeCopy(&obj, out, sizeof obj) && obj && XVersion(obj) >= 0) HookMethod(obj, XCreateVoice, (void *)HXCreateVoice);
 return hr;
}

// ---- OpenAL -------------------------------------------------------------------------------------------------------------
typedef void(__cdecl *AlBufferDataFn)(unsigned, int, const void *, int, int);
typedef void(__cdecl *AlSourceiFn)(unsigned, int, int);
typedef void(__cdecl *AlSourceFn)(unsigned);
typedef void(__cdecl *AlSourcevFn)(int, const unsigned *);
typedef void(__cdecl *AlQueueFn)(unsigned, int, const unsigned *);
struct AlFns { AlBufferDataFn data; AlSourceiFn sourcei; AlSourceFn play, stop; AlSourcevFn playv; AlQueueFn queue; } Al;
struct AlBuf { Fmt fmt; std::vector<unsigned char> pcm; };
std::map<unsigned, AlBuf> AlBuffers;   // under Lock
std::map<unsigned, unsigned> AlStatic; // source -> buffer set with AL_BUFFER
size_t AlKept;
Fmt AlFormat(int format, int freq) {
 Fmt f; f.rate = (unsigned)freq; f.tag = 1;
 switch (format) {
 case 0x1100: f.ch = 1; f.bits = 8; break; case 0x1101: f.ch = 1; f.bits = 16; break;
 case 0x1102: f.ch = 2; f.bits = 8; break; case 0x1103: f.ch = 2; f.bits = 16; break;
 case 0x10010: f.ch = 1; f.bits = 32; f.tag = 3; break; case 0x10011: f.ch = 2; f.bits = 32; f.tag = 3; break; // AL_EXT_float32
 default: f.tag = 0; f.ch = 0; f.bits = 0; // compressed or multichannel: kept raw, rate known
 }
 return f;
}
void __cdecl HAlBufferData(unsigned buf, int format, const void *data, int size, int freq) {
 if (data && size > 0 && (size_t)size <= MaxClip) {
  KeepError keep; Held h(&Lock);
  AlBuf &b = AlBuffers[buf];
  AlKept -= b.pcm.size(); b.pcm.clear();
  if (AlKept + size <= KeepMax) { b.pcm.resize(size); if (!SafeCopy(b.pcm.data(), data, size)) b.pcm.clear(); AlKept += b.pcm.size(); }
  b.fmt = AlFormat(format, freq);
 }
 Al.data(buf, format, data, size, freq);
}
void __cdecl HAlSourcei(unsigned src, int param, int value) {
 if (param == 0x1009) { KeepError keep; Held h(&Lock); if (value) AlStatic[src] = (unsigned)value; else AlStatic.erase(src); } // AL_BUFFER
 Al.sourcei(src, param, value);
}
void AlPlayed(unsigned src) {
 KeepError keep;
 Key k(KAlSource, src);
 AlBuf copy; bool single = false;
 {
  Held h(&Lock);
  auto s = AlStatic.find(src);
  if (s != AlStatic.end()) { auto b = AlBuffers.find(s->second); if (b != AlBuffers.end()) { copy = b->second; single = true; } }
 }
 if (single) { // one whole buffer: the clip is complete at play time
  Open(k, "openal", copy.fmt); Start(k); Feed(k, "openal", copy.pcm.data(), copy.pcm.size()); Stop(k, false);
 } else Start(k);
}
void __cdecl HAlPlay(unsigned src) { AlPlayed(src); Al.play(src); }
void __cdecl HAlPlayv(int n, const unsigned *srcs) {
 for (int i = 0; i < n && i < 256; i++) { unsigned s; if (SafeCopy(&s, srcs + i, sizeof s)) AlPlayed(s); }
 Al.playv(n, srcs);
}
void __cdecl HAlStop(unsigned src) { Al.stop(src); Stop(Key(KAlSource, src), true); }
void __cdecl HAlQueue(unsigned src, int n, const unsigned *bufs) {
 {
  KeepError keep;
  for (int i = 0; i < n && i < 256; i++) {
   unsigned id; if (!SafeCopy(&id, bufs + i, sizeof id)) break;
   AlBuf copy; bool have = false;
   { Held h(&Lock); auto b = AlBuffers.find(id); if (b != AlBuffers.end()) { copy = b->second; have = true; } AlStatic.erase(src); }
   if (have) Feed(Key(KAlSource, src), "openal", copy.pcm.data(), copy.pcm.size(), &copy.fmt);
  }
 }
 Al.queue(src, n, bufs);
}

// ---- CRI ADX2 (Unity plugin exports, cdecl) -------------------------------------------------------------------------------
typedef void *(__cdecl *CriLoadAcbFn)(void *, const char *, void *, const char *, void *, int);
typedef void(__cdecl *CriSetNameFn)(void *, void *, const char *);
typedef void(__cdecl *CriSetIdFn)(void *, void *, int);
typedef unsigned(__cdecl *CriStartFn)(void *);
struct CriFns { CriLoadAcbFn loadAcb; CriSetNameFn cueName, file; CriSetIdFn cueId, cueIndex, waveId; CriStartFn start; } Cri;
std::map<void *, std::string> CriAcb, CriCue; // acb -> path; player -> "<acb>|<cue>"
std::string AcbName(void *acb) { auto it = CriAcb.find(acb); return it == CriAcb.end() ? "" : it->second; }
void *__cdecl HCriLoadAcb(void *binder, const char *acb, void *awbBinder, const char *awb, void *work, int size) {
 void *h = Cri.loadAcb(binder, acb, awbBinder, awb, work, size);
 if (h) { KeepError keep; std::string a = CStr(acb); Held l(&Lock); CriAcb[h] = a; }
 return h;
}
void CriPick(void *player, void *acb, const std::string &cue) { KeepError keep; Held l(&Lock); CriCue[player] = AcbName(acb) + "|" + cue; }
void __cdecl HCriCueName(void *p, void *acb, const char *name) { CriPick(p, acb, CStr(name)); Cri.cueName(p, acb, name); }
void __cdecl HCriCueId(void *p, void *acb, int id) { CriPick(p, acb, "id:" + std::to_string(id)); Cri.cueId(p, acb, id); }
void __cdecl HCriCueIndex(void *p, void *acb, int i) { CriPick(p, acb, "index:" + std::to_string(i)); Cri.cueIndex(p, acb, i); }
void __cdecl HCriFile(void *p, void *binder, const char *path) { { KeepError keep; std::string f = CStr(path); Held l(&Lock); CriCue[p] = f; } Cri.file(p, binder, path); }
void __cdecl HCriWaveId(void *p, void *awb, int id) { CriPick(p, NULL, "wave:" + std::to_string(id)); Cri.waveId(p, awb, id); }
unsigned __cdecl HCriStart(void *p) {
 unsigned id = Cri.start(p);
 KeepError keep; std::string cue;
 { Held l(&Lock); auto it = CriCue.find(p); if (it != CriCue.end()) cue = it->second; }
 Cue("cri", p, cue);
 return id;
}

// ---- Wwise (Unity SWIG exports, x64) ---------------------------------------------------------------------------------------
// The first argument of every PostEvent overload is the event: a name (char* or wchar_t*) or its 32-bit id.
std::string EventName(ULONG_PTR a) {
 char s[129] = {0};
 if (a > 0xFFFFFFFFull && SafeCopy(s, (void *)a, 2)) {
  wchar_t w[129] = {0};
  if (!s[1] && s[0] && SafeCopy(w, (void *)a, 2 * 4)) { // UTF-16
   std::string r; for (int i = 0; i < 128 && SafeCopy(&w[i], (wchar_t *)a + i, 2) && w[i]; i++) r += w[i] < 128 ? (char)w[i] : '?';
   return r;
  }
  std::string r = CStr((const char *)a, 128);
  bool text = r.size() >= 2; for (unsigned char c : r) if (c < 0x20) text = false;
  if (text) return r;
 }
 char id[24]; sprintf_s(id, "id:%lu", (unsigned long)(a & 0xFFFFFFFF)); return id;
}
typedef ULONG_PTR(__cdecl *PostFn)(ULONG_PTR, ULONG_PTR, ULONG_PTR, ULONG_PTR, ULONG_PTR, ULONG_PTR, ULONG_PTR, ULONG_PTR);
PostFn OPost[8];
template <int K> ULONG_PTR __cdecl HPost(ULONG_PTR a, ULONG_PTR b, ULONG_PTR c, ULONG_PTR d, ULONG_PTR e, ULONG_PTR f, ULONG_PTR g, ULONG_PTR h) {
 ULONG_PTR r = OPost[K](a, b, c, d, e, f, g, h);
 { KeepError keep; Cue("wwise", (void *)b, EventName(a)); }
 return r;
}
void *PostHooks[8] = {(void *)HPost<0>, (void *)HPost<1>, (void *)HPost<2>, (void *)HPost<3>, (void *)HPost<4>, (void *)HPost<5>, (void *)HPost<6>, (void *)HPost<7>};
int PostUsed;
std::map<HMODULE, bool> WwiseSeen;
void HookWwise(HMODULE m) {
 if (sizeof(void *) == 4) { Note("wwise: x86 SWIG exports are stdcall, not hooked"); return; }
 BYTE *base = (BYTE *)m;
 IMAGE_NT_HEADERS *nt = (IMAGE_NT_HEADERS *)(base + ((IMAGE_DOS_HEADER *)base)->e_lfanew);
 IMAGE_DATA_DIRECTORY dir = nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_EXPORT];
 if (!dir.VirtualAddress) return;
 IMAGE_EXPORT_DIRECTORY *ex = (IMAGE_EXPORT_DIRECTORY *)(base + dir.VirtualAddress);
 DWORD *names = (DWORD *)(base + ex->AddressOfNames); WORD *ords = (WORD *)(base + ex->AddressOfNameOrdinals); DWORD *fns = (DWORD *)(base + ex->AddressOfFunctions);
 for (DWORD i = 0; i < ex->NumberOfNames && PostUsed < 8; i++) {
  const char *n = (const char *)(base + names[i]);
  if (!strstr(n, "PostEvent") || strstr(n, "PostEventCallback") || strstr(n, "PostEventOn")) continue;
  void *fn = base + fns[ords[i]];
  bool ok = MH_CreateHook(fn, PostHooks[PostUsed], (void **)&OPost[PostUsed]) == MH_OK && MH_EnableHook(fn) == MH_OK;
  if (ok) PostUsed++;
  Note(std::string(ok ? "hooked " : "could not hook ") + n);
 }
}

// ---- export hooks, retried until the module shows up ------------------------------------------------------------------
struct Export { const wchar_t *module; const char *name; void *detour; void **original; };
Export Exports[] = {
 {L"combase.dll", "CoCreateInstance", (void *)HCoCreate, (void **)&OCoCreate},
 {L"ole32.dll", "CoCreateInstance", (void *)HCoCreate, (void **)&OCoCreate},
 {L"cri_ware_unity.dll", "criAtomExAcb_LoadAcbFile", (void *)HCriLoadAcb, (void **)&Cri.loadAcb},
 {L"cri_ware_unity.dll", "criAtomExPlayer_SetCueName", (void *)HCriCueName, (void **)&Cri.cueName},
 {L"cri_ware_unity.dll", "criAtomExPlayer_SetCueId", (void *)HCriCueId, (void **)&Cri.cueId},
 {L"cri_ware_unity.dll", "criAtomExPlayer_SetCueIndex", (void *)HCriCueIndex, (void **)&Cri.cueIndex},
 {L"cri_ware_unity.dll", "criAtomExPlayer_SetFile", (void *)HCriFile, (void **)&Cri.file},
 {L"cri_ware_unity.dll", "criAtomExPlayer_SetWaveId", (void *)HCriWaveId, (void **)&Cri.waveId},
 {L"cri_ware_unity.dll", "criAtomExPlayer_Start", (void *)HCriStart, (void **)&Cri.start},
};
const wchar_t *AlModules[] = {L"OpenAL32.dll", L"soft_oal.dll", L"wrap_oal.dll"};
const wchar_t *WwiseModules[] = {L"AkSoundEngine.dll", L"AkUnitySoundEngine.dll"};
bool ExportDone[sizeof Exports / sizeof Exports[0]];
HMODULE AlHooked;
bool HookOne(HMODULE m, const char *name, void *detour, void **original) {
 void *fn = (void *)GetProcAddress(m, name);
 if (!fn) return false;
 bool ok = MH_CreateHook(fn, detour, original) == MH_OK && MH_EnableHook(fn) == MH_OK;
 Note(std::string(ok ? "hooked " : "could not hook ") + name);
 return ok;
}
void HookExports() {
 KeepError keep; Held h(&HookLock);
 for (size_t i = 0; i < sizeof Exports / sizeof Exports[0]; i++) {
  if (ExportDone[i]) continue;
  HMODULE m = GetModuleHandleW(Exports[i].module);
  if (!m || !GetProcAddress(m, Exports[i].name)) continue;
  ExportDone[i] = true;
  HookOne(m, Exports[i].name, Exports[i].detour, Exports[i].original);
 }
 if (!AlHooked) for (auto name : AlModules) {
  HMODULE m = GetModuleHandleW(name);
  if (!m || !GetProcAddress(m, "alBufferData")) continue;
  AlHooked = m; // one OpenAL per process; a router (OpenAL32) forwards to its driver, so hook the first one found
  HookOne(m, "alBufferData", (void *)HAlBufferData, (void **)&Al.data);
  HookOne(m, "alSourcei", (void *)HAlSourcei, (void **)&Al.sourcei);
  HookOne(m, "alSourcePlay", (void *)HAlPlay, (void **)&Al.play);
  HookOne(m, "alSourcePlayv", (void *)HAlPlayv, (void **)&Al.playv);
  HookOne(m, "alSourceStop", (void *)HAlStop, (void **)&Al.stop);
  HookOne(m, "alSourceQueueBuffers", (void *)HAlQueue, (void **)&Al.queue);
  break;
 }
 for (auto name : WwiseModules) {
  HMODULE m = GetModuleHandleW(name);
  if (m && !WwiseSeen[m]) { WwiseSeen[m] = true; HookWwise(m); }
 }
}
// Audio DLLs are often loaded right before first use: hook them as soon as the loader returns.
typedef LONG(NTAPI *LdrLoadFn)(PWSTR, PULONG, void *, PVOID *);
LdrLoadFn OLdrLoad;
LONG NTAPI HLdrLoad(PWSTR path, PULONG flags, void *name, PVOID *handle) {
 LONG st = OLdrLoad(path, flags, name, handle);
 if (st >= 0) HookExports();
 return st;
}

// ---- writer (dump thread only) ------------------------------------------------------------------------------------------
typedef ULONG(NTAPI *Crc32Fn)(ULONG, const void *, ULONG);
Crc32Fn Crc32;
std::map<ULONG, std::string> Written; // crc -> file
void Append(const std::wstring &path, const std::string &line) {
 HANDLE h = CreateFileW(path.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_ALWAYS, 0, NULL);
 if (h == INVALID_HANDLE_VALUE) return;
 DWORD w; WriteFile(h, line.data(), (DWORD)line.size(), &w, NULL); CloseHandle(h);
}
bool WriteWav(const std::wstring &path, const Fmt &f, const std::vector<unsigned char> &data) {
 struct { char riff[4]; DWORD size; char wave[4], fmt[4]; DWORD fsize; WORD tag, ch; DWORD rate, bps; WORD align, bits; char dat[4]; DWORD dsize; } h;
 memcpy(h.riff, "RIFF", 4); memcpy(h.wave, "WAVE", 4); memcpy(h.fmt, "fmt ", 4); memcpy(h.dat, "data", 4);
 h.fsize = 16; h.tag = (WORD)(f.tag == 0xFFFE ? (f.bits == 32 ? 3 : 1) : f.tag); h.ch = (WORD)f.ch; h.rate = f.rate; h.bits = (WORD)f.bits;
 h.align = (WORD)(f.ch * f.bits / 8); h.bps = h.rate * h.align; h.dsize = (DWORD)data.size(); h.size = 36 + h.dsize;
 std::wstring tmp = path + L".tmp";
 HANDLE fh = CreateFileW(tmp.c_str(), GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, 0, NULL);
 if (fh == INVALID_HANDLE_VALUE) return false;
 DWORD w1 = 0, w2 = 0;
 bool ok = WriteFile(fh, &h, sizeof h, &w1, NULL) && WriteFile(fh, data.data(), (DWORD)data.size(), &w2, NULL) && w1 == sizeof h && w2 == data.size();
 CloseHandle(fh);
 if (!ok || !MoveFileExW(tmp.c_str(), path.c_str(), MOVEFILE_REPLACE_EXISTING)) { DeleteFileW(tmp.c_str()); return false; }
 return true;
}
void Write(Ready &r) {
 std::string file; ULONG crc = 0; unsigned ms = 0;
 if (!r.data.empty()) {
  crc = Crc32 ? Crc32(0, r.data.data(), (ULONG)r.data.size()) : (ULONG)r.data.size();
  auto w = Written.find(crc);
  if (w != Written.end()) file = w->second;
  else {
   if (Spent + (LONGLONG)r.data.size() > Budget) return;
   char name[64]; sprintf_s(name, "%05ld_%s.wav", InterlockedIncrement(&Seq), r.api.c_str());
   std::wstring wname(name, name + strlen(name));
   CreateDirectoryW(Dir.c_str(), NULL);
   if (!WriteWav(Dir + wname, r.fmt, r.data)) return;
   file = name; Written[crc] = file; Spent += (LONGLONG)r.data.size();
  }
  unsigned align = r.fmt.ch * r.fmt.bits / 8;
  if (align && r.fmt.rate) ms = (unsigned)(r.data.size() / align * 1000ull / r.fmt.rate);
 }
 char obj[32]; sprintf_s(obj, "%p", (void *)r.obj);
 std::string line = "{\"file\":" + Json(file) + ",\"api\":\"" + r.api + "\",\"obj\":\"" + obj + "\",\"start\":" + std::to_string(r.start) +
  ",\"ms\":" + std::to_string(ms) + ",\"rate\":" + std::to_string(r.fmt.rate) + ",\"ch\":" + std::to_string(r.fmt.ch) + ",\"bits\":" + std::to_string(r.fmt.bits) +
  ",\"bytes\":" + std::to_string(r.data.size());
 char c[16]; sprintf_s(c, "%08lx", crc);
 line += std::string(",\"crc\":\"") + c + "\",\"stopped\":" + (r.stopped ? "true" : "false") + ",\"raw\":false,\"name\":" + Json(r.name.size() > 300 ? r.name.substr(r.name.size() - 300) : r.name) + "}\n";
 Append(Dir + L"events.jsonl", line);
}
}
using namespace audiomore;

void AudioMoreStart(const wchar_t *out) {
 if (InterlockedExchange(&Started, 1)) return;
 InitializeCriticalSection(&Lock); InitializeCriticalSection(&HookLock);
 Dir = std::wstring(out) + L"voice\\";
 CreateDirectoryW(Dir.c_str(), NULL);
 Crc32 = (Crc32Fn)GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "RtlComputeCrc32");
 HookExports();
 void *ldr = (void *)GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "LdrLoadDll");
 if (ldr && MH_CreateHook(ldr, (void *)HLdrLoad, (void **)&OLdrLoad) == MH_OK) MH_EnableHook(ldr);
}
// Every ~120 ms on the dump thread: hooks modules loaded since, closes quiet clips, writes them.
void AudioMoreTick() {
 if (!Started) return;
 HookExports();
 std::vector<Ready> ready; std::vector<std::string> notes;
 {
  Held h(&Lock);
  DWORD now = GetTickCount();
  for (auto &kv : Clips) {
   Clip &c = kv.second;
   if (c.data.empty()) continue;
   if (c.done || (c.playing && now - c.last > IdleMs)) Close(c);
   else if (!c.playing && now - c.last > 30000) c.data.clear(); // queued but never played
  }
  ready.swap(Queue); notes.swap(Notes);
 }
 std::wstring log = Dir.substr(0, Dir.size() - 6) + L"dump.log"; // <out>\dump.log
 for (auto &n : notes) Append(log, n);
 for (auto &r : ready) Write(r);
}
