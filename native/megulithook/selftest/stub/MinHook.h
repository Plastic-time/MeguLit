// stand-in for the self-test only: DrawSites.h installs nothing there (the gate is driven by hand)
#pragma once
typedef enum MH_STATUS { MH_OK = 0, MH_ERROR = 1 } MH_STATUS;
static inline MH_STATUS MH_CreateHook(void *, void *, void **) { return MH_ERROR; }
static inline MH_STATUS MH_EnableHook(void *) { return MH_ERROR; }
