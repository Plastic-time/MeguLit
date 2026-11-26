// SPDX-License-Identifier: GPL-3.0-or-later
#include "Sact2Dialogue.h"

#ifdef _M_IX86
static void *Sact2DrawOriginal;
static const unsigned char *Sact2Base;
static volatile LONG Sact2Hide, Sact2Installed;

// This SACT renderer draws the sprite's retained list into the software surface.
// Shorten only this call's range. The original list still supplies the backlog.
static uintptr_t __stdcall Sact2DrawEnd(const uintptr_t *args) {
 const auto end = args[3];
 if (!InterlockedCompareExchange(&Sact2Hide, 0, 0) ||
     args[0] != (uintptr_t)Sact2Base + 0x504d || args[6] != 3 || args[7] != 355 || args[2] >= end) return end;
 const auto bytes = end - args[2];
 if (bytes % sizeof(void *) || bytes > Sact2::MaxGlyphs * sizeof(void *)) return end;
 const auto count = bytes / sizeof(void *);
 const void *nodes[Sact2::MaxGlyphs];
 if (!SafeCopy(nodes, (const void *)args[2], bytes)) return end;
 Sact2::Glyph glyphs[Sact2::MaxGlyphs];
 for (size_t i = 0; i < count; ++i) {
  unsigned node[8];
  if (!SafeCopy(node, nodes[i], sizeof node)) return end;
  glyphs[i] = {(int)node[1], (int)node[2], node[7] & 0xffff};
 }
 const auto keep = Sact2::DrawCount(true, (int)args[6], (int)args[7], glyphs, count);
 if (keep == count) return end;
 if (Diag) {
  // Repeat draws of the same retained list are common while the wait icon blinks.
  static thread_local unsigned last;
  unsigned hash = 2166136261u;
  for (size_t i = keep; i < count; ++i) hash = (hash ^ glyphs[i].code) * 16777619u;
  if (last != hash) { last = hash; Log("SACT2 dialogue paint omitted glyphs=%u", (unsigned)(count - keep)); }
 }
 return args[2] + keep * sizeof(void *);
}

static __declspec(naked) void Sact2Draw() {
 __asm {
  pushfd
  pushad
  lea eax, [esp + 36]
  push eax
  call Sact2DrawEnd
  mov [esp + 48], eax
  popad
  popfd
  jmp dword ptr [Sact2DrawOriginal]
 }
}

static const unsigned char *Sact2Image(const wchar_t *name, DWORD stamp, DWORD size) {
 const auto base = reinterpret_cast<const unsigned char *>(GetModuleHandleW(name));
 if (!base) return nullptr;
 const auto dos = reinterpret_cast<const IMAGE_DOS_HEADER *>(base);
 if (dos->e_magic != IMAGE_DOS_SIGNATURE || dos->e_lfanew < 0 || dos->e_lfanew > 4096) return nullptr;
 const auto pe = reinterpret_cast<const IMAGE_NT_HEADERS *>(base + dos->e_lfanew);
 return pe->Signature == IMAGE_NT_SIGNATURE && pe->FileHeader.Machine == IMAGE_FILE_MACHINE_I386 &&
        pe->FileHeader.TimeDateStamp == stamp && pe->OptionalHeader.SizeOfImage == size ? base : nullptr;
}

static bool InstallSact2Draw() {
 // The message sprite's layout is specific to this System4.0 build.
 if (!Sact2Image(nullptr, 0x40eb4cfb, 0x38000) || !Sact2Image(L"SACT2.dll", 0x40c3c35f, 0x46000)) return false;
 const auto base = Sact2Image(L"SactEngine.dll", 0x40fce574, 0x1a000);
 if (!base) return false;
 const unsigned char caller[] = {0xe8,0x43,0x33,0,0,0x83,0xc4,0x28};
 const unsigned char draw[] = {0x8b,0x44,0x24,0x0c,0x56,0x8b,0x74,0x24,0x0c,0x3b,0xf0,0x57,0x74,0x42};
 if (memcmp(base + 0x5048, caller, sizeof caller) || memcmp(base + 0x8390, draw, sizeof draw)) return false;
 Sact2Base = base;
 void *target = const_cast<unsigned char *>(base + 0x8390);
 return MH_CreateHook(target, (void *)&Sact2Draw, &Sact2DrawOriginal) == MH_OK && MH_QueueEnableHook(target) == MH_OK;
}
#endif
