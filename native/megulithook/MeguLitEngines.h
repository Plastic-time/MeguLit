#pragma once
/* MeguLit 2026-11-19 (one hook runtime): the exact-program adapters that had runtimes of their own (runtime/hook-island,
   runtime/hook-mages[-e201]), now engines of MeguLitHook32. Each matches only the program it always matched, so no other
   game sees them; enginecollection32.cpp lists them first. */
#include "engine32/ToMeIslandDraw.h"
#include "MeguLitMatch.h"
#include "MagesDraw.h" /* engine-draw 2026-11-21: STEINS;GATE takes the generic MAGES draw reader too (opt-in) */
#include "DanganronpaPc.h"
namespace megulit_sg_hookmages { bool MAGES(); }
/* ISLAND (CatSystem2): ISLAND.exe whose whole file has the supported SHA-256 (ToMeIslandDraw::ExactFile) */
class ToMeIsland : public ENGINE {
public:
  ToMeIsland() { check_by = CHECK_BY::CUSTOM; check_by_target = []() { return MeguLitMatch::Island(processName, !_wcsicmp(processName, L"ISLAND.exe") && ToMeIslandDraw::ExactFile()); }; }
  bool attach_function() override { return ToMeIslandDraw::Install(); }
};
/* STEINS;GATE (MAGES): Game.exe with the supported PE time stamp */
class ToMeSteinsGate : public ENGINE {
public:
  ToMeSteinsGate() {
    check_by = CHECK_BY::CUSTOM;
    check_by_target = []() {
      auto dos = reinterpret_cast<IMAGE_DOS_HEADER *>(processStartAddress);
      auto pe = reinterpret_cast<IMAGE_NT_HEADERS *>(processStartAddress + dos->e_lfanew);
      return MeguLitMatch::SteinsGate(processName, pe->FileHeader.TimeDateStamp);
    };
  }
  bool attach_function() override { MagesDraw::Arm(processStartAddress); return megulit_sg_hookmages::MAGES(); }
};
/* An explicit private input grant, exact PC executable and exact Japanese resources are required. */
class ToMeDanganronpaPc : public ENGINE {
public:
  ToMeDanganronpaPc() { check_by=CHECK_BY::CUSTOM;check_by_target=[](){return DanganronpaPc::Match();}; }
  bool attach_function() override { return DanganronpaPc::Install(); }
};
