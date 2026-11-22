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
