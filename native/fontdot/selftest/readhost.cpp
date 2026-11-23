// Replay test of MeguLitFontDot's ReadFile hook (the game's read path). Usage: readhost.exe <MeguLitFontDot.dll> <font.ttf>
//  1. same bytes: a whole-font read returns FontDot::Patch of the original; a later 4 KiB read inside the font returns
//     the same patched bytes (the registered range);
//  2. no waiting: while the background scan walks a 512 MiB region (several scans in 5 s), 4 KiB reads inside the font
//     must stay fast (p99 < 2 ms, at most one read over 10 ms) - before 2026-11-19 every game read waited for the scan's
//     lock, which costs one slow read per scan (the scan runs every 2 s here, so two or more in the window); a single
//     slow read is the runner descheduling the test (CI runs failed on max 10.6 ms and 38 ms with p99 at 0.08 ms);
//  3. reports still arrive on \\.\pipe\MeguLitFontDot-<pid> (ready, registered, patched), sent off the game thread.
// Exit code 0 = passed.
#include <windows.h>
#include <stdio.h>
#include <string>
#include <vector>
#include <algorithm>
#include "../FontDotPatch.h"

static std::string Got; static CRITICAL_SECTION GotLock;
static DWORD WINAPI Listen(void *) {
 wchar_t name[64]; swprintf_s(name, L"\\\\.\\pipe\\MeguLitFontDot-%lu", GetCurrentProcessId());
 for (;;) {
  HANDLE p = CreateNamedPipeW(name, PIPE_ACCESS_INBOUND, PIPE_TYPE_BYTE | PIPE_WAIT, 1, 0, 1 << 16, 0, NULL); if (p == INVALID_HANDLE_VALUE) return 1;
  if (ConnectNamedPipe(p, NULL) || GetLastError() == ERROR_PIPE_CONNECTED) { char b[4096]; DWORD n; while (ReadFile(p, b, sizeof b, &n, NULL) && n) { EnterCriticalSection(&GotLock); Got.append(b, n); LeaveCriticalSection(&GotLock); } }
  CloseHandle(p);
 }
}
static bool Has(const char *s) { EnterCriticalSection(&GotLock); bool r = Got.find(s) != std::string::npos; LeaveCriticalSection(&GotLock); return r; }

int wmain(int argc, wchar_t **argv) {
 if (argc < 3) { printf("usage: readhost <dll> <font>\n"); return 2; }
 InitializeCriticalSection(&GotLock); CreateThread(NULL, 0, Listen, NULL, 0, NULL); Sleep(50);
 // the original font, read before the hook exists, and a private copy the test reads through the hook
 HANDLE f = CreateFileW(argv[2], GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL); if (f == INVALID_HANDLE_VALUE) { printf("FAIL no font\n"); return 1; }
 LARGE_INTEGER sz; GetFileSizeEx(f, &sz); std::vector<uint8_t> orig((size_t)sz.QuadPart); DWORD n = 0; ReadFile(f, orig.data(), (DWORD)orig.size(), &n, NULL); CloseHandle(f);
 wchar_t tmp[MAX_PATH], copy[MAX_PATH]; GetTempPathW(MAX_PATH, tmp); swprintf_s(copy, L"%smegulit-fontdot-read-%lu.ttf", tmp, GetCurrentProcessId());
 if (!CopyFileW(argv[2], copy, FALSE)) { printf("FAIL copy\n"); return 1; }
 std::vector<uint8_t> want = orig; FontDot::Result pr = FontDot::Patch(want.data(), want.size()); if (!pr.ok) { printf("FAIL patch refused the font\n"); return 1; }
 // a big writable region: every scan walks it under the scan lock
 size_t big = 512u << 20; uint8_t *mem = (uint8_t *)VirtualAlloc(NULL, big, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE); if (!mem) { printf("FAIL alloc\n"); return 1; }
 for (size_t i = 0; i < big; i += 4096) mem[i] = 1;
 if (!LoadLibraryW(argv[1])) { printf("FAIL load %lu\n", GetLastError()); return 1; }
 int fails = 0;
 HANDLE h = CreateFileW(copy, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL);
 std::vector<uint8_t> whole(orig.size()); n = 0; ReadFile(h, whole.data(), (DWORD)whole.size(), &n, NULL);
 bool same = n == whole.size() && whole == want; printf("%s whole read is the patched font (%lu bytes, dotted=%d)\n", same ? "ok  " : "FAIL", n, pr.dotted); fails += !same;
 // reads inside the font while the scanner runs
 LARGE_INTEGER fq; QueryPerformanceFrequency(&fq); std::vector<double> ms; DWORD start = GetTickCount(); bool chunkOk = true; std::vector<uint8_t> chunk(4096);
 DWORD off = (DWORD)(std::min)((size_t)8192, orig.size() - 4096);
 while (GetTickCount() - start < 5000) {
  OVERLAPPED o{}; o.Offset = off; LARGE_INTEGER a, b; QueryPerformanceCounter(&a); DWORD got = 0; ReadFile(h, chunk.data(), 4096, &got, &o); QueryPerformanceCounter(&b);
  ms.push_back((b.QuadPart - a.QuadPart) * 1000.0 / fq.QuadPart); if (got != 4096 || memcmp(chunk.data(), want.data() + off, 4096)) chunkOk = false;
  Sleep(1);
 }
 CloseHandle(h);
 std::sort(ms.begin(), ms.end()); double p99 = ms[ms.size() * 99 / 100], mx = ms.back();
 printf("%s range reads are patched (%zu reads)\n", chunkOk ? "ok  " : "FAIL", ms.size()); fails += !chunkOk;
 size_t slow = (size_t)std::count_if(ms.begin(), ms.end(), [](double v) { return v >= 10.0; });
 bool fast = p99 < 2.0 && slow <= 1; printf("%s read latency during scans p50=%.3f p99=%.3f max=%.3f ms, %zu over 10 ms\n", fast ? "ok  " : "FAIL", ms[ms.size() / 2], p99, mx, slow); fails += !fast;
 for (int i = 0; i < 60 && !(Has("ToMe_FONTDOT ready") && Has("ToMe_FONTDOT registered file") && Has("ToMe_FONTDOT patched src=file")); i++) Sleep(100);
 bool rep = Has("ToMe_FONTDOT ready") && Has("ToMe_FONTDOT registered file") && Has("ToMe_FONTDOT patched src=file");
 printf("%s reports arrive on the pipe\n", rep ? "ok  " : "FAIL"); fails += !rep;
 DeleteFileW(copy);
 printf(fails ? "FAILED %d\n" : "PASSED\n", fails); fflush(stdout); TerminateProcess(GetCurrentProcess(), fails ? 1 : 0); return fails ? 1 : 0;
}
