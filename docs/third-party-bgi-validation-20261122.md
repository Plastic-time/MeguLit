# BGI validation source supplement

No new third-party package, binary, game archive or implementation was downloaded

| Material used | Exact local source | Licence / use |
|---|---|---|
| BGI permissions and actual-call gate | MeguLit commit `8c774853e923d7b354d42236c8235eee444ec52a`, BgiDraw.h and four BGI selftest files | Existing GPL-3.0-or-later project code; restored without unrelated ancestor changes |
| Original BGI signature | MeguLit `feat/re-bgi` tip `a2392329607d46c69f5274c2666f45c7f10cd04d`, current base matcher and byte fixture | Existing GPL-3.0-or-later project code; local sample byte fixtures retained unchanged |
| Legacy sprite scanner | MeguLit commit `7169097a6828c2c7c77d9093b8fc607638caf346`, MeguLitBgiSprite.h and selftest/bgisprite.cpp | Existing project code, compiled/read only from the old worktree; not newly integrated |
| MinHook 1.3.3 | `native/shared/minhook`, upstream `https://github.com/TsudaKageyu/minhook` | Existing BSD 2-Clause notices preserved in LICENSE.txt; no source changes |
| Existing BGI extraction lineage | `preserved/source/lunahoook-adapted/NativeImpl/LunaHook/LunaHook/engine32/BGI.cpp`; upstream `https://github.com/HIllya51/LunaTranslator` | GPL-3.0, existing notices retained; no upstream implementation newly copied |
| BGI offline archive reader | Existing `services/original-engines/bgi.cjs` on base `ba00434c9961035ef625ebccd773de508c7122c6` | Existing project reader only; no new GARbro/Textractor/unrpyc/vn_re code imported |

Local content pins:

- MinHook `src/hook.c`: SHA-256 `3bb0afc69e8cc46ddd7ff55ea558e67c291e1bd0cd2e44a04cf7f680040941d3`
- MinHook `LICENSE.txt`: SHA-256 `4f21f857550d7be854da6ea5f2da4e6775ca4e3fbb535e4f3d961c47d0bf3335`
- Preserved LunaHook BGI.cpp: SHA-256 `b1dbbee59f51c4a3d314472db7b98c1b07cce22a5442301a203dcf1f6a71c45e`

The local executable/archive identities and private file paths remain in the task evidence report; no game scripts or full executables are added to the repository
