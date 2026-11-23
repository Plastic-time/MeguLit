/* one hook runtime (2026-11-19): the exact adapters of MeguLitHook32 match only the programs they always matched
   (MeguLitMatch.h). Other MAGES games (CHAOS;CHILD, STEINS;GATE 0, another build: Game.exe with another time stamp) and other
   CatSystem2 games never reach them. Exit code = failures. */
#include "../MeguLitMatch.h"
#include <cstdio>
static int Failures = 0;
static void Check(bool ok, const char *what) { printf("%s %s\n", ok ? "PASS" : "FAIL", what); if (!ok) Failures++; }
int main()
{
  Check(MeguLitMatch::SteinsGate(L"Game.exe", 0x5ddf7af0), "STEINS;GATE: Game.exe with the supported time stamp");
  Check(MeguLitMatch::SteinsGate(L"GAME.EXE", 0x5ddf7af0), "STEINS;GATE: the name in any case");
  Check(!MeguLitMatch::SteinsGate(L"Game.exe", 0x5ddf7af1), "another MAGES build (time stamp off by one): upstream MAGES");
  Check(!MeguLitMatch::SteinsGate(L"Game.exe", 0x5a1b2c3d), "CHAOS;CHILD / STEINS;GATE 0 (Game.exe, other time stamp): upstream MAGES");
  Check(!MeguLitMatch::SteinsGate(L"ChaosChild.exe", 0x5ddf7af0), "another program with the same time stamp: upstream");
  Check(!MeguLitMatch::SteinsGate(nullptr, 0x5ddf7af0), "no name: nothing");
  Check(MeguLitMatch::Island(L"ISLAND.exe", true), "ISLAND: ISLAND.exe with the supported file hash");
  Check(!MeguLitMatch::Island(L"ISLAND.exe", false), "another ISLAND build (hash differs): upstream CatSystem2");
  Check(!MeguLitMatch::Island(L"cs2.exe", true), "another CatSystem2 game: upstream CatSystem2");
  printf("exact adapter match: %d failure(s)\n", Failures);
  return Failures;
}
