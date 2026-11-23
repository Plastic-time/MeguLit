// SPDX-License-Identifier: GPL-3.0-or-later
// MeguLit crash witness (2026-11-19, 千恋＊万花 exited with 0xC000041D while every hook layer was loaded and left no trace:
// no Application Error event, no WER report or dump, and KiriKiri's own MiniDumpWriteDump never ran). 0xC000041D means
// an exception left a user-mode callback (a window or hook procedure the kernel called), so the frames above it, where
// the engine's handlers sit, never see it. Without a fault address there is no telling which layer, if any, caused it.
// This header records it from inside the game: a vectored handler notes each serious first-chance exception (code,
// thread, address and the return addresses on the stack, each as module+offset, or "exec-private" for trampolines and
// stubs) and an unhandled-exception filter, chained in front of the game's own, writes the final one with a minidump.
// Files: %TEMP%\MeguLit-crash\<exe>-<pid>.txt / .dmp; HookBridge moves them into logs\crash when the game exits with a
// crash code. Nothing here changes how an exception is handled: both handlers only look and pass it on.
// Rules: no heap and no locks in the handlers (fixed buffers, snprintf to the stack, one writer at a time through an
// interlocked flag; another thread's exception is still noted in the ring, only its file block is skipped); module names
// come from K32GetMappedFileNameW (no loader lock). Arm and Release are never called from DllMain.
#pragma once
#include <windows.h>
#include <psapi.h>
#include <dbghelp.h> /* types only: MiniDumpWriteDump is looked up at Arm */
#include <stdio.h>
#include <string.h>
#include <stdarg.h>

namespace MeguLitCrash
{
	enum
	{
		StackWords = 512,  /* stack scanned per exception, from the faulting sp */
		MaxFrames = 16,	   /* return addresses written per exception */
		MaxSeen = 64,	   /* distinct first-chance addresses written per process */
	};
	struct State
	{
		PVOID vectored;
		LPTOP_LEVEL_EXCEPTION_FILTER previous;
		volatile LONG busy;
		volatile LONG seenCount;
		volatile LONG unhandledWritten;
		volatile bool exiting;
		void *seen[MaxSeen];
		DWORD armedTick;
		wchar_t report[MAX_PATH];
		wchar_t dump[MAX_PATH];
		typedef BOOL(WINAPI *DumpFn)(HANDLE, DWORD, HANDLE, MINIDUMP_TYPE, PMINIDUMP_EXCEPTION_INFORMATION, PMINIDUMP_USER_STREAM_INFORMATION, PMINIDUMP_CALLBACK_INFORMATION);
		DumpFn writeDump;
	};
	inline State &S()
	{
		static State s;
		return s;
	}
	/* the codes worth a first-chance block: an exception of these kinds is a bug wherever it happens (a game's own
	   probing with __try shows up once per address and stops at MaxSeen). C++ throws are left out (they all start at the
	   same RaiseException address and engines use them for script errors); one that leaves a callback still reaches the
	   unhandled filter, whose block carries the throwing stack. */
	inline bool Serious(DWORD code)
	{
		switch (code)
		{
		case EXCEPTION_ACCESS_VIOLATION:
		case EXCEPTION_ILLEGAL_INSTRUCTION:
		case EXCEPTION_PRIV_INSTRUCTION:
		case EXCEPTION_STACK_OVERFLOW:
		case EXCEPTION_INT_DIVIDE_BY_ZERO:
		case EXCEPTION_IN_PAGE_ERROR:
		case 0xC0000409: /* fail fast / stack buffer overrun */
		case 0xC0000374: /* heap corruption */
		case 0xC000041D: /* fatal user callback exception */
			return true;
		}
		return false;
	}
	inline bool ReadWord(const void *at, uintptr_t *v)
	{
		__try
		{
			*v = *(const uintptr_t *)at;
			return true;
		}
		__except (EXCEPTION_EXECUTE_HANDLER)
		{
			return false;
		}
	}
	inline bool Executable(uintptr_t p, MEMORY_BASIC_INFORMATION *m)
	{
		if (p < 0x10000 || !VirtualQuery((void *)p, m, sizeof *m) || m->State != MEM_COMMIT)
			return false;
		return (m->Protect & (PAGE_EXECUTE | PAGE_EXECUTE_READ | PAGE_EXECUTE_READWRITE | PAGE_EXECUTE_WRITECOPY)) != 0;
	}
	/* "name.dll+0x1234", "exec-private 0x16145ce4 (base 0x16140000)" or "0x... (not code)" */
	inline void Describe(uintptr_t p, char *out, size_t cap)
	{
		MEMORY_BASIC_INFORMATION m;
		if (!Executable(p, &m))
		{
			_snprintf_s(out, cap, _TRUNCATE, "0x%p (not code)", (void *)p);
			return;
		}
		if (m.Type == MEM_IMAGE)
		{
			wchar_t path[MAX_PATH];
			DWORD n = K32GetMappedFileNameW(GetCurrentProcess(), m.AllocationBase, path, MAX_PATH);
			const wchar_t *base = path;
			for (DWORD i = 0; i < n; i++)
				if (path[i] == L'\\')
					base = path + i + 1;
			if (!n)
				base = L"?";
			_snprintf_s(out, cap, _TRUNCATE, "%ls+0x%Ix", base, p - (uintptr_t)m.AllocationBase);
			return;
		}
		_snprintf_s(out, cap, _TRUNCATE, "exec-private 0x%p (base 0x%p)", (void *)p, m.AllocationBase);
	}
	/* a stack word that sits right after a call instruction in executable memory (the usual debugger heuristic) */
	inline bool ReturnAddress(uintptr_t p)
	{
		MEMORY_BASIC_INFORMATION m;
		if (!Executable(p, &m) || p - (uintptr_t)m.BaseAddress < 7)
			return false;
		__try
		{
			const BYTE *b = (const BYTE *)p;
			if (b[-5] == 0xE8)
				return true; /* call rel32 */
			if (b[-2] == 0xFF && (b[-1] & 0x38) == 0x10)
				return true; /* call reg / [reg] */
			if (b[-3] == 0xFF && (b[-2] & 0x38) == 0x10)
				return true; /* call [reg+d8] */
			if (b[-6] == 0xFF && (b[-5] & 0x38) == 0x10)
				return true; /* call [abs] / [rip+d32] / [reg+d32] */
			if (b[-7] == 0xFF && (b[-6] & 0x38) == 0x10)
				return true; /* call [reg+reg*s+d32] */
		}
		__except (EXCEPTION_EXECUTE_HANDLER)
		{
		}
		return false;
	}
	/* appends to buf at n, never past cap; returns the new length */
	inline size_t Put(char *buf, size_t cap, size_t n, const char *fmt, ...)
	{
		if (n + 1 >= cap)
			return n;
		va_list a;
		va_start(a, fmt);
		int r = _vsnprintf_s(buf + n, cap - n, _TRUNCATE, fmt, a);
		va_end(a);
		return r < 0 ? cap - 1 : n + r;
	}
	inline void Append(const char *text, size_t len)
	{
		HANDLE h = CreateFileW(S().report, FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, NULL, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
		if (h == INVALID_HANDLE_VALUE)
			return;
		DWORD done;
		WriteFile(h, text, (DWORD)len, &done, NULL);
		CloseHandle(h);
	}
	/* one block: what, where, and the return addresses found on the stack */
	inline void WriteBlock(const char *kind, EXCEPTION_POINTERS *e)
	{
		char text[2048], where[160];
		size_t n = 0;
		EXCEPTION_RECORD *r = e->ExceptionRecord;
		CONTEXT *c = e->ContextRecord;
#ifdef _WIN64
		uintptr_t ip = c->Rip, sp = c->Rsp;
#else
		uintptr_t ip = c->Eip, sp = c->Esp;
#endif
		Describe((uintptr_t)r->ExceptionAddress, where, sizeof where);
		n = Put(text, sizeof text, n, "%s 0x%08lX tid=%lu t=+%lums at %s", kind, r->ExceptionCode, GetCurrentThreadId(), GetTickCount() - S().armedTick, where);
		if (r->ExceptionCode == EXCEPTION_ACCESS_VIOLATION && r->NumberParameters >= 2)
			n = Put(text, sizeof text, n, " (%s 0x%p)", r->ExceptionInformation[0] == 8 ? "execute" : r->ExceptionInformation[0] ? "write" : "read", (void *)r->ExceptionInformation[1]);
		if ((uintptr_t)r->ExceptionAddress != ip)
		{
			Describe(ip, where, sizeof where);
			n = Put(text, sizeof text, n, " ip %s", where);
		}
		n = Put(text, sizeof text, n, "\r\n stack:");
		int frames = 0;
		for (int i = 0; i < StackWords && frames < MaxFrames && n + 200 < sizeof text; i++)
		{
			uintptr_t v;
			if (!ReadWord((const void *)(sp + i * sizeof(uintptr_t)), &v))
				break;
			if (!ReturnAddress(v))
				continue;
			Describe(v, where, sizeof where);
			n = Put(text, sizeof text, n, " | %s", where);
			frames++;
		}
		n = Put(text, sizeof text, n, "\r\n");
		Append(text, n);
	}
	inline LONG CALLBACK Vectored(EXCEPTION_POINTERS *e)
	{
		State &s = S();
		DWORD code = e->ExceptionRecord->ExceptionCode;
		if (!Serious(code) || code == EXCEPTION_STACK_OVERFLOW || s.seenCount >= MaxSeen) /* no stack left for a block */
			return EXCEPTION_CONTINUE_SEARCH;
		void *at = e->ExceptionRecord->ExceptionAddress;
		for (LONG i = 0; i < s.seenCount && i < MaxSeen; i++)
			if (s.seen[i] == at)
				return EXCEPTION_CONTINUE_SEARCH;
		if (InterlockedCompareExchange(&s.busy, 1, 0) != 0)
			return EXCEPTION_CONTINUE_SEARCH; /* another thread is writing, or this one faulted while writing */
		LONG slot = s.seenCount;
		if (slot < MaxSeen)
		{
			s.seen[slot] = at;
			s.seenCount = slot + 1;
			WriteBlock("first-chance", e);
		}
		InterlockedExchange(&s.busy, 0);
		return EXCEPTION_CONTINUE_SEARCH;
	}
	/* this process's top-level windows a player can see: visible, not a tool window, at least 200x150 */
	inline BOOL CALLBACK CountVisible(HWND h, LPARAM count)
	{
		DWORD pid = 0;
		RECT r;
		GetWindowThreadProcessId(h, &pid);
		if (pid == GetCurrentProcessId() && IsWindowVisible(h) && !(GetWindowLongW(h, GWL_EXSTYLE) & WS_EX_TOOLWINDOW) && GetWindowRect(h, &r) && r.right - r.left >= 200 && r.bottom - r.top >= 150)
			++*(int *)count;
		return TRUE;
	}
	inline int VisibleWindows()
	{
		int count = 0;
		EnumWindows(CountVisible, (LPARAM)&count);
		return count;
	}
	/* From the owning DLL's DLL_PROCESS_DETACH at process exit (lpReserved set): the process is in ExitProcess, so an
	   exception from here on is part of the game's normal end. Only a flag and a line: no waiting under the loader lock. */
	inline void NoteExit()
	{
		State &s = S();
		if (!s.vectored || s.exiting)
			return;
		s.exiting = true;
		static const char line[] = "exit: process exiting (ExitProcess)\r\n";
		Append(line, sizeof line - 1);
	}
	inline LONG WINAPI Unhandled(EXCEPTION_POINTERS *e)
	{
		State &s = S();
		if (InterlockedExchange(&s.unhandledWritten, 1) == 0)
		{
			for (int i = 0; i < 200 && InterlockedCompareExchange(&s.busy, 1, 0) != 0; i++)
				Sleep(5);
			WriteBlock("UNHANDLED", e);
			char line[400];
			/* 2026-11-19 (千恋＊万花: the user closed the game, the close ended in 0xC000041D and the gpu canary took it for a
			   crash in play): was the game still showing a window? DestroyWindow hides a window before it sends WM_DESTROY, so
			   an exception in the close flow sees none; one in play sees the game's window. HookBridge reads this line. */
			size_t len = Put(line, sizeof line, 0, " state: visible windows=%d%s\r\n", VisibleWindows(), s.exiting ? ", exiting" : "");
			Append(line, len);
			bool ok = false;
			if (s.writeDump)
			{
				HANDLE h = CreateFileW(s.dump, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
				if (h != INVALID_HANDLE_VALUE)
				{
					MINIDUMP_EXCEPTION_INFORMATION info = {GetCurrentThreadId(), e, FALSE}; /* dbghelp packs it to 4 bytes */
					/* stacks, the memory they point at, unloaded modules and thread times: a few MB */
					ok = s.writeDump(GetCurrentProcess(), GetCurrentProcessId(), h, (MINIDUMP_TYPE)(MiniDumpWithIndirectlyReferencedMemory | MiniDumpWithUnloadedModules | MiniDumpWithThreadInfo), &info, NULL, NULL) != FALSE;
					CloseHandle(h);
					if (!ok)
						DeleteFileW(s.dump);
				}
			}
			size_t n = Put(line, sizeof line, 0, " dump %s\r\n", ok ? "written" : "not written");
			Append(line, n);
			InterlockedExchange(&s.busy, 0);
		}
		return s.previous ? s.previous(e) : EXCEPTION_CONTINUE_SEARCH;
	}
	/* Arms the witness; dir (with a trailing backslash) only for tests, else %TEMP%\MeguLit-crash\. Not from DllMain. */
	inline bool Arm(const wchar_t *dir = nullptr)
	{
		State &s = S();
		if (s.vectored)
			return true;
		wchar_t folder[MAX_PATH], exe[MAX_PATH];
		if (dir)
			wcsncpy_s(folder, dir, _TRUNCATE);
		else
		{
			DWORD n = GetTempPathW(MAX_PATH, folder);
			if (!n || n + 16 >= MAX_PATH)
				return false;
			wcscat_s(folder, L"MeguLit-crash\\");
		}
		CreateDirectoryW(folder, NULL);
		DWORD n = GetModuleFileNameW(NULL, exe, MAX_PATH);
		const wchar_t *name = exe;
		for (DWORD i = 0; i < n; i++)
			if (exe[i] == L'\\' || exe[i] == L'/')
				name = exe + i + 1;
		_snwprintf_s(s.report, MAX_PATH, _TRUNCATE, L"%s%s-%lu.txt", folder, name, GetCurrentProcessId());
		_snwprintf_s(s.dump, MAX_PATH, _TRUNCATE, L"%s%s-%lu.dmp", folder, name, GetCurrentProcessId());
		HMODULE dbghelp = LoadLibraryExW(L"dbghelp.dll", NULL, LOAD_LIBRARY_SEARCH_SYSTEM32);
		s.writeDump = dbghelp ? (State::DumpFn)GetProcAddress(dbghelp, "MiniDumpWriteDump") : nullptr;
		s.armedTick = GetTickCount();
		char head[300];
		SYSTEMTIME t;
		GetSystemTime(&t);
		size_t len = Put(head, sizeof head, 0, "armed %04u-%02u-%02uT%02u:%02u:%02uZ pid=%lu %s\r\n", t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute, t.wSecond, GetCurrentProcessId(), sizeof(void *) == 8 ? "x64" : "x86");
		Append(head, len);
		s.vectored = AddVectoredExceptionHandler(1, Vectored);
		s.previous = SetUnhandledExceptionFilter(Unhandled);
		return s.vectored != nullptr;
	}
	/* Before the module that holds this code unloads. False: a filter set after ours may call it later, so the module
	   must stay loaded (the witness stays armed). */
	inline bool Release()
	{
		State &s = S();
		if (!s.vectored)
			return true;
		LPTOP_LEVEL_EXCEPTION_FILTER now = SetUnhandledExceptionFilter(s.previous);
		if (now != Unhandled)
		{
			SetUnhandledExceptionFilter(now);
			return false;
		}
		RemoveVectoredExceptionHandler(s.vectored);
		s.vectored = nullptr;
		for (int i = 0; i < 400 && s.busy; i++)
			Sleep(5);
		return true;
	}
}
