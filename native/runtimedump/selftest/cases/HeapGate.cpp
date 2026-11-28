// Heap hook vs Gate (2026-11-28, a CMVS game froze at startup): the heap calls the hooked RtlAllocateHeap again while it
// holds its own locks, and a thread that holds Gate allocates and waits for those locks. If the heap hook waits for
// Gate, the two threads wait on each other. Here one thread holds Gate (through the DLL's self-test export) while
// another allocates inside the armed size window right after a tracked read; the allocation must return well before
// the lock is released.
#include "../fakegame.h"

typedef int(__cdecl *SelfTestFn)(int, DWORD);
static SelfTestFn SelfTest;
static DWORD Size;
static DWORD WINAPI HoldGate(void *) { return (DWORD)SelfTest(1, 4000); }
static DWORD WINAPI Allocate(void *) {
 for (int k = 0; k < 8; k++) { void *p = HeapAlloc(GetProcessHeap(), 0, Size); if (p) HeapFree(GetProcessHeap(), 0, p); }
 return 0;
}

int CaseHeapGate(FakeGame &) {
 HMODULE dll = GetModuleHandleA(sizeof(void *) == 8 ? "MeguLitDump64.dll" : "MeguLitDump32.dll");
 SelfTest = dll ? (SelfTestFn)GetProcAddress(dll, "MeguLitDumpSelfTest") : NULL;
 if (!SelfTest) { printf("FAIL heap gate: MeguLitDumpSelfTest export missing\n"); return 1; }
 SetEnvironmentVariableA("MEGULIT_DUMP_SELFTEST", "1");
 std::string text = Repeat(Encode(L"「ヒープの中でロックを待ってはいけない」\r\n", 932), 40);
 Put("heapgate.dat", text);
 // A tracked read arms the heap watch for 1.5 s, for allocations of about this size.
 DWORD n = 0; char *read = ReadAll("heapgate.dat", &n); free(read);
 Size = n;
 int fail = 0;
 HANDLE holder = CreateThread(NULL, 0, HoldGate, NULL, 0, NULL);
 Sleep(100); // the holder now sits on Gate for 4 s; the watch is still armed
 HANDLE alloc = CreateThread(NULL, 0, Allocate, NULL, 0, NULL);
 if (WaitForSingleObject(alloc, 1000) != WAIT_OBJECT_0) { printf("FAIL heap gate: an armed allocation waited for the core lock held by another thread\n"); fail++; }
 WaitForSingleObject(alloc, 10000);
 WaitForSingleObject(holder, 10000);
 CloseHandle(holder); CloseHandle(alloc);
 SetEnvironmentVariableA("MEGULIT_DUMP_SELFTEST", NULL);
 return fail;
}
