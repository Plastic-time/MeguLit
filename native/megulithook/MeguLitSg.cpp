// SPDX-License-Identifier: GPL-3.0-or-later
/* MeguLit 2026-11-19 (one hook runtime): the STEINS;GATE (MAGES) adapter that runtime/hook-mages(-e201) carried, built into
   MeguLitHook32 from the same sources (native/mages: SC3 embed through sgBlank, E201 original ruby with the source text).
   They are compiled here under their own namespaces, megulit_sg_mages / megulit_sg_hookmages, so upstream's MAGES engine
   (engines/mages, used by 5pb for every other MAGES game) stays exactly as it is. Only the ToMeSteinsGate engine
   (MeguLitEngines.h: Game.exe with the supported PE time stamp) calls megulit_sg_hookmages::MAGES. */
#include "mages/mages.h"
#define mages megulit_sg_mages
#define hookmages megulit_sg_hookmages
namespace megulit_sg_mages { std::wstring readString(uintptr_t address, int _idx); }
namespace megulit_sg_hookmages { bool MAGES(); }
#include "MeguLitSg_readString.inc"
#include "MeguLitSg_mages.inc"
#undef mages
#undef hookmages
