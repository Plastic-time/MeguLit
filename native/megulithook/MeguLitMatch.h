#pragma once
/* MeguLit 2026-11-19 (one hook runtime): which program each exact adapter of MeguLitHook32 attaches to, kept exactly as the
   dedicated runtimes matched it. Pure functions, so selftest/match.cpp can prove that no other program (another MAGES game,
   another CatSystem2 build) ever reaches an adapter. */
#include <windows.h>
namespace MeguLitMatch
{
  /* STEINS;GATE (MAGES): Game.exe with this PE time stamp; every other MAGES game keeps upstream's MAGES engine (5pb) */
  inline bool SteinsGate(const wchar_t *name, DWORD timeDateStamp) { return name && !_wcsicmp(name, L"Game.exe") && timeDateStamp == 0x5ddf7af0; }
  /* ISLAND (CatSystem2): ISLAND.exe whose whole file has the supported SHA-256 (ToMeIslandDraw::ExactFile) */
  inline bool Island(const wchar_t *name, bool exactFile) { return name && !_wcsicmp(name, L"ISLAND.exe") && exactFile; }
}
