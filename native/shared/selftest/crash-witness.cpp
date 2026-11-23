// Self-test of native\shared\MeguLitCrashWitness.h, x86 and x64. The parent runs this program again as a child per case
// and reads the report the child left: a handled access violation is written once per address; a crash inside a hook
// procedure the kernel calls (the way 千恋＊万花 ended, 0xC000041D) leaves an UNHANDLED block that names the faulting
// function's module and offset, plus a minidump; a C++ throw out of a callback is caught the same way; after Release
// nothing is written, and Release refuses while a filter set later may still call ours. Exit code 0 = passed.
#include <windows.h>
#include <stdio.h>
#include <string>
#include <stdexcept>
#include "../MeguLitCrashWitness.h"

static wchar_t Dir[MAX_PATH];
static int Failures;
static void Check(bool ok, const char *what)
{
	printf("%s %s\n", ok ? "ok  " : "FAIL", what);
	if (!ok)
		Failures++;
}
extern "C" IMAGE_DOS_HEADER __ImageBase;

__declspec(noinline) static int ProbeNull()
{
	__try
	{
		return *(volatile int *)nullptr;
	}
	__except (EXCEPTION_EXECUTE_HANDLER)
	{
		return -1;
	}
}
static volatile int *Null;
static volatile int Mode;
__declspec(noinline) static void CrashHere() { *Null = 1; }
__declspec(noinline) static void ThrowHere() { throw std::runtime_error("out of a callback"); }
static LRESULT CALLBACK OnMessage(int code, WPARAM w, LPARAM l)
{
	if (code >= 0 && ((MSG *)l)->message == WM_APP)
	{
		if (Mode == 1)
			CrashHere();
		else
			ThrowHere();
	}
	return CallNextHookEx(NULL, code, w, l);
}
static std::string ReadAll(const wchar_t *path)
{
	std::string s;
	HANDLE h = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, NULL, OPEN_EXISTING, 0, NULL);
	if (h == INVALID_HANDLE_VALUE)
		return s;
	char buf[8192];
	DWORD got;
	while (ReadFile(h, buf, sizeof buf, &got, NULL) && got)
		s.append(buf, got);
	CloseHandle(h);
	return s;
}
static int Count(const std::string &s, const std::string &what)
{
	int n = 0;
	for (size_t at = s.find(what); at != std::string::npos; at = s.find(what, at + 1))
		n++;
	return n;
}
/* "<exe>+0x<offset>" right after the given marker, as a number (0 if absent) */
static uintptr_t OffsetAfter(const std::string &s, const std::string &marker, const char *exe)
{
	size_t at = s.find(marker);
	if (at == std::string::npos)
		return 0;
	size_t p = s.find(std::string(exe) + "+0x", at);
	size_t eol = s.find('\n', at);
	if (p == std::string::npos || p > eol)
		return 0;
	return (uintptr_t)strtoull(s.c_str() + p + strlen(exe) + 3, nullptr, 16);
}
static volatile bool CrashOnDestroy;
static LRESULT CALLBACK GameProc(HWND h, UINT m, WPARAM w, LPARAM l)
{
	if (m == WM_DESTROY && CrashOnDestroy)
		CrashHere();
	return DefWindowProcW(h, m, w, l);
}
static int Child(const char *what)
{
	SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX);
	if (!strcmp(what, "later-filter"))
	{
		MeguLitCrash::Arm(Dir);
		SetUnhandledExceptionFilter([](EXCEPTION_POINTERS *) -> LONG { return EXCEPTION_CONTINUE_SEARCH; });
		return MeguLitCrash::Release() ? 3 : 0;
	}
	MeguLitCrash::Arm(Dir);
	if (!strcmp(what, "release"))
	{
		if (!MeguLitCrash::Release())
			return 3;
		ProbeNull();
		return 0;
	}
	ProbeNull();
	ProbeNull(); /* same address: one block */
	/* a game window: visible to the system, but owned (no taskbar button), never activated and far off screen */
	WNDCLASSW wc = {};
	wc.lpfnWndProc = GameProc;
	wc.hInstance = GetModuleHandleW(NULL);
	wc.lpszClassName = L"MeguLitWitnessGame";
	RegisterClassW(&wc);
	HWND owner = CreateWindowExW(0, wc.lpszClassName, L"", WS_POPUP, -32000, -32000, 1, 1, NULL, NULL, wc.hInstance, NULL);
	HWND game = CreateWindowExW(WS_EX_NOACTIVATE, wc.lpszClassName, L"", WS_POPUP, -32000, -32000, 640, 480, owner, NULL, wc.hInstance, NULL);
	if (!game)
		return 6;
	SetWindowPos(game, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
	if (!strcmp(what, "close"))
	{
		CrashOnDestroy = true; /* the player closes the game; its WM_DESTROY handler fails */
		DestroyWindow(game);
		return 5;
	}
	if (!strcmp(what, "exit"))
	{
		MeguLitCrash::NoteExit(); /* as the hook DLL's DLL_PROCESS_DETACH at exit */
		CrashHere();
		return 5;
	}
	Mode = !strcmp(what, "throw") ? 2 : 1;
	HHOOK hook = SetWindowsHookExW(WH_GETMESSAGE, OnMessage, NULL, GetCurrentThreadId());
	if (!hook)
		return 4;
	MSG m;
	PeekMessageW(&m, NULL, 0, 0, PM_NOREMOVE); /* the thread gets its queue */
	PostThreadMessageW(GetCurrentThreadId(), WM_APP, 0, 0);
	GetMessageW(&m, NULL, 0, 0);
	return 5; /* not reached: the hook procedure crashed */
}
static DWORD lastPid;
static DWORD Run(const char *what)
{
	wchar_t self[MAX_PATH], cmd[MAX_PATH + 64];
	GetModuleFileNameW(NULL, self, MAX_PATH);
	std::wstring dir(Dir, wcslen(Dir) - 1);
	_snwprintf_s(cmd, _TRUNCATE, L"\"%s\" %S \"%s\"", self, what, dir.c_str());
	STARTUPINFOW si = {sizeof si};
	PROCESS_INFORMATION pi;
	if (!CreateProcessW(NULL, cmd, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi))
		return 0xFFFFFFFF;
	WaitForSingleObject(pi.hProcess, 30000);
	DWORD code = 0;
	GetExitCodeProcess(pi.hProcess, &code);
	lastPid = pi.dwProcessId;
	CloseHandle(pi.hThread);
	CloseHandle(pi.hProcess);
	return code;
}
static std::wstring Report(const char *ext)
{
	wchar_t self[MAX_PATH], path[MAX_PATH];
	DWORD n = GetModuleFileNameW(NULL, self, MAX_PATH);
	const wchar_t *name = self;
	for (DWORD i = 0; i < n; i++)
		if (self[i] == L'\\')
			name = self + i + 1;
	_snwprintf_s(path, _TRUNCATE, L"%s%s-%lu.%S", Dir, name, lastPid, ext);
	return path;
}
int main(int argc, char **argv)
{
	if (argc >= 3)
	{
		MultiByteToWideChar(CP_ACP, 0, argv[2], -1, Dir, MAX_PATH);
		wcscat_s(Dir, L"\\"); /* passed without the trailing backslash, which would escape the closing quote */
		return Child(argv[1]);
	}
	GetTempPathW(MAX_PATH, Dir);
	wcscat_s(Dir, L"megulit-crash-witness\\");
	CreateDirectoryW(Dir, NULL);
	char exe[MAX_PATH];
	{
		char self[MAX_PATH];
		DWORD n = GetModuleFileNameA(NULL, self, MAX_PATH);
		const char *b = self;
		for (DWORD i = 0; i < n; i++)
			if (self[i] == '\\')
				b = self + i + 1;
		strcpy_s(exe, b);
	}
	uintptr_t crashRva = (uintptr_t)&CrashHere - (uintptr_t)&__ImageBase, probeRva = (uintptr_t)&ProbeNull - (uintptr_t)&__ImageBase, throwRva = (uintptr_t)&ThrowHere - (uintptr_t)&__ImageBase;

	DWORD code = Run("crash");
	std::string r = ReadAll(Report("txt").c_str());
	Check(code == 0xC000041D, "an access violation in a hook procedure ends the process with 0xC000041D (as 千恋＊万花)");
	Check(Count(r, "armed ") == 1, "the report starts with the armed line");
	uintptr_t probe = OffsetAfter(r, "first-chance 0xC0000005", exe);
	Check(probe >= probeRva && probe < probeRva + 64 && Count(r, "first-chance 0xC0000005") == 2, "a handled access violation is written once per address, with module+offset (the crash is the second)");
	uintptr_t at = OffsetAfter(r, "UNHANDLED", exe);
	Check(at >= crashRva && at < crashRva + 32, "the unhandled block names the faulting function as module+offset");
	Check(r.find("UNHANDLED 0x") != std::string::npos && r.find("(write 0x") != std::string::npos, "the access kind and address are written");
	WIN32_FILE_ATTRIBUTE_DATA a = {};
	bool dump = GetFileAttributesExW(Report("dmp").c_str(), GetFileExInfoStandard, &a) && a.nFileSizeLow > 4096;
	Check(dump && r.find(" dump written") != std::string::npos, "a minidump is written next to the report");
	Check(r.find(" state: visible windows=1\r\n") != std::string::npos, "a crash in play: the game's window is still shown");
	printf("     report:\n%s", r.c_str());
	DeleteFileW(Report("txt").c_str());
	DeleteFileW(Report("dmp").c_str());

	code = Run("close");
	r = ReadAll(Report("txt").c_str());
	Check(code == 0xC000041D && r.find(" state: visible windows=0\r\n") != std::string::npos, "the player closes the game and its WM_DESTROY fails: 0xC000041D, and no window is shown (the close flow)");
	DeleteFileW(Report("txt").c_str());
	DeleteFileW(Report("dmp").c_str());
	code = Run("exit");
	r = ReadAll(Report("txt").c_str());
	Check(code >= 0xC0000000 && r.find("exit: process exiting") != std::string::npos && r.find(", exiting\r\n") != std::string::npos, "an exception after the exit note is marked as part of the exit");
	DeleteFileW(Report("txt").c_str());
	DeleteFileW(Report("dmp").c_str());

	code = Run("throw");
	r = ReadAll(Report("txt").c_str());
	printf("     throw case exit 0x%08lX\n", code);
	Check(code >= 0xC0000000, "a C++ throw out of a hook procedure ends the process with a crash code (0xC000041D, or 0xC0000409 when the C++ runtime ends it first)");
	bool thrower = false;
	size_t u = r.find("UNHANDLED");
	for (size_t p = r.find(std::string(exe) + "+0x", u); u != std::string::npos && p != std::string::npos; p = r.find(std::string(exe) + "+0x", p + 1))
	{
		uintptr_t off = (uintptr_t)strtoull(r.c_str() + p + strlen(exe) + 3, nullptr, 16);
		if (off >= throwRva && off < throwRva + 128)
			thrower = true;
	}
	Check(u != std::string::npos && thrower, "its unhandled block lists the throwing function on the stack");
	DeleteFileW(Report("txt").c_str());
	DeleteFileW(Report("dmp").c_str());

	code = Run("release");
	r = ReadAll(Report("txt").c_str());
	Check(code == 0 && r.find("first-chance") == std::string::npos, "after Release nothing is written");
	DeleteFileW(Report("txt").c_str());
	code = Run("later-filter");
	Check(code == 0, "Release refuses while a filter set after ours may call it (the module must stay loaded)");
	DeleteFileW(Report("txt").c_str());
	if (!Failures)
		RemoveDirectoryW(Dir);
	printf(Failures ? "CRASH WITNESS SELFTEST FAILED\n" : "PASSED\n");
	return Failures ? 1 : 0;
}
