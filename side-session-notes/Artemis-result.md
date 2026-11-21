# Artemis source audit and bounded candidate

Audit started at 2026-11-21 22:29:44 UTC, before implementation
This file records input observations and Lua replay separately from game rendering

## Sources in the requested order

| Source | Fixed revision and files | License and use |
|---|---|---|
| LunaTranslator / LunaHook | `a744a80fc2b99ea5852d4da2bd157afdc9e628f0`, `src/NativeImpl/LunaHook/LunaHook/engine32/Artemis.cpp`, `engine64/Artemis.cpp` | GPL-3.0, read for string ABI and limitations only, no new copied implementation |
| ITHVNR mirror | `d28a1ae6989f9ebb7a921c3b4b6e97b67e93f21c`, `vnr/vnrhook/src/engine/engine.cc:10069-10152` | GPL-family project reference only, mirror-specific license file not independently pinned, no new copied implementation |
| XUnity | Not applicable to the native Artemis Lua runtime | No Unity API assumed or reused |
| Textractor | `df5b830d1757a66aa162f8081e99d42c9bd50488`, `texthook/engine/engine.cc:10684-10828` | GPL-3.0, reference only |
| GARbro | `b09ee4570ccb1daf6ac56710ee8934dc0b8baeb0`, `ArcFormats/Artemis/ArcPFS.cs` | MIT, existing MeguLit PFS reader already supplies index and SHA1-XOR member reads, no new copied source |
| VNTranslationTools | `36fbe909d02f2e9bb187443e03e2df595f56bfec`, `VNTextPatch.Shared/Scripts/Artemis/{LuaParser,ArtemisAstScript,ArtemisAsbScript,ArtemisTxtScript}.cs` | MIT, structured name/message/choice separation as a reference, existing offline reader remains unchanged |
| Actual Artemis game Lua | Read only from the known PFS files listed below | Not redistributed, exact member hashes bind the experiment |

Primary links: [LunaHook](https://github.com/HIllya51/LunaTranslator/tree/a744a80fc2b99ea5852d4da2bd157afdc9e628f0/src/NativeImpl/LunaHook/LunaHook), [VNR](https://github.com/mireado/ITHVNR/blob/d28a1ae6989f9ebb7a921c3b4b6e97b67e93f21c/vnr/vnrhook/src/engine/engine.cc), [Textractor](https://github.com/Artikash/Textractor/blob/df5b830d1757a66aa162f8081e99d42c9bd50488/texthook/engine/engine.cc), [GARbro](https://github.com/morkt/GARbro/blob/b09ee4570ccb1daf6ac56710ee8934dc0b8baeb0/ArcFormats/Artemis/ArcPFS.cs), [VNTranslationTools](https://github.com/arcusmaximus/VNTranslationTools/tree/36fbe909d02f2e9bb187443e03e2df595f56bfec/VNTextPatch.Shared/Scripts/Artemis)

The [engine author's page](https://www.ies-net.com/?page_id=24) confirms Lua, ruby, independent layers and Windows DLL calls, but supplies no public native ABI for this experiment
Search results for unrelated Roblox and physics projects were excluded
No SDK request, game download or new dependency was made

## Actual sample boundaries

- `H:/MeguLit-Work/samples/amakano3-formal/Amakano3.exe`, 5170176 bytes, SHA256 `5132eed8c2e4a7d0ec4d853cd2b8247f3a0641c4a3825a8210fd435530e7d716`, x64, EXE-only static sample
- `H:/MeguLit-Work/samples/amakano3-trial/Amakano3_tr.exe`, 5191536 bytes, SHA256 `ca1fe32160ee8557acc0af712cd5eaf642eb29cc14f0ec06715824675d3c05a5`, x64
- `H:/MeguLit-Work/samples/amakano3-trial/Amakano3_tr.pfs`, index 350226 bytes and 6368 entries, selected Lua read in memory only
- `E:/Steam/steamapps/common/The Shell Part I/TheShell.pfs`, index 335810 bytes and 7236 entries, existing game Lua replay oracle
- `E:/GAL/MeguLit-adapt-Amakano2-PE-20261122` has `cs2.exe` and `.int` resources, not Artemis, excluded from this engine task

The formal Amakano 3 EXE does not prove that its missing script data matches the trial
The trial SOURCE.json describes omitted split audio/video archives, so it is not assumed to be a complete launchable install
No sample or save was changed or deleted

## Proven Lua boundary

Trial `system/msg/message.lua` SHA256 `a2257f0db2a6db99568b87c8ea985763b23275decd1b305a96c8bf4bd960133f`

- `mw_getmsgid`, lines 216-219, returns `game.mwid .. '.mw.adv_' .. name`
- `message_name`, lines 131-192, routes normal names to `adv_name`, but also has separate novel and image-only branches
- `message_control`, lines 235-272, routes primary text to `adv_adv`, and a sublanguage to `adv_sub` below the measured primary height
- `mw_textloop`, lines 280-333, obtains the actual chosen row through `getTextBlockFloat`, then queues print and ruby commands
- `getTextBlockFloat`, lines 546-557, selects a language and float-mode row, not all strings in the AST
- `txruby`, lines 800-806, respects the game's ruby setting

Trial `system/msg/ui.lua` SHA256 `909d133b15e50f7694453bc79c54b37b98c5bf28e4c69906c836dc833c8c9588`, lines 5-21, owns an explicit message layer but also serves generic UI
Trial `system/adv/select.lua` SHA256 `87f5a39eb4498cc2ac36aaa8f85e77c1062d8d47c4637b12533547ebba3b65fa`, lines 737-856, creates normal choice layer suffix `.2` and hidden hover suffix `.3`
The two variants must not be counted as two independent choices

`select_refresh`, lines 859-890, reads a hierarchy of parent-layer offsets and a child extent for mouse hit testing
These values are not per-glyph rectangles, nor proof of a final transformed screen box
`get_message_tags` is used to recover font state, not documented as a glyph-layout API

Existing `docs/text-architecture.md` records the prior D3D11 black-frame and non-exported Lua API limitations
Those failed routes are not retried here

## Before implementation checks

- Existing four Artemis suites: 15 passed, 0 failed, 0 skipped
- Private Lua 5.1 CLI executes selected actual trial methods against synthetic data, preserves separate name/body/normal-choice/hover-choice layers, no game or renderer is launched
- Private proof: `H:/MeguLit-Work/night-1423/artemis-research/role-source-proof.cjs`, bounded member reads 411210 bytes including index

## Limited implementation

First production edit was at 2026-11-21 22:45:56 UTC, more than 15 minutes after the source audit began
The bounded Lua observer captures semantic input only, behind explicit opt-in and exact executable/member hashes
It does not emit `ToMe_CHARS`, fabricate glyph rectangles, hide, replace, run a timer, access files or send network traffic
The local Lua replay is an input/function-contract test, not a rendering, Reader, DOM, physical lookup or upload acceptance
The missing production Lua transport remains a separate integration gate

The bilingual wrapper now restores a nested pass and the original nil-containing return tuple and error object
This is a synthetic compatibility repair, not a claim that the commercial game's normal method returns extra values
See `docs/artemis-lua-input.md` for the exact constructor, generation contract, budgets and pending five-minute owner checklist

| Capability | This candidate |
|---|---|
| Text | Internal selected Lua row, two exact input sets, no production transport |
| Coordinates | Not implemented, configured extents and parent offsets are not glyph rectangles |
| Name | Internal method input, no visible-glyph assertion, image/novel branch distinction retained |
| Choice | Internal invocation and actual layer ID, normal/hover distinguished, no visibility or click ACK |
| Button/menu | Not implemented, image buttons are not guessed from generic UI text |
| Embed | Existing The Shell language-track layout only, nested-pass compatibility repaired, no new writeback |
| Ruby | Bounded literal source markup and codepoint spans, no display claim |

The local formal/trial classifier prefix has eight matches across six `.pdata` functions in each EXE, not one unique role/layout point
No new native hook or DLL was created

The fixed VNR GitHub tree URL returned `Failed to fetch restricted URL`
That tree was not retried or fetched through an alternate endpoint
The previously successful fixed `engine.cc` read supplies the listed hook evidence, not mirror-license verification

## Final local validation

- Seven relevant suites: 40 passed, 0 failed, 0 skipped, including engine-draw default/seed opt-in checks
- Every tracked JS/CJS/MJS file checked freshly with the current Node executable: 1549 checked, 0 errors, no syntax cache reused
- The Lua 5.1 module and generated chunks execute in the synthetic and actual-function CLI replays
- Fresh `fetch origin main` still resolves to `7a41ff9a9c3632c9f143f01b455085c1d6e4a854`, already the branch parent, followed by the combined regression
- No native source changed and no DLL build or game host was run
- No production loader, game archive, seed, save, live database, release asset, main branch or remote branch was changed

Small local evidence is under `H:/MeguLit-Work/night-1423/artemis-research/`
`bilingual-before.json` and `role-source-before.json` preserve before evidence, `final-tests.log` and `syntax.json` record the final checks
The syntax receipt is rechecked against current file hashes before sealing the candidate
