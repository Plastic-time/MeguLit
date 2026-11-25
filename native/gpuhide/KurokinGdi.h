// SPDX-License-Identifier: GPL-3.0-or-later
// Retail Will / littlecheese v1.00, x86. This executable blends the dialogue
// into a retained bitmap before its per-glyph GDI blit. Dropping the blit alone
// cannot hide the pixels already present in that bitmap.
#include "LittlecheeseRows.h"
#ifdef _M_IX86
static constexpr uintptr_t KurokinDialogueReturn = 0x31221;
static constexpr int KurokinW = 800, KurokinH = 600;
static void *KurokinDrawOriginal, *KurokinAdvance;
static const unsigned char *KurokinBase;
static Littlecheese::Rows KurokinRows;
static int KurokinMode = 0; // 0: other stream, 1: read only, 2: replace dialogue pixels
static unsigned KurokinSequence;

static bool __stdcall KurokinChar(unsigned glyph, int x, int y, int w, int h, uintptr_t via, uintptr_t layout) {
 if (via != (uintptr_t)KurokinBase + KurokinDialogueReturn ||
     x < 0 || y < 0 || w < 1 || h < 1 || w > 96 || h > 96 || x > KurokinW - w || y > KurokinH - h) return false;
 char bytes[] = {(char)(glyph >> 8), (char)glyph};
 wchar_t ch;
 if (MultiByteToWideChar(932, MB_ERR_INVALID_CHARS, bytes + (glyph < 256), glyph < 256 ? 1 : 2, &ch, 1) != 1 ||
     ch <= L' ' || ch == 0x3000 || ch == 0x7f) return false;
 Guard g;
 return KurokinRows.Draw(layout, ch, x, y, w, h, GetTickCount(), KurokinMode == 2 && !Learner.readOnly);
}

// After the glyph metrics lookup (Ruf's text hook), before shadow and fill.
// The game's own continuation still advances the cursor and returns its width.
static __declspec(naked) void KurokinDraw() {
 __asm {
  pushfd
  pushad
  lea eax, [esp + 36]
  push esi
  push dword ptr [eax + 60]
  push dword ptr [eax + 16]
  push dword ptr [eax + 12]
  push edi
  push dword ptr [eax + 8]
  movzx ecx, word ptr [eax]
  push ecx
  call KurokinChar
  test al, al
  jnz hidden
  popad
  popfd
  jmp dword ptr [KurokinDrawOriginal]
 hidden:
  popad
  popfd
  jmp dword ptr [KurokinAdvance]
 }
}

static bool InstallKurokinDraw() {
 const auto base = reinterpret_cast<unsigned char *>(GetModuleHandleW(nullptr));
 if (!base) return false;
 auto dos = reinterpret_cast<const IMAGE_DOS_HEADER *>(base);
 if (dos->e_magic != IMAGE_DOS_SIGNATURE || dos->e_lfanew < 0 || dos->e_lfanew > 4096) return false;
 auto pe = reinterpret_cast<const IMAGE_NT_HEADERS *>(base + dos->e_lfanew);
 if (pe->Signature != IMAGE_NT_SIGNATURE || pe->FileHeader.Machine != IMAGE_FILE_MACHINE_I386 ||
     pe->FileHeader.TimeDateStamp != 0x4ce12607 || pe->OptionalHeader.SizeOfImage != 0x185000) return false;
 const unsigned char locals[] = {0x8b,0xf2,0x8b,0xd8,0x66,0x89,0x0c,0x24,0x8b,0x86,0xa0,0,0,0};
 const unsigned char blend[] = {0x8a,0x83,0xf5,0x03,0,0,0x84,0xc0,0x0f,0x84,0xca,0,0,0};
 const unsigned char advance[] = {0x8b,0x4c,0x24,0x0c,0x01,0x4e,0x40,0x8b,0x44,0x24,0x0c,0x83,0xc4,0x2c,0x5d,0x5f,0x5e,0x5b,0xc3};
 const unsigned char caller[] = {0xe8,0x1b,0xc8,0xfe,0xff,0x8b,0x45,0x9c,0x8b,0x55,0x98,0x3b,0xc2};
 auto target = base + 0x1db43;
 if (memcmp(base + 0x1da43, locals, sizeof locals) || memcmp(target, blend, sizeof blend) ||
     memcmp(base + 0x1dd64, advance, sizeof advance) ||
     memcmp(base + KurokinDialogueReturn - 5, caller, sizeof caller)) return false;
 KurokinBase = base;
 KurokinAdvance = base + 0x1dd64;
 if (MH_CreateHook(target, (void *)&KurokinDraw, &KurokinDrawOriginal) != MH_OK) return false;
 if (MH_QueueEnableHook(target) == MH_OK) return true;
 return false;
}

static bool KurokinLine(const std::wstring &line, unsigned now) {
 if (!KurokinMode) return false;
 std::wstring key;
 for (wchar_t ch : line) if (ch != L' ' && ch != 0x3000 && ch != L'\t') key += ch;
 auto matched = KurokinRows.Claim(key, now);
 if (matched.cells.empty()) return true;
 const unsigned seq = ++KurokinSequence;
 std::string rects, painted;
 bool anyHidden = false;
 for (const auto &c : matched.cells) {
  if (!rects.empty()) rects += ';';
  painted += c.hidden ? '0' : '1';
  anyHidden = anyHidden || c.hidden;
  rects += std::to_string(c.x) + "," + std::to_string(c.y) + "," + std::to_string(c.w) + "," + std::to_string(c.h);
 }
 Send("ToMe_CHARS engine=littlecheese line=" + std::to_string(seq) + " hidden=" + (matched.hidden ? "1" : "0") +
      " sw=800 sh=600 vx=0 vy=0 vw=0 vh=0 n=" + std::to_string(matched.cells.size()) + " rects=" + rects +
      " bitmap=" + std::to_string(matched.page) + (anyHidden && !matched.hidden ? " painted=" + painted : "") + " text=" + Utf8(key));
 return true;
}
static void KurokinSetMode(int mode) {
 if (!KurokinDrawOriginal) return;
 KurokinMode = mode;
 if (mode == 0) KurokinRows.Clear();
 Learner.Off();
 Trace.Off();
}
#endif
