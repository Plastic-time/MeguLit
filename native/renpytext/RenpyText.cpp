// SPDX-License-Identifier: GPL-3.0-or-later
// MeguLitRenpy32/64.dll (E301, user 2026-11-10: place each sentence of a full-screen page where the game drew it, for
// every engine, not only ISLAND and KiriKiri). Ren'Py runs on an embedded CPython, so instead of hooking machine code
// this DLL asks the game's own interpreter: it finds the loaded Python runtime (libpython3.x.dll, python3x.dll,
// python27.dll ...; the module that exports the C API below), and every two seconds takes the GIL and runs
// MeguLitRenpy.py (next to this DLL) with PyRun_SimpleStringFlags. That script installs its wrappers once and reports
// sentence positions to \\.\pipe\MeguLitRenpy-<pid> by itself (see the script). Every step is guarded: no Python, no
// script, a finalizing interpreter, or anything missing leaves the game untouched.
#include <windows.h>
#include <tlhelp32.h>
#include <string>

namespace {
typedef int(__cdecl *IsInitializedFn)(void);
typedef int(__cdecl *GilEnsureFn)(void);
typedef void(__cdecl *GilReleaseFn)(int);
typedef int(__cdecl *RunFn)(const char *, void *);
typedef int(__cdecl *FinalizingFn)(void);

HMODULE Self;
volatile LONG Stop;

struct Python {
 IsInitializedFn initialized = nullptr;
 GilEnsureFn ensure = nullptr;
 GilReleaseFn release = nullptr;
 RunFn run = nullptr;
 FinalizingFn finalizing = nullptr;
 bool ok() const { return initialized && ensure && release && run; }
};

std::string Script() {
 wchar_t path[MAX_PATH * 2];
 DWORD n = GetModuleFileNameW(Self, path, MAX_PATH * 2);
 if (!n || n >= MAX_PATH * 2) return std::string();
 std::wstring file(path, n);
 size_t slash = file.find_last_of(L"\\/");
 if (slash == std::wstring::npos) return std::string();
 file = file.substr(0, slash + 1) + L"MeguLitRenpy.py";
 HANDLE h = CreateFileW(file.c_str(), GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL);
 if (h == INVALID_HANDLE_VALUE) return std::string();
 std::string data;
 LARGE_INTEGER size;
 if (GetFileSizeEx(h, &size) && size.QuadPart > 0 && size.QuadPart < (1 << 20)) {
  data.resize((size_t)size.QuadPart);
  DWORD got = 0;
  if (!ReadFile(h, &data[0], (DWORD)data.size(), &got, NULL) || got != data.size()) data.clear();
 }
 CloseHandle(h);
 if (data.size() >= 3 && (unsigned char)data[0] == 0xEF && (unsigned char)data[1] == 0xBB && (unsigned char)data[2] == 0xBF) data.erase(0, 3);
 std::string clean; // CPython's string parser wants plain newlines
 clean.reserve(data.size());
 for (char c : data) if (c != '\r') clean += c;
 return clean;
}

// The loaded module that exports the whole C API we call. Ren'Py 8 loads libpython3.x.dll; older builds python2x.dll.
Python Find() {
 Python py;
 HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, GetCurrentProcessId());
 if (snap == INVALID_HANDLE_VALUE) return py;
 MODULEENTRY32W me;
 me.dwSize = sizeof me;
 for (BOOL more = Module32FirstW(snap, &me); more; more = Module32NextW(snap, &me)) {
  HMODULE m = me.hModule;
  if (m == Self) continue;
  Python p;
  p.initialized = (IsInitializedFn)GetProcAddress(m, "Py_IsInitialized");
  p.ensure = (GilEnsureFn)GetProcAddress(m, "PyGILState_Ensure");
  p.release = (GilReleaseFn)GetProcAddress(m, "PyGILState_Release");
  p.run = (RunFn)GetProcAddress(m, "PyRun_SimpleStringFlags");
  p.finalizing = (FinalizingFn)GetProcAddress(m, "Py_IsFinalizing");
  if (!p.finalizing) p.finalizing = (FinalizingFn)GetProcAddress(m, "_Py_IsFinalizing");
  if (p.ok()) { py = p; break; }
 }
 CloseHandle(snap);
 return py;
}

int Guarded(const Python &py, const char *script) {
 __try {
  if (!py.initialized() || (py.finalizing && py.finalizing())) return 1;
  int state = py.ensure();
  py.run(script, NULL);
  py.release(state);
  return 0;
 } __except (EXCEPTION_EXECUTE_HANDLER) {
  return 2;
 }
}

DWORD WINAPI Worker(void *) {
 std::string script = Script();
 if (script.empty()) return 0;
 Python py;
 for (DWORD started = GetTickCount(); !Stop;) {
  if (!py.ok()) {
   py = Find();
   if (!py.ok() && GetTickCount() - started > 120000) return 0; // not a Python game
  }
  if (py.ok() && Guarded(py, script.c_str()) == 2) return 0;
  Sleep(py.ok() ? 2000 : 500);
 }
 return 0;
}
}

extern "C" BOOL WINAPI DllMain(HINSTANCE instance, DWORD reason, LPVOID) {
 if (reason == DLL_PROCESS_ATTACH) {
  Self = instance;
  DisableThreadLibraryCalls(instance);
  // Stays loaded for the life of the game: the script's wrappers live in the game's interpreter, not in this DLL.
  HMODULE pin;
  GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_PIN, (LPCWSTR)&DllMain, &pin);
  HANDLE t = CreateThread(NULL, 0, Worker, NULL, 0, NULL);
  if (t) CloseHandle(t);
 } else if (reason == DLL_PROCESS_DETACH) {
  InterlockedExchange(&Stop, 1);
 }
 return TRUE;
}
