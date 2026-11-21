// SPDX-License-Identifier: GPL-3.0-or-later
// engine-draw, GDI draw sites (docs/engine-draw-native.md, "其余原生引擎"): the native engines that draw their text with a
// GDI text call (TextOut / ExtTextOut / DrawText / GetGlyphOutline) have one or a few call sites of it in their code. Each
// signature below names one such site: the module, the API it calls through its import table (call dword ptr [IAT slot],
// FF 15) and the bytes right before that call, with ?? for what differs between builds. A signature must match exactly
// `count` times in its module or it is not used. Pure byte matching, no Windows calls: selftest/drawsites.cpp runs it on
// snippets of the owner's exes, tools/engine-sigs/draw-sites.cjs reads this very table and runs the same algorithm on the
// owner's exes (validation/engine-draw-sig-sites.test.cjs). DrawSites.h hooks the sites at run time.
//
// The call is `call dword ptr [IAT slot]` (FF 15), or, when the pattern holds the token SLOT, a `call reg` (FF D0..D7) right after
// a pattern that loads the API's pointer from its slot (MinHook then also moves the instruction after it: keep such a site off
// a branch target).
// Table format (parsed by tools/engine-sigs/draw-sites.cjs, keep one entry per line):
//   { "id", "module" ("" = the game's exe), "API", "bytes before FF 15", count, frame },
// frame = 1 when the function holding the site keeps an EBP frame (its callers are read as via=); 0 = unknown; 8 and more = the
// function keeps no frame and its return address is that many bytes above the API's first argument at the call.
#pragma once
#include <cstdint>
#include <cstddef>
#include <cstring>
namespace DrawSitesSig {
struct Sig { const char *id, *module, *api, *pre; int count, frame; };
static const Sig Sigs[] = {
  // ReaLive / AVG32 (涙 ～流星のザドル～, AVG3216D.EXE 0x413880): the one routine that draws a string into the text DIB,
  // a character a call: TextOutA(hdc, x - scroll, y, s, 1 | 2); x / y are the canvas pen
  { "avg32", "", "TextOutA", "52 57 50 a1 ?? ?? ?? ?? 8b cb 2b c8 51 56", 1, 1 },
  // Softpal (時計仕掛けのレイライン, dll\PAL.dll 0x10008295): the glyph routine's one GetGlyphOutlineA(hdc, ch, GGO_GRAY8, &gm,
  // 0, NULL, &mat) (the size query; a font of type 4 takes the engine's own rasteriser instead and never comes here). No pen:
  // the places come from Pal.cpp's pal_sprite_v1 sprites
  { "softpal", "PAL.dll", "GetGlyphOutlineA", "8d 8d ?? ?? ff ff 51 6a 00 6a 00 8d 95 ?? ?? ff ff 52 6a 06 57 50", 1, 1 },
  // NScripter (月姬 v1.4 / v1.6, Tsukihime.exe: one build, 0x40eefe): the glyph routine 0x40eb20 (thiscall, first argument the
  // string; five callers) draws each character with TextOutA(hdc, x, 0, ch, 2) into a glyph bitmap (0x40f061 / 0x40f085 are its
  // conditional extra passes at 0,0 / 1,0, not signed); the pen on the page is one of the routine's own arguments (fargs).
  // No EBP frame: 0xfe4 bytes of prologue (SEH + 0xfc4 locals + 4 registers) and the 5 API arguments put its return address
  // 0xff8 above the first one
  { "nscripter", "", "TextOutA", "be 02 00 00 00 56 8d 44 24 14 50 6a 00 57 51", 1, 0xff8 },
  // MFC's CDC text wrappers (Innocent Grey, 虚ノ少女: Innocentsetup.exe 0x41adc7 / 0x41a849 / 0x41a808): CDC::TextOutW,
  // CDC::ExtTextOutW, CDC::DrawTextW forward their arguments with the DC's m_hDC ([ecx+4]). Every text the program draws through
  // CDC passes here, its own UI too; via (EBP frame) is the program's routine that called CDC, which tells them apart. Any MFC
  // program with this code matches: the ids say MFC, not the game
  { "mfc-textoutw", "", "TextOutW", "55 8b ec ff 75 14 ff 75 10 ff 75 0c ff 75 08 ff 71 04", 1, 1 },
  { "mfc-exttextoutw", "", "ExtTextOutW", "55 8b ec ff 75 20 ff 75 1c ff 75 18 ff 75 14 ff 75 10 ff 75 0c ff 75 08 ff 71 04", 1, 1 },
  { "mfc-drawtextw", "", "DrawTextW", "55 8b ec ff 75 14 ff 75 10 ff 75 0c ff 75 08 ff 71 04", 1, 1 },
  // AdvHD / WillPlus (Under The Moon, utmoon.exe 0x40f5d9): the glyph routine 0x40f2a0 (23 callers: every text the engine
  // draws) asks GetGlyphOutlineA(hdc, ch, GGO_GRAY8, &gm, 0, NULL, &mat) for each character (0x40f613 renders it, 0x40ff0b /
  // 0x40ff3a / 0x40fff0 are its TextOutA edge passes: not signed). No EBP frame: sub esp,0xb8 + 4 registers + the 7 API
  // arguments put the routine's return address 0xe4 above the first one; via = the caller (dialogue, name, choice, menu)
  { "advhd", "", "GetGlyphOutlineA", "8d 44 24 ?? 50 6a 00 6a 00 8d 4c 24 ?? 51 6a 06 56 52", 1, 0xe4 },
  // CMVS (青い鳥, cmvs32.exe 0x46145e): the glyph routine 0x4613b0 (EBP frame, 2 callers) asks GetGlyphOutlineA(hdc, ch,
  // GGO_GRAY4, &gm, 0, NULL, &mat) for each character (0x4614b7 renders it: not signed); no pen, via / via2 = its callers
  { "cmvs", "", "GetGlyphOutlineA", "8d 4d ?? 51 6a 00 6a 00 8d 4d ?? 0f b7 c6 51 6a 05 50 ff 75 08 0f 11 45 ??", 1, 1 },
  // FVP (いろとりどりのヒカリ: Hikari.exe 0x430d6f / 0x430e2c, irohika_HD.exe 0x4327cf / 0x43288c, one layout): the glyph routine
  // (push ebp as a register, then esi / edi: no frame) takes one of two paths by its third argument: GetGlyphOutlineA(..,
  // GGO_METRICS, ..) alone, or GGO_BITMAP size then render; one signature each (the size query in between is not signed).
  // Return address 0x28 / 0x2c above the API's first argument (depth 0xc / 0x10 + the 7 arguments)
  { "fvp", "", "GetGlyphOutlineA", "68 ?? ?? ?? ?? 6a 00 6a 00 8d 86 ?? ?? 00 00 50 6a 00 51 52", 1, 0x28 },
  { "fvp-bitmap", "", "GetGlyphOutlineA", "8b 45 0c 8b 4e 04 68 ?? ?? ?? ?? 50 0f b7 44 24 20 57 53 6a 01 50 51", 1, 0x2c },
  // minori (eden*, Steam English build, eden_en.exe 0x5192ee): the glyph routine 0x519190 (EBP frame, 3 callers) renders each
  // character with GetGlyphOutlineA (0x5191d8 before it is the size query: not signed); no pen, via / via2 = its callers
  { "minori", "", "GetGlyphOutlineA", "8b 46 18 8b 4d 08 68 ?? ?? ?? ?? 52 8b 96 ?? ?? 00 00 53 57 50 51 52", 1, 1 },
  // Musica / ぱれっと (ましろ色シンフォニー, mashiroiro.exe 0x459d40): the glyph routine 0x459d0b (EBP frame, 2 callers) loads
  // GetGlyphOutlineA into edi and calls it once (mov edi, [slot]; push eax (the DC from 0x459c54); call edi); the instruction after
  // it (cmp eax, 1) goes into MinHook's trampoline with it. No pen, via / via2 = its callers
  { "musica", "", "GetGlyphOutlineA", "8b 3d SLOT 50", 1, 1 },
};
static const int SigCount = (int)(sizeof(Sigs) / sizeof(Sigs[0]));

// "52 57 ?? 50" -> bytes + mask (mask 0 = any, 2 = a byte of the API's IAT slot: the token SLOT is 4 of them); returns the length
inline int Pattern(const char *s, unsigned char *bytes, unsigned char *mask, int max) {
  int n = 0;
  while (*s && n < max) {
    while (*s == ' ') s++;
    if (!s[0] || !s[1]) break;
    if (!strncmp(s, "SLOT", 4)) { if (n + 4 > max) return -1; for (int k = 0; k < 4; k++) { bytes[n] = 0; mask[n] = 2; n++; } s += 4; continue; }
    if (s[0] == '?' && s[1] == '?') { bytes[n] = 0; mask[n] = 0; }
    else {
      auto hex = [](char c) -> int { return c >= '0' && c <= '9' ? c - '0' : c >= 'a' && c <= 'f' ? c - 'a' + 10 : c >= 'A' && c <= 'F' ? c - 'A' + 10 : -1; };
      int a = hex(s[0]), b = hex(s[1]); if (a < 0 || b < 0) return -1;
      bytes[n] = (unsigned char)(a * 16 + b); mask[n] = 0xff;
    }
    n++; s += 2;
  }
  return n;
}
// The sites: without SLOT in the pattern, every `call dword ptr [slot]` (FF 15 slot) whose slot is one of `slots` and whose
// preceding bytes match `pre`; with SLOT (the API pointer loaded into a register first: mov edi, [slot] ... call edi), every
// `call reg` (FF D0..D7) right after the pattern whose SLOT bytes are one of `slots`. out[] gets the offsets of the call in
// code. Returns how many there are (out holds at most `max`).
inline int Find(const unsigned char *code, size_t size, const std::uint32_t *slots, int nslots, const char *pre, size_t *out, int max) {
  unsigned char b[64], m[64]; int len = Pattern(pre, b, m, 64); if (len < 0) return 0;
  int slotAt = -1; for (int k = 0; k < len; k++) if (m[k] == 2) { slotAt = k; break; }
  auto known = [&](std::uint32_t v) { for (int k = 0; k < nslots; k++) if (slots[k] == v) return true; return false; };
  int hits = 0;
  for (size_t i = (size_t)len; i + 6 <= size; i++) {
    if (code[i] != 0xff) continue;
    if (slotAt < 0) {
      if (code[i + 1] != 0x15) continue;
      std::uint32_t slot; std::memcpy(&slot, code + i + 2, 4); if (!known(slot)) continue;
    } else {
      if ((code[i + 1] & 0xf8) != 0xd0) continue;
      std::uint32_t slot; std::memcpy(&slot, code + i - len + slotAt, 4); if (!known(slot)) continue;
    }
    bool ok = true; for (int k = 0; k < len && ok; k++) if (m[k] == 0xff && code[i - len + k] != b[k]) ok = false;
    if (!ok) continue;
    if (hits < max) out[hits] = i;
    hits++;
  }
  return hits;
}
// SJIS lead byte (one character = two bytes)
inline bool SjisLead(unsigned char c) { return (c >= 0x81 && c <= 0x9f) || (c >= 0xe0 && c <= 0xfc); }
}
