// Stand-in "game" for the voice harvest in MeguLitDump32/64.dll (Voice.cpp). No real game is involved.
// It keeps its voice clips in an encrypted pack file, reads the pack with ReadFile and decrypts each clip in memory, then
// plays a short "scenario": every line is "shown" (written to lines.jsonl the way MeguLit records hooked lines) and its
// voice is handed to DirectSound (static buffer, and streaming ring buffer as KiriKiri does), waveOut or XAudio2, with
// the start jittered around the line. A click sound effect plays on every advance, music loops underneath, some lines
// have no voice, one is skipped while its voice plays, and one voice is replayed from the "backlog".
// All output is silent (volume at minimum). Each clip's second sample is its id, so the test can tell which clip it got.
// Usage: voicehost.exe <MeguLitDump.dll> <output root>. Writes truth.json next to itself.
#include <windows.h>
#include <mmsystem.h>
#include <dsound.h>
#include <xaudio2.h>
#include <stdio.h>
#include <math.h>
#include <string>
#include <vector>

const DWORD Rate = 22050;
typedef std::vector<short> Clip;

Clip Tone(int id, DWORD ms, double hz) {
 Clip c(Rate * ms / 1000);
 for (size_t i = 0; i < c.size(); i++) c[i] = (short)(9000 * sin(6.283185 * hz * i / Rate)) | 0x200; // never "silent"
 c[0] = 0x7000; c[1] = (short)id;
 return c;
}
std::string Utf8(const wchar_t *s) { int n = WideCharToMultiByte(CP_UTF8, 0, s, -1, NULL, 0, NULL, NULL); std::string r(n, 0); WideCharToMultiByte(CP_UTF8, 0, s, -1, &r[0], n, NULL, NULL); r.resize(n - 1); return r; }
ULONGLONG NowMs() { FILETIME f; GetSystemTimeAsFileTime(&f); ULARGE_INTEGER u; u.LowPart = f.dwLowDateTime; u.HighPart = f.dwHighDateTime; return u.QuadPart / 10000 - 11644473600000ULL; }
void AppendFile(const std::wstring &path, const std::string &s) {
 HANDLE h = CreateFileW(path.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_ALWAYS, 0, NULL);
 DWORD w; WriteFile(h, s.data(), (DWORD)s.size(), &w, NULL); CloseHandle(h);
}
void Cipher(unsigned char *p, size_t n, unsigned key) { for (size_t i = 0; i < n; i++) { key = key * 1103515245 + 12345; p[i] ^= (unsigned char)(key >> 16); } }

// ---- players ----------------------------------------------------------------------------------------------------------
IDirectSound8 *Ds; IXAudio2 *Xa; IXAudio2MasteringVoice *Master;
WAVEFORMATEX Wf = { WAVE_FORMAT_PCM, 1, Rate, Rate * 2, 2, 16, 0 };
IDirectSoundBuffer *DsBuffer(DWORD bytes) {
 DSBUFFERDESC d = { sizeof d, DSBCAPS_CTRLVOLUME | DSBCAPS_GLOBALFOCUS, bytes, 0, &Wf };
 IDirectSoundBuffer *b = NULL; if (FAILED(Ds->CreateSoundBuffer(&d, &b, NULL))) return NULL;
 b->SetVolume(DSBVOLUME_MIN); return b;
}
void Fill(IDirectSoundBuffer *b, DWORD at, const void *p, DWORD n) {
 void *a1, *a2; DWORD n1, n2;
 if (FAILED(b->Lock(at, n, &a1, &n1, &a2, &n2, 0))) return;
 memcpy(a1, p, n1); if (a2) memcpy(a2, (const char *)p + n1, n2);
 b->Unlock(a1, n1, a2, n2);
}
// Streaming player (ring buffer, looping): writes 100 ms chunks as the "game" decodes, then silence, then stops.
struct Streamer {
 IDirectSoundBuffer *b; DWORD ring, pos; std::vector<short> queue; size_t at; bool on; int silence;
 void Begin(const Clip &c) { queue = c; at = 0; silence = 0; pos = 0; b->SetCurrentPosition(0); std::vector<short> z(ring / 2); Fill(b, 0, z.data(), ring); pos = 0; Pump(); b->Play(0, 0, DSBPLAY_LOOPING); on = true; }
 void Pump() {
  DWORD chunk = Rate / 10 * 2; std::vector<short> buf(chunk / 2);
  size_t left = queue.size() - at, take = left < buf.size() ? left : buf.size();
  if (take) memcpy(buf.data(), &queue[at], take * 2); at += take;
  if (!take) silence++;
  Fill(b, pos, buf.data(), chunk); pos = (pos + chunk) % ring;
 }
 void Tick() { if (!on) return; Pump(); if (silence > 12) { b->Stop(); on = false; } }
 void Cut() { if (on) { b->Stop(); on = false; } }
};
struct WaveOut {
 HWAVEOUT h; WAVEHDR hdr; std::vector<short> data;
 bool Open() { if (waveOutOpen(&h, WAVE_MAPPER, &Wf, 0, 0, CALLBACK_NULL) != MMSYSERR_NOERROR) return false; waveOutSetVolume(h, 0); memset(&hdr, 0, sizeof hdr); return true; }
 // Like many engines, a device per sound: closed and opened again for the next one.
 void Play(const Clip &c) {
  if (h) { waveOutReset(h); if (hdr.dwFlags & WHDR_PREPARED) waveOutUnprepareHeader(h, &hdr, sizeof hdr); waveOutClose(h); h = NULL; }
  if (!Open()) return;
  data = c; memset(&hdr, 0, sizeof hdr); hdr.lpData = (LPSTR)data.data(); hdr.dwBufferLength = (DWORD)data.size() * 2;
  waveOutPrepareHeader(h, &hdr, sizeof hdr); waveOutWrite(h, &hdr, sizeof hdr);
 }
};
IXAudio2SourceVoice *XPlay(const Clip &c) {
 IXAudio2SourceVoice *v = NULL; if (FAILED(Xa->CreateSourceVoice(&v, &Wf))) return NULL;
 v->SetVolume(0);
 XAUDIO2_BUFFER b = {}; b.Flags = XAUDIO2_END_OF_STREAM; b.AudioBytes = (UINT32)c.size() * 2; b.pAudioData = (const BYTE *)c.data();
 v->SubmitSourceBuffer(&b); v->Start(0); return v;
}

int wmain(int argc, wchar_t **argv) {
 if (argc < 3) { fwprintf(stderr, L"usage: voicehost <dll> <out root>\n"); return 2; }
 SetEnvironmentVariableW(L"MEGULIT_RUNTIME_DUMP", argv[2]);
 SetEnvironmentVariableW(L"MEGULIT_RUNTIME_DUMP_ON", NULL);
 CoInitializeEx(NULL, COINIT_MULTITHREADED);
 // Audio APIs are up before the DLL arrives (MeguLit injects into a running game).
 bool haveDs = SUCCEEDED(DirectSoundCreate8(NULL, &Ds, NULL)) && SUCCEEDED(Ds->SetCooperativeLevel(GetDesktopWindow(), DSSCL_PRIORITY));
 bool haveXa = SUCCEEDED(XAudio2Create(&Xa, 0, XAUDIO2_DEFAULT_PROCESSOR)) && SUCCEEDED(Xa->CreateMasteringVoice(&Master));
 WaveOut wo = {}; bool haveWo = wo.Open(); if (haveWo) { waveOutClose(wo.h); wo.h = NULL; }
 printf("audio: dsound=%d xaudio2=%d waveout=%d\n", haveDs, haveXa, haveWo);
 if (!haveDs) { fprintf(stderr, "no DirectSound device; cannot test\n"); return 3; }

 // The folder MeguLit's DLL writes to: <out>\<FNV-1a of the lower-case game folder>\.
 wchar_t game[1024]; GetModuleFileNameW(NULL, game, 1024); *wcsrchr(game, L'\\') = 0;
 unsigned hash = 2166136261u; for (wchar_t *p = game; *p; p++) { wchar_t c = *p; if (c >= L'A' && c <= L'Z') c = (wchar_t)(c + 32); hash = (hash ^ (unsigned)c) * 16777619u; }
 wchar_t dir[1024]; swprintf_s(dir, L"%s\\%08x\\voice\\", argv[2], hash);

 if (!LoadLibraryW(argv[1])) { fprintf(stderr, "LoadLibrary failed %lu\n", GetLastError()); return 4; }
 // Wait for the harvest to hook what this process uses.
 std::wstring logPath = std::wstring(dir) + L"voice.log";
 for (int i = 0; i < 100; i++) {
  Sleep(100);
  HANDLE h = CreateFileW(logPath.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_EXISTING, 0, NULL);
  if (h == INVALID_HANDLE_VALUE) continue; char b[2048] = {}; DWORD n = 0; ReadFile(h, b, sizeof b - 1, &n, NULL); CloseHandle(h);
  if (strstr(b, "dsound") && (!haveXa || strstr(b, "xaudio2")) && (!haveWo || strstr(b, "waveout"))) break;
 }

 // The voice pack: N clips, each encrypted with its own key, stored back to back in voice.pak.
 const int N = 28;
 std::vector<Clip> plain;
 for (int i = 0; i < N; i++) plain.push_back(Tone(100 + i, 500 + (i * 137) % 700, 300 + i * 23));
 std::wstring pak = std::wstring(game) + L"\\voice.pak";
 { HANDLE h = CreateFileW(pak.c_str(), GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, 0, NULL); DWORD w;
   for (int i = 0; i < N; i++) { std::vector<unsigned char> e((unsigned char *)plain[i].data(), (unsigned char *)plain[i].data() + plain[i].size() * 2); Cipher(e.data(), e.size(), 0xC0DE + i); DWORD n = (DWORD)e.size(); WriteFile(h, &n, 4, &w, NULL); WriteFile(h, e.data(), n, &w, NULL); }
   CloseHandle(h); }
 std::vector<Clip> voices;
 { HANDLE h = CreateFileW(pak.c_str(), GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL); DWORD r;
   for (int i = 0; i < N; i++) { DWORD n = 0; ReadFile(h, &n, 4, &r, NULL); Clip c(n / 2); ReadFile(h, c.data(), n, &r, NULL); Cipher((unsigned char *)c.data(), n, 0xC0DE + i); voices.push_back(c); }
   CloseHandle(h); }
 for (int i = 0; i < N; i++) if (voices[i] != plain[i]) { fprintf(stderr, "pack round trip failed\n"); return 5; }

 // Sound effect and music.
 Clip click = Tone(-2, 450, 1800); click[1] = -2;
 IDirectSoundBuffer *se = DsBuffer((DWORD)click.size() * 2); Fill(se, 0, click.data(), (DWORD)click.size() * 2);
 Streamer music = { DsBuffer(Rate * 2), Rate * 2, 0, {}, 0, false, 0 };
 Clip bgm = Tone(-3, 60000, 110); music.Begin(bgm);
 Streamer stream = { DsBuffer(Rate * 2), Rate * 2, 0, {}, 0, false, 0 };
 IDirectSoundBuffer *staticBuf = DsBuffer(Rate * 2 * 2);
 IXAudio2SourceVoice *xv = NULL;

 std::wstring linesPath = std::wstring(dir) + L"lines.jsonl";
 std::string truth = "[";
 const char *apis[] = { "dsound-static", "dsound-stream", "waveout", "xaudio2" };
 int voiceAt = 0; unsigned seed = 7;
 auto rnd = [&]() { seed = seed * 1664525 + 1013904223; return seed >> 8; };
 auto wait = [&](DWORD ms) { for (DWORD t = 0; t < ms; t += 100) { Sleep(100); music.Tick(); stream.Tick(); } };
 for (int line = 0; line < 36; line++) {
  wchar_t text[128]; swprintf_s(text, L"めぐみん「これは%d番目の台詞です」", line);
  bool voiced = line % 5 != 3 && voiceAt < N, skip = line == 9;
  const char *api = apis[line % 4];
  if ((!strcmp(api, "xaudio2") && !haveXa) || (!strcmp(api, "waveout") && !haveWo)) api = apis[line % 2];
  int lead = (int)(rnd() % 600) - 250; // voice from 250 ms before to 350 ms after the hook sees the line
  se->SetCurrentPosition(0); se->Play(0, 0, 0);
  auto show = [&]() { char l[256]; sprintf_s(l, "{\"t\":%llu,\"text\":\"%s\"}\n", NowMs(), Utf8(text).c_str()); AppendFile(linesPath, l); };
  auto play = [&](const Clip &c) {
   if (!strcmp(api, "dsound-static")) { staticBuf->Stop(); Fill(staticBuf, 0, c.data(), (DWORD)c.size() * 2); staticBuf->SetCurrentPosition(0); staticBuf->Play(0, 0, 0); }
   else if (!strcmp(api, "dsound-stream")) stream.Begin(c);
   else if (!strcmp(api, "waveout")) wo.Play(c);
   else { if (xv) xv->DestroyVoice(); xv = XPlay(c); }
  };
  if (!voiced) { show(); }
  else if (lead < 0) { play(voices[voiceAt]); Sleep(-lead); show(); }
  else { show(); Sleep(lead); play(voices[voiceAt]); }
  char t[256]; sprintf_s(t, "%s{\"text\":\"%s\",\"id\":%d,\"api\":\"%s\"}", line ? "," : "", Utf8(text).c_str(), voiced ? 100 + voiceAt : -1, voiced ? api : "");
  truth += t;
  if (voiced) voiceAt++;
  if (skip) { wait(250); stream.Cut(); staticBuf->Stop(); if (wo.h) waveOutReset(wo.h); if (xv) xv->Stop(0); wait(400); }
  else wait(2700);
  if (line == 20) { staticBuf->SetCurrentPosition(0); staticBuf->Play(0, 0, 0); wait(1500); } // backlog replay of the last static voice
 }
 music.Cut();
 truth += "]";
 { std::wstring p = std::wstring(game) + L"\\truth.json"; HANDLE h = CreateFileW(p.c_str(), GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, 0, NULL); DWORD w; WriteFile(h, truth.data(), (DWORD)truth.size(), &w, NULL); CloseHandle(h); }
 wait(2500); // let the harvest write the last clips
 printf("done: %d voiced lines\n", voiceAt);
 return 0;
}
