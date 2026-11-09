// Stand-in KiriKiri plug-in: keeps the exporter it is linked with, like tp_stub does.
#include <windows.h>
static void *Exporter;
#ifdef _M_IX86
#pragma comment(linker, "/EXPORT:V2Link=_V2Link@4")
#endif
extern "C" __declspec(dllexport) HRESULT __stdcall V2Link(void *exporter) { Exporter = exporter; return S_OK; }
extern "C" __declspec(dllexport) void *__stdcall LinkedExporter() { return Exporter; }
BOOL WINAPI DllMain(HINSTANCE, DWORD, void *) { return TRUE; }
