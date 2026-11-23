# Siglus verification provenance supplement

This supplement is for root to incorporate into the shared notices. No new
third-party library or binary was downloaded or added by this candidate

| Material used | Exact local source | License and boundary |
|---|---|---|
| Existing LunaHook Siglus adaptation | `native/megulithook/Siglus.cpp` at base ba00434c, Git blob 64bfb1ae6625c30e6186e3c73a1397b72e42d750; preserved baseline `preserved/source/lunahoook-adapted/NativeImpl/LunaHook/LunaHook/engine32/Siglus.cpp` | GPL-3.0, notices in `preserved/LICENSE` and `THIRD-PARTY.md`; existing [LunaTranslator source](https://github.com/HIllya51/LunaTranslator), no upstream update taken |
| Real MinHook used by console gate | Existing vendored `native/shared/minhook/`, `src/hook.c` blob 19da0f7ef8cdf461499c34f6a1618000b290436c, `LICENSE.txt` blob 74dea27229c05b53b095aa22b9ee7ee9f549e414 | BSD 2-Clause; existing MinHook 1.3.3, no changes or second copy |
| Existing VM element-number reference | Local [SiglusSceneScriptUtility source](https://github.com/Jirehlov/SiglusSceneScriptUtility), commit 77526eb24838b91ce16f178ff3be7973f9c83fca, `src/siglus_ssu/const.py` | `Unlicense OR 0BSD`, confirmed local LICENSE; semantic reference only, no copied script/code |
| Reviewed permission/signature candidate | MeguLit commits 676d3451775c26e8cf016ec037a7f66409ed6a17 and 45f0f9f4811bdd9d5b9df2580d0c179ff0aaadcf | Repository GPL-3.0-or-later; production headers unchanged from those commits |
| Expanded native gate | Earlier local `siglus-permission/peer/peer-gate.cpp`, derived from MeguLit `siglusdraw-gate.cpp`; relative include and checked atomic control writer added here | Repository test code; stand-in functions and synthetic text, no real-game acceptance implied |

No Textractor, GARbro, unrpyc or vn_re implementation was used for this candidate
