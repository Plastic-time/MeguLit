#pragma once
/* MeguLit safe unhook (2026-11-19), shared by the injected DLLs, 32- and 64-bit.

   Freeing hook memory (a MinHook trampoline, a hook stub, a whole DLL) while a game thread can still run in it or return
   into it crashed 死に逝く君、館に芽吹く憎悪 with 0xC000041D (megulithook removed a text hook on Alt+M). The flow here:
     1. stop new entries (MH_DisableHook, or the caller's own switch);
     2. wait until the caller's "inside the hook" counters are 0;
     3. suspend the other threads one at a time, look at each one's instruction pointer and the top of its stack and resume
        it right away: the thread is "inside" when the IP, or any word near the top of its stack (a return address), points
        into one of the spans that is about to be freed (allAtOnce: every thread suspended together, for a DLL unload);
     4. free only when no thread is inside. If that does not happen within the timeout the memory is kept (a MinHook
        trampoline is 32/64 bytes; leaking it is far better than a crash) and RetryKept frees it before the same target
        is hooked again.
   Rules: never call this from DllMain (loader lock: no suspending or waiting there); no heap use while threads are
   suspended (one of them may hold the heap lock); a thread stays suspended only while it is looked at.

   Stale words in a live stack frame can look like a return address: that only makes a check say "busy" (memory kept),
   never the other way round. */
#include <windows.h>
#include <tlhelp32.h>
#include <string.h>

namespace MeguLitUnhook
{
	struct Span
	{
		uintptr_t lo, hi;
	};
	enum : DWORD
	{
		MaxThreads = 1024
	};

	inline bool InSpans(uintptr_t v, const Span *s, int n)
	{
		for (int i = 0; i < n; i++)
			if (v >= s[i].lo && v < s[i].hi)
				return true;
		return false;
	}
	inline bool CountsZero(const volatile LONG *const *c, int n)
	{
		for (int i = 0; i < n; i++)
			if (c[i] && *c[i] != 0)
				return false;
		return true;
	}
	/* a MinHook trampoline (the `original` MH_CreateHook returned) and its x64 relay live in one 64-byte slot (32 on x86;
	   64 then also covers the next slot, which can only make a check more careful) */
	inline Span TrampolineSpan(const void *original)
	{
		uintptr_t a = (uintptr_t)original;
		return Span{a, a ? a + 64 : 0};
	}
	/* a detour's own code: a thread still in its body may call the trampoline later. On x64 the exact range comes from
	   the unwind table; the span is at least minBytes long (x86 has no table), which can only make a check more careful */
	inline Span FunctionSpan(const void *fn, size_t minBytes = 0x1000)
	{
		uintptr_t lo = (uintptr_t)fn, hi = lo + minBytes;
#ifdef _WIN64
		DWORD64 base = 0;
		if (PRUNTIME_FUNCTION f = RtlLookupFunctionEntry((DWORD64)lo, &base, NULL))
			if (base + f->EndAddress > hi)
				hi = (uintptr_t)(base + f->EndAddress);
#endif
		return Span{lo, fn ? hi : 0};
	}
	inline Span ModuleSpan(HMODULE m)
	{
		if (!m)
			return Span{0, 0};
		const IMAGE_DOS_HEADER *dos = (const IMAGE_DOS_HEADER *)m;
		const IMAGE_NT_HEADERS *nt = (const IMAGE_NT_HEADERS *)((const BYTE *)m + dos->e_lfanew);
		return Span{(uintptr_t)m, (uintptr_t)m + nt->OptionalHeader.SizeOfImage};
	}
	inline bool ReadWord(uintptr_t at, uintptr_t &out)
	{
		__try
		{
			out = *(volatile uintptr_t *)at;
			return true;
		}
		__except (EXCEPTION_EXECUTE_HANDLER)
		{
			return false;
		}
	}
	/* the longest time one thread stayed suspended in the last check, in microseconds (for logs and the self-test) */
	inline volatile LONG &LastPauseUs()
	{
		static volatile LONG v = 0;
		return v;
	}

	/* Opens every other thread of this process (all opened before any is suspended: the pause stays short). NtGetNextThread
	   walks only this process; the toolhelp snapshot (fallback) walks every thread of the system and took ~200 ms per
	   call on a busy desktop. False (handles closed) when there are more than MaxThreads. */
	inline bool OpenOtherThreads(HANDLE *held, DWORD &n)
	{
		typedef LONG(NTAPI * NextThreadFn)(HANDLE, HANDLE, ACCESS_MASK, ULONG, ULONG, PHANDLE);
		static NextThreadFn next = (NextThreadFn)GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "NtGetNextThread");
		const ACCESS_MASK access = THREAD_SUSPEND_RESUME | THREAD_GET_CONTEXT | THREAD_QUERY_INFORMATION;
		DWORD self = GetCurrentThreadId();
		bool overflow = false;
		n = 0;
		if (next)
		{
			HANDLE cur = NULL, nx = NULL;
			bool curKept = false;
			while (next(GetCurrentProcess(), cur, access, 0, 0, &nx) == 0)
			{
				if (cur && !curKept)
					CloseHandle(cur);
				cur = nx;
				curKept = false;
				if (GetThreadId(nx) == self)
					continue;
				if (n == MaxThreads)
				{
					overflow = true;
					break;
				}
				held[n++] = nx;
				curKept = true;
			}
			if (cur && !curKept)
				CloseHandle(cur);
		}
		else
		{
			HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
			if (snap == INVALID_HANDLE_VALUE)
				return false;
			THREADENTRY32 te;
			te.dwSize = sizeof(te);
			DWORD pid = GetCurrentProcessId();
			for (BOOL ok = Thread32First(snap, &te); ok && !overflow; ok = Thread32Next(snap, &te))
				if (te.th32OwnerProcessID == pid && te.th32ThreadID != self)
				{
					if (n == MaxThreads)
						overflow = true;
					else if (HANDLE h = OpenThread(access, FALSE, te.th32ThreadID))
						held[n++] = h;
				}
			CloseHandle(snap);
		}
		if (overflow)
		{
			for (DWORD i = 0; i < n; i++)
				CloseHandle(held[i]);
			n = 0;
			return false;
		}
		return true;
	}

	/* Looks at one suspended thread: true when its IP, or a word near the top of its stack (a return address), points
	   into a span, or its context cannot be read. No heap use (other threads may be suspended and hold the heap lock). */
	inline bool ThreadInside(HANDLE h, const Span *spans, int nspans, size_t stackBytes)
	{
		CONTEXT c;
		memset(&c, 0, sizeof(c));
		c.ContextFlags = CONTEXT_CONTROL;
		if (!GetThreadContext(h, &c)) /* also waits for the suspension to take effect */
			return true;
#ifdef _WIN64
		uintptr_t ip = c.Rip, sp = c.Rsp;
#else
		uintptr_t ip = c.Eip, sp = c.Esp;
#endif
		if (InSpans(ip, spans, nspans))
			return true;
		uintptr_t end = sp + stackBytes;
		MEMORY_BASIC_INFORMATION mbi;
		if (VirtualQuery((void *)sp, &mbi, sizeof(mbi)) && mbi.State == MEM_COMMIT)
		{
			uintptr_t top = (uintptr_t)mbi.BaseAddress + mbi.RegionSize;
			if (top < end)
				end = top;
		}
		for (uintptr_t at = sp & ~(uintptr_t)(sizeof(uintptr_t) - 1); at < end; at += sizeof(uintptr_t))
		{
			uintptr_t v;
			if (!ReadWord(at, v))
				break;
			if (InSpans(v, spans, nspans))
				return true;
		}
		return false;
	}

	/* One check: true when no other thread is inside any span and every counter is 0. stackBytes = how much of the top of
	   each stack is searched for return addresses (bounded by the committed stack region).
	   One thread at a time (default): each thread is suspended only for its own look, the others keep running. This is
	   sound only once nothing can enter the spans any more (the hook is disabled first, so a thread that is out stays out,
	   and one still inside shows up in its IP, its stack or the counters). allAtOnce suspends every thread for one
	   consistent picture: for spans that can still be entered (a whole DLL, through callbacks). */
	inline bool Quiet(const Span *spans, int nspans, const volatile LONG *const *counts, int ncounts, size_t stackBytes, bool allAtOnce = false)
	{
		if (!CountsZero(counts, ncounts))
			return false;
		HANDLE held[MaxThreads];
		DWORD n = 0;
		if (!OpenOtherThreads(held, n)) /* cannot look at every thread: not provably quiet */
			return false;
		LARGE_INTEGER f, t0, t1;
		QueryPerformanceFrequency(&f);
		/* while others are suspended this thread must not be preempted (a busy desktop stretched one check to 14 ms) */
		HANDLE me = GetCurrentThread();
		int priority = GetThreadPriority(me);
		SetThreadPriority(me, THREAD_PRIORITY_TIME_CRITICAL);
		bool busy = false;
		LONGLONG longest = 0;
		if (allAtOnce)
		{
			QueryPerformanceCounter(&t0);
			for (DWORD i = 0; i < n; i++)
				if (SuspendThread(held[i]) == (DWORD)-1) /* an exiting thread */
				{
					CloseHandle(held[i]);
					held[i] = NULL;
				}
			busy = !CountsZero(counts, ncounts);
			for (DWORD i = 0; i < n && !busy; i++)
				if (held[i])
					busy = ThreadInside(held[i], spans, nspans, stackBytes);
			for (DWORD i = 0; i < n; i++)
				if (held[i])
					ResumeThread(held[i]);
			QueryPerformanceCounter(&t1);
			longest = t1.QuadPart - t0.QuadPart;
		}
		else
			for (DWORD i = 0; i < n && !busy; i++)
			{
				QueryPerformanceCounter(&t0);
				if (SuspendThread(held[i]) == (DWORD)-1) /* an exiting thread: it cannot enter a disabled hook any more */
					continue;
				busy = ThreadInside(held[i], spans, nspans, stackBytes);
				ResumeThread(held[i]);
				QueryPerformanceCounter(&t1);
				if (t1.QuadPart - t0.QuadPart > longest)
					longest = t1.QuadPart - t0.QuadPart;
			}
		if (priority != THREAD_PRIORITY_ERROR_RETURN)
			SetThreadPriority(me, priority);
		for (DWORD i = 0; i < n; i++)
			if (held[i])
				CloseHandle(held[i]);
		busy = busy || !CountsZero(counts, ncounts);
		LastPauseUs() = (LONG)(longest * 1000000 / f.QuadPart);
		return !busy;
	}

	/* Repeats Quiet until it holds or timeoutMs passes; threads run normally between checks. */
	inline bool WaitQuiet(const Span *spans, int nspans, const volatile LONG *const *counts, int ncounts, DWORD timeoutMs, size_t stackBytes = 64 << 10, bool allAtOnce = false)
	{
		for (DWORD start = GetTickCount();;)
		{
			if (CountsZero(counts, ncounts) && Quiet(spans, nspans, counts, ncounts, stackBytes, allAtOnce))
				return true;
			if (GetTickCount() - start >= timeoutMs)
				return false;
			Sleep(1);
		}
	}

#ifdef MH_ALL_HOOKS /* MinHook.h is included: the MinHook side of the flow */
	/* hooks that were disabled but not freed (a thread could still have been inside); RetryKept frees them later */
	struct Kept
	{
		void *target;
		Span spans[4];
		int nspans;
		const volatile LONG *counts[2];
		int ncounts;
	};
	enum
	{
		MaxKept = 256
	};
	inline Kept *KeptTable() { static Kept t[MaxKept]; return t; }
	inline SRWLOCK &KeptLock() { static SRWLOCK l = SRWLOCK_INIT; return l; }
	inline volatile LONG &KeptCount() { static volatile LONG n = 0; return n; }

	/* Disables the MinHook hook on target and frees its trampoline once no thread can be in it or return into it.
	   original = the trampoline MH_CreateHook returned; extra = other code of this hook that is freed or reused with it
	   (a stub); counts = the hook's own "inside the detour" counters. Returns true when freed (or never created), false
	   when kept disabled because a thread may still be inside (freed by RetryKept or MH_Uninitialize later). */
	inline bool RemoveMinHook(void *target, void *original, const Span *extra, int nextra, const volatile LONG *const *counts, int ncounts, DWORD timeoutMs = 2000, size_t stackBytes = 64 << 10)
	{
		MH_STATUS d = MH_DisableHook(target);
		if (d == MH_ERROR_NOT_CREATED || d == MH_ERROR_NOT_INITIALIZED)
			return true;
		Kept k = {};
		k.target = target;
		k.spans[k.nspans++] = TrampolineSpan(original);
		for (int i = 0; i < nextra && k.nspans < 4; i++)
			k.spans[k.nspans++] = extra[i];
		for (int i = 0; i < ncounts && k.ncounts < 2; i++)
			k.counts[k.ncounts++] = counts[i];
		if (WaitQuiet(k.spans, k.nspans, k.counts, k.ncounts, timeoutMs, stackBytes))
		{
			MH_RemoveHook(target);
			return true;
		}
		AcquireSRWLockExclusive(&KeptLock());
		Kept *t = KeptTable();
		LONG n = KeptCount();
		if (n < MaxKept)
		{
			t[n] = k;
			KeptCount() = n + 1;
		}
		ReleaseSRWLockExclusive(&KeptLock());
		return false;
	}
	inline bool IsKept(void *target)
	{
		AcquireSRWLockShared(&KeptLock());
		bool found = false;
		for (LONG i = 0; i < KeptCount() && !found; i++)
			found = KeptTable()[i].target == target;
		ReleaseSRWLockShared(&KeptLock());
		return found;
	}
	/* Before hooking a target again: frees a kept hook on it if no thread is inside now. True when target has no kept
	   hook left (MH_CreateHook can go ahead). */
	inline bool RetryKept(void *target, DWORD timeoutMs = 2000)
	{
		AcquireSRWLockExclusive(&KeptLock());
		Kept *t = KeptTable();
		Kept k = {};
		bool found = false;
		for (LONG i = 0; i < KeptCount(); i++)
			if (t[i].target == target)
			{
				k = t[i];
				t[i] = t[KeptCount() - 1];
				KeptCount() = KeptCount() - 1;
				found = true;
				break;
			}
		ReleaseSRWLockExclusive(&KeptLock());
		if (!found)
			return true;
		if (WaitQuiet(k.spans, k.nspans, k.counts, k.ncounts, timeoutMs))
		{
			MH_RemoveHook(target);
			return true;
		}
		AcquireSRWLockExclusive(&KeptLock());
		if (KeptCount() < MaxKept)
		{
			KeptTable()[KeptCount()] = k;
			KeptCount() = KeptCount() + 1;
		}
		ReleaseSRWLockExclusive(&KeptLock());
		return false;
	}
	/* spans of every kept hook (for a whole-DLL check before unloading); returns how many were written */
	inline int KeptSpans(Span *out, int max)
	{
		int w = 0;
		AcquireSRWLockShared(&KeptLock());
		for (LONG i = 0; i < KeptCount(); i++)
			for (int j = 0; j < KeptTable()[i].nspans && w < max; j++)
				out[w++] = KeptTable()[i].spans[j];
		ReleaseSRWLockShared(&KeptLock());
		return w;
	}
#endif
}
