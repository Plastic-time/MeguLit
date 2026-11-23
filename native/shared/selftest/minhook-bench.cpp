// Timing of MinHook's thread freeze (native/shared/minhook, MeguLit local patch 2026-11-19): 30 hooks installed one by
// one (a freeze per MH_EnableHook) and queued (one freeze for all: MH_QueueEnableHook + MH_ApplyQueued), with 20 idle
// threads standing in for a game's. Built against the patched copy and, for comparison, an unpatched one.
// Output: one line per measure; exit code 0 when every hook installed and ran.
#include <windows.h>
#include <stdio.h>
#include "MinHook.h"

#define N 30
static volatile LONG Calls;
#define TARGET(i) __declspec(noinline) static int __stdcall T##i(int x) { volatile int y = x * (i + 3); return y + i; } \
                  static int __stdcall H##i(int x) { InterlockedIncrement(&Calls); return x; }
TARGET(0) TARGET(1) TARGET(2) TARGET(3) TARGET(4) TARGET(5) TARGET(6) TARGET(7) TARGET(8) TARGET(9)
TARGET(10) TARGET(11) TARGET(12) TARGET(13) TARGET(14) TARGET(15) TARGET(16) TARGET(17) TARGET(18) TARGET(19)
TARGET(20) TARGET(21) TARGET(22) TARGET(23) TARGET(24) TARGET(25) TARGET(26) TARGET(27) TARGET(28) TARGET(29)
typedef int(__stdcall *Fn)(int);
#define P(i) {(void *)&T##i, (void *)&H##i}
static void *Pairs[N][2] = {P(0), P(1), P(2), P(3), P(4), P(5), P(6), P(7), P(8), P(9), P(10), P(11), P(12), P(13), P(14),
                           P(15), P(16), P(17), P(18), P(19), P(20), P(21), P(22), P(23), P(24), P(25), P(26), P(27), P(28), P(29)};
static volatile bool Stop;
static DWORD WINAPI Idle(void *) { while (!Stop) Sleep(5); return 0; }
static double Ms(LARGE_INTEGER a, LARGE_INTEGER b) { LARGE_INTEGER f; QueryPerformanceFrequency(&f); return (b.QuadPart - a.QuadPart) * 1000.0 / f.QuadPart; }
static bool Run(bool queued, double *install, double *perFreeze, double *remove)
{
	void *orig[N];
	for (int i = 0; i < N; i++)
		if (MH_CreateHook(Pairs[i][0], Pairs[i][1], &orig[i]) != MH_OK) return false;
	LARGE_INTEGER a, b;
	QueryPerformanceCounter(&a);
	if (queued) { for (int i = 0; i < N; i++) if (MH_QueueEnableHook(Pairs[i][0]) != MH_OK) return false; if (MH_ApplyQueued() != MH_OK) return false; }
	else for (int i = 0; i < N; i++) if (MH_EnableHook(Pairs[i][0]) != MH_OK) return false;
	QueryPerformanceCounter(&b);
	*install = Ms(a, b);
	*perFreeze = queued ? *install : *install / N;
	Calls = 0;
	for (int i = 0; i < N; i++) ((Fn)Pairs[i][0])(i);
	bool ran = Calls == N;
	QueryPerformanceCounter(&a);
	if (queued) { for (int i = 0; i < N; i++) MH_QueueDisableHook(Pairs[i][0]); MH_ApplyQueued(); }
	else for (int i = 0; i < N; i++) MH_DisableHook(Pairs[i][0]);
	QueryPerformanceCounter(&b);
	*remove = Ms(a, b);
	for (int i = 0; i < N; i++) MH_RemoveHook(Pairs[i][0]);
	return ran;
}
int main()
{
	HANDLE threads[20];
	for (int i = 0; i < 20; i++) threads[i] = CreateThread(NULL, 0, Idle, NULL, 0, NULL);
	if (MH_Initialize() != MH_OK) return 2;
	bool ok = true;
	double queuedFreeze = 0;
	for (int queued = 0; queued < 2; queued++)
	{
		double best[3] = {1e9, 1e9, 1e9};
		for (int round = 0; round < 3; round++)
		{
			double install, freeze, remove;
			if (!Run(queued != 0, &install, &freeze, &remove)) { ok = false; break; }
			if (install < best[0]) best[0] = install;
			if (freeze < best[1]) best[1] = freeze;
			if (remove < best[2]) best[2] = remove;
		}
		printf("%s 30 hooks: install %.1f ms, one freeze %.2f ms, remove %.1f ms (best of 3, 20 other threads)\n",
		       queued ? "queued  " : "one by one", best[0], best[1], best[2]);
		if (queued)
			queuedFreeze = best[1];
	}
	/* the unpatched freeze (a snapshot of every thread on the system) took 90-110 ms here; this process's own threads
	   take about 1 ms */
	if (queuedFreeze > 30)
	{
		printf("FAIL one freeze took %.1f ms: MinHook walks more than this process's threads\n", queuedFreeze);
		ok = false;
	}
	Stop = true;
	WaitForMultipleObjects(20, threads, TRUE, 2000);
	MH_Uninitialize();
	printf(ok ? "ok\n" : "FAIL a hook did not install or run\n");
	return ok ? 0 : 1;
}
