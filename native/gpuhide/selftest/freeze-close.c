// SPDX-License-Identifier: GPL-3.0-or-later
// Use the real MinHook freeze code, observing the calls a file detour could intercept.
#include <windows.h>
#include <stdio.h>

static unsigned suspended, prematureCloses;
static DWORD ObserveSuspend(HANDLE thread) {
    DWORD previous = SuspendThread(thread);
    if (previous != (DWORD)-1) ++suspended;
    return previous;
}
static DWORD ObserveResume(HANDLE thread) {
    DWORD previous = ResumeThread(thread);
    if (previous != (DWORD)-1) --suspended;
    return previous;
}
static BOOL ObserveClose(HANDLE handle) {
    if (suspended != 0) ++prematureCloses;
    return CloseHandle(handle);
}

#define SuspendThread ObserveSuspend
#define ResumeThread ObserveResume
#define CloseHandle ObserveClose
#include "../../shared/minhook/src/hook.c"
#undef SuspendThread
#undef ResumeThread
#undef CloseHandle

static DWORD WINAPI WaitForRelease(void *event) {
    return WaitForSingleObject((HANDLE)event, 5000);
}

int main(void) {
    HANDLE release = CreateEventW(NULL, TRUE, FALSE, NULL);
    HANDLE thread = release ? CreateThread(NULL, 0, WaitForRelease, release, 0, NULL) : NULL;
    if (!thread || MH_Initialize() != MH_OK) return 1;
    {
        FROZEN_THREADS threads;
        MH_STATUS status = Freeze(&threads, ALL_HOOKS_POS, ACTION_ENABLE);
        unsigned frozen = suspended;
        if (status == MH_OK) Unfreeze(&threads);
        SetEvent(release);
        DWORD finished = WaitForSingleObject(thread, 5000);
        CloseHandle(thread);
        CloseHandle(release);
        if (status != MH_OK || !frozen || suspended || finished != WAIT_OBJECT_0 || MH_Uninitialize() != MH_OK)
            return 1;
    }
    printf("%s CloseHandle during freeze (%u premature closes)\n", prematureCloses ? "FAIL" : "PASS no", prematureCloses);
    return prematureCloses ? 1 : 0;
}
