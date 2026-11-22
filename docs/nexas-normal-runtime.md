# NeXAS ordinary launch preparation

This checkpoint changes no hook, engine default, profile, seed, owner manifest or game file
It prepares BALDR FORCE EXE for the existing ordinary library launcher and LunaHook path, with no claim that the sample has produced a live stream

## Sample and launch identity

The deployed directory is `H:/MeguLit-Work/night-1423/nexas/sample/[031205][戯画] Baldr Force Exe`
Launch `BaldrForce.exe` with this directory as its working directory and no additional arguments
Keep `BaldrForce.exe.bak` as evidence only; it is a different executable, not an authorized substitute
The wrapper's child/process/module behavior, current screen language and playability remain unobserved

| Member | Bytes | SHA-256 |
|---|---:|---|
| BaldrForce.exe | 46252058 | 7a9341d40e24c4728ecc8666fe77bbe01ee78d65c65e7f6f9a486ba9630cad76 |
| BaldrForce.exe.bak | 983040 | c38f7946fa8ac8f714f77ed15394785170507ff8133d42b3d571518e3c9cf605 |
| Script.pac | 1895441 | 6bc92e0aaa3bf77d93d36bdbe0acc4af1606f24ea4c805dbecede2d8fdd2523d |
| Update.pac | 737047 | b61b146863be8b005ec70743196d06883a74c0fa0f849583837ab99e1c406906 |

The prior full archive test, exact inventory and per-file CRC/SHA are in `night-1423/sample-deployment/nexas-existing-deployment-audit.json`
That receipt reports 1958 files / 1627766425 bytes and successful full CRC; this checkpoint does not repeat extraction or call an empty extraction log proof
The separate offline-reader receipt counts 301 effective scenes / 32538 string entries / 31029 kana-containing strings, not live dialogue coverage or role classification

## Existing production route

`native/megulithook/enginecollection32.cpp` includes and constructs `NeXAS`
The normal build copies that collector over the upstream tree; the small preserved collector is an old dedicated collector and must not be mistaken for the current production list
The upstream source tree is commit `f72381db9d8b63e9192221b01cbad1cb90c4048a`
`engine32/NeXAS.cpp` SHA-256 is `c905bee0976493adff7afa181093fcb67f2ca3f507edcc181b9abc484aad02b6`
`engine32/NeXAS.h` SHA-256 is `82169322e3c6558932b0305931f5af523d658c9d5d06a99c5188a8c369e48c4f`
The existing GPL-3.0 source is reused unchanged; no new upstream implementation is copied by this checkpoint

The stock matcher accepts a PAC plus `Thumbnail.pac` or `Thumbnail5.pac`, or a NeXAS resource string
The sample satisfies the filename branch, which only selects an engine candidate
`InsertNeXASHookA/W` requires GetGlyphOutline calls and has newer string-layout variants; `_2`, `_3` and `b4` are additional version-specific searches
Successful file matching does not establish successful NewHook installation
In particular the old native backup uses pre-rendered `Font.pac` and has no GetGlyphOutline import; the wrapper's loaded native code is unknown
The bounded static audit also found zero `_2`, BALDR HEART and `b4` byte patterns in executable raw sections of both files, and zero `@v\0` strings in their mapped raw sections (the `_3` search requires two)
This does not inspect unpacked runtime code and does not establish that a stock hook can attach to this wrapper
The library proposal leaves kernel defaults unchanged, including generic `embedTranslation`; it does not introduce an engine override or assert that embedding works

When a stock stream does exist, `HookBridge.OnOutput/OutputFrame` emits ordinary `hookSource` JSON
`HookNative.start` consumes it through the actual stdout listener, `sourcePage`, `source`, `deliverSource` and `emitSource`, giving the Reader its normal hook event
`validation/nexas-normal-source.test.cjs` replays synthetic JSON through that real listener, with real downstream normalization and speaker handling
The native helper process, stock callback, stream selection, game pixels and Reader DOM are not exercised by this test
Its component files and stream are synthetic and never executed; the source state message does not turn this replay into live evidence

## Owner five-minute check

1. Import the exact ordinary library proposal, engine `nexas`, preserving the wrapper path and working directory
2. Launch normally and verify whether the bound process is the wrapper or its native child; record actual path / PID / birth and DLL version
3. Try the existing ordinary hook without an advanced owner grant; inspect hook log for NeXAS installation and a readable selected stream
4. Advance several lines and compare source text, speaker and choices with the game, then test point lookup and translation separately
5. If no stream arrives, preserve the log and stop: the old font-cache VM path needs an independent runtime task, not a fake roles grant or replacement with `.bak`

No live launch, hiding, coordinates, ruby, embedding, click lookup, translation or experience acceptance is claimed here

## Runtime preflight follow-up: do not start yet

The ordinary metadata proposal is not a verified safe launch configuration
The second-stage read-only preflight stopped before creating a game copy or invoking HidDesk
All six inspected inputs (the four pinned files above, `Save/Config.dat` and the package notice) kept identical hashes and modification times

The GBK package notice explicitly identifies a Chinese-localization patch committee
This proves that a localization patch is included, not that every current screen has a particular language
Kana in the original script archive does not prove the wrapper will show Japanese
The actual loaded process/module chain and stock hook installation remain unobserved

The original native backup contains this byte-checked conditional initialization path:

- `0x4a9355` reads `WndMode` under `HKCU/Software/GIGA/BF_T01/Data`; the exact key does not currently exist
- The read failure returns zero via `0x4a94b0`; `0x4a9360` converts zero to `esi=1`
- `0x4a9381` passes that mode with 640×480×16 to `0x4a88b0`, then `0x4018b0` / `0x401430`
- The nonzero mode branch at `0x4014ff` calls `SetCooperativeLevel(0x51)` and `SetDisplayMode(640,480,16,0,0)`

The actual queried GUID is `IID_IDirectDraw4`, `9c59509a-39bd-11d1-8c4a-00c04fd930c5`
Local Windows SDK `10.0.26100.0/um/ddraw.h:93,1152,1176–1177` identifies that interface and its method order; flags 0x51 include fullscreen and exclusive
An earlier peer message called the interface IDirectDraw2 before checking its GUID; that label was incorrect and is corrected here
The interface correction does not change the fullscreen stop decision

The wrapper independently imports `ChangeDisplaySettingsW`; no evidenced per-copy windowing control or startup argument has been established for it
Neither its behavior nor its relationship to this backup can be inferred from these static calls
No registry or original configuration is changed, no `.bak` substitution is attempted, and no runtime module/stock-hook success is claimed
Next step: establish a supported windowing control for the exact wrapper, or obtain an already windowed Japanese edition, before the bounded hidden launch and normal-hook observation
The detailed bytes, disassembly, input hashes and stop receipt are in `night-1423/nexas-runtime/runtime-preflight.json`
