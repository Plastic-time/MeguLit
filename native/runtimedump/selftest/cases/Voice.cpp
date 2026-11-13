// Voice module case (modules/Voice.cpp): a short silent "scenario" in the stand-in game. Every line is shown (written to
// voice/lines.jsonl the way MeguLit records hooked lines) and its voice reaches the game one of the ways engines do it:
//  - file reads: a loose voice\NNN.ogg read whole, an encrypted archive entry decrypted in place (Pack::ReadInPlace);
//  - audio APIs: DirectSound static buffer, DirectSound streaming ring buffer (KiriKiri style), waveOut, XAudio2;
//  - both: the voice file is read, then its PCM is played (the module should keep the file);
// with the start jittered around the line, a click sound on every advance, looping music, unvoiced lines, one line
// skipped mid-voice and one backlog replay. All output is silent (volume at minimum).
// Each voice carries its id: sample 1 of the PCM, int16 at 0x30 of a voice file. The case checks every voice was saved;
// validation/voice-harvest.test.cjs then checks line -> voice from this output (voice-truth.json in the game folder).
#include "../fakegame.h"
#include <mmsystem.h>
#include <dsound.h>
#include <xaudio2.h>
#include <math.h>
#pragma comment(lib, "dsound.lib")
#pragma comment(lib, "winmm.lib")
#pragma comment(lib, "xaudio2.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "user32.lib")

namespace {
const DWORD Rate = 22050;
typedef std::vector<short> Clip;
Clip Tone(int id, DWORD ms, double hz) {
 Clip c(Rate * ms / 1000);
 for (size_t i = 0; i < c.size(); i++) c[i] = (short)((short)(9000 * sin(6.283185 * hz * i / Rate)) | 0x200);
 c[0] = 0x7000; c[1] = (short)id; return c;
}
// A stand-in Ogg Vorbis file: real page header and identification packet start, id at 0x30, then filler.
std::string FakeOgg(int id, DWORD size) {
 std::string f(size, '\0');
 memcpy(&f[0], "OggS", 4); f[5] = 2; memcpy(&f[0x1C], "\x01vorbis", 7);
 short v = (short)id; memcpy(&f[0x30], &v, 2);
 for (DWORD i = 0x40; i < size; i++) f[i] = (char)((i * 7 + id) & 0xFF);
 return f;
}
ULONGLONG NowMs() { FILETIME f; GetSystemTimeAsFileTime(&f); ULARGE_INTEGER u; u.LowPart = f.dwLowDateTime; u.HighPart = f.dwHighDateTime; return u.QuadPart / 10000 - 11644473600000ULL; }
void AppendFile(const std::string &path, const std::string &s) {
 HANDLE h = CreateFileA(path.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_ALWAYS, 0, NULL);
 DWORD w; WriteFile(h, s.data(), (DWORD)s.size(), &w, NULL); CloseHandle(h);
}

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
struct Streamer {
 IDirectSoundBuffer *b; DWORD ring, pos; std::vector<short> queue; size_t at; bool on; int silence;
 void Begin(const Clip &c) { queue = c; at = 0; silence = 0; pos = 0; b->SetCurrentPosition(0); std::vector<short> z(ring / 2); Fill(b, 0, z.data(), ring); Pump(); b->Play(0, 0, DSBPLAY_LOOPING); on = true; }
 void Pump() {
  DWORD chunk = Rate / 10 * 2; std::vector<short> buf(chunk / 2);
  size_t left = queue.size() - at, take = left < buf.size() ? left : buf.size();
  if (take) memcpy(buf.data(), &queue[at], take * 2); at += take; if (!take) silence++;
  Fill(b, pos, buf.data(), chunk); pos = (pos + chunk) % ring;
 }
 void Tick() { if (!on) return; Pump(); if (silence > 12) { b->Stop(); on = false; } }
 void Cut() { if (on) { b->Stop(); on = false; } }
};
struct WaveOut {
 HWAVEOUT h; WAVEHDR hdr; std::vector<short> data;
 bool Open() { if (waveOutOpen(&h, WAVE_MAPPER, &Wf, 0, 0, CALLBACK_NULL) != MMSYSERR_NOERROR) { h = NULL; return false; } waveOutSetVolume(h, 0); memset(&hdr, 0, sizeof hdr); return true; }
 void Play(const Clip &c) { // a device per sound, as many engines do
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
std::string Utf8(const wchar_t *s) { int n = WideCharToMultiByte(CP_UTF8, 0, s, -1, NULL, 0, NULL, NULL); std::string r(n, 0); WideCharToMultiByte(CP_UTF8, 0, s, -1, &r[0], n, NULL, NULL); r.resize(n - 1); return r; }
int Found(const std::string &voiceDir, int id) { // 1 if a saved clip or file carries this id
 WIN32_FIND_DATAA f; HANDLE h = FindFirstFileA((voiceDir + "0*.*").c_str(), &f); if (h == INVALID_HANDLE_VALUE) return 0;
 int hit = 0;
 do {
  DWORD n = 0; char *b = ReadAll(voiceDir + f.cFileName, &n); if (!b) continue;
  if (n > 0x40 && !memcmp(b, "OggS", 4) && *(short *)(b + 0x30) == id) hit = 1;
  if (n > 48 && !memcmp(b, "RIFF", 4) && *(short *)(b + 44 + 2) == id) hit = 1;
  free(b);
 } while (!hit && FindNextFileA(h, &f));
 FindClose(h); return hit;
}
}

int CaseVoice(FakeGame &g) {
 CoInitializeEx(NULL, COINIT_MULTITHREADED);
 std::string vdir = g.dir + "voice\\";
 bool haveDs = SUCCEEDED(DirectSoundCreate8(NULL, &Ds, NULL)) && SUCCEEDED(Ds->SetCooperativeLevel(GetDesktopWindow(), DSSCL_PRIORITY));
 bool haveXa = SUCCEEDED(XAudio2Create(&Xa, 0, XAUDIO2_DEFAULT_PROCESSOR)) && SUCCEEDED(Xa->CreateMasteringVoice(&Master));
 WaveOut wo = {}; bool haveWo = wo.Open(); if (haveWo) { waveOutClose(wo.h); wo.h = NULL; }
 // The module hooks audio libraries it finds loaded; give it a couple of ticks to see these.
 for (int i = 0; i < 40; i++) { Sleep(100); DWORD n = 0; char *b = ReadAll(vdir + "voice.log", &n); bool ok = b && (!haveDs || strstr(std::string(b, n).c_str(), "dsound")); free(b); if (ok) break; }

 // Voice files: loose voice\NNN.ogg, and an encrypted archive.
 CreateDirectoryA("voice", NULL);
 std::vector<std::pair<std::string, std::string>> entries;
 for (int i = 0; i < 6; i++) { char n[32]; sprintf_s(n, "v%03d.ogg", 300 + i); entries.push_back({ n, FakeOgg(300 + i, 6000 + i * 911) }); }
 Pack pak; pak.Write("voice.fpk", entries);
 for (int i = 0; i < 6; i++) { char n[32]; sprintf_s(n, "voice\\v%03d.ogg", 400 + i); Put(n, FakeOgg(400 + i, 5000 + i * 733)); }

 Clip click = Tone(-2, 450, 1800);
 IDirectSoundBuffer *se = haveDs ? DsBuffer((DWORD)click.size() * 2) : NULL; if (se) Fill(se, 0, click.data(), (DWORD)click.size() * 2);
 Streamer music = { haveDs ? DsBuffer(Rate * 2) : NULL, Rate * 2, 0, {}, 0, false, 0 };
 Clip bgm = Tone(-3, 60000, 110); if (music.b) music.Begin(bgm);
 Streamer stream = { haveDs ? DsBuffer(Rate * 2) : NULL, Rate * 2, 0, {}, 0, false, 0 };
 IDirectSoundBuffer *staticBuf = haveDs ? DsBuffer(Rate * 2 * 2) : NULL;
 IXAudio2SourceVoice *xv = NULL;

 const char *ways[] = { "file", "dsound-static", "pack", "dsound-stream", "file+dsound", "waveout", "xaudio2" };
 std::string truth = "[", lines = vdir + "lines.jsonl";
 std::vector<int> want;
 int fileAt = 0, packAt = 0, pcmAt = 0; unsigned seed = 11;
 auto rnd = [&]() { seed = seed * 1664525 + 1013904223; return seed >> 8; };
 auto wait = [&](DWORD ms) { for (DWORD t = 0; t < ms; t += 100) { Sleep(100); if (music.b) music.Tick(); if (stream.b) stream.Tick(); } };
 for (int line = 0; line < 20; line++) {
  wchar_t text[128]; swprintf_s(text, L"めぐみん「声のテスト、%d番目の台詞です」", line);
  const char *way = ways[line % 7];
  bool voiced = line % 6 != 5;
  if (!haveDs && strstr(way, "dsound")) way = "file";
  if ((!strcmp(way, "waveout") && !haveWo) || (!strcmp(way, "xaudio2") && !haveXa)) way = "pack";
  if (!strcmp(way, "file") && fileAt >= 6) way = "pack";
  if (!strcmp(way, "pack") && packAt >= 6) way = "dsound-static";
  int id = -1, lead = (int)(rnd() % 600) - 250;
  if (se) { se->SetCurrentPosition(0); se->Play(0, 0, 0); }
  auto show = [&]() { char l[256]; sprintf_s(l, "{\"t\":%llu,\"text\":\"%s\"}\n", NowMs(), Utf8(text).c_str()); AppendFile(lines, l); };
  auto play = [&]() {
   if (!strcmp(way, "file") || !strcmp(way, "file+dsound")) {
    char n[32]; sprintf_s(n, "voice\\v%03d.ogg", 400 + fileAt); id = 400 + fileAt++;
    DWORD k = 0; char *b = ReadAll(n, &k); g.Hold(b);
    if (!strcmp(way, "file+dsound")) { Clip c = Tone(id, 700, 500); Fill(staticBuf, 0, c.data(), (DWORD)c.size() * 2); staticBuf->SetCurrentPosition(0); staticBuf->Play(0, 0, 0); }
   } else if (!strcmp(way, "pack")) {
    char n[32]; sprintf_s(n, "v%03d.ogg", 300 + packAt); id = 300 + packAt++;
    DWORD k = 0; char *b = pak.ReadInPlace(n, &k); g.Hold(b);
   } else {
    id = 100 + pcmAt++; Clip c = Tone(id, 500 + (id * 137) % 700, 300 + id);
    if (!strcmp(way, "dsound-static")) { staticBuf->Stop(); Fill(staticBuf, 0, c.data(), (DWORD)c.size() * 2); staticBuf->SetCurrentPosition(0); staticBuf->Play(0, 0, 0); }
    else if (!strcmp(way, "dsound-stream")) stream.Begin(c);
    else if (!strcmp(way, "waveout")) wo.Play(c);
    else { if (xv) xv->DestroyVoice(); xv = XPlay(c); }
   }
  };
  if (!voiced) show();
  else if (lead < 0) { play(); Sleep(-lead); show(); }
  else { show(); Sleep(lead); play(); }
  char t[300]; sprintf_s(t, "%s{\"text\":\"%s\",\"id\":%d,\"way\":\"%s\",\"skip\":%s}", line ? "," : "", Utf8(text).c_str(), voiced ? id : -1, voiced ? way : "", line == 3 ? "true" : "false");
  truth += t; if (voiced) want.push_back(id);
  if (line == 3) { wait(250); stream.Cut(); wait(400); } // skipped while its (streamed) voice plays
  else wait(1700);
  if (line == 8 && staticBuf) { staticBuf->SetCurrentPosition(0); staticBuf->Play(0, 0, 0); wait(900); } // backlog replay
 }
 if (music.b) music.Cut();
 truth += "]";
 Put(g.game + "\\voice-truth.json", truth);
 wait(2000); // the module writes the last clips
 int fail = 0;
 for (int id : want) if (!Found(vdir, id)) { printf("FAIL voice %d not saved\n", id); fail++; }
 printf("voice case: dsound=%d xaudio2=%d waveout=%d, %d voices\n", haveDs, haveXa, haveWo, (int)want.size());
 return fail;
}
