// SPDX-License-Identifier: GPL-3.0-or-later
/* MeguLit DirectPlay decline (2026-11-12, user: Saya no Uta 2003 opened a Windows "install DirectPlay, then restart" window).
   Windows ships every DirectPlay DLL as a stub until the optional feature is installed; loading a stub opens that window.
   A game that only tries to load DirectPlay (LoadLibrary, not an import) gets this DLL under the same name in its own
   folder instead, which Windows loads first: it refuses to load, the same answer the game gets when the window is
   cancelled, so the game goes on with no window and no restart. */
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
BOOL WINAPI DllMain(HINSTANCE instance, DWORD reason, LPVOID reserved) {
  (void)instance; (void)reserved;
  return reason != DLL_PROCESS_ATTACH;
}
