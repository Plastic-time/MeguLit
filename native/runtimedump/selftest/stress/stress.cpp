// SPDX-License-Identifier: GPL-3.0-or-later
// Crash stress for MeguLitDump32/64.dll (2026-11-20): the probe must never take the game down. Usage (run.ps1 builds it):
//   stress.exe <MeguLitDump.dll> <dump root> <rounds>     exit 0 = no crash, no fault the game could see
// What it does, per round, with the heap watch armed by a tracked ReadFile:
//  * starts fresh threads on tiny stacks (64 KB) that allocate in the armed size window right away. The DLL's TLS index
//    is pushed past 64 first, so its first TlsSetValue on each new thread allocates the TLS expansion slots through
//    the hooked RtlAllocateHeap: the 2026-11-20 CHAOS;CHILD crash (unbounded HAlloc -> Guard -> TlsSetValue -> HAlloc
//    recursion, 0xC00000FD on a game thread);
//  * reads into buffers it then frees, makes no-access, turns into guard pages or unmaps, while they are watched;
//  * does all of that from several threads at once.
// A vectored handler counts access violations, guard-page hits and stack overflows raised anywhere in the process.
#include "../fakegame.h"
#include <time.h>

static volatile LONG Faults, Overflows;
static LONG CALLBACK Count(EXCEPTION_POINTERS *x) {
 DWORD c = x->ExceptionRecord->ExceptionCode;
 if (c == EXCEPTION_STACK_OVERFLOW) InterlockedIncrement(&Overflows);
 if (c == EXCEPTION_ACCESS_VIOLATION || c == EXCEPTION_GUARD_PAGE || c == EXCEPTION_IN_PAGE_ERROR) InterlockedIncrement(&Faults);
 return EXCEPTION_CONTINUE_SEARCH;
}
static std::string Text;
static void ReadInto(const char *file, void *buf, DWORD n) {
 HANDLE h = CreateFileA(file, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL); DWORD got = 0;
 if (h != INVALID_HANDLE_VALUE) { ReadFile(h, buf, n, &got, NULL); CloseHandle(h); }
}
static DWORD WINAPI Fresh(void *arg) {
 DWORD n = (DWORD)(ULONG_PTR)arg;
 for (int k = 0; k < 4; k++) { void *p = HeapAlloc(GetProcessHeap(), 0, n + k * 512); if (p) { memset(p, k, n); HeapFree(GetProcessHeap(), 0, p); } }
 void *m = malloc(n); free(m);
 return 0;
}
static DWORD WINAPI Abuse(void *arg) {
 int kind = (int)(ULONG_PTR)arg; DWORD n = (DWORD)Text.size(); SYSTEM_INFO si; GetSystemInfo(&si); DWORD page = si.dwPageSize;
 DWORD span = (n + page - 1) / page * page;
 char *v = (char *)VirtualAlloc(NULL, span, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
 if (!v) return 0;
 ReadInto("arm.dat", v, n);
 DWORD old;
 switch (kind % 4) {
 case 0: VirtualFree(v, 0, MEM_RELEASE); return 0;                          // freed while watched
 case 1: VirtualProtect(v, span, PAGE_NOACCESS, &old); Sleep(1); break;    // no access
 case 2: VirtualProtect(v, span, PAGE_READWRITE | PAGE_GUARD, &old); Sleep(1); break; // guard pages
 case 3: VirtualFree(v, span, MEM_DECOMMIT); Sleep(1); break;              // reserved, not committed
 }
 VirtualFree(v, 0, MEM_RELEASE);
 return 0;
}
static void Mapped() {
 HANDLE f = CreateFileA("arm.dat", GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL);
 if (f == INVALID_HANDLE_VALUE) return;
 HANDLE m = CreateFileMappingW(f, NULL, PAGE_WRITECOPY, 0, 0, NULL);
 if (m) { void *p = MapViewOfFile(m, FILE_MAP_COPY, 0, 0, 0); if (p) { ((char *)p)[0] ^= 1; UnmapViewOfFile(p); } CloseHandle(m); }
 CloseHandle(f);
}

int main(int argc, char **argv) {
 if (argc < 4) { printf("usage: stress <dll> <root> <rounds>\n"); return 2; }
 int rounds = atoi(argv[3]);
 for (int i = 0; i < 80; i++) TlsAlloc(); // the DLL's own index lands past the 64 inline slots
 AddVectoredExceptionHandler(1, Count);
 Text = Repeat(Encode(L"「探針はゲームを落としてはいけません、何があっても」\r\n", 932), 60);
 Put("arm.dat", Text);
 FakeGame g; int r = g.Start(argv[1], argv[2]); if (r) return r;
 DWORD t0 = GetTickCount(); long threads = 0, abuses = 0;
 for (int round = 0; round < rounds; round++) {
  std::vector<char> buf(Text.size()); ReadInto("arm.dat", &buf[0], (DWORD)buf.size()); // arms the heap watch
  HANDLE hs[16]; int k = 0;
  for (; k < 12; k++) {
   DWORD n = (DWORD)Text.size() + (DWORD)(k * 700);
   hs[k] = CreateThread(NULL, 64 * 1024, Fresh, (void *)(ULONG_PTR)n, STACK_SIZE_PARAM_IS_A_RESERVATION, NULL);
   if (!hs[k]) break;
  }
  threads += k;
  for (int a = 0; a < 4 && k < 16; a++, k++) { hs[k] = CreateThread(NULL, 64 * 1024, Abuse, (void *)(ULONG_PTR)(round + a), STACK_SIZE_PARAM_IS_A_RESERVATION, NULL); if (!hs[k]) break; abuses++; }
  Mapped();
  WaitForMultipleObjects(k, hs, TRUE, 10000);
  for (int i = 0; i < k; i++) CloseHandle(hs[i]);
 }
 Sleep(1500); // let the poller look at whatever is still listed
 DWORD ms = GetTickCount() - t0;
 printf("rounds=%d threads=%ld abuse=%ld ms=%lu faults=%ld overflows=%ld\n", rounds, threads, abuses, ms, Faults, Overflows);
 return (Faults || Overflows) ? 1 : 0;
}
