// Stress test of MeguLitSafeUnhook.h with MinHook (the same flow every injected DLL uses), 32- and 64-bit.
// Usage: unhook-stress.exe [--naive]
//  1. two threads call two hooked functions without pause while a third thread hooks and unhooks them 1000 times. The
//     hook is shaped like megulithook's text hook: the detour is a stub that tail-jumps to MinHook's trampoline, and the
//     hooked function starts with a call, so a caller spends most of its time in a callee with a return address into the
//     trampoline (no counter covers it). Every call must return its own function's value and nothing may crash;
//  2. a thread parked inside the hook: removal must give up after the timeout and keep the trampoline (no free), and
//     RetryKept must free it once the thread has left, after which the target hooks again;
//  3. a thread is suspended only while it is looked at: the longest such pause per check, p99 under 5 ms.
// --naive removes with MH_DisableHook + MH_RemoveHook (the code before 2026-11-19) and is expected to crash or return
// wrong values: run.cmd checks that, so the test can see a regression. Exit code 0 = passed.
#include <windows.h>
#include <stdio.h>
#include <algorithm>
#include "MinHook.h"
#include "../MeguLitSafeUnhook.h"

static volatile LONG Stop, Park, Parked, Wrong;
static volatile LONG64 Calls;
static HANDLE ParkGo;

static int __cdecl InnerA()
{
	if (Park)
	{
		InterlockedExchange(&Parked, 1);
		WaitForSingleObject(ParkGo, INFINITE);
	}
	volatile int x = 0;
	for (int i = 0; i < 4000; i++)
		x += i;
	return 1;
}
static int __cdecl InnerB()
{
	volatile int x = 0;
	for (int i = 0; i < 4000; i++)
		x += i;
	return 2;
}

typedef int(__cdecl *Fn)();
struct Code
{
	BYTE *target, *stub;
	void **stubOrig;
	Fn call;
};
// target: <pad nops> [x64: sub rsp,8] call Inner [x64: add rsp,8] ret; the call is inside the bytes MinHook moves into
// its trampoline. stub (the detour): jmp [orig].
static Code Make(int pad, void *inner)
{
	BYTE *p = (BYTE *)VirtualAlloc(NULL, 4096, MEM_COMMIT | MEM_RESERVE, PAGE_EXECUTE_READWRITE);
	Code c{p, p + 2048, NULL, (Fn)p};
	int i = 0;
	for (int k = 0; k < pad; k++)
		p[i++] = 0x90;
#ifdef _WIN64
	p[i++] = 0x48, p[i++] = 0x83, p[i++] = 0xEC, p[i++] = 0x08;                                     // sub rsp,8
	int callEnd = i + 6, data = (callEnd + 4 + 1 + 7) & ~7;                                           // data slot after add/ret
	p[i++] = 0xFF, p[i++] = 0x15;                                                                     // call [rip+disp]
	*(INT32 *)(p + i) = data - callEnd, i += 4;
	p[i++] = 0x48, p[i++] = 0x83, p[i++] = 0xC4, p[i++] = 0x08;                                     // add rsp,8
	p[i++] = 0xC3;                                                                                    // ret
	*(void **)(p + data) = inner;
	BYTE *s = c.stub;
	s[0] = 0xFF, s[1] = 0x25, *(INT32 *)(s + 2) = 0;                                                  // jmp [rip+0]
	c.stubOrig = (void **)(s + 6);
#else
	p[i++] = 0xE8, *(INT32 *)(p + i) = (INT32)((BYTE *)inner - (p + i + 4)), i += 4;                // call inner
	p[i++] = 0xC3;
	BYTE *s = c.stub;
	s[0] = 0xFF, s[1] = 0x25, *(void ***)(s + 2) = (void **)(s + 8);                                  // jmp [s+8]
	c.stubOrig = (void **)(s + 8);
#endif
	FlushInstructionCache(GetCurrentProcess(), p, 4096);
	return c;
}

static Code A, B;
static DWORD WINAPI Caller(void *)
{
	while (!Stop)
	{
		if (A.call() != 1 || B.call() != 2)
			InterlockedIncrement(&Wrong);
		InterlockedIncrement64(&Calls);
	}
	return 0;
}
static DWORD WINAPI ParkedCaller(void *)
{
	A.call();
	return 0;
}

static bool Hook(Code &c, void **orig)
{
	if (MH_CreateHook(c.target, c.stub, orig) != MH_OK)
		return false;
	*c.stubOrig = *orig;
	FlushInstructionCache(GetCurrentProcess(), c.stub, 64);
	return MH_EnableHook(c.target) == MH_OK;
}

static LONG WINAPI Crashed(EXCEPTION_POINTERS *e)
{
	printf("CRASH 0x%08lX at %p\n", e->ExceptionRecord->ExceptionCode, e->ExceptionRecord->ExceptionAddress);
	TerminateProcess(GetCurrentProcess(), 3);
	return EXCEPTION_EXECUTE_HANDLER;
}

int main(int argc, char **argv)
{
	SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX); /* a crash ends the test quietly, no WER window */
	SetUnhandledExceptionFilter(Crashed);
	bool naive = argc > 1 && !strcmp(argv[1], "--naive");
	/* 100 rounds by default (2026-11-19: a quick native self-test); MEGULIT_SELFTEST_FULL=1 runs the full 1000. The old
	   removal (--naive) always gets 1000 rounds to crash in. */
	char full[8] = {0};
	int rounds = naive || (GetEnvironmentVariableA("MEGULIT_SELFTEST_FULL", full, sizeof full) && full[0] == '1') ? 1000 : 100;
	setvbuf(stdout, NULL, _IONBF, 0);
	MH_Initialize();
	A = Make(0, (void *)InnerA);
	B = Make(3, (void *)InnerB);
	ParkGo = CreateEventW(NULL, TRUE, FALSE, NULL);
	int fails = 0;
	HANDLE th[2];
	for (int i = 0; i < 2; i++)
		th[i] = CreateThread(NULL, 0, Caller, NULL, 0, NULL);
	MeguLitUnhook::Span stubA{(uintptr_t)A.stub, (uintptr_t)A.stub + 64}, stubB{(uintptr_t)B.stub, (uintptr_t)B.stub + 64};
	static LONG pauses[1000];
	int npauses = 0;
	LONG kept = 0;
	DWORD t0 = GetTickCount();
	for (int round = 0; round < rounds; round++)
	{
		Code &c = round & 1 ? B : A;
		MeguLitUnhook::Span &stub = round & 1 ? stubB : stubA;
		void *orig = NULL;
		if (!Hook(c, &orig))
		{
			printf("FAIL hook round %d\n", round);
			fails++;
			break;
		}
		for (volatile int k = 0; k < 20000; k++)
			;
		if (naive)
		{
			MH_DisableHook(c.target);
			MH_RemoveHook(c.target);
			continue;
		}
		if (!MeguLitUnhook::RemoveMinHook(c.target, orig, &stub, 1, NULL, 0, 2000))
		{
			kept++;
			MeguLitUnhook::RetryKept(c.target, 2000);
		}
		pauses[npauses++] = MeguLitUnhook::LastPauseUs();
	}
	Sleep(50);
	Stop = 1;
	WaitForMultipleObjects(2, th, TRUE, 5000);
	printf("%s %d hook/unhook rounds under 2 calling threads: %lld calls, %ld wrong results, %ld kept, %lu ms\n", Wrong ? "FAIL" : "ok  ", rounds, (long long)Calls, Wrong, kept, GetTickCount() - t0);
	fails += Wrong != 0;
	if (naive)
	{
		printf(fails ? "FAILED %d\n" : "PASSED\n", fails);
		return fails ? 1 : 0;
	}
	// one thread at a time: a thread is suspended only while it is looked at; p99 of the longest per check
	std::sort(pauses, pauses + npauses);
	LONG p50 = pauses[npauses / 2], p99 = pauses[npauses * 99 / 100], pmax = pauses[npauses - 1];
	bool shortPause = p99 < 5000;
	printf("%s one thread suspended per look, longest per check: p50 %ld us, p99 %ld us, max %ld us\n", shortPause ? "ok  " : "FAIL", p50, p99, pmax);
	fails += !shortPause;

	// a thread parked inside the hooked call: removal must keep the trampoline, RetryKept frees it after the thread left
	void *orig = NULL;
	Stop = 0;
	Park = 1;
	if (!Hook(A, &orig))
	{
		printf("FAIL hook for park\n");
		return 1;
	}
	HANDLE pt = CreateThread(NULL, 0, ParkedCaller, NULL, 0, NULL);
	while (!Parked)
		Sleep(1);
	DWORD r0 = GetTickCount();
	bool freed = MeguLitUnhook::RemoveMinHook(A.target, orig, &stubA, 1, NULL, 0, 300);
	DWORD waited = GetTickCount() - r0;
	bool keptOk = !freed && MeguLitUnhook::IsKept(A.target) && waited < 1000;
	printf("%s parked thread: trampoline kept, not freed (gave up after %lu ms)\n", keptOk ? "ok  " : "FAIL", waited);
	fails += !keptOk;
	bool stillCreated = MH_CreateHook(A.target, A.stub, &orig) == MH_ERROR_ALREADY_CREATED;
	Park = 0;
	SetEvent(ParkGo);
	WaitForSingleObject(pt, 5000);
	bool retried = MeguLitUnhook::RetryKept(A.target, 2000) && !MeguLitUnhook::IsKept(A.target);
	bool again = Hook(A, &orig) && A.call() == 1 && MeguLitUnhook::RemoveMinHook(A.target, orig, &stubA, 1, NULL, 0, 2000);
	bool reuse = stillCreated && retried && again;
	printf("%s kept hook freed by RetryKept after the thread left; the target hooks again\n", reuse ? "ok  " : "FAIL");
	fails += !reuse;
	printf(fails ? "FAILED %d\n" : "PASSED\n", fails);
	return fails ? 1 : 0;
}
