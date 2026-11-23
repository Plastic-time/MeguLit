# Softpal source supplement for integration

No new external source was downloaded or vendored in this patch
The route reuses the repository's existing upstream-derived Pal engine implementation

- Project: HIllya51/LunaTranslator, LunaHook engine32/Pal.cpp
- Official source: https://github.com/HIllya51/LunaTranslator/blob/f72381db9d8b63e9192221b01cbad1cb90c4048a/src/NativeImpl/LunaHook/LunaHook/engine32/Pal.cpp
- Fixed local Git object: commit `f72381db9d8b63e9192221b01cbad1cb90c4048a`, blob `389f9339842d17e028549123697e75bad987676e`
- File bytes: 9833, SHA256 `6612a5453fa44bc395d8d48980838c8f08cdb443acad847040723f4149e7f6d3`
- License: GNU GPL version3, as retained in that source repository's LICENSE and the existing project THIRD-PARTY notice
- Reused behavior: existing InsertNewPal1Hook main-executable match and argument2 string callback, not a new exported-DLL observer

The current E:/Apps/work/megulithook/src source checkout is locally modified; its HEAD alone does not authenticate its overlaid working-file contents
The fixed source claim above uses `git show <commit>:<path>`, not that dirty file
The independent full Pal.cpp object compile reads the existing upstream include tree without modifying it and writes only a private candidate object
It does not link or authenticate a production hook DLL, and that object must not be copied into a different production build as a substitute for rebuilding the integrated source

The bounded split/snapshot/replacement helper and its regression are new MeguLit code
No new third-party dependency or license exception is introduced
